// Playgama's three certification-graded portal signals: MUTE, PAUSE, LANGUAGE.
//
// Two of them were mis-wired and both are named rejection reasons:
//
//   • "the game does not respond to the platform mute request" — the plugin
//     routed `audio_state_changed` into the PAUSE gate. That froze the
//     simulation instead of silencing it, left SFX audible, and made unmute a
//     no-op. Muting must zero what all audio derives from, and the SDK's
//     INITIAL state must be read (the change event only fires on subsequent
//     changes, so a player arriving at an already-muted portal is handled by
//     that initial read alone).
//
//   • "the game continues running when a system overlay is opened" — pause,
//     audio and visibility all wrote ONE shared `heldPause` boolean, so a
//     `visibility_state_changed: 'visible'` could clear a pause that
//     `pause_state_changed` had legitimately asserted (e.g. under an ad).
//     They must be tracked as independent inputs.
//
// Plus the cloud-save config flag, which is what actually lets progress reach
// the Playgama remote (see `PlaygamaStrategy.test.ts`).

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

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

// `playgamaPlugin()` early-returns unless the build flag is set.
vi.mock('@/use/useUser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/use/useUser')>()
  return { ...actual, isPlaygama: true }
})

type Handler = (payload: any) => void

interface FakeBridgeOpts {
  isAudioEnabled?: boolean
  isPaused?: boolean
  language?: string
  platformId?: string
}

/**
 * Minimal stand-in for the v2 Bridge singleton.
 *
 * v2 shape, and the deltas that matter here:
 *   • events are subscribed on the ROOT object (`bridge.on`), not on
 *     `bridge.platform` / `bridge.advertisement` as in v1;
 *   • `on()` returns VOID — you unsubscribe with `off(name, sameCallback)`;
 *   • `showInterstitial()` / `showRewarded()` return void, so the whole ad
 *     lifecycle is the state event.
 */
const makeFakeBridge = (opts: FakeBridgeOpts = {}) => {
  const handlers = new Map<string, Handler[]>()
  const initCalls: unknown[] = []
  const platform = {
    id: opts.platformId ?? 'playgama',
    language: opts.language ?? 'en',
    isAudioEnabled: opts.isAudioEnabled,
    isPaused: opts.isPaused,
    sendMessage: () => Promise.resolve()
  }
  const bridge = {
    version: '2.1.0',
    platform,
    advertisement: {
      showInterstitial: () => { /* lifecycle is the state event */ },
      showRewarded: () => { /* lifecycle is the state event */ }
    },
    storage: {},
    on: (name: string, cb: Handler) => {
      const list = handlers.get(name) ?? []
      list.push(cb)
      handlers.set(name, list)
      // v2 returns void — a test that relied on an unsubscribe function here
      // would be testing v1.
    },
    off: (name: string, cb?: Handler) => {
      if (!cb) return handlers.delete(name)
      const list = handlers.get(name) ?? []
      const i = list.indexOf(cb)
      if (i !== -1) list.splice(i, 1)
    },
    initialize: (options?: unknown) => {
      initCalls.push(options)
      return Promise.resolve()
    }
  }
  const emit = (name: string, payload: unknown) => {
    for (const cb of [...(handlers.get(name) ?? [])]) cb(payload)
  }
  return { bridge, emit, initCalls }
}

/** Fresh module graph per test — the plugin caches its init promise and the
 *  pause/audio modules hold module-level singleton state. The Bridge arrives
 *  through `playgamaBridgeLoader` in v2 (npm package, not a CDN global), so
 *  that module is what gets mocked. */
const bootPlugin = async (opts: FakeBridgeOpts = {}) => {
  vi.resetModules()
  suspendSpy.mockClear()
  resumeSpy.mockClear()
  killOneShotSpy.mockClear()

  const fake = makeFakeBridge(opts)
  vi.doMock('@/utils/playgamaBridgeLoader', () => ({
    loadPlaygamaBridge: async () => fake.bridge
  }))

  const plugin = await import('@/utils/playgamaPlugin')
  const pause = await import('@/use/useGamePause')
  const audio = await import('@/use/useGamePauseAudio')
  await plugin.playgamaPlugin()
  return { ...fake, plugin, pause, audio }
}

afterEach(() => {
  vi.doUnmock('@/utils/playgamaBridgeLoader')
})

beforeEach(() => {
  window.localStorage.clear()
})

describe('Playgama MUTE — silences audio, does not pause the sim', () => {
  it('routes audio_state_changed(false) to the hard mute, NOT the pause gate', async () => {
    const { emit, pause, audio } = await bootPlugin({ isAudioEnabled: true })

    emit('audio_state_changed', false)

    expect(audio.__isPlatformAudioMuted()).toBe(true)
    expect(suspendSpy).toHaveBeenCalled()
    // Muting is not pausing: the simulation must keep running.
    expect(pause.isPlatformPaused.value).toBe(false)
    expect(pause.isGamePaused.value).toBe(false)
  })

  it('kills in-flight one-shot SFX so "muted" means nothing is pending', async () => {
    const { emit } = await bootPlugin({ isAudioEnabled: true })
    emit('audio_state_changed', false)
    expect(killOneShotSpy).toHaveBeenCalled()
  })

  it('unmute actually restores audio (the old wiring made it a no-op)', async () => {
    const { emit, audio } = await bootPlugin({ isAudioEnabled: true })

    emit('audio_state_changed', false)
    expect(audio.__isPlatformAudioMuted()).toBe(true)

    emit('audio_state_changed', true)
    expect(audio.__isPlatformAudioMuted()).toBe(false)
    expect(resumeSpy).toHaveBeenCalled()
  })

  it('reads the INITIAL audio state — a player arriving at a muted portal', async () => {
    // `audio_state_changed` only fires on SUBSEQUENT changes. Without this
    // initial read the game boots audible on an already-muted portal.
    const { audio } = await bootPlugin({ isAudioEnabled: false })

    expect(audio.__isPlatformAudioMuted()).toBe(true)
    expect(suspendSpy).toHaveBeenCalled()
  })

  it('does not mute when the portal reports audio enabled at boot', async () => {
    const { audio } = await bootPlugin({ isAudioEnabled: true })
    expect(audio.__isPlatformAudioMuted()).toBe(false)
  })

  it('never writes the portal mute into the player\'s saved volume settings', async () => {
    // Platform state is not player state: persisting it makes "the portal said
    // so" indistinguishable from "the player chose this", and via cloud save it
    // survives a QA re-test on the same account.
    const { emit } = await bootPlugin({ isAudioEnabled: true })
    emit('audio_state_changed', false)

    const persisted = JSON.stringify(
      Object.fromEntries(
        Object.keys(window.localStorage).map(k => [k, window.localStorage.getItem(k)])
      )
    )
    expect(persisted).not.toMatch(/spinner_user_(music|sound)/)
  })
})

describe('Playgama PAUSE — independent inputs, no cross-clobbering', () => {
  it('stops the loop on pause_state_changed(true)', async () => {
    const { emit, pause } = await bootPlugin()

    emit('pause_state_changed', true)

    expect(pause.isPlatformPaused.value).toBe(true)
    expect(pause.isGamePaused.value).toBe(true)
  })

  it('a visibility "visible" event cannot clear an asserted platform pause', async () => {
    // The regression: one shared boolean meant the bridge re-reporting
    // visibility (which it does when the iframe regains focus, including
    // behind a still-open ad) resumed gameplay underneath the ad.
    const { emit, pause } = await bootPlugin()

    emit('pause_state_changed', true)
    expect(pause.isPlatformPaused.value).toBe(true)

    emit('visibility_state_changed', 'visible')
    expect(pause.isPlatformPaused.value).toBe(true)

    // Only the source that asserted it may release it.
    emit('pause_state_changed', false)
    expect(pause.isPlatformPaused.value).toBe(false)
  })

  it('a hidden visibility event pauses, and its own "visible" releases it', async () => {
    const { emit, pause } = await bootPlugin()

    emit('visibility_state_changed', 'hidden')
    expect(pause.isPlatformPaused.value).toBe(true)

    emit('visibility_state_changed', 'visible')
    expect(pause.isPlatformPaused.value).toBe(false)
  })

  it('stays paused while BOTH sources assert, releases only when both clear', async () => {
    const { emit, pause } = await bootPlugin()

    emit('pause_state_changed', true)
    emit('visibility_state_changed', 'hidden')
    expect(pause.isPlatformPaused.value).toBe(true)

    emit('pause_state_changed', false)
    expect(pause.isPlatformPaused.value).toBe(true) // still hidden

    emit('visibility_state_changed', 'visible')
    expect(pause.isPlatformPaused.value).toBe(false)
  })

  it('reads the INITIAL pause state at boot', async () => {
    const { pause } = await bootPlugin({ isPaused: true })
    expect(pause.isPlatformPaused.value).toBe(true)
  })

  it('an audio mute does not leak into the pause gate', async () => {
    const { emit, pause } = await bootPlugin({ isAudioEnabled: true })
    emit('audio_state_changed', false)
    emit('audio_state_changed', true)
    expect(pause.isPlatformPaused.value).toBe(false)
  })
})

describe('Playgama bridge init options', () => {
  it('passes allowAnonymousCloudSave so guest players get cloud saves', async () => {
    // This is the inline fallback the Bridge uses when
    // `playgama-bridge-config.json` 404s. The option SURVIVED the v2 upgrade
    // (v2 dropped the per-call storage TYPE argument, not this) — the shipped
    // 2.1.0 bundle still gates its cloud path on
    // `allowAnonymousCloudSave === true || player.isAuthorized`, so without
    // the flag no guest player's progress ever reaches the remote.
    const { initCalls } = await bootPlugin()

    expect(initCalls).toHaveLength(1)
    expect(initCalls[0]).toMatchObject({
      storage: { allowAnonymousCloudSave: true }
    })
  })
})

describe('Playgama LANGUAGE', () => {
  it('exposes the portal language for the i18n boot path', async () => {
    const { plugin } = await bootPlugin({ language: 'pt-BR' })
    expect(plugin.playgamaLocale.value).toBe('pt')
  })
})

describe('Playgama LANGUAGE — browser-fallback leak (default must be English)', () => {
  it('ignores platform.language on the MOCK platform (no portal to speak for)', async () => {
    // De-minified, the adapter is:
    //   platformLanguage = platformService?.getLanguage?.()
    //                      || navigator.language.substring(0, 2)
    // On mock/standalone there is no `getLanguage`, so the value is purely the
    // browser's — honouring it booted the game in the tester's language.
    const { plugin } = await bootPlugin({ language: 'de', platformId: 'mock' })
    expect(plugin.playgamaLocale.value).toBeNull()
  })

  it('ignores platform.language on the STANDALONE platform', async () => {
    const { plugin } = await bootPlugin({ language: 'ru', platformId: 'standalone' })
    expect(plugin.playgamaLocale.value).toBeNull()
  })

  it('HONOURS platform.language on the real playgama portal', async () => {
    const { plugin } = await bootPlugin({ language: 'ar', platformId: 'playgama' })
    expect(plugin.playgamaLocale.value).toBe('ar')
  })

  it('HONOURS platform.language in the QA tool (it has a language selector)', async () => {
    const { plugin } = await bootPlugin({ language: 'ar', platformId: 'qa_tool' })
    expect(plugin.playgamaLocale.value).toBe('ar')
  })
})

describe('Playgama LANGUAGE — tag normalization', () => {
  it('accepts full BCP-47 tags and collapses script subtags', async () => {
    const { plugin } = await bootPlugin()
    const n = plugin.normalizePlaygamaLanguage
    expect(n('pt-BR')).toBe('pt')
    expect(n('zh-Hant')).toBe('zh')   // Simplified beats the English fallback
    expect(n('zh_TW')).toBe('zh')
    expect(n('AR')).toBe('ar')
    expect(n(' ar ')).toBe('ar')
  })

  it('maps 3-letter ISO 639-2 codes some portals hand back', async () => {
    const { plugin } = await bootPlugin()
    const n = plugin.normalizePlaygamaLanguage
    expect(n('deu')).toBe('de')
    expect(n('zho')).toBe('zh')
    expect(n('ara')).toBe('ar')
    expect(n('jpn')).toBe('ja')
  })

  it('returns null — never a bare code — for a language we do not ship', async () => {
    // Load-bearing: every consumer treats non-null as "safe to apply", so an
    // unshipped language must not be able to knock the player out of their
    // own choice.
    const { plugin } = await bootPlugin()
    expect(plugin.normalizePlaygamaLanguage('sv')).toBeNull()
    expect(plugin.normalizePlaygamaLanguage('')).toBeNull()
    expect(plugin.normalizePlaygamaLanguage('xx-YY')).toBeNull()
  })
})

describe('Playgama LANGUAGE — mid-session switch (the poll)', () => {
  it('publishes a portal language change WITHOUT a reload', async () => {
    // The reported bug: "the platform signal to change the locale did not have
    // any effect." The Bridge exposes no language-change event and Playgama's
    // guided testing tools flip the language without reloading the frame, so
    // only a poll notices.
    vi.useFakeTimers()
    try {
      const { plugin, bridge } = await bootPlugin({ language: 'en', platformId: 'playgama' })
      expect(plugin.playgamaLocale.value).toBe('en')

      // QA flips the portal language mid-session.
      bridge.platform.language = 'ar'
      expect(plugin.playgamaLocale.value).toBe('en')  // not noticed yet

      await vi.advanceTimersByTimeAsync(2500)         // one poll tick
      expect(plugin.playgamaLocale.value).toBe('ar')  // ← the fix
      plugin.__stopPlaygamaLanguageWatch()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not clear a good value when a later read comes back empty', async () => {
    vi.useFakeTimers()
    try {
      const { plugin, bridge } = await bootPlugin({ language: 'ar', platformId: 'playgama' })
      expect(plugin.playgamaLocale.value).toBe('ar')
      bridge.platform.language = ''
      await vi.advanceTimersByTimeAsync(2500)
      expect(plugin.playgamaLocale.value).toBe('ar')
      plugin.__stopPlaygamaLanguageWatch()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores an unsupported mid-session language rather than dropping to null', async () => {
    vi.useFakeTimers()
    try {
      const { plugin, bridge } = await bootPlugin({ language: 'ar', platformId: 'playgama' })
      bridge.platform.language = 'sv'          // never shipped
      await vi.advanceTimersByTimeAsync(2500)
      expect(plugin.playgamaLocale.value).toBe('ar')
      plugin.__stopPlaygamaLanguageWatch()
    } finally {
      vi.useRealTimers()
    }
  })
})
