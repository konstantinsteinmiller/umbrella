// Pack a built `dist/` into a real PKZIP, from Node — never via the shell.
//
//   node tools/zip-dist.mjs <zip-name> [dir=dist]
//
// writes `<dir>/<zip-name>` with `index.html` at the archive root, then reads
// it back and fails the build if it is not a PKZIP or has no root index.html.
//
// Why not `cd dist && tar -a -cf ../x.zip *`: that is Windows' bsdtar idiom,
// and whenever Git's `/usr/bin` wins the PATH (a pnpm script started from Git
// Bash, CI images) `tar` is GNU tar, which ignores the `.zip` suffix and
// silently writes a TAR under a .zip name. Portals answer with "We couldn't
// read your zip file". The writer itself is the Poki pipeline's
// (`tools/poki-deploy/lib/zip.mjs`) — see its header for the full story.

import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inspectZip, listZip, zipDir } from './poki-deploy/lib/zip.mjs'

const [zipName, dirArg = 'dist'] = process.argv.slice(2)
if (!zipName || !zipName.endsWith('.zip')) {
  console.error('usage: node tools/zip-dist.mjs <name>.zip [dir]')
  process.exit(2)
}
const dir = resolve(dirArg)
if (!existsSync(join(dir, 'index.html'))) {
  console.error(`[zip-dist] ${dir} has no index.html — build first`)
  process.exit(1)
}

const out = join(dir, zipName)
if (existsSync(out)) rmSync(out)
// Leave any archive already in dist/ out of the new one.
const res = zipDir(dir, out, { exclude: (name) => name.endsWith('.zip') })

const check = inspectZip(out)
const names = listZip(out)
if (!check.ok) {
  console.error(`[zip-dist] ${out}: ${check.why}`)
  process.exit(1)
}
if (!names.includes('index.html')) {
  console.error(`[zip-dist] ${out}: index.html is not at the archive root`)
  process.exit(1)
}
console.log(`[zip-dist] ${zipName}: PKZIP, ${res.entries} entries, ${(res.bytes / 1024 / 1024).toFixed(2)} MB, index.html at root`)
