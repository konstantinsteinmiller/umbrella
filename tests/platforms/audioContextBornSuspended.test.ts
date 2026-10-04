// An AudioContext created lazily WHILE an ad holds the audio suspend must come
// up suspended. A fresh context starts `running`, so without this it is audible
// underneath the ad (seen on the GameMonetize build: the first-load
// interstitial opened before the first SFX created the context).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeCtx {
  state: 'running' | 'suspended' = 'running'
  suspend = vi.fn(async () => { this.state = 'suspended' })
  resume = vi.fn(async () => { this.state = 'running' })
}

describe('getAudioContext under a suspend', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('AudioContext', FakeCtx) })
  afterEach(() => vi.unstubAllGlobals())

  it('a context born under a suspend is suspended, and resumes with the last resume', async () => {
    const a = await import('@/use/useAssets')
    a.suspendAllAudio() // the ad is up, no context yet
    const ctx = a.getAudioContext() as unknown as FakeCtx
    expect(ctx.suspend).toHaveBeenCalledTimes(1)
    expect(ctx.state).toBe('suspended')
    a.resumeAllAudio()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.state).toBe('running')
  })

  it('a context born with no suspend active is left running', async () => {
    const a = await import('@/use/useAssets')
    const ctx = a.getAudioContext() as unknown as FakeCtx
    expect(ctx.suspend).not.toHaveBeenCalled()
    expect(ctx.state).toBe('running')
  })
})
