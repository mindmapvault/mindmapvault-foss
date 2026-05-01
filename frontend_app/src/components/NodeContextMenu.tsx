import { useEffect, useRef } from 'react';

export interface NodeContextMenuProps {
  x: number;
  y: number;
  isRoot: boolean;
  hasChildren: boolean;
  isFolded: boolean;
  onClose: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onRename: () => void;
  onToggleFold: () => void;
  onDelete: () => void;
}

interface MenuAction {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function NodeContextMenu({
  x, y, isRoot, hasChildren, isFolded,
  onClose, onAddChild, onAddSibling, onRename, onToggleFold, onDelete,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp position so menu doesn't go off screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 220;
  const menuH = 260;
  const cx = x + menuW > vw ? vw - menuW - 8 : x;
  const cy = y + menuH > vh ? vh - menuH - 8 : y;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Element)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const groups: (MenuAction | 'sep')[][] = [
    // Group 1: add actions
    [
      {
        label: 'Add child node',
        shortcut: 'Tab',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        ),
        action: () => { onAddChild(); onClose(); },
      },
      ...(!isRoot ? [{
        label: 'Add sibling node',
        shortcut: 'Enter',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5H7m0 0v12m0-12l-3 3m3-3l3 3" />
          </svg>
        ),
        action: () => { onAddSibling(); onClose(); },
      } as MenuAction] : []),
    ],
    // Group 2: edit actions
    [
      {
        label: 'Rename',
        shortcut: 'F2',
        icon: (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        action: () => { onRename(); onClose(); },
      },
      ...(hasChildren ? [{
        label: isFolded ? 'Unfold children' : 'Fold children',
        shortcut: 'Space',
        icon: isFolded ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        ),
        action: () => { onToggleFold(); onClose(); },
      } as MenuAction] : []),
    ],
    // Group 3: delete
    ...(!isRoot ? [[{
      label: 'Delete node',
      shortcut: 'Del',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ),
      action: () => { onDelete(); onClose(); },
      danger: true,
    } as MenuAction]] : []),
  ].filter((g) => g.length > 0);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: cx,
        top: cy,
        zIndex: 2000,
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        minWidth: menuW,
        overflow: 'hidden',
        padding: '4px 0',
        userSelect: 'none',
      }}
    >
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div style={{ height: 1, background: 'var(--border-light)', margin: '3px 0' }} />
          )}
          {group.map((item, i) => {
            if (item === 'sep') return null;
            const mi = item as MenuAction;
            return (
              <button
                key={i}
                onClick={mi.action}
                className="flex w-full items-center gap-3 px-3 py-2 text-sm transition hover:bg-[var(--surface-2)]"
                style={{ color: mi.danger ? '#ef4444' : 'var(--text-primary)' }}
              >
                <span style={{ color: mi.danger ? '#ef4444' : 'var(--text-muted)', flexShrink: 0 }}>
                  {mi.icon}
                </span>
                <span className="flex-1 text-left">{mi.label}</span>
                {mi.shortcut && (
                  <kbd
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--text-muted)',
                      fontFamily: 'ui-monospace, monospace',
                      flexShrink: 0,
                    }}
                  >
                    {mi.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
