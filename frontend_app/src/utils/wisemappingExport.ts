import type { MindMapTreeNode } from '../types';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

let topicCounter = 0;

function nodeToXml(
  node: MindMapTreeNode,
  depth: number,
  order: number,
  isRoot: boolean,
): string {
  const indent = '  '.repeat(depth);
  const attrs: string[] = [`id="${++topicCounter}"`, `text="${escapeXml(node.text)}"`];

  if (isRoot) {
    attrs.push('central="true"');
  } else {
    attrs.push(`order="${order}"`);
    if (node.side === 'left' || node.side === 'right') {
      attrs.push(`position="${node.side}"`);
    }
  }

  if (node.color) attrs.push(`bgColor="${escapeXml(node.color)}"`);

  const hasNotes = !!node.notes?.trim();
  const hasLink = node.urls && node.urls.length > 0;
  const hasChildren = node.children.length > 0;

  if (!hasNotes && !hasLink && !hasChildren) {
    return `${indent}<topic ${attrs.join(' ')}/>`;
  }

  const lines: string[] = [`${indent}<topic ${attrs.join(' ')}>`];

  if (hasNotes) {
    lines.push(`${indent}  <note><![CDATA[${node.notes!.trim()}]]></note>`);
  }
  if (hasLink) {
    lines.push(`${indent}  <link url="${escapeXml(node.urls![0].url)}"/>`);
  }
  for (let i = 0; i < node.children.length; i++) {
    lines.push(nodeToXml(node.children[i], depth + 1, i, false));
  }

  lines.push(`${indent}</topic>`);
  return lines.join('\n');
}

/**
 * Converts a MindMapTreeNode tree into a WiseMapping-compatible XML string.
 */
export function treeToWisemapping(root: MindMapTreeNode): string {
  topicCounter = 0;
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<map name="">',
    nodeToXml(root, 1, 0, true),
    '</map>',
  ].join('\n');
}
