import type { NodeAttachmentRef } from '../types';

const ATTACHMENT_MARKDOWN_RE = /^\[Attachment:\s*(.+?)\]\(attachment:\/\/([^)]+)\)$/;

export function buildAttachmentMarkdownLink(attachment: NodeAttachmentRef): string {
  return `[Attachment: ${attachment.name}](attachment://${attachment.attachment_id})`;
}

export function isAttachmentMarkdownLine(line: string): boolean {
  return ATTACHMENT_MARKDOWN_RE.test(line.trim());
}

export function getVisibleNodeTextLines(text: string): string[] {
  return (text || '')
    .split('\n')
    .filter((line) => !isAttachmentMarkdownLine(line));
}

export function appendAttachmentMarkdownLinks(
  text: string,
  attachments: NodeAttachmentRef[],
): string {
  const existingLines = (text || '').split('\n').filter((line) => line.length > 0);
  const existingIds = new Set(
    existingLines
      .map((line) => line.trim().match(ATTACHMENT_MARKDOWN_RE)?.[2])
      .filter((value): value is string => Boolean(value)),
  );

  const nextLines = [...existingLines];
  for (const attachment of attachments) {
    if (existingIds.has(attachment.attachment_id)) continue;
    nextLines.push(buildAttachmentMarkdownLink(attachment));
  }

  return nextLines.join('\n');
}