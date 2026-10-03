// Definitions for the GL entry points that Emscripten's GL library does not bind.
//
// EXT_blend_func_extended is the only one Celestia's renderer references.
// epoxy/gl.h reports that extension as unavailable for this build, so
// GLProgramBuilder::bindFragmentOutput never reaches this call, and the
// definition exists only so that the reference links.

#include <epoxy/gl.h>

extern "C" void glBindFragDataLocationIndexedEXT(GLuint program, GLuint colorNumber, GLuint index, const GLchar* name)
{
    (void)program;
    (void)colorNumber;
    (void)index;
    (void)name;
}
