// Deep sky objects, mirroring engine::DeepSkyObject and DSOCatalog.

import { normalize, mul, mat3Transform, type Vec3, vec3 } from './math';
import { galacticToEquatorialMatrix } from './astro';

export type DsoType = 'Galaxy' | 'Nebula' | 'Planetary nebula' | 'Globular cluster' | 'Open cluster' | 'Cluster' | 'Star' | 'Other';

export interface DsoRecord {
  id: string;
  desig: string;
  name: string;
  type: string;
  mag: number;
  dim: string;
  vec: [number, number, number];
  messier: boolean;
}

export interface DeepSkyObject {
  index: number;
  id: string;
  designation: string;
  name: string;
  type: string;
  magnitude: number;
  dimensions: string;
  position: Vec3;
}

export const DSO_DEFAULT_ABS_MAGNITUDE = -30.0;

export class DsoCatalog {
  readonly objects: DeepSkyObject[];
  private readonly byId = new Map<string, number>();
  private readonly nameIndex = new Map<string, number>();

  constructor(records: DsoRecord[]) {
    this.objects = records.map((r, index) => ({
      index,
      id: r.id,
      designation: r.desig,
      name: r.name,
      type: r.type,
      magnitude: r.mag,
      dimensions: r.dim,
      position: mul(vec3(r.vec[0], r.vec[1], r.vec[2]), 1),
    }));

    this.objects.forEach((o, i) => {
      this.byId.set(o.id.toUpperCase(), i);
      if (o.designation) this.byId.set(o.designation.toUpperCase(), i);
      if (o.name) {
        for (const part of o.name.split(' / ')) {
          this.nameIndex.set(part.trim().toUpperCase(), i);
        }
      }
    });
  }

  get count(): number {
    return this.objects.length;
  }

  /** Case insensitive lookup by catalogue identifier or common name. */
  findByName(name: string): DeepSkyObject | undefined {
    const key = name.trim().toUpperCase();
    const direct = this.byId.get(key) ?? this.nameIndex.get(key);
    if (direct !== undefined) return this.objects[direct];
    // "M42" and "M 42" both resolve.
    const collapsed = key.replace(/\s+/g, '');
    for (const [k, i] of this.byId) {
      if (k.replace(/\s+/g, '') === collapsed) return this.objects[i];
    }
    return undefined;
  }

  getDSOName(dso: DeepSkyObject): string {
    if (dso.designation) return dso.designation;
    if (dso.name) return dso.name;
    return dso.id;
  }

  getNameList(dso: DeepSkyObject): string[] {
    const list: string[] = [];
    if (dso.designation) list.push(dso.designation);
    if (dso.name) list.push(...dso.name.split(' / ').map((s) => s.trim()).filter(Boolean));
    if (list.length === 0) list.push(dso.id);
    return list;
  }

  /** Approximate radius in kilometres, derived from the catalogued size. */
  getRadius(dso: DeepSkyObject): number {
    const first = dso.dimensions.split('x')[0];
    const arcmin = Number(first);
    if (!Number.isFinite(arcmin) || arcmin <= 0) return 1000;
    // Treat the object as being at a representative distance for its class, so
    // that the on-screen size stays plausible rather than fixed.
    const assumedDistanceLy = dso.type === 'Galaxy' ? 3.0e7 : 5000;
    const kmPerLy = 9460730472580.8;
    const angular = (arcmin / 60) * (Math.PI / 180);
    return Math.tan(angular / 2) * assumedDistanceLy * kmPerLy;
  }

  /** Galactic longitude and latitude, in radians. */
  getGalacticCoordinates(dso: DeepSkyObject): { l: number; b: number } {
    const g = mat3Transform(galacticToEquatorialMatrix(), dso.position);
    return { l: Math.atan2(g.y, g.x), b: Math.asin(normalize(g).z) };
  }

  /** Direction from right ascension and declination in degrees. */
  static fromRaDec(raDeg: number, decDeg: number): Vec3 {
    const ra = (raDeg * Math.PI) / 180;
    const dec = (decDeg * Math.PI) / 180;
    return vec3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  }
}
