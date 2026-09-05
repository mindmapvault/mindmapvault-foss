/** One vault in the table view. Its grid counterpart is `VaultCard`. */

import { memo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StorageSummary } from '../../types';
import { formatDateShort } from './format';
import type { MapWithTitle, VaultPreviewState } from './types';
import { deriveVaultState, sameRenameContext } from './vaultState';

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

export const VaultTableRow = memo(function VaultTableRow({
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
  const { isShared: isSharedVault } = deriveVaultState(map, activeShareCount);
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
  return (
    prev.map === next.map &&
    prev.usage === next.usage &&
    prev.isLocalMode === next.isLocalMode &&
    sameRenameContext(prev, next) &&
    prev.activeShareCount === next.activeShareCount &&
    prev.previewState === next.previewState &&
    prev.userLabels === next.userLabels
  );
});
