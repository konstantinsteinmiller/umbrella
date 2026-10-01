/**
 * Monster roster, HP curve and the row generator. Pure data + planning; the
 * engine turns a RowPlan into Monster/Pickup objects with ids.
 */
import type { BossKind, MonsterKind, SkillId } from './types'
import { BOSS_EVERY, COLS } from './types'
import { Rng, mixSeed } from './rng'

export type WalkerKind = Exclude<MonsterKind, 'boss'>

export const WALKER_KINDS: readonly WalkerKind[] = [
  'slime', 'goblin', 'caterpillar', 'ogre', 'dryad', 'centaur', 'imp', 'treant', 'carbuncle', 'cyclops'
]

/** CONTRACT §2 unlock rows. The last four sit between bosses, past the row-30
 *  gate, so a returning player keeps meeting something new. */
export const KIND_UNLOCK_ROW: Record<WalkerKind, number> = {
  slime: 1, goblin: 6, caterpillar: 12, ogre: 18, dryad: 25, centaur: 32,
  imp: 36, treant: 44, carbuncle: 52, cyclops: 58
}

export const KIND_HP_MULT: Record<MonsterKind, number> = {
  slime: 1, goblin: 1, caterpillar: 1.6, ogre: 2, dryad: 1, centaur: 1,
  imp: 1, treant: 2.5, carbuncle: 1.2, cyclops: 1.4, boss: 14
}

const KIND_WEIGHT: Record<WalkerKind, number> = {
  slime: 6, goblin: 2.5, caterpillar: 1.5, ogre: 1.5, dryad: 1, centaur: 1,
  imp: 1.3, treant: 1, carbuncle: 1, cyclops: 0.9
}

// ─── The four late walkers' rules (engine.ts applies them) ───────────────────
/** A defeated imp splits into up to two little imps with this share of its max HP… */
export const IMP_MINI_HP = 0.35
/** …each worth this share of an imp's kill coins. */
export const IMP_MINI_COINS = 0.35

/** A cyclops charges (marches two rows) at the advance of turns where this
 *  holds — every other turn, staggered by id like the centaur's spit. `turn`
 *  is the value `state.turn` has during that advance (fire() bumps it, so
 *  while aiming the next advance is `state.turn + 1`). */
export const chargesAt = (m: { kind: MonsterKind; id: number }, turn: number): boolean =>
  m.kind === 'cyclops' && (turn + m.id) % 2 === 0

/** A treant rests (does not march) at the advance of turns where this holds —
 *  the other half of its turns. Same `turn` convention as `chargesAt`. */
export const restsAt = (m: { kind: MonsterKind; id: number }, turn: number): boolean =>
  m.kind === 'treant' && (turn + m.id) % 2 === 1

export const CORRUPT_FROM_ROW = 40
export const CORRUPT_HP_MULT = 1.8
/** Corrupted bosses (second lap of the roster) — softer than a walker's ×1.8,
 *  a boss already carries ×14. */
export const CORRUPT_BOSS_HP_MULT = 1.35

export const BOSS_ORDER: readonly BossKind[] = ['slime-tower', 'worm', 'fire-dragon', 'silver-dragon', 'troll', 'orc']

export const footprint = (kind: MonsterKind): { w: number; h: number } =>
  kind === 'boss' ? { w: 3, h: 3 } : kind === 'caterpillar' ? { w: 2, h: 1 } : { w: 1, h: 1 }

export const bossForRow = (row: number): { bossKind: BossKind; corrupted: boolean } => {
  const idx = Math.max(0, Math.floor(row / BOSS_EVERY) - 1)
  return { bossKind: BOSS_ORDER[idx % BOSS_ORDER.length]!, corrupted: idx >= BOSS_ORDER.length }
}

export const isBossRow = (row: number): boolean => row > 0 && row % BOSS_EVERY === 0

export const corruptChance = (row: number): number =>
  row < CORRUPT_FROM_ROW ? 0 : Math.min(0.4, 0.08 + (row - CORRUPT_FROM_ROW) * 0.006)

// ─── Row HP ──────────────────────────────────────────────────────────────────
// Row HP is read off the HP CLOCK (`hpRow`, see below), not the row counter.
// Up to `knee` it is MIW's wave shape (linear × gentle exponential) — the soft
// ramp into the first boss. Past it, plain exponentials: `mid` per clock row up
// to `lateRow`, `late` after.
// Playtest run 3 ("hp-cliff"): the old curve (1.185 growth × the linear factor
// up to row 24) went 17 → 73 → 181 → 280 at rows 10/16/20/22 — ×10.6 from row
// 10 to 20 — while a first-timer's power grew ×1.25–1.56 (capacity 3–4, trays
// like [4,3,2], one purchase every ~5 turns). Every tester hit a wall within
// five rows of the first boss. Now (clock rows): 17 at 10, ×1.15 a row to 51
// at 18 (a first-timer's power grows ~×3 over those rows — run-3 telemetry),
// then ×1.25 a row: 79 at 20, 242 at 25, 738 at 30, 6,877 at 40. With the
// clock held ~5 rows per boss, a veteran meets clock 30 around row 50 and 40
// around row 62 — about the old HP there, so the late game keeps its pressure.
// The first-session gate is the row-20 boss, not a walker wall.
// Playtest run 5: the row-20 boss at ×45 showed 792–1,100 HP right after the
// scripted first boss's 57 ("a 20x jump in one step"; the low-buying humanlow
// bot won it first try in 2 of 24 runs). The bosses are now a LADDER, each step
// ≤ ~6× in the HP a first-timer sees: the scripted first boss ×15 × 0.32 (65),
// the endless run's second ×15 (~400: a typical fight of ~8 turns, humanlow
// first try ~4 in 5, the second try with boss mercy near-certain), its third
// ×40 (~2,100), from the fourth on ×45 (~8,700) — and the Daily keeps ×45 past
// its first boss (see `bossHpFactor`).
// Run-3 pass, sim before → after (24 seeds, medians; full tables in the sim's header):
//   human   walker pressure rows 16–20 vs 6–10 5.57× → 1.33×, post/pre-first-
//           boss HP 4.61 → 1.13, first breach row 31 → 31 (the row-20 boss,
//           not the wall), row-30 boss killed @turn 165 → 90, best row 40 → 64
//   noup    first breach row 26 → 29 · random 28 → 30, best row 37 → 62
//   casual  first breach row 35 → 60, best row 63 → 83, breaches 11 → 9
// Late-game pass ("from row 40+ it gets really hard to defeat everything
// unless you land very lucky combos"): past clock `deepRow` (24 — a typical
// run's row 40) the curve grows `deep` (×1.18) a clock row instead of ×1.25:
// 523 at 30, 2,735 at 40, 74,914 at 60 (was 738 / 6,877 / 596,446). With the
// late kill coins, Tempo's damage and momentum, a buying player's volley still
// removes about half a walker board to row ~130 (before: 51% → 18% from rows
// 41–50 to 101–130). The Daily keeps ×1.25 (`rowHp(h, true)`).
// Challenge pass after run 8 ("the overall tuning was too much to the easy
// side — challenging, but not a quick death"; nobody lost in 3 min): `mid`
// 1.15 → 1.22 with `late` 1.25 → 1.156, so the mid game (clock 11–23, rows
// ~20–40) carries up to 1.6× the HP (clock 18) and the curve meets its old
// self again at clock 24 — the late game is unchanged. The Daily keeps its
// own `dailyMid` / `dailyLate` (its fixed kit is tuned to them).
// Early-challenge pass ("the normal early enemies up to row 30 are no
// challenge at all, they all stay at row 1 or 2 from the top and are
// instantly destroyed"). The sim's `life` line measured it: a walker of rows
// 6–30 spawned with 2–37 HP against a tray dealing 13–100 a ball round
// (humanlow: HP ÷ tray power 0.13 at rows 6–10, 0.27 at 11–20, 0.43 at 21–30)
// — Instant Barrage's sockets and the "+1"s grow the tray ~×4 by row 10, while
// the clock holds (the row-5 FTUE boss, the row-20 fight, the plateaus) left
// it 5 / 8 / 13 rows behind the row; the safety net's 20% cut is small beside
// that. So 84–94% of the kills took one or two volleys. Now an endless WALKER
// carries `walkerLift` (×10, `walkerLift()`): ×1.8 / 3.2 / 5.6 / 10 at clock
// 1–4, fading geometrically to exactly ×1 at clock `liftTo` 24 — the late
// game, every boss (the ladder's HP is untouched), the FTUE rows and the Daily
// keep the curve. Sim, 40 seeds × 120 turns, rows 6–10 / 11–20 / 21–30, rows
// descended median/p90 · killed within 2 volleys, before → after:
//   humanlow 0/1 · 0/1 · 0/2, 93/93/84% → 1/3 · 1/3 · 1/4, 55/51/38%
//   noup     0/2 · 0/2 · 1/3, 82/85/66% → 2/5 · 2/5 · 3/5, 29/31/20% (danger zone 2–6%)
//   first breach row humanlow 50 → 60, noup 40 → 41, tapper 39 → 30; row-20
//   boss first try humanlow 40/40 → 40/40 (full tables in the sim's header).
// Constants tuned by scripts/barrage-sim.mjs (see its header for the targets
// and the before → after numbers). Mutable only so the sim can sweep it
// in-process; the game never writes it.
export const HP_CURVE = {
  base: 0.36,
  growth: 1.185,
  /** Clock row where the MIW shape hands over to the exponentials. */
  knee: 10,
  /** Growth per clock row from `knee` to `lateRow`. */
  mid: 1.22,
  lateRow: 18,
  /** Growth per clock row past `lateRow`… */
  late: 1.156,
  /** The Daily board's mid / late growth (the pre-challenge-pass curve). */
  dailyMid: 1.15,
  dailyLate: 1.25,
  /** …up to clock row `deepRow` (a typical run's row ~40), then `deep` per
   *  clock row — the late-game pass (see the comment block above). */
  deepRow: 24,
  deep: 1.18,
  /** Boss HP = boss × rowHp (CONTRACT §2: ≈14) for the run's first boss… */
  boss: 15,
  /** …bossSecond × rowHp for the endless run's SECOND boss (the row-20 worm,
   *  spawning in rows 20–29): the first session's gate, sized for the player
   *  who reaches it then (playtest run 5: ×45 read as a wall)… */
  bossSecond: 20,
  /** …bossThird × rowHp for its THIRD (the row-30 fire dragon, rows 30–39),
   *  the ladder's middle step… */
  bossThird: 40,
  /** …and bossLater × rowHp for every later one (and every Daily boss past
   *  the first: its fixed kit is tuned against this one). */
  bossLater: 45,
  /** The FTUE's Slime Tower is the scripted first win (CONTRACT §7). Run 5:
   *  0.28 → 0.32 (57 → 65 HP with the safety net). Challenge pass (run 8: an
   *  8-ball tray one-shot it): 0.5, and the adaptive floor (`BOSS_ADAPT`)
   *  sizes it to the tray it meets — a 6–7-volley fight, lost now and then. */
  ftueBoss: 0.5,
  /** Rows after a boss kill that spawn at the clock the boss had (the
   *  post-boss plateau; the kill's own quiet turn spawns nothing — except
   *  after the run's first boss, where it brings the first of them in place). */
  plateau: 2,
  /** Rows of a LATER boss fight that hold the clock (the first boss's whole
   *  fight holds it). Uncapped, a first-timer's 6–8-row boss fights froze HP
   *  for most of every 10 rows and the late game lost all pressure. */
  fightHold: 3,
  /** Rows a typical boss row + fight + plateau holds the clock — the clock a
   *  fresh board starts from (`hpClockAt`: checkpoint restarts, old saves). */
  bossHold: 5,
  /** Early-challenge pass: an endless WALKER (not a boss, not an FTUE row,
   *  not the Daily) carries up to `walkerLift` × its row HP — ×1 up to clock
   *  row `liftFrom`, rising geometrically to the full lift at `liftFull`, then
   *  fading geometrically to ×1 at `liftTo` (see `walkerLift` and the comment
   *  block above). */
  walkerLift: 10,
  liftFrom: 0,
  liftFull: 4,
  liftTo: 24
}

/** The early-challenge lift on an endless walker spawned at clock `hpRow`: a
 *  geometric tent — 1 up to `liftFrom`, `walkerLift` at `liftFull`, exactly 1
 *  again from `liftTo` on (the late game keeps its curve). */
export const walkerLift = (hpRow: number): number => {
  const { walkerLift: peak, liftFrom, liftFull, liftTo } = HP_CURVE
  if (!(peak > 1) || hpRow <= liftFrom || hpRow >= liftTo) return 1
  if (hpRow <= liftFull) return Math.pow(peak, (hpRow - liftFrom) / Math.max(1, liftFull - liftFrom))
  return Math.pow(peak, (liftTo - hpRow) / Math.max(1, liftTo - liftFull))
}

/** Unrounded row HP at clock row `h` (`daily`: no `deep` segment). */
const rawRowHp = (h: number, daily: boolean): number => {
  const c = HP_CURVE
  if (h <= c.knee) return c.base * h * Math.pow(c.growth, h - 1)
  const mid = Math.min(h, c.lateRow) - c.knee
  const lateFrom = Math.max(c.lateRow, c.knee)
  const deepFrom = daily ? Number.POSITIVE_INFINITY : Math.max(c.deepRow, lateFrom)
  const late = Math.max(0, Math.min(h, deepFrom) - lateFrom)
  const deep = Math.max(0, h - deepFrom)
  return c.base * c.knee * Math.pow(c.growth, c.knee - 1) * Math.pow(daily ? c.dailyMid : c.mid, Math.max(0, mid)) *
    Math.pow(daily ? c.dailyLate : c.late, late) * Math.pow(c.deep, deep)
}

/** Base HP of a slime spawned at HP-clock row `hpRow` (before kind / corrupted
 *  multipliers). Before the first boss the clock equals the row counter.
 *  `daily`: the Daily board, whose clock is the row itself — it keeps `late`
 *  past `deepRow` (its fixed-kit sprint ends around rows 30–40 by design). */
export const rowHp = (hpRow: number, daily = false): number => Math.max(1, Math.round(rawRowHp(Math.max(1, hpRow), daily)))

// ─── The HP clock ────────────────────────────────────────────────────────────
// Playtest run 3: HP kept climbing with every row spawned during a boss fight,
// so the grunts after a boss came back several rows stronger than the ones
// before it ("46 → 93 → 232"). The engine keeps `hpRow` apart from `row`.
// Each spawned row advances it by one, except these, which hold it:
//   • a boss's own row — its walkers stay at the last clock row, the boss
//     itself takes the next one (`hpRow + 1`);
//   • the whole fight against the run's first boss (no walkers come then);
//   • the first `fightHold` rows of a later boss fight — uncapped, a first-
//     timer's 6–8-row fights froze HP for most of every 10 rows and no curve
//     kept late pressure without a wall;
//   • the `plateau` rows spawned right after a boss kill.
// Daily Barrage (a fixed-kit sprint, no checkpoints) does not hold it: its
// clock is the row counter itself, bosses included (engine.ts).
// So the monsters after a boss come back at the strength they had before it,
// and the clock carries on continuously from there. Coins (`killCoins`,
// bounty) and everything else (kinds, bosses, corruption) stay on the real
// row. Nothing here touches the RNG.
/** The HP clock of the first row of a FRESH board at `row` (checkpoint
 *  restart, dev jump, a save from before the clock existed), modelled on a
 *  typical run in which every boss row + fight + plateau held the clock for
 *  `bossHold` rows: `clock` is the row's HP clock, `hold` how many rows after
 *  it that typical run still holds it. Continuous in `row`. */
export const hpClockAt = (row: number): { clock: number; hold: number } => {
  const r = Math.max(1, Math.floor(row))
  const window = Math.max(1, Math.round(HP_CURVE.bossHold))
  let held = 0
  let hold = 0
  for (let b = BOSS_EVERY; b <= r; b += BOSS_EVERY) {
    const into = r - b + 1
    held += Math.min(window, into)
    hold = Math.max(0, window - into)
  }
  return { clock: r - held, hold }
}

/** FTUE rows stay one- to three-hit so the first minute is all kills. */
export const FTUE_HP_ROWS = 5
export const FTUE_HP_CAP = 3

// ─── Safety net (config.assist) ──────────────────────────────────────────────
// Playtest run 2: no blind tester found the paid upgrades, their power stayed
// flat and 3 of 4 were overrun at rows 15–19. While the state layer flags a
// non-upgrader, rows spawn softer — bosses too, the first one included — so
// the player lives long enough to meet the upgrade bar.
// Playtest run 3: it used to switch off at the 2nd paid upgrade and stop dead
// at row 30, so monsters jumped ~25% the moment the player got stronger. Now
// both ends fade: the state layer feeds `assistForPaidLevels(paid)` (economy)
// and the cut fades out over clock rows `fadeFrom` → `fadeTo`.
// Mutable only so the sim can sweep it in-process.
export const ASSIST = {
  /** HP cut at full assist. */
  cut: 0.2,
  /** Full cut up to this clock row… */
  fadeFrom: 20,
  /** …none from this one (linear in between). */
  fadeTo: 40
}
export const ASSIST_HP_CUT = ASSIST.cut

/** HP multiplier the safety net applies to a monster spawned at clock `hpRow`. */
export const assistHpMult = (hpRow: number, assist: number | undefined): number => {
  const a = assist !== undefined && assist > 0 ? Math.min(1, assist) : 0
  if (a <= 0) return 1
  const { cut, fadeFrom, fadeTo } = ASSIST
  const fade = hpRow <= fadeFrom ? 1 : hpRow >= fadeTo ? 0 : (fadeTo - hpRow) / Math.max(1, fadeTo - fadeFrom)
  return 1 - cut * a * fade
}

/** HP of a monster spawned at HP-clock row `hpRow`. A boss gets the FIRST
 *  boss's multiplier unless `bossMult` gives its own (see `bossHp`).
 *  `daily`: the Daily's curve (`rowHp`). */
export const monsterHp = (
  hpRow: number, kind: MonsterKind, corrupted: boolean, ftue = false, assist = 0, bossMult: number = HP_CURVE.boss, daily = false
): number => {
  const kindMult = kind === 'boss' ? bossMult : KIND_HP_MULT[kind]
  const mult = kindMult * (corrupted ? (kind === 'boss' ? CORRUPT_BOSS_HP_MULT : CORRUPT_HP_MULT) : 1)
  // The early-challenge lift: endless walkers past the FTUE only — bosses,
  // FTUE rows and the Daily keep the curve.
  const lift = kind === 'boss' || ftue || daily ? 1 : walkerLift(hpRow)
  // Same product order as before the safety net (× 1 is exact), so no HP
  // without it moves by a rounding step.
  const hp = Math.max(1, Math.round(rowHp(hpRow, daily) * mult * (ftue && kind === 'boss' ? HP_CURVE.ftueBoss : 1) * assistHpMult(hpRow, assist) * lift))
  if (ftue && kind !== 'boss' && hpRow <= FTUE_HP_ROWS) return Math.min(hp, hpRow === 1 ? 1 : FTUE_HP_CAP)
  return hp
}

/**
 * The run's FIRST boss (the row-10 Slime Tower, or a row or two later when
 * there was no room for it). While it lives, new rows bring no walkers — the
 * fight is the boss (playtest run 2: grunt rows kept coming, ~17 monsters
 * piled up in front of it and no shot ever reached it). Keyed on the boss's
 * own spawn row, so a checkpoint restart past row 10 never meets it and the
 * corrupted Slime Tower of the second lap (row 70) is an ordinary boss.
 */
export const isFirstBoss = (m: { kind: MonsterKind; spawnRow?: number }, fallbackRow: number): boolean =>
  m.kind === 'boss' && (m.spawnRow ?? fallbackRow) < 2 * BOSS_EVERY

/** The share of the walkers the endless run's THIRD boss (rows 30–39) roars
 *  away as it arrives (the designer's call after playtest run 11: it landed on
 *  a full board — both losses came there — but a clean board would make the
 *  fight too easy; a third, cleared in lanes, leaves holes for bank shots). */
export const THIRD_BOSS_ROAR = 1 / 3

/** How much of the board the boss spawning in `row` roars away as it arrives:
 *  all of it for the run's first boss and — playtest run 7 ("a second boss
 *  appears while the full enemy swarm is STILL on screen") — the endless run's
 *  second (rows 20–29); THIRD_BOSS_ROAR for the endless third (rows 30–39);
 *  nothing for later ones. The Daily board's later bosses never roar. */
export const roarShare = (row: number, daily: boolean): number => {
  if (isFirstBoss({ kind: 'boss', spawnRow: row }, row)) return 1
  if (daily) return 0
  if (row < 3 * BOSS_EVERY) return 1
  return row < 4 * BOSS_EVERY ? THIRD_BOSS_ROAR : 0
}

/** The boss spawning in `row` roars as it arrives (some share of the board). */
export const roarsOnArrival = (row: number, daily: boolean): boolean => roarShare(row, daily) > 0

/**
 * The walkers a roar of `share` takes (board order kept). A full roar takes
 * them all. A partial one takes round(n × share) of them LANE BY LANE — the
 * columns beside the boss first (left, right, then one further out each side,
 * its own columns last) and each lane from the bottom up — so what opens are
 * channels from the launcher's side into the back rows: a ball sent up one
 * gets behind the formation and bounces there (the combo the coach teaches).
 * Reads the board only, never the RNG: same board ⇒ same roar.
 */
export const roarVictims = <M extends { id: number; col: number; row: number; w: number; h: number }>(
  walkers: readonly M[],
  boss: { col: number; w: number },
  share: number
): M[] => {
  if (share >= 1) return [...walkers]
  const k = Math.round(walkers.length * Math.max(0, share))
  if (k <= 0) return []
  const lane: number[] = new Array<number>(COLS).fill(COLS)
  let order = 0
  for (let d = 1; d < COLS; d++) {
    const l = boss.col - d
    const r = boss.col + boss.w - 1 + d
    if (l >= 0) lane[l] = order++
    if (r < COLS) lane[r] = order++
  }
  for (let c = boss.col; c < boss.col + boss.w; c++) if (c >= 0 && c < COLS) lane[c] = order++
  const rankOf = (m: M): number => {
    let best = COLS
    for (let c = Math.max(0, m.col); c < Math.min(COLS, m.col + m.w); c++) best = Math.min(best, lane[c]!)
    return best
  }
  const picked = new Set(
    [...walkers]
      .sort((a, b) => rankOf(a) - rankOf(b) || (b.row + b.h) - (a.row + a.h) || a.col - b.col || a.id - b.id)
      .slice(0, k)
      .map((m) => m.id)
  )
  return walkers.filter((m) => picked.has(m.id))
}

/**
 * Adaptive boss HP (playtest run 8: an 8-ball tray one-shot the 73-HP Slime
 * Tower — "completely anticlimactic"). An endless-run boss never spawns with
 * less than `volleys` volleys (the run's first: `firstVolleys`) of the tray
 * it meets: every ball hitting it as often as THIS player's balls hit a boss
 * (`bossAimHpb`), at its tier's damage × Ball Damage × Tempo
 * (`config.damageMult`; balls.ts `trayPower`). A weak tray meets the curve's
 * HP, a stacked one a fight of about `volleys` volleys — never a one-shot,
 * never a wall (it is the player's own power and aim).
 *
 * Playtest run 9: the floor assumed 3 "hits per ball"; a tapper (the same spot
 * every shot) did ~1.5 balls' worth of damage to a boss per volley — his first
 * boss needed ~14 volleys of the ~9 its march allows. The engine now measures
 * it (EMAs, `aimAlpha`): a volley's damage ÷ the tray's power (momentum, crits
 * and abilities included, the savior boost out), on a boss once it has fought
 * one, else on walker boards × `walkerToBoss`, else `hitsPerBall`; clamped to
 * [`minHpb`, `maxHpb`]. `firstOnly`: only the
 * run's first boss adapts. The retry cap (`config.bossHpCap`) and boss mercy
 * apply on top. The Daily board's fixed kit keeps the curve. Mutable only so
 * the sim can sweep it.
 */
export const BOSS_ADAPT = {
  volleys: 7,
  firstVolleys: 5,
  hitsPerBall: 3,
  walkerToBoss: 1.2,
  minHpb: 1,
  maxHpb: 4,
  aimAlpha: 0.3,
  firstOnly: false
}

/** The hits per ball a boss's floor assumes, from the aim EMAs (−1: not
 *  measured): the boss's if measured, else the walkers' × `walkerToBoss`,
 *  else `hitsPerBall`; clamped to [`minHpb`, `maxHpb`]. */
export const bossAimHpb = (walker: number, boss: number): number => {
  const a = BOSS_ADAPT
  const raw = Number.isFinite(boss) && boss >= 0 ? boss
    : Number.isFinite(walker) && walker >= 0 ? walker * a.walkerToBoss
      : a.hitsPerBall
  return Math.max(a.minHpb, Math.min(a.maxHpb, raw))
}

/** A boss's HP after the adaptive floor: `curveHp` or `volleys` volleys of
 *  a tray dealing `trayPower` per ball-hit round at `hitsPerBall` hits per
 *  ball, whichever is more. */
export const adaptiveBossHp = (curveHp: number, trayPower: number, hitsPerBall = BOSS_ADAPT.hitsPerBall, volleys = BOSS_ADAPT.volleys): number => {
  const ok = Number.isFinite(trayPower) && trayPower > 0 && Number.isFinite(hitsPerBall) && hitsPerBall > 0 && Number.isFinite(volleys) && volleys > 0
  const floor = ok ? Math.round(volleys * hitsPerBall * trayPower) : 0
  return Math.max(curveHp, floor)
}

/** The row-HP multiplier of the boss spawning in `row`: the run's first boss
 *  `HP_CURVE.boss`, the endless run's second (rows 20–29) `HP_CURVE.bossSecond`
 *  and third (rows 30–39) `HP_CURVE.bossThird`, every later one — and every
 *  Daily boss past the first — `HP_CURVE.bossLater`. */
export const bossHpFactor = (row: number, daily = false): number => {
  if (isFirstBoss({ kind: 'boss', spawnRow: row }, row)) return HP_CURVE.boss
  if (!daily && row < 3 * BOSS_EVERY) return HP_CURVE.bossSecond
  if (!daily && row < 4 * BOSS_EVERY) return HP_CURVE.bossThird
  return HP_CURVE.bossLater
}

/** HP of the boss spawning in `row` at HP-clock row `hpRow` (`bossHpFactor`;
 *  `daily`: the Daily board, which keeps `bossLater` past its first boss). */
export const bossHp = (hpRow: number, row: number, corrupted: boolean, ftue = false, assist = 0, daily = false): number =>
  monsterHp(hpRow, 'boss', corrupted, ftue, assist, bossHpFactor(row, daily), daily)

// ─── Row generator ───────────────────────────────────────────────────────────
export interface RowPlanMonster {
  kind: WalkerKind
  col: number
  corrupted: boolean
}

export interface RowPlan {
  monsters: RowPlanMonster[]
  ballCol: number | null
  coinCol: number | null
  skillCol: number | null
  skill: SkillId | null
}

export interface RowPlanOptions {
  /** A boss is on the board: rows spawn sparser (1–3 monsters). */
  bossAlive: boolean
  pickupLuck: number
  ftue: boolean
  /** Grid row 0 cell already taken (frozen monster, boss body, pickup…). */
  blocked: (col: number) => boolean
  /** Monsters stay out of these columns (FTUE keeps the shot line clear). */
  avoidCol?: (col: number) => boolean
  /** The engine places this row's "+1" itself (FTUE script). */
  scriptBall?: boolean
  /** Upper bound on monsters (boss rows spawn 1–3 light walkers). */
  maxMonsters?: number
  /** Only 1×1 light walkers (beside a spawning boss). */
  lightOnly?: boolean
  /** The first boss lives: no walkers and no bubbles — only the row's "+1",
   *  so ball income keeps flowing while the fight is the boss alone. */
  calm?: boolean
}

const SKILLS: readonly SkillId[] = ['meteor', 'warcry', 'legion', 'pact', 'shield', 'execute', 'heal', 'revive']
const SKILL_WEIGHT: readonly number[] = [2, 2, 2, 1.5, 1, 1.5, 1, 0.6]

/** Instant Barrage: FTUE rows up to here spawn 3–4 walkers (and an extra "+1"). */
export const FTUE_DENSE_ROWS = 5

export const coinBubbleChance = (luck: number): number => 0.18 + 0.5 * luck
export const skillBubbleChance = (luck: number): number => 0.07 + 0.25 * luck

const monsterCountRange = (row: number, bossAlive: boolean, ftue: boolean): [number, number] => {
  if (bossAlive) return [1, 3]
  // Instant Barrage: the first session's rows 1–5 are denser (the FTUE HP cap
  // keeps every one of them a 1–3 HP target), so the bigger tray has targets.
  if (ftue && row <= FTUE_DENSE_ROWS) return [3, 4]
  if (row < 4) return [2, 3]
  if (row < 12) return [2, 4]
  return [2, 5]
}

/** Row-local stream: see mixSeed — keeps daily boards identical per row. */
export const rowRng = (seed: number, row: number): Rng => new Rng(mixSeed(seed, row))

/**
 * Plans the walkers and pickups of a freshly spawned row (grid row 0). Every
 * row gets exactly one "+1" ball pickup unless the FTUE script places it.
 */
export const planRow = (seed: number, row: number, opts: RowPlanOptions): RowPlan => {
  const rng = rowRng(seed, row)
  // Shuffled column order: monsters take the first free slots, pickups the next.
  const order = [0, 1, 2, 3, 4, 5, 6]
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const t = order[i]!
    order[i] = order[j]!
    order[j] = t
  }
  const taken: boolean[] = []
  for (let c = 0; c < COLS; c++) taken.push(opts.blocked(c))
  const plan: RowPlan = { monsters: [], ballCol: null, coinCol: null, skillCol: null, skill: null }

  const [lo, hi] = monsterCountRange(row, opts.bossAlive, opts.ftue)
  // Drawn even for a calm row: the row's stream stays the one it always was.
  const drawn = rng.intIn(lo, Math.min(hi, opts.maxMonsters ?? hi))
  const want = opts.calm ? 0 : drawn
  // Keep at least two free cells so the "+1" (and a bubble) always fit.
  let freeCells = 0
  for (let c = 0; c < COLS; c++) if (!taken[c]) freeCells++

  const unlocked: WalkerKind[] = []
  const weights: number[] = []
  for (const k of WALKER_KINDS) {
    const at = KIND_UNLOCK_ROW[k]
    if (row < at) continue
    if (opts.ftue && k === 'goblin' && row <= 5) continue
    if (opts.lightOnly && k !== 'slime' && k !== 'goblin') continue
    unlocked.push(k)
    // A freshly unlocked walker shows up a lot for three rows so its rule is
    // learned while it is new.
    weights.push(KIND_WEIGHT[k] * (row - at < 3 && k !== 'slime' ? 3 : 1))
  }
  const cc = corruptChance(row)
  const newKind = unlocked.find(k => KIND_UNLOCK_ROW[k] === row && k !== 'slime') ?? null
  // Every roll is drawn up front, so how many cells happen to be blocked never
  // shifts the stream — two daily players with different frozen monsters
  // still get the same kinds in the same order.
  const kindRolls: number[] = []
  const corruptRolls: boolean[] = []
  for (let i = 0; i < COLS; i++) {
    kindRolls.push(rng.weighted(weights))
    corruptRolls.push(cc > 0 && rng.chance(cc))
  }
  const coinRoll = rng.next()
  const skillRoll = rng.next()
  const skillPick = rng.weighted(SKILL_WEIGHT)

  let placed = 0
  for (let i = 0; i < order.length; i++) {
    const col = order[i]!
    if (placed >= want || freeCells <= 2) break
    if (taken[col] || opts.avoidCol?.(col)) continue
    let kind: WalkerKind = placed === 0 && newKind ? newKind : (unlocked[kindRolls[i]!] ?? 'slime')
    if (kind === 'caterpillar') {
      // Needs the cell to its right; otherwise it spawns as a slime.
      const right = col + 1
      if (right >= COLS || taken[right] || opts.avoidCol?.(right) || freeCells <= 3) kind = 'slime'
      else { taken[right] = true; freeCells-- }
    }
    taken[col] = true
    freeCells--
    plan.monsters.push({ kind, col, corrupted: corruptRolls[i]! })
    placed++
  }

  const takeFree = (): number | null => {
    for (const col of order) {
      if (!taken[col]) { taken[col] = true; return col }
    }
    return null
  }
  if (!opts.scriptBall) plan.ballCol = takeFree()
  if (opts.calm) return plan
  const luck = Math.max(0, Math.min(1, opts.pickupLuck))
  if (coinRoll < coinBubbleChance(luck)) plan.coinCol = takeFree()
  if (skillRoll < skillBubbleChance(luck)) {
    plan.skillCol = takeFree()
    if (plan.skillCol !== null) plan.skill = SKILLS[skillPick] ?? 'meteor'
  }
  return plan
}

/** Column (0..COLS−3) for a boss whose three row-0 cells are free, or null. */
export const planBossCol = (seed: number, row: number, blocked: (col: number) => boolean): number | null => {
  const rng = rowRng(seed, row * 31 + 7)
  const start = rng.int(COLS - 2)
  for (let i = 0; i < COLS - 2; i++) {
    const c = (start + i) % (COLS - 2)
    if (!blocked(c) && !blocked(c + 1) && !blocked(c + 2)) return c
  }
  return null
}

export const randomSkill = (rng: Rng): SkillId => SKILLS[rng.weighted(SKILL_WEIGHT)] ?? 'meteor'
