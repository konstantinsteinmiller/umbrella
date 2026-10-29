// ─── Umbrella ads: the death interstitial and the rewarded tap chord ────────
//
// ONE placement shows an interstitial: dying in a level. Two rules gate it,
// on every build:
//   • no ad in the first 240 s of GAMEPLAY — seconds the level is actually
//     running (`notePlayTime` is fed from the fixed-step loop, so menus, the
//     intro, ads and a hidden tab do not count);
//   • 121 s of wall clock since the last interstitial ANY placement showed
//     (the shared clock in adTiming.ts, so a portal's own first-load ad on
//     GameMonetize / GamePix counts too), keeping every request outside the
//     SDKs' rate limits.
// The ad plays BEFORE the level resets: the world stays frozen on the death
// (`isAdShowing` pauses the loop) and the respawn happens when it closes.
//
// Typing "cmunc" in the game requests an interstitial at once (`requestTestInterstitial`).
//
// A rewarded ad is requested by 20 consecutive taps / clicks on the "Level N"
// label (each within CHORD_GAP_MS of the one before). It is shipped in every
// build on purpose: it is how a tester sees a real rewarded ad on a device, and
// a player would have to hammer a HUD label twenty times in a row to find it.
//
// Audio: `useAds` flips `isAdShowing` synchronously, which raises
// `isAudioPaused`; the scene mutes the synth engine from that in the same call
// stack and unmutes it when the ad closes (UmbrellaScene `audioMuted`).

import { adProviderName, isInterstitialReady, showMidgameAd, showRewardedAd } from '@/use/useAds'
import { lastInterstitialAtFor, markInterstitialShown } from '@/use/adTiming'

/** Seconds of gameplay before the first death interstitial of a session. */
export const DEATH_AD_GRACE_S = 240
/** Wall-clock gap between two interstitials. */
export const DEATH_AD_MIN_GAP_MS = 121_000

/** Taps in a row that request a rewarded ad. */
export const CHORD_TAPS = 20
/** Longest pause between two taps of the chord. */
export const CHORD_GAP_MS = 1000

export interface DeathAdState {
  /** Gameplay seconds this session. */
  playSeconds: number
  nowMs: number
  /** When the last interstitial was shown (adTiming's effective clock). */
  lastAdAtMs: number
  /** The SDK has an interstitial it can show. */
  ready: boolean
}

/** Pure: is a death interstitial due? */
export const deathAdDue = (s: DeathAdState): boolean =>
  s.ready && s.playSeconds >= DEATH_AD_GRACE_S && s.nowMs - s.lastAdAtMs >= DEATH_AD_MIN_GAP_MS

let playSeconds = 0
/** The level ran for `dt` seconds (called from the fixed-step loop). */
export const notePlayTime = (dt: number): void => { playSeconds += dt }
export const sessionPlaySeconds = (): number => playSeconds

/** The build has a real ad SDK (not the no-op provider of the web / kite / lantern builds). */
const HAS_ADS = adProviderName !== 'noop'

/**
 * A death happened. When an interstitial is due it plays first and `respawn`
 * runs once it has closed (or failed); otherwise `respawn` runs now.
 * Returns true while an ad holds the respawn.
 */
export const onDeath = (respawn: () => void): boolean => {
  const now = Date.now()
  if (!HAS_ADS || !deathAdDue({ playSeconds, nowMs: now, lastAdAtMs: lastInterstitialAtFor(DEATH_AD_MIN_GAP_MS), ready: isInterstitialReady.value })) {
    respawn()
    return false
  }
  markInterstitialShown(now)
  // useAds reports its own failures; the respawn must come whatever the ad did.
  void showMidgameAd().catch(() => {}).finally(respawn)
  return true
}

/** Pure chord counter: `tap(now)` is true on the tap that completes the chord. */
export const createTapChord = (taps = CHORD_TAPS, gapMs = CHORD_GAP_MS) => {
  let count = 0
  let last = -Infinity
  return {
    tap(nowMs: number): boolean {
      count = nowMs - last <= gapMs ? count + 1 : 1
      last = nowMs
      if (count < taps) return false
      count = 0
      last = -Infinity
      return true
    },
    get count() { return count }
  }
}

const chord = createTapChord()
let rewardedBusy = false

/** One tap on the level label; the 20th in a row requests a rewarded ad. */
export const tapLevelLabel = (): void => {
  if (!chord.tap(performance.now()) || rewardedBusy) return
  rewardedBusy = true
  // A rewarded video counts against the interstitial clock: no death ad right behind it.
  markInterstitialShown()
  void showRewardedAd().catch(() => false).finally(() => { rewardedBusy = false })
}

let interstitialBusy = false
/**
 * The tester's interstitial: typing "cmunc" in the game (UmbrellaScene) requests one right away —
 * no grace, no gap — so a real interstitial can be seen on any build without playing 240 s and
 * dying. It still charges the shared clock, so the next death ad keeps its 121 s.
 */
export const requestTestInterstitial = (): void => {
  if (interstitialBusy || rewardedBusy) return
  interstitialBusy = true
  markInterstitialShown()
  void showMidgameAd().catch(() => {}).finally(() => { interstitialBusy = false })
}

/** Test-only. */
export const __resetUmbrellaAds = (): void => {
  interstitialBusy = false
  playSeconds = 0
  rewardedBusy = false
}
