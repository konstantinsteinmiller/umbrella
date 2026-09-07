// ─── Playgama save strategy (authoritative cloud-read) ─────────────────────
//
// Mirrors the consolidated state blob through `bridge.storage`, preferring
// the portal's cloud row (`platform_internal`) and degrading to the bridge's
// `local_storage` adapter when cloud isn't available in the active context.
//
// ## The three rules that make cloud saves actually work on Playgama
//
//   1. **`platform_internal` is gated on `allowAnonymousCloudSave`.**
//      De-minifying the live `v1/stable` bridge's Playgama adapter gives:
//
//        isStorageAvailable(PLATFORM_INTERNAL)
//          = isCloudSaveSupported
//            && (options.storage?.allowAnonymousCloudSave === true
//                || player.isAuthorized)
//
//      Guest players — i.e. most portal traffic AND the QA reviewer's first
//      run — are NOT authorized, so without the config flag every cloud
//      write silently degrades to `local_storage` and no progress ever
//      reaches the remote. The flag is set in the emitted
//      `playgama-bridge-config.json` (see `vite.config.ts`) and passed again
//      inline to `bridge.initialize()` as a fallback for when that file 404s.
//
//   2. **`storage.get` parses JSON by default.** The real signature is
//      `get(key | key[], storageType?, tryParseJson = true)`. Our payload IS
//      a JSON string, so the default would hand back a parsed OBJECT and the
//      `typeof value === 'string'` check would drop it on the floor. We pass
//      `false` explicitly and still re-serialize defensively.
//
//   3. **Never skip the bridge call when storageType === 'local_storage'.**
//      The "Game Saves" certification check watches `bridge.storage.set` as
//      its detection signal. A "local-only → skip" optimization breaks the
//      gate at 0% even when local writes are landing fine.
//
// ## Re-entrancy
//
// The bridge's local adapter calls `window.localStorage.setItem` internally
// during `storage.set`. That hits SaveManager's patched setItem →
// `strategy.onLocalSet` → us → another `storage.set` → ∞. `writeInFlight`
// short-circuits the re-entrant `onLocalSet` for the duration of an
// outbound write. It is NOT replaced by a local-mode skip (see rule 3).
//
// ## Boot ordering
//
// `main.ts` AWAITS `playgamaPlugin()` before constructing the SaveManager,
// so `bridge.initialize()` has resolved by the time `hydrate()` runs and the
// cloud read is authoritative. The bounded wait below is belt-and-braces for
// QA wrappers that serve their own `index.html` and re-inject the SDK late.

import { ref } from 'vue'
import type {
  FlushOptions,
  HydrateNotice,
  HydrateNoticeListener,
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'
import { isInternalKey } from './types'
import { STATE_KEY } from '@/use/useEpicState'
import {
  META_KEY,
  applyBonusCoins,
  computeMeta,
  decideMerge,
  parseMeta,
  serializeMeta
} from './SaveMergePolicy'
import { SAVE_KEYS } from './SaveMergePolicy'
import { isDebug } from '@/use/useMatch'
import {
  getPlaygamaBridge,
  isPlaygamaSdkActive
} from '@/utils/playgamaPlugin'

const TAG = '[playgama-save]'

const dlog = (...args: unknown[]): void => {
  if (isDebug.value) console.info(...args)
}

/** How long `hydrate()` waits for `bridge.storage` to become reachable.
 *  With the awaited plugin init this resolves on the first tick; the budget
 *  only matters in QA wrappers that inject the SDK themselves. */
const BRIDGE_WAIT_MS = 3_000
const BRIDGE_POLL_MS = 50

/** Retry ladder for a failed cloud read. Playgama's storage API sits behind
 *  `api.playgama.com`, so a cold-start network blip is a real failure mode —
 *  and latching local-authoritative on the first miss is exactly how a
 *  returning player's cloud row gets overwritten with fresh defaults. */
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const

/** Debounce for cloud pushes. Playgama's docs ask games to save on
 *  "meaningful state change" rather than continuously; the game's own
 *  `flushSaveNow()` checkpoints fire in bursts during a wave. */
const WRITE_DEBOUNCE_MS = 600
/** Minimum gap between remote pushes for non-immediate (checkpoint)
 *  flushes. `pagehide` / tab-hide use `{ immediate: true }` and bypass it. */
const REMOTE_MIN_GAP_MS = 5_000

/** Storage types the bridge accepts as the storageType argument. */
type StorageType = 'platform_internal' | 'local_storage'

/** Subset of `bridge.storage` we touch — defensively typed so future bridge
 *  versions can add fields without us breaking. Note the third `get` arg:
 *  `tryParseJson`, which DEFAULTS TO TRUE in the real implementation. */
interface BridgeStorage {
  defaultType?: StorageType
  isAvailable?: (type: StorageType) => boolean | Promise<boolean>
  set?: (key: string | string[], value: unknown, type?: StorageType) => unknown
  get?: (
    key: string | string[],
    type?: StorageType,
    tryParseJson?: boolean
  ) => unknown
  delete?: (key: string | string[], type?: StorageType) => unknown
}

/** Only these round-trip to the portal. Debug/cheat toggles, the bridge's own
 *  `bridge_player_guest_id`, and per-component UI scratch stay local — they
 *  must not roam across devices and they bloat the cloud row. */
const PORTAL_KEYS: ReadonlySet<string> = new Set([STATE_KEY, META_KEY])

const shouldMirror = (key: string): boolean =>
  !isInternalKey(key) && PORTAL_KEYS.has(key)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const getBridgeStorage = (): BridgeStorage | null => {
  // Gate on `isPlaygamaSdkActive` first: the bridge's `storage` getter throws
  // `Before using the SDK you must initialize it` when accessed before
  // `initialize()` has resolved.
  if (!isPlaygamaSdkActive.value) return null
  try {
    const storage = getPlaygamaBridge()?.storage
    return (storage as BridgeStorage) ?? null
  } catch {
    // Some bridge versions throw on `storage` access during teardown / ad
    // takeover. Return null and let the dirty queue retry.
    return null
  }
}

/** Wait (bounded) for `bridge.storage` to become reachable. */
const waitForBridgeStorage = async (timeoutMs: number): Promise<BridgeStorage | null> => {
  const start = Date.now()
  for (;;) {
    const storage = getBridgeStorage()
    if (storage) return storage
    if (Date.now() - start >= timeoutMs) return null
    await sleep(BRIDGE_POLL_MS)
  }
}

/**
 * Pick the storage type. `isAvailable` is SYNCHRONOUS in the real bridge
 * (it returns a boolean, not a promise) but we await it anyway so a future
 * async version doesn't silently coerce a Promise to truthy.
 */
const resolveStorageType = async (storage: BridgeStorage): Promise<StorageType> => {
  if (typeof storage.isAvailable !== 'function') {
    return storage.defaultType ?? 'local_storage'
  }
  try {
    const cloud = await Promise.resolve(storage.isAvailable('platform_internal'))
    if (cloud) return 'platform_internal'
  } catch (e) {
    console.warn(`${TAG} isAvailable(platform_internal) threw`, e)
  }
  return 'local_storage'
}

/**
 * Normalise whatever `storage.get` hands back into the string we stored.
 * Even with `tryParseJson = false` some adapters return a pre-parsed object
 * (the cloud row is JSON on the wire), so re-serialize objects rather than
 * dropping them.
 */
const asStoredString = (value: unknown): string | null => {
  if (typeof value === 'string') return value.length > 0 ? value : null
  if (value == null) return null
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  }
  return String(value)
}

export class PlaygamaStrategy implements SaveStrategy {
  readonly name = 'playgama'

  hydrateState: HydrateState = 'pending'

  /** Reactive mirror so the status banner tracks background retries. */
  readonly _state = ref<HydrateState>('pending')

  private noticeListeners = new Set<HydrateNoticeListener>()

  /** Queue of pending writes. Latest value per key wins; `null` = delete. */
  private dirty = new Map<string, string | null>()
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private lastRemotePushAt = 0

  /** Re-entrancy guard — see the file header. */
  private writeInFlight = new Set<string>()

  private storageType: StorageType = 'local_storage'
  private storageTypeResolved = false
  private retriesRun = 0
  /** Held so `retryHydrate` can run without the SaveManager handing it back. */
  private local: LocalStorageAccessor | null = null

  /** Test/QA introspection — which storage type the session settled on. */
  get resolvedStorageType(): StorageType | null {
    return this.storageTypeResolved ? this.storageType : null
  }

  // ─── Hydrate ────────────────────────────────────────────────────────────

  async hydrate(local: LocalStorageAccessor): Promise<void> {
    this.local = local
    const storage = await waitForBridgeStorage(BRIDGE_WAIT_MS)
    if (!storage) {
      // The bridge never came up. Treat local as authoritative for now but
      // stay in a retrying state so (a) SaveManager's boot sanity guard can
      // re-run us, and (b) writes stay queued instead of pushing defaults.
      console.warn(`${TAG} hydrate: bridge.storage unreachable → failed-retrying`)
      this.setState('failed-retrying', { reason: 'bridge-unreachable' })
      return
    }
    await this.readAndMerge(storage, local)
  }

  async retryHydrate(local: LocalStorageAccessor): Promise<HydrateState> {
    this.local = local
    const storage = getBridgeStorage()
    if (!storage) {
      this.setState('failed-retrying', { reason: 'bridge-unreachable' })
      return this.hydrateState
    }
    await this.readAndMerge(storage, local)
    return this.hydrateState
  }

  onHydrateNotice(listener: HydrateNoticeListener): () => void {
    this.noticeListeners.add(listener)
    return () => this.noticeListeners.delete(listener)
  }

  /**
   * Authoritative cloud read + merge. Reads BOTH portal keys in one
   * `get([...])` call, scores remote against local via the shared
   * `SaveMergePolicy`, and applies the winner.
   */
  private async readAndMerge(
    storage: BridgeStorage,
    local: LocalStorageAccessor
  ): Promise<void> {
    await this.ensureStorageType(storage)

    let remoteState: string | null = null
    let remoteMetaRaw: string | null = null
    try {
      if (typeof storage.get !== 'function') {
        this.setState('success-empty', { reason: 'no-get-api' })
        return
      }
      // `tryParseJson = false` — the default TRUE would hand back a parsed
      // object for our JSON payload. See rule 2 in the file header.
      const raw = await Promise.resolve(
        storage.get([STATE_KEY, META_KEY], this.storageType, false)
      )
      const arr = Array.isArray(raw) ? raw : [raw, null]
      remoteState = asStoredString(arr[0])
      remoteMetaRaw = asStoredString(arr[1])
    } catch (e) {
      // A rejected read is NOT "no data". Latching success here is exactly
      // how a transient blip overwrites a real cloud save with defaults.
      console.warn(`${TAG} hydrate: storage.get failed`, e)
      this.scheduleRetry(local)
      this.setState('failed-retrying', { reason: 'get-failed' })
      return
    }

    if (remoteState === null && remoteMetaRaw === null) {
      dlog(`${TAG} hydrate: remote empty (${this.storageType}) → success-empty`)
      this.setState('success-empty')
      // Nothing remote, but local may hold progress that has never been
      // pushed — seed the queue so the first flush uploads it.
      this.seedFromLocal(local)
      return
    }

    // Score both sides. A remote blob with no meta still counts: derive one
    // from its contents so the comparison isn't skewed to local by default.
    const remoteMeta =
      parseMeta(remoteMetaRaw)
      ?? (remoteState !== null ? computeMeta(remoteSnapshot(remoteState)) : null)
    const localMeta =
      parseMeta(local.get(META_KEY))
      ?? (local.get(STATE_KEY) ? computeMeta({ get: (k) => local.get(k) }) : null)

    const resolution = decideMerge(localMeta, remoteMeta)
    let bonusCoinsAwarded = 0

    if (resolution.kind === 'remote-wins' || resolution.kind === 'remote-only') {
      if (remoteState !== null) local.set(STATE_KEY, remoteState)
      if (remoteMeta) local.set(META_KEY, serializeMeta(remoteMeta))

      if (resolution.kind === 'remote-wins' && resolution.bonusCoins > 0) {
        // Repeat-farm guard: only pay the conflict bonus once per distinct
        // cloud `savedAt`, and record it in the meta we write back.
        const alreadyPaid = localMeta?.bonusReceivedFor === remoteMeta?.savedAt
        if (!alreadyPaid && remoteMeta) {
          bonusCoinsAwarded = resolution.bonusCoins
          local.set(SAVE_KEYS.COINS, applyBonusCoins(
            { get: (k) => local.get(k) },
            resolution.bonusCoins
          ))
          local.set(META_KEY, serializeMeta({
            ...remoteMeta,
            bonusReceivedFor: remoteMeta.savedAt
          }))
        }
      }
      dlog(`${TAG} hydrate: ${resolution.kind} — mirrored cloud → local`)
      this.setState('success-with-data', { bonusCoinsAwarded })
      return
    }

    // Local won (or tied). Keep local and make sure it gets pushed up.
    dlog(`${TAG} hydrate: ${resolution.kind} — keeping local, queued for push`)
    this.seedFromLocal(local)
    this.setState(remoteState !== null ? 'success-with-data' : 'success-empty')
  }

  /** Queue the current local snapshot so the next flush uploads it. */
  private seedFromLocal(local: LocalStorageAccessor): void {
    const state = local.get(STATE_KEY)
    if (state == null) return
    this.dirty.set(STATE_KEY, state)
    this.scheduleFlush()
  }

  private scheduleRetry(local: LocalStorageAccessor): void {
    const delay = RETRY_DELAYS_MS[this.retriesRun]
    if (delay === undefined) {
      this.setState('failed-final', { reason: 'retries-exhausted' })
      return
    }
    this.retriesRun += 1
    setTimeout(() => {
      const storage = getBridgeStorage()
      if (!storage) {
        this.scheduleRetry(local)
        return
      }
      void this.readAndMerge(storage, local)
    }, delay)
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  onLocalSet(key: string, value: string): void {
    if (this.writeInFlight.has(key)) return // ← re-entrancy guard
    if (!shouldMirror(key)) return
    this.dirty.set(key, value)
    // The documented rule: never push to remote before a `success-*`
    // hydrate. The value stays queued and drains on the next good read.
    if (!this.isHydrateSettled()) return
    this.scheduleFlush()
  }

  onLocalRemove(key: string): void {
    if (this.writeInFlight.has(key)) return // ← re-entrancy guard
    if (!shouldMirror(key)) return
    this.dirty.set(key, null)
    if (!this.isHydrateSettled()) return
    this.scheduleFlush()
  }

  async flush(opts?: FlushOptions): Promise<void> {
    const immediate = opts?.immediate ?? true
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (!immediate && Date.now() - this.lastRemotePushAt < REMOTE_MIN_GAP_MS) {
      // Inside the rate limit — re-arm the debounce instead of pushing now.
      this.scheduleFlush()
      return
    }
    await this.drain()
  }

  dispose(): void {
    if (this.writeTimer !== null) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    this.dirty.clear()
    this.noticeListeners.clear()
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private isHydrateSettled(): boolean {
    return this.hydrateState === 'success-with-data'
      || this.hydrateState === 'success-empty'
  }

  private setState(state: HydrateState, extra: Partial<HydrateNotice> = {}): void {
    this.hydrateState = state
    this._state.value = state
    // A hydrate that just settled releases anything queued during the wait.
    if (this.isHydrateSettled() && this.dirty.size > 0) this.scheduleFlush()
    const notice: HydrateNotice = { state, ...extra }
    for (const l of this.noticeListeners) {
      try { l(notice) } catch (e) { console.warn(`${TAG} notice listener threw`, e) }
    }
  }

  private scheduleFlush(): void {
    if (this.writeTimer !== null) return
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      void this.drain()
    }, WRITE_DEBOUNCE_MS)
  }

  private async ensureStorageType(storage: BridgeStorage): Promise<void> {
    if (this.storageTypeResolved) return
    this.storageType = await resolveStorageType(storage)
    this.storageTypeResolved = true
    if (this.storageType === 'local_storage') {
      // Loud on purpose: this is the exact state that made the cleared wave
      // never reach the remote. If it shows up on the live portal, the
      // bridge config's `storage.allowAnonymousCloudSave` didn't take.
      console.warn(
        `${TAG} cloud storage NOT available — falling back to 'local_storage'. `
        + 'Progress will not sync to the Playgama remote for this session. '
        + 'Check that playgama-bridge-config.json ships '
        + '{"storage":{"allowAnonymousCloudSave":true}} and that the bridge '
        + 'loaded it (a 404 falls back to the inline initialize() options).'
      )
    } else {
      console.info(`${TAG} cloud storage active — storageType='platform_internal'`)
    }
  }

  /**
   * Push the dirty map to the bridge. Always writes the META blob alongside
   * the state so the next hydrate can score this save — nothing else in the
   * codebase computes meta for Playgama.
   */
  private async drain(): Promise<void> {
    if (this.dirty.size === 0) return
    if (this.inFlight) {
      await this.inFlight
      if (this.dirty.size === 0) return
    }
    const storage = getBridgeStorage()
    if (!storage?.set) {
      // Bridge not up (or went away mid-flight). Keep the queue and re-arm.
      this.scheduleFlush()
      return
    }
    // Bind up-front: the narrowing above doesn't survive into the async IIFE
    // below, and the bridge can swap its storage object during ad takeover.
    const setFn = storage.set.bind(storage)
    const deleteFn = storage.delete?.bind(storage) ?? null
    await this.ensureStorageType(storage)

    // Refresh META from the CURRENT local snapshot so the score/timestamp we
    // publish matches the blob we're publishing.
    if (this.local && this.dirty.get(STATE_KEY) != null) {
      const meta = serializeMeta(computeMeta({ get: (k) => this.local!.get(k) }))
      this.local.set(META_KEY, meta)
      this.dirty.set(META_KEY, meta)
    }

    const batch = new Map(this.dirty)
    this.dirty.clear()

    const writes: Array<[string, string]> = []
    const deletes: string[] = []
    for (const [key, value] of batch) {
      if (value === null) deletes.push(key)
      else writes.push([key, value])
    }

    this.inFlight = (async () => {
      try {
        if (writes.length > 0) {
          const keys = writes.map(([k]) => k)
          const values = writes.map(([, v]) => v)
          for (const k of keys) this.writeInFlight.add(k)
          try {
            await Promise.resolve(setFn(keys, values, this.storageType))
          } finally {
            for (const k of keys) this.writeInFlight.delete(k)
          }
          dlog(`${TAG} set [${keys.join(', ')}] → ${this.storageType}`)
        }
        if (deletes.length > 0 && deleteFn) {
          for (const k of deletes) this.writeInFlight.add(k)
          try {
            await Promise.resolve(deleteFn(deletes, this.storageType))
          } finally {
            for (const k of deletes) this.writeInFlight.delete(k)
          }
        }
        this.lastRemotePushAt = Date.now()
      } catch (e) {
        console.warn(`${TAG} flush failed — re-queuing`, e)
        // Re-queue only entries not already superseded by a newer write.
        for (const [k, v] of batch) {
          if (!this.dirty.has(k)) this.dirty.set(k, v)
        }
        if (this.dirty.size > 0) this.scheduleFlush()
      } finally {
        this.inFlight = null
      }
    })()
    await this.inFlight
  }
}

/** Adapt a raw remote state blob into the `SnapshotReader` `computeMeta`
 *  wants, so a cloud row with no META still gets a real progress score
 *  instead of being treated as absent. */
const remoteSnapshot = (stateBlob: string) => ({
  get: (key: string): string | null => (key === STATE_KEY ? stateBlob : null)
})
