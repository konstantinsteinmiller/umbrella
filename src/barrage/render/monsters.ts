/**
 * Monster looks — each walker / boss sprite trimmed, fitted into its footprint
 * and baked at the current cell size, with every variant the frame loop needs
 * pre-made so no draw ever filters or tints:
 *
 *   base     (corrupted elites get the violet colour-matrix bake)
 *   white    hit-flash silhouette
 *   frozen   icy tint (freeze proc)
 *   enraged  MIW's enrage filter via colour matrices (bosses only, lazy)
 */
import type { BossKind, MonsterKind } from '../engine/types'
import { bossSrc, MONSTER_FACES_RIGHT, monsterSrc } from '../art'
import {
  applyFilterOps, CORRUPT_OPS, createCanvas, ctx2d, ENRAGE_OPS, overlayTint, silhouette, sprite, type SpriteImage
} from './sprites'

export interface MonsterBake {
  base: HTMLCanvasElement
  white: HTMLCanvasElement
  frozen: HTMLCanvasElement
  /** Boss only (null for walkers). */
  enraged: HTMLCanvasElement | null
  /** Red silhouette, baked the first time the renderer needs it: the "1"
   *  outline and the death sequence's culprit. */
  red?: HTMLCanvasElement
  /** Draw size in cells before squash/stretch. */
  dw: number
  dh: number
}

/** Signature colour per kind (shards, auras). */
export const MONSTER_COLOR: Record<Exclude<MonsterKind, 'boss'>, string> = {
  slime: '#4fb3ff',
  goblin: '#86d957',
  caterpillar: '#62c247',
  ogre: '#d6a878',
  centaur: '#c58a55',
  dryad: '#a6ec72',
  imp: '#b0703e',
  treant: '#7fbf4a',
  carbuncle: '#5fb8ff',
  cyclops: '#a9b1bd'
}
export const BOSS_COLOR: Record<BossKind, string> = {
  'slime-tower': '#55c3ff',
  worm: '#e0925e',
  'fire-dragon': '#ff6a2a',
  'silver-dragon': '#d6e8ff',
  troll: '#9cc48f',
  orc: '#86b35e'
}

export const monsterSpriteSrc = (kind: MonsterKind, bossKind: BossKind | undefined): string =>
  kind === 'boss' ? bossSrc(bossKind ?? 'slime-tower') : monsterSrc(kind)

export class MonsterLooks {
  private readonly cache = new Map<string, MonsterBake>()
  private cellDev = 0

  /** Call on resize with `cellCss × dpr`. */
  setCell(cellDev: number): void {
    if (Math.abs(cellDev - this.cellDev) < 0.5) return
    this.cellDev = cellDev
    this.cache.clear()
  }

  clear(): void {
    this.cache.clear()
  }

  /**
   * The bake for a monster look, or null while the sprite is still loading.
   * Not a per-frame call: views cache the result (the key string allocates).
   */
  get(src: string, kind: MonsterKind, corrupted: boolean, w: number, h: number): MonsterBake | null {
    const key = `${src}|${corrupted ? 1 : 0}|${w}x${h}`
    const hit = this.cache.get(key)
    if (hit) return hit
    const s = sprite(src)
    if (!s.ready) return null
    const bake = this.bake(s, kind, corrupted, w, h)
    this.cache.set(key, bake)
    return bake
  }

  private bake(s: SpriteImage, kind: MonsterKind, corrupted: boolean, w: number, h: number): MonsterBake {
    const boss = kind === 'boss'
    const pad = boss ? 0.08 : 0.06
    const tw = w - pad * 2
    const th = h - pad * 2
    const b = s.box
    const k = Math.min(tw / b.w, th / b.h)
    let dw = b.w * k
    let dh = b.h * k
    // Wide footprints (the caterpillar): stretch a little rather than float in empty space.
    if (dw < tw * 0.86) dw = Math.min(tw, dw * 1.22)
    if (dh < th * 0.8 && !boss) {
      const grow = Math.min(th / dh, 1.12)
      dh *= grow
      dw = Math.min(tw, dw * grow)
    }
    // Bake a touch oversize so flinch/pop upscales stay crisp.
    const over = 1.12
    const pw = Math.max(4, Math.round(dw * this.cellDev * over))
    const ph = Math.max(4, Math.round(dh * this.cellDev * over))
    const base = createCanvas(pw, ph)
    const g = ctx2d(base)
    g.imageSmoothingQuality = 'high'
    if (kind !== 'boss' && MONSTER_FACES_RIGHT[kind]) {
      g.translate(pw, 0)
      g.scale(-1, 1)
    }
    g.drawImage(s.img, b.x, b.y, b.w, b.h, 0, 0, pw, ph)
    g.setTransform(1, 0, 0, 1, 0, 0)
    if (corrupted) applyFilterOps(base, CORRUPT_OPS)
    let enraged: HTMLCanvasElement | null = null
    if (boss) {
      enraged = createCanvas(pw, ph)
      ctx2d(enraged).drawImage(base, 0, 0)
      applyFilterOps(enraged, ENRAGE_OPS)
    }
    return {
      base,
      white: silhouette(base, '#ffffff'),
      frozen: overlayTint(base, '#a6e4ff', 0.55),
      enraged,
      dw,
      dh
    }
  }
}
