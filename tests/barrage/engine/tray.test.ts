import { describe, expect, it } from 'vitest'
import { addToTray, ballAbility, ballDamage, pactTray, restartTray, trayPower, type TraySink } from '@/barrage/engine/balls'
import { board, ofType, record } from './helpers'

const sink = () => {
  const merges: [number, number][] = []
  const overflows: number[] = []
  const s: TraySink = { merge: (a, b) => merges.push([a, b]), overflow: t => overflows.push(t) }
  return { s, merges, overflows }
}

describe('ball tiers', () => {
  it('damage is damageMult × 2.2^(tier−1) and a merge is always a gain', () => {
    expect(ballDamage(1, 1)).toBe(1)
    expect(ballDamage(2, 1)).toBeCloseTo(2.2)
    expect(ballDamage(3, 2)).toBeCloseTo(2 * 2.2 * 2.2)
    for (let t = 1; t < 20; t++) expect(ballDamage(t + 1, 1)).toBeGreaterThan(2 * ballDamage(t, 1))
  })

  it('maps the ability ladder T1…T9 and T10+ eruption', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(ballAbility)).toEqual(
      ['burn', 'knockback', 'pierce', 'freeze', 'splash', 'crush', 'chain', 'poison', 'midas'])
    expect(ballAbility(10)).toBe('eruption')
    expect(ballAbility(23)).toBe('eruption')
  })
})

describe('tray add rule (CONTRACT §3)', () => {
  it('never merges below capacity', () => {
    const tray = [1]
    const { s, merges } = sink()
    addToTray(tray, 1, 3, s)
    addToTray(tray, 1, 3, s)
    expect(tray).toEqual([1, 1, 1])
    expect(merges).toEqual([])
  })

  it('on overflow merges the LOWEST pair only', () => {
    const tray = [3, 3, 2, 2]
    const { s, merges } = sink()
    addToTray(tray, 1, 4, s) // [3,3,2,2,1] → lowest pair is 2
    expect(tray).toEqual([3, 3, 3, 1])
    expect(merges).toEqual([[2, 3]])
  })

  it('merges the incoming ball with its twin when that is the lowest pair', () => {
    const tray = [2, 1]
    const { s, merges } = sink()
    addToTray(tray, 1, 2, s)
    expect(tray).toEqual([2, 2])
    expect(merges).toEqual([[1, 2]])
  })

  it('with no pair the lowest ball becomes coins', () => {
    const tray = [4, 3, 2]
    const { s, merges, overflows } = sink()
    addToTray(tray, 1, 3, s)
    expect(tray).toEqual([4, 3, 2])
    expect(merges).toEqual([])
    expect(overflows).toEqual([1])
  })

  it('a shrunk capacity keeps balls until the next add, then drains to capacity', () => {
    const tray = [1, 1, 1, 1]
    const { s, merges } = sink()
    addToTray(tray, 1, 2, s) // 5 balls, cap 2: 1+1 → 2, 1+1 → 2, then 2+2 → 3
    expect(tray.length).toBe(2)
    expect(merges).toEqual([[1, 2], [1, 2], [2, 3]])
    expect(tray).toEqual([3, 1])
  })

  it('soul pact adds a copy below capacity and merges with the twin at capacity', () => {
    const a = [3, 1]
    expect(pactTray(a, 4)).toBe('add')
    expect(a).toEqual([3, 3, 1])
    const b = [3, 2]
    const { s, merges } = sink()
    expect(pactTray(b, 2, s)).toBe('merge')
    expect(b).toEqual([4, 2])
    expect(merges).toEqual([[3, 4]])
  })

  it('engine.addBalls emits trayAdd/trayMerge/trayOverflow and pays overflow coins', () => {
    const e = board({ tray: [3, 2], config: { trayCapacity: 2 } })
    const ev = record(e)
    e.addBalls(1) // [3,2,1] no pair → the 1 spills
    expect(e.state.tray).toEqual([3, 2])
    expect(ofType(ev, 'trayOverflow')).toHaveLength(1)
    const coins = ofType(ev, 'coins')
    expect(coins).toHaveLength(1)
    expect(coins[0]!.amount).toBe(ofType(ev, 'trayOverflow')[0]!.coins)
    e.setConfig({ trayCapacity: 3 })
    e.addBalls(2) // [3,2,1] then [3,2,1,1] → merge 1s → [3,2,2]
    expect(e.state.tray).toEqual([3, 2, 2])
    expect(ofType(ev, 'trayMerge')).toEqual([{ type: 'trayMerge', fromTier: 1, toTier: 2 }])
    expect(ofType(ev, 'trayAdd')).toHaveLength(3)
  })
})

describe('restart tray (CONTRACT §6)', () => {
  it('the stronger of the checkpoint tray and the tray at the breach; a tie keeps the checkpoint tray', () => {
    expect(restartTray([3, 2], [4, 2, 2], 1)).toEqual([4, 2, 2])
    expect(restartTray([5, 4, 4, 1], [5, 4, 2, 2, 2, 1], 1)).toEqual([5, 4, 4, 1])
    // Power, not ball count: T3 + T1 (5.84) beats T2 + T2 + T1 (5.4).
    expect(restartTray([2, 2, 1], [3, 1], 1)).toEqual([3, 1])
    // A tie (same power) keeps the checkpoint tray — a fresh copy of it.
    const cp = [3, 1]
    const out = restartTray(cp, [3, 1], 1)
    expect(out).toEqual([3, 1])
    expect(out).not.toBe(cp)
    // No breach tray: the checkpoint tray.
    expect(restartTray([2], null, 1)).toEqual([2])
    expect(restartTray([2], [], 1)).toEqual([2])
    // The damage multiplier scales both sides alike.
    for (const mult of [1, 1.25, 9.3]) {
      expect(trayPower([4, 2, 2], mult)).toBeGreaterThan(trayPower([3, 2], mult))
      expect(restartTray([3, 2], [4, 2, 2], mult)).toEqual([4, 2, 2])
    }
  })
})
