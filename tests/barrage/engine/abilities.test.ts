import { describe, expect, it } from 'vitest'
import { ballDamage } from '@/barrage/engine/balls'
import { board, mon, ofType, pass, pick, record, turn } from './helpers'

const UP = Math.PI / 2

describe('ball abilities', () => {
  it('T1 burn ticks at end of turn', () => {
    const m = mon('slime', 3, 4, 100)
    const e = board({ monsters: [m], tray: [1] })
    const ev = record(e)
    turn(e, UP)
    const dots = ofType(ev, 'dot')
    expect(dots.length).toBe(1)
    expect(dots[0]!.kind).toBe('burn')
    expect(m.hp).toBeLessThan(100 - 1)
  })

  it('T2 knockback pushes the monster up a row (once per volley, never a boss)', () => {
    const m = mon('slime', 3, 5)
    const e = board({ monsters: [m], tray: [2] })
    const ev = record(e)
    e.fire(UP)
    for (let i = 0; i < 2000 && e.state.phase === 'volley'; i++) e.update(1 / 120)
    expect(m.row).toBe(4)
    expect(ofType(ev, 'abilityProc').filter(p => p.ability === 'knockback')).toHaveLength(1)
    const boss = mon('boss', 2, 3, 1e9, { bossKind: 'troll' })
    const e2 = board({ monsters: [boss], tray: [2] })
    e2.fire(UP)
    for (let i = 0; i < 2000 && e2.state.phase === 'volley'; i++) e2.update(1 / 120)
    expect(boss.row).toBe(3)
  })

  it('T3 pierce passes through the first monster and hits the one behind it', () => {
    const front = mon('slime', 3, 6)
    const back = mon('slime', 3, 4)
    const e = board({ monsters: [front, back], tray: [3] })
    const ev = record(e)
    turn(e, UP)
    const hitIds = ofType(ev, 'hit').map(h => h.monsterId)
    expect(hitIds[0]).toBe(front.id)
    expect(hitIds).toContain(back.id)
    // A T2 ball bounces off the front one and never reaches the back one.
    const f2 = mon('slime', 3, 6)
    const b2 = mon('slime', 3, 4)
    const e2 = board({ monsters: [f2, b2], tray: [2] })
    const ev2 = record(e2)
    e2.fire(UP)
    for (let i = 0; i < 2000 && e2.state.phase === 'volley'; i++) e2.update(1 / 120)
    expect(ofType(ev2, 'hit').map(h => h.monsterId)).not.toContain(b2.id)
  })

  it('T4 freeze makes the monster skip its next march (bosses are immune)', () => {
    const m = mon('slime', 3, 4)
    const e = board({ monsters: [m], tray: [4] })
    turn(e, UP)
    expect(m.row).toBe(4)
    expect(m.frozen).toBe(0)
    pass(e)
    expect(m.row).toBe(5)
    const boss = mon('boss', 2, 2, 1e9, { bossKind: 'troll' })
    const e2 = board({ monsters: [boss], tray: [4] })
    turn(e2, UP)
    expect(boss.row).toBe(3)
  })

  it('T5 splash damages orthogonal neighbours', () => {
    const hitMe = mon('slime', 3, 5)
    const left = mon('slime', 2, 5)
    const right = mon('slime', 4, 5)
    const far = mon('slime', 0, 5)
    const e = board({ monsters: [hitMe, left, right, far], tray: [5] })
    e.fire(UP)
    for (let i = 0; i < 2000 && e.state.phase === 'volley'; i++) e.update(1 / 120)
    const dmg = ballDamage(5, 1)
    expect(left.hp).toBeLessThan(1e9)
    expect(right.hp).toBeLessThan(1e9)
    expect(1e9 - left.hp).toBeCloseTo(dmg * 0.5, 0)
    expect(far.hp).toBe(1e9)
  })

  it('T6 crush triples damage against ogres and bosses', () => {
    const ogre = mon('ogre', 3, 5)
    const e = board({ monsters: [ogre], tray: [6] })
    const ev = record(e)
    turn(e, UP)
    const hit = ofType(ev, 'hit')[0]!
    expect(hit.dmg / (hit.crit ? 2 : 1)).toBeCloseTo(ballDamage(6, 1) * 3)
  })

  it('T7 chain jumps to at most two nearby monsters', () => {
    const hitMe = mon('slime', 3, 5)
    const near = [mon('slime', 1, 5), mon('slime', 5, 5), mon('slime', 3, 3)]
    const e = board({ monsters: [hitMe, ...near], tray: [7] })
    const ev = record(e)
    e.fire(UP)
    for (let i = 0; i < 2000 && e.state.phase === 'volley'; i++) e.update(1 / 120)
    const chains = ofType(ev, 'abilityProc').filter(p => p.ability === 'chain')
    expect(chains.length).toBeGreaterThan(0)
    for (const c of chains) expect(c.targets!.length).toBeLessThanOrEqual(2)
    expect(near.filter(n => n.hp < 1e9).length).toBe(2)
  })

  it('T8 poison stacks and ticks; T9 midas pays coins per hit', () => {
    const m = mon('slime', 3, 5, 1e12)
    const e = board({ monsters: [m], tray: [8] })
    const ev = record(e)
    turn(e, UP)
    expect(m.poisonStacks).toBe(1)
    expect(ofType(ev, 'dot').some(d => d.kind === 'poison')).toBe(true)
    const e2 = board({ monsters: [mon('slime', 3, 5)], tray: [9] })
    const ev2 = record(e2)
    turn(e2, UP)
    expect(ofType(ev2, 'coins').some(c => c.source === 'midas')).toBe(true)
  })

  it('T10+ eruption blasts a 3×3 area on every 4th hit of the ball', () => {
    const row = [0, 1, 2, 3, 4, 5, 6].map(c => mon('slime', c, 2))
    const e = board({ monsters: row, tray: [10] })
    const ev = record(e)
    e.fire(UP)
    const b = e.state.balls[0]!
    b.x = 3.5; b.y = 1; b.vx = 0.3; b.vy = -15 // trapped above the row: many hits
    e.settle(3)
    const blasts = ofType(ev, 'abilityProc').filter(p => p.ability === 'eruption')
    const hits = ofType(ev, 'hit').length
    expect(blasts.length).toBe(Math.floor(hits / 4))
  })

  it('kills pay coins exactly once through the coins feed', () => {
    const m = mon('slime', 3, 5, 1, { spawnRow: 3 })
    const e = board({ monsters: [m], tray: [1] })
    const ev = record(e)
    turn(e, UP)
    const kill = ofType(ev, 'kill')[0]!
    const paid = ofType(ev, 'coins').filter(c => c.source === 'kill')
    expect(paid).toHaveLength(1)
    expect(paid[0]!.amount).toBe(kill.coins)
    expect(kill.row).toBe(3)
  })
})

describe('skills', () => {
  const bubble = (skill: NonNullable<Parameters<typeof pick>[2]>['skill']) => pick('skill', 3, 7, { skill })

  it('meteor hits every monster for 35% max HP (bosses 6%)', () => {
    const a = mon('slime', 0, 2, 100)
    const boss = mon('boss', 4, 1, 1000, { bossKind: 'orc' })
    const e = board({ monsters: [a, boss], pickups: [bubble('meteor')], tray: [1] })
    e.fire(UP)
    for (let i = 0; i < 2000 && e.state.phase === 'volley'; i++) e.update(1 / 120)
    expect(a.hp).toBeCloseTo(65)
    expect(boss.hp).toBeCloseTo(940)
  })

  it('warcry arms ×2 damage for the next volley', () => {
    const m = mon('slime', 3, 2, 1e6)
    const e = board({ monsters: [m], pickups: [bubble('warcry')], tray: [1] })
    const ev = record(e)
    turn(e, UP)
    expect(e.state.warcryArmed).toBe(true)
    turn(e, UP)
    expect(e.state.warcryArmed).toBe(false)
    const hits = ofType(ev, 'hit')
    const last = hits[hits.length - 1]!
    expect(last.dmg / (last.crit ? 2 : 1)).toBeCloseTo(2)
  })

  it('legion launches three ghost balls that never move the launcher', () => {
    const e = board({ pickups: [bubble('legion')], tray: [3] })
    const ev = record(e)
    turn(e, UP)
    const launches = ofType(ev, 'launch')
    expect(launches).toHaveLength(4)
    expect(launches.slice(1).every(l => l.tier === 2)).toBe(true)
    expect(e.state.balls.filter(b => b.ghost)).toHaveLength(3)
    expect(ofType(ev, 'ballLanded').filter(l => l.first)).toHaveLength(1)
  })

  it('pact, shield, revive, execute, heal', () => {
    const top = mon('ogre', 0, 6, 500)
    const small = mon('slime', 6, 6, 5)
    const e = board({
      monsters: [top, small],
      pickups: [pick('skill', 3, 9, { skill: 'pact' }), pick('skill', 3, 8, { skill: 'shield' }), pick('skill', 3, 7, { skill: 'revive' }),
        pick('skill', 3, 6, { skill: 'execute' }), pick('skill', 3, 5, { skill: 'heal' })],
      tray: [3, 2],
      config: { trayCapacity: 2 }
    })
    const ev = record(e)
    turn(e, UP)
    expect(e.state.tray).toEqual([4, 2]) // pact at capacity merged straight into the twin
    expect(ofType(ev, 'trayMerge')).toEqual([{ type: 'trayMerge', fromTier: 3, toTier: 4 }])
    expect(e.state.shields).toBe(1)
    expect(e.state.revives).toBe(1)
    expect(e.state.monsters).not.toContain(top) // toughest non-boss executed
    // heal: everything stepped back up one row during resolve, then marched.
    expect(small.row).toBe(6)
  })
})

// Playtest run 3 ("overkill"): a 1-HP kill popped the ball's full damage ("4").
describe('hit numbers show what the hit removed (`dealt`)', () => {
  it('a kill reports the HP it took, not the ball’s damage', () => {
    const m = mon('slime', 3, 4, 1)
    const e = board({ monsters: [m], tray: [4] })
    const ev = record(e)
    turn(e, UP)
    const hit = ofType(ev, 'hit').find(h => h.monsterId === m.id)!
    expect(hit.dmg).toBeGreaterThan(1)
    expect(hit.dealt).toBe(1)
  })

  it('a hit that does not kill deals its full damage', () => {
    const m = mon('slime', 3, 4, 1000)
    const e = board({ monsters: [m], tray: [2] })
    const ev = record(e)
    turn(e, UP)
    const hits = ofType(ev, 'hit').filter(h => h.monsterId === m.id)
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) expect(h.dealt).toBe(h.dmg)
  })

  it('a DoT tick reports what it removes — 0 when a gem shield eats it', () => {
    const burning = mon('slime', 1, 4, 2, { burnDmg: 5, burnTurns: 1 })
    const gem = mon('carbuncle', 5, 4, 100, { shield: true, burnDmg: 5, burnTurns: 1 })
    const e = board({ monsters: [burning, gem], tray: [1] })
    const ev = record(e)
    pass(e)
    const dots = ofType(ev, 'dot')
    expect(dots.find(d => d.monsterId === burning.id)).toMatchObject({ dmg: 5, dealt: 2 })
    expect(dots.find(d => d.monsterId === gem.id)).toMatchObject({ dmg: 5, dealt: 0 })
    expect(gem.hp).toBe(100)
  })
})
