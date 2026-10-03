// Builds the HTML shown by the Info Browser, ported from
// src/celestia/qt/qtinfopanel.cpp.
//
// The Qt panel is a QDockWidget holding a single QTextBrowser; the page for the
// current selection is produced by buildSolarSystemBodyPage, buildStarPage or
// buildDSOPage. The same three templates and the same field order are used here,
// including the oscillating orbital elements block that CalculateOsculatingElements
// feeds.

import type { Universe } from './universe';
import type { Selection } from './selection';
import type { Body } from './body';
import { BodyClassification } from './body';
import type { Star } from './star';
import type { DeepSkyObject } from './dso';
import { spectralTypeFromColorIndex, temperatureFromColorIndex, StarCatalog } from './star';
import { DSO_DEFAULT_ABS_MAGNITUDE } from './dso';
import {
  AU_PER_LY, KM_PER_AU, KM_PER_LY, SOLAR_RADIUS, type Vec3, vec3, sub, length, normalize,
  dot, cross, degToRad, radToDeg, J2000, mul,
} from './math';
import { TDBtoUTC, eclipticToEquatorial, rectToSpherical, galacticToEquatorial, equatorialToGalactic } from './astro';

/** Local time formatted as `dd MMM yyyy hh:mm`, matching TDBToQString. */
function formatLocal(tdb: number): string {
  const utcDate = new Date((TDBtoUTC(tdb) - 2440587.5) * 86400000);
  const shifted = new Date(utcDate.getTime() + (-new Date().getTimezoneOffset()) * 60000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const m = months[shifted.getUTCMonth()];
  const y = shifted.getUTCFullYear();
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${d} ${m} ${y} ${hh}:${mm}`;
}

/** Groups thousands with a thin space, matching the %L formatting. */
function number(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  const [whole, fraction] = fixed.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digitsOnly = sign ? whole.slice(1) : whole;
  const grouped = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

function decimalToHourMinSec(angleRad: number): string {
  const degrees = radToDeg(angleRad);
  const hours = degrees / 15;
  const h = Math.floor(Math.abs(hours));
  const minutesTotal = (Math.abs(hours) - h) * 60;
  const m = Math.floor(minutesTotal);
  const s = (minutesTotal - m) * 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${s.toFixed(1)}s`;
}

function decimalToDegMinSec(angleRad: number): string {
  const degrees = radToDeg(angleRad);
  const sign = degrees < 0 ? '-' : '+';
  const a = Math.abs(degrees);
  const d = Math.floor(a);
  const minutesTotal = (a - d) * 60;
  const m = Math.floor(minutesTotal);
  const s = (minutesTotal - m) * 60;
  return `${sign}${d}° ${String(m).padStart(2, '0')}′ ${s.toFixed(1)}″`;
}

/** Human readable distance, following DistanceLyToStr in hud.cpp. */
export function formatDistance(km: number): string {
  const ly = km / KM_PER_LY;
  if (ly >= AU_PER_LY * 1e6) return `${number((ly / AU_PER_LY) / 1e6, 3)} Mpc`;
  if (ly >= AU_PER_LY * 1e3 * 0.5) return `${number((ly / AU_PER_LY) / 1e3, 3)} kpc`;
  if (ly >= 1000 / AU_PER_LY) return `${number(ly, 3)} ly`;
  if (km >= 1e7) return `${number(km / KM_PER_AU, 3)} au`;
  if (km > 1) return `${number(km, 1)} km`;
  return `${number(km * 1000, 1)} m`;
}

/** Approximate osculating elements from the body's Keplerian orbit. */
interface OsculatingElements {
  period: number;
  semiMajorAxis: number;
  eccentricity: number;
  inclination: number;
  pericenterDistance: number;
  apocenterDistance: number;
  ascendingNode: number;
  argPericenter: number;
  meanAnomaly: number;
}

function osculatingElements(body: Body, tdb: number): OsculatingElements | null {
  const orbit = body.orbit;
  if (!orbit) return null;
  const meanMotion = (2 * Math.PI) / orbit.period;
  const meanAnomaly = normalizeAngle(orbit.meanAnomalyAtEpoch + (tdb - orbit.epoch) * meanMotion);
  return {
    period: orbit.period,
    semiMajorAxis: orbit.semiMajorAxis,
    eccentricity: orbit.eccentricity,
    inclination: orbit.inclination,
    pericenterDistance: orbit.semiMajorAxis * (1 - orbit.eccentricity),
    apocenterDistance: orbit.semiMajorAxis * (1 + orbit.eccentricity),
    ascendingNode: orbit.ascendingNode,
    argPericenter: orbit.argPericenter,
    meanAnomaly,
  };
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

function periodUnit(days: number): [number, string] {
  if (days < 2) return [days * 24, 'hours'];
  if (days < 730.5) return [days, 'days'];
  return [days / 365.25, 'years'];
}

function distanceUnit(km: number): [number, string] {
  if (Math.abs(km) > 2.5e7) return [km / KM_PER_AU, 'AU'];
  return [km, 'km'];
}

export function buildInfoPage(selection: Selection, universe: Universe, tdb: number): string {
  let body = '<html><head><title>Info</title></head><body>';
  if (selection.body) {
    body += buildSolarSystemBodyPage(selection.body, tdb);
  } else if (selection.star) {
    body += buildStarPage(selection.star);
  } else if (selection.deepsky) {
    body += buildDSOPage(selection.deepsky);
  } else if (selection.location) {
    body += buildLocationPage(selection.location, tdb);
  } else {
    body += 'Error: no object selected!\n';
  }
  body += '</body></html>';
  void universe;
  return body;
}

function buildSolarSystemBodyPage(body: Body, tdb: number): string {
  let out = `<h1>${escapeHtml(body.localizedName)}</h1>\n`;

  out += `<b>Equatorial radius:</b> ${number(body.radius, 1)} km<br>\n`;

  const isArtificial = (body.classification & BodyClassification.Spacecraft) !== 0;
  const period = body.rotation.period;
  const hasRotation = !isArtificial && period !== 0;

  if (hasRotation) {
    const [value, unit] = periodUnit(Math.abs(period));
    out += `<b>Sidereal rotation period:</b> ${number(value, 4)} ${unit}<br>\n`;
    out += `<b>Rotation direction:</b> ${period > 0 ? 'Prograde' : 'Retrograde'}<br>\n`;
  }

  if (body.rings) out += '<b>Has rings</b><br>\n';
  if (body.atmosphere) out += '<b>Has atmosphere</b><br>\n';

  const elements = osculatingElements(body, tdb);
  if (elements) {
    out += `<span class="orbit-heading"><b>Orbit information</b></span>\n`;
    out += `Osculating elements for ${escapeHtml(formatLocal(tdb))}<br>\n`;

    const [periodValue, periodLabel] = periodUnit(elements.period);
    out += `<b>Period:</b> ${number(periodValue, 4)} ${periodLabel}<br>\n`;

    const [smaValue, smaUnit] = distanceUnit(elements.semiMajorAxis);
    out += `<b>Semi-major axis:</b> ${number(smaValue, 6)} ${smaUnit}<br>\n`;
    out += `<b>Eccentricity:</b> ${number(elements.eccentricity, 6)}<br>\n`;
    out += `<b>Inclination:</b> ${number(radToDeg(elements.inclination), 4)}°<br>\n`;

    const [periValue, periUnit] = distanceUnit(elements.pericenterDistance);
    out += `<b>Pericenter distance:</b> ${number(periValue, 6)} ${periUnit}<br>\n`;

    if (elements.eccentricity < 1) {
      const [apoValue, apoUnit] = distanceUnit(elements.apocenterDistance);
      out += `<b>Apocenter distance:</b> ${number(apoValue, 6)} ${apoUnit}<br>\n`;
    }

    out += `<b>Ascending node:</b> ${number(radToDeg(elements.ascendingNode), 4)}°<br>\n`;
    out += `<b>Argument of periapsis:</b> ${number(radToDeg(elements.argPericenter), 4)}°<br>\n`;
    out += `<b>Mean anomaly:</b> ${number(radToDeg(elements.meanAnomaly), 4)}°<br>\n`;

    if (elements.eccentricity < 1) {
      out += `<b>Period (calculated):</b> ${number(elements.period, 6)} days<br>\n`;
    } else {
      out += `<b>Mean motion (calculated):</b> ${number(360 / elements.period, 6)}°/day<br>\n`;
    }
  }

  return out;
}

function buildStarPage(star: Star): string {
  const name = StarCatalog.replaceGreekLetterAbbr(
    star.names?.n || (star.names?.b && star.names?.c ? `${star.names.b} ${star.names.c}` : `HIP ${star.index}`),
  );
  const position = mul(star.direction, star.distanceLy * KM_PER_LY);
  const equatorial = celToJ2000Equatorial(position);
  const spherical = rectToSpherical(equatorial);

  let out = `<h1>${escapeHtml(name)}</h1>\n`;
  out += `<b>RA:</b> ${decimalToHourMinSec(spherical.ra)}<br>\n`;
  out += `<b>Dec:</b> ${decimalToDegMinSec(spherical.dec)}<br>\n`;
  out += `<b>Distance:</b> ${formatDistance(star.distanceLy * KM_PER_LY)}<br>\n`;
  out += `<b>Abs (app) mag:</b> ${star.absoluteMag.toFixed(2)} (${star.apparentMag.toFixed(2)})<br>\n`;
  out += `<b>Class:</b> ${spectralTypeFromColorIndex(star.colorIndex)}<br>\n`;
  out += `<b>Luminosity:</b> ${number(star.luminosity, 4)}× Sun<br>\n`;
  out += `<b>Temperature:</b> ${temperatureFromColorIndex(star.colorIndex)} K<br>\n`;
  return out;
}

/** The panel works in the J2000 ecliptic frame, as celToJ2000Ecliptic does. */
function celToJ2000Equatorial(position: Vec3): Vec3 {
  const ecliptic = vec3(position.x, position.y, position.z);
  return eclipticToEquatorial(ecliptic);
}

function buildDSOPage(dso: DeepSkyObject, universe?: Universe): string {
  void universe;
  const equatorial = dso.position;
  const spherical = rectToSpherical(equatorial);
  const galactic = equatorialToGalactic(equatorial);
  const galacticSpherical = rectToSpherical(galactic);

  let out = `<h1>${escapeHtml(dso.designation || dso.name || dso.id)}</h1>\n`;
  if (dso.name && dso.name !== dso.designation) out += `${escapeHtml(dso.name)}<br>\n`;
  out += `<b>Type:</b> ${escapeHtml(dso.type)}<br>\n`;
  out += `<b>RA:</b> ${decimalToHourMinSec(spherical.ra)}<br>\n`;
  out += `<b>Dec:</b> ${decimalToDegMinSec(spherical.dec)}<br>\n`;
  out += `<b>L:</b> ${decimalToDegMinSec(galacticSpherical.ra)}<br>\n`;
  out += `<b>B:</b> ${decimalToDegMinSec(galacticSpherical.dec)}<br>\n`;
  if (dso.magnitude !== DSO_DEFAULT_ABS_MAGNITUDE && Number.isFinite(dso.magnitude)) {
    out += `<b>Apparent magnitude:</b> ${dso.magnitude.toFixed(1)}<br>\n`;
  }
  if (dso.dimensions) out += `<b>Dimensions:</b> ${escapeHtml(dso.dimensions)}′<br>\n`;
  return out;
}

function buildLocationPage(location: import('./locations').Location, tdb: number): string {
  const lat = radToDeg(location.latitude);
  const lon = radToDeg(location.longitude);
  let out = `<h1>${escapeHtml(location.name)}</h1>\n`;
  out += `<b>Parent body:</b> ${escapeHtml(location.parent.localizedName)}<br>\n`;
  out += `<b>Latitude:</b> ${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}<br>\n`;
  out += `<b>Longitude:</b> ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}<br>\n`;
  if (location.altitude !== 0) out += `<b>Altitude:</b> ${number(location.altitude, 3)} km<br>\n`;
  out += `<b>Simulation time:</b> ${escapeHtml(formatLocal(tdb))}<br>\n`;
  return out;
}

/** Body summary used by the HUD overlay, mirroring Hud::displayPlanetInfo. */
export function buildHudBodyInfo(body: Body, distanceKm: number, universe: Universe, tdb: number): string[] {
  const lines: string[] = [];
  lines.push(`Distance: ${formatDistance(Math.max(distanceKm - body.radius, 0))}`);
  const angular = (2 * Math.atan(body.radius / Math.max(distanceKm - body.radius, 1))) * (180 / Math.PI) * 3600;
  if (angular > 0.5) lines.push(`Apparent diameter: ${number(angular, 1)}"`);

  const sunPosition = universe.getBodyScenePosition(universe.sol, tdb);
  const bodyPosition = universe.getBodyScenePosition(body, tdb);
  void sunPosition;
  void bodyPosition;
  return lines;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export { sub, length, normalize, dot, cross, degToRad, J2000, galacticToEquatorial, formatLocal, escapeHtml };
