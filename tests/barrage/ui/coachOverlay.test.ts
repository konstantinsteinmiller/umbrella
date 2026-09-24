// The coach overlay's side of the overrun lesson (the lose rule, play-test
// run 3): the board plays the demo on its canvas (`boardApi.overrunDemo`); the
// overlay starts it the first frame it may be seen — the FTUE's hand steps
// aside for it — counts it only when the board really played it, keeps the
// one-lesson channel for its length and hands the aim back when it is over or
// the player takes the board.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const h = vi.hoisted(() => ({
  refs: null as null | {
    phase: { value: string }
    holdSim: { value: boolean }
    tutorialActive: { value: boolean }
    tutorialPreview: { value: string | null }
    unlocking: { value: unknown }
    modal: { value: boolean }
    reveal: { value: unknown }
    mergeBox: { value: unknown }
  }
}))

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref, shallowRef } = await import('vue')
  const phase = ref('aim')
  const holdSim = ref(false)
  const api = {
    phase,
    holdSim,
    engine: shallowRef({ state: { launcherX: 3.5, monsters: [], pickups: [] }, aimPreview: () => ({ points: [] }) })
  }
  h.refs = { ...(h.refs ?? {}), phase, holdSim } as NonNullable<typeof h.refs>
  return { default: () => api }
})
vi.mock('@/use/useTutorial', async () => {
  const { ref } = await import('vue')
  const tutorialActive = ref(false)
  const tutorialPreview = ref<string | null>(null)
  h.refs = { ...(h.refs ?? {}), tutorialActive, tutorialPreview } as NonNullable<typeof h.refs>
  return { tutorialActive, tutorialPreview }
})
vi.mock('@/use/useFeatureUnlocks', async () => {
  const { ref } = await import('vue')
  const unlocking = ref<unknown>(null)
  h.refs = { ...(h.refs ?? {}), unlocking } as NonNullable<typeof h.refs>
  return { unlocking }
})
vi.mock('@/use/useModalState', async () => {
  const { ref } = await import('vue')
  const isAnyModalOpen = ref(false)
  h.refs = { ...(h.refs ?? {}), modal: isAnyModalOpen } as NonNullable<typeof h.refs>
  return { isAnyModalOpen }
})
vi.mock('@/use/useTierReveal', async () => {
  const { ref } = await import('vue')
  const activeReveal = ref<unknown>(null)
  h.refs = { ...(h.refs ?? {}), reveal: activeReveal } as NonNullable<typeof h.refs>
  return { activeReveal }
})
vi.mock('@/components/barrage/mergeLightbox', async () => {
  const { ref } = await import('vue')
  const mergeBox = ref<unknown>(null)
  h.refs = { ...(h.refs ?? {}), mergeBox } as NonNullable<typeof h.refs>
  return { mergeBox }
})

import CoachOverlay from '@/components/barrage/coach/CoachOverlay.vue'
import { boardApi, playerAiming, type BoardApi } from '@/components/barrage/barrageUi'
import { coachLesson, lessonShown } from '@/use/useCoach'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const r = () => h.refs!

const demo = vi.fn<(id: number) => number>()
const stubBoard = (): BoardApi => ({
  launcherClientPoint: () => ({ x: 195, y: 600 }),
  cellToClient: (x, y) => ({ x: 20 + x * 50, y: 80 + y * 50 }),
  boardClientRect: () => null,
  beginAimFrom: () => false,
  overrunDemo: (id) => demo(id)
})

let seq = 900
const overrun = (monsterId = 7) => {
  const l = { id: 'overrun' as const, seq: ++seq, monsterId }
  coachLesson.value = l
  return l
}

const render = () => mount(CoachOverlay, {
  global: {
    plugins: [i18n],
    stubs: { teleport: true, FingerDemo: true, TrayDemo: true, TrayIntroDemo: true, UpgradeFunnel: true }
  }
})

describe('overrun demo in the coach overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    demo.mockReset()
    boardApi.value = stubBoard()
    playerAiming.value = false
    r().phase.value = 'aim'
    r().holdSim.value = false
    r().tutorialActive.value = false
    r().tutorialPreview.value = null
    r().unlocking.value = null
    r().modal.value = false
    r().reveal.value = null
    r().mergeBox.value = null
    coachLesson.value = null
  })
  afterEach(() => {
    coachLesson.value = null
    vi.useRealTimers()
  })

  it('plays it on the board, counts it, reads the rule out, and ends when the board says it is over', async () => {
    demo.mockReturnValue(1800)
    const w = render()
    const before = lessonShown('overrun')
    overrun(7)
    await nextTick()
    expect(demo).toHaveBeenCalledTimes(1)
    expect(demo).toHaveBeenCalledWith(7)
    expect(lessonShown('overrun')).toBe(before + 1)
    expect(w.text()).toContain(en.barrage.coach.overrun)
    // Re-renders do not replay or recount it.
    await nextTick()
    expect(demo).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1700)
    expect(coachLesson.value?.id).toBe('overrun')
    vi.advanceTimersByTime(200)
    expect(coachLesson.value).toBeNull()
    w.unmount()
  })

  it('a board that has not drawn the monster yet (a fresh load) is asked again, then plays', async () => {
    demo.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(2000)
    const w = render()
    const before = lessonShown('overrun')
    overrun()
    await nextTick()
    expect(demo).toHaveBeenCalledTimes(1)
    expect(lessonShown('overrun')).toBe(before)
    expect(w.text()).not.toContain(en.barrage.coach.overrun) // nothing played yet: nothing read
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(demo).toHaveBeenCalledTimes(3)
    expect(lessonShown('overrun')).toBe(before + 1)
    expect(w.text()).toContain(en.barrage.coach.overrun)
    w.unmount()
  })

  it('a demo the board can never play is given up uncounted after a moment, and the aim goes on', async () => {
    demo.mockReturnValue(0)
    const w = render()
    const before = lessonShown('overrun')
    overrun()
    await nextTick()
    expect(coachLesson.value?.id).toBe('overrun')
    vi.advanceTimersByTime(2000)
    expect(demo.mock.calls.length).toBeGreaterThan(1)
    expect(demo.mock.calls.length).toBeLessThanOrEqual(8)
    expect(lessonShown('overrun')).toBe(before)
    expect(coachLesson.value).toBeNull()
    w.unmount()
  })

  it('plays over the FTUE (whose hand steps aside for it)', async () => {
    demo.mockReturnValue(1500)
    r().tutorialActive.value = true
    r().tutorialPreview.value = 'aim'
    const w = render()
    overrun()
    await nextTick()
    expect(demo).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('waits out a modal, the merge lightbox, a feature unlock and a finger on the board', async () => {
    demo.mockReturnValue(1500)
    const w = render()
    r().modal.value = true
    r().mergeBox.value = { idx: 0 }
    r().unlocking.value = 'supply'
    playerAiming.value = true
    overrun()
    await nextTick()
    for (const clear of [
      () => { r().modal.value = false },
      () => { r().mergeBox.value = null },
      () => { r().unlocking.value = null }
    ]) {
      clear()
      await nextTick()
      expect(demo).not.toHaveBeenCalled()
    }
    playerAiming.value = false
    await nextTick()
    expect(demo).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('a finger on the board ends it early (the board stops its ghost itself)', async () => {
    demo.mockReturnValue(3000)
    const w = render()
    overrun()
    await nextTick()
    expect(coachLesson.value?.id).toBe('overrun')
    playerAiming.value = true
    await nextTick()
    expect(coachLesson.value).toBeNull()
    // …and its timer does not fire into a later lesson.
    const next = { id: 'tray' as const, seq: ++seq }
    coachLesson.value = next
    vi.advanceTimersByTime(3500)
    expect(coachLesson.value).toBe(next)
    w.unmount()
  })
})
