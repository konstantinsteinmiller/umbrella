// GamePushStrategy — player-field cloud save with a local fallback.
//
// Pins the bulletproof-save rules for a remote-mirroring strategy:
//   • hydrate() really READS the player fields (no hard-coded success);
//   • a throwing read is `failed-retrying`, never "empty";
//   • nothing is pushed before an observed `success-*` hydrate;
//   • merge by progress score, so a stale device cannot clobber a better save;
//   • missing panel fields / missing SDK degrade to local-only, never to a loss.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GamePushStrategy, FIELD_STATE, FIELD_META } from '@/utils/save/GamePushStrategy'
import { META_KEY, computeMeta, serializeMeta } from '@/utils/save/SaveMergePolicy'

const { gpHandle } = vi.hoisted(() => ({ gpHandle: { current: null as unknown } }))

vi.mock('@/utils/gamePushPlugin', () => ({
  getGamePush: () => gpHandle.current
}))

const STATE_KEY = 'elemental-barrage_state'

const makeLocal = (seed: Record<string, string> = {}) => {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    map,
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => { map.set(k, v) },
    remove: (k: string) => { map.delete(k) },
    keys: () => [...map.keys()]
  }
}

/** A blob whose progress score is driven by `stage`. */
const blob = (stage: number): string => JSON.stringify({ epic_stage: stage, epic_max_stage: stage })
const metaFor = (stage: number, savedAt = '2026-01-01T00:00:00.000Z'): string => {
  const b = blob(stage)
  const meta = computeMeta({ get: (k) => (k === STATE_KEY ? b : null) })
  return serializeMeta({ ...meta, savedAt })
}

const makeGp = (fields: Record<string, unknown> | 'undefined-fields') => {
  const store = new Map<string, unknown>(
    fields === 'undefined-fields' ? [] : Object.entries(fields)
  )
  const gp = {
    store,
    sync: vi.fn(async () => true),
    player: {
      ready: Promise.resolve(),
      get: vi.fn((k: string) => store.get(k)),
      set: vi.fn((k: string, v: unknown) => { store.set(k, v) }),
      sync: vi.fn(async () => true)
    }
  }
  return gp
}

describe('GamePushStrategy', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); gpHandle.current = null })

  it('reads the cloud row and mirrors it to local when local is empty', async () => {
    gpHandle.current = makeGp({ [FIELD_STATE]: blob(7), [FIELD_META]: metaFor(7) })
    const s = new GamePushStrategy()
    const local = makeLocal()
    await s.hydrate(local)
    expect(s.hydrateState).toBe('success-with-data')
    expect(local.map.get(STATE_KEY)).toBe(blob(7))
    expect(local.map.get(META_KEY)).toBeTruthy()
  })

  it('empty cloud row (fields defined, no value) is success-empty and seeds an upload of local progress', async () => {
    const gp = makeGp({ [FIELD_STATE]: '', [FIELD_META]: '' })
    gpHandle.current = gp
    const s = new GamePushStrategy()
    const local = makeLocal({ [STATE_KEY]: blob(3) })
    await s.hydrate(local)
    expect(s.hydrateState).toBe('success-empty')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.player.set).toHaveBeenCalledWith(FIELD_STATE, blob(3))
    expect(gp.player.sync).toHaveBeenCalledTimes(1)
  })

  it('keeps better local progress over a stale cloud row and pushes it up', async () => {
    const gp = makeGp({ [FIELD_STATE]: blob(2), [FIELD_META]: metaFor(2) })
    gpHandle.current = gp
    const s = new GamePushStrategy()
    const local = makeLocal({ [STATE_KEY]: blob(9), [META_KEY]: metaFor(9) })
    await s.hydrate(local)
    expect(local.map.get(STATE_KEY)).toBe(blob(9))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.store.get(FIELD_STATE)).toBe(blob(9))
  })

  it('a throwing read is failed-retrying (not empty) and pushes nothing', async () => {
    const gp = makeGp({ [FIELD_STATE]: 'x' })
    gp.player.get.mockImplementation(() => { throw new Error('boom') })
    gpHandle.current = gp
    const s = new GamePushStrategy()
    const local = makeLocal({ [STATE_KEY]: blob(1) })
    await s.hydrate(local)
    expect(s.hydrateState).toBe('failed-retrying')
    s.onLocalSet(STATE_KEY, blob(2))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.player.set).not.toHaveBeenCalled()
    s.dispose()
  })

  it('undefined panel fields degrade to local-only: no writes, no loss', async () => {
    const gp = makeGp('undefined-fields')
    gpHandle.current = gp
    const s = new GamePushStrategy()
    const local = makeLocal({ [STATE_KEY]: blob(4) })
    await s.hydrate(local)
    expect(s.hydrateState).toBe('success-empty')
    expect(local.map.get(STATE_KEY)).toBe(blob(4))
    s.onLocalSet(STATE_KEY, blob(5))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.player.set).not.toHaveBeenCalled()
  })

  it('no SDK at all (blocked script) is local-only success-empty', async () => {
    gpHandle.current = null
    const s = new GamePushStrategy()
    await s.hydrate(makeLocal())
    expect(s.hydrateState).toBe('success-empty')
    s.onLocalSet(STATE_KEY, blob(1))
    await s.flush()
  })

  it('debounces a burst of writes into ONE sync and ignores non-mirrored keys', async () => {
    const gp = makeGp({ [FIELD_STATE]: '', [FIELD_META]: '' })
    gpHandle.current = gp
    const s = new GamePushStrategy()
    await s.hydrate(makeLocal())
    s.onLocalSet(STATE_KEY, blob(1))
    s.onLocalSet(STATE_KEY, blob(2))
    s.onLocalSet(STATE_KEY, blob(3))
    s.onLocalSet('debug', 'true')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.player.sync).toHaveBeenCalledTimes(1)
    expect(gp.player.set).toHaveBeenCalledTimes(1)
    expect(gp.player.set).toHaveBeenCalledWith(FIELD_STATE, blob(3))
  })

  it('a failed sync re-queues the write for the next flush', async () => {
    const gp = makeGp({ [FIELD_STATE]: '', [FIELD_META]: '' })
    gp.player.sync.mockRejectedValueOnce(new Error('offline'))
    gpHandle.current = gp
    const s = new GamePushStrategy()
    await s.hydrate(makeLocal())
    s.onLocalSet(STATE_KEY, blob(6))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.player.sync).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(gp.player.sync).toHaveBeenCalledTimes(2)
    s.dispose()
  })

  it('flush() pushes immediately (pagehide path)', async () => {
    const gp = makeGp({ [FIELD_STATE]: '', [FIELD_META]: '' })
    gpHandle.current = gp
    const s = new GamePushStrategy()
    await s.hydrate(makeLocal())
    s.onLocalSet(STATE_KEY, blob(8))
    await s.flush()
    expect(gp.player.sync).toHaveBeenCalledTimes(1)
  })
})
