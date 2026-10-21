// ─── The 24 GDD levels (src/assets/art/levels_*.png) ────────────────────
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
  /** Rest at `a`, strike to `b` fast, hold, pull back slowly; repeats every `period`. */
  | {
      kind: 'lunge'; a: Vec; b: Vec; period: number
      /** Strike speed multiplier (1 = the tuning's strike time; 2 = twice as fast). */
      speed?: number
      /** Thwomp mode: rest at `a` until the player is airborne within `radius`
       *  of it, then strike once (strike, hold, pull back) and wait again. */
      trigger?: boolean
      radius?: number
    }
  /** Wait `delay` s at `a`, glide to `b` over `duration` s, then stay. */
  | { kind: 'arrive'; a: Vec; b: Vec; delay: number; duration: number }

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
  /** Super Stream: much faster, builds up slowly, can splat you on a ceiling. */
  super?: boolean
}

/** Touching any hazard resets the level. Mines are circles inscribed in their box. */
export type HazardKind = 'pillar' | 'mine' | 'spikes'

export interface HazardDef {
  kind: HazardKind
  x: number
  y: number
  w: number
  h: number
  motion?: Motion
  /** Not deadly: a solid block you can bump into and stand on. */
  harmless?: boolean
  /** Spikes only: which way the points face. */
  facing?: 'up' | 'down'
}

export interface LevelDef {
  id: number
  world: { w: number; h: number }
  /** One screen, in world units: when smaller than the world the camera
   *  scrolls with the player. Absent: the whole world is shown at once. */
  view?: { w: number; h: number }
  spawn: Vec
  platforms: PlatformDef[]
  winds: WindDef[]
  hazards?: HazardDef[]
}

const P = (x: number, y: number, w = 200, h = 20, extra: Partial<PlatformDef> = {}): PlatformDef => ({ x, y, w, h, ...extra })
const FIN = (x: number, y: number, w = 160, motion?: Motion): PlatformDef => ({ x, y, w, h: 20, finish: true, motion })
const UP = (x: number, y: number, w: number, h: number, speed = 260): WindDef => ({ x, y, w, h, dir: 'up', speed })

const SUPER = (x: number, y: number, w: number, h: number, speed = 760): WindDef => ({ x, y, w, h, dir: 'up', speed, super: true })
const WIND = (dir: WindDir, x: number, y: number, w: number, h: number, speed: number): WindDef => ({ x, y, w, h, dir, speed })
/** A pillar enemy centred on (cx, cy). */
const PILLAR = (cx: number, cy: number, motion?: Motion, w = 40, h = 200): HazardDef => ({ kind: 'pillar', x: cx - w / 2, y: cy - h / 2, w, h, motion })
/** A spiky mine centred on (cx, cy). */
const MINE = (cx: number, cy: number, motion?: Motion, r = 26): HazardDef => ({ kind: 'mine', x: cx - r, y: cy - r, w: r * 2, h: r * 2, motion })
const SPIKES = (x: number, y: number, w: number, facing: 'up' | 'down'): HazardDef => ({ kind: 'spikes', x, y, w, h: 26, facing })
const CEILING = P(0, 90, 1280, 30)

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
    winds: [UP(320, 220, 900, 340, 200)]
  },
  // 4 — the finish rides up and down beside the updraft.
  {
    id: 4, world: SCREEN, spawn: { x: 140, y: 280 },
    platforms: [P(40, 320), FIN(0, 0, 160, { kind: 'line', a: { x: 1060, y: 190 }, b: { x: 1060, y: 630 }, period: 6 })],
    winds: [UP(330, 300, 420, 420)]
  },
  // 5 — the finish orbits a block.
  {
    id: 5, world: SCREEN, spawn: { x: 130, y: 320 },
    platforms: [
      P(40, 360, 180),
      P(900, 330, 60, 60),
      FIN(0, 0, 140, { kind: 'circle', center: { x: 930, y: 360 }, radius: 180, period: 7 })
    ],
    winds: [UP(320, 300, 260, 420)]
  },
  // 6 — a gentle updraft slows the descent onto a slowly sliding finish.
  {
    id: 6, world: SCREEN, spawn: { x: 640, y: 100 },
    platforms: [P(540, 140), FIN(0, 0, 160, { kind: 'line', a: { x: 160, y: 640 }, b: { x: 1120, y: 640 }, period: 9 })],
    winds: [UP(180, 220, 920, 320, 200)]
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
    platforms: [P(80, 150), FIN(0, 0, 160, { kind: 'line', a: { x: 400, y: 600 }, b: { x: 1060, y: 420 }, period: 3.2 })],
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
  },

  // ── Enemies, Super Streams (GDD Revision 1 sketches) ──

  // 13 — a harmless pillar blocks the updraft: dip under it where the current is short.
  {
    id: 13, world: SCREEN, spawn: { x: 160, y: 400 },
    platforms: [P(60, 440), FIN(1000, 440, 200)],
    winds: [UP(270, 400, 230, 320), UP(500, 470, 220, 250), UP(720, 400, 270, 320)],
    hazards: [{ ...PILLAR(610, 330, undefined, 40, 220), harmless: true }]
  },
  // 14 — the harmless pillar rises and sinks: cross over it while it is down.
  {
    id: 14, world: SCREEN, spawn: { x: 160, y: 400 },
    platforms: [P(60, 440), FIN(1020, 440, 200)],
    winds: [UP(270, 400, 740, 320)],
    hazards: [{ ...PILLAR(610, 0, { kind: 'line', a: { x: 610, y: 170 }, b: { x: 610, y: 540 }, period: 4.5 }), harmless: true }]
  },
  // 15 — the pillar attacks: it charges straight left along your flight line.
  {
    id: 15, world: SCREEN, spawn: { x: 160, y: 400 },
    platforms: [P(60, 440), FIN(1020, 440, 200)],
    winds: [UP(270, 400, 740, 320)],
    hazards: [PILLAR(0, 0, { kind: 'lunge', a: { x: 1260, y: 375 }, b: { x: 480, y: 375 }, period: 3.2 }, 40, 110)]
  },
  // 16 — the spike room: updraft, two headwinds, and a pillar that drops in.
  {
    id: 16, world: SCREEN, spawn: { x: 120, y: 360 },
    platforms: [
      P(20, 400, 220), P(240, 90, 840, 30), P(240, 630, 840, 30),
      P(1060, 90, 40, 230), P(1060, 470, 40, 190), FIN(980, 440, 280)
    ],
    winds: [UP(240, 200, 740, 430, 160), WIND('left', 240, 300, 740, 60, 150), WIND('left', 240, 520, 740, 60, 150)],
    hazards: [
      SPIKES(240, 120, 820, 'down'), SPIKES(240, 604, 740, 'up'),
      PILLAR(0, 0, { kind: 'arrive', a: { x: 880, y: -140 }, b: { x: 880, y: 380 }, delay: 1.2, duration: 1.6 }, 40, 180)
    ]
  },
  // 17 — ride the updraft up, slip left out of it onto the high finish.
  {
    id: 17, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), FIN(60, 150, 200)],
    winds: [UP(320, 60, 720, 660)]
  },
  // 18 — the updraft starts at the line; a crosswind on top blows you away from the finish.
  {
    id: 18, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), FIN(60, 230, 220)],
    winds: [UP(340, 150, 900, 570), WIND('right', 340, 60, 900, 90, 260)],
    hazards: [MINE(760, 400)]
  },
  // 19 — same climb, two mines.
  {
    id: 19, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), FIN(60, 230, 220)],
    winds: [UP(340, 150, 900, 570), WIND('right', 340, 60, 900, 90, 260)],
    hazards: [MINE(560, 340), MINE(900, 330)]
  },
  // 20 — two mines swing fast through the updraft.
  {
    id: 20, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), FIN(60, 230, 220)],
    winds: [UP(340, 150, 900, 570), WIND('right', 340, 60, 900, 90, 260)],
    hazards: [
      MINE(0, 0, { kind: 'circle', center: { x: 600, y: 420 }, radius: 100, period: 2.2 }),
      MINE(0, 0, { kind: 'circle', center: { x: 920, y: 340 }, radius: 100, period: 2.6 })
    ]
  },
  // 21 — intro to the Super Stream: flutter the umbrella or splat on the ceiling.
  {
    id: 21, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), P(0, 90, 300, 30), P(300, 90, 300, 30), P(600, 90, 340, 30), P(940, 90, 340, 30), FIN(1000, 420, 200)],
    winds: [SUPER(340, 120, 900, 600, 1130)]
  },
  // 22 — a mine arrives to guard the finish, over a Super Stream.
  {
    id: 22, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), CEILING, FIN(880, 420, 200)],
    winds: [SUPER(340, 360, 440, 360)],
    hazards: [MINE(0, 0, { kind: 'arrive', a: { x: 1400, y: 300 }, b: { x: 760, y: 380 }, delay: 1.5, duration: 2 })]
  },
  // 23 — Super Stream with two hovering mines.
  {
    id: 23, world: SCREEN, spawn: { x: 160, y: 580 },
    platforms: [P(60, 620), CEILING, FIN(1000, 380, 200)],
    winds: [SUPER(340, 120, 900, 600)],
    hazards: [
      MINE(0, 0, { kind: 'line', a: { x: 560, y: 320 }, b: { x: 560, y: 400 }, period: 2.4 }),
      MINE(0, 0, { kind: 'line', a: { x: 800, y: 360 }, b: { x: 800, y: 280 }, period: 2.8 })
    ]
  },
  // 24 — super, calm, super: and a fast mine circling the finish.
  {
    id: 24, world: SCREEN, spawn: { x: 160, y: 460 },
    platforms: [P(60, 500), CEILING, FIN(980, 420, 200)],
    winds: [SUPER(320, 120, 220, 600), SUPER(760, 120, 520, 600)],
    hazards: [MINE(0, 0, { kind: 'circle', center: { x: 1080, y: 400 }, radius: 120, period: 2.4 })]
  },
  // 25 — "level 55" from the level editor (designer, Revision 3).
  {
    id: 25, world: { w: 1280, h: 720 }, spawn: { x: 180, y: 210 },
    platforms: [
      { x: 60, y: 440, w: 200, h: 20 },
      { x: 1020, y: 440, w: 200, h: 20, finish: true },
      { x: 640, y: 330, w: 200, h: 20, motion: { kind: 'swing', pivot: { x: 579, y: 233 }, radius: 220, amplitude: 0.8, period: 1.5 } }
    ],
    winds: [
      { x: 270, y: 400, w: 740, h: 320, dir: 'up', speed: 260 },
      { x: 310, y: 40, w: 240, h: 320, dir: 'up', speed: 260 },
      { x: 810, y: 30, w: 430, h: 230, dir: 'left', speed: 260 },
      { x: 50, y: 350, w: 220, h: 240, dir: 'up', speed: 760, super: true },
      { x: 700, y: 130, w: 560, h: 620, dir: 'up', speed: 760, super: true }
    ],
    hazards: [
      { kind: 'spikes', x: 440, y: 370, w: 200, h: 26, facing: 'up' },
      { kind: 'mine', x: 574, y: 264, w: 52, h: 52 }
    ]
  },
  // 26 — "level 56" from the level editor (designer, Revision 3).
  {
    id: 26, world: { w: 1280, h: 720 }, spawn: { x: 160, y: 400 },
    platforms: [
      { x: 60, y: 440, w: 200, h: 20 },
      { x: 1020, y: 440, w: 200, h: 20, finish: true }
    ],
    winds: [
      { x: 250, y: 30, w: 740, h: 320, dir: 'up', speed: 260 },
      { x: 640, y: 520, w: 240, h: 320, dir: 'down', speed: 260 },
      { x: 1100, y: 580, w: 240, h: 320, dir: 'left', speed: 260 }
    ],
    hazards: []
    },
  // 27 — the first scrolling level: three updraft hops, the camera follows (Revision 3).
  {
    id: 27, world: { w: 2780, h: 720 }, view: SCREEN, spawn: { x: 160, y: 400 },
    platforms: [P(60, 440), P(880, 440), P(1700, 440), FIN(2520, 440)],
    winds: [UP(380, 320, 400, 400), UP(1200, 320, 400, 400), UP(2020, 320, 400, 400)]
  }
]
