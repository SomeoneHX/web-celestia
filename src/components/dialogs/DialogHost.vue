<script setup lang="ts">
// Host for every modal dialog of the shell.
//
// The small dialogs are defined inline because they are single-purpose forms;
// Set Time and Preferences are separate components because of their size.

import { computed, ref, watch } from 'vue';
import AboutDialog from './AboutDialog.vue';
import SetTimeDialog from './SetTimeDialog.vue';
import PreferencesDialog from './PreferencesDialog.vue';
import {
  bookmarks, closeDialog, nextBookmarkId, openDialog, refreshSelectionMirror,
  showMessage, t, ui, viewport,
} from '@/store/app';
import {
  CAPTURE_CODECS, CAPTURE_DEFAULT_BITRATE, CAPTURE_FRAME_RATES, CAPTURE_SIZES, startCapture,
} from '@/core/videoCapture';
import { vec3 } from '@/core/math';
import type { BookmarkFolder, BookmarkNode } from '@/store/app';

/**
 * What the module was built from, for the About dialog. The Qt front end's About
 * box reports the same things -- the commit, the word size, the compiler -- so
 * this reports the web build's equivalents.
 */
const about = computed(() => {
  const info = viewport()?.module.buildInfo();
  return info ?? { version: '', commit: '', toolchain: '', wordSize: 0, glVersion: '' };
});

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

// The Capture Video dialog's fields, held as indices into the lists the Qt
// dialog offers. Qt builds it fresh every time it is opened, so the first entry
// stands until the dialog is used; the watcher below puts them back.
const captureSize = ref(0);
const captureFrameRate = ref(0);
const captureCodec = ref(0);
const captureBitrate = ref(String(CAPTURE_DEFAULT_BITRATE));

watch(() => ui.openDialog, (name) => {
  if (name !== 'capture-video') return;
  captureSize.value = 0;
  captureFrameRate.value = 0;
  captureCodec.value = 0;
  captureBitrate.value = String(CAPTURE_DEFAULT_BITRATE);
});

// ---------------------------------------------------------------- helpers


function onGotoNameChanged(): void {
  // The engine resolves the path and knows the object's radius, which the
  // dialog seeds its distance field from.
  const view = viewport();
  const path = gotoTarget.value.trim();
  const exists = view !== null && path !== '' && view.engine.objectExists(path);
  gotoTargetValid.value = exists;
  if (exists && view !== null) {
    const radius = view.engine.objectRadiusKm(path);
    if (radius > 0) {
      gotoDistance.value = (radius * 5).toFixed(1);
      gotoLatitude.value = '';
      gotoLongitude.value = '';
      gotoUnit.value = 'radii';
    } else {
      gotoDistance.value = '0';
    }
  }
}

function applyGoto(): void {
  const view = viewport();
  const path = gotoTarget.value.trim();
  if (view === null || path === '' || !view.engine.objectExists(path)) return;

  const radius = view.engine.objectRadiusKm(path);
  let distance = Number(gotoDistance.value);
  if (!Number.isFinite(distance)) distance = radius * 5;
  if (gotoUnit.value === 'au') distance *= 149597870.7;
  else if (gotoUnit.value === 'radii') distance *= Math.max(radius, 1);
  else distance += radius;

  // The engine travels and faces the body; the latitude and longitude fields
  // put the observer above a point on it.
  const latitude = Number(gotoLatitude.value);
  const longitude = Number(gotoLongitude.value);
  const hasPosition = Number.isFinite(latitude) && Number.isFinite(longitude)
    && (gotoLatitude.value !== '' || gotoLongitude.value !== '');

  if (hasPosition) {
    view.engine.gotoObjectLongLat(path, distance, (longitude * Math.PI) / 180, (latitude * Math.PI) / 180);
  } else {
    view.engine.gotoObject(path, distance);
  }

  closeDialog();
  showMessage(`Going to ${path}`, 2);
}

/**
 * Runs a script the engine can find by name, which is how the scripts directory
 * is offered: the path is the engine's own.
 */
function runNamedScript(path: string): void {
  if (!viewport()?.engine.runScript(path)) {
    showMessage(`Could not run ${path}`, 3);
    return;
  }
  showMessage(`Running ${path}`, 2);
  closeDialog();
}

/**
 * Runs a script the user picked. Celestia opens a file chooser and calls
 * runScript on what it returns; here the file is put into the engine's file
 * system under the working directory, which is what its own paths resolve from.
 */
async function onScriptFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const text = await file.text();
  const module = viewport()?.module;
  if (module === undefined) return;

  const path = `/${file.name.replace(/[^\w.-]/g, '_')}`;
  module.FS.writeFile(path, text);
  viewport()?.engine.runScript(path);
  showMessage(`Running ${file.name}`, 2);
  closeDialog();
}

function addBookmark(): void {
  // The engine owns the selection, so the bookmark names what it has selected.
  const picked = viewport()?.engine.selectedObject() ?? null;
  const name = bookmarkName.value || picked?.name || 'Bookmark';
  const url = `cel://Follow/${picked?.path ? picked.path.replace(/\//g, ':') : ''}?time=${viewport()?.engine.getTime() ?? 0}`;
  const target = bookmarks.menu.find((f) => f.id === bookmarkFolder.value) ?? bookmarks.menu[0];
  target.children.push({
    kind: 'bookmark',
    id: nextBookmarkId(),
    title: name,
    description: `Added from ${picked?.name || 'the current view'}`,
    url,
  });
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
  ui.fps = value;
  ui.fps = value;
  closeDialog();
}

/**
 * The Qt field carries the input mask D000000000: digits only, nine of them.
 *
 * A typed character is refused before it lands, which is what a mask does, and
 * anything that arrives another way -- a paste -- is trimmed afterwards.
 */
function onBitrateBeforeInput(event: InputEvent): void {
  if (event.data !== null && /\D/.test(event.data)) event.preventDefault();
}

function onBitrateInput(event: Event): void {
  captureBitrate.value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 9);
}

/**
 * Starts the recording, which is what the Qt dialog's Ok does once the file and
 * the settings have both been given.
 */
function applyCaptureSettings(): void {
  const [width, height] = CAPTURE_SIZES[captureSize.value] ?? CAPTURE_SIZES[0];
  const bitRate = Number(captureBitrate.value);
  startCapture({
    width,
    height,
    frameRate: CAPTURE_FRAME_RATES[captureFrameRate.value] ?? CAPTURE_FRAME_RATES[0],
    mimeType: CAPTURE_CODECS[captureCodec.value]?.mimeType ?? '',
    bitRate: Number.isFinite(bitRate) && bitRate > 0 ? bitRate : CAPTURE_DEFAULT_BITRATE,
  });
  closeDialog();
}

function seedBookmarkDefaults(): void {
  bookmarkName.value = viewport()?.engine.selectedObject()?.name || 'Bookmark';
  bookmarkFolder.value = bookmarks.menu[0]?.id ?? '';
  newFolderParent.value = bookmarks.menu[0]?.id ?? '';
}

function openWithDefaults(name: string): void {
  if (name === 'add-bookmark') seedBookmarkDefaults();
  if (name === 'goto-object') {
    gotoTarget.value = viewport()?.engine.selectedObject()?.name ?? '';
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
  const view = viewport();
  if (view === null || !view.engine.objectExists(destination.target)) return;
  // Selecting the destination and sending Goto is what the Qt tour does.
  view.engine.selectObject(destination.target);
  view.engine.charEntered('g', 0);
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
  <div v-if="ui.openDialog === 'goto-object'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 360px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Goto Object')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-form-row">
          <span class="ui-label">{{t('Object name:')}}</span>
          <input v-model="gotoTarget" class="ui-input" @input="onGotoNameChanged" />
        </div>
        <div class="ui-form-row">
          <span class="ui-label">{{t('Latitude:')}}</span>
          <input v-model="gotoLatitude" class="ui-input" placeholder="degrees" />
        </div>
        <div class="ui-form-row">
          <span class="ui-label">{{t('Longitude:')}}</span>
          <input v-model="gotoLongitude" class="ui-input" placeholder="degrees" />
        </div>
        <div class="ui-form-row">
          <span class="ui-label">{{t('Distance:')}}</span>
          <input v-model="gotoDistance" class="ui-input" />
        </div>
        <div class="ui-hbox" style="margin-top: 6px">
          <label class="ui-radio"><input v-model="gotoUnit" type="radio" value="km" />km</label>
          <label class="ui-radio"><input v-model="gotoUnit" type="radio" value="radii" />radii</label>
          <label class="ui-radio"><input v-model="gotoUnit" type="radio" value="au" />au</label>
        </div>
        <div v-if="gotoTarget && !gotoTargetValid" class="ui-muted" style="margin-top: 8px; color: #a33">
          No object matches that name.
        </div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Cancel')}}</button>
        <button class="ui-button default" :disabled="!gotoTargetValid" @click="applyGoto">Ok</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------- Add Bookmark -->
  <div v-if="ui.openDialog === 'add-bookmark'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 380px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Bookmark Location')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Bookmark name:')}}</span>
          <input v-model="bookmarkName" class="ui-input" />
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Create in:')}}</span>
          <select v-model="bookmarkFolder" class="ui-select">
            <option v-for="folder in bookmarks.menu" :key="folder.id" :value="folder.id">{{ folder.title }}</option>
          </select>
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Time source:')}}</span>
          <select v-model.number="bookmarkTimeSource" class="ui-select">
            <option :value="0">{{t('Current simulation time')}}</option>
            <option :value="1">{{t('Simulation time at activation')}}</option>
            <option :value="2">{{t('System time at activation')}}</option>
          </select>
        </div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="addBookmark">Ok</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------------- New Folder -->
  <div v-if="ui.openDialog === 'new-bookmark-folder'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 420px">
      <div class="ui-dialog-titlebar">
        <span>{{t('New Folder')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-form-row" style="--ui-form-label-width: 84px">
          <span class="ui-label">{{t('Name:')}}</span>
          <input v-model="newFolderName" class="ui-input" />
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 84px; align-items: start">
          <span class="ui-label">{{t('Description:')}}</span>
          <textarea v-model="newFolderDescription" class="ui-input" style="height: 64px; padding: 4px 6px" />
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 84px">
          <span class="ui-label">{{t('Create in:')}}</span>
          <select v-model="newFolderParent" class="ui-select">
            <option v-for="folder in bookmarks.menu" :key="folder.id" :value="folder.id">{{ folder.title }}</option>
          </select>
        </div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="addFolder">Ok</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------- Organize Bookmarks -->
  <div v-if="ui.openDialog === 'organize-bookmarks'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 580px; height: 470px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Organize Bookmarks')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body" style="display: flex; flex-direction: column">
        <div style="flex: 1 1 auto; overflow: auto; border: 1px solid var(--ui-border-light); background: #fff">
          <div v-for="folder in bookmarks.menu" :key="folder.id">
            <div class="ui-tree-row" style="font-weight: 600">
              <span class="twisty">{{ folder.folded ? '▶' : '▼' }}</span>
              <span class="cell">{{ folder.title }}</span>
            </div>
            <template v-if="!folder.folded">
              <div v-for="child in folder.children" :key="nodeId(child)" class="ui-tree-row" style="padding-left: 26px">
                <span class="twisty" />
                <span class="cell">
                  <template v-if="child.kind === 'folder'">📁 {{ child.folder.title }}</template>
                  <template v-else-if="child.kind === 'separator'">――― separator ―――</template>
                  <template v-else>{{ child.title }}</template>
                </span>
                <span class="spacer" />
                <button class="ui-button" style="min-width: 0; height: 16px; padding: 0 6px" @click="removeBookmarkNode(folder, nodeId(child))">{{t('Remove')}}</button>
              </div>
            </template>
          </div>
        </div>
        <div class="ui-hbox" style="margin-top: 8px">
          <button class="ui-button" @click="openWithDefaults('new-bookmark-folder')">{{t('New Folder')}}</button>
          <button class="ui-button" @click="newSeparator">{{t('New Separator')}}</button>
          <span class="ui-spacer" />
          <button class="ui-button" @click="closeDialog">{{t('Close')}}</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ----------------------------------------------------------- Tour Guide -->
  <div v-if="ui.openDialog === 'tour-guide'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 470px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Tour Guide')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-hbox">
          <span class="ui-label">{{t('Select your destination:')}}</span>
          <select v-model.number="tourIndex" class="ui-select ui-grow">
            <option v-for="(destination, index) in destinations" :key="destination.name" :value="index">{{ destination.name }}</option>
          </select>
          <button class="ui-button" @click="tourGoTo">{{t('Go To')}}</button>
        </div>
        <p style="margin-top: 12px; line-height: 1.5">{{ destinations[tourIndex]?.description }}</p>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Close')}}</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------- OpenGL Info -->
  <div v-if="ui.openDialog === 'gl-info'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 520px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Renderer Info')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <table class="ui-table">
          <tbody>
            <tr v-for="(value, key) in glInfo" :key="key">
              <td style="width: 42%">{{ key }}</td>
              <td>{{ value }}</td>
            </tr>
            <tr>
              <td>{{t('Rendered bodies')}}</td>
              <td>{{ ui.bodyCount }}</td>
            </tr>
            <tr>
              <td>{{t('Catalogue stars')}}</td>
              <td>{{ ui.starCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Close')}}</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------------- About -->
  <AboutDialog v-if="ui.openDialog === 'about'" @close="closeDialog" />

  <!-- -------------------------------------------------------- Open Script -->
  <div v-if="ui.openDialog === 'open-script'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 520px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Open Script')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <p style="margin-top: 0">
          Choose a Celestia script to run. The interpreter is Celestia's own, the one that runs
          start.cel, so the whole CEL language is available.
        </p>
        <input
          ref="scriptFileInput"
          class="ui-input"
          type="file"
          accept=".cel,.celx,text/plain"
          style="width: 100%"
          @change="onScriptFileChosen"
        />
        <div v-if="ui.scripts.length > 0" style="margin-top: 10px">
          <div class="ui-label">{{t('Scripts in the scripts directory:')}}</div>
          <div class="ui-vbox" style="gap: 2px; margin-top: 4px">
            <button
              v-for="script in ui.scripts"
              :key="script.path"
              class="ui-button"
              style="justify-content: flex-start"
              @click="runNamedScript(script.path)"
            >{{ script.title }}</button>
          </div>
        </div>
        <div v-else class="ui-muted" style="margin-top: 8px">{{t('No scripts found.')}}</div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button default" @click="closeDialog">{{t('Close')}}</button>
      </div>
    </div>
  </div>

  <!-- ----------------------------------------------------- Celestia Guide -->
  <div v-if="ui.openDialog === 'help-guide'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 520px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Celestia Guide')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body" style="line-height: 1.6">
        <h3 style="margin-top: 0">{{t('Mouse')}}</h3>
        <table class="ui-table">
          <tbody>
            <tr><td style="width: 46%">{{t('Left drag')}}</td><td>{{t('Orient camera')}}</td></tr>
            <tr><td>{{t('Right drag')}}</td><td>{{t('Orbit selected object')}}</td></tr>
            <tr><td>{{t('Left + right drag sideways')}}</td><td>{{t('Roll view')}}</td></tr>
            <tr><td>{{t('Left + right drag vertically')}}</td><td>{{t('Adjust distance to selection')}}</td></tr>
            <tr><td>{{t('Wheel')}}</td><td>{{t('Adjust distance to selection')}}</td></tr>
            <tr><td>{{t('Ctrl + left drag')}}</td><td>{{t('Adjust distance to selection')}}</td></tr>
            <tr><td>{{t('Shift + left drag')}}</td><td>{{t('Change field of view')}}</td></tr>
            <tr><td>{{t('Middle button')}}</td><td>Toggle between 45° and the previous FOV</td></tr>
            <tr><td>{{t('Left click on object')}}</td><td>{{t('Select object')}}</td></tr>
            <tr><td>{{t('Left click on empty space')}}</td><td>{{t('Cancel selection')}}</td></tr>
            <tr><td>{{t('Left double click')}}</td><td>{{t('Select and centre')}}</td></tr>
            <tr><td>{{t('Right click')}}</td><td>{{t('Context menu')}}</td></tr>
          </tbody>
        </table>
        <h3>{{t('Keyboard')}}</h3>
        <table class="ui-table">
          <tbody>
            <tr><td style="width: 46%">1 – 9</td><td>{{t('Select a planet around the nearest star')}}</td></tr>
            <tr><td>0</td><td>{{t('Select the parent body')}}</td></tr>
            <tr><td>H</td><td>{{t('Select Sol')}}</td></tr>
            <tr><td>C</td><td>{{t('Centre on selected object')}}</td></tr>
            <tr><td>G</td><td>{{t('Goto selected object')}}</td></tr>
            <tr><td>F</td><td>{{t('Follow selected object')}}</td></tr>
            <tr><td>T</td><td>{{t('Track selected object')}}</td></tr>
            <tr><td>Y</td><td>{{t('Sync orbit with the selected object')}}</td></tr>
            <tr><td>: / "</td><td>{{t('Lock / chase the selected object')}}</td></tr>
            <tr><td>{{t('Home / End')}}</td><td>{{t('Move closer / further away')}}</td></tr>
            <tr><td>*</td><td>{{t('Look back')}}</td></tr>
            <tr><td>{{t('Esc')}}</td><td>{{t('Cancel motion')}}</td></tr>
            <tr><td>{{t('Space')}}</td><td>{{t('Pause or resume time')}}</td></tr>
            <tr><td>{{t('K / L')}}</td><td>Time 10× faster / slower</td></tr>
            <tr><td>- / +</td><td>Time 2× slower / faster</td></tr>
            <tr><td>J</td><td>{{t('Reverse time')}}</td></tr>
            <tr><td>[ / ]</td><td>{{t('Fewer / more stars visible')}}</td></tr>
            <tr><td>, / .</td><td>{{t('Narrower / wider field of view')}}</td></tr>
            <tr><td>{{t('Backspace')}}</td><td>{{t('Select the parent, or clear the selection')}}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="openHelpGuide">{{t('Open the Celestia website')}}</button>
        <button class="ui-button default" @click="closeDialog">{{t('Close')}}</button>
      </div>
    </div>
  </div>

  <!-- ------------------------------------------------------- Capture Video -->
  <div v-if="ui.openDialog === 'capture-video'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 340px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Capture Video')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Resolution:')}}</span>
          <select v-model.number="captureSize" class="ui-select">
            <option v-for="(size, index) in CAPTURE_SIZES" :key="index" :value="index">{{ size[0] }} x {{ size[1] }}</option>
          </select>
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Frame rate:')}}</span>
          <select v-model.number="captureFrameRate" class="ui-select">
            <option v-for="(rate, index) in CAPTURE_FRAME_RATES" :key="index" :value="index">{{ rate }}</option>
          </select>
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Video codec:')}}</span>
          <select v-model.number="captureCodec" class="ui-select">
            <option v-for="(codec, index) in CAPTURE_CODECS" :key="index" :value="index">{{ codec.label }}</option>
          </select>
        </div>
        <div class="ui-form-row" style="--ui-form-label-width: 96px">
          <span class="ui-label">{{t('Bitrate:')}}</span>
          <input
            :value="captureBitrate"
            class="ui-input"
            inputmode="numeric"
            maxlength="9"
            @beforeinput="onBitrateBeforeInput"
            @input="onBitrateInput"
          />
        </div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="applyCaptureSettings">Ok</button>
      </div>
    </div>
  </div>

  <!-- -------------------------------------------------------- Custom FPS -->
  <div v-if="ui.openDialog === 'fps-custom'" class="ui-dialog-backdrop" @pointerdown.self="closeDialog">
    <div class="ui-dialog" style="width: 300px">
      <div class="ui-dialog-titlebar">
        <span>{{t('Frame rate')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-form-row" style="--ui-form-label-width: 90px">
          <span class="ui-label">{{t('Target FPS:')}}</span>
          <input v-model="customFps" type="number" class="ui-input" min="1" max="480" />
        </div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="applyCustomFps">Ok</button>
      </div>
    </div>
  </div>
</template>
