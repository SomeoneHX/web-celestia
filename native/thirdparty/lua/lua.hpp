// lua.hpp
//
// The C++ wrapper around Lua's headers. The official Lua tarball ships lua.h,
// lualib.h and lauxlib.h but not this file -- it comes with the distributions --
// and Celestia's CELX sources include it, so it is written here with the same
// contents.

extern "C" {
#include "lua.h"
#include "lualib.h"
#include "lauxlib.h"
}
