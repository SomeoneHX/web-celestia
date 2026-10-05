<script setup lang="ts">
// The selection context menu, ported from qtselectionpopup.cpp.
//
// Qt builds the menu in its constructor from the Selection the core picked: a
// title, the object's own data, then Select / Center / Goto / Follow / Sync
// Orbit / Info, a Visible check for bodies, the Mark submenu, the reference
// marks, the alternate surfaces, the primary body and the child objects grouped
// by classification. All of it runs on the engine: a right click picks but does
// not select, so each action sets the core's selection first, exactly as the
// Qt slots do.

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { showMessage, t, tc, ui, viewport, setSimulationTime } from '@/store/app';
import {
  BodyClassification, MARKER_SYMBOLS, MARKER_SYMBOL_NAMES, type MarkerSymbol,
} from '@/core/celestia';
import { formatDistance, formatLocal } from '@/core/objectInfo';
import type { SelectedObject } from '@/wasm/celestia_core.js';

const props = defineProps<{
  x: number;
  y: number;
  /** What the engine picked for this menu. */
  picked: SelectedObject;
}>();

const emit = defineEmits<{ (event: 'close'): void; (event: 'changed'): void }>();

const view = () => viewport();

const title = computed(() => props.picked.name);

/** Qt offers Sync Orbit for anything with an orbit: not a star, not deep sky. */
const isBody = computed(() => props.picked.type === 'Body');
const offerSyncOrbit = computed(() => props.picked.type !== 'Star' && props.picked.type !== 'DeepSky');

/** The path of the body this one orbits, when the shell can tell from the path. */
const parentPath = computed(() => {
  const path = props.picked.path;
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? null : path.slice(0, cut);
});

const parentName = computed(() => parentPath.value?.slice(parentPath.value.lastIndexOf('/') + 1) ?? null);

/** The distance the engine reports, which is what Qt prints above a star. */
const starLines = computed(() => {
  if (props.picked.type !== 'Star') return [];

  const view_ = view();
  if (view_ === null) return [];

  const position = view_.engine.observerPositionLy();
  const [ox, oy, oz] = [position.get(0), position.get(1), position.get(2)];
  position.delete();

  const [x, y, z] = props.picked.positionKm;
  const distanceKm = Math.hypot(x, y, z) * 1.495978707e8;
  void [ox, oy, oz];

  const absMag = props.picked.absMag ?? 0;
  const distanceLy = distanceKm / 9.4607304725808e12;

  return [
    `Distance: ${formatDistance(distanceKm)} (${distanceLy.toFixed(3)} ly)`,
    `Abs (app) mag: ${absMag.toFixed(2)} (${(absMag + 5 * Math.log10(distanceLy / 3.2615637771674336) - 5).toFixed(2)})`,
    `Class: ${props.picked.spectralType ?? ''}`,
    `Temperature: ${Math.round(props.picked.temperature ?? 0)} K`,
  ];
});

/**
 * The reference marks, each with the state the core reports for it.
 *
 * qtselectionpopup.cpp marks every one of these checkable and sets it from
 * appCore->referenceMarkEnabled, so the menu shows which are on; they were drawn
 * as plain items here, which is why nothing was ever ticked.
 *
 * Qt also offers the direction to the frame's centre body, but only when that is
 * a body rather than a star, where it would repeat the sun direction above it.
 * The centre is the object the selection orbits in its current phase; the path's
 * parent is that for every body in the catalogue, and whether it is a star is
 * what objectType reports.
 */
const referenceMarks = computed(() => {
  const view_ = view();
  const marks: Array<{ key: string; label: string }> = [
    { key: 'body axes', label: 'Show &Body Axes' },
    { key: 'frame axes', label: 'Show &Frame Axes' },
    { key: 'sun direction', label: 'Show &Sun Direction' },
    { key: 'velocity vector', label: 'Show &Velocity Vector' },
    { key: 'spin vector', label: 'Show S&pin Vector' },
  ];

  if (parentPath.value !== null && parentName.value !== null
      && view_?.engine.objectType(parentPath.value) === 'Body') {
    // The label is the catalogue's, with its placeholder: Qt writes this one as
    // QString(_("Show &Direction to %1")).arg(name) and fills it after
    // translating, so the translation decides where the name sits.
    marks.push({ key: 'frame center direction', label: 'Show &Direction to %1' });
  }

  marks.push({ key: 'planetographic grid', label: 'Show Planetographic &Grid' });
  marks.push({ key: 'terminator', label: 'Show &Terminator' });

  return marks.map((mark) => ({
    ...mark,
    checked: view_?.engine.referenceMarkEnabled(mark.key, props.picked.path) ?? false,
  }));
});

const alternateSurfaces = ref<string[]>([]);
const isMarked = ref(false);
const visible = ref(true);

/** Qt's mnemonics are written with & and are shown underlined; the label alone. */
/**
 * A reference mark's label, with the body named where the catalogue puts it.
 *
 * Qt writes the direction entry as QString(_("Show &Direction to %1")).arg(name),
 * so the name is substituted after translation and the translation decides where
 * it sits. %%1 is left in the string until here for that reason.
 */
function referenceLabel(mark: { key: string; label: string }): string {
  const name = parentName.value ?? '';
  return plain(t(mark.label).replace('%1', name));
}

function plain(text: string): string {
  return text.replace(/&/g, '');
}

/** Qt's "Start: %1", with the date formatted the way TDBToQString formats it. */
function lifespanLine(format: string, tdb: number): string {
  return t(format).replace('%1', formatLocal(tdb));
}

/** Either line takes the simulation to its date, as the Qt slots do. */
function gotoLifespanDate(tdb: number): void {
  setSimulationTime(tdb);
  close();
}

/** A translatable label the way Qt spells it, without its mnemonic. */
function label(text: string): string {
  return plain(t(text));
}

function close(): void {
  emit('close');
}

/** Qt's children of the picked body, grouped by classification. */
const childGroups = computed(() => {
  const view_ = view();
  if (view_ === null || props.picked.path === '') return [];

  const prefix = `${props.picked.path}/`;
  const children = (view_.engine.solarSystemObjects() as Array<{ name: string; path: string; classification: number }>)
    .filter((entry) => entry.path.startsWith(prefix) && !entry.path.slice(prefix.length).includes('/'));

  const order: Array<[BodyClassification, string]> = [
    [BodyClassification.Planet, 'Planets'],
    [BodyClassification.DwarfPlanet, 'Dwarf planets'],
    [BodyClassification.Moon, 'Moons'],
    [BodyClassification.MinorMoon, 'Minor moons'],
    [BodyClassification.Asteroid, 'Asteroids'],
    [BodyClassification.Comet, 'Comets'],
    [BodyClassification.Spacecraft, 'Spacecraft'],
  ];

  return order
    .map(([classification, label]) => ({
      classification,
      // Qt titles these from the classification, which is a different set of
      // names from the browser tree's groups, and the spacecraft one is the
      // catalogue's plural form.
      label: classification === BodyClassification.Spacecraft ? tc('plural', label) : label,
      items: children.filter((child) => child.classification === classification),
    }))
    .filter((group) => group.items.length > 0);
});

onMounted(() => {
  const view_ = view();
  if (view_ !== null && props.picked.path !== '') {
    alternateSurfaces.value = view_.engine.alternateSurfaces(props.picked.path);
    isMarked.value = view_.engine.isMarked(props.picked.path);
    if (isBody.value) visible.value = view_.engine.bodyVisible(props.picked.path);
  }

  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onKeyDown);
});

/**
 * Runs an action on the object the menu was opened for.
 *
 * Qt's slots each begin by setting the core's selection, because a right click
 * picks without selecting, and then send the key that does the work.
 */
function command(action: string): void {
  const view_ = view();

  switch (action) {
    case 'select':
      view_?.engine.selectContextMenuObject();
      emit('changed');
      break;
    case 'center':
      view_?.engine.selectContextMenuObject();
      view_?.engine.charEntered('c', 0);
      showMessage(`Centered ${title.value}`, 2);
      break;
    case 'goto':
      view_?.engine.selectContextMenuObject();
      view_?.engine.charEntered('g', 0);
      showMessage(`Going to ${title.value}`, 2);
      break;
    case 'follow':
      view_?.engine.selectContextMenuObject();
      view_?.engine.charEntered('f', 0);
      showMessage(`Following ${title.value}`, 2);
      break;
    case 'sync':
      view_?.engine.selectContextMenuObject();
      view_?.engine.charEntered('y', 0);
      showMessage(`Syncing orbit with ${title.value}`, 2);
      break;
    case 'info':
      ui.showInfoBrowser = true;
      emit('changed');
      break;
    default:
      break;
  }

  close();
}

function toggleVisible(): void {
  const view_ = view();
  if (view_ === null || !isBody.value) return;
  visible.value = !visible.value;
  view_.engine.selectContextMenuObject();
  view_.engine.setBodyVisible(props.picked.path, visible.value);
  close();
}

function mark(symbol: MarkerSymbol): void {
  const view_ = view();
  if (view_ === null) return;

  view_.engine.selectContextMenuObject();
  view_.engine.markObject(props.picked.path, Number(symbol), 10, 255, 255, 0, 230,
                          MARKER_SYMBOL_NAMES[symbol]);

  // Celestia turns the marker layer on when a mark is placed.
  const flags = BigInt(view_.engine.renderFlags()) | (1n << 16n);
  view_.engine.setRenderFlags(Number(flags));
  ui.renderFlags = flags;
  showMessage(`Marked ${title.value}`, 2);
  emit('changed');
  close();
}

function unmark(): void {
  const view_ = view();
  if (view_ === null) return;
  view_.engine.selectContextMenuObject();
  view_.engine.unmarkObject(props.picked.path);
  showMessage(`Unmarked ${title.value}`, 2);
  emit('changed');
  close();
}

function toggleReferenceMark(name: string): void {
  const view_ = view();
  if (view_ === null) return;
  view_.engine.selectContextMenuObject();
  view_.engine.toggleReferenceMark(name, props.picked.path);
  close();
}

function changeSurface(name: string): void {
  const view_ = view();
  if (view_ === null) return;
  view_.engine.selectContextMenuObject();
  // An empty name is the base surface, which is what the primary entry restores.
  view_.engine.setDisplayedSurface(name);
  showMessage(name === '' ? 'Surface: normal' : `Surface: ${name}`, 2);
  close();
}

function selectPrimary(): void {
  const path = parentPath.value;
  const view_ = view();
  if (path === null || view_ === null) return;
  view_.engine.selectObject(path);
  emit('changed');
  close();
}

function selectObject(path: string): void {
  const view_ = view();
  if (view_ === null) return;
  view_.engine.selectObject(path);
  emit('changed');
  close();
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest('.ui-menu')) return;
  close();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close();
}
</script>

<template>
  <div
    class="ui-menu"
    :style="{ left: `${x}px`, top: `${y}px`, minWidth: '220px', position: 'fixed' }"
    @contextmenu.prevent
    @pointerdown.stop
    @pointerup.stop
    @click.stop
  >
    <div class="ui-menu-item" style="font-weight: 600" @pointerdown.stop="close()">
      <span class="label">{{ title }}</span>
    </div>

    <template v-if="starLines.length > 0">
      <div v-for="line in starLines" :key="line" class="ui-menu-item disabled">
        <span class="label" style="font-style: italic">{{ line }}</span>
      </div>
    </template>

    <template v-if="isBody && ((picked.lifespanBegin ?? 0) > -1.0e9 || (picked.lifespanEnd ?? 0) < 1.0e9)">
      <div class="ui-menu-separator" />

      <div
        v-if="(picked.lifespanBegin ?? 0) > -1.0e9"
        class="ui-menu-item"
        @pointerdown.stop="gotoLifespanDate(picked.lifespanBegin ?? 0)"
      >
        <span class="label">{{ lifespanLine('Start: %1', picked.lifespanBegin ?? 0) }}</span>
      </div>
      <div
        v-if="(picked.lifespanEnd ?? 0) < 1.0e9"
        class="ui-menu-item"
        @pointerdown.stop="gotoLifespanDate(picked.lifespanEnd ?? 0)"
      >
        <span class="label">{{ lifespanLine('End: %1', picked.lifespanEnd ?? 0) }}</span>
      </div>
    </template>

    <div class="ui-menu-separator" />

    <div class="ui-menu-item" @pointerdown.stop="command('select')"><span class="label">{{ label("&Select") }}</span></div>
    <div class="ui-menu-item" @pointerdown.stop="command('center')"><span class="label">{{ label("&Center") }}</span></div>
    <div class="ui-menu-item" @pointerdown.stop="command('goto')"><span class="label">{{ label("&Goto") }}</span></div>
    <div class="ui-menu-item" @pointerdown.stop="command('follow')"><span class="label">{{ label("&Follow") }}</span></div>
    <div v-if="offerSyncOrbit" class="ui-menu-item" @pointerdown.stop="command('sync')">
      <span class="label">{{ label("S&ync Orbit") }}</span>
    </div>
    <div class="ui-menu-item" @pointerdown.stop="command('info')"><span class="label">{{ label("Info") }}</span></div>

    <div v-if="isBody" class="ui-menu-item" @pointerdown.stop="toggleVisible">
      <span class="check">{{ visible ? '✓' : '' }}</span><span class="label">{{ label("Visible") }}</span>
    </div>

    <div class="ui-menu-separator" />

    <div class="ui-menu-item"><span class="label">{{ label("&Mark") }}</span><span class="arrow">▶</span>
      <div class="ui-menu ui-submenu">
        <div
          v-for="symbol in MARKER_SYMBOLS"
          :key="symbol"
          class="ui-menu-item"
          @pointerdown.stop="mark(symbol)"
        >
          <span class="label">{{ t(MARKER_SYMBOL_NAMES[symbol]) }}</span>
        </div>
      </div>
    </div>
    <div v-if="isMarked" class="ui-menu-item" @pointerdown.stop="unmark()">
      <span class="label">{{ label("&Unmark") }}</span>
    </div>

    <template v-if="isBody">
      <div class="ui-menu-separator" />

      <div class="ui-menu-item"><span class="label">{{ label("&Reference Marks") }}</span><span class="arrow">▶</span>
        <div class="ui-menu ui-submenu">
          <div
            v-for="mark in referenceMarks"
            :key="mark.key"
            class="ui-menu-item"
            @pointerdown.stop="toggleReferenceMark(mark.key)"
          >
            <span class="check">{{ mark.checked ? '✓' : '' }}</span>
            <span class="label">{{ referenceLabel(mark) }}</span>
          </div>
        </div>
      </div>

      <div v-if="alternateSurfaces.length > 0" class="ui-menu-item">
        <span class="label">{{ label("&Alternate Surfaces") }}</span><span class="arrow">▶</span>
        <div class="ui-menu ui-submenu">
          <div class="ui-menu-item" @pointerdown.stop="changeSurface('')">
            <span class="label">{{ label("Normal") }}</span>
          </div>
          <div
            v-for="surface in alternateSurfaces"
            :key="surface"
            class="ui-menu-item"
            @pointerdown.stop="changeSurface(surface)"
          >
            <span class="label">{{ surface }}</span>
          </div>
        </div>
      </div>

      <div v-if="parentPath !== null" class="ui-menu-item" @pointerdown.stop="selectPrimary()">
        <span class="label">{{ label("Select &Primary Body") }}</span>
      </div>
    </template>

    <template v-if="childGroups.length > 0">
      <div class="ui-menu-separator" />
      <div v-for="group in childGroups" :key="group.label" class="ui-menu-item">
        <span class="label">{{ label(group.label) }}</span><span class="arrow">▶</span>
        <div class="ui-menu ui-submenu">
          <div
            v-for="child in group.items"
            :key="child.path"
            class="ui-menu-item"
            @pointerdown.stop="selectObject(child.path)"
          >
            <span class="label">{{ child.name }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ui-submenu {
  display: none;
  position: absolute;
  left: 100%;
  top: -4px;
  margin-left: -4px;
  max-height: 70vh;
  overflow-y: auto;
}

.ui-menu-item:hover > .ui-submenu {
  display: block;
}

.ui-menu-item {
  position: relative;
}
</style>
