/**
 * ─── Level report for the umbrella sounds and score ─────────────────────────
 *
 * The game synthesises every sound live (src/umbrella/soundKit.ts, music.ts),
 * so there is no file to measure — this renders each one offline through the
 * game's full mix (buses, rooms, limiter) and reports what ffmpeg measures.
 *
 *     node scripts/sfx/render-umbrella-sounds.mjs           # table
 *     node scripts/sfx/render-umbrella-sounds.mjs --wav dir # + keep the WAVs
 *
 * Starts its own Vite server on a random port (no project plugins — the page
 * only imports the pure sound modules), opens `umbrella-sounds.html` in a
 * PRIVATE headless Chrome (own profile and debugging port), and shuts both
 * down at the end. Needs Chrome (`CHROME=…`); ffmpeg comes from ffmpeg-static.
 *
 * Columns: sample peak per channel, true peak (ffmpeg, 4× oversampled),
 * loudest 400 ms RMS, EBU R128 max momentary and integrated loudness. Long
 * renders (music, wind) are measured after their fade-in (`skip`).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const require = createRequire(join(ROOT, 'package.json'))
process.env.FFMPEG ||= require('ffmpeg-static')
const { loudness } = await import('./sfx-stats.mjs')
const { withChrome } = await import('./sfx-master.mjs')
const { createServer } = await import('vite')

const wavDir = process.argv.includes('--wav') ? resolve(process.argv[process.argv.indexOf('--wav') + 1] ?? 'umbrella-wav') : null

const wavStereo = (pcm, sr) => {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22)
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity)

/** Sample peak and the loudest 400 ms RMS of interleaved stereo, from `skip` s. */
const pcmStats = (pcm, sr, skip) => {
  const from = Math.floor(skip * sr) * 2
  let peak = 0
  for (let i = from; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]))
  const win = Math.round(0.4 * sr) * 2
  const hop = Math.round(0.05 * sr) * 2
  let best = 0
  for (let s = from; s + win <= pcm.length; s += hop) {
    let sum = 0
    for (let i = s; i < s + win; i++) sum += pcm[i] * pcm[i]
    best = Math.max(best, sum / win)
  }
  return { peak: db(peak), rms: db(Math.sqrt(best)), seconds: pcm.length / 2 / sr }
}

const port = 20000 + Math.floor(Math.random() * 20000)
const server = await createServer({
  configFile: false,
  root: ROOT,
  logLevel: 'error',
  // Don't crawl index.html for dependencies: the page needs none.
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null }
})
await server.listen()
const url = `http://127.0.0.1:${port}/scripts/sfx/umbrella-sounds.html`
const work = mkdtempSync(join(tmpdir(), 'umbrella-sfx-'))
if (wavDir) mkdirSync(wavDir, { recursive: true })

try {
  // Ours, not a stale server from another project: check the page title.
  const html = await (await fetch(url)).text()
  if (!/<title>umbrella sounds<\/title>/.test(html)) throw new Error(`port ${port} is not serving the umbrella sound page`)
  // Warm Vite's transform so the page's module graph is ready when Chrome asks.
  for (const m of ['soundEngine', 'soundKit', 'music']) await fetch(`http://127.0.0.1:${port}/src/umbrella/${m}.ts`)

  const rows = await withChrome(url, async (evaluate) => {
    const names = await evaluate('window.SFX_NAMES')
    const out = []
    for (const name of names) {
      const r = await evaluate(`window.renderSfx(${JSON.stringify({ name })})`)
      const bytes = Buffer.from(r.pcm, 'base64')
      const pcm = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
      // Measure after the fade-in: trim the head off the file ffmpeg reads.
      const from = Math.floor(r.skip * r.sampleRate) * 2
      const wav = join(wavDir ?? work, `${name}.wav`)
      writeFileSync(wav, wavStereo(pcm.subarray(from), r.sampleRate))
      out.push({ name, ...pcmStats(pcm, r.sampleRate, r.skip), ...loudness(wav) })
    }
    return out
  })

  const f = (x, w = 7) => (Number.isFinite(x) ? x.toFixed(1) : '-inf').padStart(w)
  console.log(`${'sound'.padEnd(14)}${'len s'.padStart(7)}${'peak'.padStart(7)}${'TP'.padStart(7)}${'RMS400'.padStart(8)}${'maxM'.padStart(7)}${'int'.padStart(7)}`)
  for (const r of rows) {
    const flag = r.truePeak > -1 ? '  ← over −1 dBTP' : ''
    console.log(`${r.name.padEnd(14)}${f(r.seconds)}${f(r.peak)}${f(r.truePeak)}${f(r.rms, 8)}${f(r.maxMomentary)}${f(r.integrated)}${flag}`)
  }
  const sfx = rows.filter((r) => !/^(music|wind|mix)/.test(r.name))
  const music = rows.find((r) => r.name === 'music')
  const quietBig = Math.min(...sfx.filter((r) => /^(open|open-fast|break|splat|hit-mine|hit-pillar|win)$/.test(r.name)).map((r) => r.maxMomentary))
  if (music) {
    console.log(`\nmusic max momentary ${music.maxMomentary} LUFS vs the quietest headline sfx ${quietBig} LUFS → ${(quietBig - music.maxMomentary).toFixed(1)} dB headroom`)
  }
  const clipped = rows.filter((r) => r.peak > -0.1)
  console.log(clipped.length ? `CLIPPING: ${clipped.map((r) => r.name).join(', ')}` : 'no clipping (every sample peak under −0.1 dBFS)')
} finally {
  await server.close()
  try { rmSync(work, { recursive: true, force: true }) } catch { /* temp */ }
}
