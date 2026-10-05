<script setup lang="ts">
// Preferences dialog, ported from preferences.ui and qtpreferencesdialog.cpp.
//
// The Qt dialog applies every change immediately: there is no Apply button and
// Ok simply closes. The tab titles are Objects, Guides, Labels, Render and
// Information, in that order, and the controls inside each tab follow the same
// grouping. The Latin names check box is inverted relative to the underlying
// label flag because it turns localisation off.

import { computed, ref } from 'vue';
import {
  applyResolution, applyStarColorTable, applyStarStyle, hasFlag, hasLabel,
  setFlag, setLabel, setOrbitClassification, t, ui, viewport,
} from '@/store/app';
import { RenderFlags, RenderLabels, StarStyle, TextureResolution, HudDetail, DateFormat, BodyClassification, LOCATION_TYPE_NAMES, LocationType } from '@/core/celestia';

import { STAR_COLOR_TABLES, type StarColorTable } from '@/render/starcolor';

const emit = defineEmits<{ (event: 'close'): void }>();

const tabs = [t('Objects'), t('Guides'), t('Labels'), t('Render'), t('Information')];
const activeTab = ref(0);

// ------------------------------------------------------------------ Objects

const objects = [
  { label: t('Stars'), flag: RenderFlags.ShowStars },
  { label: t('Planets'), flag: RenderFlags.ShowPlanets },
  { label: t('Dwarf planets'), flag: RenderFlags.ShowDwarfPlanets },
  { label: t('Moons'), flag: RenderFlags.ShowMoons },
  { label: t('Minor moons'), flag: RenderFlags.ShowMinorMoons },
  { label: t('Asteroids'), flag: RenderFlags.ShowAsteroids },
  { label: t('Comets'), flag: RenderFlags.ShowComets },
  { label: t('Spacecraft'), flag: RenderFlags.ShowSpacecrafts },
  { label: t('Galaxies'), flag: RenderFlags.ShowGalaxies },
  { label: t('Nebulae'), flag: RenderFlags.ShowNebulae },
  { label: t('Open clusters'), flag: RenderFlags.ShowOpenClusters },
  { label: t('Globular clusters'), flag: RenderFlags.ShowGlobulars },
];

const features: Array<{ label: string; flag?: bigint; key?: string }> = [
  { label: t('Atmospheres'), flag: RenderFlags.ShowAtmospheres },
  { label: t('Clouds'), flag: RenderFlags.ShowCloudMaps },
  { label: t('Cloud shadows'), flag: RenderFlags.ShowCloudShadows },
  { label: t('Eclipse shadows'), flag: RenderFlags.ShowEclipseShadows },
  { label: t('Ring shadows'), flag: RenderFlags.ShowRingShadows },
  { label: t("Planet's rings"), flag: RenderFlags.ShowPlanetRings },
  { label: t('Nightside lights'), flag: RenderFlags.ShowNightMaps },
  { label: t('Comet tails'), flag: RenderFlags.ShowCometTails },
  { label: t('Limit of knowledge textures'), key: 'limitOfKnowledge' },
];

function limitOfKnowledge(): boolean {
  return viewport()?.engine.displayedSurface() === 'limit of knowledge';
}

function setLimitOfKnowledge(enabled: boolean): void {
  // Qt sets this on the observer, which is where the engine keeps it.
  viewport()?.engine.setDisplayedSurface(enabled ? 'limit of knowledge' : '');
}

// ------------------------------------------------------------------- Guides

const orbitChecks = [
  { label: t('Show orbits'), flag: RenderFlags.ShowOrbits },
  { label: t('Fading orbits'), flag: RenderFlags.ShowFadingOrbits },
  { label: t('Partial trajectories'), flag: RenderFlags.ShowPartialTrajectories },
];

const orbitClassifications = [
  { label: t('Stars'), value: 0x100 },
  { label: t('Planets'), value: BodyClassification.Planet },
  { label: t('Dwarf planets'), value: BodyClassification.DwarfPlanet },
  { label: t('Moons'), value: BodyClassification.Moon },
  { label: t('Minor moons'), value: BodyClassification.MinorMoon },
  { label: t('Asteroids'), value: BodyClassification.Asteroid },
  { label: t('Comets'), value: BodyClassification.Comet },
  { label: t('Spacecraft'), value: BodyClassification.Spacecraft },
];

const gridChecks = [
  { label: t('Equatorial'), flag: RenderFlags.ShowCelestialSphere },
  { label: t('Ecliptic'), flag: RenderFlags.ShowEclipticGrid },
  { label: t('Galactic'), flag: RenderFlags.ShowGalacticGrid },
  { label: t('Horizontal'), flag: RenderFlags.ShowHorizonGrid },
];

const constellationChecks = [
  { label: t('Diagrams'), flag: RenderFlags.ShowDiagrams },
  { label: t('Boundaries'), flag: RenderFlags.ShowBoundaries },
];

const miscChecks = [
  { label: t('Markers'), flag: RenderFlags.ShowMarkers },
  { label: t('Ecliptic line'), flag: RenderFlags.ShowEcliptic },
];

function latinNamesEnabled(): boolean {
  return !hasLabel(RenderLabels.I18nConstellationLabels);
}

function setLatinNames(enabled: boolean): void {
  setLabel(RenderLabels.I18nConstellationLabels, !enabled);
}

// ------------------------------------------------------------------- Labels

const labelChecks = [
  { label: t('Stars'), flag: RenderLabels.StarLabels },
  { label: t('Planets'), flag: RenderLabels.PlanetLabels },
  { label: t('Dwarf planets'), flag: RenderLabels.DwarfPlanetLabels },
  { label: t('Moons'), flag: RenderLabels.MoonLabels },
  { label: t('Minor moons'), flag: RenderLabels.MinorMoonLabels },
  { label: t('Asteroids'), flag: RenderLabels.AsteroidLabels },
  { label: t('Comets'), flag: RenderLabels.CometLabels },
  { label: t('Spacecraft'), flag: RenderLabels.SpacecraftLabels },
  { label: t('Galaxies'), flag: RenderLabels.GalaxyLabels },
  { label: t('Nebulae'), flag: RenderLabels.NebulaLabels },
  { label: t('Open clusters'), flag: RenderLabels.OpenClusterLabels },
  { label: t('Globular clusters'), flag: RenderLabels.GlobularLabels },
  { label: t('Constellations'), flag: RenderLabels.ConstellationLabels },
];

/** FilterOtherLocations in qtpreferencesdialog.cpp: every feature but the eight. */
const OTHER_LOCATIONS = ~(
  LocationType.City | LocationType.Observatory | LocationType.LandingSite |
  LocationType.Mons | LocationType.Mare | LocationType.Crater |
  LocationType.Vallis | LocationType.Terra | LocationType.EruptiveCenter
) & 0xffffffffffffffffn;

// qtpreferencesdialog.cpp's location check boxes. The last one is everything the
// named eight are not, which is how Qt masks it.
const locationTypes: Array<{ label: string; value: bigint }> = [
  { label: t('Cities'), value: LocationType.City },
  { label: t('Observatories'), value: LocationType.Observatory },
  { label: t('Landing sites'), value: LocationType.LandingSite },
  { label: t('Montes (mountains)'), value: LocationType.Mons },
  { label: t('Maria (seas)'), value: LocationType.Mare },
  { label: t('Craters'), value: LocationType.Crater },
  { label: t('Valles (valleys)'), value: LocationType.Vallis },
  { label: t('Terrae (land masses)'), value: LocationType.Terra },
  { label: t('Volcanoes'), value: LocationType.EruptiveCenter },
  { label: t('Other features'), value: OTHER_LOCATIONS },
];

function currentLocationFilter(): bigint {
  const mask = viewport()?.engine.locationFilter();
  return mask === undefined ? 0n : BigInt(mask);
}

function hasLocationFlag(flag: bigint): boolean {
  const filter = currentLocationFilter();
  return flag === OTHER_LOCATIONS ? (filter & OTHER_LOCATIONS) !== 0n : (filter & flag) !== 0n;
}

function setLocationFlag(flag: bigint, enabled: boolean): void {
  const view = viewport();
  if (view === null) return;
  const current = currentLocationFilter();
  const updated = flag === OTHER_LOCATIONS
    ? (current & ~OTHER_LOCATIONS) | (enabled ? OTHER_LOCATIONS : 0n)
    : (current & ~flag) | (enabled ? flag : 0n);
  view.engine.setLocationFilter((updated & 0xffffffffffffffffn).toString());
}

const featureSize = ref(ui.minimumFeatureSize);
function onFeatureSizeChange(value: number): void {
  featureSize.value = value;
  viewport()?.engine.setMinimumFeatureSize(value);
}

// ------------------------------------------------------------------- Render

const sRGBOptions = ['Use config default', 'Enabled', 'Disabled'];
const toneMappingOptions = ['Off', 'Manual exposure'];

const psfVisible = computed(() => ui.starStyle === StarStyle.PointSpreadFunction);
const tintDisabled = computed(() => ui.starColorTable === 'Enhanced');

const psfFields: Array<{ label: string; key: 'starPointRadius' | 'starOptimization' | 'starMaxIrradiance' | 'starDimClipFactor'; min: number; max: number; step: number; decimals: number; tooltip: string }> = [
  { label: t('Point radius (pt):'), key: 'starPointRadius', min: 1, max: 10, step: 0.5, decimals: 1, tooltip: 'Radius of the unresolved star disc in points. Larger values make every star appear bigger while conserving the flux.\nValid range: 1.0 to 10.0.' },
  { label: t('Bloom compactness:'), key: 'starOptimization', min: 0.05, max: 1, step: 0.05, decimals: 2, tooltip: 'Controls how tightly the eye-PSF bloom is confined around each bright star. Higher values keep the glow compact; lower values let it spread further.\nValid range: 0.05 to 1.0.' },
  { label: t('Max irradiance:'), key: 'starMaxIrradiance', min: 0, max: 1000000, step: 10, decimals: 2, tooltip: 'Soft-clip on per-star irradiance. 0 = disabled.\nValid range: 1.0 to 1.0e6.' },
  { label: t('Dim star clipping:'), key: 'starDimClipFactor', min: 1, max: 100, step: 1, decimals: 1, tooltip: 'Hyperbolic soft-clip on dim stars; higher values cull more dim stars for performance.\nValid range: 1.0 to 100.0.' },
];

const psfExposure = ref(ui.starExposure);

/**
 * Applies a value the dialog edited to the engine that owns it, and keeps the
 * shell's copy in step. Qt's spin boxes do the same as they change.
 */
function setNumeric(key: keyof typeof ui, value: number): void {
  (ui[key] as unknown as number) = value;

  const engine = viewport()?.engine;
  switch (key) {
    case 'atmosphereSegmentCount':
      engine?.setAtmosphereSegmentCount(value);
      break;
    case 'cloudSegmentCount':
      engine?.setCloudSegmentCount(value);
      break;
    case 'starPointRadius':
      engine?.setStarPointRadius(value);
      break;
    case 'starOptimization':
      engine?.setStarOptimization(value);
      break;
    case 'starMaxIrradiance':
      engine?.setStarMaxIrradiance(value);
      break;
    case 'starDimClipFactor':
      engine?.setStarDimClipFactor(value);
      break;
    case 'starExposure':
      engine?.setStarExposure(value);
      break;
    default:
      break;
  }
}

function setAmbient(value: number): void {
  ui.ambientLightLevel = value / 100;
  viewport()?.engine.setAmbientLightLevel(value / 100);
}

function setTint(value: number): void {
  ui.tintSaturation = value / 100;
  viewport()?.engine.setTintSaturation(value / 100);
}

/**
 * The renderer settings Qt applies the moment its control changes. Leaving these
 * on the store alone meant a change only took effect after a reload rebuilt the
 * renderer from the saved settings.
 */
function setSeparateRayleighMieScaleHeights(enabled: boolean): void {
  ui.separateRayleighMieScaleHeights = enabled;
  viewport()?.engine.setSeparateRayleighMieScaleHeights(enabled);
}

function setToneMappingMode(value: number): void {
  ui.toneMappingMode = value;
  viewport()?.engine.setToneMappingMode(value);
}

function setToneMappingExposure(value: number): void {
  ui.toneMappingExposure = value;
  viewport()?.engine.setToneMappingExposure(value);
}

// -------------------------------------------------------------- Information

const timeZoneOptions = ['Universal Time', 'Local Time'];
const dateFormatOptions = ['Local format', 'Time zone name', 'UTC offset', 'ISO 8601'];
const hudDetailOptions: Array<[HudDetail, string]> = [
  [HudDetail.None, 'None'],
  [HudDetail.Terse, 'Terse'],
  [HudDetail.Verbose, 'Verbose'],
];

function setHudDetail(value: number): void {
  ui.hudDetail = value as HudDetail;
  viewport()?.engine.setHudDetail(value);
}

function setDateFormat(value: number): void {
  ui.dateFormat = value as DateFormat;
  viewport()?.engine.setDateFormat(value);
}

function setTimeZone(value: number): void {
  ui.timeZoneBias = value === 0 ? 0 : -new Date().getTimezoneOffset() * 60;
  viewport()?.engine.setTimeZoneBias(ui.timeZoneBias);
}

function close(): void {
  emit('close');
}

const starColorValue = computed({
  get: () => ui.starColorTable,
  set: (value: StarColorTable) => applyStarColorTable(value),
});

const resolutionValue = computed({
  get: () => ui.resolution,
  set: (value: TextureResolution) => applyResolution(value),
});

const starStyleValue = computed({
  get: () => ui.starStyle,
  set: (value: StarStyle) => applyStarStyle(value),
});
</script>

<template>
  <div class="ui-dialog-backdrop" @pointerdown.self="close">
    <div class="ui-dialog" style="width: 560px; height: 600px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Preferences')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="close">✕</button>
      </div>

      <div class="ui-tabbar">
        <div
          v-for="(tab, index) in tabs"
          :key="tab"
          class="ui-tab"
          :class="{ active: activeTab === index }"
          @click="activeTab = index"
        >
          {{ tab }}
        </div>
      </div>

      <div class="ui-dialog-body">
        <!-- ------------------------------------------------- Objects -->
        <div v-if="activeTab === 0" class="ui-columns">
          <fieldset class="ui-groupbox">
            <legend>{{t('Objects')}}</legend>
            <label v-for="item in objects" :key="item.label" class="ui-checkbox">
              <input
                type="checkbox"
                :checked="hasFlag(item.flag)"
                @change="setFlag(item.flag, ($event.target as HTMLInputElement).checked)"
              />
              {{ item.label }}
            </label>
          </fieldset>
          <fieldset class="ui-groupbox">
            <legend>{{t('Features')}}</legend>
            <label v-for="item in features" :key="item.label" class="ui-checkbox">
              <input
                v-if="item.flag"
                type="checkbox"
                :checked="hasFlag(item.flag)"
                @change="setFlag(item.flag!, ($event.target as HTMLInputElement).checked)"
              />
              <input
                v-else
                type="checkbox"
                :checked="limitOfKnowledge()"
                @change="setLimitOfKnowledge(($event.target as HTMLInputElement).checked)"
              />
              {{ item.label }}
            </label>
          </fieldset>
        </div>

        <!-- -------------------------------------------------- Guides -->
        <div v-else-if="activeTab === 1" class="ui-columns">
          <div class="ui-vbox">
            <fieldset class="ui-groupbox">
              <legend>{{t('Orbits')}}</legend>
              <label v-for="item in orbitChecks" :key="item.label" class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="hasFlag(item.flag)"
                  @change="setFlag(item.flag, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }}
              </label>
              <div class="ui-hline" />
              <label v-for="item in orbitClassifications" :key="item.label" class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="(ui.orbitMask & item.value) !== 0"
                  @change="setOrbitClassification(item.value, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }}
              </label>
            </fieldset>
          </div>
          <div class="ui-vbox">
            <fieldset class="ui-groupbox">
              <legend>{{t('Grids')}}</legend>
              <label v-for="item in gridChecks" :key="item.label" class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="hasFlag(item.flag)"
                  @change="setFlag(item.flag, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }}
              </label>
            </fieldset>
            <fieldset class="ui-groupbox">
              <legend>{{t('Constellations')}}</legend>
              <label v-for="item in constellationChecks" :key="item.label" class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="hasFlag(item.flag)"
                  @change="setFlag(item.flag, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }}
              </label>
              <label class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="latinNamesEnabled()"
                  @change="setLatinNames(($event.target as HTMLInputElement).checked)"
                />
                Latin names
              </label>
            </fieldset>
            <fieldset class="ui-groupbox">
              <legend>{{t('Miscellaneous')}}</legend>
              <label v-for="item in miscChecks" :key="item.label" class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="hasFlag(item.flag)"
                  @change="setFlag(item.flag, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }}
              </label>
            </fieldset>
          </div>
        </div>

        <!-- -------------------------------------------------- Labels -->
        <div v-else-if="activeTab === 2" class="ui-columns">
          <fieldset class="ui-groupbox">
            <legend>{{t('Labels')}}</legend>
            <label v-for="item in labelChecks" :key="item.label" class="ui-checkbox">
              <input
                type="checkbox"
                :checked="hasLabel(item.flag)"
                @change="setLabel(item.flag, ($event.target as HTMLInputElement).checked)"
              />
              {{ item.label }}
            </label>
          </fieldset>
          <fieldset class="ui-groupbox">
            <legend>{{t('Locations')}}</legend>
            <div class="ui-label ui-muted" style="font-size: 11px">{{t('Location types:')}}</div>
            <label class="ui-checkbox">
              <input
                type="checkbox"
                :checked="hasLabel(RenderLabels.LocationLabels)"
                @change="setLabel(RenderLabels.LocationLabels, ($event.target as HTMLInputElement).checked)"
              />
              Show locations
            </label>
            <div class="ui-hline" />
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px">
              <label v-for="item in locationTypes" :key="item.label" class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="hasLocationFlag(item.value)"
                  @change="setLocationFlag(item.value, ($event.target as HTMLInputElement).checked)"
                />
                {{ item.label }}
              </label>
            </div>
            <div class="ui-hline" />
            <div class="ui-label">{{t('Minimum labelled feature size:')}}</div>
            <div class="ui-hbox">
              <input
                type="range"
                class="ui-slider"
                min="0"
                max="999"
                :value="featureSize"
                @input="onFeatureSizeChange(Number(($event.target as HTMLInputElement).value))"
              />
              <div class="ui-spinbox" style="width: 68px">
                <input
                  type="number"
                  min="0"
                  max="999"
                  :value="featureSize"
                  @change="onFeatureSizeChange(Number(($event.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </fieldset>
        </div>

        <!-- -------------------------------------------------- Render -->
        <div v-else-if="activeTab === 3" class="ui-columns">
          <div class="ui-vbox">
            <fieldset class="ui-groupbox">
              <legend>{{t('Texture resolution')}}</legend>
              <label class="ui-radio">
                <input v-model="resolutionValue" type="radio" :value="TextureResolution.Low" />Low
              </label>
              <label class="ui-radio">
                <input v-model="resolutionValue" type="radio" :value="TextureResolution.Medium" />Medium
              </label>
              <label class="ui-radio">
                <input v-model="resolutionValue" type="radio" :value="TextureResolution.High" />High
              </label>
            </fieldset>

            <fieldset class="ui-groupbox">
              <legend>{{t('Lighting')}}</legend>
              <div class="ui-label">{{t('Ambient light:')}}</div>
              <div class="ui-hbox">
                <input
                  type="range"
                  class="ui-slider"
                  min="0"
                  max="100"
                  :value="Math.round(ui.ambientLightLevel * 100)"
                  @input="setAmbient(Number(($event.target as HTMLInputElement).value))"
                />
                <div class="ui-spinbox" style="width: 62px">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    :value="Math.round(ui.ambientLightLevel * 100)"
                    @change="setAmbient(Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
              <div class="ui-label">{{t('Tinted illumination saturation:')}}</div>
              <div class="ui-hbox">
                <input
                  type="range"
                  class="ui-slider"
                  min="0"
                  max="100"
                  :disabled="tintDisabled"
                  :value="Math.round(ui.tintSaturation * 100)"
                  @input="setTint(Number(($event.target as HTMLInputElement).value))"
                />
                <div class="ui-spinbox" style="width: 62px">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    :disabled="tintDisabled"
                    :value="Math.round(ui.tintSaturation * 100)"
                    @change="setTint(Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset class="ui-groupbox">
              <legend>{{t('Atmosphere')}}</legend>
              <label class="ui-checkbox" title="Use separate Rayleigh and Mie scale heights for atmosphere definitions that provide legacy fallback values.">
                <input
                  type="checkbox"
                  :checked="ui.separateRayleighMieScaleHeights"
                  @change="setSeparateRayleighMieScaleHeights(($event.target as HTMLInputElement).checked)"
                />
                Separate Rayleigh and Mie scale heights
              </label>
              <div class="ui-form-row" style="--ui-form-label-width: 128px">
                <span class="ui-label">{{t('Atmosphere segments:')}}</span>
                <div class="ui-spinbox" style="width: 62px" title="Number of integration segments used for atmospheric scattering.">
                  <input
                    type="number"
                    min="1"
                    max="16"
                    :value="ui.atmosphereSegmentCount"
                    @change="setNumeric('atmosphereSegmentCount', Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
              <div class="ui-form-row" style="--ui-form-label-width: 128px">
                <span class="ui-label">{{t('Cloud segments:')}}</span>
                <div class="ui-spinbox" style="width: 62px" title="Number of integration segments used for atmospheric effects on clouds.">
                  <input
                    type="number"
                    min="1"
                    max="16"
                    :value="ui.cloudSegmentCount"
                    @change="setNumeric('cloudSegmentCount', Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset class="ui-groupbox">
              <legend>{{t('Render path')}}</legend>
              <label class="ui-checkbox">
                <input
                  type="checkbox"
                  :checked="hasFlag(RenderFlags.ShowSmoothLines)"
                  @change="setFlag(RenderFlags.ShowSmoothLines, ($event.target as HTMLInputElement).checked)"
                />
                Antialiased lines
              </label>
              <div class="ui-form-row" style="--ui-form-label-width: 92px">
                <span class="ui-label">sRGB rendering:</span>
                <select v-model.number="ui.sRGBRendering" class="ui-select">
                  <option v-for="(option, index) in sRGBOptions" :key="option" :value="index">{{ option }}</option>
                </select>
              </div>
              <div class="ui-form-row" style="--ui-form-label-width: 92px">
                <span class="ui-label">{{t('Tone mapping:')}}</span>
                <select :value="ui.toneMappingMode" class="ui-select" @change="setToneMappingMode(Number(($event.target as HTMLSelectElement).value))">
                  <option v-for="(option, index) in toneMappingOptions" :key="option" :value="index">{{ option }}</option>
                </select>
              </div>
              <div v-if="ui.toneMappingMode === 1" class="ui-form-row" style="--ui-form-label-width: 92px">
                <span class="ui-label">{{t('Exposure:')}}</span>
                <input :value="ui.toneMappingExposure" type="number" step="0.1" min="0.01" max="100" class="ui-input" @change="setToneMappingExposure(Number(($event.target as HTMLInputElement).value))" />
              </div>
            </fieldset>
          </div>

          <div class="ui-vbox">
            <fieldset class="ui-groupbox">
              <legend>{{t('Star style')}}</legend>
              <label class="ui-radio">
                <input v-model="starStyleValue" type="radio" :value="StarStyle.PointStars" />Points
              </label>
              <label class="ui-radio">
                <input v-model="starStyleValue" type="radio" :value="StarStyle.FuzzyPointStars" />Fuzzy points
              </label>
              <label class="ui-radio">
                <input v-model="starStyleValue" type="radio" :value="StarStyle.ScaledDiscStars" />Scaled discs
              </label>
              <label class="ui-radio">
                <input v-model="starStyleValue" type="radio" :value="StarStyle.PointSpreadFunction" />Point spread function
              </label>
            </fieldset>

            <fieldset v-if="psfVisible" class="ui-groupbox">
              <legend>{{t('Point spread function options')}}</legend>
              <div v-for="field in psfFields" :key="field.key" class="ui-form-row" style="--ui-form-label-width: 116px">
                <span class="ui-label">{{ field.label }}</span>
                <div class="ui-spinbox" style="width: 84px" :title="field.tooltip">
                  <input
                    type="number"
                    :min="field.min"
                    :max="field.max"
                    :step="field.step"
                    :value="ui[field.key]"
                    @change="setNumeric(field.key, Number(($event.target as HTMLInputElement).value))"
                  />
                </div>
              </div>
              <div class="ui-form-row" style="--ui-form-label-width: 116px">
                <span class="ui-label">{{t('Exposure:')}}</span>
                <div class="ui-spinbox" style="width: 84px" :title="t('Per-star brightness multiplier. Valid range: 0.001 to 1.0e6.')">
                  <input
                    type="number"
                    min="0.001"
                    max="1000000"
                    step="10"
                    v-model.number="psfExposure"
                    @change="setNumeric('starExposure', psfExposure)"
                  />
                </div>
              </div>
            </fieldset>

            <fieldset class="ui-groupbox">
              <legend>{{t('Star colors')}}</legend>
              <select v-model="starColorValue" class="ui-select" style="width: 100%">
                <option v-for="[value, label] in STAR_COLOR_TABLES" :key="value" :value="value">{{ label }}</option>
              </select>
              <label class="ui-checkbox" style="margin-top: 8px">
                <input
                  type="checkbox"
                  :checked="hasFlag(RenderFlags.ShowAutoMag)"
                  @change="setFlag(RenderFlags.ShowAutoMag, ($event.target as HTMLInputElement).checked)"
                />
                Auto-magnitude
              </label>
            </fieldset>
          </div>
        </div>

        <!-- --------------------------------------------- Information -->
        <div v-else class="ui-vbox">
          <div class="ui-form-row" style="--ui-form-label-width: 130px">
            <span class="ui-label">{{t('Time zone:')}}</span>
            <select class="ui-select" :value="ui.timeZoneBias === 0 ? 0 : 1" @change="setTimeZone(Number(($event.target as HTMLSelectElement).value))">
              <option v-for="(option, index) in timeZoneOptions" :key="option" :value="index">{{ option }}</option>
            </select>
          </div>
          <div class="ui-form-row" style="--ui-form-label-width: 130px">
            <span class="ui-label">{{t('Date display format:')}}</span>
            <select class="ui-select" :value="ui.dateFormat" @change="setDateFormat(Number(($event.target as HTMLSelectElement).value))">
              <option v-for="(option, index) in dateFormatOptions" :key="option" :value="index">{{ option }}</option>
            </select>
          </div>
          <div class="ui-form-row" style="--ui-form-label-width: 130px">
            <span class="ui-label">{{t('Information text:')}}</span>
            <select class="ui-select" :value="ui.hudDetail" @change="setHudDetail(Number(($event.target as HTMLSelectElement).value))">
              <option v-for="[value, label] in hudDetailOptions" :key="value" :value="value">{{ label }}</option>
            </select>
          </div>
          <div class="ui-hline" />
          <div class="ui-muted" style="margin-top: 10px; font-size: 11px">
            The information text setting controls how much detail the on screen overlay shows for the
            selected object, matching the HudDetail option of the Qt build.
          </div>
        </div>
      </div>

      <div class="ui-dialog-buttons">
        <button class="ui-button default" @click="close">Ok</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-groupbox {
  margin: 0 0 10px;
}
</style>
