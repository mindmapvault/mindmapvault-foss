import { useCallback, useEffect, useMemo, useState } from 'react';
import { DesktopMindMapEditor } from '../../frontend_app/src/components/MindMapEditor';
import { encryptTree } from '../../frontend_app/src/crypto/vault';
import { randomBytes, toBase64 } from '../../frontend_app/src/crypto/utils';
import { EXPORT_FORMATS, type ExportFormat } from '../../frontend_app/src/utils/exportFormats';
import { useThemeStore } from '../../frontend_app/src/store/theme';
import type { MindMapTree } from '../../frontend_app/src/types';

const DEMO_STORAGE_KEY = 'mindmapvault:foss:mobile-demo:v1';
const USER_LABELS_STORAGE_KEY = 'user-labels';

const DEMO_LABEL_LIBRARY: Array<{ name: string; color: string }> = [
  { name: 'demo', color: '#7c3aed' },
  { name: 'pwa', color: '#06b6d4' },
  { name: 'mobile', color: '#ec4899' },
  { name: 'touch', color: '#3b82f6' },
  { name: 'privacy', color: '#10b981' },
  { name: 'crypto', color: '#3b82f6' },
  { name: 'zero-knowledge', color: '#22c55e' },
  { name: 'offline', color: '#f59e0b' },
  { name: 'dark-mode', color: '#8b5cf6' },
  { name: 'showcase', color: '#ef4444' },
];

interface DemoSnapshot {
  title: string;
  tree: MindMapTree;
}

function normalizeDemoLayout(tree: MindMapTree): MindMapTree {
  const cloned = JSON.parse(JSON.stringify(tree)) as MindMapTree;

  const clearCustomPositions = (node: MindMapTree['root']): void => {
    node.customX = undefined;
    node.customY = undefined;
    node.children.forEach(clearCustomPositions);
  };

  clearCustomPositions(cloned.root);

  for (const child of cloned.root.children) {
    const leftIds = ['mobile-crypto'];
    child.side = leftIds.includes(child.id) ? 'left' : 'right';
  }

  // Always use mobile viewport — the demo is about mobile UX
  cloned.view_state = {
    ...(cloned.view_state ?? {}),
    pan_x: 40,
    pan_y: 200,
    zoom: 0.7,
    focus_mode: false,
    focus_anchor_id: null,
    selected_node_id: 'mobile-pwa-1',
  };

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
    return { title: parsed.title, tree: parsed.tree as MindMapTree };
  } catch {
    return null;
  }
}

function createStarterTree(): MindMapTree {
  return {
    version: 'tree',
    root: {
      id: 'root',
      text: 'MindMapVault Mobile',
      collapsed: false,
      tags: ['demo', 'pwa'],
      notes: `# MindMapVault Mobile Demo\n\nThis is an interactive phone-frame playground.\n\n- No account required\n- All state in this browser\n- Real touch gestures when on a phone\n\n## What to explore\n\n1. Tap a node to select it\n2. Double-tap to edit text inline\n3. Pinch to zoom the canvas\n4. Two-finger drag to pan\n5. Toggle dark/light mode in the banner\n`,
      children: [
        {
          id: 'mobile-pwa',
          text: 'Install as PWA',
          collapsed: false,
          side: 'right',
          icons: ['Smartphone', 'Download'],
          tags: ['pwa', 'mobile'],
          notes: `# Progressive Web App\n\nNo app store. No review queue. No download of hundreds of MB.\n\n**On iPhone:** Open Safari → Share → Add to Home Screen\n**On Android:** Chrome menu → Add to Home Screen\n\nThe icon appears on your home screen instantly.\nUpdates happen silently in the background.`,
          children: [
            {
              id: 'mobile-pwa-1',
              text: 'Tap browser menu',
              collapsed: false,
              icons: ['MoreHorizontal'],
              checked: true,
              progress: 100,
              children: [],
            },
            {
              id: 'mobile-pwa-2',
              text: '"Add to Home Screen"',
              collapsed: false,
              icons: ['PlusSquare'],
              checked: true,
              progress: 100,
              tags: ['pwa'],
              notes: 'Works on iOS Safari and Android Chrome. Firefox on Android also supports it.',
              children: [],
            },
            {
              id: 'mobile-pwa-3',
              text: 'No app store needed',
              collapsed: false,
              icons: ['ShieldCheck'],
              checked: true,
              progress: 100,
              tags: ['offline'],
              notes: 'Service worker caches the app shell. Works offline after first visit.',
              children: [],
            },
          ],
        },
        {
          id: 'mobile-touch',
          text: 'Touch-first canvas',
          collapsed: false,
          side: 'right',
          icons: ['Move', 'Maximize2'],
          tags: ['touch', 'mobile'],
          notes: `# Touch Interaction Model\n\n@xyflow/react handles gestures natively:\n\n- **Pan:** Two-finger drag\n- **Zoom:** Pinch gesture\n- **Select:** Single tap\n- **Edit:** Double-tap\n\nThe canvas adapts its initial zoom for the screen size automatically.`,
          children: [
            {
              id: 'mobile-touch-1',
              text: 'Tap → select node',
              collapsed: false,
              icons: ['Target'],
              checked: false,
              progress: 0,
              notes: 'Tap any node to select it. A toolbar appears with actions.',
              children: [],
            },
            {
              id: 'mobile-touch-2',
              text: 'Double-tap → edit text',
              collapsed: false,
              icons: ['Pencil'],
              checked: false,
              progress: 0,
              notes: 'Double-tap to enter inline editing mode. The on-screen keyboard appears.',
              children: [],
            },
            {
              id: 'mobile-touch-3',
              text: 'Pinch → zoom canvas',
              collapsed: false,
              icons: ['ZoomIn'],
              checked: false,
              progress: 0,
              tags: ['touch'],
              children: [],
            },
          ],
        },
        {
          id: 'mobile-crypto',
          text: 'Zero-knowledge on mobile',
          collapsed: false,
          side: 'left',
          icons: ['Shield', 'Lock'],
          tags: ['privacy', 'crypto'],
          notes: `# Encryption on Every Platform\n\nThe same AES-256-GCM + ML-KEM-768 model runs on mobile.\n\nKeys are derived client-side from your password.\nThe server only ever stores ciphertext.\nYour maps are private even from us.`,
          children: [
            {
              id: 'mobile-crypto-1',
              text: 'AES-256-GCM encrypted',
              collapsed: false,
              icons: ['Lock'],
              tags: ['crypto'],
              color: '#22c55e',
              children: [
                {
                  id: 'mobile-crypto-1-1',
                  text: 'Same as desktop',
                  collapsed: false,
                  children: [],
                },
              ],
            },
            {
              id: 'mobile-crypto-2',
              text: 'Keys never leave device',
              collapsed: false,
              icons: ['KeyRound'],
              tags: ['zero-knowledge'],
              color: '#3b82f6',
              children: [],
            },
            {
              id: 'mobile-crypto-3',
              text: 'Offline-capable PWA',
              collapsed: false,
              icons: ['WifiOff'],
              tags: ['offline', 'pwa'],
              color: '#f59e0b',
              notes: 'Service worker caches the app shell and assets. Open cached maps without network.',
              children: [],
            },
          ],
        },
        {
          id: 'mobile-theme',
          text: 'Dark & light mode',
          collapsed: false,
          side: 'right',
          icons: ['Moon', 'Sun'],
          tags: ['dark-mode', 'showcase'],
          notes: `# Theme Switching\n\nToggle dark/light mode with the button in the banner above.\n\nThe preference is saved in localStorage and applied synchronously before React renders — so there's no flash between sessions.`,
          children: [
            {
              id: 'mobile-theme-1',
              text: 'Dark by default',
              collapsed: false,
              icons: ['Moon'],
              checked: true,
              progress: 100,
              children: [],
            },
            {
              id: 'mobile-theme-2',
              text: 'One-tap toggle',
              collapsed: false,
              icons: ['Sun'],
              checked: false,
              progress: 0,
              notes: 'Try it — tap the theme toggle in the banner above.',
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
  return clean || 'mindmapvault-mobile-demo';
}

/** The demo offers Markdown and nothing else. */
const MARKDOWN_ONLY = EXPORT_FORMATS.filter((format) => format.id === 'md');

export default function App() {
  const mode = useThemeStore((state) => state.mode);
  const primaryColor = useThemeStore((state) => state.primaryColor);

  const initialSnapshot = useMemo(() => {
    seedDemoLabelLibrary();
    const parsed = parseSnapshot(localStorage.getItem(DEMO_STORAGE_KEY));
    if (parsed && hasNode(parsed.tree, 'mobile-pwa')) {
      return {
        title: parsed.title,
        tree: normalizeDemoLayout(parsed.tree),
      };
    }
    return {
      title: 'Mobile Playground',
      tree: normalizeDemoLayout(createStarterTree()),
    };
  }, []);

  const [title, setTitle] = useState(initialSnapshot.title);
  const [savedTitle, setSavedTitle] = useState(initialSnapshot.title);
  const [initialTree] = useState(initialSnapshot.tree);
  const [currentTree, setCurrentTree] = useState(initialSnapshot.tree);
  const [saveMsg, setSaveMsg] = useState('Local browser-only demo');
  const [error, setError] = useState('');
  const [renamingTitle, setRenamingTitle] = useState(false);

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

  const exportEncryptedBlob = useCallback(async (fileBaseName?: string) => {
    try {
      const safeName = normalizeFileBaseName(fileBaseName ?? title ?? 'mindmapvault-mobile-demo');
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

  const downloadJson = useCallback((tree: MindMapTree, treeTitle: string) => {
    const safeName = normalizeFileBaseName(treeTitle ?? title);
    downloadJsonFile({ title: treeTitle, exported_at: new Date().toISOString(), tree }, `${safeName}.json`);
  }, [title]);

  const exportMarkdown = useCallback(async (
    format: ExportFormat,
    tree: MindMapTree,
    baseName: string,
  ) => {
    const safeName = normalizeFileBaseName(baseName ?? title);
    const blob = await format.serialize(tree.root, baseName ?? 'Untitled mind map');
    const payload = new Uint8Array(await blob.arrayBuffer());
    downloadBytes(payload, `${safeName}${format.extension}`, blob.type);
  }, [title]);

  return (
    <div className="mmd-shell">
      <DesktopMindMapEditor
        initialTree={initialTree}
        initialShowShortcuts={false}
        disableAutoPanToSelection={true}
        title={title}
        onTitleChange={handleTitleChange}
        onSave={handleSave}
        saving={false}
        saveMsg={saveMsg}
        error={error}
        titleChanged={title.trim() !== savedTitle}
        onRenameTitle={() => void handleRename()}
        renamingTitle={renamingTitle}
        onDownloadEncrypted={(fileBaseName) => void exportEncryptedBlob(fileBaseName)}
        onDownloadJson={downloadJson}
        exportFormats={MARKDOWN_ONLY}
        onExport={exportMarkdown}
        onTreeChange={handleTreeChange}
      />
    </div>
  );
}
