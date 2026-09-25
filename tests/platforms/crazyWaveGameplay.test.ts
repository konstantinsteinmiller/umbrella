// The run-break input of the gameplay bracket: a lost run (breach / daily over)
// closes every portal's bracket, and the player's way back into a run reopens
// it — but a resume never reports the player back while a menu or an ad still
// holds gameplay stopped, and nothing is ever reported twice.
//
// The module only sets one input of `usePortalGameplay`; the bracket makes the
// SDK calls. The CrazyGames wrappers are spied (the real ones no-op without an
// SDK); the bracket is live and touched before each case, as in a real session.

import { afterEach, describe, expect, it, vi } from 'vitest'

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }))

vi.mock('@/use/useCrazyGames', () => ({
  startGameplay: () => calls.push('start'),
  stopGameplay: () => calls.push('stop')
}))

const importAll = async (fullRelease = true) => {
  vi.resetModules()
  calls.length = 0
  vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
  vi.stubEnv('VITE_APP_CRAZY_GAMES_FULL_RELEASE', fullRelease ? 'true' : 'false')
  const gameplay = await import('@/use/usePortalGameplay')
  const wave = await import('@/use/useCrazyWaveGameplay')
  const modalState = await import('@/use/useModalState')
  const pause = await import('@/use/useGamePause')
  gameplay.installPortalGameplayBracket()
  gameplay.notifyPortalGameLive()
  gameplay.notePlayerInteraction()
  calls.length = 0 // the opening start is the bracket's business, not this module's
  return { wave, modalState, pause }
}

afterEach(() => { vi.unstubAllEnvs() })

describe('useCrazyWaveGameplay → the bracket', () => {
  it('stops on a lost run and resumes once the player is back in one', async () => {
    const { wave } = await importAll()

    wave.stopGameplayForWaveBreak()
    expect(calls).toEqual(['stop'])
    expect(wave.__isStoppedForWaveBreak()).toBe(true)

    wave.resumeGameplayAfterWaveBreak()
    expect(calls).toEqual(['stop', 'start'])
    expect(wave.__isStoppedForWaveBreak()).toBe(false)
  })

  it('a resume with no break behind it is a no-op (every shot calls it)', async () => {
    const { wave } = await importAll()

    wave.resumeGameplayAfterWaveBreak()
    expect(calls).toEqual([])
  })

  it('does not stack a second stop, nor a second start', async () => {
    const { wave } = await importAll()

    wave.stopGameplayForWaveBreak()
    wave.stopGameplayForWaveBreak()
    wave.resumeGameplayAfterWaveBreak()
    wave.resumeGameplayAfterWaveBreak()
    expect(calls).toEqual(['stop', 'start'])
  })

  it('cycles cleanly across several runs', async () => {
    const { wave } = await importAll()

    for (let i = 0; i < 3; i++) {
      wave.stopGameplayForWaveBreak()
      wave.resumeGameplayAfterWaveBreak()
    }
    expect(calls).toEqual(['stop', 'start', 'stop', 'start', 'stop', 'start'])
  })

  it('yields to a menu that still holds the bracket closed, and re-arms for the next break', async () => {
    const { wave, modalState } = await importAll()

    wave.stopGameplayForWaveBreak()
    const releaseModal = modalState.acquireModalOpen()
    wave.resumeGameplayAfterWaveBreak()
    expect(calls).toEqual(['stop']) // the menu is still up
    expect(wave.__isStoppedForWaveBreak()).toBe(false)

    releaseModal()
    expect(calls).toEqual(['stop', 'start'])

    wave.stopGameplayForWaveBreak()
    expect(calls).toEqual(['stop', 'start', 'stop'])
  })

  it('yields to an on-screen ad', async () => {
    const { wave, pause } = await importAll()

    wave.stopGameplayForWaveBreak()
    pause.isAdShowing.value = true
    wave.resumeGameplayAfterWaveBreak()
    expect(calls).toEqual(['stop'])

    pause.isAdShowing.value = false
    expect(calls).toEqual(['stop', 'start'])
  })

  it('on the CrazyGames basic launch a lost run reports nothing', async () => {
    const { wave } = await importAll(false)

    wave.stopGameplayForWaveBreak()
    wave.resumeGameplayAfterWaveBreak()
    expect(calls).toEqual([])
  })
})
