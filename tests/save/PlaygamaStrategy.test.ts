// Regression coverage for "the cleared wave never reaches the Playgama remote".
//
// Three separate defects produced that symptom and each gets a test here:
//
//   1. `platform_internal` is gated on `allowAnonymousCloudSave`. The live
//      bridge's Playgama adapter computes
//        isStorageAvailable(PLATFORM_INTERNAL)
//          = isCloudSaveSupported && (allowAnonymousCloudSave || isAuthorized)
//      so a guest player fell back to `local_storage` and nothing reached the
//      cloud. The strategy must USE platform_internal whenever the bridge says
//      it's available, and must still call through the bridge (never skip) in
//      the local fallback, because the "Game Saves" cert check watches
//      `storage.set` as its detection signal.
//
//   2. `hydrate()` was a no-op with a hard-coded `success-with-data`. Nothing
//      was ever read back, and the fake terminal state disabled BOTH the boot
//      sanity guard and the "don't push before a good hydrate" rule — so a
//      defaults boot published defaults over the real save.
//
//   3. `storage.get(key, type)` defaults its third arg `tryParseJson` to TRUE,
//      so our JSON payload came back as an OBJECT. A `typeof === 'string'`
//      check drops it silently.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'
import { isPlaygamaSdkActive } from '@/utils/playgamaPlugin'
import { META_KEY, computeMeta, serializeMeta } from '@/utils/save/SaveMergePolicy'

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
  /** Mirrors the adapter gate: cloud is available only for an authorized
   *  player OR when `allowAnonymousCloudSave` is configured. */
  isAuthorized?: boolean
  allowAnonymousCloudSave?: boolean
  /** Pre-existing cloud row, keyed by storage type. */
  cloudSeed?: Record<string, string>
  localSeed?: Record<string, string>
  /** Make `storage.get` reject, simulating an api.playgama.com blip. */
  failGet?: boolean
  /** Reproduce the real default: `get` JSON-parses unless told otherwise. */
  parseJsonByDefault?: boolean
}

const installFakeBridge = (opts: FakeBridgeOpts = {}) => {
  const cloud = new Map<string, string>(Object.entries(opts.cloudSeed ?? {}))
  const local = new Map<string, string>(Object.entries(opts.localSeed ?? {}))
  const cloudAvailable =
    (opts.allowAnonymousCloudSave === true) || (opts.isAuthorized === true)

  const bucket = (type?: string) =>
    type === 'platform_internal' ? cloud : local

  const calls = { set: [] as Array<{ keys: string[]; type: string }>, get: 0 }

  const storage = {
    defaultType: 'local_storage' as const,
    isAvailable: (type: string) =>
      type === 'platform_internal' ? cloudAvailable : true,
    get: (key: string | string[], type?: string, tryParseJson?: boolean) => {
      calls.get += 1
      if (opts.failGet) return Promise.reject(new Error('network'))
      const store = bucket(type)
      // The real helper parses when `tryParseJson` is not explicitly false.
      const shouldParse = opts.parseJsonByDefault === true && tryParseJson !== false
      const read = (k: string): unknown => {
        const raw = store.get(k) ?? null
        if (raw !== null && shouldParse) {
          try { return JSON.parse(raw) } catch { return raw }
        }
        return raw
      }
      if (Array.isArray(key)) return Promise.resolve(key.map(read))
      return Promise.resolve(read(key))
    },
    set: (key: string | string[], value: unknown, type?: string) => {
      const store = bucket(type)
      const keys = Array.isArray(key) ? key : [key]
      const values = Array.isArray(value) ? value : [value]
      calls.set.push({ keys, type: type ?? 'local_storage' })
      keys.forEach((k, i) => {
        const v = values[i]
        store.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
      })
      return Promise.resolve()
    },
    delete: (key: string | string[], type?: string) => {
      const store = bucket(type)
      for (const k of (Array.isArray(key) ? key : [key])) store.delete(k)
      return Promise.resolve()
    }
  }

  ;(window as unknown as { bridge?: unknown }).bridge = { storage }
  isPlaygamaSdkActive.value = true
  return { cloud, local, calls, storage }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { bridge?: unknown }).bridge
  isPlaygamaSdkActive.value = false
})

describe('PlaygamaStrategy — cloud storage selection', () => {
  it('uses platform_internal when anonymous cloud save is allowed (the fix)', async () => {
    const fake = installFakeBridge({ allowAnonymousCloudSave: true })
    const local = makeLocal()
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)

    expect(strat.resolvedStorageType).toBe('platform_internal')
  })

  it('still reaches cloud for an authorized player with no config flag', async () => {
    installFakeBridge({ isAuthorized: true })
    const strat = new PlaygamaStrategy()
    await strat.hydrate(makeLocal())
    expect(strat.resolvedStorageType).toBe('platform_internal')
  })

  it('falls back to local_storage for an anonymous player with no flag — the bug', async () => {
    // This is the pre-fix production state: guest player, no config flag.
    // Documented here so a config regression is caught by a failing
    // expectation elsewhere rather than by a rejected submission.
    installFakeBridge({ isAuthorized: false, allowAnonymousCloudSave: false })
    const strat = new PlaygamaStrategy()
    await strat.hydrate(makeLocal())
    expect(strat.resolvedStorageType).toBe('local_storage')
  })
})

describe('PlaygamaStrategy — the cleared wave round-trips to the remote', () => {
  it('writes the wave through bridge.storage.set into the cloud bucket', async () => {
    const fake = installFakeBridge({ allowAnonymousCloudSave: true })
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
    // Cert signal: the write went through the bridge, tagged platform_internal.
    expect(fake.calls.set.some(c => c.type === 'platform_internal')).toBe(true)
  })

  it('reads the wave back on the next boot (hydrate is no longer a no-op)', async () => {
    const blob = stateBlob({ [WAVE_FIELD]: 37, [BEST_WAVE_FIELD]: 37, [STAGE_FIELD]: 5 })
    const meta = serializeMeta(computeMeta({ get: (k) => (k === STATE_KEY ? blob : null) }))
    installFakeBridge({
      allowAnonymousCloudSave: true,
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
      allowAnonymousCloudSave: true,
      cloudSeed: { [STATE_KEY]: blob },
      parseJsonByDefault: true
    })
    const local = makeLocal()
    const strat = new PlaygamaStrategy()

    await strat.hydrate(local)

    expect(strat.hydrateState).toBe('success-with-data')
    expect(JSON.parse(local.get(STATE_KEY)!)[BEST_WAVE_FIELD]).toBe(88)
  })

  it('calls through the bridge even in local_storage mode (cert detection)', async () => {
    // Rule 3: a "local-only → skip" optimization zeroes the Game Saves check.
    const fake = installFakeBridge({ isAuthorized: false, allowAnonymousCloudSave: false })
    const local = makeLocal()
    const strat = new PlaygamaStrategy()
    await strat.hydrate(local)

    const blob = stateBlob({ [BEST_WAVE_FIELD]: 12 })
    local.set(STATE_KEY, blob)
    strat.onLocalSet(STATE_KEY, blob)
    await vi.advanceTimersByTimeAsync(1000)
    await strat.flush()

    expect(fake.calls.set.length).toBeGreaterThan(0)
    expect(fake.local.get(STATE_KEY)).toBe(blob)
  })
})

describe('PlaygamaStrategy — defaults must never clobber a real cloud save', () => {
  it('keeps the higher-progress cloud save when local looks fresh', async () => {
    const cloudBlob = stateBlob({ [BEST_WAVE_FIELD]: 120, [STAGE_FIELD]: 14 })
    const cloudMeta = serializeMeta(
      computeMeta({ get: (k) => (k === STATE_KEY ? cloudBlob : null) })
    )
    installFakeBridge({
      allowAnonymousCloudSave: true,
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
    const fake = installFakeBridge({ allowAnonymousCloudSave: true, failGet: true })
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
      allowAnonymousCloudSave: true,
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
    const fake = installFakeBridge({ allowAnonymousCloudSave: true })
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
    const fake = installFakeBridge({ allowAnonymousCloudSave: true })
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
