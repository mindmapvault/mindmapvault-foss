# MindMapVault FOSS – Copilot Instructions
These instructions define how GitHub Copilot should behave when assisting inside this repository.
The goal is to keep contributions consistent with the local‑only, privacy‑first, offline‑capable nature of MindMapVault FOSS.

## Project Scope
MindMapVault FOSS is:

- a local‑first, offline‑capable desktop mind‑mapping application
- built with React + TypeScript (frontend) and Rust + Tauri (desktop host)
- designed for encrypted local storage and client‑side key handling
- a standalone FOSS edition with no cloud backend, no telemetry, and no analytics

Copilot should generate code and suggestions that respect this scope.

## Core Principles for Copilot
1. Local‑only behavior
Copilot must not suggest:

- cloud APIs
- remote endpoints
- SaaS integration
- account systems
- subscription logic
- telemetry or analytics libraries
- network requests for core workflows

If a suggestion would introduce network access, Copilot should prefer a local alternative or omit the suggestion.

2. Privacy‑first defaults

Copilot should:
- avoid generating logs that expose decrypted content, secrets, or key material
- avoid suggesting plaintext persistence of sensitive data
- prefer patterns that minimize plaintext exposure in memory
- follow the project’s encryption‑first model

3. Consistency with existing architecture

Copilot should follow:
- the established folder structure (frontend_app/, desktop/src-tauri/, etc.)
- the existing crypto layer (frontend_app/src/crypto/)
- the local storage model (frontend_app/src/storage/local.ts)
- the Tauri host boundaries (desktop/src-tauri/src/local_store.rs)

4. No introduction of new dependencies without clear need

Copilot should avoid suggesting:
- heavy frameworks
- telemetry‑enabled libraries
- network‑centric packages
- unnecessary state management or build tools

Lightweight, auditable, permissive‑license libraries are preferred.

## Coding Style Expectations
- Frontend (React + TypeScript)
- functional components
- Zustand for state management
- Tailwind for styling
- avoid implicit any
- prefer explicit return types for exported functions
- keep crypto operations isolated in the crypto layer

## Desktop (Rust + Tauri)
- follow Rust 2021 idioms
- use Result<T, E> consistently
- avoid panics in storage and crypto paths
- keep file IO explicit and auditable
- avoid unnecessary unsafe blocks

## Security‑Relevant Guidance

Copilot should:
- preserve encrypted‑at‑rest guarantees
- avoid suggesting plaintext logs or debug prints
- avoid generating code that caches decrypted data unnecessarily
- follow the threat boundaries described in SECURITY.md
- keep unlock/session logic isolated and explicit

## Documentation Expectations

When Copilot generates documentation or comments, it should:
- avoid references to cloud features or SaaS versions
- describe local‑only behavior clearly
- keep comments technical and concise
- avoid marketing language

## Release Hygiene (Mandatory)

- After each merged code change, create a new version entry.
- Document the change in `CHANGELOG.md` in the same task.
- Update the application version in `frontend_app/package.json`.
- Keep desktop release versions in sync by updating:
  - `desktop/src-tauri/tauri.conf.json`
  - `desktop/src-tauri/Cargo.toml`
- Do not leave implementation changes without an explicit version/changelog update.

## Testing and Validation

Copilot should generate:
- small, focused tests
- validation scripts consistent with existing ones
- build‑safe changes that pass:
  - `pnpm --dir frontend_app build`
  - `cargo check in desktop/src-tauri`

## What Copilot Should Never Suggest
- telemetry, analytics, tracking, fingerprinting
- cloud sync, remote storage, or online accounts
- sending data to external services
- embedding API keys or secrets
- adding dependencies that introduce network access
- code that weakens encryption or bypasses crypto boundaries

## Summary

Copilot should act as an assistant that:
- respects the local‑only, privacy‑first, encrypted‑by‑default model
- keeps the codebase clean, auditable, and offline
- avoids introducing cloud or telemetry behavior
- follows the architecture and security boundaries defined in this repository