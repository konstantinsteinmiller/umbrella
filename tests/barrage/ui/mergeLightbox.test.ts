// The merge lightbox (`components/barrage/mergeLightbox.ts`). Play-test run 2:
// merging went unnoticed ("the portraits kept flipping"). The first merges of
// a profile and every discovery now PAUSE the game and stage the merge; later
// routine merges animate in the tray without stopping anything.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_KEY = 'elemental-barrage_state'

const load = async (state: Record<string, unknown> = {}) => {
  vi.resetModules()
  window.localStorage.clear()
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const box = await import('@/components/barrage/mergeLightbox')
  const pause = await import('@/use/useGamePause')
  const reveal = await import('@/use/useTierReveal')
  const coach = await import('@/use/useCoach')
  const unregister = box.registerMergeBoxView()
  return { box, pause, reveal, coach, unregister }
}

const merge = (toTier: number, discovery = false, allowed = true) =>
  ({ fromTier: toTier - 1, toTier, idx: 0, discovery, allowed })

describe('merge lightbox', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('the rule: the first MERGE_BOX_FIRST merges, then discoveries only', async () => {
    const { box } = await load()
    expect(box.MERGE_BOX_FIRST).toBe(3)
    expect(box.shouldLightbox(0, false)).toBe(true)
    expect(box.shouldLightbox(2, false)).toBe(true)
    expect(box.shouldLightbox(3, false)).toBe(false)
    expect(box.shouldLightbox(3, true)).toBe(true)
    expect(box.shouldLightbox(40, true)).toBe(true)
  })

  it('pauses the game for its moment and releases the pause when it ends', async () => {
    const { box, pause } = await load()
    expect(pause.isGamePaused.value).toBe(false)
    expect(box.offerMerge(merge(2))).toBe(true)
    expect(box.mergeBox.value).toMatchObject({ fromTier: 1, toTier: 2, discovery: false, ms: box.MERGE_BOX_MS })
    expect(pause.isGamePaused.value).toBe(true)
    vi.advanceTimersByTime(box.MERGE_BOX_MS - 50)
    expect(pause.isGamePaused.value).toBe(true)
    vi.advanceTimersByTime(100)
    expect(box.mergeBox.value).toBeNull()
    expect(pause.isGamePaused.value).toBe(false)
  })

  it('a tap ends it at once (and a second finish is harmless)', async () => {
    const { box, pause } = await load()
    box.offerMerge(merge(2))
    box.finishMerge()
    expect(box.mergeBox.value).toBeNull()
    expect(pause.isGamePaused.value).toBe(false)
    box.finishMerge()
    vi.advanceTimersByTime(5000)
    expect(pause.isGamePaused.value).toBe(false)
  })

  it('first three merges of a profile, then routine merges do not pause — discoveries still do', async () => {
    const { box, pause, coach } = await load()
    for (let i = 0; i < 3; i++) {
      expect(box.offerMerge(merge(2))).toBe(true)
      box.finishMerge()
    }
    expect(coach.lessonShown('mergeBox')).toBe(3)
    expect(box.offerMerge(merge(2))).toBe(false)
    expect(pause.isGamePaused.value).toBe(false)
    expect(box.offerMerge(merge(5, true))).toBe(true)
    expect(box.mergeBox.value?.ms).toBe(box.MERGE_BOX_DISCOVERY_MS)
    expect(pause.isGamePaused.value).toBe(true)
    box.finishMerge()
    expect(pause.isGamePaused.value).toBe(false)
  })

  it('the count is in the saved coach blob: a profile that has seen three never sees a routine one', async () => {
    const { box } = await load({ eb_coach: { v: 1, shown: { mergeBox: 3 }, kinds: {} } })
    expect(box.offerMerge(merge(2))).toBe(false)
    expect(box.offerMerge(merge(3, true))).toBe(true)
  })

  it('a save from past the first boss without a count is treated as having seen them', async () => {
    const { box } = await load({ eb_best_row: 25, eb_coach: { v: 1, shown: {}, kinds: {} } })
    expect(box.offerMerge(merge(2))).toBe(false)
  })

  it('nothing on stage while a modal owns the screen, or with no view mounted', async () => {
    const { box, pause, unregister } = await load()
    expect(box.offerMerge(merge(2, false, false))).toBe(false)
    unregister()
    expect(box.offerMerge(merge(2))).toBe(false)
    expect(pause.isGamePaused.value).toBe(false)
  })

  it('a discovery: the NEW BALL reveal waits for the lightbox, then plays in full', async () => {
    const { box, reveal } = await load()
    const resumed = vi.fn()
    box.setRevealResumeHook(resumed)
    const first = reveal.announceNewTier(4, { kind: 'grid', idx: 0 })
    expect(box.offerMerge(merge(4, true))).toBe(true)
    expect(reveal.activeReveal.value).toBeNull()
    vi.advanceTimersByTime(box.MERGE_BOX_DISCOVERY_MS + 10)
    const again = reveal.activeReveal.value
    expect(again?.tier).toBe(4)
    expect(again?.id).not.toBe(first.id)
    expect(again?.target).toEqual({ kind: 'grid', idx: 0 })
    expect(resumed).toHaveBeenCalledWith(4, { kind: 'grid', idx: 0 })
  })
})
