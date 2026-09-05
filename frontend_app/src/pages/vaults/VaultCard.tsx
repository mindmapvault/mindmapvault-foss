/**
 * One vault in the grid view.
 *
 * The table's row of the same vault is `VaultTableRow`. They share the
 * derivation in `vaultState.ts`, not their markup — merging them behind a
 * `variant` prop would put two layouts in one component.
 */

import { memo, type CSSProperties } from 'react';
import type { StorageSummary } from '../../types';
import { fmtBytes, formatDateShort } from './format';
import { VaultLabelInput } from './VaultLabelInput';
import type { MapWithTitle, VaultPreviewState } from './types';
import {
  DEFAULT_MAX_VERSIONS,
  deriveVaultState,
  labelsEqual,
  normalizeEncryptionMode,
  normalizeHexColor,
  normalizeVaultLabels,
  sameRenameContext,
} from './vaultState';

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

export const VaultCard = memo(function VaultCard({
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
  const persistedMax = Math.max(1, map.max_versions ?? DEFAULT_MAX_VERSIONS);
  const persistedEncryptionMode = normalizeEncryptionMode(map.vault_encryption_mode);
  const persistedLabels = normalizeVaultLabels(map.vault_labels);
  const { isShared: isSharedVault } = deriveVaultState(map, activeShareCount);
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
  return prev.map === next.map
    && prev.usage === next.usage
    && prev.isLocalMode === next.isLocalMode
    && sameRenameContext(prev, next)
    && prev.activeShareCount === next.activeShareCount
    && prev.previewState === next.previewState
    && prev.userLabels === next.userLabels
    && prev.previewPanelStyle === next.previewPanelStyle
    && prev.previewOverlayStyle === next.previewOverlayStyle
    && prev.previewOverlayBadgeStyle === next.previewOverlayBadgeStyle;
});
