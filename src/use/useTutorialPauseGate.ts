// Bridge the first-session tutorial to the universal pause gate.
//
// The coach-marks are self-paced: a first-timer reads "tap to spawn", finds the
// button, spawns, reads the next bubble… Meanwhile the battle clock kept
// running. Wave 1 spawned into an empty guard line, walked to the gate and
// chewed it down — players could be OVERRUN before they had ever deployed a
// fighter, i.e. lose the run while still being taught how to play.
//
// So while `tutorialHoldsBattle` is true (steps: spawn → merge → deploy) we
// hold an app-pause, which freezes exactly the things that could kill the
// player behind the overlay:
//
//   • `useBattle`'s RAF driver     — the countdown, wave spawns, enemy walk,
//                                    gate damage, the overrun transition
//   • `usePrismGame`'s engine tick — the automation imp
//   • `FlyingChest`                — no chest flying behind a coach-mark
//
// Everything the tutorial actually asks for is pointer-driven, not clock-driven
// (tap Spawn, drag to merge, drag into the arena), so the hold blocks the danger
// without blocking a single tutorial step. It releases the moment the player
// drops their first fighter in the arena — `deployFighter` → `notifyTutorial`
// advances the step to 'fieldMerge', which flips the flag — so the last step is
// learned against a live wave, with a defender already standing.
//
// **No CrazyGames gameplayStop/Start here**, unlike `useModalGameplayGate`. A
// menu takes the player OUT of play; the tutorial IS play — they are tapping,
// merging and dragging the whole time. Only the battle sim is held, so
// reporting a gameplayStop right behind the launch gameplayStart would be a
// false negative (and would bracket the entire FTUE as "not playing").
//
// Audio deliberately keeps running: the mute lives on the sibling
// `isAudioPaused` gate (ads / tab-hide / platform pause), so the music plays
// through the tutorial exactly as it does behind a menu. See the header of
// `useGamePause.ts`.
import { watch } from 'vue'
import { tutorialHoldsBattle } from '@/use/useTutorial'
import { acquireAppPause } from '@/use/useGamePause'

let installed = false
let releasePause: (() => void) | null = null

/**
 * Install the tutorial → pause bridge. Idempotent. Call once at app boot
 * (App.vue setup).
 *
 * `immediate: true` is load-bearing: a brand-new player is ALREADY on step
 * 'spawn' when this runs, so a lazy watcher would never take the hold at all —
 * the flag's first transition would be the release. Booting a veteran costs
 * nothing: their step resolves to 'done' (or hydration moves it there moments
 * later) and the watcher releases the hold.
 */
export const installTutorialPauseGate = (): void => {
  if (installed) return
  installed = true
  watch(tutorialHoldsBattle, (hold) => {
    if (hold) {
      if (!releasePause) releasePause = acquireAppPause()
    } else {
      releasePause?.()
      releasePause = null
    }
  }, { immediate: true })
}

/** Test-only: is the gate currently holding its app-pause slot? */
export const __isTutorialPauseHeld = (): boolean => releasePause !== null
