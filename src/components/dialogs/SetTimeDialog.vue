<script setup lang="ts">
// Set Time dialog, ported from qtsettimedialog.cpp.
//
// The Qt dialog is built in code rather than from a .ui file: a time zone combo,
// a three field date row, a three field time row and a Julian date spin box, with
// the date fields and the Julian date kept in sync through two blocking slots.
// The conversion chain is identical: UTC <-> TAI through the leap second table,
// TAI <-> TT through the 32.184 s offset and TT <-> TDB through the periodic term.

import { computed, onMounted, ref, watch } from 'vue';
import { setSimulationTime, showMessage, t, ui, viewport } from '@/store/app';
import { formatLocal } from '@/core/objectInfo';
import {
  calendarToJD, jdToCalendar, isLeapYear, daysInMonth, TDBtoUTC, UTCtoTDB,
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

/** The Julian date branch: spinning the JD field updates the calendar fields. */
watch(julianDate, (value) => {
  if (syncing) return;
  syncing = true;
  const tdb = UTCtoTDB(value);
  const date = jdToCalendar(useLocal.value ? tdb + ui.timeZoneBias / 86400 : TDBtoUTC(tdb));
  year.value = date.year;
  month.value = date.month;
  day.value = date.day;
  hour.value = date.hours;
  minute.value = date.minutes;
  second.value = date.seconds;
  syncing = false;
  clampDay();
});

/** The calendar branch: any date field updates the Julian date field. */
watch([year, month, day, hour, minute, second], () => {
  if (syncing) return;
  syncing = true;
  const jdUtc = calendarToJD(year.value, month.value, day.value, hour.value, minute.value, second.value);
  julianDate.value = useLocal.value ? jdUtc - ui.timeZoneBias / 86400 : jdUtc;
  syncing = false;
  clampDay();
});

watch(timeZone, () => {
  loadFromSimulation();
  showMessage(useLocal.value ? 'Local time' : 'Universal Time', 2);
});

function clampDay(): void {
  const limit = daysInMonth(year.value, month.value);
  if (day.value > limit) day.value = limit;
}

function leapYearHint(): string {
  return isLeapYear(year.value) ? 'leap year' : 'common year';
}

function accept(): void {
  const tdb = UTCtoTDB(julianDate.value);
  setSimulationTime(tdb);
  showMessage(`Simulation time set to ${formatLocal(viewport()?.engine.getTime() ?? tdb)}`, 3);
  emit('close');
}

function setNow(): void {
  const now = new Date();
  year.value = now.getUTCFullYear();
  month.value = now.getUTCMonth() + 1;
  day.value = now.getUTCDate();
  hour.value = now.getUTCHours();
  minute.value = now.getUTCMinutes();
  second.value = now.getUTCSeconds();
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
          <span class="ui-label">{{t('Time Zone:')}}</span>
          <select v-model.number="timeZone" class="ui-select" :title="t('Select Time Zone')">
            <option :value="0">{{t('Universal Time')}}</option>
            <option :value="1">{{t('Local Time')}}</option>
          </select>
        </div>

        <div class="ui-form-row" style="--ui-form-label-width: 78px">
          <span class="ui-label">{{t('Date:')}}</span>
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
            <span class="ui-muted" style="font-size: 11px">{{ leapYearHint() }}</span>
          </div>
        </div>

        <div class="ui-form-row" style="--ui-form-label-width: 78px">
          <span class="ui-label">{{t('Time:')}}</span>
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
          <span class="ui-label">{{t('Julian Date:')}}</span>
          <input v-model.number="julianDate" type="number" step="0.000001" class="ui-input" :title="t('Set Julian Date')" />
        </div>

        <div class="ui-hbox" style="margin-top: 10px">
          <button class="ui-button" @click="setNow">{{t('Now')}}</button>
          <button class="ui-button" @click="julianDate = 2451545.0">{{t('J2000.0')}}</button>
          <span class="ui-spacer" />
          <span class="ui-muted" style="font-size: 11px">TDB {{ (viewport()?.engine.getTime() ?? 0).toFixed(5) }}</span>
        </div>
      </div>

      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="emit('close')">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="accept">Ok</button>
      </div>
    </div>
  </div>
</template>
