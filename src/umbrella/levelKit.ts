// ─── Level builders, shared by the campaign (levels.ts) and the kite levels ──
//
// Tiny constructors for the level data format (types in levels.ts). Kept in a
// module of their own so kiteLevels.ts can use them without importing levels.ts
// at runtime (levels.ts picks the kite levels, so that would be an import cycle).
// Type-only imports: nothing here runs levels.ts.

import type { ButtonDef, CheckpointDef, HazardDef, Motion, PlatformDef, WalldorfContact, WindDef, WindDir } from './levels'

/** One screen, in world units. */
export const SCREEN = { w: 1280, h: 720 }

export const P = (x: number, y: number, w = 200, h = 20, extra: Partial<PlatformDef> = {}): PlatformDef => ({ x, y, w, h, ...extra })
export const FIN = (x: number, y: number, w = 160, motion?: Motion): PlatformDef => ({ x, y, w, h: 20, finish: true, motion })
export const UP = (x: number, y: number, w: number, h: number, speed = 260): WindDef => ({ x, y, w, h, dir: 'up', speed })
export const SUPER = (x: number, y: number, w: number, h: number, speed = 760): WindDef => ({ x, y, w, h, dir: 'up', speed, super: true })
export const WIND = (dir: WindDir, x: number, y: number, w: number, h: number, speed: number): WindDef => ({ x, y, w, h, dir, speed })
/** A pillar enemy (Walldorf) centred on (cx, cy). */
export const PILLAR = (cx: number, cy: number, motion?: Motion, w = 40, h = 200): HazardDef => ({ kind: 'pillar', x: cx - w / 2, y: cy - h / 2, w, h, motion })
/** A Walldorf with its touch spelled out (deadly, solid block or bouncy bumper). */
export const WALLDORF = (contact: WalldorfContact, cx: number, cy: number, motion?: Motion, w = 40, h = 200): HazardDef =>
  ({ ...PILLAR(cx, cy, motion, w, h), contact })
/** A spiky mine (Prickbait) centred on (cx, cy). */
export const MINE = (cx: number, cy: number, motion?: Motion, r = 26): HazardDef => ({ kind: 'mine', x: cx - r, y: cy - r, w: r * 2, h: r * 2, motion })
export const SPIKES = (x: number, y: number, w: number, facing: 'up' | 'down'): HazardDef => ({ kind: 'spikes', x, y, w, h: 26, facing })
/** A ventilator (shreds on touch) with its top-left at (x, y). */
export const FAN = (x: number, y: number, w = 90, h = 60): HazardDef => ({ kind: 'fan', x, y, w, h })
/** A floor button whose top-left is (x, y); `duration` makes it timed. */
export const BUTTON = (x: number, y: number, channel: number, duration?: number, w = 44, h = 14): ButtonDef =>
  duration ? { x, y, w, h, channel, duration } : { x, y, w, h, channel }
export const CHECKPOINT = (x: number, y: number): CheckpointDef => ({ x, y })
