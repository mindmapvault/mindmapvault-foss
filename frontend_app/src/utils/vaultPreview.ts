import { bezierPath, layoutTree } from '../components/MindMapLayout';
import type { MindMapGraph, MindMapTree, MindMapTreeNode } from '../types';
import type { ThemeMode } from '../store/theme';

const CACHE_KEY = 'cryptmind-vault-preview-cache-v3';
const MAX_CACHE_ENTRIES = 80;
const PREVIEW_WIDTH = 760;
const PREVIEW_HEIGHT = 260;
const FRAME_PADDING = 20;
const CLOUD_PREVIEW_WIDTH = 640;
const CLOUD_PREVIEW_HEIGHT = 360;

const CLOUD_PREVIEW_ROLE = 'vault_preview';

// Canonical accent matches the MindMapVault brand indigo.
const ACCENT = '#7C3AED';
const NOTE_DOT_COLOR = '#f59e0b';

const THEME_PALETTE: Record<ThemeMode, {
  canvasBg: string;
  dot: string;
  connector: string;
  rootFill: string;
  rootText: string;
  nodeFill: string;
  nodeStroke: string;
  nodeText: string;
  noteText: string;
  collapseFill: string;
  collapseStroke: string;
  collapseText: string;
}> = {
  dark: {
    canvasBg: '#0f172a',
    dot: 'rgba(148,163,184,0.14)',
    connector: ACCENT,
    rootFill: ACCENT,
    rootText: '#ffffff',
    nodeFill: '#1e293b',
    nodeStroke: '#334155',
    nodeText: '#e2e8f0',
    noteText: 'rgba(226,232,240,0.8)',
    collapseFill: '#1e293b',
    collapseStroke: '#475569',
    collapseText: '#94a3b8',
  },
  light: {
    canvasBg: '#f1f5f9',
    dot: 'rgba(100,116,139,0.12)',
    connector: ACCENT,
    rootFill: ACCENT,
    rootText: '#ffffff',
    nodeFill: '#ffffff',
    nodeStroke: '#cbd5e1',
    nodeText: '#1e293b',
    noteText: 'rgba(71,85,105,0.82)',
    collapseFill: '#f8fafc',
    collapseStroke: '#94a3b8',
    collapseText: '#475569',
  },
};

// ---------------------------------------------------------------------------
// Minimal Lucide icon renderer for plain SVG output.
// We lazy-load iconNode from lucide-react/dynamic to avoid bundling everything.
// ---------------------------------------------------------------------------
type LucideIconNode = [string, Record<string, string | number>][];
let _lucideCache: Record<string, LucideIconNode> | null = null;

async function getLucideNodes(): Promise<Record<string, LucideIconNode> | null> {
  if (_lucideCache !== null) return _lucideCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('lucide-react/dynamic' as string) as any;
    // Build a kebab-name → iconNode map from the dynamic export object.
    const result: Record<string, LucideIconNode> = {};
    for (const [key, value] of Object.entries(mod)) {
      if (
        key !== 'iconNames' &&
        key !== 'DynamicIcon' &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Array.isArray((value as any).iconNode)
      ) {
        // key is PascalCase; also store as kebab
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result[key] = (value as any).iconNode as LucideIconNode;
        // kebab alias
        const kebab = key.replace(/([A-Z])/g, (c, i) => (i === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`));
        result[kebab] = result[key];
      }
    }
    _lucideCache = result;
    return result;
  } catch {
    _lucideCache = {};
    return _lucideCache;
  }
}

function renderLucideIconSvg(iconNodes: LucideIconNode, x: number, y: number, size: number, color: string): string {
  const svgParts = iconNodes.map(([tag, attrs]) => {
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
      .join(' ');
    return `<${tag} ${attrStr}/>`;
  });
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgParts.join('')}</svg>`;
}

function kebabToPascal(kebab: string): string {
  return kebab.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

function normalizeIconLookupKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toKebabIconName(name: string): string {
  if (name.includes('-')) return name.toLowerCase();
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d+)/g, '$1-$2')
    .replace(/(\d+)([a-zA-Z])/g, '$1-$2')
    .toLowerCase();
}

export interface VaultPreviewSummary {
  format: 'tree' | 'graph';
  image_data_url: string;
  updated_at: string;
  nodeCount: number;
  noteCount: number;
  attachmentCount: number;
  saved_at: string;
}

type VaultPreviewThemeMap = Partial<Record<'dark' | 'light', VaultPreviewSummary>>;
type VaultPreviewCache = Record<string, VaultPreviewThemeMap>;

function normalizePreviewText(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clampLabel(value: string, maxLength = 18): string {
  const normalized = normalizePreviewText(value);
  if (!normalized) return 'Untitled';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function readCache(): VaultPreviewCache {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VaultPreviewCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: VaultPreviewCache) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(cache)
      .map(([k, v]) => {
        // pick latest saved_at among theme variants
        const times = Object.values(v || {}).map((s) => s.saved_at).filter(Boolean) as string[];
        const latest = times.length > 0 ? times.sort().reverse()[0] : '';
        return [k, v, latest] as const;
      })
      .sort((left, right) => (right[2] || '').localeCompare(left[2] || ''))
      .slice(0, MAX_CACHE_ENTRIES)
      .map(([k, v]) => [k, v]);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore preview cache persistence failures.
  }
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function isVaultPreviewAttachmentMeta(meta?: Record<string, unknown> | null): boolean {
  return meta?.cryptmind_role === CLOUD_PREVIEW_ROLE;
}

export function getVaultPreviewTheme(meta?: Record<string, unknown> | null): ThemeMode | null {
  return meta?.preview_theme === 'light' || meta?.preview_theme === 'dark'
    ? meta.preview_theme
    : null;
}

export function getVaultPreviewStats(meta?: Record<string, unknown> | null): {
  nodeCount: number;
  noteCount: number;
  attachmentCount: number;
} {
  return {
    nodeCount: typeof meta?.node_count === 'number' ? meta.node_count : 0,
    noteCount: typeof meta?.note_count === 'number' ? meta.note_count : 0,
    attachmentCount: typeof meta?.attachment_count === 'number' ? meta.attachment_count : 0,
  };
}

function collectTreeStats(root: MindMapTreeNode) {
  const queue: MindMapTreeNode[] = [root];
  let nodeCount = 0;
  let noteCount = 0;
  let attachmentCount = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    nodeCount += 1;
    if (normalizePreviewText(node.notes)) noteCount += 1;
    attachmentCount += node.attachments?.length ?? 0;
    queue.push(...node.children);
  }

  return { nodeCount, noteCount, attachmentCount };
}

function collectGraphStats(graph: MindMapGraph) {
  return {
    nodeCount: graph.nodes.length,
    noteCount: 0,
    attachmentCount: 0,
  };
}

// ---------------------------------------------------------------------------
// Connector color inheritance: mirrors renderConnections() in MindMapEditor.tsx.
// ---------------------------------------------------------------------------
function buildConnectorMap(
  node: MindMapTreeNode,
  _parent: MindMapTreeNode | null,
  inheritedColor: string | null,
  connectorColor: Map<string, string>,
): void {
  const ownColor = node.color ?? null;
  const effectiveColor = ownColor ?? inheritedColor;
  for (const child of node.children) {
    const childBranchColor = child.color ?? effectiveColor;
    if (childBranchColor) connectorColor.set(`${node.id}->${child.id}`, childBranchColor);
    buildConnectorMap(child, node, childBranchColor, connectorColor);
  }
}

// ---------------------------------------------------------------------------
// Synchronous SVG tree renderer — icons injected asynchronously via separate pass.
// ---------------------------------------------------------------------------
function renderTreeSvgSync(
  tree: MindMapTree,
  theme: ThemeMode,
  width: number,
  height: number,
  iconMap: Record<string, LucideIconNode>,
): string {
  const palette = THEME_PALETTE[theme];
  const layout = layoutTree(tree.root, 0, 0);
  const entries = Object.values(layout);
  const minX = Math.min(...entries.map((e) => e.x));
  const minY = Math.min(...entries.map((e) => e.y));
  const maxX = Math.max(...entries.map((e) => e.x + e.w));
  const maxY = Math.max(...entries.map((e) => e.y + e.h));
  const sceneWidth = Math.max(1, maxX - minX);
  const sceneHeight = Math.max(1, maxY - minY);
  const scale = Math.min(
    (width - FRAME_PADDING * 2) / sceneWidth,
    (height - FRAME_PADDING * 2) / sceneHeight,
  );
  const offsetX = (width - sceneWidth * scale) / 2 - minX * scale;
  const offsetY = (height - sceneHeight * scale) / 2 - minY * scale;

  // Build connector color map.
  const connectorColorMap = new Map<string, string>();
  buildConnectorMap(tree.root, null, null, connectorColorMap);

  // Render connectors.
  const connectors: string[] = [];
  const walkConnectors = (node: MindMapTreeNode) => {
    const parentLayout = layout[node.id];
    for (const child of node.children) {
      const childLayout = layout[child.id];
      const isLeft = childLayout.x < parentLayout.x;
      const strokeColor = connectorColorMap.get(`${node.id}->${child.id}`) ?? palette.connector;
      const path = bezierPath(
        (isLeft ? parentLayout.x : parentLayout.x + parentLayout.w) * scale + offsetX,
        (parentLayout.y + parentLayout.h / 2) * scale + offsetY,
        (isLeft ? childLayout.x + childLayout.w : childLayout.x) * scale + offsetX,
        (childLayout.y + childLayout.h / 2) * scale + offsetY,
      );
      connectors.push(
        `<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${Math.max(1.2, 2 * scale)}" stroke-linecap="round"/>`,
      );
      walkConnectors(child);
    }
  };
  walkConnectors(tree.root);

  // Render nodes.
  const ICON_SIZE = 16;
  const nodes = entries.map((entry) => {
    const node = entry.node;
    const isRoot = node.id === 'root';
    const ownColor = node.color ?? null;

    // Fill / stroke / text mirrors live editor logic.
    const fillColor = ownColor ?? (isRoot ? palette.rootFill : palette.nodeFill);
    const strokeColor = ownColor ?? (isRoot ? palette.rootFill : palette.nodeStroke);
    const textColor = ownColor ? '#ffffff' : (isRoot ? palette.rootText : palette.nodeText);

    const rx = (isRoot ? 18 : 8) * scale;
    const fontSize = isRoot ? Math.max(8, 15 * scale) : Math.max(7, 13 * scale);
    const fontWeight = isRoot ? 700 : 500;
    const x = entry.x * scale + offsetX;
    const y = entry.y * scale + offsetY;
    const w = Math.max(24, entry.w * scale);
    const h = Math.max(16, entry.h * scale);

    const parts: string[] = [];
    parts.push(`<g>`);

    // Node body.
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${Math.max(0.8, scale)}"/>`,
    );

    const tags = Array.isArray(node.tags) ? node.tags.slice(0, 4) : [];
    const hasTagStrip = tags.length > 0;
    const topTagH = hasTagStrip ? 16 * scale : 0;

    if (hasTagStrip) {
      parts.push(
        `<line x1="${x + 4 * scale}" y1="${y + topTagH}" x2="${x + w - 4 * scale}" y2="${y + topTagH}" stroke="${ownColor ? '#ffffff22' : palette.nodeStroke}" stroke-width="${Math.max(0.35, 0.6 * scale)}"/>`,
      );

      const tagGap = 3 * scale;
      let tagCursor = x + 6 * scale;
      const tagY = y + 2 * scale;
      const tagH = 11 * scale;
      for (const tag of tags) {
        const txt = clampLabel(tag, 12);
        const tagW = Math.min(w - 12 * scale, Math.max(16 * scale, (6 + txt.length * 4.6) * scale));
        const tagColor = ACCENT;
        parts.push(
          `<rect x="${tagCursor}" y="${tagY}" width="${tagW}" height="${tagH}" rx="${tagH / 2}" fill="${tagColor}" opacity="0.92"/>`,
          `<text x="${tagCursor + tagW / 2}" y="${tagY + tagH / 2}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${Math.max(4.5, 7 * scale)}" font-weight="700" fill="#ffffff">${escapeXml(txt)}</text>`,
        );
        tagCursor += tagW + tagGap;
        if (tagCursor > x + w - 18 * scale) break;
      }
    }

    // Icons row: mirrors live editor's left-padded icon row.
    const iconKeys: string[] = Array.isArray(node.icons) ? node.icons : [];
    const scaledIconSize = ICON_SIZE * scale;
    if (iconKeys.length > 0) {
      let iconX = x + 4 * scale;
      const iconY = y + topTagH + (h - topTagH - scaledIconSize) / 2;
      for (const rawKey of iconKeys.slice(0, 4)) {
        const kebabKey = toKebabIconName(rawKey);
        const pascalKey = kebabToPascal(kebabKey);
        const normalizedKebab = normalizeIconLookupKey(kebabKey);
        const normalizedPascal = normalizeIconLookupKey(pascalKey);
        const iconData =
          iconMap[pascalKey]
          ?? iconMap[kebabKey]
          ?? iconMap[rawKey]
          ?? Object.entries(iconMap).find(([key]) => normalizeIconLookupKey(key) === normalizedKebab || normalizeIconLookupKey(key) === normalizedPascal)?.[1];
        if (iconData) {
          parts.push(renderLucideIconSvg(iconData, iconX, iconY, scaledIconSize, textColor));
        } else {
          const cx = iconX + scaledIconSize / 2;
          const cy = iconY + scaledIconSize / 2;
          const r = Math.max(1.2, 2.4 * scale);
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${textColor}" stroke-width="${Math.max(0.6, 1.1 * scale)}"/>`);
        }
        iconX += scaledIconSize + 2 * scale;
      }
    }

    // Label text — centred, accounts for icon offset.
    const iconXOffset = iconKeys.length > 0 ? (iconKeys.slice(0, 4).length * (ICON_SIZE + 2) * scale) / 2 : 0;
    parts.push(
      `<text x="${x + w / 2 + iconXOffset / 2}" y="${y + topTagH + (h - topTagH) / 2}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${textColor}">${escapeXml(clampLabel(node.text, isRoot ? 22 : 18))}</text>`,
    );

    // Note dot (amber) — top-right of node, matching live editor.
    const hasNote = !!normalizePreviewText(node.notes);
    if (hasNote) {
      const dotR = Math.max(2, 3.5 * scale);
      parts.push(
        `<circle cx="${x + w - dotR - 2 * scale}" cy="${y + dotR + 2 * scale}" r="${dotR}" fill="${NOTE_DOT_COLOR}"/>`,
      );
    }

    // Attachment badge (paperclip) — small badge below note dot if any attachments.
    const attachCount = node.attachments?.length ?? 0;
    if (attachCount > 0) {
      const badgeR = Math.max(1.5, 2.8 * scale);
      const badgeX = x + w - badgeR - 2 * scale;
      const badgeY = y + (hasNote ? 3.5 * 2 + 4 : 1) * scale + badgeR + (hasNote ? 6 * scale : 2 * scale);
      parts.push(
        `<circle cx="${badgeX}" cy="${badgeY}" r="${badgeR + 1.5 * scale}" fill="${palette.nodeStroke}"/>`,
        `<text x="${badgeX}" y="${badgeY}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${Math.max(4, 7 * scale)}" fill="${palette.nodeText}">📎</text>`,
      );
    }

    // Progress pie indicator — simplified filled-arc or percentage text.
    const progress = node.progress;
    if (typeof progress === 'number' && progress >= 0) {
      const pieR = Math.max(4, 8 * scale);
      const pieX = x + 4 * scale + pieR;
      const pieY = y + h - pieR - 2 * scale;
      if (progress >= 100) {
        parts.push(
          `<circle cx="${pieX}" cy="${pieY}" r="${pieR}" fill="#22c55e"/>`,
          `<path d="M${pieX - pieR * 0.4} ${pieY} l${pieR * 0.35} ${pieR * 0.4} l${pieR * 0.55} -${pieR * 0.6}" fill="none" stroke="#fff" stroke-width="${Math.max(0.8, 1.5 * scale)}" stroke-linecap="round"/>`,
        );
      } else {
        const sliceAngle = (progress / 100) * 2 * Math.PI;
        const sx = pieX + pieR * Math.sin(0);
        const sy = pieY - pieR * Math.cos(0);
        const ex = pieX + pieR * Math.sin(sliceAngle);
        const ey = pieY - pieR * Math.cos(sliceAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        parts.push(
          `<circle cx="${pieX}" cy="${pieY}" r="${pieR}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${Math.max(0.5, scale)}"/>`,
          `<path d="M${pieX} ${pieY} L${sx} ${sy} A${pieR} ${pieR} 0 ${largeArc} 1 ${ex} ${ey} Z" fill="${ACCENT}"/>`,
          `<text x="${pieX}" y="${pieY}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${Math.max(4, 7 * scale)}" fill="${textColor}">${progress}%</text>`,
        );
      }
    }

    parts.push(`</g>`);
    return parts.join('');
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="${palette.dot}"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="${palette.canvasBg}"/>
      <rect width="${width}" height="${height}" fill="url(#dots)"/>
      ${connectors.join('')}
      ${nodes.join('')}
    </svg>
  `.trim();
}

// Public async version loads icon data before rendering.
async function renderTreeSvg(
  tree: MindMapTree,
  theme: ThemeMode,
  width = PREVIEW_WIDTH,
  height = PREVIEW_HEIGHT,
): Promise<string> {
  const iconMap = await getLucideNodes() ?? {};
  return renderTreeSvgSync(tree, theme, width, height, iconMap);
}

function renderGraphSvg(graph: MindMapGraph, theme: ThemeMode, width = PREVIEW_WIDTH, height = PREVIEW_HEIGHT): string {
  const palette = THEME_PALETTE[theme];
  const nodeWidth = 138;
  const nodeHeight = 42;
  const minX = Math.min(...graph.nodes.map((node) => node.position.x));
  const minY = Math.min(...graph.nodes.map((node) => node.position.y));
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x + nodeWidth));
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y + nodeHeight));
  const sceneWidth = Math.max(1, maxX - minX);
  const sceneHeight = Math.max(1, maxY - minY);
  const scale = Math.min(
    (width - FRAME_PADDING * 2) / sceneWidth,
    (height - FRAME_PADDING * 2) / sceneHeight,
  );
  const offsetX = (width - sceneWidth * scale) / 2 - minX * scale;
  const offsetY = (height - sceneHeight * scale) / 2 - minY * scale;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));

  const edges = graph.edges.map((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return '';
    const path = bezierPath(
      (source.position.x + nodeWidth) * scale + offsetX,
      (source.position.y + nodeHeight / 2) * scale + offsetY,
      target.position.x * scale + offsetX,
      (target.position.y + nodeHeight / 2) * scale + offsetY,
    );
    return `<path d="${path}" fill="none" stroke="${palette.connector}" stroke-width="${Math.max(1.2, 2 * scale)}" stroke-linecap="round"/>`;
  }).join('');

  const nodes = graph.nodes.map((node, index) => {
    const isPrimary = index === 0;
    const fillColor = isPrimary ? palette.rootFill : palette.nodeFill;
    const strokeColor = isPrimary ? palette.rootFill : palette.nodeStroke;
    const textColor = isPrimary ? palette.rootText : palette.nodeText;
    const rx = (isPrimary ? 18 : 8) * scale;
    return [
      `<g>`,
      `<rect x="${node.position.x * scale + offsetX}" y="${node.position.y * scale + offsetY}" width="${nodeWidth * scale}" height="${nodeHeight * scale}" rx="${rx}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${Math.max(0.8, scale)}"/>`,
      `<text x="${(node.position.x + nodeWidth / 2) * scale + offsetX}" y="${(node.position.y + nodeHeight / 2) * scale + offsetY}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${Math.max(9, 13 * scale)}" font-weight="${isPrimary ? 700 : 500}" fill="${textColor}">${escapeXml(clampLabel(node.data.label, 18))}</text>`,
      `</g>`,
    ].join('');
  }).join('');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="${palette.dot}"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${height}" fill="${palette.canvasBg}"/>
      <rect width="${width}" height="${height}" fill="url(#dots)"/>
      ${edges}
      ${nodes}
    </svg>
  `.trim();
}

async function rasterizeSvg(svg: string, width = CLOUD_PREVIEW_WIDTH, height = CLOUD_PREVIEW_HEIGHT): Promise<{ bytes: Uint8Array; contentType: string }> {
  const img = new Image();
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load preview SVG'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas preview rendering is unavailable');
    context.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.72));
      
    const finalBlob = blob ?? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!finalBlob) throw new Error('Failed to encode preview image');
    return {
      bytes: new Uint8Array(await finalBlob.arrayBuffer()),
      contentType: finalBlob.type || 'image/png',
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function savePreview(vaultId: string, theme: 'dark' | 'light', preview: VaultPreviewSummary): VaultPreviewSummary {
  const cache = readCache() as VaultPreviewCache;
  const entry = cache[vaultId] ?? {};
  entry[theme] = preview;
  cache[vaultId] = entry;
  writeCache(cache);
  return preview;
}

export function loadCachedVaultPreview(vaultId: string, updatedAt: string, theme: 'dark' | 'light' = 'dark'): VaultPreviewSummary | null {
  const cache = readCache() as VaultPreviewCache;
  const entry = cache[vaultId];
  if (!entry) return null;
  const themed = entry[theme] ?? entry.dark ?? entry.light ?? null;
  if (!themed || themed.updated_at !== updatedAt) return null;
  return themed;
}

export async function saveTreeVaultPreview(vaultId: string, updatedAt: string, tree: MindMapTree): Promise<VaultPreviewSummary> {
  const stats = collectTreeStats(tree.root);
  const now = new Date().toISOString();
  // Generate both dark and light cached previews for local-mode UI.
  const darkSvg = await renderTreeSvg(tree, 'dark');
  const lightSvg = await renderTreeSvg(tree, 'light');
  const darkPreview: VaultPreviewSummary = {
    format: 'tree',
    image_data_url: encodeSvg(darkSvg),
    updated_at: updatedAt,
    nodeCount: stats.nodeCount,
    noteCount: stats.noteCount,
    attachmentCount: stats.attachmentCount,
    saved_at: now,
  };
  const lightPreview: VaultPreviewSummary = {
    ...darkPreview,
    image_data_url: encodeSvg(lightSvg),
    saved_at: now,
  };
  savePreview(vaultId, 'dark', darkPreview);
  savePreview(vaultId, 'light', lightPreview);
  return darkPreview;
}

export function saveGraphVaultPreview(vaultId: string, updatedAt: string, graph: MindMapGraph): VaultPreviewSummary {
  const stats = collectGraphStats(graph);
  const now = new Date().toISOString();
  const darkSvg = renderGraphSvg(graph, 'dark');
  const lightSvg = renderGraphSvg(graph, 'light');
  const darkPreview: VaultPreviewSummary = {
    format: 'graph',
    image_data_url: encodeSvg(darkSvg),
    updated_at: updatedAt,
    nodeCount: stats.nodeCount,
    noteCount: stats.noteCount,
    attachmentCount: stats.attachmentCount,
    saved_at: now,
  };
  const lightPreview: VaultPreviewSummary = {
    ...darkPreview,
    image_data_url: encodeSvg(lightSvg),
    saved_at: now,
  };
  savePreview(vaultId, 'dark', darkPreview);
  savePreview(vaultId, 'light', lightPreview);
  return darkPreview;
}

export async function createCloudTreeVaultPreview(tree: MindMapTree, theme: ThemeMode): Promise<{
  bytes: Uint8Array;
  contentType: string;
  stats: { nodeCount: number; noteCount: number; attachmentCount: number };
}> {
  const stats = collectTreeStats(tree.root);
  const svg = await renderTreeSvg(tree, theme, CLOUD_PREVIEW_WIDTH, CLOUD_PREVIEW_HEIGHT);
  const rasterized = await rasterizeSvg(svg, CLOUD_PREVIEW_WIDTH, CLOUD_PREVIEW_HEIGHT);
  return {
    ...rasterized,
    stats,
  };
}

export async function createCloudGraphVaultPreview(graph: MindMapGraph, theme: ThemeMode): Promise<{
  bytes: Uint8Array;
  contentType: string;
  stats: { nodeCount: number; noteCount: number; attachmentCount: number };
}> {
  const stats = collectGraphStats(graph);
  const svg = renderGraphSvg(graph, theme, CLOUD_PREVIEW_WIDTH, CLOUD_PREVIEW_HEIGHT);
  const rasterized = await rasterizeSvg(svg, CLOUD_PREVIEW_WIDTH, CLOUD_PREVIEW_HEIGHT);
  return {
    ...rasterized,
    stats,
  };
}