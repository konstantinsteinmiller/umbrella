/**
 * ─── Mute regression check for the umbrella audio ───────────────────────────
 *
 * Plays the real game in a PRIVATE headless Chrome (own profile, own debugging
 * port, no autoplay override — gestures are real CDP key events) against its
 * own Vite dev server on a random port, flips the real pause / mute gates and
 * reads `audioDebug()` from src/umbrella/audio.ts — the context state, the
 * last gain stage, ringing one-shots and the RMS the speakers actually get.
 *
 *     node scripts/sfx/umbrella-mute-check.mjs
 *
 * Asserts: silence before the first gesture; score + wind after it; silence
 * and no new one-shots under an ad, a hidden tab, a platform pause and a
 * portal mute (with the game still running); sound back after each; the
 * last gain stage silencing a RUNNING context on its own; and a
 * first gesture made DURING an ad does not start the score until it closes.
 * Exits 1 on any failure. Stops its server and browser either way.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const port = 20000 + Math.floor(Math.random() * 20000)
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port, strictPort: true, host: '127.0.0.1', hmr: false } })
await server.listen()
const base = `http://127.0.0.1:${port}/`

const cdpPort = 40000 + Math.floor(Math.random() * 20000)
const profile = mkdtempSync(join(tmpdir(), 'umbrella-mute-'))
const chrome = spawn(CHROME, [
  `--remote-debugging-port=${cdpPort}`, '--headless=new', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank'
], { stdio: 'ignore' })

let failures = 0
const check = (label, ok, detail) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${JSON.stringify(detail)}` : ''}`)
}

try {
  let version = null
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json() } catch { await sleep(200) }
  }
  if (!version) throw new Error('Chrome did not open its debugging port')
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }) })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    const p = msg.id && pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result)
  })
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { resolve: res, reject: rej })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })

  /** A fresh tab on the game; returns helpers bound to it. */
  const openGame = async () => {
    const { targetId } = await send('Target.createTarget', { url: base })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!document.querySelector("canvas.umbrella-canvas")').catch(() => false)) break
      await sleep(200)
    }
    const key = async (code, keyName = code, vk = 0) => {
      for (const type of ['keyDown', 'keyUp']) {
        await send('Input.dispatchKeyEvent', { type, code, key: keyName, windowsVirtualKeyCode: vk }, sessionId)
      }
    }
    // The game opens on a whole-screen "Click to play": that click is the first gesture.
    const clickPlay = async () => {
      const r = await evaluate('(() => { const b = document.querySelector(".start-screen")?.getBoundingClientRect(); return b ? [b.x + b.width / 2, b.y + b.height / 2] : null })()')
      if (!r) return
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 }, sessionId)
      }
    }
    // Same module instances the app uses (Vite serves one URL per module).
    const snap = () => evaluate('import("/src/umbrella/audio.ts").then((m) => m.audioDebug())')
    const gate = (mod, expr) => evaluate(`import("/src/use/${mod}.ts").then((m) => { ${expr} })`)
    return { targetId, evaluate, key, clickPlay, snap, gate }
  }

  // ── Run 1: the normal session ──
  const g = await openGame()
  const title = await g.evaluate('document.title')
  check('served page is the umbrella game', title === 'umbrella', { title })
  if (title !== 'umbrella') throw new Error('wrong app on this port')

  await sleep(1500)
  let s = await g.snap()
  check('silent before the first gesture (no score, nothing audible)', !s.music && s.rms === 0, s)

  await g.clickPlay()
  await sleep(4000)
  s = await g.snap()
  check('first gesture starts score + wind on a running context (music only when MUSIC_ENABLED)', s.state === 'running' && (s.music || !s.musicEnabled) && s.rms > 1e-4, s)

  // Control first: gameplay events really do sound when nothing is muted.
  await g.key('Space', ' ', 32)
  await sleep(60)
  s = await g.snap()
  check('control: Space (umbrella toggle) plays a one-shot', s.voices > 0, s)
  await sleep(1500)

  const muted = async (label, on, off) => {
    await on()
    await sleep(250)
    let m = await g.snap()
    await g.key('Space', ' ', 32) // toggles the umbrella when the sim runs
    await g.evaluate('import("/src/umbrella/audio.ts").then((m) => { m.playSfx("splat"); m.playSfx("win") })')
    await sleep(300)
    m = await g.snap()
    check(`${label}: context suspended, audio gate shut, no one-shot started`,
      m.state === 'suspended' && m.muted && m.voices === 0, m)
    await off()
    await sleep(1500)
    m = await g.snap()
    check(`${label}: sound back after it clears`, m.state === 'running' && !m.muted && m.rms > 1e-4, m)
  }
  await muted('ad on screen',
    () => g.gate('useGamePause', 'm.isAdShowing.value = true'),
    () => g.gate('useGamePause', 'm.isAdShowing.value = false'))
  await muted('tab hidden',
    () => g.gate('useGamePause', 'm.isVisibilityHidden.value = true'),
    () => g.gate('useGamePause', 'm.isVisibilityHidden.value = false'))
  await muted('platform pause',
    () => g.gate('useGamePause', 'm.pauseGame()'),
    () => g.gate('useGamePause', 'm.resumeGame()'))
  await muted('portal mute (game keeps running)',
    () => g.gate('useGamePauseAudio', 'm.setPlatformAudioMuted(true)'),
    () => g.gate('useGamePauseAudio', 'm.setPlatformAudioMuted(false)'))

  // A menu (the pause menu, opened with Esc like a player does) silences music and sounds through the
  // last gain stage — the context keeps running — and they come back when it closes.
  await g.key('Escape', 'Escape', 27)
  await sleep(400)
  s = await g.snap()
  const menuUp = await g.evaluate('!!document.querySelector(".pause-back")')
  check('pause menu: open, music and sounds silent', menuUp && s.muted && s.rms < 1e-5 && s.voices === 0, { menuUp, ...s })
  await g.key('Escape', 'Escape', 27)
  await sleep(1500)
  s = await g.snap()
  check('pause menu: sound back after it closes', !s.muted && s.rms > 1e-4, s)

  // The second layer alone: mute only the last gain stage, leave the context
  // running (as if the suspend never landed) — the speakers must still go silent.
  await g.evaluate('import("/src/umbrella/audio.ts").then((m) => { m.setAudioMuted(true); m.playSfx("splat") })')
  await sleep(400)
  s = await g.snap()
  check('gain stage alone silences a running context', s.state === 'running' && s.muteGain < 1e-3 && s.rms < 1e-5 && s.voices === 0, s)
  await g.evaluate('import("/src/umbrella/audio.ts").then((m) => m.setAudioMuted(false))')
  await sleep(1000)
  s = await g.snap()
  check('…and fades back in when it clears', s.muteGain > 0.99 && s.rms > 1e-4, s)

  // A one-shot ringing when the ad opens is cut, not frozen to tail later.
  await g.evaluate('import("/src/umbrella/audio.ts").then((m) => m.playSfx("win"))')
  await sleep(100)
  const ringing = (await g.snap()).voices
  await g.gate('useGamePause', 'm.isAdShowing.value = true')
  await sleep(250)
  await g.gate('useGamePause', 'm.isAdShowing.value = false')
  await sleep(400)
  s = await g.snap()
  check('a sound ringing when the ad opened does not resume after it', ringing > 0 && s.voices === 0, { ringing, after: s.voices })
  await send('Target.closeTarget', { targetId: g.targetId })

  // ── Run 2: the first gesture happens under an ad ──
  const h = await openGame()
  await sleep(1000)
  await h.gate('useGamePause', 'm.isAdShowing.value = true')
  await h.clickPlay()
  await sleep(1500)
  s = await h.snap()
  check('gesture under an ad: nothing audible, score not started', s.rms === 0 && s.state !== 'running', s)
  await h.gate('useGamePause', 'm.isAdShowing.value = false')
  await sleep(3000)
  s = await h.snap()
  check('…score and wind start once the ad closes (music only when MUSIC_ENABLED)', s.state === 'running' && (s.music || !s.musicEnabled) && s.rms > 1e-4, s)

  try { await send('Browser.close') } catch { /* going */ }
  ws.close()
} catch (e) {
  failures++
  console.error(e)
} finally {
  chrome.kill()
  await server.close()
  await sleep(400)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Windows may hold a lock briefly */ }
}
console.log(failures ? `${failures} check(s) failed` : 'all mute checks passed')
process.exit(failures ? 1 : 0)
