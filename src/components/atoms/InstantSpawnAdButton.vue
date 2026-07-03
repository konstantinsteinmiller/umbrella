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
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import IconMovie from '@/components/icons/IconMovie.vue'

const { t } = useI18n()
const game = usePrismGame()
const { playSound } = useSounds()

const busy = ref(false)

const countdown = computed(() => {
  const s = Math.ceil(game.instantSpawnRemainingMs.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

const onWatch = async (): Promise<void> => {
  if (busy.value || game.instantSpawnActive.value) return
  busy.value = true
  try {
    const ok = await showRewardedAd()
    if (ok) {
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
  div.relative(v-if="game.instantSpawnActive.value")
    div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#7a5a00]")
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2.instant-live(
      class="py-2 bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
    )
      svg(viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="currentColor")
        path(d="M13 2 L5 13 h5 l-1 9 l8 -11 h-5 Z" stroke="#7a3000" stroke-width="1.4" stroke-linejoin="round")
      span.text-white.font-black.game-text.tabular-nums(class="text-xs sm:text-sm") {{ countdown }}

  //- Offer (only while a rewarded ad can actually fill)
  button.relative.cursor-pointer.transition-transform(
    v-else-if="isRewardedReady"
    class="active:scale-95 hover:scale-[102%] disabled:opacity-50"
    :disabled="busy"
    :aria-label="t('prism.instantSpawn')"
    @click="onWatch"
  )
    div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#7a5a00]")
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2(
      class="py-2 bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
    )
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
