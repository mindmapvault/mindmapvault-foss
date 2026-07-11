import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MindMapTree, MindMapTreeNode, UrlEntry } from '../types';
import { useThemeStore } from '../store/theme';
import {
  cloneTree,
  countChecked,
  defaultRoot,
  findNode,
  findNodePath,
  flattenAll,
  flattenTree,
  migrateNode,
  uid,
} from './MindMapHelpers';
import { COLOR_PALETTE, NODE_COLORS, PROGRESS_PRESETS } from './MindMapConstants';
import { ThemePanel } from './ThemePanel';
import type { MindMapEditorProps } from './MindMapEditor.types';

const MOBILE_COLORS = [...NODE_COLORS, ...COLOR_PALETTE.slice(0, 10)].filter(
  (color): color is string => typeof color === 'string',
);

function getBalancedRootSide(root: MindMapTreeNode): 'left' | 'right' {
  let leftCount = 0;
  let rightCount = 0;
  for (const child of root.children) {
    if (child.side === 'left') leftCount += 1;
    else rightCount += 1;
  }
  return leftCount <= rightCount ? 'left' : 'right';
}

function formatProgressLabel(value: number | null | undefined) {
  if (value == null) return 'No progress';
  return `${value}%`;
}

function nodeSummary(node: MindMapTreeNode) {
  const checked = countChecked(node);
  const segments: string[] = [];
  if (node.notes?.trim()) segments.push('notes');
  if (node.attachments?.length) segments.push(`${node.attachments.length} file${node.attachments.length === 1 ? '' : 's'}`);
  if (node.urls?.length) segments.push(`${node.urls.length} link${node.urls.length === 1 ? '' : 's'}`);
  if (checked.total > 0) segments.push(`${checked.checked}/${checked.total} done`);
  if (node.progress != null) segments.push(`${node.progress}%`);
  if (node.startDate || node.endDate) segments.push('dates');
  return segments.join(' · ');
}

export function MobileMindMapEditor({
  initialTree,
  externalNodeAttachments,
  title,
  onSave,
  onTitleChange,
  saving,
  saveMsg,
  error,
  onBack,
  onShowHistory,
  onDownloadEncrypted,
  onDownloadJson,
  versionLabel,
  titleChanged,
  onRenameTitle,
  renamingTitle,
  onTreeChange,
  onSelectionChange,
  onOpenSecurePanel,
  onOpenNodeAttachment,
}: MindMapEditorProps) {
  const autosaveMode = useThemeStore((state) => state.autosaveMode);
  const themeMode = useThemeStore((state) => state.mode);
  const toggleThemeMode = useThemeStore((state) => state.toggleMode);
  const [root, setRoot] = useState<MindMapTreeNode>(() => migrateNode(initialTree?.root ?? defaultRoot()));
  const [selectedId, setSelectedId] = useState('root');
  const [searchQuery, setSearchQuery] = useState('');
  const [urlDraft, setUrlDraft] = useState<UrlEntry>({ url: '', label: '' });
  const [isDirty, setIsDirty] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!initialTree) return;
    const nextRoot = migrateNode(initialTree.root);
    setRoot(nextRoot);
    setSelectedId((currentSelectedId) => (findNode(nextRoot, currentSelectedId) ? currentSelectedId : 'root'));
    setUrlDraft({ url: '', label: '' });
    setIsDirty(false);
    setShowInspector(false);
  }, [initialTree]);

  useEffect(() => {
    if (!onTreeChange) return;
    const tree: MindMapTree = { version: 'tree', root: cloneTree(root) };
    onTreeChange(tree);
  }, [onTreeChange, root]);

  useEffect(() => {
    onSelectionChange?.(selectedId);
  }, [onSelectionChange, selectedId]);

  useEffect(() => {
    setShowInspector(true);
  }, [selectedId]);

  const mutate = useCallback((updater: (draft: MindMapTreeNode) => void) => {
    const draft = cloneTree(root);
    updater(draft);
    setRoot(draft);
    setIsDirty(true);
  }, [root]);

  const getNodeAttachments = useCallback((node: MindMapTreeNode) => {
    const inline = node.attachments ?? [];
    const external = externalNodeAttachments?.[node.id] ?? [];
    if (inline.length === 0) return external;
    if (external.length === 0) return inline;
    const merged = new Map<string, typeof inline[number]>();
    for (const attachment of external) merged.set(attachment.attachment_id, attachment);
    for (const attachment of inline) merged.set(attachment.attachment_id, { ...merged.get(attachment.attachment_id), ...attachment });
    return Array.from(merged.values()).sort((left, right) => right.uploaded_at.localeCompare(left.uploaded_at));
  }, [externalNodeAttachments]);

  const selectedNode = useMemo(() => findNode(root, selectedId)?.node ?? root, [root, selectedId]);
  const selectedPath = useMemo(() => findNodePath(root, selectedId), [root, selectedId]);
  const selectedPathIds = useMemo(() => new Set(selectedPath.map((node) => node.id)), [selectedPath]);
  const treeNodes = useMemo(() => flattenTree(root), [root]);
  const childCount = selectedNode.children.length;
  const selectedDepth = Math.max(0, selectedPath.length - 1);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return flattenAll(root).filter((node) => {
      return node.text.toLowerCase().includes(query) || (node.notes ?? '').toLowerCase().includes(query);
    });
  }, [root, searchQuery]);

  const expandPathToNode = useCallback((nodeId: string) => {
    mutate((draft) => {
      const expandParents = (node: MindMapTreeNode): boolean => {
        if (node.id === nodeId) return true;
        for (const child of node.children) {
          if (expandParents(child)) {
            node.collapsed = false;
            return true;
          }
        }
        return false;
      };
      expandParents(draft);
    });
    setSelectedId(nodeId);
  }, [mutate]);

  const updateNode = useCallback((nodeId: string, updater: (node: MindMapTreeNode, parent: MindMapTreeNode | null, index: number) => void) => {
    mutate((draft) => {
      const found = findNode(draft, nodeId);
      if (!found) return;
      updater(found.node, found.parent, found.index);
    });
  }, [mutate]);

  const addChild = useCallback((parentId: string) => {
    const newId = uid();
    mutate((draft) => {
      const found = findNode(draft, parentId);
      if (!found) return;
      const node: MindMapTreeNode = {
        id: newId,
        text: 'New node',
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
        ...(parentId === 'root' ? { side: getBalancedRootSide(draft) } : {}),
      };
      found.node.children.push(node);
      found.node.collapsed = false;
    });
    setSelectedId(newId);
  }, [mutate]);

  const addSibling = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    const newId = uid();
    mutate((draft) => {
      const found = findNode(draft, nodeId);
      if (!found?.parent) return;
      found.parent.children.splice(found.index + 1, 0, {
        id: newId,
        text: 'New node',
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
        ...(found.parent.id === 'root' ? { side: found.node.side ?? 'right' } : {}),
      });
    });
    setSelectedId(newId);
  }, [mutate]);

  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    let fallbackId = 'root';
    mutate((draft) => {
      const found = findNode(draft, nodeId);
      if (!found?.parent) return;
      fallbackId = found.parent.id;
      found.parent.children.splice(found.index, 1);
    });
    setSelectedId(fallbackId);
  }, [mutate]);

  const handleSave = useCallback(() => {
    if (saving) return;
    void onSave({ version: 'tree', root: cloneTree(root) }, title);
    setIsDirty(false);
  }, [onSave, root, saving, title]);

  const buildExportFileBaseName = useCallback((baseTitle?: string) => {
    const normalizedTitle = (baseTitle || title || 'vault').trim();
    const safeTitle = normalizedTitle
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const versionMatch = (versionLabel ?? '').match(/v\s*(\d+)/i);
    const versionToken = versionMatch ? `v${versionMatch[1]}` : null;
    return versionToken ? `${safeTitle}-${versionToken}` : safeTitle;
  }, [title, versionLabel]);

  const toggleSelectedCollapse = useCallback(() => {
    if (selectedNode.children.length === 0) return;
    updateNode(selectedNode.id, (draftNode) => {
      draftNode.collapsed = !draftNode.collapsed;
    });
  }, [selectedNode, updateNode]);

  const selectParentNode = useCallback(() => {
    if (selectedPath.length < 2) return;
    setSelectedId(selectedPath[selectedPath.length - 2].id);
  }, [selectedPath]);

  useEffect(() => {
    const hasUnsavedChanges = isDirty || !!titleChanged;
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    if (autosaveInterval.current) {
      clearInterval(autosaveInterval.current);
      autosaveInterval.current = null;
    }
    if (!hasUnsavedChanges || saving || autosaveMode === 'never') return undefined;

    if (autosaveMode === 'change') {
      autosaveTimer.current = setTimeout(handleSave, 1000);
      return () => {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      };
    }

    const intervalMs = autosaveMode === '30s' ? 30_000 : 5 * 60_000;
    autosaveInterval.current = setInterval(() => {
      if (isDirty || titleChanged) handleSave();
    }, intervalMs);

    return () => {
      if (autosaveInterval.current) clearInterval(autosaveInterval.current);
    };
  }, [autosaveMode, handleSave, isDirty, saving, titleChanged]);

  const inspectorContent = (
    <div className="rounded-[28px] border border-[var(--border-muted)] bg-[var(--bg-secondary)]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Selected node</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{selectedNode.text || 'Untitled node'}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
            <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1.5">Depth {selectedDepth}</span>
            <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1.5">{childCount} child{childCount === 1 ? '' : 'ren'}</span>
            <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1.5">{formatProgressLabel(selectedNode.progress)}</span>
          </div>
        </div>
        {selectedNode.id !== 'root' && (
          <button
            type="button"
            onClick={() => deleteNode(selectedNode.id)}
            className="rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-300"
          >
            Delete
          </button>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Branch</p>
            {selectedPath.length > 1 && (
              <button
                type="button"
                onClick={selectParentNode}
                className="rounded-full border border-[var(--border-muted)] px-3 py-1 text-xs text-[var(--text-primary)]"
              >
                Up one level
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {selectedPath.map((node, index) => {
              const active = node.id === selectedNode.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${active ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border-muted)] bg-[var(--bg-primary)] text-[var(--text-primary)]'}`}
                >
                  {index === 0 ? 'Root' : node.text || 'Untitled'}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Quick actions</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => addChild(selectedNode.id)} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
                Add child
              </button>
              {selectedNode.id !== 'root' && (
                <button type="button" onClick={() => addSibling(selectedNode.id)} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
                  Add sibling
                </button>
              )}
              {selectedNode.children.length > 0 && (
                <button type="button" onClick={toggleSelectedCollapse} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5 text-xs text-[var(--text-primary)]">
                  {selectedNode.collapsed ? 'Expand branch' : 'Collapse branch'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Children</p>
            <span className="text-xs text-[var(--text-muted)]">Tap to navigate</span>
          </div>
          {selectedNode.children.length > 0 ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {selectedNode.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedId(child.id)}
                  className="shrink-0 rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-3 py-2 text-left text-xs text-[var(--text-primary)]"
                >
                  <div className="font-medium">{child.text || 'Untitled node'}</div>
                  <div className="mt-1 text-[var(--text-muted)]">{child.children.length} child{child.children.length === 1 ? '' : 'ren'}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-2xl border border-dashed border-[var(--border-muted)] px-4 py-3 text-sm text-[var(--text-muted)]">
              No children yet. Add one to keep the branch growing.
            </div>
          )}
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">Label</span>
          <textarea
            value={selectedNode.text}
            onChange={(event) => updateNode(selectedNode.id, (draftNode) => {
              draftNode.text = event.target.value;
            })}
            rows={3}
            className="w-full rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Progress</span>
            <select
              value={selectedNode.progress == null ? 'none' : String(selectedNode.progress)}
              onChange={(event) => updateNode(selectedNode.id, (draftNode) => {
                draftNode.progress = event.target.value === 'none' ? null : Number(event.target.value);
              })}
              className="w-full rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="none">No progress</option>
              {PROGRESS_PRESETS.map((value) => (
                <option key={value} value={value}>{value}%</option>
              ))}
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Checkbox</span>
            <select
              value={selectedNode.checked == null ? 'none' : selectedNode.checked ? 'checked' : 'unchecked'}
              onChange={(event) => updateNode(selectedNode.id, (draftNode) => {
                if (event.target.value === 'none') draftNode.checked = null;
                else draftNode.checked = event.target.value === 'checked';
              })}
              className="w-full rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="none">No checkbox</option>
              <option value="unchecked">Unchecked</option>
              <option value="checked">Checked</option>
            </select>
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Color</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => updateNode(selectedNode.id, (draftNode) => {
                draftNode.color = null;
              })}
              className={`rounded-full border px-3 py-1.5 text-xs ${selectedNode.color == null ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-[var(--border-muted)] text-[var(--text-muted)]'}`}
            >
              Default
            </button>
            {MOBILE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => updateNode(selectedNode.id, (draftNode) => {
                  draftNode.color = color;
                })}
                className={`h-10 w-10 rounded-full border ${selectedNode.color === color ? 'border-white' : 'border-white/15'}`}
                style={{ backgroundColor: color }}
                aria-label={`Set node color ${color}`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[var(--text-primary)]">Notes</span>
            {getNodeAttachments(selectedNode).length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 11-2.82-2.82l8.48-8.48" />
                </svg>
                {getNodeAttachments(selectedNode).length} file{getNodeAttachments(selectedNode).length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <textarea
            value={selectedNode.notes ?? ''}
            onChange={(event) => updateNode(selectedNode.id, (draftNode) => {
              draftNode.notes = event.target.value;
            })}
            rows={6}
            placeholder="Notes, prompts, context"
            className="w-full rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
          />
          {getNodeAttachments(selectedNode).length > 0 && (
            <div className="space-y-2">
              {getNodeAttachments(selectedNode).map((attachment) => (
                <button
                  key={attachment.attachment_id}
                  type="button"
                  onClick={() => { void onOpenNodeAttachment?.(attachment); }}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text-primary)]">{attachment.name}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">{Math.max(1, Math.round(attachment.size_bytes / 1024))} KB</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
                    Open
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">Start date</span>
            <input
              type="datetime-local"
              value={selectedNode.startDate ?? ''}
              onChange={(event) => updateNode(selectedNode.id, (draftNode) => {
                draftNode.startDate = event.target.value || null;
              })}
              className="w-full rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">End date</span>
            <input
              type="datetime-local"
              value={selectedNode.endDate ?? ''}
              onChange={(event) => updateNode(selectedNode.id, (draftNode) => {
                draftNode.endDate = event.target.value || null;
              })}
              className="w-full rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">Links</p>
            <span className="text-xs text-[var(--text-muted)]">{selectedNode.urls?.length ?? 0} attached</span>
          </div>
          <div className="mt-2 space-y-2">
            {(selectedNode.urls ?? []).map((entry, index) => (
              <div key={`${entry.url}-${index}`} className="flex items-center gap-2 rounded-2xl border border-[var(--border-muted)] px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[var(--text-primary)]">{entry.label || entry.url}</p>
                  {entry.label && <p className="truncate text-xs text-[var(--text-muted)]">{entry.url}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => updateNode(selectedNode.id, (draftNode) => {
                    draftNode.urls?.splice(index, 1);
                  })}
                  className="rounded-full border border-red-500/30 px-3 py-1 text-xs text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto]">
            <input
              type="url"
              value={urlDraft.url}
              onChange={(event) => setUrlDraft((draft) => ({ ...draft, url: event.target.value }))}
              placeholder="https://example.com"
              className="rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            />
            <input
              value={urlDraft.label}
              onChange={(event) => setUrlDraft((draft) => ({ ...draft, label: event.target.value }))}
              placeholder="Optional label"
              className="rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-primary)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              disabled={!urlDraft.url.trim()}
              onClick={() => {
                if (!urlDraft.url.trim()) return;
                updateNode(selectedNode.id, (draftNode) => {
                  if (!draftNode.urls) draftNode.urls = [];
                  draftNode.urls.push({ url: urlDraft.url.trim(), label: urlDraft.label.trim() });
                });
                setUrlDraft({ url: '', label: '' });
              }}
              className="rounded-2xl border border-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="sticky top-0 z-20 border-b border-[var(--border-muted)] bg-[var(--bg-primary)]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-muted)] bg-[var(--bg-secondary)] text-[var(--text-primary)]"
              aria-label="Back to vaults"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Untitled"
            className="min-w-0 flex-1 rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-4 py-2.5 text-base outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (!isDirty && !error)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          {onRenameTitle && titleChanged && (
            <button
              type="button"
              onClick={onRenameTitle}
              disabled={renamingTitle}
              className="rounded-full border border-[var(--border-muted)] px-3 py-1.5 text-[var(--text-primary)]"
            >
              {renamingTitle ? 'Renaming' : 'Rename title'}
            </button>
          )}
          {onShowHistory && (
            <button type="button" onClick={onShowHistory} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5">
              History
            </button>
          )}
          {onDownloadEncrypted && (
            <button type="button" onClick={() => onDownloadEncrypted(buildExportFileBaseName())} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5">
              Download .crypt
            </button>
          )}
          {onDownloadJson && (
            <button
              type="button"
              onClick={() => onDownloadJson({ version: 'tree', root: cloneTree(root) }, buildExportFileBaseName(title))}
              className="rounded-full border border-[var(--border-muted)] px-3 py-1.5"
            >
              Export JSON
            </button>
          )}
          {onOpenSecurePanel && (
            <button type="button" onClick={() => onOpenSecurePanel('attachments')} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5">
              Attachments
            </button>
          )}
          {onOpenSecurePanel && (
            <button type="button" onClick={() => onOpenSecurePanel('shares')} className="rounded-full border border-[var(--border-muted)] px-3 py-1.5">
              Shares
            </button>
          )}
          <button
            type="button"
            onClick={toggleThemeMode}
            title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-full border border-[var(--border-muted)] p-2"
          >
            {themeMode === 'dark' ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <ThemePanel />
          <span className="ml-auto rounded-full bg-[var(--bg-secondary)] px-3 py-1.5">{flattenAll(root).length} nodes</span>
        </div>
        {(saveMsg || error) && (
          <div className={`mt-3 rounded-2xl px-3 py-2 text-sm ${error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
            {error || saveMsg}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search nodes or notes"
            className="min-w-0 flex-1 rounded-2xl border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="rounded-2xl border border-[var(--border-muted)] px-3 text-sm">
              Clear
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {searchResults.slice(0, 10).map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => expandPathToNode(node.id)}
                className="shrink-0 rounded-full border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-3 py-1 text-xs text-[var(--accent)]"
              >
                {node.text || 'Untitled node'}
              </button>
            ))}
          </div>
        )}
        {selectedPath.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {selectedPath.map((node, index) => (
              <button
                key={node.id}
                type="button"
                onClick={() => setSelectedId(node.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${node.id === selectedNode.id ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border-muted)] bg-[var(--bg-secondary)] text-[var(--text-primary)]'}`}
              >
                {index === 0 ? 'Root' : node.text || 'Untitled'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.85fr)] lg:grid-rows-1">
        <div className="min-h-0 overflow-y-auto border-b border-[var(--border-muted)] px-3 py-4 pb-32 lg:border-b-0 lg:border-r lg:pb-4">
          <div className="space-y-2">
            {treeNodes.map(({ node, depth }) => {
              const isSelected = node.id === selectedId;
              const isInSelectedPath = selectedPathIds.has(node.id);
              const summary = nodeSummary(node);
              return (
                <div
                  key={node.id}
                  style={{ marginLeft: `${depth * 14}px` }}
                  className={`rounded-3xl border p-3 transition ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10' : isInSelectedPath ? 'border-[var(--accent)]/25 bg-[var(--accent)]/5' : 'border-[var(--border-muted)] bg-[var(--bg-secondary)]/70'}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedId(node.id);
                        }
                      }}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)]">
                          {depth}
                        </span>
                        {node.children.length > 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              updateNode(node.id, (draftNode) => {
                                draftNode.collapsed = !draftNode.collapsed;
                              });
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-muted)] text-[var(--text-muted)]"
                            aria-label={node.collapsed ? 'Expand node' : 'Collapse node'}
                          >
                            {node.collapsed ? '+' : '−'}
                          </button>
                        )}
                        <div
                          className="h-3 w-3 rounded-full border border-white/15"
                          style={{ backgroundColor: node.color ?? 'var(--border-muted)' }}
                        />
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{node.text || 'Untitled node'}</p>
                        {getNodeAttachments(node).length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-2 py-1 text-[10px] font-semibold text-[var(--accent)]">
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 11-2.82-2.82l8.48-8.48" />
                            </svg>
                            {getNodeAttachments(node).length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                        {node.checked != null && <span>{node.checked ? 'Checked' : 'Unchecked'}</span>}
                        <span>{formatProgressLabel(node.progress)}</span>
                        <span>{node.children.length} child{node.children.length === 1 ? '' : 'ren'}</span>
                        {summary && <span>{summary}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" onClick={() => addChild(node.id)} className="rounded-full border border-[var(--border-muted)] px-2 py-1 text-xs">
                        Child
                      </button>
                      {node.id !== 'root' && (
                        <button type="button" onClick={() => addSibling(node.id)} className="rounded-full border border-[var(--border-muted)] px-2 py-1 text-xs">
                          Sibling
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden min-h-0 overflow-y-auto px-4 py-4 lg:block">{inspectorContent}</div>
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-20 z-30 lg:hidden">
        <div className="pointer-events-auto flex items-center gap-2 rounded-[26px] border border-white/10 bg-slate-950/88 p-2 text-white shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => setShowInspector(true)}
            className="min-w-0 flex-1 rounded-[20px] bg-white/8 px-4 py-3 text-left"
          >
            <div className="truncate text-sm font-semibold">{selectedNode.text || 'Untitled node'}</div>
            <div className="mt-1 truncate text-xs text-white/70">{childCount} children · {formatProgressLabel(selectedNode.progress)}</div>
          </button>
          <button type="button" onClick={() => addChild(selectedNode.id)} className="rounded-[18px] border border-white/10 px-3 py-3 text-xs font-medium text-white">
            Child
          </button>
          {selectedNode.id !== 'root' && (
            <button type="button" onClick={() => addSibling(selectedNode.id)} className="rounded-[18px] border border-white/10 px-3 py-3 text-xs font-medium text-white">
              Sibling
            </button>
          )}
          {selectedNode.children.length > 0 && (
            <button type="button" onClick={toggleSelectedCollapse} className="rounded-[18px] border border-white/10 px-3 py-3 text-xs font-medium text-white">
              {selectedNode.collapsed ? 'Open' : 'Fold'}
            </button>
          )}
        </div>
      </div>

      {showInspector && (
        <div className="absolute inset-0 z-40 flex items-end bg-black/45 lg:hidden">
          <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-[30px] border-t border-white/10 bg-[var(--bg-primary)] px-4 pb-8 pt-3 shadow-[0_-24px_80px_rgba(0,0,0,0.35)]">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Inspector</p>
                <p className="text-sm text-[var(--text-muted)]">Edit the selected branch without leaving the list.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowInspector(false)}
                className="rounded-full border border-[var(--border-muted)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                Close
              </button>
            </div>
            {inspectorContent}
          </div>
        </div>
      )}
    </div>
  );
}
