#!/usr/bin/env node
/**
 * ─── Poki smoke test: the BUILT Poki bundle against a recording PokiSDK stub ──
 *
 *     node tools/qa/poki-smoke.mjs [--dist <dir>] [--keep]
 *
 * Builds `--mode poki` into a temp folder (every VITE_* stripped from the child's
 * env so the build gets exactly its own flags) unless `--dist` names one, serves
 * it on a random port, and drives it in a private headless Chrome with the real
 * Poki CDN blocked and a stub that records every SDK call. Ads take 1.5 s, like
 * a short video, so what happens UNDER them can be sampled.
 *
 * Asserts, for a returning player and then for a brand-new one (intro first):
 *   · gameLoadingFinished fires; no gameplayStart before the player touches anything;
 *   · exactly one gameplayStart after the click on "Click to play" (new player:
 *     only once the intro is over — the cutscene is not gameplay);
 *   · the pause menu stops gameplay and resumes it when it closes;
 *   · 20 clicks in a row on the "Level N" label request ONE rewarded ad, with
 *     gameplay stopped and every AudioContext suspended while it plays, and
 *     audio running + gameplay started again after it;
 *   · typing "cmunc" requests one interstitial, audio suspended under it and back after;
 *   · no console errors, and no request leaves the page's own origin (Poki allows none).
 * Exits 1 on any failure; always stops its server and browser.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate, launchChrome, sleep } from '../perf/lib/cdp.mjs'
import { assertTitle, serveDir } from '../perf/lib/serve.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const arg = (name) => { const i = process.argv.indexOf(name); return i > 1 ? process.argv[i + 1] : null }
const KEEP = process.argv.includes('--keep')

let failures = 0
const check = (label, ok, info) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${info === undefined ? '' : `  ${JSON.stringify(info)}`}`)
}

// ── The build ──
let dist = arg('--dist')
let tempDist = null
if (!dist) {
  tempDist = mkdtempSync(join(tmpdir(), 'poki-smoke-'))
  dist = tempDist
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_')))
  console.log(`building --mode poki → ${dist}`)
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'poki', '--base=./', `--outDir=${dist}`, '--emptyOutDir'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] })
  if (r.status !== 0) { console.error('build failed'); process.exit(1) }
}
// Fingerprint: only a Poki build carries the Poki SDK tag (and no CSP meta).
const html = readFileSync(join(dist, 'index.html'), 'utf8')
if (!/poki-sdk|game-cdn\.poki\.com/.test(html + readdirSync(join(dist, 'assets')).join(' '))) {
  console.error(`refusing to test: ${dist} is not a Poki build (no Poki SDK tag)`)
  process.exit(1)
}
check('Poki build ships no CSP meta tag', !/http-equiv=["']?Content-Security-Policy/i.test(html))

const STUB = `(() => {
  if (window.top !== window) return
  const log = window.__poki = { calls: [], under: [] }
  const ctxs = window.__ctxs = []
  const Native = window.AudioContext
  if (Native) {
    window.AudioContext = function (...a) { const c = new Native(...a); ctxs.push(c); return c }
    window.AudioContext.prototype = Native.prototype
    window.webkitAudioContext = window.AudioContext
  }
  const states = () => ctxs.map((c) => c.state)
  const note = (name) => log.calls.push(name)
  const ad = (name, result) => () => {
    note(name)
    return new Promise((res) => setTimeout(() => { log.under.push({ name, states: states(), calls: log.calls.slice() }); res(result) }, 1500))
  }
  const noop = () => {}
  window.PokiSDK = {
    init: () => { note('init'); return Promise.resolve() },
    gameLoadingFinished: () => note('gameLoadingFinished'),
    gameplayStart: () => note('gameplayStart'),
    gameplayStop: () => note('gameplayStop'),
    commercialBreak: ad('commercialBreak', undefined),
    rewardedBreak: ad('rewardedBreak', true),
    getLanguage: () => 'en', getURLParam: () => '', isAdBlocked: () => false,
    getDeviceInfo: () => ({ category: 'desktop' }),
    measure: noop, captureError: noop, movePill: noop, muteAd: noop, setVolume: noop, setDebug: noop,
    gameInteractive: noop, happyTime: noop, customEvent: noop, logError: noop, roundStart: noop, roundEnd: noop
  }
})()`

const seed = (blob) => `(() => { try { if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); ${blob ? `localStorage.setItem('umbrella_state', ${JSON.stringify(JSON.stringify(blob))});` : ''} sessionStorage.setItem('__seeded', '1') } } catch (e) {} })()`

const server = await serveDir(dist)
const chrome = await launchChrome({ extraArgs: ['--window-size=1280,720'] })
const { cdp } = chrome
try {
  await assertTitle(`${server.origin}/index.html`)

  const session = async (blob) => {
    const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true })
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId, width: 1280, height: 720 })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const S = (m, p) => cdp.send(m, p, sessionId)
    const errors = []
    // Poki forbids external runtime requests: everything but the (blocked) Poki SDK must come from this origin.
    const external = []
    cdp.on('Network.requestWillBeSent', (p) => {
      const u = p.request.url
      if (!u.startsWith(server.origin) && !/^(data|blob|about|chrome-extension):/.test(u) && !/poki\.(com|io)|poki-gdn\.com/.test(u)) external.push(u)
    }, sessionId)
    cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text), sessionId)
    cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' ')) }, sessionId)
    await S('Page.enable')
    await S('Runtime.enable')
    await S('Network.enable')
    await S('Network.setBlockedURLs', { urls: ['*game-cdn.poki.com*', '*poki.io*', '*devs-api.poki.com*', '*poki-gdn.com*'] })
    await S('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
    await S('Page.addScriptToEvaluateOnNewDocument', { source: seed(blob) })
    await S('Page.addScriptToEvaluateOnNewDocument', { source: STUB })
    await S('Page.navigate', { url: `${server.origin}/index.html` })
    const ev = (e) => evaluate(cdp, sessionId, e)
    const calls = () => ev('window.__poki.calls.slice()')
    const count = async (name) => (await calls()).filter((c) => c === name).length
    const box = (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return b && b.width ? [b.x + b.width / 2, b.y + b.height / 2] : null })()`)
    const click = async ([x, y]) => {
      await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    }
    const key = async (code, k, vk) => {
      await S('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk })
      await S('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk })
    }
    const waitFor = async (expr, ms = 60000) => {
      const end = Date.now() + ms
      while (Date.now() < end) { if (await ev(expr).catch(() => false)) return true; await sleep(250) }
      return false
    }
    return { S, ev, calls, count, box, click, key, waitFor, errors, external, close: () => cdp.send('Target.closeTarget', { targetId }) }
  }

  // ── A returning player (intro already seen) ──
  {
    const p = await session({ umb_intro_seen: true })
    const up = await p.waitFor('window.__poki.calls.includes("gameLoadingFinished") && !!document.querySelector(".start-screen")')
    check('returning: loading finished, "Click to play" on screen', up, await p.calls())
    await sleep(2500)
    check('returning: no gameplayStart before the player touches anything', (await p.count('gameplayStart')) === 0, await p.calls())
    await p.click(await p.box('.start-screen'))
    await sleep(1200)
    check('returning: one gameplayStart after the click', (await p.count('gameplayStart')) === 1, await p.calls())
    const intro = await p.ev('!!document.querySelector(".intro-skip") || !document.querySelector(".hud-level")')
    check('returning: straight into Level 1 (no intro)', !intro)

    // The pause menu.
    await p.key('Escape', 'Escape', 27)
    await sleep(500)
    check('pause menu stops gameplay', (await p.count('gameplayStop')) === 1 && (await p.ev('!!document.querySelector(".pause-back")')), await p.calls())
    await p.key('Escape', 'Escape', 27)
    await sleep(500)
    check('closing it starts gameplay again', (await p.count('gameplayStart')) === 2, await p.calls())

    // The rewarded chord: 20 clicks in a row on the level label.
    await sleep(500)
    const ctxBefore = await p.ev('window.__ctxs.map((c) => c.state)')
    const label = await p.box('.hud-level')
    for (let i = 0; i < 20; i++) { await p.click(label); await sleep(120) }
    await sleep(400)
    check('20 clicks on the level label request one rewarded ad', (await p.count('rewardedBreak')) === 1, await p.calls())
    await sleep(1600)
    const under = (await p.ev('window.__poki.under.slice()')).find((u) => u.name === 'rewardedBreak')
    const before = under?.calls.slice(0, under.calls.lastIndexOf('rewardedBreak')) ?? []
    check('gameplay stopped before the rewarded ad', before.lastIndexOf('gameplayStop') > before.lastIndexOf('gameplayStart'), before)
    check('every AudioContext suspended while it plays', !!under && under.states.length > 0 && under.states.every((s) => s === 'suspended'), { before: ctxBefore, under: under?.states })
    await sleep(800)
    const after = await p.ev('window.__ctxs.map((c) => c.state)')
    check('audio running again after it', after.length > 0 && after.every((s) => s === 'running'), after)
    const last = (await p.calls()).filter((c) => c.startsWith('gameplay')).at(-1)
    check('gameplay started again after it', last === 'gameplayStart', await p.calls())
    check('no death interstitial in the first minutes', (await p.count('commercialBreak')) === 0, await p.calls())

    // Typing "cmunc" requests an interstitial at once.
    for (const ch of 'cmunc') {
      await p.S('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) })
      await p.S('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code: `Key${ch.toUpperCase()}`, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) })
    }
    await sleep(600)
    check('typing cmunc requests one interstitial', (await p.count('commercialBreak')) === 1, await p.calls())
    await sleep(1700)
    const underI = (await p.ev('window.__poki.under.slice()')).find((u) => u.name === 'commercialBreak')
    check('every AudioContext suspended under the interstitial', !!underI && underI.states.length > 0 && underI.states.every((s) => s === 'suspended'), underI?.states)
    await sleep(600)
    const afterI = await p.ev('window.__ctxs.map((c) => c.state)')
    check('audio running again after the interstitial', afterI.length > 0 && afterI.every((s) => s === 'running'), afterI)
    check('returning: no console errors', p.errors.length === 0, p.errors.slice(0, 3))
    check('no external requests (Poki allows none)', p.external.length === 0, p.external.slice(0, 5))
    await p.close()
  }

  // ── A brand-new player: the intro plays first ──
  {
    const p = await session(null)
    await p.waitFor('window.__poki.calls.includes("gameLoadingFinished") && !!document.querySelector(".start-screen")')
    await p.click(await p.box('.start-screen'))
    await sleep(2500)
    check('new player: the intro is not gameplay (no gameplayStart under it)', (await p.count('gameplayStart')) === 0, await p.calls())
    await p.key('Escape', 'Escape', 27) // Esc ends the intro
    await sleep(1200)
    check('new player: one gameplayStart once the intro is over', (await p.count('gameplayStart')) === 1 && (await p.ev('!!document.querySelector(".hud-level")')), await p.calls())
    check('new player: no console errors', p.errors.length === 0, p.errors.slice(0, 3))
    await p.close()
  }
} finally {
  await chrome.close()
  await server.close()
  if (tempDist && !KEEP) rmSync(tempDist, { recursive: true, force: true })
}
console.log(failures ? `${failures} check(s) failed` : 'all Poki smoke checks passed')
process.exit(failures ? 1 : 0)
