// ─── Intro: the pre-game cutscene (intro.md, roadmap #0.7.0-10/-11) ──────────
//
// Plays on the campaign's first level, drawn by the game renderer: its start
// platform dressed as a two-tier cloud, its currents as the design doc's wavy
// lines. Chad front-flips in, lands, pauses and floats across (simulated with
// the real engine, so the demo shows the physics the player gets); then Pweeg
// walks in on the upper cloud, climbs down, walks to the level's spawn and
// turns to the camera — the frame Level 1 starts from, without a cut.
//
// Pure timeline: the scene owns the clock (update), the canvas (draw) and the
// sounds (the `sfx` callback). Skippable at any time.

import { createWorld, step, type World } from './engine'
import { render, type Camera, type Labels } from './renderer'
import { drawPweeg, drawUmbrella } from './characters'
import { drawChad, flipArc, FLIP_TIME, LAND_TIME } from './chad'
import type { LevelDef, PlatformDef, Vec } from './levels'
import type { Tuning } from './tuning'

export type IntroSfx = 'whoosh' | 'land' | 'open' | 'step' | 'cool'

export interface Intro {
  update(dt: number): void
  /** Draws the frame; returns the camera used. */
  draw(ctx: CanvasRenderingContext2D, labels: Labels, dt: number): Camera
  /** Jump to the end: Pweeg in position, ready to play. */
  skip(): void
  readonly done: boolean
}

// ── Beats (seconds) — intro.md §3 ──
const FADE_IN = 0.4
const FLIP_AT = 0.6
const PAUSE = 0.62
const PWEEG_GAP = 0.4
const WALK_SPEED = 115
const LOOK_DOWN = 0.4
const CLIMB = 0.9
const LOOK_AT_PLAYER = 0.5
const CHAD_MAX_FLOAT = 3.2
/** At the end the intro's look (clouds, wavy currents) fades into the game's. */
const FADE_OUT = 0.5

/** The level's start platform: the one the spawn stands on (else the nearest below it). */
export const startPlatform = (l: LevelDef): PlatformDef | undefined => {
  const under = l.platforms.filter((p) => l.spawn.x >= p.x && l.spawn.x <= p.x + p.w && p.y >= l.spawn.y - 4)
  return under.sort((a, b) => a.y - b.y)[0]
}

type Frame = Vec & { airborne: boolean; vx: number }

/** Chad's float, simulated: from `from`, right held, on the level without its finish
 *  (he is showing the move, not winning). Null when he does not get across cleanly. */
export const simulateChad = (l: LevelDef, from: Vec, tuning: Tuning, dt = 1 / 120): Frame[] | null => {
  const level: LevelDef = { ...l, spawn: from, platforms: l.platforms.map((p) => ({ ...p, finish: false })), hazards: [], buttons: [] }
  const w = createWorld(level, { w: tuning.playerWidth, h: tuning.playerHeight })
  const frames: Frame[] = []
  const start = from.x
  for (let t = 0; t < CHAD_MAX_FLOAT + 1; t += dt) {
    step(w, { left: false, right: true, toggle: false }, dt, tuning)
    const pl = w.player
    frames.push({ x: pl.x + pl.w / 2, y: pl.y + pl.h, airborne: !pl.grounded, vx: pl.vx })
    if (w.phase !== 'play') return null
    // Across: past the far side of the screen, or standing on another platform.
    const crossed = pl.x > l.world.w + 20 || (pl.grounded && pl.x > start + 200)
    if (crossed) return frames
  }
  return null
}

export const createIntro = (level: LevelDef, tuning: Tuning, sfx: (name: IntroSfx) => void): Intro => {
  const size = { w: tuning.playerWidth, h: tuning.playerHeight }
  // The set: the level without its player drawn; currents keep flowing.
  const world: World = createWorld(level, size)
  const P = startPlatform(level) ?? { x: 0, y: level.spawn.y, w: Math.max(200, level.spawn.x + 80), h: 20 }
  const edge = P.x + P.w
  const ground = P.y
  // Upper cloud tier on the left, the step Pweeg climbs down; never past the spawn.
  const upperTop = ground - 34
  const upperEdge = Math.max(P.x + 40, Math.min(P.x + P.w * 0.45, level.spawn.x - 50))
  const upperLeft = Math.min(P.x, 0) - 40

  // Chad: flips in from off-screen top-left onto the lower cloud near its edge.
  const land: Vec = { x: Math.max(upperEdge + 30, edge - 40), y: ground }
  const flipFrom: Vec = { x: -60, y: Math.max(40, ground - 260) }
  const apex = Math.max(20, ground - 330)
  const sim = simulateChad(level, land, tuning)
  /** Scripted fallback: a gentle rising glide to the right edge when the sim cannot cross. */
  const glide = (k: number): Frame => {
    const to = { x: level.world.w + 60, y: Math.max(40, ground - 160) }
    const q = flipArc({ x: land.x, y: ground }, to, Math.min(ground - 40, to.y - 30), k)
    return { ...q, airborne: k > 0.02, vx: 250 }
  }
  const floatTime = sim ? sim.length / 120 : CHAD_MAX_FLOAT

  // Timeline marks.
  const tLand = FLIP_AT + FLIP_TIME
  const tFloat = tLand + LAND_TIME + PAUSE
  const tChadGone = tFloat + floatTime
  const tPweeg = tChadGone + PWEEG_GAP
  const walk1 = (upperEdge - 14 - (upperLeft + 20)) / WALK_SPEED
  const tEdge = tPweeg + walk1
  const tClimb = tEdge + LOOK_DOWN
  const tDown = tClimb + CLIMB
  const walk2 = Math.max(0, level.spawn.x - (upperEdge + 14)) / WALK_SPEED
  const tSpawn = tDown + walk2
  const tEnd = tSpawn + LOOK_AT_PLAYER + FADE_OUT

  let time = 0
  let done = false
  const fired = new Set<string>()
  const once = (key: string, at: number, fn: () => void) => {
    if (time >= at && !fired.has(key)) { fired.add(key); fn() }
  }
  let stepAcc = 0
  let overlay: HTMLCanvasElement | null = null

  const chadAt = (t: number): { x: number; y: number; action: 'flip' | 'land' | 'idle' | 'float' | 'walk'; at: number; vx: number } | null => {
    if (t < FLIP_AT) return null
    if (t < tLand) {
      const k = (t - FLIP_AT) / FLIP_TIME
      return { ...flipArc(flipFrom, land, apex, k), action: 'flip', at: t - FLIP_AT, vx: 0 }
    }
    if (t < tLand + LAND_TIME) return { ...land, action: 'land', at: t - tLand, vx: 0 }
    if (t < tFloat) return { ...land, action: 'idle', at: t - tLand, vx: 0 }
    if (t >= tChadGone) {
      // Landed on the far side: he waits there, cool, while Pweeg gets ready.
      const last = sim?.[sim.length - 1]
      return last && !last.airborne && last.x < level.world.w ? { x: last.x, y: last.y, action: 'idle', at: t - tChadGone, vx: 0 } : null
    }
    const ft = t - tFloat
    const f = sim ? sim[Math.min(sim.length - 1, Math.floor(ft * 120))]! : glide(ft / floatTime)
    return { x: f.x, y: f.y, action: f.airborne ? 'float' : Math.abs(f.vx) > 20 ? 'walk' : 'idle', at: ft, vx: f.vx }
  }

  /** Pweeg's spot and pose at time t. */
  const pweegAt = (t: number) => {
    if (t < tPweeg) return null
    if (t < tEdge) {
      const x = upperLeft + 20 + (t - tPweeg) * WALK_SPEED
      return { x, y: upperTop, pose: 'walk' as const, step: (t - tPweeg) * WALK_SPEED * 0.09, front: false, blink: false }
    }
    if (t < tClimb) return { x: upperEdge - 14, y: upperTop, pose: 'stand' as const, step: 0, front: false, blink: false, lookDown: true }
    if (t < tDown) {
      // Hanging from the edge by his hands, lowering himself, then the last little drop.
      const k = (t - tClimb) / CLIMB
      const x = upperEdge - 14 + Math.min(1, k * 3) * 28
      const y = upperTop + (ground - upperTop) * (k < 0.7 ? k / 0.7 * 0.6 : 0.6 + ((k - 0.7) / 0.3) ** 2 * 0.4)
      return { x, y, pose: 'cheer' as const, step: 0, front: false, blink: false }
    }
    if (t < tSpawn) {
      const x = upperEdge + 14 + (t - tDown) * WALK_SPEED
      return { x, y: ground, pose: 'walk' as const, step: (t - tDown) * WALK_SPEED * 0.09, front: false, blink: false }
    }
    const since = t - tSpawn
    return { x: level.spawn.x, y: ground, pose: 'stand' as const, step: 0, front: since > 0.15, blink: since > 0.3 && since < 0.42 }
  }

  /** The two-tier cloud over the start platform (and to the left edge for Pweeg's walk-in). */
  const drawClouds = (ctx: CanvasRenderingContext2D) => {
    const puffRow = (x0: number, x1: number, top: number, depth: number) => {
      ctx.beginPath()
      const n = Math.max(2, Math.round((x1 - x0) / 46))
      for (let i = 0; i <= n; i++) {
        const cx = x0 + ((x1 - x0) * i) / n
        const r = 24 + ((i * 53) % 7) * 2
        ctx.moveTo(cx + r, top + r * 0.7)
        ctx.arc(cx, top + r * 0.7, r, 0, Math.PI * 2)
      }
      ctx.rect(x0, top + 16, x1 - x0, depth)
      ctx.fill()
    }
    ctx.save()
    // Inside the world only: never over the letterbox bars.
    ctx.beginPath()
    ctx.rect(0, 0, level.world.w, level.world.h)
    ctx.clip()
    ctx.fillStyle = '#e9eef8'
    puffRow(upperLeft, upperEdge, upperTop - 2, 60)
    ctx.fillStyle = '#ffffff'
    puffRow(Math.min(P.x, upperLeft + 30), edge, ground - 4, 70)
    ctx.restore()
  }

  return {
    get done() { return done },
    skip() { time = tEnd; done = true },
    update(dt) {
      if (done) return
      time += dt
      // Currents flow under the actors; the level's own movers stay put.
      world.time += dt
      once('whoosh', FLIP_AT, () => sfx('whoosh'))
      once('land', tLand, () => sfx('land'))
      once('cool', tLand + 0.12, () => sfx('cool'))
      once('open', tFloat + 0.1, () => sfx('open'))
      const p = pweegAt(time)
      if (p?.pose === 'walk') {
        stepAcc += dt * WALK_SPEED
        if (stepAcc >= 64) { stepAcc -= 64; sfx('step') }
      }
      once('drop', tDown - 0.05, () => sfx('land'))
      if (time >= tEnd) done = true
    },
    draw(ctx, labels, dt) {
      // The camera follows where Pweeg will stand (a scrolling level opens on its start screen).
      world.player.x = level.spawn.x - world.player.w / 2
      world.player.y = level.spawn.y - world.player.h
      const fade = Math.max(0, Math.min(1, (time - (tEnd - FADE_OUT)) / FADE_OUT))
      if (fade <= 0) return drawScene(ctx, labels, dt, true)
      // Cross-fade into the game's look, so Level 1 starts without a jump.
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

  /** One frame: the intro's look (clouds, wavy currents) or the game's (plain). */
  function drawScene(ctx: CanvasRenderingContext2D, labels: Labels, dt: number, introLook: boolean): Camera {
    const cam = render(ctx, world, labels, tuning, dt, undefined, { hidePlayer: true, windStyle: introLook ? 'squiggles' : 'arrows' })
    ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy)
    if (introLook) drawClouds(ctx)
    // Chad belongs to the intro's look: he fades out with it at the hand-over.
    const c = introLook ? chadAt(time) : null
    if (c) drawChad(ctx, c.x, c.y, { action: c.action, t: c.at, facing: 1, w: size.w, h: size.h, vx: c.vx })
    const p = pweegAt(time)
    if (p) {
      drawPweeg(ctx, p.x, p.y, { pose: p.pose, facing: 1, w: size.w, h: size.h, time, step: p.step, front: p.front, blink: p.blink })
      if (p.pose !== 'cheer') drawUmbrella(ctx, p.x + size.w * 0.8, p.y - size.h * 0.35, { state: 'furled', tilt: 0.22, time })
    }
    // Fade in from black.
    if (time < FADE_IN) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - time / FADE_IN})`
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
    return cam
  }
}
