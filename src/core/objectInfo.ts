// Builds the HTML shown by the Info Browser, ported from
// src/celestia/qt/qtinfopanel.cpp.
//
// The Qt panel is a QDockWidget holding one QTextBrowser, and it fills it from
// three templates: buildSolarSystemBodyPage, buildStarPage and buildDSOPage.
// The same templates, in the same order, with the same field labels and the same
// unit thresholds, are reproduced here.
//
// Everything the panel shows comes from the engine. Qt reads it straight out of
// Body, Orbit and RotationModel, so this does too, through the binding's reads
// (bodyInfo, bodyOrbitState, bodyFrames) and the compiled celastro module for
// the arithmetic: the sexagesimal conversions, the frame transforms and
// StateVectorToElements. The threshold that picks a unit and the text belong
// here, which is where Qt has them.

import { preferredLanguage, type CelestiaCoreHandle } from '@/engine/celestiaCore';
import { t } from '@/store/app';
import type { SelectedObject } from '@/wasm/celestia_core.js';
import { BodyClassification } from './celestia';
import {
  KM_PER_AU, KM_PER_LY, AU_PER_LY, type Vec3, vec3, sub, mul, cross, dot, length, radToDeg,
} from './math';
import {
  TDBtoUTC, celToJ2000Ecliptic, decimalToDegMinSec, decimalToHourMinSec, eclipticToEquatorial,
  equatorialToGalactic, kmToAU, stateVectorToElements,
} from './astro';

/**
 * The month abbreviation for the language in use. TDBToQString formats with
 * "dd MMM yyyy hh:mm", and QDateTime's MMM is the default locale's own month
 * name, so the abbreviation follows the language rather than being English.
 */
let monthFormatter: Intl.DateTimeFormat | null = null;
let monthFormatterLanguage = '';

function shortMonth(date: Date): string {
  const language = preferredLanguage();
  if (monthFormatter === null || monthFormatterLanguage !== language) {
    monthFormatterLanguage = language;
    // Intl wants a BCP 47 tag; gettext spells the language zh_CN.
    const tag = language === 'C' ? 'en' : language.replace('_', '-');
    monthFormatter = new Intl.DateTimeFormat(tag, { month: 'short' });
  }
  return monthFormatter.format(date);
}

/** Local time formatted as `dd MMM yyyy hh:mm`, matching TDBToQString. */
export function formatLocal(tdb: number): string {
  const utcDate = new Date((TDBtoUTC(tdb) - 2440587.5) * 86400000);
  const shifted = new Date(utcDate.getTime() + (-new Date().getTimezoneOffset()) * 60000);
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const m = shortMonth(shifted);
  const y = shifted.getUTCFullYear();
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${d} ${m} ${y} ${hh}:${mm}`;
}

/**
 * Groups thousands the way Qt's %L does: with the locale's group separator,
 * which for the C locale Celestia runs its numbers under is a comma.
 */
function number(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  const [whole, fraction] = fixed.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digitsOnly = sign ? whole.slice(1) : whole;
  const grouped = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

/**
 * Qt's %L1 applied to a double: QString::arg(double) prints six significant
 * digits in %g form, and %L groups thousands. Trailing zeros are dropped, so an
 * eccentricity of 0.0167 shows as 0.0167 and not as 0.0.
 */
function num(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Number(value.toPrecision(6));
  const sign = rounded < 0 ? '-' : '';
  const [whole, fraction] = String(Math.abs(rounded)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${sign}${grouped}.${fraction}` : `${sign}${grouped}`;
}

/**
 * The star line in the selection menu, which qtselectionpopup.cpp formats inline
 * rather than through DistanceLyToStr: ly above a thousand au, then au, km and m,
 * each to three decimals, and no imperial branch. Each unit is a catalogue entry
 * of its own, written as _("{:.3f} ly") and the like.
 */
export function formatSelectionDistance(km: number): string {
  const ly = km / KM_PER_LY;
  if (Math.abs(ly) >= 1000 / AU_PER_LY) return fixed3('{:.3f} ly', ly.toFixed(3));
  if (Math.abs(km) >= 1e7) return fixed3('{:.3f} au', (km / KM_PER_AU).toFixed(3));
  if (Math.abs(km) > 1) return fixed3('{:.3f} km', km.toFixed(3));
  return fixed3('{:.3f} m', (km * 1000).toFixed(3));
}

/** A `{:.3f}` template from the catalogue with its one value put in. */
function fixed3(template: string, value: string): string {
  return t(template).split('{:.3f}').join(value);
}

/** The panel's own rectToSpherical, which normalises the longitude. */
function toSpherical(v: Vec3): { lon: number; lat: number; distance: number } {
  const distance = Math.hypot(v.x, v.y, v.z);
  let lon = Math.atan2(v.y, v.x);
  if (lon < 0) lon += 2 * Math.PI;
  const lat = distance === 0 ? 0 : Math.asin(v.z / distance);
  return { lon, lat, distance };
}

/** `<b>RA:</b> 12h 34m 56s` and `<b>Dec:</b> -12° 34′ 56″`, as Qt prints them. */
function equatorialLines(equatorial: Vec3): string {
  const sph = toSpherical(equatorial);
  const raDeg = radToDeg(sph.lon);
  const decDeg = radToDeg(sph.lat);

  // Each field goes through %L, so the seconds carry six significant digits
  // rather than the full double. The line is the catalogue's whole, so its
  // translation decides where the values sit.
  return `${fill('<b>RA:</b> %L1h %L2m %L3s',
                  num(decimalToHourMinSec(raDeg, 0)),
                  num(Math.abs(decimalToHourMinSec(raDeg, 1))),
                  num(Math.abs(decimalToHourMinSec(raDeg, 2))))}<br>\n`
       + `${fill('<b>Dec:</b> %L1° %L2′ %L3″',
                  num(decimalToDegMinSec(decDeg, 0)),
                  num(Math.abs(decimalToDegMinSec(decDeg, 1))),
                  num(Math.abs(decimalToDegMinSec(decDeg, 2))))}<br>\n`;
}

interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Eigen's AngleAxisd(quaternion).axis(). */
function quatAxis(q: Quat): Vec3 {
  let n = Math.hypot(q.x, q.y, q.z);
  if (n === 0) return vec3(1, 0, 0);
  if (q.w < 0) n = -n;
  return vec3(q.x / n, q.y / n, q.z / n);
}

function quatRotate(q: Quat, v: Vec3): Vec3 {
  // v' = q v q*, expanded to avoid building quaternion matrices.
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return vec3(
    v.x + w * tx + (y * tz - z * ty),
    v.y + w * ty + (z * tx - x * tz),
    v.z + w * tz + (x * ty - y * tx),
  );
}

function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

const asVec = (v: number[]): Vec3 => vec3(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
const asQuat = (v: number[]): Quat => ({ x: v[0] ?? 0, y: v[1] ?? 0, z: v[2] ?? 0, w: v[3] ?? 1 });

/**
 * CalculateOsculatingElements from qtinfopanel.cpp: the orbit is sampled twice,
 * a little apart, and GM is estimated from how much the velocity changed, which
 * is enough to turn the state vector into elements without knowing the mass of
 * the primary.
 */
function osculatingElements(handle: CelestiaCoreHandle, path: string, t: number, orbitalPeriod: number) {
  const dt = orbitalPeriod > 0 ? orbitalPeriod * 1e-6 : 3.6525e-4;
  const first = handle.engine.bodyOrbitState(path, t);

  // A finite trajectory has to be sampled inside the interval it is valid over.
  let sdt = dt;
  if (!first.periodic && t + dt > first.validEnd) sdt = -dt;

  const second = handle.engine.bodyOrbitState(path, t + sdt);
  const p0 = asVec(first.positionKm ?? []);
  const p1 = asVec(second.positionKm ?? []);
  const v0 = asVec(first.velocityKmPerDay ?? []);
  const v1 = asVec(second.velocityKmPerDay ?? []);

  const accel = length(mul(sub(v1, v0), 1 / sdt));
  const mu = accel * dot(p0, p0);

  return { elements: stateVectorToElements(p0, v0, mu), p1, t };
}

/** buildSolarSystemBodyPage. */
function buildBodyPage(handle: CelestiaCoreHandle, picked: SelectedObject, tdb: number): string {
  const info = handle.engine.bodyInfo(picked.path);
  if (info.name === undefined) return '<p>Error: no object selected!</p>\n';

  let html = `<h1>${info.name}</h1>`;

  if (info.infoUrl) {
    // Qt writes this line as _("Web info: %1") with the anchor in the placeholder.
    html += `${fill('Web info: %1', `<a href="${info.infoUrl}">${info.infoUrl}</a>`)}<br>\n`;
  }

  html += '<br>';

  const isArtificial = info.classification === BodyClassification.Spacecraft;

  // The units are catalogue entries of their own: qtinfopanel.cpp assigns
  // _("hours"), _("days"), _("km") and the rest, so a translation can spell them.
  let units = t('km');
  let radius = info.radiusKm;
  if (radius < 1.0) {
    units = t('m');
    radius *= 1000.0;
  }

  html += info.ellipsoid
    ? `${fill('<b>Equatorial radius:</b> %L1 %2', num(radius), units)}<br>\n`
    : `${fill('<b>Size:</b> %L1 %2', num(radius), units)}<br>\n`;

  let orbitalPeriod = 0.0;
  const orbit = handle.engine.bodyOrbitState(picked.path, tdb);
  if (orbit.periodic) orbitalPeriod = info.orbitPeriod;

  // Rotation information is shown for natural, periodic rotators.
  if (info.rotationPeriodic && !isArtificial) {
    let rotPeriod = info.rotationPeriod;

    let dayLength = 0.0;
    let prograde = false;
    if (orbitalPeriod > 0.0) {
      const frames = handle.engine.bodyFrames(picked.path, tdb);
      const axis = quatAxis(quatMul(
        asQuat(frames.equatorOrientation ?? [0, 0, 0, 1]),
        asQuat(frames.bodyFrameOrientation ?? [0, 0, 0, 1]),
      ));
      const orbitNormal = quatRotate(
        asQuat(frames.orbitFrameOrientation ?? [0, 0, 0, 1]),
        cross(asVec(orbit.positionKm ?? []), asVec(orbit.velocityKmPerDay ?? [])),
      );
      prograde = dot(axis, orbitNormal) >= 0;
      const siderealDaysPerYear = orbitalPeriod / rotPeriod;
      const solarDaysPerYear = prograde ? siderealDaysPerYear - 1.0 : siderealDaysPerYear + 1.0;
      if (Math.abs(solarDaysPerYear) > 0.0001) {
        dayLength = Math.abs(orbitalPeriod / solarDaysPerYear);
      }
    }

    if (rotPeriod < 2.0) {
      rotPeriod *= 24.0;
      dayLength *= 24.0;
      units = t('hours');
    } else {
      units = t('days');
    }

    html += `${fill('<b>Sidereal rotation period:</b> %L1 %2', num(rotPeriod), units)}<br>\n`;
    if (orbitalPeriod > 0.0) {
      html += `${fill('<b>Rotation direction:</b> %1', t(prograde ? 'Prograde' : 'Retrograde'))}<br>\n`;
    }
    if (dayLength !== 0.0) {
      html += `${fill('<b>Length of day:</b> %L1 %2', num(dayLength), units)}<br>\n`;
    }
  }

  const { elements } = osculatingElements(handle, picked.path, tdb, orbitalPeriod);

  if (info.hasRings) html += `${t('<b>Has rings</b>')}<br>\n`;
  if (info.hasAtmosphere) html += `${t('<b>Has atmosphere</b>')}<br>\n`;

  if (info.lifespanBegin > -1.0e9) {
    html += `<br>${fill('<b>Start:</b> %1', formatLocal(info.lifespanBegin))}<br>\n`;
  }
  if (info.lifespanEnd < 1.0e9) {
    html += `<br>${fill('<b>End:</b> %1', formatLocal(info.lifespanEnd))}<br>\n`;
  }

  html += `<br><big><b>${t('Orbit information')}</b></big><br>\n`;
  html += `${fill('Osculating elements for %1', formatLocal(tdb))}<br>\n`;
  html += '<br>\n';

  if (orbitalPeriod > 0.0) {
    if (orbitalPeriod < 2.0) {
      orbitalPeriod *= 24.0;
      units = t('hours');
    } else if (orbitalPeriod < 365.25 * 2.0) {
      units = t('days');
    } else {
      units = t('years');
      orbitalPeriod /= 365.25;
    }
    html += `${fill('<b>Period:</b> %L1 %2', num(orbitalPeriod), units)}<br>\n`;
  }

  let sma = elements.semimajorAxis;
  if (Math.abs(sma) > 2.5e7) {
    units = t('AU');
    sma = kmToAU(sma);
  } else {
    units = t('km');
  }

  html += `${fill('<b>Semi-major axis:</b> %L1 %2', num(sma), units)}<br>\n`;
  html += `${fill('<b>Eccentricity:</b> %L1', num(elements.eccentricity))}<br>\n`;
  html += `${fill('<b>Inclination:</b> %L1°', num(radToDeg(elements.inclination)))}<br>\n`;
  html += `${fill('<b>Pericenter distance:</b> %L1 %2', num(sma * (1 - elements.eccentricity)), units)}<br>\n`;
  if (elements.eccentricity < 1.0) {
    html += `${fill('<b>Apocenter distance:</b> %L1 %2', num(sma * (1 + elements.eccentricity)), units)}<br>\n`;
  }

  html += `${fill('<b>Ascending node:</b> %L1°', num(radToDeg(elements.longAscendingNode)))}<br>\n`;
  html += `${fill('<b>Argument of periapsis:</b> %L1°', num(radToDeg(elements.argPericenter)))}<br>\n`;
  html += `${fill('<b>Mean anomaly:</b> %L1°', num(radToDeg(elements.meanAnomaly)))}<br>\n`;

  if (elements.eccentricity < 1.0) {
    html += `${fill('<b>Period (calculated):</b> %L1 %2', num(elements.period), t('days'))}<br>\n`;
  } else {
    html += `${fill('<b>Mean motion (calculated):</b> %L1°/day', num(360.0 / elements.period))}<br>\n`;
  }

  return html;
}

/** buildStarPage. */
function buildStarPage(handle: CelestiaCoreHandle, picked: SelectedObject): string {
  // Qt replaces the Greek letter abbreviations the catalogue uses.
  const name = handle.engine.greekName(picked.name);
  const equatorial = eclipticToEquatorial(celToJ2000Ecliptic(asVec(picked.positionKm)));
  return `<h1>${name}</h1>\n${equatorialLines(equatorial)}`;
}

/** buildDSOPage. */
function buildDSOPage(picked: SelectedObject): string {
  const equatorial = eclipticToEquatorial(celToJ2000Ecliptic(asVec(picked.positionKm)));
  const galactic = equatorialToGalactic(equatorial);
  const sph = toSpherical(galactic);

  const lDeg = radToDeg(sph.lon);
  const bDeg = radToDeg(sph.lat);

  return `<h1>${picked.name}</h1>\n`
       + equatorialLines(equatorial)
       + `${fill('<b>L:</b> %L1° %L2′ %L3″',
                  num(decimalToDegMinSec(lDeg, 0)),
                  num(Math.abs(decimalToDegMinSec(lDeg, 1))),
                  num(Math.abs(decimalToDegMinSec(lDeg, 2))))}<br>\n`
       + `${fill('<b>B:</b> %L1° %L2′ %L3″',
                  num(decimalToDegMinSec(bDeg, 0)),
                  num(Math.abs(decimalToDegMinSec(bDeg, 1))),
                  num(Math.abs(decimalToDegMinSec(bDeg, 2))))}<br>\n`;
}

/** The page for whatever the engine has picked, or the "nothing selected" page. */

/**
 * Fills the placeholders Celestia's panel strings carry.
 *
 * qtinfopanel.cpp writes each line as QString(_("<b>Period:</b> %L1 %2")).arg(...),
 * so the label and the numbers are one translatable string; the catalogue holds
 * them in that form and the translation moves the values into its own word order.
 * Every placeholder carries the L -- %L1, %L2, %L3 -- because Qt is asked to
 * group each number with the locale's separator, so both spellings are filled
 * for each argument.
 */
function fill(template: string, ...values: string[]): string {
  let text = t(template);
  values.forEach((value, index) => {
    const n = index + 1;
    text = text.split(`%L${n}`).join(value).split(`%${n}`).join(value);
  });
  return text;
}

export function buildInfoPage(handle: CelestiaCoreHandle | null, picked: SelectedObject | null): string {
  let body = '<p>Error: no object selected!</p>\n';

  if (handle !== null && picked !== null) {
    const tdb = handle.engine.getTime();
    if (picked.type === 'Body') body = buildBodyPage(handle, picked, tdb);
    else if (picked.type === 'Star') body = buildStarPage(handle, picked);
    else if (picked.type === 'DeepSky') body = buildDSOPage(picked);
  }

  return `<html><head><title>Info</title></head><body>${body}</body></html>`;
}
