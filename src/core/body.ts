// Solar system bodies, mirroring engine::Body together with the two ephemeris
// models that Celestia uses for the built-in solar system: EllipticalOrbit
// (src/celephem/orbit.cpp) and UniformRotation (src/celephem/rotation.cpp).
//
// Coordinate system
// -----------------
// Positions and orientations are expressed in the J2000 equatorial frame, the
// same frame the star catalogue uses:
//
//   +X  towards (RA 0h, Dec 0)
//   +Y  towards (RA 6h, Dec 0)
//   +Z  towards the north celestial pole
//
// Orbital elements are defined in the J2000 ecliptic frame, so every element
// set is rotated into the equatorial frame on the way out. The conversion is
// the same rotation the wasm module applies in eclipticToEquatorial().

import { type Vec3, vec3, mul, add, normalize, cross, length, degToRad, mat3FromColumns, type Mat3, type Quat, quatFromMatrix, quatIdentity, rotateAround, mat3AxisAngle, mat3Transform, mat3Mul, mat3XRotation, KM_PER_AU, SOLAR_RADIUS, J2000 } from './math';

/** J2000 mean obliquity, the angle between the ecliptic and the equator. */
export const OBLIQUITY = degToRad(23.4392911);

/** Rotates a direction from the J2000 ecliptic frame to the equatorial frame. */
export function eclipticToEquatorialVec(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY);
  const s = Math.sin(OBLIQUITY);
  return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
}

/**
 * Celestia's BodyClassification, from celengine/body.h, bit for bit.
 *
 * The values are the engine's: the shell passes them straight through, so a bit
 * that differs here names the wrong thing. It is also an exact-value set for
 * display purposes -- qtinfopanel.cpp and qtsolarsystembrowser.cpp both switch
 * on the whole value rather than testing bits.
 */
export enum BodyClassification {
  EmptyMask = 0,
  Planet = 0x01,
  Moon = 0x02,
  Asteroid = 0x04,
  Comet = 0x08,
  Spacecraft = 0x10,
  Invisible = 0x20,
  Barycenter = 0x40,
  SmallBody = 0x80,
  DwarfPlanet = 0x100,
  Stellar = 0x200,
  SurfaceFeature = 0x400,
  Component = 0x800,
  MinorMoon = 0x1000,
  Diffuse = 0x2000,
  Unknown = 0x10000,
}

/**
 * objectTypeName from qtsolarsystembrowser.cpp: the Type column of the solar
 * system browser. A star is a Star, or a Barycenter when it is not visible.
 */
export function classificationName(c: number, isStar = false, visible = true): string {
  if (isStar) return visible ? 'Star' : 'Barycenter';

  switch (c) {
    case BodyClassification.Planet: return 'Planet';
    case BodyClassification.DwarfPlanet: return 'Dwarf planet';
    case BodyClassification.Moon: return 'Moon';
    case BodyClassification.MinorMoon: return 'Minor moon';
    case BodyClassification.Asteroid: return 'Asteroid';
    case BodyClassification.Comet: return 'Comet';
    case BodyClassification.Spacecraft: return 'Spacecraft';
    case BodyClassification.Invisible: return 'Reference point';
    case BodyClassification.Component: return 'Component';
    case BodyClassification.SurfaceFeature: return 'Surface feature';
    default: return 'Unknown';
  }
}

/**
 * classificationName from qtsolarsystembrowser.cpp, the group headings used when
 * the tree is grouped by class. The plural names are Celestia's.
 */
export function groupClassName(c: BodyClassification): string {
  switch (c) {
    case BodyClassification.Planet: return 'Planets';
    case BodyClassification.Moon: return 'Moons';
    case BodyClassification.Spacecraft: return 'Spacecraft';
    case BodyClassification.Asteroid: return 'Asteroids & comets';
    case BodyClassification.Invisible: return 'Reference points';
    case BodyClassification.MinorMoon: return 'Minor moons';
    case BodyClassification.Component: return 'Components';
    case BodyClassification.SurfaceFeature: return 'Surface features';
    default: return 'Other objects';
  }
}

/** Keplerian elements. Lengths are kilometres, angles radians, period days. */
export interface EllipticalOrbit {
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  ascendingNode: number;
  argPericenter: number;
  meanAnomalyAtEpoch: number;
  period: number;
  epoch: number;
  /** Extra rotation taking the parent's ecliptic frame onto the orbit plane. */
  orbitPlaneRotation?: Mat3;
}

/** Uniform rotation about a fixed axis. */
export interface UniformRotation {
  /** Sidereal rotation period in days; negative means retrograde. */
  period: number;
  /** Angle between the rotation axis and the parent's orbit normal. */
  obliquity: number;
  /** Node of the body equator on the parent's orbit plane. */
  ascendingNode: number;
  /** Rotation angle of the prime meridian at the epoch. */
  meridianAngle: number;
  epoch: number;
}

export interface Atmosphere {
  /** Scale height in kilometres. */
  height: number;
  /** RGB at the horizon, 0..1. */
  rayleigh: [number, number, number];
  mie: number;
  /** Radius of the visible shell relative to the body radius. */
  cloudHeight: number;
  /** Colour of the cloud layer. */
  cloudColor: [number, number, number];
}

export interface RingSystem {
  innerRadius: number;
  outerRadius: number;
  color: [number, number, number];
  /** Albedo of the ring material, used for the brightness of the band. */
  albedo: number;
}

export interface TextureSet {
  /** Identifier of the procedurally generated surface map. */
  surface: string;
  /** Night side emissive map, Earth only. */
  night?: string;
  /** Cloud layer. */
  clouds?: string;
  /** Normal or bump map identifier. */
  bump?: string;
}

export interface BodyDefinition {
  name: string;
  localizedName?: string;
  classification: BodyClassification;
  radius: number;
  oblateness?: number;
  albedo?: number;
  textures?: TextureSet;
  atmosphere?: Atmosphere;
  rings?: RingSystem;
  orbit?: EllipticalOrbit;
  rotation?: UniformRotation;
  satellites?: BodyDefinition[];
  /** Bodies whose position is taken from a sampled ephemeris rather than Kepler. */
  fixedPosition?: Vec3;
}

export class Body {
  readonly name: string;
  readonly localizedName: string;
  readonly classification: BodyClassification;
  /** Equatorial radius in kilometres. */
  readonly radius: number;
  readonly oblateness: number;
  readonly albedo: number;
  readonly textures: TextureSet | null;
  readonly atmosphere: Atmosphere | null;
  readonly rings: RingSystem | null;
  readonly orbit: EllipticalOrbit | null;
  readonly rotation: UniformRotation;

  parent: Body | null = null;
  readonly satellites: Body[] = [];
  /** Radius of the bounding sphere used for picking, in kilometres. */
  readonly boundingRadius: number;

  /** Cached orientation basis, refreshed per frame. */
  private orientationCache: { tdb: number; matrix: Mat3 } | null = null;
  private positionCache: { tdb: number; position: Vec3 } | null = null;

  constructor(def: BodyDefinition) {
    this.name = def.name;
    this.localizedName = def.localizedName ?? def.name;
    this.classification = def.classification;
    this.radius = def.radius;
    this.oblateness = def.oblateness ?? 0;
    this.albedo = def.albedo ?? 0.5;
    this.textures = def.textures ?? null;
    this.atmosphere = def.atmosphere ?? null;
    this.rings = def.rings ?? null;
    this.orbit = def.orbit ?? null;
    this.rotation = def.rotation ?? {
      period: 1,
      obliquity: 0,
      ascendingNode: 0,
      meridianAngle: 0,
      epoch: J2000,
    };
    this.boundingRadius = def.rings ? Math.max(def.radius, def.rings.outerRadius) : def.radius;
  }

  get isEllipsoid(): boolean {
    return this.oblateness !== 0;
  }

  /** Polar radius, accounting for the flattening. */
  get polarRadius(): number {
    return this.radius * (1 - this.oblateness);
  }

  /** Semi-axes of the ellipsoid, [equatorial, equatorial, polar]. */
  get radii(): Vec3 {
    return vec3(this.radius, this.radius, this.polarRadius);
  }

  /** Position relative to the parent body, in kilometres, at a TDB instant. */
  getPosition(tdb: number): Vec3 {
    if (this.positionCache && this.positionCache.tdb === tdb) return this.positionCache.position;
    const p = this.computePosition(tdb);
    this.positionCache = { tdb, position: p };
    return p;
  }

  private computePosition(tdb: number): Vec3 {
    if (!this.orbit) return vec3(0, 0, 0);

    const o = this.orbit;
    const meanMotion = (2 * Math.PI) / o.period;
    const meanAnomaly = o.meanAnomalyAtEpoch + (tdb - o.epoch) * meanMotion;
    const eccentricAnomaly = solveKepler(meanAnomaly, o.eccentricity);

    const semiMinor = o.semiMajorAxis * Math.sqrt(1 - o.eccentricity * o.eccentricity);
    const x = o.semiMajorAxis * (Math.cos(eccentricAnomaly) - o.eccentricity);
    const y = semiMinor * Math.sin(eccentricAnomaly);

    const planeRotation = o.orbitPlaneRotation ?? orbitPlaneMatrix(o);
    // Position in the parent's ecliptic frame, then rotated to equatorial.
    return eclipticToEquatorialVec(mat3Transform(planeRotation, vec3(x, y, 0)));
  }

  /** Velocity relative to the parent, km/day. */
  getVelocity(tdb: number): Vec3 {
    if (!this.orbit) return vec3(0, 0, 0);
    const o = this.orbit;
    const meanMotion = (2 * Math.PI) / o.period;
    const meanAnomaly = o.meanAnomalyAtEpoch + (tdb - o.epoch) * meanMotion;
    const E = solveKepler(meanAnomaly, o.eccentricity);
    const semiMinor = o.semiMajorAxis * Math.sqrt(1 - o.eccentricity * o.eccentricity);
    const edot = meanMotion / (1 - o.eccentricity * Math.cos(E));
    const x = -o.semiMajorAxis * Math.sin(E) * edot;
    const y = semiMinor * Math.cos(E) * edot;
    const planeRotation = o.orbitPlaneRotation ?? orbitPlaneMatrix(o);
    return eclipticToEquatorialVec(mat3Transform(planeRotation, vec3(x, y, 0)));
  }

  /** Position relative to the root of the tree (the Sun), in kilometres. */
  getSystemPosition(tdb: number): Vec3 {
    let position = this.getPosition(tdb);
    let node = this.parent;
    while (node && node.parent) {
      position = add(position, node.getPosition(tdb));
      node = node.parent;
    }
    return position;
  }

  /** Velocity relative to the root of the tree, km/day. */
  getSystemVelocity(tdb: number): Vec3 {
    let velocity = this.getVelocity(tdb);
    let node = this.parent;
    while (node && node.parent) {
      velocity = add(velocity, node.getVelocity(tdb));
      node = node.parent;
    }
    return velocity;
  }

  /** Distance from the body centre to the surface, along a direction. */
  getSurfaceDistance(direction: Vec3): number {
    const d = normalize(direction);
    if (this.oblateness === 0) return this.radius;
    const a = this.radius;
    const c = this.polarRadius;
    // Ellipsoid radius along a direction.
    const denom = Math.sqrt((d.x * d.x + d.y * d.y) / (a * a) + (d.z * d.z) / (c * c));
    return denom === 0 ? a : 1 / denom;
  }

  /** Body frame to the parent's ecliptic frame, as a rotation matrix. */
  getOrientation(tdb: number): Mat3 {
    if (this.orientationCache && this.orientationCache.tdb === tdb) {
      return this.orientationCache.matrix;
    }
    const r = this.rotation;
    const obliquity = r.obliquity;
    const node = r.ascendingNode;

    // Pole of the body in the parent's ecliptic frame.
    const pole = vec3(Math.sin(obliquity) * Math.sin(node), -Math.sin(obliquity) * Math.cos(node), Math.cos(obliquity));

    // Reference direction at zero meridian angle, perpendicular to the pole.
    let reference = cross(pole, vec3(0, 0, 1));
    if (length(reference) < 1e-9) reference = cross(pole, vec3(1, 0, 0));
    reference = normalize(reference);

    const period = r.period === 0 ? 1e9 : r.period;
    const angle = r.meridianAngle + (2 * Math.PI * (tdb - r.epoch)) / period;
    const xAxis = rotateAround(reference, pole, -angle);
    const yAxis = cross(pole, xAxis);

    // Columns are expressed in the ecliptic frame; rotate each into equatorial.
    const matrix = mat3FromColumns(
      eclipticToEquatorialVec(xAxis),
      eclipticToEquatorialVec(yAxis),
      eclipticToEquatorialVec(pole),
    );
    this.orientationCache = { tdb, matrix };
    return matrix;
  }

  getOrientationQuaternion(tdb: number): Quat {
    return quatFromMatrix(this.getOrientation(tdb));
  }

  /** Body frame to the scene (equatorial J2000) frame. */
  getSceneOrientation(tdb: number): Quat {
    return quatFromMatrix(this.getOrientation(tdb));
  }

  /** Pole direction in the scene frame, used to orient rings and grids. */
  getPole(tdb: number): Vec3 {
    const m = this.getOrientation(tdb);
    return normalize(vec3(m[2], m[5], m[8]));
  }

  /** Linear speed in km/s, relative to the root of the tree. */
  getSpeed(tdb: number): number {
    return length(this.getSystemVelocity(tdb)) / 86400;
  }

  findSatellite(name: string): Body | undefined {
    const lower = name.toLowerCase();
    return this.satellites.find((s) => s.name.toLowerCase() === lower || s.localizedName.toLowerCase() === lower);
  }

  /** Depth first walk over the body and every satellite below it. */
  *walk(): Generator<Body> {
    yield this;
    for (const s of this.satellites) yield* s.walk();
  }
}

function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let E = meanAnomaly + eccentricity * Math.sin(meanAnomaly);
  for (let i = 0; i < 24; i++) {
    const delta = (E - eccentricity * Math.sin(E) - meanAnomaly) / (1 - eccentricity * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return E;
}

/** Rz(node) Rx(inclination) Rz(argPericenter), matching orbitPlaneRotation. */
export function orbitPlaneMatrix(o: EllipticalOrbit): Mat3 {
  const node = o.ascendingNode;
  const inc = o.inclination;
  const peri = o.argPericenter;

  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const cp = Math.cos(peri);
  const sp = Math.sin(peri);

  return [
    cn * cp - sn * sp * ci, -sn * ci * cp - cn * sp, sn * si,
    sn * cp + cn * sp * ci, -sn * sp * ci + cn * cp, -cn * si,
    sp * si, cp * si, ci,
  ];
}

/** Semi-major axis from orbital period, using the mass of the primary. */
export function semiMajorAxisFromPeriod(periodDays: number, muKm3PerS2: number): number {
  const n = (2 * Math.PI) / (periodDays * 86400);
  return Math.cbrt(muKm3PerS2 / (n * n));
}

export { KM_PER_AU, SOLAR_RADIUS };
