# Changelog

All notable changes to this repository are documented here.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

### Changed

### Removed

### Validation

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


