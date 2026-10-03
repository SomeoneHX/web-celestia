// Type declarations for the Emscripten module built by wasm/build.sh.

export interface CelestiaAstroModule {
  // Time system conversions. All values are Julian dates unless stated.
  TTtoTAI(tt: number): number;
  TAItoTT(tai: number): number;
  TTtoTDB(tt: number): number;
  TDBtoTT(tdb: number): number;
  UTCtoTDB(jdUTC: number): number;
  TDBtoUTC(tdb: number): number;
  UTCtoTAI(jdUTC: number): number;
  TAItoUTC(tai: number): number;
  JDUTCtoTAI(jdUTC: number): number;
  TAItoJDUTC(tai: number): number;

  // Calendar.
  calendarToJD(year: number, month: number, day: number, dayFraction: number): void;
  jdToCalendar(jd: number): void;
  dayOfWeek(jd: number): number;
  isLeapYear(year: number): boolean;
  daysInMonth(year: number, month: number): number;

  // Ephemeris and rotations. Vector results land in the shared output buffer
  // read back through outX / outY / outZ.
  sunGeocentric(jd: number): void;
  earthHeliocentric(jd: number): void;
  eclipticToEquatorial(x: number, y: number, z: number): void;
  equatorialToGalactic(x: number, y: number, z: number): void;
  galacticToEquatorial(x: number, y: number, z: number): void;
  precess(jd: number, x: number, y: number, z: number): void;
  equatorialToHorizontal(lst: number, latitude: number, x: number, y: number, z: number): void;
  siderealTime(jd: number, longitude: number): void;
  anomaly(meanAnomaly: number, eccentricity: number): void;

  meanEclipticObliquity(jd: number): number;
  nutationInLongitude(jd: number): number;
  nutationInObliquity(jd: number): number;

  // Photometry.
  lumToAbsMag(lum: number): number;
  lumToAppMag(lum: number, lyrs: number): number;
  absMagToLum(mag: number): number;
  appMagToLum(mag: number, lyrs: number): number;
  magToIrradiance(mag: number): number;
  irradianceToMag(irradiance: number): number;

  // Units.
  kmToAU(km: number): number;
  auToKm(au: number): number;
  kmToLY(km: number): number;
  lyToKm(ly: number): number;
  lyToParsecs(ly: number): number;
  parsecsToLY(pc: number): number;
  degToRad(deg: number): number;
  radToDeg(rad: number): number;
  distanceInUnit(km: number): number;
  distanceUnitFor(km: number): string;
  decimalToDegMinSec(angle: number, which: number): number;

  // Shared output buffer accessors.
  outX(): number;
  outY(): number;
  outZ(): number;
}

export interface CelestiaAstroFactoryOptions {
  locateFile?: (path: string, prefix: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}

declare const createCelestiaAstro: (options?: CelestiaAstroFactoryOptions) => Promise<CelestiaAstroModule>;
export default createCelestiaAstro;
