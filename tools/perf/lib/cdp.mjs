// ─── Own headless Chrome + a minimal CDP client (zero dependencies) ──────────
//
// Launches a PRIVATE Chrome (fresh --user-data-dir, random debugging port) —
// never the chrome-devtools MCP profile, never somebody's open browser.
//
// Windows, hybrid CPU (i9-13900HX: logical 0-15 = P-cores, 16-31 = E-cores):
// Chrome is started through `start /affinity` so the renderer's main thread can
// never land on an E-core mid-run. The mask applies at CreateProcess, so every
// child (the spare renderer included) inherits it. A throttled run whose main
// thread hops between core types swings 2x between reps (web-game-performance-
// optimize MEASURING.md, "a fast laptop's 4x throttle is not a phone's 4x").

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CHROME_PATH =
  process.env.CHROME_PATH ||
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : 'google-chrome')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * @param {{ profileRoot?: string, affinity?: string|null, gpu?: boolean, extraArgs?: string[] }} o
 */
export const launchChrome = async (o = {}) => {
  const port = 20000 + Math.floor(Math.random() * 20000)
  const userDataDir = mkdtempSync(join(o.profileRoot || tmpdir(), 'perf-chrome-'))
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    ...(o.gpu ? [] : ['--disable-gpu']),
    ...(o.extraArgs || []),
    'about:blank'
  ]
  let proc
  if (process.platform === 'win32' && o.affinity) {
    // cmd's `start` quoting: the empty "" is the window title.
    const line = `start "" /B /affinity ${o.affinity} "${CHROME_PATH}" ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`
    proc = spawn('cmd.exe', ['/d', '/s', '/c', line], { stdio: 'ignore', windowsVerbatimArguments: true })
  } else {
    proc = spawn(CHROME_PATH, args, { stdio: 'ignore' })
  }
  proc.on('error', (e) => { throw new Error(`cannot launch Chrome at ${CHROME_PATH}: ${e.message}`) })

  let wsUrl = null
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      wsUrl = (await res.json()).webSocketDebuggerUrl
    } catch { await sleep(250) }
  }
  if (!wsUrl) throw new Error('Chrome did not expose a CDP endpoint')
  const cdp = await connect(wsUrl)
  let browserPid = null
  try {
    const info = await cdp.send('SystemInfo.getProcessInfo')
    browserPid = info.processInfo.find((p) => p.type === 'browser')?.id ?? null
  } catch { /* older Chrome */ }
  const close = async () => {
    try { await cdp.send('Browser.close') } catch { /* already gone */ }
    cdp.close()
    if (browserPid && process.platform === 'win32') {
      await sleep(500)
      spawn('taskkill', ['/F', '/T', '/PID', String(browserPid)], { stdio: 'ignore' })
    }
    await sleep(800)
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* locked; temp anyway */ }
  }
  return { cdp, port, userDataDir, browserPid, close }
}

/** A flat-session CDP client over the browser WebSocket. */
export const connect = async (wsUrl) => {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true })
    ws.addEventListener('error', rej, { once: true })
  })
  let id = 0
  const pending = new Map()
  const listeners = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      clearTimeout(p.timer)
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`))
      else p.resolve(msg.result)
      return
    }
    const key = `${msg.sessionId || ''}|${msg.method}`
    for (const fn of listeners.get(key) || []) fn(msg.params)
    for (const fn of listeners.get(`*|${msg.method}`) || []) fn(msg.params, msg.sessionId)
  })
  const send = (method, params = {}, sessionId, timeoutMs = 120000) =>
    new Promise((resolve, reject) => {
      const mid = ++id
      const timer = setTimeout(() => {
        if (pending.delete(mid)) reject(new Error(`CDP timeout: ${method}`))
      }, timeoutMs)
      pending.set(mid, { resolve, reject, timer, method })
      ws.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }))
    })
  const on = (method, fn, sessionId = '*') => {
    const key = `${sessionId}|${method}`
    if (!listeners.has(key)) listeners.set(key, [])
    listeners.get(key).push(fn)
    return () => listeners.set(key, listeners.get(key).filter((f) => f !== fn))
  }
  const close = () => { try { ws.close() } catch { /* ignore */ } }
  return { send, on, close }
}

/** Evaluate an expression in a session; returns the value (JSON-able). */
export const evaluate = async (cdp, sessionId, expression, timeoutMs) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, timeoutMs)
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate failed')
  }
  return r.result?.value
}
