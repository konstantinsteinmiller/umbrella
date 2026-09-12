/**
 * ─── Big-number display ─────────────────────────────────────────────────────
 *
 * One formatter for every coin, cost and damage figure in the game. The deep
 * Recruits ladder prices levels in the 10³⁰s and late-wave payouts run past
 * trillions, so the old per-component `K/M/B/T` switches ran out of names.
 *
 * Short-scale suffixes, one per 10³ step, idle-game style: K M B T, then Qa Qi
 * Sx Sp Oc No (10¹⁵ … 10³⁰), Dc (decillion, 10³³), the -decillions Ud … Nod,
 * and Vg (vigintillion, 10⁶³). Past that it falls back to e-notation — nothing
 * in the economy gets near it, but a number must never render as "Infinity".
 *
 * The suffixes are the same in every locale, like the K/M/B/T they extend.
 */

export const BIG_SUFFIXES = [
  '', 'K', 'M', 'B', 'T',
  'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
  'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod',
  'Vg'
] as const

export interface BigFormatOptions {
  /** Digits after the point once a suffix applies (default 1). */
  decimals?: number
  /** Significant digits instead of fixed decimals: 12.3K, 123K, 1.23M. */
  sig?: number
  /** Round DOWN, never up — a wallet must not show more than it holds. */
  floor?: boolean
  /** Drop a trailing ".0" / ".00" (2000 → "2K", not "2.0K"). */
  trim?: boolean
  /** Lower-case suffixes ("1.4k", "2qa") — the wallet badge's style. */
  lower?: boolean
  /** Below this the plain integer is shown (default 1000). */
  plainBelow?: number
}

const roundTo = (v: number, decimals: number, floor: boolean): number => {
  const k = Math.pow(10, decimals)
  return (floor ? Math.floor(v * k + 1e-9) : Math.round(v * k)) / k
}

/** 1234 → "1.2K", 5.6e15 → "5.6Qa", 999 → "999". */
export const formatBig = (value: number, opts: BigFormatOptions = {}): string => {
  const { floor = false, trim = false, lower = false, plainBelow = 1000 } = opts
  if (!Number.isFinite(value)) return value > 0 ? '∞' : value < 0 ? '-∞' : '0'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs < plainBelow) return sign + String(floor ? Math.floor(abs) : Math.round(abs))
  if (abs >= 1000 * Math.pow(1000, BIG_SUFFIXES.length - 1)) return sign + abs.toExponential(2).replace('e+', 'e')

  // log10 can land a hair under the boundary (log10(1000) ≈ 2.9999…); the
  // rollover check below catches the mantissa that comes out as 1000.
  let tier = Math.min(BIG_SUFFIXES.length - 1, Math.floor(Math.log10(abs) / 3))
  const render = (t: number): { text: string; mantissa: number } => {
    const scaled = abs / Math.pow(1000, t)
    const decimals = opts.sig !== undefined
      ? Math.max(0, opts.sig - 1 - Math.floor(Math.log10(Math.max(1, scaled))))
      : (opts.decimals ?? 1)
    const m = roundTo(scaled, decimals, floor)
    let text = m.toFixed(decimals)
    if (trim && decimals > 0) text = text.replace(/\.?0+$/, '')
    return { text, mantissa: m }
  }
  let r = render(tier)
  // 999.96K rounds to "1000.0K" — that is "1.0M".
  if (r.mantissa >= 1000 && tier < BIG_SUFFIXES.length - 1) {
    tier += 1
    r = render(tier)
  }
  const suffix = BIG_SUFFIXES[tier]!
  return sign + r.text + (lower ? suffix.toLowerCase() : suffix)
}
