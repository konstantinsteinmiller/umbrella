// ─── Chad: the intro's cool character (intro.md, roadmap #0.7.0-9) ───────────
//
// Pweeg's shape with sunglasses and the same umbrella, plus the moves the
// pre-game cutscene needs: a front flip along an arc, a no-wobble landing, a
// cool idle and an effortless float under a forward-tilted umbrella. Pure
// drawing + small math helpers; the intro's timeline runner (#0.7.0-10) decides
// when each action plays and, for the float, where the engine has moved him.

import { drawPweeg, drawUmbrella, type PweegPose } from './characters'
import type { Vec } from './levels'

export type ChadAction = 'idle' | 'flip' | 'land' | 'float' | 'walk'

export interface ChadState {
  action: ChadAction
  /** Seconds into the action. */
  t: number
  facing: 1 | -1
  /** Hitbox size, like the player's. */
  w: number
  h: number
  /** Float: horizontal speed, for the umbrella's lean (px/s). Walk: also drives the stride. */
  vx?: number
}

/** How long the one-shot actions take (s). */
export const FLIP_TIME = 0.9
export const LAND_TIME = 0.18

/** Where Chad is `k` (0..1) of the way along a flip from `from` to `to` peaking at
 *  `apexY` (world y of the top of the arc): a parabola through the three. */
export const flipArc = (from: Vec, to: Vec, apexY: number, k: number): Vec => {
  const u = Math.max(0, Math.min(1, k))
  const x = from.x + (to.x - from.x) * u
  // Quadratic Bézier whose peak reaches apexY.
  const cy = 2 * apexY - (from.y + to.y) / 2
  const y = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * cy + u * u * to.y
  return { x, y }
}

/** Chad with his feet centred on (x, y). */
export const drawChad = (ctx: CanvasRenderingContext2D, x: number, y: number, s: ChadState): void => {
  const look = (pose: PweegPose) => ({ pose, facing: s.facing, w: s.w, h: s.h, time: s.t, shades: true })
  ctx.save()
  switch (s.action) {
    case 'flip': {
      // One full forward rotation around his middle, tucked (legs curled).
      const k = Math.min(1, s.t / FLIP_TIME)
      const ease = k * k * (3 - 2 * k)
      const cy = y - s.h / 2
      ctx.translate(x, cy)
      ctx.rotate(s.facing * ease * Math.PI * 2)
      ctx.translate(-x, -cy)
      drawPweeg(ctx, x, y, look('stand'))
      drawUmbrella(ctx, x + s.facing * s.w * 0.8, y - s.h * 0.35, { state: 'furled', tilt: s.facing * 0.22, time: s.t })
      break
    }
    case 'land': {
      // A tiny knee bend, straight back up: no wobble.
      const k = Math.min(1, s.t / LAND_TIME)
      const squash = Math.sin(k * Math.PI) * 0.12
      ctx.translate(x, y)
      ctx.scale(1 + squash, 1 - squash)
      ctx.translate(-x, -y)
      drawPweeg(ctx, x, y, look('stand'))
      drawUmbrella(ctx, x + s.facing * s.w * 0.8, y - s.h * 0.35, { state: 'furled', tilt: s.facing * 0.22, time: s.t })
      break
    }
    case 'idle': {
      // Cool: a slow head-nod tilt toward where he looks.
      const tilt = s.facing * 0.06 * Math.sin(s.t * 2.2)
      ctx.translate(x, y)
      ctx.rotate(tilt)
      ctx.translate(-x, -y)
      drawPweeg(ctx, x, y, look('stand'))
      drawUmbrella(ctx, x + s.facing * s.w * 0.8, y - s.h * 0.35, { state: 'furled', tilt: s.facing * 0.22, time: s.t })
      break
    }
    case 'walk': {
      // A relaxed stroll: legs step with the distance walked.
      const look2 = { ...look('walk'), step: s.t * Math.abs(s.vx ?? 120) * 0.09 }
      drawPweeg(ctx, x, y, look2)
      drawUmbrella(ctx, x + s.facing * s.w * 0.8, y - s.h * 0.35, { state: 'furled', tilt: s.facing * 0.22, time: s.t })
      break
    }
    case 'float': {
      // Effortless: hanging from the open umbrella, leaning forward into the glide.
      const lean = s.facing * 0.32 + Math.max(-0.12, Math.min(0.12, (s.vx ?? 0) / 2000))
      drawPweeg(ctx, x, y, look('hold'))
      drawUmbrella(ctx, x, y - s.h - 4, { state: 'open', tilt: lean, time: s.t })
      break
    }
  }
  ctx.restore()
}
