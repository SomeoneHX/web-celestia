<script setup lang="ts">
// Host for every modal dialog of the shell.
//
// The small dialogs are defined inline because they are single-purpose forms;
// Set Time and Preferences are separate components because of their size.

import { computed, ref, watch } from 'vue';
import AboutDialog from './AboutDialog.vue';
import SetTimeDialog from './SetTimeDialog.vue';
import PreferencesDialog from './PreferencesDialog.vue';
import OrganizeBookmarksDialog from './OrganizeBookmarksDialog.vue';
import {
  bookmarkFolderTitle, bookmarkRoots, bookmarks, closeDialog, nextBookmarkId, refreshSelectionMirror,
  t, ui, viewport,
} from '@/store/app';
import {
  CAPTURE_CODECS, CAPTURE_DEFAULT_BITRATE, CAPTURE_FRAME_RATES, CAPTURE_SIZES, startCapture,
} from '@/core/videoCapture';
import type { BookmarkFolder } from '@/store/app';

const props = defineProps<{ iconUrl: (name: string) => string }>();

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
// The frame the window captured for this bookmark, which the menu action opened
// the dialog with.
const bookmarkIcon = ref('');
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

watch(() => ui.openDialog, (name) => {
  // The Tour Guide offers the destinations the core read from its
  // DestinationFile, the way Qt's TourGuideDialog reads the DestinationList.
  if (name === 'tour-guide') loadGuideDestinations();
  // QInputDialog::getInt opens on the current rate, ms_to_fps(timer->interval()).
  if (name === 'fps-custom') customFps.value = String(ui.fps);
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

  // GoToObjectDialog::on_buttonBox_accepted: the field's value in the chosen
  // unit followed by the object's radius, or five radii when it is left empty.
  const radius = view.engine.objectRadiusKm(path);
  const typed = Number(gotoDistance.value);
  let distance: number;
  if (gotoDistance.value.trim() === '' || !Number.isFinite(typed)) {
    distance = radius * 5;
  } else {
    distance = typed;
    if (gotoUnit.value === 'au') distance *= 149597870.7;
    else if (gotoUnit.value === 'radii') distance *= radius;
    distance += radius;
  }

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
  // slotOpenScriptDialog cancels the running script before it starts this one.
  viewport()?.engine.cancelScript();
  viewport()?.engine.runScript(path);
  closeDialog();
}

function addBookmark(): void {
  // The engine owns the selection and writes the URL, which carries the time
  // source the dialog chose -- AddBookmarkDialog builds it from CelestiaState.
  const view = viewport();
  if (view === null) return;
  const picked = view.engine.selectedObject() ?? null;
  const name = bookmarkName.value || picked?.name || 'Bookmark';
  const url = view.engine.buildUrl(bookmarkTimeSource.value);
  const target = findFolder(bookmarkRoots(), bookmarkFolder.value) ?? bookmarks.menu[0];
  if (target === undefined) return;
  target.children.push({
    kind: 'bookmark',
    id: nextBookmarkId(),
    title: name,
    // Qt sets only the title, the URL and the icon; the description is empty.
    description: '',
    url,
    ...(bookmarkIcon.value === '' ? {} : { icon: bookmarkIcon.value }),
  });
  closeDialog();
}

/** The folder with this id anywhere in both bookmark roots, or null. */
function findFolder(folders: BookmarkFolder[], id: string): BookmarkFolder | null {
  for (const folder of folders) {
    if (folder.id === id) return folder;
    for (const child of folder.children) {
      if (child.kind === 'folder') {
        const found = findFolder([child.folder], id);
        if (found !== null) return found;
      }
    }
  }
  return null;
}

/**
 * Every folder of both roots, indented by its depth, which is what Qt's
 * OnlyFoldersProxyModel puts in the "Create in" combo: a bookmark or a folder can
 * be made in any folder of either tree, not only a top level one.
 */
const allBookmarkFolders = computed(() => {
  const out: Array<{ id: string; label: string }> = [];
  const walk = (folder: BookmarkFolder, depth: number): void => {
    out.push({ id: folder.id, label: `${'\u00a0\u00a0'.repeat(depth)}${bookmarkFolderTitle(folder)}` });
    for (const child of folder.children) {
      if (child.kind === 'folder') walk(child.folder, depth + 1);
    }
  };
  for (const root of bookmarkRoots()) walk(root, 0);
  return out;
});

function applyCustomFps(): void {
  // QInputDialog::getInt clamps to the 0..2048 setCustomFPS passes; 0 means no
  // limit, which is the "Auto" entry of the frame rate menu.
  const value = Math.max(0, Math.min(2048, Math.round(Number(customFps.value) || 0)));
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

/** Fills a dialog's fields as it opens, which Qt does as it builds it. */
function seedDialog(name: string): void {
  if (name === 'add-bookmark') {
    // The selection names the bookmark, and AddBookmarkDialog opens the combo
    // on the first entry of the tree, index(0, 0).
    bookmarkName.value = viewport()?.engine.selectedObject()?.name || t('New bookmark');
    bookmarkFolder.value = bookmarkRoots()[0]?.id ?? '';
    bookmarkIcon.value = typeof ui.dialogPayload === 'string' ? ui.dialogPayload : '';
  }
  if (name === 'goto-object') {
    gotoTarget.value = viewport()?.engine.selectedObject()?.name ?? '';
    onGotoNameChanged();
  }
}

watch(() => ui.openDialog, (name) => {
  if (name !== null) seedDialog(name);
});

/**
 * The Go To destinations, which the core read from the config's DestinationFile
 * with ReadDestinationList -- the same list Qt's TourGuideDialog offers. The
 * engine parses guide.cel itself, so the front end only reads the result.
 */
interface GuideDestination {
  name: string;
  target: string;
  description: string;
  /** kilometres, the unit TourGuideDialog::slotGotoSelection takes */
  distanceKm: number;
}

const guideDestinations = ref<GuideDestination[]>([]);

function loadGuideDestinations(): void {
  // getDestinations is the core's own list, so there is nothing to fetch or parse.
  guideDestinations.value = (viewport()?.engine.getDestinations() ?? []) as GuideDestination[];
}

const destinations = computed(() => guideDestinations.value);

function tourGoTo(): void {
  const destination = destinations.value[tourIndex.value];
  if (!destination || tourIndex.value < 0) return;
  // The engine reproduces TourGuideDialog::slotGotoSelection, including the
  // distance fallback, so the shell only names the destination.
  viewport()?.engine.tourGoto(destination.target, destination.distanceKm);
  refreshSelectionMirror();
  closeDialog();
}

/**
 * The report CelestiaAppWindow::slotShowGLInfo builds: one line per value the
 * renderer reports, in its order, then every supported extension. A value the
 * renderer does not report has no line at all, and each line is the Qt format
 * string with its arguments substituted, so the catalogue's translation of it is
 * used as it stands.
 */
const glReport = computed(() => {
  const info = viewport()?.engine.rendererInfo() ?? {};

  const line = (format: string, ...values: Array<string | undefined>) => {
    if (values.some((value) => value === undefined)) return '';
    const text = values.reduce<string>(
      (text, value, index) => text.split(`%${index + 1}`).join(value as string),
      t(format),
    );
    return `${text}<br>\n`;
  };

  let html = '';
  html += line('<b>%1 version:</b> %2', info.API, info.APIVersion);
  html += line('<b>Vendor:</b> %1', info.Vendor);
  html += line('<b>Renderer:</b> %1', info.Renderer);
  html += line('<b>%1 Version:</b> %2', info.Language, info.LanguageVersion);
  html += line('<b>Max simultaneous textures:</b> %1', info.MaxTextureUnits);
  html += line('<b>Maximum texture size:</b> %1', info.MaxTextureSize);
  html += line('<b>Max cube map size:</b> %1', info.MaxCubeMapSize);
  html += line('<b>Number of interpolators:</b> %1', info.MaxVaryingFloats);
  html += line('<b>Max anisotropy filtering:</b> %1', info.MaxAnisotropy);

  html += '<br>\n';
  if (info.Extensions !== undefined) {
    html += t('<b>Supported extensions:</b><br>\n');
    html += info.Extensions.split(' ').join('<br>\n');
  }

  return html;
});
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
        <span>{{t('Dialog')}}</span>
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
            <option v-for="folder in allBookmarkFolders" :key="folder.id" :value="folder.id">{{ folder.label }}</option>
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

  <!-- -------------------------------------------------- Organize Bookmarks -->
  <OrganizeBookmarksDialog
    v-if="ui.openDialog === 'organize-bookmarks'"
    :icon-url="props.iconUrl"
    @close="closeDialog"
  />

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
          <select v-model.number="tourIndex" class="ui-select ui-grow" :disabled="destinations.length === 0">
            <option v-if="destinations.length === 0" value="-1">{{t('No guide destinations were found.')}}</option>
            <option v-for="(destination, index) in destinations" :key="destination.name" :value="index">{{ destination.name }}</option>
          </select>
          <button class="ui-button" :disabled="destinations.length === 0" @click="tourGoTo">{{t('Go To')}}</button>
        </div>
        <p v-if="destinations.length === 0" style="margin-top: 12px; line-height: 1.5">{{t('No guide destinations were found.')}}</p>
        <p v-else style="margin-top: 12px; line-height: 1.5">{{ destinations[tourIndex]?.description }}</p>
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
        <div class="ui-gl-report" v-html="glReport" />
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
        <input
          class="ui-input"
          type="file"
          accept=".cel,.celx,text/plain"
          style="width: 100%"
          @change="onScriptFileChosen"
        />
      </div>
      <div class="ui-dialog-buttons">
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
        <span>{{t('Set custom FPS')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="closeDialog">✕</button>
      </div>
      <div class="ui-dialog-body">
        <div class="ui-form-row" style="--ui-form-label-width: 90px">
          <span class="ui-label">{{t('FPS value')}}</span>
          <input v-model="customFps" type="number" class="ui-input" min="0" max="2048" />
        </div>
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button" @click="closeDialog">{{t('Cancel')}}</button>
        <button class="ui-button default" @click="applyCustomFps">Ok</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The extension list makes this long, so it scrolls in place, as Qt's text box
   does. */
.ui-gl-report {
  max-height: 340px;
  overflow: auto;
  line-height: 1.55;
}
</style>
