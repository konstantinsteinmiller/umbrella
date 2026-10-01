// Shoot-to-Choose (retention-roadmap #5): every boss kill floats up to three
// power orbs on the board; the first one a ball touches is kept for the run,
// the rest vanish; orbs left to reach the line give the leftmost one. Perks
// live in `config.perks` (the snapshot carries them) and cap at PERK_MAX.
import { describe, expect, it } from 'vitest'
import { restoreEngine } from '@/barrage/engine/engine'
import { killCoins } from '@/barrage/engine/economy'
import { PERK_MAX, PERK_OFFER, PERK_POWER, PERK_VOLLEY_BALLS, ROWS, type PerkId } from '@/barrage/engine/types'
import { board, mon, ofType, pick, record, turn } from './helpers'

const UP = Math.PI / 2

/** A board whose boss dies to the first volley. */
const bossBoard = (config: Parameters<typeof board>[0] = {}) =>
  board({ monsters: [mon('boss', 2, 1, 1, { bossKind: 'worm', spawnRow: 20 })], tray: [3, 3], ...config })

describe('the offer', () => {
  it('every endless boss kill floats up to three distinct orbs', () => {
    for (const seed of [1, 2, 3, 4]) {
      const e = bossBoard({ config: { seed } })
      const ev = record(e)
      turn(e, UP)
      expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
      const offer = ofType(ev, 'perkOffer')
      expect(offer).toHaveLength(1)
      expect(offer[0]!.perks.length).toBeGreaterThanOrEqual(1)
      expect(offer[0]!.perks.length).toBeLessThanOrEqual(PERK_OFFER)
      expect(new Set(offer[0]!.perks).size).toBe(offer[0]!.perks.length)
    }
  })

  it('the Daily (a fixed kit) never offers one', () => {
    const e = bossBoard({ config: { mode: 'daily' } })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'bossDefeated')).toHaveLength(1)
    expect(ofType(ev, 'perkOffer')).toHaveLength(0)
    expect(e.perkOrbs).toHaveLength(0)
  })

  it('a maxed perk is never offered; all maxed — no orbs', () => {
    const maxed = { power: PERK_MAX, splash: PERK_MAX, bounty: PERK_MAX }
    const e = bossBoard({ config: { perks: maxed } })
    const ev = record(e)
    turn(e, UP)
    expect(ofType(ev, 'perkOffer')[0]!.perks).toEqual(['volley'])
    const all = bossBoard({ config: { perks: { ...maxed, volley: PERK_MAX } } })
    const ev2 = record(all)
    turn(all, UP)
    expect(ofType(ev2, 'perkOffer')).toHaveLength(0)
  })
})

describe('the pick', () => {
  it('the first orb taken is kept; the others vanish', () => {
    const e = orbBoard(['power', 'bounty', 'splash'])
    const ev = record(e)
    expect(e.choosePerk('bounty')).toBe(true)
    expect(e.state.config.perks).toEqual({ bounty: 1 })
    expect(ofType(ev, 'perkPick')).toEqual([expect.objectContaining({ perk: 'bounty', stacks: 1 })])
    expect(e.perkOrbs).toHaveLength(0)
    expect(ofType(ev, 'perkGone')[0]!.pickupIds).toHaveLength(2)
    // Nothing left to take.
    expect(e.choosePerk('power')).toBe(false)
  })

  it('a ball touching an orb picks it — one pick per offer, deterministic', () => {
    const run = (): string => {
      const e = orbBoard(['power', 'bounty', 'splash'], { tray: [2, 2, 2, 2] })
      const ev = record(e)
      for (const a of [UP, 1.2, 2.0]) if (e.perkOrbs.length > 0) turn(e, a)
      expect(ofType(ev, 'perkPick')).toHaveLength(1)
      return JSON.stringify(e.state.config.perks)
    }
    expect(run()).toBe(run())
  })

  it('orbs left to reach the line give the leftmost one', () => {
    const e = board({ pickups: [pick('perk', 4, ROWS - 1, { perk: 'power' }), pick('perk', 2, ROWS - 1, { perk: 'splash' })], tray: [1] })
    const ev = record(e)
    e.fire(UP)
    e.recall()
    e.settle()
    const picks = ofType(ev, 'perkPick')
    expect(picks).toHaveLength(1)
    expect(picks[0]).toMatchObject({ perk: 'splash', auto: true })
    expect(e.perkOrbs).toHaveLength(0)
  })

  it('stacks cap at PERK_MAX', () => {
    const e = orbBoard(['power'], { config: { perks: { power: PERK_MAX } } })
    e.choosePerk('power')
    expect(e.state.config.perks?.power).toBe(PERK_MAX)
  })

  it('the snapshot carries the run\'s perks and the orbs still on the board', () => {
    const e = orbBoard(['power', 'volley'], { config: { perks: { splash: 2 } } })
    const snap = e.snapshot()!
    const r = restoreEngine(snap)
    expect(r.state.config.perks).toEqual({ splash: 2 })
    expect(r.perkOrbs.map(p => p.perk)).toEqual(['power', 'volley'])
    r.choosePerk('volley')
    expect(restoreEngine(r.snapshot()!).state.config.perks).toEqual({ splash: 2, volley: 1 })
  })
})

describe('the perks', () => {
  it('Power: +20% ball damage per stack', () => {
    const dmgWith = (power: number): number => {
      const e = board({ monsters: [mon('slime', 3, 4, 1e9)], tray: [1], config: { perks: { power } } })
      const ev = record(e)
      turn(e, UP)
      return ofType(ev, 'hit').filter(h => !h.crit)[0]!.dmg
    }
    expect(dmgWith(2) / dmgWith(0)).toBeCloseTo(1 + 2 * PERK_POWER, 5)
  })

  it('Bounty: more coins per kill', () => {
    const coinsWith = (bounty: number): number => {
      const e = board({ monsters: [mon('slime', 3, 4, 1)], tray: [1], config: { perks: { bounty } } })
      const ev = record(e)
      turn(e, UP)
      return ofType(ev, 'kill')[0]!.coins
    }
    const plain = coinsWith(0)
    expect(plain).toBe(Math.max(1, Math.round(killCoins(5, 'slime', false))))
    expect(coinsWith(PERK_MAX)).toBeGreaterThan(plain)
  })

  it('Splash: a hit chips the struck monster\'s neighbours', () => {
    const struck = mon('slime', 3, 4, 1e9)
    const side = mon('slime', 2, 4, 1e9)
    const plain = board({ monsters: [struck, side], tray: [1] })
    turn(plain, UP)
    expect(side.hp).toBe(1e9)
    const s2 = mon('slime', 3, 4, 1e9)
    const n2 = mon('slime', 2, 4, 1e9)
    const e = board({ monsters: [s2, n2], tray: [1], config: { perks: { splash: 1 } } })
    turn(e, UP)
    expect(n2.hp).toBeLessThan(1e9)
  })

  it('Volley: two balls join the tray at once', () => {
    const e = orbBoard(['volley'], { tray: [3, 2], config: { trayCapacity: 8 } })
    e.choosePerk('volley')
    expect(e.state.tray).toHaveLength(2 + PERK_VOLLEY_BALLS)
  })
})

function orbBoard(perks: PerkId[], extra: Parameters<typeof board>[0] = {}) {
  return board({ pickups: perks.map((perk, i) => pick('perk', 1 + 2 * i, 3, { perk })), tray: [1], ...extra })
}
