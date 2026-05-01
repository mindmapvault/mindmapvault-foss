import type { MindMapTreeNode } from '../types';

function escapeMarkdown(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/([`*_[\]])/g, '\\$1');
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

function nodeToMarkdown(node: MindMapTreeNode, depth: number): string {
  const lines: string[] = [];
  const indent = depth === 0 ? '' : '  '.repeat(depth - 1);
  const bodyIndent = depth === 0 ? '  ' : '  '.repeat(depth + 1);

  // Build inline prefix: checkbox → progress → icons
  let prefix = '';
  if (node.checked !== undefined && node.checked !== null) {
    prefix += node.checked ? '[x] ' : '[ ] ';
  }
  if (node.progress !== undefined && node.progress !== null) {
    prefix += `[${node.progress}%] `;
  }
  if (node.icons && node.icons.length > 0) {
    prefix += node.icons.map((ic) => `:${ic}:`).join(' ') + ' ';
  }

  if (depth === 0) {
    lines.push(`# ${prefix}${escapeMarkdown(node.text)}`);
  } else {
    lines.push(`${indent}- ${prefix}${escapeMarkdown(node.text)}`);
  }

  // Notes
  if (node.notes?.trim()) {
    for (const noteLine of node.notes.trim().split('\n')) {
      lines.push(`${bodyIndent}> ${noteLine}`);
    }
  }

  // Tags
  if (node.tags && node.tags.length > 0) {
    lines.push(`${bodyIndent}Tags: ${node.tags.map((t) => `#${t}`).join(' ')}`);
  }

  // Dates
  if (node.startDate || node.endDate) {
    const parts: string[] = [];
    if (node.startDate) parts.push(`Start: ${fmtDate(node.startDate)}`);
    if (node.endDate) parts.push(`End: ${fmtDate(node.endDate)}`);
    lines.push(`${bodyIndent}📅 ${parts.join(' · ')}`);
  }

  // Attachments (stored as NodeAttachmentRef[] inside the encrypted tree payload)
  if (node.attachments && node.attachments.length > 0) {
    for (const att of node.attachments) {
      const sizeKb = (att.size_bytes / 1024).toFixed(1);
      lines.push(`${bodyIndent}📎 ${att.name} (${sizeKb} KB)`);
    }
  }

  // URL links
  if (node.urls && node.urls.length > 0) {
    for (const u of node.urls) {
      const label = u.label ? `${escapeMarkdown(u.label)} ` : '';
      lines.push(`${bodyIndent}🔗 ${label}<${u.url}>`);
    }
  }

  for (const child of node.children) {
    lines.push(nodeToMarkdown(child, depth + 1));
  }

  return lines.join('\n');
}

export function treeToMarkdown(root: MindMapTreeNode, vaultTitle?: string): string {
  const parts: string[] = [];

  if (vaultTitle && vaultTitle.trim()) {
    parts.push(`# ${escapeMarkdown(vaultTitle.trim())}`);
    parts.push('');
  }

  parts.push(nodeToMarkdown(root, vaultTitle ? 1 : 0));

  return parts.join('\n');
}
