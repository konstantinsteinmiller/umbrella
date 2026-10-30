#!/usr/bin/env node
/**
 * Regenerate `art-sheets/PROMPTS-*.md` from the manifest, with no browser.
 *
 *   pnpm art:prompts            # writes the prompt documents + PAINT-STATUS.md
 *   pnpm art:prompts --check    # exits 1 if a prompt document is out of date (CI)
 *
 * The bench (`/#/art-sheets`) writes the same files on export, with the fits
 * it measured folded into the SIZE clauses. This script reads those measured
 * fits back out of `art-sheets/sheet-index.json` when one exists, so the two
 * routes produce the same text — and a manifest change (a reworded blurb, a new
 * drawable) has its prompt the moment this runs, before anyone opens a browser.
 * The manifest chain is pure TypeScript with no Vue and no `import.meta.env`;
 * `scripts/art/ts-resolve.mjs` is what lets Node load it.
 *
 * Run through the `--import` hook (the pnpm script does):
 *   node --import ./scripts/art/ts-resolve.mjs scripts/art/art-prompts.mjs
 *
 * (From the art-generation-pipeline skill, glyphyx template, adapted to
 * umbrella's manifest: `ART_DRAWABLES`, one reference per drawable.)
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// umbrella: `--set umbrella` writes the Umbrella KITE art's documents
// (src/umbrella/art/manifest.ts + prompts.ts → art-sheets/umbrella/). Without
// it: the barrage set, exactly as before.
// `--set umbrella-lantern`: the lantern build's art (src/umbrella/art/lantern.ts →
// art-sheets/umbrella-lantern/). Its sheets are painted over the kite set's own
// references, so this copies those references across and writes the lantern
// index from the kite index (same lattice, same measured fits).
const SET_AT = process.argv.indexOf('--set')
const SET = SET_AT > 1 ? process.argv[SET_AT + 1] ?? null : null
// `--set umbrella-clay`: the clay build's art (src/umbrella/art/clay.ts → art-sheets/umbrella-clay/), the same way.
const PAINTED_SETS = {
  'umbrella-lantern': { file: 'lantern.ts', sheets: 'LANTERN_SHEETS', dir: 'LANTERN_DIR', index: 'buildLanternIndex', doc: ['PROMPTS-LANTERN.md', 'lanternPromptDoc'], cmd: 'pnpm art:prompts:lantern' },
  'umbrella-clay': { file: 'clay.ts', sheets: 'CLAY_SHEETS', dir: 'CLAY_DIR', index: 'buildClayIndex', doc: ['PROMPTS-CLAY.md', 'clayPromptDoc'], cmd: 'pnpm art:prompts:clay' }
}
if (SET && SET !== 'umbrella' && !PAINTED_SETS[SET]) { console.error(`--set ${SET} is unknown (known: umbrella, ${Object.keys(PAINTED_SETS).join(', ')})`); process.exit(1) }
const OUT = SET ? join(ROOT, 'art-sheets', SET) : join(ROOT, 'art-sheets')
const INDEX = join(OUT, 'sheet-index.json')
const PAINTED = join(OUT, 'painted')
const CHECK = process.argv.includes('--check')

if (PAINTED_SETS[SET]) {
  const P = PAINTED_SETS[SET]
  const pr = await import(pathToFileURL(join(ROOT, 'src', 'umbrella', 'art', 'prompts.ts')).href)
  const mod = await import(pathToFileURL(join(ROOT, 'src', 'umbrella', 'art', P.file)).href)
  const ln = { SHEETS: mod[P.sheets], DIR: mod[P.dir], buildIndex: mod[P.index], promptDoc: mod[P.doc[1]] }
  const KITE = join(ROOT, 'art-sheets', 'umbrella')
  const kiteIndex = JSON.parse(readFileSync(join(KITE, 'sheet-index.json'), 'utf-8'))
  const fits = {}
  for (const w of kiteIndex.walks ?? []) if (w.fit) fits[w.id] = w.fit
  const files = {
    'sheet-index.json': `${JSON.stringify(ln.buildIndex(fits), null, 1)}\n`,
    [P.doc[0]]: ln.promptDoc(fits)
  }
  mkdirSync(PAINTED, { recursive: true })
  let stale = 0
  for (const s of ln.SHEETS) {
    const ref = `${s.id}.png`
    // The collectibles and the gate have no kite reference (scripts/art/lantern-refs.py draws theirs).
    if (!existsSync(join(KITE, ref))) continue
    const from = readFileSync(join(KITE, ref))
    const to = join(OUT, ref)
    if (existsSync(to) && readFileSync(to).equals(from)) continue
    stale++
    if (CHECK) console.error(`  ! ${ref} differs from the kite reference`)
    else { writeFileSync(to, from); console.log(`  ✓ ${ref}  (reference, from art-sheets/umbrella/)`) }
  }
  for (const [name, text] of Object.entries(files)) {
    const file = join(OUT, name)
    if (existsSync(file) && readFileSync(file, 'utf-8') === text) { console.log(`  = ${name}  unchanged`); continue }
    stale++
    if (CHECK) console.error(`  ! ${name} is out of date — run ${P.cmd}`)
    else { writeFileSync(file, text, 'utf-8'); console.log(`  ✓ ${name}`) }
  }
  const painted = existsSync(PAINTED) ? readdirSync(PAINTED).map((f) => basename(f).replace(/\.[^.]+$/, '')) : []
  const { targetOf } = await import(pathToFileURL(join(ROOT, 'src', 'umbrella', 'art', 'manifest.ts')).href)
  const shipped = (s) => existsSync(join(ROOT, ln.DIR, targetOf(s)))
  for (const s of pr.paintOrder(ln.SHEETS)) console.log(`  ${shipped(s) ? '✓ shipped' : painted.includes(s.id) ? '? painted' : '· to paint'}  ${s.id}`)
  console.log(`  ${existsSync(join(ROOT, ln.DIR, 'backdrop.webp')) ? '✓ shipped' : '· to paint'}  backdrop`)
  if (CHECK && stale) process.exit(1)
  process.exit(0)
}

/** One shape for both manifests: drawables with { id, title, doc, keys },
 *  the documents, each drawable's target, the folder targets live under. */
const manifest = SET === 'umbrella'
  ? await (async () => {
      const m = await import(pathToFileURL(join(ROOT, 'src', 'umbrella', 'art', 'manifest.ts')).href)
      const pr = await import(pathToFileURL(join(ROOT, 'src', 'umbrella', 'art', 'prompts.ts')).href)
      const drawables = pr.paintOrder().map((s) => ({ ...s, keys: [] }))
      return {
        ART_DRAWABLES: drawables,
        promptDocs: pr.promptDocs,
        targetOf: m.targetOf,
        shippedRoot: m.SHIPPED_DIR,
        manifestTargets: () => new Set(drawables.map((s) => m.targetOf(s))),
        shippedNote: 'Nothing in the kite build is painted until its sheet ships here, so `·` means "still the vector drawing".'
      }
    })()
  : await (async () => {
      const m = await import(pathToFileURL(join(ROOT, 'src', 'game', 'artSheet.ts')).href)
      return { ...m, shippedRoot: 'public', shippedNote: null }
    })()

/** The fits the bench measured last time it exported, if it has. */
const fitsFromIndex = () => {
  if (!existsSync(INDEX)) return undefined
  try {
    const index = JSON.parse(readFileSync(INDEX, 'utf-8'))
    const fits = {}
    for (const w of index.walks ?? []) if (w.fit) fits[w.id] = w.fit
    return Object.keys(fits).length ? fits : undefined
  } catch {
    return undefined
  }
}

const fits = fitsFromIndex()
const docs = manifest.promptDocs(fits)
mkdirSync(OUT, { recursive: true })

let stale = 0
for (const [name, text] of Object.entries(docs)) {
  const file = join(OUT, name)
  const current = existsSync(file) ? readFileSync(file, 'utf-8') : null
  if (current === text) {
    console.log(`  = ${name}  unchanged`)
    continue
  }
  stale++
  if (CHECK) {
    console.error(`  ! ${name} is out of date — run pnpm art:prompts`)
    continue
  }
  writeFileSync(file, text, 'utf-8')
  console.log(`  ✓ ${name}  ${(text.length / 1024).toFixed(0)} kB`)
}

// ─── What is painted, what is not, and what has gone out of date ────────────
//
// The prompts say how to paint every drawable; they never say which ones still
// NEED painting — and the one state nobody thinks to look for, a painting
// whose reference has since been re-cut, is invisible until it is sliced back
// over the corrected art.
//
// The revision of a reference is the first 12 hex of a sha1 over the CLEAN
// reference the bench exported — the same number `scripts/art/slice-sheets.mjs`
// records in its receipt, so "the reference changed since this was painted" is
// one string comparison in both tools, and in the Art Desk.

const revOf = (file) => (existsSync(file) ? createHash('sha1').update(readFileSync(file)).digest('hex').slice(0, 12) : null)

const receipt = (() => {
  const f = join(PAINTED, '.sliced.json')
  if (!existsSync(f)) return {}
  try { return JSON.parse(readFileSync(f, 'utf-8')).files ?? {} } catch { return {} }
})()

const paintings = existsSync(PAINTED)
  ? readdirSync(PAINTED).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  : []
const quarantined = existsSync(join(PAINTED, 'stale'))
  ? readdirSync(join(PAINTED, 'stale')).filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
  : []

const stemOf = (f) => basename(f).replace(/\.[^.]+$/, '')
// Exact stem first; a bare catalogue key (`fighter-10.png`) as the fallback —
// the slicer accepts both, and the longest match wins so `fighter-1` never
// claims `fighter-10`.
const paintingFor = (d) => paintings.find((f) => stemOf(f) === d.id)
  ?? paintings
    .filter((f) => d.keys.some((k) => stemOf(f).toLowerCase() === k.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0]

const stateOf = (d) => {
  const rev = revOf(join(OUT, `${d.id}.png`))
  const painting = paintingFor(d)
  if (!painting) {
    const parked = quarantined.find((f) => stemOf(f) === d.id)
    return parked
      ? { mark: '!', state: 'REPAINT — the old one is parked in `painted/stale/`', painting: parked, rev }
      : { mark: '·', state: 'not painted yet', painting: null, rev }
  }
  let seen = receipt[painting]
  // The receipt line belongs to the painting it was written for: the same name
  // with different bytes is a re-roll nobody has sliced yet.
  if (seen?.painting && seen.painting !== revOf(join(PAINTED, painting))) seen = undefined
  if (seen?.rev && rev && seen.rev !== rev) {
    return { mark: '!', state: `REPAINT — the reference changed (${seen.rev} → ${rev})`, painting, rev }
  }
  if (!seen) return { mark: '?', state: 'painted; no receipt yet — `pnpm art:slice -- --dry` to check it', painting, rev }
  return { mark: '✓', state: `sliced ${String(seen.at).slice(0, 10)}`, painting, rev }
}

const rows = manifest.ART_DRAWABLES.map((d) => ({
  id: d.id, title: d.title, doc: d.doc, target: manifest.targetOf(d),
  shipped: existsSync(join(ROOT, manifest.shippedRoot, manifest.targetOf(d))),
  ...stateOf(d)
}))

const tally = { '✓': 0, '!': 0, '?': 0, '·': 0 }
for (const r of rows) tally[r.mark]++

const status = [
  '# Paint status — generated by `pnpm art:prompts`',
  '',
  'A report, not a contract: it is a picture of `art-sheets/painted/` and the',
  'slicer\'s receipt at the moment it was written. Re-run `pnpm art:prompts`',
  'after painting or slicing anything.',
  '',
  ...(manifest.shippedNote
    ? [manifest.shippedNote, 'Paint the model sheets first: every animation sheet of a character attaches its painted model.']
    : ['Every slot in this game already SHIPS a painting (the "Shipped" column), so',
        '`·` here means "no repaint through the pipeline yet", not "still procedural".']),
  '',
  `**${tally['✓']} sliced · ${tally['!']} need a repaint · ${tally['?']} painted, unreceipted · ${tally['·']} not repainted**`,
  '',
  `| | Drawable | Prompt block in | Reference | Shipped (under \`${manifest.shippedRoot}/\`) | State |`,
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.mark} | **${r.title}** | \`${r.doc}\` | \`${r.id}.png\`${r.rev ? ` (rev \`${r.rev}\`)` : ' — *missing, run `pnpm art:export`*'} | ${r.shipped ? '✓' : '—'} \`${r.target}\` | ${r.state} |`),
  '',
  '## What the marks mean',
  '',
  '* **✓** sliced, and the reference has not moved since.',
  '* **!** a painting of a reference that has since been RE-CUT. `pnpm art:slice`',
  '  refuses it and says so; repaint from the new reference, or `--stale-ok` if',
  '  you know the change was cosmetic.',
  '* **?** a painting is sitting in `painted/` with no receipt against it. That',
  '  is not evidence it was never cut, so run `pnpm art:slice -- --dry` and read',
  '  what it says it would write.',
  '* **·** nothing painted through the pipeline for this one yet — attach the',
  '  reference and paste its block from the prompt file named above.',
  ''
].join('\n')

const statusFile = join(OUT, 'PAINT-STATUS.md')
if (!CHECK) {
  writeFileSync(statusFile, status, 'utf-8')
  console.log(`  ✓ PAINT-STATUS.md  ${tally['✓']} sliced, ${tally['!']} stale, ${tally['?']} uncut, ${tally['·']} not repainted`)
}

console.log(`\n${manifest.ART_DRAWABLES.length} drawables, ${manifest.manifestTargets().size} targets`
  + (fits ? ' (SIZE clauses use the fits the bench measured)' : ' (no sheet-index.json yet — SIZE clauses use the nominal wording)'))
if (CHECK && stale) process.exit(1)
