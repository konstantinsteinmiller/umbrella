import { describe, expect, it } from 'vitest'
import { sheetById } from '@/umbrella/art/manifest'
import { CLAY_LOOK, CLAY_SHEETS, buildClayIndex, clayPromptDoc } from '@/umbrella/art/clay'
import { LANTERN_SHEETS } from '@/umbrella/art/lantern'
import { alsoOf, promptFor } from '@/umbrella/art/prompts'

describe('clay sheets', () => {
  it('keep the kite manifest lattice, registration and animations of the same id', () => {
    for (const s of CLAY_SHEETS) {
      const k = sheetById(s.id)
      expect(k, s.id).toBeDefined()
      // The finish's pieces are clay's own (doorstep, postbox, flag, bunting); everything else is the kite lattice.
      const shape = (x: typeof s) => ({ use: x.use, cols: x.cols, rows: x.rows, box: x.box, boxes: x.boxes, fit: x.fit, ...(x.id === 'finish-dais' ? {} : { anims: x.anims }) })
      expect(shape(s), s.id).toEqual(shape(k!))
    }
  })

  it('paints the same drawables as the lantern set, the wind excepted (the game draws its streaks)', () => {
    const lantern = new Set(LANTERN_SHEETS.map((s) => s.id))
    lantern.delete('wind-wisps')
    lantern.delete('wind-paper')
    expect(new Set(CLAY_SHEETS.map((s) => s.id).filter((id) => id !== 'clay-wind'))).toEqual(lantern)
  })

  it('paints every pose of a character from one figure of its model sheet', () => {
    for (const s of CLAY_SHEETS.filter((x) => (x.group === 'pweeg' || x.group === 'chad') && x.use !== 'model')) {
      expect(s.modelCard, s.id).toBe(true)
      expect(alsoOf(s).some((f) => f.startsWith('cards/')), s.id).toBe(true)
    }
  })

  it('writes a prompt per sheet and an index without the hand-cut gate', () => {
    const doc = clayPromptDoc()
    for (const s of CLAY_SHEETS) expect(doc, s.id).toContain(s.title)
    expect(promptFor(CLAY_SHEETS[0]!, undefined, CLAY_LOOK)).toContain('CLAYMATION')
    const index = buildClayIndex()
    expect(index.walks.map((w: { id: string }) => w.id)).not.toContain('gate')
    expect(index.outDir).toBe('src/assets/umbrella-art-clay')
  })
})
