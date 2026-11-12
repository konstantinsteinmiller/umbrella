// ─── Removable clouds: the puffs a cloud is made of ─────────────────────────
//
// A removable cloud (PlatformDef.vanish) is a grid of round puffs that blocks nothing. Each puff is a little
// collision box of its own (a cell of the grid): touching it (body or open canopy) makes it vanish for good, so
// a cloud thins out exactly where the player went through it. Pure: no DOM, read by the engine and the renderers.

/** Roughly how wide one puff cell is (px). */
export const PUFF_CELL = 22
/** The puffs vanish a little wider than the player's box, so the hole is round, not a perfect rectangle (px). */
export const PUFF_REACH = 6
/** Seconds a touched puff takes to shrink away. */
export const PUFF_FADE = 0.95

export interface Puff {
  /** The cell's box (its collision box). */
  x: number; y: number; w: number; h: number
  /** Where the round puff is drawn, and how big. */
  cx: number; cy: number; r: number
}

/** A small stable hash in 0..1, so the same cloud always draws the same lumps. */
export const puffRand = (a: number, b: number): number => {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return ((h >>> 0) % 1000) / 1000
}

const cache = new Map<string, Puff[]>()

/** The puffs of a cloud `w` × `h` placed at the origin (add the cloud's position to use them). */
export const puffLayout = (w: number, h: number): Puff[] => {
  const key = `${Math.round(w)}x${Math.round(h)}`
  const hit = cache.get(key)
  if (hit) return hit
  const cols = Math.max(1, Math.round(w / PUFF_CELL))
  const rows = Math.max(1, Math.round(h / PUFF_CELL))
  const cw = w / cols
  const ch = h / rows
  const out: Puff[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const jx = (puffRand(c, r) - 0.5) * cw * 0.3
      const jy = (puffRand(r, c + 31) - 0.5) * ch * 0.3
      const rad = Math.max(cw, ch) * (0.8 + puffRand(c + 7, r + 3) * 0.5)
      out.push({ x: c * cw, y: r * ch, w: cw, h: ch, cx: (c + 0.5) * cw + jx, cy: (r + 0.5) * ch + jy, r: rad })
    }
  }
  if (cache.size > 60) cache.clear()
  cache.set(key, out)
  return out
}

/** Does the box touch this puff (placed with the cloud at `ox`, `oy`)? The round core of the puff against the box, so the
 *  hole a body or canopy leaves is rounded like the puffs, not a rectangle. */
export const puffTouched = (pf: Puff, ox: number, oy: number, b: { x: number; y: number; w: number; h: number }): boolean => {
  const px = ox + pf.cx
  const py = oy + pf.cy
  const nx = Math.max(b.x, Math.min(px, b.x + b.w))
  const ny = Math.max(b.y, Math.min(py, b.y + b.h))
  const reach = pf.r * 0.5 + PUFF_REACH
  return (px - nx) ** 2 + (py - ny) ** 2 < reach * reach
}
