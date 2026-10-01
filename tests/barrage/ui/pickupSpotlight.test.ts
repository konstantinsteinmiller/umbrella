// The first "+1" that becomes a ball (`components/barrage/pickupSpotlight.ts`).
// After playtest run 8 it paused the game and flew across a dimmed stage into
// the tray (2.6 s). Silent Flow (retention-roadmap #2) reversed that: no pause
// and no stage before the first boss kill — the "+1" pulses on the board (the
// FTUE's "+1" beats) and the tray plays its own flight when it is collected.
// The first one of a profile is still counted and told to screen readers.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_KEY = 'elemental-barrage_state'

const pauses = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/use/useGamePause', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/use/useGamePause')>()
  return { ...mod, acquireAppPause: () => { pauses.n++; return mod.acquireAppPause() } }
})

const load = async (state?: Record<string, unknown>) => {
  vi.resetModules()
  window.localStorage.clear()
  if (state) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const ps = await import('@/components/barrage/pickupSpotlight')
  const coach = await import('@/use/useCoach')
  const pause = await import('@/use/useGamePause')
  return { ps, coach, pause }
}

describe('the first "+1" — in the world, no pause', () => {
  beforeEach(() => { pauses.n = 0 })

  it('never stages it and never pauses the game: the tray plays its own flight', async () => {
    const { ps, pause } = await load()
    const from = { x: 120, y: 300 }
    for (const allowed of [true, false]) {
      expect(ps.offerPickup({ from, idx: 1, tier: 1, allowed })).toBe(false)
      expect(ps.offerPickup({ from: null, idx: 1, tier: 1, allowed })).toBe(false)
    }
    expect(ps.pickupBox.value).toBeNull()
    expect(pauses.n).toBe(0)
    expect(pause.isGamePaused.value).toBe(false)
  })

  it('the first one of a profile is counted once and told to screen readers', async () => {
    const { ps, coach } = await load()
    expect(coach.lessonShown('pickupBox')).toBe(0)
    expect(coach.coachCue.value).toBeNull()
    ps.offerPickup({ from: { x: 1, y: 1 }, idx: 0, tier: 1, allowed: true })
    expect(coach.lessonShown('pickupBox')).toBe(1)
    const cue = coach.coachCue.value
    expect(cue?.kind).toBe('pickup')
    // The next ones are just the tray's flight.
    ps.offerPickup({ from: { x: 1, y: 1 }, idx: 1, tier: 1, allowed: true })
    expect(coach.lessonShown('pickupBox')).toBe(1)
    expect(coach.coachCue.value?.seq).toBe(cue?.seq)
  })

  it('a veteran save (best row past 10) is not told again', async () => {
    const { ps, coach } = await load({ eb_best_row: 30, eb_coach: { v: 1, shown: { mergeBox: 3 }, kinds: {} } })
    ps.offerPickup({ from: { x: 1, y: 1 }, idx: 0, tier: 1, allowed: true })
    expect(coach.coachCue.value).toBeNull()
  })
})
