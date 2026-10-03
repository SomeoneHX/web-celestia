// Replacement for libepoxy.
//
// Celestia uses libepoxy as an OpenGL function loader and as a portable source of
// the GL 3.3 core entry points. Under Emscripten every GL call is a direct symbol
// in the sysroot that resolves to the corresponding WebGL 2 call, so no loading
// is required. The GLES 3.0/3.1/3.2 and GLES2 extension headers together cover
// the subset of the desktop 3.3 core profile that Celestia's renderer uses.
//
// Two things libepoxy provides are not free under Emscripten and are handled
// here explicitly: the extension query, which is reimplemented against the real
// WebGL 2 extension list, and one extension entry point that Emscripten does not
// bind, which is therefore reported as unavailable so no code path calls it.

#pragma once

#include <GLES3/gl3.h>
#include <GLES3/gl2ext.h>
#include <GLES3/gl31.h>
#include <GLES3/gl32.h>
#include <cstring>

#ifndef GL_ES
#define GL_ES 1
#endif

// The ES headers only declare the EXT_blend_func_extended prototypes when
// GL_GLEXT_PROTOTYPES is defined, which the Emscripten build does not do.
#ifdef __cplusplus
extern "C" {
#endif
void glBindFragDataLocationIndexedEXT(GLuint program, GLuint colorNumber, GLuint index, const GLchar* name);
#ifdef __cplusplus
}
#endif

namespace celestia_epoxy
{

/**
 * Extensions this build cannot actually use even when WebGL 2 advertises them,
 * because the corresponding entry point is not bound by Emscripten's GL library.
 */
inline bool is_unbound(const char* name) noexcept
{
    return std::strcmp(name, "GL_EXT_blend_func_extended") == 0;
}

/** True when the running WebGL 2 context advertises the extension. */
inline bool has_extension(const char* name) noexcept
{
    if (is_unbound(name))
        return false;

    GLint count = 0;
    glGetIntegerv(GL_NUM_EXTENSIONS, &count);
    for (GLint i = 0; i < count; ++i)
    {
        const char* extension = reinterpret_cast<const char*>(glGetStringi(GL_EXTENSIONS, static_cast<GLuint>(i)));
        if (extension != nullptr && std::strcmp(extension, name) == 0)
            return true;
    }
    return false;
}

} // namespace celestia_epoxy

inline bool epoxy_has_gl_extension(const char* name) noexcept
{
    return celestia_epoxy::has_extension(name);
}

inline bool epoxy_has_gl_extension(const GLubyte* name) noexcept
{
    return celestia_epoxy::has_extension(reinterpret_cast<const char*>(name));
}

/**
 * GL version as an integer, major * 10 + minor, parsed from the context's own
 * version string. WebGL 2 reports "OpenGL ES 3.0", so this returns 30, which is
 * what the platform actually provides: the renderer gates its GL 4.3 paths on it.
 */
inline int epoxy_gl_version() noexcept
{
    const auto* raw = reinterpret_cast<const char*>(glGetString(GL_VERSION));
    if (raw == nullptr)
        return 0;

    // Expect "OpenGL ES <major>.<minor>"; anything else is reported as unknown.
    const char* marker = std::strstr(raw, "OpenGL ES ");
    if (marker == nullptr)
        return 0;
    marker += 10;

    int major = 0;
    int minor = 0;
    const char* cursor = marker;
    while (*cursor >= '0' && *cursor <= '9')
        major = major * 10 + (*cursor++ - '0');
    if (*cursor == '.')
    {
        ++cursor;
        while (*cursor >= '0' && *cursor <= '9')
            minor = minor * 10 + (*cursor++ - '0');
    }
    return major * 10 + minor;
}
