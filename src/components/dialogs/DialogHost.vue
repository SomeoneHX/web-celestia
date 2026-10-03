<script setup lang="ts">
// Host for every modal dialog of the shell.
//
// The small dialogs are defined inline because they are single-purpose forms;
// Set Time and Preferences are separate components because of their size.

import { computed, ref } from 'vue';
import SetTimeDialog from './SetTimeDialog.vue';
import PreferencesDialog from './PreferencesDialog.vue';
import {
  bookmarks, closeDialog, engine, nextBookmarkId, openDialog, refreshSelectionMirror,
  setSelection, showMessage, ui, viewport,
} from '@/store/app';
import { Selection } from '@/core/selection';
import { vec3 } from '@/core/math';
import type { BookmarkFolder, BookmarkNode } from '@/store/app';

const gotoTarget = ref('');
const gotoTargetValid = ref(false);
const gotoLatitude = ref('');
const gotoLongitude = ref('');
const gotoDistance = ref('');
const gotoUnit = ref<'km' | 'radii' | 'au'>('radii');

const bookmarkName = ref('');
const bookmarkFolder = ref('');
const bookmarkTimeSource = ref(0);
const newFolderName = ref('New Folder');
const newFolderDescription = ref('');
const newFolderParent = ref('');
const tourIndex = ref(0);
const customFps = ref('60');

// ---------------------------------------------------------------- helpers

const engineRef = () => engine();

function onGotoNameChanged(): void {
  const selection = engineRef().universe.findObjectFromPath(gotoTarget.value, true);
  gotoTargetValid.value = selection !== null;
  if (selection?.body) {
    const radius = selection.body.radius;
    gotoDistance.value = (radius * 5).toFixed(1);
    gotoLatitude.value = '';
    gotoLongitude.value = '';
    gotoUnit.value = 'radii';
  } else if (selection) {
    gotoDistance.value = '0';
  }
}

function applyGoto(): void {
  const universe = engineRef().universe;
  const selection = universe.findObjectFromPath(gotoTarget.value, true);
  if (!selection) return;
  setSelection(selection);
  const observer = engineRef().observer;
  let distance = Number(gotoDistance.value);
  if (!Number.isFinite(distance)) distance = selection.radius * 5;
  if (gotoUnit.value === 'au') distance *= 149597870.7;
  if (gotoUnit.value === 'radii') distance *= Math.max(selection.radius, 1);
  else distance += selection.radius;

  const latitude = Number(gotoLatitude.value);
  const longitude = Number(gotoLongitude.value);
  if (Number.isFinite(latitude) && Number.isFinite(longitude) && (gotoLatitude.value !== '' || gotoLongitude.value !== '')) {
    observer.gotoSelectionLongLat(
      distance,
      (longitude * Math.PI) / 180,
      (latitude * Math.PI) / 180,
      vec3(0, 0, 1),
      1.2,
    );
  } else {
    observer.gotoSelection(distance, vec3(0, 0, 1), 1.2);
  }
  closeDialog();
  showMessage(`Going to ${selection.getName()}`, 2);
}

function addBookmark(): void {
  const universe = engineRef().universe;
  const selection = engineRef().simulation.getSelection();
  const name = bookmarkName.value || selection.getName() || 'Bookmark';
  const url = `cel://Follow/${selection.body ? `Sol:${selection.body.name}` : ''}?time=${engineRef().simulation.getTime()}`;
  const target = bookmarks.menu.find((f) => f.id === bookmarkFolder.value) ?? bookmarks.menu[0];
  target.children.push({
    kind: 'bookmark',
    id: nextBookmarkId(),
    title: name,
    description: `Added from ${selection.getName() || 'the current view'}`,
    url,
  });
  void universe;
  closeDialog();
  showMessage(`Added bookmark "${name}"`, 2);
}

function addFolder(): void {
  const target = bookmarks.menu.find((f) => f.id === newFolderParent.value) ?? bookmarks.menu[0];
  const folder: BookmarkFolder = {
    id: nextBookmarkId(),
    title: newFolderName.value || 'New Folder',
    description: newFolderDescription.value,
    folded: true,
    children: [],
  };
  target.children.push({ kind: 'folder', folder });
  closeDialog();
}

function nodeId(child: BookmarkNode): string {
  return child.kind === 'folder' ? child.folder.id : child.id;
}

function removeBookmarkNode(folder: BookmarkFolder, id: string): void {
  const index = folder.children.findIndex((child) => nodeId(child) === id);
  if (index >= 0) folder.children.splice(index, 1);
}

function newSeparator(): void {
  bookmarks.menu[0].children.push({ kind: 'separator', id: nextBookmarkId() });
  showMessage('Separator added to the bookmark menu', 2);
}

function applyCustomFps(): void {
  const value = Math.max(1, Math.min(480, Number(customFps.value) || 60));
  engineRef().simulation.fps = value;
  ui.fps = value;
  closeDialog();
}

function seedBookmarkDefaults(): void {
  bookmarkName.value = engineRef().simulation.getSelection().getName() || 'Bookmark';
  bookmarkFolder.value = bookmarks.menu[0]?.id ?? '';
  newFolderParent.value = bookmarks.menu[0]?.id ?? '';
}

function openWithDefaults(name: string): void {
  if (name === 'add-bookmark') seedBookmarkDefaults();
  if (name === 'goto-object') {
    gotoTarget.value = engineRef().simulation.getSelection().getName();
    onGotoNameChanged();
  }
  openDialog(name);
}

const destinations = computed(() => [
  { name: 'Earth', target: 'Sol/Earth', description: 'The third planet from the Sun, and the only world known to carry life. Its atmosphere, oceans and 23.4° axial tilt set the stage for the seasons.' },
  { name: 'Moon', target: 'Sol/Earth/Moon', description: 'Earth\'s only natural satellite. Tidally locked, so the same face always points at Earth, and scarred by the heavy bombardment of the early solar system.' },
  { name: 'Mars', target: 'Sol/Mars', description: 'The fourth planet, home to Olympus Mons and the Valles Marineris canyon system. Its thin carbon dioxide atmosphere still supports planet wide dust storms.' },
  { name: 'Jupiter', target: 'Sol/Jupiter', description: 'The largest planet, with a mass two and a half times that of every other planet combined and a Great Red Spot that has been observed for centuries.' },
  { name: 'Saturn', target: 'Sol/Saturn', description: 'Encircled by a ring system of ice and rock particles barely tens of metres thick and spanning 280000 kilometres.' },
  { name: 'Titan', target: 'Sol/Saturn/Titan', description: 'The only moon with a dense atmosphere, and the only world other than Earth with stable surface liquids: lakes and seas of methane.' },
  { name: 'Uranus', target: 'Sol/Uranus', description: 'An ice giant tipped over by 98°, so it rolls around the Sun on its side.' },
  { name: 'Neptune', target: 'Sol/Neptune', description: 'The outermost planet, with the fastest winds in the solar system at over 2000 kilometres per hour.' },
  { name: 'Pluto', target: 'Sol/Pluto', description: 'A dwarf planet in the Kuiper Belt, visited by New Horizons in 2015, with a nitrogen ice plain the size of Texas.' },
]);

function tourGoTo(): void {
  const destination = destinations.value[tourIndex.value];
  if (!destination) return;
  const selection = engineRef().universe.findObjectFromPath(destination.target, true);
  if (!selection) return;
  setSelection(selection);
  engineRef().observer.gotoSelection(Math.max(selection.radius * 5, 1), vec3(0, 0, 1), 1.5);
  refreshSelectionMirror();
  closeDialog();
}

function openHelpGuide(): void {
  window.open('https://celestiaproject.space/', '_blank', 'noopener');
  closeDialog();
}

// Read from the renderer itself, which is what the Qt dialog shows.
const glInfo = computed(() => viewport()?.engine.rendererInfo() ?? {});
</script>

<template>
  <!-- ------------------------------------------------------------ Set Time -->
  <SetTimeDialog v-if="ui.openDialog === 'set-time'" @close="closeDialog" />

  <!-- -------------------------------------------------------- Preferences -->
  <PreferencesDialog v-if="ui.openDialog === 'preferences'" @close="closeDialog" />

  <!-- -------------------------------------------------------- Goto Object -->
  <div v-if="ui.openDialog === 'goto-object'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 360px">
      <div class="qt-dialog-titlebar">
        <span>Goto Object</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <div class="qt-form-row">
          <span class="qt-label">Object name:</span>
          <input v-model="gotoTarget" class="qt-input" @input="onGotoNameChanged" />
        </div>
        <div class="qt-form-row">
          <span class="qt-label">Latitude:</span>
          <input v-model="gotoLatitude" class="qt-input" placeholder="degrees" />
        </div>
        <div class="qt-form-row">
          <span class="qt-label">Longitude:</span>
          <input v-model="gotoLongitude" class="qt-input" placeholder="degrees" />
        </div>
        <div class="qt-form-row">
          <span class="qt-label">Distance:</span>
          <input v-model="gotoDistance" class="qt-input" />
        </div>
        <div class="qt-hbox" style="margin-top: 6px">
          <label class="qt-radio"><input v-model="gotoUnit" type="radio" value="km" />km</label>
          <label class="qt-radio"><input v-model="gotoUnit" type="radio" value="radii" />radii</label>
          <label class="qt-radio"><input v-model="gotoUnit" type="radio" value="au" />au</label>
        </div>
        <div v-if="gotoTarget && !gotoTargetValid" class="qt-muted" style="margin-top: 8px; color: #a33">
          No object matches that name.
        </div>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Cancel</button>
        <button class="qt-button default" :disabled="!gotoTargetValid" @click="applyGoto">Ok</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------- Add Bookmark -->
  <div v-if="ui.openDialog === 'add-bookmark'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 380px">
      <div class="qt-dialog-titlebar">
        <span>Bookmark Location</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <div class="qt-form-row" style="--qt-form-label-width: 96px">
          <span class="qt-label">Bookmark name:</span>
          <input v-model="bookmarkName" class="qt-input" />
        </div>
        <div class="qt-form-row" style="--qt-form-label-width: 96px">
          <span class="qt-label">Create in:</span>
          <select v-model="bookmarkFolder" class="qt-select">
            <option v-for="folder in bookmarks.menu" :key="folder.id" :value="folder.id">{{ folder.title }}</option>
          </select>
        </div>
        <div class="qt-form-row" style="--qt-form-label-width: 96px">
          <span class="qt-label">Time source:</span>
          <select v-model.number="bookmarkTimeSource" class="qt-select">
            <option :value="0">Current simulation time</option>
            <option :value="1">Simulation time at activation</option>
            <option :value="2">System time at activation</option>
          </select>
        </div>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Cancel</button>
        <button class="qt-button default" @click="addBookmark">Ok</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------------- New Folder -->
  <div v-if="ui.openDialog === 'new-bookmark-folder'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 420px">
      <div class="qt-dialog-titlebar">
        <span>New Folder</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <div class="qt-form-row" style="--qt-form-label-width: 84px">
          <span class="qt-label">Name:</span>
          <input v-model="newFolderName" class="qt-input" />
        </div>
        <div class="qt-form-row" style="--qt-form-label-width: 84px; align-items: start">
          <span class="qt-label">Description:</span>
          <textarea v-model="newFolderDescription" class="qt-input" style="height: 64px; padding: 4px 6px" />
        </div>
        <div class="qt-form-row" style="--qt-form-label-width: 84px">
          <span class="qt-label">Create in:</span>
          <select v-model="newFolderParent" class="qt-select">
            <option v-for="folder in bookmarks.menu" :key="folder.id" :value="folder.id">{{ folder.title }}</option>
          </select>
        </div>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Cancel</button>
        <button class="qt-button default" @click="addFolder">Ok</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------- Organize Bookmarks -->
  <div v-if="ui.openDialog === 'organize-bookmarks'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 580px; height: 470px">
      <div class="qt-dialog-titlebar">
        <span>Organize Bookmarks</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body" style="display: flex; flex-direction: column">
        <div style="flex: 1 1 auto; overflow: auto; border: 1px solid var(--qt-border-light); background: #fff">
          <div v-for="folder in bookmarks.menu" :key="folder.id">
            <div class="qt-tree-row" style="font-weight: 600">
              <span class="twisty">{{ folder.folded ? '▶' : '▼' }}</span>
              <span class="cell">{{ folder.title }}</span>
            </div>
            <template v-if="!folder.folded">
              <div v-for="child in folder.children" :key="nodeId(child)" class="qt-tree-row" style="padding-left: 26px">
                <span class="twisty" />
                <span class="cell">
                  <template v-if="child.kind === 'folder'">📁 {{ child.folder.title }}</template>
                  <template v-else-if="child.kind === 'separator'">――― separator ―――</template>
                  <template v-else>{{ child.title }}</template>
                </span>
                <span class="spacer" />
                <button class="qt-button" style="min-width: 0; height: 16px; padding: 0 6px" @click="removeBookmarkNode(folder, nodeId(child))">Remove</button>
              </div>
            </template>
          </div>
        </div>
        <div class="qt-hbox" style="margin-top: 8px">
          <button class="qt-button" @click="openWithDefaults('new-bookmark-folder')">New Folder</button>
          <button class="qt-button" @click="newSeparator">New Separator</button>
          <span class="qt-spacer" />
          <button class="qt-button" @click="closeDialog">Close</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ----------------------------------------------------------- Tour Guide -->
  <div v-if="ui.openDialog === 'tour-guide'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 470px">
      <div class="qt-dialog-titlebar">
        <span>Tour Guide</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <div class="qt-hbox">
          <span class="qt-label">Select your destination:</span>
          <select v-model.number="tourIndex" class="qt-select qt-grow">
            <option v-for="(destination, index) in destinations" :key="destination.name" :value="index">{{ destination.name }}</option>
          </select>
          <button class="qt-button" @click="tourGoTo">Go To</button>
        </div>
        <p style="margin-top: 12px; line-height: 1.5">{{ destinations[tourIndex]?.description }}</p>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Close</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------- OpenGL Info -->
  <div v-if="ui.openDialog === 'gl-info'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 520px">
      <div class="qt-dialog-titlebar">
        <span>Renderer Info</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <table class="qt-table">
          <tbody>
            <tr v-for="(value, key) in glInfo" :key="key">
              <td style="width: 42%">{{ key }}</td>
              <td>{{ value }}</td>
            </tr>
            <tr>
              <td>Rendered bodies</td>
              <td>{{ ui.bodyCount }}</td>
            </tr>
            <tr>
              <td>Catalogue stars</td>
              <td>{{ ui.starCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Close</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------------- About -->
  <div v-if="ui.openDialog === 'about'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 470px">
      <div class="qt-dialog-titlebar">
        <span>About Celestia</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body" style="text-align: center">
        <h2 style="margin: 6px 0 2px">Celestia</h2>
        <div class="qt-muted">Web port, version 0.1.0</div>
        <p style="margin: 14px 0; line-height: 1.55; text-align: left">
          A real time 3D space simulation. This build ports the Celestia 1.7.0 Qt shell to Vue 3,
          renders the scene with a WebGL 2 pipeline built from the original GLSL stages, and runs the
          time system and ephemeris in a WebAssembly module compiled from the C++ sources
          (celastro/date.cpp, celastro/astro.cpp and celephem/vsop87.cpp).
        </p>
        <p class="qt-muted" style="font-size: 11px; line-height: 1.5; text-align: left">
          Star, deep sky, constellation and boundary data derive from the Hipparcos and Yale bright
          star catalogues as distributed with d3-celestial. Planet textures are generated procedurally
          because the Celestia data package is not part of the source tree.
        </p>
        <p class="qt-muted" style="font-size: 11px">Copyright (C) 2001-2023, Celestia Development Team. GNU GPL v2 or later.</p>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button default" @click="closeDialog">Close</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------------- Open Script -->
  <div v-if="ui.openDialog === 'open-script'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 520px">
      <div class="qt-dialog-titlebar">
        <span>Open Script</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <p style="margin-top: 0">
          Celestia scripts are CEL or Lua programs that drive the simulation. The web build accepts a
          script as a text paste; the interpreter for the CEL subset is not compiled into this build.
        </p>
        <textarea
          class="qt-input"
          style="width: 100%; height: 150px; padding: 6px; font-family: var(--qt-mono); font-size: 11px"
          placeholder="select { object &quot;Sol/Earth&quot; }&#10;follow {}&#10;goto { time 3.0 distance 3.5 }"
        />
        <div class="qt-muted" style="margin-top: 8px">
          Scripts found in the data directory: {{ ui.scripts.length }}
        </div>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Cancel</button>
        <button class="qt-button default" disabled>Run</button>
      </div>
    </div>
  </div>

  <!-- ----------------------------------------------------- Celestia Guide -->
  <div v-if="ui.openDialog === 'help-guide'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 520px">
      <div class="qt-dialog-titlebar">
        <span>Celestia Guide</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body" style="line-height: 1.6">
        <h3 style="margin-top: 0">Mouse</h3>
        <table class="qt-table">
          <tbody>
            <tr><td style="width: 46%">Left drag</td><td>Orient camera</td></tr>
            <tr><td>Right drag</td><td>Orbit selected object</td></tr>
            <tr><td>Left + right drag sideways</td><td>Roll view</td></tr>
            <tr><td>Left + right drag vertically</td><td>Adjust distance to selection</td></tr>
            <tr><td>Wheel</td><td>Adjust distance to selection</td></tr>
            <tr><td>Ctrl + left drag</td><td>Adjust distance to selection</td></tr>
            <tr><td>Shift + left drag</td><td>Change field of view</td></tr>
            <tr><td>Middle button</td><td>Toggle between 45° and the previous FOV</td></tr>
            <tr><td>Left click on object</td><td>Select object</td></tr>
            <tr><td>Left click on empty space</td><td>Cancel selection</td></tr>
            <tr><td>Left double click</td><td>Select and centre</td></tr>
            <tr><td>Right click</td><td>Context menu</td></tr>
          </tbody>
        </table>
        <h3>Keyboard</h3>
        <table class="qt-table">
          <tbody>
            <tr><td style="width: 46%">1 – 9</td><td>Select a planet around the nearest star</td></tr>
            <tr><td>0</td><td>Select the parent body</td></tr>
            <tr><td>H</td><td>Select Sol</td></tr>
            <tr><td>C</td><td>Centre on selected object</td></tr>
            <tr><td>G</td><td>Goto selected object</td></tr>
            <tr><td>F</td><td>Follow selected object</td></tr>
            <tr><td>T</td><td>Track selected object</td></tr>
            <tr><td>Y</td><td>Sync orbit with the selected object</td></tr>
            <tr><td>: / "</td><td>Lock / chase the selected object</td></tr>
            <tr><td>Home / End</td><td>Move closer / further away</td></tr>
            <tr><td>*</td><td>Look back</td></tr>
            <tr><td>Esc</td><td>Cancel motion</td></tr>
            <tr><td>Space</td><td>Pause or resume time</td></tr>
            <tr><td>K / L</td><td>Time 10× faster / slower</td></tr>
            <tr><td>- / +</td><td>Time 2× slower / faster</td></tr>
            <tr><td>J</td><td>Reverse time</td></tr>
            <tr><td>[ / ]</td><td>Fewer / more stars visible</td></tr>
            <tr><td>, / .</td><td>Narrower / wider field of view</td></tr>
            <tr><td>Backspace</td><td>Select the parent, or clear the selection</td></tr>
          </tbody>
        </table>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="openHelpGuide">Open the Celestia website</button>
        <button class="qt-button default" @click="closeDialog">Close</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------------- Custom FPS -->
  <div v-if="ui.openDialog === 'fps-custom'" class="qt-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="qt-dialog" style="width: 300px">
      <div class="qt-dialog-titlebar">
        <span>Frame rate</span>
        <span class="spacer" />
        <button class="qt-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="qt-dialog-body">
        <div class="qt-form-row" style="--qt-form-label-width: 90px">
          <span class="qt-label">Target FPS:</span>
          <input v-model="customFps" type="number" class="qt-input" min="1" max="480" />
        </div>
      </div>
      <div class="qt-dialog-buttons">
        <button class="qt-button" @click="closeDialog">Cancel</button>
        <button class="qt-button default" @click="applyCustomFps">Ok</button>
      </div>
    </div>
  </div>
</template>
