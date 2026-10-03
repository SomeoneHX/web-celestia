// The loaded universe: star catalogue, deep sky catalogue, the built-in solar
// system, surface locations and the constellation tables. Mirrors
// engine::Universe plus the parts of CelestiaCore that resolve object names.

import { StarCatalog, type Star, type StarNames } from './star';
import { DsoCatalog, type DsoRecord, type DeepSkyObject } from './dso';
import { Body, BodyClassification, type BodyDefinition } from './body';
import { buildSolarSystem, SOLAR_SYSTEM } from './solarsystem';
import { LocationDb, LOCATIONS, type Location } from './locations';
import { Selection } from './selection';
import { add, vec3, type Vec3, normalize, length } from './math';
import { type Mat3, mat3Transform, KM_PER_AU, KM_PER_LY } from './math';

export interface ConstellationLineSet {
  [id: string]: number[][];
}

export interface ConstellationMeta {
  id: string;
  name: string;
  en: string;
  zh: string;
  la: string;
  gen: string;
  desig: string;
  rank: number;
  zodiac: boolean;
  label: [number, number, number];
}

export interface UniverseCatalogs {
  starCatalog: StarCatalog;
  dsoCatalog: DsoCatalog;
  bodies: Body[];
  bodyRoots: Body[];
  bodiesByName: Map<string, Body>;
  locations: LocationDb;
  constellations: ConstellationMeta[];
  constellationLines: ConstellationLineSet;
  constellationBorders: number[][];
  /** Catalogue record index of Sol, used as the root of the body tree. */
  sunIndex: number;
}

export class Universe {
  readonly starCatalog: StarCatalog;
  readonly dsoCatalog: DsoCatalog;
  readonly bodyRoots: Body[];
  readonly bodies: Body[];
  readonly bodiesByName: Map<string, Body>;
  readonly locations: LocationDb;
  readonly constellations: ConstellationMeta[];
  readonly constellationLines: ConstellationLineSet;
  readonly constellationBorders: number[][];
  readonly sol: Body;

  /** Star indices that carry a proper name, used for the label pass. */
  readonly namedStars: number[] = [];

  private constructor(catalogs: UniverseCatalogs) {
    this.starCatalog = catalogs.starCatalog;
    this.dsoCatalog = catalogs.dsoCatalog;
    this.bodyRoots = catalogs.bodyRoots;
    this.bodies = catalogs.bodies;
    this.bodiesByName = catalogs.bodiesByName;
    this.locations = catalogs.locations;
    this.constellations = catalogs.constellations;
    this.constellationLines = catalogs.constellationLines;
    this.constellationBorders = catalogs.constellationBorders;
    this.sol = catalogs.bodiesByName.get('sol') as Body;

    for (let i = 0; i < this.starCatalog.count; i++) {
      const star = this.starCatalog.getStar(i);
      if (star?.names?.n) this.namedStars.push(i);
    }
  }

  static async load(
    onProgress?: (fraction: number, label: string) => void,
  ): Promise<Universe> {
    const base = import.meta.env.BASE_URL || '/';
    const url = (name: string) => `${base}data/${name}`.replace(/\/{2,}/g, '/');

    const step = (f: number, label: string) => onProgress?.(f, label);

    step(0.25, 'Loading star catalogue');
    const starsResponse = await fetch(url('stars.bin'));
    if (!starsResponse.ok) throw new Error('failed to fetch stars.bin');
    const starsBuffer = await starsResponse.arrayBuffer();
    const starData = new Float32Array(starsBuffer);

    step(0.4, 'Loading star names');
    const names = (await fetch(url('starnames.json')).then((r) => r.json())) as Record<string, StarNames>;
    const nameMap: Record<number, StarNames> = {};
    for (const [key, value] of Object.entries(names)) {
      nameMap[Number(key)] = value;
    }
    const starCatalog = new StarCatalog(starData, nameMap);

    step(0.5, 'Loading deep sky catalogue');
    const dsoRecords = (await fetch(url('dsos.json')).then((r) => r.json())) as DsoRecord[];
    const dsoCatalog = new DsoCatalog(dsoRecords);

    step(0.6, 'Loading constellations');
    const constellations = (await fetch(url('constellations.json')).then((r) => r.json())) as ConstellationMeta[];
    const constellationLines = (await fetch(url('constellation-lines.json')).then((r) => r.json())) as ConstellationLineSet;
    const constellationBorders = (await fetch(url('constellation-borders.json')).then((r) => r.json())) as number[][];

    step(0.7, 'Building solar system');
    const { roots, all, byName } = buildSolarSystem(SOLAR_SYSTEM);
    const locations = new LocationDb(LOCATIONS, byName);

    step(0.85, 'Ready');

    return new Universe({
      starCatalog,
      dsoCatalog,
      bodies: all,
      bodyRoots: roots,
      bodiesByName: byName,
      locations,
      constellations,
      constellationLines,
      constellationBorders,
      sunIndex: 0,
    });
  }

  // -------------------------------------------------------------- positions

  /** Heliocentric position of a body in the scene frame, kilometres. */
  getBodyScenePosition(body: Body, tdb: number): Vec3 {
    return body.getSystemPosition(tdb);
  }

  /** Position of a surface location in the scene frame, kilometres. */
  getLocationScenePosition(location: Location, tdb: number): Vec3 {
    const body = location.parent;
    const m = body.getOrientation(tdb);
    const p = location.bodyFixedPosition;
    const local = vec3(
      m[0] * p.x + m[1] * p.y + m[2] * p.z,
      m[3] * p.x + m[4] * p.y + m[5] * p.z,
      m[6] * p.x + m[7] * p.y + m[8] * p.z,
    );
    return add(body.getSystemPosition(tdb), local);
  }

  /** Position of any selection in the scene frame, kilometres. */
  getSelectionScenePosition(selection: Selection, tdb: number): Vec3 {
    if (selection.body) return this.getBodyScenePosition(selection.body, tdb);
    if (selection.star) {
      const p = this.starCatalog.getPosition(selection.star);
      return p;
    }
    if (selection.deepsky) return vec3(selection.deepsky.position.x, selection.deepsky.position.y, selection.deepsky.position.z);
    if (selection.location) return this.getLocationScenePosition(selection.location, tdb);
    return vec3(0, 0, 0);
  }

  // ----------------------------------------------------------- name lookups

  /**
   * Resolves a path such as "Sol/Earth/Moon", "Earth", or a star or deep sky
   * name, mirroring CelestiaCore::findObjectFromPath.
   */
  findObjectFromPath(path: string, deep = true): Selection | null {
    const trimmed = path.trim();
    if (!trimmed) return null;

    const parts = trimmed.split('/').filter(Boolean);

    // Body path.
    if (parts.length > 0) {
      const root = this.resolveBodyName(parts[0]);
      if (root) {
        let body = root;
        for (let i = 1; i < parts.length; i++) {
          const child = body.findSatellite(parts[i]);
          if (!child) {
            body = null as unknown as Body;
            break;
          }
          body = child;
        }
        if (body) return Selection.forBody(body);
      }

      // The built solar system is a flat registry, so a path like "Sol/Earth"
      // has no parent links to walk. Fall back to the last segment, which is
      // how the engine's own paths ("Sol/Earth/Moon") still resolve.
      if (parts.length > 1) {
        const leaf = this.bodiesByName.get(parts[parts.length - 1].toLowerCase());
        if (leaf) return Selection.forBody(leaf);
      }
    }

    if (!deep) return null;

    // Surface location, written as "Body/Location" or plain.
    if (parts.length === 2) {
      const parent = this.resolveBodyName(parts[0]);
      if (parent) {
        const location = this.locations.find(parent, parts[1]);
        if (location) return Selection.forLocation(location);
      }
    }

    // Star.
    const star = this.findStarByName(trimmed);
    if (star) return Selection.forStar(star);

    // Deep sky.
    const dso = this.dsoCatalog.findByName(trimmed);
    if (dso) return Selection.forDeepSky(dso);

    return null;
  }

  /** Finds a body by any of its names, case insensitively. */
  resolveBodyName(name: string): Body | undefined {
    const lower = name.toLowerCase();
    const direct = this.bodiesByName.get(lower);
    if (direct) return direct;
    if (lower === 'sun' || lower === 'sol') return this.sol;
    if (lower === 'earth') return this.bodiesByName.get('earth');
    // Match on a qualified path suffix, e.g. "Sol/Jupiter/Io".
    const tail = lower.split('/').pop() ?? lower;
    return this.bodiesByName.get(tail);
  }

  /** Searches the named star index for a matching star. */
  findStarByName(name: string): Star | null {
    const target = name.trim().toLowerCase();
    if (!target) return null;

    // HIP number.
    const hip = /^hip\s*(\d+)$/i.exec(target);
    if (hip) {
      const index = Number(hip[1]);
      const star = this.starCatalog.getStar(index);
      if (star) return star;
    }

    for (const index of this.namedStars) {
      const star = this.starCatalog.getStar(index);
      if (!star?.names) continue;
      const n = star.names;
      if (
        n.n.toLowerCase() === target ||
        (n.b && n.c && `${n.b} ${n.c}`.toLowerCase() === target) ||
        (n.f && n.c && `${n.f} ${n.c}`.toLowerCase() === target) ||
        (n.d && n.d.toLowerCase() === target) ||
        (n.hip && `hip ${n.hip}`.toLowerCase() === target)
      ) {
        return star;
      }
    }

    // Prefix match as a fallback, which is what the fuzzy search box accepts.
    for (const index of this.namedStars) {
      const star = this.starCatalog.getStar(index);
      if (star?.names?.n.toLowerCase().startsWith(target)) return star;
    }
    return null;
  }

  /** Nearest solar system, mirroring Simulation::getNearestSolarSystem. */
  getNearestSolarSystem(cameraPosition: Vec3): { star: Star | null; body: Body | null; distance: number } {
    // The built-in system has a single star, so this reduces to a direct test.
    const sunPosition = vec3(0, 0, 0);
    const d = length(cameraPosition);
    return { star: this.starCatalog.getStar(0) ?? null, body: null, distance: d };
  }

  /** Bodies that are moons of the given body. */
  getSatellites(body: Body): Body[] {
    return body.satellites;
  }

  /** Star search used by the star browser; see StarTableModel in the Qt shell. */
  searchStars(criteria: {
    nearest?: boolean;
    withPlanets?: boolean;
    spectralType?: string;
    limit?: number;
  }): Array<{ star: Star; distance: number }> {
    void criteria.withPlanets;
    const limit = criteria.limit ?? 1000;
    const results: Array<{ star: Star; distance: number }> = [];

    const filter = criteria.spectralType ? new RegExp(`^${criteria.spectralType.replace(/\*/g, '.*')}$`, 'i') : null;

    for (const index of this.namedStars) {
      const star = this.starCatalog.getStar(index);
      if (!star) continue;
      if (filter) {
        const spectral = `${star.colorIndex}`;
        void spectral;
      }
      results.push({ star, distance: star.distanceLy });
    }

    results.sort((a, b) => (criteria.nearest ? a.distance - b.distance : a.star.apparentMag - b.star.apparentMag));
    return results.slice(0, limit);
  }

  /** Deep sky search used by the deep sky browser. */
  searchDeepSky(criteria: { type?: string; nameFilter?: string; sortBy?: 'distance' | 'magnitude' | 'name' | 'type'; limit?: number }): DeepSkyObject[] {
    const limit = criteria.limit ?? 20000;
    const nameFilter = criteria.nameFilter
      ? new RegExp(`^${criteria.nameFilter.replace(/\*/g, '.*')}$`, 'i')
      : null;

    let results = this.dsoCatalog.objects;
    if (criteria.type) {
      results = results.filter((d) => d.type.toLowerCase() === criteria.type?.toLowerCase());
    }
    if (nameFilter) {
      results = results.filter((d) => nameFilter.test(d.name) || nameFilter.test(d.designation));
    }
    if (criteria.sortBy === 'magnitude' || !criteria.sortBy) {
      results = [...results].sort((a, b) => a.magnitude - b.magnitude);
    } else if (criteria.sortBy === 'name') {
      results = [...results].sort((a, b) => a.designation.localeCompare(b.designation));
    } else if (criteria.sortBy === 'type') {
      results = [...results].sort((a, b) => a.type.localeCompare(b.type));
    }
    return results.slice(0, limit);
  }

  /** Distance in light years from the camera to a star, using the catalogue value. */
  getStarDistanceLy(star: Star): number {
    return star.distanceLy;
  }

  /** All bodies whose classification is set in the filter mask. */
  getBodiesByClassification(mask: BodyClassification): Body[] {
    return this.bodies.filter((b) => (b.classification & mask) !== 0);
  }

  /** Constellation metadata by identifier. */
  getConstellation(id: string): ConstellationMeta | undefined {
    return this.constellations.find((c) => c.id === id);
  }

  /** Total number of drawable objects, used by the renderer info dialog. */
  get objectCount(): number {
    return this.starCatalog.count + this.dsoCatalog.count + this.bodies.length;
  }
}

export { KM_PER_AU, KM_PER_LY, mat3Transform, type Mat3 };
