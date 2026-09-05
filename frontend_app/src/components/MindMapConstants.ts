/**
 * MindMapConstants
 *
 * Shared constants for the MindMap editor features.
 */

/** Available node background colors (null = theme default). */
export const NODE_COLORS: (string | null)[] = [
  null,
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

/**
 * Extended 54‑swatch color palette (8 hue families × 6 shades + 6 grays).
 * Matches the Freeplane-style bottom color bar from the dashboard.
 */
export const COLOR_PALETTE: string[] = [
  // Reds
  '#7f1d1d', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fecaca',
  // Oranges
  '#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fed7aa',
  // Browns
  '#4a2c17', '#78450b', '#92400e', '#a16207', '#b87333', '#deb887',
  // Greens
  '#14532d', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#bbf7d0',
  // Cyans
  '#164e63', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#a5f3fc',
  // Blues
  '#1e3a5f', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#bfdbfe',
  // Lilac / Purple
  '#4c1d95', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe',
  // Pinks
  '#831843', '#be185d', '#db2777', '#ec4899', '#f472b6', '#fbcfe8',
  // Grays
  '#18181b', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7',
];

/** Progress presets for node progress circles. */
export const PROGRESS_PRESETS: number[] = [0, 25, 50, 75, 100];

// ── Layout constants ────────────────────────────────────────────

/**
 * The band heights, padding and gaps live in `@mindmapvault/mindmap-core`
 * alongside the arithmetic that uses them, and are re-exported here so the
 * rest of the app imports them from the same place it always has.
 */
export {
  NODE_LINE_H,
  NODE_MIN_H,
  NODE_PAD_X,
  NODE_PAD_Y,
  H_GAP,
  V_GAP,
  MIN_W,
  LINK_STRIP_H,
  TAG_STRIP_H,
  TOP_META_STRIP_H,
  DATE_BADGE_OFFSET_H,
  ICON_SIZE,
  CHECKBOX_SIZE,
  PROGRESS_PIE_SIZE,
  NODE_IMAGE_BOX,
  NODE_IMAGE_PAD,
} from '@mindmapvault/mindmap-core';
