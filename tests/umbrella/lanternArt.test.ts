// The lantern build (?art=lantern, VITE_APP_LANTERN=true): the normal game drawn
// with the "Paper Moon" sheets. Its sheets are painted over the kite set's own
// references, so paint.ts draws them unchanged — which holds only while every
// lantern sheet keeps the kite manifest's lattice, registration and animations.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SHEETS, sheetById } from '@/umbrella/art/manifest'
import { BACKDROP, LANTERN_LOOK, LANTERN_SHEETS, buildLanternIndex, lanternPromptDoc } from '@/umbrella/art/lantern'
import { promptFor } from '@/umbrella/art/prompts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('lantern sheets', () => {
  it('keep the kite manifest lattice, registration and animations of the same id', () => {
    for (const s of LANTERN_SHEETS) {
      const k = sheetById(s.id)
      expect(k, s.id).toBeDefined()
      // A sheet repainted from a card of its own earlier painting names itself as its model: no other sheet's.
      const shape = (x: typeof s) => ({ use: x.use, cols: x.cols, rows: x.rows, box: x.box, boxes: x.boxes, anims: x.anims, fit: x.fit, model: x.model === x.id ? undefined : x.model })
      expect(shape(s), s.id).toEqual(shape(k!))
    }
  })

  it('cover every drawable the game paints, plus the collectibles and the gate', () => {
    const ids = LANTERN_SHEETS.map((s) => s.id)
    const kiteOnly = new Set(['kite', 'chad-kite'])
    for (const s of SHEETS.filter((x) => !kiteOnly.has(x.group))) expect(ids, s.id).toContain(s.id)
    expect(ids).toEqual(expect.arrayContaining(['collect', 'gate']))
  })

  it('are prompted in the papercraft style, never the kite crayon one', () => {
    for (const s of LANTERN_SHEETS) {
      const p = promptFor(s, undefined, LANTERN_LOOK)
      expect(p, s.id).toContain('PAPERCRAFT')
      expect(p, s.id).not.toMatch(/crayon|coloured-pencil|KITES/i)
    }
    expect(BACKDROP.prompt).toMatch(/16:9/)
    expect(lanternPromptDoc()).toContain('## Backdrop')
  })

  it('ship to their own folder, apart from the kite paint', () => {
    expect(buildLanternIndex().outDir).toBe('src/assets/umbrella-art-lantern')
    // Every sheet but the gate (one pipe, cut by scripts/art/lantern-refs.py --cut).
    expect(buildLanternIndex().walks.map((w) => w.id)).toEqual(LANTERN_SHEETS.map((s) => s.id).filter((id) => id !== 'gate'))
  })
})

describe('the lantern build', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('is the same game: the campaign, and revision N\'s save under /umbrella/<N>/lantern/', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_APP_LANTERN', 'true')
    vi.stubEnv('BASE_URL', '/umbrella/11/lantern/')
    const { STATE_KEY } = await import('@/use/useEpicState')
    expect(STATE_KEY).toBe('umbrella_state_rev11')
    const kite = await import('@/umbrella/kite')
    expect([kite.isLantern, kite.isKite, kite.artLayer]).toEqual([true, false, true])
    const { LEVELS } = await import('@/umbrella/levels')
    const { KITE_LEVELS } = await import('@/umbrella/kiteLevels')
    expect(LEVELS[0]).not.toEqual(KITE_LEVELS[0])
  })
})

describe('?art=lantern', () => {
  const redirect = (pathname: string, search = '', hash = ''): string | null => {
    let to: string | null = null
    const window = { location: { pathname, search, hash, replace: (u: string) => { to = u } } }
    runInNewContext(readFileSync(join(ROOT, 'public/js/art-kite-redirect.js'), 'utf-8'), { window, URLSearchParams })
    return to
  }

  it('opens the lantern build beside the normal one, on latest and on a revision', () => {
    expect(redirect('/umbrella/', '?art=lantern')).toBe('/umbrella/lantern/?art=lantern')
    expect(redirect('/umbrella/11/', '', '#/?art=lantern')).toBe('/umbrella/11/lantern/#/?art=lantern')
    expect(redirect('/umbrella/lantern/', '?art=lantern')).toBeNull()
    expect(redirect('/umbrella/lantern/', '?art=kite')).toBe('/umbrella/kite/?art=kite')
    expect(redirect('/umbrella/', '?art=kite')).toBe('/umbrella/kite/?art=kite')
    expect(redirect('/umbrella/', '?art=other')).toBeNull()
  })
})

describe('the lantern Walldorf face', () => {
  it('records two open eyes (or none, the blink) in every frame, for the live pupils', async () => {
    const { frames } = (await import('@/umbrella/art/walldorfFaceEyes.json')).default as { frames: { x: number; y: number; rx: number; ry: number; pupil: number }[][] }
    const face = sheetById('walldorf-face')!
    expect(frames).toHaveLength(face.cols * face.rows)
    for (const eyes of frames) {
      expect([0, 2]).toContain(eyes.length)
      for (const e of eyes) {
        expect(Math.abs(e.x)).toBeLessThan(0.5)
        expect(Math.abs(e.y)).toBeLessThan(0.5)
        expect(e.pupil).toBeGreaterThan(0)
        expect(e.pupil).toBeLessThan(Math.max(e.rx, e.ry))
      }
      // Stacked: the first eye is the upper one.
      if (eyes.length === 2) expect(eyes[0]!.y).toBeLessThan(eyes[1]!.y)
    }
  })
})
