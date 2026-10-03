// Surface locations, mirroring engine::Location and LocationDB.
//
// Coordinates are planetocentric latitude and longitude in degrees, taken from
// the IAU Working Group for Planetary System Nomenclature gazetteer for the
// lunar and Martian features and from the standard city coordinates for the
// terrestrial entries.

import { type Vec3, normalize, vec3, cross, rotateAround, degToRad, KM_PER_AU } from './math';
import type { Body } from './body';

export enum LocationType {
  City = 0x0001,
  Crater = 0x0002,
  Observatory = 0x0004,
  Vallis = 0x0008,
  LandingSite = 0x0010,
  Terra = 0x0020,
  Mons = 0x0040,
  EruptiveCenter = 0x0080,
  Mare = 0x0100,
  Other = 0x0200,
}

export const LOCATION_TYPE_NAMES: Array<[LocationType, string]> = [
  [LocationType.City, 'Cities'],
  [LocationType.Crater, 'Craters'],
  [LocationType.Observatory, 'Observatories'],
  [LocationType.Vallis, 'Valles (valleys)'],
  [LocationType.LandingSite, 'Landing sites'],
  [LocationType.Terra, 'Terrae (land masses)'],
  [LocationType.Mons, 'Montes (mountains)'],
  [LocationType.EruptiveCenter, 'Volcanoes'],
  [LocationType.Mare, 'Maria (seas)'],
  [LocationType.Other, 'Other features'],
];

export const ALL_LOCATION_TYPES =
  LocationType.City |
  LocationType.Crater |
  LocationType.Observatory |
  LocationType.Vallis |
  LocationType.LandingSite |
  LocationType.Terra |
  LocationType.Mons |
  LocationType.EruptiveCenter |
  LocationType.Mare |
  LocationType.Other;

export interface LocationDefinition {
  /** Parent body name. */
  body: string;
  name: string;
  /** Longitude in degrees, east positive. */
  longitude: number;
  /** Planetocentric latitude in degrees. */
  latitude: number;
  /** Height above the reference radius, in kilometres. */
  altitude?: number;
  type: LocationType;
  /** Feature diameter in kilometres, used by the minimum size filter. */
  size?: number;
  importance?: number;
}

export interface Location {
  parent: Body;
  name: string;
  longitude: number;
  latitude: number;
  altitude: number;
  type: LocationType;
  size: number;
  /** Position in the parent's body frame, in kilometres. */
  bodyFixedPosition: Vec3;
}

export const LOCATIONS: LocationDefinition[] = [
  // Earth
  { body: 'Earth', name: 'London', longitude: -0.1275, latitude: 51.5072, type: LocationType.City, size: 0.1, importance: 10 },
  { body: 'Earth', name: 'Paris', longitude: 2.3522, latitude: 48.8566, type: LocationType.City, size: 0.1, importance: 10 },
  { body: 'Earth', name: 'Berlin', longitude: 13.405, latitude: 52.52, type: LocationType.City, size: 0.1, importance: 9 },
  { body: 'Earth', name: 'Madrid', longitude: -3.7038, latitude: 40.4168, type: LocationType.City, size: 0.1, importance: 9 },
  { body: 'Earth', name: 'Rome', longitude: 12.4964, latitude: 41.9028, type: LocationType.City, size: 0.1, importance: 9 },
  { body: 'Earth', name: 'Moscow', longitude: 37.6173, latitude: 55.7558, type: LocationType.City, size: 0.1, importance: 9 },
  { body: 'Earth', name: 'Cairo', longitude: 31.2357, latitude: 30.0444, type: LocationType.City, size: 0.1, importance: 8 },
  { body: 'Earth', name: 'Beijing', longitude: 116.4074, latitude: 39.9042, type: LocationType.City, size: 0.1, importance: 10 },
  { body: 'Earth', name: 'Tokyo', longitude: 139.6917, latitude: 35.6895, type: LocationType.City, size: 0.1, importance: 10 },
  { body: 'Earth', name: 'Sydney', longitude: 151.2093, latitude: -33.8688, type: LocationType.City, size: 0.1, importance: 9 },
  { body: 'Earth', name: 'New York', longitude: -74.006, latitude: 40.7128, type: LocationType.City, size: 0.1, importance: 10 },
  { body: 'Earth', name: 'Los Angeles', longitude: -118.2437, latitude: 34.0522, type: LocationType.City, size: 0.1, importance: 9 },
  { body: 'Earth', name: 'Mexico City', longitude: -99.1332, latitude: 19.4326, type: LocationType.City, size: 0.1, importance: 8 },
  { body: 'Earth', name: 'São Paulo', longitude: -46.6333, latitude: -23.5505, type: LocationType.City, size: 0.1, importance: 8 },
  { body: 'Earth', name: 'Cape Town', longitude: 18.4241, latitude: -33.9249, type: LocationType.City, size: 0.1, importance: 8 },
  { body: 'Earth', name: 'Delhi', longitude: 77.209, latitude: 28.6139, type: LocationType.City, size: 0.1, importance: 8 },
  { body: 'Earth', name: 'Mauna Kea Observatory', longitude: -155.4681, latitude: 19.8207, altitude: 4.205, type: LocationType.Observatory, size: 0.05, importance: 9 },
  { body: 'Earth', name: 'Very Large Array', longitude: -107.6183, latitude: 34.0784, altitude: 2.124, type: LocationType.Observatory, size: 0.05, importance: 8 },
  { body: 'Earth', name: 'Paranal Observatory', longitude: -70.4042, latitude: -24.6272, altitude: 2.635, type: LocationType.Observatory, size: 0.05, importance: 8 },
  { body: 'Earth', name: 'Mount Everest', longitude: 86.925, latitude: 27.9881, altitude: 8.849, type: LocationType.Mons, size: 8, importance: 9 },
  { body: 'Earth', name: 'Mariana Trench', longitude: 142.2, latitude: 11.35, altitude: -10.994, type: LocationType.Vallis, size: 2550, importance: 8 },
  { body: 'Earth', name: 'Grand Canyon', longitude: -112.1129, latitude: 36.1069, altitude: 0.8, type: LocationType.Vallis, size: 446, importance: 7 },
  { body: 'Earth', name: 'Sahara', longitude: 13.0, latitude: 23.0, type: LocationType.Terra, size: 9200, importance: 7 },
  { body: 'Earth', name: 'Krakatoa', longitude: 105.423, latitude: -6.102, altitude: 0.813, type: LocationType.EruptiveCenter, size: 5, importance: 7 },
  { body: 'Earth', name: 'Vesuvius', longitude: 14.426, latitude: 40.821, altitude: 1.281, type: LocationType.EruptiveCenter, size: 3, importance: 7 },

  // Moon
  { body: 'Moon', name: 'Tranquility Base (Apollo 11)', longitude: 23.473, latitude: 0.674, type: LocationType.LandingSite, size: 0.01, importance: 10 },
  { body: 'Moon', name: 'Hadley Rille (Apollo 15)', longitude: 3.633, latitude: 26.132, type: LocationType.LandingSite, size: 0.01, importance: 8 },
  { body: 'Moon', name: 'Taurus-Littrow (Apollo 17)', longitude: 30.772, latitude: 20.19, type: LocationType.LandingSite, size: 0.01, importance: 8 },
  { body: 'Moon', name: 'Tycho', longitude: -11.36, latitude: -43.31, type: LocationType.Crater, size: 85, importance: 10 },
  { body: 'Moon', name: 'Copernicus', longitude: -20.08, latitude: 9.62, type: LocationType.Crater, size: 93, importance: 10 },
  { body: 'Moon', name: 'Kepler', longitude: -38.01, latitude: 8.1, type: LocationType.Crater, size: 32, importance: 8 },
  { body: 'Moon', name: 'Aristarchus', longitude: -47.49, latitude: 23.73, type: LocationType.Crater, size: 40, importance: 9 },
  { body: 'Moon', name: 'Clavius', longitude: -14.4, latitude: -58.4, type: LocationType.Crater, size: 225, importance: 9 },
  { body: 'Moon', name: 'Plato', longitude: -9.3, latitude: 51.6, type: LocationType.Crater, size: 101, importance: 8 },
  { body: 'Moon', name: 'Mare Tranquillitatis', longitude: 31.4, latitude: 8.5, type: LocationType.Mare, size: 873, importance: 9 },
  { body: 'Moon', name: 'Mare Imbrium', longitude: -15.5, latitude: 32.8, type: LocationType.Mare, size: 1145, importance: 9 },
  { body: 'Moon', name: 'Mare Serenitatis', longitude: 17.5, latitude: 28.0, type: LocationType.Mare, size: 707, importance: 9 },
  { body: 'Moon', name: 'Mare Fecunditatis', longitude: 51.3, latitude: -7.8, type: LocationType.Mare, size: 909, importance: 8 },
  { body: 'Moon', name: 'Mare Crisium', longitude: 59.1, latitude: 17.0, type: LocationType.Mare, size: 555, importance: 8 },
  { body: 'Moon', name: 'Mons Huygens', longitude: -2.9, latitude: 19.9, type: LocationType.Mons, size: 41, importance: 8 },
  { body: 'Moon', name: 'Mons Hadley', longitude: 4.5, latitude: 26.5, type: LocationType.Mons, size: 25, importance: 8 },
  { body: 'Moon', name: 'Rupes Recta', longitude: -7.8, latitude: -22.1, type: LocationType.Vallis, size: 110, importance: 8 },
  { body: 'Moon', name: 'South Pole-Aitken Basin', longitude: -180.0, latitude: -53.0, type: LocationType.Vallis, size: 2500, importance: 8 },

  // Mars
  { body: 'Mars', name: 'Jezero Crater (Perseverance)', longitude: 77.45, latitude: 18.38, type: LocationType.LandingSite, size: 45, importance: 10 },
  { body: 'Mars', name: 'Gale Crater (Curiosity)', longitude: 137.44, latitude: -5.39, type: LocationType.LandingSite, size: 154, importance: 10 },
  { body: 'Mars', name: 'Olympus Mons', longitude: -133.0, latitude: 18.65, altitude: 21.9, type: LocationType.Mons, size: 601, importance: 10 },
  { body: 'Mars', name: 'Valles Marineris', longitude: -59.0, latitude: -14.0, type: LocationType.Vallis, size: 3827, importance: 10 },
  { body: 'Mars', name: 'Hellas Planitia', longitude: 70.0, latitude: -42.4, type: LocationType.Vallis, size: 2300, importance: 9 },
  { body: 'Mars', name: 'Argyre Planitia', longitude: -43.0, latitude: -49.7, type: LocationType.Vallis, size: 1800, importance: 8 },
  { body: 'Mars', name: 'Elysium Mons', longitude: 146.5, latitude: 25.02, altitude: 14.1, type: LocationType.EruptiveCenter, size: 240, importance: 9 },
  { body: 'Mars', name: 'Tharsis', longitude: -100.0, latitude: 0.0, type: LocationType.Terra, size: 5000, importance: 8 },
  { body: 'Mars', name: 'Syrtis Major', longitude: 69.5, latitude: 8.4, type: LocationType.Terra, size: 1350, importance: 8 },
  { body: 'Mars', name: 'Viking 1', longitude: -49.97, latitude: 22.48, type: LocationType.LandingSite, size: 0.01, importance: 8 },
  { body: 'Mars', name: 'Viking 2', longitude: 134.29, latitude: 47.97, type: LocationType.LandingSite, size: 0.01, importance: 8 },
  { body: 'Mars', name: 'Opportunity (Eagle)', longitude: -5.52, latitude: -1.95, type: LocationType.LandingSite, size: 0.01, importance: 8 },

  // Jupiter moons
  { body: 'Io', name: 'Pele', longitude: 104.0, latitude: -18.0, type: LocationType.EruptiveCenter, size: 30, importance: 8 },
  { body: 'Io', name: 'Loki', longitude: 309.0, latitude: 19.0, type: LocationType.EruptiveCenter, size: 202, importance: 8 },
  { body: 'Europa', name: 'Thera Macula', longitude: 181.0, latitude: -47.0, type: LocationType.Other, size: 95, importance: 7 },
  { body: 'Ganymede', name: 'Galileo Regio', longitude: 149.0, latitude: 35.0, type: LocationType.Terra, size: 3200, importance: 7 },
  { body: 'Callisto', name: 'Valhalla', longitude: 56.0, latitude: 16.0, type: LocationType.Crater, size: 3800, importance: 8 },

  // Titan
  { body: 'Titan', name: 'Kraken Mare', longitude: 314.0, latitude: 68.0, type: LocationType.Mare, size: 1170, importance: 9 },
  { body: 'Titan', name: 'Ligeia Mare', longitude: 248.0, latitude: 79.0, type: LocationType.Mare, size: 500, importance: 8 },
  { body: 'Titan', name: 'Ontario Lacus', longitude: 183.0, latitude: -72.0, type: LocationType.Mare, size: 235, importance: 8 },

  // Triton
  { body: 'Triton', name: 'Ryugu Planitia', longitude: 20.0, latitude: 0.0, type: LocationType.Terra, size: 500, importance: 6 },

  // Pluto
  { body: 'Pluto', name: 'Sputnik Planitia', longitude: 175.0, latitude: 20.0, type: LocationType.Terra, size: 1500, importance: 9 },
  { body: 'Pluto', name: 'Tombaugh Regio', longitude: 180.0, latitude: 10.0, type: LocationType.Terra, size: 2300, importance: 9 },
];

export class LocationDb {
  readonly locations: Location[] = [];
  private readonly byBody = new Map<Body, Location[]>();

  constructor(definitions: LocationDefinition[], bodies: Map<string, Body>) {
    for (const def of definitions) {
      const parent = bodies.get(def.body.toLowerCase());
      if (!parent) continue;
      const location: Location = {
        parent,
        name: def.name,
        longitude: degToRad(def.longitude),
        latitude: degToRad(def.latitude),
        altitude: def.altitude ?? 0,
        type: def.type,
        size: def.size ?? 0,
        bodyFixedPosition: vec3(0, 0, 0),
      };
      this.locations.push(location);
      const list = this.byBody.get(parent);
      if (list) list.push(location);
      else this.byBody.set(parent, [location]);
    }

    // Resolve body fixed positions lazily, because the parent radius is known
    // only after the body tree has been built.
    for (const location of this.locations) {
      location.bodyFixedPosition = this.computeBodyFixedPosition(location);
    }
  }

  private computeBodyFixedPosition(location: Location): Vec3 {
    const r = location.parent.radius + location.altitude;
    const lat = location.latitude;
    const lon = location.longitude;
    // Celestia's body frame has +Z along the north pole and the prime meridian
    // through +X.
    return vec3(r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat));
  }

  find(body: Body, name: string): Location | undefined {
    const list = this.byBody.get(body) ?? [];
    const lower = name.toLowerCase();
    return list.find((l) => l.name.toLowerCase() === lower);
  }

  getLocations(body: Body, filter = ALL_LOCATION_TYPES, minimumSize = 0): Location[] {
    const list = this.byBody.get(body) ?? [];
    return list.filter((l) => (l.type & filter) !== 0 && l.size >= minimumSize);
  }

  /** Position of a location in the parent's body frame, kilometres. */
  static bodyFixedPosition(location: Location): Vec3 {
    return location.bodyFixedPosition;
  }

  /** Position of a location in the scene frame, kilometres. */
  static scenePosition(location: Location, bodyOrientation: (b: Body) => { x: Vec3; y: Vec3; z: Vec3 }): Vec3 {
    const basis = bodyOrientation(location.parent);
    const p = location.bodyFixedPosition;
    return vec3(
      basis.x.x * p.x + basis.y.x * p.y + basis.z.x * p.z,
      basis.x.y * p.x + basis.y.y * p.y + basis.z.y * p.z,
      basis.x.z * p.x + basis.y.z * p.y + basis.z.z * p.z,
    );
  }

  /** Unit vector of the location direction in the body frame. */
  static direction(location: Location): Vec3 {
    return normalize(location.bodyFixedPosition);
  }

  /** North and east axes of the local frame at the location, in the body frame. */
  static localFrame(location: Location): { north: Vec3; east: Vec3; up: Vec3 } {
    const up = normalize(location.bodyFixedPosition);
    let north = vec3(-Math.sin(location.latitude) * Math.cos(location.longitude), -Math.sin(location.latitude) * Math.sin(location.longitude), Math.cos(location.latitude));
    if (Math.abs(location.latitude) > Math.PI / 2 - 1e-6) north = vec3(0, 0, 0);
    const east = cross(vec3(0, 0, 1), up);
    return { north, east: normalize(east), up };
  }

  static rotateToScene(v: Vec3, orientation: { x: Vec3; y: Vec3; z: Vec3 }): Vec3 {
    return vec3(
      orientation.x.x * v.x + orientation.y.x * v.y + orientation.z.x * v.z,
      orientation.x.y * v.x + orientation.y.y * v.y + orientation.z.y * v.z,
      orientation.x.z * v.x + orientation.y.z * v.y + orientation.z.z * v.z,
    );
  }

  static orbitUnit(rotation: { x: Vec3; y: Vec3; z: Vec3 }, at: Vec3, angle: number): Vec3 {
    const rotated = rotateAround(at, rotation.z, angle);
    return rotated;
  }
}
