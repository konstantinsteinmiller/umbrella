// ─── Pre-interstitial "Ad starting in 3…" warning ───────────────────────────
//
// CrazyGames full-release requirement for clicker/idle games. From CG's docs:
//
//   "Never trigger an ad out of nowhere while a player is actively tapping the
//    screen. Show a clear 3-to-5 second warning in the UI (e.g. 'Ad starting
//    in 3…') so they can stop clicking. This prevents accidental clicks and
//    keeps players happy."
//
// merge-idle-war is exactly that shape: the player taps SPAWN continuously, so
// an interstitial appearing mid-tap-burst would eat the next tap as an ad click.
// This module gates EVERY interstitial behind a visible, input-blocking
// countdown (`AdCountdownOverlay`), which:
//
//   • counts 3 → 2 → 1 with a tick per second, then
//   • STAYS up (input still blocked) through the audio drain and the SDK
//     request, so there is no gap between "warning gone" and "ad on screen"
//     where a stray tap could land, and
//   • freezes the sim for the whole warning via `acquireAppPause`, so the
//     wave doesn't advance behind a screen the player can't touch. Audio keeps
//     playing during the warning — the mute belongs to the ad itself
//     (`isAudioPaused`), and 3s of silence before an ad reads as a bug.
//
// Scope: CrazyGames FULL RELEASE only. `begin()` resolves immediately on every
// other build, so no other portal's ad pacing changes. The overlay is a no-op
// there too (it renders on `isVisible`, which only this module sets).
//
// Rewarded ads deliberately do NOT get a countdown: those are user-initiated
// from an explicit "watch ad" tap, so the player already knows a video is
// coming — and CG's guidance is about ads the player didn't ask for.

import { ref } from 'vue'
import { isCrazyGamesFullRelease } from '@/use/useMatch'
import { acquireAppPause } from '@/use/useGamePause'

/** Warning length in seconds. CG asks for 3–5; 3 is the shortest compliant
 *  value and the least intrusive on a 121s interstitial cadence. */
export const AD_COUNTDOWN_SECONDS = 3

/**
 * Whether this build shows the warning at all. Build-time literal, so callers
 * can branch on it to skip even the `await` — that matters: `useAds` must keep
 * flipping `isAdShowing` SYNCHRONOUSLY on every other platform (a bare `await`
 * on a no-op async fn still yields a microtask, which would open a window where
 * music could sound under a synchronously-opening ad overlay). Rollup also DCEs
 * the whole warning path on non-CG builds because of this.
 */
export const isAdCountdownEnabled = isCrazyGamesFullRelease

/** True while the blocking warning overlay should be on screen. */
export const isAdCountdownVisible = ref(false)

/** Seconds left in the warning. 0 ⇒ the count finished and we're in the
 *  hand-off window (drain + SDK request) — the overlay shows its "starting
 *  now" copy instead of a digit. */
export const adCountdownRemaining = ref(0)

let active = false
let releasePause: (() => void) | null = null
/** Injected by `useAds` to avoid a static import cycle
 *  (useSound → … → useAds). Set once at module load there. */
let tick: (() => void) | null = null

/** Register the per-second tick cue. Called by `useAds` at import time. */
export const setAdCountdownTick = (fn: () => void): void => { tick = fn }

/**
 * Show the warning and resolve once the count reaches zero. The overlay stays
 * visible (and keeps swallowing input) until `end()` — the caller MUST call it
 * in a `finally`, whatever the ad does.
 *
 * No-op (resolves immediately) off the CrazyGames full release, and re-entrant
 * calls are ignored so two ad sources can never stack two countdowns.
 */
export const beginAdCountdown = async (): Promise<void> => {
  if (!isCrazyGamesFullRelease || active) return
  active = true
  releasePause = acquireAppPause()
  isAdCountdownVisible.value = true
  for (let n = AD_COUNTDOWN_SECONDS; n > 0; n--) {
    adCountdownRemaining.value = n
    try { tick?.() } catch { /* audio not ready — the warning is visual anyway */ }
    await new Promise<void>((resolve) => setTimeout(resolve, 1000))
  }
  // Hold the blocker: the ad hasn't opened yet (audio drain + SDK request still
  // to come) and this is precisely the window an early tap would be eaten by.
  adCountdownRemaining.value = 0
}

/**
 * Tear the warning down and unfreeze the sim. Idempotent, and safe to call even
 * when `begin()` was a no-op — so `useAds` can call it unconditionally in its
 * `finally` on success, no-fill, error and watchdog-timeout alike.
 */
export const endAdCountdown = (): void => {
  isAdCountdownVisible.value = false
  adCountdownRemaining.value = 0
  releasePause?.()
  releasePause = null
  active = false
}

/** Test-only introspection. */
export const __isAdCountdownActive = (): boolean => active
