// The Imp (the `automation` battle upgrade) MERGES ONLY.
//
// It used to also march the highest-tier unit into the arena whenever the army
// had room, and players hated it for a specific reason: it competed with them
// for the board. Anyone deliberately saving a big tile to pair it into an even
// bigger one had it shipped off to the front first — buying the upgrade made
// the game HARDER to play deliberately. Deploying is the player's call; the imp
// only does the tedious half of the loop.
//
// That's a behavioural contract, not a cosmetic one, and nothing about the
// merge half of the imp looks different when the deploy half creeps back in —
// so it's pinned here rather than left to a play-test.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const importGame = async () => {
  vi.resetModules()
  const battle = await import('@/use/useBattle')
  const prism = await import('@/use/usePrismGame')
  return { battle, game: prism.default() }
}

/** Imp cadence at automation level 1 is ~3.4 s — advance well past one beat. */
const IMP_BEATS_MS = 12_000

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers()
})

describe('automation imp', () => {
  // Control. Every assertion below reads "the army is still empty", which
  // proves nothing if deploying is simply inert under jsdom — pin that the
  // path the imp no longer takes does work when something calls it.
  it('(control) deploying DOES fill the army in this environment', async () => {
    const { battle } = await importGame()
    expect(battle.deployFighter(7)).toBe(true)
    expect(battle.fighters.value).toHaveLength(1)
  })

  it('merges a pair on the board without deploying anything', async () => {
    const { battle, game } = await importGame()
    battle.battleUpgrades.value = { ...battle.battleUpgrades.value, automation: 1 }

    // One mergeable pair (T3 + T3) plus a lone T7 the player is saving.
    game.grid.value = [3, 3, 0, 7, ...Array(12).fill(0)]

    game.startEngine()
    vi.advanceTimersByTime(IMP_BEATS_MS)
    game.stopEngine()

    // The pair became a T4 …
    expect(game.grid.value.filter((t) => t === 4)).toHaveLength(1)
    expect(game.grid.value.filter((t) => t === 3)).toHaveLength(0)
    // … and the saved T7 is still sitting on the board, not on the field.
    expect(game.grid.value).toContain(7)
    expect(battle.fighters.value).toHaveLength(0)
  })

  it('idles instead of deploying when no pair is left', async () => {
    const { battle, game } = await importGame()
    battle.battleUpgrades.value = { ...battle.battleUpgrades.value, automation: 5 }

    // Nothing mergeable — the old imp would have emptied this straight into
    // the arena, one unit per beat.
    game.grid.value = [2, 4, 6, 8, ...Array(12).fill(0)]
    const before = game.grid.value.slice()

    game.startEngine()
    vi.advanceTimersByTime(IMP_BEATS_MS)
    game.stopEngine()

    expect(game.grid.value).toEqual(before)
    expect(battle.fighters.value).toHaveLength(0)
    expect(game.autoAction.value).toBeNull()
  })

  it('never reports a deploy action for the view to mirror', async () => {
    const { battle, game } = await importGame()
    battle.battleUpgrades.value = { ...battle.battleUpgrades.value, automation: 5 }

    // A board that keeps the imp busy: every merge frees a slot and leaves
    // another pair behind, so it acts on many consecutive beats.
    game.grid.value = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 0, 0, 0, 0]

    // `flush: 'sync'` so EVERY beat is recorded — the default 'pre' flush
    // coalesces the whole burst into one callback and would hide a deploy
    // that happened between two merges.
    const seen: string[] = []
    const { watch } = await import('vue')
    const unwatch = watch(game.autoAction, (v) => {
      if (v?.action) seen.push(v.action.type)
    }, { flush: 'sync' })

    game.startEngine()
    vi.advanceTimersByTime(IMP_BEATS_MS)
    game.stopEngine()
    unwatch()

    expect(seen.length).toBeGreaterThan(1)
    expect(seen.every((type) => type === 'merge')).toBe(true)
    expect(battle.fighters.value).toHaveLength(0)
  })
})
