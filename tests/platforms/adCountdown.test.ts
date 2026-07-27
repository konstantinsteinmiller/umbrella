// CrazyGames pre-interstitial warning ("Ad starting in 3…").
//
// CG's clicker-game guidance: never open an interstitial while the player is
// tapping — show a 3-5s visible warning first. The properties that matter:
//
//   1. the warning is shown and counts down before the SDK is asked for an ad,
//   2. it STAYS up past the count (through the audio drain + request) so there
//      is no untimed gap where a tap could land on a freshly-opened ad,
//   3. it freezes the sim while it's up, and
//   4. it is ALWAYS torn down — ad closed, no-fill, or provider throw — so it
//      can never strand the player behind an un-dismissable blocker.
//
// `isCrazyGamesFullRelease` is a build-time literal, so the gate is stubbed via
// `@/use/useMatch` to exercise both the CG-on and CG-off paths.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockProvider = {
  name: 'mock-cg',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  init: vi.fn(async () => {}),
  showRewardedAd: vi.fn(async () => true),
  showMidgameAd: vi.fn(async () => {})
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))

/** Load the graph with `isCrazyGamesFullRelease` forced on/off. */
const importAll = async (fullRelease: boolean) => {
  vi.resetModules()
  mockProvider.showMidgameAd.mockReset()
  mockProvider.showMidgameAd.mockResolvedValue(undefined)

  vi.doMock('@/use/useMatch', async () => {
    const actual = await vi.importActual<typeof import('@/use/useMatch')>('@/use/useMatch')
    return { ...actual, isCrazyGamesFullRelease: fullRelease }
  })

  const countdown = await import('@/use/useAdCountdown')
  const gate = await import('@/use/useGamePause')
  const ads = await import('@/use/useAds')
  return { countdown, gate, ads }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('@/use/useMatch')
})

describe('ad countdown — CrazyGames full release', () => {
  it('counts 3 → 2 → 1 and only then requests the ad', async () => {
    const { countdown, ads } = await importAll(true)

    const p = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(0)

    // Visible immediately at 3, and the SDK has NOT been asked yet.
    expect(countdown.isAdCountdownVisible.value).toBe(true)
    expect(countdown.adCountdownRemaining.value).toBe(3)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(countdown.adCountdownRemaining.value).toBe(2)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(countdown.adCountdownRemaining.value).toBe(1)
    expect(mockProvider.showMidgameAd).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000) // finish count + audio drain
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)

    await p
  })

  it('keeps the blocker up between the last tick and the ad request', async () => {
    // The gap CG cares about: warning gone but ad not yet on screen. The
    // overlay must still be swallowing input there.
    const { countdown, ads } = await importAll(true)

    const p = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(3000) // count finished
    expect(countdown.adCountdownRemaining.value).toBe(0)
    expect(countdown.isAdCountdownVisible.value).toBe(true) // still blocking

    await vi.advanceTimersByTimeAsync(3000)
    await p
  })

  it('freezes the sim while the warning is up and unfreezes after', async () => {
    const { countdown, gate, ads } = await importAll(true)
    expect(gate.isGamePaused.value).toBe(false)

    const p = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(0)
    expect(gate.isGamePaused.value).toBe(true)
    // Audio is NOT muted yet — the mute belongs to the ad, not the warning.
    expect(gate.isAudioPaused.value).toBe(false)

    await vi.advanceTimersByTimeAsync(6000)
    await p
    expect(countdown.isAdCountdownVisible.value).toBe(false)
    expect(gate.isGamePaused.value).toBe(false)
  })

  it('tears the blocker down even when the provider throws', async () => {
    const { countdown, gate, ads } = await importAll(true)
    mockProvider.showMidgameAd.mockRejectedValue(new Error('sdk boom'))

    const p = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(6000)
    await p

    expect(countdown.isAdCountdownVisible.value).toBe(false)
    expect(gate.isGamePaused.value).toBe(false)
    expect(countdown.__isAdCountdownActive()).toBe(false)
  })

  it('does not stack two countdowns when a second ad overlaps', async () => {
    const { countdown, ads } = await importAll(true)

    const a = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(1000)
    expect(countdown.adCountdownRemaining.value).toBe(2)

    // A second source firing mid-warning must not restart the count.
    const b = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(0)
    expect(countdown.adCountdownRemaining.value).toBe(2)

    await vi.advanceTimersByTimeAsync(8000)
    await Promise.all([a, b])
  })

  it('rewarded ads get NO countdown (user-initiated)', async () => {
    const { countdown, ads } = await importAll(true)
    const p = ads.showRewardedAd()
    await vi.advanceTimersByTimeAsync(0)
    expect(countdown.isAdCountdownVisible.value).toBe(false)
    await p
  })
})

describe('ad countdown — every other build', () => {
  it('is inert off the CrazyGames full release', async () => {
    const { countdown, ads } = await importAll(false)

    const p = ads.showMidgameAd()
    await vi.advanceTimersByTimeAsync(0)
    expect(countdown.isAdCountdownVisible.value).toBe(false)

    // No 3s warning in front of the request — only the existing audio drain.
    await vi.advanceTimersByTimeAsync(300)
    expect(mockProvider.showMidgameAd).toHaveBeenCalledTimes(1)
    await p
  })
})
