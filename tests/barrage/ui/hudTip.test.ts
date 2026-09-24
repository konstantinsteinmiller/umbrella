// The HUD name tip (play-test run 3: the chest's "$60" pill and "3:00", and
// the shield charge beside the tray, went unexplained — a `title` never shows
// on touch). A label on demand: it answers a tap, sits beside the tapped
// element (never over the board centre), and goes after TIP_MS or on the next
// pointerdown anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const h = vi.hoisted(() => ({
  stage: null as null | { value: string },
  claim: null as null | ((...a: unknown[]) => unknown),
  playSound: null as null | ((...a: unknown[]) => unknown)
}))

vi.mock('@/barrage/state/useSupplyDrop', async () => {
  const { ref, computed } = await import('vue')
  const stage = ref('cooldown')
  h.stage = stage
  const { vi: v } = await import('vitest')
  const claim = v.fn(() => null)
  h.claim = claim
  const api = {
    stage,
    msLeft: ref(161_000),
    progress: ref(0.1),
    gifts: computed(() => ({ small: 60, big: 240 })),
    arm: () => {},
    claim
  }
  return { default: () => api }
})
vi.mock('@/use/useSound', async () => {
  const { vi: v } = await import('vitest')
  const playSound = v.fn()
  h.playSound = playSound
  return { default: () => ({ playSound }) }
})
vi.mock('@/use/useCoinExplosion', () => ({ spawnCoinExplosion: () => {} }))

import HudTip from '@/components/barrage/HudTip.vue'
import SupplyDropButton from '@/components/barrage/SupplyDropButton.vue'
import { hideHudTip, hudTip, placeTip, showHudTip, TIP_GAP, TIP_MS } from '@/components/barrage/hudTip'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const global = { plugins: [i18n], stubs: { teleport: true } }

const view = { width: 390, height: 844 }

describe('placeTip (the rule)', () => {
  it('centres the plate over the element, above it', () => {
    const p = placeTip({ left: 180, top: 700, width: 30, height: 20 }, { width: 100, height: 40 }, view)
    expect(p.below).toBe(false)
    expect(p.left).toBe(145)
    expect(p.top).toBe(700 - TIP_GAP - 40)
    expect(p.caret).toBe(50)
  })

  it('stays on screen at the edges — its pointer stays on the element', () => {
    const right = placeTip({ left: 360, top: 700, width: 24, height: 24 }, { width: 160, height: 40 }, view)
    expect(right.left + 160).toBe(view.width - TIP_GAP)
    const tipX = right.left + right.caret
    expect(tipX).toBeGreaterThanOrEqual(360)
    expect(tipX).toBeLessThanOrEqual(384)
    const left = placeTip({ left: 0, top: 700, width: 20, height: 20 }, { width: 160, height: 40 }, view)
    expect(left.left).toBe(TIP_GAP)
    expect(left.caret).toBeGreaterThanOrEqual(12)
  })

  it('hangs below an element at the top of the screen', () => {
    const p = placeTip({ left: 180, top: 10, width: 30, height: 20 }, { width: 100, height: 40 }, view)
    expect(p.below).toBe(true)
    expect(p.top).toBe(10 + 20 + TIP_GAP)
  })
})

describe('HudTip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hideHudTip()
  })
  afterEach(() => {
    hideHudTip()
    vi.useRealTimers()
  })

  const anchor = (): HTMLElement => {
    const el = document.createElement('button')
    document.body.appendChild(el)
    el.getBoundingClientRect = () => ({ left: 300, top: 700, width: 20, height: 20, right: 320, bottom: 720, x: 300, y: 700, toJSON: () => ({}) }) as DOMRect
    return el
  }

  it('shows the glyph, the name and the values; a screen reader hears it once', async () => {
    const w = mount(HudTip, { global })
    showHudTip(anchor(), () => ({ icon: 'shield', name: 'Shield charges: 2', facts: [{ icon: 'coin', text: '+60' }], sr: 'Two shields.' }))
    await nextTick()
    await nextTick()
    expect(w.find('.hud-tip').exists()).toBe(true)
    expect(w.find('.hud-tip__name').text()).toBe('Shield charges: 2')
    expect(w.find('.hud-tip__fact--coin').text()).toContain('+60')
    expect(w.find('.hud-tip').attributes('aria-hidden')).toBe('true')
    expect(w.find('[aria-live="polite"]').text()).toContain('Two shields.')
    w.unmount()
  })

  it(`goes after ${TIP_MS} ms, or at the next touch anywhere`, async () => {
    const w = mount(HudTip, { global })
    showHudTip(anchor(), () => ({ icon: 'warcry', name: 'Warcry' }))
    await nextTick()
    vi.advanceTimersByTime(TIP_MS - 100)
    expect(hudTip.value).not.toBeNull()
    vi.advanceTimersByTime(200)
    expect(hudTip.value).toBeNull()

    showHudTip(anchor(), () => ({ icon: 'warcry', name: 'Warcry' }))
    await nextTick()
    window.dispatchEvent(new Event('pointerdown'))
    expect(hudTip.value).toBeNull()
    w.unmount()
  })
})

describe('treasure chest labels', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hideHudTip()
    if (h.stage) h.stage.value = 'cooldown'
  })
  afterEach(() => {
    hideHudTip()
    vi.useRealTimers()
  })

  it('a tap on a filling chest names it: chest, clock + countdown, coin + the gift it fills toward', async () => {
    const w = mount(SupplyDropButton, { props: { coinTarget: null }, global })
    await w.find('button').trigger('click')
    const tip = hudTip.value
    expect(tip).not.toBeNull()
    const c = tip!.content()
    expect(c.icon).toBe('chest')
    expect(c.name).toBe(en.barrageMeta.supply.title)
    expect(c.facts).toEqual([{ icon: 'clock', text: '2:41' }, { icon: 'coin', text: '+60' }])
    expect(c.sr).toBe('Treasure Chest: +60 coins in 2:41')
    // A soft tick, not the "denied" buzz.
    expect(h.playSound).toHaveBeenCalledWith('anchor-swap', expect.any(Number), expect.any(Number))
    w.unmount()
  })

  it('the countdown pill wears a clock; the gift pill a coin before "+N"', async () => {
    const w = mount(SupplyDropButton, { props: { coinTarget: null }, global })
    expect(w.find('.chest__pill--time svg').exists()).toBe(true)
    expect(w.find('.chest__pill--time').text()).toBe('2:41')
    h.stage!.value = 'small'
    await nextTick()
    expect(w.find('.chest__gift img').exists()).toBe(true)
    expect(w.find('.chest__gift').text()).toBe('+60')
    w.unmount()
  })
})
