import type { MindMapTreeNode } from '../types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function makeNode(text: string): MindMapTreeNode {
  return {
    id: uid(),
    text: text.trim() || 'Untitled',
    notes: '',
    collapsed: false,
    color: null,
    icons: [],
    checked: null,
    progress: null,
    startDate: null,
    endDate: null,
    urls: [],
    children: [],
  };
}

function parseTopicEl(el: Element): MindMapTreeNode {
  const text = el.getAttribute('text') ?? 'Untitled';
  const node = makeNode(text);

  const bgColor = el.getAttribute('bgColor');
  if (bgColor) node.color = bgColor;

  const position = el.getAttribute('position');
  if (position === 'left' || position === 'right') node.side = position;

  const noteEl = el.querySelector(':scope > note');
  if (noteEl) node.notes = (noteEl.textContent ?? '').trim();

  const linkEl = el.querySelector(':scope > link');
  if (linkEl) {
    const url = linkEl.getAttribute('url');
    if (url) node.urls = [{ url, label: '' }];
  }

  node.children = Array.from(el.children)
    .filter((c) => c.tagName.toLowerCase() === 'topic')
    .sort((a, b) => {
      const oa = parseInt(a.getAttribute('order') ?? '0', 10);
      const ob = parseInt(b.getAttribute('order') ?? '0', 10);
      return oa - ob;
    })
    .map(parseTopicEl);

  return node;
}

/**
 * Parses a WiseMapping XML string into a MindMapTreeNode tree.
 * WiseMapping format: <map name="..."><topic id="1" text="..." central="true">...</topic></map>
 */
export function wisemappingToTree(xmlString: string, title: string): MindMapTreeNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid WiseMapping file: ' + (parseError.textContent ?? 'XML parse error'));
  }

  const mapEl = doc.querySelector('map');
  if (!mapEl) throw new Error('No <map> element found in WiseMapping file');

  const rootTopicEl =
    mapEl.querySelector(':scope > topic[central="true"]') ??
    mapEl.querySelector(':scope > topic');

  if (!rootTopicEl) throw new Error('No root topic found in WiseMapping file');

  const root = parseTopicEl(rootTopicEl);
  root.id = 'root';
  root.text = title || root.text;
  return root;
}
