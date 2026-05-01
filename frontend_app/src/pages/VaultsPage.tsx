import { memo, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  MindMapListItem,
  StorageSummary,
  VaultEncryptionMode,
  VaultSharingMode,
  VersionDetail,
} from '../types';
import { getPlanErrorPrompt, type PlanErrorPrompt } from '../utils/planErrors';
import { obsidianMarkdownToTree } from '../utils/markdownImport';
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

interface LocalStorageDirInfo {
  path: string;
  is_override: boolean;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

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
  previewFrameStyle: CSSProperties;
  previewImageShellStyle: CSSProperties;
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
  previewFrameStyle,
  previewImageShellStyle,
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
            <div className="relative overflow-hidden rounded-lg border p-3" style={previewFrameStyle}>
              <div className={blurPreview ? 'select-none blur-sm opacity-60' : ''}>
                <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border p-3" style={previewImageShellStyle}>
                  <img
                    src={previewState.summary.image_data_url}
                    alt={`Preview of ${map.title ?? 'vault'}`}
                    className="h-full w-full rounded-md object-contain"
                    loading="lazy"
                  />
                </div>
                <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {previewState.summary.format} screenshot
                  {previewState.summary.noteCount > 0 ? ` | ${previewState.summary.noteCount} notes` : ''}
                  {previewState.summary.attachmentCount > 0 ? ` | ${previewState.summary.attachmentCount} files` : ''}
                </p>
              </div>
              {blurPreview && (
                <div className="absolute inset-0 flex items-center justify-center" style={previewOverlayStyle}>
                  <span className="rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]" style={previewOverlayBadgeStyle}>
                    Blurred for shared vaults
                  </span>
                </div>
              )}
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
    && prev.previewFrameStyle === next.previewFrameStyle
    && prev.previewImageShellStyle === next.previewImageShellStyle
    && prev.previewOverlayStyle === next.previewOverlayStyle
    && prev.previewOverlayBadgeStyle === next.previewOverlayBadgeStyle;
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

  const [historyVaultId, setHistoryVaultId] = useState<string | null>(null);
  const [storagePathInfo, setStoragePathInfo] = useState<LocalStorageDirInfo | null>(null);
  const [storagePathInput, setStoragePathInput] = useState('');
  const [storagePathWorking, setStoragePathWorking] = useState(false);
  const [storagePathError, setStoragePathError] = useState('');
  const [isWslRuntime, setIsWslRuntime] = useState(false);

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

  const previewFrameStyle = useMemo(() => (
    themeMode === 'light'
      ? {
          borderColor: 'rgba(203, 213, 225, 0.95)',
          background: 'linear-gradient(180deg, rgba(241,245,249,0.96), rgba(226,232,240,0.92))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75)',
        }
      : {
          borderColor: 'rgb(30 41 59 / 1)',
          background: 'rgba(2, 6, 23, 0.7)',
        }
  ), [themeMode]);

  const previewImageShellStyle = useMemo(() => (
    themeMode === 'light'
      ? {
          borderColor: 'rgba(148, 163, 184, 0.35)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.95))',
        }
      : {
          borderColor: 'rgb(15 23 42 / 0.8)',
          background: 'rgba(2, 6, 23, 0.7)',
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
            const color = normalizeHexColor(m.vault_color);
            const maxVersions = Math.max(1, m.max_versions ?? 50);
            const note = decryptedNotes[i] ?? '';
            return {
              ...m,
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
          items.map((m) => ({
            ...m,
            title: null,
            vaultNote: '',
            draftNote: '',
            draftLabels: normalizeVaultLabels(
              m.vault_labels ?? (isLocalMode ? (JSON.parse(localStorage.getItem(`vault-labels-${m.id}`) ?? '[]') as string[]) : []),
            ),
            draftColor: normalizeHexColor(m.vault_color),
            draftSharingMode: normalizeSharingMode(m.vault_sharing_mode),
            draftEncryptionMode: normalizeEncryptionMode(m.vault_encryption_mode),
            draftMaxVersions: Math.max(1, m.max_versions ?? 50),
            metaSaving: false,
          })),
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

  const mapIdsKey = useMemo(() => maps.map((map) => map.id).join('|'), [maps]);

  useEffect(() => {
    if (isLocalMode || !hasKeys || maps.length === 0) {
      return;
    }

    let active = true;

    void Promise.all(
      maps.map(async (map) => {
        try {
          const shares = await encryptedVaultApi.listShares(map.id);
          return {
            id: map.id,
            count: shares.filter((share) => !share.revoked && share.status !== 'revoked').length,
          };
        } catch {
          return { id: map.id, count: 0 };
        }
      }),
    ).then((results) => {
      if (!active) return;
      setActiveShareCounts(Object.fromEntries(results.map((result) => [result.id, result.count])));
    });

    return () => {
      active = false;
    };
  }, [hasKeys, isLocalMode, mapIdsKey, maps]);

  useEffect(() => {
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
  }, [isLocalMode, maps, sessionKeys, themeMode]);

  useEffect(() => {
    if (!isLocalMode) {
      return;
    }
    const nextStates: Record<string, VaultPreviewState> = {};
    for (const map of maps) {
      const summary = loadCachedVaultPreview(map.id, map.updated_at, themeMode);
      nextStates[map.id] = summary ? { loading: false, summary } : { loading: false };
    }
    setPreviewStates(nextStates);
  }, [isLocalMode, mapIdsKey, maps]);

  useEffect(() => {
    if (hasKeys) {
      void loadMaps();
    } else {
      setLoading(false);
    }
  }, [hasKeys, loadMaps]);

  const loadLocalStoragePath = useCallback(async () => {
    if (!isLocalMode) return;
    try {
      const info = await invokeTauri<LocalStorageDirInfo>('get_local_storage_dir');
      setStoragePathInfo(info);
      setStoragePathInput(info.path);
      setStoragePathError('');
    } catch (err) {
      setStoragePathError(err instanceof Error ? err.message : String(err));
    }
  }, [isLocalMode]);

  useEffect(() => {
    if (isLocalMode) {
      void loadLocalStoragePath();
      (async () => {
        try {
          const wsl = await invokeTauri<boolean>('is_wsl_environment');
          setIsWslRuntime(wsl);
        } catch {
          setIsWslRuntime(false);
        }
      })();
    }
  }, [isLocalMode, loadLocalStoragePath]);

  const handleSaveStoragePath = async () => {
    if (!isLocalMode || !storagePathInput.trim()) return;
    setStoragePathWorking(true);
    setStoragePathError('');
    try {
      const info = await invokeTauri<LocalStorageDirInfo>('set_local_storage_dir', {
        path: storagePathInput.trim(),
      });
      setStoragePathInfo(info);
      setStoragePathInput(info.path);
      await loadMaps();
    } catch (err) {
      setStoragePathError(err instanceof Error ? err.message : String(err));
    } finally {
      setStoragePathWorking(false);
    }
  };

  const handleBrowseStoragePath = async () => {
    if (!isLocalMode) return;
    setStoragePathError('');
    try {
      const selected = await invokeTauri<string | null>('pick_local_storage_dir');
      if (selected) {
        setStoragePathInput(selected);
      }
    } catch (err) {
      setStoragePathError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetStoragePath = async () => {
    if (!isLocalMode) return;
    setStoragePathWorking(true);
    setStoragePathError('');
    try {
      const info = await invokeTauri<LocalStorageDirInfo>('reset_local_storage_dir');
      setStoragePathInfo(info);
      setStoragePathInput(info.path);
      await loadMaps();
    } catch (err) {
      setStoragePathError(err instanceof Error ? err.message : String(err));
    } finally {
      setStoragePathWorking(false);
    }
  };

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

  const handleImportMarkdown = async (file: File) => {
    if (!sessionKeys) return;
    setImporting(true);
    setImportError('');
    try {
      const text = await file.text();
      const vaultTitle = file.name.replace(/\.md$/i, '') || 'Imported vault';
      const parsedRoot = obsidianMarkdownToTree(text, vaultTitle);
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
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (mdImportRef.current) mdImportRef.current.value = '';
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

      await storage.updateMeta(map.id, {
        vault_color: map.draftColor,
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

  const usedBytes = storageSummary?.total_bytes ?? 0;
  const attachedFileCount = storageSummary?.attachment_count ?? 0;
  const attachedFileBytes = storageSummary?.attachment_bytes ?? 0;
  

  return (
    <>
      {!hasKeys && <UnlockModal onUnlocked={() => { void loadMaps(); }} />}

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-slate-700 bg-surface-1 px-4 py-3 sm:px-6 sm:py-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <LogoWithText size={28} />
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3">
              <span className="hidden text-sm text-slate-400 sm:inline">{username}</span>
              <ThemePanel />
              <button
                onClick={logout}
                title={isLocalMode ? 'Lock this local profile' : 'Log out'}
                className="ml-auto rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white sm:ml-0 sm:py-1.5"
              >
                {isLocalMode ? 'Lock' : 'Log out'}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-white">Your Vaults</h1>
            <div className="flex items-center gap-2">
              <input
                ref={mdImportRef}
                type="file"
                accept=".md"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportMarkdown(file);
                }}
              />
              <button
                onClick={() => mdImportRef.current?.click()}
                disabled={!hasKeys || importing}
                title="Import an Obsidian / Markdown file as a new vault"
                className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {importing ? 'Importing…' : 'Import .md'}
              </button>
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

          {isLocalMode && (
            <div className="mb-6 rounded-xl border border-slate-700 bg-surface-1 p-4">
              <h2 className="text-sm font-semibold text-slate-200">Local storage folder</h2>
              <p className="mt-1 text-xs text-slate-400">
                Use a writable folder for offline vault files. Change this if vault creation fails due to permissions.
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={storagePathInput}
                  onChange={(e) => setStoragePathInput(e.target.value)}
                  placeholder="/path/to/mindmapvault-local"
                  className="flex-1 rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-accent focus:outline-none"
                  disabled={storagePathWorking}
                />
                <button
                  onClick={() => { void handleBrowseStoragePath(); }}
                  disabled={storagePathWorking || isWslRuntime}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 disabled:opacity-50"
                  title={isWslRuntime ? 'Browse dialog is disabled in WSL for stability. Paste path manually.' : 'Browse folders'}
                >
                  Browse...
                </button>
                <button
                  onClick={() => { void handleSaveStoragePath(); }}
                  disabled={storagePathWorking || !storagePathInput.trim()}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
                >
                  {storagePathWorking ? 'Saving...' : 'Set folder'}
                </button>
                <button
                  onClick={() => { void handleResetStoragePath(); }}
                  disabled={storagePathWorking}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 disabled:opacity-50"
                >
                  Use default
                </button>
              </div>

              {storagePathInfo && (
                <p className="mt-2 text-xs text-slate-400">
                  Active folder: {storagePathInfo.path}
                  {storagePathInfo.is_override ? ' (custom)' : ' (default)'}
                </p>
              )}

              {storagePathError && (
                <p className="mt-2 text-xs text-red-400">{storagePathError}</p>
              )}

              {isWslRuntime && (
                <p className="mt-2 text-xs text-amber-300">
                  WSL mode detected: folder browse popup is disabled for stability. Paste a path manually, e.g. /home/kornelko/mindmapvault-local.
                </p>
              )}
            </div>
          )}

          {storageSummary && (
            <div className="mb-6 rounded-xl border border-slate-700 bg-surface-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-200">Total storage used</h2>
                <span className="text-xs text-slate-400">
                  {fmtBytes(usedBytes)} used in local offline storage
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>{storageSummary.vaults.length} vaults</span>
                {attachedFileCount > 0 && <span>{attachedFileCount} attached file{attachedFileCount === 1 ? '' : 's'} using {fmtBytes(attachedFileBytes)}</span>}
                
              </div>
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

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-500">
              <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Loading vaults...
            </div>
          ) : maps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 py-20 text-center text-slate-500">
              <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
              </svg>
              <p className="mt-3 text-sm">No vaults yet. Create your first one above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {maps.map((m) => (
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
                  previewFrameStyle={previewFrameStyle}
                  previewImageShellStyle={previewImageShellStyle}
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
