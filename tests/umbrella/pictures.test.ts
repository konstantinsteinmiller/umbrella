import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { parseLevel, cloneLevel } from '@/umbrella/customLevels'
import { LEVELS, isImageId, type LevelDef } from '@/umbrella/levels'
import { arrowBox, drawArrow, drawPicture, pictureInset, setPictureImageSource } from '@/umbrella/pictureArt'
import { encodeCanvas, IMAGE_ACCEPT, imageIdsOf, looksLikeImage } from '@/umbrella/levelImages'
// @ts-expect-error plain .mjs without types
import { imageIdsIn } from '../../scripts/level-image-ids.mjs'

const ID = '0123456789abcdef01234567'
const base = (extra: Partial<LevelDef>): unknown => ({ ...cloneLevel(LEVELS[0]!), ...extra })

describe('standalone arrows and picture boards', () => {
  it('keeps a level\'s arrows and pictures through parseLevel', () => {
    const l = parseLevel(base({
      arrows: [{ x: 100, y: 200, size: 90, angle: 90 }, { x: 300, y: 200, size: 60 }],
      pictures: [{ x: 10, y: 10, w: 240, h: 160, image: ID }, { x: 400, y: 10, w: 100, h: 100, frame: false }]
    }))
    expect(l?.arrows).toHaveLength(2)
    expect(l?.pictures?.[0]?.image).toBe(ID)
    expect(l?.pictures?.[1]?.frame).toBe(false)
  })
  it('refuses junk: a bad image name, a flat arrow, a non-boolean frame', () => {
    expect(parseLevel(base({ pictures: [{ x: 0, y: 0, w: 10, h: 10, image: '../../etc/passwd' }] }))).toBeNull()
    expect(parseLevel(base({ pictures: [{ x: 0, y: 0, w: 10, h: 10, image: ID.toUpperCase() }] }))).toBeNull()
    expect(parseLevel(base({ arrows: [{ x: 0, y: 0, size: 0 }] }))).toBeNull()
    expect(parseLevel(base({ pictures: [{ x: 0, y: 0, w: 10, h: 10, frame: 'no' as unknown as boolean }] }))).toBeNull()
  })
  it('names images by 24 hex digits only', () => {
    expect(isImageId(ID)).toBe(true)
    expect(isImageId('abc')).toBe(false)
    expect(isImageId(`${ID}0`)).toBe(false)
    expect(isImageId(undefined)).toBe(false)
  })
  it('lists the image ids a level uses, once each ', () => {
    const l = { pictures: [{ image: ID }, { image: ID }, {}, { image: 'nope' }] }
    expect(imageIdsOf(l)).toEqual([ID])
  })
  it('finds the ids to bake for Poki / Playgama in the overrides and in levels the order carries as snapshots', () => {
    const other = 'fedcba9876543210fedcba98'
    const overrides = { 1: { pictures: [{ image: ID }] }, 2: { pictures: [{}, { image: 'nope' }] } }
    const order = { order: [{ snapshot: { id: 1001, pictures: [{ image: other }, { image: ID }] } }], chapters: [] }
    expect(imageIdsIn(overrides, order).sort()).toEqual([ID, other].sort())
    expect(imageIdsIn({}, null, undefined)).toEqual([])
  })
  it('takes a .webp the system gave no type (Windows often does) and refuses what is not a picture', () => {
    expect(looksLikeImage({ name: 'photo.webp', type: '' })).toBe(true)
    expect(looksLikeImage({ name: 'PHOTO.WEBP', type: 'application/octet-stream' })).toBe(true)
    expect(looksLikeImage({ name: 'a.png', type: 'image/png' })).toBe(true)
    expect(looksLikeImage({ name: 'notes.txt', type: '' })).toBe(false)
    expect(looksLikeImage({ name: 'clip.webp', type: 'video/webm' })).toBe(false)
    expect(IMAGE_ACCEPT).toContain('.webp')
  })
  it('pads a board by its own setting: default, none (the image fills it), or a size; never on a bare picture', () => {
    const b = { x: 0, y: 0, w: 240, h: 160 }
    expect(pictureInset(b)).toBe(14)
    expect(pictureInset({ ...b, pad: 0 })).toBe(0)
    expect(pictureInset({ ...b, pad: 30 })).toBe(30)
    expect(pictureInset({ ...b, pad: 500 })).toBe(64) // at most 40 % of the short side
    expect(pictureInset({ ...b, pad: 30, frame: false })).toBe(0)
    expect(parseLevel(base({ pictures: [{ ...b, pad: 0 }, { ...b, pad: 20 }] }))?.pictures?.[1]?.pad).toBe(20)
    expect(parseLevel(base({ pictures: [{ ...b, pad: -1 }] }))).toBeNull()
    expect(parseLevel(base({ pictures: [{ ...b, pad: 'x' as unknown as number }] }))).toBeNull()
  })
  it('selects a turned arrow by a square around its centre', () => {
    expect(arrowBox({ x: 100, y: 50, size: 80, angle: 45 })).toEqual({ x: 60, y: 10, w: 80, h: 80 })
  })
})

/** A recording context: counts the calls that matter and fails on none. */
const fakeCtx = () => {
  const calls: string[] = []
  const grad = { addColorStop: () => undefined }
  return new Proxy({ calls }, {
    get: (t, k: string) => {
      if (k === 'calls') return t.calls
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad
      return (..._a: unknown[]) => { calls.push(k) }
    },
    set: () => true
  }) as unknown as CanvasRenderingContext2D & { calls: string[] }
}

describe('drawing them', () => {
  it('draws an arrow at any angle, and a picture empty or filled', () => {
    for (const angle of [0, 90, 180, 270, 33]) {
      const c = fakeCtx()
      drawArrow(c, { x: 10, y: 10, size: 80, angle }, 1.2)
      expect(c.calls).toContain('rotate')
    }
    const empty = fakeCtx()
    drawPicture(empty, { x: 0, y: 0, w: 200, h: 140 }, 0)
    expect(empty.calls).not.toContain('drawImage')
    const img = { naturalWidth: 400, naturalHeight: 200 } as unknown as CanvasImageSource
    setPictureImageSource(() => img)
    const filled = fakeCtx()
    drawPicture(filled, { x: 0, y: 0, w: 200, h: 140, image: ID }, 0)
    expect(filled.calls).toContain('drawImage')
    // No padding: the picture runs to the board's edge, clipped to its corners.
    const edge = fakeCtx()
    drawPicture(edge, { x: 0, y: 0, w: 200, h: 140, image: ID, pad: 0 }, 0)
    expect(edge.calls).toContain('clip')
    expect(edge.calls).toContain('drawImage')
    const bare = fakeCtx()
    drawPicture(bare, { x: 0, y: 0, w: 200, h: 140, image: ID, frame: false }, 0)
    expect(bare.calls).toContain('drawImage')
    // No paper board: only the picture and the ropes' knots.
    expect(bare.calls.filter((c) => c === 'roundRect')).toHaveLength(0)
    setPictureImageSource(() => null)
  })
})

/** A canvas whose toBlob answers by a rule: what a browser makes of a request for `type`. */
const fakeCanvas = (answer: (type: string, q?: number) => { type: string; size: number } | null) => ({
  width: 10, height: 10,
  getContext: () => ({ save: () => undefined, restore: () => undefined, fillRect: () => undefined, set globalCompositeOperation(_v: string) {}, set fillStyle(_v: string) {} }),
  toBlob: (cb: (b: Blob | null) => void, type?: string, q?: number) => {
    const a = answer(type ?? 'image/png', q)
    cb(a ? ({ type: a.type, size: a.size } as unknown as Blob) : null)
  }
}) as unknown as HTMLCanvasElement

describe('encoding the picture (Safari cannot encode WebP)', () => {
  it('takes a WebP where the browser makes one, lowering the quality until it is small', async () => {
    const b = await encodeCanvas(fakeCanvas((t, q) => ({ type: t, size: q! > 0.8 ? 900_000 : 200_000 })))
    expect(b.type).toBe('image/webp')
  })
  it('keeps the PNG Safari answers with when it is small (transparency survives)', async () => {
    const b = await encodeCanvas(fakeCanvas(() => ({ type: 'image/png', size: 120_000 })))
    expect(b.type).toBe('image/png')
  })
  it('falls back to a JPEG when that PNG is too big, and refuses what no encoding makes small enough', async () => {
    const jpeg = await encodeCanvas(fakeCanvas((t, q) => (t === 'image/jpeg' ? { type: t, size: q! > 0.7 ? 900_000 : 150_000 } : { type: 'image/png', size: 2_000_000 })))
    expect(jpeg.type).toBe('image/jpeg')
    await expect(encodeCanvas(fakeCanvas((t) => ({ type: t === 'image/jpeg' ? t : 'image/png', size: 9_000_000 })))).rejects.toThrow('size')
    await expect(encodeCanvas(fakeCanvas(() => null))).rejects.toThrow('encode')
  })
})

describe('arrow tool copy', () => {
  it('is in every shipped locale', () => {
    const dir = 'src/i18n/locales'
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(`${dir}/${f}`, 'utf8')
      expect(src.match(/'arrow': ".+"/g)?.length, f).toBe(3)
      expect(src, f).toMatch(/'size': ".+"/)
    }
  })
})
