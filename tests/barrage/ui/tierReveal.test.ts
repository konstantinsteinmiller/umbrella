// The NEW BALL reveal (`use/useTierReveal.ts` + `TierRevealFx.vue`). Silent
// Flow (retention-roadmap #2): it lasts ≤ 1.5 s (it was 5 s under a local dim),
// never dims and never takes a tap; before the first boss kill only the first
// discovery gets one, and that one is wordless.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref: vref } = await import('vue')
  const tray = vref([3, 2, 1])
  return { default: () => ({ tray }) }
})

import TierRevealFx from '@/components/organisms/TierRevealFx.vue'
import {
  __resetTierReveal, activeReveal, announceNewTier, endReveal, REVEAL_MS, setRevealGate, silentRevealAllowed
} from '@/use/useTierReveal'
import { defaultStats, stats } from '@/barrage/state/progress'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const slot = { kind: 'grid' as const, idx: 0 }

describe('the NEW BALL reveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __resetTierReveal()
    stats.value = defaultStats()
  })
  afterEach(() => {
    __resetTierReveal()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('lasts at most 1.5 s', () => {
    expect(REVEAL_MS).toBeLessThanOrEqual(1500)
    const r = announceNewTier(2, slot)
    expect(activeReveal.value?.id).toBe(r?.id)
    vi.advanceTimersByTime(REVEAL_MS - 1)
    expect(activeReveal.value).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(activeReveal.value).toBeNull()
  })

  it('Silent Flow: before the first boss kill only the first discovery gets its moment', () => {
    expect(silentRevealAllowed(2)).toBe(true)
    expect(silentRevealAllowed(3)).toBe(false)
    const silent = ref(true)
    setRevealGate((tier) => !silent.value || silentRevealAllowed(tier))
    expect(announceNewTier(2, slot)).not.toBeNull()
    endReveal()
    // Tier 3 in the first minute: the tray's own flourish, no reveal.
    expect(announceNewTier(3, slot)).toBeNull()
    expect(activeReveal.value).toBeNull()
    // The first boss is down: every discovery again.
    silent.value = false
    expect(announceNewTier(4, slot)?.tier).toBe(4)
  })

  it('never dims, never takes a tap — and has no words until the first boss kill', async () => {
    // The tray (mocked) is [3, 2, 1]: tier 3 in slot 0, tier 2 in slot 1.
    document.body.innerHTML = '<div data-slot="0"><div class="unit-holder"></div></div><div data-slot="1"><div class="unit-holder"></div></div>'
    const w = mount(TierRevealFx, { global: { plugins: [i18n] }, attachTo: document.body })
    announceNewTier(2, { kind: 'grid', idx: 1 })
    await nextTick()
    await nextTick()
    const root = document.body.querySelector<HTMLElement>('.trf')
    expect(root).not.toBeNull()
    expect(root?.getAttribute('aria-hidden')).toBe('true')
    expect(document.body.querySelector('.trf-dim')).toBeNull()
    expect(document.body.querySelector('.trf-label')).toBeNull()
    endReveal()
    await nextTick()
    // Past the first boss kill the label is back: "NEW BALL!" + the tier.
    stats.value = { ...defaultStats(), bossKills: 1 }
    announceNewTier(3, slot)
    await nextTick()
    await nextTick()
    const label = document.body.querySelector('.trf-label')
    expect(label?.textContent).toContain(en.tierReveal.title)
    w.unmount()
  })
})
