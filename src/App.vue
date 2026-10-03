<script setup lang="ts">
// Application root: the splash screen that Celestia shows while the data files
// load, then the main window.

import { onMounted, ref } from 'vue';
import MainWindow from './components/MainWindow.vue';
import { loadAstro } from '@/wasm';
import { Universe } from '@/core/universe';
import { Simulation } from '@/core/simulation';
import { Observer } from '@/core/observer';
import { MarkerStore } from '@/core/markers';
import { setEngine, ui } from '@/store/app';
import { setStarColorTable } from '@/render/starcolor';
import { vec3 } from '@/core/math';
import { TDBtoUTC } from '@/core/astro';

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

    ui.loadingMessage = 'Loading data files';
    ui.loadingFraction = 0.2;
    const universe = await Universe.load((fraction, label) => {
      ui.loadingFraction = 0.2 + fraction * 0.75;
      ui.loadingMessage = `Loading data files: ${label}`;
    });

    ui.loadingMessage = 'Starting the simulation';
    ui.loadingFraction = 0.97;

    const simulation = new Simulation(universe);
    // Celestia starts at the current system time.
    const now = new Date();
    const jdUtc =
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()) /
        86400000 +
      2440587.5;
    simulation.setTime(wasm.UTCtoTDB(jdUtc));
    simulation.showFPSCounter = true;
    setStarColorTable('Blackbody_D65');

    const observer = new Observer(simulation, { fov: (45 * Math.PI) / 180 });
    // The Sun's position is the origin of the body tree, so the observer starts
    // at Earth's position offset by a few radii, looking back at the planet.
    const earth = universe.bodiesByName.get('earth');
    if (earth) {
      const position = universe.getBodyScenePosition(earth, simulation.getTime());
      observer.setPosition(vec3(position.x + earth.radius * 5.2, position.y + earth.radius * 2.4, position.z + earth.radius * 3.4));
      observer.frameCenter = { ...simulation.getSelection(), body: earth } as never;
      void TDBtoUTC;
    }

    setEngine({
      universe,
      simulation,
      observer,
      markers: new MarkerStore(),
    });

    ui.timeDisplay = simulation.timeControl.formatDate(false, false);
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
