// The dragon kite skin (?art=kite, VITE_APP_KITE=true) is the normal game in a new skin: the same campaign, levels server,
// community and save, with its own five-level chapter in front. The normal build is untouched.
import { afterEach, describe, expect, it, vi } from 'vitest'

const SERVER = 'https://levels.example.test'

const load = async (kite: boolean) => {
  vi.resetModules()
  vi.stubEnv('VITE_APP_KITE', kite ? 'true' : '')
  vi.stubEnv('VITE_APP_LEVELS_BUCKET_URL', SERVER)
  // The repo's campaign files (server campaign): a kite build must not take them.
  vi.doMock('virtual:campaign-overrides', () => ({ default: { 1: { id: 1, world: { w: 1280, h: 720 }, spawn: { x: 1, y: 1 }, platforms: [], winds: [], editedAt: 9e12 } } }))
  vi.doMock('virtual:campaign-order', () => ({ default: { editedAt: 1, order: [{ id: 2 }, { id: 1 }] } }))
  const fetchSpy = vi.fn(() => Promise.reject(new Error('offline')))
  vi.stubGlobal('fetch', fetchSpy)
  const levels = await import('@/umbrella/levels')
  const custom = await import('@/umbrella/customLevels')
  const community = await import('@/umbrella/community')
  const state = await import('@/use/useEpicState')
  const { DRAGON_LEVELS } = await import('@/umbrella/dragonLevels')
  return { levels, custom, community, state, DRAGON_LEVELS, fetchSpy }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('virtual:campaign-overrides')
  vi.doUnmock('virtual:campaign-order')
  vi.resetModules()
})

describe('the dragon kite skin', () => {
  it('opens with the five dragon levels, then plays the campaign with its repo order and overrides', async () => {
    const { levels, DRAGON_LEVELS } = await load(true)
    expect(levels.LEVELS.slice(0, 5).map((l) => l.id)).toEqual(DRAGON_LEVELS.map((l) => l.id))
    expect(levels.LEVELS[0]).toEqual(DRAGON_LEVELS[0])
    // Right behind them: the campaign exactly as the normal game plays it (the repo order, 2 before 1, and the slot-1 override).
    expect(levels.LEVELS[5]!.id).toBe(2)
    expect(levels.LEVELS[6]!.spawn).toEqual({ x: 1, y: 1 })
  })
  it('is the same game: the levels server, the community and one save with the normal build', async () => {
    const { custom, community, state } = await load(true)
    expect(custom.BUCKET_URL).toBe(SERVER)
    expect(community.communityEnabled).toBe(true)
    expect(state.STATE_KEY).toBe('umbrella_state')
  })
  it('starts a new player on the first dragon level and lists the dragon chapter first', async () => {
    const { custom, DRAGON_LEVELS } = await load(true)
    expect(custom.startLevelIndex()).toBe(0)
    const ranges = custom.chapterRanges()
    expect(ranges[0]).toMatchObject({ id: 'dragon', name: 'Dragon Flight', n: 1, from: 0, to: DRAGON_LEVELS.length })
    expect(ranges[1]!.from).toBe(DRAGON_LEVELS.length)
    expect(ranges.at(-1)!.to).toBe(custom.campaignEntries().length + DRAGON_LEVELS.length)
  })
  it('keeps an editor edit of a dragon level in this browser: nothing goes to the levels server or the repo file', async () => {
    const { levels, custom, fetchSpy, DRAGON_LEVELS } = await load(true)
    const id = DRAGON_LEVELS[1]!.id
    const edited = { ...custom.cloneLevel(levels.LEVELS[1]!), spawn: { x: 111, y: 222 } }
    custom.saveCampaignOverride(id, edited)
    expect(levels.LEVELS.find((l) => l.id === id)!.spawn).toEqual({ x: 111, y: 222 })
    custom.clearCampaignOverride(id)
    expect(levels.LEVELS.find((l) => l.id === id)!.spawn).toEqual(DRAGON_LEVELS[1]!.spawn)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('keeps My Levels: a level saved in the library is there in the same save', async () => {
    const { levels, custom } = await load(true)
    custom.saveCustomLevel('mine', custom.cloneLevel(levels.LEVELS[0]!))
    expect(custom.customLevels.value.mine).toBeTruthy()
  })
})

describe('the normal build', () => {
  it('keeps the server campaign, the repo files, the bucket and the plain save key, and has no dragon chapter', async () => {
    const { levels, custom, community, state, DRAGON_LEVELS } = await load(false)
    // The repo order (2 before 1) and the repo override of slot 1 still apply.
    expect(levels.LEVELS[0]!.id).toBe(2)
    expect(levels.LEVELS[1]!.spawn).toEqual({ x: 1, y: 1 })
    expect(levels.LEVELS.some((l) => DRAGON_LEVELS.some((d) => d.id === l.id))).toBe(false)
    expect(custom.BUCKET_URL).toBe(SERVER)
    expect(community.communityEnabled).toBe(true)
    expect(state.STATE_KEY).toBe('umbrella_state')
  })
})
