/**
 * The bands a node is drawn from.
 *
 * A node has a vertical structure that `@mindmapvault/mindmap-core` already
 * knows about — a date badge above the box, then the meta strip, the tags, the
 * picture, the text body, and one footer strip per URL. These components are
 * that structure, one per band.
 *
 * Splitting by band rather than by field is deliberate. A component per
 * decoration would be twenty of them, each working out for itself where the
 * band it lives in starts; a component per band takes the geometry it is given
 * and every offset inside it is relative to that. Each one receives the `box`
 * the layout produced, the `parts` it was measured from, and the `geom`
 * derived from both — never the raw numbers to redo the arithmetic with.
 */

import type { JSX } from 'react';
import type { LayoutEntry, NodeGeometry, NodeParts } from '@mindmapvault/mindmap-core';
import {
  CHECKBOX_SIZE,
  ICON_SIZE,
  LINK_STRIP_H,
  NODE_LINE_H,
  NODE_PAD_X,
  PROGRESS_PIE_SIZE,
  TAG_STRIP_H,
} from '../MindMapConstants';
import DynamicLucideIcon from '../DynamicLucideIcon';
import type { MindMapTreeNode, NodeImage } from '../../types';
import { openExternalUrl } from '../../utils/openExternal';

export type NodeBox = LayoutEntry<MindMapTreeNode>;

/** How this node is painted. Worked out once, in the editor, and passed down. */
export interface NodeVisual {
  /** The node's own explicit colour, or null. Nothing is inherited. */
  ownColor: string | null;
  fillColor: string;
  strokeColor: string;
  textColor: string;
  fontSize: number;
  fontWeight: 'bold' | 'normal';
}

interface BandProps {
  box: NodeBox;
  geom: NodeGeometry;
  parts: NodeParts;
  visual: NodeVisual;
}

/** The hairline that separates one band from the next. */
function BandDivider({
  box,
  y,
  ownColor,
  inset = 6,
  opacity = '22',
}: {
  box: NodeBox;
  y: number;
  ownColor: string | null;
  inset?: number;
  opacity?: string;
}): JSX.Element {
  return (
    <line
      x1={box.x + inset}
      y1={y}
      x2={box.x + box.w - inset}
      y2={y}
      stroke={ownColor ? `#ffffff${opacity}` : 'var(--mm-node-stroke)'}
      strokeWidth={0.5}
    />
  );
}

// ── Date badge: above the box, in the room `visualTopExtra` reserved ──

const formatDate = (value: string): string => {
  const dt = new Date(value);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${String(dt.getFullYear()).slice(2)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export function DateBadge({ box, node }: { box: NodeBox; node: MindMapTreeNode }): JSX.Element {
  const startLabel = node.startDate ? formatDate(node.startDate) : '–';
  const endLabel = node.endDate ? formatDate(node.endDate) : '–';
  return (
    <g className="mm-date-badge">
      <svg x={box.x + box.w / 2 - 52} y={box.y - 32} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2}>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <text x={box.x + box.w / 2 - 33} y={box.y - 25} fontSize={11} fill="var(--accent)" fontWeight="500">{startLabel}</text>
      <text x={box.x + box.w / 2 - 33} y={box.y - 12} fontSize={11} fill="var(--mm-statusbar-text)">{endLabel}</text>
    </g>
  );
}

// ── Meta strip: the note dot and the attachment pill ────────────

export function AttachmentIndicator({
  x,
  y,
  count,
  ownColor,
}: {
  x: number;
  y: number;
  count: number;
  ownColor: string | null;
}): JSX.Element {
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
}

/**
 * The note dot and the attachment pill, on the strip that was reserved for
 * them. Both are gated on the same `parts` the measurement used, so the strip
 * is never drawn into space nothing set aside — and never omitted from space
 * that was. The dot used to be gated on `node.notes` untrimmed while the
 * strip was measured from the trimmed value, so a node whose note was one
 * space drew the dot on the box's top edge.
 */
export function MetaBand({ box, geom, parts, visual }: BandProps): JSX.Element | null {
  if (parts.topMetaH === 0) return null;
  const { hasNote, attachmentCount } = parts;
  return (
    <>
      <BandDivider box={box} y={geom.tagTopY} ownColor={visual.ownColor} />
      {attachmentCount > 0 && (
        <AttachmentIndicator
          x={box.x + box.w - (hasNote ? 26 : 11)}
          y={geom.metaCentreY}
          count={attachmentCount}
          ownColor={visual.ownColor}
        />
      )}
      {hasNote && (
        <circle cx={box.x + box.w - 7} cy={geom.metaCentreY} r={5} fill="#f59e0b" className="mm-indicator" />
      )}
    </>
  );
}

// ── Tag strip ───────────────────────────────────────────────────

const MAX_TAGS_DRAWN = 5;
const TAG_H = 13;
const TAG_GAP = 3;

export function TagBand({
  box,
  geom,
  parts,
  visual,
  userLabels,
}: BandProps & { userLabels: Array<{ name: string; color: string }> }): JSX.Element | null {
  if (parts.tagCount === 0) return null;
  const tags = parts.tags.slice(0, MAX_TAGS_DRAWN);
  const compact = tags.map((tag) => {
    const txt = tag.length > 14 ? `${tag.slice(0, 13)}…` : tag;
    return {
      tag,
      txt,
      width: Math.min(box.w - 8, Math.max(18, 8 + txt.length * 5.5)),
      color: userLabels.find((label) => label.name === tag)?.color ?? 'var(--accent)',
    };
  });
  const totalW = compact.reduce((sum, item) => sum + item.width, 0) + (compact.length - 1) * TAG_GAP;
  const tagY = geom.tagTopY + (TAG_STRIP_H - TAG_H) / 2;
  let cursorX = box.x + Math.max(4, (box.w - totalW) / 2);

  return (
    <>
      <BandDivider box={box} y={geom.tagBottomY} ownColor={visual.ownColor} />
      {compact.map((item) => {
        const x = cursorX;
        cursorX += item.width + TAG_GAP;
        return (
          <g key={item.tag} pointerEvents="none">
            <rect x={x} y={tagY} width={item.width} height={TAG_H} rx={6.5} fill={item.color} opacity={0.92} />
            <text
              x={x + item.width / 2}
              y={tagY + TAG_H / 2 + 0.5}
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
}

// ── Picture band ────────────────────────────────────────────────

/**
 * An SVG `<image>`, deliberately not a `foreignObject`: the PDF export strips
 * every foreignObject before serializing, and a data: URI in an `<image>`
 * survives into the standalone SVG and rasterizes. The bitmap was encoded at
 * exactly these dimensions, so it maps 1:1 and there is no crop-versus-letterbox
 * question to answer.
 */
export function ImageBand({
  box,
  geom,
  image,
  onOpen,
}: {
  box: NodeBox;
  geom: NodeGeometry;
  image: NodeImage;
  onOpen: () => void;
}): JSX.Element {
  return (
    <image
      href={image.thumb}
      x={box.x + (box.w - image.w) / 2}
      y={geom.imageY}
      width={image.w}
      height={image.h}
      className="mm-node-image"
      // Inline, not in the stylesheet: the export serializes this element into
      // a standalone SVG where no class rule follows it, and a glyph with
      // square corners in the PDF would not match the canvas.
      style={{ clipPath: 'inset(0 round 5px)' }}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
    >
      <title>{image.name ?? 'Image'}</title>
    </image>
  );
}

// ── Body: the decorations on the centre line, and the text ──────

export function ProgressPie({
  cx,
  cy,
  pct,
  size,
  onClickPie,
}: {
  cx: number;
  cy: number;
  pct: number;
  size: number;
  onClickPie?: () => void;
}): JSX.Element {
  const r = size / 2 - 2;
  const inner = pct >= 100 ? (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#16a34a" />
      <path d={`M ${cx - 4} ${cy} l 3 3 5 -5`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ) : (() => {
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
      {/* A transparent disc over the whole pie, so the hole in the middle
          and the ring are clickable too. */}
      <circle cx={cx} cy={cy} r={r} fill="transparent" />
    </g>
  );
}

export interface BodyActions {
  onToggleCheckbox: (nodeId: string) => void;
  onCycleProgress: (nodeId: string) => void;
}

/**
 * The checkbox, icons and progress dial, all on `geom.centreY`, and the text
 * itself — or the textarea, while the node is being edited.
 */
export function BodyBand({
  box,
  geom,
  parts,
  visual,
  node,
  actions,
  isSearchHit,
  editor,
  checkedInfo,
}: BandProps & {
  node: MindMapTreeNode;
  actions: BodyActions;
  isSearchHit: boolean;
  /** Present only while this node is the one being edited. */
  editor: JSX.Element | null;
  checkedInfo: { checked: number; total: number } | null;
}): JSX.Element {
  const { hasCheckbox, hasProgress, iconCount, lines } = parts;
  const iconsX = box.x + NODE_PAD_X + (hasCheckbox ? CHECKBOX_SIZE + 6 : 0) - 2;

  return (
    <>
      {hasCheckbox && (
        <g className="mm-checkbox-g" onClick={(e) => { e.stopPropagation(); actions.onToggleCheckbox(node.id); }} style={{ cursor: 'pointer' }}>
          <rect
            x={box.x + NODE_PAD_X - 2}
            y={geom.centreY - CHECKBOX_SIZE / 2}
            width={CHECKBOX_SIZE}
            height={CHECKBOX_SIZE}
            rx={3}
            fill={node.checked ? 'var(--accent)' : 'transparent'}
            stroke={node.checked ? 'var(--accent)' : (visual.ownColor ? '#ffffff88' : 'var(--mm-node-stroke)')}
            strokeWidth={1.5}
          />
          {node.checked && (
            <path d={`M ${box.x + NODE_PAD_X + 2} ${geom.centreY} l 3 3 5 -6`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>
      )}

      {iconCount > 0 && !editor && (
        <g transform={`translate(${iconsX}, ${geom.centreY - ICON_SIZE / 2})`} style={{ pointerEvents: 'none' }}>
          {(node.icons ?? []).map((iconName, ii) => (
            <g key={`${iconName}-${ii}`} transform={`translate(${ii * (ICON_SIZE + 4)}, 0)`}>
              <DynamicLucideIcon name={iconName} size={ICON_SIZE} color={visual.textColor} />
            </g>
          ))}
        </g>
      )}

      {hasProgress && (
        <ProgressPie
          cx={iconsX + 2 + (iconCount > 0 ? (ICON_SIZE + 4) * iconCount + 2 : 0) + PROGRESS_PIE_SIZE / 2}
          cy={geom.centreY}
          pct={node.progress!}
          size={PROGRESS_PIE_SIZE}
          onClickPie={() => actions.onCycleProgress(node.id)}
        />
      )}

      {editor ?? lines.map((line, li) => (
        <text
          key={li}
          x={geom.textCentreX}
          y={geom.lineStartY + li * NODE_LINE_H}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={visual.fontSize}
          fontWeight={visual.fontWeight}
          fill={visual.textColor}
          className={`mm-node-text${isSearchHit ? ' mm-search-highlight' : ''}`}
        >
          {line}
        </text>
      ))}

      {checkedInfo && checkedInfo.total > 0 && (
        <text
          x={box.x + box.w - 8}
          y={geom.bodyTopY + geom.bodyH - 6}
          textAnchor="end"
          fontSize={9}
          fill={visual.ownColor ? '#ffffff99' : 'var(--mm-statusbar-text)'}
        >
          {checkedInfo.checked}/{checkedInfo.total}
        </text>
      )}
    </>
  );
}

// ── Footer: the vault link strip, then one strip per URL ────────

/** The little three-panel vault mark that fronts a vault-link strip. */
function VaultGlyph({ x, y, colour }: { x: number; y: number; colour: string }): JSX.Element {
  return (
    <g transform={`translate(${x - 4}, ${y - 4})`} pointerEvents="none">
      <path
        d="M 0 1 L 3 0 L 6 1.5 L 9 0 L 9 7 L 6 8.5 L 3 7 L 0 8 Z"
        fill="none"
        stroke={colour}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path d="M 3 0 L 3 7 M 6 1.5 L 6 8.5" fill="none" stroke={colour} strokeWidth={1.1} />
    </g>
  );
}

export function FooterBand({ box, geom, parts, node, visual, onOpenLink }: {
  box: NodeBox;
  geom: NodeGeometry;
  parts: NodeParts;
  node: MindMapTreeNode;
  visual: NodeVisual;
  /** Opening a vault link is the page's business, not the canvas's. */
  onOpenLink?: (vaultId: string) => void;
}): JSX.Element | null {
  if (parts.footerH === 0) return null;
  const link = parts.link;
  // The vault link takes the first strip; the URLs follow it.
  const urlOffset = link ? 1 : 0;
  return (
    <>
      {link && (
        <g key="vault-link">
          <BandDivider box={box} y={geom.footerTopY} ownColor={visual.ownColor} inset={4} />
          <g
            className="mm-vault-link"
            style={{ cursor: onOpenLink ? 'pointer' : 'default' }}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); onOpenLink?.(link.id); }}
          >
            <VaultGlyph x={box.x + 8} y={geom.footerTopY + LINK_STRIP_H / 2} colour={visual.ownColor ? '#ffffff' : 'var(--accent)'} />
            <text
              x={box.x + 20}
              y={geom.footerTopY + LINK_STRIP_H / 2 + 1.5}
              fontSize={10}
              fontWeight={600}
              fill={visual.ownColor ? '#ffffff' : 'var(--accent)'}
              dominantBaseline="middle"
            >
              {link.label}
            </text>
          </g>
        </g>
      )}
      {(node.urls ?? []).map((urlItem, ui) => {
        const fy = geom.footerTopY + (ui + urlOffset) * LINK_STRIP_H;
        const rawUrl = (urlItem.url ?? '').trim();
        const openUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        return (
          <g key={`url-${ui}`}>
            <BandDivider box={box} y={fy} ownColor={visual.ownColor} inset={4} opacity="33" />
            <text
              x={box.x + 8}
              y={fy + LINK_STRIP_H / 2 + 1.5}
              fontSize={10.5}
              fontWeight={600}
              fill={visual.ownColor ? '#ffffff' : 'var(--accent)'}
              dominantBaseline="middle"
              className={`mm-url-link${visual.ownColor ? ' mm-url-link--on-color' : ''}`}
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); void openExternalUrl(openUrl); }}
            >
              {urlItem.label || rawUrl}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ── Collapse controls ───────────────────────────────────────────

function CollapseBubble({
  x,
  y,
  label,
  onToggle,
}: {
  x: number;
  y: number;
  label: string;
  onToggle: () => void;
}): JSX.Element {
  return (
    <g className="mm-collapse-btn" transform={`translate(${x}, ${y})`} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <circle r={8} fill="var(--mm-collapse-fill)" stroke="var(--mm-collapse-stroke)" strokeWidth={1.5} />
      <text textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="var(--mm-collapse-text)" fontWeight="bold" y={0.5}>
        {label}
      </text>
    </g>
  );
}

/**
 * The fold bubbles. An ordinary node has one, on the side its children are on.
 * The root has one per side, because its two halves fold independently.
 */
export function CollapseControls({
  box,
  node,
  isRoot,
  rootLeftCollapsed,
  rootRightCollapsed,
  onToggleCollapse,
  onToggleRootLeft,
  onToggleRootRight,
}: {
  box: NodeBox;
  node: MindMapTreeNode;
  isRoot: boolean;
  rootLeftCollapsed: boolean;
  rootRightCollapsed: boolean;
  onToggleCollapse: (nodeId: string) => void;
  onToggleRootLeft: () => void;
  onToggleRootRight: () => void;
}): JSX.Element | null {
  const centreY = box.y + box.h / 2;
  const leftX = box.x - 1;
  const rightX = box.x + box.w + 1;

  if (!isRoot) {
    if (node.children.length === 0) return null;
    return (
      <CollapseBubble
        x={box.direction === 'left' ? leftX : rightX}
        y={centreY}
        label={node.collapsed ? `+${node.children.length}` : '−'}
        onToggle={() => onToggleCollapse(node.id)}
      />
    );
  }

  const leftChildren = node.children.filter((child) => child.side === 'left');
  const rightChildren = node.children.filter((child) => child.side !== 'left');
  return (
    <>
      {leftChildren.length > 0 && (
        <CollapseBubble
          x={leftX}
          y={centreY}
          label={rootLeftCollapsed ? `+${leftChildren.length}` : '−'}
          onToggle={onToggleRootLeft}
        />
      )}
      {rightChildren.length > 0 && (
        <CollapseBubble
          x={rightX}
          y={centreY}
          label={rootRightCollapsed ? `+${rightChildren.length}` : '−'}
          onToggle={onToggleRootRight}
        />
      )}
    </>
  );
}
