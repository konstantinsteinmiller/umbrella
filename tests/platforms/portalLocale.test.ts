// Playgama QA, two tickets:
//
//   A. "The game started in another language, but the default language must
//      be English."
//   B. "The game did not correctly display content in Arabic. Possible
//      causes: language parameter was ignored on initialization, missing
//      fonts, text overflows UI bounds, some content remained in the default
//      language."
//
// Ticket A had TWO independent browser-language leaks:
//   1. `resolveInitialLocale` fell back to `navigator.language`.
//   2. The bridge itself — per Playgama's docs, "if the platform does not
//      provide a language, Bridge falls back to the browser language" — so
//      `platform.language` is not proof the portal asked for anything.
// …plus the resolver checked the portal hint BEFORE the player's stored
// choice, so a player who had picked Spanish got a first paint in the
// portal's language.
//
// And the portal locale was PERSISTED into `spinner_user_language` (the
// player-choice key), which rode the cloud save into every later session —
// the exact reason Playgama filed the same ticket twice against chaos-arena.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getStateMock, removeStateMock } = vi.hoisted(() => ({
  getStateMock: vi.fn(),
  removeStateMock: vi.fn()
}))

vi.mock('@/use/useEpicState', () => ({
  STATE_KEY: 'umbrella_state',
  getState: getStateMock,
  hasState: (k: string) => getStateMock(k) != null,
  removeState: removeStateMock
}))

import { resolveInitialLocale, isSupportedLocale } from '@/i18n'
import {
  applyLocaleDirection,
  isRtlLocale,
  fontStackFor,
  scriptClassFor
} from '@/i18n/localeDirection'

/** Seed a stored language.
 *  `explicit` models the provenance flag written only by the Options modal.
 *  `explicit: false` reproduces a LEGACY cloud row — a portal locale an older
 *  build seeded into the player-choice key, which must NOT outrank the portal. */
const setStored = (v: string | undefined, explicit = true) => {
  getStateMock.mockImplementation((k: string) => {
    if (k === 'spinner_user_language') return v
    if (k === 'spinner_user_language_explicit') return (v !== undefined && explicit) ? true : undefined
    return undefined
  })
}

const setNavigatorLanguage = (lang: string) => {
  Object.defineProperty(window.navigator, 'language', {
    value: lang, configurable: true
  })
}

beforeEach(() => {
  getStateMock.mockReset()
  setStored(undefined)
  setNavigatorLanguage('en-US')
  document.documentElement.className = ''
  document.documentElement.removeAttribute('dir')
  document.documentElement.removeAttribute('lang')
})

describe('Ticket A — default language must be English on a portal build', () => {
  it('ignores a non-English browser language when no portal locale is given', () => {
    setNavigatorLanguage('de-DE')
    // Portal build => allowNavigatorFallback OFF.
    expect(resolveInitialLocale(null, { allowNavigatorFallback: false })).toBe('en')
  })

  it('ignores the browser language even for a locale the game ships', () => {
    setNavigatorLanguage('ru-RU')
    expect(resolveInitialLocale(null, { allowNavigatorFallback: false })).toBe('en')
  })

  it('still honours the browser language on a NON-portal build', () => {
    // Standalone web / itch: no portal contract, browser guess is correct.
    setNavigatorLanguage('de-DE')
    expect(resolveInitialLocale(null, { allowNavigatorFallback: true })).toBe('de')
  })

  it('applies a portal-reported language when the game ships it', () => {
    expect(resolveInitialLocale('ar', { allowNavigatorFallback: false })).toBe('ar')
  })

  it('falls back to English for a portal language the game does not ship', () => {
    expect(resolveInitialLocale('sv', { allowNavigatorFallback: false })).toBe('en')
  })
})

describe('Ticket A — the player\'s explicit choice outranks the portal', () => {
  it('stored choice wins over the portal hint on the FIRST paint', () => {
    // The regression: the resolver checked `preferred` first, so a player who
    // had chosen Spanish saw a flash of the portal's language every load.
    setStored('es')
    expect(resolveInitialLocale('de', { allowNavigatorFallback: false })).toBe('es')
  })

  it('stored choice wins over the browser language too', () => {
    setStored('ja')
    setNavigatorLanguage('fr-FR')
    expect(resolveInitialLocale(null, { allowNavigatorFallback: true })).toBe('ja')
  })

  it('an unsupported stored value does not strand the player', () => {
    setStored('xx')
    expect(resolveInitialLocale('de', { allowNavigatorFallback: false })).toBe('de')
  })
})

describe('Ticket B — Arabic renders right-to-left', () => {
  it('marks ar as RTL and the Latin/CJK locales as LTR', () => {
    expect(isRtlLocale('ar')).toBe(true)
    expect(isRtlLocale('en')).toBe(false)
    expect(isRtlLocale('ja')).toBe(false)
  })

  it('sets dir="rtl" and lang on the document root for Arabic', () => {
    applyLocaleDirection('ar')
    expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    expect(document.documentElement.getAttribute('lang')).toBe('ar')
  })

  it('restores dir="ltr" when switching back off Arabic', () => {
    applyLocaleDirection('ar')
    applyLocaleDirection('en')
    expect(document.documentElement.getAttribute('dir')).toBe('ltr')
    expect(document.documentElement.classList.contains('script-arabic')).toBe(false)
  })
})

describe('Ticket B — fonts name real Arabic/CJK faces, not just a generic', () => {
  it('Arabic gets real system Arabic faces before the generic fallback', () => {
    const stack = fontStackFor('ar')
    // The playbook rule: a Latin-only display face + a bare generic gives
    // tofu. At least one real Arabic-capable family must precede sans-serif.
    expect(stack).toMatch(/Geeza Pro|Noto Naskh Arabic|Noto Sans Arabic|Tahoma/)
    const genericAt = stack.indexOf('sans-serif')
    const arabicAt = stack.search(/Geeza Pro|Noto Naskh Arabic|Tahoma/)
    expect(arabicAt).toBeGreaterThan(-1)
    expect(arabicAt).toBeLessThan(genericAt)
  })

  it('CJK gets real system CJK faces before the generic fallback', () => {
    const stack = fontStackFor('ja')
    expect(stack).toMatch(/Hiragino Sans|Yu Gothic UI|Meiryo|Noto Sans JP/)
    expect(stack.search(/Hiragino Sans|Meiryo/)).toBeLessThan(stack.indexOf('sans-serif'))
  })

  it('never inlines a webfont URL — portal budget rule', () => {
    for (const code of ['ar', 'ja', 'zh', 'ko', 'en']) {
      expect(fontStackFor(code)).not.toMatch(/url\(|https?:/)
    }
  })

  it('keeps the Latin display face first so the Latin look is unchanged', () => {
    // Umbrella's Latin face is Zora Rounded, with Angry behind it for any glyph it lacks; Arabic and
    // CJK open with faces that have their scripts (the other tests in this block).
    for (const code of ['en', 'de', 'fr']) {
      expect(fontStackFor(code).startsWith("'Zora Rounded','Angry'")).toBe(true)
    }
  })

  it('publishes the stack as a CSS custom property on the root', () => {
    applyLocaleDirection('ar')
    const v = document.documentElement.style.getPropertyValue('--app-font-stack')
    expect(v).toMatch(/Noto Naskh Arabic|Geeza Pro|Tahoma/)
  })
})

describe('Ticket B — Latin typographic idioms are disabled per script', () => {
  it('tags Arabic and CJK with their own script class', () => {
    expect(scriptClassFor('ar')).toBe('script-arabic')
    expect(scriptClassFor('zh')).toBe('script-cjk')
    expect(scriptClassFor('ja')).toBe('script-cjk')
    expect(scriptClassFor('ko')).toBe('script-cjk')
    expect(scriptClassFor('en')).toBe('script-latin')
  })

  it('swaps the script class rather than accumulating them', () => {
    applyLocaleDirection('ar')
    applyLocaleDirection('zh')
    const cl = document.documentElement.classList
    expect(cl.contains('script-cjk')).toBe(true)
    expect(cl.contains('script-arabic')).toBe(false)
    expect(cl.contains('script-latin')).toBe(false)
  })
})

describe('Ticket B — every shipped locale is a real locale', () => {
  it('ar is a supported locale', () => {
    expect(isSupportedLocale('ar')).toBe(true)
  })
})

// ─── Trap C: change-wins (the re-test killer) ──────────────────────────────
//
// Playgama QA: "The platform signal to change the locale did not have any
// effect." Their flow is: pick English in-game → flip the platform language in
// the guided testing tools → the UI must follow.
//
// "Explicit player choice always wins" — correct on every ordinary load —
// fails exactly this. A stored choice is authoritative until the PLATFORM
// language itself moves; then it is stale. Ported from chaos-arena, where the
// same ticket was filed twice.
import {
  notePortalLanguageChange,
  clearExplicitLanguageChoice,
  hasExplicitLanguageChoice
} from '@/i18n'

const SEEN_KEY = 'pg_portal_language_seen'

describe('Trap C — a portal language CHANGE outranks the stored choice', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // The base `.env` ships VITE_APP_CRAZY_WEB=true and vitest inherits it, so
    // without this stub every call takes the CrazyGames early-return below and
    // the whole mechanism silently reports "no change". Same `.env`-inheritance
    // footgun that made `build:playgama` ship a CrazyGames bundle.
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'false')
  })
  afterEach(() => { vi.unstubAllEnvs() })

  it('reports NO change on the very first observation', () => {
    // Critical: otherwise every returning player loses their choice the first
    // time this tracking ships.
    expect(notePortalLanguageChange('ar')).toBe(false)
    expect(window.localStorage.getItem(SEEN_KEY)).toBe('ar')
  })

  it('reports a change when the portal actually switches', () => {
    expect(notePortalLanguageChange('en')).toBe(false)  // first observation
    expect(notePortalLanguageChange('ar')).toBe(true)   // portal switched
  })

  it('is idempotent — re-checking the recorded value reports no change', () => {
    // The boot check and the 2s poll both call this; the second must be inert.
    notePortalLanguageChange('en')
    expect(notePortalLanguageChange('ar')).toBe(true)
    expect(notePortalLanguageChange('ar')).toBe(false)
    expect(notePortalLanguageChange('ar')).toBe(false)
  })

  it('ignores an unsupported previous value rather than firing a false change', () => {
    window.localStorage.setItem(SEEN_KEY, 'sv')  // never shipped
    expect(notePortalLanguageChange('ar')).toBe(false)
  })

  it('stores the marker OUTSIDE the cloud-mirrored payload keys', () => {
    // An `epic_`/`spinner_`/`ca_` prefix would sync to the cloud, and a second
    // device on a different portal language would look like a switch.
    notePortalLanguageChange('ar')
    expect(SEEN_KEY.startsWith('epic_')).toBe(false)
    expect(SEEN_KEY.startsWith('spinner_')).toBe(false)
    expect(SEEN_KEY.startsWith('ca_')).toBe(false)
  })

  it('clearExplicitLanguageChoice drops the stored choice', () => {
    setStored('en')
    expect(hasExplicitLanguageChoice()).toBe(true)
    clearExplicitLanguageChoice()
    expect(removeStateMock).toHaveBeenCalledWith('spinner_user_language')
  })

  it('the full QA flow: chose English, portal flips to Arabic → Arabic wins', () => {
    setStored('en')
    // Load 1 — portal is English, player picked English. No change.
    expect(notePortalLanguageChange('en')).toBe(false)
    expect(hasExplicitLanguageChoice()).toBe(true)
    expect(resolveInitialLocale('en', { allowNavigatorFallback: false })).toBe('en')

    // Load 2 — QA flipped the portal to Arabic.
    expect(notePortalLanguageChange('ar')).toBe(true)   // → caller clears the choice
    clearExplicitLanguageChoice()
    setStored(undefined)                                 // choice is now gone
    expect(resolveInitialLocale('ar', { allowNavigatorFallback: false })).toBe('ar')
  })
})

describe('Trap C — CrazyGames opts out of the marker', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { vi.unstubAllEnvs() })

  it('never records the marker on CG builds ("NO locally-saved data")', () => {
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
    expect(notePortalLanguageChange('en')).toBe(false)
    expect(notePortalLanguageChange('ar')).toBe(false)   // no change EVER
    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull()
  })
})


// ─── The poisoned-cloud regression (the QA screenshot) ─────────────────────
//
// Reproduced against the real built bundle: portal reports `ar`, the Playgama
// cloud row carries `spinner_user_language: 'en'` written by an older build's
// portal-seeding code, the QA profile is fresh so there is no device-local
// change marker — and the game stayed English forever. "The platform signal to
// change the locale did not have any effect."
//
// A value is only an explicit choice if it carries the provenance flag that
// `setSettingValue('language', …)` stamps. Legacy rows have none, so they lose
// to the portal and the poisoned value self-heals.
describe('Legacy portal-seeded language must not outrank the portal', () => {
  it('a legacy stored value (no provenance flag) loses to the portal', () => {
    setStored('en', false)                       // as an old build left it
    expect(hasExplicitLanguageChoice()).toBe(false)
    expect(resolveInitialLocale('ar', { allowNavigatorFallback: false })).toBe('ar')
  })

  it('a genuine choice (with the flag) still beats the portal', () => {
    setStored('es', true)                        // picked in the Options modal
    expect(hasExplicitLanguageChoice()).toBe(true)
    expect(resolveInitialLocale('ar', { allowNavigatorFallback: false })).toBe('es')
  })

  it('a legacy value still loses even when the portal agrees with nothing', () => {
    // No portal locale at all -> English, not the un-chosen legacy value.
    setStored('ru', false)
    expect(resolveInitialLocale(null, { allowNavigatorFallback: false })).toBe('en')
  })

  it('the flag alone, with no language value, is not a choice', () => {
    getStateMock.mockImplementation((k: string) =>
      k === 'spinner_user_language_explicit' ? true : undefined)
    expect(hasExplicitLanguageChoice()).toBe(false)
  })
})
