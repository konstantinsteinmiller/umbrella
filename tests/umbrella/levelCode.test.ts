import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/umbrella/levels'
import { cloneLevel } from '@/umbrella/customLevels'
import { decodeLevel, encodeLevel, shareLink } from '@/umbrella/levelCode'

describe('share codes', () => {
  it('rebuild the same level, and the same level always gives the same code', async () => {
    const level = { ...cloneLevel(LEVELS[4]!), buttons: [{ x: 1, y: 2, w: 40, h: 16, channel: 2, duration: 5 }], checkpoints: [{ x: 300, y: 400 }], editedAt: 123 }
    const code = await encodeLevel(level, 'My level')
    expect(code).toMatch(/^u1[A-Za-z0-9_-]+$/)
    expect(await encodeLevel({ ...level, editedAt: 999, id: 77 }, 'My level')).toBe(code)
    const back = await decodeLevel(code)
    expect(back!.name).toBe('My level')
    const { id: _a, editedAt: _b, ...want } = level
    const { id: _c, ...got } = back!.level
    expect(got).toEqual({ hazards: [], ...want })
    expect(shareLink(code)).toContain(`?level=${code}`)
  })
  it('refuses junk', async () => {
    for (const bad of ['', 'x', 'u1!!!', 'u1AAAA', 'u2abc']) expect(await decodeLevel(bad)).toBeNull()
  })
})
