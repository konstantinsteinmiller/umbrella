/**
 * ─── FAIL (CrazyGames, 16 s): the boss at a sliver — and it breaks through ──────
 *
 * WHAT THE VIEWER SEES
 *   A full board and the Silver Dragon a few rows from the line. The first two
 *   volleys go great — a dozen walkers drop, the dragon takes a beating; this
 *   looks won. The third volley hammers the dragon down to a sliver of HP… and
 *   it survives, enrages, and lunges over the red line with the walkers beside
 *   it. The unit is torn apart, the screen drains to grey. Straight into the
 *   retry: the run restarts at the checkpoint and the first shot of the next
 *   attempt is already flying.
 *
 * WITH NO INTERFACE
 *   No "WASTED" (its band is hidden; the colour drain stays), no retry button.
 *   The loss reads from the board: the dragon's HP plate ticking down to a tiny
 *   number, the lunge over the line, the unit's death, the fresh board.
 *
 * BEAT SHEET  (16 s @ 30 fps = 480 frames)
 *   0.0–1.0   the aim already up on a full board; fires
 *   1.0–~10   the opener and two more volleys — walkers fall, the dragon
 *             and the walker row beside it reach the line
 *   ~10–~12   THE MISTAKE: the last volley hammers the dragon down to a
 *             two-digit HP plate — and it charges
 *   ~12–~14   the breach — the unit torn apart, the drain
 *   ~14–16    the retry from the checkpoint and its first shot
 *
 * Staging: as success.mjs, with six priming turns so a walker row stands one
 * march from the line; `plan('fail')` finds the volley that leaves the boss the
 * smallest sliver while the line still breaks.
 */

import * as g from './_drive.mjs'

/** @type {any} */
let plan = null

export default {
  id: 'fail',
  label: 'The boss left at a sliver breaks the line — then the retry',

  async setup(ctx) {
    await g.boot(ctx)
    plan = await g.stageBossFight(ctx, 'fail', { primeTurns: 6 })
    await ctx.evaluate((a) => { window.__vid.down(Math.PI / 2); window.__vid.aim(a, 1) }, (Math.PI / 2 + plan.aO) / 2)
    await ctx.wait(600)
    await g.pinAmbientAnimations(ctx)
    await g.logState(ctx, 'staged')
  },

  async record(ctx) {
    const atAim = (ms = 7000) => ctx.stepUntil(() => window.__vid.eng().state.phase === 'aim' && !window.__vid.b().holdSim.value, { timeoutMs: ms, label: 'aim' })
    ctx.beat('open')

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

    await ctx.wait(250)
    await g.shoot(ctx, plan.a1, { aimMs: 650, holdMs: 200 })
    ctx.beat('volley2')
    await atAim()
    await g.logState(ctx, 'after volley 2 (looks won)')

    // — the mistake —
    await ctx.wait(350)
    await g.shoot(ctx, plan.a2, { aimMs: 800, holdMs: 300 })
    ctx.beat('mistake')
    await ctx.stepUntil(() => window.__vid.b().deathScene.value, { timeoutMs: 6000, label: 'death scene' })
    ctx.beat('breach')
    await g.logState(ctx, 'breach')
    await ctx.wait(400)
    ctx.beat('poster')
    // The death sequence (1.2 s), then a beat on the drained board.
    await ctx.stepUntil(() => !window.__vid.b().deathScene.value, { timeoutMs: 4000, label: 'death over' })
    await ctx.wait(350)

    // — the retry —
    await ctx.evaluate(() => window.__vid.restart())
    ctx.beat('retry')
    await atAim(4000)
    await g.logState(ctx, 'retry')
    while (ctx.frame() < (ctx.durationMs / 1000) * ctx.fps - 5) {
      await ctx.wait(300)
      const a = await ctx.evaluate(() => window.__vid.bestShot())
      await g.shoot(ctx, a, { aimMs: 500, holdMs: 150 })
      await atAim(6000)
      await g.logState(ctx, 'next shot')
    }
  }
}
