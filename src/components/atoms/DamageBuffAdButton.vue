<script setup lang="ts">
/**
 * Rewarded "2× Damage" placement — sits right of the Spawn button (it
 * replaced the old tap-meter pips; the spawn button's radial icon reveal
 * already shows tap progress). Watching a rewarded ad doubles all fighter
 * damage for 2 minutes. While the buff runs the button turns into a crimson
 * m:ss countdown chip; otherwise it shows the ad offer. Hidden entirely when
 * no rewarded ad is ready (readiness gating — never show a button that can't
 * fill). `pulse` spotlights the button after the first boss kill (roadmap #2).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import useBattle from '@/use/useBattle'
import useSounds from '@/use/useSound'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import IconMovie from '@/components/icons/IconMovie.vue'

defineProps<{ pulse?: boolean }>()

const { t } = useI18n()
const battle = useBattle()
const { playSound } = useSounds()

const busy = ref(false)

const buffActive = computed(() => battle.dmgBuffRemainingMs.value > 0)
const countdown = computed(() => {
  const s = Math.ceil(battle.dmgBuffRemainingMs.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

const onWatch = async (): Promise<void> => {
  if (busy.value || buffActive.value) return
  busy.value = true
  try {
    const ok = await showRewardedAd()
    if (ok) {
      battle.activateDamageBuff()
      playSound('damage-buff', 0.06)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template lang="pug">
  //- Buff running → crimson countdown chip (not clickable)
  div.relative(v-if="buffActive")
    div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#7a1c1c]")
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2.dmg-live(
      class="py-2 bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]"
    )
      //- Crossed-swords glyph
      svg(viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
        path(d="M4 4 L15 15 M13 15 L15 15 L15 13")
        path(d="M20 4 L9 15 M11 15 L9 15 L9 13")
        path(d="M6 17 L8 19 M18 17 L16 19")
      span.text-white.font-black.game-text.tabular-nums(class="text-xs sm:text-sm") {{ countdown }}

  //- Offer (only while a rewarded ad can actually fill)
  button.relative.cursor-pointer.transition-transform(
    v-else-if="isRewardedReady"
    class="active:scale-95 hover:scale-[102%] disabled:opacity-50"
    :class="{ 'dmg-pulse': pulse }"
    :disabled="busy"
    :aria-label="t('prism.doubleDamage')"
    @click="onWatch"
  )
    div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#7a1c1c]")
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2(
      class="py-2 bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]"
    )
      IconMovie(class="w-4 h-4 sm:w-5 sm:h-5 shrink-0")
      span.text-white.font-black.uppercase.game-text.leading-none(class="text-[9px] sm:text-[11px]") {{ t('prism.doubleDamage') }}
</template>

<style scoped lang="sass">
.dmg-live
  animation: dmg-glow 1s ease-in-out infinite alternate

@keyframes dmg-glow
  from
    box-shadow: 0 0 4px rgba(255, 90, 40, 0.5)
  to
    box-shadow: 0 0 14px rgba(255, 90, 40, 0.95)

// First-boss spotlight (roadmap #2)
.dmg-pulse
  animation: dmg-pulse 0.8s ease-in-out infinite
@keyframes dmg-pulse
  0%, 100%
    transform: scale(1)
    filter: drop-shadow(0 0 0 rgba(255, 120, 60, 0))
  50%
    transform: scale(1.1)
    filter: drop-shadow(0 0 10px rgba(255, 120, 60, 0.9))
</style>
