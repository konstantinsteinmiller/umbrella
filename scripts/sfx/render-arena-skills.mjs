/**
 * ─── Render the arena-skill SFX (slots 5–8) ─────────────────────────────────
 *
 * Renders each synth graph in `arena-skills.html` (see the timing notes there),
 * loudness-matches it, limits the true peak and writes public/audio/sfx/<name>.ogg:
 *
 *     node scripts/sfx/render-arena-skills.mjs                 # all five
 *     node scripts/sfx/render-arena-skills.mjs skill-execute   # just one
 *
 * Needs Chrome (`CHROME=…`) and ffmpeg with libvorbis (`FFMPEG=…`). Build-time only.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { envelope } from './sfx-stats.mjs'
import { master, renderPcm, withChrome } from './sfx-master.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SYNTH = join(HERE, 'arena-skills.html')
const OUT_DIR = resolve(HERE, '../../public/audio/sfx')

/**
 * Max-momentary loudness per file (LUFS), set against the game's references
 * once the call-site gain in BattleArena is applied:
 *   new-tier-reveal  −15.5 at 0.07 — the rarest sound, and it must stay the biggest
 *   celebration-2    −15.4 at 0.06 — the milestone chest
 * The casts come every minute or two, so they sit 1–2 dB under the reveal; the
 * mark's lock-on is a cue, not a moment, and sits lower still.
 */
const TARGETS = {
  'skill-warcry': -16.5,      // playSound(…, 0.07)
  'skill-legion-call': -17,   // 0.07
  'skill-mark': -18.5,        // 0.06
  // 0.07. A 150 ms hit averaged over a 400 ms momentary window reads ~2 dB
  // quieter than it lands; chasing −16 drove the limiter for half a second.
  'skill-execute': -18,
  'skill-soul-pact': -16.5    // 0.07
}

const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const names = asked.length ? asked : Object.keys(TARGETS)
for (const n of names) if (!(n in TARGETS)) throw new Error(`unknown sound ${n}`)

const work = mkdtempSync(join(tmpdir(), 'sfx-work-'))
const renders = await withChrome(SYNTH, async (evaluate) => {
  const out = {}
  for (const n of names) out[n] = await renderPcm(evaluate, { name: n })
  return out
})

const bar = (dbv, floor = -60) => '█'.repeat(Math.max(0, Math.round((dbv - floor) / 1.5)))
for (const n of names) {
  const { sampleRate, pcm } = renders[n]
  const out = join(OUT_DIR, `${n}.ogg`)
  const r = master(pcm, sampleRate, out, work, { targetMaxMomentary: TARGETS[n] })
  console.log(`[sfx] ${n}: raw maxM ${r.raw.maxMomentary} LUFS → gain ${r.gainDb.toFixed(2)} dB, limiter ${r.reducedMs.toFixed(1)} ms`)
  console.log(`[sfx]   ${JSON.stringify(r.final)}`)
  for (const f of envelope(out, 100).frames) console.log(`        ${f.t.toFixed(1)} s ${f.rms.toFixed(1).padStart(6)} dB ${bar(f.rms)}`)
}
try { rmSync(work, { recursive: true, force: true }) } catch { /* temp */ }
