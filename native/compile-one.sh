#!/usr/bin/env bash
# Compiles one Celestia translation unit and reports the outcome on one line.
#   bash native/compile-one.sh <path/to/file.cpp>
# CELESTIA_SRC, NATIVE_DIR and BUILD_DIR must be set.

set -uo pipefail

FILE="${1:?usage: compile-one.sh <file.cpp>}"
CELESTIA="${CELESTIA_SRC:?}"
NATIVE="${NATIVE_DIR:?}"
OUTDIR="${BUILD_DIR:?}"

module="$(basename "$(dirname "$FILE")")"
name="$(basename "$FILE" .cpp)"
log="$OUTDIR/logs/$module.$name.log"
out="$OUTDIR/obj/$module.$name.o"

mkdir -p "$OUTDIR/logs" "$OUTDIR/obj"

if em++ \
    -std=c++20 -O2 -fwasm-exceptions -DNDEBUG \
    -DEIGEN_DONT_PARALLELIZE -DFMT_HEADER_ONLY \
    -sUSE_BOOST_HEADERS=1 -sUSE_ICU=1 \
    -I "$CELESTIA/src" \
    -I "$NATIVE/thirdparty/eigen" \
    -I "$NATIVE/thirdparty/fmt/include" \
    -I "$NATIVE/shims" \
    -I "$NATIVE/generated" \
    -c "$FILE" -o "$out" >"$log" 2>&1; then
  echo "ok $module/$name"
else
  first="$(grep -m1 -E 'error:' "$log" | sed 's/.*error: //')"
  printf 'FAIL %-11s %-22s %s\n' "$module" "$name" "${first:0:110}"
fi
