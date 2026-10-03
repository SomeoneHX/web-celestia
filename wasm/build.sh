#!/usr/bin/env bash
# Builds the Celestia astronomy core to WebAssembly with Emscripten.
#
#   bash wasm/build.sh
#
# Output:
#   src/wasm/celestia_astro.js   ES module glue, loaded by src/wasm/index.ts
#   src/wasm/celestia_astro.wasm compiled module
#
# Requires an activated emsdk (source ~/emsdk/emsdk_env.sh).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/src/wasm"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Activate emsdk first:  source ~/emsdk/emsdk_env.sh" >&2
  exit 1
fi

mkdir -p "$OUT"

em++ "$ROOT/wasm/celestia_astro.cpp" \
  -std=c++20 \
  -O3 \
  -flto \
  -fno-exceptions \
  --bind \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createCelestiaAstro \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s DYNAMIC_EXECUTION=0 \
  -s FILESYSTEM=0 \
  -s SINGLE_FILE=0 \
  -o "$OUT/celestia_astro.js"

echo "built:"
ls -la "$OUT"
