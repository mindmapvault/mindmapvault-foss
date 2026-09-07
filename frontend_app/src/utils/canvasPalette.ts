/**
 * Derives the editor's surface colours from a chosen canvas background.
 *
 * A custom canvas on its own looks wrong: pick green while the app is in dark
 * mode and the nodes, toolbar and status bar stay slate blue, floating on a
 * colour they have nothing to do with. So the whole `--mm-*` family is derived
 * from the canvas instead — every surface is the canvas lifted a little toward
 * its own contrast colour, which is what the stock dark and light palettes are
 * doing by hand.
 *
 * The canvas decides light or dark, not the app theme. A pale canvas gets dark
 * text even in dark mode, because that is what stays readable.
 *
 * The accent stays the user's own: root nodes and connections are theirs to
 * colour, and tinting them here would fight the Accent setting.
 */

interface Rgb { r: number; g: number; b: number }

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** #rgb and #rrggbb, with or without the hash. Null for anything else. */
export function parseHex(hex: string): Rgb | null {
  const raw = hex.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Every variable this module writes, so callers can clear the whole set. */
export const CANVAS_PALETTE_VARS = [
  '--mm-canvas-bg',
  '--mm-node-fill', '--mm-node-stroke', '--mm-node-text',
  '--mm-collapse-fill', '--mm-collapse-stroke', '--mm-collapse-text',
  '--mm-toolbar-bg', '--mm-toolbar-border',
  '--mm-statusbar-bg', '--mm-statusbar-text',
  '--mm-notes-bg', '--mm-notes-border', '--mm-shortcuts-bg',
  '--mm-btn-bg', '--mm-btn-hover', '--mm-btn-border',
  '--mm-btn-text', '--mm-btn-text-hover',
] as const;

/**
 * The `--mm-*` values for `canvas`, or null when it is not a colour we can
 * read — in which case the caller should leave the stylesheet alone.
 *
 * The mix ratios are taken from the stock palettes: in dark mode the node fill
 * sits about 9% of the way from the canvas toward white, borders about 20%,
 * body text about 88%, and the status bar recedes instead of lifting.
 */
export function canvasPaletteVars(canvas: string): Record<string, string> | null {
  const base = parseHex(canvas);
  if (!base) return null;

  const isDark = relativeLuminance(base) < 0.42;
  const contrast = isDark ? WHITE : BLACK;
  const recede = isDark ? BLACK : WHITE;

  /**
   * A raised surface — a node, the toolbar, a dialog.
   *
   * Panels go lighter than their background in both stock palettes: slate-800
   * on slate-900 in the dark one, white on slate-100 in the light one. So this
   * always heads for white. The two ratios differ because the headroom does —
   * a pale canvas has almost none, so it needs the larger fraction to move at
   * all, and the absolute change stays comparable either way.
   */
  const surface = (dark: number, light: number) => toHex(mix(base, WHITE, isDark ? dark : light));

  /** Ink and edges: toward whichever of black or white the canvas is not. */
  const lift = (t: number) => toHex(mix(base, contrast, t));

  return {
    '--mm-canvas-bg': toHex(base),
    '--mm-node-fill': surface(0.09, 0.62),
    '--mm-node-stroke': lift(0.20),
    '--mm-node-text': lift(0.88),
    '--mm-collapse-fill': surface(0.09, 0.62),
    '--mm-collapse-stroke': lift(0.30),
    '--mm-collapse-text': lift(0.55),
    '--mm-toolbar-bg': surface(0.03, 0.40),
    '--mm-toolbar-border': lift(0.12),
    // The status bar is the one surface that recedes instead of lifting, which
    // is how both stock palettes set it off from the canvas.
    '--mm-statusbar-bg': toHex(mix(base, recede, 0.25)),
    '--mm-statusbar-text': lift(0.55),
    '--mm-notes-bg': surface(0.06, 0.80),
    '--mm-notes-border': lift(0.12),
    '--mm-shortcuts-bg': surface(0.06, 0.80),
    '--mm-btn-bg': surface(0.09, 0.30),
    '--mm-btn-hover': surface(0.15, 0.55),
    '--mm-btn-border': lift(0.20),
    '--mm-btn-text': lift(0.55),
    '--mm-btn-text-hover': lift(0.88),
  };
}

/** Applies the derived palette to `root`, or clears it when `canvas` is null. */
export function applyCanvasPalette(root: HTMLElement, canvas: string | null): void {
  const vars = canvas ? canvasPaletteVars(canvas) : null;
  if (!vars) {
    // Removing, rather than writing defaults, is what hands the canvas back to
    // whichever of the light/dark stylesheets is active.
    for (const name of CANVAS_PALETTE_VARS) root.style.removeProperty(name);
    return;
  }
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}
