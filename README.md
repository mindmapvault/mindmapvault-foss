# MindMapVault FOSS

MindMapVault FOSS is a local-first, privacy-focused desktop mind-mapping application.

All core functionality works offline, all data stays on the device, and the repository contains no cloud code, no telemetry, and no external service dependencies.

## Why This Project

MindMapVault FOSS exists as an auditable desktop implementation with a clear privacy posture.

What this repository provides:

- a React + TypeScript app for authoring and managing mind maps
- a Tauri desktop host for local filesystem integration
- encrypted local vault storage and local profile unlocking
- build and validation scripts suitable for contributors and reviewers

What this repository does not require for core use:

- a hosted backend
- an always-on internet connection
- an account registration flow

## Privacy Highlights

For reviewers (including privacy-list evaluators), the current posture is:

- local-first operation for create, edit, save, open, and export
- no mandatory remote service for core desktop usage
- encrypted-at-rest local vault artifacts
- open repository with inspectable implementation and documentation

Important boundary: this project is a privacy-focused desktop app, not an anonymity system. Endpoint compromise, weak passwords, and unsafe plaintext exports remain user-side risks.

## Architecture Overview

Core components:

1. frontend_app/ - React + TypeScript application and crypto layer
2. desktop/src-tauri/ - Rust desktop host, local storage and migration IO
3. local filesystem storage - per-profile app config/data directories

High-level flow:

1. User selects or creates a local profile.
2. Keys are derived locally from the user secret.
3. Vault metadata and map payloads are persisted as encrypted local artifacts.
4. Decryption occurs on-device while the session is unlocked.

Related technical notes:

- notes/LOCAL_STORAGE_AND_PROFILES.md
- notes/PROJECT_STRUCTURE_AND_BUILD.md

## Security Documentation

Read these together:

- SECURITY.md - technical security policy and threat model
- frontend_app/public/SECURITY.md - user-facing in-app security explainer

## Getting Started

Prerequisites:

- Node.js 20+
- pnpm 10+
- Rust stable toolchain
- platform prerequisites required by Tauri

Install dependencies:

```bash
pnpm install
```

Build frontend:

```bash
pnpm --dir frontend_app build
```

Run desktop app (development):

```bash
pnpm --dir frontend_app tauri:dev
```

Build desktop artifacts:

```bash
pnpm --dir frontend_app tauri:build
```

## Validation

Repository checks:

```bash
node scripts/version-check.js
```

Workflow-style checks on Windows:

```powershell
.\scripts\test-workflow.ps1
```

Workflow-style checks on Linux/WSL/macOS:

```bash
./scripts/test-workflow.sh
```

## Release Outputs

Typical outputs include:

- Windows executable/installer bundles
- Linux AppImage artifacts (when host packaging dependencies are available)

Build workflow configuration lives in .github/workflows/desktop-build.yml.


## Contributing

Please read:

- CONTRIBUTING.md
- CHANGELOG.md
- CREDITS.md

Contribution expectations:

- keep changes focused and reviewable
- preserve local-first privacy guarantees
- avoid hidden telemetry and avoid leaking sensitive data to logs
- document user-visible and security-relevant changes clearly

## License

MindMapVault FOSS is released under the MIT license. See LICENSE for details.
