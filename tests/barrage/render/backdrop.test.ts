import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { FIELD_BANDS, fieldAnchors, fieldWindow } from '@/barrage/render/backdrop'
import { BOARD_BOTTOM, BOARD_TOP, BOARD_W } from '@/barrage/render/layout'
import { FLOOR_Y, ROWS } from '@/barrage/engine/types'

/**
 * The painted floors are mapped onto the board from rows MEASURED on each
 * painting (`pnpm art:backdrops` → backdropAnchors.json), because the painter
 * never puts the rampart where the prompt asks. These cases pin that mapping
 * for every floor that ships: the rampart edge is the launcher line, the crop
 * stays inside the painting, and no band is visibly stretched.
 */
const PUBLIC = resolve(__dirname, '../../../public')

describe('painted board floors', () => {
  it('ships an anchor entry for exactly the floors that ship', () => {
    for (const b of FIELD_BANDS) {
      const shipped = existsSync(resolve(PUBLIC, `images/backdrops/${b.key}.webp`))
      expect(!!fieldAnchors(b.key), `${b.key}: webp ${shipped ? 'ships' : 'missing'} but anchors disagree`).toBe(shipped)
    }
  })

  it('orders the depth bands by row, first band from row 1', () => {
    expect(FIELD_BANDS[0]!.from).toBe(1)
    for (let i = 1; i < FIELD_BANDS.length; i++) expect(FIELD_BANDS[i]!.from).toBeGreaterThan(FIELD_BANDS[i - 1]!.from)
  })

  for (const b of FIELD_BANDS) {
    const a = fieldAnchors(b.key)
    if (!a) continue
    describe(b.key, () => {
      const win = fieldWindow(a)
      const fieldScale = win.breach / (BOARD_TOP + ROWS)   // painting px per cell, battlefield
      const stripScale = (win.edge - win.breach) / (FLOOR_Y - ROWS)
      const walkScale = (win.bottom - win.edge) / BOARD_BOTTOM
      const across = win.w / BOARD_W

      it('cuts inside the painting, rampart edge on the launcher line', () => {
        expect(win.x).toBeGreaterThanOrEqual(0)
        expect(win.x + win.w).toBeLessThanOrEqual(a.w + 1e-6)
        expect(win.edge).toBe(a.edge)
        expect(win.breach).toBeGreaterThanOrEqual(a.threshold)
        expect(win.breach).toBeLessThan(win.edge)
        expect(win.bottom).toBeLessThanOrEqual(a.h)
      })

      it('keeps the battlefield near its own aspect and the strips unsquashed', () => {
        expect(Math.abs(across / fieldScale - 1)).toBeLessThanOrEqual(0.05 + 1e-9)
        expect(stripScale / fieldScale).toBeLessThanOrEqual(1.5 + 1e-9)
        expect(Math.abs(walkScale / across - 1)).toBeLessThan(0.02)
      })

      it('keeps both rune channels inside the crop, clear of the wall rails', () => {
        const railPx = 0.1 * across
        expect(a.runeL - win.x).toBeGreaterThan(railPx)
        expect(win.x + win.w - a.runeR).toBeGreaterThan(railPx)
      })
    })
  }
})
