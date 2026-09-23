import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { ACHIEVEMENTS } from '@/use/useAchievements'
import { BALL_SKINS } from '@/barrage/ballSkins'

/**
 * `barrageMeta.*` ships in all 21 locales with the SAME shape as English: no
 * locale may miss a key (it would fall back to English mid-sentence), carry a
 * different `{param}` set (it would print a raw placeholder), or hold a message
 * vue-i18n cannot compile. Every achievement id and ball skin the code knows
 * must have its name.
 */

const files = import.meta.glob<{ default: Record<string, unknown> }>('@/i18n/locales/barrageMeta/*.ts', { eager: true })
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

describe('barrageMeta locales', () => {
  const en = flatten(byLang.en ?? {})

  it('ships every locale the game ships', () => {
    expect(Object.keys(byLang).sort()).toEqual([...LANGS].sort())
  })

  it('has a name for every achievement, a template per metric, and every ball skin', () => {
    for (const a of ACHIEVEMENTS) {
      expect(en[`achievements.items.${a.id}`], a.id).toBeTruthy()
      expect(en[`achievements.desc.${a.metric}`], a.metric).toContain('{n}')
    }
    for (const s of BALL_SKINS) expect(en[`collections.skinNames.${s.id}`], s.id).toBeTruthy()
  })

  for (const lang of LANGS) {
    it(`${lang}: same keys and params as English, and every message compiles`, () => {
      const flat = flatten(byLang[lang] ?? {})
      expect(Object.keys(flat).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(flat)) {
        expect(v.trim(), `${lang}:${k}`).not.toBe('')
        expect(params(v), `${lang}:${k}`).toEqual(params(en[k]!))
      }
      const i18n = createI18n({ legacy: false, locale: lang, messages: { [lang]: { barrageMeta: byLang[lang] } } })
      for (const k of Object.keys(flat)) {
        const out = i18n.global.t(`barrageMeta.${k}`, { n: 7, c: 1, t: 2, current: 3, total: 30, tier: 4, time: '1:00', skill: 'X' })
        expect(out, `${lang}:${k}`).not.toContain('{')
        expect(out, `${lang}:${k}`).not.toBe(`barrageMeta.${k}`)
      }
    })
  }
})
