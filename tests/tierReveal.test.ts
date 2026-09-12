import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ─── The new-tier discovery moment: WHEN it fires ───────────────────────────
 *
 * The look is TierRevealFx's business; this pins the trigger, because the
 * trigger is the easy part to get subtly wrong. The discovery watermark
 * (`maxTier`) moves on spawns, deploys, chest rewards and the restored-army
 * reconcile as well as on merges — and only a MERGE the player (or their imp)
 * made may put a unit on stage. A reveal that fires on a spawn is noise; one
 * that never fires is the feature missing.
 */

const load = async () => {
  vi.resetModules()
  const reveal = await import('@/use/useTierReveal')
  const prism = await import('@/use/usePrismGame')
  reveal.__resetTierReveal()
  return { reveal, prism, game: prism.default() }
}

/** Put exactly these tiers in the grid (rest empty). */
const setGrid = (game: { grid: { value: number[] } }, cells: Record<number, number>): void => {
  const next = new Array(16).fill(0)
  for (const [i, t] of Object.entries(cells)) next[Number(i)] = t
  game.grid.value = next
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('a grid merge into a tier never seen is revealed', () => {
  it('starts exactly one reveal, on the unit the merge produced', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 2
    setGrid(game, { 3: 2, 9: 2 })

    expect(game.merge(3, 9)).toBe(3)

    const r = reveal.activeReveal.value
    expect(r, 'a first-ever tier 3 was not revealed').not.toBeNull()
    expect(r!.tier).toBe(3)
    // The TARGET slot holds the new unit; the source slot is now empty.
    expect(r!.target).toEqual({ kind: 'grid', idx: 9 })
    expect(r!.id).toBe(1)
    expect(game.maxTier.value).toBe(3)
  })

  it('counts the tutorial’s first merge (T1 + T1 → T2) too', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 1
    setGrid(game, { 0: 1, 1: 1 })
    game.merge(0, 1)
    expect(reveal.activeReveal.value?.tier).toBe(2)
  })

  it('does not reveal a tier the player already had', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 6
    setGrid(game, { 0: 3, 1: 3 })
    expect(game.merge(0, 1)).toBe(4)
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('does not reveal the tier the player is AT — only one past it', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 4
    setGrid(game, { 0: 3, 1: 3 })
    expect(game.merge(0, 1)).toBe(4)
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('an imp merge is a merge — the same rule applies', async () => {
    // The imp merges through `merge()` like the player does, so a discovery it
    // makes gets the same stage. (Its step picks the highest pair on the board.)
    const { reveal, game } = await load()
    game.maxTier.value = 4
    setGrid(game, { 5: 4, 12: 4, 0: 1 })
    game.merge(5, 12)
    expect(reveal.activeReveal.value).toMatchObject({ tier: 5, target: { kind: 'grid', idx: 12 } })
  })
})

describe('nothing but a merge may start it', () => {
  it('a spawn that raises the watermark reveals nothing', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 1
    setGrid(game, {})
    // A chest / campaign reward dropping a higher tier than ever seen.
    expect(game.spawnUnitAt(4)).toBeGreaterThanOrEqual(0)
    expect(game.maxTier.value).toBe(4)
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('a deploy or the restored-army reconcile (bumpMaxTier) reveals nothing', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 3
    game.bumpMaxTier(9)
    expect(game.maxTier.value).toBe(9)
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('an arena field merge into a new tier reveals that fighter', async () => {
    const { reveal, prism } = await load()
    prism.maxTier.value = 5
    expect(prism.noteFieldMerge(6, 42)).toBe(true)
    expect(reveal.activeReveal.value).toMatchObject({ tier: 6, target: { kind: 'fighter', fighterId: 42 } })
    expect(prism.maxTier.value).toBe(6)
  })

  it('an arena field merge into a known tier only moves the watermark', async () => {
    const { reveal, prism } = await load()
    prism.maxTier.value = 8
    expect(prism.noteFieldMerge(6, 42)).toBe(false)
    expect(reveal.activeReveal.value).toBeNull()
  })
})

describe('the moment lasts five seconds and follows its unit', () => {
  it('ends by itself after 5 s', async () => {
    vi.useFakeTimers()
    const { reveal, game } = await load()
    game.maxTier.value = 2
    setGrid(game, { 0: 2, 1: 2 })
    game.merge(0, 1)
    vi.advanceTimersByTime(4_900)
    expect(reveal.activeReveal.value).not.toBeNull()
    vi.advanceTimersByTime(200)
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('a newer discovery replaces the running one, and the old timer cannot end it', async () => {
    vi.useFakeTimers()
    const { reveal, game } = await load()
    game.maxTier.value = 2
    setGrid(game, { 0: 2, 1: 2, 4: 3 })
    game.merge(0, 1)                      // → T3 (new)  at t = 0
    vi.advanceTimersByTime(3_000)
    game.merge(1, 4)                      // → T4 (new)  at t = 3 s
    const second = reveal.activeReveal.value
    expect(second).toMatchObject({ tier: 4, target: { kind: 'grid', idx: 4 } })
    vi.advanceTimersByTime(2_500)         // t = 5.5 s: the FIRST reveal's end time has passed
    expect(reveal.activeReveal.value?.id).toBe(second!.id)
    vi.advanceTimersByTime(2_600)         // t = 8.1 s: the second one's own 5 s are up
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('moves with the unit when it is dragged to another slot', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 2
    setGrid(game, { 0: 2, 1: 2 })
    game.merge(0, 1)
    const id = reveal.activeReveal.value!.id
    expect(game.moveSlot(1, 7)).toBe(true)
    // Same reveal (same timeline), new place.
    expect(reveal.activeReveal.value).toMatchObject({ id, target: { kind: 'grid', idx: 7 } })
  })

  it('ends when the revealed unit is merged into a tier the player already has', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 2
    setGrid(game, { 0: 2, 1: 2 })
    game.merge(0, 1)                      // T3 revealed at slot 1
    game.maxTier.value = 9                // (a higher tier was reached elsewhere)
    setGrid(game, { 1: 3, 2: 3 })
    game.merge(1, 2)                      // the revealed unit is consumed → T4, known
    expect(reveal.activeReveal.value).toBeNull()
  })

  it('hands the reveal sting to the landing view exactly once', async () => {
    const { reveal, game } = await load()
    game.maxTier.value = 2
    setGrid(game, { 0: 2, 1: 2 })
    game.merge(0, 1)
    expect(reveal.claimRevealSound({ kind: 'grid', idx: 0 })).toBe(false) // wrong unit
    expect(reveal.claimRevealSound({ kind: 'grid', idx: 1 })).toBe(true)
    expect(reveal.claimRevealSound({ kind: 'grid', idx: 1 })).toBe(false) // never twice
  })

  it('offsets a view attaching mid-moment onto the running clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { reveal } = await load()
    const r = reveal.announceNewTier(4, { kind: 'fighter', fighterId: 1 })
    vi.setSystemTime(1_000_000 + 1_250)
    expect(reveal.revealAnimationDelay(r)).toBe('-1250ms')
    vi.setSystemTime(1_000_000 + 9_999)
    expect(reveal.revealAnimationDelay(r)).toBe('-5000ms')
    expect(reveal.revealAnimationDelay(null)).toBe('0ms')
  })
})
