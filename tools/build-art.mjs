#!/usr/bin/env node
// ─── A portal build in one painted art style ────────────────────────────────
//
//   node tools/build-art.mjs <portal> [lantern]      e.g. pnpm build:itch:lantern
//   node tools/build-art.mjs <portal>                      the plain drawn game, no art skin (pnpm build:itch:playtest)
//   node tools/build-art.mjs <portal> [lantern] --jam      plays ONLY the editor's jam / Playtest Build chapter
//                                                          (pnpm build:poki-jam-playtest) -> ...-jam.zip
//
// The portal's own build (`vite build --mode <portal> --base=./`) with the art flag set in the
// environment (VITE_APP_LANTERN; vite.config.ts reads it like an .env entry, as the
// Poki deploy does), packed by tools/zip-dist.mjs into dist/umbrella-<portal>-<art>.zip (-drawn.zip without a skin),
// so the art builds never overwrite each other. Not via `pnpm build:<portal>`: those zip with `tar -a`, which
// writes a TAR named .zip whenever GNU tar (Git's) comes first on the PATH.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ART_FLAGS = { lantern: 'VITE_APP_LANTERN' }
const argv = process.argv.slice(2)
const jam = argv.includes('--jam')
const [portal, artArg] = argv.filter(a => a !== '--jam')
// No art given: the plain drawn game, with the skin flags forced off (a stray one in the shell must not leak in).
const art = artArg ?? 'drawn'
if (!portal || (art !== 'drawn' && !ART_FLAGS[art])) {
  console.error('usage: node tools/build-art.mjs <portal> [lantern] [--jam]')
  process.exit(1)
}

const run = (args, env = process.env) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run([join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', portal, '--base=./'], {
  ...process.env,
  VITE_APP_KITE: 'false',
  VITE_APP_LANTERN: 'false',
  VITE_APP_PLAYTEST_CHAPTER: String(jam),
  ...(art === 'drawn' ? {} : { [ART_FLAGS[art]]: 'true' })
})
// An empty chapter would quietly ship the whole campaign. Read after the build, which pulls the newest order first.
if (jam) {
  const order = JSON.parse(readFileSync(join(ROOT, 'data', 'campaign-order.json'), 'utf8'))
  if (!order.jam?.length) {
    console.error('the jam / Playtest Build chapter is empty: add levels to it in the level editor, save, then re-run')
    process.exit(1)
  }
  console.log(`\njam chapter "${order.jamName ?? 'Game Jam'}": ${order.jam.length} levels`)
}
const zip = `umbrella-${portal}-${art}${jam ? '-jam' : ''}.zip`
run([join(ROOT, 'tools', 'zip-dist.mjs'), zip])
console.log(`\n${art} build → dist/${zip}`)
