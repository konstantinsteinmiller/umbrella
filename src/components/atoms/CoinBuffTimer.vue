<script setup lang="ts">
/**
 * "3× coins for 09:58" chip — sits immediately LEFT of the wallet in the top
 * bar while the rewarded coin buff is running, so the multiplier is visible at
 * the exact place the player watches their gold go up.
 *
 * Renders nothing when no buff is active, so it costs no layout the rest of the
 * time. The clock counts PLAY time (see `coinBuffRemainingMs` in `useBattle`) —
 * it deliberately freezes behind a menu or an ad, because the buff itself does.
 */
import { computed } from 'vue'
import { coinBuffRemainingMs, isCoinBuffActive, COIN_BUFF_MULT } from '@/use/useBattle'
import { isCompactHud } from '@/use/useUser'
import IconCoin from '@/components/icons/IconCoin.vue'

/** m:ss — ceil so a live buff never shows 0:00 while still granting coins. */
const clock = computed(() => {
  const total = Math.ceil(coinBuffRemainingMs.value / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
})
</script>

<template lang="pug">
  Transition(
    enter-active-class="transition-all duration-200"
    leave-active-class="transition-all duration-200"
    enter-from-class="opacity-0 scale-75"
    leave-to-class="opacity-0 scale-75"
  )
    div.coin-buff-timer.relative.flex.items-center.rounded-full.font-bold(
      v-if="isCoinBuffActive"
      :class="isCompactHud\
        ? 'gap-0.5 pl-0.5 pr-1.5 py-0 coin-buff-timer--compact'\
        : 'gap-1 pl-1 pr-2.5 py-1'"
    )
      div.coin-buff-timer__icon.flex.items-center.justify-center.rounded-full.shrink-0(
        :class="isCompactHud ? 'w-5 h-5' : 'w-7 h-7'"
      )
        IconCoin(
          class="text-yellow-100 drop-shadow"
          :class="isCompactHud ? 'w-3.5 h-3.5' : 'w-5 h-5'"
        )
      span.coin-buff-timer__mult.game-text(
        :class="isCompactHud ? 'text-[10px]' : 'text-sm'"
      ) {{ COIN_BUFF_MULT }}×
      span.coin-buff-timer__clock.game-text.tabular-nums(
        :class="isCompactHud ? 'text-[10px]' : 'text-sm'"
      ) {{ clock }}
</template>

<style scoped lang="sass">
.coin-buff-timer
  // Rainbow frame, echoing the offer button that granted it — the player should
  // recognise "this is that thing I watched the video for".
  border: 2px solid transparent
  background: linear-gradient(180deg, #2a1a4a 0%, #140c28 100%) padding-box, conic-gradient(from 0deg, #ff3b3b, #ff9f1c, #ffe600, #38f56b, #2ad4ff, #7b5cff, #ff4bd8, #ff3b3b) border-box
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 4px 10px rgba(0, 0, 0, 0.5), 0 0 12px rgba(255, 230, 0, 0.35)

  &--compact
    border-width: 1px

.coin-buff-timer__icon
  background: radial-gradient(circle at 30% 30%, #fff7b0 0%, #fcd34d 35%, #b8860b 100%)
  box-shadow: 0 0 8px rgba(252, 211, 77, 0.7), inset 0 -2px 3px rgba(0, 0, 0, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.6)
  border: 1px solid #78350f

.coin-buff-timer__mult
  color: #ffe600
  text-shadow: 0 1px 0 #000, 0 0 6px rgba(255, 230, 0, 0.7)

.coin-buff-timer__clock
  color: #fff7d6
  text-shadow: 0 1px 0 #000
</style>
