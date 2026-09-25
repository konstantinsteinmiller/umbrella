<script setup lang="ts">
/**
 * The spotlight lessons on stage (`lessonSpotlight.ts` holds the moment and
 * its pause; the coach decides when): the threat countdown (ThreatSpot) and
 * the speed / luck / bounty chips (UpgradeSpot). This shell owns the clock,
 * the fade in and out, the tap that skips and the screen-reader sentence.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useSounds from '@/use/useSound'
import ThreatSpot from '@/components/barrage/coach/ThreatSpot.vue'
import UpgradeSpot from '@/components/barrage/coach/UpgradeSpot.vue'
import { finishSpot, lessonSpot, registerSpotView, type Spot, type ThreatSpot as ThreatDraft, type UpgradeSpot as UpgradeDraft } from '@/components/barrage/lessonSpotlight'

const { t } = useI18n()
const { playSound } = useSounds()

const spot = computed<Spot | null>(() => lessonSpot.value)
const threat = computed(() => (spot.value?.kind === 'threat' ? (spot.value as Spot & ThreatDraft) : null))
const upgrade = computed(() => (spot.value && spot.value.kind !== 'threat' ? (spot.value as Spot & UpgradeDraft) : null))

const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const now = ref(0)
let t0 = 0
let raf = 0
const tick = (tm: number): void => {
  if (!t0) t0 = tm
  now.value = tm - t0
  raf = requestAnimationFrame(tick)
}
const start = (): void => {
  cancelAnimationFrame(raf)
  t0 = 0
  now.value = 0
  raf = requestAnimationFrame(tick)
  playSound('anchor-swap', 0.04, 0.9)
}
watch(() => spot.value?.seq, (s) => { if (s) start(); else cancelAnimationFrame(raf) })

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const layerOpacity = computed(() => {
  const s = spot.value
  if (!s) return 0
  return clamp01(now.value / 220) * (1 - clamp01((now.value - (s.ms - 300)) / 300))
})

const srText = computed(() => {
  const s = spot.value
  if (!s) return ''
  return s.kind === 'threat'
    ? t('barrage.coach.spot.threat')
    : t(`barrage.coach.spot.${s.kind}`, { name: t(`barrage.upgrades.${s.kind}.name`) })
})

const skip = (): void => { finishSpot() }
const onKey = (e: KeyboardEvent): void => {
  if (!spot.value) return
  if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    skip()
  }
}

let unregister: (() => void) | null = null
onMounted(() => {
  unregister = registerSpotView()
  window.addEventListener('keydown', onKey)
  if (spot.value) start()
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKey)
  unregister?.()
  // Never leave the game paused behind a view that is gone.
  finishSpot()
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- `data-coach-live`: the playtest harness's moment marker.
    div.sr-only(aria-live="polite" data-coach-live="spot") {{ srText }}
    div.lesson-spot.hud-digits.fixed.inset-0(
      v-if="spot"
      :key="spot.seq"
      :style="{ opacity: layerOpacity }"
      role="button"
      tabindex="0"
      :aria-label="t('barrage.coach.skipAria')"
      @pointerdown.prevent
      @click="skip"
    )
      ThreatSpot(v-if="threat" :spot="threat" :now="now" :reduced="reduced")
      UpgradeSpot(v-else-if="upgrade" :spot="upgrade" :now="now" :reduced="reduced")
</template>

<style scoped lang="sass">
// With the merge lightbox and the "+1" spotlight, above everything (the game is paused).
.lesson-spot
  z-index: 80
  cursor: pointer
  touch-action: none
  -webkit-tap-highlight-color: transparent
  outline: none
</style>
