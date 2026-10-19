// Skill toasts (`BarrageBanners.vue`). They used to be the skill's name plus an
// effect sentence, 2.4 s, every time a skill fired. Silent Flow (retention-
// roadmap #2): icon-only — the skill's glyph in a medallion — and not every
// time (once a session per skill, SKILL_TOAST_CAP times ever). The name and
// the sentence still reach screen readers, every time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, type Ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const STATE_KEY = 'umbrella_state'

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref, shallowRef } = await import('vue')
  const api = {
    lastSkill: ref<string | null>(null),
    engineGen: ref(1),
    mode: ref('endless'),
    boss: ref(null),
    engine: shallowRef({ state: { monsters: [] } }),
    onEngineEvent: () => () => {}
  }
  return { default: () => api }
})

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

/** `bossKills`: 0 = a first-timer still in Silent Flow (one toast in all). */
const setup = async (state?: Record<string, unknown>, bossKills = 1) => {
  vi.resetModules()
  window.localStorage.clear()
  if (state) window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  const progress = await import('@/barrage/state/progress')
  progress.stats.value = { ...progress.defaultStats(), bossKills }
  const BarrageBanners = (await import('@/components/barrage/BarrageBanners.vue')).default
  const barrage = (await import('@/barrage/state/useBarrage')).default() as unknown as { lastSkill: Ref<string | null> }
  const coach = await import('@/use/useCoach')
  const w = mount(BarrageBanners, { global: { plugins: [i18n] } })
  await nextTick()
  const fire = async (skill: string): Promise<void> => {
    barrage.lastSkill.value = skill
    await nextTick()
    await nextTick()
  }
  const said = (): string => w.find('.sr-only[aria-live]').text()
  return { w, fire, said, coach }
}

const sentence = (skill: 'meteor' | 'heal'): string =>
  `${en.barrage.skills[skill].name}: ${en.barrage.skills[skill].effect}`

describe('skill toasts', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('are icon-only: the skill\'s glyph and nothing to read — the words go to screen readers', async () => {
    const { w, fire, said } = await setup()
    await fire('meteor')
    const toast = w.find('.bb-toast')
    expect(toast.exists()).toBe(true)
    expect(toast.find('img.bb-toast__icon').exists()).toBe(true)
    expect(toast.text()).toBe('')
    expect(w.text()).not.toContain(en.barrage.skills.meteor.name)
    expect(w.text()).not.toContain(en.barrage.skills.meteor.effect)
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(said()).toBe(sentence('meteor'))
    w.unmount()
  })

  it('stay a moment only (about 1.2 s, was 2.4 s)', async () => {
    const { w, fire } = await setup()
    await fire('heal')
    vi.advanceTimersByTime(1199)
    await nextTick()
    expect(w.find('.bb-toast').exists()).toBe(true)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(w.find('.bb-toast').exists()).toBe(false)
    w.unmount()
  })

  it('not every time: the same skill again this session shows none — its words still go out', async () => {
    const { w, fire, said } = await setup()
    await fire('meteor')
    vi.advanceTimersByTime(1300)
    await nextTick()
    expect(w.find('.bb-toast').exists()).toBe(false)
    await fire('meteor')
    expect(w.find('.bb-toast').exists()).toBe(false)
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(said()).toBe(sentence('meteor'))
    // Another skill still gets its first one.
    await fire('heal')
    expect(w.find('.bb-toast').exists()).toBe(true)
    w.unmount()
  })

  it('and never again once a skill has had SKILL_TOAST_CAP of them', async () => {
    const first = await setup()
    const cap = first.coach.SKILL_TOAST_CAP
    first.w.unmount()
    const { w, fire } = await setup({ umb_coach: { v: 1, shown: {}, kinds: {}, toasts: { meteor: cap } } })
    await fire('meteor')
    expect(w.find('.bb-toast').exists()).toBe(false)
    w.unmount()
  })

  it('Silent Flow: before the first boss kill, one icon toast in all (the first minute stays quiet)', async () => {
    const { w, fire, said } = await setup(undefined, 0)
    await fire('meteor')
    expect(w.find('.bb-toast').exists()).toBe(true)
    vi.advanceTimersByTime(1300)
    await nextTick()
    // A different skill: in the world only — and to screen readers.
    await fire('heal')
    expect(w.find('.bb-toast').exists()).toBe(false)
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(said()).toBe(sentence('heal'))
    w.unmount()
  })
})
