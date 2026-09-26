// The wordless coach (`useCoach.ts`): lessons triggered by the real board,
// demonstrated with shots the engine has actually played on a clone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef, type Ref } from 'vue'
import { createEngine, type BarrageEngine } from '@/barrage/engine/engine'
import { bossBounty, defaultConfig, killCoins } from '@/barrage/engine/economy'
import { COLS, type EngineEvent, type GameMode, type IBarrageEngine, type UpgradeId } from '@/barrage/engine/types'
import type { UpgradeView } from '@/barrage/state/contract'
import { board, mon, pick } from '../engine/helpers'

const STATE_KEY = 'elemental-barrage_state'
const UP = Math.PI / 2

interface BootOpts {
  state?: Record<string, unknown>
  /** Keep the tray-intro / upgrade lessons pending (off by default: they
   *  would pre-empt the lesson a suite is about). */
  freshIntro?: boolean
  /** Raw blob: no coach defaults injected (migration tests). */
  raw?: boolean
  glowing?: UpgradeId | null
  /** The player's best row (past FUNNEL_LAST_ROW the funnel retires). */
  bestRow?: number
  upgradeTotal?: number
  mode?: GameMode
  volleys?: number
  bestCombo?: number
  ftueDone?: boolean
  ftuePressBeat?: boolean
  capacityLevel?: number
  /** Ball Damage as the chips show it (the funnel's trigger). */
  damage?: { affordable: boolean; level?: number }
  freeOffer?: boolean
  /** The chip whose next level is a gift (`freeId`). */
  giftId?: UpgradeId | null
  /** A shot landed moments ago (default): the shot demo is not due. Suites
   *  about other lessons would otherwise see it take every quiet aim. */
  shotRecent?: boolean
  /** The wallet (the rich-wallet funnel; 0 by default: never rich). */
  coins?: number
  /** The five chips as given (instead of `chipViews(damage)`). */
  chips?: UpgradeView[]
  /** No modal / unlock / coin rain (the scene's `funnelCalm`). */
  calm?: Ref<boolean>
  /** A spotlight view is mounted and the stage is calm (the spotlight
   *  lessons may play, at once — no delay). */
  spots?: boolean
}

/** The five chips, Damage as asked (the rest unaffordable). */
const chipViews = (damage: { affordable: boolean; level?: number } = { affordable: false }): UpgradeView[] =>
  (['damage', 'capacity', 'speed', 'luck', 'bounty'] as const).map((id) => ({
    id,
    level: id === 'damage' ? damage.level ?? 0 : 1,
    maxed: false,
    cost: 12,
    affordable: id === 'damage' ? damage.affordable : false,
    glowing: id === 'damage' && damage.affordable,
    value: 1,
    nextValue: 1.25
  }))

const boot = async (engine: BarrageEngine, o: BootOpts = {}) => {
  vi.resetModules()
  window.localStorage.clear()
  const state: Record<string, unknown> = { ...(o.state ?? {}) }
  if (!o.raw && !o.freshIntro) {
    const c = (state.eb_coach as { v: 1; shown?: Record<string, number>; kinds?: Record<string, number> } | undefined)
      ?? { v: 1, shown: {}, kinds: {} }
    const defaults: Record<string, number> = { trayIntro: 2 }
    state.eb_coach = { ...c, shown: { ...defaults, ...(c.shown ?? {}) }, kinds: c.kinds ?? {} }
  }
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const coach = await import('@/use/useCoach')
  const spot = await import('@/components/barrage/lessonSpotlight')
  spot.__resetLessonSpot()
  if (o.spots) spot.registerSpotView()
  if (o.shotRecent ?? true) coach.shotDemoDue.value = false
  const eng = shallowRef<IBarrageEngine>(engine)
  const w = {
    engine: eng,
    engineGen: ref(1),
    mode: ref<GameMode>(o.mode ?? 'endless'),
    onEngineEvent: (cb: Parameters<IBarrageEngine['on']>[0]) => eng.value.on(cb),
    volleys: ref(o.volleys ?? 10),
    bestCombo: ref(o.bestCombo ?? 0),
    ftueDone: ref(o.ftueDone ?? true),
    ftuePressBeat: ref(o.ftuePressBeat ?? false),
    capacityLevel: ref(o.capacityLevel ?? 1),
    glowingUpgrade: ref<UpgradeId | null>(o.glowing ?? null),
    upgradeTotal: ref(o.upgradeTotal ?? 1),
    upgrades: ref<UpgradeView[]>(o.chips ?? chipViews(o.damage)),
    freeOffer: ref(o.freeOffer ?? false),
    giftId: ref<UpgradeId | null>(o.giftId ?? null),
    coins: ref(o.coins ?? 0),
    funnelCalm: o.calm ?? ref(true),
    bestRow: ref(o.bestRow ?? 0),
    schedule: (fn: () => void) => fn(),
    ...(o.spots ? { spotCalm: ref(true), spotDelayMs: 0 } : {})
  }
  const off = coach.installCoach(w)
  return { coach, w, off, spot }
}

/** An engine event the board would emit (boss kill, breach…). */
const emit = (e: BarrageEngine, ev: EngineEvent): void => {
  ;(e as unknown as { emit(x: EngineEvent): void }).emit(ev)
}

/** Play one turn on the live engine (the coach hears every event). */
const play = (e: BarrageEngine, angle: number): void => {
  e.fire(angle)
  e.settle()
}

/** Show the current lesson to the "player" (the overlay's exposure call). */
const see = (coach: typeof import('@/use/useCoach')): void => {
  const l = coach.coachLesson.value
  if (l) coach.noteLessonVisible(l)
}

/** A board where a monster sits one row above the line. */
const dangerBoard = () => {
  const threat = mon('slime', 3, 8, 3)
  const e = board({ monsters: [threat, mon('slime', 0, 1, 1e9)], launcherX: 3.5, tray: [1, 1] })
  return { e, threat }
}

/** A full wall at row 6 with one gap: shots through it rattle behind the wall. */
const gapBoard = () => {
  const wall = [0, 1, 2, 4, 5, 6].map((c) => mon('slime', c, 6, 1e9))
  const top = [1, 5].map((c) => mon('slime', c, 1, 1e9))
  return board({ monsters: [...wall, ...top], launcherX: 3.5, tray: [1, 1, 1, 1], config: { trayCapacity: 4 } })
}

describe('survive lesson', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('in danger it marks the threat and demonstrates a real shot at it', async () => {
    const { e, threat } = dangerBoard()
    const { coach } = await boot(e)
    const l = coach.coachLesson.value
    expect(l?.id).toBe('survive')
    if (l?.id !== 'survive') return
    expect(l.threats).toContain(threat.id)
    expect(l.trial.threatDamage).toBeGreaterThan(0)
    expect(l.trial.breach).toBe(false)
    // …and that shot really does it on the live board.
    const hp = threat.hp
    play(e, l.trial.angle)
    expect(threat.hp < hp || !e.state.monsters.includes(threat)).toBe(true)
  })

  it('prefers the saving skill bubble when the shot takes it', async () => {
    const threat = mon('slime', 0, 8, 1e9)
    const e = board({
      monsters: [threat],
      pickups: [pick('skill', 3, 5, { skill: 'execute' })],
      launcherX: 3.5,
      tray: [1]
    })
    const { coach } = await boot(e)
    const l = coach.coachLesson.value
    expect(l?.id).toBe('survive')
    if (l?.id !== 'survive') return
    expect(l.trial.skills).toContain('execute')
    expect(l.skillAt).toEqual({ x: 3.5, y: 5.5 })
  })

  it('is capped, spaced, off in the daily and off before the FTUE hands over', async () => {
    const a = dangerBoard()
    const daily = await boot(a.e, { mode: 'daily' })
    expect(daily.coach.coachLesson.value).toBeNull()
    daily.off()
    const b = dangerBoard()
    const ftue = await boot(b.e, { ftueDone: false })
    expect(ftue.coach.coachLesson.value).toBeNull()
    ftue.off()
    const c = dangerBoard()
    const capped = await boot(c.e, { state: { eb_coach: { v: 1, shown: { survive: 4 }, kinds: {} } } })
    expect(capped.coach.coachLesson.value).toBeNull()
  })
})

describe('combo lesson', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('finds the shot through the gap and it beats the typical shot by far', async () => {
    const e = gapBoard()
    const { coach } = await boot(e)
    const l = coach.coachLesson.value
    expect(l?.id).toBe('combo')
    if (l?.id !== 'combo') return
    expect(l.trial.hits).toBeGreaterThanOrEqual(10)
    expect(l.trial.hits).toBeGreaterThanOrEqual(2 * Math.max(1, l.baseline))
    expect(l.trial.path.length).toBeGreaterThanOrEqual(6)
    // The demonstrated volley is the real one.
    const h0 = e.stats.hits
    play(e, l.trial.angle)
    expect(e.stats.hits - h0).toBe(l.trial.hits)
  })

  it('retires with a real best combo, and stays out of the daily', async () => {
    const vet = await boot(gapBoard(), { bestCombo: 30 })
    expect(vet.coach.coachLesson.value).toBeNull()
    vet.off()
    const daily = await boot(gapBoard(), { mode: 'daily' })
    expect(daily.coach.coachLesson.value).toBeNull()
  })

  it('keeps LESSON_GAP volleys between two proactive lessons', async () => {
    const e = gapBoard()
    const { coach, w } = await boot(e)
    expect(coach.coachLesson.value?.id).toBe('combo')
    see(coach)
    // Next turn: the board still has the gap, but the coach just spoke.
    w.volleys.value += 1
    play(e, UP)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('a plain board with no standout shot shows nothing', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
    const { coach } = await boot(e)
    expect(coach.coachLesson.value).toBeNull()
  })
})

describe('tray lesson', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('after a "+1" spills into coins, the next aim acts out the full tray', async () => {
    // Tray full of different tiers: the "+1" has no twin and becomes coins.
    const e = board({ pickups: [pick('ball', 3, 5)], launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    const { coach } = await boot(e)
    let spilled = 0
    e.on((x) => { if (x.type === 'trayOverflow') spilled++ })
    play(e, UP)
    expect(spilled).toBe(1)
    expect(coach.coachLesson.value?.id).toBe('tray')
  })

  it('retires once capacity is taken, and never past its cap', async () => {
    const big = board({ pickups: [pick('ball', 3, 5)], launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    const grown = await boot(big, { capacityLevel: 3 })
    play(big, UP)
    expect(grown.coach.coachLesson.value).toBeNull()
    grown.off()
    const e = board({ pickups: [pick('ball', 3, 5)], launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    const capped = await boot(e, { state: { eb_coach: { v: 1, shown: { tray: 3 }, kinds: {} } } })
    play(e, UP)
    expect(capped.coach.coachLesson.value).toBeNull()
  })

  it('spaces its showings: the next spill right after a showing waits TRAY_GAP volleys', async () => {
    const e = board({ launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    // One fresh "+1" in the line of fire per turn: every volley spills one.
    const feed = (): void => {
      e.state.pickups.push(pick('ball', 3, 5))
      ;(e as unknown as { rebuildGrid(): void }).rebuildGrid()
    }
    const { coach, w } = await boot(e)
    feed()
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('tray')
    see(coach)
    w.volleys.value += 1
    feed()
    play(e, UP) // spills again at once — too soon to repeat
    expect(coach.coachLesson.value).toBeNull()
    w.volleys.value += 1
    feed()
    play(e, UP) // …and it speaks again once the gap has passed
    expect(coach.coachLesson.value?.id).toBe('tray')
  })

  it('run 13: waits while a gift sits on another chip (its hand would press Capacity), then speaks', async () => {
    // p2/062–063: the hand pressed Capacity while Damage said FREE; Dev's tap
    // took the Damage gift and he read it as "the hint and the purchase didn't match".
    const e = board({ pickups: [pick('ball', 3, 5)], launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    const { coach, w } = await boot(e, { giftId: 'damage' })
    play(e, UP)
    expect(coach.coachLesson.value).toBeNull()
    // The gift is taken: the spill it held back is acted out at the next aim.
    w.giftId.value = null
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('tray')
  })

  it('the FTUE\'s own Capacity gift does not hold it (the hand points at the gift)', async () => {
    const e = board({ pickups: [pick('ball', 3, 5)], launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    const { coach } = await boot(e, { giftId: 'capacity' })
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('tray')
  })

  it('buying capacity while it shows ends it on the spot', async () => {
    const e = board({ pickups: [pick('ball', 3, 5)], launcherX: 3.5, tray: [3, 2], config: { trayCapacity: 2 } })
    const { coach, w } = await boot(e)
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('tray')
    w.capacityLevel.value = 2
    await nextTick()
    expect(coach.coachLesson.value).toBeNull()
  })
})

describe('shot demo (the finger demo): the 20-second rule', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  const quiet = () => board({ monsters: [mon('slime', 3, 2, 1e9)] })

  it('the rule itself: before the first shot, or 20 s after the last one', async () => {
    const { coach } = await boot(quiet())
    expect(coach.SHOT_QUIET_MS).toBe(20_000)
    expect(coach.shotDemoAllowed(null, 0)).toBe(true)
    expect(coach.shotDemoAllowed(1000, 20_999)).toBe(false)
    expect(coach.shotDemoAllowed(1000, 21_000)).toBe(true)
  })

  it('shows at once on a screen where nothing was shot yet — veterans too', async () => {
    const fresh = await boot(quiet(), { shotRecent: false, volleys: 3 })
    const l = fresh.coach.coachLesson.value
    expect(l?.id === 'pull' && l.reason).toBe('idle')
    fresh.off()
    const vet = await boot(quiet(), { shotRecent: false, volleys: 400 })
    expect(vet.coach.coachLesson.value?.id).toBe('pull')
  })

  it('a shot hides it; 20 s without one (back from AFK) bring it back', async () => {
    vi.useFakeTimers()
    const e = quiet()
    const { coach } = await boot(e, { shotRecent: false, bestCombo: 99 })
    expect(coach.coachLesson.value?.id).toBe('pull')
    play(e, UP)
    expect(coach.shotDemoDue.value).toBe(false)
    expect(coach.coachLesson.value).toBeNull()
    vi.advanceTimersByTime(coach.SHOT_QUIET_MS - 100)
    expect(coach.coachLesson.value).toBeNull()
    vi.advanceTimersByTime(200)
    expect(coach.shotDemoDue.value).toBe(true)
    expect(coach.coachLesson.value?.id).toBe('pull')
  })

  it('every shot restarts the 20 s', async () => {
    vi.useFakeTimers()
    const e = quiet()
    // (combo retired: this board can grow a combo shot, which would take the aim)
    const { coach } = await boot(e, { shotRecent: false, bestCombo: 99 })
    play(e, UP)
    vi.advanceTimersByTime(15_000)
    play(e, UP)
    vi.advanceTimersByTime(15_000) // 30 s after the first shot, 15 s after the second
    expect(coach.coachLesson.value).toBeNull()
    vi.advanceTimersByTime(5_100)
    expect(coach.coachLesson.value?.id).toBe('pull')
  })

  it('stays off while the FTUE still has the hand (its overlay shows its own)', async () => {
    vi.useFakeTimers()
    const { coach } = await boot(quiet(), { shotRecent: false, ftueDone: false, volleys: 0 })
    expect(coach.shotDemoDue.value).toBe(true) // …which the FTUE overlay reads
    vi.advanceTimersByTime(30_000)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('two empty taps on the unit bring it over a tray lesson — not inside 20 s of a shot', async () => {
    const recent = await boot(quiet(), { volleys: 3 })
    recent.coach.noteMisfire()
    recent.coach.noteMisfire()
    expect(recent.coach.coachLesson.value).toBeNull()
    recent.off()
    const idle = await boot(quiet(), { volleys: 3, shotRecent: false, freshIntro: true })
    expect(idle.coach.coachLesson.value?.id).toBe('trayIntro')
    idle.coach.noteMisfire()
    expect(idle.coach.coachLesson.value?.id).toBe('trayIntro')
    idle.coach.noteMisfire()
    const l = idle.coach.coachLesson.value
    expect(l?.id === 'pull' && l.reason).toBe('tap')
  })

  it('firing clears whatever lesson was up', async () => {
    const e = quiet()
    const { coach } = await boot(e, { shotRecent: false })
    expect(coach.coachLesson.value).not.toBeNull()
    e.fire(UP)
    expect(coach.coachLesson.value).toBeNull()
  })
})


describe('early bank shot (first session, turn 2–3)', () => {
  beforeEach(() => { window.localStorage.clear() })

  /** The real first-session board (CONTRACT §7), not a crafted one. */
  const ftueBoard = (seed = 7) => createEngine(defaultConfig({ seed, ftue: true }))

  it('turn 1 belongs to the FTUE hand; turn 2 shows an angled wall shot that really kills two', async () => {
    const e = ftueBoard()
    const { coach } = await boot(e, { ftueDone: false, volleys: 0 })
    expect(coach.coachLesson.value).toBeNull()
    play(e, UP) // turn 1, straight up (what every first-timer does)
    const l = coach.coachLesson.value
    expect(l?.id).toBe('combo')
    if (l?.id !== 'combo') return
    expect(l.bank).toBe(true)
    const off = Math.abs(l.trial.angle - UP)
    expect(off).toBeGreaterThanOrEqual(coach.BANK_MIN_OFF)
    expect(off).toBeLessThanOrEqual(coach.BANK_MAX_OFF)
    // The first leg ends on a SIDE wall — the bank.
    const x = l.trial.path[2]!
    expect(x < 0.5 || x > COLS - 0.5).toBe(true)
    // The demonstrated shot is the real one on the live board.
    const k0 = e.stats.kills
    play(e, l.trial.angle)
    expect(e.stats.kills - k0).toBeGreaterThanOrEqual(coach.BANK_KILLS)
  })

  it('finds one on turn 2 across seeds and first aims', async () => {
    const { isBankShot, bankScore } = await import('@/use/useCoach')
    const { aimFan, pickBest, trialShot } = await import('@/barrage/engine/shotFinder')
    for (const seed of [1, 2, 3, 11, 42, 99]) {
      for (const first of [UP, 1.2, 2.0]) {
        const e = ftueBoard(seed)
        play(e, first)
        const trials = aimFan(37).map((a) => trialShot(e, a))
        const best = trials[pickBest(trials, bankScore)]
        expect(best && isBankShot(best), `seed ${seed} first ${first}`).toBe(true)
      }
    }
  })

  it('a straight-up or a near-flat shot is never the bank shot', async () => {
    const { isBankShot } = await import('@/use/useCoach')
    const base = {
      hits: 6, kills: 3, damage: 6, balls: 0, skills: [], breach: false, threatDamage: 0, threatKills: 0,
      rowsLeftAfter: 6, contacts: [1, 1, 2, 2]
    }
    expect(isBankShot({ ...base, angle: UP, path: [3.5, 11, 3.5, 1] })).toBe(false)
    expect(isBankShot({ ...base, angle: (10 * Math.PI) / 180, path: [3.5, 11, 6.84, 10.4] })).toBe(false)
    expect(isBankShot({ ...base, angle: (45 * Math.PI) / 180, path: [3.5, 11, 6.84, 7.7] })).toBe(true)
    // Angled but into a monster first: no bank.
    expect(isBankShot({ ...base, angle: (45 * Math.PI) / 180, path: [3.5, 11, 5.5, 9] })).toBe(false)
    // A bank that kills one: not the lesson.
    expect(isBankShot({ ...base, kills: 1, angle: (45 * Math.PI) / 180, path: [3.5, 11, 6.84, 7.7] })).toBe(false)
  })

  it('not over the FTUE press beat, not after turn 3, not once a combo lesson was seen', async () => {
    const a = ftueBoard()
    const press = await boot(a, { ftueDone: false, ftuePressBeat: true, volleys: 0 })
    play(a, UP)
    expect(press.coach.coachLesson.value).toBeNull()
    press.off()

    const b = ftueBoard()
    const late = await boot(b, { ftueDone: false, volleys: 0 })
    play(b, UP)
    late.coach.coachLesson.value = null // the player ignored it
    play(b, UP) // turn 3: its last chance (seen or not)
    play(b, UP) // turn 4: never
    expect(late.coach.coachLesson.value).toBeNull()
    late.off()

    const c = ftueBoard()
    const seen = await boot(c, { ftueDone: false, volleys: 0, state: { eb_coach: { v: 1, shown: { combo: 1 }, kinds: {} } } })
    play(c, UP)
    expect(seen.coach.coachLesson.value).toBeNull()
  })

  it('a board that is not the first session never gets it', async () => {
    const e = createEngine(defaultConfig({ seed: 7, ftue: false }))
    const { coach } = await boot(e, { ftueDone: false, volleys: 0 })
    play(e, UP)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('its showing is the combo lesson\'s first', async () => {
    const e = ftueBoard()
    const { coach } = await boot(e, { ftueDone: false, volleys: 0 })
    play(e, UP)
    see(coach)
    expect(coach.lessonShown('combo')).toBe(1)
  })
})

describe('rule badges', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('a new kind is badged for TAG_TURNS aim phases, then retires; slimes never', async () => {
    const e = board({ monsters: [mon('goblin', 0, 0, 1e9), mon('slime', 6, 0, 1e9)], launcherX: 3.5 })
    const { coach } = await boot(e, { ftueDone: false })
    // Install counted aim phase #1.
    for (let i = 1; i < coach.TAG_TURNS; i++) {
      expect(coach.retiredTags.value.has('goblin')).toBe(false)
      play(e, UP)
    }
    expect(coach.retiredTags.value.has('goblin')).toBe(false)
    play(e, UP)
    expect(coach.retiredTags.value.has('goblin')).toBe(true)
    expect(coach.retiredTags.value.has('slime')).toBe(false)
    expect(coach.tagKeyOf({ kind: 'slime', corrupted: false })).toBeNull()
  })

  it('a save from before the coach keeps every monster it already met unbadged', async () => {
    const e = board({ monsters: [mon('goblin', 0, 0, 1e9)] })
    const { coach } = await boot(e, {
      ftueDone: false,
      raw: true,
      state: { eb_ui_monsters_seen: ['slime', 'goblin', 'ogre'], eb_best_row: 25 }
    })
    expect(coach.retiredTags.value.has('goblin')).toBe(true)
    expect(coach.retiredTags.value.has('ogre')).toBe(true)
    expect(coach.retiredTags.value.has('dryad')).toBe(false)
    // Bosses the player has already walked past.
    expect(coach.retiredTags.value.has('boss:slime-tower')).toBe(true)
    expect(coach.retiredTags.value.has('boss:worm')).toBe(true)
    expect(coach.retiredTags.value.has('boss:fire-dragon')).toBe(false)
  })
})

describe('exposure accounting', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('counts a lesson once per showing, however often the overlay re-renders', async () => {
    const { e } = dangerBoard()
    const { coach } = await boot(e)
    expect(coach.coachLesson.value?.id).toBe('survive')
    see(coach)
    see(coach)
    see(coach)
    expect(coach.lessonShown('survive')).toBe(1)
  })
})

describe('tray intro lesson', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('is the first thing after the FTUE hands over, and comes back once, later', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
    const { coach, w } = await boot(e, { freshIntro: true, ftueDone: false })
    expect(coach.coachLesson.value).toBeNull()
    w.ftueDone.value = true
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('trayIntro')
    see(coach)
    // Not again right away… (the gap is counted in lifetime volleys; a few
    // real turns here, so the marching slime never reaches danger)
    w.volleys.value += coach.TRAY_INTRO_GAP - 1
    play(e, UP)
    expect(coach.coachLesson.value?.id).not.toBe('trayIntro')
    // …but once the gap has passed.
    w.volleys.value += 1
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('trayIntro')
    see(coach)
    w.volleys.value += 20
    play(e, UP)
    expect(coach.coachLesson.value?.id).not.toBe('trayIntro')
  })

  it('its first showing ignores the lesson gap: another lesson just before it does not delay it', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
    const { coach, w } = await boot(e, { freshIntro: true, ftueDone: false, volleys: 3, shotRecent: false })
    w.ftueDone.value = true
    coach.noteMisfire() // two taps: a pull hint the player saw this very turn
    coach.noteMisfire()
    expect(coach.coachLesson.value?.id).toBe('pull')
    see(coach)
    w.volleys.value += 1
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('trayIntro')
  })

  it('a veteran save never gets it', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)] })
    const { coach } = await boot(e, { raw: true, state: { eb_best_row: 80 } })
    expect(coach.coachLesson.value?.id).not.toBe('trayIntro')
  })

  it('danger comes first', async () => {
    const threat = mon('slime', 3, 8, 3)
    const e = board({ monsters: [threat], launcherX: 3.5, tray: [1, 1] })
    const { coach } = await boot(e, { freshIntro: true })
    expect(coach.coachLesson.value?.id).toBe('survive')
  })
})

describe('upgrade funnel', () => {
  beforeEach(() => { window.localStorage.clear() })

  const quiet = () => board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
  const bossDown = (e: BarrageEngine): void =>
    emit(e, { type: 'bossDefeated', monsterId: 1, bossKind: 'slime-tower', row: 10, bounty: 100 })

  it('Damage arrows the moment Ball Damage is affordable after the free Tray Capacity', async () => {
    const { coach } = await boot(quiet(), { damage: { affordable: true } })
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'damage', reason: 'damage' })
  })

  it('not while the free chip is still on offer, not before the tray was upgraded, not in the daily', async () => {
    const free = await boot(quiet(), { damage: { affordable: true }, freeOffer: true, capacityLevel: 0 })
    expect(free.coach.upgradeFunnel.value).toBeNull()
    free.off()
    const noClaim = await boot(quiet(), { damage: { affordable: true }, capacityLevel: 0 })
    expect(noClaim.coach.upgradeFunnel.value).toBeNull()
    noClaim.off()
    const daily = await boot(quiet(), { damage: { affordable: true }, mode: 'daily' })
    expect(daily.coach.upgradeFunnel.value).toBeNull()
  })

  it('turning affordable mid-aim shows it at once; buying Damage retires it for good', async () => {
    const e = quiet()
    const { coach, w } = await boot(e, { damage: { affordable: false } })
    expect(coach.upgradeFunnel.value).toBeNull()
    w.upgrades.value = chipViews({ affordable: true })
    await nextTick()
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    // Bought: level 1, the total rises.
    w.upgrades.value = chipViews({ affordable: true, level: 1 })
    w.upgradeTotal.value += 1
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull()
    play(e, UP)
    expect(coach.upgradeFunnel.value).toBeNull()
  })

  it('hides for the volley and is back (a new showing) at the next aim', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: true } })
    const first = coach.upgradeFunnel.value?.seq
    e.fire(UP)
    expect(coach.upgradeFunnel.value).toBeNull()
    e.settle()
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.upgradeFunnel.value?.seq).not.toBe(first)
  })

  it('gives up after ARROW_CAP aim phases on screen', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: true } })
    for (let i = 0; i < coach.ARROW_CAP; i++) {
      const f = coach.upgradeFunnel.value
      expect(f?.target).toBe('damage')
      if (f) {
        coach.noteFunnelVisible(f)
        coach.noteFunnelVisible(f) // one showing, however often the overlay re-renders
      }
      play(e, UP)
    }
    expect(coach.lessonShown('arrows')).toBe(coach.ARROW_CAP)
    expect(coach.upgradeFunnel.value).toBeNull()
  })

  it('run 8: the FREE_DAMAGE_AFTER-th Damage showing without a purchase arms the free first Damage level', async () => {
    const e = quiet()
    const { coach, w } = await boot(e, { damage: { affordable: true } })
    const offer = vi.fn()
    ;(w as unknown as { offerFreeDamage?: () => void }).offerFreeDamage = offer
    for (let i = 0; i < coach.FREE_DAMAGE_AFTER; i++) {
      const f = coach.upgradeFunnel.value
      expect(f?.target).toBe('damage')
      if (f) coach.noteFunnelVisible(f)
      if (i < coach.FREE_DAMAGE_AFTER - 1) expect(offer).not.toHaveBeenCalled()
      play(e, UP)
    }
    expect(offer).toHaveBeenCalled()
  })

  it('a boss kill brings the arrows back on the glowing chip for REARM_AIMS aims', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: false, level: 2 }, glowing: 'speed' })
    expect(coach.upgradeFunnel.value).toBeNull()
    bossDown(e)
    for (let i = 0; i < coach.REARM_AIMS; i++) {
      play(e, UP)
      const f = coach.upgradeFunnel.value
      expect(f).toMatchObject({ target: 'speed', reason: 'boss' })
      if (f) coach.noteFunnelVisible(f)
    }
    play(e, UP)
    expect(coach.upgradeFunnel.value).toBeNull()
  })

  it('a breach does too, and any purchase ends it', async () => {
    const e = quiet()
    const { coach, w } = await boot(e, { damage: { affordable: false, level: 2 }, glowing: 'luck' })
    emit(e, { type: 'breach' })
    play(e, UP)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'luck', reason: 'breach' })
    w.upgradeTotal.value += 1
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull()
  })

  it('with the free chip still on offer, the boss arrows point at it', async () => {
    const e = quiet()
    const { coach } = await boot(e, { freeOffer: true, capacityLevel: 0 })
    bossDown(e)
    play(e, UP)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'capacity', reason: 'boss' })
  })

  it('holds the tray lessons back while it owns the upgrade row', async () => {
    const e = quiet()
    const { coach, w } = await boot(e, { freshIntro: true, damage: { affordable: true } })
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.coachLesson.value?.id).not.toBe('trayIntro')
    w.upgrades.value = chipViews({ affordable: false, level: 1 })
    w.upgradeTotal.value += 1
    await nextTick()
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('trayIntro')
  })

  it('pulses the glowing chip when an aim opens with coins to spend and no purchase for a while', async () => {
    const e = quiet()
    const { coach, w } = await boot(e, { damage: { affordable: false, level: 2 }, glowing: 'speed' })
    expect(coach.chipPulse.value).toBeNull() // aim #1 since (no) purchase
    play(e, UP)
    expect(coach.chipPulse.value?.id).toBe('speed')
    const seq = coach.chipPulse.value?.seq ?? 0
    w.upgradeTotal.value += 1 // bought something: the clock starts over
    await nextTick()
    play(e, UP)
    expect(coach.chipPulse.value?.seq).toBe(seq)
    play(e, UP)
    expect(coach.chipPulse.value?.seq).toBe(seq + 1)
  })

  it('run 6: after a purchase the funnel waits for the next aim (the free claim is its own answer)', async () => {
    // Mia claimed the FREE Tray Capacity and the Damage arrows started that
    // instant — she read them as the reply to her tap and missed her level.
    const e = quiet()
    const { coach, w } = await boot(e, { freeOffer: true, capacityLevel: 0, damage: { affordable: true } })
    expect(coach.upgradeFunnel.value).toBeNull() // the free chip is on offer
    w.freeOffer.value = false
    w.capacityLevel.value = 1
    w.upgradeTotal.value += 1
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull()
    play(e, UP)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'damage', reason: 'damage' })
  })

  it('run 6: a boss ARRIVING with the glowing chip affordable brings the arrows back (gear up)', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: false, level: 2 }, glowing: 'speed' })
    expect(coach.upgradeFunnel.value).toBeNull()
    emit(e, { type: 'bossSpawn', monsterId: 99, bossKind: 'worm', row: 20 })
    play(e, UP)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'speed', reason: 'gear' })
  })

  it('run 6: nothing affordable glows when the boss arrives — no gear-up arrows', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: false, level: 2 }, glowing: null })
    emit(e, { type: 'bossSpawn', monsterId: 99, bossKind: 'worm', row: 20 })
    play(e, UP)
    expect(coach.upgradeFunnel.value).toBeNull()
  })

  it('retires past FUNNEL_LAST_ROW: no arrows, no hand, no pulse (the player knows coins buy power)', async () => {
    expect((await import('@/use/useCoach')).FUNNEL_LAST_ROW).toBe(25)
    // A best row past it: nothing, even with Damage never bought and a boss kill.
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: true }, glowing: 'damage', bestRow: 26 })
    expect(coach.upgradeFunnel.value).toBeNull()
    bossDown(e)
    play(e, UP)
    play(e, UP)
    expect(coach.upgradeFunnel.value).toBeNull()
    expect(coach.chipPulse.value).toBeNull()
    // This run's row past it counts too (a best row not yet saved).
    const deep = board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5, row: 26 })
    const second = await boot(deep, { damage: { affordable: true }, glowing: 'damage', bestRow: 0 })
    expect(second.coach.upgradeFunnel.value).toBeNull()
    // At row 25 it still runs.
    const edge = board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5, row: 25 })
    const third = await boot(edge, { damage: { affordable: true }, glowing: 'damage', bestRow: 25 })
    expect(third.coach.upgradeFunnel.value).toMatchObject({ target: 'damage', reason: 'damage' })
  })

  it('never pulses under the arrows (they already say it louder)', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: true }, glowing: 'damage' })
    play(e, UP)
    play(e, UP)
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.chipPulse.value).toBeNull()
  })
})


describe('run 4: a due funnel owns the ghost hand after 3 volleys', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  const quiet = () => board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })

  it('the shot demo yields to it: no pull, the funnel plays in full (it owns the hand)', async () => {
    const { coach } = await boot(quiet(), { shotRecent: false, damage: { affordable: true }, volleys: 3 })
    expect(coach.FUNNEL_HAND_VOLLEYS).toBe(3)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'damage', reason: 'damage' })
    expect(coach.funnelOwnsHand()).toBe(true)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('before 3 volleys nothing changes: the pull demo keeps the hand, the funnel shows beside it', async () => {
    const { coach } = await boot(quiet(), { shotRecent: false, damage: { affordable: true }, volleys: 2 })
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.funnelOwnsHand()).toBe(false)
    expect(coach.coachLesson.value?.id).toBe('pull')
  })

  it('the combo demo yields too', async () => {
    const plain = await boot(gapBoard())
    expect(plain.coach.coachLesson.value?.id).toBe('combo')
    plain.off()
    const { coach } = await boot(gapBoard(), { damage: { affordable: true } })
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.coachLesson.value).toBeNull()
  })

  it('the survive lesson still wins (danger first)', async () => {
    const { e } = dangerBoard()
    const danger = await boot(e, { shotRecent: false, damage: { affordable: true } })
    expect(danger.coach.coachLesson.value?.id).toBe('survive')
  })

  it('run 7: no lose-rule lesson any more — the loss itself teaches the line (the death sequence)', async () => {
    const brink = board({ monsters: [mon('slime', 1, 9, 3), mon('slime', 4, 3, 1e9)], launcherX: 3.5, tray: [1, 1] })
    const { coach } = await boot(brink, { shotRecent: false })
    expect(coach.coachLesson.value?.id).not.toBe('overrun')
    expect('overrunThreat' in coach).toBe(false)
  })

  it('turning due mid-aim, it takes the hand from the pull demo on screen', async () => {
    const { coach, w } = await boot(quiet(), { shotRecent: false, damage: { affordable: false } })
    expect(coach.coachLesson.value?.id).toBe('pull')
    w.upgrades.value = chipViews({ affordable: true })
    await nextTick()
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.coachLesson.value).toBeNull()
  })

  it('neither the 20-second rule nor two empty taps bring the pull demo over it', async () => {
    vi.useFakeTimers()
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: true }, bestCombo: 99 })
    play(e, UP)
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    vi.advanceTimersByTime(coach.SHOT_QUIET_MS + 100)
    expect(coach.shotDemoDue.value).toBe(true)
    expect(coach.coachLesson.value).toBeNull()
    coach.noteMisfire()
    coach.noteMisfire()
    expect(coach.coachLesson.value).toBeNull()
  })

  it('once it is gone (bought), the next aim is the shot demo\'s again', async () => {
    const e = quiet()
    const { coach, w } = await boot(e, { shotRecent: false, damage: { affordable: true }, bestCombo: 99 })
    expect(coach.coachLesson.value).toBeNull()
    w.upgrades.value = chipViews({ affordable: false, level: 1 })
    w.upgradeTotal.value += 1
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull()
    emit(e, { type: 'phase', phase: 'aim' })
    expect(coach.coachLesson.value?.id).toBe('pull')
  })
})

describe('run 4: the rich-wallet funnel', () => {
  beforeEach(() => { window.localStorage.clear() })

  const quiet = () => board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
  /** Damage already bought (no first-Damage funnel); `glow` glows at `cost`,
   *  the rest cost three times as much. */
  const richChips = (glow: UpgradeId, cost = 12): UpgradeView[] =>
    (['damage', 'capacity', 'speed', 'luck', 'bounty'] as const).map((id) => ({
      id,
      level: 1,
      maxed: false,
      cost: id === glow ? cost : cost * 3,
      affordable: true,
      glowing: id === glow,
      value: 1,
      nextValue: 1.25
    }))
  /** One more aim phase opens on the same board (nothing on it moves). */
  const nextAim = (e: BarrageEngine): void => emit(e, { type: 'phase', phase: 'aim' })
  /** The overlay puts the funnel on screen (its exposure call). */
  const show = (coach: typeof import('@/use/useCoach')): void => {
    const f = coach.upgradeFunnel.value
    if (f) coach.noteFunnelVisible(f)
  }
  const bootRich = (e: BarrageEngine, o: BootOpts = {}) =>
    boot(e, { chips: richChips('capacity'), glowing: 'capacity', coins: 24, ...o })

  it('the rule: ≥ 2× the glowing price, 3 aims without a purchase, 4 aims since the last funnel', async () => {
    const { richWalletDue, RICH_MULT, RICH_IDLE_AIMS, RICH_EVERY_AIMS } = await import('@/use/useCoach')
    expect([RICH_MULT, RICH_IDLE_AIMS, RICH_EVERY_AIMS]).toEqual([2, 3, 4])
    const base = { mode: 'endless' as GameMode, coins: 24, price: 12, aimsSinceBuy: 3, aimsSinceFunnel: 4 }
    expect(richWalletDue(base)).toBe(true)
    expect(richWalletDue({ ...base, coins: 23 })).toBe(false)
    expect(richWalletDue({ ...base, aimsSinceBuy: 2 })).toBe(false)
    expect(richWalletDue({ ...base, aimsSinceFunnel: 3 })).toBe(false)
    expect(richWalletDue({ ...base, price: null })).toBe(false)
    expect(richWalletDue({ ...base, mode: 'daily' })).toBe(false)
  })

  it('the third aim without a purchase brings the whole funnel back on the glowing chip — it has the hand', async () => {
    const e = quiet()
    const { coach } = await bootRich(e, { shotRecent: false })
    expect(coach.upgradeFunnel.value).toBeNull() // aim 1
    expect(coach.coachLesson.value?.id).toBe('pull')
    nextAim(e)
    expect(coach.upgradeFunnel.value).toBeNull() // aim 2
    nextAim(e)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'capacity', reason: 'rich' })
    expect(coach.funnelOwnsHand()).toBe(true)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('shows at most every 4th aim phase, with no lifetime cap', async () => {
    const e = quiet()
    const { coach } = await bootRich(e)
    const on: number[] = []
    for (let aim = 1; aim <= 20; aim++) {
      if (aim > 1) nextAim(e)
      if (coach.upgradeFunnel.value?.reason === 'rich') {
        on.push(aim)
        show(coach)
      }
    }
    expect(on).toEqual([3, 7, 11, 15, 19])
  })

  it('a showing nobody saw (a modal covered the whole aim) comes back at the next aim', async () => {
    const e = quiet()
    const { coach } = await bootRich(e)
    nextAim(e)
    nextAim(e)
    expect(coach.upgradeFunnel.value?.reason).toBe('rich') // never put on screen
    nextAim(e)
    expect(coach.upgradeFunnel.value?.reason).toBe('rich')
  })

  it('never below 2× the price, never in the daily', async () => {
    const e = quiet()
    const poor = await bootRich(e, { coins: 23 })
    for (let i = 0; i < 6; i++) nextAim(e)
    expect(poor.coach.upgradeFunnel.value).toBeNull()
    poor.off()
    const d = quiet()
    const daily = await bootRich(d, { coins: 999, mode: 'daily' })
    for (let i = 0; i < 6; i++) nextAim(d)
    expect(daily.coach.upgradeFunnel.value).toBeNull()
  })

  it('any purchase ends it at once and restarts the 3 idle aims', async () => {
    const e = quiet()
    const { coach, w } = await bootRich(e, { coins: 36 })
    nextAim(e)
    nextAim(e)
    expect(coach.upgradeFunnel.value?.reason).toBe('rich')
    show(coach)
    w.upgradeTotal.value += 1 // bought (anything)
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull()
    const on: number[] = []
    for (let aim = 1; aim <= 8; aim++) {
      nextAim(e)
      if (coach.upgradeFunnel.value?.reason === 'rich') {
        on.push(aim)
        show(coach)
      }
    }
    // Three idle aims again — and the spacing from the last showing.
    expect(on).toEqual([4, 8])
  })

  it('after the Damage arrows gave up (ARROW_CAP), the rich wallet brings the funnel back', async () => {
    const e = quiet()
    const { coach } = await boot(e, {
      damage: { affordable: true },
      glowing: 'damage',
      coins: 24,
      state: { eb_coach: { v: 1, shown: { arrows: 6 }, kinds: {} } }
    })
    expect(coach.upgradeFunnel.value).toBeNull()
    nextAim(e)
    nextAim(e)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'damage', reason: 'rich' })
  })
})

describe('run 4: nothing lands on top of the funnel', () => {
  beforeEach(() => { window.localStorage.clear() })

  const quiet = () => board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
  const nextAim = (e: BarrageEngine): void => emit(e, { type: 'phase', phase: 'aim' })

  it('a coin rain / unlock / modal mid-aim takes it off at once; it waits for the next calm aim phase', async () => {
    const e = quiet()
    const calm = ref(true)
    const { coach } = await boot(e, { damage: { affordable: true }, calm })
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    calm.value = false // a chest claimed: its coins rain into the wallet
    expect(coach.upgradeFunnel.value).toBeNull() // synchronously: never one frame together
    calm.value = true // the rain landed…
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull() // …but this aim phase is over for it
    nextAim(e)
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
  })

  it('an aim that opens under a modal / an unlock has no funnel, not even once it closes', async () => {
    const e = quiet()
    const calm = ref(false)
    const { coach, w } = await boot(e, { damage: { affordable: true }, calm })
    expect(coach.upgradeFunnel.value).toBeNull()
    calm.value = true
    w.upgrades.value = chipViews({ affordable: true }) // the watcher re-evaluates
    await nextTick()
    expect(coach.upgradeFunnel.value).toBeNull()
    nextAim(e)
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
  })

  it('an interrupted rich-wallet showing gives its turn back: it is there again at the next calm aim', async () => {
    const e = quiet()
    const calm = ref(true)
    const chips = (['damage', 'capacity', 'speed', 'luck', 'bounty'] as const).map((id) => ({
      id, level: 1, maxed: false, cost: 12, affordable: true, glowing: id === 'speed', value: 1, nextValue: 1.25
    }))
    const { coach } = await boot(e, { chips, glowing: 'speed', coins: 30, calm })
    nextAim(e)
    nextAim(e)
    const f = coach.upgradeFunnel.value
    expect(f?.reason).toBe('rich')
    if (f) coach.noteFunnelVisible(f)
    calm.value = false
    expect(coach.upgradeFunnel.value).toBeNull()
    calm.value = true
    nextAim(e)
    expect(coach.upgradeFunnel.value).toMatchObject({ target: 'speed', reason: 'rich' })
  })
})

// After playtest run 11: the spotlight lessons (lessonSpotlight.ts) — the
// countdown on the launcher, then speed / luck / bounty, spaced out.
describe('spotlight lessons', () => {
  beforeEach(() => { window.localStorage.clear() })

  /** Chips at level 0 except Damage / Capacity (the ones everybody buys). */
  const chips0 = (): UpgradeView[] =>
    (['damage', 'capacity', 'speed', 'luck', 'bounty'] as const).map((id) => ({
      id, level: id === 'damage' || id === 'capacity' ? 1 : 0, maxed: false, cost: 20, affordable: false,
      glowing: false, value: id === 'luck' ? 0 : 1, nextValue: id === 'luck' ? 0.05 : id === 'bounty' ? 1.2 : 1.12
    }))

  it('threatSpotDraft: the fewest marches, the nearest the unit on a tie, walked to the line', async () => {
    const near = mon('slime', 3, 8, 3)
    const far = mon('slime', 0, 8, 3)
    const safe = mon('slime', 5, 2, 3)
    const e = board({ monsters: [far, near, safe], launcherX: 3.5 })
    const { coach } = await boot(e)
    const d = coach.threatSpotDraft(e.state)
    expect(d).toEqual({ kind: 'threat', monsterId: near.id, plan: [9, 10] })
    // Nothing within DANGER_PIP_MARCHES: no draft.
    expect(coach.threatSpotDraft(board({ monsters: [mon('slime', 3, 1, 3)] }).state)).toBeNull()
  })

  it('the first danger plays the threat spotlight — once — and its rescue shot follows the moment it ends', async () => {
    const { e, threat } = dangerBoard()
    const { coach, spot } = await boot(e, { spots: true })
    expect(spot.lessonSpot.value?.kind).toBe('threat')
    expect(spot.lessonSpot.value?.kind === 'threat' && spot.lessonSpot.value.monsterId).toBe(threat.id)
    expect(coach.lessonShown('threatBox')).toBe(1)
    // Nothing else talks over it.
    expect(coach.coachLesson.value).toBeNull()
    spot.finishSpot()
    const l = coach.coachLesson.value
    expect(l?.id).toBe('survive')
    if (l?.id === 'survive') expect(l.threats).toContain(threat.id)
  })

  it('a profile that has seen it goes straight to the survive lesson', async () => {
    const { e } = dangerBoard()
    const { coach, spot } = await boot(e, { spots: true, state: { eb_coach: { v: 1, shown: { threatBox: 1 }, kinds: {} } } })
    expect(spot.lessonSpot.value).toBeNull()
    expect(coach.coachLesson.value?.id).toBe('survive')
  })

  it('no mounted view (the lab, the clean feed): no spotlight, the survive lesson as ever', async () => {
    const { e } = dangerBoard()
    const { coach, spot } = await boot(e)
    expect(spot.lessonSpot.value).toBeNull()
    expect(coach.coachLesson.value?.id).toBe('survive')
    expect(coach.lessonShown('threatBox')).toBe(0)
  })

  it('speed from row 12, luck from 17, bounty from 22 — each once, only while the chip is unbought', async () => {
    const quiet = (row: number) => board({ monsters: [mon('slime', 3, 2, 30, { spawnRow: row })], row, launcherX: 3.5 })
    // Row 11: nothing yet.
    let r = await boot(quiet(11), { spots: true, chips: chips0() })
    expect(r.spot.lessonSpot.value).toBeNull()
    r.off()
    // Row 12: speed, with the chip's values.
    r = await boot(quiet(12), { spots: true, chips: chips0() })
    expect(r.spot.lessonSpot.value).toMatchObject({ kind: 'speed', value: 1, next: 1.12 })
    expect(r.coach.lessonShown('speedBox')).toBe(1)
    r.spot.finishSpot()
    r.off()
    // Row 22, speed seen, luck bought: bounty — with the demo kill's coins.
    const chips = chips0().map((c) => (c.id === 'luck' ? { ...c, level: 2 } : c))
    const e = quiet(22)
    r = await boot(e, { spots: true, chips, state: { eb_coach: { v: 1, shown: { speedBox: 1 }, kinds: {} } } })
    const b = r.spot.lessonSpot.value
    expect(b?.kind).toBe('bounty')
    if (b?.kind === 'bounty') {
      const base = killCoins(22, 'slime', false)
      expect(b.monsterId).toBe(e.state.monsters[0]!.id)
      expect(b.coinsNow).toBe(Math.max(1, Math.round(base)))
      expect(b.coinsNext).toBe(Math.max(1, Math.round(base * 1.2)))
    }
    r.off()
  })

  it('run 13: not while a gift waits on another chip — it plays once the gift is taken', async () => {
    const e = board({ monsters: [mon('slime', 3, 1, 1e9)], row: 12, nextBossRow: 20, launcherX: 3.5, tray: [1] })
    const r = await boot(e, { spots: true, chips: chips0(), giftId: 'damage' })
    expect(r.spot.lessonSpot.value).toBeNull()
    expect(r.coach.lessonShown('speedBox')).toBe(0)
    r.w.giftId.value = null
    play(e, UP)
    expect(r.spot.lessonSpot.value?.kind).toBe('speed')
    r.off()
  })

  it('run 12: the idle shot hint does not hold a chip spotlight back (Jonas: six of them, no speed lesson)', async () => {
    const e = board({ monsters: [mon('slime', 3, 1, 1e9)], row: 11, nextBossRow: 20, launcherX: 3.5, tray: [1] })
    const r = await boot(e, { spots: true, chips: chips0(), volleys: 10 })
    expect(r.spot.lessonSpot.value).toBeNull() // row 11: speed waits for 12
    // The idle hint was on screen this volley…
    r.coach.noteLessonVisible({ id: 'pull', seq: 9001, reason: 'idle' })
    r.w.volleys.value = 11
    // …and the next aim phase, row 12, still gets the speed spotlight.
    play(e, UP)
    expect(e.state.row).toBe(12)
    expect(r.spot.lessonSpot.value?.kind).toBe('speed')
    r.off()
  })

  it('bounty demos the boss when one stands — its chest bounty, so ×1.2 is a number the eye sees', async () => {
    const boss = mon('boss', 2, 1, 900, { bossKind: 'worm', spawnRow: 20 })
    const e = board({ monsters: [mon('slime', 0, 2, 30, { spawnRow: 22 }), boss], row: 22, launcherX: 3.5 })
    const view = chips0().find((c) => c.id === 'bounty')!
    const { coach } = await boot(e)
    const d = coach.chipSpotDraft('bounty', view, e.state)
    expect(d).toMatchObject({ kind: 'bounty', monsterId: boss.id })
    expect(d?.coinsNow).toBe(Math.round(bossBounty(20)))
    expect(d?.coinsNext).toBe(Math.round(bossBounty(20) * 1.2))
    expect(d!.coinsNext! - d!.coinsNow!).toBeGreaterThanOrEqual(10)
  })

  it('never in danger, never under an upgrade funnel, never the aim a boss arrived on, and SPOT_GAP volleys apart', async () => {
    // In danger: the threat spotlight (seen) is out, the chip one waits too.
    const { e } = dangerBoard()
    e.state.row = 14
    let r = await boot(e, { spots: true, chips: chips0(), state: { eb_coach: { v: 1, shown: { threatBox: 1 }, kinds: {} } } })
    expect(r.spot.lessonSpot.value).toBeNull()
    r.off()
    // A funnel up (Ball Damage affordable, never bought): it has the aim.
    const chipsD = chips0().map((c) => (c.id === 'damage' ? { ...c, level: 0, affordable: true } : c))
    r = await boot(board({ monsters: [mon('slime', 3, 2)], row: 14 }), { spots: true, chips: chipsD })
    expect(r.coach.upgradeFunnel.value).not.toBeNull()
    expect(r.spot.lessonSpot.value).toBeNull()
    r.off()
    // A boss arriving: its aim phase is its own; the next one may speak.
    const e2 = board({ monsters: [mon('slime', 3, 2)], row: 14, tray: [1] })
    r = await boot(e2, { spots: true, chips: chips0(), volleys: 0, state: { eb_coach: { v: 1, shown: { speedBox: 1 }, kinds: {} } } })
    expect(r.spot.lessonSpot.value).toBeNull() // row 14: luck waits for 17
    r.off()
    const e3 = board({ monsters: [mon('slime', 3, 1)], row: 17, tray: [1] })
    r = await boot(e3, { spots: true, chips: chips0(), volleys: 10, state: { eb_coach: { v: 1, shown: { speedBox: 1 }, kinds: {} } } })
    expect(r.spot.lessonSpot.value?.kind).toBe('luck')
    r.spot.finishSpot()
    // The next aim phase: 0 volleys since (SPOT_GAP): nothing.
    emit(e3, { type: 'bossSpawn', monsterId: 999, bossKind: 'worm', row: 20 })
    play(e3, UP)
    expect(r.spot.lessonSpot.value).toBeNull()
    r.off()
  })

  it('the pause is held while it plays and released when it ends; the view gone ends it', async () => {
    const { spot } = await boot(board({ monsters: [mon('slime', 3, 2)] }))
    const pause = await import('@/use/useGamePause')
    const unregister = spot.registerSpotView()
    const done = vi.fn()
    expect(spot.offerSpot({ kind: 'speed', value: 1, next: 1.12 }, done)).toBe(true)
    expect(pause.isGamePaused.value).toBe(true)
    // One at a time.
    expect(spot.offerSpot({ kind: 'luck', value: 0, next: 0.05 })).toBe(false)
    spot.finishSpot()
    expect(done).toHaveBeenCalledTimes(1)
    expect(pause.isGamePaused.value).toBe(false)
    expect(spot.lessonSpot.value).toBeNull()
    unregister()
    expect(spot.canSpot()).toBe(false)
  })
})
