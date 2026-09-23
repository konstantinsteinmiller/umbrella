/**
 * useCoach — the wordless coach that takes over where the FTUE stops.
 *
 * The FTUE (`useTutorial.ts`) teaches four beats in the first minute. Play-
 * testing showed what it leaves a newcomer alone with, each measured first
 * (see `game-implementation-plan.md`, "Onboarding pass 2"):
 *
 *   pull    — the slingshot itself. Pointing AT the monsters fired the pinned
 *             edge shot (a slow wall-to-wall zig-zag); the aim controller now
 *             refuses it and this lesson replays the pull-back arrow instead.
 *             Also after two empty taps, and as an idle nudge for novices.
 *   survive — monsters two rows from the line: the ones that will break
 *             through are marked and a real rescue shot is demonstrated.
 *   tray    — "+1" only adds a SHOT while the tray has room (at capacity 2,
 *             61 % of them turned into coins). After the first overflow the
 *             tray acts it out and points at the capacity upgrade — which is
 *             also the measured killer (never upgrading: first breach ≈ row 20).
 *   combo   — a board where one angle scores far more hits than a typical
 *             shot (usually through a gap, bouncing behind the rows): the
 *             ghost pulls to it and the path counts its hits up.
 *   trayIntro — right after the FTUE: what the ball tray IS ("absolutely
 *             unclear" in the play-test) — its balls are your shots, "+1"
 *             fills a socket, a full tray merges twins (TrayIntroDemo).
 *   upgrade — a paid upgrade has glowed for two aim phases and nobody bought
 *             it: the chip is pressed and its effect shown where it lands
 *             (UpgradeDemo). A player who buys on their own never sees it.
 *
 * Every lesson is a DEMONSTRATION on the player's own board. The shots come
 * from `engine/shotFinder.ts` (trial volleys on engine clones), so the coach
 * never shows a shot that does not work here. Nothing is ever typed on
 * screen; the sentences live only in an sr-only live region.
 *
 * One lesson at a time, novice-gated, exposure-capped, persisted in the blob
 * (`eb_coach`). Nothing runs in the Daily Barrage except the pull hint — a
 * coach that finds the best shot would hand out the competitive board.
 *
 * Also owns the in-world RULE BADGES' lifetime (the renderer draws them): a
 * monster kind wears its badge from its first appearance until it has been
 * on the board for TAG_TURNS aim phases.
 */
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue'
import { getState, setState, prismState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { EB_BEST_ROW_KEY, EB_COACH_KEY, EB_MONSTERS_SEEN_KEY } from '@/barrage/keys'
import { BOSS_ORDER } from '@/barrage/engine/monsters'
import {
  BOSS_EVERY, ROWS,
  type BoardState, type EngineListener, type GameMode, type IBarrageEngine, type SkillId, type UpgradeId
} from '@/barrage/engine/types'
import {
  aimFan, canTrial, medianOf, pickBest, startTrial, type ShotTrial, type TrialEngine, type TrialRun
} from '@/barrage/engine/shotFinder'
import { tagKeyOf } from '@/barrage/render/ruleMarks'

export type LessonId = 'pull' | 'survive' | 'tray' | 'combo' | 'trayIntro' | 'upgrade'

// ─── Tunables ────────────────────────────────────────────────────────────────
/** Aim phases a new monster kind wears its in-world rule badge (≈ 30 s of
 *  play, every one of them a moment the player is looking at the board). */
export const TAG_TURNS = 4
/** Lifetime volleys below which the idle nudge and the tap misfire run. */
export const NOVICE_VOLLEYS = 40
/** Aim-phase idle before the pull hint (only once the player is PRESENT —
 *  a consent dialog over the game at load must not spend it). */
export const IDLE_MS = 7000
/** Consecutive empty releases that count as "doesn't know the gesture". */
export const TAP_MISFIRES = 2
export const MAX_SHOWS: Readonly<Record<Exclude<LessonId, 'pull'>, number>> = {
  survive: 4, tray: 3, combo: 4, trayIntro: 2, upgrade: 1
}
/** Volleys between the two tray-intro showings. */
export const TRAY_INTRO_GAP = 8
/** Aim phases a paid upgrade must glow unbought before its lesson plays. */
export const UPGRADE_IDLE_AIMS = 2
/** Lifetime best combo that retires the combo lesson. */
export const COMBO_GRADUATE = 25
/** A combo lesson needs a shot of at least this many hits… */
export const COMBO_MIN_HITS = 10
/** …and at least this multiple of the typical (median) shot on the board. */
export const COMBO_GAIN = 2
/** Volleys between two PROACTIVE lessons (misfire hints are exempt). */
export const LESSON_GAP = 3
/** Volleys between two survive lessons: danger comes in streaks, and four
 *  exposures spent on one streak would teach one situation four times. */
export const SURVIVE_GAP = 2
/** Volleys between two tray lessons: at capacity 2 a "+1" spills every turn,
 *  and three exposures on three consecutive turns is one lesson nagging. */
export const TRAY_GAP = 2
/** Best row past which a save that predates the coach is a veteran's: the
 *  survive and tray lessons are marked as done (combo retires on its own
 *  through the best-combo stat). */
export const VETERAN_ROW = 30
/** Rows between the lowest monster and the line that count as danger
 *  (the engine's `danger` event uses the same 2). */
export const DANGER_AT = 2
/** Tray capacity level that retires the tray lesson (capacity 6). */
export const TRAY_GRADUATE_LEVEL = 3
/** Angles tried per search (≈ 4.5° apart). */
export const FAN_SIZE = 37
/** Budget per idle slice, ms. A trial stops MID-VOLLEY when it runs out
 *  (measured at 4× CPU throttle: one 20-ball volley took up to 74 ms whole). */
const SLICE_MS = 6

const SAVING_SKILLS: ReadonlySet<SkillId> = new Set(['meteor', 'execute', 'heal', 'shield'])

// ─── Persistence ─────────────────────────────────────────────────────────────
interface CoachSave {
  v: 1
  shown: Partial<Record<LessonId, number>>
  kinds: Record<string, number>
}

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)

// The badge key is the renderer's (it draws the badges); re-exported so the
// coach's callers and tests need one import.
export { tagKeyOf }

/** A save written before the coach existed: every monster the retired intro
 *  banner already introduced, and every boss the player has walked past, is
 *  known — a veteran must never see badges on monsters they have fought. */
const migrated = (): Record<string, number> => {
  const kinds: Record<string, number> = {}
  const seen = getState<unknown>(EB_MONSTERS_SEEN_KEY, [])
  if (Array.isArray(seen)) for (const k of seen) if (typeof k === 'string' && k !== 'slime') kinds[k] = TAG_TURNS + 1
  const best = count(getState(EB_BEST_ROW_KEY, 0))
  BOSS_ORDER.forEach((b, i) => { if (best > (i + 1) * BOSS_EVERY) kinds[`boss:${b}`] = TAG_TURNS + 1 })
  return kinds
}

const readSave = (): CoachSave => {
  const raw = getState<Partial<CoachSave> | null>(EB_COACH_KEY, null)
  if (!raw || raw.v !== 1) {
    const veteran = count(getState(EB_BEST_ROW_KEY, 0)) > VETERAN_ROW
    const shown: Partial<Record<LessonId, number>> = veteran
      ? { survive: MAX_SHOWS.survive, tray: MAX_SHOWS.tray, trayIntro: MAX_SHOWS.trayIntro, upgrade: MAX_SHOWS.upgrade }
      : {}
    return { v: 1, shown, kinds: migrated() }
  }
  const shown: Partial<Record<LessonId, number>> = {}
  for (const id of ['pull', 'survive', 'tray', 'combo', 'trayIntro', 'upgrade'] as const) {
    const n = count(raw.shown?.[id])
    if (n > 0) shown[id] = n
  }
  const kinds: Record<string, number> = {}
  if (raw.kinds && typeof raw.kinds === 'object') {
    for (const [k, v] of Object.entries(raw.kinds)) if (count(v) > 0) kinds[k] = count(v)
  }
  return { v: 1, shown, kinds }
}

const save: Ref<CoachSave> = ref(readSave())
const persist = (): void => { setState(EB_COACH_KEY, save.value) }

// Hydration only ever moves forward: a lesson shown on another device stays
// shown, a badge retired there stays retired.
const rehydrate = (): void => {
  const fresh = readSave()
  const cur = save.value
  const shown = { ...cur.shown }
  for (const [k, v] of Object.entries(fresh.shown) as [LessonId, number][]) shown[k] = Math.max(shown[k] ?? 0, v)
  const kinds = { ...cur.kinds }
  for (const [k, v] of Object.entries(fresh.kinds)) kinds[k] = Math.max(kinds[k] ?? 0, v)
  save.value = { v: 1, shown, kinds }
}
watch(saveDataVersion, rehydrate)
watch(prismState, rehydrate, { deep: false })

export const lessonShown = (id: LessonId): number => save.value.shown[id] ?? 0

/** Badge keys that have done their TAG_TURNS aim phases — the renderer
 *  badges every other non-slime monster. */
export const retiredTags: ComputedRef<ReadonlySet<string>> = computed(() => {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(save.value.kinds)) if (v > TAG_TURNS) out.add(k)
  return out
})

// ─── The live lesson ─────────────────────────────────────────────────────────
export type CoachLesson =
  | { id: 'pull'; seq: number; reason: 'idle' | 'tap' | 'wrongWay' }
  | { id: 'combo'; seq: number; trial: ShotTrial; baseline: number }
  | {
    id: 'survive'
    seq: number
    trial: ShotTrial
    /** Monster ids about to breach. */
    threats: number[]
    /** Cell centre of the saving skill bubble the shot takes, if any. */
    skillAt: { x: number; y: number } | null
  }
  | { id: 'tray'; seq: number }
  | { id: 'trayIntro'; seq: number }
  | { id: 'upgrade'; seq: number; upgrade: UpgradeId }

/** What the coach overlay acts out right now (null = nothing). */
export const coachLesson = shallowRef<CoachLesson | null>(null)
let lessonSeq = 0
let countedSeq = -1

/** Called by the overlay the first time a lesson is actually ON SCREEN: an
 *  exposure is a lesson the player could see, not one a modal covered. */
export const noteLessonVisible = (lesson: CoachLesson): void => {
  if (lesson.seq === countedSeq) return
  countedSeq = lesson.seq
  const shown = { ...save.value.shown, [lesson.id]: lessonShown(lesson.id) + 1 }
  save.value = { ...save.value, shown }
  persist()
  lastLessonVolley = currentVolleys()
}

// Filled by `installCoach` — module-level so `noteMisfire` (called from the
// scene) and the overlay reach the same wiring.
let wiring: CoachWiring | null = null
let lastLessonVolley = -Infinity
let taps = 0
let pendingTray = false
const currentVolleys = (): number => wiring?.volleys.value ?? 0
const isNovice = (): boolean => currentVolleys() < NOVICE_VOLLEYS

/** `Omit` that keeps a union a union (plain Omit collapses it to the shared keys). */
type LessonDraft = CoachLesson extends infer L ? (L extends CoachLesson ? Omit<L, 'seq'> : never) : never

const setLesson = (l: LessonDraft | null): void => {
  coachLesson.value = l ? ({ ...l, seq: ++lessonSeq } as CoachLesson) : null
}

/** A release that fired nothing (BarrageBoard `misfire`). */
export const noteMisfire = (kind: 'wrongWay' | 'tap'): void => {
  const w = wiring
  if (!w) return
  if (w.engine.value.state.phase !== 'aim') return
  if (kind === 'wrongWay') {
    taps = 0
    // The FTUE's own hand is already acting out the pull on its aim beat.
    if (!w.ftueDone.value) return
    setLesson({ id: 'pull', reason: 'wrongWay' })
    return
  }
  if (++taps < TAP_MISFIRES || !isNovice() || !w.ftueDone.value) return
  taps = 0
  setLesson({ id: 'pull', reason: 'tap' })
}

// ─── Board reading ───────────────────────────────────────────────────────────
/** Rows between the lowest monster and the breach line. */
export const rowsLeft = (s: BoardState): number => {
  let bottom = -Infinity
  for (const m of s.monsters) if (m.row + m.h > bottom) bottom = m.row + m.h
  return bottom === -Infinity ? ROWS : ROWS - bottom
}

/** Monsters within DANGER_AT rows of the line — the ones a rescue shot is for. */
export const threatIds = (s: BoardState): number[] =>
  s.monsters.filter((m) => ROWS - (m.row + m.h) <= DANGER_AT).map((m) => m.id)

export const comboScore = (t: ShotTrial): number => t.hits + t.kills * 0.5

export const surviveScore = (t: ShotTrial, threatHp: number): number =>
  (t.breach ? -1e6 : 0)
  + t.threatKills * 400
  + (Math.min(t.threatDamage, threatHp) / Math.max(1, threatHp)) * 300
  + (t.skills.some((k) => SAVING_SKILLS.has(k)) ? 250 : 0)
  + Math.max(-2, Math.min(4, t.rowsLeftAfter)) * 60
  + t.kills * 5
  + t.hits

// ─── Wiring ──────────────────────────────────────────────────────────────────
export interface CoachWiring {
  engine: Readonly<Ref<IBarrageEngine>>
  engineGen: Readonly<Ref<number>>
  mode: Readonly<Ref<GameMode>>
  onEngineEvent(cb: EngineListener): () => void
  /** Lifetime volleys (the novice signal). */
  volleys: Readonly<Ref<number>>
  bestCombo: Readonly<Ref<number>>
  /** The FTUE has handed over (its own overlay owns the first shots). */
  ftueDone: Readonly<Ref<boolean>>
  capacityLevel: Readonly<Ref<number>>
  /** The glowing PAID upgrade (not the FTUE's free chip), or null. */
  glowingUpgrade?: Readonly<Ref<UpgradeId | null>>
  /** Sum of all upgrade levels — a rise is a purchase. */
  upgradeTotal?: Readonly<Ref<number>>
  /** Run `fn` when the browser has a moment (tests pass a synchronous runner). */
  schedule?: (fn: () => void) => void
  now?: () => number
  /** Where presence is detected (tests pass their own target). */
  inputTarget?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null
}

const idleSchedule = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  if (ric) ric(fn, { timeout: 120 })
  else setTimeout(fn, 16)
}

/** Wire the coach to the live run. Returns the teardown. */
export const installCoach = (w: CoachWiring): (() => void) => {
  wiring = w
  const schedule = w.schedule ?? idleSchedule
  const now = w.now ?? (() => performance.now())
  const offs: (() => void)[] = []
  let searchToken = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let present = false

  const stopIdle = (): void => {
    if (idleTimer !== null) clearTimeout(idleTimer)
    idleTimer = null
  }
  const armIdle = (): void => {
    stopIdle()
    if (!present || !isNovice() || !w.ftueDone.value) return
    if (w.engine.value.state.phase !== 'aim') return
    idleTimer = setTimeout(() => {
      idleTimer = null
      if (w.engine.value.state.phase !== 'aim' || coachLesson.value) return
      setLesson({ id: 'pull', reason: 'idle' })
    }, IDLE_MS)
  }

  // Presence: the idle clock only exists once the player has touched the
  // game at all (TRAPS §3 — a timer must not run while nobody is there).
  const onInput = (): void => {
    present = true
    if (coachLesson.value?.id === 'pull' && coachLesson.value.reason === 'idle') setLesson(null)
    armIdle()
  }
  const target = w.inputTarget === undefined ? (typeof window !== 'undefined' ? window : null) : w.inputTarget
  if (target) {
    target.addEventListener('pointerdown', onInput, { capture: true } as AddEventListenerOptions)
    target.addEventListener('keydown', onInput, { capture: true } as AddEventListenerOptions)
    offs.push(() => {
      target.removeEventListener('pointerdown', onInput, { capture: true } as EventListenerOptions)
      target.removeEventListener('keydown', onInput, { capture: true } as EventListenerOptions)
    })
  }

  const cancelSearch = (): void => { searchToken++ }

  const search = (kind: 'combo' | 'survive'): void => {
    const token = ++searchToken
    const eng = w.engine.value
    if (!canTrial(eng)) return
    const trialEng = eng as unknown as TrialEngine
    const gen = w.engineGen.value
    const turn = eng.state.turn
    const angles = aimFan(FAN_SIZE)
    const threatList = kind === 'survive' ? threatIds(eng.state) : []
    const threats = new Set(threatList)
    let threatHp = 0
    for (const m of eng.state.monsters) if (threats.has(m.id)) threatHp += m.hp
    const trials: ShotTrial[] = []
    let i = 0
    let run: TrialRun | null = null
    const step = (): void => {
      if (token !== searchToken) return
      if (w.engineGen.value !== gen || eng.state.phase !== 'aim' || eng.state.turn !== turn) return
      const t0 = now()
      const outOfTime = (): boolean => now() - t0 >= SLICE_MS
      while (i < angles.length) {
        run ??= startTrial(trialEng, angles[i]!, { threats })
        if (!run.step(outOfTime)) { schedule(step); return }
        trials.push(run.result)
        run = null
        i++
        if (i < angles.length && outOfTime()) { schedule(step); return }
      }
      if (coachLesson.value) return // something more urgent got there first
      if (kind === 'combo') {
        const best = trials[pickBest(trials, comboScore)]
        const base = medianOf(trials, (t) => t.hits)
        if (best && best.hits >= Math.max(COMBO_MIN_HITS, COMBO_GAIN * Math.max(1, base))) {
          setLesson({ id: 'combo', trial: best, baseline: base })
        }
        return
      }
      const best = trials[pickBest(trials, (t) => surviveScore(t, threatHp))]
      if (!best || (best.threatDamage <= 0 && !best.skills.some((k) => SAVING_SKILLS.has(k)))) return
      let skillAt: { x: number; y: number } | null = null
      for (const p of eng.state.pickups) {
        if (p.kind === 'skill' && p.skill && SAVING_SKILLS.has(p.skill) && best.skills.includes(p.skill)) {
          skillAt = { x: p.col + 0.5, y: p.row + 0.5 }
          break
        }
      }
      setLesson({ id: 'survive', trial: best, threats: threatList, skillAt })
    }
    schedule(step)
  }

  const countTags = (s: BoardState): void => {
    const keys = new Set<string>()
    for (const m of s.monsters) {
      if (m.row + m.h <= 0) continue // still above the board
      const k = tagKeyOf(m)
      if (k && (save.value.kinds[k] ?? 0) <= TAG_TURNS) keys.add(k)
    }
    if (keys.size === 0) return
    const kinds = { ...save.value.kinds }
    for (const k of keys) kinds[k] = (kinds[k] ?? 0) + 1
    save.value = { ...save.value, kinds }
    persist()
  }

  // Upgrade lesson bookkeeping: how many aim phases the same glow has sat unbought.
  let glowAims = 0
  let lastTotal = w.upgradeTotal?.value ?? 0
  const noteGlow = (): void => {
    const total = w.upgradeTotal?.value ?? 0
    const glowing = w.glowingUpgrade?.value ?? null
    glowAims = glowing !== null && total === lastTotal ? glowAims + 1 : glowing !== null ? 1 : 0
    lastTotal = total
  }

  const onAim = (): void => {
    const s = w.engine.value.state
    cancelSearch()
    setLesson(null)
    countTags(s)
    armIdle()
    noteGlow()
    if (!w.ftueDone.value) return
    if (w.mode.value !== 'endless') { pendingTray = false; return }
    const sinceLesson = currentVolleys() - lastLessonVolley
    if (rowsLeft(s) <= DANGER_AT && lessonShown('survive') < MAX_SHOWS.survive && sinceLesson >= SURVIVE_GAP) {
      search('survive')
      return
    }
    // What the tray IS: first thing after the FTUE hands over, once more later.
    const introShown = lessonShown('trayIntro')
    if (introShown < MAX_SHOWS.trayIntro && (introShown === 0 || sinceLesson >= TRAY_INTRO_GAP)) {
      setLesson({ id: 'trayIntro' })
      return
    }
    // A spill stays pending until the tray lesson may speak again.
    if (pendingTray && sinceLesson >= TRAY_GAP) {
      pendingTray = false
      if (lessonShown('tray') < MAX_SHOWS.tray && w.capacityLevel.value < TRAY_GRADUATE_LEVEL) {
        setLesson({ id: 'tray' })
        return
      }
    }
    const glowing = w.glowingUpgrade?.value ?? null
    if (glowing && glowAims >= UPGRADE_IDLE_AIMS && lessonShown('upgrade') < MAX_SHOWS.upgrade && sinceLesson >= 2) {
      setLesson({ id: 'upgrade', upgrade: glowing })
      return
    }
    if (
      sinceLesson >= LESSON_GAP
      && w.bestCombo.value < COMBO_GRADUATE
      && lessonShown('combo') < MAX_SHOWS.combo
    ) search('combo')
  }

  offs.push(w.onEngineEvent((e) => {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'aim') onAim()
        else { cancelSearch(); stopIdle(); if (coachLesson.value) setLesson(null) }
        break
      case 'fire':
        taps = 0
        cancelSearch()
        stopIdle()
        setLesson(null)
        break
      case 'trayOverflow':
        pendingTray = true
        break
      default:
        break
    }
  }))

  // A new board (restart, daily, hydrate) makes everything in flight stale.
  offs.push(watch(() => w.engineGen.value, () => {
    cancelSearch()
    setLesson(null)
    pendingTray = false
    if (w.engine.value.state.phase === 'aim') onAim()
  }))
  // The tray lesson retires the moment its advice is taken.
  offs.push(watch(() => w.capacityLevel.value, (lvl, was) => {
    if (lvl > was && coachLesson.value?.id === 'tray') setLesson(null)
  }))
  // …and the upgrade lesson the moment anything is bought.
  if (w.upgradeTotal) {
    offs.push(watch(w.upgradeTotal, (n, was) => {
      if (n > was && coachLesson.value?.id === 'upgrade') setLesson(null)
    }))
  }

  if (w.engine.value.state.phase === 'aim') onAim()

  return () => {
    for (const off of offs) off()
    cancelSearch()
    stopIdle()
    setLesson(null)
    if (wiring === w) wiring = null
  }
}

// ⚠️ DEV-ONLY: browser checks read the live coach + run through the app's own
// module instance (an import from a CDP script can land on a stale HMR copy).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__coach = {
    lesson: () => coachLesson.value,
    engine: () => wiring?.engine.value ?? null,
    retired: () => [...retiredTags.value]
  }
}
