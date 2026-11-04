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

## macOS Signing and Notarization

`desktop-build.yml` signs the DMG with the Developer ID and notarizes it
when these repository secrets exist, and falls back to an ad-hoc signature
when they do not:

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | base64 of the exported Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the password chosen at export |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: <name> (<team id>)` |
| `APPLE_API_KEY` | App Store Connect API key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |
| `APPLE_API_PRIVATE_KEY` | contents of `AuthKey_<key id>.p8` |

A signed run checks the DMG's app for the Developer ID signature, the
stapled notarization ticket, and Gatekeeper acceptance. The current
Developer ID certificate (G2) expires on 2027-12-02; create a new one on
developer.apple.com and replace the first three secrets before then. Apps
already signed and notarized keep opening after it expires.

## Mac App Store

`mac-app-store.yml` builds a sandboxed copy on each published release and
uploads it to App Store Connect, where it is submitted for review by hand.
It differs from the DMG in three ways, all in `tauri.conf.mas.json`:

- bundle ID `com.mindmapvault.MindMapVaultFOSS` (the DMG keeps
  `com.mindmapvault.desktop`), so its data lives in its own sandbox container;
- `mas/Entitlements.plist`: sandbox, user-chosen files, folder bookmarks,
  microphone, and outgoing network. WebKit needs the last one to show the
  bundled pages; the app itself makes no requests;
- an embedded provisioning profile, written by CI from a secret.

A vault folder the user moves elsewhere is reopened on the next start from a
security-scoped bookmark saved next to its path (`src/scoped_folder.rs`).

| Secret | Value |
|---|---|
| `MAS_APP_CERTIFICATE` | base64 of the Apple Distribution `.p12` |
| `MAS_INSTALLER_CERTIFICATE` | base64 of the Mac Installer Distribution `.p12` |
| `MAS_CERTIFICATE_PASSWORD` | the export password of both `.p12` files |
| `MAS_PROVISION_PROFILE` | base64 of the "Mac App Store Connect" provisioning profile |

The two certificates and the profile expire on 2027-11-03; renew all three and
replace the four secrets before then. The upload reuses the `APPLE_API_*`
secrets from notarization. Every upload
needs a new build number: to re-upload a version, run the workflow by hand
with `build_number` set (for example `0.6.7.1`).

## Store Packages (Snap Store, Microsoft Store, Flathub)

CI (`desktop-build.yml`, on a published GitHub release) builds the setup.exe,
AppImage and DMG. `microsoft-store.yml` builds the MSIX and `snap.yml` the
snap (below), on the same release. Bump
`desktop/snap/snapcraft.yaml` (`version`) and the default `-Version` in
`desktop/msix/build-msix.ps1` with the other version files.

Build the frontend once (`npm run build` in `frontend_app`, after
`pnpm install` so new dependencies are present), then build the desktop
binaries with `beforeBuildCommand` overridden to `""`. Note the entry bundle
name (`index-<hash>.js` in `frontend_app/dist/index.html`) and confirm each
binary embeds it — a stale binary otherwise ships silently.

### Microsoft Store (MSIX)

`microsoft-store.yml` runs on every published release, or by hand with a tag.
It builds the bare exe (`tauri build --no-bundle`), packs it with
`desktop/msix/build-msix.ps1 -NoSign`, attaches
`MindMapVault-FOSS_X.Y.Z.0_x64.msix` to the release and uploads it to Partner
Center, product `9NMNK1P8D7CZ`. The package is unsigned on purpose: the Store
signs what it accepts. The Store needs the four-part version X.Y.Z.0, and each
upload must be higher than the last.

The submission is **committed through the API** and goes straight to
certification. Do not change this to a draft (`--noCommit`) that you submit on
the website: Partner Center only processes a package uploaded through the API
when the API commits the submission, and the website then submits the previous
package instead. That happened with Submission 8 on 2026-11-04. To keep a
human check, set the product's publishing time to manual in Partner Center, so
a certified update waits for a click before it goes live. Without the secrets
below the job still builds and attaches the MSIX, and skips the upload with a
notice.

| Secret | Where it comes from |
|---|---|
| `PARTNER_CENTER_TENANT_ID` | Entra admin center → Overview → Tenant ID |
| `PARTNER_CENTER_CLIENT_ID` | the app registration's Application (client) ID |
| `PARTNER_CENTER_CLIENT_SECRET` | the app registration → Certificates & secrets (expires; renew before it does) |
| `PARTNER_CENTER_SELLER_ID` | Partner Center → Account settings, shown as Seller ID |

The Entra app must be added in Partner Center under Account settings → User
management → Microsoft Entra applications, with the **Manager** role.

To build by hand on Windows instead: `tauri build --no-bundle` (from the Build
Tools dev shell), copy `target/release/MindMapVault-foss.exe` to
`%USERPROFILE%\Downloads\mindmapvault-foss-X.Y.Z-release\MindMapVault-FOSS_X.Y.Z_x64-portable.exe`
and run `desktop/msix/build-msix.ps1 -Version X.Y.Z`. That copy is signed with
the local certificate, for sideloading tests; upload the
`MindMapVault-FOSS_X.Y.Z.0_x64.msix` file.

### Snap Store (`mindmapvault-foss`)

`snap.yml` runs on every published release, or by hand with a tag. On
`ubuntu-24.04` (the same Ubuntu as `base: core24`) it builds the frontend, then
the deb with `tauri.conf.linux.json`, stages it next to `snap/snapcraft.yaml`
in a fresh directory, and packs it with `snapcore/action-build`. It checks the
binary is inside and that no `libwebkit2gtk-4.1.so*` is staged, attaches the
`.snap` to the release, and uploads it to the **candidate** channel. Promote
it to stable on snapcraft.io (Releases), or pick another channel on a manual
run.

The upload needs one secret, `SNAPCRAFT_STORE_CREDENTIALS`, made with

```bash
snapcraft export-login --snaps=mindmapvault-foss --acls=package_access,package_push,package_update,package_release snap-token.txt
```

and pasted from `snap-token.txt`. Without it the job still builds and attaches
the snap and skips the upload. The token expires; `export-login` takes
`--expires` to set when.

To build by hand instead: `tauri build --config tauri.conf.json --config
tauri.conf.linux.json` on Linux, then, as root in a fresh directory holding
`snap/snapcraft.yaml` and the deb as `deb/mindmapvault-foss.deb`,
`snapcraft pack --destructive-mode`. Upload from the home directory (the
snapcraft snap has a private `/tmp`):
`snapcraft upload ~/mindmapvault-foss_X.Y.Z_amd64.snap --release stable`.

### Flathub (`com.mindmapvault.MindMapVaultFOSS`)

Automated. Unlike the snap, Flathub builds from source on its own servers,
offline, so the manifest in `desktop/flatpak/` pins the release tag and lists
every cargo and npm dependency. Nothing in it needs a version bump: the tag
comes from the release and the store's release notes are generated from
`CHANGELOG.md` at build time.

On a published release, `flatpak.yml`:

1. regenerates `cargo-sources.json` and `node-sources.json` from the
   lockfiles (`desktop/flatpak/generate-sources.sh`),
2. builds the Flatpak once to catch breakage early,
3. pushes the manifest, pinned to the tag, plus both lists to a branch of
   `flathub/com.mindmapvault.MindMapVaultFOSS` and opens a PR there.

Flathub's bot test-builds that PR. **Merge it** once the build is green;
that publishes the update, usually within a few hours. If `FLATHUB_TOKEN` is
not set, step 3 is skipped with a notice.

The same workflow test-builds pull requests that touch the manifest or a
lockfile. To resend an existing release, run the workflow by hand with its
tag.

The Flatpak has no network access, like the snap. It does get the home
folder (`--filesystem=home`), because the vault folder can be moved anywhere
and the app reopens that path on every start. Open and save dialogs go
through the file chooser portal.
