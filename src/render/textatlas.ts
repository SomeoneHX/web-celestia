// Dynamic glyph atlas and batched text renderer.
//
// Labels and the HUD overlay are drawn in WebGL rather than as DOM elements, so
// the text lives in a texture atlas that grows on demand. Strings are rasterised
// white; colour comes from the per-quad vertex attribute, which is how Celestia
// tints its text passes.

export interface GlyphRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  width: number;
  height: number;
  /** Distance from the baseline to the top of the glyph box, in pixels. */
  ascent: number;
}

interface PlacedGlyph extends GlyphRect {
  x: number;
  y: number;
}

const ATLAS_SIZE = 2048;
const PADDING = 2;

export class TextAtlas {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly cache = new Map<string, GlyphRect>();

  /** Shelf packing cursor. */
  private cursorX = PADDING;
  private cursorY = PADDING;
  private shelfHeight = 0;
  private full = false;

  /** Region changed since the last upload, in pixels. */
  private dirty: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(private readonly gl: WebGL2RenderingContext, public readonly fontFamily: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_SIZE;
    this.canvas.height = ATLAS_SIZE;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('failed to create the text atlas canvas');
    this.context = context;
    this.context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    this.context.textBaseline = 'alphabetic';
    this.context.fillStyle = '#ffffff';
  }

  get size(): number {
    return ATLAS_SIZE;
  }

  /**
   * Returns the atlas rectangle for a string, rasterising it if it is not
   * already present.
   */
  get(text: string, fontSize: number, weight = 400, italic = false): GlyphRect {
    const key = `${fontSize}|${weight}|${italic ? 'i' : 'n'}|${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const font = `${italic ? 'italic ' : ''}${weight} ${fontSize}px ${this.fontFamily}`;
    this.context.font = font;
    const metrics = this.context.measureText(text);
    const width = Math.ceil(metrics.width) + PADDING * 2;
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize * 0.8);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * 0.25);
    const height = ascent + descent + PADDING * 2;

    const placed = this.allocate(width, height);
    if (!placed) {
      const fallback: GlyphRect = { u0: 0, v0: 0, u1: 0, v1: 0, width: 0, height: 0, ascent: 0 };
      this.cache.set(key, fallback);
      return fallback;
    }

    this.context.font = font;
    this.context.fillStyle = '#ffffff';
    this.context.fillText(text, placed.x + PADDING, placed.y + PADDING + ascent);

    const rect: GlyphRect = {
      u0: placed.x / ATLAS_SIZE,
      v0: placed.y / ATLAS_SIZE,
      u1: (placed.x + width) / ATLAS_SIZE,
      v1: (placed.y + height) / ATLAS_SIZE,
      width,
      height,
      ascent: ascent + PADDING,
    };
    this.cache.set(key, rect);

    this.markDirty(placed.x, placed.y, placed.x + width, placed.y + height);
    return rect;
  }

  private allocate(width: number, height: number): { x: number; y: number } | null {
    if (this.full) return null;
    if (this.cursorX + width + PADDING > ATLAS_SIZE) {
      this.cursorX = PADDING;
      this.cursorY += this.shelfHeight + PADDING;
      this.shelfHeight = 0;
    }
    if (this.cursorY + height + PADDING > ATLAS_SIZE) {
      this.full = true;
      return null;
    }
    const placed = { x: this.cursorX, y: this.cursorY };
    this.cursorX += width + PADDING;
    this.shelfHeight = Math.max(this.shelfHeight, height);
    return placed;
  }

  private markDirty(x0: number, y0: number, x1: number, y1: number): void {
    if (!this.dirty) {
      this.dirty = { x0, y0, x1, y1 };
      return;
    }
    this.dirty.x0 = Math.min(this.dirty.x0, x0);
    this.dirty.y0 = Math.min(this.dirty.y0, y0);
    this.dirty.x1 = Math.max(this.dirty.x1, x1);
    this.dirty.y1 = Math.max(this.dirty.y1, y1);
  }

  /** Uploads the changed region and returns true when the texture was touched. */
  flush(texture: WebGLTexture): boolean {
    const gl = this.gl;
    if (!this.dirty) return false;
    const { x0, y0, x1, y1 } = this.dirty;
    const width = x1 - x0;
    const height = y1 - y0;
    this.dirty = null;
    if (width <= 0 || height <= 0) return false;

    const sub = this.context.getImageData(x0, y0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, sub.data);
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.cursorX = PADDING;
    this.cursorY = PADDING;
    this.shelfHeight = 0;
    this.full = false;
    this.dirty = null;
    this.context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  }
}

/** One text quad, in pixel coordinates with the origin at the top left. */
export interface TextQuad {
  x: number;
  y: number;
  width: number;
  height: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** Depth in clip space; 0 keeps text in front of the scene. */
  depth: number;
}

/** Floats per vertex: corner, origin, uv rect, colour, size, depth. */
const FLOATS_PER_VERTEX = 15;
const VERTICES_PER_QUAD = 6;

/** Collects text quads for one frame and uploads them as a single buffer. */
export class TextBatch {
  readonly quads: TextQuad[] = [];
  private readonly data: Float32Array;

  constructor(maxQuads = 8000) {
    this.data = new Float32Array(maxQuads * VERTICES_PER_QUAD * FLOATS_PER_VERTEX);
  }

  clear(): void {
    this.quads.length = 0;
  }

  /** Appends a string, returning its advance width in pixels. */
  add(
    atlas: TextAtlas,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: [number, number, number, number] = [1, 1, 1, 1],
    options: { weight?: number; italic?: boolean; align?: 'left' | 'center' | 'right'; depth?: number } = {},
  ): number {
    if (!text) return 0;
    const glyph = atlas.get(text, fontSize, options.weight ?? 400, options.italic ?? false);
    if (glyph.width === 0) return 0;

    const drawX = options.align === 'center' ? x - glyph.width / 2 : options.align === 'right' ? x - glyph.width : x;
    this.quads.push({
      x: drawX,
      y,
      width: glyph.width,
      height: glyph.height,
      u0: glyph.u0,
      v0: glyph.v0,
      u1: glyph.u1,
      v1: glyph.v1,
      r: color[0],
      g: color[1],
      b: color[2],
      a: color[3],
      depth: options.depth ?? 0,
    });
    return glyph.width;
  }

  /** Packs the collected quads into the vertex buffer. Returns the vertex count. */
  pack(): { data: Float32Array; count: number } {
    // Corner order for two triangles: 0,0  1,0  0,1  1,0  1,1  0,1
    const corners: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [0, 1],
    ];

    let offset = 0;
    let vertices = 0;
    for (const quad of this.quads) {
      for (const [cx, cy] of corners) {
        if (offset + FLOATS_PER_VERTEX > this.data.length) {
          return { data: this.data, count: vertices };
        }
        this.data[offset++] = cx;
        this.data[offset++] = cy;
        this.data[offset++] = quad.x;
        this.data[offset++] = quad.y;
        this.data[offset++] = quad.u0;
        this.data[offset++] = quad.v0;
        this.data[offset++] = quad.u1;
        this.data[offset++] = quad.v1;
        this.data[offset++] = quad.r;
        this.data[offset++] = quad.g;
        this.data[offset++] = quad.b;
        this.data[offset++] = quad.a;
        this.data[offset++] = quad.width;
        this.data[offset++] = quad.height;
        this.data[offset++] = quad.depth;
        vertices++;
      }
    }

    return { data: this.data, count: vertices };
  }
}
