#!/usr/bin/env node
/**
 * Which painted drop-ins are actually on disk, and which are still drawings.
 *
 *   pnpm art:status              # a summary per kind, plus what is missing
 *   pnpm art:status -- --all     # list every key, present or not
 *
 * The question this answers is "I sliced the art and only half the game
 * changed". A miss is SILENT by design — `artSrc()` returns null and the
 * component draws its SVG/CSS fallback, so a portal never sees a broken build —
 * which is right in play and useless at the bench, where the point is to know
 * what is still missing. Nothing here touches a browser: it reads the catalogue
 * the renderer probes (`src/game/artCatalogue.ts`) and looks in `public/`.
 *
 * Run through the `--import` hook (the pnpm script does):
 *   node --import ./scripts/art/ts-resolve.mjs scripts/art/art-status.mjs
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLIC = join(ROOT, 'public')
const ALL = process.argv.includes('--all')

// umbrella: `--set umbrella` reports the Umbrella KITE sheets instead
// (src/umbrella/art/manifest.ts → src/assets/umbrella-art/, which only the kite
// build bundles): one line per group, and every sheet still drawn as vectors.
const SET_AT = process.argv.indexOf('--set')
if (SET_AT > 1 && process.argv[SET_AT + 1] === 'umbrella') {
  const m = await import(pathToFileURL(join(ROOT, 'src', 'umbrella', 'art', 'manifest.ts')).href)
  const dir = join(ROOT, m.SHIPPED_DIR)
  let here = 0
  let bytes = 0
  const groups = new Map()
  for (const s of m.GAME_SHEETS) {
    const f = join(dir, m.targetOf(s))
    const ok = existsSync(f)
    if (ok) { here++; bytes += statSync(f).size }
    const g = groups.get(s.group) ?? { here: 0, all: 0, missing: [] }
    g.all++
    if (ok) g.here++
    else g.missing.push(s.id)
    groups.set(s.group, g)
    if (ALL) console.log(`  ${ok ? '✓' : '·'} ${s.id}`)
  }
  for (const [g, v] of groups) {
    console.log(`${v.here === v.all ? '✓' : v.here === 0 ? '·' : '½'} ${g.padEnd(9)} ${String(v.here).padStart(2)}/${v.all}${v.missing.length && !ALL ? `   still vector: ${v.missing.join(', ')}` : ''}`)
  }
  console.log(`
${here} of ${m.GAME_SHEETS.length} kite sheets painted — ${(bytes / 1024).toFixed(0)} kB in ${m.SHIPPED_DIR}/.`)
  console.log('A missing sheet is not an error: the kite build draws that one as vectors (a character only switches to paint once ALL its core sheets are in).')
  process.exit(0)
}

const { ART_CATALOGUE, artBase } = await import(pathToFileURL(join(ROOT, 'src', 'game', 'artCatalogue.ts')).href)

let present = 0
let absent = 0
const rows = []
const counted = new Set()

for (const [kind, keys] of Object.entries(ART_CATALOGUE)) {
  const missing = []
  let here = 0
  let bytes = 0
  for (const key of keys) {
    // The probe tries `.webp` first, then `.png` — so does this.
    const file = ['webp', 'png'].map((ext) => join(PUBLIC, `${artBase(key)}.${ext}`)).find((f) => existsSync(f))
    if (file) {
      here++
      // Two keys can share one file (the meteor); count its bytes once.
      if (!counted.has(file)) { bytes += statSync(file).size; counted.add(file) }
      if (ALL) rows.push(`  ✓ ${kind}/${key}`)
    } else {
      missing.push(key)
      if (ALL) rows.push(`  · ${kind}/${key}`)
    }
  }
  present += here
  absent += missing.length
  const kb = bytes > 0 ? ` — ${(bytes / 1024).toFixed(0)} kB` : ''
  console.log(`${here === keys.length ? '✓' : here === 0 ? '·' : '½'} ${kind.padEnd(11)} ${String(here).padStart(3)}/${keys.length}${kb}`)
  if (missing.length && !ALL) {
    // The whole point: name them.
    const shown = missing.slice(0, 12).join(', ')
    console.log(`    missing: ${shown}${missing.length > 12 ? `, …and ${missing.length - 12} more` : ''}`)
  }
}

if (ALL) console.log(rows.join('\n'))
const totalKb = [...counted].reduce((a, f) => a + statSync(f).size, 0) / 1024
console.log(`\n${present} painted, ${absent} still drawn, ${present + absent} in the catalogue — ${totalKb.toFixed(0)} kB on disk.`)
if (absent) {
  console.log('A missing file is not an error: the component draws that one. It is only'
    + '\na surprise when you expected a painting — slice the sheet it belongs to,'
    + '\nthen reload the game (or `__art.refresh()` in a dev console).')
}
