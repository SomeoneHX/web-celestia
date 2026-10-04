#!/usr/bin/env bash
# Builds Celestia's translation catalogues for the web build.
#
#   bash tools/build-translations.sh [language ...]
#
# Celestia localises everything through gettext, and the po files in its source
# tree carry both the engine's strings and the interface's -- "Planets" and
# "Select Sun" are in the same catalogue -- so one .mo per language covers the
# whole application. The build installs them as
# <localedir>/<language>/LC_MESSAGES/celestia.mo, and the web build serves them
# from public/locale in the same layout.
#
# Languages default to every one Celestia ships. Requires msgfmt from gettext.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CELESTIA_SRC="${CELESTIA_SRC:-/Users/hxun/Documents/Celestia}"
PO_DIR="$CELESTIA_SRC/po"
OUT="$ROOT/public/locale"

if ! command -v msgfmt >/dev/null 2>&1; then
  echo "msgfmt not found. Install gettext first." >&2
  exit 1
fi

if [ ! -d "$PO_DIR" ]; then
  echo "no po directory at $PO_DIR; set CELESTIA_SRC to the Celestia checkout" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  languages=("$@")
else
  languages=()
  for po in "$PO_DIR"/*.po; do
    languages+=("$(basename "$po" .po)")
  done
fi

for language in "${languages[@]}"; do
  po="$PO_DIR/$language.po"
  if [ ! -f "$po" ]; then
    echo "no catalogue for $language" >&2
    exit 1
  fi

  target="$OUT/$language/LC_MESSAGES"
  mkdir -p "$target"
  msgfmt -o "$target/celestia.mo" "$po"
  printf '%-8s %s\n' "$language" "$(wc -c < "$target/celestia.mo" | tr -d ' ') bytes"
done
