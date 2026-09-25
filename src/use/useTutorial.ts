/**
 * useTutorial — Elemental Barrage's first-session FTUE (CONTRACT §7).
 *
 * Four beats, each advanced by the REAL engine event that proves the player
 * did it (no scripted fake state — the engine's `config.ftue` board supplies
 * the easy slimes and the in-line "+1" pickups):
 *
 *   aim     → the first shot                 (engine `fire`)
 *   pickup  → a "+1" ball bubble collected   (engine `pickup`, kind ball)
 *   merge   → the tray overflowed and merged (engine `trayMerge`)
 *   upgrade → the free "Tray Capacity 3" (or the glowing upgrade) bought
 *   done
 *
 * Events AHEAD of the current beat advance past it (a lucky first volley that
 * already collects a pickup has taught the pickup), never behind it.
 *
 * Progress persists as a step index in the state blob (`eb_tutorial_step`);
 * veterans — a best row past 1 and no tutorial progress on record — skip it.
 *
 * This module must stay leaf-level (state-blob imports only): the wiring to the
 * live run arrives through `installBarrageTutorial`, called by GameScene.
 */
import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState, flushPersist, prismState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import type { EngineListener } from '@/barrage/engine/types'
import { EB_TUTORIAL_STEP_KEY } from '@/barrage/keys'

export type TutorialStep = 'aim' | 'pickup' | 'merge' | 'upgrade' | 'done'
const STEP_ORDER: TutorialStep[] = ['aim', 'pickup', 'merge', 'upgrade', 'done']
export const TUTORIAL_STEP_COUNT = STEP_ORDER.length - 1

/** Inside the `elemental-barrage_state` blob, beside the state layer's `eb_*` keys. */
const TUTORIAL_KEY = EB_TUTORIAL_STEP_KEY

const savedIndex = (): number => Math.floor(Number(getState(TUTORIAL_KEY, 0))) || 0
const stepAt = (i: number): TutorialStep => STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, i))]!
const indexOf = (s: TutorialStep): number => STEP_ORDER.indexOf(s)

export const tutorialStep = ref<TutorialStep>(stepAt(savedIndex()))
export const tutorialActive = computed(() => tutorialStep.value !== 'done')

// The FTUE never holds the simulation. MIW's coach-marks froze a real-time
// battle so a first-timer couldn't lose while reading; Barrage is turn-based —
// nothing marches until the player fires — and every beat here IS a shot, so
// a held board would freeze the very volley being taught.

/** 1-based index of the current beat for the progress pips. */
export const tutorialStepIndex = computed(() =>
  Math.min(TUTORIAL_STEP_COUNT, indexOf(tutorialStep.value) + 1))

/** What the coach overlay is acting out right now — written only by
 *  `TutorialOverlay`; a target may read it to animate in step with the hand. */
export type TutorialPreview = 'aim' | 'press'
export const tutorialPreview = ref<TutorialPreview | null>(null)

const advanceTo = (step: TutorialStep): void => {
  if (indexOf(step) <= indexOf(tutorialStep.value)) return
  tutorialStep.value = step
  setState(TUTORIAL_KEY, indexOf(step))
  if (step === 'done') flushPersist() // graduation is real progress
}

/** Barrage FTUE signals. */
export type BarrageTutorialEvent =
  | { kind: 'fired' }
  | { kind: 'ballPickup' }
  | { kind: 'merge' }
  | { kind: 'upgrade' }
  | { kind: 'skip' }

export const notifyTutorial = (event: BarrageTutorialEvent): void => {
  if (!tutorialActive.value) return
  const step = tutorialStep.value
  switch (event.kind) {
    case 'fired':
      if (step === 'aim') advanceTo('pickup')
      break
    case 'ballPickup':
      if (step === 'aim' || step === 'pickup') advanceTo('merge')
      break
    case 'merge':
      advanceTo('upgrade')
      break
    case 'upgrade':
      if (step === 'upgrade') advanceTo('done')
      break
    case 'skip':
      advanceTo('done')
      break
  }
}

// Cloud / local hydration lands after module init: only ever move FORWARD —
// a hydrated veteran must lose a stale overlay, but a mid-session hydrate must
// never yank a player back into an earlier beat.
const rehydrate = (): void => {
  const fresh = stepAt(savedIndex())
  if (indexOf(fresh) > indexOf(tutorialStep.value)) tutorialStep.value = fresh
}
watch(saveDataVersion, rehydrate)
watch(prismState, rehydrate, { deep: false })

export interface TutorialWiring {
  /** Best row ever reached — the veteran signal. */
  bestRow: Ref<number>
  /** Subscribe to engine events across engine swaps (`useBarrage().onEngineEvent`). */
  onEngineEvent(cb: EngineListener): () => void
  /** Something upgrade-shaped the hand could press right now (free offer or a glowing chip). */
  upgradeTarget: Ref<boolean>
  /** The FTUE's free Tray Capacity is still on offer, and how to grant it. */
  freeOffer?: Ref<boolean>
  claimFree?: () => void
}

/** Run 7: aim phases after the FTUE has handed over before an unclaimed free
 *  Tray Capacity is granted on its own (its socket drops into the tray) — a
 *  tester who never claimed it ended the session with every upgrade at 0. */
export const FREE_GRANT_AIMS = 2

/**
 * Wire the FTUE to the live run. Returns the teardown. GameScene calls it on
 * mount — after the state layer exists, which is why it is not done at import.
 */
export const installBarrageTutorial = (w: TutorialWiring): (() => void) => {
  const offs: (() => void)[] = []

  // Veteran skip: only a player who never STARTED the beats counts — a
  // first-timer passes row 1 on their very first shot, which already moved
  // the step past 'aim'.
  const checkVeteran = (): void => {
    if (tutorialStep.value === 'aim' && savedIndex() === 0 && w.bestRow.value > 1) advanceTo('done')
  }
  checkVeteran()
  offs.push(watch(w.bestRow, checkVeteran))

  // A player who keeps shooting past the upgrade beat has chosen to: two
  // ignored volleys and it graduates (the FREE chip keeps glowing on its own),
  // instead of dimming the board at every aim for the rest of the session.
  let volleysInUpgrade = 0
  let aimsSinceHandover = 0
  offs.push(w.onEngineEvent((e) => {
    // The free Tray Capacity nobody took: granted FREE_GRANT_AIMS aims after
    // the FTUE handed over (BallTray drops the new socket in).
    if (e.type === 'phase' && e.phase === 'aim' && tutorialStep.value === 'done' && w.freeOffer?.value) {
      if (++aimsSinceHandover >= FREE_GRANT_AIMS) w.claimFree?.()
    }
    if (!tutorialActive.value) return
    if (e.type === 'fire' && tutorialStep.value === 'upgrade' && ++volleysInUpgrade >= 2) {
      notifyTutorial({ kind: 'skip' })
      return
    }
    if (e.type === 'fire') notifyTutorial({ kind: 'fired' })
    else if (e.type === 'pickup' && e.kind === 'ball') notifyTutorial({ kind: 'ballPickup' })
    else if (e.type === 'trayMerge') notifyTutorial({ kind: 'merge' })
  }))

  // The upgrade beat needs something to press. With nothing on offer (the state
  // layer gave no free chip and nothing is affordable) it graduates instead of
  // pointing at a dead chip.
  let idleTimer = 0
  offs.push(watch([tutorialStep, w.upgradeTarget], ([step, target]) => {
    window.clearTimeout(idleTimer)
    if (step === 'upgrade' && !target) {
      idleTimer = window.setTimeout(() => {
        if (tutorialStep.value === 'upgrade' && !w.upgradeTarget.value) advanceTo('done')
      }, 1500)
    }
  }, { immediate: true }))
  offs.push(() => window.clearTimeout(idleTimer))

  return () => { for (const off of offs) off() }
}

// ⚠️ DEV-ONLY: skip the FTUE for promo capture (window.__skipTut()).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__skipTut = (): void => { advanceTo('done') }
}
