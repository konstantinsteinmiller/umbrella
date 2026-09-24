// The "+N" pop at the wallet. Play-test: nobody noticed coins arriving. Every
// increase pops "+N" at the counter once the coin has flown up (~0.4 s after
// the wallet counts it), increases close together add into one pop, and a
// save hydrate rewriting the wallet is not income.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import useEpicConfig from '@/use/useEpicConfig'
import { saveDataVersion } from '@/use/useSaveStatus'
import { pulseWallet } from '@/components/barrage/barrageUi'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const { addCoins, spendCoins } = useEpicConfig()

const render = (landMs = 400) => mount(CoinBadge, { props: { landMs }, global: { plugins: [i18n] } })
const gainText = (w: ReturnType<typeof mount>): string | null => {
  const el = w.find('.coin-badge__gain')
  return el.exists() ? el.text() : null
}
/** The wallet watcher is pre-flush: let it run before the clock moves. */
const gain = async (n: number): Promise<void> => {
  addCoins(n)
  await nextTick()
}
const tick = async (ms: number): Promise<void> => {
  vi.advanceTimersByTime(ms)
  await nextTick()
}

describe('wallet "+N" pop', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] }) })
  afterEach(() => { vi.useRealTimers() })

  it('pops once the coin has landed, then goes away', async () => {
    const w = render()
    await tick(1000) // clear of any hydrate window from module init
    await gain(5)
    await tick(300)
    expect(gainText(w)).toBeNull()
    await tick(150)
    expect(gainText(w)).toBe('+5')
    await tick(1000)
    expect(gainText(w)).toBeNull()
    w.unmount()
  })

  it('waits as long as the scene says the coin takes (first session: kill hold + flight)', async () => {
    const w = render(1050)
    await tick(1000)
    await gain(5)
    await tick(1000)
    expect(gainText(w)).toBeNull()
    await tick(100)
    expect(gainText(w)).toBe('+5')
    w.unmount()
  })

  it('increases within 250 ms merge into one pop; a later one starts a new pop', async () => {
    const w = render()
    await tick(1000)
    await gain(3)
    await tick(100)
    await gain(4)
    await tick(120)
    await gain(1)
    await tick(500)
    expect(w.findAll('.coin-badge__gain')).toHaveLength(1)
    expect(gainText(w)).toBe('+8')
    await tick(2000)
    await gain(2)
    await tick(450)
    expect(gainText(w)).toBe('+2')
    w.unmount()
  })

  it('spending and hydrating never pop', async () => {
    const w = render()
    await tick(1000)
    await gain(50)
    await tick(2000)
    expect(gainText(w)).toBeNull()
    spendCoins(20)
    await nextTick()
    await tick(500)
    expect(gainText(w)).toBeNull()
    saveDataVersion.value++
    await nextTick()
    await gain(1000) // stands in for the hydrated wallet landing right after
    await tick(500)
    expect(gainText(w)).toBeNull()
    w.unmount()
  })
})

// A refused upgrade (UpgradeBar) points at what is short: the wallet itself.
describe('wallet "not enough" pulse', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] }) })
  afterEach(() => { vi.useRealTimers() })

  it('pulses red once per refusal, restarts on a second one, then settles', async () => {
    const w = render()
    const badge = () => w.find('.coin-badge')
    expect(badge().classes()).not.toContain('coin-badge--denied')
    pulseWallet()
    await nextTick()
    vi.advanceTimersToNextFrame()
    await nextTick()
    expect(badge().classes()).toContain('coin-badge--denied')
    await tick(400)
    pulseWallet()
    await nextTick()
    vi.advanceTimersToNextFrame()
    await nextTick()
    await tick(500) // 900 ms after the first, 500 after the second: still on
    expect(badge().classes()).toContain('coin-badge--denied')
    await tick(300)
    expect(badge().classes()).not.toContain('coin-badge--denied')
    w.unmount()
  })
})
