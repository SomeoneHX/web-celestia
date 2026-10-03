// WebGL 2 helpers: program compilation, buffer and texture creation and the
// 4x4 matrix routines the renderer needs.

export type Mat4 = Float32Array;

/** Prepends the GLSL ES 3.0 version directive that a WebGL 2 context requires. */
function withVersionDirective(source: string): string {
  return source.startsWith('#version') ? source : `#version 300 es\n${source}`;
}

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('failed to create shader');
  const full = withVersionDirective(source);
  gl.shaderSource(shader, full);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    const numbered = full
      .split('\n')
      .map((line, i) => `${String(i + 1).padStart(4, ' ')} | ${line}`)
      .join('\n');
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}\n${numbered}`);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}

/** Caches uniform locations so the render loop does no string lookups. */
export class UniformCache {
  private readonly cache = new Map<string, WebGLUniformLocation | null>();

  constructor(private readonly gl: WebGL2RenderingContext, private readonly program: WebGLProgram) {}

  location(name: string): WebGLUniformLocation | null {
    if (!this.cache.has(name)) {
      this.cache.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.cache.get(name) ?? null;
  }

  mat4(name: string, value: Mat4): void {
    this.gl.uniformMatrix4fv(this.location(name), false, value);
  }

  mat3(name: string, value: Float32Array): void {
    this.gl.uniformMatrix3fv(this.location(name), false, value);
  }

  vec4(name: string, x: number, y: number, z: number, w: number): void {
    this.gl.uniform4f(this.location(name), x, y, z, w);
  }

  vec3(name: string, x: number, y: number, z: number): void {
    this.gl.uniform3f(this.location(name), x, y, z);
  }

  vec2(name: string, x: number, y: number): void {
    this.gl.uniform2f(this.location(name), x, y);
  }

  float(name: string, value: number): void {
    this.gl.uniform1f(this.location(name), value);
  }

  int(name: string, value: number): void {
    this.gl.uniform1i(this.location(name), value);
  }
}

/** Creates a static or dynamic vertex buffer of floats. */
export function createFloatBuffer(gl: WebGL2RenderingContext, data: Float32Array | number[], usage: number = gl.STATIC_DRAW): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('failed to create buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), usage);
  return buffer;
}

export function createIndexBuffer(gl: WebGL2RenderingContext, data: Uint16Array | Uint32Array, usage: number = gl.STATIC_DRAW): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('failed to create buffer');
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data, usage);
  return buffer;
}

export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  pixels: Uint8Array | null = null,
  options: { wrap?: number; filter?: number; mipmap?: boolean } = {},
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const wrap = options.wrap ?? gl.REPEAT;
  const filter = options.filter ?? gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrap ?? gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.mipmap ? gl.LINEAR_MIPMAP_LINEAR : filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (options.mipmap) gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

// ---------------------------------------------------------------- matrices

export function mat4Identity(out: Mat4 = new Float32Array(16)): Mat4 {
  out.fill(0);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

/** Standard OpenGL perspective projection, column major. */
export function mat4Perspective(fovY: number, aspect: number, near: number, far: number, out: Mat4 = new Float32Array(16)): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

/** Orthographic projection in pixel units, with the origin at the top left. */
export function mat4Ortho(left: number, right: number, bottom: number, top: number, near: number, far: number, out: Mat4 = new Float32Array(16)): Mat4 {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function mat4Multiply(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  for (let i = 0; i < 4; i++) {
    const ai0 = a[i];
    const ai1 = a[i + 4];
    const ai2 = a[i + 8];
    const ai3 = a[i + 12];
    out[i] = ai0 * b[0] + ai1 * b[1] + ai2 * b[2] + ai3 * b[3];
    out[i + 4] = ai0 * b[4] + ai1 * b[5] + ai2 * b[6] + ai3 * b[7];
    out[i + 8] = ai0 * b[8] + ai1 * b[9] + ai2 * b[10] + ai3 * b[11];
    out[i + 12] = ai0 * b[12] + ai1 * b[13] + ai2 * b[14] + ai3 * b[15];
  }
  return out;
}

/**
 * Converts a row-major 3x3 rotation into the column-major layout glUniformMatrix3fv
 * expects, so the shader sees the same rotation the engine computed.
 */
export function mat3ToUniform(m: readonly number[]): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smooth Hermite interpolation, matching GLSL's smoothstep. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
