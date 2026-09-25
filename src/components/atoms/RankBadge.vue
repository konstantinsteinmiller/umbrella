<script setup lang="ts">
/**
 * ─── "#1,130 of 2,345" — the global rank, a runic plaque over the board ─────
 *
 * The whole leaderboard, reduced to one plaque centred on the board's top rim,
 * on every device and layout — the game is competitive, and the placing is
 * the one number a player keeps glancing at. There is no list and no modal:
 * the placing and the population are the part players read, and "of 2,345" is
 * what makes the placing mean something.
 *
 * Dressed like the upgrade chips (same navy body, accent crown, dark outline,
 * base plate and `RuneFrame` border, here in gold and inscribed "global rank"),
 * so it reads as part of the same carved HUD rather than a web widget.
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
 *
 * `tappable` (play-test run 4: "#15,667 of 15,876" meant nothing to a tester)
 * makes the plaque answer a tap with a `tap` event — its element and its
 * formatted texts — so the host can name it (Barrage: the HUD name plate).
 * Without it the plaque stays click-through, as before.
 *
 * `label` (play-test run 8: all four testers still asked what "#15,396 of
 * 15,876" is — nobody taps a plaque to find out): a small caption before the
 * placing that names it, e.g. "GLOBAL RANK" — the host passes its own words.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RuneFrame from '@/components/atoms/RuneFrame.vue'
import { runeZoneFor } from '@/game/runes'
import {
  leaderboardEnabled, leaderboardFailed, playerTotal, rankFor
} from '@/use/useLeaderboard'

const props = defineProps<{
  /** The player's best wave once one has been cleared, else 0 (= not ranked). */
  score: number
  /** Answer a tap (only while a rank shows) with `tap`. */
  tappable?: boolean
  /** A caption before the placing that names it ("GLOBAL RANK"). */
  label?: string
}>()

const emit = defineEmits<{
  (e: 'tap', el: HTMLElement, info: { rank: string; of: string | null; aria: string }): void
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

/** Tappable only while there is a placing to name (never the "…"). */
const live = computed(() => !!props.tappable && rank.value > 0)
const onTap = (ev: Event): void => {
  const el = ev.currentTarget as HTMLElement | null
  if (!live.value || !el) return
  emit('tap', el, { rank: rankText.value, of: showTotal.value ? ofText.value : null, aria: ariaLabel.value })
}
const onKey = (ev: KeyboardEvent): void => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return
  ev.preventDefault()
  onTap(ev)
}

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

// ── The rune band needs the plaque's real height (like the chips) ──
const plaqueEl = ref<HTMLElement | null>(null)
const plaqueH = ref(0)
let ro: ResizeObserver | null = null
const observe = (el: HTMLElement | null): void => {
  ro?.disconnect()
  ro = null
  if (!el || typeof ResizeObserver === 'undefined') return
  ro = new ResizeObserver(() => { plaqueH.value = el.offsetHeight })
  ro.observe(el)
  plaqueH.value = el.offsetHeight
}
watch(plaqueEl, observe)
onMounted(() => observe(plaqueEl.value))
onUnmounted(() => { ro?.disconnect(); ro = null })
/** Runes only where they can be whole and legible (a short landscape phone
 *  keeps the plaque, without the inscription). */
const runes = computed(() => plaqueH.value >= 30)
const runeZone = computed(() => (runes.value ? `${runeZoneFor(plaqueH.value).toFixed(1)}px` : '3px'))
</script>

<template lang="pug">
  Transition(name="rank-hang" appear)
    div.rank-badge(
      v-if="rank > 0 || waiting"
      ref="plaqueEl"
      :class="{ 'rank-badge--glint': glint, 'rank-badge--tappable': live }"
      :style="{ '--rune-zone': runeZone }"
      :role="live ? 'button' : 'img'"
      :tabindex="live ? 0 : undefined"
      :aria-label="rank > 0 ? ariaLabel : undefined"
      :aria-hidden="rank > 0 ? undefined : 'true'"
      @click="onTap"
      @keydown="onKey"
    )
      RuneFrame(v-if="runes" inscription="global rank" state="ready")
      div.rank-badge__row
        //- Inline so it inherits nothing it should not and costs no request.
        svg.rank-badge__icon(viewBox="0 0 24 24" fill="currentColor" aria-hidden="true")
          path(d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h3.5v2h-9v-2H11v-2.1a6 6 0 0 1-3.4-3.9A5 5 0 0 1 3 8V5h3V3Zm0 4H5v1a3 3 0 0 0 1.6 2.7A8 8 0 0 1 6 8V7Zm12 0v1a8 8 0 0 1-.6 2.7A3 3 0 0 0 19 8V7h-1Z")
        span.rank-badge__label.game-text(v-if="label") {{ label }}
        span.rank-badge__rank.game-text {{ rank > 0 ? rankText : '…' }}
        span.rank-badge__of.game-text(v-if="showTotal") {{ ofText }}
</template>

<style scoped lang="sass">
// The upgrade chips' runic plaque (UpgradeBar `.chip`), in gold: accent crown
// over deep navy, a near-black outline, an accent rim, a solid base plate — and
// the RuneFrame border, lit. One line — trophy, placing, population — so it
// stays short enough to sit on the board's rim above the middle columns.
.rank-badge
  --accent: #ffd23a
  --tint: color-mix(in srgb, var(--accent) 24%, #19233f)
  --plate: color-mix(in srgb, var(--accent) 42%, #03050c)
  position: relative
  overflow: hidden
  display: flex
  align-items: center
  justify-content: center
  min-height: 30px
  padding: var(--rune-zone) 0.95em
  border-radius: 0.75rem
  border: 2px solid #060a16
  background: radial-gradient(130% 85% at 50% -14%, color-mix(in srgb, var(--accent) 34%, transparent) 0%, transparent 62%), linear-gradient(180deg, var(--tint) 0%, #0f1631 56%, #080c1d 100%)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate), 0 0 12px -3px var(--accent)
  font-size: clamp(12px, 3.6vmin, 18px)
  line-height: 1
  white-space: nowrap
  pointer-events: none
  transform-origin: 50% 0
  > :not(.rune-frame)
    position: relative
    z-index: 1
// A host that names it on a tap (Barrage's HUD plate): it catches the tap —
// the layout is untouched, only the hit test changes.
.rank-badge--tappable
  pointer-events: auto
  cursor: pointer
  touch-action: manipulation
  -webkit-tap-highlight-color: transparent
  &:active
    filter: brightness(1.15)

.rank-badge__row
  display: flex
  align-items: baseline
  gap: 0.3em

.rank-badge__icon
  flex: 0 0 auto
  align-self: center
  width: 1.1em
  height: 1.1em
  color: #ffd23a
  filter: drop-shadow(1px 1px 0 #000) drop-shadow(0 0 3px rgba(255, 210, 58, 0.6))

.rank-badge__label
  color: #ffd23a
  font-weight: 900
  font-size: max(9px, 0.66em)
  letter-spacing: 0.04em
  text-transform: uppercase
  text-shadow: 1px 1px 0 #000
  margin-right: 0.15em
.rank-badge__rank
  color: #fff
  font-weight: 900
  font-variant-numeric: tabular-nums
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000

.rank-badge__of
  color: #ffe6a0
  font-weight: 900
  font-size: max(9px, 0.72em)
  font-variant-numeric: tabular-nums
  text-transform: uppercase
  text-shadow: 1px 1px 0 #000

// Placing improved: a quick gold flash + nudge, then back to rest.
.rank-badge--glint
  animation: rank-badge-glint 0.9s ease-out
@keyframes rank-badge-glint
  0%
    transform: scale(1)
    filter: brightness(1)
  25%
    transform: scale(1.12)
    filter: brightness(1.35) drop-shadow(0 0 10px rgba(255, 210, 58, 0.9))
  100%
    transform: scale(1)
    filter: brightness(1)

// First appearance: drops onto the rim from above.
.rank-hang-enter-active
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease
.rank-hang-leave-active
  transition: transform 0.25s ease-in, opacity 0.25s ease-in
.rank-hang-enter-from, .rank-hang-leave-to
  transform: translateY(-60%)
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .rank-badge--glint
    animation: none
</style>
