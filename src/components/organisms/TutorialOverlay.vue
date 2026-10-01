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
 *             nearest "+1" bubble on the pickup/merge beats (which pulse on
 *             the board, `worldCues.plusPulse`), the monster over the launcher
 *             otherwise.
 *
 * Silent Flow (retention-roadmap #2): that ghost finger, under "Tap to Shoot"
 * (ShootPrompt), is the ONE hand before the first boss kill. The upgrade
 * beat's dimmed stage — a hand pressing the free chip — is gone: the chip
 * flies in when it becomes free and glows and presses itself in the upgrade
 * row (UpgradeBar); unclaimed, it is granted on its own (useTutorial). The
 * progress pips over the board went with it (frame 1 shows the board, the
 * launcher, the call to action and the boss countdown).
 *
 * The overlay is pointer-events: none throughout — the player drives the real
 * board underneath — and it gets out of the way the instant a finger is on the
 * board (`playerAiming`), a volley is running, a modal is open, or a tier
 * reveal owns the moment.
 *
 * The aim hand follows the coach's 20-second rule (`shotDemoDue`): after the
 * first shot it stays away until no shot has been fired for 20 s. Before the
 * very first shot it plays under "Tap to Shoot" (ShootPrompt) — the designer's
 * call after run 8: the drag demo stays while a first-timer has not shot
 * (run 7 had held it back for the banner). Its first appearance skips the
 * fade (run 2: a still frame of the fading-in demo read as a "joystick circle").
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { tutorialStep, tutorialActive, tutorialPreview } from '@/use/useTutorial'
import useBarrage from '@/barrage/state/useBarrage'
import { FLOOR_Y, MIN_AIM } from '@/barrage/engine/types'
import { isAnyModalOpen } from '@/use/useModalState'
import { activeReveal } from '@/use/useTierReveal'
import { boardApi, playerAiming } from '@/components/barrage/barrageUi'
import { coachLesson, shotDemoDue } from '@/use/useCoach'
import FingerDemo from '@/components/barrage/coach/FingerDemo.vue'

const { t } = useI18n()
const barrage = useBarrage()

interface Point { x: number; y: number }
interface Box { left: number; top: number; width: number; height: number }

interface AimPlan {
  /** The unit (client px), the shot direction on screen, the aim path
   *  (client px, launcher first) and the cell size. */
  launcher: Point
  dir: Point
  path: Point[]
  cell: number
  /** The board's client rect — the demo never leaves it. */
  bounds: Box | null
}

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

const aimPlan = (): AimPlan | null => {
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
  return { launcher: L, dir, path, cell, bounds }
}

/** Only the shot beats act anything out (the upgrade beat is the chip's own). */
const decide = (): AimPlan | null => {
  if (!tutorialActive.value || tutorialStep.value === 'upgrade') return null
  if (barrage.phase.value !== 'aim' || barrage.holdSim.value) return null
  return aimPlan()
}

const plan = ref<AimPlan | null>(null)
/** The coach's early bank shot owns the aim beat it lands on (one hand at a
 *  time; that shot teaches the angle, this one only "shoot"). */
const coachHasShot = computed(() => {
  const l = coachLesson.value
  return l?.id === 'combo' && !!l.bank
})
const hidden = computed(() =>
  playerAiming.value || isAnyModalOpen.value || !!activeReveal.value || coachHasShot.value || !shotDemoDue.value)
const visible = computed(() => tutorialActive.value && !!plan.value && !hidden.value)

const measure = (): void => { plan.value = decide() }

watch(visible, () => {
  tutorialPreview.value = visible.value && plan.value ? 'aim' : null
}, { immediate: true })

/** No fade-in for the overlay's first appearance (see the header). */
const shownOnce = ref(false)
watch(visible, (v) => { if (v) window.setTimeout(() => { shownOnce.value = true }, 0) }, { immediate: true })

const label = computed(() => tutorialActive.value ? t(`barrage.tutorial.${tutorialStep.value}`) : '')

// The launcher moves after every volley and pickups march each turn: re-plan on
// every phase change and on a slow poll (cheap — a handful of rect reads).
let poll = 0
watch(tutorialStep, () => measure())
watch(() => barrage.phase.value, () => measure())
watch(() => barrage.engineGen.value, () => measure())
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
        //- A finger drags toward the target inside the board, release.
        FingerDemo(
          :launcher="plan.launcher"
          :dir="plan.dir"
          :path="plan.path"
          :cell="plan.cell"
          :bounds="plan.bounds"
        )
</template>

<style scoped lang="sass">
.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
