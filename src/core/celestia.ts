// Celestia's own enumerations, from the engine's headers.
//
// These are values the shell passes straight to the engine or reads back from
// it, so they have to be Celestia's bit for bit. They live here rather than
// inside the engine modules because the user interface needs them whatever the
// engine's classes look like, and because a second copy that drifts is how the
// body classifications came to name the wrong thing.
//
// RenderFlags is a 64 bit set in Celestia (the highest flag is bit 34) and the
// location feature types run past 32 bits, so both are BigInt here: JavaScript's
// bitwise operators would truncate them.

// ---------------------------------------------------------------- renderflags
// src/celengine/renderflags.h
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

// ---------------------------------------------------------------- renderlabels
// src/celengine/renderflags.h
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

// --------------------------------------------------------------- renderer enums
/** src/celengine/render.h */
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

export enum ToneMappingMode {
  None = 0,
  ManualExposure = 1,
}

/** src/celestia/celestiacore.h, which holds these two. */
export enum HudDetail {
  None = 0,
  Terse = 1,
  Verbose = 2,
}

/** src/celastro/date.h, astro::Date::Format. */
export enum DateFormat {
  Locale = 0,
  TimeZoneName = 1,
  UTCOffset = 2,
  ISO8601 = 3,
}

// -------------------------------------------------------- body classification
/**
 * src/celengine/body.h. Display switches on the whole value rather than testing
 * bits, so a body with combined flags reads as Unknown.
 */
export enum BodyClassification {
  EmptyMask = 0,
  Planet = 0x01,
  Moon = 0x02,
  Asteroid = 0x04,
  Comet = 0x08,
  Spacecraft = 0x10,
  Invisible = 0x20,
  Barycenter = 0x40,
  SmallBody = 0x80,
  DwarfPlanet = 0x100,
  Stellar = 0x200,
  SurfaceFeature = 0x400,
  Component = 0x800,
  MinorMoon = 0x1000,
  Diffuse = 0x2000,
  Unknown = 0x10000,
}

/**
 * objectTypeName from qtsolarsystembrowser.cpp: the Type column of the solar
 * system browser. A star is a Star, or a Barycenter when it is not visible.
 */
export function classificationName(c: number, isStar = false, visible = true): string {
  if (isStar) return visible ? 'Star' : 'Barycenter';

  switch (c) {
    case BodyClassification.Planet: return 'Planet';
    case BodyClassification.DwarfPlanet: return 'Dwarf planet';
    case BodyClassification.Moon: return 'Moon';
    case BodyClassification.MinorMoon: return 'Minor moon';
    case BodyClassification.Asteroid: return 'Asteroid';
    case BodyClassification.Comet: return 'Comet';
    case BodyClassification.Spacecraft: return 'Spacecraft';
    case BodyClassification.Invisible: return 'Reference point';
    case BodyClassification.Component: return 'Component';
    case BodyClassification.SurfaceFeature: return 'Surface feature';
    default: return 'Unknown';
  }
}

/**
 * classificationName from qtsolarsystembrowser.cpp, the headings used when the
 * tree is grouped by class.
 */
export function groupClassName(c: BodyClassification): string {
  switch (c) {
    case BodyClassification.Planet: return 'Planets';
    case BodyClassification.Moon: return 'Moons';
    case BodyClassification.Spacecraft: return 'Spacecraft';
    case BodyClassification.Asteroid: return 'Asteroids & comets';
    case BodyClassification.Invisible: return 'Reference points';
    case BodyClassification.MinorMoon: return 'Minor moons';
    case BodyClassification.Component: return 'Components';
    case BodyClassification.SurfaceFeature: return 'Surface features';
    default: return 'Other objects';
  }
}

// -------------------------------------------------------------- marker symbols
/** MarkerRepresentation::Symbol from src/celengine/marker.h. */
export enum MarkerSymbol {
  Diamond = 0,
  Triangle = 1,
  Square = 2,
  FilledSquare = 3,
  Plus = 4,
  X = 5,
  LeftArrow = 6,
  RightArrow = 7,
  UpArrow = 8,
  DownArrow = 9,
  Circle = 10,
  Disk = 11,
  Crosshair = 12,
}

export const MARKER_SYMBOLS: MarkerSymbol[] = [
  MarkerSymbol.Diamond,
  MarkerSymbol.Triangle,
  MarkerSymbol.Square,
  MarkerSymbol.FilledSquare,
  MarkerSymbol.Plus,
  MarkerSymbol.X,
  MarkerSymbol.LeftArrow,
  MarkerSymbol.RightArrow,
  MarkerSymbol.UpArrow,
  MarkerSymbol.DownArrow,
  MarkerSymbol.Circle,
  MarkerSymbol.Disk,
  MarkerSymbol.Crosshair,
];

/** The names populateMarkerSymbolComboBox and the selection menu's addSymbol use. */
export const MARKER_SYMBOL_NAMES: Record<MarkerSymbol, string> = {
  [MarkerSymbol.Diamond]: 'Diamond',
  [MarkerSymbol.Triangle]: 'Triangle',
  [MarkerSymbol.Square]: 'Square',
  [MarkerSymbol.FilledSquare]: 'Filled Square',
  [MarkerSymbol.Plus]: 'Plus',
  [MarkerSymbol.X]: 'X',
  [MarkerSymbol.LeftArrow]: 'Left Arrow',
  [MarkerSymbol.RightArrow]: 'Right Arrow',
  [MarkerSymbol.UpArrow]: 'Up Arrow',
  [MarkerSymbol.DownArrow]: 'Down Arrow',
  [MarkerSymbol.Circle]: 'Circle',
  [MarkerSymbol.Disk]: 'Disk',
  [MarkerSymbol.Crosshair]: 'Crosshair',
};

// ------------------------------------------------------------ location features
/** Location::FeatureType from src/celengine/location.h. */
export const LocationType = {
  City: 0x1n,
  Observatory: 0x2n,
  LandingSite: 0x4n,
  Crater: 0x8n,
  Vallis: 0x10n,
  Mons: 0x20n,
  Planum: 0x40n,
  Chasma: 0x80n,
  Patera: 0x100n,
  Mare: 0x200n,
  Rupes: 0x400n,
  Tessera: 0x800n,
  Regio: 0x1000n,
  Chaos: 0x2000n,
  Terra: 0x4000n,
  Astrum: 0x8000n,
  Corona: 0x10000n,
  Dorsum: 0x20000n,
  Fossa: 0x40000n,
  Catena: 0x80000n,
  Mensa: 0x100000n,
  Rima: 0x200000n,
  Undae: 0x400000n,
  Tholus: 0x800000n,
  Reticulum: 0x1000000n,
  Planitia: 0x2000000n,
  Linea: 0x4000000n,
  Fluctus: 0x8000000n,
  Farrum: 0x10000000n,
  EruptiveCenter: 0x20000000n,
  Insula: 0x40000000n,
  Albedo: 0x80000000n,
  Arcus: 0x100000000n,
  Cavus: 0x200000000n,
  Colles: 0x400000000n,
  Facula: 0x800000000n,
  Flexus: 0x1000000000n,
  Flumen: 0x2000000000n,
  Fretum: 0x4000000000n,
  Labes: 0x8000000000n,
  Labyrinthus: 0x10000000000n,
  Lacuna: 0x20000000000n,
  Lacus: 0x40000000000n,
  LargeRinged: 0x80000000000n,
  Lingula: 0x200000000000n,
  Lobus: 0x100000000000n,
  Macula: 0x400000000000n,
  Oceanus: 0x800000000000n,
  Palus: 0x1000000000000n,
  Plume: 0x2000000000000n,
  Promontorium: 0x4000000000000n,
  Satellite: 0x8000000000000n,
  Scopulus: 0x10000000000000n,
  Serpens: 0x20000000000000n,
  Sinus: 0x40000000000000n,
  Sulcus: 0x80000000000000n,
  Vastitas: 0x100000000000000n,
  Virga: 0x200000000000000n,
  Saxum: 0x400000000000000n,
  Collum: 0x800000000000000n,
  Cosmodrome: 0x1000000000000000n,
  Ring: 0x2000000000000000n,
  Other: 0x8000000000000000n,
} as const;

export type LocationType = (typeof LocationType)[keyof typeof LocationType];

/** The categories qtpreferencesdialog.cpp offers, with Celestia's values. */
export const LOCATION_TYPE_NAMES: Array<[bigint, string]> = [
  [LocationType.City, 'Cities'],
  [LocationType.Observatory, 'Observatories'],
  [LocationType.LandingSite, 'Landing sites'],
  [LocationType.Crater, 'Craters'],
  [LocationType.Vallis, 'Valles (valleys)'],
  [LocationType.Mons, 'Montes (mountains)'],
  [LocationType.Terra, 'Terrae (land masses)'],
  [LocationType.Mare, 'Maria (seas)'],
  [LocationType.EruptiveCenter, 'Volcanoes'],
  [LocationType.Other, 'Other'],
];
