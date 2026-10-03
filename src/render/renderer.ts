// The WebGL 2 renderer.
//
// Draw order, which follows Celestia's own pass structure:
//
//   1. sky background            (no depth)
//   2. stars and deep sky        (no depth, additive)
//   3. solar system bodies       (depth write)
//   4. orbits, constellations, constellation boundaries, grids
//   5. markers
//   6. labels
//   7. selection pointer
//
// Everything is drawn in coordinates relative to the camera, in kilometres, so
// float32 attributes keep their precision even for objects several light years
// away. Depth is written logarithmically because a single frame can span from a
// few hundred kilometres to the whole sky.

import { type Mat4, UniformCache, createProgram, createTexture, mat3ToUniform, mat4Identity, mat4Multiply, mat4Perspective, clamp, smoothstep } from './glutil';
import {
  ATMOSPHERE_FRAGMENT, ATMOSPHERE_VERTEX, BACKDROP_FRAGMENT, BACKDROP_VERTEX,
  BODY_FRAGMENT, BODY_VERTEX, LINE_FRAGMENT, LINE_VERTEX, RING_FRAGMENT, RING_VERTEX,
  SELECTION_FRAGMENT, SELECTION_VERTEX, SPRITE_FRAGMENT, SPRITE_VERTEX,
  STAR_FRAGMENT, STAR_VERTEX, TEXT_FRAGMENT, TEXT_VERTEX,
} from './shaders';
import {
  type Mesh, SURFACE_ATTRIBUTES, SURFACE_STRIDE, buildGrid, createRingAnnulus,
  createSphere, createLineMesh,
} from './geometry';
import { TextAtlas, TextBatch } from './textatlas';
import {
  generateDsoTexture, generateGlowTexture, generatePlanetMap, generateRingTexture, generateStarTexture,
} from './textures';
import type { Simulation, StarStyle } from '@/core/simulation';
import { RenderFlags, RenderLabels, ShowSolarSystemObjects, StarStyle as StarStyleEnum, TextureResolution } from '@/core/simulation';
import type { Observer } from '@/core/observer';
import type { Universe } from '@/core/universe';
import type { Body } from '@/core/body';
import type { Star } from '@/core/star';
import type { DeepSkyObject } from '@/core/dso';
import { Selection } from '@/core/selection';
import { MarkerSymbol, type MarkerStore } from '@/core/markers';
import {
  type Vec3, vec3, add, sub, mul, normalize, cross, dot, length, KM_PER_AU, KM_PER_LY, J2000,
} from '@/core/math';
import { EQUATORIAL_TO_GALACTIC, eclipticToEquatorialMatrix, localSiderealTime, meanEclipticObliquity } from '@/core/astro';
import { spectrumToRgb } from './starcolor';

const STAR_BUFFER_BUDGET = 60000;
const MAX_LABEL_DISTANCE_AU = 60;

export interface RenderStats {
  stars: number;
  bodies: number;
  deepSky: number;
  drawCalls: number;
  frameMs: number;
}

interface BodyResources {
  texture: WebGLTexture;
  night?: WebGLTexture;
  clouds?: WebGLTexture;
  bump?: WebGLTexture;
  ring?: WebGLTexture;
  width: number;
}

export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas: HTMLCanvasElement;
  private readonly simulation: Simulation;
  private readonly observer: Observer;
  private readonly universe: Universe;
  private readonly markers: MarkerStore;

  private programs!: {
    star: WebGLProgram;
    sprite: WebGLProgram;
    body: WebGLProgram;
    atmosphere: WebGLProgram;
    ring: WebGLProgram;
    line: WebGLProgram;
    selection: WebGLProgram;
    text: WebGLProgram;
    backdrop: WebGLProgram;
  };

  private uniforms = new Map<WebGLProgram, UniformCache>();

  private sphereHigh!: Mesh;
  private sphereLow!: Mesh;
  private ringMesh!: Mesh;

  private starTexture!: WebGLTexture;
  private glowTexture!: WebGLTexture;
  private dsoTextures = new Map<string, WebGLTexture>();
  private atlas!: TextAtlas;
  private atlasTexture!: WebGLTexture;
  private batch = new TextBatch(12000);
  private textVao!: WebGLVertexArrayObject;
  private textBuffer!: WebGLBuffer;

  private starVao!: WebGLVertexArrayObject;
  private starBuffer!: WebGLBuffer;
  private starVertexData = new Float32Array(STAR_BUFFER_BUDGET * 8);
  private starCount = 0;
  private starBuildCamera = vec3(Number.NaN, 0, 0);
  private starBuildLimit = Number.NaN;
  private starBuildStyle = -1;

  private spriteVao!: WebGLVertexArrayObject;
  private spriteBuffer!: WebGLBuffer;
  private spriteData = new Float32Array(12000 * 14);

  private lineCache = new Map<string, { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] }>();
  private bodyResources = new Map<Body, BodyResources>();

  private gridCache = new Map<string, { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] }>();

  private viewMatrix: Mat4 = mat4Identity();
  private projectionMatrix: Mat4 = mat4Identity();
  private viewProjection: Mat4 = mat4Identity();
  private invViewProjection: Mat4 = mat4Identity();

  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  readonly stats: RenderStats = { stars: 0, bodies: 0, deepSky: 0, drawCalls: 0, frameMs: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    simulation: Simulation,
    observer: Observer,
    universe: Universe,
    markers: MarkerStore,
  ) {
    this.canvas = canvas;
    this.simulation = simulation;
    this.observer = observer;
    this.universe = universe;
    this.markers = markers;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL 2 is not available in this browser');
    this.gl = gl;

    this.initPrograms();
    this.initMeshes();
    this.initTextures();
    this.initBuffers();
  }

  // ------------------------------------------------------------------ setup

  private initPrograms(): void {
    const gl = this.gl;
    this.programs = {
      star: createProgram(gl, STAR_VERTEX, STAR_FRAGMENT),
      sprite: createProgram(gl, SPRITE_VERTEX, SPRITE_FRAGMENT),
      body: createProgram(gl, BODY_VERTEX, BODY_FRAGMENT),
      atmosphere: createProgram(gl, ATMOSPHERE_VERTEX, ATMOSPHERE_FRAGMENT),
      ring: createProgram(gl, RING_VERTEX, RING_FRAGMENT),
      line: createProgram(gl, LINE_VERTEX, LINE_FRAGMENT),
      selection: createProgram(gl, SELECTION_VERTEX, SELECTION_FRAGMENT),
      text: createProgram(gl, TEXT_VERTEX, TEXT_FRAGMENT),
      backdrop: createProgram(gl, BACKDROP_VERTEX, BACKDROP_FRAGMENT),
    };
    for (const program of Object.values(this.programs)) {
      this.uniforms.set(program, new UniformCache(gl, program));
    }
  }

  private initMeshes(): void {
    const gl = this.gl;
    this.sphereHigh = createSphere(gl, 128, 64);
    this.sphereLow = createSphere(gl, 24, 12);
    this.ringMesh = createRingAnnulus(gl, 0.55, 256);
  }

  private initTextures(): void {
    const gl = this.gl;
    const star = generateStarTexture(64);
    this.starTexture = createTexture(gl, star.width, star.height, star.data);
    const glow = generateGlowTexture(128);
    this.glowTexture = createTexture(gl, glow.width, glow.height, glow.data);

    for (const type of ['Galaxy', 'Nebula', 'Globular cluster', 'Open cluster', 'Other'] as const) {
      const map = generateDsoTexture(type, 96);
      this.dsoTextures.set(type, createTexture(gl, map.width, map.height, map.data));
    }

    this.atlas = new TextAtlas(gl, '"DejaVu Sans", "Liberation Sans", "Helvetica Neue", Arial, sans-serif');
    this.atlasTexture = createTexture(gl, this.atlas.size, this.atlas.size, null, { wrap: gl.CLAMP_TO_EDGE });
  }

  private initBuffers(): void {
    const gl = this.gl;

    // Stars: position (3), point size (1), colour (4).
    this.starVao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.starVao);
    this.starBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.starVertexData.byteLength, gl.DYNAMIC_DRAW);
    const starStride = 8 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, starStride, 0);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 1, gl.FLOAT, false, starStride, 12);
    gl.enableVertexAttribArray(8);
    gl.vertexAttribPointer(8, 4, gl.FLOAT, false, starStride, 16);
    gl.bindVertexArray(null);

    // Sprites: position (3), corner (2), size (2), colour (4), uv rect (4), rotation (1).
    this.spriteVao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.spriteVao);
    this.spriteBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
    const spriteStride = 16 * 4;
    const spriteLayout: Array<[number, number, number]> = [
      [0, 3, 0],
      [3, 2, 12],
      [7, 2, 20],
      [8, 4, 28],
      [9, 4, 44],
      [10, 1, 60],
    ];
    for (const [location, size, offset] of spriteLayout) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, spriteStride, offset);
    }
    gl.bindVertexArray(null);

    // Text quads.
    this.textVao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.textVao);
    this.textBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 12000 * 6 * 15 * 4, gl.DYNAMIC_DRAW);
    const textStride = 15 * 4;
    const textLayout: Array<[number, number, number]> = [
      [0, 2, 0],
      [1, 2, 8],
      [2, 4, 16],
      [3, 4, 32],
      [4, 2, 48],
      [5, 1, 56],
    ];
    for (const [location, size, offset] of textLayout) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, textStride, offset);
    }
    gl.bindVertexArray(null);
  }

  // ----------------------------------------------------------------- resize

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.pixelRatio = pixelRatio;
    this.canvas.width = Math.floor(this.width * pixelRatio);
    this.canvas.height = Math.floor(this.height * pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  // ------------------------------------------------------------ body textures

  private bodyResourcesFor(body: Body): BodyResources {
    const existing = this.bodyResources.get(body);
    if (existing) return existing;

    const gl = this.gl;
    const resolution = this.simulation.resolution;
    // Sizes chosen so a full set of maps for one body stays well under a tenth of
    // a second to generate; the high setting is used when a body fills the view.
    const width = resolution === TextureResolution.Low ? 256 : resolution === TextureResolution.Medium ? 512 : 1024;
    const height = width / 2;
    // Secondary layers carry less detail and are generated at half resolution.
    const detailWidth = Math.max(128, width / 2);
    const detailHeight = Math.max(64, height / 2);

    const surfaceId = body.textures?.surface ?? 'rocky-dark';
    const surface = generatePlanetMap(surfaceId, 'surface', width, height);
    const resources: BodyResources = {
      texture: createTexture(gl, surface.width, surface.height, surface.data, { wrap: gl.REPEAT, mipmap: true }),
      width,
    };

    const nightId = body.textures?.night;
    if (nightId) {
      const map = generatePlanetMap(surfaceId, 'night', detailWidth, detailHeight);
      resources.night = createTexture(gl, map.width, map.height, map.data, { wrap: gl.REPEAT, mipmap: true });
    }

    if (body.textures?.clouds) {
      const map = generatePlanetMap(surfaceId, 'clouds', detailWidth, detailHeight);
      resources.clouds = createTexture(gl, map.width, map.height, map.data, { wrap: gl.REPEAT, mipmap: true });
    }

    if (body.textures?.bump) {
      const map = generatePlanetMap(surfaceId, 'bump', detailWidth, detailHeight);
      resources.bump = createTexture(gl, map.width, map.height, map.data, { wrap: gl.REPEAT, mipmap: true });
    }

    if (body.rings) {
      const map = generateRingTexture(body.name, 1024);
      resources.ring = createTexture(gl, map.width, map.height, map.data, { wrap: gl.CLAMP_TO_EDGE, mipmap: false });
    }

    this.bodyResources.set(body, resources);
    return resources;
  }

  /** Drops and regenerates every body texture, used when the resolution changes. */
  invalidateTextures(): void {
    const gl = this.gl;
    for (const resources of this.bodyResources.values()) {
      gl.deleteTexture(resources.texture);
      if (resources.night) gl.deleteTexture(resources.night);
      if (resources.clouds) gl.deleteTexture(resources.clouds);
      if (resources.bump) gl.deleteTexture(resources.bump);
      if (resources.ring) gl.deleteTexture(resources.ring);
    }
    this.bodyResources.clear();
  }

  // ------------------------------------------------------------------ frame

  render(dt: number): void {
    const start = performance.now();
    const gl = this.gl;
    const tdb = this.simulation.getTime();
    const cameraPosition = this.observer.position;

    this.updateMatrices();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    // gl.clear honours the depth write mask, and the text and selection passes
    // leave it disabled, so it has to be restored before clearing.
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    this.stats.drawCalls = 0;

    this.drawBackdrop();
    this.drawStars(tdb, cameraPosition);
    this.drawDeepSky();
    this.drawBodies(tdb, cameraPosition);
    this.drawOrbits(tdb, cameraPosition);
    this.drawConstellations();
    this.drawGrids(tdb, cameraPosition);
    this.drawMarkers(tdb);
    this.drawLabels(tdb, cameraPosition);
    this.drawSelectionPointer(tdb, cameraPosition);

    gl.bindVertexArray(null);
    this.stats.frameMs = performance.now() - start;
  }

  private updateMatrices(): void {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    this.viewMatrix = this.observer.getViewMatrix();
    this.projectionMatrix = mat4Perspective(this.observer.fov, aspect, this.observer.nearPlane, this.observer.farPlane);
    this.viewProjection = mat4Multiply(this.projectionMatrix, this.viewMatrix);
    // The inverse of the view-projection is needed by the sky background to
    // recover a view direction from a pixel.
    this.invViewProjection = this.invert(this.viewProjection);
  }

  private invert(m: Mat4): Mat4 {
    const inv = new Float32Array(16);
    const a = m;
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];

    const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
    if (det === 0) return mat4Identity(inv);
    const invDet = 1 / det;
    for (let i = 0; i < 16; i++) inv[i] *= invDet;
    return inv;
  }

  /** Applies the shared uniforms every program expects. */
  private bindCommon(program: WebGLProgram, writeDepth: boolean): UniformCache {
    const u = this.uniforms.get(program) as UniformCache;
    const gl = this.gl;
    u.mat4('uView', this.viewMatrix);
    u.mat4('uProj', this.projectionMatrix);
    u.vec2('uViewport', this.canvas.width, this.canvas.height);
    const far = this.observer.farPlane;
    u.float('uLogDepthFactor', 1 / Math.log2(far + 1));
    u.float('uFarDistance', far);
    void writeDepth;
    void gl;
    return u;
  }

  // -------------------------------------------------------------- background

  private drawBackdrop(): void {
    const gl = this.gl;
    const program = this.programs.backdrop;
    gl.useProgram(program);
    const u = this.uniforms.get(program) as UniformCache;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(false);
    gl.bindVertexArray(this.screenQuadVao());
    u.vec2('uViewport', this.canvas.width, this.canvas.height);
    u.mat4('uInvViewProj', this.invViewProjection);
    // The galactic plane normal in the scene frame.
    const normal = normalize(vec3(EQUATORIAL_TO_GALACTIC[6], EQUATORIAL_TO_GALACTIC[7], EQUATORIAL_TO_GALACTIC[8]));
    u.vec3('uGalacticNormal', normal.x, normal.y, normal.z);
    const centre = normalize(vec3(EQUATORIAL_TO_GALACTIC[0], EQUATORIAL_TO_GALACTIC[1], EQUATORIAL_TO_GALACTIC[2]));
    u.vec3('uGalacticCenter', centre.x, centre.y, centre.z);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
  }

  private screenQuadVaoCache: WebGLVertexArrayObject | null = null;
  private screenQuadBuffer: WebGLBuffer | null = null;

  private screenQuadVao(): WebGLVertexArrayObject {
    if (this.screenQuadVaoCache) return this.screenQuadVaoCache;
    const gl = this.gl;
    const vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Pixel corners of the screen, matching the backdrop vertex stage.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, this.width, 0, 0, this.height, this.width, this.height]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.screenQuadVaoCache = vao;
    this.screenQuadBuffer = buffer;
    return vao;
  }

  // ------------------------------------------------------------------- stars

  private rebuildStars(cameraPosition: Vec3): void {
    const style = this.simulation.starStyle;
    const limit = this.simulation.getFaintestVisible();
    const exposure = this.simulation.starExposure;
    const data = this.starVertexData;
    let offset = 0;
    let count = 0;

    const pointRadius = this.simulation.starPointRadius;
    const usePsf = style === StarStyleEnum.PointSpreadFunction;

    for (let i = 0; i < this.universe.starCatalog.count; i++) {
      const star = this.universe.starCatalog.getStar(i);
      if (!star || star.apparentMag > limit) continue;
      if (count >= STAR_BUFFER_BUDGET - 1) break;

      const position = this.universe.starCatalog.getPosition(star);
      const relative = sub(position, cameraPosition);

      // Relative flux against a sixth magnitude reference, which is the
      // catalogue's faint end.
      const flux = Math.pow(10, -0.4 * (star.apparentMag - 6.0)) * exposure;

      let pointSize: number;
      let alpha: number;
      switch (style) {
        case StarStyleEnum.PointStars:
          pointSize = 1;
          alpha = clamp(flux * 0.5, 0.02, 1);
          break;
        case StarStyleEnum.FuzzyPointStars:
          pointSize = clamp(1.1 * Math.pow(flux, 0.16), 1, 12);
          alpha = clamp(flux * 0.4, 0.03, 1);
          break;
        case StarStyleEnum.ScaledDiscStars:
          pointSize = clamp(1.6 * Math.pow(flux, 0.22), 1.4, 40);
          alpha = clamp(flux * 0.22, 0.05, 1);
          break;
        case StarStyleEnum.PointSpreadFunction:
        default:
          pointSize = clamp(pointRadius * 1.6 * Math.pow(flux, 0.2), 1.2, 48);
          alpha = clamp(flux * 0.55, 0.03, 1);
          break;
      }
      void usePsf;

      const colour = spectrumToRgb(star.colorIndex);
      const saturation = this.simulation.tintSaturation;
      const r = 1 - (1 - colour[0]) * saturation;
      const g = 1 - (1 - colour[1]) * saturation;
      const b = 1 - (1 - colour[2]) * saturation;

      data[offset++] = relative.x;
      data[offset++] = relative.y;
      data[offset++] = relative.z;
      data[offset++] = pointSize * this.pixelRatio;
      data[offset++] = r;
      data[offset++] = g;
      data[offset++] = b;
      data[offset++] = alpha;
      count++;
    }

    this.starCount = count;
    if (count > 0) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 8);
    }
    this.starBuildCamera = cameraPosition;
    this.starBuildLimit = limit;
    this.starBuildStyle = style;
  }

  private drawStars(tdb: number, cameraPosition: Vec3): void {
    void tdb;
    if ((this.simulation.renderFlags & RenderFlags.ShowStars) === 0n) return;

    const limit = this.simulation.getFaintestVisible();
    const style = this.simulation.starStyle;
    // Parallax from a moved camera is far below a pixel for any star outside the
    // solar system, so the buffer is only rebuilt once the camera has moved
    // enough to matter or the visible set has changed.
    const moved = length(sub(cameraPosition, this.starBuildCamera));
    const needRebuild =
      !Number.isFinite(this.starBuildCamera.x) ||
      moved > KM_PER_AU * 0.01 ||
      limit !== this.starBuildLimit ||
      style !== this.starBuildStyle;

    if (needRebuild) this.rebuildStars(cameraPosition);
    if (this.starCount === 0) return;

    const gl = this.gl;
    gl.useProgram(this.programs.star);
    const u = this.bindCommon(this.programs.star, false);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.starTexture);
    u.int('uStarTexture', 0);
    u.float('uWriteDepth', 0);
    gl.bindVertexArray(this.starVao);
    gl.drawArrays(gl.POINTS, 0, this.starCount);
    gl.bindVertexArray(null);
    this.stats.stars = this.starCount;
    this.stats.drawCalls++;
  }

  // -------------------------------------------------------------- deep sky

  private drawDeepSky(): void {
    const gl = this.gl;
    const flags = this.simulation.renderFlags;
    const visibleTypes: string[] = [];
    if (flags & RenderFlags.ShowGalaxies) visibleTypes.push('Galaxy');
    if (flags & RenderFlags.ShowNebulae) visibleTypes.push('Nebula', 'Planetary nebula');
    if (flags & RenderFlags.ShowGlobulars) visibleTypes.push('Globular cluster');
    if (flags & RenderFlags.ShowOpenClusters) visibleTypes.push('Open cluster', 'Cluster');
    if (visibleTypes.length === 0) {
      this.stats.deepSky = 0;
      return;
    }

    const cameraPosition = this.observer.position;
    const limit = this.simulation.getFaintestVisible() + 4;
    let offset = 0;
    let quads = 0;
    const spriteTypes: string[] = [];

    for (const dso of this.universe.dsoCatalog.objects) {
      if (dso.magnitude > limit) continue;
      const typeKey = this.dsoTextureKey(dso.type);
      if (!visibleTypes.includes(dso.type) && typeKey === 'Other') continue;
      if (quads >= 1000) break;

      const world = mul(dso.position, KM_PER_LY * 500);
      const relative = sub(world, cameraPosition);
      const mass = Math.pow(10, -0.4 * (dso.magnitude - 8.0));
      const size = clamp(10 + Math.pow(mass, 0.22) * 12, 8, 160);
      const alpha = clamp(0.18 + Math.pow(mass, 0.35) * 0.5, 0.1, 0.9);

      offset = this.writeSprite(offset, relative, size, size, alpha, [1, 1, 1, 1], this.dsoUv(typeKey), 0);
      spriteTypes.push(typeKey);
      quads++;
    }

    this.stats.deepSky = quads;
    if (quads === 0) return;
    this.flushSprites(quads);
    this.beginSpritePass(this.dsoTextures.get(spriteTypes[0]) ?? this.glowTexture, false);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    this.stats.drawCalls++;
  }

  private dsoTextureKey(type: string): 'Galaxy' | 'Nebula' | 'Globular cluster' | 'Open cluster' | 'Other' {
    if (type === 'Galaxy') return 'Galaxy';
    if (type === 'Nebula' || type === 'Planetary nebula') return 'Nebula';
    if (type === 'Globular cluster') return 'Globular cluster';
    if (type === 'Open cluster' || type === 'Cluster') return 'Open cluster';
    return 'Other';
  }

  private dsoUv(_key: string): [number, number, number, number] {
    return [0, 0, 1, 1];
  }

  private writeSprite(
    offset: number,
    position: Vec3,
    width: number,
    height: number,
    alpha: number,
    colour: [number, number, number, number],
    uv: [number, number, number, number],
    rotation: number,
  ): number {
    const data = this.spriteData;
    const corners: Array<[number, number]> = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];
    for (const [cx, cy] of corners) {
      data[offset++] = position.x;
      data[offset++] = position.y;
      data[offset++] = position.z;
      data[offset++] = cx;
      data[offset++] = cy;
      data[offset++] = width;
      data[offset++] = height;
      data[offset++] = colour[0];
      data[offset++] = colour[1];
      data[offset++] = colour[2];
      data[offset++] = colour[3] * alpha;
      data[offset++] = uv[0];
      data[offset++] = uv[1];
      data[offset++] = uv[2];
      data[offset++] = uv[3];
      data[offset++] = rotation;
    }
    return offset;
  }

  private flushSprites(quads: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteData, 0, quads * 6 * 16);
  }

  private beginSpritePass(texture: WebGLTexture, depthWrite: boolean): void {
    const gl = this.gl;
    gl.useProgram(this.programs.sprite);
    const u = this.bindCommon(this.programs.sprite, depthWrite);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    u.int('uSprite', 0);
    u.float('uWriteDepth', 0);
    gl.bindVertexArray(this.spriteVao);
  }

  // ----------------------------------------------------------------- bodies

  private drawBodies(tdb: number, cameraPosition: Vec3): void {
    const gl = this.gl;
    const sunPosition = this.universe.getBodyScenePosition(this.universe.sol, tdb);
    const visible: Array<{ body: Body; distance: number; position: Vec3 }> = [];

    for (const body of this.universe.bodies) {
      if (!this.simulation.shouldShowBody(body.classification)) continue;
      const position = this.universe.getBodyScenePosition(body, tdb);
      const distance = length(sub(position, cameraPosition));
      // Skip anything far beyond the useful range of the current view.
      if (distance > this.observer.farPlane * 0.9) continue;
      visible.push({ body, distance, position });
    }

    visible.sort((a, b) => b.distance - a.distance);
    this.stats.bodies = visible.length;
    if (visible.length === 0) return;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    for (const entry of visible) {
      this.drawOneBody(entry.body, entry.position, cameraPosition, sunPosition, tdb);
    }
  }

  private drawOneBody(body: Body, position: Vec3, cameraPosition: Vec3, sunPosition: Vec3, tdb: number): void {
    const gl = this.gl;
    const relative = sub(position, cameraPosition);
    const distance = length(relative);
    const pixelSize = this.observer.pixelSizeOf(body.radius, distance, this.canvas.height);

    // Below a pixel a body is drawn with the sprite stage instead, which keeps
    // distant planets visible as points of light.
    if (pixelSize < 1.1) {
      const flux = Math.pow(10, -0.4 * (body.albedo > 0 ? -1.0 : 5.0));
      this.pointBody(relative, clamp(pixelSize, 1.4, 6), clamp(flux, 0.3, 1), body);
      return;
    }

    const useHighDetail = pixelSize > 24;
    const mesh = useHighDetail ? this.sphereHigh : this.sphereLow;
    const resources = this.bodyResourcesFor(body);

    const orientation = body.getOrientation(tdb);
    const bodyToScene = mat3ToUniform(orientation as unknown as number[]);

    const radii = body.radii;
    const uRadii = vec3(radii.x, radii.y, radii.z);

    const sunVector = sub(sunPosition, position);
    const sunDistance = Math.max(length(sunVector), 1);
    const sunDirection = normalize(sunVector);
    // Irradiance falls off with the square of the distance, referenced to 1 AU.
    const sunIrradiance = Math.min(3.5, Math.pow(KM_PER_AU / sunDistance, 2));
    const isSun = body === this.universe.sol;

    // Planet pass.
    gl.useProgram(this.programs.body);
    const u = this.bindCommon(this.programs.body, true);
    u.mat3('uBodyToScene', bodyToScene);
    u.vec3('uCenter', relative.x, relative.y, relative.z);
    u.vec3('uRadii', uRadii.x, uRadii.y, uRadii.z);
    u.vec3('uSunDirection', sunDirection.x, sunDirection.y, sunDirection.z);
    u.float('uSunIrradiance', isSun ? 1.0 : sunIrradiance);
    u.float('uAmbient', Math.max(this.simulation.ambientLightLevel, 0.02));
    u.vec3('uLightColor', 1, 1, 1);
    u.float('uHasNight', resources.night ? 1 : 0);
    u.float('uHasClouds', resources.clouds ? 1 : 0);
    u.float('uHasBump', resources.bump ? 1 : 0);
    u.float('uCloudShadow', (this.simulation.renderFlags & RenderFlags.ShowCloudShadows) !== 0n ? 0.65 : 0.0);
    u.float('uEclipseShadow', (this.simulation.renderFlags & RenderFlags.ShowEclipseShadows) !== 0n ? 0.15 : 1.0);
    u.float('uCloudTexOffset', (tdb % 1) * 0.02);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.texture);
    u.int('uSurface', 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, resources.night ?? resources.texture);
    u.int('uNight', 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, resources.clouds ?? resources.texture);
    u.int('uClouds', 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, resources.bump ?? resources.texture);
    u.int('uBump', 3);

    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType as number, 0);
    this.stats.drawCalls++;

    // Atmosphere shell.
    if (body.atmosphere && (this.simulation.renderFlags & RenderFlags.ShowAtmospheres) !== 0n && pixelSize > 3) {
      const shell = 1 + body.atmosphere.height / body.radius;
      gl.useProgram(this.programs.atmosphere);
      const ua = this.bindCommon(this.programs.atmosphere, false);
      ua.mat3('uBodyToScene', bodyToScene);
      ua.vec3('uCenter', relative.x, relative.y, relative.z);
      ua.vec3('uRadii', uRadii.x * shell, uRadii.y * shell, uRadii.z * shell);
      ua.vec3('uSunDirection', sunDirection.x, sunDirection.y, sunDirection.z);
      ua.vec3('uRayleigh', body.atmosphere.rayleigh[0], body.atmosphere.rayleigh[1], body.atmosphere.rayleigh[2]);
      ua.float('uMie', body.atmosphere.mie);
      ua.float('uSunIrradiance', sunIrradiance);
      gl.depthMask(false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      gl.drawElements(gl.TRIANGLES, this.sphereLow.count, this.sphereLow.indexType as number, 0);
      gl.enable(gl.CULL_FACE);
      gl.depthMask(true);
      this.stats.drawCalls++;
    }

    // Ring system.
    if (body.rings && resources.ring && (this.simulation.renderFlags & RenderFlags.ShowPlanetRings) !== 0n) {
      gl.useProgram(this.programs.ring);
      const ur = this.bindCommon(this.programs.ring, true);
      ur.mat3('uBodyToScene', bodyToScene);
      ur.vec3('uCenter', relative.x, relative.y, relative.z);
      ur.vec3('uRadii', body.rings.outerRadius, body.rings.outerRadius, body.rings.outerRadius);
      ur.vec3('uSunDirection', sunDirection.x, sunDirection.y, sunDirection.z);
      ur.vec3('uRingColor', body.rings.color[0], body.rings.color[1], body.rings.color[2]);
      ur.vec3('uPlanetCenter', relative.x, relative.y, relative.z);
      ur.float('uPlanetRadius', body.radius);
      ur.float('uSunIrradiance', sunIrradiance);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.ring);
      ur.int('uRingTexture', 0);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.ringMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.ringMesh.count, this.ringMesh.indexType as number, 0);
      gl.enable(gl.CULL_FACE);
      this.stats.drawCalls++;
    }

    // The Sun additionally gets an additive halo, which is what makes it read as
    // a light source rather than a textured sphere.
    if (isSun) {
      const haloSize = clamp(pixelSize * 6.5, 24, 600);
      let offset = 0;
      offset = this.writeSprite(offset, relative, haloSize, haloSize, 0.5, [1.0, 0.92, 0.72, 1], [0, 0, 1, 1], 0);
      this.flushSprites(1);
      this.beginSpritePass(this.glowTexture, false);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.enable(gl.DEPTH_TEST);
      this.stats.drawCalls++;
    }
  }

  /** Draws a body too small to resolve as a lit sphere. */
  private pointBody(relative: Vec3, size: number, alpha: number, body: Body): void {
    const gl = this.gl;
    let offset = 0;
    const sunLike = body === this.universe.sol;
    offset = this.writeSprite(
      offset,
      relative,
      size * 2,
      size * 2,
      alpha,
      sunLike ? [1.0, 0.95, 0.8, 1] : [1, 0.96, 0.9, 1],
      [0, 0, 1, 1],
      0,
    );
    this.flushSprites(1);
    this.beginSpritePass(this.glowTexture, false);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.DEPTH_TEST);
    this.stats.drawCalls++;
  }

  // ----------------------------------------------------------------- orbits

  private drawOrbits(tdb: number, cameraPosition: Vec3): void {
    if ((this.simulation.renderFlags & RenderFlags.ShowOrbits) === 0n) return;
    const gl = this.gl;
    gl.useProgram(this.programs.line);
    const u = this.bindCommon(this.programs.line, false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const fading = (this.simulation.renderFlags & RenderFlags.ShowFadingOrbits) !== 0n;

    for (const body of this.universe.bodies) {
      if (!body.orbit) continue;
      if (!this.simulation.shouldShowOrbit(body.classification)) continue;

      const parentPosition = body.parent ? this.universe.getBodyScenePosition(body.parent, tdb) : vec3(0, 0, 0);
      const samples = this.orbitSamples(body, tdb);
      // Cache key is per body because the parent position changes every frame.
      const mesh = this.lineMeshFor(`orbit:${body.name}`, samples.vertices, samples.fades, cameraPosition, true);
      if (!mesh) continue;

      u.vec4('uColor', 0.45, 0.62, 0.95, 0.75);
      u.float('uFadeNear', fading ? 0 : 0);
      u.float('uFadeFar', fading ? 1e10 : 0);
      u.float('uCameraDistance', length(sub(parentPosition, cameraPosition)));
      u.float('uWriteDepth', 0);
      u.mat4('uView', this.viewMatrix);
      u.mat4('uProj', this.projectionMatrix);
      u.vec2('uViewport', this.canvas.width, this.canvas.height);
      u.float('uLogDepthFactor', 1 / Math.log2(this.observer.farPlane + 1));
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.LINES, 0, mesh.count);
      this.stats.drawCalls++;
    }
    gl.bindVertexArray(null);
  }

  /** Samples one full revolution of a body's orbit, in camera relative km. */
  private orbitSamples(body: Body, tdb: number): { vertices: number[]; fades: number[] } {
    const orbit = body.orbit;
    const vertices: number[] = [];
    const fades: number[] = [];
    if (!orbit) return { vertices, fades };

    const parentPosition = body.parent ? this.universe.getBodyScenePosition(body.parent, tdb) : vec3(0, 0, 0);
    const cameraPosition = this.observer.position;
    const sampleCount = 192;

    // Reuse the body's own position code by shifting the mean anomaly.
    const original = orbit.meanAnomalyAtEpoch;
    let previous: Vec3 | null = null;
    for (let i = 0; i <= sampleCount; i++) {
      const epochOffset = (orbit.period * i) / sampleCount;
      orbit.meanAnomalyAtEpoch = original + (2 * Math.PI * epochOffset) / orbit.period;
      const local = body.getPosition(tdb);
      const scene = add(parentPosition, local);
      const relative = sub(scene, cameraPosition);
      if (previous) {
        vertices.push(previous.x, previous.y, previous.z, relative.x, relative.y, relative.z);
        fades.push(1, 1);
      }
      previous = relative;
    }
    orbit.meanAnomalyAtEpoch = original;
    // The position cache on the body holds the perturbed value, so drop it.
    return { vertices, fades };
  }

  /** Builds or caches a line mesh keyed by name. */
  private lineMeshFor(
    key: string,
    vertices: number[],
    fades: number[],
    cameraPosition: Vec3,
    cameraRelative: boolean,
  ): { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] } | null {
    if (vertices.length < 6) return null;
    let mesh = this.lineCache.get(key);
    if (mesh) {
      // The orbit moves with its parent, so the buffer is refreshed whenever the
      // parent has moved relative to the camera.
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[0]);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.packLines(vertices, fades));
      return mesh;
    }

    const gl = this.gl;
    const packed = this.packLines(vertices, fades);
    const vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);
    void cameraRelative;
    void cameraPosition;
    mesh = { vao, count: vertices.length / 3, buffers: [buffer] };
    this.lineCache.set(key, mesh);
    return mesh;
  }

  private packLines(vertices: number[], fades: number[]): Float32Array {
    const count = vertices.length / 3;
    const packed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      packed[i * 4] = vertices[i * 3];
      packed[i * 4 + 1] = vertices[i * 3 + 1];
      packed[i * 4 + 2] = vertices[i * 3 + 2];
      packed[i * 4 + 3] = fades[i] ?? 1;
    }
    return packed;
  }

  // ---------------------------------------------------------- constellations

  private drawConstellations(): void {
    const gl = this.gl;
    const flags = this.simulation.renderFlags;
    const showLines = (flags & RenderFlags.ShowDiagrams) !== 0n;
    const showBorders = (flags & RenderFlags.ShowBoundaries) !== 0n;
    if (!showLines && !showBorders) return;

    gl.useProgram(this.programs.line);
    const u = this.bindCommon(this.programs.line, false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    u.float('uFadeNear', 0);
    u.float('uFadeFar', 0);
    u.float('uCameraDistance', 0);
    u.float('uWriteDepth', 0);

    const radius = this.constellationRadius();

    if (showLines) {
      const vertices: number[] = [];
      const fades: number[] = [];
      for (const segments of Object.values(this.universe.constellationLines)) {
        for (const segment of segments) {
          for (let i = 0; i < segment.length / 3 - 1; i++) {
            vertices.push(segment[i * 3] * radius, segment[i * 3 + 1] * radius, segment[i * 3 + 2] * radius);
            fades.push(1);
            vertices.push(segment[(i + 1) * 3] * radius, segment[(i + 1) * 3 + 1] * radius, segment[(i + 1) * 3 + 2] * radius);
            fades.push(1);
          }
        }
      }
      const mesh = this.staticLineMesh('constellation-lines', vertices, fades, radius);
      u.vec4('uColor', 0.32, 0.45, 0.95, 0.55);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.LINES, 0, mesh.count);
      this.stats.drawCalls++;
    }

    if (showBorders) {
      const vertices: number[] = [];
      const fades: number[] = [];
      for (const arc of this.universe.constellationBorders) {
        for (let i = 0; i < arc.length / 3 - 1; i++) {
          vertices.push(arc[i * 3] * radius, arc[i * 3 + 1] * radius, arc[i * 3 + 2] * radius);
          fades.push(0.6);
          vertices.push(arc[(i + 1) * 3] * radius, arc[(i + 1) * 3 + 1] * radius, arc[(i + 1) * 3 + 2] * radius);
          fades.push(0.6);
        }
      }
      const mesh = this.staticLineMesh('constellation-borders', vertices, fades, radius);
      u.vec4('uColor', 0.35, 0.5, 0.75, 0.35);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.LINES, 0, mesh.count);
      this.stats.drawCalls++;
    }
    gl.bindVertexArray(null);
  }

  /** Radius of the sphere the celestial line work is drawn on. */
  private constellationRadius(): number {
    return Math.min(this.observer.farPlane * 0.5, KM_PER_LY * 50);
  }

  private staticLineMesh(key: string, vertices: number[], fades: number[], radius: number): { vao: WebGLVertexArrayObject; count: number; buffers: WebGLBuffer[] } {
    const cacheKey = `${key}:${radius.toExponential(3)}`;
    const existing = this.gridCache.get(cacheKey);
    if (existing) return existing;

    const gl = this.gl;
    const packed = this.packLines(vertices, fades);
    const vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, packed, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);

    const mesh = { vao, count: vertices.length / 3, buffers: [buffer] };
    this.gridCache.set(cacheKey, mesh);
    return mesh;
  }

  // ------------------------------------------------------------------ grids

  private drawGrids(tdb: number, cameraPosition: Vec3): void {
    const flags = this.simulation.renderFlags;
    const gl = this.gl;
    const radius = this.constellationRadius();

    const jobs: Array<{ key: string; flag: bigint; transform: (p: [number, number, number]) => [number, number, number]; color: [number, number, number, number]; latitudeLimit?: [number, number] }> = [];

    if (flags & RenderFlags.ShowCelestialSphere) {
      jobs.push({
        key: 'grid-equatorial',
        flag: RenderFlags.ShowCelestialSphere,
        transform: (p) => p,
        color: [0.55, 0.55, 0.62, 0.5],
      });
    }

    if (flags & RenderFlags.ShowEclipticGrid) {
      const m = eclipticToEquatorialMatrix();
      jobs.push({
        key: 'grid-ecliptic',
        flag: RenderFlags.ShowEclipticGrid,
        transform: (p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]],
        color: [0.85, 0.7, 0.35, 0.5],
      });
    }

    if (flags & RenderFlags.ShowGalacticGrid) {
      const m = EQUATORIAL_TO_GALACTIC;
      jobs.push({
        key: 'grid-galactic',
        flag: RenderFlags.ShowGalacticGrid,
        transform: (p) => [m[0] * p[0] + m[3] * p[1] + m[6] * p[2], m[1] * p[0] + m[4] * p[1] + m[7] * p[2], m[2] * p[0] + m[5] * p[1] + m[8] * p[2]],
        color: [0.45, 0.8, 0.7, 0.5],
      });
    }

    if (flags & RenderFlags.ShowHorizonGrid) {
      // The horizon grid is tied to the observer's latitude and local sidereal
      // time, which is what makes it usable from a planet surface.
      const lat = this.observerLatitude();
      const lst = localSiderealTime(tdb, this.observerLongitude());
      const cosLst = Math.cos(lst);
      const sinLst = Math.sin(lst);
      const cosLat = Math.cos(Math.PI / 2 - lat);
      const sinLat = Math.sin(Math.PI / 2 - lat);
      jobs.push({
        key: `grid-horizon:${lat.toFixed(3)}:${Math.round(lst * 200)}`,
        flag: RenderFlags.ShowHorizonGrid,
        transform: (p) => {
          // Rotate into the local horizontal frame.
          const x = p[0] * cosLst - p[1] * sinLst;
          const y = p[0] * sinLst + p[1] * cosLst;
          const z = p[2];
          return [x, y * cosLat - z * sinLat, y * sinLat + z * cosLat];
        },
        color: [0.75, 0.6, 0.85, 0.5],
        latitudeLimit: [-90, 90],
      });
    }

    if (jobs.length === 0) return;

    gl.useProgram(this.programs.line);
    const u = this.bindCommon(this.programs.line, false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    u.float('uFadeNear', 0);
    u.float('uFadeFar', 0);
    u.float('uCameraDistance', 0);
    u.float('uWriteDepth', 0);

    for (const job of jobs) {
      const cached = this.gridCache.get(job.key);
      let mesh = cached;
      if (!mesh) {
        const grid = buildGrid({
          transform: job.transform,
          radius: 1,
          majorStep: 15,
          minorStep: 15,
          labelStep: 30,
          segments: 96,
        });
        mesh = this.staticLineMesh(job.key, grid.vertices, grid.fades, 1);
      }
      u.vec4('uColor', job.color[0], job.color[1], job.color[2], job.color[3]);
      // The grid is built on the unit sphere and scaled here.
      u.mat4('uView', this.scaleView(radius));
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.LINES, 0, mesh.count);
      this.stats.drawCalls++;
    }
    gl.bindVertexArray(null);
    u.mat4('uView', this.viewMatrix);
  }

  /** View matrix with an extra uniform scale, used to draw unit sphere line sets. */
  private scaleView(scale: number): Mat4 {
    const m = new Float32Array(this.viewMatrix);
    m[0] *= scale;
    m[1] *= scale;
    m[2] *= scale;
    m[4] *= scale;
    m[5] *= scale;
    m[6] *= scale;
    m[8] *= scale;
    m[9] *= scale;
    m[10] *= scale;
    return m;
  }

  private observerLatitude(): number {
    const body = this.simulation.getSelection().body;
    if (!body) return 0;
    const position = this.universe.getBodyScenePosition(body, this.simulation.getTime());
    const orientation = body.getOrientation(this.simulation.getTime());
    const relative = sub(this.observer.position, position);
    const local = vec3(
      orientation[0] * relative.x + orientation[3] * relative.y + orientation[6] * relative.z,
      orientation[1] * relative.x + orientation[4] * relative.y + orientation[7] * relative.z,
      orientation[2] * relative.x + orientation[5] * relative.y + orientation[8] * relative.z,
    );
    const r = length(local);
    return r === 0 ? 0 : Math.asin(clamp(local.z / r, -1, 1));
  }

  private observerLongitude(): number {
    const body = this.simulation.getSelection().body;
    if (!body) return 0;
    const position = this.universe.getBodyScenePosition(body, this.simulation.getTime());
    const orientation = body.getOrientation(this.simulation.getTime());
    const relative = sub(this.observer.position, position);
    const local = vec3(
      orientation[0] * relative.x + orientation[3] * relative.y + orientation[6] * relative.z,
      orientation[1] * relative.x + orientation[4] * relative.y + orientation[7] * relative.z,
      orientation[2] * relative.x + orientation[5] * relative.y + orientation[8] * relative.z,
    );
    return Math.atan2(local.y, local.x);
  }

  // ---------------------------------------------------------------- markers

  private drawMarkers(tdb: number): void {
    if ((this.simulation.renderFlags & RenderFlags.ShowMarkers) === 0n) return;
    const markers = this.markers.all();
    if (markers.length === 0) return;
    const gl = this.gl;
    const cameraPosition = this.observer.position;
    let quads = 0;
    let offset = 0;

    for (const marker of markers) {
      const world = this.universe.getSelectionScenePosition(marker.selection, tdb);
      marker.scenePosition = world;
      const relative = sub(world, cameraPosition);
      offset = this.writeSprite(offset, relative, marker.size, marker.size, marker.color[3], marker.color, [0, 0, 1, 1], 0);
      quads++;
      if (quads >= 4000) break;
    }

    if (quads === 0) return;
    this.flushSprites(quads);
    this.beginSpritePass(this.glowTexture, false);
    gl.disable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, quads * 6);
    gl.enable(gl.DEPTH_TEST);
    this.stats.drawCalls++;
  }

  // ----------------------------------------------------------------- labels

  private drawLabels(tdb: number, cameraPosition: Vec3): void {
    const batch = this.batch;
    batch.clear();
    const mode = this.simulation.labelMode;
    const flags = this.simulation.renderFlags;
    const width = this.width;
    const height = this.height;
    const fontSize = 12;
    const start = performance.now();

    for (let i = 0; i < this.universe.starCatalog.count; i++) {
      if ((mode & RenderLabels.StarLabels) === 0) break;
      const star = this.universe.starCatalog.getStar(i);
      if (!star?.names?.n) continue;
      if (star.apparentMag > this.simulation.getFaintestVisible() + 2.5) continue;

      const world = this.universe.starCatalog.getPosition(star);
      const relative = sub(world, cameraPosition);
      const screen = this.project(relative);
      if (!screen) continue;

      const colour: [number, number, number, number] = star === this.simulation.getSelection().star
        ? [1.0, 0.85, 0.2, 0.95]
        : [0.78, 0.82, 0.92, 0.85];
      batch.add(this.atlas, star.names.n, screen.x + 6, screen.y - 8, fontSize, colour, { align: 'left' });
      if (batch.quads.length > 3000) break;
    }

    if (mode & RenderLabels.ConstellationLabels) {
      for (const constellation of this.universe.constellations) {
        const radius = this.constellationRadius();
        const relative = vec3(constellation.label[0] * radius, constellation.label[1] * radius, constellation.label[2] * radius);
        const screen = this.project(sub(add(relative, cameraPosition), cameraPosition));
        if (!screen) continue;
        const useChinese = (mode & RenderLabels.I18nConstellationLabels) !== 0 && constellation.zh;
        batch.add(this.atlas, useChinese ? constellation.zh : constellation.la, screen.x, screen.y, fontSize + 1, [0.62, 0.68, 0.95, 0.75], { align: 'center' });
        if (batch.quads.length > 3000) break;
      }
    }

    if (mode & RenderLabels.LocationLabels) {
      for (const location of this.universe.locations.locations) {
        const world = this.universe.getLocationScenePosition(location, tdb);
        const relative = sub(world, cameraPosition);
        if (length(relative) > KM_PER_AU * MAX_LABEL_DISTANCE_AU) continue;
        const screen = this.project(relative);
        if (!screen) continue;
        batch.add(this.atlas, location.name, screen.x + 5, screen.y, fontSize - 1, [0.95, 0.85, 0.55, 0.9], { align: 'left' });
        if (batch.quads.length > 4000) break;
      }
    }

    // Body labels.
    for (const body of this.universe.bodies) {
      if (!this.simulation.shouldShowLabel(body.classification)) continue;
      if ((flags & ShowSolarSystemObjects) === 0n) continue;
      const world = this.universe.getBodyScenePosition(body, tdb);
      const relative = sub(world, cameraPosition);
      const screen = this.project(relative);
      if (!screen) continue;
      const selected = this.simulation.getSelection().body === body;
      const colour: [number, number, number, number] = selected ? [1.0, 0.85, 0.2, 0.95] : [0.85, 0.88, 0.95, 0.9];
      batch.add(this.atlas, body.localizedName, screen.x + 7, screen.y, fontSize, colour, { align: 'left' });
    }

    this.stats.frameMs += performance.now() - start;
    if (batch.quads.length === 0) return;

    this.renderTextBatch();
    void width;
    void height;
  }

  private renderTextBatch(): void {
    const gl = this.gl;
    const { data, count } = this.batch.pack();
    if (count === 0) return;

    this.atlas.flush(this.atlasTexture);

    gl.useProgram(this.programs.text);
    const u = this.uniforms.get(this.programs.text) as UniformCache;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture);
    u.int('uAtlas', 0);
    u.vec2('uViewport', this.canvas.width, this.canvas.height);
    gl.bindVertexArray(this.textVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 15);
    gl.drawArrays(gl.TRIANGLES, 0, count);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
  }

  /** Renders HUD strings, called by the shell after the scene is drawn. */
  drawHudText(lines: Array<{ text: string; x: number; y: number; size: number; color: [number, number, number, number]; align?: 'left' | 'center' | 'right'; weight?: number }>): void {
    if (lines.length === 0) return;
    const batch = this.batch;
    batch.clear();
    for (const line of lines) {
      batch.add(this.atlas, line.text, line.x, line.y, line.size, line.color, { align: line.align ?? 'left', weight: line.weight ?? 400 });
    }
    this.renderTextBatch();
  }

  // ---------------------------------------------------------------- picking

  /** Height of the drawing buffer in pixels, exposed for diagnostics. */
  get canvasHeight(): number {
    return this.canvas.height;
  }

  /** Projects a camera relative point to screen pixels, or null when behind. */
  project(relative: Vec3): { x: number; y: number; distance: number } | null {
    const m = this.viewProjection;
    const x = m[0] * relative.x + m[4] * relative.y + m[8] * relative.z + m[12];
    const y = m[1] * relative.x + m[5] * relative.y + m[9] * relative.z + m[13];
    const w = m[3] * relative.x + m[7] * relative.y + m[11] * relative.z + m[15];
    if (w <= 0) return null;
    const ndcX = x / w;
    const ndcY = y / w;
    if (ndcX < -1.4 || ndcX > 1.4 || ndcY < -1.4 || ndcY > 1.4) return null;
    return {
      x: ((ndcX + 1) / 2) * this.width,
      y: ((1 - ndcY) / 2) * this.height,
      distance: length(relative),
    };
  }

  /** Ray through a pixel, in the scene frame. */
  private pickRay(x: number, y: number): { origin: Vec3; direction: Vec3 } {
    const ndcX = (x / this.width) * 2 - 1;
    const ndcY = 1 - (y / this.height) * 2;
    const inv = this.invViewProjection;
    const nearPoint = this.unproject(inv, ndcX, ndcY, -1);
    const farPoint = this.unproject(inv, ndcX, ndcY, 1);
    const direction = normalize(sub(farPoint, nearPoint));
    return { origin: this.observer.position, direction };
  }

  private unproject(inv: Mat4, ndcX: number, ndcY: number, ndcZ: number): Vec3 {
    const x = inv[0] * ndcX + inv[4] * ndcY + inv[8] * ndcZ + inv[12];
    const y = inv[1] * ndcX + inv[5] * ndcY + inv[9] * ndcZ + inv[13];
    const z = inv[2] * ndcX + inv[6] * ndcY + inv[10] * ndcZ + inv[14];
    const w = inv[3] * ndcX + inv[7] * ndcY + inv[11] * ndcZ + inv[15];
    return vec3(x / w, y / w, z / w);
  }

  /**
   * Returns the selection under a pixel, or an empty selection. Bodies win over
   * stars, and among bodies the nearest intersection along the ray wins.
   */
  pick(x: number, y: number, tdb: number): Selection | null {
    const ray = this.pickRay(x, y);
    let bestBody: Body | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const body of this.universe.bodies) {
      if (!this.simulation.shouldShowBody(body.classification)) continue;
      const position = this.universe.getBodyScenePosition(body, tdb);
      const toBody = sub(position, ray.origin);
      const along = dot(toBody, ray.direction);
      if (along < 0) continue;
      const perpendicular = Math.sqrt(Math.max(0, dot(toBody, toBody) - along * along));
      // Allow a small screen space tolerance so small bodies stay clickable.
      const tolerance = Math.max(body.radius, along * 0.004);
      if (perpendicular > tolerance) continue;
      if (along < bestDistance) {
        bestDistance = along;
        bestBody = body;
      }
    }

    const angularTolerance = Math.tan(this.observer.fov * 0.02);

    let bestStar: Star | null = null;
    let bestStarScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.universe.starCatalog.count; i++) {
      const star = this.universe.starCatalog.getStar(i);
      if (!star) continue;
      const dotProduct = dot(star.direction, ray.direction);
      if (dotProduct < 0.9999) continue;
      const angular = Math.acos(clamp(dotProduct, -1, 1));
      if (angular > angularTolerance) continue;
      const score = angular * 10 + star.apparentMag * 0.0001;
      if (score < bestStarScore) {
        bestStarScore = score;
        bestStar = star;
      }
    }

    // A body in front of the star wins only when it is genuinely in the way, so
    // compare the angular separation of the body centre with the pick tolerance.
    if (bestBody && bestStar) {
      const position = this.universe.getBodyScenePosition(bestBody, tdb);
      const toBody = sub(position, ray.origin);
      const perpendicular = length(sub(toBody, mul(ray.direction, dot(toBody, ray.direction))));
      if (perpendicular > bestBody.radius) return Selection.forStar(bestStar);
    }

    if (bestBody) return Selection.forBody(bestBody);
    if (bestStar) return Selection.forStar(bestStar);

    // Surface locations.
    let bestLocation: Location | null = null;
    let bestLocationScore = Number.POSITIVE_INFINITY;
    for (const location of this.universe.locations.locations) {
      const world = this.universe.getLocationScenePosition(location, tdb);
      const toLocation = sub(world, ray.origin);
      const along = dot(toLocation, ray.direction);
      if (along < 0) continue;
      const perpendicular = length(sub(toLocation, mul(ray.direction, along)));
      const score = perpendicular / Math.max(along, 1);
      if (score < angularTolerance * 0.5 && score < bestLocationScore) {
        bestLocationScore = score;
        bestLocation = location;
      }
    }
    if (bestLocation) return Selection.forLocation(bestLocation);

    // Deep sky objects.
    for (const dso of this.universe.dsoCatalog.objects) {
      const direction = dso.position;
      const dotProduct = dot(direction, ray.direction);
      if (dotProduct < 0.99997) continue;
      return Selection.forDeepSky(dso);
    }

    return null;
  }

  // -------------------------------------------------------- selection pointer

  private drawSelectionPointer(tdb: number, cameraPosition: Vec3): void {
    const selection = this.simulation.getSelection();
    if (selection.isEmpty) return;
    const world = this.universe.getSelectionScenePosition(selection, tdb);
    const relative = sub(world, cameraPosition);

    const radius = selection.radius;
    const distance = length(relative);
    const pixelSize = radius > 0
      ? clamp(this.observer.pixelSizeOf(radius, distance, this.canvas.height) * 2.6 + 14, 14, 400)
      : 16;

    const gl = this.gl;
    gl.useProgram(this.programs.selection);
    const u = this.bindCommon(this.programs.selection, false);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    u.float('uPixelSize', pixelSize * this.pixelRatio);
    // The corners are placed on the screen aligned axes so the frame stays
    // axis aligned whatever the camera roll is.
    const up = this.observer.getUp();
    const right = this.observer.getRight();
    u.vec3('uCenter', relative.x, relative.y, relative.z);
    u.vec3('uRight', right.x * (this.pixelRatio / this.canvas.width) * 2 * distance * Math.tan(this.observer.fov / 2), right.y * (this.pixelRatio / this.canvas.width) * 2 * distance * Math.tan(this.observer.fov / 2), right.z * (this.pixelRatio / this.canvas.width) * 2 * distance * Math.tan(this.observer.fov / 2));
    const upScale = (this.pixelRatio / this.canvas.height) * 2 * distance * Math.tan(this.observer.fov / 2);
    u.vec3('uUp', up.x * upScale, up.y * upScale, up.z * upScale);
    u.float('uCos', 1);
    u.float('uSin', 0);
    u.vec4('uColor', 1.0, 1.0, 1.0, 0.85);

    const mesh = this.selectionQuad();
    gl.bindVertexArray(mesh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
  }

  private selectionQuadCache: WebGLVertexArrayObject | null = null;

  private selectionQuad(): WebGLVertexArrayObject {
    if (this.selectionQuadCache) return this.selectionQuadCache;
    const gl = this.gl;
    const vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Unit square corners, matching selpointer's in_Position attribute.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);
    this.selectionQuadCache = vao;
    return vao;
  }

  // ------------------------------------------------------------------ misc

  /** Approximate FPS sampled over the last second, used by the HUD. */
  private frameTimes: number[] = [];

  recordFrame(dtSeconds: number): void {
    this.frameTimes.push(dtSeconds);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
  }

  getAverageFrameRate(): number {
    if (this.frameTimes.length === 0) return 0;
    const sum = this.frameTimes.reduce((a, b) => a + b, 0);
    return sum > 0 ? this.frameTimes.length / sum : 0;
  }

  dispose(): void {
    const gl = this.gl;
    for (const program of Object.values(this.programs)) gl.deleteProgram(program);
    for (const mesh of [this.sphereHigh, this.sphereLow, this.ringMesh]) {
      gl.deleteVertexArray(mesh.vao);
      for (const buffer of mesh.buffers) gl.deleteBuffer(buffer);
    }
    for (const resources of this.bodyResources.values()) {
      gl.deleteTexture(resources.texture);
      if (resources.night) gl.deleteTexture(resources.night);
      if (resources.clouds) gl.deleteTexture(resources.clouds);
      if (resources.bump) gl.deleteTexture(resources.bump);
      if (resources.ring) gl.deleteTexture(resources.ring);
    }
    for (const mesh of this.gridCache.values()) {
      gl.deleteVertexArray(mesh.vao);
      for (const buffer of mesh.buffers) gl.deleteBuffer(buffer);
    }
    for (const mesh of this.lineCache.values()) {
      gl.deleteVertexArray(mesh.vao);
      for (const buffer of mesh.buffers) gl.deleteBuffer(buffer);
    }
    gl.deleteTexture(this.starTexture);
    gl.deleteTexture(this.glowTexture);
    gl.deleteTexture(this.atlasTexture);
    for (const texture of this.dsoTextures.values()) gl.deleteTexture(texture);
  }

  /** Renderer capabilities, shown by Help > OpenGL Info. */
  getInfo(): Record<string, string> {
    const gl = this.gl;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      'WebGL version': gl.getParameter(gl.VERSION) as string,
      'GLSL version': gl.getParameter(gl.SHADING_LANGUAGE_VERSION) as string,
      Vendor: debug ? (gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) as string) : (gl.getParameter(gl.VENDOR) as string),
      Renderer: debug ? (gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string),
      'Max texture size': String(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      'Max render buffer size': String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),
      'Max vertex attribs': String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)),
      'Max viewport dims': String((gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array).join(' x ')),
    };
  }
}

export { smoothstep, createLineMesh, SURFACE_ATTRIBUTES, SURFACE_STRIDE, mul, KM_PER_LY, J2000, MarkerSymbol, dot, meanEclipticObliquity };
type Location = import('@/core/locations').Location;
