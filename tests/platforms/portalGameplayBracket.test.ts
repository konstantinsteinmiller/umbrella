// ─── The gameplay bracket: what opens and closes every portal's gameplay ────
//
// `usePortalGameplay` is the ONLY caller of gameplayStart / gameplayStop on
// CrazyGames, Poki, Playgama and Yandex. It derives the bracket from a few
// inputs instead of scattering calls through the scene: the game is live (the
// splash-resolved edge), the player has interacted since, no lost run is on
// screen, no interrupting menu is up — plus, per portal, no ad on screen, no
// hidden tab, no portal pause.
//
// The specs pin the properties that make that correct:
//
//   • Nothing is reported before the player's first interaction with the LIVE
//     game — a gesture on the loading screen does not count. Poki rejects a
//     `gameplayStart()` no player asked for, and C2P is measured on the first.
//   • Menus, a lost run and ads close it — the stop lands BEFORE the ad request
//     (same call stack as `isAdShowing` flipping) — and their release reopens it.
//   • The first-session tutorial's sim hold does NOT close it.
//   • No portal ever hears the same call twice in a row.
//   • Every arm is inert on builds without its portal.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const GUARD_MS = 120
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Emitted = 'start' | 'stop'

const { crazyCalls, playgamaCalls, yandexCalls } = vi.hoisted(() => ({
  crazyCalls: [] as string[],
  playgamaCalls: [] as string[],
  yandexCalls: [] as string[]
}))

// The real CG wrappers no-op without an SDK; the spies are what CG would hear.
vi.mock('@/use/useCrazyGames', () => ({
  startGameplay: () => crazyCalls.push('start'),
  stopGameplay: () => crazyCalls.push('stop')
}))

// Mocked rather than driven through a fake Bridge / ysdk — what is under test
// is the FAN-OUT (is it called at all, on the right edges), not the plumbing.
vi.mock('@/utils/playgamaPlugin', () => ({
  playgamaGameplayStart: () => playgamaCalls.push('start'),
  playgamaGameplayStop: () => playgamaCalls.push('stop')
}))

vi.mock('@/utils/yandexPlugin', () => ({
  yandexGameplayStart: () => yandexCalls.push('start'),
  yandexGameplayStop: () => yandexCalls.push('stop')
}))

const installPokiSpy = (): Emitted[] => {
  const emitted: Emitted[] = []
  ;(window as unknown as { PokiSDK: unknown }).PokiSDK = {
    gameplayStart: () => emitted.push('start'),
    gameplayStop: () => emitted.push('stop'),
    gameLoadingFinished: () => {},
    init: () => Promise.resolve(),
    commercialBreak: () => Promise.resolve(),
    rewardedBreak: () => Promise.resolve(false),
    measure: () => {},
    captureError: () => {},
    getLanguage: () => 'en',
    getDeviceInfo: () => ({ category: 'desktop' })
  }
  return emitted
}

type Portal = 'POKI' | 'PLAYGAMA' | 'YANDEX' | 'CRAZY_WEB'
const PORTALS: Portal[] = ['POKI', 'PLAYGAMA', 'YANDEX', 'CRAZY_WEB']

/** Fresh module graph with exactly the given portal flags on, bracket installed. */
const loadBracket = async (on: Portal[], opts: { cgFullRelease?: boolean } = {}) => {
  vi.resetModules()
  crazyCalls.length = 0
  playgamaCalls.length = 0
  yandexCalls.length = 0
  for (const p of PORTALS) vi.stubEnv(`VITE_APP_${p}`, on.includes(p) ? 'true' : '')
  vi.stubEnv('VITE_APP_CRAZY_GAMES_FULL_RELEASE', opts.cgFullRelease === false ? 'false' : 'true')
  const gameplay = await import('@/use/usePortalGameplay')
  const pause = await import('@/use/useGamePause')
  const modals = await import('@/use/useModalState')
  const wave = await import('@/use/useCrazyWaveGameplay')
  const plugin = await import('@/utils/pokiPlugin')
  gameplay.installPortalGameplayBracket()
  return { gameplay, pause, modals, wave, plugin }
}

/** Live + the player's first interaction: the bracket's opening pair. */
const liveAndTouched = async (h: Awaited<ReturnType<typeof loadBracket>>): Promise<void> => {
  h.gameplay.notifyPortalGameLive()
  h.gameplay.notePlayerInteraction()
  await wait(10)
}

afterEach(() => {
  delete (window as unknown as { PokiSDK?: unknown }).PokiSDK
  vi.unstubAllEnvs()
})

describe('the first interaction opens the bracket', () => {
  beforeEach(() => { installPokiSpy() })

  it('reports nothing while the board is live but untouched', async () => {
    const emitted = installPokiSpy()
    const h = await loadBracket(['POKI', 'PLAYGAMA', 'YANDEX', 'CRAZY_WEB'])

    h.gameplay.notifyPortalGameLive()
    await wait(GUARD_MS * 2)

    expect(h.gameplay.__isPortalGameplayLive()).toBe(false)
    expect(h.gameplay.__isCrazyGameplayLive()).toBe(false)
    expect(emitted).toEqual([])
    expect(crazyCalls).toEqual([])
    expect(playgamaCalls).toEqual([])
    expect(yandexCalls).toEqual([])
  })

  it('opens it on the first interaction with the live game — every portal, once', async () => {
    const emitted = installPokiSpy()
    const h = await loadBracket(['POKI', 'PLAYGAMA', 'YANDEX', 'CRAZY_WEB'])

    await liveAndTouched(h)
    h.gameplay.notePlayerInteraction() // a second tap is not a second start
    await wait(10)

    expect(emitted).toEqual(['start'])
    expect(crazyCalls).toEqual(['start'])
    expect(playgamaCalls).toEqual(['start'])
    expect(yandexCalls).toEqual(['start'])
  })

  it('a gesture on the loading screen does not count', async () => {
    const h = await loadBracket(['CRAZY_WEB'])

    h.gameplay.notePlayerInteraction() // tapped the splash
    h.gameplay.notifyPortalGameLive()
    await wait(10)
    expect(crazyCalls).toEqual([])
    expect(h.gameplay.hasPlayerInteracted()).toBe(false)

    h.gameplay.notePlayerInteraction() // the first tap on the live game
    expect(crazyCalls).toEqual(['start'])
  })

  it('a synthetic event is not a player (the capture listener IS armed, and goes after the first tap)', async () => {
    const h = await loadBracket(['CRAZY_WEB'])
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    h.gameplay.notifyPortalGameLive()
    const armed = add.mock.calls.find(([type, , o]) => type === 'pointerdown' && (o as AddEventListenerOptions)?.capture)
    expect(armed, 'capture-phase pointerdown listener').toBeTruthy()

    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await wait(10)
    expect(crazyCalls).toEqual([])

    h.gameplay.notePlayerInteraction()
    expect(remove.mock.calls.some(([type, fn]) => type === 'pointerdown' && fn === armed![1])).toBe(true)
    add.mockRestore()
    remove.mockRestore()
  })

  it('a first interaction that opens a menu starts gameplay only once the menu closes', async () => {
    const h = await loadBracket(['CRAZY_WEB'])
    h.gameplay.notifyPortalGameLive()

    const release = h.modals.acquireModalOpen() // the first tap was the Options button
    h.gameplay.notePlayerInteraction()
    expect(crazyCalls).toEqual([])

    release()
    expect(crazyCalls).toEqual(['start'])
  })
})

describe('menus, lost runs and ads close it', () => {
  it('a menu: stop on open, start on close', async () => {
    const h = await loadBracket(['CRAZY_WEB', 'PLAYGAMA', 'YANDEX'])
    await liveAndTouched(h)

    const release = h.modals.acquireModalOpen()
    // Synchronous — an ad fired from the menu must find the bracket closed.
    expect(crazyCalls).toEqual(['start', 'stop'])
    expect(playgamaCalls).toEqual(['start', 'stop'])
    expect(yandexCalls).toEqual(['start', 'stop'])

    release()
    expect(crazyCalls).toEqual(['start', 'stop', 'start'])
    expect(playgamaCalls).toEqual(['start', 'stop', 'start'])
    expect(yandexCalls).toEqual(['start', 'stop', 'start'])
  })

  it('stacked menus stop once and start once', async () => {
    const h = await loadBracket(['CRAZY_WEB'])
    await liveAndTouched(h)

    const a = h.modals.acquireModalOpen()
    const b = h.modals.acquireModalOpen()
    a()
    expect(crazyCalls).toEqual(['start', 'stop'])
    b()
    expect(crazyCalls).toEqual(['start', 'stop', 'start'])
  })

  it('ignores a modal that opted out of the gameplay lifecycle (the welcome-back claim)', async () => {
    const h = await loadBracket(['CRAZY_WEB', 'PLAYGAMA'])
    await liveAndTouched(h)

    const release = h.modals.acquireModalOpen({ firesGameplayLifecycle: false })
    release()

    expect(crazyCalls).toEqual(['start'])
    expect(playgamaCalls).toEqual(['start'])
  })

  it('still reports a real menu opened on top of an opted-out modal', async () => {
    const h = await loadBracket(['CRAZY_WEB'])
    await liveAndTouched(h)

    const releaseWelcome = h.modals.acquireModalOpen({ firesGameplayLifecycle: false })
    const releaseMenu = h.modals.acquireModalOpen() // the player taps Options
    expect(crazyCalls).toEqual(['start', 'stop'])

    releaseWelcome()
    expect(crazyCalls).toEqual(['start', 'stop']) // the menu is still up

    releaseMenu()
    expect(crazyCalls).toEqual(['start', 'stop', 'start'])
  })

  it('an ad: the stop lands before the ad request, the start after it', async () => {
    const h = await loadBracket(['CRAZY_WEB', 'PLAYGAMA', 'YANDEX'])
    await liveAndTouched(h)

    // `useAds` flips the flag, then calls the SDK in the same call stack.
    h.pause.isAdShowing.value = true
    crazyCalls.push('AD REQUEST')
    playgamaCalls.push('AD REQUEST')
    yandexCalls.push('AD REQUEST')
    h.pause.isAdShowing.value = false

    for (const calls of [crazyCalls, playgamaCalls, yandexCalls]) {
      expect(calls).toEqual(['start', 'stop', 'AD REQUEST', 'start'])
    }
  })

  it('an ad from an open menu emits nothing more — the menu already stopped it', async () => {
    const h = await loadBracket(['CRAZY_WEB'])
    await liveAndTouched(h)

    const release = h.modals.acquireModalOpen() // the boss chest's "2×"
    h.pause.isAdShowing.value = true
    h.pause.isAdShowing.value = false
    release()

    expect(crazyCalls).toEqual(['start', 'stop', 'start'])
  })

  it('a lost run closes it until the player is back in a run', async () => {
    const h = await loadBracket(['CRAZY_WEB', 'YANDEX'])
    await liveAndTouched(h)

    h.wave.stopGameplayForWaveBreak() // breach
    h.wave.stopGameplayForWaveBreak() // the breach modal's own stop is a no-op
    expect(crazyCalls).toEqual(['start', 'stop'])

    h.wave.resumeGameplayAfterWaveBreak() // restart / continue / next shot
    h.wave.resumeGameplayAfterWaveBreak()
    expect(crazyCalls).toEqual(['start', 'stop', 'start'])
    expect(yandexCalls).toEqual(['start', 'stop', 'start'])
  })

  it('a resume under an open menu leaves it closed until the menu goes', async () => {
    const h = await loadBracket(['CRAZY_WEB'])
    await liveAndTouched(h)

    h.wave.stopGameplayForWaveBreak()
    const release = h.modals.acquireModalOpen() // the breach modal
    h.wave.resumeGameplayAfterWaveBreak()      // a continue fires under it
    expect(crazyCalls).toEqual(['start', 'stop'])

    release()
    expect(crazyCalls).toEqual(['start', 'stop', 'start'])
  })

  it('a hidden tab / portal pause closes Poki, Playgama and Yandex — not CrazyGames', async () => {
    const h = await loadBracket(['CRAZY_WEB', 'PLAYGAMA', 'YANDEX'])
    await liveAndTouched(h)

    h.pause.pauseGame()
    h.pause.resumeGame()

    expect(playgamaCalls).toEqual(['start', 'stop', 'start'])
    expect(yandexCalls).toEqual(['start', 'stop', 'start'])
    expect(crazyCalls).toEqual(['start'])
  })

  it('stays open through the first-session tutorial hold', async () => {
    const emitted = installPokiSpy()
    const h = await loadBracket(['POKI', 'CRAZY_WEB'])

    // `useTutorialPauseGate` takes a plain app-pause for the whole FTUE. The
    // player is tapping and aiming the entire time; reporting that as "not
    // playing" would never fire the event C2P is measured on.
    const releaseTutorialHold = h.pause.acquireAppPause()
    await liveAndTouched(h)
    releaseTutorialHold()
    await wait(GUARD_MS * 2)

    expect(emitted).toEqual(['start'])
    expect(crazyCalls).toEqual(['start'])
  })
})

describe('no portal hears the same call twice', () => {
  it('a noisy session strictly alternates start / stop on every arm', async () => {
    const emitted = installPokiSpy()
    const h = await loadBracket(['POKI', 'PLAYGAMA', 'YANDEX', 'CRAZY_WEB'])
    await liveAndTouched(h)

    // Menus over lost runs over ads, released in every order.
    const m1 = h.modals.acquireModalOpen()
    h.wave.stopGameplayForWaveBreak()
    h.pause.isAdShowing.value = true
    m1()
    h.pause.isAdShowing.value = false
    h.wave.resumeGameplayAfterWaveBreak()
    h.pause.pauseGame()
    const m2 = h.modals.acquireModalOpen()
    h.pause.resumeGame()
    h.pause.isAdShowing.value = true
    m2()
    h.pause.isAdShowing.value = false
    h.wave.stopGameplayForWaveBreak()
    h.wave.resumeGameplayAfterWaveBreak()
    await wait(GUARD_MS * 2)

    const alternates = (calls: string[]) =>
      calls.length > 0 && calls[0] === 'start' && calls.every((c, i) => i === 0 || c !== calls[i - 1])
    for (const calls of [crazyCalls, playgamaCalls, yandexCalls, emitted]) {
      expect(alternates(calls), calls.join(' ')).toBe(true)
      expect(calls.at(-1)).toBe('start') // everything released: playing again
    }
  })
})

describe('the CrazyGames basic launch', () => {
  it('reports the one start on the first interaction and no stops', async () => {
    const h = await loadBracket(['CRAZY_WEB'], { cgFullRelease: false })
    h.gameplay.notifyPortalGameLive()
    expect(crazyCalls).toEqual([])

    h.gameplay.notePlayerInteraction()
    const release = h.modals.acquireModalOpen()
    h.wave.stopGameplayForWaveBreak()
    h.pause.isAdShowing.value = true
    h.pause.isAdShowing.value = false
    release()

    expect(crazyCalls).toEqual(['start'])
  })
})

describe('Poki arm', () => {
  it('opens on the first interaction and closes before an ad', async () => {
    const emitted = installPokiSpy()
    const h = await loadBracket(['POKI'])

    h.gameplay.notifyPortalGameLive()
    await wait(GUARD_MS * 2)
    expect(emitted).toEqual([])

    h.gameplay.notePlayerInteraction()
    await wait(10)
    expect(emitted).toEqual(['start'])
    // The central gate told the plugin's own gate too.
    expect(h.plugin.pokiHasUserInteracted()).toBe(true)

    h.pause.isAdShowing.value = true
    expect(emitted).toEqual(['start', 'stop'])
    h.pause.isAdShowing.value = false
    await wait(GUARD_MS * 2)
    expect(emitted).toEqual(['start', 'stop', 'start'])
  })
})

describe('inert without a bracket portal', () => {
  it('no arm fires and no gesture listener is armed', async () => {
    const emitted = installPokiSpy()
    const add = vi.spyOn(window, 'addEventListener')
    const h = await loadBracket([])

    h.gameplay.notifyPortalGameLive()
    h.gameplay.notePlayerInteraction()
    h.pause.isAdShowing.value = true
    h.pause.isAdShowing.value = false
    await wait(GUARD_MS * 2)

    expect(emitted).toEqual([])
    expect(crazyCalls).toEqual([])
    expect(playgamaCalls).toEqual([])
    expect(yandexCalls).toEqual([])
    expect(add.mock.calls.some(([type]) => type === 'pointerdown')).toBe(false)
    add.mockRestore()
  })
})
