import { describe, expect, it } from 'vitest'
import { createWorld, step } from '@/umbrella/engine'
import { LEVELS, type LevelDef } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { parseLevel } from '@/umbrella/customLevels'

const withFan: LevelDef = {
  ...LEVELS[0]!, spawn: { x: 300, y: 300 }, winds: [],
  platforms: [{ x: 100, y: 500, w: 400, h: 20 }],
  hazards: [{ kind: 'fan', x: 260, y: 440, w: 90, h: 90 }]
}

describe('ventilator', () => {
  it('shreds a player who lands in it', () => {
    const w = createWorld(withFan, { w: DEFAULT_TUNING.playerWidth, h: DEFAULT_TUNING.playerHeight })
    for (let i = 0; i < 240 && w.phase === 'play'; i++) step(w, { left: false, right: false, toggle: false }, 1 / 60, DEFAULT_TUNING)
    expect(w.phase).toBe('splat')
  })
  it('survives the share-link / library round trip', () => {
    expect(parseLevel(JSON.parse(JSON.stringify(withFan)))?.hazards?.[0]?.kind).toBe('fan')
  })
})
