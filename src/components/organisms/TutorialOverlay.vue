<script setup lang="ts">
/**
 * First-session coach-marks (retention-roadmap #1). Renders a lightbox
 * spotlight over the UI element the current tutorial step points at
 * (dimmed everything-else via a giant box-shadow, hole punched over the
 * target) plus a short instruction bubble.
 *
 * The whole overlay is pointer-events:none — the player interacts with the
 * REAL controls underneath; step advancement is driven by the authoritative
 * game events inside `useTutorial`. Targets are located by `data-tut`
 * attributes the scene stamps on its elements, re-measured on a slow
 * interval + resize so layout changes (orientation flip) track.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { tutorialStep, tutorialActive, tutorialStepIndex, TUTORIAL_STEP_COUNT } from '@/use/useTutorial'
import usePrismGame from '@/use/usePrismGame'
import { dragActive } from '@/use/useDropZones'

const { t } = useI18n()
const game = usePrismGame()

/** The grid slot holding the highest-tier unit — the one the player should
 *  pick up on the drag steps. -1 when the grid is empty. */
const bestGridSlot = (): number => {
  let best = -1
  let bestTier = 0
  game.grid.value.forEach((t, i) => { if (t > bestTier) { bestTier = t; best = i } })
  return best
}

/** Spotlight target per step. The drag steps ring the ACTUAL unit to pick up
 *  (once the player lifts it, the arena's own deploy-glow takes over); on the
 *  field-merge step an empty grid points back at the Spawn button first. */
const targetSelector = (): string | null => {
  switch (tutorialStep.value) {
    case 'spawn': return '[data-tut="spawn"]'
    case 'merge': return '[data-tut="grid"]'
    case 'deploy':
    case 'fieldMerge': {
      const slot = bestGridSlot()
      if (slot >= 0) return `[data-slot="${slot}"]`
      return tutorialStep.value === 'fieldMerge' ? '[data-tut="spawn"]' : '[data-tut="arena"]'
    }
    default: return null
  }
}

interface Rect { left: number; top: number; width: number; height: number }
const rect = ref<Rect | null>(null)

const measure = (): void => {
  if (!tutorialActive.value) { rect.value = null; return }
  const sel = targetSelector()
  const el = sel ? document.querySelector<HTMLElement>(sel) : null
  if (!el) { rect.value = null; return }
  const r = el.getBoundingClientRect()
  const pad = 8
  rect.value = {
    left: r.left - pad, top: r.top - pad,
    width: r.width + pad * 2, height: r.height + pad * 2
  }
}

// Bubble above the hole when the target sits in the lower half of the screen
// (templates can't reach `window`, so the full style is computed here).
const BUBBLE_W = 260
const bubbleStyle = computed<Record<string, string>>(() => {
  const r = rect.value
  if (!r) return {} as Record<string, string>
  const vw = window.innerWidth
  const vh = window.innerHeight
  const above = r.top + r.height / 2 > vh * 0.55
  const left = Math.max(8, Math.min(r.left + r.width / 2 - BUBBLE_W / 2, vw - BUBBLE_W - 8))
  return above
    ? { left: `${left}px`, bottom: `${vh - r.top + 14}px` }
    : { left: `${left}px`, top: `${r.top + r.height + 14}px` }
})

const label = computed(() => tutorialActive.value ? t(`battle.tutorial.${tutorialStep.value}`) : '')

let poll = 0
watch(tutorialStep, () => measure())
watch(game.grid, () => measure()) // drag-step target moves with the grid contents
onMounted(() => {
  measure()
  poll = window.setInterval(measure, 500)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  window.clearInterval(poll)
  window.removeEventListener('resize', measure)
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- Hidden while a drag is in flight — the dim would obscure the drop; the
    //- arena's dashed deploy-glow guides the player from there.
    Transition(name="fade")
      div.fixed.inset-0.pointer-events-none(v-if="tutorialActive && rect && !dragActive" class="z-[70]")
        //- The spotlight hole: dims everything around the target.
        div.tut-hole.absolute.rounded-2xl(
          :style="{ left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' }"
        )
        //- Instruction bubble
        div.tut-bubble.absolute.flex.flex-col.items-center.gap-1(:style="bubbleStyle")
          div.rounded-xl.border-2.px-3.py-2.text-center(class="w-[260px] bg-gradient-to-b from-[#1a2440] to-[#0e1426] border-yellow-300 shadow-2xl")
            div.text-yellow-300.font-black.game-text.uppercase(class="text-[10px] tracking-wider") {{ tutorialStepIndex }} / {{ TUTORIAL_STEP_COUNT }}
            div.text-white.font-black.game-text(class="text-xs sm:text-sm leading-snug") {{ label }}
</template>

<style scoped lang="sass">
.tut-hole
  box-shadow: 0 0 0 200vmax rgba(4, 8, 18, 0.62)
  border: 3px dashed rgba(255, 226, 58, 0.95)
  animation: tut-pulse 1.2s ease-in-out infinite

@keyframes tut-pulse
  0%, 100%
    border-color: rgba(255, 226, 58, 0.95)
    transform: scale(1)
  50%
    border-color: rgba(255, 226, 58, 0.45)
    transform: scale(1.015)

.tut-bubble
  animation: tut-bob 1.6s ease-in-out infinite alternate

@keyframes tut-bob
  from
    transform: translateY(0)
  to
    transform: translateY(-5px)

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
