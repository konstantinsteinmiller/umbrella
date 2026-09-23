/**
 * Tray ⇄ board flights — the always-on half of the tray lesson.
 *
 * The tray sits under the board and nothing tied the two together: its balls
 * did not visibly become the volley, and a "+1" popped on the board while a
 * socket filled somewhere else. Two small flights make the link every turn:
 *
 *   • fire   — the tray's balls stream into the unit (the first few; a big
 *              tray is a stream, not a swarm);
 *   • pickup — a collected "+1" flies from its bubble into the tray socket it
 *              filled (or the ball it merged into).
 *
 * Plain DOM + WAAPI on a fixed layer: no Vue churn per flight, a hard cap on
 * live flights, nothing at all under prefers-reduced-motion.
 */
import { ballColors, fighterSrc } from '@/barrage/art'

export interface Pt { x: number; y: number }

const MAX_LIVE = 10
let live = 0
let layer: HTMLDivElement | null = null

const reduced = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const host = (): HTMLDivElement | null => {
  if (typeof document === 'undefined') return null
  if (layer && layer.isConnected) return layer
  layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '45', overflow: 'hidden' })
  document.body.appendChild(layer)
  return layer
}

export interface FlightOpts {
  /** 'orb' — a tray ball (tier face); 'plus' — the green "+1" bubble. */
  kind: 'orb' | 'plus'
  tier?: number
  size: number
  delay?: number
  dur?: number
  /** Arc height in px (up is positive). */
  arc?: number
  /** Scale at the end (the orb shrinks into the unit). */
  endScale?: number
  endOpacity?: number
}

export const fly = (from: Pt, to: Pt, o: FlightOpts): void => {
  if (reduced() || live >= MAX_LIVE) return
  const root = host()
  if (!root) return
  const el = document.createElement('div')
  const s = o.size
  Object.assign(el.style, {
    position: 'absolute', left: `${from.x - s / 2}px`, top: `${from.y - s / 2}px`, width: `${s}px`, height: `${s}px`,
    borderRadius: '50%', overflow: 'hidden', opacity: '0'
  })
  if (o.kind === 'orb') {
    const c = ballColors(o.tier ?? 1)
    Object.assign(el.style, {
      border: `2px solid ${c.glow}`,
      background: `radial-gradient(circle at 35% 30%, ${c.light}, ${c.body} 70%)`,
      boxShadow: `0 0 8px ${c.glow}`
    })
    const img = document.createElement('img')
    img.src = fighterSrc(o.tier ?? 1)
    img.alt = ''
    img.draggable = false
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' })
    el.appendChild(img)
  } else {
    Object.assign(el.style, {
      border: '2px solid rgba(125, 255, 154, 0.95)',
      background: 'radial-gradient(circle at 35% 30%, rgba(210,255,220,0.6), rgba(90,220,130,0.3) 60%)',
      boxShadow: '0 0 10px rgba(125, 255, 154, 0.8)'
    })
  }
  root.appendChild(el)
  live++
  const dx = to.x - from.x
  const dy = to.y - from.y
  const arc = o.arc ?? 0
  const end = o.endScale ?? 1
  const anim = el.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) scale(${(1 + end) / 2})`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: o.endOpacity ?? 0.2 }
  ], { duration: o.dur ?? 320, delay: o.delay ?? 0, easing: 'ease-in-out', fill: 'backwards' })
  const done = (): void => { el.remove(); live = Math.max(0, live - 1) }
  anim.onfinish = done
  anim.oncancel = done
}

export const centreOfEl = (el: Element | null | undefined): Pt | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
}
