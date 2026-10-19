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
// `--headless 1`: for testing the harness itself (real runs are headed windows).
const HEADLESS = arg('headless', '0') === '1'
// Play budget = each action's own duration + THINK seconds, so the tester's
// model latency never eats into it (a session holds about a human's turns).
// `--extend` (run 9): a tester who has not lost by BUDGET plays on to EXTEND —
// "5 minutes, or up to 7 if the player never dies".
const BUDGET = +arg('budget', 180), EXTEND = +arg('extend', 0), THINK = +arg('think', 2), WALLCAP = +arg('wallcap', 900)
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
  // Run 11: four windows of game audio on the desktop got muted by hand
  // through the game's own speaker button, and every tester filed "the sound
  // muted itself". The testers never hear anything: the windows stay silent,
  // the in-game mute stays theirs.
  '--mute-audio',
  `--app=data:text/html,<title>${ID}</title><body style="background:%23070a14"></body>`,
  ...(HEADLESS ? ['--headless=new'] : [])
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
// Hold between actions (run 4: the game ran in real time while a tester's model
// thought for 10–20 s, so the flying chest was gone before any tap landed —
// a human gets ~13 s). Outside an action the page reports itself hidden and the
// game's own visibility pause stops the sim; each action resumes it. Play time
// already counts only action time + THINK, so game time now matches it.
await page.evaluate(() => {
  window.__ptHidden = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__ptHidden ? 'hidden' : 'visible') })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => !!window.__ptHidden })
})
const hold = async (on) => {
  try { await page.evaluate((h) => { window.__ptHidden = h; document.dispatchEvent(new Event('visibilitychange')) }, on) } catch { /* navigating */ }
}

const t0 = Date.now()
let play = 0, n = 0, ended = false, endReason = ''
/** The tester has lost at least once (a breach seen in the save). */
let lost = false
/** Play time of the first loss (run 9: Dev lost at 327 s and the session ended
 *  on that very action, so he never saw the recap screen). */
let lostAt = 0
/** Play seconds granted after a loss that lands past BUDGET, to see its aftermath. */
const GRACE = 30
/** The budget in force: BUDGET, or EXTEND for a tester who has not lost yet. */
const budgetNow = () => {
  if (EXTEND <= BUDGET) return BUDGET
  return lost ? Math.min(EXTEND, Math.max(BUDGET, lostAt + GRACE)) : EXTEND
}
const blob = async () => {
  try { return JSON.parse(await page.evaluate(() => localStorage.getItem('umbrella_state')) || '{}') } catch { return {} }
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
// Run 7: teaching that plays while the tester thinks. The hold pauses the
// sim, not the DOM — an unlock's fly-in (a calm aim phase, often starting
// right as the hold begins) ran unseen, so new HUD icons "silently appeared".
// While held, a fresh `[data-coach-live]` sentence gets a moment frame too
// (≤ 2 per hold); they ride along at the front of the next action's shots.
const heldMoments = []
let heldTimer = null
let heldBusy = false
const watchHeld = (on) => {
  if (heldTimer) { clearInterval(heldTimer); heldTimer = null }
  if (!on) return
  heldTimer = setInterval(async () => {
    if (heldBusy || ended || heldMoments.length >= 2) return
    heldBusy = true
    try {
      const said = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent.trim()).filter(Boolean), LESSON_SEL)
      const fresh = said.filter((t) => !lessonsSeen.has(t))
      for (const t of said) lessonsSeen.add(t)
      if (fresh.length) {
        await sleep(LESSON_STAGE_MS)
        heldMoments.push(await shot('moment'))
      }
    } catch { /* navigating */ } finally { heldBusy = false }
  }, 300)
}
const stopHeldWatch = async () => {
  watchHeld(false)
  for (let i = 0; i < 40 && heldBusy; i++) await sleep(50)
  return heldMoments.splice(0)
}
const finish = async (reason) => {
  if (ended) return
  ended = true
  await stopHeldWatch()
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
  const held = await stopHeldWatch()
  await hold(false)
  const start = Date.now()
  const before = await blob()
  const res = await fn()
  res.shots = [...held, ...res.shots]
  const dur = (Date.now() - start) / 1000
  play += dur + THINK
  const after = await blob()
  const ta = tele(after)
  const budgetBefore = budgetNow()
  if (!lost && (ta.breached || (ta.unlocks?.losses ?? 0) > 0)) { lost = true; lostAt = play }
  await hold(true)
  watchHeld(true)
  const out = { shots: res.shots, playedSec: +play.toFixed(1), leftSec: +Math.max(0, budgetNow() - play).toFixed(1) }
  // Run 9: two testers read the budget's drop from 7 to 5 minutes as the game
  // skipping ~2 minutes in one tap, so say it in the response itself.
  if (budgetNow() < budgetBefore) out.note = `Session length: you lost a run, so your session is now ${Math.round(budgetNow())} s of play in total instead of ${Math.round(budgetBefore)} s, and leftSec dropped by that difference. Only this timer changed; the game itself skipped no time.`
  log({ kind: 'action', at: Date.now(), n, action: name, args, dur, play: +play.toFixed(1), shots: res.shots, fired: res.fired, telemetry: tele(after), beforeRow: tele(before).row, muteBefore: tele(before).mute })
  if (play >= budgetNow()) {
    await finish(`${Math.round(budgetNow() / 60)}-minute play budget used`)
    out.ended = true
    out.message = 'Your play time is up. Write your report now.'
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
// Moments — teaching that only exists in motion, which a tester reading two
// stills per action never sees (runs 3–4):
//   • the merge lightbox pauses the game for a few seconds mid-volley;
//   • a coach lesson plays at the start of an aim phase, i.e. while the
//     tester is thinking (and an unlock's fly-in during the hold: watchHeld);
//   • the death sequence's "WASTED" (run 7) holds ~2 s before the death screen.
// While a turn settles and for a moment after it, each lightbox that comes up
// and the FIRST showing of each distinct coach lesson (its sr-only sentence,
// compared as text, so any language works; `[data-coach-live]`) get one extra
// frame, ≤ 2 per action.
// A lightbox also proves the shot fired: a paused volley can hold back the
// save that the counter check reads.
// Run 9: the first "+1" spotlight (`.pickup-box`) pauses the game too; it ran
// out during the fire check (the paused volley never reached the save) and no
// tester saw it. It now counts as a lightbox with two frames: the "+1" in
// flight under the spotlight, then the ball it became in the tray.
// After run 11: the spotlight lessons (`.lesson-spot` — the launcher's
// countdown, the speed / luck / bounty chips) pause the game for 3–5 s too; two
// frames each, the demo's first act and its payoff.
const MOMENT_SEL = '.merge-box, .pickup-box, .lesson-spot'
const STAGED = [['.pickup-box', [450, 900]], ['.lesson-spot', [900, 1400]]]
// The coach's own live regions only (run 5 keyed on every sr-only live region
// and took 68 moment frames — coin and HUD announcements included).
const LESSON_SEL = '[data-coach-live]'
const MOMENT_STAGE_MS = 500
const LESSON_STAGE_MS = 800
const LESSON_WATCH_MS = 1000
const lessonsSeen = new Set()
async function settleIfFired (b0) {
  const v0 = b0.eb_stats?.volleys ?? 0
  const stamp0 = b0.eb_run?.stamp
  const moments = []
  let momentUp = false
  let sawBox = false
  const probe = () => page.evaluate(([sel, lessonSel, stagedSels]) => {
    const el = document.querySelector(sel)
    const box = !!el && el.getBoundingClientRect().width > 0
    const staged = box ? stagedSels.findIndex((s) => el.matches(s)) : -1
    const said = [...document.querySelectorAll(lessonSel)].map((n) => n.textContent.trim()).filter(Boolean)
    return { box, staged, said }
  }, [MOMENT_SEL, LESSON_SEL, STAGED.map(([sel]) => sel)])
  const peek = async (lessons) => {
    let p = { box: false, staged: -1, said: [] }
    try { p = await probe() } catch { /* navigating */ }
    if (p.box) sawBox = true
    if (p.box && !momentUp && moments.length < 2) {
      for (const ms of p.staged >= 0 ? STAGED[p.staged][1] : [MOMENT_STAGE_MS]) {
        if (moments.length >= 2) break
        await sleep(ms)
        moments.push(await shot('moment'))
      }
    }
    momentUp = p.box
    if (!lessons) return
    const fresh = p.said.filter((s) => !lessonsSeen.has(s))
    for (const s of p.said) lessonsSeen.add(s)
    if (fresh.length && moments.length < 2) {
      await sleep(LESSON_STAGE_MS)
      moments.push(await shot('moment'))
    }
  }
  let fired = false
  let turnOver = false
  for (let i = 0; i < 12 && !fired; i++) {
    const b = await blob()
    turnOver = b.eb_run?.stamp !== stamp0
    await peek(false)
    fired = turnOver || sawBox || (b.eb_stats?.volleys ?? 0) > v0
    if (!fired) await sleep(250)
  }
  if (!fired) return null
  for (let i = 0; i < 80 && !turnOver; i++) {
    await sleep(250)
    await peek(false)
    turnOver = (await blob()).eb_run?.stamp !== stamp0
  }
  // The new aim phase: a lesson that opens it is on screen now.
  for (let t = 0; t < LESSON_WATCH_MS && moments.length < 2; t += 250) {
    await peek(true)
    await sleep(250)
  }
  return { after: await shot('after'), moments }
}
// Lessons already on screen at the first frame count as seen (the start shot
// shows them), so only later ones earn a moment.
const seedLessons = async () => {
  try {
    const said = await page.evaluate((lessonSel) => [...document.querySelectorAll(lessonSel)].map((n) => n.textContent.trim()).filter(Boolean), LESSON_SEL)
    for (const s of said) lessonsSeen.add(s)
  } catch { /* not ready */ }
}
log({ kind: 'start', at: t0, id: ID, url: URL_, lang: LANG, viewport: `${W}x${H}`, budget: BUDGET, extend: EXTEND, think: THINK })
const first = await shot('start')
await seedLessons()
await hold(true)
watchHeld(true)
log({ kind: 'first-shot', at: Date.now(), shot: first, telemetry: tele(await blob()) })

let busy = Promise.resolve()
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  const cmd = u.pathname.slice(1)
  const a = (u.searchParams.get('a') ?? '').split(',').filter(Boolean)
  busy = busy.then(async () => {
    let body
    try {
      if (cmd === 'hello') body = { shots: [first], playedSec: +play.toFixed(1), leftSec: +(budgetNow() - play).toFixed(1), screen: `${W}x${H} — screenshot pixels are tap/drag coordinates` }
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
