import { beforeEach, describe, expect, it, vi } from 'vitest'

// The modal-open signal that drives the CrazyGames gameplayStart/gameplayStop
// lifecycle: `MawScene` treats gameplay as active only while a match is
// running (`phase === 'playing'`) AND no modal is open. This covers the
// refcount semantics that let stacked modals compose correctly.

beforeEach(() => {
  vi.resetModules()
})

describe('useModalState', () => {
  it('tracks open modals and only clears once the LAST one closes (stacked)', async () => {
    const { isAnyModalOpen, acquireModalOpen } = await import('@/use/useModalState')
    expect(isAnyModalOpen.value).toBe(false)

    const releaseA = acquireModalOpen()
    expect(isAnyModalOpen.value).toBe(true)

    const releaseB = acquireModalOpen() // a second modal stacks on top
    expect(isAnyModalOpen.value).toBe(true)

    releaseA()
    expect(isAnyModalOpen.value).toBe(true) // B still open → gameplay stays stopped

    releaseB()
    expect(isAnyModalOpen.value).toBe(false) // last one closed → gameplay can resume
  })

  it('release is idempotent and never drives the count negative', async () => {
    const { isAnyModalOpen, acquireModalOpen } = await import('@/use/useModalState')

    const release = acquireModalOpen()
    release()
    release() // double release must not underflow
    expect(isAnyModalOpen.value).toBe(false)

    // A fresh acquire after an over-release still flips the signal correctly.
    const release2 = acquireModalOpen()
    expect(isAnyModalOpen.value).toBe(true)
    release2()
    expect(isAnyModalOpen.value).toBe(false)
  })

  // The welcome-back claim opens ~1.2s into a returning player's boot. It must
  // still freeze the sim, but must NOT emit a CG gameplayStop/gameplayStart pair
  // right behind the launch gameplayStart — CG QA flagged that as overkill.
  it('opting out of the gameplay lifecycle still pauses but leaves CG untouched', async () => {
    const { isAnyModalOpen, isGameplayInterruptingModalOpen, acquireModalOpen } =
      await import('@/use/useModalState')

    const release = acquireModalOpen({ firesGameplayLifecycle: false })
    expect(isAnyModalOpen.value).toBe(true)               // sim freezes
    expect(isGameplayInterruptingModalOpen.value).toBe(false) // CG stays quiet

    release()
    expect(isAnyModalOpen.value).toBe(false)
    expect(isGameplayInterruptingModalOpen.value).toBe(false)
  })

  it('an opted-out modal never suppresses a normal one stacked on top of it', async () => {
    const { isGameplayInterruptingModalOpen, acquireModalOpen } =
      await import('@/use/useModalState')

    const releaseQuiet = acquireModalOpen({ firesGameplayLifecycle: false })
    const releaseLoud = acquireModalOpen() // player opens a menu over the claim
    expect(isGameplayInterruptingModalOpen.value).toBe(true)

    releaseQuiet()
    expect(isGameplayInterruptingModalOpen.value).toBe(true) // the menu is still up

    releaseLoud()
    expect(isGameplayInterruptingModalOpen.value).toBe(false)
  })

  it('double-releasing an opted-out modal cannot underflow the lifecycle count', async () => {
    const { isGameplayInterruptingModalOpen, acquireModalOpen } =
      await import('@/use/useModalState')

    const release = acquireModalOpen({ firesGameplayLifecycle: false })
    release()
    release()
    // A leaked decrement here would make the NEXT real modal fail to report.
    const releaseNext = acquireModalOpen()
    expect(isGameplayInterruptingModalOpen.value).toBe(true)
    releaseNext()
    expect(isGameplayInterruptingModalOpen.value).toBe(false)
  })
})
