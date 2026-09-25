// ─── The run-break input of the gameplay bracket ────────────────────────────
//
// Portals want `gameplayStop()` when the player loses (CG certification asks
// for it on every break in active play; Poki / Yandex list "game over" by
// name). This module is how the run tells the bracket (`usePortalGameplay`):
//
//   • the endless run BREACHES / a daily run ends → `stopGameplayForWaveBreak`
//     — the breach / result screen is up, nobody is playing;
//   • the player is back in a run → `resumeGameplayAfterWaveBreak` — a
//     checkpoint restart, a Meteor / revive continue, a daily start / exit, or
//     the next shot.
//
// It only sets one input. The bracket owns every SDK call, so a resume cannot
// report the player back while a menu or an ad still holds gameplay stopped,
// and a stop landing on an already-stopped bracket emits nothing: the watcher
// only fires on a change. Both calls are idempotent.
//
// (The name is historical — the predecessor game broke between waves, and it
// was CrazyGames-only. It now feeds every portal's bracket.)

import { setRunBreak } from '@/use/usePortalGameplay'

let stoppedForWaveBreak = false

/** Run lost → the bracket closes (every portal that has one). Idempotent. */
export const stopGameplayForWaveBreak = (): void => {
  if (stoppedForWaveBreak) return
  stoppedForWaveBreak = true
  setRunBreak(true)
}

/** Back in a run → the break no longer holds the bracket closed. Anything else
 *  that does (a menu, an ad, a hidden tab) keeps it closed until it releases.
 *  Called on every shot, so it is a cheap no-op outside a break. */
export const resumeGameplayAfterWaveBreak = (): void => {
  if (!stoppedForWaveBreak) return
  stoppedForWaveBreak = false
  setRunBreak(false)
}

/** Test-only: is a run-break hold currently outstanding? */
export const __isStoppedForWaveBreak = (): boolean => stoppedForWaveBreak
