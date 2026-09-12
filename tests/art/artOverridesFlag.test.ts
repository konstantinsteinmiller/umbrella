import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * ─── The art flag ───────────────────────────────────────────────────────────
 *
 * Painted art is ON unless the build says otherwise, and the flag turns it OFF
 * live — the /playground's painted ⇄ drawn button, and the build-level kill
 * switch for art that turns out worse than the drawing it replaced. Every
 * consumer reads `artSrc()` reactively, so the flag IS the cache contract:
 * a flip must change what `artSrc` answers, and nothing else is cached.
 */

/** An Image that "decodes" the instant it is given a src. */
class InstantImage {
  naturalWidth = 0
  onload: (() => void) | null = null
  private _src = ''
  get src(): string { return this._src }
  set src(v: string) {
    this._src = v
    this.naturalWidth = 256
    queueMicrotask(() => this.onload?.())
  }
}

const load = async (env: Record<string, string> = {}) => {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  vi.stubGlobal('Image', InstantImage)
  vi.doMock('@/use/usePublicManifest', () => ({
    publicAssetExists: (p: string) => p === 'images/units/fighter-1.webp'
  }))
  vi.doMock('@/use/useAssets', () => ({ resourceCache: { images: new Map() } }))
  const m = await import('@/use/useArtOverrides')
  m.probeArtOverrides()
  await Promise.resolve()
  await Promise.resolve()
  return m
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('@/use/usePublicManifest')
  vi.doUnmock('@/use/useAssets')
})

describe('the art flag', () => {
  it('is on by default and resolves a shipped slot', async () => {
    const m = await load()
    expect(m.artOverridesEnabled.value).toBe(true)
    expect(m.artSrc('fighter-1')).toMatch(/images\/units\/fighter-1\.webp$/)
    // An unfilled slot is never requested and stays on its drawing.
    expect(m.artSrc('fighter-2')).toBeNull()
  })

  it('flips live: off answers null, on answers the painting again', async () => {
    const m = await load()
    m.setArtOverrides(false)
    expect(m.artSrc('fighter-1')).toBeNull()
    m.setArtOverrides(true)
    expect(m.artSrc('fighter-1')).not.toBeNull()
  })

  it('is killed by the build flag', async () => {
    const m = await load({ VITE_ENABLE_ART_OVERRIDES: 'false' })
    expect(m.artOverridesEnabled.value).toBe(false)
    expect(m.artSrc('fighter-1')).toBeNull()
  })

  it('re-probes cache-busted, so a re-sliced file of the same name is refetched', async () => {
    const m = await load()
    m.refreshArtOverrides()
    await Promise.resolve()
    await Promise.resolve()
    expect(m.artSrc('fighter-1')).toMatch(/fighter-1\.webp\?v=1$/)
  })
})
