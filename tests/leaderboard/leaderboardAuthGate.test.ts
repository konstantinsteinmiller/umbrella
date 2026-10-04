import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { POSTED_NAME_KEY, SUBMITTED_SCORE_KEY } from '@/keys'

/**
 * ─── The account gate (CrazyGames) ──────────────────────────────────────────
 *
 * CG QA rejected a sibling game, verbatim: "a guest can enter the leaderboard
 * with a random name, then after logging in, that entry changes to the account
 * username… duplicate or disappearing entries". On CG a guest may neither SEE
 * nor POST to our board. But most portals have no accounts at all, so the gate
 * is injected and opt-in: unset / `null` = "no account concept" (fully
 * enabled), only `false` closes it. Collapsing the two ships every other portal
 * with no board — pinned here.
 */

const ENDPOINT = 'https://board.example.test'
const BOARD = {
  updatedAt: 1,
  total: 10,
  entries: [{ rank: 1, name: 'Ace', score: 80, flair: 9 }],
  dist: [[80, 1], [5, 9]]
}

const reply = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const load = async () => {
  vi.resetModules()
  localStorage.clear()
  vi.stubEnv('VITE_LEADERBOARD_URL', ENDPOINT)
  vi.stubEnv('VITE_LEADERBOARD_SECRET', '')
  const fetchSpy = vi.fn(async (url: string) =>
    reply(url.endsWith('/score') ? { rank: 3, best: 12, total: 10, board: BOARD } : BOARD))
  vi.stubGlobal('fetch', fetchSpy)
  const state = await import('@/use/useEpicState')
  const lb = await import('@/use/useLeaderboard')
  return { lb, state, fetchSpy }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('leaderboard account gate', () => {
  it('is open when no gate was ever injected — every portal without accounts', async () => {
    const { lb } = await load()
    expect(lb.leaderboardEnabled).toBe(true)
    expect(lb.leaderboardAllowed.value).toBe(true)
  })

  it('treats null as "this platform has no accounts", NOT as a guest', async () => {
    const { lb } = await load()
    lb.setLeaderboardAuthGate(() => null)
    expect(lb.leaderboardAllowed.value).toBe(true)
    lb.setLeaderboardAuthGate(() => false)
    expect(lb.leaderboardAllowed.value).toBe(false)
  })

  it('fails CLOSED when the getter throws — a broken SDK is not an authorisation', async () => {
    const { lb } = await load()
    lb.setLeaderboardAuthGate(() => { throw new Error('sdk exploded') })
    expect(lb.leaderboardAllowed.value).toBe(false)
  })

  it('is reactive: a mid-session sign-in opens it without a reload', async () => {
    const { lb } = await load()
    const loggedIn = ref(false)
    lb.setLeaderboardAuthGate(() => loggedIn.value)
    expect(lb.leaderboardAllowed.value).toBe(false)
    loggedIn.value = true
    expect(lb.leaderboardAllowed.value).toBe(true)
    loggedIn.value = false
    expect(lb.leaderboardAllowed.value).toBe(false)
  })

  it('a guest neither reads nor posts, and the dropped run leaves the bookkeeping untouched', async () => {
    const { lb, state, fetchSpy } = await load()
    lb.setLeaderboardAuthGate(() => false)
    state.setState(SUBMITTED_SCORE_KEY, 4)

    await lb.ensureBoard()
    await lb.reportRun(12, 3, { force: true })
    expect(await lb.submitScore(12, 3)).toBe(false)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(state.getState(SUBMITTED_SCORE_KEY, 0)).toBe(4)
    expect(state.getState(POSTED_NAME_KEY, '')).toBe('')
    // Not queued either: nothing goes out later on its own.
    await Promise.resolve()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a guest is never shown a rank, even with a cached board on the device', async () => {
    localStorage.setItem('elemental-barrage_board_cache', JSON.stringify(BOARD))
    vi.resetModules()
    vi.stubEnv('VITE_LEADERBOARD_URL', ENDPOINT)
    const lb = await import('@/use/useLeaderboard')
    expect(lb.rankFor(12)).toBeGreaterThan(0)
    lb.setLeaderboardAuthGate(() => false)
    expect(lb.rankFor(12)).toBe(0)
  })

  it('after sign-in, one clean post at the current best', async () => {
    const { lb, state, fetchSpy } = await load()
    const loggedIn = ref(false)
    lb.setLeaderboardAuthGate(() => loggedIn.value)
    await lb.reportRun(12, 3, { force: true })
    expect(fetchSpy).not.toHaveBeenCalled()

    loggedIn.value = true
    await lb.reportRun(12, 3, { force: true })
    const posts = fetchSpy.mock.calls.filter(([u]) => String(u).endsWith('/score'))
    expect(posts).toHaveLength(1)
    expect(state.getState(SUBMITTED_SCORE_KEY, 0)).toBe(12)
  })

  it('offers the sign-in invite only to a gated guest on a portal that can sign in', async () => {
    const { lb } = await load()
    const loggedIn = ref(false)
    const available = ref(true)
    const request = vi.fn()
    // No sign-in installed (every other portal): never an invite.
    lb.setLeaderboardAuthGate(() => loggedIn.value)
    expect(lb.leaderboardSignInOffered.value).toBe(false)

    lb.setLeaderboardSignIn({ available: () => available.value, request })
    expect(lb.leaderboardSignInOffered.value).toBe(true)
    lb.requestLeaderboardSignIn()
    expect(request).toHaveBeenCalledTimes(1)

    available.value = false
    expect(lb.leaderboardSignInOffered.value).toBe(false)
    available.value = true
    loggedIn.value = true
    expect(lb.leaderboardSignInOffered.value).toBe(false)
  })

  it('a rejecting sign-in request never surfaces', async () => {
    const { lb } = await load()
    lb.setLeaderboardSignIn({ available: () => true, request: async () => { throw new Error('userCancelled') } })
    expect(() => lb.requestLeaderboardSignIn()).not.toThrow()
    await nextTick()
  })

  it('the wave wiring posts as soon as the gate opens mid-session', async () => {
    const { lb, fetchSpy } = await load()
    const loggedIn = ref(false)
    lb.setLeaderboardAuthGate(() => loggedIn.value)
    const progress = await import('@/barrage/state/progress')
    progress.bestRow.value = 12
    const wave = await import('@/use/useWaveLeaderboard')
    wave.installWaveLeaderboard()
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchSpy).not.toHaveBeenCalled()

    loggedIn.value = true
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchSpy.mock.calls.some(([u]) => String(u).endsWith('/score'))).toBe(true)
  })
})

describe('the leaderboard never imports a portal SDK', () => {
  it('has no static or dynamic import of useCrazyGames', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../src/use/useLeaderboard.ts'), 'utf-8')
    expect(src).not.toMatch(/from\s+['"]@\/use\/useCrazyGames['"]/)
    expect(src).not.toMatch(/import\(\s*['"]@\/use\/useCrazyGames['"]\s*\)/)
  })
})
