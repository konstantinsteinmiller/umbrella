import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { shouldLockRotate } from '@/umbrella/rotateLock'

describe('landscape lock', () => {
  it('locks a touch device held upright only', () => {
    expect(shouldLockRotate(true, 390, 844)).toBe(true)
    expect(shouldLockRotate(true, 844, 390)).toBe(false)
    expect(shouldLockRotate(true, 600, 600)).toBe(false)
  })
  it('never locks a desktop window, however narrow', () => {
    expect(shouldLockRotate(false, 400, 900)).toBe(false)
  })
  it('has its copy in every shipped locale', () => {
    const dir = 'src/i18n/locales'
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(`${dir}/${f}`, 'utf8')
      expect(src, f).toMatch(/'rotate': \{\s*'title': ".+",\s*'hint': ".+"\s*\}/)
    }
  })
})
