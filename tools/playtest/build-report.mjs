// Collect one run into <out>/data.json + <out>/shots/<pid>/*.jpg, next to the
// report page. Findings (the cross-tester synthesis) come from
// <run>/findings.json, written by hand after reading every report — the page
// never invents them. With --previous, the earlier run's headline numbers and
// findings ride along for the before/after view.
//   node tools/playtest/build-report.mjs --run playtest-runs/run-2 --previous playtest-runs/run-1 --out playtest-runs/run-2/report
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERSONAS } from './personas.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const RUN = path.resolve(arg('run'))
// One or more earlier runs, oldest first (`--previous run-1,run-2`); the last is
// the one this run's `followUp` statuses refer to.
const PREVS = (arg('previous') ?? '').split(',').filter(Boolean).map((p) => path.resolve(p))
const OUT = path.resolve(arg('out', path.join(RUN, 'report')))
const LABEL = arg('label', path.basename(RUN))
const MAX_SHOTS = 55 // 4 × 55 + page + data stays under the 255-file publish limit

const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return d } }
const base = (s) => path.basename(s)

const loadSession = (runDir, p, evidence) => {
  const dir = path.join(runDir, p.id)
  const report = readJson(path.join(dir, 'report.json'), {})
  const final = readJson(path.join(dir, 'final.json'), {})
  const lines = fs.existsSync(path.join(dir, 'timeline.jsonl'))
    ? fs.readFileSync(path.join(dir, 'timeline.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []
  const first = lines.find((l) => l.kind === 'first-shot')
  const timeline = lines.filter((l) => l.kind === 'action').map((l) => ({
    n: l.n, sec: l.play, action: l.action, args: l.args, fired: l.fired ?? null,
    shots: (l.shots ?? []).map(base),
    row: l.telemetry?.row, best: l.telemetry?.best, coins: l.telemetry?.coins, tray: l.telemetry?.tray,
    cap: l.telemetry?.cap, breached: l.telemetry?.breached, checkpoint: l.telemetry?.checkpoint,
    upgrades: l.telemetry?.upgrades, tut: l.telemetry?.tut, stats: l.telemetry?.stats, mute: l.telemetry?.mute ?? null
  }))
  const errors = lines.filter((l) => l.kind === 'console-error' || l.kind === 'page-error').map((l) => l.text)
  const volleys = final.telemetry?.stats?.volleys ?? 0
  // The counter is saved a beat after the shot, so credit the action that fired it.
  const firstShotSec = (() => {
    const i = timeline.findIndex((t) => (t.stats?.volleys ?? 0) > 0)
    if (i < 0) return null
    const act = timeline.slice(0, i + 1).reverse().find((t) => t.action === 'drag' || (t.action === 'tap' && t.fired))
    return (act ?? timeline[i]).sec
  })()
  const all = fs.existsSync(path.join(dir, 'shots')) ? fs.readdirSync(path.join(dir, 'shots')).sort() : []
  return {
    ...p, report, timeline, errors, all, dir,
    first: first ? base(first.shot) : null, finalShot: final.finalShot ? base(final.finalShot) : null,
    evidence: evidence.filter((e) => e.player === p.id).map((e) => e.shot),
    session: {
      playTimeSec: final.playTimeSec ?? null, wallSec: final.wallSec ?? null, reason: final.reason ?? null,
      actions: timeline.length, volleys, firstShotSec,
      misfires: Math.max(0, timeline.filter((t) => t.action === 'drag').length - volleys),
      taps: timeline.filter((t) => t.action === 'tap').length,
      final: final.telemetry ?? null
    }
  }
}

const findings = readJson(path.join(RUN, 'findings.json'), { summary: null, findings: [] })
const evidence = (findings.findings ?? []).flatMap((f) => f.evidence ?? [])
fs.rmSync(path.join(OUT, 'shots'), { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
fs.copyFileSync(path.join(HERE, 'report', 'index.html'), path.join(OUT, 'index.html'))

const players = PERSONAS.map((persona) => {
  const p = { id: persona.id, name: persona.name, role: persona.role, lang: persona.lang.slice(0, 2).toUpperCase(), hue: persona.hue }
  const s = loadSession(RUN, p, evidence)
  // Every frame a moment, bug or finding cites, the first and final frames,
  // the harness's paused-game moments (the merge lightbox), then an even
  // sample of the rest up to the cap.
  const cited = new Set([
    ...(s.report.moments ?? []).map((m) => m.shot), ...(s.report.bugs ?? []).map((b) => b.shot),
    s.first, s.finalShot, ...s.evidence, ...s.all.filter((f) => f.endsWith('-moment.jpg'))
  ].filter((f) => f && s.all.includes(f)))
  const rest = s.all.filter((f) => !cited.has(f))
  const room = Math.max(0, MAX_SHOTS - cited.size)
  const step = rest.length / Math.max(1, room)
  const sampled = rest.length <= room ? rest : Array.from({ length: room }, (_, i) => rest[Math.floor(i * step)])
  const shots = [...new Set([...cited, ...sampled])].sort()
  fs.mkdirSync(path.join(OUT, 'shots', p.id), { recursive: true })
  for (const f of shots) fs.copyFileSync(path.join(s.dir, 'shots', f), path.join(OUT, 'shots', p.id, f))
  return { ...p, report: s.report, shots, shotsTotal: s.all.length, timeline: s.timeline, errors: s.errors, session: s.session }
})

/** The daemons' own record of a run's budget (run 9+: 5 min, extended to 7
 *  for a tester who never lost); older runs don't log one (180 s). */
const startLogOf = (runDir) => {
  for (const p of PERSONAS) {
    const f = path.join(runDir, p.id, 'timeline.jsonl')
    if (!fs.existsSync(f)) continue
    const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.includes('"kind":"start"'))
    if (line) return JSON.parse(line)
  }
  return null
}
const budgetOf = (log) => ({ budgetSec: log?.budget ?? 180, maxBudgetSec: Math.max(log?.budget ?? 180, log?.extend ?? 0) })

const previous = PREVS.map((dir) => {
  const prevFindings = readJson(path.join(dir, 'findings.json'), { findings: [] })
  return {
    label: path.basename(dir),
    ...budgetOf(startLogOf(dir)),
    findings: (prevFindings.findings ?? []).map(({ id, severity, title }) => ({ id, severity, title })),
    players: PERSONAS.map((persona) => {
      const s = loadSession(dir, { id: persona.id }, [])
      return {
        id: persona.id, volleys: s.session.volleys, firstShotSec: s.session.firstShotSec,
        best: Math.max(s.session.final?.best ?? 0, s.session.final?.row ?? 1), reason: s.session.reason,
        ratings: s.report.ratings ?? null, wouldContinue: s.report.wouldContinueAfter3Min ?? null,
        controlsAt: s.report.understoodControlsAtSec ?? null,
        paidUpgrades: Object.entries(s.session.final?.upgrades ?? {}).reduce((a, [k, v]) => a + (k === 'capacity' ? Math.max(0, v - 1) : v), 0)
      }
    })
  }
})

const startLog = startLogOf(RUN)

const data = {
  meta: {
    game: 'Elemental Barrage', run: LABEL,
    build: '0.1.0 (production build, unobfuscated, leaderboard writes off)',
    date: new Date().toISOString().slice(0, 10), viewport: '390 × 844 phone (touch + iPhone user agent)',
    ...budgetOf(startLog), thinkSec: startLog?.think ?? 2, testers: 'Claude Sonnet agents, one per persona, each in its own headed Chrome'
  },
  summary: findings.summary, findings: findings.findings, followUp: findings.followUp ?? [], previous, players
}
fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(data))
console.log(players.map((p) => `${p.id}: ${p.shots.length}/${p.shotsTotal} shots, ${p.timeline.length} actions, report ${p.report.persona ? 'ok' : 'MISSING'}`).join('\n'))
console.log(`→ ${OUT}`)
