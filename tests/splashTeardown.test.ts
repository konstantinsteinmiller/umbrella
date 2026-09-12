import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

/**
 * ─── The splash must never outlive the loading screen ───────────────────────
 *
 * The loading backdrop is `position: fixed; inset: 0; z-index: 150` and OPAQUE.
 * If it is still in the DOM once the game is up, the player — or a screenshot
 * tool, or a playtest recording — sees a featureless dark rectangle with a
 * perfectly healthy game running underneath it. That is exactly what shipped:
 * the backdrop and the logo were unmounted by a Vue `<Transition>`, and Vue
 * schedules a transition's `-leave-to` class inside a `requestAnimationFrame`,
 * unmounting only on the resulting `transitionend`. A page that gets NO
 * animation frames during the ~0.5 s fade never gets that frame and the
 * backdrop stays at opacity 1 forever.
 *
 * Frames stop exactly like that for a background/occluded tab, a hidden or
 * offscreen iframe, and any headless screenshot or session-recording harness
 * that never drives the compositor — i.e. for every tool that reported a black
 * screen. So the contract this pins is: **the splash teardown is driven by
 * timers, never by animation frames.** `requestAnimationFrame` below is stubbed
 * to never call back, which is what a frame-starved page looks like from
 * inside.
 */

const assets = vi.hoisted(() => ({ progress: { value: 0 } }))

vi.mock('@/use/useAssets', async () => {
  const { ref: r } = await import('vue')
  assets.progress = r(0)
  return {
    default: () => ({
      loadingProgress: assets.progress,
      preloadAssets: () => Promise.resolve(),
      resourceCache: { images: new Map(), audioBuffers: new Map() }
    })
  }
})
vi.mock('@/use/useCrazyGames', () => ({ stopLoading: vi.fn(), startGameplay: vi.fn() }))
vi.mock('@/use/useFirstLoadInterstitial', () => ({
  armFirstLoadInterstitial: vi.fn(),
  notifySplashGone: vi.fn()
}))

import FLogoProgress from '@/components/atoms/FLogoProgress.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
// `stubs: { transition: false }` is load-bearing: test-utils replaces
// `<Transition>` with a pass-through stub by default, which toggles `v-if`
// directly and never touches `requestAnimationFrame` — i.e. the default mount
// cannot see this bug at all. Real transitions run here.
const render = () => mount(FLogoProgress, {
  global: { plugins: [i18n], stubs: { transition: false } },
  attachTo: document.body
})

/**
 * Advance virtual time in small steps, letting Vue's `watch` callbacks (flush:
 * 'pre', i.e. a microtask) run between them — each stage of the teardown
 * schedules the next one from inside a watcher, so one big jump would advance
 * past timers that have not been created yet.
 */
const tick = async (ms: number) => {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    vi.advanceTimersByTime(50)
    await nextTick()
    await nextTick()
  }
}

/** The whole splash: the opaque backdrop and the centred logo. Queried off the
 *  document, not the wrapper — an element stranded mid-leave is still ON the
 *  page covering the game, whatever the wrapper's root resolution says. */
const splashParts = () => ({
  backdrop: !!document.querySelector('.splash-backdrop'),
  logo: !!document.querySelector('.splash-logo, [class*="logo-fade"]')
})

let rafCalls = 0

beforeEach(() => {
  vi.useFakeTimers()
  assets.progress.value = 0
  rafCalls = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the loading splash', () => {
  it('clears itself on a page that never gets an animation frame', async () => {
    // A frame-starved page: rAF accepts callbacks and never runs them.
    vi.stubGlobal('requestAnimationFrame', () => { rafCalls += 1; return 0 })

    const w = render()
    expect(splashParts().backdrop).toBe(true)

    assets.progress.value = 100
    await nextTick()

    // 100 ms settle → `done`; +350 fade → the logo goes; `done` +150 starts the
    // backdrop fade, +400 more removes it. Generous slack on top.
    await tick(2000)

    expect(splashParts()).toEqual({ backdrop: false, logo: false })
    // Nothing may be left mid-leave either — a stranded `-leave-active` element
    // is the same opaque rectangle under a different name.
    expect(document.body.innerHTML).not.toContain('leave-active')
    w.unmount()
  })

  it('clears itself even when the asset loader never reports 100%', async () => {
    // Offline / blocked images: `done` comes from the 4 s hard fallback instead.
    vi.stubGlobal('requestAnimationFrame', () => { rafCalls += 1; return 0 })

    const w = render()
    await tick(6000)

    expect(splashParts()).toEqual({ backdrop: false, logo: false })
    w.unmount()
  })

  it('never asks for an animation frame in the first place', async () => {
    // The control arm: frames ARE available (rAF runs its callback straight
    // away). The splash still clears — and it does so without ever calling rAF,
    // which is the contract. A `<Transition>` reintroduced around either half of
    // the splash would push this count above zero and fail here first.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCalls += 1
      cb(0)
      return 0
    })

    const w = render()
    assets.progress.value = 100
    await nextTick()
    await tick(2000)

    expect(splashParts()).toEqual({ backdrop: false, logo: false })
    expect(rafCalls).toBe(0)
    w.unmount()
  })
})
