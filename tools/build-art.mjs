#!/usr/bin/env node
// ─── A portal build in one painted art style ────────────────────────────────
//
//   node tools/build-art.mjs <portal> <lantern|clay>      e.g. pnpm build:itch:lantern
//
// The portal's own build (`vite build --mode <portal> --base=./`) with the art flag set in the
// environment (VITE_APP_LANTERN / VITE_APP_CLAY; vite.config.ts reads it like an .env entry, as the
// Poki deploy does), packed by tools/zip-dist.mjs into dist/umbrella-<portal>-<art>.zip, so the art
// builds never overwrite each other. Not via `pnpm build:<portal>`: those zip with `tar -a`, which
// writes a TAR named .zip whenever GNU tar (Git's) comes first on the PATH.
import { spawnSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ART_FLAGS = { lantern: 'VITE_APP_LANTERN', clay: 'VITE_APP_CLAY' }
const [portal, art] = process.argv.slice(2)
if (!portal || !ART_FLAGS[art]) {
  console.error('usage: node tools/build-art.mjs <portal> <lantern|clay>')
  process.exit(1)
}

const run = (args, env = process.env) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
run([join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', portal, '--base=./'], { ...process.env, [ART_FLAGS[art]]: 'true' })
run([join(ROOT, 'tools', 'zip-dist.mjs'), `umbrella-${portal}-${art}.zip`])
console.log(`\n${art} build → dist/umbrella-${portal}-${art}.zip`)
