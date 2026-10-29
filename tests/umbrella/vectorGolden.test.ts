// ─── The vector drawing is untouched by the kite art layer ─────────────────
//
// The painted sprite layer (src/umbrella/art/) is ON only in the kite build
// (`isKite`, a build-time constant). Every other build — /umbrella/, every
// revision, every portal — must draw EXACTLY what it drew before the layer
// existed. This records every canvas call of the renderer and of the
// character painters, scene by scene, and compares a hash of each log with a
// golden recorded from the renderer BEFORE the art layer was added
// (tests/umbrella/fixtures/vectorGolden.json; regenerate with
// UPDATE_GOLDEN=1 only for an intended change to the vector look).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { render } from '@/umbrella/renderer'
import { drawPweeg, drawPrickbait, drawUmbrella, drawWalldorf } from '@/umbrella/characters'
import { drawChad, type ChadAction } from '@/umbrella/chad'
import { artLayer, isKite } from '@/umbrella/kite'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { recordingCtx } from './helpers/recordingCtx'
import { PLAYER_SCENES, sceneWorld } from './helpers/artScenes'

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'vectorGolden.json')
const hash = (log: string[]) => createHash('sha256').update(log.join('\n')).digest('hex').slice(0, 24)

/** Every scene's log, in a fixed order (the renderer eases poses between frames). */
const recordAll = (): Record<string, { calls: number; hash: string }> => {
  const out: Record<string, { calls: number; hash: string }> = {}
  const put = (name: string, log: string[]) => { out[name] = { calls: log.length, hash: hash(log) } }
  for (const scene of PLAYER_SCENES) {
    const w = sceneWorld(scene)
    const rec = recordingCtx()
    // Five frames: the fall pose eases in, the walk phase advances.
    for (let i = 0; i < 5; i++) {
      rec.log.length = 0
      render(rec.ctx, w, { finish: 'Finish' }, DEFAULT_TUNING, 1 / 60)
      w.time += 1 / 60
      w.phaseTime += 1 / 60
    }
    put(`render:${scene}`, rec.log)
  }
  {
    const rec = recordingCtx()
    render(rec.ctx, sceneWorld('stand'), { finish: 'Finish' }, DEFAULT_TUNING, 0, undefined, { hidePlayer: true, windStyle: 'squiggles' })
    put('render:squiggles', rec.log)
  }
  {
    const rec = recordingCtx()
    for (const pose of ['stand', 'walk', 'hold', 'flail', 'terminal', 'cheer'] as const) {
      for (const facing of [1, -1] as const) drawPweeg(rec.ctx, 100, 200, { pose, facing, w: 24, h: 36, time: 0.7, step: 1.1 })
    }
    drawPweeg(rec.ctx, 100, 200, { pose: 'stand', facing: 1, w: 24, h: 36, time: 0, front: true, blink: true })
    put('pweeg', rec.log)
  }
  {
    const rec = recordingCtx()
    for (const action of ['idle', 'flip', 'land', 'float', 'walk'] as ChadAction[]) drawChad(rec.ctx, 100, 200, { action, t: 0.3, facing: 1, w: 24, h: 36, vx: 90 })
    put('chad', rec.log)
  }
  {
    const rec = recordingCtx()
    for (const state of ['open', 'furled', 'broken'] as const) drawUmbrella(rec.ctx, 50, 80, { state, tilt: 0.2, time: 0.4 })
    for (const contact of ['deadly', 'solid', 'bounce'] as const) {
      drawWalldorf(rec.ctx, { x: 10, y: 20, w: 40, h: 200 }, { contact, facing: 1, angry: false })
      drawWalldorf(rec.ctx, { x: 10, y: 20, w: 40, h: 200 }, { contact, facing: -1, angry: true })
    }
    drawPrickbait(rec.ctx, 100, 100, 26, 300, 50, 0.8)
    put('enemies', rec.log)
  }
  return out
}

describe('vector drawing (every non-kite build)', () => {
  it('is a non-kite build under test', () => {
    expect(isKite).toBe(false)
    expect(artLayer).toBe(false)
  })

  it('draws exactly what it drew before the art layer existed', () => {
    const now = recordAll()
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FILE)) {
      mkdirSync(dirname(FILE), { recursive: true })
      writeFileSync(FILE, JSON.stringify(now, null, 2) + '\n', 'utf-8')
    }
    const golden = JSON.parse(readFileSync(FILE, 'utf-8'))
    expect(now).toEqual(golden)
  })
})
