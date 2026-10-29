// Chapters: the campaign split into named runs of levels (Chapter 1 holds everything until the
// designer makes more), the chapter a new player starts with, card subtitles, and the game-jam
// chapter the itch.io build plays — all inside the one campaign "order" entry the bucket syncs.
import { afterEach, describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import {
  applyBucket, campaignChapters, campaignEntries, chapterRanges, cloneLevel, CUSTOM_ID_BASE, JAM_CHAPTER, jamPlay, localBucket,
  nextCustomId, parseOrder, saveCampaignOrder, setJamTest, startChapterId, startLevelIndex
} from '@/umbrella/customLevels'

const ids = () => LEVELS.map((l) => l.id)
const authored = campaignEntries().map((e) => e.id)
let clock = 10_000
const at = () => (clock += 1000)

afterEach(() => setJamTest(false))

describe('chapter 1', () => {
  it('holds every campaign level until the designer makes more chapters', () => {
    const chapters = campaignChapters()
    expect(chapters).toHaveLength(1)
    expect(chapters[0]!.levels).toEqual(authored)
    expect(startLevelIndex()).toBe(0)
    expect(chapterRanges()).toEqual([expect.objectContaining({ n: 1, from: 0, to: LEVELS.length })])
  })
})

describe('chapters', () => {
  const split = (k: number, extra: object = {}) => {
    const all = campaignEntries()
    saveCampaignOrder(all, at(), [], {
      chapters: [
        { id: 'c1', name: 'First steps', levels: all.slice(0, k).map((e) => e.id) },
        { id: 'c2', name: 'Storm', subtitle: '  Into the storm  ', levels: all.slice(k).map((e) => e.id) }
      ],
      ...extra
    })
  }

  it('play chapter by chapter, and reordering chapters reorders the levels', () => {
    split(3)
    expect(chapterRanges().map((c) => [c.id, c.from, c.to])).toEqual([['c1', 0, 3], ['c2', 3, authored.length]])
    expect(campaignChapters()[1]!.subtitle).toBe('Into the storm')
    const [a, b] = campaignChapters()
    saveCampaignOrder(campaignEntries(), at(), [], { chapters: [b!, a!] })
    expect(ids().slice(0, b!.levels.length)).toEqual(b!.levels)
    expect(ids().slice(b!.levels.length)).toEqual(a!.levels)
  })

  it('start a new player at the start chapter\'s first level', () => {
    split(4, { start: 'c2' })
    expect(startChapterId()).toBe('c2')
    expect(startLevelIndex()).toBe(4)
    split(4, { start: 'nope' })
    expect(startChapterId()).toBe('c1')
  })

  it('put a level no chapter names into the last chapter, and each level in one chapter only', () => {
    const all = campaignEntries()
    saveCampaignOrder(all, at(), [], {
      chapters: [
        { id: 'c1', levels: [all[0]!.id, all[1]!.id] },
        { id: 'c2', levels: [all[1]!.id, all[2]!.id] } // all[1] twice, the rest missing
      ]
    })
    const [c1, c2] = campaignChapters()
    expect(c1!.levels).toEqual([all[0]!.id, all[1]!.id])
    expect(c2!.levels[0]).toBe(all[2]!.id)
    expect(c2!.levels.slice(1).sort()).toEqual(all.slice(3).map((e) => e.id).sort())
  })

  it('ride the campaign order entry through the bucket, and a newer one wins', () => {
    split(2, { start: 'c2' })
    const body = localBucket().campaign.order!.level as unknown as { chapters: unknown[]; start: string; order: unknown[] }
    expect(body.chapters).toHaveLength(2)
    expect(body.start).toBe('c2')
    expect(body.order).toHaveLength(authored.length) // older clients still get the flat order
    const t = at()
    expect(applyBucket({ campaign: { order: { editedAt: t + 5000, level: { ...body, start: 'c1', chapters: [{ id: 'c1', name: 'All', levels: authored }] } } } })).toBe(1)
    expect(campaignChapters()).toEqual([expect.objectContaining({ id: 'c1', name: 'All' })])
    expect(startChapterId()).toBe('c1')
  })

  it('drop bad chapter data instead of trusting it', () => {
    const o = parseOrder({ editedAt: 1, order: [], chapters: [{ id: 'jam', levels: [] }, { id: 'ok', levels: ['x', 999_999] }, { levels: [] }], start: 'gone' })
    expect(o!.chapters).toEqual([{ id: 'ok', levels: [] }])
    expect(o!.start).toBeUndefined()
  })
})

describe('the game-jam chapter', () => {
  const jamOf = () => {
    const all = campaignEntries()
    const id = nextCustomId([])
    const saved = { ...cloneLevel(LEVELS[0]!), spawn: { x: 123, y: 45 } }
    saveCampaignOrder(all, at(), [], {
      chapters: [{ id: 'c1', levels: all.map((e) => e.id) }],
      jam: [{ id: all[5]!.id }, { id, custom: 'my jam level', level: { ...saved, id } }, { id: all[2]!.id }],
      jamName: 'Umbrella Jam',
      jamSubtitle: 'Rain or shine'
    })
    return { all, id }
  }

  it('is not played anywhere but the itch.io build (or the editor\'s jam test)', () => {
    const { all } = jamOf()
    expect(jamPlay.value).toBe(false)
    expect(ids()).toEqual(all.map((e) => e.id))
  })

  it('plays campaign levels by reference and saved levels as snapshots, in its own order', () => {
    const { all, id } = jamOf()
    expect(id).toBeGreaterThanOrEqual(CUSTOM_ID_BASE)
    setJamTest(true)
    expect(ids()).toEqual([all[5]!.id, id, all[2]!.id])
    expect(LEVELS[1]!.spawn.x).toBe(123)
    expect(startLevelIndex()).toBe(0)
    // One chapter, the jam one: its card says Chapter 1 and carries its subtitle.
    expect(chapterRanges()).toEqual([{ id: JAM_CHAPTER, name: 'Umbrella Jam', subtitle: 'Rain or shine', n: 1, from: 0, to: 3 }])
    setJamTest(false)
    expect(ids()).toEqual(all.map((e) => e.id))
  })

  it('keeps its snapshot ids clear of the campaign\'s', () => {
    const { id } = jamOf()
    expect(nextCustomId([])).toBeGreaterThan(id)
  })
})
