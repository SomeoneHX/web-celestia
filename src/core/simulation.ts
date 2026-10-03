// Simulation state, mirroring engine::Simulation and the parts of
// CelestiaCore that the Qt shell drives: render flags, label modes, the orbit
// mask, the current selection and the time control.
//
// RenderFlags is a 64 bit flag set in Celestia (the highest flag is bit 34), so
// it is held as a BigInt here rather than being truncated by JavaScript's 32 bit
// bitwise operators.

import { TimeControl } from './timecontrol';
import { Selection } from './selection';
import type { Universe } from './universe';
import { BodyClassification, type Body } from './body';

// Bit positions copied from src/celengine/renderflags.h.
export const RenderFlags = {
  ShowNothing: 0n,
  ShowStars: 1n << 0n,
  ShowPlanets: 1n << 1n,
  ShowGalaxies: 1n << 2n,
  ShowDiagrams: 1n << 3n,
  ShowCloudMaps: 1n << 4n,
  ShowOrbits: 1n << 5n,
  ShowCelestialSphere: 1n << 6n,
  ShowNightMaps: 1n << 7n,
  ShowAtmospheres: 1n << 8n,
  ShowSmoothLines: 1n << 9n,
  ShowEclipseShadows: 1n << 10n,
  ShowStarsAsPoints: 1n << 11n,
  ShowRingShadows: 1n << 12n,
  ShowBoundaries: 1n << 13n,
  ShowAutoMag: 1n << 14n,
  ShowCometTails: 1n << 15n,
  ShowMarkers: 1n << 16n,
  ShowPartialTrajectories: 1n << 17n,
  ShowNebulae: 1n << 18n,
  ShowOpenClusters: 1n << 19n,
  ShowGlobulars: 1n << 20n,
  ShowCloudShadows: 1n << 21n,
  ShowGalacticGrid: 1n << 22n,
  ShowEclipticGrid: 1n << 23n,
  ShowHorizonGrid: 1n << 24n,
  ShowEcliptic: 1n << 25n,
  ShowDwarfPlanets: 1n << 27n,
  ShowMoons: 1n << 28n,
  ShowMinorMoons: 1n << 29n,
  ShowAsteroids: 1n << 30n,
  ShowComets: 1n << 31n,
  ShowSpacecrafts: 1n << 32n,
  ShowFadingOrbits: 1n << 33n,
  ShowPlanetRings: 1n << 34n,
} as const;

export const ShowSolarSystemObjects =
  RenderFlags.ShowPlanets |
  RenderFlags.ShowDwarfPlanets |
  RenderFlags.ShowMoons |
  RenderFlags.ShowMinorMoons |
  RenderFlags.ShowAsteroids |
  RenderFlags.ShowComets |
  RenderFlags.ShowSpacecrafts;

export const ShowDeepSpaceObjects =
  RenderFlags.ShowGalaxies | RenderFlags.ShowGlobulars | RenderFlags.ShowNebulae | RenderFlags.ShowOpenClusters;

export const DefaultRenderFlags =
  RenderFlags.ShowStars |
  ShowSolarSystemObjects |
  RenderFlags.ShowPlanetRings |
  ShowDeepSpaceObjects |
  RenderFlags.ShowCloudMaps |
  RenderFlags.ShowNightMaps |
  RenderFlags.ShowAtmospheres |
  RenderFlags.ShowEclipseShadows |
  RenderFlags.ShowRingShadows |
  RenderFlags.ShowCloudShadows |
  RenderFlags.ShowCometTails |
  RenderFlags.ShowAutoMag |
  RenderFlags.ShowFadingOrbits |
  RenderFlags.ShowSmoothLines;

// Bit positions copied from the RenderLabels enum.
export const RenderLabels = {
  NoLabels: 0,
  StarLabels: 0x001,
  PlanetLabels: 0x002,
  MoonLabels: 0x004,
  ConstellationLabels: 0x008,
  GalaxyLabels: 0x010,
  AsteroidLabels: 0x020,
  SpacecraftLabels: 0x040,
  LocationLabels: 0x080,
  CometLabels: 0x100,
  NebulaLabels: 0x200,
  OpenClusterLabels: 0x400,
  I18nConstellationLabels: 0x800,
  DwarfPlanetLabels: 0x1000,
  MinorMoonLabels: 0x2000,
  GlobularLabels: 0x4000,
} as const;

export const DefaultLabelMode =
  RenderLabels.StarLabels |
  RenderLabels.PlanetLabels |
  RenderLabels.MoonLabels |
  RenderLabels.ConstellationLabels |
  RenderLabels.GalaxyLabels |
  RenderLabels.NebulaLabels |
  RenderLabels.OpenClusterLabels |
  RenderLabels.GlobularLabels |
  RenderLabels.I18nConstellationLabels |
  RenderLabels.DwarfPlanetLabels |
  RenderLabels.MinorMoonLabels |
  RenderLabels.AsteroidLabels |
  RenderLabels.CometLabels;

export enum StarStyle {
  FuzzyPointStars = 0,
  PointStars = 1,
  ScaledDiscStars = 2,
  PointSpreadFunction = 3,
}

export enum TextureResolution {
  Low = 0,
  Medium = 1,
  High = 2,
}

export enum MeasurementSystem {
  Metric = 0,
  Imperial = 1,
}

export enum TimeZoneBias {
  UniversalTime = 0,
}

export enum DateFormat {
  Locale = 0,
  TimeZoneName = 1,
  UTCOffset = 2,
  ISO8601 = 3,
}

export enum HudDetail {
  None = 0,
  Terse = 1,
  Verbose = 2,
}

export interface HorizonReference {
  enabled: boolean;
}

export class Simulation {
  readonly universe: Universe;
  readonly timeControl = new TimeControl();
  readonly selection = new Selection();

  renderFlags: bigint = DefaultRenderFlags;
  labelMode: number = DefaultLabelMode;
  orbitMask: number = 0x3ff;

  starStyle: StarStyle = StarStyle.PointSpreadFunction;
  resolution: TextureResolution = TextureResolution.Medium;
  measurementSystem: MeasurementSystem = MeasurementSystem.Metric;

  faintestVisible = 6.5;
  autoMag = true;
  faintestAutoMag45Deg = 8.5;
  starExposure = 1.0;

  ambientLightLevel = 0.0;
  tintSaturation = 1.0;
  minimumFeatureSize = 100;
  atmosphereSegmentCount = 4;
  cloudSegmentCount = 4;
  separateRayleighMieScaleHeights = false;

  starPointRadius = 1.5;
  starOptimization = 0.1;
  starMaxIrradiance = 100.0;
  starDimClipFactor = 10.0;

  toneMappingMode = 0;
  toneMappingExposure = 1.0;
  sRGBEnabled = true;
  vsync = true;
  fps = 60;

  hudDetail: HudDetail = HudDetail.Terse;
  timeZoneBias = 0;
  dateFormat: DateFormat = DateFormat.Locale;
  showFPSCounter = false;
  lightDelayActive = false;
  altAzimuthMode = false;
  displayedSurface = '';
  i18nConstellationLabels = true;

  constructor(universe: Universe) {
    this.universe = universe;
  }

  // ------------------------------------------------------------ render flags

  setRenderFlags(flags: bigint): void {
    this.renderFlags = flags;
  }

  getRenderFlags(): bigint {
    return this.renderFlags;
  }

  toggledRenderFlags(): bigint {
    return this.renderFlags;
  }

  setShowStars(v: boolean): void {
    this.renderFlags = v ? this.renderFlags | RenderFlags.ShowStars : this.renderFlags & ~RenderFlags.ShowStars;
  }

  // ------------------------------------------------------------ label modes

  setLabelMode(mode: number): void {
    this.labelMode = mode;
  }

  getLabelMode(): number {
    return this.labelMode;
  }

  setOrbitMask(mask: number): void {
    this.orbitMask = mask;
  }

  getOrbitMask(): number {
    return this.orbitMask;
  }

  /**
   * Whether an orbit of the given classification is currently drawn, applying
   * the same mask test Celestia uses in Renderer::shouldShowOrbit.
   */
  shouldShowOrbit(classification: BodyClassification): boolean {
    if ((this.renderFlags & RenderFlags.ShowOrbits) === 0n) return false;
    return (this.orbitMask & classification) !== 0;
  }

  shouldShowBody(classification: BodyClassification): boolean {
    const f = this.renderFlags;
    if (classification & BodyClassification.Planet) return (f & RenderFlags.ShowPlanets) !== 0n;
    if (classification & BodyClassification.DwarfPlanet) return (f & RenderFlags.ShowDwarfPlanets) !== 0n;
    if (classification & BodyClassification.Moon) return (f & RenderFlags.ShowMoons) !== 0n;
    if (classification & BodyClassification.MinorMoon) return (f & RenderFlags.ShowMinorMoons) !== 0n;
    if (classification & BodyClassification.Asteroid) return (f & RenderFlags.ShowAsteroids) !== 0n;
    if (classification & BodyClassification.Comet) return (f & RenderFlags.ShowComets) !== 0n;
    if (classification & BodyClassification.Spacecraft) return (f & RenderFlags.ShowSpacecrafts) !== 0n;
    return true;
  }

  shouldShowLabel(classification: BodyClassification): boolean {
    const m = this.labelMode;
    if (classification & BodyClassification.Planet) return (m & RenderLabels.PlanetLabels) !== 0;
    if (classification & BodyClassification.DwarfPlanet) return (m & RenderLabels.DwarfPlanetLabels) !== 0;
    if (classification & BodyClassification.Moon) return (m & RenderLabels.MoonLabels) !== 0;
    if (classification & BodyClassification.MinorMoon) return (m & RenderLabels.MinorMoonLabels) !== 0;
    if (classification & BodyClassification.Asteroid) return (m & RenderLabels.AsteroidLabels) !== 0;
    if (classification & BodyClassification.Comet) return (m & RenderLabels.CometLabels) !== 0;
    if (classification & BodyClassification.Spacecraft) return (m & RenderLabels.SpacecraftLabels) !== 0;
    return false;
  }

  // -------------------------------------------------------------- selection

  setSelection(selection: Selection): void {
    this.selection.body = selection.body;
    this.selection.star = selection.star;
    this.selection.deepsky = selection.deepsky;
    this.selection.location = selection.location;
  }

  getSelection(): Selection {
    return this.selection;
  }

  clearSelection(): void {
    this.selection.body = null;
    this.selection.star = null;
    this.selection.deepsky = null;
    this.selection.location = null;
  }

  selectBody(body: Body): void {
    this.clearSelection();
    this.selection.body = body;
  }

  // ------------------------------------------------------------ limiting mag

  /**
   * Effective limiting magnitude, mirroring the branch structure of
   * CelestiaActions::slotAdjustLimitingMagnitude.
   */
  getFaintestVisible(): number {
    if (this.starStyle === StarStyle.PointSpreadFunction && !this.autoMag) {
      return 6.5;
    }
    if (this.autoMag) return this.faintestAutoMag45Deg;
    return this.faintestVisible;
  }

  setFaintest(mag: number): void {
    this.autoMag = false;
    this.faintestVisible = mag;
  }

  setFaintestAutoMag(mag: number): void {
    this.autoMag = true;
    this.faintestAutoMag45Deg = mag;
  }

  setFaintestAM45deg(mag: number): void {
    this.faintestAutoMag45Deg = mag;
  }

  // ------------------------------------------------------------------ time

  getTime(): number {
    return this.timeControl.getTime();
  }

  setTime(tdb: number): void {
    this.timeControl.setTime(tdb);
  }

  getTimeScale(): number {
    return this.timeControl.getTimeScale();
  }

  setTimeScale(scale: number): void {
    this.timeControl.setTimeScale(scale);
  }

  getPauseState(): boolean {
    return this.timeControl.getPauseState();
  }

  setPauseState(paused: boolean): void {
    this.timeControl.setPauseState(paused);
  }

  tick(dt: number): void {
    this.timeControl.tick(dt);
  }

  // ------------------------------------------------------- display surfaces

  setDisplayedSurface(surface: string): void {
    this.displayedSurface = surface;
  }

  getDisplayedSurface(): string {
    return this.displayedSurface;
  }

  /** Named alternate surfaces a body provides; procedural textures expose none. */
  getAlternateSurfaceNames(_body: Body): string[] {
    return [];
  }
}
