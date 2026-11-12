// ─── Collision with a turned (rotated) box ─────────────────────────────────────
//
// A platform with an `angle` is a rectangle turned clockwise about its centre. The player is an
// upright box, so the test is the separating-axis one over the four axes the two boxes own. The
// answer is the smallest push that frees the upright box: `nx, ny` is the direction OUT of the
// turned box (a floor has ny < 0: up) and `depth` how far.

export interface Box { x: number; y: number; w: number; h: number }
export interface Push { nx: number; ny: number; depth: number }

export const isTurned = (p: { angle?: number }): boolean => !!p.angle && Math.abs(p.angle % 360) > 0.01

/** The turned box's centre, half sizes and unit axes. */
const frame = (p: Box & { angle?: number }) => {
  const a = ((p.angle ?? 0) * Math.PI) / 180
  return { cx: p.x + p.w / 2, cy: p.y + p.h / 2, hw: p.w / 2, hh: p.h / 2, c: Math.cos(a), s: Math.sin(a) }
}

/** The four corners of a turned box, clockwise from its top-left. */
export const turnedCorners = (p: Box & { angle?: number }): { x: number; y: number }[] => {
  const f = frame(p)
  return [[-f.hw, -f.hh], [f.hw, -f.hh], [f.hw, f.hh], [-f.hw, f.hh]].map(([lx, ly]) => ({ x: f.cx + lx! * f.c - ly! * f.s, y: f.cy + lx! * f.s + ly! * f.c }))
}

/** How far an upright box `a` sinks into the turned box `p`, or null when they do not touch. */
export const pushOutOfTurned = (a: Box, p: Box & { angle?: number }): Push | null => {
  const f = frame(p)
  const ax = a.x + a.w / 2
  const ay = a.y + a.h / 2
  const dx = ax - f.cx
  const dy = ay - f.cy
  let best: Push | null = null
  // Each axis: [x, y] unit vector; the upright box's half extent along it, and the turned box's.
  const axes: [number, number][] = [[1, 0], [0, 1], [f.c, f.s], [-f.s, f.c]]
  for (const [ux, uy] of axes) {
    const ra = (a.w / 2) * Math.abs(ux) + (a.h / 2) * Math.abs(uy)
    const rb = f.hw * Math.abs(ux * f.c + uy * f.s) + f.hh * Math.abs(-ux * f.s + uy * f.c)
    const dist = dx * ux + dy * uy
    const depth = ra + rb - Math.abs(dist)
    if (depth <= 1e-6) return null
    if (!best || depth < best.depth) best = dist >= 0 ? { nx: ux, ny: uy, depth } : { nx: -ux, ny: -uy, depth }
  }
  return best
}

/** Do an upright box and a (possibly turned) platform overlap? */
export const boxHitsPlatform = (a: Box, p: Box & { angle?: number }): boolean =>
  isTurned(p) ? pushOutOfTurned(a, p) !== null : a.x < p.x + p.w && a.x + a.w > p.x && a.y < p.y + p.h && a.y + a.h > p.y
