// ─── Framing a level: what the opening view must hold ──────────────────────────────────────
//
// A level's world is often larger than what is in it: the platforms, currents and the finish sit in a
// band, with empty sky or empty fall below. Fitting the whole world then leaves a wide strip of nothing
// on the sides and below the lowest platform, where the out-of-bounds death waits.
//
// `levelFocus` is the box around everything that matters (the start, the finish, platforms and their
// movers' ends, currents, hazards, collectibles, gates, buttons, checkpoints, boards and arrows), kept
// inside the world. `frameFocus` turns it into a static view: zoomed on that box with a margin, never
// showing anything outside the world (the bottom edge of the view never goes below the world's bottom,
// the out-of-bounds line), and never smaller than the whole-world fit.

import { PLAYER_H, PLAYER_W, STAR_R } from './engine'
import { SIGN_H, SIGN_W, type LevelDef, type Motion } from './levels'

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** The margin around the focus, in world units (left, right, bottom), and the larger one on top (the HUD sits there). */
export const FOCUS_PAD = 56
/** How far a current counts past the main items (world units). */
export const WIND_REACH = 140
export const FOCUS_PAD_TOP = 96
/** The closest a level is framed, as a multiple of the whole-world fit. */
export const FOCUS_ZOOM_MAX = 1.6

const motionAnchors = (m: Motion | undefined): { x: number; y: number }[] => {
  if (!m) return []
  if (m.kind === 'line' || m.kind === 'lunge') return [m.a, m.b]
  if (m.kind === 'circle') return [{ x: m.center.x - m.radius, y: m.center.y - m.radius }, { x: m.center.x + m.radius, y: m.center.y + m.radius }]
  if (m.kind === 'swing') return [{ x: m.pivot.x - m.radius, y: m.pivot.y }, { x: m.pivot.x + m.radius, y: m.pivot.y + m.radius }]
  return []
}

const cache = new WeakMap<LevelDef, Box>()

/** The box around the level's main items (currents only a short way past them), inside the world (the whole world for an empty level). */
export const levelFocus = (l: LevelDef): Box => {
  const have = cache.get(l)
  if (have) return have
  const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  const add = (x: number, y: number, w = 0, h = 0) => {
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y)
    b.x1 = Math.max(b.x1, x + w); b.y1 = Math.max(b.y1, y + h)
  }
  const addMover = (e: { x: number; y: number; w: number; h: number; motion?: Motion }) => {
    add(e.x, e.y, e.w, e.h)
    for (const p of motionAnchors(e.motion)) add(p.x - e.w / 2, p.y - e.h / 2, e.w, e.h)
  }
  add(l.spawn.x - PLAYER_W / 2, l.spawn.y - PLAYER_H, PLAYER_W, PLAYER_H)
  for (const p of l.platforms) addMover(p)
  for (const h of l.hazards ?? []) addMover(h)
  for (const s of l.stars ?? []) add(s.x - STAR_R, s.y - STAR_R, STAR_R * 2, STAR_R * 2)
  if (l.medallion) add(l.medallion.x - STAR_R, l.medallion.y - STAR_R, STAR_R * 2, STAR_R * 2)
  for (const c of l.checkpoints ?? []) add(c.x - 20, c.y - 50, 40, 50)
  for (const x of [...(l.buttons ?? []), ...(l.gates ?? []), ...(l.pictures ?? [])]) add(x.x, x.y, x.w, x.h)
  for (const s of l.signs ?? []) add(s.x, s.y, s.w || SIGN_W, s.h || SIGN_H)
  for (const a of l.arrows ?? []) add(a.x - a.size / 2, a.y - a.size / 2, a.size, a.size)
  // Currents often run on down to the world's floor: they only widen the focus a short way past the main items
  // (the player floats in them near the platforms), so a column down to the floor does not drag the view to it.
  if (Number.isFinite(b.x0)) {
    const core = { ...b }
    for (const w of l.winds) {
      const x0 = Math.max(w.x, core.x0 - WIND_REACH), y0 = Math.max(w.y, core.y0 - WIND_REACH)
      const x1 = Math.min(w.x + w.w, core.x1 + WIND_REACH), y1 = Math.min(w.y + w.h, core.y1 + WIND_REACH)
      if (x1 > x0 && y1 > y0) add(x0, y0, x1 - x0, y1 - y0)
    }
  } else for (const w of l.winds) add(w.x, w.y, w.w, w.h)
  const { w: ww, h: wh } = l.world
  const out: Box = Number.isFinite(b.x0)
    ? { x0: Math.max(0, b.x0), y0: Math.max(0, b.y0), x1: Math.min(ww, b.x1), y1: Math.min(wh, b.y1) }
    : { x0: 0, y0: 0, x1: ww, y1: wh }
  if (out.x1 <= out.x0 || out.y1 <= out.y0) { out.x0 = 0; out.y0 = 0; out.x1 = ww; out.y1 = wh }
  cache.set(l, out)
  return out
}

export interface Framing { s: number; left: number; top: number }

/**
 * A static view of the level on a canvas `cw` wide and `fh` tall (the height above any controls' band).
 * Returns the scale and the world point at the view's top-left corner.
 */
export const frameFocus = (l: LevelDef, cw: number, fh: number): Framing => {
  const { w: ww, h: wh } = l.world
  const f = levelFocus(l)
  const px0 = Math.max(0, f.x0 - FOCUS_PAD), px1 = Math.min(ww, f.x1 + FOCUS_PAD)
  const py0 = Math.max(0, f.y0 - FOCUS_PAD_TOP), py1 = Math.min(wh, f.y1 + FOCUS_PAD)
  const fitWhole = Math.min(cw / ww, fh / wh)
  // No outside space at all: the scale at which the world fills the canvas on both axes.
  const cover = Math.max(cw / ww, fh / wh)
  const onFocus = Math.min(cw / (px1 - px0), fh / (py1 - py0))
  let s: number
  if (onFocus >= cover) s = onFocus
  // The focus is smaller than the cover view only on one axis: the cover scale still holds all of it.
  else if (cw / cover >= f.x1 - f.x0 && fh / cover >= f.y1 - f.y0) s = cover
  else s = Math.max(onFocus, fitWhole)
  s = Math.max(fitWhole, Math.min(s, Math.max(fitWhole * FOCUS_ZOOM_MAX, cover)))
  const vw = cw / s
  const vh = fh / s
  // Centred on the focus, kept inside the world; a view wider than the world stays centred; a view taller
  // than the world sits on the world's bottom, so nothing below the out-of-bounds line is ever shown.
  const cx = (f.x0 + f.x1) / 2
  const cy = (f.y0 + f.y1) / 2
  const left = vw >= ww ? (ww - vw) / 2 : Math.max(0, Math.min(ww - vw, cx - vw / 2))
  const top = vh >= wh ? wh - vh : Math.max(0, Math.min(wh - vh, cy - vh / 2))
  return { s, left, top }
}
