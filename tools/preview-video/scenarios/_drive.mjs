/**
 * ─── Driving Umbrella ─────────────────────────────────────────────────
 *
 * Everything game-specific the scenarios share, so each scenario reads as a
 * beat sheet. There is no dedicated video seam in `src/`: the DEV server serves
 * the game's own modules at stable URLs, so `window.__vid` (installed below,
 * page side) imports `/src/barrage/state/useBarrage.ts` and
 * `/src/barrage/engine/shotFinder.ts` — the SAME module instances the app runs
 * (hot reload is muted for the recording page, so no stale HMR copy).
 *
 *   __vid.state()          one-line snapshot: phase, row, tray, boss, lowest row
 *   __vid.jumpToBoss()     rebuild the endless run so the NEXT row is a boss
 *   __vid.prime(n)         n weak turns (one tier-1 ball, settled in real time)
 *                          — walkers march in and the boss walks down
 *   __vid.plan(kind)       search four volleys on engine CLONES (one tray —
 *                          tier × count — and four angles; see plan() below):
 *                          'success' → the third enrages the boss, the fourth
 *                                      kills it one row from the line
 *                          'fail'    → the fourth leaves it a sliver and the
 *                                      line breaks
 *   __vid.bestShot()       the most destructive angle on the live board now
 *   __vid.aim(angle, k)    one frame of a scripted finger: real pointer events on
 *                          the canvas, so the game draws its own aim preview
 *   __vid.release(angle)   ends the drag and fires the EXACT planned angle (a
 *                          pointer's pixel-rounded angle would play a different
 *                          volley than the one the clone planned)
 *
 * The engine is deterministic (same snapshot + same angle ⇒ same volley), so
 * the planned clones and the recorded volleys agree; the log lines prove it.
 *
 * Files starting with `_` are helpers and are never loaded as scenarios.
 */

const STATE_KEY = 'umbrella_state'
const LESSONS = ['pull', 'survive', 'tray', 'combo', 'trayIntro', 'arrows', 'mergeBox', 'pickupBox', 'threatBox', 'speedBox', 'luckBox', 'bountyBox']
const SKILLS = ['meteor', 'warcry', 'legion', 'pact', 'shield', 'execute', 'heal', 'revive']
const TAGS = ['caterpillar', 'goblin', 'ogre', 'centaur', 'dryad', 'imp', 'treant', 'carbuncle', 'cyclops', 'corrupted',
  'boss:slime-tower', 'boss:worm', 'boss:fire-dragon', 'boss:silver-dragon', 'boss:troll', 'boss:orc']
const many = (ids) => Object.fromEntries(ids.map((k) => [k, 99]))

/** A veteran's save: tutorial and FTUE done, every wordless lesson, rule badge
 *  and skill toast already shown (the coach must not draw a demo hand into the
 *  clip), a checkpoint behind row 30, mid upgrades. The run itself is rebuilt
 *  by `jumpToBoss`. */
export const saveFixture = (over = {}) => ({
  eb_tutorial_step: 4,
  eb_ftue: { done: true, firstMerge: true, freeCapacity: true, freeDamageOffer: true, freeDamage: true, sockets: 0 },
  eb_coach: { v: 1, shown: many(LESSONS), kinds: many(TAGS), toasts: many(SKILLS) },
  eb_best_row: 52,
  eb_checkpoint: { row: 30, tray: [5, 5, 4, 4, 4, 3, 3, 3], deaths: 0, bossHp: 0 },
  eb_upgrades: { damage: 20, capacity: 8, speed: 10, luck: 4, bounty: 4 },
  epic_coins: 500,
  ...over
})

const seedSaveScript = (save) => `
  try {
    if (!sessionStorage.getItem('__pv_seeded')) {
      localStorage.clear()
      localStorage.setItem(${JSON.stringify(STATE_KEY)}, ${JSON.stringify(JSON.stringify(save))})
      sessionStorage.setItem('__pv_seeded', '1')
    }
  } catch (e) {}
`

/** Page side. Serialised with toString(), so it must be self-contained. */
function installVid () {
  const w = window
  if (w.__vid) return
  const vid = {
    B: null, SF: null,
    async init () {
      this.B = await import('/src/barrage/state/useBarrage.ts')
      this.SF = await import('/src/barrage/engine/shotFinder.ts')
      return true
    },
    b () { return this.B.default() },
    eng () { return this.b().engine.value },
    board () { return document.querySelector('.barrage-board')?.__vueParentComponent?.exposed ?? null },
    canvas () { return document.querySelector('canvas.barrage-board__canvas') },
    bossOf (s) { return s.monsters.find((m) => m.kind === 'boss') ?? null },
    rowsLeft (s) {
      let bottom = -Infinity
      for (const m of s.monsters) bottom = Math.max(bottom, m.row + m.h)
      return bottom === -Infinity ? 10 : 10 - bottom
    },
    state () {
      const s = this.eng().state
      const boss = this.bossOf(s)
      return {
        phase: s.phase, row: s.row, tray: `${s.tray.length}×t${s.tray[0] ?? 0}`, foes: s.monsters.length,
        boss: boss ? `${boss.bossKind} ${(boss.hp / boss.maxHp).toFixed(2)} bottom=${boss.row + boss.h}${boss.enraged ? ' ENRAGED' : ''}` : null,
        rowsLeft: this.rowsLeft(s), shields: s.shields, revives: s.revives, held: this.b().holdSim.value, death: this.b().deathScene.value, breach: !!this.b().breach.value
      }
    },
    calm () { this.eng().state.chestTimer = 1e6 },
    jumpToBoss () { this.B.barrageCheats.jumpToNextBoss(); this.calm() },
    prime (n, angle = Math.PI / 2) {
      for (let i = 0; i < n; i++) {
        const e = this.eng()
        if (e.state.phase !== 'aim') break
        e.state.tray = [1]
        this.b().fire(angle)
        e.settle(60)
      }
      this.calm()
      return this.state()
    },
    /** Play one volley on a clone with `tray`; returns the clone after it settles. */
    trial (src, tray, angle) {
      const c = src.clone()
      c.state.tray = tray.slice()
      c.state.chestTimer = 1e6
      c.fire(angle)
      c.settle(120)
      return c
    },
    /**
     * Search four volleys on clones, one tray (tier × count) for all of them:
     *   vO  the opener — this tray's best kill shot that leaves the boss healthy;
     *   v0  the opener — a combo that clears walkers and only grazes the boss;
     *   v1  success: ENRAGES the boss (< 30 %), so it marches two rows and
     *       stands at the line; fail: hurts it without enraging it while
     *       something is left one march from the line;
     *   v2  success: kills it (with its neighbouring angles too — robust);
     *       fail: leaves it a sliver and the line breaks (one exact angle).
     * The game's hidden savior boost doubles the damage of a volley fired with
     * the boss one march from breaching, so a fail by the boss alone is nearly
     * unplannable; the fail clip's breach usually comes from the boss AND the
     * walker row beside it.
     */
    plan (kind) {
      const SF = this.SF
      const live = this.eng()
      const fan = SF.aimFan(45)
      const fan0 = SF.aimFan(17)
      const cap = live.state.config.trayCapacity
      const trays = []
      for (const t of [2, 3, 4, 5, 6, 7, 8]) for (const n of [8, 10, 12, 14, 16]) if (n <= cap) trays.push({ t, n })
      const out = []
      const diag = { v0: 0, v1: 0, v2: 0 }
      const t0 = performance.now()
      for (const { t, n } of trays) {
        if (performance.now() - t0 > 150_000) break
        const tray = Array.from({ length: n }, () => t)
        // The opener: this tray's most destructive shot that leaves the boss
        // healthy — the clip's first seconds, before the planned three.
        let open = null
        for (const aO of SF.aimFan(21)) {
          const cO = this.trial(live, tray, aO)
          const bO = this.bossOf(cO.state)
          if (cO.state.phase !== 'aim' || !bO || bO.enraged || bO.hp / bO.maxHp < 0.5) continue
          const k = live.state.monsters.filter((m) => !cO.state.monsters.some((x) => x.id === m.id)).length
          if (!open || k > open.k) open = { aO, cO, k }
        }
        if (!open || open.k < 2) continue
        diag.open = (diag.open ?? 0) + 1
        const src = open.cO
        for (const a0 of fan0) {
          const c0 = this.trial(src, src.state.tray, a0)
          const boss0 = this.bossOf(c0.state)
          if (c0.state.phase !== 'aim' || !boss0) continue
          const killed0 = src.state.monsters.filter((m) => !c0.state.monsters.some((x) => x.id === m.id)).length
          if (killed0 < 1 || boss0.enraged) continue
          diag.v0++
          for (const a1 of fan) {
            const c1 = this.trial(c0, c0.state.tray, a1)
            if (c1.state.phase !== 'aim') continue
            const boss1 = this.bossOf(c1.state)
            if (!boss1) continue
            const frac1 = boss1.hp / boss1.maxHp
            const left1 = this.rowsLeft(c1.state)
            const killed1 = c0.state.monsters.filter((m) => !c1.state.monsters.some((x) => x.id === m.id)).length
            if (kind === 'success' ? (!boss1.enraged || frac1 < 0.08 || left1 > 1) : (boss1.enraged || frac1 < 0.3 || left1 !== 0)) continue
            diag.v1++
            const res = fan.map((a2) => {
              const c2 = this.trial(c1, c1.state.tray, a2)
              const boss2 = this.bossOf(c2.state)
              return { a2, phase: c2.state.phase, boss2: boss2 ? boss2.hp / boss2.maxHp : 0 }
            })
            for (let i = 1; i < res.length - 1; i++) {
              const r = res[i], l = res[i - 1], rr = res[i + 1]
              const base = (open.k + killed0 + killed1) * 2 + t + n * 0.5 + (kind === 'success' && left1 === 0 ? 8 : 0)
              let score = -1
              if (kind === 'success') {
                const ok = (x) => x.boss2 === 0 && x.phase === 'aim'
                if (ok(r) && ok(l) && ok(rr)) score = base
              } else if (r.phase === 'breach' && r.boss2 > 0 && r.boss2 < 0.3) {
                score = base + (0.3 - r.boss2) * 60
              }
              if (score > 0) { diag.v2++; out.push({ t, n, aO: open.aO, a0, a1, a2: r.a2, killed0, killed1, frac1, left1, boss2: r.boss2, score }) }
            }
          }
        }
      }
      diag.ms = Math.round(performance.now() - t0)
      out.sort((x, y) => y.score - x.score)
      return { n: out.length, diag, best: out[0] ?? null, top: out.slice(0, 4) }
    },
    setTray (t, n) {
      const e = this.eng()
      e.state.tray = Array.from({ length: n }, () => t)
      this.b().tray.value = e.state.tray.slice()
    },
    /** The most satisfying shot on the live board right now: kills, hits and
     *  pickups ('+1' balls, perk orbs), with its neighbours. Never a breach. */
    bestShot () {
      const SF = this.SF
      const live = this.eng()
      const trials = SF.aimFan(41).map((a) => SF.trialShot(live, a))
      const i = SF.pickBest(trials, (t) => (t.breach ? -100 : t.kills * 4 + t.hits * 0.2 + t.balls * 2))
      return trials[i]?.angle ?? Math.PI / 2
    },
    /** The finger, in client px, `k` (0..1) of the way from the launcher along `angle`. */
    fingerAt (angle, k) {
      const bd = this.board()
      const s = this.eng().state
      const from = bd.cellToClient(s.launcherX, 11.15 - 0.45)
      const to = bd.cellToClient(s.launcherX + Math.cos(angle) * 6, 11.15 - 0.45 - Math.sin(angle) * 6)
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }
    },
    ptr (type, p) {
      this.canvas().dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
        clientX: p.x, clientY: p.y, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1
      }))
    },
    down (angle) { this.ptr('pointerdown', this.fingerAt(angle, 0.55)) },
    aim (angle, k = 1) { this.ptr('pointermove', this.fingerAt(angle, k)) },
    /** End the drag and fire the planned angle exactly (see the header). */
    release (angle) {
      this.ptr('pointercancel', this.fingerAt(angle, 1))
      return this.b().fire(angle)
    },
    restart () { void this.b().restartFromCheckpoint() }
  }
  w.__vid = vid
}

/** Boot to a veteran's endless run and install `__vid`. */
export const boot = async (ctx, { save = saveFixture() } = {}) => {
  const url = ctx.page.url().split('#')[0]
  await ctx.page.addInitScript(seedSaveScript(save))
  await ctx.page.goto('about:blank')
  await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await ctx.waitFor(() => !!document.querySelector('canvas.barrage-board__canvas') && !!(/** @type {any} */ (window)).__coach?.engine?.(), undefined, { timeout: 120_000 })
  await ctx.evaluate(`(${installVid.toString()})()`)
  await ctx.evaluate(() => window.__vid.init())
  await ctx.waitFor(() => window.__vid.eng().state.phase === 'aim' && !window.__vid.b().holdSim.value, undefined, { timeout: 60_000 })
  await ctx.wait(1500) // splash / fonts / painted art settle
}

/** Reset the page's seeded Math.random to a fixed point (no-op with --seed off). */
export const reseed = (ctx, salt = 0) =>
  ctx.evaluate(([base, s]) => window.__vseed?.reseed(base + s), [Number(ctx.config.seedRandom ?? 7), salt])

/** Pin every looping CSS animation to a fixed phase — the last thing setup does. */
export const pinAmbientAnimations = (ctx) => ctx.evaluate(() => {
  let i = 0
  for (const a of document.getAnimations()) {
    const t = a.effect?.getTiming?.()
    if (!t || t.iterations !== Infinity) continue
    const period = typeof t.duration === 'number' && t.duration > 0 ? t.duration : 1000
    a.currentTime = ((i++ * 211) % 997) / 997 * period + (Number(t.delay) || 0)
    a.pause()
  }
  return i
})

/**
 * Stage the boss fight: next row is the boss, `primeTurns` weak turns walk it
 * (and the walker row below it) down to the danger zone, then search the four
 * volleys for `kind`. Throws when no plan exists — a clip without its payoff
 * is worse than no clip.
 */
export const stageBossFight = async (ctx, kind, { primeTurns = 6 } = {}) => {
  await reseed(ctx)
  await ctx.evaluate(() => window.__vid.jumpToBoss())
  await ctx.wait(300)
  const primed = await ctx.evaluate((n) => window.__vid.prime(n), primeTurns)
  ctx.log.info(`primed: ${JSON.stringify(primed)}`)
  const plan = await ctx.evaluate((k) => window.__vid.plan(k), kind)
  ctx.log.info(`plan(${kind}): ${plan.n} candidates ${JSON.stringify(plan.diag)}; best ${JSON.stringify(plan.best)}`)
  if (!plan.best) throw new Error(`stageBossFight: no ${kind} plan from this board — change primeTurns`)
  await ctx.evaluate(([t, n]) => window.__vid.setTray(t, n), [plan.best.t, plan.best.n])
  await ctx.wait(800) // let the renderer settle onto the staged board
  return plan.best
}

/**
 * One scripted shot inside record(): the finger goes down, sweeps to the aim
 * over `aimMs` (the game draws its own preview), holds, and fires the exact
 * planned angle. Paced by ctx.wait — virtual time.
 */
export const shoot = async (ctx, angle, { aimMs = 700, holdMs = 250, from = Math.PI / 2 } = {}) => {
  const frames = Math.max(2, Math.round(aimMs / (1000 / ctx.fps)))
  await ctx.evaluate((a) => window.__vid.down(a), from)
  for (let i = 1; i <= frames; i++) {
    const k = i / frames
    const e = k * k * (3 - 2 * k)
    await ctx.evaluate(([a, b, t]) => window.__vid.aim(a + (b - a) * t, 1), [from, angle, e])
    await ctx.wait(1000 / ctx.fps)
  }
  await ctx.wait(holdMs)
  const ok = await ctx.evaluate((a) => window.__vid.release(a), angle)
  if (!ok) ctx.log.warn(`shoot: fire(${angle.toFixed(3)}) refused`)
  return ok
}

export const logState = async (ctx, label) => {
  const s = await ctx.evaluate(() => window.__vid?.state() ?? null)
  ctx.log.info(`${label} @${(ctx.frame() / ctx.fps).toFixed(1)}s: ${JSON.stringify(s)}`)
  return s
}

/** Clamp waits to the clip. */
export const budget = (ctx) => {
  let spent = 0
  const wait = async (ms) => {
    const take = Math.min(ms, Math.max(0, ctx.durationMs - spent))
    spent += take
    if (take > 0) await ctx.wait(take)
    return spent < ctx.durationMs
  }
  wait.left = () => Math.max(0, ctx.durationMs - spent)
  return wait
}
