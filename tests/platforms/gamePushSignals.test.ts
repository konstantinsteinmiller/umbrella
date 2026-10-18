// GamePush's graded portal signals: PAUSE, MUTE, LANGUAGE, ADS, gameplay
// bracket. Imports the REAL plugin by relative path (the `@/utils/gamePushPlugin`
// alias points at the no-op stub on non-GamePush test builds).
//
// Playbook traps pinned here:
//   • mute is NOT pause (a graded Playgama rejection) and the INITIAL mute
//     state is read (events only fire on change);
//   • rewarded resolves true ONLY on SDK success, and is refused outright when
//     the SDK reports no inventory (rewarded readiness gating);
//   • the interstitial reports its real open via onImpression;
//   • every ad wrapper force-resumes (a no-fill can skip the SDK's resume);
//   • gameplayStart/Stop are idempotent and balanced.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { muteSpy } = vi.hoisted(() => ({ muteSpy: vi.fn() }))

vi.mock('@/use/useGamePauseAudio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/use/useGamePauseAudio')>()
  return { ...actual, setPlatformAudioMuted: muteSpy }
})

vi.mock('@/use/useUser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/use/useUser')>()
  return { ...actual, isGamePush: true }
})

type Handler = (...a: unknown[]) => void

const makeGp = (over: Record<string, unknown> = {}) => {
  const gpHandlers = new Map<string, Handler[]>()
  const adHandlers = new Map<string, Handler[]>()
  const soundHandlers = new Map<string, Handler[]>()
  const reg = (m: Map<string, Handler[]>) => (ev: string, cb: Handler) => {
    m.set(ev, [...(m.get(ev) ?? []), cb])
  }
  const fire = (m: Map<string, Handler[]>, ev: string, ...a: unknown[]) =>
    (m.get(ev) ?? []).forEach((cb) => cb(...a))
  const gp: any = {
    language: 'de',
    isPaused: false,
    gameStart: vi.fn(),
    gameplayStart: vi.fn(),
    gameplayStop: vi.fn(),
    on: reg(gpHandlers),
    player: { ready: Promise.resolve() },
    sounds: { isMuted: false, isSFXMuted: false, isMusicMuted: false, on: reg(soundHandlers) },
    ads: {
      isAdblockEnabled: false,
      isRewardedAvailable: true,
      isFullscreenAvailable: true,
      showRewardedVideo: vi.fn(async () => true),
      showFullscreen: vi.fn(async () => true),
      on: reg(adHandlers)
    },
    ...over
  }
  return { gp, fireGp: (e: string) => fire(gpHandlers, e), fireSound: (e: string) => fire(soundHandlers, e), fireAd: (e: string) => fire(adHandlers, e) }
}

const load = async (gp: unknown) => {
  vi.resetModules()
  ;(window as any).gp = gp
  const plugin = await import('../../src/utils/gamePushPlugin')
  const pause = await import('@/use/useGamePause')
  await plugin.gamePushPlugin()
  return { plugin, pause }
}

describe('gamePushPlugin', () => {
  beforeEach(() => { muteSpy.mockClear() })
  afterEach(() => { delete (window as any).gp; vi.useRealTimers() })

  it('builds the loader URL from project id + PUBLIC token, null when unset', async () => {
    const { buildGamePushSrc } = await import('../../src/utils/gamePushPlugin')
    expect(buildGamePushSrc('123', 'tok')).toBe('https://gamepush.com/sdk/gamepush.js?projectId=123&publicToken=tok&callback=onGPInit')
    expect(buildGamePushSrc('', 'tok')).toBeNull()
    expect(buildGamePushSrc('123', undefined)).toBeNull()
  })

  it('init publishes locale (2-letter) and activates the SDK', async () => {
    const { gp } = makeGp({ language: 'DE-at' })
    const { plugin } = await load(gp)
    expect(plugin.isGamePushSdkActive.value).toBe(true)
    expect(plugin.gamePushLocale.value).toBe('de')
  })

  it('pause/resume events drive the platform pause gate', async () => {
    const h = makeGp()
    const { pause } = await load(h.gp)
    h.fireGp('pause')
    expect(pause.isPlatformPaused.value).toBe(true)
    h.fireGp('resume')
    expect(pause.isPlatformPaused.value).toBe(false)
  })

  it('reads the INITIAL mute state and follows mute/unmute without pausing', async () => {
    const h = makeGp()
    h.gp.sounds.isMuted = true
    const { pause } = await load(h.gp)
    expect(muteSpy).toHaveBeenLastCalledWith(true)
    h.gp.sounds.isMuted = false
    h.fireSound('unmute')
    expect(muteSpy).toHaveBeenLastCalledWith(false)
    h.gp.sounds.isMuted = true
    h.fireSound('mute')
    expect(muteSpy).toHaveBeenLastCalledWith(true)
    expect(pause.isPlatformPaused.value).toBe(false)
  })

  it('SFX + music both muted counts as muted; one alone does not', async () => {
    const h = makeGp()
    await load(h.gp)
    h.gp.sounds.isSFXMuted = true
    h.fireSound('mute:sfx')
    expect(muteSpy).toHaveBeenLastCalledWith(false)
    h.gp.sounds.isMusicMuted = true
    h.fireSound('mute:music')
    expect(muteSpy).toHaveBeenLastCalledWith(true)
  })

  it('rewarded: true only on SDK success; false on skip', async () => {
    const h = makeGp()
    const { plugin } = await load(h.gp)
    expect(await plugin.showRewardedGP()).toBe(true)
    h.gp.ads.showRewardedVideo.mockResolvedValueOnce(false)
    expect(await plugin.showRewardedGP()).toBe(false)
    h.gp.ads.showRewardedVideo.mockRejectedValueOnce(new Error('x'))
    expect(await plugin.showRewardedGP()).toBe(false)
  })

  it('rewarded is refused (SDK never called) when no inventory is reported', async () => {
    const h = makeGp()
    h.gp.ads.isRewardedAvailable = false
    const { plugin } = await load(h.gp)
    expect(plugin.isGamePushRewardedAvailable.value).toBe(false)
    expect(await plugin.showRewardedGP()).toBe(false)
    expect(h.gp.ads.showRewardedVideo).not.toHaveBeenCalled()
  })

  it('availability refs follow the SDK after an ad event', async () => {
    const h = makeGp()
    const { plugin } = await load(h.gp)
    h.gp.ads.isRewardedAvailable = false
    h.fireAd('rewarded:close')
    expect(plugin.isGamePushRewardedAvailable.value).toBe(false)
  })

  it('ad-blocker flag flips the blocked ref', async () => {
    const h = makeGp()
    h.gp.ads.isAdblockEnabled = true
    const { plugin } = await load(h.gp)
    expect(plugin.isGamePushAdsBlocked.value).toBe(true)
  })

  it('interstitial: onImpression fires on fullscreen:start, and a final resume is forced', async () => {
    const h = makeGp()
    const { plugin, pause } = await load(h.gp)
    const impression = vi.fn()
    h.gp.ads.showFullscreen.mockImplementation(async () => {
      h.fireGp('pause') // SDK pauses for the ad, then never resumes (no-fill)
      h.fireAd('fullscreen:start')
      return true
    })
    await plugin.showMidgameGP(impression)
    expect(impression).toHaveBeenCalledTimes(1)
    expect(pause.isPlatformPaused.value).toBe(false)
  })

  it('interstitial is skipped when no fullscreen inventory', async () => {
    const h = makeGp()
    h.gp.ads.isFullscreenAvailable = false
    const { plugin } = await load(h.gp)
    await plugin.showMidgameGP()
    expect(h.gp.ads.showFullscreen).not.toHaveBeenCalled()
  })

  it('gameStart / gameplayStart / gameplayStop are idempotent and balanced', async () => {
    const h = makeGp()
    const { plugin } = await load(h.gp)
    plugin.gamePushGameStart(); plugin.gamePushGameStart()
    expect(h.gp.gameStart).toHaveBeenCalledTimes(1)
    plugin.gamePushGameplayStop()
    expect(h.gp.gameplayStop).not.toHaveBeenCalled()
    plugin.gamePushGameplayStart(); plugin.gamePushGameplayStart()
    expect(h.gp.gameplayStart).toHaveBeenCalledTimes(1)
    plugin.gamePushGameplayStop(); plugin.gamePushGameplayStop()
    expect(h.gp.gameplayStop).toHaveBeenCalledTimes(1)
  })

  it('missing project id/token: init resolves, SDK stays inactive, nothing throws', async () => {
    vi.resetModules()
    delete (window as any).gp
    const plugin = await import('../../src/utils/gamePushPlugin')
    await expect(plugin.gamePushPlugin()).resolves.toBeUndefined()
    expect(plugin.isGamePushSdkActive.value).toBe(false)
    expect(await plugin.showRewardedGP()).toBe(false)
  })
})
