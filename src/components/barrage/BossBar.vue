<script setup lang="ts">
/**
 * Boss name plate + HP bar while a boss lives (MIW's boss banner, reborn).
 * Enrage (< 30 % HP, marching two rows a turn) flips it red and flashes — the
 * one warning the player must not miss.
 *
 * `inline` is the one-row strip GameScene puts in the top bar's second line.
 * It never goes over the board: a boss ENTERS at rows −2..0, so for its first
 * turns only its bottom row (and its HP number) shows at the board's top edge —
 * a bar hung there hid exactly that.
 *
 * The HP number itself is canvas territory (numbers only); this bar carries the
 * localized name and the at-a-glance fraction.
 *
 * The enrage threshold is marked ON the track — hazard stripes over the last
 * 30 % and a tick where they start — so "below here it charges" is readable
 * before it happens, without a word (the board adds a double chevron under an
 * enraged boss).
 *
 * The ENRAGED pill sits BESIDE the framed bar, never inside it: play-test run 2
 * read the pill at the end of the frame as lying on top of the HP bar.
 *
 * Boss mercy (a boss the player keeps losing to comes back softer): the track
 * stays the boss's FULL HP and the share it lost is a dull stub cracked off the
 * end of the bar — it breaks away as the bar slides in. "It is weaker than last
 * time", without a word; the fill, lag and enrage zone scale into what is left.
 *
 * Run 6 ("the 65 never moved — I couldn't tell if my shots were even hitting"):
 * every HP drop jolts the track and flashes the fill; a volley that ends
 * without a single ball touching the boss shakes the whole bar (a whiff reads
 * as a whiff). The board adds a grey puff where the last ball landed and
 * wobbles the boss's HP plate. Wordless.
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import { bossSrc } from '@/barrage/art'
import { formatBig } from '@/utils/bigNumber'
import { BOSS_ENRAGE_AT } from '@/barrage/engine/engine'
import { isCompactHud, isRoomyHud } from '@/use/useUser'

const props = withDefaults(defineProps<{ inline?: boolean }>(), { inline: false })

const { t } = useI18n()
const barrage = useBarrage()

const boss = computed(() => barrage.boss.value)
const frac = computed(() => {
  const b = boss.value
  if (!b || b.maxHp <= 0) return 0
  return Math.max(0, Math.min(1, b.hp / b.maxHp))
})
const name = computed(() => boss.value ? t(`barrage.bosses.${boss.value.bossKind}`) : '')
/** Share of its full HP the boss has left after mercy (1 = none). */
const mercy = computed(() => {
  const m = boss.value?.mercy
  return m !== undefined && m > 0 && m < 1 ? m : 1
})
const rageStyle = computed(() => ({ width: `${BOSS_ENRAGE_AT * mercy.value * 100}%` }))
const fillStyle = computed(() => ({ width: `${frac.value * mercy.value * 100}%` }))
const lagStyle = computed(() => ({ width: `${lag.value * mercy.value * 100}%` }))
const crackedStyle = computed(() => ({ left: `calc(${mercy.value * 100}% + 2px)` }))
const aria = computed(() => boss.value
  ? t('barrage.boss.hpAria', { name: name.value, hp: formatBig(Math.ceil(boss.value.hp), { sig: 3, trim: true }), max: formatBig(Math.ceil(boss.value.maxHp), { sig: 3, trim: true }) })
  : '')

// A trailing "damage taken" ghost bar that catches up — hits read as chunks.
const lag = ref(1)
let lagTimer = 0
watch(frac, (f, prev) => {
  window.clearTimeout(lagTimer)
  if (f > (prev ?? 1)) { lag.value = f; return }
  lagTimer = window.setTimeout(() => { lag.value = f }, 380)
})
// Immediate: the bar mounts with a boss already hurt (a reload mid-fight) —
// the trail starts where the HP is, not at full, until the first hit.
watch(() => boss.value?.monsterId, () => { lag.value = frac.value }, { immediate: true })
onUnmounted(() => window.clearTimeout(lagTimer))

// Hit jolt: every HP drop replays the track's flash (off a frame, then on).
const hitOn = ref(false)
let hitRaf = 0
watch(frac, (f, prev) => {
  if (prev === undefined || !(f < prev)) return
  hitOn.value = false
  cancelAnimationFrame(hitRaf)
  hitRaf = requestAnimationFrame(() => { hitOn.value = true })
})
// Whiff: a volley ended and no ball touched the live boss.
const whiffOn = ref(false)
let whiffRaf = 0
let touched = true
let offEvents: (() => void) | null = null
onMounted(() => {
  offEvents = barrage.onEngineEvent((e) => {
    if (e.type === 'fire') touched = false
    else if (e.type === 'hit' && e.monsterId === boss.value?.monsterId) touched = true
    else if (e.type === 'volleyEnd' && !touched && boss.value) {
      touched = true
      whiffOn.value = false
      cancelAnimationFrame(whiffRaf)
      whiffRaf = requestAnimationFrame(() => { whiffOn.value = true })
    }
  })
})
onUnmounted(() => {
  offEvents?.()
  cancelAnimationFrame(hitRaf)
  cancelAnimationFrame(whiffRaf)
})

const sizeClass = computed(() => [
  props.inline ? 'boss-bar--inline' : '',
  isCompactHud.value ? 'boss-bar--compact' : isRoomyHud.value ? 'boss-bar--roomy' : ''
])
</script>

<template lang="pug">
  Transition(name="boss-bar")
    div.boss-bar-row.flex.items-center.pointer-events-none(
      v-if="boss"
      :class="[sizeClass, { 'is-whiff': whiffOn }]"
      @animationend="whiffOn = false"
      role="status"
      :aria-label="aria"
    )
      div.boss-bar.flex.items-center.gap-1_5.min-w-0(:class="{ 'is-enraged': boss.enraged }")
        div.boss-bar__face.shrink-0
          img.w-full.h-full.object-contain(:src="bossSrc(boss.bossKind)" alt="" draggable="false")
        //- Inline: one row — name, bar.
        template(v-if="inline")
          span.boss-bar__name.game-text.font-black.uppercase.truncate.shrink(class="max-w-[45%]") {{ name }}
          div.boss-bar__track.relative.flex-1.min-w-6.overflow-hidden(:class="{ 'is-hit': hitOn }")
            div.boss-bar__lag.absolute.inset-y-0.left-0(:style="lagStyle")
            div.boss-bar__fill.absolute.inset-y-0.left-0(:style="fillStyle")
            div.boss-bar__rage.absolute.inset-y-0.left-0(v-if="!boss.enraged" :style="rageStyle")
            div.boss-bar__cracked.absolute.inset-y-0.right-0(v-if="mercy < 1" :style="crackedStyle")
        div.flex.flex-col.flex-1.min-w-0.gap-0_5(v-else)
          span.boss-bar__name.game-text.font-black.uppercase.truncate {{ name }}
          div.boss-bar__track.relative.w-full.overflow-hidden(:class="{ 'is-hit': hitOn }")
            div.boss-bar__lag.absolute.inset-y-0.left-0(:style="lagStyle")
            div.boss-bar__fill.absolute.inset-y-0.left-0(:style="fillStyle")
            div.boss-bar__rage.absolute.inset-y-0.left-0(v-if="!boss.enraged" :style="rageStyle")
            div.boss-bar__cracked.absolute.inset-y-0.right-0(v-if="mercy < 1" :style="crackedStyle")
      //- Enraged: beside the frame, never over the HP track.
      span.boss-bar__enraged.game-text.font-black.uppercase.shrink-0(v-if="boss.enraged") {{ t('barrage.boss.enraged') }}
</template>

<style scoped lang="sass">
.gap-1_5
  gap: 6px
.gap-0_5
  gap: 2px
// Slim on purpose: it hangs over row 0, where the boss itself enters — the
// canvas draws the boss's HP number there and the bar must not hide it.
.boss-bar-row
  width: min(80%, 320px)
  gap: 5px
.boss-bar
  flex: 1 1 0
  padding: 2px 7px 3px 2px
  border-radius: 10px
  background: linear-gradient(180deg, rgba(40, 10, 16, 0.86), rgba(18, 6, 12, 0.86))
  border: 2px solid #0f1a30
  box-shadow: 0 0 0 1.5px rgba(255, 120, 80, 0.55), 0 4px 10px rgba(0, 0, 0, 0.5)
.boss-bar__face
  width: 26px
  height: 26px
  border-radius: 50%
  background: radial-gradient(circle, rgba(255, 140, 90, 0.35), rgba(0, 0, 0, 0.2))
  box-shadow: inset 0 0 0 1.5px rgba(255, 180, 120, 0.7)
  overflow: hidden
.boss-bar__name
  color: #ffe3c4
  font-size: 11px
  line-height: 1
  text-shadow: 1px 1px 0 #000
.boss-bar__enraged
  color: #fff
  font-size: 10px
  line-height: 1
  padding: 2px 5px
  border-radius: 999px
  background: #d42a1f
  animation: enraged-blink 0.5s steps(2, jump-none) infinite
.boss-bar__rage
  // The enrage zone: hazard stripes, and a bright tick where they begin.
  background: repeating-linear-gradient(-45deg, rgba(255, 40, 30, 0.55) 0 3px, rgba(0, 0, 0, 0) 3px 6px)
  border-right: 2px solid #ffd0c8
  box-shadow: 1px 0 3px rgba(255, 60, 40, 0.9)
.boss-bar__track
  height: 7px
  border-radius: 999px
  background: rgba(0, 0, 0, 0.6)
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15)
.boss-bar__cracked
  // Boss mercy: the HP it lost to the player's earlier defeats — a dull stub
  // past a jagged break, with two dark cracks through it.
  background: linear-gradient(112deg, transparent 0 36%, rgba(0, 0, 0, 0.6) 36% 41%, transparent 41% 68%, rgba(0, 0, 0, 0.6) 68% 72%, transparent 72%), linear-gradient(180deg, rgba(168, 128, 110, 0.6), rgba(96, 66, 58, 0.6))
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 3px 72%, 0 50%, 3px 28%)
  animation: mercy-break 0.8s ease-out 0.4s both
  // Starts as live bar, flashes, and falls dull as the chunk breaks away.
  &::before
    content: ''
    position: absolute
    inset: 0
    background: linear-gradient(180deg, #ff9a4a, #e0461e)
    opacity: 0
    animation: mercy-flash 0.8s ease-out 0.4s both
.boss-bar__lag
  background: #fff3c4
  border-radius: 999px
  transition: width 0.5s ease-out
.boss-bar__fill
  border-radius: 999px
  background: linear-gradient(180deg, #ff9a4a, #e0461e)
  transition: width 0.15s ease-out

.boss-bar.is-enraged
  animation: enraged-glow 0.6s ease-in-out infinite alternate
  .boss-bar__fill
    background: linear-gradient(180deg, #ff4a4a, #a80d0d)

// The pill's own frame, so it reads as a label of the bar, not part of it.
.boss-bar-row .boss-bar__enraged
  border: 1.5px solid #0f1a30
  box-shadow: 0 0 0 1px rgba(255, 90, 60, 0.7)

.boss-bar--compact .boss-bar
  padding: 2px 6px 2px 2px
.boss-bar--compact
  .boss-bar__face
    width: 22px
    height: 22px
  .boss-bar__name
    font-size: 10px
  .boss-bar__track
    height: 6px
.boss-bar-row.boss-bar--roomy
  width: min(80%, 400px)
.boss-bar--roomy
  .boss-bar__face
    width: 34px
    height: 34px
  .boss-bar__name
    font-size: 14px
  .boss-bar__track
    height: 10px

// Run 6: a hit jolts the track and flashes the fill; a whiff shakes the bar.
.boss-bar__track.is-hit
  animation: boss-hit-jolt 0.18s ease-out
  .boss-bar__fill
    animation: boss-hit-flash 0.22s ease-out
.boss-bar-row.is-whiff
  animation: boss-whiff-shake 0.42s ease-in-out
@media (prefers-reduced-motion: reduce)
  .boss-bar__track.is-hit, .boss-bar-row.is-whiff
    animation: none
@keyframes boss-hit-jolt
  0%
    transform: translateY(1.5px) scaleY(1.25)
  100%
    transform: none
@keyframes boss-hit-flash
  0%
    filter: brightness(2.2) saturate(0.4)
  100%
    filter: none
@keyframes boss-whiff-shake
  0%, 100%
    transform: translateX(0)
    filter: none
  15%
    transform: translateX(-4px)
    filter: grayscale(0.7)
  35%
    transform: translateX(4px)
  55%
    transform: translateX(-3px)
  75%
    transform: translateX(2px)
    filter: grayscale(0.3)

@keyframes mercy-break
  0%, 50%
    transform: translateX(-2px)
  68%
    transform: translateX(3px)
  100%
    transform: translateX(0)
@keyframes mercy-flash
  0%, 45%
    opacity: 1
    filter: none
  55%
    opacity: 1
    filter: brightness(2.4)
  100%
    opacity: 0
    filter: none
@keyframes enraged-blink
  0%
    opacity: 1
  100%
    opacity: 0.45
@keyframes enraged-glow
  from
    box-shadow: 0 0 0 1.5px rgba(255, 60, 40, 0.7), 0 0 8px rgba(255, 40, 20, 0.4)
  to
    box-shadow: 0 0 0 2px rgba(255, 90, 60, 1), 0 0 20px rgba(255, 40, 20, 0.85)

// The top-bar strip: fills its line, no drop shadow, a thin frame.
.boss-bar-row.boss-bar--inline
  width: 100%
  height: 100%
  gap: 4px
.boss-bar--inline .boss-bar
  height: 100%
  gap: 5px
  padding: 0 6px 0 1px
  border-radius: 999px
  border-width: 1.5px
  box-shadow: 0 0 0 1px rgba(255, 120, 80, 0.5)
  .boss-bar__face
    width: auto
    height: 100%
    aspect-ratio: 1
  .boss-bar__name
    font-size: 10px
  .boss-bar__track
    height: 6px
.boss-bar--inline .boss-bar__enraged
  font-size: 8px
  padding: 1px 4px
.boss-bar-row.boss-bar--inline.boss-bar--roomy
  .boss-bar__name
    font-size: 13px
  .boss-bar__track
    height: 9px
  .boss-bar__enraged
    font-size: 10px

.boss-bar-enter-active
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease
.boss-bar-leave-active
  transition: transform 0.25s ease-in, opacity 0.25s ease-in
.boss-bar-enter-from, .boss-bar-leave-to
  transform: translateY(-120%)
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .boss-bar__enraged, .boss-bar.is-enraged, .boss-bar__cracked, .boss-bar__cracked::before
    animation: none
</style>
