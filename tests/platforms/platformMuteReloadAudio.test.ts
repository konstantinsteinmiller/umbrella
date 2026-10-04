// A reload into a MUTED CrazyGames frame must be silent — zero
// HTMLMediaElement.play() for music AND sfx — and must not touch the player's
// saved volumes; when CG unmutes, BOTH legs (music and sfx) start again. The old
// bridge zeroed the saved volumes instead, so after a reload under an unmuted
// frame the game stayed silent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SOUND_KEY = 'spinner_user_sound_volume'
const MUSIC_KEY = 'spinner_user_music_volume'

let playSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(() => { vi.restoreAllMocks() })

const boot = async () => {
  const state = await import('@/use/useEpicState')
  state.setState(MUSIC_KEY, 0.4)
  state.setState(SOUND_KEY, 0.5)
  const audio = await import('@/use/useGamePauseAudio')
  // What `initCrazyGames` does with `settings.muteAudio === true` — BEFORE the
  // App (and its music) mounts.
  audio.setPlatformAudioMuted(true)

  const sound = await import('@/use/useSound')
  const { defineComponent, h } = await import('vue')
  const { mount } = await import('@vue/test-utils')
  let music!: ReturnType<typeof sound.useMusic>
  let sfx!: ReturnType<typeof sound.default>
  mount(defineComponent({
    setup: () => {
      music = sound.useMusic()
      music.initMusic()
      sfx = sound.default()
      return () => h('div')
    }
  }))
  return { state, audio, music, sfx }
}

/** The music element waits for `canplaythrough` before it may start. */
const fireCanPlay = (): void => {
  for (const call of (HTMLMediaElement.prototype.load as unknown as { mock: { contexts: HTMLMediaElement[] } }).mock.contexts) {
    call.dispatchEvent(new Event('canplaythrough'))
  }
}

describe('muted reload under CrazyGames', () => {
  it('plays nothing while muted, leaves the saved volumes alone, and starts both legs on unmute', async () => {
    const { state, audio, music, sfx } = await boot()

    music.startBattleMusic()
    fireCanPlay()
    expect(sfx.playSound('hit')).toBeNull()
    expect(playSpy).not.toHaveBeenCalled()
    expect(state.getState(MUSIC_KEY)).toBe(0.4)
    expect(state.getState(SOUND_KEY)).toBe(0.5)

    audio.setPlatformAudioMuted(false)
    await (await import('vue')).nextTick()
    // Music leg: the guard refused every start while muted; the unmute re-fires it.
    expect(playSpy).toHaveBeenCalledTimes(1)
    // SFX leg: a one-shot plays again.
    expect(sfx.playSound('hit')).not.toBeNull()
    expect(playSpy).toHaveBeenCalledTimes(2)
    expect(state.getState(MUSIC_KEY)).toBe(0.4)
    expect(state.getState(SOUND_KEY)).toBe(0.5)
  })
})
