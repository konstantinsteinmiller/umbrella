// ─── Hidden debug chord: force an interstitial on demand ────────────────────
//
// 20 taps on the gold badge inside a rolling 30 s window request a midgame
// interstitial immediately. There is no other way to see a REAL portal
// interstitial on demand: every shipping placement is paced
// (`useBreakInterstitial`'s 121 s of active play, plus the portal's own
// `minimumDelayBetweenInterstitial`) and fires only at a wave clear or a death,
// so verifying the ad path on a device means playing for two minutes and hoping
// the SDK fills. This is the tester's shortcut.
//
// Shipped in EVERY build, on purpose — same reasoning as the vConsole chord in
// `useVConsole.ts`: a dev build has no real ad SDK, so a `import.meta.env.DEV`
// gate would make it useless for the one thing it exists for. The gold badge
// carries no other tap handler, so nothing here is reachable by accident; a
// player would have to deliberately hammer a HUD counter twenty times inside
// half a minute. (`useAds.__testInterstitial` remains the DEV-only way to
// exercise the pause/mute gate with no SDK at all.)
//
// ─── What this deliberately does NOT re-implement ──────────────────────────
//
// It calls `showMidgameAd()`, the same entry point every real placement uses,
// so the whole ad contract comes along: music hard-stopped and one-shot SFX
// killed before the request, `isAdShowing` flipped SYNCHRONOUSLY so nothing is
// audible under the overlay, the audio-drain wait, backend errors swallowed,
// and the pause gate dropped + music restarted in its `finally`. A debug path
// that opened an ad by any other route would be testing something the players
// never run.
//
// The one thing it must add is `noteExternalInterstitial()`: this ad bypasses
// the pacing clock by design, and without charging it to that clock the next
// wave clear can request an interstitial seconds later — inside the window the
// portal SDK rate-limits on, where it is swallowed silently.

import { ref, type Ref } from 'vue'
import { adProviderName, showMidgameAd } from '@/use/useAds'
import { isAdShowing } from '@/use/useGamePause'
import { noteExternalInterstitial } from '@/use/useBreakInterstitial'

/** Taps that must land inside the window to fire. */
export const AD_CHORD_TAP_THRESHOLD = 20
/** Rolling window the taps must fall inside. */
export const AD_CHORD_WINDOW_MS = 30_000

// Coalesce window: one physical touch fires pointerdown AND touchstart AND
// click within ~30-50 ms, and the badge listens for all three (cross-WebView
// reliability — the same reason `useVConsole` does). Without this dedupe the
// chord would trip after seven real taps.
const COALESCE_MS = 60

/** Reactive: taps inside the current window. Nothing renders it: a QA chord
 *  leaves no trace on a player's HUD (its "N/20" under the badge came out
 *  after playtest run 12). Tests and a console read it. */
export const adChordTapCount: Ref<number> = ref(0)

/** Reactive: true from the request until the ad has fully closed. */
export const isAdChordFiring: Ref<boolean> = ref(false)

const recentTaps: number[] = []
let lastTapAt = 0
let lapseTimer: ReturnType<typeof setTimeout> | null = null

/** Drop taps that have fallen out of the window and republish the count. */
const trim = (now: number): void => {
  while (recentTaps.length > 0 && now - recentTaps[0]! > AD_CHORD_WINDOW_MS) {
    recentTaps.shift()
  }
  adChordTapCount.value = recentTaps.length
}

/** Re-trim when the OLDEST tap expires, so a half-finished chord's readout
 *  clears itself instead of sitting on the HUD until the next tap. */
const armLapse = (): void => {
  if (lapseTimer !== null) clearTimeout(lapseTimer)
  lapseTimer = null
  const oldest = recentTaps[0]
  if (oldest === undefined) return
  lapseTimer = setTimeout(() => {
    lapseTimer = null
    trim(Date.now())
    armLapse()
  }, Math.max(50, oldest + AD_CHORD_WINDOW_MS - Date.now()))
}

const resetChord = (): void => {
  recentTaps.length = 0
  adChordTapCount.value = 0
  if (lapseTimer !== null) clearTimeout(lapseTimer)
  lapseTimer = null
}

/**
 * Request a midgame interstitial through the normal ad path.
 *
 * Exported so a console / test can trigger the same placement without twenty
 * synthetic taps. Never rejects — `showMidgameAd` swallows backend errors and
 * always drops the pause gate in its own `finally`.
 */
export const fireDebugInterstitial = async (): Promise<void> => {
  if (isAdChordFiring.value) return
  isAdChordFiring.value = true
  // Unconditional, not `isDebug`-gated: this fires only on a deliberate
  // gesture, and the whole point is to read it back on a device — through
  // vConsole, or the portal's own console. One line in, one line out.
  console.info(`[ads/chord] ▶ debug interstitial requested (provider=${adProviderName})`)
  try {
    await showMidgameAd()
  } finally {
    isAdChordFiring.value = false
    // Charge it to the shared cadence clock — see the header.
    noteExternalInterstitial()
    console.info('[ads/chord] ⏹ debug interstitial done')
  }
}

/**
 * Register a tap on the chord trigger (the gold badge). Returns true when this
 * tap reached the threshold and requested the ad.
 */
export const registerAdChordTap = (): boolean => {
  // An ad already on screen (this one, or any real placement) — taps landing
  // on the HUD behind an overlay must not queue a second request.
  if (isAdChordFiring.value || isAdShowing.value) return false

  const now = Date.now()
  if (now - lastTapAt < COALESCE_MS) return false
  lastTapAt = now

  recentTaps.push(now)
  trim(now)
  armLapse()

  if (recentTaps.length < AD_CHORD_TAP_THRESHOLD) return false

  // Reset BEFORE firing: the ad holds the call stack for its whole lifetime,
  // and a chord left armed would re-trigger on the first tap after it closes.
  resetChord()
  void fireDebugInterstitial()
  return true
}

/** Test-only: forget every buffered tap and the coalesce guard. */
export const resetAdDebugChord = (): void => {
  resetChord()
  lastTapAt = 0
  isAdChordFiring.value = false
}
