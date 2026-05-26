# MindMapVault FOSS v0.3.28

This release finalizes the connector-first alignment work while preserving FOSS local-only guarantees.

## Highlights

- Canonical connector capability keys are now enforced through typed unions.
- FOSS connector registry defaults are explicit and offline-safe.
- App mode handling is hardened to local-only behavior.
- Shared app-core structure was introduced to keep UI parity with server surfaces where applicable.
- Release metadata is synchronized across frontend and desktop packaging versions.

## Privacy and Local-Only Guarantees

- No cloud dependency was introduced.
- Unsupported hosted capabilities resolve deterministically to `false`.
- Telemetry connector remains a no-op in FOSS.

## Validation

- `node scripts/check_frontend_offline_parity.mjs --foss-root=. --strict=false` -> passed.
- `pnpm --dir frontend_app build` -> passed.
- `pnpm --dir frontend_app tauri:build` -> passed.

## Artifacts

- Windows app binary: `desktop/src-tauri/target/release/MindMapVault-foss.exe`
- Windows installer: `desktop/src-tauri/target/release/bundle/nsis/MindMapVault FOSS Local-Only_0.3.28-oss_x64-setup.exe`

## Notes

- This release keeps MindMapVault FOSS fully desktop-first and local-only.
- Connector naming stays aligned with Server/SaaS/Enterprise documentation to reduce cross-repo drift.
