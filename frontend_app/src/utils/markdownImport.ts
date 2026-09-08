import type { MindMapTreeNode } from '../types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function makeNode(text: string, children: MindMapTreeNode[] = []): MindMapTreeNode {
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
    children,
  };
}

/** Strip YAML / TOML frontmatter delimited by --- or +++ */
function stripFrontmatter(md: string): string {
  const trimmed = md.trimStart();
  const match = trimmed.match(/^(---|[+]{3})\n([\s\S]*?)\n\1\s*\n?/);
  if (match) {
    return trimmed.slice(match[0].length);
  }
  return trimmed;
}

/** Measure the indentation depth of a list item line (tab = 4 spaces, div by 2) */
function listDepth(line: string): number {
  let spaces = 0;
  for (const char of line) {
    if (char === ' ') spaces++;
    else if (char === '\t') spaces += 4;
    else break;
  }
  return Math.floor(spaces / 2);
}

/** Markdown supports h1–h6; list items occupy virtual levels above this. */
const HEADING_MAX_LEVEL = 6;

/**
 * The inline prefix the exporter writes before a node's text:
 *   [x] [75%] :Target: :Sparkles: Formatted
 * Returns the recovered fields plus the remaining clean text. Every group is
 * optional and order-independent, so a hand-written or Obsidian line with no
 * prefix passes through unchanged.
 */
function parseInlinePrefix(raw: string): {
  text: string;
  checked: boolean | null;
  progress: number | null;
  icons: string[];
} {
  let text = raw;
  let checked: boolean | null = null;
  let progress: number | null = null;
  const icons: string[] = [];

  const cb = text.match(/^\[([xX ])\]\s+/);
  if (cb) {
    checked = cb[1].toLowerCase() === 'x';
    text = text.slice(cb[0].length);
  }
  const prog = text.match(/^\[(\d{1,3})%\]\s+/);
  if (prog) {
    progress = Math.min(100, parseInt(prog[1], 10));
    text = text.slice(prog[0].length);
  }
  // Leading run of :icon: tokens.
  let ic;
  while ((ic = text.match(/^:([A-Za-z0-9]+):\s+/))) {
    icons.push(ic[1]);
    text = text.slice(ic[0].length);
  }
  return { text, checked, progress, icons };
}

/**
 * A metadata line the exporter indents under a node. Returns the field to set
 * on the current node, or null if the line is not one of ours — in which case
 * the caller falls back to the generic Obsidian handling.
 */
type Metadata =
  | { kind: 'tags'; tags: string[] }
  | { kind: 'dates'; startDate: string | null; endDate: string | null }
  | { kind: 'attachment'; name: string; sizeKb: number }
  | { kind: 'url'; label: string; url: string };

function matchMetadata(trimmed: string): Metadata | null {
  let m = trimmed.match(/^Tags:\s+(.*)$/);
  if (m) {
    const tags = m[1].split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean);
    return { kind: 'tags', tags };
  }
  m = trimmed.match(/^📅\s+(.*)$/);
  if (m) {
    const parts = m[1].split(/\s+·\s+/);
    let startDate: string | null = null;
    let endDate: string | null = null;
    for (const p of parts) {
      const s = p.match(/^Start:\s+(.*)$/);
      const e = p.match(/^End:\s+(.*)$/);
      if (s) startDate = s[1].trim();
      if (e) endDate = e[1].trim();
    }
    return { kind: 'dates', startDate, endDate };
  }
  m = trimmed.match(/^📎\s+(.*)\s+\(([\d.]+)\s*KB\)$/);
  if (m) return { kind: 'attachment', name: m[1], sizeKb: parseFloat(m[2]) };
  m = trimmed.match(/^🔗\s*(.*?)\s*<([^>]+)>$/);
  if (m) return { kind: 'url', label: m[1], url: m[2] };
  return null;
}

/** Convert an exporter-written localised date back to ISO, best effort. */
function toIsoDate(localised: string): string {
  const d = new Date(localised);
  return Number.isNaN(d.getTime()) ? localised : d.toISOString().slice(0, 16);
}

/** Heading level 1-6 → returns [level, text] or null */
function matchHeading(line: string): [number, string] | null {
  const m = line.match(/^(#{1,6})\s+(.*)/);
  if (!m) return null;
  return [m[1].length, m[2].trim()];
}

/**
 * List item line → returns [indentDepth, text, checked] or null.
 * Detects GitHub-flavoured / Obsidian task-list syntax: - [ ] and - [x].
 */
function matchListItem(line: string): [number, string, boolean | null] | null {
  const m = line.match(/^(\s*)[-*+]\s+(.*)/);
  if (!m) return null;
  const rawText = m[2];
  const cbMatch = rawText.match(/^\[([xX ])\]\s+(.*)/);
  if (cbMatch) {
    return [listDepth(m[1]), cbMatch[2].trim(), cbMatch[1].toLowerCase() === 'x'];
  }
  return [listDepth(m[1]), rawText.trim(), null];
}

/** Ordered list item → returns [indentDepth, text, checked] or null */
function matchOrderedListItem(line: string): [number, string, boolean | null] | null {
  const m = line.match(/^(\s*)\d+[.)]\s+(.*)/);
  if (!m) return null;
  const rawText = m[2];
  const cbMatch = rawText.match(/^\[([xX ])\]\s+(.*)/);
  if (cbMatch) {
    return [listDepth(m[1]), cbMatch[2].trim(), cbMatch[1].toLowerCase() === 'x'];
  }
  return [listDepth(m[1]), rawText.trim(), null];
}

/** Remove Obsidian-style wiki links: [[target|alias]] → alias or target */
function unwikiLink(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);
}

/**
 * Clean a line of text for use as a mind map node label.
 * Handles standard markdown plus Obsidian-specific syntax:
 *   - Wiki links [[page|alias]]
 *   - Images ![alt](url) → alt text
 *   - Highlights ==text==
 *   - Obsidian tags #tag (stripped)
 *   - HTML comments <!-- ... --> (stripped)
 *   - Bold, italic, strikethrough, inline code, bare links
 */
function cleanText(text: string): string {
  return unwikiLink(text)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')       // images → alt text
    .replace(/\*\*([^*]+)\*\*/g, '$1')               // bold
    .replace(/\*([^*]+)\*/g, '$1')                   // italic
    .replace(/~~([^~]+)~~/g, '$1')                   // strikethrough
    .replace(/==([^=]+)==/g, '$1')                   // Obsidian highlight
    .replace(/`([^`]+)`/g, '$1')                     // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')         // [text](url)
    .replace(/(^|\s)#[a-zA-Z]\w*/g, '$1')            // Obsidian tags
    .replace(/<!--[\s\S]*?-->/g, '')                 // HTML comments
    .replace(/^#+\s*/, '')                           // leading hashes
    .replace(/ {2,}/g, ' ')                          // collapse gaps left by stripped syntax
    .trim();
}

/**
 * Converts an Obsidian-compatible markdown string into a MindMapTreeNode tree.
 *
 * Compatible with the most popular Obsidian mind mapping plugins:
 *  - Obsidian Mind Map (Markmap-based, by lynchjames)
 *  - Markmap for Obsidian
 *  - Mindmap NextGen
 *
 * Strategy:
 *  - The vault title becomes the root node text.
 *  - H1 headings become top-level children; H2+ nest by heading level.
 *  - List items (-, *, +, 1.) become leaf nodes under the current heading context.
 *  - Task-list items (- [ ] / - [x]) set the node's checked field.
 *  - Nested lists use 2-space or 4-space (tab) indentation; both are supported.
 *  - Blockquote lines (>) are collected as notes on the previous node.
 *  - Obsidian callouts (> [!type] Title) have the [!type] marker stripped.
 *  - HTML comment lines (<!-- markmap: {...} --> etc.) are skipped.
 *  - Blank lines, horizontal rules, and YAML/TOML frontmatter are ignored.
 */
export function obsidianMarkdownToTree(md: string, title: string): MindMapTreeNode {
  const cleaned = stripFrontmatter(md);
  const lines = cleaned.split('\n');

  const root = makeNode(title);

  // Stack tracks [node, headingLevel]. Level 0 = root (pseudo level 0).
  // Headings occupy levels 1-6. List items occupy a virtual level 7+.
  type StackEntry = { node: MindMapTreeNode; level: number };
  const stack: StackEntry[] = [{ node: root, level: 0 }];

  let lastNode: MindMapTreeNode = root;

  const getParentForLevel = (level: number): MindMapTreeNode => {
    // Pop entries from the stack until the top entry has a level < the new level
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    return stack[stack.length - 1].node;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim() || /^(---|[*_]{3,}|\+{3,})$/.test(line.trim())) {
      continue;
    }

    // Skip HTML comment lines (markmap config directives, etc.)
    if (/^\s*<!--/.test(line)) {
      continue;
    }

    const heading = matchHeading(line);
    if (heading) {
      const [level, headingText] = heading;
      const parent = getParentForLevel(level);
      const meta = parseInlinePrefix(headingText);
      const node = makeNode(cleanText(meta.text));
      if (meta.checked !== null) node.checked = meta.checked;
      if (meta.progress !== null) node.progress = meta.progress;
      if (meta.icons.length > 0) node.icons = meta.icons;
      parent.children.push(node);
      stack.push({ node, level });
      lastNode = node;
      continue;
    }

    const listItem = matchListItem(line) ?? matchOrderedListItem(line);
    if (listItem) {
      const [depth, itemText, checked] = listItem;
      // Lists live at virtual levels above the heading levels (7+). The base is
      // the enclosing *heading* level, not the top of the stack — reading the
      // top would make each sibling item a child of the previous one, turning a
      // flat list into a descending chain.
      const headingBase = stack.reduce((acc, e) => (e.level <= HEADING_MAX_LEVEL ? e.level : acc), 0);
      const itemLevel = headingBase + HEADING_MAX_LEVEL + 1 + depth;
      const parent = getParentForLevel(itemLevel);
      const meta = parseInlinePrefix(itemText);
      const node = makeNode(cleanText(meta.text));
      // The task-list checkbox wins over a prefix checkbox; both are never set.
      node.checked = checked !== null ? checked : meta.checked;
      if (meta.progress !== null) node.progress = meta.progress;
      if (meta.icons.length > 0) node.icons = meta.icons;
      parent.children.push(node);
      stack.push({ node, level: itemLevel });
      lastNode = node;
      continue;
    }

    // Indented metadata the exporter wrote under the current node. These lines
    // are deeper than their owner's list marker, so they are not list items;
    // route them onto lastNode instead of letting them become child nodes.
    const metadata = matchMetadata(line.trim());
    if (metadata) {
      if (metadata.kind === 'tags') {
        lastNode.tags = [...(lastNode.tags ?? []), ...metadata.tags];
      } else if (metadata.kind === 'dates') {
        if (metadata.startDate) lastNode.startDate = toIsoDate(metadata.startDate);
        if (metadata.endDate) lastNode.endDate = toIsoDate(metadata.endDate);
      } else if (metadata.kind === 'url') {
        lastNode.urls = [...(lastNode.urls ?? []), { label: metadata.label, url: metadata.url }];
      } else if (metadata.kind === 'attachment') {
        lastNode.attachments = [...(lastNode.attachments ?? []), {
          attachment_id: '',
          name: metadata.name,
          content_type: 'application/octet-stream',
          size_bytes: Math.round(metadata.sizeKb * 1024),
          uploaded_at: '',
        }];
      }
      continue;
    }

    // Blockquote → append to lastNode's notes.
    // Obsidian callouts (> [!note] Title) have the callout type stripped.
    const bqMatch = line.trim().match(/^>\s?(.*)/);
    if (bqMatch) {
      const noteText = bqMatch[1].replace(/^\[![^\]]+\]\s*/, '');
      if (noteText.trim()) {
        lastNode.notes = lastNode.notes
          ? lastNode.notes + '\n' + noteText
          : noteText;
      }
      continue;
    }

    // Plain paragraph → treat as a child node of the current context
    const parent = stack[stack.length - 1].node;
    const node = makeNode(cleanText(line));
    parent.children.push(node);
    lastNode = node;
  }

  // If nothing was parsed, give the root a placeholder child
  if (root.children.length === 0) {
    root.children.push(makeNode('Imported content'));
  }

  // Round-trip unwrap. The exporter writes either `# Root` (no title) or
  // `# Title` + the root as a single `- Root` list item. Both leave the real
  // root buried under one or two single-child wrapper levels made from the
  // file-name title. Collapse a chain of single-child wrappers whose text
  // matches the title, then promote a final single child that carries real
  // node content. A generic Obsidian doc — several top-level headings, or a
  // single heading that is just a heading — is left untouched.
  let current = root;
  for (;;) {
    if (current.children.length !== 1) break;
    const only = current.children[0];
    const matchesTitle = only.text === current.text;
    // A node with children of its own or node-level fields is real content,
    // not a wrapper — but only promote past it if it is the title echo.
    if (!matchesTitle) break;
    only.id = current.id;
    current = only;
  }
  // After collapsing title echoes, a single remaining child is the real root
  // content (the exporter wrote the root node as one top-level item). Promote
  // it so its children become the root's children.
  if (current !== root && current.children.length === 1) {
    current = current.children[0];
  }
  // Whatever node we landed on becomes the root; it takes the file-name title.
  current.id = root.id;
  current.text = root.text;
  return current;
}
