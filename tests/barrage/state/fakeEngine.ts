/**
 * A scripted stand-in for `BarrageEngine` — implements `IBarrageEngine` and
 * lets a test drive the exact event sequences the state layer must survive
 * (a breach on turn 3, a boss dying mid-volley, a hydrate under a volley)
 * without having to aim the real physics into them.
 */
import type {
  AimPath, BoardState, EngineConfig, EngineEvent, EngineListener, IBarrageEngine, Monster, Phase, RunSnapshot
} from '@/barrage/engine/types'

let seq = 0

export class FakeEngine implements IBarrageEngine {
  readonly state: BoardState
  readonly id = ++seq
  private listeners: EngineListener[] = []
  readonly calls = {
    fire: 0,
    addBalls: [] as [number, number][],
    continued: [] as ('meteor' | 'revive')[],
    setConfig: [] as Partial<EngineConfig>[]
  }

  constructor(config: EngineConfig, init: Partial<BoardState> = {}) {
    this.state = {
      config: { ...config },
      phase: 'aim',
      phaseTime: 0,
      row: 1,
      nextBossRow: 10,
      monsters: [],
      pickups: [],
      hazards: [],
      balls: [],
      tray: [1],
      launcherX: 3.5,
      nextLauncherX: null,
      volleyHits: 0,
      fever: false,
      warcryArmed: false,
      warcryActive: false,
      shields: 0,
      revives: 0,
      speedMul: 1,
      chestTimer: 120,
      chest: null,
      bossId: null,
      turn: 0,
      ...init
    }
  }

  // ─── IBarrageEngine ────────────────────────────────────────────────────────
  update(): void { /* scripted: tests drive the phases */ }
  aimPreview(): AimPath { return { points: [], hit: 'wall' } }
  canFire(): boolean { return this.state.phase === 'aim' }

  fire(angle: number): boolean {
    if (this.state.phase !== 'aim') return false
    this.calls.fire++
    this.state.turn++
    this.emit({ type: 'fire', angle, balls: this.state.tray.length })
    this.setPhase('volley')
    return true
  }

  recall(): void { /* no-op */ }

  continueAfterBreach(how: 'meteor' | 'revive'): boolean {
    if (this.state.phase !== 'breach') return false
    if (how === 'revive') {
      if (this.state.revives <= 0) return false
      this.state.revives--
    }
    this.calls.continued.push(how)
    this.emit({ type: 'continued', how })
    this.setPhase('aim')
    return true
  }

  addBalls(n: number, tier = 1): void {
    this.calls.addBalls.push([n, tier])
    for (let i = 0; i < n; i++) {
      this.emit({ type: 'trayAdd', tier })
      this.state.tray.push(tier)
    }
    this.state.tray.sort((a, b) => b - a)
  }

  setConfig(partial: Partial<EngineConfig>): void {
    this.calls.setConfig.push({ ...partial })
    Object.assign(this.state.config, partial)
  }

  on(listener: EngineListener): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter((l) => l !== listener) }
  }

  snapshot(): RunSnapshot | null {
    const s = this.state
    if (s.phase !== 'aim') return null
    return {
      v: 1,
      config: { ...s.config },
      row: s.row,
      nextBossRow: s.nextBossRow,
      monsters: s.monsters.map((m) => ({ ...m })),
      pickups: s.pickups.map((p) => ({ ...p })),
      hazards: s.hazards.map((h) => ({ ...h })),
      tray: [...s.tray],
      launcherX: s.launcherX,
      shields: s.shields,
      revives: s.revives,
      warcryArmed: s.warcryArmed,
      chestTimer: s.chestTimer,
      turn: s.turn,
      rng: 7,
      nextId: 100
    }
  }

  // ─── Script helpers ────────────────────────────────────────────────────────
  emit(e: EngineEvent): void {
    for (const l of [...this.listeners]) l(e)
  }

  setPhase(phase: Phase): void {
    this.state.phase = phase
    this.emit({ type: 'phase', phase })
  }

  /** Finish the running volley and settle back in 'aim', spawning the next row. */
  endTurn(hits = 5): void {
    this.state.volleyHits = hits
    this.emit({ type: 'volleyEnd', hits })
    this.setPhase('resolve')
    this.setPhase('advance')
    this.state.row++
    this.emit({ type: 'rowSpawned', row: this.state.row, boss: this.state.row % 10 === 0 })
    this.setPhase('aim')
  }

  /** Finish the running volley in a breach. */
  breachNow(): void {
    this.emit({ type: 'volleyEnd', hits: 3 })
    this.setPhase('resolve')
    this.setPhase('advance')
    this.setPhase('breach')
    this.emit({ type: 'breach' })
  }

  /** A tray merge the way the engine reports it: add first, then the merge. */
  merge(fromTier: number): void {
    const toTier = fromTier + 1
    const i = this.state.tray.lastIndexOf(fromTier)
    if (i >= 0) this.state.tray.splice(i, 1)
    const j = this.state.tray.lastIndexOf(fromTier)
    if (j >= 0) this.state.tray.splice(j, 1)
    this.state.tray.push(toTier)
    this.state.tray.sort((a, b) => b - a)
    this.emit({ type: 'trayMerge', fromTier, toTier })
  }

  /** Spawn a live boss (for the HUD) — returns its monster id. */
  spawnBoss(hp = 100): number {
    const m: Monster = {
      id: 900 + this.id, kind: 'boss', bossKind: 'slime-tower', corrupted: false, col: 2, row: 0, w: 3, h: 3,
      hp, maxHp: hp, frozen: 0, burnDmg: 0, burnTurns: 0, poisonStacks: 0, poisonDmg: 0, enraged: false
    }
    this.state.monsters.push(m)
    this.state.bossId = m.id
    this.emit({ type: 'bossSpawn', monsterId: m.id, bossKind: 'slime-tower', row: this.state.row })
    return m.id
  }

  killBoss(bounty: number): void {
    const id = this.state.bossId ?? 0
    this.state.monsters = this.state.monsters.filter((m) => m.id !== id)
    this.state.bossId = null
    this.emit({ type: 'kill', monsterId: id, kind: 'boss', bossKind: 'slime-tower', corrupted: false, x: 3, y: 1, coins: 0, row: this.state.row })
    this.emit({ type: 'bossDefeated', monsterId: id, bossKind: 'slime-tower', row: this.state.row, bounty })
  }
}

export interface Made {
  kind: 'create' | 'createAtRow' | 'restore'
  engine: FakeEngine
  config: EngineConfig
  row?: number
  tray?: number[]
  snap?: RunSnapshot
}

/** An `EngineFactory` that records every engine it builds. */
export const makeFactory = () => {
  const made: Made[] = []
  const factory = {
    create: (config: EngineConfig) => {
      const engine = new FakeEngine(config)
      made.push({ kind: 'create', engine, config })
      return engine
    },
    createAtRow: (config: EngineConfig, row: number, tray: number[]) => {
      const engine = new FakeEngine(config, { row, tray: [...tray], nextBossRow: Math.ceil(row / 10) * 10 })
      made.push({ kind: 'createAtRow', engine, config, row, tray: [...tray] })
      return engine
    },
    restore: (snap: RunSnapshot) => {
      const engine = new FakeEngine(snap.config, {
        row: snap.row,
        nextBossRow: snap.nextBossRow,
        monsters: snap.monsters.map((m) => ({ ...m })),
        tray: [...snap.tray],
        shields: snap.shields,
        revives: snap.revives,
        warcryArmed: snap.warcryArmed,
        chestTimer: snap.chestTimer,
        turn: snap.turn
      })
      made.push({ kind: 'restore', engine, config: snap.config, snap })
      return engine
    }
  }
  const last = (): FakeEngine => {
    const m = made[made.length - 1]
    if (!m) throw new Error('no engine built yet')
    return m.engine
  }
  return { made, factory, last }
}
