import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import {
  applyBucket, bucketFromFile, campaignOverrides, cloneLevel, customLevels, deleteCustomLevel,
  libraryToFile, localEditedAt, saveCampaignOverride, saveCustomLevel
} from '@/umbrella/customLevels'

const slot = LEVELS[2]!
const edited = (x: number) => ({ ...cloneLevel(slot), spawn: { x, y: 45 } })

describe('levels merge: newest edit wins', () => {
  it('Export library carries saved levels, edited campaign slots and deletions with their edit times', () => {
    saveCustomLevel('mine', cloneLevel(LEVELS[0]!), 1000)
    saveCustomLevel('gone', cloneLevel(LEVELS[0]!), 1000)
    deleteCustomLevel('gone')
    saveCampaignOverride(slot.id, edited(123), 2000)
    const file = JSON.parse(JSON.stringify(libraryToFile()))
    expect(file.library.mine.editedAt).toBe(1000)
    expect(file.library.gone.level).toBeNull()
    expect(file.campaign[slot.id].level.spawn.x).toBe(123)
    expect(bucketFromFile(file)!.campaign![slot.id]!.editedAt).toBe(2000)
  })
  it('takes only entries newer than the local copy, including deletions', () => {
    saveCampaignOverride(slot.id, edited(1), 5000)
    expect(applyBucket({ campaign: { [slot.id]: { editedAt: 4000, level: edited(2) } } })).toBe(0)
    expect(LEVELS.find((l) => l.id === slot.id)!.spawn.x).toBe(1)
    expect(applyBucket({ campaign: { [slot.id]: { editedAt: 6000, level: edited(3) } } })).toBe(1)
    expect(LEVELS.find((l) => l.id === slot.id)!.spawn.x).toBe(3)
    expect(applyBucket({ campaign: { [slot.id]: { editedAt: 7000, level: null } } })).toBe(1)
    expect(campaignOverrides.value[slot.id]).toBeUndefined()
    expect(localEditedAt('campaign', String(slot.id))).toBe(7000)
    expect(LEVELS.find((l) => l.id === slot.id)!.spawn).toEqual(slot.spawn)
  })
  it('survives junk: bad shapes, invalid levels, unknown slots, future clocks', () => {
    for (const junk of [null, 42, 'x', [], { campaign: [1, 2] }, { library: 'no' }]) expect(applyBucket(junk)).toBe(0)
    expect(applyBucket({
      campaign: { 987654: { editedAt: 9e12, level: edited(9) }, [slot.id]: { editedAt: Date.now() + 9e9, level: edited(9) } },
      library: { a: { editedAt: 9000, level: { world: 'nope' } }, b: null, c: { editedAt: 'x', level: null } }
    })).toBe(0)
    expect(customLevels.value.a).toBeUndefined()
  })
  it('reads version 1 library files from before edit times', () => {
    const b = bucketFromFile({ game: 'umbrella', kind: 'levels', version: 1,
      levels: [{ name: 'old', level: cloneLevel(LEVELS[0]!) }], campaign: [{ id: slot.id, slot: 3, level: edited(5) }] }, 8000)!
    expect(b.library!.old!.editedAt).toBe(8000)
    expect(b.campaign![slot.id]!.level!.spawn.x).toBe(5)
    expect(bucketFromFile({ game: 'umbrella', kind: 'level', name: 'x', level: {} })).toBeNull()
  })
})
