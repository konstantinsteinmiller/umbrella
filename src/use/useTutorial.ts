/**
 * useTutorial — the guided first-session FTUE (retention-roadmap #1).
 *
 * Four coach-mark steps driven by the REAL game events (no scripted fake
 * state): spawn two sparks → merge them → deploy the fighter → field-merge
 * a same-tier unit onto it. `usePrismGame` / `useBattle` call
 * `notifyTutorial()` at the authoritative mutation points; the spotlight
 * overlay (`TutorialOverlay.vue`) just renders `tutorialStep`.
 *
 * While the tutorial runs the Spawn button is 1-tap (the 4-tap meter is NOT
 * self-explanatory without a nudge — the meter friction starts after the
 * player has internalised the loop).
 *
 * Progress persists as a step index in the state blob
 * (`prism_tutorial_step`); veterans (best wave > 1 from a previous session)
 * skip the whole thing.
 *
 * This module must stay leaf-level (only keys + state imports) — it is
 * imported by both `usePrismGame` and `useBattle`.
 */
import { ref, computed, watch } from 'vue'
import { getState, setState, flushPersist, prismState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { PRISM_TUTORIAL_KEY, BATTLE_BEST_WAVE_KEY } from '@/keys'

export type TutorialStep = 'spawn' | 'merge' | 'deploy' | 'fieldMerge' | 'done'
const STEP_ORDER: TutorialStep[] = ['spawn', 'merge', 'deploy', 'fieldMerge', 'done']
export const TUTORIAL_STEP_COUNT = STEP_ORDER.length - 1

/** Sparks the player must spawn before the merge step makes sense. */
const SPAWNS_NEEDED = 2

const readStep = (): TutorialStep => {
  // Veterans skip entirely — they've already fought past wave 1.
  const bestWave = Math.floor(Number(getState(BATTLE_BEST_WAVE_KEY, 1))) || 1
  const saved = Math.floor(Number(getState(PRISM_TUTORIAL_KEY, 0))) || 0
  if (bestWave > 1 && saved < STEP_ORDER.length - 1) return 'done'
  return STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, saved))]!
}

export const tutorialStep = ref<TutorialStep>(readStep())

/** Write the current step index into the blob when it differs from what is
 *  stored. Load-bearing for the VETERAN SKIP: `readStep` resolves to 'done'
 *  from `battle_best_wave` alone, which used to leave `prism_tutorial_step`
 *  absent from `merge-idle-war_state` (and therefore the cloud mirror) — so
 *  any boot that read the blob before hydration, or hydrated an older cloud
 *  snapshot, restarted the coach-marks. Persisting the resolved 'done' makes
 *  completion durable everywhere the blob travels. */
const persistResolvedStep = (): void => {
  const idx = STEP_ORDER.indexOf(tutorialStep.value)
  const saved = Math.floor(Number(getState(PRISM_TUTORIAL_KEY, 0))) || 0
  if (saved !== idx) setState(PRISM_TUTORIAL_KEY, idx)
}
if (tutorialStep.value === 'done') persistResolvedStep()

// Re-derive when the save subsystem swaps the blob under us (cloud/local
// hydration lands AFTER module init). Only ever move FORWARD — a veteran's
// hydrated progress must dismiss a stale overlay, but hydration must never
// yank a player back into an earlier step mid-session. The resolved step is
// re-persisted so a hydrated older snapshot (missing the field) gets the
// completion written back and pushed to the cloud on the next flush.
const rehydrate = (): void => {
  const fresh = readStep()
  if (STEP_ORDER.indexOf(fresh) > STEP_ORDER.indexOf(tutorialStep.value)) {
    tutorialStep.value = fresh
  }
  if (tutorialStep.value === 'done') persistResolvedStep()
}
watch(saveDataVersion, rehydrate)
watch(prismState, rehydrate, { deep: false })
export const tutorialActive = computed(() => tutorialStep.value !== 'done')
/** 1-based index of the current step for the "1/4" progress label. */
export const tutorialStepIndex = computed(() =>
  Math.min(TUTORIAL_STEP_COUNT, STEP_ORDER.indexOf(tutorialStep.value) + 1))
/** One-tap spawns for the whole onboarding session. */
export const isTutorialOneTap = computed(() => tutorialActive.value)

let spawnsSeen = 0

const advanceTo = (step: TutorialStep): void => {
  tutorialStep.value = step
  setState(PRISM_TUTORIAL_KEY, STEP_ORDER.indexOf(step))
  if (step === 'done') flushPersist() // graduation is real progress
}

export type TutorialEvent = 'spawn' | 'merge' | 'deploy' | 'fieldMerge'

/** Called from the authoritative game mutations. Off-step events are ignored
 *  (e.g. extra merges while building the field-merge unit). */
export const notifyTutorial = (event: TutorialEvent): void => {
  if (!tutorialActive.value) return
  const step = tutorialStep.value
  if (step === 'spawn' && event === 'spawn') {
    spawnsSeen += 1
    if (spawnsSeen >= SPAWNS_NEEDED) advanceTo('merge')
  } else if (step === 'merge' && event === 'merge') {
    advanceTo('deploy')
  } else if (step === 'deploy' && event === 'deploy') {
    advanceTo('fieldMerge')
  } else if (step === 'fieldMerge' && event === 'fieldMerge') {
    advanceTo('done')
  }
}
