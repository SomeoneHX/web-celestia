#!/usr/bin/env bash
# Compiles Celestia's own C++ sources to WebAssembly and links them into a single
# ES module.
#
#   bash native/build.sh            compile every translation unit, then link
#   bash native/build.sh compile    compile only
#
# Requires an activated emsdk (source ~/emsdk/emsdk_env.sh). Eigen and fmt are
# vendored under native/thirdparty, Boost headers and ICU come from the
# Emscripten port system, and the gperf tables live in native/generated.

set -uo pipefail

export NATIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CELESTIA_SRC="${CELESTIA_SRC:-/Users/hxun/Documents/Celestia}"
export BUILD_DIR="$NATIVE_DIR/build"
mkdir -p "$BUILD_DIR/obj" "$BUILD_DIR/logs"

JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)}"

if ! command -v em++ >/dev/null 2>&1; then
  echo "em++ not found. Activate emsdk first: source ~/emsdk/emsdk_env.sh" >&2
  exit 1
fi

# Modules ported so far, in dependency order.
MODULES=(${MODULES_OVERRIDE:-celutil celmath celastro celimage celephem celmodel celengine celrender celestia})

# Translation units that Celestia itself does not compile in a default build, or
# that target a platform the web build does not have. The comments name the CMake
# switch each one is behind.
EXCLUDE=(
  "celutil/winutil.cpp"          # _WIN32 only
  "celephem/spiceinterface.cpp"  # ENABLE_SPICE, off by default
  "celephem/spiceorbit.cpp"      # ENABLE_SPICE
  "celephem/spicerotation.cpp"   # ENABLE_SPICE
  "celephem/scriptobject.cpp"    # ENABLE_CELX (Lua), off by default
  "celephem/scriptorbit.cpp"     # ENABLE_CELX
  "celephem/scriptrotation.cpp"  # ENABLE_CELX
  "celestia/audiosession.cpp"    # miniaudio, audio output has no meaning in the browser
  "celestia/miniaudiosession.cpp" # miniaudio
  "celestia/ffmpegcapture.cpp"   # FFmpeg video capture
  "celimage/avif.cpp"            # ENABLE_LIBAVIF, off by default
  "celengine/resourcesystem.cpp" # worker pool, replaced by native/shims/resourcesystem_web.cpp
)

is_excluded() {
  local rel="$1"
  for item in "${EXCLUDE[@]}"; do
    [ "$rel" = "$item" ] && return 0
  done
  return 1
}
export -f is_excluded
export EXCLUDE_JOINED
EXCLUDE_JOINED="$(printf '%s\n' "${EXCLUDE[@]}")"

all_sources() {
  for module in "${MODULES[@]}"; do
    # Only celrender nests sources, in its gl/ wrapper subdirectory. The front
    # ends under celestia/ (qt, sdl, gtk) are separate applications.
    local depth=1
    [ "$module" = "celrender" ] && depth=2
    find "$CELESTIA_SRC/src/$module" -maxdepth "$depth" -name '*.cpp' | sort
  done
}

out="$BUILD_DIR/result.txt"
ok=0
fail=0

# "link" reuses the objects already in build/obj and only rebuilds the local
# bindings, which is what you want while iterating on the exported API.
if [ "${1:-all}" != "link" ]; then
  : >"$out"

  all_sources | while IFS= read -r file; do
    rel="${file#"$CELESTIA_SRC/src/"}"
    skip=0
    while IFS= read -r item; do
      [ "$rel" = "$item" ] && skip=1
    done <<<"$EXCLUDE_JOINED"
    [ "$skip" = 1 ] || echo "$file"
  done | xargs -P "$JOBS" -n1 bash "$NATIVE_DIR/compile-one.sh" >"$out" 2>&1

  ok=$(grep -c '^ok ' "$out" 2>/dev/null)
  fail=$(grep -c '^FAIL ' "$out" 2>/dev/null)
  ok=${ok:-0}
  fail=${fail:-0}
  echo "compiled $ok, failed $fail, total $((ok + fail))"
  echo
  grep '^FAIL' "$out" | sort
fi

# The bindings and the epoxy compatibility layer live outside the Celestia tree,
# so the source scan above does not reach them.
compile_local() {
  local src="$1" obj="$2"
  em++ -std=c++20 -O2 -fwasm-exceptions -DNDEBUG \
    -DEIGEN_DONT_PARALLELIZE -DFMT_HEADER_ONLY \
    -sUSE_BOOST_HEADERS=1 -sUSE_ICU=1 -sUSE_LIBPNG=1 -sUSE_LIBJPEG=1 \
    -I "$CELESTIA_SRC/src" \
    -I "$NATIVE_DIR/thirdparty/eigen" \
    -I "$NATIVE_DIR/thirdparty/fmt/include" \
    -I "$NATIVE_DIR/shims" \
    -I "$NATIVE_DIR/generated" \
    -c "$src" -o "$obj"
}

compile_local "$NATIVE_DIR/bindings.cpp" "$BUILD_DIR/obj/bindings.o" || exit 1
compile_local "$NATIVE_DIR/shims/epoxy_stubs.cpp" "$BUILD_DIR/obj/epoxy_stubs.o" || exit 1
compile_local "$NATIVE_DIR/shims/resourcesystem_web.cpp" "$BUILD_DIR/obj/resourcesystem_web.o" || exit 1

if [ "${1:-all}" = "compile" ]; then
  exit 0
fi

if [ "$fail" != "0" ]; then
  echo "not linking: $fail translation units failed" >&2
  exit 1
fi

# A translation unit replaced by a shim leaves a stale object behind.
rm -f "$BUILD_DIR/obj/celengine.resourcesystem.o"

echo "linking"
# Linking at -O1 and above miscompiles this module: reading a star catalogue or
# a solar system file then crashes with an out-of-bounds access, while the same
# objects linked at -O0 behave correctly. Compilation still runs at -O2, so the
# object code itself is optimized.
em++ -O0 -fwasm-exceptions -sUSE_BOOST_HEADERS=1 -sUSE_ICU=1 -sUSE_LIBPNG=1 -sUSE_LIBJPEG=1 \
  --bind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=8388608 \
  -sEXPORTED_RUNTIME_METHODS=FS,cwrap,ccall,getExceptionMessage \
  "$BUILD_DIR"/obj/*.o \
  -o "$NATIVE_DIR/../src/wasm/celestia_core.js"
