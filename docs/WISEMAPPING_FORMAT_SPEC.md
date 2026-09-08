# WiseMapping `.wxml` File Format Specification

Derived from the WiseMapping source. The authoritative writer is the frontend
`mindplot` package — `packages/mindplot/src/components/persistence/
XMLSerializerTango.ts` (`toXML` / `_topicToXML` / `_noteTextToXML` /
`_relationshipToXML`). The backend (`wise-api`) stores the XML verbatim
(zipped) and validates only that it starts with `<map` and ends with `</map>`.

The current format version is **`tango`** (the serializer's `ModelCodeName`);
older `pela`/`beta` versions are migrated on load by `Pela2TangoMigrator` /
`Beta2PelaMigrator`.

---

## 1. Document envelope

```
<map name="…" theme="…" layout="…" version="tango" …canvas attrs…>
  <topic …>…</topic>
  <relationship …/>
</map>
```

- **No `<?xml?>` prolog** is required; the document is a single `<map>` root.
- `<map>` attributes, in the order the serializer sets them:
  - `name` — the map id/title (omitted if unset).
  - `theme` — omitted when `classic` (the default); otherwise the theme id
    (e.g. `prism`).
  - `layout` — **always written** (e.g. `mindmap`, `freeplane`-style layouts).
  - Canvas style (optional): `backgroundColor`, `backgroundPattern`,
    `backgroundGridSize`, `backgroundGridColor`.
  - `version` — `tango` for current files.

> Note: the backend's *default* new-map template is
> `<map version="tango" theme="prism"><topic central="true" text="TITLE"/></map>`
> — a minimal subset. Real saved maps carry the fuller attribute set below.

---

## 2. The `<topic>` element

### 2.1 Core attributes

| Attribute | When present | Value |
|-----------|--------------|-------|
| `central` | the root topic only | `true` |
| `position` | every non-central topic | `x,y` (integers, `Math.ceil`) |
| `order` | non-central, when a finite number | sibling order index |
| `id` | **always** | numeric topic id |
| `text` | single-line text only | the topic text (XML-attribute-escaped) |
| `shape` | when explicitly set | `none`, `line`, `rectangle`, `image`, … |
| `image` | `shape="image"` with a size | `width,height:imageUrl` |
| `imageEmoji` | an image-emoji is set | the emoji character |
| `imageGallery` | a gallery icon is set | icon name, lowercased |
| `shrink` | children collapsed and non-central | `true` |
| `bgColor` | background colour set | `#rrggbb` |
| `brColor` | border colour set | `#rrggbb` |
| `connStyle` | connection style set | style id |
| `connColor` | connection colour set | `#rrggbb` |
| `metadata` | present | metadata string |
| `fontStyle` | any font property set | `family;size;color;weight;style;` (semicolon-joined, empties allowed) |

### 2.2 Text: attribute vs. CDATA child

`_noteTextToXML`:

- **Single-line text** → the `text` **attribute**.
- **Multi-line text** (contains `\n`) → a `<text>` child element whose content
  is a **CDATA section** holding the raw text.

### 2.3 Features (notes, links, icons, tasks)

Features are child elements named by their feature type. Each feature's
attributes are written as XML attributes, **except** a `text` key, which is
written as a **CDATA section** inside the feature element.

- **Note** → `<note>` with the note text in CDATA.
- **Link** → `<link>` with a `url` attribute (and optional text in CDATA).
- **Icon** → `<icon>` with the icon attributes.
- **Task** → `<task>` with the task attributes.

### 2.4 Children

Child `<topic>` elements are appended after all features, recursively.

---

## 3. The `<relationship>` element

Cross-topic connectors, written as siblings of the top-level topics:

| Attribute | Value |
|-----------|-------|
| `srcTopicId` | source topic id |
| `destTopicId` | destination topic id |
| `lineType` | line type id |
| `srcCtrlPoint` / `destCtrlPoint` | `x,y` (rounded), optional |
| `endArrow` / `startArrow` | `true`/`false` |
| `strokeColor` | `#rrggbb`, optional |
| `strokeStyle` | stroke style id |

Relationships whose endpoints are not both present in the map are **not**
persisted.

---

## 4. Escaping

- Attribute values are XML-attribute-escaped (`&` `<` `>` `"` and, per the
  backend's `escapeXmlAttribute`, `'`).
- Multi-line text and feature `text` go in CDATA, so they are **not** escaped.
- `_rmXmlInv` strips XML-invalid control characters from text before writing.

---

## 5. Round-trip implications for MindMapVault

Our `wisemappingExport.ts` writes a **different, older dialect**:
`<map name="">` with `id`/`order`/`position="left|right"`/`bgColor` and
`<note>`/`<link>` children. The real format differs in nearly every attribute:

- `version="tango"` and `layout` on `<map>`; `theme` omitted only when classic.
- Topics carry a numeric `id`, `position="x,y"` (not `left`/`right`), and
  `central="true"` on the root.
- Multi-line text uses a `<text>` CDATA child, not the `text` attribute.
- Notes/links/icons/tasks are **feature child elements** with CDATA text, not
  bare `<note>`/`<link>`.
- `bgColor`/`brColor`/`fontStyle`/`shape`/`image*`/`connStyle`/`connColor`/
  `metadata` are the real styling attributes.

The importer (`wisemappingImport.ts`) reads `text`/`bgColor`/`position`/
`<note>`/`<link>` — so it reads our own export but only a **subset** of a real
WiseMapping file. The gap is on both sides; see the round-trip and
compatibility suites for the enforced contract.
