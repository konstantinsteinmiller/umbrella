// Arena skills, slots 5–8: Warcry of the Legion, Legion Call, Executioner's
// Mark and Soul Pact.
//
// These run the real engine headlessly (`advanceBattle`) against training
// dummies — enemies stunned for good, with no attack — so every number below is
// the engine's own arithmetic, not a re-derivation of it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BattleEvent, Enemy } from '@/use/useBattle'

type Battle = typeof import('@/use/useBattle')

const importBattle = async (): Promise<Battle> => {
  vi.resetModules()
  return await import('@/use/useBattle')
}

let dummySeq = 0
const dummy = (over: Partial<Enemy> = {}): Enemy => ({
  id: 90_000 + ++dummySeq, kind: 'slime', x: 40, y: 50, hp: 1e12, maxHp: 1e12, atk: 0,
  speed: 0, range: 7, attackInterval: 99, bounty: 1, scale: 1, cooldown: 99, abilityCd: 99,
  slowUntil: 0, stunUntil: 1e9, burnDps: 0, burnUntil: 0, poisonStacks: 0, poisonUntil: 0,
  knockStacks: 0, knockUntil: 0, boss: false, elite: false, enraged: false, striking: false,
  mutated: false, companion: false, born: true, bornAt: 0,
  ...over
})

/** A fight in progress against `foes`, with every event captured. */
const arena = (b: Battle, foes: Enemy[]): BattleEvent[] => {
  const events: BattleEvent[] = []
  b.setEventSink((e) => { events.push(e) })
  b.wavePhase.value = 'fighting'
  b.enemies.value = foes
  return events
}

/** Every fighter-on-enemy hit's damage, in order (enemies never hit back here). */
const hitsOn = (events: BattleEvent[], from = 0): number[] =>
  events.slice(from).flatMap((e) => (e.type === 'number' && e.variant === 'dmg' && e.amount > 0 ? [e.amount] : []))

/** `n` one-hit dummies bunched up, then one meteor — `n` kills in one step. */
const killMany = (b: Battle, n: number): void => {
  b.enemies.value = Array.from({ length: n }, () => dummy({ x: 70, y: 50, hp: 1, maxHp: 1 }))
  b.ultCharge.value = b.ultMax
  expect(b.fireUltimate()).toBe(true)
  b.advanceBattle(0.2) // the first meteor lands at +0.15 s and takes them all
  expect(b.enemies.value).toHaveLength(0)
}

beforeEach(() => {
  window.localStorage.clear()
  // No crits (they roll below 0.08), no jitter surprises.
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})
afterEach(() => { vi.restoreAllMocks() })

describe('charging', () => {
  it('Warcry fills in 80 kills, Mark in 100, Legion Call a quarter per kill — and only once bought', async () => {
    const b = await importBattle()
    arena(b, [])
    b.warcryUnlocked.value = true
    b.legionUnlocked.value = true
    b.markUnlocked.value = true
    // Soul Pact never charges: it is on a clock.
    killMany(b, 79)
    expect(b.warcryCharge.value).toBeCloseTo(98.75, 5)
    expect(b.warcryReady.value).toBe(false)
    killMany(b, 1)
    expect(b.warcryReady.value).toBe(true)
    expect(b.markCharge.value).toBe(80)
    expect(b.legionCharge.value).toBe(20)
  })

  it('a locked skill does not charge', async () => {
    const b = await importBattle()
    arena(b, [])
    killMany(b, 50)
    expect(b.warcryCharge.value).toBe(0)
    expect(b.legionCharge.value).toBe(0)
    expect(b.markCharge.value).toBe(0)
  })

  it('unlocking costs coins, and fails without them', async () => {
    const b = await importBattle()
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const { coins } = useEpicConfig()
    coins.value = b.warcryUnlockCost - 1
    expect(b.unlockWarcry()).toBe(false)
    coins.value = 5_000_000
    expect(b.unlockWarcry()).toBe(true)
    expect(coins.value).toBe(5_000_000 - b.warcryUnlockCost)
    expect(b.unlockWarcry()).toBe(false) // no double charge
    expect([b.warcryUnlockCost, b.markUnlockCost, b.legionUnlockCost, b.pactUnlockCost])
      .toEqual([300_000, 600_000, 1_100_000, 1_500_000])
  })
})

describe('Warcry of the Legion', () => {
  const setup = async () => {
    const b = await importBattle()
    const events = arena(b, [dummy({ x: 40, y: 50 })])
    expect(b.deployFighter(5, 36, 50)).toBe(true) // melee, splash — alone, a plain hitter
    b.warcryUnlocked.value = true
    b.warcryCharge.value = b.spellMax
    return { b, events, f: b.fighters.value[0]! }
  }

  it('adds +60% damage and +30% attack speed for 8 seconds, then lapses', async () => {
    const { b, events, f } = await setup()
    b.advanceBattle(3)
    const base = hitsOn(events)[0]!
    expect(base).toBeGreaterThan(0)

    expect(b.fireWarcry()).toBe(true)
    expect(b.warcryActive.value).toBe(true)
    expect(b.warcryCharge.value).toBe(0)
    const from = events.length
    let cooldownAfterStrike = 0
    b.setEventSink((e) => {
      events.push(e)
      if (e.type === 'strike') cooldownAfterStrike = f.cooldown
    })
    b.advanceBattle(3)
    const boosted = hitsOn(events, from)
    expect(boosted.length).toBeGreaterThan(0)
    for (const h of boosted) expect(h / base).toBeCloseTo(1.6, 1)
    const { getFighterDef } = await import('@/game/units')
    expect(cooldownAfterStrike).toBeCloseTo(getFighterDef(5).attackInterval / 1.3, 5)

    b.advanceBattle(5.1) // past the 8 s
    expect(b.warcryActive.value).toBe(false)
    const after = events.length
    b.advanceBattle(3)
    for (const h of hitsOn(events, after)) expect(h).toBe(base)
  })

  it('ADDS to the 2× ad buff (2.6×), it does not multiply it (3.2×)', async () => {
    const { b, events } = await setup()
    b.advanceBattle(3)
    const base = hitsOn(events)[0]!
    b.activateDamageBuff()
    b.fireWarcry()
    const from = events.length
    b.advanceBattle(3)
    const hits = hitsOn(events, from)
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) expect(h / base).toBeCloseTo(2.6, 1)
  })

  it('is not castable while the gate is being overrun', async () => {
    const { b } = await setup()
    b.wavePhase.value = 'overrun'
    expect(b.fireWarcry()).toBe(false)
    expect(b.warcryCharge.value).toBe(b.spellMax)
  })
})

describe('Legion Call', () => {
  const setup = async () => {
    const b = await importBattle()
    const events = arena(b, [dummy({ x: 80, y: 50 })])
    b.legionUnlocked.value = true
    b.legionCharge.value = b.spellMax
    return { b, events }
  }

  it('charges +20 for every fighter that falls — five losses fill it', async () => {
    const b = await importBattle()
    arena(b, [dummy({ x: 90 })])
    b.legionUnlocked.value = true
    for (let i = 0; i < 5; i++) b.deployFighter(3, 20, 20 + i * 12)
    for (const f of b.fighters.value.slice(0, 4)) f.hp = 0
    b.advanceBattle(1 / 30)
    expect(b.legionCharge.value).toBe(80)
    b.fighters.value[0]!.hp = 0
    b.advanceBattle(1 / 30)
    expect(b.legionReady.value).toBe(true)
  })

  it('a Revive Guard save is not a loss', async () => {
    const b = await importBattle()
    arena(b, [dummy({ x: 90 })])
    b.legionUnlocked.value = true
    b.deployFighter(3)
    b.fighters.value[0]!.revivePending = true
    b.fighters.value[0]!.hp = 0
    b.advanceBattle(1 / 30)
    expect(b.fighters.value).toHaveLength(1)
    expect(b.legionCharge.value).toBe(0)
  })

  it('summons three spectral warriors one tier below the best, at 60% health', async () => {
    const { b, events } = await setup()
    b.deployFighter(6)
    b.deployFighter(4)
    expect(b.fireLegion()).toBe(true)
    const spectral = b.fighters.value.filter((f) => f.spectral)
    expect(spectral).toHaveLength(3)
    const { getFighterDef } = await import('@/game/units')
    for (const f of spectral) {
      expect(f.tier).toBe(5)
      expect(f.maxHp).toBe(Math.round(getFighterDef(5).hp * 0.6)) // Vitality 0 → hpMult 1
      expect(f.revivePending).toBe(false)
    }
    const call = events.find((e) => e.type === 'legionCall')
    expect(call && call.type === 'legionCall' && call.points).toHaveLength(3)
    expect(b.legionRemainingMs.value).toBe(20_000)
  })

  it('is not army: ignores the cap, never saved, never merged into, never mourned', async () => {
    const { b } = await setup()
    const { getState } = await import('@/use/useEpicState')
    for (let i = 0; i < 7; i++) b.deployFighter(4, 20, 12 + i * 11)
    expect(b.armyFull.value).toBe(true)
    expect(b.fireLegion()).toBe(true) // a full army still gets its legion
    expect(b.fighters.value).toHaveLength(10)
    expect(b.armyCount.value).toBe(7)
    expect(b.deployFighter(4)).toBe(false) // …and the legion does not free a slot
    expect(getState<number[]>('battle_army', [])).toEqual([4, 4, 4, 4, 4, 4, 4])

    const ghost = b.fighters.value.find((f) => f.spectral)!
    expect(b.fieldMerge(ghost.id, ghost.tier)).toBe(false)
    expect(b.fighterAt(ghost.x, ghost.y - 5, 0.5)).toBeNull()

    ghost.hp = 0 // struck down
    b.advanceBattle(1 / 30)
    expect(b.fighters.value.filter((f) => f.spectral)).toHaveLength(2)
    expect(b.legionCharge.value).toBe(0) // no refill from a summoned death
  })

  it('dissolves after 20 seconds', async () => {
    const { b, events } = await setup()
    b.deployFighter(6)
    b.fireLegion()
    b.advanceBattle(19.9)
    expect(b.fighters.value.filter((f) => f.spectral)).toHaveLength(3)
    b.advanceBattle(0.2)
    expect(b.fighters.value.filter((f) => f.spectral)).toHaveLength(0)
    expect(events.filter((e) => e.type === 'spectralFade')).toHaveLength(3)
    expect(events.some((e) => e.type === 'fighterDeath')).toBe(false)
    expect(b.legionRemainingMs.value).toBe(0)
  })

  it('a second call while the legion stands refreshes it — never more than three', async () => {
    const { b } = await setup()
    b.deployFighter(6)
    b.fireLegion()
    b.advanceBattle(15)
    b.fighters.value.find((f) => f.spectral)!.hp = 0
    b.advanceBattle(1 / 30)
    b.legionCharge.value = b.spellMax
    expect(b.fireLegion()).toBe(true)
    const spectral = b.fighters.value.filter((f) => f.spectral)
    expect(spectral).toHaveLength(3)
    for (const f of spectral) expect(f.hp).toBe(f.maxHp)
    b.advanceBattle(19.9) // the refreshed 20 s, not the 5 s that were left
    expect(b.fighters.value.filter((f) => f.spectral)).toHaveLength(3)
  })
})

describe("Executioner's Mark", () => {
  const charged = (b: Battle): void => {
    b.markUnlocked.value = true
    b.markCharge.value = b.spellMax
  }

  it('picks the boss, else an elite, else the healthiest enemy', async () => {
    const b = await importBattle()
    const plain = dummy({ hp: 5_000, maxHp: 5_000 })
    const elite = dummy({ hp: 1_000, maxHp: 1_000, elite: true })
    const bossE = dummy({ hp: 2_000, maxHp: 2_000, boss: true })
    arena(b, [plain, elite, bossE])
    charged(b)
    expect(b.fireMark()).toBe(true)
    expect(b.markedId.value).toBe(bossE.id)

    b.enemies.value = [plain, elite]
    b.markedId.value = 0
    charged(b)
    b.fireMark()
    expect(b.markedId.value).toBe(elite.id)

    const weaker = dummy({ hp: 100, maxHp: 100 })
    b.enemies.value = [weaker, plain]
    b.markedId.value = 0
    charged(b)
    b.fireMark()
    expect(b.markedId.value).toBe(plain.id)
  })

  it('makes its target take +75% damage', async () => {
    const b = await importBattle()
    const { waveHp } = await import('@/game/units')
    const target = dummy({ x: 70 })
    const events = arena(b, [target])
    charged(b)
    b.fireMark()
    b.ultCharge.value = b.ultMax
    b.fireUltimate()
    b.advanceBattle(0.2)
    expect(hitsOn(events)[0]).toBe(Math.round(waveHp(b.wave.value) * 0.55 * 1.75))
  })

  it('executes its target the moment it drops under 12% — from any source, damage over time included', async () => {
    const b = await importBattle()
    const target = dummy({ hp: 1_000, maxHp: 1_000 })
    // A second, weaker enemy keeps the wave open after the execute.
    const events = arena(b, [target, dummy({ x: 90, hp: 10, maxHp: 10 })])
    charged(b)
    b.fireMark()
    target.hp = 121
    b.advanceBattle(1 / 30)
    expect(target.hp).toBeGreaterThan(0)
    target.hp = 119
    b.advanceBattle(1 / 30)
    expect(events.some((e) => e.type === 'execute' && e.id === target.id)).toBe(true)
    expect(b.enemies.value.some((e) => e.id === target.id)).toBe(false)
    expect(b.markedId.value).toBe(0) // the mark ends with its target
  })

  it('lapses after 10 seconds', async () => {
    const b = await importBattle()
    arena(b, [dummy()])
    charged(b)
    b.fireMark()
    b.advanceBattle(9.9)
    expect(b.markedId.value).not.toBe(0)
    b.advanceBattle(0.2)
    expect(b.markedId.value).toBe(0)
  })

  it('needs a live enemy in a live wave, and keeps its charge otherwise', async () => {
    const b = await importBattle()
    arena(b, [])
    charged(b)
    expect(b.hasMarkTarget.value).toBe(false)
    expect(b.fireMark()).toBe(false)
    b.enemies.value = [dummy()]
    b.wavePhase.value = 'countdown'
    expect(b.fireMark()).toBe(false)
    expect(b.markCharge.value).toBe(b.spellMax)
  })
})

describe('Soul Pact', () => {
  const setup = async (tiers: number[]) => {
    const b = await importBattle()
    const events = arena(b, [dummy({ x: 95 })])
    tiers.forEach((t, i) => b.deployFighter(t, 20, 14 + i * 12))
    b.pactUnlocked.value = true
    return { b, events }
  }

  it('twins the highest tier and consumes the strongest LOWER tier — the most wounded of equals', async () => {
    const { b, events } = await setup([8, 6, 6, 3])
    const [champion, sixA, sixB] = b.fighters.value
    sixB!.hp = sixB!.maxHp / 2
    const pair = b.pactPair()
    expect(pair?.champion).toBe(champion)
    expect(pair?.victim).toBe(sixB)

    expect(b.firePact()).toBe(true)
    const tiers = b.fighters.value.map((f) => f.tier).sort((x, y) => y - x)
    expect(tiers).toEqual([8, 8, 6, 3])
    expect(b.fighters.value).toContain(sixA)
    expect(b.fighters.value).not.toContain(sixB)
    const twin = b.fighters.value.find((f) => f !== champion && f.tier === 8)!
    expect(twin.hp).toBe(twin.maxHp)
    expect(twin.spectral).toBe(false)
    const ev = events.find((e) => e.type === 'soulPact')
    expect(ev && ev.type === 'soulPact' && [ev.twinId, ev.victimId]).toEqual([twin.id, sixB!.id])
    // The sacrifice is consumed, not killed.
    expect(events.some((e) => e.type === 'fighterDeath')).toBe(false)
  })

  it('persists the new army and a 3-minute cooldown', async () => {
    const { b } = await setup([7, 5])
    const { getState } = await import('@/use/useEpicState')
    b.firePact()
    expect(getState<number[]>('battle_army', []).sort((x, y) => y - x)).toEqual([7, 7])
    expect(b.pactCooldownMs.value).toBe(180_000)
    expect(getState('battle_pact_cooldown_left', 0)).toBe(180_000)
    expect(b.pactReady.value).toBe(false)
    expect(b.firePact()).toBe(false)
  })

  it('refuses when there is nothing lower to give: one fighter, or all on one tier', async () => {
    const one = await setup([9])
    expect(one.b.pactPair()).toBeNull()
    expect(one.b.firePact()).toBe(false)
    const flat = await setup([7, 7, 7])
    expect(flat.b.hasPactPair.value).toBe(false)
    expect(flat.b.firePact()).toBe(false)
    expect(flat.b.pactCooldownMs.value).toBe(0) // a refusal costs nothing
  })

  it('never takes a spectral warrior, on either side of the pact', async () => {
    const { b } = await setup([6])
    b.legionUnlocked.value = true
    b.legionCharge.value = b.spellMax
    b.fireLegion() // three T5 spectral warriors
    expect(b.pactPair()).toBeNull()
  })

  it('a reload keeps the cooldown running, and a sync never shortens it', async () => {
    await importBattle()
    const { setState, flushPersist } = await import('@/use/useEpicState')
    setState('battle_pact_cooldown_left', 95_000)
    flushPersist()
    const b = await importBattle()
    expect(b.pactCooldownMs.value).toBe(95_000)

    const state = await import('@/use/useEpicState')
    const { saveDataVersion } = await import('@/use/useSaveStatus')
    const { nextTick } = await import('vue')
    state.setState('battle_pact_cooldown_left', 10_000) // a staler device
    saveDataVersion.value += 1
    await nextTick()
    expect(b.pactCooldownMs.value).toBe(95_000)
    state.setState('battle_pact_cooldown_left', 150_000) // a fresher cast elsewhere
    saveDataVersion.value += 1
    await nextTick()
    expect(b.pactCooldownMs.value).toBe(150_000)
  })
})
