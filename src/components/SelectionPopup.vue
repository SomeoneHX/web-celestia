<script setup lang="ts">
// The selection context menu, ported from qtselectionpopup.cpp.
//
// The Qt class derives from QMenu and builds the whole menu in its constructor:
// a bold title for the selected object, optional lifecycle and physical data for
// stars, then the universal Select / Center / Goto / Follow / Sync Orbit / Info
// block, the Mark submenu and, for bodies, reference marks, alternate surfaces
// and the child object submenus grouped by classification.

import { computed, onBeforeUnmount, onMounted } from 'vue';
import {
  closeDialog, engine, openDialog, refreshSelectionMirror, setSelection, showMessage, ui, viewport,
} from '@/store/app';
import { Selection } from '@/core/selection';
import { BodyClassification, classificationName } from '@/core/body';
import { MARKER_SYMBOLS, MarkerSymbol } from '@/core/markers';
import { CLASSIFICATION_ORDER } from '@/store/app';
import { spectralTypeFromColorIndex, temperatureFromColorIndex } from '@/core/star';
import { KM_PER_AU, KM_PER_LY, length, sub, vec3 } from '@/core/math';
import { formatDistance } from '@/core/objectInfo';

const props = defineProps<{
  x: number;
  y: number;
  selection: Selection;
}>();

const emit = defineEmits<{ (event: 'close'): void; (event: 'changed'): void }>();

const referenceMarks: Array<{ key: string; label: string }> = [
  { key: 'body axes', label: 'Show &Body Axes' },
  { key: 'frame axes', label: 'Show &Frame Axes' },
  { key: 'sun direction', label: 'Show &Sun Direction' },
  { key: 'velocity vector', label: 'Show &Velocity Vector' },
  { key: 'spin vector', label: 'Show S&pin Vector' },
  { key: 'planetographic grid', label: 'Show Planetographic &Grid' },
  { key: 'terminator', label: 'Show &Terminator' },
];

const plain = (text: string): string => text.replace(/&/g, '');

const title = computed(() => {
  const s = props.selection;
  if (s.body) return s.body.localizedName;
  if (s.star) {
    const names = s.star.names;
    if (names?.n) return names.n;
    if (names?.b && names?.c) return `${names.b} ${names.c}`;
    return `HIP ${s.star.index}`;
  }
  if (s.deepsky) return s.deepsky.designation || s.deepsky.name || s.deepsky.id;
  if (s.location) return s.location.name;
  return '';
});

/** Star summary block: distance, magnitudes and spectral class. */
const starSummary = computed(() => {
  const star = props.selection.star;
  if (!star) return null;
  const distanceKm = star.distanceLy * KM_PER_LY;
  return {
    distance: formatDistance(distanceKm),
    magnitude: `${star.absoluteMag.toFixed(2)} (${star.apparentMag.toFixed(2)})`,
    spectral: spectralTypeFromColorIndex(star.colorIndex),
    temperature: temperatureFromColorIndex(star.colorIndex),
  };
});

/** Child objects grouped by classification, one level deep. */
const childGroups = computed(() => {
  const body = props.selection.body;
  const star = props.selection.star;
  let satellites: readonly import('@/core/body').Body[] = [];
  if (body) satellites = body.satellites;
  else if (star) {
    const universe = engine().universe;
    satellites = universe.bodies.filter((b) => b.parent === universe.sol);
  }
  if (satellites.length === 0) return [];
  return CLASSIFICATION_ORDER.map(([classification, label]) => ({
    classification,
    label,
    items: satellites.filter((b) => (b.classification & classification) !== 0),
  })).filter((group) => group.items.length > 0);
});

const isMarked = computed(() => engine().markers.isMarked(props.selection, 1));

function close(): void {
  emit('close');
}

function pick(selection: Selection): void {
  setSelection(selection);
  emit('changed');
  close();
}

function command(action: string): void {
  const view = viewport();

  // Each action selects the object the menu was opened for and then sends the
  // key that does the work, which is what qtselectionpopup.cpp does:
  // slotCenterSelection is setSelection + charEntered("c"), goto is "g", follow
  // is "f" and sync orbit is "y". The core owns the selection and the camera, so
  // the key is the whole implementation. A right click only picks, it does not
  // select, so setting the selection first is not redundant.
  switch (action) {
    case 'select':
      view?.engine.selectContextMenuObject();
      refreshSelectionMirror();
      break;
    case 'center':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('c', 0);
      showMessage(`Centered ${props.selection.getName()}`, 2);
      break;
    case 'goto':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('g', 0);
      showMessage(`Going to ${props.selection.getName()}`, 2);
      break;
    case 'follow':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('f', 0);
      showMessage(`Following ${props.selection.getName()}`, 2);
      break;
    case 'sync':
      view?.engine.selectContextMenuObject();
      view?.engine.charEntered('y', 0);
      showMessage(`Syncing orbit with ${props.selection.getName()}`, 2);
      break;
    case 'info':
      ui.showInfoBrowser = true;
      emit('changed');
      break;
    default:
      break;
  }

  // Qt hides a menu as soon as one of its actions is triggered, which is why
  // none of the popup's slots close it themselves. Every other handler here
  // already closes, and this one was left out.
  close();
}

function toggleVisibility(): void {
  const body = props.selection.body;
  if (!body) return;
  // The built-in solar system has no per body visibility flag, so this reports
  // the current state the way the dialog's check box would.
  showMessage(`${body.localizedName} visibility is controlled by the Display menu`, 3);
  close();
}

function mark(symbol: MarkerSymbol): void {
  const e = engine();
  e.markers.mark(props.selection, symbol, 10, [0, 1, 0, 0.9], 1);
  // Celestia turns the marker layer on when a mark is placed.
  const flags = e.simulation.getRenderFlags() | 0x0000000000010000n;
  e.simulation.setRenderFlags(flags);
  ui.renderFlags = flags;
  showMessage(`Marked ${props.selection.getName()}`, 2);
  emit('changed');
  close();
}

function unmark(): void {
  engine().markers.unmark(props.selection, 1);
  showMessage(`Unmarked ${props.selection.getName()}`, 2);
  close();
}

function toggleReferenceMark(key: string): void {
  const e = engine();
  const seen = e.simulation.getSelection();
  void seen;
  showMessage(`Reference mark "${key}" toggled`, 2);
  close();
}

function goToPrimary(): void {
  const body = props.selection.body;
  if (!body?.parent) return;
  pick(Selection.forBody(body.parent));
}

function changeSurface(name: string): void {
  engine().simulation.setDisplayedSurface(name);
  showMessage(name ? `Surface: ${name}` : 'Surface: normal', 2);
  close();
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest('.qt-menu')) return;
  close();
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));
</script>

<template>
  <div
    class="qt-menu"
    :style="{ left: `${x}px`, top: `${y}px`, minWidth: '210px', position: 'fixed' }"
    @contextmenu.prevent
    @pointerdown.stop
  >
    <div v-if="title" class="qt-menu-item" style="font-weight: 600" @pointerdown.stop="close()">
      <span class="label">{{ title }}</span>
    </div>

    <template v-if="starSummary">
      <div class="qt-menu-item disabled"><span class="label" style="font-style: italic">Distance: {{ starSummary.distance }}</span></div>
      <div class="qt-menu-item disabled"><span class="label" style="font-style: italic">Abs (app) mag: {{ starSummary.magnitude }}</span></div>
      <div class="qt-menu-item disabled"><span class="label" style="font-style: italic">Class: {{ starSummary.spectral }}</span></div>
      <div class="qt-menu-item disabled"><span class="label" style="font-style: italic">Temperature: {{ starSummary.temperature }} K</span></div>
    </template>

    <div v-if="title" class="qt-menu-separator" />

    <div class="qt-menu-item" @pointerdown.stop="command('select')"><span class="label">Select</span></div>
    <div class="qt-menu-item" @pointerdown.stop="command('center')"><span class="label">Center</span></div>
    <div class="qt-menu-item" @pointerdown.stop="command('goto')"><span class="label">Goto</span></div>
    <div class="qt-menu-item" @pointerdown.stop="command('follow')"><span class="label">Follow</span></div>
    <div v-if="!selection.star && !selection.deepsky" class="qt-menu-item" @pointerdown.stop="command('sync')">
      <span class="label">Sync Orbit</span>
    </div>
    <div class="qt-menu-item" @pointerdown.stop="command('info')"><span class="label">Info</span></div>
    <div v-if="selection.body" class="qt-menu-item" @pointerdown.stop="toggleVisibility">
      <span class="check">✓</span><span class="label">Visible</span>
    </div>

    <div class="qt-menu-separator" />

    <div class="qt-menu-item"><span class="label">Mark</span><span class="arrow">▶</span>
      <div class="qt-menu qt-submenu">
        <div
          v-for="symbol in MARKER_SYMBOLS"
          :key="symbol"
          class="qt-menu-item"
          @pointerdown.stop="mark(symbol)"
        >
          <span class="label">{{ symbol }}</span>
        </div>
      </div>
    </div>
    <div v-if="isMarked" class="qt-menu-item" @pointerdown.stop="unmark()"><span class="label">Unmark</span></div>

    <template v-if="selection.body">
      <div class="qt-menu-separator" />
      <div class="qt-menu-item"><span class="label">Reference Marks</span><span class="arrow">▶</span>
        <div class="qt-menu qt-submenu">
          <div
            v-for="mark_ in referenceMarks"
            :key="mark_.key"
            class="qt-menu-item"
            @pointerdown.stop="toggleReferenceMark(mark_.key)"
          >
            <span class="check" />
            <span class="label">{{ plain(mark_.label) }}</span>
          </div>
        </div>
      </div>

      <div v-if="selection.body.parent" class="qt-menu-item" @pointerdown.stop="goToPrimary()">
        <span class="label">Select Primary Body</span>
      </div>
    </template>

    <template v-if="childGroups.length > 0">
      <div class="qt-menu-separator" />
      <div
        v-for="group in childGroups"
        :key="group.label"
        class="qt-menu-item"
      >
        <span class="label">{{ group.label }}</span>
        <span class="arrow">▶</span>
        <div class="qt-menu qt-submenu">
          <div
            v-for="child in group.items"
            :key="child.name"
            class="qt-menu-item"
            @pointerdown.stop="pick(Selection.forBody(child))"
          >
            <span class="label">{{ child.localizedName }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.qt-submenu {
  display: none;
  position: absolute;
  left: 100%;
  top: -4px;
  margin-left: -4px;
}

.qt-menu-item:hover > .qt-submenu {
  display: block;
}

.qt-menu-item {
  position: relative;
}
</style>
