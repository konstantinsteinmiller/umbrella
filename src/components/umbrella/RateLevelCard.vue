<script setup lang="ts">
/** 0–5 stars for a community level, asked after the player won or failed it. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { rateLevel } from '@/umbrella/community'

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
  <div class="rate-back" @click.self="emit('close')">
    <div class="rate" role="dialog" aria-modal="true" :aria-label="t('umbrella.rateLevel')">
      <b class="rate-title">{{ t('umbrella.rate.title', { name }) }}</b>
      <div class="rate-stars" role="radiogroup" :aria-label="t('umbrella.rateLevel')">
        <button
          v-for="n in 6"
          :key="n - 1"
          class="rate-star"
          :class="{ zero: n === 1, on: stars !== null && n - 1 <= stars && n > 1, picked: stars === n - 1 }"
          role="radio"
          :aria-checked="stars === n - 1"
          :aria-label="t('umbrella.rate.stars', { n: n - 1 })"
          @click="stars = n - 1"
        >{{ n === 1 ? '0' : '★' }}</button>
      </div>
      <p v-if="state === 'thanks'" class="rate-note">✓ {{ t('umbrella.rate.thanks') }}</p>
      <p v-else-if="state === 'error'" class="rate-note warn">⚠ {{ t('umbrella.rate.error') }}</p>
      <div class="rate-actions">
        <button class="rate-btn" @click="emit('close')">{{ t('umbrella.rate.skip') }}</button>
        <button class="rate-btn green" :disabled="stars === null || state === 'sending' || state === 'thanks'" @click="send">{{ t('umbrella.rate.send') }}</button>
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
</style>
