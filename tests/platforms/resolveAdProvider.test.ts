// Characterization tests for the ad-provider resolver.
//
// Branches now key off `import.meta.env.VITE_APP_*` literals (so Rollup
// can dead-code-eliminate the unused ad providers from each build's
// bundle) instead of the `flags` parameter — see the file header on
// `src/platforms/resolveAdProvider.ts` for why.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformFlags } from '@/platforms/capabilities'

const allOff: PlatformFlags = {
  isCrazyWeb: false,
  isWaveDash: false,
  isItch: false,
  isGlitch: false,
  isGameDistribution: false,
  isGameMonetize: false
}

const ALL_ENVS = ['VITE_APP_CRAZY_WEB', 'VITE_APP_GAME_DISTRIBUTION', 'VITE_APP_GAME_MONETIZE', 'VITE_APP_YANDEX', 'VITE_APP_POKI', 'VITE_APP_GAMEPUSH', 'VITE_APP_NATIVE'] as const

const clearEnv = () => {
  for (const k of ALL_ENVS) vi.stubEnv(k, '')
}

const loadResolver = async () => {
  vi.resetModules()
  const mod = await import('@/platforms/resolveAdProvider')
  return mod.resolveAdProvider
}

describe('resolveAdProvider', () => {
  beforeEach(clearEnv)
  afterEach(() => vi.unstubAllEnvs())

  it('returns Noop when no env flag is set', async () => {
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('noop')
  })

  it('returns CrazyGames when VITE_APP_CRAZY_WEB env is set', async () => {
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isCrazyWeb: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('crazygames')
  })

  it('returns GameDistribution when VITE_APP_GAME_DISTRIBUTION env is set', async () => {
    vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isGameDistribution: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('gameDistribution')
  })

  it('returns GameMonetize when VITE_APP_GAME_MONETIZE env is set', async () => {
    vi.stubEnv('VITE_APP_GAME_MONETIZE', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isGameMonetize: true },
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('gamemonetize')
  })

  it('returns Yandex when VITE_APP_YANDEX env is set', async () => {
    vi.stubEnv('VITE_APP_YANDEX', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isYandex: true } as any,
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('yandex')
  })

  it('returns GamePush when VITE_APP_GAMEPUSH env is set', async () => {
    vi.stubEnv('VITE_APP_GAMEPUSH', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isGamePush: true } as any,
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('gamepush')
    // Mute is deferred to the SDK's real `fullscreen:start`.
    expect(provider.managesMidgameAudio).toBe(true)
    // Not ready until the SDK reports inventory: rewarded offers stay hidden.
    expect(provider.isRewardedReady.value).toBe(false)
    expect(provider.isInterstitialReady.value).toBe(false)
  })

  it('returns Poki when VITE_APP_POKI env is set', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: { ...allOff, isPoki: true } as any,
      showMediatorAds: false,
      isNative: false
    })
    expect(provider.name).toBe('poki')
    // `commercialBreak(onStart)` only fires `onStart` when a video genuinely
    // opens, so the mute has to be deferred to that edge — otherwise a no-fill
    // cuts the result-screen stinger for an ad the player never saw.
    expect(provider.managesMidgameAudio).toBe(true)
    // `PokiSDK.isAdBlocked()` is hardcoded `() => false` in the shipped v2 core,
    // so the shared AdsBlockedModal can never fire here, and there is no
    // platform popup for it to stack with either.
    expect(provider.isAdsBlocked.value).toBe(false)
    expect(provider.ownsAdBlockUi).toBeUndefined()
  })

  it('returns Noop when showMediatorAds is true but isNative is false (web build)', async () => {
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: true,
      isNative: false
    })
    expect(provider.name).toBe('noop')
  })

  it('returns Noop when isNative is true but showMediatorAds is false (no mediation)', async () => {
    const resolveAdProvider = await loadResolver()
    const provider = resolveAdProvider({
      flags: allOff,
      showMediatorAds: false,
      isNative: true
    })
    expect(provider.name).toBe('noop')
  })

  it('returns Noop on Glitch / itch / wavedash (no ad backend)', async () => {
    const resolveAdProvider = await loadResolver()
    for (const flag of ['isGlitch', 'isItch', 'isWaveDash'] as const) {
      const provider = resolveAdProvider({
        flags: { ...allOff, [flag]: true },
        showMediatorAds: false,
        isNative: false
      })
      expect(provider.name, flag).toBe('noop')
    }
  })

  describe('priority ordering matches useAds.ts', () => {
    it('isCrazyWeb wins over isGameDistribution when both env flags are set', async () => {
      vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
      vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
      const resolveAdProvider = await loadResolver()
      const provider = resolveAdProvider({
        flags: { ...allOff, isCrazyWeb: true, isGameDistribution: true },
        showMediatorAds: false,
        isNative: false
      })
      expect(provider.name).toBe('crazygames')
    })

  })
})
