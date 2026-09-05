/**
 * What this package needs to know about a node, and nothing more.
 *
 * `LayoutNode` is a *shape*, not a class: each app keeps its own node type —
 * `MindMapTreeNode` in both frontends — and satisfies this by having the
 * fields the geometry reads. `Self` is the app's own node type, so
 * `children` stays that type all the way down the tree rather than widening
 * to this shape at the first recursion.
 */

export interface LayoutImage {
  /** Data URI of the glyph drawn on the node. */
  thumb: string;
  /** Rendered dimensions, stored so layout never has to decode the image. */
  w: number;
  h: number;
}

/** A link from a node to another vault. */
export interface NodeLink {
  type: 'vault';
  id: string;
  /**
   * The vault's title when the link was made. Kept on the node so the strip
   * renders without resolving anything — titles are encrypted, so the editor
   * cannot look one up on its own, and a linked vault may since have been
   * deleted or be one this account can no longer read.
   */
  label?: string;
}

export interface LayoutNode<Self> {
  id: string;
  text: string;
  children: Self[];
  notes?: string;
  collapsed?: boolean;
  link?: NodeLink | null;
  icons?: string[];
  checked?: boolean | null;
  progress?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  /** Only the count matters here — one footer strip each. */
  urls?: readonly unknown[];
  /** Likewise: presence decides whether there is a meta strip. */
  attachments?: readonly unknown[];
  side?: 'left' | 'right';
  customX?: number;
  customY?: number;
  tags?: string[];
  image?: LayoutImage | null;
}

/**
 * Which parts a node has and how tall each band is. Derived from the node
 * alone, so measuring and drawing cannot disagree about it.
 *
 * Bands run top to bottom: the date badge sits *above* the box, then the meta
 * strip, the tags, the picture, the text body, and one footer strip per link.
 */
export interface NodeParts {
  lines: string[];
  iconCount: number;
  urlCount: number;
  /** The node's tags. Only the count changes the measurement; the band that
   *  draws them reads these so it need not go back to the node. */
  tags: string[];
  tagCount: number;
  /** The vault this node links to, with the text the strip draws. */
  link: { id: string; label: string } | null;
  hasCheckbox: boolean;
  hasProgress: boolean;
  hasNote: boolean;
  attachmentCount: number;
  hasDate: boolean;
  /** The glyph's dimensions, or null. The app keeps the glyph itself. */
  image: LayoutImage | null;
  /** Room taken by the checkbox, icons and progress dial, left of the text. */
  leftPad: number;
  /** Band above the body: note dot and attachment count. */
  topMetaH: number;
  /** Band below the meta strip: the tag pills. */
  topTagH: number;
  /** Band below the tags: the picture. */
  imageBandH: number;
  /** Band below the body: one strip per footer link. */
  footerH: number;
  /** Space reserved *above* the node for the date badge. */
  visualTopExtra: number;
}

export interface DescribeOptions {
  /**
   * Attachments resolved for this node, when the caller knows more than the
   * node does. The server editor merges the node's own list with attachments
   * held outside the tree, so a node whose attachments live only outside it
   * used to get a meta strip drawn that the layout had reserved no height for
   * — 18px stolen from the text body. Pass the resolved count and both sides
   * agree again.
   */
  attachmentCount?: number;
}

export type DescribeNode<N> = (node: N) => NodeParts;

export interface NodeSize {
  w: number;
  h: number;
  lines: string[];
}

export interface NodeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeGeometry {
  /** Centre of the meta strip: the note dot and the attachment badge. */
  metaCentreY: number;
  /** Top of the tag strip, and the divider under the meta strip. */
  tagTopY: number;
  /** Divider under the tag strip. */
  tagBottomY: number;
  /** Top of the picture glyph. */
  imageY: number;
  /** Top of the text body, below the meta, tag and image bands. */
  bodyTopY: number;
  /** Height of the text body — the number `measureNodeSize` started from. */
  bodyH: number;
  /** Vertical centre of the body: checkbox, icons and progress dial. */
  centreY: number;
  /** Left edge of the text, past the decorations. */
  textX: number;
  /** Horizontal centre of the text column. */
  textCentreX: number;
  /** Baseline of the first line of text. */
  lineStartY: number;
  /** Top of the first footer strip. */
  footerTopY: number;
}

export interface LayoutEntry<N> {
  x: number;
  y: number;
  w: number;
  h: number;
  visualTopExtra: number;
  subtreeH: number;
  direction: 'left' | 'right';
  node: N;
  /** What this node was measured from. The renderer draws from the same parts. */
  parts: NodeParts;
}
