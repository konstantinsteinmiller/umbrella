<script setup lang="ts">
/**
 * OVERRUN — the breach screen. Casual contract rule 5: a breach is never a game
 * over. Three ways back, most generous first:
 *
 *   • Meteor Storm (rewarded, once per checkpoint) — only rendered while
 *     `breach.meteorAvailable` (readiness-gated by the state layer; a dead ad
 *     button is worse than no button).
 *   • Revive — free, when a Revive charge exists.
 *   • Restart at the last boss checkpoint, keeping every coin.
 *
 * The Daily Barrage has no continues: its breach (and `dailyResult`) shows the
 * run's result instead.
 *
 * A forced choice: the modal is driven by the state layer's offer, so the
 * backdrop / ✕ can't dismiss it into a frozen board.
 *
 * Above the ways back, a three-number recap of the run (row reached, kills,
 * coins earned) — run 2: "OVERRUN, and no summary of what I just did". The
 * numbers come from the state layer's `breach.recap` (optional: no recap, no
 * row of zeros). The coins are what the run EARNED — a gain ("+78", "earned
 * this run"), never a balance: run 3 read "78 coins" beside the wallet's 126
 * as a bug.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import useBarrage from '@/barrage/state/useBarrage'
import useReward, { formatCost } from '@/use/useReward'
import { skillSrc } from '@/barrage/art'
import { fmtCoins } from '@/components/barrage/barrageUi'

const { t } = useI18n()
const barrage = useBarrage()
const { buffsCostCoins, REWARD_COIN_COST } = useReward()

const breach = computed(() => barrage.breach.value)
const daily = computed(() => barrage.dailyResult.value)
const isDaily = computed(() => !!daily.value || !!breach.value?.isDaily)
const open = computed(() => !!breach.value || !!daily.value)

const busy = ref(false)
const run = async (fn: () => Promise<unknown> | unknown): Promise<void> => {
  if (busy.value) return
  busy.value = true
  try { await fn() } finally { busy.value = false }
}

// The continue's meteors / revive burst (and their SFX) are the board's —
// BarrageBoard reacts to the engine's `continued` event.
const onMeteor = (): Promise<void> => run(() => barrage.continueWithMeteor())
const onRevive = (): Promise<void> => run(() => { barrage.continueWithRevive() })
const onRestart = (): Promise<void> => run(() => barrage.restartFromCheckpoint())
const onDailyAgain = (): Promise<void> => run(() => { barrage.exitDaily(); barrage.startDaily() })
const onDailyBack = (): Promise<void> => run(() => barrage.exitDaily())

/** The fresh board after a restart starts one row past the checkpoint. */
const restartRow = computed(() => (breach.value?.checkpointRow ?? barrage.checkpointRow.value) + 1)
const reachedRow = computed(() => breach.value?.row ?? barrage.row.value)
// ─── Run recap ───────────────────────────────────────────────────────────────
interface Recap { row: number; kills: number; coins: number }
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null)
/** Optional in the contract (an older save's breach has none): no recap, no
 *  row of zeros — and a malformed number drops the whole row. */
const recap = computed<Recap | null>(() => {
  const r = breach.value?.recap
  if (!r) return null
  const row = num(r.row)
  const kills = num(r.kills)
  const coins = num(r.coins)
  return row === null || kills === null || coins === null ? null : { row, kills, coins }
})
const recapAria = computed(() => recap.value
  ? t('barrage.breach.recapAria', { row: recap.value.row, kills: fmtCoins(recap.value.kills), coins: fmtCoins(recap.value.coins) })
  : '')

const meteorAria = computed(() => buffsCostCoins
  ? t('barrage.breach.meteorCoinAria', { cost: formatCost(REWARD_COIN_COST) })
  : t('barrage.breach.meteorAdAria'))
</script>

<template lang="pug">
  FModal(
    :model-value="open"
    :title="isDaily ? t('barrage.daily.resultTitle') : t('barrage.breach.title')"
    :is-closable="false"
  )
    div.breach.flex.flex-col.items-center.gap-3.px-2.pb-2
      //- ── Endless: the three ways back ──
      template(v-if="!isDaily && breach")
        p.game-text.text-white.text-center(class="text-sm sm:text-base") {{ t('barrage.breach.body', { n: reachedRow }) }}
        //- What this run did: row · kills · coins.
        div.breach-recap.flex.justify-center.w-full.gap-2(v-if="recap" class="max-w-sm" role="group" :aria-label="recapAria")
          div.recap-tile.recap-tile--row(aria-hidden="true")
            BarrageGlyph.recap-icon(name="flag")
            span.recap-n.game-text.tabular-nums {{ recap.row }}
            span.recap-label.game-text {{ t('barrage.breach.recapRow') }}
          div.recap-tile.recap-tile--kills(aria-hidden="true")
            BarrageGlyph.recap-icon(name="skull")
            span.recap-n.game-text.tabular-nums {{ fmtCoins(recap.kills) }}
            span.recap-label.game-text {{ t('barrage.breach.recapKills') }}
          div.recap-tile.recap-tile--coins(aria-hidden="true")
            IconCoin.recap-icon
            span.recap-n.game-text.tabular-nums {{ t('barrage.hud.coinGain', { n: fmtCoins(recap.coins) }) }}
            span.recap-label.game-text {{ t('barrage.breach.recapEarned') }}
        div.flex.flex-col.w-full.gap-2(class="max-w-sm")
          button.breach-btn.breach-btn--meteor(
            v-if="breach.meteorAvailable"
            type="button"
            :disabled="busy"
            :aria-label="meteorAria"
            @click="onMeteor"
          )
            img.breach-btn__art(:src="skillSrc('meteor')" alt="" draggable="false")
            span.flex.flex-col.items-start.flex-1.min-w-0
              span.breach-btn__title.game-text {{ t('barrage.breach.meteor') }}
              span.breach-btn__sub.game-text {{ t('barrage.breach.meteorDesc') }}
            span.breach-btn__price.flex.items-center.gap-1.shrink-0
              template(v-if="buffsCostCoins")
                IconCoin.w-5.h-5
                span.game-text.font-black {{ formatCost(REWARD_COIN_COST) }}
              IconMovie.w-8.h-8(v-else)
          button.breach-btn.breach-btn--revive(
            v-if="breach.reviveAvailable"
            type="button"
            :disabled="busy"
            @click="onRevive"
          )
            img.breach-btn__art(:src="skillSrc('revive')" alt="" draggable="false")
            span.flex.flex-col.items-start.flex-1.min-w-0
              span.breach-btn__title.game-text {{ t('barrage.breach.revive') }}
              span.breach-btn__sub.game-text {{ t('barrage.breach.reviveDesc', { n: barrage.revives.value }) }}
            span.breach-btn__free.game-text.font-black.uppercase.shrink-0 {{ t('barrage.breach.free') }}
          button.breach-btn.breach-btn--restart(
            type="button"
            :disabled="busy"
            @click="onRestart"
          )
            span.breach-btn__glyph.text-white
              BarrageGlyph.w-full.h-full(name="flag")
            span.flex.flex-col.items-start.flex-1.min-w-0
              span.breach-btn__title.game-text {{ t('barrage.breach.restart', { n: restartRow }) }}
              span.breach-btn__sub.game-text {{ t('barrage.breach.restartDesc') }}
        p.game-text.text-center.opacity-70(v-if="breach.meteorAvailable" class="text-[11px]") {{ t('barrage.breach.onceHint') }}

      //- ── Daily: no continues, the result ──
      template(v-else)
        p.game-text.text-white.text-center(class="text-xs opacity-80") {{ t('barrageMeta.daily.rules') }}
        div.flex.flex-col.items-center.gap-1
          span.game-text.font-black.text-white(class="text-2xl sm:text-3xl") {{ t('barrage.daily.resultRow', { n: daily ? daily.row : reachedRow }) }}
          span.daily-new.game-text.font-black.uppercase(v-if="daily && daily.newBest") {{ t('barrageMeta.daily.newBest') }}
          span.game-text.text-yellow-200(v-if="daily" class="text-sm") {{ t('barrageMeta.daily.best', { n: daily.best }) }}
        div.flex.flex-wrap.justify-center.gap-2.w-full
          button.breach-btn.breach-btn--small.breach-btn--meteor(type="button" :disabled="busy" @click="onDailyAgain")
            span.breach-btn__title.game-text {{ t('barrage.daily.playAgain') }}
          button.breach-btn.breach-btn--small.breach-btn--restart(type="button" :disabled="busy" @click="onDailyBack")
            span.breach-btn__title.game-text {{ t('barrage.daily.back') }}
</template>

<style scoped lang="sass">
.breach-btn
  position: relative
  display: flex
  align-items: center
  gap: 10px
  width: 100%
  min-height: 56px
  padding: 6px 12px 6px 6px
  border-radius: 14px
  border: 2px solid #0f1a30
  color: #fff
  text-align: start
  cursor: pointer
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 4px 0 var(--plate)
  transition: transform 0.08s ease, filter 0.15s ease
  touch-action: manipulation
  &:active
    transform: translateY(2px)
  &:disabled
    filter: grayscale(0.6) brightness(0.8)
    cursor: wait
.breach-btn--small
  width: auto
  min-width: 132px
  justify-content: center
  padding: 8px 16px
.breach-btn--meteor
  --plate: #7a2a08
  background: linear-gradient(180deg, #ff9a3c, #e0461e)
  animation: meteor-glow 1.2s ease-in-out infinite alternate
.breach-btn--revive
  --plate: #6b1240
  background: linear-gradient(180deg, #ff6aa8, #c0266a)
.breach-btn--restart
  --plate: #102e7a
  background: linear-gradient(180deg, #50aaff, #2266ff)
.breach-btn__art
  width: 44px
  height: 44px
  object-fit: contain
  flex-shrink: 0
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5))
.breach-btn__glyph
  width: 36px
  height: 36px
  margin: 0 4px
  flex-shrink: 0
  filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.5))
.breach-btn__title
  font-weight: 900
  font-size: 16px
  line-height: 1.1
  text-transform: uppercase
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6)
.breach-btn__sub
  font-size: 12px
  line-height: 1.2
  opacity: 0.92
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.5)
.breach-btn__price
  font-size: 13px
.breach-btn__free
  font-size: 13px
  padding: 3px 8px
  border-radius: 999px
  background: rgba(0, 0, 0, 0.3)
// The run recap: three small plaques, number first.
.recap-tile
  flex: 1 1 0
  min-width: 0
  display: flex
  flex-direction: column
  align-items: center
  gap: 1px
  padding: 6px 4px 5px
  border-radius: 12px
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.25))
  border: 2px solid #0f1a30
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12)
.recap-icon
  width: 20px
  height: 20px
  filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.6))
.recap-tile--row .recap-icon
  color: #ffb07a
.recap-tile--kills .recap-icon
  color: #e6ecff
.recap-n
  color: #fff
  font-weight: 900
  font-size: 20px
  line-height: 1.05
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6)
.recap-tile--coins .recap-n
  color: #ffe27a
// Up to two lines: "earned this run" runs long in some languages.
.recap-label
  max-width: 100%
  overflow: hidden
  display: -webkit-box
  -webkit-box-orient: vertical
  -webkit-line-clamp: 2
  line-clamp: 2
  text-align: center
  line-height: 1.15
  font-size: 10px
  font-weight: 800
  text-transform: uppercase
  letter-spacing: 0.04em
  opacity: 0.8
.daily-new
  color: #8dffa6
  font-size: 14px
  animation: meteor-glow 0.8s ease-in-out infinite alternate
@keyframes meteor-glow
  from
    filter: drop-shadow(0 0 0 rgba(255, 170, 60, 0))
  to
    filter: drop-shadow(0 0 10px rgba(255, 170, 60, 0.85))
@media (prefers-reduced-motion: reduce)
  .breach-btn--meteor, .daily-new
    animation: none
</style>
