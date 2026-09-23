// Earned HUD features (`useFeatureUnlocks.ts`): one at a time, on best row OR
// lifetime losses, only at a calm moment, never before the FTUE hands over.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { EngineEvent, EngineListener, GameMode } from '@/barrage/engine/types'

const STATE_KEY = 'elemental-barrage_state'

const boot = async (o: { state?: Record<string, unknown>; bestRow?: number; ftueDone?: boolean; calm?: boolean } = {}) => {
  vi.resetModules()
  window.localStorage.clear()
  if (o.state) window.localStorage.setItem(STATE_KEY, JSON.stringify(o.state))
  const u = await import('@/use/useFeatureUnlocks')
  const listeners: EngineListener[] = []
  const w = {
    bestRow: ref(o.bestRow ?? 1),
    mode: ref<GameMode>('endless'),
    onEngineEvent: (cb: EngineListener) => {
      listeners.push(cb)
      return () => { listeners.splice(listeners.indexOf(cb), 1) }
    },
    ftueDone: ref(o.ftueDone ?? true),
    calm: ref(o.calm ?? true)
  }
  const off = u.installFeatureUnlocks(w)
  const emit = (e: EngineEvent): void => { for (const l of [...listeners]) l(e) }
  /** A new aim phase (a turn boundary). */
  const aim = (): void => emit({ type: 'phase', phase: 'aim' })
  /** Let the unlock clone land, as FeatureUnlockFx does. */
  const land = (): void => { const id = u.unlocking.value; if (id) u.finishArrival(id) }
  return { u, w, emit, aim, land, off }
}

const FIRE: EngineEvent = { type: 'fire', angle: Math.PI / 2, balls: 1 }
const BREACH: EngineEvent = { type: 'breach' }

describe('the unlock ladder', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('a new player starts with every feature locked', async () => {
    const { u } = await boot()
    for (const s of u.UNLOCK_LADDER) expect(u.featureStates.value[s.id]).toBe('locked')
    expect(u.unlocking.value).toBeNull()
  })

  it('row 6 earns the treasure chest: it arrives, lands glowing, and a tap settles it', async () => {
    const { u, w, aim, land } = await boot()
    w.bestRow.value = 6
    aim()
    expect(u.unlocking.value).toBe('supply')
    expect(u.featureStates.value.supply).toBe('arriving')
    expect(u.featureShown('supply')).toBe(true)
    expect(u.featureReady('supply')).toBe(false)
    land()
    expect(u.featureStates.value.supply).toBe('new')
    u.markFeatureSeen('supply')
    expect(u.featureStates.value.supply).toBe('open')
    expect(u.featureStates.value.codex).toBe('locked')
  })

  it('one unlock per aim phase, in ladder order, however far ahead the player is', async () => {
    const { u, w, aim, land } = await boot()
    w.bestRow.value = 60
    const got: string[] = []
    for (let i = 0; i < u.UNLOCK_LADDER.length + 2; i++) {
      aim()
      if (u.unlocking.value) got.push(u.unlocking.value)
      land()
    }
    expect(got).toEqual(u.UNLOCK_LADDER.map((s) => s.id))
  })

  it('never two at once: the next waits until the current one has landed', async () => {
    const { u, w, aim } = await boot()
    w.bestRow.value = 60
    aim()
    expect(u.unlocking.value).toBe('supply')
    aim() // still flying
    expect(u.unlocking.value).toBe('supply')
    expect(u.featureStates.value.codex).toBe('locked')
  })

  it('a landing mid-turn does not chain the next unlock into the same aim phase', async () => {
    const { u, w, aim, land } = await boot()
    w.bestRow.value = 60
    aim()
    land()
    // A modal closing / the best row ticking in the same aim re-checks…
    w.calm.value = false
    await nextTick()
    w.calm.value = true
    w.bestRow.value = 61
    await nextTick()
    expect(u.unlocking.value).toBeNull()
    expect(u.featureStates.value.codex).toBe('locked')
    aim() // …the next one waits for the next turn
    expect(u.unlocking.value).toBe('codex')
  })

  it('losing counts too: a struggling player still earns the depth', async () => {
    const { u, emit, aim, land } = await boot({ bestRow: 4 })
    aim()
    expect(u.unlocking.value).toBeNull()
    emit(BREACH)
    aim()
    expect(u.unlocking.value).toBe('supply')
    land()
    aim()
    expect(u.unlocking.value).toBe('codex') // the codex also opens on the first loss
    land()
    aim()
    expect(u.unlocking.value).toBeNull() // collection wants row 16 or 2 losses
    emit(BREACH)
    aim()
    expect(u.unlocking.value).toBe('collection')
  })

  it('a daily-run breach is not a loss of the endless run', async () => {
    const { u, w, emit, aim } = await boot({ bestRow: 4 })
    w.mode.value = 'daily'
    emit(BREACH)
    w.mode.value = 'endless'
    aim()
    expect(u.unlocking.value).toBeNull()
  })

  it('waits for the FTUE to hand over, even in a calm moment', async () => {
    const { u, w, aim } = await boot({ bestRow: 6, ftueDone: false, calm: true })
    aim()
    expect(u.unlocking.value).toBeNull()
    w.ftueDone.value = true
    await nextTick()
    expect(u.unlocking.value).toBe('supply')
  })

  it('waits for a calm moment (no modal, no reveal, nobody aiming)', async () => {
    const { u, w, aim } = await boot({ bestRow: 6, calm: false })
    aim()
    expect(u.unlocking.value).toBeNull()
    w.calm.value = true
    await nextTick()
    expect(u.unlocking.value).toBe('supply')
  })

  it('the ladder only ever gets steeper (so it can be walked as a prefix)', async () => {
    const { u } = await boot()
    const L = u.UNLOCK_LADDER
    for (let i = 1; i < L.length; i++) {
      expect(L[i]!.row).toBeGreaterThan(L[i - 1]!.row)
      expect(L[i]!.losses).toBeGreaterThanOrEqual(L[i - 1]!.losses)
    }
  })

  it('an ignored glow fades after NEW_GLOW_VOLLEYS volleys', async () => {
    const { u, w, emit, aim, land } = await boot()
    w.bestRow.value = 6
    aim()
    land()
    for (let i = 0; i < u.NEW_GLOW_VOLLEYS - 1; i++) emit(FIRE)
    expect(u.featureStates.value.supply).toBe('new')
    emit(FIRE)
    expect(u.featureStates.value.supply).toBe('open')
  })

  it('persists: a reload keeps what was earned (and what was seen)', async () => {
    const a = await boot()
    a.w.bestRow.value = 11
    a.aim(); a.land(); a.u.markFeatureSeen('supply')
    a.aim(); a.land()
    const { flushPersist } = await import('@/use/useEpicState')
    flushPersist()
    const blob = JSON.parse(window.localStorage.getItem(STATE_KEY) ?? '{}')
    const b = await boot({ state: blob })
    expect(b.u.featureStates.value.supply).toBe('open')
    expect(b.u.featureStates.value.codex).toBe('new')
    expect(b.u.featureStates.value.collection).toBe('locked')
  })

  it('a save from before the ladder keeps everything its best row has passed, silently', async () => {
    const { u } = await boot({ state: { eb_best_row: 30 } })
    expect(u.featureStates.value.supply).toBe('open')
    expect(u.featureStates.value.battlePass).toBe('open') // row 26
    expect(u.featureStates.value.achievements).toBe('locked') // row 31
    expect(u.unlocking.value).toBeNull()
  })

  it('earnedSteps is a prefix: a later step never opens past a locked one', async () => {
    const { u } = await boot()
    expect(u.earnedSteps(1, 0)).toBe(0)
    expect(u.earnedSteps(6, 0)).toBe(1)
    expect(u.earnedSteps(11, 0)).toBe(2)
    expect(u.earnedSteps(5, 2)).toBe(3)
    expect(u.earnedSteps(36, 0)).toBe(u.UNLOCK_LADDER.length)
  })
})
