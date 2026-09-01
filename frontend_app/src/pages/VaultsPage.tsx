import { memo, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import encryptedVaultApi from '../api/encryptedVault';
import { mindmapsApi } from '../api/mindmaps';
import ConfirmDialog from '../components/ConfirmDialog';
import { ThemePanel } from '../components/ThemePanel';
import { LogoWithText } from '../components/Logo';
import { UnlockModal } from '../components/UnlockModal';
import { VersionHistoryPanel } from '../components/VersionHistoryPanel';
import { hybridEncap } from '../crypto/kem';
import { decryptTitle, encryptTree, encryptTitle } from '../crypto/vault';
import { toBase64 } from '../crypto/utils';
import { getStorage } from '../storage';
import { useAuthStore } from '../store/auth';
import { useModeStore } from '../store/mode';
import { useThemeStore } from '../store/theme';
import { useUserLabels } from '../hooks/useUserLabels';
import type {
  MindMapTree,
  MindMapTreeNode,
  MindMapListItem,
  StorageSummary,
  VaultEncryptionMode,
  VaultSharingMode,
  VersionDetail,
} from '../types';
import { getPlanErrorPrompt, type PlanErrorPrompt } from '../utils/planErrors';
import { obsidianMarkdownToTree } from '../utils/markdownImport';
import { freemindToTree } from '../utils/freemindImport';
import { wisemappingToTree } from '../utils/wisemappingImport';
import {
  getVaultPreviewStats,
  getVaultPreviewTheme,
  isVaultPreviewAttachmentMeta,
  loadCachedVaultPreview,
  saveTreeVaultPreview,
  type VaultPreviewSummary,
} from '../utils/vaultPreview';
import { decryptAttachmentForOwner } from '../crypto/encryptedVault';
// packageJson intentionally omitted when not used in this view

interface MapWithTitle extends MindMapListItem {
  title: string | null;
  vaultNote: string;
  draftNote: string;
  draftLabels: string[];
  draftColor: string;
  draftSharingMode: VaultSharingMode;
  draftEncryptionMode: VaultEncryptionMode;
  draftMaxVersions: number;
  metaSaving: boolean;
}

interface VaultPreviewState {
  loading: boolean;
  summary?: VaultPreviewSummary;
  error?: string;
}

interface PendingVaultDeletion {
  id: string;
  title: string | null;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeHexColor(input?: string): string {
  const fallback = '#334155';
  if (!input) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input : fallback;
}

function vaultColorStorageKey(vaultId: string): string {
  return `vault-color-${vaultId}`;
}

function getLocalVaultColor(vaultId: string, fallback?: string): string {
  const stored = localStorage.getItem(vaultColorStorageKey(vaultId)) ?? undefined;
  return normalizeHexColor(stored ?? fallback);
}

function setLocalVaultColor(vaultId: string, color: string): void {
  localStorage.setItem(vaultColorStorageKey(vaultId), normalizeHexColor(color));
}

function normalizeSharingMode(input?: string): VaultSharingMode {
  return input === 'shared' ? 'shared' : 'private';
}

function normalizeEncryptionMode(input?: string): VaultEncryptionMode {
  return input === 're-encrypted' ? 're-encrypted' : 'standard';
}

function normalizeVaultLabels(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim().toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

function labelsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((label, idx) => label === b[idx]);
}

function VaultLabelInput({ draftLabels, onAdd }: { draftLabels: string[]; onAdd: (label: string, color?: string) => void }) {
  const [value, setValue] = useState('');
  const [color, setColor] = useState('#7c3aed');
  const submit = () => {
    const t = value.trim().toLowerCase();
    if (!t || draftLabels.includes(t)) return;
    onAdd(t, color);
    setValue('');
  };
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            submit();
            e.preventDefault();
          }
        }}
        placeholder="Add label…"
        className="h-6 rounded border border-slate-600 bg-surface px-2 text-xs text-white placeholder-slate-500 focus:border-accent focus:outline-none"
      />
      <label title="Label color" className="inline-flex cursor-pointer items-center">
        <span className="h-3 w-3 rounded-full border border-white/50" style={{ backgroundColor: color }} />
        <input
          type="color"
          value={color}
          className="sr-only"
          onChange={(e) => setColor(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim()}
        className="h-6 rounded border border-slate-600 bg-surface px-2 text-[11px] text-slate-200 disabled:opacity-40"
      >
        Add
      </button>
    </div>
  );
}

interface VaultCardProps {
  map: MapWithTitle;
  usage?: StorageSummary['vaults'][number];
  isLocalMode: boolean;
  renamingId: string | null;
  renameValue: string;
  renaming: boolean;
  userLabels: Array<{ name: string; color: string }>;
  activeShareCount: number;
  previewState?: VaultPreviewState;
  previewPanelStyle: CSSProperties;
  previewOverlayStyle: CSSProperties;
  previewOverlayBadgeStyle: CSSProperties;
  onNavigate: (path: string) => void;
  onStartRename: (map: MapWithTitle) => void;
  onRenameValueChange: (value: string) => void;
  onRenameConfirm: (id: string) => Promise<void>;
  onRenameCancel: () => void;
  onOpenHistory: (id: string) => void;
  onDeleteRequest: (id: string, title: string | null) => void;
  onSetDraftColor: (id: string, color: string) => void;
  onSetDraftNote: (id: string, note: string) => void;
  onSetDraftLabels: (id: string, labels: string[]) => void;
  onSetDraftMaxVersions: (id: string, value: number) => void;
  onUpdateUserLabelColor: (name: string, color: string) => void;
  onAddUserLabel: (name: string, color?: string) => void;
  onSaveMeta: (map: MapWithTitle) => Promise<void>;
}

const VaultCard = memo(function VaultCard({
  map,
  usage,
  isLocalMode,
  renamingId,
  renameValue,
  renaming,
  userLabels,
  activeShareCount,
  previewState,
  previewPanelStyle,
  previewOverlayStyle,
  previewOverlayBadgeStyle,
  onNavigate,
  onStartRename,
  onRenameValueChange,
  onRenameConfirm,
  onRenameCancel,
  onOpenHistory,
  onDeleteRequest,
  onSetDraftColor,
  onSetDraftNote,
  onSetDraftLabels,
  onSetDraftMaxVersions,
  onUpdateUserLabelColor,
  onAddUserLabel,
  onSaveMeta,
}: VaultCardProps) {
  const persistedColor = normalizeHexColor(map.vault_color);
  const persistedMax = Math.max(1, map.max_versions ?? 50);
  const persistedSharingMode = normalizeSharingMode(map.vault_sharing_mode);
  const persistedEncryptionMode = normalizeEncryptionMode(map.vault_encryption_mode);
  const persistedLabels = normalizeVaultLabels(map.vault_labels);
  const isSharedVault = activeShareCount > 0 || persistedSharingMode === 'shared';
  const blurPreview = isSharedVault;
  const dirty =
    map.draftNote !== map.vaultNote ||
    map.draftColor !== persistedColor ||
    !labelsEqual(map.draftLabels, persistedLabels) ||
    (!isLocalMode && map.draftMaxVersions !== persistedMax);

  return (
    <article
      key={map.id}
      className="overflow-hidden rounded-xl border bg-surface-1"
      style={{ borderColor: map.draftColor }}
    >
      <div className="h-1" style={{ backgroundColor: map.draftColor }} />
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {renamingId === map.id ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => onRenameValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onRenameConfirm(map.id);
                    if (e.key === 'Escape') onRenameCancel();
                  }}
                  className="flex-1 rounded-md border border-accent bg-surface px-3 py-1.5 text-base font-semibold text-white focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => void onRenameConfirm(map.id)}
                  disabled={renaming || !renameValue.trim()}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {renaming ? '...' : 'OK'}
                </button>
                <button
                  onClick={onRenameCancel}
                  className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="min-w-0 w-full text-left"
                onClick={() => onNavigate(`/vaults/${map.id}`)}
              >
                <p className="truncate text-lg font-semibold text-white">
                  {map.title ?? <span className="italic text-slate-500">Decrypting...</span>}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Updated {formatDateShort(map.updated_at)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {isSharedVault && (
                    <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-slate-100">
                      {activeShareCount > 0 ? `${activeShareCount} live share${activeShareCount === 1 ? '' : 's'}` : 'Shared vault'}
                    </span>
                  )}
                  {persistedEncryptionMode === 're-encrypted' && (
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] font-medium text-amber-200">
                      Differently encrypted
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {usage?.version_count ?? 0} stored versions{(usage?.attachment_count ?? 0) > 0 ? ` · ${usage?.attachment_count ?? 0} file${(usage?.attachment_count ?? 0) === 1 ? '' : 's'}` : ''} · {fmtBytes(usage?.total_bytes ?? 0)} total{(usage?.attachment_bytes ?? 0) > 0 ? ` incl. ${fmtBytes(usage?.attachment_bytes ?? 0)} files` : ''}{!isLocalMode && ` · max kept ${persistedMax}`}
                </p>
              </button>
            )}
          </div>

          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => onStartRename(map)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
              title="Rename vault"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            {!isLocalMode && (
              <button
                onClick={() => onOpenHistory(map.id)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
                title="Version history"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>
            )}
            {dirty && (
              <button
                onClick={() => { void onSaveMeta(map); }}
                disabled={map.metaSaving}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-700 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                title="Save settings"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
              </button>
            )}
            <button
              onClick={() => onDeleteRequest(map.id, map.title)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-red-900/30 hover:text-red-400"
              title="Delete vault"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <div className="rounded-xl border p-3" style={previewPanelStyle}>
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
            <span>Vault preview</span>
            <span>
              {previewState?.summary
                ? `${previewState.summary.nodeCount} node${previewState.summary.nodeCount === 1 ? '' : 's'}`
                : previewState?.error
                  ? 'Unavailable'
                  : 'Open to preview'}
            </span>
          </div>

          {previewState?.summary ? (
            <div>
              <button
                type="button"
                onClick={() => onNavigate(`/vaults/${map.id}`)}
                className="block w-full cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title={`Open ${map.title ?? 'vault'}`}
              >
                <div className="relative overflow-hidden rounded-lg transition-opacity hover:opacity-90">
                  <div className={blurPreview ? 'select-none blur-sm opacity-60' : ''}>
                    <img
                      src={previewState.summary.image_data_url}
                      alt={`Preview of ${map.title ?? 'vault'}`}
                      className="aspect-video w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  {blurPreview && (
                    <div className="absolute inset-0 flex items-center justify-center" style={previewOverlayStyle}>
                      <span className="rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]" style={previewOverlayBadgeStyle}>
                        Blurred for shared vaults
                      </span>
                    </div>
                  )}
                </div>
              </button>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {previewState.summary.format} screenshot
                {previewState.summary.noteCount > 0 ? ` | ${previewState.summary.noteCount} notes` : ''}
                {previewState.summary.attachmentCount > 0 ? ` | ${previewState.summary.attachmentCount} files` : ''}
              </p>
            </div>
          ) : previewState?.error ? (
            <p className="text-xs text-slate-500">Preview unavailable for this vault yet.</p>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate(`/vaults/${map.id}`)}
              className="flex h-56 w-full items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/60 px-6 text-center text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              Open and save this vault to create its encrypted screenshot preview.
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Card color
            <input
              type="color"
              value={map.draftColor}
              onChange={(e) => onSetDraftColor(map.id, e.target.value)}
              className="mt-1 h-10 w-full cursor-pointer rounded-md border border-slate-600 bg-transparent p-1"
              title="Vault card color"
            />
          </label>

          {!isLocalMode && (
            <label className="text-xs text-slate-400">
              Max versions kept
              <input
                type="number"
                min={1}
                step={1}
                value={map.draftMaxVersions}
                onChange={(e) => onSetDraftMaxVersions(map.id, Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-slate-600 bg-surface px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
              />
            </label>
          )}
        </div>

        <label className="block text-xs text-slate-400">
          Vault note
          <textarea
            key={`note-${map.id}`}
            defaultValue={map.draftNote}
            onBlur={(e) => onSetDraftNote(map.id, e.target.value)}
            rows={3}
            placeholder="Optional note for this vault"
            className="mt-1 w-full resize-y rounded-md border border-slate-600 bg-surface px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block text-xs text-slate-400">
          Vault labels
          <div className="mt-1 flex flex-wrap gap-1">
            {map.draftLabels.map((lbl) => (
              <span
                key={lbl}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
                style={{
                  backgroundColor: userLabels.find((item) => item.name === lbl)?.color ?? 'var(--accent)',
                }}
              >
                {lbl}
                <label title="Change label color" className="inline-flex cursor-pointer items-center">
                  <span className="h-2 w-2 rounded-full border border-white/60" style={{ backgroundColor: userLabels.find((item) => item.name === lbl)?.color ?? 'var(--accent)' }} />
                  <input
                    type="color"
                    value={userLabels.find((item) => item.name === lbl)?.color ?? '#7c3aed'}
                    className="sr-only"
                    onChange={(e) => onUpdateUserLabelColor(lbl, e.target.value)}
                  />
                </label>
                <button type="button" className="ml-0.5 opacity-60 hover:opacity-100" onClick={() => onSetDraftLabels(map.id, map.draftLabels.filter((l) => l !== lbl))}>×</button>
              </span>
            ))}
            <VaultLabelInput
              draftLabels={map.draftLabels}
              onAdd={(t, c) => {
                onAddUserLabel(t, c);
                onSetDraftLabels(map.id, [...map.draftLabels, t]);
              }}
            />
          </div>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && <span className="text-xs text-amber-300">Unsaved settings</span>}
        </div>
      </div>
    </article>
  );
}, (prev, next) => {
  const sameRenameContext = prev.renamingId !== prev.map.id
    ? prev.renamingId === next.renamingId
    : prev.renamingId === next.renamingId && prev.renameValue === next.renameValue && prev.renaming === next.renaming;
  return prev.map === next.map
    && prev.usage === next.usage
    && prev.isLocalMode === next.isLocalMode
    && sameRenameContext
    && prev.activeShareCount === next.activeShareCount
    && prev.previewState === next.previewState
    && prev.userLabels === next.userLabels
    && prev.previewPanelStyle === next.previewPanelStyle
    && prev.previewOverlayStyle === next.previewOverlayStyle
    && prev.previewOverlayBadgeStyle === next.previewOverlayBadgeStyle;
});

// ─── Table row (compact view) ────────────────────────────────────────────────

interface VaultTableRowProps {
  map: MapWithTitle;
  usage?: StorageSummary['vaults'][number];
  isLocalMode: boolean;
  renamingId: string | null;
  renameValue: string;
  renaming: boolean;
  userLabels: Array<{ name: string; color: string }>;
  activeShareCount: number;
  previewState?: VaultPreviewState;
  onNavigate: (path: string) => void;
  onStartRename: (map: MapWithTitle) => void;
  onRenameValueChange: (value: string) => void;
  onRenameConfirm: (id: string) => Promise<void>;
  onRenameCancel: () => void;
  onOpenHistory: (id: string) => void;
  onDeleteRequest: (id: string, title: string | null) => void;
}

const VaultTableRow = memo(function VaultTableRow({
  map,
  usage,
  isLocalMode,
  renamingId,
  renameValue,
  renaming,
  userLabels,
  activeShareCount,
  previewState,
  onNavigate,
  onStartRename,
  onRenameValueChange,
  onRenameConfirm,
  onRenameCancel,
  onOpenHistory,
  onDeleteRequest,
}: VaultTableRowProps) {
  const persistedSharingMode = normalizeSharingMode(map.vault_sharing_mode);
  const isSharedVault = activeShareCount > 0 || persistedSharingMode === 'shared';
  const hasTooltip = (map.draftLabels.length > 0 || !!map.draftNote) && renamingId !== map.id;
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const tooltipTdRef = useRef<HTMLTableCellElement>(null);

  return (
    <>
    <tr className="border-b border-slate-800 transition-colors last:border-0 hover:bg-white/[0.025]">
      {/* Color stripe */}
      <td className="w-1 p-0" style={{ backgroundColor: map.draftColor }} />
      {/* Thumbnail */}
      <td className="w-[88px] p-2 pl-2">
        <button
          className="block overflow-hidden rounded"
          onClick={() => onNavigate(`/vaults/${map.id}`)}
          title={`Open ${map.title ?? 'vault'}`}
        >
          {previewState?.summary ? (
            <img
              src={previewState.summary.image_data_url}
              alt=""
              className="h-[46px] w-20 rounded object-cover"
              style={isSharedVault ? { filter: 'blur(3px)', opacity: 0.5 } : {}}
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-[46px] w-20 items-center justify-center rounded"
              style={{ background: `${map.draftColor}1a`, border: `1px solid ${map.draftColor}44` }}
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: map.draftColor }} />
            </div>
          )}
        </button>
      </td>

      {/* Name + labels (inline) — note and full label list appear in a portal tooltip above the row */}
      <td
        ref={tooltipTdRef}
        className="relative min-w-0 px-3 py-2"
        onMouseEnter={() => {
          if (!hasTooltip || !tooltipTdRef.current) return;
          const rect = tooltipTdRef.current.getBoundingClientRect();
          setTooltipPos({ x: rect.left, y: rect.top });
          setTooltipVisible(true);
        }}
        onMouseLeave={() => setTooltipVisible(false)}
      >
        {renamingId === map.id ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onRenameConfirm(map.id);
                if (e.key === 'Escape') onRenameCancel();
              }}
              className="w-full rounded border border-accent bg-surface px-2 py-1 text-sm font-medium text-white focus:outline-none"
            />
            <button
              onClick={() => void onRenameConfirm(map.id)}
              disabled={renaming || !renameValue.trim()}
              className="rounded bg-accent px-2 py-1 text-xs text-white disabled:opacity-50"
            >
              {renaming ? '…' : 'OK'}
            </button>
            <button
              onClick={onRenameCancel}
              className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
            >
              ✕
            </button>
          </div>
        ) : (
          <button className="block w-full text-left" onClick={() => onNavigate(`/vaults/${map.id}`)}>
            <span className="block truncate text-sm font-medium text-white">
              {map.title ?? <span className="italic text-slate-500">Decrypting…</span>}
            </span>
            {map.draftLabels.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {map.draftLabels.slice(0, 6).map((lbl) => (
                  <span
                    key={lbl}
                    className="rounded-full px-1.5 py-0.5 text-[10px] leading-none text-white"
                    style={{ backgroundColor: userLabels.find((ul) => ul.name === lbl)?.color ?? 'var(--accent)' }}
                  >
                    {lbl}
                  </span>
                ))}
              </span>
            )}
          </button>
        )}
      </td>

      {/* Updated date */}
      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-slate-500 sm:table-cell">
        {formatDateShort(map.updated_at)}
      </td>

      {/* Stats */}
      <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-slate-500 lg:table-cell">
        {previewState?.summary != null
          ? `${previewState.summary.nodeCount} node${previewState.summary.nodeCount === 1 ? '' : 's'}`
          : '—'}
        {!isLocalMode && usage != null && usage.version_count > 0 ? ` · ${usage.version_count} ver` : ''}
      </td>

      {/* Actions */}
      <td className="py-2 pr-2">
        <div className="flex items-center justify-end gap-0.5">
          <button
            onClick={() => onNavigate(`/vaults/${map.id}`)}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-200"
            title="Open vault"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => onStartRename(map)}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
            title="Rename vault"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          {!isLocalMode && (
            <button
              onClick={() => onOpenHistory(map.id)}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-300"
              title="Version history"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </button>
          )}
          <button
            onClick={() => onDeleteRequest(map.id, map.title)}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-900/30 hover:text-red-400"
            title="Delete vault"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
    {/* Rendered at document.body so the table wrapper's overflow:hidden cannot clip it. */}
    {hasTooltip && tooltipVisible && createPortal(
      <div
        className="pointer-events-none fixed z-[9999] w-72 max-w-[85vw] rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-2xl"
        style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translateY(-100%) translateY(-8px)' }}
      >
        {map.draftLabels.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">Labels</p>
            <div className="flex flex-wrap gap-1">
              {map.draftLabels.map((lbl) => (
                <span
                  key={lbl}
                  className="rounded-full px-2 py-0.5 text-xs text-white"
                  style={{ backgroundColor: userLabels.find((ul) => ul.name === lbl)?.color ?? 'var(--accent)' }}
                >
                  {lbl}
                </span>
              ))}
            </div>
          </div>
        )}
        {map.draftNote && (
          <div className={map.draftLabels.length > 0 ? 'mt-2' : ''}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">Note</p>
            <p className="text-xs leading-relaxed text-slate-300">{map.draftNote}</p>
          </div>
        )}
      </div>,
      document.body,
    )}
    </>
  );
}, (prev, next) => {
  const sameRenameContext = prev.renamingId !== prev.map.id
    ? prev.renamingId === next.renamingId
    : prev.renamingId === next.renamingId && prev.renameValue === next.renameValue && prev.renaming === next.renaming;
  return (
    prev.map === next.map &&
    prev.usage === next.usage &&
    prev.isLocalMode === next.isLocalMode &&
    sameRenameContext &&
    prev.activeShareCount === next.activeShareCount &&
    prev.previewState === next.previewState &&
    prev.userLabels === next.userLabels
  );
});

export function VaultsPage() {
  const navigate = useNavigate();
  const { username, sessionKeys, logout } = useAuthStore();
  const mode = useModeStore((s) => s.mode);
  const isLocalMode = mode === 'local';
  const { labels: userLabels, addLabel: addUserLabel, updateLabelColor: updateUserLabelColor } = useUserLabels();
  const themeMode = useThemeStore((state) => state.mode);
  const storage = useMemo(() => getStorage(), []);
  const hasKeys = !!sessionKeys;

  const [maps, setMaps] = useState<MapWithTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storageSummary, setStorageSummary] = useState<StorageSummary | null>(null);
  const [storageError, setStorageError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createPlanPrompt, setCreatePlanPrompt] = useState<PlanErrorPrompt | null>(null);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const mdImportRef = useRef<HTMLInputElement>(null);

  const [mmImporting, setMmImporting] = useState(false);
  const [mmImportError, setMmImportError] = useState('');
  const mmImportRef = useRef<HTMLInputElement>(null);

  const [wxmlImporting, setWxmlImporting] = useState(false);
  const [wxmlImportError, setWxmlImportError] = useState('');
  const wxmlImportRef = useRef<HTMLInputElement>(null);

  const [xmindImporting, setXmindImporting] = useState(false);
  const [xmindImportError, setXmindImportError] = useState('');
  const xmindImportRef = useRef<HTMLInputElement>(null);

  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(
    () => (localStorage.getItem('mmv-lobby-view') === 'table' ? 'table' : 'grid'),
  );

  const [historyVaultId, setHistoryVaultId] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [pendingVaultDeletion, setPendingVaultDeletion] = useState<PendingVaultDeletion | null>(null);
  const [deletingVaultId, setDeletingVaultId] = useState<string | null>(null);
  const [activeShareCounts, setActiveShareCounts] = useState<Record<string, number>>({});
  const [previewStates, setPreviewStates] = useState<Record<string, VaultPreviewState>>({});

  const previewPanelStyle = useMemo(() => (
    themeMode === 'light'
      ? {
          borderColor: 'var(--border)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.94))',
        }
      : {
          borderColor: 'rgb(51 65 85 / 1)',
          background: 'rgba(2, 6, 23, 0.4)',
        }
  ), [themeMode]);

  const previewOverlayStyle = useMemo(() => (
    themeMode === 'light'
      ? {
          background: 'rgba(241, 245, 249, 0.42)',
        }
      : {
          background: 'rgba(2, 6, 23, 0.35)',
        }
  ), [themeMode]);

  const previewOverlayBadgeStyle = useMemo(() => (
    themeMode === 'light'
      ? {
          borderColor: 'rgba(148, 163, 184, 0.5)',
          background: 'rgba(255,255,255,0.92)',
          color: 'var(--text-primary)',
        }
      : {
          borderColor: 'rgb(71 85 105 / 1)',
          background: 'rgba(15, 23, 42, 0.9)',
          color: 'rgb(241 245 249 / 1)',
        }
  ), [themeMode]);

  const handleStartRename = (m: MapWithTitle) => {
    setRenamingId(m.id);
    setRenameValue(m.title ?? '');
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleRenameConfirm = async (id: string) => {
    if (!sessionKeys || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const titleEnc = await encryptTitle(renameValue.trim(), sessionKeys.masterKey);
      await storage.updateMeta(id, { title_encrypted: titleEnc });
      setMaps((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, title: renameValue.trim(), title_encrypted: titleEnc } : m,
        ),
      );
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setRenaming(false);
    }
  };

  const refreshStorage = useCallback(async () => {
    try {
      const summary = await storage.getStorage();
      setStorageSummary(summary);
      setStorageError('');
    } catch (err) {
      setStorageSummary(null);
      setStorageError(err instanceof Error ? err.message : 'Failed to load storage summary');
    }
  }, [storage]);

  const loadMaps = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [itemsResult, storageResult] = await Promise.allSettled([
        storage.listVaults(),
        storage.getStorage(),
      ]);

      if (itemsResult.status !== 'fulfilled') {
        throw itemsResult.reason;
      }
      const items = itemsResult.value;

      if (storageResult.status === 'fulfilled') {
        setStorageSummary(storageResult.value);
        setStorageError('');
      } else {
        setStorageSummary(null);
        setStorageError(
          storageResult.reason instanceof Error
            ? storageResult.reason.message
            : 'Failed to load storage summary',
        );
      }

      if (sessionKeys) {
        const decryptedTitles = await Promise.all(
          items.map(async (m) => {
            try {
              return await decryptTitle(m.title_encrypted, sessionKeys.masterKey);
            } catch {
              return '(decryption error)';
            }
          }),
        );

        const decryptedNotes = await Promise.all(
          items.map(async (m) => {
            if (!m.vault_note_encrypted) return '';
            try {
              return await decryptTitle(m.vault_note_encrypted, sessionKeys.masterKey);
            } catch {
              return '';
            }
          }),
        );

        setMaps(
          items.map((m, i) => {
            const color = isLocalMode
              ? getLocalVaultColor(m.id, m.vault_color)
              : normalizeHexColor(m.vault_color);
            const maxVersions = Math.max(1, m.max_versions ?? 50);
            const note = decryptedNotes[i] ?? '';
            return {
              ...m,
              vault_color: color,
              title: decryptedTitles[i],
              vaultNote: note,
              draftNote: note,
              draftLabels: normalizeVaultLabels(
                m.vault_labels ?? (isLocalMode ? (JSON.parse(localStorage.getItem(`vault-labels-${m.id}`) ?? '[]') as string[]) : []),
              ),
              draftColor: color,
              draftSharingMode: normalizeSharingMode(m.vault_sharing_mode),
              draftEncryptionMode: normalizeEncryptionMode(m.vault_encryption_mode),
              draftMaxVersions: maxVersions,
              metaSaving: false,
            };
          }),
        );
      } else {
        setMaps(
          items.map((m) => {
            const color = isLocalMode
              ? getLocalVaultColor(m.id, m.vault_color)
              : normalizeHexColor(m.vault_color);
            return {
              ...m,
              vault_color: color,
              title: null,
              vaultNote: '',
              draftNote: '',
              draftLabels: normalizeVaultLabels(
                m.vault_labels ?? (isLocalMode ? (JSON.parse(localStorage.getItem(`vault-labels-${m.id}`) ?? '[]') as string[]) : []),
              ),
              draftColor: color,
              draftSharingMode: normalizeSharingMode(m.vault_sharing_mode),
              draftEncryptionMode: normalizeEncryptionMode(m.vault_encryption_mode),
              draftMaxVersions: Math.max(1, m.max_versions ?? 50),
              metaSaving: false,
            };
          }),
        );
      }
      setActiveShareCounts({});
      setPreviewStates({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vaults');
    } finally {
      setLoading(false);
    }
  }, [isLocalMode, sessionKeys, storage]);

  useEffect(() => {
    if (!showImportMenu) return;
    const handler = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showImportMenu]);

  const mapIdsKey = useMemo(() => maps.map((map) => map.id).join('|'), [maps]);

  // Only changes when vault identity or server-persisted updated_at changes —
  // not when a draft field (color, note, labels, max versions) is edited. The
  // effects below key off this instead of the `maps` array, whose reference
  // changes on every draft mutation and used to re-fire every preview fetch.
  const mapMetaKey = useMemo(() => maps.map((m) => `${m.id}:${m.updated_at}`).join('|'), [maps]);
  const mapsRef = useRef(maps);
  mapsRef.current = maps;

  useEffect(() => {
    if (isLocalMode || !hasKeys || !mapIdsKey) {
      return;
    }

    let active = true;
    const ids = mapIdsKey.split('|');

    void Promise.all(
      ids.map(async (id) => {
        try {
          const shares = await encryptedVaultApi.listShares(id);
          return {
            id,
            count: shares.filter((share) => !share.revoked && share.status !== 'revoked').length,
          };
        } catch {
          return { id, count: 0 };
        }
      }),
    ).then((results) => {
      if (!active) return;
      setActiveShareCounts(Object.fromEntries(results.map((result) => [result.id, result.count])));
    });

    return () => {
      active = false;
    };
  }, [hasKeys, isLocalMode, mapIdsKey]);

  useEffect(() => {
    const maps = mapsRef.current;
    if (isLocalMode || !sessionKeys || maps.length === 0) {
      return;
    }

    let active = true;
    const objectUrls: string[] = [];

    setPreviewStates((prev) => {
      const next = { ...prev };
      for (const map of maps) {
        next[map.id] = { loading: true };
      }
      return next;
    });

    void Promise.all(maps.map(async (map) => {
      try {
        const attachmentList = await encryptedVaultApi.listAttachments(map.id);
        const previewAttachment = attachmentList
          .filter((attachment) => attachment.status === 'available')
          .find((attachment) => {
            const meta = (attachment.encryption_meta ?? null) as Record<string, unknown> | null;
            return isVaultPreviewAttachmentMeta(meta) && getVaultPreviewTheme(meta) === themeMode;
          });

        if (!previewAttachment) {
          return { id: map.id, state: { loading: false } as VaultPreviewState };
        }

        const download = await encryptedVaultApi.getAttachmentDownload(map.id, previewAttachment.id);
        const encryptedBytes = await encryptedVaultApi.downloadUrl(download.download_url);
        const plaintext = download.encrypted
          ? await decryptAttachmentForOwner(encryptedBytes, download.encryption_meta, sessionKeys.masterKey)
          : encryptedBytes;
        const plainCopy = new Uint8Array(plaintext.byteLength);
        plainCopy.set(plaintext);
        const blob = new Blob([plainCopy.buffer], { type: download.content_type || 'image/webp' });
        const imageUrl = URL.createObjectURL(blob);
        objectUrls.push(imageUrl);
        const meta = (previewAttachment.encryption_meta ?? null) as Record<string, unknown> | null;
        const stats = getVaultPreviewStats(meta);

        return {
          id: map.id,
          state: {
            loading: false,
            summary: {
              format: 'tree',
              image_data_url: imageUrl,
              updated_at: map.updated_at,
              nodeCount: stats.nodeCount,
              noteCount: stats.noteCount,
              attachmentCount: stats.attachmentCount,
              saved_at: previewAttachment.uploaded_at,
            },
          } as VaultPreviewState,
        };
      } catch (err) {
        return {
          id: map.id,
          state: {
            loading: false,
            error: err instanceof Error ? err.message : 'Preview unavailable',
          } as VaultPreviewState,
        };
      }
    })).then((results) => {
      if (!active) return;
      setPreviewStates(Object.fromEntries(results.map((result) => [result.id, result.state])));
    });

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [isLocalMode, mapMetaKey, sessionKeys, themeMode]);

  useEffect(() => {
    const maps = mapsRef.current;
    if (!isLocalMode) {
      return;
    }
    const nextStates: Record<string, VaultPreviewState> = {};
    for (const map of maps) {
      const summary = loadCachedVaultPreview(map.id, map.updated_at, themeMode);
      nextStates[map.id] = summary ? { loading: false, summary } : { loading: false };
    }
    setPreviewStates(nextStates);
  }, [isLocalMode, mapMetaKey, themeMode]);

  useEffect(() => {
    if (hasKeys) {
      void loadMaps();
    } else {
      setLoading(false);
    }
  }, [hasKeys, loadMaps]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !sessionKeys) return;
    setCreating(true);
    setCreateError('');
    setCreatePlanPrompt(null);
    try {
      const titleEnc = await encryptTitle(newTitle, sessionKeys.masterKey);
      const { ephClassicalPublic, ephPqCiphertext, wrappedDek, dek } = await hybridEncap(
        sessionKeys.classicalPubKey,
        sessionKeys.pqPubKey,
      );

      const emptyTree: MindMapTree = {
        version: 'tree',
        root: {
          id: 'root',
          text: newTitle.trim(),
          notes: '',
          collapsed: false,
          color: null,
          icons: [],
          checked: null,
          progress: null,
          startDate: null,
          endDate: null,
          link: null,
          urls: [],
          children: [],
        },
      };
      const encBlob = await encryptTree(emptyTree, dek);

      const created = await storage.createVault({
        title_encrypted: titleEnc,
        eph_classical_public: toBase64(ephClassicalPublic),
        eph_pq_ciphertext: toBase64(ephPqCiphertext),
        wrapped_dek: toBase64(wrappedDek),
      });

      await storage.uploadBlob(created.id, encBlob);
      const createdDetail = await storage.getVault(created.id);
      void saveTreeVaultPreview(created.id, createdDetail.updated_at, emptyTree);

      setNewTitle('');
      setShowCreate(false);
      navigate(`/vaults/${created.id}`);
    } catch (err) {
      const planPrompt = getPlanErrorPrompt(err);
      setCreatePlanPrompt(planPrompt);
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  /**
   * Encrypts a parsed tree into a new vault and navigates into it.
   * Shared by every import format — only the parse step differs.
   */
  const createVaultFromImportedTree = async (parsedRoot: MindMapTreeNode, vaultTitle: string) => {
    if (!sessionKeys) return;
    parsedRoot.id = 'root';
    const importedTree: MindMapTree = { version: 'tree', root: parsedRoot };

    const titleEnc = await encryptTitle(vaultTitle, sessionKeys.masterKey);
    const { ephClassicalPublic, ephPqCiphertext, wrappedDek, dek } = await hybridEncap(
      sessionKeys.classicalPubKey,
      sessionKeys.pqPubKey,
    );
    const encBlob = await encryptTree(importedTree, dek);

    const created = await storage.createVault({
      title_encrypted: titleEnc,
      eph_classical_public: toBase64(ephClassicalPublic),
      eph_pq_ciphertext: toBase64(ephPqCiphertext),
      wrapped_dek: toBase64(wrappedDek),
    });

    await storage.uploadBlob(created.id, encBlob);
    const createdDetail = await storage.getVault(created.id);
    void saveTreeVaultPreview(created.id, createdDetail.updated_at, importedTree);

    navigate(`/vaults/${created.id}`);
  };

  const handleImportMarkdown = async (file: File) => {
    if (!sessionKeys) return;
    setImporting(true);
    setImportError('');
    try {
      const text = await file.text();
      const vaultTitle = file.name.replace(/\.md$/i, '') || 'Imported vault';
      await createVaultFromImportedTree(obsidianMarkdownToTree(text, vaultTitle), vaultTitle);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (mdImportRef.current) mdImportRef.current.value = '';
    }
  };

  /** Handles both FreeMind and FreePlane — the parser detects which by <map version>. */
  const handleImportFreemind = async (file: File) => {
    if (!sessionKeys) return;
    setMmImporting(true);
    setMmImportError('');
    try {
      const text = await file.text();
      const vaultTitle = file.name.replace(/\.mm$/i, '') || 'Imported vault';
      await createVaultFromImportedTree(freemindToTree(text, vaultTitle), vaultTitle);
    } catch (err) {
      setMmImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setMmImporting(false);
      if (mmImportRef.current) mmImportRef.current.value = '';
    }
  };

  const handleImportWisemapping = async (file: File) => {
    if (!sessionKeys) return;
    setWxmlImporting(true);
    setWxmlImportError('');
    try {
      const text = await file.text();
      const vaultTitle = file.name.replace(/\.(wxml|xml)$/i, '') || 'Imported vault';
      await createVaultFromImportedTree(wisemappingToTree(text, vaultTitle), vaultTitle);
    } catch (err) {
      setWxmlImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setWxmlImporting(false);
      if (wxmlImportRef.current) wxmlImportRef.current.value = '';
    }
  };

  const handleImportXmind = async (file: File) => {
    if (!sessionKeys) return;
    setXmindImporting(true);
    setXmindImportError('');
    try {
      const fileData = await file.arrayBuffer();
      const vaultTitle = file.name.replace(/\.xmind$/i, '') || 'Imported vault';
      // Loaded on demand — the zip decoder is only needed for this format.
      const { xmindToTree } = await import('../utils/xmindImport');
      await createVaultFromImportedTree(xmindToTree(fileData, vaultTitle), vaultTitle);
    } catch (err) {
      setXmindImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setXmindImporting(false);
      if (xmindImportRef.current) xmindImportRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingVaultId(id);
    try {
      await storage.deleteVault(id);
      setMaps((prev) => prev.filter((m) => m.id !== id));
      await refreshStorage();
      setPendingVaultDeletion(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vault');
    } finally {
      setDeletingVaultId(null);
    }
  };

  const handleSaveMeta = async (map: MapWithTitle) => {
    if (!sessionKeys) return;

    const nextMaxVersions = Math.max(1, Math.trunc(map.draftMaxVersions || 1));
    const notePlain = map.draftNote;

    setMaps((prev) => prev.map((m) => (m.id === map.id ? { ...m, metaSaving: true } : m)));
    try {
      const noteEncrypted = notePlain.trim()
        ? await encryptTitle(notePlain, sessionKeys.masterKey)
        : '';

      if (isLocalMode) {
        setLocalVaultColor(map.id, map.draftColor);
      }

      await storage.updateMeta(map.id, {
        ...(isLocalMode ? {} : { vault_color: map.draftColor }),
        vault_note_encrypted: noteEncrypted,
        vault_sharing_mode: map.draftSharingMode,
        vault_encryption_mode: map.draftEncryptionMode,
        max_versions: nextMaxVersions,
        vault_labels: normalizeVaultLabels(map.draftLabels),
      });

      setMaps((prev) => prev.map((m) => {
        if (m.id !== map.id) return m;
        return {
          ...m,
          vault_color: map.draftColor,
          vault_note_encrypted: noteEncrypted || undefined,
          vault_sharing_mode: map.draftSharingMode,
          vault_encryption_mode: map.draftEncryptionMode,
          max_versions: nextMaxVersions,
          vault_labels: normalizeVaultLabels(map.draftLabels),
          vaultNote: notePlain,
          draftNote: notePlain,
          draftLabels: normalizeVaultLabels(map.draftLabels),
          draftColor: map.draftColor,
          draftSharingMode: map.draftSharingMode,
          draftEncryptionMode: map.draftEncryptionMode,
          draftMaxVersions: nextMaxVersions,
          metaSaving: false,
        };
      }));
    } catch (err) {
      setMaps((prev) => prev.map((m) => (m.id === map.id ? { ...m, metaSaving: false } : m)));
      setError(err instanceof Error ? err.message : 'Failed to save vault settings');
    }
  };

  const setDraftColor = (id: string, color: string) => {
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, draftColor: normalizeHexColor(color) } : m)));
  };

  const setDraftNote = (id: string, note: string) => {
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, draftNote: note } : m)));
  };

  const setDraftLabels = (id: string, labels: string[]) => {
    const normalized = normalizeVaultLabels(labels);
    if (isLocalMode) {
      localStorage.setItem(`vault-labels-${id}`, JSON.stringify(normalized));
    }
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, draftLabels: normalized } : m)));
  };

  const setDraftMaxVersions = (id: string, value: number) => {
    const next = Math.max(1, Math.trunc(Number.isFinite(value) ? value : 1));
    setMaps((prev) => prev.map((m) => (m.id === id ? { ...m, draftMaxVersions: next } : m)));
  };

  const storageByVault = useMemo(
    () => new Map((storageSummary?.vaults ?? []).map((v) => [v.id, v])),
    [storageSummary],
  );

  const filteredMaps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return maps;
    return maps.filter(
      (m) =>
        m.title?.toLowerCase().includes(q) ||
        m.draftNote.toLowerCase().includes(q) ||
        m.draftLabels.some((l) => l.includes(q)),
    );
  }, [maps, searchQuery]);

  const usedBytes = storageSummary?.total_bytes ?? 0;
  const attachedFileCount = storageSummary?.attachment_count ?? 0;
  const attachedFileBytes = storageSummary?.attachment_bytes ?? 0;
  

  return (
    <>
      {!hasKeys && <UnlockModal onUnlocked={() => { void loadMaps(); }} />}

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-slate-700 bg-surface-1 px-4 py-3 sm:px-6 sm:py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <LogoWithText size={28} />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
              <span className="hidden text-sm text-slate-400 sm:inline">{username}</span>
              <ThemePanel initialTab="account" autoOpenWhatsNew onStorageFolderChanged={() => void loadMaps()} />
              <button
                onClick={logout}
                title={isLocalMode ? 'Lock this local profile' : 'Log out'}
                aria-label={isLocalMode ? 'Lock this local profile' : 'Log out'}
                className="rounded-lg border border-slate-600 p-2 text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                {isLocalMode ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-semibold text-white">Your Vaults</h1>
              {storageSummary && (
                <span className="text-xs text-slate-400">
                  {fmtBytes(usedBytes)} used · {storageSummary.vaults.length} vault{storageSummary.vaults.length === 1 ? '' : 's'}
                  {attachedFileCount > 0 ? ` · ${attachedFileCount} file${attachedFileCount === 1 ? '' : 's'} (${fmtBytes(attachedFileBytes)})` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Hidden file inputs */}
              <input ref={mdImportRef} type="file" accept=".md" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportMarkdown(f); }} />
              <input ref={mmImportRef} type="file" accept=".mm" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFreemind(f); }} />
              <input ref={wxmlImportRef} type="file" accept=".wxml,.xml" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportWisemapping(f); }} />
              <input ref={xmindImportRef} type="file" accept=".xmind" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportXmind(f); }} />

              {/* Import dropdown */}
              <div ref={importMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowImportMenu((v) => !v)}
                  disabled={!hasKeys || importing || mmImporting || wxmlImporting || xmindImporting}
                  title="Import a vault from a file"
                  className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {(importing || mmImporting || wxmlImporting || xmindImporting) ? 'Importing…' : 'Import'}
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showImportMenu && (
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 200, minWidth: 200, background: 'var(--color-surface-1, #1e293b)', border: '1px solid var(--color-border, #334155)', borderRadius: 8, padding: '4px 0', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      onClick={() => { mdImportRef.current?.click(); setShowImportMenu(false); }}
                    >
                      <span className="font-medium">Markdown</span>
                      <span className="ml-2 text-xs text-slate-500">.md</span>
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      onClick={() => { mmImportRef.current?.click(); setShowImportMenu(false); }}
                    >
                      <span className="font-medium">FreeMind</span>
                      <span className="ml-2 text-xs text-slate-500">.mm</span>
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      onClick={() => { mmImportRef.current?.click(); setShowImportMenu(false); }}
                    >
                      <span className="font-medium">FreePlane</span>
                      <span className="ml-2 text-xs text-slate-500">.mm</span>
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      onClick={() => { wxmlImportRef.current?.click(); setShowImportMenu(false); }}
                    >
                      <span className="font-medium">WiseMapping</span>
                      <span className="ml-2 text-xs text-slate-500">.wxml</span>
                    </button>
                    <button
                      className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/5 hover:text-white"
                      onClick={() => { xmindImportRef.current?.click(); setShowImportMenu(false); }}
                    >
                      <span className="font-medium">XMind</span>
                      <span className="ml-2 text-xs text-slate-500">.xmind</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowCreate(true)}
                disabled={!hasKeys}
                title="Create a new vault"
                className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New vault
              </button>
            </div>
          </div>
          {importError && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
              Import failed: {importError}
            </div>
          )}
          {mmImportError && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
              .mm import failed: {mmImportError}
            </div>
          )}
          {wxmlImportError && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
              WiseMapping import failed: {wxmlImportError}
            </div>
          )}
          {xmindImportError && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
              XMind import failed: {xmindImportError}
            </div>
          )}

          {storageError && (
            <div className="mb-4 rounded-lg border border-amber-700/60 bg-amber-900/20 px-4 py-3 text-xs text-amber-300">
              Storage summary unavailable: {storageError}
            </div>
          )}

          {showCreate && (
            <div className="mb-6 rounded-xl border border-slate-700 bg-surface-1 p-5">
              <h3 className="mb-3 font-medium text-white">New vault</h3>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Vault name..."
                  autoFocus
                  className="flex-1 rounded-lg border border-slate-600 bg-surface px-4 py-2 text-white placeholder-slate-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newTitle.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setCreateError(''); }}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
              {createError && (
                <div className="mt-3 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-200">
                  <p className="font-medium text-red-100">{createPlanPrompt?.title ?? 'Create failed'}</p>
                  <p className="mt-1 text-red-200">{createPlanPrompt?.message ?? createError}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Search bar + view toggle — shown only when vaults exist */}
          {!loading && maps.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
                <input
                  type="search"
                  placeholder="Search by name, note or label…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-surface py-2 pl-9 pr-8 text-sm text-white placeholder-slate-500 focus:border-accent focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-300"
                    title="Clear search"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex overflow-hidden rounded-lg border border-slate-700">
                <button
                  type="button"
                  onClick={() => { setViewMode('grid'); localStorage.setItem('mmv-lobby-view', 'grid'); }}
                  className={`px-3 py-2 transition ${viewMode === 'grid' ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200'}`}
                  title="Grid view"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => { setViewMode('table'); localStorage.setItem('mmv-lobby-view', 'table'); }}
                  className={`border-l border-slate-700 px-3 py-2 transition ${viewMode === 'table' ? 'bg-accent/20 text-accent' : 'text-slate-400 hover:text-slate-200'}`}
                  title="Table view"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <line x1="3" y1="6" x2="21" y2="6" strokeLinecap="round"/><line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round"/><line x1="3" y1="18" x2="21" y2="18" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {searchQuery.trim() !== '' && !loading && (
            <p className="mb-3 text-sm text-slate-400">
              {filteredMaps.length === 0
                ? `No vaults match "${searchQuery}"`
                : `${filteredMaps.length} of ${maps.length} vault${maps.length === 1 ? '' : 's'}`}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading vaults...
            </div>
          ) : maps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 px-6 py-16 text-center text-slate-500">
              <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
              </svg>
              <p className="mt-3 text-sm">No vaults yet.</p>
              <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  disabled={!hasKeys}
                  className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create your first vault
                </button>
                <button
                  type="button"
                  onClick={() => setShowImportMenu(true)}
                  disabled={!hasKeys}
                  className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import an existing file
                </button>
              </div>
            </div>
          ) : filteredMaps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-16 text-center">
              <p className="text-sm text-slate-500">No vaults match your search.</p>
              <button type="button" onClick={() => setSearchQuery('')} className="mt-2 text-xs text-accent hover:underline">
                Clear search
              </button>
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 bg-surface-1">
                    <th className="w-1 p-0" />
                    <th className="w-[88px] py-2 pl-2 text-left text-xs font-medium text-slate-500">Preview</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                    <th className="hidden px-3 py-2 text-left text-xs font-medium text-slate-500 sm:table-cell">Updated</th>
                    <th className="hidden px-3 py-2 text-left text-xs font-medium text-slate-500 lg:table-cell">Stats</th>
                    <th className="py-2 pr-3 text-right text-xs font-medium text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaps.map((m) => (
                    <VaultTableRow
                      key={m.id}
                      map={m}
                      usage={storageByVault.get(m.id)}
                      isLocalMode={isLocalMode}
                      renamingId={renamingId}
                      renameValue={renameValue}
                      renaming={renaming}
                      userLabels={userLabels}
                      activeShareCount={activeShareCounts[m.id] ?? 0}
                      previewState={previewStates[m.id]}
                      onNavigate={navigate}
                      onStartRename={handleStartRename}
                      onRenameValueChange={setRenameValue}
                      onRenameConfirm={handleRenameConfirm}
                      onRenameCancel={handleRenameCancel}
                      onOpenHistory={setHistoryVaultId}
                      onDeleteRequest={(id, title) => setPendingVaultDeletion({ id, title })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {filteredMaps.map((m) => (
                <VaultCard
                  key={m.id}
                  map={m}
                  usage={storageByVault.get(m.id)}
                  isLocalMode={isLocalMode}
                  renamingId={renamingId}
                  renameValue={renameValue}
                  renaming={renaming}
                  userLabels={userLabels}
                  activeShareCount={activeShareCounts[m.id] ?? 0}
                  previewState={previewStates[m.id]}
                  previewPanelStyle={previewPanelStyle}
                  previewOverlayStyle={previewOverlayStyle}
                  previewOverlayBadgeStyle={previewOverlayBadgeStyle}
                  onNavigate={navigate}
                  onStartRename={handleStartRename}
                  onRenameValueChange={setRenameValue}
                  onRenameConfirm={handleRenameConfirm}
                  onRenameCancel={handleRenameCancel}
                  onOpenHistory={setHistoryVaultId}
                  onDeleteRequest={(id, title) => setPendingVaultDeletion({ id, title })}
                  onSetDraftColor={setDraftColor}
                  onSetDraftNote={setDraftNote}
                  onSetDraftLabels={setDraftLabels}
                  onSetDraftMaxVersions={setDraftMaxVersions}
                  onUpdateUserLabelColor={updateUserLabelColor}
                  onAddUserLabel={addUserLabel}
                  onSaveMeta={handleSaveMeta}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {historyVaultId && !isLocalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setHistoryVaultId(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <VersionHistoryPanel
              className="mm-version-panel--modal"
              vaultId={historyVaultId}
              onClose={() => setHistoryVaultId(null)}
              onLoad={(v: VersionDetail) => {
                const target = historyVaultId;
                setHistoryVaultId(null);
                navigate(`/vaults/${target}?version_id=${encodeURIComponent(v.version_id)}`);
              }}
              loadingVersionId={null}
              onDeleteVersion={async (versionId: string) => {
                const target = historyVaultId;
                if (!target) return;
                await mindmapsApi.deleteVersion(target, versionId);
                await refreshStorage();
              }}
            />
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingVaultDeletion}
        title="Delete vault"
        message={pendingVaultDeletion
          ? `Permanently delete "${pendingVaultDeletion.title ?? 'this vault'}" and all of its stored versions? This cannot be undone.`
          : ''}
        confirmLabel="Delete vault"
        cancelLabel="Keep vault"
        busy={deletingVaultId !== null}
        danger
        onClose={() => {
          if (deletingVaultId === null) setPendingVaultDeletion(null);
        }}
        onConfirm={() => {
          if (pendingVaultDeletion) {
            void handleDelete(pendingVaultDeletion.id);
          }
        }}
      />
    </>
  );
}
