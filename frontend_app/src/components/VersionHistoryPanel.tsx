import { useEffect, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { mindmapsApi } from '../api/mindmaps';
import type { VersionDetail } from '../types';

interface Props {
  vaultId: string;
  onClose: () => void;
  onLoad: (v: VersionDetail) => void;
  loadingVersionId: string | null;
  onDeleteVersion?: (versionId: string) => Promise<void>;
  /** Extra CSS class — use 'mm-version-panel--overlay' inside editor,
   *  'mm-version-panel--modal' inside a VaultsPage backdrop. */
  className?: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export function VersionHistoryPanel({
  vaultId, onClose, onLoad, loadingVersionId, onDeleteVersion, className = '',
}: Props) {
  const [versions, setVersions] = useState<VersionDetail[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setFetching(true);
    setFetchError('');
    mindmapsApi.listVersions(vaultId)
      .then(setVersions)
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'Failed to load versions'))
      .finally(() => setFetching(false));
  }, [vaultId]);

  const handleDelete = async (versionId: string) => {
    if (!onDeleteVersion) return;
    setDeletingId(versionId);
    try {
      await onDeleteVersion(versionId);
      setVersions((prev) => prev.filter((v) => v.version_id !== versionId));
      setPendingDeleteId(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to delete version');
    } finally {
      setDeletingId(null);
    }
  };

  const pendingDeleteVersion = versions.find((version) => version.version_id === pendingDeleteId) ?? null;
  const totalVersionCount = versions.reduce((max, version) => Math.max(max, version.version_number ?? 0), 0);

  return (
    <>
      <div className={`mm-version-panel ${className}`}>
        <div className="mm-notes-header">
          <span>
            <svg style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Version History
          </span>
          <button className="mm-btn-icon" onClick={onClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="mm-version-list">
          {fetching && (
            <div className="mm-version-empty">Loading versions…</div>
          )}
          {fetchError && (
            <div style={{ padding: '12px 14px', color: '#ef4444', fontSize: 12 }}>{fetchError}</div>
          )}
          {!fetching && !fetchError && versions.length === 0 && (
            <div className="mm-version-empty">No saved versions found.</div>
          )}

          {versions.map((v, i) => {
            const canLoad = !!v.eph_classical_public;
            const isLoadingThis = loadingVersionId === v.version_id;
            const isDeletingThis = deletingId === v.version_id;
            const busy = loadingVersionId !== null || deletingId !== null;
            const vNum = v.version_number ?? (versions.length - i);
            const savedAt = v.saved_at ?? v.last_modified;

            return (
              <div key={v.version_id} className="mm-version-item">
                <div className="mm-version-meta">
                  <div className="mm-version-date">
                    {v.is_latest && <span className="mm-version-badge">Latest</span>}
                    <span
                      className="mm-version-num"
                      data-tooltip={fmtDateFull(savedAt)}
                    >
                      v{vNum}
                    </span>
                    {fmtDateShort(savedAt)}
                  </div>
                  <div className="mm-version-size">{fmtBytes(v.size_bytes)}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button
                    className="mm-btn mm-btn--primary"
                    style={{ fontSize: 11, padding: '3px 10px' }}
                    disabled={!canLoad || busy}
                    onClick={() => onLoad(v)}
                    title={
                      canLoad
                        ? 'Restore this version into the editor'
                        : 'Cannot restore — encryption data unavailable for this version'
                    }
                  >
                    {isLoadingThis ? 'Loading…' : 'Load'}
                  </button>
                  {onDeleteVersion && !v.is_latest && (
                    <button
                      className="mm-btn mm-btn--danger"
                      style={{ fontSize: 11, padding: '3px 7px' }}
                      disabled={busy}
                      onClick={() => setPendingDeleteId(v.version_id)}
                      title="Delete this version permanently"
                    >
                      {isDeletingThis ? (
                        <svg className="mm-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity=".25"/>
                          <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" opacity=".75"/>
                        </svg>
                      ) : (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!fetching && !fetchError && versions.length > 0 && (
          <div className="mm-version-footer">
            <span>
              {versions.length} kept
              {totalVersionCount > versions.length ? ` · ${totalVersionCount} total saved` : ` version${versions.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDeleteVersion}
        title="Delete saved version"
        message={pendingDeleteVersion
          ? `Permanently delete the saved version from ${fmtDateFull(pendingDeleteVersion.saved_at ?? pendingDeleteVersion.last_modified)}? This removes only this version and cannot be undone.`
          : ''}
        confirmLabel="Delete version"
        cancelLabel="Keep version"
        busy={deletingId !== null}
        danger
        onClose={() => {
          if (deletingId === null) setPendingDeleteId(null);
        }}
        onConfirm={() => {
          if (pendingDeleteId) {
            void handleDelete(pendingDeleteId);
          }
        }}
      />
    </>
  );
}
