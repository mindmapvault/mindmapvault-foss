// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { treeToFreeplane } from '../freeplaneExport';
import { treeToWisemapping } from '../wisemappingExport';
import { wisemappingToTree } from '../wisemappingImport';
import { treeToXmind } from '../xmindExport';
import { xmindToTree } from '../xmindImport';
import { freemindToTree } from '../freemindImport';
import { obsidianMarkdownToTree } from '../markdownImport';
import type { MindMapTreeNode } from '../../types';

function n(text: string, children: MindMapTreeNode[] = []): MindMapTreeNode {
  return { id: text, text, notes: '', collapsed: false, color: null, icons: [], checked: null,
    progress: null, startDate: null, endDate: null, urls: [], children };
}

const tree = n('Root', [n('Alpha', [n('A1')]), n('Beta')]);

describe('formats', () => {
  it('freeplane export is parseable by the .mm importer', () => {
    const xml = treeToFreeplane(tree);
    expect(xml).toContain('freeplane');
    const back = freemindToTree(xml, 'Root');
    expect(back.children.map(c => c.text)).toEqual(['Alpha', 'Beta']);
    expect(back.children[0].children[0].text).toBe('A1');
  });

  it('wisemapping round-trips', () => {
    const back = wisemappingToTree(treeToWisemapping(tree), 'Root');
    expect(back.children.map(c => c.text)).toEqual(['Alpha', 'Beta']);
    expect(back.children[0].children[0].text).toBe('A1');
  });

  it('xmind round-trips', async () => {
    const blob = treeToXmind(tree, 'Root');
    const back = xmindToTree(await blob.arrayBuffer(), 'Root');
    expect(back.children.map(c => c.text)).toEqual(['Alpha', 'Beta']);
    expect(back.children[0].children[0].text).toBe('A1');
  });

  it('freeplane richcontent NODE text and BACKGROUND_COLOR', () => {
    const xml = `<?xml version="1.0"?><map version="freeplane 1.9.0">
      <node ID="r"><richcontent TYPE="NODE"><html><body><p>Rich root</p></body></html></richcontent>
        <hook NAME="MapStyle"/>
        <node TEXT="Child" BACKGROUND_COLOR="#ff0000"/>
      </node></map>`;
    const t = freemindToTree(xml, '');
    expect(t.text).toBe('Rich root');
    expect(t.children).toHaveLength(1);
    expect(t.children[0].color).toBe('#ff0000');
  });

  it('markdown task lists set checked', () => {
    const t = obsidianMarkdownToTree('# H\n- [x] done\n- [ ] todo\n- plain\n', 'T');
    const items = t.children[0].children;
    expect(items.map(i => [i.text, i.checked])).toEqual([['done', true], ['todo', false], ['plain', null]]);
  });

  it('markdown strips obsidian syntax', () => {
    const t = obsidianMarkdownToTree('- ==hot== [[page|Alias]] #tag ![alt](x.png)\n', 'T');
    expect(t.children[0].text).toBe('hot Alias alt');
  });

  it('markdown keeps sibling list items as siblings, and nests by indent', () => {
    const t = obsidianMarkdownToTree('# H\n- one\n- two\n  - two-a\n- three\n', 'T');
    const h = t.children[0];
    expect(h.children.map(c => c.text)).toEqual(['one', 'two', 'three']);
    expect(h.children[1].children.map(c => c.text)).toEqual(['two-a']);
  });

  it('markdown callout marker is stripped from notes', () => {
    const t = obsidianMarkdownToTree('# H\n> [!note] Heads up\n', 'T');
    expect(t.children[0].notes).toBe('Heads up');
  });
});
