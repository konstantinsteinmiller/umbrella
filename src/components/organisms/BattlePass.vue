<script setup lang="ts">
/**
 * The free-track battle pass (retention-roadmap #18), re-pointed at Elemental
 * Barrage: XP ticks off the barrage run (kills / merges / rows / bosses — see
 * `BARRAGE_XP_SOURCES`), and every 5th tier pays a free BALL drawn from the
 * player's own ball ladder (`bpBallTier`), so the cards re-price themselves
 * against the current watermark every time the modal opens and a veteran is
 * never handed a relic. The claim itself delivers the ball — it is owed to the
 * endless run and lands in its tray on the next turn.
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import useBattlePass, {
  BP_TOTAL_STAGES,
  BP_XP_PER_STAGE,
  BARRAGE_XP_SOURCES,
  bpReward
} from '@/use/useBattlePass'
import { formatBig } from '@/utils/bigNumber'
import useSounds from '@/use/useSound.ts'

const {
  currentXp,
  unlockedStages,
  hasUnclaimedReward,
  pendingClaimCount,
  isStageClaimed,
  isStageUnlocked,
  claimStage,
  isMaxed,
  daysUntilReset
} = useBattlePass()

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { t } = useI18n()
const { playSound } = useSounds()

const isModalOpen = ref(false)
const bpBtnRef = ref<HTMLElement | null>(null)

const inProgressStage = computed(() =>
  isMaxed.value ? 0 : unlockedStages.value + 1
)

const progressFraction = computed(() =>
  Math.max(0, Math.min(1, currentXp.value / BP_XP_PER_STAGE))
)

const stageCards = computed(() =>
  Array.from({ length: BP_TOTAL_STAGES }, (_, i) => {
    const stage = i + 1
    return {
      stage,
      reward: bpReward(stage),
      unlocked: isStageUnlocked(stage),
      claimed: isStageClaimed(stage),
      inProgress: stage === inProgressStage.value
    }
  })
)

const xpSources = computed(() => [
  { xp: BARRAGE_XP_SOURCES.kill, label: t('barrageMeta.pass.perKill') },
  { xp: BARRAGE_XP_SOURCES.merge, label: t('barrageMeta.pass.perMerge') },
  { xp: BARRAGE_XP_SOURCES.row, label: t('barrageMeta.pass.perRow') },
  { xp: BARRAGE_XP_SOURCES.boss, label: t('barrageMeta.pass.perBoss') }
])

const onClaim = (stage: number, sourceEl: HTMLElement) => {
  const res = claimStage(stage)
  if (!res) return
  emit('coins-awarded', sourceEl)
  playSound('reward-continue', 0.06)
}
</script>

<template lang="pug">
  button.battle-pass-btn(
    ref="bpBtnRef"
    class="cursor-pointer pointer-events-auto active:scale-95 transition-transform"
    :class="{ 'pulse-claim': hasUnclaimedReward }"
    :aria-label="t('barrageMeta.pass.title')"
    @click="isModalOpen = true"
  )
    div.relative
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#5a1212]")
      div.relative.rounded-lg.border-2.flex.items-center.justify-center(
        class="p-1.5 sm:p-2 bg-gradient-to-b from-[#a855f7] to-[#6b21a8] border-[#0f1a30]"
      )
        //- Rank-tier chevrons — three stacked "V"s reading bottom-to-top
        //- as ascending ranks. Distinct from the AchievementsModal trophy
        //- so the two HUD slots are visually unambiguous.
        svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="white" stroke-width="2" stroke-linejoin="round" stroke-linecap="round")
          path(d="M5 9 L12 4 L19 9")
          path(d="M5 14 L12 9 L19 14")
          path(d="M5 19 L12 14 L19 19" fill="rgba(255,255,255,0.35)")
          //- Small star above the chevrons to evoke the season-pass crest.
          path(d="M12 1 L12.7 2.4 L14.2 2.6 L13.1 3.7 L13.4 5.2 L12 4.5 L10.6 5.2 L10.9 3.7 L9.8 2.6 L11.3 2.4 Z" fill="white" stroke="none")
      div.absolute.top-0.right-0.rounded-full.border-2.bg-red-500.border-white.text-white.font-black.game-text.flex.items-center.justify-center(
        v-if="pendingClaimCount > 0"
        class="-translate-y-1 translate-x-1 min-w-4 h-4 px-1 text-[10px]"
      ) {{ pendingClaimCount }}

  FModal(
    v-model="isModalOpen"
    :title="t('barrageMeta.pass.title')"
  )
    div.flex.flex-col.gap-3.p-3
      div.flex.justify-center.gap-2.text-center.text-white.game-text(v-if="!isMaxed" class="text-xs sm:text-sm")
        span {{ t('barrageMeta.pass.progress', { current: unlockedStages, total: BP_TOTAL_STAGES }) }}
        span.opacity-70(v-if="daysUntilReset !== null") {{ t('barrageMeta.pass.daysLeft', { n: daysUntilReset }) }}
      div.text-center.text-yellow-300.game-text.font-black(v-else class="text-base") {{ t('barrageMeta.pass.maxed') }}

      //- Progress bar with the inline xp count.
      div(v-if="!isMaxed" class="flex flex-col gap-1")
        div.relative.h-3.rounded-full.overflow-hidden.border(class="bg-black/40 border-white/20")
          div.h-full.bg-gradient-to-r.from-purple-400.to-pink-500.transition-all(
            :style="{ width: progressFraction * 100 + '%' }"
          )
        div.flex.justify-center.text-white.game-text.opacity-70(class="text-[10px] sm:text-xs")
          span {{ t('barrageMeta.pass.xpProgress', { current: currentXp, total: BP_XP_PER_STAGE }) }}

      //- "How to earn XP" explainer — mirrors BARRAGE_XP_SOURCES so the
      //- player always sees why the bar is moving (or not).
      div.flex.flex-col.gap-1.rounded-lg.border.p-2(class="bg-black/30 border-white/15")
        div.text-center.font-black.uppercase.tracking-wider.text-yellow-200.game-text(class="text-[10px] sm:text-xs")
          | {{ t('barrageMeta.pass.howToEarn') }}
        div.flex.justify-around.gap-1.text-white.game-text(class="text-[10px] sm:text-xs")
          div.flex.flex-col.items-center(v-for="s in xpSources" :key="s.label")
            span.font-black.text-cyan-200 {{ t('barrageMeta.pass.xpAmount', { n: s.xp }) }}
            span.opacity-80 {{ s.label }}
        div.text-center.text-white.game-text.opacity-70(class="text-[9px] sm:text-[10px]")
          | {{ t('barrageMeta.pass.unlockHint', { n: BP_XP_PER_STAGE }) }}

      //- Tier cards
      div.grid.gap-1.bp-stage-grid
        div(
          v-for="card in stageCards"
          :key="card.stage"
          class="bp-card relative flex flex-col items-center justify-center rounded-md border-2 py-1"
          :class="{ 'is-claimed': card.claimed, 'is-unlocked': card.unlocked && !card.claimed, 'is-locked': !card.unlocked, 'is-current': card.inProgress }"
          @click="card.unlocked && !card.claimed ? onClaim(card.stage, $event.currentTarget) : null"
        )
          span.font-black.game-text.text-white(class="text-[9px] sm:text-[10px]") {{ card.stage }}
          //- Reward glyph: a free ball (the tier's portrait in a round orb), else gold
          div.bp-ball(
            v-if="card.reward.ballTier"
            class="w-5 h-5 sm:w-6 sm:h-6 my-0.5"
            role="img"
            :aria-label="t('barrageMeta.pass.ballReward', { tier: card.reward.ballTier })"
          )
            IngredientUnit(:tier="card.reward.ballTier" :still="true")
          IconCoin(v-else class="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300 my-0.5")
          span.font-black.game-text.text-yellow-100(class="text-[9px] sm:text-[10px]") +{{ formatBig(card.reward.coins) }}
</template>

<style scoped lang="sass">
.pulse-claim
  animation: bp-pulse 1.6s ease-in-out infinite

@keyframes bp-pulse
  0%, 100%
    filter: drop-shadow(0 0 0 rgba(255, 200, 0, 0))
  50%
    filter: drop-shadow(0 0 8px rgba(255, 200, 0, 0.7))

.bp-stage-grid
  grid-template-columns: repeat(6, minmax(0, 1fr))

// Balls, not units: the portrait sits inside a glass-orb rim.
.bp-ball
  border-radius: 9999px
  overflow: hidden
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.7), 0 0 4px rgba(120, 200, 255, 0.6)

@media (min-width: 640px)
  .bp-stage-grid
    grid-template-columns: repeat(10, minmax(0, 1fr))

.bp-card
  background: rgba(0, 0, 0, 0.4)
  border-color: rgba(255, 255, 255, 0.15)
  cursor: not-allowed
  transition: all 0.2s ease

  &.is-claimed
    background: rgba(80, 170, 80, 0.4)
    border-color: rgba(120, 220, 120, 0.6)
    opacity: 0.6

  &.is-unlocked
    background: linear-gradient(180deg, #ffcd00, #f7a000)
    border-color: #fff7d6
    box-shadow: 0 0 8px rgba(255, 200, 0, 0.5)
    cursor: pointer

  &.is-locked
    opacity: 0.5

  &.is-current
    border-color: #f0abfc
    box-shadow: 0 0 6px rgba(217, 70, 239, 0.6)
</style>
