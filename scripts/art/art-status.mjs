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
