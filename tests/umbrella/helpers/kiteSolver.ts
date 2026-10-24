// ─── A bot that plays Umbrella levels with the real engine ───────────────────
//
// Proof that a level can be beaten: it searches over the player's actual inputs
// (hold left / nothing / right, optionally tapping Space) on the real engine
// (createWorld / step, the game's fixed 1/120 s tick, the default tuning), so a
// solution is an input recording the game itself would accept.
//
// Search: time-layered beam search. Every layer is one decision (MACRO ticks of the
// same held input, Space only on the first tick). Children are de-duplicated per
// layer on a fine grid of the player state (position, velocity, umbrella, switches,
// enemies that react to the player); the layer keeps
//   · the best state of every coarse region and heading (exploration: detours, buttons), and
//   · the states nearest the finish (exploitation),
// where "nearest" is a wind-aware travel cost to the finish (rising is cheap only
// inside an updraft). The first layer that lands on the Finish is the fastest win
// this search found.
//
// Pure TypeScript with no Vite-only imports, so scripts/kite-solve.mjs runs it in
// Node worker threads and the vitest suite runs it in-process.

import { contactOf, createWorld, step, type Input, type World } from '@/umbrella/engine'
import type { LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING, type Tuning } from '@/umbrella/tuning'

export const DT = 1 / 120
/** Ticks per decision: 0.1 s, a pace a person keeps up with. */
export const MACRO = 12

/** Action = dir (0 left, 1 none, 2 right) + 3 × toggle. */
export const ACTIONS = 6
const INPUTS: Input[] = [
  { left: true, right: false, toggle: false },
  { left: false, right: false, toggle: false },
  { left: false, right: true, toggle: false },
  { left: true, right: false, toggle: true },
  { left: false, right: false, toggle: true },
  { left: false, right: true, toggle: true }
]
const HOLD: Input[] = INPUTS.slice(0, 3)

export interface SolveOptions {
  /** Longest run searched (s). */
  maxTime?: number
  /** States kept per layer by distance to the finish. */
  beam?: number
  /** Coarse exploration region (px). */
  region?: number
  /** Fine de-duplication grid (px) and velocity bucket (px/s). */
  cell?: number
  vcell?: number
  tuning?: Tuning
  /** Keep searching this long after the first win (s), collecting more wins (the
   *  safest one, not the fastest, measures how hard a level really is). 0: stop at the first. */
  more?: number
  /** Called when the search gives up: where it got closest to the finish. */
  onFail?: (best: { x: number; y: number; time: number; score: number; actions: string }) => void
}

export interface Solution {
  /** One digit per decision (see ACTIONS). */
  actions: string
  /** Game time of the win (s). */
  time: number
  /** States simulated before the win (search effort). */
  nodes: number
  /** Share of simulated children that died (how unforgiving the level is). */
  deathRate: number
  /** With `more`: every win found (the first one included), fastest first. */
  wins?: { actions: string; time: number }[]
}

export const tuningSize = (t: Tuning) => ({ w: t.playerWidth, h: t.playerHeight })

/** Plays one decision: MACRO ticks of the held input, Space on the first tick only. */
export const playAction = (w: World, a: number, t: Tuning = DEFAULT_TUNING): void => {
  for (let i = 0; i < MACRO && w.phase === 'play'; i++) step(w, i === 0 ? INPUTS[a]! : HOLD[a % 3]!, DT, t)
}

/** Replays a recording from the spawn; returns the world as it ended. */
export const replay = (level: LevelDef, actions: string, t: Tuning = DEFAULT_TUNING): World => {
  const w = createWorld(level, tuningSize(t))
  for (const ch of actions) {
    if (w.phase !== 'play') break
    playAction(w, Number(ch), t)
  }
  return w
}

// ── Cloning: only what step() mutates ──
const mutable = (h: { motion?: unknown; contact?: unknown; kind: string; harmless?: boolean }) =>
  !!h.motion || (h.kind === 'pillar' && contactOf(h as never) === 'bounce')
const cloneWorld = (w: World, movP: boolean[], movH: boolean[]): World => ({
  ...w,
  platforms: w.platforms.map((p, i) => (movP[i] ? { ...p } : p)),
  hazards: w.hazards.map((h, i) => (movH[i] ? { ...h } : h)),
  player: { ...w.player },
  channels: { ...w.channels },
  buttonsDown: w.buttonsDown.slice()
})

// ── Heuristic: wind-aware travel cost to the finish, on a grid ──
const G = 16
interface Field { cols: number; rows: number; x0: number; y0: number; d: Float32Array }
const buildField = (level: LevelDef): Field => {
  const x0 = -80
  const y0 = -320
  const cols = Math.ceil((level.world.w + 160) / G)
  const rows = Math.ceil((level.world.h + 400) / G)
  const n = cols * rows
  const blocked = new Uint8Array(n)
  const upWind = new Uint8Array(n)
  const cellRect = (r: { x: number; y: number; w: number; h: number }, f: (i: number) => void, pad = 0) => {
    const c0 = Math.max(0, Math.floor((r.x - pad - x0) / G))
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w + pad - x0) / G))
    const r0 = Math.max(0, Math.floor((r.y - pad - y0) / G))
    const r1 = Math.min(rows - 1, Math.floor((r.y + r.h + pad - y0) / G))
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) f(y * cols + x)
  }
  for (const p of level.platforms) if (!p.motion && p.channel === undefined && !p.finish) cellRect(p, (i) => { blocked[i] = 1 })
  for (const h of level.hazards ?? []) if (!h.motion && contactOf(h) !== 'bounce') cellRect(h, (i) => { blocked[i] = 1 }, 6)
  for (const wd of level.winds) if (wd.dir === 'up') cellRect(wd, (i) => { upWind[i] = 1 })
  // Bouncy Walldorfs and moving platforms lift too.
  for (const h of level.hazards ?? []) if (contactOf(h) === 'bounce') cellRect({ x: h.x, y: h.y - 200, w: h.w, h: h.h + 200 }, (i) => { upWind[i] = 1 })
  for (const p of level.platforms) if (p.motion) cellRect({ x: p.x - 200, y: p.y - 400, w: p.w + 400, h: 800 }, (i) => { upWind[i] = 1 })
  // Targets: just above the finish, wherever its motion takes it.
  const d = new Float32Array(n).fill(1e9)
  const queue: number[] = []
  const probe = createWorld(level)
  const fins = probe.platforms.map((p, i) => [p, i] as const).filter(([p]) => p.finish)
  for (let s = 0; s <= 120; s++) {
    if (s) for (let k = 0; k < 6; k++) step(probe, { left: false, right: false, toggle: false }, DT, DEFAULT_TUNING)
    for (const [, i] of fins) {
      const p = probe.platforms[i]!
      cellRect({ x: p.x, y: p.y - 40, w: p.w, h: 30 }, (c) => { if (d[c] !== 0) { d[c] = 0; queue.push(c) } })
    }
  }
  // Dijkstra on the reversed graph: cost of moving from a cell into its neighbour.
  const heap: [number, number][] = queue.map((c) => [0, c])
  const push = (e: [number, number]) => {
    heap.push(e)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p]![0] <= heap[i]![0]) break
      ;[heap[p], heap[i]] = [heap[i]!, heap[p]!]
      i = p
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]!
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i]!, heap[m]!]
        i = m
      }
    }
    return top
  }
  heap.sort((a, b) => a[0] - b[0])
  while (heap.length) {
    const [dist, c] = pop()
    if (dist > d[c]!) continue
    const cx = c % cols
    const cy = (c - cx) / cols
    // Neighbour `a` moves INTO c: (dx, dy) is the move a → c.
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue
      const ax = cx - ox
      const ay = cy - oy
      if (ax < 0 || ay < 0 || ax >= cols || ay >= rows) continue
      const a = ay * cols + ax
      if (blocked[a]) continue
      // Rising (oy < 0) is cheap only in an updraft; falling is cheap.
      const vert = oy < 0 ? (upWind[a] || upWind[c] ? 1 : 12) : oy > 0 ? 0.5 : 0
      const cost = G * (Math.abs(ox) + vert || 0.5)
      const nd = dist + cost
      if (nd < d[a]!) { d[a] = nd; push([nd, a]) }
    }
  }
  return { cols, rows, x0, y0, d }
}
const fieldAt = (f: Field, x: number, y: number): number => {
  const c = Math.floor((x - f.x0) / G)
  const r = Math.floor((y - f.y0) / G)
  if (c < 0 || r < 0 || c >= f.cols || r >= f.rows) return 1e9
  return f.d[r * f.cols + c]!
}

interface Node { w: World | null; parent: Node | null; a: number; score: number }

const channelKey = (w: World) => {
  let s = ''
  for (const [c, until] of Object.entries(w.channels)) {
    if (until > w.time) s += `${c}:${until === Infinity ? 'i' : Math.ceil((until - w.time) / 0.5)};`
  }
  return s
}

export const solve = (level: LevelDef, opts: SolveOptions = {}): Solution | null => {
  const t = opts.tuning ?? DEFAULT_TUNING
  const maxSteps = Math.ceil((opts.maxTime ?? 32) / (MACRO * DT))
  const beam = opts.beam ?? 1500
  const region = opts.region ?? 64
  const cell = opts.cell ?? 8
  const vcell = opts.vcell ?? 40
  const field = buildField(level)
  const root = createWorld(level, tuningSize(t))
  const movP = root.platforms.map((p) => !!p.motion)
  const movH = root.hazards.map((h) => mutable(h))
  const reactive = root.hazards.map((h, i) => [h, i] as const)
    .filter(([h]) => h.motion?.kind === 'follow' || (h.motion?.kind === 'lunge' && h.motion.trigger)).map(([, i]) => i)
  const key = (w: World, q: number, vq: number) => {
    const p = w.player
    let k = `${Math.round(p.x / q)},${Math.round(p.y / q)},${Math.round(p.vx / vq)},${Math.round(p.vy / vq)},${+p.open}${+p.broken}${+p.grounded}|${channelKey(w)}|${w.buttonsDown.map(Number).join('')}`
    for (const i of reactive) {
      const h = w.hazards[i]!
      k += `|${Math.round(h.x / 24)},${Math.round(h.y / 24)},${h.lungeAt === undefined ? '-' : Math.floor((w.enemyTime - h.lungeAt) / 0.25)}`
    }
    return k
  }
  const regionKey = (w: World) => {
    const p = w.player
    return `${Math.floor(p.x / region)},${Math.floor(p.y / region)},${Math.sign(Math.round(p.vx / 60))},${+p.open}${+p.broken}|${channelKey(w).replace(/:\d+;/g, ':t;')}|${w.buttonsDown.map(Number).join('')}`
  }
  const scoreOf = (w: World) => {
    const p = w.player
    // Falling fast near the bottom of the world is a bad bet; so is a broken umbrella.
    return fieldAt(field, p.x + p.w / 2, p.y + p.h / 2) + (p.broken ? 400 : 0)
  }

  let layer: Node[] = [{ w: root, parent: null, a: -1, score: scoreOf(root) }]
  let nodes = 0
  let deaths = 0
  let best: Node | null = null
  let first: Solution | null = null
  let stopAt = Infinity
  const wins: { actions: string; time: number }[] = []
  let bestInfo = { x: 0, y: 0, time: 0, score: Infinity }
  for (let depth = 0; depth < maxSteps && depth <= stopAt && layer.length; depth++) {
    const next = new Map<string, Node>()
    for (const n of layer) {
      const w = n.w!
      n.w = null
      const acts = w.player.grounded ? 3 : ACTIONS
      for (let a = 0; a < acts; a++) {
        const c = cloneWorld(w, movP, movH)
        playAction(c, a, t)
        nodes++
        if (c.phase === 'win') {
          const path: number[] = [a]
          for (let p: Node | null = n; p && p.a >= 0; p = p.parent) path.push(p.a)
          const win = { actions: path.reverse().join(''), time: c.time }
          if (!first) {
            first = { ...win, nodes, deathRate: deaths / nodes }
            if (!opts.more) return first
            stopAt = depth + Math.ceil(opts.more / (MACRO * DT))
          }
          wins.push(win)
          continue
        }
        if (c.phase !== 'play') { deaths++; continue }
        const k = key(c, cell, vcell)
        const score = scoreOf(c)
        const old = next.get(k)
        if (!old || score < old.score) {
          const node = { w: c, parent: n, a, score }
          next.set(k, node)
          if (score < bestInfo.score) { best = node; bestInfo = { x: c.player.x, y: c.player.y, time: c.time, score } }
        }
      }
    }
    // Keep the best of every coarse region, then the rest by score.
    const all = [...next.values()].sort((x, y) => x.score - y.score)
    const kept: Node[] = []
    const seen = new Set<string>()
    const rest: Node[] = []
    for (const n of all) {
      const r = regionKey(n.w!)
      if (seen.has(r)) rest.push(n)
      else { seen.add(r); kept.push(n) }
    }
    for (const n of rest) {
      if (kept.length >= beam + seen.size) break
      kept.push(n)
    }
    layer = kept
  }
  if (first) return { ...(first as Solution), wins }
  if (opts.onFail) {
    const path: number[] = []
    for (let p: Node | null = best; p && p.a >= 0; p = p.parent) path.push(p.a)
    opts.onFail({ ...bestInfo, actions: path.reverse().join('') })
  }
  return null
}

/** How much precision a recorded win asks for. At every other decision of the win, each
 *  possible slip (any other action held for 0.3 s) is tried, then the best of six simple
 *  recoveries for 2 s; a slip no recovery survives is fatal. Returns the mean share of
 *  fatal slips along the route and the worst 2-second stretch of it. */
export const risk = (level: LevelDef, actions: string, t: Tuning = DEFAULT_TUNING, where?: { t: number; x: number; y: number; bad: number }[]): { mean: number; peak: number } => {
  const w = createWorld(level, tuningSize(t))
  const movP = w.platforms.map((p) => !!p.motion)
  const movH = w.hazards.map((h) => mutable(h))
  const samples: number[] = []
  for (let i = 0; i < actions.length && w.phase === 'play'; i++) {
    if (i % 2 === 0) {
      const acts = w.player.grounded ? 3 : ACTIONS
      let bad = 0
      for (let a = 0; a < acts; a++) {
        const slip = cloneWorld(w, movP, movH)
        for (let k = 0; k < 3; k++) playAction(slip, k ? a % 3 : a, t)
        if (slip.phase === 'win') continue
        let alive = false
        for (let r = 0; r < ACTIONS && !alive && slip.phase === 'play'; r++) {
          const c = cloneWorld(slip, movP, movH)
          for (let k = 0; k < 20 && c.phase === 'play'; k++) playAction(c, k ? r % 3 : r, t)
          alive = c.phase !== 'splat' && c.phase !== 'out'
        }
        if (!alive) bad++
      }
      samples.push(bad / acts)
      where?.push({ t: w.time, x: w.player.x, y: w.player.y + w.player.h, bad: bad / acts })
    }
    playAction(w, Number(actions[i]), t)
  }
  if (!samples.length) return { mean: 0, peak: 0 }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const win = samples.slice(i, i + 10)
    peak = Math.max(peak, win.reduce((a, b) => a + b, 0) / win.length)
  }
  return { mean, peak }
}

/** One level's entry in tests/umbrella/kite-solutions.json. */
export interface SolutionRecord {
  actions: string
  time: number
  nodes: number
  deathRate: number
  risk: number
  riskPeak: number
  beam: number
}

/** One number for how demanding a level is, from the bot's win:
 *  length (s / 10) + precision along the route (5 × mean share of fatal slips)
 *  + its hardest moment (2 × worst 2-second stretch) + how deadly the space around
 *  the route is (5 × share of explored moves that died). */
export const difficulty = (r: Pick<SolutionRecord, 'time' | 'risk' | 'riskPeak' | 'deathRate'>): number =>
  r.time / 10 + 5 * r.risk + 2 * r.riskPeak + 5 * r.deathRate
