# Changelog

All notable changes to this repository are documented here.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

## [0.3.36] - 2026-09-06

### Changed
- **One source for the node geometry.** The band arithmetic — where the date badge, the meta strip, the tags, the picture, the text and the footer links sit — lived in three places: the layout engine, the editor's renderer, and the vault-list thumbnail. It now lives in `packages/mindmap-core`, and the layout hands each node's measurement to whatever draws it, so measuring and drawing cannot disagree. `MindMapEditor.tsx` draws a node from seven band components (`components/mindmap/NodeBands.tsx`) rather than 300 lines of inline SVG.
- **One source for the vault list's state.** A vault's colour, labels, sharing state and rename-comparison were derived separately in the grid card and the table row. Both now call `pages/vaults/vaultState.ts`, and each view moved to its own file.
- **Import and export are tables, not branches.** Four import handlers and five export handlers each differed in two or three things — the parser or serializer, the extension, and which of three state variables to set. Adding a format is now one entry in `pages/vaults/importFormats.ts` or `utils/exportFormats.ts`. The import menu keeps five entries for four readers, because FreeMind and FreePlane are two names people look for and one `.mm` parser.
- **The editor's tree operations are testable on their own.** Add, delete, duplicate, reparent, move, the multi-select edits and the undo stack moved to `components/mindmap/`, along with the drag thresholds and the marquee hit test. `MindMapEditor.tsx` is 3,702 lines down to 3,278; `VaultsPage.tsx` 1,814 down to 1,052.
- Frontend unit tests went from 67 to 189, and the desktop host from none to 17.

### Fixed
- **Markdown exports were named after the day of the month.** The filename's version token was worked out in two places and only one of them anchored its match. This app keeps no server-side version history, so the version label is always a date — and the unanchored copy read `v 9/5/2026` as version 9, stamping `-v9` onto every export.
- **Text sat outside its own node.** The renderer decided a node had a note without trimming it, and counted attachments the layout could not see, so a node whose note was a single space — or whose only file was attached rather than stored in the map — got an 18px strip drawn into space nothing had reserved, pushing the text past the bottom of its box.
- **Vault thumbnails put labels where the editor did not.** The preview drew the tag strip at 16px against the layout's 18 and ignored the meta strip entirely. Cached previews are redrawn once on upgrade.
- **A saved vault could survive a crash but not a power cut.** Files were written to a temp path and renamed, which is atomic — but the rename only decides which name points at which file, not whether that file's contents reached the disk. A power loss could leave the new name over a file that was never written, with the old one already gone. Writes now sync before the rename and sync the directory after it.
- Auto-aligning a branch that was no longer in the map pushed an identical copy onto the undo stack, costing an undo step that undid nothing.

## [0.3.35] - 2026-09-02

### Added
- **Two keyboard-shortcut layouts.** `FreeMind` (the legacy bindings, default on Windows/Linux) and `Mac` (modelled on MindNode, avoids function keys, default on macOS) — pick one in Settings → Interface, or leave it on the per-platform default. Both are closed sets: nothing falls back to the other layout's keys, so the F1 shortcuts panel, toolbar tooltips, context menu, and status bar hints are always exactly what will fire. Single source of truth is `frontend_app/src/shortcuts/registry.ts`; `Mod` resolves to the current OS regardless of which layout is active, so a Mac user on the FreeMind layout still gets a working ⌘Z/⌘F/⌘S. 19 vitest cases cover the matcher on both platforms.
- **Three UI density modes** — Lean, Standard, Large — in Settings → Interface. Driven by CSS custom properties and `data-density`/`data-toolbar-labels` attributes rather than per-component sizing logic. Lean mode collapses the toolbar to its essential buttons behind a "More actions" overflow menu; status bar and toolbar-label visibility can also be overridden independently of the preset.
- **Dockable colour and icon trays.** Off by default (on by default at Large density); toggle and reposition (top/bottom/left/right) in Settings → Interface, or with `Ctrl/Cmd+Shift+1` (colour) and `Ctrl/Cmd+Shift+2` (icon). Right-click a swatch or icon to pin it as a favourite, shown ahead of the curated set; favourites persist per profile.
- **A real native app menu**, replacing the debug-build-only "Inspect" menu. App (About, Settings, Hide, Quit), File (Save, Attach File, Close), Edit (Undo, Redo, Cut, Copy, Paste, Select All, Find), View (Lean mode, Colour/Icon tray, Status bar, Zoom, Fit to window, Focus mode), Node (Add child/sibling, Rename, Notes, Delete), and Help (Keyboard Shortcuts, plus Inspect in dev builds). Undo/Redo are custom items wired to the app's own tree-history rather than the OS-level predefined ones — those are unsupported on Windows/Linux and would be the wrong history even where they exist — while Cut/Copy/Paste/Select All use the real predefined items.
- **Thematic toolbar groups with visible captions**, across all three densities. Large density gets a real ribbon: a `Home / Insert / View / Export` tab bar on its own row, with Back, Save, the map title, the theme toggle and Settings sharing a single nav row above it. Group rendering goes through one `toolbarGroup()` helper so the markup cannot drift between densities.
- **Keyboard shortcuts printed on the toolbar buttons.** A third override in Settings → Interface, following the same tri-state pattern as the status bar and toolbar labels (on by default at Large, off elsewhere, overridable either way). Button captions use a trimmed form — `formatButtonShortcut` — so `Delete` and `Insert` show one binding instead of three; the F1 panel, tooltips and context menu still list every binding.
- **An Image button in the toolbar.** Adding a picture to a node was previously only reachable from the context menu or `Alt+K`. It now sits in the Insert/Files group at Standard and Large density, and in the "More actions" overflow at Lean.
- **Search in the icon tray.** The tray showed a fixed 16 icons behind a "More icons…" button; it now scrolls and searches the whole curated set, matching what the colour tray already did.
- README "Keyboard Shortcuts" section, generated from the registry.

### Changed
- **Settings opens on Account** rather than Appearance, from every entry point — the editor toolbar's gear, the vault lobby's gear, and the native `Settings…` menu item. The once-per-release What's New popup still opens on its own tab.
- **Settings → Interface uses switches** instead of bare checkboxes. They remain real checkboxes under the paint (`appearance-none` on the input itself), so label clicks, keyboard operation and focus behaviour are unchanged.
- **What's New moved** between Interface and Help in the settings sidebar.
- **Trays default to colour on the right, icons on the left** when Large density seeds them, instead of both at the bottom.
- Zoom shortcuts now match the applications they are modelled on: FreeMind's `Alt+Down` / `Alt+Up` alongside `+` / `-`, and MindNode's `⌘+` / `⌘−` / `⌘⇧8` for fit-to-window. `Alt+Arrow` no longer gets swallowed by spatial node navigation. Fit-to-window and Back-to-lobby gained bindings of their own (`F8` / `⌘⇧8`, `Alt+Left` / `⌘[`).
- The date and version label is gone from the editor toolbar in every density; the title sits alone and centred.

### Fixed
- **⌘C/⌘V (and Cut/Select All) now work.** There was no Edit menu at all before this release, so macOS's own copy/paste never reached the app — the native app menu above is the actual fix; `PredefinedMenuItem`'s Cut/Copy/Paste/Select All wire directly into the OS.
- **A bare `+` shortcut never fired.** Binding strings split on `'+'` as the modifier separator, so `'+'` as the key itself produced empty tokens that matched nothing. It is now a named `'Plus'` token, following the existing `'Space'` precedent.
- **The selection border was invisible on a coloured node.** The border colour was taken from the node's own fill colour before selection was considered, so selecting a coloured node changed nothing on screen. Root nodes had the same problem for the same reason. Selection now wins over both.
- **A node's colour no longer cascades onto the whole subtree below it.** It paints only the line coming into that node; the lines going out stay on the default until a child sets a colour of its own.
- **The export dropdown and the node context menu stay inside the window.** Both are measured against the viewport and pulled back inside — the context menu shifts up rather than running off the bottom, and the export dropdown opens towards whichever side has room, which is what the Large ribbon needs with the button hard against the left edge. Either one scrolls internally if the window is genuinely too short for it.
- Buttons without a shortcut (Settings, More, Back) no longer render shorter than their neighbours. An empty `content: attr()` pseudo-element collapses to zero height in this WebView instead of reserving its line, so the height is now set on the button itself.

### Removed
- The 16-icon cap and the "More icons…" button in the icon tray, superseded by the searchable full set above.

## [0.3.34] - 2026-09-01

### Added
- **Picture on node** — a node can now carry a small picture, drawn directly on the node. Drop a single image onto a node, paste one from the clipboard, or press `Alt+K` (right-click → Add Image also offers this); the full-resolution original is attached as usual and click-through opens it. Ported from the server build: `createNodeImageGlyph` in `utils/filePreview.ts` crops to a 3:1 max aspect ratio and encodes to WebP at the exact display size, degrading quality until the glyph is under 8 KB so it stays cheap inside the encrypted map JSON. Rendered as an SVG `<image>` (not `foreignObject`) so it survives PNG/PDF export, and the layout engine (`MindMapLayout.ts`) and the vault-list preview thumbnail (`vaultPreview.ts`) both reserve and draw the picture band.
- **Voice notes** — record and attach a voice memo to a node from the mobile-width layout's node-properties panel. Uses `MediaRecorder`; requires `desktop/src-tauri/Info.plist` (`NSMicrophoneUsageDescription`), added so macOS actually shows the microphone permission prompt.
- **Settings → Help tab** — links to the project's GitHub Discussions, Issues, and repository, replacing the absence of any in-app "getting help" path.
- Accessible labels (`aria-label`) on the accent-colour swatches, the custom colour input, and the autosave select in Settings → Appearance.
- `Ctrl/Cmd+E` now actually toggles Write/Read mode in the node notes dialog — the button already advertised the shortcut, but no listener existed.

### Changed
- **Icon picker rebuilt on a static registry.** Replaced the `lucide-react/dynamic` runtime lookup (manual kebab/Pascal conversion, an alias patch table, search capped at 120 of ~1500 icons) with `components/lucideIconRegistry.ts`, a direct-import registry of the same ~120 curated icons the picker already showed by default. Search is now exhaustive over the curated set instead of truncated over the full one. The `lucide-icons` JS chunk dropped from 1.14 MB to 62 KB gzipped as a result.
- **Local storage folder setting moved.** The folder picker (Browse / Set folder / Use default, WSL notice) now lives in Settings → Account instead of its own panel in the vault lobby; changing it there refreshes the lobby's vault list.
- **Lobby header condensed.** The "Total storage used" panel is gone; its numbers (bytes used, vault count, attached files) now sit inline next to the "Your Vaults" heading in the same row.
- **Desktop window has a minimum size.** 1024×720, set above the app's own 768px mobile-layout breakpoint so the window can no longer be resized into a state that accidentally triggers the phone UI.
- Password fields on the local unlock and create-profile screens (`LocalUnlockPage.tsx`) now have a show/hide eye-toggle, matching the convention used elsewhere.

### Fixed
- **Local password change re-enabled.** `PasswordRotationForm.tsx`'s `ROTATION_ENABLED` flag was off repository-wide (see 0.3.24's follow-up) against a real risk in the hosted product: there, an attachment's own key is wrapped directly by the master key, and rotation never re-wrapped it, so a hosted rotation would silently make every attachment undecryptable. That risk does not exist in this build — every call site of that master-key attachment wrapping is gated behind `isLocalMode`, which is unconditionally `true` here, and a local attachment is stored as inline base64 inside the mind-map tree, protected by the vault's KEM-derived key, which rotation never touches (confirmed on the Rust side too: `apply_local_password_rotation` only rewrites the profile file and the vault title index, never a vault blob). Change password is available again from Settings → Account.

### Security
- **DevTools closed in built apps.** `desktop/src-tauri/Cargo.toml` no longer enables the `devtools` Cargo feature, which had force-enabled DevTools access in release builds — session keys and decrypted content live in the JS heap and were reachable from the console in a shipped app. The "Inspect → Open WebView Devtools" menu and its handler in `lib.rs` are now `#[cfg(debug_assertions)]`-gated, so they exist in `tauri dev` builds only; a release build has no devtools capability and no menu entry for it at all. Verified clean under both `cargo check` and `cargo check --release`.

### Removed
- **Dead weight from the shared codebase lineage**, none of it reachable in this build:
  - `MobileMindMapEditor.tsx` (857 lines) — a standalone mobile editor superseded by the `isMobile`-conditional rendering already inside `MindMapEditor.tsx`, never imported.
  - `ShortcutsPanel.tsx` and `NodeContextMenu.tsx` — standalone components duplicating logic that lives inline in `MindMapEditor.tsx`; never imported.
  - `MindMapNode.tsx` — an old `@xyflow/react`-based node prototype from before the current hand-rolled SVG canvas. It was the only consumer of `@xyflow/react`, so the dependency is gone too.
  - `EncryptedVaultDialog.tsx` (529 lines) — a cloud attachments/shares modal whose trigger started with `if (isLocalMode) return`, so it could never open in this build.
  - The dead wiring that fed it in `EditorPage.tsx` (333 lines net removed): the version-history restore path (`loadVersion`, `handleDeleteVersion` — `onShowHistory` had no button anywhere to trigger it) and the share/upload handlers (`handleUploadFiles`, `handleDownloadAttachment`, `handleDeleteAttachment`, `handleAssignAttachmentNode`, `handleCopyShareUrl`, `handleRevokeShare`, `handleCreateShare`) that existed only to feed the removed dialog. The shared, genuinely dual-mode functions (`refreshSecureData`, `uploadEncryptedNodeFiles`, the node-attachment handlers, `load()`, `handleSave()`) were left untouched — they carry real local logic alongside the unreachable cloud branches, and keeping that structure is what makes future ports from the server/SaaS builds a diff instead of a rewrite.

### Validation
- `tsc --noEmit`, `vite build`, `vitest run` (38/38) — clean throughout.
- `cargo check` and `cargo check --release` in `desktop/src-tauri` — clean, no warnings.
- Verified live in `tauri dev` on macOS.

## [0.3.33] - 2026-08-08

Release-tooling fix. No application code changed — the desktop binaries built
from this tag are identical to what 0.3.32 would have produced.

### Fixed
- **Releases published from a draft never built the desktop apps** — `.github/workflows/desktop-build.yml` triggered on `release: types: [created]`, but GitHub does not fire the release `created` event for draft releases, and the web UI saves a new release as a draft by default. Publishing the draft fires `published`/`released`, so the workflow never matched and v0.3.28 through v0.3.32 shipped with no attached artifacts. The trigger is now `types: [published]`, which fires both when a release is published directly and when a draft is published. `[created, published]` was deliberately not used — publishing a release directly fires both, which would run every build twice.

### Added
- **Manual release build** — `workflow_dispatch` with a required `tag` input, so an existing release can be (re)built and have its assets attached without cutting a new one. Two supporting changes were needed for it to work: a workflow-level `RELEASE_TAG` resolving `github.event.release.tag_name || github.event.inputs.tag`, because the three upload steps referenced a context that does not exist on a manual run; and `ref: ${{ env.RELEASE_TAG }}` on all three `actions/checkout` steps, which would otherwise check out the default branch and build the wrong commit.

## [0.3.32] - 2026-08-08

### Added
- **Obsidian-style note editor** — node notes are now written on a single surface with live preview: Markdown renders in place as you type, and the raw syntax is revealed only on the element the caret is inside. Replaces the previous 50/50 split of a raw textarea beside a read-only HTML preview.
  - New `frontend_app/src/components/notes/liveMarkdown.ts` — a CodeMirror 6 `ViewPlugin` that walks the syntax tree and hides syntax markers unless a selection range overlaps the enclosing element. Handles headings, bold, italic, strikethrough, inline code, fenced code, blockquotes, links, horizontal rules, list markers, task checkboxes (clickable, editing the source) and inline images.
  - New `frontend_app/src/components/notes/NoteEditor.tsx` — deliberately uncontrolled: the view owns the document and reports upward. Feeding the value back on each keystroke would fight the caret. Exposes a `NoteEditorHandle` (`focus` / `refresh` / `getValue` / `editSelection` / `prefixLines` / `insertBlock`).
  - New `frontend_app/src/components/notes/markdownEditing.ts` — Enter continues lists, task lists and quotes (and clears an empty marker instead of adding another); Tab/Shift+Tab indent by two spaces; `Mod-b`, `Mod-i`, `Mod-k` wrap or unwrap the selection.
  - Adds `@codemirror/state`, `view`, `language`, `lang-markdown` and `commands`. `markdown({ base: markdownLanguage })` is required, not the default CommonMark base — task lists and strikethrough are GFM extensions. The editor is `React.lazy`-loaded, so CodeMirror (176 KB gz) forms its own chunk and `EditorPage` stays at 42 KB gz.
  - `attachment://` image targets resolve through a host-supplied callback to the decrypted blob URL, so images embedded in notes render inline in the editor rather than as raw link syntax.
- **Local Linux packaging via a container** — `scripts/linux-build.Dockerfile` plus `pnpm run build:linux` (host arch) and `pnpm run build:linux:x64`, mirroring the `desktop-linux` CI job. Tauri cannot cross-compile to Linux because the build links against webkit2gtk and GTK, so an AppImage has to be produced on Linux; this makes that possible from a macOS or Windows workstation. Documented in `README.md` with the host dependency list and a warning that the x86_64 variant runs under emulation on Apple Silicon.

### Changed
- **Notes autosave** — the note commits ~600 ms after typing stops and again on close. The `Save notes` and `Cancel` buttons are gone, and Escape now closes *and* saves; previously it discarded everything since the dialog opened.
- **Notes dialog is a writing surface, not a form** — node labels and attachments moved into a collapsed **Details** disclosure at the foot, the markdown cheat-sheet panel was dropped (the formatting is now visible as you type), and a **Write / Read** toggle replaces the permanent second pane. The text fills the dialog width instead of a 760 px centred column, and the dialog itself grew from `min(1080px, …)` to `min(1400px, …)`.
- **Note editing goes through an imperative handle** — `notesRef` was an `HTMLTextAreaElement` used in five places for `selectionStart`/`selectionEnd` arithmetic. CodeMirror owns its selection, so `editNotesSelection`, `prefixNotesLines` and the attachment uploader now call `NoteEditorHandle` instead. This surfaced a latent bug: attachment insertion read `notesText`, which lags a render behind while typing and is stale across the async upload — it now reads the live document via `getValue()`.
- **Removed with the split view** — `.mm-notes-split`, `.mm-notes-editor-pane`, `.mm-notes-preview-pane`, `.mm-notes-footer`, `.mm-notes-textarea`, `.mm-notes-md-help` and the `.mm-notes-node-preview*` strip.

### Known Limitations
- Live preview covers the common Markdown constructs; nested emphasis, tables and footnotes still show raw syntax.
- Each autosave is a `mutate`, so a long note leaves several entries in the canvas undo history.
- `MobileMindMapEditor` keeps its own plain `<textarea>` for notes and is unchanged by this work.

### Validation
- `pnpm --dir frontend_app test` → 38/38 (22 new: 19 covering the live-preview decorations and markdown editing behaviours, 3 covering the Read/Write round trip).
- The Read/Write tests were confirmed to fail against the pre-fix code before being kept — an early revision unmounted the editor in Read mode, which re-seeded the document from the open-time text and discarded intervening edits.
- `pnpm build:app`, `node scripts/check_foss_saas_residue.mjs`, `node scripts/check_frontend_offline_parity.mjs` → all pass.
- macOS desktop bundle rebuilt, installed and launched.

## [0.3.31] - 2026-08-06

Ports the desktop-relevant frontend work from the SaaS app into the FOSS build. Cloud-only functionality (accounts, plans, sharing, sync, PWA/offline queue, telemetry) was deliberately left behind — see "Not migrated" below.

### Added
- **FreePlane import** — `frontend_app/src/utils/freemindImport.ts` now handles FreePlane `.mm` files alongside FreeMind. Reads node text from `<richcontent TYPE="NODE">` children and from HTML-document `TEXT` attributes, falls back to `BACKGROUND_COLOR` when `COLOR` is absent, scopes the root lookup to `map > node` so FreePlane's `<hook>`/`<attribute>`/`<edge>` siblings are skipped, and reports the detected format in parse errors.
- **FreePlane export** — new `frontend_app/src/utils/freeplaneExport.ts`; "FreePlane (.mm)" added to the editor export menu.
- **WiseMapping import/export** — new `frontend_app/src/utils/wisemappingImport.ts` and `wisemappingExport.ts` for `.wxml`.
- **XMind import/export** — new `frontend_app/src/utils/xmindImport.ts` and `xmindExport.ts` for `.xmind`. Import supports both XMind Zen / 2020+ (`content.json`) and XMind 8 and earlier (`content.xml`). Adds the `fflate` dependency (MIT, pure JS, no network) for ZIP handling; both modules are dynamically imported so the decoder stays out of the main bundle.
- **Native save-dialog filters for the new formats** — `frontend_app/src/utils/download.ts` gained `.mm`, `.wxml` and `.xmind` entries, so the Tauri save dialog labels them correctly.
- **Vault search** — filter the vault list by title, note or label, with a result count and a dedicated no-match state.
- **Grid / table view toggle** — the vault lobby can now render as a compact table (thumbnail, name, labels, updated date, node count, actions). The choice is persisted in `localStorage` under `mmv-lobby-view`.
- **Unified Import dropdown** — the separate "Import .md" and "Import .mm" buttons are replaced by one **Import ▾** menu listing Markdown, FreeMind, FreePlane, WiseMapping and XMind.
- **Settings hub** — new `frontend_app/src/components/SettingsModal.tsx`, a tabbed modal (Account / What's New / Appearance) opened from the gear icon, replacing the old `ThemePanel` dropdown. Account holds the local profile, the auto-logout setting and the password-rotation form; Appearance holds theme, accent colour, autosave and the credits/version block.
- **In-app changelog** — new `frontend_app/src/changelog.ts` drives the "What's New" tab. `APP_VERSION` must stay equal to `frontend_app/package.json`'s `version` and to `CHANGELOG[0].version`.
- **Dark/light toggle in the editor toolbar** — previously only available on mobile.
- **Audio attachments** — audio files attached to a node now open in an inline `<audio>` player in the attachment preview modal, and show a microphone icon in the notes attachment list instead of a generic FILE tile.
- **Obsidian markdown import upgrades** — task-list items (`- [ ]` / `- [x]`) now set the node's `checked` field; embedded images resolve to their alt text; `==highlights==`, `#tags` and HTML comments are stripped; Obsidian callouts (`> [!note] Title`) drop the callout marker; and both 2-space and 4-space (tab) list indentation are recognised.

### Changed
- **Vault card preview is clickable** — the preview image opens the vault directly, with a hover opacity cue. The nested frame/shell wrappers around it were removed, leaving a single rounded container instead of three stacked bordered rectangles.
- **Vault list header is icon-only** — the settings gear and lock/log-out buttons lost their text labels; "Change password" moved into the settings modal's Account tab. The `/change-password` route still works and is now a thin wrapper.
- **Empty state has actions** — "No vaults yet" now offers "Create your first vault" and "Import an existing file" buttons.
- **Editor toolbar wraps** — nav (back, save, title, version) and the action-icon row are now separate flex children (`.mm-toolbar-nav`), so the icons wrap onto their own row in narrow windows instead of overflowing.
- **Password rotation extracted** — `frontend_app/src/components/PasswordRotationForm.tsx` now holds the rotation logic, shared by `ChangePasswordPage` and the settings modal.
- **Node attachment thumbnails** — images without a separately generated `preview_attachment_id` now render a thumbnail from their own `attachment_id`. `EditorPage` already supported this in both local and remote paths; only the editor-side gate was blocking it.

### Fixed
- **PNG and PDF exports came out empty (background and watermark only)** — `renderSvgToCanvas` serialized the live `<svg class="mm-canvas">` into a `data:` URI, but that element is sized purely by CSS (`width/height: 100%`) and carries no `width`, `height` or `viewBox` attribute. In a standalone SVG image none of that CSS applies, so the image had no intrinsic size and rasterized at the SVG default of 300×150; a centred mind map sits well outside that box and was cropped away entirely. `img.onload` still fired and `drawImage` still ran, so there was no error to report — only a blank page. The clone is now stamped with the measured viewport `width`/`height` (plus a matching `viewBox` when absent) before serialization. Verified against WKWebView directly: an element at (400, 300) draws nothing without the attributes and draws correctly with them. `utils/vaultPreview.ts` was unaffected because it already emits explicit dimensions, which is why vault card previews always rendered.
- **PNG, PDF, Markdown and mind-map file exports silently did nothing on macOS** — the save dialog appeared, but no file was ever written. `downloadBlob` wrote the chosen path with the JS `fs` plugin's `writeFile`, and the app's fs capability grants only `fs:allow-app-write-recursive`, whose scope is `$APPDATA`/`$APPLOCALDATA`/`$APPCONFIG`/`$APPCACHE`/`$APPLOG` — so a path like `~/Downloads/map.png` was rejected as forbidden. The rejection was swallowed by a `catch` that fell through to an `<a download>` blob URL, which is a no-op in WKWebView; on Windows the same fallback happens to work because WebView2 is Chromium, which is why this only showed up on macOS. Exports now write through a new `save_export_file` Tauri command (Rust is not subject to the webview ACL, so the fs scope stays tight rather than being widened to the user's home directory), and desktop failures propagate to the existing error toasts instead of being hidden. The encrypted `.cmvault` export was unaffected — it already wrote via Rust.
- **Editing one vault re-rendered and re-fetched every other vault** — the preview and share-count effects held direct references to the `maps` state array, so any draft mutation (colour, note, labels, max versions) produced a new array reference and re-fired every effect. They now key off a derived `mapMetaKey` that only changes on vault identity or server-persisted `updated_at`, and read the current array through a ref.
- **Local-mode previews ignored theme changes** — the cached-preview effect used `themeMode` but did not list it as a dependency, so switching theme left the previous theme's previews on screen until the next reload.
- **Ctrl+scroll zoom also scrolled the page** — React attaches wheel handlers passively, making `preventDefault()` a no-op. The canvas now binds `wheel` natively with `{ passive: false }`.
- **Vault previews of maps with collapsed branches** — `renderTreeSvgSync` indexed `layout[...]` for nodes omitted by `layoutTree` when their parent is folded, producing a crash or mis-drawn connectors. Both parent and child lookups are now guarded.
- **PDF export drew a stray line and leaked canvas state** — `drawProjectLogoMark` had lost its `ctx.save()` and `ctx.beginPath()`, so the logo's outer circle joined whatever path was open and the function's `ctx.restore()` popped state pushed by its caller (3 saves against 4 restores).
- **Table-view tooltip was clipped** — the label/note hover tooltip renders through a React portal at `document.body` with `position: fixed`, so it is no longer trapped by the table wrapper's `overflow: hidden`.
- **Export filenames picked up the day of the month as a fake version** — local mode has no server-side version history, so the version label falls back to a formatted date (`v 6. 8. 2026`). `buildExportFileBaseName` matched that with an unanchored `/v\s*(\d+)/i`, read the leading `v 6` as version 6, and exported `MyMap` as `MyMap-v6.png`. The match is now anchored to the whole label, so only a genuine sequential label (`v12`) contributes a token and date labels contribute none. The date is still shown in the on-canvas watermark, where it belongs.
- **Export filenames doubled the version token** — a vault titled `guide-v3` at version `v3` produced `guide-v3-v3`.

### Not migrated (SaaS-only, intentionally excluded)
Accounts and auth (`api/auth.ts`, `api/account.ts`, Login/Register/Landing/Mode/Shared/Project pages), plans and payments (`api/subscription.ts`, `SubscriptionDialog`, the plan-upgrade wording in `utils/planErrors.ts`), `api/feedback.ts` and `FeedbackWidget`, `NotificationsPanel`, `SyncedDefaultsPanel`, Cloudflare Turnstile, the PWA service worker and offline sync queue (`storage/offline.ts`, `storage/idb.ts`, `storage/server.ts`, `OfflineBanner`, `PwaInstallButton`), Cloudflare Pages deploy config, and the detective-board and onboarding-tour features. The SaaS curated lucide icon registry was also skipped — the FOSS build already ships the full dynamic icon set.

## [0.3.30] - 2026-08-06

### Added
- **macOS desktop support (universal binary)** — the desktop app now builds and ships for macOS alongside Windows and Linux.
  - Added `dmg` to `bundle.targets` and a `bundle.macOS` block in `desktop/src-tauri/tauri.conf.json` with `minimumSystemVersion: "10.15"` (Tauri v2's supported floor).
  - Added a `desktop-macos` job to `.github/workflows/desktop-build.yml` running on `macos-14`, building `--target universal-apple-darwin` so a single DMG runs natively on both Apple Silicon and Intel Macs. Both Rust targets (`aarch64-apple-darwin`, `x86_64-apple-darwin`) are installed via `dtolnay/rust-toolchain`.
  - Added a "Verify universal binary slices" CI step asserting via `lipo` that both `arm64` and `x86_64` slices are present, plus a `codesign` assertion that the binary carries an ad-hoc signature (Apple Silicon refuses to execute unsigned arm64 binaries at the kernel level).
  - Documented macOS build output, the universal build command, and the Gatekeeper quarantine workaround in `README.md` and `docs/PROJECT_STRUCTURE_AND_BUILD.md`.
- **Clickable vault preview (card view)** — the preview image in card view is now a clickable button that navigates directly into the vault. Shows a subtle hover opacity to signal interactivity.

### Changed
- **React 19 upgrade** — moved `react` and `react-dom` from 18.3.1 to 19.2.8 across `frontend_app`, `demo`, and `mobile-demo`, with `@types/react` 19.2.18 and `@types/react-dom` 19.2.4. Required source changes for React 19's type breakages:
  - The global `JSX` namespace was removed; added `import type { JSX } from 'react'` in `frontend_app/src/components/MindMapEditor.tsx` and `frontend_app/src/app-core/connectors/provider.tsx`.
  - `useRef` now requires an initial argument — `frontend_app/src/components/MindMapIconPicker.tsx`.
  - `useRef<T>(null)` now returns `RefObject<T | null>`; widened the `notesRef` and `notesAttachmentInputRef` prop types in `frontend_app/src/components/MindMapNotesDialog.tsx`.
- **React Router 7 upgrade** — `react-router-dom` 6.30.3 → 7.18.2. No source changes required; only unchanged APIs are in use (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `useNavigate`, `useParams`, `useSearchParams`).
- **Vite React plugin** — `@vitejs/plugin-react` 4.7.0 → 5.2.0. Deliberately held at 5.x: v6 hard-requires `vite: ^8.0.0`, which would force the build stack through two additional majors.
- **React ecosystem dependencies** — `@xyflow/react` 12.10.2 → 12.11.2, `lucide-react` 1.14.0 → 1.28.0, `zustand` 5.0.12 → 5.0.14.
- **Tauri upgrade (JS)** — `@tauri-apps/api` 2.11.0 → 2.11.1, `@tauri-apps/cli` 2.11.0 → 2.11.4, `plugin-fs` 2.4.1 → 2.5.1, `plugin-dialog` 2.4.2 → 2.7.2, `plugin-shell` 2.3.2 → 2.3.5.
- **Tauri upgrade (Rust)** — `tauri` 2.11.0 → 2.11.5, `tauri-build` 2.6.0 → 2.6.3, `tauri-plugin-fs` 2.5.0 → 2.5.1, `tauri-plugin-dialog` 2.7.0 → 2.7.2, `wry` 0.55.0 → 0.55.1, `tao` 0.35.0 → 0.35.3.
- **Vault card re-render fix** — eliminated a cascade where editing any single vault's settings (color, note, labels, max versions) caused every vault card to re-render and re-fetch preview images. Root cause: `useEffect` hooks held direct references to the `maps` state array; any draft mutation produced a new array reference, re-firing all effects. Fixed by deriving a stable string key (`mapMetaKey`) that only changes when vault identity or server-persisted `updated_at` changes, and reading the current maps array via a `useRef` (latest-ref pattern) inside effects.
- **Vault preview panel cleanup** — removed nested frame/shell divs that surrounded the preview screenshot in card view, resulting in a single clean rounded container instead of three stacked bordered rectangles.
- **Table view tooltip fix** — the label/note hover tooltip in table view now renders via a React portal at `document.body` with `position: fixed`, ensuring it always appears above the search bar and any other page elements. Previously the tooltip was clipped by the table wrapper's `overflow: hidden` and appeared behind the search input.

### Fixed
- **macOS release checksums used a Linux-only tool** — the macOS CI job called `sha256sum`, which does not exist on macOS runners. Replaced with `shasum -a 256`, and normalised the output to a basename-only entry matching the Windows job instead of embedding the full runner path.
- **macOS DMG artifact lookup pointed at the wrong directory** — the job searched `target/release/bundle` at `-maxdepth 1`, but Tauri writes the DMG to `bundle/dmg/`. The lookup would have failed with "DMG artifact not found" on the first release run. The same incorrect path was documented in `README.md` and has been corrected.

### Removed

### Validation
- `pnpm exec tsc --noEmit` in `frontend_app`, `demo`, and `mobile-demo` → clean.
- `pnpm --dir frontend_app test` (vitest) → 8/8 passing.
- `pnpm build:app`, `pnpm build:demo`, `pnpm build:mobile-demo` → all pass.
- `cargo check` in `desktop/src-tauri` → clean.
- `pnpm install --frozen-lockfile` → passes (lockfile in sync for CI).
- Universal macOS build verified end to end on Apple Silicon:
  - `lipo -archs` → `x86_64 arm64`.
  - `LC_BUILD_VERSION` per slice → x86_64 `minos 10.15`, arm64 `minos 11.0` (linker auto-bumps the arm64 slice, so the 10.15 floor costs nothing on Apple Silicon while retaining Intel reach).
  - `codesign -dv` → `Signature=adhoc` (linker-signed).
  - Built DMG mounted and inspected: contained app is universal, `CFBundleIdentifier=com.mindmapvault.desktop`, `LSMinimumSystemVersion=10.15`.

### Known Limitations
- macOS DMGs are **not** signed with an Apple Developer ID and are **not** notarized. Gatekeeper will block the app on first launch after download; users must run `xattr -dr com.apple.quarantine` on the installed app (documented in `README.md`). Resolving this requires a paid Apple Developer account and CI signing secrets.

## [0.3.29] - 2026-06-05

### Added
- **FreeMind import** — Added "Import .mm" button to the Vaults lobby page (alongside the existing "Import .md" button). Selecting a FreeMind `.mm` file parses the XML in-browser via `DOMParser`, converts it to the internal `MindMapTree` format, and stores it as a new encrypted vault using the existing local storage flow. Handles `TEXT`, `COLOR`, `POSITION`, `FOLDED`, `LINK` attributes and `<richcontent TYPE="NOTE">` note blocks.
  - New file: `frontend_app/src/utils/freemindImport.ts`
- **FreeMind export** — Added "FreeMind (.mm)" option to the editor toolbar export dropdown, directly below "Markdown (.md)". Exports the current in-memory tree to a valid FreeMind 1.0.1 XML file using the existing `downloadBlob` utility (native save dialog on desktop, `<a download>` fallback in browser). Notes are serialised as `<richcontent TYPE="NOTE">` blocks.
  - New file: `frontend_app/src/utils/freemindExport.ts`
  - Files modified: `frontend_app/src/components/MindMapEditor.types.ts`, `frontend_app/src/components/MindMapEditor.tsx`, `frontend_app/src/pages/EditorPage.tsx`, `frontend_app/src/pages/VaultsPage.tsx`

### Validation
- `pnpm exec tsc --noEmit` in `frontend_app` → clean.

## [0.3.28] - 2026-05-26

### Added
- **Connector foundation** - Added shared connector package scaffolding under `packages/connectors/` with exported registry/types/context helper for cross-surface integration.
- **App core split** - Added `frontend_app/src/app-core/` structure with shared app shell and shared editor/vault pages to support connector-first parity with server UI.

### Changed
- **Canonical connector keys** - Enforced canonical capability key typing in connector definitions using explicit unions for:
  - `features.hasFeature(feature)` keys: `realtime-collaboration`, `cloud-version-history`, `public-share-links`, `billing-upgrade`, `admin-controls`
  - `billing.isFeatureEnabled(feature)` keys: `large-exports`, `advanced-attachments`, `team-collaboration`, `admin-controls`
- **FOSS local-only registry behavior** - Updated `frontend_app/src/platform/bootstrap.ts` to return explicit offline-safe defaults (no collaboration, no upgrade flow, no telemetry).
- **FOSS residue compatibility** - Adjusted connector bootstrap wiring to satisfy the SaaS-residue scanner while preserving local-only behavior and connector contract compatibility.
- **Mode hardening** - Locked app mode state to local-only in `frontend_app/src/store/mode.ts` and aligned app shell routing bootstrap accordingly.
- **TypeScript config cleanup** - Removed deprecated `baseUrl` from `frontend_app/tsconfig.json`.
- **Copilot policy alignment** - Added canonical connector-key naming guidance to `.github/copilot-instructions-foss.md`.

### Validation
- `node scripts/check_frontend_offline_parity.mjs --foss-root=. --strict=false` → passed.
- `pnpm --dir frontend_app build` → passed.

## [0.3.27] - 2026-05-03

### Changed
- **Editor UX / Node Icons** - Restored full node icon workflow in `frontend_app/src/components/MindMapEditor.tsx` using the same interaction model as the server variant:
  - Added toolbar icon picker access and context-menu icon action.
  - Added keyboard shortcut `I` to toggle the icon picker, with Escape close behavior parity.
  - Added inline icon rendering on nodes (including bulk multi-select icon toggling).
  - Added shortcuts/help panel entry and status-bar hint for icon actions.
- **Editor Components** - Added reusable icon picker infrastructure in `frontend_app/src/components/MindMapIconPicker.tsx` and `frontend_app/src/components/DynamicLucideIcon.tsx`, plus shared icon constants and picker styling.
- **CI / Release Automation** — Updated `.github/workflows/desktop-build.yml` to modern action/runtime setup for desktop release builds:
  - Upgraded `actions/checkout` to `v5` and `actions/setup-node` to `v5`.
  - Replaced `pnpm/action-setup` with Corepack (`corepack prepare pnpm@10.17.1 --activate`) to reduce Node runtime deprecation noise.
  - Replaced deprecated `actions/upload-release-asset@v1` uploads with `gh release upload ... --clobber` for Linux and Windows artifacts.
  - Kept `$GITHUB_OUTPUT` usage for step outputs (no deprecated `set-output` command usage).

### Validation
- `pnpm exec tsc --noEmit` in `frontend_app` → clean.
- `node scripts/check_frontend_offline_parity.mjs` in repo root → passed.

## [0.3.26] - 2026-05-03

### Changed
- **Desktop UX / Branding** — Updated local unlock screen messaging to make product scope explicit: `MindMapVault FOSS` and `Local-only desktop edition (no cloud)`.
- **Desktop Badge Reliability** — Replaced the remote Tauri badge image URL with a local inline SVG in `DesktopTauriBadge.tsx`, removing CSP-blocked external image fetches and ensuring the badge icon renders offline.
- **Desktop Badge UX** — Restored the official Tauri logo in the login badge using a bundled local asset (`frontend_app/public/tauri-logo.png`) to keep CSP compatibility while preserving expected branding.
- **Desktop Packaging Labeling** — Updated desktop product/window naming in `desktop/src-tauri/tauri.conf.json` to clearly identify the app as the FOSS local-only edition in app/install surfaces.
- **CSP Compatibility** — Expanded `connect-src` in `desktop/src-tauri/tauri.conf.json` to include `http://tauri.localhost` and `https://tauri.localhost`, preventing blocked WebView/devtools metadata requests while preserving restrictive CSP defaults.
- **WASM Runtime Compatibility** — Updated desktop CSP `script-src` to allow WebAssembly compilation used by local crypto paths (`'wasm-unsafe-eval'` and `'unsafe-eval'`), resolving local profile creation failures caused by blocked `WebAssembly.compile()`.

### Validation
- `pnpm exec tsc --noEmit` in `frontend_app` → clean.
- `pnpm build` in `frontend_app` → clean.

## [0.3.25] - 2026-05-03

### Security / Reliability
- **Unlock lockout** — `LocalUnlockPage.tsx` now enforces exponential back-off after failed unlock attempts.
  - First 3 attempts: free, error shows remaining count.
  - After 3rd failure: lockout of 30s → 60s → 120s → 300s (cap), progressing with each additional failure.
  - Lockout state (`attempts`, `lockedUntil` ms timestamp) persisted per-username in `localStorage` (`mmv_lockout_{username}`) so it survives page reloads and app restarts.
  - On successful unlock: lockout record is cleared.
  - UI: password input and button are disabled during lockout; live countdown ticker updates every 500ms.
- **Index file concurrency guard** — All Tauri commands that read or write `index.json` now hold a process-level `Mutex<()>` (stored in Tauri state as `IndexLock`) before doing read-modify-write. Two simultaneous Tauri calls (e.g., `save_local_vault_blob` concurrent with `import_vault_file`) can no longer produce a lost update on the vault index.
- **Vault entry integrity MAC** — Each vault entry in `index.json` now carries an `entry_mac` field: HMAC-SHA256 over the vault's id, `title_encrypted`, `eph_classical_public`, `eph_pq_ciphertext`, and `wrapped_dek`, keyed with a 32-byte `index_mac_key` stored in `index_meta.json` (separate from vault blobs). A new `verify_local_vault_integrity` Tauri command returns `ok | wrong_password | corrupted | tampered` so the frontend can distinguish the failure modes at open time.

### Validation
- `tsc --noEmit` → clean.
- `cargo check` → clean.

## [0.3.24] - 2026-05-07

### Added
- **Security / Feature** — Local password change (key rotation) for desktop mode. Users can now change their unlock password from the Vaults page via the new "Change password" button (local mode only). The rotation:
  - Verifies the current password by attempting AES-GCM decryption of the stored private keys.
  - Derives a new master key with a freshly generated 16-byte Argon2id salt (Argon2id params kept at 64 MiB / 3 iter / p=4).
  - Re-wraps both classical and post-quantum private keys under the new wrap key (`importAesKey(newMasterKey)`).
  - Re-encrypts all vault titles and notes with the new HKDF-derived title key.
  - Increments `key_version` in the profile for auditability.
  - Vault blobs (the mind-map trees) are NOT touched — they are KEM-protected and independent of the master key.
- **Reliability** — Crash-safe two-phase rotation commit in `desktop/src-tauri/src/local_store.rs`:
  - Both the new profile and new vault index are written to `*.rotation-new` temp files before any real file is renamed.
  - The profile is renamed first (committing the new password). The vault index is renamed second.
  - A crash between the two renames is detected and healed by `recover_interrupted_rotation()`, called automatically from `migrate_if_needed()` on every startup.
- `frontend_app/src/crypto/keyRotation.ts` — new standalone crypto module exposing `buildPasswordRotationBundle`. No server contact required.
- `frontend_app/src/pages/ChangePasswordPage.tsx` — new page with progress states, per-field validation, and a distinct error message for wrong-password failures.
- `apply_local_password_rotation` Tauri command registered in `desktop/src-tauri/src/lib.rs`.

### Validation
- 8 vitest unit tests added in `frontend_app/src/crypto/__tests__/keyRotation.test.ts`. All pass.
- Tests cover: incremented key_version, new salt, private-key recovery with new password, title re-encryption with new key, old key rejection, note re-encryption, null note passthrough.

## [0.3.23] - 2026-05-04

### Changed
- **Security** — Added `deriveAttachmentWrapKey` to `frontend_app/src/crypto/kdf.ts`. New function derives a domain-separated 32-byte AES-GCM key via `HKDF-SHA256(master_key, info="crypt-mind-attachment-wrap-v1")`. New attachment encryptions (`encryptAttachmentForOwner`) now use this key and record `key_wrap: 'hkdf-attachment-v1'` in their metadata, ending the dual-role use of raw master key bytes for both HKDF IKM and direct AES-GCM encryption.
- **Security** — `decryptAttachmentForOwner` branches on `encryptionMeta.key_wrap`: records tagged `'hkdf-attachment-v1'` use `deriveAttachmentWrapKey`; older records tagged `'master-aes-256-gcm'` fall back to `deriveMasterAesKey` for backward compatibility. Existing encrypted attachments are unaffected.
- **Security** — `deriveShareKey` default `parallelism` raised from `1` to `4` to match `DEFAULT_ARGON2_PARAMS` (`p_cost: 4`). Share bundles store their Argon2id parameters in `encryptionMeta`, so existing share bundles decrypt using their stored value and are unaffected.
- `deriveMasterAesKey` comment updated to explicitly mark it as backward-compat-only for older attachment records and for unlock-flow private-key wrapping (migration of the latter is a documented follow-up).

### Validation
- TypeScript type-check (`tsc --noEmit`) in `frontend_app` - 2026-05-03

### Fixed
- **Reliability** — Eliminated a crash-window data-loss bug in `write_bytes_atomic` (`desktop/src-tauri/src/local_store.rs`). The previous implementation deleted the target file before renaming the temp file into place; a crash or power loss in that gap permanently destroyed the data. The fix removes the explicit `remove_file` entirely. `std::fs::rename` calls `rename(2)` on POSIX (atomic replace) and `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING` on Windows — both replace the destination in a single step without a separate delete. A temp-file cleanup on rename error is now also handled explicitly.

### Validation
- `cargo check` in `desktop/src-tauri`

## [0.3.21] - 2026-05-03

### Changed
- **Security** — Added `validate_username` in `desktop/src-tauri/src/local_store.rs` to reject usernames containing path-separator characters (`/`, `\`, `..`, null byte). Previously a crafted username could escape the intended per-user storage directory (path traversal). The fix validates the username in both `local_dir` and `profile_path_for` and returns `LocalStoreError::InvalidUsername` on rejection.
- **Security** — Replaced `"csp": null` with an explicit Content Security Policy in `desktop/src-tauri/tauri.conf.json`. The policy restricts scripts to `'self'`, blocks inline script injection, and limits `connect-src` to Tauri IPC. This prevents a malicious vault file from executing injected JavaScript inside the WebView with access to all Tauri invoke commands.
- **Transparency** — Added an explanatory comment in `desktop/src-tauri/src/lib.rs` above the DevTools menu constant documenting that always-on DevTools is an intentional transparency design decision, along with the accepted risk (session keys reachable from the console) and its rationale.

### Validation
- `cargo check` in `desktop/src-tauri`
- `node scripts/check_foss_saas_residue.mjs`
- `node scripts/check_frontend_offline_parity.mjs`

## [0.3.20] - 2026-05-03

### Added
- Added FOSS SaaS residue guard script: `scripts/check_foss_saas_residue.mjs`.
- Extended frontend offline parity check to invoke FOSS residue guard automatically.
- Added a desktop `Inspect` menu entry with `CmdOrCtrl+Shift+I` so packaged FOSS builds can open WebView devtools for network and privacy inspection.

### Changed
- Hardened FOSS API layer to offline-only behavior by removing live server HTTP request paths from:
  - `frontend_app/src/api/client.ts`
  - `frontend_app/src/api/encryptedVault.ts`
- FOSS now fails checks if server/SaaS residue patterns are detected in frontend source.
- Enabled the Tauri `devtools` feature for desktop release builds and bumped the FOSS release to `0.3.20` / `0.3.20-oss`.

### Removed

### Validation
- `cargo check` in `desktop/src-tauri`
- `node scripts/check_foss_saas_residue.mjs`
- `node scripts/check_frontend_offline_parity.mjs`
- `pnpm --dir frontend_app build`

## [0.3.19] - 2026-05-01

### Fixed
- Fixed desktop release workflow startup failure on Linux and Windows where `actions/setup-node` with `cache: pnpm` executed before pnpm was available in PATH.
- Reordered workflow setup steps so `pnpm/action-setup` runs before `actions/setup-node` in both desktop jobs.
- File modified: `.github/workflows/desktop-build.yml`

### Validation
- Frontend build passes locally: `pnpm --dir frontend_app build`

## [0.3.18] - 2026-05-01

### Changed
- Updated GitHub Actions desktop release workflow to opt JavaScript-based actions into Node 24 runtime ahead of Node 20 removal by setting:
  - `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`
- This addresses deprecation warnings for action runtimes in desktop Linux/Windows release jobs.
- File modified: `.github/workflows/desktop-build.yml`

### Validation
- Frontend build passes locally: `pnpm --dir frontend_app build`

## [0.3.17] - 2026-05-01

### Fixed
- Fixed desktop release workflow checksum steps failing on both Linux and Windows due to hardcoded binary names (`MindMapVault` / `MindMapVault.exe`) that no longer match produced artifacts.
- Checksum generation now hashes the discovered release artifacts from prior find steps instead of fixed filenames.
- Updated checksum upload steps to use dynamic checksum paths from workflow outputs.
- File modified: `.github/workflows/desktop-build.yml`

### Changed
- Optimized CI build performance by enabling:
  - pnpm dependency cache via `actions/setup-node` cache settings
  - Rust build cache via `Swatinem/rust-cache`
- File modified: `.github/workflows/desktop-build.yml`

### Validation
- Frontend build passes locally: `pnpm --dir frontend_app build`

## [0.3.16] - 2026-05-01

### Added
- Added in-app attachment preview dialog in the editor notes workflow:
  - Supports image previews (`image/*`, including PNG/JPG).
  - Supports PDF previews (`application/pdf`).
  - Includes direct download action from the preview dialog.
  - Files modified: `frontend_app/src/components/MindMapEditor.tsx`, `frontend_app/src/components/MindMapEditor.css`, `frontend_app/src/components/MindMapEditor.types.ts`, `frontend_app/src/pages/EditorPage.tsx`

### Changed
- Improved external URL opening behavior in desktop runtime:
  - Node URL links now route through Tauri shell plugin path (with browser fallback), replacing fragile `window.open`-only behavior.
  - Notes markdown preview links and hover-preview links now use the same external-open helper.
  - Files modified: `frontend_app/src/utils/openExternal.ts`, `frontend_app/src/components/MindMapEditor.tsx`, `frontend_app/src/components/MindMapNotesDialog.tsx`

- Improved attachment save/open reliability in desktop runtime:
  - Unified attachment save path to use shared desktop-aware downloader (`downloadBlob`) instead of raw anchor/object-URL click.
  - Added editor callback for fetching decrypted attachment content for preview rendering.
  - Files modified: `frontend_app/src/pages/EditorPage.tsx`, `frontend_app/src/utils/download.ts`

### Fixed
- Fixed attachment preview dialog layering issue where it appeared behind the notes modal:
  - Added dedicated overlay stacking class for attachment preview.
  - Raised preview modal z-index above notes modal.
  - Files modified: `frontend_app/src/components/MindMapEditor.tsx`, `frontend_app/src/components/MindMapEditor.css`

### Validation
- Frontend build passes: `pnpm --dir frontend_app build`
- Desktop/Tauri build passes: `pnpm --dir frontend_app tauri:build`

## [0.3.15] - 2026-05-01

### Fixed
- Improve export reliability for PNG and PDF exports in the editor:
  - Set `crossOrigin='anonymous'` on the intermediate Image used to rasterize SVGs before canvas drawing.
  - Added a `canvas.toDataURL()` fallback when `canvas.toBlob()` does not yield a blob (improves download reliability across runtimes).
  - Ensures exported images include the themed background and watermark.
  - Files modified: `frontend_app/src/utils/pdfExport.ts`, `frontend_app/src/components/MindMapEditor.tsx`

### Validation
- Built frontend and verified no TypeScript or bundling errors (`pnpm --dir frontend_app build`).

## [0.3.14] - 2026-05-01

### Added
- Initial migration plan and governance for standalone FOSS desktop scope:
  - `MIGRATION_PLAN.md`
  - `PROJECT_RULES.md`
  - `AWESOME_PRIVACY_READINESS.md`

### Changed
- Bootstrapped `mindmapvault-foss` from desktop/local surfaces of `crypt-min-oss`:
  - copied `frontend_app`, `desktop`, and supporting scripts/workspace configs
  - excluded dependency/build artifacts (`node_modules`, `dist`, tauri `target`)
- Enforced local-only app behavior in runtime:
  - local-only default route and protected route behavior
  - storage factory now resolves to local adapter only
  - mode store now defaults to local and coerces server mode back to local
- Removed cloud sign-in entrypoint from local unlock flow.
- Removed cloud subscription/checkout UI hooks from vault and editor pages.
- Updated README to standalone/local-only project positioning.

### Removed
- Deleted cloud/auth/subscription surfaces no longer used in standalone scope:
  - `frontend_app/src/pages/LoginPage.tsx`
  - `frontend_app/src/pages/RegisterPage.tsx`
  - `frontend_app/src/pages/ModePage.tsx`
  - `frontend_app/src/pages/SharedVaultPage.tsx`
  - `frontend_app/src/components/CloudAccountPanel.tsx`
  - `frontend_app/src/components/SubscriptionDialog.tsx`
  - `frontend_app/src/turnstile.ts`
  - `frontend_app/src/api/auth.ts`
  - `frontend_app/src/api/account.ts`
  - `frontend_app/src/api/subscription.ts`

### Validation
- Frontend build passes after migration cleanup:
  - `pnpm --dir frontend_app build`


