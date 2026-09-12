#!/usr/bin/env node
/**
 * Drive the art bench's "Export all sheets" in a private headless Chrome.
 *
 *   pnpm art:export                       # against http://localhost:2050/#/art-sheets (pnpm dev)
 *   pnpm art:export http://localhost:2193/#/art-sheets
 *   (every drawable here is already one file per object — there is no singles mode)
 *
 * Start a dev server first (`pnpm dev`, or `npx vite --port 2193 --strictPort`). The bench
 * writes into `art-sheets/` through the dev server's own POST endpoint, so
 * this only has to press the button and wait.
 *
 * Own profile, own port — never the shared debugging profile, which belongs
 * to whatever the user has open; two clients on one profile deadlock.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const SINGLES = args.includes('--singles')
const APP = args.find((a) => a.startsWith('http')) ?? 'http://localhost:2050/#/art-sheets'
const PORT = 9700 + Math.floor(Math.random() * 200)
const PROFILE = mkdtempSync(join(tmpdir(), 'maw-art-'))

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find((p) => existsSync(p))
if (!CHROME) { console.error('no chrome'); process.exit(1) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const child = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--window-size=1400,1000',
  APP
], { stdio: 'ignore', detached: false })

const cleanup = () => {
  try { child.kill() } catch { /* already gone */ }
  try { rmSync(PROFILE, { recursive: true, force: true }) } catch { /* locked */ }
}

let ws
try {
  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500)
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.url.includes('/art-sheets'))
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('no art-sheets page target — is the dev server up at that URL?')

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no })

  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  const send = (method, params = {}) => new Promise((ok) => {
    const n = ++id
    pending.set(n, ok)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
    }
    return r.result?.result?.value
  }

  await send('Runtime.enable')
  await send('Page.enable')

  // The splash sits in front of every route for a couple of seconds; the bench
  // mounts behind it and its bar is what we wait for.
  for (let i = 0; i < 90; i++) {
    const ready = await evaluate("!!document.querySelector('.art-sheets .bar button')")
    if (ready) break
    await sleep(1000)
  }
  const heading = await evaluate("document.querySelector('.art-sheets h1')?.textContent ?? ''")
  console.log(`page: ${await evaluate('document.title')} / ${heading}`)
  if (!heading.includes('Art sheets')) throw new Error('not the art bench')

  if (SINGLES) {
    await evaluate(`(() => {
      const box = document.querySelector('.art-sheets .bar input[type=checkbox]');
      if (box && !box.checked) box.click();
      return !!box;
    })()`)
    console.log('singles: on')
  }

  const label = await evaluate(`(() => {
    const b = [...document.querySelectorAll('.art-sheets .bar button')].find((x) => /Export all/i.test(x.textContent));
    if (!b) return null;
    b.click();
    return b.textContent.trim();
  })()`)
  if (label === null) throw new Error('no export button')
  console.log('clicked:', label)

  // Poll for the STATUS string, not just the button re-enabling: a page that
  // reloads mid-export resets `busy` and looks like success having written nothing.
  let last = ''
  const started = Date.now()
  for (;;) {
    await sleep(1500)
    const st = await evaluate(`(() => {
      const s = document.querySelector('.art-sheets .bar .status');
      const b = document.querySelector('.art-sheets .bar button');
      return JSON.stringify({ status: s ? s.textContent.trim() : '', busy: b ? b.disabled : false });
    })()`)
    const { status, busy } = JSON.parse(st)
    if (status && status !== last) { console.log('  ·', status); last = status }
    if (!busy && /wrote|FAILED/.test(status)) { console.log('DONE:', status); break }
    if (Date.now() - started > 20 * 60 * 1000) throw new Error('timed out')
  }
  if (/FAILED/i.test(last)) { console.error('EXPORT FAILED:', last); process.exitCode = 1 }
} catch (err) {
  console.error('ERROR:', err.message)
  process.exitCode = 1
} finally {
  try { ws?.close() } catch { /* closed */ }
  cleanup()
}
