// ─── The twelve GDD levels (src/assets/art/levels_*.png) ────────────────────
//
// World coordinates: y grows downward. Levels 1–9 are one 1280×720 screen;
// 10–12 are larger worlds the camera zooms out to fit ("far away").

export type Vec = { x: number; y: number }

/** How a platform moves. Position is the platform's CENTRE at time t. */
export type Motion =
  | { kind: 'static' }
  /** Ping-pong between two centres; `period` is a full there-and-back. */
  | { kind: 'line'; a: Vec; b: Vec; period: number }
  /** Orbit around `center`. */
  | { kind: 'circle'; center: Vec; radius: number; period: number }
  /** Pendulum hanging from `pivot`, swinging ±`amplitude` radians. */
  | { kind: 'swing'; pivot: Vec; radius: number; amplitude: number; period: number }

export interface PlatformDef {
  x: number
  y: number
  w: number
  h: number
  finish?: boolean
  motion?: Motion
}

export type WindDir = 'up' | 'down' | 'left' | 'right'

export interface WindDef {
  x: number
  y: number
  w: number
  h: number
  dir: WindDir
  /** Speed the wind pushes an open umbrella to (px/s). */
  speed: number
}

export interface LevelDef {
  id: number
  world: { w: number; h: number }
  spawn: Vec
  platforms: PlatformDef[]
  winds: WindDef[]
}

const P = (x: number, y: number, w = 200, h = 20, extra: Partial<PlatformDef> = {}): PlatformDef => ({ x, y, w, h, ...extra })
const FIN = (x: number, y: number, w = 160, motion?: Motion): PlatformDef => ({ x, y, w, h: 20, finish: true, motion })
const UP = (x: number, y: number, w: number, h: number, speed = 260): WindDef => ({ x, y, w, h, dir: 'up', speed })

const SCREEN = { w: 1280, h: 720 }

export const LEVELS: LevelDef[] = [
  // 1 — walk off, an updraft carries you over the gap to the finish.
  {
    id: 1, world: SCREEN, spawn: { x: 160, y: 400 },
    platforms: [P(60, 440), FIN(880, 440)],
    winds: [UP(380, 320, 400, 400)]
  },
  // 2 — a rising staircase of updrafts up to a high finish.
  {
    id: 2, world: SCREEN, spawn: { x: 140, y: 480 },
    platforms: [P(40, 520), FIN(960, 230)],
    winds: [UP(330, 480, 130, 240), UP(460, 390, 130, 330), UP(590, 290, 130, 430), UP(720, 180, 140, 540)]
  },
  // 3 — close the parasol to drop through the stream, open, land.
  {
    id: 3, world: SCREEN, spawn: { x: 140, y: 140 },
    platforms: [P(40, 180), FIN(830, 640)],
    winds: [UP(320, 220, 900, 340, 220)]
  },
  // 4 — the finish rides up and down beside the updraft.
  {
    id: 4, world: SCREEN, spawn: { x: 140, y: 280 },
    platforms: [P(40, 320), FIN(0, 0, 160, { kind: 'line', a: { x: 1060, y: 190 }, b: { x: 1060, y: 630 }, period: 6 })],
    winds: [UP(330, 300, 420, 420, 240)]
  },
  // 5 — the finish orbits a block.
  {
    id: 5, world: SCREEN, spawn: { x: 130, y: 320 },
    platforms: [
      P(40, 360, 180),
      P(900, 330, 60, 60),
      FIN(0, 0, 140, { kind: 'circle', center: { x: 930, y: 360 }, radius: 180, period: 7 })
    ],
    winds: [UP(320, 300, 260, 420, 230)]
  },
  // 6 — a gentle updraft slows the descent onto a slowly sliding finish.
  {
    id: 6, world: SCREEN, spawn: { x: 640, y: 100 },
    platforms: [P(540, 140), FIN(0, 0, 160, { kind: 'line', a: { x: 160, y: 640 }, b: { x: 1120, y: 640 }, period: 9 })],
    winds: [UP(180, 220, 920, 320, 60)]
  },
  // 7 — no wind: float straight down.
  {
    id: 7, world: SCREEN, spawn: { x: 640, y: 120 },
    platforms: [P(540, 160), FIN(560, 560)],
    winds: []
  },
  // 8 — no wind: the finish swings on a medium pendulum.
  {
    id: 8, world: SCREEN, spawn: { x: 640, y: 80 },
    platforms: [P(560, 120, 160), FIN(0, 0, 160, { kind: 'swing', pivot: { x: 640, y: 160 }, radius: 460, amplitude: 1.05, period: 5 })],
    winds: []
  },
  // 9 — no wind: the finish darts back and forth fast.
  {
    id: 9, world: SCREEN, spawn: { x: 180, y: 110 },
    platforms: [P(80, 150), FIN(0, 0, 160, { kind: 'line', a: { x: 400, y: 600 }, b: { x: 1060, y: 420 }, period: 2.6 })],
    winds: []
  },
  // 10 — far away: fall speed builds; land too fast and you splat.
  {
    id: 10, world: { w: 2560, h: 1440 }, spawn: { x: 300, y: 160 },
    platforms: [P(200, 200), FIN(1560, 1340, 220)],
    winds: []
  },
  // 11 — further away, onto a slowly sliding finish.
  {
    id: 11, world: { w: 3840, h: 2160 }, spawn: { x: 700, y: 210 },
    platforms: [P(600, 250, 220), FIN(0, 0, 260, { kind: 'line', a: { x: 1500, y: 2040 }, b: { x: 2400, y: 2040 }, period: 10 })],
    winds: []
  },
  // 12 — a straight long drop: flutter, or the umbrella breaks on opening.
  {
    id: 12, world: { w: 3840, h: 2160 }, spawn: { x: 1640, y: 110 },
    platforms: [P(1540, 150, 220), FIN(1520, 2040, 260)],
    winds: []
  }
]
