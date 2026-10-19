// Barrage's first-session FTUE (`useTutorial.ts`, CONTRACT §7): four beats, each
// advanced only by the engine event that proves the player did it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { EngineEvent, EngineListener } from '@/barrage/engine/types'

const STATE_KEY = 'umbrella_state'

const boot = async (state: Record<string, unknown> = {}, bestRow = 1) => {
  vi.resetModules()
  window.localStorage.clear()
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const tut = await import('@/use/useTutorial')
  const listeners: EngineListener[] = []
  const wiring = {
    bestRow: ref(bestRow),
    upgradeTarget: ref(true),
    onEngineEvent: (cb: EngineListener) => {
      listeners.push(cb)
      return () => { listeners.splice(listeners.indexOf(cb), 1) }
    }
  }
  const off = tut.installBarrageTutorial(wiring)
  const emit = (e: EngineEvent) => { for (const l of [...listeners]) l(e) }
  return { tut, wiring, emit, off }
}

const FIRE: EngineEvent = { type: 'fire', angle: Math.PI / 2, balls: 1 }
const BALL: EngineEvent = { type: 'pickup', pickupId: 1, kind: 'ball', x: 3.5, y: 5 }
const MERGE: EngineEvent = { type: 'trayMerge', fromTier: 1, toTier: 2 }

describe('the first-session beats', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('walks aim → pickup → merge → upgrade → done on real engine events', async () => {
    const { tut, emit } = await boot()
    expect(tut.tutorialStep.value).toBe('aim')
    emit(FIRE)
    expect(tut.tutorialStep.value).toBe('pickup')
    emit(BALL)
    expect(tut.tutorialStep.value).toBe('merge')
    emit(MERGE)
    expect(tut.tutorialStep.value).toBe('upgrade')
    tut.notifyTutorial({ kind: 'upgrade' })
    expect(tut.tutorialStep.value).toBe('done')
    expect(tut.tutorialActive.value).toBe(false)
  })

  it('a lucky first volley that already collects a "+1" skips the pickup beat', async () => {
    const { tut, emit } = await boot()
    emit(BALL)
    expect(tut.tutorialStep.value).toBe('merge')
  })

  it('never moves backwards', async () => {
    const { tut, emit } = await boot()
    emit(MERGE)
    expect(tut.tutorialStep.value).toBe('upgrade')
    emit(FIRE) // the first ignored volley in the upgrade beat
    emit(BALL)
    expect(tut.tutorialStep.value).toBe('upgrade')
  })

  it('graduates after two volleys that ignore the upgrade beat', async () => {
    const { tut, emit } = await boot()
    emit(MERGE)
    emit(FIRE)
    expect(tut.tutorialStep.value).toBe('upgrade')
    emit(FIRE)
    expect(tut.tutorialStep.value).toBe('done')
  })

  it('run 7: an unclaimed free Tray Capacity is granted on its own two aims after the FTUE hands over', async () => {
    const { tut, emit, wiring } = await boot()
    const freeOffer = ref(true)
    const claimFree = vi.fn(() => { freeOffer.value = false })
    const w2 = { ...wiring, freeOffer, claimFree }
    // A second install with the free-offer wiring (the scene's).
    const off = tut.installBarrageTutorial(w2)
    const AIM: EngineEvent = { type: 'phase', phase: 'aim' }
    emit(MERGE)
    emit(AIM) // still in the FTUE: its upgrade beat owns the free chip
    emit(FIRE)
    emit(FIRE)
    expect(tut.tutorialStep.value).toBe('done')
    emit(AIM)
    expect(claimFree).not.toHaveBeenCalled()
    emit(AIM)
    expect(tut.FREE_GRANT_AIMS).toBe(2)
    expect(claimFree).toHaveBeenCalledTimes(1)
    emit(AIM)
    expect(claimFree).toHaveBeenCalledTimes(1)
    off()
  })

  // Silent Flow: the pickup lesson is in the world — the board pulses every
  // "+1" (render/worldCues.ts) until the first merge; nothing pauses.
  it('the "+1" pulses on the board through the "+1" beats, and stops at the first merge', async () => {
    const { emit } = await boot()
    const { worldCues } = await import('@/barrage/render/worldCues')
    expect(worldCues.plusPulse).toBe(true) // aim
    emit(FIRE)
    expect(worldCues.plusPulse).toBe(true) // pickup
    emit(BALL)
    await nextTick()
    expect(worldCues.plusPulse).toBe(true) // merge
    emit(MERGE)
    await nextTick()
    expect(worldCues.plusPulse).toBe(false) // upgrade: the "+1" is not what it wants any more
  })

  it('a veteran never sees the "+1" pulse', async () => {
    await boot({}, 12)
    await nextTick()
    const { worldCues } = await import('@/barrage/render/worldCues')
    expect(worldCues.plusPulse).toBe(false)
  })

  it('persists the beat, so a reload resumes the same coach mark', async () => {
    const first = await boot()
    first.emit(FIRE)
    const { flushPersist } = await import('@/use/useEpicState')
    flushPersist()
    const blob = JSON.parse(window.localStorage.getItem(STATE_KEY) ?? '{}')
    const again = await boot(blob)
    expect(again.tut.tutorialStep.value).toBe('pickup')
  })
})

describe('veterans', () => {
  it('skip it when they never started the beats', async () => {
    const { tut } = await boot({}, 12)
    expect(tut.tutorialStep.value).toBe('done')
  })

  it('a first-timer passing row 1 on the first shot is NOT mistaken for one', async () => {
    const { tut, wiring, emit } = await boot()
    emit(FIRE)
    wiring.bestRow.value = 2
    await nextTick()
    expect(tut.tutorialStep.value).toBe('pickup')
  })

  it('a cloud hydrate revealing a veteran ends a stale overlay', async () => {
    const { tut, wiring } = await boot()
    expect(tut.tutorialStep.value).toBe('aim')
    wiring.bestRow.value = 40
    await nextTick()
    expect(tut.tutorialStep.value).toBe('done')
  })
})
