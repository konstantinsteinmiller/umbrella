// The elemental tiers (21-50), the deeper Recruits ladder's numbers, and the
// big-number display they need.

import { describe, expect, it } from 'vitest'
import { formatBig } from '@/utils/bigNumber'
import { ELEMENTALS, ELEMENTAL_FIRST_TIER, ELEMENTAL_LAST_TIER, getIngredient } from '@/game/ingredients'
import { CODEX_MAX_TIER, getFighterDef } from '@/game/units'
import { ELEMENTAL_ART_TIERS, elementalArt } from '@/game/elementalArt'
import { ART_KEYS } from '@/game/artCatalogue'
import { ART_DRAWABLES, promptFor } from '@/game/artSheet'
import en from '@/i18n/locales/en'

describe('formatBig — past trillions', () => {
  it('keeps the old K/M/B/T and small numbers', () => {
    expect(formatBig(999)).toBe('999')
    expect(formatBig(1_500)).toBe('1.5K')
    expect(formatBig(2_000, { trim: true })).toBe('2K')
    expect(formatBig(4_560_000, { decimals: 2 })).toBe('4.56M')
    expect(formatBig(7e12, { decimals: 2 })).toBe('7.00T')
  })

  it('names every step up to vigintillions, then falls back to e-notation', () => {
    const want = ['Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg']
    want.forEach((suffix, i) => {
      expect(formatBig(3 * Math.pow(10, 15 + 3 * i), { trim: true })).toBe(`3${suffix}`)
    })
    expect(formatBig(4.2e70)).toBe('4.20e70')
  })

  it('rolls 999.96K over to 1.0M instead of printing 1000.0K', () => {
    expect(formatBig(999_960)).toBe('1.0M')
  })

  it('floors for the wallet so it never shows more than it holds', () => {
    expect(formatBig(1_999, { floor: true, trim: true, lower: true })).toBe('1.9k')
    expect(formatBig(2.99e15, { floor: true, lower: true })).toBe('2.9qa')
  })

  it('keeps damage numbers to three significant figures', () => {
    expect(formatBig(12_345, { sig: 3, trim: true, plainBelow: 10_000 })).toBe('12.3K')
    expect(formatBig(456_789, { sig: 3, trim: true, plainBelow: 10_000 })).toBe('457K')
    expect(formatBig(9_999, { sig: 3, trim: true, plainBelow: 10_000 })).toBe('9999')
  })
})

describe('the elemental tiers', () => {
  const tiers = Array.from({ length: 30 }, (_, i) => 21 + i)

  it('are tiers 21-50 and fill the codex to 50', () => {
    expect([ELEMENTAL_FIRST_TIER, ELEMENTAL_LAST_TIER]).toEqual([21, 50])
    expect(ELEMENTALS.map((e) => e.tier)).toEqual(tiers)
    expect(CODEX_MAX_TIER).toBe(50)
  })

  it('each has a name in the codex, and none repeats an existing name', () => {
    const names = en.battle.codex.names as Record<string, string>
    const all = Array.from({ length: 50 }, (_, i) => names[`t${i + 1}`])
    for (const n of all) expect(n).toBeTruthy()
    expect(new Set(all).size).toBe(50)
  })

  it('each has its own colours — thirty different looks, not tier 11 thirty times', () => {
    const bodies = tiers.map((t) => getIngredient(t).body)
    expect(new Set(bodies).size).toBe(30)
    expect(getIngredient(21)).not.toEqual({ ...getIngredient(11), tier: 21 })
  })

  it('ranged ones fire only projectiles the game already has art for', () => {
    const withArt = new Set(['fire', 'ice', 'stone', 'shadow', 'wind', 'cosmic'])
    let ranged = 0
    for (const t of tiers) {
      const def = getFighterDef(t)
      if (def.range > 14) {
        ranged++
        expect(withArt.has(getIngredient(t).element), `t${t} ${getIngredient(t).element}`).toBe(true)
      }
    }
    expect(ranged).toBe(22)
  })

  it('keep the stat formula: every tier out-hits and out-lasts the one below', () => {
    for (let t = 21; t <= 50; t++) {
      expect(getFighterDef(t).atk).toBeGreaterThan(getFighterDef(t - 1).atk)
      expect(getFighterDef(t).hp).toBeGreaterThan(getFighterDef(t - 1).hp)
    }
  })

  it('every ability stays in rotation, and there is melee for the Defender to promote', () => {
    const abilities = new Set(tiers.map((t) => getFighterDef(t).ability))
    for (const a of ['none', 'burn', 'knockback', 'heal', 'splash', 'poison', 'chain', 'frost', 'midas', 'eruption']) {
      expect(abilities.has(a as never), a).toBe(true)
    }
    expect(tiers.filter((t) => getFighterDef(t).range <= 14)).toHaveLength(8)
  })

  it('merges past 50 keep climbing in the capstone\'s colours', () => {
    expect(getIngredient(51)).toEqual({ ...getIngredient(50), tier: 51 })
    expect(getFighterDef(51).atk).toBeGreaterThan(getFighterDef(50).atk)
  })

})

describe('chest unit rewards scale with the strongest fighter on the field', () => {
  const load = async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    window.localStorage.clear()
    return await import('@/use/useBattle')
  }

  it('drop one tier below the best real fighter — no tier-11 cap', async () => {
    const b = await load()
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 20 } // spawn tier 21
    b.fighters.value = []
    for (const t of [34, 30, 28]) b.deployFighter(t)
    expect(b.topFieldTier.value).toBe(34)
    expect(b.chestUnitTier.value).toBe(33)
  })

  it('never drop below the Spawn tier, and ignore spectral warriors', async () => {
    const b = await load()
    b.battleUpgrades.value = { ...b.battleUpgrades.value, recruit: 9 } // spawn tier 10
    b.fighters.value = []
    expect(b.chestUnitTier.value).toBe(10) // empty field → the Spawn tier
    b.deployFighter(6)
    expect(b.chestUnitTier.value).toBe(10) // weaker army than the spawns → still 10
    b.deployFighter(15)
    b.legionUnlocked.value = true
    b.legionCharge.value = b.spellMax
    b.wavePhase.value = 'fighting'
    b.fireLegion() // three T14 ghosts — not the army
    expect(b.chestUnitTier.value).toBe(14)
  })

  it('the grid takes a reward of any tier', async () => {
    const { vi } = await import('vitest')
    vi.resetModules()
    window.localStorage.clear()
    const g = await import('@/use/usePrismGame')
    const idx = g.spawnUnitAt(42)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(g.default().grid.value[idx]).toBe(42)
  })
})

describe('the elemental drawings', () => {
  it('exist for exactly tiers 21-50', () => {
    expect(ELEMENTAL_ART_TIERS()).toEqual(Array.from({ length: 30 }, (_, i) => 21 + i))
    expect(elementalArt(20, 'x')).toBeNull()
    expect(elementalArt(51, 'x')).toBeNull()
  })

  it('are well-formed SVG, prefixed so several can share a page', () => {
    for (const t of ELEMENTAL_ART_TIERS()) {
      const markup = elementalArt(t, 'uq')!
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${markup}</svg>`, 'image/svg+xml')
      expect(doc.querySelector('parsererror'), `t${t}`).toBeNull()
      for (const id of [...doc.querySelectorAll('[id]')].map((el) => el.id)) expect(id.startsWith('uq'), `t${t} ${id}`).toBe(true)
      for (const ref of markup.match(/url\(#([^)]+)\)/g) ?? []) expect(ref.startsWith('url(#uq'), `t${t} ${ref}`).toBe(true)
    }
  })
})

describe('the art pipeline knows the new tiers', () => {
  it('has a catalogue slot and a drawable for each', () => {
    for (let t = 21; t <= 50; t++) {
      expect(ART_KEYS).toContain(`fighter-${t}`)
      expect(ART_DRAWABLES.some((d) => d.id === `unit-fighter-${t}`)).toBe(true)
    }
  })

  it('asks for the NEW design painted, floating, not a repaint of the placeholder', () => {
    const fresh = ART_DRAWABLES.find((d) => d.id === 'unit-fighter-42')!
    const old = ART_DRAWABLES.find((d) => d.id === 'unit-fighter-7')!
    const p = promptFor(fresh)
    expect(p).toContain('PLACEHOLDER')
    expect(p).toContain('no legs and no feet')
    expect(p).toContain('brilliant-cut diamond')
    expect(p).not.toContain('This is a repaint of that picture')
    expect(promptFor(old)).toContain('This is a repaint of that picture')
    expect(promptFor(old)).not.toContain('PLACEHOLDER')
  })
})
