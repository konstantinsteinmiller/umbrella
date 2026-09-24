// The recall (skip) button under the board. Play-test: shown at EVERY volley it
// read as the button that confirms a shot — first-timers dragged, then tapped
// it, and cut every volley short. It now waits until a volley runs long, and
// never shows while the first-session FTUE runs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import type { Phase } from '@/barrage/engine/types'

const h = vi.hoisted(() => ({
  /** The engine's live state the component polls (plain object, like the engine's). */
  state: { phase: 'aim' as Phase, phaseTime: 0 },
  phase: null as null | { value: Phase },
  speedMul: null as null | { value: number },
  tutorialActive: null as null | { value: boolean },
  recall: vi.fn(),
  playSound: vi.fn()
}))

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref, shallowRef } = await import('vue')
  const phase = ref<Phase>('aim')
  const speedMul = ref(1)
  h.phase = phase
  h.speedMul = speedMul
  const api = {
    phase,
    speedMul,
    engine: shallowRef({ state: h.state }),
    bonusBallsAvailable: ref(false),
    recall: h.recall,
    claimBonusBalls: vi.fn(async () => false)
  }
  return { default: () => api }
})
vi.mock('@/use/useTutorial', async () => {
  const { ref } = await import('vue')
  const tutorialActive = ref(false)
  h.tutorialActive = tutorialActive
  return { tutorialActive }
})
vi.mock('@/use/useSound', () => ({ default: () => ({ playSound: h.playSound }) }))
vi.mock('@/use/useReward', () => ({
  default: () => ({ buffsCostCoins: false, REWARD_COIN_COST: 0 }),
  formatCost: (n: number) => String(n)
}))

import TurnControls from '@/components/barrage/TurnControls.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { recallVisible, RECALL_AFTER_S } from '@/components/barrage/barrageUi'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const refs = () => ({ state: h.state, phase: h.phase!, speedMul: h.speedMul!, tutorialActive: h.tutorialActive! })

/** Enter the volley phase the way the engine does: the clock starts at 0. */
const startVolley = async (): Promise<void> => {
  refs().state.phase = 'volley'
  refs().state.phaseTime = 0
  refs().phase.value = 'volley'
  await nextTick()
}
/** Let the engine's volley clock run to `s` seconds and the poll read it. */
const runTo = async (s: number): Promise<void> => {
  refs().state.phaseTime = s
  vi.advanceTimersByTime(250)
  await nextTick()
}
const recallBtn = (w: ReturnType<typeof mount>) => w.find('.turn-btn--recall')

describe('recallVisible (the rule)', () => {
  it('only in a volley that has run RECALL_AFTER_S, never during the FTUE', () => {
    expect(RECALL_AFTER_S).toBe(2)
    expect(recallVisible('volley', 0, false)).toBe(false)
    expect(recallVisible('volley', 1.99, false)).toBe(false)
    expect(recallVisible('volley', 2, false)).toBe(true)
    expect(recallVisible('volley', 30, true)).toBe(false)
    for (const p of ['aim', 'resolve', 'advance', 'breach'] as const) expect(recallVisible(p, 30, false)).toBe(false)
  })
})

describe('TurnControls recall button', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refs().phase.value = 'aim'
    refs().state.phase = 'aim'
    refs().state.phaseTime = 0
    refs().speedMul.value = 1
    refs().tutorialActive.value = false
    h.recall.mockClear()
  })
  afterEach(() => { vi.useRealTimers() })

  it('is hidden for the first 2 s of a volley, then shows the skip glyph and recalls', async () => {
    const w = mount(TurnControls, { global: { plugins: [i18n] } })
    await startVolley()
    expect(recallBtn(w).exists()).toBe(false)
    await runTo(1.5)
    expect(recallBtn(w).exists()).toBe(false)
    await runTo(2.1)
    expect(recallBtn(w).exists()).toBe(true)
    expect(recallBtn(w).findComponent(BarrageGlyph).props('name')).toBe('skip')
    expect(recallBtn(w).attributes('aria-label')).toBe('Recall balls')
    await recallBtn(w).trigger('click')
    expect(h.recall).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('stays hidden however long the volley runs while the FTUE is active', async () => {
    refs().tutorialActive.value = true
    const w = mount(TurnControls, { global: { plugins: [i18n] } })
    await startVolley()
    await runTo(8)
    expect(recallBtn(w).exists()).toBe(false)
    // The FTUE hands over mid-volley: a long volley gets its skip.
    refs().tutorialActive.value = false
    await nextTick()
    expect(recallBtn(w).exists()).toBe(true)
    w.unmount()
  })

  it('goes away when the volley ends, and the next volley starts its clock over', async () => {
    const w = mount(TurnControls, { global: { plugins: [i18n] } })
    await startVolley()
    await runTo(3)
    expect(recallBtn(w).exists()).toBe(true)
    refs().state.phase = 'resolve'
    refs().phase.value = 'resolve'
    await nextTick()
    expect(recallBtn(w).exists()).toBe(false)
    refs().phase.value = 'aim'
    await nextTick()
    await startVolley()
    await runTo(0.5)
    expect(recallBtn(w).exists()).toBe(false)
    w.unmount()
  })
})
