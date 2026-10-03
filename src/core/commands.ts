// Keyboard commands, ported from CelestiaCore::charEntered plus the mouse
// bindings documented in controls.txt.

import type { Simulation } from './simulation';
import { Selection } from './selection';
import type { Observer } from './observer';
import type { Universe } from './universe';
import { KM_PER_AU, degToRad, clamp, vec3, normalize, sub, length } from './math';

export interface CommandHost {
  simulation: Simulation;
  observer: Observer;
  universe: Universe;
  /** Flashes a message on the HUD, as CelestiaCore::flash does. */
  flash(message: string): void;
  /** Rebuilds the information browser for the current selection. */
  refreshInfo(): void;
  /** Emitted when the selection changed so the shell can sync its widgets. */
  onSelectionChanged?(): void;
}

export class CommandController {
  /** Mouse travel state for the current drag. */
  private homeDistance = 0;
  private previousFov = degToRad(45);

  constructor(private readonly host: CommandHost) {}

  private get simulation(): Simulation {
    return this.host.simulation;
  }

  private get observer(): Observer {
    return this.host.observer;
  }

  private get universe(): Universe {
    return this.host.universe;
  }

  /** Handles a character command, returning true when it was consumed. */
  charEntered(ch: string, shift = false, ctrl = false): boolean {
    const key = ch.length === 1 ? ch : ch;

    // The number keys select planets around the nearest star.
    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1;
      const planets = this.universe.bodies.filter((b) => b.parent === this.universe.sol);
      if (index < planets.length) {
        this.selectAndGoto(Selection.forBody(planets[index]));
        return true;
      }
      return false;
    }

    switch (key) {
      case '0':
        this.selectParent();
        return true;
      case 'h':
      case 'H':
        this.selectAndGoto(Selection.forBody(this.universe.sol), false);
        return true;
      case 'c':
      case 'C':
        if (shift) this.observer.centerSelection();
        else {
          this.observer.centerSelection();
          this.host.flash(`Centered ${this.simulation.getSelection().getName()}`);
        }
        return true;
      case 'g':
      case 'G':
        this.gotoSelection(ctrl);
        return true;
      case 'f':
      case 'F':
        if (ctrl) {
          this.simulation.altAzimuthMode = !this.simulation.altAzimuthMode;
          this.host.flash(`Alt-azimuth mode ${this.simulation.altAzimuthMode ? 'on' : 'off'}`);
        } else {
          this.observer.follow();
          this.host.flash(`Following ${this.simulation.getSelection().getName()}`);
        }
        return true;
      case 't':
      case 'T':
        this.trackSelection();
        return true;
      case 'y':
      case 'Y':
        this.observer.syncOrbit();
        this.host.flash(`Syncing orbit with ${this.simulation.getSelection().getName()}`);
        return true;
      case ':':
        this.observer.lock();
        this.host.flash(`Locked on ${this.simulation.getSelection().getName()}`);
        return true;
      case '"':
        this.observer.chase();
        this.host.flash(`Chasing ${this.simulation.getSelection().getName()}`);
        return true;
      case '*':
        this.observer.rotate(Math.PI);
        return true;
      case '+':
      case '=':
        this.setTimeScale(this.simulation.getTimeScale() * 2);
        return true;
      case '-':
        this.setTimeScale(this.simulation.getTimeScale() / 2);
        return true;
      case 'l':
      case 'L':
        this.setTimeScale(this.simulation.getTimeScale() / 10);
        return true;
      case 'k':
      case 'K':
        this.setTimeScale(this.simulation.getTimeScale() * 10);
        return true;
      case ' ':
        this.simulation.setPauseState(!this.simulation.getPauseState());
        return true;
      case 'j':
      case 'J':
        this.setTimeScale(-this.simulation.getTimeScale());
        return true;
      case '[':
        this.adjustLimitingMagnitude(-0.1);
        return true;
      case ']':
        this.adjustLimitingMagnitude(0.1);
        return true;
      case '^':
        this.toggleFlag(0x00040000n, 'Nebulae');
        return true;
      case 'E':
        if (ctrl) this.toggleFlag(0x0000000400n, 'Eclipse shadows');
        return true;
      case 'a':
      case 'A':
        if (ctrl) this.toggleFlag(0x0000000100n, 'Atmospheres');
        return true;
        return false;
      case 'u':
      case 'U':
        this.toggleFlag(0x0000000004n, 'Galaxies');
        return true;
      case 'i':
      case 'I':
        this.toggleFlag(0x0000000010n, 'Clouds');
        return true;
      case '.':
      case '>':
        this.observer.setFov(this.observer.getFov() / 1.2);
        this.host.flash(`FOV: ${this.observer.getFovDegrees().toFixed(2)}°`);
        return true;
      case ',':
      case '<':
        this.observer.setFov(this.observer.getFov() * 1.2);
        this.host.flash(`FOV: ${this.observer.getFovDegrees().toFixed(2)}°`);
        return true;
      case '/':
        this.observer.setFov(this.observer.getFov() < degToRad(22) ? degToRad(45) : degToRad(22));
        this.host.flash(`FOV: ${this.observer.getFovDegrees().toFixed(2)}°`);
        return true;
      case '\\':
        this.zoomByFovStep(-1);
        return true;
      case 'Enter':
      case 'Backspace':
        this.selectParent();
        return true;
      default:
        return false;
    }
  }

  private zoomByFovStep(direction: number): void {
    const factor = direction > 0 ? 1.1 : 1 / 1.1;
    this.observer.setFov(this.observer.getFov() * factor);
  }

  private toggleFlag(flag: bigint, label: string): void {
    const next = this.simulation.getRenderFlags() ^ flag;
    this.simulation.setRenderFlags(next);
    this.host.flash(`${label} ${(next & flag) !== 0n ? 'enabled' : 'disabled'}`);
  }

  private setTimeScale(scale: number): void {
    if (Number.isNaN(scale) || scale === 0) return;
    this.simulation.setTimeScale(scale);
    this.host.flash(this.simulation.timeControl.getRateDescription());
  }

  /** Mirrors CelestiaActions::slotAdjustLimitingMagnitude. */
  private adjustLimitingMagnitude(change: number): void {
    const simulation = this.simulation;
    if (simulation.starStyle === 3 /* PointSpreadFunction */) {
      simulation.starExposure = clamp(simulation.starExposure * (change > 0 ? 1.1 : 1 / 1.1), 0.0001, 1e6);
      this.host.flash(`Star exposure: ${simulation.starExposure.toFixed(3)}`);
      return;
    }
    if (simulation.autoMag) {
      const next = clamp(simulation.faintestAutoMag45Deg + change, 6.0, 12.0);
      simulation.setFaintestAM45deg(next);
      simulation.setFaintestAutoMag(next);
      this.host.flash(`Auto magnitude limit at 45 degrees: ${next.toFixed(2)}`);
      return;
    }
    const next = clamp(simulation.faintestVisible + change * 2, 1.0, 15.0);
    simulation.setFaintest(next);
    this.host.flash(`Magnitude limit: ${next.toFixed(2)}`);
  }

  private selectAndGoto(selection: Selection, doGoto = true): void {
    this.simulation.setSelection(selection);
    this.host.onSelectionChanged?.();
    this.host.refreshInfo();
    if (doGoto) this.gotoSelection(false);
  }

  private selectParent(): void {
    const selection = this.simulation.getSelection();
    if (selection.body?.parent) {
      this.simulation.setSelection(Selection.forBody(selection.body.parent));
      this.host.onSelectionChanged?.();
      this.host.refreshInfo();
    } else if (selection.star) {
      this.simulation.clearSelection();
      this.host.onSelectionChanged?.();
      this.host.refreshInfo();
    }
  }

  /** Goto with the standard framing distance, as CelestiaCore does. */
  gotoSelection(surface: boolean): void {
    const selection = this.simulation.getSelection();
    if (selection.isEmpty) return;
    const radius = Math.max(selection.radius, 1);
    const distance = radius * (surface ? 1.02 : 5.0);
    this.observer.gotoSelection(distance, vec3(0, 0, 1), 1.2);
    this.host.flash(`Going to ${selection.getName()}`);
  }

  centerSelection(): void {
    this.observer.centerSelection();
  }

  /** Track: keep the selection centred while the camera stays put. */
  private trackSelection(): void {
    const selection = this.simulation.getSelection();
    if (selection.isEmpty) return;
    this.observer.setTarget(selection, 'lock');
    this.observer.centerSelection();
    this.host.flash(`Tracking ${selection.getName()}`);
  }

  // ------------------------------------------------------------ mouse input

  /** Left drag: orient the camera in place, orbiting about the camera centre. */
  handleLeftDrag(dx: number, dy: number): void {
    const scale = 0.005 * (this.observer.getFov() / degToRad(45));
    this.observer.rotateLocal(-dx * scale, -dy * scale, 0);
  }

  /** Right drag: orbit the camera about the current centre. */
  handleRightDrag(dx: number, dy: number): void {
    const scale = 0.006 * (this.observer.getFov() / degToRad(45));
    this.observer.orbit(-dx * scale, dy * scale);
  }

  /** Left and right together: roll, or change distance on the vertical axis. */
  handleRollDrag(dx: number): void {
    this.observer.rotateLocal(0, 0, -dx * 0.004);
  }

  handleDistanceDrag(dy: number): void {
    const distance = Math.max(this.observer.getDistanceToSelection(), 1);
    this.observer.changeOrbitDistance(dy * distance * 0.006);
  }

  handleWheel(delta: number): void {
    const factor = Math.exp(-delta * 0.0015);
    this.observer.scaleOrbitDistance(factor);
  }

  handleShiftDrag(dx: number, dy: number): void {
    this.observer.setFov(this.observer.getFov() * (1 + dy * 0.003 + dx * 0.003));
  }

  /** Home and End move along the view direction. */
  moveAlongView(amount: number): void {
    const distance = this.observer.getDistanceToSelection();
    const step = distance > 0 ? distance * amount : KM_PER_AU * amount;
    this.observer.changeOrbitDistance(-step);
  }

  /** Distance used for the "look back" command. */
  lookBack(): void {
    this.observer.rotate(Math.PI);
  }

  resetHomeDistance(): void {
    this.homeDistance = this.observer.getDistanceToSelection();
  }

  getHomeDistance(): number {
    return this.homeDistance;
  }

  togglePreviousFov(): void {
    const current = this.observer.getFov();
    this.observer.setFov(this.previousFov);
    this.previousFov = current;
  }

  /** Reports the travel mode line shown in the bottom right of the HUD. */
  travelDescription(): string {
    const observer = this.observer;
    const selection = this.simulation.getSelection();
    const name = selection.isEmpty ? '' : selection.getName();
    switch (observer.travelMode) {
      case 'goto':
        return name ? `Travelling (${name})` : 'Travelling';
      case 'follow':
        return name ? `Follow ${name}` : 'Travelling';
      case 'syncOrbit':
        return name ? `Sync Orbit ${name}` : 'Travelling';
      case 'lock':
        return name ? `Lock ${name}` : 'Travelling';
      case 'chase':
        return name ? `Chase ${name}` : 'Travelling';
      default:
        return 'Travelling';
    }
  }

  speedDescription(): string {
    const selection = this.simulation.getSelection();
    if (!selection.body) return 'Speed: 0 m/s';
    const tdb = this.simulation.getTime();
    const speed = selection.body.getSpeed(tdb);
    return `Speed: ${formatSpeed(speed)}`;
  }
}

function formatSpeed(kmPerSecond: number): string {
  const abs = Math.abs(kmPerSecond);
  if (abs >= 299792.458 * 0.01) return `${(kmPerSecond / 299792.458).toFixed(4)} c`;
  if (abs >= KM_PER_AU / 86400) return `${(kmPerSecond * 86400) / KM_PER_AU} au/s`;
  if (abs >= 1000) return `${(kmPerSecond / 1000).toFixed(3)} km/s`;
  return `${kmPerSecond.toFixed(2)} m/s`;
}

export { length, sub, normalize };
