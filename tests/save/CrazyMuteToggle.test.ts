import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── FMuteButton (toggleMute) — "can't unmute on CG" regression ─────────────
//
// The CrazyGames mute is volume-based: muted ⇔ music===0 && sound===0. The
// platform-sync `applyMute(false)` deliberately no-ops when there's no
// pre-mute snapshot (so a passive platform sync can't clobber a deliberate
// cloud-saved 0/0). But that left the in-game button unable to unmute a game
// that BOOTED already-muted (cloud save 0/0, or CrazyGames reported muted
// while volumes were already 0/0) — there was never a snapshot to restore, so
// every tap was a no-op and the game stayed muted forever.
//
// The fix: an explicit user tap always restores audible volumes — the
// snapshot if present, else the install defaults.

const SOUND_KEY = 'spinner_user_sound_volume'
const MUSIC_KEY = 'spinner_user_music_volume'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useCrazyMuteSync.toggleMute', () => {
  it('unmutes a game that booted muted with NO snapshot (the reported CG bug)', async () => {
    // Seed maw_state with a saved 0/0 BEFORE useUser reads its volumes.
    const { setState } = await import('@/use/useEpicState')
    setState(MUSIC_KEY, 0)
    setState(SOUND_KEY, 0)

    const { isMuted, toggleMute } = await import('@/use/useCrazyMuteSync')
    const { DEFAULT_MUSIC_VOLUME, DEFAULT_SOUND_VOLUME } = await import('@/use/useUser')
    expect(isMuted.value).toBe(true) // booted muted, no snapshot

    toggleMute()

    expect(isMuted.value).toBe(false) // the button actually unmutes now
    const { getState } = await import('@/use/useEpicState')
    expect(getState(MUSIC_KEY)).toBe(DEFAULT_MUSIC_VOLUME)
    expect(getState(SOUND_KEY)).toBe(DEFAULT_SOUND_VOLUME)
  })

  it('a CG toolbar mute never writes the persisted volumes (reload under an unmuted CG is not silent)', async () => {
    // The old bridge zeroed the stored volumes on a CG mute. They persist —
    // cloud save included — so a reload under an UNMUTED CG frame came back at
    // sliders 0/0 and stayed silent. The platform mute is the engine's hard
    // mute only; the player's own settings are theirs.
    const { setState, getState } = await import('@/use/useEpicState')
    setState(MUSIC_KEY, 0.4)
    setState(SOUND_KEY, 0.5)
    const audio = await import('@/use/useGamePauseAudio')
    const { isMuted, applyPlatformMute } = await import('@/use/useCrazyMuteSync')

    applyPlatformMute(true)
    expect(audio.isPlatformAudioMuted.value).toBe(true)  // engine is silent…
    expect(getState(MUSIC_KEY)).toBe(0.4)               // …the settings are not touched
    expect(getState(SOUND_KEY)).toBe(0.5)
    expect(isMuted.value).toBe(false)                   // the in-game mute is the player's

    applyPlatformMute(false)
    expect(audio.isPlatformAudioMuted.value).toBe(false)
    expect(getState(MUSIC_KEY)).toBe(0.4)
    expect(getState(SOUND_KEY)).toBe(0.5)
  })

  it('the in-game button cannot lift a CG mute — the platform outranks it', async () => {
    const audio = await import('@/use/useGamePauseAudio')
    const { isMuted, toggleMute, applyPlatformMute } = await import('@/use/useCrazyMuteSync')
    applyPlatformMute(true)
    toggleMute() // in-game mute
    toggleMute() // in-game unmute
    expect(isMuted.value).toBe(false)
    expect(audio.isPlatformAudioMuted.value).toBe(true)
    applyPlatformMute(false)
  })

  it('mute → unmute restores the exact prior volumes via the snapshot', async () => {
    const { setState, getState } = await import('@/use/useEpicState')
    setState(MUSIC_KEY, 0.4)
    setState(SOUND_KEY, 0.5)

    const { isMuted, toggleMute } = await import('@/use/useCrazyMuteSync')
    expect(isMuted.value).toBe(false)

    toggleMute() // mute — snapshots 0.4 / 0.5
    expect(isMuted.value).toBe(true)
    expect(getState(MUSIC_KEY)).toBe(0)

    toggleMute() // unmute — restores the snapshot, not the defaults
    expect(isMuted.value).toBe(false)
    expect(getState(MUSIC_KEY)).toBe(0.4)
    expect(getState(SOUND_KEY)).toBe(0.5)
  })
})
