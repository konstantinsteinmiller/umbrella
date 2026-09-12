/**
 * ─── FAIL (10 s): "one merge too late" ──────────────────────────────────────
 *
 * WHAT THE VIEWER SEES — with NO interface, so the field is the score
 *
 * A healthy line is mowing a crowd down in the middle of the field — this run
 * is going well. Down in the grid two identical butterflies sit side by side,
 * the obvious merge, and the player busies themselves with small pairs
 * instead, then throws a fresh little unit into the fight. The boss wave pours
 * out of the portal and walks straight through the line; monsters reach the
 * gate and hammer it. Only then do the two butterflies slam together — the
 * new-tier bloom goes off in the grid in the same beat that the gate breaks
 * and the arena drowns red. The field clears, and the retry's first move is
 * the unit that would have won it, carried up onto an empty field.
 *
 * WITH NO INTERFACE the stakes read from the field: kills → a line breaking →
 * monsters at the gate → the red wash. The cause is on screen from frame 0:
 * the unmerged pair, bottom row, never touched until it is too late.
 *
 * BEAT SHEET  (10 s @ 30 fps = 300 frames; seconds into `record`)
 *
 *   0.00  released: the line is winning, shatters everywhere
 *   0.40  drag: small pair (T11 + T11)                   → a pop, not the big one
 *   1.20  the portals open: more runners, another brute
 *   1.90  drag: another small pair (T10 + T10)
 *   2.70  drag: the T12 into the arena                   → THE MISTAKE, it won't last
 *   3-6   the boss wave breaks the line; the last fighter falls
 *   4.90  drag: butterfly onto butterfly                 → the bloom, ~5.9…
 *   ~6.3  …a runner reaches the gate: OVERRUN, red wash, slow-motion
 *   7.50  Skip (no revive)                               → the field resets ~8.3
 *   8.50  drag: the new unit onto the cleared field     → the retry starts
 */

import * as g from './_drive.mjs'

// Grid slots, row by row (0-3 top row, against the arena).
const SMALL_A = 5 //    T11 onto T11 → T12
const SMALL_B = 6
const TINY_A = 3 //     T10 onto T10 → T11
const TINY_B = 7
const BUTTERFLY_A = 13
const BUTTERFLY_B = 14

export const PLAN = {
  wave: 90,
  // One hit from breaking — its cracks show from the first frame. The break
  // has to land by ~6.4 s: an overrun holds the field for ~3 s before the
  // reset, and the retry must fit in the clip.
  gate: 4,
  grid: [
    9, 0, 0, 10,
    0, 11, 11, 10,
    13, 0, 8, 0,
    0, 18, 18, 0
  ],
  maxTier: 18,
  // Ahead: a full line in the middle of the field, winning. (Its HP is lower
  // than it looks — a clean feed shows no bars, and the boss wave has to break
  // it inside four seconds.) No T12 on it, so the T12 the player throws in is a
  // fresh unit — not a field merge that heals.
  army: [
    { tier: 14, x: 36, y: 30, hp: 0.45 },
    { tier: 15, x: 39, y: 48, hp: 0.08 },
    { tier: 13, x: 35, y: 66, hp: 0.3 },
    { tier: 14, x: 45, y: 40, hp: 0.5 },
    { tier: 13, x: 44, y: 60, hp: 0.4 }
  ],
  // …mowing a soft crowd (it barely scratches the line), while the boss wave
  // is already stepping in at the right edge — the killer is on screen from
  // the first frame.
  foes: [
    { kind: 'slime', x: 52, y: 36, hp: 0.15, atk: 0.1 },
    { kind: 'slime', x: 54, y: 58, hp: 0.15, atk: 0.1 },
    { kind: 'runner', x: 50, y: 70, hp: 0.2, atk: 0.1 },
    { kind: 'runner', x: 58, y: 26, hp: 0.2, atk: 0.1 },
    { kind: 'slime', x: 62, y: 48, hp: 0.15, atk: 0.1 },
    { kind: 'spitter', x: 68, y: 66, hp: 0.2, atk: 0.1 },
    { kind: 'boss', x: 82, y: 50, hp: 1, atk: 5 },
    { kind: 'brute', x: 78, y: 34, hp: 1.5, atk: 5 },
    { kind: 'brute', x: 80, y: 68, hp: 1.5, atk: 5 }
  ],
  // …and more of it out of the portals. Nothing this line can hold.
  spawns: [
    { kind: 'runner', at: 1.2, portal: 0, atk: 3 },
    { kind: 'runner', at: 1.5, portal: 2, atk: 3 },
    { kind: 'brute', at: 2.2, portal: 0, hp: 1.5, atk: 5 },
    { kind: 'runner', at: 2.8, portal: 2, atk: 3 },
    { kind: 'runner', at: 3.1, portal: 0, atk: 3 }
  ]
}

export default {
  id: 'fail',
  label: 'One merge too late',

  async setup(ctx) {
    await g.boot(ctx)
    await g.stage(ctx, PLAN)
  },

  async record(ctx) {
    const wait = g.budget(ctx)
    await g.release(ctx)
    g.trace(ctx, 500)
    ctx.beat('open')
    if (!(await wait(400))) return //                                   0.40
    await g.drag(ctx, SMALL_A, { slot: SMALL_B }, 650)
    if (!(await wait(1500))) return //                                  1.90
    await g.drag(ctx, TINY_A, { slot: TINY_B }, 650)
    if (!(await wait(800))) return //                                   2.70
    // The T12 goes in ahead of the line, where the boss wave meets it first.
    await g.drag(ctx, SMALL_B, { arena: [48, 52] }, 750)
    ctx.beat('mistake')
    if (!(await wait(2200))) return //                                  4.90
    await g.logState(ctx, 'too late')
    await g.drag(ctx, BUTTERFLY_A, { slot: BUTTERFLY_B }, 700)
    ctx.beat('merge')
    if (!(await wait(1200))) return //                                  6.10
    await g.logState(ctx, 'verdict')
    if (!(await wait(1000))) return //                                  7.10
    // The poster is the whole story in one frame: the arena drowned red, the
    // unit that would have won it glowing in the grid below.
    ctx.beat('poster')
    if (!(await wait(400))) return //                                   7.50
    // A beat of the red screen, then Skip — no revive, straight to the retry.
    await g.skipRally(ctx)
    if (!(await wait(1000))) return //                                  8.50
    // The retry's first move: the unit that would have won it, onto the field
    // the reset has just cleared.
    await g.drag(ctx, BUTTERFLY_B, { arena: [36, 50] }, 650)
    ctx.beat('retry')
    if (!(await wait(1400))) return //                                  9.90
    await g.logState(ctx, 'end')
    await wait(100)
  }
}
