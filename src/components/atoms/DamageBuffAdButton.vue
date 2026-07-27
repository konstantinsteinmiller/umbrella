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
import useReward, { formatCost } from '@/use/useReward'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { isCompactHud, isUltraCompactHud } from '@/use/useUser'

defineProps<{ pulse?: boolean }>()

const { t } = useI18n()
const battle = useBattle()
const { playSound } = useSounds()
const { buffsCostCoins, REWARD_COIN_COST, rewardAvailable, canRedeem, redeem } = useReward()

const busy = ref(false)
const affordable = computed(() => canRedeem(REWARD_COIN_COST))

// Vertical padding only — see the matching note in InstantSpawnAdButton. Both
// bottom-row chips stay full-size thumb targets; the height budget is taken
// from the top bar and the upgrade row instead.
const padY = computed(() =>
  isUltraCompactHud.value ? 'py-1' : (isCompactHud.value ? 'py-1.5' : 'py-2'))

const buffActive = computed(() => battle.dmgBuffRemainingMs.value > 0)
const countdown = computed(() => {
  const s = Math.ceil(battle.dmgBuffRemainingMs.value / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})

const onWatch = async (): Promise<void> => {
  if (busy.value || buffActive.value) return
  if (buffsCostCoins && !affordable.value) return
  busy.value = true
  try {
    const ok = await redeem(REWARD_COIN_COST)
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
  //- Compact viewports trim only the VERTICAL padding here. This is a thumb
  //- target sitting next to SPAWN, so the frame, icon and label keep their size
  //- — the row's height budget comes from the top bar and the upgrade row
  //- instead. (`padY` is shared by both states below.)
  div.relative(v-if="buffActive")
    div.absolute.inset-0.rounded-xl(
      :class="[ 'bg-[#7a1c1c]', isCompactHud ? 'translate-y-0.5' : 'translate-y-1' ]"
    )
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2.dmg-live(
      class="bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]"
      :class="padY"
    )
      //- Crossed-swords glyph
      svg(viewBox="0 0 24 24" class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round")
        path(d="M4 4 L15 15 M13 15 L15 15 L15 13")
        path(d="M20 4 L9 15 M11 15 L9 15 L9 13")
        path(d="M6 17 L8 19 M18 17 L16 19")
      span.text-white.font-black.game-text.tabular-nums(class="text-xs sm:text-sm") {{ countdown }}

  //- Offer — coin mode shows the price + IconCoin (dimmed when unaffordable);
  //- ad mode shows the movie icon + label, gated on a fillable rewarded ad.
  button.relative.cursor-pointer.transition-transform(
    v-else-if="rewardAvailable"
    class="active:scale-95 hover:scale-[102%] disabled:opacity-50"
    :class="{ 'dmg-pulse': pulse }"
    :disabled="busy || (buffsCostCoins && !affordable)"
    :aria-label="t('prism.doubleDamage')"
    @click="onWatch"
  )
    div.absolute.inset-0.rounded-xl(
      :class="[ 'bg-[#7a1c1c]', isCompactHud ? 'translate-y-0.5' : 'translate-y-1' ]"
    )
    div.relative.flex.items-center.gap-1.rounded-xl.border-2.px-2(
      class="bg-gradient-to-b from-[#ff7a4d] to-[#d43a1f] border-[#0f1a30]"
      :class="padY"
    )
      //- Coin mode: effect label + compact price (🪙 1k); ad mode: movie + label.
      template(v-if="buffsCostCoins")
        span.text-white.font-black.uppercase.game-text.leading-none(class="text-[9px] sm:text-[11px]") {{ t('prism.doubleDamage') }}
        IconCoin(class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-100 shrink-0")
        span.text-yellow-100.font-black.game-text.leading-none.tabular-nums(class="text-[9px] sm:text-[11px]") {{ formatCost(REWARD_COIN_COST) }}
      template(v-else)
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
