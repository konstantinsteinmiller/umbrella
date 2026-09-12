/**
 * ─── SUCCESS-30 (30 s): "the whole fight, and the merge that turned it" ─────
 *
 * WHAT THE VIEWER SEES — with NO interface, so the field is the score
 *
 * A line of fighters holds the middle of the field against a steady crowd;
 * the grid below feeds it — a merge, a unit fed onto its twin at the front.
 * Then the portals bring the boss wave: a dragon and its brutes lean on the
 * line, a fighter falls, a war-cry flares red through the army, three
 * spectral warriors rise to plug the gap — and the line keeps giving ground.
 * In the grid the player builds: two golems into a butterfly, that butterfly
 * into its twin — a unit the army has never had, and the grid dims around it
 * for the reveal. It goes straight to the front; lightning forks through the
 * crowd, a Meteor Storm lands, and the dragon breaks apart. The last
 * stragglers are cut down, a chest drops a new unit into the grid, and the
 * next wave's portal is already opening as the clip ends.
 *
 * BEAT SHEET  (30 s @ 30 fps = 900 frames; seconds into `record`)
 *
 *   0-4    in motion: the line trades with a crowd; a small merge (0.6)
 *   3.0    field merge: a T14 onto the T14 at the front   → mergeburst, T15
 *   4-12   the boss wave (portals from ~4.5): the line gives ground
 *   8.5    Warcry of the Legion
 *   11.5   Legion Call — spectral warriors rise
 *   13.0   drag: golem onto golem                          → a butterfly
 *   15.0   drag: butterfly onto butterfly                  → NEW TIER, the reveal
 *   18.0   drag: the new unit to the front                 → deploy
 *   19.2   Meteor Storm
 *   18-24  THE PAYOFF: the crowd thins, the dragon shatters (~22)
 *   24-27  stragglers cut down, the wave clears, a chest drops a unit
 *   26.5   a last merge, and at 27.9 its unit fed onto its twin on the field
 *   ~29.6  the next wave's portal opens
 */

import * as g from './_drive.mjs'

// Grid slots, row by row (0-3 top row, against the arena).
const FEED = 8 //         T14 — fed onto the T14 fighter at the front
const PAIR_A = 5 //       T13 onto T13 → T14 (the opening merge)
const PAIR_B = 6
const GOLEM_A = 9 //      T17 onto T17 → T18
const GOLEM_B = 10
const BUTTERFLY = 1 //    T18 — the twin
const LAST_A = 4 //       T12 onto T12 at the end
const LAST_B = 11

export const PLAN = {
  wave: 90,
  gate: 70,
  grid: [
    11, 18, 0, 9,
    12, 13, 13, 0,
    14, 17, 17, 12,
    0, 10, 0, 11
  ],
  maxTier: 18,
  army: [
    { tier: 16, x: 28, y: 44, hp: 0.7 },
    { tier: 13, x: 32, y: 26, hp: 0.7 },
    { tier: 14, x: 40, y: 48, hp: 0.8 }, //  the front — fed at 3.0 s
    { tier: 15, x: 30, y: 64, hp: 0.6 },
    { tier: 14, x: 38, y: 74, hp: 0.7 }
  ],
  // The opening crowd: a fair fight the line is winning, slowly.
  foes: [
    { kind: 'slime', x: 50, y: 40, hp: 0.35, atk: 0.35 },
    { kind: 'slime', x: 54, y: 60, hp: 0.35, atk: 0.35 },
    { kind: 'runner', x: 48, y: 28, hp: 0.35, atk: 0.35 },
    { kind: 'runner', x: 52, y: 74, hp: 0.35, atk: 0.35 },
    { kind: 'spitter', x: 66, y: 30, hp: 0.4, atk: 0.35 },
    { kind: 'slime', x: 70, y: 56, hp: 0.35, atk: 0.35 }
  ],
  spawns: [
    // More of the crowd, keeping the field busy.
    { kind: 'slime', at: 1.6, portal: 2, hp: 0.35, atk: 0.35 },
    { kind: 'runner', at: 2.2, portal: 0, hp: 0.35, atk: 0.35 },
    // The boss wave: enough bite to take the line apart over ~10 s, enough
    // HP that only the new unit and the Meteor can finish the dragon.
    { kind: 'boss', at: 4.5, portal: 1, hp: 1.1, atk: 2.5 },
    { kind: 'brute', at: 5.0, portal: 0, hp: 1.5, atk: 3 },
    { kind: 'brute', at: 5.4, portal: 2, hp: 1.5, atk: 3 },
    { kind: 'runner', at: 6.5, portal: 0, atk: 2 },
    { kind: 'runner', at: 6.8, portal: 2, atk: 2 },
    { kind: 'warlock', at: 8.0, portal: 1, hp: 1.5 },
    { kind: 'slime', at: 9.5, portal: 0, hp: 1.5, atk: 2 },
    { kind: 'brute', at: 10.5, portal: 2, hp: 1.5, atk: 3 },
    { kind: 'runner', at: 12.0, portal: 0, atk: 2 },
    { kind: 'slime', at: 13.5, portal: 2, hp: 1.5, atk: 2 },
    // Stragglers after the boss (see success.mjs on engine time vs video).
    { kind: 'runner', at: 22.0, portal: 1 },
    { kind: 'slime', at: 22.3, portal: 1 },
    { kind: 'runner', at: 22.6, portal: 1 }
  ],
  ult: 100,
  skills: true
}

export default {
  id: 'success-30s',
  label: 'The whole fight, and the merge that turned it',

  async setup(ctx) {
    await g.boot(ctx)
    await g.stage(ctx, PLAN)
  },

  async record(ctx) {
    const wait = g.budget(ctx)
    await g.release(ctx)
    g.trace(ctx, 1000)
    ctx.beat('open')
    if (!(await wait(600))) return //                                   0.6
    await g.drag(ctx, PAIR_A, { slot: PAIR_B }, 650)
    if (!(await wait(2400))) return //                                  3.0
    await g.dragOnto(ctx, FEED, 14, 750)
    if (!(await wait(5500))) return //                                  8.5
    await g.logState(ctx, 'boss wave')
    await g.cast(ctx, 'warcry')
    if (!(await wait(3000))) return //                                  11.5
    await g.cast(ctx, 'legion')
    if (!(await wait(1500))) return //                                  13.0
    await g.drag(ctx, GOLEM_A, { slot: GOLEM_B }, 700)
    if (!(await wait(2000))) return //                                  15.0
    await g.drag(ctx, GOLEM_B, { slot: BUTTERFLY }, 750)
    ctx.beat('merge')
    if (!(await wait(1700))) return //                                  16.7
    await g.logState(ctx, 'reveal')
    ctx.beat('poster')
    if (!(await wait(1300))) return //                                  18.0
    await g.drag(ctx, BUTTERFLY, { arena: [44, 50] }, 800)
    ctx.beat('deploy')
    if (!(await wait(1200))) return //                                  19.2
    await g.cast(ctx, 'meteor')
    if (!(await wait(3300))) return //                                  22.5
    await g.logState(ctx, 'payoff')
    ctx.beat('payoff')
    if (!(await wait(4000))) return //                                  26.5
    await g.logState(ctx, 'cleared')
    await g.drag(ctx, LAST_A, { slot: LAST_B }, 650)
    if (!(await wait(1400))) return //                                  27.9
    // …and that T13 straight onto the T13 still standing: the game's two verbs,
    // merge and feed, back to back as the next wave's portal opens. (If the
    // T13 fell in this take's fight, it reinforces the line instead.)
    await g.dragOnto(ctx, LAST_B, 13, 750, [40, 62])
    if (!(await wait(1900))) return //                                  29.8
    await g.logState(ctx, 'end')
    await wait(200)
  }
}
