// ─── The cloud platform's outline ──────────────────────────────────────────────
//
// A cloud platform plays exactly like a plain one (its collision box is the rectangle); only the
// drawing differs. The outline stays inside the box: scallops along the top whose peaks touch the
// top edge (where the player stands) and along the bottom whose tips touch the bottom edge, with
// rounded ends. Shared by the skinless renderer and the lantern paint.

type PathCtx = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'quadraticCurveTo' | 'ellipse' | 'closePath'>

/** How deep the scallops dip: a thin ledge gets small ripples, a big square cloud proper puffs. */
export const cloudDip = (h: number): number => Math.min(h * 0.2, 12)

export const cloudPath = (ctx: PathCtx, x: number, y: number, w: number, h: number): void => {
  const r = Math.max(1, Math.min(h / 2, w / 2))
  const dip = Math.min(cloudDip(h), r)
  const ry = Math.max(1, (h - 2 * dip) / 2)
  const span = Math.max(0, w - 2 * r)
  const n = Math.max(1, Math.round(span / Math.max(14, h * 1.1)))
  const d = span / n
  ctx.beginPath()
  ctx.moveTo(x + r, y + dip)
  for (let i = 0; i < n; i++) ctx.quadraticCurveTo(x + r + i * d + d / 2, y - dip, x + r + (i + 1) * d, y + dip)
  ctx.ellipse(x + w - r, y + h / 2, r, ry, 0, -Math.PI / 2, Math.PI / 2)
  for (let i = n - 1; i >= 0; i--) ctx.quadraticCurveTo(x + r + i * d + d / 2, y + h + dip, x + r + i * d, y + h - dip)
  ctx.ellipse(x + r, y + h / 2, r, ry, 0, Math.PI / 2, (Math.PI * 3) / 2)
  ctx.closePath()
}
