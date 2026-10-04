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
  const mountBridge = async () => {
    vi.resetModules()
    const platformMuteSpy = vi.fn()
    const settingSpy = vi.fn()
    let sdkListener: ((muted: boolean) => void) | null = null

    vi.doMock('@/use/useCrazyGames', async () => {
      const { ref } = await import('vue')
      return {
        isSdkActive: ref(true),
        onCrazyMuteChange: (fn: (m: boolean) => void) => { sdkListener = fn; return () => {} }
      }
    })
    vi.doMock('@/use/useGamePauseAudio', () => ({ setPlatformAudioMuted: platformMuteSpy }))
    vi.doMock('@/use/useUser', async () => {
      const actual = await vi.importActual<typeof import('@/use/useUser')>('@/use/useUser')
      return {
        ...actual,
        default: () => ({ ...actual.default(), setSettingValue: settingSpy })
      }
    })

    const { useCrazyMuteSync } = await import('@/use/useCrazyMuteSync')
    const { defineComponent, h } = await import('vue')
    const { mount } = await import('@vue/test-utils')
    mount(defineComponent({ setup: () => { useCrazyMuteSync(); return () => h('div') } }))

    return { platformMuteSpy, settingSpy, fire: (m: boolean) => sdkListener?.(m) }
  }

  it('hard-mutes when the CG toolbar mutes, and lifts it on unmute', async () => {
    const { platformMuteSpy, fire } = await mountBridge()

    fire(true)
    expect(platformMuteSpy).toHaveBeenCalledWith(true)

    fire(false)
    expect(platformMuteSpy).toHaveBeenLastCalledWith(false)
  })

  it('never touches the persisted volume settings', async () => {
    const { settingSpy, fire } = await mountBridge()
    fire(true)
    fire(false)
    fire(true)
    expect(settingSpy).not.toHaveBeenCalled()
  })
})
