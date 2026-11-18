import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS worker
import worker from '../../workers/levels-bucket/src/index.js'

/** A KV namespace in memory: get / put with metadata / list by prefix. */
const fakeKv = () => {
  const m = new Map<string, { value: string; metadata?: unknown }>()
  return {
    async get(k: string, type?: string) {
      const v = m.get(k)?.value
      return v === undefined ? null : type === 'json' ? JSON.parse(v) : v
    },
    async delete(k: string) { m.delete(k) },
    async put(k: string, value: string, o?: { metadata?: unknown }) { m.set(k, { value, metadata: o?.metadata }) },
    async list({ prefix = '' }: { prefix?: string } = {}) {
      return { keys: [...m.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }
    }
  }
}
const env = { LEVELS: fakeKv(), EDITOR_TOKEN: 'pw' }
const lvl = (x: number) => ({ world: { w: 1000, h: 1000 }, spawn: { x, y: 1 }, platforms: [], winds: [] })
const at = (iso: string) => Date.parse(iso)
const post = (body: object) => worker.fetch(new Request('https://b/levels', { method: 'POST', headers: { Authorization: 'Bearer pw' }, body: JSON.stringify(body) }), env)
const get = async (qs: string, token = 'pw') => {
  const res = await worker.fetch(new Request(`https://b/levels/history?${qs}`, { headers: { Authorization: `Bearer ${token}` } }), env)
  return { status: res.status, body: await res.json() }
}

describe('levels bucket history: one version per level per day', () => {
  it('keeps the latest edit of a day, earlier days stay, and each version loads back', async () => {
    const past = Date.now() - 5 * 86_400_000
    const d1 = new Date(past).toISOString().slice(0, 10)
    const d2 = new Date(past + 86_400_000).toISOString().slice(0, 10)
    const nine = Date.parse(`${d1}T09:00:00Z`)
    const night = Date.parse(`${d1}T23:00:00Z`)
    const next = Date.parse(`${d2}T10:00:00Z`)
    for (const [t, x] of [[nine, 1], [night, 2], [next, 3]] as const) {
      await post({ campaign: { 7: { editedAt: t, level: lvl(x) } } })
    }
    const list = await get('section=campaign&key=7')
    expect(list.body.versions).toEqual([{ day: d2, editedAt: next }, { day: d1, editedAt: night }])
    expect((await get(`section=campaign&key=7&day=${d1}`)).body.level.spawn.x).toBe(2) // 9 am dropped for 11 pm
    expect((await get(`section=campaign&key=7&day=${d2}`)).body.level.spawn.x).toBe(3)
  })

  it('a late push of an older edit still lands in its own day, and never replaces a later edit of that day', async () => {
    const day = '2026-03-04'
    await post({ library: { mine: { editedAt: at(`${day}T20:00:00Z`), level: lvl(5) } } })
    await post({ library: { mine: { editedAt: at(`${day}T08:00:00Z`), level: lvl(6) } } })
    await post({ library: { mine: { editedAt: at('2026-03-02T08:00:00Z'), level: lvl(7) } } })
    const list = (await get('section=library&key=mine')).body.versions
    expect(list.map((v: { day: string }) => v.day)).toEqual(['2026-03-04', '2026-03-02'])
    expect((await get(`section=library&key=mine&day=${day}`)).body.level.spawn.x).toBe(5)
  })

  it('keeps the version an edit overwrites, and counts a day in the sender\'s time zone', async () => {
    // Existing bucket entry from before history existed.
    const old = at('2026-05-01T10:00:00Z')
    await env.LEVELS.put('bucket', JSON.stringify({ campaign: { 9: { editedAt: old, level: lvl(1) } }, library: {}, cutscenes: {} }))
    // 23:30 UTC on May 3 is 01:30 on May 4 at UTC+2 (getTimezoneOffset = -120).
    await post({ tz: -120, campaign: { 9: { editedAt: at('2026-05-03T23:30:00Z'), level: lvl(2) } } })
    const list = (await get('section=campaign&key=9')).body.versions
    expect(list.map((v: { day: string }) => v.day)).toEqual(['2026-05-04', '2026-05-01'])
    expect((await get('section=campaign&key=9&day=2026-05-01')).body.level.spawn.x).toBe(1)
  })

  it('does not record deletions, and the history is the designer\'s only', async () => {
    await post({ campaign: { 11: { editedAt: at('2026-06-01T10:00:00Z'), level: null } } })
    expect((await get('section=campaign&key=11')).body.versions).toEqual([])
    expect((await get('section=campaign&key=7', 'wrong')).status).toBe(401)
    expect((await get('section=nope&key=7')).status).toBe(400)
    expect((await get('section=campaign&key=7&day=2020-01-01')).status).toBe(404)
  })

  it('keeps the last 50 saves of a level, every save, the oldest dropping out', async () => {
    const base = Date.now() - 3_600_000
    for (let i = 0; i < 53; i++) await post({ campaign: { 21: { editedAt: base + i * 1000, level: lvl(i) } } })
    const list = (await get('section=campaign&key=21&saves=1')).body.versions
    expect(list).toHaveLength(50)
    expect(list[0].editedAt).toBe(base + 52_000) // newest first
    expect(list[49].editedAt).toBe(base + 3_000) // saves 0-2 dropped out
    expect((await get(`section=campaign&key=21&saves=1&at=${base + 3_000}`)).body.level.spawn.x).toBe(3)
    expect((await get(`section=campaign&key=21&saves=1&at=${base}`)).status).toBe(404)
    expect((await get('section=campaign&key=21&saves=1', 'wrong')).status).toBe(401)
  })
})
