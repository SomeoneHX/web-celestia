<script setup lang="ts">
// The Event Finder dock, ported from qteventfinder.cpp.
//
// Qt runs Celestia's own EclipseFinder over the selected body and lists what it
// returns. The shell used to approximate that with its own synodic-month
// geometry, which is not what the engine computes, so the search now goes to the
// engine and the shell only formats and acts on the result.

import { ref } from 'vue';
import { showMessage, t, ui, viewport } from '@/store/app';
import { formatLocal } from '@/core/objectInfo';

type EclipseType = 'solar' | 'lunar' | 'all';

interface EclipseRecord {
  receiver: string;
  occulter: string;
  receiverPath: string;
  startTime: number;
  endTime: number;
}

/** Eclipse::Type in celestia/eclipsefinder.h. */
const ECLIPSE_SOLAR = 1;
const ECLIPSE_LUNAR = 2;

const type = ref<EclipseType>('solar');
const startYear = ref(new Date().getUTCFullYear() - 1);
const endYear = ref(new Date().getUTCFullYear() + 1);
const targetBody = ref('Earth');
const searching = ref(false);
const error = ref('');
const results = ref<EclipseRecord[]>([]);
const selectedRow = ref<number | null>(null);

const bodies = ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

/** The calendar year as a Julian date, the way qteventfinder.cpp's dates are. */
function yearToJD(year: number): number {
  return 2451544.5 + (year - 2000) * 365.25;
}

function findEclipses(): void {
  results.value = [];
  selectedRow.value = null;
  error.value = '';

  const view = viewport();
  if (view === null) return;

  const startJD = yearToJD(startYear.value);
  const endJD = yearToJD(endYear.value);
  if (startJD >= endJD) {
    error.value = 'End date is earlier than start date.';
    return;
  }

  const mask = type.value === 'solar' ? ECLIPSE_SOLAR
    : type.value === 'lunar' ? ECLIPSE_LUNAR
    : ECLIPSE_SOLAR | ECLIPSE_LUNAR;

  searching.value = true;
  try {
    // Celestia's finder searches for eclipses of the body as seen from it, so
    // the path is the target body's own.
    results.value = view.engine.findEclipses(`Sol/${targetBody.value}`, startJD, endJD, mask)
      .map((eclipse) => ({
        receiver: eclipse.receiver,
        occulter: eclipse.occulter,
        receiverPath: eclipse.receiverPath,
        startTime: eclipse.startTime,
        endTime: eclipse.endTime,
      }));
  } finally {
    searching.value = false;
  }

  showMessage(`${results.value.length} eclipse(s) found`, 2);
}

function setTimeToMidEclipse(record: EclipseRecord): void {
  viewport()?.engine.setTime((record.startTime + record.endTime) / 2);
  showMessage('Simulation time set to mid eclipse', 2);
}

function viewNearEclipsed(record: EclipseRecord): void {
  const view = viewport();
  if (view === null || !record.receiverPath) return;

  // Select the eclipsed body in the engine and let its own Goto key place the
  // observer, which is what the Qt dialog's follow action does.
  view.engine.setTime((record.startTime + record.endTime) / 2);
  view.engine.selectObject(record.receiverPath);
  view.engine.charEntered('g', 0);
  showMessage(`Viewing the eclipse from near ${record.receiver}`, 3);
}

function formatDuration(record: EclipseRecord): string {
  const minutes = Math.round((record.endTime - record.startTime) * 24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
</script>

<template>
  <!-- Qt gives the Event Finder a dock of its own, on the left and hidden to
       begin with; this is its frame, and the title is the dock's. -->
  <div class="qt-dock left">
    <div class="qt-dock-title">
      <span>{{ t('Event Finder') }}</span>
      <span class="spacer" />
      <button :title="t('Close')" @click="ui.showEventFinder = false">✕</button>
    </div>
    <div class="qt-dock-body">
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
      </div>
  </div>
</template>
