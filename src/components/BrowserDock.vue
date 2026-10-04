<script setup lang="ts">
// The Celestial Browser dock: a QTabWidget with the Solar System, Stars and Deep
// Sky browsers, exactly the tabs CelestiaAppWindow
// creates. Each browser is a port of its Qt counterpart, including the filter
// controls, the column sets, the sort behaviour and the Markers group.

import { computed, ref, onMounted, watch } from 'vue';
import {
  openDialog, refreshSelectionMirror, showMessage, t, ui, bookmarks, viewport,
} from '@/store/app';
import { absToAppMag } from '@/core/astro';
import { BodyClassification, classificationName } from '@/core/celestia';
import { MARKER_SYMBOLS, MARKER_SYMBOL_NAMES, MarkerSymbol } from '@/core/celestia';
import { KM_PER_LY } from '@/core/math';
import { formatDistance } from '@/core/objectInfo';
import { bvToHex } from '@/render/starcolor';

const emit = defineEmits<{ (event: 'select'): void }>();


// ------------------------------------------------------------------ tabs

const tabs = [
  { id: 'solar-system', title: t('Solar System') },
  { id: 'stars', title: t('Stars') },
  { id: 'deep-sky', title: t('Deep Sky Objects') },
];

// --------------------------------------------------------- solar system tree

/** A body as the engine reports it. */
interface EngineBody {
  name: string;
  path: string;
  classification: number;
  radiusKm: number;
}

interface TreeRow {
  depth: number;
  key: string;
  name: string;
  type: string;
  /** The engine's own entry, which is what a row selects. */
  entry?: EngineBody;
  expandable: boolean;
  groupHeader?: string;
  groupMask?: number;
}

const bodyFilters = ref({
  planets: true,
  asteroids: true,
  spacecraft: true,
  comets: true,
});

const groupByClass = ref(false);
const expanded = ref<Record<string, boolean>>({});

const bodyFilterMask = computed(() => {
  let mask = 0;
  if (bodyFilters.value.planets) mask |= BodyClassification.Planet | BodyClassification.DwarfPlanet | BodyClassification.Moon | BodyClassification.MinorMoon;
  if (bodyFilters.value.asteroids) mask |= BodyClassification.Asteroid;
  if (bodyFilters.value.spacecraft) mask |= BodyClassification.Spacecraft;
  if (bodyFilters.value.comets) mask |= BodyClassification.Comet;
  return mask === 0 ? 0xffff : mask;
});

const bodies = ref<EngineBody[]>([]);

/**
 * The bodies the engine has loaded.
 *
 * The shell used to keep its own solar system and walk it, which is how the tree
 * and the viewport came to disagree about what exists. The engine's list carries
 * Celestia's own paths ("Sol/Earth/Moon"), so the tree is the engine's hierarchy
 * and every row can name the object it selects.
 */
function refreshBodies(): void {
  const view = viewport();
  if (view === null) {
    bodies.value = [];
    return;
  }

  // The engine lists the system the observer is in, which is the one the Qt
  // browser shows.
  bodies.value = (view.engine.solarSystemObjects() as EngineBody[]).filter((b) => b.path !== '');
  if (bodies.value.length > 0) expanded.value[bodies.value[0].path] = true;
}

/** The bodies indexed by the path of their parent, for the tree to walk. */
const childrenByParent = computed(() => {
  const map = new Map<string, EngineBody[]>();
  for (const body of bodies.value) {
    const cut = body.path.lastIndexOf('/');
    const parent = cut === -1 ? '' : body.path.slice(0, cut);
    const siblings = map.get(parent);
    if (siblings === undefined) map.set(parent, [body]);
    else siblings.push(body);
  }
  return map;
});

const solarSystemRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];

  const push = (body: EngineBody, depth: number): void => {
    const children = (childrenByParent.value.get(body.path) ?? [])
      .filter((child) => (child.classification & bodyFilterMask.value) !== 0);

    rows.push({
      depth,
      key: body.path,
      name: body.name,
      type: classificationName(body.classification, body.classification === BodyClassification.Stellar),
      entry: body,
      expandable: children.length > 0,
    });

    // A root is shown even when the filter would hide it, since everything
    // below it hangs off it.
    if (depth > 0 && (body.classification & bodyFilterMask.value) === 0) return;
    if (expanded.value[body.path] === false) return;

    for (const child of children) push(child, depth + 1);
  };

  for (const root of childrenByParent.value.get('') ?? []) push(root, 0);
  return rows;
});

const selectedRowKey = ref<string | null>(null);

function toggleExpand(row: TreeRow): void {
  expanded.value[row.key] = expanded.value[row.key] === false;
}

function selectRow(row: TreeRow): void {
  selectedRowKey.value = row.key;
  if (row.groupHeader || row.entry === undefined) return;
  // The engine owns the selection; its path names the object.
  viewport()?.engine.selectObject(row.entry.path);
  refreshSelectionMirror();
  emit('select');
}

// --------------------------------------------------------------- star browser
//
// Ported from qtcelestialbrowser.cpp, which runs the engine's own StarBrowser
// rather than searching a catalogue of its own. The controls map onto it the
// same way: Closest or Brightest picks the comparison, and each filter box sets
// a bit. Qt requires Visible unless Barycenters is checked, which is why that
// one is inverted.

interface StarRow {
  name: string;
  distanceLy: number;
  appMag: number;
  absMag: number;
  spectralType: string;
}

/** MaxListStars in qtcelestialbrowser.cpp. */
const STARS_LIMIT = 1000;

const starCriteria = ref<'nearest' | 'brightest'>('nearest');
const starFilters = ref({ withPlanets: false, multiple: false, barycenters: false, spectralType: '' });
const starResult = ref<StarRow[]>([]);
const starSort = ref<{ column: number; ascending: boolean }>({ column: 1, ascending: true });

const STAR_VISIBLE = 1;
const STAR_MULTIPLE = 2;
const STAR_WITH_PLANETS = 4;
const STAR_SPECTRAL_TYPE = 8;

function refreshStars(): void {
  const view = viewport();
  if (view === null) {
    starResult.value = [];
    return;
  }

  const comparison = starCriteria.value === 'brightest' ? 1 : 0;
  let filter = 0;
  if (starFilters.value.withPlanets) filter |= STAR_WITH_PLANETS;
  if (starFilters.value.multiple) filter |= STAR_MULTIPLE;
  if (!starFilters.value.barycenters) filter |= STAR_VISIBLE;
  if (starFilters.value.spectralType) filter |= STAR_SPECTRAL_TYPE;

  starResult.value = view.engine.searchStars(STARS_LIMIT, comparison, filter, starFilters.value.spectralType);
  sortStars();
}

function sortStars(): void {
  const { column, ascending } = starSort.value;
  starResult.value = [...starResult.value].sort((a, b) => {
    let result = 0;
    switch (column) {
      case 0:
        result = a.name.localeCompare(b.name);
        break;
      case 1:
        result = a.distanceLy - b.distanceLy;
        break;
      case 2:
        result = a.appMag - b.appMag;
        break;
      case 3:
        result = a.absMag - b.absMag;
        break;
      default:
        result = a.spectralType.localeCompare(b.spectralType);
        break;
    }
    return ascending ? result : -result;
  });
}

function onStarSort(column: number): void {
  if (starSort.value.column === column) starSort.value.ascending = !starSort.value.ascending;
  else starSort.value = { column, ascending: true };
  sortStars();
}

function selectStar(row: StarRow): void {
  // A star is addressed by its catalogue name, which is what the engine resolves.
  viewport()?.engine.selectObject(row.name);
  refreshSelectionMirror();
  emit('select');
}

// ------------------------------------------------------------ deep sky browser
//
// Ported from qtdeepskybrowser.cpp. The radio buttons choose a category, which
// the engine reports separately from the morphological type the table shows; the
// Distance and App. mag columns are worked out from where the observer is
// standing, as the Qt model's data() does.

interface DsoEntry {
  name: string;
  type: string;
  objType: number;
  absoluteMagnitude: number;
  positionLy: number[];
}

interface DsoRow {
  name: string;
  type: string;
  distanceLy: number;
  /** Null when the catalogue carries no magnitude, which Qt leaves blank. */
  appMag: number | null;
}

/** DeepSkyObjectType in celengine/deepskyobj.h. */
const DSO_GALAXY = 0;
const DSO_GLOBULAR = 1;
const DSO_NEBULA = 2;
const DSO_OPEN_CLUSTER = 3;

/** DSO_DEFAULT_ABS_MAGNITUDE, which the catalogues use for "no magnitude". */
const DSO_DEFAULT_ABS_MAGNITUDE = -1000;

const dsoCategory = ref(DSO_GALAXY);
const dsoFilter = ref('');
const dsoCatalog = ref<DsoEntry[]>([]);
const dsoResult = ref<DsoRow[]>([]);
const dsoSort = ref<{ column: number; ascending: boolean }>({ column: 1, ascending: true });

const dsoShowTypeColumn = computed(() => dsoCategory.value === DSO_GALAXY || dsoCategory.value === DSO_NEBULA);

function observerPositionLy(): { x: number; y: number; z: number } {
  const view = viewport();
  if (view === null) return { x: 0, y: 0, z: 0 };
  const position = view.engine.observerPositionLy();
  const out = { x: position.get(0), y: position.get(1), z: position.get(2) };
  position.delete();
  return out;
}

function refreshDso(): void {
  const view = viewport();
  if (view === null) {
    dsoResult.value = [];
    return;
  }

  if (dsoCatalog.value.length === 0) dsoCatalog.value = view.engine.deepSkyObjects() as DsoEntry[];

  const observer = observerPositionLy();
  const pattern = dsoFilter.value && dsoShowTypeColumn.value
    ? new RegExp(`^${dsoFilter.value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
    : null;

  dsoResult.value = dsoCatalog.value
    .filter((dso) => dso.objType === dsoCategory.value)
    .filter((dso) => pattern === null || pattern.test(dso.type))
    .map((dso) => {
      const [x, y, z] = dso.positionLy;
      const distanceLy = Math.hypot(x - observer.x, y - observer.y, z - observer.z);
      const appMag = dso.absoluteMagnitude === DSO_DEFAULT_ABS_MAGNITUDE
        ? null
        : absToAppMag(dso.absoluteMagnitude, distanceLy);
      return { name: dso.name, type: dso.type, distanceLy, appMag };
    });

  sortDso();
}

function sortDso(): void {
  const { column, ascending } = dsoSort.value;
  dsoResult.value = [...dsoResult.value].sort((a, b) => {
    let result = 0;
    switch (column) {
      case 0:
        result = a.name.localeCompare(b.name);
        break;
      case 1:
        result = a.distanceLy - b.distanceLy;
        break;
      case 2:
        result = (a.appMag ?? 0) - (b.appMag ?? 0);
        break;
      default:
        result = a.type.localeCompare(b.type);
        break;
    }
    return ascending ? result : -result;
  });
}

function onDsoSort(column: number): void {
  if (dsoSort.value.column === column) dsoSort.value.ascending = !dsoSort.value.ascending;
  else dsoSort.value = { column, ascending: true };
  sortDso();
}

function selectDso(row: DsoRow): void {
  viewport()?.engine.selectObject(row.name);
  refreshSelectionMirror();
  emit('select');
}

// ----------------------------------------------------------------- markers

const markerSymbol = ref<MarkerSymbol>(MarkerSymbol.Diamond);
const markerSize = ref(20);
const markerColor = ref('#00ffff');
const markerLabel = ref(false);

/**
 * The engine's paths for the rows the user has selected.
 *
 * Markers belong to the engine's Universe and are drawn by its renderer, so the
 * shell cannot keep its own list: a marker it held would never appear on the
 * viewport. The symbols are Celestia's own numbering, which the shell's list
 * already follows.
 */
function activePaths(): string[] {
  if (!selectedRowKey.value || ui.activeBrowserTab !== 'solar-system') return [];
  const row = solarSystemRows.value.find((r) => r.key === selectedRowKey.value);
  return row?.entry !== undefined ? [row.entry.path] : [];
}

function markSelected(): void {
  const view = viewport();
  const paths = activePaths();
  if (view === null || paths.length === 0) {
    showMessage('Select an object in the list first', 2);
    return;
  }

  const [r, g, b] = hexToRgb(markerColor.value);
  for (const path of paths) {
    view.engine.markObject(path, Number(markerSymbol.value), markerSize.value, r, g, b, Math.round(0.9 * 255),
                           markerLabel.value ? path : '');
  }

  // Celestia turns the marker layer on when a marker is placed.
  const flags = BigInt(view.engine.renderFlags()) | 0x0000000000010000n;
  view.engine.setRenderFlags(Number(flags));
  ui.renderFlags = flags;
  showMessage(`Marked ${paths.length} object(s)`, 2);
}

function unmarkSelected(): void {
  const view = viewport();
  if (view === null) return;
  for (const path of activePaths()) view.engine.unmarkObject(path);
}

function clearMarkers(): void {
  viewport()?.engine.unmarkAll();
  showMessage('All markers removed', 2);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

// -------------------------------------------------------------- bookmarks

function addCurrentBookmark(): void {
  openDialog('add-bookmark');
}

function describeSelection(): string {
  return viewport()?.engine.selectedObject()?.name || 'nothing selected';
}

// ------------------------------------------------------------------- setup

onMounted(() => {
  // The root of the solar system opens by default, as it does in Qt.
  expanded.value['Sol'] = true;
  refreshBodies();
  refreshStars();
  refreshDso();
});

// The engine is the source of the tree, so it has to be read after the core
// exists rather than only at mount.
watch(viewport, (view) => { if (view !== null) refreshBodies(); });

watch(starCriteria, refreshStars);
watch(starFilters, refreshStars, { deep: true });
watch(dsoCategory, refreshDso);
watch(dsoFilter, refreshDso);
watch(groupByClass, () => { /* rows recompute automatically */ });

function onRowDoubleClick(row: TreeRow): void {
  if (row.entry === undefined) return;
  // Qt's browsers move the observer to the object on a double click, which is
  // the same key the Goto menu item sends.
  viewport()?.engine.selectObject(row.entry.path);
  viewport()?.engine.charEntered('g', 0);
  refreshSelectionMirror();
}

const bookmarkCount = computed(() => bookmarks.menu.reduce((total, folder) => total + folder.children.length, 0));
</script>

<template>
  <div class="qt-dock left">
    <div class="qt-dock-title">
      <span>{{t('Celestial Browser')}}</span>
      <span class="spacer" />
      <button :title="t('Close')" @click="ui.showCelestialBrowser = false">✕</button>
    </div>

    <div class="qt-tabbar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="qt-tab"
        :class="{ active: ui.activeBrowserTab === tab.id }"
        @click="ui.activeBrowserTab = tab.id"
      >
        {{ tab.title }}
      </div>
    </div>

    <div class="qt-dock-body">
      <!-- -------------------------------------------------- solar system -->
      <div v-if="ui.activeBrowserTab === 'solar-system'" class="qt-split">
        <div class="qt-hbox" style="padding: 6px; flex-wrap: wrap">
          <label class="qt-checkbox"><input v-model="bodyFilters.planets" type="checkbox" />{{t('Planets and moons')}}</label>
          <label class="qt-checkbox"><input v-model="bodyFilters.asteroids" type="checkbox" />{{t('Asteroids')}}</label>
          <label class="qt-checkbox"><input v-model="bodyFilters.spacecraft" type="checkbox" />{{t('Spacecraft')}}</label>
          <label class="qt-checkbox"><input v-model="bodyFilters.comets" type="checkbox" />{{t('Comets')}}</label>
        </div>

        <fieldset class="qt-groupbox">
          <legend>{{t('Filter')}}</legend>
          <div class="qt-muted" style="font-size: 11px">{{t('Use the check boxes above to filter the tree.')}}</div>
        </fieldset>

        <div class="qt-hbox" style="padding: 0 6px">
          <button class="qt-button" @click="expanded = {}; refreshBodies()">{{t('Refresh')}}</button>
          <label class="qt-checkbox"><input v-model="groupByClass" type="checkbox" />{{t('Group objects by class')}}</label>
        </div>

        <fieldset class="qt-groupbox">
          <legend>{{t('Markers')}}</legend>
          <div class="qt-columns">
            <div class="qt-vbox" style="gap: 4px">
              <button class="qt-button" :title="t('Mark bodies selected in list view')" @click="markSelected">{{t('Mark Selected')}}</button>
              <button class="qt-button" :title="t('Unmark stars selected in list view')" @click="unmarkSelected">{{t('Unmark Selected')}}</button>
              <button class="qt-button" :title="t('Remove all existing markers')" @click="clearMarkers">{{t('Clear Markers')}}</button>
            </div>
            <div class="qt-vbox" style="gap: 4px">
              <select v-model="markerSymbol" class="qt-select" :title="t('Select marker symbol')">
                <option v-for="symbol in MARKER_SYMBOLS" :key="symbol" :value="symbol">{{ symbol }}</option>
              </select>
              <select v-model.number="markerSize" class="qt-select" :title="t('Select marker size')">
                <option v-for="size in [3, 5, 10, 20, 50, 100, 200]" :key="size" :value="size">{{ size }}</option>
              </select>
              <div class="qt-hbox">
                <input v-model="markerColor" type="color" class="qt-input" style="width: 34px; padding: 0" :title="t('Click to select marker color')" />
                <label class="qt-checkbox"><input v-model="markerLabel" type="checkbox" />{{t('Label')}}</label>
              </div>
            </div>
          </div>
        </fieldset>

        <div class="qt-tree" style="border: 1px solid var(--qt-border-light); margin: 0 6px 6px">
          <div
            v-for="row in solarSystemRows"
            :key="row.key"
            class="qt-tree-row"
            :class="{ selected: selectedRowKey === row.key }"
            :style="{ paddingLeft: `${row.depth * 14}px`, fontStyle: row.groupHeader ? 'italic' : 'normal' }"
            @click="selectRow(row)"
            @dblclick="onRowDoubleClick(row)"
          >
            <span class="twisty" @click.stop="toggleExpand(row)">{{ row.expandable ? (expanded[row.key] === false ? '▶' : '▼') : '' }}</span>
            <span class="cell" style="flex: 1 1 60%">{{ row.name }}</span>
            <span class="cell qt-muted" style="flex: 1 1 40%">{{ row.type }}</span>
          </div>
        </div>
      </div>

      <!-- ---------------------------------------------------------- stars -->
      <div v-else-if="ui.activeBrowserTab === 'stars'" class="qt-split">
        <div class="qt-hbox" style="padding: 6px">
          <label class="qt-radio"><input v-model="starCriteria" type="radio" value="nearest" />{{t('Closest Stars')}}</label>
          <label class="qt-radio"><input v-model="starCriteria" type="radio" value="brightest" />{{t('Brightest Stars')}}</label>
        </div>

        <fieldset class="qt-groupbox">
          <legend>{{t('Filter')}}</legend>
          <label class="qt-checkbox"><input v-model="starFilters.withPlanets" type="checkbox" />{{t('With Planets')}}</label>
          <label class="qt-checkbox"><input v-model="starFilters.multiple" type="checkbox" />{{t('Multiple Stars')}}</label>
          <label class="qt-checkbox"><input v-model="starFilters.barycenters" type="checkbox" />{{t('Barycenters')}}</label>
          <div class="qt-form-row" style="--qt-form-label-width: 84px">
            <span class="qt-label">{{t('Spectral Type')}}</span>
            <input v-model="starFilters.spectralType" class="qt-input" placeholder="e.g. G*" @change="refreshStars" />
          </div>
        </fieldset>

        <div class="qt-hbox" style="padding: 0 6px">
          <button class="qt-button" @click="refreshStars">{{t('Refresh')}}</button>
          <span class="qt-muted">{{ starResult.length }} objects found</span>
        </div>

        <fieldset class="qt-groupbox">
          <legend>{{t('Markers')}}</legend>
          <div class="qt-hbox">
            <button class="qt-button" :title="t('Mark stars selected in list view')" @click="markSelected">{{t('Mark Selected')}}</button>
            <button class="qt-button" :title="t('Unmark stars selected in list view')" @click="unmarkSelected">{{t('Unmark')}}</button>
            <button class="qt-button" :title="t('Remove all existing markers')" @click="clearMarkers">{{t('Clear')}}</button>
          </div>
        </fieldset>

        <div style="flex: 1 1 auto; overflow: auto; margin: 0 6px 6px; border: 1px solid var(--qt-border-light)">
          <table class="qt-table">
            <thead>
              <tr>
                <th style="width: 40%" @click="onStarSort(0)">{{t('Name')}}</th>
                <th style="width: 18%" @click="onStarSort(1)">{{t('Distance (ly)')}}</th>
                <th style="width: 14%" @click="onStarSort(2)">{{t('App. mag')}}</th>
                <th style="width: 14%" @click="onStarSort(3)">{{t('Abs. mag')}}</th>
                <th style="width: 14%" @click="onStarSort(4)">{{t('Type')}}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in starResult.slice(0, 500)" :key="entry.name" @click="selectStar(entry)">
                <td>{{ entry.name }}</td>
                <td class="numeric">{{ entry.distanceLy.toFixed(3) }}</td>
                <td class="numeric">{{ entry.appMag.toFixed(2) }}</td>
                <td class="numeric">{{ entry.absMag.toFixed(2) }}</td>
                <td>{{ entry.spectralType }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="qt-muted" style="padding: 0 6px 6px; font-size: 11px">
          Showing the first 500 of {{ starResult.length }} matches, limited to {{ STARS_LIMIT }} as the Qt browser does.
        </div>
      </div>

      <!-- ------------------------------------------------------ deep sky -->
      <div v-else-if="ui.activeBrowserTab === 'deep-sky'" class="qt-split">
        <div class="qt-hbox" style="padding: 6px; flex-wrap: wrap">
          <label class="qt-radio"><input v-model="dsoCategory" type="radio" :value="DSO_GALAXY" />{{t('Galaxies')}}</label>
          <label class="qt-radio"><input v-model="dsoCategory" type="radio" :value="DSO_GLOBULAR" />{{t('Globulars')}}</label>
          <label class="qt-radio"><input v-model="dsoCategory" type="radio" :value="DSO_NEBULA" />{{t('Nebulae')}}</label>
          <label class="qt-radio"><input v-model="dsoCategory" type="radio" :value="DSO_OPEN_CLUSTER" />{{t('Open Clusters')}}</label>
        </div>

        <fieldset class="qt-groupbox">
          <legend>{{t('Filter')}}</legend>
          <div class="qt-form-row" style="--qt-form-label-width: 44px">
            <span class="qt-label">{{t('Type')}}</span>
            <input
              v-model="dsoFilter"
              class="qt-input"
              :disabled="!dsoShowTypeColumn"
              :placeholder="dsoShowTypeColumn ? 'wildcard, e.g. Sb*' : 'disabled for this class'"
              @change="refreshDso"
            />
          </div>
        </fieldset>

        <div class="qt-hbox" style="padding: 0 6px">
          <button class="qt-button" @click="refreshDso">{{t('Refresh')}}</button>
          <span class="qt-muted">{{ dsoResult.length }} objects found</span>
        </div>

        <fieldset class="qt-groupbox">
          <legend>{{t('Markers')}}</legend>
          <div class="qt-hbox">
            <button class="qt-button" :title="t('Mark DSOs selected in list view')" @click="markSelected">{{t('Mark Selected')}}</button>
            <button class="qt-button" :title="t('Unmark DSOs selected in list view')" @click="unmarkSelected">{{t('Unmark')}}</button>
            <button class="qt-button" :title="t('Remove all existing markers')" @click="clearMarkers">{{t('Clear')}}</button>
          </div>
        </fieldset>

        <div style="flex: 1 1 auto; overflow: auto; margin: 0 6px 6px; border: 1px solid var(--qt-border-light)">
          <table class="qt-table">
            <thead>
              <tr>
                <th style="width: 34%" @click="onDsoSort(0)">{{t('Name')}}</th>
                <th style="width: 22%" @click="onDsoSort(1)">{{t('Distance')}}</th>
                <th style="width: 22%" @click="onDsoSort(2)">{{t('App. mag')}}</th>
                <th v-if="dsoShowTypeColumn" style="width: 22%" @click="onDsoSort(3)">{{t('Type')}}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dso in dsoResult.slice(0, 600)" :key="dso.name" @click="selectDso(dso)">
                <td>{{ dso.name }}</td>
                <td class="numeric">{{ dso.distanceLy.toFixed(3) }}</td>
                <td class="numeric">{{ dso.appMag === null ? '' : dso.appMag.toFixed(2) }}</td>
                <td v-if="dsoShowTypeColumn">{{ dso.type }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>


      <!-- ------------------------------------------------------ bookmarks -->
      <fieldset class="qt-groupbox">
        <legend>{{t('Bookmarks')}}</legend>
        <div class="qt-vbox" style="gap: 4px">
          <div class="qt-muted" style="font-size: 11px">Current selection: {{ describeSelection() }}</div>
          <button class="qt-button" @click="addCurrentBookmark">{{t('Add Bookmark...')}}</button>
          <div class="qt-muted" style="font-size: 11px">{{ bookmarkCount }} entries in the bookmark menu</div>
        </div>
      </fieldset>
    </div>
  </div>
</template>

<style scoped>
.qt-groupbox {
  margin: 0 6px 6px;
}
</style>
