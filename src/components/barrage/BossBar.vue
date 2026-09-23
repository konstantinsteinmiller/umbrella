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
 */
import { computed, ref, watch, onUnmounted } from 'vue'
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
const rageStyle = { width: `${BOSS_ENRAGE_AT * 100}%` }
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
watch(() => boss.value?.monsterId, () => { lag.value = frac.value })
onUnmounted(() => window.clearTimeout(lagTimer))

const sizeClass = computed(() => [
  props.inline ? 'boss-bar--inline' : '',
  isCompactHud.value ? 'boss-bar--compact' : isRoomyHud.value ? 'boss-bar--roomy' : ''
])
</script>

<template lang="pug">
  Transition(name="boss-bar")
    div.boss-bar.flex.items-center.gap-1_5.pointer-events-none(
      v-if="boss"
      :class="[sizeClass, { 'is-enraged': boss.enraged }]"
      role="status"
      :aria-label="aria"
    )
      div.boss-bar__face.shrink-0
        img.w-full.h-full.object-contain(:src="bossSrc(boss.bossKind)" alt="" draggable="false")
      //- Inline: one row — name, bar, enrage pill.
      template(v-if="inline")
        span.boss-bar__name.game-text.font-black.uppercase.truncate.shrink(class="max-w-[45%]") {{ name }}
        div.boss-bar__track.relative.flex-1.min-w-6.overflow-hidden
          div.boss-bar__lag.absolute.inset-y-0.left-0(:style="{ width: (lag * 100) + '%' }")
          div.boss-bar__fill.absolute.inset-y-0.left-0(:style="{ width: (frac * 100) + '%' }")
          div.boss-bar__rage.absolute.inset-y-0.left-0(v-if="!boss.enraged" :style="rageStyle")
        span.boss-bar__enraged.game-text.font-black.uppercase.shrink-0(v-if="boss.enraged") {{ t('barrage.boss.enraged') }}
      div.flex.flex-col.flex-1.min-w-0.gap-0_5(v-else)
        div.flex.items-center.justify-between.gap-1.min-w-0
          span.boss-bar__name.game-text.font-black.uppercase.truncate {{ name }}
          span.boss-bar__enraged.game-text.font-black.uppercase.shrink-0(v-if="boss.enraged") {{ t('barrage.boss.enraged') }}
        div.boss-bar__track.relative.w-full.overflow-hidden
          div.boss-bar__lag.absolute.inset-y-0.left-0(:style="{ width: (lag * 100) + '%' }")
          div.boss-bar__fill.absolute.inset-y-0.left-0(:style="{ width: (frac * 100) + '%' }")
          div.boss-bar__rage.absolute.inset-y-0.left-0(v-if="!boss.enraged" :style="rageStyle")
</template>

<style scoped lang="sass">
.gap-1_5
  gap: 6px
.gap-0_5
  gap: 2px
// Slim on purpose: it hangs over row 0, where the boss itself enters — the
// canvas draws the boss's HP number there and the bar must not hide it.
.boss-bar
  width: min(80%, 320px)
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

.boss-bar--compact
  padding: 2px 6px 2px 2px
  .boss-bar__face
    width: 22px
    height: 22px
  .boss-bar__name
    font-size: 10px
  .boss-bar__track
    height: 6px
.boss-bar--roomy
  width: min(80%, 400px)
  .boss-bar__face
    width: 34px
    height: 34px
  .boss-bar__name
    font-size: 14px
  .boss-bar__track
    height: 10px

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
.boss-bar.boss-bar--inline
  width: 100%
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
  .boss-bar__enraged
    font-size: 8px
    padding: 1px 4px
.boss-bar--inline.boss-bar--roomy
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
  .boss-bar__enraged, .boss-bar.is-enraged
    animation: none
</style>
