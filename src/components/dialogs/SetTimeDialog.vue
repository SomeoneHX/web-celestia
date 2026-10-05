<script setup lang="ts">
// Set Time dialog, ported from qtsettimedialog.cpp.
//
// The Qt dialog is built in code rather than from a .ui file: a time zone combo,
// a three field date row, a three field time row and a Julian date spin box, with
// the date fields and the Julian date kept in sync through two blocking slots.
// The conversion chain is identical: UTC <-> TAI through the leap second table,
// TAI <-> TT through the 32.184 s offset and TT <-> TDB through the periodic term.

import { computed, onMounted, ref, watch } from 'vue';
import { setSimulationTime, t, ui, viewport } from '@/store/app';
import {
  calendarToJD, jdToCalendar, daysInMonth, TDBtoUTC, UTCtoTDB,
} from '@/core/astro';

const emit = defineEmits<{ (event: 'close'): void }>();

const timeZone = ref(0);
const year = ref(2000);
const month = ref(1);
const day = ref(1);
const hour = ref(12);
const minute = ref(0);
const second = ref(0);
const julianDate = ref(2451545.0);

/** Guards both directions of the two way binding. */
let syncing = false;

const useLocal = computed(() => timeZone.value === 1);

// The range Qt lets the local time zone apply over: 1970 Jan 1 and 2038 Jan 18,
// the span its own date conversions can represent.
const MIN_LOCAL_TIME = 2440587.5;
const MAX_LOCAL_TIME = 2465442.0;

const zoneEnabled = ref(true);

const maxDay = computed(() => daysInMonth(year.value, month.value));

function loadFromSimulation(): void {
  const tdb = viewport()?.engine.getTime() ?? 0;
  const jdUTC = TDBtoUTC(tdb);
  const date = useLocal.value ? localFromJD(jdUTC) : jdToCalendar(jdUTC);

  syncing = true;
  year.value = date.year;
  month.value = date.month;
  day.value = date.day;
  hour.value = date.hours;
  minute.value = date.minutes;
  second.value = date.seconds;
  julianDate.value = jdUTC;
  syncing = false;
}

function localFromJD(jdUtc: number): ReturnType<typeof jdToCalendar> {
  const calendar = jdToCalendar(jdUtc);
  const date = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day, calendar.hours, calendar.minutes, calendar.seconds));
  date.setUTCMinutes(date.getUTCMinutes() + (-new Date().getTimezoneOffset()));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes(),
    seconds: date.getUTCSeconds(),
    milliseconds: 0,
  };
}

/** The Julian date branch: the calendar fields are read back out of it. */
function syncFromJulianDate(): void {
  syncing = true;
  const tdb = UTCtoTDB(julianDate.value);
  const date = jdToCalendar(useLocal.value ? tdb + ui.timeZoneBias / 86400 : TDBtoUTC(tdb));
  year.value = date.year;
  month.value = date.month;
  day.value = date.day;
  hour.value = date.hours;
  minute.value = date.minutes;
  second.value = date.seconds;
  syncing = false;
  clampDay();
}

watch(julianDate, () => {
  if (!syncing) syncFromJulianDate();
});

/** The calendar branch: any date field updates the Julian date field. */
watch([year, month, day, hour, minute, second], () => {
  if (syncing) return;
  syncing = true;
  const jdUtc = calendarToJD(year.value, month.value, day.value, hour.value, minute.value, second.value);
  julianDate.value = useLocal.value ? jdUtc - ui.timeZoneBias / 86400 : jdUtc;
  syncing = false;
  clampDay();

  // Qt only offers the local zone while the date is inside the range its own
  // time conversions can represent, and puts the combo back to UTC outside it.
  if (jdUtc <= MIN_LOCAL_TIME || jdUtc >= MAX_LOCAL_TIME) {
    if (zoneEnabled.value) {
      timeZone.value = 0;
      zoneEnabled.value = false;
    }
  } else if (!zoneEnabled.value) {
    zoneEnabled.value = true;
  }
});

watch(timeZone, () => {
  // Qt recomputes the bias for the zone it was given -- zero for Universal, the
  // system's own offset for Local -- and then re-reads the calendar fields from
  // the Julian date, which is what was being edited. It does not go back to the
  // simulation for them, and it says nothing.
  const bias = timeZone.value === 0 ? 0 : -new Date().getTimezoneOffset() * 60;
  ui.timeZoneBias = bias;
  viewport()?.engine.setTimeZoneBias(bias);
  syncFromJulianDate();
});

function clampDay(): void {
  const limit = daysInMonth(year.value, month.value);
  if (day.value > limit) day.value = limit;
}

function accept(): void {
  const tdb = UTCtoTDB(julianDate.value);
  setSimulationTime(tdb);
  emit('close');
}

onMounted(loadFromSimulation);
</script>

<template>
  <div class="ui-dialog-backdrop" @pointerdown.self="emit('close')">
    <div class="ui-dialog" style="width: 430px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Set Time')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="emit('close')">✕</button>
      </div>

      <div class="ui-dialog-body">
        <div class="ui-form-row" style="--ui-form-label-width: 78px">
          <span class="ui-label">{{t('Time Zone: ')}}</span>
          <select v-model.number="timeZone" class="ui-select" :disabled="!zoneEnabled" :title="t('Select Time Zone')">
            <option :value="0">{{t('Universal Time')}}</option>
            <option :value="1">{{t('Local Time')}}</option>
          </select>
        </div>

        <div class="ui-form-row" style="--ui-form-label-width: 78px">
          <span class="ui-label">{{t('Date: ')}}</span>
          <div class="ui-hbox">
            <div class="ui-spinbox" style="width: 74px">
              <input v-model.number="year" type="number" :title="t('Set Year')" />
              <div class="buttons"><button @click="year++">▲</button><button @click="year--">▼</button></div>
            </div>
            <div class="ui-spinbox" style="width: 50px">
              <input v-model.number="month" type="number" min="1" max="12" :title="t('Set Month')" />
              <div class="buttons"><button @click="month = month >= 12 ? 1 : month + 1">▲</button><button @click="month = month <= 1 ? 12 : month - 1">▼</button></div>
            </div>
            <div class="ui-spinbox" style="width: 50px">
              <input v-model.number="day" type="number" min="1" :max="maxDay" :title="t('Set Day')" />
              <div class="buttons"><button @click="day = day >= maxDay ? 1 : day + 1">▲</button><button @click="day = day <= 1 ? maxDay : day - 1">▼</button></div>
            </div>
          </div>
        </div>

        <div class="ui-form-row" style="--ui-form-label-width: 78px">
          <span class="ui-label">{{t('Time: ')}}</span>
          <div class="ui-hbox">
            <div class="ui-spinbox" style="width: 54px">
              <input v-model.number="hour" type="number" min="0" max="23" :title="t('Set Hours')" />
              <div class="buttons"><button @click="hour = (hour + 1) % 24">▲</button><button @click="hour = (hour + 23) % 24">▼</button></div>
            </div>
            <span>:</span>
            <div class="ui-spinbox" style="width: 54px">
              <input v-model.number="minute" type="number" min="0" max="59" :title="t('Set Minutes')" />
              <div class="buttons"><button @click="minute = (minute + 1) % 60">▲</button><button @click="minute = (minute + 59) % 60">▼</button></div>
            </div>
            <span>:</span>
            <div class="ui-spinbox" style="width: 54px">
              <input v-model.number="second" type="number" min="0" max="59" :title="t('Set Seconds')" />
              <div class="buttons"><button @click="second = (second + 1) % 60">▲</button><button @click="second = (second + 59) % 60">▼</button></div>
            </div>
          </div>
        </div>

        <div class="ui-form-row" style="--ui-form-label-width: 78px">
          <span class="ui-label">{{t('Julian Date: ')}}</span>
          <input v-model.number="julianDate" type="number" step="0.000001" class="ui-input" :title="t('Set Julian Date')" />
        </div>

      </div>

      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="emit('close')">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="accept">Ok</button>
      </div>
    </div>
  </div>
</template>
