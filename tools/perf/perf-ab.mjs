#!/usr/bin/env node
/**
 * perf-ab.mjs — interleaved A/B/A/B frame-time runner for the BUILT game (T0.3).
 *
 * Adapted from the web-game-performance-optimize skill's runner, but it needs no
 * probe inside the app: `lib/probe.js` is injected before the page's scripts,
 * `lib/pokiStub.js` stands in for the Poki SDK (the CDN script is blocked, so a
 * Poki build runs its own Poki code path without talking to Poki), and the save
 * the scene needs is seeded into localStorage before the app boots.
 *
 *   node tools/perf/perf-ab.mjs --dist <built dir> --scene early \
 *     --a "url:perf.pcIdle=clear" --b "url:perf.pcIdle=once" \
 *     --reps 3 --throttle 4 --out result.json
 *
 * Arm spec: comma-separated tokens
 *   url:<param>=<value>   URL query param (boot-frozen variant flags, e.g. perf.pcIdle)
 *   rec=1                 the recorder films the Poki playtest stage (pokiStub)
 *   stage=none            the SDK has no playtest API: the stage is never installed
 *   pauseInfinite=1       DIAGNOSTIC: pause every endless CSS/WAAPI animation
 * Options: --reps (per arm, default 3) --throttle (default 4) --viewport WxHxDPR
 *   (default 412x915x2) --seed (7) --warm ms --ms ms (scene defaults) --tap-every ms
 *   --shots <dir> (screenshots per rep) --dump-save <file> --save <file> (seed blob)
 *   --affinity <hex> (Windows, default FFFF = P-cores on an i9-13900HX; "none" to skip)
 *   --gpu (default: --disable-gpu, CPU-relative numbers only) --out <json> --label <text>
 *   --trace-ms <ms> (attribution: record a trace instead of the probe window and print
 *   main-thread self time per event name — lib/trace.mjs)
 *
 * Wrap it: node "$HOME/.claude/skills/worker-budget/budget.mjs" run --want 1 --min 1 -- node tools/perf/perf-ab.mjs …
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome, evaluate, sleep } from './lib/cdp.mjs'
import { serveDir, assertTitle } from './lib/serve.mjs'
import { SCENES } from './lib/scenes.mjs'
import { recordTrace, breakdown } from './lib/trace.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = argv[i + 1]
  return next === undefined || next.startsWith('--') ? true : next
}

const DIST = arg('dist')
if (!DIST || !existsSync(join(DIST, 'index.html'))) {
  console.error('perf-ab: --dist <built dir with index.html> is required')
  process.exit(2)
}
const SCENE_NAME = String(arg('scene', 'early'))
const SCENE = SCENES[SCENE_NAME]
if (!SCENE) { console.error(`perf-ab: unknown --scene ${SCENE_NAME} (${Object.keys(SCENES).join('|')})`); process.exit(2) }
const REPS = Number(arg('reps', 3))
const THROTTLE = Number(arg('throttle', 4))
const SEED = Number(arg('seed', 7))
const WARM_MS = Number(arg('warm', SCENE.warmMs))
const RUN_MS = Number(arg('ms', SCENE.ms))
const TAP_EVERY = Number(arg('tap-every', SCENE.tapEveryMs))
const SHOTS = arg('shots', null)
const DUMP_SAVE = arg('dump-save', null)
const SAVE_FILE = arg('save', null)
const OUT = arg('out', null)
const LABEL = arg('label', '')
const TRACE_MS = Number(arg('trace-ms', 0))
const GPU = arg('gpu', false) === true
const AFFINITY = String(arg('affinity', process.platform === 'win32' ? 'FFFF' : 'none'))
const [vw, vh, vdpr] = String(arg('viewport', '412x915x2')).split('x').map(Number)
const VIEWPORT = { width: vw || 412, height: vh || 915, dpr: vdpr || 2 }
const SPEC_A = arg('a', '') === true ? '' : String(arg('a', ''))
const SPEC_B = arg('b', null) === true ? '' : arg('b', null)
const ARMS = [['A', SPEC_A], ...(SPEC_B !== null ? [['B', String(SPEC_B)]] : [])]
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

const PROBE = readFileSync(join(HERE, 'lib', 'probe.js'), 'utf8')
const STUB = readFileSync(join(HERE, 'lib', 'pokiStub.js'), 'utf8')

const parseSpec = (spec) => {
  const url = {}
  const cfg = {}
  for (const raw of String(spec).split(',')) {
    const t = raw.trim()
    if (!t) continue
    if (t.startsWith('url:')) {
      const [k, v = 'on'] = t.slice(4).split('=')
      url[k] = v
    } else {
      const [k, v = '1'] = t.split('=')
      cfg[k] = v === '1' ? true : v === '0' ? false : v
    }
  }
  return { url, cfg }
}

const seedSaveScript = (blob) => `(() => {
  if (window.top !== window) return
  try {
    if (!sessionStorage.getItem('__perfSeeded')) {
      localStorage.clear()
      localStorage.setItem('umbrella_state', ${JSON.stringify(JSON.stringify(blob))})
      sessionStorage.setItem('__perfSeeded', '1')
    }
  } catch (e) {}
})()`

const sceneSave = () => {
  if (SAVE_FILE) return JSON.parse(readFileSync(SAVE_FILE, 'utf8'))
  return SCENE.save ? SCENE.save() : null
}

// ─── One rep ──────────────────────────────────────────────────────────────────
const runOnce = async (cdp, origin, label, spec, repIdx) => {
  const { url: urlParams, cfg } = parseSpec(spec)
  const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId, width: VIEWPORT.width, height: VIEWPORT.height })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const S = (m, p) => cdp.send(m, p, sessionId)
  try {
    await S('Page.enable')
    await S('Runtime.enable')
    await S('Network.enable')
    await S('Network.setBlockedURLs', { urls: ['*game-cdn.poki.com*', '*poki.io*', '*devs-api.poki.com*'] })
    await S('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: VIEWPORT.dpr, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } })
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await S('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA, platform: 'Linux armv8l' })
    if (THROTTLE > 1) await S('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
    await S('Performance.enable', { timeDomain: 'timeTicks' })
    const perfCfg = { seed: SEED, ...cfg }
    const save = sceneSave()
    await S('Page.addScriptToEvaluateOnNewDocument', { source: `window.__PERF_CFG = ${JSON.stringify(perfCfg)};` })
    if (save) await S('Page.addScriptToEvaluateOnNewDocument', { source: seedSaveScript(save) })
    await S('Page.addScriptToEvaluateOnNewDocument', { source: STUB })
    await S('Page.addScriptToEvaluateOnNewDocument', { source: PROBE })

    const u = new URL('/index.html', origin)
    for (const [k, v] of Object.entries(urlParams)) u.searchParams.set(k, v)
    const tNav = Date.now()
    await S('Page.navigate', { url: u.toString() })

    // Up: the splash resolved (the stub's gameLoadingFinished) and the board is laid out.
    const deadline = Date.now() + 90000
    let up = false
    while (Date.now() < deadline) {
      await sleep(400)
      up = await evaluate(cdp, sessionId, `(() => { const c = document.querySelector('.barrage-board__canvas'); return !!(window.__perfLoadedAt && c && c.getBoundingClientRect().width > 50) })()`).catch(() => false)
      if (up) break
    }
    if (!up) throw new Error('game never came up (no gameLoadingFinished / board)')
    const bootMs = Date.now() - tNav
    await sleep(SCENE.settleMs ?? 1500)
    const tap = await evaluate(cdp, sessionId, `(() => { const r = document.querySelector('.barrage-board__canvas').getBoundingClientRect(); return { x: r.left + r.width * ${SCENE.tap.fx}, y: r.top + r.height * ${SCENE.tap.fy} } })()`)
    const tapOnce = async () => {
      await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tap.x, y: tap.y, id: 1 }] })
      await sleep(45)
      await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    let driving = true
    let taps = 0
    const driver = (async () => {
      while (driving) {
        try { await tapOnce(); taps++ } catch { break }
        await sleep(TAP_EVERY)
      }
    })()

    await sleep(WARM_MS)
    if (TRACE_MS > 0) {
      // Attribution mode: a trace instead of the probe window.
      const events = await recordTrace(cdp, sessionId, TRACE_MS)
      driving = false
      await driver.catch(() => {})
      const bd = breakdown(events)
      const show = (role) => bd[role].slice(0, 16).map((x) => `      ${x.msPerFrame.toFixed(2).padStart(7)} ms/f  ${x.ms.toFixed(0).padStart(6)} ms  ${x.name}`).join('\n')
      console.log(`  ${label} r${repIdx} TRACE ${bd.frames} frames over ${bd.spanMs.toFixed(0)} ms\n    main thread (self time):\n${show('main')}\n    compositor:\n${show('compositor')}\n    raster:\n${show('raster')}`)
      return { label, spec, trace: bd, frames: bd.frames, delta: {}, work: {}, raf: {}, longTasks: {}, cdp: {}, cbs: [] }
    }
    await evaluate(cdp, sessionId, 'window.__perfProbe.start()')
    const m0 = await S('Performance.getMetrics')
    if (SHOTS) {
      await sleep(RUN_MS / 2)
      await shot(S, `${SHOTS}/${SCENE_NAME}-t${THROTTLE}-${label}-r${repIdx}-mid.jpg`)
      await sleep(RUN_MS / 2)
    } else {
      await sleep(RUN_MS)
    }
    const report = await evaluate(cdp, sessionId, 'window.__perfProbe.stop()')
    const m1 = await S('Performance.getMetrics')
    driving = false
    await driver.catch(() => {})
    const extra = await evaluate(cdp, sessionId, `({ rec: window.__perfRec || null, stage: !!window.__perfStage, gameplay: window.__perfGameplay || 0,
      nodes: document.getElementsByTagName('*').length, anims: document.getAnimations().length,
      infinite: document.getAnimations().filter((a) => a.effect && a.effect.getTiming && a.effect.getTiming().iterations === Infinity).length })`).catch(() => ({}))
    if (SHOTS) await shot(S, `${SHOTS}/${SCENE_NAME}-t${THROTTLE}-${label}-r${repIdx}-end.jpg`)
    if (DUMP_SAVE) {
      const blob = await evaluate(cdp, sessionId, `localStorage.getItem('umbrella_state')`)
      writeFileSync(DUMP_SAVE, blob || 'null')
    }
    const mm = (m) => Object.fromEntries(m.metrics.map((x) => [x.name, x.value]))
    const a = mm(m0)
    const b = mm(m1)
    const perFrame = (k) => (report.frames ? ((b[k] - a[k]) * 1000) / report.frames : 0)
    report.cdp = {
      taskMsPerFrame: perFrame('TaskDuration'),
      scriptMsPerFrame: perFrame('ScriptDuration'),
      layoutMsPerFrame: perFrame('LayoutDuration'),
      styleMsPerFrame: perFrame('RecalcStyleDuration'),
      threadMsPerFrame: perFrame('ThreadTime'),
      layouts: b.LayoutCount - a.LayoutCount,
      styleRecalcs: b.RecalcStyleCount - a.RecalcStyleCount,
      heapMB: b.JSHeapUsedSize / 1048576
    }
    report.bootMs = bootMs
    report.taps = taps
    report.extra = extra
    report.label = label
    report.spec = spec
    delete report.raw
    const r = report
    console.log(`  ${label} r${repIdx}  frame p50 ${r.delta.p50.toFixed(1)} p95 ${r.delta.p95.toFixed(1)} ms (>20ms ${r.delta.over20}) | work p50 ${r.work.p50.toFixed(2)} p95 ${r.work.p95.toFixed(2)} ms | lt ${r.longTasks.count} (${r.longTasks.totalMs.toFixed(0)} ms) | task ${r.cdp.taskMsPerFrame.toFixed(2)} script ${r.cdp.scriptMsPerFrame.toFixed(2)} style ${r.cdp.styleMsPerFrame.toFixed(2)} layout ${r.cdp.layoutMsPerFrame.toFixed(2)} ms/f (cpu ${r.cdp.threadMsPerFrame.toFixed(2)}) | fps ${r.fps.toFixed(1)} | rec ${extra.rec ? extra.rec.frames : '-'}`)
    return report
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {})
    await cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => {})
  }
}

const shot = async (S, file) => {
  try {
    const { data } = await S('Page.captureScreenshot', { format: 'jpeg', quality: 60 })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, Buffer.from(data, 'base64'))
  } catch (e) { console.log(`  (screenshot failed: ${e.message})`) }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}
const spreadPct = (xs) => { const m = median(xs); return m ? ((Math.max(...xs) - Math.min(...xs)) / m) * 100 : 0 }
const pick = (runs, path) => runs.map((r) => path.split('.').reduce((o, k) => o?.[k], r) ?? 0)

// ─── Main ─────────────────────────────────────────────────────────────────────
const main = async () => {
  const srv = await serveDir(resolve(DIST))
  const title = await assertTitle(`${srv.origin}/index.html`, /elemental[\s-]barrage/i)
  const chrome = await launchChrome({ affinity: AFFINITY === 'none' ? null : AFFINITY, gpu: GPU })
  const version = (await chrome.cdp.send('Browser.getVersion')).product
  console.log(`perf-ab ${LABEL} · scene ${SCENE_NAME} · ${REPS} reps/arm · warm ${WARM_MS} + ${RUN_MS} ms · CPU x${THROTTLE} · ${VIEWPORT.width}x${VIEWPORT.height}@${VIEWPORT.dpr} · seed ${SEED} · ${version} · ${GPU ? 'gpu' : 'no-gpu'} · affinity ${AFFINITY}`)
  console.log(`  serving ${resolve(DIST)} at ${srv.origin} ("${title}")`)
  for (const [l, s] of ARMS) console.log(`  ${l}: ${s || '(defaults)'}`)
  const runs = Object.fromEntries(ARMS.map(([l]) => [l, []]))
  let failed = 0
  try {
    for (let rep = 0; rep < REPS; rep++) {
      // Interleaved; the arm order alternates per rep (ABAB → AB BA AB) so neither
      // arm always runs first after a (possibly warmer) predecessor.
      const order = rep % 2 === 0 ? ARMS : [...ARMS].reverse()
      for (const [label, spec] of order) {
        try { runs[label].push(await runOnce(chrome.cdp, srv.origin, label, spec, rep + 1)) } catch (e) { failed++; console.log(`  ${label} r${rep + 1} FAILED: ${e.message}`) }
      }
    }
  } finally {
    await chrome.close()
    await srv.close()
  }

  const metrics = [
    ['frame p50', 'delta.p50', 'ms'], ['frame p95', 'delta.p95', 'ms'], ['frames >20ms', 'delta.over20', ''],
    ['work p50', 'work.p50', 'ms'], ['work p95 *', 'work.p95', 'ms'], ['work p99', 'work.p99', 'ms'],
    ['rAF script p95', 'raf.p95', 'ms'], ['long tasks', 'longTasks.count', ''], ['long task ms', 'longTasks.totalMs', 'ms'],
    ['task ms/frame', 'cdp.taskMsPerFrame', 'ms'], ['script ms/frame', 'cdp.scriptMsPerFrame', 'ms'],
    ['style ms/frame', 'cdp.styleMsPerFrame', 'ms'], ['layout ms/frame', 'cdp.layoutMsPerFrame', 'ms'], ['fps', 'fps', '']
  ]
  const summary = {}
  console.log('\n─── medians across reps (per-rep values in brackets) ───')
  for (const [name, path, unit] of metrics) {
    const cells = ARMS.map(([l]) => {
      const xs = pick(runs[l], path)
      summary[l] = summary[l] || {}
      summary[l][path] = { median: median(xs), spreadPct: spreadPct(xs), reps: xs }
      return `${l} ${median(xs).toFixed(2).padStart(8)}${unit} [${xs.map((x) => x.toFixed(1)).join(' ')}]`
    })
    console.log(`  ${name.padEnd(16)} ${cells.join('   ')}`)
  }
  let verdict = null
  if (ARMS.length === 2 && runs.A.length && runs.B.length) {
    const a = median(pick(runs.A, 'work.p95'))
    const b = median(pick(runs.B, 'work.p95'))
    const gain = a ? ((a - b) / a) * 100 : 0
    const noise = spreadPct(pick(runs.A, 'work.p95'))
    if (Math.abs(gain) < 3) verdict = `NULL — ${gain.toFixed(1)} % (< 3 %). Keep the simpler code.`
    else if (gain < 0) verdict = `WORSE — B is ${Math.abs(gain).toFixed(1)} % worse.`
    else if (gain >= 5 && gain > noise) verdict = `WIN — ${gain.toFixed(1)} % better, above the ${noise.toFixed(1)} % noise floor.`
    else if (gain >= 5) verdict = `INCONCLUSIVE — ${gain.toFixed(1)} % does not clear the ${noise.toFixed(1)} % noise floor.`
    else verdict = `GREY — ${gain.toFixed(1)} %: keep only if it removes complexity.`
    console.log(`\n  primary: work p95  A ${a.toFixed(2)} → B ${b.toFixed(2)} ms  (${gain >= 0 ? '-' : '+'}${Math.abs(gain).toFixed(1)} %), A spread ${noise.toFixed(1)} %`)
    console.log(`  VERDICT: ${verdict}`)
  }
  // Top rAF callbacks (median per-second cost) — which loop costs what.
  for (const [l] of ARMS) {
    const first = runs[l][0]
    if (!first) continue
    console.log(`\n  ${l} top rAF callbacks (rep 1): ${first.cbs.slice(0, 5).map((c) => `${c.key} ${c.perSec.toFixed(0)} ms/s mean ${c.mean.toFixed(2)} p95 ${c.p95.toFixed(2)}`).join(' | ')}`)
  }
  if (OUT) {
    mkdirSync(dirname(resolve(OUT)), { recursive: true })
    writeFileSync(OUT, JSON.stringify({ label: LABEL, scene: SCENE_NAME, throttle: THROTTLE, reps: REPS, warmMs: WARM_MS, runMs: RUN_MS, viewport: VIEWPORT, seed: SEED, chrome: version, gpu: GPU, affinity: AFFINITY, arms: ARMS, summary, verdict, failed, runs }, null, 2))
    console.log(`\n  JSON → ${OUT}`)
  }
  process.exit(failed && !Object.values(runs).every((r) => r.length) ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
