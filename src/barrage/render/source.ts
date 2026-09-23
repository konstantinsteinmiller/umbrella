/**
 * What BarrageBoard needs from the outside world. In the game this is built
 * from `useBarrage()` + `useCollections()` (CONTRACT §10); the dev lab
 * `provide`s a sandbox source around its own engine instead, so it can stage
 * scenes without touching the player's saved run.
 */
import type { InjectionKey, Ref } from 'vue'
import type { EngineListener, IBarrageEngine } from '../engine/types'
import type { BallSkinId } from '../ballSkins'

export interface BoardSource {
  engine: Readonly<Ref<IBarrageEngine>>
  engineGen: Readonly<Ref<number>>
  holdSim: Readonly<Ref<boolean>>
  fire(angle: number): boolean
  /** Subscribe to engine events across engine swaps. */
  onEngineEvent(cb: EngineListener): () => void
  selectedLauncher: Readonly<Ref<number>>
  selectedSkin: Readonly<Ref<BallSkinId>>
  /** Rule-badge keys that have done their turns (`useCoach.retiredTags`).
   *  Absent (the dev lab): every non-slime monster wears its badge. */
  coachRetired?: Readonly<Ref<ReadonlySet<string>>>
}

export const BOARD_SOURCE_KEY: InjectionKey<BoardSource> = Symbol('barrage-board-source')
