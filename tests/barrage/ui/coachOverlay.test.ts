// The coach overlay: the upgrade funnel's channel beside the lessons, and the
// playtest harness's markers on every live region. (The overrun lesson it
// used to sequence is retired — run 7: the loss itself teaches the line, the
// board's death sequence under "WASTED".)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'

const h = vi.hoisted(() => ({
  refs: null as null | {
    phase: { value: string }
    holdSim: { value: boolean }
    tutorialActive: { value: boolean }
    tutorialPreview: { value: string | null }
    unlocking: { value: unknown }
    /** Chips that have flown in (Silent Flow's earned chips). */
    chips: { value: string[] }
    modal: { value: boolean }
    reveal: { value: unknown }
  }
}))

vi.mock('@/barrage/state/useBarrage', async () => {
  const { ref, shallowRef } = await import('vue')
  const phase = ref('aim')
  const holdSim = ref(false)
  const api = {
    phase,
    holdSim,
    engine: shallowRef({ state: { launcherX: 3.5, monsters: [], pickups: [] }, aimPreview: () => ({ points: [] }) })
  }
  h.refs = { ...(h.refs ?? {}), phase, holdSim } as NonNullable<typeof h.refs>
  return { default: () => api }
})
vi.mock('@/use/useTutorial', async () => {
  const { ref } = await import('vue')
  const tutorialActive = ref(false)
  const tutorialPreview = ref<string | null>(null)
  h.refs = { ...(h.refs ?? {}), tutorialActive, tutorialPreview } as NonNullable<typeof h.refs>
  return { tutorialActive, tutorialPreview }
})
vi.mock('@/use/useFeatureUnlocks', async () => {
  const { ref } = await import('vue')
  const unlocking = ref<unknown>(null)
  const chips = ref<string[]>(['damage', 'capacity', 'speed', 'luck', 'bounty'])
  h.refs = { ...(h.refs ?? {}), unlocking, chips } as NonNullable<typeof h.refs>
  return { unlocking, chipShown: (id: string) => chips.value.includes(id) }
})
vi.mock('@/use/useModalState', async () => {
  const { ref } = await import('vue')
  const isAnyModalOpen = ref(false)
  h.refs = { ...(h.refs ?? {}), modal: isAnyModalOpen } as NonNullable<typeof h.refs>
  return { isAnyModalOpen }
})
vi.mock('@/use/useTierReveal', async () => {
  const { ref } = await import('vue')
  const activeReveal = ref<unknown>(null)
  h.refs = { ...(h.refs ?? {}), reveal: activeReveal } as NonNullable<typeof h.refs>
  return { activeReveal }
})
import CoachOverlay from '@/components/barrage/coach/CoachOverlay.vue'
import { boardApi, playerAiming, type BoardApi } from '@/components/barrage/barrageUi'
import { coachCue, coachLesson, sayCue, upgradeFunnel } from '@/use/useCoach'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const r = () => h.refs!

const stubBoard = (): BoardApi => ({
  launcherClientPoint: () => ({ x: 195, y: 600 }),
  cellToClient: (x, y) => ({ x: 20 + x * 50, y: 80 + y * 50 }),
  boardClientRect: () => null,
  beginAimFrom: () => false
})

let seq = 900

const render = () => mount(CoachOverlay, {
  global: {
    plugins: [i18n],
    stubs: { teleport: true, FingerDemo: true, TrayDemo: true, TrayIntroDemo: true, UpgradeFunnel: true }
  }
})

describe('upgrade funnel in the coach overlay', () => {
  beforeEach(() => {
    boardApi.value = stubBoard()
    playerAiming.value = false
    r().phase.value = 'aim'
    r().holdSim.value = false
    r().tutorialActive.value = false
    r().tutorialPreview.value = null
    r().unlocking.value = null
    r().modal.value = false
    r().reveal.value = null
    r().chips.value = ['damage', 'capacity', 'speed', 'luck', 'bounty']
    coachLesson.value = null
    upgradeFunnel.value = null
  })
  afterEach(() => {
    coachLesson.value = null
    upgradeFunnel.value = null
  })

  it('plays in full with the hand when it owns the screen; the survive lesson takes it off', async () => {
    const w = render()
    upgradeFunnel.value = { target: 'capacity', reason: 'rich', seq: ++seq }
    await nextTick()
    const f = w.findComponent({ name: 'UpgradeFunnel' })
    expect(f.exists()).toBe(true)
    expect(f.props('target')).toBe('capacity')
    expect(f.props('quiet')).toBe(false)
    expect(w.text()).toContain(en.barrage.coach.upgrade)
    // A shot lesson on screen (only before the 3rd volley): arrows only.
    coachLesson.value = { id: 'pull', seq: ++seq, reason: 'idle' }
    await nextTick()
    expect(w.findComponent({ name: 'UpgradeFunnel' }).props('quiet')).toBe(true)
    // Danger first.
    coachLesson.value = { id: 'survive', seq: ++seq, trial: { angle: 1, path: [], contacts: [], hits: 0, kills: 0, damage: 0, balls: 0, skills: [], breach: false, threatDamage: 1, threatKills: 0, rowsLeftAfter: 3 }, threats: [], skillAt: null }
    await nextTick()
    expect(w.findComponent({ name: 'UpgradeFunnel' }).exists()).toBe(false)
    w.unmount()
  })

  it('Silent Flow: never on a chip that has not flown in yet — it shows the moment the chip lands', async () => {
    r().chips.value = ['capacity']
    const w = render()
    upgradeFunnel.value = { target: 'damage', reason: 'damage', seq: ++seq }
    await nextTick()
    expect(w.findComponent({ name: 'UpgradeFunnel' }).exists()).toBe(false)
    r().chips.value = ['capacity', 'damage']
    await nextTick()
    expect(w.findComponent({ name: 'UpgradeFunnel' }).exists()).toBe(true)
    w.unmount()
  })
})

describe('the funnel rests (run 8: the arrows "stay up forever")', () => {
  beforeEach(() => {
    boardApi.value = stubBoard()
    playerAiming.value = false
    r().phase.value = 'aim'
    r().holdSim.value = false
    r().tutorialActive.value = false
    r().tutorialPreview.value = null
    r().unlocking.value = null
    r().modal.value = false
    r().reveal.value = null
    r().chips.value = ['damage', 'capacity', 'speed', 'luck', 'bounty']
    coachLesson.value = null
    upgradeFunnel.value = null
  })
  afterEach(() => {
    upgradeFunnel.value = null
    vi.useRealTimers()
  })

  it('shows for 10 s, rests for 20 s, and comes back while the chip is still unbought — across aim phases', async () => {
    vi.useFakeTimers()
    const w = render()
    const shown = () => w.findComponent({ name: 'UpgradeFunnel' }).exists()
    upgradeFunnel.value = { target: 'damage', reason: 'damage', seq: ++seq }
    await nextTick()
    expect(shown()).toBe(true)
    vi.advanceTimersByTime(10_300)
    await nextTick()
    expect(shown()).toBe(false)
    // The next aim phase's showing (a fresh seq, after a null gap) does not cut the rest short.
    upgradeFunnel.value = null
    await nextTick()
    upgradeFunnel.value = { target: 'damage', reason: 'damage', seq: ++seq }
    await nextTick()
    expect(shown()).toBe(false)
    vi.advanceTimersByTime(20_000)
    await nextTick()
    expect(shown()).toBe(true)
    // A funnel on a different chip starts a fresh cycle, up at once.
    vi.advanceTimersByTime(10_300)
    await nextTick()
    expect(shown()).toBe(false)
    upgradeFunnel.value = { target: 'capacity', reason: 'rich', seq: ++seq }
    await nextTick()
    expect(shown()).toBe(true)
    w.unmount()
  })
})

// Run 5: the playtest harness reads the coach's sentences by a stable marker,
// not by the (generic) sr-only / aria-live classes.
describe('harness marker on the live regions', () => {
  it('every sr-only live region of the coach overlay carries `data-coach-live`', async () => {
    const w = render()
    await nextTick()
    const regions = w.findAll('[aria-live]')
    // The lesson, the funnel, and (Silent Flow) the in-world cues.
    expect(regions.length).toBe(3)
    for (const el of regions) expect(el.attributes('data-coach-live')).toBeTruthy()
    w.unmount()
  })

  it("the chip spotlight's and the unlock fly-in's live regions carry it too", async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    for (const file of ['LessonSpotlight.vue', 'FeatureUnlockFx.vue']) {
      const src = readFileSync(resolve(__dirname, `../../../src/components/barrage/${file}`), 'utf8')
      const live = src.split('\n').filter((l) => l.includes('aria-live'))
      expect(live.length, file).toBeGreaterThan(0)
      for (const l of live) expect(l, file).toContain('data-coach-live')
    }
  })

  it('so does the death sequence\'s "WASTED" (run 7: a still frame must catch it)', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../../../src/components/barrage/DeathOverlay.vue'), 'utf8')
    expect(src).toContain('data-coach-live="death"')
  })
})

// Silent Flow: the staged lessons that carried a sentence (the first "+1",
// the first merges, the threat spotlight) are cues in the world now; their
// sentences are read out from the coach overlay's `cue` region.
describe('the in-world cues\' sentences', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    boardApi.value = stubBoard()
    coachCue.value = null
  })
  afterEach(() => { vi.useRealTimers() })

  const cueText = (w: ReturnType<typeof render>): string => w.find('[data-coach-live="cue"]').text()

  it('reads out the first "+1", a merge (with a discovery\'s codex line) and the threat cue', async () => {
    const w = render()
    sayCue({ kind: 'pickup' })
    await nextTick()
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(cueText(w)).toBe(en.barrage.tray.pickupSr)
    sayCue({ kind: 'merge', from: 1, to: 2, discovery: false })
    await nextTick()
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(cueText(w)).toBe(en.barrage.merge.sr.replace('{from}', '1').replace('{to}', '2'))
    sayCue({ kind: 'merge', from: 2, to: 3, discovery: true })
    await nextTick()
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(cueText(w)).toContain(en.barrage.merge.sr.replace('{from}', '2').replace('{to}', '3'))
    expect(cueText(w).length).toBeGreaterThan(en.barrage.merge.sr.length)
    sayCue({ kind: 'threat' })
    await nextTick()
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(cueText(w)).toBe(en.barrage.coach.spot.threat)
    w.unmount()
  })

  it('the same sentence twice in a row is announced twice (cleared in between)', async () => {
    const w = render()
    sayCue({ kind: 'threat' })
    await nextTick()
    vi.advanceTimersByTime(100)
    await nextTick()
    sayCue({ kind: 'threat' })
    await nextTick()
    expect(cueText(w)).toBe('')
    vi.advanceTimersByTime(100)
    await nextTick()
    expect(cueText(w)).toBe(en.barrage.coach.spot.threat)
    w.unmount()
  })
})
