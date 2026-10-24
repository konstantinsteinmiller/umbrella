// A CanvasRenderingContext2D stand-in that records every call and every
// property write, in order, with numbers rounded so float noise is not a diff.
// Used to prove that a drawing path is byte-for-byte what it was (the vector
// golden) and to see what the sprite layer draws.

const fmt = (v: unknown): string => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : String(v)
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(fmt).join(',')}]`
  if (v && typeof v === 'object') {
    const tag = (v as { __tag?: string }).__tag
    if (tag) return tag
    if (typeof (v as { width?: unknown }).width === 'number') return `<img ${(v as { width: number }).width}x${(v as { height?: number }).height ?? 0}>`
    return '{}'
  }
  return String(v)
}

export interface Recording {
  ctx: CanvasRenderingContext2D
  log: string[]
  /** Calls by method name (e.g. drawImage). */
  count: (name: string) => number
}

export const recordingCtx = (width = 1280, height = 720): Recording => {
  const log: string[] = []
  const props: Record<string, unknown> = {
    canvas: { width, height },
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low'
  }
  let gradients = 0
  const ctx = new Proxy({}, {
    get(_t, key: string) {
      if (key in props) return props[key]
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') {
        return (...args: unknown[]) => {
          const tag = `${key}#${gradients++}`
          log.push(`${key}(${args.map(fmt).join(',')})`)
          return { __tag: tag, addColorStop: (o: number, c: string) => log.push(`${tag}.stop(${fmt(o)},${fmt(c)})`), setTransform: () => log.push(`${tag}.setTransform`) }
        }
      }
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 })
      if (key === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })
      if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
      if (key === 'isPointInPath') return () => false
      return (...args: unknown[]) => { log.push(`${key}(${args.map(fmt).join(',')})`) }
    },
    set(_t, key: string, value: unknown) {
      props[key] = value
      log.push(`${key}=${fmt(value)}`)
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log, count: (name) => log.filter((l) => l.startsWith(`${name}(`)).length }
}
