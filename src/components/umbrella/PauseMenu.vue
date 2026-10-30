<script setup lang="ts">
/**
 * The game's pause menu: Resume, Restart, Settings. Settings opens tabs; the
 * General tab holds the language dropdown. The scene stops the simulation
 * while this is open. In the lantern / clay builds it wears the scene's theme
 * (umbrella/ui/theme.ts): an ornamented sheet, themed buttons and icons, and a
 * slide between the menu and the settings.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelect from './LanguageSelect.vue'
import PanelOrnaments from './ornaments/PanelOrnaments.vue'
import BtnOrnaments from './ornaments/BtnOrnaments.vue'
import OrnDivider from './ornaments/OrnDivider.vue'
import UiGlyph from './ornaments/UiGlyph.vue'
import { useUiTheme } from '@/umbrella/ui/theme'

const emit = defineEmits<{ resume: []; restart: []; intro: [] }>()
const { t } = useI18n()
const theme = useUiTheme()

const view = ref<'menu' | 'settings'>('menu')
const tab = ref<'general'>('general')

const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopImmediatePropagation()
  if (view.value === 'settings') view.value = 'menu'
  else emit('resume')
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="pause-back u-backdrop" @click.self="emit('resume')">
    <div class="pause u-panel u-modal" role="dialog" aria-modal="true" :aria-label="t('umbrella.pause.title')">
      <PanelOrnaments />
      <Transition name="u-view" mode="out-in" :css="!!theme">
        <div v-if="view === 'menu'" key="menu" class="pause-view">
          <b class="pause-title u-title"><UiGlyph name="pause" fallback="⏸" /> {{ t('umbrella.pause.title') }}</b>
          <OrnDivider class="pause-divider" />
          <button class="pause-btn primary u-btn u-primary" @click="emit('resume')"><BtnOrnaments /><UiGlyph name="play" fallback="▶" /> {{ t('umbrella.pause.resume') }}</button>
          <button class="pause-btn u-btn" @click="emit('restart')"><BtnOrnaments /><UiGlyph name="restart" fallback="↻" /> {{ t('umbrella.restart') }}</button>
          <button class="pause-btn u-btn" @click="emit('intro')"><BtnOrnaments /><UiGlyph name="film" fallback="🎬" /> {{ t('umbrella.pause.intro') }}</button>
          <button class="pause-btn u-btn" @click="view = 'settings'"><BtnOrnaments /><UiGlyph name="gear" fallback="⚙" /> {{ t('umbrella.pause.settings') }}</button>
        </div>
        <div v-else key="settings" class="pause-view">
          <div class="pause-head">
            <button class="pause-icon u-icon-btn" :aria-label="t('umbrella.back')" @click="view = 'menu'"><UiGlyph name="prev" fallback="‹" /></button>
            <b class="pause-title u-title"><UiGlyph name="gear" fallback="⚙" /> {{ t('umbrella.pause.settings') }}</b>
          </div>
          <div class="tabs" role="tablist">
            <button role="tab" class="tab u-tab" :class="{ on: tab === 'general' }" :aria-selected="tab === 'general'" @click="tab = 'general'">{{ t('options.general') }}</button>
          </div>
          <div v-if="tab === 'general'" class="tab-body" role="tabpanel">
            <LanguageSelect />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.pause-back { position: absolute; inset: 0; z-index: 12; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, 0.6); }
.pause {
  width: min(380px, 100%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #1a1f2e;
  color: #fff;
}
/* The plain UI lays the view's items straight into the sheet's column. */
.pause-view { display: contents; }
.pause-title { font-size: 22px; text-align: center; }
.pause-head { display: flex; align-items: center; gap: 10px; }
.pause-head .pause-title { flex: 1; text-align: left; }
.pause-icon { width: 36px; height: 36px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); font-size: 22px; }
.pause-btn { padding: 12px; border-radius: 10px; background: rgba(255, 255, 255, 0.1); font-size: 18px; font-weight: 700; }
.pause-btn:hover { background: rgba(255, 255, 255, 0.2); }
.pause-btn.primary { background: #059669; }
.tabs { display: flex; gap: 4px; }
.tab { padding: 6px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.06); font-weight: 700; }
.tab.on { background: #2563eb; }
.tab-body { padding: 10px 2px; font-size: 16px; }

/* ── Themed (lantern / clay) ── */
.ui-theme .pause-back { padding: 52px 16px 44px; }
.ui-theme .pause { width: min(400px, 100%); padding: 40px 26px 28px; gap: 0; }
.ui-theme .pause-view { display: flex; flex-direction: column; gap: 12px; position: relative; z-index: 4; }
.ui-theme .pause-title { font-size: 27px; line-height: 1.15; }
.ui-theme .pause-title .ui-glyph { font-size: 0.8em; margin-right: 0.1em; }
.ui-theme .pause-divider { margin: -6px auto 4px; }
.ui-theme .pause-btn { min-height: 52px; padding: 12px 42px; font-size: 18px; letter-spacing: 0.01em; }
.ui-theme .pause-btn .ui-glyph { margin-right: 0.25em; }
.ui-theme .pause-btn.primary { font-size: 20px; min-height: 58px; }
.ui-theme .pause-head .pause-title { font-size: 24px; }
.ui-theme .pause-icon { flex: none; width: 38px; height: 38px; font-size: 20px; }
.ui-theme .tabs { gap: 6px; padding-top: 4px; }
.ui-theme .tab { min-height: 40px; padding: 8px 18px; }
.ui-theme .tab-body { padding: 14px 2px 4px; font-size: 17px; }
/* Clay pills carry no end ornaments: their labels get the room. Narrow phones tighten both. */
.ui-clay .pause-btn { padding-inline: 22px; }
@media (max-width: 400px) {
  .ui-theme .pause { padding-inline: 20px; }
  .ui-lantern .pause-btn { padding-inline: 32px; font-size: 17px; }
  .ui-clay .pause-btn { padding-inline: 14px; font-size: 17px; }
}
.ui-lantern .pause-title { color: #7e1a17; }
.ui-clay .pause-title { color: #2f5fa8; }
</style>
