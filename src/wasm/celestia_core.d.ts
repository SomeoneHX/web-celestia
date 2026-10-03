// Declarations for the Emscripten module produced by native/build.sh.
//
// The module is generated code, so this is written by hand. It covers the
// bindings registered in native/bindings.cpp.

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
  start(): void;
  hasSimulation(): boolean;
  getTime(): number;
  setTime(tdb: number): void;
  advanceTime(dt: number): void;

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
  renderFrame(): void;
  resizeRenderer(width: number, height: number): void;
  hasRenderer(): boolean;

  // Camera
  observerPositionLy(): VectorDouble;
  setObserverPositionLy(x: number, y: number, z: number): void;
  observerOrientation(): VectorDouble;
  setObserverOrientation(x: number, y: number, z: number, w: number): void;
  /**
   * Turns the observer for a drag, the way CelestiaCore::mouseMove does for a
   * left drag with no reference object. dx, dy, width and height are all in
   * drawable pixels.
   */
  rotateObserverByDrag(dx: number, dy: number, width: number, height: number): void;
  /** Moves the observer closer to or further from the selection. */
  changeDistance(factor: number): void;
  /**
   * The file a texture name resolves to, or an empty string when it resolves to
   * nothing. Used to check the mounted assets against what a catalogue asks for.
   */
  resolveTexture(name: string): string;
  /** The file a mesh name resolves to, or an empty string. */
  resolveModel(name: string): string;
  /** 0 error, 1 warning, 2 info, 3 verbose. */
  setLogLevel(level: number): void;
  /** Celestia's native field of view, in radians. */
  observerFov(): number;
  /** Sets Celestia's native field of view, in radians. */
  setObserverFov(fov: number): void;
  selectObject(path: string): boolean;
  gotoObject(path: string, distanceKm: number): boolean;
  centerSelection(): void;
  followSelection(): void;
  cancelMotion(): void;
  pickAt(x: number, y: number, width: number, height: number): string;
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
