// GameMonetize integration contract — the parts that are not ad fill:
//
//   1. The plugin PUBLISHES `isGameMonetizeAdShowing` on SDK_GAME_PAUSE /
//      SDK_GAME_START and never drives the pause gate itself; ONE app-shell
//      watcher (`installPlatformPauseSource`) maps it onto the platform pause,
//      which stops the loop AND silences audio (no settings write).
//   2. A cycle that ends on a TIMER (no SDK_GAME_START) lowers the ref itself.
//   3. Two caps: ~6 s never-opened (no-fill), ~60 s opened-never-finished; the
//      impression edge (SDK_GAME_PAUSE) cancels the short cap.
//   4. No child-directed flag in SDK_OPTIONS (owner decision: web portals
//      never set one).
//   5. The registry descriptor is a descriptor only, and the plugin stub that
//      other builds alias to exposes the same surface.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/use/useUser', () => ({ isGameMonetize: true }))
vi.mock('@/use/useMatch', async () => {
  const { ref } = await import('vue')
  return { isDebug: ref(false) }
})
vi.mock('@/utils/save/GameMonetizeStrategy', () => ({ GameMonetizeStrategy: class {} }))

const ROOT = resolve(__dirname, '../..')

const loadPlugin = async () => {
  vi.resetModules()
  return await import('@/utils/gameMonetizePlugin')
}
const emit = (name: string): void => {
  const onEvent = (window as any).SDK_OPTIONS?.onEvent
  if (typeof onEvent === 'function') onEvent({ name })
}
const initWith = async (sdkShape: any) => {
  const plugin = await loadPlugin()
  ;(window as any).sdk = sdkShape
  const ready = plugin.gameMonetizePlugin()
  emit('SDK_READY')
  await ready
  return plugin
}

describe('gameMonetizePlugin — pause signal, caps, SDK options', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_GAME_ID', 'test-game')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null))))
    delete (window as any).sdk
    delete (window as any).SDK_OPTIONS
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    delete (window as any).sdk
    delete (window as any).SDK_OPTIONS
  })

  it('sets no child-directed flag in SDK_OPTIONS', async () => {
    await initWith({ showBanner: vi.fn() })
    const opts = (window as any).SDK_OPTIONS
    expect(opts.gameId).toBe('test-game')
    expect(Object.keys(opts).sort()).toEqual(['gameId', 'onEvent'])
  })

  it('publishes the ad-showing ref on SDK_GAME_PAUSE / SDK_GAME_START', async () => {
    const plugin = await initWith({ showBanner: vi.fn() })
    expect(plugin.isGameMonetizeAdShowing.value).toBe(false)
    emit('SDK_GAME_PAUSE')
    expect(plugin.isGameMonetizeAdShowing.value).toBe(true)
    emit('SDK_GAME_START')
    expect(plugin.isGameMonetizeAdShowing.value).toBe(false)
  })

  it('does not import the pause gate (the app shell owns that edge)', () => {
    const code = readFileSync(resolve(ROOT, 'src/utils/gameMonetizePlugin.ts'), 'utf-8')
    expect(code).not.toMatch(/from '@\/use\/useGamePause'/)
  })

  it('an interstitial that opened but never closed is capped at ~60 s and lowers the ref', async () => {
    const plugin = await initWith({ showBanner: vi.fn() })
    let done = false
    void plugin.showMidgameAdGM().then(() => { done = true })
    emit('SDK_GAME_PAUSE') // impression — cancels the never-opened cap
    await vi.advanceTimersByTimeAsync(plugin.NO_FILL_MS + 1000)
    expect(done).toBe(false) // a real ad is not guillotined by the short cap
    expect(plugin.isGameMonetizeAdShowing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(plugin.AD_OPEN_CAP_MS)
    expect(done).toBe(true)
    expect(plugin.isGameMonetizeAdShowing.value).toBe(false)
  })

  it('a rewarded ad that opened but never closed is capped and lowers the ref (no grant)', async () => {
    const plugin = await initWith({ showBanner: vi.fn() })
    const p = plugin.showRewardedAdGM()
    emit('SDK_GAME_PAUSE')
    await vi.advanceTimersByTimeAsync(plugin.NO_FILL_MS + 1000)
    expect(plugin.isGameMonetizeAdShowing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(plugin.AD_OPEN_CAP_MS)
    await expect(p).resolves.toBe(false)
    expect(plugin.isGameMonetizeAdShowing.value).toBe(false)
  })

  it('a pause raised outside any show call is lowered by the page-lifetime safety cap', async () => {
    const plugin = await initWith({ showBanner: vi.fn() })
    emit('SDK_GAME_PAUSE')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(plugin.AD_OPEN_CAP_MS - 1)
    expect(plugin.isGameMonetizeAdShowing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(2)
    expect(plugin.isGameMonetizeAdShowing.value).toBe(false)
  })

  it('never opened → treated as a no-fill after ~6 s (not sub-second, not a minute)', async () => {
    const plugin = await initWith({ showBanner: vi.fn() })
    expect(plugin.NO_FILL_MS).toBeGreaterThanOrEqual(4000)
    expect(plugin.NO_FILL_MS).toBeLessThanOrEqual(8000)
    let done = false
    void plugin.showMidgameAdGM().then(() => { done = true })
    await vi.advanceTimersByTimeAsync(plugin.NO_FILL_MS - 100)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(done).toBe(true)
  })

  it('a no-fill does not drop a pause something else raised (consent wall)', async () => {
    const plugin = await initWith({ showBanner: vi.fn() })
    emit('SDK_GAME_PAUSE') // consent wall, before our call
    const p = plugin.showMidgameAdGM()
    await vi.advanceTimersByTimeAsync(plugin.NO_FILL_MS + 10)
    await p
    expect(plugin.isGameMonetizeAdShowing.value).toBe(true)
    emit('SDK_GAME_START')
    expect(plugin.isGameMonetizeAdShowing.value).toBe(false)
  })
})

describe('installPlatformPauseSource — the one app-shell watcher', () => {
  it('stops the loop and the audio while the source is up, and resumes after', async () => {
    vi.resetModules()
    const { ref } = await import('vue')
    const gate = await import('@/use/useGamePause')
    const src = ref(false)
    const stop = gate.installPlatformPauseSource(src)
    expect(gate.isGamePaused.value).toBe(false)
    src.value = true
    // flush: 'sync' — no tick in which the game runs under the ad
    expect(gate.isPlatformPaused.value).toBe(true)
    expect(gate.isGamePaused.value).toBe(true)
    expect(gate.isAudioPaused.value).toBe(true)
    src.value = false
    expect(gate.isGamePaused.value).toBe(false)
    expect(gate.isAudioPaused.value).toBe(false)
    stop()
  })

  it('a source already up at install pauses immediately', async () => {
    vi.resetModules()
    const { ref } = await import('vue')
    const gate = await import('@/use/useGamePause')
    const stop = gate.installPlatformPauseSource(ref(true))
    expect(gate.isGamePaused.value).toBe(true)
    stop()
    gate.resumeGame()
  })

  it('App.vue installs it for GameMonetize behind a static env literal', () => {
    const app = readFileSync(resolve(ROOT, 'src/App.vue'), 'utf-8')
    expect(app).toMatch(/if \(import\.meta\.env\.VITE_APP_GAME_MONETIZE === 'true'\) \{\s*installPlatformPauseSource\(isGameMonetizeAdShowing\)/)
  })
})

describe('GameMonetize build plumbing', () => {
  it('the registry descriptor exports the descriptor and nothing else', async () => {
    const mod = await import('@/platforms/gamemonetize')
    expect(Object.keys(mod)).toEqual(['platform'])
    expect(mod.platform.id).toBe('gamemonetize')
    expect(mod.platform.capabilities.hasCloudSave).toBe(false)
    expect(mod.platform.capabilities.hasAds).toBe(true)
    expect(mod.platform.capabilities.childDirectedAdSignal).toBe(false)
  })

  it('the plugin stub (aliased on every other build) exposes the same surface', async () => {
    vi.resetModules()
    const real = await import('@/utils/gameMonetizePlugin')
    const stub = await import('@/utils/gameMonetizePlugin.stub')
    expect(Object.keys(stub).sort()).toEqual(Object.keys(real).sort())
    const stubCode = readFileSync(resolve(ROOT, 'src/utils/gameMonetizePlugin.stub.ts'), 'utf-8')
    expect(stubCode).not.toMatch(/https?:\/\//)
  })

  it('vite.config aliases the plugin AND the provider to stubs off the GameMonetize build', () => {
    const cfg = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf-8')
    const block = cfg.match(/VITE_APP_GAME_MONETIZE === 'true' \? \{\} : \{([\s\S]*?)\}\)/)
    expect(block).not.toBeNull()
    expect(block![1]).toMatch(/'@\/use\/ads\/GameMonetizeProvider':.*GameMonetizeProvider\.stub\.ts/)
    expect(block![1]).toMatch(/'@\/utils\/gameMonetizePlugin':.*gameMonetizePlugin\.stub\.ts/)
  })

  it('the build fails when two platform flags are on (GameMonetize is in the guard)', () => {
    const cfg = readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf-8')
    const list = cfg.match(/const PLATFORM_FLAGS = \[([\s\S]*?)\]/)
    expect(list![1]).toContain('\'VITE_APP_GAME_MONETIZE\'')
  })
})
