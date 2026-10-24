// The kite build (/umbrella/kite/, VITE_APP_KITE=true) plays the 100 kite levels and
// never talks to the levels server; the normal build is untouched.
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
  const { KITE_LEVELS } = await import('@/umbrella/kiteLevels')
  return { levels, custom, community, state, KITE_LEVELS, fetchSpy }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('virtual:campaign-overrides')
  vi.doUnmock('virtual:campaign-order')
  vi.resetModules()
})

describe('the kite build', () => {
  it('plays the 100 kite levels, in order, without the repo campaign overrides or order', async () => {
    const { levels, KITE_LEVELS } = await load(true)
    expect(levels.LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(levels.LEVELS[0]).toEqual(KITE_LEVELS[0])
    expect(levels.LEVELS[0]!.platforms.length).toBeGreaterThan(0)
  })
  it('has no levels bucket, no community and its own save key', async () => {
    const { custom, community, state, fetchSpy } = await load(true)
    expect(custom.BUCKET_URL).toBe('')
    expect(community.communityEnabled).toBe(false)
    expect(state.STATE_KEY).toBe('umbrella_state_kite')
    expect(await custom.syncBucket()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('still keeps local editor edits of a kite level (and never uploads them)', async () => {
    const { levels, custom, fetchSpy } = await load(true)
    const edited = { ...custom.cloneLevel(levels.LEVELS[4]!), spawn: { x: 111, y: 222 } }
    custom.saveCampaignOverride(5, edited)
    expect(levels.LEVELS.find((l) => l.id === 5)!.spawn).toEqual({ x: 111, y: 222 })
    custom.saveCustomLevel('mine', edited)
    expect(custom.customLevels.value.mine?.spawn).toEqual({ x: 111, y: 222 })
    custom.clearCampaignOverride(5)
    expect(levels.LEVELS.find((l) => l.id === 5)!.spawn).toEqual(custom.builtInLevel(5)!.spawn)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('the normal build', () => {
  it('keeps the server campaign, the repo files, the bucket and the plain save key', async () => {
    const { levels, custom, community, state } = await load(false)
    expect(levels.LEVELS.length).toBeLessThan(100)
    // The repo order (2 before 1) and the repo override of slot 1 still apply.
    expect(levels.LEVELS[0]!.id).toBe(2)
    expect(levels.LEVELS[1]!.spawn).toEqual({ x: 1, y: 1 })
    expect(custom.BUCKET_URL).toBe(SERVER)
    expect(community.communityEnabled).toBe(true)
    expect(state.STATE_KEY).toBe('umbrella_state')
  })
})
