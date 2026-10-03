// The built-in solar system.
//
// Orbital elements are the J2000 heliocentric Keplerian elements from the JPL
// "Approximate Positions of the Major Planets" tables (Standish), which are the
// same class of elements Celestia ships in solarsys.ssc. Radii, flattening,
// rotation periods and pole obliquities are the IAU 2015 values also used by
// Celestia. Satellite orbits are given relative to the parent's equator.
//
// The elements are the J2000 set only: the secular rates in the JPL tables are
// not applied, so the positions drift by a few arcminutes per decade away from
// the year 2000.

import { Body, BodyClassification, type BodyDefinition, type EllipticalOrbit } from './body';
import { mat3Mul, mat3XRotation, mat3ZRotation, degToRad, J2000, type Mat3, KM_PER_AU } from './math';

const au = (x: number) => x * KM_PER_AU;

/** Builds elements from the JPL mean-longitude form (L, longitude of perihelion). */
function heliocentric(
  aAu: number,
  e: number,
  iDeg: number,
  longPeriDeg: number,
  nodeDeg: number,
  meanLongitudeDeg: number,
  periodYears: number,
): EllipticalOrbit {
  return {
    semiMajorAxis: au(aAu),
    eccentricity: e,
    inclination: degToRad(iDeg),
    ascendingNode: degToRad(nodeDeg),
    argPericenter: degToRad(longPeriDeg - nodeDeg),
    meanAnomalyAtEpoch: degToRad(meanLongitudeDeg - longPeriDeg),
    period: periodYears * 365.25,
    epoch: J2000,
  };
}

/**
 * Places a satellite's orbit in the parent's equatorial plane: the parent's pole
 * basis is composed with the satellite's own node, inclination and pericenter.
 */
function equatorialOrbit(
  parentObliquityDeg: number,
  parentNodeDeg: number,
  aKm: number,
  e: number,
  iDeg: number,
  nodeDeg: number,
  argPeriDeg: number,
  meanAnomalyDeg: number,
  periodDays: number,
): EllipticalOrbit {
  const parentTilt = mat3Mul(
    mat3ZRotation(degToRad(parentNodeDeg)),
    mat3XRotation(degToRad(parentObliquityDeg)),
  );
  const own = mat3Mul(
    mat3Mul(mat3ZRotation(degToRad(nodeDeg)), mat3XRotation(degToRad(iDeg))),
    mat3ZRotation(degToRad(argPeriDeg)),
  );

  return {
    semiMajorAxis: aKm,
    eccentricity: e,
    inclination: degToRad(iDeg),
    ascendingNode: degToRad(nodeDeg),
    argPericenter: degToRad(argPeriDeg),
    meanAnomalyAtEpoch: degToRad(meanAnomalyDeg),
    period: periodDays,
    epoch: J2000,
    orbitPlaneRotation: mat3Mul(parentTilt as Mat3, own as Mat3) as Mat3,
  };
}

export const SOLAR_SYSTEM: BodyDefinition[] = [
  {
    name: 'Sol',
    localizedName: 'Sun',
    classification: BodyClassification.Planet,
    radius: 695700,
    albedo: 1.0,
    textures: { surface: 'sun' },
    rotation: { period: 25.38, obliquity: degToRad(7.25), ascendingNode: degToRad(75.0), meridianAngle: 0, epoch: J2000 },
  },
  {
    name: 'Mercury',
    classification: BodyClassification.Planet,
    radius: 2439.7,
    albedo: 0.106,
    textures: { surface: 'mercury' },
    orbit: heliocentric(0.38709927, 0.20563593, 7.00497902, 77.45779628, 48.33076593, 252.2503235, 0.2408467),
    rotation: { period: 58.6462, obliquity: degToRad(0.034), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
  },
  {
    name: 'Venus',
    classification: BodyClassification.Planet,
    radius: 6051.8,
    albedo: 0.65,
    textures: { surface: 'venus' },
    atmosphere: { height: 15.9, rayleigh: [0.98, 0.93, 0.72], mie: 0.0, cloudHeight: 1.008, cloudColor: [1.0, 0.95, 0.82] },
    orbit: heliocentric(0.72333566, 0.00677672, 3.39467605, 131.60246718, 76.67984255, 181.9790995, 0.61519726),
    rotation: { period: -243.0187, obliquity: degToRad(177.36), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
  },
  {
    name: 'Earth',
    classification: BodyClassification.Planet,
    radius: 6378.14,
    oblateness: 1 / 298.257223563,
    albedo: 0.3,
    textures: { surface: 'earth', night: 'earth-night', clouds: 'earth-clouds', bump: 'earth-bump' },
    atmosphere: { height: 60, rayleigh: [0.19, 0.42, 0.94], mie: 0.02, cloudHeight: 1.004, cloudColor: [1, 1, 1] },
    orbit: heliocentric(1.00000261, 0.01671123, -0.00001531, 102.93768193, 0.0, 100.46457166, 0.99997861),
    // The node is set so the north pole tilts away from the Sun near perihelion,
    // which reproduces the northern winter in early January.
    rotation: {
      period: 0.99726968,
      obliquity: degToRad(23.4392911),
      ascendingNode: degToRad(90.0),
      meridianAngle: degToRad(280.46061837 + 180.0),
      epoch: J2000,
    },
    satellites: [
      {
        name: 'Moon',
        classification: BodyClassification.Moon,
        radius: 1737.4,
        albedo: 0.12,
        textures: { surface: 'moon', bump: 'moon-bump' },
        orbit: equatorialOrbit(23.4392911, 90.0, 384400, 0.0549, 5.145, 125.08, 318.15, 135.27, 27.321582),
        rotation: { period: 27.321582, obliquity: degToRad(6.68), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
      },
    ],
  },
  {
    name: 'Mars',
    classification: BodyClassification.Planet,
    radius: 3396.19,
    oblateness: 0.00589,
    albedo: 0.15,
    textures: { surface: 'mars', bump: 'mars-bump' },
    atmosphere: { height: 11, rayleigh: [0.85, 0.62, 0.45], mie: 0.0, cloudHeight: 1.005, cloudColor: [0.9, 0.85, 0.8] },
    orbit: heliocentric(1.52371034, 0.0933941, 1.84969142, -23.94362959, 49.55953891, -4.55343205, 1.8808476),
    rotation: { period: 1.02595676, obliquity: degToRad(25.19), ascendingNode: degToRad(82.0), meridianAngle: 0, epoch: J2000 },
    satellites: [
      {
        name: 'Phobos',
        classification: BodyClassification.MinorMoon,
        radius: 11.1,
        albedo: 0.071,
        textures: { surface: 'rocky-dark' },
        orbit: equatorialOrbit(25.19, 82.0, 9376, 0.0151, 1.075, 0, 0, 92.0, 0.31891),
        rotation: { period: 0.31891, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
      },
      {
        name: 'Deimos',
        classification: BodyClassification.MinorMoon,
        radius: 6.2,
        albedo: 0.068,
        textures: { surface: 'rocky-dark' },
        orbit: equatorialOrbit(25.19, 82.0, 23463.2, 0.00033, 1.788, 0, 0, 254.0, 1.26244),
        rotation: { period: 1.26244, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
      },
    ],
  },
  {
    name: 'Jupiter',
    classification: BodyClassification.Planet,
    radius: 71492,
    oblateness: 0.06487,
    albedo: 0.52,
    textures: { surface: 'jupiter' },
    rings: { innerRadius: 122500, outerRadius: 129000, color: [0.6, 0.55, 0.5], albedo: 0.05 },
    orbit: heliocentric(5.202887, 0.04838624, 1.30439695, 14.72847983, 100.47390909, 34.39644051, 11.862615),
    rotation: { period: 0.41354, obliquity: degToRad(3.13), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
    satellites: [
      { name: 'Io', classification: BodyClassification.Moon, radius: 1821.6, albedo: 0.63, textures: { surface: 'io' }, orbit: equatorialOrbit(3.13, 0, 421700, 0.0041, 0.036, 0, 0, 342.0, 1.769138), rotation: { period: 1.769138, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Europa', classification: BodyClassification.Moon, radius: 1560.8, albedo: 0.67, textures: { surface: 'europa' }, orbit: equatorialOrbit(3.13, 0, 671034, 0.0094, 0.466, 0, 0, 180.0, 3.551181), rotation: { period: 3.551181, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Ganymede', classification: BodyClassification.Moon, radius: 2634.1, albedo: 0.43, textures: { surface: 'ganymede' }, orbit: equatorialOrbit(3.13, 0, 1070412, 0.0013, 0.177, 0, 0, 60.0, 7.154553), rotation: { period: 7.154553, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Callisto', classification: BodyClassification.Moon, radius: 2410.3, albedo: 0.17, textures: { surface: 'callisto' }, orbit: equatorialOrbit(3.13, 0, 1882709, 0.0074, 0.192, 0, 0, 300.0, 16.6890184), rotation: { period: 16.6890184, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
    ],
  },
  {
    name: 'Saturn',
    classification: BodyClassification.Planet,
    radius: 60268,
    oblateness: 0.09796,
    albedo: 0.47,
    textures: { surface: 'saturn' },
    rings: { innerRadius: 74500, outerRadius: 140220, color: [0.82, 0.75, 0.62], albedo: 0.42 },
    atmosphere: { height: 60, rayleigh: [0.78, 0.72, 0.55], mie: 0.0, cloudHeight: 1.004, cloudColor: [0.95, 0.9, 0.8] },
    orbit: heliocentric(9.53667594, 0.05386179, 2.48599187, 92.59887831, 113.66242448, 49.95424423, 29.447498),
    rotation: { period: 0.44401, obliquity: degToRad(26.73), ascendingNode: degToRad(169.0), meridianAngle: 0, epoch: J2000 },
    satellites: [
      { name: 'Mimas', classification: BodyClassification.Moon, radius: 198.2, albedo: 0.962, textures: { surface: 'icy' }, orbit: equatorialOrbit(26.73, 169.0, 185539, 0.0196, 1.574, 0, 0, 14.0, 0.942422), rotation: { period: 0.942422, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Enceladus', classification: BodyClassification.Moon, radius: 252.1, albedo: 0.81, textures: { surface: 'enceladus' }, orbit: equatorialOrbit(26.73, 169.0, 237948, 0.0047, 0.009, 0, 0, 200.0, 1.370218), rotation: { period: 1.370218, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Rhea', classification: BodyClassification.Moon, radius: 763.8, albedo: 0.949, textures: { surface: 'icy' }, orbit: equatorialOrbit(26.73, 169.0, 527108, 0.001, 0.345, 0, 0, 130.0, 4.518212), rotation: { period: 4.518212, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Titan', classification: BodyClassification.Moon, radius: 2574.73, albedo: 0.22, textures: { surface: 'titan' }, atmosphere: { height: 60, rayleigh: [0.85, 0.55, 0.25], mie: 0.01, cloudHeight: 1.02, cloudColor: [0.95, 0.7, 0.35] }, orbit: equatorialOrbit(26.73, 169.0, 1221870, 0.0288, 0.34854, 0, 0, 20.0, 15.945421), rotation: { period: 15.945421, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Iapetus', classification: BodyClassification.Moon, radius: 734.5, albedo: 0.3, textures: { surface: 'iapetus' }, orbit: equatorialOrbit(26.73, 169.0, 3560820, 0.0283, 15.47, 0, 0, 250.0, 79.3215), rotation: { period: 79.3215, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
    ],
  },
  {
    name: 'Uranus',
    classification: BodyClassification.Planet,
    radius: 25559,
    oblateness: 0.02293,
    albedo: 0.51,
    textures: { surface: 'uranus' },
    rings: { innerRadius: 41800, outerRadius: 51150, color: [0.5, 0.55, 0.6], albedo: 0.08 },
    atmosphere: { height: 27, rayleigh: [0.55, 0.83, 0.86], mie: 0.0, cloudHeight: 1.005, cloudColor: [0.7, 0.9, 0.92] },
    orbit: heliocentric(19.18916464, 0.04725744, 0.77263783, 170.9542763, 74.01692503, 313.23810451, 84.016846),
    rotation: { period: -0.71833, obliquity: degToRad(97.77), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
    satellites: [
      { name: 'Titania', classification: BodyClassification.Moon, radius: 788.4, albedo: 0.35, textures: { surface: 'icy' }, orbit: equatorialOrbit(97.77, 0, 435910, 0.0011, 0.34, 0, 0, 80.0, 8.705872), rotation: { period: 8.705872, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
      { name: 'Oberon', classification: BodyClassification.Moon, radius: 761.4, albedo: 0.31, textures: { surface: 'icy' }, orbit: equatorialOrbit(97.77, 0, 583520, 0.0014, 0.058, 0, 0, 260.0, 13.463239), rotation: { period: 13.463239, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
    ],
  },
  {
    name: 'Neptune',
    classification: BodyClassification.Planet,
    radius: 24764,
    oblateness: 0.01708,
    albedo: 0.62,
    textures: { surface: 'neptune' },
    atmosphere: { height: 27, rayleigh: [0.3, 0.45, 0.85], mie: 0.0, cloudHeight: 1.006, cloudColor: [0.6, 0.7, 0.95] },
    orbit: heliocentric(30.06992276, 0.00859048, 1.77004347, 44.96476227, 131.78422574, -55.12002969, 164.79132),
    rotation: { period: 0.67125, obliquity: degToRad(28.32), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
    satellites: [
      { name: 'Triton', classification: BodyClassification.Moon, radius: 1353.4, albedo: 0.76, textures: { surface: 'triton' }, orbit: equatorialOrbit(28.32, 0, 354759, 0.000016, 156.885, 0, 0, 0, -5.876854), rotation: { period: -5.876854, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
    ],
  },
  {
    name: 'Pluto',
    classification: BodyClassification.DwarfPlanet,
    radius: 1188.3,
    albedo: 0.52,
    textures: { surface: 'pluto' },
    orbit: heliocentric(39.48211675, 0.2488273, 17.14001206, 224.06891629, 110.30393684, 238.92903833, 247.92065),
    rotation: { period: -6.38723, obliquity: degToRad(122.53), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
    satellites: [
      { name: 'Charon', classification: BodyClassification.Moon, radius: 606, albedo: 0.38, textures: { surface: 'icy' }, orbit: equatorialOrbit(122.53, 0, 19591, 0.0002, 0.08, 0, 0, 0, 6.3872), rotation: { period: 6.38723, obliquity: 0, ascendingNode: 0, meridianAngle: 0, epoch: J2000 } },
    ],
  },
  {
    name: 'Ceres',
    classification: BodyClassification.DwarfPlanet,
    radius: 473,
    albedo: 0.09,
    textures: { surface: 'rocky-dark' },
    orbit: heliocentric(2.7675, 0.0757, 10.593, 73.5977, 80.3932, 95.9891, 4.601),
    rotation: { period: 0.3781, obliquity: degToRad(4.0), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
  },
  {
    name: 'Vesta',
    classification: BodyClassification.Asteroid,
    radius: 262.7,
    albedo: 0.42,
    textures: { surface: 'rocky-dark' },
    orbit: heliocentric(2.3615, 0.0887, 7.1405, 151.1985, 103.8516, 20.8637, 3.629),
    rotation: { period: 0.2226, obliquity: degToRad(29.0), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
  },
  {
    name: 'Halley',
    classification: BodyClassification.Comet,
    radius: 5.5,
    albedo: 0.04,
    textures: { surface: 'rocky-dark' },
    orbit: {
      semiMajorAxis: au(17.834),
      eccentricity: 0.96714,
      inclination: degToRad(162.26),
      ascendingNode: degToRad(58.42),
      argPericenter: degToRad(111.33),
      meanAnomalyAtEpoch: degToRad(274.0),
      period: 75.32 * 365.25,
      epoch: J2000,
    },
    rotation: { period: 2.2, obliquity: degToRad(50.0), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
  },
  {
    name: '216 Kleopatra',
    classification: BodyClassification.Asteroid,
    radius: 108,
    albedo: 0.116,
    textures: { surface: 'rocky-dark' },
    orbit: heliocentric(2.7938, 0.2495, 13.114, 179.992, 215.67, 114.83, 4.67),
    rotation: { period: 0.2347, obliquity: degToRad(60.0), ascendingNode: 0, meridianAngle: 0, epoch: J2000 },
  },
];

/** Builds the body tree and returns the roots together with a flat index. */
export function buildSolarSystem(definitions: BodyDefinition[] = SOLAR_SYSTEM): {
  roots: Body[];
  all: Body[];
  byName: Map<string, Body>;
} {
  const all: Body[] = [];
  const byName = new Map<string, Body>();

  const build = (def: BodyDefinition, parent: Body | null): Body => {
    const body = new Body(def);
    body.parent = parent;
    all.push(body);
    byName.set(body.name.toLowerCase(), body);
    byName.set(body.localizedName.toLowerCase(), body);
    for (const child of def.satellites ?? []) {
      body.satellites.push(build(child, body));
    }
    return body;
  };

  const roots = definitions.map((d) => build(d, null));
  return { roots, all, byName };
}

export { KM_PER_AU };
