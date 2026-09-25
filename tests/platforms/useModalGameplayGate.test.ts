// Modal → pause bridge: opening a blocking modal (Achievements, Battle Pass,
// Unit Codex, Options, …) must freeze the simulation and release it again when
// the LAST modal closes, on every build.
//
// The two properties that matter:
//   1. the sim really stops, so the portals' `gameplayStop()` isn't a lie, and
//   2. audio is NOT muted — menus keep their background music (the mute gate
//      is the sibling `isAudioPaused`, which omits the modal source).
//
// The gameplayStop / gameplayStart a menu causes is the gameplay bracket's
// (`usePortalGameplay`) — see `portalGameplayBracket.test.ts`.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const { suspendSpy, resumeSpy } = vi.hoisted(() => ({
  suspendSpy: vi.fn(),
  resumeSpy: vi.fn()
}))

vi.mock('@/use/useAssets', () => ({
  suspendAllAudio: suspendSpy,
  resumeAllAudio: resumeSpy
}))

const importAll = async () => {
  vi.resetModules()
  suspendSpy.mockClear()
  resumeSpy.mockClear()
  const gate = await import('@/use/useGamePause')
  const modalState = await import('@/use/useModalState')
  const audio = await import('@/use/useGamePauseAudio')
  const modalGate = await import('@/use/useModalGameplayGate')
  audio.installGamePauseAudio()
  modalGate.installModalGameplayGate()
  return { gate, modalState, modalGate }
}

describe('useModalGameplayGate — modal freezes the sim, keeps the music', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('pauses the sim on modal open and resumes on close', async () => {
    const { gate, modalState, modalGate } = await importAll()
    expect(gate.isGamePaused.value).toBe(false)

    const release = modalState.acquireModalOpen()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(true)
    expect(modalGate.__isModalPauseHeld()).toBe(true)
    expect(gate.getActivePauseReasons()).toContain('modal')

    release()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(false)
    expect(modalGate.__isModalPauseHeld()).toBe(false)
  })

  it('never mutes audio for a modal (music keeps playing in menus)', async () => {
    const { gate, modalState } = await importAll()

    const release = modalState.acquireModalOpen()
    await nextTick()
    expect(gate.isAudioPaused.value).toBe(false)
    expect(suspendSpy).not.toHaveBeenCalled()
    expect(gate.getActiveAudioPauseReasons()).not.toContain('modal')

    release()
    await nextTick()
    expect(resumeSpy).not.toHaveBeenCalled()
  })

  it('stacked modals compose — the sim resumes only after the LAST one closes', async () => {
    const { gate, modalState } = await importAll()

    const releaseA = modalState.acquireModalOpen()
    const releaseB = modalState.acquireModalOpen()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(true)

    releaseA()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(true) // B still open

    releaseB()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(false)
  })

  it('holds the pause across an ad that starts and ends while a modal is open', async () => {
    // A rewarded ad fired from inside a menu (AdRewardButton in Battle Pass /
    // Epic Upgrades): the ad mutes and the modal keeps the sim frozen after it.
    const { gate, modalState } = await importAll()

    const release = modalState.acquireModalOpen()
    await nextTick()

    gate.isAdShowing.value = true
    expect(gate.isAudioPaused.value).toBe(true)
    expect(suspendSpy).toHaveBeenCalledTimes(1)

    gate.isAdShowing.value = false
    expect(gate.isAudioPaused.value).toBe(false) // unmuted after the ad
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(gate.isGamePaused.value).toBe(true)   // still frozen behind the menu

    release()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(false)
  })

  it('is idempotent — a second install does not double-acquire the pause', async () => {
    const { gate, modalState, modalGate } = await importAll()
    modalGate.installModalGameplayGate() // already installed by importAll

    const release = modalState.acquireModalOpen()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(true)

    release()
    await nextTick()
    // A doubled watcher would have taken two app-pause refs and released one.
    expect(gate.isGamePaused.value).toBe(false)
  })
})
