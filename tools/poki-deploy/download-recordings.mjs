#!/usr/bin/env node
/**
 * pnpm download:recordings — fetch every Poki playtest recording, headless.
 *
 *   node tools/poki-deploy/download-recordings.mjs [--out <dir>] [--dry] [--no-archived]
 *
 * Auth: opens app.poki.dev in a headless Chrome on the deploy tool's own
 * profile (~/.poki-deploy/chrome-profile, signed in once by `deploy:poki`),
 * lets the app refresh its session and reads the access token it keeps in
 * localStorage. Chrome is then closed; the rest is plain HTTP:
 *   devs-api.poki.io/games/<id>/playtest-recordings        (JSON:API list)
 *   storage.googleapis.com/poki-playtest-recordings/<id>.webm (public file)
 *
 * Files: <out>/<YYYY-MM-DD played>/<device>-<orientation>_<m-ss>_<Version>_<Mon-DD>.webm,
 * e.g. mobile-landscape_2-36_Umbrella-0-13-3_Oct-30.webm. Existing files are skipped,
 * so a rerun only downloads the new ones.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, mkdtempSync, rmSync, copyFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_PROFILE, findChrome } from './lib/chrome.mjs'
import config from './poki.config.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }

const GAME_ID = config.gameId ?? 'a0e9e4d5-1f73-4b9b-bb6e-edd6905cd867'
const OUT = opt('--out', join(process.env.USERPROFILE ?? process.env.HOME, 'Dropbox', 'X-Else', 'Poki recordings'))
const API = `https://devs-api.poki.io/games/${GAME_ID}`
const VIDEO = (id) => `https://storage.googleapis.com/poki-playtest-recordings/${id}.webm`
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── token ────────────────────────────────────────────────────────────────────
const portAlive = async (port) => {
  try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok } catch { return false }
}

const evaluate = (wsUrl, expression) => new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl)
  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) { ws.close(); resolve(m.result?.result?.value) } }
  ws.onerror = reject
})

const readToken = async () => {
  // A deploy:poki Chrome already open on the profile holds its lock; borrow it.
  let port = 9333, child = null
  if (!(await portAlive(port))) {
    port = 9300 + Math.floor(Math.random() * 600)
    child = spawn(findChrome(), [
      '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${DEFAULT_PROFILE}`,
      '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank',
    ], { stdio: 'ignore' })
    for (let i = 0; i < 80 && !(await portAlive(port)); i++) await sleep(250)
    if (!(await portAlive(port))) {
      child.kill()
      throw new Error(`Chrome would not start on ${DEFAULT_PROFILE}. Is a window of that profile open without a debugging port? Close it and rerun.`)
    }
  }
  try {
    const t = await (await fetch(`http://127.0.0.1:${port}/json/new?https://app.poki.dev/${config.team ?? 'hyperg8'}/games/${GAME_ID}/playtests`,{ method: 'PUT' })).json()
    const expr = `(() => { try { const s = JSON.parse(localStorage['state/persistedSession']).state
      return s.accessToken && s.expires > Date.now() + 5000 ? s.accessToken : '' } catch { return '' } })()`
    for (let i = 0; i < 60; i++) {
      await sleep(500)
      const token = await evaluate(t.webSocketDebuggerUrl, expr).catch(() => '')
      if (token) {
        await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {})
        return token
      }
    }
    throw new Error('No Poki session in the deploy profile. Sign in once: run `pnpm deploy:poki` (or open app.poki.dev in that profile) and log in with Google.')
  } finally {
    if (child) { child.kill(); await sleep(500) }
  }
}

// ── naming ───────────────────────────────────────────────────────────────────
/** Width/height from the WebM header (EBML PixelWidth 0xB0 / PixelHeight 0xBA). */
const webmSize = (buf) => {
  const read = (tag) => {
    for (let i = 0; i < buf.length - 4; i++) {
      if (buf[i] !== tag) continue
      const len = buf[i + 1]
      if (len === 0x82) return (buf[i + 2] << 8) | buf[i + 3]
      if (len === 0x81) return buf[i + 2]
    }
    return 0
  }
  return { w: read(0xb0), h: read(0xba) }
}

const versionLabel = (label) => (label ?? 'unknown').split('·')[0].trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')

const playedDate = (sec) => {
  const d = new Date(sec * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return { folder: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, short: `${MONTHS[d.getMonth()]}-${pad(d.getDate())}` }
}

const duration = (s) => `${Math.floor(s / 60)}-${String(Math.round(s % 60)).padStart(2, '0')}`

// ── main ─────────────────────────────────────────────────────────────────────
const token = await readToken()
const get = async (url) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.api+json' } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const versions = new Map((await get(`${API}/versions?sort=created_at&page[size]=1000`)).data.map(v => [v.id, v.attributes.label]))
const lists = [get(`${API}/playtest-recordings`)]
if (!flag('--no-archived')) lists.push(get(`${API}/playtest-recordings?filter[archived_at]=not:null`))
const seen = new Set()
const recordings = (await Promise.all(lists)).flatMap(l => l.data)
  .filter(r => r.attributes.state === 'done' && !seen.has(r.id) && seen.add(r.id))
  .sort((a, b) => a.attributes.created_at - b.attributes.created_at)

// Which recording ids are already on disk, so a rerun downloads only new ones.
const INDEX = join(OUT, '.downloaded.json')
const done = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {}
const saveIndex = () => writeFileSync(INDEX, JSON.stringify(done, null, 1))

console.log(`${recordings.length} recordings → ${OUT}`)
let fetched = 0, skipped = 0, failed = 0
const tmp = mkdtempSync(join(tmpdir(), 'poki-rec-'))

for (const r of recordings) {
  const a = r.attributes
  if (done[r.id] && existsSync(join(OUT, done[r.id]))) { skipped++; continue }
  const date = playedDate(a.created_at)
  const dir = join(OUT, date.folder)
  const tail = `${duration(a.duration ?? 0)}_${versionLabel(versions.get(a.version_id))}_${date.short}`
  try {
    const res = await fetch(VIDEO(r.id))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const device = a.device_category ?? 'unknown'
    let orient = a.requested_orientation === 'both' ? '' : a.requested_orientation
    if (device !== 'desktop') {
      const { w, h } = webmSize(buf.subarray(0, 65536))
      if (w && h) orient = w >= h ? 'landscape' : 'portrait'
    }
    const prefix = device === 'desktop' ? 'desktop' : `${device}-${orient || 'unknown'}`
    let name = `${prefix}_${tail}.webm`
    // Two players can share device, length, version and day: the short id splits them.
    if (existsSync(join(dir, name))) name = `${prefix}_${tail}_${r.id.slice(0, 8)}.webm`
    if (flag('--dry')) { console.log(`  would save ${date.folder}/${name}`); continue }
    mkdirSync(dir, { recursive: true })
    const part = join(tmp, `${r.id}.webm`)
    writeFileSync(part, buf)
    try { renameSync(part, join(dir, name)) } catch { copyFileSync(part, join(dir, name)); unlinkSync(part) }
    done[r.id] = `${date.folder}/${name}`
    saveIndex()
    fetched++
    console.log(`  ✓ ${date.folder}/${name} (${(buf.length / 1048576).toFixed(1)} MB)`)
  } catch (e) {
    failed++
    console.warn(`  ✗ ${r.id}: ${e.message}`)
  }
}
rmSync(tmp, { recursive: true, force: true })
console.log(`done: ${fetched} downloaded, ${skipped} already there, ${failed} failed`)
process.exit(failed ? 1 : 0)
