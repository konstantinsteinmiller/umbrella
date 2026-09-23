/**
 * Elemental Barrage engine: the turn state machine
 *   aim → fire → volley → resolve → advance → (breach) → aim
 * Pure TS, deterministic (seeded RNG, fixed step, no Date/Math.random).
 *
 * Wallet feed: every coin the engine grants is emitted exactly once as a
 * `coins` event (kill, pickup incl. tray overflow, midas, chest). The amounts
 * on `kill` / `trayOverflow` / `chestHit` are display copies of those same
 * coins. `bossDefeated.bounty` is NOT paid here — the state layer's boss chest
 * pays it (1× or rewarded 2×).
 */
import type {
  AimPath, BoardState, EngineConfig, EngineEvent, EngineListener, Hazard,
  IBarrageEngine, Monster, MonsterKind, Phase, Pickup, PickupKind, RunSnapshot, SkillId
} from './types'
import { BALL_R, BOSS_EVERY, COLS, FEVER_HITS, LAUNCH_MARGIN, ROWS } from './types'
import { Rng, mixSeed } from './rng'
import {
  BURN_FRACTION, BURN_TURNS, CHAIN_FRACTION, CHAIN_JUMPS, CHAIN_RANGE, CRIT_CHANCE, CRIT_MULT,
  CRUSH_MULT, ERUPTION_EVERY, MIDAS_FRACTION, POISON_FRACTION, POISON_MAX_STACKS, SPLASH_FRACTION,
  addToTray, ballAbility, ballDamage, eruptionFraction, insertDesc, pactTray, type TraySink
} from './balls'
import {
  IMP_MINI_COINS, IMP_MINI_HP, bossForRow, chargesAt, footprint, monsterHp, planBossCol, planRow, randomSkill, restsAt,
  type WalkerKind
} from './monsters'
import { bossBounty, chestCoins, coinPickupCoins, killCoins, overflowCoins } from './economy'
import { Grid, STEP, stepBall, type BallWorld, type SimBall } from './physics'
import { aimPreview, clampAim, launchY } from './aim'

// ─── Pacing (CONTRACT §1, §5) ────────────────────────────────────────────────
export const RESOLVE_TIME = 0.35
export const ADVANCE_TIME = 0.4
/** Volley seconds (real) before auto fast-forward ×2 / ×3. */
export const FAST_FORWARD_AT: readonly [number, number] = [2, 5]
/** A volley still running after this many real seconds is recalled — a
 *  pocket above the rows can trap a ball for a very long time. */
export const VOLLEY_TIMEOUT = 20
export const CHEST_FIRST = 90
export const CHEST_EVERY = 120
export const CHEST_CROSS_TIME = 8
export const CHEST_Y = 4.5
export const CHEST_R = 0.45
export const CHEST_SKILL_CHANCE = 0.4
export const COMBO_MARKS: readonly number[] = [10, 20, 30, 40]
export const LEGION_BALLS = 3
/** Meteor skill: fraction of max HP (bosses take far less). */
export const METEOR_FRACTION = 0.35
export const METEOR_BOSS_FRACTION = 0.06
export const EXECUTE_BOSS_FRACTION = 0.15
/** Breach continue: bottom rows cleared, boss penalty / push. */
export const CONTINUE_CLEAR_ROWS = 2
export const CONTINUE_BOSS_FRACTION = 0.25
export const CONTINUE_BOSS_PUSH = 3
export const DRYAD_HEAL = 0.15
export const BOSS_ENRAGE_AT = 0.3
/** Rows from the breach line that count as "danger" (renderer pulse). */
export const DANGER_ROWS = 2
/** FTUE: while the run is at or below this row, missed "+1"s are collected at
 *  volley end, so the scripted turn-3 merge never depends on aim. */
export const FTUE_AUTO_COLLECT_ROWS = 4

/** Lifetime counters of this engine instance (bot sim, stats, achievements). */
export interface EngineStats {
  damage: number
  kills: number
  coins: number
  hits: number
  bossKills: number
  ballsCollected: number
  merges: number
  maxTier: number
  breaches: number
  maxBallsInFlight: number
}

const newStats = (): EngineStats => ({
  damage: 0, kills: 0, coins: 0, hits: 0, bossKills: 0, ballsCollected: 0,
  merges: 0, maxTier: 1, breaches: 0, maxBallsInFlight: 0
})

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

const sanitizeTray = (tray: readonly number[] | undefined): number[] => {
  const out: number[] = []
  if (Array.isArray(tray)) {
    for (const t of tray) if (Number.isFinite(t) && t >= 1) insertDesc(out, Math.floor(t))
  }
  if (out.length === 0) out.push(1)
  return out
}

const copyMonster = (m: Monster): Monster => ({ ...m })

export class BarrageEngine implements IBarrageEngine {
  readonly state: BoardState
  readonly stats: EngineStats = newStats()

  private readonly grid = new Grid()
  private readonly world: BallWorld
  private rng: Rng
  private nextId = 1
  private listeners: EngineListener[] = []

  /** Real-time accumulator for the fixed step. */
  private acc = 0
  // Volley bookkeeping (meaningless outside 'volley').
  private volleyTime = 0
  private launchTimer = 0
  private launchIndex = 0
  private volleyCount = 0
  private volleySpeed = 15
  private volleyInterval = 0.085
  private angle = Math.PI / 2
  /** Ball ids are turn × 1000 + n: unique across volleys and reproducible from
   *  a snapshot (a restored run emits the very same event stream). */
  private ballSeq = 1
  private readonly pool: SimBall[] = []
  /** monsterId → turn of its last knockback (one knockback per volley). */
  private knocked = new Map<number, number>()
  /** Heal skill moves monsters, which must never happen under balls in flight. */
  private pendingHeal = false
  private breachPending = false
  /** > 0 while a forced clear runs (meteor continue, boss throw-back): an imp
   *  killed then does not split — its little imps would land in the rows that
   *  were just cleared. */
  private noSplit = 0
  /** Where tray-overflow coins fly from (the pickup that caused it). */
  private fxX = COLS / 2
  private fxY = ROWS

  private readonly traySink: TraySink = {
    merge: (fromTier, toTier) => {
      this.stats.merges++
      if (toTier > this.stats.maxTier) this.stats.maxTier = toTier
      this.emit({ type: 'trayMerge', fromTier, toTier })
    },
    overflow: tier => {
      const coins = Math.max(1, Math.round(overflowCoins(this.state.row, tier) * this.state.config.coinMult))
      this.emit({ type: 'trayOverflow', tier, coins })
      this.grantCoins(coins, this.fxX, this.fxY, 'pickup')
    }
  }

  constructor(config: EngineConfig) {
    this.state = {
      config: { ...config },
      phase: 'aim',
      phaseTime: 0,
      row: 0,
      nextBossRow: BOSS_EVERY,
      monsters: [],
      pickups: [],
      hazards: [],
      balls: [],
      tray: [],
      launcherX: COLS / 2,
      nextLauncherX: null,
      volleyHits: 0,
      fever: false,
      warcryArmed: false,
      warcryActive: false,
      shields: 0,
      revives: 0,
      speedMul: 1,
      chestTimer: CHEST_FIRST,
      chest: null,
      bossId: null,
      turn: 0
    }
    this.rng = new Rng(mixSeed(config.seed >>> 0, 0x5eed))
    const self = this
    this.world = {
      grid: this.grid,
      get speed() { return self.volleySpeed },
      get chest() { return self.state.chest },
      onWall: b => {
        if (self.listeners.length > 0) self.emit({ type: 'wallBounce', ballId: b.id, x: b.x, y: b.y })
      },
      onMonster: (b, m, nx, ny) => self.onBallHit(b, m, nx, ny),
      onPickup: (b, p) => self.collectPickup(b, p),
      onChest: b => self.openChest(b),
      onLand: b => self.landBall(b)
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────
  on(listener: EngineListener): () => void {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }

  update(dt: number): void {
    if (!(dt > 0)) return
    this.acc += Math.min(dt, 0.1)
    while (this.acc >= STEP) {
      this.acc -= STEP
      this.tick()
    }
  }

  aimPreview(angle: number): AimPath {
    return aimPreview(this.state, angle)
  }

  canFire(): boolean {
    return this.state.phase === 'aim'
  }

  fire(angle: number): boolean {
    const s = this.state
    if (s.phase !== 'aim' || !Number.isFinite(angle)) return false
    const a = clampAim(angle)
    if (s.tray.length === 0) s.tray.push(1)
    this.angle = a
    s.turn++
    this.ballSeq = s.turn * 1000 + 1
    s.warcryActive = s.warcryArmed
    s.warcryArmed = false
    s.volleyHits = 0
    s.fever = false
    s.nextLauncherX = null
    s.speedMul = 1
    this.volleyTime = 0
    this.launchTimer = 0
    this.launchIndex = 0
    this.volleySpeed = s.config.ballSpeed > 0 ? s.config.ballSpeed : 15
    this.volleyInterval = Math.max(0.01, s.config.launchInterval)
    s.balls.length = 0
    // The volley is the tray as it is NOW, highest tier first; pickups
    // collected mid-flight join the tray for the next volley.
    for (let i = 0; i < s.tray.length; i++) {
      const b = this.allocBall(s.balls.length)
      this.resetBall(b, s.tray[i]!, false)
      b.x = s.launcherX
      b.y = launchY()
      s.balls.push(b)
    }
    this.volleyCount = s.balls.length
    this.emit({ type: 'fire', angle: a, balls: this.volleyCount })
    this.setPhase('volley')
    this.launchNext()
    return true
  }

  recall(): void {
    const s = this.state
    if (s.phase !== 'volley') return
    for (const b of s.balls) {
      if (b.active) {
        b.active = false
        b.landed = true
        b.vx = 0
        b.vy = 0
        this.emit({ type: 'ballLanded', ballId: b.id, x: b.x, first: false })
      } else if (!b.landed) {
        b.landed = true
      }
    }
    this.launchIndex = this.volleyCount
    this.enterResolve()
  }

  continueAfterBreach(how: 'meteor' | 'revive'): boolean {
    const s = this.state
    if (s.phase !== 'breach') return false
    if (how === 'revive') {
      if (s.revives <= 0) return false
      s.revives--
    }
    this.clearBottom()
    this.emit({ type: 'continued', how })
    this.enterAim()
    return true
  }

  addBalls(n: number, tier = 1): void {
    const count = Math.max(0, Math.floor(n))
    this.fxX = this.state.launcherX
    this.fxY = launchY()
    for (let i = 0; i < count; i++) this.addBallToTray(tier)
  }

  setConfig(partial: Partial<EngineConfig>): void {
    Object.assign(this.state.config, partial)
  }

  snapshot(): RunSnapshot | null {
    const s = this.state
    if (s.phase !== 'aim') return null
    return {
      v: 1,
      config: { ...s.config },
      row: s.row,
      nextBossRow: s.nextBossRow,
      monsters: s.monsters.map(copyMonster),
      pickups: s.pickups.map(p => ({ ...p })),
      hazards: s.hazards.map(h => ({ ...h })),
      tray: s.tray.slice(),
      launcherX: s.launcherX,
      shields: s.shields,
      revives: s.revives,
      warcryArmed: s.warcryArmed,
      chestTimer: s.chestTimer,
      turn: s.turn,
      rng: this.rng.state,
      nextId: this.nextId
    }
  }

  /** Independent deep copy (no listeners) — the bot sim fires trial volleys on clones. */
  clone(): BarrageEngine {
    const s = this.state
    const e = new BarrageEngine(s.config)
    const t = e.state
    const map = new Map<Monster, Monster>()
    for (const m of s.monsters) {
      const c = copyMonster(m)
      map.set(m, c)
      t.monsters.push(c)
    }
    for (const p of s.pickups) t.pickups.push({ ...p })
    for (const h of s.hazards) t.hazards.push({ ...h })
    for (let i = 0; i < s.balls.length; i++) {
      const src = s.balls[i] as SimBall
      const b = e.allocBall(i)
      Object.assign(b, src)
      b.passing = src.passing ? (map.get(src.passing) ?? null) : null
      t.balls.push(b)
    }
    t.phase = s.phase
    t.phaseTime = s.phaseTime
    t.row = s.row
    t.nextBossRow = s.nextBossRow
    t.tray = s.tray.slice()
    t.launcherX = s.launcherX
    t.nextLauncherX = s.nextLauncherX
    t.volleyHits = s.volleyHits
    t.fever = s.fever
    t.warcryArmed = s.warcryArmed
    t.warcryActive = s.warcryActive
    t.shields = s.shields
    t.revives = s.revives
    t.speedMul = s.speedMul
    t.chestTimer = s.chestTimer
    t.chest = s.chest ? { ...s.chest } : null
    t.bossId = s.bossId
    t.turn = s.turn
    e.rng.state = this.rng.state
    e.nextId = this.nextId
    e.acc = this.acc
    e.volleyTime = this.volleyTime
    e.launchTimer = this.launchTimer
    e.launchIndex = this.launchIndex
    e.volleyCount = this.volleyCount
    e.volleySpeed = this.volleySpeed
    e.volleyInterval = this.volleyInterval
    e.angle = this.angle
    e.ballSeq = this.ballSeq
    e.knocked = new Map(this.knocked)
    e.pendingHeal = this.pendingHeal
    e.breachPending = this.breachPending
    Object.assign(e.stats, this.stats)
    e.rebuildGrid()
    return e
  }

  /** Runs the fixed step until the engine waits for input ('aim' or 'breach')
   *  or `maxSeconds` of real time elapse. Returns the phase it stopped in.
   *  Tests and the bot sim use it to play a whole turn synchronously. */
  settle(maxSeconds = 120): Phase {
    const steps = Math.ceil(maxSeconds / STEP)
    for (let i = 0; i < steps; i++) {
      const p = this.state.phase
      if (p === 'aim' || p === 'breach') break
      this.tick()
    }
    return this.state.phase
  }

  // ─── Run setup (factories below) ───────────────────────────────────────────
  /** Fresh board whose first spawned row is `row`. */
  beginRun(row: number, tray: readonly number[]): void {
    const s = this.state
    const first = Math.max(1, Math.floor(row))
    s.tray = sanitizeTray(tray)
    this.stats.maxTier = s.tray[0] ?? 1
    s.row = first - 1
    s.nextBossRow = Math.ceil(first / BOSS_EVERY) * BOSS_EVERY
    this.spawnNextRow()
    this.setPhase('aim')
  }

  /** Loads a snapshot into this (fresh) engine. */
  loadSnapshot(snap: RunSnapshot): void {
    const s = this.state
    s.row = Math.max(1, Math.floor(snap.row) || 1)
    s.nextBossRow = Math.max(s.row, Math.floor(snap.nextBossRow) || BOSS_EVERY)
    s.monsters = (snap.monsters ?? []).map(copyMonster)
    s.pickups = (snap.pickups ?? []).map(p => ({ ...p }))
    s.hazards = (snap.hazards ?? []).map(h => ({ ...h }))
    s.tray = sanitizeTray(snap.tray)
    s.launcherX = clamp(Number.isFinite(snap.launcherX) ? snap.launcherX : COLS / 2, LAUNCH_MARGIN, COLS - LAUNCH_MARGIN)
    s.shields = Math.max(0, snap.shields | 0)
    s.revives = Math.max(0, snap.revives | 0)
    s.warcryArmed = !!snap.warcryArmed
    s.chestTimer = Number.isFinite(snap.chestTimer) ? snap.chestTimer : CHEST_EVERY
    s.turn = Math.max(0, snap.turn | 0)
    s.bossId = s.monsters.find(m => m.kind === 'boss')?.id ?? null
    this.rng.state = snap.rng >>> 0
    let maxId = 0
    for (const m of s.monsters) maxId = Math.max(maxId, m.id)
    for (const p of s.pickups) maxId = Math.max(maxId, p.id)
    for (const h of s.hazards) maxId = Math.max(maxId, h.id)
    this.nextId = Math.max(maxId + 1, Math.floor(snap.nextId) || 1)
    this.stats.maxTier = s.tray[0] ?? 1
    this.rebuildGrid()
    s.phase = 'aim'
    s.phaseTime = 0
  }

  // ─── Fixed step ────────────────────────────────────────────────────────────
  private tick(): void {
    const s = this.state
    switch (s.phase) {
      case 'aim':
        s.phaseTime += STEP
        // Daily boards must replay identically from the angles alone, so the
        // chest clock never runs while a daily player is thinking.
        if (s.config.mode !== 'daily') this.tickChest(STEP, STEP)
        break
      case 'volley':
        this.tickVolley()
        break
      case 'resolve':
        s.phaseTime += STEP
        this.tickChest(STEP, STEP)
        if (s.phaseTime >= RESOLVE_TIME) this.enterAdvance()
        break
      case 'advance':
        s.phaseTime += STEP
        this.tickChest(STEP, STEP)
        if (s.phaseTime >= ADVANCE_TIME) this.endAdvance()
        break
      case 'breach':
        break
    }
  }

  private tickVolley(): void {
    const s = this.state
    s.phaseTime += STEP
    this.volleyTime += STEP
    if (this.volleyTime >= VOLLEY_TIMEOUT) {
      this.recall()
      return
    }
    if (s.speedMul < 2 && this.volleyTime >= FAST_FORWARD_AT[0]) this.setSpeed(2)
    if (s.speedMul < 3 && this.volleyTime >= FAST_FORWARD_AT[1]) this.setSpeed(3)
    const dt = STEP * s.speedMul

    this.launchTimer += dt
    while (this.launchIndex < this.volleyCount && this.launchTimer >= this.volleyInterval) {
      this.launchTimer -= this.volleyInterval
      this.launchNext()
    }

    let inFlight = 0
    // Index loop: Legion ghosts append to s.balls while we iterate.
    for (let i = 0; i < s.balls.length; i++) {
      const b = s.balls[i] as SimBall
      if (!b.active) continue
      stepBall(b, dt, this.world)
      if (b.active) inFlight++
    }
    if (inFlight > this.stats.maxBallsInFlight) this.stats.maxBallsInFlight = inFlight
    this.tickChest(STEP, dt)
    if (s.phase === 'volley' && inFlight === 0 && this.launchIndex >= this.volleyCount) this.enterResolve()
  }

  private setSpeed(mul: number): void {
    this.state.speedMul = mul
    this.emit({ type: 'speedUp', speedMul: mul })
  }

  private tickChest(realDt: number, simDt: number): void {
    const s = this.state
    const chest = s.chest
    if (chest !== null) {
      chest.x += chest.vx * simDt
      if ((chest.vx > 0 && chest.x > COLS + chest.r) || (chest.vx < 0 && chest.x < -chest.r)) {
        s.chest = null
        this.emit({ type: 'chestGone' })
      }
      return
    }
    s.chestTimer -= realDt
    if (s.chestTimer > 0) return
    s.chestTimer = CHEST_EVERY
    const dir = this.rng.chance(0.5) ? 1 : -1
    s.chest = {
      x: dir > 0 ? -CHEST_R : COLS + CHEST_R,
      y: CHEST_Y,
      vx: (dir * (COLS + 2 * CHEST_R)) / CHEST_CROSS_TIME,
      r: CHEST_R
    }
    this.emit({ type: 'chestAppear' })
  }

  // ─── Phases ────────────────────────────────────────────────────────────────
  private setPhase(phase: Phase): void {
    this.state.phase = phase
    this.state.phaseTime = 0
    this.emit({ type: 'phase', phase })
  }

  private enterResolve(): void {
    const s = this.state
    s.fever = false
    s.warcryActive = false
    s.speedMul = 1
    if (s.nextLauncherX !== null) s.launcherX = s.nextLauncherX
    this.emit({ type: 'volleyEnd', hits: s.volleyHits })
    this.setPhase('resolve')
    if (this.pendingHeal) {
      this.pendingHeal = false
      this.applyHealSkill()
    }
    this.tickDots()
    this.dryadHeals()
    // FTUE guarantee: the first merge lands on turn 3 however wild the aim —
    // every "+1" left on the board is collected once the volley is over.
    if (s.config.ftue && s.row <= FTUE_AUTO_COLLECT_ROWS) {
      for (const p of s.pickups.slice()) if (p.kind === 'ball') this.collectPickup(null, p, true)
    }
  }

  private enterAdvance(): void {
    const s = this.state
    this.setPhase('advance')
    // Sludge lasts exactly one volley: it expires before anything moves.
    for (let i = s.hazards.length - 1; i >= 0; i--) {
      const h = s.hazards[i]!
      h.turns--
      if (h.turns <= 0) {
        this.grid.setHazard(h.col, h.row, false)
        s.hazards.splice(i, 1)
      }
    }
    this.goblinHops()
    this.marchAll()
    this.emit({ type: 'march', rows: 1 })
    this.centaurSludge()
    this.slimeTowerSpawn()
    this.spawnNextRow()
    this.breachPending = false
    for (const m of s.monsters) {
      if (m.row + m.h > ROWS) { this.breachPending = true; break }
    }
  }

  private endAdvance(): void {
    const s = this.state
    if (!this.breachPending) {
      this.enterAim()
      return
    }
    this.breachPending = false
    this.stats.breaches++
    if (s.shields > 0) {
      s.shields--
      this.emit({ type: 'shieldBlock' })
      this.clearBottom()
      this.emit({ type: 'continued', how: 'shield' })
      this.enterAim()
      return
    }
    this.setPhase('breach')
    this.emit({ type: 'breach' })
  }

  private enterAim(): void {
    const s = this.state
    // Carbuncles' gem shields grow back: "blocks the first hit EVERY turn".
    for (const m of s.monsters) {
      if (m.kind !== 'carbuncle' || m.shield) continue
      m.shield = true
      this.emit({ type: 'shieldUp', monsterId: m.id })
    }
    this.setPhase('aim')
    if (s.monsters.length === 0) return
    let bottom = -Infinity
    for (const m of s.monsters) if (m.row + m.h > bottom) bottom = m.row + m.h
    const rowsLeft = ROWS - bottom
    if (rowsLeft <= DANGER_ROWS) this.emit({ type: 'danger', rowsLeft: Math.max(0, rowsLeft) })
  }

  // ─── Balls ─────────────────────────────────────────────────────────────────
  private allocBall(i: number): SimBall {
    let b = this.pool[i]
    if (b === undefined) {
      b = { id: 0, tier: 1, x: 0, y: 0, vx: 0, vy: 0, active: false, landed: false, ghost: false, pierceLeft: 0, hits: 0, passing: null }
      this.pool[i] = b
    }
    return b
  }

  private resetBall(b: SimBall, tier: number, ghost: boolean): void {
    b.id = this.ballSeq++
    b.tier = tier
    b.vx = 0
    b.vy = 0
    b.active = false
    b.landed = false
    b.ghost = ghost
    b.pierceLeft = ballAbility(tier) === 'pierce' ? 1 : 0
    b.hits = 0
    b.passing = null
  }

  private launchNext(): void {
    const s = this.state
    if (this.launchIndex >= this.volleyCount) return
    const b = s.balls[this.launchIndex++] as SimBall
    b.x = s.launcherX
    b.y = launchY()
    b.vx = Math.cos(this.angle) * this.volleySpeed
    b.vy = -Math.sin(this.angle) * this.volleySpeed
    b.active = true
    this.emit({ type: 'launch', ballId: b.id, tier: b.tier })
  }

  private landBall(b: SimBall): void {
    const s = this.state
    b.active = false
    b.landed = true
    b.vx = 0
    b.vy = 0
    let first = false
    if (!b.ghost && s.nextLauncherX === null) {
      s.nextLauncherX = clamp(b.x, LAUNCH_MARGIN, COLS - LAUNCH_MARGIN)
      first = true
    }
    this.emit({ type: 'ballLanded', ballId: b.id, x: b.x, first })
  }

  private spawnGhosts(x: number, y: number): void {
    const s = this.state
    const tier = Math.max(1, (s.tray[0] ?? 1) - 1)
    for (let k = 0; k < LEGION_BALLS; k++) {
      const b = this.allocBall(s.balls.length)
      this.resetBall(b, tier, true)
      const a = Math.PI / 2 + (k - (LEGION_BALLS - 1) / 2) * 0.4
      b.x = clamp(x, BALL_R, COLS - BALL_R)
      b.y = Math.max(BALL_R, y)
      b.vx = Math.cos(a) * this.volleySpeed
      b.vy = -Math.sin(a) * this.volleySpeed
      b.active = true
      s.balls.push(b)
      this.emit({ type: 'launch', ballId: b.id, tier })
    }
  }

  // ─── Hits & abilities ──────────────────────────────────────────────────────
  private onBallHit(b: SimBall, m: Monster, nx: number, ny: number): boolean {
    const s = this.state
    s.volleyHits++
    b.hits++
    this.stats.hits++
    this.countCombo()
    // A carbuncle's gem shield takes the hit whole: no damage, no ability, the
    // ball bounces off. It still counts toward the combo — it WAS a hit.
    if (m.shield) {
      this.popShield(m, b.x - nx * BALL_R, b.y - ny * BALL_R)
      return true
    }
    const ability = ballAbility(b.tier)
    let dmg = ballDamage(b.tier, s.config.damageMult)
    if (s.warcryActive) dmg *= 2
    const crit = this.rng.chance(CRIT_CHANCE)
    if (crit) dmg *= CRIT_MULT
    const crush = ability === 'crush' && (m.kind === 'ogre' || m.kind === 'boss')
    if (crush) dmg *= CRUSH_MULT
    const hx = b.x - nx * BALL_R
    const hy = b.y - ny * BALL_R
    const loud = this.listeners.length > 0
    if (loud) this.emit({ type: 'hit', monsterId: m.id, ballId: b.id, tier: b.tier, dmg, x: hx, y: hy, ability, crit })

    let pierce = false
    if (ability === 'pierce' && b.pierceLeft > 0) {
      b.pierceLeft--
      pierce = true
      if (loud) this.emit({ type: 'abilityProc', ability, x: hx, y: hy, monsterId: m.id })
    }
    if (crush && loud) this.emit({ type: 'abilityProc', ability, x: hx, y: hy, monsterId: m.id })

    const killed = this.damage(m, dmg)
    switch (ability) {
      case 'burn':
        if (!killed) {
          const fresh = m.burnTurns <= 0
          m.burnDmg = Math.max(m.burnDmg, dmg * BURN_FRACTION)
          m.burnTurns = BURN_TURNS
          if (fresh && loud) this.emit({ type: 'abilityProc', ability, x: hx, y: hy, monsterId: m.id })
        }
        break
      case 'knockback':
        if (!killed && ny !== -1) this.knockback(m, hx, hy)
        break
      case 'freeze':
        // Bosses shrug off freeze: T4 balls would otherwise pin every boss.
        if (!killed && m.kind !== 'boss' && m.frozen < 1) {
          m.frozen = 1
          if (loud) this.emit({ type: 'abilityProc', ability, x: hx, y: hy, monsterId: m.id })
        }
        break
      case 'splash':
        this.splash(m, dmg * SPLASH_FRACTION, hx, hy)
        break
      case 'chain':
        this.chain(m, dmg * CHAIN_FRACTION, hx, hy)
        break
      case 'poison':
        if (!killed) {
          m.poisonStacks = Math.min(POISON_MAX_STACKS, m.poisonStacks + 1)
          m.poisonDmg = Math.max(m.poisonDmg, dmg * POISON_FRACTION)
          if (loud) this.emit({ type: 'abilityProc', ability, x: hx, y: hy, monsterId: m.id })
        }
        break
      case 'midas': {
        const coins = killCoins(s.row, 'slime', false) * MIDAS_FRACTION * s.config.coinMult * (s.fever ? 2 : 1)
        this.grantCoins(Math.max(1, Math.round(coins)), hx, hy, 'midas')
        if (loud) this.emit({ type: 'abilityProc', ability, x: hx, y: hy, monsterId: m.id })
        break
      }
      case 'eruption':
        if (b.hits % ERUPTION_EVERY === 0) this.eruption(m, dmg * eruptionFraction(b.tier), hx, hy)
        break
      default:
        break
    }
    return !pierce
  }

  private countCombo(): void {
    const s = this.state
    const h = s.volleyHits
    if (COMBO_MARKS.includes(h)) this.emit({ type: 'combo', hits: h })
    if (h === FEVER_HITS && !s.fever) {
      s.fever = true
      this.emit({ type: 'fever' })
    }
  }

  private knockback(m: Monster, hx: number, hy: number): void {
    if (m.kind === 'boss' || m.row <= 0) return
    if (this.knocked.get(m.id) === this.state.turn) return
    const up = m.row - 1
    for (let c = m.col; c < m.col + m.w; c++) if (!this.grid.isFree(c, up)) return
    // Never drop a box onto a ball in flight.
    const l = m.col - BALL_R
    const r = m.col + m.w + BALL_R
    const t = up - BALL_R
    const btm = up + 1 + BALL_R
    for (const b of this.state.balls) {
      if (b.active && b.x > l && b.x < r && b.y > t && b.y < btm) return
    }
    this.knocked.set(m.id, this.state.turn)
    this.grid.removeMonster(m)
    m.row = up
    this.grid.putMonster(m)
    if (this.listeners.length > 0) this.emit({ type: 'abilityProc', ability: 'knockback', x: hx, y: hy, monsterId: m.id })
  }

  /** Distinct monsters sharing an edge with `m`. */
  private neighbours(m: Monster, out: Monster[]): Monster[] {
    out.length = 0
    const add = (c: number, r: number): void => {
      const n = this.grid.monsterAt(c, r)
      if (n !== null && n !== m && !out.includes(n)) out.push(n)
    }
    for (let c = m.col; c < m.col + m.w; c++) { add(c, m.row - 1); add(c, m.row + m.h) }
    for (let r = m.row; r < m.row + m.h; r++) { add(m.col - 1, r); add(m.col + m.w, r) }
    return out
  }

  private readonly scratchA: Monster[] = []

  private splash(m: Monster, dmg: number, hx: number, hy: number): void {
    const list = this.neighbours(m, this.scratchA)
    if (list.length === 0) return
    const ids = this.listeners.length > 0 ? list.map(n => n.id) : undefined
    for (const n of list.slice()) this.damage(n, dmg)
    if (ids) this.emit({ type: 'abilityProc', ability: 'splash', x: hx, y: hy, monsterId: m.id, targets: ids })
  }

  private chain(m: Monster, dmg: number, hx: number, hy: number): void {
    const s = this.state
    const cx = m.col + m.w / 2
    const cy = m.row + m.h / 2
    let a: Monster | null = null
    let ad = Infinity
    let b: Monster | null = null
    let bd = Infinity
    for (const n of s.monsters) {
      if (n === m || n.row + n.h <= 0) continue
      const dx = n.col + n.w / 2 - cx
      const dy = n.row + n.h / 2 - cy
      const d = dx * dx + dy * dy
      if (d > CHAIN_RANGE * CHAIN_RANGE) continue
      if (d < ad) { b = a; bd = ad; a = n; ad = d } else if (d < bd) { b = n; bd = d }
    }
    if (a === null) return
    const second = CHAIN_JUMPS >= 2 ? b : null
    if (this.listeners.length > 0) {
      const targets = second !== null ? [a.id, second.id] : [a.id]
      this.emit({ type: 'abilityProc', ability: 'chain', x: hx, y: hy, monsterId: m.id, targets })
    }
    this.damage(a, dmg)
    if (second !== null) this.damage(second, dmg)
  }

  private eruption(m: Monster, dmg: number, hx: number, hy: number): void {
    const s = this.state
    const cx = Math.floor(clamp(hx, 0, COLS - 0.001))
    const cy = Math.floor(hy)
    const hitList: Monster[] = []
    for (const n of s.monsters) {
      if (n === m) continue
      if (n.col < cx + 2 && n.col + n.w > cx - 1 && n.row < cy + 2 && n.row + n.h > cy - 1) hitList.push(n)
    }
    if (this.listeners.length > 0) {
      this.emit({ type: 'abilityProc', ability: 'eruption', x: hx, y: hy, monsterId: m.id, targets: hitList.map(n => n.id) })
    }
    for (const n of hitList) this.damage(n, dmg)
  }

  /** Applies damage; returns true if it killed. A carbuncle's shield blocks
   *  the first damage of any kind — splash, chain, eruption, meteor, a DoT
   *  tick — and breaks doing it. */
  private damage(m: Monster, dmg: number): boolean {
    if (m.hp <= 0 || !(dmg > 0)) return false
    if (m.shield) {
      this.popShield(m, m.col + m.w / 2, m.row + m.h / 2)
      return false
    }
    this.stats.damage += Math.min(m.hp, dmg)
    m.hp -= dmg
    if (m.hp <= 1e-6) {
      m.hp = 0
      this.killMonster(m)
      return true
    }
    if (m.kind === 'boss' && !m.enraged && m.hp < BOSS_ENRAGE_AT * m.maxHp) {
      m.enraged = true
      this.emit({ type: 'bossEnrage', monsterId: m.id })
    }
    return false
  }

  private killMonster(m: Monster): void {
    const s = this.state
    m.hp = 0
    const i = s.monsters.indexOf(m)
    if (i >= 0) s.monsters.splice(i, 1)
    this.grid.removeMonster(m)
    this.knocked.delete(m.id)
    const x = m.col + m.w / 2
    const y = m.row + m.h / 2
    const spawnRow = m.spawnRow ?? s.row
    let coins = 0
    if (m.kind !== 'boss') {
      const fever = s.fever && s.phase === 'volley' ? 2 : 1
      const share = m.mini ? IMP_MINI_COINS : 1
      coins = Math.max(1, Math.round(killCoins(spawnRow, m.kind, m.corrupted) * share * s.config.coinMult * fever))
    }
    this.stats.kills++
    const kill: EngineEvent = { type: 'kill', monsterId: m.id, kind: m.kind, corrupted: m.corrupted, x, y, coins, row: spawnRow }
    if (m.bossKind) kill.bossKind = m.bossKind
    this.emit(kill)
    if (coins > 0) this.grantCoins(coins, x, y, 'kill')
    if (m.kind === 'imp' && !m.mini && this.noSplit === 0) this.splitImp(m)
    if (m.kind === 'boss') {
      if (s.bossId === m.id) s.bossId = null
      this.stats.bossKills++
      const bounty = Math.max(1, Math.round(bossBounty(spawnRow) * s.config.coinMult))
      // The FTUE script ends with the first boss: normal generation from here.
      if (s.config.ftue) s.config.ftue = false
      this.emit({ type: 'bossDefeated', monsterId: m.id, bossKind: m.bossKind ?? 'slime-tower', row: spawnRow, bounty })
    }
  }

  /** A carbuncle's gem shield breaks (it grows back at the next aim phase). */
  private popShield(m: Monster, x: number, y: number): void {
    m.shield = false
    this.emit({ type: 'shieldPop', monsterId: m.id, x, y })
  }

  /** A kill that no rule may refuse — meteor continue, execute, the boss's
   *  throw-back: through a carbuncle's shield, and with `split` false, without
   *  an imp splitting into the rows being cleared. */
  private slay(m: Monster, split: boolean): void {
    m.shield = false
    if (!split) this.noSplit++
    this.damage(m, m.hp)
    if (!split) this.noSplit--
  }

  /**
   * A defeated imp bursts into up to two little imps: its own cell first, then
   * left, right and above (never below — that is a free row toward the line).
   * A cell must be on the board and empty — no monster, pickup or sludge, and
   * no ball in flight inside it (the ball that killed the imp only TOUCHES its
   * cell, and is bouncing away).
   */
  private splitImp(m: Monster): void {
    const s = this.state
    const hp = Math.max(1, Math.round(m.maxHp * IMP_MINI_HP))
    const cells: readonly (readonly [number, number])[] = [[m.col, m.row], [m.col - 1, m.row], [m.col + 1, m.row], [m.col, m.row - 1]]
    const inner = BALL_R * 0.6
    const childIds: number[] = []
    for (const [c, r] of cells) {
      if (childIds.length >= 2) break
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS || !this.grid.isFree(c, r)) continue
      let ballInside = false
      for (const b of s.balls) {
        if (!b.active) continue
        const nx = b.x < c ? c : b.x > c + 1 ? c + 1 : b.x
        const ny = b.y < r ? r : b.y > r + 1 ? r + 1 : b.y
        if ((b.x - nx) * (b.x - nx) + (b.y - ny) * (b.y - ny) < inner * inner) { ballInside = true; break }
      }
      if (ballInside) continue
      const child = this.spawnMonster('imp', c, r, m.corrupted, hp, m.spawnRow ?? s.row)
      child.mini = true
      childIds.push(child.id)
    }
    if (childIds.length > 0) this.emit({ type: 'split', monsterId: m.id, x: m.col + 0.5, y: m.row + 0.5, childIds })
  }

  private grantCoins(amount: number, x: number, y: number, source: 'kill' | 'pickup' | 'midas' | 'chest' | 'boss'): void {
    if (!(amount > 0)) return
    this.stats.coins += amount
    this.emit({ type: 'coins', amount, x, y, source })
  }

  // ─── Pickups, tray, skills, chest ──────────────────────────────────────────
  private addBallToTray(tier: number): void {
    const s = this.state
    this.emit({ type: 'trayAdd', tier })
    addToTray(s.tray, tier, s.config.trayCapacity, this.traySink)
  }

  private collectPickup(_b: SimBall | null, p: Pickup, auto = false): void {
    const s = this.state
    const i = s.pickups.indexOf(p)
    if (i >= 0) s.pickups.splice(i, 1)
    this.grid.removePickup(p)
    const x = p.col + 0.5
    const y = p.row + 0.5
    const e: EngineEvent = { type: 'pickup', pickupId: p.id, kind: p.kind, x, y }
    if (p.skill) e.skill = p.skill
    if (auto) e.auto = true
    this.emit(e)
    if (p.kind === 'ball') {
      this.stats.ballsCollected++
      this.fxX = x
      this.fxY = y
      this.addBallToTray(1)
    } else if (p.kind === 'coin') {
      this.grantCoins(p.amount ?? 1, x, y, 'pickup')
    } else if (p.skill) {
      this.triggerSkill(p.skill, x, y)
    }
  }

  private triggerSkill(skill: SkillId, x: number, y: number): void {
    const s = this.state
    this.emit({ type: 'skill', skill, x, y })
    switch (skill) {
      case 'meteor':
        for (const m of s.monsters.slice()) {
          this.damage(m, m.maxHp * (m.kind === 'boss' ? METEOR_BOSS_FRACTION : METEOR_FRACTION))
        }
        break
      case 'warcry':
        s.warcryArmed = true
        break
      case 'legion':
        if (s.phase === 'volley') this.spawnGhosts(x, y)
        break
      case 'pact': {
        const best = s.tray[0] ?? 1
        this.fxX = x
        this.fxY = y
        if (pactTray(s.tray, s.config.trayCapacity, this.traySink) === 'add') this.emit({ type: 'trayAdd', tier: best })
        break
      }
      case 'shield':
        s.shields++
        break
      case 'execute': {
        let top: Monster | null = null
        for (const m of s.monsters) if (top === null || m.hp > top.hp) top = m
        if (top === null) break
        if (top.kind === 'boss') this.damage(top, top.maxHp * EXECUTE_BOSS_FRACTION)
        else this.slay(top, true)
        break
      }
      case 'heal':
        this.pendingHeal = true
        break
      case 'revive':
        s.revives++
        break
    }
  }

  private openChest(b: SimBall): void {
    const s = this.state
    const chest = s.chest
    if (chest === null) return
    s.chest = null
    const coins = Math.max(1, Math.round(chestCoins(s.row) * s.config.coinMult * (s.fever ? 2 : 1)))
    const skill = this.rng.chance(CHEST_SKILL_CHANCE) ? randomSkill(this.rng) : null
    const e: EngineEvent = { type: 'chestHit', x: chest.x, y: chest.y, coins }
    if (skill) e.skill = skill
    this.emit(e)
    this.grantCoins(coins, chest.x, chest.y, 'chest')
    if (skill) this.triggerSkill(skill, b.x, b.y)
  }

  // ─── Resolve ───────────────────────────────────────────────────────────────
  private tickDots(): void {
    const s = this.state
    for (const m of s.monsters.slice()) {
      if (m.hp <= 0) continue
      const x = m.col + m.w / 2
      const y = m.row + m.h / 2
      if (m.burnTurns > 0) {
        const dmg = m.burnDmg
        m.burnTurns--
        if (m.burnTurns <= 0) m.burnDmg = 0
        this.emit({ type: 'dot', monsterId: m.id, dmg, kind: 'burn', x, y })
        if (this.damage(m, dmg)) continue
      }
      if (m.poisonStacks > 0) {
        const dmg = m.poisonStacks * m.poisonDmg
        this.emit({ type: 'dot', monsterId: m.id, dmg, kind: 'poison', x, y })
        this.damage(m, dmg)
      }
    }
  }

  private dryadHeals(): void {
    const s = this.state
    const around: Monster[] = []
    for (const d of s.monsters) {
      if (d.kind !== 'dryad' || d.hp <= 0) continue
      for (const n of this.neighbours(d, around)) {
        // Bosses are exempt: a dryad parked beside a boss would out-heal a
        // casual player's whole volley.
        if (n.kind === 'boss' || n.hp >= n.maxHp) continue
        const amount = Math.min(n.maxHp - n.hp, n.maxHp * DRYAD_HEAL)
        n.hp += amount
        this.emit({ type: 'heal', monsterId: n.id, amount, byId: d.id })
      }
    }
  }

  /** Heal skill: everything steps back up a row where it can. Processed top
   *  first so whole stacks shift, which is what saves the bottom rows. */
  private applyHealSkill(): void {
    const s = this.state
    const order = s.monsters.slice().sort((a, b) => a.row - b.row || a.id - b.id)
    let moved = false
    for (const m of order) {
      const up = m.row - 1
      if (up < (m.kind === 'boss' ? -2 : 0)) continue
      let free = true
      for (let c = m.col; c < m.col + m.w && free; c++) {
        const other = this.grid.monsterAt(c, up)
        if ((other !== null && other !== m) || this.grid.pickupAt(c, up) !== null || this.grid.hazardAt(c, up)) free = false
      }
      if (!free) continue
      this.grid.removeMonster(m)
      m.row = up
      this.grid.putMonster(m)
      moved = true
    }
    if (moved) this.emit({ type: 'march', rows: -1 })
  }

  // ─── Advance ───────────────────────────────────────────────────────────────
  private goblinHops(): void {
    const s = this.state
    for (const m of s.monsters) {
      if (m.kind !== 'goblin' || m.frozen > 0 || m.row < 0) continue
      const dir = this.rng.chance(0.5) ? 1 : -1
      for (const d of [dir, -dir]) {
        const to = m.col + d
        if (to < 0 || to >= COLS || !this.grid.isFree(to, m.row)) continue
        const from = m.col
        this.grid.removeMonster(m)
        m.col = to
        this.grid.putMonster(m)
        this.emit({ type: 'hop', monsterId: m.id, fromCol: from, toCol: to })
        break
      }
    }
  }

  private canDescend(m: Monster): boolean {
    const r = m.row + m.h
    if (r >= ROWS) return true
    for (let c = m.col; c < m.col + m.w; c++) {
      const other = this.grid.monsterAt(c, r)
      if ((other !== null && other !== m) || this.grid.pickupAt(c, r) !== null) return false
    }
    return true
  }

  private marchAll(): void {
    const s = this.state
    // Bottom first, so each mover sees the cell below already vacated; frozen
    // monsters (and whatever piles up above them) stay put.
    type Mover = { m: Monster | null; p: Pickup | null; bottom: number; id: number }
    const movers: Mover[] = []
    for (const m of s.monsters) movers.push({ m, p: null, bottom: m.row + m.h, id: m.id })
    for (const p of s.pickups) movers.push({ m: null, p, bottom: p.row + 1, id: p.id })
    movers.sort((a, b) => b.bottom - a.bottom || a.id - b.id)
    for (const mv of movers) {
      const m = mv.m
      if (m !== null) {
        if (m.frozen > 0) { m.frozen--; continue }
        // A treant rests every other turn (and holds up whatever is behind it).
        if (restsAt(m, s.turn)) continue
        // A cyclops charges two rows every other turn; so does an enraged boss, every turn.
        const charge = chargesAt(m, s.turn)
        const steps = (m.kind === 'boss' && m.enraged) || charge ? 2 : 1
        let moved = 0
        for (let k = 0; k < steps; k++) {
          if (!this.canDescend(m)) break
          this.grid.removeMonster(m)
          m.row++
          this.grid.putMonster(m)
          moved++
        }
        if (charge && moved === 2) this.emit({ type: 'charge', monsterId: m.id, rows: 2 })
        continue
      }
      const p = mv.p!
      if (p.row + 1 >= ROWS) {
        // A "+1" that reaches the launcher line still joins the tray (Ballz's
        // ~1 ball per turn, whatever the aim); coins and skills are lost.
        if (p.kind === 'ball') this.collectPickup(null, p, true)
        else {
          this.grid.removePickup(p)
          const i = s.pickups.indexOf(p)
          if (i >= 0) s.pickups.splice(i, 1)
        }
        continue
      }
      if (!this.grid.isFree(p.col, p.row + 1)) continue
      this.grid.removePickup(p)
      p.row++
      this.grid.putPickup(p)
    }
  }

  private centaurSludge(): void {
    const s = this.state
    for (const m of s.monsters) {
      if (m.kind !== 'centaur' || (s.turn + m.id) % 2 !== 0) continue
      const r = m.row + 1
      if (r < 0 || r >= ROWS || !this.grid.isFree(m.col, r)) continue
      const h: Hazard = { id: this.nextId++, col: m.col, row: r, turns: 1 }
      s.hazards.push(h)
      this.grid.setHazard(h.col, h.row, true)
      this.emit({ type: 'sludge', hazardId: h.id, col: h.col, row: h.row, byId: m.id })
    }
  }

  private slimeTowerSpawn(): void {
    const s = this.state
    if (s.bossId === null || s.turn % 2 !== 0) return
    const boss = s.monsters.find(m => m.id === s.bossId)
    if (!boss || boss.bossKind !== 'slime-tower') return
    const sides = this.rng.chance(0.5) ? [boss.col - 1, boss.col + boss.w] : [boss.col + boss.w, boss.col - 1]
    // Top visible row first, and never within 3 marches of the line: a minion
    // dropped beside the tower's feet breached two turns later in the sim.
    for (let r = Math.max(0, boss.row); r < boss.row + boss.h; r++) {
      for (const c of sides) {
        if (r > ROWS - 4 || !this.grid.isFree(c, r)) continue
        this.spawnMonster('slime', c, r, false, monsterHp(s.row, 'slime', false), s.row)
        return
      }
    }
  }

  // ─── Spawning ──────────────────────────────────────────────────────────────
  private spawnMonster(kind: MonsterKind, col: number, row: number, corrupted: boolean, hp: number, spawnRow: number): Monster {
    const { w, h } = footprint(kind)
    const m: Monster = {
      id: this.nextId++, kind, corrupted, col, row, w, h, hp, maxHp: hp, frozen: 0,
      burnDmg: 0, burnTurns: 0, poisonStacks: 0, poisonDmg: 0, enraged: false, spawnRow
    }
    if (kind === 'carbuncle') m.shield = true
    this.state.monsters.push(m)
    this.grid.putMonster(m)
    this.emit({ type: 'monsterSpawn', monsterId: m.id, kind })
    return m
  }

  private spawnPickup(kind: PickupKind, col: number, row: number, skill?: SkillId, amount?: number): void {
    const p: Pickup = { id: this.nextId++, kind, col, row }
    if (skill) p.skill = skill
    if (amount !== undefined) p.amount = amount
    this.state.pickups.push(p)
    this.grid.putPickup(p)
  }

  private spawnNextRow(): void {
    const s = this.state
    s.row++
    const row = s.row
    const cfg = s.config
    const ftue = cfg.ftue
    const blocked = (c: number): boolean => !this.grid.isFree(c, 0)
    let boss = false

    if (ftue && row === 1) {
      // CONTRACT §7: three one-hit slimes dead ahead of the launcher.
      for (const c of [2, 3, 4]) if (!blocked(c)) this.spawnMonster('slime', c, 0, false, 1, row)
      this.emit({ type: 'rowSpawned', row, boss: false })
      return
    }

    const scripted = ftue && (row === 2 || row === 3)
    const lineCols = this.shotLineCols()
    if (row >= s.nextBossRow) {
      if (s.bossId === null) {
        const col = planBossCol(cfg.seed, row, blocked)
        if (col !== null) {
          this.spawnBoss(row, col)
          boss = true
        }
      }
      // A boss still alive (or no room for one) postpones the next boss by a row.
      s.nextBossRow = boss ? (Math.floor(row / BOSS_EVERY) + 1) * BOSS_EVERY : row + 1
    }

    const plan = planRow(cfg.seed, row, {
      bossAlive: s.bossId !== null,
      pickupLuck: cfg.pickupLuck,
      ftue,
      blocked,
      avoidCol: scripted ? (c => lineCols.includes(c)) : undefined,
      scriptBall: scripted,
      maxMonsters: boss ? 3 : scripted ? 3 : undefined,
      lightOnly: boss
    })
    for (const pm of plan.monsters) {
      const kind: WalkerKind = pm.kind
      this.spawnMonster(kind, pm.col, 0, pm.corrupted, monsterHp(row, kind, pm.corrupted, ftue), row)
    }
    if (plan.ballCol !== null) this.spawnPickup('ball', plan.ballCol, 0)
    if (plan.coinCol !== null) {
      this.spawnPickup('coin', plan.coinCol, 0, undefined, Math.max(1, Math.round(coinPickupCoins(row) * cfg.coinMult)))
    }
    if (plan.skillCol !== null && plan.skill) this.spawnPickup('skill', plan.skillCol, 0, plan.skill)
    if (scripted) this.placeScriptedBall()
    this.emit({ type: 'rowSpawned', row, boss })
  }

  private spawnBoss(row: number, col: number): void {
    const s = this.state
    const { bossKind, corrupted } = bossForRow(row)
    const m = this.spawnMonster('boss', col, -2, corrupted, monsterHp(row, 'boss', corrupted, s.config.ftue), row)
    m.bossKind = bossKind
    s.bossId = m.id
    this.emit({ type: 'bossSpawn', monsterId: m.id, bossKind, row })
  }

  /** Columns a straight-up shot from the launcher sweeps. */
  private shotLineCols(): number[] {
    const x = this.state.launcherX
    const out: number[] = []
    for (let c = Math.floor(x - BALL_R); c <= Math.floor(x + BALL_R); c++) if (c >= 0 && c < COLS) out.push(c)
    return out
  }

  /** FTUE turns 2–3: the "+1" sits straight above the launcher, below anything
   *  in that line, so the natural straight-up shot collects it. */
  private placeScriptedBall(): void {
    const s = this.state
    const col = clamp(Math.floor(s.launcherX), 0, COLS - 1)
    let row = 0
    for (const c of this.shotLineCols()) {
      for (const m of s.monsters) if (c >= m.col && c < m.col + m.w) row = Math.max(row, m.row + m.h)
    }
    for (let r = Math.min(row, ROWS - 2); r < ROWS - 1; r++) {
      if (this.grid.isFree(col, r)) { this.spawnPickup('ball', col, r); return }
    }
  }

  // ─── Breach continue ───────────────────────────────────────────────────────
  private clearBottom(): void {
    const s = this.state
    const line = ROWS - CONTINUE_CLEAR_ROWS
    for (const m of s.monsters.slice()) {
      if (m.kind !== 'boss' && m.row + m.h > line) this.slay(m, false)
    }
    const boss = s.bossId !== null ? s.monsters.find(m => m.id === s.bossId) : undefined
    if (boss && boss.row + boss.h > line && !this.damage(boss, boss.maxHp * CONTINUE_BOSS_FRACTION)) {
      this.grid.removeMonster(boss)
      boss.row = Math.max(-2, boss.row - CONTINUE_BOSS_PUSH)
      // Whatever stood where the boss is thrown back to is crushed.
      for (const m of s.monsters.slice()) {
        if (m === boss) continue
        if (m.col < boss.col + boss.w && m.col + m.w > boss.col && m.row < boss.row + boss.h && m.row + m.h > boss.row) {
          this.slay(m, false)
        }
      }
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const p = s.pickups[i]!
        if (p.col >= boss.col && p.col < boss.col + boss.w && p.row >= boss.row && p.row < boss.row + boss.h) {
          this.grid.removePickup(p)
          s.pickups.splice(i, 1)
        }
      }
      this.grid.putMonster(boss)
    }
    for (let i = s.hazards.length - 1; i >= 0; i--) {
      const h = s.hazards[i]!
      if (h.row >= line) {
        this.grid.setHazard(h.col, h.row, false)
        s.hazards.splice(i, 1)
      }
    }
  }

  // ─── Plumbing ──────────────────────────────────────────────────────────────
  private rebuildGrid(): void {
    const s = this.state
    this.grid.clear()
    for (const m of s.monsters) this.grid.putMonster(m)
    for (const p of s.pickups) this.grid.putPickup(p)
    for (const h of s.hazards) this.grid.setHazard(h.col, h.row, true)
  }

  private emit(e: EngineEvent): void {
    const ls = this.listeners
    if (ls.length === 0) return
    // Snapshot: a listener may unsubscribe (or subscribe) while we dispatch.
    const list = ls.length === 1 ? ls : ls.slice()
    for (const l of list) {
      try {
        l(e)
      } catch (err) {
        // A broken listener must never break the deterministic sim.
        console.error('[barrage] engine listener threw', err)
      }
    }
  }
}

// ─── Factories (binding names — see types.ts) ────────────────────────────────
/** Fresh run from row 1 (the FTUE script when `config.ftue`). Tray = [1]. */
export const createEngine = (config: EngineConfig): BarrageEngine => {
  const e = new BarrageEngine(config)
  e.beginRun(1, [1])
  return e
}

/** Checkpoint restart: fresh board whose first row is `row`, with `tray`. */
export const createEngineAtRow = (config: EngineConfig, row: number, tray: number[]): BarrageEngine => {
  const e = new BarrageEngine(config)
  e.beginRun(row, tray)
  return e
}

export const restoreEngine = (snap: RunSnapshot): BarrageEngine => {
  const e = new BarrageEngine(snap.config)
  e.loadSnapshot(snap)
  return e
}
