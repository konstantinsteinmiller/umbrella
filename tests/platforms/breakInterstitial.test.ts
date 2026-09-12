// ─── Time-paced midgame interstitial ────────────────────────────────────────
//
// One interstitial every 150-180 s of ACTIVE play, on every build except
// CrazyGames, opened at exactly one moment: the 3…2…1 countdown to the next
// wave.
//
// What these tests pin, in the order it matters:
//
//   1. The clock is a MINIMUM GAP, not a schedule — nothing before 150 s of
//      active play, and nothing for another 150-180 s after one plays.
//   2. The FIRST gap is exactly 150 s; every later one is re-rolled inside
//      [150, 180], so the cadence is not a metronome.
//   3. The countdown is the ONLY trigger, and it counts ACTIVE play only.
//   4. A no-fill does not cost the player a fresh interval.
//   5. An ad played from outside the module (the debug chord) still charges
//      this clock — otherwise the next countdown requests inside the portal's
//      own rate-limit window and is swallowed silently.
//   6. The CrazyGames build gets nothing at all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockProvider = {
  name: 'mock',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  init: vi.fn(async () => {}),
  showRewardedAd: vi.fn(async () => true),
  // Resolves on the NEXT macrotask, the way a real interstitial resolves on
  // its close edge — so a test can observe the in-flight state.
  showMidgameAd: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))

// `showMidgameAd` in `useAds` hard-stops music and kills SFX; none of that is
// under test here and all of it wants a live audio graph.
vi.mock('@/use/useAssets', () => ({
  suspendAllAudio: vi.fn(),
  resumeAllAudio: vi.fn(),
  killOneShotSfx: vi.fn()
}))
vi.mock('@/use/useSound', () => ({
  useMusic: () => ({ forceStopMusic: vi.fn(), resumeMusicAfterAd: vi.fn() }),
  forceStopMusic: vi.fn(),
  resumeMusicAfterAd: vi.fn()
}))

const FIRST_GAP_S = 150
const MIN_GAP_S = 150
const MAX_GAP_S = 180

/** Fresh module graph. `crazyBuild` picks the one platform that is excluded. */
const loadCadence = async (crazyBuild = false) => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_APP_CRAZY_WEB', crazyBuild ? 'true' : '')
  mockProvider.isInterstitialReady.value = true
  mockProvider.showMidgameAd.mockClear()
  const ads = await import('@/use/useBreakInterstitial')
  ads.resetBreakInterstitial()
  return ads
}

/** Burn N seconds of "active play" the way the battle RAF does. */
const play = (
  ads: typeof import('@/use/useBreakInterstitial'),
  seconds: number
): void => {
  for (let i = 0; i < seconds * 10; i++) ads.tickBreakInterstitial(0.1)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('countdown interstitial — the minimum gap', () => {
  it('shows nothing on a countdown before the first 150s have elapsed', async () => {
    const ads = await loadCadence()

    play(ads, FIRST_GAP_S - 5)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
  })

  it('shows one once 150s of active play have accumulated', async () => {
    const ads = await loadCadence()

    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('will not show a second one on the very next countdown', async () => {
    // The regression this whole module exists to prevent: back-to-back waves
    // clearing in seconds must not mean back-to-back ads.
    const ads = await loadCadence()

    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    play(ads, 20)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('shows the next one only after another full interval', async () => {
    const ads = await loadCadence()

    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    // MAX_GAP covers whatever the re-roll picked.
    play(ads, MAX_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(2)
  })

  it('counts ACTIVE play only — the clock is fed past the pause gate', async () => {
    // `tickBreakInterstitial` is called from the battle RAF after its
    // `isGamePaused` early-return, so a paused minute contributes nothing.
    // Asserted on the clock itself: a frame that never arrives never counts.
    const ads = await loadCadence()

    play(ads, 60)
    expect(ads.__breakAdElapsed()).toBeCloseTo(60, 0)

    // 60 more seconds of wall clock with no frames — nothing moves.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ads.__breakAdElapsed()).toBeCloseTo(60, 0)
  })
})

describe('countdown interstitial — the 150-180s spread', () => {
  it('owes exactly 150s before the first ad of the session', async () => {
    const ads = await loadCadence()
    expect(ads.__breakAdGap()).toBe(FIRST_GAP_S)
  })

  it('re-rolls the gap inside [150, 180] after every ad', async () => {
    const ads = await loadCadence()

    // Lowest roll → the floor, highest → just under the ceiling. Pinning both
    // ends is what proves the spread is a RANGE and not, say, `150 + random()`.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(ads.__breakAdGap()).toBe(MIN_GAP_S)

    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    play(ads, MAX_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(ads.__breakAdGap()).toBeGreaterThan(MAX_GAP_S - 1)
    expect(ads.__breakAdGap()).toBeLessThanOrEqual(MAX_GAP_S)
  })

  it('holds a 150s roll for a full 150s — no ad at 149', async () => {
    const ads = await loadCadence()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    play(ads, MIN_GAP_S - 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    play(ads, 2)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(2)
  })
})

describe('countdown interstitial — a no-fill is not the player\'s problem', () => {
  it('keeps the clock past the threshold so the next countdown retries', async () => {
    const ads = await loadCadence()
    mockProvider.isInterstitialReady.value = false

    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()

    // SDK fills a moment later; the very next countdown should serve it rather
    // than charging another 150s.
    mockProvider.isInterstitialReady.value = true
    play(ads, 3)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })
})

describe('countdown interstitial — ads played from outside', () => {
  it('charges an external interstitial to the same clock', async () => {
    // The debug chord bypasses the cadence by design. If it did not report
    // back, the next countdown would request seconds later — inside the window
    // the portal SDK rate-limits on, where it is swallowed with no error.
    const ads = await loadCadence()

    play(ads, FIRST_GAP_S + 1)
    ads.noteExternalInterstitial()
    expect(ads.__breakAdElapsed()).toBe(0)

    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
  })

  it('re-rolls the next gap too, so the pacing stays inside the range', async () => {
    const ads = await loadCadence()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    ads.noteExternalInterstitial()
    expect(ads.__breakAdGap()).toBe(MIN_GAP_S)
  })
})

describe('countdown interstitial — build gating', () => {
  it('is completely inert on the CrazyGames build', async () => {
    const ads = await loadCadence(true)

    play(ads, MAX_GAP_S * 3)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(3_000)

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
    expect(ads.__breakAdElapsed()).toBe(0)
  })

  it('runs on every other build', async () => {
    // Asserted through the CG flag being absent, which is the actual gate —
    // there is no per-portal allowlist to drift out of sync with any more.
    const ads = await loadCadence(false)

    play(ads, FIRST_GAP_S + 1)
    ads.playCountdownInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })
})
