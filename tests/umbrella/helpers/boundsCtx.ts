// A CanvasRenderingContext2D stand-in that tracks the world-space bounding box
// of everything drawn (path points, arcs, rects, through the transform stack,
// plus half the line width). Conservative: Bézier control points count.
type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
]

export interface Bounds { x0: number; y0: number; x1: number; y1: number; empty: boolean }

export const boundsCtx = () => {
  let m: M = [1, 0, 0, 1, 0, 0]
  const stack: { m: M; lw: number }[] = []
  let lw = 1
  let path: [number, number, number][] = []
  const b: Bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, empty: true }
  const pt = (x: number, y: number, pad = 0) => path.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5], pad * Math.hypot(m[0], m[1])])
  const flush = (stroke: boolean) => {
    for (const [x, y, pad] of path) {
      const p = pad + (stroke ? (lw / 2) * Math.hypot(m[0], m[1]) : 0)
      b.x0 = Math.min(b.x0, x - p); b.y0 = Math.min(b.y0, y - p)
      b.x1 = Math.max(b.x1, x + p); b.y1 = Math.max(b.y1, y + p)
      b.empty = false
    }
  }
  const api: Record<string, unknown> = {
    canvas: { width: 1024, height: 1024 },
    save: () => stack.push({ m: [...m] as M, lw }),
    restore: () => { const s = stack.pop(); if (s) { m = s.m; lw = s.lw } },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]) },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]) },
    rotate: (a: number) => { m = mul(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]) },
    setTransform: (a: number, bb: number, c: number, d: number, e: number, f: number) => { m = [a, bb, c, d, e, f] },
    beginPath: () => { path = [] },
    closePath: () => {},
    moveTo: (x: number, y: number) => pt(x, y),
    lineTo: (x: number, y: number) => pt(x, y),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => { pt(cx, cy); pt(x, y) },
    bezierCurveTo: (a: number, bb: number, c: number, d: number, x: number, y: number) => { pt(a, bb); pt(c, d); pt(x, y) },
    arc: (x: number, y: number, r: number) => pt(x, y, r),
    ellipse: (x: number, y: number, rx: number, ry: number) => pt(x, y, Math.max(rx, ry)),
    rect: (x: number, y: number, w: number, h: number) => { pt(x, y); pt(x + w, y + h); pt(x + w, y); pt(x, y + h) },
    roundRect: (x: number, y: number, w: number, h: number) => { pt(x, y); pt(x + w, y + h); pt(x + w, y); pt(x, y + h) },
    fill: () => flush(false),
    stroke: () => flush(true),
    clip: () => {},
    fillRect: (x: number, y: number, w: number, h: number) => { path = []; pt(x, y); pt(x + w, y + h); pt(x + w, y); pt(x, y + h); flush(false) },
    strokeRect: (x: number, y: number, w: number, h: number) => { path = []; pt(x, y); pt(x + w, y + h); flush(true) },
    clearRect: () => {},
    fillText: () => {},
    drawImage: () => {},
    setLineDash: () => {}
  }
  const ctx = new Proxy(api, {
    get: (t, k: string) => (k in t ? t[k] : undefined),
    set: (t, k: string, v) => { if (k === 'lineWidth') lw = v; t[k] = v; return true }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, bounds: b }
}
