// Fun pass after playtest run 6: a lucky or cool combo pays — every hit a
// ball scores past COMBO_COINS.freeHits in one launch pays perHit of a slime
// kill, summed over the volley and capped; plus the aim preview traced to the
// second bounce.
import { describe, expect, it } from 'vitest'
import { COMBO_COINS, comboCoins, comboKills, killCoins } from '@/barrage/engine/economy'
import { aimPreview } from '@/barrage/engine/aim'
import { MIN_AIM } from '@/barrage/engine/types'
import { board, mon, ofType, record } from './helpers'

describe('combo coins', () => {
  it('pay each ball\'s hits past freeHits, summed, capped per volley', () => {
    const { freeHits, perHit, capKills } = COMBO_COINS
    expect(freeHits).toBeGreaterThan(0)
    expect(perHit).toBeGreaterThan(0)
    // Ordinary balls pay nothing — however many of them there are.
    expect(comboKills(Array.from({ length: 40 }, () => ({ hits: freeHits })))).toBe(0)
    // One ball that rattled 4 past the free hits.
    expect(comboKills([{ hits: 1 }, { hits: freeHits + 4 }])).toBeCloseTo(4 * perHit)
    // Two rattlers add up…
    expect(comboKills([{ hits: freeHits + 2 }, { hits: freeHits + 2 }])).toBeCloseTo(4 * perHit)
    // …up to the cap.
    expect(comboKills([{ hits: freeHits + 10_000 }])).toBe(capKills)
    // In coins: slime kills at the row.
    expect(comboCoins(30, [{ hits: freeHits + 4 }])).toBeCloseTo(4 * perHit * killCoins(30, 'slime', false))
  })

  it('a ball trapped above the rows pays at volley end: comboBonus, then a coins event from the combo', () => {
    const pocketRow = [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 2))
    const e = board({ monsters: pocketRow, tray: [1] })
    const ev = record(e)
    e.fire(Math.PI / 2)
    const b = e.state.balls[0]!
    b.x = 3.3; b.y = 1; b.vx = 3; b.vy = -15
    e.settle(8)
    // Still rattling: call it home (the recall ends the volley like a landing).
    e.recall()
    const bonus = ofType(ev, 'comboBonus')
    expect(bonus).toHaveLength(1)
    expect(bonus[0]!.hits).toBeGreaterThan(COMBO_COINS.freeHits)
    expect(bonus[0]!.coins).toBe(Math.round(COMBO_COINS.capKills * killCoins(e.state.row, 'slime', false)))
    const paid = ofType(ev, 'coins').filter(c => c.source === 'combo')
    expect(paid).toHaveLength(1)
    expect(paid[0]!.amount).toBe(bonus[0]!.coins)
    // The tally comes before volleyEnd.
    const order = ev.filter(x => x.type === 'comboBonus' || x.type === 'volleyEnd').map(x => x.type)
    expect(order).toEqual(['comboBonus', 'volleyEnd'])
  })

  it('an ordinary shot scores no combo coins (the tally still reports the hits)', () => {
    const e = board({ monsters: [mon('slime', 3, 3, 2)], launcherX: 3.5, tray: [1] })
    const ev = record(e)
    e.fire(Math.PI / 2)
    e.settle(8)
    const bonus = ofType(ev, 'comboBonus')
    expect(bonus).toHaveLength(1)
    expect(bonus[0]!.coins).toBe(0)
    expect(ofType(ev, 'coins').some(c => c.source === 'combo')).toBe(false)
  })
})

describe('aim preview to the second bounce', () => {
  it('bounces = 1 is the old path (first contact + a short continuation)', () => {
    const e = board({ monsters: [mon('slime', 3, 2)], launcherX: 3.5 })
    const p = aimPreview(e.state, Math.PI / 2)
    expect(p.points).toHaveLength(3)
    expect(p.hit).toBe('monster')
    expect(p.solid).toBeCloseTo(Math.hypot(p.points[1]!.x - p.points[0]!.x, p.points[1]!.y - p.points[0]!.y))
  })

  it('bounces = 2 traces both contacts in full; hit / monsterId stay the first contact', () => {
    const target = mon('slime', 6, 1)
    const e = board({ monsters: [target], launcherX: 3.5 })
    // Shallow to the left: off the left wall first.
    const p = aimPreview(e.state, Math.PI - MIN_AIM - 0.3, 2)
    expect(p.hit).toBe('wall')
    expect(p.points.length).toBe(4)
    const seg = (i: number) => Math.hypot(p.points[i + 1]!.x - p.points[i]!.x, p.points[i + 1]!.y - p.points[i]!.y)
    expect(p.solid).toBeCloseTo(seg(0) + seg(1))
    // A straight shot into the floor-facing monster stops at nothing past the floor.
    const up = aimPreview(board({ monsters: [], launcherX: 3.5 }).state, Math.PI / 2, 2)
    expect(up.hit).toBe('ceiling')
    expect(up.points.length).toBeGreaterThanOrEqual(3)
  })
})
