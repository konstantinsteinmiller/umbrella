import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

/**
 * The play clock (retention roadmap T0.2): seconds of ACTIVE gameplay, counted
 * on the gameplay bracket's own inputs (in a run, no menu, no ad, tab visible,
 * no portal pause). It keeps a page-session clock and a persisted lifetime clock
 * with throttled persistence, and it feeds the rewarded gate.
 */

const STATE_KEY = 'elemental-barrage_state'
const T0 = new Date('2026-09-27T10:00:00').getTime()

const seed = (blob: Record<string, unknown>): void => {
  localStorage.setItem(STATE_KEY, JSON.stringify(blob))
}

/** A fresh module graph with the clock installed over a test-owned "in a run" input. */
const load = async () => {
  vi.resetModules()
  const clock = await import('@/barrage/state/playClock')
  const progress = await import('@/barrage/state/progress')
  const pause = await import('@/use/useGamePause')
  const modal = await import('@/use/useModalState')
  const state = await import('@/use/useEpicState')
  const save = await import('@/use/useSaveStatus')
  pause.isVisibilityHidden.value = false
  const inRun = ref(false)
  clock.installPlayClock(() => inRun.value)
  /** The stats field as the save blob holds it (in memory; the disk write is debounced on top). */
  const saved = (): Record<string, unknown> | undefined => state.getState<Record<string, unknown> | undefined>('eb_stats')
  const secs = () => ({ session: clock.sessionPlaySeconds.value, lifetime: progress.lifetimePlaySeconds.value })
  /** What `useSaveStatus` does on a cloud hydrate. */
  const hydrate = async (patch: Record<string, unknown>): Promise<void> => {
    state.flushPersist()
    const cur = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Record<string, unknown>
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...cur, ...patch }))
    state.reloadEpicState()
    save.saveDataVersion.value++
    await nextTick()
  }
  return { clock, progress, pause, modal, state, inRun, saved, secs, hydrate }
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(async () => {
  (await import('@/barrage/state/playClock')).__resetPlayClockForTests()
  ;(await import('@/use/useEpicState')).flushPersist()
  vi.useRealTimers()
})

describe('play clock: what counts', () => {
  it('counts only in a run with no menu, no ad, the tab visible and no portal pause', async () => {
    const h = await load()
    vi.advanceTimersByTime(5_000)
    expect(h.secs()).toEqual({ session: 0, lifetime: 0 })
    expect(h.clock.isPlayClockRunning.value).toBe(false)

    h.inRun.value = true
    expect(h.clock.isPlayClockRunning.value).toBe(true)
    vi.advanceTimersByTime(5_000)
    expect(h.secs()).toEqual({ session: 5, lifetime: 5 })

    h.pause.isAdShowing.value = true
    expect(h.clock.isPlayClockRunning.value).toBe(false)
    vi.advanceTimersByTime(30_000)
    h.pause.isAdShowing.value = false
    expect(h.secs().session).toBe(5)

    h.pause.isVisibilityHidden.value = true
    vi.advanceTimersByTime(30_000)
    h.pause.isVisibilityHidden.value = false
    expect(h.secs().session).toBe(5)

    h.pause.isPlatformPaused.value = true
    vi.advanceTimersByTime(30_000)
    h.pause.isPlatformPaused.value = false
    expect(h.secs().session).toBe(5)

    const closeMenu = h.modal.acquireModalOpen()
    vi.advanceTimersByTime(30_000)
    closeMenu()
    expect(h.secs().session).toBe(5)

    // A breach / boss chest / daily result holds the board.
    h.inRun.value = false
    vi.advanceTimersByTime(30_000)
    expect(h.secs().session).toBe(5)

    h.inRun.value = true
    vi.advanceTimersByTime(2_000)
    expect(h.secs()).toEqual({ session: 7, lifetime: 7 })
  })

  it('the tutorial\'s app-pause does not stop it (the bracket stays open for it too)', async () => {
    const h = await load()
    h.inRun.value = true
    const release = h.pause.acquireAppPause()
    vi.advanceTimersByTime(4_000)
    release()
    expect(h.secs().session).toBe(4)
  })

  it('fragments of a second from separate stretches add up', async () => {
    const h = await load()
    h.inRun.value = true
    vi.advanceTimersByTime(600)
    h.inRun.value = false
    expect(h.secs().session).toBe(0)
    h.inRun.value = true
    vi.advanceTimersByTime(600)
    h.inRun.value = false
    expect(h.secs().session).toBe(1)
  })

  it('an edge out of play folds the time up to it in at once, in the same call stack (before an ad request runs)', async () => {
    const h = await load()
    h.inRun.value = true
    vi.advanceTimersByTime(2_500) // two ticks: 2 s, and 0.5 s not folded in yet
    expect(h.secs().session).toBe(2)
    // `useAds` raises the flag synchronously right before it calls the SDK:
    // the 0.5 s is kept (as a carry), and the ad itself adds nothing.
    h.pause.isAdShowing.value = true
    vi.advanceTimersByTime(30_000)
    h.pause.isAdShowing.value = false
    vi.advanceTimersByTime(600) // 0.6 s more: no tick yet
    // The next edge: 0.5 + 0.6 s makes a whole second, counted before the call returns.
    h.inRun.value = false
    expect(h.secs().session).toBe(3)
  })

  it('a stalled timer or a clock jump adds at most PLAY_CLOCK_MAX_STEP_MS per step, and never runs backwards', async () => {
    const h = await load()
    const cap = h.clock.PLAY_CLOCK_MAX_STEP_MS / 1000
    h.inRun.value = true
    vi.setSystemTime(T0 + 60 * 60_000) // the wall clock jumps an hour
    vi.advanceTimersByTime(1_000)
    expect(h.secs().session).toBe(cap)
    vi.setSystemTime(T0) // …and back
    vi.advanceTimersByTime(1_000)
    expect(h.secs().session).toBe(cap)
    vi.advanceTimersByTime(1_000)
    expect(h.secs().session).toBe(cap + 1)
  })
})

describe('play clock: persistence', () => {
  it('saves the lifetime seconds throttled (every 15 s of play and on the edge out of play), never per second', async () => {
    const h = await load()
    expect(h.clock.PLAY_CLOCK_PERSIST_EVERY_S).toBe(15)
    h.inRun.value = true
    vi.advanceTimersByTime(14_000)
    expect(h.saved()?.playSeconds).toBeUndefined()
    vi.advanceTimersByTime(1_000)
    expect(h.saved()?.playSeconds).toBe(15)
    vi.advanceTimersByTime(5_000)
    expect(h.saved()?.playSeconds).toBe(15)
    expect(h.progress.lifetimePlaySeconds.value).toBe(20)
    h.inRun.value = false
    expect(h.saved()?.playSeconds).toBe(20)
  })

  it('the session clock is never saved; the lifetime clock survives a reload', async () => {
    const h = await load()
    h.inRun.value = true
    vi.advanceTimersByTime(20_000)
    h.inRun.value = false
    h.state.flushPersist()
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!).eb_stats.playSeconds).toBe(20)
    h.clock.__resetPlayClockForTests()
    const again = await load()
    expect(again.secs()).toEqual({ session: 0, lifetime: 20 })
  })

  it('a cloud hydrate only ever raises the lifetime seconds (forward-only, like every stat)', async () => {
    const h = await load()
    h.inRun.value = true
    vi.advanceTimersByTime(30_000)
    await h.hydrate({ eb_stats: { playSeconds: 10 } })
    expect(h.progress.lifetimePlaySeconds.value).toBe(30)
    await h.hydrate({ eb_stats: { playSeconds: 500 } })
    expect(h.progress.lifetimePlaySeconds.value).toBe(500)
    vi.advanceTimersByTime(5_000)
    expect(h.secs()).toEqual({ session: 35, lifetime: 505 })
  })

  it('a save from before the clock is credited 7 s per volley it fired; a recorded value wins', async () => {
    seed({ eb_stats: { volleys: 40, bossKills: 1 } })
    let h = await load()
    expect(h.progress.LEGACY_SECONDS_PER_VOLLEY).toBe(7)
    expect(h.progress.lifetimePlaySeconds.value).toBe(280)
    h.clock.__resetPlayClockForTests()
    seed({ eb_stats: { volleys: 40, bossKills: 1, playSeconds: 12 } })
    h = await load()
    expect(h.progress.lifetimePlaySeconds.value).toBe(12)
    h.clock.__resetPlayClockForTests()
    localStorage.clear()
    h = await load()
    expect(h.progress.lifetimePlaySeconds.value).toBe(0)
  })
})

describe('the rewarded gate: first boss kill AND 3:00 of lifetime play', () => {
  it.each([
    [{ bossKills: 0, playSeconds: 999 }, false],
    [{ bossKills: 1, playSeconds: 179 }, false],
    [{ bossKills: 1, playSeconds: 180 }, true],
    [{ bossKills: 7, playSeconds: 5000 }, true]
  ])('%o → %s', async (stats, open) => {
    seed({ eb_stats: stats })
    const h = await load()
    expect(h.progress.rewardedOffersUnlocked.value).toBe(open)
  })

  it('the constants are the decision: one boss kill, 180 s', async () => {
    const p = await import('@/barrage/state/progress')
    expect(p.REWARDED_MIN_BOSS_KILLS).toBe(1)
    expect(p.REWARDED_MIN_PLAY_SECONDS).toBe(180)
  })

  it('3:00 of active play opens it live for a player past the first boss', async () => {
    seed({ eb_stats: { bossKills: 1, playSeconds: 175 } })
    const h = await load()
    expect(h.progress.rewardedOffersUnlocked.value).toBe(false)
    h.inRun.value = true
    vi.advanceTimersByTime(4_000)
    expect(h.progress.rewardedOffersUnlocked.value).toBe(false)
    vi.advanceTimersByTime(1_000)
    expect(h.progress.rewardedOffersUnlocked.value).toBe(true)
  })
})
