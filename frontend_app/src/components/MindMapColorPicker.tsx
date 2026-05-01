/**
 * MindMapColorPicker
 *
 * 5 base colour families × 6 shades grid, plus a "default" clear option.
 *
 * Keyboard:
 * - Arrow Left / Right  — move within a shade row
 * - Arrow Up / Down     — move between colour families
 * - Tab / Shift+Tab     — jump to next / previous colour family
 * - Enter / Space       — select the focused swatch
 * - Escape              — close the picker
 *
 * A floating tooltip shows the hex value on focus or hover.
 */

import { useState, useRef, useEffect, useCallback, memo } from 'react';

/* ── Colour palette: 5 families × 6 shades (dark → light) ──────────────── */
const COLOR_FAMILIES: { label: string; shades: string[] }[] = [
  { label: 'Red',    shades: ['#7f1d1d', '#b91c1c', '#dc2626', '#ef4444', '#f87171'] },
  { label: 'Green',  shades: ['#14532d', '#15803d', '#16a34a', '#22c55e', '#4ade80'] },
  { label: 'Blue',   shades: ['#1e3a5f', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'] },
  { label: 'Purple', shades: ['#4c1d95', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd'] },
  { label: 'Teal',   shades: ['#134e4a', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf'] },
];

const ROWS = COLOR_FAMILIES.length;
const COLS = COLOR_FAMILIES[0].shades.length;

interface MindMapColorPickerProps {
  open: boolean;
  currentColor: string | null;
  onSelect: (color: string | null) => void;
  onClose: () => void;
  showToast?: (label: string) => void;
}

function MindMapColorPickerInner({ open, currentColor, onSelect, onClose, showToast }: MindMapColorPickerProps) {
  // Focus position: row = -1 means the "Default" clear button,
  // row 0..4 + col 0..5 is the shade grid.
  const [row, setRow] = useState(-1);
  const [col, setCol] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  /* Reset on open */
  useEffect(() => {
    if (open) {
      setRow(-1);
      setCol(0);
      setTooltip(null);
      // Focus the default button after opening
      setTimeout(() => {
        gridRef.current?.querySelector<HTMLButtonElement>('.mm-cp-default')?.focus();
      }, 60);
    }
  }, [open]);

  /* ── Tooltip helpers ─────────────────────────────────────────────────── */
  const showTip = useCallback((el: HTMLElement, text: string) => {
    const parent = el.closest('.mm-color-picker-v2') as HTMLElement | null;
    if (!parent) return;
    const r = el.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    setTooltip({ text, x: r.left - p.left + r.width / 2, y: r.top - p.top - 4 });
  }, []);
  const hideTip = useCallback(() => setTooltip(null), []);

  /* ── Focus the button at (row, col) ──────────────────────────────────── */
  const focusCell = useCallback((r: number, c: number) => {
    if (!gridRef.current) return;
    setRow(r);
    setCol(c);
    let btn: HTMLButtonElement | null;
    if (r === -1) {
      btn = gridRef.current.querySelector('.mm-cp-default');
    } else {
      btn = gridRef.current.querySelector(`[data-r="${r}"][data-c="${c}"]`);
    }
    if (btn) {
      btn.focus();
      const label = r === -1 ? 'Default (clear)' : COLOR_FAMILIES[r].shades[c];
      showTip(btn, label);
    }
  }, [showTip]);

  /* ── Grid keyboard handler ───────────────────────────────────────────── */
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation(); // never leak to node navigation

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        if (row === -1) { focusCell(0, 0); showToast?.('→ — Move right'); return; }
        focusCell(row, col + 1 < COLS ? col + 1 : 0);
        showToast?.('→ — Move right');
        return;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (row === -1) { showToast?.('← — Move left'); return; }
        if (col === 0) { focusCell(row, COLS - 1); } else { focusCell(row, col - 1); }
        showToast?.('← — Move left');
        return;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (row === -1) { focusCell(0, col); } else { focusCell(row + 1 < ROWS ? row + 1 : -1, col); }
        showToast?.('↓ — Move down');
        return;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (row === -1) { focusCell(ROWS - 1, col); } else if (row === 0) { focusCell(-1, col); } else { focusCell(row - 1, col); }
        showToast?.('↑ — Move up');
        return;
      }
      case 'Tab': {
        e.preventDefault();
        if (e.shiftKey) {
          if (row <= 0) { focusCell(ROWS - 1, col); } else { focusCell(row - 1, col); }
          showToast?.('⇧Tab — Prev family');
        } else {
          if (row === -1) { focusCell(0, col); } else if (row + 1 < ROWS) { focusCell(row + 1, col); } else { focusCell(-1, col); }
          showToast?.('Tab — Next family');
        }
        return;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (row === -1) { onSelect(null); showToast?.('Enter — Default'); }
        else { onSelect(COLOR_FAMILIES[row].shades[col]); showToast?.(`Enter — ${COLOR_FAMILIES[row].label}`); }
        return;
      }
      case 'Escape': {
        e.preventDefault();
        showToast?.('Esc — Close');
        onClose();
        return;
      }
    }
  }, [row, col, focusCell, onSelect, onClose, showToast]);

  if (!open) return null;

  return (
    <div className="mm-color-picker-v2" role="dialog" aria-label="Color picker" onKeyDown={handleKey}>
      <div className="mm-cp-header">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        <span>Choose Colour</span>
        <button
          className="mm-btn mm-btn-sm"
          onClick={onClose}
          aria-label="Close colour picker"
          tabIndex={-1}
          style={{ marginLeft: 'auto', padding: '0 6px', height: 24 }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div ref={gridRef} className="mm-cp-grid" role="grid" aria-label="Colour grid">
        {/* Default / clear row */}
        <button
          className={`mm-cp-default${currentColor == null ? ' active' : ''}`}
          onClick={() => onSelect(null)}
          onFocus={(e) => { setRow(-1); showTip(e.currentTarget, 'Default (clear)'); }}
          onBlur={hideTip}
          onMouseEnter={(e) => showTip(e.currentTarget, 'Default (clear)')}
          onMouseLeave={hideTip}
          aria-label="Default (clear)"
          aria-selected={currentColor == null}
          tabIndex={row === -1 ? 0 : -1}
          role="gridcell"
        >
          <span style={{ fontSize: 12, fontWeight: 700 }}>✕</span>
          <span style={{ fontSize: 11, marginLeft: 4 }}>Default</span>
        </button>

        {/* Shade rows */}
        {COLOR_FAMILIES.map((fam, ri) => (
          <div key={fam.label} className="mm-cp-row" role="row" aria-label={fam.label}>
            <span className="mm-cp-label">{fam.label}</span>
            {fam.shades.map((hex, ci) => {
              const isActive = currentColor === hex;
              return (
                <button
                  key={hex}
                  data-r={ri}
                  data-c={ci}
                  className={`mm-cp-swatch${isActive ? ' active' : ''}`}
                  style={{ background: hex }}
                  onClick={() => onSelect(hex)}
                  onFocus={(e) => { setRow(ri); setCol(ci); showTip(e.currentTarget, hex); }}
                  onBlur={hideTip}
                  onMouseEnter={(e) => showTip(e.currentTarget, hex)}
                  onMouseLeave={hideTip}
                  aria-label={`${fam.label} ${hex}`}
                  aria-selected={isActive}
                  tabIndex={row === ri && col === ci ? 0 : -1}
                  role="gridcell"
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div className="mm-cp-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export const MindMapColorPicker = memo(MindMapColorPickerInner);
