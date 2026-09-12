// Regression coverage for "the cleared wave never reaches the Playgama remote",
// carried forward to Bridge SDK v2.
//
// Three separate defects produced that symptom and each still gets a test here:
//
//   1. Cloud storage is gated on `allowAnonymousCloudSave`. The gate survived
//      the v2 upgrade — the shipped bundle still computes
//        canUseCloud = isCloudSaveSupported
//                      && (allowAnonymousCloudSave || player.isAuthorized)
//      — so a guest player without the flag silently writes local-only and
//      nothing reaches the remote. What CHANGED is who decides: v1 made the
//      game probe `isAvailable('platform_internal')` and pass a storage TYPE
//      on every call; v2 removed both and routes internally. So the flag is
//      now asserted where it is actually set (the init options, in
//      `playgamaSignals.test.ts`, and the emitted bridge config) and this file
//      asserts the half that is still ours: every write goes THROUGH
//      `bridge.storage.set`, whatever backend it lands in.
//
//   2. `hydrate()` was a no-op with a hard-coded `success-with-data`. Nothing
//      was ever read back, and the fake terminal state disabled BOTH the boot
//      sanity guard and the "don't push before a good hydrate" rule — so a
//      defaults boot published defaults over the real save.
//
//   3. `storage.get(key, tryParseJson)` defaults `tryParseJson` to TRUE, so
//      our JSON payload came back as an OBJECT. A `typeof === 'string'` check
//      drops it silently. (v2 dropped the middle storage-type argument; the
//      parsing default is unchanged.)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'
import { isPlaygamaSdkActive } from '@/utils/playgamaPlugin'
import { META_KEY, computeMeta, serializeMeta } from '@/utils/save/SaveMergePolicy'

// v2 has no `window.bridge` global to stub: the Bridge is an npm singleton the
// plugin loads and hands out via `getPlaygamaBridge()`. Mock that one accessor
// (plus the readiness ref the strategy gates on) and the strategy is exercised
// exactly as it runs in production.
const { bridgeHandle } = vi.hoisted(() => ({
  bridgeHandle: { current: null as unknown }
}))

vi.mock('@/utils/playgamaPlugin', async () => {
  const { ref } = await import('vue')
  return {
    isPlaygamaSdkActive: ref(false),
    getPlaygamaBridge: () => bridgeHandle.current
  }
})

const STATE_KEY = 'merge-idle-war_state'
const WAVE_FIELD = 'battle_wave'
const BEST_WAVE_FIELD = 'battle_best_wave'
const STAGE_FIELD = 'epic_stage'

interface FakeLocal {
  get: (k: string) => string | null
  set: (k: string, v: string) => void
  remove: (k: string) => void
  keys: () => string[]
}

const makeLocal = (seed: Record<string, string> = {}): FakeLocal & { map: Map<string, string> } => {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => { map.set(k, v) },
    remove: (k) => { map.delete(k) },
    keys: () => [...map.keys()]
  }
}

/** Build a state blob the way `useEpicState` does — one JSON object holding
 *  every persisted field, including the wave the player cleared. */
const stateBlob = (fields: Record<string, unknown>): string => JSON.stringify(fields)

interface FakeBridgeOpts {
  /** Pre-existing row in the Bridge's store. v2 exposes ONE keyspace — which
   *  backend it lands in (portal cloud or the Bridge's local adapter) is the
   *  Bridge's decision, not ours, so the fake has one store too. */
  cloudSeed?: Record<string, string>
  /** Make `storage.get` reject, simulating an api.playgama.com blip. */
  failGet?: boolean
  /** Reproduce the real default: `get` JSON-parses unless told otherwise. */
  parseJsonByDefault?: boolean
}

const installFakeBridge = (opts: FakeBridgeOpts = {}) => {
  const cloud = new Map<string, string>(Object.entries(opts.cloudSeed ?? {}))

  const calls = { set: [] as Array<{ keys: string[] }>, get: 0 }

  // v2 signatures: `get(key, tryParseJson?)`, `set(key, value)`,
  // `delete(key)`. The storage-TYPE argument every v1 call carried is gone.
  const storage = {
    get: (key: string | string[], tryParseJson?: boolean) => {
      calls.get += 1
      if (opts.failGet) return Promise.reject(new Error('network'))
      const shouldParse = opts.parseJsonByDefault === true && tryParseJson !== false
      const read = (k: string): unknown => {
        const raw = cloud.get(k) ?? null
        if (raw !== null && shouldParse) {
          try { return JSON.parse(raw) } catch { return raw }
        }
        return raw
      }
      if (Array.isArray(key)) return Promise.resolve(key.map(read))
      return Promise.resolve(read(key))
    },
    set: (key: string | string[], value: unknown) => {
      const keys = Array.isArray(key) ? key : [key]
      const values = Array.isArray(value) ? value : [value]
      calls.set.push({ keys })
      keys.forEach((k, i) => {
        const v = values[i]
        cloud.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
      })
      return Promise.resolve()
    },
    delete: (key: string | string[]) => {
      for (const k of (Array.isArray(key) ? key : [key])) cloud.delete(k)
      return Promise.resolve()
    }
  }

  bridgeHandle.current = { storage }
  isPlaygamaSdkActive.value = true
  return { cloud, calls, storage }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  bridgeHandle.current = null
  isPlaygamaSdkActive.value = false
})

describe('PlaygamaStrategy — v2 has no storage-type probe', () => {
  it('hydrates straight off bridge.storage, with no isAvailable() call', async () => {
    // v1 asked `storage.isAvailable('platform_internal')` and then passed a
    // type to every call. On adapters where the probe answered false or threw
    // — YouTube's among them, where `localStorage` is null so the "safe"
    // local fallback cannot work either — the game wrote into a store that
    // does not exist and nothing surfaced as an error. v2 deletes the concept,
    // so the fake exposes no `isAvailable` at all: if the strategy still
    // reached for one, this hydrate would not settle.
    const fake = installFakeBridge()
    const local = makeLocal()
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)

    expect(strat.hydrateState).toBe('success-empty')
    expect(fake.calls.get).toBeGreaterThan(0)
    expect('isAvailable' in fake.storage).toBe(false)
  })

  it('reads BOTH portal keys in ONE get() call', async () => {
    // Rule 4: on a whole-blob adapter every read is a full download and every
    // write a read-modify-write of the entire save. One batched call is the
    // difference between one round trip and 2N.
    const fake = installFakeBridge()
    await new PlaygamaStrategy().hydrate(makeLocal())
    expect(fake.calls.get).toBe(1)
  })
})

describe('PlaygamaStrategy — the cleared wave round-trips to the remote', () => {
  it('writes the wave through bridge.storage.set into the cloud bucket', async () => {
    const fake = installFakeBridge()
    const local = makeLocal()
    const strat = new PlaygamaStrategy()
    await strat.hydrate(local)

    // Player clears wave 37 — useEpicState persists the whole blob.
    const blob = stateBlob({ [WAVE_FIELD]: 37, [BEST_WAVE_FIELD]: 37, [STAGE_FIELD]: 5 })
    local.set(STATE_KEY, blob)
    strat.onLocalSet(STATE_KEY, blob)

    await vi.advanceTimersByTimeAsync(1000)
    await strat.flush()

    expect(fake.cloud.get(STATE_KEY)).toBe(blob)
    expect(JSON.parse(fake.cloud.get(STATE_KEY)!)[BEST_WAVE_FIELD]).toBe(37)
    // Cert signal: the write went through `bridge.storage.set` — the call the
    // QA Tool's "Game Saves" check watches for. Which backend the Bridge
    // routed it to is its business, not ours, in v2.
    expect(fake.calls.set.length).toBeGreaterThan(0)
    // ONE batched call carrying both keys, never one call per key (rule 4).
    expect(fake.calls.set).toHaveLength(1)
    expect(fake.calls.set[0].keys).toEqual(expect.arrayContaining([STATE_KEY, META_KEY]))
  })

  it('reads the wave back on the next boot (hydrate is no longer a no-op)', async () => {
    const blob = stateBlob({ [WAVE_FIELD]: 37, [BEST_WAVE_FIELD]: 37, [STAGE_FIELD]: 5 })
    const meta = serializeMeta(computeMeta({ get: (k) => (k === STATE_KEY ? blob : null) }))
    installFakeBridge({
      cloudSeed: { [STATE_KEY]: blob, [META_KEY]: meta }
    })
    // Fresh device / wiped iframe storage: local has nothing.
    const local = makeLocal()
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)

    expect(strat.hydrateState).toBe('success-with-data')
    expect(local.get(STATE_KEY)).toBe(blob)
    expect(JSON.parse(local.get(STATE_KEY)!)[BEST_WAVE_FIELD]).toBe(37)
  })

  it('survives the bridge JSON-parsing the payload on read', async () => {
    // Defect 3: `get` parses by default, handing back an object. The strategy
    // must re-serialize rather than drop it.
    const blob = stateBlob({ [BEST_WAVE_FIELD]: 88, [STAGE_FIELD]: 9 })
    installFakeBridge({
      cloudSeed: { [STATE_KEY]: blob },
      parseJsonByDefault: true
    })
    const local = makeLocal()
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)

    expect(strat.hydrateState).toBe('success-with-data')
    expect(JSON.parse(local.get(STATE_KEY)!)[BEST_WAVE_FIELD]).toBe(88)
  })

  it('always calls through the bridge, never straight to local (cert detection)', async () => {
    // Rule 3: a "this write is only local anyway → skip" optimization zeroes
    // the Game Saves check even while local writes land perfectly.
    const fake = installFakeBridge()
    const local = makeLocal()
    const strat = new PlaygamaStrategy()
    await strat.hydrate(local)

    const blob = stateBlob({ [BEST_WAVE_FIELD]: 12 })
    local.set(STATE_KEY, blob)
    strat.onLocalSet(STATE_KEY, blob)
    await vi.advanceTimersByTimeAsync(1000)
    await strat.flush()

    expect(fake.calls.set.length).toBeGreaterThan(0)
    expect(fake.cloud.get(STATE_KEY)).toBe(blob)
  })
})

describe('PlaygamaStrategy — defaults must never clobber a real cloud save', () => {
  it('keeps the higher-progress cloud save when local looks fresh', async () => {
    const cloudBlob = stateBlob({ [BEST_WAVE_FIELD]: 120, [STAGE_FIELD]: 14 })
    const cloudMeta = serializeMeta(
      computeMeta({ get: (k) => (k === STATE_KEY ? cloudBlob : null) })
    )
    installFakeBridge({
      cloudSeed: { [STATE_KEY]: cloudBlob, [META_KEY]: cloudMeta }
    })
    // Fresh-defaults local: stage 1, no waves.
    const localBlob = stateBlob({ [BEST_WAVE_FIELD]: 1, [STAGE_FIELD]: 1 })
    const local = makeLocal({ [STATE_KEY]: localBlob })
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)

    expect(JSON.parse(local.get(STATE_KEY)!)[STAGE_FIELD]).toBe(14)
  })

  it('does NOT push while hydrate is unresolved (failed read)', async () => {
    const fake = installFakeBridge({ failGet: true })
    const local = makeLocal()
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)
    expect(strat.hydrateState).toBe('failed-retrying')

    // A defaults write arrives while we still don't know the cloud's contents.
    const defaults = stateBlob({ [BEST_WAVE_FIELD]: 1, [STAGE_FIELD]: 1 })
    local.set(STATE_KEY, defaults)
    strat.onLocalSet(STATE_KEY, defaults)
    await vi.advanceTimersByTimeAsync(1000)

    // Nothing may have been published — this is the rule that stops a
    // transient blip from overwriting the player's real save with defaults.
    expect(fake.calls.set.length).toBe(0)
  })

  it('keeps local (and queues it) when local out-scores the cloud', async () => {
    const cloudBlob = stateBlob({ [BEST_WAVE_FIELD]: 3, [STAGE_FIELD]: 2 })
    const cloudMeta = serializeMeta(
      computeMeta({ get: (k) => (k === STATE_KEY ? cloudBlob : null) })
    )
    const fake = installFakeBridge({
      cloudSeed: { [STATE_KEY]: cloudBlob, [META_KEY]: cloudMeta }
    })
    const localBlob = stateBlob({ [BEST_WAVE_FIELD]: 90, [STAGE_FIELD]: 11 })
    const localMeta = serializeMeta(
      computeMeta({ get: (k) => (k === STATE_KEY ? localBlob : null) })
    )
    const local = makeLocal({ [STATE_KEY]: localBlob, [META_KEY]: localMeta })
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)
    expect(JSON.parse(local.get(STATE_KEY)!)[STAGE_FIELD]).toBe(11)

    // The local win must be published back up, not just kept on device.
    await vi.advanceTimersByTimeAsync(1000)
    await strat.flush()
    expect(fake.cloud.get(STATE_KEY)).toBe(localBlob)
  })

  it('publishes a META blob so the next boot can score this save', async () => {
    const fake = installFakeBridge()
    const local = makeLocal()
    const strat = new PlaygamaStrategy()
    await strat.hydrate(local)

    const blob = stateBlob({ [BEST_WAVE_FIELD]: 20, [STAGE_FIELD]: 7 })
    local.set(STATE_KEY, blob)
    strat.onLocalSet(STATE_KEY, blob)
    await vi.advanceTimersByTimeAsync(1000)
    await strat.flush()

    const meta = fake.cloud.get(META_KEY)
    expect(meta).toBeTruthy()
    expect(JSON.parse(meta!).maxStage).toBe(7)
  })
})

describe('PlaygamaStrategy — key allowlist', () => {
  it('does not mirror the bridge guest id or dev toggles to the portal', async () => {
    const fake = installFakeBridge()
    const local = makeLocal()
    const strat = new PlaygamaStrategy()
    await strat.hydrate(local)

    strat.onLocalSet('bridge_player_guest_id', 'abc123')
    strat.onLocalSet('debug', 'true')
    await vi.advanceTimersByTimeAsync(1000)
    await strat.flush()

    expect(fake.cloud.has('bridge_player_guest_id')).toBe(false)
    expect(fake.cloud.has('debug')).toBe(false)
  })
})
