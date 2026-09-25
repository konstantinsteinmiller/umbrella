import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

/**
 * `barrage.*` (the UI layer's strings) ships in all 21 locales with the SAME
 * shape as English: no locale may miss a key (it would fall back to English
 * mid-sentence), carry a different `{param}` set (it would print a raw
 * placeholder), or hold a message vue-i18n cannot compile.
 */

const files = import.meta.glob<{ default: Record<string, unknown> }>('@/i18n/locales/barrage/*.ts', { eager: true })
const byLang = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [path.replace(/^.*\/(\w+)\.ts$/, '$1'), mod.default])
)

const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key))
    else out[key] = String(v)
  }
  return out
}

const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

const LANGS = ['en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'kk', 'ko', 'nl', 'pl', 'pt', 'ru', 'th', 'tr', 'uk', 'uz', 'vi', 'zh']

/** A value for every param any barrage message takes. */
const ARGS = {
  n: 7, max: 9, name: 'X', count: 2, from: 1, to: 2, cost: 12, desc: 'D', ability: 'A', hp: 5, row: 3, kills: 4,
  coins: 5, time: '1:00', date: '2026-09-24', total: 50, skill: 'S'
}

describe('barrage locales', () => {
  const en = flatten(byLang.en ?? {})

  it('ships every locale the game ships', () => {
    expect(Object.keys(byLang).sort()).toEqual([...LANGS].sort())
  })

  it('carries the run-3 keys (recap "earned", chest name tip)', () => {
    for (const k of ['breach.recapEarned', 'breach.recapAria', 'supply.filling', 'hud.coinGain']) {
      expect(en[k], k).toBeTruthy()
    }
  })

  it('carries the death title ("Wasted" / run 9: "Überrannt" — "Gefallen" read as the boss dying); the retired overrun lesson sentence is gone', () => {
    expect(en['breach.wasted']).toBe('Wasted')
    expect(flatten(byLang.de ?? {})['breach.wasted']).toBe('Überrannt')
    expect(en['coach.overrun']).toBeUndefined()
  })

  it('carries the run-4 keys (the rank plaque name tip)', () => {
    expect(en['hud.rank']).toBe('Global rank')
  })

  for (const lang of LANGS) {
    it(`${lang}: same keys and params as English, and every message compiles`, () => {
      const flat = flatten(byLang[lang] ?? {})
      expect(Object.keys(flat).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(flat)) {
        expect(v.trim(), `${lang}:${k}`).not.toBe('')
        expect(params(v), `${lang}:${k}`).toEqual(params(en[k]!))
      }
      const i18n = createI18n({ legacy: false, locale: lang, messages: { [lang]: { barrage: byLang[lang] } } })
      for (const k of Object.keys(flat)) {
        const out = i18n.global.t(`barrage.${k}`, ARGS)
        expect(out, `${lang}:${k}`).not.toContain('{')
        expect(out, `${lang}:${k}`).not.toBe(`barrage.${k}`)
      }
    })
  }
})
