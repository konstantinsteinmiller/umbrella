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
//
// The lifecycle half rides a NARROWER signal than the pause:
// `isGameplayInterruptingModalOpen` omits modals that opt out via
// `acquireModalOpen({ firesGameplayLifecycle: false })` — today just the
// welcome-back claim, which opens seconds into a returning player's boot and
// would otherwise emit a pointless gameplayStop/gameplayStart pair right behind
// the launch one. Those modals still freeze the sim.
import { watch } from 'vue'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { isAnyModalOpen, isGameplayInterruptingModalOpen } from '@/use/useModalState'
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
      if (!releasePause) releasePause = acquireAppPause()
    } else {
      releasePause?.()
      releasePause = null
    }
  })
  if (!isCrazyGamesFullRelease) return
  // Ordering mirrors the pause above: stop CG gameplay as the menu goes up, and
  // only report "back in play" once the sim has actually been released.
  watch(isGameplayInterruptingModalOpen, (open) => {
    if (open) stopGameplay()
    else startGameplay()
  }, { flush: 'post' })
}

/** Test-only: is the gate currently holding its app-pause slot? */
export const __isModalPauseHeld = (): boolean => releasePause !== null
