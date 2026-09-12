/**
 * DEV-only scripting seam for the gameplay video pipeline (`tools/preview-video`).
 *
 * GameScene imports this on mount in DEV builds only, so none of it ships. A
 * scenario reaches the game through `window.__video`:
 *
 *   stage(plan)          put the fight AND the merge grid in an exact state,
 *                        frozen — what `setup()` ends on is the clip's frame 0
 *   freeze(on)           hold / release the battle simulation
 *   drag(from, to, ms)   a scripted drag from a grid slot, played as real
 *                        pointer events through MergeGrid's own pipeline — so a
 *                        drop merges, deploys, field-merges and fires the
 *                        new-tier reveal exactly as a finger would
 *   cast(skill)          a spell through the arena's own button handler
 *   skipRally()          the OVERRUN screen's Skip — straight on to the retry
 *   state()              a snapshot for the recorder's log and asserts
 *
 * Drags animate on `requestAnimationFrame`, which the recorder's virtual clock
 * drives, so a drag is the same frames on every run. Never `await` one from a
 * scenario's `record()`: fire it, and pace the beat with `ctx.wait`.
 */
import { triggerRef, watch } from 'vue'
import { devBattle, fighters, enemies, timescale, wave, wavePhase, gateHp, boss, ultCharge, declineRally, type Fighter, type Enemy } from '@/use/useBattle'
import usePrismGame, { maxTier, GRID_SIZE } from '@/use/usePrismGame'
import { zoneRect } from '@/use/useDropZones'
import { activeReveal, endReveal } from '@/use/useTierReveal'
import { setState } from '@/use/useEpicState'
import { GRID_KEY, PRISM_MAX_TIER_KEY } from '@/keys'
import type { EnemyKind } from '@/game/units'

type Win = Record<string, unknown>

export interface StagePlan {
  wave: number
  /** Gate HP, 0-100. */
  gate?: number
  /** Every grid slot's tier, `GRID_SIZE` long, 0 = empty. */
  grid?: number[]
  /** The discovery watermark: a merge that makes a tier above it plays the
   *  new-tier reveal. Defaults to the highest tier staged anywhere. */
  maxTier?: number
  /** Fighters at arena % coordinates; `hp` is a fraction of their max. */
  army?: { tier: number; x: number; y: number; hp?: number }[]
  /** Enemies already on the field; `hp` and `atk` multiply the wave's own. */
  foes?: { kind: EnemyKind; x: number; y: number; hp?: number; atk?: number; elite?: boolean }[]
  /** Arrivals `at` seconds (engine time) after the fight is released, out of
   *  `portal`; `hp` and `atk` as for `foes`. */
  spawns?: { kind: EnemyKind; at: number; portal: 0 | 1 | 2; elite?: boolean; hp?: number; atk?: number }[]
  /** Meteor Storm charge, 0-100. */
  ult?: number
  /** Unlock and charge every arena skill (Meteor, Warcry, Legion, …). */
  skills?: boolean
  /** Seconds simulated silently after staging, so frame 0 is mid-exchange. */
  preroll?: number
}

/** Where a drag lets go. */
export type DropTarget =
  | { slot: number }
  | { arena: [number, number] } // arena %, left→right / top→bottom
  | { fighter: number } //          a fighter id — a field merge onto it

const game = usePrismGame()

const slotCentre = (idx: number): { x: number; y: number } | null => {
  const el = document.querySelector<HTMLElement>(`[data-slot="${idx}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

const arenaPoint = (xPct: number, yPct: number): { x: number; y: number } | null => {
  const r = zoneRect('arena')
  if (!r) return null
  return { x: r.left + (xPct / 100) * r.width, y: r.top + (yPct / 100) * r.height }
}

const dropPoint = (to: DropTarget): { x: number; y: number } | null => {
  if ('slot' in to) return slotCentre(to.slot)
  if ('arena' in to) return arenaPoint(to.arena[0], to.arena[1])
  const f = fighters.value.find((x) => x.id === to.fighter)
  // `fighterAt` tests against a point 5 % above the foot — aim there.
  return f ? arenaPoint(f.x, f.y - 5) : null
}

const POINTER_ID = 91

const pointer = (type: string, x: number, y: number): PointerEvent => new PointerEvent(type, {
  pointerId: POINTER_ID, pointerType: 'touch', isPrimary: true,
  clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1
})

const smooth = (u: number): number => u * u * (3 - 2 * u)

/**
 * Carry the unit in slot `from` to `to` over `ms`: a short lift, the flight on
 * a shallow arc, a hover over the target so its highlight reads, then the drop.
 * The three events are the ones MergeGrid listens for, so every outcome is the
 * game's own.
 */
const drag = (from: number, to: DropTarget, ms = 620): boolean => {
  const a = slotCentre(from)
  let b = dropPoint(to)
  const src = document.querySelector<HTMLElement>(`[data-slot="${from}"] .unit-holder`)
  if (!a || !b || !src) return false
  src.dispatchEvent(pointer('pointerdown', a.x, a.y))
  const LIFT = 0.1
  const HOVER = 0.2
  const t0 = performance.now()
  const frame = (): void => {
    // Re-aimed every frame: a fighter target keeps moving while the unit flies.
    b = dropPoint(to) ?? b!
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    // Bow the path upward (screen space) by a fraction of its length.
    const nx = (b.y - a.y) / (dist || 1)
    const ny = -(b.x - a.x) / (dist || 1)
    const bow = Math.min(60, dist * 0.12) * (ny <= 0 ? 1 : -1)
    const u = Math.min(1, (performance.now() - t0) / ms)
    let x = a.x
    let y = a.y
    if (u > LIFT) {
      const k = Math.min(1, (u - LIFT) / (1 - LIFT - HOVER))
      const s = smooth(k)
      const arc = Math.sin(Math.PI * s) * bow
      x = a.x + (b.x - a.x) * s + nx * arc
      y = a.y + (b.y - a.y) * s + ny * arc
    }
    window.dispatchEvent(pointer('pointermove', x, y))
    if (u < 1) { requestAnimationFrame(frame); return }
    window.dispatchEvent(pointer('pointerup', b.x, b.y))
  }
  requestAnimationFrame(frame)
  return true
}

const freeze = (on: boolean): void => {
  // Released on a clean step boundary, not on whatever partial step the real
  // frames during setup left behind.
  if (!on) devBattle?.syncClock()
  timescale.value = on ? 0 : 1
}

/** Scale a live enemy to a plan's multipliers. */
const shape = (e: Enemy, hp = 1, atk = 1): void => {
  e.maxHp = Math.max(1, Math.round(e.maxHp * hp))
  e.hp = e.maxHp
  e.atk = Math.max(1, Math.round(e.atk * atk))
  if (e.boss && boss.value) boss.value = { ...boss.value, hp: e.hp, maxHp: e.maxHp }
}

// Authored arrivals come out of the engine's own spawner, which knows nothing
// of a scenario's multipliers — so each new enemy is matched, by kind and in
// schedule order, against what the plan asked for, the moment it appears.
let pending: { kind: EnemyKind; hp: number; atk: number }[] = []
let seenEnemyId = 0
watch(enemies, (list) => {
  for (const e of list) {
    if (e.id <= seenEnemyId) continue
    seenEnemyId = e.id
    const i = pending.findIndex((p) => p.kind === e.kind)
    if (i < 0) continue
    const [p] = pending.splice(i, 1)
    shape(e, p!.hp, p!.atk)
  }
}, { flush: 'sync' })

const stage = (plan: StagePlan): void => {
  const dev = devBattle
  if (!dev) throw new Error('devBattle is null — the video seam needs a DEV build')
  freeze(true)
  if (activeReveal.value) endReveal()
  pending = []
  seenEnemyId = 0 // stageFight restarts the engine's id sequence
  const spawns = [...(plan.spawns ?? [])].sort((a, b) => a.at - b.at)
  dev.stageFight({
    wave: plan.wave,
    gate: plan.gate,
    // `count: 1`: an authored arrival is one monster, never the engine's cluster roll.
    spawns: spawns.map((s) => ({ kind: s.kind, at: s.at, portal: s.portal, elite: s.elite, count: 1 }))
  })
  const army: Fighter[] = []
  for (const a of plan.army ?? []) army.push(dev.addFighter(a.tier, a.x, a.y, a.hp ?? 1))
  for (const e of plan.foes ?? []) shape(dev.addEnemy(e.kind, e.x, e.y, 1, e.elite ?? false), e.hp, e.atk)
  // Every arrival is queued, ×1 included, so same-kind spawns keep their order.
  pending = spawns.map((s) => ({ kind: s.kind, hp: s.hp ?? 1, atk: s.atk ?? 1 }))
  // Both are WRITTEN to the save as well: the grid re-reads the blob on every
  // state write anywhere, so a staged grid that only lived in the ref would be
  // reverted by the first coin the fight pays out.
  if (plan.grid) {
    const next = Array.from({ length: GRID_SIZE }, (_, i) => Math.max(0, Math.floor(plan.grid![i] ?? 0)))
    game.grid.value = next
    setState(GRID_KEY, next)
  }
  const top = Math.max(1, ...(plan.grid ?? []), ...army.map((f) => f.tier))
  maxTier.value = plan.maxTier ?? top
  setState(PRISM_MAX_TIER_KEY, maxTier.value)
  if (plan.skills) (window as unknown as Win & { __skills?: () => void }).__skills?.()
  if (plan.ult !== undefined) ultCharge.value = Math.max(0, Math.min(100, plan.ult))
  triggerRef(fighters)
  triggerRef(enemies)
  // Preroll with the clock released for the engine only; the scene stays held.
  if (plan.preroll && plan.preroll > 0) dev.preroll(plan.preroll)
}

const cast = (skill: string): boolean => {
  const handlers = (window as unknown as Win).__arenaCast as Record<string, () => void> | undefined
  const fire = handlers?.[skill]
  if (!fire) return false
  fire()
  return true
}

const state = () => ({
  wave: wave.value,
  phase: wavePhase.value,
  gate: Math.round(gateHp.value),
  frozen: timescale.value === 0,
  army: fighters.value.map((f) => ({ id: f.id, tier: f.tier, x: Math.round(f.x), y: Math.round(f.y), hp: +(f.hp / f.maxHp).toFixed(2), spectral: f.spectral })),
  foes: enemies.value.map((e) => ({ id: e.id, kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), hp: +(e.hp / e.maxHp).toFixed(2) })),
  boss: boss.value ? +(boss.value.hp / boss.value.maxHp).toFixed(2) : null,
  grid: game.grid.value.slice(),
  maxTier: maxTier.value,
  reveal: activeReveal.value ? { tier: activeReveal.value.tier, target: activeReveal.value.target } : null
})

const ready = (): boolean =>
  !!document.querySelector('.battle-arena')
  && document.querySelectorAll('[data-slot]').length === GRID_SIZE
  && !!(window as unknown as Win).__arenaCast
  && !!zoneRect('arena')

/** The OVERRUN screen's Skip: no RALLY revive, the field resets 0.8 s later.
 *  (A clean feed hides that button, and the offer would otherwise hold the red
 *  screen for its full 5 s.) */
const skipRally = (): void => { declineRally() }

;(window as unknown as Win).__video = { ready, stage, freeze, drag, cast, skipRally, state }
