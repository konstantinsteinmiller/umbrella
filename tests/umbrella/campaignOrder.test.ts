import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import {
  applyBucket, campaignEntries, cloneLevel, CUSTOM_ID_BASE, localBucket, nextCustomId, saveCampaignOrder, saveCampaignOverride
} from '@/umbrella/customLevels'

const ids = () => LEVELS.map((l) => l.id)
const authored = ids()

describe('campaign order', () => {
  it('swaps two levels: level 11 plays at position 10 and level 10 at 11', () => {
    const order = campaignEntries()
    ;[order[9], order[10]] = [order[10]!, order[9]!]
    saveCampaignOrder(order, 1000)
    expect(ids()[9]).toBe(authored[10])
    expect(ids()[10]).toBe(authored[9])
    expect(ids().length).toBe(authored.length)
  })
  it('adds a saved level as a slot of its own, which can be overwritten like any slot', () => {
    const id = nextCustomId([])
    expect(id).toBeGreaterThanOrEqual(CUSTOM_ID_BASE)
    const level = { ...cloneLevel(LEVELS[0]!), spawn: { x: 77, y: 88 } }
    saveCampaignOrder([{ id, custom: 'mine', level }, ...campaignEntries()], 2000)
    expect(LEVELS[0]!.id).toBe(id)
    expect(LEVELS[0]!.spawn.x).toBe(77)
    saveCampaignOverride(id, { ...level, spawn: { x: 5, y: 6 } }, 2100)
    expect(LEVELS[0]!.spawn.x).toBe(5)
    expect(localBucket().campaign.order!.editedAt).toBe(2000)
  })
  it('takes a newer order from the bucket, ignores an older one; authored levels never drop out', () => {
    expect(applyBucket({ campaign: { order: { editedAt: 1500, level: { order: [{ id: authored[3] }] } } } })).toBe(0)
    expect(applyBucket({ campaign: { order: { editedAt: 3000, level: { order: [{ id: authored[3] }, { id: 999999 }] } } } })).toBe(1)
    expect(ids()[0]).toBe(authored[3])
    expect([...ids()].sort((a, b) => a - b)).toEqual([...authored].sort((a, b) => a - b))
  })
})
