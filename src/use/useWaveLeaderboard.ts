import { computed, watch, type ComputedRef } from 'vue'
import { bestWave, wavePhase } from '@/use/useBattle'
import { maxTier } from '@/use/usePrismGame'
import { onGameSuspended } from '@/use/useGamePause'
import { crazyPlayerName } from '@/use/useCrazyGames'
import { leaderboardEnabled, reportRun } from '@/use/useLeaderboard'
import { setSdkNameSource } from '@/use/usePlayerIdentity'

/**
 * ─── Merge Legion ⇄ the global board ────────────────────────────────────────
 *
 * The game-side half of the leaderboard: WHICH number is ranked, and WHEN it is
 * reported. `useLeaderboard` knows nothing about waves; this file knows nothing
 * about HTTP.
 *
 * An endless idle battler has no result screen and no run that ends, so the
 * reference game's "call `reportRun` at the end of every run" becomes three
 * edges instead:
 *
 *   • a NEW BEST WAVE      → report (throttled inside `reportRun` to one write
 *                            per 3 min; every post carries the current best, so
 *                            a skipped one loses nothing)
 *   • an OVERRUN, or the   → report with `force` — the nearest thing this game
 *     game going away        has to a run's end, so the best a player stopped on
 *                            is the one the board gets even if the throttle had
 *                            been holding it
 *   • BOOT                 → report once, so a best the last session's throttle
 *                            held back lands now, and the badge has a board
 *
 * All three are no-ops when nothing changed: `reportRun` only writes on a best
 * above the one the server already confirmed, and only reads once per session.
 */

/**
 * The number the board ranks: the best wave, but only once at least one wave
 * has been cleared (`bestWave` starts at 1 for a player who has cleared none).
 *
 * `0` means "not on the board yet" — `rankFor(0)` is 0, the badge hides, and
 * nothing is posted. Without the floor every player who opened the game for a
 * second would be posted as a wave-1 row and greeted, mid-tutorial, with a rank
 * near the bottom of the board.
 */
export const rankedBest: ComputedRef<number> = computed(() =>
  bestWave.value >= 2 ? bestWave.value : 0)

let installed = false

/**
 * Wire the three reporting edges. Idempotent; called from the arena's mount,
 * which runs after the save hydrate (so `bestWave` is already the player's).
 * A cloud hydrate that lands later still reaches the board: it raises
 * `bestWave`, and the watcher reports it.
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
    void reportRun(best, maxTier.value, { force })
  }

  report(false)
  watch(rankedBest, () => report(false))
  watch(wavePhase, (phase) => { if (phase === 'overrun') report(true) })
  onGameSuspended(() => report(true))
}
