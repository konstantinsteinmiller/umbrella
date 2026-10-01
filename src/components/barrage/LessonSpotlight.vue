<script setup lang="ts">
/**
 * The chip spotlights on screen (`lessonSpotlight.ts` holds the moment; the
 * coach decides when): speed / luck / bounty (UpgradeSpot). This shell owns
 * the clock, the fade in and out and the screen-reader sentence.
 *
 * Silent Flow: it plays over the running game — no pause, no dim, and
 * pointer-events none, so every tap still reaches the board. A shot ends it
 * at once (the volley changes the very board it was showing).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useSounds from '@/use/useSound'
import useBarrage from '@/barrage/state/useBarrage'
import { isAnyModalOpen } from '@/use/useModalState'
import UpgradeSpot from '@/components/barrage/coach/UpgradeSpot.vue'
import { finishSpot, lessonSpot, registerSpotView, type Spot } from '@/components/barrage/lessonSpotlight'

const { t } = useI18n()
const { playSound } = useSounds()
const barrage = useBarrage()

const spot = computed<Spot | null>(() => lessonSpot.value)

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
// A shot (or anything else leaving the aim phase) ends it, and so does a menu
// opening over the board.
watch(() => barrage.phase.value, (p) => { if (p !== 'aim' && spot.value) finishSpot() })
watch(isAnyModalOpen, (open) => { if (open && spot.value) finishSpot() })

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const layerOpacity = computed(() => {
  const s = spot.value
  if (!s) return 0
  return clamp01(now.value / 220) * (1 - clamp01((now.value - (s.ms - 300)) / 300))
})

const srText = computed(() => {
  const s = spot.value
  return s ? t(`barrage.coach.spot.${s.kind}`, { name: t(`barrage.upgrades.${s.kind}.name`) }) : ''
})

let unregister: (() => void) | null = null
onMounted(() => {
  unregister = registerSpotView()
  if (spot.value) start()
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  unregister?.()
  finishSpot()
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- `data-coach-live`: the playtest harness's moment marker.
    div.sr-only(aria-live="polite" data-coach-live="spot") {{ srText }}
    div.lesson-spot.hud-digits.fixed.inset-0.pointer-events-none(
      v-if="spot"
      :key="spot.seq"
      :style="{ opacity: layerOpacity }"
      aria-hidden="true"
    )
      UpgradeSpot(:spot="spot" :now="now" :reduced="reduced")
</template>

<style scoped lang="sass">
// Over the scene and the teleported top bar (55), under the modals' own layer
// rules: taps go straight through (pointer-events none on the whole layer).
.lesson-spot
  z-index: 60
</style>
