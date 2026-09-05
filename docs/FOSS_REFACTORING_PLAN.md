# Refactoring plan: the FOSS desktop app

Written 2026-09-05, after the same work in `mindmapvault-server` and
`mindmapvault-saas`. The recipe is proven twice; see `-server`'s `CLAUDE.md`,
its `docs/VAULTS_PAGE_REFACTORING_PLAN.md`, and `-saas`'s
`docs/SAAS_REFACTORING_PLAN.md` and `docs/mindmapeditor-refactor-plan.md`.

## What we are dealing with

| File | Lines | `-server` | `-saas` |
|---|---|---|---|
| `frontend_app/src/components/MindMapEditor.tsx` | 3,702 | 3,380 | 3,473 |
| `frontend_app/src/components/MindMapEditor.css` | 2,838 | | |
| `frontend_app/src/pages/VaultsPage.tsx` | 1,814 | 1,413 | 1,612 |
| `frontend_app/src/components/SettingsModal.tsx` | 930 | | |
| `frontend_app/src/utils/vaultPreview.ts` | 611 | | |
| `desktop/src-tauri/src/local_store.rs` | 1,153 | | |

Both of the other repos have already been through this. **This one has not**,
and the gap is not stylistic — it is the modules the other two extracted:

| They have | This repo has |
|---|---|
| `packages/mindmap-core/` (constants, text, types, geometry, layout) | `components/MindMapConstants.ts` + `MindMapLayout.ts`, editor-local |
| `components/mindmap/` — `NodeBands`, `treeOps`, `viewport`, `useViewport`, `history`, `useMindMapHistory`, `dragSelection` | nothing; all of it inline in `MindMapEditor.tsx` |
| `pages/vaults/` — `vaultState`, `importFormats`, `format`, `types`, `VaultCard`, `VaultTableRow` | all of it inline in `VaultsPage.tsx` |
| `utils/exportFileName.ts`, `utils/exportFormats.ts`, `utils/vaultLabels.ts` | absent |

So this is mostly a **port of a structure that already exists and is tested**,
not a design exercise. Where the features differ — this repo is local-only, with
no sharing, publishing, plans or collaboration — the contents differ, but the
file names and exports should line up, because work moves between these three
repos constantly.

## What measuring turned up

Four defects, all of them the "derived twice, then drifted" shape. None is
hypothetical; each was confirmed by reading both copies.

**1. Every Markdown export is named after the day of the month.**
`buildExportFileBaseName` exists twice — `MindMapEditor.tsx:1284` and
`EditorPage.tsx:410`. The editor's copy anchors the version match (`/^v\s*(\d+)$/`)
and carries a comment explaining why. `EditorPage`'s copy does not (`/v\s*(\d+)/`).
This repo is local-only, so `versionLabel` is *always* the date fallback
(`EditorPage.tsx:326,329,375,378` — `v ${d.toLocaleDateString()}`), and nothing
else ever sets it:

```
versionLabel = "v 9/5/2026"
MindMapEditor (anchored)   -> no token
EditorPage    (unanchored) -> v9
```

The editor computes a correct name, passes it in as `currentTitle`, and
`handleExportMarkdown` re-derives it through the broken copy. The fallback
differs too (`mindmap` vs `vault`), and only the editor's copy has the
"title already ends with the version" guard.

**2. The node renderer and the layout disagree about which nodes have a meta
strip.** `measureNodeSize` (`MindMapLayout.ts:73`) uses
`Boolean((node.notes ?? '').trim())` and `node.attachments.length`.
`renderNodes` (`MindMapEditor.tsx:2291`) uses `Boolean(node.notes)` — untrimmed —
and `getNodeAttachments(node.id, node.attachments)`, which *merges in*
`externalNodeAttachments[nodeId]`, attachments that are not in the tree at all.
Two ways to reach the same result: a node whose notes are a stray space, or a
node whose only attachment is external. The layout reserves 0, the renderer
draws 18px and pushes `bodyTopY` down inside a box that was never made taller.

**3. The vault thumbnail draws bands the layout did not reserve.**
`vaultPreview.ts` calls the *same* `layoutTree`, then hardcodes
`topTagH = 16 * scale` (`:292`) against `TAG_STRIP_H = 18`, and has no
`topMetaH` anywhere — the meta strip is ignored outright. It imports
`NODE_IMAGE_PAD` from the constants and then declines to import the other two.
Thumbnails put labels where the editor does not.

**4. `VaultsPage.tsx` carries both duplications the other two removed.**
Four import handlers differing in three things each — the parser, the extension,
and which of three state variables — with **49 references** to the
`…Importing` / `…ImportError` / `…ImportRef` triples. And `VaultCard` (`:196`)
and `VaultTableRow` (`:523`) each recompute `persistedSharingMode` and
`isSharedVault` from the same record.

The import menu is the not-one-to-one case `-server`'s `CLAUDE.md` warns about:
five entries for four readers, because FreeMind and Freeplane share `mmImportRef`.

## The constraints that shape this work

**There is no e2e suite.** `-saas` planned the editor split around eight
Playwright specs and called them "the only thing standing between a refactor and
a regression". This repo has no `e2e/` directory and no Playwright dependency.
The whole net is 5 vitest files, 67 tests, covering key rotation, markdown, the
shortcut registry and format round-trips — and **nothing in the editor at all**.

That inverts the order. `-saas` could move code first and extract tests later.
Here, every step that touches behaviour-carrying arithmetic has to bring its own
test, written against today's behaviour, before the move.

**Two other packages import the editor by relative path.** `demo/src/App.tsx`
and `mobile-demo/src/App.tsx` both do
`import { DesktopMindMapEditor } from '../../frontend_app/src/components/MindMapEditor'`.
They are not tests, but they are compile-time consumers: `pnpm build:demo` and
`pnpm build:mobile-demo` have to stay green through every step.

**The Tauri host has no tests whatsoever.** `desktop/src-tauri/src/` — 1,355
lines including atomic writes, HMAC index verification and a 104-line profile
migration — contains zero `#[test]`. That is the layer where a bug loses the
user's data, and in a local-only app there is no server-side copy.

## Order

Each step is one commit, `pnpm --dir frontend_app test` green either side, plus
`pnpm build:app`, `build:demo` and `build:mobile-demo`.

### Phase A — derive once, and fix what that uncovers

Each of these ships a test. They are worth doing even if nothing else happens.

| # | Step | Fixes | |
|---|---|---|---|
| 1 | `utils/exportFileName.ts` — one `buildExportFileBaseName`, anchored, tested | defect 1 | **done** |
| 2 | Port `packages/mindmap-core`: `describeNode` + `measureNodeSize` + `nodeGeometry`, and rewire the layout, the renderer and `vaultPreview` onto it | defects 2 and 3 | **done** |
| 3 | `pages/vaults/vaultState.ts` — the sharing/colour/label derivation, tested | defect 4b | **done** |
| 4 | `pages/vaults/importFormats.ts` — one table, one code path, tested | defect 4a | **done** |
| 5 | `utils/exportFormats.ts` — the export mirror of step 4 | | **done** |

**Phase A is complete.** Tests 67 → 139. `VaultsPage.tsx` 1,814 → 1,695,
`MindMapEditor.tsx` 3,702 → 3,673, `EditorPage.tsx` 765 → 729, against 1,523
lines of new module and test.

What steps 1 and 2 settled, beyond the three defects:

- `node.link` is vestigial here. It is read in exactly two places, both of them
  measurement, and set to `null` in the only two places that set it — nothing in
  this repo can produce a non-null one and nothing draws one. `-server` resolved
  this the other way, by making vault links a real feature. Left alone for now;
  it costs nothing while it is always null.
- `ATTACHMENT_PREVIEW_W` / `ATTACHMENT_PREVIEW_H` were dead constants, referenced
  nowhere, and did not survive the move.
- The preview cache key went `…-v3` → `…-v4`. Every thumbnail cached under v3 was
  drawn with the off-centre arithmetic and has to be redrawn.
- Test count 67 → 103.

Step 2 was the one to be careful with. `-server`'s `describeNode` already takes
an `attachmentCount` option for exactly the external-attachment case found here,
so the port was mechanical.

What steps 3 to 5 turned up:

- **The import triples went 49 references → 9.** The nine left are the four file
  input refs, the map that keys them by format, and the two `setImportErrors`
  calls. The menu's five-entries-for-four-formats asymmetry is now pinned by a
  test rather than by four copies of a click handler.
- **`isLocalMode` is always true.** `AppMode` is a one-member union (`'local'`),
  so every `!isLocalMode` branch in `VaultsPage` is unreachable. `buildVaultDrafts`
  keeps the guard on the device-label fallback anyway, because the guard is what
  the code means. Removing the dead branches is worth its own pass — it is not
  a step 3 change.
- **The tree snapshot went from seven copies to one.** `currentTreeSnapshot()`
  is now the only place that knows what `view_state` contains. `handleSave`
  moved below it and its dependency list shrank from ten entries to four — it
  had been listing `pan.x`, `zoom`, `focusMode` and the rest, none of which it
  reads directly.
- **Both demo packages passed `onExportMarkdown`.** They now take
  `exportFormats={MARKDOWN_ONLY}` and serialize through the table, so the demo
  and the app cannot disagree about what a Markdown export contains. The list is
  filtered by id rather than indexed, so reordering the table cannot change what
  the demo offers.
- `importFormat(id)` exists in `-server` with no production caller; it was not
  ported, and the test that needed it looks the format up from `IMPORT_FORMATS`.

### Phase B — structural moves, no behaviour change

| # | Step | Lines | |
|---|---|---|---|
| 6 | `VaultCard` and `VaultTableRow` into `pages/vaults/` | ~640 | **done** |
| 7 | `components/mindmap/NodeBands.tsx` — split `renderNodes` by band | ~310 | **done** |
| 12+13 | `components/mindmap/treeOps.ts` — the tree operations and field edits | ~320 | **done** |
| 8 | PNG + PDF export out of the editor | ~60 | |
| 9 | Voice recording | ~75 | |
| 10 | Node images | ~265 | |
| 11 | Autosave | ~150 | |
| 14 | History (undo/redo) — after the mutations, it touches most of them | ~110 | **done** |
| 15 | Drag and drop | ~120 | **done** |
| 16 | Mobile surfaces (JSX) | the largest single win | |
| 17 | Dialogs, then the toolbar (JSX) | | |

The editor's section comments are accurate and already mark these seams — 42 of
them, from `// ── Mobile detection` to `// ── Fit view`.

**How a pure move gets verified here.** There is no e2e suite, so each of these
was checked against a build of `HEAD` in a git worktree, both served on the same
port and driven with the same script:

- **Step 7** — 764 lines of extracted SVG geometry (every node box, text
  position, band divider, tag pill, note dot, attachment badge, picture and
  checkbox across all 27 demo nodes) diffed **identical**, and the two 3000×1900
  screenshots came out with the **same MD5**.
- **Steps 12+13** — a scripted run of add-child, add-sibling, commit, duplicate,
  move, delete, undo and reset-positions produced **identical output** on both
  builds, with no page errors on either.
- **Step 14** — undo and redo, and the enabled state of both toolbar buttons
  through edit → undo → redo, **identical** on both builds.
- **Step 15** — *not* verified this way, and the gap is worth stating: no
  scripted gesture reached the marquee or a node drag on **either** build, so
  the run proves nothing about them. What stands instead is that the diff
  touches the drag path in exactly five places — `dragDelta`,
  `passedDragThreshold`, `findDropTarget`, `nodesInMarquee`, `marqueeBounds` —
  and all five now have unit tests, including the two preserved quirks:
  `findDropTarget` takes the first candidate in layout order rather than the
  nearest, and measures from the dragged node's corner to the other's centre.
  Everything around them is byte-identical.

That is the standard for the rest of Phase B: if a move cannot be shown to
change nothing, it does not get made.

What these three turned up:

- **The rename-context comparison was a third copy.** `VaultCard` and
  `VaultTableRow` each inlined it in their `memo` comparator, identically. Both
  now call the tested `sameRenameContext`.
- **The note dot ignored the trim that the strip it sits on respects.** Step 2
  fixed the *measurement* to use `notes.trim()`, but the renderer still drew the
  dot and placed the attachment pill from the untrimmed `node.notes`. A node
  whose note is one space drew the dot on the box's top edge, outside any strip.
  `MetaBand` gates both on `parts`, so the strip and its contents cannot
  disagree again.
- **`clone → findNode → change → mutate` was written out fourteen times**, and
  the multi-select versions seven more. They are now `editNode` and `editNodes`.
  Test count 139 → 174.
- **`resetNodePosition` and `autoAlignSubtree` are not the same operation**,
  though they read almost alike: the first clears one node, the second clears
  the whole branch. Kept apart deliberately — `resetPositions` is the branch one.
- `autoAlignSubtree` on a node that is not in the tree used to push an
  identical tree onto the history stack, costing an undo step that undid
  nothing. `resetPositions` returns null instead and nothing is pushed.
- **The undo stack was held twice**, in a ref and in state, with the cap, the
  cursor and the redo-tail truncation written inline in the component.
  `history.ts` is that as data — the awkward parts (a new edit after an undo
  discards the redo tail; the cap moves the cursor) are now tested — and
  `useMindMapHistory` keeps the ref/state pair, which is load-bearing: the ref
  is what callbacks read so a burst of edits in one tick each sees the previous
  one, the state is what the toolbar's disabled buttons re-render from.
- **`MindMapEditor.tsx` 3,702 → 3,278; tests 67 → 189.**

### Phase C — the Tauri host

| # | Step | |
|---|---|---|
| 18 | Tests for `local_store.rs` before touching it | **done** |
| 19 | Measure, then decide | **done — split declined** |

**17 tests, from none.** They cover what can lose or corrupt data without
needing an `AppHandle`: the index MAC, the atomic write, the size accounting,
and the username check that decides a directory name. `migrate_if_needed` is
*not* covered — it is 103 lines behind an `AppHandle`, and reaching it means
standing up a Tauri app. That is the one real gap left in this file.

**The split is declined, and the file is left whole.** 1,155 lines, but 53
functions with a median of **9** lines and a largest of 103 — no monolith to
break up. What kills a domain split is the helper fan-out:
`ensure_storage_initialized` is called by 16 functions, `read_config` by 13,
`lock_index` by 12, `read_index` by 11. Splitting into profiles / vaults /
blobs / storage would produce exactly the `common.rs` that everything imports
which `-saas` predicted when it declined the same split for `mindmaps_sql.rs`.

**What the measurement did find: the atomic write was not durable.**
`write_bytes_atomic` did `fs::write` then `fs::rename`, with no `sync_all` on
either the file or its parent directory. The existing comment reasons carefully
about the crash window the old delete-then-rename pattern opened — but it stops
one step short. `rename(2)` being atomic decides *which name points at which
inode*; it does not decide whether that inode's blocks reached the disk. After a
power loss you could be left with the new name in place over a file that was
never written, and the old contents already gone. Every vault blob and the index
itself go through this function, and there is no server-side copy. Now syncs the
temp file before the rename and the parent directory after it — the directory
sync is Unix-only, because Windows offers no directory handle and `MoveFileExW`
is already ordered against the file's data.

**A defect pinned rather than fixed.** `compute_entry_mac` joins its five fields
with `|` and does not length-prefix them, so a value containing `|` could shift
the boundary between two fields and let two different entries share a MAC.
Nothing that reaches it can: ids are UUIDs and the rest is base64, and neither
alphabet contains `|`. `a_separator_inside_a_field_would_shift_the_boundary`
asserts the collision, so the day a free-text field joins the MAC, a test fails
instead of the tamper check quietly weakening.

**Two things looked at and deliberately left alone:**

- `verify_local_vault_integrity` compares MACs with `==`, not in constant time.
  Whoever can rewrite `index.json` can also read `index_mac_key.json` sitting
  beside it, so there is no secret a timing signal would leak.
- The MAC is only checked when that command is called. `read_index` — which
  every listing and open goes through — does not verify. That is a design
  choice about when to surface tampering, not an oversight, and changing it
  would change what the app does on a damaged index.

## What not to do

- **Do not port `-saas`'s or `-server`'s `VaultsPage` wholesale.** This one is
  local-only: no publishing, no plan limits, no collaboration. Port the *shape*,
  rewire this page onto it.
- **Do not add a DOM testing library** to justify testing components. Extract
  the pure core and test that. `notesDialogRoundTrip.test.tsx` uses a
  `@vitest-environment jsdom` pragma where it genuinely needs one; that is the
  exception, not the pattern.
- **Do not refactor and port in the same commit**, and do not fix a defect in
  the same commit as a move. Phase A is fixes with tests; Phase B is moves that
  should read as "this text is now over there".
- **Do not rename while moving.**
- **Do not split `MindMapEditor.css` by line count.** 2,838 lines of CSS is not
  automatically a problem, and the `mm-*` class names are the seam between three
  apps and two demo packages — they are persisted strings in the sense that
  matters.
- **Do not break `demo` or `mobile-demo`.** Both import the editor by relative
  path and both are in the pnpm workspace.

## Done when

- ~~An export's filename is derived in one place, with a test, and no export is
  named `-v9` because it is the ninth of the month~~ — done
- ~~The layout, the renderer and the thumbnail agree on where every band starts,
  because there is only one function that knows~~ — done
- ~~A vault's state is derived in one place, with tests~~ — done
- ~~Adding an import or export format is one entry in a table~~ — done
- ~~`pnpm --dir frontend_app test` and all three builds pass, with no test edited
  to make it so~~ — done

## Where it stands

| | before | after |
|---|---|---|
| `MindMapEditor.tsx` | 3,702 | 3,278 |
| `VaultsPage.tsx` | 1,814 | 1,052 |
| `EditorPage.tsx` | 765 | 729 |
| frontend tests | 67 | 189 |
| Tauri host tests | 0 | 17 |

Phase A complete. Phase B has 6, 7, 12, 13, 14 and 15; Phase C is complete.

**Still open, in the order they are worth doing:**

1. **`migrate_if_needed` has no test.** 103 lines that move a user's profile
   between three historical layouts, behind an `AppHandle`. The largest
   remaining risk in the repo.
2. **Steps 8-11 and 16-17** — PNG/PDF export, voice, node images, autosave, and
   the mobile/dialog/toolbar JSX. None has a pure core to extract, so by the
   rule above they are readability work, not testability work. Worth doing, but
   they buy less than everything already done.
3. **`isLocalMode` is dead weight.** `AppMode` is a one-member union, so every
   `!isLocalMode` branch in `VaultsPage` is unreachable. Its own pass.
4. **`MindMapEditor.css`** — 2,838 lines, untouched deliberately. The `mm-*`
   class names are the seam between three apps and two demo packages.
