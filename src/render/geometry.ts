// Mesh builders: a shared unit sphere, a ring annulus, line sets for the various
// grids and orbit paths, and the vertex layouts the renderer binds.

export interface Mesh {
  vao: WebGLVertexArrayObject;
  /** Number of indices for indexed meshes, or vertices for non indexed ones. */
  count: number;
  indexType?: number;
  buffers: WebGLBuffer[];
}

/** Interleaved layout for the body and ring meshes. */
export const SURFACE_ATTRIBUTES: Array<{ location: number; size: number; offset: number }> = [
  { location: 0, size: 3, offset: 0 },
  { location: 1, size: 3, offset: 12 },
  { location: 2, size: 2, offset: 24 },
];
export const SURFACE_STRIDE = 32;

/**
 * Unit sphere with the texture coordinate convention Celestia's body meshes use:
 * u runs with longitude from the prime meridian, v runs from the north pole
 * downwards, matching the orientation of the generated equirectangular maps.
 */
export function createSphere(gl: WebGL2RenderingContext, segments = 96, rings = 48): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= rings; y++) {
    const v = y / rings;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const theta = u * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const ny = sinPhi * Math.sin(theta);
      const nz = cosPhi;
      positions.push(nx, ny, nz, nx, ny, nz, u, v);
    }
  }

  for (let y = 0; y < rings; y++) {
    for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x;
      const b = a + segments + 1;
      indices.push(a, b, a + 1);
      indices.push(a + 1, b, b + 1);
    }
  }

  return buildIndexedMesh(gl, positions, indices);
}

/**
 * Annulus in the body's equatorial plane. The mesh is built from `innerRatio` to
 * 1, so scaling by the ring system's outer radius gives the correct size.
 */
export function createRingAnnulus(gl: WebGL2RenderingContext, innerRatio: number, segments = 192): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const theta = u * Math.PI * 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // v is the radial coordinate the ring texture is addressed with.
    positions.push(innerRatio * c, 0, innerRatio * s, 0, 1, 0, 0, 0);
    positions.push(c, 0, s, 0, 1, 0, 1, 0);
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2);
    indices.push(a + 1, a + 3, a + 2);
  }

  return buildIndexedMesh(gl, positions, indices);
}

export function buildIndexedMesh(gl: WebGL2RenderingContext, positions: number[], indices: number[], stride = SURFACE_STRIDE): Mesh {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('failed to create vertex array');
  gl.bindVertexArray(vao);

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  for (const attr of SURFACE_ATTRIBUTES) {
    gl.enableVertexAttribArray(attr.location);
    gl.vertexAttribPointer(attr.location, attr.size, gl.FLOAT, false, stride, attr.offset);
  }

  const useShort = indices.length < 65536 && Math.max(...indices) < 65536;
  const indexArray = useShort ? new Uint16Array(indices) : new Uint32Array(indices);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexArray, gl.STATIC_DRAW);

  gl.bindVertexArray(null);
  return { vao, count: indices.length, indexType: useShort ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, buffers: [vertexBuffer, indexBuffer] };
}

/**
 * Line mesh with a per-vertex fade factor. Positions are in kilometres relative
 * to the line set's own origin, which the caller supplies each frame.
 */
export function createLineMesh(gl: WebGL2RenderingContext, vertices: number[], fades?: number[]): { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] } {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('failed to create vertex array');
  gl.bindVertexArray(vao);

  const stride = 16;
  const packed: number[] = [];
  for (let i = 0; i < vertices.length / 3; i++) {
    packed.push(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2], fades ? fades[i] : 1);
  }

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(packed), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 12);

  gl.bindVertexArray(null);
  return { vao, count: vertices.length / 3, buffers: [buffer] };
}

/** Full screen quad in pixel coordinates, for the text and backdrop passes. */
export function createScreenQuad(gl: WebGL2RenderingContext): { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[] } {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('failed to create vertex array');
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.bindVertexArray(null);
  return { vao, buffers: [buffer] };
}

// ------------------------------------------------------------------- grids

export interface GridOptions {
  /** Transformation taking grid coordinates to the scene frame. */
  transform: (p: [number, number, number]) => [number, number, number];
  /** Radius of the sphere the grid is drawn on, kilometres. */
  radius: number;
  /** Number of subdivisions along the primary axis. */
  majorStep: number;
  /** Number of subdivisions along the secondary axis. */
  minorStep: number;
  /** Subdivisions between labelled lines, used for line weights. */
  labelStep: number;
  /** Segments per great circle arc. */
  segments: number;
  /** Restrict the latitude range, used by the horizon dome. */
  latitudeLimit?: [number, number];
}

/**
 * Builds a wireframe grid on a sphere. The two families of lines are generated
 * separately so their fade factors can differ: Celestia draws the labelled lines
 * brighter than the intervening ones.
 */
export function buildGrid(options: GridOptions): { vertices: number[]; fades: number[] } {
  const { radius, majorStep, minorStep, labelStep, segments } = options;
  const [latMin, latMax] = options.latitudeLimit ?? [-90, 90];
  const vertices: number[] = [];
  const fades: number[] = [];

  const push = (p: [number, number, number], fade: number) => {
    const t = options.transform(p);
    vertices.push(t[0], t[1], t[2]);
    fades.push(fade);
  };

  // Meridians: full great circles through the poles.
  for (let lon = 0; lon < 360; lon += majorStep) {
    const lonRad = (lon * Math.PI) / 180;
    const fade = lon % labelStep === 0 ? 1.0 : 0.55;
    let previous: [number, number, number] | null = null;
    for (let i = 0; i <= segments; i++) {
      const lat = latMin + ((latMax - latMin) * i) / segments;
      const latRad = (lat * Math.PI) / 180;
      const point: [number, number, number] = [
        radius * Math.cos(latRad) * Math.cos(lonRad),
        radius * Math.cos(latRad) * Math.sin(lonRad),
        radius * Math.sin(latRad),
      ];
      if (previous) {
        push(previous, fade);
        push(point, fade);
      }
      previous = point;
    }
  }

  // Parallels from latMin to latMax.
  for (let lat = latMin; lat <= latMax + 1e-9; lat += minorStep) {
    const rounded = Math.round(lat * 1000) / 1000;
    const isLabelled = Math.abs(rounded % labelStep) < 1e-6 || Math.abs(Math.abs(rounded % labelStep) - labelStep) < 1e-6;
    const fade = isLabelled ? 0.95 : 0.5;
    const latRad = (rounded * Math.PI) / 180;
    if (Math.abs(latRad) > Math.PI / 2 - 1e-6) continue;
    const radiusAtLat = radius * Math.cos(latRad);
    const z = radius * Math.sin(latRad);
    let previous: [number, number, number] | null = null;
    for (let i = 0; i <= segments; i++) {
      const lon = (i / segments) * Math.PI * 2;
      const point: [number, number, number] = [radiusAtLat * Math.cos(lon), radiusAtLat * Math.sin(lon), z];
      if (previous) {
        push(previous, fade);
        push(point, fade);
      }
      previous = point;
    }
  }

  // A 360 division on every major parallel keeps the poles from looking open.
  return { vertices, fades };
}

/** Builds a polyline from a list of points. */
export function buildPolyline(points: Array<[number, number, number, number]>, width = 1): { vertices: number[]; fades: number[] } {
  const vertices: number[] = [];
  const fades: number[] = [];
  void width;
  for (let i = 0; i < points.length - 1; i++) {
    vertices.push(points[i][0], points[i][1], points[i][2]);
    fades.push(points[i][3]);
    vertices.push(points[i + 1][0], points[i + 1][1], points[i + 1][2]);
    fades.push(points[i + 1][3]);
  }
  return { vertices, fades };
}

/** Builds a closed loop through the given points. */
export function buildLoop(points: Array<[number, number, number]>): { vertices: number[]; fades: number[] } {
  const vertices: number[] = [];
  const fades: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    vertices.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    fades.push(1, 1);
  }
  return { vertices, fades };
}
