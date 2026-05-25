#!/usr/bin/env bash
set -euo pipefail

MODE="validate"
if [[ $# -gt 0 ]]; then
  MODE="$1"
fi

if [[ "$MODE" != "validate" && "$MODE" != "dev" && "$MODE" != "build" ]]; then
  echo "Usage: $0 [validate|dev|build]" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  local label="$1"
  shift
  echo
  echo "==> $label"
  "$@"
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Required command '$name' is not available in PATH." >&2
    exit 3
  fi
}

major_version() {
  local version_text="$1"
  if [[ "$version_text" =~ ([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo "Could not parse version from '$version_text'." >&2
    exit 4
  fi
}

echo "MindMapVault FOSS desktop setup"
echo "Repository root: $ROOT_DIR"
echo "Mode: $MODE"

require_cmd node
require_cmd pnpm
require_cmd rustc
require_cmd cargo

echo
echo "==> Checking tool versions"
NODE_VERSION="$(node -v)"
PNPM_VERSION="$(pnpm -v)"
RUSTC_VERSION="$(rustc -V)"
CARGO_VERSION="$(cargo -V)"

NODE_MAJOR="$(major_version "$NODE_VERSION")"
PNPM_MAJOR="$(major_version "$PNPM_VERSION")"

if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20+ is required. Found: $NODE_VERSION" >&2
  exit 5
fi

if (( PNPM_MAJOR < 10 )); then
  echo "pnpm 10+ is required. Found: $PNPM_VERSION" >&2
  exit 6
fi

echo "Node:  $NODE_VERSION"
echo "pnpm:  $PNPM_VERSION"
echo "rustc: $RUSTC_VERSION"
echo "cargo: $CARGO_VERSION"

if ! step "Install frontend dependencies" env CI=true pnpm --dir frontend_app install; then
  echo "Initial dependency install failed. Trying a one-time clean reinstall of node_modules." >&2
  rm -rf node_modules
  echo "Removed root node_modules folder."
  step "Reinstall frontend dependencies" env CI=true pnpm --dir frontend_app install
fi

step "Build frontend" pnpm --dir frontend_app build
step "Validate Tauri toolchain" pnpm --dir frontend_app tauri info

case "$MODE" in
  dev)
    echo
    echo "Setup complete. Starting desktop app in development mode..."
    step "Run desktop app (dev)" pnpm --dir frontend_app tauri:dev
    ;;
  build)
    step "Build desktop artifacts" pnpm --dir frontend_app tauri:build
    echo
    echo "Build complete. Installer output is usually under:"
    echo "desktop/src-tauri/target/release/bundle/"
    ;;
  *)
    echo
    echo "Setup validation complete."
    echo "Next steps:"
    echo "  1) Run dev app:   ./scripts/setup-desktop.sh dev"
    echo "  2) Build bundle:  ./scripts/setup-desktop.sh build"
    ;;
esac
