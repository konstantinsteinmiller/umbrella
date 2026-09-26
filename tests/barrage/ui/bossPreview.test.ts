// The next boss in smoke beside "Boss in N": the retention tease a first-time
// player sees from the first second, nine rows before the first boss. It must
// show the boss that will actually spawn, keep it a silhouette, frame its face
// (a whole blacked-out body in a ring read as a blank profile picture), and
// thin its smoke as the fight nears.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BossPreview from '@/components/barrage/BossPreview.vue'
import { bossForRow } from '@/barrage/engine/monsters'
import { bossSrc } from '@/barrage/art'

const render = (nextRow: number, rowsLeft: number) => mount(BossPreview, { props: { nextRow, rowsLeft, size: 40 } })
const pct = (v: string): number => parseFloat(v)

describe('BossPreview', () => {
  it('shows the boss the next boss row spawns, every lap', () => {
    for (const row of [10, 20, 30, 40, 50, 60, 70, 110]) {
      const img = render(row, 5).find('img')
      expect(img.attributes('src')).toBe(bossSrc(bossForRow(row).bossKind))
    }
  })

  it('is a decorative silhouette the Poki stage can paint', () => {
    const w = render(10, 9)
    expect(w.attributes('aria-hidden')).toBe('true')
    expect(w.attributes('data-poki-stage-art')).toBe('silhouette')
    expect(w.findAll('[data-poki-stage-glow]').length).toBeGreaterThan(0)
  })

  it('frames the face close up, eyes around the middle', () => {
    for (const row of [10, 20, 30, 40, 50, 60]) {
      const w = render(row, 5)
      const shape = w.find('img').attributes('style') ?? ''
      // Drawn larger than the frame: a head, not a whole body.
      expect(shape).toContain('width: 150%')
      const eyes = w.findAll('.boss-preview__eye').map((e) => {
        const st = (e.element as HTMLElement).style
        return { x: pct(st.left), y: pct(st.top) }
      })
      expect(eyes.length).toBeGreaterThan(0)
      for (const e of eyes) {
        expect(e.x).toBeGreaterThan(20)
        expect(e.x).toBeLessThan(80)
        expect(e.y).toBeGreaterThan(15)
        expect(e.y).toBeLessThan(60)
      }
    }
  })

  it('thins the smoke and quickens the aura as the boss nears', () => {
    const far = render(10, 9)
    const near = render(10, 1)
    const fog = (w: ReturnType<typeof render>): number => parseFloat((w.element as HTMLElement).style.getPropertyValue('--fog'))
    expect(fog(far)).toBeGreaterThan(fog(near))
    expect(fog(near)).toBeGreaterThanOrEqual(0.4)
    expect(far.classes()).not.toContain('is-near')
    expect(near.classes()).toContain('is-near')
  })

  it('glows violet for a corrupted (second-lap) boss', () => {
    expect(render(10, 5).classes()).not.toContain('is-corrupted')
    expect(render(70, 5).classes()).toContain('is-corrupted')
  })
})
