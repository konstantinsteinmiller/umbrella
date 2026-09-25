/**
 * Rule marks — each monster's one rule, shown ON the monster, without words.
 *
 * The retired "new monster" card sat mid-board for three seconds while the
 * balls flew — play-testers called it an interruption, not information. The
 * rule now lives where the player is already looking, and it waits for them:
 * Barrage is turn-based, so while they aim nothing moves and a mark can be
 * studied for as long as they like.
 *
 *   • BADGE  — a round icon on the monster's shoulder (hop / heal / spit /
 *     coins / skull …) for its kind's first TAG_TURNS (4) aim phases
 *     (`useCoach` owns that clock; the renderer gets the retired keys). The
 *     TOUGH kinds, whose one rule is more HP (caterpillar, ogre), wear NO
 *     badge: run 4's armour icon read "shielded", run 5's heart "×2" read
 *     "heal? damage? reward?" — and the HP number already says it.
 *   • INTENT — (run 5, `intents.ts`) while its badge is up, a behaviour kind
 *     shows its NEXT move in a way a still frame reads: the goblin's hop
 *     target, the dryad's "+" on the neighbours it heals, the centaur's sludge
 *     cell, the treant's rest marker. Aim phase only, never under a finger.
 *   • DEMO   — the other badges' rules are acted out in place during the aim
 *     phase: two little imps burst out of an imp, a ball bounces off a
 *     carbuncle's gem, a cyclops's ghost charges, coins rise off an elite.
 *   • ALWAYS — two telegraphs every player gets, forever: red chevrons over
 *     the columns a boss is entering through, and a double chevron under an
 *     ENRAGED boss (it now marches two rows a turn).
 *
 * This module bakes the badges and the intent glyphs; BoardRenderer draws.
 */
import type { Monster, MonsterKind } from '../engine/types'
import { createCanvas, ctx2d, type SpriteImage } from './sprites'

export type RuleIcon = 'hop' | 'heal' | 'spit' | 'coins' | 'skull' | 'split' | 'slow' | 'shield' | 'charge'

/** The kinds whose one rule is more HP: they wear no badge (run 5). (Treant /
 *  carbuncle / cyclops carry more HP too, but their rule is a behaviour —
 *  they keep its icon.) */
export const TOUGH_KINDS: readonly MonsterKind[] = ['caterpillar', 'ogre']

/** Badge key of a monster: its kind, `corrupted`, `boss:<kind>` — or null for
 *  the slime (the FTUE board IS the slime lesson). `useCoach` counts aim
 *  phases per key and retires a key after TAG_TURNS. */
export const tagKeyOf = (m: Pick<Monster, 'kind' | 'bossKind' | 'corrupted'>): string | null => {
  if (m.kind === 'boss') return m.bossKind ? `boss:${m.bossKind}` : null
  if (m.corrupted) return 'corrupted'
  return m.kind === 'slime' ? null : m.kind
}

export const ruleIconOf = (m: Pick<Monster, 'kind' | 'corrupted' | 'mini'>): RuleIcon | null => {
  if (m.kind === 'boss') return 'skull'
  if (m.corrupted) return 'coins'
  switch (m.kind) {
    case 'goblin': return 'hop'
    // caterpillar, ogre: more HP is not a rule to learn — no badge.
    case 'dryad': return 'heal'
    case 'centaur': return 'spit'
    // A little imp is the rule's RESULT, not a second imp to learn.
    case 'imp': return m.mini ? null : 'split'
    case 'treant': return 'slow'
    case 'carbuncle': return 'shield'
    case 'cyclops': return 'charge'
    default: return null
  }
}

const RING: Record<RuleIcon, string> = {
  hop: '#86d957', heal: '#6fe08a', spit: '#c3d052', coins: '#ffd23c', skull: '#ff4a3a',
  split: '#e0924e', slow: '#8ccf5a', shield: '#6fc8ff', charge: '#ff9a3a'
}

// Pictograms in a 24×24 box (the DOM glyph set's grid).
const ICON_PATHS: Record<Exclude<RuleIcon, 'coins'>, { stroke?: string; fill?: string }> = {
  // A hop arc with a head at both ends: "jumps sideways".
  hop: { stroke: 'M5 16 Q12 3 19 16 M19 16 L14.6 15.4 M19 16 L19.6 11.6 M5 16 L9.4 15.4 M5 16 L4.4 11.6' },
  heal: { stroke: 'M12 5 V19 M5 12 H19' },
  // A glob and a drop arrow: "spits down".
  spit: { fill: 'M8.5 3.5 C8.5 3.5 4.5 8.5 4.5 11 A4 4 0 0 0 12.5 11 C12.5 8.5 8.5 3.5 8.5 3.5 Z', stroke: 'M17.5 6 V18 M14 14.5 L17.5 18 L21 14.5' },
  skull: {
    fill: 'M12 3 C7 3 4 6.5 4 11 C4 13.5 5.2 15.3 7 16.3 V19.5 H17 V16.3 C18.8 15.3 20 13.5 20 11 C20 6.5 17 3 12 3 Z'
  },
  // One ball, two smaller ones below it: "becomes two".
  split: {
    fill: 'M15.2 6.8 A3.2 3.2 0 1 1 8.8 6.8 A3.2 3.2 0 1 1 15.2 6.8 Z M9.3 17.8 A2.6 2.6 0 1 1 4.1 17.8 A2.6 2.6 0 1 1 9.3 17.8 Z M19.9 17.8 A2.6 2.6 0 1 1 14.7 17.8 A2.6 2.6 0 1 1 19.9 17.8 Z',
    stroke: 'M10.4 10 L7.6 14.2 M13.6 10 L16.4 14.2'
  },
  // An hourglass: "takes its time".
  slow: {
    fill: 'M6.5 3 H17.5 V5.2 C17.5 8.8 14.4 10.4 13.4 12 C14.4 13.6 17.5 15.2 17.5 18.8 V21 H6.5 V18.8 C6.5 15.2 9.6 13.6 10.6 12 C9.6 10.4 6.5 8.8 6.5 5.2 Z'
  },
  // A bubble round a gem: "shielded".
  shield: {
    fill: 'M12 7.6 L15.6 11.4 L12 16.6 L8.4 11.4 Z',
    stroke: 'M12 3.4 A8.6 8.6 0 1 1 11.99 3.4'
  },
  // Two chevrons: "comes down two rows".
  charge: { stroke: 'M6 4.5 L12 10.5 L18 4.5 M6 12.5 L12 18.5 L18 12.5' }
}

const hasPath2D = typeof Path2D !== 'undefined'

/** The intent glyphs' colours (run 5): the dryad's "+", the treant's rest
 *  marker, the centaur's sludge target. */
export const INTENT_HEAL = '#6fe08a'
export const INTENT_REST = '#b9f28a'
export const INTENT_SPIT = '#c3d052'

/** One baked badge per icon at the current size (device px), and the intent
 *  glyphs (run 5) at the same scale. */
export class RuleBadges {
  private px = 0
  private readonly cache = new Map<RuleIcon, HTMLCanvasElement>()
  private plusCv: HTMLCanvasElement | null = null
  private restCv: HTMLCanvasElement | null = null
  private spitCv: HTMLCanvasElement | null = null
  coin: SpriteImage | null = null

  /** Badge diameter in device px; drops the cache when it changes. */
  setSize(px: number): void {
    const p = Math.max(12, Math.round(px))
    if (p === this.px) return
    this.px = p
    this.clear()
  }

  get(icon: RuleIcon): HTMLCanvasElement | null {
    const hit = this.cache.get(icon)
    if (hit) return hit
    const px = this.px
    if (px <= 0) return null
    if (icon === 'coins' && !this.coin?.ready) return null
    const cv = createCanvas(px, px)
    const g = ctx2d(cv)
    const r = px / 2
    // Body: navy disc, element ring, dark outline — the HUD's button language.
    g.fillStyle = '#0f1a30'
    g.beginPath()
    g.arc(r, r, r - 1, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = Math.max(2, px * 0.1)
    g.strokeStyle = RING[icon]
    g.beginPath()
    g.arc(r, r, r - g.lineWidth / 2 - 1, 0, Math.PI * 2)
    g.stroke()
    const inner = px * 0.62
    if (icon === 'coins') {
      const s = this.coin!
      const b = s.box
      const k = inner / Math.max(b.w, b.h)
      g.drawImage(s.img, b.x, b.y, b.w, b.h, r - (b.w * k) / 2, r - (b.h * k) / 2, b.w * k, b.h * k)
    } else if (hasPath2D) {
      const def = ICON_PATHS[icon]
      g.save()
      g.translate(r - inner / 2, r - inner / 2)
      g.scale(inner / 24, inner / 24)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      if (def.fill) {
        g.fillStyle = icon === 'skull' ? '#ffd9d4' : '#ffffff'
        g.fill(new Path2D(def.fill))
      }
      if (icon === 'skull') {
        g.fillStyle = '#0f1a30'
        g.beginPath()
        g.arc(9, 11, 1.8, 0, Math.PI * 2)
        g.arc(15, 11, 1.8, 0, Math.PI * 2)
        g.fill()
      }
      if (def.stroke) {
        g.strokeStyle = icon === 'heal' ? '#b9ffc9' : '#ffffff'
        g.lineWidth = icon === 'heal' ? 4.2 : 3
        g.stroke(new Path2D(def.stroke))
      }
      g.restore()
    }
    this.cache.set(icon, cv)
    return cv
  }

  /** The dryad's intent: a fat green "+" with a dark outline in a soft green
   *  halo (the heal badge's own cross, so badge and marks read as one rule). */
  plus(): HTMLCanvasElement | null {
    if (this.plusCv) return this.plusCv
    const px = this.px
    if (px <= 0) return null
    const cv = createCanvas(px, px)
    const g = ctx2d(cv)
    const r = px / 2
    const halo = g.createRadialGradient(r, r, 0, r, r, r)
    halo.addColorStop(0, 'rgba(111,224,138,0.55)')
    halo.addColorStop(0.55, 'rgba(111,224,138,0.22)')
    halo.addColorStop(1, 'rgba(111,224,138,0)')
    g.fillStyle = halo
    g.fillRect(0, 0, px, px)
    const arm = px * 0.3
    g.lineCap = 'round'
    g.strokeStyle = '#0c2a14'
    g.lineWidth = px * 0.3
    g.beginPath()
    g.moveTo(r, r - arm)
    g.lineTo(r, r + arm)
    g.moveTo(r - arm, r)
    g.lineTo(r + arm, r)
    g.stroke()
    g.strokeStyle = INTENT_HEAL
    g.lineWidth = px * 0.17
    g.stroke()
    g.strokeStyle = 'rgba(235,255,238,0.85)'
    g.lineWidth = px * 0.05
    g.beginPath()
    g.moveTo(r - arm * 0.15, r - arm * 0.8)
    g.lineTo(r - arm * 0.15, r - arm * 0.25)
    g.stroke()
    this.plusCv = cv
    return cv
  }

  /** The treant's intent on its rest turns: a pause glyph (two bars — no
   *  letters) on a navy disc with the slow badge's green ring. */
  rest(): HTMLCanvasElement | null {
    if (this.restCv) return this.restCv
    const px = this.px
    if (px <= 0) return null
    const cv = createCanvas(px, px)
    const g = ctx2d(cv)
    const r = px / 2
    g.fillStyle = '#0f1a30'
    g.beginPath()
    g.arc(r, r, r - 1, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = Math.max(2, px * 0.1)
    g.strokeStyle = INTENT_REST
    g.beginPath()
    g.arc(r, r, r - g.lineWidth / 2 - 1, 0, Math.PI * 2)
    g.stroke()
    // Two round-capped bars.
    const bw = px * 0.14
    const half = px * 0.15
    g.lineCap = 'round'
    g.strokeStyle = '#ffffff'
    g.lineWidth = bw
    g.beginPath()
    g.moveTo(r - bw * 0.85, r - half)
    g.lineTo(r - bw * 0.85, r + half)
    g.moveTo(r + bw * 0.85, r - half)
    g.lineTo(r + bw * 0.85, r + half)
    g.stroke()
    this.restCv = cv
    return cv
  }

  /** The centaur's intent: a target ring round the cell its sludge lands in —
   *  dashed, sludge green, four ticks — baked at twice the badge size. */
  spitTarget(): HTMLCanvasElement | null {
    if (this.spitCv) return this.spitCv
    const px = this.px * 2
    if (px <= 0) return null
    const cv = createCanvas(px, px)
    const g = ctx2d(cv)
    const r = px / 2
    const rr = r * 0.62
    g.lineCap = 'round'
    const ring = (color: string, w: number): void => {
      g.strokeStyle = color
      g.lineWidth = w
      g.setLineDash?.([px * 0.09, px * 0.06])
      g.beginPath()
      g.arc(r, r, rr, 0, Math.PI * 2)
      g.stroke()
      g.setLineDash?.([])
      g.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        g.moveTo(r + Math.cos(a) * rr * 1.08, r + Math.sin(a) * rr * 1.08)
        g.lineTo(r + Math.cos(a) * rr * 1.45, r + Math.sin(a) * rr * 1.45)
      }
      g.stroke()
    }
    ring('rgba(14,18,6,0.85)', px * 0.075)
    ring(INTENT_SPIT, px * 0.04)
    this.spitCv = cv
    return cv
  }

  clear(): void {
    this.cache.clear()
    this.plusCv = null
    this.restCv = null
    this.spitCv = null
  }
}
