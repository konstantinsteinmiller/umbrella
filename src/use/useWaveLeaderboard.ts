import { computed, watch, type ComputedRef } from 'vue'
import { bestRow, maxBallTier, runEndSeq } from '@/barrage/state/progress'
import { onGameSuspended } from '@/use/useGamePause'
import { crazyPlayerName } from '@/use/useCrazyGames'
import { leaderboardAllowed, leaderboardEnabled, reportRun } from '@/use/useLeaderboard'
import { setSdkNameSource } from '@/use/usePlayerIdentity'

/**
 * ─── Umbrella ⇄ the global board ───────────────────────────────────
 *
 * The game-side half of the leaderboard: WHICH number is ranked, and WHEN it is
 * reported. `useLeaderboard` knows nothing about rows; this file knows nothing
 * about HTTP. (The file keeps its historical name so the build wiring that
 * imports it does not have to move.)
 *
 * The ranked number is the deepest ENDLESS row (daily boards are their own
 * thing); the flair / tie-break is the highest ball tier ever made. A run has a
 * clear end (the breach), but a player can also just walk away mid-run, so the
 * reference game's "call `reportRun` at the end of every run" becomes three
 * edges:
 *
 *   • a NEW BEST ROW       → report (throttled inside `reportRun` to one write
 *                            per 3 min; every post carries the current best, so
 *                            a skipped one loses nothing)
 *   • a RUN ENDS (breach,  → report with `force` — the best a player stopped on
 *     daily over), or the    is the one the board gets even if the throttle had
 *     game going away        been holding it
 *   • BOOT                 → report once, so a best the last session's throttle
 *                            held back lands now, and the badge has a board
 *
 * All three are no-ops when nothing changed: `reportRun` only writes on a best
 * above the one the server already confirmed, and only reads once per session.
 */

/**
 * The number the board ranks: the best row, but only once the player has
 * survived a turn (`bestRow` is 1 the moment the first row spawns).
 *
 * `0` means "not on the board yet" — `rankFor(0)` is 0, the badge hides, and
 * nothing is posted. Without the floor every player who opened the game for a
 * second would be posted as a row-1 entry and greeted, mid-tutorial, with a
 * rank near the bottom of the board.
 */
export const rankedBest: ComputedRef<number> = computed(() =>
  bestRow.value >= 2 ? bestRow.value : 0)

let installed = false

/**
 * Wire the three reporting edges. Idempotent; call from the game scene's mount,
 * which runs after the save hydrate (so `bestRow` is already the player's). A
 * cloud hydrate that lands later still reaches the board: it raises `bestRow`,
 * and the watcher reports it.
 */
export const installWaveLeaderboard = (): void => {
  if (installed || !leaderboardEnabled) return
  installed = true

  // CrazyGames is the one portal here that hands over a username. Injected
  // rather than imported inside `usePlayerIdentity` — see `setSdkNameSource`.
  // On every other build `@/use/useCrazyGames` is aliased to a stub whose ref
  // stays null, so tier 2 is simply skipped and the generated name is used.
  setSdkNameSource(() => crazyPlayerName.value)

  const report = (force: boolean): void => {
    const best = rankedBest.value
    if (best <= 0) return
    // Never awaited: the board is a decoration, and a captive-portal wifi page
    // must not hold anything in the game hostage for the 6 s timeout.
    void reportRun(best, maxBallTier.value, { force })
  }

  report(false)
  watch(rankedBest, () => report(false))
  watch(runEndSeq, () => report(true))
  onGameSuspended(() => report(true))
  // A guest who signs in mid-session (CG's prompt lives in the portal chrome,
  // no reload) gets their current best on the board right away. `reportRun`
  // itself drops every report while the gate is closed.
  watch(leaderboardAllowed, (ok) => { if (ok) report(true) })
}

/** Barrage-named alias — same install. */
export const installBarrageLeaderboard = installWaveLeaderboard
