/**
 * The numbers the canvas is built from.
 *
 * Band heights, padding and gaps only. Colours, palettes and the other purely
 * decorative constants stay in each app's `MindMapConstants.ts`, which
 * re-exports these so nothing else had to change when they moved here.
 */

export const NODE_LINE_H = 20;
export const NODE_MIN_H = 36;
export const NODE_PAD_X = 18;
export const NODE_PAD_Y = 8;
export const H_GAP = 40;
export const V_GAP = 8;
export const MIN_W = 80;
export const LINK_STRIP_H = 18;
export const TAG_STRIP_H = 18;
export const TOP_META_STRIP_H = 18;
export const DATE_BADGE_OFFSET_H = 34;
export const ICON_SIZE = 16;
export const CHECKBOX_SIZE = 16;
export const PROGRESS_PIE_SIZE = 32;
/** The box a node image fits inside; the glyph keeps its own aspect ratio. */
export const NODE_IMAGE_BOX = 64;
/** Vertical breathing room above and below the image band. */
export const NODE_IMAGE_PAD = 6;
/** Preset sizes for a map that has not chosen its own. S matches the glyph. */
export const DEFAULT_IMAGE_SIZES = { S: 64, M: 128, L: 256 } as const;
/** Bounds for a preset: below the minimum a picture stops being readable,
 *  above the maximum one picture outgrows the map around it. */
export const MIN_IMAGE_SIZE = 32;
export const MAX_IMAGE_SIZE = 512;
