/**
 * Where the boxes go.
 *
 * A two-pass tree layout: subtree heights bottom-up, then positions top-down.
 * How big each node is, and what it is made of, is `geometry.ts`'s job; this
 * file only places the boxes. The parts each node was measured from ride along
 * in its `LayoutEntry`, so a renderer draws inside exactly the box that was
 * measured rather than working the bands out a second time.
 */

import { H_GAP, V_GAP } from './constants';
import { describeNode, measureNodeSize } from './geometry';
import type { DescribeNode, LayoutEntry, LayoutNode } from './types';

export const layoutTree = <N extends LayoutNode<N>>(
  root: N,
  startX = 0,
  startY = 0,
  describe: DescribeNode<N> = describeNode,
): Record<string, LayoutEntry<N>> => {
  const pos: Record<string, Partial<LayoutEntry<N>>> = {};

  // First pass: compute subtree heights (bottom-up)
  const computeHeight = (node: N): number => {
    const parts = describe(node);
    const { w, h } = measureNodeSize(node, parts);
    const visualTopExtra = parts.visualTopExtra;
    const visualH = h + visualTopExtra;

    if (!node.children || node.children.length === 0 || node.collapsed) {
      pos[node.id] = { w, h, visualTopExtra, subtreeH: visualH, node, parts };
      return visualH;
    }

    let childrenH = 0;
    node.children.forEach((ch, i) => {
      childrenH += computeHeight(ch);
      if (i > 0) childrenH += V_GAP;
    });

    const subtreeH = Math.max(visualH, childrenH);
    pos[node.id] = { w, h, visualTopExtra, subtreeH, node, parts };
    return subtreeH;
  };

  computeHeight(root);

  // Second pass: assign x, y positions (top-down)
  const assignPos = (
    node: N,
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

    const layoutGroup = (children: N[], dir: 'left' | 'right') => {
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
  return pos as Record<string, LayoutEntry<N>>;
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
