#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<EOF
Usage: $0 [--skip-build] [--skip-tauri] [--with-bundle]

Runs a local approximation of the CI "security-and-version-checks" and desktop build steps.

Options:
  --skip-build     Skip frontend build step
  --skip-tauri     Skip native tauri build step
  --with-bundle    Run full tauri build including AppImage bundling (requires linuxdeploy; use in CI or if linuxdeploy is installed)

Default behavior: builds the frontend and the native binary via 'cargo build --release' (no AppImage bundling).
AppImage bundling is handled by CI (GitHub Actions). For WSL local dev this is the correct default.
EOF
}

SKIP_BUILD=0
SKIP_TAURI=0
WITH_BUNDLE=0
while [[ ${#} -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-tauri) SKIP_TAURI=1; shift ;;
    --with-bundle) WITH_BUNDLE=1; shift ;;
    --skip-bundle) echo "Note: --skip-bundle is now the default; flag ignored."; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

echo "Starting local test workflow (root: $ROOT_DIR)"

echo "1) Ensure pnpm is available"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install pnpm (corepack or npm) and retry." >&2
  exit 3
fi

echo "2) Install JavaScript deps"
pnpm install

echo "3) Verify version consistency"
node scripts/version-check.js

echo "4) Frontend dependency audit (prod)"
pnpm --dir frontend_app audit --prod

echo "5) Ensure cargo-audit is installed"
if ! command -v cargo-audit >/dev/null 2>&1; then
  echo "Installing cargo-audit locally (this may take a while)"
  cargo install cargo-audit --locked
fi

echo "6) Run Rust dependency audit"
(cd desktop/src-tauri && cargo audit)

if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "7) Build frontend assets"
  pnpm --dir frontend_app build
else
  echo "Skipping frontend build"
fi

if [[ $SKIP_TAURI -eq 0 ]]; then
  echo "8) Build native app"
  node scripts/prepare-oss-build.js || true
  
  if [[ $WITH_BUNDLE -eq 1 ]]; then
    echo "   Tauri build with full AppImage bundling (requires linuxdeploy)"
    pnpm --dir frontend_app tauri:build
  else
    echo "   Tauri build --no-bundle (binary only; embeds assets correctly without creating AppImage)"
    (cd desktop/src-tauri && npx --prefix ../../frontend_app tauri build --config tauri.conf.json --no-bundle)
  fi
  
  node scripts/restore-oss-build.js || true

  if [[ $WITH_BUNDLE -eq 1 ]]; then
    echo "9) Verify Linux bundle artifact (AppImage)"
    APPIMAGE_PATH=""
    if compgen -G "desktop/src-tauri/target/release/bundle/appimage/*.AppImage" > /dev/null; then
      APPIMAGE_PATH=$(ls -1 desktop/src-tauri/target/release/bundle/appimage/*.AppImage | head -n 1)
    fi

    if [[ -z "$APPIMAGE_PATH" ]]; then
      echo "Expected AppImage artifact was not found under desktop/src-tauri/target/release/bundle/appimage/." >&2
      exit 4
    fi

    echo "AppImage built: $APPIMAGE_PATH"
  else
    echo "9) Verify Linux binary artifact"
    BINARY_PATH="desktop/src-tauri/target/release/MindMapVault"
    if [[ ! -f "$BINARY_PATH" ]]; then
      echo "Expected binary was not found at $BINARY_PATH" >&2
      exit 4
    fi
    echo "Binary built: $BINARY_PATH"
    echo "To test the app in WSL with a display, set DISPLAY and run: $BINARY_PATH"
  fi
else
  echo "Skipping tauri build"
fi

echo "Local test workflow completed. Artifacts (if built):"
echo " - frontend: frontend_app/dist/"
echo " - linux appimage: desktop/src-tauri/target/release/bundle/appimage/*.AppImage"
echo " - bundles: desktop/src-tauri/target/release/bundle/"

exit 0
