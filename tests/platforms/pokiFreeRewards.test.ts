// ─── Poki playtest: the first N rewarded taps are granted with no ad ────────
//
// `VITE_APP_POKI_FREE_REWARDS` (set to 2 in `.env.poki-playtest`, UNSET in
// `.env.poki`) hands the player the first N rewards without a video.
//
// Why it exists: Poki's Playtesting stage records 10 real players, and the
// Player Fit Test it unlocks grades AVERAGE PLAYTIME and nothing else (>= 3 min
// average, >= 25 % of sessions over 3 min). An ~11 s rewarded video in front of
// Rally / Instant Spawn / 2x Damage during that stage spends the very metric
// being measured, and a tester who bounces off the first ad never reaches the
// loop we asked them to evaluate.
//
// Three things have to hold, and each is a separate way to get this wrong:
//
//   1. The counter is EXHAUSTIBLE. Two free grants, then real ads — a playtester
//      must still see the genuine ad cadence before their recording ends.
//   2. It is OFF by default. An unset env var means zero free grants, so the
//      release build cannot accidentally ship a game that gives rewards away.
//   3. `useAds` consults it BEFORE the audio kill. A reward with no video must
//      run none of the ad-audio ceremony — no `forceStopMusic`, no
//      `isAdShowing` flip — or the player hears the music hard-stop and restart
//      for an ad that never played.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'

// ─── Part 1: the counter itself ─────────────────────────────────────────────

const loadPluginWithFreeGrants = async (value: string | undefined) => {
  vi.resetModules()
  if (value === undefined) vi.stubEnv('VITE_APP_POKI_FREE_REWARDS', '')
  else vi.stubEnv('VITE_APP_POKI_FREE_REWARDS', value)
  return await import('@/utils/pokiPlugin')
}

describe('poki free rewarded grants (playtest build)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('grants exactly N times, then falls through to the real ad path', async () => {
    const { pokiTryFreeRewardedGrant, pokiFreeRewardedRemaining } =
      await loadPluginWithFreeGrants('2')

    expect(pokiFreeRewardedRemaining()).toBe(2)
    expect(pokiTryFreeRewardedGrant()).toBe(true)
    expect(pokiTryFreeRewardedGrant()).toBe(true)
    // Third tap: the playtester now sees a genuine rewardedBreak().
    expect(pokiTryFreeRewardedGrant()).toBe(false)
    expect(pokiFreeRewardedRemaining()).toBe(0)
  })

  it('keeps the rewarded buttons visible while free grants remain', async () => {
    const { pokiHasFreeRewarded, pokiTryFreeRewardedGrant, isPokiSdkActive } =
      await loadPluginWithFreeGrants('2')

    // The SDK has NOT initialised — on the release build that hides every
    // reward placement, because the loader shim's `rewardedBreak` stub resolves
    // `false`. A free grant needs no SDK, so the button stays live.
    expect(isPokiSdkActive.value).toBe(false)
    expect(pokiHasFreeRewarded.value).toBe(true)

    pokiTryFreeRewardedGrant()
    expect(pokiHasFreeRewarded.value).toBe(true)
    pokiTryFreeRewardedGrant()
    expect(pokiHasFreeRewarded.value).toBe(false)
  })

  it('is OFF unless the env var is set — the release build grants nothing free', async () => {
    const { pokiTryFreeRewardedGrant, pokiHasFreeRewarded, pokiFreeRewardedRemaining } =
      await loadPluginWithFreeGrants(undefined)

    expect(pokiFreeRewardedRemaining()).toBe(0)
    expect(pokiHasFreeRewarded.value).toBe(false)
    expect(pokiTryFreeRewardedGrant()).toBe(false)
  })

  it('ignores a garbage or negative value rather than granting forever', async () => {
    for (const bad of ['nope', '-3', '0']) {
      const { pokiTryFreeRewardedGrant } = await loadPluginWithFreeGrants(bad)
      expect(pokiTryFreeRewardedGrant(), bad).toBe(false)
    }
  })
})

// ─── Part 2: useAds honours it without running the ad-audio ceremony ────────

const mockProvider = {
  name: 'poki-mock',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  managesMidgameAudio: true,
  tryInstantGrant: vi.fn(() => false),
  init: vi.fn(async () => {}),
  showRewardedAd: vi.fn(async () => true),
  showMidgameAd: vi.fn(async () => {})
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))

const importAds = async () => {
  vi.resetModules()
  mockProvider.tryInstantGrant.mockClear()
  mockProvider.tryInstantGrant.mockReturnValue(false)
  mockProvider.showRewardedAd.mockClear()
  mockProvider.showRewardedAd.mockResolvedValue(true)
  const ads = await import('@/use/useAds')
  // Same module registry, so this is the very ref `useAds` flips.
  const pause = await import('@/use/useGamePause')
  return { ads, pause }
}

describe('useAds + an instant (ad-free) grant', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { window.localStorage.clear() })

  it('grants without calling the SDK and without raising the ad gate', async () => {
    const { ads, pause } = await importAds()
    mockProvider.tryInstantGrant.mockReturnValue(true)

    let adGateFlips = 0
    const stop = watch(pause.isAdShowing, () => { adGateFlips++ }, { flush: 'sync' })
    const granted = await ads.showRewardedAd()
    stop()

    expect(granted).toBe(true)
    expect(mockProvider.showRewardedAd).not.toHaveBeenCalled()
    // The load-bearing assertion: `isAdShowing` never moved, so the music was
    // never hard-stopped, no SFX were killed and the sim never froze.
    expect(adGateFlips).toBe(0)
    expect(pause.isAdShowing.value).toBe(false)
  })

  it('still counts against the rewarded throttle', async () => {
    const { ads } = await importAds()
    const throttle = await import('@/use/useRewardedThrottle')
    mockProvider.tryInstantGrant.mockReturnValue(true)

    for (let i = 0; i < throttle.MAX_REWARDED; i++) await ads.showRewardedAd()

    // A free grant is still a reward redeemed. The cap is what stops reward
    // farming, so it has to see these too.
    expect(throttle.isRewardedThrottled.value).toBe(true)
  })

  it('falls through to the real ad once the free grants run out', async () => {
    const { ads, pause } = await importAds()
    // First tap free, every later one a real ad — the exhaustible-counter
    // behaviour, seen from the `useAds` side.
    mockProvider.tryInstantGrant.mockReturnValueOnce(true).mockReturnValue(false)

    await expect(ads.showRewardedAd()).resolves.toBe(true)
    expect(mockProvider.showRewardedAd).not.toHaveBeenCalled()

    await expect(ads.showRewardedAd()).resolves.toBe(true)
    expect(mockProvider.showRewardedAd).toHaveBeenCalledTimes(1)
    // And the gate was released again afterwards.
    expect(pause.isAdShowing.value).toBe(false)
  })

  it('is a no-op for providers that never opt in', async () => {
    const { ads } = await importAds()
    // `tryInstantGrant` returning false is the every-other-platform path.
    await expect(ads.showRewardedAd()).resolves.toBe(true)
    expect(mockProvider.showRewardedAd).toHaveBeenCalledTimes(1)
  })
})
