#!/usr/bin/env node
// ─── Clay wind: alternative gust designs to choose from ──────────────────────
//
//   node scripts/art/clay-wind-alts.mjs jobs   → art-sheets/clay-wind-alts/jobs.json (Gemini runner)
//
// The clay-wind sheet's own prompt (PROMPTS-CLAY.md), with its subject swapped for each design and
// the approved-design picture dropped (it pins the current long swoosh). Same 2x2 layout, same
// colours, so the chosen sheet drops into art-sheets/umbrella-clay/painted/clay-wind.png as is.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SHEETS = join(ROOT, 'art-sheets', 'umbrella-clay')
const DIR = join(ROOT, 'art-sheets', 'clay-wind-alts')

export const DESIGNS = {
  puffs: { name: 'Cloud puffs', what: 'a short GUST CLOUD: three or four round squashed clay puffs in a row, growing from a small one at the left to the biggest at the right, overlapping like a little cartoon cloud being blown along, with two short rolled-clay curls trailing off the small end' },
  rope: { name: 'Twisted rope', what: 'a TWISTED WIND ROPE: two thin rolled-clay coils, one pale and one deeper shade of the colour, twisted round each other like a candy-cane rope, thick in the middle and tapering to points at both ends, lying in a gentle S-wave' },
  curls: { name: 'Three curls', what: 'a ROW OF THREE CURLS: three fat rolled-clay spirals side by side, each one a short stroke that rolls up into a round curl at its right end, the left one smallest and the right one biggest, like a cartoon "whoosh" drawn in clay' },
  ribbon: { name: 'Flat streamer', what: 'a FLAT CLAY STREAMER: a wide flat ribbon of rolled-out clay, about as wide as a finger, fluttering from left to right with two soft folds where it turns over (its paler underside showing at each fold), the right end cut in a swallow-tail notch' },
  speed: { name: 'Speed lines', what: 'CARTOON SPEED LINES: three short rolled-clay snakes lying parallel one above the other, staggered (the middle one longest and furthest right), each with round soft ends and slightly thicker at its right end' },
  wave: { name: 'Breaking wave', what: 'an AIR WAVE: one chunky rolled-clay stroke that rises from a thin tail at the left into a fat crest that curls forward and over at the right like a small breaking wave, the crest rolled into a round spiral, with two tiny clay droplet balls flicked off its tip' },
  beads: { name: 'Breath trail', what: 'a BREATH TRAIL: a string of round clay beads blown along in a gentle wave, the biggest at the right and shrinking to tiny dots toward the left, the biggest bead pressed into a small flat swirl' },
  comet: { name: 'Comet gust', what: 'a COMET GUST: one plump teardrop-shaped puff of clay at the right with a soft swirl pressed into its face, and three thin rolled-clay tails streaming back from it to the left, of different lengths, each tapering to a point' }
}

const promptFor = (base, d) => base
  .replace(' Where it shows this very thing, follow its design.', ' Its swirling wind is NOT the design to paint here: take only its finish.')
  .replace(/· The SECOND attached image is the APPROVED CONCEPT DESIGN[^\n]*\n/, '')
  .replace('· 3 images are attached; the LAST one is the layout reference.', '· 2 images are attached; the LAST one is the layout reference.')
  .replace(/WHAT IT IS:[^\n]*\n[^\n]*\n/, `WHAT IT IS: the wind of the clay town, as a SET of four separate gusts of plasticine, one per panel, each one ${d.what}. Panels 1 and 2 two slightly different versions of it in soft dusty-blue clay; panels 3 and 4 the same two versions in warm orange clay. Each gust alone, blowing from LEFT to RIGHT, nothing else in its panel.\nEach gust lies across the MIDDLE of its panel and spans about four fifths of the panel's width and no more than a third of its height, leaving magenta all round it: no leaves, no arrows, no background, no shadow cast on the ground.\n`)
  .replace(/ONE THE CLAY SWOOSH: All 4 panels show the same the clay swoosh[^\n]*\n[^\n]*\n/, 'ONE DESIGN: all 4 panels show the same gust design, made the same way, in the same finish and outline; only the small variation (panels 1 vs 2, 3 vs 4) and the colour change.\n')

if (process.argv[2] === 'jobs') {
  const doc = readFileSync(join(SHEETS, 'PROMPTS-CLAY.md'), 'utf-8')
  const base = /## Clay wind[^\n]*\n\n```text\n([\s\S]*?)\n```/.exec(doc)[1]
  mkdirSync(join(DIR, 'painted'), { recursive: true })
  const jobs = Object.entries(DESIGNS).map(([id, d]) => ({
    id: `clay-wind-${id}`,
    out: join(DIR, 'painted', `${id}.png`),
    ref: join(SHEETS, 'clay-wind.png'),
    also: [join(SHEETS, 'style', 'clay-world.png')],
    prompt: promptFor(base, d)
  }))
  for (const j of jobs) if (j.prompt.includes('long smooth rolled-clay stroke') || j.prompt.includes('SECOND attached')) throw new Error(`${j.id}: old subject left in the prompt`)
  writeFileSync(join(DIR, 'jobs.json'), JSON.stringify(jobs, null, 1))
  console.log(`${jobs.length} jobs → ${join(DIR, 'jobs.json')}`)
}
