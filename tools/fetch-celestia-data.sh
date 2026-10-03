#!/usr/bin/env bash
# Copies the catalogues the engine reads at runtime into celestia-data/.
#
# Celestia's own source tree does not carry them; they live in the separate
# CelestiaContent repository. Only data/ is copied by default -- pass --all to
# also take the textures, models and extras directories.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${CELESTIA_CONTENT_REPO:-https://github.com/CelestiaProject/CelestiaContent.git}"
CACHE="${CELESTIA_CONTENT_CACHE:-${TMPDIR:-/tmp}/celestia-content}"

if [ ! -d "$CACHE/.git" ]; then
  git clone --filter=blob:none --no-checkout "$REPO" "$CACHE"
  git -C "$CACHE" sparse-checkout init --cone
  git -C "$CACHE" sparse-checkout set \
    data textures models models-extra extras-standard warp
  git -C "$CACHE" checkout
fi

mkdir -p "$ROOT/celestia-data"
cp -R "$CACHE/data/." "$ROOT/celestia-data/"

if [ "${1:-}" = "--all" ]; then
  for dir in textures models models-extra extras-standard; do
    mkdir -p "$ROOT/celestia-data/$dir"
    cp -R "$CACHE/$dir/." "$ROOT/celestia-data/$dir/"
  done
fi

# The browser mounts the textures and models from this list instead of fetching
# them up front; see tools/make-asset-manifest.mjs.
node "$ROOT/tools/make-asset-manifest.mjs" "$ROOT/celestia-data"

echo "celestia-data: $(du -sh "$ROOT/celestia-data" | cut -f1)"
