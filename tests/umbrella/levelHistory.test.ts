import { beforeEach, describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import { cloneLevel, saveCampaignOverride } from '@/umbrella/customLevels'
import { dayOf, historyKey, localSave, localSaves, localVersion, localVersions, mergeVersions, recordSave, recordVersion, SAVE_LIMIT } from '@/umbrella/levelHistory'

const slot = LEVELS[3]!
const edited = (x: number) => ({ ...cloneLevel(slot), spawn: { x, y: 45 } })
const t = (h: number, d = 10) => new Date(2026, 4, d, h, 0, 0).getTime() // local time

describe('level history in this browser', () => {
  beforeEach(() => { try { localStorage.clear() } catch { /* no storage */ } })

  it('keeps the latest edit of a day, earlier days stay, newest first', () => {
    const k = 'c:test'
    recordVersion(k, edited(1), t(9))
    recordVersion(k, edited(2), t(23))
    recordVersion(k, edited(9), t(12)) // older than the day's kept edit: ignored
    recordVersion(k, edited(3), t(8, 11))
    expect(localVersions(k).map((v) => v.day)).toEqual([dayOf(t(8, 11)), dayOf(t(9))])
    expect(localVersion(k, dayOf(t(9)))!.spawn.x).toBe(2)
  })

  it('saving a campaign slot keeps the version it overwrites', () => {
    saveCampaignOverride(slot.id, edited(10), t(9, 1))
    saveCampaignOverride(slot.id, edited(20), t(9, 2))
    saveCampaignOverride(slot.id, edited(30), t(22, 2)) // same day as the previous save: replaces it
    const k = historyKey('campaign', slot.id)
    expect(localVersions(k).map((v) => v.day)).toEqual([dayOf(t(9, 2)), dayOf(t(9, 1))])
    expect(localVersion(k, dayOf(t(9, 1)))!.spawn.x).toBe(10)
    expect(localVersion(k, dayOf(t(9, 2)))!.spawn.x).toBe(30)
  })

  it('merges the server and browser lists by day, the later edit standing', () => {
    const m = mergeVersions(
      [{ day: '2026-05-02', editedAt: 5, source: 'server' }, { day: '2026-05-01', editedAt: 1, source: 'server' }],
      [{ day: '2026-05-02', editedAt: 9, source: 'local' }, { day: '2026-05-01', editedAt: 1, source: 'local' }]
    )
    expect(m).toEqual([{ day: '2026-05-02', editedAt: 9, source: 'local' }, { day: '2026-05-01', editedAt: 1, source: 'server' }])
  })

  it('keeps the last 50 saves of a level, newest first, every save of a day', () => {
    const k = 'l:mine'
    for (let i = 0; i < SAVE_LIMIT + 5; i++) recordSave(k, edited(i), t(9) + i * 1000)
    recordSave(k, edited(0), t(9) + 10 * 1000) // the same save twice: once
    const list = localSaves(k)
    expect(list).toHaveLength(SAVE_LIMIT)
    expect(list[0]!.editedAt).toBe(t(9) + (SAVE_LIMIT + 4) * 1000)
    expect(localSave(k, t(9) + 4 * 1000)).toBeNull() // dropped out
    expect(localSave(k, t(9) + 5 * 1000)!.spawn.x).toBe(5)
  })

  it('every campaign save lands in the saves list, also two on one day', () => {
    const other = LEVELS[4]! // a slot no other test here has saved
    const mine = (x: number) => ({ ...cloneLevel(other), spawn: { x, y: 45 } })
    saveCampaignOverride(other.id, mine(1), t(9, 5))
    saveCampaignOverride(other.id, mine(2), t(22, 5))
    const k = historyKey('campaign', other.id)
    expect(localSaves(k).map((s) => s.editedAt)).toEqual([t(22, 5), t(9, 5)])
    expect(localVersions(k)).toHaveLength(1) // the days keep one
  })
})
