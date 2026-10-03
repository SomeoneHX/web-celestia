// Converts the upstream catalogues into the compact asset set the renderer loads.
//
//   node tools/convert-catalog.mjs <d3-celestial-data-dir>
//
// Inputs (d3-celestial, derived from the Hipparcos/Yale bright star catalogue,
// the IAU constellation line and boundary tables and the Messier/NGC lists):
//   stars.6.json, stars.8.json, constellations.json, constellations.lines.json,
//   constellations.borders.json, dsos.6.json, starnames.json
//
// Outputs (public/data):
//   stars.bin                 Float32 records: x, y, z, mag, bv, distanceLy
//   constellations.json       identifier, names, label direction
//   constellation-lines.json  flattened unit-vector segments per constellation
//   constellation-borders.json
//   dsos.json
//   starnames.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = process.argv[2];
if (!srcDir) {
  console.error('usage: node tools/convert-catalog.mjs <d3-celestial-data-dir>');
  process.exit(1);
}

const outDir = join(here, '..', 'public', 'data');
mkdirSync(outDir, { recursive: true });

const read = (name) => JSON.parse(readFileSync(join(srcDir, name), 'utf8'));
const D2R = Math.PI / 180;

/** Right ascension/declination in degrees to a J2000 unit vector. */
function raDecToVec(raDeg, decDeg) {
  const ra = raDeg * D2R;
  const dec = decDeg * D2R;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

// ---------------------------------------------------------------- distances
//
// The source catalogue carries no parallax, so distance comes from a main
// sequence photometric relation between B-V and absolute visual magnitude.
// Interpolated at the tabulated control points; giants and supergiants are
// therefore placed too close, which is noted in the README.

const BV_TO_MV = [
  [-0.4, -2.0],
  [-0.3, -1.5],
  [0.0, 0.9],
  [0.3, 2.7],
  [0.6, 4.8],
  [0.9, 6.5],
  [1.2, 8.0],
  [1.5, 10.0],
  [2.0, 13.0],
];

function absoluteMagnitude(bv) {
  if (Number.isNaN(bv)) return 4.8;
  const table = BV_TO_MV;
  if (bv <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (bv <= table[i][0]) {
      const [b0, m0] = table[i - 1];
      const [b1, m1] = table[i];
      const t = (bv - b0) / (b1 - b0);
      return m0 + t * (m1 - m0);
    }
  }
  return table[table.length - 1][1];
}

function distanceLightYears(mag, bv) {
  const mv = absoluteMagnitude(bv);
  const parsecs = Math.pow(10, (mag - mv + 5) / 5);
  const ly = parsecs * 3.26156377716743356213863970704550837409;
  return Math.min(Math.max(ly, 1.0), 100000.0);
}

// ------------------------------------------------------------------- stars

const stars = [];
const seen = new Set();
for (const file of ['stars.6.json', 'stars.8.json']) {
  for (const feature of read(file).features) {
    const id = feature.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const [ra, dec] = feature.geometry.coordinates;
    const mag = feature.properties.mag;
    const bvRaw = feature.properties.bv;
    const bv = bvRaw === '' || bvRaw == null ? NaN : Number(bvRaw);
    if (mag > 8.05) continue;
    const [x, y, z] = raDecToVec(ra, dec);
    stars.push({
      id,
      x,
      y,
      z,
      mag,
      bv: Number.isNaN(bv) ? 0.65 : bv,
      dist: distanceLightYears(mag, bv),
    });
  }
}
stars.sort((a, b) => a.mag - b.mag);

const starBuffer = new ArrayBuffer(stars.length * 6 * 4);
const starView = new Float32Array(starBuffer);
stars.forEach((s, i) => {
  starView[i * 6 + 0] = s.x;
  starView[i * 6 + 1] = s.y;
  starView[i * 6 + 2] = s.z;
  starView[i * 6 + 3] = s.mag;
  starView[i * 6 + 4] = s.bv;
  starView[i * 6 + 5] = s.dist;
});
writeFileSync(join(outDir, 'stars.bin'), Buffer.from(starBuffer));
console.log(`stars.bin          ${stars.length} stars`);

// Index of catalogue id -> record number, so names can be resolved at runtime.
const idToIndex = {};
stars.forEach((s, i) => {
  idToIndex[s.id] = i;
});

// ---------------------------------------------------------------- star names

const rawNames = read('starnames.json');
const names = {};
for (const [id, entry] of Object.entries(rawNames)) {
  const index = idToIndex[id];
  if (index === undefined) continue;
  const label = entry.name || (entry.bayer ? `${entry.bayer} ${entry.c}` : '') || (entry.flam ? `${entry.flam} ${entry.c}` : '');
  if (!label) continue;
  names[index] = {
    n: entry.name || '',
    b: entry.bayer || '',
    f: entry.flam || '',
    v: entry.var || '',
    c: entry.c || '',
    d: entry.desig || '',
    hd: (entry.hd || '').replace(/^HD\s*/, ''),
    hip: (entry.hip || '').replace(/^HIP\s*/, ''),
  };
}
writeFileSync(join(outDir, 'starnames.json'), JSON.stringify(names));
console.log(`starnames.json     ${Object.keys(names).length} named stars`);

// ----------------------------------------------------------- constellations

const constellationMeta = read('constellations.json');
const zodiac = new Set(['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc']);
const constellations = [];
for (const feature of constellationMeta.features) {
  const p = feature.properties;
  // Label direction: average the catalogue's own anchor, which is given as
  // [ra, dec] in degrees inside the geometry for these features.
  const coords = feature.geometry?.coordinates;
  let label = [0, 0, 1];
  if (coords) label = raDecToVec(coords[0], coords[1]);
  constellations.push({
    id: feature.id,
    name: p.name,
    en: p.en || p.name,
    zh: p.zh || '',
    la: p.la || p.en || p.name,
    gen: p.gen || '',
    desig: p.desig || feature.id,
    rank: Number(p.rank || 3),
    zodiac: zodiac.has(feature.id),
    label,
  });
}
writeFileSync(join(outDir, 'constellations.json'), JSON.stringify(constellations));
console.log(`constellations.json ${constellations.length} constellations`);

// ------------------------------------------------------------------- lines

const linesSrc = read('constellations.lines.json');
const lines = {};
for (const feature of linesSrc.features) {
  const segments = [];
  for (const segment of feature.geometry.coordinates) {
    const flat = [];
    for (const [ra, dec] of segment) {
      const v = raDecToVec(ra, dec);
      flat.push(v[0], v[1], v[2]);
    }
    if (flat.length >= 6) segments.push(flat);
  }
  lines[feature.id] = segments;
}
writeFileSync(join(outDir, 'constellation-lines.json'), JSON.stringify(lines));
const lineCount = Object.values(lines).reduce((a, s) => a + s.length, 0);
console.log(`constellation-lines.json ${lineCount} polyline segments`);

// ----------------------------------------------------------------- borders

const bordersSrc = read('constellations.borders.json');
const borders = [];
for (const feature of bordersSrc.features) {
  for (const segment of feature.geometry.coordinates) {
    const flat = [];
    // Border arcs are short, but subdividing keeps them smooth on screen.
    for (let i = 0; i < segment.length - 1; i++) {
      const a = raDecToVec(segment[i][0], segment[i][1]);
      const b = raDecToVec(segment[i + 1][0], segment[i + 1][1]);
      const steps = 8;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        let x = a[0] + (b[0] - a[0]) * t;
        let y = a[1] + (b[1] - a[1]) * t;
        let z = a[2] + (b[2] - a[2]) * t;
        const len = Math.hypot(x, y, z) || 1;
        x /= len;
        y /= len;
        z /= len;
        if (k > 0 || flat.length === 0) flat.push(x, y, z);
      }
    }
    if (flat.length >= 6) borders.push(flat);
  }
}
writeFileSync(join(outDir, 'constellation-borders.json'), JSON.stringify(borders));
console.log(`constellation-borders.json ${borders.length} arcs`);

// -------------------------------------------------------------------- DSOs

const DSO_TYPES = {
  g: 'Galaxy',
  gg: 'Galaxy',
  gp: 'Galaxy',
  gs: 'Galaxy',
  sfr: 'Nebula',
  snr: 'Nebula',
  bn: 'Nebula',
  drk: 'Nebula',
  rn: 'Nebula',
  pn: 'Planetary nebula',
  emn: 'Nebula',
  hii: 'Nebula',
  gc: 'Globular cluster',
  oc: 'Open cluster',
  cl: 'Cluster',
  n: 'Nebula',
  pos: 'Star',
  dup: 'Duplicate',
  other: 'Other',
};

const dsoNames = read('dsonames.json');
const dsos = [];
const messier = read('messier.json');
for (const feature of messier.features) {
  const [ra, dec] = feature.geometry.coordinates;
  const p = feature.properties;
  dsos.push({
    id: feature.id,
    desig: p.desig || '',
    name: p.alt || '',
    type: DSO_TYPES[p.type] || 'Other',
    mag: Number(p.mag) || 999,
    dim: p.dim || '',
    vec: raDecToVec(ra, dec),
    messier: true,
  });
}

for (const feature of read('dsos.6.json').features) {
  const p = feature.properties;
  const [ra, dec] = feature.geometry.coordinates;
  const id = feature.id;
  if (dsos.some((d) => d.id === id)) continue;
  const mag = Number(p.mag) || 999;
  if (mag > 14) continue;
  const entry = dsoNames[id];
  dsos.push({
    id,
    desig: p.desig || id,
    name: entry && entry.length ? entry.join(' / ') : '',
    type: DSO_TYPES[p.type] || 'Other',
    mag,
    dim: p.dim || '',
    vec: raDecToVec(ra, dec),
    messier: false,
  });
}
writeFileSync(join(outDir, 'dsos.json'), JSON.stringify(dsos));
console.log(`dsos.json          ${dsos.length} objects`);

// ---------------------------------------------------------------- summary

let bytes = 0;
for (const f of ['stars.bin', 'constellations.json', 'constellation-lines.json', 'constellation-borders.json', 'dsos.json', 'starnames.json']) {
  bytes += readFileSync(join(outDir, f)).length;
}
console.log(`total              ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
