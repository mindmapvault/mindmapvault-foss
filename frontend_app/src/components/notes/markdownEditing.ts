import type { EditorView, KeyBinding } from '@codemirror/view';
import type { ChangeSpec } from '@codemirror/state';

/**
 * Markdown-aware editing behaviours — the small conveniences that make writing
 * prose feel native rather than like typing into a plain textarea.
 */

/** `- `, `* `, `+ `, `1. `, `- [ ] `, `> ` at the start of a line. */
const LIST_RE = /^(\s*)(?:([-*+])|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/;
const QUOTE_RE = /^(\s*>\s?)/;

/**
 * Enter continues the current list/quote, and clears the marker when the item
 * is empty (so a second Enter exits the list, as every editor does).
 */
export function continueListOnEnter(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  const text = line.text;

  const list = LIST_RE.exec(text);
  if (list) {
    const [marker, indent, bullet, num, delim, task] = [list[0], list[1], list[2], list[3], list[4], list[5]];
    // Empty item → remove the marker instead of adding another one.
    if (text.trim() === marker.trim()) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input',
      });
      return true;
    }
    const next = bullet
      ? `${indent}${bullet} ${task ? '[ ] ' : ''}`
      : `${indent}${Number(num) + 1}${delim} ${task ? '[ ] ' : ''}`;
    view.dispatch({
      changes: { from: range.head, insert: `\n${next}` },
      selection: { anchor: range.head + 1 + next.length },
      userEvent: 'input',
    });
    return true;
  }

  const quote = QUOTE_RE.exec(text);
  if (quote) {
    if (text.trim() === '>') {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: '' },
        selection: { anchor: line.from },
        userEvent: 'input',
      });
      return true;
    }
    view.dispatch({
      changes: { from: range.head, insert: `\n${quote[1]}` },
      selection: { anchor: range.head + 1 + quote[1].length },
      userEvent: 'input',
    });
    return true;
  }

  return false;
}

/** Indent / outdent the selected lines by two spaces. */
function shiftLines(view: EditorView, outdent: boolean): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      if (outdent) {
        const strip = /^ {1,2}/.exec(line.text);
        if (strip) changes.push({ from: line.from, to: line.from + strip[0].length, insert: '' });
      } else {
        changes.push({ from: line.from, insert: '  ' });
      }
    }
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: outdent ? 'delete.dedent' : 'input.indent' });
  return true;
}

/** Wrap the selection in `marker`, or unwrap it when already wrapped. */
export function toggleWrap(view: EditorView, marker: string, placeholder: string): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.sliceDoc(range.from, range.to);

  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: { anchor: range.from, head: range.from + inner.length },
      userEvent: 'input',
    });
    return true;
  }

  const body = selected || placeholder;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${marker}${body}${marker}` },
    selection: {
      anchor: range.from + marker.length,
      head: range.from + marker.length + body.length,
    },
    userEvent: 'input',
  });
  return true;
}

/** Wrap the selection as a markdown link, caret landing in the URL slot. */
export function insertLink(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const label = state.sliceDoc(range.from, range.to) || 'link text';
  const insert = `[${label}](https://)`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + insert.length - 1 },
    userEvent: 'input',
  });
  return true;
}

export const markdownKeymap: KeyBinding[] = [
  { key: 'Enter', run: continueListOnEnter },
  { key: 'Tab', run: (v) => shiftLines(v, false), shift: (v) => shiftLines(v, true) },
  { key: 'Mod-b', run: (v) => toggleWrap(v, '**', 'bold text') },
  { key: 'Mod-i', run: (v) => toggleWrap(v, '*', 'italic text') },
  { key: 'Mod-k', run: insertLink },
];
