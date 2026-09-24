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

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref } = await import('vue')
  const api = {
    tray: ref([2, 1]),
    trayCapacity: ref(3),
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
    checkpointRow: ref(0),
    row: ref(15),
    continueWithMeteor: () => {},
    continueWithRevive: () => {},
    restartFromCheckpoint: () => {},
    exitDaily: () => {},
    startDaily: () => {}
  }
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
})
