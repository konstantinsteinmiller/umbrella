/**
 * ─── Objective numbers for a sound file ─────────────────────────────────────
 *
 * Nobody on the build side can listen, so every SFX rendered by a script in
 * this folder is judged by what ffmpeg can measure: duration, true peak,
 * integrated loudness, the loudest 400 ms (EBU R128 "momentary" — the number
 * that tracks how BIG a one-shot lands), and an RMS envelope over time.
 *
 *     node scripts/sfx/sfx-stats.mjs public/audio/sfx/celebration-2.ogg [...]
 *
 * Needs `ffmpeg` on PATH, or `FFMPEG=/path/to/ffmpeg`. Build-time only — the
 * game never runs any of this.
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FFMPEG = process.env.FFMPEG || 'ffmpeg'

const run = (args, opts = {}) => {
  const out = spawnSync(FFMPEG, ['-hide_banner', '-nostats', ...args], { maxBuffer: 256 * 1024 * 1024, ...opts })
  if (out.error) throw new Error(`could not run ${FFMPEG}: ${out.error.message} — install ffmpeg or set FFMPEG`)
  return out
}

/** Mono float PCM of any file ffmpeg can read, at `rate`. */
export const decodeMono = (file, rate = 44100) => {
  const out = run(['-i', file, '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { encoding: 'buffer' })
  if (out.status !== 0) throw new Error(`decode failed: ${out.stderr.toString().slice(-400)}`)
  const buf = out.stdout
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4))
}

/** EBU R128: integrated, true peak, max momentary / short-term. */
export const loudness = (file) => {
  const out = run(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf-8' })
  const log = out.stderr
  const summary = log.slice(log.lastIndexOf('Summary:'))
  const i = /I:\s*(-?[\d.]+) LUFS/.exec(summary)
  const tp = /Peak:\s*(-?[\d.]+) dBFS/.exec(summary)
  // The per-frame log: `M:-120.7 S:-120.7` (no space before the value when it
  // is three digits wide), so the optional whitespace matters.
  let maxM = -Infinity
  let maxS = -Infinity
  for (const m of log.matchAll(/ M:\s*(-?[\d.]+)\s+S:\s*(-?[\d.]+)/g)) {
    maxM = Math.max(maxM, Number(m[1]))
    maxS = Math.max(maxS, Number(m[2]))
  }
  return {
    integrated: i ? Number(i[1]) : NaN,
    truePeak: tp ? Number(tp[1]) : NaN,
    maxMomentary: maxM,
    maxShortTerm: maxS
  }
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity)

/** RMS (dBFS) per `windowMs` window, plus sample peak and duration. */
export const envelope = (file, windowMs = 50, rate = 44100) => {
  const pcm = decodeMono(file, rate)
  const n = Math.max(1, Math.round((rate * windowMs) / 1000))
  const frames = []
  let peak = 0
  for (let i = 0; i < pcm.length; i += n) {
    let sum = 0
    const end = Math.min(pcm.length, i + n)
    for (let j = i; j < end; j++) {
      const v = pcm[j]
      sum += v * v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    frames.push({ t: i / rate, rms: db(Math.sqrt(sum / (end - i))) })
  }
  // Where the sound actually ends: last window above -60 dBFS RMS.
  let last = 0
  for (const f of frames) if (f.rms > -60) last = f.t + windowMs / 1000
  return { duration: pcm.length / rate, samplePeak: db(peak), audibleUntil: last, frames }
}

/** One line per file, for comparing a render against the references. */
export const describe = (file) => {
  const l = loudness(file)
  const e = envelope(file)
  return {
    file,
    duration: +e.duration.toFixed(3),
    audibleUntil: +e.audibleUntil.toFixed(2),
    truePeak: l.truePeak,
    samplePeak: +e.samplePeak.toFixed(1),
    integrated: l.integrated,
    maxMomentary: l.maxMomentary,
    maxShortTerm: l.maxShortTerm
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  for (const f of process.argv.slice(2)) console.log(JSON.stringify(describe(f)))
}
