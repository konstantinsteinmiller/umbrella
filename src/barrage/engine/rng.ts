/**
 * Seeded PRNG for the barrage sim. mulberry32: tiny, fast, and its whole state
 * is one uint32, so a RunSnapshot can carry it as a plain number and a resumed
 * run continues the exact same sequence.
 */
export class Rng {
  state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    const s = (this.state = (this.state + 0x6d2b79f5) >>> 0)
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  /** Integer in [lo, hi] inclusive. */
  intIn(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  /** Weighted index pick; weights ≤ 0 are never chosen. */
  weighted(weights: readonly number[]): number {
    let total = 0
    for (const w of weights) if (w > 0) total += w
    let r = this.next() * total
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i]!
      if (w <= 0) continue
      r -= w
      if (r < 0) return i
    }
    return weights.length - 1
  }
}

/** Mixes a run seed with a row number into an independent stream seed. Row
 *  generation draws from a fresh stream per row, so the boards of a Daily
 *  Barrage stay identical for everyone no matter how many crits their shots
 *  rolled on the combat stream in between. */
export const mixSeed = (seed: number, salt: number): number => {
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return (h ^ (h >>> 16)) >>> 0
}

/** FNV-1a over a string → uint32 (daily seeds from 'YYYY-MM-DD'). */
export const hashString = (s: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
