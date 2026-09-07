// Tutorial → pause bridge: the first-session coach-marks must FREEZE the battle
// simulation, because they are self-paced. Before this gate, wave 1 spawned and
// marched on the gate while a first-timer was still reading "tap to spawn" —
// they could be overrun (lose the run) before ever placing a fighter.
//
// The two properties that matter:
//   1. the hold is taken at BOOT for a new player (not on some later
//      transition), and it survives every step up to and including 'deploy';
//   2. it releases the instant the first fighter lands in the arena, so the
//      field-merge step — the one that needs a live fighter — plays against a
//      real wave.
//
// Audio is asserted NOT muted: the tutorial rides the app-pause source, which
// the sibling `isAudioPaused` gate omits on purpose (see `useGamePause.ts`).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const STATE_KEY = 'merge-idle-war_state'

/** Seed the single-blob save, then import the modules fresh so `useTutorial`
 *  resolves its starting step from that blob the way a real boot does. */
const boot = async (state: Record<string, unknown> = {}) => {
  vi.resetModules()
  window.localStorage.clear()
  if (Object.keys(state).length > 0) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const gate = await import('@/use/useGamePause')
  const tutorial = await import('@/use/useTutorial')
  const epicState = await import('@/use/useEpicState')
  const tutorialGate = await import('@/use/useTutorialPauseGate')
  tutorialGate.installTutorialPauseGate()
  return { gate, tutorial, epicState, tutorialGate }
}

describe('useTutorialPauseGate — the tutorial holds the battle sim', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('holds the sim from the first frame for a brand-new player', async () => {
    const { gate, tutorial, tutorialGate } = await boot()

    expect(tutorial.tutorialStep.value).toBe('spawn')
    // `immediate: true` — a lazy watcher would never take this hold at all.
    expect(gate.isGamePaused.value).toBe(true)
    expect(tutorialGate.__isTutorialPauseHeld()).toBe(true)
  })

  it('keeps holding through spawn and merge, releases on the first deploy', async () => {
    const { gate, tutorial, tutorialGate } = await boot()

    tutorial.notifyTutorial('spawn')
    tutorial.notifyTutorial('spawn')
    await nextTick()
    expect(tutorial.tutorialStep.value).toBe('merge')
    expect(gate.isGamePaused.value).toBe(true)

    tutorial.notifyTutorial('merge')
    await nextTick()
    expect(tutorial.tutorialStep.value).toBe('deploy')
    expect(gate.isGamePaused.value).toBe(true)

    tutorial.notifyTutorial('deploy')
    await nextTick()
    expect(tutorial.tutorialStep.value).toBe('fieldMerge')
    expect(gate.isGamePaused.value).toBe(false)
    expect(tutorialGate.__isTutorialPauseHeld()).toBe(false)
    // The overlay is still up for the field-merge step — the game just runs
    // underneath it now, which is the whole point of releasing here.
    expect(tutorial.tutorialActive.value).toBe(true)
  })

  it('never mutes audio while it holds (music plays through the tutorial)', async () => {
    const { gate } = await boot()

    expect(gate.isGamePaused.value).toBe(true)
    expect(gate.isAudioPaused.value).toBe(false)
    expect(gate.getActiveAudioPauseReasons()).toHaveLength(0)
  })

  it('re-takes the hold for a player who quit mid-tutorial', async () => {
    // prism_tutorial_step 2 = 'deploy' — they spawned and merged last session.
    const { gate, tutorial } = await boot({ prism_tutorial_step: 2 })

    expect(tutorial.tutorialStep.value).toBe('deploy')
    expect(gate.isGamePaused.value).toBe(true)

    tutorial.notifyTutorial('deploy')
    await nextTick()
    expect(gate.isGamePaused.value).toBe(false)
  })

  it('does not hold once the player has a fighter on the field', async () => {
    // 3 = 'fieldMerge': the deploy already happened in a previous session.
    const { gate, tutorial } = await boot({ prism_tutorial_step: 3 })

    expect(tutorial.tutorialStep.value).toBe('fieldMerge')
    expect(gate.isGamePaused.value).toBe(false)
  })

  it('never holds for a veteran who skips the tutorial', async () => {
    const { gate, tutorial } = await boot({ battle_best_wave: 12 })

    expect(tutorial.tutorialStep.value).toBe('done')
    expect(gate.isGamePaused.value).toBe(false)
  })

  // A CrazyGames / Playgama boot hydrates the cloud blob AFTER module init, so
  // a returning player briefly reads the fresh-default step 'spawn'. The hold
  // must fall away when hydration reveals them as a veteran — otherwise their
  // game sits frozen behind an overlay they already completed.
  it('releases the hold when cloud hydration reveals a veteran', async () => {
    const { gate, tutorial, epicState } = await boot()
    expect(gate.isGamePaused.value).toBe(true)

    epicState.setState('battle_best_wave', 12) // hydration lands
    await nextTick()

    expect(tutorial.tutorialStep.value).toBe('done')
    expect(gate.isGamePaused.value).toBe(false)
  })

  it('is idempotent — a second install does not double-acquire the pause', async () => {
    const { gate, tutorial, tutorialGate } = await boot()
    tutorialGate.installTutorialPauseGate() // already installed by boot()

    tutorial.notifyTutorial('spawn')
    tutorial.notifyTutorial('spawn')
    tutorial.notifyTutorial('merge')
    tutorial.notifyTutorial('deploy')
    await nextTick()
    // A doubled watcher would have taken two app-pause refs and released one.
    expect(gate.isGamePaused.value).toBe(false)
  })
})
