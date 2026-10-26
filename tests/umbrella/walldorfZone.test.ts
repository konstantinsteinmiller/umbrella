import { describe, expect, it } from 'vitest'
import { createWorld, step, triggerZone, TRIGGER_MARGIN } from '@/umbrella/engine'
import { LEVELS, type LevelDef, type Motion } from '@/umbrella/levels'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { parseLevel } from '@/umbrella/customLevels'
import { introCutscene } from '@/umbrella/intro'

type Lunge = Extract<Motion, { kind: 'lunge' }>
const lunge = (extra: Partial<Lunge>): Lunge => ({ kind: 'lunge', a: { x: 600, y: 300 }, b: { x: 300, y: 300 }, period: 3, trigger: true, ...extra })

describe('Walldorf Thwomp zone', () => {
  it('is a rectangle in front of the enemy, a little wider than its body', () => {
    const z = triggerZone(lunge({ reach: 400 }), 80, 160)
    expect(z.x + z.w).toBeCloseTo(600 - 40)
    expect(z.w).toBe(400)
    expect(z.h).toBe(160 + TRIGGER_MARGIN * 2)
    expect(z.y + z.h / 2).toBe(300)
    expect(triggerZone(lunge({ b: { x: 900, y: 300 }, reach: 200 }), 80, 160).x).toBe(640)
  })
  it('fires only for a player inside it', () => {
    const fires = (px: number) => {
      const level: LevelDef = {
        ...LEVELS[0]!, spawn: { x: px, y: 330 }, winds: [], platforms: [],
        hazards: [{ kind: 'pillar', x: 560, y: 220, w: 80, h: 160, motion: lunge({ reach: 300 }) }]
      }
      const w = createWorld(level, { w: DEFAULT_TUNING.playerWidth, h: DEFAULT_TUNING.playerHeight })
      step(w, { left: false, right: false, toggle: false }, 1 / 60, DEFAULT_TUNING)
      return w.hazards[0]!.lungeAt !== undefined
    }
    expect(fires(450)).toBe(true)
    expect(fires(150)).toBe(false)
    expect(fires(700)).toBe(false)
  })
  it('survives the share-link round trip', () => {
    const level: LevelDef = { ...LEVELS[0]!, hazards: [{ kind: 'pillar', x: 560, y: 220, w: 80, h: 160, motion: lunge({ reach: 300, zoneWidth: 220 }) }] }
    const m = parseLevel(JSON.parse(JSON.stringify(level)))?.hazards?.[0]?.motion as Lunge
    expect(m.reach).toBe(300)
    expect(m.zoneWidth).toBe(220)
  })
})

describe('default cutscene follows the doc', () => {
  it('Chad flips in, pauses, floats; Pweeg walks, climbs down, stops and looks at the player', () => {
    const def = introCutscene(LEVELS[0]!, DEFAULT_TUNING)
    const chad = def.actors.find((a) => a.id === 'chad')!.segs.map((s) => s.kind === 'hold' ? `hold:${s.action ?? s.pose}` : s.kind)
    expect(chad.slice(0, 3)).toEqual(['flip', 'hold:land', 'hold:idle'])
    const pweeg = def.actors.find((a) => a.id === 'pweeg')!.segs.map((s) => s.kind)
    expect(pweeg).toEqual(['walk', 'hold', 'climb', 'walk', 'hold'])
    expect(def.waitAt).toBeDefined()
  })
})
