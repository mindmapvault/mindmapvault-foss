/**
 * Single source of truth for the in-app changelog / "What's New".
 *
 * Changelog hygiene (keep these in sync on every release):
 *   1. Bump `version` in package.json.
 *   2. Set `APP_VERSION` below to the same value.
 *   3. Prepend a new entry to CHANGELOG with that version + today's date.
 *   4. Use the categories: 'feature' | 'improvement' | 'fix'. Keep lines short
 *      and user-facing (what changed for the user, not the implementation).
 *
 * The newest version must be the first array element, and `APP_VERSION` must
 * equal `CHANGELOG[0].version`.
 */

export const APP_VERSION = '0.3.35';

/**
 * localStorage key recording the last version whose "What's New" the user saw.
 * The popup tracks APP_VERSION, so the version is never hardcoded twice.
 */
export const WHATS_NEW_SEEN_KEY = 'mindmapvault-whats-new-seen';

export type ChangeKind = 'feature' | 'improvement' | 'fix';

export interface ChangeItem {
  kind: ChangeKind;
  title: string;
  desc?: string;
}

export interface ChangelogEntry {
  version: string;
  date: string; // ISO yyyy-mm-dd
  highlights?: string;
  items: ChangeItem[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.3.35',
    date: '2026-09-02',
    highlights: 'Keyboard shortcuts, three density modes, and a reworked toolbar.',
    items: [
      {
        kind: 'feature',
        title: 'Two keyboard-shortcut layouts',
        desc: 'FreeMind or Mac, whichever suits you — pick one in Settings → Interface, or leave it on your platform default. Press F1 for the full list.',
      },
      {
        kind: 'feature',
        title: 'Three density modes',
        desc: 'Lean, Standard and Large. Lean keeps only the essentials on the toolbar; Large adds a full ribbon with Home, Insert, View and Export tabs.',
      },
      {
        kind: 'feature',
        title: 'Colour and icon trays',
        desc: 'Dock a colour or icon strip to any edge of the canvas. Right-click a swatch to pin it as a favourite. Both trays now search the full set.',
      },
      {
        kind: 'feature',
        title: 'A real app menu',
        desc: 'File, Edit, View, Node and Help menus — which also means copy and paste finally work on macOS.',
      },
      {
        kind: 'feature',
        title: 'Image button on the toolbar',
        desc: 'Adding a picture to a node no longer needs the context menu or a shortcut.',
      },
      {
        kind: 'fix',
        title: 'Selected coloured nodes show their border again',
        desc: 'A node with its own colour drew its selection border in that same colour, so selecting it looked like nothing happened.',
      },
      {
        kind: 'fix',
        title: 'Node colour stays on its own line',
        desc: 'Colouring a node used to repaint every line below it. It now paints only the line coming into that node.',
      },
      {
        kind: 'fix',
        title: 'Menus stay inside the window',
        desc: 'The export dropdown and the node context menu no longer run off the edge of the screen.',
      },
      {
        kind: 'improvement',
        title: 'Settings opens on Account',
        desc: 'And the Interface tab now uses switches instead of checkboxes.',
      },
    ],
  },
  {
    version: '0.3.34',
    date: '2026-09-01',
    highlights: 'Pictures on nodes, voice notes, and a working password change.',
    items: [
      {
        kind: 'feature',
        title: 'Pictures on nodes',
        desc: 'Drop an image onto a node, paste one from the clipboard, or press Alt+K. Shows directly on the node and survives PDF/PNG export.',
      },
      {
        kind: 'feature',
        title: 'Voice notes',
        desc: 'Record a voice memo straight into a node from the mobile-width layout.',
      },
      {
        kind: 'fix',
        title: 'Change password is back',
        desc: 'It was disabled by a safety flag that never applied to this local-only build.',
      },
      {
        kind: 'improvement',
        title: 'Rebuilt icon picker',
        desc: 'Search now covers every curated icon instead of a truncated subset, and loads far less code.',
      },
      {
        kind: 'improvement',
        title: 'Settings reorganised',
        desc: 'Local storage folder moved into Settings, storage stats moved next to the vault list, and a new Help tab links to support.',
      },
      {
        kind: 'improvement',
        title: 'Password fields have a show/hide toggle',
      },
      {
        kind: 'fix',
        title: 'DevTools access closed in built apps',
        desc: 'It exposed decrypted vault data in the console. Still available in development builds.',
      },
    ],
  },
  {
    version: '0.3.33',
    date: '2026-08-08',
    highlights: 'Packaging fix — downloadable apps are attached to releases again.',
    items: [
      {
        kind: 'fix',
        title: 'Release downloads were missing',
        desc: 'Recent releases shipped without the macOS, Windows and Linux downloads. The build that produces them now runs correctly when a release is published.',
      },
    ],
  },
  {
    version: '0.3.32',
    date: '2026-08-08',
    highlights: 'Notes are now written on one screen, with Markdown rendering as you type.',
    items: [
      {
        kind: 'feature',
        title: 'Live preview note editor',
        desc: 'Formatting appears as you write it. The Markdown symbols show up only on the line you are editing, so notes stay readable while you work.',
      },
      {
        kind: 'feature',
        title: 'Clickable checkboxes in notes',
        desc: 'Tick a task straight in the note — the text updates itself.',
      },
      {
        kind: 'improvement',
        title: 'Notes save themselves',
        desc: 'No more Save button. Notes save shortly after you stop typing and again when you close, so closing or pressing Escape can no longer lose work.',
      },
      {
        kind: 'improvement',
        title: 'One writing surface instead of two panes',
        desc: 'The editor fills the window. Labels and files moved into a Details section at the bottom, and a Write / Read switch replaces the old side-by-side preview.',
      },
      {
        kind: 'improvement',
        title: 'Keyboard shortcuts while writing',
        desc: 'Ctrl/Cmd+B, +I and +K for bold, italic and links. Enter continues lists, numbered lists, checklists and quotes; Tab indents.',
      },
      {
        kind: 'improvement',
        title: 'Images show inline in notes',
        desc: 'Pictures attached to a node now appear in the note itself rather than as link text.',
      },
    ],
  },
  {
    version: '0.3.31',
    date: '2026-08-06',
    highlights: 'Three new mind map formats, a searchable vault list, and a unified settings hub.',
    items: [
      {
        kind: 'feature',
        title: 'FreePlane, WiseMapping and XMind support',
        desc: 'Import and export .mm (FreePlane), .wxml (WiseMapping) and .xmind files. Everything is parsed on your device and encrypted before it is written.',
      },
      {
        kind: 'feature',
        title: 'Search and table view in the vault list',
        desc: 'Filter vaults by name, note or label, and switch between the visual grid and a compact table. Your choice is remembered.',
      },
      {
        kind: 'feature',
        title: 'Settings hub',
        desc: 'Account, appearance and this changelog now live in one modal, opened from the gear icon.',
      },
      {
        kind: 'improvement',
        title: 'Better Obsidian markdown import',
        desc: 'Task lists become checkboxes, and wiki links, highlights, tags, callouts and embedded images are handled correctly.',
      },
      {
        kind: 'improvement',
        title: 'Clickable vault previews',
        desc: 'The preview image on a vault card now opens the vault directly.',
      },
      {
        kind: 'improvement',
        title: 'Dark/light toggle in the editor',
        desc: 'Switch theme without leaving the mind map.',
      },
      {
        kind: 'improvement',
        title: 'Audio attachments',
        desc: 'Audio files attached to a node now play inline instead of only downloading.',
      },
      {
        kind: 'fix',
        title: 'Editing a vault no longer reloads every preview',
        desc: 'Changing one vault’s color, note or labels used to re-render and re-fetch the whole list.',
      },
      {
        kind: 'fix',
        title: 'Zooming no longer scrolls the page',
        desc: 'Ctrl+scroll now zooms the canvas cleanly.',
      },
      {
        kind: 'fix',
        title: 'Previews of collapsed maps',
        desc: 'Vault previews render correctly for maps with folded branches.',
      },
      {
        kind: 'fix',
        title: 'PDF export artifacts',
        desc: 'Fixed a stray line and colour bleed in the exported PDF logo.',
      },
    ],
  },
  {
    version: '0.3.30',
    date: '2026-08-06',
    highlights: 'macOS desktop builds.',
    items: [
      {
        kind: 'feature',
        title: 'macOS support',
        desc: 'A universal DMG now runs natively on both Apple Silicon and Intel Macs, alongside the Windows and Linux builds.',
      },
      {
        kind: 'improvement',
        title: 'Updated app framework',
        desc: 'Moved to React 19 and refreshed the desktop runtime.',
      },
    ],
  },
  {
    version: '0.3.29',
    date: '2026-06-05',
    highlights: 'FreeMind import and export.',
    items: [
      {
        kind: 'feature',
        title: 'FreeMind import',
        desc: 'Open a FreeMind .mm file as a new encrypted vault, keeping colours, positions, folded branches, links and notes.',
      },
      {
        kind: 'feature',
        title: 'FreeMind export',
        desc: 'Export any mind map back to a FreeMind .mm file from the editor export menu.',
      },
    ],
  },
];
