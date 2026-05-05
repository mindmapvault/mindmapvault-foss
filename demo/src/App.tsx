import { useCallback, useEffect, useMemo, useState } from 'react';
import { DesktopMindMapEditor } from '../../frontend_app/src/components/MindMapEditor';
import { encryptTree } from '../../frontend_app/src/crypto/vault';
import { randomBytes, toBase64 } from '../../frontend_app/src/crypto/utils';
import { treeToMarkdown } from '../../frontend_app/src/utils/markdownExport';
import { useThemeStore } from '../../frontend_app/src/store/theme';
import type { MindMapTree } from '../../frontend_app/src/types';

const DEMO_STORAGE_KEY = 'mindmapvault:foss:canvas-demo:v1';
const USER_LABELS_STORAGE_KEY = 'user-labels';

const DEMO_LABEL_LIBRARY: Array<{ name: string; color: string }> = [
  { name: 'demo', color: '#7c3aed' },
  { name: 'foss', color: '#06b6d4' },
  { name: 'interactive', color: '#ec4899' },
  { name: 'ui', color: '#3b82f6' },
  { name: 'privacy', color: '#10b981' },
  { name: 'crypto', color: '#3b82f6' },
  { name: 'zero-knowledge', color: '#22c55e' },
  { name: 'post-quantum', color: '#f59e0b' },
  { name: 'render-check', color: '#f97316' },
  { name: 'showcase', color: '#ef4444' },
];

interface DemoSnapshot {
  title: string;
  tree: MindMapTree;
}

function normalizeDemoLayout(tree: MindMapTree, isMobile: boolean): MindMapTree {
  const cloned = JSON.parse(JSON.stringify(tree)) as MindMapTree;

  const clearCustomPositions = (node: MindMapTree['root']): void => {
    node.customX = undefined;
    node.customY = undefined;
    node.children.forEach(clearCustomPositions);
  };

  clearCustomPositions(cloned.root);

  for (const child of cloned.root.children) {
    child.side = child.id === 'demo-crypto' ? 'left' : 'right';
  }

  if (isMobile) {
    cloned.view_state = {
      ...(cloned.view_state ?? {}),
      pan_x: 40,
      pan_y: 210,
      zoom: 0.74,
      focus_mode: false,
      focus_anchor_id: null,
      selected_node_id: 'demo-1-2',
    };
  }

  return cloned;
}

function hasNode(tree: MindMapTree, nodeId: string): boolean {
  const walk = (node: MindMapTree['root']): boolean => {
    if (node.id === nodeId) return true;
    return node.children.some(walk);
  };
  return walk(tree.root);
}

function seedDemoLabelLibrary(): void {
  try {
    const raw = localStorage.getItem(USER_LABELS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const existing = Array.isArray(parsed) ? (parsed as Array<{ name?: string; color?: string }>) : [];

    const normalized = new Map<string, { name: string; color: string }>();
    for (const entry of existing) {
      const name = typeof entry?.name === 'string' ? entry.name.trim().toLowerCase() : '';
      const color = typeof entry?.color === 'string' ? entry.color : '#7c3aed';
      if (!name) continue;
      normalized.set(name, { name, color });
    }

    for (const label of DEMO_LABEL_LIBRARY) {
      if (!normalized.has(label.name)) {
        normalized.set(label.name, label);
      }
    }

    localStorage.setItem(USER_LABELS_STORAGE_KEY, JSON.stringify(Array.from(normalized.values())));
  } catch {
    localStorage.setItem(USER_LABELS_STORAGE_KEY, JSON.stringify(DEMO_LABEL_LIBRARY));
  }
}

function parseSnapshot(raw: string | null): DemoSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.title !== 'string') return null;
    if (!parsed.tree || typeof parsed.tree !== 'object') return null;
    return {
      title: parsed.title,
      tree: parsed.tree as MindMapTree,
    };
  } catch {
    return null;
  }
}

function createStarterTree(): MindMapTree {
  return {
    version: 'tree',
    root: {
      id: 'root',
      text: 'MindMapVault FOSS Demo',
      collapsed: false,
      tags: ['demo', 'foss'],
      notes: `# MindMapVault FOSS Browser Demo\n\nThis is a browser-only playground for article readers.\n\n- No account required\n- No backend calls\n- Local-first persistence in browser storage\n\n## What to test\n\n1. Node editing and drag behavior\n2. Theme switching (dark/light)\n3. Notes markdown preview quality\n4. Multi-color tag chips and metadata strips\n5. Encrypted export actions\n`,
      children: [
        {
          id: 'demo-1',
          text: 'Try the canvas UI',
          collapsed: false,
          side: 'right',
          icons: ['Target', 'Sparkles'],
          checked: true,
          progress: 75,
          tags: ['ui', 'interactive'],
          notes: 'This branch highlights editor interactions and rendering details.',
          children: [
            {
              id: 'demo-1-1',
              text: 'Drag nodes',
              collapsed: false,
              icons: ['Move3D'],
              checked: true,
              progress: 100,
              notes: 'Drag a node and drop it on another node to re-parent.',
              children: [],
            },
            {
              id: 'demo-1-2',
              text: 'Edit text inline',
              collapsed: false,
              icons: ['Pencil'],
              checked: false,
              progress: 50,
              urls: [{ label: 'Keyboard Shortcuts', url: 'https://www.mindmapvault.com' }],
              notes: 'Use F2 to rename quickly and Enter/Tab for structure changes.',
              children: [],
            },
            {
              id: 'demo-1-3',
              text: 'Icons + pie + tags\n+ dates + notes',
              collapsed: false,
              icons: ['Calendar', 'PieChart', 'Flag'],
              progress: 25,
              tags: ['render-check', 'showcase'],
              startDate: '2026-05-01T09:00',
              endDate: '2026-05-18T18:00',
              notes: 'Visual QA node: icons, progress pie, tags, and date badges.',
              children: [],
            },
          ],
        },
        {
          id: 'demo-2',
          text: 'Local browser-only mode',
          collapsed: false,
          side: 'right',
          notes: 'All current work stays in browser localStorage.',
          children: [
            {
              id: 'demo-2-1',
              text: 'No backend calls',
              collapsed: false,
              icons: ['ServerOff'],
              checked: true,
              progress: 100,
              tags: ['privacy'],
              children: [],
            },
            {
              id: 'demo-2-2',
              text: 'Stored in localStorage',
              collapsed: false,
              icons: ['HardDrive'],
              checked: true,
              progress: 100,
              notes: 'Close and reopen the page to confirm data persists locally.',
              children: [],
            },
            {
              id: 'demo-2-3',
              text: 'Encrypted exports',
              collapsed: false,
              icons: ['Download'],
              checked: true,
              progress: 100,
              tags: ['crypto'],
              children: [],
            },
          ],
        },
        {
          id: 'demo-crypto',
          text: 'Crypto architecture map',
          collapsed: false,
          side: 'left',
          icons: ['Shield', 'Lock'],
          tags: ['crypto', 'showcase'],
          notes: `# Cryptography Overview\n\nThis branch mirrors the article visual so readers can inspect rendering quality.\n\n## Included topics\n\n- Zero-knowledge key derivation\n- AES-256-GCM encrypted blobs\n- Hybrid key management (X25519 + ML-KEM-768)\n- Mind map editor workflow\n\n## Preview stress test\n\nThis note intentionally contains a longer markdown block to test line wrapping,\nheading hierarchy, list spacing, and paragraph rendering in the hover preview.\n`,
          children: [
            {
              id: 'demo-crypto-1',
              text: 'Zero Knowledge',
              collapsed: false,
              color: '#22c55e',
              tags: ['zero-knowledge'],
              children: [
                { id: 'demo-crypto-1-1', text: 'Argon2id', collapsed: false, children: [{ id: 'demo-crypto-1-1-a', text: 'Master Key', collapsed: false, children: [] }] },
                { id: 'demo-crypto-1-2', text: 'HKDF-SHA256', collapsed: false, children: [] },
                { id: 'demo-crypto-1-3', text: 'Auth Token', collapsed: false, children: [] },
              ],
            },
            {
              id: 'demo-crypto-2',
              text: 'Encryption',
              collapsed: false,
              color: '#3b82f6',
              tags: ['crypto'],
              children: [
                { id: 'demo-crypto-2-1', text: 'AES-256-GCM', collapsed: false, children: [{ id: 'demo-crypto-2-1-a', text: 'E2E Blob', collapsed: false, children: [] }] },
              ],
            },
            {
              id: 'demo-crypto-3',
              text: 'Key Management',
              collapsed: false,
              color: '#ef4444',
              tags: ['post-quantum'],
              children: [
                { id: 'demo-crypto-3-1', text: 'X25519', collapsed: false, children: [{ id: 'demo-crypto-3-1-a', text: 'ECDH', collapsed: false, children: [] }] },
                { id: 'demo-crypto-3-2', text: 'ML-KEM-768', collapsed: false, children: [{ id: 'demo-crypto-3-2-a', text: 'Post-Quantum', collapsed: false, children: [] }] },
                { id: 'demo-crypto-3-3', text: 'Ephemeral DEK', collapsed: false, children: [] },
                { id: 'demo-crypto-3-4', text: 'Hybrid KEM', collapsed: false, children: [] },
              ],
            },
            {
              id: 'demo-crypto-4',
              text: 'Mind Map Editor',
              collapsed: false,
              color: '#8b5cf6',
              notes: `## Longer markdown sample\n\nThe note preview should handle:\n\n- Long paragraphs that wrap across multiple lines for readability.\n- Secondary bullet lists and headings.\n- Emphasis, links, and inline code like \`AES-256-GCM\`.\n\n### Example references\n\n1. [MindMapVault project page](https://mindmapvault.app)\n2. [GitHub repository](https://github.com)\n\nThis block is intentionally verbose so you can validate hover-preview behavior in both dark and light themes.\n`,
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function downloadBytes(bytes: Uint8Array, fileName: string, contentType: string): void {
  const payload = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([payload], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function downloadJsonFile(payload: unknown, fileName: string): void {
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  downloadBytes(bytes, fileName, 'application/json');
}

function normalizeFileBaseName(input: string): string {
  const clean = input.trim().replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 80);
  return clean || 'mindmapvault-demo';
}

export default function App() {
  const mode = useThemeStore((state) => state.mode);
  const primaryColor = useThemeStore((state) => state.primaryColor);
  const setMode = useThemeStore((state) => state.setMode);
  const brandLogoSrc = `${import.meta.env.BASE_URL}favicon.svg`;
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia('(max-width: 900px), (pointer: coarse)');
    const handleChange = () => setIsMobileView(query.matches);
    handleChange();
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const initialSnapshot = useMemo(() => {
    seedDemoLabelLibrary();
    const parsed = parseSnapshot(localStorage.getItem(DEMO_STORAGE_KEY));
    if (parsed && hasNode(parsed.tree, 'demo-crypto')) {
      return {
        title: parsed.title,
        tree: normalizeDemoLayout(parsed.tree, isMobileView),
      };
    }
    return {
      title: 'FOSS Canvas Playground',
      tree: normalizeDemoLayout(createStarterTree(), isMobileView),
    };
  }, [isMobileView]);

  const [title, setTitle] = useState(initialSnapshot.title);
  const [savedTitle, setSavedTitle] = useState(initialSnapshot.title);
  const [initialTree, setInitialTree] = useState(initialSnapshot.tree);
  const [currentTree, setCurrentTree] = useState(initialSnapshot.tree);
  const [saveMsg, setSaveMsg] = useState('Local browser-only demo');
  const [error, setError] = useState('');
  const saving = false;
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', mode === 'light');
    root.style.setProperty('--accent', primaryColor);
    root.style.setProperty('--accent-hover', '#6D28D9');
  }, [mode, primaryColor]);

  const persistSnapshot = useCallback((nextTitle: string, nextTree: MindMapTree) => {
    const snapshot: DemoSnapshot = { title: nextTitle, tree: nextTree };
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot));
  }, []);

  const handleTitleChange = useCallback((nextTitle: string) => {
    setTitle(nextTitle);
    persistSnapshot(nextTitle, currentTree);
  }, [currentTree, persistSnapshot]);

  const handleTreeChange = useCallback((nextTree: MindMapTree) => {
    setCurrentTree(nextTree);
    persistSnapshot(title, nextTree);
  }, [persistSnapshot, title]);

  const handleSave = useCallback(async (_nextTree: MindMapTree, _nextTitle: string) => {
    setSaveMsg('Save is disabled in demo mode');
    setError('');
  }, []);

  const handleRename = useCallback(async () => {
    setRenamingTitle(true);
    try {
      persistSnapshot(title, currentTree);
      setSavedTitle(title);
      setSaveMsg('Title saved locally');
      setError('');
    } finally {
      setRenamingTitle(false);
    }
  }, [currentTree, persistSnapshot, title]);

  const resetDemo = useCallback(() => {
    const nextTree = normalizeDemoLayout(createStarterTree(), isMobileView);
    const nextTitle = 'FOSS Canvas Playground';
    seedDemoLabelLibrary();
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ title: nextTitle, tree: nextTree }));
    setInitialTree(nextTree);
    setCurrentTree(nextTree);
    setTitle(nextTitle);
    setSavedTitle(nextTitle);
    setSaveMsg('Demo reset');
    setError('');
    setEditorKey((value) => value + 1);
  }, [isMobileView]);

  const exportEncryptedBlob = useCallback(async (fileBaseName?: string) => {
    try {
      const safeName = normalizeFileBaseName(fileBaseName || title || 'mindmapvault-demo');
      const dek = randomBytes(32);
      const ciphertext = await encryptTree(currentTree, dek);
      const payload = {
        format: 'mindmapvault-foss-demo-tree-v1',
        title,
        exported_at: new Date().toISOString(),
        dek_base64: toBase64(dek),
        content_type: 'application/vnd.mindmapvault.tree+json',
        ciphertext_base64: toBase64(ciphertext),
      };
      downloadJsonFile(payload, `${safeName}.tree.enc.json`);
      setSaveMsg('Encrypted blob exported');
      setError('');
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Encrypted export failed');
    }
  }, [currentTree, title]);

  const exportMarkdown = useCallback((tree: MindMapTree, treeTitle: string) => {
    const safeName = normalizeFileBaseName(treeTitle || title);
    const markdown = treeToMarkdown(tree.root, treeTitle || 'Untitled mind map');
    const payload = new TextEncoder().encode(markdown);
    downloadBytes(payload, `${safeName}.md`, 'text/markdown');
  }, [title]);

  return (
    <div className="demo-shell">
      <header className="demo-banner">
        <div className="demo-title-wrap">
          <div className="demo-title">
            <img src={brandLogoSrc} alt="MindMapVault" className="demo-title-logo" />
            <h1>MindMapVault FOSS Browser Demo</h1>
          </div>
          <p>Interactive canvas only. No account, no backend, all draft state in this browser.</p>
        </div>
        <div className="demo-actions">
          <button type="button" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} className="demo-reset demo-theme-toggle">
            {mode === 'dark' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <span className="demo-btn-label">{mode === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button type="button" onClick={() => { void exportEncryptedBlob(); }} className="demo-reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14" />
            </svg>
            <span className="demo-btn-label">Export encrypted blob</span>
          </button>
          <button type="button" onClick={() => { exportMarkdown(currentTree, title); }} className="demo-reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h8M8 17h6" />
            </svg>
            <span className="demo-btn-label">Export .md</span>
          </button>
          <button type="button" onClick={resetDemo} className="demo-reset">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a6 6 0 110 12H9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10l4-4M3 10l4 4" />
            </svg>
            <span className="demo-btn-label">Reset demo</span>
          </button>
        </div>
      </header>

      <div className="demo-canvas-offset">
        <DesktopMindMapEditor
          key={editorKey}
          initialTree={initialTree}
          initialShowShortcuts={!isMobileView}
          disableAutoPanToSelection={isMobileView}
          title={title}
          onTitleChange={handleTitleChange}
          onSave={handleSave}
          saving={saving}
          saveMsg={saveMsg}
          error={error}
          titleChanged={title.trim() !== savedTitle}
          onRenameTitle={() => void handleRename()}
          renamingTitle={renamingTitle}
          onExportMarkdown={exportMarkdown}
          onTreeChange={handleTreeChange}
        />
      </div>
    </div>
  );
}
