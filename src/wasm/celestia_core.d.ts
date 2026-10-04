// Declarations for the Emscripten module produced by native/build.sh.
//
// The module is generated code, so this is written by hand. It covers the
// bindings registered in native/bindings.cpp.

/** The reads qtinfopanel.cpp makes for a body's page. Raw engine values. */
export interface BodyInfo {
  name?: string;
  classification: number;
  ellipsoid: boolean;
  radiusKm: number;
  infoUrl: string;
  hasRings: boolean;
  hasAtmosphere: boolean;
  lifespanBegin: number;
  lifespanEnd: number;
  orbitPeriodic: boolean;
  orbitPeriod: number;
  rotationPeriodic: boolean;
  rotationPeriod: number;
}

export interface BodyOrbitState {
  periodic: boolean;
  validBegin: number;
  validEnd: number;
  positionKm: number[];
  velocityKmPerDay: number[];
}

export interface BodyFrames {
  equatorOrientation?: number[];
  bodyFrameOrientation?: number[];
  orbitFrameOrientation?: number[];
}

export interface SelectedObject {
  type: string;
  name: string;
  path: string;
  radiusKm: number;
  positionKm: number[];
}

export interface VectorString {
  push_back(value: string): void;
  size(): number;
  get(index: number): string;
  delete(): void;
}

export interface VectorDouble {
  size(): number;
  get(index: number): number;
  delete(): void;
}

export interface CelestiaEngine {
  // Catalogues
  loadStars(binaryPath: string, namesPath: string, textCatalogs: VectorString): boolean;
  loadStarCatalog(text: string): boolean;
  loadDeepSky(catalogs: VectorString): boolean;
  loadAsterisms(text: string): boolean;
  loadBoundaries(text: string): boolean;
  loadSolarSystem(text: string): boolean;

  // Simulation
  hasSimulation(): boolean;
  getTime(): number;
  setTime(tdb: number): void;
  advanceTime(dt: number): void;
  /** The core owns the time control: tick advances by dt * timeScale unless paused. */
  timeScale(): number;
  setTimeScale(scale: number): void;
  paused(): boolean;
  setPaused(paused: boolean): void;

  // Counts
  starCount(): number;
  solarSystemCount(): number;
  dsoCount(): number;
  asterismCount(): number;

  // Object queries
  objectExists(path: string): boolean;
  objectType(path: string): string;
  objectPositionKm(path: string, tdb: number): VectorDouble;
  objectRadiusKm(path: string): number;

  // Renderer
  initRenderer(canvasSelector: string, width: number, height: number): boolean;
  /**
   * TEMPORARY probe: builds Celestia's own front end core on top of the config
   * the front end mounted, and reports how far it gets.
   */
  probeCelestiaCore(width: number, height: number): string;
  renderFrame(): void;
  resizeRenderer(width: number, height: number): void;
  hasRenderer(): boolean;

  // Camera
  observerPositionLy(): VectorDouble;
  setObserverPositionLy(x: number, y: number, z: number): void;
  observerOrientation(): VectorDouble;
  setObserverOrientation(x: number, y: number, z: number, w: number): void;
  /**
   * What the engine has selected, or null when nothing is. The shell mirrors
   * this so its panels show the object the viewport actually picked.
   */
  selectedObject(): SelectedObject | null;
  /**
   * Points gettext at a catalogue directory holding celestia.mo, which carries
   * the engine's strings and the interface's alike.
   */
  bindTextDomain(directory: string): void;
  /** Translates a message, so the shell's strings come from the same catalogue. */
  translate(message: string): string;
  /** Just the name, for the shell to watch cheaply each frame. */
  selectionName(): string;
  /**
   * Every body the engine loaded, depth first. classification is a bit from
   * celengine/body.h: Planet 1, Moon 2, Asteroid 4, Comet 8, Spacecraft 16,
   * DwarfPlanet 0x100, MinorMoon 0x1000, Stellar 0x200.
   */
  /**
   * The bodies of the solar system the observer is in, depth first from its
   * star, as the Qt solar system browser lists them.
   */
  solarSystemObjects(): Array<{ name: string; path: string; classification: number; radiusKm: number }>;
  /**
   * Celestia's own star browser, the same one qtcelestialbrowser.cpp drives.
   * comparison: 0 nearest, 1 apparent magnitude, 2 absolute magnitude.
   * filter: bits Visible 1, Multiple 2, WithPlanets 4, SpectralType 8.
   * spectralFilter: wildcard pattern, case insensitive; only applied when the
   * SpectralType bit is set.
   */
  searchStars(size: number, comparison: number, filter: number, spectralFilter: string): Array<{
    name: string; distanceLy: number; appMag: number; absMag: number;
    spectralType: string; positionLy: number[];
  }>;
  /**
   * The deep sky catalogue in catalogue order, unnamed entries skipped, the way
   * qtdeepskybrowser.cpp walks it. absoluteMagnitude is -1000 when the
   * catalogue carries none, which is when Celestia leaves App. mag blank.
   */
  deepSkyObjects(): Array<{
    name: string;
    /** The morphological class, shown in the Type column. */
    type: string;
    /** The category the browser filters on: 0 Galaxy, 1 Globular, 2 Nebula, 3 OpenCluster. */
    objType: number;
    absoluteMagnitude: number;
    positionLy: number[];
  }>;

  // The information panel's reads, as qtinfopanel.cpp makes them. Raw engine
  // values: the units, the thresholds that choose them and the text belong to
  // the front end, which is where Qt keeps them.
  bodyInfo(path: string): BodyInfo;
  bodyOrbitState(path: string, t: number): BodyOrbitState;
  bodyFrames(path: string, t: number): BodyFrames;
  /** celutil's ReplaceGreekLetterAbbr, which the star page applies to names. */
  greekName(name: string): string;
  /**
   * Runs a CEL script through Celestia's own interpreter, the one that runs
   * start.cel.
   */
  runScript(path: string): void;
  /** The demo script the config names; empty when it names none. */
  demoScript(): string;
  /**
   * The scripts in a directory, through Celestia's own scanner, which the Qt
   * front end uses for its Scripts menu.
   */
  scanScripts(directory: string, deep: boolean): Array<{ title: string; path: string }>;
  /**
   * Celestia's own eclipse finder, the one qteventfinder.cpp runs, for the body
   * a path names. typeMask: Solar 1, Lunar 2.
   */
  findEclipses(path: string, startDate: number, endDate: number, typeMask: number): Array<{
    occulter: string; occulterPath: string;
    receiver: string; receiverPath: string;
    startTime: number; endTime: number;
  }>;

  /**
   * Markers, which the engine's Universe keeps and its renderer draws. The
   * symbol numbering is Celestia's MarkerRepresentation::Symbol.
   */
  markObject(path: string, symbol: number, size: number,
             red: number, green: number, blue: number, alpha: number, label: string): boolean;
  unmarkObject(path: string): boolean;
  unmarkAll(): void;
  isMarked(path: string): boolean;

  // Display settings. The values are Celestia's own bit patterns and
  // enumerations, which the shell copies verbatim, so they pass straight over.
  setRenderFlags(flags: number): void;
  renderFlags(): number;
  setLabelMode(mode: number): void;
  labelMode(): number;
  setOrbitMask(mask: number): void;
  orbitMask(): number;
  setStarStyle(style: number): void;
  starStyle(): number;
  setFaintestVisible(magnitude: number): void;
  setFaintestAM45deg(magnitude: number): void;
  setAmbientLightLevel(level: number): void;
  setTintSaturation(saturation: number): void;
  setMinimumFeatureSize(size: number): void;
  setAtmosphereSegmentCount(count: number): void;
  setCloudSegmentCount(count: number): void;
  setSeparateRayleighMieScaleHeights(separate: boolean): void;
  setResolution(resolution: number): void;
  setToneMappingMode(mode: number): void;
  setToneMappingExposure(exposure: number): void;
  /** 0 error, 1 warning, 2 info, 3 verbose. */
  setLogLevel(level: number): void;
  /** The renderer information Celestia's own OpenGL Info dialog shows. */
  rendererInfo(): Record<string, string>;
  /**
   * Every display setting the core holds, so the shell can show what is in
   * effect instead of mirroring each write.
   */
  settings(): {
    renderFlags: number; labelMode: number; orbitMask: number; starStyle: number;
    resolution: number; starColorTable: number; faintestAM45deg: number;
    ambientLightLevel: number; tintSaturation: number; minimumFeatureSize: number;
    atmosphereSegmentCount: number; cloudSegmentCount: number;
    separateRayleighMieScaleHeights: boolean; starPointRadius: number;
    starOptimization: number; starMaxIrradiance: number; starDimClipFactor: number;
    starExposure: number; toneMappingMode: number; toneMappingExposure: number;
    hudDetail: number; dateFormat: number; timeZoneBias: number;
    measurementSystem: number; faintestVisible?: number; timeScale?: number; paused?: boolean;
  };
  /** The time zone bias the core's HUD applies, in minutes. */
  timeZoneBias(): number;
  setTimeZoneBias(bias: number): void;
  /** View > HUD Detail, which the core holds: 0 none, 1 terse, 2 verbose. */
  hudDetail(): number;
  setHudDetail(detail: number): void;
  /** The date format the core's HUD uses, celestia::astro::Date::Format. */
  dateFormat(): number;
  setDateFormat(format: number): void;
  /**
   * The location feature types the observer shows, a Location::FeatureType mask.
   * A decimal string, because the mask uses bits past what a number can hold.
   */
  locationFilter(): string;
  setLocationFilter(mask: string): void;
  /** The alternate surface the observer displays, or empty for the base one. */
  displayedSurface(): string;
  setDisplayedSurface(surface: string): void;
  /** Time > Light Delay, which the core holds. */
  lightDelayActive(): boolean;
  setLightDelayActive(active: boolean): void;
  /** A transient message, drawn by the HUD as Celestia's own front ends do. */
  flash(message: string, duration: number): void;
  /** How wide the core's own text layout thinks a string is, in pixels. */
  getTextWidth(text: string): number;
  /** Celestia's native field of view, in radians. */
  observerFov(): number;
  /** Sets Celestia's native field of view, in radians. */
  setObserverFov(fov: number): void;
  /** The observer's speed and travel state, the pair the HUD shows. */
  observerMotion(): { speedKmS: number; travelling: boolean };

  /**
   * Raw pointer events, forwarded straight to CelestiaCore. It owns the click
   * semantics: picking with its own four pixel tolerance, centring on a repeat
   * click, the modifier branches of a drag, and the dolly on the wheel. Button
   * and modifier bits are CelestiaCore's own: Left 1, Middle 2, Right 4,
   * Shift 8, Control 16.
   */
  mouseButtonDown(x: number, y: number, button: number): void;
  mouseButtonUp(x: number, y: number, button: number): void;
  /** Deltas in drawable pixels, as the Qt drag handler sends them. */
  mouseMoveBy(dx: number, dy: number, buttons: number): void;
  /** One wheel notch is a motion of plus or minus one. */
  mouseWheel(motion: number, modifiers: number): void;
  /** The context menu the engine asked for, or null. Reading it consumes it. */
  takeContextMenuRequest(): { x: number; y: number; selection: SelectedObject | null } | null;
  /**
   * Selects the object the last context menu was for. A right click picks but
   * does not select, so each popup action sets the selection first, as the Qt
   * popup's slots do.
   */
  selectContextMenuObject(): boolean;
  /**
   * A typed character with CelestiaCore's modifier bits. The core's own
   * charEntered is the whole command set, so the shell forwards keys to it.
   */
  charEntered(text: string, modifiers: number): boolean;
  /** A special key by CelestiaCore's numbering: Left 1, Up 3, Home 5, End 6, ... */
  keyDown(key: number, modifiers: number): void;
  keyUp(key: number, modifiers: number): void;

  selectObject(path: string): boolean;
  gotoObject(path: string, distanceKm: number): boolean;
  /** Travels to a body and stops above a longitude and latitude on it. */
  gotoObjectLongLat(path: string, distanceKm: number, longitudeRad: number, latitudeRad: number): boolean;
  centerSelection(): void;
  followSelection(): void;
  cancelMotion(): void;
}

export interface CelestiaModule {
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string): Uint8Array;
    /**
     * Opens a file and returns its descriptor. Emscripten's libc routes every
     * C++ read through here, so it is where a lazily mounted asset is fetched.
     */
    open(path: string, flags: number | string, mode?: number): number;
    /** The current working directory; the engine resolves assets against it. */
    cwd(): string;
  };
  VectorString: new () => VectorString;
  VectorDouble: new () => VectorDouble;
  CelestiaEngine: new () => CelestiaEngine;
}

export interface CreateModuleOptions {
  canvas?: HTMLCanvasElement;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
}

export default function createModule(options?: CreateModuleOptions): Promise<CelestiaModule>;
