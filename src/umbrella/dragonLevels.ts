// ─── The dragon kite's first chapter: five levels that teach the game ────────────
//
// The dragon kite skin (?art=kite, kite.ts) is the normal game in a new skin, and it opens with its own chapter,
// ahead of the campaign: "Dragon Flight", five short levels that teach one idea each and end on a small finale.
// They live in code (never in the designers' campaign file or the levels server); the editor can open and test them,
// but an edit stays in the browser (customLevels.ts).
//
//   1  First Breeze    walk, step off the ledge: the umbrella opens by itself and an updraft carries you over the gap
//   2  Open and Close  the umbrella is a button: close it to fall straight through a current that would hold you up
//   3  The Long Stream a Super Stream builds up the longer you stay in it: be patient, then let it throw you to the top
//   4  Bounce Back     a bumper Walldorf throws you back: land on it to cross what the umbrella alone cannot
//   5  Castle Run      everything together on one wide level: wind, a stepping-stone Walldorf, a mine, a checkpoint,
//                      the Super Stream up to the castle and a bounce at the very end
//
// Every level is proven beatable by the bot (tests/umbrella/dragonLevels.test.ts plays it on the real engine).
// World coordinates as in levels.ts: y grows downward, a screen is 1280 × 720.

import { CHECKPOINT, FIN, MINE, P, SCREEN, SPIKES, SUPER, UP, WALLDORF } from './levelKit'
import type { HazardDef, LevelDef, Motion } from './levels'
import type { OrderEntry } from './customLevels'

/** Ids of the chapter's levels: clear of the campaign's (1…27), of the saved-level ids (1000+, customLevels.ts) and of each other. */
export const DRAGON_ID_BASE = 2001
export const isDragonId = (id: number): boolean => id >= DRAGON_ID_BASE && id < DRAGON_ID_BASE + 5

export const DRAGON_CHAPTER = { id: 'dragon', name: 'Dragon Flight', subtitle: 'Learn to fly' }

const wide = (w: number, h = 720) => ({ world: { w, h }, view: SCREEN })
const tall = (h: number) => ({ world: { w: 1280, h }, view: SCREEN })
const line = (ax: number, ay: number, bx: number, by: number, period: number): Motion => ({ kind: 'line', a: { x: ax, y: ay }, b: { x: bx, y: by }, period })
/** A bouncy Walldorf (a trampoline) centred on (cx, cy) that throws Pweeg off at `speed` px/s. */
const BUMPER = (cx: number, cy: number, speed: number, w: number, h: number): HazardDef => ({ ...WALLDORF('bounce', cx, cy, undefined, w, h), bounce: speed })

export const DRAGON_LEVELS: LevelDef[] = [
  // 1 · First Breeze — walk right, step off the ledge: the umbrella opens by itself and the draft carries you across.
  {
    id: 2001, world: SCREEN, spawn: { x: 170, y: 400 },
    platforms: [P(60, 440, 260), FIN(900, 440, 220)],
    winds: [UP(400, 300, 360, 420)],
    lessons: [{ x: 90, y: 150, w: 280, h: 180, kind: 'move' }, { x: 470, y: 90, w: 280, h: 180, kind: 'auto' }],
    arrows: [{ x: 380, y: 380, size: 90, angle: 90 }],
    stars: [{ x: 520, y: 330 }, { x: 640, y: 250 }, { x: 780, y: 330 }]
  },
  // 2 · Open and Close — an updraft sits between you and the finish below it: shut the umbrella to fall through.
  {
    id: 2002, world: SCREEN, spawn: { x: 150, y: 160 },
    platforms: [P(60, 200, 240), P(540, 440, 150), FIN(920, 540, 220)],
    winds: [UP(420, 300, 280, 420)],
    lessons: [{ x: 100, y: 330, w: 280, h: 180, kind: 'toggle' }],
    signs: [{ x: 760, y: 280, w: 120, h: 170, kind: 'drop' }],
    stars: [{ x: 600, y: 390 }, { x: 820, y: 470 }]
  },
  // 3 · The Long Stream — the Super Stream builds up while you stay in it, then throws you up to the high ledge.
  {
    id: 2003, ...tall(1100), spawn: { x: 150, y: 1000 },
    platforms: [P(60, 1040, 240), FIN(1000, 300, 220)],
    winds: [SUPER(480, 260, 160, 820)],
    signs: [{ x: 700, y: 880, w: 120, h: 170, kind: 'float' }],
    arrows: [{ x: 560, y: 1000, size: 90, angle: 0 }],
    stars: [{ x: 560, y: 700 }, { x: 560, y: 500 }]
  },
  // 4 · Bounce Back — the bumper throws you up and across the gap the umbrella cannot cross.
  {
    id: 2004, world: SCREEN, spawn: { x: 120, y: 360 },
    platforms: [P(40, 400, 220), FIN(940, 300, 220)],
    winds: [],
    hazards: [BUMPER(560, 640, 900, 100, 160), SPIKES(300, 694, 980, 'up')],
    arrows: [{ x: 560, y: 470, size: 90, angle: 180 }],
    stars: [{ x: 560, y: 330 }]
  },
  // 5 · Castle Run — the finale: a draft, a stepping-stone Walldorf, a mine on a rope, a checkpoint, the Super Stream and a last bounce.
  {
    id: 2005, ...wide(2900), spawn: { x: 150, y: 400 },
    platforms: [P(60, 440, 220), P(1320, 540, 220), P(1790, 360, 220), FIN(2700, 300, 200)],
    winds: [UP(380, 320, 380, 400), SUPER(1590, 300, 140, 420)],
    hazards: [
      WALLDORF('solid', 1000, 520, undefined, 90, 120),
      MINE(1180, 0, line(1180, 400, 1180, 560, 3)),
      BUMPER(2330, 640, 900, 100, 140),
      SPIKES(300, 694, 2300, 'up')
    ],
    checkpoints: [CHECKPOINT(1420, 540)],
    stars: [{ x: 560, y: 300 }, { x: 1000, y: 400 }, { x: 1660, y: 330 }]
  }
]

/** The chapter as campaign order entries: saved-level snapshots under ids of their own (customLevels.ts plays them like any other slot). */
export const DRAGON_ENTRIES: OrderEntry[] = DRAGON_LEVELS.map((level, i) => ({ id: level.id, custom: `dragon-${i + 1}`, level }))
