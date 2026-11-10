import { describe, expect, it } from 'vitest'
import { cloudPath } from '@/umbrella/cloudShape'

/** Records every point and ellipse extent the outline touches. */
const trace = (x: number, y: number, w: number, h: number) => {
  const xs: number[] = []
  const ys: number[] = []
  let at = 0
  const ctx = {
    beginPath() {},
    closePath() {},
    moveTo(px: number, py: number) { at = py; xs.push(px); ys.push(py) },
    quadraticCurveTo(_cx: number, cy: number, px: number, py: number) {
      // The curve's extreme sits halfway between its chord (both ends at this height) and its control point.
      xs.push(px); ys.push(py, (at + cy) / 2)
      at = py
    },
    ellipse(cx: number, cy: number, rx: number, ry: number) { xs.push(cx - rx, cx + rx); ys.push(cy - ry, cy + ry); at = cy }
  }
  cloudPath(ctx, x, y, w, h)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), x, y, w, h }
}

describe('cloud platform outline', () => {
  it.each([
    [0, 0, 200, 20],
    [100, 300, 90, 90],
    [40, 40, 520, 60],
    [0, 0, 30, 30]
  ])('stays inside its collision box (%d, %d, %d x %d)', (x, y, w, h) => {
    const t = trace(x, y, w, h)
    expect(t.minX).toBeGreaterThanOrEqual(x - 0.01)
    expect(t.maxX).toBeLessThanOrEqual(x + w + 0.01)
    // Its top puffs touch the walkable line, never rise above it.
    expect(t.minY).toBeGreaterThanOrEqual(y - 0.01)
    expect(t.maxY).toBeLessThanOrEqual(y + h + 0.01)
  })
})
