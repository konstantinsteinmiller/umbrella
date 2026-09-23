// The wordless coach (`useCoach.ts`): lessons triggered by the real board,
// demonstrated with shots the engine has actually played on a clone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'
import type { BarrageEngine } from '@/barrage/engine/engine'
import type { GameMode, IBarrageEngine, UpgradeId } from '@/barrage/engine/types'
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
  capacityLevel?: number
}

const boot = async (engine: BarrageEngine, o: BootOpts = {}) => {
  vi.resetModules()
  window.localStorage.clear()
  const state: Record<string, unknown> = { ...(o.state ?? {}) }
  if (!o.raw && !o.freshIntro) {
    const c = (state.eb_coach as { v: 1; shown?: Record<string, number>; kinds?: Record<string, number> } | undefined)
      ?? { v: 1, shown: {}, kinds: {} }
    state.eb_coach = { ...c, shown: { trayIntro: 2, upgrade: 1, ...(c.shown ?? {}) }, kinds: c.kinds ?? {} }
  }
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const coach = await import('@/use/useCoach')
  const eng = shallowRef<IBarrageEngine>(engine)
  const input = new EventTarget()
  const w = {
    engine: eng,
    engineGen: ref(1),
    mode: ref<GameMode>(o.mode ?? 'endless'),
    onEngineEvent: (cb: Parameters<IBarrageEngine['on']>[0]) => eng.value.on(cb),
    volleys: ref(o.volleys ?? 10),
    bestCombo: ref(o.bestCombo ?? 0),
    ftueDone: ref(o.ftueDone ?? true),
    capacityLevel: ref(o.capacityLevel ?? 1),
    glowingUpgrade: ref<UpgradeId | null>(o.glowing ?? null),
    upgradeTotal: ref(o.upgradeTotal ?? 1),
    schedule: (fn: () => void) => fn(),
    inputTarget: input
  }
  const off = coach.installCoach(w)
  return { coach, w, off, input }
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

describe('pull hint', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { vi.useRealTimers() })

  it('a wrong-way release replays the pull at once, for everyone', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)] })
    const { coach } = await boot(e, { volleys: 500 })
    coach.noteMisfire('wrongWay')
    const l = coach.coachLesson.value
    expect(l?.id === 'pull' && l.reason).toBe('wrongWay')
  })

  it('two empty taps nudge a novice, not a veteran', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)] })
    const n = await boot(e, { volleys: 3 })
    n.coach.noteMisfire('tap')
    expect(n.coach.coachLesson.value).toBeNull()
    n.coach.noteMisfire('tap')
    expect(n.coach.coachLesson.value?.id).toBe('pull')
    n.off()
    const v = await boot(board({ monsters: [mon('slime', 3, 2, 1e9)] }), { volleys: 400 })
    v.coach.noteMisfire('tap')
    v.coach.noteMisfire('tap')
    expect(v.coach.coachLesson.value).toBeNull()
  })

  it('the idle nudge only counts once the player is present', async () => {
    vi.useFakeTimers()
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)] })
    const { coach, input } = await boot(e, { volleys: 3 })
    vi.advanceTimersByTime(30_000) // a consent dialog, a backgrounded tab…
    expect(coach.coachLesson.value).toBeNull()
    input.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(coach.IDLE_MS - 100)
    expect(coach.coachLesson.value).toBeNull()
    vi.advanceTimersByTime(200)
    const l = coach.coachLesson.value
    expect(l?.id === 'pull' && l.reason).toBe('idle')
    // Touching again puts it away.
    input.dispatchEvent(new Event('pointerdown'))
    expect(coach.coachLesson.value).toBeNull()
  })

  it('firing clears whatever lesson was up', async () => {
    const e = board({ monsters: [mon('slime', 3, 2, 1e9)] })
    const { coach } = await boot(e)
    coach.noteMisfire('wrongWay')
    expect(coach.coachLesson.value).not.toBeNull()
    e.fire(UP)
    expect(coach.coachLesson.value).toBeNull()
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
    const { coach, w } = await boot(e, { freshIntro: true, ftueDone: false, volleys: 3 })
    w.ftueDone.value = true
    coach.noteMisfire('wrongWay') // a pull hint the player saw this very turn
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

describe('upgrade lesson', () => {
  beforeEach(() => { window.localStorage.clear() })

  const quiet = () => board({ monsters: [mon('slime', 3, 2, 1e9)], launcherX: 3.5 })
  const bootUp = (e: ReturnType<typeof quiet>, o: BootOpts = {}) =>
    boot(e, { ...o, state: { eb_coach: { v: 1, shown: { trayIntro: 2, combo: 4, upgrade: 0 }, kinds: {} } } })

  it('plays only after a paid upgrade has glowed unbought for two aim phases', async () => {
    const e = quiet()
    const { coach } = await bootUp(e, { glowing: 'damage' })
    expect(coach.coachLesson.value).toBeNull() // glow #1
    play(e, UP)
    const l = coach.coachLesson.value
    expect(l?.id === 'upgrade' && l.upgrade).toBe('damage')
  })

  it('a player who buys on their own never sees it', async () => {
    const e = quiet()
    const { coach, w } = await bootUp(e, { glowing: 'damage' })
    w.upgradeTotal.value += 1 // bought between the two aims
    play(e, UP)
    expect(coach.coachLesson.value).toBeNull()
  })

  it('buying anything while it shows ends it, and it never returns', async () => {
    const e = quiet()
    const { coach, w } = await bootUp(e, { glowing: 'speed' })
    play(e, UP)
    expect(coach.coachLesson.value?.id).toBe('upgrade')
    see(coach)
    w.upgradeTotal.value += 1
    await nextTick()
    expect(coach.coachLesson.value).toBeNull()
    // The glow sits unbought again for long enough — it still never returns.
    for (let i = 0; i < 3; i++) {
      w.volleys.value += 1
      play(e, UP)
      expect(coach.coachLesson.value?.id).not.toBe('upgrade')
    }
  })

  it('nothing glowing, nothing to teach', async () => {
    const e = quiet()
    const { coach } = await bootUp(e, { glowing: null })
    play(e, UP)
    play(e, UP)
    expect(coach.coachLesson.value).toBeNull()
  })
})
