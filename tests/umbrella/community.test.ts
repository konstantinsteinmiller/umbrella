import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_APP_LEVELS_BUCKET_URL', ' https://bucket.test/ ')

const mod = await import('@/umbrella/community')

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.clear()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, body: init.body ? JSON.parse(init.body as string) : undefined }
}

describe('community client', () => {
  it('trims the base url and is enabled outside Poki/Playgama', () => {
    expect(mod.COMMUNITY_URL).toBe('https://bucket.test')
    expect(mod.communityEnabled).toBe(true)
  })

  it('persists the player id', () => {
    const a = mod.playerId()
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/)
    expect(localStorage.getItem('umb_player_id')).toBe(a)
    expect(mod.playerId()).toBe(a)
  })

  it('lists levels', async () => {
    fetchMock.mockReturnValue(
      reply(200, { items: [{ id: 'abc123', name: 'L', author: 'me', createdAt: 1, plays: 2, ratingAvg: 4.5, ratingCount: 2 }], total: 1, page: 1, pageSize: 12 })
    )
    const p = await mod.listLevels('newest', 2, 5)
    expect(lastCall().url).toBe('https://bucket.test/community/levels?sort=newest&page=2&size=5')
    expect(p?.items[0]).toEqual({ id: 'abc123', name: 'L', author: 'me', createdAt: 1, plays: 2, ratingAvg: 4.5, ratingCount: 2 })
    expect(p?.total).toBe(1)
  })

  it('gets a level with code, null on 404', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { id: 'abc123', name: 'L', author: '', createdAt: 1, plays: 0, ratingAvg: 0, ratingCount: 0, code: 'CODE_abc-123' }))
    expect((await mod.getLevel('abc123'))?.code).toBe('CODE_abc-123')
    fetchMock.mockReturnValueOnce(reply(404, { error: 'not found' }))
    expect(await mod.getLevel('nope00')).toBeNull()
  })

  it('submits and maps every outcome', async () => {
    fetchMock.mockReturnValueOnce(reply(201, { id: 'new123' }))
    expect(await mod.submitLevel({ name: 'N', author: 'A', code: 'CODECODECODE' })).toEqual({ ok: true, id: 'new123' })
    expect(lastCall().init.method).toBe('POST')
    expect(lastCall().body).toEqual({ name: 'N', author: 'A', code: 'CODECODECODE', player: mod.playerId() })

    fetchMock.mockReturnValueOnce(reply(429, { error: 'weekly-limit', limit: 5, used: 5, resetAt: 999 }))
    expect(await mod.submitLevel({ name: 'N', author: '', code: 'CODECODECODE' })).toEqual({ ok: false, reason: 'weekly-limit', resetAt: 999, used: 5 })

    fetchMock.mockReturnValueOnce(reply(400, { error: 'bad name' }))
    expect(await mod.submitLevel({ name: '', author: '', code: 'x' })).toEqual({ ok: false, reason: 'invalid' })

    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    expect(await mod.submitLevel({ name: 'N', author: '', code: 'CODECODECODE' })).toEqual({ ok: false, reason: 'network' })
  })

  it('aborts after the timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
    )
    const p = mod.submitLevel({ name: 'N', author: '', code: 'CODECODECODE' })
    await vi.advanceTimersByTimeAsync(mod.TIMEOUT_MS + 1)
    expect(await p).toEqual({ ok: false, reason: 'network' })
  })

  it('quota, play and rate', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { limit: 5, used: 2, resetAt: 123 }))
    expect(await mod.getQuota()).toEqual({ limit: 5, used: 2, resetAt: 123 })
    expect(lastCall().url).toBe(`https://bucket.test/community/quota?player=${mod.playerId()}`)

    fetchMock.mockReturnValueOnce(reply(200, { plays: 7 }))
    expect(await mod.countPlay('abc123')).toBe(7)
    expect(lastCall().url).toBe('https://bucket.test/community/levels/abc123/play')

    fetchMock.mockReturnValueOnce(reply(200, { ratingAvg: 3.5, ratingCount: 2 }))
    expect(await mod.rateLevel('abc123', 9)).toEqual({ ratingAvg: 3.5, ratingCount: 2 })
    expect(lastCall().body).toEqual({ player: mod.playerId(), stars: 5 })
  })
})
