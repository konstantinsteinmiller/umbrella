// A platform mute (the CrazyGames toolbar toggle, GamePix `soundOff`) must
// silence the engine REGARDLESS of the in-game sound settings — CG QA turns the
// in-game volume back up while the portal says muted and expects silence.
//
// Zeroing the stored volumes (what `useCrazyMuteSync` does so the in-game mute
// button reflects the platform) cannot deliver that on its own: the player can
// just drag the slider back. The guarantee lives in `setPlatformAudioMuted`,
// which suspends the whole audio layer.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { suspendSpy, resumeSpy, killOneShotSpy } = vi.hoisted(() => ({
  suspendSpy: vi.fn(),
  resumeSpy: vi.fn(),
  killOneShotSpy: vi.fn()
}))

vi.mock('@/use/useAssets', () => ({
  suspendAllAudio: suspendSpy,
  resumeAllAudio: resumeSpy,
  killOneShotSfx: killOneShotSpy
}))

const importAudio = async () => {
  vi.resetModules()
  suspendSpy.mockClear()
  resumeSpy.mockClear()
  killOneShotSpy.mockClear()
  return import('@/use/useGamePauseAudio')
}

beforeEach(() => { window.localStorage.clear() })

describe('setPlatformAudioMuted — hard mute that outranks in-game settings', () => {
  it('suspends the audio layer and kills in-flight one-shots on mute', async () => {
    const audio = await importAudio()

    audio.setPlatformAudioMuted(true)
    expect(suspendSpy).toHaveBeenCalledTimes(1)
    // Suspend only FREEZES Web Audio sources — without this they thaw and tail
    // on unmute, so "muted" would not mean "nothing pending".
    expect(killOneShotSpy).toHaveBeenCalledTimes(1)
    expect(audio.isPlatformAudioMuted.value).toBe(true)
    expect(audio.__isPlatformAudioMuted()).toBe(true)
  })

  it('resumes on unmute and exposes the state reactively for the music guard', async () => {
    const audio = await importAudio()

    audio.setPlatformAudioMuted(true)
    audio.setPlatformAudioMuted(false)
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(audio.isPlatformAudioMuted.value).toBe(false)
  })

  it('is edge-triggered — a duplicated SDK event cannot drift the suspend count', async () => {
    const audio = await importAudio()

    audio.setPlatformAudioMuted(true)
    audio.setPlatformAudioMuted(true)
    expect(suspendSpy).toHaveBeenCalledTimes(1)

    audio.setPlatformAudioMuted(false)
    audio.setPlatformAudioMuted(false)
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    // A drifted counter here would strand the game silent for the session.
    expect(audio.isPlatformAudioMuted.value).toBe(false)
  })

  it('holds its own slot independent of the pause gate, so an ad during a mute still unwinds to muted', async () => {
    const audio = await importAudio()
    const gate = await import('@/use/useGamePause')
    audio.installGamePauseAudio()
    suspendSpy.mockClear()
    resumeSpy.mockClear()

    audio.setPlatformAudioMuted(true) // portal mute
    gate.isAdShowing.value = true     // ad opens on top of it
    expect(suspendSpy).toHaveBeenCalledTimes(2)

    gate.isAdShowing.value = false    // ad closes — the portal mute must survive
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(audio.isPlatformAudioMuted.value).toBe(true)
  })
})

describe('CrazyGames mute bridge → hard mute', () => {
  /** Mount `useCrazyMuteSync` with a controllable SDK, and hand back the
   *  listener it subscribed so the test can fire a platform mute event. */
  const mountBridge = async (dbReady: boolean) => {
    vi.resetModules()
    const platformMuteSpy = vi.fn()
    let sdkListener: ((muted: boolean) => void) | null = null

    vi.doMock('@/use/useMatch', async () => {
      const actual = await vi.importActual<typeof import('@/use/useMatch')>('@/use/useMatch')
      const { ref } = await import('vue')
      return { ...actual, isDbInitialized: ref(dbReady) }
    })
    vi.doMock('@/use/useCrazyGames', async () => {
      const { ref } = await import('vue')
      return {
        isSdkActive: ref(true),
        setCrazyMuted: vi.fn(),
        onCrazyMuteChange: (fn: (m: boolean) => void) => { sdkListener = fn; return () => {} }
      }
    })
    vi.doMock('@/use/useGamePauseAudio', () => ({ setPlatformAudioMuted: platformMuteSpy }))

    const { useCrazyMuteSync } = await import('@/use/useCrazyMuteSync')
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    mount(defineComponent({ setup: () => { useCrazyMuteSync(); return () => h('div') } }))

    return { platformMuteSpy, fire: (m: boolean) => sdkListener?.(m) }
  }

  it('hard-mutes when the CG toolbar mutes', async () => {
    const { platformMuteSpy, fire } = await mountBridge(true)

    fire(true)
    expect(platformMuteSpy).toHaveBeenCalledWith(true)

    fire(false)
    expect(platformMuteSpy).toHaveBeenLastCalledWith(false)
  })

  it('hard-mutes even before IndexedDB has hydrated the volume settings', async () => {
    // The volume-zeroing half defers on `isDbInitialized` so it doesn't fight
    // the settings loader. The hard mute touches no saved state, so it must NOT
    // wait — a game booting into a muted CG frame is silent from frame one,
    // not from whenever hydration lands.
    const { platformMuteSpy, fire } = await mountBridge(false)

    fire(true)
    expect(platformMuteSpy).toHaveBeenCalledWith(true)
  })
})
