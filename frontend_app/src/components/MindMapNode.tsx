import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

export interface MindNodeData extends Record<string, unknown> {
  label: string;
  isRoot?: boolean;
  depth?: number;
  folded?: boolean;
  hasChildren?: boolean;
  forceEdit?: boolean;
  /** called when the user finishes editing the label */
  onLabelChange?: (id: string, label: string) => void;
  /** called to add a child */
  onAddChild?: (id: string) => void;
  /** called to delete this node */
  onDelete?: (id: string) => void;
  /** called to fold/unfold this node's children */
  onFold?: (id: string) => void;
  /** called once the node has consumed the forceEdit flag */
  onForceEditConsumed?: (id: string) => void;
}

export type MindNode = Node<MindNodeData>;

// depth → background colour (cycles every 6 levels)
const DEPTH_COLORS = [
  'var(--accent)',      // root
  '#0ea5e9',           // depth 1  sky
  '#22c55e',           // depth 2  green
  '#f59e0b',           // depth 3  amber
  '#ec4899',           // depth 4  pink
  '#8b5cf6',           // depth 5  violet
];

export function MindMapNode({ data, id, selected }: NodeProps<MindNode>) {
  const {
    label, isRoot, depth = 0,
    folded, hasChildren,
    onLabelChange, onAddChild, onDelete, onFold, onForceEditConsumed,
  } = data;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync label in when data changes externally
  useEffect(() => { setDraft(label); }, [label]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Respond to programmatic edit trigger (F2 / context menu Rename)
  useEffect(() => {
    if (data.forceEdit) {
      setEditing(true);
      onForceEditConsumed?.(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.forceEdit]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim() || label;
    setDraft(trimmed);
    onLabelChange?.(id, trimmed);
  };

  const color = DEPTH_COLORS[depth % DEPTH_COLORS.length];

  if (isRoot) {
    return (
      <div
        onDoubleClick={() => setEditing(true)}
        className="mind-root"
        style={{
          background: color,
          minWidth: 100,
          maxWidth: 220,
          borderRadius: 999,
          padding: '10px 22px',
          fontWeight: 700,
          fontSize: 15,
          color: '#fff',
          textAlign: 'center',
          boxShadow: selected ? `0 0 0 3px #fff4` : `0 4px 18px ${color}66`,
          cursor: 'pointer',
          userSelect: 'none',
          outline: selected ? `2px solid ${color}` : 'none',
          outlineOffset: 3,
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(label); setEditing(false); }
              e.stopPropagation();
            }}
            className="bg-transparent text-center text-white outline-none w-full"
            style={{ minWidth: 60 }}
          />
        ) : (
          label
        )}
        {/* handles on all sides so children can fan out */}
        <Handle type="source" position={Position.Left}  id="left"  style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Top}   id="top"   style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0 }} />
        {/* Fold indicator — only shown when node has children */}
        {hasChildren && (
          <button
            title={folded ? 'Unfold (Space)' : 'Fold (Space)'}
            onMouseDown={(e) => { e.stopPropagation(); onFold?.(id); }}
            style={{
              position: 'absolute',
              bottom: -12,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: folded ? color : 'transparent',
              border: `2px solid ${color}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              lineHeight: 1,
              fontSize: 9,
              color: folded ? '#fff' : color,
              transition: 'all 0.15s',
            }}
          >
            {folded ? '+' : '−'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      className="mind-node group"
      style={{
        background: 'var(--surface-1)',
        borderBottom: `2.5px solid ${color}`,
        borderRadius: 6,
        padding: '5px 12px',
        minWidth: 70,
        maxWidth: 200,
        fontSize: 13,
        color: 'var(--text-primary)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: selected
          ? `0 0 0 2px ${color}, 0 2px 8px #0004`
          : '0 2px 6px #0002',
        position: 'relative',
      }}
    >
      {/* target handle — where the edge from parent arrives */}
      <Handle type="target" position={Position.Left}  id="left"  style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Right} id="right" style={{ opacity: 0 }} />

      {/* source handles — outgoing edges to children */}
      <Handle type="source" position={Position.Left}  id="left-src"  style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="right-src" style={{ opacity: 0 }} />

      {/* Fold indicator */}
      {hasChildren && (
        <button
          title={folded ? 'Unfold (Space)' : 'Fold (Space)'}
          onMouseDown={(e) => { e.stopPropagation(); onFold?.(id); }}
          style={{
            position: 'absolute',
            right: -10,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: folded ? color : 'transparent',
            border: `2px solid ${color}`,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            fontSize: 9,
            lineHeight: 1,
            color: folded ? '#fff' : color,
            transition: 'all 0.15s',
            zIndex: 10,
          }}
        >
          {folded ? '+' : '−'}
        </button>
      )}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setDraft(label); setEditing(false); }
            e.stopPropagation();
          }}
          className="bg-transparent outline-none w-full"
          style={{ color: 'var(--text-primary)', minWidth: 50 }}
        />
      ) : (
        <span>{label}</span>
      )}

      {/* Hover action buttons */}
      <div
        className="mind-actions"
        style={{
          position: 'absolute',
          top: -10,
          right: -6,
          display: 'flex',
          gap: 2,
          opacity: 0,
          transition: 'opacity 0.15s',
          pointerEvents: 'none',
        }}
      >
        <button
          onMouseDown={(e) => { e.stopPropagation(); onAddChild?.(id); }}
          title="Add child (Tab)"
          style={{
            background: color,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            width: 18,
            height: 18,
            fontSize: 12,
            lineHeight: '18px',
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
        >+</button>
        <button
          onMouseDown={(e) => { e.stopPropagation(); onDelete?.(id); }}
          title="Delete (Del)"
          style={{
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            width: 18,
            height: 18,
            fontSize: 11,
            lineHeight: '18px',
            cursor: 'pointer',
            pointerEvents: 'all',
          }}
        >×</button>
      </div>
    </div>
  );
}
