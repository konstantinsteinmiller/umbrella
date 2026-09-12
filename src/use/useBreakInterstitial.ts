// ─── Break-paced midgame interstitial ───────────────────────────────────────
//
// The recurring interstitial, re-added for the Playgama build (which is also
// the YouTube Playables submission — one archive, see `.env.playgama`).
//
// ─── What was here before, and why this is not that ────────────────────────
//
// `useMidgameAdTimer.ts` shipped the same 121 s clock but fired the ad THE
// FRAME THE INTERVAL ELAPSED — mid-combat, on top of a live wave, whatever the
// player was doing. It was deleted wholesale in the "full release changes"
// commit, and rightly: an interstitial that lands between a spawn and a merge
// is the placement players (and portal reviewers) punish hardest.
//
// The clock is worth keeping. The trigger is not. So the interval survives and
// the firing moment moves to a NATURAL BREAK — the two moments this game
// already stops for:
//
//   1. **A wave was cleared.** The field is empty, the banner is up, the next
//      wave has not spawned. The ad opens 1 s after the banner, so the player
//      reads their reward first and the ad lands in dead air instead of over a
//      celebration.
//   2. **The run was lost.** The ad plays BEFORE the OVERRUN overlay renders,
//      never over it. That ordering is a graded portal check, not a taste
//      call: an interstitial that opens on top of a result screen reads as
//      "the game hid my result behind an ad" and it is a documented rejection
//      (integrate-playgama pitfall P, tower-siege 2026-08).
//
// ─── The 121 s is ACTIVE-PLAY seconds, deliberately ────────────────────────
//
// `tickBreakInterstitial` is driven from the battle RAF loop AFTER its
// `isGamePaused` gate, so the clock only advances while the player is really
// playing — never under an ad, behind a modal, during the tutorial hold, or on
// a hidden tab. Two consequences, both wanted:
//
//   • The cadence is honest. A player who alt-tabs for ten minutes comes back
//     to the same amount of remaining play time, not to an instant ad.
//   • It can never undercut the Bridge's own guard. Playgama is configured
//     with `minimumDelayBetweenInterstitial: 120` (wall-clock) in
//     `playgama-bridge-config.json`; 121 s of active play is by definition
//     ≥ 121 s of wall clock, so our request always lands outside the Bridge's
//     window and can never be silently swallowed as "too soon".
//
// A due-but-unfillable ad does NOT reset the clock — `elapsed` stays past the
// threshold so the next break retries, instead of charging the player a fresh
// 121 s for the SDK's no-fill.

import { ref } from 'vue'
import { adProviderName, isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { isAdShowing } from '@/use/useGamePause'
import { isDebug } from '@/use/useMatch'

/** Minimum seconds of ACTIVE gameplay between two interstitials. */
export const BREAK_AD_MIN_GAP_S = 121

/** Delay between the wave-cleared banner appearing and the ad opening, so the
 *  player reads "Wave cleared! +N" before the handover. The banner itself runs
 *  1500 ms, so the ad opens while it is still legible. */
export const WAVE_CLEAR_AD_DELAY_MS = 1_000

/**
 * Which builds run the cadence.
 *
 * Playgama only, for now. The recurring placement was removed from every build
 * on purpose (see the header), and switching it back on for CrazyGames, Poki,
 * GamePix, Yandex or GameDistribution is a per-portal monetization decision
 * with its own rules — Poki in particular measures conversion-to-play off the
 * first `gameplayStart()` and penalises breaks that crowd it. Adding a portal
 * is one term here plus a line in that portal's release notes.
 *
 * An `import.meta.env` literal, not the `isPlaygama` re-export from `useUser`:
 * Vite folds the literal at parse time, so on every other build this whole
 * module tree-shakes down to inert stubs.
 */
const BREAK_ADS_ENABLED = import.meta.env.VITE_APP_PLAYGAMA === 'true'

/**
 * True while the death-screen interstitial is on its way up or on screen.
 *
 * `BattleArena` ANDs this into the OVERRUN overlay's `v-if`, which is what
 * makes "ad before the death screen" true rather than aspirational. It is set
 * SYNCHRONOUSLY — before the first `await` in `playDeathScreenInterstitial` —
 * so the overlay never gets a frame to paint in.
 */
export const isDeathAdPlaying = ref(false)

let elapsed = 0
let firing = false
let dueLogged = false
let waveClearTimer: ReturnType<typeof setTimeout> | null = null

const log = (...args: unknown[]): void => {
  if (isDebug.value) console.info('[ads/break]', ...args)
}

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
 * Both halves matter. `elapsed` alone would have us hide the death screen for
 * an ad that then no-fills; `isInterstitialReady` alone would fire on every
 * single wave clear. Reads only refs, so callers can branch on it
 * synchronously — which the death-screen path depends on.
 */
export const isBreakAdDue = (): boolean => {
  if (!BREAK_ADS_ENABLED || firing) return false
  if (elapsed < BREAK_AD_MIN_GAP_S) return false
  if (isAdShowing.value) return false
  if (!isInterstitialReady.value) {
    // One line per due-window, not per frame: QA needs to see that the clock
    // IS running and the provider simply has nothing to show (the `noop`
    // provider in plain dev, or a real no-fill).
    if (!dueLogged) {
      dueLogged = true
      log(`due (${BREAK_AD_MIN_GAP_S}s of play) — no interstitial ready (provider=${adProviderName}); waiting for the next break`)
    }
    return false
  }
  return true
}

/** Shared runner: owns the `firing` latch and the clock reset. `showMidgameAd`
 *  never rejects (it swallows backend errors and always drops the pause/audio
 *  gate in a `finally`), but the latch is released in a `finally` anyway so a
 *  future change there can't wedge the scheduler for the session. */
const runBreakAd = async (reason: string): Promise<void> => {
  firing = true
  elapsed = 0
  dueLogged = false
  log(`▶ ${reason} interstitial (provider=${adProviderName})`)
  try {
    await showMidgameAd()
  } finally {
    firing = false
    log(`⏹ ${reason} interstitial done`)
  }
}

/**
 * Wave cleared → arm the interstitial for `WAVE_CLEAR_AD_DELAY_MS` later.
 *
 * Deliberately fire-and-forget: the caller is a synchronous battle-event
 * handler that must not be held up. The sim freezes for the ad's whole
 * lifetime anyway (`isAdShowing` → `isGamePaused`), so the wave break simply
 * lasts longer and the next wave spawns after the ad closes.
 *
 * Re-checked at fire time, not just at arm time: 1 s is long enough for the
 * player to open a menu, for a rewarded ad to start, or for the run to be lost
 * outright — and the death-screen placement takes precedence over this one.
 */
export const scheduleWaveClearInterstitial = (): void => {
  if (!BREAK_ADS_ENABLED) return
  if (!isBreakAdDue()) return
  cancelPendingWaveClearAd()
  waveClearTimer = setTimeout(() => {
    waveClearTimer = null
    if (isDeathAdPlaying.value || !isBreakAdDue()) return
    void runBreakAd('wave-clear')
  }, WAVE_CLEAR_AD_DELAY_MS)
}

/** Drop a pending wave-clear ad. Called when the run is lost inside the delay
 *  window, so the death-screen placement doesn't get shoved aside by a timer
 *  that was armed for a break which no longer exists. */
export const cancelPendingWaveClearAd = (): void => {
  if (waveClearTimer === null) return
  clearTimeout(waveClearTimer)
  waveClearTimer = null
}

/**
 * Run lost → play the interstitial BEFORE the OVERRUN overlay appears.
 *
 * Sets `isDeathAdPlaying` synchronously (the overlay's `v-if` reads it) and
 * clears it once the ad has fully closed, so the death screen animates in
 * afterwards exactly as it would have. Resolves immediately when no ad is
 * owed, in which case the overlay is never suppressed for a frame.
 *
 * Safe to leave un-awaited by the caller — the visual ordering is enforced by
 * the ref, not by the call site's control flow.
 */
export const playDeathScreenInterstitial = async (): Promise<void> => {
  if (!BREAK_ADS_ENABLED) return
  cancelPendingWaveClearAd()
  if (!isBreakAdDue()) return
  isDeathAdPlaying.value = true
  try {
    await runBreakAd('death-screen')
  } finally {
    isDeathAdPlaying.value = false
  }
}

/** Test-only: current clock, in seconds of active play. */
export const __breakAdElapsed = (): number => elapsed

/** Reset the clock and every latch. Test-only in practice — the cadence is
 *  session-scoped and this game has no discrete "run start". */
export const resetBreakInterstitial = (): void => {
  cancelPendingWaveClearAd()
  elapsed = 0
  firing = false
  dueLogged = false
  isDeathAdPlaying.value = false
}
