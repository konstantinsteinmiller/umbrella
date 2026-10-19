/**
 * usePrismParticles — a tiny, pooled, screen-space particle engine for the
 * "juice" the GDD demands (confetti on merge, splash/ripple on lane drop,
 * bubbles in the cauldron, sparkles on spawn). One global pool, one draw pass,
 * shared by the whole scene via a single `<ParticleCanvas>` overlay.
 *
 * Design notes for performance (GDD: "optimize to not overload the CPU/GPU"):
 *   • Fixed-size object pool (`MAX`) — never allocates during play after warm-up.
 *   • Inactive particles are skipped in O(active) using a free-list cursor.
 *   • Emitters are no-ops once the pool is saturated, so a burst storm can never
 *     blow the frame budget.
 *   • Coordinates are CSS pixels; the canvas component handles the DPR transform.
 */

export type ParticleType = 'confetti' | 'spark' | 'bubble' | 'splash' | 'ring' | 'coin'

interface Particle {
  active: boolean
  type: ParticleType
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  size: number
  rot: number; spin: number
  gravity: number
  drag: number
  color: string
  wobble: number
  wobbleAmp: number
  // Coin flight (Umbrella board → wallet): quadratic Bézier start →
  // control → target, held for `delay` ms first so a burst fans out in turn.
  x0: number; y0: number
  cx: number; cy: number
  tx: number; ty: number
  delay: number
}

const MAX = 300
const pool: Particle[] = []
for (let i = 0; i < MAX; i++) {
  pool.push({
    active: false, type: 'spark', x: 0, y: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1, size: 1, rot: 0, spin: 0, gravity: 0, drag: 1,
    color: '#fff', wobble: 0, wobbleAmp: 0,
    x0: 0, y0: 0, cx: 0, cy: 0, tx: 0, ty: 0, delay: 0
  })
}
let cursor = 0

const CONFETTI_COLORS = ['#ff4d6d', '#ffd23c', '#36d399', '#3c9aff', '#b07bff', '#ff9a3c']

const acquire = (): Particle | null => {
  // One scan from the rolling cursor for a free slot. If none in a full sweep,
  // the pool is saturated → drop the request (cheap back-pressure).
  for (let i = 0; i < MAX; i++) {
    const idx = (cursor + i) % MAX
    const slot = pool[idx]!
    if (!slot.active) {
      cursor = (idx + 1) % MAX
      slot.delay = 0
      return slot
    }
  }
  return null
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a)

/** Explosive confetti shreds — the merge / brew-success celebration. */
export const emitConfetti = (x: number, y: number, count = 14, speed = 1): void => {
  for (let i = 0; i < count; i++) {
    const p = acquire()
    if (!p) return
    const a = rand(0, Math.PI * 2)
    const v = rand(2.5, 7) * speed
    p.active = true; p.type = 'confetti'
    p.x = x; p.y = y
    p.vx = Math.cos(a) * v
    p.vy = Math.sin(a) * v - rand(1, 4)
    p.maxLife = p.life = rand(520, 980)
    p.size = rand(4, 9)
    p.rot = rand(0, Math.PI * 2); p.spin = rand(-0.4, 0.4)
    p.gravity = 0.022; p.drag = 0.985
    p.color = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]!
    p.wobble = 0; p.wobbleAmp = 0
  }
}

/** Glowing sparkle stars — spawn shimmer, idle twinkle, legendary streams. */
export const emitSparkle = (x: number, y: number, color = '#fff7b0', count = 8): void => {
  for (let i = 0; i < count; i++) {
    const p = acquire()
    if (!p) return
    const a = rand(0, Math.PI * 2)
    const v = rand(0.6, 3)
    p.active = true; p.type = 'spark'
    p.x = x; p.y = y
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v
    p.maxLife = p.life = rand(380, 760)
    p.size = rand(2, 5)
    p.gravity = -0.005; p.drag = 0.95
    p.color = color
    p.rot = 0; p.spin = 0; p.wobble = 0; p.wobbleAmp = 0
  }
}

/** Liquid splash droplets thrown up when a unit hits the cauldron surface. */
export const emitSplash = (x: number, y: number, color: string): void => {
  for (let i = 0; i < 12; i++) {
    const p = acquire()
    if (!p) return
    const a = -Math.PI / 2 + rand(-1.1, 1.1)
    const v = rand(2, 6)
    p.active = true; p.type = 'splash'
    p.x = x; p.y = y
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v
    p.maxLife = p.life = rand(360, 620)
    p.size = rand(3, 6)
    p.gravity = 0.16; p.drag = 0.99
    p.color = color
    p.rot = 0; p.spin = 0; p.wobble = 0; p.wobbleAmp = 0
  }
  // An expanding ripple ring.
  const r = acquire()
  if (r) {
    r.active = true; r.type = 'ring'
    r.x = x; r.y = y; r.vx = 0; r.vy = 0
    r.maxLife = r.life = 460
    r.size = 6; r.gravity = 0; r.drag = 1
    r.color = color; r.rot = 0; r.spin = 0; r.wobble = 0; r.wobbleAmp = 0
  }
}

/** A single rising cauldron bubble. The cauldron calls this at a rate scaled by
 *  thermal tier + heat upgrade (GDD §4.1.3). */
export const emitBubble = (x: number, y: number, color: string): void => {
  const p = acquire()
  if (!p) return
  p.active = true; p.type = 'bubble'
  p.x = x + rand(-3, 3); p.y = y
  p.vx = rand(-0.2, 0.2); p.vy = -rand(0.6, 1.6)
  p.maxLife = p.life = rand(700, 1300)
  p.size = rand(3, 8)
  p.gravity = -0.004; p.drag = 1
  p.color = color
  p.rot = 0; p.spin = 0
  p.wobble = rand(0, Math.PI * 2); p.wobbleAmp = rand(0.2, 0.8)
}

// ─── Coin flight (additive: Umbrella) ───────────────────────────────
let coinImage: HTMLImageElement | HTMLCanvasElement | null = null
/** The bitmap coin flights draw (a gold disc is drawn until it has loaded). */
export const setCoinFlightImage = (img: HTMLImageElement | HTMLCanvasElement | null): void => {
  coinImage = img
}

/**
 * `count` coins burst out of (x, y) and home in on (tx, ty) — the wallet badge.
 * Client px, like every emitter here. Staggered so a burst reads as a stream.
 */
export const emitCoinFlight = (x: number, y: number, tx: number, ty: number, count = 4, size = 16): void => {
  for (let i = 0; i < count; i++) {
    const p = acquire()
    if (!p) return
    const a = rand(0, Math.PI * 2)
    const burst = rand(28, 70)
    p.active = true; p.type = 'coin'
    p.x0 = x + Math.cos(a) * 4; p.y0 = y + Math.sin(a) * 4
    p.x = p.x0; p.y = p.y0
    // Control point: thrown outward (and a little up) before the pull home.
    p.cx = x + Math.cos(a) * burst; p.cy = y + Math.sin(a) * burst - rand(20, 60)
    p.tx = tx; p.ty = ty
    p.vx = 0; p.vy = 0
    p.delay = i * rand(28, 55)
    p.maxLife = p.life = rand(620, 820)
    p.size = size * rand(0.85, 1.1)
    p.rot = rand(0, Math.PI * 2); p.spin = rand(0.18, 0.32)
    p.gravity = 0; p.drag = 1
    p.color = '#ffd23c'
    p.wobble = 0; p.wobbleAmp = 0
  }
}

/** Advance every active particle by `dt` ms. */
export const updateParticles = (dt: number): void => {
  const f = dt / 16.6667 // normalise to 60fps steps
  for (let i = 0; i < MAX; i++) {
    const p = pool[i]!
    if (!p.active) continue
    if (p.type === 'coin') {
      if (p.delay > 0) { p.delay -= dt; continue }
      p.life -= dt
      if (p.life <= 0) {
        p.active = false
        emitSparkle(p.tx, p.ty, '#ffe27a', 2)
        continue
      }
      const q = 1 - p.life / p.maxLife
      const e = q * q * (1.6 - 0.6 * q) // slow launch, fast arrival
      const u = 1 - e
      p.x = u * u * p.x0 + 2 * u * e * p.cx + e * e * p.tx
      p.y = u * u * p.y0 + 2 * u * e * p.cy + e * e * p.ty
      p.rot += p.spin * f
      continue
    }
    p.life -= dt
    if (p.life <= 0) { p.active = false; continue }
    p.vy += p.gravity * f
    p.vx *= Math.pow(p.drag, f)
    p.vy *= Math.pow(p.drag, f)
    if (p.type === 'bubble') {
      p.wobble += 0.12 * f
      p.x += (p.vx + Math.cos(p.wobble) * p.wobbleAmp) * f
    } else {
      p.x += p.vx * f
    }
    p.y += p.vy * f
    p.rot += p.spin * f
  }
}

/** Draw every active particle. `ctx` is already DPR-transformed by the caller. */
export const drawParticles = (ctx: CanvasRenderingContext2D): void => {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i]!
    if (!p.active) continue
    if (p.type === 'coin' && p.delay > 0) continue
    const t = p.life / p.maxLife // 1 → 0
    ctx.globalAlpha = p.type === 'coin' ? 1 : Math.max(0, Math.min(1, t < 0.3 ? t / 0.3 : 1))
    switch (p.type) {
      case 'confetti': {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
        break
      }
      case 'spark': {
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * t), 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        break
      }
      case 'splash': {
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'bubble': {
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.5
        ctx.globalAlpha *= 0.7
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.stroke()
        // highlight
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.beginPath()
        ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.25, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'coin': {
        // A spinning coin: squash X by |cos| for the flip, shrink into the wallet.
        const s = p.size * (0.7 + 0.3 * Math.min(1, t * 3))
        const sx = Math.max(0.2, Math.abs(Math.cos(p.rot)))
        const img = coinImage
        const ready = img !== null && (!(img instanceof HTMLImageElement) || (img.complete && img.naturalWidth > 0))
        if (ready) {
          ctx.drawImage(img, p.x - (s * sx) / 2, p.y - s / 2, s * sx, s)
        } else {
          ctx.fillStyle = '#ffd23c'
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, (s * sx) / 2, s / 2, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#b8860b'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
        break
      }
      case 'ring': {
        const prog = 1 - t
        ctx.strokeStyle = p.color
        ctx.lineWidth = 3 * t + 0.5
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size + prog * 46, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
    }
  }
  ctx.globalAlpha = 1
}

/** True while any particle is alive — lets the canvas idle its RAF when calm. */
export const hasLiveParticles = (): boolean => {
  for (let i = 0; i < MAX; i++) if (pool[i]!.active) return true
  return false
}

/** Hard reset (scene teardown). */
export const clearParticles = (): void => {
  for (let i = 0; i < MAX; i++) pool[i]!.active = false
}
