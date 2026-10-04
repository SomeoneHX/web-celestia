#!/usr/bin/env bash
# Builds Lua for the WebAssembly module.
#
#   bash native/build-lua.sh
#
# Celestia's CELX scripting is Lua, and it takes Lua from the system; there is no
# Emscripten port of it, so it is compiled here from the sources vendored in
# native/thirdparty/lua. The objects land beside the engine's, which is where the
# link step looks.
#
# The library and interpreter front ends (lua.c, luac.c) are left out: they are
# separate programs, and Celestia embeds the library.

set -euo pipefail

NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${LUA_SRC:-$NATIVE_DIR/thirdparty/lua}"
OBJ="$NATIVE_DIR/build/obj"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Activate emsdk first:  source ~/emsdk/emsdk_env.sh" >&2
  exit 1
fi

mkdir -p "$OBJ"

# The Lua library: everything except the two front ends.
SOURCES=(
  lapi lcode lctype ldebug ldo ldump lfunc lgc llex lmem lobject lopcodes
  lparser lstate lstring ltable ltm lundump lvm lzio
  lauxlib lbaselib lcorolib ldblib liolib lmathlib loadlib loslib lstrlib
  ltablib lutf8lib
)

fail=0
for name in "${SOURCES[@]}"; do
  file="$SRC/$name.c"
  object="$OBJ/lua.$name.o"

  if [ ! -f "$file" ]; then
    echo "missing $file" >&2
    fail=1
    continue
  fi

  # Lua is C, and its own build defines LUA_USE_POSIX where the platform has it.
  # Emscripten does, minus the parts that need a process: the standard library's
  # os.execute and popen are present but do nothing.
  # -fwasm-exceptions matches the rest of the module. Lua implements its error
  # handling with setjmp/longjmp, and without it the objects reference
  # emscripten_longjmp, which cannot be used alongside wasm exceptions.
  if emcc -O2 -fwasm-exceptions -DNDEBUG -DLUA_USE_POSIX \
      -I "$SRC" \
      -c "$file" -o "$object" >"$OBJ/../logs/lua.$name.log" 2>&1; then
    echo "ok   $name"
  else
    echo "FAIL $name"
    fail=1
  fi
done

if [ "$fail" != "0" ]; then
  echo "Lua did not build" >&2
  exit 1
fi

echo "Lua built into $OBJ"
