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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseNode(element: Element): MindMapTreeNode {
  const text = element.getAttribute('TEXT') ?? 'Untitled';
  const color = element.getAttribute('COLOR');
  const folded = element.getAttribute('FOLDED') === 'true';
  const position = element.getAttribute('POSITION');
  const link = element.getAttribute('LINK');

  const node = makeNode(text);
  if (color) node.color = color;
  node.collapsed = folded;
  if (position === 'left' || position === 'right') {
    node.side = position;
  }
  if (link) {
    node.urls = [{ url: link, label: '' }];
  }

  // Notes from <richcontent TYPE="NOTE">
  for (const child of Array.from(element.children)) {
    if (child.tagName.toLowerCase() === 'richcontent' && child.getAttribute('TYPE') === 'NOTE') {
      const bodyEl = child.querySelector('body');
      node.notes = stripHtml(bodyEl ? bodyEl.innerHTML : child.innerHTML);
      break;
    }
  }

  // Recursively parse child <node> elements
  node.children = Array.from(element.children)
    .filter((c) => c.tagName.toLowerCase() === 'node')
    .map((c) => parseNode(c));

  return node;
}

/**
 * Parses a FreeMind .mm XML string into a MindMapTreeNode tree.
 * The vault title replaces the root node's TEXT so the map title stays consistent.
 */
export function freemindToTree(xmlString: string, title: string): MindMapTreeNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid FreeMind file: ' + (parseError.textContent ?? 'XML parse error'));
  }

  const rootEl = doc.querySelector('map > node');
  if (!rootEl) {
    throw new Error('No root node found in FreeMind file');
  }

  const root = parseNode(rootEl);
  root.id = 'root';
  root.text = title || root.text;
  return root;
}
