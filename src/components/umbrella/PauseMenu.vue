<script setup lang="ts">
/**
 * The game's pause menu: Resume, Restart, Settings. Settings opens tabs; the
 * General tab holds the language dropdown. The scene stops the simulation
 * while this is open.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSelect from './LanguageSelect.vue'

const emit = defineEmits<{ resume: []; restart: [] }>()
const { t } = useI18n()

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
  <div class="pause-back" @click.self="emit('resume')">
    <div class="pause" role="dialog" aria-modal="true" :aria-label="t('umbrella.pause.title')">
      <template v-if="view === 'menu'">
        <b class="pause-title">⏸ {{ t('umbrella.pause.title') }}</b>
        <button class="pause-btn primary" @click="emit('resume')">▶ {{ t('umbrella.pause.resume') }}</button>
        <button class="pause-btn" @click="emit('restart')">↻ {{ t('umbrella.restart') }}</button>
        <button class="pause-btn" @click="view = 'settings'">⚙ {{ t('umbrella.pause.settings') }}</button>
      </template>
      <template v-else>
        <div class="pause-head">
          <button class="pause-icon" :aria-label="t('umbrella.back')" @click="view = 'menu'">‹</button>
          <b class="pause-title">⚙ {{ t('umbrella.pause.settings') }}</b>
        </div>
        <div class="tabs" role="tablist">
          <button role="tab" class="tab" :class="{ on: tab === 'general' }" :aria-selected="tab === 'general'" @click="tab = 'general'">{{ t('options.general') }}</button>
        </div>
        <div v-if="tab === 'general'" class="tab-body" role="tabpanel">
          <LanguageSelect />
        </div>
      </template>
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
</style>
