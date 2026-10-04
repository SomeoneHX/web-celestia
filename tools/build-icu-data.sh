#!/usr/bin/env bash
# Builds the ICU data the web build ships.
#
#   ICU_SOURCE=<path to an icu4c source tree> bash tools/build-icu-data.sh
#
# Celestia formats its dates with ICU (celutil/dateformatter.cpp), and ICU needs
# data for that. On the desktop it takes that from the system. Emscripten's ICU
# port links ICU's stubdata -- an empty placeholder -- so ICU has none of its own
# there, every lookup fails with U_FILE_ACCESS_ERROR, the HUD's date comes out
# empty, and the time rate and field of view beside it are measured against that
# empty string and drawn off the right edge of the canvas. A data file cannot be
# used as-is either: ICU loads one by mapping it, and its uprv_mapFile returns
# failure without a fallback when mmap fails, as it does on this file system. The
# file is therefore read into memory by the front end and handed to ICU with
# udata_setCommonData.
#
# The data is ICU 68's own, from source/data/in/icudt68l.dat, reduced to what date
# formatting reads: every top-level item, plus the curr collection, which the date
# formatter reaches through the locale's number format. That is 11.8 MB of the
# original 27 MB. It is a subset rather than the whole file because the whole file
# is larger than every other asset combined.
#
# The output file MUST be named icudt68l.dat: icupkg derives each entry's name
# inside the package from the output file name, and ICU looks items up under the
# prefix of its own data name (U_ICUDATA_NAME, "icudt68l"). Writing the same
# contents to any other file name produces a package whose every lookup fails,
# which is worth knowing before wondering why a subset does not work.

set -euo pipefail

ICU_SOURCE="${ICU_SOURCE:-}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/icu/icudt68l.dat"

if [ -z "$ICU_SOURCE" ] || [ ! -f "$ICU_SOURCE/data/in/icudt68l.dat" ]; then
  echo "Set ICU_SOURCE to an icu4c source tree (the one with data/in/icudt68l.dat)." >&2
  exit 1
fi

ICUPKG="$ICU_SOURCE/bin/icupkg"
if [ ! -x "$ICUPKG" ]; then
  echo "No icupkg in $ICU_SOURCE/bin. Build the tools: make -C tools/icupkg" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Everything not wanted, one name per line.
"$ICUPKG" -l "$ICU_SOURCE/data/in/icudt68l.dat" \
  | grep -vE '^[^/]+$|^curr/' > "$work/remove.txt"

mkdir -p "$(dirname "$OUT")"
"$ICUPKG" -r "$work/remove.txt" "$ICU_SOURCE/data/in/icudt68l.dat" "$OUT"

echo "wrote $OUT ($(( $(wc -c < "$OUT") / 1024 )) kB)"
