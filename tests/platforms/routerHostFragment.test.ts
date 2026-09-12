// ─── The blank-screen trap: a host-appended URL fragment ────────────────────
//
// YouTube Playables loads the game as
//
//     .../index.html#debug&origin=https%3A%2F%2Fdevelopers.google.com...
//
// With `createWebHashHistory` that fragment IS our route path: the router
// resolves `/debug&origin=…`, matches nothing, `to.matched` comes back empty,
// `<RouterView>` renders NOTHING — and the player gets a black page behind a
// splash that has already finished. Nothing is logged: vue-router's "No match
// found for location" warning is compiled out of production builds. That is
// how chaos-arena's 2026-09 Playables submission failed while every MUST/SHOULD
// check in YouTube's own suite went green, because the SDK handshake,
// `game_ready` and the cloud save all happen outside the router.
//
// The fix is `createMemoryHistory()` on portal builds. These tests pin BOTH
// halves of why the obvious alternative — a catch-all redirect on top of hash
// history — is not enough: it rewrites `location.hash` to `#/`, and
// `ytgame.js` parses `origin` out of that fragment to address its postMessage
// handshake to the parent frame. You would trade a blank screen for a dead SDK.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createRouter,
  createMemoryHistory,
  createWebHashHistory,
  type RouteRecordRaw
} from 'vue-router'
import { defineComponent, h } from 'vue'
import { routes } from '@/router'

/** The real route table with the lazy view swapped for a marker, so the test
 *  proves the ROUTING without dragging the whole game scene into its graph. */
const Stub = defineComponent({ name: 'Stub', render: () => h('div', 'arena') })
const stubbed = (): RouteRecordRaw[] =>
  routes.map((r) => (r.component ? { ...r, component: Stub } : { ...r }))

const YT_FRAGMENT = '#debug&origin=https%3A%2F%2Fdevelopers.google.com'

const setHash = (hash: string): void => {
  window.location.hash = hash
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  setHash('')
})

describe('router — host-appended fragment', () => {
  it('memory history ignores the fragment entirely and renders the arena', async () => {
    setHash(YT_FRAGMENT)
    const router = createRouter({ history: createMemoryHistory(), routes: stubbed() })
    await router.push('/')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('main')
    // The whole point: something is actually mounted, not an empty view.
    expect(router.currentRoute.value.matched.length).toBeGreaterThan(0)
  })

  it('memory history leaves the host fragment untouched for ytgame.js', async () => {
    // `ytgame.js` reads `origin` out of the fragment to address its
    // postMessage handshake. A history that writes `location.hash` destroys it.
    setHash(YT_FRAGMENT)
    const router = createRouter({ history: createMemoryHistory(), routes: stubbed() })
    await router.push('/')
    await router.isReady()

    expect(window.location.hash).toBe(YT_FRAGMENT)
    expect(window.location.hash).toContain('origin=')
  })

  it('documents the hash-history failure: the fragment becomes the route', async () => {
    setHash(YT_FRAGMENT)
    // A hash router does not navigate until something drives it — mounting the
    // app is what normally does. Replicate that with an explicit replace to
    // the location the history parsed out of the URL.
    const history = createWebHashHistory()
    const router = createRouter({ history, routes: stubbed() })
    await router.replace(history.location)
    await router.isReady()

    // Without the catch-all this is where the screen goes black. With it, the
    // player at least lands somewhere — but see the next test for the price.
    expect(router.currentRoute.value.name).toBe('main')
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no route matched')
    )
  })

  it('and the price of that recovery: the hash is rewritten, SDK handshake lost', async () => {
    setHash(YT_FRAGMENT)
    // A hash router does not navigate until something drives it — mounting the
    // app is what normally does. Replicate that with an explicit replace to
    // the location the history parsed out of the URL.
    const history = createWebHashHistory()
    const router = createRouter({ history, routes: stubbed() })
    await router.replace(history.location)
    await router.isReady()

    expect(window.location.hash).not.toContain('origin=')
  })
})

describe('router — history mode per build', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses memory history on the Playgama build', async () => {
    vi.stubEnv('VITE_APP_PLAYGAMA', 'true')
    vi.resetModules()
    const mod = await import('@/router')
    expect(mod.routerHistoryMode).toBe('memory')
  })

  it('uses memory history on every other portal build too', async () => {
    for (const flag of [
      'VITE_APP_CRAZY_WEB',
      'VITE_APP_POKI',
      'VITE_APP_GAMEPIX',
      'VITE_APP_YANDEX',
      'VITE_APP_GAME_DISTRIBUTION'
    ]) {
      vi.unstubAllEnvs()
      vi.stubEnv(flag, 'true')
      vi.resetModules()
      const mod = await import('@/router')
      expect(mod.routerHistoryMode, flag).toBe('memory')
    }
  })

  it('keeps hash history off-portal, where deep links matter', async () => {
    vi.unstubAllEnvs()
    vi.resetModules()
    const mod = await import('@/router')
    expect(mod.routerHistoryMode).toBe('hash')
  })
})

describe('router — the catch-all is still there as a net', () => {
  it('redirects an unmatched path to the arena and warns loudly', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: stubbed() })
    await router.push('/whatever-a-portal-invents')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('main')
    // The warn is NOT dev-only on purpose: it is the whole diagnosis the next
    // time a host decides to route us somewhere new, and it has to survive
    // into the production bundle QA actually runs.
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[router] no route matched')
    )
  })
})
