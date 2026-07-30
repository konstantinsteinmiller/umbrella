// Modal → pause bridge: opening a blocking modal (Achievements, Battle Pass,
// Unit Codex, Options, …) must freeze the simulation and release it again when
// the LAST modal closes, on every build.
//
// The two properties that matter for the CrazyGames full release:
//   1. the sim really stops, so `gameplayStop()` isn't a lie, and
//   2. audio is NOT muted — menus keep their background music (the mute gate
//      is the sibling `isAudioPaused`, which omits the modal source).
//
// The CG lifecycle half is covered too, via spies on `useCrazyGames` — the real
// wrappers no-op under test because the SDK never loaded, so the spies are the
// only way to see which modals CG would actually hear about.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const { suspendSpy, resumeSpy, startGameplaySpy, stopGameplaySpy } = vi.hoisted(() => ({
  suspendSpy: vi.fn(),
  resumeSpy: vi.fn(),
  startGameplaySpy: vi.fn(),
  stopGameplaySpy: vi.fn()
}))

vi.mock('@/use/useAssets', () => ({
  suspendAllAudio: suspendSpy,
  resumeAllAudio: resumeSpy
}))

vi.mock('@/use/useCrazyGames', () => ({
  startGameplay: startGameplaySpy,
  stopGameplay: stopGameplaySpy
}))

const importAll = async () => {
  vi.resetModules()
  suspendSpy.mockClear()
  resumeSpy.mockClear()
  startGameplaySpy.mockClear()
  stopGameplaySpy.mockClear()
  // Pin the CG gate ON rather than inheriting it from `.env`, so the lifecycle
  // assertions below don't silently turn into no-ops if that default flips.
  vi.doMock('@/use/useMatch', async () => {
    const actual = await vi.importActual<typeof import('@/use/useMatch')>('@/use/useMatch')
    return { ...actual, isCrazyGamesFullRelease: true }
  })
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

  it('reports a normal modal to the CG gameplay lifecycle', async () => {
    const { modalState } = await importAll()

    const release = modalState.acquireModalOpen()
    await nextTick()
    expect(stopGameplaySpy).toHaveBeenCalledTimes(1)
    expect(startGameplaySpy).not.toHaveBeenCalled()

    release()
    await nextTick()
    expect(startGameplaySpy).toHaveBeenCalledTimes(1)
  })

  // The welcome-back claim opens ~1.2s into a returning player's boot. CG QA
  // flagged the resulting stop/start pair — landing right behind the launch
  // gameplayStart, before a single frame of play — as overkill.
  it('stays silent for a modal that opted out, while still freezing the sim', async () => {
    const { gate, modalState } = await importAll()

    const release = modalState.acquireModalOpen({ firesGameplayLifecycle: false })
    await nextTick()
    expect(gate.isGamePaused.value).toBe(true)
    expect(stopGameplaySpy).not.toHaveBeenCalled()

    release()
    await nextTick()
    expect(gate.isGamePaused.value).toBe(false)
    expect(startGameplaySpy).not.toHaveBeenCalled()
  })

  it('still reports a real menu opened on top of an opted-out modal', async () => {
    const { modalState } = await importAll()

    const releaseWelcome = modalState.acquireModalOpen({ firesGameplayLifecycle: false })
    await nextTick()
    expect(stopGameplaySpy).not.toHaveBeenCalled()

    const releaseMenu = modalState.acquireModalOpen() // player taps Options
    await nextTick()
    expect(stopGameplaySpy).toHaveBeenCalledTimes(1)

    releaseWelcome()
    await nextTick()
    expect(startGameplaySpy).not.toHaveBeenCalled() // the menu is still up

    releaseMenu()
    await nextTick()
    expect(startGameplaySpy).toHaveBeenCalledTimes(1)
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
