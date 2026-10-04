<script setup lang="ts">
// Application root: the splash screen Celestia shows while the data files load,
// then the main window.
//
// Qt's splash is the image in splash.png with the core's own progress messages
// drawn at the bottom, centred and in white; QSplashScreen::showMessage does the
// drawing, and CelestiaAppWindow::loadingProgressUpdate supplies the text. The
// shell used to show a title and a progress bar of its own instead.
//
// The shell used to build its own universe, simulation and observer here. The
// engine holds all three now -- CelestiaCore makes them when it starts and reads
// the catalogues itself -- so this only prepares the astronomy core, which the
// tool bars need for the current time button, and brings up the window.

import { onMounted } from 'vue';
import MainWindow from './components/MainWindow.vue';
import { loadAstro } from '@/wasm';
import { ui } from '@/store/app';
import { setStarColorTable } from '@/render/starcolor';

async function boot(): Promise<void> {
  try {
    ui.loadingMessage = '';
    const wasm = await loadAstro((_fraction, label) => {
      ui.loadingMessage = label;
    });
    // The tool bars need the module for the current time button.
    (globalThis as { __celestiaAstro?: unknown }).__celestiaAstro = wasm;

    setStarColorTable('Blackbody_D65');

    // The window is built now, but the splash stays over it until the engine
    // reports in: loading the catalogues is the long part, and covering it is
    // what the splash is for.
    ui.astroReady = true;
  } catch (error) {
    ui.error = error instanceof Error ? error.message : String(error);
    ui.loadingMessage = 'Startup failed';
  }
}

onMounted(boot);
</script>

<template>
  <MainWindow v-if="ui.astroReady" />

  <div v-if="!ui.ready" class="ui-splash">
    <!-- The message is drawn on the splash itself, which is what
         QSplashScreen::showMessage does, so it is anchored to the image rather
         than to the viewport. -->
    <div class="ui-splash-frame">
      <img class="ui-splash-image" src="/splash/splash.png" alt="Celestia" />
      <div class="ui-splash-message">{{ ui.loadingMessage }}</div>
      <div v-if="ui.error" class="ui-splash-error">{{ ui.error }}</div>
    </div>
  </div>
</template>

<style scoped>
.ui-splash {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  z-index: 100;
}

.ui-splash-frame {
  position: relative;
  line-height: 0;
}

/* QSplashScreen is the size of its pixmap and the image is drawn as it is; only
   when the window is smaller than the image is it scaled down. */
.ui-splash-image {
  display: block;
  width: 790px;
  height: 568px;
  max-width: 100vw;
  max-height: 100vh;
}

/* The message sits at the bottom of the image, as it does on the splash. */
.ui-splash-message {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 24px;
  padding: 0 16px;
  text-align: center;
  color: #ffffff;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-line;
  text-shadow: 0 1px 2px #000;
}

.ui-splash-error {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 4px;
  padding: 0 16px;
  text-align: center;
  color: #ff9a9a;
  font-size: 12px;
}
</style>
