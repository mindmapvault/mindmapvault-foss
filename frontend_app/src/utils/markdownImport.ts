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

/** Measure the indentation depth of a list item line (tab = 2 spaces) */
function listDepth(line: string): number {
  let spaces = 0;
  for (const char of line) {
    if (char === ' ') spaces++;
    else if (char === '\t') spaces += 2;
    else break;
  }
  return Math.floor(spaces / 2);
}

/** Heading level 1-6 → returns [level, text] or null */
function matchHeading(line: string): [number, string] | null {
  const m = line.match(/^(#{1,6})\s+(.*)/);
  if (!m) return null;
  return [m[1].length, m[2].trim()];
}

/** List item line → returns [indentDepth, text] or null */
function matchListItem(line: string): [number, string] | null {
  const m = line.match(/^(\s*)[-*+]\s+(.*)/);
  if (!m) return null;
  return [listDepth(m[1]), m[2].trim()];
}

/** Ordered list item → returns [indentDepth, text] or null */
function matchOrderedListItem(line: string): [number, string] | null {
  const m = line.match(/^(\s*)\d+[.)]\s+(.*)/);
  if (!m) return null;
  return [listDepth(m[1]), m[2].trim()];
}

/** Remove Obsidian-style wiki links: [[target|alias]] → alias or target */
function unwikiLink(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias ?? target);
}

/** Remove common markdown formatting for a cleaner node label */
function cleanText(text: string): string {
  return unwikiLink(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
    .replace(/\*([^*]+)\*/g, '$1')        // italic
    .replace(/~~([^~]+)~~/g, '$1')        // strikethrough
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .replace(/^#+\s*/, '')               // leading hashes
    .trim();
}

/**
 * Converts an Obsidian-compatible markdown string into a MindMapTreeNode tree.
 *
 * Strategy:
 *  - The vault title becomes the root node text.
 *  - H1 headings under the title become top-level children.
 *  - H2+ headings become nested children based on heading level.
 *  - List items (-, *, +, 1.) become leaf nodes under the current heading context.
 *  - Blockquote lines (>) are collected as notes on the previous node.
 *  - Blank lines and horizontal rules are ignored.
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
      // blank or horizontal rule — skip
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
      const [depth, itemText] = listItem;
      // Lists live at a virtual level above the heading levels.
      // Depth 0 → attach to current top of stack (under last heading).
      // Depth N → attach to the (N-1)th depth list parent.
      const baseLevel = stack.length > 0 ? stack[stack.length - 1].level : 0;
      const itemLevel = baseLevel + 7 + depth;
      const parent = getParentForLevel(itemLevel);
      const node = makeNode(cleanText(itemText));
      parent.children.push(node);
      stack.push({ node, level: itemLevel });
      lastNode = node;
      continue;
    }

    // Blockquote → append to lastNode's notes
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      const noteText = bqMatch[1];
      lastNode.notes = lastNode.notes
        ? lastNode.notes + '\n' + noteText
        : noteText;
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
