// @vitest-environment jsdom
/**
 * Round-trip fidelity tests: export a tree, re-import it, and assert what
 * survives.
 *
 * The fixture below sets every field the editor can put on a node — notes,
 * colour, side, collapse, icons, checkbox, progress, dates, urls, tags,
 * image, attachments — so a format that silently drops one shows up here as
 * a diff, not as a user's lost map.
 *
 * Each format declares what it *can* carry in a `Fidelity` mask. The test
 * compares only those fields, so a format is held to its own contract — but
 * the contract is written down in one place, and raising it (teaching the
 * FreeMind writer about icons, say) is a one-line change that the test then
 * enforces.
 *
 * The native `.mmvault` format is the only one expected to be lossless
 * (`NATIVE` mask). It exists precisely because none of the interchange
 * formats can carry the full field set.
 */
import { describe, it, expect } from 'vitest';
import type { MindMapTreeNode } from '../../types';
import { treeToMarkdown } from '../markdownExport';
import { obsidianMarkdownToTree } from '../markdownImport';
import { treeToFreemind } from '../freemindExport';
import { treeToFreeplane } from '../freeplaneExport';
import { freemindToTree } from '../freemindImport';
import { treeToWisemapping } from '../wisemappingExport';
import { wisemappingToTree } from '../wisemappingImport';
import { treeToXmind } from '../xmindExport';
import { xmindToTree } from '../xmindImport';
import { treeToMmvault, mmvaultToTree } from '../mmvaultFormat';

// ── Fixture ─────────────────────────────────────────────────────────────────

let seq = 0;
function n(partial: Partial<MindMapTreeNode> & { text: string }, children: MindMapTreeNode[] = []): MindMapTreeNode {
  return {
    id: `fx-${++seq}`,
    notes: '',
    collapsed: false,
    color: null,
    icons: [],
    checked: null,
    progress: null,
    startDate: null,
    endDate: null,
    urls: [],
    children,
    ...partial,
  };
}

/** A tree that touches every field the editor can set. */
function fixture(): MindMapTreeNode {
  seq = 0;
  return n({ text: 'Root', notes: 'root note' }, [
    n({
      text: 'Formatted',
      side: 'right',
      color: '#22c55e',
      collapsed: true,
      icons: ['Target', 'Sparkles'],
      checked: true,
      progress: 75,
      startDate: '2026-05-01T09:00',
      endDate: '2026-05-18T18:00',
      tags: ['ui', 'interactive'],
      urls: [{ label: 'Docs', url: 'https://example.com/docs' }],
      notes: 'multi\nline\nnote',
    }, [
      n({ text: 'Child', checked: false, progress: 25 }),
    ]),
    n({
      text: 'Media',
      side: 'left',
      image: { thumb: 'data:image/webp;base64,AA==', w: 64, h: 64, name: 'pic.webp', attachment_id: 'att-1' },
      attachments: [{
        attachment_id: 'att-1',
        name: 'pic.webp',
        content_type: 'image/webp',
        size_bytes: 128,
        preview_kind: 'image',
        uploaded_at: '2026-09-02T00:00:00.000Z',
        inline_data_base64: 'AA==',
      }],
    }),
  ]);
}

// ── Fidelity masks ──────────────────────────────────────────────────────────
// The fields a format is expected to preserve. Anything not listed is allowed
// to be lost — that is the format's documented contract, not a test bug.

interface Fidelity {
  notes?: boolean;
  color?: boolean;
  side?: boolean;
  collapsed?: boolean;
  icons?: boolean;
  checked?: boolean;
  progress?: boolean;
  dates?: boolean;
  urls?: boolean;
  tags?: boolean;
  image?: boolean;
  /** Compare attachment presence. 'name' = name only (text dialects drop id/size). */
  attachments?: boolean | 'name';
}

/** The native format loses nothing. */
const NATIVE: Fidelity = {
  notes: true, color: true, side: true, collapsed: true, icons: true,
  checked: true, progress: true, dates: true, urls: true, tags: true,
  image: true, attachments: true,
};

const MARKDOWN: Fidelity = { notes: true, checked: true, progress: true, icons: true, tags: true, urls: true, attachments: 'name' };
const FREEMIND: Fidelity = { notes: true, color: true, side: true, collapsed: true, urls: true };
const WISEMAPPING: Fidelity = { notes: true, color: true, side: true, urls: true };
const XMIND: Fidelity = { notes: true, color: true, urls: true };

// ── Comparison ──────────────────────────────────────────────────────────────

function stripTo(node: MindMapTreeNode, f: Fidelity): unknown {
  return {
    text: node.text,
    ...(f.notes ? { notes: node.notes ?? '' } : {}),
    ...(f.color ? { color: node.color ?? null } : {}),
    ...(f.side ? { side: node.side ?? null } : {}),
    ...(f.collapsed ? { collapsed: node.collapsed ?? false } : {}),
    ...(f.icons ? { icons: node.icons ?? [] } : {}),
    ...(f.checked ? { checked: node.checked ?? null } : {}),
    ...(f.progress ? { progress: node.progress ?? null } : {}),
    ...(f.dates ? { startDate: node.startDate ?? null, endDate: node.endDate ?? null } : {}),
    ...(f.urls ? { urls: (node.urls ?? []).map((u) => u.url) } : {}),
    ...(f.tags ? { tags: node.tags ?? [] } : {}),
    ...(f.image ? { image: node.image ? { w: node.image.w, h: node.image.h, name: node.image.name ?? null } : null } : {}),
    ...(f.attachments
      ? {
          attachments: (node.attachments ?? []).map((a) =>
            f.attachments === 'name'
              ? a.name
              : { id: a.attachment_id, name: a.name, size: a.size_bytes }),
        }
      : {}),
    children: node.children.map((c) => stripTo(c, f)),
  };
}

function expectRoundTrip(
  name: string,
  fidelity: Fidelity,
  serialize: (root: MindMapTreeNode) => string | Blob | Promise<string | Blob>,
  parse: (data: string | ArrayBuffer, title: string) => MindMapTreeNode,
) {
  it(`${name} round-trips everything it claims to carry`, async () => {
    const original = fixture();
    const out = await serialize(original);
    const data = out instanceof Blob ? await out.arrayBuffer() : out;
    const back = parse(data, 'Root');
    // The importer re-titles the root from the file name; compare on text.
    back.text = original.text;
    expect(stripTo(back, fidelity)).toEqual(stripTo(original, fidelity));
  });
}

// ── Suites ──────────────────────────────────────────────────────────────────

describe('round-trip fidelity', () => {
  expectRoundTrip('native .mmvault', NATIVE,
    (r) => treeToMmvault(r),
    (d, t) => mmvaultToTree(d as string, t));

  expectRoundTrip('markdown', MARKDOWN,
    (r) => treeToMarkdown(r),
    (d, t) => obsidianMarkdownToTree(d as string, t));

  expectRoundTrip('freemind', FREEMIND,
    (r) => treeToFreemind(r),
    (d, t) => freemindToTree(d as string, t));

  expectRoundTrip('freeplane', FREEMIND,
    (r) => treeToFreeplane(r),
    (d, t) => freemindToTree(d as string, t));

  expectRoundTrip('wisemapping', WISEMAPPING,
    (r) => treeToWisemapping(r),
    (d, t) => wisemappingToTree(d as string, t));

  expectRoundTrip('xmind', XMIND,
    (r) => treeToXmind(r, 'Root'),
    (d, t) => xmindToTree(d as ArrayBuffer, t));
});

/**
 * The gaps below are the point of the review comment: exporting to any
 * interchange format and re-importing loses fields the user set. These tests
 * pin that loss so it is a deliberate, documented contract — and so closing
 * a gap is a test change, not a silent behaviour change.
 */
describe('documented interchange losses', () => {
  it('does not unwrap a generic Obsidian doc with one heading and one item', () => {
    // `# Project` + a single `- task` is a normal note, not an export
    // round-trip. The heading must stay a child of the title root.
    const t = obsidianMarkdownToTree('# Project\n- task\n', 'My File');
    expect(t.text).toBe('My File');
    expect(t.children.map((c) => c.text)).toEqual(['Project']);
    expect(t.children[0].children.map((c) => c.text)).toEqual(['task']);
  });

  it('markdown still drops colour and image; dates survive only approximately', () => {
    const back = obsidianMarkdownToTree(treeToMarkdown(fixture()), 'Root');
    const formatted = back.children.find((c) => c.text === 'Formatted')!;
    // Colour has no home in the markdown dialect, and the node picture is a
    // binary thumbnail that is not written to text at all.
    expect(formatted.color ?? null).toBeNull();
    const media = back.children.find((c) => c.text === 'Media')!;
    expect(media.image ?? null).toBeNull();
    // Dates are written locale-formatted, so they survive as *a* date but not
    // the exact instant — presence is preserved, precision is not.
    expect(formatted.startDate).toBeTruthy();
    expect(formatted.endDate).toBeTruthy();
    // The fields the dialect does carry survive the round-trip exactly.
    expect(formatted.icons).toEqual(['Target', 'Sparkles']);
    expect(formatted.progress).toBe(75);
    expect(formatted.tags).toEqual(['ui', 'interactive']);
    expect(formatted.urls?.map((u) => u.url)).toEqual(['https://example.com/docs']);
  });

  it('freemind drops icons, progress, dates, tags, image, attachments', () => {
    const back = freemindToTree(treeToFreemind(fixture()), 'Root');
    const formatted = back.children.find((c) => c.text === 'Formatted')!;
    expect(formatted.icons ?? []).toEqual([]);
    expect(formatted.progress ?? null).toBeNull();
    expect(formatted.startDate ?? null).toBeNull();
    expect(formatted.tags ?? []).toEqual([]);
    const media = back.children.find((c) => c.text === 'Media')!;
    expect(media.image ?? null).toBeNull();
    expect(media.attachments ?? []).toEqual([]);
  });

  it('markdown round-trips when a vault title differs from the root text', () => {
    // The real export path passes a vault title, so the file is
    // `# My Vault` followed by the root node as a `- Root` list item.
    // Import must not nest that under a synthetic "My Vault" wrapper.
    const md = treeToMarkdown(fixture(), 'My Vault');
    const back = obsidianMarkdownToTree(md, 'My Vault');
    expect(back.text).toBe('My Vault');
    // The root's own children are the two top-level branches, not a wrapper.
    expect(back.children.map((c) => c.text)).toEqual(['Formatted', 'Media']);
  });
});

/**
 * Byte-level compliance with the FreeMind format spec
 * (docs/FREEMIND_MM_FORMAT_SPEC.md). These assert the *bytes*, not just that
 * the output re-parses — attribute order, the absent prolog, numeric-entity
 * escaping, and where POSITION may appear are what make the file open
 * identically in real FreeMind.
 */
describe('freemind byte compatibility', () => {
  const node = (over: Partial<MindMapTreeNode>): MindMapTreeNode => ({
    id: 'x', text: 't', notes: '', collapsed: false, color: null, icons: [],
    checked: null, progress: null, startDate: null, endDate: null, urls: [],
    children: [], ...over,
  });

  it('starts with <map version="1.1.0"> and the FreeMind comment, no prolog', () => {
    const out = treeToFreemind(node({ text: 'Root' }));
    expect(out.startsWith('<map version="1.1.0">\n')).toBe(true);
    expect(out).not.toContain('<?xml');
    expect(out).toContain('<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->');
    expect(out.endsWith('</map>\n')).toBe(true);
  });

  it('emits attributes in alphabetical order', () => {
    const out = treeToFreemind(node({
      text: 'Root',
      children: [node({ text: 'c', color: '#ff0000', collapsed: true, side: 'left', urls: [{ label: '', url: 'https://x' }] })],
    }));
    // COLOR < FOLDED < LINK < POSITION < TEXT
    expect(out).toContain('<node COLOR="#ff0000" FOLDED="true" LINK="https://x" POSITION="left" TEXT="c"/>');
  });

  it('writes POSITION only on the root’s direct children', () => {
    const out = treeToFreemind(node({
      text: 'Root',
      children: [node({ text: 'child', side: 'left', children: [node({ text: 'grand', side: 'right' })] })],
    }));
    expect(out).toContain('POSITION="left" TEXT="child"');
    // The grandchild's side must not produce a POSITION attribute.
    expect(out).toContain('<node TEXT="grand"/>');
    expect(out).not.toContain('POSITION="right"');
  });

  it('escapes non-ASCII as numeric entities, specials as named entities', () => {
    const out = treeToFreemind(node({ text: 'a<b>&"\' café Ω' }));
    expect(out).toContain('a&lt;b&gt;&amp;&quot;&apos; caf&#xe9; &#x3a9;');
    expect(out).not.toContain('café'); // no raw UTF-8 pass-through
  });

  it('self-closes childless nodes and uses LF newlines with no indentation', () => {
    const out = treeToFreemind(node({ text: 'Root', children: [node({ text: 'leaf' })] }));
    expect(out).toContain('<node TEXT="leaf"/>\n');
    expect(out).not.toContain('\r');
    expect(out).not.toContain('  <node'); // no indentation
  });

  it('wraps notes in richcontent TYPE="NOTE" without double-escaping the markup', () => {
    const out = treeToFreemind(node({ text: 'Root', notes: 'line one\nline two' }));
    expect(out).toContain('<richcontent TYPE="NOTE"><html><head/><body><p>line one<br/>line two</p></body></html></richcontent>');
  });
});

/**
 * Byte-level compliance with the WiseMapping tango format
 * (docs/WISEMAPPING_FORMAT_SPEC.md). These assert the bytes real WiseMapping
 * reads — the map envelope, numeric ids, central/position/order, the text
 * attribute vs. CDATA split, and feature elements.
 */
describe('wisemapping tango byte compatibility', () => {
  const node = (over: Partial<MindMapTreeNode>): MindMapTreeNode => ({
    id: 'x', text: 't', notes: '', collapsed: false, color: null, icons: [],
    checked: null, progress: null, startDate: null, endDate: null, urls: [],
    children: [], ...over,
  });

  it('opens with the tango map envelope', () => {
    const out = treeToWisemapping(node({ text: 'Root' }), 'My Map');
    expect(out.startsWith('<map name="My Map" version="tango" layout="mindmap">')).toBe(true);
    expect(out.endsWith('</map>')).toBe(true);
  });

  it('marks the root central and gives every topic a numeric id', () => {
    const out = treeToWisemapping(node({ text: 'Root', children: [node({ text: 'c' })] }));
    expect(out).toContain('<topic central="true" text="Root" id="1">');
    expect(out).toMatch(/<topic position="-?\d+,-?\d+" order="0" text="c" id="2"\/>/);
  });

  it('writes single-line text as an attribute and multi-line as a CDATA child', () => {
    const single = treeToWisemapping(node({ text: 'one line' }));
    expect(single).toContain('text="one line"');
    expect(single).not.toContain('<text>');

    const multi = treeToWisemapping(node({ text: 'line one\nline two' }));
    expect(multi).toContain('<text><![CDATA[line one\nline two]]></text>');
    expect(multi).not.toContain('text="line one');
  });

  it('writes notes and links as feature elements with CDATA / urlType', () => {
    const out = treeToWisemapping(node({
      text: 'Root', notes: 'a note', urls: [{ label: '', url: 'https://x' }],
    }));
    expect(out).toContain('<note><![CDATA[a note]]></note>');
    expect(out).toContain('<link url="https://x" urlType="url"/>');
  });

  it('recovers left/right side from the synthesized position on re-import', () => {
    const back = wisemappingToTree(treeToWisemapping(node({
      text: 'Root',
      children: [node({ text: 'L', side: 'left' }), node({ text: 'R', side: 'right' })],
    })), 'Root');
    expect(back.children[0].side).toBe('left');
    expect(back.children[1].side).toBe('right');
  });
});
