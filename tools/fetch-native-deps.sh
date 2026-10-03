#!/usr/bin/env bash
# Fetches the header-only libraries the WebAssembly build needs into
# native/thirdparty/. Neither is packaged for npm, and both are header only, so
# they are checked out rather than built.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TP="$ROOT/native/thirdparty"
mkdir -p "$TP"

if [ ! -d "$TP/eigen/Eigen" ]; then
  rm -rf "$TP/eigen"
  git clone --depth 1 --branch 3.4.0 https://gitlab.com/libeigen/eigen.git "$TP/eigen"
  rm -rf "$TP/eigen/.git" "$TP/eigen/unsupported"
fi

if [ ! -d "$TP/fmt/include" ]; then
  rm -rf "$TP/fmt"
  git clone --depth 1 https://github.com/fmtlib/fmt.git "$TP/fmt"
  rm -rf "$TP/fmt/.git"
fi

echo "thirdparty: $(du -sh "$TP" | cut -f1)"
