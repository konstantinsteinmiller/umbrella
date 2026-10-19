// The Collection's rewarded skin-ad buttons (retention roadmap T0.2, user
// decision 2026-09-27): a rewarded offer stays HIDDEN until the rewarded gate
// opens (first boss kill + 3:00 of lifetime active play). It is not shown
// disabled. Past the gate, the ad-only skins show their "▶ Unlock" button,
// which is disabled only while no ad can fill (the readiness rule, unchanged).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h as hh, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const ctl = vi.hoisted(() => ({ ready: null as null | { value: boolean } }))

vi.mock('@/use/useUser', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buffsCostCoins: false
}))
vi.mock('@/use/useAds', async () => {
  const { ref } = await import('vue')
  ctl.ready = ref(true)
  return { isRewardedReady: ctl.ready, showRewardedAd: vi.fn(async () => true) }
})
// The renderer's skin bake needs a real canvas; any image will do here.
vi.mock('@/barrage/render/balls', () => ({ ballPreview: () => 'data:image/png;base64,' }))
vi.mock('@/use/useSound', () => ({ default: () => ({ playSound: () => null }) }))

const STATE_KEY = 'umbrella_state'
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const FModal = defineComponent({ setup: (_, { slots }) => () => hh('div', slots.default?.()) })

/** The Collection open on its Ball Skins tab, over a save with `stats`. */
const openSkins = async (stats: Record<string, number>) => {
  vi.resetModules()
  if (ctl.ready) ctl.ready.value = true
  localStorage.setItem(STATE_KEY, JSON.stringify({ epic_coins: 0, umb_stats: stats }))
  const CollectionModal = (await import('@/components/barrage/CollectionModal.vue')).default
  const w = mount(CollectionModal, { props: { modelValue: true }, global: { plugins: [i18n], stubs: { FModal } } })
  await w.findAll('.col-tab')[1]!.trigger('click')
  await nextTick()
  return w
}

afterEach(async () => {
  (await import('@/use/useEpicState')).flushPersist()
})

describe('Collection: skin ads behind the rewarded gate', () => {
  it('before the first boss kill there is no ad button at all, not even a disabled one', async () => {
    const w = await openSkins({ bossKills: 0, playSeconds: 900 })
    expect(w.findAll('.col-card').length).toBeGreaterThan(2)
    expect(w.findAll('.col-ad')).toHaveLength(0)
    w.unmount()
  })

  it('before 3:00 of play there is none either, even past a boss', async () => {
    const w = await openSkins({ bossKills: 2, playSeconds: 179 })
    expect(w.findAll('.col-ad')).toHaveLength(0)
    w.unmount()
  })

  it('the buttons appear the moment the gate opens, live on the open tab', async () => {
    const w = await openSkins({ bossKills: 1, playSeconds: 179 })
    expect(w.findAll('.col-ad')).toHaveLength(0)
    ;(await import('@/barrage/state/progress')).addPlaySeconds(1)
    await nextTick()
    const { BALL_SKINS } = await import('@/barrage/ballSkins')
    const buttons = w.findAll('.col-ad')
    expect(buttons.length).toBeGreaterThanOrEqual(BALL_SKINS.filter((s) => s.adOnly).length)
    expect(buttons.every((b) => b.attributes('disabled') === undefined)).toBe(true)
    w.unmount()
  })

  it('past the gate the readiness rule is unchanged: ad-only skins keep a disabled button while no ad can fill', async () => {
    const w = await openSkins({ bossKills: 1, playSeconds: 180 })
    ctl.ready!.value = false
    await nextTick()
    const { BALL_SKINS } = await import('@/barrage/ballSkins')
    const buttons = w.findAll('.col-ad')
    expect(buttons).toHaveLength(BALL_SKINS.filter((s) => s.adOnly).length)
    expect(buttons.every((b) => b.attributes('disabled') !== undefined)).toBe(true)
    w.unmount()
  })
})
