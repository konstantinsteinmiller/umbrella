import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

/**
 * ─── The arena rank tag ─────────────────────────────────────────────────────
 *
 * Three states — a number, a slot-holding "…", or nothing — plus the one rule a
 * stale board made necessary: the "of N" is never smaller than the player's own
 * rank ("#3 of 2" was seen live, a player ranked against a board that did not
 * count them yet).
 */

const lb = vi.hoisted(() => ({ rank: { value: 0 }, total: { value: 0 }, failed: { value: false } }))

vi.mock('@/use/useLeaderboard', async () => {
  const { ref } = await import('vue')
  lb.rank = ref(0)
  lb.total = ref(0)
  lb.failed = ref(false)
  return {
    leaderboardEnabled: true,
    leaderboardFailed: computed(() => lb.failed.value),
    playerTotal: computed(() => lb.total.value),
    rankFor: () => lb.rank.value
  }
})

import RankBadge from '@/components/atoms/RankBadge.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const render = (score: number) => mount(RankBadge, { props: { score }, global: { plugins: [i18n] } })
/** The tag's two lines, joined with a space (they are stacked, not inline). */
const text = (w: ReturnType<typeof render>): string =>
  ['.rank-badge__rank', '.rank-badge__of']
    .map((sel) => (w.find(sel).exists() ? w.find(sel).text().trim() : ''))
    .filter(Boolean)
    .join(' ')

beforeEach(() => {
  lb.rank.value = 0
  lb.total.value = 0
  lb.failed.value = false
})

describe('the rank tag', () => {
  it('shows the placing and the population', async () => {
    lb.rank.value = 183
    lb.total.value = 891
    const w = render(37)
    await nextTick()
    expect(text(w)).toBe('#183 of 891')
    expect(w.find('.rank-badge').attributes('aria-label')).toBe('Leaderboard rank 183 of 891')
  })

  it('never claims fewer players than the rank it shows', async () => {
    // A board that has not counted this player yet: two players above, total 2.
    lb.rank.value = 3
    lb.total.value = 2
    const w = render(12)
    await nextTick()
    expect(text(w)).toBe('#3 of 3')
  })

  it('groups big numbers', async () => {
    lb.rank.value = 11481
    lb.total.value = 15876
    const w = render(5)
    await nextTick()
    expect(text(w)).toBe('#11,481 of 15,876')
  })

  it('holds the slot with "…" while the first answer is on its way', async () => {
    const w = render(12)
    await nextTick()
    expect(text(w)).toBe('…')
    expect(w.find('.rank-badge').attributes('aria-hidden')).toBe('true')
  })

  it('renders nothing once the fetch failed with no board to fall back on', async () => {
    lb.failed.value = true
    const w = render(12)
    await nextTick()
    expect(w.find('.rank-badge').exists()).toBe(false)
  })

  it('renders nothing for a player who has cleared no wave', async () => {
    lb.rank.value = 99
    lb.total.value = 500
    const w = render(0)
    await nextTick()
    expect(w.find('.rank-badge').exists()).toBe(false)
  })
})
