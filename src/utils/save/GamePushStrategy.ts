// ─── GamePush SaveStrategy (player fields + sync, local fallback) ───────────
//
// Mirrors the consolidated state blob + its SaveMeta through two STRING player
// fields (`FIELD_STATE`, `FIELD_META`) and `gp.player.sync()`. GamePush then
// persists them wherever the host portal's "Progress Save Format" says
// (platform cloud, GamePush backend, or local storage), so the same code is
// cloud-saved on Yandex / CrazyGames and local on portals without one.
//
// PREREQUISITE (manual, in the GamePush panel): create the two custom player
// fields below, type String. If they are missing the SDK silently drops
// `player.set`, which this strategy detects (`get` returns undefined) and
// degrades to local-only for the session — progress is never lost, just not
// cross-device. See docs/gamepush-publish.md.
//
// Rules inherited from the bulletproof-save protocol:
//   • Authoritative cloud READ before any write: `gamePushPlugin()` is awaited
//     from main.ts (gp + `player.ready`) before SaveManager.init(). A rejected
//     read is `failed-retrying`, never "empty" — so defaults cannot clobber a
//     real cloud row. Writes queue until a `success-*` state.
//   • Merge by `decideMerge` (progress score, then savedAt) — a stale device
//     cannot overwrite a better save.
//   • Writes are debounced (one sync per window) and flushed on pagehide.

import { ref } from 'vue'
import type {
  FlushOptions,
  HydrateState,
  HydrateNotice,
  HydrateNoticeListener,
  LocalStorageAccessor,
  SaveStrategy
} from './types'
import { isInternalKey } from './types'
import { STATE_KEY } from '@/use/useEpicState'
import {
  META_KEY,
  computeMeta,
  decideMerge,
  parseMeta,
  serializeMeta
} from './SaveMergePolicy'
import { isDebug } from '@/use/useMatch'
import { getGamePush } from '@/utils/gamePushPlugin'

/** Player field keys the panel must define (type String). */
export const FIELD_STATE = 'save_state'
export const FIELD_META = 'save_meta'

const PORTAL_KEYS: ReadonlySet<string> = new Set([STATE_KEY, META_KEY])
const WRITE_DEBOUNCE_MS = 1_500
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000] as const

const TAG = '[gamepush-save]'
const dlog = (...args: unknown[]): void => {
  if (isDebug.value) console.info(...args)
}

const shouldMirror = (key: string): boolean =>
  !isInternalKey(key) && PORTAL_KEYS.has(key)

const asStr = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null

export class GamePushStrategy implements SaveStrategy {
  readonly name = 'gamepush'

  hydrateState: HydrateState = 'pending'
  readonly _state = ref<HydrateState>('pending')

  private noticeListeners = new Set<HydrateNoticeListener>()
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private dirty = new Map<string, string | null>()
  private inFlight: Promise<void> | null = null
  private retriesRun = 0
  /** True when the panel fields / SDK are missing: stay local-only. */
  private localOnly = false

  // ─── Hydrate ────────────────────────────────────────────────────────────

  async hydrate(local: LocalStorageAccessor): Promise<void> {
    if (!getGamePush()) {
      // SDK blocked / unconfigured: local is the only store. Success-empty so
      // SaveManager proceeds; writes stay inert (no player to push to).
      console.warn(`${TAG} hydrate: no gp → local-only`)
      this.localOnly = true
      this.setState('success-empty', { reason: 'no-sdk' })
      return
    }
    this.readAndMerge(local)
  }

  private readAndMerge(local: LocalStorageAccessor): void {
    const gp = getGamePush()
    if (!gp) return
    let remoteState: string | null
    let remoteMetaRaw: string | null
    try {
      const rawState = gp.player.get(FIELD_STATE)
      const rawMeta = gp.player.get(FIELD_META)
      if (rawState === undefined && rawMeta === undefined) {
        console.warn(`${TAG} player fields "${FIELD_STATE}" / "${FIELD_META}" not defined in the panel → local-only`)
        this.localOnly = true
        this.setState('success-empty', { reason: 'fields-missing' })
        return
      }
      remoteState = asStr(rawState)
      remoteMetaRaw = asStr(rawMeta)
    } catch (e) {
      // A throwing read is NOT "no data": never latch success on it.
      console.warn(`${TAG} hydrate: player.get failed`, e)
      this.scheduleRetry(local)
      this.setState('failed-retrying', { reason: 'get-failed' })
      return
    }

    if (remoteState === null && remoteMetaRaw === null) {
      dlog(`${TAG} hydrate: remote empty → success-empty`)
      this.setState('success-empty')
      this.seedFromLocal(local)
      return
    }

    const remoteMeta =
      parseMeta(remoteMetaRaw)
      ?? (remoteState !== null
        ? computeMeta({ get: (k) => (k === STATE_KEY ? remoteState : null) })
        : null)
    const localMeta =
      parseMeta(local.get(META_KEY))
      ?? (local.get(STATE_KEY) ? computeMeta({ get: (k) => local.get(k) }) : null)

    const resolution = decideMerge(localMeta, remoteMeta)
    if (resolution.kind === 'remote-wins' || resolution.kind === 'remote-only') {
      if (remoteState !== null) local.set(STATE_KEY, remoteState)
      if (remoteMeta) local.set(META_KEY, serializeMeta(remoteMeta))
      dlog(`${TAG} hydrate: ${resolution.kind} — mirrored cloud → local`)
      this.setState('success-with-data')
      return
    }
    dlog(`${TAG} hydrate: ${resolution.kind} — keeping local, queued for push`)
    this.setState(remoteState !== null ? 'success-with-data' : 'success-empty')
    this.seedFromLocal(local)
  }

  private seedFromLocal(local: LocalStorageAccessor): void {
    const state = local.get(STATE_KEY)
    if (state == null) return
    this.dirty.set(STATE_KEY, state)
    const meta = local.get(META_KEY)
    if (meta != null) this.dirty.set(META_KEY, meta)
    this.scheduleFlush()
  }

  private scheduleRetry(local: LocalStorageAccessor): void {
    const delay = RETRY_DELAYS_MS[this.retriesRun]
    if (delay === undefined) {
      this.setState('failed-final', { reason: 'retries-exhausted' })
      return
    }
    this.retriesRun += 1
    setTimeout(() => this.readAndMerge(local), delay)
  }

  onHydrateNotice(listener: HydrateNoticeListener): () => void {
    this.noticeListeners.add(listener)
    return () => this.noticeListeners.delete(listener)
  }

  // ─── Writes ─────────────────────────────────────────────────────────────

  onLocalSet(key: string, value: string): void {
    if (!shouldMirror(key) || this.localOnly) return
    this.dirty.set(key, value)
    // Never push before an observed `success-*` hydrate (queue only).
    if (!this.isHydrated()) return
    this.scheduleFlush()
  }

  onLocalRemove(key: string): void {
    if (!shouldMirror(key) || this.localOnly) return
    this.dirty.set(key, null)
    if (!this.isHydrated()) return
    this.scheduleFlush()
  }

  async flush(_options?: FlushOptions): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (!this.isHydrated()) return
    await this.drain()
  }

  dispose(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    this.dirty.clear()
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private isHydrated(): boolean {
    return this.hydrateState === 'success-with-data' || this.hydrateState === 'success-empty'
  }

  private setState(state: HydrateState, extra: Partial<HydrateNotice> = {}): void {
    this.hydrateState = state
    this._state.value = state
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

  private async drain(): Promise<void> {
    if (this.dirty.size === 0 || this.localOnly) return
    if (this.inFlight) {
      await this.inFlight
      if (this.dirty.size === 0) return
    }
    const gp = getGamePush()
    if (!gp) return

    const batch = new Map(this.dirty)
    this.dirty.clear()

    this.inFlight = (async () => {
      try {
        if (batch.has(STATE_KEY)) gp.player.set(FIELD_STATE, batch.get(STATE_KEY) ?? '')
        if (batch.has(META_KEY)) gp.player.set(FIELD_META, batch.get(META_KEY) ?? '')
        await gp.player.sync()
        dlog(`${TAG} sync ok`)
      } catch (e) {
        console.warn(`${TAG} sync failed — re-queuing`, e)
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
