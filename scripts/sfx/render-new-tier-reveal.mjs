/**
 * ─── Render `public/audio/sfx/new-tier-reveal.ogg` ──────────────────────────
 *
 * The "new tier discovered" reveal — the rarest sound in the game — is a synth
 * graph (`new-tier-reveal.html`), not a recording. This script renders it in a
 * PRIVATE headless Chrome (its own temp profile and debugging port, so it never
 * touches a browser someone else has open), loudness-matches it to the game's
 * other big moments, limits the true peak, and encodes the Vorbis file the game
 * plays.
 *
 *     node scripts/sfx/render-new-tier-reveal.mjs            # render + encode
 *     node scripts/sfx/render-new-tier-reveal.mjs --stems    # + per-layer balance
 *
 * Needs Chrome (`CHROME=…` to override the path) and ffmpeg with libvorbis
 * (`FFMPEG=…`). Build-time only; nothing here ships.
 *
 * Reproducible: the synth draws every random choice from a seeded PRNG, so a
 * re-render is the same sound. Not the same BYTES — Chrome's audio-rate FM and
 * filter paths add run-to-run float jitter around −85 dB below peak, and the
 * encoder faithfully encodes it. The md5 lines in the output make that visible.
 */

import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, envelope, loudness } from './sfx-stats.mjs'
import { encode, limit, renderPcm, scale, wavFloat32, withChrome as withChromeAt } from './sfx-master.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SYNTH = join(HERE, 'new-tier-reveal.html')
const OUT = resolve(HERE, '../../public/audio/sfx/new-tier-reveal.ogg')

/**
 * How loud the file is mastered — by the loudest 400 ms (EBU R128 momentary),
 * the measure that tracks how BIG a one-shot lands.
 *
 * The game calls `playSound('new-tier-reveal', 0.07)`. The biggest existing
 * moment is the milestone chest, `playSound('milestone-chest', 0.06)`, which
 * plays `celebration-2.ogg` (max momentary −15.4 LUFS). At −15.5 here the
 * reveal lands ≈ +1.2 dB above it once both call-site gains are applied:
 * (−15.5 + 20·log10 0.07) − (−15.4 + 20·log10 0.06) = +1.24 dB.
 */
const TARGET_MAX_MOMENTARY = -15.5
/** True-peak ceiling of the FINAL .ogg (Vorbis adds a little overshoot). */
const TRUE_PEAK_CEILING = -1.0
/** Sample-peak ceiling of the limiter before encoding. */
const LIMITER_CEILING_DB = -1.8

// The render + mastering helpers live in ./sfx-master.mjs (shared with the
// arena-skill renderer); this script keeps its own mastering loop because it
// also reports per-layer balance with --stems.
const withChrome = (fn) => withChromeAt(SYNTH, fn)
const renderLayer = (evaluate, only = null) => renderPcm(evaluate, { only })

const bar = (dbv, floor = -60) => '█'.repeat(Math.max(0, Math.round((dbv - floor) / 1.5)))

// ─── Main ───────────────────────────────────────────────────────────────────

const stems = process.argv.includes('--stems')
const work = mkdtempSync(join(tmpdir(), 'sfx-work-'))

const { full, layers } = await withChrome(async (evaluate) => {
  const full = await renderLayer(evaluate)
  const layers = {}
  if (stems) for (const name of ['riser', 'bloom', 'arp', 'pad']) layers[name] = await renderLayer(evaluate, name)
  return { full, layers }
})
const sr = full.sampleRate

// 1. Match the loudness target on the raw render.
const rawWav = join(work, 'raw.wav')
writeFileSync(rawWav, wavFloat32(full.pcm, sr))
const raw = loudness(rawWav)
let gainDb = TARGET_MAX_MOMENTARY - raw.maxMomentary

// 2. Limit + encode, then pull the gain back if Vorbis overshot the ceiling.
let final = null
let reducedMs = 0
for (let attempt = 0; attempt < 5; attempt++) {
  const lim = limit(scale(full.pcm, gainDb), sr, LIMITER_CEILING_DB)
  reducedMs = lim.reducedMs
  const wav = join(work, 'mastered.wav')
  writeFileSync(wav, wavFloat32(lim.out, sr))
  encode(wav, OUT)
  final = describe(OUT)
  if (final.truePeak <= TRUE_PEAK_CEILING) break
  gainDb -= final.truePeak - TRUE_PEAK_CEILING + 0.1
}

// 3. Evidence.
const md5 = (b) => createHash('md5').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex')
console.log(`[sfx] raw PCM md5 ${md5(full.pcm)} · encoded md5 ${createHash('md5').update(readFileSync(OUT)).digest('hex')}`)
console.log(`[sfx] raw render: maxM ${raw.maxMomentary} LUFS, TP ${raw.truePeak} dBFS → gain ${gainDb.toFixed(2)} dB, limiter active ${reducedMs.toFixed(1)} ms`)
console.log(`[sfx] ${JSON.stringify(final)}`)

const env10 = envelope(OUT, 10)
let onset = { t: 0, jump: -Infinity }
for (let i = 1; i < env10.frames.length; i++) {
  const f = env10.frames[i]
  if (f.t < 0.2 || f.t > 0.6) continue
  const jump = f.rms - env10.frames[i - 1].rms
  if (jump > onset.jump) onset = { t: f.t, jump }
}
console.log(`[sfx] bloom onset: largest 10 ms RMS jump in 0.2–0.6 s is +${onset.jump.toFixed(1)} dB at ${onset.t.toFixed(2)} s`)
console.log('[sfx] around the bloom (10 ms RMS):')
for (const f of env10.frames.filter((x) => x.t >= 0.27 && x.t < 0.45)) {
  console.log(`   ${f.t.toFixed(2)} s ${f.rms.toFixed(1).padStart(6)} dB ${bar(f.rms)}`)
}
console.log('[sfx] whole file (100 ms RMS):')
for (const f of envelope(OUT, 100).frames) console.log(`   ${f.t.toFixed(1)} s ${f.rms.toFixed(1).padStart(6)} dB ${bar(f.rms)}`)

if (stems) {
  console.log('[sfx] layer balance at the master gain (100 ms RMS; dB):')
  const rows = {}
  for (const [name, { pcm }] of Object.entries(layers)) {
    const wav = join(work, `${name}.wav`)
    writeFileSync(wav, wavFloat32(scale(pcm, gainDb), sr))
    rows[name] = { maxM: loudness(wav).maxMomentary, frames: envelope(wav, 100).frames }
  }
  const times = [0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 2.0, 2.5, 3.0]
  console.log(`   ${'layer'.padEnd(6)} maxM  ${times.map((t) => `${t.toFixed(1)}s`.padStart(6)).join('')}`)
  for (const [name, r] of Object.entries(rows)) {
    const cells = times.map((t) => {
      const f = r.frames[Math.round(t / 0.1)]
      return (f && Number.isFinite(f.rms) ? f.rms.toFixed(0) : '-').padStart(6)
    })
    console.log(`   ${name.padEnd(6)} ${String(r.maxM).padStart(5)} ${cells.join('')}`)
  }
}

try { rmSync(work, { recursive: true, force: true }) } catch { /* temp */ }
console.log(`[sfx] wrote ${OUT}`)
