/**
 * ─── FAIL-30 (30 s): "the win that got away" ────────────────────────────────
 *
 * WHAT THE VIEWER SEES — with NO interface, so the field is the score
 *
 * For fifteen seconds this run is a victory lap: the line mows a steady crowd
 * down in the middle of the field, the grid keeps it fed (merges, a unit fed
 * onto its twin in the line), a Meteor Storm flattens a whole pack, a
 * war-cry flares red through the army. The whole time two identical
 * butterflies sit side by side in the grid's bottom row. Then the portals
 * bring the boss wave — and the player keeps making small moves: a small
 * merge, a fresh little unit thrown in that lasts a second. The line breaks.
 * The butterflies finally slam together, the new-tier bloom goes off in the
 * grid — and in the same beat a monster reaches the gate and the arena drowns
 * red. Skip; the field clears; the retry's first move is the unit that would
 * have won it, carried up onto an empty field.
 *
 * BEAT SHEET  (30 s @ 30 fps = 900 frames; seconds into `record`)
 *
 *   0-12   AHEAD: the crowd falls; merge (1.0), field merge (3.8)
 *   6.5    Meteor Storm on a full pack                    → a mass shatter
 *   8.0    Warcry; 9.0 and 13.0 merges
 *   ~14.5  the boss wave out of the portals
 *   17.3   drag: a small merge                            — the wrong priorities
 *   18.8   drag: a T12 into the arena                     → THE MISTAKE
 *   19-23  the line breaks
 *   22.0   drag: butterfly onto butterfly                 → the bloom, ~23.0…
 *   ~23.2  …the gate breaks: OVERRUN, red wash, slow-motion
 *   25.0   Skip (no revive)                               → the field resets ~25.9
 *   26.2   drag: the new unit onto the cleared field     → the retry starts
 *   28.2   a small merge; the next wave's countdown runs out as the clip ends
 */

import * as g from './_drive.mjs'

// Grid slots, row by row (0-3 top row, against the arena).
const SMALL_A = 4 //     T11 onto T11 → T12 at 5
const SMALL_B = 5
const FEED13 = 7 //      T13 — fed onto the T13 fighter → T14 (a T15 fed there
//                       would outlast the boss wave by seconds)
const NEXT = 3 //        T12 — the T12 at 5 goes onto it → T13
const NINE_A = 0 //      T9 onto T9 → T10
const NINE_B = 6
const TINY_A = 2 //      T10 onto T10 → T11 (while the boss wave bears down)
const TINY_B = 11
const THROWN = 8 //      T12 — thrown into the arena: the mistake
const BUTTERFLY_A = 13
const BUTTERFLY_B = 14
const LAST = 15 //       T11 — the retry's first merge, with TINY_B

export const PLAN = {
  wave: 90,
  // One hit from breaking; its cracks show throughout. The line is what holds.
  gate: 4,
  grid: [
    9, 0, 10, 12,
    11, 11, 9, 13,
    12, 0, 14, 10,
    0, 18, 18, 11
  ],
  maxTier: 18,
  army: [
    { tier: 14, x: 36, y: 30, hp: 0.6 },
    { tier: 15, x: 39, y: 48, hp: 0.3 },
    { tier: 13, x: 35, y: 66, hp: 0.5 },
    { tier: 14, x: 45, y: 40, hp: 0.7 },
    { tier: 13, x: 44, y: 60, hp: 0.6 }
  ],
  // A soft, steady crowd: lots of kills, barely a scratch on the line.
  foes: [
    { kind: 'slime', x: 52, y: 36, hp: 0.3, atk: 0.1 },
    { kind: 'slime', x: 55, y: 58, hp: 0.3, atk: 0.1 },
    { kind: 'runner', x: 50, y: 70, hp: 0.3, atk: 0.1 },
    { kind: 'spitter', x: 66, y: 28, hp: 0.3, atk: 0.1 }
  ],
  spawns: [
    { kind: 'slime', at: 1.5, portal: 2, hp: 0.3, atk: 0.1 },
    { kind: 'runner', at: 2.0, portal: 0, hp: 0.3, atk: 0.1 },
    // The pack the Meteor lands on.
    { kind: 'slime', at: 3.4, portal: 1, hp: 0.5, atk: 0.1 },
    { kind: 'slime', at: 3.7, portal: 1, hp: 0.5, atk: 0.1 },
    { kind: 'brute', at: 4.0, portal: 0, hp: 0.4, atk: 0.1 },
    { kind: 'runner', at: 4.2, portal: 2, hp: 0.5, atk: 0.1 },
    { kind: 'slime', at: 4.5, portal: 2, hp: 0.5, atk: 0.1 },
    { kind: 'warlock', at: 4.8, portal: 0, hp: 0.5, atk: 0.1 },
    // More soft crowd through the Warcry.
    { kind: 'runner', at: 8.5, portal: 2, hp: 0.3, atk: 0.1 },
    { kind: 'slime', at: 9.0, portal: 0, hp: 0.3, atk: 0.1 },
    { kind: 'slime', at: 10.5, portal: 1, hp: 0.3, atk: 0.1 },
    { kind: 'runner', at: 11.0, portal: 2, hp: 0.3, atk: 0.1 },
    // The boss wave. Nothing this line can hold.
    { kind: 'boss', at: 14.5, portal: 1, hp: 1, atk: 5 },
    { kind: 'brute', at: 14.8, portal: 0, hp: 1.5, atk: 5 },
    { kind: 'brute', at: 15.1, portal: 2, hp: 1.5, atk: 5 },
    { kind: 'runner', at: 16.0, portal: 0, atk: 3 },
    { kind: 'runner', at: 16.3, portal: 2, atk: 3 },
    { kind: 'brute', at: 17.0, portal: 1, hp: 1.5, atk: 5 },
    { kind: 'runner', at: 18.0, portal: 0, atk: 3 },
    { kind: 'runner', at: 18.4, portal: 2, atk: 3 }
  ],
  ult: 100,
  skills: true
}

export default {
  id: 'fail-30s',
  label: 'The win that got away',

  async setup(ctx) {
    await g.boot(ctx)
    await g.stage(ctx, PLAN)
  },

  async record(ctx) {
    const wait = g.budget(ctx)
    await g.release(ctx)
    g.trace(ctx, 1000)
    ctx.beat('open')
    if (!(await wait(1000))) return //                                  1.0
    await g.drag(ctx, SMALL_A, { slot: SMALL_B }, 650)
    if (!(await wait(2800))) return //                                  3.8
    await g.dragOnto(ctx, FEED13, 13, 750)
    if (!(await wait(2700))) return //                                  6.5
    await g.cast(ctx, 'meteor')
    ctx.beat('meteor')
    if (!(await wait(1500))) return //                                  8.0
    // Early enough that its red edge glow (8 s) is gone before the boss wave:
    // the only red the ending may show is the overrun's.
    await g.cast(ctx, 'warcry')
    if (!(await wait(1000))) return //                                  9.0
    await g.drag(ctx, SMALL_B, { slot: NEXT }, 650)
    if (!(await wait(4000))) return //                                  13.0
    await g.drag(ctx, NINE_A, { slot: NINE_B }, 650)
    if (!(await wait(4300))) return //                                  17.3
    await g.logState(ctx, 'boss wave')
    await g.drag(ctx, TINY_A, { slot: TINY_B }, 650)
    if (!(await wait(1500))) return //                                  18.8
    await g.drag(ctx, THROWN, { arena: [48, 52] }, 750)
    ctx.beat('mistake')
    if (!(await wait(3200))) return //                                  22.0
    await g.logState(ctx, 'too late')
    await g.drag(ctx, BUTTERFLY_A, { slot: BUTTERFLY_B }, 700)
    ctx.beat('merge')
    if (!(await wait(1300))) return //                                  23.3
    await g.logState(ctx, 'verdict')
    if (!(await wait(800))) return //                                   24.1
    // The poster: the arena drowned red, the answer glowing in the grid.
    ctx.beat('poster')
    if (!(await wait(900))) return //                                   25.0
    await g.skipRally(ctx)
    if (!(await wait(1200))) return //                                  26.2
    await g.drag(ctx, BUTTERFLY_B, { arena: [36, 50] }, 700)
    ctx.beat('retry')
    if (!(await wait(2000))) return //                                  28.2
    await g.drag(ctx, TINY_B, { slot: LAST }, 650)
    if (!(await wait(1600))) return //                                  29.8
    await g.logState(ctx, 'end')
    await wait(200)
  }
}
