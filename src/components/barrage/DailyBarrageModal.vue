<script setup lang="ts">
/**
 * Daily Barrage — today's seeded board (identical for everyone, deterministic
 * engine), no continues. The D1 hook: today's best, attempts and the day streak.
 * Starting it parks the endless run (the state layer saves and resumes it).
 * The result after a daily breach is shown by BreachModal's daily variant.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import useBarrage from '@/barrage/state/useBarrage'
import useDailyBarrage from '@/barrage/state/useDailyBarrage'
import useSounds from '@/use/useSound'

defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t, locale } = useI18n()
const barrage = useBarrage()
const daily = useDailyBarrage()
const { playSound } = useSounds()

/** 'YYYY-MM-DD' → the locale's own short date (Latin digits, like every other HUD number). */
const dateLabel = computed(() => {
  const [y, m, d] = daily.today.value.split('-').map((x) => Number(x))
  if (!y || !m || !d) return daily.today.value
  try {
    return new Intl.DateTimeFormat(locale.value, { day: 'numeric', month: 'short', numberingSystem: 'latn' })
      .format(new Date(y, m - 1, d))
  } catch {
    return daily.today.value
  }
})

const close = (): void => emit('update:modelValue', false)
const onPlay = (): void => {
  // STATE refuses mid-volley / over a pending breach or chest; the button says why.
  if (!barrage.canStartDaily.value) return
  barrage.startDaily()
  playSound('boss-incoming', 0.05, 1.1)
  close()
}
const onLeave = (): void => {
  barrage.exitDaily()
  close()
}
</script>

<template lang="pug">
  FModal(
    :model-value="modelValue"
    :title="t('barrageMeta.daily.title')"
    @update:model-value="emit('update:modelValue', $event)"
  )
    div.daily.flex.flex-col.items-center.gap-3.px-2.pb-2
      p.game-text.text-white.text-center.opacity-90(class="text-sm") {{ t('barrageMeta.daily.subtitle') }}
      div.daily-date.game-text.font-black.flex.items-center.gap-2
        BarrageGlyph.w-5.h-5(name="daily")
        span {{ t('barrage.daily.today', { date: dateLabel }) }}
      div.grid.grid-cols-3.gap-2.w-full(class="max-w-sm")
        div.daily-stat
          span.daily-stat__v.game-text {{ daily.todayBest.value > 0 ? daily.todayBest.value : '—' }}
          span.daily-stat__k.game-text {{ t('barrage.daily.bestLabel') }}
        div.daily-stat
          span.daily-stat__v.game-text {{ daily.attemptsToday.value }}
          span.daily-stat__k.game-text {{ t('barrage.daily.attemptsLabel') }}
        div.daily-stat.daily-stat--streak
          span.daily-stat__v.game-text {{ daily.streak.value }}
          span.daily-stat__k.game-text {{ t('barrage.daily.streakLabel') }}
      p.game-text.text-center.opacity-70(class="text-[11px]") {{ t('barrageMeta.daily.rules') }}
      template(v-if="daily.isActive.value")
        span.daily-active.game-text.font-black.uppercase {{ t('barrage.daily.active') }}
        div.flex.flex-wrap.justify-center.gap-2
          button.daily-btn.daily-btn--play(type="button" @click="close") {{ t('barrage.daily.keepPlaying') }}
          button.daily-btn.daily-btn--leave(type="button" @click="onLeave") {{ t('barrage.daily.quit') }}
      template(v-else)
        button.daily-btn.daily-btn--play(
          type="button"
          :class="{ 'is-waiting': !barrage.canStartDaily.value }"
          :aria-disabled="!barrage.canStartDaily.value ? 'true' : undefined"
          @click="onPlay"
        ) {{ daily.attemptsToday.value > 0 ? t('barrage.daily.playAgain') : t('barrageMeta.daily.play') }}
        p.game-text.text-center.text-yellow-200(v-if="!barrage.canStartDaily.value" class="text-[11px]") {{ t('barrage.daily.waitTurn') }}
</template>

<style scoped lang="sass">
.daily-date
  color: #ffe27a
  font-size: 15px
  text-shadow: 1px 1px 0 #000
.daily-stat
  display: flex
  flex-direction: column
  align-items: center
  gap: 2px
  padding: 8px 4px
  border-radius: 12px
  background: rgba(0, 0, 0, 0.3)
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.12)
.daily-stat--streak
  box-shadow: inset 0 0 0 1.5px rgba(255, 150, 60, 0.6)
.daily-stat__v
  font-size: 22px
  font-weight: 900
  color: #fff
  line-height: 1
  text-shadow: 2px 2px 0 #000
.daily-stat__k
  font-size: 10px
  font-weight: 900
  text-transform: uppercase
  color: #b9cbe8
  text-align: center
  line-height: 1.1
.daily-active
  color: #8dffa6
  font-size: 13px
.daily-btn
  min-width: 150px
  min-height: 48px
  padding: 8px 18px
  border-radius: 14px
  border: 2px solid #0f1a30
  color: #fff
  font-weight: 900
  font-size: 16px
  text-transform: uppercase
  cursor: pointer
  font-family: inherit
  text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.55)
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 4px 0 var(--plate)
  touch-action: manipulation
  &:active
    transform: translateY(2px)
.daily-btn--play
  --plate: #1c6b2a
  background: linear-gradient(180deg, #4fd16a, #27a03f)
.daily-btn.is-waiting
  filter: grayscale(0.7) brightness(0.8)
  cursor: default
.daily-btn--leave
  --plate: #6b1212
  background: linear-gradient(180deg, #ff6a5a, #d0302a)
</style>
