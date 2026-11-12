// ─── The cloud platform's outline ──────────────────────────────────────────────
//
// A cloud platform plays exactly like a plain one: its collision box is the rectangle, and the top
// edge of that box is the line the player walks on. The DRAWING is a cartoon cloud: a chain of round
// puffs (circle arcs) along the top and the bottom, whose small soft dips sit exactly ON the box's top
// and bottom edges, so the puffs rise a little above the walking line and hang a little below the
// bottom edge. The two ends are chains of round arcs too: they pass through the box corners (no bare
// corner to bump) and overhang the sides. Shared by the skinless renderer and
// the lantern paint.

type PathCtx = Pick<CanvasRenderingContext2D, 'beginPath' | 'ellipse' | 'closePath'>

/** How far the puffs hang below the box's bottom edge. */
export const cloudDip = (h: number): number => Math.min(h * 0.22, 9)
/** How far the puffs rise above the walking line (the box's top edge). */
export const cloudRise = (h: number): number => Math.min(h * 0.3, 10)
/** How far the rounded ends overhang the box's sides, so the drawn cloud meets the player before the box does. */
export const cloudSide = (h: number): number => Math.min(h * 0.45, 16)

/** How many puffs fit along a box of this size, and the width of each (`r` is 0: they start at the box's edge). */
export const cloudPuffs = (w: number, h: number): { r: number; n: number; d: number } => {
  // Puffs about 0.84 of the cloud's height across, never wider than 34 px or narrower than 17.
  const n = Math.max(1, Math.round(w / Math.min(34, Math.max(17, h * 0.84))))
  return { r: 0, n, d: w / n }
}

/** The radius of a circle whose arc spans `d` across and bulges `depth` past its chord. */
const puffRadius = (d: number, depth: number): number => (d * d / 4 + depth * depth) / (2 * depth)

export const cloudPath = (ctx: PathCtx, x: number, y: number, w: number, h: number): void => {
  const { n, d } = cloudPuffs(w, h)
  const rise = Math.max(1, cloudRise(h))
  const dip = Math.max(1, cloudDip(h))
  const side = Math.max(1, cloudSide(h))
  // The ends are chains of arcs too (one on a thin cloud, more on a tall one), bulging out by `side`.
  const m = Math.max(1, Math.round(h / Math.min(34, Math.max(17, h * 0.84))))
  const e = h / m
  const rSide = puffRadius(e, side)
  const u = Math.asin(e / 2 / rSide)
  const rTop = puffRadius(d, rise)
  const rBot = puffRadius(d, dip)
  // Where a puff's arc meets its neighbour's: the angle from the circle's centre.
  const tTop = Math.acos(d / 2 / rTop)
  const tBot = Math.acos(d / 2 / rBot)
  ctx.beginPath()
  // Top puffs, left to right: each circle's arc between the two dips (angles t-π → -t, over the top).
  for (let i = 0; i < n; i++) ctx.ellipse(x + d * (i + 0.5), y - rise + rTop, rTop, rTop, 0, tTop - Math.PI, -tTop)
  // Right end, top to bottom (angles -u → u, round the outermost point).
  for (let k = 0; k < m; k++) ctx.ellipse(x + w + side - rSide, y + e * (k + 0.5), rSide, rSide, 0, -u, u)
  // Bottom puffs, right to left (angles t → π-t, under the bottom).
  for (let i = n - 1; i >= 0; i--) ctx.ellipse(x + d * (i + 0.5), y + h + dip - rBot, rBot, rBot, 0, tBot, Math.PI - tBot)
  // Left end, bottom to top (angles π-u → π+u).
  for (let k = m - 1; k >= 0; k--) ctx.ellipse(x - side + rSide, y + e * (k + 0.5), rSide, rSide, 0, Math.PI - u, Math.PI + u)
  ctx.closePath()
}
