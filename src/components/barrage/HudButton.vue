<script setup lang="ts">
/**
 * Icon-only HUD utility button in the house style (3D base plate + gradient
 * face + navy rim), with a hit box that never drops under 44 px even where the
 * visible face is smaller — thumbs are fatter than the face needs to be.
 *
 * The caption lives ONLY in `ariaLabel` (always an i18n'd string from the
 * caller): see `BarrageGlyph` for why the HUD carries no visible captions.
 */
import { computed } from 'vue'
import { isCompactHud, isRoomyHud } from '@/use/useUser'
import { longPressTip } from '@/components/barrage/hudTip'

type Tone = 'blue' | 'purple' | 'gold' | 'orange' | 'green' | 'red' | 'teal'

const props = withDefaults(defineProps<{
  ariaLabel: string
  tone?: Tone
  /** Count bubble (e.g. unclaimed rewards). 0 / null hides it. */
  badge?: number | string | null
  /** Red notification dot without a number. */
  dot?: boolean
  /** Gold "claim me" glow. */
  pulse?: boolean
  disabled?: boolean
}>(), { tone: 'blue', badge: null, dot: false, pulse: false, disabled: false })

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

// Run 9: a long press names the button (a `title` never shows on touch).
const press = longPressTip(() => ({ name: props.ariaLabel }))
const onClick = (ev: MouseEvent): void => {
  if (press.consumed()) return
  emit('click', ev)
}

const TONES: Record<Tone, { face: string; base: string }> = {
  blue: { face: 'from-[#50aaff] to-[#2266ff]', base: 'bg-[#102e7a]' },
  purple: { face: 'from-[#a855f7] to-[#6b21a8]', base: 'bg-[#3b0f63]' },
  gold: { face: 'from-[#ffcd00] to-[#f7a000]', base: 'bg-[#7a5a12]' },
  orange: { face: 'from-[#ffb054] to-[#e07818]', base: 'bg-[#7a4a10]' },
  green: { face: 'from-[#4fd16a] to-[#27a03f]', base: 'bg-[#1c6b2a]' },
  red: { face: 'from-[#ff6a5a] to-[#d0302a]', base: 'bg-[#6b1212]' },
  teal: { face: 'from-[#3fe0d0] to-[#1a9a9a]', base: 'bg-[#0d4d52]' }
}
const tone = computed(() => TONES[props.tone])

// The visible face: 38 px on a compact phone, 40 on a phone, 46 on a roomy
// desktop. The 44 px hit box wraps it either way.
const faceClass = computed(() => isCompactHud.value
  ? 'w-[38px] h-[38px]'
  : isRoomyHud.value ? 'w-[46px] h-[46px]' : 'w-10 h-10')
const glyphClass = computed(() => isRoomyHud.value ? 'w-7 h-7' : 'w-6 h-6')
</script>

<template lang="pug">
  button.hud-btn.relative.flex.items-center.justify-center.shrink-0.cursor-pointer.transition-transform(
    type="button"
    class="min-w-11 min-h-11 active:scale-90 hover:scale-[104%] touch-manipulation"
    :class="{ 'hud-btn--pulse': pulse, 'opacity-50 grayscale': disabled }"
    :aria-label="ariaLabel"
    :title="ariaLabel"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="onClick"
    @pointerdown="press.down"
    @pointerup="press.cancel"
    @pointerleave="press.cancel"
    @pointercancel="press.cancel"
    @contextmenu.prevent
  )
    span.relative.block(:class="faceClass")
      span.absolute.inset-0.rounded-xl.translate-y-1(:class="tone.base")
      span.hud-btn__face.relative.flex.items-center.justify-center.w-full.h-full.rounded-xl.border-2.bg-gradient-to-b.text-white(
        class="border-[#0f1a30]"
        :class="tone.face"
      )
        span.block(:class="glyphClass")
          slot
      //- Extras hang off the face's corner (count, dot, silhouette …).
      slot(name="corner")
      span.hud-btn__badge.absolute.rounded-full.border-2.bg-red-500.border-white.text-white.font-black.game-text.flex.items-center.justify-center(
        v-if="badge"
        class="-top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 text-[10px] leading-none"
      ) {{ badge }}
      span.absolute.rounded-full.border-2.bg-red-500.border-white(
        v-else-if="dot"
        class="-top-1 -right-1 w-3 h-3 animate-pulse"
      )
</template>

<style scoped lang="sass">
.hud-btn__face
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.28)
  filter: drop-shadow(1px 1px 0 rgba(0, 0, 0, 0.35))

.hud-btn--pulse
  animation: hud-btn-pulse 1.6s ease-in-out infinite
@keyframes hud-btn-pulse
  0%, 100%
    filter: drop-shadow(0 0 0 rgba(255, 200, 0, 0))
  50%
    filter: drop-shadow(0 0 9px rgba(255, 200, 0, 0.85))
@media (prefers-reduced-motion: reduce)
  .hud-btn--pulse
    animation: none
    filter: drop-shadow(0 0 6px rgba(255, 200, 0, 0.7))
</style>
