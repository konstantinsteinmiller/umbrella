/**
 * useCoach — the wordless coach that takes over where the FTUE stops.
 *
 * The FTUE (`useTutorial.ts`) teaches four beats in the first minute. Play-
 * testing showed what it leaves a newcomer alone with, each measured first
 * (see `game-implementation-plan.md`, "Onboarding pass 2"):
 *
 *   pull    — the shot itself, acted out inside the board: a ghost finger
 *             drags toward the monsters and the ball flies (FingerDemo). It
 *             shows whenever no shot was fired in the last SHOT_QUIET_MS
 *             (none yet counts): play-test run 2 replayed an idle-gated demo
 *             14–18× per tester to players who had just shot, while a player
 *             back from the fridge is exactly who needs it.
 *   survive — monsters two rows from the line: the ones that will break
 *             through are marked and a real rescue shot is demonstrated.
 *   tray    — "+1" only adds a SHOT while the tray has room (at capacity 2,
 *             61 % of them turned into coins). After the first overflow the
 *             tray acts it out and points at the capacity upgrade — which is
 *             also the measured killer (never upgrading: first breach ≈ row 20).
 *   combo   — a board where one angle scores far more hits than a typical
 *             shot (usually through a gap, bouncing behind the rows): the
 *             ghost finger aims it and the path counts its hits up. Its first
 *             showing comes EARLY, as the `bank` shot: on turn 2 or 3 of the
 *             first session, an angled shot off a side wall that kills two
 *             monsters. Play-testers who found the shot fired straight up for
 *             minutes — nothing had shown them it can be angled.
 *   trayIntro — right after the FTUE: what the ball tray IS ("absolutely
 *             unclear" in the play-test) — its balls are your shots, "+1"
 *             fills a socket, a full tray merges twins (TrayIntroDemo).
 *   (overrun — retired in run 7: the lose rule is taught by the loss itself,
 *             the board's death sequence, render/death.ts; its first-danger
 *             demo read as "an unexplained red overlay" in still frames.)
 *
 * And SPOTLIGHTS (`components/barrage/lessonSpotlight.ts`, after playtest run
 * 11): short staged moments that pause the game, a tap skips —
 *   threat  — the first time a monster comes within DANGER_PIP_MARCHES: a
 *             ghost of it marches down while its pip and the unit's tick down
 *             together, to the line; then a ghost shot takes it out. Both
 *             losses of run 11 had the '1' and its tether up, unread. The
 *             survive lesson's rescue shot follows on the real board.
 *   speed / luck / bounty — what the three chips nobody could explain do,
 *             once each, a few rows in (UPGRADE_SPOT_ROWS), SPOT_GAP volleys
 *             from any other lesson, never in danger, under a funnel or right
 *             after a boss arrives / falls — and only while the chip is
 *             unbought.
 *
 * Beside the lessons runs the UPGRADE FUNNEL (`upgradeFunnel`, its own channel:
 * it lives on the upgrade chips, never over the board, so it may share the
 * screen with a shot lesson). Play-test run 2: every tester took the FREE
 * chip and then never bought a paid upgrade, ending with 115–284 coins
 * unspent against prices of 12–30 — and walled at the first boss.
 *
 *   damage  — the moment Ball Damage is affordable after the free Tray
 *             Capacity: runic gold arrows point at its chip, coins fly from
 *             the wallet into it and the ghost hand presses it (UpgradeDemo).
 *             Every aim phase until Damage is bought (≤ ARROW_CAP showings).
 *   boss / breach — after every boss kill and every breach, the arrows
 *             come back on the glowing chip for REARM_AIMS aim phases.
 *   gear    — a boss ARRIVES and the glowing chip is affordable: the arrows
 *             come back for REARM_AIMS aim phases (run 6: testers met the
 *             row-20 boss with ~200 coins unspent and read it as outscaling).
 *   pulse   — an aim phase that starts with something affordable, and no
 *             purchase for PULSE_AFTER_AIMS aim phases, pulses the glowing
 *             chip once (`chipPulse`).
 *   rich    — play-test run 4 (purchases stalled after the first Damage,
 *             176–449 coins unspent): an aim phase that opens with the wallet
 *             holding RICH_MULT× the glowing chip's price, nothing bought for
 *             RICH_IDLE_AIMS aim phases and no funnel for RICH_EVERY_AIMS,
 *             brings the whole funnel back on the glowing chip. No lifetime
 *             cap; any purchase ends it.
 *
 * The whole funnel (arrows, hand, the idle chip pulse) RETIRES once the player
 * has been past FUNNEL_LAST_ROW (best row or this run's row): by then they have
 * learnt that coins buy power. The glowing chip itself stays (CONTRACT §0.3).
 *
 * Once the player has fired FUNNEL_HAND_VOLLEYS volleys, a due funnel OWNS the
 * ghost hand (run 4: every showing ran under a shot lesson, so the funnel was
 * arrows only and no hand ever pressed a chip): the shot demos (pull, combo)
 * yield to it for that aim phase. The survive lesson still wins (danger
 * first).
 *
 * And it never shares the screen with a modal, an earned feature flying in or
 * a coin rain landing in the wallet (`funnelCalm`): whenever one of them
 * breaks the calm, the funnel is held until the next calm aim phase (an
 * interrupted rich-wallet showing does not count — it comes back then).
 *
 * Every lesson is a DEMONSTRATION on the player's own board. The shots come
 * from `engine/shotFinder.ts` (trial volleys on engine clones), so the coach
 * never shows a shot that does not work here. Nothing is ever typed on
 * screen; the sentences live only in an sr-only live region.
 *
 * One lesson at a time, exposure-capped, persisted in the blob (`eb_coach`,
 * which also counts the funnel's arrows and the merge lightboxes). Nothing
 * runs in the Daily Barrage except the pull hint — a coach that finds the
 * best shot would hand out the competitive board.
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
  BALL_R, BOSS_EVERY, COLS, ROWS,
  type BoardState, type EngineListener, type GameMode, type IBarrageEngine, type SkillId, type UpgradeId
} from '@/barrage/engine/types'
import {
  aimFan, canTrial, medianOf, pickBest, startTrial, type ShotTrial, type TrialEngine, type TrialRun
} from '@/barrage/engine/shotFinder'
import { tagKeyOf } from '@/barrage/render/ruleMarks'
import { DANGER_PIP_MARCHES, dangerIds, dangerMarches, marchPlan, marchesToBreach, nextMarchTurn } from '@/barrage/render/danger'
import { bossBounty, killCoins } from '@/barrage/engine/economy'
import type { UpgradeView } from '@/barrage/state/contract'
import { canSpot, offerSpot, type SpotKind, type ThreatSpot, type UpgradeSpot, type UpgradeSpotKind } from '@/components/barrage/lessonSpotlight'

export type LessonId = 'pull' | 'survive' | 'tray' | 'combo' | 'trayIntro'
/** Everything the save counts: the lessons, the funnel's Damage arrows, the
 *  merge lightbox (`components/barrage/mergeLightbox.ts`) and the first
 *  "+1"'s spotlight (`components/barrage/pickupSpotlight.ts`). */
export type ExposureId = LessonId | 'arrows' | 'mergeBox' | 'pickupBox' | SpotExposure
/** The spotlights' exposures (lessonSpotlight.ts), one per kind. */
export type SpotExposure = 'threatBox' | 'speedBox' | 'luckBox' | 'bountyBox'
const EXPOSURE_IDS: readonly ExposureId[] = [
  'pull', 'survive', 'tray', 'combo', 'trayIntro', 'arrows', 'mergeBox', 'pickupBox',
  'threatBox', 'speedBox', 'luckBox', 'bountyBox'
]
const spotExposure = (kind: SpotKind): SpotExposure => `${kind}Box`

// ─── Tunables ────────────────────────────────────────────────────────────────
/** Aim phases a new monster kind wears its in-world rule badge (≈ 30 s of
 *  play, every one of them a moment the player is looking at the board). */
export const TAG_TURNS = 4
/** A shot within this long hides the shot demo (the coach's pull hint AND the
 *  FTUE's aim hand); past it — or before the first shot — the demo shows. */
export const SHOT_QUIET_MS = 20_000
/** Consecutive empty releases (a let-go on the unit — the board's only
 *  cancel) that bring the shot demo back over another lesson. */
export const TAP_MISFIRES = 2
export const MAX_SHOWS: Readonly<Record<Exclude<LessonId, 'pull'>, number>> = {
  survive: 4, tray: 3, combo: 4, trayIntro: 2
}
/** Volleys between the two tray-intro showings. */
export const TRAY_INTRO_GAP = 8
/** Aim phases the Damage arrows may show before they give up. */
export const ARROW_CAP = 6
/** Playtest run 8: Damage arrows ignored this many times (Mia bought nothing
 *  — "a stuck tutorial hint") and the first Ball Damage level turns FREE,
 *  the way the Capacity gift taught every tester that the chips buy power. */
export const FREE_DAMAGE_AFTER = 3
/** The upgrade funnel retires once the player has been past this row. */
export const FUNNEL_LAST_ROW = 25
/** Aim phases the arrows come back for after a boss kill or a breach. */
export const REARM_AIMS = 2
/** Aim phases without a purchase before an affordable glowing chip pulses. */
export const PULSE_AFTER_AIMS = 2
/** Lifetime volleys after which a due funnel owns the ghost hand (the first
 *  shots belong to the shot demos). */
export const FUNNEL_HAND_VOLLEYS = 3
/** Rich wallet: the wallet holds at least this multiple of the glowing chip's
 *  price… */
export const RICH_MULT = 2
/** …nothing was bought for this many aim phases… */
export const RICH_IDLE_AIMS = 3
/** …and the last funnel on screen is at least this many aim phases back (a
 *  showing at aim n, the next no sooner than aim n + RICH_EVERY_AIMS). */
export const RICH_EVERY_AIMS = 4
/** Lifetime best combo that retires the combo lesson. */
export const COMBO_GRADUATE = 25
/** A combo lesson needs a shot of at least this many hits… */
export const COMBO_MIN_HITS = 10
/** …and at least this multiple of the typical (median) shot on the board. */
export const COMBO_GAIN = 2
/** Volleys fired before the aims where the early bank shot may play: the
 *  first session's turn 2 and turn 3 (turn 1 belongs to the FTUE's hand). */
export const BANK_TURNS: readonly number[] = [1, 2]
/** The bank shot must be visibly ANGLED: at least this far off straight up… */
export const BANK_MIN_OFF = (20 * Math.PI) / 180
/** …and no flatter than this (the near-flat wall-to-wall zig-zag is what a
 *  sloppy thumb finds anyway; it teaches nothing about aiming). */
export const BANK_MAX_OFF = (64 * Math.PI) / 180
/** Kills the bank shot's volley must score. */
export const BANK_KILLS = 2
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
/** Tray capacity level that retires the tray lesson (capacity 6). */
export const TRAY_GRADUATE_LEVEL = 3
/** Angles tried per search (≈ 4.5° apart). */
export const FAN_SIZE = 37
/** The run's row from which each chip's spotlight may play (after run 11:
 *  "a few rows in, spaced out" — the first minute is the FTUE's, row 10 the
 *  first boss's). */
export const UPGRADE_SPOT_ROWS: Readonly<Record<UpgradeSpotKind, number>> = { speed: 12, luck: 17, bounty: 22 }
/** Volleys between a chip spotlight and any other lesson or spotlight — the
 *  proactive lessons' own LESSON_GAP, so when both are due the spotlight
 *  (earlier in the order) wins instead of the combo lesson re-arming first. */
export const SPOT_GAP = LESSON_GAP
/** A due spotlight waits this long into the aim phase (the march settles, the
 *  launcher lands), ms. */
export const SPOT_DELAY_MS = 380
/** Budget per idle slice, ms. A trial stops MID-VOLLEY when it runs out
 *  (measured at 4× CPU throttle: one 20-ball volley took up to 74 ms whole). */
const SLICE_MS = 6

const SAVING_SKILLS: ReadonlySet<SkillId> = new Set(['meteor', 'execute', 'heal', 'shield'])

// ─── Persistence ─────────────────────────────────────────────────────────────
interface CoachSave {
  v: 1
  shown: Partial<Record<ExposureId, number>>
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

/** Merges that get the lightbox on every profile (then discoveries only). */
export const MERGE_BOX_FIRST = 3
/** Best row past which a save without a merge-lightbox count has merged far
 *  more than MERGE_BOX_FIRST times already (the first boss sits at row 10). */
const MERGE_BOX_VETERAN_ROW = 10

const readSave = (): CoachSave => {
  const raw = getState<Partial<CoachSave> | null>(EB_COACH_KEY, null)
  const best = count(getState(EB_BEST_ROW_KEY, 0))
  if (!raw || raw.v !== 1) {
    const shown: Partial<Record<ExposureId, number>> = best > VETERAN_ROW
      ? {
          survive: MAX_SHOWS.survive, tray: MAX_SHOWS.tray, trayIntro: MAX_SHOWS.trayIntro,
          mergeBox: MERGE_BOX_FIRST, pickupBox: 1, threatBox: 1
        }
      : best > MERGE_BOX_VETERAN_ROW ? { mergeBox: MERGE_BOX_FIRST, pickupBox: 1 } : {}
    return { v: 1, shown, kinds: migrated() }
  }
  const shown: Partial<Record<ExposureId, number>> = {}
  for (const id of EXPOSURE_IDS) {
    const n = count(raw.shown?.[id])
    if (n > 0) shown[id] = n
  }
  // A save from before the lightbox: its routine merges are long behind it.
  if (raw.shown?.mergeBox === undefined && best > MERGE_BOX_VETERAN_ROW) shown.mergeBox = MERGE_BOX_FIRST
  // …and it has collected its "+1"s long ago: no first-pickup spotlight.
  if (raw.shown?.pickupBox === undefined && best > MERGE_BOX_VETERAN_ROW) shown.pickupBox = 1
  // A veteran from before the threat spotlight has lost to the countdown.
  if (raw.shown?.threatBox === undefined && best > VETERAN_ROW) shown.threatBox = 1
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
  for (const [k, v] of Object.entries(fresh.shown) as [ExposureId, number][]) shown[k] = Math.max(shown[k] ?? 0, v)
  const kinds = { ...cur.kinds }
  for (const [k, v] of Object.entries(fresh.kinds)) kinds[k] = Math.max(kinds[k] ?? 0, v)
  save.value = { v: 1, shown, kinds }
}
watch(saveDataVersion, rehydrate)
watch(prismState, rehydrate, { deep: false })

export const lessonShown = (id: ExposureId): number => save.value.shown[id] ?? 0

/** Count one more exposure of `id` (the merge lightbox counts its own). */
export const bumpExposure = (id: ExposureId): void => {
  save.value = { ...save.value, shown: { ...save.value.shown, [id]: lessonShown(id) + 1 } }
  persist()
}

/** Badge keys that have done their TAG_TURNS aim phases — the renderer
 *  badges every other non-slime monster. */
export const retiredTags: ComputedRef<ReadonlySet<string>> = computed(() => {
  const out = new Set<string>()
  for (const [k, v] of Object.entries(save.value.kinds)) if (v > TAG_TURNS) out.add(k)
  return out
})

// ─── The live lesson ─────────────────────────────────────────────────────────
export type CoachLesson =
  | { id: 'pull'; seq: number; reason: 'idle' | 'tap' }
  | {
    id: 'combo'
    seq: number
    trial: ShotTrial
    baseline: number
    /** The early first-session showing: an angled wall shot, not a big combo. */
    bank?: boolean
  }
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

/** What the coach overlay acts out right now (null = nothing). */
export const coachLesson = shallowRef<CoachLesson | null>(null)
let lessonSeq = 0
let countedSeq = -1

/** Lessons that act a SHOT out with the ghost finger (FingerDemo). */
export const isShotLesson = (l: CoachLesson | null): boolean =>
  l?.id === 'pull' || l?.id === 'combo' || l?.id === 'survive'

// ─── The shot demo's 20-second rule ──────────────────────────────────────────
/** The shot demo may show: no shot this session yet, or none for
 *  SHOT_QUIET_MS. Read by the FTUE overlay (its aim hand) and the coach. */
export const shotDemoDue = ref(true)
/** Pure form of the rule (`last` = ms of the last shot, null = none yet). */
export const shotDemoAllowed = (last: number | null, now: number): boolean =>
  last === null || now - last >= SHOT_QUIET_MS

// ─── The upgrade funnel ──────────────────────────────────────────────────────
export type FunnelReason = 'damage' | 'boss' | 'breach' | 'gear' | 'rich'
export interface FunnelShow {
  /** New per aim phase: one showing = one aim phase it was on screen. */
  seq: number
  target: UpgradeId
  reason: FunnelReason
}
/** The arrows (+ the paying, pressing hand) on an upgrade chip, or null. */
export const upgradeFunnel = shallowRef<FunnelShow | null>(null)
/** A one-shot pulse of the glowing chip (UpgradeBar plays it per new seq). */
export const chipPulse = shallowRef<{ id: UpgradeId; seq: number } | null>(null)
let funnelSeq = 0
let funnelCounted = -1
let pulseSeq = 0

/** The Damage demo is due: the free Tray Capacity is behind the player, and
 *  Ball Damage — never bought — is affordable now. */
export const damageFunnelDue = (o: {
  mode: GameMode
  freeOffer: boolean
  capacityLevel: number
  damage: Pick<UpgradeView, 'affordable' | 'maxed' | 'level'> | undefined
  shown: number
}): boolean =>
  o.mode === 'endless' && !o.freeOffer && o.capacityLevel >= 1
  && !!o.damage && o.damage.affordable && !o.damage.maxed && o.damage.level === 0
  && o.shown < ARROW_CAP

/** The rich-wallet funnel is due (checked as an aim phase opens): the wallet
 *  holds RICH_MULT× the glowing chip's price, nothing was bought for
 *  RICH_IDLE_AIMS aim phases, and no funnel was on screen for RICH_EVERY_AIMS.
 *  Endless only. `price` null = nothing glows. */
export const richWalletDue = (o: {
  mode: GameMode
  coins: number
  price: number | null
  aimsSinceBuy: number
  aimsSinceFunnel: number
}): boolean =>
  o.mode === 'endless' && o.price !== null && o.price > 0 && o.coins >= RICH_MULT * o.price
  && o.aimsSinceBuy >= RICH_IDLE_AIMS && o.aimsSinceFunnel >= RICH_EVERY_AIMS

// Session clocks of the funnel (reset by `installCoach`).
/** Aim phases opened this session (the id of the current one). */
let aimNo = 0
/** Aim phases opened since a funnel was last on screen. */
let aimsSinceFunnel = Infinity
/** The aim phase the funnel was last counted on screen, and the clock before
 *  it (an interrupted rich-wallet showing gives its turn back). */
let visibleAim = -1
let aimsBeforeVisible = Infinity

/** Called by the overlay the first frame the funnel is ON SCREEN (once per
 *  showing): the Damage arrows spend one of their ARROW_CAP aim phases, the
 *  boss / breach arrows one of their REARM_AIMS; every showing restarts the
 *  rich wallet's spacing. */
export const noteFunnelVisible = (f: FunnelShow): void => {
  if (f.seq === funnelCounted) return
  funnelCounted = f.seq
  if (f.reason === 'damage') {
    bumpExposure('arrows')
    if (lessonShown('arrows') >= FREE_DAMAGE_AFTER) wiring?.offerFreeDamage?.()
  } else if (f.reason !== 'rich') rearmShown++
  if (visibleAim !== aimNo) {
    aimsBeforeVisible = aimsSinceFunnel
    visibleAim = aimNo
  }
  aimsSinceFunnel = 0
}
let rearm: Exclude<FunnelReason, 'damage' | 'rich'> | null = null
let rearmShown = 0

/** Called by the overlay the first time a lesson is actually ON SCREEN: an
 *  exposure is a lesson the player could see, not one a modal covered. */
export const noteLessonVisible = (lesson: CoachLesson): void => {
  if (lesson.seq === countedSeq) return
  countedSeq = lesson.seq
  const shown = { ...save.value.shown, [lesson.id]: lessonShown(lesson.id) + 1 }
  save.value = { ...save.value, shown }
  persist()
  lastLessonVolley = currentVolleys()
  if (lesson.id !== 'pull') lastTeachVolley = lastLessonVolley
}

// Filled by `installCoach` — module-level so `noteMisfire` (called from the
// scene) and the overlay reach the same wiring.
let wiring: CoachWiring | null = null
let lastLessonVolley = -Infinity
/** …the same, not counting the idle / misfire shot hint (`pull`): playtest
 *  run 12 — it comes back after every 20 s without a shot, and Jonas's six of
 *  them kept the chip spotlights from ever finding their gap. */
let lastTeachVolley = -Infinity
let taps = 0
let pendingTray = false
const currentVolleys = (): number => wiring?.volleys.value ?? 0

/** A due funnel has the ghost hand: the player has fired FUNNEL_HAND_VOLLEYS
 *  volleys (the first shots belong to the shot demos), so the pull and combo
 *  demos yield to it for this aim phase. */
export const funnelOwnsHand = (): boolean =>
  upgradeFunnel.value !== null && currentVolleys() >= FUNNEL_HAND_VOLLEYS

/** `Omit` that keeps a union a union (plain Omit collapses it to the shared keys). */
type LessonDraft = CoachLesson extends infer L ? (L extends CoachLesson ? Omit<L, 'seq'> : never) : never

const setLesson = (l: LessonDraft | null): void => {
  coachLesson.value = l ? ({ ...l, seq: ++lessonSeq } as CoachLesson) : null
}

/** A release that fired nothing: the finger let go on the unit, the board's
 *  only cancel (BarrageBoard `misfire('tap')`) — every other release fires.
 *  Two of them bring the shot demo over whatever lesson is up, unless a shot
 *  landed inside SHOT_QUIET_MS (that player knows the gesture). */
export const noteMisfire = (): void => {
  const w = wiring
  if (!w) return
  if (w.engine.value.state.phase !== 'aim') return
  if (++taps < TAP_MISFIRES || !shotDemoDue.value || !w.ftueDone.value) return
  // A due funnel keeps the hand this aim phase.
  if (funnelOwnsHand()) return
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

/** Monsters in danger — wearing a pip (run 6: the one threshold the floor,
 *  the line and the pips share, `render/danger.ts`): the ones
 *  a rescue shot is for. */
export const threatIds = (s: BoardState): number[] => dangerIds(s)

/** The board is in danger: some monster wears a pip. */
export const inDanger = (s: BoardState): boolean => dangerMarches(s) <= DANGER_PIP_MARCHES

/** The threat spotlight's draft: the monster with the fewest marches to the
 *  line (nearest the unit on a tie) and its march to it — null out of danger. */
export const threatSpotDraft = (s: BoardState): ThreatSpot | null => {
  const next = nextMarchTurn(s)
  if (next < 0) return null
  let best: BoardState['monsters'][number] | null = null
  let bestN = DANGER_PIP_MARCHES + 1
  let bestD = Infinity
  for (const m of s.monsters) {
    if (m.hp <= 0) continue
    const n = marchesToBreach(m, next)
    if (n < 1 || n > DANGER_PIP_MARCHES) continue
    const d = Math.abs(m.col + m.w / 2 - s.launcherX)
    if (n < bestN || (n === bestN && d < bestD)) {
      best = m
      bestN = n
      bestD = d
    }
  }
  if (!best) return null
  const plan = marchPlan(best, next)
  const last = plan[plan.length - 1]
  if (last === undefined || last + best.h <= ROWS) return null
  return { kind: 'threat', monsterId: best.id, plan }
}

/** The walker a bounty spotlight "kills": the one nearest the board's middle. */
const bountyTarget = (s: BoardState): BoardState['monsters'][number] | null => {
  let best: BoardState['monsters'][number] | null = null
  let bestD = Infinity
  for (const m of s.monsters) {
    if (m.kind === 'boss' || m.hp <= 0 || m.row < 0) continue
    const d = Math.hypot(m.col + m.w / 2 - COLS / 2, m.row + m.h / 2 - ROWS * 0.4)
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best
}

/** A chip spotlight's draft from its view: the value now and one level up —
 *  and for bounty the demo kill's coins (null when there is nothing to kill).
 *  Bounty demos the boss when one is on the board: its chest pays 25 kills'
 *  worth, so ×1.2 is a number the eye sees ("+140 → +168"); a lone walker's
 *  "+6 → +7" barely moves. */
export const chipSpotDraft = (kind: UpgradeSpotKind, view: UpgradeView, s: BoardState): UpgradeSpot | null => {
  if (view.maxed || view.nextValue === null) return null
  if (kind !== 'bounty') return { kind, value: view.value, next: view.nextValue }
  const boss = s.monsters.find((m) => m.kind === 'boss' && m.hp > 0 && m.row + m.h > 0)
  const m = boss ?? bountyTarget(s)
  if (!m) return null
  const base = boss ? bossBounty(boss.spawnRow ?? s.row) : killCoins(m.spawnRow ?? s.row, m.kind, m.corrupted)
  return {
    kind,
    value: view.value,
    next: view.nextValue,
    monsterId: m.id,
    coinsNow: Math.max(1, Math.round(base * view.value)),
    coinsNext: Math.max(1, Math.round(base * view.nextValue))
  }
}

export const comboScore = (t: ShotTrial): number => t.hits + t.kills * 0.5

/** The early lesson's shot: angled (neither straight up nor flat), off a SIDE
 *  WALL first — the bank — with the first ball (the one the demo flies)
 *  touching two monsters and the volley killing at least two. */
export const isBankShot = (t: ShotTrial): boolean => {
  const off = Math.abs(t.angle - Math.PI / 2)
  if (off < BANK_MIN_OFF || off > BANK_MAX_OFF) return false
  if (t.kills < BANK_KILLS || t.contacts.length < 4) return false
  const x = t.path[2]
  if (x === undefined) return false
  const wall = BALL_R + 0.25
  return x <= wall || x >= COLS - wall
}

/** Among bank shots: kills, then hits, then closeness to 45° (the angle that
 *  reads as "angled" at a glance). Anything else scores 0, so `pickBest`
 *  settles on a bank whose neighbouring angles are banks too. */
export const bankScore = (t: ShotTrial): number => {
  if (!isBankShot(t)) return 0
  const elev = Math.PI / 2 - Math.abs(t.angle - Math.PI / 2)
  return 100 + t.kills * 10 + t.hits - Math.abs(elev - Math.PI / 4) * 8
}

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
  /** Lifetime volleys (lesson spacing). */
  volleys: Readonly<Ref<number>>
  bestCombo: Readonly<Ref<number>>
  /** The FTUE has handed over (its own overlay owns the first shots). */
  ftueDone: Readonly<Ref<boolean>>
  /** The FTUE's hand is on its upgrade chip (the press beat): the early bank
   *  shot never talks over it. */
  ftuePressBeat?: Readonly<Ref<boolean>>
  capacityLevel: Readonly<Ref<number>>
  /** The glowing PAID upgrade (not the FTUE's free chip), or null. */
  glowingUpgrade?: Readonly<Ref<UpgradeId | null>>
  /** Sum of all upgrade levels — a rise is a purchase. */
  upgradeTotal?: Readonly<Ref<number>>
  /** The five chips (the funnel reads Ball Damage off them). */
  upgrades?: Readonly<Ref<readonly UpgradeView[]>>
  /** The FTUE's free Tray Capacity is still on offer. */
  freeOffer?: Readonly<Ref<boolean>>
  /** Run 8: arm the free first Ball Damage level (FREE_DAMAGE_AFTER ignored
   *  Damage showings). */
  offerFreeDamage?: () => void
  /** The wallet (the rich-wallet funnel weighs it against the glowing price). */
  coins?: Readonly<Ref<number>>
  /** Nothing else owns the screen: no modal, no earned feature flying in, no
   *  coin rain landing in the wallet. A funnel starts only while it holds; if
   *  it breaks during an aim phase the funnel waits for the next calm one. */
  funnelCalm?: Readonly<Ref<boolean>>
  /** The player's best row: past FUNNEL_LAST_ROW the upgrade funnel retires. */
  bestRow?: Readonly<Ref<number>>
  /** Nothing else owns the screen for a spotlight: no modal, unlock, reveal,
   *  coin rain, lightbox, FTUE mark, and no finger on the board. Absent = no
   *  spotlights (tests about other lessons). */
  spotCalm?: Readonly<Ref<boolean>>
  /** SPOT_DELAY_MS by default (tests pass 0). */
  spotDelayMs?: number
  /** Run `fn` when the browser has a moment (tests pass a synchronous runner). */
  schedule?: (fn: () => void) => void
  now?: () => number
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

  // ─── The shot demo: shown unless a shot landed inside SHOT_QUIET_MS ───────
  // No presence gate any more: before the first shot the demo is simply on
  // (that first screen is where it is needed most), and afterwards the quiet
  // clock only ever starts from a shot — a player who is not there never shot.
  let quietTimer: ReturnType<typeof setTimeout> | null = null
  const stopQuiet = (): void => {
    if (quietTimer !== null) clearTimeout(quietTimer)
    quietTimer = null
  }
  const showPullIfDue = (): void => {
    if (!shotDemoDue.value || !w.ftueDone.value) return
    if (w.engine.value.state.phase !== 'aim') return
    // A due funnel owns the hand this aim phase (run 4).
    if (funnelOwnsHand()) return
    // A shot lesson already has the finger; anything else (the tray acts)
    // yields — the player is back and the shot is what they need.
    const cur = coachLesson.value
    if (cur && isShotLesson(cur)) return
    setLesson({ id: 'pull', reason: 'idle' })
  }
  const noteShot = (): void => {
    stopQuiet()
    shotDemoDue.value = false
    quietTimer = setTimeout(() => {
      quietTimer = null
      shotDemoDue.value = true
      showPullIfDue()
    }, SHOT_QUIET_MS)
  }

  const cancelSearch = (): void => { searchToken++ }

  const search = (kind: 'combo' | 'survive' | 'bank'): void => {
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
      // A funnel that turned due while this ran has the hand now (danger
      // still comes first: the survive lesson hides the funnel instead).
      if (kind !== 'survive' && funnelOwnsHand()) return
      const lesson = conclude(kind, trials, threatList, threatHp, eng.state)
      if (lesson) setLesson(lesson)
      // Nothing worth showing here: the shot demo gets the aim, if it is due.
      else showPullIfDue()
    }
    schedule(step)
  }

  /** The lesson a finished search found, or null. */
  const conclude = (
    kind: 'combo' | 'survive' | 'bank', trials: ShotTrial[], threatList: number[], threatHp: number, st: BoardState
  ): LessonDraft | null => {
    if (kind === 'bank') {
      const best = trials[pickBest(trials, bankScore)]
      return best && isBankShot(best)
        ? { id: 'combo', trial: best, baseline: medianOf(trials, (t) => t.hits), bank: true }
        : null
    }
    if (kind === 'combo') {
      const best = trials[pickBest(trials, comboScore)]
      const base = medianOf(trials, (t) => t.hits)
      return best && best.hits >= Math.max(COMBO_MIN_HITS, COMBO_GAIN * Math.max(1, base))
        ? { id: 'combo', trial: best, baseline: base }
        : null
    }
    const best = trials[pickBest(trials, (t) => surviveScore(t, threatHp))]
    if (!best || (best.threatDamage <= 0 && !best.skills.some((k) => SAVING_SKILLS.has(k)))) return null
    let skillAt: { x: number; y: number } | null = null
    for (const p of st.pickups) {
      if (p.kind === 'skill' && p.skill && SAVING_SKILLS.has(p.skill) && best.skills.includes(p.skill)) {
        skillAt = { x: p.col + 0.5, y: p.row + 0.5 }
        break
      }
    }
    return { id: 'survive', trial: best, threats: threatList, skillAt }
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

  // ─── Spotlights (lessonSpotlight.ts) ─────────────────────────────────────
  let lastSpotVolley = -Infinity
  /** A boss arrived or fell: the next aim phase is its moment, no spotlight. */
  let bossEventPending = false
  let quietAim = -1
  let spotTimer: ReturnType<typeof setTimeout> | null = null
  const stopSpotTimer = (): void => {
    if (spotTimer !== null) clearTimeout(spotTimer)
    spotTimer = null
  }
  const spotDelay = w.spotDelayMs ?? SPOT_DELAY_MS
  const spotCalmNow = (): boolean => !!w.spotCalm?.value && canSpot()
  /** Volleys since the last lesson (the shot hint aside) or spotlight on screen. */
  const sinceAnyLesson = (): number => currentVolleys() - Math.max(lastTeachVolley, lastSpotVolley)
  const bossEnraged = (s: BoardState): boolean => s.monsters.some((m) => m.kind === 'boss' && m.enraged)

  /** The next chip spotlight due (UPGRADE_SPOT_ROWS order), or null. */
  const upgradeSpotDraft = (s: BoardState): UpgradeSpot | null => {
    for (const kind of ['speed', 'luck', 'bounty'] as const) {
      if (lessonShown(spotExposure(kind)) > 0 || s.row < UPGRADE_SPOT_ROWS[kind]) continue
      const view = w.upgrades?.value.find((v) => v.id === kind)
      // A chip the player bought is a chip they know.
      if (!view || view.level > 0) continue
      const d = chipSpotDraft(kind, view, s)
      if (d) return d
    }
    return null
  }

  /** Play `draft` SPOT_DELAY_MS into this aim phase, if the calm still holds
   *  then; otherwise this aim's other lessons run (`fallback`). `after` runs
   *  when it ends inside the same aim phase. */
  const trySpot = (draft: ThreatSpot | UpgradeSpot, after: (() => void) | null, fallback: () => void): void => {
    const aim = aimNo
    const gen = w.engineGen.value
    const same = (): boolean => aim === aimNo && gen === w.engineGen.value && w.engine.value.state.phase === 'aim'
    const go = (): void => {
      spotTimer = null
      if (!same()) return
      if (!spotCalmNow() || !offerSpot(draft, () => { if (same()) after?.() })) {
        fallback()
        return
      }
      bumpExposure(spotExposure(draft.kind))
      lastSpotVolley = currentVolleys()
    }
    stopSpotTimer()
    if (spotDelay <= 0) go()
    else spotTimer = setTimeout(go, spotDelay)
  }

  // ─── The upgrade funnel ──────────────────────────────────────────────────
  /** Aim phases started since the last purchase (the pulse's "a while"). */
  let aimsSinceBuy = 0
  /** The aim phase that opened with a rich wallet (its showing lasts that aim). */
  let richAim = -1
  /** The calm broke during this aim phase (a modal, an unlock, a coin rain):
   *  no funnel until the next calm aim phase. */
  let funnelHeld = false
  aimNo = 0
  aimsSinceFunnel = Infinity
  visibleAim = -1
  aimsBeforeVisible = Infinity
  const calmNow = (): boolean => w.funnelCalm?.value ?? true
  /** Past FUNNEL_LAST_ROW (best row or this run's) the player knows coins buy
   *  power: no arrows, no hand, no pulse any more. */
  const funnelRetired = (): boolean =>
    Math.max(w.bestRow?.value ?? 0, w.engine.value.state.row) > FUNNEL_LAST_ROW
  const damageView = (): UpgradeView | undefined => w.upgrades?.value.find((v) => v.id === 'damage')
  /** The chip the boss / breach arrows point at: the glowing one — which is
   *  the FREE Tray Capacity while that is still on offer. */
  const glowTarget = (): UpgradeId | null =>
    (w.freeOffer?.value ?? false) ? 'capacity' : (w.glowingUpgrade?.value ?? null)
  /** Weighed as an aim phase opens (the wallet only grows mid-aim from a
   *  chest or a gift — and their coin rain holds the funnel anyway). */
  const richNow = (): boolean => {
    const glowing = w.glowingUpgrade?.value ?? null
    const view = glowing ? w.upgrades?.value.find((v) => v.id === glowing) : undefined
    return richWalletDue({
      mode: w.mode.value,
      coins: w.coins?.value ?? 0,
      price: view && !view.maxed ? view.cost : null,
      aimsSinceBuy,
      aimsSinceFunnel
    })
  }

  /** Decide what the funnel shows. `fresh`: a new aim phase, so a new showing
   *  even when it points at the same chip for the same reason. */
  const evaluateFunnel = (fresh: boolean): void => {
    let next: Omit<FunnelShow, 'seq'> | null = null
    if (w.mode.value === 'endless' && w.ftueDone.value && w.engine.value.state.phase === 'aim' && !funnelHeld && !funnelRetired()) {
      const damage = damageFunnelDue({
        mode: w.mode.value,
        freeOffer: w.freeOffer?.value ?? false,
        capacityLevel: w.capacityLevel.value,
        damage: damageView(),
        shown: lessonShown('arrows')
      })
      if (damage) next = { target: 'damage', reason: 'damage' }
      else if (rearm && rearmShown >= REARM_AIMS) rearm = null
      if (!next && rearm) {
        const target = glowTarget()
        if (target) next = { target, reason: rearm }
      }
      if (!next && richAim === aimNo && aimsSinceBuy >= RICH_IDLE_AIMS) {
        const target = w.glowingUpgrade?.value ?? null
        if (target) next = { target, reason: 'rich' }
      }
    }
    const cur = upgradeFunnel.value
    if (!next) {
      if (cur) upgradeFunnel.value = null
      return
    }
    if (!fresh && cur && cur.target === next.target && cur.reason === next.reason) return
    upgradeFunnel.value = { ...next, seq: ++funnelSeq }
    // The funnel takes the ghost hand: a shot demo on screen steps aside.
    const l = coachLesson.value
    if (funnelOwnsHand() && (l?.id === 'pull' || l?.id === 'combo')) {
      cancelSearch()
      setLesson(null)
    }
  }

  /** Something else took the screen mid-aim: the funnel goes and waits for
   *  the next calm aim phase. A rich-wallet showing cut short gives its turn
   *  back (it comes back then, whatever the spacing). */
  const holdFunnel = (): void => {
    funnelHeld = true
    const cur = upgradeFunnel.value
    if (cur?.reason === 'rich' && visibleAim === aimNo) aimsSinceFunnel = aimsBeforeVisible
    if (cur) upgradeFunnel.value = null
  }

  /** An aim phase that opens with something to buy, and no purchase for a
   *  while: the glowing chip pulses once (the arrows, when up, say it louder). */
  const pulseIfIdle = (): void => {
    if (w.mode.value !== 'endless' || !w.ftueDone.value || upgradeFunnel.value || funnelRetired()) return
    const glowing = w.glowingUpgrade?.value ?? null
    if (glowing && aimsSinceBuy >= PULSE_AFTER_AIMS) chipPulse.value = { id: glowing, seq: ++pulseSeq }
  }

  const onAim = (): void => {
    const s = w.engine.value.state
    cancelSearch()
    setLesson(null)
    countTags(s)
    aimsSinceBuy++
    aimNo++
    aimsSinceFunnel++
    stopSpotTimer()
    if (bossEventPending) {
      quietAim = aimNo
      bossEventPending = false
    }
    // Not calm as the aim opens (a modal up, an unlock flying in): this aim
    // phase has no funnel.
    funnelHeld = !calmNow()
    richAim = richNow() ? aimNo : -1
    evaluateFunnel(true)
    pulseIfIdle()
    aimLessons(s)
  }

  /** Every lesson, in priority order. `spots: false` = none this time (a
   *  spotlight fell through); `afterThreat`: the threat spotlight just ended —
   *  its rescue shot comes now. */
  const aimLessons = (s: BoardState, o: { spots?: boolean; afterThreat?: boolean } = {}): void => {
    // The early bank shot rides the FTUE's own aim beats on the engine's
    // first-session board (easy monsters, the scripted "+1" straight up — which
    // is auto-collected whatever the aim, so no beat is lost by angling). The
    // FTUE overlay steps aside for it (TutorialOverlay). It is the combo
    // lesson's first showing: a player who has seen one never gets it.
    if (
      s.config.ftue && w.mode.value === 'endless' && BANK_TURNS.includes(s.turn)
      && !(w.ftuePressBeat?.value ?? false) && lessonShown('combo') === 0
    ) {
      search('bank')
      return
    }
    if (!w.ftueDone.value) return
    if (w.mode.value !== 'endless') {
      pendingTray = false
      showPullIfDue()
      return
    }
    const spots = (o.spots ?? true) && spotCalmNow() && aimNo !== quietAim
    const rest = (): void => aimLessons(w.engine.value.state, { spots: false })
    // The countdown on the launcher, staged the first time one shows (run 11).
    if (spots && inDanger(s) && lessonShown('threatBox') === 0) {
      const d = threatSpotDraft(s)
      if (d) {
        trySpot(d, () => aimLessons(w.engine.value.state, { spots: false, afterThreat: true }), rest)
        return
      }
    }
    const sinceLesson = currentVolleys() - lastLessonVolley
    if (inDanger(s) && lessonShown('survive') < MAX_SHOWS.survive && (o.afterThreat || sinceLesson >= SURVIVE_GAP)) {
      search('survive')
      return
    }
    if (o.afterThreat) return
    // The funnel owns the upgrade row this aim: the tray acts (which press
    // Tray Capacity themselves) wait for an aim without it — a spill stays
    // pending, the intro keeps its turn.
    if (!upgradeFunnel.value) {
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
    }
    // A chip nobody could explain (run 11), spaced out and never in danger.
    if (spots && !inDanger(s) && !upgradeFunnel.value && !bossEnraged(s) && sinceAnyLesson() >= SPOT_GAP) {
      const d = upgradeSpotDraft(s)
      if (d) {
        trySpot(d, null, rest)
        return
      }
    }
    // Past the first shots, a due funnel has the ghost hand this aim phase:
    // its full form plays (coins in, the hand presses the chip), no shot demo.
    if (funnelOwnsHand()) return
    if (
      sinceLesson >= LESSON_GAP
      && w.bestCombo.value < COMBO_GRADUATE
      && lessonShown('combo') < MAX_SHOWS.combo
    ) {
      search('combo')
      return
    }
    showPullIfDue()
  }

  offs.push(w.onEngineEvent((e) => {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'aim') onAim()
        else {
          stopSpotTimer()
          cancelSearch()
          if (coachLesson.value) setLesson(null)
          if (upgradeFunnel.value) upgradeFunnel.value = null
        }
        break
      case 'fire':
        taps = 0
        stopSpotTimer()
        cancelSearch()
        noteShot()
        setLesson(null)
        upgradeFunnel.value = null
        break
      case 'trayOverflow':
        pendingTray = true
        break
      // The two moments a wallet fills up (a bounty) or a player is ready to
      // rethink (a restart): the arrows come back on the glowing chip.
      case 'bossDefeated':
        rearm = 'boss'
        rearmShown = 0
        bossEventPending = true
        break
      // Run 6: a boss arriving while the wallet can pay for the glowing chip
      // (the arrows only show when something glows, i.e. is affordable).
      case 'bossSpawn':
        rearm = 'gear'
        rearmShown = 0
        bossEventPending = true
        break
      case 'breach':
        rearm = 'breach'
        rearmShown = 0
        break
      default:
        break
    }
  }))

  // A new board (restart, daily, hydrate) makes everything in flight stale.
  offs.push(watch(() => w.engineGen.value, () => {
    stopSpotTimer()
    cancelSearch()
    setLesson(null)
    pendingTray = false
    if (w.engine.value.state.phase === 'aim') onAim()
    else upgradeFunnel.value = null
  }))
  // The tray lesson retires the moment its advice is taken.
  offs.push(watch(() => w.capacityLevel.value, (lvl, was) => {
    if (lvl > was && coachLesson.value?.id === 'tray') setLesson(null)
  }))
  // A purchase: the pulse clock starts over, the boss / breach arrows have
  // done their job, and bought Damage retires its demo for good. Run 6: the
  // funnel then waits for the NEXT aim phase — Mia claimed the free Tray
  // Capacity and the Damage arrows + coin flight started that very instant,
  // so she read them as the answer to her tap ("the first tap only arms it")
  // and never noticed the level she got. The purchase's own payoff is the only
  // answer on screen now.
  if (w.upgradeTotal) {
    offs.push(watch(w.upgradeTotal, (n, was) => {
      if (!(n > was)) return
      aimsSinceBuy = 0
      rearm = null
      funnelHeld = true
      if (upgradeFunnel.value) upgradeFunnel.value = null
    }))
  }
  // Damage turning affordable mid-aim shows the arrows right away, not one
  // volley later — unless the calm broke (a chest's coin rain, a gift modal):
  // then the next calm aim phase.
  offs.push(watch(
    () => [w.upgrades?.value, w.freeOffer?.value, w.glowingUpgrade?.value, w.ftueDone.value],
    () => evaluateFunnel(false)
  ))
  // Synchronously: the coin rain / modal / unlock must not share a frame with it.
  if (w.funnelCalm) {
    offs.push(watch(w.funnelCalm, (calm) => {
      if (!calm && !funnelHeld && w.engine.value.state.phase === 'aim') holdFunnel()
    }, { flush: 'sync' }))
  }

  if (w.engine.value.state.phase === 'aim') onAim()

  return () => {
    for (const off of offs) off()
    stopSpotTimer()
    cancelSearch()
    stopQuiet()
    setLesson(null)
    upgradeFunnel.value = null
    if (wiring === w) wiring = null
  }
}

// ⚠️ DEV-ONLY: browser checks read the live coach + run through the app's own
// module instance (an import from a CDP script can land on a stale HMR copy).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__coach = {
    lesson: () => coachLesson.value,
    funnel: () => upgradeFunnel.value,
    ownsHand: () => funnelOwnsHand(),
    shotDemoDue: () => shotDemoDue.value,
    engine: () => wiring?.engine.value ?? null,
    retired: () => [...retiredTags.value],
    shown: (id: ExposureId) => lessonShown(id),
    /** Stage a spotlight now, off the live board (visual checks). */
    spot: (kind: SpotKind): boolean => {
      const st = wiring?.engine.value.state
      if (!st) return false
      if (kind === 'threat') {
        const d = threatSpotDraft(st)
        return !!d && offerSpot(d)
      }
      const view = wiring?.upgrades?.value.find((v) => v.id === kind)
      const d = view ? chipSpotDraft(kind, view, st) : null
      return !!d && offerSpot(d)
    }
  }
}
