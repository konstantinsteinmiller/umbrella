/**
 * ─── Elder Futhark runes, as stroke paths ───────────────────────────────────
 *
 * The decorative inscriptions on the upgrade chips' inset border. Drawn as
 * paths rather than typed as Unicode (U+16A0–U+16FF): the Runic block ships in
 * almost no phone font, so the "same" text rendered as tofu boxes on half the
 * devices it was meant to decorate. Paths also let one stroke colour, glow and
 * scale follow the chip exactly.
 *
 * Every glyph lives in a 6 × 10 unit box (x 0–6, y 0–10) as a list of
 * polylines — Futhark is all straight strokes, which is also why it survives
 * being drawn 4px tall.
 *
 * Purely ornamental: the inscriptions are English upgrade names transliterated
 * for flavour ("WAR HORNS" → ᚹᚨᚱ᛫ᚺᛟᚱᚾᛊ), never read by anyone, always
 * `aria-hidden` — so they are not user-facing copy and do not go through i18n.
 */

type Pt = readonly [number, number]
type Glyph = readonly (readonly Pt[])[]

export const GLYPH_W = 6
export const GLYPH_H = 10

export const RUNES: Readonly<Record<string, Glyph>> = {
  f: [[[1, 0], [1, 10]], [[1, 4.5], [5, 1.6]], [[1, 2], [4, 0]]], // ᚠ fehu
  u: [[[1, 10], [1, 0], [5, 3.6], [5, 10]]], // ᚢ uruz
  th: [[[1, 0], [1, 10]], [[1, 2.4], [4.8, 5], [1, 7.6]]], // ᚦ thurisaz
  a: [[[1, 0], [1, 10]], [[1, 0.2], [5, 3]], [[1, 3.6], [5, 6.4]]], // ᚨ ansuz
  r: [[[1, 10], [1, 0], [4.8, 2.5], [1, 5], [5, 10]]], // ᚱ raido
  k: [[[5, 1], [1, 5], [5, 9]]], // ᚲ kaunan
  g: [[[0.8, 1], [5.2, 9]], [[5.2, 1], [0.8, 9]]], // ᚷ gebo
  w: [[[1, 10], [1, 0], [4.8, 2.5], [1, 5]]], // ᚹ wunjo
  h: [[[1, 0], [1, 10]], [[5, 0], [5, 10]], [[1, 3], [5, 6.6]]], // ᚺ hagalaz
  n: [[[3, 0], [3, 10]], [[1, 3.4], [5, 6.2]]], // ᚾ naudiz
  i: [[[3, 0], [3, 10]]], // ᛁ isa
  j: [[[2.6, 1.4], [0.8, 3.4], [2.6, 5.4]], [[3.4, 4.6], [5.2, 6.6], [3.4, 8.6]]], // ᛃ jera
  p: [[[1, 0], [1, 10]], [[1, 0.2], [4.8, 2.4], [4.8, 4]], [[1, 9.8], [4.8, 7.6], [4.8, 6]]], // ᛈ perth
  z: [[[3, 10], [3, 0]], [[3, 4], [0.6, 0.8]], [[3, 4], [5.4, 0.8]]], // ᛉ algiz
  s: [[[4.8, 0], [1.2, 4], [4.8, 6], [1.2, 10]]], // ᛊ sowilo
  t: [[[3, 10], [3, 0]], [[0.6, 3], [3, 0], [5.4, 3]]], // ᛏ tiwaz
  b: [[[1, 0], [1, 10]], [[1, 0.2], [4.8, 2.6], [1, 5], [4.8, 7.4], [1, 9.8]]], // ᛒ berkano
  e: [[[1, 10], [1, 0], [3, 3], [5, 0], [5, 10]]], // ᛖ ehwaz
  m: [[[1, 10], [1, 0], [5, 4]], [[5, 10], [5, 0], [1, 4]]], // ᛗ mannaz
  l: [[[1, 10], [1, 0], [5, 3.2]]], // ᛚ laguz
  ng: [[[3, 1.2], [5.4, 5], [3, 8.8], [0.6, 5], [3, 1.2]]], // ᛜ ingwaz
  d: [[[0.8, 1], [0.8, 9], [5.2, 1], [5.2, 9], [0.8, 1]]], // ᛞ dagaz
  o: [[[3, 0], [5.2, 3.3], [0.8, 8.6]], [[3, 0], [0.8, 3.3], [5.2, 8.6]]], // ᛟ othala
  sep: [[[3, 4.3], [3.7, 5], [3, 5.7], [2.3, 5], [3, 4.3]]] // ᛫ word divider
}

/** Latin → rune keys. Digraphs first (TH, NG), then letter by letter; a space
 *  or any punctuation becomes the word divider. Letters Futhark lacks borrow
 *  the traditional stand-ins (C/Q → K, V → W, Y → J, X → K S). */
export const transliterate = (text: string): string[] => {
  const out: string[] = []
  const s = text.toLowerCase()
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2)
    if (two === 'th' || two === 'ng') { out.push(two); i++; continue }
    const c = s[i]!
    if (c === 'c' || c === 'q') out.push('k')
    else if (c === 'v') out.push('w')
    else if (c === 'y') out.push('j')
    else if (c === 'x') out.push('k', 's')
    else if (RUNES[c]) out.push(c)
    else if (out.length && out[out.length - 1] !== 'sep') out.push('sep')
  }
  return out
}

/**
 * How tall the runes on a chip `chipH` px tall are drawn: ≈8.5 % of the chip,
 * never under 3px (9 device px on a DPR-3 phone — still unmistakably runes) nor
 * over 6.2px (past that a desktop chip's border starts to look like a label).
 */
export const runeHeightFor = (chipH: number): number =>
  Math.min(6.2, Math.max(3, chipH * 0.085))

/** Where the frame line (and the runes' centre line) sits, from the chip's edge:
 *  the runes' top edge 1px inside the chip's padding box. */
export const runeInsetFor = (chipH: number): number => runeHeightFor(chipH) / 2 + 1

/**
 * The band at the chip's top and bottom edge that belongs to the runes: the
 * chip's content keeps this much vertical padding, so the inscription and the
 * name / cost can never touch. One formula for both sides of that contract.
 *
 * Measured against the tightest real chip (42px, a 360×640 phone): this leaves
 * 28px between the bands for the name (11), pips (4) and cost (12) rows.
 */
export const runeZoneFor = (chipH: number): number => runeInsetFor(chipH) + runeHeightFor(chipH) / 2 + 0.8

/** Round to 2 decimals — keeps the generated path strings short. */
const r2 = (n: number): number => Math.round(n * 100) / 100

/** One glyph's polylines as path commands, placed with its box's top-left at
 *  (x, y) and scaled to `h` px tall. */
export const glyphPath = (key: string, x: number, y: number, h: number): string => {
  const glyph = RUNES[key]
  if (!glyph) return ''
  const k = h / GLYPH_H
  return glyph.map((line) => line
    .map(([gx, gy], j) => `${j === 0 ? 'M' : 'L'}${r2(x + gx * k)} ${r2(y + gy * k)}`)
    .join('')).join('')
}

export interface RuneBand {
  /** All runes of the band as ONE path (cheap to render, one stroke). */
  d: string
  /** Where the band actually starts and ends (x), for breaking the frame line. */
  from: number
  to: number
  count: number
}

/**
 * Lay a run of runes along a horizontal band, centred between `x0` and `x1`
 * on the line `yc`, glyphs `h` px tall.
 *
 * As many WHOLE runes as fit, never a clipped one, the sequence continuing from
 * `offset` into `keys` (cycling, with a divider between repeats) so a chip's
 * top and bottom bands read as one continuous inscription.
 */
export const layoutBand = (
  keys: readonly string[], x0: number, x1: number, yc: number, h: number, offset = 0
): RuneBand & { next: number } => {
  const w = (h * GLYPH_W) / GLYPH_H
  const gap = w * 0.5
  const pitch = w + gap
  const count = Math.max(0, Math.floor((x1 - x0 + gap) / pitch))
  if (count === 0 || keys.length === 0) return { d: '', from: 0, to: 0, count: 0, next: offset }
  const used = count * pitch - gap
  const start = x0 + (x1 - x0 - used) / 2
  // The inscription plus one divider, cycled.
  const cycle = keys[keys.length - 1] === 'sep' ? keys : [...keys, 'sep']
  let d = ''
  for (let n = 0; n < count; n++) {
    d += glyphPath(cycle[(offset + n) % cycle.length]!, start + n * pitch, yc - h / 2, h)
  }
  return { d, from: start, to: start + used, count, next: offset + count }
}
