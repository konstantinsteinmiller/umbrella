#!/usr/bin/env node
/**
 * ─── art:promotion — the store-page side of the art pipeline ────────────────
 *
 *   pnpm art:promotion                 # the whole trip: plates → paint what is
 *                                      #   missing → cut every size
 *   pnpm art:promotion --plates        # (re)build the plates and the prompt
 *                                      #   document, paint nothing, stop
 *   pnpm art:promotion --no-generate   # cut from what is on disk
 *   pnpm art:promotion --only 1x1,16x9 # …just these aspect families
 *   pnpm art:promotion --force         # re-roll every master, painted or not
 *   pnpm art:promotion --check         # CI: is PROMPTS-PROMOTION.md current?
 *   pnpm art:promotion --cap 48        # raise the desk's daily ceiling for
 *                                      #   THIS run only (Gemini's own refusal
 *                                      #   still stops it)
 *   pnpm art:promotion --keep-window   # leave the Gemini window open afterwards
 *
 * A SIDE STEP of the pipeline in `scripts/art/slice-sheets.mjs`, sharing its
 * manifest discipline and its painter, and none of its plumbing:
 *
 *   · nothing here is a drawable. The renderer never probes for a cover, so
 *     there is no drop-in path, no fit normalisation and no magenta key;
 *   · the plates live in `art-sheets/promotion/` and the masters in
 *     `art-sheets/promotion/painted/`, ONE FOLDER DOWN from the sheets the Art
 *     Desk scans — the desk would hand a cover to the slicer, which would
 *     refuse it and leave the painting sitting in the folder it reads;
 *   · the deliverables land in `src/assets/promotion/`, not `public/`: a cover
 *     is uploaded to a submission form by a human and never shipped to a player.
 *
 * What it produces, from `src/game/promotionSheet.ts`: every cover size as .jpg
 * and .webp, each cut from the master of its OWN aspect family.
 *
 * Compression: when `scripts/compress-images.mjs` exists (the
 * compress-images-pipeline skill), everything written is handed to it with
 * `--fresh --only`. Until then the deliverables ship as written — jpeg 92 at
 * 4:4:4 and webp 92, which is what the compressor would want as its input.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

// scripts/art → the project root is two folders up.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLIC = join(ROOT, 'public')
const DESK = join(ROOT, 'scripts', 'art', 'art-desk')
const SHEETS = join(ROOT, 'art-sheets', 'promotion')
const PAINTED = join(SHEETS, 'painted')
const OUT = join(ROOT, 'src', 'assets', 'promotion')
const COMPRESSOR = join(ROOT, 'scripts', 'compress-images.mjs')
const BACKUP = 'src/assets/promotion-backup'
const DOC = join(SHEETS, 'PROMPTS-PROMOTION.md')
const RECEIPT = join(PAINTED, '.painted.json')
const RENDERED = join(SHEETS, '.rendered.json')
const STATUS = join(SHEETS, 'PROMOTION-STATUS.md')

const { values: opt } = parseArgs({
  options: {
    plates: { type: 'boolean', default: false },
    // Negations are spelled out rather than written as `generate: false`,
    // because `parseArgs` has no `--no-x` form: it throws ERR_PARSE_ARGS_
    // UNKNOWN_OPTION on the flag the header documents.
    'no-generate': { type: 'boolean', default: false },
    'no-compress': { type: 'boolean', default: false },
    only: { type: 'string' },
    force: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
    cap: { type: 'string' },
    'keep-window': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  }
})

const generate = !opt['no-generate']
const compress = !opt['no-compress'] && existsSync(COMPRESSOR)

if (opt.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf-8')
    .split('*/')[0].split('\n').slice(2, 18).map((l) => l.replace(/^ \* ?/, '')).join('\n'))
  process.exit(0)
}

const { default: sharp } = await import('sharp')
const manifest = await import(pathToFileURL(join(ROOT, 'src', 'game', 'promotionSheet.ts')).href)
const {
  COVER_ASPECTS, COVER_FLOOR, COVER_FORMATS, PLATE_FOCUS, PLATE_LAYERS, PLATE_STREAKS,
  coverDeliverables, coverFile, plateStem, promotionPromptDoc, promptForCover
} = manifest

const rel = (f) => relative(ROOT, f).split('\\').join('/')
const rev = (buf) => createHash('sha1').update(buf).digest('hex').slice(0, 12)
const revOfFile = (f) => (existsSync(f) ? rev(readFileSync(f)) : null)
const readJson = (f, fallback) => {
  try { return JSON.parse(readFileSync(f, 'utf-8')) } catch { return fallback }
}
const writeJson = (f, v) => {
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, `${JSON.stringify(v, null, 2)}\n`, 'utf-8')
}

const wanted = opt.only ? new Set(opt.only.split(',').map((s) => s.trim()).filter(Boolean)) : null
const unknown = wanted ? [...wanted].filter((id) => !COVER_ASPECTS.some((a) => a.id === id)) : []
if (unknown.length) {
  console.error(`--only ${unknown.join(', ')}: no such aspect. Known: ${COVER_ASPECTS.map((a) => a.id).join(', ')}`)
  process.exit(2)
}
const aspects = COVER_ASPECTS.filter((a) => !wanted || wanted.has(a.id))

// ─── 1. The prompt document ─────────────────────────────────────────────────
//
// The manifest owns the TEXT, and this writes it out: the prompt a painter is
// handed by hand and the prompt this tool sends to Gemini have to be one
// string, or the hand route debugs a prompt the automated route never sent.

const doc = promotionPromptDoc()
const docCurrent = existsSync(DOC) && readFileSync(DOC, 'utf-8') === doc
if (opt.check) {
  if (docCurrent) {
    console.log(`  = ${rel(DOC)}  unchanged`)
    process.exit(0)
  }
  console.error(`  ! ${rel(DOC)} is out of date — run pnpm art:promotion --plates`)
  process.exit(1)
}
mkdirSync(SHEETS, { recursive: true })
if (docCurrent) {
  console.log(`  = ${rel(DOC)}  unchanged`)
} else {
  writeFileSync(DOC, doc, 'utf-8')
  console.log(`  ✓ ${rel(DOC)}  ${(doc.length / 1024).toFixed(0)} kB`)
}

// ─── 2. The plates ──────────────────────────────────────────────────────────
//
// A cover plate is the game's own painted cast, composited at the target aspect
// — the picture the painter restyles, and the cover that ships until one is
// painted. Built with sharp alone: every sprite it reads is already a finished
// bitmap under `public/`.

/** A layer's bitmap: resized, mirrored, rotated, faded. */
const layerBuffer = async (layer, short) => {
  const file = join(PUBLIC, layer.src)
  if (!existsSync(file)) return null
  const width = Math.max(8, Math.round(layer.size * short))
  let img = sharp(file).resize({ width, kernel: 'lanczos3' })
  if (layer.flip) img = img.flop()
  let buf = await img.png().toBuffer()
  if (layer.rotate) {
    buf = await sharp(buf).rotate(layer.rotate, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  }
  if (layer.opacity != null && layer.opacity < 1) {
    // sharp has no opacity knob: multiply the alpha channel down with a
    // one-pixel tile blended `dest-in`, which is the documented way.
    buf = await sharp(buf).composite([{
      input: Buffer.from([0, 0, 0, Math.round(layer.opacity * 255)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in'
    }]).png().toBuffer()
  }
  return buf
}

/**
 * Place a layer on a WxH plate, cropping it to what is actually visible.
 *
 * sharp refuses a composite that hangs off the base — "Image to composite must
 * have same dimensions or smaller" — and part of the cast is deliberately cut
 * by the frame, because a cover whose subjects all sit politely inside it
 * reads as a product shot. So only the visible rectangle is handed over.
 */
const place = async (buf, layer, W, H) => {
  const { width, height } = await sharp(buf).metadata()
  const left = Math.round(layer.cx * W - width / 2)
  const top = Math.round(layer.cy * H - height / 2)
  const sx = Math.max(0, -left)
  const sy = Math.max(0, -top)
  const vw = Math.min(width - sx, W - Math.max(0, left))
  const vh = Math.min(height - sy, H - Math.max(0, top))
  if (vw <= 0 || vh <= 0) return null
  const cropped = sx || sy || vw !== width || vh !== height
    ? await sharp(buf).extract({ left: sx, top: sy, width: vw, height: vh }).png().toBuffer()
    : buf
  return { input: cropped, left: Math.max(0, left), top: Math.max(0, top) }
}

const pctOf = (v) => `${(v * 100).toFixed(1)}%`

const glowSvg = (W, H, f) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
  + `<defs><radialGradient id="g" cx="${pctOf(f.x)}" cy="${pctOf(f.y)}" r="55%">`
  + '<stop offset="0%" stop-color="#ffb347" stop-opacity="0.62"/>'
  + '<stop offset="45%" stop-color="#ff7a2a" stop-opacity="0.2"/>'
  + '<stop offset="100%" stop-color="#ff7a2a" stop-opacity="0"/>'
  + `</radialGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`
)

/** Darkens the edges toward deep indigo — never toward black. CrazyGames'
 *  page is #0c0d14, and a cover whose edges are near-black melts into it. */
const vignetteSvg = (W, H, f) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
  + `<defs><radialGradient id="v" cx="${pctOf(f.x)}" cy="${pctOf(f.y)}" r="78%">`
  + '<stop offset="40%" stop-color="#1d1840" stop-opacity="0"/>'
  + '<stop offset="100%" stop-color="#1d1840" stop-opacity="0.55"/>'
  + `</radialGradient></defs><rect width="${W}" height="${H}" fill="url(#v)"/></svg>`
)

/**
 * The light trails, one tapered wedge per ball: zero width at the tail, the
 * ball's width at the ball, fading in as it goes. A ball sprite alone is a
 * round thing with no direction; the trail is what tells the painter the whole
 * volley is travelling, and where from.
 */
const streaksSvg = (W, H, streaks) => {
  const short = Math.min(W, H)
  const parts = streaks.map((s, i) => {
    const x0 = s.x0 * W
    const y0 = s.y0 * H
    const x1 = s.x1 * W
    const y1 = s.y1 * H
    const len = Math.hypot(x1 - x0, y1 - y0) || 1
    const nx = -(y1 - y0) / len
    const ny = (x1 - x0) / len
    const half = (s.width * short) / 2
    const pts = [[x0, y0], [x1 + nx * half, y1 + ny * half], [x1 - nx * half, y1 - ny * half]]
      .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
    return `<linearGradient id="s${i}" gradientUnits="userSpaceOnUse" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}">`
      + `<stop offset="0%" stop-color="${s.color}" stop-opacity="0"/>`
      + `<stop offset="100%" stop-color="${s.color}" stop-opacity="0.85"/></linearGradient>`
      + `<polygon points="${pts}" fill="url(#s${i})"/>`
  })
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`)
}

const buildPlate = async (aspect) => {
  const { w: W, h: H } = aspect.plate
  const short = Math.min(W, H)
  const focus = PLATE_FOCUS[aspect.shape]
  const floorFile = join(PUBLIC, COVER_FLOOR.src)
  if (!existsSync(floorFile)) throw new Error(`the cover floor ${COVER_FLOOR.src} is missing`)

  // The floor: the stone field cut out of the board backdrop and blown up to
  // COVER the plate. Blown up on purpose — at the board's own scale a 1920 px
  // cover is forty busy stones, which reads as noise that fights the subject.
  const fm = await sharp(floorFile).metadata()
  const c = COVER_FLOOR.crop
  const floor = await sharp(floorFile)
    .extract({
      left: Math.round(c.x * fm.width),
      top: Math.round(c.y * fm.height),
      width: Math.round(c.w * fm.width),
      height: Math.round(c.h * fm.height)
    })
    .resize(W, H, { fit: 'cover', kernel: 'lanczos3' })
    .png().toBuffer()
  const base = await sharp(floor)
    .composite([
      { input: glowSvg(W, H, focus) },
      { input: streaksSvg(W, H, PLATE_STREAKS[aspect.shape]) }
    ]).png().toBuffer()

  const layers = []
  const missing = []
  for (const layer of PLATE_LAYERS[aspect.shape]) {
    const buf = await layerBuffer(layer, short)
    if (!buf) { missing.push(layer.src); continue }
    const put = await place(buf, layer, W, H)
    if (put) layers.push(put)
  }
  const png = await sharp(base)
    .composite([...layers, { input: vignetteSvg(W, H, focus) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  return { png, missing }
}

const plateFile = (aspect) => join(SHEETS, `${plateStem(aspect)}.png`)

console.log('\nplates')
const plates = new Map()
for (const aspect of aspects) {
  const file = plateFile(aspect)
  const { png, missing } = await buildPlate(aspect)
  const before = existsSync(file) ? readFileSync(file) : null
  // Byte-identical plates keep their file — and so their mtime — because the
  // plate's revision is what decides whether a painting has gone stale, and
  // rewriting an unchanged plate would mark every cover for a repaint.
  if (!before?.equals(png)) writeFileSync(file, png)
  plates.set(aspect.id, { file, rev: rev(png) })
  const note = missing.length ? `  (${missing.length} sprite(s) missing: ${missing.join(', ')})` : ''
  console.log(`  ${before?.equals(png) ? '=' : '✓'} ${rel(file)}  ${aspect.plate.w}x${aspect.plate.h}${note}`)
}

if (opt.plates) {
  console.log('\n--plates: stopping before the painter.')
  process.exit(0)
}

// ─── 3. The masters ─────────────────────────────────────────────────────────
//
// One generation per aspect family, each in a chat of its own, through the Art
// Desk's Gemini window — the same signed-in Chrome profile, the same throttle,
// the same shared allowance ledger. The receipt records the PLATE revision a
// master was painted against and the master's own hash.

const receipt = readJson(RECEIPT, { files: {} })
receipt.files ??= {}

const masterOf = (aspect) => {
  const stem = plateStem(aspect)
  if (!existsSync(PAINTED)) return null
  const f = readdirSync(PAINTED).find((n) => /\.(png|jpe?g|webp)$/i.test(n) && n.replace(/\.[^.]+$/, '') === stem)
  return f ? join(PAINTED, f) : null
}

/** A family's current plate revision. An `--only` run builds just its own
 *  plates, so every other family is judged against the plate on disk. */
const plateRev = (aspect) => plates.get(aspect.id)?.rev ?? revOfFile(plateFile(aspect))

/** `paint` · `stale` · `ok` — what each family needs before anything is cut. */
const needs = (aspect) => {
  const master = masterOf(aspect)
  if (!master) return { state: 'paint', why: 'nothing painted yet', master: null }
  const line = receipt.files[basename(master)]
  const own = revOfFile(master)
  if (line?.painting && line.painting !== own) return { state: 'ok', why: 're-rolled by hand', master }
  if (line?.plate && line.plate !== plateRev(aspect)) {
    return { state: 'stale', why: `the plate changed (${line.plate} → ${plateRev(aspect)})`, master }
  }
  return { state: 'ok', why: 'painted', master }
}

const paintQueue = aspects
  .map((aspect) => ({ aspect, ...needs(aspect) }))
  .filter((j) => opt.force || j.state !== 'ok')

let painterError = null
let painted = 0

if (generate && paintQueue.length) {
  const { loadConfig } = await import(pathToFileURL(join(DESK, 'config.mjs')).href)
  const { Gemini } = await import(pathToFileURL(join(DESK, 'gemini.mjs')).href)
  const { countGeneration, usedOnAccount, usedToday } = await import(pathToFileURL(join(DESK, 'usage.mjs')).href)
  const cfg = loadConfig(ROOT)
  const g = cfg.gemini
  // The desk's cap is a ceiling this machine sets UNDER the account's real
  // allowance. `--cap` lifts it for one run; Gemini's own refusal (QUOTA) still
  // ends the run on the first one it gives.
  const dailyCap = opt.cap ? Number(opt.cap) : g.dailyCap
  const accountCap = g.accountCap ?? Infinity
  const painter = new Gemini({
    root: ROOT, profileDir: g.profileDir, url: g.url, chrome: g.chrome, chromeArgs: g.chromeArgs,
    log: (line, level) => console.log(`    ${level === 'err' ? '! ' : ''}${line}`)
  })

  console.log(`\npainting ${paintQueue.length} cover${paintQueue.length === 1 ? '' : 's'}`
    + `  (${usedToday()} generations today, cap ${dailyCap}; ${usedOnAccount()} on this account)`)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let consecutive = 0
  for (const [i, job] of paintQueue.entries()) {
    if (usedOnAccount() >= accountCap) {
      painterError = `this account has had ${usedOnAccount()} generations (cap ${accountCap})`
        + ' — sign a different one in through the Art Desk, then run this again'
      break
    }
    if (usedToday() >= dailyCap) {
      painterError = `daily cap reached (${usedToday()}/${dailyCap}) — pass --cap to lift it for one run`
      break
    }
    if (i > 0) {
      const gap = Math.round(g.gapSeconds + Math.random() * g.jitterSeconds)
      console.log(`  … waiting ${gap} s before the next generation`)
      await sleep(gap * 1000)
    }
    const plate = plates.get(job.aspect.id)
    console.log(`  → ${job.aspect.id} (${opt.force && job.state === 'ok' ? 'forced' : job.why})`)
    let last = ''
    try {
      countGeneration()
      const { bytes } = await painter.paint({
        refFile: plate.file,
        prompt: promptForCover(job.aspect),
        timeoutMs: g.timeoutSeconds * 1000,
        onPhase: (phase, quiet) => {
          if (quiet && phase === last) return
          last = phase
          console.log(`    ${phase}`)
        }
      })
      // A replaced master is archived rather than dropped: the one that came
      // back worse is the one you want back.
      mkdirSync(PAINTED, { recursive: true })
      const type = bytes.slice(0, 4).toString('hex') === '89504e47' ? 'png'
        : bytes.slice(0, 2).toString('hex') === 'ffd8' ? 'jpg' : 'webp'
      const dest = join(PAINTED, `${plateStem(job.aspect)}.${type}`)
      for (const old of readdirSync(PAINTED)) {
        if (/\.(png|jpe?g|webp)$/i.test(old) && old.replace(/\.[^.]+$/, '') === plateStem(job.aspect)) {
          const to = join(PAINTED, 'replaced', `${old.replace(/\.[^.]+$/, '')}.${Date.now()}${old.slice(old.lastIndexOf('.'))}`)
          mkdirSync(dirname(to), { recursive: true })
          renameSync(join(PAINTED, old), to)
          delete receipt.files[old]
        }
      }
      writeFileSync(dest, bytes)
      receipt.files[basename(dest)] = { plate: plate.rev, painting: rev(bytes), at: new Date().toISOString() }
      writeJson(RECEIPT, receipt)
      const meta = await sharp(bytes).metadata()
      console.log(`    ✓ ${rel(dest)}  ${meta.width}x${meta.height} ${type}, ${(bytes.length / 1024).toFixed(0)} kB`)
      painted++
      consecutive = 0
    } catch (e) {
      consecutive++
      console.log(`    ! ${job.aspect.id} failed: ${e.message}`)
      if (['QUOTA', 'SIGNED_OUT', 'CONSENT', 'BROWSER'].includes(e.code)) {
        painterError = `${e.code}: ${e.message}`
        break
      }
      if (consecutive >= g.maxConsecutiveFailures) {
        painterError = `${consecutive} failures in a row — stopping rather than spending the allowance on the same problem`
        break
      }
    }
  }
  if (!opt['keep-window']) await painter.closeWindow().catch(() => {})
} else if (paintQueue.length) {
  console.log(`\n${paintQueue.length} cover(s) have no current painting; --no-generate, so the plate is used instead.`)
}

// ─── 4. The deliverables ────────────────────────────────────────────────────
//
// Every size cut from its OWN family's master (or, failing that, its plate).
// `fit: cover` rather than `contain`, so a deliverable is never letterboxed —
// the plates are already at the deliverable's aspect, so the crop is a pixel
// or two and `cover` absorbs a return that came back 1376x768 for 16:9.
//
// Written GENEROUSLY (jpeg 92 4:4:4, webp 92). 4:4:4 because 4:2:0 bleeds
// colour across the hard saturated edges the whole cartoon palette is made of;
// 92 because a compressor, once installed, searches DOWN from what it is given.

/** What each deliverable was last cut from, and whether it has been
 *  compressed — two facts, so a `--no-compress` run cannot book a file as
 *  done forever. */
const rendered = readJson(RENDERED, { files: {} })
rendered.files ??= {}

const sourceFor = (aspect) => {
  const master = masterOf(aspect)
  return master
    ? { file: master, from: 'painted', rev: revOfFile(master) }
    : { file: plateFile(aspect), from: 'plate', rev: plateRev(aspect) }
}

mkdirSync(OUT, { recursive: true })
console.log('\ncovers')
const pending = []
let cut = 0
const sources = new Map()
for (const { aspect, size } of coverDeliverables()) {
  if (wanted && !wanted.has(aspect.id)) continue
  const src = sources.get(aspect.id) ?? sourceFor(aspect)
  sources.set(aspect.id, src)
  for (const format of COVER_FORMATS) {
    const name = coverFile(size, format)
    const file = join(OUT, name)
    const stamp = `${src.rev}:${size.w}x${size.h}:${format}`
    const seen = rendered.files[name]
    if (!opt.force && existsSync(file) && seen?.stamp === stamp) {
      if (compress && !seen.packed) pending.push({ file, name })
      console.log(`  = ${name}  unchanged (${src.from})${compress && !seen.packed ? ', never compressed' : ''}`)
      continue
    }
    const pipe = sharp(src.file).resize(size.w, size.h, { fit: 'cover', position: 'centre', kernel: 'lanczos3' }).flatten({ background: '#0c0a1c' })
    const buf = format === 'jpg'
      ? await pipe.jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
      : await pipe.webp({ quality: 92, effort: 6, smartSubsample: true }).toBuffer()
    writeFileSync(file, buf)
    rendered.files[name] = { stamp, packed: false }
    pending.push({ file, name })
    cut++
    console.log(`  ✓ ${name}  ${(buf.length / 1024).toFixed(0)} kB  (${src.from})`)
  }
}

// Written before the compressor runs as well as after it: a run that dies
// mid-compress has still CUT these files.
writeJson(RENDERED, rendered)

// ─── 5. Compress ────────────────────────────────────────────────────────────
//
// `--fresh --only <what was just written>`: these files are NEW originals, so
// any backup they have is from an older cut and compressing FROM it would ship
// the old cover.

const run = (argv) => new Promise((res) => {
  const [cmd, ...args] = argv
  const child = spawn(cmd === 'node' ? process.execPath : cmd, args, {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '0' }
  })
  child.on('close', (code) => res(code))
  child.on('error', () => res(-1))
})

let compressed = 0
if (compress && pending.length) {
  console.log(`\ncompressing ${pending.length} file(s)`)
  const code = await run([
    'node', rel(COMPRESSOR), 'src/assets/promotion',
    '--max-effort', '--backup-dir', BACKUP, '--fresh',
    '--only', pending.map((p) => rel(p.file)).join(',')
  ])
  if (code !== 0) {
    console.error(`\nthe compressor failed (exit ${code}) — the deliverables are written but not compressed`)
    process.exit(1)
  }
  for (const p of pending) rendered.files[p.name].packed = true
  writeJson(RENDERED, rendered)
  compressed = pending.length
} else if (!existsSync(COMPRESSOR) && !opt['no-compress']) {
  console.log(`\nno ${rel(COMPRESSOR)} in this project — the covers ship as written (jpeg 92 4:4:4, webp 92)`)
}

// ─── 6. What stands ─────────────────────────────────────────────────────────

const MARKS = { ok: '✓', stale: '!', paint: '·' }
const rows = COVER_ASPECTS.map((a) => {
  const n = needs(a)
  const src = sources.get(a.id) ?? sourceFor(a)
  return {
    id: a.id,
    label: a.label,
    mark: MARKS[n.state],
    // A stale master still ships (it is the best painting there is); only a
    // family with NO master falls back to its plate.
    state: n.state === 'ok' ? n.why
      : n.state === 'stale' ? `${n.why} — still shipping this painting; pnpm art:promotion re-rolls it`
        : `${n.why} — the plate is shipping instead`,
    from: src.from,
    sizes: a.sizes.map((s) => `${s.w}x${s.h}`).join(', ')
  }
})

const tally = rows.reduce((t, r) => ({ ...t, [r.mark]: (t[r.mark] ?? 0) + 1 }), {})
const ours = new Set(coverDeliverables().flatMap(({ size }) => COVER_FORMATS.map((f) => coverFile(size, f))))
const files = readdirSync(OUT).filter((f) => ours.has(f)).length

writeFileSync(STATUS, [
  '# Promotion status — generated by `pnpm art:promotion`',
  '',
  'A report, not a contract: a picture of `art-sheets/promotion/painted/` and',
  '`src/assets/promotion/` at the moment it was written.',
  '',
  `**${tally['✓'] ?? 0} painted · ${tally['!'] ?? 0} need a repaint · ${tally['·'] ?? 0} still the plate`
  + ` — ${files} cover files in \`src/assets/promotion/\`**`,
  '',
  '| | Aspect | Cuts | Shipping | State |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.mark} | **${r.id}** ${r.label} | \`${r.sizes}\` | ${r.from} | ${r.state} |`),
  '',
  '## What the marks mean',
  '',
  '* **✓** painted from the plate that is on disk now.',
  '* **!** painted from a plate that has since been rebuilt — the cast, the',
  '  layout or the floor moved. `pnpm art:promotion` re-rolls it.',
  '* **·** nothing painted for this aspect. The deliverables are cut from the',
  '  PLATE, a real composition of the game\'s real painted cast, so the folder is',
  '  complete and looks like a blocking pass rather than a cover.',
  '',
  'Every cover is painted without text, without a logo and without any interface.',
  'See `src/game/promotionSheet.ts`.',
  ''
].join('\n'), 'utf-8')

console.log('')
for (const r of rows) console.log(`  ${r.mark} ${r.id.padEnd(5)} ${r.sizes.padEnd(28)} ${r.from.padEnd(7)} ${r.state}`)
console.log(`\n${rel(OUT)}: ${files} cover files  ·  ${painted} painted, ${cut} cut, ${compressed} compressed`)
console.log(`${rel(STATUS)} written`)

if (painterError) {
  console.error(`\nthe painter stopped: ${painterError}`)
  process.exit(1)
}
