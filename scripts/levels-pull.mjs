// ─── Pull the levels bucket into data/campaign-overrides.json ───────────
// The designer edits campaign levels on GitHub Pages; their edits live in the
// levels bucket (workers/levels-bucket). This merges the bucket into the repo
// file per slot, newest `editedAt` wins (a bucket deletion removes the slot),
// so the next build ships them. Runs before every vite build (vite.config.ts)
// and by hand: `pnpm levels:pull`. Unreachable bucket: the file stays as it is.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const OVERRIDES_FILE = resolve(fileURLToPath(new URL('../data/campaign-overrides.json', import.meta.url)))

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isRect = (r) => !!r && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h)
/** The game validates again on load (parseLevel); this keeps junk out of the repo file. */
const looksLikeLevel = (l) =>
  !!l && typeof l === 'object' && !!l.world && isNum(l.world.w) && isNum(l.world.h) &&
  !!l.spawn && isNum(l.spawn.x) && isNum(l.spawn.y) &&
  Array.isArray(l.platforms) && l.platforms.every(isRect) && Array.isArray(l.winds) && l.winds.every(isRect)

/** @returns {Promise<{ ok: boolean, changed: number, message: string }>} */
export const pullLevels = async (bucketUrl, file = OVERRIDES_FILE) => {
  const base = (bucketUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) return { ok: false, changed: 0, message: 'no VITE_APP_LEVELS_BUCKET_URL' }
  let bucket
  let lastError = ''
  for (let attempt = 0; attempt < 3 && !bucket; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    try {
      const res = await fetch(`${base}/levels`, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data || typeof data !== 'object' || typeof data.campaign !== 'object' || data.campaign === null) throw new Error('not a levels bucket')
      bucket = data
    } catch (e) {
      lastError = e.message
    }
  }
  if (!bucket) return { ok: false, changed: 0, message: `levels bucket unreachable (${lastError}) — kept the repo levels` }
  let disk
  try {
    disk = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
    if (!disk || typeof disk !== 'object' || Array.isArray(disk)) throw new Error('not an object')
  } catch (e) {
    return { ok: false, changed: 0, message: `${file} is not valid JSON (${e.message}) — left untouched` }
  }
  let changed = 0
  for (const [id, e] of Object.entries(bucket.campaign)) {
    if (!/^\d+$/.test(id) || !e || !Number.isFinite(e.editedAt) || e.editedAt <= (disk[id]?.editedAt ?? 0)) continue
    if (e.level !== null && !looksLikeLevel(e.level)) continue
    if (e.level === null) {
      if (!(id in disk)) continue
      delete disk[id]
    } else {
      disk[id] = { ...e.level, id: Number(id), editedAt: e.editedAt }
    }
    changed++
  }
  if (changed) writeFileSync(file, JSON.stringify(disk, null, 2) + '\n', 'utf-8')
  return { ok: true, changed, message: `levels bucket: ${changed} campaign level${changed === 1 ? '' : 's'} updated` }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = Object.fromEntries(['.env', '.env.production', '.env.development']
    .map((f) => resolve(fileURLToPath(new URL('..', import.meta.url)), f))
    .filter(existsSync)
    .flatMap((f) => readFileSync(f, 'utf-8').split(/\r?\n/))
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]))
  const r = await pullLevels(process.env.VITE_APP_LEVELS_BUCKET_URL ?? env.VITE_APP_LEVELS_BUCKET_URL)
  console.log(r.message)
  process.exitCode = r.ok ? 0 : 1
}
