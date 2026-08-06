import { unzipSync, strFromU8 } from 'fflate';
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

// XMind Zen / 2020+ JSON format (content.json)
interface XMindJsonTopic {
  id?: string;
  title?: string;
  children?: { attached?: XMindJsonTopic[] };
  notes?: { plain?: { content?: string } };
  href?: string;
  style?: { properties?: { 'background-color'?: string; 'fill-color'?: string; 'svg:fill'?: string } };
}

interface XMindJsonSheet {
  rootTopic: XMindJsonTopic;
}

function parseJsonTopic(topic: XMindJsonTopic): MindMapTreeNode {
  const node = makeNode(topic.title ?? '');

  if (topic.notes?.plain?.content?.trim()) {
    node.notes = topic.notes.plain.content.trim();
  }

  if (topic.href) {
    node.urls = [{ url: topic.href, label: '' }];
  }

  const props = topic.style?.properties ?? {};
  const bgColor = props['background-color'] ?? props['fill-color'] ?? props['svg:fill'];
  if (bgColor) node.color = bgColor;

  node.children = (topic.children?.attached ?? []).map(parseJsonTopic);
  return node;
}

function parseXmlTopic(el: Element): MindMapTreeNode {
  const titleEl = el.querySelector(':scope > title');
  const node = makeNode(titleEl?.textContent?.trim() ?? '');

  const notePlain = el.querySelector(':scope > notes > plain > content');
  if (notePlain?.textContent?.trim()) {
    node.notes = notePlain.textContent.trim();
  }

  const href = el.getAttribute('xlink:href') ?? el.getAttribute('href') ?? null;
  if (href) node.urls = [{ url: href, label: '' }];

  const children = el.querySelectorAll(':scope > children > topics[type="attached"] > topic');
  node.children = Array.from(children).map(parseXmlTopic);
  return node;
}

/**
 * Parses a .xmind file (ZIP archive) into a MindMapTreeNode tree.
 * Supports XMind Zen / 2020+ (content.json) and XMind 8 / legacy (content.xml).
 * Takes a raw ArrayBuffer — call file.arrayBuffer() before passing in.
 */
export function xmindToTree(fileData: ArrayBuffer, title: string): MindMapTreeNode {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(fileData));
  } catch {
    throw new Error('Could not read .xmind file — not a valid ZIP archive');
  }

  // Prefer JSON format (XMind Zen / 2020+)
  const jsonEntry = files['content.json'];
  if (jsonEntry) {
    let sheets: XMindJsonSheet[];
    try {
      sheets = JSON.parse(strFromU8(jsonEntry)) as XMindJsonSheet[];
    } catch {
      throw new Error('Invalid content.json in .xmind file');
    }
    if (!Array.isArray(sheets) || !sheets[0]?.rootTopic) {
      throw new Error('No root topic found in XMind file');
    }
    const root = parseJsonTopic(sheets[0].rootTopic);
    root.id = 'root';
    root.text = title || root.text;
    return root;
  }

  // Fall back to XML format (XMind 8 and earlier)
  const xmlEntry = files['content.xml'];
  if (xmlEntry) {
    const xmlText = strFromU8(xmlEntry);
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('Invalid content.xml in .xmind file');
    }
    const rootEl = doc.querySelector('sheet > topic');
    if (!rootEl) throw new Error('No root topic found in XMind XML file');
    const root = parseXmlTopic(rootEl);
    root.id = 'root';
    root.text = title || root.text;
    return root;
  }

  throw new Error('Unrecognized .xmind file: no content.json or content.xml found');
}
