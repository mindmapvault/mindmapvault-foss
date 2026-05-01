/**
 * MindMapEditor — full-featured SVG mind map editor.
 *
 * Ported features from the dashboard (minus PVS entity links and sharing):
 * • Checkboxes (tri-state: null / false / true)           C key
 * • Progress pie (inline 32 px diameter)                    P key
 * • Drag-and-drop (free-drag + reparent)
 * • Left / right child layout from root                     Shift+Tab
 * • Extended 54-swatch colour palette
 * • Date planning (start / end)                             D key
 * • Custom URLs per node                                    U key
 * • Move up / down siblings
 * • Duplicate node
 * • Search bar                                              Ctrl+F
 * • Reset node position                                     R key
 * • All existing features preserved
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { MindMapTree, MindMapTreeNode, NodeAttachmentRef, UrlEntry } from '../types';
import { useThemeStore } from '../store/theme';
import { ThemePanel } from './ThemePanel';
import { MindMapColorPicker } from './MindMapColorPicker';
import { MindMapDateDialog } from './MindMapDateDialog';
import { MindMapNotesDialog } from './MindMapNotesDialog';
import { useUserLabels } from '../hooks/useUserLabels';
import type { MindMapEditorProps } from './MindMapEditor.types';
import {
  NODE_COLORS,
  COLOR_PALETTE,
  PROGRESS_PRESETS,
  CHECKBOX_SIZE,
  PROGRESS_PIE_SIZE,
  NODE_LINE_H,
  NODE_PAD_X,
  LINK_STRIP_H,
  TAG_STRIP_H,
  TOP_META_STRIP_H,
} from './MindMapConstants';
import {
  uid,
  cloneTree,
  findNode,
  isDescendant,
  countChecked,
  flattenTree,
  flattenAll,
  defaultRoot,
  migrateNode,
} from './MindMapHelpers';
import { layoutTree, bezierPath } from './MindMapLayout';
import { appendAttachmentMarkdownLinks, getVisibleNodeTextLines } from '../utils/nodeAttachments';
import { exportSvgAsPdf, renderSvgToCanvas } from '../utils/pdfExport';
import { downloadBlob, downloadDataUrl } from '../utils/download';
import './MindMapEditor.css';

// ── Drag state ────────────────────────────────────────────────────────────────
interface DragState {
  nodeId: string;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
  currentX: number;
  currentY: number;
  moved: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DesktopMindMapEditor({
  initialTree, externalNodeAttachments, title, onSave, onTitleChange, saving, saveMsg, error, onBack,
  onExportMarkdown, titleChanged, onRenameTitle, renamingTitle,
  versionLabel, versionTooltip,
  onTreeChange, onSelectionChange, onNodeFileDrop, onOpenNodeAttachment,
  onDeleteNodeAttachment,
  onLoadNodeAttachmentPreview,
}: MindMapEditorProps) {
  const autosaveMode = useThemeStore((s) => s.autosaveMode);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [root, setRoot] = useState<MindMapTreeNode>(() =>
    migrateNode(initialTree?.root ?? defaultRoot()),
  );
  const [selectedId, setSelectedId] = useState<string>(() => initialTree?.view_state?.selected_node_id ?? 'root');
  const [multiSelect, setMultiSelect] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // ── Rectangle selection ────────────────────────────────────────────────
  const [rectSel, setRectSel] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);

  // ── Notes ──────────────────────────────────────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [hoveredNoteNodeId, setHoveredNoteNodeId] = useState<string | null>(null);
  const [hoveringNotePopup, setHoveringNotePopup] = useState(false);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const [notesDropActive, setNotesDropActive] = useState(false);
  const [notesUploadBusy, setNotesUploadBusy] = useState(false);

  // ── View ───────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(() => {
    const raw = initialTree?.view_state?.zoom;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
    return Math.min(3, Math.max(0.3, raw));
  });
  const [pan, setPan] = useState(() => {
    const panX = initialTree?.view_state?.pan_x;
    const panY = initialTree?.view_state?.pan_y;
    return {
      x: typeof panX === 'number' && Number.isFinite(panX) ? panX : 160,
      y: typeof panY === 'number' && Number.isFinite(panY) ? panY : 300,
    };
  });
  const isPanning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });

  // ── UI toggles ─────────────────────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [shortcutsPos, setShortcutsPos] = useState<{ x: number; y: number } | null>(null);
  const scDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [showUrlDialog, setShowUrlDialog] = useState(false);
  const [rootLeftCollapsed, setRootLeftCollapsed] = useState(false);
  const [rootRightCollapsed, setRootRightCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(() => Boolean(initialTree?.view_state?.focus_mode));
  const [focusAnchorId, setFocusAnchorId] = useState<string | null>(() => initialTree?.view_state?.focus_anchor_id ?? null);
  const [urlDraft, setUrlDraft] = useState<UrlEntry>({ url: '', label: '' });

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Export menu ────────────────────────────────────────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false);

  // ── Tag dialog ─────────────────────────────────────────────────────────────
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');
  const [tagInputColor, setTagInputColor] = useState('#7c3aed');
  const {
    labels: userLabels,
    addLabel: addUserLabel,
    removeLabel: removeUserLabel,
    updateLabelColor,
  } = useUserLabels();

  // ── Context menu ───────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [fileDropBusyNodeId, setFileDropBusyNodeId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const hoverPopupCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPopupRef = useRef<HTMLDivElement>(null);
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<Record<string, string>>({});
  const attachmentPreviewUrlsRef = useRef<Record<string, string>>({});
  const attachmentPreviewPending = useRef<Set<string>>(new Set());
  const attachmentPreviewFailed = useRef<Set<string>>(new Set());
  const attachmentById = useMemo(() => {
    const map = new Map<string, NodeAttachmentRef>();
    for (const node of flattenAll(root)) {
      for (const attachment of node.attachments ?? []) {
        map.set(attachment.attachment_id, attachment);
      }
    }
    for (const refs of Object.values(externalNodeAttachments ?? {})) {
      for (const attachment of refs) {
        map.set(attachment.attachment_id, {
          ...map.get(attachment.attachment_id),
          ...attachment,
        });
      }
    }
    return map;
  }, [externalNodeAttachments, root]);
  const renderNotesPreviewHtml = useCallback((markdown: string) => {
    const attachmentMap = attachmentById;
    const attachmentByName = new Map<string, NodeAttachmentRef>();
    for (const attachment of attachmentMap.values()) {
      const key = (attachment.name ?? '').trim().toLowerCase();
      if (!key) continue;
      const existing = attachmentByName.get(key);
      if (!existing || existing.uploaded_at < attachment.uploaded_at) {
        attachmentByName.set(key, attachment);
      }
    }

    const resolveAttachment = (attachmentId: string, fallbackLabel?: string): NodeAttachmentRef | undefined => {
      const direct = attachmentMap.get(attachmentId);
      if (direct) return direct;
      const normalizedFallback = (fallbackLabel ?? '')
        .replace(/^Attachment:\s*/i, '')
        .trim()
        .toLowerCase();
      if (!normalizedFallback) return undefined;
      return attachmentByName.get(normalizedFallback);
    };

    const isImageAttachment = (attachment: NodeAttachmentRef | undefined): boolean => {
      if (!attachment) return false;
      return attachment.preview_kind === 'image'
        || (attachment.preview_content_type ?? '').startsWith('image/')
        || (attachment.content_type ?? '').startsWith('image/');
    };
    const raw = marked.parse(markdown, { async: false }) as string;
    const container = document.createElement('div');
    container.innerHTML = raw;
    const anchors = container.querySelectorAll<HTMLAnchorElement>('a[href^="attachment://"]');
    anchors.forEach((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      const attachmentId = href.replace(/^attachment:\/\//, '');
      const attachment = resolveAttachment(attachmentId, anchor.textContent ?? undefined);
      if (attachment && attachment.attachment_id !== attachmentId) {
        anchor.setAttribute('href', `attachment://${attachment.attachment_id}`);
      }
      const previewUrl = attachment ? attachmentPreviewUrls[attachment.attachment_id] : undefined;
      if (isImageAttachment(attachment) && previewUrl) {
        const wrap = document.createElement('div');
        wrap.className = 'mm-notes-inline-image-wrap';
        const img = document.createElement('img');
        img.className = 'mm-notes-inline-image';
        img.src = previewUrl;
        img.alt = attachment?.name || attachmentId;
        wrap.appendChild(img);
        anchor.replaceWith(wrap);
        return;
      }
      anchor.classList.add('mm-notes-attachment-link');
      if (!attachment) {
        anchor.classList.add('is-missing');
      }
    });
    const images = container.querySelectorAll<HTMLImageElement>('img[src^="attachment://"]');
    images.forEach((image) => {
      const src = image.getAttribute('src') ?? '';
      const attachmentId = src.replace(/^attachment:\/\//, '');
      const attachment = resolveAttachment(attachmentId, image.getAttribute('alt') ?? undefined);
      if (attachment && attachment.attachment_id !== attachmentId) {
        image.setAttribute('src', `attachment://${attachment.attachment_id}`);
      }
      const previewUrl = attachment ? attachmentPreviewUrls[attachment.attachment_id] : undefined;
      if (isImageAttachment(attachment) && previewUrl) {
        image.classList.add('mm-notes-inline-image');
        image.src = previewUrl;
        return;
      }
      const fallback = document.createElement('div');
      fallback.className = 'mm-notes-inline-image-fallback';
      fallback.textContent = attachment?.name ? `Image preview unavailable: ${attachment.name}` : 'Image preview unavailable';
      image.replaceWith(fallback);
    });
    return DOMPurify.sanitize(container.innerHTML, {
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|data|attachment):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });
  }, [attachmentById, attachmentPreviewUrls]);

  const notesPreviewHtml = useMemo(() => renderNotesPreviewHtml(notesText), [notesText, renderNotesPreviewHtml]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [shortcutToast, setShortcutToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((label: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setShortcutToast(label);
    toastTimer.current = setTimeout(() => setShortcutToast(null), 1600);
  }, []);

  // ── History (undo/redo) ────────────────────────────────────────────────────
  const historyRef = useRef<MindMapTreeNode[]>([migrateNode(initialTree?.root ?? defaultRoot())]);
  const historyIdxRef = useRef(0);
  const [history, setHistoryState] = useState<MindMapTreeNode[]>(() => historyRef.current);
  const [historyIdx, setHistoryIdx] = useState(0);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const notesAttachmentInputRef = useRef<HTMLInputElement>(null);
  const nodeAttachmentInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sync initialTree ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialTree) return;
    const r = migrateNode(initialTree.root);
    const savedView = initialTree.view_state;
    const savedSelectedId = savedView?.selected_node_id;
    const nextSelectedId = savedSelectedId && findNode(r, savedSelectedId) ? savedSelectedId : 'root';
    const savedFocusAnchor = savedView?.focus_anchor_id;
    const nextFocusAnchor = savedFocusAnchor && findNode(r, savedFocusAnchor) ? savedFocusAnchor : null;

    setRoot(r);
    setRootLeftCollapsed(false);
    setRootRightCollapsed(false);
    historyRef.current = [cloneTree(r)];
    historyIdxRef.current = 0;
    setHistoryState([cloneTree(r)]);
    setHistoryIdx(0);
    setSelectedId(nextSelectedId);
    const nextPanX = typeof savedView?.pan_x === 'number' && Number.isFinite(savedView.pan_x) ? savedView.pan_x : 160;
    const nextPanY = typeof savedView?.pan_y === 'number' && Number.isFinite(savedView.pan_y) ? savedView.pan_y : 300;
    const nextZoom = typeof savedView?.zoom === 'number' && Number.isFinite(savedView.zoom)
      ? Math.min(3, Math.max(0.3, savedView.zoom))
      : 1;
    setPan({ x: nextPanX, y: nextPanY });
    setZoom(nextZoom);
    setFocusMode(Boolean(savedView?.focus_mode));
    setFocusAnchorId(nextFocusAnchor);
    setIsDirty(false);
  }, [initialTree]);

  useEffect(() => {
    if (!onTreeChange) return;
    const tree: MindMapTree = {
      version: 'tree',
      root: cloneTree(root),
      view_state: {
        pan_x: Math.round(pan.x),
        pan_y: Math.round(pan.y),
        zoom: Number(zoom.toFixed(3)),
        focus_mode: focusMode,
        focus_anchor_id: focusAnchorId,
        selected_node_id: selectedId,
      },
    };
    onTreeChange(tree);
  }, [onTreeChange, root]);

  useEffect(() => {
    onSelectionChange?.(selectedId);
  }, [onSelectionChange, selectedId]);

  useEffect(() => {
    attachmentPreviewUrlsRef.current = attachmentPreviewUrls;
  }, [attachmentPreviewUrls]);

  useEffect(() => () => {
    Object.values(attachmentPreviewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    if (hoverPopupCloseTimerRef.current) {
      clearTimeout(hoverPopupCloseTimerRef.current);
    }
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const layout = useMemo(() => layoutTree(root), [root]);

  const loadAttachmentPreview = useCallback(async (attachment: NodeAttachmentRef) => {
    if (!attachment.preview_attachment_id || !onLoadNodeAttachmentPreview) return;
    if (attachmentPreviewUrlsRef.current[attachment.attachment_id]) return;
    if (attachmentPreviewPending.current.has(attachment.attachment_id)) return;
    if (attachmentPreviewFailed.current.has(attachment.attachment_id)) return;

    attachmentPreviewPending.current.add(attachment.attachment_id);
    try {
      const previewUrl = await onLoadNodeAttachmentPreview(attachment);
      if (!previewUrl) {
        attachmentPreviewFailed.current.add(attachment.attachment_id);
        return;
      }
      setAttachmentPreviewUrls((current) => {
        if (current[attachment.attachment_id] === previewUrl) return current;
        return { ...current, [attachment.attachment_id]: previewUrl };
      });
    } finally {
      attachmentPreviewPending.current.delete(attachment.attachment_id);
    }
  }, [onLoadNodeAttachmentPreview]);

  useEffect(() => {
    if (!onLoadNodeAttachmentPreview) return;
    for (const attachment of attachmentById.values()) {
      if (!attachment.preview_attachment_id) continue;
      void loadAttachmentPreview(attachment);
    }
  }, [attachmentById, loadAttachmentPreview, onLoadNodeAttachmentPreview]);

  // ── History helpers ───────────────────────────────────────────────────────
  const pushHistory = useCallback((newRoot: MindMapTreeNode) => {
    const idx = historyIdxRef.current;
    const next = [...historyRef.current.slice(0, idx + 1), cloneTree(newRoot)].slice(-50);
    historyRef.current = next;
    historyIdxRef.current = next.length - 1;
    setHistoryState(next);
    setHistoryIdx(next.length - 1);
  }, []);

  const mutate = useCallback((newRoot: MindMapTreeNode) => {
    setRoot(newRoot);
    pushHistory(newRoot);
    setIsDirty(true);
  }, [pushHistory]);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    const idx = historyIdxRef.current - 1;
    historyIdxRef.current = idx;
    setHistoryIdx(idx);
    setRoot(cloneTree(historyRef.current[idx]));
    setIsDirty(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    const idx = historyIdxRef.current + 1;
    historyIdxRef.current = idx;
    setHistoryIdx(idx);
    setRoot(cloneTree(historyRef.current[idx]));
    setIsDirty(true);
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  //  TREE MUTATIONS
  // ══════════════════════════════════════════════════════════════════════════

  const clearBranchCustomPositions = (node: MindMapTreeNode) => {
    node.customX = undefined;
    node.customY = undefined;
    node.children.forEach(clearBranchCustomPositions);
  };

  const addChild = useCallback((parentId: string, side?: 'left' | 'right') => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, parentId);
    if (!found) return;
    const newNode: MindMapTreeNode = {
      id: uid(), text: '', children: [], collapsed: false, notes: '',
      color: null, icons: [], checked: null, progress: null,
      startDate: null, endDate: null, urls: [], tags: [],
      ...(parentId === 'root' && side ? { side } : {}),
    };
    found.node.children.push(newNode);
    found.node.collapsed = false;

    // Keep freshly inserted nodes in clean branch spacing instead of inheriting dragged offsets.
    clearBranchCustomPositions(found.node);
    if (parentId === 'root') {
      if (side === 'left') setRootLeftCollapsed(false);
      if (side !== 'left') setRootRightCollapsed(false);
    }

    mutate(newRoot);
    setTimeout(() => { setSelectedId(newNode.id); startEditing(newNode); }, 30);
  }, [root, mutate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const addSibling = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || !found.parent) return;
    const newNode: MindMapTreeNode = {
      id: uid(), text: '', children: [], collapsed: false, notes: '',
      color: null, icons: [], checked: null, progress: null,
      startDate: null, endDate: null, urls: [], tags: [],
    };
    found.parent.children.splice(found.index + 1, 0, newNode);

    // Realign the whole sibling branch after insertion for predictable spacing.
    clearBranchCustomPositions(found.parent);
    if (found.parent.id === 'root') {
      if (found.node.side === 'left') setRootLeftCollapsed(false);
      else setRootRightCollapsed(false);
    }

    mutate(newRoot);
    setTimeout(() => { setSelectedId(newNode.id); startEditing(newNode); }, 30);
  }, [root, mutate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || !found.parent) return;
    found.parent.children.splice(found.index, 1);
    setSelectedId(found.parent.id);
    mutate(newRoot);
  }, [root, mutate]);

  const toggleCollapse = useCallback((nodeId: string) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || found.node.children.length === 0) return;
    found.node.collapsed = !found.node.collapsed;
    mutate(newRoot);
  }, [root, mutate]);

  // ── Node color ────────────────────────────────────────────────────────────
  const setNodeColor = useCallback((nodeId: string, color: string | null) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.color = color;
    mutate(newRoot);
  }, [root, mutate]);

  const cycleColor = useCallback((nodeId: string) => {
    const found = findNode(root, nodeId);
    if (!found) return;
    const all: (string | null)[] = [...NODE_COLORS, ...COLOR_PALETTE];
    const cur = all.indexOf(found.node.color ?? null);
    const next = all[(cur + 1) % all.length];
    setNodeColor(nodeId, next);
  }, [root, setNodeColor]);

  // ── Checkbox ──────────────────────────────────────────────────────────────
  const toggleCheckbox = useCallback((nodeId: string) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    const cur = found.node.checked;
    if (cur == null) found.node.checked = false;
    else if (cur === false) found.node.checked = true;
    else found.node.checked = false;
    mutate(newRoot);
  }, [root, mutate]);

  const addCheckbox = useCallback((nodeId: string) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.checked = false;
    mutate(newRoot);
  }, [root, mutate]);

  const removeCheckbox = useCallback((nodeId: string) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.checked = null;
    mutate(newRoot);
  }, [root, mutate]);

  // ── Progress ──────────────────────────────────────────────────────────────
  const setNodeProgress = useCallback((nodeId: string, value: number | null) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.progress = value;
    mutate(newRoot);
  }, [root, mutate]);

  const cycleProgress = useCallback((nodeId: string) => {
    const found = findNode(root, nodeId);
    if (!found) return;
    const cycle: (number | null)[] = [...PROGRESS_PRESETS, null];
    const cur = cycle.indexOf(found.node.progress ?? null);
    const next = cycle[(cur + 1) % cycle.length];
    setNodeProgress(nodeId, next);
  }, [root, setNodeProgress]);

  // ── Dates ─────────────────────────────────────────────────────────────────
  const setNodeDates = useCallback((nodeId: string, startDate: string | null, endDate: string | null) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.startDate = startDate;
    found.node.endDate = endDate;
    mutate(newRoot);
  }, [root, mutate]);

  // ── URLs ──────────────────────────────────────────────────────────────────
  const addNodeUrl = useCallback((nodeId: string, entry: UrlEntry) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    if (!found.node.urls) found.node.urls = [];
    found.node.urls.push(entry);
    mutate(newRoot);
  }, [root, mutate]);

  const removeNodeUrl = useCallback((nodeId: string, urlIndex: number) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || !found.node.urls) return;
    found.node.urls.splice(urlIndex, 1);
    mutate(newRoot);
  }, [root, mutate]);

  // ── Move siblings ─────────────────────────────────────────────────────────
  const moveNode = useCallback((nodeId: string, direction: 'up' | 'down') => {
    if (nodeId === 'root') return;
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || !found.parent) return;
    const siblings = found.parent.children;
    const idx = found.index;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;
    [siblings[idx], siblings[targetIdx]] = [siblings[targetIdx], siblings[idx]];
    mutate(newRoot);
  }, [root, mutate]);

  // ── Duplicate ─────────────────────────────────────────────────────────────
  const duplicateNode = useCallback((nodeId: string) => {
    if (nodeId === 'root') return;
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || !found.parent) return;
    const clone = cloneTree(found.node);
    const reassignIds = (n: MindMapTreeNode) => { n.id = uid(); n.children.forEach(reassignIds); };
    reassignIds(clone);
    found.parent.children.splice(found.index + 1, 0, clone);
    mutate(newRoot);
    setSelectedId(clone.id);
  }, [root, mutate]);

  // ── Reparent (drag-drop) ──────────────────────────────────────────────────
  const reparentNode = useCallback((nodeId: string, newParentId: string) => {
    if (nodeId === 'root' || nodeId === newParentId) return;
    if (isDescendant(root, nodeId, newParentId)) return;
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found || !found.parent) return;
    const [removed] = found.parent.children.splice(found.index, 1);
    removed.customX = undefined;
    removed.customY = undefined;
    const target = findNode(newRoot, newParentId);
    if (!target) return;
    target.node.children.push(removed);
    target.node.collapsed = false;
    mutate(newRoot);
    setSelectedId(nodeId);
  }, [root, mutate]);

  // ── Reset position ────────────────────────────────────────────────────────
  const resetNodePosition = useCallback((nodeId: string) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.customX = undefined;
    found.node.customY = undefined;
    mutate(newRoot);
  }, [root, mutate]);

  const resetAllPositions = useCallback(() => {
    const newRoot = cloneTree(root);
    const walk = (n: MindMapTreeNode) => { n.customX = undefined; n.customY = undefined; n.children.forEach(walk); };
    walk(newRoot);
    mutate(newRoot);
  }, [root, mutate]);

  // ── Auto-align subtree ────────────────────────────────────────────────────
  const autoAlignSubtree = useCallback((nodeId: string) => {
    const newRoot = cloneTree(root);
    const clearPositions = (n: MindMapTreeNode) => {
      n.customX = undefined; n.customY = undefined;
      n.children.forEach(clearPositions);
    };
    if (nodeId === 'root') {
      clearPositions(newRoot);
    } else {
      const found = findNode(newRoot, nodeId);
      if (found) clearPositions(found.node);
    }
    mutate(newRoot);
  }, [root, mutate]);

  // ── Tags ──────────────────────────────────────────────────────────────────
  const setNodeTags = useCallback((nodeId: string, tags: string[]) => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, nodeId);
    if (!found) return;
    found.node.tags = tags;
    mutate(newRoot);
  }, [root, mutate]);

  // ── Bulk helpers: apply an action to all selected nodes in one clone ─────
  const getTargetIds = useCallback(() => {
    const ids = new Set(multiSelect);
    ids.add(selectedId);
    return ids;
  }, [selectedId, multiSelect]);

  const bulkToggleCheckbox = useCallback(() => {
    const newRoot = cloneTree(root);
    for (const id of getTargetIds()) {
      const f = findNode(newRoot, id); if (!f) continue;
      const cur = f.node.checked;
      if (cur == null) f.node.checked = false;
      else if (cur === false) f.node.checked = true;
      else f.node.checked = false;
    }
    mutate(newRoot);
  }, [root, mutate, getTargetIds]);

  const bulkCycleProgress = useCallback(() => {
    const newRoot = cloneTree(root);
    for (const id of getTargetIds()) {
      const f = findNode(newRoot, id); if (!f) continue;
      const cycle: (number | null)[] = [...PROGRESS_PRESETS, null];
      const cur = cycle.indexOf(f.node.progress ?? null);
      f.node.progress = cycle[(cur + 1) % cycle.length];
    }
    mutate(newRoot);
  }, [root, mutate, getTargetIds]);

  const bulkSetColor = useCallback((color: string | null) => {
    const newRoot = cloneTree(root);
    for (const id of getTargetIds()) {
      const f = findNode(newRoot, id); if (!f) continue;
      f.node.color = color;
    }
    mutate(newRoot);
  }, [root, mutate, getTargetIds]);

  const bulkDelete = useCallback(() => {
    const ids = getTargetIds();
    ids.delete('root');
    if (ids.size === 0) return;
    const newRoot = cloneTree(root);
    let fallback = 'root';
    for (const id of ids) {
      const f = findNode(newRoot, id);
      if (f?.parent) { fallback = f.parent.id; f.parent.children.splice(f.index, 1); }
    }
    setSelectedId(fallback);
    setMultiSelect(new Set());
    mutate(newRoot);
  }, [root, mutate, getTargetIds]);

  const bulkToggleCollapse = useCallback(() => {
    const newRoot = cloneTree(root);
    for (const id of getTargetIds()) {
      const f = findNode(newRoot, id); if (!f || f.node.children.length === 0) continue;
      f.node.collapsed = !f.node.collapsed;
    }
    mutate(newRoot);
  }, [root, mutate, getTargetIds]);

  const bulkResetPosition = useCallback(() => {
    const newRoot = cloneTree(root);
    for (const id of getTargetIds()) {
      const f = findNode(newRoot, id); if (!f) continue;
      f.node.customX = undefined; f.node.customY = undefined;
    }
    mutate(newRoot);
  }, [root, mutate, getTargetIds]);

  const hasBulk = multiSelect.size > 0;

  // ══════════════════════════════════════════════════════════════════════════
  //  EDITING
  // ══════════════════════════════════════════════════════════════════════════

  const startEditing = (node: MindMapTreeNode) => {
    setEditingId(node.id);
    setEditText(node.text);
    setTimeout(() => editRef.current?.focus(), 20);
  };

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, editingId);
    if (found) {
      const trimmed = editText.trim();
      if (!trimmed && editingId !== 'root' && found.parent) {
        found.parent.children.splice(found.index, 1);
        setSelectedId(found.parent.id);
      } else {
        found.node.text = trimmed || found.node.text;
      }
      mutate(newRoot);
    }
    setEditingId(null);
  }, [editingId, editText, root, mutate]);

  const cancelEdit = useCallback(() => {
    if (editingId && editingId !== 'root') {
      const found = findNode(root, editingId);
      if (found && !found.node.text.trim() && found.parent) {
        const newRoot = cloneTree(root);
        const foundInNew = findNode(newRoot, editingId);
        if (foundInNew?.parent) {
          foundInNew.parent.children.splice(foundInNew.index, 1);
          setSelectedId(foundInNew.parent.id);
          mutate(newRoot);
        }
      }
    }
    setEditingId(null);
  }, [editingId, root, mutate]);

  // ── Notes ─────────────────────────────────────────────────────────────────
  const openNotes = useCallback((nodeId: string) => {
    const found = findNode(root, nodeId);
    if (!found) return;
    const nextText = found.node.notes ?? '';
    setNotesText(nextText);
    setNotesOpen(true);
  }, [root]);

  const saveNotes = useCallback(() => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, selectedId);
    if (found) { found.node.notes = notesText; mutate(newRoot); }
    setNotesOpen(false);
  }, [root, selectedId, notesText, mutate]);

  const deleteNotes = useCallback(() => {
    const newRoot = cloneTree(root);
    const found = findNode(newRoot, selectedId);
    if (found) { found.node.notes = ''; mutate(newRoot); }
    setNotesText('');
    setNotesOpen(false);
  }, [root, selectedId, mutate]);

  const editNotesSelection = useCallback((writer: (selected: string) => string, fallback = '') => {
    const input = notesRef.current;
    if (!input) {
      setNotesText((prev) => prev + writer(fallback));
      return;
    }
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const selected = notesText.slice(start, end) || fallback;
    const replacement = writer(selected);
    const next = `${notesText.slice(0, start)}${replacement}${notesText.slice(end)}`;
    setNotesText(next);
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + replacement.length;
      input.setSelectionRange(caret, caret);
    });
  }, [notesText]);

  const prefixNotesLines = useCallback((prefix: string, fallback = '') => {
    editNotesSelection((selected) => {
      const lines = (selected || fallback).split('\n');
      return lines.map((line) => `${prefix}${line}`).join('\n');
    }, fallback);
  }, [editNotesSelection]);

  const insertMarkdownAction = useCallback((action: 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'ul' | 'ol' | 'task' | 'quote' | 'code' | 'link') => {
    if (action === 'h1') { prefixNotesLines('# ', 'Heading 1'); return; }
    if (action === 'h2') { prefixNotesLines('## ', 'Heading 2'); return; }
    if (action === 'h3') { prefixNotesLines('### ', 'Heading 3'); return; }
    if (action === 'ul') { prefixNotesLines('- ', 'List item'); return; }
    if (action === 'task') { prefixNotesLines('- [ ] ', 'Task item'); return; }
    if (action === 'quote') { prefixNotesLines('> ', 'Quoted text'); return; }
    if (action === 'ol') {
      editNotesSelection((selected) => {
        const lines = (selected || 'List item').split('\n');
        return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
      }, 'List item');
      return;
    }
    if (action === 'bold') { editNotesSelection((selected) => `**${selected || 'bold text'}**`, 'bold text'); return; }
    if (action === 'italic') { editNotesSelection((selected) => `*${selected || 'italic text'}*`, 'italic text'); return; }
    if (action === 'code') { editNotesSelection((selected) => `\`${selected || 'code'}\``, 'code'); return; }
    if (action === 'link') { editNotesSelection((selected) => `[${selected || 'link text'}](https://)`, 'link text'); }
  }, [editNotesSelection, prefixNotesLines]);

  const uploadFilesIntoNotes = useCallback(async (files: File[]) => {
    if (!onNodeFileDrop || files.length === 0) {
      showToast('Attachments are unavailable in this mode');
      return;
    }

    setNotesUploadBusy(true);
    try {
      const refs = await onNodeFileDrop(selectedId, files);
      if (refs.length === 0) return;

      const markdownLines = refs.map((attachment) => {
        const safeName = (attachment.name || 'image').replace(/]/g, '\\]');
        const isImage = attachment.preview_kind === 'image' || attachment.content_type.startsWith('image/');
        if (isImage) {
          return `![${safeName}](attachment://${attachment.attachment_id})`;
        }
        return `[Attachment: ${safeName}](attachment://${attachment.attachment_id})`;
      });
      const existingSet = new Set((notesText || '').split('\n').map((line) => line.trim()));
      const uniqueNewLines = markdownLines.filter((line) => !existingSet.has(line.trim()));
      let nextNotes = notesText;
      if (uniqueNewLines.length > 0) {
        const payload = uniqueNewLines.join('\n');
        const input = notesRef.current;
        if (input) {
          const start = input.selectionStart ?? notesText.length;
          const end = input.selectionEnd ?? start;
          const prefixNeedsBreak = start > 0 && notesText[start - 1] !== '\n';
          const suffixNeedsBreak = end < notesText.length && notesText[end] !== '\n';
          const insertion = `${prefixNeedsBreak ? '\n' : ''}${payload}${suffixNeedsBreak ? '\n' : ''}`;
          nextNotes = `${notesText.slice(0, start)}${insertion}${notesText.slice(end)}`;
        } else {
          nextNotes = `${notesText}${notesText.trim().length > 0 ? '\n' : ''}${payload}`;
        }
      }

      const newRoot = cloneTree(root);
      const found = findNode(newRoot, selectedId);
      if (found) {
        found.node.attachments = [...(found.node.attachments ?? []), ...refs];
        found.node.notes = nextNotes;
        mutate(newRoot);
      }
      setNotesText(nextNotes);
      requestAnimationFrame(() => {
        if (notesRef.current) notesRef.current.focus();
      });
      refs.forEach((attachment) => { void loadAttachmentPreview(attachment); });
      showToast(`${refs.length} file${refs.length === 1 ? '' : 's'} added to notes`);
    } catch {
      showToast('File upload failed');
    } finally {
      setNotesUploadBusy(false);
      setNotesDropActive(false);
    }
  }, [loadAttachmentPreview, mutate, notesText, onNodeFileDrop, root, selectedId, showToast]);

  const deleteNotesAttachment = useCallback(async (attachment: NodeAttachmentRef) => {
    if (!onDeleteNodeAttachment) return;
    try {
      await onDeleteNodeAttachment(attachment);
      const newRoot = cloneTree(root);
      const found = findNode(newRoot, selectedId);
      if (found) {
        const filtered = (found.node.attachments ?? []).filter((item) => item.attachment_id !== attachment.attachment_id);
        found.node.attachments = filtered;
        found.node.notes = (found.node.notes ?? '')
          .split('\n')
          .filter((line) => !line.includes(`attachment://${attachment.attachment_id}`))
          .join('\n');
        mutate(newRoot);
        setNotesText(found.node.notes ?? '');
      }
      setAttachmentPreviewUrls((current) => {
        const next = { ...current };
        const preview = next[attachment.attachment_id];
        if (preview) URL.revokeObjectURL(preview);
        delete next[attachment.attachment_id];
        return next;
      });
      showToast('Attachment removed');
    } catch {
      showToast('Attachment delete failed');
    }
  }, [mutate, onDeleteNodeAttachment, root, selectedId, showToast]);

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const all = flattenAll(root);
    const matches = all.filter((n) => n.text.toLowerCase().includes(q)).map((n) => n.id);
    setSearchResults(matches);
    setSearchIdx(0);
    if (matches.length > 0) setSelectedId(matches[0]);
  }, [searchQuery, root]);

  const searchNext = useCallback(() => {
    if (searchResults.length === 0) return;
    const next = (searchIdx + 1) % searchResults.length;
    setSearchIdx(next);
    setSelectedId(searchResults[next]);
  }, [searchResults, searchIdx]);

  const searchPrev = useCallback(() => {
    if (searchResults.length === 0) return;
    const prev = (searchIdx - 1 + searchResults.length) % searchResults.length;
    setSearchIdx(prev);
    setSelectedId(searchResults[prev]);
  }, [searchResults, searchIdx]);

  // ── Auto-pan to selected node ─────────────────────────────────────────────
  useLayoutEffect(() => {
    const box = layout[selectedId];
    if (!box || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const margin = 60;
    const left = pan.x + box.x * zoom;
    const top = pan.y + box.y * zoom;
    const right = left + box.w * zoom;
    const bottom = top + box.h * zoom;
    let dx = 0, dy = 0;
    if (left < margin) dx = margin - left;
    else if (right > width - margin) dx = (width - margin) - right;
    if (top < 60 + margin) dy = (60 + margin) - top;
    else if (bottom > height - margin) dy = (height - margin) - bottom;
    if (dx !== 0 || dy !== 0) setPan({ x: pan.x + dx, y: pan.y + dy });
  }, [selectedId, layout]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save handler ──────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (saving) return;
    onSave({
      version: 'tree',
      root: cloneTree(root),
      view_state: {
        pan_x: Math.round(pan.x),
        pan_y: Math.round(pan.y),
        zoom: Number(zoom.toFixed(3)),
        focus_mode: focusMode,
        focus_anchor_id: focusAnchorId,
        selected_node_id: selectedId,
      },
    }, title);
    setIsDirty(false);
  }, [focusAnchorId, focusMode, onSave, pan.x, pan.y, root, saving, selectedId, title, zoom]);

  const buildExportFileBaseName = useCallback((baseTitle?: string) => {
    const normalizedTitle = (baseTitle || title || 'mindmap').trim();
    const safeTitle = normalizedTitle
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    const versionMatch = (versionLabel ?? '').match(/v\s*(\d+)/i);
    const versionToken = versionMatch ? `v${versionMatch[1]}` : null;
    return versionToken ? `${safeTitle}-${versionToken}` : safeTitle;
  }, [title, versionLabel]);

  // ── PNG export ────────────────────────────────────────────────────────────
  const exportPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    const parsed = versionTooltip ? new Date(versionTooltip) : null;
    const exportDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

    try {
      const canvas = await renderSvgToCanvas(svg, versionLabel, exportDate.toISOString());
      const pngBlob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      if (pngBlob) {
        try {
          await downloadBlob(pngBlob, `${buildExportFileBaseName()}.png`);
          return;
        } catch (err) {
          // fall through to data URL fallback
        }
      }
      // Fallback: data URL path
      const dataUrl = canvas.toDataURL('image/png');
      await downloadDataUrl(dataUrl, `${buildExportFileBaseName()}.png`);
    } catch (err) {
      showToast('PNG export failed');
    }
  }, [svgRef, buildExportFileBaseName, versionLabel, versionTooltip, showToast]);

  // ── PDF export ────────────────────────────────────────────────────────────
  const exportPdf = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const parsed = versionTooltip ? new Date(versionTooltip) : null;
    const exportDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
    exportSvgAsPdf(svg, buildExportFileBaseName(), versionLabel, exportDate.toISOString()).catch(() => showToast('PDF export failed'));
  }, [svgRef, buildExportFileBaseName, versionLabel, versionTooltip, showToast]);

  // ══════════════════════════════════════════════════════════════════════════
  //  FOCUS MODE
  // ══════════════════════════════════════════════════════════════════════════

  const focusedIds = useMemo<Set<string>>(() => {
    if (!focusMode || !focusAnchorId) return new Set();
    const found = findNode(root, focusAnchorId);
    if (!found) return new Set();
    const ids = new Set<string>();
    const walk = (n: MindMapTreeNode) => { ids.add(n.id); (n.children || []).forEach(walk); };
    walk(found.node);
    return ids;
  }, [focusMode, focusAnchorId, root]);

  // ══════════════════════════════════════════════════════════════════════════
  //  KEYBOARD
  // ══════════════════════════════════════════════════════════════════════════

  const navigateKeys = useCallback((e: KeyboardEvent) => {
    if (notesOpen) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        saveNotes();
        showToast('Notes saved');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        notesRef.current?.focus();
        showToast('Notes edit focus');
        return;
      }
    }
    if (editingId) {
      if (e.key === 'Escape') { cancelEdit(); e.preventDefault(); }
      return;
    }
    if (showColorPicker) {
      if (e.key === 'Escape') { setShowColorPicker(false); e.preventDefault(); }
      return;
    }
    if (!selectedId) return;
    if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); addChild(selectedId); showToast('Tab — Add child'); }
    else if (e.key === 'Tab' && e.shiftKey && selectedId === 'root') { e.preventDefault(); addChild('root', 'left'); showToast('⇧Tab — Add left child'); }
    else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); addChild(selectedId); showToast('Tab — Add child'); }
    else if (e.key === 'Insert') { e.preventDefault(); addChild(selectedId); showToast('Ins — Add child'); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); addSibling(selectedId); showToast('Enter — Add sibling'); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); hasBulk ? bulkDelete() : deleteNode(selectedId); showToast('Del — Delete node'); }
    else if (e.key === 'F2') { e.preventDefault(); const f = findNode(root, selectedId); if (f) startEditing(f.node); showToast('F2 — Rename'); }
    else if (e.key === 'F3') { e.preventDefault(); setNotesOpen((v) => { if (!v) openNotes(selectedId); return !v; }); showToast('F3 — Notes'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') { e.preventDefault(); openNotes(selectedId); setTimeout(() => notesRef.current?.focus(), 20); showToast('Ctrl+E — Edit notes'); }
    else if (e.key === 'F4') { e.preventDefault(); setShowColorPicker((v) => !v); showToast('F4 — Colour'); }
    else if (e.key === 'F5') { e.preventDefault(); setFocusMode((v) => { if (!v) setFocusAnchorId(selectedId); return !v; }); showToast(focusMode ? 'F5 — Focus off' : 'F5 — Focus on'); }
    else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setFocusMode((v) => { if (!v) setFocusAnchorId(selectedId); return !v; }); showToast(focusMode ? 'F — Focus off' : 'F — Focus on'); }
    else if (e.key === 'F1') { e.preventDefault(); setShowShortcuts((v) => !v); showToast('F1 — Shortcuts'); }
    else if (e.key === 'F6') {
      e.preventDefault();
      nodeAttachmentInputRef.current?.click();
      showToast('F6 — Attach encrypted file');
    }
    else if (e.key === 'Escape') { setShowShortcuts(false); setShowColorPicker(false); setShowExportMenu(false); setContextMenu(null); setSearchOpen(false); setMultiSelect(new Set()); setShowTagDialog(false); }
    else if (e.key === 'F9' || (e.ctrlKey && e.key === 'z' && !e.shiftKey)) { e.preventDefault(); undo(); showToast('Undo'); }
    else if (e.key === 'F10' || (e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); showToast('Redo'); }
    else if (e.key === ' ') { e.preventDefault(); hasBulk ? bulkToggleCollapse() : toggleCollapse(selectedId); showToast('Space — Fold / Unfold'); }
    else if (e.key === 'Home') { e.preventDefault(); setSelectedId('root'); showToast('Home — Root'); }
    else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      hasBulk ? bulkToggleCheckbox() : toggleCheckbox(selectedId);
      showToast('C — Checkbox');
    }
    else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      hasBulk ? bulkCycleProgress() : cycleProgress(selectedId);
      showToast('P — Progress');
    }
    else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowDateDialog((v) => !v); showToast('D — Dates'); }
    else if (e.key.toLowerCase() === 'u' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowUrlDialog((v) => !v); showToast('U — URL'); }
    else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); hasBulk ? bulkResetPosition() : resetNodePosition(selectedId); showToast('R — Reset pos'); }
    else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); resetAllPositions(); showToast('Reset all positions'); }
    else if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowTagDialog((v) => !v); showToast('T — Labels'); }
    else if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); autoAlignSubtree(selectedId); showToast(selectedId === 'root' ? 'A — Auto-align all' : 'A — Auto-align subtree'); }
    else if (e.ctrlKey && e.key === 'f') { e.preventDefault(); setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const box = layout[selectedId];
      if (!box) return;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      // In focus mode only navigate among focused nodes
      const candidateIds = (focusMode && focusedIds.size > 0)
        ? [...focusedIds].filter((id) => id !== selectedId && layout[id])
        : Object.keys(layout).filter((id) => id !== selectedId);
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const id of candidateIds) {
        const b = layout[id];
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        const dx = bx - cx;
        const dy = by - cy;
        let ok = false;
        if (e.key === 'ArrowUp')    ok = dy < -5;
        if (e.key === 'ArrowDown')  ok = dy > 5;
        if (e.key === 'ArrowLeft')  ok = dx < -5;
        if (e.key === 'ArrowRight') ok = dx > 5;
        if (!ok) continue;
        const isVertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
        const primary = isVertical ? Math.abs(dy) : Math.abs(dx);
        const secondary = isVertical ? Math.abs(dx) : Math.abs(dy);
        const dist = primary + secondary * 0.35;
        if (dist < bestDist) { bestDist = dist; bestId = id; }
      }
      if (bestId) {
        if (e.shiftKey) {
          // Shift+Arrow: toggle multi-select
          setMultiSelect((prev) => { const s = new Set(prev); s.add(selectedId); s.add(bestId!); return s; });
        } else {
          setMultiSelect(new Set());
        }
        setSelectedId(bestId);
      }
    }
    else if (e.key === '+') { e.preventDefault(); setZoom((z) => Math.min(3, z + 0.15)); }
    else if (e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(0.3, z - 0.15)); }
    }, [editingId, notesOpen, openNotes, saveNotes, selectedId, root, layout, addChild, addSibling, deleteNode, cancelEdit, cycleColor, cycleProgress,
      toggleCheckbox, undo, redo, toggleCollapse, openNotes, showToast, resetNodePosition, resetAllPositions, autoAlignSubtree, showColorPicker, focusMode, focusedIds,
      hasBulk, bulkDelete, bulkToggleCheckbox, bulkCycleProgress, bulkToggleCollapse, bulkResetPosition]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || (tag === 'TEXTAREA' && (e.target as HTMLElement) !== editRef.current)) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          if (notesOpen) {
            saveNotes();
          } else {
            handleSave();
          }
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); showToast('Ctrl+S — Save'); return; }
      navigateKeys(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigateKeys, handleSave, notesOpen, saveNotes, showToast]);

  // ── Autosave ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const hasUnsavedChanges = isDirty || !!titleChanged;
    if (autosaveTimer.current) { clearTimeout(autosaveTimer.current); autosaveTimer.current = null; }
    if (autosaveInterval.current) { clearInterval(autosaveInterval.current); autosaveInterval.current = null; }
    if (!hasUnsavedChanges || saving || autosaveMode === 'never') return;

    if (autosaveMode === 'change') {
      autosaveTimer.current = setTimeout(() => handleSave(), 1000);
      return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
    }
    const intervalMs = autosaveMode === '30s' ? 30_000 : 5 * 60_000;
    autosaveInterval.current = setInterval(() => { if (isDirty || titleChanged) handleSave(); }, intervalMs);
    return () => { if (autosaveInterval.current) clearInterval(autosaveInterval.current); };
  }, [root, title, titleChanged, autosaveMode, saving, handleSave, isDirty]);

  // ══════════════════════════════════════════════════════════════════════════
  //  ZOOM / PAN / DRAG-AND-DROP
  // ══════════════════════════════════════════════════════════════════════════

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom((z) => Math.min(3, Math.max(0.3, z - e.deltaY * 0.001))); }
    else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
  }, []);

  const onMouseDownSvg = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest('[data-node]')) return;
    // Shift+click on empty canvas starts rectangle selection
    if (e.shiftKey) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const sx = (e.clientX - rect.left - pan.x) / zoom;
        const sy = (e.clientY - rect.top - pan.y) / zoom;
        setRectSel({ startX: sx, startY: sy, curX: sx, curY: sy });
      }
      e.preventDefault();
      return;
    }
    isPanning.current = true;
    lastPan.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.style.cursor = 'grabbing';
    setContextMenu(null);
    setMultiSelect(new Set());
  }, [pan, zoom]);

  const onMouseMoveSvg = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Rectangle selection drag
    if (rectSel) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const cx = (e.clientX - rect.left - pan.x) / zoom;
        const cy = (e.clientY - rect.top - pan.y) / zoom;
        setRectSel((r) => r ? { ...r, curX: cx, curY: cy } : null);
      }
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      const dx = (e.clientX - d.startClientX) / zoom;
      const dy = (e.clientY - d.startClientY) / zoom;
      if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { d.moved = true; setIsDragging(true); }
      if (d.moved) {
        d.currentX = d.origX + dx;
        d.currentY = d.origY + dy;
        // Move the dragged node visually
        const el = svgRef.current?.querySelector(`[data-node="${d.nodeId}"]`) as SVGGElement | null;
        if (el) el.style.transform = `translate(${dx}px, ${dy}px)`;
        // Also move other multi-selected nodes
        if (multiSelect.size > 0) {
          for (const id of multiSelect) {
            if (id === d.nodeId) continue;
            const mel = svgRef.current?.querySelector(`[data-node="${id}"]`) as SVGGElement | null;
            if (mel) mel.style.transform = `translate(${dx}px, ${dy}px)`;
          }
        }
        // Drop target detection (only when dragging a single node)
        if (multiSelect.size <= 1) {
          let newTarget: string | null = null;
          for (const [nid, entry] of Object.entries(layout)) {
            if (nid === d.nodeId) continue;
            const cx = entry.x + entry.w / 2;
            const cy = entry.y + entry.h / 2;
            if (Math.sqrt((d.currentX - cx) ** 2 + (d.currentY - cy) ** 2) < 40) { newTarget = nid; break; }
          }
          setDropTargetId(newTarget);
        }
      }
      return;
    }
    if (!isPanning.current) return;
    const dx = e.clientX - lastPan.current.x;
    const dy = e.clientY - lastPan.current.y;
    lastPan.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, [zoom, layout, rectSel, pan, multiSelect]);

  const getNodeIdAtClientPoint = useCallback((clientX: number, clientY: number): string | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return selectedId !== 'root' ? selectedId : null;
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;

    const entries = Object.entries(layout).reverse();
    for (const [nodeId, box] of entries) {
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        return nodeId;
      }
    }

    return selectedId !== 'root' ? selectedId : null;
  }, [layout, pan.x, pan.y, selectedId, zoom]);

  const onDragOverSvg = useCallback((e: React.DragEvent<SVGSVGElement>) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropTargetId(getNodeIdAtClientPoint(e.clientX, e.clientY));
  }, [getNodeIdAtClientPoint]);

  const onDragLeaveSvg = useCallback((e: React.DragEvent<SVGSVGElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropTargetId(null);
  }, []);

  const onDropSvg = useCallback(async (e: React.DragEvent<SVGSVGElement>) => {
    if (!onNodeFileDrop || e.dataTransfer.files.length === 0) return;
    e.preventDefault();
    const nodeId = getNodeIdAtClientPoint(e.clientX, e.clientY);
    setDropTargetId(null);
    if (!nodeId) return;

    setFileDropBusyNodeId(nodeId);
    try {
      const refs = await onNodeFileDrop(nodeId, Array.from(e.dataTransfer.files));
      if (refs.length === 0) return;

      const newRoot = cloneTree(root);
      const found = findNode(newRoot, nodeId);
      if (found) {
        found.node.attachments = [...(found.node.attachments ?? []), ...refs];
        found.node.text = appendAttachmentMarkdownLinks(found.node.text, refs);
        mutate(newRoot);
        setSelectedId(nodeId);
      }
      showToast(`${refs.length} encrypted file${refs.length === 1 ? '' : 's'} attached`);
    } finally {
      setFileDropBusyNodeId(null);
    }
  }, [getNodeIdAtClientPoint, mutate, onNodeFileDrop, root, showToast]);

  const attachFilesToSelectedNode = useCallback(async (files: FileList | File[] | null) => {
    if (!onNodeFileDrop || !files || files.length === 0 || selectedId === 'root') return;

    const selectedFiles = Array.from(files);
    setFileDropBusyNodeId(selectedId);
    try {
      const refs = await onNodeFileDrop(selectedId, selectedFiles);
      if (refs.length === 0) {
        showToast('Attachment upload failed');
        return;
      }

      const newRoot = cloneTree(root);
      const found = findNode(newRoot, selectedId);
      if (found) {
        found.node.attachments = [...(found.node.attachments ?? []), ...refs];
        found.node.text = appendAttachmentMarkdownLinks(found.node.text, refs);
        mutate(newRoot);
      }
      showToast(`${refs.length} encrypted file${refs.length === 1 ? '' : 's'} attached`);
    } catch {
      showToast('Attachment upload failed');
    } finally {
      setFileDropBusyNodeId(null);
    }
  }, [mutate, onNodeFileDrop, root, selectedId, showToast]);

  const onMouseUpSvg = useCallback(() => {
    // Finish rectangle selection
    if (rectSel) {
      const x1 = Math.min(rectSel.startX, rectSel.curX);
      const x2 = Math.max(rectSel.startX, rectSel.curX);
      const y1 = Math.min(rectSel.startY, rectSel.curY);
      const y2 = Math.max(rectSel.startY, rectSel.curY);
      const ids = new Set<string>();
      for (const [id, entry] of Object.entries(layout)) {
        const cx = entry.x + entry.w / 2;
        const cy = entry.y + entry.h / 2;
        if (cx >= x1 && cx <= x2 && cy >= y1 && cy <= y2) ids.add(id);
      }
      setMultiSelect(ids);
      if (ids.size > 0) {
        const first = [...ids][0];
        setSelectedId(first);
      }
      setRectSel(null);
      return;
    }
    isPanning.current = false;
    if (svgRef.current) svgRef.current.style.cursor = '';
    if (dragRef.current && dragRef.current.moved) {
      const d = dragRef.current;
      const dx = (d.currentX - d.origX);
      const dy = (d.currentY - d.origY);
      // Clear visual transforms on all dragged elements
      const el = svgRef.current?.querySelector(`[data-node="${d.nodeId}"]`) as SVGGElement | null;
      if (el) el.style.transform = '';
      for (const id of multiSelect) {
        if (id === d.nodeId) continue;
        const mel = svgRef.current?.querySelector(`[data-node="${id}"]`) as SVGGElement | null;
        if (mel) mel.style.transform = '';
      }
      if (dropTargetId && dropTargetId !== d.nodeId && multiSelect.size <= 1) {
        reparentNode(d.nodeId, dropTargetId);
      } else {
        // Save new positions for all multi-selected nodes (or just the one)
        const newRoot = cloneTree(root);
        const idsToMove = multiSelect.size > 0 ? multiSelect : new Set([d.nodeId]);
        for (const id of idsToMove) {
          const found = findNode(newRoot, id);
          if (!found) continue;
          const box = layout[id];
          if (box) {
            found.node.customX = box.x + dx;
            found.node.customY = box.y + dy;
          }
        }
        mutate(newRoot);
      }
    }
    dragRef.current = null;
    setIsDragging(false);
    setDropTargetId(null);
  }, [rectSel, layout, dropTargetId, reparentNode, root, mutate, multiSelect]);

  // ── Fit view ──────────────────────────────────────────────────────────────
  const fitView = useCallback(() => {
    if (!containerRef.current || Object.keys(layout).length === 0) return;
    const all = Object.values(layout);
    const minX = Math.min(...all.map((n) => n.x));
    const maxX = Math.max(...all.map((n) => n.x + n.w));
    const minY = Math.min(...all.map((n) => n.y));
    const maxY = Math.max(...all.map((n) => n.y + n.h));
    const pad = 60;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const scaleX = (width - pad * 2) / (maxX - minX || 1);
    const scaleY = (height - pad * 2) / (maxY - minY || 1);
    const z = Math.min(Math.min(scaleX, scaleY), 2);
    setZoom(z);
    setPan({ x: pad - minX * z, y: pad - minY * z });
  }, [layout]);

  // ══════════════════════════════════════════════════════════════════════════
  //  SVG RENDERING
  // ══════════════════════════════════════════════════════════════════════════

  const renderProgressPie = (cx: number, cy: number, pct: number, size: number, onClickPie?: () => void) => {
    const r = size / 2 - 2;
    const inner = pct >= 100
      ? (<g><circle cx={cx} cy={cy} r={r} fill="#16a34a" /><path d={`M ${cx - 4} ${cy} l 3 3 5 -5`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></g>)
      : (() => {
        const angle = (pct / 100) * 360;
        const rad = (angle - 90) * (Math.PI / 180);
        const ex = cx + r * Math.cos(rad);
        const ey = cy + r * Math.sin(rad);
        const large = angle > 180 ? 1 : 0;
        const piePath = pct > 0 ? `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z` : '';
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill="var(--mm-node-fill)" stroke="var(--mm-node-stroke)" strokeWidth={1} />
            {piePath && <path d={piePath} fill="var(--accent)" opacity={0.8} />}
            <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight="bold" fill="var(--mm-node-text)">{pct}%</text>
          </g>
        );
      })();
    if (!onClickPie) return inner;
    return (
      <g style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onClickPie(); }}>
        {inner}
        <circle cx={cx} cy={cy} r={r} fill="transparent" />
      </g>
    );
  };

  const renderConnections = useCallback((node: MindMapTreeNode, inheritedColor?: string): JSX.Element[] => {
    const paths: JSX.Element[] = [];
    if (node.collapsed) return paths;
    const pBox = layout[node.id];
    if (!pBox) return paths;
    const nodeColor = node.color ?? inheritedColor;
    for (const ch of node.children) {
      if (node.id === 'root') {
        const isLeftSide = ch.side === 'left';
        if (isLeftSide && rootLeftCollapsed) continue;
        if (!isLeftSide && rootRightCollapsed) continue;
      }
      const cBox = layout[ch.id];
      if (!cBox) continue;
      const parentCenterX = pBox.x + pBox.w / 2;
      const childCenterX = cBox.x + cBox.w / 2;
      const childOnLeft = childCenterX < parentCenterX;
      const x1 = childOnLeft ? pBox.x : pBox.x + pBox.w;
      const y1 = pBox.y + pBox.h / 2;
      const x2 = childOnLeft ? cBox.x + cBox.w : cBox.x;
      const y2 = cBox.y + cBox.h / 2;
      const branchColor = ch.color ?? nodeColor;
      const faded = focusMode && focusedIds.size > 0 && !focusedIds.has(node.id) && !focusedIds.has(ch.id);
      paths.push(
        <path
          key={`c-${node.id}-${ch.id}`}
          d={bezierPath(x1, y1, x2, y2)}
          className={`mm-connection${faded ? ' mm-faded' : ''}`}
          fill="none"
          stroke={branchColor ?? 'var(--mm-connection, #7C3AED)'}
          style={{ stroke: branchColor ?? 'var(--mm-connection, #7C3AED)' }}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={faded ? 0.2 : 1}
        />,
      );
      paths.push(...renderConnections(ch, branchColor));
    }
    return paths;
  }, [layout, focusMode, focusedIds, rootLeftCollapsed, rootRightCollapsed]);

  const renderAttachmentIndicator = (x: number, y: number, count: number, ownColor: string | null) => {
    const indicatorWidth = count > 1 ? 28 : 18;
    const iconX = x - indicatorWidth / 2 + 5;
    const textX = x + indicatorWidth / 2 - 6;
    const stroke = ownColor ? '#ffffffcc' : '#cbd5e1';
    const fill = ownColor ? 'rgba(15, 23, 42, 0.34)' : 'rgba(15, 23, 42, 0.82)';
    return (
      <g className="mm-attachment-indicator">
        <rect x={x - indicatorWidth / 2} y={y - 7} width={indicatorWidth} height={14} rx={7} fill={fill} stroke={stroke} strokeWidth={1} />
        <path
          d={`M ${iconX} ${y + 1.5} l 4.1 -4.1 a 2.2 2.2 0 1 1 3.1 3.1 l -4.8 4.8 a 3.3 3.3 0 1 1 -4.7 -4.7 l 4.2 -4.2`}
          fill="none"
          stroke={stroke}
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {count > 1 && (
          <text x={textX} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={8.5} fontWeight="700" fill={ownColor ? '#ffffff' : '#f8fafc'}>
            {count}
          </text>
        )}
      </g>
    );
  };

  const getNodeAttachments = useCallback((nodeId: string, inlineAttachments?: NodeAttachmentRef[]) => {
    const inline = inlineAttachments ?? [];
    const external = externalNodeAttachments?.[nodeId] ?? [];
    if (inline.length === 0) return external;
    if (external.length === 0) return inline;

    const merged = new Map<string, NodeAttachmentRef>();
    for (const attachment of external) merged.set(attachment.attachment_id, attachment);
    for (const attachment of inline) {
      merged.set(attachment.attachment_id, {
        ...merged.get(attachment.attachment_id),
        ...attachment,
      });
    }
    return Array.from(merged.values()).sort((left, right) => right.uploaded_at.localeCompare(left.uploaded_at));
  }, [externalNodeAttachments]);

  const cancelHoverPopupClose = useCallback(() => {
    if (!hoverPopupCloseTimerRef.current) return;
    clearTimeout(hoverPopupCloseTimerRef.current);
    hoverPopupCloseTimerRef.current = null;
  }, []);

  const scheduleHoverPopupClose = useCallback((nodeId?: string) => {
    cancelHoverPopupClose();
    hoverPopupCloseTimerRef.current = setTimeout(() => {
      if (!hoveringNotePopup) {
        setHoveredNoteNodeId((current) => {
          if (!nodeId) return null;
          return current === nodeId ? null : current;
        });
      }
      hoverPopupCloseTimerRef.current = null;
    }, 140);
  }, [cancelHoverPopupClose, hoveringNotePopup]);

  const renderNodes = useCallback((node: MindMapTreeNode, depth = 0, inheritedColor?: string): JSX.Element[] => {
    const box = layout[node.id];
    if (!box) return [];
    const isRoot = depth === 0;
    const isSelected = node.id === selectedId;
    const isEditing = node.id === editingId;
    const isDrop = node.id === dropTargetId;
    const ownColor = node.color ?? null;
    // Only the node's own explicit color fills the bubble.
    // Inherited color is passed down solely for connection lines.
    const rx = isRoot ? 18 : 8;

    const fillColor = ownColor ?? (isRoot ? 'var(--mm-root-fill)' : 'var(--mm-node-fill)');
    const strokeColor = isDrop ? '#22c55e' : (ownColor ?? (isRoot ? 'var(--mm-root-stroke)' : isSelected ? 'var(--accent)' : 'var(--mm-node-stroke)'));
    const textColor = ownColor ? '#ffffff' : (isRoot ? 'var(--mm-root-text)' : 'var(--mm-node-text)');

    const lines = getVisibleNodeTextLines(node.text);
    const fontSize = isRoot ? 15 : 13;
    const fontWeight = isRoot ? 'bold' : 'normal';
    const attachments = getNodeAttachments(node.id, node.attachments);

    const hasCheckbox = node.checked != null;
    const hasProgress = node.progress != null;
    const leftPad = (hasCheckbox ? CHECKBOX_SIZE + 6 : 0) + (hasProgress ? PROGRESS_PIE_SIZE + 6 : 0);

    const urlCount = (node.urls ?? []).length;
    const linkId = node.link?.id || null;
    const footerLinks = (linkId ? 1 : 0) + urlCount;
    const previewHeight = 0;
    const footerHeight = footerLinks > 0 ? LINK_STRIP_H * footerLinks : 0;
    const tagCount = (node.tags ?? []).length;
    const topTagH = tagCount > 0 ? TAG_STRIP_H : 0;
    const topMetaH = (attachments.length > 0 || Boolean(node.notes)) ? TOP_META_STRIP_H : 0;
    const bodyTopY = box.y + topMetaH + topTagH;
    const bodyH = box.h - footerHeight - previewHeight - topTagH - topMetaH;
    const textX = box.x + NODE_PAD_X + leftPad;
    const lineStartY = bodyTopY + bodyH / 2 - ((lines.length - 1) * NODE_LINE_H) / 2;

    const formatDate = (d: string) => {
      const dt = new Date(d);
      return `${dt.getDate().toString().padStart(2, '0')}.${(dt.getMonth() + 1).toString().padStart(2, '0')}.${String(dt.getFullYear()).slice(2)} ${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
    };
    const hasDate = !!(node.startDate || node.endDate);
    const startLabel = node.startDate ? formatDate(node.startDate) : '–';
    const endLabel = node.endDate ? formatDate(node.endDate) : '–';
    const checkedInfo = (node.children.length > 0 && node.checked != null) ? countChecked(node) : null;

    const isMulti = multiSelect.has(node.id);

    const elems: JSX.Element[] = [
      <g key={node.id} data-node={node.id}
        className={`mm-node-group${isSelected ? ' mm-selected' : ''}${isMulti ? ' mm-multi-selected' : ''}${isDrop ? ' mm-drop-target' : ''}${focusMode && focusedIds.size > 0 && !focusedIds.has(node.id) ? ' mm-faded' : ''}`}
        style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          if (e.ctrlKey || e.metaKey) {
            setMultiSelect((prev) => { const s = new Set(prev); if (s.has(node.id)) s.delete(node.id); else s.add(node.id); return s; });
          } else {
            setMultiSelect(new Set());
          }
          setSelectedId(node.id); setShowColorPicker(false); setContextMenu(null);
        }}
        onDoubleClick={(e) => { e.stopPropagation(); setSelectedId(node.id); startEditing(node); }}
        onMouseEnter={() => {
          if (!node.notes?.trim()) return;
          cancelHoverPopupClose();
          setHoveredNoteNodeId(node.id);
        }}
        onMouseLeave={() => {
          scheduleHoverPopupClose(node.id);
        }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedId(node.id); setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id }); }}
        onMouseDown={(e) => {
          if (e.button !== 0 || isEditing) return;
          e.stopPropagation();
          dragRef.current = { nodeId: node.id, startClientX: e.clientX, startClientY: e.clientY, origX: box.x, origY: box.y, currentX: box.x, currentY: box.y, moved: false };
        }}
      >
        {hasDate && (
          <g className="mm-date-badge">
            <svg x={box.x + box.w / 2 - 52} y={box.y - 32} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <text x={box.x + box.w / 2 - 33} y={box.y - 25} fontSize={11} fill="var(--accent)" fontWeight="500">{startLabel}</text>
            <text x={box.x + box.w / 2 - 33} y={box.y - 12} fontSize={11} fill="var(--mm-statusbar-text)">{endLabel}</text>
          </g>
        )}

        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={rx} ry={rx} fill={fillColor} stroke={strokeColor}
          strokeWidth={isSelected ? 2.5 : isDrop ? 3 : 1.5} className={isSelected ? 'mm-node-selected' : ''} />

        {topMetaH > 0 && (
          <line
            x1={box.x + 6}
            y1={box.y + topMetaH}
            x2={box.x + box.w - 6}
            y2={box.y + topMetaH}
            stroke={ownColor ? '#ffffff22' : 'var(--mm-node-stroke)'}
            strokeWidth={0.5}
          />
        )}

        {hasCheckbox && (
          <g className="mm-checkbox-g" onClick={(e) => { e.stopPropagation(); toggleCheckbox(node.id); }} style={{ cursor: 'pointer' }}>
            <rect x={box.x + NODE_PAD_X - 2} y={bodyTopY + bodyH / 2 - CHECKBOX_SIZE / 2} width={CHECKBOX_SIZE} height={CHECKBOX_SIZE}
              rx={3} fill={node.checked ? 'var(--accent)' : 'transparent'} stroke={node.checked ? 'var(--accent)' : (ownColor ? '#ffffff88' : 'var(--mm-node-stroke)')} strokeWidth={1.5} />
            {node.checked && <path d={`M ${box.x + NODE_PAD_X + 2} ${bodyTopY + bodyH / 2} l 3 3 5 -6`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          </g>
        )}

        {hasProgress && renderProgressPie(
          box.x + NODE_PAD_X + (hasCheckbox ? CHECKBOX_SIZE + 6 : 0) + PROGRESS_PIE_SIZE / 2,
          bodyTopY + bodyH / 2, node.progress!, PROGRESS_PIE_SIZE, () => cycleProgress(node.id))}

        {isEditing ? (
          <foreignObject x={box.x + 2} y={bodyTopY + 2} width={box.w - 4} height={Math.max(0, bodyH - 4)}>
            <textarea ref={editRef} value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={commitEdit}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } if (e.key === 'Escape') cancelEdit(); e.stopPropagation(); }}
              className="mm-edit-textarea" style={{ color: textColor, background: fillColor }} />
          </foreignObject>
        ) : (
          lines.map((line, li) => (
            <text key={li} x={textX + (box.w - NODE_PAD_X * 2 - leftPad) / 2} y={lineStartY + li * NODE_LINE_H}
              textAnchor="middle" dominantBaseline="middle" fontSize={fontSize} fontWeight={fontWeight} fill={textColor}
              className={`mm-node-text${searchResults.includes(node.id) ? ' mm-search-highlight' : ''}`}>{line}</text>
          ))
        )}

        {attachments.length > 0 && renderAttachmentIndicator(box.x + box.w - (node.notes ? 26 : 11), box.y + topMetaH / 2, attachments.length, ownColor)}

        {node.notes && <circle cx={box.x + box.w - 7} cy={box.y + topMetaH / 2} r={5} fill="#f59e0b" className="mm-indicator" />}

        {(node.tags ?? []).length > 0 && (() => {
          const tags = (node.tags ?? []).slice(0, 5);
          const gap = 3;
          const tagH = 13;
          const tagY = box.y + topMetaH + (TAG_STRIP_H - tagH) / 2;
          const compact = tags.map((tag) => {
            const txt = tag.length > 14 ? `${tag.slice(0, 13)}…` : tag;
            const width = Math.min(box.w - 8, Math.max(18, 8 + txt.length * 5.5));
            const color = userLabels.find((l) => l.name === tag)?.color ?? 'var(--accent)';
            return { tag, txt, width, color };
          });
          const totalW = compact.reduce((sum, item) => sum + item.width, 0) + (compact.length - 1) * gap;
          let cursorX = box.x + Math.max(4, (box.w - totalW) / 2);
          return (
            <>
              <line x1={box.x + 6} y1={box.y + topMetaH + topTagH} x2={box.x + box.w - 6} y2={box.y + topMetaH + topTagH}
                stroke={ownColor ? '#ffffff22' : 'var(--mm-node-stroke)'} strokeWidth={0.5} />
              {compact.map((item) => {
                const x = cursorX;
                cursorX += item.width + gap;
                return (
                  <g key={item.tag} pointerEvents="none">
                    <rect x={x} y={tagY} width={item.width} height={tagH} rx={6.5} fill={item.color} opacity={0.92} />
                    <text
                      x={x + item.width / 2}
                      y={tagY + tagH / 2 + 0.5}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={8.5}
                      fontWeight={700}
                      fill="#fff"
                    >
                      {item.txt}
                    </text>
                  </g>
                );
              })}
            </>
          );
        })()}

        {checkedInfo && checkedInfo.total > 0 && (
          <text x={box.x + box.w - 8} y={bodyTopY + bodyH - 6} textAnchor="end" fontSize={9} fill={ownColor ? '#ffffff99' : 'var(--mm-statusbar-text)'}>{checkedInfo.checked}/{checkedInfo.total}</text>
        )}

        {(node.urls ?? []).map((urlItem, ui) => {
          const fy = bodyTopY + bodyH + previewHeight + ui * LINK_STRIP_H;
          const rawUrl = (urlItem.url ?? '').trim();
          const openUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
          return (
            <g key={`url-${ui}`}>
              <line x1={box.x + 4} y1={fy} x2={box.x + box.w - 4} y2={fy} stroke={ownColor ? '#ffffff33' : 'var(--mm-node-stroke)'} strokeWidth={0.5} />
              <text
                x={box.x + 8}
                y={fy + LINK_STRIP_H / 2 + 1.5}
                fontSize={10.5}
                fontWeight={600}
                fill={ownColor ? '#ffffff' : 'var(--accent)'}
                dominantBaseline="middle"
                className={`mm-url-link${ownColor ? ' mm-url-link--on-color' : ''}`}
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(openUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                {urlItem.label || rawUrl}
              </text>
            </g>
          );
        })}

        {node.children.length > 0 && node.id !== 'root' && (
          <g className="mm-collapse-btn"
            transform={`translate(${box.direction === 'left' ? box.x - 1 : box.x + box.w + 1}, ${box.y + box.h / 2})`}
            onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id); }}>
            <circle r={8} fill="var(--mm-collapse-fill)" stroke="var(--mm-collapse-stroke)" strokeWidth={1.5} />
            <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="var(--mm-collapse-text)" fontWeight="bold" y={0.5}>
              {node.collapsed ? `+${node.children.length}` : '−'}</text>
          </g>
        )}

        {node.id === 'root' && (() => {
          const leftChildren = node.children.filter((ch) => ch.side === 'left');
          const rightChildren = node.children.filter((ch) => ch.side !== 'left');
          return (
            <>
              {leftChildren.length > 0 && (
                <g
                  className="mm-collapse-btn"
                  transform={`translate(${box.x - 1}, ${box.y + box.h / 2})`}
                  onClick={(e) => { e.stopPropagation(); setRootLeftCollapsed((current) => !current); }}
                >
                  <circle r={8} fill="var(--mm-collapse-fill)" stroke="var(--mm-collapse-stroke)" strokeWidth={1.5} />
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="var(--mm-collapse-text)" fontWeight="bold" y={0.5}>
                    {rootLeftCollapsed ? `+${leftChildren.length}` : '−'}
                  </text>
                </g>
              )}
              {rightChildren.length > 0 && (
                <g
                  className="mm-collapse-btn"
                  transform={`translate(${box.x + box.w + 1}, ${box.y + box.h / 2})`}
                  onClick={(e) => { e.stopPropagation(); setRootRightCollapsed((current) => !current); }}
                >
                  <circle r={8} fill="var(--mm-collapse-fill)" stroke="var(--mm-collapse-stroke)" strokeWidth={1.5} />
                  <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="var(--mm-collapse-text)" fontWeight="bold" y={0.5}>
                    {rootRightCollapsed ? `+${rightChildren.length}` : '−'}
                  </text>
                </g>
              )}
            </>
          );
        })()}
      </g>,
    ];

    // Pass inherited color for connections: own color takes priority, otherwise keep propagating
    const colorForChildren = ownColor ?? inheritedColor;
    if (!node.collapsed) {
      for (const ch of node.children) {
        if (node.id === 'root') {
          const isLeftSide = ch.side === 'left';
          if (isLeftSide && rootLeftCollapsed) continue;
          if (!isLeftSide && rootRightCollapsed) continue;
        }
        elems.push(...renderNodes(ch, depth + 1, colorForChildren));
      }
    }
    return elems;
    }, [layout, selectedId, multiSelect, editingId, editText, dropTargetId, isDragging, searchResults,
      attachmentPreviewUrls, cancelHoverPopupClose, scheduleHoverPopupClose, commitEdit, cancelEdit, getNodeAttachments, onOpenNodeAttachment, toggleCollapse, toggleCheckbox,
      focusMode, focusedIds, rootLeftCollapsed, rootRightCollapsed]);  // eslint-disable-line react-hooks/exhaustive-deps

  const selNode = findNode(root, selectedId)?.node;
  const selectedNodeAttachments = selNode ? getNodeAttachments(selNode.id, selNode.attachments) : [];
  const notesReferencedAttachments = useMemo(() => {
    const ids = Array.from((notesText || '').matchAll(/attachment:\/\/([0-9a-fA-F-]{12,})/g)).map((match) => match[1]);
    const resolved: NodeAttachmentRef[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const attachment = attachmentById.get(id);
      if (attachment) resolved.push(attachment);
    }
    return resolved;
  }, [attachmentById, notesText]);
  const notesDialogAttachments = selectedNodeAttachments.length > 0 ? selectedNodeAttachments : notesReferencedAttachments;
  const selNodeAttachmentCount = notesDialogAttachments.length;
  const selNodeAttachmentLabel = selNodeAttachmentCount === 1 ? '1 file' : `${selNodeAttachmentCount} files`;
  const selNodeAttachmentNames = notesDialogAttachments.slice(0, 3).map((attachment) => attachment.name).join(', ');
  const hoveredNoteData = useMemo(() => {
    if (!hoveredNoteNodeId) return null;
    const found = findNode(root, hoveredNoteNodeId);
    const box = layout[hoveredNoteNodeId];
    if (!found || !box || !found.node.notes?.trim()) return null;
    const x = pan.x + (box.x + box.w + 10) * zoom;
    const y = pan.y + (box.y + Math.min(20, box.h / 2)) * zoom;
    return {
      x,
      y,
      title: getVisibleNodeTextLines(found.node.text)[0] || 'Note',
      html: renderNotesPreviewHtml(found.node.notes.trim()),
    };
  }, [hoveredNoteNodeId, layout, pan.x, pan.y, renderNotesPreviewHtml, root, zoom]);

  // ══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="mm-root" ref={containerRef}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="mm-toolbar">
        <div className="mm-toolbar-left">
          {onBack && (
            <button className="mm-btn" onClick={onBack} title="Back to vaults" style={{ padding: '0 8px', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
          )}
          <button
            className={`mm-btn mm-save-btn${isDirty ? ' mm-save-btn--dirty' : ''}${saving ? ' mm-save-btn--saving' : ''}${error ? ' mm-save-btn--err' : ''}${saveMsg ? ' mm-save-btn--ok' : ''}`}
            onClick={handleSave}
            disabled={saving || (!isDirty && !error)}
            title={saving ? 'Saving…' : error ? error : isDirty ? 'Unsaved changes — click to save (Ctrl+S)' : 'All changes saved'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>
        </div>
        <div className="mm-toolbar-center">
          <input ref={titleInputRef} className="mm-title-input" value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="Untitled" style={{ textAlign: 'center' }} />
          {versionLabel && (
            <span
              style={{ fontSize: 11, color: 'var(--mm-statusbar-text, #94a3b8)', flexShrink: 0, whiteSpace: 'nowrap', cursor: versionTooltip ? 'help' : 'default' }}
              title={versionTooltip}
            >
              {versionLabel}
            </span>
          )}
          {onRenameTitle && titleChanged && (
            <button className="mm-btn" onClick={onRenameTitle} disabled={renamingTitle} title="Rename vault (title only)"
              style={{ padding: '0 8px', flexShrink: 0, color: 'var(--accent)', border: '1px solid var(--accent)' }}>{renamingTitle ? '…' : 'Rename'}</button>
          )}
        </div>
        <div className="mm-toolbar-right">
          <input
            ref={nodeAttachmentInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              void attachFilesToSelectedNode(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <button className="mm-btn" onClick={undo} title="Undo (F9)" disabled={historyIdx <= 0}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a6 6 0 010 12H9m-6-12l4-4m-4 4l4 4"/></svg></button>
          <button className="mm-btn" onClick={redo} title="Redo (F10)" disabled={historyIdx >= history.length - 1}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a6 6 0 000 12h4m6-12l-4-4m4 4l-4 4"/></svg></button>
          <div className="mm-toolbar-sep" />
          <button className="mm-btn" onClick={() => addChild(selectedId)} title="Add child (Tab)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg></button>
          <button className="mm-btn" onClick={() => addSibling(selectedId)} title="Add sibling (Enter)" disabled={selectedId === 'root'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5H7m0 0v12m0-12l-3 3m3-3l3 3"/></svg></button>
          <button className="mm-btn mm-btn--danger" onClick={() => hasBulk ? bulkDelete() : deleteNode(selectedId)} title="Delete (Del)" disabled={selectedId === 'root' && !hasBulk}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
          <div className="mm-toolbar-sep" />
          <button className="mm-btn" onClick={() => { hasBulk ? bulkToggleCheckbox() : toggleCheckbox(selectedId); }} title="Checkbox (C)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></button>
          <button className="mm-btn" onClick={() => { hasBulk ? bulkCycleProgress() : cycleProgress(selectedId); }} title="Progress (P)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 017.07 17.07" strokeLinecap="round"/></svg></button>
          <div style={{ position: 'relative' }}>
            <button className="mm-btn mm-btn--color" onClick={() => setShowColorPicker((v) => !v)} title="Color (F4)" style={{ background: selNode?.color ?? 'transparent' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
            </button>
            <MindMapColorPicker open={showColorPicker} currentColor={selNode?.color ?? null} onSelect={(c) => { hasBulk ? bulkSetColor(c) : setNodeColor(selectedId, c); setShowColorPicker(false); }} onClose={() => setShowColorPicker(false)} showToast={showToast} />
          </div>
          <button
            className={`mm-btn mm-btn--notes${selNodeAttachmentCount > 0 ? ' mm-btn--notes-has-files' : ''}`}
            onClick={() => { openNotes(selectedId); setNotesOpen(true); }}
            title={selNodeAttachmentCount > 0 ? `Notes (F3) · ${selNodeAttachmentLabel}${selNodeAttachmentNames ? `: ${selNodeAttachmentNames}` : ''}` : 'Notes (F3)'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            {selNodeAttachmentCount > 0 && (
              <span className="mm-btn-notes-meta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 11-2.82-2.82l8.48-8.48"/></svg>
                <span>{selNodeAttachmentCount}</span>
              </span>
            )}
          </button>
          <button className="mm-btn" onClick={() => setShowDateDialog(true)} title="Dates (D)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
          <button className={`mm-btn${showTagDialog ? ' mm-btn--active' : ''}`} onClick={() => setShowTagDialog((v) => !v)} title="Labels (T)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5l8.5 8.5a2 2 0 010 2.83l-5.17 5.17a2 2 0 01-2.83 0L3 10V5a2 2 0 012-2z"/></svg></button>
          <div className="mm-toolbar-sep" />
          <button className="mm-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} title="Zoom in (+)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 8v6m-3-3h6"/></svg></button>
          <button className="mm-btn" onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} title="Zoom out (-)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M8 11h6"/></svg></button>
          <button className="mm-btn" onClick={fitView} title="Fit view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"/></svg></button>
          <button className="mm-btn" onClick={() => autoAlignSubtree(selectedId)} title={selectedId === 'root' ? 'Auto-align all nodes (A)' : 'Auto-align subtree (A)'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h12M3 18h8"/></svg></button>
          <button className={`mm-btn${focusMode ? ' mm-btn--active' : ''}`} onClick={() => { setFocusMode((v) => { if (!v) setFocusAnchorId(selectedId); return !v; }); }} title="Focus mode (F5)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2m8.66-17.66l-1.41 1.41M4.75 19.25l-1.41 1.41M23 12h-2M3 12H1m17.66 7.66l-1.41-1.41M4.75 4.75L3.34 3.34"/></svg></button>
          <button className="mm-btn" onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 50); }} title="Search (Ctrl+F)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
          <div className="mm-toolbar-sep" />
          <button className="mm-btn" onClick={() => setShowShortcuts((v) => !v)} title="Shortcuts (F1)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg></button>
          <button
            className="mm-btn"
            onClick={() => nodeAttachmentInputRef.current?.click()}
            title="Attach encrypted files to selected node (F6)"
            disabled={!onNodeFileDrop || selectedId === 'root'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a6 6 0 11-8.49-8.49l9.2-9.19a4 4 0 015.65 5.66l-9.2 9.19a2 2 0 11-2.82-2.82l8.48-8.48"/></svg>
          </button>
          {onExportMarkdown && <div className="mm-toolbar-sep" />}
          {onExportMarkdown && (
            <div style={{ position: 'relative' }}>
              <button className="mm-btn" onClick={() => setShowExportMenu((v) => !v)} title="Export">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              </button>
              {showExportMenu && (
                <div
                  style={{ position: 'absolute', right: 0, top: '100%', zIndex: 300, background: 'var(--mm-node-fill, #1e293b)', border: '1px solid var(--mm-node-stroke, #334155)', borderRadius: 8, padding: '4px 0', minWidth: 150, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {onExportMarkdown && (
                    <button className="mm-context-item" onClick={() => { onExportMarkdown({ version: 'tree', root: cloneTree(root), view_state: { pan_x: Math.round(pan.x), pan_y: Math.round(pan.y), zoom: Number(zoom.toFixed(3)), focus_mode: focusMode, focus_anchor_id: focusAnchorId, selected_node_id: selectedId } }, buildExportFileBaseName(title)); setShowExportMenu(false); }}>
                      Markdown (.md)
                    </button>
                  )}
                  <button className="mm-context-item" onClick={() => { exportPng(); setShowExportMenu(false); }}>
                    PNG image
                  </button>
                  <button className="mm-context-item" onClick={() => { exportPdf(); setShowExportMenu(false); }}>
                    PDF document
                  </button>
                </div>
              )}
            </div>
          )}
          <ThemePanel />
        </div>
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      {searchOpen && (
        <div className="mm-search-bar">
          <svg className="mm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={searchRef} className="mm-search-input" placeholder="Search nodes…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) searchNext(); if (e.key === 'Enter' && e.shiftKey) searchPrev(); if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); } e.stopPropagation(); }} />
          {searchResults.length > 0 && <span className="mm-search-count">{searchIdx + 1}/{searchResults.length}</span>}
          <button className="mm-btn-icon" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      )}

      {/* ── Canvas ──────────────────────────────────────────────────── */}
      <div className="mm-canvas-wrap">
        <svg ref={svgRef} className="mm-canvas" onWheel={onWheel} onMouseDown={onMouseDownSvg} onMouseMove={onMouseMoveSvg} onMouseUp={onMouseUpSvg} onMouseLeave={onMouseUpSvg}
          onDragOver={onDragOverSvg} onDragLeave={onDragLeaveSvg} onDrop={(e) => { void onDropSvg(e); }}
          onClick={() => { setShowColorPicker(false); setContextMenu(null); }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            <g className="mm-connections">{renderConnections(root)}</g>
            <g className="mm-nodes">{renderNodes(root)}</g>
            {rectSel && (() => {
              const rx = Math.min(rectSel.startX, rectSel.curX);
              const ry = Math.min(rectSel.startY, rectSel.curY);
              const rw = Math.abs(rectSel.curX - rectSel.startX);
              const rh = Math.abs(rectSel.curY - rectSel.startY);
              return <rect x={rx} y={ry} width={rw} height={rh} fill="var(--accent)" fillOpacity={0.08} stroke="var(--accent)" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom}`} />;
            })()}
          </g>
        </svg>
        {fileDropBusyNodeId && <div className="mm-file-drop-badge">Encrypting dropped files…</div>}
        {hoveredNoteData && (
          <div
            ref={hoverPopupRef}
            className="mm-note-hover"
            style={{ left: hoveredNoteData.x, top: hoveredNoteData.y }}
            tabIndex={0}
            onMouseEnter={() => {
              cancelHoverPopupClose();
              setHoveringNotePopup(true);
              hoverPopupRef.current?.focus();
            }}
            onMouseLeave={() => {
              setHoveringNotePopup(false);
              setHoveredNoteNodeId(null);
            }}
            onWheel={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="mm-note-hover-title">{hoveredNoteData.title}</div>
            <div className="mm-note-hover-text" dangerouslySetInnerHTML={{ __html: hoveredNoteData.html }} />
          </div>
        )}
        {shortcutToast && (<div className="mm-shortcut-toast"><span className="mm-shortcut-toast-key">{shortcutToast.split('—')[0].trim()}</span>{shortcutToast.includes('—') && <span className="mm-shortcut-toast-desc">{shortcutToast.split('—')[1]?.trim()}</span>}</div>)}
      </div>

      {/* ── Status bar ──────────────────────────────────────────────── */}
      <div className="mm-statusbar">
        <span>{flattenTree(root).length} node{flattenTree(root).length !== 1 ? 's' : ''}{multiSelect.size > 0 ? ` · ${multiSelect.size} selected` : ''}</span>
        <span>{selNode ? `Selected: ${selNode.text.split('\n')[0]}` : ''}</span>
        <span className="mm-statusbar-hint">Tab=child · Enter=sibling · F2=rename · F6=attach file · Space=fold · C=check · P=progress · D=date · Ctrl+F=search</span>
      </div>

      {/* ── Context menu ────────────────────────────────────────────── */}
      {contextMenu && (() => {
        const cmFind = findNode(root, contextMenu.nodeId);
        if (!cmFind) return null;
        const cmNode = cmFind.node;
        const cmIsRoot = contextMenu.nodeId === 'root';
        const cmHasChildren = cmNode.children.length > 0;
        const cmCanMoveUp = cmFind.parent != null && cmFind.index > 0;
        const cmCanMoveDown = cmFind.parent != null && cmFind.index < (cmFind.parent.children.length - 1);
        const cmHasCheckbox = cmNode.checked != null;
        return (<>
          <div className="mm-context-overlay" onClick={() => setContextMenu(null)} />
          <div className="mm-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="mm-context-header">{cmNode.text.substring(0, 30) || 'Node'}</div>
            <button className="mm-context-item" onClick={() => { const f = findNode(root, contextMenu.nodeId); if (f) startEditing(f.node); setContextMenu(null); }}>Rename <kbd>F2</kbd></button>
            <button className="mm-context-item" onClick={() => { addChild(contextMenu.nodeId); setContextMenu(null); }}>Add Child <kbd>Tab</kbd></button>
            {cmIsRoot && <button className="mm-context-item" onClick={() => { addChild('root', 'left'); setContextMenu(null); }}>Add Left Child <kbd>⇧Tab</kbd></button>}
            {!cmIsRoot && <button className="mm-context-item" onClick={() => { addSibling(contextMenu.nodeId); setContextMenu(null); }}>Add Sibling <kbd>Enter</kbd></button>}
            <div className="mm-context-divider" />
            {cmHasChildren && <button className="mm-context-item" onClick={() => { toggleCollapse(contextMenu.nodeId); setContextMenu(null); }}>{cmNode.collapsed ? 'Expand' : 'Collapse'} <kbd>Space</kbd></button>}
            <button className="mm-context-item" onClick={() => { openNotes(contextMenu.nodeId); setNotesOpen(true); setContextMenu(null); }}>Notes <kbd>F3</kbd></button>
            <button className="mm-context-item" onClick={() => {
              cmHasCheckbox ? toggleCheckbox(contextMenu.nodeId) : addCheckbox(contextMenu.nodeId);
              setContextMenu(null);
            }}>{cmHasCheckbox ? (cmNode.checked ? 'Uncheck' : 'Check') : 'Add Checkbox'} <kbd>C</kbd></button>
            {cmHasCheckbox && <button className="mm-context-item" onClick={() => { removeCheckbox(contextMenu.nodeId); setContextMenu(null); }}>Remove Checkbox</button>}
            <div className="mm-context-item mm-context-progress-row">Progress
              <div className="mm-context-progress-presets">
                <span className={`mm-ctx-progress${cmNode.progress == null ? ' active' : ''}`} onClick={() => {
                  setNodeProgress(contextMenu.nodeId, null);
                  setContextMenu(null);
                }}>✕</span>
                {PROGRESS_PRESETS.map((pct) => (<span key={pct} className={`mm-ctx-progress${cmNode.progress === pct ? ' active' : ''}`} onClick={() => {
                  setNodeProgress(contextMenu.nodeId, pct);
                  setContextMenu(null);
                }}>{pct}</span>))}
              </div><kbd>P</kbd>
            </div>
            <button className="mm-context-item" onClick={() => { setShowDateDialog(true); setContextMenu(null); }}>Date Planning <kbd>D</kbd></button>
            <button className="mm-context-item" onClick={() => { setShowUrlDialog(true); setContextMenu(null); }}>Add URL <kbd>U</kbd></button>
            <button className="mm-context-item" onClick={() => { setShowTagDialog(true); setContextMenu(null); }}>Labels <kbd>T</kbd></button>
            <div className="mm-context-divider" />
            {!cmIsRoot && cmCanMoveUp && <button className="mm-context-item" onClick={() => { moveNode(contextMenu.nodeId, 'up'); setContextMenu(null); }}>Move Up</button>}
            {!cmIsRoot && cmCanMoveDown && <button className="mm-context-item" onClick={() => { moveNode(contextMenu.nodeId, 'down'); setContextMenu(null); }}>Move Down</button>}
            {!cmIsRoot && <button className="mm-context-item" onClick={() => { duplicateNode(contextMenu.nodeId); setContextMenu(null); }}>Duplicate</button>}
            <button className="mm-context-item" onClick={() => { resetNodePosition(contextMenu.nodeId); setContextMenu(null); }}>Reset Position <kbd>R</kbd></button>
            <button className="mm-context-item" onClick={() => { autoAlignSubtree(contextMenu.nodeId); setContextMenu(null); }}>Auto-align subtree <kbd>A</kbd></button>
            {!cmIsRoot && (<><div className="mm-context-divider" /><button className="mm-context-item mm-context-danger" onClick={() => { deleteNode(contextMenu.nodeId); setContextMenu(null); }}>Delete <kbd>Del</kbd></button></>)}
          </div>
        </>);
      })()}

      {/* ── Notes panel ─────────────────────────────────────────────── */}
      {/* ── Tag dialog ─────────────────────────────────────────────── */}
      {showTagDialog && (() => {
        const nodeForTags = findNode(root, selectedId)?.node;
        const currentTags = nodeForTags?.tags ?? [];
        const applyTag = (t: string) => {
          if (!currentTags.includes(t)) setNodeTags(selectedId, [...currentTags, t]);
        };
        const libraryOnlyLabels = userLabels.filter((l) => !currentTags.includes(l.name));
        return (
          <div className="mm-tag-dialog" style={{ position: 'absolute', right: 12, top: 60, zIndex: 200 }}>
            <div className="mm-tag-dialog-title">Labels — {getVisibleNodeTextLines(nodeForTags?.text ?? '')[0] || 'Node'}</div>
            <div className="mm-tag-chips">
              {currentTags.map((tag) => {
                const lib = userLabels.find((l) => l.name === tag);
                return (
                  <span key={tag} className="mm-tag-chip" style={lib ? { background: lib.color } : {}}>
                    {tag}
                    <button onClick={() => setNodeTags(selectedId, currentTags.filter((t) => t !== tag))}>×</button>
                  </span>
                );
              })}
              {currentTags.length === 0 && <span style={{ fontSize: 11, opacity: 0.5 }}>No labels yet</span>}
            </div>
            <div className="mm-tag-input-row">
              <input className="mm-tag-input" placeholder="Add label…" value={tagInputValue}
                onChange={(e) => setTagInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInputValue.trim()) {
                    const t = tagInputValue.trim().toLowerCase();
                    if (!userLabels.some((l) => l.name === t)) addUserLabel(t, tagInputColor);
                    applyTag(t);
                    setTagInputValue('');
                    e.stopPropagation();
                  }
                  if (e.key === 'Escape') { setShowTagDialog(false); e.stopPropagation(); }
                }}
                autoFocus
              />
              <label title="Label color" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ width: 16, height: 16, borderRadius: 999, background: tagInputColor, border: '1px solid rgba(255,255,255,0.35)' }} />
                <input
                  type="color"
                  value={tagInputColor}
                  onChange={(e) => setTagInputColor(e.target.value)}
                  style={{ opacity: 0, position: 'absolute', width: 1, height: 1, pointerEvents: 'none' }}
                />
              </label>
              <button className="mm-tag-add-btn" disabled={!tagInputValue.trim()}
                onClick={() => {
                  const t = tagInputValue.trim().toLowerCase();
                  if (t) {
                    if (!userLabels.some((l) => l.name === t)) addUserLabel(t, tagInputColor);
                    applyTag(t);
                    setTagInputValue('');
                  }
                }}>Add</button>
              <button className="mm-tag-add-btn" title="Save to library"
                disabled={!tagInputValue.trim()}
                onClick={() => {
                  const t = tagInputValue.trim().toLowerCase();
                  if (t) { addUserLabel(t, tagInputColor); applyTag(t); setTagInputValue(''); }
                }}>📌</button>
            </div>
            {(userLabels.length > 0) && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your library</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {userLabels.map((lbl) => (
                    <span key={lbl.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <button
                        onClick={() => applyTag(lbl.name)}
                        style={{ background: lbl.color, color: '#fff', borderRadius: 8, padding: '1px 8px', fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: libraryOnlyLabels.includes(lbl) ? 1 : 0.45 }}
                        title={currentTags.includes(lbl.name) ? 'Already applied' : 'Apply to node'}
                      >{lbl.name}</button>
                      {/* Color swatch — clicking opens native color picker */}
                      <label title="Change color" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: lbl.color, border: '1px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
                        <input
                          type="color"
                          value={lbl.color}
                          style={{ opacity: 0, position: 'absolute', width: 1, height: 1, pointerEvents: 'none' }}
                          onChange={(e) => updateLabelColor(lbl.name, e.target.value)}
                        />
                      </label>
                      <button onClick={() => removeUserLabel(lbl.name)} style={{ fontSize: 9, opacity: 0.5, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }} title="Remove from library">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <MindMapNotesDialog
        open={notesOpen}
        notesDropActive={notesDropActive}
        nodeTitle={getVisibleNodeTextLines(selNode?.text ?? '')[0] || 'Untitled node'}
        hasNodeNotes={Boolean(selNode?.notes?.trim())}
        nodeTags={(selNode?.tags ?? []).map((tag) => ({ name: tag, color: userLabels.find((label) => label.name === tag)?.color ?? 'var(--accent)' }))}
        attachmentCount={selNodeAttachmentCount}
        attachmentLabel={selNodeAttachmentLabel}
        attachments={notesDialogAttachments}
        attachmentPreviewUrls={attachmentPreviewUrls}
        canDeleteAttachment={Boolean(onDeleteNodeAttachment)}
        showMarkdownHelp={showMarkdownHelp}
        notesUploadBusy={notesUploadBusy}
        notesText={notesText}
        notesPreviewHtml={notesPreviewHtml}
        notesRef={notesRef}
        notesAttachmentInputRef={notesAttachmentInputRef}
        onClose={() => setNotesOpen(false)}
        onDragOver={(e) => {
          if (!onNodeFileDrop) return;
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setNotesDropActive(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setNotesDropActive(false);
        }}
        onDrop={(e) => {
          if (!onNodeFileDrop) return;
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length > 0) {
            void uploadFilesIntoNotes(files);
          } else {
            setNotesDropActive(false);
          }
        }}
        onOpenAttachment={(attachment) => { void onOpenNodeAttachment?.(attachment); }}
        onDeleteAttachment={(attachment) => { void deleteNotesAttachment(attachment); }}
        onAddAttachmentFiles={(files) => { void uploadFilesIntoNotes(files); }}
        onInsertMarkdownAction={insertMarkdownAction}
        onToggleMarkdownHelp={() => setShowMarkdownHelp((v) => !v)}
        onNotesTextChange={setNotesText}
        onNotesPaste={(e) => {
          const files = Array.from(e.clipboardData.items)
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));
          if (files.length > 0) {
            e.preventDefault();
            void uploadFilesIntoNotes(files);
          }
        }}
        onSaveNotes={saveNotes}
        onDeleteNotes={deleteNotes}
      />

      {/* ── Shortcuts panel ─────────────────────────────────────────── */}
      {showShortcuts && (
        <div className="mm-shortcuts-panel" style={shortcutsPos ? { left: shortcutsPos.x, top: shortcutsPos.y, right: 'auto' } : undefined}>
          <div className="mm-notes-header" style={{ cursor: 'grab', userSelect: 'none' }}
            onMouseDown={(e) => {
              const el = (e.currentTarget.parentElement as HTMLDivElement);
              const rect = el.getBoundingClientRect();
              scDragRef.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
              const onMove = (me: MouseEvent) => {
                if (!scDragRef.current) return;
                setShortcutsPos({ x: me.clientX - scDragRef.current.offsetX, y: me.clientY - scDragRef.current.offsetY });
              };
              const onUp = () => { scDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          ><span>Keyboard Shortcuts</span>
            <button className="mm-btn-icon" onClick={() => setShowShortcuts(false)}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div className="mm-shortcuts-grid">{[
            ['Tab', 'Add child'], ['⇧Tab', 'Add left child (root)'], ['Enter', 'Add sibling'], ['Del / ⌫', 'Delete node'], ['F2', 'Rename'], ['F3', 'Notes'],
            ['F4', 'Colour picker'], ['F5 / F', 'Focus mode'], ['F6', 'Attach encrypted file'], ['F1', 'Shortcuts'], ['F9 / Ctrl+Z', 'Undo'], ['F10 / Ctrl+Y', 'Redo'], ['Space', 'Fold / Unfold'],
            ['↑ ↓ ← →', 'Navigate (spatial)'], ['⇧+Arrow', 'Multi-select'], ['Ctrl+Click', 'Toggle select'], ['⇧+Drag', 'Rectangle select'],
            ['Home', 'Root'], ['+ −', 'Zoom'], ['Ctrl+S', 'Save'],
            ['C', 'Checkbox'], ['P', 'Progress'], ['D', 'Dates'], ['U', 'URL'], ['R', 'Reset pos'],
            ['Ctrl+⇧R', 'Reset all'], ['Ctrl+F', 'Search'], ['Esc', 'Cancel / Clear'],
          ].map(([k, v]) => (<div key={k} className="mm-shortcut-row"><kbd className="mm-kbd">{k}</kbd><span>{v}</span></div>))}</div>
        </div>
      )}

      {/* ── Date dialog ─────────────────────────────────────────────── */}
      <MindMapDateDialog open={showDateDialog} startDate={selNode?.startDate ?? null} endDate={selNode?.endDate ?? null}
        onSave={(s, e) => setNodeDates(selectedId, s, e)} onClose={() => setShowDateDialog(false)} />

      {/* ── URL dialog ──────────────────────────────────────────────── */}
      {showUrlDialog && (<>
        <div className="mm-overlay" onClick={() => setShowUrlDialog(false)} />
        <div className="mm-date-dialog">
          <div className="mm-date-header">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path strokeLinecap="round" strokeLinejoin="round" d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            <span>Add URL</span>
            <button className="mm-btn-icon" onClick={() => setShowUrlDialog(false)} style={{ marginLeft: 'auto' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div className="mm-date-body">
            <label className="mm-date-label">URL</label>
            <input className="mm-date-input" type="url" placeholder="https://…" value={urlDraft.url} onChange={(e) => setUrlDraft((d) => ({ ...d, url: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Escape') setShowUrlDialog(false); e.stopPropagation(); }} />
            <label className="mm-date-label">Label (optional)</label>
            <input className="mm-date-input" type="text" placeholder="Display text" value={urlDraft.label} onChange={(e) => setUrlDraft((d) => ({ ...d, label: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowUrlDialog(false); if (e.key === 'Enter' && urlDraft.url.trim()) { addNodeUrl(selectedId, { url: urlDraft.url.trim(), label: urlDraft.label.trim() }); setUrlDraft({ url: '', label: '' }); setShowUrlDialog(false); } e.stopPropagation(); }} />
            {(selNode?.urls ?? []).length > 0 && (<div style={{ marginTop: 8 }}>
              <label className="mm-date-label">Current URLs</label>
              {(selNode?.urls ?? []).map((u, i) => (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 4 }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--accent)' }}>{u.label || u.url}</span>
                <button className="mm-btn mm-btn--danger" style={{ padding: '0 6px', height: 22, fontSize: 10 }} onClick={() => removeNodeUrl(selectedId, i)}>✕</button>
              </div>))}
            </div>)}
          </div>
          <div className="mm-date-footer">
            <button className="mm-btn mm-btn--primary" disabled={!urlDraft.url.trim()} onClick={() => { addNodeUrl(selectedId, { url: urlDraft.url.trim(), label: urlDraft.label.trim() }); setUrlDraft({ url: '', label: '' }); setShowUrlDialog(false); }}>Add URL</button>
            <button className="mm-btn" onClick={() => setShowUrlDialog(false)}>Cancel</button>
          </div>
        </div>
      </>)}
    </div>
  );
}

export const MindMapEditor = DesktopMindMapEditor;
