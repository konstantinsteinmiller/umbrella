// The wordless coach (`useCoach.ts`): lessons triggered by the real board,
// demonstrated with shots the engine has actually played on a clone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'
import { createEngine, type BarrageEngine } from '@/barrage/engine/engine'
import { defaultConfig } from '@/barrage/engine/economy'
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
  /** A shot landed moments ago (default): the shot demo is not due. Suites
   *  about other lessons would otherwise see it take every quiet aim. */
  shotRecent?: boolean
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
    state.eb_coach = { ...c, shown: { trayIntro: 2, ...(c.shown ?? {}) }, kinds: c.kinds ?? {} }
  }
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const coach = await import('@/use/useCoach')
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
    upgrades: ref<UpgradeView[]>(chipViews(o.damage)),
    freeOffer: ref(o.freeOffer ?? false),
    schedule: (fn: () => void) => fn()
  }
  const off = coach.installCoach(w)
  return { coach, w, off }
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

  it('never pulses under the arrows (they already say it louder)', async () => {
    const e = quiet()
    const { coach } = await boot(e, { damage: { affordable: true }, glowing: 'damage' })
    play(e, UP)
    play(e, UP)
    expect(coach.upgradeFunnel.value?.target).toBe('damage')
    expect(coach.chipPulse.value).toBeNull()
  })
})


describe('overrun lesson (the lose rule)', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  /** One monster a march from the line (the canvas's `1` pip), one far up. */
  const brink = () => {
    const doomed = mon('slime', 1, 9, 3)
    const e = board({ monsters: [doomed, mon('slime', 4, 3, 1e9)], launcherX: 3.5, tray: [1, 1] })
    return { e, doomed }
  }
  /** The overlay's side of it: the board played the demo (seen), it ran out. */
  const playOut = (coach: typeof import('@/use/useCoach')): void => {
    const l = coach.coachLesson.value
    if (l?.id !== 'overrun') throw new Error(`no overrun lesson: ${l?.id}`)
    coach.noteLessonVisible(l)
    coach.finishOverrun(l.seq)
  }

  it('the first aim with a `1` pip plays it on the monster about to cross — before every other lesson', async () => {
    const { e, doomed } = brink()
    // The tray intro and the shot demo are both due: the lose rule still goes first.
    const { coach } = await boot(e, { freshIntro: true, shotRecent: false, damage: { affordable: true } })
    const l = coach.coachLesson.value
    expect(l?.id).toBe('overrun')
    if (l?.id !== 'overrun') return
    expect(l.monsterId).toBe(doomed.id)
  })

  it('never for a `2` pip: a monster two marches out is the survive lesson\'s', async () => {
    const { e } = dangerBoard() // row 8: two marches from the line
    const { coach } = await boot(e)
    expect(coach.overrunThreat(e.state)).toBeNull()
    expect(coach.coachLesson.value?.id).toBe('survive')
  })

  it('marches the one closest to the line; a tie goes to the one nearest the unit', async () => {
    const { overrunThreat } = await import('@/use/useCoach')
    // An enraged boss one row out (it strides two) vs a slime right on the line.
    const boss = mon('boss', 0, 6, 1e9, { enraged: true })
    const far = mon('slime', 6, 9, 1e9)
    const a = board({ monsters: [boss, far], launcherX: 3.5 })
    expect(overrunThreat(a.state)).toBe(far.id)
    // Two on the line: the one under the unit.
    const left = mon('slime', 0, 9, 1e9)
    const mid = mon('slime', 3, 9, 1e9)
    const b = board({ monsters: [left, mid], launcherX: 3.5 })
    expect(overrunThreat(b.state)).toBe(mid.id)
    // A frozen monster skips the march: no `1` pip on it.
    const cold = board({ monsters: [mon('slime', 3, 9, 1e9, { frozen: 1 })], launcherX: 3.5 })
    expect(overrunThreat(cold.state)).toBeNull()
  })

  it('runs during the FTUE too, never in the Daily Barrage', async () => {
    const a = brink()
    const ftue = await boot(a.e, { ftueDone: false })
    expect(ftue.coach.coachLesson.value?.id).toBe('overrun')
    ftue.off()
    const b = brink()
    const daily = await boot(b.e, { mode: 'daily' })
    expect(daily.coach.coachLesson.value?.id).not.toBe('overrun')
  })

  it('counts only a showing the board played; one played showing retires it', async () => {
    const { e } = brink()
    const { coach, w } = await boot(e)
    const first = coach.coachLesson.value
    expect(first?.id).toBe('overrun')
    // The board could not play it (ms 0): finished, not counted…
    if (first) coach.finishOverrun(first.seq)
    expect(coach.lessonShown('overrun')).toBe(0)
    // …so it is back at the next aim phase that still has the `1` pip.
    w.engineGen.value++
    await nextTick()
    expect(coach.coachLesson.value?.id).toBe('overrun')
    playOut(coach)
    expect(coach.lessonShown('overrun')).toBe(1)
    w.engineGen.value++
    await nextTick()
    expect(coach.coachLesson.value?.id).not.toBe('overrun')
    // Persisted in the blob like every other exposure.
    const { getState } = await import('@/use/useEpicState')
    expect(getState<{ shown: Record<string, number> } | null>('eb_coach', null)?.shown.overrun).toBe(1)
  })

  it('hands the aim back: in danger, the survive lesson\'s rescue shot follows on the same aim', async () => {
    const { e, doomed } = brink()
    const { coach } = await boot(e)
    playOut(coach)
    const l = coach.coachLesson.value
    expect(l?.id).toBe('survive')
    if (l?.id !== 'survive') return
    expect(l.threats).toContain(doomed.id)
  })

  it('a stale finish (another lesson, a shot) changes nothing', async () => {
    const { e } = brink()
    const { coach } = await boot(e)
    const l = coach.coachLesson.value
    expect(l?.id).toBe('overrun')
    coach.finishOverrun((l?.seq ?? 0) + 1)
    expect(coach.coachLesson.value?.id).toBe('overrun')
    e.fire(UP)
    expect(coach.coachLesson.value).toBeNull()
    if (l) coach.finishOverrun(l.seq)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('neither the 20-second shot demo nor two empty taps talk over it', async () => {
    vi.useFakeTimers()
    // A tough monster two marches out: after one volley it wears the `1` pip.
    const e = board({ monsters: [mon('slime', 3, 8, 1e9)], launcherX: 3.5, tray: [1] })
    const { coach } = await boot(e, { state: { eb_coach: { v: 1, shown: { survive: 4 }, kinds: {} } } })
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('overrun')
    vi.advanceTimersByTime(coach.SHOT_QUIET_MS + 100) // the shot demo is due again
    expect(coach.shotDemoDue.value).toBe(true)
    expect(coach.coachLesson.value?.id).toBe('overrun')
    coach.noteMisfire()
    coach.noteMisfire()
    expect(coach.coachLesson.value?.id).toBe('overrun')
  })

  it('a real breach teaches it; a save with a lifetime loss, or a veteran\'s, never gets it', async () => {
    const quiet = board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
    const live = await boot(quiet)
    emit(quiet, { type: 'breach' })
    expect(live.coach.lessonShown('overrun')).toBe(live.coach.MAX_SHOWS.overrun)
    live.off()

    const a = brink()
    const lost = await boot(a.e, { state: { eb_unlocks: { v: 1, n: 1, losses: 1, seen: [] } } })
    expect(lost.coach.coachLesson.value?.id).not.toBe('overrun')
    lost.off()

    const b = brink()
    const vet = await boot(b.e, { raw: true, state: { eb_best_row: 80 } })
    expect(vet.coach.coachLesson.value?.id).not.toBe('overrun')
  })

  it('does not spend the lesson gap: a rule replayed is not a tip that must wait its turn', async () => {
    const { e } = brink()
    const { coach, w } = await boot(e, { state: { eb_coach: { v: 1, shown: { survive: 4 }, kinds: {} } } })
    playOut(coach)
    expect(coach.lessonShown('overrun')).toBe(1)
    // The same volley count, a board with a standout shot: the combo lesson
    // is not held back LESSON_GAP volleys by the overrun demo.
    w.engine.value = gapBoard()
    w.engineGen.value++
    await nextTick()
    expect(coach.coachLesson.value?.id).toBe('combo')
  })
})
