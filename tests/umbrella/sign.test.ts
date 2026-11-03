import { describe, expect, it } from 'vitest'
import { cloneLevel, parseLevel } from '@/umbrella/customLevels'
import { LEVELS } from '@/umbrella/levels'

describe('hint board prop', () => {
  const base = () => cloneLevel(LEVELS[0]!)
  it('survives a save / load round trip', () => {
    const l = base()
    l.signs = [{ x: 500, y: 100, w: 120, h: 170 }]
    expect(parseLevel(JSON.parse(JSON.stringify(l)))?.signs).toEqual(l.signs)
  })
  it('rejects a malformed board', () => {
    const l = base() as unknown as { signs: unknown }
    l.signs = [{ x: 'a' }]
    expect(parseLevel(JSON.parse(JSON.stringify(l)))).toBeNull()
  })
})
