import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, claimableFirst, type AchievementView } from '@/use/useAchievements'

/**
 * Collecting rewards used to mean scrolling the ladder hunting for the gold
 * buttons, so the modal hoists every claimable row to the top. The hoist is
 * keyed on `claimable` ALONE — that is what makes a claimed row fall straight
 * back to the slot it came from instead of staying parked at the top.
 */

const view = (id: string, o: Partial<AchievementView> = {}): AchievementView => {
  const def = ACHIEVEMENTS.find((a) => a.id === id)!
  return { ...def, current: 0, claimed: false, complete: false, claimable: false, ...o }
}

/** The authored ladder, with `claimable` ids flagged and `claimed` ids marked. */
const board = (claimable: string[], claimed: string[] = []): AchievementView[] =>
  ACHIEVEMENTS.map((a) => view(a.id, {
    claimable: claimable.includes(a.id),
    claimed: claimed.includes(a.id),
    complete: claimable.includes(a.id) || claimed.includes(a.id)
  }))

const ids = (rows: AchievementView[]): string[] => rows.map((r) => r.id)
const authored = ACHIEVEMENTS.map((a) => a.id)

describe('claimable-first ordering', () => {
  it('leaves the authored order alone when nothing is claimable', () => {
    expect(ids(claimableFirst(board([])))).toEqual(authored)
  })

  it('hoists every claimable row to the top', () => {
    const rows = claimableFirst(board(['boss1', 'combo50', 'kills1k']))
    expect(ids(rows).slice(0, 3)).toEqual(['kills1k', 'boss1', 'combo50'])
  })

  it('keeps the authored order within each group', () => {
    const rows = ids(claimableFirst(board(['combo50', 'kills1k'])))
    // Claimable block, in authored order…
    expect(rows.slice(0, 2)).toEqual(['kills1k', 'combo50'])
    // …and the rest untouched behind it.
    expect(rows.slice(2)).toEqual(authored.filter((id) => id !== 'kills1k' && id !== 'combo50'))
  })

  it('never hoists an already-claimed row', () => {
    const rows = ids(claimableFirst(board(['boss1'], ['kills100', 'merges10'])))
    expect(rows[0]).toBe('boss1')
    // A claimed row is just another non-claimable row: it stays put, in the
    // authored order, behind the one thing that is actually collectable.
    expect(rows.slice(1)).toEqual(authored.filter((id) => id !== 'boss1'))
  })

  it('drops a claimed row back to exactly where it started', () => {
    const before = claimableFirst(board(['kills1k', 'row10', 'boss1']))
    expect(ids(before)[0]).toBe('kills1k')
    // The player claims the top row: it stops being claimable, nothing else moves.
    const after = ids(claimableFirst(board(['row10', 'boss1'], ['kills1k'])))
    expect(after.slice(0, 2)).toEqual(['row10', 'boss1'])
    // Back among the unclaimable rows, in its authored slot: behind kills100,
    // ahead of kills10k — exactly where it sat before it completed.
    expect(after.indexOf('kills100')).toBeLessThan(after.indexOf('kills1k'))
    expect(after.indexOf('kills1k')).toBeLessThan(after.indexOf('kills10k'))
  })

  it('does not mutate the list it is given', () => {
    const rows = board(['fevers25'])
    const snapshot = ids(rows)
    claimableFirst(rows)
    expect(ids(rows)).toEqual(snapshot)
  })
})
