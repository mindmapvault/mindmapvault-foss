# Changelog

All notable changes to this repository are documented here.

The format is based on Keep a Changelog and this project follows Semantic Versioning.

## [Unreleased]

### Added

### Changed

### Removed

### Validation

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


