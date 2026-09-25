import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { makeFactory, type FakeEngine } from './fakeEngine'

/**
 * The run owner, driven by a scripted engine: every flow the state layer is
 * responsible for — tray / merge / discovery, breach → Meteor / revive /
 * checkpoint restart, the restart interstitial cadence, the boss chest's
 * ad-before-result order, the daily board's isolation from the endless run,
 * and the save round-trip including the cloud hydrate that must beat a fresh
 * default run.
 */

// Shared controls for the mocked ad layer, filled in by the mock factories. The
// mocked modules are NOT re-created by `vi.resetModules()` (the mock registry
// survives it), so `beforeEach` resets their state and call history.
const ctl = vi.hoisted(() => ({
  rewardReady: null as unknown as { value: boolean },
  interstitialReady: null as unknown as { value: boolean },
  coinMode: false,
  adGrants: true,
  order: [] as string[],
  redeem: null as unknown as ReturnType<typeof vi.fn>,
  showMidgameAd: null as unknown as ReturnType<typeof vi.fn>,
  stopGameplay: null as unknown as ReturnType<typeof vi.fn>,
  resumeGameplay: null as unknown as ReturnType<typeof vi.fn>,
  submitBestRow: null as unknown as ReturnType<typeof vi.fn>,
  engineGenAtAd: -1,
  engineGen: null as unknown as { value: number }
}))

vi.mock('@/use/useReward', async () => {
  const { ref } = await import('vue')
  ctl.rewardReady = ref(true)
  ctl.redeem = vi.fn(async () => {
    ctl.order.push('rewarded')
    return ctl.rewardReady.value && ctl.adGrants
  })
  const api = () => ({
    buffsCostCoins: ctl.coinMode,
    REWARD_COIN_COST: 1000,
    canRedeem: () => ctl.rewardReady.value,
    redeem: ctl.redeem
  })
  return { REWARD_COIN_COST: 1000, useReward: api, default: api }
})

vi.mock('@/use/useAds', async () => {
  const { ref } = await import('vue')
  ctl.interstitialReady = ref(true)
  ctl.showMidgameAd = vi.fn(async () => {
    ctl.order.push('interstitial')
    ctl.engineGenAtAd = ctl.engineGen?.value ?? -1
  })
  return {
    adProviderName: 'mock',
    isInterstitialReady: ctl.interstitialReady,
    isRewardedReady: ref(true),
    showMidgameAd: ctl.showMidgameAd,
    showRewardedAd: vi.fn(async () => true),
    default: () => ({})
  }
})

vi.mock('@/use/useCrazyWaveGameplay', () => {
  ctl.stopGameplay = vi.fn()
  ctl.resumeGameplay = vi.fn()
  return { stopGameplayForWaveBreak: ctl.stopGameplay, resumeGameplayAfterWaveBreak: ctl.resumeGameplay }
})

vi.mock('@/platforms/leaderboard', () => {
  ctl.submitBestRow = vi.fn()
  return { submitBestRow: ctl.submitBestRow, submitBestWave: ctl.submitBestRow }
})

const STATE_KEY = 'elemental-barrage_state'
const T0 = new Date('2026-09-23T10:00:00').getTime()

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

/** Fresh module graph over an optional pre-seeded save blob. */
const boot = async (blob?: Record<string, unknown>) => {
  vi.resetModules()
  ctl.order.length = 0
  ctl.engineGenAtAd = -1
  if (blob) localStorage.setItem(STATE_KEY, JSON.stringify(blob))
  const fx = makeFactory()
  const mod = await import('@/barrage/state/useBarrage')
  mod.__setEngineFactory(fx.factory)
  const b = mod.default()
  ctl.engineGen = b.engineGen
  const state = await import('@/use/useEpicState')
  const progress = await import('@/barrage/state/progress')
  const save = await import('@/use/useSaveStatus')
  const wallet = (await import('@/use/useEpicConfig')).default()
  const reveal = await import('@/use/useTierReveal')
  const eng = (): FakeEngine => b.engine.value as FakeEngine
  /** Simulate a cloud hydrate: the blob in localStorage is replaced, then the
   *  save layer reloads it and bumps the version (what `useSaveStatus` does). */
  const hydrate = async (patch: Record<string, unknown>): Promise<void> => {
    state.flushPersist()
    const cur = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Record<string, unknown>
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...cur, ...patch }))
    state.reloadEpicState()
    save.saveDataVersion.value++
    await flush()
  }
  const blobNow = (): Record<string, unknown> => {
    state.flushPersist()
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as Record<string, unknown>
  }
  return { b, mod, fx, eng, state, progress, save, wallet, reveal, hydrate, blobNow }
}

/** One full turn on the current engine. */
const turn = (e: FakeEngine, hits = 5): void => {
  e.fire(Math.PI / 2)
  e.endTurn(hits)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  // The mocked modules outlive `vi.resetModules()` — reset their state and
  // call history so every case starts from a clean ad layer.
  vi.clearAllMocks()
  ctl.coinMode = false
  ctl.adGrants = true
  if (ctl.rewardReady) ctl.rewardReady.value = true
  if (ctl.interstitialReady) ctl.interstitialReady.value = true
})

afterEach(async () => {
  // Cancel this case's debounced blob write before the next case installs a
  // fresh store — a late write would overwrite the next case's seed.
  (await import('@/use/useEpicState')).flushPersist()
  vi.useRealTimers()
})

describe('boot', () => {
  it('starts a brand-new player on the FTUE board at row 1', async () => {
    const { b, fx } = await boot()
    expect(fx.made).toHaveLength(1)
    expect(fx.made[0]!.kind).toBe('create')
    expect(fx.made[0]!.config.ftue).toBe(true)
    expect(fx.made[0]!.config.mode).toBe('endless')
    expect(b.row.value).toBe(1)
    expect(b.mode.value).toBe('endless')
  })

  it('a player past the first boss starts at the checkpoint with the checkpoint tray, no FTUE', async () => {
    const { fx } = await boot({
      eb_checkpoint: { row: 20, tray: [3, 2, 2] },
      eb_ftue: { done: true, firstMerge: true, freeCapacity: true }
    })
    const m = fx.made[0]!
    expect(m.kind).toBe('createAtRow')
    expect(m.row).toBe(21)
    expect(m.tray).toEqual([3, 2, 2])
    expect(m.config.ftue).toBe(false)
  })

  it('resumes the saved run (and applies upgrades bought after its snapshot)', async () => {
    const first = await boot()
    turn(first.eng())
    turn(first.eng())
    expect(first.b.row.value).toBe(3)
    const blob = first.blobNow()
    const run = blob.eb_run as { snap: { row: number } }
    expect(run.snap.row).toBe(3)

    localStorage.setItem(STATE_KEY, JSON.stringify({ ...blob, eb_upgrades: { damage: 2, capacity: 1, speed: 0, luck: 0, bounty: 0 } }))
    const second = await boot()
    const m = second.fx.made[0]!
    expect(m.kind).toBe('restore')
    expect(second.b.row.value).toBe(3)
    // Capacity level 1 → 3 balls, pushed onto the resumed run.
    expect(second.eng().state.config.trayCapacity).toBe(3)
    expect(second.eng().state.config.damageMult).toBeCloseTo(1.5625)
  })

  it('a run that ended in an uncontinued breach restarts at the checkpoint instead of rewinding a turn', async () => {
    const first = await boot({ eb_checkpoint: { row: 10, tray: [2, 1] }, eb_ftue: { done: true } })
    turn(first.eng())
    first.eng().fire(1)
    first.eng().breachNow()
    expect(first.b.breach.value).not.toBeNull()
    const blob = first.blobNow()
    expect((blob.eb_run as { breached?: boolean }).breached).toBe(true)

    const second = await boot()
    expect(second.fx.made[0]!.kind).toBe('createAtRow')
    expect(second.fx.made[0]!.row).toBe(11)
  })
})

describe('tray, merges and discoveries', () => {
  it('a never-seen tier from a merge raises the watermark and announces the reveal on its tray slot', async () => {
    const { b, eng, progress, reveal } = await boot()
    const e = eng()
    e.state.tray = [3, 1, 1]
    progress.noteBallTier(3)
    e.emit({ type: 'trayAdd', tier: 1 })
    e.merge(1) // → [3, 2]: tier 2 is below the watermark — no reveal
    await flush()
    expect(reveal.activeReveal.value).toBeNull()

    e.state.tray = [3, 3]
    e.merge(3) // → [4]: a first
    await flush()
    expect(b.maxBallTier.value).toBe(4)
    expect(reveal.activeReveal.value).toMatchObject({ tier: 4, target: { kind: 'grid', idx: 0 } })
    expect(progress.stats.value.merges).toBe(2)
    expect(b.tray.value).toEqual([4])
  })

  it('the first merge arms the free "Tray Capacity 3" exactly once', async () => {
    const { eng } = await boot()
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    expect(up.freeCapacityOffer.value).toBe(false)
    eng().state.tray = [1, 1]
    eng().merge(1)
    expect(up.freeCapacityOffer.value).toBe(true)
    up.claimFreeCapacity()
    expect(up.freeCapacityOffer.value).toBe(false)
    expect(up.list.value.find((v) => v.id === 'capacity')!.level).toBe(1)
    // Applied live to the endless run.
    expect(eng().state.config.trayCapacity).toBe(3)
  })

  it('a pickup counts once, whether collected by a ball or auto-collected at the floor', async () => {
    const { eng, progress } = await boot()
    const before = progress.stats.value.pickups
    eng().emit({ type: 'pickup', pickupId: 1, kind: 'ball', x: 1, y: 1 })
    // ENGINE's optional `auto` flag (a "+1" that reached the floor / FTUE auto-collect).
    eng().emit({ type: 'pickup', pickupId: 2, kind: 'ball', x: 1, y: 10, auto: true } as never)
    expect(progress.stats.value.pickups - before).toBe(2)
  })

  it('coins events feed the wallet, but never the boss bounty (the chest pays that)', async () => {
    const { eng, wallet } = await boot()
    const before = wallet.coins.value
    eng().emit({ type: 'coins', amount: 7, x: 0, y: 0, source: 'kill' })
    eng().emit({ type: 'coins', amount: 5, x: 0, y: 0, source: 'pickup' })
    eng().emit({ type: 'coins', amount: 999, x: 0, y: 0, source: 'boss' })
    expect(wallet.coins.value - before).toBe(12)
  })
})

describe('breach flow', () => {
  const breachAt = async (b: Awaited<ReturnType<typeof boot>>) => {
    b.eng().fire(1)
    b.eng().breachNow()
    await flush()
  }

  it('offers the Meteor continue once per checkpoint segment, ad first', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    await breachAt(h)
    expect(h.b.breach.value).toMatchObject({ meteorAvailable: true, isDaily: false, checkpointRow: 10 })
    expect(h.b.holdSim.value).toBe(true)
    expect(ctl.stopGameplay).toHaveBeenCalledTimes(1)

    expect(await h.b.continueWithMeteor()).toBe(true)
    expect(ctl.order).toEqual(['rewarded'])
    expect(h.eng().calls.continued).toEqual(['meteor'])
    expect(h.b.breach.value).toBeNull()
    expect(h.b.holdSim.value).toBe(false)
    expect(ctl.resumeGameplay).toHaveBeenCalled()

    // Same segment: the second breach has no Meteor left.
    await breachAt(h)
    expect(h.b.breach.value!.meteorAvailable).toBe(false)
    expect(await h.b.continueWithMeteor()).toBe(false)
  })

  it('run 7: a live breach holds its death screen for the death sequence; a new board ends it at once', async () => {
    const { DEATH_SCENE_MS } = await import('@/barrage/render/death')
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    expect(h.b.deathScene.value).toBe(false)
    vi.useFakeTimers()
    try {
      h.eng().fire(1)
      h.eng().breachNow()
      // The offer exists (the sim is held) — its screen waits for the sequence.
      expect(h.b.breach.value).not.toBeNull()
      expect(h.b.holdSim.value).toBe(true)
      expect(h.b.deathScene.value).toBe(true)
      vi.advanceTimersByTime(DEATH_SCENE_MS - 1)
      expect(h.b.deathScene.value).toBe(true)
      vi.advanceTimersByTime(1)
      expect(h.b.deathScene.value).toBe(false)
      expect(h.b.breach.value).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
    await h.b.continueWithMeteor()
    h.eng().fire(1)
    h.eng().breachNow()
    expect(h.b.deathScene.value).toBe(true)
    await h.b.restartFromCheckpoint()
    expect(h.b.deathScene.value).toBe(false)
  })

  it('the one-shot survives a reload (it is saved, not session state)', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    await breachAt(h)
    await h.b.continueWithMeteor()
    const blob = h.blobNow()
    const again = await boot()
    expect(again.progress.segment.value.meteor).toBe(true)
    expect(blob.eb_segment).toMatchObject({ meteor: true })
    await breachAt(again)
    expect(again.b.breach.value!.meteorAvailable).toBe(false)
  })

  it('a boss kill starts a new segment — the Meteor is back', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    await breachAt(h)
    await h.b.continueWithMeteor()
    const e = h.eng()
    e.fire(1)
    e.spawnBoss()
    e.killBoss(100)
    e.endTurn()
    await h.b.claimBossChest(false)
    await breachAt(h)
    expect(h.b.breach.value!.meteorAvailable).toBe(true)
  })

  it('hides the Meteor when no rewarded ad can run (readiness gating), live', async () => {
    const h = await boot()
    ctl.rewardReady.value = false
    await breachAt(h)
    expect(h.b.breach.value!.meteorAvailable).toBe(false)
    ctl.rewardReady.value = true
    expect(h.b.breach.value!.meteorAvailable).toBe(true)
  })

  it('a declined / failed ad does not continue the run', async () => {
    const h = await boot()
    await breachAt(h)
    ctl.adGrants = false
    expect(await h.b.continueWithMeteor()).toBe(false)
    expect(h.eng().calls.continued).toEqual([])
    expect(h.b.breach.value).not.toBeNull()
  })

  it('revive spends a charge', async () => {
    const h = await boot()
    h.eng().state.revives = 1
    await breachAt(h)
    expect(h.b.breach.value!.reviveAvailable).toBe(true)
    expect(h.b.continueWithRevive()).toBe(true)
    expect(h.eng().state.revives).toBe(0)
    expect(h.b.breach.value).toBeNull()
  })

  it('before the first boss, a restart keeps the tray built so far on a fresh row-1 board (FTUE still on)', async () => {
    const h = await boot()
    const e = h.eng()
    e.fire(1)
    e.state.tray = [3, 2, 2, 1]
    e.endTurn() // the aim snapshot now holds the built tray
    e.fire(1)
    e.state.tray = [3, 3, 2, 2, 1] // picked up mid-volley, never saved at an aim
    e.breachNow()
    await h.b.restartFromCheckpoint()
    const m = h.fx.made[h.fx.made.length - 1]!
    expect(m.kind).toBe('createAtRow')
    expect(m.row).toBe(1)
    expect(m.tray).toEqual([3, 2, 2, 1])
    expect(m.config.ftue).toBe(true)
    expect(h.b.row.value).toBe(1)
    expect(h.b.tray.value).toEqual([3, 2, 2, 1])
    expect(h.b.checkpointRow.value).toBe(0)

    // A reload after an uncontinued breach lands on the same board.
    h.eng().fire(1)
    h.eng().breachNow()
    h.blobNow()
    const again = await boot()
    const r = again.fx.made[0]!
    expect(r.kind).toBe('createAtRow')
    expect(r.row).toBe(1)
    expect(r.tray).toEqual([3, 2, 2, 1])
  })

  it('a brand-new player with a single ball still gets the plain FTUE start', async () => {
    const h = await boot()
    h.eng().fire(1)
    h.eng().breachNow()
    await h.b.restartFromCheckpoint()
    expect(h.fx.made[h.fx.made.length - 1]!.kind).toBe('create')
  })

  it('restart rebuilds a fresh board at checkpoint + 1 with the checkpoint tray, keeping every coin', async () => {
    const h = await boot({ eb_checkpoint: { row: 30, tray: [5, 4, 4, 1] }, eb_ftue: { done: true }, epic_coins: 1234 })
    turn(h.eng())
    await breachAt(h)
    const gen = h.b.engineGen.value
    await h.b.restartFromCheckpoint()
    const m = h.fx.made[h.fx.made.length - 1]!
    expect(m.kind).toBe('createAtRow')
    expect(m.row).toBe(31)
    expect(m.tray).toEqual([5, 4, 4, 1])
    expect(h.b.engineGen.value).toBe(gen + 1)
    expect(h.b.breach.value).toBeNull()
    expect(h.wallet.coins.value).toBe(1234)
    // A restart is a new segment.
    expect(h.progress.segment.value.meteor).toBe(false)
    expect(ctl.resumeGameplay).toHaveBeenCalled()
  })
})

// Playtest run 4: a tester restarted at the checkpoint with 2 balls instead of
// 3 (the tray at the boss kill) and read it as lost progress right under "Keep
// all your coins". CONTRACT §6: the STRONGER of the two trays.
describe('checkpoint restart keeps the stronger tray', () => {
  const breachWith = async (h: Awaited<ReturnType<typeof boot>>, tray: number[]) => {
    const e = h.eng()
    e.fire(1)
    e.state.tray = [...tray]
    e.breachNow()
    await flush()
  }

  it('the tray at the breach, when it is stronger than the checkpoint tray (run 4: [3,2] vs [4,2,2])', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [3, 2] }, eb_ftue: { done: true }, epic_coins: 234 })
    turn(h.eng())
    await breachWith(h, [4, 2, 2])
    await h.b.restartFromCheckpoint()
    const m = h.fx.made[h.fx.made.length - 1]!
    expect(m.kind).toBe('createAtRow')
    expect(m.row).toBe(11)
    expect(m.tray).toEqual([4, 2, 2])
    expect(m.config.ftue).toBe(false)
    expect(h.b.tray.value).toEqual([4, 2, 2])
    expect(h.wallet.coins.value).toBe(234)
  })

  it('the checkpoint tray, when the breach left a weaker one (balls spilled or a wrong turn)', async () => {
    const h = await boot({ eb_checkpoint: { row: 20, tray: [5, 4, 4, 1] }, eb_ftue: { done: true } })
    turn(h.eng())
    await breachWith(h, [5, 4, 2, 2, 2, 1])
    await h.b.restartFromCheckpoint()
    expect(h.fx.made[h.fx.made.length - 1]!.tray).toEqual([5, 4, 4, 1])
  })

  it('weighs power, not ball count: one higher tier beats two of the tier below', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2, 2, 1] }, eb_ftue: { done: true } })
    turn(h.eng())
    await breachWith(h, [3, 1])
    await h.b.restartFromCheckpoint()
    // 2.2² + 1 = 5.84 > 2.2 + 2.2 + 1 = 5.4
    expect(h.fx.made[h.fx.made.length - 1]!.tray).toEqual([3, 1])
  })

  it('a reload after the uncontinued breach restarts with the same tray (saved with the breach)', async () => {
    const first = await boot({ eb_checkpoint: { row: 10, tray: [3, 2] }, eb_ftue: { done: true } })
    turn(first.eng())
    first.eng().state.tray = [3, 3, 2] // the last aim's tray
    turn(first.eng())
    await breachWith(first, [4, 2, 2]) // a merge in the breaching volley
    const blob = first.blobNow()
    expect(blob.eb_run).toMatchObject({ breached: true, breachTray: [4, 2, 2] })

    const second = await boot()
    const m = second.fx.made[0]!
    expect(m.kind).toBe('createAtRow')
    expect(m.row).toBe(11)
    expect(m.tray).toEqual([4, 2, 2])
  })

  it('a breached save from before the field weighs its last-aim tray', async () => {
    const first = await boot({ eb_checkpoint: { row: 10, tray: [3, 2] }, eb_ftue: { done: true } })
    turn(first.eng())
    first.eng().state.tray = [3, 3, 2]
    turn(first.eng())
    await breachWith(first, [3, 3, 2])
    const blob = first.blobNow()
    const run = { ...(blob.eb_run as Record<string, unknown>) }
    delete run.breachTray
    localStorage.setItem(STATE_KEY, JSON.stringify({ ...blob, eb_run: run }))
    const second = await boot()
    expect(second.fx.made[0]!.tray).toEqual([3, 3, 2])
  })

  it('a fresh start at the checkpoint (no breach behind it) takes the checkpoint tray', async () => {
    const h = await boot({ eb_checkpoint: { row: 30, tray: [5, 4] }, eb_ftue: { done: true } })
    expect(h.fx.made[0]).toMatchObject({ kind: 'createAtRow', row: 31, tray: [5, 4] })
  })
})

// Adaptive difficulty: meeting the boss that just beat you at full HP again
// relieves nothing for a player who did not upgrade well enough.
describe('boss mercy — every restart lost to the boss takes 25% off it, down to 50%', () => {
  const CP = { eb_checkpoint: { row: 20, tray: [3, 2] }, eb_ftue: { done: true } }

  /** Breach this turn with the boss on the board (it arrived an earlier row). */
  const loseToBoss = async (h: Awaited<ReturnType<typeof boot>>) => {
    const e = h.eng()
    e.state.row = 30
    e.spawnBoss(500)
    turn(e)
    e.fire(1)
    e.breachNow()
    await flush()
  }

  const loseToWalkers = async (h: Awaited<ReturnType<typeof boot>>) => {
    turn(h.eng())
    h.eng().fire(1)
    h.eng().breachNow()
    await flush()
  }

  it('full HP until the first death, then 75%, then 50% — and never below', async () => {
    const h = await boot(CP)
    expect(h.eng().state.config.bossHpMult).toBe(1)
    const seen: (number | undefined)[] = []
    for (let i = 0; i < 3; i++) {
      await loseToBoss(h)
      await h.b.restartFromCheckpoint()
      seen.push(h.fx.made.at(-1)!.config.bossHpMult)
    }
    expect(seen).toEqual([0.75, 0.5, 0.5])
    expect(h.progress.checkpoint.value).toMatchObject({ row: 20, deaths: 3 })
  })

  it('a breach before the boss ever showed up is not a death to it', async () => {
    const h = await boot(CP)
    await loseToWalkers(h)
    await h.b.restartFromCheckpoint()
    expect(h.fx.made.at(-1)!.config.bossHpMult).toBe(1)
    expect(h.progress.checkpoint.value.deaths).toBe(0)
  })

  it('a boss that only arrived with the breaching row does not count either', async () => {
    const h = await boot(CP)
    const e = h.eng()
    e.fire(1)
    e.state.row = 30
    e.spawnBoss(500)
    e.state.monsters.at(-1)!.spawnRow = 30
    e.breachNow()
    await flush()
    await h.b.restartFromCheckpoint()
    expect(h.fx.made.at(-1)!.config.bossHpMult).toBe(1)
  })

  it('a continue is not a death — only the restart that follows counts, once', async () => {
    const h = await boot(CP)
    await loseToBoss(h)
    expect(await h.b.continueWithMeteor()).toBe(true)
    expect(h.progress.checkpoint.value.deaths).toBe(0)
    turn(h.eng())
    h.eng().fire(1)
    h.eng().breachNow()
    await flush()
    await h.b.restartFromCheckpoint()
    expect(h.fx.made.at(-1)!.config.bossHpMult).toBe(0.75)
  })

  it('killing the boss brings the next one back at full HP', async () => {
    const h = await boot(CP)
    await loseToBoss(h)
    await h.b.restartFromCheckpoint()
    const e = h.eng()
    expect(e.state.config.bossHpMult).toBe(0.75)
    e.state.row = 30
    e.fire(1)
    e.spawnBoss(375)
    e.killBoss(100)
    expect(h.progress.checkpoint.value).toMatchObject({ row: 30, deaths: 0 })
    expect(e.state.config.bossHpMult).toBe(1)
    expect(e.calls.setConfig).toContainEqual({ bossHpMult: 1 })
    // …and the retry cap goes with it.
    expect(e.state.config.bossHpCap).toBe(0)
  })

  it('a retry never meets a stronger boss than the one that won (run 9: 224 → 348 HP)', async () => {
    const h = await boot(CP)
    // The boss that won had 500 HP at full (it spawned at 75% after one death: 375).
    await loseToBoss(h)
    await h.b.restartFromCheckpoint()
    expect(h.progress.checkpoint.value).toMatchObject({ deaths: 1, bossHp: 500 })
    expect(h.fx.made.at(-1)!.config.bossHpCap).toBe(500)
    // A second loss to a mercy-softened meeting (375 shown = 500 full) keeps the cap;
    // a weaker full HP would lower it.
    const e = h.eng()
    e.state.row = 30
    const id = e.spawnBoss(375)
    e.state.monsters.find((m) => m.id === id)!.mercy = 0.75
    turn(e)
    e.fire(1)
    e.breachNow()
    await flush()
    await h.b.restartFromCheckpoint()
    expect(h.progress.checkpoint.value).toMatchObject({ deaths: 2, bossHp: 500 })
    expect(h.fx.made.at(-1)!.config.bossHpCap).toBe(500)
  })

  it('a reload after the lost boss fight counts it exactly once', async () => {
    const first = await boot(CP)
    await loseToBoss(first)
    first.blobNow()

    const second = await boot()
    expect(second.fx.made[0]).toMatchObject({ kind: 'createAtRow', row: 21 })
    expect(second.fx.made[0]!.config.bossHpMult).toBe(0.75)
    expect(second.blobNow().eb_checkpoint).toMatchObject({ row: 20, deaths: 1 })

    // The rebuilt run was saved: reloading again resumes it, no second death.
    turn(second.eng())
    second.blobNow()
    const third = await boot()
    expect(third.fx.made[0]!.kind).toBe('restore')
    expect(third.eng().state.config.bossHpMult).toBe(0.75)
    expect(third.progress.checkpoint.value.deaths).toBe(1)
  })

  it('a save from before the count boots at full HP', async () => {
    const h = await boot(CP)
    expect(h.progress.checkpoint.value.deaths).toBe(0)
    expect(h.fx.made[0]!.config.bossHpMult).toBe(1)
  })

  it('a hydrate at the same checkpoint keeps the higher count; a deeper checkpoint brings its own', async () => {
    const h = await boot(CP)
    await h.hydrate({ eb_checkpoint: { row: 20, tray: [3, 2], deaths: 2 } })
    expect(h.progress.checkpoint.value.deaths).toBe(2)
    expect(h.eng().state.config.bossHpMult).toBe(0.5)
    await h.hydrate({ eb_checkpoint: { row: 20, tray: [3, 2], deaths: 1 } })
    expect(h.progress.checkpoint.value.deaths).toBe(2)
    await h.hydrate({ eb_checkpoint: { row: 30, tray: [4, 2], deaths: 0 } })
    expect(h.progress.checkpoint.value).toMatchObject({ row: 30, deaths: 0 })
  })

  it('never reaches the Daily Barrage board', async () => {
    const h = await boot(CP)
    await loseToBoss(h)
    await h.b.restartFromCheckpoint()
    h.b.startDaily()
    expect(h.fx.made.at(-1)!.config.mode).toBe('daily')
    expect(h.fx.made.at(-1)!.config.bossHpMult).toBeUndefined()
  })
})

describe('checkpoint-restart interstitial cadence', () => {
  it('never the first two restarts, then ≥ 3 min apart, always BEFORE the new board', async () => {
    const h = await boot()
    const restart = async (): Promise<boolean> => {
      ctl.order.length = 0
      await h.b.restartFromCheckpoint()
      return ctl.order.includes('interstitial')
    }
    vi.setSystemTime(T0 + 10 * 60_000)
    expect(await restart()).toBe(false) // 1st
    expect(await restart()).toBe(false) // 2nd
    const genBefore = h.b.engineGen.value
    expect(await restart()).toBe(true) // 3rd — due
    // The ad ran while the OLD board was still up: the new engine came after.
    expect(ctl.engineGenAtAd).toBe(genBefore)
    expect(h.b.engineGen.value).toBe(genBefore + 1)

    vi.setSystemTime(T0 + 12 * 60_000) // only 2 min later
    expect(await restart()).toBe(false)
    vi.setSystemTime(T0 + 13 * 60_000 + 1) // 3 min after the last ad
    expect(await restart()).toBe(true)
  })

  it('the first eligible restart still waits 3 min from session start (the portal load ad)', async () => {
    const h = await boot()
    await h.b.restartFromCheckpoint()
    await h.b.restartFromCheckpoint()
    vi.setSystemTime(T0 + 60_000)
    ctl.order.length = 0
    await h.b.restartFromCheckpoint()
    expect(ctl.order).not.toContain('interstitial')
  })

  it('an unfillable interstitial is skipped without charging the cadence', async () => {
    const h = await boot()
    vi.setSystemTime(T0 + 10 * 60_000)
    await h.b.restartFromCheckpoint()
    await h.b.restartFromCheckpoint()
    ctl.interstitialReady.value = false
    await h.b.restartFromCheckpoint()
    expect(ctl.showMidgameAd).not.toHaveBeenCalled()
    ctl.interstitialReady.value = true
    await h.b.restartFromCheckpoint()
    expect(ctl.showMidgameAd).toHaveBeenCalledTimes(1)
  })

  it('an interstitial that never settles cannot wedge the restart (capped)', async () => {
    const h = await boot()
    vi.setSystemTime(T0 + 10 * 60_000)
    await h.b.restartFromCheckpoint()
    await h.b.restartFromCheckpoint()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(T0 + 10 * 60_000)
    ctl.showMidgameAd.mockImplementationOnce(() => new Promise<void>(() => {}))
    const gen = h.b.engineGen.value
    const done = h.b.restartFromCheckpoint()
    await flush()
    expect(h.b.holdSim.value).toBe(true)
    const { AD_AWAIT_CAP_MS } = h.mod
    await vi.advanceTimersByTimeAsync(AD_AWAIT_CAP_MS)
    await done
    expect(h.b.engineGen.value).toBe(gen + 1)
    expect(h.b.holdSim.value).toBe(false)
  })

  it('the pure cadence rule', async () => {
    const { restartAdDue, RESTART_AD_MIN_GAP_MS } = await import('@/barrage/state/useBarrage')
    expect(restartAdDue(1, 1e9, 0, true)).toBe(false)
    expect(restartAdDue(2, 1e9, 0, true)).toBe(false)
    expect(restartAdDue(3, 1e9, 0, true)).toBe(true)
    expect(restartAdDue(3, RESTART_AD_MIN_GAP_MS - 1, 0, true)).toBe(false)
    expect(restartAdDue(3, 1e9, 0, false)).toBe(false)
  })
})

describe('boss chest', () => {
  const killBoss = (h: Awaited<ReturnType<typeof boot>>, bounty: number) => {
    const e = h.eng()
    e.fire(1)
    e.spawnBoss()
    e.killBoss(bounty)
  }

  it('sets the checkpoint at the kill, and presents the chest once the volley settles', async () => {
    const h = await boot()
    h.eng().state.tray = [3, 2]
    h.eng().state.row = 10
    killBoss(h, 250)
    expect(h.b.checkpointRow.value).toBe(10)
    expect(h.progress.checkpoint.value.tray).toEqual([3, 2])
    expect(h.progress.ftue.value.done).toBe(true)
    // Balls still in flight: no modal over the kill yet.
    expect(h.b.bossChest.value).toBeNull()
    h.eng().endTurn()
    expect(h.b.bossChest.value).toMatchObject({ bounty: 250, first: true, boostAvailable: true, boostMult: 3 })
    expect(h.b.holdSim.value).toBe(true)
  })

  it('declining pays 1× immediately — the bounty already carries the Coin Bounty multiplier', async () => {
    const h = await boot()
    h.eng().state.config.coinMult = 2
    killBoss(h, 300)
    h.eng().endTurn()
    const before = h.wallet.coins.value
    expect(await h.b.claimBossChest(false)).toBe(300)
    expect(h.wallet.coins.value - before).toBe(300)
    expect(ctl.redeem).not.toHaveBeenCalled()
    expect(h.b.bossChest.value).toBeNull()
  })

  it('3×: the rewarded ad runs FIRST, then the tripled payout', async () => {
    const h = await boot()
    killBoss(h, 300)
    h.eng().endTurn()
    const before = h.wallet.coins.value
    let paidWhenAdRan = -1
    ctl.redeem.mockImplementationOnce(async () => {
      paidWhenAdRan = h.wallet.coins.value - before
      return true
    })
    expect(await h.b.claimBossChest(true)).toBe(900)
    expect(paidWhenAdRan).toBe(0)
    expect(h.wallet.coins.value - before).toBe(900)
  })

  it('an ad that does not complete still pays 1×', async () => {
    const h = await boot()
    killBoss(h, 300)
    h.eng().endTurn()
    ctl.adGrants = false
    expect(await h.b.claimBossChest(true)).toBe(300)
  })

  it('coin-priced builds only offer the 3× when the extra bounty is worth more than its price', async () => {
    ctl.coinMode = true
    const h = await boot()
    killBoss(h, 400) // +800 < 1000
    h.eng().endTurn()
    expect(h.b.bossChest.value!.boostAvailable).toBe(false)
    await h.b.claimBossChest(false)
    killBoss(h, 600) // +1200 > 1000 (at 2× this one was not worth it)
    h.eng().endTurn()
    expect(h.b.bossChest.value!.boostAvailable).toBe(true)
  })

  it('a breach in the boss-kill turn still presents the chest', async () => {
    const h = await boot()
    killBoss(h, 100)
    h.eng().breachNow()
    expect(h.b.bossChest.value).not.toBeNull()
    expect(h.b.breach.value).not.toBeNull()
  })
})

describe('run 9: the culprit', () => {
  it('the breach offer names the monster past the line nearest the unit — the death sequence\'s striker', async () => {
    const h = await boot({ eb_ftue: { done: true } })
    const e = h.eng()
    e.spawnBoss(300)
    const boss = e.state.monsters.at(-1)!
    boss.row = 9
    e.fire(1)
    e.breachNow()
    await flush()
    expect(h.b.breach.value?.culprit).toEqual({ kind: 'boss', bossKind: 'slime-tower' })
  })

  it('no monster past the line: no culprit (the plain sentence)', async () => {
    const h = await boot()
    h.eng().fire(1)
    h.eng().breachNow()
    await flush()
    expect(h.b.breach.value?.culprit).toBeUndefined()
  })
})

describe('rewarded +5 balls', () => {
  it('never before the first boss kill, never on a calm board (Poki: every first tap opened a Rewarded Break)', async () => {
    const h = await boot()
    // A fresh player: no boss killed yet — not even with a boss on the board.
    expect(h.b.bonusBallsAvailable.value).toBe(false)
    h.eng().spawnBoss(80)
    await flush()
    expect(h.b.bonusBallsAvailable.value).toBe(false)
    // A veteran on a calm board: nothing to rescue.
    const v = await boot({ eb_ftue: { done: true } })
    expect(v.b.bonusBallsAvailable.value).toBe(false)
    v.eng().spawnBoss(80)
    await flush()
    expect(v.b.bonusBallsAvailable.value).toBe(true)
  })

  it('once per checkpoint segment, aim phase only', async () => {
    const h = await boot({ eb_ftue: { done: true } })
    h.eng().spawnBoss(80)
    await flush()
    expect(h.b.bonusBallsAvailable.value).toBe(true)
    expect(await h.b.claimBonusBalls()).toBe(true)
    expect(h.eng().calls.addBalls).toContainEqual([5, 1])
    expect(h.b.bonusBallsAvailable.value).toBe(false)
    expect(await h.b.claimBonusBalls()).toBe(false)
    await h.b.restartFromCheckpoint()
    h.eng().spawnBoss(80)
    await flush()
    expect(h.b.bonusBallsAvailable.value).toBe(true)
    h.eng().fire(1)
    expect(h.b.bonusBallsAvailable.value).toBe(false)
  })
})

describe('Daily Barrage isolation', () => {
  it('runs the seeded fixed-kit board and gives the endless run back untouched', async () => {
    const { dailySeed, DAILY_CONFIG } = await import('@/barrage/engine/economy')
    const h = await boot({ eb_upgrades: { damage: 9, capacity: 9, speed: 9, luck: 9, bounty: 9 }, eb_ftue: { done: true } })
    turn(h.eng())
    turn(h.eng())
    const endless = h.eng()
    const endlessRow = endless.state.row
    const endlessTray = [...endless.state.tray]
    const best = h.b.bestRow.value

    h.b.startDaily()
    expect(h.b.mode.value).toBe('daily')
    const daily = h.fx.made[h.fx.made.length - 1]!
    expect(daily.kind).toBe('create')
    expect(daily.config.mode).toBe('daily')
    expect(daily.config.seed).toBe(dailySeed('2026-09-23'))
    expect(daily.config.damageMult).toBe(DAILY_CONFIG.damageMult)
    expect(daily.config.trayCapacity).toBe(DAILY_CONFIG.trayCapacity)
    expect(daily.config.ftue).toBe(false)

    // Upgrades bought during the daily never reach its engine.
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    h.wallet.addCoins(1e12)
    up.buy('bounty')
    expect(h.eng().calls.setConfig).toEqual([])

    // Deeper than the endless best — but a daily row is not an endless record.
    for (let i = 0; i < 6; i++) turn(h.eng())
    expect(h.b.bestRow.value).toBe(best)
    h.eng().fire(1)
    h.eng().breachNow()
    expect(h.b.dailyResult.value).toMatchObject({ row: 7, best: 7, newBest: true })
    expect(h.b.breach.value).toBeNull()
    expect(h.b.holdSim.value).toBe(true)
    expect(ctl.stopGameplay).toHaveBeenCalled()

    h.b.exitDaily()
    expect(h.b.mode.value).toBe('endless')
    expect(h.b.dailyResult.value).toBeNull()
    const back = h.fx.made[h.fx.made.length - 1]!
    expect(back.kind).toBe('restore')
    expect(h.b.row.value).toBe(endlessRow)
    expect(h.b.tray.value).toEqual(endlessTray)

    const daily2 = (await import('@/barrage/state/useDailyBarrage')).default()
    expect(daily2.todayBest.value).toBe(7)
    expect(daily2.attemptsToday.value).toBe(1)
    expect(daily2.streak.value).toBe(1)
  })

  it('has no continues and no +5 balls', async () => {
    const h = await boot()
    h.b.startDaily()
    expect(h.b.bonusBallsAvailable.value).toBe(false)
    h.eng().fire(1)
    h.eng().breachNow()
    expect(await h.b.continueWithMeteor()).toBe(false)
  })

  it('cannot start mid-volley or over a pending breach', async () => {
    const h = await boot()
    h.eng().fire(1)
    h.b.startDaily()
    expect(h.b.mode.value).toBe('endless')
    h.eng().breachNow()
    h.b.startDaily()
    expect(h.b.mode.value).toBe('endless')
  })

  it('a ball owed during the daily (battle pass) lands in the endless tray afterwards', async () => {
    const h = await boot()
    h.b.startDaily()
    h.progress.oweBall(4)
    await flush()
    expect(h.eng().calls.addBalls).toEqual([])
    h.b.exitDaily()
    expect(h.eng().calls.addBalls).toContainEqual([1, 4])
    expect(h.progress.pending.value.balls).toEqual([])
  })
})

describe('persistence', () => {
  it('snapshots the run every time the engine settles in aim, with lifetime stats', async () => {
    const h = await boot()
    const e = h.eng()
    e.fire(1)
    e.emit({ type: 'kill', monsterId: 1, kind: 'slime', corrupted: false, x: 0, y: 0, coins: 1, row: 1 })
    e.emit({ type: 'fever' })
    e.endTurn(55)
    const blob = h.blobNow()
    expect((blob.eb_run as { snap: { row: number } }).snap.row).toBe(2)
    expect(blob.eb_best_row).toBe(2)
    expect(blob.eb_stats).toMatchObject({ kills: 1, volleys: 1, hits: 55, bestCombo: 55, fevers: 1, rowsTotal: 1 })
    // Mirrored for the cloud merge policy's progress score.
    expect(blob.epic_stage).toBe(2)
  })

  it('a cloud hydrate carrying another device\'s run overwrites a fresh default run', async () => {
    const h = await boot()
    expect(h.b.row.value).toBe(1)
    const foreign = {
      v: 1,
      stamp: 'other-device-1',
      snap: {
        v: 1, config: { ...h.eng().state.config, ftue: false }, row: 42, nextBossRow: 50, monsters: [], pickups: [],
        hazards: [], tray: [6, 5, 5], launcherX: 3, shields: 1, revives: 0, warcryArmed: false, chestTimer: 50,
        turn: 60, rng: 3, nextId: 9
      }
    }
    await h.hydrate({ eb_run: foreign, eb_best_row: 42, eb_checkpoint: { row: 40, tray: [5, 5] }, eb_ftue: { done: true } })
    expect(h.b.row.value).toBe(42)
    expect(h.b.tray.value).toEqual([6, 5, 5])
    expect(h.b.bestRow.value).toBe(42)
    expect(h.b.checkpointRow.value).toBe(40)
    expect(h.fx.made[h.fx.made.length - 1]!.kind).toBe('restore')
  })

  it('a hydrate under a volley waits for the next aim, then wins', async () => {
    const h = await boot()
    h.eng().fire(1)
    const foreign = {
      v: 1, stamp: 'other-device-2',
      snap: { v: 1, config: { ...h.eng().state.config }, row: 17, nextBossRow: 20, monsters: [], pickups: [], hazards: [],
        tray: [3], launcherX: 3, shields: 0, revives: 0, warcryArmed: false, chestTimer: 50, turn: 20, rng: 3, nextId: 9 }
    }
    await h.hydrate({ eb_run: foreign })
    expect(h.b.row.value).toBe(1) // not under the balls
    h.eng().endTurn()
    expect(h.b.row.value).toBe(17)
  })

  it('a hydrate that hands back one of OUR older snapshots never rewinds the live run', async () => {
    const h = await boot()
    turn(h.eng())
    const stale = h.blobNow().eb_run
    turn(h.eng())
    turn(h.eng())
    expect(h.b.row.value).toBe(4)
    const built = h.fx.made.length
    await h.hydrate({ eb_run: stale })
    expect(h.b.row.value).toBe(4)
    expect(h.fx.made.length).toBe(built)
    // …and the live run is written back over the stale copy.
    expect((h.blobNow().eb_run as { snap: { row: number } }).snap.row).toBe(4)
  })

  it('a hydrate never lowers a watermark or a counter', async () => {
    const h = await boot()
    turn(h.eng())
    turn(h.eng())
    h.progress.persistStats()
    await h.hydrate({ eb_best_row: 1, eb_stats: { kills: 0, volleys: 0, maxBallTier: 1 } })
    expect(h.b.bestRow.value).toBe(3)
    expect(h.progress.stats.value.volleys).toBe(2)
  })
})

describe('singleton lifetime', () => {
  it('outlives the component that first called it (watchers are not scoped to its setup)', async () => {
    vi.resetModules()
    const { effectScope } = await import('vue')
    const fx = makeFactory()
    const mod = await import('@/barrage/state/useBarrage')
    mod.__setEngineFactory(fx.factory)
    // A component's setup scope, then its unmount.
    const scope = effectScope()
    const b = scope.run(() => mod.default())!
    scope.stop()
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    ;(await import('@/use/useEpicConfig')).default().addCoins(1e9)
    expect(up.buy('capacity')).toBe(true)
    expect(b.engine.value.state.config.trayCapacity).toBe(3)
    expect(mod.default()).toBe(b)
  })
})

describe('engine events survive engine swaps', () => {
  it('onEngineEvent keeps listening across a restart', async () => {
    const h = await boot()
    const seen: string[] = []
    h.b.onEngineEvent((e) => { if (e.type === 'fire') seen.push('fire') })
    h.eng().fire(1)
    h.eng().breachNow()
    await h.b.restartFromCheckpoint()
    h.eng().fire(1)
    expect(seen).toEqual(['fire', 'fire'])
  })

  it('an owed skill charge (supply drop) waits out the volley, then lands at the next aim', async () => {
    const h = await boot()
    h.eng().fire(1)
    h.progress.oweSkill('shield')
    await flush()
    expect(h.b.shields.value).toBe(0)
    h.eng().endTurn()
    expect(h.b.shields.value).toBe(1)
    expect(h.eng().state.shields).toBe(1)
    expect(h.progress.pending.value.skills).toEqual([])
    // …and it is part of the saved run.
    expect((h.blobNow().eb_run as { snap: { shields: number } }).snap.shields).toBe(1)
  })

  it('a skill that triggers is mirrored for the toast', async () => {
    const h = await boot()
    h.eng().emit({ type: 'skill', skill: 'meteor', x: 1, y: 1 })
    expect(h.b.lastSkill.value).toBe('meteor')
  })

  it('boss HUD mirrors the live boss', async () => {
    const h = await boot()
    const id = h.eng().spawnBoss(80)
    expect(h.b.boss.value).toMatchObject({ monsterId: id, hp: 80, maxHp: 80, enraged: false })
  })

  it('boss HUD carries the mercy share of a softened boss (the bar’s cracked chunk)', async () => {
    const h = await boot()
    expect(h.b.boss.value).toBeNull()
    const e = h.eng()
    e.spawnBoss(60)
    expect(h.b.boss.value!.mercy).toBeUndefined()
    e.state.monsters.at(-1)!.mercy = 0.75
    e.emit({ type: 'bossEnrage', monsterId: e.state.bossId! })
    expect(h.b.boss.value).toMatchObject({ hp: 60, maxHp: 60, mercy: 0.75 })
  })
})

describe('safety net (config.assist) for players who have not bought upgrades — fades per paid level', () => {
  const buyPaid = async (h: Awaited<ReturnType<typeof boot>>, id: 'damage' | 'speed' | 'bounty' | 'capacity' | 'luck') => {
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    h.wallet.addCoins(1e9)
    expect(up.buy(id)).toBe(true)
  }

  it('a brand-new player starts with it on', async () => {
    const h = await boot()
    expect(h.fx.made[0]!.config.assist).toBe(1)
    expect(h.eng().state.config.assist).toBe(1)
  })

  // Playtest run 3: it used to switch off at the 2nd paid upgrade and monsters
  // jumped ~25% right when the player got stronger. It now fades in small
  // steps (engine `assistForPaidLevels`: 1, 1, 0.75, 0.5, 0.25, 0).
  it('the free Tray Capacity does not count; from the 2nd PAID upgrade it fades a step per level', async () => {
    const h = await boot()
    const up = (await import('@/barrage/state/useBarrageUpgrades')).default()
    h.eng().state.tray = [1, 1]
    h.eng().merge(1)
    up.claimFreeCapacity()
    expect(h.eng().state.config.assist).toBe(1)
    await buyPaid(h, 'damage')
    expect(h.eng().state.config.assist).toBe(1)
    await buyPaid(h, 'speed')
    expect(h.eng().state.config.assist).toBe(0.75)
    expect(h.eng().calls.setConfig.at(-1)).toEqual({ assist: 0.75 })
    await buyPaid(h, 'luck')
    expect(h.eng().state.config.assist).toBe(0.5)
    await buyPaid(h, 'damage')
    expect(h.eng().state.config.assist).toBe(0.25)
    await buyPaid(h, 'speed')
    expect(h.eng().state.config.assist).toBe(0)
    expect(h.eng().calls.setConfig.at(-1)).toEqual({ assist: 0 })
    // …and every later board keeps it (a checkpoint restart).
    await h.b.restartFromCheckpoint()
    expect(h.fx.made.at(-1)!.config.assist).toBe(0)
  })

  it('a capacity level bought with coins (no gift claimed) is a paid one', async () => {
    const h = await boot()
    await buyPaid(h, 'capacity')
    expect(h.eng().state.config.assist).toBe(1)
    await buyPaid(h, 'capacity')
    expect(h.eng().state.config.assist).toBe(0.75)
  })

  it('a save boots with the fade its paid levels earned (its gifted capacity level not counted)', async () => {
    const two = await boot({ eb_upgrades: { damage: 1, capacity: 1, speed: 1, luck: 0, bounty: 0 }, eb_ftue: { done: true, firstMerge: true, freeCapacity: true } })
    expect(two.fx.made[0]!.config.assist).toBe(0.75)
    const one = await boot({ eb_upgrades: { damage: 1, capacity: 1, speed: 0, luck: 0, bounty: 0 }, eb_ftue: { done: true, firstMerge: true, freeCapacity: true } })
    expect(one.fx.made[0]!.config.assist).toBe(1)
    const five = await boot({ eb_upgrades: { damage: 2, capacity: 2, speed: 2, luck: 0, bounty: 0 }, eb_ftue: { done: true, firstMerge: true, freeCapacity: true } })
    expect(five.fx.made[0]!.config.assist).toBe(0)
  })

  it('never reaches the Daily Barrage board', async () => {
    const h = await boot()
    h.b.startDaily()
    expect(h.fx.made.at(-1)!.config.assist ?? 0).toBe(0)
    await buyPaid(h, 'damage')
    await buyPaid(h, 'speed')
    expect(h.eng().calls.setConfig).toEqual([])
  })
})

describe('loss recap (BreachOffer.recap)', () => {
  const breachAt = async (h: Awaited<ReturnType<typeof boot>>) => {
    h.eng().fire(1)
    h.eng().breachNow()
    await flush()
  }
  const kill = (e: FakeEngine, coins: number): void => {
    e.emit({ type: 'kill', monsterId: 1, kind: 'slime', corrupted: false, x: 1, y: 1, coins, row: e.state.row })
    e.emit({ type: 'coins', amount: coins, x: 1, y: 1, source: 'kill' })
  }

  it('counts the run\'s kills and earned coins (never the boss bounty event) up to the breach row', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    const e = h.eng()
    e.fire(1)
    kill(e, 4)
    kill(e, 6)
    e.emit({ type: 'coins', amount: 5, x: 0, y: 0, source: 'pickup' })
    e.emit({ type: 'coins', amount: 999, x: 0, y: 0, source: 'boss' })
    e.endTurn()
    await breachAt(h)
    expect(h.b.breach.value!.recap).toEqual({ row: h.b.breach.value!.row, kills: 2, coins: 15 })
    expect(h.b.breach.value!.recap!.row).toBe(12)
  })

  it('a continue keeps counting; a checkpoint restart starts a new run at zero', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    h.eng().fire(1)
    kill(h.eng(), 3)
    h.eng().breachNow()
    await flush()
    expect(await h.b.continueWithMeteor()).toBe(true)
    h.eng().fire(1)
    kill(h.eng(), 3)
    h.eng().breachNow()
    await flush()
    expect(h.b.breach.value!.recap).toMatchObject({ kills: 2, coins: 6 })

    await h.b.restartFromCheckpoint()
    h.eng().fire(1)
    kill(h.eng(), 8)
    h.eng().breachNow()
    await flush()
    expect(h.b.breach.value!.recap).toEqual({ row: 11, kills: 1, coins: 8 })
  })

  it('boss chests count at what they paid (3× included)', async () => {
    const h = await boot()
    const e = h.eng()
    e.fire(1)
    e.spawnBoss()
    e.killBoss(300)
    e.endTurn()
    expect(await h.b.claimBossChest(true)).toBe(900)
    await breachAt(h)
    expect(h.b.breach.value!.recap).toMatchObject({ kills: 1, coins: 900 })
  })

  it('survives a reload mid-run (saved with the run snapshot)', async () => {
    const first = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    first.eng().fire(1)
    kill(first.eng(), 7)
    first.eng().endTurn()
    expect((first.blobNow().eb_run as { tally?: unknown }).tally).toEqual({ kills: 1, coins: 7 })
    const second = await boot()
    expect(second.fx.made[0]!.kind).toBe('restore')
    await breachAt(second)
    expect(second.b.breach.value!.recap).toMatchObject({ kills: 1, coins: 7 })
  })

  it('a daily run never adds to the endless run\'s recap', async () => {
    const h = await boot({ eb_checkpoint: { row: 10, tray: [2] }, eb_ftue: { done: true } })
    h.eng().fire(1)
    kill(h.eng(), 2)
    h.eng().endTurn()
    h.b.startDaily()
    h.eng().fire(1)
    kill(h.eng(), 50)
    h.eng().endTurn()
    h.b.exitDaily()
    await breachAt(h)
    expect(h.b.breach.value!.recap).toMatchObject({ kills: 1, coins: 2 })
  })
})
