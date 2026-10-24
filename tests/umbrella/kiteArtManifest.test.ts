// ─── The kite art manifest, prompts and registration ───────────────────────
import { describe, expect, it } from 'vitest'
import { GAME_SHEETS, PANEL, SHEETS, boxOf, sheetById } from '@/umbrella/art/manifest'
import { alsoOf, block, buildIndex, paintOrder, promptBody, promptDocs, promptFor } from '@/umbrella/art/prompts'
import { bakePanel } from '@/umbrella/art/bake'
import { tiersFor, sheetsForLevel } from '@/umbrella/art/sheets'
// @ts-expect-error — plain .mjs, no types
import { parsePromptDoc } from '../../scripts/art/umbrella-desk/jobs.mjs'
import { boundsCtx } from './helpers/boundsCtx'

describe('kite art manifest', () => {
  it('has unique ids, valid lattices, animations inside their sheets and known models', () => {
    const ids = new Set<string>()
    for (const s of SHEETS) {
      expect(ids.has(s.id), s.id).toBe(false)
      ids.add(s.id)
      expect(s.cols * s.rows).toBeGreaterThan(0)
      // Square sheets only: the free image app has no 2:1, and the slicer refuses a crushed grid.
      expect(s.cols, s.id).toBe(s.rows)
      for (const [name, a] of Object.entries(s.anims)) {
        expect(a.frames.length, `${s.id}.${name}`).toBeGreaterThan(0)
        for (const f of a.frames) expect(f >= 0 && f < s.cols * s.rows, `${s.id}.${name} frame ${f}`).toBe(true)
      }
      if (s.model) expect(sheetById(s.model)?.use, s.id).toBe('model')
      if (s.use === 'sprite' || s.use === 'model') expect(s.box ?? s.boxes, s.id).toBeTruthy()
      if (s.boxes) expect(s.boxes.length).toBe(s.cols * s.rows)
    }
  })

  it('asks for 16 frames per character animation', () => {
    for (const s of GAME_SHEETS.filter((x) => x.group === 'pweeg' || x.group === 'chad')) expect(s.cols * s.rows, s.id).toBe(16)
  })

  it('paints every model sheet before the sheets that attach it', () => {
    const order = paintOrder().map((s) => s.id)
    for (const s of SHEETS) if (s.model) expect(order.indexOf(s.model)).toBeLessThan(order.indexOf(s.id))
    expect(order.length).toBe(SHEETS.length)
  })
})

describe('kite art prompts', () => {
  const docs = promptDocs()

  it('writes one fenced block per sheet, the heading outside the fence', () => {
    const all = Object.values(docs).join('\n')
    expect((all.match(/^## /gm) ?? []).length).toBe(SHEETS.length)
    for (const text of Object.values(docs)) {
      const lines = text.split('\n')
      let open: string | null = null
      for (const l of lines) {
        const m = /^(`{3,})(text)?$/.exec(l)
        if (!m) continue
        if (open === null) { expect(m[2]).toBe('text'); open = m[1]! } else if (m[1] === open && !m[2]) open = null
      }
      expect(open).toBeNull()
    }
  })

  it('hands the Art Desk exactly what the manifest wrote, model first, layout last', () => {
    const jobs = Object.entries(docs).flatMap(([doc, text]) => parsePromptDoc(text, doc)) as { title: string; refName: string; also: string[]; target: string; prompt: string }[]
    expect(jobs.length).toBe(SHEETS.length)
    for (const s of SHEETS) {
      const job = jobs.find((j) => j.refName === `${s.id}.png`)!
      expect(job, s.id).toBeTruthy()
      expect(job.prompt).toBe(promptBody(promptFor(s)))
      expect(job.also).toEqual(alsoOf(s))
      expect(block(promptFor(s)).startsWith(`## ${s.title}`)).toBe(true)
    }
  })

  it('names the deliverable first and last, carries the magenta contract and no stray copy', () => {
    for (const s of SHEETS) {
      const p = promptBody(promptFor(s))
      expect(p.startsWith('WHAT COMES BACK'), s.id).toBe(true)
      expect(p.trimEnd().split('\n').pop()!.startsWith('OUTPUT: one image, 1024 x 1024'), s.id).toBe(true)
      expect(p).toContain('#FF00FF')
      expect(p).toContain('CEL-SHADED')
      if (s.model) expect(p).toContain('MODEL SHEET')
    }
  })

  it('indexes every sheet for the slicer, blocks and pillars exempt from the flood fill', () => {
    const index = buildIndex()
    expect(index.walks.length).toBe(SHEETS.length)
    for (const w of index.walks) {
      const s = sheetById(w.id)!
      expect(w.width).toBe(s.cols * PANEL)
      expect(w.layout).toBe('grid')
      if (s.use === 'nine' || s.use === 'pillar') expect((w as { autoBg?: boolean }).autoBg).toBe(false)
    }
  })
})

describe('kite art registration', () => {
  // The reference frame IS the vector drawing through the frame's box, and
  // the renderer blits the painting back through the same box — so the
  // drawing must fit inside the box, or the painted frame is cut off.
  it('every vector reference frame fits inside its registration box', () => {
    for (const s of SHEETS.filter((x) => x.use === 'sprite' || x.use === 'model')) {
      for (let i = 0; i < s.cols * s.rows; i++) {
        const box = boxOf(s, i)
        const { ctx, bounds } = boundsCtx()
        bakePanel(ctx, s, i)
        if (bounds.empty) continue
        const x0 = -box.ax * box.size
        const y0 = -box.ay * box.size
        const tol = box.size * 0.01
        expect(bounds.x0, `${s.id}#${i + 1} left`).toBeGreaterThanOrEqual(x0 - tol)
        expect(bounds.y0, `${s.id}#${i + 1} top`).toBeGreaterThanOrEqual(y0 - tol)
        expect(bounds.x1, `${s.id}#${i + 1} right`).toBeLessThanOrEqual(x0 + box.size + tol)
        expect(bounds.y1, `${s.id}#${i + 1} bottom`).toBeLessThanOrEqual(y0 + box.size + tol)
      }
    }
  })
})

describe('kite art staged loading', () => {
  const levels = [
    { hazards: [{ kind: 'pillar' }] },
    { hazards: [{ kind: 'mine' }] },
    { hazards: [] },
    { hazards: [] },
    { hazards: [] },
    { hazards: [{ kind: 'fan' }], buttons: [{}] }
  ]
  it('knows what a level needs', () => {
    expect(sheetsForLevel(levels[5])).toEqual(['fan', 'props'])
  })
  const all = () => true
  it('loads the resume level\'s enemies and the first screen behind the splash', () => {
    const [t0, t1, t2] = tiersFor(levels, 0, true, all)
    expect(t0).toEqual(expect.arrayContaining(['pweeg-idle', 'pweeg-walk', 'umbrella', 'platform', 'wind-wisps', 'walldorf-body', 'walldorf-face']))
    expect(t0).not.toContain('prickbait')
    expect(t1).toContain('prickbait') // the next level's
    expect(t2).toEqual(expect.arrayContaining(['fan', 'chad-idle']))
    expect(new Set([...t0, ...t1, ...t2]).size).toBe(GAME_SHEETS.length)
  })
  it('runs outward from where a returning player resumes, and puts Chad first for a new one', () => {
    const [t0] = tiersFor(levels, 5, true, all)
    expect(t0).toEqual(expect.arrayContaining(['fan', 'props']))
    expect(t0).not.toContain('walldorf-body')
    expect(tiersFor(levels, 0, false, all)[0]).toEqual(expect.arrayContaining(['chad-idle', 'chad-walk', 'chad-hover']))
  })
  it('never requests a sheet that did not ship (no 404 in a portal console)', () => {
    const [t0, t1, t2] = tiersFor(levels, 0, false, (id) => id === 'umbrella')
    expect([...t0, ...t1, ...t2]).toEqual(['umbrella'])
  })
})
