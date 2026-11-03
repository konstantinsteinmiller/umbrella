import { describe, expect, it } from 'vitest'
import { stickAt } from '@/umbrella/stick'

describe('touch joystick', () => {
  const range = 58
  it('inside the pad it is a plain slider around its centre', () => {
    expect(stickAt(100, range, 100)).toEqual({ origin: 100, dx: 0, dir: 0 })
    expect(stickAt(100, range, 130)).toEqual({ origin: 100, dx: 30, dir: 1 })
    expect(stickAt(100, range, 60)).toEqual({ origin: 100, dx: -40, dir: -1 })
  })
  it('dragged far past the right end, turning back left reverses within about one pad width', () => {
    let st = stickAt(100, range, 100)
    st = stickAt(st.origin, range, 400) // way outside the pad, to the right
    expect(st.dx).toBe(range)
    expect(st.dir).toBe(1)
    // Back by 20 px: the knob eases in but it is still a push right.
    expect(stickAt(st.origin, range, 380).dir).toBe(1)
    // Back by 80 px: it is already a push LEFT, though the finger is still hundreds of px right of the pad.
    const left = stickAt(st.origin, range, 320)
    expect(left.dir).toBe(-1)
    expect(left.origin).toBeGreaterThan(300)
  })
  it('the same to the left', () => {
    const st = stickAt(100, range, -300)
    expect(st.dir).toBe(-1)
    const back = stickAt(st.origin, range, -280)
    expect(back.dx).toBeGreaterThan(-range)
    expect(stickAt(back.origin, range, -150).dir).toBe(1)
  })
})
