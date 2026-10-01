// Play-test run 3, the tray and the OVERRUN recap:
//  • a tester started a drag on the tray's orbs and no aim began ("dragging
//    from there upward is the slingshot motion") — a press on the orbs, an
//    empty socket included, now hands the finger to the board;
//  • the shield charge beside the tray went unexplained — a tap names it;
//  • "78 Münzen" beside the wallet's 126 read as a bug — the recap shows what
//    the run EARNED ("+78", "earned this run").
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h as hh, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

interface TrayMock {
  tray: { value: number[] }
  trayCapacity: { value: number }
  phase: { value: string }
  engineGen: { value: number }
  engine: { value: { state: { monsters: Record<string, unknown>[] } } }
}
const hb = vi.hoisted(() => ({ api: null as null | TrayMock }))

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref, shallowRef } = await import('vue')
  const api = {
    tray: ref([2, 1]),
    trayCapacity: ref(3),
    phase: ref('aim'),
    engine: shallowRef({ state: { phase: 'aim', turn: 1, launcherX: 3.5, monsters: [] as unknown[] } }),
    shields: ref(2),
    revives: ref(0),
    warcryArmed: ref(false),
    engineGen: ref(1),
    onEngineEvent: () => () => {},
    // OVERRUN
    breach: ref({
      row: 15, checkpointRow: 0, meteorAvailable: false, reviveAvailable: false, isDaily: false,
      recap: { row: 15, kills: 22, coins: 78 }
    }),
    dailyResult: ref(null),
    // Run 7: the death sequence is over — the death screen is up.
    deathScene: ref(false),
    checkpointRow: ref(0),
    row: ref(15),
    continueWithMeteor: () => {},
    continueWithRevive: () => {},
    restartFromCheckpoint: () => {},
    exitDaily: () => {},
    startDaily: () => {}
  }
  hb.api = api as unknown as TrayMock
  return { default: () => api }
})
vi.mock('@/use/useSound', () => ({ default: () => ({ playSound: () => null }) }))
vi.mock('@/use/useReward', () => ({
  default: () => ({ buffsCostCoins: false, REWARD_COIN_COST: 0 }),
  formatCost: (n: number) => String(n)
}))

import BallTray from '@/components/barrage/BallTray.vue'
import BreachModal from '@/components/barrage/BreachModal.vue'
import { boardApi, type BoardApi } from '@/components/barrage/barrageUi'
import { hideHudTip, hudTip } from '@/components/barrage/hudTip'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const begin = vi.fn<(e: PointerEvent) => boolean>()
const stubBoard = (): BoardApi => ({
  launcherClientPoint: () => null,
  cellToClient: () => null,
  boardClientRect: () => null,
  beginAimFrom: (e) => begin(e),
  overrunDemo: () => 0
})

/** A real press (cancelable, so the handler's preventDefault is observable). */
const press = (el: Element): Event => {
  const ev = new Event('pointerdown', { bubbles: true, cancelable: true })
  el.dispatchEvent(ev)
  return ev
}

describe('tray: aim from the orbs', () => {
  beforeEach(() => {
    begin.mockReset()
    boardApi.value = stubBoard()
    hideHudTip()
  })
  afterEach(() => { boardApi.value = null })

  it('a press on an orb or an empty socket starts an aim on the board', () => {
    const w = mount(BallTray, { global: { plugins: [i18n] } })
    begin.mockReturnValue(true)
    const orb = w.find('.orb')
    expect(orb.exists()).toBe(true)
    const a = press(orb.element)
    expect(begin).toHaveBeenCalledTimes(1)
    expect(a.defaultPrevented).toBe(true)
    const socket = w.find('.tray-socket')
    expect(socket.exists()).toBe(true)
    press(socket.element)
    expect(begin).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('leaves the event alone when the board did not take it (not aiming time)', () => {
    const w = mount(BallTray, { global: { plugins: [i18n] } })
    begin.mockReturnValue(false)
    const ev = press(w.find('.orb').element)
    expect(begin).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(false)
    w.unmount()
  })

  it('the status icons beside the tray do not aim — a tap names them', async () => {
    const w = mount(BallTray, { global: { plugins: [i18n] } })
    const shield = w.find('button.tray-status')
    expect(shield.exists()).toBe(true)
    expect(shield.attributes('aria-label')).toBe('Shield charges: 2')
    press(shield.element)
    expect(begin).not.toHaveBeenCalled()
    await shield.trigger('click')
    const tip = hudTip.value
    expect(tip?.anchor).toBe(shield.element)
    expect(tip?.content()).toMatchObject({ icon: 'shield', name: 'Shield charges: 2' })
    w.unmount()
  })
})

describe('OVERRUN recap', () => {
  const FModal = defineComponent({ setup: (_, { slots }) => () => hh('div', slots.default?.()) })

  it('the coins tile is what the run earned: "+78", "earned this run"', async () => {
    const w = mount(BreachModal, { global: { plugins: [i18n], stubs: { FModal } } })
    await nextTick()
    const coins = w.find('.recap-tile--coins')
    expect(coins.find('.recap-n').text()).toBe('+78')
    expect(coins.find('.recap-label').text()).toBe(en.barrage.breach.recapEarned)
    expect(w.find('.breach-recap').attributes('aria-label')).toBe('This run: row 15, 22 kills, 78 coins earned')
    w.unmount()
  })

  it('run 9: it names the monster that broke through, beside its portrait', async () => {
    const api = hb.api as unknown as { breach: { value: Record<string, unknown> } }
    const was = api.breach.value
    api.breach.value = { ...was, row: 40, culprit: { kind: 'boss', bossKind: 'fire-dragon' } }
    const w = mount(BreachModal, { global: { plugins: [i18n], stubs: { FModal } } })
    await nextTick()
    expect(w.find('.breach-culprit').text()).toBe('Fire Dragon broke through at row 40.')
    expect(w.find('.breach-culprit__face img').exists()).toBe(true)
    api.breach.value = { ...was, culprit: { kind: 'goblin' } }
    await nextTick()
    expect(w.find('.breach-culprit').text()).toBe('Goblin broke through at row 15.')
    // No culprit (an older offer): the plain sentence.
    api.breach.value = was
    await nextTick()
    expect(w.find('.breach-culprit').exists()).toBe(false)
    expect(w.text()).toContain('The monsters broke through at row 15.')
    w.unmount()
  })

  it('One-Tap Comeback: one big icon-only retry leads the screen, above the recap', async () => {
    const api = hb.api as unknown as { restartFromCheckpoint: () => void }
    const spy = vi.fn()
    const was = api.restartFromCheckpoint
    api.restartFromCheckpoint = spy
    const w = mount(BreachModal, { global: { plugins: [i18n], stubs: { FModal } } })
    await nextTick()
    const first = w.findAll('button')[0]!
    expect(first.classes()).toContain('breach-retry')
    expect(first.text()).toBe('')
    expect(first.attributes('aria-label')).toBe(en.barrage.breach.restart.replace('{n}', '1'))
    expect(w.html().indexOf('breach-retry')).toBeLessThan(w.html().indexOf('breach-recap'))
    await first.trigger('click')
    expect(spy).toHaveBeenCalledTimes(1)
    api.restartFromCheckpoint = was
    w.unmount()
  })

  it('One-Tap Comeback: a boss still standing shows its last sliver — no boss, no bar', async () => {
    const api = hb.api as unknown as { breach: { value: Record<string, unknown> } }
    const was = api.breach.value
    api.breach.value = { ...was, culprit: { kind: 'boss', bossKind: 'worm' }, bossLeft: 0.08 }
    const w = mount(BreachModal, { global: { plugins: [i18n], stubs: { FModal } } })
    await nextTick()
    expect(w.find('.breach-near').exists()).toBe(true)
    expect(w.find('.breach-near__fill').attributes('style')).toContain('width: 8%')
    api.breach.value = was
    await nextTick()
    expect(w.find('.breach-near').exists()).toBe(false)
    w.unmount()
  })

  it('run 7: it waits out the death sequence ("WASTED" first), then opens', async () => {
    const Gate = defineComponent({
      props: { modelValue: Boolean },
      setup: (p, { slots }) => () => (p.modelValue ? hh('div', { class: 'modal-open' }, slots.default?.()) : null)
    })
    const api = hb.api as unknown as { deathScene: { value: boolean } }
    api.deathScene.value = true
    const w = mount(BreachModal, { global: { plugins: [i18n], stubs: { FModal: Gate } } })
    await nextTick()
    expect(w.find('.modal-open').exists()).toBe(false)
    api.deathScene.value = false
    await nextTick()
    expect(w.find('.modal-open').exists()).toBe(true)
    expect(w.find('.breach-recap').exists()).toBe(true)
    w.unmount()
  })
})

// Play-test run 4: "what Capacity changes — never noticed a difference". A
// capacity purchase now pays off in the tray itself; and while a monster is
// one march from the line, the orbs tremble.
describe('run 4: the tray', () => {
  const api = () => hb.api!
  beforeEach(() => {
    vi.useFakeTimers()
    boardApi.value = stubBoard()
    api().trayCapacity.value = 3
    api().tray.value = [2, 1]
    api().phase.value = 'aim'
    api().engine.value.state.monsters = []
  })
  afterEach(() => {
    boardApi.value = null
    vi.useRealTimers()
  })

  it('buying Tray Capacity: the new socket drops into the tray and glows, the count flashes — then settles', async () => {
    const w = mount(BallTray, { global: { plugins: [i18n] } })
    await nextTick()
    expect(w.findAll('.tray-slot')).toHaveLength(3)
    expect(w.find('.tray-slot.is-fresh').exists()).toBe(false)
    api().trayCapacity.value = 4
    await nextTick()
    const slots = w.findAll('.tray-slot')
    expect(slots).toHaveLength(4)
    expect(slots.map((s) => s.classes('is-fresh'))).toEqual([false, false, false, true])
    expect(slots[3]!.find('.tray-socket').exists()).toBe(true)
    expect(w.find('.tray-count').classes()).toContain('is-grown')
    vi.advanceTimersByTime(1800)
    await nextTick()
    expect(w.find('.tray-slot.is-fresh').exists()).toBe(false)
    expect(w.find('.tray-count').classes()).not.toContain('is-grown')
    w.unmount()
  })

  it('a new board with a bigger tray (restart, daily) is not a purchase: nothing drops in', async () => {
    const w = mount(BallTray, { global: { plugins: [i18n] } })
    await nextTick()
    api().engineGen.value += 1
    api().trayCapacity.value = 6
    await nextTick()
    expect(w.findAll('.tray-slot')).toHaveLength(6)
    expect(w.find('.tray-slot.is-fresh').exists()).toBe(false)
    w.unmount()
  })

  it('a monster wearing the `1` pip makes the orbs tremble; the volley or a safe board stops it', async () => {
    const w = mount(BallTray, { global: { plugins: [i18n] } })
    await nextTick()
    expect(w.find('.ball-tray').classes()).not.toContain('ball-tray--brink')
    // One march from the line (row 9 of 10), as the next aim opens.
    api().phase.value = 'volley'
    api().engine.value.state.monsters = [
      { id: 1, kind: 'slime', col: 3, row: 9, w: 1, h: 1, frozen: 0, enraged: false }
    ]
    await nextTick()
    api().phase.value = 'aim'
    await nextTick()
    expect(w.find('.ball-tray').classes()).toContain('ball-tray--brink')
    api().phase.value = 'volley'
    await nextTick()
    expect(w.find('.ball-tray').classes()).not.toContain('ball-tray--brink')
    // Two marches out (the `2` pip) is not the brink.
    api().engine.value.state.monsters[0]!.row = 8
    api().phase.value = 'aim'
    await nextTick()
    expect(w.find('.ball-tray').classes()).not.toContain('ball-tray--brink')
    w.unmount()
  })
})
