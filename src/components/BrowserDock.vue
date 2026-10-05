<script setup lang="ts">
// The Celestial Browser dock: a QTabWidget with the Solar System, Stars and Deep
// Sky browsers, exactly the tabs CelestiaAppWindow
// creates. Each browser is a port of its Qt counterpart, including the filter
// controls, the column sets, the sort behaviour and the Markers group.

import { computed, ref, onMounted, watch } from 'vue';
import {
  refreshSelectionMirror, showMessage, t, tc, ui, viewport,
} from '@/store/app';
import { absToAppMag } from '@/core/astro';
import {
  BodyClassification, MARKER_SYMBOL_NAMES, MARKER_SYMBOLS, MarkerSymbol, classificationName, groupClassName,
} from '@/core/celestia';
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
  planets: false,
  asteroids: false,
  spacecraft: false,
  comets: false,
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

/**
 * The classes Qt gathers into a group of their own, in the order it adds them.
 * The last is the catch-all for anything the switch below does not name.
 */
const GROUPS: BodyClassification[] = [
  BodyClassification.MinorMoon,
  BodyClassification.Asteroid,
  BodyClassification.Spacecraft,
  BodyClassification.SurfaceFeature,
  BodyClassification.Component,
  BodyClassification.Unknown,
];

const solarSystemRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [];
  const mask = bodyFilterMask.value;
  // The Qt model takes one of three shapes: grouped by class, or filtered, or
  // plain, and grouping wins over the filter.
  const grouped = groupByClass.value;

  const childrenOf = (body: EngineBody): EngineBody[] => {
    const children = childrenByParent.value.get(body.path) ?? [];
    if (grouped || mask === 0) return children;
    return children.filter((child) => (child.classification & mask) !== 0);
  };

  const rowFor = (body: EngineBody, depth: number, childCount: number): TreeRow => ({
    depth,
    key: body.path,
    name: body.name,
    type: classificationName(body.classification, body.classification === BodyClassification.Stellar),
    entry: body,
    expandable: childCount > 0,
  });

  const groupRow = (parent: EngineBody, depth: number, group: BodyClassification, count: number): TreeRow => {
    const title = groupClassName(group);
    return {
      depth,
      key: `${parent.path}#${group}`,
      // The spacecraft one is the catalogue's plural form, which a plain lookup
      // does not find.
      name: group === BodyClassification.Spacecraft ? tc('plural', title) : t(title),
      type: '',
      groupHeader: title,
      expandable: count > 0,
    };
  };

  const push = (body: EngineBody, depth: number): void => {
    const kids = childrenOf(body);

    if (!grouped) {
      rows.push(rowFor(body, depth, kids.length));
      if (expanded.value[body.path] === false) return;
      for (const child of kids) push(child, depth + 1);
      return;
    }

    // An asteroid's own asteroids and a spacecraft's own spacecrafts stay its
    // direct children instead of joining the group, which is what Qt does.
    const parentIsAsteroid = body.classification === BodyClassification.Asteroid;
    const parentIsSpacecraft = body.classification === BodyClassification.Spacecraft;
    const direct: EngineBody[] = [];
    const buckets = new Map<BodyClassification, EngineBody[]>();

    const collect = (group: BodyClassification, child: EngineBody): void => {
      const bucket = buckets.get(group);
      if (bucket === undefined) buckets.set(group, [child]);
      else bucket.push(child);
    };

    for (const child of kids) {
      switch (child.classification) {
        case BodyClassification.Planet:
        case BodyClassification.DwarfPlanet:
        case BodyClassification.Invisible:
        case BodyClassification.Moon:
          direct.push(child);
          break;
        case BodyClassification.MinorMoon:
          collect(BodyClassification.MinorMoon, child);
          break;
        case BodyClassification.Asteroid:
        case BodyClassification.Comet:
          if (parentIsAsteroid) direct.push(child);
          else collect(BodyClassification.Asteroid, child);
          break;
        case BodyClassification.Spacecraft:
          if (parentIsSpacecraft) direct.push(child);
          else collect(BodyClassification.Spacecraft, child);
          break;
        case BodyClassification.SurfaceFeature:
          collect(BodyClassification.SurfaceFeature, child);
          break;
        case BodyClassification.Component:
          collect(BodyClassification.Component, child);
          break;
        default:
          collect(BodyClassification.Unknown, child);
          break;
      }
    }

    const groups = GROUPS.map((group) => ({ group, members: buckets.get(group) ?? [] }));
    const total = direct.length + groups.reduce((sum, entry) => sum + entry.members.length, 0);
    rows.push(rowFor(body, depth, total));
    if (expanded.value[body.path] === false) return;

    for (const child of direct) push(child, depth + 1);
    for (const { group, members } of groups) {
      if (members.length === 0) continue;
      rows.push(groupRow(body, depth + 1, group, members.length));
      if (expanded.value[`${body.path}#${group}`] === false) continue;
      for (const member of members) push(member, depth + 2);
    }
  };

  for (const root of childrenByParent.value.get('') ?? []) push(root, 0);
  return rows;
});

const selectedRowKey = ref<string | null>(null);
const starSelection = ref<StarRow | null>(null);
const dsoSelection = ref<DsoRow | null>(null);

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
  starSelection.value = row;
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
  dsoSelection.value = row;
  viewport()?.engine.selectObject(row.name);
  refreshSelectionMirror();
  emit('select');
}

// ----------------------------------------------------------------- markers

// The box is None first, so the entry Qt opens on, the second one, is Diamond.
const NO_MARKER = -1;
const markerSymbol = ref<number>(MarkerSymbol.Diamond);
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
function activeSelection(): Array<{ path: string; name: string }> {
  if (ui.activeBrowserTab === 'solar-system') {
    const row = solarSystemRows.value.find((r) => r.key === selectedRowKey.value);
    return row?.entry !== undefined ? [{ path: row.entry.path, name: row.entry.name }] : [];
  }
  if (ui.activeBrowserTab === 'stars') {
    return starSelection.value === null ? [] : [{ path: starSelection.value.name, name: starSelection.value.name }];
  }
  if (ui.activeBrowserTab === 'deep-sky') {
    return dsoSelection.value === null ? [] : [{ path: dsoSelection.value.name, name: dsoSelection.value.name }];
  }
  return [];
}

function markSelected(): void {
  const view = viewport();
  if (view === null) return;

  // None carries no value, and Qt takes that as a request to take the marker off
  // rather than to change it.
  if (markerSymbol.value === NO_MARKER) {
    for (const object of activeSelection()) view.engine.unmarkObject(object.path);
    return;
  }

  const [r, g, b] = hexToRgb(markerColor.value);
  for (const object of activeSelection()) {
    // The marker is replaced rather than restyled, which is why the object is
    // unmarked first.
    view.engine.unmarkObject(object.path);
    view.engine.markObject(object.path, markerSymbol.value, markerSize.value, r, g, b, Math.round(0.9 * 255),
                           markerLabel.value ? object.name : '');
  }
}

function unmarkSelected(): void {
  const view = viewport();
  if (view === null) return;
  for (const object of activeSelection()) view.engine.unmarkObject(object.path);
}

function clearMarkers(): void {
  viewport()?.engine.unmarkAll();
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

/** The label Qt puts under the star and deep sky lists, "%1 objects found". */
function objectsFound(count: number): string {
  return t('%1 objects found').replace('%1', String(count));
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
</script>

<template>
  <div class="ui-dock left">
    <div class="ui-dock-title">
      <span>{{t('Celestial Browser')}}</span>
      <span class="spacer" />
      <button :title="t('Close')" @click="ui.showCelestialBrowser = false">✕</button>
    </div>

    <div class="ui-tabbar">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="ui-tab"
        :class="{ active: ui.activeBrowserTab === tab.id }"
        @click="ui.activeBrowserTab = tab.id"
      >
        {{ tab.title }}
      </div>
    </div>

    <div class="ui-dock-body">
      <!-- -------------------------------------------------- solar system -->
      <div v-if="ui.activeBrowserTab === 'solar-system'" class="ui-split">
        <div class="ui-tree" style="border: 1px solid var(--ui-border-light); margin: 6px 6px 0">
          <div
            v-for="row in solarSystemRows"
            :key="row.key"
            class="ui-tree-row"
            :class="{ selected: selectedRowKey === row.key }"
            :style="{ paddingLeft: `${row.depth * 14}px`, fontStyle: row.groupHeader ? 'italic' : 'normal' }"
            @click="selectRow(row)"
            @dblclick="onRowDoubleClick(row)"
          >
            <span class="twisty" @click.stop="toggleExpand(row)">{{ row.expandable ? (expanded[row.key] === false ? '▶' : '▼') : '' }}</span>
            <span class="cell" style="flex: 1 1 60%">{{ row.name }}</span>
            <span class="cell ui-muted" style="flex: 1 1 40%">{{ row.type }}</span>
          </div>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Filter')}}</legend>
          <div style="display: grid; grid-template-columns: 1fr 1fr; column-gap: 12px">
            <label class="ui-checkbox"><input v-model="bodyFilters.planets" type="checkbox" />{{t('Planets and moons')}}</label>
            <label class="ui-checkbox"><input v-model="bodyFilters.asteroids" type="checkbox" />{{t('Asteroids')}}</label>
            <label class="ui-checkbox"><input v-model="bodyFilters.spacecraft" type="checkbox" />{{tc('plural', 'Spacecraft')}}</label>
            <label class="ui-checkbox"><input v-model="bodyFilters.comets" type="checkbox" />{{t('Comets')}}</label>
          </div>
        </fieldset>

        <div class="ui-hbox" style="padding: 0 6px">
          <button class="ui-button" @click="expanded = {}; refreshBodies()">{{t('Refresh')}}</button>
        </div>
        <div class="ui-hbox" style="padding: 0 6px 6px">
          <label class="ui-checkbox"><input v-model="groupByClass" type="checkbox" />{{t('Group objects by class')}}</label>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Markers')}}</legend>
          <div class="ui-hbox" style="gap: 4px">
            <button class="ui-button" :title="t('Mark bodies selected in list view')" @click="markSelected">{{t('Mark Selected')}}</button>
            <button class="ui-button" :title="t('Unmark stars selected in list view')" @click="unmarkSelected">{{t('Unmark Selected')}}</button>
            <button class="ui-button" :title="t('Remove all existing markers')" @click="clearMarkers">{{t('Clear Markers')}}</button>
          </div>
          <div class="ui-hbox" style="gap: 4px; margin-top: 4px; align-items: center">
            <select v-model.number="markerSymbol" class="ui-select" :title="t('Select marker symbol')">
              <option :value="NO_MARKER">{{t('None')}}</option>
              <option v-for="symbol in MARKER_SYMBOLS" :key="symbol" :value="symbol">{{ t(MARKER_SYMBOL_NAMES[symbol]) }}</option>
            </select>
            <select v-model.number="markerSize" class="ui-select" :title="t('Select marker size')">
              <option v-for="size in [3, 5, 10, 20, 50, 100, 200]" :key="size" :value="size">{{ size }}</option>
            </select>
            <input v-model="markerColor" type="color" class="ui-input" style="width: 34px; padding: 0" :title="t('Click to select marker color')" />
            <label class="ui-checkbox"><input v-model="markerLabel" type="checkbox" />{{t('Label')}}</label>
          </div>
        </fieldset>
      </div>

      <!-- ---------------------------------------------------------- stars -->
      <div v-else-if="ui.activeBrowserTab === 'stars'" class="ui-split">
        <div style="flex: 1 1 auto; overflow: auto; margin: 6px 6px 0; border: 1px solid var(--ui-border-light)">
          <table class="ui-table">
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
              <tr
                v-for="entry in starResult.slice(0, 500)"
                :key="entry.name"
                :class="{ selected: starSelection?.name === entry.name }"
                @click="selectStar(entry)"
              >
                <td>{{ entry.name }}</td>
                <td class="numeric">{{ entry.distanceLy.toFixed(3) }}</td>
                <td class="numeric">{{ entry.appMag.toFixed(2) }}</td>
                <td class="numeric">{{ entry.absMag.toFixed(2) }}</td>
                <td>{{ entry.spectralType }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="padding: 3px 6px">{{ objectsFound(starResult.length) }}</div>

        <div class="ui-hbox" style="padding: 0 6px">
          <label class="ui-radio"><input v-model="starCriteria" type="radio" value="nearest" />{{t('Closest Stars')}}</label>
          <label class="ui-radio"><input v-model="starCriteria" type="radio" value="brightest" />{{t('Brightest Stars')}}</label>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Filter')}}</legend>
          <label class="ui-checkbox"><input v-model="starFilters.withPlanets" type="checkbox" />{{t('With Planets')}}</label>
          <label class="ui-checkbox"><input v-model="starFilters.multiple" type="checkbox" />{{t('Multiple Stars')}}</label>
          <label class="ui-checkbox"><input v-model="starFilters.barycenters" type="checkbox" />{{t('Barycenters')}}</label>
          <div class="ui-form-row" style="--ui-form-label-width: 84px">
            <span class="ui-label">{{t('Spectral Type')}}</span>
            <input v-model="starFilters.spectralType" class="ui-input" placeholder="e.g. G*" @change="refreshStars" />
          </div>
        </fieldset>

        <div class="ui-hbox" style="padding: 0 6px">
          <button class="ui-button" @click="refreshStars">{{t('Refresh')}}</button>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Markers')}}</legend>
          <div class="ui-hbox" style="gap: 4px">
            <button class="ui-button" :title="t('Mark stars selected in list view')" @click="markSelected">{{t('Mark Selected')}}</button>
            <button class="ui-button" :title="t('Unmark stars selected in list view')" @click="unmarkSelected">{{t('Unmark Selected')}}</button>
            <button class="ui-button" :title="t('Remove all existing markers')" @click="clearMarkers">{{t('Clear Markers')}}</button>
          </div>
          <div class="ui-hbox" style="gap: 4px; margin-top: 4px; align-items: center">
            <select v-model.number="markerSymbol" class="ui-select" :title="t('Select marker symbol')">
              <option :value="NO_MARKER">{{t('None')}}</option>
              <option v-for="symbol in MARKER_SYMBOLS" :key="symbol" :value="symbol">{{ t(MARKER_SYMBOL_NAMES[symbol]) }}</option>
            </select>
            <select v-model.number="markerSize" class="ui-select" :title="t('Select marker size')">
              <option v-for="size in [3, 5, 10, 20, 50, 100, 200]" :key="size" :value="size">{{ size }}</option>
            </select>
            <input v-model="markerColor" type="color" class="ui-input" style="width: 34px; padding: 0" :title="t('Click to select marker color')" />
            <label class="ui-checkbox"><input v-model="markerLabel" type="checkbox" />{{t('Label')}}</label>
          </div>
        </fieldset>
      </div>

      <!-- ------------------------------------------------------ deep sky -->
      <div v-else-if="ui.activeBrowserTab === 'deep-sky'" class="ui-split">
        <div style="flex: 1 1 auto; overflow: auto; margin: 6px 6px 0; border: 1px solid var(--ui-border-light)">
          <table class="ui-table">
            <thead>
              <tr>
                <th style="width: 34%" @click="onDsoSort(0)">{{t('Name')}}</th>
                <th style="width: 22%" @click="onDsoSort(1)">{{t('Distance (ly)')}}</th>
                <th style="width: 22%" @click="onDsoSort(2)">{{t('App. mag')}}</th>
                <th v-if="dsoShowTypeColumn" style="width: 22%" @click="onDsoSort(3)">{{t('Type')}}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="dso in dsoResult.slice(0, 600)"
                :key="dso.name"
                :class="{ selected: dsoSelection?.name === dso.name }"
                @click="selectDso(dso)"
              >
                <td>{{ dso.name }}</td>
                <td class="numeric">{{ dso.distanceLy.toFixed(3) }}</td>
                <td class="numeric">{{ dso.appMag === null ? '' : dso.appMag.toFixed(2) }}</td>
                <td v-if="dsoShowTypeColumn">{{ dso.type }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="padding: 3px 6px">{{ objectsFound(dsoResult.length) }}</div>

        <div class="ui-hbox" style="padding: 0 6px; flex-wrap: wrap">
          <label class="ui-radio"><input v-model="dsoCategory" type="radio" :value="DSO_GALAXY" />{{t('Galaxies')}}</label>
          <label class="ui-radio"><input v-model="dsoCategory" type="radio" :value="DSO_GLOBULAR" />{{t('Globulars')}}</label>
          <label class="ui-radio"><input v-model="dsoCategory" type="radio" :value="DSO_NEBULA" />{{t('Nebulae')}}</label>
          <label class="ui-radio"><input v-model="dsoCategory" type="radio" :value="DSO_OPEN_CLUSTER" />{{t('Open Clusters')}}</label>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Filter')}}</legend>
          <div class="ui-form-row" style="--ui-form-label-width: 44px">
            <span class="ui-label">{{t('Type')}}</span>
            <input
              v-model="dsoFilter"
              class="ui-input"
              :disabled="!dsoShowTypeColumn"
              :placeholder="dsoShowTypeColumn ? 'wildcard, e.g. Sb*' : 'disabled for this class'"
              @change="refreshDso"
            />
          </div>
        </fieldset>

        <div class="ui-hbox" style="padding: 0 6px">
          <button class="ui-button" @click="refreshDso">{{t('Refresh')}}</button>
        </div>

        <fieldset class="ui-groupbox">
          <legend>{{t('Markers')}}</legend>
          <div class="ui-hbox" style="gap: 4px">
            <button class="ui-button" :title="t('Mark DSOs selected in list view')" @click="markSelected">{{t('Mark Selected')}}</button>
            <button class="ui-button" :title="t('Unmark stars selected in list view')" @click="unmarkSelected">{{t('Unmark Selected')}}</button>
            <button class="ui-button" :title="t('Remove all existing markers')" @click="clearMarkers">{{t('Clear Markers')}}</button>
          </div>
          <div class="ui-hbox" style="gap: 4px; margin-top: 4px; align-items: center">
            <select v-model.number="markerSymbol" class="ui-select" :title="t('Select marker symbol')">
              <option :value="NO_MARKER">{{t('None')}}</option>
              <option v-for="symbol in MARKER_SYMBOLS" :key="symbol" :value="symbol">{{ t(MARKER_SYMBOL_NAMES[symbol]) }}</option>
            </select>
            <select v-model.number="markerSize" class="ui-select" :title="t('Select marker size')">
              <option v-for="size in [3, 5, 10, 20, 50, 100, 200]" :key="size" :value="size">{{ size }}</option>
            </select>
            <input v-model="markerColor" type="color" class="ui-input" style="width: 34px; padding: 0" :title="t('Click to select marker color')" />
            <label class="ui-checkbox"><input v-model="markerLabel" type="checkbox" />{{t('Label')}}</label>
          </div>
        </fieldset>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-groupbox {
  margin: 0 6px 6px;
}
</style>
