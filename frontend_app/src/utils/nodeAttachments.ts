import type { NodeAttachmentRef } from '../types';
import { attachmentIdFromMarkdownLine } from '@mindmapvault/mindmap-core';

// Recognising an attachment line is the layout's business too — it decides how
// many lines of text a node draws — so it lives with the geometry.
export { isAttachmentMarkdownLine, getVisibleNodeTextLines } from '@mindmapvault/mindmap-core';

export function buildAttachmentMarkdownLink(attachment: NodeAttachmentRef): string {
  return `[Attachment: ${attachment.name}](attachment://${attachment.attachment_id})`;
}

export function appendAttachmentMarkdownLinks(
  text: string,
  attachments: NodeAttachmentRef[],
): string {
  const existingLines = (text || '').split('\n').filter((line) => line.length > 0);
  const existingIds = new Set(
    existingLines
      .map((line) => attachmentIdFromMarkdownLine(line))
      .filter((value): value is string => Boolean(value)),
  );

  const nextLines = [...existingLines];
  for (const attachment of attachments) {
    if (existingIds.has(attachment.attachment_id)) continue;
    nextLines.push(buildAttachmentMarkdownLink(attachment));
  }

  return nextLines.join('\n');
}