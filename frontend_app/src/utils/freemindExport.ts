import type { MindMapTreeNode } from '../types';

/**
 * FreeMind's `XMLElement.writeEncoded`: named entities for the five XML
 * specials, `&#xHH;` (lowercase hex) for anything below 32 or above 126.
 */
function escapeXml(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    switch (ch) {
      case '<': out += '&lt;'; break;
      case '>': out += '&gt;'; break;
      case '&': out += '&amp;'; break;
      case '"': out += '&quot;'; break;
      case "'": out += '&apos;'; break;
      default:
        out += code < 32 || code > 126 ? `&#x${code.toString(16)};` : ch;
    }
  }
  return out;
}

/**
 * Notes become a `<richcontent TYPE="NOTE">` body. FreeMind pre-encodes the
 * HTML and writes it verbatim (`dontEncodeContents`), so the markup is not
 * double-escaped; only the text runs inside it are escaped.
 */
function notesToHtml(notes: string): string {
  const paras = notes
    .trim()
    .split(/\n\n+/)
    .map((block) => '<p>' + block.split('\n').map(escapeXml).join('<br/>') + '</p>');
  return `<html><head/><body>${paras.join('')}</body></html>`;
}

/**
 * Builds the attribute string for a node, sorted alphabetically by name to
 * match FreeMind's `TreeMap` ordering. `parentIsRoot` gates `POSITION`, which
 * FreeMind writes only for the root's direct children.
 */
function nodeAttributes(node: MindMapTreeNode, parentIsRoot: boolean): string {
  const attrs: Record<string, string> = {};

  // TEXT holds the plain text; NUL becomes a space, as FreeMind does.
  attrs.TEXT = node.text.replace(/\0/g, ' ');
  if (node.color) attrs.COLOR = node.color;
  if (node.collapsed) attrs.FOLDED = 'true';
  if (parentIsRoot && (node.side === 'left' || node.side === 'right')) {
    attrs.POSITION = node.side;
  }
  if (node.urls && node.urls.length > 0) attrs.LINK = node.urls[0].url;

  return Object.keys(attrs)
    .sort()
    .map((name) => `${name}="${escapeXml(attrs[name])}"`)
    .join(' ');
}

function nodeToXml(node: MindMapTreeNode, parentIsRoot: boolean): string {
  const open = `<node ${nodeAttributes(node, parentIsRoot)}`;

  const hasNotes = !!node.notes?.trim();
  const hasChildren = node.children.length > 0;

  if (!hasNotes && !hasChildren) {
    return `${open}/>\n`;
  }

  let out = `${open}>\n`;
  if (hasNotes) {
    out += `<richcontent TYPE="NOTE">${notesToHtml(node.notes!)}</richcontent>\n`;
  }
  // Children of the root get POSITION; deeper nodes do not.
  for (const child of node.children) {
    out += nodeToXml(child, false);
  }
  out += `</node>\n`;
  return out;
}

/**
 * Converts a MindMapTreeNode tree into a byte-compatible FreeMind `.mm` file.
 */
export function treeToFreemind(root: MindMapTreeNode): string {
  let out = '<map version="1.1.0">\n';
  out += '<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->\n';
  // The root's parent is not the root, so the root itself carries no POSITION;
  // its children do.
  out += serializeRoot(root);
  out += '</map>\n';
  return out;
}

/** Serializes the root node, marking its children as root children. */
function serializeRoot(root: MindMapTreeNode): string {
  const open = `<node ${nodeAttributes(root, false)}`;
  const hasNotes = !!root.notes?.trim();
  const hasChildren = root.children.length > 0;

  if (!hasNotes && !hasChildren) {
    return `${open}/>\n`;
  }

  let out = `${open}>\n`;
  if (hasNotes) {
    out += `<richcontent TYPE="NOTE">${notesToHtml(root.notes!)}</richcontent>\n`;
  }
  for (const child of root.children) {
    out += nodeToXml(child, true);
  }
  out += `</node>\n`;
  return out;
}
