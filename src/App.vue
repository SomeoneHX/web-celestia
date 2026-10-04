<script setup lang="ts">
// Application root: the splash screen that Celestia shows while the data files
// load, then the main window.
//
// The shell used to build its own universe, simulation and observer here. The
// engine holds all three now -- CelestiaCore makes them when it starts and reads
// the catalogues itself -- so this only prepares the astronomy core, which the
// tool bars need for the current time button, and brings up the window.

import { onMounted, ref } from 'vue';
import MainWindow from './components/MainWindow.vue';
import { loadAstro } from '@/wasm';
import { ui } from '@/store/app';
import { setStarColorTable } from '@/render/starcolor';

const splashVisible = ref(true);

async function boot(): Promise<void> {
  try {
    ui.loadingMessage = 'Loading the astronomy core';
    ui.loadingFraction = 0.02;
    const wasm = await loadAstro((fraction, label) => {
      ui.loadingFraction = fraction;
      ui.loadingMessage = label;
    });
    // The tool bars need the module for the current time button.
    (globalThis as { __celestiaAstro?: unknown }).__celestiaAstro = wasm;

    setStarColorTable('Blackbody_D65');

    ui.loadingFraction = 1;
    ui.ready = true;
    splashVisible.value = false;
  } catch (error) {
    ui.error = error instanceof Error ? error.message : String(error);
    ui.loadingMessage = 'Startup failed';
  }
}

onMounted(boot);
</script>

<template>
  <MainWindow v-if="ui.ready" />

  <div v-if="splashVisible || !ui.ready" class="qt-splash">
    <div style="text-align: center">
      <div style="font-size: 30px; letter-spacing: 8px; font-weight: 300">CELESTIA</div>
      <div style="font-size: 12px; color: #7f8fa4; margin-top: 6px; letter-spacing: 2px">WEB PORT</div>
    </div>
    <div class="progress"><div :style="{ width: `${Math.round(ui.loadingFraction * 100)}%` }" /></div>
    <div class="status">{{ ui.loadingMessage }}</div>
    <div v-if="ui.error" style="max-width: 520px; color: #ff9a9a; font-size: 12px; text-align: center; line-height: 1.5">
      {{ ui.error }}
    </div>
  </div>
</template>
