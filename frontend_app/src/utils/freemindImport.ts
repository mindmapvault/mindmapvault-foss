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
    // Numeric character references — FreePlane writes &#160; for a non-breaking
    // space inside rich text, and they must decode or words glue together.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractRichcontentNodeText(children: Element[]): string {
  for (const child of children) {
    if (
      child.tagName.toLowerCase() === 'richcontent' &&
      child.getAttribute('TYPE') === 'NODE'
    ) {
      const bodyEl = child.querySelector('body');
      return stripHtml(bodyEl ? bodyEl.innerHTML : child.innerHTML);
    }
  }
  return '';
}

function parseNode(element: Element): MindMapTreeNode {
  const rawText = element.getAttribute('TEXT') ?? '';
  const children = Array.from(element.children);

  // FreePlane can store node text in three ways:
  //   1. TEXT attribute with plain text  → use directly
  //   2. TEXT attribute holding an HTML document string → strip to plain text
  //   3. TEXT absent/empty + <richcontent TYPE="NODE"> child → extract and strip
  //
  // When TEXT looks like HTML we still check richcontent first (it's more
  // structured); only fall back to stripping the raw TEXT value if no
  // richcontent is present.
  const looksLikeHtml = /^\s*<html[\s>]/i.test(rawText);
  let text: string;

  if (!rawText || looksLikeHtml) {
    const rc = extractRichcontentNodeText(children);
    if (rc) {
      text = rc;
    } else if (looksLikeHtml) {
      text = stripHtml(rawText);
    } else {
      text = rawText;
    }
  } else {
    text = rawText;
  }

  const color = element.getAttribute('COLOR');
  // FreePlane stores the fill/background colour separately.
  const bgColor = element.getAttribute('BACKGROUND_COLOR');
  const folded = element.getAttribute('FOLDED') === 'true';
  const position = element.getAttribute('POSITION');
  const link = element.getAttribute('LINK');

  const node = makeNode(text);
  // Prefer TEXT colour; fall back to background colour so something is
  // preserved if only BACKGROUND_COLOR is set.
  if (color) {
    node.color = color;
  } else if (bgColor) {
    node.color = bgColor;
  }
  node.collapsed = folded;
  if (position === 'left' || position === 'right') {
    node.side = position;
  }
  if (link) {
    node.urls = [{ url: link, label: '' }];
  }

  // Notes from <richcontent TYPE="NOTE">
  for (const child of children) {
    if (child.tagName.toLowerCase() === 'richcontent' && child.getAttribute('TYPE') === 'NOTE') {
      const bodyEl = child.querySelector('body');
      node.notes = stripHtml(bodyEl ? bodyEl.innerHTML : child.innerHTML);
      break;
    }
  }

  // Encrypted nodes (FreeMind/FreePlane password-protected branches) carry
  // their children in an ENCRYPTED_CONTENT blob, not as <node> elements.
  // Decryption is out of scope for this app — it is password-based (PBKDF2/
  // AES-GCM or legacy DES) and the password is not in the file. Rather than
  // silently dropping the hidden subtree, mark the node so the user can see
  // content exists but is locked.
  if (element.getAttribute('ENCRYPTED_CONTENT') != null) {
    const marker = '🔒 Encrypted branch (password-protected in the source app — not imported)';
    node.notes = node.notes ? `${node.notes}\n\n${marker}` : marker;
  }

  // Recurse into child <node> elements only; skip FreePlane-specific
  // elements like <hook>, <attribute>, <edge>, <font>, <cloud>.
  node.children = children
    .filter((c) => c.tagName.toLowerCase() === 'node')
    .map((c) => parseNode(c));

  return node;
}

/**
 * Parses a FreeMind or FreePlane .mm XML string into a MindMapTreeNode tree.
 *
 * FreeMind:  <map version="1.0.1">
 * FreePlane: <map version="freeplane 1.x.x">
 *
 * The vault title replaces the root node's TEXT so the map title stays consistent.
 */
export function freemindToTree(xmlString: string, title: string): MindMapTreeNode {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid .mm file: ' + (parseError.textContent ?? 'XML parse error'));
  }

  const mapEl = doc.querySelector('map');
  if (!mapEl) {
    throw new Error('No <map> element found in file');
  }

  // Detect format for a clearer error message if no root node is found.
  const version = mapEl.getAttribute('version') ?? '';
  const isFreeplane = version.toLowerCase().startsWith('freeplane');

  const rootEl = mapEl.querySelector(':scope > node');
  if (!rootEl) {
    throw new Error(
      `No root node found in ${isFreeplane ? 'FreePlane' : 'FreeMind'} file`,
    );
  }

  const root = parseNode(rootEl);
  root.id = 'root';
  root.text = title || root.text;
  return root;
}
