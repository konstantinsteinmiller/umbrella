// CrazyGames Basic Launch build (`VITE_APP_CRAZY_GAMES_FULL_RELEASE=false`) and
// the CG platform layer's non-ad duties:
//
//   • Basic Launch: CG disables monetization. No `requestAd` may leave the game
//     (rewarded or midgame), every ad placement reads "not ready", and a
//     placement that slips past its gate settles at once — no stuck wait.
//   • `happytime()` is a non-ad call and still fires on the Basic Launch (CG
//     docs name "beating bosses" as its example).
//   • The platform mute drives the ENGINE hard mute only, from `initCrazyGames`
//     on (before the App mounts) — never the persisted volume settings.
//   • Login is tracked separately from the name, follows `addAuthListener`
//     mid-session, and the sign-in prompt swallows CG's ordinary rejections.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SOUND_KEY = 'spinner_user_sound_volume'
const MUSIC_KEY = 'spinner_user_music_volume'

type SettingsListener = (s: { muteAudio?: boolean }) => void
type AuthListener = (u: unknown) => void

const makeSdk = (o: { muted?: boolean; user?: unknown; accounts?: boolean } = {}) => {
  let settingsListener: SettingsListener | null = null
  let authListener: AuthListener | null = null
  const sdk = {
    environment: 'crazygames',
    init: vi.fn(async () => {}),
    game: {
      settings: { muteAudio: o.muted ?? false },
      happytime: vi.fn(),
      gameplayStart: vi.fn(),
      gameplayStop: vi.fn(),
      loadingStart: vi.fn(),
      loadingStop: vi.fn(),
      addSettingsChangeListener: vi.fn((fn: SettingsListener) => { settingsListener = fn })
    },
    user: {
      isUserAccountAvailable: o.accounts ?? true,
      getUser: vi.fn(async () => o.user ?? null),
      addAuthListener: vi.fn((fn: AuthListener) => { authListener = fn }),
      showAuthPrompt: vi.fn(async () => { throw { code: 'userCancelled' } })
    },
    ad: {
      requestAd: vi.fn(),
      hasAdblock: vi.fn(async () => false)
    }
  }
  return {
    sdk,
    setMuted: (m: boolean) => settingsListener?.({ muteAudio: m }),
    auth: (u: unknown) => authListener?.(u)
  }
}

const platformMuteSpy = vi.fn()

const load = async (sdk: unknown) => {
  vi.resetModules()
  vi.doMock('@/use/useGamePauseAudio', async () => {
    const actual = await vi.importActual<typeof import('@/use/useGamePauseAudio')>('@/use/useGamePauseAudio')
    return { ...actual, setPlatformAudioMuted: platformMuteSpy }
  })
  ;(window as unknown as Record<string, unknown>).CrazyGames = { SDK: sdk }
  const cg = await import('@/use/useCrazyGames')
  await cg.initCrazyGames()
  expect(cg.isSdkActive.value).toBe(true)
  return cg
}

beforeEach(() => {
  window.localStorage.clear()
  platformMuteSpy.mockClear()
  vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
  vi.stubEnv('VITE_APP_CRAZY_GAMES_FULL_RELEASE', 'false')
})

afterEach(() => {
  vi.doUnmock('@/use/useGamePauseAudio')
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('Basic Launch — no ads leave the game', () => {
  it('reports every ad format as not ready', async () => {
    const { sdk } = makeSdk()
    await load(sdk)
    const { createCrazyGamesProvider } = await import('@/use/ads/CrazyGamesProvider')
    const p = createCrazyGamesProvider()
    expect(p.isReady.value).toBe(false)
    expect(p.isRewardedReady.value).toBe(false)
    expect(p.isInterstitialReady.value).toBe(false)
  })

  it('settles a stray rewarded / midgame request at once, without calling requestAd', async () => {
    const { sdk } = makeSdk()
    await load(sdk)
    const { createCrazyGamesProvider } = await import('@/use/ads/CrazyGamesProvider')
    const p = createCrazyGamesProvider()
    await expect(p.showRewardedAd()).resolves.toBe(false)
    await expect(p.showMidgameAd()).resolves.toBeUndefined()
    expect(sdk.ad.requestAd).not.toHaveBeenCalled()
  })

  it('still requests ads on the full release (the gate is the flag, not the provider)', async () => {
    vi.stubEnv('VITE_APP_CRAZY_GAMES_FULL_RELEASE', 'true')
    const { sdk } = makeSdk()
    await load(sdk)
    const { createCrazyGamesProvider } = await import('@/use/ads/CrazyGamesProvider')
    const p = createCrazyGamesProvider()
    expect(p.isRewardedReady.value).toBe(true)
    void p.showMidgameAd()
    expect(sdk.ad.requestAd).toHaveBeenCalledWith('midgame', expect.anything())
  })

  it('fires happytime() on the Basic Launch — a non-ad call', async () => {
    const { sdk } = makeSdk()
    const cg = await load(sdk)
    cg.triggerHappytime()
    expect(sdk.game.happytime).toHaveBeenCalledTimes(1)
  })
})

describe('platform mute → engine hard mute only', () => {
  it('applies a muted boot from initCrazyGames, before any component mounts', async () => {
    const { sdk } = makeSdk({ muted: true })
    await load(sdk)
    expect(platformMuteSpy).toHaveBeenCalledWith(true)
  })

  it('follows the toolbar both ways and never writes the persisted volumes', async () => {
    const { setState, flushPersist } = await import('@/use/useEpicState')
    setState(MUSIC_KEY, 0.4)
    setState(SOUND_KEY, 0.5)
    flushPersist()
    const { sdk, setMuted } = makeSdk({ muted: false })
    await load(sdk)
    expect(platformMuteSpy).toHaveBeenLastCalledWith(false)

    setMuted(true)
    expect(platformMuteSpy).toHaveBeenLastCalledWith(true)
    setMuted(false)
    expect(platformMuteSpy).toHaveBeenLastCalledWith(false)

    const state = await import('@/use/useEpicState')
    expect(state.getState(MUSIC_KEY)).toBe(0.4)
    expect(state.getState(SOUND_KEY)).toBe(0.5)
  })
})

describe('account state', () => {
  it('a guest is logged OUT (false, not null); the auth listener opens it mid-session', async () => {
    const { sdk, auth } = makeSdk({ user: null })
    const cg = await load(sdk)
    expect(cg.isCrazyLoggedIn.value).toBe(false)
    expect(cg.isCrazyAccountAvailable.value).toBe(true)

    auth({ username: 'Konsti' })
    expect(cg.isCrazyLoggedIn.value).toBe(true)
    expect(cg.crazyPlayerName.value).toBe('Konsti')

    // Signing out closes the login, but the remembered NAME stays — which is
    // exactly why the gate reads login, never `name !== null`.
    auth(null)
    expect(cg.isCrazyLoggedIn.value).toBe(false)
    expect(cg.crazyPlayerName.value).toBe('Konsti')
  })

  it('a signed-in boot is logged in', async () => {
    const { sdk } = makeSdk({ user: { username: 'Ada' } })
    const cg = await load(sdk)
    expect(cg.isCrazyLoggedIn.value).toBe(true)
  })

  it('the sign-in prompt swallows userCancelled without a console line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sdk } = makeSdk()
    const cg = await load(sdk)
    await expect(cg.requestCrazySignIn()).resolves.toBeUndefined()
    expect(sdk.user.showAuthPrompt).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    warn.mockRestore()
    error.mockRestore()
  })

  it('offers no prompt where CG has no accounts', async () => {
    const { sdk } = makeSdk({ accounts: false })
    const cg = await load(sdk)
    await cg.requestCrazySignIn()
    expect(sdk.user.showAuthPrompt).not.toHaveBeenCalled()
  })
})

describe('main.ts wiring (source)', () => {
  it('installs the leaderboard gate, the sign-in and happytime ONLY in the CG branch, via dynamic import', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf-8')
    const cgBranch = src.slice(src.indexOf('if (isCrazyWeb) {'), src.indexOf('} else if (isWaveDash)'))
    expect(cgBranch).toContain("await import('@/use/useLeaderboard')")
    expect(cgBranch).toContain('setLeaderboardAuthGate(() => cg.isCrazyLoggedIn.value === true)')
    expect(cgBranch).toContain('setBossKillMomentSink(cg.triggerHappytime)')
    // Exactly one call site each — no other portal branch closes its board.
    expect(src.split('setLeaderboardAuthGate(').length - 1).toBe(1)
    expect(src.split('setBossKillMomentSink(').length - 1).toBe(1)
    expect(src).not.toMatch(/^import .*useLeaderboard/m)
  })
})
