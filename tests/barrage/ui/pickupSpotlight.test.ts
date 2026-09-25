// The first "+1" on a stage (the designer's call after playtest run 8: "+1
// means more balls = more damage" was never shown). The first collected "+1"
// that becomes a ball pauses the game and is followed by a spotlight into the
// tray, where it turns into the ball, then a comet into the launcher. Once per
// profile (coach exposure `pickupBox`); only with a view mounted.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const STATE_KEY = 'elemental-barrage_state'

describe('the first "+1" spotlight', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
  })

  it('stages the first "+1" once per profile, pauses the game for it, and lets go', async () => {
    const pause = await import('@/use/useGamePause')
    const ps = await import('@/components/barrage/pickupSpotlight')
    const coach = await import('@/use/useCoach')
    ps.__resetPickupBox()
    const from = { x: 120, y: 300 }
    // No view mounted (the clean feed, the lab): never a pause behind nothing.
    expect(ps.offerPickup({ from, idx: 1, tier: 1, allowed: true })).toBe(false)
    const off = ps.registerPickupBoxView()
    expect(ps.offerPickup({ from: null, idx: 1, tier: 1, allowed: true })).toBe(false)
    expect(ps.offerPickup({ from, idx: 1, tier: 1, allowed: false })).toBe(false)
    expect(coach.lessonShown('pickupBox')).toBe(0)
    expect(ps.offerPickup({ from, idx: 1, tier: 1, allowed: true })).toBe(true)
    expect(ps.pickupBox.value).toMatchObject({ from, idx: 1, tier: 1, ms: ps.PICKUP_BOX_MS })
    expect(pause.isGamePaused.value).toBe(true)
    expect(coach.lessonShown('pickupBox')).toBe(1)
    ps.finishPickup()
    expect(ps.pickupBox.value).toBeNull()
    expect(pause.isGamePaused.value).toBe(false)
    // Once per profile.
    expect(ps.offerPickup({ from, idx: 2, tier: 1, allowed: true })).toBe(false)
    off()
  })

  it('ends on its own after PICKUP_BOX_MS', async () => {
    vi.useFakeTimers()
    try {
      const pause = await import('@/use/useGamePause')
      const ps = await import('@/components/barrage/pickupSpotlight')
      ps.__resetPickupBox()
      const off = ps.registerPickupBoxView()
      expect(ps.offerPickup({ from: { x: 1, y: 1 }, idx: 0, tier: 1, allowed: true })).toBe(true)
      vi.advanceTimersByTime(ps.PICKUP_BOX_MS - 1)
      expect(ps.pickupBox.value).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(ps.pickupBox.value).toBeNull()
      expect(pause.isGamePaused.value).toBe(false)
      off()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a veteran save (best row past 10) never gets it', async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ eb_best_row: 30, eb_coach: { v: 1, shown: { mergeBox: 3 }, kinds: {} } }))
    const ps = await import('@/components/barrage/pickupSpotlight')
    ps.__resetPickupBox()
    const off = ps.registerPickupBoxView()
    expect(ps.offerPickup({ from: { x: 1, y: 1 }, idx: 0, tier: 1, allowed: true })).toBe(false)
    off()
  })
})
