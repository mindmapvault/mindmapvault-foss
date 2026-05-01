import { useEffect, useRef, useState } from 'react';

const SHORTCUTS = [
  { keys: ['Insert', 'Tab'], action: 'Add child node' },
  { keys: ['Enter'], action: 'Add sibling node' },
  { keys: ['Del', '⌫'], action: 'Delete node' },
  { keys: ['F2'], action: 'Rename node' },
  { keys: ['Space'], action: 'Fold / Unfold children' },
  { keys: ['↑', '↓'], action: 'Prev / next sibling' },
  { keys: ['←', '→'], action: 'Select parent / child' },
  { keys: ['Home'], action: 'Go to root node' },
  { keys: ['Ctrl+S'], action: 'Save vault' },
  { keys: ['F1', '?'], action: 'Toggle shortcuts panel' },
  { keys: ['Esc'], action: 'Cancel edit / close panel' },
];

export function ShortcutsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'F1') { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Element)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Keyboard shortcuts (F1)"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition hover:bg-[var(--surface-2)]"
        style={{
          color: open ? 'var(--accent)' : 'var(--text-secondary)',
          border: '1px solid var(--border-light)',
        }}
      >
        ?
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: 68,
            right: 16,
            zIndex: 1000,
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            minWidth: 330,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--accent)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Keyboard Shortcuts
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 transition hover:bg-[var(--surface-1)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Close (Esc)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Shortcut rows */}
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {SHORTCUTS.map(({ keys, action }, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {action}
                </span>
                <div className="flex items-center gap-1">
                  {keys.map((k, ki) => (
                    <span key={k} className="flex items-center gap-1">
                      {ki > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/</span>
                      )}
                      <kbd
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 5,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-2)',
                          color: 'var(--text-primary)',
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: 11,
                          lineHeight: '18px',
                          boxShadow: '0 1px 0 var(--border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {k}
                      </kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            className="px-4 py-2 text-xs"
            style={{
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-light)',
              background: 'var(--surface-2)',
            }}
          >
            FreeMind-style navigation · Press F1 to toggle
          </div>
        </div>
      )}
    </>
  );
}
