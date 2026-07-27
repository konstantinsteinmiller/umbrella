import { ref, computed } from 'vue'

// ─── UI modal-open signal ────────────────────────────────────────────────────
//
// Tracks how many blocking FModal dialogs (Upgrades, Options, Daily, Battle
// Pass, Achievements, Unit Codex, …) are currently open. Its consumer is
// `useModalGameplayGate`, which translates the signal into an app-pause on the
// universal gate (so the battle sim + merge automation freeze behind the menu)
// and, on the CrazyGames full release, into `gameplayStop()` / `gameplayStart()`.
//
// Intentionally SIDE-EFFECT-FREE *here*: this module is a pure refcounted
// signal, no pausing and no audio calls of its own — the gate module owns those
// so there is exactly one place that decides what "a menu is open" means.
// Note that a modal does NOT mute audio: the mute gate (`isAudioPaused`) omits
// the modal source on purpose, so menus keep their music and the modal-open cue
// isn't cut off. See the header of `useGamePause.ts`.
//
// Refcounted so overlapping / stacked modals compose: gameplay only resumes
// once the LAST modal closes. `acquireModalOpen()` returns a release function
// the caller (FModal) invokes on close / unmount.

const openCount = ref(0)

/** True while at least one blocking modal is open. */
export const isAnyModalOpen = computed(() => openCount.value > 0)

/** Mark a modal as open. Returns a release fn — call once on close/unmount.
 *  Idempotent release so wrapping in cleanup hooks is safe. */
export const acquireModalOpen = (): (() => void) => {
  openCount.value += 1
  let released = false
  return (): void => {
    if (released) return
    released = true
    openCount.value = Math.max(0, openCount.value - 1)
  }
}
