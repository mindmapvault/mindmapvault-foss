# MindMapVault FOSS - Copilot Instructions

These instructions define how GitHub Copilot should behave in this repository.

## Repository Purpose

MindMapVault FOSS is the full-value privacy-first desktop product:

- fully functional, offline-first, zero-knowledge desktop application
- built with React + TypeScript (`frontend_app/`) and Rust + Tauri (`desktop/src-tauri/`)
- usable as the primary product without requiring any server

MindMapVault FOSS is not a lite edition.

## Product Boundary

This repository owns:

- local vault and local profile behavior
- local encryption, local key handling, local unlock/session rules
- core editor UX and offline workflows

This repository does not own:

- hosted sync/share backend implementation (`mindmapvault-server`)
- enterprise governance stack (`mindmapvault-enterprise-server`)
- marketing canon and project-level strategy docs (`mindmapvault-www`)

## Packaging And Surface Ownership Rules

- Keep `frontend_app/` and `desktop/src-tauri/` centered on offline-first desktop behavior.
- Do not introduce hosted app/admin deployment concerns here.
- Keep cross-repo ownership aligned with `mindmapvault-www/docs/internal/PRODUCT_SURFACE_OWNERSHIP.md`.

## Security and Privacy Rules

Copilot must preserve these non-negotiables:

- no plaintext map payloads or key material sent off-client by default
- no telemetry, analytics, tracking, or hidden API calls
- no plaintext logging of notes, decrypted content, tokens, or secrets
- no dependency additions that introduce hidden network behavior

If a change could affect crypto, unlock, or storage semantics, prefer minimal edits and add focused regression coverage.

## Architecture Rules

Copilot should follow existing boundaries:

- keep crypto operations in `frontend_app/src/crypto/`
- keep local storage behavior in `frontend_app/src/storage/local.ts`
- keep Tauri-local host boundaries in `desktop/src-tauri/`
- avoid introducing server coupling into required desktop workflows

Optional integrations with Server features must be capability-gated and must not break offline-first usage.

## Documentation Rules

- Product and implementation docs for FOSS behavior can live in this repo.
- Canonical cross-product strategy and marketing docs live in `mindmapvault-www/docs/`.
- When a document affects multiple repos, update `mindmapvault-www` first and keep local references concise.

## Release and Version Rules

For user-visible changes in this repo:

- update `CHANGELOG.md`
- bump `frontend_app/package.json` version when needed
- keep desktop versioning aligned in:
  - `desktop/src-tauri/tauri.conf.json`
  - `desktop/src-tauri/Cargo.toml`

## Validation Commands

Use these when relevant to changed files:

- `pnpm --dir frontend_app build`
- `cargo check` in `desktop/src-tauri`
- `node scripts/check_foss_saas_residue.mjs`
- `node scripts/check_frontend_offline_parity.mjs`

Offline parity contract files:

- `frontend_app/offline_capability_contract.json`
- `frontend_app/offline_scan_allowlist.txt`

## Mandatory Per-Iteration Checklist

After each implementation iteration, verify:

1. Scope: changes stay inside FOSS responsibilities.
2. Privacy: no telemetry, no hidden network behavior, no plaintext secret logging.
3. Offline-first: core flow still works with no network.
4. Boundaries: crypto/local-storage/Tauri boundaries are preserved.
5. Documentation: update `CHANGELOG.md`; update cross-product docs in `mindmapvault-www` if needed.
6. Parity: run `node scripts/check_frontend_offline_parity.mjs` and fix contract or policy violations.
7. Residue: run `node scripts/check_foss_saas_residue.mjs` and remove any server/SaaS residue findings from FOSS source.
8. Validation: run relevant build/check commands and address failures.

## Frontend Parity Rules (FOSS vs Server)

- FOSS and Server must keep equal `offlineCoreCapabilities` unless an intentional and documented exception exists in both repos.
- `localOnlyGuarantees` and `mustNotRequireServer` must stay aligned in both repos.
- any change to offline feature behavior must update `frontend_app/offline_capability_contract.json` in both repos in the same task.
- FOSS source under `frontend_app/src/` must pass the offline policy scan (no telemetry, no hidden network endpoints).

## Copilot Never Rules

Copilot must never suggest:

- making server access mandatory for core editing
- adding analytics/tracking/fingerprinting
- embedding secrets or static API keys
- weakening encryption or bypassing unlock/session controls