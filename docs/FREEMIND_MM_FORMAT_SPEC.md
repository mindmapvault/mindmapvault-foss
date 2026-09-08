# FreeMind `.mm` File Format Specification

Derived from the FreeMind 1.1.0 source code (`freemind-code`, the SourceForge
git mirror). The authoritative writer is
`freemind/modes/NodeAdapter.java#save(...)` for nodes and
`freemind/modes/mindmapmode/MindMapMapModel.java#getXml(...)` for the document,
both serialised through `freemind/main/XMLElement.java#write(...)`.

This document describes exactly what FreeMind writes, so a producer can emit
byte-compatible files and a consumer can read any file FreeMind produces.

---

## 1. Document envelope

`MindMapMapModel.getXml` writes, in order, with no XML declaration:

```
<map version="1.1.0">\n
<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->\n
<root node …/>\n
</map>\n
```

- **No `<?xml …?>` prolog.** FreeMind does not write one.
- `version` is the constant `FreeMind.XML_VERSION` = **`1.1.0`**.
- The HTML comment line is always present, verbatim.
- The root `<node>` follows, then the closing `</map>`.
- Newlines are `\n` (LF). Each element's closing is followed by a single LF.

---

## 2. Element serialisation rules (`XMLElement.write`)

These rules apply to every element (`node`, `font`, `icon`, `edge`, `cloud`,
`hook`, `attribute`, `arrowlink`, `richcontent`).

### 2.1 Attribute order

Attributes are stored in a **`java.util.TreeMap`**, so they are written in
**lexicographic (alphabetical) order by attribute name** — *not* in the order
the code sets them. This is the single most important detail for byte-for-byte
reproduction.

For a `<node>`, the possible attributes therefore sort as:

```
BACKGROUND_COLOR  COLOR  CREATED  ENCRYPTED_CONTENT  FOLDED  HGAP  ID  LINK
MODIFIED  POSITION  STYLE  TEXT  VGAP  VSHIFT
```

(Only those actually set are emitted; see §3 for when each is present.)

### 2.2 Attribute / content escaping (`writeEncoded`)

Characters are escaped per character, in this exact mapping:

| Character | Output |
|-----------|--------|
| `<`  | `&lt;` |
| `>`  | `&gt;` |
| `&`  | `&amp;` |
| `"`  | `&quot;` |
| `'`  | `&apos;` |
| any char with code `< 32` or `> 126` | `&#xHH;` (lowercase hex, no leading zeros) |
| everything else (printable ASCII 32–126) | literal |

So non-ASCII text (e.g. Japanese) becomes `&#x…;` numeric entities, and control
characters too. There is no UTF-8 pass-through — output is pure ASCII.

### 2.3 Empty vs. open elements

- An element with **no content and no children** is written self-closing:
  `<node …/>\n`
- An element with **children** writes `>\n`, then each child (recursively),
  then `</name>\n`.
- An element with **text content** writes `>content</name>\n` (no newline
  before the closing tag when there is text content).
- `writeWithoutClosingTag` / `writeClosingTag` are used by `NodeAdapter` to
  stream children: it writes `<node …>` (no close), recurses into children,
  then writes `</node>\n`.

---

## 3. The `<node>` element (`NodeAdapter.save`)

### 3.1 Text content

- The node text has all NUL (`\0`) characters replaced by spaces first.
- **Plain-text node:** text goes in the `TEXT` attribute.
- **HTML node** (`HtmlTools.isHtmlNode(text)` is true): no `TEXT` attribute.
  Instead a child `<richcontent TYPE="NODE">` is written whose content is the
  HTML, encoded via `convertToEncodedContent` (see §4).

### 3.2 Note

- If `getXmlNoteText() != null`, a child `<richcontent TYPE="NOTE">` is written
  with the note HTML, encoded as in §4.

### 3.3 Attributes (emitted only when set)

| Attribute | Condition | Value |
|-----------|-----------|-------|
| `TEXT` | always, unless HTML node | node text (NUL→space) |
| `ENCRYPTED_CONTENT` | `getAdditionalInfo() != null` | additional info |
| `FOLDED` | `isFolded()` | literal `true` |
| `POSITION` | node is **not** root **and** its parent **is** root | `left` or `right` |
| `ID` | node is link-target / has incoming links (or always, unless `SAVE_ONLY_INTRISICALLY_NEEDED_IDS`) | link-registry label |
| `COLOR` | `color != null` | `colorToXml` → `#rrggbb` (lowercase hex) |
| `BACKGROUND_COLOR` | `getBackgroundColor() != null` | `#rrggbb` |
| `STYLE` | `style != null` | style string |
| `VGAP` | `vGap != VGAP` (default) | integer |
| `HGAP` | `hGap != HGAP` (default) | integer |
| `VSHIFT` | `shiftY != 0` | integer |
| `LINK` | `getLink() != null` | link target string |
| `CREATED` | `historyInformation != null` | `dateToString` = **millis since epoch** (decimal long) |
| `MODIFIED` | `historyInformation != null` | millis since epoch |

> **POSITION rule:** `POSITION` is written **only** for direct children of the
> root. Deeper nodes never carry it. This is the "left/right bug fix" noted in
> the source.

> **CREATED/MODIFIED** are epoch milliseconds (e.g. `1572058401236`), matching
> the contributed `sample.mm`.

### 3.4 Child elements (written in this fixed order, before child `<node>`s)

1. `<richcontent TYPE="NODE">` — if HTML node (§3.1)
2. `<richcontent TYPE="NOTE">` — if note present (§3.2)
3. `<edge …/>` — if `getEdge().save()` non-null. Attributes: `STYLE`, `COLOR`
   (`#rrggbb`), `WIDTH` (`thin` or integer).
4. `<cloud …/>` — if a cloud is set. Attributes: `STYLE`, `COLOR`, `WIDTH`.
5. `<arrowlink …/>` — one per outgoing arrow link. Attributes: `STYLE`, `ID`,
   `COLOR`, `DESTINATION`, `REFERENCETEXT`, `STARTINCLINATION`,
   `ENDINCLINATION`, `STARTARROW`, `ENDARROW`.
6. `<arrowlink …/>` (target form) — one per incoming link, via
   `createArrowLinkTarget`.
7. `<font …/>` — if a font is set. Attributes: `NAME` (font family), `SIZE`,
   `BOLD="true"`, `STRIKETHROUGH="true"`, `ITALIC="true"`, `UNDERLINE="true"`
   (each only when applicable).
8. `<icon BUILTIN="…"/>` — one per icon, in order.
9. `<hook …>` — one per activated permanent hook, except those marked
   `DontSaveMarker`.
10. `<attribute NAME="…" VALUE="…"/>` — one per entry in `mAttributeVector`,
    in order. **May be empty** (`NAME="" VALUE=""`), as seen in `sample.mm`.

Then child `<node>` elements are written recursively (§3.5).

### 3.5 Children recursion

- Children are written only when `saveChildren` is true and the node has
  unfolded children (`childrenUnfolded()`).
- Each visible child is saved recursively; an invisible child is skipped but
  its own children are lifted (`saveChildren` recurses into it).

---

## 4. Rich content encoding (`convertToEncodedContent`)

For `richcontent` bodies:

1. `HtmlTools.makeValidXml` — makes the HTML well-formed XML.
2. `HtmlTools.unicodeToHTMLUnicodeEntity(result, true)` — converts non-ASCII to
   HTML numeric entities.
3. The result is set with `setEncodedContent`, i.e. written with
   `dontEncodeContents = true`, so the already-encoded HTML is emitted verbatim
   (not double-escaped by `writeEncoded`).

---

## 5. Colour format (`Tools.colorToXml`)

`#rrggbb`, lowercase hex, each channel zero-padded to two digits.
Example: red → `#ff0000`, the sample's blue → `#0033cc`.

## 6. Date format (`Tools.dateToString`)

`Long.toString(date.getTime())` — decimal epoch milliseconds. No ISO dates.

---

## 7. Round-trip implications for MindMapVault

Our `freemindExport.ts` currently writes a subset. To be FreeMind-faithful:

- **Attribute order is alphabetical** (TreeMap) — our writer emits insertion
  order. For byte-compatibility we must sort attribute names.
- **No XML prolog** and the fixed FreeMind comment line should be emitted.
- **Escaping** must use numeric `&#xHH;` for non-ASCII, not UTF-8 bytes.
- **`POSITION`** only on root's direct children.
- **`COLOR`** lowercase `#rrggbb`.
- Notes/HTML go in `<richcontent TYPE="NOTE|NODE">`, content pre-encoded.

The importer (`freemindImport.ts`) already tolerates all of this (it reads
attributes by name and skips unknown child elements), so the gap is on the
*export* side only.

> **Encrypted branches are out of scope.** FreeMind/FreePlane password-protected
> branches store their children encrypted in `ENCRYPTED_CONTENT`. This app does
> not decrypt them — the password is not in the file. Such nodes import with a
> `🔒 Encrypted branch` note so the locked content is visible, not silently
> dropped. See `FREEPLANE_MM_FORMAT_SPEC.md` §8 for the algorithm details.
