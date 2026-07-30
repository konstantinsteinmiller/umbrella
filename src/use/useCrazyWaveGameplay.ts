// ─── CrazyGames gameplay lifecycle around the wave break ────────────────────
//
// CG certification wants `gameplayStop()` / `gameplayStart()` whenever the
// player leaves and re-enters active play. `useModalGameplayGate` covers menus;
// this covers the battle's own breaks:
//
//   • a wave is CLEARED — the field empties, the "wave cleared" banner shows
//     and the next wave hasn't spawned yet, and
//   • the player LOSES (overrun) — the gate falls, the run pauses on the
//     OVERRUN overlay / RALLY! offer.
//
// Both resume on the next `waveStart`, i.e. once the new wave has actually
// begun — not on the countdown, which is still part of the break.
//
// **Only the stop WE issued gets resumed.** `stoppedForWaveBreak` is the "was
// it paused before" guard: without it a `waveStart` could report the player
// back into a match while gameplay is legitimately stopped for something else.
// In practice that can't happen — an open modal or an on-screen ad freezes the
// sim via `isGamePaused`, so no wave can start underneath either — but the two
// checks in `resume()` make the intent explicit and cost nothing. Both of those
// owners issue their own `startGameplay()` when they release, so skipping ours
// never strands CG in a stopped state.
//
// CrazyGames FULL RELEASE only; every entry point is a no-op elsewhere, and the
// wrappers in `useCrazyGames` are idempotent on top of that.

import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { isGameplayInterruptingModalOpen } from '@/use/useModalState'
import { isAdShowing } from '@/use/useGamePause'
import { startGameplay, stopGameplay } from '@/use/useCrazyGames'

let stoppedForWaveBreak = false

/** Wave cleared / run lost → tell CG active gameplay has paused. Idempotent:
 *  an overrun landing on an already-stopped break doesn't stack a second stop. */
export const stopGameplayForWaveBreak = (): void => {
  if (!isCrazyGamesFullRelease || stoppedForWaveBreak) return
  stoppedForWaveBreak = true
  stopGameplay()
}

/** The new wave has begun → resume, but ONLY if this module is what stopped
 *  gameplay in the first place. The flag clears either way, so the next wave
 *  break can take a fresh hold. */
export const resumeGameplayAfterWaveBreak = (): void => {
  if (!isCrazyGamesFullRelease || !stoppedForWaveBreak) return
  stoppedForWaveBreak = false
  // Someone with a stronger claim owns the stopped state — let them restart it
  // when they release, rather than declaring the player back in a match here.
  if (isGameplayInterruptingModalOpen.value || isAdShowing.value) return
  startGameplay()
}

/** Test-only: is a wave-break hold currently outstanding? */
export const __isStoppedForWaveBreak = (): boolean => stoppedForWaveBreak
