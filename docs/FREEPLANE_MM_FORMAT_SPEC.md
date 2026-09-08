# FreePlane `.mm` File Format Specification

Derived from the FreePlane source code (`freeplane/`, the GitHub mirror,
XML_VERSION `freeplane 1.12.15`). The authoritative writers are:

- `features/map/MapWriter.java` — document envelope and orchestration
- `features/map/NodeWriter.java` — node attributes and child-element ordering
- `features/text/NodeTextBuilder.java` — the `TEXT` attribute and
  `richcontent` (NODE / NOTE / DETAILS) bodies
- `core/io/xml/TreeXmlWriter.java` + `core/io/xml/XMLWriter.java` — byte-level
  serialisation and escaping

FreePlane's writer is **extension-driven**: text, notes, icons, styles, links
and hooks each register an `IAttributeWriter` / `IElementWriter` with a
`WriteManager`, and they run in registration order. This document covers the
core map a typical editor produces; the full extension set is out of scope.

---

## 1. Document envelope

`MapWriter.writeMapAsXml` → `TreeXmlWriter` → `XMLWriter`. The file is written
as **UTF-8** (`MFileManager` wraps the stream in an `OutputStreamWriter(
StandardCharsets.UTF_8)`).

```
<map version="freeplane 1.12.15">\n
<!--To view this file, download free mind mapping software Freeplane from https://www.freeplane.org -->\n
<root node …/>\n
</map>\n
```

- **No `<?xml …?>` prolog** is written by `writeMapAsXml`. (A prolog appears
  only in unrelated outputs — format/scanner/add-on files — not in `.mm`.)
- `version` is `FreeplaneVersion.XML_VERSION` = **`freeplane 1.12.15`** for the
  current source. The `freeplane ` prefix is what distinguishes a FreePlane
  file from a FreeMind one (`<map version="1.1.0">`).
- The usage comment is `MapWriter.USAGE_COMMENT`, written verbatim, followed by
  the platform line separator (LF on Unix, the canonical form).
- The root `<node>` follows, then `</map>`.

---

## 2. Element serialisation rules (`core/io/xml/XMLWriter.write`)

### 2.1 Attribute order — insertion order

Unlike FreeMind (which sorts), FreePlane's nanoxml `XMLElement` stores
attributes in a **`java.util.Vector`** and enumerates them in **insertion
order**. The order is therefore whatever the registered writers emit, in
registration order. For a node the practical order is:

```
TEXT  FOLDED  POSITION  ID  CREATED  MODIFIED  ICON_SIZE  …extension attrs
```

(`TEXT` is written by `NodeTextBuilder`, the structural ones by `NodeWriter`.)
Because order is insertion-driven, a faithful producer should emit attributes
in this order rather than sorting them.

### 2.2 Escaping (`XMLWriter.writeEncoded`)

Escaping depends on three flags: `atributeValue`, `xmlInclude`, and the
writer's `restrictedCharset` (the `useAsciiCharset` property, **default
false**).

| Character | In attribute | In content | Notes |
|-----------|--------------|------------|-------|
| `<` `>` `&` `'` `"` | `&lt; &gt; &amp; &apos; &quot;` | same | named entities |
| LF (`0x0A`) | `&#xa;` | literal newline | newlines survive in content, escaped in attributes |
| char `> 0x7E` (non-ASCII) | literal (UTF-8) | literal (UTF-8) | **default** (`restrictedCharset=false`) |
| char `> 0x7E` | `&#xHH;` | `&#xHH;` | only when `useAsciiCharset=true` |
| char `< 0x20` (not LF) | `&#xHH;` | `&#xHH;` | control chars always escaped |

**Default behaviour: non-ASCII is written as literal UTF-8, not numeric
entities.** This is the opposite of FreeMind's always-ASCII output.

### 2.3 Empty vs. open elements, and pretty-printing

`TreeXmlWriter.addElement` calls `XMLWriter.write(xml, prettyPrint, 0,
collapseEmptyElements, endElement)`. For a map save the effective form is
**pretty-printed with 4-space indentation per depth**:

- Element with text content: `<tag>content</tag>` then newline.
- Element with children: `<tag>`, newline, children indented `depth*4` spaces,
  then `</tag>` at the parent's indent, newline.
- Empty element (no content, no children): `<tag/>` then newline.

---

## 3. The `<node>` element

### 3.1 Text

`NodeTextBuilder.writeAttributes`:

- **Plain-text node:** text in the `TEXT` attribute, NUL (`\0`) → space.
- **HTML node** (`node.getXmlText() != null`): no `TEXT` attribute. Instead a
  child `<richcontent TYPE="NODE">` holds the XHTML (see §4).
- Localised/translated text uses `LOCALIZED_TEXT` instead of `TEXT`.

### 3.2 Structural attributes (`NodeWriter.writeAttributesGenerateContent`)

| Attribute | Condition | Value |
|-----------|-----------|-------|
| `ENCRYPTED_CONTENT` | node is encrypted and not being exported unlocked | encrypted payload; suppresses children |
| `FOLDED` | folding is being saved (`always_save_folding`) or non-FILE mode | `true`/`false`; root gets explicit `FOLDED="false"` |
| `POSITION` | `node.getSide() != Side.DEFAULT` | `left` or `right` (lowercase) |
| `ID` | always (non-STYLE mode) | `node.createID()` — FreePlane's `ID_…` form |
| `CREATED` | history present **and** `save_modification_times` on | epoch millis (decimal) |
| `MODIFIED` | as above | epoch millis |
| `ICON_SIZE` | icon size set | a `Quantity` string, e.g. `24.0 pt` |

> **POSITION** in FreePlane is driven by the node's `Side`, which is set for
> root's children (and can be set more broadly). It is *not* restricted to
> root's children the way FreeMind's writer is — but in practice only
> top-level nodes have a non-default side.

### 3.3 Child elements

`NodeWriter.writeContent` writes, in order:

1. Individual-extension nodes.
2. Link content (connectors) via `LinkBuilder`.
3. Shared-extension nodes — this is where `richcontent` (NODE/NOTE/DETAILS),
   icons, styles, hooks, and attributes are emitted by their registered
   writers.
4. Child `<node>` elements (recursively), when children are written.

The exact ordering among the shared extensions is registration order; the
common case emits `richcontent` (NODE) before `richcontent` (NOTE) before
`<icon>` elements before `<hook>`/`<attribute>`.

---

## 4. Rich content (`richcontent`)

`NodeTextBuilder` / `NoteWriter` / details write `<richcontent>` with a `TYPE`
of `NODE`, `NOTE`, or `DETAILS`.

- The body is XHTML wrapped as `<html><head/><body>…</body></html>`
  (`HtmlUtils.toXhtml` normalises to XHTML).
- The content is added as element content with surrounding newlines
  (`'\n' + content + '\n'`), so the XHTML sits on its own lines inside the
  `richcontent` element.
- An optional `CONTENT-TYPE` attribute records the source syntax (e.g.
  `markdown`, `html`) when the note/details carry one.
- A `DETAILS` element may carry `HIDDEN="true"`.

---

## 5. Colour, date, quantity formats

- **Colour:** `#rrggbb` (the edge/cloud/icon colours), consistent with
  FreeMind's `colorToXml`.
- **Date:** `TreeXmlWriter.dateToString` = `Long.toString(date.getTime())` —
  epoch **milliseconds**, same as FreeMind.
- **Quantity (icon size, gaps):** `Quantity.toString()`, e.g. `24.0 pt`.

---

## 6. FreeMind vs. FreePlane — the differences that matter

| Aspect | FreeMind 1.1.0 | FreePlane 1.12 |
|--------|----------------|----------------|
| `<map version>` | `1.1.0` | `freeplane 1.12.15` |
| XML prolog | none | none |
| Charset | pure ASCII (`&#xHH;` for non-ASCII) | UTF-8 (literal non-ASCII) by default |
| Attribute order | **alphabetical** (TreeMap) | **insertion order** (Vector) |
| Node id | optional, link targets only | always (`ID_…`) |
| Root `FOLDED` | omitted | explicit `FOLDED="false"` |
| Rich text | `richcontent` NODE/NOTE | `richcontent` NODE/NOTE/DETAILS + `CONTENT-TYPE` |
| Pretty-print | no indentation | 4-space indentation |

---

## 7. Round-trip implications for MindMapVault

Our `freeplaneExport.ts` currently writes a FreeMind-style file with a
`freeplane` version string. To be FreePlane-faithful:

- Emit `<map version="freeplane 1.12.15">` and the FreePlane usage comment.
- **UTF-8 output** — do not numeric-escape non-ASCII (opposite of FreeMind).
- Attributes in **insertion order**: `TEXT`, `FOLDED`, `POSITION`, `ID`, …
- Always emit an `ID` per node (`ID_<n>`), and `FOLDED="false"` on the root.
- Pretty-print with 4-space indentation.
- Notes in `<richcontent TYPE="NOTE">` with the XHTML on its own lines.

The importer (`freemindImport.ts`) already reads both dialects (it detects
FreePlane by the `freeplane` version prefix and handles `richcontent` NODE
text and `BACKGROUND_COLOR`), so the gap is on the *export* side.

---

## 8. Out of scope: encrypted branches

FreeMind and FreePlane can password-protect a branch. The children are
serialised to XML, encrypted with a key derived from a user password, and
stored Base64-encoded in the node's `ENCRYPTED_CONTENT` attribute. Two
algorithms exist (`features/encrypt/`):

- **Legacy DES** — `PBEWithMD5AndDES`, no prefix (e.g. the gallery's
  `Vault.mm`).
- **AES-256-GCM** — `PBKDF2WithHmacSHA256` (100 000 iterations), 16-byte salt +
  12-byte IV prepended, Base64'd with an `FP-AES256-V1:` prefix.

**Decryption is deliberately out of scope for this app.** The content is
encrypted with a password that is not in the file, so "importing" it means
prompting for that password — a feature, not a parser fix. The importer does
not attempt it. Instead, a node carrying `ENCRYPTED_CONTENT` is imported with
its visible attributes and a `🔒 Encrypted branch` note, so the locked content
is visible to the user rather than silently absent. If encrypted-branch import
is ever wanted, the modern AES-256-GCM path is feasible with Web Crypto
(PBKDF2 + AES-GCM are both native); the legacy DES path would need a
third-party DES implementation, which Web Crypto does not provide.
