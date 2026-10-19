import type { I18n } from 'vue-i18n'
import { LANGUAGES } from '@/utils/enums'
import { getState, hasState, removeState, setState } from '@/use/useEpicState'
import { applyLocaleDirection } from './localeDirection'

export { applyLocaleDirection, isRtlLocale } from './localeDirection'

/**
 * Locale loader — lazy, code-split, cache-safe.
 *
 * Every file under `./locales/*.ts` is registered with Vite as a
 * dynamic import, which makes each locale its own chunk. The selected
 * locale is fetched on demand; the rest stay out of the critical path.
 *
 * The `{ import: 'default' }` option tells Vite to unwrap the module's
 * default export automatically so callers get the raw messages object.
 */
const localeLoaders = import.meta.glob<Record<string, unknown>>(
  './locales/*.ts',
  { import: 'default' }
)

/** In-memory cache so repeat `loadLocale` calls don't re-import. */
const localeCache = new Map<string, Record<string, unknown>>()
/** Shared in-flight promises so concurrent calls coalesce. */
const localeInFlight = new Map<string, Promise<Record<string, unknown>>>()

const pathFor = (code: string) => `./locales/${code}.ts`

export const isSupportedLocale = (code: string | null | undefined): code is string =>
  !!code && LANGUAGES.includes(code)

/**
 * Dynamically load a single locale's message bundle. Safe to call for
 * already-loaded locales (returns the cached object immediately).
 * Throws if the locale file is missing so callers can fall back to `en`.
 */
export const loadLocaleMessages = async (
  code: string
): Promise<Record<string, unknown>> => {
  const cached = localeCache.get(code)
  if (cached) return cached

  const inflight = localeInFlight.get(code)
  if (inflight) return inflight

  const loader = localeLoaders[pathFor(code)]
  if (!loader) throw new Error(`[i18n] no locale file for "${code}"`)

  const promise = loader().then((msgs) => {
    const resolved = (msgs ?? {}) as Record<string, unknown>
    localeCache.set(code, resolved)
    localeInFlight.delete(code)
    return resolved
  })
  localeInFlight.set(code, promise)
  return promise
}

/**
 * Ensure a locale is registered with the given i18n instance and switch to
 * it. Designed to be called from UI code (OptionsModal language dropdown,
 * CrazyGames locale sync, etc.) — it will no-op if the locale is already
 * the active one and messages are already present.
 *
 * On load failure, the promise resolves *without* switching so the UI
 * keeps rendering the previously active locale.
 */
export const setI18nLocale = async (
  i18n: I18n<any, any, any, string, false>,
  code: string
): Promise<void> => {
  const target = isSupportedLocale(code) ? code : 'en'
  const g: any = i18n.global
  // Already-loaded locales can switch synchronously.
  if (g.availableLocales.includes(target)) {
    g.locale.value = target
    applyLocaleDirection(target)
    return
  }
  try {
    const msgs = await loadLocaleMessages(target)
    g.setLocaleMessage(target, msgs)
    g.locale.value = target
    // Direction / font-stack / script-class must follow the locale on EVERY
    // switch, not just at boot — otherwise picking Arabic from the Options
    // modal swaps the strings but leaves the page LTR in a Latin-only font.
    applyLocaleDirection(target)
  } catch (e) {
    console.error(`[i18n] failed to load locale "${target}"`, e)
  }
}

/** Where the player's explicit in-game language choice lives (a field inside
 *  the single `umbrella_state` blob, not a bare localStorage key). */
const LANGUAGE_KEY = 'spinner_user_language'

/**
 * Provenance marker for `LANGUAGE_KEY`, written ONLY by
 * `useUser.setSettingValue('language', …)` — i.e. only when a human picks a
 * language in the Options modal.
 *
 * Why a second field is necessary: until this was fixed, `main.ts` seeded the
 * PORTAL locale into `LANGUAGE_KEY` via that same setter for first-time
 * players. Those writes went to the cloud, so a value in `LANGUAGE_KEY` alone
 * is ambiguous — it may be a real choice, or a portal locale an old build
 * captured. Playgama QA hit exactly that: a cloud row holding `'en'` that the
 * player never chose outranked the portal's Arabic, on a QA profile with no
 * device-local marker to detect a "change" from. The game stayed English and
 * the ticket read "the platform signal to change the locale did not have any
 * effect".
 *
 * Legacy rows have no flag ⇒ they are NOT treated as explicit, so the portal
 * wins and the poisoned value is self-healing. A player who really did choose
 * a language re-picks once and is then sticky forever.
 */
export const LANGUAGE_EXPLICIT_KEY = 'spinner_user_language_explicit'

/** True when the player has deliberately picked a language in the Options
 *  modal (on this or any device — both fields are cloud-hydrated). Distinct
 *  from "the ref happens to say 'en'", which is just the default, AND from a
 *  legacy portal-seeded value, which carries no provenance flag. */
export const hasExplicitLanguageChoice = (): boolean =>
  hasState(LANGUAGE_KEY) && getState<unknown>(LANGUAGE_EXPLICIT_KEY) === true

/** Mark the current `LANGUAGE_KEY` value as a genuine player choice. Called
 *  from `useUser.setSettingValue('language', …)`. */
export const markExplicitLanguageChoice = (): void => {
  try {
    setState(LANGUAGE_EXPLICIT_KEY, true)
  } catch { /* ignore */ }
}

/**
 * Forget the player's stored language choice.
 *
 * Used ONLY when the PLATFORM language actively changes underneath us — at
 * that point the stored choice is stale and the portal is the fresher signal.
 * The removal routes through the state layer, so the cloud copy is dropped
 * too and another device can't resurrect it.
 */
export const clearExplicitLanguageChoice = (): void => {
  try {
    removeState(LANGUAGE_KEY)
    removeState(LANGUAGE_EXPLICIT_KEY)
  } catch { /* ignore */ }
}

/**
 * Last portal-reported language we observed, so we can tell "the portal is
 * still reporting the same thing" from "the portal actively switched".
 *
 * Deliberately NOT an `epic_`/`spinner_`/`ca_` key: those are payload keys
 * that mirror to the cloud (see `SaveMergePolicy.isPayloadKey`), and syncing
 * this marker would make a second device on a different portal language look
 * like a language switch. Pure device-local bookkeeping, written straight to
 * raw localStorage.
 */
const PORTAL_LANGUAGE_SEEN_KEY = 'pg_portal_language_seen'

/**
 * Record the portal's current language and report whether it CHANGED since
 * the last observation.
 *
 * **This is the "the platform signal to change the locale had no effect"
 * fix.** "Explicit player choice always wins" is correct on every ordinary
 * load, but it fails the exact flow Playgama QA runs: pick English in-game,
 * then flip the platform language in the guided-testing tools — the UI must
 * follow. A stored choice is authoritative until the platform language itself
 * moves; then it is stale.
 *
 * Returns **false on the very first observation** (no previous value ⇒ nothing
 * changed), so shipping this tracking can't drop a returning player's choice.
 * Idempotent: re-checking the value just recorded reports no change, so the
 * boot check and the mid-session poll can both call it freely.
 *
 * Skipped on CrazyGames builds — CG QA's standing rule is "NO locally-saved
 * data" beyond dev toggles. With no marker, CG keeps stored-choice-always-wins.
 */
export const notePortalLanguageChange = (code: string): boolean => {
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') return false
  try {
    const previous = window.localStorage.getItem(PORTAL_LANGUAGE_SEEN_KEY)
    if (previous !== code) window.localStorage.setItem(PORTAL_LANGUAGE_SEEN_KEY, code)
    return isSupportedLocale(previous) && previous !== code
  } catch {
    return false
  }
}

export interface ResolveLocaleOptions {
  /**
   * Allow `navigator.language` as a last resort before English.
   *
   * MUST be false on every portal build. Two independent browser-language
   * leaks were making the game boot in a language nobody asked for, which
   * Playgama QA filed as "the game started in another language, but the
   * default language must be English":
   *
   *   1. This function's own `navigator.language` step.
   *   2. The bridge itself — the Playgama docs state "if the platform does
   *      not provide a language, Bridge falls back to the browser language",
   *      so `platform.language` is NOT proof the portal asked for anything.
   *
   * On a portal build the chain is therefore: explicit player choice →
   * portal-reported language → English. Never the browser.
   *
   * Standalone web builds (itch, direct hosting) keep the browser fallback,
   * where it genuinely is the best guess and no portal contract applies.
   */
  allowNavigatorFallback?: boolean
}

/**
 * Resolve the locale we should boot with, synchronously, before creating
 * the i18n instance so the first dynamic import targets only the right
 * locale file. Resolution order:
 *
 *   1. `spinner_user_language` — the player's EXPLICIT choice, cloud-hydrated
 *      by `SaveManager.init()` before `main.ts` calls us. This is checked
 *      FIRST. It previously came second, so on every portal load the
 *      portal's language won the first paint and a player who had explicitly
 *      picked Spanish saw a flash of the portal's language before the
 *      post-hydrate watcher corrected it.
 *   2. Caller-supplied `preferred` hint — the portal-reported locale
 *      (CrazyGames / Yandex / Playgama). Display-only; the caller must NOT
 *      have persisted it (see `main.ts`).
 *   3. `navigator.language` — ONLY when `allowNavigatorFallback` is set,
 *      i.e. never on a portal build.
 *   4. 'en'.
 */
export const resolveInitialLocale = (
  preferred?: string | null,
  opts: ResolveLocaleOptions = {}
): string => {
  // `hasExplicitLanguageChoice()` — not a bare `hasState` — so a legacy
  // portal-seeded value (no provenance flag) cannot win the first paint.
  const stored = getState<string | undefined>(LANGUAGE_KEY)
  if (hasExplicitLanguageChoice() && isSupportedLocale(stored)) return stored
  if (isSupportedLocale(preferred)) return preferred
  if (opts.allowNavigatorFallback) {
    const nav = typeof navigator !== 'undefined'
      ? navigator.language?.split('-')[0]
      : undefined
    if (isSupportedLocale(nav)) return nav
  }
  return 'en'
}
