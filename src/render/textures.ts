// Procedurally generated surface, cloud, night side and ring maps.
//
// Celestia loads its planet textures from the data package, which is not part of
// the source tree. To keep the renderer self contained every map is generated
// here from value noise: an equirectangular height field is built with fractal
// Brownian motion, optionally domain warped, then coloured through a per body
// ramp. Airless bodies additionally get a crater population from a second noise
// channel; gas giants get latitude bands. The maps are deterministic, so the
// same body always looks the same.

export interface PlanetStyle {
  /** Colour ramp stops, sampled by normalised height. */
  ramp: Array<[number, number, number, number]>;
  /** Number of fBm octaves. */
  octaves: number;
  /** Base frequency of the first octave, cycles across the full longitude. */
  frequency: number;
  /** Amplitude of higher octaves. */
  persistence: number;
  /** Domain warp strength, in units of the base period. */
  warp: number;
  /** Latitude banding strength; used for gas giants. */
  bands: number;
  /** Band frequency in cycles from pole to pole. */
  bandFrequency: number;
  /** Crater density, 0 for bodies with an atmosphere. */
  craters: number;
  /** Fraction of the surface covered by ice caps, from the poles. */
  ice: number;
  /** Latitude at which the cap starts, in degrees. */
  iceLatitude: number;
  /** Sea level; heights below it become water and are drawn flat. */
  seaLevel: number;
  /** Ridge noise strength, which carves canyon systems. */
  ridged: number;
  /** Polar flattening applied to the height field. */
  contrast: number;
}

const defaultStyle: PlanetStyle = {
  ramp: [[0, 40, 40, 45], [1, 200, 200, 200]],
  octaves: 6,
  frequency: 4,
  persistence: 0.5,
  warp: 0,
  bands: 0,
  bandFrequency: 12,
  craters: 0,
  ice: 0,
  iceLatitude: 70,
  seaLevel: -1,
  ridged: 0,
  contrast: 1,
};

export const PLANET_STYLES: Record<string, PlanetStyle> = {
  sun: {
    ramp: [
      [0.0, 255, 200, 90],
      [0.45, 255, 236, 170],
      [0.75, 255, 252, 224],
      [1.0, 255, 255, 250],
    ],
    octaves: 5,
    frequency: 9,
    persistence: 0.55,
    warp: 0.6,
    bands: 0,
    bandFrequency: 0,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 1.4,
  },
  earth: {
    ramp: [
      [0.0, 4, 18, 48],
      [0.46, 8, 42, 96],
      [0.5, 16, 62, 118],
      [0.505, 196, 182, 140],
      [0.55, 74, 108, 52],
      [0.68, 46, 86, 40],
      [0.82, 108, 96, 74],
      [0.93, 150, 148, 142],
      [1.0, 246, 248, 252],
    ],
    octaves: 8,
    frequency: 3.4,
    persistence: 0.52,
    warp: 0.9,
    bands: 0,
    bandFrequency: 0,
    craters: 0,
    ice: 0.08,
    iceLatitude: 74,
    seaLevel: 0.5,
    ridged: 0.35,
    contrast: 1.15,
  },
  mars: {
    ramp: [
      [0.0, 74, 38, 24],
      [0.35, 138, 70, 38],
      [0.6, 184, 108, 62],
      [0.8, 208, 150, 100],
      [1.0, 232, 200, 168],
    ],
    octaves: 7,
    frequency: 5,
    persistence: 0.5,
    warp: 0.7,
    bands: 0,
    bandFrequency: 0,
    craters: 0.5,
    ice: 0.05,
    iceLatitude: 82,
    seaLevel: -1,
    ridged: 0.5,
    contrast: 1.1,
  },
  venus: {
    ramp: [
      [0.0, 168, 130, 62],
      [0.4, 206, 172, 100],
      [0.75, 232, 208, 148],
      [1.0, 248, 236, 196],
    ],
    octaves: 6,
    frequency: 6,
    persistence: 0.5,
    warp: 1.2,
    bands: 0,
    bandFrequency: 0,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 0.9,
  },
  mercury: {
    ramp: [
      [0.0, 52, 50, 48],
      [0.45, 108, 104, 100],
      [0.75, 148, 144, 140],
      [1.0, 186, 182, 178],
    ],
    octaves: 7,
    frequency: 7,
    persistence: 0.55,
    warp: 0.4,
    bands: 0,
    bandFrequency: 0,
    craters: 1.0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.2,
    contrast: 1.0,
  },
  moon: {
    ramp: [
      [0.0, 38, 36, 34],
      [0.4, 92, 90, 88],
      [0.7, 142, 140, 136],
      [1.0, 196, 194, 190],
    ],
    octaves: 8,
    frequency: 6,
    persistence: 0.55,
    warp: 0.5,
    bands: 0,
    bandFrequency: 0,
    craters: 1.0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.15,
    contrast: 1.05,
  },
  jupiter: {
    ramp: [
      [0.0, 132, 96, 70],
      [0.22, 196, 164, 128],
      [0.42, 232, 216, 190],
      [0.58, 186, 140, 104],
      [0.76, 226, 200, 170],
      [1.0, 158, 118, 88],
    ],
    octaves: 5,
    frequency: 8,
    persistence: 0.62,
    warp: 1.6,
    bands: 1.0,
    bandFrequency: 18,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 0.85,
  },
  saturn: {
    ramp: [
      [0.0, 158, 132, 92],
      [0.3, 208, 186, 142],
      [0.6, 236, 220, 178],
      [1.0, 246, 236, 206],
    ],
    octaves: 5,
    frequency: 7,
    persistence: 0.55,
    warp: 1.2,
    bands: 0.85,
    bandFrequency: 14,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 0.8,
  },
  uranus: {
    ramp: [
      [0.0, 132, 190, 196],
      [0.45, 172, 218, 222],
      [1.0, 206, 238, 240],
    ],
    octaves: 3,
    frequency: 5,
    persistence: 0.45,
    warp: 0.6,
    bands: 0.35,
    bandFrequency: 9,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 0.6,
  },
  neptune: {
    ramp: [
      [0.0, 30, 56, 138],
      [0.4, 56, 92, 186],
      [0.75, 96, 132, 214],
      [1.0, 174, 198, 236],
    ],
    octaves: 5,
    frequency: 6,
    persistence: 0.5,
    warp: 1.4,
    bands: 0.5,
    bandFrequency: 11,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 0.75,
  },
  pluto: {
    ramp: [
      [0.0, 92, 70, 58],
      [0.38, 150, 122, 100],
      [0.62, 206, 186, 162],
      [1.0, 240, 232, 220],
    ],
    octaves: 6,
    frequency: 5,
    persistence: 0.5,
    warp: 0.6,
    bands: 0,
    bandFrequency: 0,
    craters: 0.4,
    ice: 0.06,
    iceLatitude: 78,
    seaLevel: -1,
    ridged: 0.3,
    contrast: 1.1,
  },
  io: {
    ramp: [
      [0.0, 156, 118, 32],
      [0.35, 214, 188, 84],
      [0.6, 240, 222, 140],
      [0.82, 200, 130, 60],
      [1.0, 246, 240, 214],
    ],
    octaves: 6,
    frequency: 7,
    persistence: 0.55,
    warp: 0.9,
    bands: 0,
    bandFrequency: 0,
    craters: 0.15,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.25,
    contrast: 1.2,
  },
  europa: {
    ramp: [
      [0.0, 178, 168, 152],
      [0.45, 220, 214, 202],
      [0.7, 194, 132, 96],
      [1.0, 240, 238, 232],
    ],
    octaves: 5,
    frequency: 8,
    persistence: 0.5,
    warp: 0.5,
    bands: 0,
    bandFrequency: 0,
    craters: 0.1,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.7,
    contrast: 0.8,
  },
  ganymede: {
    ramp: [
      [0.0, 84, 78, 72],
      [0.42, 140, 132, 124],
      [0.7, 176, 170, 162],
      [1.0, 208, 204, 198],
    ],
    octaves: 6,
    frequency: 6,
    persistence: 0.5,
    warp: 0.45,
    bands: 0,
    bandFrequency: 0,
    craters: 0.6,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.4,
    contrast: 1.0,
  },
  callisto: {
    ramp: [
      [0.0, 46, 40, 34],
      [0.42, 96, 86, 76],
      [0.72, 142, 132, 120],
      [1.0, 190, 182, 170],
    ],
    octaves: 7,
    frequency: 7,
    persistence: 0.55,
    warp: 0.4,
    bands: 0,
    bandFrequency: 0,
    craters: 1.0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.1,
    contrast: 1.05,
  },
  titan: {
    ramp: [
      [0.0, 120, 74, 24],
      [0.4, 176, 118, 44],
      [0.72, 214, 160, 76],
      [1.0, 236, 196, 122],
    ],
    octaves: 5,
    frequency: 5,
    persistence: 0.5,
    warp: 1.0,
    bands: 0.3,
    bandFrequency: 7,
    craters: 0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0,
    contrast: 0.8,
  },
  enceladus: {
    ramp: [
      [0.0, 200, 206, 214],
      [0.5, 232, 236, 242],
      [1.0, 252, 253, 255],
    ],
    octaves: 5,
    frequency: 7,
    persistence: 0.45,
    warp: 0.3,
    bands: 0,
    bandFrequency: 0,
    craters: 0.5,
    ice: 0.1,
    iceLatitude: 60,
    seaLevel: -1,
    ridged: 0.5,
    contrast: 0.7,
  },
  triton: {
    ramp: [
      [0.0, 150, 128, 116],
      [0.45, 196, 178, 166],
      [1.0, 232, 226, 220],
    ],
    octaves: 5,
    frequency: 6,
    persistence: 0.5,
    warp: 0.5,
    bands: 0,
    bandFrequency: 0,
    craters: 0.2,
    ice: 0.08,
    iceLatitude: 62,
    seaLevel: -1,
    ridged: 0.6,
    contrast: 0.9,
  },
  iapetus: {
    ramp: [
      [0.0, 24, 20, 18],
      [0.48, 34, 28, 24],
      [0.52, 190, 182, 170],
      [1.0, 226, 222, 214],
    ],
    octaves: 6,
    frequency: 5,
    persistence: 0.5,
    warp: 0.3,
    bands: 0,
    bandFrequency: 0,
    craters: 0.8,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.2,
    contrast: 1.0,
  },
  icy: {
    ramp: [
      [0.0, 152, 156, 164],
      [0.5, 198, 202, 210],
      [1.0, 236, 238, 244],
    ],
    octaves: 6,
    frequency: 6,
    persistence: 0.5,
    warp: 0.3,
    bands: 0,
    bandFrequency: 0,
    craters: 0.8,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.25,
    contrast: 1.0,
  },
  'rocky-dark': {
    ramp: [
      [0.0, 26, 24, 22],
      [0.45, 62, 58, 54],
      [0.8, 96, 92, 88],
      [1.0, 132, 128, 124],
    ],
    octaves: 7,
    frequency: 8,
    persistence: 0.55,
    warp: 0.4,
    bands: 0,
    bandFrequency: 0,
    craters: 1.0,
    ice: 0,
    iceLatitude: 0,
    seaLevel: -1,
    ridged: 0.15,
    contrast: 1.0,
  },
};

// ------------------------------------------------------------------- noise

// Value noise over a permutation table. Table lookups are several times cheaper
// than hashing the lattice coordinates per sample, which matters because a single
// 512x256 map evaluates millions of lattice corners.

const TABLE_SIZE = 256;
const TABLE_MASK = 255;

/** One permutation table per seed, built once and reused. */
const permutationCache = new Map<number, Uint8Array>();

function permutationFor(seed: number): Uint8Array {
  const cached = permutationCache.get(seed);
  if (cached) return cached;

  const table = new Uint8Array(TABLE_SIZE * 2);
  const base = new Uint8Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) base[i] = i;

  // Fisher-Yates driven by a small xorshift generator so the table is
  // deterministic for a given seed.
  let state = seed || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = TABLE_SIZE - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < TABLE_SIZE; i++) {
    table[i] = base[i];
    table[i + TABLE_SIZE] = base[i];
  }

  permutationCache.set(seed, table);
  return table;
}

function smoothCurve(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Trilinear value noise on the integer lattice. */
function valueNoise(x: number, y: number, z: number, table: Uint8Array): number {
  const xi = x | 0;
  const yi = y | 0;
  const zi = z | 0;
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const X = xi & TABLE_MASK;
  const Y = yi & TABLE_MASK;
  const Z = zi & TABLE_MASK;
  const X1 = (X + 1) & TABLE_MASK;
  const Y1 = (Y + 1) & TABLE_MASK;
  const Z1 = (Z + 1) & TABLE_MASK;

  const a = table[X] + Y;
  const b = table[X1] + Y;
  const c = table[X] + Y1;
  const d = table[X1] + Y1;

  const c000 = table[table[a] + Z] * (1 / 255);
  const c100 = table[table[b] + Z] * (1 / 255);
  const c010 = table[table[c] + Z] * (1 / 255);
  const c110 = table[table[d] + Z] * (1 / 255);
  const c001 = table[table[a] + Z1] * (1 / 255);
  const c101 = table[table[b] + Z1] * (1 / 255);
  const c011 = table[table[c] + Z1] * (1 / 255);
  const c111 = table[table[d] + Z1] * (1 / 255);

  const u = smoothCurve(xf);
  const v = smoothCurve(yf);
  const w = smoothCurve(zf);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Fractional Brownian motion over value noise. */
function fbm(x: number, y: number, z: number, octaves: number, persistence: number, seed: number): number {
  const table = permutationFor(seed);
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency, z * frequency, table) * amplitude;
    total += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return total > 0 ? sum / total : 0;
}

/** Ridged multifractal, used for canyon and fracture networks. */
function ridgedNoise(x: number, y: number, z: number, octaves: number, seed: number): number {
  const table = permutationFor(seed);
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * frequency, y * frequency, z * frequency, table) * 2 - 1);
    sum += n * n * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total > 0 ? sum / total : 0;
}

/**
 * Crater field: sparse impact basins with a bowl floor and a raised rim. Two
 * crater scales are enough to read as a heavily cratered surface, and keeping the
 * neighbour search to 2x2x2 cells per scale keeps the cost down.
 */
function craterField(x: number, y: number, z: number, table: Uint8Array, density: number): number {
  let result = 0;
  const scales: Array<[number, number, number]> = [
    [9, 0.62, 0.85],
    [23, 0.34, 0.34],
  ];
  for (let s = 0; s < scales.length; s++) {
    const [cells, weight, radius] = scales[s];
    const px = x * cells;
    const py = y * cells;
    const pz = z * cells;
    const cx = Math.round(px);
    const cy = Math.round(py);
    const cz = Math.round(pz);
    const ox0 = cx & TABLE_MASK;
    const oy0 = cy & TABLE_MASK;
    const oz0 = cz & TABLE_MASK;
    for (let dz = 0; dz < 2; dz++) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = (ox0 + dx) & TABLE_MASK;
          const sy = (oy0 + dy) & TABLE_MASK;
          const sz = (oz0 + dz) & TABLE_MASK;
          const h1 = table[table[table[sx] + sy] + sz];
          if (h1 > density * 255) continue;
          const ox = table[table[table[sx + 37] + sy] + sz] / 255 - 0.5;
          const oy = table[table[table[sx] + sy + 91] + sz] / 255 - 0.5;
          const oz = table[table[table[sx] + sy] + sz + 143] / 255 - 0.5;
          const scale = 0.6 + (table[table[table[sx] + sy + 7] + sz + 11] / 255) * 0.8;
          const r = radius * scale;
          const ddx = px - (cx + dx - 1 + ox);
          const ddy = py - (cy + dy - 1 + oy);
          const ddz = pz - (cz + dz - 1 + oz);
          const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) / r;
          if (d < 1) {
            result -= weight * (1 - d * d);
          } else if (d < 1.35) {
            result += weight * 0.3 * (1 - (d - 1) / 0.35);
          }
        }
      }
    }
  }
  return result;
}

function sampleRamp(ramp: Array<[number, number, number, number]>, t: number): [number, number, number] {
  const clamped = Math.min(Math.max(t, 0), 1);
  for (let i = 1; i < ramp.length; i++) {
    if (clamped <= ramp[i][0]) {
      const [t0, r0, g0, b0] = ramp[i - 1];
      const [t1, r1, g1, b1] = ramp[i];
      const span = t1 - t0 || 1;
      const f = (clamped - t0) / span;
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const last = ramp[ramp.length - 1];
  return [last[1], last[2], last[3]];
}

export type MapKind = 'surface' | 'night' | 'clouds' | 'bump';

export interface GeneratedMap {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Builds one equirectangular map for a body.
 *
 * `surface` is the day side albedo, `bump` a single channel mask used for
 * specular highlights and relief, `clouds` an RGBA layer with the alpha channel
 * carrying coverage and `night` the emissive night side.
 */
export function generatePlanetMap(kindId: string, kind: MapKind, width: number, height: number): GeneratedMap {
  const style = PLANET_STYLES[kindId] ?? defaultStyle;
  const data = new Uint8Array(width * height * 4);
  // Each body gets its own noise field, keyed off the style so two bodies with
  // the same style still look alike, which is what the shared styles intend.
  const seed = hashSeed(kindId);

  const sinLat = new Float32Array(height);

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const lat = (0.5 - v) * Math.PI;
    const cosLat = Math.cos(lat);
    sinLat[y] = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const lon = u * Math.PI * 2;

      // Position on the unit sphere, used as the noise domain so the map is
      // seamless across the date line and free of polar pinching.
      const px = cosLat * Math.cos(lon);
      const py = cosLat * Math.sin(lon);
      const pz = Math.sin(lat);

      const index = (y * width + x) * 4;

      if (kind === 'night') {
        // Sparse city lights, biased towards continents and away from the poles.
        const cluster = fbm(px * 26, py * 26, pz * 26, 3, 0.6, seed + 31);
        const fine = fbm(px * 120, py * 120, pz * 120, 2, 0.5, seed + 47);
        const land = continentality(px, py, pz, style, seed);
        const density = Math.max(0, cluster - 0.52) * 3.4 * Math.max(0, land - style.seaLevel + 0.06) * Math.max(0, cosLat - 0.12);
        const lit = Math.min(1, density * (0.35 + fine * 1.2));
        const warm = 1 - Math.min(1, fine * 0.8);
        data[index] = Math.round(lit * 255 * (0.9 + warm * 0.1));
        data[index + 1] = Math.round(lit * 255 * 0.82);
        data[index + 2] = Math.round(lit * 255 * (0.55 + warm * 0.15));
        data[index + 3] = 255;
        continue;
      }

      if (kind === 'clouds') {
        const warpX = fbm(px * 5, py * 5, pz * 5, 3, 0.5, seed + 61) - 0.5;
        const wx = px + warpX * 0.5;
        const wy = py + warpX * 0.5;
        const wz = pz + warpX * 0.5;
        // Banded structure: more cloud in the tropics and the storm belts.
        const belt = 0.5 + 0.5 * Math.cos(lat * 6);
        const coverage = fbm(wx * 7, wy * 7, wz * 7, 6, 0.55, seed + 83);
        let a = (coverage - 0.42) * (1.7 + belt * 0.9);
        a = Math.min(1, Math.max(0, a));
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = Math.round(a * 255);
        continue;
      }

      let h = heightAt(px, py, pz, style, seed);

      if (style.bands > 0) {
        // Latitude bands with turbulent edges, the structure that dominates gas
        // giant appearance.
        const bandValue = Math.sin(lat * style.bandFrequency);
        const turb = (fbm(px * 3.5, py * 3.5, pz * 3.5, 4, 0.6, seed + 13) - 0.5) * 2;
        h = h * (1 - style.bands) + style.bands * (0.5 + bandValue * 0.45 * (1 + turb * 0.6));
      }

      h = Math.min(1, Math.max(0, (h - 0.5) * style.contrast + 0.5));

      // Polar caps.
      if (style.ice > 0) {
        const capStart = Math.cos((style.iceLatitude * Math.PI) / 180);
        const polar = Math.abs(cosLat);
        if (polar < capStart) {
          const t = Math.min(1, (capStart - polar) / Math.max(style.ice, 1e-3));
          h = h * (1 - t) + 1.0 * t;
        }
      }

      if (kind === 'bump') {
        // Water is smooth, land is rough: the mask drives specular highlights.
        const isWater = style.seaLevel >= 0 && h < style.seaLevel;
        const value = isWater ? 26 : Math.round(h * 120 + 60);
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
        continue;
      }

      const [r, g, b] = sampleRamp(style.ramp, h);
      data[index] = Math.round(Math.min(255, Math.max(0, r)));
      data[index + 1] = Math.round(Math.min(255, Math.max(0, g)));
      data[index + 2] = Math.round(Math.min(255, Math.max(0, b)));
      data[index + 3] = 255;
    }
  }

  return { width, height, data };
}

function continentality(px: number, py: number, pz: number, style: PlanetStyle, seed: number): number {
  const warp = style.warp > 0 ? (fbm(px * 2, py * 2, pz * 2, 2, 0.5, seed + 7) - 0.5) * style.warp : 0;
  return fbm((px + warp) * style.frequency, (py + warp) * style.frequency, (pz + warp) * style.frequency, style.octaves, style.persistence, seed);
}

function heightAt(px: number, py: number, pz: number, style: PlanetStyle, seed: number): number {
  let h = continentality(px, py, pz, style, seed);

  if (style.ridged > 0) {
    const ridge = ridgedNoise(px * style.frequency * 1.6, py * style.frequency * 1.6, pz * style.frequency * 1.6, 4, seed + 23);
    h = h * (1 - style.ridged) + h * ridge * 2 * style.ridged;
  }

  if (style.craters > 0) {
    h += craterField(px, py, pz, permutationFor(seed + 5), style.craters) * 0.35;
  }

  // Polar flattening of the height field keeps the caps smooth.
  return Math.min(1, Math.max(0, h));
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ------------------------------------------------------------------ sprites

/**
 * Star sprite. Celestia's data package ships a point spread function texture;
 * this reproduces the same shape: a tight core with a wide faint halo.
 */
export function generateStarTexture(size = 64): GeneratedMap {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.sqrt(dx * dx + dy * dy);
      let a = 0;
      if (r < 1) {
        // A tight core plus a wide faint halo, sized so that even a three pixel
        // sprite lands on the bright part of the profile.
        const core = Math.exp(-(r * r) / 0.10);
        const halo = Math.exp(-(r * r) / 0.45) * 0.22;
        const edge = 1 - smoothStep(0.90, 1.0, r);
        a = Math.min(1, (core + halo) * edge);
      }
      const index = (y * size + x) * 4;
      const value = Math.round(a * 255);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = value;
    }
  }
  return { width: size, height: size, data };
}

/** Soft round glow, used for the Sun halo and for marker discs. */
export function generateGlowTexture(size = 128): GeneratedMap {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      const a = Math.pow(1 - r, 3.2);
      const index = (y * size + x) * 4;
      const value = Math.round(a * 255);
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = value;
    }
  }
  return { width: size, height: size, data };
}

/** Deep sky object sprites, one per morphological class. */
export function generateDsoTexture(type: 'Galaxy' | 'Nebula' | 'Globular cluster' | 'Open cluster' | 'Other', size = 96): GeneratedMap {
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) / 2;
  const seed = hashSeed(type);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      let a = 0;
      let tint: [number, number, number] = [255, 245, 225];

      if (type === 'Galaxy') {
        // Elliptical core plus a disc seen at a slight inclination.
        const ry = dy * 2.4;
        const rr = Math.sqrt(dx * dx + ry * ry);
        const core = Math.exp(-(rr * rr) / 0.012);
        const disc = Math.exp(-rr / 0.45) * 0.35 * (1 - smoothStep(0.55, 1.0, rr));
        a = Math.min(1, core + disc);
        tint = [255, 238, 206];
      } else if (type === 'Nebula') {
        const n = fbm(dx * 4, dy * 4, 0.5, 5, 0.55, seed);
        const shell = 1 - smoothStep(0.25, 0.95, r);
        a = Math.min(1, Math.max(0, (n - 0.35) * 2.2) * shell);
        tint = [190, 215, 255];
      } else if (type === 'Globular cluster') {
        const n = fbm(dx * 9, dy * 9, 1.7, 3, 0.6, seed);
        a = Math.min(1, Math.pow(Math.max(0, 1 - r), 2.6) * (0.55 + n * 0.9));
        tint = [255, 240, 200];
      } else if (type === 'Open cluster') {
        const n = fbm(dx * 12, dy * 12, 3.1, 3, 0.65, seed);
        a = Math.min(1, Math.max(0, (n - 0.48) * 3.2) * (1 - smoothStep(0.3, 1.0, r)));
        tint = [220, 232, 255];
      } else {
        a = Math.pow(Math.max(0, 1 - r), 3) * 0.6;
      }

      const index = (y * size + x) * 4;
      data[index] = tint[0];
      data[index + 1] = tint[1];
      data[index + 2] = tint[2];
      data[index + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  return { width: size, height: size, data };
}

/**
 * Ring texture: a one dimensional strip of particle bands addressable by radius,
 * matching the radial coordinate the ring mesh supplies.
 */
export function generateRingTexture(bodyName: string, width = 1024): GeneratedMap {
  const data = new Uint8Array(width * 4);
  const seed = hashSeed(bodyName);
  const isSaturn = bodyName === 'Saturn';
  const isUranus = bodyName === 'Uranus';

  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    let a = 0;
    let brightness = 1;

    if (isSaturn) {
      // The Cassini division and the Encke gap are the two features that make
      // Saturn's rings recognisable.
      const band = fbm(t * 90, 0.5, 0.5, 5, 0.55, seed);
      a = 0.35 + band * 0.75;
      if (t < 0.03) a *= t / 0.03;
      if (t > 0.97) a *= (1 - t) / 0.03;
      const cassini = 1 - Math.exp(-Math.pow((t - 0.63) / 0.022, 2));
      a *= cassini;
      const encke = 1 - 0.85 * Math.exp(-Math.pow((t - 0.88) / 0.008, 2));
      a *= encke;
      const inner = 1 - 0.55 * Math.exp(-Math.pow((t - 0.12) / 0.05, 2));
      a *= inner;
      a *= 0.55 + fbm(t * 240, 1.5, 2.5, 3, 0.5, seed + 9) * 0.6;
      brightness = 0.85 + fbm(t * 30, 3.5, 1.5, 3, 0.5, seed + 17) * 0.3;
    } else if (isUranus) {
      // Uranus has narrow, dark rings.
      for (const centre of [0.12, 0.28, 0.42, 0.56, 0.7, 0.85, 0.95]) {
        a += Math.exp(-Math.pow((t - centre) / 0.006, 2)) * 0.9;
      }
      a *= 0.55;
      brightness = 0.6;
    } else {
      const band = fbm(t * 60, 0.5, 0.5, 4, 0.5, seed);
      a = Math.max(0, band - 0.45) * 1.4;
      brightness = 0.5;
    }

    a = Math.min(1, Math.max(0, a));
    data[x * 4] = Math.round(255 * brightness);
    data[x * 4 + 1] = Math.round(255 * brightness);
    data[x * 4 + 2] = Math.round(255 * brightness);
    data[x * 4 + 3] = Math.round(a * 255);
  }

  return { width, height: 1, data };
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}
