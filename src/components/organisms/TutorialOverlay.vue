<script setup lang="ts">
/**
 * First-session coach marks for Elemental Barrage — TEXTLESS, like MIW's.
 *
 * Play-testers skim instruction bubbles, so every beat is SHOWN: the step's
 * sentence lives on only in a screen-reader live region.
 *
 *   'aim'   — FingerDemo: a ghost hand lands mid-board above the unit, drags
 *             TOWARD what the beat wants hit while a dashed ghost line grows
 *             under it from the unit; release, and a ghost ball flies the real
 *             path (`engine.aimPreview`) and fades. Looping, with an empty beat
 *             between loops. The board aims at a finger above the unit, so
 *             this is the gesture every blind play-tester tried first. (The
 *             slingshot demo before it pulled the hand DOWN onto the tray,
 *             where a still frame read "tap this card".) It aims at the
 *             nearest "+1" bubble on the pickup/merge beats, the monster over
 *             the launcher otherwise — and steps aside on turn 2–3 when the
 *             coach has an angled bank shot to show (useCoach, `bank`).
 *   'press' — UpgradeDemo on the free / glowing upgrade chip: the hand
 *             presses it, a spark flies to what it changes (the free Tray
 *             Capacity: a new socket in the tray) and the effect plays there.
 *             A dimmed backdrop with two windows: the chip and that target.
 *
 * The overlay is pointer-events: none throughout — the player drives the real
 * board underneath — and it gets out of the way the instant a finger is on the
 * board (`playerAiming`), a volley is running, a modal is open, or a tier
 * reveal or the merge lightbox owns the moment — and while the coach plays
 * the lose rule (`overrun`: a first-timer can reach the line before the FTUE
 * is over, and that rule comes before every other lesson).
 *
 * The aim hand follows the coach's 20-second rule (`shotDemoDue`): after the
 * first shot it stays away until no shot has been fired for 20 s. Its very
 * first appearance skips the fade, so the first frame of the game already
 * shows the hand (run 2: a still frame of the fading-in demo read as a
 * "joystick circle").
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  tutorialStep, tutorialActive, tutorialStepIndex, TUTORIAL_STEP_COUNT, tutorialPreview
} from '@/use/useTutorial'
import useBarrage from '@/barrage/state/useBarrage'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'
import { FLOOR_Y, MIN_AIM } from '@/barrage/engine/types'
import { isAnyModalOpen } from '@/use/useModalState'
import { activeReveal } from '@/use/useTierReveal'
import { boardApi, playerAiming } from '@/components/barrage/barrageUi'
import { isCompactHud } from '@/use/useUser'
import { coachLesson, shotDemoDue } from '@/use/useCoach'
import { mergeBox } from '@/components/barrage/mergeLightbox'
import FingerDemo from '@/components/barrage/coach/FingerDemo.vue'
import UpgradeDemo from '@/components/barrage/coach/UpgradeDemo.vue'
import type { UpgradeId } from '@/barrage/engine/types'

const { t } = useI18n()
const barrage = useBarrage()
const upgrades = useBarrageUpgrades()

interface Point { x: number; y: number }
interface Hole { left: number; top: number; width: number; height: number }

type Plan =
  | {
    kind: 'aim'
    /** The unit (client px), the shot direction on screen, the aim path
     *  (client px, launcher first) and the cell size. */
    launcher: Point
    dir: Point
    path: Point[]
    cell: number
    /** The board's client rect — the demo never leaves it. */
    bounds: Hole | null
  }
  | {
    kind: 'press'
    id: UpgradeId
    /** The chip first, then what the upgrade changes (the effect's window). */
    holes: Hole[]
  }

const HOLE_PAD = 6

// ─── Deciding what to act out ────────────────────────────────────────────────
/** Cell-space target the current beat wants hit. */
const aimTarget = (): Point | null => {
  const st = barrage.engine.value.state
  const lx = st.launcherX
  if (tutorialStep.value === 'pickup' || tutorialStep.value === 'merge') {
    let best: Point | null = null
    let bestD = Infinity
    for (const p of st.pickups) {
      if (p.kind !== 'ball') continue
      const c = { x: p.col + 0.5, y: p.row + 0.5 }
      const d = Math.abs(c.x - lx) + (FLOOR_Y - c.y) * 0.1
      if (d < bestD) { bestD = d; best = c }
    }
    if (best) return best
  }
  // The monster most directly above the launcher — the FTUE's middle slime.
  let best: Point | null = null
  let bestD = Infinity
  for (const m of st.monsters) {
    const c = { x: m.col + m.w / 2, y: m.row + m.h / 2 }
    if (c.y < 0) continue
    const d = Math.abs(c.x - lx)
    if (d < bestD) { bestD = d; best = c }
  }
  return best ?? { x: lx, y: 1 }
}

const aimPlan = (): Plan | null => {
  const board = boardApi.value
  if (!board) return null
  const L = board.launcherClientPoint()
  const o = board.cellToClient(0, 0)
  const o1 = board.cellToClient(1, 0)
  const target = aimTarget()
  if (!L || !o || !o1 || !target) return null
  const cell = Math.max(8, o1.x - o.x)
  const st = barrage.engine.value.state
  const raw = Math.atan2(FLOOR_Y - target.y, target.x - st.launcherX)
  const angle = Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, raw))
  let path: Point[] = []
  try {
    path = barrage.engine.value.aimPreview(angle).points
      .map((p) => board.cellToClient(p.x, p.y))
      .filter((p): p is Point => p !== null)
  } catch {
    path = []
  }
  // Screen direction of the shot (y grows down in both spaces).
  const dir = { x: Math.cos(angle), y: -Math.sin(angle) }
  if (path.length < 2) path = [L, { x: L.x + dir.x * cell * 6, y: L.y + dir.y * cell * 6 }]
  const r = board.boardClientRect()
  const bounds = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
  return { kind: 'aim', launcher: L, dir, path, cell, bounds }
}

const holeOf = (r: { left: number; top: number; width: number; height: number }, pad = HOLE_PAD): Hole =>
  ({ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 })

/** The window over what an upgrade changes, so its effect is not dimmed. */
const effectHole = (id: UpgradeId): Hole | null => {
  switch (id) {
    case 'capacity': {
      const el = document.querySelector('[data-tut="tray"]')
      const r = el?.getBoundingClientRect()
      return r && r.width > 0 ? holeOf(r) : null
    }
    case 'damage':
    case 'speed': {
      const L = boardApi.value?.launcherClientPoint()
      const o = boardApi.value?.cellToClient(0, 0)
      const o1 = boardApi.value?.cellToClient(1, 0)
      if (!L || !o || !o1) return null
      const c = o1.x - o.x
      return { left: L.x - c * 1.1, top: L.y - c * 5.2, width: c * 2.2, height: c * 6 }
    }
    case 'luck': {
      const r = boardApi.value?.boardClientRect()
      return r ? holeOf(r, 0) : null
    }
    case 'bounty': {
      const r = document.querySelector('.coin-badge')?.getBoundingClientRect()
      return r && r.width > 0 ? holeOf(r) : null
    }
    default:
      return null
  }
}

const pressPlan = (): Plan | null => {
  const id: UpgradeId | null = upgrades.freeCapacityOffer.value ? 'capacity' : upgrades.glowingId.value
  if (!id) return null
  const el = document.querySelector(`[data-tut="upgrade-${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0) return null
  const effect = effectHole(id)
  return { kind: 'press', id, holes: effect ? [holeOf(r), effect] : [holeOf(r)] }
}

const decide = (): Plan | null => {
  if (!tutorialActive.value) return null
  if (barrage.phase.value !== 'aim' || barrage.holdSim.value) return null
  return tutorialStep.value === 'upgrade' ? pressPlan() : aimPlan()
}

const plan = ref<Plan | null>(null)
/** The coach's early bank shot owns the aim beat it lands on (one hand at a
 *  time; that shot teaches the angle, this one only "shoot"). */
const coachHasShot = computed(() => {
  const l = coachLesson.value
  return l?.id === 'combo' && !!l.bank
})
const hidden = computed(() =>
  playerAiming.value || isAnyModalOpen.value || !!activeReveal.value || !!mergeBox.value
  || coachLesson.value?.id === 'overrun'
  || (plan.value?.kind === 'aim' && (coachHasShot.value || !shotDemoDue.value)))
const visible = computed(() => tutorialActive.value && !!plan.value && !hidden.value)

const measure = (): void => {
  plan.value = decide()
  const r = boardApi.value?.boardClientRect()
  pipsAt.value = r ? { x: r.left + r.width / 2, y: r.top + 8 } : null
}

watch([visible, () => plan.value?.kind], () => {
  tutorialPreview.value = visible.value && plan.value ? plan.value.kind : null
}, { immediate: true })

/** No fade-in for the overlay's first appearance (see the header). */
const shownOnce = ref(false)
watch(visible, (v) => { if (v) window.setTimeout(() => { shownOnce.value = true }, 0) }, { immediate: true })

// ─── Template geometry ───────────────────────────────────────────────────────
const NONE: Record<string, string> = {}

const aim = computed(() => (plan.value?.kind === 'aim' ? plan.value : null))
const press = computed(() => (plan.value?.kind === 'press' ? plan.value : null))


const pipsAt = ref<Point | null>(null)
const pipsStyle = computed<Record<string, string>>(() => {
  const p = pipsAt.value
  return p ? { left: `${p.x}px`, top: `${p.y}px` } : NONE
})

const label = computed(() => tutorialActive.value ? t(`barrage.tutorial.${tutorialStep.value}`) : '')

// The launcher moves after every volley and pickups march each turn: re-plan on
// every phase change and on a slow poll (cheap — a handful of rect reads).
let poll = 0
watch(tutorialStep, () => measure())
watch(() => barrage.phase.value, () => measure())
watch(() => barrage.engineGen.value, () => measure())
watch(() => upgrades.freeCapacityOffer.value, () => measure())
onMounted(() => {
  measure()
  poll = window.setInterval(measure, 300)
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
    //- The beat's sentence, for screen readers only — the screen SHOWS it.
    div.sr-only(v-if="tutorialActive" aria-live="polite") {{ label }}
    Transition(name="fade" :css="shownOnce")
      div.fixed.inset-0.pointer-events-none(v-if="visible && plan" class="z-[70]" aria-hidden="true")
        //- ── PRESS: dim with a window over the chip and one over its effect ──
        template(v-if="press")
          svg.absolute.inset-0(width="100%" height="100%")
            defs
              mask#tut-dim-mask
                rect(width="100%" height="100%" fill="#fff")
                rect(v-for="(h, i) in press.holes" :key="i" :x="h.left" :y="h.top" :width="h.width" :height="h.height" rx="14" fill="#000")
            rect(width="100%" height="100%" fill="rgba(4, 8, 18, 0.5)" mask="url(#tut-dim-mask)")
          div.tut-hole.absolute.rounded-2xl(:style="{ left: press.holes[0].left + 'px', top: press.holes[0].top + 'px', width: press.holes[0].width + 'px', height: press.holes[0].height + 'px' }")
          UpgradeDemo(:id="press.id" :ring="false")

        //- ── AIM: a finger drags toward the target inside the board, release ──
        FingerDemo(
          v-else-if="aim"
          :launcher="aim.launcher"
          :dir="aim.dir"
          :path="aim.path"
          :cell="aim.cell"
          :bounds="aim.bounds"
        )

        //- Progress: one pip per beat, done ones lit — always at the board's top centre.
        //- Dropped on compact phones: there, row 0 sits right under the board's top
        //- edge and the pips would cover the monsters being taught.
        div.tut-pips.absolute.flex(v-if="!isCompactHud" class="gap-1.5" :style="pipsStyle")
          span.tut-pip(v-for="n in TUTORIAL_STEP_COUNT" :key="n" :class="{ 'tut-pip--on': n <= tutorialStepIndex, 'tut-pip--now': n === tutorialStepIndex }")
</template>

<style scoped lang="sass">
.tut-hole
  border: 3px dashed rgba(255, 226, 58, 0.95)
  animation: tut-pulse 1.2s ease-in-out infinite
@keyframes tut-pulse
  0%, 100%
    border-color: rgba(255, 226, 58, 0.95)
  50%
    border-color: rgba(255, 226, 58, 0.45)

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

@media (prefers-reduced-motion: reduce)
  // The demos keep moving (slower, on their own clocks): the gestures ARE the
  // instructions.
  .tut-hole, .tut-pip--now
    animation: none

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
