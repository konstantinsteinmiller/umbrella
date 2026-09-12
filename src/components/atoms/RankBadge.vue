<script setup lang="ts">
/**
 * ─── "#1,130 of 2,345" — the global rank, hanging in the arena corner ───────
 *
 * The whole leaderboard, reduced to one small tag hung from the arena's top
 * edge (top-right, every layout). There is no list and no modal: the placing
 * and the population are the part players read, and "of 2,345" is what makes
 * the placing mean something.
 *
 * THREE STATES, and only one of them is a number:
 *
 *   • a rank         → `#1,130`, plus `of 2,345` once the population is known
 *   • still waiting  → `…`, only while a request can still bring an answer
 *   • nothing to say → the tag does not render AT ALL — no board on this build,
 *                      no wave cleared yet, or the fetch failed with no cached
 *                      or baked board to fall back on
 *
 * There is no "#100+" state and adding one is a regression: `rankFor` returns
 * an exact rank from the histogram, an estimate, or 0 — never a sentinel.
 *
 * `score` is a PROP (the same number `reportRun` gets — `rankedBest` from
 * `useWaveLeaderboard`), so this component knows nothing about waves.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  leaderboardEnabled, leaderboardFailed, playerTotal, rankFor
} from '@/use/useLeaderboard'

const props = defineProps<{
  /** The player's best wave once one has been cleared, else 0 (= not ranked). */
  score: number
}>()

const { t, locale } = useI18n()

const rank = computed<number>(() =>
  leaderboardEnabled && props.score > 0 ? rankFor(props.score) : 0)

/** `…` while the first answer is still on its way. Once the endpoint has
 *  actually failed the slot is given back — a permanent ellipsis on a player
 *  with no connection reads as a broken game. */
const waiting = computed<boolean>(() =>
  leaderboardEnabled && props.score > 0 && rank.value === 0 && !leaderboardFailed.value)

/**
 * The "of N" — never smaller than the player's own rank.
 *
 * The player is part of the population they are ranked in, but the board in
 * hand may not count them yet: a `/score` reply built from a cached board
 * (5-minute clock) or a histogram fetched before their first post both rank
 * them correctly — everyone above + 1 — against a total that is missing them.
 * Seen live as "#3 of 2". Clamping to the rank is the honest lower bound.
 */
const population = computed<number>(() => Math.max(playerTotal.value, rank.value))

const showTotal = computed<boolean>(() => rank.value > 0 && population.value > 0)

/** Grouped digits (`2,345` / `2.345`), but always LATIN digits: every other
 *  number in this HUD is `String(n)`, and an Arabic-Indic rank beside a Latin
 *  wave counter would read as two different fonts. */
const numberFormat = computed<Intl.NumberFormat | null>(() => {
  try {
    return new Intl.NumberFormat(locale.value, { numberingSystem: 'latn' })
  } catch {
    return null
  }
})
const num = (n: number): string => numberFormat.value?.format(n) ?? String(n)

// The `#` lives in the i18n message (`#{n}` in en, `{n}位` in ja, …), never in
// the pug template, where `#{…}` is interpolation rather than a hash sign.
const rankText = computed(() => t('leaderboard.rank', { n: num(rank.value) }))
const ofText = computed(() => t('leaderboard.of', { n: num(population.value) }))
const ariaLabel = computed(() => showTotal.value
  ? t('leaderboard.aria', { rank: num(rank.value), n: num(population.value) })
  : t('leaderboard.ariaRank', { rank: num(rank.value) }))

// ── A glint when the placing improves ──
// A new best wave usually moves the rank; making that visible is the point of
// having a rank on screen during play rather than on a result screen.
const glint = ref(false)
let glintTimer = 0
watch(rank, (next, prev) => {
  if (!(prev > 0 && next > 0 && next < prev)) return
  glint.value = false
  window.clearTimeout(glintTimer)
  // Next frame, so a second improvement mid-animation restarts it.
  requestAnimationFrame(() => {
    glint.value = true
    glintTimer = window.setTimeout(() => { glint.value = false }, 900)
  })
})
onUnmounted(() => window.clearTimeout(glintTimer))
</script>

<template lang="pug">
  Transition(name="rank-hang" appear)
    div.rank-badge(
      v-if="rank > 0 || waiting"
      :class="{ 'rank-badge--glint': glint }"
      role="img"
      :aria-label="rank > 0 ? ariaLabel : undefined"
      :aria-hidden="rank > 0 ? undefined : 'true'"
    )
      div.rank-badge__row
        //- Inline so it inherits nothing it should not and costs no request.
        svg.rank-badge__icon(viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
          path(d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h3.5v2h-9v-2H11v-2.1a6 6 0 0 1-3.4-3.9A5 5 0 0 1 3 8V5h3V3Zm0 4H5v1a3 3 0 0 0 1.6 2.7A8 8 0 0 1 6 8V7Zm12 0v1a8 8 0 0 1-.6 2.7A3 3 0 0 0 19 8V7h-1Z")
        span.rank-badge__rank.game-text {{ rank > 0 ? rankText : '…' }}
      span.rank-badge__of.game-text(v-if="showTotal") {{ ofText }}
</template>

<style scoped lang="sass">
// A tag hung from the arena's top edge: flush top, rounded bottom, a gold rim
// on the three sides that show. Sized off the ARENA (it is a `container-type:
// size` box, so `cqmin` is its shorter side), clamped so it never drops below
// readable on a phone or grows past a HUD chip on a desktop.
.rank-badge
  display: flex
  flex-direction: column
  align-items: center
  gap: 0.1em
  padding: 0.2em 0.55em 0.3em
  border: 1.5px solid rgba(255, 210, 58, 0.8)
  border-top: 0
  border-radius: 0 0 0.7em 0.7em
  background: linear-gradient(180deg, rgba(8, 13, 28, 0.94) 0%, rgba(22, 34, 64, 0.9) 100%)
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 10px rgba(255, 210, 58, 0.14)
  font-size: clamp(11px, 3.3cqmin, 16px)
  line-height: 1
  white-space: nowrap
  pointer-events: none
  transform-origin: 50% 0

.rank-badge__row
  display: flex
  align-items: center
  gap: 0.25em

.rank-badge__icon
  flex: 0 0 auto
  width: 1.05em
  height: 1.05em
  color: #ffd23a
  filter: drop-shadow(1px 1px 0 #000)

.rank-badge__rank
  color: #fff
  font-weight: 900
  font-variant-numeric: tabular-nums

.rank-badge__of
  color: #b9cbe8
  font-weight: 900
  font-size: max(8px, 0.68em)
  font-variant-numeric: tabular-nums
  text-transform: uppercase

// Placing improved: a quick gold flash + nudge, then back to rest.
.rank-badge--glint
  animation: rank-badge-glint 0.9s ease-out
@keyframes rank-badge-glint
  0%
    transform: scale(1)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 10px rgba(255, 210, 58, 0.14)
  25%
    transform: scale(1.14)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 18px rgba(255, 210, 58, 0.85)
  100%
    transform: scale(1)
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35), 0 0 10px rgba(255, 210, 58, 0.14)

// First appearance: drops down from behind the arena's top edge.
.rank-hang-enter-active
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease
.rank-hang-leave-active
  transition: transform 0.25s ease-in, opacity 0.25s ease-in
.rank-hang-enter-from, .rank-hang-leave-to
  transform: translateY(-110%)
  opacity: 0
</style>
