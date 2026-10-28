// ─── The kite build: painted sheets where they exist, the drawing elsewhere ─
//
// `isKite` is mocked ON here (it is a build-time constant everywhere else).
// The sheets module is mocked so the test controls which sheets "shipped and
// decoded". With none: the kite build must draw exactly the vector golden.
// With all: every drawable goes through drawImage, through its box.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ on: false }))
vi.mock('@/umbrella/kite', () => ({ isKite: true }))
vi.mock('@/umbrella/art/sheets', async (orig) => {
  const real = await orig<typeof import('@/umbrella/art/sheets')>()
  const img = { width: 1024, height: 1024, naturalWidth: 1024, naturalHeight: 1024 }
  return {
    ...real,
    hasSheet: () => fake.on,
    sheetImage: () => (fake.on ? img : null),
    setReady: () => fake.on
  }
})

import { render } from '@/umbrella/renderer'
import { drawPweeg, drawUmbrella } from '@/umbrella/characters'
import { drawChad } from '@/umbrella/chad'
import { kiteArt } from '@/umbrella/art/hooks'
import { KITE_PAINTERS, setPaintedArt } from '@/umbrella/art/paint'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { recordingCtx } from './helpers/recordingCtx'
import { PLAYER_SCENES, sceneWorld } from './helpers/artScenes'

// jsdom has no canvas; the painted path makes a few small offscreen canvases
// (tints, feathers). A stub that records nothing is enough.
beforeAll(() => {
  Object.assign(kiteArt, KITE_PAINTERS)
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }
  proto.getContext = () => recordingCtx(96, 96).ctx
})

const GOLDEN = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vectorGolden.json'), 'utf-8'))
const hash = (log: string[]) => createHash('sha256').update(log.join('\n')).digest('hex').slice(0, 24)

const renderScene = (scene: (typeof PLAYER_SCENES)[number]) => {
  const w = sceneWorld(scene)
  const rec = recordingCtx()
  for (let i = 0; i < 5; i++) {
    rec.log.length = 0
    render(rec.ctx, w, { finish: 'Finish' }, DEFAULT_TUNING, 1 / 60)
    w.time += 1 / 60
    w.phaseTime += 1 / 60
  }
  return rec
}

describe('kite build, nothing painted yet', () => {
  it('draws exactly the vector golden — the drawing is the fallback, call for call', () => {
    fake.on = false
    for (const scene of PLAYER_SCENES) {
      const rec = renderScene(scene)
      expect({ calls: rec.log.length, hash: hash(rec.log) }, scene).toEqual(GOLDEN[`render:${scene}`])
    }
  })
})

describe('kite build, every sheet painted', () => {
  it('draws Pweeg, the umbrella, the world and every enemy from the sheets', () => {
    fake.on = true
    setPaintedArt(true)
    for (const scene of PLAYER_SCENES) {
      const rec = renderScene(scene)
      // platforms ×9 cells each, pillars ×3 + face, wisps, flags, buttons…
      expect(rec.count('drawImage'), scene).toBeGreaterThan(60)
      // No hard wind rectangle: the vector current's fillRect over the field is gone.
      expect(rec.log.some((l) => l === 'fillStyle="rgba(140, 200, 255, 0.10)"'), scene).toBe(false)
    }
  })

  it('blits Pweeg-Kite through his registration box, feet on the anchor', () => {
    fake.on = true
    const rec = recordingCtx()
    drawPweeg(rec.ctx, 100, 200, { pose: 'stand', facing: 1, w: 24, h: 36, time: 0 })
    expect(rec.log).toContain('translate(100,200)')
    // KITE box: 96 units, anchor (0.5, 0.72) → (-48, -69.12, 96, 96).
    expect(rec.log.find((l) => l.startsWith('drawImage('))).toMatch(/,-48,-69\.12,96,96\)$/)
  })

  it('mirrors a left-facing Pweeg and scales him with the tuned hitbox', () => {
    fake.on = true
    const rec = recordingCtx()
    drawPweeg(rec.ctx, 0, 0, { pose: 'walk', facing: -1, w: 48, h: 72, time: 0, step: 1 })
    expect(rec.log).toContain('scale(-2,2)')
  })

  it('paints Chad as Chad-Kite, and draws no umbrella over a kite (the kite IS the umbrella)', () => {
    fake.on = true
    const rec = recordingCtx()
    drawChad(rec.ctx, 0, 0, { action: 'float', t: 0.2, facing: 1, w: 24, h: 36 })
    // Chad-Kite deployed, and nothing for the umbrella drawChad asks for after him.
    expect(rec.count('drawImage')).toBe(1)
    expect(rec.count('arc')).toBe(0)
    // An umbrella on its own (no kite just drawn) is still the painted umbrella.
    drawUmbrella(rec.ctx, 0, 0, { state: 'broken', tilt: 0.3, time: 0.1 })
    expect(rec.count('drawImage')).toBe(2)
  })

  it('selects the kite sheets for the player: deployed when open, torn when broken', () => {
    fake.on = true
    const sheetOf = (log: string[]) => log.filter((l) => l.startsWith('drawImage(')).length
    const hold = recordingCtx()
    drawPweeg(hold.ctx, 0, 0, { pose: 'hold', facing: 1, w: 24, h: 36, time: 0 })
    // KITE_DEPLOYED box: baked at 144 units but DRAWN at 80 (the umbrella's size), anchor (0.5, 0.8) → (-40, -64, 80, 80).
    expect(hold.log.find((l) => l.startsWith('drawImage('))).toMatch(/,-40,-64,80,80\)$/)
    const broken = recordingCtx()
    drawPweeg(broken.ctx, 0, 0, { pose: 'flail', facing: 1, w: 24, h: 36, time: 0, broken: true })
    drawUmbrella(broken.ctx, 0, 0, { state: 'broken', tilt: 0, time: 0 })
    expect(sheetOf(broken.log)).toBe(1)
  })

  it('switches off live (the playground A/B): the drawing is back', () => {
    fake.on = true
    setPaintedArt(false)
    const rec = renderScene('stand')
    expect(rec.count('drawImage')).toBe(0)
    expect(rec.log).toContain('fillStyle="rgba(140, 200, 255, 0.10)"')
    setPaintedArt(true)
  })
})
