// CrazyGames gameplay lifecycle around the battle's own breaks: a cleared wave
// and an overrun both stop gameplay, and the next `waveStart` resumes it —
// but ONLY when this module is what stopped it ("was it paused before").
//
// `.env` ships VITE_APP_CRAZY_GAMES_FULL_RELEASE=true, so the gate is live
// under vitest; the real `startGameplay` / `stopGameplay` no-op because no SDK
// loaded, hence the spies.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { startSpy, stopSpy } = vi.hoisted(() => ({
  startSpy: vi.fn(),
  stopSpy: vi.fn()
}))

vi.mock('@/use/useCrazyGames', () => ({
  startGameplay: startSpy,
  stopGameplay: stopSpy
}))

const importAll = async () => {
  vi.resetModules()
  startSpy.mockClear()
  stopSpy.mockClear()
  vi.doMock('@/use/useMatch', async () => {
    const actual = await vi.importActual<typeof import('@/use/useMatch')>('@/use/useMatch')
    return { ...actual, isCrazyGamesFullRelease: true }
  })
  const wave = await import('@/use/useCrazyWaveGameplay')
  const modalState = await import('@/use/useModalState')
  const pause = await import('@/use/useGamePause')
  return { wave, modalState, pause }
}

beforeEach(() => { window.localStorage.clear() })

describe('useCrazyWaveGameplay', () => {
  it('stops on a cleared wave and resumes once the next wave starts', async () => {
    const { wave } = await importAll()

    wave.stopGameplayForWaveBreak()
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(startSpy).not.toHaveBeenCalled()

    wave.resumeGameplayAfterWaveBreak()
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(wave.__isStoppedForWaveBreak()).toBe(false)
  })

  it('stops on an overrun the same way', async () => {
    const { wave } = await importAll()

    wave.stopGameplayForWaveBreak() // engine emitted 'overrun'
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(wave.__isStoppedForWaveBreak()).toBe(true)
  })

  it('never resumes a stop it did not issue', async () => {
    const { wave } = await importAll()

    // waveStart with no preceding break (first wave of the session).
    wave.resumeGameplayAfterWaveBreak()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('does not stack a second stop while a break is already held', async () => {
    const { wave } = await importAll()

    wave.stopGameplayForWaveBreak()
    wave.stopGameplayForWaveBreak() // e.g. overrun landing on a cleared break
    expect(stopSpy).toHaveBeenCalledTimes(1)

    wave.resumeGameplayAfterWaveBreak()
    expect(startSpy).toHaveBeenCalledTimes(1) // one resume, not two
  })

  it('cycles cleanly across several waves', async () => {
    const { wave } = await importAll()

    for (let i = 0; i < 3; i++) {
      wave.stopGameplayForWaveBreak()
      wave.resumeGameplayAfterWaveBreak()
    }
    expect(stopSpy).toHaveBeenCalledTimes(3)
    expect(startSpy).toHaveBeenCalledTimes(3)
  })

  it('yields to a modal that owns the stopped state, and re-arms for the next break', async () => {
    const { wave, modalState } = await importAll()

    wave.stopGameplayForWaveBreak()
    const releaseModal = modalState.acquireModalOpen()

    // The modal gate will call startGameplay() itself on close — declaring the
    // player back in a match from here would be a lie.
    wave.resumeGameplayAfterWaveBreak()
    expect(startSpy).not.toHaveBeenCalled()
    // Hold released regardless, so the NEXT wave break can still take one.
    expect(wave.__isStoppedForWaveBreak()).toBe(false)
    releaseModal()

    wave.stopGameplayForWaveBreak()
    expect(stopSpy).toHaveBeenCalledTimes(2)
  })

  it('yields to an on-screen ad', async () => {
    const { wave, pause } = await importAll()

    wave.stopGameplayForWaveBreak()
    pause.isAdShowing.value = true
    wave.resumeGameplayAfterWaveBreak()
    expect(startSpy).not.toHaveBeenCalled()
    pause.isAdShowing.value = false
  })
})

describe('useCrazyWaveGameplay off the CrazyGames full release', () => {
  it('is inert', async () => {
    vi.resetModules()
    startSpy.mockClear()
    stopSpy.mockClear()
    vi.doMock('@/use/useMatch', async () => {
      const actual = await vi.importActual<typeof import('@/use/useMatch')>('@/use/useMatch')
      return { ...actual, isCrazyGamesFullRelease: false }
    })
    const wave = await import('@/use/useCrazyWaveGameplay')

    wave.stopGameplayForWaveBreak()
    wave.resumeGameplayAfterWaveBreak()
    expect(stopSpy).not.toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()
  })
})
