// ─── Break-paced midgame interstitial ───────────────────────────────────────
//
// The recurring placement, re-added for the Playgama build after
// `useMidgameAdTimer` (which fired mid-combat the frame its 121 s elapsed) was
// deleted in the full-release pass. Same interval, different trigger: the ad
// may only open at a break the game already takes.
//
// What these tests pin, in the order it matters:
//
//   1. The clock is a MINIMUM GAP, not a schedule — no ad before 121 s of
//      active play, and none for another 121 s after one plays.
//   2. Wave clear arms the ad 1 s later, not immediately, so the player reads
//      "Wave cleared! +N" before the handover.
//   3. On a lost run the ad plays BEFORE the OVERRUN overlay is allowed to
//      render. That ordering is a documented portal rejection when inverted,
//      so it is asserted on the ref the template actually reads.
//   4. A no-fill does not cost the player a fresh 121 s.
//   5. Every other build gets nothing at all.

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

const GAP_S = 121

/** Fresh module graph with the Playgama build flag on (or off). */
const loadCadence = async (playgamaBuild = true) => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_APP_PLAYGAMA', playgamaBuild ? 'true' : '')
  mockProvider.isInterstitialReady.value = true
  mockProvider.showMidgameAd.mockClear()
  const ads = await import('@/use/useBreakInterstitial')
  const pause = await import('@/use/useGamePause')
  ads.resetBreakInterstitial()
  return { ads, pause }
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
})

describe('break interstitial — the 121s minimum gap', () => {
  it('shows nothing on a wave clear before the interval has elapsed', async () => {
    const { ads } = await loadCadence()

    play(ads, GAP_S - 5)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
  })

  it('shows one once 121s of active play have accumulated', async () => {
    const { ads } = await loadCadence()

    play(ads, GAP_S + 1)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('will not show a second one on the very next wave clear', async () => {
    // The regression this whole module exists to prevent: back-to-back waves
    // clearing in seconds must not mean back-to-back ads.
    const { ads } = await loadCadence()

    play(ads, GAP_S + 1)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    play(ads, 20)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('shows the next one only after another full interval', async () => {
    const { ads } = await loadCadence()

    play(ads, GAP_S + 1)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    play(ads, GAP_S + 1)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(2)
  })

  it('counts ACTIVE play only — the clock is fed past the pause gate', async () => {
    // `tickBreakInterstitial` is called from the battle RAF after its
    // `isGamePaused` early-return, so a paused minute contributes nothing.
    // Asserted on the clock itself: a frame that never arrives never counts.
    const { ads } = await loadCadence()

    play(ads, 60)
    expect(ads.__breakAdElapsed()).toBeCloseTo(60, 0)

    // 60 more seconds of wall clock with no frames — nothing moves.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(ads.__breakAdElapsed()).toBeCloseTo(60, 0)
  })
})

describe('break interstitial — wave-clear placement', () => {
  it('waits ~1s after the banner instead of firing on the clear', async () => {
    const { ads } = await loadCadence()
    play(ads, GAP_S + 1)

    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(500)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(700)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('drops the armed ad when the run is lost inside the delay window', async () => {
    // Losing the run during that 1s replaces the break: the death-screen
    // placement owns the moment, and a wave-clear ad firing on top of it would
    // be exactly the stacked-ad case the ordering rule forbids.
    const { ads } = await loadCadence()
    play(ads, GAP_S + 1)

    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(400)
    const death = ads.playDeathScreenInterstitial()

    await vi.advanceTimersByTimeAsync(2_000)
    await death

    // Exactly one ad — the death-screen one, not both.
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })
})

describe('break interstitial — death-screen ordering', () => {
  it('hides the OVERRUN overlay for the whole ad, then releases it', async () => {
    const { ads } = await loadCadence()
    play(ads, GAP_S + 1)

    const done = ads.playDeathScreenInterstitial()
    // SYNCHRONOUSLY true — the overlay must never get a frame in front of the
    // ad, and the template reads this ref directly.
    expect(ads.isDeathAdPlaying.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1_000)
    await done

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
    expect(ads.isDeathAdPlaying.value).toBe(false)
  })

  it('never suppresses the overlay when no ad is owed', async () => {
    const { ads } = await loadCadence()
    play(ads, 30)

    const done = ads.playDeathScreenInterstitial()
    expect(ads.isDeathAdPlaying.value).toBe(false)
    await done

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
  })

  it('never suppresses the overlay when the ad cannot fill', async () => {
    // Worst case if this were wrong: the death screen hidden behind an ad that
    // never appears.
    const { ads } = await loadCadence()
    mockProvider.isInterstitialReady.value = false
    play(ads, GAP_S + 1)

    const done = ads.playDeathScreenInterstitial()
    expect(ads.isDeathAdPlaying.value).toBe(false)
    await done

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
  })
})

describe('break interstitial — a no-fill is not the player\'s problem', () => {
  it('keeps the clock past the threshold so the next break retries', async () => {
    const { ads } = await loadCadence()
    mockProvider.isInterstitialReady.value = false

    play(ads, GAP_S + 1)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()

    // SDK fills a moment later; the very next wave clear should serve it
    // rather than charging another 121s.
    mockProvider.isInterstitialReady.value = true
    play(ads, 3)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
  })
})

describe('break interstitial — build gating', () => {
  it('is completely inert on a non-Playgama build', async () => {
    const { ads } = await loadCadence(false)

    play(ads, GAP_S * 3)
    ads.scheduleWaveClearInterstitial()
    await vi.advanceTimersByTimeAsync(3_000)
    const done = ads.playDeathScreenInterstitial()
    expect(ads.isDeathAdPlaying.value).toBe(false)
    await done

    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()
    expect(ads.__breakAdElapsed()).toBe(0)
  })
})
