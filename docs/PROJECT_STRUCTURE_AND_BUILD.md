# Project Structure And Build Guide

This document explains how the repository is organized and how to build the desktop app.

## Top-Level Structure

- frontend_app/
  - React + TypeScript UI
  - editor, local unlock flow, crypto helpers, and app pages
- desktop/src-tauri/
  - Rust Tauri host
  - local storage commands and desktop packaging config
- notes/
  - project documentation and operational notes
- .github/workflows/
  - CI workflows, including desktop artifact builds

## Main Runtime Flow

- The UI runs from frontend_app.
- Tauri embeds that UI inside a native WebView window.
- Filesystem operations and local persistence go through desktop/src-tauri commands.

## Build Prerequisites

- Node.js 20+
- pnpm 10+
- Rust stable toolchain
- Tauri OS dependencies for your platform

## Build Commands

One-command setup (Windows PowerShell):

```powershell
.\scripts\setup-desktop.ps1
```

One-command setup (Linux/macOS/WSL shell):

```bash
bash scripts/setup-desktop.sh
```

Optional modes:

```powershell
.\scripts\setup-desktop.ps1 -Mode dev
.\scripts\setup-desktop.ps1 -Mode build
```

```bash
bash scripts/setup-desktop.sh dev
bash scripts/setup-desktop.sh build
```

These scripts check prerequisites, install dependencies (with one automatic clean reinstall retry), build the frontend, and validate Tauri.

Run these from the repository root.

1. Check toolchain:

```powershell
node -v
pnpm -v
rustc -V
cargo -V
```

2. Install dependencies:

```bash
pnpm --dir frontend_app install
```

3. Build frontend:

```bash
pnpm --dir frontend_app build
```

4. Validate Tauri environment:

```bash
pnpm --dir frontend_app tauri info
```

5. Run desktop app in development:

```bash
pnpm --dir frontend_app tauri:dev
```

6. Build desktop bundles:

```bash
pnpm --dir frontend_app tauri:build
```

## Common Windows Recovery Steps

If dependency install fails with an EACCES error under node_modules:

```powershell
Remove-Item -Recurse -Force node_modules
pnpm --dir frontend_app install
```

If pnpm reports ignored build scripts (for example esbuild), run:

```powershell
pnpm approve-builds
```

Then retry the failed command.

## Desktop Outputs

- Windows: EXE and NSIS installer
- Linux: AppImage

Both outputs are native desktop packages of the same WebView-based app.

## WSL Note For Linux Builds

Linux desktop builds are most reliable when run from a native WSL path, not /mnt/c.

Recommended pattern:

- sync repository to a native WSL folder
- run pnpm install and pnpm --dir frontend_app tauri:build there
