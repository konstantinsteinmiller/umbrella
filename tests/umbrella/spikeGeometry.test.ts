import { describe, expect, it } from 'vitest'
import { boxHitsSpikes, isTurned, spikeAngle, spikeBounds } from '@/umbrella/spikeGeometry'
import { parseLevel } from '@/umbrella/customLevels'

describe('spike angle', () => {
  it('reads the old facing as 0 / 180 and wraps any angle into [0, 360)', () => {
    expect(spikeAngle({ facing: 'up' })).toBe(0)
    expect(spikeAngle({ facing: 'down' })).toBe(180)
    expect(spikeAngle({ angle: -90 })).toBe(270)
    expect(spikeAngle({ angle: 450, facing: 'down' })).toBe(90)
  })
  it('a quarter turn swaps the box around the same centre', () => {
    const b = spikeBounds({ x: 100, y: 100, w: 200, h: 26, angle: 90 })
    expect(b.w).toBeCloseTo(26); expect(b.h).toBeCloseTo(200)
    expect(b.x + b.w / 2).toBeCloseTo(200); expect(b.y + b.h / 2).toBeCloseTo(113)
    expect(isTurned({ angle: 180 })).toBe(false)
  })
  it('hits only what touches the turned strip, not its old rectangle', () => {
    const h = { x: 100, y: 100, w: 200, h: 26, angle: 90 }
    expect(boxHitsSpikes(190, -20, 20, 20, h)).toBe(false) // above the strip, which now runs 13 to 213 tall
    expect(boxHitsSpikes(190, 150, 20, 20, h)).toBe(true) // on the turned strip
    expect(boxHitsSpikes(110, 105, 10, 10, h)).toBe(false) // on the old, unturned rectangle
    expect(boxHitsSpikes(110, 105, 10, 10, { ...h, angle: 0 })).toBe(true)
  })
  it('survives a share code: a bad angle is refused', () => {
    const base = { id: 1, world: { w: 800, h: 600 }, spawn: { x: 50, y: 50 }, platforms: [{ x: 0, y: 560, w: 800, h: 40 }], winds: [] }
    expect(parseLevel({ ...base, hazards: [{ kind: 'spikes', x: 10, y: 10, w: 100, h: 26, angle: 45 }] })?.hazards?.[0]?.angle).toBe(45)
    expect(parseLevel({ ...base, hazards: [{ kind: 'spikes', x: 10, y: 10, w: 100, h: 26, angle: 'x' }] })).toBeNull()
  })
})
