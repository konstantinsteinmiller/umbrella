#!/usr/bin/env node
/**
 * Solve the kite levels with the bot (tests/umbrella/helpers/kiteSolver.ts) and
 * record the wins in tests/umbrella/kite-solutions.json — the input recordings
 * the test suite replays on the real engine to prove every level can be beaten.
 *
 *   node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- node scripts/kite-solve.mjs
 *   node scripts/kite-solve.mjs --ids 12,13 --beam 3000      # re-solve some levels
 *   node scripts/kite-solve.mjs --campaign                   # the server campaign (report only)
 *
 * Runs in Node worker threads (at most 10, fewer when the worker budget grants
 * fewer: os.availableParallelism()). Prints the difficulty curve.
 */
import { registerHooks } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(ROOT, 'src')
const OUT = resolve(ROOT, 'tests/umbrella/kite-solutions.json')

/** Node runs the game's TypeScript itself (type stripping); this fills in Vite's `@/`
 *  alias and extensionless imports, and stands in for kite.ts (import.meta.env). */
const hooks = (kite) => registerHooks({
  resolve(specifier, context, next) {
    const withTs = (s) => (/\.[cm]?[jt]s$/.test(s) ? s : `${s}.ts`)
    if (specifier.startsWith('@/')) {
      const file = resolve(SRC, withTs(specifier.slice(2)))
      if (existsSync(file)) return { url: pathToFileURL(file).href, shortCircuit: true }
    }
    try {
      return next(specifier, context)
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(withTs(specifier), context)
      throw err
    }
  },
  load(url, context, next) {
    if (url.endsWith('/src/umbrella/kite.ts')) return { format: 'module', source: `export const isKite = ${kite}`, shortCircuit: true }
    return next(url, context)
  }
})

const args = process.argv.slice(2)
const arg = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const campaign = args.includes('--campaign')

if (!isMainThread) {
  hooks(!workerData.campaign)
  const { LEVELS } = await import(pathToFileURL(resolve(SRC, 'umbrella/levels.ts')).href)
  const { solve, risk } = await import(pathToFileURL(resolve(ROOT, 'tests/umbrella/helpers/kiteSolver.ts')).href)
  parentPort.on('message', (id) => {
    if (id === null) process.exit(0)
    const level = LEVELS.find((l) => l.id === id)
    const t0 = performance.now()
    // Escalate the beam until it wins: effort is measured on the first (cheapest) try.
    let sol = null
    let beam = 0
    let fail = null
    // Start at the width the level needed last time (no need to fail the narrow ones again).
    const known = workerData.known[id] ?? 0
    for (const b of workerData.beams.filter((x, i, all) => x >= known || i === all.length - 1)) {
      beam = b
      sol = solve(level, { beam: b, maxTime: workerData.maxTime, more: 2, onFail: (f) => { fail = f } })
      if (sol) break
    }
    // Of the wins found (the fastest, and those up to 2 s slower), the safest one is
    // the route a careful player takes: its risk is the level's.
    let rk = { mean: 0, peak: 0 }
    if (sol) {
      const pool = sol.wins ?? [sol]
      const step = Math.max(1, Math.floor(pool.length / 12))
      let bestScore = Infinity
      for (let i = 0; i < pool.length; i += step) {
        const r = risk(level, pool[i].actions)
        const score = r.mean * 2 + r.peak
        if (score < bestScore) { bestScore = score; rk = r; sol = { ...sol, actions: pool[i].actions, time: pool[i].time } }
      }
    }
    const ms = performance.now() - t0
    parentPort.postMessage({ id, sol: sol && { ...sol, wins: undefined }, beam, rk, ms, fail })
  })
  parentPort.postMessage({ ready: true })
} else {
  const workers = Math.max(1, Math.min(10, Number(arg('workers') ?? availableParallelism())))
  hooks(!campaign)
  const { LEVELS } = await import(pathToFileURL(resolve(SRC, 'umbrella/levels.ts')).href)
  const ids = arg('ids') ? arg('ids').split(',').map(Number) : LEVELS.map((l) => l.id)
  const beams = arg('beam') ? [Number(arg('beam'))] : [1500, 4000, 10000]
  const maxTime = Number(arg('max-time') ?? 32)
  const queue = [...ids].sort((a, b) => b - a) // the long levels first
  const known = {}
  if (!campaign && existsSync(OUT) && !arg('beam')) {
    for (const [id, r] of Object.entries(JSON.parse(readFileSync(OUT, 'utf8')).levels)) known[id] = r.beam
  }
  const results = {}
  console.log(`kite-solve: ${ids.length} level(s), ${workers} worker(s), beams ${beams.join('/')}`)
  await Promise.all(Array.from({ length: Math.min(workers, ids.length) }, () => new Promise((done) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { campaign, beams, maxTime, known }, argv: args })
    const next = () => w.postMessage(queue.length ? queue.shift() : null)
    w.on('message', (m) => {
      if (!m.ready) {
        results[m.id] = m
        const s = m.sol
        console.log(`  ${String(m.id).padStart(3)}  ${s ? `win ${s.time.toFixed(1).padStart(5)} s  nodes ${String(s.nodes).padStart(8)}  deaths ${(s.deathRate * 100).toFixed(0).padStart(3)}%  fatal slips ${(m.rk.mean * 100).toFixed(0).padStart(3)}% (peak ${(m.rk.peak * 100).toFixed(0).padStart(3)}%)  beam ${m.beam}` : `UNSOLVED (closest: x ${m.fail?.x.toFixed(0)} y ${m.fail?.y.toFixed(0)} at ${m.fail?.time.toFixed(1)} s, cost ${m.fail?.score.toFixed(0)})`}  (${(m.ms / 1000).toFixed(1)} s)`)
      }
      next()
    })
    w.on('exit', done)
    w.on('error', (e) => { console.error(e); done() })
  })))
  const unsolved = ids.filter((id) => !results[id]?.sol)
  if (!campaign) {
    const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { levels: {} }
    for (const id of ids) {
      const r = results[id]
      if (r?.sol) {
        prev.levels[id] = {
          actions: r.sol.actions, time: +r.sol.time.toFixed(3), nodes: r.sol.nodes,
          deathRate: +r.sol.deathRate.toFixed(4), risk: +r.rk.mean.toFixed(4), riskPeak: +r.rk.peak.toFixed(4), beam: r.beam
        }
      } else delete prev.levels[id]
    }
    prev.macroTicks = 12
    prev.dt = 1 / 120
    prev.note = 'Generated by scripts/kite-solve.mjs: one digit per 0.1 s decision (dir 0 left / 1 none / 2 right, +3 = tap Space).'
    const sorted = Object.fromEntries(Object.entries(prev.levels).sort(([a], [b]) => Number(a) - Number(b)))
    writeFileSync(OUT, `${JSON.stringify({ note: prev.note, dt: prev.dt, macroTicks: prev.macroTicks, levels: sorted }, null, 1)}\n`)
    console.log(`wrote ${OUT}`)
  }
  console.log(unsolved.length ? `UNSOLVED: ${unsolved.join(', ')}` : 'all solved')
  process.exit(unsolved.length ? 1 : 0)
}
