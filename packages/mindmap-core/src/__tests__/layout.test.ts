import { beforeAll, describe, expect, it } from 'vitest';
import type { LayoutNode } from '../types';

/**
 * Characterisation tests for the layout engine and the node geometry.
 *
 * These do not assert that the numbers are *right* — they assert that they are
 * what they are today, so a change to the geometry can be shown to move only
 * what it meant to. Read a failure here as "the layout moved", not "the layout
 * is wrong".
 *
 * `measureText` asks a canvas for a width. Real font metrics differ between
 * machines, which would make every expected number a property of the runner, so
 * a stub gives every character a width of 7. The arithmetic around the text is
 * what these tests are for.
 */

const CHAR_W = 7;

type Layout = typeof import('../index');
let layout: Layout;

beforeAll(async () => {
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({
      getContext: () => ({
        font: '',
        measureText: (t: string) => ({ width: (t ?? '').length * CHAR_W }),
      }),
    }),
  };
  layout = await import('../index');
});

/** Stands in for the apps' own `MindMapTreeNode`, which satisfies this shape. */
interface TestNode extends LayoutNode<TestNode> {}

const node = (over: Partial<TestNode> = {}): TestNode =>
  ({ id: 'n', text: 'hello', children: [], ...over }) as TestNode;

describe('measureNodeSize', () => {
  const measure = (over: Partial<TestNode> = {}) =>
    layout.measureNodeSize(node(over));

  it('gives a plain one-line node the minimum height', () => {
    const { w, h, lines } = measure();
    // 'hello' is 5 chars = 35px, + 18px padding each side = 71, under MIN_W 80
    expect(w).toBe(80);
    expect(h).toBe(36); // NODE_MIN_H wins over 1 * 20 + 2 * 8
    expect(lines).toEqual(['hello']);
  });

  it('grows by a line height once the text needs more than two lines', () => {
    const three = measure({ text: 'a\nb\nc' });
    expect(three.lines).toHaveLength(3);
    expect(three.h).toBe(3 * 20 + 8 * 2); // 76, past the 36 minimum
  });

  it('widens for icons, the checkbox and the progress pie', () => {
    const plain = measure({ text: 'wide enough to matter' });
    const decorated = measure({
      text: 'wide enough to matter',
      icons: ['a', 'b'],
      checked: false,
      progress: 50,
    });
    // 2 icons (16+4 each, +2) + checkbox (16+6) + pie (32+6) = 102
    expect(decorated.w - plain.w).toBe(102);
    expect(decorated.h).toBe(plain.h);
  });

  it('adds one strip for notes or attachments, however many there are', () => {
    const base = measure({ text: 'x' }).h;
    const attachment = (id: string) => ({ attachment_id: id }) as never;
    expect(measure({ text: 'x', notes: 'a note' }).h).toBe(base + 18);
    expect(measure({ text: 'x', attachments: [1, 2, 3].map((i) => attachment(String(i))) }).h)
      .toBe(base + 18);
    expect(measure({ text: 'x', notes: 'a note', attachments: [attachment('1')] }).h)
      .toBe(base + 18);
  });

  it('does not give a strip to notes that are only whitespace', () => {
    const base = measure({ text: 'x' }).h;
    expect(measure({ text: 'x', notes: '   \n ' }).h).toBe(base);
  });

  it('adds a strip for a vault link, above the URLs', () => {
    const base = measure({ text: 'x' }).h;
    const url = (u: string) => ({ url: u, label: u }) as never;
    const link = { type: 'vault' as const, id: 'v1', label: 'Roadmap' };
    expect(measure({ text: 'x', link }).h).toBe(base + 18);
    expect(measure({ text: 'x', link, urls: [url('a'), url('b')] }).h).toBe(base + 54);
  });

  it('widens for the link label, not for its id', () => {
    // The strip draws the label, so that is what has to fit: 'a'.repeat(40) at
    // 7px a character plus the glyph's 24px is wider than the id ever is.
    const narrow = measure({ text: 'x', link: { type: 'vault' as const, id: 'v1', label: 'R' } });
    const wide = measure({ text: 'x', link: { type: 'vault' as const, id: 'v1', label: 'a'.repeat(40) } });
    expect(wide.w).toBeGreaterThan(narrow.w);
  });

  it('falls back to the id when a link has no label', () => {
    const parts = layout.describeNode(node({ link: { type: 'vault' as const, id: 'v1' } }));
    expect(parts.link).toEqual({ id: 'v1', label: 'v1' });
  });

  it('adds a strip per URL, and one for tags', () => {
    const base = measure({ text: 'x' }).h;
    const url = (u: string) => ({ url: u, label: u }) as never;
    expect(measure({ text: 'x', urls: [url('a')] }).h).toBe(base + 18);
    expect(measure({ text: 'x', urls: [url('a'), url('b')] }).h).toBe(base + 36);
    expect(measure({ text: 'x', tags: ['w', 'x', 'y', 'z'] }).h).toBe(base + 18);
  });

  it('takes the image into account on both axes', () => {
    const base = measure({ text: 'x' });
    const withImage = measure({ text: 'x', image: { thumb: 'data:,', w: 200, h: 120 } });
    expect(withImage.h).toBe(base.h + 120 + 6); // image + NODE_IMAGE_PAD
    expect(withImage.w).toBe(200 + 18 * 2);     // image + NODE_PAD_X either side
  });

  it('ignores attachment markdown lines when measuring text', () => {
    const withMarkdown = measure({
      text: 'visible\n[Attachment: notes.pdf](attachment://abc)',
    });
    expect(withMarkdown.lines).toEqual(['visible']);
  });
});

describe('describeNode', () => {
  it('counts attachments the node does not carry itself when told to', () => {
    const bare = layout.describeNode(node());
    const resolved = layout.describeNode(node(), { attachmentCount: 2 });
    expect(bare.topMetaH).toBe(0);
    expect(resolved.topMetaH).toBe(18);
  });
});

describe('nodeGeometry', () => {
  /**
   * The invariant the split exists to hold: every band the measurement added
   * is a band the geometry takes back out, so the text body is exactly as tall
   * as it was measured to be. Before the split the renderer subtracted a band
   * the measurement had not added, and the body lost that many pixels.
   */
  const decorated = (over: Partial<TestNode> = {}) =>
    node({
      text: 'a body of text',
      notes: 'note',
      tags: ['one'],
      urls: [{ url: 'https://example.com', label: 'e' } as never],
      image: { thumb: 'data:,', w: 40, h: 30 },
      ...over,
    });

  it('leaves the body exactly as tall as it was measured', () => {
    const parts = layout.describeNode(decorated());
    const { w, h } = layout.measureNodeSize(decorated(), parts);
    const geom = layout.nodeGeometry({ x: 0, y: 0, w, h }, parts);
    const measuredBody = h - parts.topMetaH - parts.topTagH - parts.imageBandH - parts.footerH;
    expect(geom.bodyH).toBe(measuredBody);
    expect(geom.bodyH).toBe(36); // one line, the NODE_MIN_H floor
  });

  it('stacks the bands in order down the box', () => {
    const parts = layout.describeNode(decorated());
    const { w, h } = layout.measureNodeSize(decorated(), parts);
    const g = layout.nodeGeometry({ x: 0, y: 100, w, h }, parts);
    expect(g.metaCentreY).toBe(109);   // 100 + 18/2
    expect(g.tagTopY).toBe(118);       // 100 + meta
    expect(g.tagBottomY).toBe(136);    // + tags
    expect(g.imageY).toBe(139);        // + half the image padding
    expect(g.bodyTopY).toBe(172);      // + the whole image band (30 + 6)
    expect(g.footerTopY).toBe(g.bodyTopY + g.bodyH);
    expect(g.footerTopY + parts.footerH).toBe(100 + h);
  });

  it('centres one line of text in the body', () => {
    const parts = layout.describeNode(node());
    const { w, h } = layout.measureNodeSize(node(), parts);
    const g = layout.nodeGeometry({ x: 0, y: 0, w, h }, parts);
    expect(g.lineStartY).toBe(g.centreY);
    expect(g.textX).toBe(18); // NODE_PAD_X, nothing to the left of the text
    expect(g.textCentreX).toBe(w / 2);
  });

  it('pushes the text right by whatever sits to its left', () => {
    const withDial = node({ checked: true, progress: 25, icons: ['a'] });
    const parts = layout.describeNode(withDial);
    const { w, h } = layout.measureNodeSize(withDial, parts);
    const g = layout.nodeGeometry({ x: 0, y: 0, w, h }, parts);
    expect(g.textX).toBe(18 + parts.leftPad);
    expect(g.textCentreX).toBe(g.textX + (w - 36 - parts.leftPad) / 2);
  });
});

describe('layoutTree', () => {
  it('places the root at the origin it was given', () => {
    const pos = layout.layoutTree(node({ id: 'root' }), 100, 50);
    expect(pos.root.x).toBe(100);
    expect(pos.root.y).toBe(50 - pos.root.h / 2);
    expect(pos.root.direction).toBe('right');
  });

  it('puts children to the right, one node width plus the gap away', () => {
    const root = node({ id: 'root', children: [node({ id: 'a' })] });
    const pos = layout.layoutTree(root, 0, 0);
    expect(pos.a.x).toBe(pos.root.x + pos.root.w + 40); // H_GAP
    expect(pos.a.direction).toBe('right');
  });

  it('sends nodes marked side:left to the other side', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'r' }), node({ id: 'l', side: 'left' } as Partial<TestNode>)],
    });
    const pos = layout.layoutTree(root, 0, 0);
    expect(pos.l.direction).toBe('left');
    expect(pos.l.x).toBe(pos.root.x - pos.l.w - 40);
    expect(pos.r.x).toBeGreaterThan(pos.root.x);
  });

  it('stacks siblings with the vertical gap between them', () => {
    const root = node({ id: 'root', children: [node({ id: 'a' }), node({ id: 'b' })] });
    const pos = layout.layoutTree(root, 0, 0);
    expect(pos.b.y - (pos.a.y + pos.a.h)).toBe(8); // V_GAP
  });

  it('lays out nothing under a collapsed node', () => {
    const root = node({ id: 'root', collapsed: true, children: [node({ id: 'hidden' })] });
    const pos = layout.layoutTree(root, 0, 0);
    expect(pos.hidden).toBeUndefined();
  });

  it('honours a dragged node\'s own position', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'a', customX: 500, customY: 250 } as Partial<TestNode>)],
    });
    const pos = layout.layoutTree(root, 0, 0);
    expect(pos.a.x).toBe(500);
    expect(pos.a.y).toBe(250);
  });

  it('reserves room above a node carrying a date badge', () => {
    const plain = layout.layoutTree(node({ id: 'root' }), 0, 0);
    const dated = layout.layoutTree(
      node({ id: 'root', startDate: '2026-01-01' } as Partial<TestNode>), 0, 0,
    );
    expect(plain.root.visualTopExtra).toBe(0);
    expect(dated.root.visualTopExtra).toBe(34); // DATE_BADGE_OFFSET_H
    // the badge pushes the box down by half of what it adds
    expect(dated.root.y - plain.root.y).toBe(17);
  });

  it('sizes a subtree by its children when they are taller than the parent', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })],
    });
    const pos = layout.layoutTree(root, 0, 0);
    const children = pos.a.h + pos.b.h + pos.c.h + 8 * 2; // three boxes, two gaps
    expect(pos.root.subtreeH).toBe(children);
    expect(pos.root.subtreeH).toBeGreaterThan(pos.root.h);
  });

  it('carries the parts each node was measured from', () => {
    const root = node({ id: 'root', tags: ['a'], notes: 'n' });
    const pos = layout.layoutTree(root, 0, 0);
    expect(pos.root.parts.topTagH).toBe(18);
    expect(pos.root.parts.topMetaH).toBe(18);
  });

  it('measures with the caller\'s own reading of a node when given one', () => {
    // The editor resolves attachments that live outside the tree; the layout
    // has to reserve the strip for them or the renderer draws over the text.
    const root = node({ id: 'root' });
    const plain = layout.layoutTree(root, 0, 0);
    const withExternal = layout.layoutTree(root, 0, 0, (n) =>
      layout.describeNode(n, { attachmentCount: 1 }),
    );
    expect(withExternal.root.h - plain.root.h).toBe(18);
  });
});

describe('bezierPath', () => {
  it('bends through the horizontal midpoint', () => {
    expect(layout.bezierPath(0, 0, 100, 50)).toBe('M 0,0 C 50,0 50,50 100,50');
  });
});
