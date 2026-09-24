<script setup lang="ts">
/**
 * The turn's one contextual control, in the thumb row under the board:
 *
 *   aim    → rewarded "+5 balls" (movie icon, or its coin price on coin-mode
 *            builds) — ONLY while `bonusBallsAvailable` (rewarded readiness
 *            gating: never a dead button).
 *   volley → SKIP (recall: end a slow volley now) + the auto fast-forward
 *            ×2/×3 pill.
 *
 * Slow volleys are the genre's classic late-game tedium; recall is the escape
 * hatch, so it is big, central and thumb-reachable — never tucked in a corner.
 * But it only appears once a volley has run RECALL_AFTER_S, and never during
 * the FTUE (`recallVisible`): shown at every volley it read as the button
 * that "confirms" a shot, and first-timers cut every volley short with it.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import useReward, { formatCost } from '@/use/useReward'
import useSounds from '@/use/useSound'
import { isCompactHud, isRoomyHud } from '@/use/useUser'
import { tutorialActive } from '@/use/useTutorial'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { recallVisible } from '@/components/barrage/barrageUi'

/** CONTRACT §8: the rewarded bonus is "+5 balls". */
const BONUS_BALLS = 5

const { t } = useI18n()
const barrage = useBarrage()
const { buffsCostCoins, REWARD_COIN_COST } = useReward()
const { playSound } = useSounds()

const phase = computed(() => barrage.phase.value)
const inVolley = computed(() => phase.value === 'volley')
const busy = ref(false)

const showBonus = computed(() => phase.value === 'aim' && barrage.bonusBallsAvailable.value)
const speed = computed(() => barrage.speedMul.value)

// How long the running volley has lasted, from the engine's own clock: it
// stands still while the game is paused (an ad, a hidden tab), so a paused
// volley never "runs long" and grows a skip button behind the ad.
const volleySeconds = ref(0)
let volleyPoll = 0
const readVolleyClock = (): void => {
  const s = barrage.engine.value.state
  volleySeconds.value = s.phase === 'volley' ? s.phaseTime : 0
}
watch(phase, (p) => {
  window.clearInterval(volleyPoll)
  volleySeconds.value = 0
  if (p === 'volley') volleyPoll = window.setInterval(readVolleyClock, 200)
}, { immediate: true })
onUnmounted(() => window.clearInterval(volleyPoll))

const showRecall = computed(() => recallVisible(phase.value, volleySeconds.value, tutorialActive.value))
const showVolleyRow = computed(() => showRecall.value || (inVolley.value && speed.value > 1))

const onRecall = (): void => {
  if (!inVolley.value) return
  barrage.recall()
  playSound('anchor-swap', 0.04, 0.9)
}

const onBonus = async (): Promise<void> => {
  if (busy.value) return
  busy.value = true
  try {
    if (await barrage.claimBonusBalls()) playSound('reward-continue', 0.06)
  } finally {
    busy.value = false
  }
}

const bonusAria = computed(() => buffsCostCoins
  ? t('barrage.turn.bonusCoinAria', { n: BONUS_BALLS, cost: formatCost(REWARD_COIN_COST) })
  : t('barrage.turn.bonusAdAria', { n: BONUS_BALLS }))

const btnH = computed(() => isCompactHud.value ? 'h-11' : isRoomyHud.value ? 'h-14' : 'h-12')
const labelClass = computed(() => isCompactHud.value ? 'text-sm' : isRoomyHud.value ? 'text-lg' : 'text-base')
</script>

<template lang="pug">
  div.turn-controls.flex.items-center.justify-center.gap-1_5.min-w-0
    //- ── Aim: rewarded +5 balls ──
    Transition(name="turn-pop" mode="out-in")
      button.turn-btn.turn-btn--bonus.relative.flex.items-center.rounded-xl.border-2.px-2.cursor-pointer(
        v-if="showBonus"
        key="bonus"
        type="button"
        class="gap-1 border-[#0f1a30] active:scale-95 transition-transform"
        :class="[btnH, { 'opacity-60': busy }]"
        :aria-label="bonusAria"
        :title="bonusAria"
        :disabled="busy"
        @click="onBonus"
      )
        template(v-if="buffsCostCoins")
          IconCoin.w-5.h-5.shrink-0
          span.game-text.font-black.text-white.leading-none(class="text-xs") {{ formatCost(REWARD_COIN_COST) }}
        IconMovie.w-6.h-6.shrink-0(v-else)
        span.game-text.font-black.text-white.leading-none.whitespace-nowrap(:class="labelClass") {{ t('barrage.turn.bonus', { n: BONUS_BALLS }) }}
        span.turn-ball.w-4.h-4.shrink-0(aria-hidden="true")
      //- ── Volley: skip (recall) once it runs long + fast-forward ──
      div.flex.items-center.gap-1_5(v-else-if="showVolleyRow" key="volley")
        Transition(name="turn-pop")
          button.turn-btn.turn-btn--recall.relative.flex.items-center.justify-center.rounded-xl.border-2.cursor-pointer(
            v-if="showRecall"
            type="button"
            class="border-[#0f1a30] active:scale-95 transition-transform min-w-12 px-3 gap-1"
            :class="btnH"
            :aria-label="t('barrage.turn.recall')"
            :title="t('barrage.turn.recall')"
            @click="onRecall"
          )
            BarrageGlyph.w-6.h-6.text-white(name="skip")
        Transition(name="turn-pop")
          span.speed-pill.flex.items-center.rounded-full.px-2.py-1.game-text.font-black.text-white(
            v-if="speed > 1"
            class="gap-0.5 text-sm"
            role="status"
            :aria-label="t('barrage.turn.fastAria', { n: speed })"
          )
            BarrageGlyph.w-4.h-4(name="fast")
            span.leading-none {{ t('barrage.turn.speed', { n: speed }) }}
</template>

<style scoped lang="sass">
.gap-1_5
  gap: 6px
.turn-btn
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 3px 0 var(--plate, #1a2b4b)
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5)
  touch-action: manipulation
.turn-btn--bonus
  --plate: #1c6b2a
  background: linear-gradient(180deg, #4fd16a, #27a03f)
  animation: bonus-breathe 1.4s ease-in-out infinite
.turn-btn--recall
  --plate: #102e7a
  background: linear-gradient(180deg, #50aaff, #2266ff)
// A ball glyph beside "+5" so the offer reads as "balls" before the words do.
.turn-ball
  border-radius: 50%
  background: radial-gradient(circle at 35% 30%, #fff 0%, #ffe27a 35%, #f08a1c 100%)
  box-shadow: 0 0 0 1.5px #0f1a30
.speed-pill
  background: rgba(8, 14, 30, 0.85)
  box-shadow: inset 0 0 0 1.5px rgba(255, 210, 58, 0.8)
  color: #ffe27a
@keyframes bonus-breathe
  0%, 100%
    filter: drop-shadow(0 0 0 rgba(120, 255, 150, 0))
  50%
    filter: drop-shadow(0 0 8px rgba(120, 255, 150, 0.75))
.turn-pop-enter-active, .turn-pop-leave-active
  transition: opacity 0.18s ease, transform 0.18s ease
.turn-pop-enter-from, .turn-pop-leave-to
  opacity: 0
  transform: scale(0.85)
@media (prefers-reduced-motion: reduce)
  .turn-btn--bonus
    animation: none
</style>
