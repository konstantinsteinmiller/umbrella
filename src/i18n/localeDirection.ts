// ─── Script direction + script-class application ───────────────────────────
//
// Playgama QA: "the game did not correctly display content in Arabic."
// Arabic failed on three of the four documented causes at once, and none of
// them were translation coverage (`ar.ts` is fully translated):
//
//   • **Direction.** Nothing in the app ever set `dir`, so Arabic rendered
//     left-to-right. Punctuation lands on the wrong end, and mixed
//     Arabic/number strings ("موجة 137") reorder wrongly.
//
//   • **Fonts.** The only declared face is `Angry` (a Latin-only display
//     font). Arabic fell through to the generic `sans-serif`, which is a
//     coin-flip per platform — tofu (□□□) on any system whose default
//     sans has no Arabic coverage. The playbook rule is to name REAL system
//     faces before any generic, and never to inline a CJK/Arabic webfont
//     (3–8 MB blows the portal budget).
//
//   • **Latin typographic idioms.** `text-transform: uppercase`,
//     `font-style: italic` and negative `letter-spacing` are meaningless or
//     destructive outside Latin. Arabic is a *cursive joined* script:
//     letter-spacing literally breaks the joins between glyphs, and
//     synthesised italic shears them. Uppercase is a no-op for Arabic but
//     still shears Han when combined with the other two. These are disabled
//     via a `script-*` class on the root rather than by editing all 51 call
//     sites (see `index.sass`).
//
// This module is the single place that knows which locale needs what. It is
// deliberately dependency-free (no Vue, no i18n import) so it can be called
// from `main.ts` before the app mounts AND from the runtime locale switch
// without creating a cycle.

/** Locales written right-to-left. Only `ar` ships today; `fa`/`he`/`ur`
 *  are listed so adding one of those locale files can't silently regress
 *  direction handling. */
const RTL_LOCALES: ReadonlySet<string> = new Set(['ar', 'fa', 'he', 'ur'])

/** Locales whose script is broken by Latin typographic idioms. Arabic is
 *  cursive/joined; CJK is ideographic and gets sheared by fake-italic and
 *  negative tracking. */
const ARABIC_LOCALES: ReadonlySet<string> = new Set(['ar', 'fa', 'ur'])
const CJK_LOCALES: ReadonlySet<string> = new Set(['zh', 'ja', 'ko'])

export const isRtlLocale = (code: string): boolean => RTL_LOCALES.has(code)

/**
 * Font stack per script.
 *
 * `Angry` stays FIRST for Latin so the game keeps its display face; the
 * browser falls through per-glyph to the next family that actually has a
 * given codepoint, so naming real Arabic / CJK system faces after it fixes
 * those scripts without changing the Latin look at all.
 *
 * Every family named here ships with at least one major OS:
 *   • Arabic  — Segoe UI / Tahoma (Windows), Geeza Pro (macOS/iOS),
 *               Noto Naskh + Noto Sans Arabic (Android/ChromeOS/Linux)
 *   • CJK     — Microsoft YaHei / Meiryo / Malgun Gothic (Windows),
 *               PingFang / Hiragino / Apple SD Gothic Neo (macOS/iOS),
 *               Noto Sans CJK (Android/Linux)
 *
 * `sans-serif` remains as the last resort, never as the only fallback.
 */
const LATIN_STACK =
  `'Angry', 'Segoe UI', Roboto, system-ui, sans-serif`

const ARABIC_STACK =
  `'Angry', 'Segoe UI', Tahoma, 'Geeza Pro', 'Noto Naskh Arabic', `
  + `'Noto Sans Arabic', 'Arabic Typesetting', system-ui, sans-serif`

const CJK_STACK =
  `'Angry', 'PingFang SC', 'Hiragino Sans', 'Yu Gothic UI', Meiryo, `
  + `'Microsoft YaHei', 'Malgun Gothic', 'Apple SD Gothic Neo', `
  + `'Noto Sans CJK SC', 'Noto Sans JP', 'Noto Sans KR', system-ui, sans-serif`

export const fontStackFor = (code: string): string => {
  if (ARABIC_LOCALES.has(code)) return ARABIC_STACK
  if (CJK_LOCALES.has(code)) return CJK_STACK
  return LATIN_STACK
}

/** The `script-*` class applied to `<html>`. `index.sass` keys the
 *  uppercase / italic / letter-spacing suppression off it. */
export const scriptClassFor = (code: string): string => {
  if (ARABIC_LOCALES.has(code)) return 'script-arabic'
  if (CJK_LOCALES.has(code)) return 'script-cjk'
  return 'script-latin'
}

const SCRIPT_CLASSES = ['script-latin', 'script-arabic', 'script-cjk'] as const

/**
 * Apply direction, language and script class for `code` to the document.
 * Idempotent — safe to call on every locale switch.
 *
 * Sets `dir` / `lang` on `<html>` (not `<body>`) so the UA's own bidi
 * handling, form controls and scrollbar placement all follow, and so CSS
 * `:dir()` / logical properties resolve correctly for the whole tree.
 */
export const applyLocaleDirection = (code: string): void => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('lang', code)
  root.setAttribute('dir', isRtlLocale(code) ? 'rtl' : 'ltr')
  root.classList.remove(...SCRIPT_CLASSES)
  root.classList.add(scriptClassFor(code))
  root.style.setProperty('--app-font-stack', fontStackFor(code))
}
