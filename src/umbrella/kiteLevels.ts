// ─── The 100 kite levels (/umbrella/kite/ only) ──────────────────────────────
//
// A separate campaign for the kite build (kite.ts): never on the server, never in
// the normal game. Designed after mario-platformer-philosophy.md — ten worlds of
// ten, each world one idea told in four beats (introduce, develop, twist, conclude)
// with a finale that combines it with everything before:
//
//    1–10  First Breeze   updrafts: float, ride, slip out, close to drop through
//   11–20  Free Fall      the closed umbrella: speed, terminal velocity, flutter; tall worlds
//   21–30  Crosswinds     left / right / down currents
//   31–40  Thorns         spikes; wide scrolling worlds; checkpoints
//   41–50  Walldorf       solid block, bouncy bumper / trampoline, deadly, charging
//   51–60  Prickbait      mines: still, sliding, orbiting, swinging, arriving
//   61–70  Ventilators    fans (they shred) and Super Streams
//   71–80  Switches       toggle and timed buttons, switched platforms and currents
//   81–90  Hunters        triggered lunges, Walldorfs that follow
//   91–100 The Storm      everything, combined; 100 is the grand finale
//
// Every level is proven beatable by the bot (tests/umbrella/kiteLevels.test.ts replays
// the wins recorded by scripts/kite-solve.mjs on the real engine).
//
// World coordinates as in levels.ts: y grows downward, a screen is 1280 × 720.

import type { ButtonDef, CheckpointDef, HazardDef, LevelDef, Motion, PlatformDef, Vec, WindDef } from './levels'
import { BUTTON, CHECKPOINT, FAN, FIN, MINE, P, SCREEN, SPIKES, SUPER, UP, WALLDORF, WIND } from './levelKit'

/** A world taller than one screen: the camera scrolls with the player. */
const tall = (h: number) => ({ world: { w: 1280, h }, view: SCREEN })
/** A world wider than one screen. */
const wide = (w: number, h = 720) => ({ world: { w, h }, view: SCREEN })
const line = (ax: number, ay: number, bx: number, by: number, period: number): Motion => ({ kind: 'line', a: { x: ax, y: ay }, b: { x: bx, y: by }, period })
const circle = (cx: number, cy: number, radius: number, period: number): Motion => ({ kind: 'circle', center: { x: cx, y: cy }, radius, period })
const swing = (px: number, py: number, radius: number, amplitude: number, period: number): Motion => ({ kind: 'swing', pivot: { x: px, y: py }, radius, amplitude, period })
const arrive = (ax: number, ay: number, bx: number, by: number, delay: number, duration: number): Motion => ({ kind: 'arrive', a: { x: ax, y: ay }, b: { x: bx, y: by }, delay, duration })
const lunge = (ax: number, ay: number, bx: number, by: number, period: number, extra: { speed?: number; trigger?: boolean; radius?: number } = {}): Motion =>
  ({ kind: 'lunge', a: { x: ax, y: ay }, b: { x: bx, y: by }, period, ...extra })
const follow = (speed: number, extra: { axis?: 'x' | 'y'; a?: { x: number; y: number }; b?: { x: number; y: number } } = {}): Motion => ({ kind: 'follow', speed, ...extra })

// ── Parts: groups of pieces designed in their own coordinates, shifted into place ──
interface Part { platforms?: PlatformDef[]; winds?: WindDef[]; hazards?: HazardDef[]; buttons?: ButtonDef[]; checkpoints?: CheckpointDef[] }
const mv = (v: Vec, dx: number, dy: number): Vec => ({ x: v.x + dx, y: v.y + dy })
const moveMotion = (m: Motion | undefined, dx: number, dy: number): Motion | undefined => {
  if (!m) return m
  switch (m.kind) {
    case 'static': return m
    case 'line': case 'lunge': case 'arrive': return { ...m, a: mv(m.a, dx, dy), b: mv(m.b, dx, dy) }
    case 'circle': return { ...m, center: mv(m.center, dx, dy) }
    case 'swing': return { ...m, pivot: mv(m.pivot, dx, dy) }
    case 'follow': return { ...m, ...(m.a ? { a: mv(m.a, dx, dy) } : {}), ...(m.b ? { b: mv(m.b, dx, dy) } : {}) }
  }
}
const at = <T extends { x: number; y: number; motion?: Motion }>(o: T, dx: number, dy: number): T => {
  const out = { ...o, x: o.x + dx, y: o.y + dy }
  if (o.motion) out.motion = moveMotion(o.motion, dx, dy)
  return out
}
/** A part moved by (dx, dy). */
const shift = (dx: number, dy: number, p: Part): Part => ({
  platforms: p.platforms?.map((o) => at(o, dx, dy)),
  winds: p.winds?.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
  hazards: p.hazards?.map((o) => at(o, dx, dy)),
  buttons: p.buttons?.map((o) => ({ ...o, x: o.x + dx, y: o.y + dy })),
  checkpoints: p.checkpoints?.map((o) => ({ x: o.x + dx, y: o.y + dy }))
})
/** A level from parts (the first part usually holds the start platform). */
const build = (id: number, frame: Pick<LevelDef, 'world' | 'view'>, spawn: Vec, ...parts: Part[]): LevelDef => {
  const l: LevelDef = { id, ...frame, spawn, platforms: [], winds: [], hazards: [] }
  for (const p of parts) {
    l.platforms.push(...(p.platforms ?? []))
    l.winds.push(...(p.winds ?? []))
    l.hazards!.push(...(p.hazards ?? []))
    if (p.buttons?.length) (l.buttons ??= []).push(...p.buttons)
    if (p.checkpoints?.length) (l.checkpoints ??= []).push(...p.checkpoints)
  }
  return l
}
/** Spikes along the bottom of the world (a pit you can see). */
const thornFloor = (x: number, w: number, worldH = 720): HazardDef => SPIKES(x, worldH - 26, w, 'up')
/** A block with spikes on top. */
const thornBlock = (x: number, y: number, w: number, h = 40): Part => ({ platforms: [P(x, y, w, h)], hazards: [SPIKES(x, y - 26, w, 'up')] })
/** A ventilator on the floor blowing an updraft up to `top`. */
const vent = (x: number, top: number, floor = 720, w = 90, speed = 240): Part =>
  ({ hazards: [FAN(x, floor - 60, w, 60)], winds: [UP(x, top, w, floor - 60 - top, speed)] })

// ═══ World 1 — First Breeze: updrafts ═══════════════════════════════════════
const W1: LevelDef[] = [
  // 1 · introduce — walk off; a wide updraft carries you over the gap.
  {
    id: 1, world: SCREEN, spawn: { x: 160, y: 440 },
    platforms: [P(60, 440), FIN(880, 440, 200)],
    winds: [UP(380, 320, 400, 400)]
  },
  // 2 · introduce — no wind: the open umbrella floats you down; a ledge halfway is a safety net.
  {
    id: 2, world: SCREEN, spawn: { x: 150, y: 150 },
    platforms: [P(60, 150, 220), P(520, 420, 220), FIN(900, 620, 180)],
    winds: []
  },
  // 3 · develop — two updrafts, a resting ledge between them.
  {
    id: 3, world: SCREEN, spawn: { x: 110, y: 460 },
    platforms: [P(40, 460, 180), P(620, 440, 140), FIN(1100, 440, 160)],
    winds: [UP(300, 340, 260, 380), UP(840, 340, 220, 380)]
  },
  // 4 · develop — a staircase: each updraft lifts you above the next ledge.
  {
    id: 4, world: SCREEN, spawn: { x: 110, y: 600 },
    platforms: [P(40, 600, 160), P(380, 560, 110), P(670, 460, 110), FIN(970, 360, 180)],
    winds: [UP(230, 450, 120, 270), UP(520, 350, 120, 370), UP(810, 250, 120, 470)]
  },
  // 5 · twist — the finish is high above you: ride up, slip out right onto a ledge, then up again and out to the left.
  {
    id: 5, world: SCREEN, spawn: { x: 140, y: 620 },
    platforms: [P(60, 620, 200), P(560, 420, 180), FIN(560, 140, 200)],
    winds: [UP(300, 300, 200, 420), UP(780, 100, 200, 620)]
  },
  // 6 · develop — stepping-stone columns over a pit; the gaps between them grow.
  {
    id: 6, world: SCREEN, spawn: { x: 110, y: 420 },
    platforms: [P(40, 420, 180), FIN(1010, 460, 180)],
    winds: [UP(290, 300, 110, 420), UP(530, 300, 90, 420), UP(790, 300, 90, 420)]
  },
  // 7 · twist — the finish is UNDER the current: close the umbrella to drop through it.
  {
    id: 7, world: SCREEN, spawn: { x: 120, y: 160 },
    platforms: [P(40, 160, 200), FIN(820, 640, 180)],
    winds: [UP(300, 200, 900, 330, 200)]
  },
  // 8 · develop — drop through one current, open under it, drift into the next and rise.
  {
    id: 8, world: SCREEN, spawn: { x: 120, y: 140 },
    platforms: [P(40, 140, 200), FIN(1020, 440, 180)],
    winds: [UP(260, 160, 420, 220, 200), UP(720, 300, 240, 420)]
  },
  // 9 · twist — the finish rides up and down beside the updraft.
  {
    id: 9, world: SCREEN, spawn: { x: 140, y: 400 },
    platforms: [P(60, 400, 200), FIN(0, 0, 180, line(990, 230, 990, 620, 6))],
    winds: [UP(330, 260, 380, 460)]
  },
  // 10 · conclude — Kite Run: climb, clear the wall, drop through, land on the sliding finish.
  {
    id: 10, world: SCREEN, spawn: { x: 110, y: 600 },
    platforms: [P(40, 600, 160), P(400, 520, 120), P(760, 330, 30, 390), FIN(0, 0, 160, line(940, 650, 1180, 650, 7))],
    winds: [UP(230, 420, 130, 300), UP(560, 180, 130, 540), UP(800, 250, 480, 260, 200)]
  }
]

// ═══ World 2 — Free Fall: the closed umbrella, terminal velocity, flutter ════
const W2: LevelDef[] = [
  // 11 · introduce — a world taller than the screen: float down from ledge to ledge.
  {
    id: 11, ...tall(1440), spawn: { x: 160, y: 200 },
    platforms: [P(80, 200, 220), P(900, 560, 220), P(120, 920, 220), FIN(900, 1300, 200)],
    winds: []
  },
  // 12 · introduce — the ledge and the finish sink away soon: close the umbrella to fall fast.
  {
    id: 12, world: SCREEN, spawn: { x: 160, y: 120 },
    platforms: [P(80, 120, 180), P(0, 0, 180, 20, { motion: arrive(560, 420, 560, 900, 2.4, 2.5) }), FIN(0, 0, 160, arrive(1060, 600, 1060, 1000, 4.2, 2.5))],
    winds: []
  },
  // 13 · develop — a long drop: float it safely, or fall fast and flutter before the umbrella breaks.
  {
    id: 13, ...tall(1800), spawn: { x: 640, y: 150 },
    platforms: [P(560, 150, 180), P(300, 900, 160), FIN(540, 1700, 220)],
    winds: []
  },
  // 14 · develop — a slalom shaft: ledges alternate sides.
  {
    id: 14, ...tall(2000), spawn: { x: 540, y: 200 },
    platforms: [
      P(440, 200, 200), P(400, 300, 40, 1700), P(840, 300, 40, 1700),
      P(440, 640, 220), P(620, 1040, 220), P(440, 1440, 220), FIN(560, 1880, 160)
    ],
    winds: []
  },
  // 15 · twist — updrafts are brakes: close to drop through each band, open between them.
  {
    id: 15, ...tall(1700), spawn: { x: 140, y: 160 },
    platforms: [P(60, 160, 200), FIN(980, 1600, 200)],
    winds: [UP(0, 400, 1280, 200, 200), UP(0, 820, 1280, 200, 200), UP(0, 1240, 1280, 200, 200)]
  },
  // 16 · twist — the finish slides away soon: fall fast, flutter once, land.
  {
    id: 16, ...tall(1800), spawn: { x: 640, y: 150 },
    platforms: [P(560, 150, 180), FIN(0, 0, 220, arrive(660, 1700, 1700, 1700, 3.6, 3))],
    winds: []
  },
  // 17 · develop — zig-zag well: long falls between the ledges ask for a flutter.
  {
    id: 17, ...tall(2600), spawn: { x: 520, y: 200 },
    platforms: [
      P(440, 200, 160), P(400, 300, 40, 2300), P(880, 300, 40, 2300),
      P(440, 760, 260), P(620, 1560, 260), FIN(460, 2480, 200)
    ],
    winds: []
  },
  // 18 · twist — the floor is wind: fall into the pit, the updraft at the bottom lifts you to the finish.
  {
    id: 18, ...tall(1600), spawn: { x: 200, y: 150 },
    platforms: [P(120, 150, 180), FIN(940, 1130, 200)],
    winds: [UP(380, 1000, 480, 600)]
  },
  // 19 · develop — up and over: ride the tower up, clear the wall, fall down the far side.
  {
    id: 19, ...tall(1440), spawn: { x: 140, y: 1340 },
    platforms: [P(60, 1340, 200), P(580, 300, 40, 1140), FIN(940, 1340, 200)],
    winds: [UP(300, 160, 200, 1280)]
  },
  // 20 · conclude — The Well: four screens down; brakes, slalom, and a finish that will not wait.
  {
    id: 20, ...tall(2880), spawn: { x: 160, y: 160 },
    platforms: [
      P(60, 160, 220), P(360, 300, 40, 2580), P(920, 300, 40, 2580),
      P(400, 700, 300), P(620, 1300, 300), P(400, 1900, 300),
      FIN(0, 0, 180, line(520, 2780, 820, 2780, 4))
    ],
    winds: [UP(400, 1000, 520, 160, 200), UP(400, 2200, 520, 160, 200)]
  }
]


// ═══ World 3 — Crosswinds: right, left and down ════════════════════════════
const W3: LevelDef[] = [
  // 21 · introduce — a world wider than the screen: tailwinds carry you across, an updraft in between.
  {
    id: 21, ...wide(2400), spawn: { x: 120, y: 300 },
    platforms: [P(40, 300, 200), P(1040, 540, 180), FIN(2080, 600, 180)],
    winds: [WIND('right', 260, 260, 760, 240, 220), UP(1240, 300, 120, 420), WIND('right', 1360, 340, 700, 260, 220)]
  },
  // 22 · develop — a headwind: close the umbrella to duck under it, open below and glide on.
  {
    id: 22, world: SCREEN, spawn: { x: 120, y: 200 },
    platforms: [P(40, 200, 200), FIN(700, 640, 200)],
    winds: [WIND('left', 260, 150, 1020, 180, 220)]
  },
  // 23 · introduce — a downdraft: a fast lane down the chute, then an updraft out to the finish.
  {
    id: 23, world: SCREEN, spawn: { x: 560, y: 120 },
    platforms: [P(480, 120, 200), P(440, 260, 40, 340), P(800, 260, 40, 340), P(480, 640, 360), FIN(1080, 440, 180)],
    winds: [WIND('down', 480, 160, 320, 440, 180), UP(880, 300, 160, 420)]
  },
  // 24 · develop — a wind loop: up, across, down onto the finish.
  {
    id: 24, world: SCREEN, spawn: { x: 110, y: 620 },
    platforms: [P(40, 620, 160), P(560, 300, 40, 420), FIN(1000, 640, 180)],
    winds: [UP(220, 120, 220, 600), WIND('right', 220, 60, 820, 120, 200), WIND('down', 900, 60, 300, 520, 160)]
  },
  // 25 · twist — a crosswind on top of the updraft blows you away: slip out before you reach it.
  {
    id: 25, world: SCREEN, spawn: { x: 160, y: 680 },
    platforms: [P(60, 680, 200), FIN(60, 260, 200)],
    winds: [UP(320, 160, 760, 560), WIND('right', 300, 60, 980, 130, 260)]
  },
  // 26 · develop — layered winds on the way down: ride the right-blowing ones, close through the others.
  {
    id: 26, world: SCREEN, spawn: { x: 110, y: 110 },
    platforms: [P(40, 110, 160), FIN(900, 660, 200)],
    winds: [
      WIND('right', 0, 170, 1000, 90, 160), WIND('left', 200, 300, 1080, 90, 200),
      WIND('right', 0, 430, 1000, 90, 160), WIND('left', 0, 560, 700, 70, 200)
    ]
  },
  // 27 · twist — a downdraft over the pit: keep clear of it or it drags you out of the world.
  {
    id: 27, world: SCREEN, spawn: { x: 120, y: 300 },
    platforms: [P(40, 300, 200), P(520, 420, 160), FIN(1000, 520, 200)],
    winds: [WIND('down', 300, 380, 200, 340, 220), UP(700, 400, 180, 320), WIND('down', 860, 0, 120, 360, 200)]
  },
  // 28 · develop — the headwind fills the gap; a ferry carries you through it (standing, no wind can touch you).
  {
    id: 28, world: SCREEN, spawn: { x: 120, y: 420 },
    platforms: [P(40, 420, 180), P(0, 0, 140, 20, { motion: line(330, 440, 900, 440, 7) }), FIN(1060, 520, 200)],
    winds: [WIND('left', 260, 260, 670, 300, 220)]
  },
  // 29 · twist — the headwind guards the low road: take the updraft and the tailwind above it.
  {
    id: 29, world: SCREEN, spawn: { x: 120, y: 560 },
    platforms: [P(40, 560, 200), FIN(1060, 360, 180)],
    winds: [UP(250, 100, 170, 500), WIND('right', 430, 100, 560, 120, 180), WIND('left', 440, 440, 840, 180, 240)]
  },
  // 30 · conclude — Gale Garden (two screens): the wind loop, then a long tailwind onto a sliding finish.
  {
    id: 30, ...wide(2560), spawn: { x: 110, y: 620 },
    platforms: [P(40, 620, 160), P(560, 300, 40, 420), P(880, 640, 320), FIN(0, 0, 160, line(2160, 640, 2380, 640, 5))],
    winds: [
      UP(220, 120, 220, 600), WIND('right', 220, 60, 820, 120, 200), WIND('down', 900, 60, 300, 520, 160),
      UP(1220, 300, 140, 420), WIND('right', 1360, 300, 760, 260, 200)
    ]
  }
]

// ═══ World 4 — Thorns: spikes, wide worlds, the checkpoint flag ═════════════
const W4: LevelDef[] = [
  // 31 · introduce — spikes in the pit, far below a wide updraft: keep the umbrella open and they never matter.
  {
    id: 31, world: SCREEN, spawn: { x: 120, y: 440 },
    platforms: [P(40, 440, 200), FIN(980, 440, 200)],
    winds: [UP(300, 320, 600, 400)],
    hazards: [thornFloor(240, 800)]
  },
  // 32 · develop — thorns overhead: the first updraft stops short of them, the second does not — slip out early.
  {
    id: 32, ...wide(2200), spawn: { x: 120, y: 500 },
    platforms: [P(40, 500, 200), P(280, 230, 340, 30), P(660, 480, 160), P(840, -20, 180, 30), P(1000, 380, 160), FIN(1340, 580, 260)],
    winds: [UP(300, 330, 300, 390), UP(880, 60, 100, 660)],
    hazards: [SPIKES(280, 260, 340, 'down'), SPIKES(840, 10, 180, 'down'), thornFloor(240, 1700)]
  },
  // 33 · develop — stepping columns over a thorn pit, thorn blocks in every gap.
  build(33, wide(2000), { x: 110, y: 420 },
    { platforms: [P(40, 420, 180), FIN(1560, 440, 200)], hazards: [thornFloor(220, 1340)] },
    { winds: [UP(290, 300, 110, 420), UP(530, 300, 90, 420), UP(790, 300, 90, 420), UP(1080, 300, 80, 420), UP(1380, 300, 80, 420)] },
    thornBlock(430, 560, 70), thornBlock(670, 560, 70), thornBlock(940, 560, 80), thornBlock(1230, 560, 80)),
  // 34 · introduce — the checkpoint flag: a long crossing with a resting ledge halfway.
  build(34, wide(3000), { x: 120, y: 460 },
    { platforms: [P(40, 460, 200), P(1240, 600, 300)], winds: [UP(300, 340, 300, 380), WIND('right', 600, 300, 620, 220, 200)], hazards: [thornFloor(240, 1000)], checkpoints: [CHECKPOINT(1400, 600)] },
    { platforms: [FIN(2520, 600, 280)], winds: [UP(1580, 280, 160, 440), WIND('right', 1740, 240, 820, 300, 220)], hazards: [thornFloor(1540, 1460)] },
    thornBlock(2250, 600, 120)),
  // 35 · develop — the thorn tunnel: a tailwind between two spiked walls; updraft pockets keep you off the floor.
  {
    id: 35, ...wide(2400), spawn: { x: 120, y: 420 },
    platforms: [P(40, 420, 200), P(300, 140, 1600, 30), P(300, 650, 1600, 30), FIN(2060, 520, 200)],
    winds: [
      WIND('right', 300, 196, 1600, 428, 180),
      UP(380, 330, 120, 294, 220), UP(780, 330, 140, 294, 220), UP(1180, 330, 140, 294, 220), UP(1580, 330, 140, 294, 220)
    ],
    hazards: [SPIKES(300, 170, 1600, 'down'), SPIKES(300, 624, 1600, 'up')]
  },
  // 36 · twist — the needle's eye: fall through narrow gaps in spiked shelves.
  build(36, tall(1600), { x: 300, y: 160 },
    { platforms: [P(200, 160, 240), P(160, 0, 40, 1600), P(1120, 0, 40, 1600), FIN(560, 1540, 200)] },
    ...[[600, 660], [1100, 340]].map(([y, gx]) => ({
      platforms: [P(200, y!, gx! - 200, 20), P(gx! + 200, y!, 920 - gx!, 20)],
      hazards: [SPIKES(200, y! - 26, gx! - 200, 'up'), SPIKES(gx! + 200, y! - 26, 920 - gx!, 'up')]
    }))),
  // 37 · develop — the bramble shaft: land on the bare half of each ledge, or flutter past them.
  {
    id: 37, ...tall(2600), spawn: { x: 520, y: 200 },
    platforms: [P(440, 200, 160), P(400, 300, 40, 2300), P(880, 300, 40, 2300), P(440, 900, 260), P(620, 1700, 260), FIN(460, 2480, 200)],
    winds: [],
    hazards: [SPIKES(440, 874, 130, 'up'), SPIKES(750, 1674, 130, 'up')]
  },
  // 38 · twist — the headwind pushes back: close under it at once, ride the pockets below over the thorns.
  {
    id: 38, ...wide(2200), spawn: { x: 120, y: 300 },
    platforms: [P(40, 300, 200), FIN(1900, 560, 200)],
    winds: [
      WIND('left', 260, 120, 1700, 240, 240),
      UP(320, 400, 280, 294), UP(700, 400, 280, 294), UP(1080, 400, 280, 294), UP(1460, 400, 280, 294)
    ],
    hazards: [thornFloor(240, 1800)]
  },
  // 39 · develop — two ferries over the thorns under a headwind: ride, and change ferries in time.
  {
    id: 39, ...wide(2400), spawn: { x: 120, y: 420 },
    platforms: [
      P(40, 420, 240), P(0, 0, 220, 20, { motion: line(370, 440, 1000, 440, 6) }),
      P(0, 0, 220, 20, { motion: line(1280, 520, 1800, 520, 5) }), FIN(1980, 580, 260)
    ],
    winds: [WIND('left', 300, 250, 700, 190, 200)],
    hazards: [thornFloor(240, 2000)]
  },
  // 40 · conclude — Bramble Run: columns over thorns, the tunnel, a ferry; two flags on the way.
  build(40, wide(3800), { x: 110, y: 420 },
    { platforms: [P(40, 420, 180)], winds: [UP(280, 300, 140, 420), UP(550, 300, 130, 420), UP(840, 300, 130, 420)], hazards: [thornFloor(220, 3500)] },
    thornBlock(450, 560, 70), thornBlock(700, 560, 80),
    { platforms: [P(1020, 480, 220)], checkpoints: [CHECKPOINT(1130, 480)] },
    {
      platforms: [P(1300, 140, 1100, 30), P(1300, 650, 1100, 30)],
      winds: [WIND('right', 1300, 196, 1100, 428, 180), UP(1360, 330, 120, 294, 220), UP(1760, 330, 140, 294, 220), UP(2160, 330, 140, 294, 220)],
      hazards: [SPIKES(1300, 170, 1100, 'down'), SPIKES(1300, 624, 1100, 'up')]
    },
    { platforms: [P(2460, 520, 200)], checkpoints: [CHECKPOINT(2560, 520)] },
    { platforms: [P(0, 0, 220, 20, { motion: line(2790, 540, 3280, 540, 5) }), FIN(3460, 600, 260)], winds: [WIND('left', 2700, 330, 700, 210, 220)] })
]

// ═══ World 5 — Walldorf: solid, bouncy, deadly, charging ════════════════════
const W5: LevelDef[] = [
  // 41 · introduce — a grey Walldorf is a stepping stone: land on it, rest, ride on.
  {
    id: 41, world: SCREEN, spawn: { x: 120, y: 400 },
    platforms: [P(40, 400, 200), FIN(940, 440, 200)],
    winds: [UP(560, 300, 300, 420)],
    hazards: [WALLDORF('solid', 460, 560, undefined, 80, 120)]
  },
  // 42 · develop — a Walldorf blocks the draft: dip under it where the current is short.
  {
    id: 42, world: SCREEN, spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1060, 440, 200)],
    winds: [UP(300, 330, 240, 390), UP(540, 430, 200, 290), UP(740, 330, 240, 390)],
    hazards: [WALLDORF('solid', 640, 300, undefined, 60, 300), thornFloor(240, 800)]
  },
  // 43 · develop — Walldorf elevators: ride one up, change to the next, step off onto the high finish.
  {
    id: 43, world: SCREEN, spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 320), P(480, 300, 160), FIN(820, 200, 200)],
    winds: [],
    hazards: [
      WALLDORF('solid', 400, 0, line(400, 720, 400, 330, 6), 60, 160),
      WALLDORF('solid', 730, 0, line(730, 700, 730, 230, 5), 60, 160),
      thornFloor(240, 1040)
    ]
  },
  // 44 · introduce — an amber Walldorf is a trampoline: land on top and it throws you up to the high finish.
  {
    id: 44, world: SCREEN, spawn: { x: 120, y: 500 },
    platforms: [P(40, 500, 200), FIN(560, 460, 200)],
    winds: [],
    hazards: [WALLDORF('bounce', 420, 640, undefined, 80, 160), thornFloor(240, 1040)]
  },
  // 45 · develop — trampoline steps, each a little higher.
  {
    id: 45, world: SCREEN, spawn: { x: 110, y: 560 },
    platforms: [P(40, 560, 160), FIN(860, 300, 200)],
    winds: [],
    hazards: [
      WALLDORF('bounce', 330, 680, undefined, 44, 160), WALLDORF('bounce', 510, 560, undefined, 44, 160),
      WALLDORF('bounce', 690, 440, undefined, 44, 160), thornFloor(200, 1080)
    ]
  },
  // 46 · twist — bumpers in the draft: they knock you back; slip past while they are up or down.
  {
    id: 46, ...wide(2000), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1660, 460, 200)],
    winds: [UP(280, 330, 1300, 390)],
    hazards: [
      WALLDORF('bounce', 560, 0, line(560, 240, 560, 560, 2.4), 40, 160),
      WALLDORF('bounce', 840, 0, line(840, 560, 840, 240, 2.1), 40, 160),
      WALLDORF('bounce', 1120, 0, line(1120, 240, 1120, 560, 1.8), 40, 160),
      WALLDORF('bounce', 1400, 0, line(1400, 560, 1400, 240, 1.6), 40, 160),
      thornFloor(240, 1400)
    ]
  },
  // 47 · introduce — a red Walldorf is deadly: pass under the hanging ones, over the standing ones.
  {
    id: 47, ...wide(1800), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1500, 440, 200)],
    winds: [UP(280, 330, 1140, 390)],
    hazards: [
      WALLDORF('deadly', 520, 140, undefined, 50, 280), WALLDORF('deadly', 700, 600, undefined, 50, 240),
      WALLDORF('deadly', 900, 150, undefined, 50, 300), WALLDORF('deadly', 1100, 590, undefined, 50, 240),
      WALLDORF('deadly', 1300, 140, undefined, 50, 280)
    ]
  },
  // 48 · develop — gatekeepers: red Walldorfs rise and sink through the draft; pass while the way is clear.
  {
    id: 48, ...wide(2000), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1760, 440, 200)],
    winds: [UP(280, 330, 1400, 390)],
    hazards: [
      WALLDORF('deadly', 600, 0, line(600, 180, 600, 600, 3.6), 50, 200),
      WALLDORF('deadly', 1000, 0, line(1000, 600, 1000, 180, 3), 50, 200),
      WALLDORF('deadly', 1400, 0, line(1400, 180, 1400, 600, 2.4), 50, 200),
      thornFloor(240, 1500)
    ]
  },
  // 49 · twist — Charge! An angry Walldorf charges along the draft: wait in the nook below its line, then go.
  {
    id: 49, ...wide(1800), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), P(820, 520, 160), FIN(1460, 520, 200)],
    winds: [UP(280, 330, 500, 390), UP(1000, 330, 400, 390)],
    hazards: [WALLDORF('deadly', 0, 0, lunge(1760, 400, 860, 400, 3.6), 40, 110), thornFloor(240, 1500)]
  },
  // 50 · conclude — Walldorf Works: the elevator, the trampolines, the gate, the charge.
  build(50, wide(3200), { x: 120, y: 620 },
    { platforms: [P(40, 620, 320), P(480, 260, 240)], hazards: [WALLDORF('solid', 400, 0, line(400, 720, 400, 280, 5), 60, 160), thornFloor(360, 2800)], checkpoints: [CHECKPOINT(640, 260)] },
    { hazards: [WALLDORF('bounce', 850, 500, undefined, 60, 160), WALLDORF('bounce', 1030, 440, undefined, 60, 160), WALLDORF('bounce', 1210, 380, undefined, 60, 160)] },
    { platforms: [P(1340, 360, 200)], checkpoints: [CHECKPOINT(1480, 360)] },
    { winds: [UP(1560, 330, 800, 390)], hazards: [WALLDORF('deadly', 1900, 0, line(1900, 170, 1900, 620, 3), 50, 200), WALLDORF('deadly', 2200, 140, undefined, 50, 280)] },
    { platforms: [FIN(2480, 520, 200)], hazards: [WALLDORF('deadly', 0, 0, lunge(3100, 420, 2400, 420, 4), 40, 110)] })
]

// ═══ World 6 — Prickbait: mines still, sliding, orbiting, swinging, arriving ═
const W6: LevelDef[] = [
  // 51 · introduce — Prickbait in plain sight, never in the way: the draft carries you past.
  {
    id: 51, world: SCREEN, spawn: { x: 120, y: 440 },
    platforms: [P(40, 440, 200), FIN(980, 440, 200)],
    winds: [UP(300, 320, 600, 400)],
    hazards: [MINE(560, 640), MINE(760, 230), MINE(640, 480)]
  },
  // 52 · develop — the mine weave: steer around them while the column lifts you.
  {
    id: 52, world: SCREEN, spawn: { x: 120, y: 640 },
    platforms: [P(40, 640, 200), FIN(720, 240, 200)],
    winds: [UP(300, 80, 360, 640)],
    hazards: [MINE(380, 500), MINE(580, 380), MINE(380, 260), MINE(560, 170)]
  },
  // 53 · develop — sliding mines cross the draft: go behind them.
  {
    id: 53, world: SCREEN, spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1120, 440, 160)],
    winds: [UP(280, 330, 800, 390)],
    hazards: [MINE(0, 0, line(480, 250, 480, 600, 2.4)), MINE(0, 0, line(720, 600, 720, 250, 2)), MINE(0, 0, line(960, 250, 960, 600, 1.8))]
  },
  // 54 · twist — Orbit: a mine circles the finish, another sweeps above it; land between them.
  {
    id: 54, world: SCREEN, spawn: { x: 120, y: 300 },
    platforms: [P(40, 300, 200), FIN(900, 520, 200)],
    winds: [UP(300, 180, 300, 540)],
    hazards: [MINE(0, 0, circle(1000, 500, 170, 2.6)), MINE(0, 0, line(820, 330, 1180, 330, 2.2)), MINE(0, 0, line(700, 260, 700, 560, 2.4))]
  },
  // 55 · develop — pendulums: drop through the current between their swings.
  {
    id: 55, world: SCREEN, spawn: { x: 120, y: 160 },
    platforms: [P(40, 160, 200), FIN(820, 640, 200)],
    winds: [UP(260, 200, 900, 300, 200)],
    hazards: [MINE(0, 0, swing(640, 0, 420, 0.9, 3)), MINE(0, 0, swing(900, 0, 540, 0.6, 2.4))]
  },
  // 56 · twist — the late guard: a mine comes to sit on the finish after seven seconds. Hurry.
  {
    id: 56, ...wide(2000), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1560, 620, 200)],
    winds: [UP(280, 330, 400, 390), WIND('right', 680, 300, 800, 240, 200)],
    hazards: [MINE(1100, 280), MINE(1300, 640), MINE(0, 0, arrive(2000, 400, 1660, 592, 7, 2))]
  },
  // 57 · develop — the mine shaft: a long fall between mines; flutter and steer.
  {
    id: 57, ...tall(2400), spawn: { x: 440, y: 200 },
    platforms: [P(340, 200, 200), P(300, 300, 40, 2100), P(980, 300, 40, 2100), FIN(560, 2300, 200)],
    winds: [],
    hazards: [
      MINE(500, 600), MINE(780, 800), MINE(400, 900), MINE(560, 1100), MINE(840, 1300), MINE(660, 1400), MINE(420, 1500),
      MINE(700, 1750), MINE(900, 1850), MINE(520, 2000), MINE(0, 0, line(400, 2150, 900, 2150, 2.4))
    ]
  },
  // 58 · develop — mines in the tailwind: updraft pockets lift you, the mines make you choose the height.
  {
    id: 58, ...wide(2200), spawn: { x: 120, y: 300 },
    platforms: [P(40, 300, 200), FIN(1960, 620, 200)],
    winds: [WIND('right', 260, 240, 1600, 360, 200), UP(1000, 300, 120, 420, 220), UP(1500, 300, 120, 420, 220)],
    hazards: [MINE(700, 330), MINE(950, 520), MINE(1250, 380), MINE(1450, 560), MINE(1700, 400)]
  },
  // 59 · twist — bouncing Prickbait: a mine hangs over the middle trampoline — bounce on it CLOSED, low.
  {
    id: 59, world: SCREEN, spawn: { x: 120, y: 500 },
    platforms: [P(40, 500, 200), FIN(860, 560, 200)],
    winds: [],
    hazards: [
      WALLDORF('bounce', 340, 640, undefined, 80, 160), WALLDORF('bounce', 520, 640, undefined, 80, 160),
      WALLDORF('bounce', 700, 640, undefined, 80, 160), MINE(520, 410), MINE(700, 400), MINE(0, 0, line(620, 300, 620, 470, 2.2)), thornFloor(240, 1000)
    ]
  },
  // 60 · conclude — Prickbait Palace: the weave, the sliding mines in the wind, the orbit.
  build(60, wide(3200), { x: 120, y: 640 },
    { platforms: [P(40, 640, 200), P(720, 240, 200)], winds: [UP(300, 80, 360, 640)], hazards: [MINE(380, 500), MINE(580, 380), thornFloor(240, 2800)], checkpoints: [CHECKPOINT(820, 240)] },
    {
      platforms: [P(2000, 520, 200)],
      winds: [WIND('right', 960, 200, 1000, 300, 200), UP(1420, 260, 100, 460, 220)],
      hazards: [MINE(0, 0, line(1250, 180, 1250, 520, 2.4)), MINE(0, 0, line(1650, 520, 1650, 180, 2))],
      checkpoints: [CHECKPOINT(2100, 520)]
    },
    { platforms: [FIN(2600, 520, 200)], winds: [UP(2240, 300, 200, 420)], hazards: [MINE(0, 0, circle(2700, 500, 170, 3.4))] })
]

// ═══ World 7 — Ventilators and Super Streams ═══════════════════════════════
/** A row of ventilators side by side under one updraft. */
const fans = (x: number, n: number, top: number, speed = 240, floor = 720): Part => ({
  hazards: Array.from({ length: n }, (_, i) => FAN(x + i * 90, floor - 60)),
  winds: [UP(x, top, n * 90, floor - 60 - top, speed)]
})
const W7: LevelDef[] = [
  // 61 · introduce — ventilators blow an updraft: keep the umbrella open and the blades never reach you.
  build(61, { world: SCREEN }, { x: 120, y: 440 },
    { platforms: [P(40, 440, 200), FIN(1000, 440, 200)] }, fans(330, 3, 300), fans(720, 2, 300)),
  // 62 · develop — fan steps: single ventilators, wider gaps.
  build(62, wide(1900), { x: 110, y: 420 },
    { platforms: [P(40, 420, 180), FIN(1660, 440, 200)] },
    vent(300, 300), vent(580, 300), vent(880, 300), vent(1200, 300), vent(1500, 300)),
  // 63 · twist — the shelf above the blades: close to drop through the fan wind onto the finish.
  build(63, { world: SCREEN }, { x: 120, y: 300 },
    { platforms: [P(40, 300, 200), FIN(580, 520, 150)] }, fans(400, 6, 200)),
  // 64 · introduce — the Super Stream as a cannon: drift into it low and it throws you high.
  {
    id: 64, ...tall(1440), spawn: { x: 120, y: 1300 },
    platforms: [P(40, 1300, 200), FIN(600, 620, 200)],
    winds: [SUPER(300, 1000, 200, 440)]
  },
  // 65 · develop — under a ceiling the Super Stream splats you: flutter to rise slowly, slip out onto the ledge.
  {
    id: 65, world: SCREEN, spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 200), P(0, 90, 1280, 30), FIN(1020, 300, 200)],
    winds: [SUPER(320, 120, 640, 600)]
  },
  // 66 · twist — a Super Stream over ventilators: open too long and you splat, closed too long and you are shredded.
  build(66, { world: SCREEN }, { x: 120, y: 400 },
    { platforms: [P(40, 400, 200), P(0, 90, 1280, 30), FIN(1020, 400, 200)], winds: [SUPER(320, 120, 630, 540)] },
    { hazards: Array.from({ length: 7 }, (_, i) => FAN(320 + i * 90, 660)) }),
  // 67 · develop — ride the Super Stream up into the tailwind under the ceiling.
  {
    id: 67, world: SCREEN, spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 200), P(0, 60, 1280, 30), FIN(1060, 300, 200)],
    winds: [SUPER(300, 200, 400, 520), WIND('right', 300, 90, 900, 110, 200)],
    hazards: [MINE(0, 0, line(820, 100, 820, 280, 2))]
  },
  // 68 · develop — the Super Stream and a finish that rides up and down.
  {
    id: 68, world: SCREEN, spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 200), P(0, 90, 1280, 30), FIN(0, 0, 160, line(1000, 200, 1000, 560, 3))],
    winds: [SUPER(320, 120, 500, 600)]
  },
  // 69 · twist — thorns on the ceiling: here even a slow touch kills. Keep low.
  {
    id: 69, world: SCREEN, spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 200), P(0, 60, 1280, 30), FIN(1020, 320, 200)],
    winds: [SUPER(320, 140, 640, 580)],
    hazards: [SPIKES(0, 90, 1280, 'down')]
  },
  // 70 · conclude — the Blower Works: fan steps, a Super Stream over fans, a thorn ceiling.
  build(70, wide(3000), { x: 110, y: 420 },
    { platforms: [P(40, 420, 180), P(1040, 440, 200)], checkpoints: [CHECKPOINT(1140, 440)] },
    vent(300, 300), vent(580, 300), vent(880, 300),
    { platforms: [P(1240, 90, 900, 30), P(2000, 420, 200)], winds: [SUPER(1300, 120, 630, 540)], checkpoints: [CHECKPOINT(2100, 420)] },
    { hazards: Array.from({ length: 7 }, (_, i) => FAN(1300 + i * 90, 660)) },
    { platforms: [P(2200, 60, 800, 30), FIN(2720, 340, 200)], winds: [SUPER(2240, 140, 400, 580)], hazards: [SPIKES(2200, 90, 800, 'down')] })
]

// ═══ World 8 — Switches: toggle and timed buttons ══════════════════════════
/** A current that a button channel switches (to another direction and/or speed). */
const switched = (w: WindDef, channel: number, to: { dir?: WindDef['dir']; speed?: number }): WindDef => ({ ...w, channel, switched: to })
const W8: LevelDef[] = [
  // 71 · introduce — a button on the way: stepping on it builds the bridge.
  {
    id: 71, world: SCREEN, spawn: { x: 100, y: 400 },
    platforms: [P(40, 400, 220), P(260, 400, 500, 20, { channel: 1 }), FIN(880, 470, 180)],
    winds: [],
    buttons: [BUTTON(160, 386, 1)]
  },
  // 72 · develop — the button is behind you: it turns the headwind into a tailwind.
  {
    id: 72, world: SCREEN, spawn: { x: 220, y: 300 },
    platforms: [P(40, 300, 260), FIN(1060, 520, 180)],
    winds: [switched(WIND('left', 300, 220, 800, 200, 240), 1, { dir: 'right' })],
    hazards: [MINE(0, 0, line(560, 470, 560, 230, 2)), MINE(0, 0, line(720, 230, 720, 470, 2.4)), MINE(0, 0, line(880, 470, 880, 230, 1.7)), thornFloor(300, 980)],
    buttons: [BUTTON(60, 286, 1)]
  },
  // 73 · twist — a button in mid-air: touch it on the way up and the second updraft starts.
  {
    id: 73, world: SCREEN, spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 200), FIN(980, 440, 200)],
    winds: [UP(280, 120, 160, 600), switched(UP(700, 300, 200, 420, 0), 1, { speed: 260 })],
    hazards: [MINE(0, 0, circle(360, 440, 70, 2.4)), MINE(0, 0, circle(360, 220, 60, 2)), MINE(0, 0, line(600, 200, 600, 480, 2.2)), MINE(0, 0, line(720, 380, 880, 380, 1.6)), thornFloor(240, 1040)],
    buttons: [BUTTON(338, 300, 1, undefined, 44, 20)]
  },
  // 74 · introduce — a timed button: the bridge only lasts five seconds. Run.
  {
    id: 74, ...wide(1600), spawn: { x: 120, y: 400 },
    platforms: [P(40, 400, 200), P(240, 400, 900, 20, { channel: 1 }), FIN(1300, 480, 200)],
    winds: [],
    hazards: [MINE(0, 0, line(520, 380, 520, 250, 1.4)), MINE(0, 0, line(760, 250, 760, 380, 1.6)), MINE(0, 0, line(1000, 380, 1000, 250, 1.2)), thornFloor(240, 1300)],
    buttons: [BUTTON(180, 386, 1, 4.6)]
  },
  // 75 · develop — the gate: a button on the lower ledge takes the wall away.
  {
    id: 75, world: SCREEN, spawn: { x: 120, y: 300 },
    platforms: [P(40, 300, 200), P(260, 560, 160), P(600, 0, 40, 720, { channel: 1, whenOff: true }), FIN(980, 400, 200)],
    winds: [UP(440, 240, 500, 480)],
    hazards: [WALLDORF('deadly', 0, 0, line(720, 150, 720, 560, 2.6), 50, 160), WALLDORF('deadly', 0, 0, line(860, 560, 860, 150, 2.2), 50, 160), MINE(0, 0, line(300, 420, 420, 420, 2)), thornFloor(240, 1040)],
    buttons: [BUTTON(320, 546, 1)]
  },
  // 76 · develop — two colours: the first button builds the bridge, the second (on the bridge) starts the updraft.
  {
    id: 76, world: SCREEN, spawn: { x: 100, y: 420 },
    platforms: [P(40, 420, 220), P(260, 420, 400, 20, { channel: 1 }), FIN(1060, 300, 200)],
    winds: [switched(UP(760, 150, 200, 570, 0), 2, { speed: 260 })],
    hazards: [MINE(860, 520), MINE(0, 0, line(780, 330, 940, 330, 2.2)), MINE(0, 0, line(940, 220, 780, 220, 1.8)), WALLDORF('deadly', 0, 0, line(460, 290, 460, 380, 1.6), 40, 60), thornFloor(240, 1040)],
    buttons: [BUTTON(150, 406, 1), BUTTON(600, 406, 2)]
  },
  // 77 · twist — a timed updraft: press, run back, ride it before it dies.
  {
    id: 77, world: SCREEN, spawn: { x: 500, y: 620 },
    platforms: [P(40, 620, 500), FIN(820, 300, 200)],
    winds: [switched(UP(560, 140, 200, 580, 0), 1, { speed: 260 })],
    hazards: [MINE(0, 0, line(600, 420, 720, 420, 1.8)), MINE(0, 0, line(720, 240, 600, 240, 1.5)), MINE(0, 0, line(300, 570, 300, 460, 1.4)), thornFloor(540, 740)],
    buttons: [BUTTON(100, 606, 1, 7)]
  },
  // 78 · develop — timed bridges in a row: each button gives you three seconds.
  {
    id: 78, ...wide(2000), spawn: { x: 120, y: 400 },
    platforms: [P(40, 400, 200), P(240, 400, 600, 20, { channel: 1 }), P(840, 400, 160), P(1000, 400, 600, 20, { channel: 2 }), FIN(1720, 480, 200)],
    winds: [],
    hazards: [MINE(0, 0, line(460, 380, 460, 250, 1.4)), MINE(0, 0, line(700, 250, 700, 380, 1.5)), MINE(0, 0, line(1200, 380, 1200, 250, 1.3)), MINE(0, 0, line(1440, 250, 1440, 380, 1.2)), thornFloor(240, 1500)],
    buttons: [BUTTON(160, 386, 1, 2.9), BUTTON(900, 386, 2, 2.9)]
  },
  // 79 · twist — the switch fortress: a tailwind past a red Walldorf, then a timed gate.
  {
    id: 79, ...wide(2200), spawn: { x: 80, y: 460 },
    platforms: [P(40, 460, 200), P(1200, 600, 240), P(1600, 0, 40, 720, { channel: 2, whenOff: true }), FIN(1900, 460, 200)],
    winds: [switched(WIND('left', 280, 300, 900, 260, 240), 1, { dir: 'right' }), UP(640, 300, 100, 420, 220), UP(1460, 260, 300, 460)],
    hazards: [WALLDORF('deadly', 0, 0, line(1000, 250, 1000, 620, 2.4), 50, 160), MINE(0, 0, line(460, 280, 460, 580, 2)), MINE(0, 0, line(820, 580, 820, 280, 1.8)), MINE(0, 0, line(1680, 300, 1680, 560, 1.6)), thornFloor(240, 1900)],
    buttons: [BUTTON(150, 446, 1), BUTTON(1300, 586, 2, 4)]
  },
  // 80 · conclude — the Switchyard: bridge, wind switch, timed updraft, gate.
  {
    id: 80, ...wide(3000), spawn: { x: 100, y: 400 },
    platforms: [
      P(40, 400, 220), P(260, 400, 500, 20, { channel: 1 }), P(1660, 620, 240), P(2200, 280, 200),
      P(2500, 0, 40, 720, { channel: 4, whenOff: true }), FIN(2700, 560, 200)
    ],
    winds: [switched(WIND('left', 800, 320, 900, 240, 240), 2, { dir: 'right' }), UP(1200, 320, 100, 400, 220), switched(UP(1920, 120, 200, 600, 0), 3, { speed: 260 })],
    hazards: [MINE(0, 0, line(1000, 300, 1000, 560, 2.2)), MINE(0, 0, line(1450, 560, 1450, 300, 1.9)), MINE(0, 0, circle(2800, 540, 150, 3)), thornFloor(240, 2700)],
    buttons: [BUTTON(150, 386, 1), BUTTON(700, 386, 2), BUTTON(1840, 606, 3, 4), BUTTON(2240, 266, 4)],
    checkpoints: [CHECKPOINT(1760, 620), CHECKPOINT(2320, 280)]
  }
]

// ═══ World 9 — Hunters: triggered lunges, Walldorfs that follow ═════════════
/** A red Walldorf that drops (or rises) when Pweeg flies near it, like a Thwomp. */
const thwomp = (x: number, fromY: number, toY: number, radius: number, period = 2.5): HazardDef =>
  WALLDORF('deadly', 0, 0, lunge(x, fromY, x, toY, period, { trigger: true, radius }), 80, 160)
const W9: LevelDef[] = [
  // 81 · introduce — the first one slams down well ahead of you; watch it, then pass while it pulls back.
  {
    id: 81, ...wide(1800), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1460, 440, 200)],
    winds: [UP(280, 330, 1100, 390)],
    hazards: [thwomp(600, 140, 420, 380), thwomp(1000, 140, 420, 290), thornFloor(240, 1300)]
  },
  // 82 · develop — a row of them, one rising from below, each waking later than the last.
  {
    id: 82, ...wide(2400), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(2060, 440, 200)],
    winds: [UP(280, 330, 1700, 390)],
    hazards: [thwomp(600, 140, 420, 360), thwomp(950, 140, 420, 300), thwomp(1300, 700, 400, 340), thwomp(1650, 140, 420, 280), thornFloor(240, 1900)]
  },
  // 83 · introduce — a bouncy Walldorf follows you: harmless, but it shoves you around.
  {
    id: 83, ...wide(2000), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1760, 440, 200)],
    winds: [UP(280, 330, 1400, 390)],
    hazards: [WALLDORF('bounce', 200, 220, follow(70), 50, 120), thornFloor(240, 1600)]
  },
  // 84 · develop — the chaser: a red Walldorf follows; keep moving and it never catches you.
  {
    id: 84, ...wide(2600), spawn: { x: 160, y: 460 },
    platforms: [P(40, 460, 200), P(940, 480, 160), FIN(2300, 440, 200)],
    winds: [UP(280, 330, 600, 390), UP(1160, 330, 1000, 390)],
    hazards: [WALLDORF('deadly', 100, 150, follow(110), 50, 120), thornFloor(240, 2200)]
  },
  // 85 · twist — the goalkeeper slides to block the gap you aim for: lure it up, then drop under it.
  {
    id: 85, world: SCREEN, spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), P(880, 0, 40, 220), P(880, 600, 40, 120), FIN(1040, 560, 200)],
    winds: [UP(280, 200, 560, 520)],
    hazards: [WALLDORF('deadly', 900, 410, follow(150, { a: { x: 900, y: 280 }, b: { x: 900, y: 540 } }), 40, 120)]
  },
  // 86 · develop — Thwomps over a tailwind: once the wind has you, you cannot wait; choose when to go in.
  {
    id: 86, ...wide(2200), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), FIN(1900, 560, 200)],
    winds: [UP(280, 330, 300, 390), WIND('right', 580, 300, 1200, 260, 200), UP(1080, 300, 100, 420, 220), UP(1500, 300, 100, 420, 220)],
    hazards: [thwomp(900, 140, 430, 320), thwomp(1300, 140, 430, 320), thornFloor(240, 1900)]
  },
  // 87 · develop — the long hunt: Thwomps, a chaser, the goalkeeper; two flags.
  {
    id: 87, ...wide(3600), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), P(1440, 480, 200), P(2860, 0, 40, 220), P(2860, 600, 40, 120), FIN(3200, 560, 200)],
    winds: [UP(280, 330, 1100, 390), UP(1700, 330, 900, 390), UP(2620, 200, 200, 520), UP(2960, 330, 120, 390)],
    hazards: [
      thwomp(700, 140, 420, 330), thwomp(1100, 700, 400, 330),
      WALLDORF('deadly', 1500, 140, follow(100), 50, 120),
      WALLDORF('deadly', 2880, 410, follow(150, { a: { x: 2880, y: 280 }, b: { x: 2880, y: 540 } }), 40, 120),
      thornFloor(240, 3300)
    ],
    checkpoints: [CHECKPOINT(1540, 480)]
  },
  // 88 · twist — a chaser while you flutter up a Super Stream.
  {
    id: 88, ...wide(1800), spawn: { x: 120, y: 620 },
    platforms: [P(40, 620, 200), P(0, 90, 1800, 30), FIN(1400, 420, 200)],
    winds: [SUPER(300, 120, 600, 600), WIND('right', 900, 140, 500, 160, 200)],
    hazards: [WALLDORF('deadly', 120, 220, follow(90), 50, 120)]
  },
  // 89 · develop — the ambush: a mine arrives behind you, a Thwomp ahead, a bumper follows.
  {
    id: 89, ...wide(2400), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), P(1100, 520, 160), FIN(2060, 440, 200)],
    winds: [UP(280, 330, 760, 390), UP(1300, 330, 700, 390)],
    hazards: [
      MINE(0, 0, arrive(-100, 380, 600, 380, 3, 4)), thwomp(800, 140, 420, 320), thwomp(1600, 700, 400, 330),
      WALLDORF('bounce', 1200, 200, follow(80), 50, 120), thornFloor(240, 1900)
    ]
  },
  // 90 · conclude — the Hunters' Lodge: everything that hunts, on one long run.
  {
    id: 90, ...wide(3800), spawn: { x: 120, y: 460 },
    platforms: [P(40, 460, 200), P(1500, 480, 200), P(2700, 0, 40, 220), P(2700, 600, 40, 120), P(2960, 460, 200), FIN(3500, 520, 200)],
    winds: [UP(280, 330, 1160, 390), UP(1760, 330, 700, 390), UP(2460, 200, 200, 520), UP(2780, 330, 120, 390), WIND('right', 3200, 330, 260, 200, 180)],
    hazards: [
      thwomp(650, 140, 420, 320), thwomp(1000, 700, 400, 330), thwomp(1300, 140, 420, 290),
      WALLDORF('deadly', 1560, 140, follow(105), 50, 120),
      WALLDORF('deadly', 2720, 410, follow(160, { a: { x: 2720, y: 280 }, b: { x: 2720, y: 540 } }), 40, 120),
      MINE(0, 0, circle(3600, 500, 150, 3.2)), thornFloor(240, 3500)
    ],
    checkpoints: [CHECKPOINT(1600, 480), CHECKPOINT(3060, 460)]
  }
]

// ═══ World 10 — The Storm: everything, combined ═════════════════════════════
// Long runs chained from the earlier worlds' set pieces, each between two ledges whose
// tops sit at y 460 (a segment starts where the last ledge ends).
type Segment = { part: Part; len: number }
const LEDGE_Y = 460
/** Updraft (or ventilator) columns, optionally with thorn blocks in the gaps. */
const columns = (n: number, gap: number, opts: { vent?: boolean; thorns?: boolean; w?: number } = {}): Segment => {
  const w = opts.w ?? 100
  const parts: Part[] = []
  for (let i = 0; i < n; i++) {
    const x = 40 + i * (w + gap)
    parts.push(opts.vent ? vent(x, 330, 720, w) : { winds: [UP(x, 330, w, 390)] })
    if (opts.thorns && i < n - 1) parts.push(thornBlock(x + w + gap / 2 - 35, 570, 70))
  }
  return { part: merge(...parts), len: 40 + n * (w + gap) - gap + 60 }
}
/** A long updraft with Thwomps waking over it. */
const thwompRun = (n: number, radius: number, fromBelow: number[] = []): Segment => ({
  part: {
    winds: [UP(40, 330, n * 400, 390)],
    hazards: Array.from({ length: n }, (_, i) => fromBelow.includes(i) ? thwomp(240 + i * 400, 700, 400, radius + 20) : thwomp(240 + i * 400, 140, 420, radius))
  },
  len: 40 + n * 400 + 60
})
/** The thorn tunnel: a tailwind between spiked walls, updraft pockets inside. */
const tunnel = (len: number, every = 400): Segment => {
  const pockets: WindDef[] = []
  for (let x = 80; x < len - 60; x += every) pockets.push(UP(x, 330, 130, 244, 220))
  pockets.push(UP(len - 90, 330, 130, 244, 220))
  return {
    part: {
      platforms: [P(40, 170, len, 30), P(40, 600, len, 30)],
      winds: [WIND('right', 40, 226, len, 348, 180), ...pockets],
      hazards: [SPIKES(40, 200, len, 'down'), SPIKES(40, 574, len, 'up')]
    },
    len: len + 140
  }
}
/** Trampolines down and up again; a mine over the middle one asks for a closed bounce. */
const tramps = (mine = false): Segment => ({
  part: {
    hazards: [
      WALLDORF('bounce', 110, 680, undefined, 60, 160), WALLDORF('bounce', 290, 640, undefined, 60, 160),
      WALLDORF('bounce', 470, 600, undefined, 60, 160), ...(mine ? [MINE(290, 400)] : [])
    ]
  },
  len: 620
})
/** A Super Stream under a ceiling (thorns optional): flutter across, slip out onto the next ledge. */
const superCeil = (w: number, thorns = false): Segment => ({
  part: {
    platforms: [P(0, 90, w + 120, 30)],
    winds: [SUPER(40, 150, w, 570)],
    hazards: thorns ? [SPIKES(0, 120, w + 120, 'down')] : []
  },
  len: w + 100
})
/** A tailwind with sliding mines and updraft pockets. */
const mineBand = (len: number): Segment => {
  const hazards: HazardDef[] = []
  const winds: WindDef[] = [WIND('right', 40, 300, len, 260, 200)]
  for (let i = 0; 300 + i * 350 < len - 60; i++) {
    hazards.push(MINE(0, 0, line(340 + i * 350, 270, 340 + i * 350, 590, 2.2 + 0.3 * i)))
    winds.push(UP(150 + i * 350, 300, 90, 420, 220))
  }
  winds.push(UP(len - 60, 300, 90, 420, 220))
  return { part: { winds, hazards }, len: len + 100 }
}
/** A ferry under a headwind; an updraft at the end lifts you to the next ledge. */
const ferry = (len: number): Segment => ({
  part: {
    platforms: [P(0, 0, 160, 20, { motion: line(100, 490, len - 120, 490, len / 110) })],
    winds: [WIND('left', 40, 280, len - 120, 200, 220), UP(len - 60, 330, 100, 390)]
  },
  len: len + 100
})
/** The goalkeeper's gap, then an updraft back up. */
const goalie = (speed = 150): Segment => ({
  part: {
    platforms: [P(600, 0, 40, 220), P(600, 600, 40, 120)],
    winds: [UP(40, 200, 520, 520), UP(680, 330, 100, 390)],
    hazards: [WALLDORF('deadly', 620, 410, follow(speed, { a: { x: 620, y: 280 }, b: { x: 620, y: 540 } }), 40, 120)]
  },
  len: 840
})
/** A button on a low ledge opens the wall ahead (channel c). */
const gate = (c: number, timed?: number): Segment => ({
  part: {
    platforms: [P(40, 600, 160), P(420, 0, 40, 720, { channel: c, whenOff: true })],
    winds: [UP(220, 300, 440, 420)],
    buttons: [BUTTON(100, 586, c, timed)]
  },
  len: 720
})
const merge = (...parts: Part[]): Part => {
  const out: Required<Part> = { platforms: [], winds: [], hazards: [], buttons: [], checkpoints: [] }
  for (const p of parts) {
    out.platforms.push(...(p.platforms ?? []))
    out.winds.push(...(p.winds ?? []))
    out.hazards.push(...(p.hazards ?? []))
    out.buttons.push(...(p.buttons ?? []))
    out.checkpoints.push(...(p.checkpoints ?? []))
  }
  return out
}
/** A long level: a start ledge, the segments with a ledge (and a flag, when asked) after each,
 *  and the finish after the last. `extra` adds pieces in world coordinates (a chaser…). */
const chain = (id: number, segments: Segment[], flags: number[] = [], extra: Part = {}): LevelDef => {
  const parts: Part[] = [{ platforms: [P(40, LEDGE_Y, 200)] }]
  let x = 240
  segments.forEach((s, i) => {
    parts.push(shift(x, 0, s.part))
    x += s.len
    const last = i === segments.length - 1
    parts.push({ platforms: [last ? FIN(x, LEDGE_Y + 40, 200) : P(x, LEDGE_Y, 200)], checkpoints: !last && flags.includes(i) ? [CHECKPOINT(x + 100, LEDGE_Y)] : [] })
    x += 200
  })
  parts.push({ hazards: [thornFloor(240, x - 440)] }, extra)
  return build(id, wide(x + 200), { x: 120, y: LEDGE_Y }, ...parts)
}
const W10: LevelDef[] = [
  // 91 · Spin Cycle — fan steps, a Super Stream, mines in the wind.
  chain(91, [columns(4, 170, { vent: true }), superCeil(520), mineBand(900)], [0, 1]),
  // 92 · Switchblade — gates and Thwomps.
  chain(92, [gate(1), thwompRun(3, 320), gate(2, 6)], [0, 1]),
  // 93 · Needle Storm — a deep shaft: spiked shelves, mines between them, long falls to flutter.
  build(93, tall(2800), { x: 300, y: 160 },
    { platforms: [P(200, 160, 240), P(160, 0, 40, 2800), P(1120, 0, 40, 2800), FIN(560, 2740, 200)] },
    ...[[600, 700], [1150, 300], [1700, 820], [2250, 440]].map(([y, gx]) => ({
      platforms: [P(200, y!, gx! - 200, 20), P(gx! + 120, y!, 1000 - gx!, 20)],
      hazards: [SPIKES(200, y! - 26, gx! - 200, 'up'), SPIKES(gx! + 120, y! - 26, 1000 - gx!, 'up')]
    })),
    { hazards: [MINE(0, 0, line(400, 900, 900, 900, 2.6)), MINE(0, 0, line(900, 1450, 400, 1450, 2.2)), MINE(0, 0, line(350, 2000, 950, 2000, 2.4)), MINE(640, 2500)] }),
  // 94 · Pinball — trampolines under a mine, bumpers that follow, Thwomps.
  chain(94, [tramps(true), thwompRun(2, 300, [1]), tramps(true)], [0, 1], { hazards: [WALLDORF('bounce', 1300, 200, follow(70), 50, 120)] }),
  // 95 · Clockwork — a ferry, a timed gate, sliding mines.
  chain(95, [ferry(900), gate(1, 5), mineBand(1000)], [0, 1]),
  // 96 · Headwinds — a chaser at your back through the tunnel and past the goalkeeper.
  chain(96, [tunnel(800), goalie(160), columns(3, 190, { thorns: true })], [0, 1], { hazards: [WALLDORF('deadly', 60, 160, follow(95), 50, 120)] }),
  // 97 · The Tower — climb four screens of updraft between mines and a Walldorf that strikes from the wall.
  {
    id: 97, ...tall(2880), spawn: { x: 140, y: 2780 },
    platforms: [P(60, 2780, 200), P(560, 2160, 200), P(560, 1520, 200), P(560, 920, 200), FIN(560, 320, 200)],
    winds: [UP(280, 2000, 240, 880), UP(800, 1400, 240, 800), UP(280, 800, 240, 800), UP(800, 200, 240, 800)],
    hazards: [
      MINE(0, 0, line(320, 2450, 480, 2450, 2.4)), MINE(0, 0, circle(920, 1800, 80, 3)),
      WALLDORF('deadly', 0, 0, lunge(160, 1200, 380, 1200, 2.6, { trigger: true, radius: 320 }), 120, 50),
      MINE(0, 0, line(820, 600, 1020, 600, 2)), MINE(0, 0, swing(920, 100, 300, 0.5, 2.8))
    ],
    checkpoints: [CHECKPOINT(660, 2160), CHECKPOINT(660, 1520), CHECKPOINT(660, 920)]
  },
  // 98 · Freefall Finale — four screens down past everything that falls with you.
  build(98, tall(3200), { x: 160, y: 160 },
    { platforms: [P(60, 160, 220), P(360, 300, 40, 2900), P(920, 300, 40, 2900), P(400, 760, 260), P(660, 1500, 260), P(400, 2300, 240), FIN(0, 0, 180, line(500, 3100, 760, 3100, 3.2))] },
    { winds: [UP(400, 1100, 520, 160, 200), UP(400, 1900, 520, 160, 200), WIND('right', 400, 2600, 520, 120, 160)] },
    { hazards: [SPIKES(400, 734, 120, 'up'), SPIKES(800, 1474, 120, 'up'), MINE(0, 0, line(480, 1300, 840, 1300, 2)), MINE(0, 0, line(840, 1000, 480, 1000, 2.2)), MINE(0, 0, circle(640, 2050, 120, 2.6)), MINE(0, 0, line(440, 2500, 880, 2500, 2.4)), MINE(700, 2800), MINE(500, 2950)] },
    { checkpoints: [CHECKPOINT(560, 760), CHECKPOINT(720, 1500), CHECKPOINT(520, 2300)] }),
  // 99 · The Gauntlet — columns over thorns, the tunnel, trampolines under a mine, the goalkeeper.
  chain(99, [columns(4, 180, { thorns: true }), tunnel(900), tramps(true), goalie(170)], [0, 1, 2]),
  // 100 · Eye of the Storm — the grand finale: fans, a thorn-ceilinged Super Stream, trampolines under a mine, Thwomps, the goalkeeper, a bumper on your heels; four flags.
  chain(100, [columns(3, 190, { vent: true }), superCeil(480, true), tramps(true), thwompRun(2, 300, [0]), goalie(180)],
    [0, 1, 2, 3], { hazards: [WALLDORF('bounce', 900, 160, follow(80), 50, 120)] })
]

export const KITE_LEVELS: LevelDef[] = [...W1, ...W2, ...W3, ...W4, ...W5, ...W6, ...W7, ...W8, ...W9, ...W10]
