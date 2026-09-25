// "Tap to Shoot" / "Click to Shoot": the first-time player's call to action.
// It pulses over the board until the first shot and never again, stays out of
// the way of anything else on screen, hides under the aiming hand, and names
// the input the player actually uses.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import type { Phase } from '@/barrage/engine/types'

const h = vi.hoisted(() => ({
  phase: null as null | { value: Phase },
  holdSim: null as null | { value: boolean }
}))

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref } = await import('vue')
  const phase = ref<Phase>('aim')
  const holdSim = ref(false)
  h.phase = phase
  h.holdSim = holdSim
  return { default: () => ({ phase, holdSim }) }
})

import ShootPrompt from '@/components/barrage/ShootPrompt.vue'
import { stats, defaultStats } from '@/barrage/state/progress'
import { isAdShowing } from '@/use/useGamePause'
import { acquireModalOpen } from '@/use/useModalState'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

let coarse = false
const realMatchMedia = window.matchMedia

let w: VueWrapper | null = null
const mountPrompt = async (): Promise<VueWrapper> => {
  w = mount(ShootPrompt, { global: { plugins: [i18n] } })
  await nextTick()
  return w
}
const label = (wr: VueWrapper): string | null => {
  const el = wr.find('.shoot-prompt__label')
  return el.exists() ? el.text() : null
}
const pointer = (type: string, pointerType: string): void => {
  const e = new Event(type) as Event & { pointerType: string }
  Object.defineProperty(e, 'pointerType', { value: pointerType })
  window.dispatchEvent(e)
}

beforeEach(() => {
  stats.value = defaultStats()
  h.phase!.value = 'aim'
  h.holdSim!.value = false
  isAdShowing.value = false
  coarse = false
  window.matchMedia = ((q: string) => ({ matches: q.includes('coarse') ? coarse : false })) as typeof window.matchMedia
})

afterEach(() => {
  w?.unmount()
  w = null
  window.matchMedia = realMatchMedia
})

describe('ShootPrompt', () => {
  it('a first-time player on a mouse sees "Click to Shoot"', async () => {
    expect(label(await mountPrompt())).toBe('Click to Shoot')
  })

  it('a first-time player on a touch screen sees "Tap to Shoot"', async () => {
    coarse = true
    expect(label(await mountPrompt())).toBe('Tap to Shoot')
  })

  it('follows the input actually used (a mouse on a touch laptop says Click)', async () => {
    coarse = true
    const wr = await mountPrompt()
    pointer('pointermove', 'mouse')
    await nextTick()
    expect(label(wr)).toBe('Click to Shoot')
  })

  it('hides under the aiming hand and comes back if no shot was fired', async () => {
    const wr = await mountPrompt()
    pointer('pointerdown', 'touch')
    await nextTick()
    expect(label(wr)).toBeNull()

    pointer('pointerup', 'touch') // a misfire: released on the unit
    await nextTick()
    expect(label(wr)).toBe('Tap to Shoot')
  })

  it('is gone for good after the first shot', async () => {
    const wr = await mountPrompt()
    stats.value = { ...stats.value, volleys: 1 }
    await nextTick()
    expect(label(wr)).toBeNull()

    h.phase!.value = 'volley'
    await nextTick()
    h.phase!.value = 'aim'
    await nextTick()
    expect(label(wr)).toBeNull()
  })

  it('never shows for a player who has fired before (a hydrated save included)', async () => {
    stats.value = { ...defaultStats(), volleys: 40 }
    expect(label(await mountPrompt())).toBeNull()
  })

  it('stays out of the way of a volley, a result screen, a menu and an ad', async () => {
    const wr = await mountPrompt()
    h.phase!.value = 'volley'
    await nextTick()
    expect(label(wr)).toBeNull()
    h.phase!.value = 'aim'

    h.holdSim!.value = true
    await nextTick()
    expect(label(wr)).toBeNull()
    h.holdSim!.value = false

    const release = acquireModalOpen()
    await nextTick()
    expect(label(wr)).toBeNull()
    release()

    isAdShowing.value = true
    await nextTick()
    expect(label(wr)).toBeNull()
    isAdShowing.value = false
    await nextTick()
    expect(label(wr)).toBe('Click to Shoot')
  })
})
