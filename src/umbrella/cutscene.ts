// ─── Cutscenes as data ───────────────────────────────────────────────────────
//
// A cutscene is a level plus a script: cloud rows drawn over the set, actors
// (Pweeg, Chad) that follow timed segments, sound cues and a fade in/out. The
// player below runs any CutsceneDef with the real renderer, so a script edited
// in the editor and the one the game plays are the same thing. The only part
// that is not hand-editable is a `frames` segment (Chad's float, baked from the
// real engine by the intro builder).
//
// Times are absolute seconds on the cutscene's clock; a segment is live while
// from <= t < to (`to` omitted = until the end).

import { createWorld, type World } from './engine'
import { render, type Camera, type Labels } from './renderer'
import { drawPweeg, drawUmbrella, type PweegPose } from './characters'
import { drawChad, flipArc, type ChadAction } from './chad'
import type { LevelDef, Vec } from './levels'
import type { Tuning } from './tuning'

export type CutsceneSfx = 'whoosh' | 'land' | 'open' | 'step' | 'cool'

export interface CloudRow { x0: number; x1: number; top: number; depth: number; fill: string }
export interface CueDef { at: number; sfx: CutsceneSfx }

interface SegBase { from: number; to?: number }
/** Chad's front-flip between two spots (needs `to`). */
export interface FlipSeg extends SegBase { kind: 'flip'; to: number; a: Vec; b: Vec; apex: number }
/** An actor held at a spot with one pose (Chad: any action; Pweeg: standing, optionally turning to the camera). */
export interface HoldSeg extends SegBase {
  kind: 'hold'; at: Vec; action?: ChadAction; pose?: PweegPose
  /** Turns to the camera this many seconds in. */
  frontAfter?: number
  /** Blinks between these seconds in. */
  blink?: [number, number]
}
/** A walk along the ground at `speed` px/s. */
export interface WalkSeg extends SegBase { kind: 'walk'; a: Vec; speed: number }
/** Pweeg hanging off an edge and lowering himself to the cloud below (needs `to`). */
export interface ClimbSeg extends SegBase { kind: 'climb'; to: number; edgeX: number; top: number; ground: number }
/** Pre-sampled path (Chad's float, simulated with the engine), `rate` frames per second. */
export interface FramesSeg extends SegBase {
  kind: 'frames'; rate: number
  frames: { x: number; y: number; airborne: boolean; vx: number }[]
}
export type Seg = FlipSeg | HoldSeg | WalkSeg | ClimbSeg | FramesSeg

export interface ActorDef { id: 'chad' | 'pweeg'; segs: Seg[] }

export interface CutsceneDef {
  id: string
  /** The campaign level id the set is built from. */
  level: number
  duration: number
  fadeIn: number
  /** At the end the cutscene's look cross-fades into the game's. */
  fadeOut: number
  clouds: CloudRow[]
  actors: ActorDef[]
  cues: CueDef[]
  /** A step sound every this many px of walking. */
  stepEvery: number
  /** The clock stops here until `release()`: Pweeg looks at the player until they take control. */
  waitAt?: number
  editedAt?: number
}

export interface Cutscene {
  update(dt: number): void
  /** Draws the frame; returns the camera used. */
  draw(ctx: CanvasRenderingContext2D, labels: Labels, dt: number): Camera
  /** Jump to the end: Pweeg in position, ready to play. */
  skip(): void
  /** True while the cutscene holds its last pose for the player. */
  readonly waiting: boolean
  /** The player took control: the cutscene carries on to its end. */
  release(): void
  /** Jumps to a time without sounds (the editor's scrubber). */
  seek(t: number): void
  readonly time: number
  readonly done: boolean
}

const STEP_STRIDE = 0.09

interface Pose {
  x: number; y: number
  action?: ChadAction; at: number; vx: number
  pose?: PweegPose; step: number; front: boolean; blink: boolean
}

const segAt = (a: ActorDef, t: number): Seg | undefined => a.segs.find((s) => t >= s.from && t < (s.to ?? Infinity))

/** Where an actor is, and how it looks, at time t (null: off stage). */
export const poseAt = (a: ActorDef, t: number): Pose | null => {
  const s = segAt(a, t)
  if (!s) return null
  const local = t - s.from
  const base = { step: 0, front: false, blink: false, vx: 0 }
  switch (s.kind) {
    case 'flip':
      return { ...base, ...flipArc(s.a, s.b, s.apex, local / Math.max(1e-6, s.to - s.from)), action: 'flip', at: local }
    case 'hold':
      return {
        ...base, ...s.at, action: s.action, pose: s.pose ?? 'stand', at: local,
        front: s.frontAfter !== undefined && local > s.frontAfter,
        blink: !!s.blink && local > s.blink[0] && local < s.blink[1]
      }
    case 'walk':
      return { ...base, x: s.a.x + local * s.speed, y: s.a.y, pose: 'walk', at: local, step: local * s.speed * STEP_STRIDE }
    case 'climb': {
      // Hanging from the edge by his hands, lowering himself, then the last little drop.
      const k = local / Math.max(1e-6, s.to - s.from)
      const x = s.edgeX + Math.min(1, k * 3) * 28
      const y = s.top + (s.ground - s.top) * (k < 0.7 ? k / 0.7 * 0.6 : 0.6 + ((k - 0.7) / 0.3) ** 2 * 0.4)
      return { ...base, x, y, pose: 'cheer', at: local }
    }
    case 'frames': {
      const f = s.frames[Math.min(s.frames.length - 1, Math.floor(local * s.rate))]!
      return { ...base, x: f.x, y: f.y, vx: f.vx, at: local, action: f.airborne ? 'float' : Math.abs(f.vx) > 20 ? 'walk' : 'idle' }
    }
  }
}

export const createCutscene = (def: CutsceneDef, level: LevelDef, tuning: Tuning, sfx: (name: CutsceneSfx) => void): Cutscene => {
  const size = { w: tuning.playerWidth, h: tuning.playerHeight }
  // The set: the level without its player drawn; currents keep flowing.
  const world: World = createWorld(level, size)
  const chad = def.actors.find((a) => a.id === 'chad')
  const pweeg = def.actors.find((a) => a.id === 'pweeg')
  const cues = [...def.cues].sort((a, b) => a.at - b.at)

  let time = 0
  let done = false
  let nextCue = 0
  let stepAcc = 0
  let released = def.waitAt === undefined
  let waiting = false
  /** Seconds spent waiting: the idle animations keep running while the clock holds. */
  let waited = 0
  let overlay: HTMLCanvasElement | null = null

  const drawClouds = (ctx: CanvasRenderingContext2D) => {
    ctx.save()
    // Inside the world only: never over the letterbox bars.
    ctx.beginPath()
    ctx.rect(0, 0, level.world.w, level.world.h)
    ctx.clip()
    for (const r of def.clouds) {
      ctx.fillStyle = r.fill
      ctx.beginPath()
      const n = Math.max(2, Math.round((r.x1 - r.x0) / 46))
      for (let i = 0; i <= n; i++) {
        const cx = r.x0 + ((r.x1 - r.x0) * i) / n
        const rad = 24 + ((i * 53) % 7) * 2
        ctx.moveTo(cx + rad, r.top + rad * 0.7)
        ctx.arc(cx, r.top + rad * 0.7, rad, 0, Math.PI * 2)
      }
      ctx.rect(r.x0, r.top + 16, r.x1 - r.x0, r.depth)
      ctx.fill()
    }
    ctx.restore()
  }

  /** One frame: the cutscene's look (clouds, wavy currents) or the game's (plain). */
  const drawScene = (ctx: CanvasRenderingContext2D, labels: Labels, dt: number, look: boolean): Camera => {
    const cam = render(ctx, world, labels, tuning, dt, undefined, { hidePlayer: true, windStyle: look ? 'squiggles' : 'arrows' })
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy)
    if (look) drawClouds(ctx)
    // Chad belongs to the cutscene's look: he fades out with it at the hand-over.
    const c = look && chad ? poseAt(chad, time) : null
    if (c) drawChad(ctx, c.x, c.y, { action: c.action ?? 'idle', t: c.at, facing: 1, w: size.w, h: size.h, vx: c.vx })
    const p = pweeg ? poseAt(pweeg, time) : null
    if (p) {
      drawPweeg(ctx, p.x, p.y, { pose: p.pose ?? 'stand', facing: 1, w: size.w, h: size.h, time: time + waited, step: p.step, front: p.front, blink: p.blink })
      if (p.pose !== 'cheer') drawUmbrella(ctx, p.x + size.w * 0.8, p.y - size.h * 0.35, { state: 'furled', tilt: 0.22, time })
    }
    // Fade in from black.
    if (time < def.fadeIn) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - time / def.fadeIn})`
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    return cam
  }

  return {
    get done() { return done },
    get time() { return time },
    get waiting() { return waiting },
    release() { released = true; waiting = false },
    seek(t) {
      time = Math.max(0, Math.min(def.duration, t))
      done = false
      stepAcc = 0
      released = true
      waiting = false
      nextCue = cues.findIndex((c) => c.at > time)
      if (nextCue < 0) nextCue = cues.length
      world.time = time
    },
    skip() { time = def.duration; done = true },
    update(dt) {
      if (done) return
      if (!released && time + dt >= def.waitAt!) {
        time = def.waitAt!
        waiting = true
        waited += dt
        world.time += dt
        return
      }
      time += dt
      // Currents flow under the actors; the level's own movers stay put.
      world.time += dt
      while (nextCue < cues.length && time >= cues[nextCue]!.at) sfx(cues[nextCue++]!.sfx)
      const seg = pweeg ? segAt(pweeg, time) : undefined
      if (seg?.kind === 'walk') {
        stepAcc += dt * seg.speed
        if (stepAcc >= def.stepEvery) { stepAcc -= def.stepEvery; sfx('step') }
      }
      if (time >= def.duration) done = true
    },
    draw(ctx, labels, dt) {
      // The camera follows where Pweeg will stand (a scrolling level opens on its start screen).
      world.player.x = level.spawn.x - world.player.w / 2
      world.player.y = level.spawn.y - world.player.h
      const fade = def.fadeOut > 0 ? Math.max(0, Math.min(1, (time - (def.duration - def.fadeOut)) / def.fadeOut)) : 0
      if (fade <= 0) return drawScene(ctx, labels, dt, true)
      // Cross-fade into the game's look, so the level starts without a jump.
      const cam = drawScene(ctx, labels, dt, false)
      const el = ctx.canvas
      overlay ??= document.createElement('canvas')
      if (overlay.width !== el.width || overlay.height !== el.height) { overlay.width = el.width; overlay.height = el.height }
      const octx = overlay.getContext('2d')
      if (octx) {
        drawScene(octx, labels, 0, true)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1 - fade
        ctx.drawImage(overlay, 0, 0)
        ctx.globalAlpha = 1
      }
      return cam
    }
  }
}
