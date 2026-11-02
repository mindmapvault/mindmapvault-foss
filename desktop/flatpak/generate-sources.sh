#!/usr/bin/env bash
# Regenerate the offline dependency lists the Flatpak build needs:
#   cargo-sources.json  from desktop/src-tauri/Cargo.lock
#   node-sources.json   from pnpm-lock.yaml
# CI runs this on every release. Locally:
#
#   git clone https://github.com/flatpak/flatpak-builder-tools ~/src/fbt
#   python3 -m venv ~/.venvs/fbt
#   ~/.venvs/fbt/bin/pip install ~/src/fbt/node aiohttp PyYAML tomlkit
#   PATH=~/.venvs/fbt/bin:$PATH FLATPAK_BUILDER_TOOLS=~/src/fbt \
#     desktop/flatpak/generate-sources.sh
set -euo pipefail

fbt="${FLATPAK_BUILDER_TOOLS:?set to a flatpak-builder-tools checkout}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

python3 "$fbt/cargo/flatpak-cargo-generator.py" \
  "$root/desktop/src-tauri/Cargo.lock" -o "$here/cargo-sources.json"
flatpak-node-generator pnpm "$root/pnpm-lock.yaml" -o "$here/node-sources.json"

echo "wrote $here/cargo-sources.json and $here/node-sources.json"
