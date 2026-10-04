<script setup lang="ts">
// The Info Browser dock.
//
// Mirrors qtinfopanel.cpp: a QDockWidget titled "Info Browser" holding a single
// QTextBrowser whose contents are an HTML fragment. The page is rebuilt only when
// the selection changes, which is what InfoPanel::updateHelper does.

import { ui, t } from '@/store/app';

defineProps<{ html: string }>();
</script>

<template>
  <div class="ui-dock right">
    <div class="ui-dock-title">
      <span>{{ t('Info Browser') }}</span>
      <span class="spacer" />
      <button :title="t('Close')" @click="ui.showInfoBrowser = false">✕</button>
    </div>
    <div class="ui-dock-body">
      <div class="ui-html-panel" v-html="html || `<i>${t('No object selected')}</i>`" />
    </div>
  </div>
</template>
