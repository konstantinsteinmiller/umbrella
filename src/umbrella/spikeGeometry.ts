// Spikes can point any way: `angle` (degrees, clockwise, 0 = up) turns the strip about its centre.
// x/y/w/h stay the UNROTATED strip, so a resize in the editor is still "longer" or "thicker".
// Levels from before have only `facing: 'up' | 'down'`, which reads as 0 / 180.

export interface SpikeLike { x: number; y: number; w: number; h: number; angle?: number; facing?: 'up' | 'down' }

/** The angle in [0, 360). */
export const spikeAngle = (h: Pick<SpikeLike, 'angle' | 'facing'>): number => {
  const a = typeof h.angle === 'number' && Number.isFinite(h.angle) ? h.angle : h.facing === 'down' ? 180 : 0
  return ((a % 360) + 360) % 360
}

/** Turned by anything but a half turn: its box is no longer the strip's own rectangle. */
export const isTurned = (h: Pick<SpikeLike, 'angle' | 'facing'>): boolean => spikeAngle(h) % 180 !== 0

/** The four corners of the turned strip. */
export const spikeCorners = (h: SpikeLike): { x: number; y: number }[] => {
  const r = (spikeAngle(h) * Math.PI) / 180
  const c = Math.cos(r), s = Math.sin(r)
  const cx = h.x + h.w / 2, cy = h.y + h.h / 2
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = (sx! * h.w) / 2, ly = (sy! * h.h) / 2
    return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c }
  })
}

/** The axis-aligned box around the turned strip (the strip itself when not turned). */
export const spikeBounds = (h: SpikeLike): { x: number; y: number; w: number; h: number } => {
  if (!isTurned(h)) return { x: h.x, y: h.y, w: h.w, h: h.h }
  const pts = spikeCorners(h)
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** Does the axis-aligned box touch the turned strip? (separating axes) */
export const boxHitsSpikes = (bx: number, by: number, bw: number, bh: number, h: SpikeLike): boolean => {
  if (!isTurned(h)) return bx < h.x + h.w && bx + bw > h.x && by < h.y + h.h && by + bh > h.y
  const pts = spikeCorners(h)
  const box = [{ x: bx, y: by }, { x: bx + bw, y: by }, { x: bx + bw, y: by + bh }, { x: bx, y: by + bh }]
  const r = (spikeAngle(h) * Math.PI) / 180
  for (const [ax, ay] of [[1, 0], [0, 1], [Math.cos(r), Math.sin(r)], [-Math.sin(r), Math.cos(r)]] as const) {
    const pa = pts.map((p) => p.x * ax + p.y * ay), pb = box.map((p) => p.x * ax + p.y * ay)
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
  }
  return true
}
