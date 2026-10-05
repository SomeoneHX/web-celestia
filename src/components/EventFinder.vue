<script setup lang="ts">
// The Event Finder dock, ported from qteventfinder.cpp.
//
// Qt runs Celestia's own EclipseFinder over the selected body and lists what it
// returns. The shell used to approximate that with its own synodic-month
// geometry, which is not what the engine computes, so the search now goes to the
// engine and the shell only formats and acts on the result.

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { t, ui, viewport } from '@/store/app';
import { calendarToJD, UTCtoTDB } from '@/core/astro';
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
// A two year range centred on today, which is what Qt opens with, kept as dates
// rather than years: its two editors are QDateEdits on "dd MMM yyyy".
const startDate = ref(shiftYears(new Date(), -1));
const endDate = ref(shiftYears(new Date(), 1));
const targetBody = ref('Earth');
const searching = ref(false);
const error = ref('');
const results = ref<EclipseRecord[]>([]);
const selectedRow = ref<number | null>(null);
const menu = ref<{ x: number; y: number; index: number } | null>(null);

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftYears(date: Date, years: number): string {
  const shifted = new Date(date.getTime());
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  return isoDate(shifted);
}

/** QDateToTDB: the date at 00:00 UTC, converted. */
function dateToTDB(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return UTCtoTDB(calendarToJD(year, month, day, 0, 0, 0));
}

const bodies = ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

function findEclipses(): void {
  results.value = [];
  selectedRow.value = null;
  error.value = '';

  const view = viewport();
  if (view === null) return;

  const path = `Sol/${targetBody.value}`;
  if (!view.engine.objectExists(path)) {
    error.value = t('%1 is not a valid object').replace('%1', targetBody.value);
    return;
  }
  if (startDate.value > endDate.value) {
    error.value = t('End date is earlier than start date.');
    return;
  }
  const startJD = dateToTDB(startDate.value);
  const endJD = dateToTDB(endDate.value);

  const mask = type.value === 'solar' ? ECLIPSE_SOLAR
    : type.value === 'lunar' ? ECLIPSE_LUNAR
    : ECLIPSE_SOLAR | ECLIPSE_LUNAR;

  searching.value = true;
  try {
    // Celestia's finder searches for eclipses of the body as seen from it, so
    // the path is the target body's own.
    results.value = view.engine.findEclipses(path, startJD, endJD, mask)
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
}

function setTimeToMidEclipse(record: EclipseRecord): void {
  viewport()?.engine.setTime((record.startTime + record.endTime) / 2);
  closeMenu();
}

function openResultMenu(index: number, event: MouseEvent): void {
  event.preventDefault();
  selectedRow.value = index;
  menu.value = { x: event.clientX, y: event.clientY, index };
}

function closeMenu(): void {
  menu.value = null;
}

function onDocumentPointerDown(event: PointerEvent): void {
  if ((event.target as HTMLElement).closest('.ui-menu')) return;
  closeMenu();
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));

function viewNearEclipsed(record: EclipseRecord): void {
  const view = viewport();
  if (view === null || !record.receiverPath) return;

  // Select the eclipsed body in the engine and let its own Goto key place the
  // observer, which is what the Qt dialog's follow action does.
  view.engine.setTime((record.startTime + record.endTime) / 2);
  view.engine.selectObject(record.receiverPath);
  view.engine.charEntered('g', 0);
  closeMenu();
}

/** Qt titles its "view near" action after the body: "Near %1". */
function nearLabel(record: EclipseRecord | null): string {
  if (record === null) return t('Near %1').replace('%1', '');
  return t('Near %1').replace('%1', record.receiver);
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
  <div class="ui-dock left">
    <div class="ui-dock-title">
      <span>{{ t('Event Finder') }}</span>
      <span class="spacer" />
      <button :title="t('Close')" @click="ui.showEventFinder = false">✕</button>
    </div>
    <div class="ui-dock-body">
      <div class="ui-split">
        <div class="ui-hbox" style="padding: 6px; flex-wrap: wrap">
          <label class="ui-radio"><input v-model="type" type="radio" value="solar" />{{t('Solar eclipses')}}</label>
          <label class="ui-radio"><input v-model="type" type="radio" value="lunar" />{{t('Lunar eclipses')}}</label>
          <label class="ui-radio"><input v-model="type" type="radio" value="all" />{{t('All eclipses')}}</label>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Search range')}}</legend>
          <div class="ui-form-row" style="--ui-form-label-width: 44px">
            <input v-model="startDate" type="date" class="ui-input" />
          </div>
          <div class="ui-form-row" style="--ui-form-label-width: 44px">
            <input v-model="endDate" type="date" class="ui-input" />
          </div>
          <div class="ui-form-row" style="--ui-form-label-width: 44px">
            <select v-model="targetBody" class="ui-select">
              <option v-for="body in bodies" :key="body" :value="body">{{ body }}</option>
            </select>
          </div>
        </fieldset>

        <div class="ui-hbox" style="padding: 0 6px">
          <button class="ui-button" :disabled="searching" @click="findEclipses">
            {{ searching ? t('Finding eclipses...') : t('Find eclipses') }}
          </button>
        </div>

        <div v-if="error" class="ui-muted" style="padding: 0 6px; color: #a33">{{ error }}</div>

        <div style="flex: 1 1 auto; overflow: auto; margin: 6px; border: 1px solid var(--ui-border-light)">
          <table class="ui-table">
            <thead>
              <tr>
                <th style="width: 24%">{{t('Eclipsed body')}}</th>
                <th style="width: 24%">{{t('Occulter')}}</th>
                <th style="width: 36%">{{t('Start time')}}</th>
                <th style="width: 16%">{{t('Duration')}}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(record, index) in results.slice(0, 2000)"
                :key="`${record.startTime}-${index}`"
                :class="{ selected: selectedRow === index }"
                @click="selectedRow = index"
                @contextmenu="openResultMenu(index, $event)"
              >
                <td>{{ record.receiver }}</td>
                <td>{{ record.occulter }}</td>
                <td>{{ formatLocal(record.startTime) }}</td>
                <td class="numeric">{{ formatDuration(record) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
      <div
        v-if="menu"
        class="ui-menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <div class="ui-menu-item" @pointerdown.stop="setTimeToMidEclipse(results[menu.index])">
          <span class="label">{{t('Set time to mid-eclipse')}}</span>
        </div>
        <div class="ui-menu-item" @pointerdown.stop="viewNearEclipsed(results[menu.index])">
          <span class="label">{{ nearLabel(results[menu.index]) }}</span>
        </div>
      </div>
  </Teleport>
</template>
