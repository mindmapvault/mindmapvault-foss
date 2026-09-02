/**
 * Single source of truth for the editor's keyboard shortcuts.
 *
 * Two closed layouts, `freemind` and `mac` — see docs/UI_REWORK_PLAN.md
 * §2.3. Every binding list is exhaustive for its layout: nothing falls
 * back to the other layout's keys, so a layout's own generated labels
 * (shortcuts panel, tooltips, context menu, status bar) are always correct
 * for what will actually fire.
 *
 * `Mod` resolves to the current OS (⌘ on macOS, Ctrl elsewhere) regardless
 * of which *layout* is selected — a Mac user running the `freemind` layout
 * still gets a working ⌘Z/⌘F/⌘S, not a dead Ctrl-only binding.
 */
import { isMac } from '../platform/isMac';
import type { KeyboardLayoutName } from '../store/ui';

export interface ShortcutDef {
  id: string;
  label: string;
  group: 'Nodes' | 'Format' | 'View' | 'Edit' | 'Find' | 'File';
  freemind: string[];
  mac: string[];
}

/**
 * A binding token is `Mod+Shift+Alt+<key>` (modifiers optional, any order
 * omitted at the matcher, but always written `Mod, Shift, Alt` here for
 * consistent display). `<key>` is one of:
 *  - a single letter, matched case-insensitively against `event.key`
 *  - a DOM `code` identifier (`KeyK`), matched against `event.code` — used
 *    only for Alt+K, where macOS Option+K produces the character "˚" and
 *    comparing `event.key` would silently break on a Mac
 *  - a named key (`Tab`, `Enter`, `Delete`, `Backspace`, `Insert`, `Home`,
 *    `Space`, `F1`..`F10`, `+`, `-`, `/`), matched against `event.key`
 */
export const SHORTCUTS: ShortcutDef[] = [
  // ── Nodes ──────────────────────────────────────────────────────────────
  { id: 'node.addChild', label: 'Add child', group: 'Nodes', freemind: ['Tab', 'Insert'], mac: ['Tab'] },
  { id: 'node.addLeftChild', label: 'Add left child (root)', group: 'Nodes', freemind: ['Shift+Tab'], mac: ['Shift+Tab'] },
  { id: 'node.addSibling', label: 'Add sibling', group: 'Nodes', freemind: ['Enter'], mac: ['Enter'] },
  { id: 'node.delete', label: 'Delete node', group: 'Nodes', freemind: ['Delete', 'Backspace'], mac: ['Delete', 'Backspace'] },
  { id: 'node.rename', label: 'Rename', group: 'Nodes', freemind: ['F2'], mac: ['Mod+Enter'] },
  { id: 'node.notesToggle', label: 'Notes', group: 'Nodes', freemind: ['F3'], mac: ['Mod+Shift+KeyK'] },
  { id: 'node.notesOpen', label: 'Edit notes', group: 'Nodes', freemind: ['Mod+E'], mac: ['Mod+E'] },
  { id: 'node.addImage', label: 'Add image', group: 'Nodes', freemind: ['Alt+KeyK'], mac: ['Alt+KeyK'] },
  { id: 'node.attachFile', label: 'Attach encrypted file', group: 'Nodes', freemind: ['F6'], mac: ['Mod+O'] },
  { id: 'node.fold', label: 'Fold / Unfold', group: 'Nodes', freemind: ['Space'], mac: ['Space'] },
  { id: 'node.resetPosition', label: 'Reset position', group: 'Nodes', freemind: ['R'], mac: ['R'] },
  { id: 'node.resetAllPositions', label: 'Reset all positions', group: 'Nodes', freemind: ['Mod+Shift+R'], mac: ['Mod+Shift+R'] },
  { id: 'node.autoAlign', label: 'Auto-align subtree', group: 'Nodes', freemind: ['A'], mac: ['A'] },

  // ── Format ─────────────────────────────────────────────────────────────
  { id: 'node.colour', label: 'Colour picker', group: 'Format', freemind: ['F4'], mac: ['B'] },
  { id: 'node.icons', label: 'Icons', group: 'Format', freemind: ['I'], mac: ['I'] },
  { id: 'node.checkbox', label: 'Checkbox', group: 'Format', freemind: ['C'], mac: ['C'] },
  { id: 'node.progress', label: 'Progress', group: 'Format', freemind: ['P'], mac: ['P'] },
  { id: 'node.dates', label: 'Dates', group: 'Format', freemind: ['D'], mac: ['D'] },
  { id: 'node.url', label: 'URL', group: 'Format', freemind: ['U'], mac: ['U'] },
  { id: 'node.labels', label: 'Labels', group: 'Format', freemind: ['T'], mac: ['T'] },

  // ── View ───────────────────────────────────────────────────────────────
  { id: 'view.root', label: 'Go to root', group: 'View', freemind: ['Home'], mac: ['H'] },
  { id: 'view.focusMode', label: 'Focus mode', group: 'View', freemind: ['F5', 'F'], mac: ['Mod+Shift+F'] },
  { id: 'view.zoomIn', label: 'Zoom in', group: 'View', freemind: ['+'], mac: ['+'] },
  { id: 'view.zoomOut', label: 'Zoom out', group: 'View', freemind: ['-'], mac: ['-'] },
  { id: 'view.colourTray', label: 'Toggle colour tray', group: 'View', freemind: ['Mod+Shift+1'], mac: ['Mod+Shift+1'] },
  { id: 'view.iconTray', label: 'Toggle icon tray', group: 'View', freemind: ['Mod+Shift+2'], mac: ['Mod+Shift+2'] },

  // ── Edit ───────────────────────────────────────────────────────────────
  { id: 'edit.undo', label: 'Undo', group: 'Edit', freemind: ['F9', 'Mod+Z'], mac: ['Mod+Z'] },
  { id: 'edit.redo', label: 'Redo', group: 'Edit', freemind: ['F10', 'Mod+Y', 'Mod+Shift+Z'], mac: ['Mod+Shift+Z'] },

  // ── Find ───────────────────────────────────────────────────────────────
  { id: 'find.search', label: 'Search', group: 'Find', freemind: ['Mod+F'], mac: ['Mod+F'] },
  { id: 'find.shortcuts', label: 'Shortcuts', group: 'Find', freemind: ['F1'], mac: ['Mod+/'] },

  // ── File ───────────────────────────────────────────────────────────────
  { id: 'file.save', label: 'Save', group: 'File', freemind: ['Mod+S'], mac: ['Mod+S'] },
];

const BY_ID: Record<string, ShortcutDef> = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcut(id: string): ShortcutDef | undefined {
  return BY_ID[id];
}

export function bindingsFor(id: string, layout: KeyboardLayoutName): string[] {
  const def = BY_ID[id];
  if (!def) return [];
  return layout === 'mac' ? def.mac : def.freemind;
}

// ── Matching ─────────────────────────────────────────────────────────────

function matchKeyToken(e: KeyboardEvent, token: string): boolean {
  if (/^Key[A-Z]$/.test(token)) return e.code === token;
  if (token === 'Space') return e.key === ' ';
  if (/^[A-Za-z]$/.test(token)) return e.key.toLowerCase() === token.toLowerCase();
  return e.key === token;
}

/** Does `e` fire this exact binding? Modifier state must match exactly. */
export function matchBinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.split('+');
  const keyToken = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const isBareLetter = /^[A-Za-z]$/.test(keyToken);

  const wantMod = mods.has('Mod');
  const modHeld = e.ctrlKey || e.metaKey;
  if (wantMod) {
    if (isMac ? !e.metaKey : !e.ctrlKey) return false;
  } else if (modHeld) {
    return false;
  }

  if (e.altKey !== mods.has('Alt')) return false;

  // A bare letter with no explicit Shift requirement ignores Shift entirely
  // — holding it only changes the letter's case, already normalized below.
  const wantShift = mods.has('Shift');
  if (!(isBareLetter && !wantShift) && e.shiftKey !== wantShift) return false;

  return matchKeyToken(e, keyToken);
}

/** First shortcut id (in `entries`, or the full registry) whose active-layout binding fires on `e`. */
export function matchShortcut(
  e: KeyboardEvent,
  layout: KeyboardLayoutName,
  entries: ShortcutDef[] = SHORTCUTS,
): string | null {
  for (const def of entries) {
    const bindings = layout === 'mac' ? def.mac : def.freemind;
    if (bindings.some((b) => matchBinding(e, b))) return def.id;
  }
  return null;
}

// ── Display ──────────────────────────────────────────────────────────────

function formatKeyToken(token: string): string {
  if (/^Key[A-Z]$/.test(token)) return token.slice(3);
  if (token === 'Space') return 'Space';
  return token;
}

/** Renders one binding for display: `⌘⇧Z` on macOS, `Ctrl+Shift+Z` elsewhere. */
export function formatBinding(binding: string): string {
  const parts = binding.split('+');
  const keyToken = formatKeyToken(parts[parts.length - 1]);
  const modSymbols = parts.slice(0, -1).map((m) => {
    if (m === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (m === 'Shift') return isMac ? '⇧' : 'Shift';
    if (m === 'Alt') return isMac ? '⌥' : 'Alt';
    return m;
  });
  return isMac ? [...modSymbols, keyToken].join('') : [...modSymbols, keyToken].join('+');
}

/** All bindings for one shortcut, formatted and joined (`⌘Z` or `F9 / Ctrl+Z`). */
export function formatShortcut(id: string, layout: KeyboardLayoutName, sep = ' / '): string {
  return bindingsFor(id, layout).map(formatBinding).join(sep);
}
