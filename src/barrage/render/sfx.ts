/**
 * Board SFX mixer — engine events request sounds; at most MAX_PER_FRAME
 * one-shots actually start per rendered frame (highest priority first), and
 * every sound group has a minimum gap so a 40-ball volley reads as a crisp
 * rising patter instead of a machine gun.
 */
import useSounds from '@/use/useSound'
import type { ElementKind } from '@/game/ingredients'

const MAX_PER_FRAME = 3
const QUEUE = 12

interface Req {
  id: string
  vol: number
  pitch: number
  prio: number
}

export const CLASH_IDS = ['clash-1', 'clash-2', 'clash-3', 'clash-4', 'clash-5'] as const
export const FLESH_IDS = ['flesh-hit-1', 'flesh-hit-2'] as const
export const SHOT_IDS = ['unit-shot-1', 'unit-shot-2', 'unit-shot-3'] as const

/** Element-appropriate hit sound for a ball tier's element. */
export const hitSoundFor = (el: ElementKind, roll: number): string => {
  switch (el) {
    case 'ice': return 'crystal-cut'
    case 'wind': return roll < 0.5 ? 'crystal-cut' : CLASH_IDS[(roll * 5) | 0] ?? 'clash-1'
    case 'stone': return 'stone-cut'
    case 'water': return 'water-splash'
    case 'gold': return 'coin-pickup'
    case 'shadow':
    case 'cosmic': return FLESH_IDS[(roll * 2) | 0] ?? 'flesh-hit-1'
    case 'fire':
    default: return CLASH_IDS[(roll * 5) | 0] ?? 'clash-1'
  }
}

export class BoardSfx {
  private readonly q: Req[] = Array.from({ length: QUEUE }, () => ({ id: '', vol: 0, pitch: 1, prio: 0 }))
  private n = 0
  private readonly last = new Map<string, number>()
  private readonly play: (id: string, vol?: number, pitch?: number) => unknown
  /** Global switch (the lab's mute; nothing else needs it — useSound gates ads/tabs itself). */
  enabled = true

  constructor() {
    this.play = useSounds().playSound
  }

  /**
   * Ask for a one-shot. `group` shares a cooldown between variants (all clash-N).
   * Dropped when the group played < gapMs ago, or when the frame's queue is full
   * of more important sounds.
   */
  request(id: string, vol: number, pitch = 1, prio = 1, gapMs = 60, group: string = id): void {
    if (!this.enabled) return
    const now = performance.now()
    const prev = this.last.get(group)
    if (prev !== undefined && now - prev < gapMs) return
    let slot: Req | null = null
    if (this.n < QUEUE) {
      slot = this.q[this.n++]!
    } else {
      // Replace the least important queued request if this one beats it.
      let lo = 0
      for (let i = 1; i < QUEUE; i++) if (this.q[i]!.prio < this.q[lo]!.prio) lo = i
      if (this.q[lo]!.prio >= prio) return
      slot = this.q[lo]!
    }
    this.last.set(group, now)
    slot.id = id
    slot.vol = vol
    slot.pitch = pitch
    slot.prio = prio
  }

  /** Start this frame's winners. Call once per rendered frame. */
  flush(): void {
    if (this.n === 0) return
    for (let played = 0; played < MAX_PER_FRAME && this.n > 0; played++) {
      let best = 0
      for (let i = 1; i < this.n; i++) if (this.q[i]!.prio > this.q[best]!.prio) best = i
      const r = this.q[best]!
      this.play(r.id, r.vol, r.pitch)
      // swap-remove
      const lastIdx = this.n - 1
      if (best !== lastIdx) {
        const tmp = this.q[lastIdx]!
        this.q[lastIdx] = r
        this.q[best] = tmp
      }
      this.n--
    }
    this.n = 0
  }

  clear(): void {
    this.n = 0
  }
}
