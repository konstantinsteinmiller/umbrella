// Blind-playtest driver: one headed Chrome per tester, phone-emulated, held by
// this long-lived process. Testers act through `pt.mjs` (HTTP); they get back
// screenshots and their remaining play time — nothing else. Game telemetry is
// logged to timeline.jsonl for the report only (see README.md).
//
//   node tools/playtest/pt-daemon.mjs --id p1-mia --cdp 9411 --api 9511 \
//     --url http://127.0.0.1:5320/ --out playtest-runs/run-2/p1 --x 0 [--lang en-US]
import http from 'node:http'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const ID = arg('id'), CDP = +arg('cdp'), API = +arg('api'), URL_ = arg('url'), OUT = path.resolve(arg('out'))
const WIN_X = +arg('x', 0), LANG = arg('lang', 'en-US')
// Play budget = each action's own duration + THINK seconds, so the tester's
// model latency never eats into it (a session holds about a human's turns).
const BUDGET = +arg('budget', 180), THINK = +arg('think', 2), WALLCAP = +arg('wallcap', 900)
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const W = 390, H = 844
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true })
const log = (o) => fs.appendFileSync(path.join(OUT, 'timeline.jsonl'), JSON.stringify(o) + '\n')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(OUT, 'profile')}`,
  `--window-position=${WIN_X},0`, `--window-size=424,${H + 60}`, `--lang=${LANG}`,
  '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
  '--disable-features=Translate,OptimizationHints',
  `--app=data:text/html,<title>${ID}</title><body style="background:%23070a14"></body>`
], { stdio: 'ignore' })
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(`http://127.0.0.1:${CDP}/json/version`); if (r.ok) break } catch { /* not up yet */ }
  await sleep(250)
}
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`)
const ctx = browser.contexts()[0]
const page = ctx.pages()[0] ?? await ctx.newPage()
// Emulation lives on this CDP session — it is why the driver is a daemon: a
// per-command process would drop the phone emulation every time it detached.
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, screenWidth: W, screenHeight: H })
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await cdp.send('Emulation.setUserAgentOverride', { userAgent: UA, acceptLanguage: LANG, platform: 'iPhone' })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); log({ kind: 'console-error', at: Date.now(), text: m.text() }) } })
page.on('pageerror', (e) => { errors.push(e.message); log({ kind: 'page-error', at: Date.now(), text: e.message }) })
await page.goto(URL_, { waitUntil: 'load' })
await sleep(4500)

const t0 = Date.now()
let play = 0, n = 0, ended = false, endReason = ''
const blob = async () => {
  try { return JSON.parse(await page.evaluate(() => localStorage.getItem('elemental-barrage_state')) || '{}') } catch { return {} }
}
const tele = (b) => {
  const run = b.eb_run?.snap ?? {}
  return {
    row: run.row ?? null, best: b.eb_best_row ?? 0, coins: b.epic_coins ?? 0, tray: run.tray ?? null,
    cap: run.config?.trayCapacity ?? null, breached: b.eb_run?.breached ?? false,
    checkpoint: b.eb_checkpoint?.row ?? 0, upgrades: b.eb_upgrades ?? null, stats: b.eb_stats ?? null,
    tut: b.eb_tutorial_step ?? null, coach: b.eb_coach ?? null, unlocks: b.eb_unlocks ?? null,
    // Run 1 saw the mobile mute switch on after the first tap and it would not
    // reproduce in isolation — logging it per action pins the exact action.
    mute: b.epic_mobile_mute ?? null
  }
}
const shot = async (tag) => {
  const f = `${String(++n).padStart(3, '0')}-${tag}.jpg`
  await page.screenshot({ path: path.join(OUT, 'shots', f), type: 'jpeg', quality: 80, scale: 'css' })
  return path.join(OUT, 'shots', f).split(path.sep).join('/')
}
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }]
})
const finish = async (reason) => {
  if (ended) return
  ended = true
  endReason = reason
  const end = await shot('final')
  const b = await blob()
  fs.writeFileSync(path.join(OUT, 'final.json'), JSON.stringify({
    id: ID, reason, playTimeSec: +play.toFixed(1), wallSec: +((Date.now() - t0) / 1000).toFixed(1),
    actions: n, errors, telemetry: tele(b), blob: b, finalShot: end
  }, null, 2))
  log({ kind: 'end', at: Date.now(), reason, play })
}
const act = async (name, fn, args) => {
  if (ended) return { ended: true, message: `Session over (${endReason}). Write your report now.` }
  if ((Date.now() - t0) / 1000 > WALLCAP) {
    await finish('wall-clock cap')
    return { ended: true, message: 'Session over (wall-clock cap). Write your report now.' }
  }
  const start = Date.now()
  const before = await blob()
  const res = await fn()
  const dur = (Date.now() - start) / 1000
  play += dur + THINK
  const after = await blob()
  const out = { shots: res.shots, playedSec: +play.toFixed(1), leftSec: +Math.max(0, BUDGET - play).toFixed(1) }
  log({ kind: 'action', at: Date.now(), n, action: name, args, dur, play: +play.toFixed(1), shots: res.shots, fired: res.fired, telemetry: tele(after), beforeRow: tele(before).row, muteBefore: tele(before).mute })
  if (play >= BUDGET) {
    await finish('3-minute play budget used')
    out.ended = true
    out.message = 'Your 3 minutes are up. Write your report now.'
  }
  return out
}
const actions = {
  shot: () => act('look', async () => ({ shots: [await shot('look')] })),
  wait: (ms) => act('wait', async () => {
    await sleep(Math.min(5000, Math.max(200, +ms || 1000)))
    return { shots: [await shot('wait')] }
  }, { ms: +ms }),
  tap: (x, y) => act('tap', async () => {
    const b0 = await blob()
    await touch('touchStart', +x, +y); await sleep(70); await touch('touchEnd')
    await sleep(550)
    const first = await shot('tap')
    // A tap can fire now (tap-to-shoot) — follow it to the end of the turn like a drag.
    const settled = await settleIfFired(b0)
    return settled ? { shots: [first, ...settled.moments, settled.after], fired: true } : { shots: [first], fired: false }
  }, { x: +x, y: +y }),
  drag: (x0, y0, x1, y1, ms) => act('drag', async () => {
    const steps = 16
    const d = Math.min(2000, Math.max(120, +ms || 400))
    const b0 = await blob()
    await touch('touchStart', +x0, +y0)
    for (let i = 1; i <= steps; i++) {
      await sleep(d / steps)
      await touch('touchMove', +x0 + (x1 - x0) * i / steps, +y0 + (y1 - y0) * i / steps)
    }
    await sleep(60)
    await touch('touchEnd')
    await sleep(550)
    const mid = await shot('volley')
    const settled = await settleIfFired(b0)
    return settled ? { shots: [mid, ...settled.moments, settled.after], fired: true } : { shots: [mid], fired: false }
  }, { x0: +x0, y0: +y0, x1: +x1, y1: +y1, ms: +ms || 400 }),
  end: async () => { await finish('player ended early'); return { ended: true, message: 'Session ended. Write your report now.' } }
}
// `volleys` bumps on the fire event; a short volley may already be over (the
// run snapshot is re-stamped every time the turn returns to aim).
//
// Moments: the merge lightbox pauses the game for a few seconds mid-volley, and
// in run 3 every one of them fell between the action's two stills — a human
// would have stared at it. While a turn settles, each lightbox that comes up
// gets one extra frame (≤ 2 per action), taken once it has staged the merge.
const MOMENT_SEL = '.merge-box'
const MOMENT_STAGE_MS = 500
async function settleIfFired (b0) {
  const v0 = b0.eb_stats?.volleys ?? 0
  const stamp0 = b0.eb_run?.stamp
  const moments = []
  let momentUp = false
  const peek = async () => {
    let up = false
    try {
      up = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        return !!el && el.getBoundingClientRect().width > 0
      }, MOMENT_SEL)
    } catch { /* navigating */ }
    if (up && !momentUp && moments.length < 2) {
      await sleep(MOMENT_STAGE_MS)
      moments.push(await shot('moment'))
    }
    momentUp = up
  }
  let fired = false
  let turnOver = false
  for (let i = 0; i < 8 && !fired; i++) {
    const b = await blob()
    turnOver = b.eb_run?.stamp !== stamp0
    fired = turnOver || (b.eb_stats?.volleys ?? 0) > v0
    if (!fired) await sleep(250)
  }
  if (!fired) return null
  await peek()
  for (let i = 0; i < 80 && !turnOver; i++) {
    await sleep(250)
    await peek()
    turnOver = (await blob()).eb_run?.stamp !== stamp0
  }
  await sleep(700)
  return { after: await shot('after'), moments }
}
log({ kind: 'start', at: t0, id: ID, url: URL_, lang: LANG, viewport: `${W}x${H}`, budget: BUDGET, think: THINK })
const first = await shot('start')
log({ kind: 'first-shot', at: Date.now(), shot: first, telemetry: tele(await blob()) })

let busy = Promise.resolve()
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const cmd = u.pathname.slice(1)
  const a = (u.searchParams.get('a') ?? '').split(',').filter(Boolean)
  busy = busy.then(async () => {
    let body
    try {
      if (cmd === 'hello') body = { shots: [first], playedSec: +play.toFixed(1), leftSec: +(BUDGET - play).toFixed(1), screen: `${W}x${H} — screenshot pixels are tap/drag coordinates` }
      else if (actions[cmd]) body = await actions[cmd](...a)
      else body = { error: `unknown command ${cmd}` }
    } catch (e) { body = { error: String(e?.message ?? e) } }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
}).listen(API, '127.0.0.1')
const stop = async () => { try { await finish('stopped') } catch { /* page gone */ } try { chrome.kill() } catch { /* already gone */ } process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
console.log(`[${ID}] ready on api ${API}`)
