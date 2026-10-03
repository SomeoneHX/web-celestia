// Astronomy facade over the WebAssembly core.
//
// Every function here delegates to the compiled C++ port of Celestia's
// src/celastro. Keeping the facade thin means there is exactly one
// implementation of each algorithm, and it is the one that was compiled from
// the original sources.

import { astro } from '@/wasm';
import { mat3XRotation, type Mat3, vec3, type Vec3, AU_PER_LY, KM_PER_AU } from './math';

const wasm = () => astro();

export const TTtoTAI = (tt: number): number => wasm().TTtoTAI(tt);
export const TAItoTT = (tai: number): number => wasm().TAItoTT(tai);
export const TTtoTDB = (tt: number): number => wasm().TTtoTDB(tt);
export const TDBtoTT = (tdb: number): number => wasm().TDBtoTT(tdb);
export const UTCtoTDB = (jdUTC: number): number => wasm().UTCtoTDB(jdUTC);
export const TDBtoUTC = (tdb: number): number => wasm().TDBtoUTC(tdb);
export const UTCtoTAI = (jdUTC: number): number => wasm().UTCtoTAI(jdUTC);
export const TAItoUTC = (tai: number): number => wasm().TAItoUTC(tai);
export const JDUTCtoTAI = (jdUTC: number): number => wasm().JDUTCtoTAI(jdUTC);
export const TAItoJDUTC = (tai: number): number => wasm().TAItoJDUTC(tai);

/** Reads a 3-vector out of the module's shared output buffer. */
function readOut(): Vec3 {
  const m = wasm();
  return vec3(m.outX(), m.outY(), m.outZ());
}

export function sunGeocentricPosition(tdb: number): Vec3 {
  wasm().sunGeocentric(tdb);
  return readOut();
}

export function earthHeliocentricPosition(tdb: number): Vec3 {
  wasm().earthHeliocentric(tdb);
  return readOut();
}

export function eclipticToEquatorial(v: Vec3): Vec3 {
  wasm().eclipticToEquatorial(v.x, v.y, v.z);
  return readOut();
}

export function equatorialToGalactic(v: Vec3): Vec3 {
  wasm().equatorialToGalactic(v.x, v.y, v.z);
  return readOut();
}

export function galacticToEquatorial(v: Vec3): Vec3 {
  wasm().galacticToEquatorial(v.x, v.y, v.z);
  return readOut();
}

export function precess(tdb: number, v: Vec3): Vec3 {
  wasm().precess(tdb, v.x, v.y, v.z);
  return readOut();
}

export function equatorialToHorizontal(lst: number, latitude: number, v: Vec3): Vec3 {
  wasm().equatorialToHorizontal(lst, latitude, v.x, v.y, v.z);
  return readOut();
}

export function anomaly(meanAnomaly: number, eccentricity: number): { trueAnomaly: number; eccentricAnomaly: number } {
  wasm().anomaly(meanAnomaly, eccentricity);
  const m = wasm();
  return { trueAnomaly: m.outX(), eccentricAnomaly: m.outY() };
}

export function localSiderealTime(tdb: number, longitude: number): number {
  wasm().siderealTime(tdb, longitude);
  return wasm().outX();
}

export const meanEclipticObliquity = (tdb: number): number => wasm().meanEclipticObliquity(tdb);
export const nutationInLongitude = (tdb: number): number => wasm().nutationInLongitude(tdb);
export const nutationInObliquity = (tdb: number): number => wasm().nutationInObliquity(tdb);

export const lumToAbsMag = (lum: number): number => wasm().lumToAbsMag(lum);
export const lumToAppMag = (lum: number, lyrs: number): number => wasm().lumToAppMag(lum, lyrs);
export const absMagToLum = (mag: number): number => wasm().absMagToLum(mag);
export const appMagToLum = (mag: number, lyrs: number): number => wasm().appMagToLum(mag, lyrs);
export const magToIrradiance = (mag: number): number => wasm().magToIrradiance(mag);
export const irradianceToMag = (irradiance: number): number => wasm().irradianceToMag(irradiance);

export const kmToAU = (km: number): number => wasm().kmToAU(km);
export const auToKm = (au: number): number => wasm().auToKm(au);
export const kmToLY = (km: number): number => wasm().kmToLY(km);
export const lyToKm = (ly: number): number => wasm().lyToKm(ly);
export const lyToParsecs = (ly: number): number => wasm().lyToParsecs(ly);
export const parsecsToLY = (pc: number): number => wasm().parsecsToLY(pc);

export const KM_PER_LY = 9460730472580.8;

/** Distance in celestial longitude/latitude, in kilometres, formatted. */
export function distanceUnit(km: number): string {
  return wasm().distanceUnitFor(km);
}

export function distanceInUnit(km: number): number {
  return wasm().distanceInUnit(km);
}

// -------------------------------------------------------------- calendar

export interface SimpleDate {
  year: number;
  month: number;
  day: number;
  /** Hour of day, 0..24, including the fractional part. */
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

export function jdToCalendar(jd: number): SimpleDate {
  const m = wasm();
  m.jdToCalendar(jd);
  const year = Math.round(m.outX());
  const month = Math.round(m.outY());
  const dayWithFraction = m.outZ();
  const day = Math.floor(dayWithFraction);
  const fraction = dayWithFraction - day;
  const totalSeconds = fraction * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const seconds = Math.floor(totalSeconds - hours * 3600 - minutes * 60);
  const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return { year, month, day, hours, minutes, seconds, milliseconds };
}

export function calendarToJD(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): number {
  const m = wasm();
  const dayFraction = (hours + minutes / 60 + seconds / 3600) / 24;
  m.calendarToJD(year, month, day, dayFraction);
  return m.outX();
}

export const dayOfWeek = (jd: number): number => wasm().dayOfWeek(jd);
export const isLeapYear = (year: number): boolean => wasm().isLeapYear(year);
export const daysInMonth = (year: number, month: number): number => wasm().daysInMonth(year, month);

/** UTC Julian date of the given proleptic Gregorian calendar instant. */
export function utcDateToJD(d: SimpleDate): number {
  return calendarToJD(d.year, d.month, d.day, d.hours, d.minutes, d.seconds + d.milliseconds / 1000);
}

export function TDBtoUTCDate(tdb: number): SimpleDate {
  return jdToCalendar(TDBtoUTC(tdb));
}

export function TDBtoLocalDate(tdb: number): SimpleDate {
  const utc = jdToCalendar(TDBtoUTC(tdb));
  const local = new Date(Date.UTC(utc.year, utc.month - 1, utc.day, utc.hours, utc.minutes, utc.seconds, utc.milliseconds));
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hours: local.getHours(),
    minutes: local.getMinutes(),
    seconds: local.getSeconds(),
    milliseconds: local.getMilliseconds(),
  };
}

// ----------------------------------------------------- named directions

/** Right ascension and declination of a J2000 direction, in radians. */
export function rectToSpherical(v: Vec3): { ra: number; dec: number; distance: number } {
  const distance = Math.hypot(v.x, v.y, v.z);
  return { ra: Math.atan2(v.y, v.x), dec: Math.asin(distance === 0 ? 0 : v.z / distance), distance };
}

/** J2000 ecliptic to J2000 equatorial, matching celToJ2000Ecliptic's inverse. */
export function celToJ2000Ecliptic(v: Vec3): Vec3 {
  return vec3(v.x, -v.z, v.y);
}

/** Equatorial J2000 to the observer's local horizontal frame. */
export function equatorialToObserverHorizontal(v: Vec3, tdb: number, longitude: number, latitude: number): Vec3 {
  return equatorialToHorizontal(localSiderealTime(tdb, longitude), latitude, v);
}

// ------------------------------------------------------- grid construction

/** Rotation taking the galactic frame to the J2000 equatorial frame. */
export function galacticToEquatorialMatrix(): Mat3 {
  // Transpose of the IAU 2000 equatorial-to-galactic matrix used in the wasm
  // module, which is orthonormal.
  const d2r = Math.PI / 180;
  void d2r;
  const m = EQUATORIAL_TO_GALACTIC;
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/** J2000 equatorial to galactic, the same matrix the wasm module applies. */
export const EQUATORIAL_TO_GALACTIC: Mat3 = [
  -0.0548755604162154, -0.873437090234885, -0.4838350155487132,
  0.4941094278755837, -0.4448296299600112, 0.7469822444972189,
  -0.8676661490190047, -0.1980763734312015, 0.4559837761750669,
];

/** Ecliptic J2000 to equatorial J2000, the rotation the wasm module applies. */
export function eclipticToEquatorialMatrix(): Mat3 {
  return mat3XRotation(J2000_OBLIQUITY);
}

/** J2000 mean obliquity of the ecliptic, radians. */
export const J2000_OBLIQUITY = 23.4392911 * (Math.PI / 180);

export { AU_PER_LY, KM_PER_AU };
