<script setup lang="ts">
/**
 * First-session coach-marks (retention-roadmap #1) — TEXTLESS.
 *
 * Play-testers skimmed or skipped the instruction bubbles, so every step is now
 * SHOWN instead of told: a coach hand presses SPAWN (the real button presses
 * with it, see `.spawn-btn--tut-press` in GameScene), and a ghost unit acts out
 * the merge, the deploy and the field merge over the real grid and arena. The
 * dimmed backdrop keeps a hole over every piece involved and four pips show
 * progress; the step's sentence lives on in a screen-reader-only live region.
 *
 * Adaptive: each step previews what the player has to do NEXT on the actual
 * board — the field-merge step shows a SPAWN press while the grid is empty, a
 * merge while two same-tier units sit on it, and the drop onto the fighter once
 * a matching unit exists.
 *
 * The whole overlay is pointer-events:none — the player drives the REAL
 * controls underneath; step advancement stays with the authoritative game
 * events inside `useTutorial`. Targets are found by `data-tut` / `data-slot` /
 * `data-fighter-id` attributes and re-measured on a slow interval + resize.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  tutorialStep, tutorialActive, tutorialStepIndex, TUTORIAL_STEP_COUNT,
  tutorialPreview, type TutorialPreview
} from '@/use/useTutorial'
import usePrismGame from '@/use/usePrismGame'
import { fighters } from '@/use/useBattle'
import { dragActive } from '@/use/useDropZones'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'

const { t } = useI18n()
const game = usePrismGame()

interface Rect { left: number; top: number; width: number; height: number }
interface Hole extends Rect { round?: boolean }
interface Point { x: number; y: number }
interface Plan {
  kind: TutorialPreview
  holes: Hole[]
  /** Spawn press: where the fingertip lands. */
  press?: Point
  /** Drag previews: the ghost's start and landing centres, its size and tier. */
  from?: Point
  to?: Point
  size?: number
  tier?: number
}

const HOLE_PAD = 8

const rectOf = (el: Element | null, pad = 0): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 }
}
const centre = (r: Rect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
const slotRect = (i: number): Rect | null => rectOf(document.querySelector(`[data-slot="${i}"]`))

/** The first two grid slots holding the same tier, lowest tier first. */
const mergePair = (): [number, number] | null => {
  const seen = new Map<number, number>()
  const order = game.grid.value
    .map((tier, i) => ({ tier, i }))
    .filter((s) => s.tier > 0)
    .sort((a, b) => a.tier - b.tier)
  for (const { tier, i } of order) {
    const other = seen.get(tier)
    if (other !== undefined) return [other, i]
    seen.set(tier, i)
  }
  return null
}

/** The grid slot holding the highest-tier unit, or -1 when the grid is empty. */
const bestSlot = (): number => {
  let best = -1
  game.grid.value.forEach((tier, i) => { if (tier > 0 && (best < 0 || tier > game.grid.value[best]!)) best = i })
  return best
}

const spawnPlan = (): Plan | null => {
  const r = rectOf(document.querySelector('[data-tut="spawn"]'))
  if (!r) return null
  return {
    kind: 'spawn',
    holes: [{ left: r.left - HOLE_PAD, top: r.top - HOLE_PAD, width: r.width + HOLE_PAD * 2, height: r.height + HOLE_PAD * 2 }],
    press: centre(r)
  }
}

const dragPlan = (kind: TutorialPreview, slot: number, target: Rect, round: boolean, extraHole?: Hole): Plan | null => {
  const from = slotRect(slot)
  if (!from) return null
  const holes: Hole[] = [
    extraHole ?? { left: from.left - HOLE_PAD, top: from.top - HOLE_PAD, width: from.width + HOLE_PAD * 2, height: from.height + HOLE_PAD * 2 },
    { ...target, round }
  ]
  return { kind, holes, from: centre(from), to: centre(target), size: from.width * 0.86, tier: game.grid.value[slot] }
}

const mergePlan = ([a, b]: [number, number]): Plan | null => {
  const to = slotRect(b)
  const grid = rectOf(document.querySelector('[data-tut="grid"]'), HOLE_PAD)
  if (!to || !grid) return null
  const plan = dragPlan('merge', a, to, false, grid)
  // One hole — the grid already frames both slots.
  if (plan) plan.holes = [grid]
  return plan
}

/** What to act out next, given the step and the real board. */
const decide = (): Plan | null => {
  if (!tutorialActive.value) return null
  switch (tutorialStep.value) {
    case 'spawn':
      return spawnPlan()
    case 'merge': {
      const pair = mergePair()
      return pair ? mergePlan(pair) : spawnPlan()
    }
    case 'deploy': {
      const slot = bestSlot()
      const arena = rectOf(document.querySelector('[data-tut="arena"]'))
      if (slot < 0 || !arena) return spawnPlan()
      // Drop zone: left of centre, where the army holds its line.
      const size = Math.min(arena.width, arena.height) * 0.42
      const drop: Rect = {
        left: arena.left + arena.width * 0.3 - size / 2,
        top: arena.top + arena.height * 0.55 - size / 2,
        width: size,
        height: size
      }
      return dragPlan('deploy', slot, drop, true)
    }
    case 'fieldMerge': {
      // A grid unit that matches a fighter → act out the drop onto it.
      const army = fighters.value.filter((f) => !f.spectral)
      let slot = -1
      let targetId = -1
      game.grid.value.forEach((tier, i) => {
        if (tier <= 0 || (slot >= 0 && tier <= game.grid.value[slot]!)) return
        const f = army.find((x) => x.tier === tier)
        if (f) { slot = i; targetId = f.id }
      })
      if (slot >= 0) {
        const target = rectOf(document.querySelector(`[data-fighter-id="${targetId}"]`), 6)
        if (target) return dragPlan('fieldMerge', slot, target, true)
      }
      const pair = mergePair()
      return pair ? mergePlan(pair) : spawnPlan()
    }
    default:
      return null
  }
}

const plan = ref<Plan | null>(null)
const visible = computed(() => tutorialActive.value && !!plan.value && !dragActive.value)

const measure = (): void => {
  plan.value = decide()
  const arena = rectOf(document.querySelector('[data-tut="arena"]'))
  pipsAt.value = arena ? { x: arena.left + arena.width / 2, y: arena.top + 10 } : null
}

// The Spawn button presses itself in time with the hand; hidden → no press.
watch([visible, () => plan.value?.kind], () => {
  tutorialPreview.value = visible.value ? plan.value!.kind : null
}, { immediate: true })

// ─── Layout helpers for the template ─────────────────────────────────────────
/** Empty style (typed, so the computeds below keep `Record<string, string>`). */
const NONE: Record<string, string> = {}
const HAND = 46 // px; the SVG's fingertip sits at (18.5, 4) of 64
const TIP_X = (18.5 / 64) * HAND
const TIP_Y = (4 / 64) * HAND

const handPressStyle = computed<Record<string, string>>(() => {
  const p = plan.value?.press
  if (!p) return NONE
  return { left: `${p.x - TIP_X}px`, top: `${p.y - TIP_Y}px`, width: `${HAND}px`, height: `${HAND}px` }
})
const ripplePressStyle = computed<Record<string, string>>(() => {
  const p = plan.value?.press
  return p ? { left: `${p.x}px`, top: `${p.y}px` } : NONE
})

const dragVars = computed<Record<string, string>>(() => {
  const pl = plan.value
  if (!pl?.from || !pl.to) return NONE
  return { '--dx': `${pl.to.x - pl.from.x}px`, '--dy': `${pl.to.y - pl.from.y}px` }
})
const ghostStyle = computed<Record<string, string>>(() => {
  const pl = plan.value
  if (!pl?.from || !pl.size) return NONE
  return { ...dragVars.value, left: `${pl.from.x - pl.size / 2}px`, top: `${pl.from.y - pl.size / 2}px`, width: `${pl.size}px`, height: `${pl.size}px` }
})
// The fingertip grips the ghost just below-right of its centre, so the unit
// itself stays visible under the hand.
const handDragStyle = computed<Record<string, string>>(() => {
  const pl = plan.value
  if (!pl?.from || !pl.size) return NONE
  return {
    ...dragVars.value,
    left: `${pl.from.x + pl.size * 0.14 - TIP_X}px`,
    top: `${pl.from.y + pl.size * 0.18 - TIP_Y}px`,
    width: `${HAND}px`,
    height: `${HAND}px`
  }
})
const landStyle = computed<Record<string, string>>(() => {
  const pl = plan.value
  if (!pl?.to || !pl.size) return NONE
  const s = pl.size * 1.1
  return { left: `${pl.to.x - s / 2}px`, top: `${pl.to.y - s / 2}px`, width: `${s}px`, height: `${s}px` }
})

// Progress pips in ONE fixed place — the top centre of the arena — so they're
// learned once and never land on a chip or a button beside the current hole.
const pipsAt = ref<Point | null>(null)
const pipsStyle = computed<Record<string, string>>(() => {
  const p = pipsAt.value
  return p ? { left: `${p.x}px`, top: `${p.y}px` } : NONE
})

const label = computed(() => tutorialActive.value ? t(`battle.tutorial.${tutorialStep.value}`) : '')

let poll = 0
watch(tutorialStep, () => measure())
watch(game.grid, () => measure()) // the preview follows the grid contents
onMounted(() => {
  measure()
  poll = window.setInterval(measure, 500)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  window.clearInterval(poll)
  window.removeEventListener('resize', measure)
  tutorialPreview.value = null
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- The step's sentence, for screen readers only — the screen shows it.
    div.sr-only(v-if="tutorialActive" aria-live="polite") {{ label }}
    //- Hidden while a drag is in flight — the dim would obscure the drop.
    Transition(name="fade")
      div.fixed.inset-0.pointer-events-none(v-if="visible && plan" class="z-[70]" aria-hidden="true")
        //- Dim with a hole over every piece the step involves.
        svg.absolute.inset-0(width="100%" height="100%")
          defs
            mask#tut-dim-mask
              rect(width="100%" height="100%" fill="#fff")
              rect(
                v-for="(h, i) in plan.holes" :key="i"
                :x="h.left" :y="h.top" :width="h.width" :height="h.height"
                :rx="h.round ? h.width / 2 : 16" fill="#000"
              )
          rect(width="100%" height="100%" fill="rgba(4, 8, 18, 0.62)" mask="url(#tut-dim-mask)")
        div.tut-hole.absolute(
          v-for="(h, i) in plan.holes" :key="'ring' + i"
          :class="h.round ? 'rounded-full' : 'rounded-2xl'"
          :style="{ left: h.left + 'px', top: h.top + 'px', width: h.width + 'px', height: h.height + 'px' }"
        )

        //- Progress: one pip per step, done ones lit.
        div.tut-pips.absolute.flex(class="gap-1.5" :style="pipsStyle")
          span.tut-pip(v-for="n in TUTORIAL_STEP_COUNT" :key="n" :class="{ 'tut-pip--on': n <= tutorialStepIndex, 'tut-pip--now': n === tutorialStepIndex }")

        //- ── SPAWN: the hand presses the button, a ripple marks the tap ──
        template(v-if="plan.kind === 'spawn'")
          div.tut-ripple.absolute(:key="'ripple-spawn'" :style="ripplePressStyle")
          div.tut-hand.tut-hand--press.absolute(:key="'hand-spawn'" :style="handPressStyle")
            svg(viewBox="0 0 64 64" width="100%" height="100%")
              g(fill="#fff" stroke="#0f1a30" stroke-width="3" stroke-linejoin="round" stroke-linecap="round")
                path(d="M13 32 H43 A8 8 0 0 1 51 40 V46 A14 14 0 0 1 37 60 H25 A14 14 0 0 1 11 46 V36 A4 4 0 0 1 13 32 Z")
                rect(x="24" y="24" width="9" height="15" rx="4.5")
                rect(x="32.5" y="26" width="9" height="14" rx="4.5")
                rect(x="41" y="29" width="9" height="12" rx="4.5")
                rect(x="13" y="4" width="11" height="34" rx="5.5")
                path(d="M13 41 C5 39 3 47 8 51 C10 53 13 54 15 54")

        //- ── Drag previews: a ghost unit rides the hand to where it belongs ──
        template(v-else)
          div.tut-land.absolute(:key="'land-' + plan.kind" :class="{ 'tut-land--heal': plan.kind === 'fieldMerge' }" :style="landStyle")
          div.tut-ghost.absolute(:key="'ghost-' + plan.kind" :style="ghostStyle")
            IngredientUnit(v-if="plan.tier" :tier="plan.tier" :still="true")
          div.tut-hand.tut-hand--drag.absolute(:key="'hand-' + plan.kind" :style="handDragStyle")
            svg(viewBox="0 0 64 64" width="100%" height="100%")
              g(fill="#fff" stroke="#0f1a30" stroke-width="3" stroke-linejoin="round" stroke-linecap="round")
                path(d="M13 32 H43 A8 8 0 0 1 51 40 V46 A14 14 0 0 1 37 60 H25 A14 14 0 0 1 11 46 V36 A4 4 0 0 1 13 32 Z")
                rect(x="24" y="24" width="9" height="15" rx="4.5")
                rect(x="32.5" y="26" width="9" height="14" rx="4.5")
                rect(x="41" y="29" width="9" height="12" rx="4.5")
                rect(x="13" y="4" width="11" height="34" rx="5.5")
                path(d="M13 41 C5 39 3 47 8 51 C10 53 13 54 15 54")
</template>

<style scoped lang="sass">
.tut-hole
  border: 3px dashed rgba(255, 226, 58, 0.95)
  animation: tut-pulse 1.2s ease-in-out infinite

@keyframes tut-pulse
  0%, 100%
    border-color: rgba(255, 226, 58, 0.95)
    transform: scale(1)
  50%
    border-color: rgba(255, 226, 58, 0.45)
    transform: scale(1.015)

// ── Progress pips ──
.tut-pips
  translate: -50% 0
.tut-pip
  width: 9px
  height: 9px
  border-radius: 50%
  background: rgba(255, 255, 255, 0.28)
  box-shadow: 0 0 0 2px #0f1a30
.tut-pip--on
  background: #ffe23a
.tut-pip--now
  animation: tut-pip-now 1.2s ease-in-out infinite alternate
@keyframes tut-pip-now
  from
    transform: scale(1)
  to
    transform: scale(1.35)

// ── The coach hand ──
// The fingertip is the hotspot, so every press and grab pivots on it.
.tut-hand
  transform-origin: 13.3px 2.9px
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.5))
  z-index: 2

// SPAWN press — 1.4 s, the same loop as `.spawn-btn--tut-press` in GameScene.
.tut-hand--press
  animation: tut-hand-press 1.4s ease-in-out infinite
@keyframes tut-hand-press
  0%
    transform: translate(10px, 16px)
    opacity: 0
  20%, 34%
    transform: translate(0, 0) scale(1)
    opacity: 1
  42%, 50%
    transform: translate(0, 3px) scale(0.92)
    opacity: 1
  58%
    transform: translate(0, 0) scale(1)
    opacity: 1
  86%
    transform: translate(4px, 7px)
    opacity: 1
  100%
    transform: translate(10px, 16px)
    opacity: 0
.tut-ripple
  width: 36px
  height: 36px
  margin: -18px 0 0 -18px
  border-radius: 50%
  border: 3px solid rgba(255, 255, 255, 0.9)
  animation: tut-ripple 1.4s ease-out infinite
@keyframes tut-ripple
  0%, 42%
    transform: scale(0.3)
    opacity: 0
  48%
    opacity: 0.95
  78%, 100%
    transform: scale(1.5)
    opacity: 0

// Drag previews — 2.4 s: grab, carry, drop, pause.
.tut-ghost
  z-index: 1
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.45))
  animation: tut-ghost-drag 2.4s ease-in-out infinite
@keyframes tut-ghost-drag
  0%
    transform: translate(0, 0) scale(0.85)
    opacity: 0
  10%
    transform: translate(0, 0) scale(1.12)
    opacity: 0.92
  58%
    transform: translate(var(--dx), var(--dy)) scale(1.12)
    opacity: 0.92
  66%
    transform: translate(var(--dx), var(--dy)) scale(1.3)
    opacity: 1
  78%, 100%
    transform: translate(var(--dx), var(--dy)) scale(1.5)
    opacity: 0
.tut-hand--drag
  animation: tut-hand-drag 2.4s ease-in-out infinite
@keyframes tut-hand-drag
  0%
    transform: translate(6px, 12px)
    opacity: 0
  8%
    transform: translate(0, 0) scale(1)
    opacity: 1
  12%
    transform: translate(0, 2px) scale(0.92)
    opacity: 1
  58%
    transform: translate(var(--dx), calc(var(--dy) + 2px)) scale(0.92)
    opacity: 1
  64%
    transform: translate(var(--dx), var(--dy)) scale(1)
    opacity: 1
  80%, 100%
    transform: translate(calc(var(--dx) + 8px), calc(var(--dy) + 14px))
    opacity: 0
// The landing: a ring blooms as the ghost arrives — gold for a merge / deploy,
// green (heal + rank up) for the field merge.
.tut-land
  border-radius: 50%
  border: 3px solid rgba(255, 226, 58, 0.95)
  box-shadow: 0 0 10px rgba(255, 226, 58, 0.6)
  animation: tut-land 2.4s ease-out infinite
.tut-land--heal
  border-color: rgba(80, 230, 140, 0.95)
  box-shadow: 0 0 12px rgba(80, 230, 140, 0.75)
@keyframes tut-land
  0%, 58%
    transform: scale(0.4)
    opacity: 0
  66%
    transform: scale(0.9)
    opacity: 1
  84%, 100%
    transform: scale(1.35)
    opacity: 0

@media (prefers-reduced-motion: reduce)
  .tut-hole, .tut-pip--now, .tut-ripple, .tut-land
    animation: none
  // The previews ARE the instructions, so they keep moving — just gentler.
  .tut-hand--press, .tut-hand--drag, .tut-ghost
    animation-duration: 3.2s

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
