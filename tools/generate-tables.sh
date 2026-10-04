#!/usr/bin/env bash
# Regenerates the six lookup tables the build needs from Celestia's gperf sources.
#
#   bash tools/generate-tables.sh
#
# Celestia turns six .gperf descriptions into C++ with gperf: the CEL command
# names, the config parser's keywords, the body and location classification names
# and the custom orbit and rotation names. Its own build does this with a CMake
# rule; here they are generated once into native/generated and committed, so that
# building the module needs Emscripten and nothing else.
#
# The generated files are written from the Celestia source directory with a
# relative output path, so that the #line directives gperf emits name the sources
# rather than whichever machine they were generated on. The committed copies are
# made this way for that reason; regenerate them here rather than by hand.

set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/native"
CELESTIA_SRC="${CELESTIA_SRC:-$HOME/Documents/Celestia}"

if ! command -v gperf >/dev/null 2>&1; then
  echo "gperf not found. It is packaged as gperf on most systems." >&2
  exit 1
fi

if [ ! -d "$CELESTIA_SRC/src" ]; then
  echo "No Celestia source tree at $CELESTIA_SRC. Set CELESTIA_SRC to one." >&2
  exit 1
fi

# Output name and the source it comes from, both relative to Celestia's src/.
TABLES=(
  "commands:celscript/legacy/commands.gperf"
  "customorbit:celephem/customorbit.gperf"
  "customrotation:celephem/customrotation.gperf"
  "location:celengine/location.gperf"
  "parser:celutil/parser.gperf"
  "solarsys:celengine/solarsys.gperf"
)

mkdir -p "$NATIVE_DIR/generated"

for entry in "${TABLES[@]}"; do
  name="${entry%%:*}"
  source="${entry#*:}"

  # gperf writes the path it was given into its #line directives, so the run has
  # to happen with the source tree as the working directory and the inputs named
  # relative to it.
  (cd "$CELESTIA_SRC/src" && gperf -m4 --output-file="$NATIVE_DIR/generated/$name.inc" "$source")

  # gperf records the command it was run with, including the output path, which is
  # absolute because the two trees are not one. Only the comment is rewritten, to
  # the path the file is checked in at.
  sed -i '' "/Command-line:/s|--output-file=[^ ]*|--output-file=native/generated/$name.inc|" "$NATIVE_DIR/generated/$name.inc" 2>/dev/null \
    || sed -i "/Command-line:/s|--output-file=[^ ]*|--output-file=native/generated/$name.inc|" "$NATIVE_DIR/generated/$name.inc"

  echo "generated $name.inc from $source"
done
