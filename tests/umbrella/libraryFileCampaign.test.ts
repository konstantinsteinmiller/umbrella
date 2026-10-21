import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import { campaignFromFile, cloneLevel, libraryToFile, levelsFromFile } from '@/umbrella/customLevels'

describe('library file carries campaign overrides', () => {
  it('round-trips edited campaign slots alongside the saved levels', () => {
    const slot = LEVELS[2]!
    const edited = { ...cloneLevel(slot), spawn: { x: 123, y: 45 } }
    const file = JSON.parse(JSON.stringify(libraryToFile({ mine: cloneLevel(LEVELS[0]!) }, { [slot.id]: edited })))
    expect(file.campaign).toHaveLength(1)
    expect(file.campaign[0].slot).toBe(3)
    expect(levelsFromFile(file).map((l) => l.name)).toEqual(['mine'])
    const back = campaignFromFile(file)
    expect(back[slot.id]!.spawn).toEqual({ x: 123, y: 45 })
    expect(back[slot.id]!.id).toBe(slot.id)
  })
  it('drops unknown ids and older files without a campaign section', () => {
    expect(campaignFromFile({ campaign: [{ id: 987654, level: cloneLevel(LEVELS[0]!) }] })).toEqual({})
    expect(campaignFromFile(libraryToFile({}))).toEqual({})
  })
})
