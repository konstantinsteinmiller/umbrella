<script setup lang="ts">
/**
 * Rewarded "Instant Spawn" placement — sits left of the Spawn button.
 * Watching a rewarded ad grants 2 minutes of 1-tap spawns (normally 4 taps
 * per recruit, see `usePrismGame`). While the buff runs the button turns into
 * a golden m:ss countdown chip; otherwise it shows the ad offer. Hidden
 * entirely when no rewarded ad is ready (readiness gating — never show a
 * button that can't fill).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import usePrismGame from '@/use/usePrismGame'
import useSounds from '@/use/useSound'
import useReward, { formatCost } from '@/use/useReward'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { isCompactHud, isUltraCompactHud } from '@/use/useUser'

const { t } = useI18n()
const game = usePrismGame()
const { playSound } = useSounds()
const { buffsCostCoins, instantSpawnCost, rewardAvailable, canRedeem, redeem, markInstantSpawnBought } = useReward()

const busy = ref(false)
// Coin mode: dim/block the button when the player can't afford the buff.
const affordable = computed(() => canRedeem(instantSpawnCost.value))

// Vertical padding only. This chip sits beside SPAWN in the bottom row — all
// three are thumb targets, so the frame/icon/label never shrink; we just trade
// a few px of padding on small screens. Stays ≥28px tall even at the tightest.
const padY = computed(() =>
  isUltraCompactHud.value ? 'py-1' : (isCompactHud.value ? 'py-1.5' : 'py-2'))

const countdown = computed(() => {
  const s = Math.ceil(game.instantSpawnRemainingMs.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

const onWatch = async (): Promise<void> => {
  if (busy.value || game.instantSpawnActive.value) return
  if (buffsCostCoins && !affordable.value) return
  busy.value = true
  try {
    const cost = instantSpawnCost.value // capture before the discount flag flips
    const ok = await redeem(cost)
    if (ok) {
      if (buffsCostCoins) markInstantSpawnBought()
      game.activateInstantSpawn()
      playSound('instant-spawn', 0.06)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template lang="pug">
  //- Buff running → golden countdown chip (not clickable)
  //- Compact viewports trim only the VERTICAL padding here. This is a thumb
  //- target sitting next to SPAWN, so the frame, icon and label keep their size
  //- — the row's height budget comes from the top bar and the upgrade row
  //- instead. (`padY` is shared by both states below.)
  div.relative(v-if="game.instantSpawnActive.value")
    div.absolute.inset-0.rounded-xl(
      :class="[ 'bg-[#7a5a00]', isCompactHud ? 'translate-y-0.5' : 'translate-y-1' ]"
    )
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2.instant-live(
      class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
      :class="padY"
    )
      svg(viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor")
        path(d="M13 2 L5 13 h5 l-1 9 l8 -11 h-5 Z" stroke="#7a3000" stroke-width="1.4" stroke-linejoin="round")
      span.text-white.font-black.game-text.tabular-nums(class="text-xs sm:text-sm") {{ countdown }}

  //- Offer — coin mode shows the price + IconCoin (dimmed when unaffordable);
  //- ad mode shows the movie icon + label, gated on a fillable rewarded ad.
  button.relative.cursor-pointer.transition-transform(
    v-else-if="rewardAvailable"
    class="active:scale-95 hover:scale-[102%] disabled:opacity-50"
    :disabled="busy || (buffsCostCoins && !affordable)"
    :aria-label="t('prism.instantSpawn')"
    @click="onWatch"
  )
    div.absolute.inset-0.rounded-xl(
      :class="[ 'bg-[#7a5a00]', isCompactHud ? 'translate-y-0.5' : 'translate-y-1' ]"
    )
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2(
      class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
      :class="padY"
    )
      //- Coin mode: effect label + compact price (🪙 1k); ad mode: movie + label.
      template(v-if="buffsCostCoins")
        span.text-white.font-black.uppercase.game-text.leading-none(class="text-[9px] sm:text-[11px]") {{ t('prism.instantSpawn') }}
        IconCoin(class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-100 shrink-0")
        span.text-yellow-100.font-black.game-text.leading-none.tabular-nums(class="text-[9px] sm:text-[11px]") {{ formatCost(instantSpawnCost) }}
      template(v-else)
        IconMovie(class="w-4 h-4 sm:w-5 sm:h-5 text-white shrink-0")
        span.text-white.font-black.uppercase.game-text.leading-none(class="text-[9px] sm:text-[11px]") {{ t('prism.instantSpawn') }}
</template>

<style scoped lang="sass">
.instant-live
  animation: instant-glow 1s ease-in-out infinite alternate

@keyframes instant-glow
  from
    box-shadow: 0 0 4px rgba(255, 205, 0, 0.5)
  to
    box-shadow: 0 0 14px rgba(255, 205, 0, 0.95)
</style>
