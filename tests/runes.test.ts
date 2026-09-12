import { describe, expect, it } from 'vitest'
import {
  GLYPH_W, GLYPH_H, RUNES, layoutBand, runeHeightFor, runeInsetFor, runeZoneFor, transliterate
} from '@/game/runes'

/**
 * The upgrade chips' rune border. Decorative, but it has two hard contracts:
 * it never draws outside the chip (a rune spilling into the next chip is the
 * bug the user asked us to rule out), and it never meets the chip's content
 * (the padding the chip keeps is computed from the same numbers).
 */

/** Every coordinate in a path string, as [x, y] pairs. */
const points = (d: string): [number, number][] => {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const out: [number, number][] = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!])
  return out
}

describe('glyphs', () => {
  it('every rune stays inside its 6 × 10 box', () => {
    for (const [key, glyph] of Object.entries(RUNES)) {
      for (const line of glyph) {
        for (const [x, y] of line) {
          expect(x, key).toBeGreaterThanOrEqual(0)
          expect(x, key).toBeLessThanOrEqual(GLYPH_W)
          expect(y, key).toBeGreaterThanOrEqual(0)
          expect(y, key).toBeLessThanOrEqual(GLYPH_H)
        }
      }
    }
  })
})

describe('transliteration', () => {
  it('turns each upgrade name into runes, digraphs and stand-ins included', () => {
    expect(transliterate('war horns')).toEqual(['w', 'a', 'r', 'sep', 'h', 'o', 'r', 'n', 's'])
    expect(transliterate('vitality')).toEqual(['w', 'i', 't', 'a', 'l', 'i', 't', 'j'])
    expect(transliterate('the king')).toEqual(['th', 'e', 'sep', 'k', 'i', 'ng'])
    expect(transliterate('six')).toEqual(['s', 'i', 'k', 's'])
  })

  it('only ever produces keys it can draw', () => {
    for (const text of ['war horns', 'vitality', 'bounty', 'imp sergeant', 'recruits', 'Quiz-Box 42!']) {
      for (const key of transliterate(text)) expect(RUNES[key], key).toBeDefined()
    }
  })
})

describe('band layout', () => {
  const keys = transliterate('imp sergeant')

  it('places only whole runes, inside its bounds, centred', () => {
    for (const [x0, x1] of [[10, 60], [12, 74], [9, 41], [14, 120]] as const) {
      for (const h of [3.4, 4.2, 5.5, 6.2]) {
        const band = layoutBand(keys, x0, x1, 5, h)
        expect(band.count).toBeGreaterThan(0)
        for (const [x, y] of points(band.d)) {
          expect(x).toBeGreaterThanOrEqual(x0 - 0.01)
          expect(x).toBeLessThanOrEqual(x1 + 0.01)
          expect(y).toBeGreaterThanOrEqual(5 - h / 2 - 0.01)
          expect(y).toBeLessThanOrEqual(5 + h / 2 + 0.01)
        }
        // Centred: equal slack on both sides.
        expect(band.from - x0).toBeCloseTo(x1 - band.to, 5)
      }
    }
  })

  it('draws nothing rather than a clipped rune when there is no room', () => {
    const band = layoutBand(keys, 10, 11, 5, 4)
    expect(band.count).toBe(0)
    expect(band.d).toBe('')
  })

  it('continues the inscription from the top band into the bottom one', () => {
    const top = layoutBand(keys, 10, 40, 5, 4, 0)
    const bottom = layoutBand(keys, 10, 40, 45, 4, top.next)
    expect(bottom.next).toBe(top.next + bottom.count)
  })
})

describe('the rune zone keeps runes and content apart', () => {
  it('always clears the bottom edge of the drawn runes', () => {
    for (let chipH = 24; chipH <= 110; chipH += 1) {
      const runeBottom = runeInsetFor(chipH) + runeHeightFor(chipH) / 2
      expect(runeZoneFor(chipH)).toBeGreaterThanOrEqual(runeBottom + 0.75)
    }
  })

  it('leaves a phone-sized chip enough room for its content', () => {
    // A 42px compact chip must still fit name (12) + pips (4) + cost (12).
    expect(42 - 2 * runeZoneFor(42)).toBeGreaterThanOrEqual(28)
  })
})
