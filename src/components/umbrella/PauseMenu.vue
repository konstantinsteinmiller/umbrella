<script setup lang="ts">
/**
 * The game's pause menu: Resume, Restart, Settings. Settings opens tabs; the
 * General tab holds the language dropdown, the Audio tab the music and sound
 * effects volumes (useUser's saved player volumes; at their defaults the game
 * plays its tuned mix). While the Audio tab is open the scene lets the music be
 * heard, and letting go of the effects slider plays one sample, so the player
 * hears what they set. The scene stops the simulation
 * while this is open. In the lantern / clay builds it wears the scene's theme
 * (umbrella/ui/theme.ts): an ornamented sheet, themed buttons and icons, and a
 * slide between the menu and the settings.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelect from './LanguageSelect.vue'
import PanelOrnaments from './ornaments/PanelOrnaments.vue'
import BtnOrnaments from './ornaments/BtnOrnaments.vue'
import OrnDivider from './ornaments/OrnDivider.vue'
import UiGlyph from './ornaments/UiGlyph.vue'
import { useUiTheme } from '@/umbrella/ui/theme'
import useUser from '@/use/useUser'
import { playSfx } from '@/umbrella/audio'

const emit = defineEmits<{ resume: []; restart: []; intro: []; audition: [on: boolean] }>()
const { t } = useI18n()
const theme = useUiTheme()

const view = ref<'menu' | 'settings'>('menu')
const tab = ref<'general' | 'audio'>('general')

const { userMusicVolume, userSoundVolume, setSettingValue } = useUser()
const musicPct = computed(() => Math.round(userMusicVolume.value * 100))
const soundPct = computed(() => Math.round(userSoundVolume.value * 100))
const onMusic = (e: Event) => setSettingValue('music', +(e.target as HTMLInputElement).value / 100)
const onSound = (e: Event) => setSettingValue('sound', +(e.target as HTMLInputElement).value / 100)
/** The open of the umbrella: the effect a player hears most. */
const sampleSound = () => playSfx('open', { intensity: 0.3 })
const auditioning = computed(() => view.value === 'settings' && tab.value === 'audio')
watch(auditioning, (on) => emit('audition', on))
onUnmounted(() => emit('audition', false))

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
      <Transition name="u-view" mode="out-in">
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
            <button role="tab" class="tab u-tab" :class="{ on: tab === 'audio' }" :aria-selected="tab === 'audio'" @click="tab = 'audio'">{{ t('options.audio') }}</button>
          </div>
          <div v-if="tab === 'general'" class="tab-body" role="tabpanel">
            <LanguageSelect />
          </div>
          <div v-else class="tab-body audio" role="tabpanel">
            <label class="vol">
              <span class="vol-name">{{ t('options.music') }}</span>
              <input id="vol-music" type="range" min="0" max="100" step="1" :value="musicPct" @input="onMusic">
              <span class="vol-val">{{ musicPct }}%</span>
            </label>
            <label class="vol">
              <span class="vol-name">{{ t('options.soundEffects') }}</span>
              <input id="vol-sound" type="range" min="0" max="100" step="1" :value="soundPct" @input="onSound" @change="sampleSound">
              <span class="vol-val">{{ soundPct }}%</span>
            </label>
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
.audio { display: flex; flex-direction: column; gap: 14px; }
.vol { display: grid; grid-template-columns: 1fr auto; grid-template-areas: 'name val' 'bar bar'; align-items: center; gap: 6px 10px; font-weight: 700; }
.vol-name { grid-area: name; display: flex; align-items: center; gap: 0.35em; }
.vol-val { grid-area: val; font-variant-numeric: tabular-nums; min-width: 3.2em; text-align: right; opacity: 0.85; }
.vol input { grid-area: bar; width: 100%; min-height: 32px; accent-color: #2563eb; cursor: pointer; }
.ui-lantern .vol input { accent-color: #c0392b; }
.ui-clay .vol input { accent-color: #2f5fa8; }

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
