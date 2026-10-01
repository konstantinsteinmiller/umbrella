import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The drop-off funnel (retention roadmap T0.1). What the specs pin:
 *   • every milestone at most once per page session, as one `start` +
 *     `complete` pair, the only actions the Player Fit Events table shows;
 *   • clean arguments: never `/` or `^`, and this module sends only [a-z0-9_];
 *   • new vs returning in the category;
 *   • a no-op wherever the platform has no measure API;
 *   • it never throws.
 * The game-event wiring is covered in `useBarrage.test.ts`.
 */

type Call = [string, string, string]
type Funnel = typeof import('@/barrage/state/funnel')

const loadFunnel = async (): Promise<Funnel> => {
  vi.resetModules()
  return await import('@/barrage/state/funnel')
}

const spySink = (f: Funnel): Call[] => {
  const calls: Call[] = []
  f.__setFunnelSinkForTests((c, w, a) => { calls.push([c, w, a]) })
  return calls
}

const starts = (calls: Call[]): string[] => calls.filter(([, , a]) => a === 'start').map(([, w]) => w)

afterEach(() => {
  vi.unstubAllEnvs()
  delete (window as { PokiSDK?: unknown }).PokiSDK
  vi.restoreAllMocks()
})

describe('funnel: once per page session, as start + complete', () => {
  it('sends a milestone once, as one start + complete pair', async () => {
    const f = await loadFunnel()
    const calls = spySink(f)
    f.setFunnelCohortResolver(() => 'new')
    expect(f.funnelMilestone('first_shot')).toBe(true)
    expect(f.funnelMilestone('first_shot')).toBe(false)
    expect(calls).toEqual([
      ['funnel_new', 'first_shot', 'start'],
      ['funnel_new', 'first_shot', 'complete']
    ])
  })

  it('a new page session (a reload) reports again', async () => {
    const first = await loadFunnel()
    spySink(first)
    first.setFunnelCohortResolver(() => 'new')
    first.funnelMilestone('boss1_kill')
    const second = await loadFunnel()
    const calls = spySink(second)
    second.setFunnelCohortResolver(() => 'new')
    expect(second.funnelMilestone('boss1_kill')).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('rows and session play time fire every threshold they pass, once each', async () => {
    const f = await loadFunnel()
    const calls = spySink(f)
    f.setFunnelCohortResolver(() => 'new')
    f.funnelRow(4)
    f.funnelPlayTime(179)
    expect(calls).toEqual([])
    f.funnelRow(5)
    f.funnelRow(6)
    // A board resumed past both: row_20 now, row_5 not again.
    f.funnelRow(37)
    f.funnelPlayTime(180)
    f.funnelPlayTime(181)
    f.funnelPlayTime(600)
    expect(starts(calls)).toEqual(['row_5', 'row_20', 'played_180s', 'played_300s', 'played_480s'])
  })
})

describe('funnel: the measure contract', () => {
  it('only [a-z0-9_] in every argument (never / or ^), and only start / complete as actions', async () => {
    const f = await loadFunnel()
    const calls = spySink(f)
    f.setFunnelCohortResolver(() => 'new')
    for (const m of f.FUNNEL_MILESTONES) f.funnelMilestone(m)
    expect(calls).toHaveLength(f.FUNNEL_MILESTONES.length * 2)
    for (const [category, what, action] of calls) {
      for (const arg of [category, what, action]) {
        expect(arg).toMatch(/^[a-z0-9_]+$/)
        expect(arg).not.toMatch(/[/^]/)
      }
      expect(['start', 'complete']).toContain(action)
    }
    for (const c of Object.values(f.FUNNEL_CATEGORY)) expect(c).toMatch(/^[a-z0-9_]+$/)
  })

  it('pins the shipped ids: the funnel only reads across versions if they never change', async () => {
    const f = await loadFunnel()
    expect([...f.FUNNEL_MILESTONES]).toEqual([
      'first_shot', 'row_5', 'boss1_spawn', 'boss1_kill', 'first_loss', 'row_20', 'played_180s', 'played_300s', 'played_480s'
    ])
    expect(f.FUNNEL_CATEGORY).toEqual({ new: 'funnel_new', returning: 'funnel_returning' })
  })

  it('new vs returning rides in the category, decided once at the first milestone', async () => {
    const f = await loadFunnel()
    const calls = spySink(f)
    let answer: 'new' | 'returning' = 'returning'
    const resolver = vi.fn(() => answer)
    f.setFunnelCohortResolver(resolver)
    f.funnelMilestone('first_shot')
    // The save changes mid-session (the first shot is counted): the session keeps its category.
    answer = 'new'
    f.funnelMilestone('row_5')
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(new Set(calls.map(([c]) => c))).toEqual(new Set(['funnel_returning']))
  })

  it('fails closed: no resolver, or one that throws, counts as returning', async () => {
    const bare = await loadFunnel()
    const bareCalls = spySink(bare)
    bare.funnelMilestone('first_shot')
    expect(bareCalls[0]![0]).toBe('funnel_returning')
    const broken = await loadFunnel()
    const brokenCalls = spySink(broken)
    broken.setFunnelCohortResolver(() => { throw new Error('storage blocked') })
    broken.funnelMilestone('first_shot')
    expect(brokenCalls[0]![0]).toBe('funnel_returning')
  })
})

describe('funnel: platform-agnostic, never throws', () => {
  it('no measure API: nothing is sent, nothing throws, and each milestone is still consumed once', async () => {
    const f = await loadFunnel()
    f.__setFunnelSinkForTests(null)
    const resolver = vi.fn(() => 'new' as const)
    f.setFunnelCohortResolver(resolver)
    expect(f.funnelMilestone('first_loss')).toBe(true)
    expect(f.funnelMilestone('first_loss')).toBe(false)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('off Poki the build has no sink: a PokiSDK on the page hears nothing', async () => {
    vi.stubEnv('VITE_APP_POKI', '')
    const measure = vi.fn()
    ;(window as unknown as { PokiSDK: unknown }).PokiSDK = { measure }
    const f = await loadFunnel()
    f.setFunnelCohortResolver(() => 'new')
    expect(f.funnelMilestone('first_shot')).toBe(true)
    expect(measure).not.toHaveBeenCalled()
  })

  it('on the Poki build it reaches PokiSDK.measure through pokiMeasure', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    const measure = vi.fn()
    ;(window as unknown as { PokiSDK: unknown }).PokiSDK = { measure }
    const f = await loadFunnel()
    f.setFunnelCohortResolver(() => 'new')
    f.funnelMilestone('boss1_kill')
    f.funnelMilestone('boss1_kill')
    expect(measure.mock.calls).toEqual([
      ['funnel_new', 'boss1_kill', 'start'],
      ['funnel_new', 'boss1_kill', 'complete']
    ])
  })

  it('on the Poki build with no SDK on the page (a blocker, Poki Kids): a silent no-op', async () => {
    vi.stubEnv('VITE_APP_POKI', 'true')
    const f = await loadFunnel()
    f.setFunnelCohortResolver(() => 'new')
    expect(() => f.funnelMilestone('first_shot')).not.toThrow()
  })

  it('a sink or an SDK that throws never reaches the caller', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = await loadFunnel()
    f.__setFunnelSinkForTests(() => { throw new Error('sdk down') })
    f.setFunnelCohortResolver(() => 'new')
    expect(() => f.funnelMilestone('row_20')).not.toThrow()
    vi.stubEnv('VITE_APP_POKI', 'true')
    ;(window as unknown as { PokiSDK: unknown }).PokiSDK = { measure: () => { throw new Error('core crashed') } }
    const g = await loadFunnel()
    g.setFunnelCohortResolver(() => 'new')
    expect(() => g.funnelMilestone('row_20')).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})
