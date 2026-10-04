<script setup lang="ts">
// The About dialog, which is CelestiaAppWindow::slotShowAbout.
//
// Qt builds one HTML string, hands it to QMessageBox::about and fills its
// placeholders with .arg(); the string is a single translatable block, and the
// catalogue carries a translation of the whole of it, so the dialog is written
// the same way here: one string, the same placeholders, the same substitutions.
//
// Four of the values differ from the Qt build's, because this build is not Qt.
// There is no Qt library to report and no runtime Qt version, so those two read
// as none, which is what is true; the compiler line names Emscripten; and the
// word size is the module's, 32. NAIF kernels and AVIF images are not built in
// here either, which the original's own wording already says.

import { computed } from 'vue';
import { t, viewport } from '@/store/app';

/** The msgid, byte for byte as it stands in qtappwin.cpp. */
const ABOUT = "<html><h1>Celestia 1.7.0 </h1><p>Development snapshot, commit <b>%1</b>.</p><p>Built for %2 bit CPU<br>Using %3 %4<br>Built against Qt library: %5<br>NAIF kernels are %7<br>AVIF images are %8<br>Runtime Qt version: %6</p><p>Copyright (C) 2001-2025 by the Celestia Development Team.<br>Celestia is free software. You can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.</p><p>Main site: <a href=\"https://celestiaproject.space/\">https://celestiaproject.space/</a><br>Forum: <a href=\"https://celestiaproject.space/forum/\">https://celestiaproject.space/forum/</a><br>GitHub project: <a href=\"https://github.com/CelestiaProject/Celestia\">https://github.com/CelestiaProject/Celestia</a></p></html>";

const html = computed(() => {
  const info = viewport()?.module.buildInfo();
  const commit = info?.commit ?? '';
  const wordSize = String(info?.wordSize ?? 32);
  const toolchain = `Emscripten ${info?.toolchain ?? ''}`.trim();

  return t(ABOUT)
    .replace('%1', commit)
    .replace('%2', wordSize)
    .replace('%3 %4', toolchain)
    // The Qt library and the runtime Qt version have no value here, because this
    // build has no Qt in it. A dash says "not applicable" in any language, which
    // is why the two are filled with one rather than with a word.
    .replace('%5', '—')
    .replace('%6', '—')
    .replace('%7', t('not supported'))
    .replace('%8', t('not supported'));
});
</script>

<template>
  <div class="ui-dialog-backdrop" @pointerdown.self="$emit('close')">
    <div class="ui-dialog" style="width: 540px">
      <div class="ui-dialog-titlebar">
        <span>{{t('About Celestia')}}</span>
        <span class="spacer" />
        <button class="ui-toolbutton" @click="$emit('close')">✕</button>
      </div>
      <div class="ui-dialog-body">
        <!-- The original's text is shown below, because it carries the copyright
             and the licence, but this build is not the Celestia project's and
             must not be mistaken for it. The notice is written in both languages
             rather than translated: it is the one thing here that has to be
             understood, and this port has no translators of its own. -->
        <div class="ui-notice">
          <p>
            <b>This is an unofficial build.</b> It is not released by, affiliated
            with, or endorsed by the Celestia Development Team. Please do not
            report problems with it to the Celestia project; report them to
            whoever gave you this build.
          </p>
          <p>
            <b>这是非官方版本。</b>它并非由 Celestia 开发团队发布，与该团队没有隶属或认可关系。
            请<b>不要</b>就此版本的问题向 Celestia 官方提交，而应向提供此版本的人反馈。
          </p>
          <p class="ui-notice-note">
            This build is a web port of the Qt front end, compiled from the
            sources of the version below.
          </p>
        </div>

        <!-- The original renders this with QMessageBox, which takes HTML. -->
        <div v-html="html" />
      </div>
      <div class="ui-dialog-buttons">
        <button class="ui-button default" @click="$emit('close')">{{t('Close')}}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The dialog's text is inserted as HTML, which scoped styles do not reach: Vue
   marks the elements in a template, and an injected string brings none of those
   marks with it, so the browser's own defaults applied and the whole box came out
   at the size of a web page rather than of the window. Qt renders the same string
   through QMessageBox, whose text document keeps h1 modest and paragraphs at the
   widget's own size, which is what these rules restore. */
.ui-dialog-body :deep(h1) {
  font-size: 16px;
  font-weight: 600;
  margin: 2px 0 8px;
}

.ui-dialog-body :deep(p) {
  margin: 0 0 9px;
}

.ui-dialog-body :deep(a) {
  color: #2a6fb8;
}

/* The notice is not part of the original's text and is styled to stand apart
   from it, so that it is read before the version it applies to. */
.ui-notice {
  border: 1px solid #d8b45a;
  background: #fdf6e3;
  padding: 8px 10px;
  margin: 0 0 12px;
}

.ui-notice p {
  margin: 0 0 7px;
}

.ui-notice p:last-child {
  margin-bottom: 0;
}

.ui-notice-note {
  color: #6b5a2a;
}
</style>
