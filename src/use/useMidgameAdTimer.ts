// Periodic midgame (interstitial) ad scheduler.
//
// The game only ever fired an interstitial on the first load / first start
// (`useFirstLoadInterstitial` / `useFirstStartInterstitial`). This adds the
// recurring placement: one interstitial every `MIDGAME_AD_INTERVAL_S` seconds
// of ACTIVE gameplay.
//
// "Active" is the key word. `tickMidgameAd` is driven from the battle RAF loop
// AFTER its `isGamePaused` gate, so the clock only advances while the player is
// actually playing — it does NOT count time spent under an ad, behind a modal,
// or on any other paused state. That keeps the cadence honest (real play time,
// not wall-clock) and guarantees we never stack a second ad onto a pause.
//
// The audio-mute + freeze contract around the ad itself lives in
// `useAds.showMidgameAd` (hard-stop music, kill one-shot SFX, hold the pause
// gate); this module only decides WHEN to call it.
import { adProviderName, isInterstitialReady, showMidgameAd } from '@/use/useAds'
import { isAdShowing } from '@/use/useGamePause'
import { isDebug } from '@/use/useMatch'

/** Seconds of active gameplay between automatic interstitials. */
export const MIDGAME_AD_INTERVAL_S = 121

let elapsed = 0
let firing = false
let dueLogged = false

/**
 * Advance the midgame-ad clock by `dt` seconds of ACTIVE gameplay and fire an
 * interstitial once the interval elapses. Call once per stepped frame from the
 * battle loop, past the pause gate.
 *
 * When the interval is reached but no interstitial is loaded (or one is already
 * showing), the clock is left past the threshold so it retries on the next
 * frame — a no-fill window doesn't cost the player a fresh 121s wait, and it
 * never resets until an ad actually plays.
 */
export const tickMidgameAd = (dt: number): void => {
  if (firing) return
  elapsed += dt
  if (elapsed < MIDGAME_AD_INTERVAL_S) { dueLogged = false; return }
  // Interval reached — only pull the trigger when an ad is genuinely available
  // and nothing else is mid-show. Otherwise keep waiting (elapsed stays high).
  if (isAdShowing.value || !isInterstitialReady.value) {
    // One line per due-window so QA can tell the clock IS firing — it's just
    // that the current provider has no interstitial (e.g. `noop` in plain dev,
    // or a no-fill). Enable with the `cmarc` debug toggle.
    if (isDebug.value && !dueLogged) {
      dueLogged = true
      console.info(`[ads] midgame ad due (${MIDGAME_AD_INTERVAL_S}s of play) — no interstitial ready (provider=${adProviderName}); waiting`)
    }
    return
  }
  firing = true
  elapsed = 0
  dueLogged = false
  if (isDebug.value) console.info(`[ads] midgame ad interval reached → showing interstitial (provider=${adProviderName})`)
  // `showMidgameAd` owns the pause/audio gate and never rejects, but guard the
  // `firing` reset in a finally so a thrown backend can't wedge the scheduler.
  void showMidgameAd().finally(() => { firing = false })
}

/** Reset the clock — e.g. on a fresh run so the first interstitial is a full
 *  interval into play, not left over from a previous session's tail. */
export const resetMidgameAdTimer = (): void => {
  elapsed = 0
  firing = false
}
