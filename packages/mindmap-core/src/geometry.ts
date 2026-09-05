/**
 * A node's parts, how much room each needs, and where each one goes.
 *
 * This exists because the same arithmetic used to be done three times: in
 * `measureNodeSize`, to decide how big a node is; inline in the editor's
 * render function, to decide where inside it each part goes; and again in the
 * vault preview, to draw the thumbnail. All three derived `leftPad`, the strip
 * heights, `bodyTopY` and `bodyH` from the same fields, and they have to agree
 * exactly or the text drifts out of the box it was measured for. They had
 * already drifted.
 *
 * So: `describeNode` reads the node once, `measureNodeSize` adds the bands up,
 * and `nodeGeometry` turns the box the layout produced back into positions.
 * Measuring and drawing then use the same numbers by construction rather than
 * by inspection.
 */

import {
  NODE_LINE_H,
  NODE_MIN_H,
  NODE_PAD_X,
  NODE_PAD_Y,
  MIN_W,
  LINK_STRIP_H,
  TAG_STRIP_H,
  TOP_META_STRIP_H,
  DATE_BADGE_OFFSET_H,
  ICON_SIZE,
  CHECKBOX_SIZE,
  PROGRESS_PIE_SIZE,
  NODE_IMAGE_PAD,
} from './constants';
import { getVisibleNodeTextLines } from './text';
import type {
  DescribeOptions,
  LayoutNode,
  NodeBox,
  NodeGeometry,
  NodeParts,
  NodeSize,
} from './types';

// ── Text measurement ────────────────────────────────────────────

let measureContext: CanvasRenderingContext2D | null = null;
/**
 * Cached, because a headless environment has no 2d context and asking twice
 * only produces the same failure twice. The fallback estimate keeps the layout
 * usable outside a browser; the browser always has the real thing.
 */
let measureUnavailable = false;

export const measureText = (text: string, fontSize = 14): number => {
  if (!measureContext && !measureUnavailable) {
    try {
      measureContext = document.createElement('canvas').getContext('2d');
    } catch {
      measureContext = null;
    }
    if (!measureContext) measureUnavailable = true;
  }
  if (!measureContext) return (text?.length ?? 1) * fontSize * 0.6;

  measureContext.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  return measureContext.measureText(text || ' ').width;
};

// ── What a node is made of ──────────────────────────────────────

export const describeNode = <N extends LayoutNode<N>>(
  node: N,
  options: DescribeOptions = {},
): NodeParts => {
  const lines = getVisibleNodeTextLines(node.text);
  const iconCount = node.icons?.length ?? 0;
  const urlCount = node.urls?.length ?? 0;
  const tags = node.tags ?? [];
  // The label falls back to the id: a link made before labels were stored, or
  // one whose vault has been renamed away, still has something to draw.
  const link = node.link?.id ? { id: node.link.id, label: node.link.label || node.link.id } : null;

  const hasCheckbox = node.checked != null;
  const hasProgress = node.progress != null;
  // Trimmed, deliberately: a node whose notes are a stray space has nothing to
  // show, and the renderer used to disagree with the layout about that.
  const hasNote = Boolean(node.notes?.trim());
  const attachmentCount = options.attachmentCount ?? node.attachments?.length ?? 0;
  const hasDate = Boolean(node.startDate || node.endDate);
  const image = node.image?.thumb ? node.image : null;

  return {
    lines,
    iconCount,
    urlCount,
    tags,
    tagCount: tags.length,
    link,
    hasCheckbox,
    hasProgress,
    hasNote,
    attachmentCount,
    hasDate,
    image,
    leftPad:
      (hasCheckbox ? CHECKBOX_SIZE + 6 : 0) +
      (iconCount > 0 ? (ICON_SIZE + 4) * iconCount + 2 : 0) +
      (hasProgress ? PROGRESS_PIE_SIZE + 6 : 0),
    topMetaH: hasNote || attachmentCount > 0 ? TOP_META_STRIP_H : 0,
    topTagH: tags.length > 0 ? TAG_STRIP_H : 0,
    imageBandH: image ? image.h + NODE_IMAGE_PAD : 0,
    footerH: ((link ? 1 : 0) + urlCount) * LINK_STRIP_H,
    visualTopExtra: hasDate ? DATE_BADGE_OFFSET_H : 0,
  };
};

// ── How big it has to be ────────────────────────────────────────

/** How big a node has to be to hold everything `describeNode` found in it. */
export const measureNodeSize = <N extends LayoutNode<N>>(
  node: N,
  parts: NodeParts = describeNode(node),
): NodeSize => {
  const urlW = parts.urlCount > 0 ? 120 : 0;
  const linkW = parts.link ? measureText(parts.link.label, 10) + 24 : 0;
  const maxW = Math.max(...parts.lines.map((line) => measureText(line || ' ')), linkW, urlW);

  const textW = Math.max(MIN_W, maxW + NODE_PAD_X * 2 + parts.leftPad);
  const imageW = parts.image ? parts.image.w + NODE_PAD_X * 2 : 0;
  const bodyH = Math.max(NODE_MIN_H, parts.lines.length * NODE_LINE_H + NODE_PAD_Y * 2);

  return {
    w: Math.max(textW, imageW),
    h: bodyH + parts.topMetaH + parts.topTagH + parts.imageBandH + parts.footerH,
    lines: parts.lines,
  };
};

// ── Where each part goes, once the node has been placed ─────────

/**
 * The counterpart to `measureNodeSize`: given the box the layout produced,
 * where does each band start. `bodyH` here is by construction the same number
 * `measureNodeSize` added the bands to.
 */
export const nodeGeometry = (box: NodeBox, parts: NodeParts): NodeGeometry => {
  const bandsAboveBody = parts.topMetaH + parts.topTagH + parts.imageBandH;
  const bodyTopY = box.y + bandsAboveBody;
  const bodyH = box.h - bandsAboveBody - parts.footerH;
  const textX = box.x + NODE_PAD_X + parts.leftPad;

  return {
    metaCentreY: box.y + parts.topMetaH / 2,
    tagTopY: box.y + parts.topMetaH,
    tagBottomY: box.y + parts.topMetaH + parts.topTagH,
    imageY: box.y + parts.topMetaH + parts.topTagH + NODE_IMAGE_PAD / 2,
    bodyTopY,
    bodyH,
    centreY: bodyTopY + bodyH / 2,
    textX,
    textCentreX: textX + (box.w - NODE_PAD_X * 2 - parts.leftPad) / 2,
    lineStartY: bodyTopY + bodyH / 2 - ((parts.lines.length - 1) * NODE_LINE_H) / 2,
    footerTopY: bodyTopY + bodyH,
  };
};
