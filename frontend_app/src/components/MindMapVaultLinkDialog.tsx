/**
 * MindMapVaultLinkDialog
 *
 * Picks the vault a node links to.
 *
 * Vault titles are encrypted at rest, so the list arrives already decrypted
 * from the page — this dialog never talks to storage itself.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';

export interface LinkableVault {
  id: string;
  title: string;
}

interface MindMapVaultLinkDialogProps {
  open: boolean;
  /** Left out of the list: a node linking to its own map goes nowhere useful. */
  currentVaultId?: string;
  vaults: LinkableVault[];
  loading?: boolean;
  /** Set when the node already has a link, so the dialog can offer to clear it. */
  linkedVaultId?: string | null;
  onPick: (vault: LinkableVault) => void;
  onRemove: () => void;
  onClose: () => void;
}

function MindMapVaultLinkDialogInner({
  open,
  currentVaultId,
  vaults,
  loading = false,
  linkedVaultId,
  onPick,
  onRemove,
  onClose,
}: MindMapVaultLinkDialogProps) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vaults
      .filter((v) => v.id !== currentVaultId)
      .filter((v) => !needle || (v.title || '').toLowerCase().includes(needle));
  }, [vaults, currentVaultId, query]);

  if (!open) return null;

  return (
    <>
      <div className="mm-overlay" onClick={onClose} />
      <div className="mm-vault-link-dialog">
        <div className="mm-date-header">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
            <path d="M 3 5 L 9 3 L 15 6 L 21 4 L 21 19 L 15 21 L 9 18 L 3 20 Z" />
            <path d="M 9 3 L 9 18 M 15 6 L 15 21" />
          </svg>
          <span>Link to a vault</span>
          <button className="mm-btn-icon" onClick={onClose} style={{ marginLeft: 'auto' }} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mm-date-body">
          <input
            ref={searchRef}
            className="mm-date-input"
            placeholder="Search vaults…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') onClose();
              // Enter takes the only thing left, which is what the search is for.
              if (e.key === 'Enter' && matches.length === 1) onPick(matches[0]);
            }}
          />

          <div className="mm-vault-link-list">
            {loading && <p className="mm-vault-link-empty">Loading vaults…</p>}
            {!loading && matches.length === 0 && (
              <p className="mm-vault-link-empty">
                {vaults.length <= (currentVaultId ? 1 : 0)
                  ? 'No other vaults to link to yet.'
                  : 'No vaults match that search.'}
              </p>
            )}
            {!loading && matches.map((vault) => (
              <button
                key={vault.id}
                className={`mm-vault-link-item${vault.id === linkedVaultId ? ' is-linked' : ''}`}
                onClick={() => onPick(vault)}
              >
                <span className="mm-vault-link-title">{vault.title || '(untitled)'}</span>
                {vault.id === linkedVaultId && <span className="mm-vault-link-badge">linked</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="mm-date-footer">
          <button className="mm-btn" onClick={onClose}>Cancel</button>
          {linkedVaultId && (
            <button className="mm-btn mm-btn--danger" onClick={onRemove} style={{ marginLeft: 'auto' }}>
              Remove link
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export const MindMapVaultLinkDialog = memo(MindMapVaultLinkDialogInner);
