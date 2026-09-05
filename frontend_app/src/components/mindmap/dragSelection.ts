/**
 * The geometry behind dragging a node and sweeping a selection.
 *
 * The state these serve — which node is selected, which are multi-selected,
 * what is mid-drag — stays in the editor, because it is read from ninety-odd
 * places and moving `useState` to another file would not make any of them
 * simpler. What comes out here is the arithmetic: the thresholds and hit tests
 * that decide when a drag has started, what it is over, and what a marquee
 * caught. Those were inline numbers nothing pinned.
 */

import type { LayoutEntry } from '@mindmapvault/mindmap-core';
import type { MindMapTreeNode } from '../../types';

export type Layout = Record<string, LayoutEntry<MindMapTreeNode>>;

/**
 * How far the pointer travels before a press becomes a drag, in map units.
 * Without it, a click that wobbles by a pixel moves the node.
 */
export const DRAG_THRESHOLD = 4;

/** How close a dragged node has to come to another before it would drop onto it. */
export const DROP_RADIUS = 40;

export interface Point {
  x: number;
  y: number;
}

/** The centre of a laid-out node. */
export const entryCentre = (entry: { x: number; y: number; w: number; h: number }): Point => ({
  x: entry.x + entry.w / 2,
  y: entry.y + entry.h / 2,
});

/**
 * How far the pointer has moved since the drag began, in map units rather than
 * screen pixels — so a drag feels the same at any zoom.
 */
export const dragDelta = (
  from: Point,
  to: Point,
  zoom: number,
): Point => ({ x: (to.x - from.x) / zoom, y: (to.y - from.y) / zoom });

/** Whether the pointer has moved far enough for this to be a drag at all. */
export const passedDragThreshold = (delta: Point): boolean =>
  Math.abs(delta.x) > DRAG_THRESHOLD || Math.abs(delta.y) > DRAG_THRESHOLD;

/**
 * Which node a dragged node would drop onto, or null.
 *
 * Two things here are quirks preserved from the inline version rather than
 * choices worth defending. It takes the *first* candidate within the radius in
 * layout order, not the nearest, so two overlapping candidates resolve
 * arbitrarily. And it measures from the dragged node's top-left corner to the
 * other node's centre, not centre to centre, so the radius is effectively
 * offset by half the dragged node's size. Both are longstanding behaviour;
 * changing either moves where drops land and should be its own decision.
 */
export const findDropTarget = (
  layout: Layout,
  draggedId: string,
  draggedAt: Point,
): string | null => {
  for (const [id, entry] of Object.entries(layout)) {
    if (id === draggedId) continue;
    const centre = entryCentre(entry);
    const distance = Math.sqrt((draggedAt.x - centre.x) ** 2 + (draggedAt.y - centre.y) ** 2);
    if (distance < DROP_RADIUS) return id;
  }
  return null;
};

export interface Marquee {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

/** A marquee as a rectangle, however it was dragged out. */
export const marqueeBounds = (marquee: Marquee) => ({
  x: Math.min(marquee.startX, marquee.curX),
  y: Math.min(marquee.startY, marquee.curY),
  w: Math.abs(marquee.curX - marquee.startX),
  h: Math.abs(marquee.curY - marquee.startY),
});

/**
 * The nodes a marquee caught.
 *
 * A node is caught when its *centre* falls inside — not when it overlaps. So
 * a rectangle drawn across the edge of a wide node does not select it, which
 * is what makes sweeping through a dense branch predictable rather than
 * catching every node the sweep grazed.
 */
export const nodesInMarquee = (layout: Layout, marquee: Marquee): Set<string> => {
  const { x, y, w, h } = marqueeBounds(marquee);
  const caught = new Set<string>();
  for (const [id, entry] of Object.entries(layout)) {
    const centre = entryCentre(entry);
    if (centre.x >= x && centre.x <= x + w && centre.y >= y && centre.y <= y + h) caught.add(id);
  }
  return caught;
};
