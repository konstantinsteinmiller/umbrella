<script setup lang="ts">
/**
 * Flying chest reward (retention-roadmap #1B). Every 2 minutes a winged
 * chest drifts across the arena left → right (~7 s). Tapping it opens it:
 * 50/50 it pays gold (150 + 75·wave, scaling with progress) or drops a copy of
 * the SECOND-best fighter on the field into the merge grid (fallback: a tier-2
 * unit when fewer than two fighters stand; fallback gold when the grid is full).
 * Untapped chests fly
 * off and the timer restarts — a soft "watch the battlefield" pull.
 *
 * Mounted inside the BattleArena root (absolute overlay). The countdown only
 * ticks while the game is unpaused, so ads/modals never eat a chest.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import usePrismGame from '@/use/usePrismGame'
import useBattle from '@/use/useBattle'
import useEpicConfig from '@/use/useEpicConfig'
import useSounds from '@/use/useSound'
import { isGamePaused } from '@/use/useGamePause'
import { artSrc } from '@/use/useArtOverrides'
import { prependBaseUrl } from '@/utils/function'
import { emitConfetti, emitSparkle } from '@/use/usePrismParticles'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'

const props = defineProps<{
  /** Wallet badge element — gold payouts fly coins into it. */
  coinTarget?: HTMLElement | null
}>()

const CHEST_INTERVAL_MS = 120_000
const CHEST_FLIGHT_MS = 7_000
// Gold payout scales with progress so the chest stays relevant late-game:
// 150 base + 75 per wave reached.
const CHEST_GOLD_BASE = 150
const CHEST_GOLD_PER_WAVE = 75
const chestGold = (): number => CHEST_GOLD_BASE + battle.wave.value * CHEST_GOLD_PER_WAVE

const game = usePrismGame()
const battle = useBattle()
const { addCoins } = useEpicConfig()
const { playSound } = useSounds()

const active = ref(false)
/** Vertical flight lane, % of arena height (kept in the upper air band). */
const laneY = ref(20)
const chestRef = ref<HTMLElement | null>(null)

const chestArt = computed(() =>
  artSrc('flying-chest') ?? prependBaseUrl('images/icons/chest_128x128.webp'))

let remainingMs = CHEST_INTERVAL_MS
let ticker = 0
let flightTimer = 0

const launch = (): void => {
  laneY.value = 12 + Math.random() * 30
  active.value = true
  playSound('chest-flyby', 0.03)
  // Missed → it flies off; either way the cycle restarts.
  window.clearTimeout(flightTimer)
  flightTimer = window.setTimeout(() => { active.value = false }, CHEST_FLIGHT_MS)
}

const tick = (): void => {
  if (isGamePaused.value || active.value) return
  remainingMs -= 1000
  if (remainingMs <= 0) {
    remainingMs = CHEST_INTERVAL_MS
    launch()
  }
}

/** Copy of the 2nd-best fighter on the field; tier 2 when unavailable. */
const secondBestTier = (): number => {
  const tiers = battle.fighters.value.map((f) => f.tier).sort((a, b) => b - a)
  return tiers.length >= 2 ? tiers[1]! : 2
}

const onOpen = (e: PointerEvent): void => {
  if (!active.value) return
  active.value = false
  window.clearTimeout(flightTimer)
  playSound('chest-open', 0.05)

  // The two outcomes must be visually DISTINCT — a generic gold-tinted
  // particle shower on the unit branch reads as a coin burst that never
  // paid out. Unit drop: white sparkle at the chest + spawn-pop feedback at
  // the landing grid slot. Gold: the coin explosion into the wallet.
  const wantsUnit = Math.random() < 0.5
  if (wantsUnit) {
    const idx = game.spawnUnitAt(secondBestTier())
    if (idx >= 0) {
      playSound('unit-spawn', 0.04, 1.1)
      emitSparkle(e.clientX, e.clientY, '#ffffff', 10)
      const slot = document.querySelector<HTMLElement>(`[data-slot="${idx}"]`)
      const r = slot?.getBoundingClientRect()
      if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, '#ffffff', 12)
      return
    }
  }
  // Gold branch (also the fallback when the grid is full).
  emitConfetti(e.clientX, e.clientY, 18, 1.2)
  addCoins(chestGold())
  if (props.coinTarget && chestRef.value) {
    spawnCoinExplosion({ sourceEl: chestRef.value, targetEl: props.coinTarget, count: 12 })
  }
}

onMounted(() => { ticker = window.setInterval(tick, 1000) })
onUnmounted(() => {
  window.clearInterval(ticker)
  window.clearTimeout(flightTimer)
})
</script>

<template lang="pug">
  div.absolute.inset-0.pointer-events-none.overflow-hidden(class="z-[1155]")
    button.chest-fly.absolute.pointer-events-auto.cursor-pointer(
      v-if="active"
      ref="chestRef"
      :style="{ top: laneY + '%', animationDuration: CHEST_FLIGHT_MS + 'ms' }"
      @pointerdown.stop.prevent="onOpen"
    )
      div.chest-bob
        img.chest-img(:src="chestArt" alt="" draggable="false")
</template>

<style scoped lang="sass">
.chest-fly
  left: -12%
  width: clamp(68px, 24cqmin, 112px)
  height: clamp(68px, 24cqmin, 112px)
  animation-name: chest-cross
  animation-timing-function: linear
  animation-fill-mode: forwards

@keyframes chest-cross
  from
    transform: translateX(0)
  to
    transform: translateX(115cqw)

.chest-bob
  width: 100%
  height: 100%
  animation: chest-bob 0.9s ease-in-out infinite alternate

@keyframes chest-bob
  from
    transform: translateY(-8%) rotate(-4deg)
  to
    transform: translateY(8%) rotate(4deg)

.chest-img
  width: 100%
  height: 100%
  object-fit: contain
  filter: drop-shadow(0 0 8px rgba(255, 205, 0, 0.75)) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.4))
</style>
