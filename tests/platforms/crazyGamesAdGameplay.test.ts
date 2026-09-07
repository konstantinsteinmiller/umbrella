// CG QA: "There's no need to call gameplay events while ads are playing."
// The SDK brackets the ad itself, so `startGameplay` / `stopGameplay` must go
// quiet for the whole span of a `requestAd()` — from the request until its final
// callback (adFinished / adError / watchdog).
//
// Quiet, but not deaf: an ad is nearly always fired from a menu, so the modal
// gate and the wave-break hooks keep calling into this module while the overlay
// is up. Whatever they last asked for is replayed on settle, so CG ends up with
// a truthful state instead of one frozen from before the ad.
//
// `isSdkActive` only flips when the build is a CrazyGames build, so this suite
// stubs `VITE_APP_CRAZY_WEB` itself rather than leaning on the ambient env.
// It used to rely on the base `.env` shipping the flag — but a flag in the base
// `.env` leaks into EVERY mode that doesn't clear it, which silently turned
// `build:playgama` (and five other portal builds) into CrazyGames builds. The
// flag now lives only in `.env.crazy-web`, so tests must declare what they need.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface AdCallbacks {
  adStarted?: () => void
  adFinished?: () => void
  adError?: (e: unknown) => void
}

/** Fake SDK that records the gameplay events it received, in order, and hands
 *  back the ad callbacks so the test can drive the ad's lifecycle by hand. */
const makeSdk = () => {
  const calls: string[] = []
  let cbs: AdCallbacks | null = null
  const sdk = {
    environment: 'local',
    init: vi.fn(async () => {}),
    game: {
      gameplayStart: vi.fn(() => { calls.push('start') }),
      gameplayStop: vi.fn(() => { calls.push('stop') })
    },
    user: {},
    ad: {
      requestAd: vi.fn((_format: string, c: AdCallbacks) => { cbs = c })
    }
  }
  return { sdk, calls, ad: (): AdCallbacks => cbs as AdCallbacks }
}

const load = async (sdk: unknown) => {
  vi.resetModules()
  ;(window as unknown as Record<string, unknown>).CrazyGames = { SDK: sdk }
  const cg = await import('@/use/useCrazyGames')
  await cg.initCrazyGames()
  expect(cg.isSdkActive.value).toBe(true)
  return cg
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
  vi.stubEnv('VITE_APP_CRAZY_GAMES_FULL_RELEASE', 'true')
})

afterEach(() => { vi.unstubAllEnvs() })

describe('CrazyGames gameplay events around ads', () => {
  it('emits nothing for the span of an ad the game did not change state behind', async () => {
    const { sdk, calls, ad } = makeSdk()
    const cg = await load(sdk)

    cg.startGameplay()
    expect(calls).toEqual(['start'])

    const p = cg.showRewardedAd()
    ad().adStarted?.()
    // The old code emitted a stop here — that is exactly what QA flagged.
    expect(calls).toEqual(['start'])

    ad().adFinished?.()
    await expect(p).resolves.toBe(true)
    // ...and no redundant restart on the way out either.
    expect(calls).toEqual(['start'])
  })

  it('defers a stop issued behind the ad until the request settles', async () => {
    const { sdk, calls, ad } = makeSdk()
    const cg = await load(sdk)

    cg.startGameplay()
    const p = cg.showRewardedAd()
    ad().adStarted?.()

    // The result screen / a modal opening behind the ad overlay.
    cg.stopGameplay()
    expect(calls).toEqual(['start'])

    ad().adFinished?.()
    await p
    expect(calls).toEqual(['start', 'stop'])
  })

  it('replays only the final state asked for while the ad was up', async () => {
    const { sdk, calls, ad } = makeSdk()
    const cg = await load(sdk)

    cg.startGameplay()
    const p = cg.showRewardedAd()
    ad().adStarted?.()

    cg.stopGameplay()  // modal opened behind the ad
    cg.startGameplay() // ...and closed again before it finished

    ad().adFinished?.()
    await p
    // Net zero change → nothing to emit, no start/stop churn.
    expect(calls).toEqual(['start'])
  })

  it('lifts the mute again after an ad that errored (no fill / adblock)', async () => {
    const { sdk, calls, ad } = makeSdk()
    const cg = await load(sdk)

    cg.startGameplay()
    const p = cg.showRewardedAd()
    ad().adError?.({ code: 'adCooldown' })
    await expect(p).resolves.toBe(false)

    // Back to normal: the next real transition goes straight through.
    cg.stopGameplay()
    expect(calls).toEqual(['start', 'stop'])
  })

  it('applies the same mute to midgame interstitials', async () => {
    const { sdk, calls, ad } = makeSdk()
    const cg = await load(sdk)

    cg.startGameplay()
    const p = cg.showMidgameAd()
    ad().adStarted?.()
    cg.stopGameplay()
    expect(calls).toEqual(['start'])

    ad().adFinished?.()
    await p
    expect(calls).toEqual(['start', 'stop'])
  })
})
