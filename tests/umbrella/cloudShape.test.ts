import { describe, expect, it } from 'vitest'
import { cloudDip, cloudPath, cloudRise, cloudSide } from '@/umbrella/cloudShape'

/** Records every ellipse extent the outline touches. */
const trace = (x: number, y: number, w: number, h: number) => {
  const xs: number[] = []
  const ys: number[] = []
  const ctx = {
    beginPath() {},
    closePath() {},
    // Only the arc that is actually drawn counts (sampled), not the full ellipse.
    ellipse(cx: number, cy: number, rx: number, ry: number, _rot: number, a0: number, a1: number) {
      for (let k = 0; k <= 200; k++) {
        const a = a0 + ((a1 - a0) * k) / 200
        xs.push(cx + rx * Math.cos(a)); ys.push(cy + ry * Math.sin(a))
      }
    }
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
  ])('sticks out above and below the collision box, a little past its sides (%d, %d, %d x %d)', (x, y, w, h) => {
    const t = trace(x, y, w, h)
    expect(t.minX).toBeCloseTo(x - Math.max(1, cloudSide(h)), 3)
    expect(t.maxX).toBeCloseTo(x + w + Math.max(1, cloudSide(h)), 3)
    // The puffs rise above the walking line and hang below the bottom edge.
    expect(t.minY).toBeCloseTo(y - cloudRise(h), 3)
    expect(t.maxY).toBeCloseTo(y + h + cloudDip(h), 3)
  })
})
