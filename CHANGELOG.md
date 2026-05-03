# Changelog

All notable changes to this repository are documented here.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

### Changed

### Removed

### Validation

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


