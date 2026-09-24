<script setup lang="ts">
/**
 * The upgrade funnel on screen (useCoach `upgradeFunnel` decides when): runic
 * gold arrows on the chip, and — unless a shot lesson has the stage (`quiet`)
 * — the loop that pays for it and presses it: coins fly from the wallet into
 * the chip, the ghost hand presses, the effect lands (UpgradeDemo `pay`).
 *
 * Nothing of it covers the board: the arrows are placed off the board rect,
 * the coins take the screen edge when the straight way would cross it.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { UpgradeId } from '@/barrage/engine/types'
import { emitSparkle } from '@/use/usePrismParticles'
import { boardApi, UPGRADE_INSCRIPTION } from '@/components/barrage/barrageUi'
import RuneArrows from '@/components/barrage/coach/RuneArrows.vue'
import UpgradeDemo from '@/components/barrage/coach/UpgradeDemo.vue'

interface Box { left: number; top: number; width: number; height: number }

const props = defineProps<{
  target: UpgradeId
  /** A shot lesson shares the screen: arrows only, no second hand. */
  quiet: boolean
}>()

const chip = ref<Box | null>(null)
const board = ref<Box | null>(null)
const vw = ref(0)
const vh = ref(0)

const boxOf = (r: DOMRect | null | undefined): Box | null =>
  r && r.width > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null

const measure = (): void => {
  chip.value = boxOf(document.querySelector(`[data-tut="upgrade-${props.target}"]`)?.getBoundingClientRect())
  board.value = boxOf(boardApi.value?.boardClientRect())
  vw.value = window.innerWidth
  vh.value = window.innerHeight
}

// Gold sparks off the chip on the arrows' beat (the particle layer, so they
// fly free of the chip's own clipping).
const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
let sparkTimer = 0
let poll = 0
const spark = (): void => {
  const c = chip.value
  if (!c || reduced) return
  emitSparkle(c.left + c.width / 2, c.top + c.height * 0.3, '#ffd54a', 4)
}

watch(() => props.target, measure)
onMounted(() => {
  measure()
  // The chips re-flow (a wrapped translation, a resize, the tray growing):
  // a cheap re-measure keeps the arrows on their chip.
  poll = window.setInterval(measure, 300)
  sparkTimer = window.setInterval(spark, 950)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  window.clearInterval(poll)
  window.clearInterval(sparkTimer)
  window.removeEventListener('resize', measure)
})

const inscription = computed(() => UPGRADE_INSCRIPTION[props.target])
</script>

<template lang="pug">
  div.upgrade-funnel(aria-hidden="true")
    RuneArrows(
      v-if="chip"
      :target="chip"
      :avoid="board"
      :inscription="inscription"
      :vw="vw"
      :vh="vh"
    )
    UpgradeDemo(v-if="!quiet" :key="target" :id="target" :ring="false" :pay="true")
</template>
