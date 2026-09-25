// Rule badges (render/ruleMarks.ts). Playtest run 4: the kinds whose one rule
// is more HP (caterpillar, ogre) wore a shield-like icon that read "shielded";
// run 5: the heart "×1.6" / "×2" that replaced it read "heal? damage? reward?"
// to all four testers. The HP number already says it — they wear NO badge now,
// while the behaviour kinds keep theirs.
import { beforeAll, describe, expect, it } from 'vitest'
import { ruleIconOf, RuleBadges, tagKeyOf, TOUGH_KINDS, type RuleIcon } from '@/barrage/render/ruleMarks'
import { BoardRenderer } from '@/barrage/render/BoardRenderer'
import type { BoardState, Monster } from '@/barrage/engine/types'
import { board, mon } from '../engine/helpers'

// jsdom has no 2D canvas: a context where every call is a no-op (see
// plusOutcome.test.ts) — and reads as 8 where a number is needed.
beforeAll(() => {
  const noop: unknown = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 8 : noop),
    apply: () => noop,
    set: () => true
  })
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement['getContext']
})

describe('the tough kinds wear no badge (run 5)', () => {
  it('caterpillar and ogre: no icon; every behaviour kind keeps its own', () => {
    expect([...TOUGH_KINDS].sort()).toEqual(['caterpillar', 'ogre'])
    for (const k of TOUGH_KINDS) expect(ruleIconOf(mon(k, 0, 0))).toBeNull()
    const kept: [Monster['kind'], RuleIcon][] = [
      ['goblin', 'hop'], ['dryad', 'heal'], ['centaur', 'spit'], ['imp', 'split'],
      ['treant', 'slow'], ['carbuncle', 'shield'], ['cyclops', 'charge']
    ]
    for (const [k, icon] of kept) expect(ruleIconOf(mon(k, 0, 0))).toBe(icon)
    expect(ruleIconOf(mon('slime', 0, 0))).toBeNull()
    // A corrupted ogre's rule is its triple coins — that badge stays.
    expect(ruleIconOf(mon('ogre', 0, 0, 9, { corrupted: true }))).toBe('coins')
    // The coach's clock still counts the kind (its sr-only introduction).
    expect(tagKeyOf(mon('ogre', 0, 0))).toBe('ogre')
  })

  it('on the board: a caterpillar and an ogre show nothing, a goblin beside them shows its badge', () => {
    const cat = mon('caterpillar', 0, 2)
    const ogre = mon('ogre', 3, 2)
    const gob = mon('goblin', 5, 2)
    const e = board({ monsters: [cat, ogre, gob] })
    const r = new BoardRenderer({ shake: () => {}, coins: () => true, confetti: () => {} })
    r.resize(390, 700, 1)
    r.setEngine(e)
    const x = r as unknown as {
      update(dt: number, s: BoardState): void
      views: Map<number, { bake: unknown }>
      badgeOf(v: unknown): RuleIcon | null
    }
    x.update(1 / 60, e.state)
    const cv = document.createElement('canvas')
    for (const m of [cat, ogre, gob]) x.views.get(m.id)!.bake = { base: cv, white: cv, frozen: cv, enraged: null, dw: 0.88, dh: 0.88 }
    expect(x.badgeOf(x.views.get(cat.id))).toBeNull()
    expect(x.badgeOf(x.views.get(ogre.id))).toBeNull()
    expect(x.badgeOf(x.views.get(gob.id))).toBe('hop')
    // Retired by the coach (its first aim phases are over): no badge either.
    r.coachRetired = new Set(['goblin'])
    expect(x.badgeOf(x.views.get(gob.id))).toBeNull()
  })
})

describe('the intent glyphs (run 5) are baked once per size', () => {
  it('none before a size; one bake per glyph and size, re-baked on a new size', () => {
    const b = new RuleBadges()
    expect(b.plus()).toBeNull()
    expect(b.rest()).toBeNull()
    expect(b.spitTarget()).toBeNull()
    b.setSize(24)
    const plus = b.plus()
    const rest = b.rest()
    const spit = b.spitTarget()
    expect(plus).not.toBeNull()
    expect(rest).not.toBeNull()
    expect(spit).not.toBeNull()
    expect(b.plus()).toBe(plus)
    expect(b.rest()).toBe(rest)
    expect(b.spitTarget()).toBe(spit)
    // The sludge target ring spans a cell: twice the badge.
    expect(spit!.width).toBe(48)
    b.setSize(24)
    expect(b.plus()).toBe(plus)
    b.setSize(30)
    expect(b.plus()).not.toBe(plus)
    expect(b.rest()).not.toBe(rest)
  })
})
