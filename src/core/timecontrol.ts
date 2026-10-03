// Simulation time, mirroring Simulation::TimeControl.
//
// There is always exactly one time control; it advances the simulation time by
// timeScale seconds of simulated time per second of real time. Positive scales
// run forward, negative run backward, and a pause freezes the clock while
// retaining the configured scale.

import { J2000 } from './math';
import { TDBtoUTC, UTCtoTDB, jdToCalendar } from './astro';

/** Rates below this are treated as stopped, matching TimeControl::MinimumTimeRate. */
export const MINIMUM_TIME_RATE = 1.0e-6;

export class TimeControl {
  /** Current simulation time, TDB Julian date. */
  time = J2000;

  private scale = 1.0;
  private paused = false;

  setTime(tdb: number): void {
    this.time = tdb;
  }

  getTime(): number {
    return this.time;
  }

  setTimeScale(scale: number): void {
    this.scale = scale;
  }

  getTimeScale(): number {
    return this.scale;
  }

  setPauseState(paused: boolean): void {
    this.paused = paused;
  }

  getPauseState(): boolean {
    return this.paused;
  }

  isStopped(): boolean {
    return Math.abs(this.scale) < MINIMUM_TIME_RATE;
  }

  /** Advances the clock. `dt` is elapsed real time in seconds. */
  tick(dt: number): void {
    if (this.paused || this.isStopped()) return;
    this.time += (dt * this.scale) / 86400;
  }

  /** Human readable rate, matching the HUD wording in hud.cpp. */
  getRateDescription(): string {
    if (this.isStopped()) return 'Time stopped';
    if (this.scale === 1.0) return 'Real time';
    if (this.scale === -1.0) return '-Real time';
    if (this.scale > 1.0) return `${formatScale(this.scale)} x faster`;
    return `${formatScale(1.0 / this.scale)} x slower`;
  }

  /** The date shown by the HUD, formatted as Celestia's DateFormatter does. */
  formatDate(local = true, includeTimeZone = false): string {
    const jdUTC = TDBtoUTC(this.time);
    const cal = jdToCalendar(jdUTC);
    const offsetMinutes = local ? -new Date().getTimezoneOffset() : 0;
    const shifted = new Date(Date.UTC(cal.year, cal.month - 1, cal.day, cal.hours, cal.minutes, cal.seconds, cal.milliseconds));
    if (local) shifted.setUTCMinutes(shifted.getUTCMinutes() + offsetMinutes);

    const year = local ? shifted.getUTCFullYear() : cal.year;
    const month = local ? shifted.getUTCMonth() + 1 : cal.month;
    const day = local ? shifted.getUTCDate() : cal.day;
    const hours = String(shifted.getUTCHours()).padStart(2, '0');
    const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
    const seconds = String(shifted.getUTCSeconds()).padStart(2, '0');

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const base = `${String(day).padStart(2, '0')} ${monthNames[month - 1]} ${year} ${hours}:${minutes}:${seconds}`;
    if (!includeTimeZone) return base;

    if (local) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
      return `${base} ${tz}`;
    }
    return `${base} UTC`;
  }

  /** The `dd MMM yyyy hh:mm` form used inside the information browser. */
  formatDateShort(local = true): string {
    const jd = local ? this.time : UTCtoTDB(TDBtoUTC(this.time));
    const cal = jdToCalendar(TDBtoUTC(jd));
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const date = local
      ? new Date(Date.UTC(cal.year, cal.month - 1, cal.day, cal.hours, cal.minutes, cal.seconds))
      : new Date(Date.UTC(cal.year, cal.month - 1, cal.day, cal.hours, cal.minutes, cal.seconds));
    if (local) date.setUTCMinutes(date.getUTCMinutes() - new Date().getTimezoneOffset());
    const y = date.getUTCFullYear();
    const m = monthNames[date.getUTCMonth()];
    const d = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mm = String(date.getUTCMinutes()).padStart(2, '0');
    return `${d} ${m} ${y} ${hh}:${mm}`;
  }
}

function formatScale(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return value.toExponential(4);
  const s = value.toPrecision(6);
  return String(Number(s));
}
