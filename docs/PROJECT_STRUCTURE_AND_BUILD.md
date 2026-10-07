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

## Release Validation

Run these gates before tagging a release. All must pass.

```bash
# Import/export fidelity — two suites. roundTrip.test.ts proves our export →
# our import keeps every field a format claims; compat.test.ts proves files
# written by the real FreeMind / FreePlane / WiseMapping / XMind / Obsidian
# applications import correctly. Blocks the "export loses formatting" and the
# "won't read a real file" classes of bug.
node scripts/check_import_export_roundtrip.mjs

# Full frontend unit suite.
pnpm --dir frontend_app test

# Offline parity with the FOSS capability contract.
node scripts/check_frontend_offline_parity.mjs --foss-root=. --strict=false
```

The round-trip gate is the one to touch when a format learns a new field:
raise that format's fidelity mask in the test and the gate enforces it from
then on.

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
- macOS: DMG (release builds are universal: arm64 + x86_64, macOS 10.15+)

All outputs are native desktop packages of the same WebView-based app.

## WSL Note For Linux Builds

Linux desktop builds are most reliable when run from a native WSL path, not /mnt/c.

Recommended pattern:

- sync repository to a native WSL folder
- run pnpm install and pnpm --dir frontend_app tauri:build there

## Store Packages (Snap Store and Microsoft Store)

CI (`desktop-build.yml`, on a published GitHub release) builds the setup.exe,
AppImage and DMG. It does **not** build the snap or the MSIX; both are made
locally after the release, from the same version. Bump
`desktop/snap/snapcraft.yaml` (`version`) and the default `-Version` in
`desktop/msix/build-msix.ps1` with the other version files.

Build the frontend once (`npm run build` in `frontend_app`, after
`pnpm install` so new dependencies are present), then build the desktop
binaries with `beforeBuildCommand` overridden to `""`. Note the entry bundle
name (`index-<hash>.js` in `frontend_app/dist/index.html`) and confirm each
binary embeds it — a stale binary otherwise ships silently.

### Microsoft Store (MSIX)

1. Windows: `tauri build --no-bundle` (from the Build Tools dev shell), then
   copy `target/release/MindMapVault-foss.exe` to
   `%USERPROFILE%\Downloads\mindmapvault-foss-X.Y.Z-release\MindMapVault-FOSS_X.Y.Z_x64-portable.exe`.
2. `desktop/msix/build-msix.ps1 -Version X.Y.Z` packs and signs it.
3. **The Store needs a four-part version.** Pass the three-part version to
   the script; it writes `Version="X.Y.Z.0"` into the manifest and produces
   two identical files. **Upload `MindMapVault-FOSS_X.Y.Z.0_x64.msix`** in
   Partner Center (product `9NMNK1P8D7CZ`). The three-part copy is for the
   download bucket only.

### Snap Store (`mindmapvault-foss`)

1. Linux (WSL): sync the repo to a native folder and run
   `tauri build --config tauri.conf.json --config tauri.conf.linux.json`.
2. As root, in a **fresh, versioned** directory (destructive mode does not
   re-pull the deb, so a reused directory ships the old binary):
   `snap/snapcraft.yaml` plus the deb as `deb/mindmapvault-foss.deb`, then
   `snapcraft pack --destructive-mode`.
3. Verify: the entry bundle hash is in `prime/usr/bin/MindMapVault-foss`
   (`grep -a -o`), and no `libwebkit2gtk-4.1.so*` is staged under `prime/`.
4. Upload as the logged-in user from their **home directory** — the
   snapcraft snap has a private `/tmp` and reports files there as
   "not a valid file":
   `snapcraft upload ~/mindmapvault-foss_X.Y.Z_amd64.snap --release stable`.
