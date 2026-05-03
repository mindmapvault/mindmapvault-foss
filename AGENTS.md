# Agent Guidelines for MindMapVault FOSS

Purpose: Provide concise, privacy-first rules for AI agents working on the FOSS desktop app.

Key links:
- Repo instructions: [.github/copilot-instructions.md](.github/copilot-instructions.md)
- Desktop host: [desktop/src-tauri/](desktop/src-tauri/)
- Frontend app: [frontend_app/](frontend_app/)

Top rules:
- Local-only: do not introduce cloud, telemetry, or remote account features.
- Privacy-first: never suggest logging decrypted content or embedding secrets.
- Keep crypto operations isolated in `frontend_app/src/crypto/` and Tauri host boundaries in `desktop/src-tauri/`.

Testing and release hygiene:
- Run `pnpm --dir frontend_app build` and `cargo check` in `desktop/src-tauri` when making cross-cutting changes.
- Update `CHANGELOG.md` and bump versions per the repository's release rules.
