// Bridge the "a blocking modal is open" signal (`useModalState`) to the
// universal pause gate on EVERY build, and to the CrazyGames gameplay
// lifecycle on the CG full release.
//
// Opening Achievements / Battle Pass / Unit Codex / Options / Daily / Missions /
// Skins / Welcome-Back pulls the player out of active play, so on the FIRST
// modal open we take an app-pause (`acquireAppPause` → `isGamePaused`) and on
// the LAST modal close we release it. That single flag freezes:
//
//   • `useBattle`'s RAF driver     — waves, fighters, projectiles, spells
//   • `usePrismGame`'s engine tick — the automation imp's merges / deploys
//   • `FlyingChest`                — no chest launches behind a menu
//   • `useMidgameAdTimer`          — its clock only advances on real play
//                                    time, so no interstitial can open on
//                                    top of an already-open modal
//
// Audio deliberately keeps playing: the mute lives on the sibling
// `isAudioPaused` gate (ads / tab-hide / platform pause), so menus keep their
// background music and the modal-open SFX cue plays to completion. See the
// header of `useGamePause.ts`.
//
// On the CrazyGames FULL release we additionally fire `gameplayStop()` on open
// and `gameplayStart()` on close — CG certification wants those events whenever
// the player leaves / re-enters active play, and the pause above is what makes
// that signal truthful. Those two calls are the ONLY CG-scoped part; the pause
// itself is universal so behaviour is identical across portals and verifiable
// on the dev server.
import { watch } from 'vue'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { isAnyModalOpen } from '@/use/useModalState'
import { acquireAppPause } from '@/use/useGamePause'
import { startGameplay, stopGameplay } from '@/use/useCrazyGames'

let installed = false
let releasePause: (() => void) | null = null

/**
 * Install the modal → pause (+ CG gameplay-lifecycle) bridge. Idempotent.
 * Call once at app boot (App.vue setup).
 */
export const installModalGameplayGate = (): void => {
  if (installed) return
  installed = true
  watch(isAnyModalOpen, (open) => {
    if (open) {
      // Menu up → CG: gameplay interrupted; game: freeze the sim.
      if (isCrazyGamesFullRelease) stopGameplay()
      if (!releasePause) releasePause = acquireAppPause()
    } else {
      // Last menu closed → resume the sim first, then CG: back in play.
      releasePause?.()
      releasePause = null
      if (isCrazyGamesFullRelease) startGameplay()
    }
  })
}

/** Test-only: is the gate currently holding its app-pause slot? */
export const __isModalPauseHeld = (): boolean => releasePause !== null
