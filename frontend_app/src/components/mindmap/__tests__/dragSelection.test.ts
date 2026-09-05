import { describe, expect, it } from 'vitest';
import type { MindMapTreeNode } from '../../../types';
import {
  DRAG_THRESHOLD,
  DROP_RADIUS,
  dragDelta,
  entryCentre,
  findDropTarget,
  marqueeBounds,
  nodesInMarquee,
  passedDragThreshold,
  type Layout,
} from '../dragSelection';

/**
 * These pin the arithmetic that decides when a press became a drag, what it is
 * over, and what a marquee caught. All three were inline numbers in the pointer
 * handlers with nothing asserting them.
 */

const entry = (x: number, y: number, w = 80, h = 36) =>
  ({ x, y, w, h, visualTopExtra: 0, subtreeH: h, direction: 'right', node: {} as MindMapTreeNode, parts: {} as never });

const layout = (entries: Record<string, ReturnType<typeof entry>>): Layout =>
  entries as unknown as Layout;

describe('dragDelta', () => {
  it('measures in map units, so a drag feels the same at any zoom', () => {
    const from = { x: 100, y: 100 };
    const to = { x: 160, y: 140 };
    expect(dragDelta(from, to, 1)).toEqual({ x: 60, y: 40 });
    // Zoomed in 2x, the same pointer travel is half as far across the map.
    expect(dragDelta(from, to, 2)).toEqual({ x: 30, y: 20 });
  });
});

describe('passedDragThreshold', () => {
  it('ignores a wobble and accepts real movement on either axis', () => {
    expect(passedDragThreshold({ x: DRAG_THRESHOLD, y: 0 })).toBe(false);
    expect(passedDragThreshold({ x: DRAG_THRESHOLD + 0.1, y: 0 })).toBe(true);
    expect(passedDragThreshold({ x: 0, y: -(DRAG_THRESHOLD + 0.1) })).toBe(true);
  });
});

describe('findDropTarget', () => {
  it('finds a node the dragged one has come close to', () => {
    const l = layout({ a: entry(0, 0), b: entry(500, 500) });
    // The centre of `a` is (40, 18); land on it, then step outside the radius.
    expect(findDropTarget(l, 'dragged', { x: 40, y: 18 })).toBe('a');
    expect(findDropTarget(l, 'dragged', { x: 40, y: 18 + DROP_RADIUS })).toBeNull();
  });

  it('never drops a node onto itself', () => {
    const l = layout({ a: entry(0, 0) });
    expect(findDropTarget(l, 'a', { x: 40, y: 18 })).toBeNull();
  });

  /**
   * Preserved quirk, asserted so that changing it has to be deliberate: the
   * first candidate within the radius wins, in layout order, not the nearest.
   */
  it('takes the first candidate in layout order, not the closest', () => {
    const l = layout({ far: entry(0, 0), near: entry(10, 0) });
    // (52, 18) is nearer the centre of `near` (50, 18) than of `far` (40, 18).
    expect(findDropTarget(l, 'dragged', { x: 52, y: 18 })).toBe('far');
  });
});

describe('entryCentre', () => {
  it('is the middle of the laid-out box', () => {
    expect(entryCentre({ x: 10, y: 20, w: 80, h: 36 })).toEqual({ x: 50, y: 38 });
  });
});

describe('nodesInMarquee', () => {
  const l = layout({
    inside: entry(100, 100),  // centre (140, 118)
    outside: entry(900, 900),
    grazed: entry(180, 100),  // centre (220, 118): the box overlaps, the centre does not
  });

  it('catches a node whose centre is inside', () => {
    expect(nodesInMarquee(l, { startX: 0, startY: 0, curX: 200, curY: 200 }))
      .toEqual(new Set(['inside']));
  });

  /**
   * The decision that makes sweeping a dense branch predictable: overlapping
   * the rectangle is not enough, the centre has to be in it.
   */
  it('does not catch a node it merely grazed', () => {
    const caught = nodesInMarquee(l, { startX: 0, startY: 0, curX: 200, curY: 200 });
    expect(caught.has('grazed')).toBe(false);
  });

  it('works whichever way the rectangle was dragged out', () => {
    const forward = nodesInMarquee(l, { startX: 0, startY: 0, curX: 200, curY: 200 });
    const backward = nodesInMarquee(l, { startX: 200, startY: 200, curX: 0, curY: 0 });
    expect(backward).toEqual(forward);
  });
});

describe('marqueeBounds', () => {
  it('normalises a rectangle dragged up and to the left', () => {
    expect(marqueeBounds({ startX: 100, startY: 80, curX: 20, curY: 10 }))
      .toEqual({ x: 20, y: 10, w: 80, h: 70 });
  });
});
