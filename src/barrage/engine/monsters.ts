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
// MIW's wave curve shape (linear × gentle exponential), softened past SOFT_ROW:
// the player's tray grows only logarithmically in tiers once the capacity caps,
// so an unsoftened exponential would become a wall no upgrade can climb.
// Constants tuned by scripts/barrage-sim.mjs (see its header for the targets).
// Shape: soft through the first boss, steep across rows ~12–24 (growth 1.185
// against a casual bot that turns board density into bounce pockets — its
// damage per turn is 5–10× a random aimer's, so only a steep band puts both
// bots' first breaches within a few rows of each other), then softened from
// row 24 so the row-30 boss is a gate, not a wall (at 35 it stalled the casual
// bot for 15+ minutes). Sim numbers: see the header of scripts/barrage-sim.mjs.
// Mutable only so the sim can sweep it in-process; the game never writes it.
export const HP_CURVE = {
  base: 0.36,
  growth: 1.185,
  softRow: 24,
  softPower: 0.7,
  /** Boss HP = boss × rowHp (CONTRACT §2: ≈14; 15 makes the row-20 boss the
   *  gate the casual bot has to come back for). */
  boss: 15,
  /** The FTUE's Slime Tower is the scripted first win (CONTRACT §7). */
  ftueBoss: 0.28
}

export const softRow = (row: number): number =>
  row <= HP_CURVE.softRow ? row : HP_CURVE.softRow + Math.pow(row - HP_CURVE.softRow, HP_CURVE.softPower)

/** Base HP of a slime spawned in `row` (before kind / corrupted multipliers). */
export const rowHp = (row: number): number => {
  const s = softRow(Math.max(1, row))
  return Math.max(1, Math.round(HP_CURVE.base * s * Math.pow(HP_CURVE.growth, s - 1)))
}

/** FTUE rows stay one- to three-hit so the first minute is all kills. */
export const FTUE_HP_ROWS = 5
export const FTUE_HP_CAP = 3

export const monsterHp = (row: number, kind: MonsterKind, corrupted: boolean, ftue = false): number => {
  const kindMult = kind === 'boss' ? HP_CURVE.boss : KIND_HP_MULT[kind]
  const mult = kindMult * (corrupted ? (kind === 'boss' ? CORRUPT_BOSS_HP_MULT : CORRUPT_HP_MULT) : 1)
  const hp = Math.max(1, Math.round(rowHp(row) * mult * (ftue && kind === 'boss' ? HP_CURVE.ftueBoss : 1)))
  if (ftue && kind !== 'boss' && row <= FTUE_HP_ROWS) return Math.min(hp, row === 1 ? 1 : FTUE_HP_CAP)
  return hp
}

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
}

const SKILLS: readonly SkillId[] = ['meteor', 'warcry', 'legion', 'pact', 'shield', 'execute', 'heal', 'revive']
const SKILL_WEIGHT: readonly number[] = [2, 2, 2, 1.5, 1, 1.5, 1, 0.6]

export const coinBubbleChance = (luck: number): number => 0.18 + 0.5 * luck
export const skillBubbleChance = (luck: number): number => 0.07 + 0.25 * luck

const monsterCountRange = (row: number, bossAlive: boolean): [number, number] => {
  if (bossAlive) return [1, 3]
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

  const [lo, hi] = monsterCountRange(row, opts.bossAlive)
  const want = rng.intIn(lo, Math.min(hi, opts.maxMonsters ?? hi))
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
