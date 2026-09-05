/**
 * The base name an exported file is given.
 *
 * This existed twice — once in `EditorPage`, once in `MindMapEditor` — and the
 * copies had already drifted: one fell back to `vault`, the other to
 * `mindmap`. The logic was otherwise identical, including the two rules below
 * that are easy to get subtly wrong.
 */

export interface ExportFileNameInput {
  /** An explicit name for this export, when the caller has one. */
  baseTitle?: string;
  /** The vault's current title. */
  title?: string;
  /** Used when there is no title at all. */
  fallback: string;
  /** The version chip's text, e.g. "v12" — or a date, in local mode. */
  versionLabel?: string | null;
}

/** Characters no common filesystem accepts in a name. */
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]+/g;

export function buildExportFileBaseName({
  baseTitle,
  title,
  fallback,
  versionLabel,
}: ExportFileNameInput): string {
  // Trim before choosing, not after: a title of only spaces is truthy, so it
  // used to win over the fallback and then trim away to nothing, naming the
  // download ".md".
  const normalizedTitle = [baseTitle, title, fallback]
    .map((value) => (value ?? '').trim())
    .find((value) => value !== '') ?? fallback;
  const safeTitle = normalizedTitle
    .replace(UNSAFE_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // Anchored deliberately: local mode has no server-side version history and
  // falls back to a date label ("v 6. 8. 2026"), which an unanchored match
  // would read as version 6 — stamping the day of the month onto every export
  // as "-v6". Only a real sequential label ("v12") becomes a token.
  const versionMatch = (versionLabel ?? '').trim().match(/^v\s*(\d+)$/i);
  const versionToken = versionMatch ? `v${versionMatch[1]}` : null;

  // Don't append the token when the title already ends with it — title
  // "guide-v3" with label "v3" is "guide-v3", not "guide-v3-v3". This also
  // makes the function idempotent, which matters because the editor builds a
  // name and the page used to build it a second time from that result.
  const alreadyEndsWithVersion =
    versionToken != null && new RegExp(`[-_ ]${versionToken}$`, 'i').test(safeTitle);

  return versionToken && !alreadyEndsWithVersion ? `${safeTitle}-${versionToken}` : safeTitle;
}
