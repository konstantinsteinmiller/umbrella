import { describe, expect, it } from 'vitest'
import { SAVIOR, saviorBoost } from '@/barrage/engine/economy'
import { ROWS } from '@/barrage/engine/types'
import { board, mon, ofType, record } from './helpers'

const UP = Math.PI / 2

/** The first hit's damage with the crit taken out (tray [1], Ball Damage ×1). */
const firstHit = (e: ReturnType<typeof board>): number => {
  const ev = record(e)
  e.fire(UP)
  e.settle()
  const h = ofType(ev, 'hit')[0]!
  return h.crit ? h.dmg / 2 : h.dmg
}

/** A 3×3 boss over the launcher whose bottom edge has `space` rows to the line. */
const bossBoard = (space: number, extra: Parameters<typeof mon>[4] = {}, mode: 'endless' | 'daily' = 'endless') =>
  board({ monsters: [mon('boss', 2, ROWS - 3 - space, 1e9, { bossKind: 'worm', spawnRow: 20, ...extra })], launcherX: 3.5, config: { mode } })

describe('savior boost (hidden: the closer a boss is to breaching, the harder the balls hit)', () => {
  it('+200% on the last volley before the breach, +50% on the one before, nothing earlier', () => {
    expect(SAVIOR.max).toBe(2)
    expect(saviorBoost(1)).toBeCloseTo(2)
    expect(saviorBoost(2)).toBeCloseTo(0.5)
    expect(saviorBoost(3)).toBe(0)
    expect(saviorBoost(10)).toBe(0)
    // Below 1 is still the last volley; nonsense is no boost.
    expect(saviorBoost(0)).toBeCloseTo(2)
    expect(saviorBoost(Number.NaN)).toBe(0)
  })

  it('a boss whose next march breaches: every hit deals ×3', () => {
    const e = bossBoard(0)
    expect(firstHit(e)).toBeCloseTo(3)
    expect(e.saviorView).toEqual({ boost: 2, volleysLeft: 1 })
  })

  it('one row of space: ×1.5; an ENRAGED boss (marches 2) with one row of space: ×3', () => {
    expect(firstHit(bossBoard(1))).toBeCloseTo(1.5)
    expect(firstHit(bossBoard(1, { enraged: true, hp: 1e8 }))).toBeCloseTo(3)
  })

  it('a boss far from the line, no boss at all, and the Daily: ×1', () => {
    expect(firstHit(bossBoard(5))).toBeCloseTo(1)
    const walkers = board({ monsters: [mon('slime', 3, ROWS - 1)], launcherX: 3.5 })
    expect(firstHit(walkers)).toBeCloseTo(1)
    expect(walkers.saviorView.volleysLeft).toBeNull()
    const daily = bossBoard(0, {}, 'daily')
    expect(firstHit(daily)).toBeCloseTo(1)
    expect(daily.saviorView.boost).toBe(0)
  })

  it('never shows: nothing on the board state the renderer reads carries it', () => {
    const e = bossBoard(0)
    e.fire(UP)
    expect(JSON.stringify(e.state)).not.toMatch(/savior/i)
  })
})
