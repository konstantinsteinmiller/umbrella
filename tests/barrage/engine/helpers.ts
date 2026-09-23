// Board builders for the engine suites: craft an exact position through the
// public snapshot/restore seam instead of reaching into engine internals.
import { restoreEngine, type BarrageEngine } from '@/barrage/engine/engine'
import { defaultConfig } from '@/barrage/engine/economy'
import type { EngineConfig, EngineEvent, Hazard, Monster, MonsterKind, Pickup } from '@/barrage/engine/types'

let seq = 5000

export const mon = (kind: MonsterKind, col: number, row: number, hp = 1e9, extra: Partial<Monster> = {}): Monster => {
  const w = kind === 'boss' ? 3 : kind === 'caterpillar' ? 2 : 1
  const h = kind === 'boss' ? 3 : 1
  return {
    id: seq++, kind, corrupted: false, col, row, w, h, hp, maxHp: hp, frozen: 0,
    burnDmg: 0, burnTurns: 0, poisonStacks: 0, poisonDmg: 0, enraged: false, spawnRow: 5, ...extra
  }
}

export const pick = (kind: Pickup['kind'], col: number, row: number, extra: Partial<Pickup> = {}): Pickup =>
  ({ id: seq++, kind, col, row, ...extra })

export interface BoardOpts {
  monsters?: Monster[]
  pickups?: Pickup[]
  hazards?: Hazard[]
  tray?: number[]
  launcherX?: number
  row?: number
  nextBossRow?: number
  shields?: number
  revives?: number
  config?: Partial<EngineConfig>
}

/** Restores the crafted board, then swaps the caller's own Monster objects
 *  back in (restore deep-copies) so tests can keep asserting on them. */
export const board = (o: BoardOpts = {}): BarrageEngine => {
  const e = restoreEngine({
    v: 1,
    config: defaultConfig({ seed: 7, ...o.config }),
    row: o.row ?? 5,
    nextBossRow: o.nextBossRow ?? 10,
    monsters: o.monsters ?? [],
    pickups: o.pickups ?? [],
    hazards: o.hazards ?? [],
    tray: o.tray ?? [1],
    launcherX: o.launcherX ?? 3.5,
    shields: o.shields ?? 0,
    revives: o.revives ?? 0,
    warcryArmed: false,
    chestTimer: 1e6,
    turn: 0,
    rng: 12345,
    nextId: seq + 1000
  })
  if (o.monsters) {
    e.state.monsters.splice(0, e.state.monsters.length, ...o.monsters)
    ;(e as unknown as { rebuildGrid(): void }).rebuildGrid()
  }
  return e
}

export const record = (e: BarrageEngine): EngineEvent[] => {
  const out: EngineEvent[] = []
  e.on(ev => out.push(ev))
  return out
}

export const ofType = <T extends EngineEvent['type']>(events: EngineEvent[], type: T): Extract<EngineEvent, { type: T }>[] =>
  events.filter((e): e is Extract<EngineEvent, { type: T }> => e.type === type)

/** Fires and plays the whole turn synchronously. */
export const turn = (e: BarrageEngine, angle: number): string => {
  e.fire(angle)
  return e.settle()
}

/** A turn where nothing is hit: fire, recall at once, play resolve/advance. */
export const pass = (e: BarrageEngine): string => {
  e.fire(Math.PI / 2)
  e.recall()
  return e.settle()
}
