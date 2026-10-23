// ─── Character art (design doc v0.7.0, docs/design/reference/) ──────────────
//
// Vector drawings of Pweeg (and Chad: Pweeg with sunglasses), the umbrella,
// Walldorf and Prickbait, drawn straight onto the game canvas so they stay
// sharp at any zoom and can bend into poses. Coordinates are world units;
// every function draws where it is told and leaves the context as it found it.
// The look follows the doc's ink sketches, turned light-on-dark for the game:
// white shapes, dark eyes, the umbrella white with one red panel.

const BODY = '#ffffff'
const INK = '#0d1018'
const RED = '#e5484d'
const LINE = '#1b2130'

// ── Pweeg ──

/** stand / walk on the ground; hold = floating under the open umbrella;
 *  flail = free fall, arms up, legs bent out with the feet up (sideways = this rotated);
 *  terminal = upside-down speed, legs up and goggle eyes; cheer = the win dance. */
export type PweegPose = 'stand' | 'walk' | 'hold' | 'flail' | 'terminal' | 'cheer'

export interface PweegLook {
  pose: PweegPose
  facing: 1 | -1
  /** Hitbox size: the drawing fits it (feet at the bottom). */
  w: number
  h: number
  /** Seconds, for small idle motions. */
  time: number
  /** Walk cycle phase (radians). */
  step?: number
  /** Chad. */
  shades?: boolean
  blink?: boolean
  /** Looking straight at the camera (eyes centred), e.g. the intro's hand-over. */
  front?: boolean
}

/** Pweeg with his feet centred on (x, y). */
export const drawPweeg = (ctx: CanvasRenderingContext2D, x: number, y: number, look: PweegLook): void => {
  const { w: W, h: H, facing, pose } = look
  const r = W * 0.44
  const headY = y - H + r
  const neckY = headY + r * 0.8
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = BODY
  ctx.lineWidth = Math.max(2.4, W * 0.13)

  /** Legs as in the sketches: two thick rounded tubes from under the head.
   *  stand = curled under him, feet meeting in the middle (the seated look);
   *  dangle = hanging relaxed (under the umbrella); hook = bent down and out, feet
   *  curled up (the "safe fall" W); long = stretched straight (terminal velocity). */
  const legW = Math.max(4, W * 0.24)
  const legs = (kind: 'stand' | 'dangle' | 'hook' | 'long', swing = 0) => {
    ctx.save()
    ctx.lineWidth = legW
    const hipY = neckY - legW * 0.2
    const foot = y - legW / 2
    for (const s of [-1, 1]) {
      const sw = swing * s
      ctx.beginPath()
      ctx.moveTo(x + s * r * 0.22, hipY)
      if (kind === 'stand') {
        // Two short tube legs, feet turned out. Walking (`swing` = step phase × amount)
        // lifts and swings them alternately.
        const phase = swing && (s > 0 ? swing : -swing)
        const lift = Math.max(0, phase) * H * 0.5
        const reach = phase * W * 0.6
        const fx = x + s * W * 0.3 + reach
        const fy = foot - lift
        ctx.quadraticCurveTo(x + s * W * 0.42, hipY + (fy - hipY) * 0.55, fx, fy)
        ctx.lineTo(fx + s * W * 0.32, fy - legW * 0.1)
      } else if (kind === 'dangle') {
        ctx.quadraticCurveTo(x + s * W * 0.45, hipY + (foot - hipY) * 0.5, x + s * W * 0.3 + sw, foot + H * 0.08)
      } else if (kind === 'hook') {
        ctx.bezierCurveTo(x + s * W * 0.35, foot + H * 0.05, x + s * W * 0.85, foot + H * 0.08, x + s * (W * 0.88 + sw), foot - H * 0.28)
      } else {
        ctx.quadraticCurveTo(x + s * W * 0.34, hipY + H * 0.45, x + s * (W * 0.24 + sw), y + H * 0.42)
      }
      ctx.lineWidth = legW
      ctx.strokeStyle = BODY
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Standing arms: the hand on his facing side holds the furled umbrella's grip
   *  (where the scene draws it), the other hangs and swings with the walk. */
  const arms = (swing: number) => {
    ctx.beginPath()
    ctx.moveTo(x + facing * r * 0.55, neckY)
    ctx.quadraticCurveTo(x + facing * W * 0.85, neckY + H * 0.05, x + facing * W * 0.8, y - H * 0.35)
    ctx.moveTo(x - facing * r * 0.55, neckY)
    ctx.quadraticCurveTo(x - facing * W * 0.8, neckY + H * 0.1, x - facing * W * (0.6 - swing * 0.15), y - H * 0.28)
    ctx.stroke()
  }

  switch (pose) {
    case 'stand':
      arms(0)
      legs('stand')
      break
    case 'walk': {
      const swing = Math.sin(look.step ?? 0)
      arms(swing)
      legs('stand', swing * 0.25)
      break
    }
    case 'hold':
      // Both hands up on the umbrella's grip, just above the head.
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(x + s * r * 0.55, neckY)
        ctx.quadraticCurveTo(x + s * W * 0.95, headY - r * 0.2, x + s * 2.5, y - H - 4)
        ctx.stroke()
      }
      legs('dangle', Math.sin(look.time * 3) * W * 0.08)
      break
    case 'flail': {
      // Arms raised and bent outward, a little wiggle; legs bent out, feet up.
      const wig = Math.sin(look.time * 16) * W * 0.06
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(x + s * r * 0.5, neckY)
        ctx.quadraticCurveTo(x + s * W * 0.95, neckY + H * 0.08, x + s * (W * 0.98 + wig * s), headY - r * 0.7)
        ctx.stroke()
      }
      legs('hook', wig)
      break
    }
    case 'terminal':
      // Long straight legs; the scene turns him upside-down so they point up.
      legs('long', Math.sin(look.time * 20) * W * 0.04)
      break
    case 'cheer':
      for (const s of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(x + s * r * 0.5, neckY)
        ctx.lineTo(x + s * W * 0.95, headY - r * 1.3)
        ctx.stroke()
      }
      legs('stand')
      break
  }

  // Head.
  ctx.fillStyle = BODY
  ctx.beginPath()
  ctx.arc(x, headY, r, 0, Math.PI * 2)
  ctx.fill()

  // Eyes look the way he faces; at terminal velocity they are big goggles.
  const look2 = (look.front ? 0 : facing) * r * 0.25
  if (pose === 'terminal') {
    const er = r * 0.36
    for (const dx of [-r * 0.42, r * 0.42]) {
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(x + dx, headY, er, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = BODY
      ctx.beginPath()
      ctx.arc(x + dx, headY, er * 0.68, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.beginPath()
      ctx.arc(x + dx + look2 * 0.4, headY + er * 0.2, er * 0.32, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (look.shades) {
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.roundRect(x - r * 0.82 + look2 * 0.4, headY - r * 0.32, r * 1.64, r * 0.48, r * 0.2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = Math.max(1, r * 0.08)
    ctx.beginPath()
    ctx.moveTo(x - r * 0.5 + look2 * 0.4, headY - r * 0.18)
    ctx.lineTo(x - r * 0.25 + look2 * 0.4, headY - r * 0.18)
    ctx.stroke()
  } else {
    ctx.fillStyle = INK
    for (const dx of [-r * 0.3, r * 0.3]) {
      ctx.beginPath()
      if (look.blink) ctx.fillRect(x + dx + look2 - r * 0.14, headY - r * 0.03, r * 0.28, r * 0.07)
      else {
        ctx.arc(x + dx + look2, headY - r * 0.05, r * 0.13, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.restore()
}

// ── Umbrella ──

export interface UmbrellaLook {
  state: 'open' | 'furled' | 'broken'
  /** Lean (radians, + = clockwise), e.g. into the direction of drift. */
  tilt: number
  time: number
}

/** Canopy size: matches the wind hitbox (engine `umbrellaBox`): rim 22 above the
 *  grip, apex 62 above it, 60 wide. */
const RIM = 22
const DOME = 40
const HALF = 30

/** The umbrella held at its grip (x, y). */
export const drawUmbrella = (ctx: CanvasRenderingContext2D, x: number, y: number, look: UmbrellaLook): void => {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(look.tilt)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // J-handle and shaft.
  ctx.strokeStyle = BODY
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(-3.5, 0, 3.5, 0, Math.PI)
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -RIM - (look.state === 'open' ? 2 : 0))
  ctx.stroke()

  if (look.state === 'open') {
    const apexY = -RIM - DOME
    const ribs = [-HALF, -HALF / 2, 0, HALF / 2, HALF]
    // Panels: white, the second one red (the doc's hatched panel).
    for (let i = 0; i < ribs.length - 1; i++) {
      const a = ribs[i]!
      const b = ribs[i + 1]!
      ctx.beginPath()
      ctx.moveTo(0, apexY)
      ctx.quadraticCurveTo(a * 0.82, apexY + DOME * 0.12, a, -RIM)
      ctx.quadraticCurveTo((a + b) / 2, -RIM - 7, b, -RIM)
      ctx.quadraticCurveTo(b * 0.82, apexY + DOME * 0.12, 0, apexY)
      ctx.closePath()
      ctx.fillStyle = i === 1 ? RED : BODY
      ctx.fill()
      ctx.strokeStyle = LINE
      ctx.lineWidth = 1.4
      ctx.stroke()
    }
    // Rib tips and the finial.
    ctx.fillStyle = LINE
    for (const rx of ribs) {
      ctx.beginPath()
      ctx.arc(rx, -RIM, 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = BODY
    ctx.beginPath()
    ctx.arc(0, apexY - 2.5, 3, 0, Math.PI * 2)
    ctx.fill()
  } else if (look.state === 'furled') {
    // Rolled up: a slim spike with a red wrap.
    ctx.fillStyle = BODY
    ctx.beginPath()
    ctx.moveTo(-4.5, -RIM)
    ctx.lineTo(0, -RIM - 24)
    ctx.lineTo(4.5, -RIM)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = RED
    ctx.beginPath()
    ctx.moveTo(-3.6, -RIM - 5)
    ctx.lineTo(-2.4, -RIM - 11)
    ctx.lineTo(2.4, -RIM - 11)
    ctx.lineTo(3.6, -RIM - 5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = BODY
    ctx.beginPath()
    ctx.arc(0, -RIM - 25, 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Inside-out: ribs splayed up, torn panels flapping.
    const flap = Math.sin(look.time * 22) * 2.5
    const tips: [number, number][] = [[-24, -RIM - 20 + flap], [-11, -RIM - 26 - flap], [11, -RIM - 26 + flap], [24, -RIM - 20 - flap]]
    for (let i = 0; i < tips.length - 1; i++) {
      const [ax, ay] = tips[i]!
      const [bx, by] = tips[i + 1]!
      ctx.beginPath()
      ctx.moveTo(0, -RIM)
      ctx.lineTo(ax, ay)
      ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) + 6, bx, by)
      ctx.closePath()
      ctx.fillStyle = i === 1 ? RED : BODY
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = BODY
    ctx.lineWidth = 2
    ctx.beginPath()
    for (const [tx, ty] of tips) {
      ctx.moveTo(0, -RIM)
      ctx.lineTo(tx, ty)
    }
    ctx.stroke()
  }
  ctx.restore()
}

// ── Walldorf ──

export interface WalldorfLook {
  /** What touching it does: the body colour tells the player. */
  contact: 'deadly' | 'solid' | 'bounce'
  /** Looks this way (+1 right, -1 left). */
  facing: 1 | -1
  /** A Walldorf that can charge looks angry. */
  angry: boolean
}

/** One colour per touch behaviour, so players read a Walldorf at a glance (editor uses them too). */
export const WALLDORF_COLORS = { deadly: '#ff5a5f', solid: '#c3cde0', bounce: '#ffb020' }

/** A tall rounded pillar with two stacked eyes on its facing side. */
export const drawWalldorf = (ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number }, look: WalldorfLook): void => {
  const radius = Math.min(b.w / 2, 14)
  ctx.save()
  ctx.fillStyle = WALLDORF_COLORS[look.contact]
  ctx.beginPath()
  ctx.roundRect(b.x, b.y, b.w, b.h, radius)
  ctx.fill()
  if (look.contact === 'bounce') {
    // A bumper's springy rim.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, Math.max(2, radius - 3))
    ctx.stroke()
  }
  const er = Math.min(b.w * 0.2, 9)
  const ex = b.x + b.w / 2 + look.facing * b.w * 0.18
  const top = b.y + Math.min(b.h * 0.3, 70)
  ctx.lineCap = 'round'
  for (const ey of [top - er * 1.05, top + er * 1.05]) {
    ctx.fillStyle = BODY
    ctx.beginPath()
    ctx.arc(ex, ey, er, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(ex + look.facing * er * 0.38, ey, er * 0.45, 0, Math.PI * 2)
    ctx.fill()
  }
  if (look.angry) {
    // Brows slanting down toward where it looks.
    ctx.strokeStyle = INK
    ctx.lineWidth = Math.max(2, er * 0.32)
    for (const ey of [top - er * 1.05, top + er * 1.05]) {
      ctx.beginPath()
      ctx.moveTo(ex - look.facing * er * 1.05, ey - er * 1.2)
      ctx.lineTo(ex + look.facing * er * 0.95, ey - er * 0.55)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ── Prickbait ──

/** A round spiky body with angry brows, eyes on (lookX, lookY). (x, y, r): its circle. */
export const drawPrickbait = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, lookX: number, lookY: number, time: number): void => {
  ctx.save()
  const body = r * 0.8
  const spin = Math.sin(time * 1.3) * 0.12
  ctx.fillStyle = '#d93a40'
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = spin - Math.PI / 2 + (i / 6) * Math.PI * 2
    const side = 0.36
    ctx.moveTo(x + Math.cos(a - side) * body * 0.92, y + Math.sin(a - side) * body * 0.92)
    ctx.lineTo(x + Math.cos(a) * r * 1.18, y + Math.sin(a) * r * 1.18)
    ctx.lineTo(x + Math.cos(a + side) * body * 0.92, y + Math.sin(a + side) * body * 0.92)
  }
  ctx.fill()
  ctx.fillStyle = '#ff5a5f'
  ctx.beginPath()
  ctx.arc(x, y, body, 0, Math.PI * 2)
  ctx.fill()
  // Eyes follow the player.
  const d = Math.hypot(lookX - x, lookY - y) || 1
  const px = ((lookX - x) / d) * r * 0.08
  const py = ((lookY - y) / d) * r * 0.08
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.27
    const ey = y - r * 0.02
    ctx.fillStyle = BODY
    ctx.beginPath()
    ctx.arc(ex, ey, r * 0.21, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.beginPath()
    ctx.arc(ex + px, ey + py, r * 0.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(2, r * 0.1)
  ctx.lineCap = 'round'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x + s * r * 0.52, y - r * 0.4)
    ctx.lineTo(x + s * r * 0.1, y - r * 0.24)
    ctx.stroke()
  }
  ctx.restore()
}
