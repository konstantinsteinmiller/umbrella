<script setup lang="ts">
/**
 * The game's pause menu: Resume, Restart, Settings. Settings opens tabs; the
 * General tab holds the language dropdown, the Audio tab the music and sound
 * effects volumes (useUser's saved player volumes; at their defaults the game
 * plays its tuned mix). While the Audio tab is open the scene lets the music be
 * heard, and letting go of the effects slider plays one sample, so the player
 * hears what they set. The scene stops the simulation
 * while this is open. In the lantern build it wears the scene's theme
 * (umbrella/ui/theme.ts): an ornamented sheet, themed buttons and icons, and a
 * slide between the menu and the settings. On a desktop (`keys`) a Controls tab
 * holds the keyboard layout (detected, or picked) and the key rebinding: keys
 * are physical (umbrella/keyBindings.ts), the layout only names them
 * (umbrella/keyLabels.ts).
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
import { MUSIC_ENABLED, playSfx } from '@/umbrella/audio'
import { ACTIONS, bindKey, bindingsChanged, isBindable, primaryCode, resetBindings, type Action } from '@/umbrella/keyBindings'
import { keyboard, keyLabel, LAYOUTS, setAutoLayout, setManualLayout, type Layout } from '@/umbrella/keyLabels'

const props = withDefaults(defineProps<{ keys?: boolean; intro?: boolean }>(), { keys: false, intro: true })
const emit = defineEmits<{ resume: []; restart: []; intro: []; audition: [on: boolean] }>()
const { t } = useI18n()
const theme = useUiTheme()

const view = ref<'menu' | 'settings'>('menu')
const tab = ref<'general' | 'audio' | 'controls'>('general')

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

// ── Controls: the keyboard layout and key rebinding ──
const ACTION_NAME: Record<Action, string> = {
  left: 'umbrella.kb.left', right: 'umbrella.kb.right', umbrella: 'umbrella.ctlUmbrella', restart: 'umbrella.ctlRestart', levels: 'umbrella.selectLevel'
}
const detectedName = computed(() => (keyboard.detected ?? 'qwerty').toUpperCase())
const pickAuto = (e: Event) => setAutoLayout((e.target as HTMLSelectElement).value === 'on')
const pickLayout = (e: Event) => {
  const v = (e.target as HTMLSelectElement).value
  if ((LAYOUTS as string[]).includes(v)) setManualLayout(v as Layout)
}
/** The action waiting for its new key, if any. */
const capturing = ref<Action | null>(null)
const onCapture = (e: KeyboardEvent): void => {
  const a = capturing.value
  if (!a) return
  // Ours alone: neither the game nor this menu's Escape must also act on this press.
  e.preventDefault()
  e.stopImmediatePropagation()
  if (e.code === 'Escape') { stopCapture(); return }
  if (!isBindable(e.code)) return
  bindKey(a, e.code)
  stopCapture()
}
const stopCapture = (): void => {
  capturing.value = null
  window.removeEventListener('keydown', onCapture, true)
}
const startCapture = (a: Action): void => {
  if (capturing.value === a) { stopCapture(); return }
  stopCapture()
  capturing.value = a
  window.addEventListener('keydown', onCapture, true)
}
watch([tab, view], stopCapture)
onUnmounted(stopCapture)

const onKey = (e: KeyboardEvent) => {
  // While a key is being captured, Escape cancels the capture (onCapture), not the menu.
  if (e.key !== 'Escape' || capturing.value) return
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
          <button v-if="intro" class="pause-btn u-btn" @click="emit('intro')"><BtnOrnaments /><UiGlyph name="film" fallback="🎬" /> {{ t('umbrella.pause.intro') }}</button>
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
            <button v-if="props.keys" role="tab" class="tab u-tab" :class="{ on: tab === 'controls' }" :aria-selected="tab === 'controls'" @click="tab = 'controls'">{{ t('umbrella.kb.tab') }}</button>
          </div>
          <div v-if="tab === 'general'" class="tab-body" role="tabpanel">
            <LanguageSelect />
          </div>
          <div v-else-if="tab === 'controls'" class="tab-body ctl" role="tabpanel">
            <label class="ctl-row">
              <span class="ctl-name">{{ t('umbrella.kb.auto') }}</span>
              <select class="ctl-select" :value="keyboard.auto ? 'on' : 'off'" @change="pickAuto">
                <option value="on">{{ t('umbrella.kb.on') }}</option>
                <option value="off">{{ t('umbrella.kb.off') }}</option>
              </select>
            </label>
            <p v-if="keyboard.auto" class="ctl-note">{{ t('umbrella.kb.detected', { layout: detectedName }) }}</p>
            <label v-else class="ctl-row">
              <span class="ctl-name">{{ t('umbrella.kb.layout') }}</span>
              <select class="ctl-select" :value="keyboard.manual" @change="pickLayout">
                <option v-for="l in LAYOUTS" :key="l" :value="l">{{ l.toUpperCase() }}</option>
              </select>
            </label>
            <div class="ctl-row ctl-head">
              <span class="ctl-name">{{ t('umbrella.kb.bindings') }}</span>
              <button type="button" class="ctl-reset u-btn" :disabled="!bindingsChanged()" @click="resetBindings()">{{ t('umbrella.kb.reset') }}</button>
            </div>
            <p v-if="capturing" class="ctl-note">{{ t('umbrella.kb.press') }}</p>
            <ul class="binds">
              <li v-for="a in ACTIONS" :key="a" class="ctl-row">
                <span>{{ t(ACTION_NAME[a]) }}</span>
                <button type="button" class="bind-key" :class="{ waiting: capturing === a }" :aria-label="t(ACTION_NAME[a])" @click="startCapture(a)">{{ capturing === a ? '…' : keyLabel(primaryCode(a), t) }}</button>
              </li>
            </ul>
          </div>
          <div v-else class="tab-body audio" role="tabpanel">
            <label v-if="MUSIC_ENABLED" class="vol">
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
.ctl { display: flex; flex-direction: column; gap: 8px; }
.ctl-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ctl-name { font-weight: 700; }
.ctl-head { margin-top: 6px; }
.ctl-note { margin: -4px 0 0; font-size: 0.85em; opacity: 0.8; }
.ctl-select { padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(0, 0, 0, 0.35); color: inherit; font: inherit; cursor: pointer; }
.ctl-select option { background: #1a1f2e; color: #fff; }
.ctl-reset { padding: 4px 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); font-size: 0.85em; font-weight: 700; }
.ctl-reset:disabled { opacity: 0.45; cursor: default; }
.binds { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.bind-key {
  min-width: 2.6em;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-bottom-width: 3px;
  background: rgba(255, 255, 255, 0.1);
  font: 700 14px system-ui, sans-serif;
  white-space: nowrap;
  cursor: pointer;
}
.bind-key.waiting { background: #fbbf24; color: #1a1f2e; animation: key-wait 0.9s ease-in-out infinite; }
@keyframes key-wait { 50% { transform: scale(1.08); } }
.ui-lantern .bind-key { color: #2a1d3a; background: linear-gradient(180deg, #fffaf0, #e8d6b0); border-color: #2a1d3a; }

.ui-lantern .bind-key.waiting { background: #fbbf24; color: #1a1f2e; }

/* ── Themed (lantern) ── */
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

@media (max-width: 400px) {
  .ui-theme .pause { padding-inline: 20px; }
  .ui-lantern .pause-btn { padding-inline: 32px; font-size: 17px; }
  
}
.ui-lantern .pause-title { color: #7e1a17; }

</style>
