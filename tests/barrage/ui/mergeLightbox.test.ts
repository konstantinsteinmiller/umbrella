// A merge in the tray (`components/barrage/mergeLightbox.ts`). Play-test run 2:
// merging went unnoticed ("the portraits kept flipping"), so the first merges
// of a profile and every discovery PAUSED the game on a dimmed stage. Silent
// Flow (retention-roadmap #2) reversed that: every merge plays the tray's own
// flourish while play goes on, a discovery gets the (never-blocking) NEW BALL
// reveal as announced, and the first merges and every discovery are told to
// screen readers instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_KEY = 'elemental-barrage_state'

const pauses = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/use/useGamePause', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/use/useGamePause')>()
  return { ...mod, acquireAppPause: () => { pauses.n++; return mod.acquireAppPause() } }
})

const load = async (state: Record<string, unknown> = {}) => {
  vi.resetModules()
  window.localStorage.clear()
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const box = await import('@/components/barrage/mergeLightbox')
  const pause = await import('@/use/useGamePause')
  const reveal = await import('@/use/useTierReveal')
  const coach = await import('@/use/useCoach')
  return { box, pause, reveal, coach }
}

const merge = (toTier: number, discovery = false, allowed = true) =>
  ({ fromTier: toTier - 1, toTier, idx: 0, discovery, allowed })

describe('a merge: the tray\'s own flourish, no pause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pauses.n = 0
  })
  afterEach(() => { vi.useRealTimers() })

  it('the rule: the first MERGE_BOX_FIRST merges are told, then discoveries only', async () => {
    const { box } = await load()
    expect(box.MERGE_BOX_FIRST).toBe(3)
    expect(box.shouldAnnounce(0, false)).toBe(true)
    expect(box.shouldAnnounce(2, false)).toBe(true)
    expect(box.shouldAnnounce(3, false)).toBe(false)
    expect(box.shouldAnnounce(3, true)).toBe(true)
    expect(box.shouldAnnounce(40, true)).toBe(true)
  })

  it('no merge is ever staged, and none pauses the game — first merges and discoveries included', async () => {
    const { box, pause } = await load()
    for (const m of [merge(2), merge(2), merge(3, true), merge(2), merge(5, true), merge(2, false, false)]) {
      expect(box.offerMerge(m)).toBe(false)
      expect(box.mergeBox.value).toBeNull()
      expect(pause.isGamePaused.value).toBe(false)
    }
    vi.advanceTimersByTime(5000)
    expect(pauses.n).toBe(0)
  })

  it('the first three merges and every discovery say their sentence; the count is kept', async () => {
    const { box, coach } = await load()
    for (let i = 0; i < 3; i++) {
      box.offerMerge(merge(2))
      expect(coach.coachCue.value).toMatchObject({ kind: 'merge', from: 1, to: 2, discovery: false })
    }
    expect(coach.lessonShown('mergeBox')).toBe(3)
    const seq = coach.coachCue.value?.seq
    box.offerMerge(merge(2)) // a routine one: the tray alone shows it
    expect(coach.coachCue.value?.seq).toBe(seq)
    box.offerMerge(merge(5, true)) // a discovery is always told
    expect(coach.coachCue.value).toMatchObject({ kind: 'merge', to: 5, discovery: true })
    expect(coach.lessonShown('mergeBox')).toBe(3)
  })

  it('the count is in the saved coach blob: a profile that has heard three is told discoveries only', async () => {
    const { box, coach } = await load({ eb_coach: { v: 1, shown: { mergeBox: 3 }, kinds: {} } })
    box.offerMerge(merge(2))
    expect(coach.coachCue.value).toBeNull()
    box.offerMerge(merge(3, true))
    expect(coach.coachCue.value?.kind).toBe('merge')
  })

  it('a save from past the first boss without a count is treated as having heard them', async () => {
    const { box, coach } = await load({ eb_best_row: 25, eb_coach: { v: 1, shown: {}, kinds: {} } })
    box.offerMerge(merge(2))
    expect(coach.coachCue.value).toBeNull()
  })

  it('a discovery keeps its NEW BALL reveal: nothing takes it off the stage', async () => {
    const { box, reveal } = await load()
    const first = reveal.announceNewTier(4, { kind: 'grid', idx: 0 })
    expect(box.offerMerge(merge(4, true))).toBe(false)
    expect(reveal.activeReveal.value?.id).toBe(first?.id)
  })
})
