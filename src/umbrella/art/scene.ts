// Scenes that put every drawable the art layer can replace on screen at once,
// in every state it has: the vector golden (vectorGolden.test.ts) and the kite
// sprite tests draw the same list. Self-contained: no campaign level, so a
// level edit can never move the golden.
import { createWorld, type World } from '../engine'
import type { LevelDef } from '../levels'
import { DEFAULT_TUNING } from '../tuning'

export const ART_LEVEL: LevelDef = {
  id: 9001,
  world: { w: 1280, h: 720 },
  spawn: { x: 200, y: 400 },
  platforms: [
    { x: 60, y: 440, w: 300, h: 20 },
    { x: 900, y: 440, w: 200, h: 20, finish: true },
    { x: 420, y: 560, w: 140, h: 40, channel: 1 },
    { x: 600, y: 600, w: 120, h: 20, channel: 2, whenOff: true },
    { x: 1150, y: 200, w: 60, h: 280 }
  ],
  winds: [
    { x: 380, y: 120, w: 240, h: 320, dir: 'up', speed: 260 },
    { x: 640, y: 120, w: 200, h: 200, dir: 'right', speed: 760, super: true },
    { x: 640, y: 340, w: 200, h: 120, dir: 'left', speed: 200, channel: 1, switched: { dir: 'down', speed: 300 } }
  ],
  hazards: [
    { kind: 'pillar', x: 700, y: 480, w: 40, h: 200, contact: 'bounce' },
    { kind: 'pillar', x: 780, y: 480, w: 30, h: 150, contact: 'deadly', motion: { kind: 'lunge', a: { x: 795, y: 555 }, b: { x: 860, y: 555 }, period: 3 } },
    { kind: 'pillar', x: 860, y: 480, w: 80, h: 220, harmless: true },
    { kind: 'mine', x: 300, y: 200, w: 52, h: 52 },
    { kind: 'mine', x: 500, y: 650, w: 30, h: 30, motion: { kind: 'line', a: { x: 515, y: 665 }, b: { x: 600, y: 665 }, period: 4 } },
    { kind: 'spikes', x: 60, y: 694, w: 300, h: 26, facing: 'up' },
    { kind: 'spikes', x: 60, y: 120, w: 200, h: 26, facing: 'down' },
    { kind: 'fan', x: 1000, y: 600, w: 90, h: 90 }
  ],
  buttons: [
    { x: 100, y: 426, w: 60, h: 14, channel: 1 },
    { x: 200, y: 426, w: 60, h: 14, channel: 2, duration: 5 }
  ],
  checkpoints: [{ x: 300, y: 440 }, { x: 980, y: 440 }]
}

export type PlayerScene = 'stand' | 'walk' | 'hold' | 'flail' | 'sideways' | 'terminal' | 'broken' | 'splat' | 'hit' | 'win'

const SIZE = { w: DEFAULT_TUNING.playerWidth, h: DEFAULT_TUNING.playerHeight }

/** A world posed as `scene` at time `t` (the renderer eases poses across frames,
 *  so the caller renders a few frames to settle). */
export const sceneWorld = (scene: PlayerScene, t = 1.25): World => {
  const w = createWorld(ART_LEVEL, SIZE, 0)
  w.time = t
  w.platformTime = t
  w.enemyTime = t
  w.channels[1] = Infinity
  w.channels[2] = t + 3
  const pl = w.player
  pl.x = 200
  pl.y = 440 - pl.h
  pl.facing = 1
  switch (scene) {
    case 'stand': pl.grounded = true; break
    case 'walk': pl.grounded = true; pl.vx = 180; break
    case 'hold': pl.open = true; pl.vx = 120; pl.y = 300; break
    case 'flail': pl.vy = 200; pl.y = 300; pl.facing = -1; break
    case 'sideways': pl.vy = DEFAULT_TUNING.terminalVelocity * (DEFAULT_TUNING.fallPoseSideways + 0.05); pl.y = 300; break
    case 'terminal': pl.vy = DEFAULT_TUNING.terminalVelocity; pl.y = 300; break
    case 'broken': pl.broken = true; pl.vy = 300; pl.y = 300; break
    case 'splat': pl.grounded = true; w.phase = 'splat'; w.phaseTime = 0.05; break
    case 'hit': pl.x = 1010; pl.y = 610; w.phase = 'splat'; w.phaseTime = 0.2; break
    case 'win': pl.grounded = true; pl.x = 960; w.phase = 'win'; w.phaseTime = 0.4; break
  }
  return w
}

export const PLAYER_SCENES: PlayerScene[] = ['stand', 'walk', 'hold', 'flail', 'sideways', 'terminal', 'broken', 'splat', 'hit', 'win']
