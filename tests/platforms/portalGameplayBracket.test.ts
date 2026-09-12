// ─── The bracket driver: what actually opens and closes Poki gameplay ───────
//
// `usePortalGameplay` derives the whole bracket from one expression instead of
// scattering start/stop calls through the scene: the game is live (the
// splash-resolved edge — this game boots straight into a live arena) and none
// of ad / tab-hidden / portal-pause / interrupting-modal is asserting.
//
// The specs below pin the four properties that make that derivation correct:
//
//   • Nothing is reported before the player touches the viewport, even though
//     the sim is live — the plugin's gesture gate holds it. Poki rejects a
//     `gameplayStart()` no player asked for, and C2P (the Web Fit Test's 65 %
//     gate) is measured on the first one.
//   • A modal / ad closes the bracket and its release reopens it, with no
//     Poki-shaped condition added to `useModalGameplayGate`.
//   • THE FIRST-SESSION TUTORIAL DOES NOT CLOSE IT. `useTutorialPauseGate`
//     holds a plain app-pause for the whole FTUE, and a bracket derived from
//     `isGamePaused` would therefore report a brand-new player as "not playing"
//     from boot until they finish the tutorial — i.e. never fire the one event
//     C2P is measured on, for exactly the players it is meant to count. A
//     headless run of the built bundle caught this: `starts after tap: 0`.
//   • The watcher is INERT on every other build, so nothing here can leak into
//     the CrazyGames / Yandex / GamePix bundles' behaviour.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const GUARD_MS = 120
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Emitted = 'start' | 'stop'

const installSdkSpy = (): Emitted[] => {
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

/** Fresh module graph with the Poki build flag on, bracket installed. */
const loadBracket = async (pokiBuild = true) => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_POKI', pokiBuild ? 'true' : '')
  const gameplay = await import('@/use/usePortalGameplay')
  const pause = await import('@/use/useGamePause')
  const modals = await import('@/use/useModalState')
  const plugin = await import('@/utils/pokiPlugin')
  gameplay.installPortalGameplayBracket()
  return { gameplay, pause, modals, plugin }
}

describe('poki gameplay bracket driver', () => {
  beforeEach(() => { installSdkSpy() })
  afterEach(() => {
    delete (window as unknown as { PokiSDK?: unknown }).PokiSDK
    vi.unstubAllEnvs()
  })

  it('reports nothing while the sim is live but untouched', async () => {
    const emitted = installSdkSpy()
    const { gameplay } = await loadBracket()

    gameplay.notifyPortalGameLive()
    await wait(GUARD_MS * 2)

    // The sim IS running — the bracket input is true — but no player has acted.
    expect(gameplay.__isPortalGameplayLive()).toBe(true)
    expect(emitted).toEqual([])
  })

  it('opens the bracket on the first interaction with the viewport', async () => {
    const emitted = installSdkSpy()
    const { gameplay, plugin } = await loadBracket()

    gameplay.notifyPortalGameLive()
    expect(emitted).toEqual([])

    plugin.pokiNoteUserInteraction()
    await wait(10)

    expect(emitted).toEqual(['start'])
  })

  it('closes the bracket when an interrupting modal opens, and reopens on close', async () => {
    const emitted = installSdkSpy()
    const { gameplay, modals, plugin } = await loadBracket()

    plugin.pokiNoteUserInteraction()
    gameplay.notifyPortalGameLive()
    await wait(10)
    expect(emitted).toEqual(['start'])

    const release = modals.acquireModalOpen()
    // Emitted SYNCHRONOUSLY — `useAds` flips `isAdShowing` in the same call
    // stack as the SDK call, so a deferred stop could land AFTER the ad request.
    expect(emitted).toEqual(['start', 'stop'])

    release()
    await wait(GUARD_MS * 2)
    expect(emitted).toEqual(['start', 'stop', 'start'])
  })

  it('ignores a modal that opted out of the gameplay lifecycle', async () => {
    const emitted = installSdkSpy()
    const { gameplay, modals, plugin } = await loadBracket()

    plugin.pokiNoteUserInteraction()
    gameplay.notifyPortalGameLive()
    await wait(10)

    // The welcome-back claim: it opens seconds into a returning player's boot
    // and freezes the sim, but bracketing it would emit a pointless stop/start
    // pair right behind the launch one.
    const release = modals.acquireModalOpen({ firesGameplayLifecycle: false })
    await wait(GUARD_MS * 2)
    release()
    await wait(GUARD_MS * 2)

    expect(emitted).toEqual(['start'])
  })

  it('stays open through the first-session tutorial hold', async () => {
    const emitted = installSdkSpy()
    const { gameplay, pause, plugin } = await loadBracket()

    // `useTutorialPauseGate` takes a plain app-pause for the whole FTUE — with
    // `immediate: true`, so for a brand-new player it is already held before
    // the splash resolves. The player is tapping, merging and dragging the
    // entire time; only the battle sim is frozen so wave 1 cannot overrun them
    // mid-lesson. Reporting that as "not playing" would mean a first-time
    // player never fires the event C2P is measured on.
    const releaseTutorialHold = pause.acquireAppPause()

    plugin.pokiNoteUserInteraction()
    gameplay.notifyPortalGameLive()
    await wait(10)

    expect(emitted).toEqual(['start'])

    releaseTutorialHold()
    await wait(GUARD_MS * 2)
    // And releasing it changes nothing — no spurious second bracket.
    expect(emitted).toEqual(['start'])
  })

  it('closes the bracket while an ad is on screen', async () => {
    const emitted = installSdkSpy()
    const { gameplay, pause, plugin } = await loadBracket()

    plugin.pokiNoteUserInteraction()
    gameplay.notifyPortalGameLive()
    await wait(10)

    pause.isAdShowing.value = true
    expect(emitted).toEqual(['start', 'stop'])
    pause.isAdShowing.value = false
    await wait(GUARD_MS * 2)
    expect(emitted).toEqual(['start', 'stop', 'start'])
  })

  it('is inert on non-Poki builds', async () => {
    const emitted = installSdkSpy()
    const { gameplay, pause, plugin } = await loadBracket(false)

    plugin.pokiNoteUserInteraction()
    gameplay.notifyPortalGameLive()
    pause.isAdShowing.value = true
    pause.isAdShowing.value = false
    await wait(GUARD_MS * 2)

    expect(emitted).toEqual([])
  })
})

// ─── Playgama arm ───────────────────────────────────────────────────────────
//
// `playgamaGameplayStart` / `playgamaGameplayStop` were written, exported and
// then never called from anywhere: the portal was told the game had LOADED and
// never that anyone was PLAYING it. On a Playgama Build distribution that is
// also the only route those signals have to the downstream portal's own hooks,
// because our CrazyGames / Poki plugins are compiled out of that bundle.
//
// The plugin module is mocked rather than driven through a fake Bridge — what
// is under test here is the FAN-OUT (does the bracket call it at all, on the
// right edges), not the message plumbing, which `playgamaSignals` covers.

const { playgamaCalls } = vi.hoisted(() => ({ playgamaCalls: [] as string[] }))

vi.mock('@/utils/playgamaPlugin', () => ({
  playgamaGameplayStart: () => playgamaCalls.push('start'),
  playgamaGameplayStop: () => playgamaCalls.push('stop')
}))

/** Fresh module graph with the PLAYGAMA build flag on (and Poki off). */
const loadPlaygamaBracket = async () => {
  vi.resetModules()
  playgamaCalls.length = 0
  vi.stubEnv('VITE_APP_POKI', '')
  vi.stubEnv('VITE_APP_PLAYGAMA', 'true')
  const gameplay = await import('@/use/usePortalGameplay')
  const pause = await import('@/use/useGamePause')
  gameplay.installPortalGameplayBracket()
  return { gameplay, pause }
}

describe('playgama gameplay bracket driver', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('opens the bracket as soon as the game is live', async () => {
    // No trusted-gesture hold here: that rule is Poki's, and applying it to
    // Playgama would silently withhold a signal the portal expects at launch.
    const { gameplay } = await loadPlaygamaBracket()

    gameplay.notifyPortalGameLive()
    await wait(10)

    expect(gameplay.__isPortalGameplayLive()).toBe(true)
    expect(playgamaCalls).toEqual(['start'])
  })

  it('closes and reopens it around an ad', async () => {
    const { gameplay, pause } = await loadPlaygamaBracket()

    gameplay.notifyPortalGameLive()
    await wait(10)
    expect(playgamaCalls).toEqual(['start'])

    pause.isAdShowing.value = true
    await wait(10)
    expect(playgamaCalls).toEqual(['start', 'stop'])

    pause.isAdShowing.value = false
    await wait(10)
    expect(playgamaCalls).toEqual(['start', 'stop', 'start'])
  })

  it('closes it while the portal holds a pause', async () => {
    const { gameplay, pause } = await loadPlaygamaBracket()

    gameplay.notifyPortalGameLive()
    await wait(10)

    pause.pauseGame()
    await wait(10)
    expect(playgamaCalls).toEqual(['start', 'stop'])

    pause.resumeGame()
    await wait(10)
    expect(playgamaCalls).toEqual(['start', 'stop', 'start'])
  })

  it('stays silent on a build that is neither Poki nor Playgama', async () => {
    vi.resetModules()
    playgamaCalls.length = 0
    vi.stubEnv('VITE_APP_POKI', '')
    vi.stubEnv('VITE_APP_PLAYGAMA', '')
    const gameplay = await import('@/use/usePortalGameplay')
    const pause = await import('@/use/useGamePause')
    gameplay.installPortalGameplayBracket()

    gameplay.notifyPortalGameLive()
    pause.isAdShowing.value = true
    pause.isAdShowing.value = false
    await wait(10)

    expect(playgamaCalls).toEqual([])
  })
})
