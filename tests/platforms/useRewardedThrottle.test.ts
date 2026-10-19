// Unit tests for the rewarded-ad rolling-window throttle. Verifies the
// MAX_REWARDED-per-AD_WINDOW_MS cap, expiry, persistence, and graceful
// handling of a corrupted localStorage blob. Assertions are written against
// the exported constants, not literals, so retuning the cap or the window
// doesn't turn into a test edit. Module is reloaded per test
// (`vi.resetModules`) so the in-memory `history` ref doesn't leak across cases.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = '__save_internal__rewarded_history'

const importThrottle = async () => {
  vi.resetModules()
  return await import('@/use/useRewardedThrottle')
}

describe('useRewardedThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts un-throttled when no history exists', async () => {
    const mod = await importThrottle()
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('throttles after MAX_REWARDED grants in the window', async () => {
    const mod = await importThrottle()
    for (let i = 0; i < mod.MAX_REWARDED; i++) {
      mod.recordRewardedGranted()
    }
    expect(mod.isRewardedThrottled.value).toBe(true)
  })

  it('does NOT throttle below the cap', async () => {
    const mod = await importThrottle()
    for (let i = 0; i < mod.MAX_REWARDED - 1; i++) {
      mod.recordRewardedGranted()
    }
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('un-throttles once the oldest entry rolls past the window', async () => {
    const mod = await importThrottle()
    const start = Date.now()
    for (let i = 0; i < mod.MAX_REWARDED; i++) {
      mod.recordRewardedGranted(start + i)
    }
    expect(mod.isRewardedThrottled.value).toBe(true)

    // Jump past the window — all five entries are now stale. The prune
    // hook invalidates the computed (which caches because `Date.now()`
    // isn't a reactive dep — see implementation comment).
    vi.setSystemTime(start + mod.AD_WINDOW_MS + 1)
    mod.__pruneRewardedThrottleForTest()
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('sliding window: a late grant still counts after the earlier ones fall off', async () => {
    const mod = await importThrottle()
    const start = Date.now()
    // A full cap's worth of grants spread across the window, so the early
    // cluster expires first while the newest one stays.
    for (let i = 0; i < mod.MAX_REWARDED - 1; i++) {
      mod.recordRewardedGranted(start + i * 1000)
    }
    mod.recordRewardedGranted(start + mod.AD_WINDOW_MS - 1000) // newest, late in window
    expect(mod.isRewardedThrottled.value).toBe(true)

    // Move just past when the early cluster expires — only the late one remains.
    vi.setSystemTime(start + mod.AD_WINDOW_MS + 100)
    mod.__pruneRewardedThrottleForTest()
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('persists history inside the umbrella_state blob under the internal-key field', async () => {
    const mod = await importThrottle()
    mod.recordRewardedGranted(123_456)
    // The blob write is debounced (it rides the single-blob persist debounce),
    // so advance past it before asserting the on-disk contents.
    vi.advanceTimersByTime(300)
    // Single-blob storage: nothing lives at the bare key any more — the
    // history is a sub-field of `umbrella_state`.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    const blob = JSON.parse(window.localStorage.getItem('umbrella_state') || '{}')
    expect(blob[STORAGE_KEY]).toEqual([123_456])
  })

  it('restores history from localStorage on module load', async () => {
    const now = Date.now()
    // Seed two short of the cap so the restored entries are provably counted:
    // two fresh grants then have to tip it over.
    const { MAX_REWARDED } = await import('@/use/useRewardedThrottle')
    const seed = Array.from({ length: MAX_REWARDED - 2 }, (_, i) => now - 1000 + i * 100)
    // Single-blob model: the throttle reads its history as a field of the
    // consolidated blob, so seed it there (not at the bare key).
    window.localStorage.setItem('umbrella_state', JSON.stringify({ [STORAGE_KEY]: seed }))
    const mod = await importThrottle()
    expect(mod.isRewardedThrottled.value).toBe(false)
    mod.recordRewardedGranted()
    mod.recordRewardedGranted()
    expect(mod.isRewardedThrottled.value).toBe(true)
  })

  it('survives malformed JSON in localStorage', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json{')
    const mod = await importThrottle()
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('survives a non-array JSON value in localStorage', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    const mod = await importThrottle()
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('filters non-numeric entries when restoring', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([Date.now(), 'oops', null, Date.now()])
    )
    const mod = await importThrottle()
    // Two valid entries restored; below the cap.
    expect(mod.isRewardedThrottled.value).toBe(false)
  })

  it('resetRewardedThrottle clears in-memory state and storage', async () => {
    const mod = await importThrottle()
    for (let i = 0; i < mod.MAX_REWARDED; i++) mod.recordRewardedGranted()
    expect(mod.isRewardedThrottled.value).toBe(true)
    mod.resetRewardedThrottle()
    expect(mod.isRewardedThrottled.value).toBe(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
