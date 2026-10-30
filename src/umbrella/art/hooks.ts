// ─── Where the kite art layer plugs into the vector painters ───────────────
//
// Tiny on purpose, and EMPTY in every build: the painters (characters.ts,
// renderer.ts) ask `artLayer && kiteArt.x?.(…)` before drawing — `artLayer` is
// a build-time constant, so outside the kite and lantern builds the whole
// question folds away and the vector path is the only code there is. Those
// builds fill these slots from the lazily imported painted layer (paint.ts); a slot that
// returns false (no sheet yet, still loading, art switched off) leaves the
// vector drawing to draw, exactly as before.
import type { World } from '../engine'
import type { Hazard } from '../engine'
import type { ButtonDef, CheckpointDef, GateDef, PlatformDef, StarDef, WindDef } from '../levels'
import type { PweegLook, UmbrellaLook } from '../characters'
import type { Camera } from '../renderer'

export interface KiteArt {
  pweeg?: (ctx: CanvasRenderingContext2D, x: number, y: number, look: PweegLook) => boolean
  umbrella?: (ctx: CanvasRenderingContext2D, x: number, y: number, look: UmbrellaLook) => boolean
  /** The splat phase: flattened by a landing, or `hit` by an enemy / fan. */
  splat?: (ctx: CanvasRenderingContext2D, fx: number, fy: number, look: PweegLook, phaseTime: number, hit: boolean) => boolean
  hazard?: (ctx: CanvasRenderingContext2D, h: Hazard, w: World) => boolean
  wind?: (ctx: CanvasRenderingContext2D, wind: WindDef, def: WindDef, w: World, squiggles: boolean) => boolean
  /** Painted: true; painted and dressed as the goal it is, so it needs no FINISH word: 'dressed'. */
  platform?: (ctx: CanvasRenderingContext2D, p: PlatformDef, on: boolean, color: string | null) => boolean | 'dressed'
  button?: (ctx: CanvasRenderingContext2D, b: ButtonDef, on: boolean, color: string) => boolean
  checkpoint?: (ctx: CanvasRenderingContext2D, c: CheckpointDef, reached: boolean, time: number) => boolean
  /** A collectible (star, parasol, cloud), bobbing; `got` leaves a faint ghost (lantern). */
  collect?: (ctx: CanvasRenderingContext2D, s: Pick<StarDef, 'x' | 'y' | 'shape'>, got: boolean, time: number, phase: number) => boolean
  /** Where the last cheer drawn holds its raised hand (lantern), in the space it was drawn in: the
   *  furled umbrella's grip goes there. Null when there is none. */
  cheerHand?: () => { x: number; y: number } | null
  /** A warp gate: a torii with a swirling portal between its posts (lantern). */
  gate?: (ctx: CanvasRenderingContext2D, g: Pick<GateDef, 'x' | 'y' | 'w' | 'h'>, time: number) => boolean
  /** A painted sky behind the level, in SCREEN space (the lantern build). */
  backdrop?: (ctx: CanvasRenderingContext2D, cw: number, ch: number, cam: Camera, w: World) => boolean
  /** Weak phones: the sky lives on a still background canvas behind `canvas`, painted only when the
   *  screen changes size. True: the caller clears `canvas` to transparent instead of filling and
   *  painting the sky. */
  stillBackdrop?: (canvas: HTMLCanvasElement, fullBleed: boolean) => boolean
}

export const kiteArt: KiteArt = {}
