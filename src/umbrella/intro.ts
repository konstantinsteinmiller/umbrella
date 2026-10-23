// ─── Intro: the pre-game cutscene (intro.md, roadmap #0.7.0-10/-11) ──────────
//
// Plays on the campaign's first level, drawn by the game renderer: its start
// platform dressed as a two-tier cloud, its currents as the design doc's wavy
// lines. Chad front-flips in, lands, pauses and floats across (simulated with
// the real engine, so the demo shows the physics the player gets); then Pweeg
// walks in on the upper cloud, climbs down, walks to the level's spawn and
// turns to the camera — the frame Level 1 starts from, without a cut.
//
// The timeline is DATA (cutscene.ts): `introCutscene` builds the script from the
// level, `createIntro` plays it. The scene owns the clock (update), the canvas
// (draw) and the sounds (the `sfx` callback). Skippable at any time.

import { createWorld, step } from './engine'
import { flipArc, FLIP_TIME, LAND_TIME } from './chad'
import { editedCutscene } from './cutsceneStore'
import { createCutscene, type Cutscene, type CutsceneDef, type CutsceneSfx, type FramesSeg, type Seg } from './cutscene'
import type { LevelDef, PlatformDef, Vec } from './levels'
import type { Tuning } from './tuning'

export type IntroSfx = CutsceneSfx
export type Intro = Cutscene

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

/** The intro as a script: Chad flips in, floats across (simulated with the real
 *  engine), then Pweeg walks in on the upper cloud, climbs down and walks to the spawn. */
export const introCutscene = (level: LevelDef, tuning: Tuning): CutsceneDef => {
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
  const RATE = 120
  /** Scripted fallback: a gentle rising glide to the right edge when the sim cannot cross. */
  const glide = (k: number): Frame => {
    const to = { x: level.world.w + 60, y: Math.max(40, ground - 160) }
    const q = flipArc({ x: land.x, y: ground }, to, Math.min(ground - 40, to.y - 30), k)
    return { ...q, airborne: k > 0.02, vx: 250 }
  }
  const floatTime = sim ? sim.length / RATE : CHAD_MAX_FLOAT
  const frames: Frame[] = sim ?? Array.from({ length: Math.ceil(floatTime * RATE) }, (_, i) => glide(i / RATE / floatTime))

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

  const chad: Seg[] = [
    { kind: 'flip', from: FLIP_AT, to: tLand, a: flipFrom, b: land, apex },
    { kind: 'hold', from: tLand, to: tLand + LAND_TIME, at: land, action: 'land' },
    { kind: 'hold', from: tLand + LAND_TIME, to: tFloat, at: land, action: 'idle' },
    { kind: 'frames', from: tFloat, to: tChadGone, rate: RATE, frames } satisfies FramesSeg
  ]
  // Landed on the far side: he waits there, cool, while Pweeg gets ready.
  const last = frames[frames.length - 1]
  if (sim && last && !last.airborne && last.x < level.world.w) chad.push({ kind: 'hold', from: tChadGone, at: { x: last.x, y: last.y }, action: 'idle' })

  const pweeg: Seg[] = [
    { kind: 'walk', from: tPweeg, to: tEdge, a: { x: upperLeft + 20, y: upperTop }, speed: WALK_SPEED },
    { kind: 'hold', from: tEdge, to: tClimb, at: { x: upperEdge - 14, y: upperTop }, pose: 'stand' },
    { kind: 'climb', from: tClimb, to: tDown, edgeX: upperEdge - 14, top: upperTop, ground },
    { kind: 'walk', from: tDown, to: tSpawn, a: { x: upperEdge + 14, y: ground }, speed: WALK_SPEED },
    { kind: 'hold', from: tSpawn, at: { x: level.spawn.x, y: ground }, pose: 'stand', frontAfter: 0.15, blink: [0.3, 0.42] }
  ]

  return {
    id: 'intro',
    level: level.id,
    duration: tEnd,
    fadeIn: FADE_IN,
    fadeOut: FADE_OUT,
    clouds: [
      { x0: upperLeft, x1: upperEdge, top: upperTop - 2, depth: 60, fill: '#e9eef8' },
      { x0: Math.min(P.x, upperLeft + 30), x1: edge, top: ground - 4, depth: 70, fill: '#ffffff' }
    ],
    actors: [{ id: 'chad', segs: chad }, { id: 'pweeg', segs: pweeg }],
    cues: [
      { at: FLIP_AT, sfx: 'whoosh' },
      { at: tLand, sfx: 'land' },
      { at: tLand + 0.12, sfx: 'cool' },
      { at: tFloat + 0.1, sfx: 'open' },
      { at: tDown - 0.05, sfx: 'land' }
    ],
    stepEvery: 64
  }
}

/** Plays the designer's edited script (kept on the server too) when there is one for this level, else the built-in. */
export const createIntro = (level: LevelDef, tuning: Tuning, sfx: (name: IntroSfx) => void): Intro => {
  const edited = editedCutscene('intro')
  return createCutscene(edited && edited.level === level.id ? edited : introCutscene(level, tuning), level, tuning, sfx)
}
