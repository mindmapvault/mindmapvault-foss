import { zipSync, strToU8 } from 'fflate';
import type { MindMapTreeNode } from '../types';

let topicCounter = 0;

interface XMindTopic {
  id: string;
  title: string;
  children?: { attached: XMindTopic[] };
  notes?: { plain: { content: string } };
  href?: string;
  style?: { properties: Record<string, string> };
}

function nodeToXMind(node: MindMapTreeNode): XMindTopic {
  const topic: XMindTopic = {
    id: `topic-${++topicCounter}-${Math.random().toString(36).slice(2, 7)}`,
    title: node.text,
  };

  if (node.notes?.trim()) {
    topic.notes = { plain: { content: node.notes.trim() } };
  }

  if (node.urls?.length) {
    topic.href = node.urls[0].url;
  }

  if (node.color) {
    topic.style = { properties: { 'background-color': node.color } };
  }

  if (node.children.length > 0) {
    topic.children = { attached: node.children.map(nodeToXMind) };
  }

  return topic;
}

/**
 * Exports a MindMapTreeNode tree as a .xmind ZIP archive (XMind Zen / 2020+ JSON format).
 * Returns a Blob ready for download.
 */
export function treeToXmind(root: MindMapTreeNode, title: string): Blob {
  topicCounter = 0;

  const content = JSON.stringify(
    [
      {
        id: 'sheet-1',
        title: title || 'Sheet 1',
        rootTopic: nodeToXMind(root),
      },
    ],
    null,
    2,
  );

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="urn:xmind:xmap:xmlns:manifest:1.0">
  <file-entry full-path="content.json" media-type="application/json"/>
</manifest>`;

  const zipped = zipSync({
    'content.json': [strToU8(content), { level: 6 }],
    'META-INF/manifest.xml': [strToU8(manifest), { level: 0 }],
  });

  return new Blob([zipped], { type: 'application/vnd.xmind.workbook' });
}
