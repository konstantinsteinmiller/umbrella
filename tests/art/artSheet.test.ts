// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ART_CATALOGUE, ART_KEYS, ART_PATHS } from '@/game/artCatalogue'
import {
  ART_DRAWABLES, buildIndex, promptBody, promptDocs, promptFor, referenceFile, referenceSize, targetOf
} from '@/game/artSheet'
// @ts-expect-error — the Art Desk is a plain .mjs tool, no type declarations.
import { parsePromptDoc, imageSize } from '../../scripts/art/art-desk/jobs.mjs'

/**
 * ─── The art manifest is the pipeline's contract ────────────────────────────
 *
 * Three consumers read `src/game/artSheet.ts` and none of them can see each
 * other: the bench (browser) renders references from it, `pnpm art:prompts`
 * (Node) writes the prompt documents from it, and the Art Desk sends the
 * prompt text it PARSES BACK out of those documents to the image model. These
 * cases are what keeps the three describing the same drawables in the same
 * words.
 */

const PUBLIC = resolve(__dirname, '../../public')

describe('the manifest covers the catalogue exactly', () => {
  it('feeds every catalogue key from exactly one drawable', () => {
    const owners = new Map<string, string[]>()
    for (const d of ART_DRAWABLES) for (const k of d.keys) owners.set(k, [...(owners.get(k) ?? []), d.id])
    for (const k of ART_KEYS) expect(owners.get(k), `${k} has no drawable`).toHaveLength(1)
    expect([...owners.keys()].sort()).toEqual([...ART_KEYS].sort())
  })

  it('writes each drawable to the file its keys probe — shared keys share a file', () => {
    for (const d of ART_DRAWABLES) {
      for (const k of d.keys) expect(`${ART_PATHS[k]}.webp`).toBe(targetOf(d))
    }
    const targets = ART_DRAWABLES.map(targetOf)
    expect(new Set(targets).size, 'two drawables write one file').toBe(targets.length)
  })

  it('groups every key into exactly one status kind', () => {
    const grouped = Object.values(ART_CATALOGUE).flat()
    expect([...grouped].sort()).toEqual([...ART_KEYS].sort())
  })

  it('uses unique reference names the slicer can tell apart', () => {
    const ids = ART_DRAWABLES.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })
})

describe('the lattice is the contract', () => {
  it('matches the shape of the file that ships, so a re-slice writes the same shape', () => {
    for (const d of ART_DRAWABLES) {
      const file = resolve(PUBLIC, targetOf(d))
      if (!existsSync(file)) continue
      const size = imageSize(readFileSync(file))
      expect(size, `${targetOf(d)} header unreadable`).toBeTruthy()
      // ±2 px: fighter-7 ships at 254 on a 256 lattice; the bench contain-fits it.
      expect(Math.abs(size.w - d.panel.w * d.cols), `${d.id} width`).toBeLessThanOrEqual(2)
      expect(Math.abs(size.h - d.panel.h * d.rows), `${d.id} height`).toBeLessThanOrEqual(2)
    }
  })

  it('draws every reference on whole pixels, 3×3 for the VFX sheets', () => {
    for (const d of ART_DRAWABLES) {
      const r = referenceSize(d)
      expect(Number.isInteger(r.w) && Number.isInteger(r.h), d.id).toBe(true)
      if (d.group === 'vfx') {
        expect([d.cols, d.rows, d.panel.w, d.panel.h]).toEqual([3, 3, 128, 128])
      } else {
        expect([d.cols, d.rows]).toEqual([1, 1])
      }
    }
  })

  it('hands the slicer one walk per transparent drawable, scenery for the backdrops', () => {
    const index = buildIndex()
    expect(index.walks).toHaveLength(ART_DRAWABLES.filter((d) => d.bg === 'magenta').length)
    expect(index.scenery.map((s) => s.id).sort()).toEqual(['arena-bg', 'arena-scene-bg'])
    for (const w of index.walks) {
      expect(w.width).toBe(w.panel.w * w.cols)
      expect(w.height).toBe(w.panel.h * w.rows)
      expect(w.aliases.length).toBeGreaterThan(0)
      expect(w.layout).toBe(w.frames > 1 ? 'grid' : 'strip')
    }
    // Empty by design: impact sheets fade out, the wings have a gap.
    const nominal = index.walks.filter((w) => w.gridCheck === 'nominal').map((w) => w.id)
    expect(nominal).toContain('prop-revive-wings')
    expect(nominal.filter((id) => id.startsWith('vfx-impact-'))).toHaveLength(6)
  })
})

describe('the prompt documents', () => {
  const docs = promptDocs()

  it('are deterministic — a re-run cannot churn them', () => {
    expect(promptDocs()).toEqual(docs)
  })

  it('parse back into exactly the manifest\'s text — the Art Desk sends what it parses', () => {
    // DESK.md setup step 7: without this, the automated queue could paint from
    // text nobody wrote.
    let blocks = 0
    for (const [name, text] of Object.entries(docs)) {
      const jobs = parsePromptDoc(text, name) as { title: string; refName: string; target: string | null; prompt: string }[]
      const expected = ART_DRAWABLES.filter((d) => d.doc === name)
      expect(jobs, name).toHaveLength(expected.length)
      jobs.forEach((job, i) => {
        const d = expected[i]!
        expect(job.refName).toBe(referenceFile(d))
        expect(job.target).toBe(targetOf(d))
        expect(job.prompt).toBe(promptBody(promptFor(d)))
      })
      blocks += jobs.length
    }
    expect(blocks).toBe(ART_DRAWABLES.length)
  })

  it('fence every block once, with the heading outside the fence', () => {
    for (const text of Object.values(docs)) {
      const lines = text.split('\n')
      const headings = lines.filter((l) => l.startsWith('## ')).length
      const opens = lines.filter((l) => /^`{3,}text$/.test(l)).length
      const closes = lines.filter((l) => /^`{3,}$/.test(l)).length
      expect(opens).toBe(headings)
      expect(closes).toBe(headings)
    }
  })

  it('carry the clauses that decide whether a return is usable', () => {
    for (const d of ART_DRAWABLES) {
      const p = promptFor(d)
      expect(p, d.id).toContain('OUTPUT: one image')
      expect(p, d.id).toContain('BEFORE YOU CALL IT FINISHED')
      if (d.bg === 'opaque') {
        // A backdrop IS the background: a magenta clause would weld chroma into it.
        expect(p, d.id).not.toContain('#FF00FF')
        expect(p, d.id).toContain('IT FILLS THE IMAGE')
      } else {
        expect(p, d.id).toContain('EXACTLY #FF00FF')
        expect(p, d.id).toContain('KEEP ANY GLOW TIGHT')
      }
      if (d.cols * d.rows > 1) {
        expect(p, d.id).toContain('READ THE PANELS')
        expect(p, d.id).toContain('Not 1, not 4, not 16')
        expect(p, d.id).toContain('Do NOT draw the panel edges')
      }
    }
  })

  it('quote the measured box once the bench has measured one', () => {
    const d = ART_DRAWABLES.find((x) => x.id === 'unit-fighter-3')!
    const p = promptFor(d, { w: 0.62, h: 0.71, cx: 0.5, cy: 0.52, bottom: 0.87 })
    expect(p).toContain('spans 62% of the canvas\'s width and 71% of its height')
  })
})
