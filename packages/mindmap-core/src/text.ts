/**
 * A node's text can carry attachment links written as markdown. They are part
 * of the text — they round-trip, they export — but they are not drawn on the
 * node, so neither the measurement nor the renderer should count them as lines.
 */

const ATTACHMENT_MARKDOWN_RE = /^\[Attachment:\s*(.+?)\]\(attachment:\/\/([^)]+)\)$/;

export function isAttachmentMarkdownLine(line: string): boolean {
  return ATTACHMENT_MARKDOWN_RE.test(line.trim());
}

/** The lines of a node's text that are actually drawn on it. */
export function getVisibleNodeTextLines(text: string): string[] {
  return (text || '')
    .split('\n')
    .filter((line) => !isAttachmentMarkdownLine(line));
}

/** The attachment id a markdown line points at, or undefined. */
export function attachmentIdFromMarkdownLine(line: string): string | undefined {
  return line.trim().match(ATTACHMENT_MARKDOWN_RE)?.[2];
}
