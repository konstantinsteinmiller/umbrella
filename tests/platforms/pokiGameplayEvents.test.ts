// ─── Poki gameplay-bracket guard ────────────────────────────────────────────
//
// This is the highest-value test in the Poki integration, because the bug it
// guards against is INVISIBLE at runtime: it costs revenue and reports nothing.
//
// De-minifying the shipped `poki-sdk-core` bundle gives:
//
//   Jc.set(this, () => badEvents >= 10)            // gate on start/stop/commercialBreak
//   // gameplayStop:  lastStopAt = performance.now()
//   // gameplayStart: if (lastStopAt && lastStopAt > performance.now() - 50) badEvents++
//   setInterval(() => { badEvents = Math.max(badEvents - 1, 0) }, 1000)
//
// A `gameplayStart()` within 50 ms of the preceding `gameplayStop()` is scored a
// "bad event". At ten of them, `gameplayStart`, `gameplayStop` AND
// `commercialBreak` all become no-ops for the rest of the session — the game
// keeps running and simply stops earning.
//
// This project drives the bracket from `usePortalGameplay`, whose watcher fires on
// `isGameLive && !isGamePaused` — and `isGamePaused` is a computed over FOUR
// reactive sources (ad / tab-hidden / platform / modal), watched with
// `flush: 'sync'` so a stop always precedes an ad request. A modal closing in the
// same tick an ad opens therefore produces exactly the sub-50 ms stop→start pair
// the SDK penalises, so the guard has to live in the plugin rather than at the
// call site.
//
// The file guards a SECOND invariant with the same shape — a rule that costs
// revenue and reports nothing: Poki forbids a `gameplayStart()` that no player
// asked for, and this game boots straight into a live arena, so the bracket
// wants to open during mount. The plugin holds such a start behind a
// trusted-gesture gate. `dispatchEvent` cannot produce a trusted event in a test
// DOM, so the specs release the gate through `pokiNoteUserInteraction()` — the
// same seam the real `window` listeners call.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Emitted = { kind: 'start' | 'stop', at: number }

const GUARD_MS = 120

/**
 * Fresh module, with the gesture gate already released.
 *
 * Every spec below is about the bad-event guard, which is a question about
 * TIMING between the two bracket events — so they all start from a page the
 * player has touched. The gate itself is exercised by the last describe block,
 * which loads the module raw.
 */
const loadPlugin = async () => {
  const mod = await loadPluginRaw()
  mod.pokiNoteUserInteraction()
  return mod
}

/** Fresh module with the gesture gate still CLOSED. */
const loadPluginRaw = async () => {
  vi.resetModules()
  return await import('@/utils/pokiPlugin')
}

/** Minimal PokiSDK double that records the ORDER and TIMING of the two
 *  bracket events — the only two things the bad-event counter looks at. */
const installSdkSpy = (): Emitted[] => {
  const emitted: Emitted[] = []
  ;(window as unknown as { PokiSDK: unknown }).PokiSDK = {
    gameplayStart: () => emitted.push({ kind: 'start', at: performance.now() }),
    gameplayStop: () => emitted.push({ kind: 'stop', at: performance.now() }),
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('poki gameplay bracket', () => {
  beforeEach(() => { installSdkSpy() })
  afterEach(() => { delete (window as unknown as { PokiSDK?: unknown }).PokiSDK })

  it('never emits a start within the SDK bad-event window of a stop', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiGameplayStop } = await loadPlugin()

    // The pathological case: a reactive boolean thrashing inside one tick.
    for (let i = 0; i < 30; i++) {
      pokiGameplayStart()
      pokiGameplayStop()
    }
    await wait(GUARD_MS * 3)

    expect(emitted.length).toBeGreaterThan(0)
    emitted.forEach((e, i) => {
      if (i === 0) return
      const prev = emitted[i - 1]
      // No duplicate consecutive events (an explicit Poki quality requirement).
      expect(e.kind).not.toBe(prev.kind)
      // And no start inside the guard window of the preceding stop.
      if (e.kind === 'start') {
        expect(e.at - prev.at).toBeGreaterThanOrEqual(GUARD_MS)
      }
    })
  })

  it('collapses duplicate consecutive starts and stops', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiGameplayStop } = await loadPlugin()

    pokiGameplayStart()
    pokiGameplayStart()
    pokiGameplayStart()
    pokiGameplayStop()
    pokiGameplayStop()
    await wait(GUARD_MS * 2)

    expect(emitted.map((e) => e.kind)).toEqual(['start', 'stop'])
  })

  it('drops a deferred start entirely when a stop arrives before it fires', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiGameplayStop } = await loadPlugin()

    pokiGameplayStart()   // emits immediately (no preceding stop)
    pokiGameplayStop()    // emits, arms the guard window
    pokiGameplayStart()   // inside the window -> deferred, not emitted yet
    pokiGameplayStop()    // cancels the pending start
    await wait(GUARD_MS * 3)

    // The deferred start never reached the SDK, so no unmatched stop follows it.
    expect(emitted.map((e) => e.kind)).toEqual(['start', 'stop'])
  })

  it('still delivers a deferred start once the window has passed', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiGameplayStop } = await loadPlugin()

    pokiGameplayStart()
    pokiGameplayStop()
    pokiGameplayStart()   // deferred by the guard
    await wait(GUARD_MS * 3)

    // Deferred, NOT dropped — the bracket still reaches Poki, just late enough
    // that the SDK doesn't score it.
    expect(emitted.map((e) => e.kind)).toEqual(['start', 'stop', 'start'])
    const [, stop, start] = emitted
    expect(start.at - stop.at).toBeGreaterThanOrEqual(GUARD_MS)
  })

  it('emits normally when the game paces itself outside the window', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiGameplayStop } = await loadPlugin()

    pokiGameplayStart()
    pokiGameplayStop()
    await wait(GUARD_MS * 2)
    pokiGameplayStart()
    await wait(10)

    expect(emitted.map((e) => e.kind)).toEqual(['start', 'stop', 'start'])
  })

  it('sends gameLoadingFinished exactly once', async () => {
    let count = 0
    installSdkSpy()
    ;(window as unknown as { PokiSDK: { gameLoadingFinished: () => void } })
      .PokiSDK.gameLoadingFinished = () => { count++ }

    const { pokiGameLoadingFinished } = await loadPlugin()
    pokiGameLoadingFinished()
    pokiGameLoadingFinished()
    pokiGameLoadingFinished()

    expect(count).toBe(1)
  })

  it('is inert when the SDK never loaded (ad-blocked / CDN down)', async () => {
    delete (window as unknown as { PokiSDK?: unknown }).PokiSDK
    const { pokiGameplayStart, pokiGameplayStop, pokiGameLoadingFinished } = await loadPlugin()

    // Poki requires the game to stay fully playable with an ad blocker active,
    // so none of these may throw when `window.PokiSDK` is absent.
    expect(() => {
      pokiGameplayStart()
      pokiGameplayStop()
      pokiGameLoadingFinished()
    }).not.toThrow()
  })
})

// ─── The user-gesture gate ──────────────────────────────────────────────────
//
// Poki QA rejects a build that reports gameplay nobody started, and C2P — the
// Web Fit Test's 65 % gate — is measured on the FIRST `gameplayStart()`, so a
// start fired on load corrupts the funnel in the direction that looks good.
// This game has no menu, so the sim goes live the moment the splash resolves:
// the gate is the only thing between that and a violation.

describe('poki gameplay start requires a user interaction', () => {
  beforeEach(() => { installSdkSpy() })
  afterEach(() => { delete (window as unknown as { PokiSDK?: unknown }).PokiSDK })

  it('emits nothing when the bracket opens before any interaction', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart } = await loadPluginRaw()

    pokiGameplayStart()
    await wait(GUARD_MS * 3)

    // The autostart the splash-resolved edge performs. Poki must not hear it.
    expect(emitted).toEqual([])
  })

  it('releases the held start on the first interaction', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiNoteUserInteraction } = await loadPluginRaw()

    pokiGameplayStart()
    expect(emitted).toEqual([])

    pokiNoteUserInteraction()
    await wait(10)

    // HELD, not dropped — the bracket the game opened is still owed to Poki,
    // and it lands on the frame the player actually acted on.
    expect(emitted.map((e) => e.kind)).toEqual(['start'])
  })

  it('drops the held start when the bracket closes before the interaction', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiGameplayStop, pokiNoteUserInteraction } = await loadPluginRaw()

    pokiGameplayStart()   // mount
    pokiGameplayStop()    // a modal opened before the player ever touched anything
    pokiNoteUserInteraction()
    await wait(GUARD_MS * 3)

    // Nothing reached the SDK, so the stop must not either: an unmatched
    // `gameplayStop()` is itself a bad event.
    expect(emitted).toEqual([])
  })

  it('emits immediately once the page has been interacted with', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiNoteUserInteraction } = await loadPluginRaw()

    // The ordinary case after the first tap: the gate is open and stays open.
    pokiNoteUserInteraction()
    pokiGameplayStart()
    await wait(10)

    expect(emitted.map((e) => e.kind)).toEqual(['start'])
  })

  it('opens the gate from sticky user activation when it arms too late', async () => {
    const emitted = installSdkSpy()
    // The player tapped while the SDK script was still in flight, so the
    // listeners never saw the gesture — but the document is activated, and the
    // browser remembers that for the life of the page.
    Object.defineProperty(navigator, 'userActivation', {
      value: { hasBeenActive: true, isActive: true },
      configurable: true
    })
    try {
      const { pokiPlugin, pokiGameplayStart } = await loadPluginRaw()
      await pokiPlugin()
      pokiGameplayStart()
      await wait(10)

      // No second tap demanded: the start lands on the bracket the game opened.
      expect(emitted.map((e) => e.kind)).toEqual(['start'])
    } finally {
      delete (navigator as { userActivation?: unknown }).userActivation
    }
  })

  it('does not re-arm the gate for later brackets in the same session', async () => {
    const emitted = installSdkSpy()
    const {
      pokiGameplayStart, pokiGameplayStop, pokiNoteUserInteraction
    } = await loadPluginRaw()

    pokiNoteUserInteraction()
    pokiGameplayStart()
    pokiGameplayStop()
    await wait(GUARD_MS * 2)
    pokiGameplayStart()   // a stage restart — no fresh tap required
    await wait(10)

    expect(emitted.map((e) => e.kind)).toEqual(['start', 'stop', 'start'])
  })

  it('reports whether a gesture has been seen', async () => {
    installSdkSpy()
    const { pokiHasUserInteracted, pokiNoteUserInteraction } = await loadPluginRaw()

    expect(pokiHasUserInteracted()).toBe(false)
    pokiNoteUserInteraction()
    expect(pokiHasUserInteracted()).toBe(true)
  })

  it('counts a trusted window gesture, and ignores a synthetic one', async () => {
    const emitted = installSdkSpy()
    const { pokiGameplayStart, pokiHasUserInteracted } = await loadPluginRaw()

    pokiGameplayStart()
    // `dispatchEvent` produces `isTrusted === false`. A script clicking for the
    // player is not the player — that is the whole point of the rule.
    window.dispatchEvent(new Event('pointerdown'))
    await wait(GUARD_MS * 2)

    expect(pokiHasUserInteracted()).toBe(false)
    expect(emitted).toEqual([])
  })
})
