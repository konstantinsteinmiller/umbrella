// ─── Time-paced midgame interstitial ────────────────────────────────────────
//
// One recurring interstitial every 150-180 s of ACTIVE play, on every build
// except CrazyGames. It opens at exactly one moment: the **3…2…1 countdown to
// the next wave**, and only if the cadence clock is already due.
//
// ─── What was here before, and why this is not that ────────────────────────
//
// `useMidgameAdTimer.ts` shipped a 121 s clock but fired the ad THE FRAME THE
// INTERVAL ELAPSED — mid-combat, on top of a live wave, whatever the player was
// doing. It was deleted wholesale in the "full release changes" commit, and
// rightly: an interstitial that lands between a spawn and a merge is the
// placement players (and portal reviewers) punish hardest.
//
// The clock is worth keeping. The trigger is not. So the interval survives and
// the firing moment is a break the game already takes — and the countdown is
// the best one it has: the field is empty, the previous wave's reward banner
// has already been read (the 'cleared' phase runs 1.6 s before the countdown
// starts), the next wave has not spawned, and nothing is animating that an
// overlay would interrupt. The sim freezes for the ad's whole lifetime
// (`isAdShowing` → `isGamePaused`), so the countdown simply holds at 3 and
// resumes when the ad closes.
//
// ─── The gap is ACTIVE-PLAY seconds, deliberately ──────────────────────────
//
// `tickBreakInterstitial` is driven from the battle RAF loop AFTER its
// `isGamePaused` gate, so the clock only advances while the player is really
// playing — never under an ad, behind a modal, during the tutorial hold, or on
// a hidden tab. Two consequences, both wanted:
//
//   • The cadence is honest. A player who alt-tabs for ten minutes comes back
//     to the same amount of remaining play time, not to an instant ad.
//   • It can never undercut a portal's own guard. Playgama is configured with
//     `minimumDelayBetweenInterstitial: 120` (wall-clock) in
//     `playgama-bridge-config.json`; 150 s of active play is by definition
//     ≥ 150 s of wall clock, so our request always lands outside the Bridge's
//     window and can never be silently swallowed as "too soon".
//
// A due-but-unfillable ad does NOT reset the clock — `elapsed` stays past the
// threshold so the next countdown retries, instead of charging the player a
// fresh interval for the SDK's no-fill.

import { adProviderName, isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { isAdShowing } from '@/use/useGamePause'
import { isDebug } from '@/use/useMatch'
import { markInterstitialShown } from '@/use/adTiming'

/** Seconds of active play before the FIRST interstitial of a session. */
export const BREAK_AD_FIRST_GAP_S = 150
/** Bounds of every gap after the first — re-rolled per ad so the cadence is
 *  not a metronome the player can set their watch by. */
export const BREAK_AD_MIN_GAP_S = 150
export const BREAK_AD_MAX_GAP_S = 180

/**
 * Which builds run the cadence: **every build except CrazyGames.**
 *
 * CG is excluded because its full release is graded on an uninterrupted core
 * loop and it already carries its own midgame placements through the SDK; the
 * recurring break is a per-portal monetization decision and CG's answer is no.
 *
 * An `import.meta.env` literal, not the `isCrazyWeb` re-export from `useUser`:
 * Vite folds the literal at parse time, so the CG build tree-shakes this whole
 * module down to inert stubs.
 */
const BREAK_ADS_ENABLED = import.meta.env.VITE_APP_CRAZY_WEB !== 'true'

let elapsed = 0
/** The gap this interval owes. The first is fixed at `BREAK_AD_FIRST_GAP_S`;
 *  every later one is re-rolled in [MIN, MAX] when an ad actually plays. */
let gap = BREAK_AD_FIRST_GAP_S
let firing = false
let dueLogged = false

const log = (...args: unknown[]): void => {
  if (isDebug.value) console.info('[ads/break]', ...args)
}

const rollGap = (): number =>
  BREAK_AD_MIN_GAP_S + Math.random() * (BREAK_AD_MAX_GAP_S - BREAK_AD_MIN_GAP_S)

/**
 * Advance the cadence clock by `dt` seconds of ACTIVE gameplay. Call once per
 * stepped frame from the battle loop, PAST the pause gate.
 */
export const tickBreakInterstitial = (dt: number): void => {
  if (!BREAK_ADS_ENABLED || firing) return
  elapsed += dt
}

/**
 * Is an interstitial owed AND actually servable right now?
 *
 * Both halves matter. `elapsed` alone would have us hold the countdown for an
 * ad that then no-fills; `isInterstitialReady` alone would fire on every single
 * wave. Reads only refs, so callers can branch on it synchronously.
 */
export const isBreakAdDue = (): boolean => {
  if (!BREAK_ADS_ENABLED || firing) return false
  if (elapsed < gap) return false
  if (isAdShowing.value) return false
  if (!isInterstitialReady.value) {
    // One line per due-window, not per frame: QA needs to see that the clock
    // IS running and the provider simply has nothing to show (the `noop`
    // provider in plain dev, or a real no-fill).
    if (!dueLogged) {
      dueLogged = true
      log(`due (${gap.toFixed(0)}s of play) — no interstitial ready (provider=${adProviderName}); waiting for the next countdown`)
    }
    return false
  }
  return true
}

/** Shared runner: owns the `firing` latch, the clock reset and the next gap
 *  roll. `showMidgameAd` never rejects (it swallows backend errors and always
 *  drops the pause/audio gate in a `finally`), but the latch is released in a
 *  `finally` anyway so a future change there can't wedge the scheduler for the
 *  session. */
const runBreakAd = async (reason: string): Promise<void> => {
  firing = true
  elapsed = 0
  gap = rollGap()
  // Start the shared wall clock too, so the restart placement owes the full
  // gap from here instead of requesting inside the SDK's rate-limit window.
  markInterstitialShown()
  dueLogged = false
  log(`▶ ${reason} interstitial (provider=${adProviderName}); next in ${gap.toFixed(0)}s of play`)
  try {
    await showMidgameAd()
  } finally {
    firing = false
    log(`⏹ ${reason} interstitial done`)
  }
}

/**
 * The 3…2…1 countdown to the next wave has started — play the interstitial if
 * one is owed. THE ONLY TRIGGER: nothing else in the game opens an
 * interstitial, so an ad can never land on a result screen, mid-combat, or over
 * a celebration.
 *
 * Deliberately fire-and-forget: the caller is the synchronous battle step and
 * must not be held up. `showMidgameAd` flips `isAdShowing` inside this same
 * call stack, which freezes the sim before the next frame — so the countdown
 * holds where it is and resumes after the ad closes.
 */
export const playCountdownInterstitial = (): void => {
  if (!BREAK_ADS_ENABLED) return
  if (!isBreakAdDue()) return
  void runBreakAd('wave-countdown')
}

/**
 * An interstitial was played by something OUTSIDE this module — today only the
 * hidden debug chord (`useAdDebugChord`). Charge it to the same clock.
 *
 * Without this the next countdown could request an interstitial seconds after
 * the debug one, inside the window the portal SDK rate-limits on, where it is
 * swallowed with no error and the cadence quietly stops for the session.
 */
export const noteExternalInterstitial = (): void => {
  elapsed = 0
  gap = rollGap()
  dueLogged = false
}

/** Test-only: current clock, in seconds of active play. */
export const __breakAdElapsed = (): number => elapsed
/** Test-only: the gap the current interval owes, in seconds. */
export const __breakAdGap = (): number => gap

/** Reset the clock and every latch. Test-only in practice — the cadence is
 *  session-scoped and this game has no discrete "run start". */
export const resetBreakInterstitial = (): void => {
  elapsed = 0
  gap = BREAK_AD_FIRST_GAP_S
  firing = false
  dueLogged = false
}
