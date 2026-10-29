// The umbrella ad rules: a death interstitial only after 240 s of gameplay and
// 121 s after the last interstitial, the respawn held until the ad has closed,
// and a rewarded ad on 20 taps in a row on the level label.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ads = vi.hoisted(() => ({
  ready: true,
  midgame: vi.fn(() => Promise.resolve()),
  rewarded: vi.fn(() => Promise.resolve(true))
}))
vi.mock('@/use/useAds', () => ({
  adProviderName: 'poki',
  isInterstitialReady: { get value() { return ads.ready } },
  showMidgameAd: ads.midgame,
  showRewardedAd: ads.rewarded
}))

import {
  CHORD_TAPS, DEATH_AD_GRACE_S, DEATH_AD_MIN_GAP_MS, __resetUmbrellaAds, createTapChord, deathAdDue,
  notePlayTime, onDeath, requestTestInterstitial, tapLevelLabel
} from '@/umbrella/ads'
import { __resetInterstitialClock, markInterstitialShown } from '@/use/adTiming'

describe('deathAdDue', () => {
  const base = { playSeconds: 300, nowMs: 1_000_000, lastAdAtMs: 0, ready: true }
  it('waits for 240 s of gameplay', () => {
    expect(DEATH_AD_GRACE_S).toBe(240)
    expect(deathAdDue({ ...base, playSeconds: 239.9 })).toBe(false)
    expect(deathAdDue({ ...base, playSeconds: 240 })).toBe(true)
  })
  it('keeps 121 s between interstitials', () => {
    expect(DEATH_AD_MIN_GAP_MS).toBe(121_000)
    expect(deathAdDue({ ...base, lastAdAtMs: base.nowMs - 120_999 })).toBe(false)
    expect(deathAdDue({ ...base, lastAdAtMs: base.nowMs - 121_000 })).toBe(true)
  })
  it('never asks an SDK that has nothing to show', () => {
    expect(deathAdDue({ ...base, ready: false })).toBe(false)
  })
})

describe('onDeath', () => {
  beforeEach(() => {
    __resetUmbrellaAds()
    __resetInterstitialClock()
    ads.midgame.mockClear()
    ads.ready = true
    // Ten minutes into the session (adTiming took the session start at import).
    const real = Date.now()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(real + 10 * 60_000)
  })
  afterEach(() => vi.useRealTimers())

  it('respawns at once inside the first 240 s of gameplay', () => {
    notePlayTime(200)
    const respawn = vi.fn()
    expect(onDeath(respawn)).toBe(false)
    expect(respawn).toHaveBeenCalledOnce()
    expect(ads.midgame).not.toHaveBeenCalled()
  })

  it('plays the ad first and respawns only once it has closed', async () => {
    notePlayTime(DEATH_AD_GRACE_S)
    let close!: () => void
    ads.midgame.mockImplementationOnce(() => new Promise<void>((r) => { close = r }))
    const respawn = vi.fn()
    expect(onDeath(respawn)).toBe(true)
    expect(ads.midgame).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(respawn).not.toHaveBeenCalled()
    close()
    await vi.waitFor(() => expect(respawn).toHaveBeenCalledOnce())
  })

  it('respawns even when the ad fails', async () => {
    notePlayTime(DEATH_AD_GRACE_S)
    ads.midgame.mockImplementationOnce(() => Promise.reject(new Error('no fill')))
    const respawn = vi.fn()
    onDeath(respawn)
    await vi.waitFor(() => expect(respawn).toHaveBeenCalledOnce())
  })

  it('then waits 121 s for the next one', () => {
    notePlayTime(DEATH_AD_GRACE_S)
    onDeath(() => {})
    expect(ads.midgame).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 120_000)
    expect(onDeath(() => {})).toBe(false)
    vi.setSystemTime(Date.now() + 1_000)
    expect(onDeath(() => {})).toBe(true)
    expect(ads.midgame).toHaveBeenCalledTimes(2)
  })

  it('counts any placement\'s interstitial (a portal first-load ad) on the same clock', () => {
    notePlayTime(DEATH_AD_GRACE_S)
    markInterstitialShown(Date.now() - 60_000)
    expect(onDeath(() => {})).toBe(false)
  })
})

describe('the level-label chord', () => {
  it('fires on the 20th tap in a row and starts over', () => {
    const c = createTapChord()
    let t = 0
    for (let i = 1; i < CHORD_TAPS; i++) expect(c.tap((t += 300))).toBe(false)
    expect(c.tap((t += 300))).toBe(true)
    expect(c.count).toBe(0)
  })
  it('is broken by a pause of more than a second', () => {
    const c = createTapChord()
    let t = 0
    for (let i = 0; i < CHORD_TAPS - 1; i++) c.tap((t += 300))
    expect(c.tap((t += 1500))).toBe(false)
    expect(c.count).toBe(1)
  })
  it('requests a rewarded ad', async () => {
    __resetUmbrellaAds()
    ads.rewarded.mockClear()
    for (let i = 0; i < CHORD_TAPS; i++) tapLevelLabel()
    expect(ads.rewarded).toHaveBeenCalledOnce()
  })
})

describe('typing cmunc', () => {
  it('requests an interstitial at once and charges the clock, so no death ad follows within 121 s', async () => {
    __resetUmbrellaAds()
    __resetInterstitialClock()
    ads.midgame.mockClear()
    requestTestInterstitial()
    requestTestInterstitial() // a second one while the first is up is ignored
    expect(ads.midgame).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(ads.midgame).toHaveBeenCalledOnce())
    notePlayTime(DEATH_AD_GRACE_S)
    const respawn = vi.fn()
    expect(onDeath(respawn)).toBe(false)
    expect(respawn).toHaveBeenCalledOnce()
  })
})
