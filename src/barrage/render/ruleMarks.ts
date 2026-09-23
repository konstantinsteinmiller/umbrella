/**
 * Rule marks — each monster's one rule, shown ON the monster, without words.
 *
 * The retired "new monster" card sat mid-board for three seconds while the
 * balls flew — play-testers called it an interruption, not information. The
 * rule now lives where the player is already looking, and it waits for them:
 * Barrage is turn-based, so while they aim nothing moves and a mark can be
 * studied for as long as they like.
 *
 *   • BADGE  — a round icon on the monster's shoulder (hop / armour / heal /
 *     spit / coins / skull) for its kind's first TAG_TURNS (4) aim phases
 *     (`useCoach` owns that clock; the renderer gets the retired keys).
 *   • DEMO   — during the aim phase the badge's rule is acted out in place:
 *     a ghost goblin hops to the side, green motes run from a dryad to the
 *     monsters it heals, a sludge glob drops out of a centaur, armour
 *     shimmers round an ogre, coins rise off a corrupted elite.
 *   • ALWAYS — two telegraphs every player gets, forever: red chevrons over
 *     the columns a boss is entering through, and a double chevron under an
 *     ENRAGED boss (it now marches two rows a turn).
 *
 * This module bakes the badges and computes geometry; BoardRenderer draws.
 */
import { COLS, type Monster } from '../engine/types'
import { createCanvas, ctx2d, type SpriteImage } from './sprites'

export type RuleIcon = 'hop' | 'armor' | 'heal' | 'spit' | 'coins' | 'skull' | 'split' | 'slow' | 'shield' | 'charge'

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
    case 'caterpillar':
    case 'ogre': return 'armor'
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
  hop: '#86d957', armor: '#e2b884', heal: '#6fe08a', spit: '#c3d052', coins: '#ffd23c', skull: '#ff4a3a',
  split: '#e0924e', slow: '#8ccf5a', shield: '#6fc8ff', charge: '#ff9a3a'
}

// Pictograms in a 24×24 box (the DOM glyph set's grid).
const ICON_PATHS: Record<Exclude<RuleIcon, 'coins'>, { stroke?: string; fill?: string }> = {
  // A hop arc with a head at both ends: "jumps sideways".
  hop: { stroke: 'M5 16 Q12 3 19 16 M19 16 L14.6 15.4 M19 16 L19.6 11.6 M5 16 L9.4 15.4 M5 16 L4.4 11.6' },
  armor: { fill: 'M12 2.5 L20 5.5 V11.5 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 11.5 V5.5 Z' },
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

/** One baked badge per icon at the current size (device px). */
export class RuleBadges {
  private px = 0
  private readonly cache = new Map<RuleIcon, HTMLCanvasElement>()
  coin: SpriteImage | null = null

  /** Badge diameter in device px; drops the cache when it changes. */
  setSize(px: number): void {
    const p = Math.max(12, Math.round(px))
    if (p === this.px) return
    this.px = p
    this.cache.clear()
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

  clear(): void {
    this.cache.clear()
  }
}

/** Is cell (col, row) free for a goblin hop (no monster, pickup or sludge)? */
export const cellFree = (
  col: number, row: number,
  monsters: readonly Pick<Monster, 'col' | 'row' | 'w' | 'h'>[],
  blocked: (col: number, row: number) => boolean
): boolean => {
  if (col < 0 || col >= COLS) return false
  for (const m of monsters) {
    if (col >= m.col && col < m.col + m.w && row >= m.row && row < m.row + m.h) return false
  }
  return !blocked(col, row)
}

/** Monsters orthogonally next to `d` (a dryad's heal targets), bosses excluded
 *  like the engine's `dryadHeals`. */
export const healTargets = <M extends Pick<Monster, 'id' | 'col' | 'row' | 'w' | 'h' | 'kind'>>(d: M, monsters: readonly M[]): M[] =>
  monsters.filter((n) => {
    if (n === d || n.kind === 'boss') return false
    const hTouch = n.row < d.row + d.h && n.row + n.h > d.row && (n.col + n.w === d.col || n.col === d.col + d.w)
    const vTouch = n.col < d.col + d.w && n.col + n.w > d.col && (n.row + n.h === d.row || n.row === d.row + d.h)
    return hTouch || vTouch
  })
