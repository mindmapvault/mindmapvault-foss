import type { MindMapTreeNode } from '../types';

/**
 * Serializes a tree to the genuine WiseMapping "tango" wire format, per
 * `docs/WISEMAPPING_FORMAT_SPEC.md` (reverse-engineered from the authoritative
 * `XMLSerializerTango` in wisemapping-frontend). Real WiseMapping reads this:
 * numeric topic ids, `central="true"` on the root, `position="x,y"` on
 * non-root topics, `order`, single-line text in the `text` attribute and
 * multi-line text in a `<text>` CDATA child, and notes/links as feature
 * elements with CDATA content.
 */

/** XML-attribute escaping, matching the backend's escapeXmlAttribute. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Strip XML-invalid control characters, matching the serializer's `_rmXmlInv`:
 * keep tab, LF, CR, and everything from U+0020 up; drop the rest.
 */
function rmXmlInv(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd)) {
      out += text.charAt(i);
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      // Surrogate pair (U+10000–U+10FFFF) — keep both halves.
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text.charAt(i) + text.charAt(i + 1);
        i++;
      }
    }
  }
  return out;
}

let topicCounter = 0;
function nextId(): string {
  return String(++topicCounter);
}

/**
 * WiseMapping positions non-central topics by absolute `x,y` coordinates, which
 * our model does not store (it keeps only a left/right side). Synthesise a
 * stable, non-overlapping coordinate from the side and the sibling index so the
 * map opens laid out in real WiseMapping rather than piled at the origin.
 * Right side is +x, left is −x; each sibling steps down in y.
 */
function synthesizePosition(side: 'left' | 'right' | undefined, order: number, depth: number): string {
  const x = (side === 'left' ? -1 : 1) * (150 + depth * 40);
  const y = order * 80 - 40;
  return `${x},${y}`;
}

function nodeToXml(
  node: MindMapTreeNode,
  depth: number,
  order: number,
  isRoot: boolean,
  effectiveSide: 'left' | 'right' | undefined,
): string {
  const indent = '  '.repeat(depth);
  const attrs: string[] = [];

  if (isRoot) {
    attrs.push('central="true"');
  } else {
    attrs.push(`position="${synthesizePosition(effectiveSide, order, depth)}"`);
    attrs.push(`order="${order}"`);
  }

  // Single-line text goes in the `text` attribute; multi-line in a CDATA child.
  const text = rmXmlInv(node.text);
  const multiline = text.includes('\n');
  if (!multiline && text) {
    attrs.push(`text="${escapeXml(text)}"`);
  }

  attrs.push(`id="${nextId()}"`);

  if (node.color) attrs.push(`bgColor="${escapeXml(node.color)}"`);
  if (node.collapsed && !isRoot && node.children.length > 0) attrs.push('shrink="true"');

  const open = `${indent}<topic ${attrs.join(' ')}`;

  const hasNotes = !!node.notes?.trim();
  const hasLink = node.urls && node.urls.length > 0;

  // Build the child elements (multi-line text, notes, links, subtopics).
  const body: string[] = [];
  if (multiline) {
    body.push(`${indent}  <text><![CDATA[${text}]]></text>`);
  }
  if (hasNotes) {
    body.push(`${indent}  <note><![CDATA[${rmXmlInv(node.notes!.trim())}]]></note>`);
  }
  if (hasLink) {
    body.push(`${indent}  <link url="${escapeXml(node.urls![0].url)}" urlType="url"/>`);
  }
  for (let i = 0; i < node.children.length; i++) {
    // A child's effective side is its own if set (root's direct children),
    // otherwise the branch it descends from.
    body.push(nodeToXml(node.children[i], depth + 1, i, false, node.children[i].side ?? effectiveSide));
  }

  // No body → self-close; otherwise open, children, close.
  if (body.length === 0) {
    return `${open}/>`;
  }
  return `${open}>\n${body.join('\n')}\n${indent}</topic>`;
}

/**
 * Converts a MindMapTreeNode tree into a genuine WiseMapping tango `.wxml`
 * string. `title` becomes the map `name`.
 */
export function treeToWisemapping(root: MindMapTreeNode, title?: string): string {
  topicCounter = 0;
  const nameAttr = title && title.trim() ? ` name="${escapeXml(rmXmlInv(title.trim()))}"` : '';
  return [
    `<map${nameAttr} version="tango" layout="mindmap">`,
    nodeToXml(root, 1, 0, true, undefined),
    '</map>',
  ].join('\n');
}
