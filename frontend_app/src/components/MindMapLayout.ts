/**
 * MindMapLayout
 *
 * Layout engine for the MindMap — computes node positions in a two-pass
 * (bottom-up height, then top-down position) tree layout algorithm.
 * Accounts for checkbox, progress pie, link strips, and URL footers.
 */

import type { MindMapTreeNode } from '../types';
import {
  NODE_LINE_H,
  NODE_MIN_H,
  NODE_PAD_X,
  NODE_PAD_Y,
  H_GAP,
  V_GAP,
  MIN_W,
  LINK_STRIP_H,
  TAG_STRIP_H,
  TOP_META_STRIP_H,
  DATE_BADGE_OFFSET_H,
  CHECKBOX_SIZE,
  PROGRESS_PIE_SIZE,
} from './MindMapConstants';
import { getVisibleNodeTextLines } from '../utils/nodeAttachments';

// ── Text measurement ────────────────────────────────────────────

let _measureCtx: CanvasRenderingContext2D | null = null;

export const measureText = (text: string, fontSize = 14): number => {
  if (!_measureCtx) {
    const c = document.createElement('canvas');
    _measureCtx = c.getContext('2d')!;
  }
  _measureCtx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  return _measureCtx.measureText(text || ' ').width;
};

/**
 * Measure size for a node, accounting for checkbox and progress pie,
 * link strip, tag strip, and URL footers.
 */
export const measureNodeSize = (
  text: string,
  linkId: string | null,
  _iconCount: number,
  hasCheckbox: boolean,
  urlCount: number,
  hasProgress: boolean,
  hasNote = false,
  attachmentCount = 0,
  tagCount = 0,
): { w: number; h: number; lines: string[] } => {
  const lines = getVisibleNodeTextLines(text);
  const linkW = linkId ? measureText(linkId, 10) + 24 : 0;
  const urlW = urlCount > 0 ? 120 : 0;
  const maxW = Math.max(...lines.map((l) => measureText(l || ' ')), linkW, urlW);
  const extraLeft =
    (hasCheckbox ? CHECKBOX_SIZE + 6 : 0) +
    (hasProgress ? PROGRESS_PIE_SIZE + 6 : 0);
  const w = Math.max(MIN_W, maxW + NODE_PAD_X * 2 + extraLeft);
  const baseH = Math.max(NODE_MIN_H, lines.length * NODE_LINE_H + NODE_PAD_Y * 2);
  const footerLinks = (linkId ? 1 : 0) + urlCount;
  const topMetaH = (hasNote || attachmentCount > 0) ? TOP_META_STRIP_H : 0;
  const h = baseH + topMetaH + (footerLinks > 0 ? LINK_STRIP_H * footerLinks : 0) + (tagCount > 0 ? TAG_STRIP_H : 0);
  return { w, h, lines };
};

// ── Layout types ────────────────────────────────────────────────

export interface LayoutEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  visualTopExtra: number;
  subtreeH: number;
  direction: 'left' | 'right';
  node: MindMapTreeNode;
}

// ── Tree layout ─────────────────────────────────────────────────

export const layoutTree = (
  root: MindMapTreeNode,
  startX = 0,
  startY = 0,
): Record<string, LayoutEntry> => {
  const pos: Record<string, Partial<LayoutEntry>> = {};

  // First pass: compute subtree heights (bottom-up)
  const computeHeight = (node: MindMapTreeNode): number => {
    const linkId = node.link?.id || null;
    const iconCount = 0;
    const hasCheckbox = node.checked != null;
    const urlCount = Array.isArray(node.urls) ? node.urls.length : 0;
    const hasProgress = node.progress != null;
    const hasNote = Boolean((node.notes ?? '').trim());
    const attachmentCount = Array.isArray(node.attachments) ? node.attachments.length : 0;
    const tagCount = Array.isArray(node.tags) ? node.tags.length : 0;
    const hasDate = Boolean(node.startDate || node.endDate);
    const visualTopExtra = hasDate ? DATE_BADGE_OFFSET_H : 0;
    const { w, h } = measureNodeSize(node.text, linkId, iconCount, hasCheckbox, urlCount, hasProgress, hasNote, attachmentCount, tagCount);
    const visualH = h + visualTopExtra;

    if (!node.children || node.children.length === 0 || node.collapsed) {
      pos[node.id] = { w, h, visualTopExtra, subtreeH: visualH, node };
      return visualH;
    }

    let childrenH = 0;
    node.children.forEach((ch, i) => {
      childrenH += computeHeight(ch);
      if (i > 0) childrenH += V_GAP;
    });

    const subtreeH = Math.max(visualH, childrenH);
    pos[node.id] = { w, h, visualTopExtra, subtreeH, node };
    return subtreeH;
  };

  computeHeight(root);

  // Second pass: assign x, y positions (top-down)
  const assignPos = (
    node: MindMapTreeNode,
    x: number,
    yCenter: number,
    direction: 'left' | 'right' = 'right',
  ) => {
    const p = pos[node.id]!;
    p.direction = direction;

    // Use custom position if the node has been manually dragged
    if (node.customX != null && node.customY != null) {
      p.x = node.customX;
      p.y = node.customY;
    } else {
      const topExtra = p.visualTopExtra ?? 0;
      p.x = x;
      p.y = yCenter - ((p.h ?? 0) + topExtra) / 2 + topExtra;
    }

    if (!node.children || node.children.length === 0 || node.collapsed) return;

    const layoutGroup = (children: MindMapTreeNode[], dir: 'left' | 'right') => {
      let totalH = 0;
      children.forEach((ch, i) => {
        totalH += pos[ch.id]!.subtreeH ?? 0;
        if (i > 0) totalH += V_GAP;
      });

      let cy = yCenter - totalH / 2;
      children.forEach((ch) => {
        const chP = pos[ch.id]!;
        const chCenter = cy + (chP.subtreeH ?? 0) / 2;
        const childX = dir === 'right'
          ? x + (p.w ?? 0) + H_GAP
          : x - (chP.w ?? 0) - H_GAP;
        assignPos(ch, childX, chCenter, dir);
        cy += (chP.subtreeH ?? 0) + V_GAP;
      });
    };

    if (node.id === 'root') {
      const rightChildren = node.children.filter((ch) => ch.side !== 'left');
      const leftChildren = node.children.filter((ch) => ch.side === 'left');
      if (rightChildren.length > 0) layoutGroup(rightChildren, 'right');
      if (leftChildren.length > 0) layoutGroup(leftChildren, 'left');
    } else {
      layoutGroup(node.children, direction);
    }
  };

  assignPos(root, startX, startY);
  return pos as Record<string, LayoutEntry>;
};

/** Bezier connection path between two points. */
export const bezierPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string => {
  const mx = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`;
};
