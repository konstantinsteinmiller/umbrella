<script setup lang="ts">
/** 0–5 stars for a community level, asked after the player won or failed it. Themed in the lantern / clay builds. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { rateLevel } from '@/umbrella/community'
import PanelOrnaments from './ornaments/PanelOrnaments.vue'
import BtnOrnaments from './ornaments/BtnOrnaments.vue'
import UiGlyph from './ornaments/UiGlyph.vue'

const props = defineProps<{ levelId: string; name: string }>()
const emit = defineEmits<{ done: []; close: [] }>()
const { t } = useI18n()

const stars = ref<number | null>(null)
const state = ref<'idle' | 'sending' | 'thanks' | 'error'>('idle')
const send = async () => {
  if (stars.value === null) return
  state.value = 'sending'
  const res = await rateLevel(props.levelId, stars.value)
  state.value = res ? 'thanks' : 'error'
  if (res) window.setTimeout(() => emit('done'), 900)
}
</script>

<template>
  <div class="rate-back u-backdrop" @click.self="emit('close')">
    <div class="rate u-panel u-modal" role="dialog" aria-modal="true" :aria-label="t('umbrella.rateLevel')">
      <PanelOrnaments />
      <b class="rate-title u-title">{{ t('umbrella.rate.title', { name }) }}</b>
      <div class="rate-stars" role="radiogroup" :aria-label="t('umbrella.rateLevel')">
        <button
          v-for="n in 6"
          :key="n - 1"
          class="rate-star"
          :class="{ zero: n === 1, on: stars !== null && n - 1 <= stars && n > 1, picked: stars === n - 1 }"
          :style="{ '--i': n - 1 }"
          role="radio"
          :aria-checked="stars === n - 1"
          :aria-label="t('umbrella.rate.stars', { n: n - 1 })"
          @click="stars = n - 1"
        ><template v-if="n === 1">0</template><UiGlyph v-else name="star" fallback="★" /></button>
      </div>
      <p v-if="state === 'thanks'" class="rate-note u-ok"><UiGlyph name="check" fallback="✓" /> {{ t('umbrella.rate.thanks') }}</p>
      <p v-else-if="state === 'error'" class="rate-note warn u-warn"><UiGlyph name="warn" fallback="⚠" /> {{ t('umbrella.rate.error') }}</p>
      <div class="rate-actions">
        <button class="rate-btn u-btn" @click="emit('close')"><BtnOrnaments />{{ t('umbrella.rate.skip') }}</button>
        <button class="rate-btn green u-btn u-primary" :disabled="stars === null || state === 'sending' || state === 'thanks'" @click="send"><BtnOrnaments />{{ t('umbrella.rate.send') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rate-back { position: absolute; inset: 0; z-index: 11; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, 0.5); }
.rate {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #1a1f2e;
  color: #fff;
}
.rate-title { font-size: 18px; text-align: center; }
.rate-stars { display: flex; gap: 6px; }
.rate-star { width: 46px; height: 46px; border-radius: 10px; background: rgba(255, 255, 255, 0.08); font-size: 26px; color: rgba(255, 255, 255, 0.35); }
.rate-star.zero { font-size: 18px; font-weight: 800; }
.rate-star.on { color: #facc15; }
.rate-star.picked { outline: 2px solid #60a5fa; }
.rate-note { margin: 0; color: #6ee7b7; }
.rate-note.warn { color: #fbbf24; }
.rate-actions { display: flex; gap: 10px; }
.rate-btn { padding: 8px 16px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); font-weight: 700; }
.rate-btn.green { background: #059669; }
.rate-btn:disabled { opacity: 0.45; }

/* ── Themed (lantern / clay) ── */
.ui-theme .rate-back { padding: 52px 16px 44px; }
.ui-theme .rate { width: min(440px, 100%); padding: 42px 22px 26px; gap: 16px; }
.ui-theme .rate > :not(.lpo, .cpo) { position: relative; z-index: 4; }
.ui-theme .rate-title { font-size: 22px; line-height: 1.25; text-wrap: balance; }
.ui-theme .rate-stars { gap: 6px; }
.ui-theme .rate-star {
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 800;
  cursor: pointer;
  transition: transform var(--u-t) var(--u-ease-spring), filter var(--u-t) ease, color var(--u-t) ease;
  animation: var(--u-tile-in) 0.5s var(--u-ease-out) backwards;
  animation-delay: calc(var(--i) * 45ms + 180ms);
}
.ui-theme .rate-star.zero { font-size: 19px; }
.ui-theme .rate-star:hover { transform: translateY(-3px) rotate(-6deg); filter: brightness(1.12); }
.ui-theme .rate-star:active { transform: scale(0.88); transition-duration: var(--u-t-fast); }
.ui-theme .rate-star:focus-visible { outline: 2.5px solid var(--u-focus); outline-offset: 3px; }
.ui-theme .rate-star.picked { outline: none; transform: scale(1.12); }
.ui-theme .rate-star.picked:focus-visible { outline: 2.5px solid var(--u-focus); outline-offset: 3px; }
.ui-theme .rate-star.on .ui-glyph { filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.35)) drop-shadow(0 0 6px rgba(255, 196, 64, 0.75)); }
.ui-theme .rate-note { font-weight: 800; }
.ui-theme .rate { width: min(480px, 100%); }
.ui-theme .rate-actions { width: 100%; flex-wrap: wrap; gap: 12px; }
.ui-theme .rate-btn { flex: 1 1 auto; min-height: 50px; padding: 10px 34px; font-size: 17px; white-space: nowrap; }
.ui-clay .rate-btn { padding-inline: 22px; }
.ui-lantern .rate-star { border-radius: 7px; background: linear-gradient(180deg, #342c6e, #1b163f); color: rgba(251, 241, 220, 0.3); box-shadow: 0 0 0 1.5px #2a1d3a, inset 0 0 0 3px #1b163f, inset 0 0 0 4px rgba(232, 180, 80, 0.55), 0 3px 0 1px #110d2a; }
.ui-lantern .rate-star.on { color: #ffd23f; }
.ui-lantern .rate-star.picked { box-shadow: 0 0 0 1.5px #2a1d3a, 0 0 0 3.5px #ffe7a6, inset 0 0 0 3px #1b163f, inset 0 0 0 4px #e8b450, 0 0 18px rgba(255, 170, 70, 0.7); }
.ui-lantern .rate-star.zero { color: #fbf1dc; }
.ui-clay .rate-star { border-radius: 14px; background: #e6dac0; color: #b9ab90; box-shadow: inset 0 3px 5px rgba(110, 85, 45, 0.35), inset 0 -1px 0 rgba(255, 255, 255, 0.9); }
.ui-clay .rate-star.on { color: #f1b72f; }
.ui-clay .rate-star.on .ui-glyph { filter: drop-shadow(0 1.5px 0 #a9760a) drop-shadow(0 0 4px rgba(255, 200, 60, 0.5)); }
.ui-clay .rate-star.picked { background: radial-gradient(130% 150% at 30% 12%, #8fb1e6, #2f5fa8 50%, #1d3f78); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.4), 0 3px 0 #173464; }
.ui-clay .rate-star.zero { color: #66615a; }
.ui-clay .rate-star.zero.picked { color: #fffaf0; }
</style>
