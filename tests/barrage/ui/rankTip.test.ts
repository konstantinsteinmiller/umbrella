// Play-test run 4: a tester did not know what "#15,667 of 15,876" was. The
// rank plaque now answers a tap with the HUD name plate — the trophy, its name
// ("Global rank") and its placing, the plaque's own texts — like the chest and
// the tray's status icons. A label on demand, never a teaching card.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const lb = vi.hoisted(() => ({ rank: { value: 0 }, total: { value: 0 } }))

vi.mock('@/use/useLeaderboard', async () => {
  const { ref } = await import('vue')
  lb.rank = ref(0)
  lb.total = ref(0)
  return {
    leaderboardEnabled: true,
    leaderboardFailed: computed(() => false),
    playerTotal: computed(() => lb.total.value),
    rankFor: () => lb.rank.value
  }
})

import RankBadge from '@/components/atoms/RankBadge.vue'
import HudTip from '@/components/barrage/HudTip.vue'
import { hideHudTip, hudTip, rankTip, showHudTip } from '@/components/barrage/hudTip'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

type TapInfo = { rank: string; of: string | null; aria: string }

describe('rank plaque name tip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hideHudTip()
    lb.rank.value = 15667
    lb.total.value = 15876
  })
  afterEach(() => {
    hideHudTip()
    vi.useRealTimers()
  })

  it('a tappable plaque catches the tap and hands over its own texts', async () => {
    const w = mount(RankBadge, { props: { score: 12, tappable: true }, global: { plugins: [i18n] } })
    await nextTick()
    const plaque = w.find('.rank-badge')
    expect(plaque.classes()).toContain('rank-badge--tappable')
    expect(plaque.attributes('role')).toBe('button')
    // Its label is unchanged (the leaderboard suite's contract).
    expect(plaque.attributes('aria-label')).toBe('Leaderboard rank 15,667 of 15,876')
    await plaque.trigger('click')
    const ev = w.emitted('tap')
    expect(ev).toHaveLength(1)
    expect(ev![0]![0]).toBe(plaque.element)
    expect(ev![0]![1]).toEqual({ rank: '#15,667', of: 'of 15,876', aria: 'Leaderboard rank 15,667 of 15,876' })
    // The keyboard too.
    await plaque.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('tap')).toHaveLength(2)
    w.unmount()
  })

  it('without `tappable` it stays click-through, as before; the "…" never answers', async () => {
    const plain = mount(RankBadge, { props: { score: 12 }, global: { plugins: [i18n] } })
    await nextTick()
    expect(plain.find('.rank-badge').classes()).not.toContain('rank-badge--tappable')
    expect(plain.find('.rank-badge').attributes('role')).toBe('img')
    await plain.find('.rank-badge').trigger('click')
    expect(plain.emitted('tap')).toBeUndefined()
    plain.unmount()
    lb.rank.value = 0
    const waiting = mount(RankBadge, { props: { score: 12, tappable: true }, global: { plugins: [i18n] } })
    await nextTick()
    await waiting.find('.rank-badge').trigger('click')
    expect(waiting.emitted('tap')).toBeUndefined()
    waiting.unmount()
  })

  it('the plate: trophy, "Global rank", the placing with its population', async () => {
    const info: TapInfo = { rank: '#15,667', of: 'of 15,876', aria: 'Leaderboard rank 15,667 of 15,876' }
    const c = rankTip(en.barrage.hud.rank, info)
    expect(c).toEqual({
      icon: 'trophy',
      name: 'Global rank',
      facts: [{ text: '#15,667', sub: 'of 15,876' }],
      sr: 'Leaderboard rank 15,667 of 15,876'
    })
    expect(rankTip('Global rank', { ...info, of: null }).facts).toEqual([{ text: '#15,667' }])

    const tip = mount(HudTip, { global: { plugins: [i18n], stubs: { teleport: true } } })
    const anchor = document.createElement('div')
    document.body.appendChild(anchor)
    anchor.getBoundingClientRect = () => ({ left: 120, top: 56, width: 150, height: 30, right: 270, bottom: 86, x: 120, y: 56, toJSON: () => ({}) }) as DOMRect
    showHudTip(anchor, () => c)
    await nextTick()
    await nextTick()
    expect(hudTip.value).not.toBeNull()
    expect(tip.find('.hud-tip__icon svg').exists()).toBe(true)
    expect(tip.find('.hud-tip__name').text()).toBe('Global rank')
    const fact = tip.find('.hud-tip__fact--plain')
    expect(fact.exists()).toBe(true)
    expect(fact.find('svg').exists()).toBe(false) // no second glyph beside the trophy
    expect(fact.text()).toContain('#15,667')
    expect(fact.find('.hud-tip__sub').text()).toBe('of 15,876')
    expect(tip.find('[aria-live="polite"]').text()).toContain('Leaderboard rank 15,667 of 15,876')
    tip.unmount()
    anchor.remove()
  })
})
