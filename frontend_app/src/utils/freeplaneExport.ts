import type { MindMapTreeNode } from '../types';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function notesToHtml(notes: string): string {
  const paras = notes
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split('\n');
      return '<p>' + lines.map(escapeXml).join('<br/>') + '</p>';
    });
  return `<html><head/><body>${paras.join('')}</body></html>`;
}

let nodeCounter = 0;

function nextId(): string {
  return `ID_${Date.now()}${++nodeCounter}`;
}

function nodeToXml(node: MindMapTreeNode, depth: number): string {
  const indent = '  '.repeat(depth);
  const attrs: string[] = [];

  attrs.push(`TEXT="${escapeXml(node.text)}"`);
  attrs.push(`ID="${nextId()}"`);
  if (node.color) attrs.push(`COLOR="${escapeXml(node.color)}"`);
  if (node.side === 'left' || node.side === 'right') attrs.push(`POSITION="${node.side}"`);
  if (node.collapsed) attrs.push('FOLDED="true"');
  if (node.urls && node.urls.length > 0) attrs.push(`LINK="${escapeXml(node.urls[0].url)}"`);

  const hasNotes = !!node.notes?.trim();
  const hasChildren = node.children.length > 0;

  if (!hasNotes && !hasChildren) {
    return `${indent}<node ${attrs.join(' ')}/>`;
  }

  const lines: string[] = [];
  lines.push(`${indent}<node ${attrs.join(' ')}>`);

  if (hasNotes) {
    lines.push(`${indent}  <richcontent TYPE="NOTE">`);
    lines.push(`${indent}    ${notesToHtml(node.notes!)}`);
    lines.push(`${indent}  </richcontent>`);
  }

  for (const child of node.children) {
    lines.push(nodeToXml(child, depth + 1));
  }

  lines.push(`${indent}</node>`);
  return lines.join('\n');
}

/**
 * Converts a MindMapTreeNode tree into a FreePlane-compatible .mm XML string.
 */
export function treeToFreeplane(root: MindMapTreeNode): string {
  nodeCounter = 0;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<map version="freeplane 1.9.0">',
    nodeToXml(root, 1),
    '</map>',
  ].join('\n');
}
