<script setup lang="ts">
/**
 * The sticker-reveal / legendary-breakthrough overlay (GDD §4.2 / §5.1). Shown
 * only for noteworthy brews (a NEW discovery or a legendary) so the idle loop
 * isn't interrupted by every repeat brew. The player taps to "slap" the sticker
 * into the book. Legendary outcomes get the full-screen dim + rotating light
 * rays + giant gold typography treatment.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PotionBottle from '@/components/organisms/PotionBottle.vue'
import type { BrewOutcome } from '@/use/usePrismGame'

const props = defineProps<{ show: boolean; outcome: BrewOutcome | null }>()
const emit = defineEmits<{ (e: 'collect'): void }>()

const { t } = useI18n()

const recipe = computed(() => props.outcome?.recipe ?? null)
const isLegendary = computed(() => props.outcome?.kind === 'legendary')
const isNew = computed(() => props.outcome?.isNew ?? false)
</script>

<template lang="pug">
  Transition(name="reveal")
    div.reveal-overlay.fixed.inset-0.flex.items-center.justify-center.p-6(
      v-if="show && outcome && recipe"
      class="z-[120]"
      :class="isLegendary ? 'bg-black/85' : 'bg-black/70 backdrop-blur-sm'"
      @pointerdown="emit('collect')"
    )
      //- Rotating rays (legendary)
      div.rays.absolute.inset-0.pointer-events-none(v-if="isLegendary")

      div.relative.flex.flex-col.items-center.gap-3
        //- Legendary banner
        div.font-black.uppercase.tracking-widest.text-center.game-text.legendary-text(
          v-if="isLegendary"
          class="text-2xl sm:text-4xl"
        ) {{ t('prism.reveal.legendary') }}
        div.font-black.uppercase.tracking-wider.game-text.text-yellow-200(
          v-else-if="isNew"
          class="text-xl sm:text-2xl"
        ) {{ t('prism.reveal.newDiscovery') }}

        //- The potion, popping in
        div.potion-pop(class="w-40 h-48 sm:w-52 sm:h-60")
          PotionBottle(:shape="recipe.bottle" :liquid="recipe.liquid" :glow="isLegendary")

        //- NEW! badge
        div.flex.items-center.gap-2
          span.font-black.game-text.text-white(class="text-lg sm:text-2xl") {{ recipe.name }}
          span.rounded-full.bg-red-500.text-white.font-black.px-2(v-if="isNew" class="py-0.5 text-[10px] sm:text-xs") {{ t('prism.reveal.newBadge') }}

        //- Gold + double-yield
        div.flex.items-center.gap-2.game-text.text-yellow-300.font-black(class="text-base sm:text-xl")
          span +{{ outcome.gold }}
          span.text-yellow-200(v-if="outcome.crit" class="text-xs sm:text-sm rounded-full bg-yellow-500/20 px-2 py-0.5") {{ t('prism.reveal.doubleYield') }}

        //- Tap hint (sticker slap)
        div.game-text.animate-pulse.mt-1(class="text-white/70 text-xs sm:text-sm") {{ t('prism.reveal.tapToPlace') }}
</template>

<style scoped lang="sass">
.reveal-enter-active
  transition: opacity 0.25s ease
.reveal-leave-active
  transition: opacity 0.2s ease
.reveal-enter-from, .reveal-leave-to
  opacity: 0

.potion-pop
  animation: potion-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes potion-pop
  0%
    transform: scale(0.2) rotate(-12deg)
    opacity: 0
  60%
    transform: scale(1.15) rotate(4deg)
    opacity: 1
  100%
    transform: scale(1) rotate(0)

.legendary-text
  color: #ffd700
  text-shadow: 0 0 12px rgba(255, 210, 60, 0.9), 3px 3px 0 #7a4a00, -1px -1px 0 #000
  animation: legendary-pulse 1.4s ease-in-out infinite
@keyframes legendary-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.06)

.rays
  background: conic-gradient(from 0deg, rgba(255,210,60,0.0) 0deg, rgba(255,210,60,0.22) 12deg, rgba(255,210,60,0) 24deg, rgba(255,210,60,0.22) 36deg, rgba(255,210,60,0) 48deg, rgba(255,210,60,0.22) 60deg, rgba(255,210,60,0) 72deg, rgba(255,210,60,0.22) 84deg, rgba(255,210,60,0) 96deg, rgba(255,210,60,0.22) 108deg, rgba(255,210,60,0) 120deg)
  background-repeat: repeat
  animation: ray-spin 9s linear infinite
  will-change: transform
@keyframes ray-spin
  to
    transform: rotate(360deg)
</style>
