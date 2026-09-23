import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// An ad SDK whose callback never fires (Edge Tracking Prevention, an ad
// blocker, a dead ad CDN) is a promise that never settles. Without a ceiling,
// `useAds`' `finally` never runs: `isAdShowing` stays up, `isGamePaused` stays
// true and the music never comes back — for the rest of the session.

const hangingProvider = () => ({
  name: 'hanging',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  init: () => Promise.resolve(),
  showRewardedAd: () => new Promise<boolean>(() => {}),
  showMidgameAd: () => new Promise<void>(() => {})
})

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.doMock('@/platforms/resolveAdProvider', () => ({ resolveAdProvider: () => hangingProvider() }))
})

afterEach(() => {
  vi.doUnmock('@/platforms/resolveAdProvider')
  vi.useRealTimers()
})

describe('an ad that never settles releases the game', () => {
  it('rewarded: resolves "not granted" and drops the pause gate', async () => {
    const ads = await import('@/use/useAds')
    const pause = await import('@/use/useGamePause')
    const shown = ads.showRewardedAd()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(pause.isAdShowing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(90_000)
    await expect(shown).resolves.toBe(false)
    expect(pause.isAdShowing.value).toBe(false)
  })

  it('interstitial: resolves and drops the pause gate', async () => {
    const ads = await import('@/use/useAds')
    const pause = await import('@/use/useGamePause')
    let done = false
    void ads.showMidgameAd().then(() => { done = true })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(done).toBe(false)
    expect(pause.isAdShowing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(31_000)
    expect(done).toBe(true)
    expect(pause.isAdShowing.value).toBe(false)
  })
})
