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
      const node = makeNode(cleanText(headingText));
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
      const node = makeNode(cleanText(itemText));
      if (checked !== null) node.checked = checked;
      parent.children.push(node);
      stack.push({ node, level: itemLevel });
      lastNode = node;
      continue;
    }

    // Blockquote → append to lastNode's notes.
    // Obsidian callouts (> [!note] Title) have the callout type stripped.
    const bqMatch = line.match(/^>\s?(.*)/);
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

  return root;
}
