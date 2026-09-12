/**
 * ─── The elemental tiers' drawings (21-50) ──────────────────────────────────
 *
 * Every elemental tier is DRAWN here as inline SVG (a 100×100 box) before any
 * painting exists, and the drawing does two jobs:
 *
 *   1. the in-game look until `images/units/fighter-<tier>.webp` lands
 *      (IngredientUnit renders it in place of the generic face-in-a-square);
 *   2. the REFERENCE the art pipeline sends to the image model. The pipeline's
 *      rule: the reference is the only thing that carries a design between
 *      generations — a new subject over an old bitmap comes back as the old
 *      subject. So each unit's silhouette, parts and colours are fixed HERE,
 *      and the prompt only asks for the painted finish.
 *
 * House rules for every drawing: bold near-black outlines, saturated fills with
 * one gradient step and one gloss, an expressive cartoon face — and NO LEGS OR
 * FEET: every elemental floats, its lower edge ending in a wisp, drip, tail,
 * trail or flame, so the idle bob and merge squash read as it hovering. The
 * bottom-right quarter stays clear of faces: the game paints the tier badge
 * there.
 *
 * PURE: no Vue, no DOM — read by the game, the `/art-sheets` bench and tests.
 */

const INK = '#141018'
const f = (n: number): number => Math.round(n * 100) / 100
/** Outline attributes at weight `w` (the painted units run 3–5 px at 256). */
const o = (w = 3.2): string => `stroke="${INK}" stroke-width="${f(w)}" stroke-linejoin="round" stroke-linecap="round"`

type Stop = [offset: number, color: string, opacity?: number]
const stops = (s: Stop[]): string =>
  s.map(([off, c, op]) => `<stop offset="${off}" stop-color="${c}"${op === undefined ? '' : ` stop-opacity="${op}"`}/>`).join('')
const lin = (id: string, s: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(s)}</linearGradient>`
const rad = (id: string, s: Stop[], cx = 0.38, cy = 0.32, r = 0.8): string =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops(s)}</radialGradient>`
const url = (id: string): string => `url(#${id})`

// ─── Faces ──────────────────────────────────────────────────────────────────

export type FaceKind = 'fierce' | 'grin' | 'calm' | 'smug' | 'glow'

/** The house face, centred on (cx, cy) at scale `s` (1 ≈ 36 units wide).
 *  `mouth` recolours a glowing face's mouth — an ink line vanishes on a body
 *  as dark as the void tiers'. */
const face = (cx: number, cy: number, s = 1, kind: FaceKind = 'fierce', glow = '#9ff3ff', mouth = INK): string => {
  const L = cx - 9 * s
  const R = cx + 9 * s
  const p = (x: number, y: number): string => `${f(x)} ${f(y)}`
  let out = ''
  if (kind === 'glow') {
    const eye = (x: number, d: 1 | -1): string =>
      `<path d="M${p(x - 6 * s * d, cy - 3 * s)} L${p(x + 5.5 * s * d, cy + 0.5 * s)} L${p(x + 4.5 * s * d, cy + 4 * s)} L${p(x - 5 * s * d, cy + 2 * s)} Z" fill="${glow}" ${o(2.4 * s)}/>`
    out += eye(L, 1) + eye(R, -1)
    out += `<path d="M${p(cx - 5 * s, cy + 12 * s)} Q${p(cx, cy + 9 * s)} ${p(cx + 5 * s, cy + 12 * s)}" fill="none" stroke="${mouth}" stroke-width="${f(2.8 * s)}" stroke-linecap="round"/>`
    return out
  }
  if (kind === 'calm') {
    for (const x of [L, R]) out += `<path d="M${p(x - 5.5 * s, cy)} Q${p(x, cy + 4.5 * s)} ${p(x + 5.5 * s, cy)}" fill="none" ${o(3 * s)}/>`
    out += `<path d="M${p(cx - 6 * s, cy + 10 * s)} Q${p(cx, cy + 15 * s)} ${p(cx + 6 * s, cy + 10 * s)}" fill="none" ${o(3 * s)}/>`
    return out
  }
  for (const x of [L, R]) out += `<ellipse cx="${f(x)}" cy="${f(cy)}" rx="${f(6 * s)}" ry="${f(7 * s)}" fill="#fff" ${o(2.6 * s)}/>`
  out += `<circle cx="${f(L + 1.6 * s)}" cy="${f(cy + 1.4 * s)}" r="${f(3.1 * s)}" fill="#101018"/>`
  out += `<circle cx="${f(R - 1.6 * s)}" cy="${f(cy + 1.4 * s)}" r="${f(3.1 * s)}" fill="#101018"/>`
  out += `<circle cx="${f(L + 0.6 * s)}" cy="${f(cy - 0.4 * s)}" r="${f(1.1 * s)}" fill="#fff"/>`
  out += `<circle cx="${f(R - 2.6 * s)}" cy="${f(cy - 0.4 * s)}" r="${f(1.1 * s)}" fill="#fff"/>`
  if (kind === 'smug') {
    out += `<path d="M${p(L - 6 * s, cy - 2.6 * s)} L${p(L + 6 * s, cy - 2.6 * s)} M${p(R - 6 * s, cy - 2.6 * s)} L${p(R + 6 * s, cy - 2.6 * s)}" ${o(2.8 * s)}/>`
    out += `<path d="M${p(L - 6 * s, cy - 10 * s)} Q${p(L, cy - 14 * s)} ${p(L + 6 * s, cy - 10.5 * s)}" fill="none" ${o(3.2 * s)}/>`
    out += `<path d="M${p(R - 6 * s, cy - 9 * s)} L${p(R + 6 * s, cy - 9.5 * s)}" ${o(3.2 * s)}/>`
    out += `<path d="M${p(cx - 5 * s, cy + 12 * s)} Q${p(cx + 1 * s, cy + 15 * s)} ${p(cx + 7 * s, cy + 9.5 * s)}" fill="none" ${o(3 * s)}/>`
    return out
  }
  const lift = kind === 'grin' ? 7.5 : 6
  out += `<path d="M${p(L - 7 * s, cy - 10 * s)} L${p(L + 5 * s, cy - lift * s)} M${p(R + 7 * s, cy - 10 * s)} L${p(R - 5 * s, cy - lift * s)}" ${o(3.4 * s)}/>`
  if (kind === 'grin') {
    out += `<path d="M${p(cx - 8.5 * s, cy + 9 * s)} Q${p(cx, cy + 20 * s)} ${p(cx + 8.5 * s, cy + 9 * s)} Z" fill="#3a0a14" ${o(2.6 * s)}/>`
    out += `<path d="M${p(cx - 7 * s, cy + 9.8 * s)} Q${p(cx, cy + 13 * s)} ${p(cx + 7 * s, cy + 9.8 * s)} Z" fill="#fff"/>`
  } else {
    out += `<path d="M${p(cx - 6.5 * s, cy + 13 * s)} Q${p(cx, cy + 8.5 * s)} ${p(cx + 6.5 * s, cy + 13 * s)}" fill="none" ${o(3 * s)}/>`
  }
  return out
}

// ─── Small parts ────────────────────────────────────────────────────────────

/** A four-point sparkle. */
const spark = (x: number, y: number, r: number, c: string): string => {
  const k = r * 0.2
  return `<path d="M${f(x)} ${f(y - r)} Q${f(x + k)} ${f(y - k)} ${f(x + r)} ${f(y)} Q${f(x + k)} ${f(y + k)} ${f(x)} ${f(y + r)} Q${f(x - k)} ${f(y + k)} ${f(x - r)} ${f(y)} Q${f(x - k)} ${f(y - k)} ${f(x)} ${f(y - r)} Z" fill="${c}" ${o(1.3)}/>`
}
/** A soft white gloss. */
const gloss = (cx: number, cy: number, rx: number, ry: number, rot = -25, op = 0.75): string =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#fff" opacity="${op}"/>`
/** A polygon path through `pts`. */
const poly = (pts: [number, number][]): string => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L')} Z`
/** Points of an n-armed star (outer R, inner r), first arm pointing `rot`°. */
const starPts = (cx: number, cy: number, R: number, r: number, n = 5, rot = -90): [number, number][] =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180
    const d = i % 2 === 0 ? R : r
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]
  })
/** A cog: `teeth` flat-topped teeth between radius r and R. */
const gearPath = (cx: number, cy: number, R: number, r: number, teeth: number): string => {
  const pts: [number, number][] = []
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = i * step - Math.PI / 2
    for (const [da, d] of [[-0.3, r], [-0.18, R], [0.18, R], [0.3, r]] as [number, number][]) {
      pts.push([cx + Math.cos(a + da * step) * d, cy + Math.sin(a + da * step) * d])
    }
  }
  return poly(pts)
}
/** A six-armed snowflake, ink-backed so it holds on any ground. */
const snow = (x: number, y: number, r: number): string => {
  const d = [0, 60, 120].map((a) => {
    const dx = Math.cos((a * Math.PI) / 180) * r
    const dy = Math.sin((a * Math.PI) / 180) * r
    return `M${f(x - dx)} ${f(y - dy)} L${f(x + dx)} ${f(y + dy)}`
  }).join(' ')
  return `<path d="${d}" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="${d}" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>`
}
/** Thorns / rays: triangles around a circle. */
const rays = (cx: number, cy: number, r0: number, r1: number, n: number, half: number, fill: string, w = 2, rot = 0): string =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180
    const h = (half * Math.PI) / 180
    const p = (ang: number, d: number): [number, number] => [cx + Math.cos(ang) * d, cy + Math.sin(ang) * d]
    return `<path d="${poly([p(a - h, r0), p(a, r1), p(a + h, r0)])}" fill="${fill}" ${o(w)}/>`
  }).join('')

type Draw = (u: string) => string

// ─── 21-30 ──────────────────────────────────────────────────────────────────

const DRAWINGS: Record<number, Draw> = {
  // 21 · Steel Sentinel — a riveted steel orb with a dark visor, two floating
  // gauntlets, and a cyan thruster flame where feet would be.
  21: (u) => `<defs>${rad(u + 'a', [[0, '#f4f8fc'], [0.55, '#aab5c2'], [1, '#5f6b7a']], 0.36, 0.3, 0.75)}${lin(u + 'b', [[0, '#dfe6ee'], [1, '#6a7686']])}</defs>
    <path d="M40 76 Q50 99 60 76 Z" fill="#7fe8ff" ${o(2.6)}/><path d="M45 77 Q50 90 55 77 Z" fill="#e8fdff"/>
    <path d="M44 16 L50 5 L56 16 Z" fill="#9aa6b5" ${o(3)}/>
    <circle cx="50" cy="46" r="31" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M22 60 Q50 76 78 60" fill="none" stroke="#3e4754" stroke-width="2.2"/>
    ${[[27, 64], [38, 68.5], [50, 70], [62, 68.5], [73, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9" fill="#e6ecf2" ${o(1.2)}/>`).join('')}
    <rect x="24" y="35" width="52" height="17" rx="8.5" fill="#1b2130" ${o(3)}/>
    ${face(50, 43.5, 0.9, 'glow', '#7ff6ff')}
    ${gloss(37, 25, 10, 5.5)}
    <rect x="2" y="36" width="17" height="21" rx="6" fill="${url(u + 'b')}" ${o(3)}/><path d="M6.5 40.5 V45 M10.5 40.5 V45 M14.5 40.5 V45" ${o(1.8)}/>
    <rect x="81" y="36" width="17" height="21" rx="6" fill="${url(u + 'b')}" ${o(3)}/><path d="M85.5 40.5 V45 M89.5 40.5 V45 M93.5 40.5 V45" ${o(1.8)}/>`,

  // 22 · Mercury Trickster — a chrome teardrop of liquid mercury with a curling
  // tip, a smug face, and droplets dripping off its underside.
  22: (u) => `<defs>${lin(u + 'a', [[0, '#fbfdff'], [0.32, '#c3ccd8'], [0.5, '#6d7888'], [0.64, '#e4eaf2'], [1, '#4a5462']], 0.1, 0, 0.9, 1)}</defs>
    <circle cx="14" cy="30" r="4.2" fill="${url(u + 'a')}" ${o(2)}/><circle cx="87" cy="22" r="3.2" fill="${url(u + 'a')}" ${o(2)}/>
    <path d="M40 82 Q43 94 38 97 Q33 94 36 84 Z" fill="#a7b2c0" ${o(2.4)}/><circle cx="57" cy="94" r="3" fill="#c3ccd8" ${o(2)}/>
    <path d="M50 8 C60 17 77 32 79 52 C81 72 67 86 50 86 C33 86 19 72 21 52 C23 34 40 22 46 14 C47.5 12 48.8 10 50 8 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M50 8 C44 5 39 9 42 14" fill="none" ${o(3)}/>
    <path d="M30 42 C36 35 45 34 50 38" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/>
    <path d="M60 72 C66 69 70 64 71 57" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>
    ${face(50, 54, 1, 'smug')}
    ${gloss(37, 28, 7, 3.6, -40, 0.9)}`,

  // 23 · Lodestone Tyrant — a horseshoe magnet standing on its bend: red body,
  // silver poles for horns, a dashed field arcing between them, an iron shard
  // caught in the gap. The face sits on the thick bend.
  23: (u) => `<defs>${lin(u + 'a', [[0, '#ff7a6a'], [1, '#b31e25']], 0, 0, 1, 1)}${lin(u + 'b', [[0, '#ffffff'], [1, '#8b96a6']])}</defs>
    <path d="M27 8 C31 -1 69 -1 73 8" fill="none" stroke="#7fe8ff" stroke-width="2.2" stroke-dasharray="4 3.5" stroke-linecap="round"/>
    <path d="M16 16 L16 58 C16 80 32 92 50 92 C68 92 84 80 84 58 L84 16 L60 16 L60 50 C60 56 56 60 50 60 C44 60 40 56 40 50 L40 16 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <rect x="15" y="7" width="26" height="15" rx="3" fill="${url(u + 'b')}" ${o(3)}/><rect x="59" y="7" width="26" height="15" rx="3" fill="${url(u + 'b')}" ${o(3)}/>
    <path d="M20 26 L20 56" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
    <path d="M46.5 31 L51 27.5 L54.5 32 L50 35.5 Z" fill="#5a6270" ${o(1.8)}/>
    <path d="M6 42 L10 39 L12 44 L8 46 Z" fill="#5a6270" ${o(1.6)}/><path d="M90 36 L94 34 L95 39 L91 40 Z" fill="#5a6270" ${o(1.6)}/>
    ${face(50, 74, 0.8, 'fierce')}`,

  // 24 · Amber Warden — a translucent gum-drop of amber with a fossil beetle
  // caught inside and honey dripping from its underside.
  24: (u) => `<defs>${rad(u + 'a', [[0, '#fff0b0'], [0.5, '#ffb13b'], [1, '#c9650c']], 0.38, 0.3, 0.85)}</defs>
    <path d="M50 10 C72 10 86 28 86 52 C86 74 72 86 50 86 C28 86 14 74 14 52 C14 28 28 10 50 10 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <circle cx="50" cy="56" r="24" fill="#ffc24a" opacity="0.3"/>
    <g opacity="0.7"><ellipse cx="32" cy="68" rx="5.5" ry="7.5" fill="#7a3d0a"/><circle cx="32" cy="59" r="3" fill="#7a3d0a"/><path d="M27 64 L22 61 M27 69 L21 70 M37 64 L42 61 M37 69 L43 70" stroke="#7a3d0a" stroke-width="1.6" stroke-linecap="round"/></g>
    <path d="M55 84 C55 92 59 97 62 93 C63.5 90 62 87 62 84 Z" fill="#f0a020" ${o(2.4)}/>
    ${face(52, 44, 1, 'smug')}
    ${gloss(34, 26, 9, 5)}${gloss(67, 30, 3, 2, 0, 0.9)}`,

  // 25 · Dune Djinn — a sand head under a swirled turban with a turquoise gem,
  // little sand arms, and a spiralling sand tail where legs would be.
  25: (u) => `<defs>${lin(u + 'a', [[0, '#f8e0a8'], [1, '#b8894a']])}</defs>
    <path d="M32 50 C24 66 38 78 24 94 C40 90 50 76 64 62 C67 58 68 54 68 50 Z" fill="${url(u + 'a')}" ${o(3.2)}/>
    <path d="M36 64 C42 66 50 62 54 58 M32 78 C38 78 44 74 48 70" fill="none" stroke="#a87a3e" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 46 C19 43 12 50 15 57 C19 53 25 53 30 52 Z" fill="${url(u + 'a')}" ${o(2.8)}/>
    <path d="M70 46 C81 43 88 50 85 57 C81 53 75 53 70 52 Z" fill="${url(u + 'a')}" ${o(2.8)}/>
    <circle cx="50" cy="38" r="22" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M32 44 C40 50 60 50 68 42" fill="none" stroke="#b8894a" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 26 C31 8 69 8 70 26 C60 19 40 19 30 26 Z" fill="#e8c07a" ${o(3)}/><path d="M50 4 C44 6 44 12 50 14" fill="none" ${o(2.6)}/>
    <circle cx="50" cy="20" r="4" fill="#2fc6b8" ${o(2)}/>
    ${face(50, 38, 0.85, 'fierce')}
    ${[[10, 28], [90, 30], [84, 62], [14, 72], [60, 90]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#e8c07a" ${o(1)}/>`).join('')}`,

  // 26 · Caustic Flask — a round glass flask with a cork, filled with bubbling
  // neon-green acid; its face shows through the glass.
  26: (u) => `<defs>${lin(u + 'a', [[0, '#c8ff7a'], [1, '#2fb82a']])}</defs>
    <path d="M43 12 L57 12 L57 28.8 A30 30 0 1 1 43 28.8 Z" fill="#e8fbff"/>
    <path d="M21.1 50 C32 44 42 53 50 48 C58 43 68 52 78.9 50 A30 30 0 1 1 21.1 50 Z" fill="${url(u + 'a')}"/>
    <circle cx="36" cy="72" r="4" fill="#e8ffc2" ${o(1.5)}/><circle cx="62" cy="66" r="3" fill="#e8ffc2" ${o(1.5)}/><circle cx="52" cy="80" r="2.4" fill="#e8ffc2" ${o(1.4)}/>
    <path d="M43 12 L57 12 L57 28.8 A30 30 0 1 1 43 28.8 Z" fill="none" ${o(3.4)}/>
    <rect x="40" y="3" width="20" height="11" rx="3" fill="#c28a52" ${o(3)}/><path d="M45 5 V12 M50 5 V12 M55 5 V12" stroke="#8a5a2a" stroke-width="1.4"/>
    <path d="M27 42 A26 26 0 0 1 40 32" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    ${face(50, 62, 0.85, 'grin')}
    <circle cx="85" cy="30" r="3.2" fill="#9dff4a" ${o(1.8)}/><circle cx="14" cy="38" r="2.6" fill="#9dff4a" ${o(1.6)}/>`,

  // 27 · Bramble Heart — a ball of twisted vines ringed with thorns, two leaves
  // and a glowing golden seed on top, a vine tendril trailing below.
  27: (u) => `<defs>${rad(u + 'a', [[0, '#7fcf5a'], [0.6, '#3f8a34'], [1, '#24541f']], 0.4, 0.3, 0.8)}</defs>
    <path d="M44 80 C41 90 49 93 44 99" fill="none" stroke="#3f8a34" stroke-width="3.4" stroke-linecap="round"/>
    ${rays(50, 52, 28, 38, 12, 7, '#e8dcae', 2, 15)}
    <circle cx="50" cy="52" r="30" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M24 40 C40 30 60 70 76 60 M27 70 C40 50 62 40 77 45" fill="none" stroke="#9fe07a" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>
    <path d="M38 22 C30 14 22 18 22 24 C28 26 34 26 38 22 Z" fill="#6fcf4a" ${o(2.6)}/><path d="M62 22 C70 14 78 18 78 24 C72 26 66 26 62 22 Z" fill="#6fcf4a" ${o(2.6)}/>
    <circle cx="50" cy="18" r="9" fill="#ffe66b" opacity="0.35"/><ellipse cx="50" cy="18" rx="5" ry="6" fill="#ffe66b" ${o(2.4)}/>
    ${face(50, 52, 0.95, 'fierce')}`,

  // 28 · Coral Monarch — a soft pink anemone with a frilled lower edge, a crown
  // of branching orange coral, and bubbles rising.
  28: (u) => `<defs>${rad(u + 'a', [[0, '#ffd8c8'], [0.55, '#f5907c'], [1, '#c8505a']], 0.38, 0.3, 0.8)}</defs>
    <path d="M50 26 L50 9 M50 16 L42 7 M50 18 L60 5 M42 26 L33 12 M35 16 L28 12 M58 26 L68 12 M66 16 L74 13" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/>
    <path d="M50 26 L50 9 M50 16 L42 7 M50 18 L60 5 M42 26 L33 12 M35 16 L28 12 M58 26 L68 12 M66 16 L74 13" fill="none" stroke="#ff7a45" stroke-width="5" stroke-linecap="round"/>
    <path d="M30 72 C28 80 32 84 30 90 M50 74 C52 82 48 86 50 93" fill="none" stroke="#d8645a" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M18 56 C18 32 32 22 50 22 C68 22 82 32 82 56 C82 62 78 64 76 70 C72 64 68 66 66 72 C62 66 56 68 54 74 C50 68 46 68 44 74 C40 66 36 66 32 72 C30 66 26 64 22 70 C20 64 18 62 18 56 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <circle cx="30" cy="40" r="2.6" fill="#ffeadf"/><circle cx="70" cy="44" r="2" fill="#ffeadf"/>
    ${face(50, 48, 1, 'grin')}
    <circle cx="20" cy="18" r="3" fill="#fff" fill-opacity="0.5" ${o(1.4)}/><circle cx="82" cy="24" r="2.4" fill="#fff" fill-opacity="0.5" ${o(1.3)}/><circle cx="88" cy="12" r="1.8" fill="#fff" fill-opacity="0.5" ${o(1.2)}/>`,

  // 29 · Glowcap Sage — a big violet mushroom cap with glowing cyan spots over a
  // stubby cream stem that IS the body; root tendrils dangle, spores drift.
  29: (u) => `<defs>${rad(u + 'a', [[0, '#b3a6ff'], [0.6, '#6655d6'], [1, '#3e2fa6']], 0.4, 0.25, 0.85)}${lin(u + 'b', [[0, '#fff8ea'], [1, '#e2cfa8']])}</defs>
    <path d="M42 84 C40 91 44 95 41 99 M57 84 C59 91 55 95 58 99" fill="none" stroke="#c9b58a" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M32 52 C30 70 34 84 50 86 C66 84 70 70 68 52 Z" fill="${url(u + 'b')}" ${o(3.2)}/>
    <path d="M12 46 C12 22 30 8 50 8 C70 8 88 22 88 46 C88 52 80 54 50 54 C20 54 12 52 12 46 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M17 50 C30 55 70 55 83 50" fill="none" stroke="#d9d0ff" stroke-width="2" opacity="0.8"/>
    ${[[30, 26, 5], [52, 17, 6], [70, 30, 4.5], [41, 40, 3.4], [63, 43, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r! + 3}" fill="#7ff6ff" opacity="0.3"/><circle cx="${x}" cy="${y}" r="${r}" fill="#9ffaff" ${o(1.6)}/>`).join('')}
    ${face(50, 68, 0.78, 'calm')}
    ${[[8, 20], [92, 16], [90, 58], [10, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#9ffaff"/>`).join('')}`,

  // 30 · Stormcloud Fury — a dark storm cloud with a furious face and forked
  // lightning bolts hanging where legs would be.
  30: (u) => `<defs>${rad(u + 'a', [[0, '#aab5d0'], [0.6, '#5d6b8a'], [1, '#34405c']], 0.4, 0.3, 0.8)}</defs>
    <path d="M36 64 L29 80 L36.5 80 L31 95 L47 76 L39.5 76 L45 64 Z" fill="#ffe24a" ${o(2.6)}/>
    <path d="M56 68 L52 79 L57 79 L54 88 L64 76 L58.5 76 L61.5 68 Z" fill="#ffe24a" ${o(2.2)}/>
    <path d="M18 74 L15 81 M24 78 L21 85" stroke="#9fd8ff" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M22 62 C10 62 7 44 20 40 C18 26 34 18 44 26 C48 12 70 12 74 28 C88 26 95 44 84 52 C92 60 84 70 74 66 C70 74 56 74 50 68 C44 74 30 72 22 62 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M26 38 C28 32 34 30 38 32 M52 22 C56 18 62 18 66 22" fill="none" stroke="#dfe6f5" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/>
    ${face(52, 46, 1, 'fierce')}`,

  // ─── 31-40 ────────────────────────────────────────────────────────────────

  // 31 · Jade Oracle — a carved jade sphere belted with gold filigree, a gold
  // spiral on its brow, two jade discs orbiting, a red tassel hanging below.
  31: (u) => `<defs>${rad(u + 'a', [[0, '#a8f5d2'], [0.55, '#3cc28a'], [1, '#157a50']], 0.38, 0.3, 0.8)}</defs>
    <path d="M2 44 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z M8.5 44 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0 Z" fill="#56d6a0" fill-rule="evenodd" ${o(2.6)}/>
    <path d="M78 44 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z M84.5 44 a3.5 3.5 0 1 0 7 0 a3.5 3.5 0 1 0 -7 0 Z" fill="#56d6a0" fill-rule="evenodd" ${o(2.6)}/>
    <path d="M50 75 L50 84" ${o(2.4)}/><path d="M46 86 L54 86 L56.5 97 L43.5 97 Z" fill="#e8453c" ${o(2.2)}/><circle cx="50" cy="84.5" r="3.2" fill="#ffd35a" ${o(1.8)}/>
    <circle cx="50" cy="46" r="30" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M22 58 C34 68 66 68 78 58" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/><path d="M22 58 C34 68 66 68 78 58" fill="none" stroke="#ffd35a" stroke-width="4" stroke-linecap="round"/>
    <path d="M50 21 m-4.5 0 a4.5 4.5 0 1 1 4.5 4.5 a2.6 2.6 0 1 1 -2.6 -2.6" fill="none" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M50 21 m-4.5 0 a4.5 4.5 0 1 1 4.5 4.5 a2.6 2.6 0 1 1 -2.6 -2.6" fill="none" stroke="#ffd35a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M27 38 C31 31 37 28 43 27" fill="none" stroke="#1f8f5f" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
    ${face(50, 45, 0.95, 'calm')}
    ${gloss(35, 30, 8, 4.5)}`,

  // 32 · Rune Monolith — a floating grey-blue standing stone carved with
  // glowing cyan runes, glowing eyes near its crown, rock chips drifting below.
  32: (u) => `<defs>${lin(u + 'a', [[0, '#c6cedb'], [1, '#5b6475']])}</defs>
    <path d="M34 84 L40 82 L42 88 L36 90 Z M48 88 L54 86 L55.5 92 L49 93.5 Z M57.5 82 L63 84 L61.5 88.5 L57 86.5 Z" fill="#6d768a" ${o(2)}/>
    <path d="M30 14 C30 7 70 7 70 14 L74 72 C74 80 26 80 26 72 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M63 10 C67 10.5 70 12 70 14 L74 72 C73.8 76 70 78.5 65 79 Z" fill="#3e4658" opacity="0.35"/>
    <path d="M30 30 L36 34 L34 40" fill="none" stroke="#3e4658" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M36 50 V66 M36 53 L42 50 M36 58 L42 55 M50 52 V68 M50 58 L45 52 M50 58 L55 52 M62 50 V66 M62 50 L67 53 L62 57 L67 66" fill="none" stroke="#5ff0ff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
    <path d="M36 50 V66 M36 53 L42 50 M36 58 L42 55 M50 52 V68 M50 58 L45 52 M50 58 L55 52 M62 50 V66 M62 50 L67 53 L62 57 L67 66" fill="none" stroke="#8ff8ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M33 16 L34.5 44" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity="0.5"/>
    ${face(50, 31, 0.85, 'glow', '#7ff6ff')}`,

  // 33 · Chrono Engine — a brass cog with an ivory clock face for a face, two
  // small cogs orbiting, a pendulum swinging where legs would be.
  33: (u) => `<defs>${rad(u + 'a', [[0, '#fff0b0'], [0.55, '#e0b04a'], [1, '#9a6a1f']], 0.38, 0.3, 0.8)}</defs>
    <path d="M50 78 L50 89" ${o(2.6)}/><circle cx="50" cy="93" r="5" fill="#e0b04a" ${o(2.4)}/>
    <path d="${gearPath(14, 22, 8, 6, 8)}" fill="#c9a24a" ${o(2.2)}/><circle cx="14" cy="22" r="2" fill="#6b4a1f"/>
    <path d="${gearPath(86, 18, 6.5, 5, 8)}" fill="#c9a24a" ${o(2)}/><circle cx="86" cy="18" r="1.6" fill="#6b4a1f"/>
    <path d="${gearPath(50, 46, 35, 30, 12)}" fill="${url(u + 'a')}" ${o(3.2)}/>
    <circle cx="50" cy="46" r="22" fill="#fff6dc" ${o(2.8)}/>
    ${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `<path d="M${f(50 + Math.cos(a) * 18.5)} ${f(46 + Math.sin(a) * 18.5)} L${f(50 + Math.cos(a) * 20.8)} ${f(46 + Math.sin(a) * 20.8)}" stroke="#9a6a1f" stroke-width="1.6" stroke-linecap="round"/>` }).join('')}
    ${face(50, 45, 0.78, 'fierce')}
    ${gloss(34, 24, 7, 3.6)}`,

  // 34 · Origami Spirit — a creature folded from paper: flat two-tone facets, a
  // red fold at its crown, folded fins, a paper streamer for a tail.
  34: () => `<path d="M22 34 L3 25 L13 49 Z" fill="#f4efe4" ${o(2.8)}/><path d="M78 34 L97 25 L87 49 Z" fill="#e6dfcf" ${o(2.8)}/>
    <path d="M50 86 L43 98 L50 94 L57 98 Z" fill="#e8453c" ${o(2.4)}/>
    <path d="M50 10 L22 34 L50 48 Z" fill="#ffffff"/><path d="M50 10 L78 34 L50 48 Z" fill="#e9e2d2"/>
    <path d="M22 34 L30 70 L50 86 L50 48 Z" fill="#f4eee2"/><path d="M78 34 L70 70 L50 86 L50 48 Z" fill="#ddd4c0"/>
    <path d="M22 34 L50 48 L78 34 M50 48 L50 86" fill="none" stroke="#b8ae98" stroke-width="1.5"/>
    <path d="M50 10 L78 34 L70 70 L50 86 L30 70 L22 34 Z" fill="none" ${o(3.4)}/>
    <path d="M50 10 L42 20 L50 24 L58 20 Z" fill="#e8453c" ${o(2.2)}/>
    ${face(50, 55, 0.85, 'fierce')}`,

  // 35 · Bubble Sprite — an iridescent soap bubble with a face floating inside,
  // a rainbow sheen and a window highlight, two little bubbles in tow.
  35: (u) => `<defs>${rad(u + 'a', [[0, '#f6fcff'], [0.7, '#dcf1ff'], [0.9, '#ffe0f0'], [1, '#a8e2ff']], 0.5, 0.5, 0.5)}${lin(u + 'b', [[0, '#ff9ad5'], [0.5, '#fff27a'], [1, '#8fe8ff']], 0, 0, 1, 0)}</defs>
    <circle cx="13" cy="80" r="6" fill="${url(u + 'a')}" ${o(2)}/><circle cx="87" cy="15" r="5" fill="${url(u + 'a')}" ${o(2)}/><circle cx="8" cy="58" r="3" fill="${url(u + 'a')}" ${o(1.6)}/>
    <circle cx="50" cy="50" r="36" fill="${url(u + 'a')}" ${o(2.8)}/>
    <path d="M20 62 A32 32 0 0 0 60 82" fill="none" stroke="${url(u + 'b')}" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
    <path d="M28 30 C33 23 41 19 49 18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.95"/><circle cx="25" cy="38" r="2.6" fill="#fff"/>
    ${face(50, 53, 0.95, 'grin')}`,

  // 36 · Glitch Cube — a neon cube of pixels, its front face a pixel face,
  // misregistered glitch slices across it, loose pixels trailing below.
  36: (u) => `<defs>${lin(u + 'a', [[0, '#6ff6ff'], [1, '#1a78d6']])}</defs>
    <rect x="40" y="84" width="5" height="5" fill="#2af0ff" ${o(1.2)}/><rect x="48" y="90" width="4" height="4" fill="#ffe23a" ${o(1.2)}/><rect x="36" y="94" width="3" height="3" fill="#2af0ff" ${o(1)}/>
    <rect x="10" y="28" width="4" height="4" fill="#ffe23a" ${o(1.2)}/><rect x="88" y="40" width="3.5" height="3.5" fill="#2af0ff" ${o(1.1)}/><rect x="12" y="66" width="5" height="5" fill="#2af0ff" ${o(1.2)}/><rect x="86" y="8" width="4" height="4" fill="#6a3cff" ${o(1.2)}/>
    <path d="M26 30 L38 18 L82 18 L70 30 Z" fill="#9ffcff" ${o(3)}/><path d="M70 30 L82 18 L82 62 L70 74 Z" fill="#6a3cff" ${o(3)}/>
    <rect x="26" y="30" width="44" height="44" fill="${url(u + 'a')}" ${o(3.2)}/>
    <path d="M37 30 V74 M48 30 V74 M59 30 V74 M26 41 H70 M26 52 H70 M26 63 H70" stroke="#bff8ff" stroke-width="0.9" opacity="0.45"/>
    <rect x="18" y="56" width="40" height="6" fill="#ffe23a"/><rect x="34" y="64" width="42" height="3.5" fill="#2af0ff" opacity="0.9"/>
    <rect x="33" y="39" width="9" height="10" fill="#fff" ${o(2)}/><rect x="37" y="43" width="4" height="5" fill="#101018"/>
    <rect x="54" y="39" width="9" height="10" fill="#fff" ${o(2)}/><rect x="55" y="43" width="4" height="5" fill="#101018"/>
    <path d="M31 35 H37 V37 H43 M65 35 H59 V37 H53" fill="none" ${o(2.6)}/>
    <path d="M40 53 H44 V51 H52 V53 H56" fill="none" ${o(2.6)}/>`,

  // 37 · Echo Bell — a bronze bell with a face, a ring to hang from, its
  // clapper dangling below the rim and sound rings pulsing at its sides.
  37: (u) => `<defs>${lin(u + 'a', [[0, '#ffe0a0'], [1, '#a8661c']])}</defs>
    <path d="M13 36 C7 44 7 52 13 60 M9 30 C2 42 2 54 9 64 M87 36 C93 44 93 52 87 60 M91 30 C98 42 98 54 91 64" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
    <path d="M13 36 C7 44 7 52 13 60 M9 30 C2 42 2 54 9 64 M87 36 C93 44 93 52 87 60 M91 30 C98 42 98 54 91 64" fill="none" stroke="#ffe9a8" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="50" cy="7" r="5" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="50" cy="7" r="5" fill="none" stroke="#e8a83c" stroke-width="2.4"/>
    <path d="M50 82 L50 87" ${o(2.6)}/><circle cx="50" cy="91" r="5" fill="#6b4a1f" ${o(2.4)}/>
    <path d="M50 11 C38 11 32 21 32 35 L30 60 C30 66 20 70 18 76 L82 76 C80 70 70 66 70 60 L68 35 C68 21 62 11 50 11 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M17 76 L83 76 L81 82 L19 82 Z" fill="#b87a2a" ${o(3)}/>
    <path d="M34 32 C44 28 56 28 66 32" fill="none" stroke="#8a5418" stroke-width="2"/>
    <path d="M38 20 C36 28 35 40 35 52" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity="0.6"/>
    ${face(50, 49, 0.95, 'grin')}`,

  // 38 · Spirit Lantern — an iron lantern whose glass glows teal around a ghost
  // flame with a face; a wisp trails from its base.
  38: (u) => `<defs>${lin(u + 'a', [[0, '#d8fcff'], [1, '#2fb8e0']])}${lin(u + 'b', [[0, '#ffffff'], [1, '#3fd0ff']])}</defs>
   <path d="M45 80 C42 88 51 91 46 98" fill="none" stroke="#7ff0ff" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <circle cx="50" cy="6" r="4.5" fill="none" ${o(3.2)}/>
    <path d="M36 20 L64 20 L59 11 L41 11 Z" fill="#454b5e" ${o(3)}/>
    <rect x="32" y="20" width="36" height="50" rx="4" fill="${url(u + 'a')}" ${o(3.2)}/>
    <path d="M50 26 C58 36 64 44 62 54 C60 64 54 68 50 68 C46 68 40 64 38 54 C36 44 42 36 50 26 Z" fill="${url(u + 'b')}" ${o(2.4)}/>
    ${face(50, 52, 0.62, 'fierce')}
    <rect x="30" y="20" width="5" height="50" fill="#3a3f4f" ${o(2)}/><rect x="65" y="20" width="5" height="50" fill="#3a3f4f" ${o(2)}/>
    <path d="M28 70 L72 70 L65 80 L35 80 Z" fill="#454b5e" ${o(3)}/>
    <circle cx="14" cy="30" r="2.4" fill="#bff8ff"/><circle cx="86" cy="24" r="2" fill="#bff8ff"/><circle cx="12" cy="62" r="1.8" fill="#bff8ff"/>`,

  // 39 · Mirror Specter — an ornate lilac-silver hand mirror whose glass shows a
  // smug face; a gem crowns the frame and the handle tapers where legs would be.
  39: (u) => `<defs>${lin(u + 'a', [[0, '#f3ecff'], [1, '#9a86d6']])}${lin(u + 'b', [[0, '#ffffff'], [1, '#b9c8ff']])}</defs>
    <path d="M44 70 L56 70 L54 90 C54 95 46 95 46 90 Z" fill="${url(u + 'a')}" ${o(3)}/><circle cx="50" cy="96" r="2.6" fill="#3fd8c0" ${o(1.6)}/>
    <ellipse cx="50" cy="40" rx="28" ry="32" fill="${url(u + 'a')}" ${o(3.4)}/>
    <circle cx="22" cy="40" r="4" fill="#d8c8ff" ${o(2)}/><circle cx="78" cy="40" r="4" fill="#d8c8ff" ${o(2)}/>
    <path d="M50 3 L55 8 L50 13 L45 8 Z" fill="#3fd8c0" ${o(2)}/>
    <ellipse cx="50" cy="40" rx="21" ry="25" fill="${url(u + 'b')}" ${o(2.6)}/>
    <path d="M34 32 L44 21 M36 42 L53 24" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity="0.7"/>
    ${face(50, 44, 0.85, 'smug')}
    ${spark(12, 20, 5, '#ffffff')}${spark(88, 24, 4, '#e0d4ff')}${spark(14, 66, 3.5, '#ffffff')}`,

  // 40 · Ruby Heart — a heart-cut ruby with bright facets and a tiny gold crown,
  // fierce and glinting.
  40: (u) => `<defs>${rad(u + 'a', [[0, '#ffb0c0'], [0.5, '#ff3b5c'], [1, '#a3102e']], 0.35, 0.3, 0.8)}</defs>
    <path d="M50 86 C30 72 12 58 12 38 C12 22 24 12 36 12 C44 12 48 16 50 22 C52 16 56 12 64 12 C76 12 88 22 88 38 C88 58 70 72 50 86 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M40 27 L50 23 L60 27 L57 36 L43 36 Z" fill="#ffc0cc" opacity="0.5"/>
    <path d="M50 23 L50 36 M43 36 L24 30 M57 36 L76 30 M43 36 L33 62 M57 36 L67 62 M50 36 L50 84" fill="none" stroke="#ffd0da" stroke-width="1.5" opacity="0.7"/>
    <path d="M42 14 L44 6 L48 11 L50 4 L52 11 L56 6 L58 14 Z" fill="#ffd23a" ${o(2.2)}/>
    ${face(50, 48, 0.95, 'fierce')}
    ${gloss(31, 26, 7, 4)}
    ${spark(87, 12, 5, '#ffffff')}${spark(12, 64, 4, '#ffd0da')}`,

  // ─── 41-50 ────────────────────────────────────────────────────────────────

  // 41 · Frostfire Wisp — a flame that burns COLD: white-hot core, ice-blue
  // tongues, snowflakes in its sparks, a wisp for a tail.
  41: (u) => `<defs>${rad(u + 'a', [[0, '#f4feff'], [0.45, '#8fdcff'], [1, '#2450c8']], 0.5, 0.62, 0.7)}</defs>
    <path d="M44 80 C40 88 48 92 44 99" fill="none" stroke="#7fd0ff" stroke-width="3" stroke-linecap="round" opacity="0.85"/>
    <path d="M29 52 C21 47 19 37 24 30 C26 38 30 43 34 45 Z" fill="#5fb0ff" ${o(2.6)}/><path d="M71 50 C79 45 81 36 77 30 C75 37 71 41 67 43 Z" fill="#5fb0ff" ${o(2.6)}/>
    <path d="M50 6 C58 18 70 26 72 44 C74 62 64 78 50 82 C36 78 26 62 28 46 C29 36 34 30 38 24 C38 32 42 36 46 36 C44 26 46 16 50 6 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M50 38 C56 45 60 53 58 62 C56 70 52 74 50 74 C48 74 44 70 42 62 C40 53 44 45 50 38 Z" fill="#eafcff" opacity="0.85"/>
    ${face(50, 57, 0.8, 'fierce')}
    ${snow(14, 22, 4)}${snow(86, 28, 3.5)}${snow(16, 76, 3)}`,

  // 42 · Diamond Paragon — a brilliant-cut diamond, crown up, point down (it
  // hovers on its point); rainbow glints in the facets, shards orbiting.
  42: (u) => `<defs>${lin(u + 'a', [[0, '#ffffff'], [1, '#c7ecff']])}${lin(u + 'b', [[0, '#d4f1ff'], [1, '#5ab8ee']])}</defs>
    <path d="M12 37 L16 44 L12 52 L8 44 Z M89 44 L92.5 50 L89 57 L85.5 50 Z M20 76 L23 80.5 L20 86 L17 80.5 Z" fill="#dff6ff" ${o(1.8)}/>
    <path d="M26 30 L38 14 L62 14 L74 30 Z" fill="${url(u + 'a')}"/><path d="M26 30 L74 30 L50 88 Z" fill="${url(u + 'b')}"/>
    <path d="M44 30 L50 30 L47 44 Z" fill="#ffc27a" opacity="0.5"/><path d="M56 30 L62 30 L55 50 Z" fill="#fff27a" opacity="0.5"/><path d="M30 30 L36 30 L42 48 Z" fill="#9affc8" opacity="0.4"/>
    <path d="M38 14 L44 30 M62 14 L56 30 M50 14 L44 30 M50 14 L56 30 M44 30 L50 88 M56 30 L50 88 M34 30 L50 88 M66 30 L50 88 M26 30 L74 30" fill="none" stroke="#7fc6ee" stroke-width="1.4"/>
    <path d="M26 30 L38 14 L62 14 L74 30 L50 88 Z" fill="none" ${o(3.4)}/>
    ${face(50, 40, 0.8, 'fierce')}
    ${spark(80, 9, 5, '#ffffff')}${spark(10, 20, 3.5, '#e6f8ff')}`,

  // 43 · Plasma Dynamo — a white-hot magenta plasma ball inside a tilted
  // containment ring, arcs of lightning crackling off it.
  43: (u) => `<defs>${rad(u + 'a', [[0, '#ffffff'], [0.35, '#dcc4ff'], [0.75, '#9a4dff'], [1, '#5a1fb0']], 0.42, 0.38, 0.7)}</defs>
    <ellipse cx="50" cy="52" rx="44" ry="12" transform="rotate(-18 50 52)" fill="none" stroke="${INK}" stroke-width="7"/><ellipse cx="50" cy="52" rx="44" ry="12" transform="rotate(-18 50 52)" fill="none" stroke="#e8b830" stroke-width="4"/>
   <circle cx="50" cy="50" r="26" fill="${url(u + 'a')}" ${o(3.4)}/>
    ${face(50, 48, 0.85, 'fierce')}
    <path d="M6 52 A44 12 0 0 0 94 52" transform="rotate(-18 50 52)" fill="none" stroke="${INK}" stroke-width="7"/><path d="M6 52 A44 12 0 0 0 94 52" transform="rotate(-18 50 52)" fill="none" stroke="#ffd65a" stroke-width="4"/>
    <path d="M26 28 L20 24 L24 20 L16 14 M76 30 L82 25 L79 20 L87 15 M22 72 L15 76 L19 80 L12 86" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 28 L20 24 L24 20 L16 14 M76 30 L82 25 L79 20 L87 15 M22 72 L15 76 L19 80 L12 86" fill="none" stroke="#bff6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,

  // 44 · Comet Herald — an icy comet head charging up and right, its glowing
  // tail streaming down to the lower left.
  44: (u) => `<defs>${lin(u + 'a', [[0, '#ffffff'], [0.5, '#a8dcff'], [1, '#5aa0e8']], 1, 0, 0, 1)}${rad(u + 'b', [[0, '#ffffff'], [0.6, '#bfe3ff'], [1, '#5aa0e0']], 0.4, 0.3, 0.8)}</defs>
    <path d="M50 30 C38 46 22 64 5 95 C20 85 30 80 42 79 C31 85 23 91 17 99 C35 86 54 72 72 55 Z" fill="${url(u + 'a')}" ${o(2.2)}/>
    <path d="M44 48 C34 62 24 76 14 90" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    <circle cx="62" cy="36" r="24" fill="${url(u + 'b')}" ${o(3.4)}/>
    <path d="M47 28 L55 22 L66 24 M70 50 L76 42" fill="none" stroke="#e6f6ff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
    <ellipse cx="73" cy="27" rx="3" ry="2" fill="#9fd0f5"/>
    ${face(61, 38, 0.8, 'fierce')}
    ${spark(28, 20, 3.5, '#ffffff')}${spark(90, 62, 3, '#bfe6ff')}`,

  // 45 · Aurora Seraph — a curtain of polar light, violet at the crown through
  // teal to green, light streaks falling through it, dissolving at the hem.
  45: (u) => `<defs>${lin(u + 'a', [[0, '#c28bff'], [0.45, '#44e6c0'], [0.8, '#5dff9a'], [1, '#3fd890']])}</defs>
    <ellipse cx="52" cy="14" rx="20" ry="5" fill="#fff" opacity="0.3"/>
    <path d="M20 18 C34 8 50 14 60 10 C72 6 82 12 84 20 C84 36 86 50 76 62 C68 72 66 82 60 94 C57 86 53 83 49 90 C46 81 41 79 35 88 C33 77 27 71 23 61 C17 47 22 32 20 18 Z" fill="${url(u + 'a')}" ${o(2.8)}/>
    <path d="M33 22 L31 70 M45 17 L45 78 M57 15 L58 74 M69 16 L68 60" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
    ${face(52, 38, 0.9, 'calm')}
    ${spark(10, 14, 3.5, '#ffffff')}${spark(90, 40, 3, '#e8d4ff')}${spark(12, 52, 2.6, '#c8fff0')}`,

  // 46 · Solar Emperor — a blazing sun: a double corona of flame rays round a
  // golden disc with a grin, one flare looping off its brow.
  46: (u) => `<defs>${rad(u + 'a', [[0, '#fffbe0'], [0.5, '#ffd23a'], [1, '#ff8a1a']], 0.4, 0.35, 0.75)}</defs>
    ${rays(50, 48, 29, 45, 12, 9, '#ffb31a', 2.4, 0)}${rays(50, 48, 29, 38, 12, 7, '#ffd23a', 2, 15)}
    <circle cx="50" cy="48" r="30" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M26 28 C14 12 40 4 40 22" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round"/><path d="M26 28 C14 12 40 4 40 22" fill="none" stroke="#ff6a1a" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="68" cy="60" rx="3" ry="2" fill="#ff9a1a" opacity="0.6"/><ellipse cx="33" cy="64" rx="2.4" ry="1.6" fill="#ff9a1a" opacity="0.6"/>
    ${face(50, 49, 0.95, 'grin')}
    ${gloss(38, 33, 8, 4)}`,

  // 47 · Wishing Star — a plump golden five-point star with a grin, trailing
  // two ribbons of stardust where legs would be.
  47: (u) => `<defs>${rad(u + 'a', [[0, '#fffdf0'], [0.55, '#ffe066'], [1, '#ffb31a']], 0.45, 0.4, 0.75)}</defs>
    <path d="M40 70 C33 80 38 88 30 98 M58 72 C60 82 54 88 58 97" fill="none" stroke="#c7b6ff" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
    ${spark(33, 86, 3, '#e0d4ff')}${spark(57, 90, 2.6, '#ffffff')}
    <path d="${poly(starPts(50, 44, 40, 19))}" fill="${url(u + 'a')}" ${o(3.6)}/>
    ${face(50, 47, 0.85, 'grin')}
    ${gloss(40, 30, 6, 3.4)}
    ${spark(12, 14, 4, '#ffffff')}${spark(88, 12, 3.4, '#fff7c2')}${spark(90, 52, 2.6, '#ffffff')}`,

  // 48 · Pulsar Beacon — a small blinding star core spinning inside two
  // crossed rings, its light beams shooting straight up and down.
  48: (u) => `<defs>${rad(u + 'a', [[0, '#ffffff'], [0.6, '#bfe9ff'], [1, '#3f8fd8']], 0.42, 0.38, 0.75)}${lin(u + 'b', [[0, '#ffffff'], [1, '#a8e4ff']], 0, 1, 0, 0)}${lin(u + 'c', [[0, '#ffffff'], [1, '#a8e4ff']])}</defs>
   <path d="M44 34 L50 1 L56 34 Z" fill="${url(u + 'b')}" ${o(1.8)}/><path d="M44 66 L50 99 L56 66 Z" fill="${url(u + 'c')}" ${o(1.8)}/>
    ${[25, -25].map((r) => `<ellipse cx="50" cy="50" rx="38" ry="10" transform="rotate(${r} 50 50)" fill="none" stroke="${INK}" stroke-width="6"/><ellipse cx="50" cy="50" rx="38" ry="10" transform="rotate(${r} 50 50)" fill="none" stroke="#a78bff" stroke-width="3"/>`).join('')}
    <circle cx="50" cy="50" r="20" fill="${url(u + 'a')}" ${o(3.2)}/>
    ${face(50, 49, 0.62, 'fierce')}
    ${[25, -25].map((r) => `<path d="M12 50 A38 10 0 0 0 88 50" transform="rotate(${r} 50 50)" fill="none" stroke="${INK}" stroke-width="6"/><path d="M12 50 A38 10 0 0 0 88 50" transform="rotate(${r} 50 50)" fill="none" stroke="#c4b0ff" stroke-width="3"/>`).join('')}`,

  // 49 · Dark Matter — a shapeless mass of inky violet dark, rim-lit, wisps
  // swirling inside, rock debris caught in orbit, a faint lensing halo.
  49: (u) => `<defs>${rad(u + 'a', [[0, '#5a3a96'], [0.6, '#2a1850'], [1, '#120a24']], 0.4, 0.32, 0.8)}</defs>
    <circle cx="50" cy="48" r="42" fill="none" stroke="#9a66ff" stroke-width="1.6"/><circle cx="50" cy="48" r="45.5" fill="none" stroke="#7a4fd0" stroke-width="0.9"/>
    <path d="M11 24 L17 21 L20 27 L14 30 Z M86 28 L92 27 L92 33 L87 34 Z M14 80 L19 78 L21 83 L16 85 Z M85 55 L90 54 L91 59 L86 60 Z" fill="#2a1c3a" stroke="#b07bff" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M50 12 C66 12 80 22 82 38 C92 44 88 60 80 64 C80 78 66 86 52 82 C40 90 22 82 22 68 C10 62 12 44 22 38 C22 22 36 12 50 12 Z" fill="${url(u + 'a')}" ${o(3.4)}/>
    <path d="M50 12 C66 12 80 22 82 38 C92 44 88 60 80 64 C80 78 66 86 52 82 C40 90 22 82 22 68 C10 62 12 44 22 38 C22 22 36 12 50 12 Z" fill="none" stroke="#9a66ff" stroke-width="1.4"/>
    <path d="M30 60 C40 50 56 54 62 62 C68 70 58 78 48 72 M34 30 C40 26 48 26 54 30" fill="none" stroke="#7a4fd0" stroke-width="2.8" stroke-linecap="round" opacity="0.8"/>
    <circle cx="36" cy="70" r="1.4" fill="#fff"/><circle cx="66" cy="30" r="1.2" fill="#e0c8ff"/><circle cx="70" cy="68" r="1" fill="#fff"/>
    ${face(50, 46, 0.9, 'glow', '#d6b6ff', '#d6b6ff')}`,

  // 50 · Singularity Prime — a perfect black sphere ringed by a blazing orange
  // accretion disk, a thin photon ring on its edge, two burning eyes.
  50: (u) => `<defs>${lin(u + 'a', [[0, '#c2360f'], [0.25, '#ffb13b'], [0.5, '#fff3c4'], [0.75, '#ffb13b'], [1, '#c2360f']], 0, 0, 1, 0)}</defs>
    <path d="M18 34 C28 8 72 8 82 34" fill="none" stroke="#e8a860" stroke-width="1.6"/>
    <ellipse cx="50" cy="52" rx="46" ry="13" transform="rotate(-12 50 52)" fill="none" stroke="${INK}" stroke-width="9"/><ellipse cx="50" cy="52" rx="46" ry="13" transform="rotate(-12 50 52)" fill="none" stroke="${url(u + 'a')}" stroke-width="6"/>
    <circle cx="50" cy="48" r="25" fill="#07050c" ${o(3)}/>
    <circle cx="50" cy="48" r="26.6" fill="none" stroke="#fff3c4" stroke-width="1.6" opacity="0.9"/>
    ${face(50, 45, 0.8, 'glow', '#ffcf8a', '#ffcf8a')}
    <path d="M4 52 A46 13 0 0 0 96 52" transform="rotate(-12 50 52)" fill="none" stroke="${INK}" stroke-width="9"/><path d="M4 52 A46 13 0 0 0 96 52" transform="rotate(-12 50 52)" fill="none" stroke="${url(u + 'a')}" stroke-width="6"/>
    <circle cx="18" cy="66" r="1.4" fill="#ffcf8a"/><circle cx="84" cy="36" r="1.2" fill="#ffcf8a"/><circle cx="30" cy="22" r="1" fill="#ffcf8a"/>`
}

/**
 * The drawing for an elemental tier as SVG markup for a `viewBox="0 0 100 100"`
 * (defs included, gradient ids prefixed with `uid` so several share a page), or
 * null for a tier that is not one of the elementals.
 */
export const elementalArt = (tier: number, uid: string): string | null => {
  const draw = DRAWINGS[tier]
  return draw ? draw(uid) : null
}

/** Tiers that have a drawing here. */
export const ELEMENTAL_ART_TIERS = (): number[] => Object.keys(DRAWINGS).map(Number).sort((a, b) => a - b)
