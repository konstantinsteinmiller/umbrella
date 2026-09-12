/**
 * ─── Shared render + mastering chain for the synthesised SFX ────────────────
 *
 * Every synth-graph sound in this folder goes through the same four steps:
 * render the graph in a PRIVATE headless Chrome (its own temp profile and
 * debugging port — it never touches a browser someone else has open), match a
 * loudness target, limit the true peak, encode the Vorbis file the game plays.
 * `render-new-tier-reveal.mjs` and `render-arena-skills.mjs` both use this.
 *
 * Needs Chrome (`CHROME=…` to override the path) and ffmpeg with libvorbis
 * (`FFMPEG=…`). Build-time only; nothing here ships.
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FFMPEG, describe, loudness } from './sfx-stats.mjs'

export const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Open `synthHtml` in a private headless Chrome and hand `fn` an evaluator. */
export const withChrome = async (synthHtml, fn) => {
  const port = 10000 + Math.floor(Math.random() * 2000)
  const profile = mkdtempSync(join(tmpdir(), 'sfx-render-'))
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`, '--headless=new', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio', 'about:blank'
  ], { stdio: 'ignore' })
  try {
    let version = null
    for (let i = 0; i < 60 && !version; i++) {
      try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(200) }
    }
    if (!version) throw new Error(`Chrome did not open its debugging port (${CHROME})`)
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
    const { targetId } = await send('Target.createTarget', { url: pathToFileURL(synthHtml).href })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    for (let i = 0; i < 50 && !(await evaluate('typeof window.renderSfx === "function"')); i++) await sleep(100)
    const result = await fn(evaluate)
    try { await send('Browser.close') } catch { /* already going */ }
    ws.close()
    return result
  } finally {
    chrome.kill()
    await sleep(400)
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* Windows may hold a lock briefly */ }
  }
}

/** Call the page's `renderSfx(opts)` and decode its mono float32 PCM. */
export const renderPcm = async (evaluate, opts = {}) => {
  const r = await evaluate(`window.renderSfx(${JSON.stringify(opts)})`)
  const bytes = Buffer.from(r.pcm, 'base64')
  return { sampleRate: r.sampleRate, pcm: new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4) }
}

// ─── PCM helpers ────────────────────────────────────────────────────────────

export const wavFloat32 = (pcm, sr) => {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}

export const scale = (pcm, db) => {
  const k = Math.pow(10, db / 20)
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * k
  return out
}

/**
 * Look-ahead peak limiter: the gain needed at each sample, held forward over
 * the look-ahead window and box-averaged back across it — so reduction ramps
 * in BEFORE the peak and never exceeds what the peak needs — then released
 * exponentially. Only touches the few transients above the ceiling.
 */
export const limit = (pcm, sr, ceilingDb, lookaheadMs = 4, releaseMs = 90) => {
  const c = Math.pow(10, ceilingDb / 20)
  const n = pcm.length
  const L = Math.max(1, Math.round((sr * lookaheadMs) / 1000))
  const need = new Float32Array(n)
  for (let i = 0; i < n; i++) need[i] = Math.min(1, c / Math.max(1e-9, Math.abs(pcm[i])))
  const hold = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let m = 1
    for (let j = i; j < Math.min(n, i + L); j++) if (need[j] < m) m = need[j]
    hold[i] = m
  }
  const out = new Float32Array(n)
  const rc = Math.exp(-1 / ((releaseMs / 1000) * sr))
  let sum = 0
  let g = 1
  let reduced = 0
  for (let i = 0; i < n; i++) {
    sum += hold[i]
    if (i >= L) sum -= hold[i - L]
    const avg = sum / Math.min(i + 1, L)
    g = Math.min(avg, 1 - (1 - g) * rc)
    if (g < 0.999) reduced++
    out[i] = pcm[i] * g
  }
  return { out, reducedMs: (reduced / sr) * 1000 }
}

export const encode = (wavPath, oggPath) => {
  const r = spawnSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', wavPath,
    '-c:a', 'libvorbis', '-q:a', '4', '-ar', '44100', '-ac', '1',
    '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', oggPath
  ], { encoding: 'utf-8' })
  if (r.status !== 0) throw new Error(`encode failed: ${r.stderr}`)
}

/**
 * Master one render into `out`: gain to `targetMaxMomentary` (EBU R128 max
 * momentary — the measure that tracks how BIG a one-shot lands), limit, encode,
 * and pull the gain back if Vorbis overshot the true-peak ceiling.
 */
export const master = (pcm, sr, out, work, { targetMaxMomentary, truePeakCeiling = -1.0, limiterCeilingDb = -1.8 }) => {
  const rawWav = join(work, 'raw.wav')
  writeFileSync(rawWav, wavFloat32(pcm, sr))
  const raw = loudness(rawWav)
  let gainDb = targetMaxMomentary - raw.maxMomentary
  let final = null
  let reducedMs = 0
  for (let attempt = 0; attempt < 5; attempt++) {
    const lim = limit(scale(pcm, gainDb), sr, limiterCeilingDb)
    reducedMs = lim.reducedMs
    const wav = join(work, 'mastered.wav')
    writeFileSync(wav, wavFloat32(lim.out, sr))
    encode(wav, out)
    final = describe(out)
    if (final.truePeak <= truePeakCeiling) break
    gainDb -= final.truePeak - truePeakCeiling + 0.1
  }
  return { raw, gainDb, reducedMs, final }
}
