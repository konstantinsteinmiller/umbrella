// The upgrade chips. Play-test run 1: a tap on a chip you cannot afford "did
// nothing" (a 3 px wiggle, a denied sound at ~1 % gain). Run 2: the denial
// fired but reached only the screen reader — unaffordable prices were already
// red — and nobody bought a paid upgrade with 115–284 coins in the wallet.
// Now: affordable chips glow gold, short prices are grey, and a refused tap
// shakes the chip, flashes its price red, pops "need N more" above it, pulses
// the wallet and gives the screen a small shake.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick, type Ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import type { UpgradeId, UpgradeView } from '@/barrage/state/contract'
import useEpicConfig from '@/use/useEpicConfig'
import { chipPulse } from '@/use/useCoach'
import { walletDenied } from '@/components/barrage/barrageUi'
import { hideHudTip, hudTip, LONG_PRESS_MS } from '@/components/barrage/hudTip'

const h = vi.hoisted(() => ({
  buy: vi.fn((_id: string) => false),
  claim: vi.fn(),
  playSound: vi.fn(),
  shake: vi.fn()
}))

vi.mock('@/barrage/state/useBarrageUpgrades', async () => {
  const { computed, ref } = await import('vue')
  const views = ref<UpgradeView[]>([])
  const free = ref(false)
  const api = {
    list: computed(() => views.value),
    glowingId: computed(() => null),
    freeCapacityOffer: computed(() => free.value),
    freeId: computed(() => (free.value ? 'capacity' : null)),
    buy: h.buy,
    claimFreeCapacity: h.claim,
    claimFree: h.claim
  }
  return { default: () => api, __views: views, __free: free }
})
vi.mock('@/use/useSound', () => ({ default: () => ({ playSound: h.playSound }) }))
vi.mock('@/use/usePrismParticles', () => ({ emitSparkle: vi.fn() }))
vi.mock('@/use/useScreenshake', () => ({ default: () => ({ triggerShake: h.shake, shakeStyle: {} }) }))

import UpgradeBar from '@/components/barrage/UpgradeBar.vue'
import * as upgradesMock from '@/barrage/state/useBarrageUpgrades'

const mocked = upgradesMock as unknown as { __views: Ref<UpgradeView[]>; __free: Ref<boolean> }

const view = (id: UpgradeId, cost: number, affordable: boolean, glowing = false): UpgradeView =>
  ({ id, level: 1, maxed: false, cost, affordable, glowing, value: 1.25, nextValue: 1.56 })

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const render = () => mount(UpgradeBar, { global: { plugins: [i18n], stubs: { RuneFrame: true } }, attachTo: document.body })
const chip = (w: ReturnType<typeof render>, id: UpgradeId) => w.find(`[data-upgrade-id="${id}"]`)
/** jsdom lays nothing out: give a chip a real box so the callout can sit over it. */
const placeChip = (w: ReturnType<typeof render>, id: UpgradeId): void => {
  const el = chip(w, id).element as HTMLElement
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 10, top: 700, width: 70, height: 60, right: 80, bottom: 760, x: 10, y: 700, toJSON: () => ({})
  } as DOMRect)
}
const callout = (): string | null => document.body.querySelector('.chip-need')?.textContent?.trim() ?? null

describe('upgrade chips', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    mocked.__free.value = false
    mocked.__views.value = [view('damage', 120, false), view('capacity', 40, true, true), view('speed', 90, true), view('luck', 80, false), view('bounty', 70, false)]
    h.buy.mockClear()
    h.claim.mockClear()
    h.playSound.mockClear()
    h.shake.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('a quiet gold glow on every affordable chip but the one glowing chip; short prices are grey', async () => {
    const w = render()
    await nextTick()
    expect(chip(w, 'capacity').classes()).toContain('chip--glow')
    expect(chip(w, 'capacity').classes()).not.toContain('chip--afford')
    expect(chip(w, 'speed').classes()).toContain('chip--afford')
    expect(chip(w, 'speed').classes()).not.toContain('chip--glow')
    for (const id of ['damage', 'luck', 'bounty'] as const) {
      expect(chip(w, id).classes()).not.toContain('chip--afford')
      expect(chip(w, id).find('.chip-cost').classes()).toContain('chip-cost--short')
    }
    // A maxed chip never glows, however rich the player.
    mocked.__views.value = [{ ...view('speed', 0, false), maxed: true }, view('damage', 10, true, true)]
    await nextTick()
    expect(chip(w, 'speed').classes()).not.toContain('chip--afford')
    w.unmount()
  })

  it('nothing but the FREE chip is lit while the free Tray Capacity is on offer', async () => {
    mocked.__free.value = true
    const w = render()
    await nextTick()
    expect(chip(w, 'capacity').classes()).toContain('chip--glow')
    expect(chip(w, 'speed').classes()).not.toContain('chip--afford')
    w.unmount()
  })

  it('a refused tap: shake, red price, "need N more" over the chip, wallet pulse, small screenshake, sound, sr line', async () => {
    const w = render()
    await nextTick()
    placeChip(w, 'damage')
    const pulses = walletDenied.value
    await chip(w, 'damage').trigger('click')
    expect(h.buy).toHaveBeenCalledWith('damage')
    const [name, gain] = h.playSound.mock.calls[0]! as [string, number]
    expect(name).toBe('upgrade-denied')
    expect(gain).toBeGreaterThanOrEqual(0.04)
    expect(h.shake).toHaveBeenCalledWith('small')
    expect(walletDenied.value).toBe(pulses + 1)
    vi.advanceTimersToNextFrame()
    await nextTick()
    expect(chip(w, 'damage').classes()).toContain('chip--shake')
    expect(chip(w, 'damage').find('.chip-cost').classes()).toContain('chip-cost--denied')
    const short = 120 - useEpicConfig().coins.value
    // Run 10: what it would buy, under the shortfall.
    expect(callout()).toBe(`Need ${short} more${en.barrage.upgrades.damage.desc}`)
    expect(document.body.querySelector('.chip-need__desc')?.textContent).toBe(en.barrage.upgrades.damage.desc)
    expect(w.find('.sr-only[aria-live]').text()).toBe('Not enough coins: you need 120.')
    // Only the tapped chip reacts.
    expect(chip(w, 'luck').classes()).not.toContain('chip--shake')
    // The shake settles first; the callout stays readable longer (~2.5 s with its effect line).
    vi.advanceTimersByTime(700)
    await nextTick()
    expect(chip(w, 'damage').classes()).not.toContain('chip--shake')
    expect(chip(w, 'damage').find('.chip-cost').classes()).not.toContain('chip-cost--denied')
    expect(callout()).not.toBeNull()
    vi.advanceTimersByTime(1900)
    await nextTick()
    await nextTick()
    expect(document.body.querySelector('.chip-need')).toBeNull()
    w.unmount()
  })

  it('reduced motion keeps every signal but the screenshake', async () => {
    const mm = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const had = window.matchMedia
    ;(window as unknown as { matchMedia: unknown }).matchMedia = mm
    try {
      const w = render()
      await nextTick()
      placeChip(w, 'damage')
      await chip(w, 'damage').trigger('click')
      expect(h.shake).not.toHaveBeenCalled()
      expect(callout()).not.toBeNull()
      w.unmount()
    } finally {
      ;(window as unknown as { matchMedia: unknown }).matchMedia = had
    }
  })

  it('an affordable chip buys instead of denying', async () => {
    h.buy.mockImplementation((id: string) => id === 'speed')
    const w = render()
    await nextTick()
    await chip(w, 'speed').trigger('click')
    expect(h.playSound.mock.calls[0]?.[0]).toBe('upgrade-buy')
    expect(h.shake).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    await nextTick()
    expect(chip(w, 'speed').classes()).not.toContain('chip--shake')
    expect(callout()).toBeNull()
    w.unmount()
    h.buy.mockImplementation(() => false)
  })

  it("the coach's pulse plays once on the chip it names", async () => {
    const w = render()
    await nextTick()
    chipPulse.value = { id: 'capacity', seq: 1 }
    await nextTick()
    vi.advanceTimersToNextFrame()
    await nextTick()
    expect(chip(w, 'capacity').classes()).toContain('chip--pulse')
    expect(chip(w, 'speed').classes()).not.toContain('chip--pulse')
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(chip(w, 'capacity').classes()).not.toContain('chip--pulse')
    w.unmount()
  })

  it('run 7: while the FREE offer is up, ANY chip tap claims it — no denial, no redirect', async () => {
    // p3/010: Leo aimed at the FREE Capacity chip, hit Damage beside it, read
    // the old redirect as "nothing happens" and never tapped a chip again.
    mocked.__free.value = true
    const w = render()
    await nextTick()
    placeChip(w, 'damage')
    mocked.__views.value = [view('damage', 120, false), view('capacity', 40, false), view('speed', 90, false), view('luck', 80, false), view('bounty', 70, false)]
    await nextTick()
    const pulses = walletDenied.value
    await chip(w, 'damage').trigger('click')
    expect(h.claim).toHaveBeenCalledTimes(1)
    expect(h.buy).not.toHaveBeenCalled()
    expect(h.playSound.mock.calls[0]?.[0]).toBe('upgrade-buy')
    vi.advanceTimersToNextFrame()
    await nextTick()
    // The gift lands on the Capacity chip (its flare), whichever chip was tapped.
    expect(chip(w, 'capacity').classes()).toContain('chip--flare')
    expect(chip(w, 'damage').classes()).not.toContain('chip--flare')
    expect(callout()).toBeNull()
    expect(chip(w, 'damage').classes()).not.toContain('chip--shake')
    expect(walletDenied.value).toBe(pulses)
    expect(h.shake).not.toHaveBeenCalled()
    // Once it is claimed, a short tap is an ordinary denial again.
    mocked.__free.value = false
    await nextTick()
    placeChip(w, 'damage')
    await chip(w, 'damage').trigger('click')
    await nextTick()
    expect(callout()).not.toBeNull()
    w.unmount()
  })

  it('run 10: one tap buys one level — the glowing chip too; no "▲N" (Jonas: 89 coins on one tap read as a bug)', async () => {
    h.buy.mockImplementation((id: string) => id === 'capacity')
    const w = render()
    await nextTick()
    await chip(w, 'capacity').trigger('click')
    expect(h.buy).toHaveBeenCalledTimes(1)
    expect(h.buy).toHaveBeenCalledWith('capacity')
    expect(h.playSound.mock.calls[0]?.[0]).toBe('upgrade-buy')
    vi.advanceTimersToNextFrame()
    await nextTick()
    expect(chip(w, 'capacity').classes()).toContain('chip--flare')
    expect(w.find('.chip-levels').exists()).toBe(false)
    w.unmount()
    h.buy.mockImplementation(() => false)
  })

  it('run 10: the first purchase of each chip names what it bought (the name plate); the next one does not', async () => {
    h.buy.mockImplementation((id: string) => id === 'luck')
    const w = render()
    await nextTick()
    hideHudTip()
    await chip(w, 'luck').trigger('click')
    const tip = hudTip.value?.content()
    expect(tip?.name).toBe(en.barrage.upgrades.luck.name)
    expect(tip?.facts?.[0]?.text).toBe(en.barrage.upgrades.luck.desc)
    hideHudTip()
    await chip(w, 'luck').trigger('click')
    expect(hudTip.value).toBeNull()
    w.unmount()
    h.buy.mockImplementation(() => false)
  })

  it('the callout is anchored on the chip tapped: its tail points at it even when the pill shifts to stay on screen', async () => {
    const w = render()
    await nextTick()
    // A chip hard against the left edge (its centre at x = 35).
    const el = chip(w, 'damage').element as HTMLElement
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 700, width: 70, height: 60, right: 70, bottom: 760, x: 0, y: 700, toJSON: () => ({})
    } as DOMRect)
    // The pill's LAYOUT width (it enters scaled down: a transformed rect is
    // narrower than the pill that ends up on screen).
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('chip-need') ? 120 : 0
    })
    await chip(w, 'damage').trigger('click')
    await nextTick()
    await nextTick()
    const pill = document.body.querySelector<HTMLElement>('.chip-need')!
    expect(pill).not.toBeNull()
    // The 120 px pill is shifted right to stay on screen (4 px margin)…
    expect(pill.style.left).toBe('64px')
    // …its tail stays on the chip's centre, and it stands on the chip's top edge.
    expect(pill.style.getPropertyValue('--tail')).toBe('-29px')
    expect(pill.style.top).toBe('696px')
    w.unmount()
  })

  it('run 9: a claimed gift says so — "Free" in green by the chip\'s new price (Dev: "a purchase that didn\'t deduct coins")', async () => {
    mocked.__free.value = true
    const w = render()
    await nextTick()
    await chip(w, 'damage').trigger('click')
    expect(h.claim).toHaveBeenCalledTimes(1)
    // The gift is taken: the chip shows its next price again — and the pill.
    mocked.__free.value = false
    await nextTick()
    const pill = chip(w, 'capacity').find('.chip-levels')
    expect(pill.exists()).toBe(true)
    expect(pill.classes()).toContain('chip-levels--gift')
    expect(pill.text()).toBe(en.barrage.upgrades.free)
    w.unmount()
  })

  it('run 9: a long press names the chip and says what it does — and buys nothing (Jonas: "what GLÜCK affects")', async () => {
    const w = render()
    await nextTick()
    hideHudTip()
    await chip(w, 'speed').trigger('pointerdown')
    vi.advanceTimersByTime(LONG_PRESS_MS + 10)
    const tip = hudTip.value?.content()
    expect(tip?.name).toBe(en.barrage.upgrades.speed.name)
    expect(tip?.facts?.[0]?.text).toBe(en.barrage.upgrades.speed.desc)
    await chip(w, 'speed').trigger('click')
    expect(h.buy).not.toHaveBeenCalled()
    // A short tap after it buys as ever (and, a first purchase, names the chip).
    hideHudTip()
    await chip(w, 'speed').trigger('pointerdown')
    vi.advanceTimersByTime(100)
    await chip(w, 'speed').trigger('click')
    expect(h.buy).toHaveBeenCalledWith('speed')
    w.unmount()
  })

  it('the denied sound resolves to a file that ships', async () => {
    const { SFX_FALLBACKS } = await vi.importActual<typeof import('@/use/useSound')>('@/use/useSound')
    const file = SFX_FALLBACKS['upgrade-denied']
    expect(file).toBeTruthy()
    const shipped = (n: string) => existsSync(resolve(__dirname, '../../../public/audio/sfx', `${n}.ogg`))
    // Either its own file shipped, or its placeholder did.
    expect(shipped('upgrade-denied') || shipped(file!)).toBe(true)
  })
})
