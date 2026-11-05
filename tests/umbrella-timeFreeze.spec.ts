import { describe, expect, it } from 'vitest'
import { createWorld, step, type Input, type World } from '@/umbrella/engine'
import { LEVELS } from '@/umbrella/levels'
import { FREEZE_MARGIN, isLastChanceInCurrent } from '@/umbrella/timeFreeze'
import { DEFAULT_TUNING as T } from '@/umbrella/tuning'

const DT = 1 / 120
const tick = (w: World, input: Partial<Input> = {}) => step(w, { left: false, right: false, toggle: false, ...input }, DT, T)

/** Level 1: walk off the ledge, shut the umbrella above the column (the way a new player does by pressing the key twice), fall.
 *  Returns the first tick the freeze would fire on, or -1. */
const fallThroughLevel1 = (closeAtX: number) => {
  const w = createWorld(LEVELS[0]!)
  for (let i = 0; i < 60; i++) tick(w)
  let closed = false
  for (let i = 0; i < 120 * 12 && w.phase === 'play'; i++) {
    const cx = w.player.x + w.player.w / 2
    const closeNow = !closed && !w.player.grounded && w.player.open && cx >= closeAtX
    if (closeNow) closed = true
    if (closed && i % 3 === 0 && isLastChanceInCurrent(w, T)) return { w, at: i }
    tick(w, { right: w.player.grounded || !closed, toggle: closeNow })
  }
  return { w, at: -1 }
}

describe('time freeze (levels 1 and 2)', () => {
  it('fires for a player who shut the umbrella above the level 1 updraft and would die in it', () => {
    const { w, at } = fallThroughLevel1(440)
    expect(at).toBeGreaterThan(-1)
    expect(w.player.open).toBe(false)
    // The click at that moment really saves him: opening carries him up inside the current.
    tick(w, { toggle: true })
    let rose = false
    for (let i = 0; i < 120 * 3 && w.phase === 'play'; i++) {
      tick(w)
      if (w.player.vy < -40) rose = true
    }
    expect(w.phase).toBe('play')
    expect(rose).toBe(true)
  })

  it('leaves the player a reaction margin: opening FREEZE_MARGIN later would be too late', () => {
    const { w, at } = fallThroughLevel1(440)
    expect(at).toBeGreaterThan(-1)
    for (let i = 0; i < FREEZE_MARGIN / DT; i++) tick(w)
    tick(w, { toggle: true })
    let rose = false
    for (let i = 0; i < 120 * 4 && w.phase === 'play'; i++) {
      tick(w)
      if (w.player.vy < -40) rose = true
    }
    expect(rose).toBe(false)
  })

  it('never fires with the umbrella open, grounded, or rising', () => {
    const w = createWorld(LEVELS[0]!)
    expect(isLastChanceInCurrent(w, T)).toBe(false) // standing on the ledge
    w.player.x = 500
    w.player.y = 400
    w.player.vy = 200
    w.player.grounded = false
    w.player.open = true
    expect(isLastChanceInCurrent(w, T)).toBe(false) // open already
    w.player.open = false
    w.player.vy = -100
    expect(isLastChanceInCurrent(w, T)).toBe(false) // going up
  })

  it('never fires for a fall outside any current (nothing for the umbrella to catch)', () => {
    const w = createWorld(LEVELS[0]!)
    w.player.x = 150
    w.player.y = 300
    w.player.vy = 300
    w.player.grounded = false
    w.player.standing = -1
    expect(isLastChanceInCurrent(w, T)).toBe(false)
  })

  it('does not change the world it looks at', () => {
    const { w } = fallThroughLevel1(440)
    const before = JSON.stringify(w)
    isLastChanceInCurrent(w, T)
    expect(JSON.stringify(w)).toBe(before)
  })
})
