#!/usr/bin/env bash
set -euo pipefail

# Sync current repository into the native WSL home workspace and run the Linux test workflow there.
# Usage: ./scripts/sync-to-wsl-home-and-run.sh [--skip-tauri] [--skip-build]

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Repo root: $ROOT_DIR"

WSL_HOME=${HOME:-"/home/$(whoami)"}
DEST_DIR="$WSL_HOME/workspaces/crypt-min-oss"

echo "Target WSL workspace: $DEST_DIR"

mkdir -p "$(dirname "$DEST_DIR")"

echo "Syncing files (excluding node_modules, targets, dist, .git)..."
rsync -a --delete \
  --exclude node_modules/ \
  --exclude frontend_app/dist/ \
  --exclude desktop/src-tauri/target/ \
  --exclude target/ \
  --exclude .git/ \
  --exclude tmp/ \
  --exclude .vscode/ \
  "$ROOT_DIR/" "$DEST_DIR/"

echo "Sync complete. Changing to $DEST_DIR and running test workflow."
cd "$DEST_DIR"

# Forward arguments to the linux test workflow script
ARGS=("$@")
./scripts/test-workflow.sh "${ARGS[@]}"
