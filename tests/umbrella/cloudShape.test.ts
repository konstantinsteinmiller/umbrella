import { describe, expect, it } from 'vitest'
import { cloudDip, cloudPath, cloudRise } from '@/umbrella/cloudShape'

/** Records every ellipse extent the outline touches. */
const trace = (x: number, y: number, w: number, h: number) => {
  const xs: number[] = []
  const ys: number[] = []
  const ctx = {
    beginPath() {},
    closePath() {},
    ellipse(cx: number, cy: number, rx: number, ry: number) { xs.push(cx - rx, cx + rx); ys.push(cy - ry, cy + ry) }
  }
  cloudPath(ctx, x, y, w, h)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe('cloud platform outline', () => {
  it.each([
    [0, 0, 200, 20],
    [100, 300, 90, 90],
    [40, 40, 520, 60],
    [0, 0, 30, 30]
  ])('sticks out above and below the collision box, never past its sides (%d, %d, %d x %d)', (x, y, w, h) => {
    const t = trace(x, y, w, h)
    expect(t.minX).toBeGreaterThanOrEqual(x - 0.01)
    expect(t.maxX).toBeLessThanOrEqual(x + w + 0.01)
    // The puffs rise above the walking line and hang below the bottom edge.
    expect(t.minY).toBeCloseTo(y - cloudRise(h), 5)
    expect(t.maxY).toBeCloseTo(y + h + cloudDip(h), 5)
  })
})
