// @vitest-environment jsdom
/**
 * Compatibility suite: import files the way the *source applications* write
 * them, not the way our exporter writes them.
 *
 * The round-trip suite (roundTrip.test.ts) proves our export → import is
 * self-consistent. This suite proves the importers can read real third-party
 * output — FreePlane's richcontent node text and BACKGROUND_COLOR, XMind 8's
 * content.xml versus Zen's content.json, Obsidian callouts and wiki-links.
 * Those are the files a user actually has, and they exercise code paths our
 * own serializers never produce.
 *
 * Fixtures live in ./fixtures and are committed, imported with Vite
 * `?raw` so the test needs no Node fs/path types. The two .xmind cases are
 * ZIP archives; they are built inline with fflate (already a dependency) in
 * the exact layout the real apps produce — Zen/2020+ content.json and XMind 8
 * content.xml — so no binary fixtures are committed.
 */
import { zipSync, strToU8 } from 'fflate';
import { describe, it, expect } from 'vitest';
import { freemindToTree } from '../freemindImport';
import { wisemappingToTree } from '../wisemappingImport';
import { xmindToTree } from '../xmindImport';
import { obsidianMarkdownToTree } from '../markdownImport';
import { treeToFreemind } from '../freemindExport';

// Text fixtures live in ./fixtures and are committed, imported with Vite
// `?raw` so the test needs no Node fs/path types. The two .xmind cases are
// ZIP archives; they are built inline with fflate (already a dependency) in
// the exact layout the real apps produce — Zen/2020+ content.json and XMind 8
// content.xml — so no binary fixtures are committed.
import freemindReal from './fixtures/freemind-real.mm?raw';
import freeplaneReal from './fixtures/freeplane-real.mm?raw';
import wisemappingReal from './fixtures/wisemapping-real.wxml?raw';
import obsidianReal from './fixtures/obsidian-real.md?raw';

// A genuine FreeMind 1.1.0 export (contributed sample). Exercises <font> and
// <attribute> node children, CREATED/MODIFIED/ID attributes, and an empty
// <attribute NAME="" VALUE=""/> — none of which our own exporter produces.
import freemindSample from './fixtures/sample.mm?raw';

// The two .xmind files are ZIP archives. Rather than commit binaries, build
// them inline with fflate (already a dependency) exactly as the real apps lay
// them out: Zen/2020+ uses content.json, XMind 8 uses content.xml.
function zip(files: Record<string, string>): ArrayBuffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) entries[k] = strToU8(v);
  const zipped = zipSync(entries);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}

const XMIND_ZEN = zip({
  'content.json': JSON.stringify([{
    id: 'sheet-1', class: 'sheet', title: 'Product',
    rootTopic: {
      id: 'root-topic', class: 'topic', title: 'Product',
      children: { attached: [
        { id: 't-design', title: 'Design', notes: { plain: { content: 'Mockups and prototypes' } },
          style: { properties: { 'svg:fill': '#aaccff' } },
          children: { attached: [{ id: 't-ui', title: 'UI' }, { id: 't-ux', title: 'UX' }] } },
        { id: 't-eng', title: 'Engineering', href: 'https://example.com/repo',
          children: { attached: [{ id: 't-api', title: 'API' }] } },
      ] },
    },
  }]),
  'META-INF/manifest.xml': '<?xml version="1.0"?><manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0"><file-entry full-path="content.json" media-type="application/json"/></manifest>',
});

const XMIND8_LEGACY = zip({
  'content.xml': `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0" xmlns:xlink="http://www.w3.org/1999/xlink" version="2.0">
  <sheet id="s1"><title>Legacy Sheet</title>
    <topic id="root"><title>Legacy Root</title>
      <children><topics type="attached">
        <topic id="a"><title>Alpha</title><notes><plain><content>Alpha note</content></plain></notes></topic>
        <topic id="b" xlink:href="https://example.com/legacy"><title>Beta</title></topic>
      </topics></children>
    </topic>
  </sheet>
</xmap-content>`,
});

describe('compatibility: real source-software files', () => {
  it('imports a genuine FreeMind .mm (TEXT attrs, FOLDED, LINK, richcontent note)', () => {
    const root = freemindToTree(freemindReal, 'Project Plan');
    expect(root.text).toBe('Project Plan');
    expect(root.children.map((c) => c.text)).toEqual(['Research', 'Execution']);

    const research = root.children[0];
    expect(research.side).toBe('right');
    expect(research.collapsed).toBe(true);
    // richcontent NOTE → plain-text notes, paragraphs joined by newlines.
    expect(research.notes).toBe('Gather requirements\nInterview stakeholders');
    expect(research.children.map((c) => c.text)).toEqual(['Market', 'Competitors']);
    expect(research.children[0].color).toBe('#0033cc');

    const website = root.children[1].children[0];
    expect(website.urls?.[0].url).toBe('https://example.com');
  });

  it('imports a genuine FreePlane .mm (richcontent NODE text, BACKGROUND_COLOR, skips hooks)', () => {
    const root = freemindToTree(freeplaneReal, 'Roadmap');
    // Root text comes from richcontent TYPE="NODE", not a TEXT attribute.
    expect(root.text).toBe('Roadmap');
    expect(root.children.map((c) => c.text)).toEqual(['Q1 bold goals', 'Risks']);

    const q1 = root.children[0];
    expect(q1.side).toBe('right');
    // BACKGROUND_COLOR is used when TEXT colour is absent.
    expect(q1.color).toBe('#ffcccc');
    // <attribute> and <hook> children are not mistaken for nodes.
    expect(q1.children.map((c) => c.text)).toEqual(['Hire', 'Ship beta']);
    expect(q1.children[1].collapsed).toBe(true);

    // <edge> is skipped; only the real child node remains.
    expect(root.children[1].children.map((c) => c.text)).toEqual(['Scope creep']);
  });

  it('imports a genuine WiseMapping .wxml (order, CDATA note, link)', () => {
    const root = wisemappingToTree(wisemappingReal, 'Team Map');
    expect(root.text).toBe('Team Map');
    // Children are sorted by their `order` attribute, not document order.
    expect(root.children.map((c) => c.text)).toEqual(['People', 'Links']);

    const people = root.children[0];
    expect(people.color).toBe('#ddeeff');
    expect(people.notes).toBe('Who does what');
    expect(people.children.map((c) => c.text)).toEqual(['Alice', 'Bob']);

    expect(root.children[1].urls?.[0].url).toBe('https://example.com/team');
  });

  it('imports a genuine XMind Zen / 2020+ file (content.json)', () => {
    const root = xmindToTree(XMIND_ZEN, 'Product');
    expect(root.text).toBe('Product');
    expect(root.children.map((c) => c.text)).toEqual(['Design', 'Engineering']);

    const design = root.children[0];
    expect(design.notes).toBe('Mockups and prototypes');
    expect(design.color).toBe('#aaccff');
    expect(design.children.map((c) => c.text)).toEqual(['UI', 'UX']);

    expect(root.children[1].urls?.[0].url).toBe('https://example.com/repo');
  });

  it('imports a genuine XMind 8 / legacy file (content.xml)', () => {
    const root = xmindToTree(XMIND8_LEGACY, 'Legacy Root');
    expect(root.text).toBe('Legacy Root');
    expect(root.children.map((c) => c.text)).toEqual(['Alpha', 'Beta']);
    expect(root.children[0].notes).toBe('Alpha note');
    expect(root.children[1].urls?.[0].url).toBe('https://example.com/legacy');
  });

  it('imports a genuine Obsidian / Markmap markdown file', () => {
    const root = obsidianMarkdownToTree(obsidianReal, 'My Note');
    expect(root.text).toBe('My Note');
    // The H1 title is the single top-level branch; H2 sections nest under it.
    const h1 = root.children[0];
    expect(h1.text).toBe('Obsidian / Markmap-style markdown');
    expect(h1.children.map((c) => c.text)).toEqual(['Features', 'Notes', 'Links']);

    const features = h1.children[0];
    const items = features.children;
    // Task-list checkboxes survive.
    expect(items[0].checked).toBe(true);
    expect(items[1].checked).toBe(false);
    expect(items[2].checked ?? null).toBeNull();
    // Nesting by indentation: the child sits under "A plain bullet" (items[2]).
    expect(items[2].children.map((c) => c.text)).toEqual(['Nested child bullet']);
    // Obsidian syntax is stripped from the label.
    expect(items[3].text).toBe('Highlighted and an alias and');

    // Blockquote and callout become notes on the preceding node.
    expect(h1.children[1].notes).toContain('A blockquote becomes a note');
    expect(h1.children[1].notes).toContain('A callout keeps only its text.');
    expect(h1.children[1].notes).not.toContain('[!warning]');

    // Markdown links/images reduce to their text.
    expect(h1.children[2].children[0].text).toBe('See the docs and an image');
  });

  it('imports a real FreeMind 1.1.0 export (font/attribute children, empty attribute)', () => {
    const root = freemindToTree(freemindSample, 'mindmap');
    expect(root.text).toBe('mindmap');
    // <font> and <attribute> children of the root are not mistaken for nodes.
    expect(root.children.map((c) => c.text)).toEqual([
      'spec(dynamic)', 'spec(static)', 'devices', 'calculation', 'storage', 'structure', 'document',
    ]);

    // POSITION is honoured on both sides.
    expect(root.children[0].side).toBe('right');
    expect(root.children[5].side).toBe('left');
    expect(root.children[6].side).toBe('left');

    // Nested structure survives; <attribute> children are skipped at depth.
    const specDynamic = root.children[0];
    expect(specDynamic.children.map((c) => c.text)).toEqual([
      'Interrupt-SPI', 'devices', 'flash(large-read)',
    ]);

    // The node carrying an empty <attribute NAME="" VALUE=""/> still parses.
    const specStatic = root.children[1];
    expect(specStatic.children.map((c) => c.text)).toEqual([
      'interface', 'commands', 'flow', 'normal', 'devices', 'looping',
    ]);
    // Deeper nesting: interface → UART(USB), BLE → advertisement.
    const iface = specStatic.children[0];
    expect(iface.children.map((c) => c.text)).toEqual(['UART(USB)', 'BLE']);
    expect(iface.children[1].children.map((c) => c.text)).toEqual(['advertisement']);

    // Leaf nodes with no attributes at all (e.g. storage → flash) parse too.
    expect(root.children[4].children.map((c) => c.text)).toEqual([
      'flash', 'flash(large-read)', 'memory',
    ]);
  });

  it('re-exports the real sample.mm with FreeMind byte formatting', () => {
    // Import the genuine file, re-export it, and check the bytes follow the
    // spec — this is the closest we get to "opens identically in FreeMind"
    // without the app itself.
    const root = freemindToTree(freemindSample, 'mindmap');
    const out = treeToFreemind(root);

    // Envelope: no prolog, 1.1.0, the comment line, LF endings.
    expect(out.startsWith('<map version="1.1.0">\n')).toBe(true);
    expect(out).not.toContain('<?xml');
    expect(out).not.toContain('\r');

    // Every node's attributes are alphabetically ordered. Find each <node …>
    // opening and check its attribute names are sorted.
    const nodeOpeners = out.match(/<node [^>]*>/g) ?? [];
    expect(nodeOpeners.length).toBeGreaterThan(20); // the sample is large
    for (const opener of nodeOpeners) {
      const names = [...opener.matchAll(/([A-Z_]+)=/g)].map((m) => m[1]);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    }

    // POSITION appears only on the root's direct children (left/right branches).
    const positions = out.match(/POSITION="(left|right)"/g) ?? [];
    expect(positions.length).toBe(7); // 5 right + 2 left in the sample
  });
});
