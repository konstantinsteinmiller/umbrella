import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { SUBMITTED_SCORE_KEY } from '@/keys'

/**
 * ─── Elemental Barrage ⇄ the global board ───────────────────────────────────
 *
 * `useLeaderboard` is pinned by its own suites; this one pins the GAME side:
 * which number is ranked (the best endless row, floored at "one turn
 * survived"), the flair (the highest ball tier), and the three edges that
 * report it — boot, a new best, and a run ending (breach / daily over).
 */

const ENDPOINT = 'https://board.example.test'

interface Sent { url: string; method: string; body: Record<string, unknown> | null }
const sent: Sent[] = []

const reply = (body: unknown, ok = true): Response =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response

const BOARD = {
  updatedAt: 1_700_000_000_000,
  total: 500,
  entries: [{ rank: 1, name: 'Ace', score: 180, flair: 20 }],
  dist: [[180, 1], [40, 99], [12, 150], [5, 250]]
}

const load = async (url = ENDPOINT) => {
  sent.length = 0
  vi.stubEnv('VITE_LEADERBOARD_URL', url)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  vi.stubGlobal('fetch', vi.fn(async (target: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    sent.push({ url: target, method: (init?.method ?? 'GET').toUpperCase(), body })
    return body
      ? reply({ rank: 42, best: body.score, total: 500, board: BOARD })
      : reply(BOARD)
  }))
  vi.resetModules()
  const state = await import('@/use/useEpicState')
  const progress = await import('@/barrage/state/progress')
  const wave = await import('@/use/useWaveLeaderboard')
  const lb = await import('@/use/useLeaderboard')
  lastState = state
  return { state, progress, wave, lb }
}

/** The save module the last case loaded — flushed in `afterEach` so its
 *  debounced (200 ms) blob write cannot land in the next case's fresh store. */
let lastState: { flushPersist: () => void } | null = null

/** Let the watchers fire and `reportRun`'s promise chain run out. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
}

const posts = (): Sent[] => sent.filter((s) => s.method === 'POST')

afterEach(() => {
  lastState?.flushPersist()
  lastState = null
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the ranked number is the best row, once a turn is survived', () => {
  it('ranks nothing at best row 1 — a player who has not survived a turn', async () => {
    const { progress, wave } = await load()
    progress.bestRow.value = 1
    expect(wave.rankedBest.value).toBe(0)
    progress.bestRow.value = 2
    expect(wave.rankedBest.value).toBe(2)
    progress.bestRow.value = 57
    expect(wave.rankedBest.value).toBe(57)
  })

  it('posts nothing, and reads nothing, for a player who has not survived a turn', async () => {
    const { progress, wave } = await load()
    progress.bestRow.value = 1
    wave.installWaveLeaderboard()
    await settle()
    expect(sent).toHaveLength(0)
  })
})

describe('the reporting edges', () => {
  it('reports at boot, so a best the last session throttled still lands', async () => {
    const { progress, wave, state } = await load()
    progress.bestRow.value = 12
    progress.maxBallTier.value = 7
    wave.installWaveLeaderboard()
    await settle()

    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toMatchObject({ score: 12, flair: 7 })
    expect(state.getState(SUBMITTED_SCORE_KEY, 0)).toBe(12)
  })

  it('reports a new best row, carrying the highest ball tier as the tie-break', async () => {
    const { progress, wave } = await load()
    progress.bestRow.value = 1
    progress.maxBallTier.value = 4
    wave.installWaveLeaderboard()
    await settle()

    progress.noteBestRow(2)
    await settle()
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body).toMatchObject({ score: 2, flair: 4 })
  })

  it('coalesces a climb, then lets a breach post the best it stopped on', async () => {
    const { progress, wave } = await load()
    progress.bestRow.value = 1
    wave.installWaveLeaderboard()
    await settle()

    for (let r = 2; r <= 9; r++) {
      progress.noteBestRow(r)
      await settle()
    }
    // The first record went out; the rest were held by the write throttle.
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.body!.score).toBe(2)

    progress.runEndSeq.value++
    await settle()
    expect(posts()).toHaveLength(2)
    expect(posts()[1]!.body!.score).toBe(9)
  })

  it('costs nothing on a run end when the board already has the best', async () => {
    const { progress, wave } = await load()
    progress.bestRow.value = 30
    wave.installWaveLeaderboard()
    await settle()
    expect(sent).toHaveLength(1)

    progress.runEndSeq.value++
    await settle()
    expect(sent).toHaveLength(1)
  })

  it('installs once, however often the scene remounts', async () => {
    const { progress, wave } = await load()
    progress.bestRow.value = 1
    wave.installWaveLeaderboard()
    wave.installWaveLeaderboard()
    await settle()
    progress.noteBestRow(5)
    await settle()
    expect(posts()).toHaveLength(1)
  })
})

describe('a build with no board', () => {
  it('installs nothing and touches no network', async () => {
    const { progress, wave, lb } = await load('')
    expect(lb.leaderboardEnabled).toBe(false)
    progress.bestRow.value = 40
    wave.installWaveLeaderboard()
    await settle()
    progress.noteBestRow(41)
    progress.runEndSeq.value++
    await settle()
    expect(sent).toHaveLength(0)
  })
})
