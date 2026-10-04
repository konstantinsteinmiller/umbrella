// First-load interstitial orchestrator (`useFirstLoadInterstitial`).
//
// The trap this pins: a readiness check sampled ONCE loses the race against a
// cross-origin ad SDK on every real portal load (the SDK reports ready after
// the splash is gone) and then never fires. The placement must be a watcher
// that fires on the first moment BOTH signals hold — splash gone AND an
// interstitial fillable — whichever comes last. It also owes the music a
// restart (it interrupts a live run) and starts the shared interstitial clock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const showMidgameAd = vi.fn(() => Promise.resolve())
const resumeMusicAfterAd = vi.fn()
const noteExternalInterstitial = vi.fn()
const markInterstitialShown = vi.fn()

const load = async (ready: boolean) => {
  vi.resetModules()
  const { ref, nextTick } = await import('vue')
  const readyRef = ref(ready)
  vi.doMock('@/use/useAds', () => ({ isInterstitialReady: readyRef, showMidgameAd }))
  vi.doMock('@/use/useSound', () => ({ resumeMusicAfterAd }))
  vi.doMock('@/use/useBreakInterstitial', () => ({ noteExternalInterstitial }))
  vi.doMock('@/use/adTiming', () => ({ markInterstitialShown }))
  const mod = await import('@/use/useFirstLoadInterstitial')
  return { mod, readyRef, nextTick }
}

const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('useFirstLoadInterstitial', () => {
  beforeEach(() => {
    showMidgameAd.mockReset()
    showMidgameAd.mockImplementation(() => Promise.resolve())
    resumeMusicAfterAd.mockClear()
    noteExternalInterstitial.mockClear()
    markInterstitialShown.mockClear()
  })
  afterEach(() => {
    vi.doUnmock('@/use/useAds')
    vi.doUnmock('@/use/useSound')
    vi.doUnmock('@/use/useBreakInterstitial')
    vi.doUnmock('@/use/adTiming')
  })

  it('SDK ready AFTER the splash cleared (the real-portal order) → still fires', async () => {
    const { mod, readyRef, nextTick } = await load(false)
    mod.armFirstLoadInterstitial()
    mod.notifySplashGone()
    await nextTick()
    expect(showMidgameAd).not.toHaveBeenCalled()
    readyRef.value = true // the cross-origin SDK finally reports fillable
    await nextTick()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('SDK ready BEFORE the splash cleared → waits for the splash', async () => {
    const { mod, nextTick } = await load(true)
    mod.armFirstLoadInterstitial()
    await nextTick()
    expect(showMidgameAd).not.toHaveBeenCalled()
    mod.notifySplashGone()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('fires once per session, even if readiness flaps', async () => {
    const { mod, readyRef, nextTick } = await load(true)
    mod.armFirstLoadInterstitial()
    mod.notifySplashGone()
    readyRef.value = false
    await nextTick()
    readyRef.value = true
    await nextTick()
    mod.notifySplashGone()
    expect(showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('never fires unless armed (every build that does not want it)', async () => {
    const { mod } = await load(true)
    mod.notifySplashGone()
    expect(showMidgameAd).not.toHaveBeenCalled()
  })

  it('starts the shared interstitial clock and the break cadence', async () => {
    const { mod } = await load(true)
    mod.armFirstLoadInterstitial()
    mod.notifySplashGone()
    expect(markInterstitialShown).toHaveBeenCalledTimes(1)
    expect(noteExternalInterstitial).toHaveBeenCalledTimes(1)
  })

  it('restarts the music after the ad — played or no-fill', async () => {
    const { mod } = await load(true)
    mod.armFirstLoadInterstitial()
    mod.notifySplashGone()
    expect(resumeMusicAfterAd).not.toHaveBeenCalled() // not under the ad
    await settle()
    expect(resumeMusicAfterAd).toHaveBeenCalledTimes(1)
  })

  it('restarts the music even when the ad path throws', async () => {
    showMidgameAd.mockImplementation(() => Promise.reject(new Error('sdk died')))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { mod } = await load(true)
    mod.armFirstLoadInterstitial()
    mod.notifySplashGone()
    await settle()
    expect(resumeMusicAfterAd).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
