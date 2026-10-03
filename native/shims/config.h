// Replacement for the config.h that CMake generates from config.h.in.
//
// The macOS and Linux builds get the same file with the same meaning; only the
// feature probes differ, because Emscripten's libc and libc++ are not glibc or
// Apple's libc. Each value below was checked against the Emscripten sysroot.

#pragma once

// <byteswap.h> and <charconv> are both present in the Emscripten sysroot.
#define HAVE_BYTESWAP_H 1
#define HAVE_CHARCONV 1

// sincos() is provided by the Emscripten libm. The Apple variant is not used.
#define HAVE_SINCOS 1

// <wordexp.h> has no Emscripten implementation.
// MESHOPTIMIZER is an optional mesh optimiser, not used here.
// The libm functions are not constexpr in this toolchain, so
// CELESTIA_CMATH_CONSTEXPR stays empty.
// MAX_ALIGN_T uses the std::array fallback rather than the constexpr form.
#ifdef HAVE_CONSTEXPR_CMATH
#define CELESTIA_CMATH_CONSTEXPR constexpr
#else
#define CELESTIA_CMATH_CONSTEXPR
#endif
