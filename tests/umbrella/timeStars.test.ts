// Timed levels: the 1–3 star rating by time left, the clock's text and blink window, and the
// editor's time limit surviving (or being refused by) the level parser.
import { describe, expect, it } from 'vitest'
import { blinkFrom, formatClock, MAX_TIME_LIMIT, parseTimeLimit, timeStars } from '@/umbrella/timeStars'
import { cloneLevel, parseLevel } from '@/umbrella/customLevels'
import { LEVELS } from '@/umbrella/levels'

describe('the rating', () => {
  it('gives three stars with 2+ seconds on the clock, two with 1–1.99, one with less', () => {
    expect(timeStars(30, 60)).toBe(3)
    expect(timeStars(2, 60)).toBe(3)
    expect(timeStars(1.99, 60)).toBe(2)
    expect(timeStars(1, 60)).toBe(2)
    expect(timeStars(0.99, 60)).toBe(1)
    expect(timeStars(0.01, 60)).toBe(1)
  })
  it('gives none when the clock ran out or there is no limit', () => {
    expect(timeStars(0, 60)).toBe(0)
    expect(timeStars(10, 0)).toBe(0)
  })
})

describe('the clock', () => {
  it('reads seconds:hundredths, the whole seconds first — the same seconds the rating counts', () => {
    expect(formatClock(12.345)).toBe('12:34')
    expect(formatClock(8.9)).toBe('08:90')
    expect(formatClock(1.5)).toBe('01:50')
    expect(formatClock(0.07)).toBe('00:07')
    expect(formatClock(125.5)).toBe('125:50')
    expect(formatClock(0)).toBe('00:00')
  })
  it('blinks for the last fifth of the limit, between 3 and 10 seconds', () => {
    expect(blinkFrom(10)).toBe(3)
    expect(blinkFrom(30)).toBe(6)
    expect(blinkFrom(200)).toBe(10)
  })
})

describe('the time limit in a level', () => {
  it('keeps whole seconds in 1…999 and drops anything else', () => {
    expect(parseTimeLimit(20.4)).toBe(20)
    expect(parseTimeLimit(5000)).toBe(MAX_TIME_LIMIT)
    expect(parseTimeLimit(0)).toBeUndefined()
    expect(parseTimeLimit('30')).toBeUndefined()
    const base = cloneLevel(LEVELS[0]!)
    expect(parseLevel({ ...base, timeLimit: 45 })!.timeLimit).toBe(45)
    expect(parseLevel({ ...base, timeLimit: -3 })!.timeLimit).toBeUndefined()
  })
})
