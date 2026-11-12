// ─── The cloud platform's outline ──────────────────────────────────────────────
//
// A cloud platform plays exactly like a plain one: its collision box is the rectangle, and the top
// edge of that box is the line the player walks on. The DRAWING sticks out past the box — round puffs
// rise a little above the walking line and hang below the bottom edge — so Pweeg looks like he is
// standing on top of the cloud before he meets the collision box. Shared by the skinless renderer and
// the lantern paint.

type PathCtx = Pick<CanvasRenderingContext2D, 'beginPath' | 'ellipse' | 'closePath'>

/** How far the puffs hang below the box's bottom edge. */
export const cloudDip = (h: number): number => Math.min(h * 0.4, 20)
/** How far the puffs rise above the walking line (the box's top edge). */
export const cloudRise = (h: number): number => Math.min(h * 0.3, 10)

/** How many puffs fit along a box of this size, and the width of each. */
export const cloudPuffs = (w: number, h: number): { r: number; n: number; d: number } => {
  const r = Math.max(1, Math.min(h / 2, w / 2))
  const span = Math.max(0, w - 2 * r)
  const n = Math.max(1, Math.round(span / Math.max(14, h * 1.1)))
  return { r, n, d: span / n }
}

export const cloudPath = (ctx: PathCtx, x: number, y: number, w: number, h: number): void => {
  const { r, n, d } = cloudPuffs(w, h)
  const rise = cloudRise(h)
  const dip = cloudDip(h)
  const ry = Math.max(1, h / 2)
  ctx.beginPath()
  // Top puffs, left to right (angles π→2π bulge upward).
  for (let i = 0; i < n; i++) ctx.ellipse(x + r + i * d + d / 2, y, d / 2, rise, 0, Math.PI, Math.PI * 2)
  ctx.ellipse(x + w - r, y + ry, r, ry, 0, -Math.PI / 2, Math.PI / 2)
  // Bottom puffs, right to left (angles 0→π bulge downward).
  for (let i = n - 1; i >= 0; i--) ctx.ellipse(x + r + i * d + d / 2, y + h, d / 2, dip, 0, 0, Math.PI)
  ctx.ellipse(x + r, y + ry, r, ry, 0, Math.PI / 2, (Math.PI * 3) / 2)
  ctx.closePath()
}
