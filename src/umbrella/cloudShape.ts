// ─── The cloud platform's outline ──────────────────────────────────────────────
//
// A cloud platform plays exactly like a plain one (its collision box is the rectangle); only the
// drawing differs. The top edge is dead flat along the whole box (that is the line the player walks
// on, so it must read as ground); the puffs hang below it as round lobes whose tips touch the bottom
// edge, with rounded ends. Shared by the skinless renderer and the lantern paint.

type PathCtx = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'ellipse' | 'closePath'>

/** How far the puffs hang below the slab: a thin ledge gets small ripples, a big square cloud proper puffs. */
export const cloudDip = (h: number): number => Math.min(h * 0.4, 20)

export const cloudPath = (ctx: PathCtx, x: number, y: number, w: number, h: number): void => {
  const dip = Math.min(cloudDip(h), h / 2)
  const slab = h - dip // the flat-topped body; the scallops hang below it
  const r = Math.max(1, Math.min(slab / 2, w / 2))
  const ry = Math.max(1, slab / 2)
  const span = Math.max(0, w - 2 * r)
  const n = Math.max(1, Math.round(span / Math.max(14, h * 1.1)))
  const d = span / n
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.ellipse(x + w - r, y + ry, r, ry, 0, -Math.PI / 2, Math.PI / 2)
  // Round lobes along the bottom (half-ellipses, tips on the box's bottom edge), right to left.
  for (let i = n - 1; i >= 0; i--) ctx.ellipse(x + r + i * d + d / 2, y + slab, d / 2, dip, 0, 0, Math.PI)
  ctx.ellipse(x + r, y + ry, r, ry, 0, Math.PI / 2, (Math.PI * 3) / 2)
  ctx.closePath()
}
