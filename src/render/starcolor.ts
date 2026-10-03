// Star colours from the B-V colour index.
//
// The colour tables Celestia offers in Preferences > Star colors are reproduced
// here: a Planckian blackbody spectrum converted through the CIE 1931 observer
// with three different whitepoints, plus the classic planetarium palette. The
// conversion follows the same chain Celestia uses in StarRenderer: B-V to
// effective temperature, temperature to chromaticity, chromaticity to linear
// sRGB and then a gamma encode.

import { clamp } from './glutil';

export type StarColorTable = 'Blackbody_D65' | 'SunWhite' | 'VegaWhite' | 'Enhanced';

export const STAR_COLOR_TABLES: Array<[StarColorTable, string]> = [
  ['Blackbody_D65', 'Blackbody D65'],
  ['SunWhite', 'Blackbody (Solar Whitepoint)'],
  ['VegaWhite', 'Blackbody (Vega Whitepoint)'],
  ['Enhanced', 'Classic colors'],
];

/** Ballesteros' approximation of effective temperature from B-V. */
export function colorIndexToTemperature(bv: number): number {
  const x = clamp(bv, -0.4, 2.0);
  return 4600 * (1 / (0.92 * x + 1.7) + 1 / (0.92 * x + 0.62));
}

/** Planck's law sampled at the CIE 1931 colour matching functions' key wavelengths. */
function planckianChromaticity(temperature: number): { x: number; y: number } {
  // Kim et al. cubic approximation, valid from 1667 K to 25000 K.
  const t = clamp(temperature, 1667, 25000);
  const t2 = t * t;
  const t3 = t2 * t;
  let x: number;
  if (t < 4000) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.179910;
  } else {
    x = -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.240390;
  }
  const x2 = x * x;
  const x3 = x2 * x;
  let y: number;
  if (t < 2222) {
    y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  } else if (t < 4000) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  }
  return { x, y };
}

interface XyzMatrix {
  m: [number, number, number, number, number, number, number, number, number];
}

const D65_MATRIX: XyzMatrix = {
  m: [
    3.2404542, -1.5371385, -0.4985314,
    -0.969266, 1.8760108, 0.041556,
    0.0556434, -0.2040259, 1.0572252,
  ],
};

/** Bradford adaptation from the Planckian whitepoint to the renderer whitepoint. */
function adaptedMatrix(whitepoint: 'D65' | 'Sun' | 'Vega'): XyzMatrix {
  if (whitepoint === 'D65') return D65_MATRIX;
  // The Sun and Vega whitepoints are close to D65 and to D58 respectively; the
  // matrices below are the standard sRGB matrices adapted to each.
  if (whitepoint === 'Vega') {
    return {
      m: [
        2.9515373, -1.2894116, -0.4738445,
        -0.0851093, 1.9908136, 0.0372026,
        0.0858749, -0.1930105, 1.0265279,
      ],
    };
  }
  return {
    m: [
      3.1338561, -1.6168667, -0.4906146,
      -0.9787684, 1.9161415, 0.033454,
      0.0719453, -0.2289914, 1.4052427,
    ],
  };
}

function temperatureToRgb(temperature: number, whitepoint: 'D65' | 'Sun' | 'Vega'): [number, number, number] {
  const { x, y } = planckianChromaticity(temperature);
  const z = 1 - x - y;
  const ySafe = y === 0 ? 1e-6 : y;
  const X = x / ySafe;
  const Y = 1;
  const Z = z / ySafe;

  const m = adaptedMatrix(whitepoint).m;
  let r = m[0] * X + m[1] * Y + m[2] * Z;
  let g = m[3] * X + m[4] * Y + m[5] * Z;
  let b = m[6] * X + m[7] * Y + m[8] * Z;

  // Normalise so the brightest channel sits at one; the renderer applies the
  // per-star brightness separately.
  const max = Math.max(r, g, b, 1e-6);
  r = Math.max(0, r / max);
  g = Math.max(0, g / max);
  b = Math.max(0, b / max);

  // Gamma encode towards display sRGB.
  const encode = (value: number) => (value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055);
  return [encode(r), encode(g), encode(b)];
}

/**
 * The classic planetarium palette Celestia exposes as "Classic colors": a
 * hand tuned ramp sampled at the spectral class boundaries.
 */
const CLASSIC_STOPS: Array<[number, [number, number, number]]> = [
  [-0.4, [0.62, 0.72, 1.0]],
  [-0.24, [0.68, 0.78, 1.0]],
  [-0.02, [0.86, 0.9, 1.0]],
  [0.3, [1.0, 1.0, 1.0]],
  [0.58, [1.0, 0.96, 0.88]],
  [0.83, [1.0, 0.88, 0.72]],
  [1.4, [1.0, 0.76, 0.55]],
  [2.0, [1.0, 0.68, 0.48]],
];

function classicColor(bv: number): [number, number, number] {
  const value = clamp(bv, CLASSIC_STOPS[0][0], CLASSIC_STOPS[CLASSIC_STOPS.length - 1][0]);
  for (let i = 1; i < CLASSIC_STOPS.length; i++) {
    if (value <= CLASSIC_STOPS[i][0]) {
      const [t0, c0] = CLASSIC_STOPS[i - 1];
      const [t1, c1] = CLASSIC_STOPS[i];
      const f = (value - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return CLASSIC_STOPS[CLASSIC_STOPS.length - 1][1];
}

// Precomputed lookup so the per-star path is a table read.
const TABLE_STEPS = 512;
const TABLE_MIN = -0.4;
const TABLE_MAX = 2.0;

const tables: Record<StarColorTable, Float32Array> = {
  Blackbody_D65: new Float32Array(TABLE_STEPS * 3),
  SunWhite: new Float32Array(TABLE_STEPS * 3),
  VegaWhite: new Float32Array(TABLE_STEPS * 3),
  Enhanced: new Float32Array(TABLE_STEPS * 3),
};

(function buildTables() {
  for (let i = 0; i < TABLE_STEPS; i++) {
    const bv = TABLE_MIN + ((TABLE_MAX - TABLE_MIN) * i) / (TABLE_STEPS - 1);
    const temperature = colorIndexToTemperature(bv);
    const d65 = temperatureToRgb(temperature, 'D65');
    const sun = temperatureToRgb(temperature, 'Sun');
    const vega = temperatureToRgb(temperature, 'Vega');
    const classic = classicColor(bv);
    tables.Blackbody_D65.set(d65, i * 3);
    tables.SunWhite.set(sun, i * 3);
    tables.VegaWhite.set(vega, i * 3);
    tables.Enhanced.set(classic, i * 3);
  }
})();

let activeTable: StarColorTable = 'Blackbody_D65';

export function setStarColorTable(table: StarColorTable): void {
  activeTable = table;
}

export function getStarColorTable(): StarColorTable {
  return activeTable;
}

/** Linear-ish sRGB colour for a B-V index, in the currently selected table. */
export function spectrumToRgb(bv: number): [number, number, number] {
  const table = tables[activeTable];
  const clamped = clamp(bv, TABLE_MIN, TABLE_MAX);
  const position = ((clamped - TABLE_MIN) / (TABLE_MAX - TABLE_MIN)) * (TABLE_STEPS - 1);
  const index = Math.floor(position);
  const next = Math.min(TABLE_STEPS - 1, index + 1);
  const f = position - index;
  const table0 = index * 3;
  const table1 = next * 3;
  return [
    table[table0] + (table[table1] - table[table0]) * f,
    table[table0 + 1] + (table[table1 + 1] - table[table0 + 1]) * f,
    table[table0 + 2] + (table[table1 + 2] - table[table0 + 2]) * f,
  ];
}

/** Hex string for a B-V index, used by the browser's colour swatches. */
export function bvToHex(bv: number): string {
  const [r, g, b] = spectrumToRgb(bv);
  const toByte = (v: number) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0');
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}
