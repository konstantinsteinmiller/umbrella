/**
 * ─── SUCCESS (CrazyGames, 16 s): the boss at the line, killed with the last volley ─
 *
 * WHAT THE VIEWER SEES
 *   A full board — walkers with HP plates, the Silver Dragon boss coiled in the
 *   middle — and a finger already aiming. Two volleys bounce through the walkers
 *   while the dragon walks down. The third cracks it: it ENRAGES and lunges two
 *   rows, its bottom edge one row off the red line, the warning pips and the
 *   red floor up. A slow, deliberate aim — and the fourth volley kills it with
 *   one row to spare: the death blast wipes the bottom rows and the board empties.
 *   Then straight back in: the next row arrives and the next shot flies.
 *
 * WITH NO INTERFACE
 *   No HP bar, no banner. The stakes read from the board: the dragon's size and
 *   its HP plate, how close it stands to the red line (the floor glows, the
 *   pips count down), and the board emptying when it dies.
 *
 * BEAT SHEET  (16 s @ 30 fps = 480 frames)
 *   0.0–1.0   the aim already up on a full board; the finger settles, fires
 *   1.0–~7    the opener and volley 1 — walkers drop, the dragon walks down
 *   ~7–~10    volley 2 — the dragon enrages and charges to the line
 *   ~10–~12   the tension: a slow aim at the dragon a row from the line
 *   ~12–~14   THE PAYOFF: the kill, the blast, the board clears
 *   ~14–16    back in: the next shot — motion to the last frame
 *
 * Staging (_drive.mjs `stageBossFight`): the next row is made the boss row,
 * five weak turns walk it down, and the four volleys (one tray, four angles)
 * are searched on engine clones so the recorded run plays exactly that plan.
 */

import * as g from './_drive.mjs'

/** @type {any} */
let plan = null

export default {
  id: 'success',
  label: 'The enraged boss one row from the line, killed by the last volley',

  async setup(ctx) {
    await g.boot(ctx)
    plan = await g.stageBossFight(ctx, 'success', { primeTurns: 5 })
    // Frame 0: the finger is already down and the aim preview is drawn.
    await ctx.evaluate((a) => { window.__vid.down(Math.PI / 2); window.__vid.aim(a, 1) }, (Math.PI / 2 + plan.aO) / 2)
    await ctx.wait(600)
    await g.pinAmbientAnimations(ctx)
    await g.logState(ctx, 'staged')
  },

  async record(ctx) {
    const atAim = (ms = 7000) => ctx.stepUntil(() => window.__vid.eng().state.phase === 'aim' && !window.__vid.b().holdSim.value, { timeoutMs: ms, label: 'aim' })
    ctx.beat('open')

    // — volley 1: the finger finishes its sweep and fires —
    const from = (Math.PI / 2 + plan.aO) / 2
    for (let i = 1; i <= 12; i++) {
      await ctx.evaluate(([a, b, k]) => window.__vid.aim(a + (b - a) * k, 1), [from, plan.aO, i / 12])
      await ctx.wait(1000 / ctx.fps)
    }
    await ctx.wait(150)
    await ctx.evaluate((a) => window.__vid.release(a), plan.aO)
    ctx.beat('opener')
    await atAim()
    await g.logState(ctx, 'after the opener')

    await ctx.wait(200)
    await g.shoot(ctx, plan.a0, { aimMs: 550, holdMs: 150 })
    ctx.beat('volley1')
    await atAim()
    await g.logState(ctx, 'after volley 1')

    // — volley 2: the dragon enrages and charges —
    await ctx.wait(250)
    await g.shoot(ctx, plan.a1, { aimMs: 650, holdMs: 200 })
    ctx.beat('volley2')
    await atAim()
    await g.logState(ctx, 'after volley 2 (enraged, at the line)')

    // — the tension: a slow, deliberate aim —
    await ctx.wait(400)
    ctx.beat('tension')
    await g.shoot(ctx, plan.a2, { aimMs: 1100, holdMs: 450 })
    ctx.beat('volley3')
    await ctx.stepUntil(() => !window.__vid.bossOf(window.__vid.eng().state), { timeoutMs: 4000, label: 'boss dead' })
    ctx.beat('payoff')
    await g.logState(ctx, 'boss dead')
    await ctx.wait(450)
    ctx.beat('poster')
    await atAim(8000)
    await g.logState(ctx, 'after the kill')

    // — back in: keep shooting until the clip ends —
    while (ctx.frame() < (ctx.durationMs / 1000) * ctx.fps - 5) {
      await ctx.wait(300)
      const a = await ctx.evaluate(() => window.__vid.bestShot())
      await g.shoot(ctx, a, { aimMs: 500, holdMs: 150 })
      await atAim(6000)
      await g.logState(ctx, 'next shot')
    }
  }
}
