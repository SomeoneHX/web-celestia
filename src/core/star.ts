// Star records, mirroring engine::Star and StarCatalog.

import { type Vec3, vec3, mul, normalize } from './math';
import { lumToAbsMag, lumToAppMag } from './astro';

export interface StarNames {
  /** Proper name, e.g. "Sirius". Empty when the star has none. */
  n: string;
  /** Bayer designation letter, e.g. "alf". */
  b: string;
  /** Flamsteed number. */
  f: string;
  /** Variable star designation. */
  v: string;
  /** IAU constellation abbreviation, e.g. "CMa". */
  c: string;
  /** Catalogue designation used when nothing else is available. */
  d: string;
  /** Henry Draper number. */
  hd: string;
  /** Hipparcos number. */
  hip: string;
}

export interface Star {
  /** Record index within the catalogue. */
  index: number;
  /** Unit vector towards the star in the J2000 equatorial frame. */
  direction: Vec3;
  /** Distance in light years. */
  distanceLy: number;
  /** Visual apparent magnitude as measured from the Sun. */
  apparentMag: number;
  /** B-V colour index. */
  colorIndex: number;
  /** Absolute visual magnitude, derived from the distance estimate. */
  absoluteMag: number;
  /** Luminosity relative to the Sun. */
  luminosity: number;
  names?: StarNames;
}

/** Coarse spectral classification from the B-V colour index. */
const SPECTRAL_CLASSES: Array<[number, string]> = [
  [-0.3, 'O'],
  [0.0, 'B'],
  [0.3, 'A'],
  [0.6, 'F'],
  [0.9, 'G'],
  [1.4, 'K'],
  [2.0, 'M'],
];

export function spectralTypeFromColorIndex(bv: number): string {
  let cls = 'M';
  for (const [limit, name] of SPECTRAL_CLASSES) {
    if (bv < limit) {
      cls = name;
      break;
    }
  }
  // Sub-class within the letter, roughly linear over the band boundaries.
  const bands: Record<string, [number, number]> = {
    O: [-0.4, -0.3],
    B: [-0.3, 0.0],
    A: [0.0, 0.3],
    F: [0.3, 0.6],
    G: [0.6, 0.9],
    K: [0.9, 1.4],
    M: [1.4, 2.0],
  };
  const [lo, hi] = bands[cls];
  const sub = Math.min(9, Math.max(0, Math.round(((bv - lo) / (hi - lo)) * 9)));
  return `${cls}${sub}`;
}

/** Effective temperature in kelvin, from the B-V index. */
export function temperatureFromColorIndex(bv: number): number {
  const bvClamped = Math.min(Math.max(bv, -0.4), 2.0);
  // Ballesteros' formula, as used by several planetarium codes.
  return Math.round(4600 * (1 / (0.92 * bvClamped + 1.7) + 1 / (0.92 * bvClamped + 0.62)));
}

export class StarCatalog {
  private readonly data: Float32Array;
  private readonly names: Record<number, StarNames>;
  private readonly cache = new Map<number, Star>();

  readonly count: number;

  constructor(data: Float32Array, names: Record<number, StarNames>) {
    this.data = data;
    this.names = names;
    this.count = data.length / 6;
  }

  getStar(index: number): Star | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const cached = this.cache.get(index);
    if (cached) return cached;

    const offset = index * 6;
    const direction = normalize(vec3(this.data[offset], this.data[offset + 1], this.data[offset + 2]));
    const apparentMag = this.data[offset + 3];
    const colorIndex = this.data[offset + 4];
    const distanceLy = this.data[offset + 5];
    const trueDistance = Math.max(distanceLy, 0.001);
    const absoluteMag = apparentMag - 5 * Math.log10(trueDistance * 3.26156377716743356213863970704550837409) + 5;

    const star: Star = {
      index,
      direction,
      distanceLy: trueDistance,
      apparentMag,
      colorIndex,
      absoluteMag,
      luminosity: Math.pow(10, (4.83 - absoluteMag) / 2.5),
      names: this.names[index],
    };
    this.cache.set(index, star);
    return star;
  }

  /** Position relative to the solar system barycentre, in kilometres. */
  getPosition(star: Star): Vec3 {
    const kmPerLy = 9460730472580.8;
    return mul(star.direction, star.distanceLy * kmPerLy);
  }

  /** Display name, following Celestia's priority order. */
  getStarName(star: Star): string {
    const n = star.names;
    if (!n) return `HIP ${star.index}`;
    if (n.n) return n.n;
    if (n.b && n.c) return `${n.b} ${n.c}`;
    if (n.f && n.c) return `${n.f} ${n.c}`;
    if (n.v && n.c) return `${n.v} ${n.c}`;
    if (n.d) return n.d;
    if (n.hip) return `HIP ${n.hip}`;
    if (n.hd) return `HD ${n.hd}`;
    return `HIP ${star.index}`;
  }

  /** Every name a star is known by, used by the information panel header. */
  getNameList(star: Star): string[] {
    const n = star.names;
    const list: string[] = [];
    if (!n) return [`HIP ${star.index}`];
    if (n.n) list.push(n.n);
    if (n.b && n.c) list.push(`${n.b} ${n.c}`);
    if (n.f && n.c) list.push(`${n.f} ${n.c}`);
    if (n.v && n.c) list.push(`${n.v} ${n.c}`);
    if (n.d) list.push(n.d);
    if (n.hd) list.push(`HD ${n.hd}`);
    if (n.hip) list.push(`HIP ${n.hip}`);
    if (list.length === 0) list.push(`HIP ${star.index}`);
    return list;
  }

  /** Expand Greek letter abbreviations such as "alf" into "α". */
  static replaceGreekLetterAbbr(name: string): string {
    const map: Record<string, string> = {
      alf: 'α', bet: 'β', gam: 'γ', del: 'δ', eps: 'ε', zet: 'ζ', eta: 'η',
      the: 'θ', iot: 'ι', kap: 'κ', lam: 'λ', mu: 'μ', nu: 'ν', ksi: 'ξ',
      omi: 'ο', pi: 'π', rho: 'ρ', sig: 'σ', tau: 'τ', ups: 'υ', phi: 'φ',
      chi: 'χ', psi: 'ψ', ome: 'ω',
    };
    const parts = name.split(' ');
    if (parts.length === 2 && map[parts[0].toLowerCase()]) {
      return `${map[parts[0].toLowerCase()]} ${parts[1]}`;
    }
    return name;
  }
}

export { lumToAbsMag, lumToAppMag };
