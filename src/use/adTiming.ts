// ─── Per-portal ad timing ───────────────────────────────────────────────────
//
// Ad timing is decided PER BUILD, not once for the game (owner's rule; the
// playbook's Phase 6 "ad timing is per portal"). Two rules pull against each
// other, and each is right for its own portal:
//
//   • NO EARLY ADS — a player's first ~3 minutes are interstitial-free. Poki
//     playtests, CrazyGames and Playgama players, and the default for every
//     other ad portal.
//   • FIRST-LOAD AD — GameMonetize moderation rejects a build without one
//     ("Ads should be shown the first time after the game loads"); GamePix QA
//     asks for the same post-load ad. On GameMonetize the early-ad grace is 0.
//
// Rewarded offers are NOT governed here: they stay earned (first boss kill),
// on every build, GameMonetize included — the first-load interstitial is the
// portal-mandated exception, not a licence for first-frame rewarded CTAs.
//
// Leaf module on purpose (no imports): `useBarrage`, the first-load placement
// and tests all read it, and none of them may drag the others in.

/** The early-ad grace, when a portal keeps one. */
export const EARLY_AD_GRACE_MS = 3 * 60 * 1000

export interface AdTimingEnv {
  VITE_APP_GAME_MONETIZE?: string
  VITE_APP_GAMEPIX?: string
}

export interface AdTiming {
  /** Fire the post-splash first-load interstitial (`useFirstLoadInterstitial`). */
  firstLoadAd: boolean
  /** Ads from the first moment — no early-ad grace. */
  earlyAds: boolean
  /** Wall-clock grace before the first session interstitial that is NOT the
   *  first-load ad. 0 when `earlyAds`. */
  graceMs: number
}

/**
 * The per-portal matrix, as a pure function of the build env so a test can
 * pin every row. The build constants below MUST stay static `import.meta.env`
 * literals (that is what lets Rollup DCE a portal's branch), so they mirror
 * this function rather than call it — `adTiming.test.ts` pins that the two
 * agree.
 */
export const adTimingFor = (env: AdTimingEnv): AdTiming => {
  const earlyAds = env.VITE_APP_GAME_MONETIZE === 'true'
  const firstLoadAd = earlyAds || env.VITE_APP_GAMEPIX === 'true'
  return { firstLoadAd, earlyAds, graceMs: earlyAds ? 0 : EARLY_AD_GRACE_MS }
}

/** Build constant: this build fires the first-load interstitial. */
export const FIRST_LOAD_AD =
  import.meta.env.VITE_APP_GAME_MONETIZE === 'true' || import.meta.env.VITE_APP_GAMEPIX === 'true'
/** Build constant: this build has no early-ad grace. */
export const EARLY_ADS = import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
/** Build constant: the early-ad grace this build keeps. */
export const AD_GRACE_MS = EARLY_ADS ? 0 : EARLY_AD_GRACE_MS

// ─── The shared interstitial clock ──────────────────────────────────────────
//
// Wall-clock time of the last interstitial ANY placement showed this session.
// The first-load ad bypasses the pacing gates by design; it still has to start
// this clock, or a later placement requests a second ad inside the window the
// SDK rate-limits on ("The advertisement was requested too soon…").

const sessionStartedAt = Date.now()
let lastInterstitialAt: number | null = null

/** Record that an interstitial was shown (or requested) now. */
export const markInterstitialShown = (nowMs: number = Date.now()): void => {
  lastInterstitialAt = nowMs
}

/**
 * The timestamp a min-gap policy should measure from. Before any interstitial
 * this session, it is the session start pushed back so that exactly `graceMs`
 * must elapse before a `minGapMs` policy says "due": grace = min gap reproduces
 * "first ad no sooner than one gap after load", grace 0 makes the first ad due
 * at once. Pure.
 */
export const effectiveLastAdAt = (
  lastShownAt: number | null,
  sessionStartMs: number,
  graceMs: number,
  minGapMs: number
): number => lastShownAt ?? sessionStartMs - (minGapMs - graceMs)

/** `effectiveLastAdAt` for this session and build. */
export const lastInterstitialAtFor = (minGapMs: number): number =>
  effectiveLastAdAt(lastInterstitialAt, sessionStartedAt, AD_GRACE_MS, minGapMs)

/** Test-only: forget the session's last interstitial. */
export const __resetInterstitialClock = (): void => {
  lastInterstitialAt = null
}
