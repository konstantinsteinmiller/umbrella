<script setup lang="ts">
/**
 * "War Campaign" — the free-track battle pass (retention-roadmap #18).
 * Re-skinned from the epicrolla template: XP now ticks off the battler's
 * `bumpStat` events (kills / merges / waves / bosses — see
 * `CAMPAIGN_XP_SOURCES`), and tier rewards go beyond gold: an Instant Spawn
 * buff every 5th tier, a free high-tier unit every 10th. The extras are
 * executed here on claim (the composable stays economy-pure).
 */
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import useBattlePass, {
  BP_TOTAL_STAGES,
  BP_XP_PER_STAGE,
  CAMPAIGN_XP_SOURCES,
  bpReward
} from '@/use/useBattlePass'
import usePrismGame from '@/use/usePrismGame'
import useBattle from '@/use/useBattle'
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
const game = usePrismGame()
const battle = useBattle()

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
  { xp: CAMPAIGN_XP_SOURCES.kill, label: t('battlePass.perKill') },
  { xp: CAMPAIGN_XP_SOURCES.merge, label: t('battlePass.perMerge') },
  { xp: CAMPAIGN_XP_SOURCES.wave, label: t('battlePass.perWave') },
  { xp: CAMPAIGN_XP_SOURCES.boss, label: t('battlePass.perBoss') }
])

const onClaim = (stage: number, sourceEl: HTMLElement) => {
  // A unit reward needs somewhere to LAND — with the grid AND the army both
  // full it would silently evaporate. Refuse the claim (denied thunk) and
  // keep the tier claimable until the player makes room.
  const preview = bpReward(stage)
  if (preview.unitTier && game.emptySlots.value === 0 && battle.armyFull.value) {
    playSound('upgrade-denied', 0.03)
    return
  }
  const res = claimStage(stage)
  if (!res) return
  emit('coins-awarded', sourceEl)
  playSound('reward-continue', 0.06)
  // Reward extras: the buff applies instantly; the free unit lands on the
  // grid (or marches straight to the front when the grid is packed).
  if (res.instantSpawn) game.activateInstantSpawn()
  if (res.unitTier && game.spawnUnitAt(res.unitTier) < 0 && !battle.armyFull.value) {
    battle.deployFighter(res.unitTier)
  }
}
</script>

<template lang="pug">
  button.battle-pass-btn(
    ref="bpBtnRef"
    class="cursor-pointer pointer-events-auto active:scale-95 transition-transform"
    :class="{ 'pulse-claim': hasUnclaimedReward }"
    :aria-label="t('battlePass.title')"
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
    :title="t('battlePass.title')"
  )
    div.flex.flex-col.gap-3.p-3
      div.text-center.text-white.game-text(v-if="!isMaxed" class="text-xs sm:text-sm")
        span {{ t('battlePass.progress', { current: unlockedStages, total: BP_TOTAL_STAGES }) }}
        span.opacity-70(v-if="daysUntilReset !== null") {{ ' · ' + t('battlePass.daysLeft', { n: daysUntilReset }) }}
      div.text-center.text-yellow-300.game-text.font-black(v-else class="text-base") {{ t('battlePass.maxed') }}

      //- Progress bar with the inline xp count.
      div(v-if="!isMaxed" class="flex flex-col gap-1")
        div.relative.h-3.rounded-full.overflow-hidden.border(class="bg-black/40 border-white/20")
          div.h-full.bg-gradient-to-r.from-purple-400.to-pink-500.transition-all(
            :style="{ width: progressFraction * 100 + '%' }"
          )
        div.flex.justify-center.text-white.game-text.opacity-70(class="text-[10px] sm:text-xs")
          span {{ t('battlePass.xpProgress', { current: currentXp, total: BP_XP_PER_STAGE }) }}

      //- "How to earn XP" explainer — mirrors CAMPAIGN_XP_SOURCES so the
      //- player always sees why the bar is moving (or not).
      div.flex.flex-col.gap-1.rounded-lg.border.p-2(class="bg-black/30 border-white/15")
        div.text-center.font-black.uppercase.tracking-wider.text-yellow-200.game-text(class="text-[10px] sm:text-xs")
          | {{ t('battlePass.howToEarn') }}
        div.flex.justify-around.gap-1.text-white.game-text(class="text-[10px] sm:text-xs")
          div.flex.flex-col.items-center(v-for="s in xpSources" :key="s.label")
            span.font-black.text-cyan-200 +{{ s.xp }} XP
            span.opacity-80 {{ s.label }}
        div.text-center.text-white.game-text.opacity-70(class="text-[9px] sm:text-[10px]")
          | {{ t('battlePass.unlockHint', { n: BP_XP_PER_STAGE }) }}

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
          //- Reward glyph: free unit > instant-spawn buff > gold
          div(v-if="card.reward.unitTier" class="w-5 h-5 sm:w-6 sm:h-6 my-0.5")
            IngredientUnit(:tier="card.reward.unitTier" :still="true")
          svg(v-else-if="card.reward.instantSpawn" viewBox="0 0 24 24" class="w-4 h-4 sm:w-5 sm:h-5 my-0.5" fill="#ffe23a" stroke="#7a3000" stroke-width="1.4" stroke-linejoin="round")
            path(d="M13 2 L5 13 h5 l-1 9 l8 -11 h-5 Z")
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
