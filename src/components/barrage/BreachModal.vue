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
 * backdrop / ✕ can't dismiss it into a frozen board. It opens once the death
 * sequence is over (run 7, `deathScene`: the monsters tear the unit apart
 * under "WASTED" first — the loss itself teaches the line).
 *
 * Above the ways back, a three-number recap of the run (row reached, kills,
 * coins earned) — run 2: "OVERRUN, and no summary of what I just did". The
 * numbers come from the state layer's `breach.recap` (optional: no recap, no
 * row of zeros). The coins are what the run EARNED — a gain ("+78", "earned
 * this run"), never a balance: run 3 read "78 coins" beside the wallet's 126
 * as a bug.
 *
 * One-Tap Comeback (retention-roadmap #4): one big icon-only retry leads the
 * screen (its aria-label is the old Restart caption); Meteor and Revive sit
 * below it, and the culprit + recap became a small secondary block. A boss
 * still standing at the breach shows its last sliver of HP (the near miss).
 *
 * Playtest run 9: "I never saw … which enemy crossed the line" — the body names
 * the culprit (the death sequence's striker, `breach.culprit`) beside its
 * portrait: "Fire Dragon broke through at row 40." (`barrage.breach.bodyBy`).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import useBarrage from '@/barrage/state/useBarrage'
import useReward, { formatCost } from '@/use/useReward'
import { bossSrc, monsterSrc, skillSrc } from '@/barrage/art'
import { fmtCoins } from '@/components/barrage/barrageUi'

const { t } = useI18n()
const barrage = useBarrage()
const { buffsCostCoins, REWARD_COIN_COST } = useReward()

const breach = computed(() => barrage.breach.value)
const daily = computed(() => barrage.dailyResult.value)
const isDaily = computed(() => !!daily.value || !!breach.value?.isDaily)
const open = computed(() => (!!breach.value || !!daily.value) && !barrage.deathScene.value)

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
/** One-Tap Comeback's near miss: the boss's HP left at the breach (null: none stood). */
const bossLeft = computed<number | null>(() => {
  const v = breach.value?.bossLeft
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null
})
const nearStyle = computed(() => ({ width: `${Math.max(3, Math.round((bossLeft.value ?? 0) * 100))}%` }))
/** The culprit's name and portrait (absent: the plain "The monsters broke through"). */
const culprit = computed(() => {
  const c = breach.value?.culprit
  if (!c) return null
  if (c.kind === 'boss') return c.bossKind ? { name: t(`barrage.bosses.${c.bossKind}`), src: bossSrc(c.bossKind) } : null
  return { name: t(`barrage.monsters.${c.kind}.name`), src: monsterSrc(c.kind) }
})
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
    div.breach.hud-digits.flex.flex-col.items-center.gap-3.px-2.pb-2
      //- ── Endless: the three ways back ──
      template(v-if="!isDaily && breach")
        //- One-Tap Comeback (retention-roadmap #4): the retry IS the screen —
        //- one big glyph, back at the checkpoint with every coin and the tray.
        button.breach-retry(
          type="button"
          :disabled="busy"
          :aria-label="t('barrage.breach.restart', { n: restartRow })"
          @click="onRestart"
        )
          BarrageGlyph.breach-retry__glyph(name="retry")
        //- The near miss, wordless: the boss's last sliver of HP.
        div.breach-near.flex.items-center.gap-2.w-full(v-if="bossLeft !== null" class="max-w-xs" aria-hidden="true")
          span.breach-culprit__face.breach-near__face(v-if="culprit")
            img(:src="culprit.src" alt="" draggable="false")
          div.breach-near__bar
            div.breach-near__fill(:style="nearStyle")
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
        p.game-text.text-center.opacity-70(v-if="breach.meteorAvailable" class="text-[11px]") {{ t('barrage.breach.onceHint') }}
        //- Secondary, below the way back: who broke through, and what this run did.
        div.breach-secondary.flex.flex-col.items-center.gap-2.w-full
          div.breach-culprit.flex.items-center.justify-center.gap-2(v-if="culprit")
            span.breach-culprit__face(aria-hidden="true")
              img(:src="culprit.src" alt="" draggable="false")
            p.game-text.text-white.text-left(class="text-xs") {{ t('barrage.breach.bodyBy', { name: culprit.name, n: reachedRow }) }}
          p.game-text.text-white.text-center(v-else class="text-xs") {{ t('barrage.breach.body', { n: reachedRow }) }}
          div.breach-recap.flex.justify-center.w-full.gap-2(v-if="recap" class="max-w-xs" role="group" :aria-label="recapAria")
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
// Run 9: the culprit's portrait beside "… broke through at row N."
.breach-culprit__face
  flex: none
  width: 44px
  height: 44px
  border-radius: 50%
  display: grid
  place-items: center
  background: radial-gradient(circle at 50% 40%, #3a0a10, #14030a)
  border: 2px solid #ff3848
  box-shadow: 0 0 10px rgba(255, 40, 60, 0.55)
  overflow: hidden
  img
    width: 86%
    height: 86%
    object-fit: contain
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
// One-Tap Comeback: the retry — big, round, blue, breathing.
.breach-retry
  display: grid
  place-items: center
  width: 96px
  height: 96px
  border-radius: 50%
  border: 3px solid #0f1a30
  color: #fff
  background: radial-gradient(circle at 50% 35%, #7cc0ff, #2266ff 70%)
  box-shadow: inset 0 3px 0 rgba(255, 255, 255, 0.35), 0 5px 0 #102e7a, 0 0 22px rgba(80, 170, 255, 0.55)
  cursor: pointer
  touch-action: manipulation
  animation: retry-breathe 1.1s ease-in-out infinite alternate
  &:active
    transform: translateY(2px)
  &:disabled
    filter: grayscale(0.6) brightness(0.8)
    cursor: wait
  &:focus-visible
    outline: 3px solid #fff
    outline-offset: 3px
.breach-retry__glyph
  width: 56px
  height: 56px
  filter: drop-shadow(1px 2px 0 rgba(0, 0, 0, 0.5))
.breach-near__face
  width: 32px
  height: 32px
.breach-near__bar
  flex: 1
  height: 10px
  border-radius: 999px
  background: rgba(0, 0, 0, 0.45)
  border: 2px solid #0f1a30
  overflow: hidden
.breach-near__fill
  height: 100%
  background: linear-gradient(90deg, #ff3848, #ff8a5a)
  animation: near-pulse 0.7s ease-in-out infinite alternate
.breach-secondary
  opacity: 0.85
  .recap-n
    font-size: 15px
  .recap-icon
    width: 16px
    height: 16px
  .breach-culprit__face
    width: 32px
    height: 32px
@keyframes retry-breathe
  from
    scale: 1
  to
    scale: 1.06
@keyframes near-pulse
  from
    opacity: 0.7
  to
    opacity: 1
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
  .breach-btn--meteor, .daily-new, .breach-retry, .breach-near__fill
    animation: none
</style>
