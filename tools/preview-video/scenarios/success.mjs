/**
 * ─── SUCCESS (10 s): "one merge turns the fight" ────────────────────────────
 *
 * WHAT THE VIEWER SEES — with NO interface, so the field is the score
 *
 * A thin line of fighters is being shoved back onto the Lab Gate by a crowd
 * and a boss dragon; more monsters pour out of a portal. Down in the merge
 * grid two dark crystal golems slam together into a butterfly, and that
 * butterfly into a second one — a unit this army has never had: the grid
 * dims around it, a beam drops, rays turn, the bloom goes off. The new unit is
 * carried straight up to the front line; its chain lightning forks through the
 * crowd, a Meteor Storm lands on top, and the dragon shatters in a storm of
 * confetti. The last seconds are the army standing and one more merge below.
 *
 * WITH NO INTERFACE the stakes read from the field: monsters AT the gate, a
 * fighter falling; then the crowd thinning and the boss breaking apart.
 *
 * BEAT SHEET  (10 s @ 30 fps = 300 frames; seconds into `record`)
 *
 *   0.00  released mid-shove — the crowd is on the guard line, portal open
 *   0.25  drag: golem (slot 9) onto golem (slot 10)      → merge pop, a butterfly
 *   1.25  drag: butterfly (10) onto butterfly (slot 1)   → NEW TIER — the reveal
 *   2.35  the bloom (REVEAL_BLOOM_MS after the merge)
 *   3.50  drag: the new unit up into the arena's front    → deploy shockwave
 *   4.70  Meteor Storm
 *   5–7.5 THE PAYOFF: lightning + meteors thin the crowd, the boss shatters
 *   8.40  drag: a small merge in the grid — the last second still moves
 */

import * as g from './_drive.mjs'

// Grid slots, row by row (0-3 top row, the one against the arena).
const GOLEM_A = 9
const GOLEM_B = 10
const BUTTERFLY = 1
const SMALL_A = 4 //   T12 onto T12 (slot 11) → T13
const SMALL_B = 11
const TWIN = 6 //      the T13 already on the board

export const PLAN = {
  wave: 90,
  gate: 45,
  grid: [
    11, 18, 0, 9,
    12, 0, 13, 0,
    10, 17, 17, 12,
    0, 14, 0, 11
  ],
  // T18 is known; the merge that makes T19 is a discovery.
  maxTier: 18,
  // The line stands out in the field, not on the gate: the fight happens in the
  // middle of the frame, with the gate open behind it.
  army: [
    { tier: 16, x: 26, y: 44, hp: 0.7 },
    { tier: 13, x: 30, y: 26, hp: 0.55 },
    { tier: 14, x: 36, y: 46, hp: 0.45 },
    { tier: 15, x: 28, y: 64, hp: 0.6 },
    { tier: 14, x: 35, y: 74, hp: 0.4 }
  ],
  // The crowd fills the field from the line to the portals, so the first
  // seconds read as a horde closing on a thin line.
  foes: [
    { kind: 'boss', x: 64, y: 50, hp: 0.45 },
    { kind: 'brute', x: 42, y: 42 },
    { kind: 'brute', x: 45, y: 64 },
    { kind: 'runner', x: 40, y: 30 },
    { kind: 'runner', x: 41, y: 74 },
    { kind: 'slime', x: 54, y: 58 },
    { kind: 'slime', x: 58, y: 34 },
    { kind: 'spitter', x: 72, y: 24 },
    { kind: 'warlock', x: 76, y: 72 },
    { kind: 'slime', x: 84, y: 42 },
    { kind: 'runner', x: 88, y: 62 }
  ],
  spawns: [
    { kind: 'slime', at: 0.6, portal: 2 },
    { kind: 'runner', at: 0.9, portal: 2 },
    { kind: 'brute', at: 2.2, portal: 0 },
    { kind: 'slime', at: 2.6, portal: 0 },
    // Stragglers after the boss: the portal opens again and the new unit's
    // lightning meets them — the last seconds are a fight, not a hold. `at` is
    // ENGINE time, and the boss kill (~7.0) slows the engine to 0.22× for two
    // seconds, so these land around 7.2-8.6 of video.
    { kind: 'runner', at: 6.9, portal: 1 },
    { kind: 'slime', at: 7.1, portal: 1 },
    { kind: 'runner', at: 7.3, portal: 1 }
  ],
  ult: 100,
  skills: true
}

export default {
  id: 'success',
  label: 'One merge turns the fight',

  async setup(ctx) {
    await g.boot(ctx)
    await g.stage(ctx, PLAN)
  },

  async record(ctx) {
    const wait = g.budget(ctx)
    await g.release(ctx)
    g.trace(ctx, 500)
    ctx.beat('open')
    if (!(await wait(250))) return //                                   0.25
    await g.drag(ctx, GOLEM_A, { slot: GOLEM_B }, 700)
    if (!(await wait(1000))) return //                                  1.25
    await g.drag(ctx, GOLEM_B, { slot: BUTTERFLY }, 750)
    ctx.beat('merge')
    if (!(await wait(750))) return //                                   2.00
    await g.logState(ctx, 'reveal')
    if (!(await wait(900))) return //                                   2.90
    // The poster: past the bloom's white, the beam and rays on the new unit
    // with the fight still raging above it.
    ctx.beat('poster')
    if (!(await wait(600))) return //                                   3.50
    await g.drag(ctx, BUTTERFLY, { arena: [44, 50] }, 800)
    ctx.beat('deploy')
    if (!(await wait(1200))) return //                                  4.70
    await g.cast(ctx, 'meteor')
    ctx.beat('meteor')
    if (!(await wait(2300))) return //                                  7.00
    await g.logState(ctx, 'payoff')
    ctx.beat('payoff')
    if (!(await wait(1400))) return //                                  8.40
    await g.drag(ctx, SMALL_A, { slot: SMALL_B }, 650)
    if (!(await wait(800))) return //                                   9.20
    // …and the unit it made straight onto its twin: the last second moves.
    await g.drag(ctx, SMALL_B, { slot: TWIN }, 600)
    if (!(await wait(700))) return //                                   9.90
    await g.logState(ctx, 'end')
    await wait(100)
  }
}
