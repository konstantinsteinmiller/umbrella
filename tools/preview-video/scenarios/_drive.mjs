/**
 * ─── Driving Elemental Barrage ─────────────────────────────────────────────────
 *
 * Everything game-specific the scenarios share, so each scenario reads as a
 * beat sheet. The game side is `window.__video` (src/dev/videoSeam.ts, DEV
 * only):
 *
 *   stage(plan)          the fight and the merge grid at an exact state, frozen
 *   freeze(on)           hold / release the battle simulation
 *   drag(from, to, ms)   a scripted drag from a grid slot — real pointer events
 *                        through MergeGrid, so merges, deploys, field merges and
 *                        the new-tier reveal are the game's own
 *   cast(skill)          'meteor' | 'warcry' | 'legion' | … via the arena's handlers
 *   skipRally()          the OVERRUN screen's Skip, so the retry comes sooner
 *   state()              { wave, phase, gate, army, foes, boss, grid, reveal }
 *
 * Arena coordinates are percent of the arena box: x 0 → 100 is the Lab Gate
 * (x≈13, fighters hold at x≈16) → the enemy portals (x=92, y = 16 / 50 / 84).
 * Grid slots are 0-15, row by row, four to a row.
 *
 * Files starting with `_` are helpers and are never loaded as scenarios.
 */

/** The save blob a scenario boots into. Every "have you seen this" flag is set:
 *  the tutorial, the first-boss Meteor coaching, every spell's explanation
 *  toast (they stop after five casts), and no `battle_last_seen`, so no
 *  offline-earnings modal. Automation (the merge imp) stays at 0: nothing on
 *  the grid may move unless a scenario moves it. The army and grid are empty —
 *  `stage()` places both. */
export const saveFixture = (over = {}) => ({
  prism_tutorial_step: 4,
  battle_best_wave: 40,
  battle_wave: 30,
  battle_first_boss_coached: true,
  battle_mutation_ceiling: 9999,
  battle_spell_casts: {
    meteor: 9, heal: 9, reviveGuard: 9, defender: 9,
    warcry: 9, legionCall: 9, executionerMark: 9, soulPact: 9
  },
  battle_upgrades: { attack: 30, vitality: 30, bounty: 10, automation: 0, recruit: 8 },
  // Under REWARD_COIN_COST (1000): an overrun's RALLY offer holds the red
  // screen for 5 s when the player can pay for it, and a clean feed hides the
  // button that would end the hold — so the offer must never come up.
  epic_coins: 500,
  // A veteran has killed bosses before: the kill is the ordinary 0.9 s
  // slow-motion, not the first-ever kill's 2 s at 0.22× — a fifth of a 10 s clip.
  prism_stats: { bossKills: 17 },
  battle_army: [],
  prism_grid: [],
  prism_max_tier: 12,
  ...over
})

const STATE_KEY = 'elemental-barrage_state'

/** Written into the page BEFORE any script runs, so the game boots into it. */
const seedSaveScript = (save) => `
  try {
    localStorage.clear()
    localStorage.setItem(${JSON.stringify(STATE_KEY)}, ${JSON.stringify(JSON.stringify(save))})
  } catch (e) {}
`

/** Real time: until every <img> on the page has decoded — the painted units,
 *  boss and gate are bitmaps, and one still loading on frame 0 is a hole. */
const imagesSettled = async (ctx) => {
  await ctx.waitFor(() => [...document.images].every((i) => i.complete), undefined, { timeout: 20_000 })
  await ctx.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))))
  await ctx.evaluate(() => document.fonts.ready.then(() => true))
}

/**
 * Boot to the game scene with the fixture save. Reuses the runner's URL — the
 * port and every URL param, `clean=1` included — and bounces through
 * about:blank so the init scripts run on a real navigation.
 */
export const boot = async (ctx, { save = saveFixture() } = {}) => {
  const url = ctx.page.url()
  await ctx.page.addInitScript(seedSaveScript(save))
  await ctx.page.goto('about:blank')
  await ctx.page.goto(url, { waitUntil: 'domcontentloaded' })
  await ctx.waitFor(() => !!window.__video && window.__video.ready(), undefined, { timeout: 60_000 })
  // Assert the boot, don't hope for it: a tutorial or a modal on frame 0 is a
  // clip of the wrong thing that every log line would call a success.
  const blockers = await ctx.evaluate(() => [
    ...document.querySelectorAll('[role="dialog"], .modal, .tutorial-overlay, .welcome-back')
  ].filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.className || el.tagName))
  if (blockers.length) throw new Error(`boot: something is covering the scene: ${blockers.join(' | ')}`)
}

/**
 * Put the page's seeded Math.random back at a known point. The recorder seeds
 * it at document start, but the REAL-time boot and setup consume it for as
 * many frames as they happen to run — so staging and the release each start
 * from a fixed point instead, and two takes are the same fight. (No-op with
 * `--seed off`.)
 */
const reseed = (ctx, salt) =>
  ctx.evaluate(([base, s]) => window.__vseed?.reseed(base + s), [Number(ctx.config.seedRandom ?? 7), salt])

/**
 * Give every looping CSS animation (the idle bob and march of each unit, the
 * portal's spin) a fixed phase by document order, and pause it there. Their
 * phase is otherwise however much real time setup took, so two takes of the
 * same fight differed in every frame by a few pixels of bob. The recorder's
 * clock adopts a paused animation's currentTime as it arms and drives it from
 * there, so the phases hold exactly. Finite animations are left alone.
 */
const pinAmbientAnimations = (ctx) => ctx.evaluate(() => {
  let i = 0
  for (const a of document.getAnimations()) {
    const timing = a.effect?.getTiming?.()
    if (!timing || timing.iterations !== Infinity) continue
    const period = typeof timing.duration === 'number' && timing.duration > 0 ? timing.duration : 1000
    a.currentTime = ((i++ * 211) % 997) / 997 * period + (Number(timing.delay) || 0)
    a.pause()
  }
  return i
})

/** Stage the fight and grid (frozen), then let the art settle — REAL time. */
export const stage = async (ctx, plan) => {
  await reseed(ctx, 0)
  await ctx.evaluate((p) => window.__video.stage(p), plan)
  await imagesSettled(ctx)
  // One real beat so the staged scene has painted, and every entrance
  // transition (unit pop-ins) has finished before frame 0.
  await ctx.wait(700)
  await pinAmbientAnimations(ctx)
  const s = await snapshot(ctx)
  ctx.log.info(`staged wave ${s.wave} · army ${s.army.map((f) => 'T' + f.tier).join(' ')} · ` +
    `foes ${s.foes.length}${s.boss !== null ? ' + boss' : ''} · grid ${s.grid.filter(Boolean).join(',')}` +
    `${ctx.clean ? ' (clean feed)' : ''}`)
  return s
}

/** Release the battle. Call at the very top of `record()` so frame 1 moves. */
export const release = async (ctx) => {
  await reseed(ctx, 1)
  await ctx.evaluate(() => window.__video.freeze(false))
}
export const hold = (ctx) => ctx.evaluate(() => window.__video.freeze(true))

/** Fire a drag and return at once — it animates on the page's (virtual) rAF.
 *  Pace the beat with `wait`; never await the drag itself. */
export const drag = (ctx, from, to, ms = 620) =>
  ctx.evaluate(([f, t, m]) => window.__video.drag(f, t, m), [from, to, ms])

/** Drag slot `from` onto the first fighter of `tier` — a field merge. The drop
 *  tracks the fighter as it moves. With no such fighter standing (the fight is
 *  emergent — it may have fallen), it deploys at `fallback` (arena %) instead,
 *  or does nothing and resolves false without one. */
export const dragOnto = (ctx, from, tier, ms = 700, fallback = null) =>
  ctx.evaluate(([f, t, m, fb]) => {
    const target = window.__video.state().army.find((a) => a.tier === t && !a.spectral)
    if (target) return window.__video.drag(f, { fighter: target.id }, m)
    return fb ? window.__video.drag(f, { arena: fb }, m) : false
  }, [from, tier, ms, fallback])

/** A spell, through the arena's own button handler (sound, shake, VFX). */
export const cast = (ctx, skill) => ctx.evaluate((s) => window.__video.cast(s), skill)

/** Tap the OVERRUN screen's Skip: the field resets 0.8 s of game time later
 *  instead of holding the red screen while the RALLY offer waits. */
export const skipRally = (ctx) => ctx.evaluate(() => window.__video.skipRally())

export const snapshot = (ctx) => ctx.evaluate(() => window.__video.state())

/** A one-line verdict for the log, so two takes can be compared by eye. */
export const logState = async (ctx, label) => {
  const s = await snapshot(ctx)
  const army = s.army.filter((f) => !f.spectral).map((f) => `T${f.tier}@${f.hp}`).join(' ')
  ctx.log.info(`${label}: phase ${s.phase} · gate ${s.gate} · army [${army}] · foes ${s.foes.length}` +
    `${s.boss !== null ? ` · boss ${s.boss}` : ''}${s.reveal ? ` · reveal T${s.reveal.tier}` : ''}`)
  return s
}

/** Authoring aid: with PV_TRACE=1 in the environment, log the fight every
 *  `everyMs` of video alongside the beats — how a staging is tuned. */
export const trace = (ctx, everyMs = 1000) => {
  if (!process.env.PV_TRACE) return
  void (async () => {
    for (let t = everyMs; t < ctx.durationMs; t += everyMs) {
      await ctx.wait(everyMs)
      await logState(ctx, `t=${(t / 1000).toFixed(1)}s`)
    }
  })()
}

/**
 * Clamp every wait to what is left of the clip, so `--duration 6` ends cleanly
 * instead of scheduling beats past the last frame. Returns false once the clip
 * is spent — a beat list stops on it.
 */
export const budget = (ctx) => {
  let spent = 0
  const wait = async (ms) => {
    const take = Math.min(ms, Math.max(0, ctx.durationMs - spent))
    spent += take
    if (take > 0) await ctx.wait(take)
    return spent < ctx.durationMs
  }
  wait.at = () => spent
  return wait
}
