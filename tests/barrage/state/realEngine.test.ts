import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarrageEngine } from '@/barrage/engine/engine'

/**
 * The state layer on the REAL engine (no fake): a brand-new player's FTUE
 * board, real turns played to 'aim' with `settle()`, the wallet fed by real
 * kills, and the saved run restored into an identical board after a reload.
 */

vi.mock('@/use/useReward', () => {
  const api = () => ({ buffsCostCoins: false, REWARD_COIN_COST: 1000, canRedeem: () => true, redeem: async () => true })
  return { REWARD_COIN_COST: 1000, useReward: api, default: api }
})
vi.mock('@/use/useAds', async () => {
  const { ref } = await import('vue')
  return {
    adProviderName: 'mock',
    isInterstitialReady: ref(false),
    isRewardedReady: ref(true),
    showMidgameAd: async () => {},
    showRewardedAd: async () => true,
    default: () => ({})
  }
})
vi.mock('@/use/useCrazyWaveGameplay', () => ({ stopGameplayForWaveBreak: () => {}, resumeGameplayAfterWaveBreak: () => {} }))
vi.mock('@/platforms/leaderboard', () => ({ submitBestRow: () => {}, submitBestWave: () => {} }))

const STATE_KEY = 'umbrella_state'

const boot = async () => {
  // A case that boots twice must not leave the first graph's play clock ticking.
  ;(await import('@/barrage/state/playClock')).__resetPlayClockForTests()
  vi.resetModules()
  const b = (await import('@/barrage/state/useBarrage')).default()
  const state = await import('@/use/useEpicState')
  const progress = await import('@/barrage/state/progress')
  const wallet = (await import('@/use/useEpicConfig')).default()
  const real = (): BarrageEngine => b.engine.value as BarrageEngine
  const turn = (angle = Math.PI / 2): void => {
    expect(b.fire(angle)).toBe(true)
    real().settle()
  }
  return { b, state, progress, wallet, real, turn }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  // The play clock's interval must not outlive the case: its throttled persist
  // would write this case's blob over the next case's seed.
  (await import('@/barrage/state/playClock')).__resetPlayClockForTests()
  ;(await import('@/use/useEpicState')).flushPersist()
})

describe('useBarrage on the real engine', () => {
  it('plays the FTUE board, feeds the wallet and the stats, and snapshots every aim', async () => {
    const h = await boot()
    expect(h.real().state.config.ftue).toBe(true)
    expect(h.b.row.value).toBe(1)
    expect(h.b.phase.value).toBe('aim')

    h.turn()
    expect(h.b.phase.value).toBe('aim')
    expect(h.b.row.value).toBe(2)
    expect(h.progress.stats.value.volleys).toBe(1)
    // Straight up from the middle hits the FTUE slime in column 3.
    expect(h.progress.stats.value.kills).toBeGreaterThanOrEqual(1)
    expect(h.wallet.coins.value).toBeGreaterThan(0)

    h.state.flushPersist()
    const blob = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as { umb_run?: { snap: { row: number } } }
    expect(blob.umb_run?.snap.row).toBe(2)
  })

  it('a reload resumes the exact board', async () => {
    const first = await boot()
    first.turn()
    first.turn(Math.PI / 3)
    first.turn(Math.PI * 0.6)
    const s = first.real().state
    const want = {
      row: s.row,
      tray: [...s.tray],
      monsters: s.monsters.map((m) => [m.kind, m.col, m.row, m.hp]),
      launcherX: s.launcherX
    }
    first.state.flushPersist()

    const second = await boot()
    const r = second.real().state
    expect({
      row: r.row,
      tray: [...r.tray],
      monsters: r.monsters.map((m) => [m.kind, m.col, m.row, m.hp]),
      launcherX: r.launcherX
    }).toEqual(want)
    expect(second.b.row.value).toBe(want.row)
  })

  it('a first-session restart keeps the saved tray on the real FTUE row-1 board', async () => {
    const { defaultConfig } = await import('@/barrage/engine/economy')
    const snap = {
      v: 1, config: defaultConfig({ ftue: true }), row: 7, nextBossRow: 10, monsters: [], pickups: [], hazards: [],
      tray: [3, 2, 2], launcherX: 3.5, shields: 0, revives: 0, warcryArmed: false, chestTimer: 60, turn: 6,
      rng: 11, nextId: 50
    }
    localStorage.setItem(STATE_KEY, JSON.stringify({ umb_run: { v: 1, stamp: 'earlier', snap, breached: true } }))
    const h = await boot()
    const s = h.real().state
    expect(s.row).toBe(1)
    expect([...s.tray]).toEqual([3, 2, 2])
    expect(s.config.ftue).toBe(true)
    expect(s.monsters.length).toBeGreaterThan(0)
    h.turn()
    expect(h.b.phase.value).toBe('aim')
  })

  it('a restored run continues deterministically — same angles, same board as the uninterrupted run', async () => {
    const first = await boot()
    first.turn()
    first.state.flushPersist()
    const saved = localStorage.getItem(STATE_KEY)
    first.turn(Math.PI / 3)
    const uninterrupted = first.real().state.monsters.map((m) => [m.id, m.col, m.row, m.hp])

    localStorage.setItem(STATE_KEY, saved!)
    const second = await boot()
    second.turn(Math.PI / 3)
    expect(second.real().state.monsters.map((m) => [m.id, m.col, m.row, m.hp])).toEqual(uninterrupted)
  })
})
