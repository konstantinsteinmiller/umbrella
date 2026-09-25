// Bridge the "a blocking modal is open" signal (`useModalState`) to the
// universal pause gate on EVERY build.
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
// The portals' gameplayStop / gameplayStart around menus used to be fired here
// too (CrazyGames only). They now come from the one gameplay bracket
// (`usePortalGameplay`), which reads the same NARROW modal signal —
// `isGameplayInterruptingModalOpen` — for every portal, so no menu can emit a
// second pair beside it. The pause above is what makes those events truthful.
import { watch } from 'vue'
import { isAnyModalOpen } from '@/use/useModalState'
import { acquireAppPause } from '@/use/useGamePause'

let installed = false
let releasePause: (() => void) | null = null

/**
 * Install the modal → pause bridge. Idempotent. Call once at app boot
 * (App.vue setup).
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
}

/** Test-only: is the gate currently holding its app-pause slot? */
export const __isModalPauseHeld = (): boolean => releasePause !== null
