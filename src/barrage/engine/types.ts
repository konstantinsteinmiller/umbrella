/**
 * Elemental Barrage — ENGINE CONTRACT (shared by engine, renderer and state layer).
 *
 * This file is the seam between three independently-built layers:
 *   • engine  (src/barrage/engine/*)  — pure TS, deterministic, no DOM/Vue
 *   • render  (src/barrage/render/*, BarrageBoard.vue) — canvas, reads `state`, listens to events
 *   • state   (src/barrage/state/*)   — Vue composables: persistence, economy, meta
 *
 * RULES: fields/types may be ADDED. Nothing here may be renamed or removed
 * without updating every layer. Units are BOARD CELLS: x ∈ [0, COLS],
 * y ∈ [0, FLOOR_Y], y grows DOWNWARD, row 0 is the top row. A monster at
 * (col,row,w,h) covers the rect [col, col+w] × [row, row+h].
 */

// ─── Board geometry ──────────────────────────────────────────────────────────
export const COLS = 7
/** Monster rows 0..ROWS-1. A monster whose bottom edge would pass ROWS is a BREACH. */
export const ROWS = 10
/** The launcher line — balls land (and the launcher sits) here. */
export const FLOOR_Y = ROWS + 1.15
/** Ball radius in cells. */
export const BALL_R = 0.16
/** Launcher x is clamped to [LAUNCH_MARGIN, COLS - LAUNCH_MARGIN]. */
export const LAUNCH_MARGIN = 0.35
/** Aim angle clamp: radians measured from +x axis, pointing UP (negative y).
 *  Valid launch directions have angle ∈ [MIN_AIM, π − MIN_AIM]; the vector is
 *  (cos a, −sin a). */
export const MIN_AIM = (8 * Math.PI) / 180
/** Boss rows: a boss spawns when the spawned-row counter hits a multiple of this. */
export const BOSS_EVERY = 10
/** Hits in one volley that ignite FEVER (coins ×2, rainbow balls) for the rest of it. */
export const FEVER_HITS = 50

// ─── Ids ─────────────────────────────────────────────────────────────────────
export type MonsterKind =
  | 'slime' | 'caterpillar' | 'goblin' | 'ogre' | 'centaur' | 'dryad'
  | 'imp' | 'treant' | 'carbuncle' | 'cyclops'
  | 'boss'
export type BossKind = 'slime-tower' | 'worm' | 'fire-dragon' | 'silver-dragon' | 'troll' | 'orc'
export type SkillId = 'meteor' | 'warcry' | 'legion' | 'pact' | 'shield' | 'execute' | 'heal' | 'revive'
export type PickupKind = 'ball' | 'coin' | 'skill'
/** On-hit ability of a ball tier (see `ballAbility(tier)` in balls.ts). */
export type BallAbility =
  | 'burn'       // T1  Magma Mote     — DoT ticks at end of turn
  | 'knockback'  // T2  Frost Whirl    — pushes the monster up one row (if the cell above is free; never bosses)
  | 'pierce'     // T3  Boulder Brute  — passes through the first monster it hits each launch
  | 'freeze'     // T4  Glacier Guard  — monster skips its next march
  | 'splash'     // T5  Tide Drop      — splash damage to orthogonal neighbours
  | 'crush'      // T6  Crag Colossus  — ×3 damage vs ogres and bosses
  | 'chain'      // T7  Nebula Eye     — chain lightning to 2 nearby monsters
  | 'poison'     // T8  Void Wraith    — stacking poison, ticks at end of turn
  | 'midas'      // T9  Golden Talon   — bonus coins per hit
  | 'eruption'   // T10+               — every few hits, a 3×3 blast (strength grows with tier)
export type Phase = 'aim' | 'volley' | 'resolve' | 'advance' | 'breach'
export type GameMode = 'endless' | 'daily'

// ─── Entities ────────────────────────────────────────────────────────────────
export interface Monster {
  id: number
  kind: MonsterKind
  bossKind?: BossKind
  /** Elite "corrupted" variant (darker tint, +HP, more coins) — later rows. */
  corrupted: boolean
  col: number
  row: number
  /** Footprint in cells: slime 1×1, caterpillar 2×1, boss 3×3. */
  w: number
  h: number
  hp: number
  maxHp: number
  /** Marches remaining to skip (freeze). */
  frozen: number
  /** Pending burn damage applied at end of turn, and turns left. */
  burnDmg: number
  burnTurns: number
  /** Poison stacks; each stack deals `poisonDmg` at end of turn. */
  poisonStacks: number
  poisonDmg: number
  /** Boss only: below 30% HP it marches two rows per turn. */
  enraged: boolean
  /** (engine addition) Row number this monster spawned with — its kill coins
   *  and, for a boss, the checkpoint row / bounty come from it. */
  spawnRow?: number
  /** Carbuncle: its gem shield is up — the next damage it takes is blocked.
   *  Regrows at every aim phase. */
  shield?: boolean
  /** Imp: one of the two little imps a defeated imp splits into (never splits again). */
  mini?: boolean
}

export interface Ball {
  id: number
  tier: number
  x: number
  y: number
  vx: number
  vy: number
  /** false while queued in the launcher, true in flight, false once landed. */
  active: boolean
  landed: boolean
  /** Legion Call ghosts: vanish on landing, never counted as "first landed". */
  ghost: boolean
  /** Pierce budget left for this launch. */
  pierceLeft: number
  /** Hits this ball has scored this launch (drives eruption cadence). */
  hits: number
}

export interface Pickup {
  id: number
  kind: PickupKind
  skill?: SkillId
  /** Coin pickups: coin amount (already multiplied by the coin bounty). */
  amount?: number
  col: number
  row: number
}

/** Centaur sludge: an indestructible blocking cell that lasts `turns` turns. */
export interface Hazard {
  id: number
  col: number
  row: number
  turns: number
}

/** The flying chest crossing mid-board (hit it with a ball to open it). */
export interface FlyingChest {
  x: number
  y: number
  vx: number
  /** Collision radius in cells. */
  r: number
}

// ─── Config (driven by upgrades / mode) ──────────────────────────────────────
export interface EngineConfig {
  mode: GameMode
  /** RNG seed (daily mode: derived from the date → identical boards for everyone). */
  seed: number
  /** Multiplier on every ball's damage (Ball Damage upgrade). 1 = base. */
  damageMult: number
  /** Max balls in the tray (Tray Capacity upgrade). */
  trayCapacity: number
  /** Ball speed in cells/second (Launch Speed upgrade). */
  ballSpeed: number
  /** Seconds between consecutive balls leaving the launcher. */
  launchInterval: number
  /** 0..1 extra chance for coin/skill pickups per row (Pickup Luck upgrade). */
  pickupLuck: number
  /** Multiplier on coins from kills/pickups (Coin Bounty upgrade). */
  coinMult: number
  /** Scripted first-session board (see CONTRACT.md §FTUE). */
  ftue: boolean
}

// ─── The whole mutable state (renderer reads it every frame; never writes) ───
export interface BoardState {
  config: EngineConfig
  phase: Phase
  /** Seconds spent in the current phase (for renderer easing / pacing). */
  phaseTime: number
  /** Rows spawned so far = the player-facing "Row N" (depth). Starts at 1. */
  row: number
  /** Next row number that is a boss row. */
  nextBossRow: number
  monsters: Monster[]
  pickups: Pickup[]
  hazards: Hazard[]
  balls: Ball[]
  /** Tray: ball tiers, sorted DESCENDING. Length ≤ config.trayCapacity. */
  tray: number[]
  launcherX: number
  /** x where the first ball of the current volley landed (null until one lands). */
  nextLauncherX: number | null
  /** Hits scored in the current volley (combo counter). */
  volleyHits: number
  fever: boolean
  /** Warcry armed: the next volley deals ×2. */
  warcryArmed: boolean
  warcryActive: boolean
  /** Shield Crest charges (each absorbs one breach automatically). */
  shields: number
  /** Revive charges (a free continue offered at a breach). */
  revives: number
  /** Simulation speed multiplier (auto fast-forward during long volleys). */
  speedMul: number
  /** Seconds of play time until the next flying chest (counts in all phases but breach). */
  chestTimer: number
  chest: FlyingChest | null
  /** Id of the live boss monster, if any. */
  bossId: number | null
  /** Turn counter (volleys fired), for stats. */
  turn: number
}

// ─── Aim preview ─────────────────────────────────────────────────────────────
export interface AimPath {
  /** Polyline from the launcher: [launcher, firstBounce, (short continuation)]. */
  points: { x: number; y: number }[]
  /** What the first segment hits. */
  hit: 'wall' | 'ceiling' | 'monster' | 'hazard' | 'floor'
  monsterId?: number
}

// ─── Events (engine → listeners; emitted synchronously inside update/fire) ───
export type EngineEvent =
  | { type: 'fire'; angle: number; balls: number }
  | { type: 'launch'; ballId: number; tier: number }
  | { type: 'hit'; monsterId: number; ballId: number; tier: number; dmg: number; x: number; y: number; ability: BallAbility | null; crit: boolean }
  | { type: 'wallBounce'; ballId: number; x: number; y: number }
  | { type: 'abilityProc'; ability: BallAbility; x: number; y: number; monsterId?: number; targets?: number[] }
  | { type: 'dot'; monsterId: number; dmg: number; kind: 'burn' | 'poison'; x: number; y: number }
  | { type: 'kill'; monsterId: number; kind: MonsterKind; bossKind?: BossKind; corrupted: boolean; x: number; y: number; coins: number; row: number }
  | { type: 'coins'; amount: number; x: number; y: number; source: 'kill' | 'pickup' | 'midas' | 'chest' | 'boss' }
  /** `auto` (engine addition): collected without a ball touching it — a "+1"
   *  that reached the launcher line, or the FTUE guarantee at volley end.
   *  RENDER flies it into the tray instead of bursting it under a ball. */
  | { type: 'pickup'; pickupId: number; kind: PickupKind; skill?: SkillId; x: number; y: number; auto?: boolean }
  | { type: 'trayAdd'; tier: number }
  | { type: 'trayMerge'; fromTier: number; toTier: number }
  | { type: 'trayOverflow'; tier: number; coins: number }
  | { type: 'skill'; skill: SkillId; x: number; y: number }
  | { type: 'combo'; hits: number }
  | { type: 'fever' }
  | { type: 'speedUp'; speedMul: number }
  | { type: 'ballLanded'; ballId: number; x: number; first: boolean }
  | { type: 'volleyEnd'; hits: number }
  | { type: 'march'; rows: number }
  | { type: 'rowSpawned'; row: number; boss: boolean }
  | { type: 'monsterSpawn'; monsterId: number; kind: MonsterKind; bossKind?: BossKind }
  | { type: 'heal'; monsterId: number; amount: number; byId: number }
  | { type: 'sludge'; hazardId: number; col: number; row: number; byId: number }
  | { type: 'hop'; monsterId: number; fromCol: number; toCol: number }
  /** A carbuncle's gem shield blocked a hit (or any damage) and broke. */
  | { type: 'shieldPop'; monsterId: number; x: number; y: number }
  /** A carbuncle's gem shield grew back (start of the aim phase). */
  | { type: 'shieldUp'; monsterId: number }
  /** A defeated imp split into little imps (their own `monsterSpawn`s precede this). */
  | { type: 'split'; monsterId: number; x: number; y: number; childIds: number[] }
  /** A cyclops charged: it marched `rows` (2) this advance. */
  | { type: 'charge'; monsterId: number; rows: number }
  | { type: 'bossSpawn'; monsterId: number; bossKind: BossKind; row: number }
  | { type: 'bossEnrage'; monsterId: number }
  | { type: 'bossDefeated'; monsterId: number; bossKind: BossKind; row: number; bounty: number }
  | { type: 'danger'; rowsLeft: number }
  | { type: 'shieldBlock' }
  | { type: 'breach' }
  | { type: 'continued'; how: 'meteor' | 'revive' | 'shield' }
  | { type: 'chestAppear' }
  | { type: 'chestHit'; x: number; y: number; coins: number; skill?: SkillId }
  | { type: 'chestGone' }
  | { type: 'phase'; phase: Phase }

export type EngineListener = (e: EngineEvent) => void

// ─── Serializable run snapshot (taken in the 'aim' phase only) ───────────────
export interface RunSnapshot {
  v: 1
  config: EngineConfig
  row: number
  nextBossRow: number
  monsters: Monster[]
  pickups: Pickup[]
  hazards: Hazard[]
  tray: number[]
  launcherX: number
  shields: number
  revives: number
  warcryArmed: boolean
  chestTimer: number
  turn: number
  /** RNG internal state so a resumed run continues the same sequence. */
  rng: number
  nextId: number
}

// ─── Economy (implemented in engine/economy.ts — ENGINE owns the numbers because
// the balance sim tunes them; STATE builds the upgrade UI state on top) ─────────
export type UpgradeId = 'damage' | 'capacity' | 'speed' | 'luck' | 'bounty'
export type UpgradeLevels = Record<UpgradeId, number>
/**
 * economy.ts exports (signatures are binding):
 *   UPGRADE_IDS: UpgradeId[]
 *   upgradeMaxLevel(id: UpgradeId): number | null        // null = uncapped
 *   upgradeCost(id: UpgradeId, level: number): number    // price to go level → level+1
 *   upgradeValue(id: UpgradeId, level: number): number   // damage/bounty: multiplier · capacity: balls
 *                                                        // speed: cells/s · luck: 0..1
 *   configFromUpgrades(levels: UpgradeLevels): Pick<EngineConfig,
 *     'damageMult' | 'trayCapacity' | 'ballSpeed' | 'launchInterval' | 'pickupLuck' | 'coinMult'>
 *   DAILY_CONFIG: Pick<EngineConfig, same as above>     // fixed, upgrade-independent (fair seeds)
 *   defaultConfig(overrides?: Partial<EngineConfig>): EngineConfig
 *   killCoins(row: number, kind: MonsterKind, corrupted: boolean): number   // before coinMult
 *   bossBounty(row: number): number                                        // before coinMult
 *   dailySeed(dateYmd: string): number
 * engine.ts exports:
 *   class BarrageEngine implements IBarrageEngine
 *   createEngine(config: EngineConfig): BarrageEngine          // fresh run (row 1; FTUE script if config.ftue)
 *   createEngineAtRow(config: EngineConfig, row: number, tray: number[]): BarrageEngine  // checkpoint restart
 *   restoreEngine(snap: RunSnapshot): BarrageEngine
 */

/**
 * Public API of `BarrageEngine` (implemented in engine.ts). Listed here so the
 * renderer and state layer can code against it before it exists.
 */
export interface IBarrageEngine {
  readonly state: BoardState
  /** Advance by real seconds (internally fixed-step 1/120 s × speedMul; dt capped at 0.1). */
  update(dt: number): void
  /** Aim preview for an angle (see MIN_AIM). Pure; does not mutate state. */
  aimPreview(angle: number): AimPath
  canFire(): boolean
  /** Start a volley. Returns false if not in 'aim' or the angle is invalid (it is clamped first). */
  fire(angle: number): boolean
  /** End a slow volley now: every ball in flight returns instantly. */
  recall(): void
  /** Resolve a pending breach (phase 'breach'). 'meteor' clears the bottom 2 rows
   *  (a boss loses 25% max HP and is pushed up 3 rows instead); 'revive' consumes a
   *  revive charge and does the same. Returns false if not applicable. */
  continueAfterBreach(how: 'meteor' | 'revive'): boolean
  /** Rewarded "+N balls": add N tier-1 balls to the tray (overflow merges apply). */
  addBalls(n: number, tier?: number): void
  /** Live-tune from upgrades. `trayCapacity` shrinking never deletes balls until the next overflow. */
  setConfig(partial: Partial<EngineConfig>): void
  on(listener: EngineListener): () => void
  /** Valid only in 'aim' phase (returns null otherwise). */
  snapshot(): RunSnapshot | null
}
