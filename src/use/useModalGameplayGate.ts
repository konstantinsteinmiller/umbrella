// CrazyGames FULL-release only: bridge the "a blocking modal is open" signal
// (`useModalState`) to the CG gameplay lifecycle AND the universal pause gate.
//
// CG's full-release certification wants `gameplayStop()` whenever the player is
// pulled out of active play (a menu / modal), and `gameplayStart()` when they
// return — and for that signal to be truthful the game must actually halt
// behind the menu. So on the FIRST modal open we take an app-pause
// (`acquireAppPause` → `isGamePaused` → render loop early-returns + the audio
// orchestrator suspends bg-music and every one-shot SFX) and fire
// `stopGameplay()`; on the LAST modal close we release the pause (audio + sim
// resume where they left off — a suspend, not a restart) and fire
// `startGameplay()`.
//
// Scope is deliberate: this does NOTHING on the CG basic launch or any other
// platform (`installModalGameplayGate` early-returns), so the basic launch is
// never gameplay-stopped and menus there don't mute the game — matching the
// product decision to only hard-gate the full release.
import { watch } from 'vue'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { isAnyModalOpen } from '@/use/useModalState'
import { acquireAppPause } from '@/use/useGamePause'
import { startGameplay, stopGameplay } from '@/use/useCrazyGames'

let installed = false
let releasePause: (() => void) | null = null

/**
 * Install the modal → gameplay-lifecycle + pause bridge. Idempotent, and a
 * no-op on every build except the CrazyGames full release. Call once at app
 * boot (App.vue setup).
 */
export const installModalGameplayGate = (): void => {
  if (installed || !isCrazyGamesFullRelease) return
  installed = true
  watch(isAnyModalOpen, (open) => {
    if (open) {
      // Menu up → CG: gameplay interrupted; game: freeze sim + suspend audio.
      stopGameplay()
      if (!releasePause) releasePause = acquireAppPause()
    } else {
      // Last menu closed → resume sim + audio first, then CG: back in play.
      releasePause?.()
      releasePause = null
      startGameplay()
    }
  })
}
