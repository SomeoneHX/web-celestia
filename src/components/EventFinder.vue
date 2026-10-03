<script setup lang="ts">
// The Event Finder dock, ported from qteventfinder.cpp.
//
// Modelled on EclipseFinder: the search steps through lunations and tests the
// Sun, Moon and Earth geometry for each new and full moon. A solar eclipse
// happens when the Moon is close enough to the Sun in the sky at new moon, a
// lunar eclipse when the Moon is close enough to the Earth's shadow axis at full
// moon. The limits are the standard ones: about 18° of ecliptic longitude for a
// solar eclipse and about 12° for a lunar eclipse.

import { ref } from 'vue';
import { engine, showMessage } from '@/store/app';
import { add, sub, mul, length, normalize, dot, cross, vec3, KM_PER_AU, J2000 } from '@/core/math';
import { jdToCalendar } from '@/core/astro';
import { formatLocal } from '@/core/objectInfo';

type EclipseType = 'solar' | 'lunar' | 'all';

interface EclipseRecord {
  receiver: string;
  occulter: string;
  startTime: number;
  endTime: number;
  type: EclipseType;
}

const type = ref<EclipseType>('solar');
const startYear = ref(new Date().getUTCFullYear() - 1);
const endYear = ref(new Date().getUTCFullYear() + 1);
const targetBody = ref('Earth');
const progress = ref(0);
const searching = ref(false);
const error = ref('');

const bodies = ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

/** Synodic month in days, the interval between successive new moons. */
const SYNODIC_MONTH = 29.530588853;

function yearToJD(year: number): number {
  return 2451544.5 + (year - 2000) * 365.25;
}

/** Angular separation between two scene positions, as seen from an origin. */
function angularSeparation(origin: { x: number; y: number; z: number }, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const da = normalize(sub(a, origin));
  const db = normalize(sub(b, origin));
  return Math.acos(Math.min(1, Math.max(-1, dot(da, db))));
}

async function findEclipses(): Promise<void> {
  results.value = [];
  error.value = '';
  const universe = engine().universe;
  const earth = universe.bodiesByName.get('earth');
  const moon = earth?.satellites.find((s) => s.name === 'Moon');
  const sol = universe.sol;
  if (!earth || !moon) {
    error.value = 'The built-in solar system is missing Earth or the Moon';
    return;
  }

  const startJD = yearToJD(startYear.value);
  const endJD = yearToJD(endYear.value);
  if (startJD >= endJD) {
    error.value = 'End date is earlier than start date.';
    return;
  }

  searching.value = true;
  progress.value = 0;

  const found: EclipseRecord[] = [];
  const total = (endJD - startJD) / SYNODIC_MONTH;
  let count = 0;

  for (let jd = startJD; jd < endJD; jd += SYNODIC_MONTH / 2) {
    count++;
    if (count % 40 === 0) {
      progress.value = count / total;
      // Yield so the progress bar can paint.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const earthPosition = universe.getBodyScenePosition(earth, jd);
    const sunPosition = universe.getBodyScenePosition(sol, jd);
    const moonPosition = universe.getBodyScenePosition(moon, jd);
    const isNewMoon = count % 2 === 0;

    if (isNewMoon && (type.value === 'solar' || type.value === 'all')) {
      // Solar eclipse: the Moon must pass close to the Sun as seen from Earth.
      const separation = angularSeparation(moonPosition, sunPosition, earthPosition);
      const sunRadius = Math.atan(sol.radius / Math.max(length(sub(sunPosition, moonPosition)), 1));
      const moonRadius = Math.atan(moon.radius / Math.max(length(sub(moonPosition, earthPosition)), 1));
      if (separation < sunRadius * 18) {
        // Duration from the relative motion over the eclipse window.
        const duration = estimateDuration(moon, earth, universe, jd, separation);
        found.push({ receiver: 'Earth', occulter: 'Moon', startTime: jd - duration / 2, endTime: jd + duration / 2, type: 'solar' });
      }
    }

    if (!isNewMoon && (type.value === 'lunar' || type.value === 'all')) {
      // Lunar eclipse: the Moon must pass close to the anti-solar direction.
      const antiSun = normalize(sub(earthPosition, sunPosition));
      const toMoon = normalize(sub(moonPosition, earthPosition));
      const separation = Math.acos(Math.min(1, Math.max(-1, dot(antiSun, toMoon))));
      const shadow = Math.atan((earth.radius * 2.6) / Math.max(length(sub(moonPosition, earthPosition)), 1));
      if (separation < shadow * 1.35) {
        const duration = estimateDuration(moon, earth, universe, jd, separation);
        found.push({ receiver: 'Moon', occulter: 'Earth shadow', startTime: jd - duration / 2, endTime: jd + duration / 2, type: 'lunar' });
      }
    }

    if (found.length > 4000) break;
  }

  results.value = found;
  searching.value = false;
  progress.value = 1;
  if (found.length === 0) showMessage('No eclipses found in the given range', 3);
}

/**
 * Approximate duration of an eclipse from the geometry: the Moon covers about
 * 0.55° per hour of ecliptic longitude relative to the Sun.
 */
function estimateDuration(moon: import('@/core/body').Body, earth: import('@/core/body').Body, universe: ReturnType<typeof engine>['universe'], jd: number, separation: number): number {
  void universe;
  const moonOrbitPeriod = Math.abs(moon.rotation.period) || SYNODIC_MONTH;
  void moonOrbitPeriod;
  const synodicRate = (360 / SYNODIC_MONTH) / 24;
  const angularRadius = Math.atan((earth.radius + moon.radius * 0.5) / Math.max(length(sub(universe.getBodyScenePosition(moon, jd), universe.getBodyScenePosition(earth, jd))), 1));
  const coverage = Math.max(0, angularRadius * 3.2 - separation);
  const degrees = (coverage * 180) / Math.PI;
  return Math.max(0.5, (degrees / synodicRate) * 2);
}

function setTimeToMidEclipse(record: EclipseRecord): void {
  engine().simulation.setTime((record.startTime + record.endTime) / 2);
  showMessage('Simulation time set to mid eclipse', 2);
}

function viewNearEclipsed(record: EclipseRecord): void {
  const universe = engine().universe;
  const body = universe.bodiesByName.get(record.receiver.toLowerCase());
  if (!body) return;
  const tdb = (record.startTime + record.endTime) / 2;
  engine().simulation.setTime(tdb);
  const selection = { body } as import('@/core/selection').Selection;
  const observer = engine().observer;
  observer.setTarget(selection, 'follow');
  const position = universe.getBodyScenePosition(body, tdb);
  observer.setPosition(add(position, vec3(body.radius * 4, body.radius * 1.2, body.radius * 3)));
  observer.centerSelection();
  showMessage(`Viewing the eclipse from near ${body.localizedName}`, 3);
}

function formatDuration(record: EclipseRecord): string {
  const minutes = Math.round((record.endTime - record.startTime) * 24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const results = ref<EclipseRecord[]>([]);
const selectedRow = ref<number | null>(null);
</script>

<template>
  <div class="qt-split">
    <div class="qt-hbox" style="padding: 6px; flex-wrap: wrap">
      <label class="qt-radio"><input v-model="type" type="radio" value="solar" />Solar eclipses</label>
      <label class="qt-radio"><input v-model="type" type="radio" value="lunar" />Lunar eclipses</label>
      <label class="qt-radio"><input v-model="type" type="radio" value="all" />All eclipses</label>
    </div>

    <fieldset class="qt-groupbox">
      <legend>Search range</legend>
      <div class="qt-form-row" style="--qt-form-label-width: 44px">
        <span class="qt-label">Start</span>
        <input v-model.number="startYear" type="number" class="qt-input" min="-4000" max="4000" />
      </div>
      <div class="qt-form-row" style="--qt-form-label-width: 44px">
        <span class="qt-label">End</span>
        <input v-model.number="endYear" type="number" class="qt-input" min="-4000" max="4000" />
      </div>
      <div class="qt-form-row" style="--qt-form-label-width: 44px">
        <span class="qt-label">Body</span>
        <select v-model="targetBody" class="qt-select">
          <option v-for="body in bodies" :key="body" :value="body">{{ body }}</option>
        </select>
      </div>
    </fieldset>

    <div class="qt-hbox" style="padding: 0 6px">
      <button class="qt-button" :disabled="searching" @click="findEclipses">
        {{ searching ? 'Searching...' : 'Find eclipses' }}
      </button>
      <span v-if="searching" class="qt-muted">{{ Math.round(progress * 100) }}%</span>
    </div>

    <div v-if="error" class="qt-muted" style="padding: 0 6px; color: #a33">{{ error }}</div>

    <div style="flex: 1 1 auto; overflow: auto; margin: 6px; border: 1px solid var(--qt-border-light)">
      <table class="qt-table">
        <thead>
          <tr>
            <th style="width: 24%">Eclipsed body</th>
            <th style="width: 24%">Occulter</th>
            <th style="width: 36%">Start time</th>
            <th style="width: 16%">Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(record, index) in results.slice(0, 2000)"
            :key="`${record.startTime}-${index}`"
            :class="{ selected: selectedRow === index }"
            @click="selectedRow = index"
            @dblclick="setTimeToMidEclipse(record)"
          >
            <td>{{ record.receiver }}</td>
            <td>{{ record.occulter }}</td>
            <td>{{ formatLocal(record.startTime) }}</td>
            <td class="numeric">{{ formatDuration(record) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="results.length > 0" class="qt-hbox" style="padding: 0 6px 6px">
      <button class="qt-button" :disabled="selectedRow === null" @click="selectedRow !== null && setTimeToMidEclipse(results[selectedRow])">
        Set time to mid-eclipse
      </button>
      <button class="qt-button" :disabled="selectedRow === null" @click="selectedRow !== null && viewNearEclipsed(results[selectedRow])">
        Near eclipse
      </button>
      <span class="qt-muted">{{ results.length }} events</span>
    </div>
  </div>
</template>
