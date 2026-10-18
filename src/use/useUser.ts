import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { mobileCheck } from '@/utils/function'
import { DIFFICULTY, type Difficulties } from '@/utils/enums'
import { isDbInitialized, isSplashScreenVisible } from '@/use/useMatch'
import { saveDataVersion } from '@/use/useSaveStatus'
import { LANGUAGE_EXPLICIT_KEY } from '@/i18n'
import { getState, setState, hasState } from '@/use/useEpicState'

export const windowWidth = ref(window.innerWidth)
export const windowHeight = ref(window.innerHeight)

export const orientation = ref(mobileCheck() && windowWidth.value > windowHeight.value ? 'landscape' : 'portrait')

export const isMobileLandscape = computed(() =>
  mobileCheck() && windowWidth.value > 500 && orientation.value === 'landscape'
)
export const isMobilePortrait = computed(() =>
  mobileCheck() && windowWidth.value < windowHeight.value
)

// ─── Android system navigation bar ───────────────────────────────────────────
//
// On Android the page viewport can extend UNDERNEATH the system navigation bar
// (back / home / recents). Edge-to-edge WebViews do it by default — Android 15
// enforces it — and so do the portal apps that embed the game. In portrait that
// puts the bottom-anchored spawn row behind those buttons, where taps go to the
// system instead of the game: the run becomes unplayable, not just cramped.
//
// There is nothing to measure — those hosts report `env(safe-area-inset-bottom)`
// as 0, which is exactly why the row ends up there — so we reserve a fixed
// strip instead. 40px on top of the layout's existing 8px of bottom padding
// clears Android's 48dp three-button bar. Consumers apply it as a FLOOR
// (`max(env(...), Npx)`), so a host that DOES report a real inset never
// double-counts it.
const isAndroid = /Android/i.test(navigator.userAgent)
export const ANDROID_NAV_BAR_PX = 40
export const androidNavBarPx = computed(() =>
  isAndroid && windowWidth.value < windowHeight.value ? ANDROID_NAV_BAR_PX : 0
)

// A short viewport (≤ 500px tall) where the full-size desktop result/reward
// overlay overflows — e.g. the game embedded in a portal iframe on a
// Chromebook (~764×385). Deliberately NOT gated on `mobileCheck()`, so it
// catches the non-touch short-embed case that `isMobileLandscape` misses; the
// overlay uses it to shrink the title, drop the tiles line, and tighten gaps.
export const isShortViewport = computed(() => windowHeight.value <= 500)

// "Exceptionally small" viewport — the HUD chrome (wave badge, gold wallet)
// must shrink for REAL, not scale down, because a `transform: scale()` keeps
// the element's original box in the flow and gives none of the space back to
// the merge grid. Two ways to qualify:
//
//   • ≤ 500px tall  — the wide-and-short embeds (portal iframe on a Chromebook
//     ~764×385, the ~1200×435 landscape frame QA tests). Here the top bar's
//     vertical footprint is what starves the grid.
//   • ≤ 400px wide  — the min-spec 320×658 portrait, where the wave badge and
//     the wallet have to share one row and would otherwise collide.
//
// Consumers shrink font sizes, icon boxes, padding and gaps — and the scene
// re-measures the top bar afterwards, so the reclaimed height goes straight
// into the grid instead of staying reserved.
export const isCompactHud = computed(
  () => windowHeight.value <= 500 || windowWidth.value <= 400
)

// The extreme tier: under 320px in EITHER axis there is no room for anything
// that isn't load-bearing. On top of the compact shrink, consumers also drop
// pure-teaser chrome (the next-chest / new-enemy pips) and secondary labels
// (the upgrade chip names — their icons already identify them).
//
// Two things deliberately do NOT shrink further here: the SPAWN button and the
// merge grid. Spawn is the game's primary verb and the grid is what all this
// reclaimed space is FOR — everything else gives way to them.
export const isUltraCompactHud = computed(
  () => windowHeight.value < 320 || windowWidth.value < 320
)

// The opposite end of the same scale: a viewport with room to spare — desktop
// and large tablets (> 800 × > 600). Everything above tops out at Tailwind's
// `sm:` step, which was tuned so a phone fits; on a 1280×800 desktop that
// leaves the wave badge, the teaser pips and the upgrade-chip labels/costs
// reading as tiny type in a lot of empty space. Consumers step those one tier
// UP here. Both axes must qualify: a wide-but-short embed (the Chromebook
// 764×385 case) is a COMPACT viewport, not a roomy one.
export const isRoomyHud = computed(
  () => windowWidth.value > 800 && windowHeight.value > 600
)

// The in-between case the two tiers above miss: a viewport that is COMPACT by
// height yet plainly a desktop window by width — 1000×450, a laptop-embedded
// portal iframe, a half-height browser window. `isCompactHud` fires on
// `height <= 500`, so those got the full phone treatment, and phone type at
// arm's length on a 1000px-wide screen is simply unreadable (the wave badge at
// 10px, its teaser line at 8px, the upgrade labels at 10px).
//
// The distinction is that compactness here is about VERTICAL budget, not
// legibility. So consumers keep the compact LAYOUT — tight padding, small gaps,
// the shrunken row caps — and lift only the TYPE and the glyphs that sit inline
// with it. The chips already leave ~29px of their 54px row unused at 1000×450,
// so this is paid for out of existing slack rather than out of the merge grid.
//
// The `> 400` height floor keeps genuinely cramped short windows (900×330) on
// the phone sizes, where there is no slack to spend.
export const isWideCompactHud = computed(
  () => isCompactHud.value && windowWidth.value > 800 && windowHeight.value > 400
)

declare const APP_VERSION: string
export const isCrazyWeb = import.meta.env.VITE_APP_CRAZY_WEB === 'true'
export const isWaveDash = import.meta.env.VITE_APP_WAVEDASH === 'true'
export const isItch = import.meta.env.VITE_APP_ITCH === 'true'
export const isGlitch = import.meta.env.VITE_APP_GLITCH === 'true'
export const isGameDistribution = import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'
export const isPlaygama = import.meta.env.VITE_APP_PLAYGAMA === 'true'
export const isGamepix = import.meta.env.VITE_APP_GAMEPIX === 'true'
export const isGameMonetize = import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
export const isYandex = import.meta.env.VITE_APP_YANDEX === 'true'
export const isPoki = import.meta.env.VITE_APP_POKI === 'true'
export const isGamePush = import.meta.env.VITE_APP_GAMEPUSH === 'true'
export const showMediatorAds = import.meta.env.VITE_APP_SHOW_MEDIATOR_ADS === 'true'
export const isNative = import.meta.env.VITE_APP_NATIVE === 'true'
export const isWeb = import.meta.env.VITE_APP_NATIVE !== 'true'
export const isDemo = import.meta.env.VITE_APP_DEMO === 'true'

// "Basic launch" = the plain default build with NO distribution-platform flag
// set (local dev / a bare `vite build`). No ad SDK runs there, so rewarded
// placements can never fill.
export const isBasicLaunch =
  !isCrazyWeb && !isWaveDash && !isItch && !isGlitch && !isGameDistribution &&
  !isPlaygama && !isGamepix && !isGameMonetize && !isYandex && !isPoki && !isGamePush

// Rewarded BUFFS/REWARDS are BOUGHT WITH COINS instead of a rewarded ad on the
// basic launch (no ad SDK) and on any CrazyGames build that is NOT flagged as a
// full release — i.e. VITE_APP_CRAZY_GAMES_FULL_RELEASE is unset OR 'false'
// (only an explicit 'true' opts into real rewarded ads). Every other ad-funded
// portal (GamePix/Yandex/Playgama/…) keeps its own rewarded ads untouched.
// Drives BOTH the payment path (coins vs ad) AND the button icon (coin cost vs
// movie). Build-time literal so the dead branch tree-shakes per build.
export const buffsCostCoins =
  isBasicLaunch ||
  (isCrazyWeb && import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE !== 'true')

export const version: string = APP_VERSION

// ─── Persisted settings (localStorage-backed) ──────────────────────────────
//
// Replaces the old `useUserDb` IndexedDB layer. CG QA flagged the
// `user_db` / `user_os` store as "data saved locally" — and it was
// holding a pile of CardQuest relics (userHand, userCollection,
// userCampaign, userQuestCards, etc.) that elemental-barrage never reads.
//
// elemental-barrage only persists FOUR user settings:
//   • difficulty / sound volume / music volume / locale
//
// They live in localStorage under the keys below. On a CrazyGames build
// these go through the patched `SaveManager.setItem` and are mirrored
// to `sdk.data` automatically — no separate persistence layer needed.
// Hydrate at boot is a synchronous read; the strategy populates
// localStorage from sdk.data BEFORE the App graph imports.

export const SOUND_KEY = 'spinner_user_sound_volume'
export const MUSIC_KEY = 'spinner_user_music_volume'
export const LANGUAGE_KEY = 'spinner_user_language'
// Provenance flag for LANGUAGE_KEY — see `i18n/index.ts` for why it exists.
// Imported rather than redeclared so there is exactly one definition.

export const DIFFICULTY_KEY = 'spinner_user_difficulty'
// Which background-music track plays during a run. 'cozy' (Cozy Harmony /
// "Gemütliche Harmonie", bg-cozy.ogg) is the default; 'battle' maps to
// battle-theme.ogg (Battle Theme). A player who has a track in their save keeps
// it — the default only picks the first session's music.
export const MUSIC_TRACK_KEY = 'spinner_user_music_track'

// Background-music track id → audio filename (under public/audio/music/).
export type MusicTrack = 'battle' | 'cozy'
export const MUSIC_TRACK_FILES: Record<MusicTrack, string> = {
  battle: 'battle-theme.ogg',
  cozy: 'bg-cozy.ogg'
}
export const DEFAULT_MUSIC_TRACK: MusicTrack = 'cozy'
// Legacy saves may still hold the retired 'trance' id — coerce any unknown
// value back to the default so the resolver never lands on a missing file.
export const normalizeMusicTrack = (v: string): MusicTrack =>
  Object.prototype.hasOwnProperty.call(MUSIC_TRACK_FILES, v) ? (v as MusicTrack) : DEFAULT_MUSIC_TRACK

const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : fallback
}
const readString = <T extends string>(key: string, fallback: T): T => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  return String(v) as T
}

/** Default audio levels for a fresh install. Exported so the mute toggle
 *  (`useCrazyMuteSync`) can restore to the same levels when a user unmutes
 *  but there's no pre-mute snapshot to fall back to. */
export const DEFAULT_SOUND_VOLUME = 0.7
export const DEFAULT_MUSIC_VOLUME = 0.6

const userSoundVolume: Ref<number> = ref(readNumber(SOUND_KEY, DEFAULT_SOUND_VOLUME))
const userMusicVolume: Ref<number> = ref(readNumber(MUSIC_KEY, DEFAULT_MUSIC_VOLUME))
const userLanguage: Ref<string> = ref(readString(LANGUAGE_KEY, 'en'))
// Difficulty defaults to MEDIUM; Easy slows travel speed −20%, Hard +10%
// (applied in useEpicGame's per-frame speed calc via `difficultySpeedFactor`).
const userDifficulty: Ref<Difficulties> = ref(readString<Difficulties>(DIFFICULTY_KEY, DIFFICULTY.MEDIUM))
// Background-music track — defaults to 'cozy' (Cozy Harmony).
const userMusicTrack: Ref<MusicTrack> = ref(normalizeMusicTrack(readString<string>(MUSIC_TRACK_KEY, DEFAULT_MUSIC_TRACK)))

// Re-read on hydrate-success bump. Module init reads these synchronously
// from localStorage, but on cloud-only builds (CrazyGames) the blob is
// in-memory only — `useUser.ts` is one of the few composables imported at
// the top of `main.ts`, so its module evaluation runs BEFORE
// `await saveManager.init()` populates the blob from `sdk.data`. Without
// this watcher the user's saved difficulty / volume / language would
// silently revert to defaults on every refresh.
//
// Settings-stranding fix: after refreshing refs from localStorage, write
// the current ref value back for any setting still null in localStorage.
// Triggers the patched setItem path → strategy.onLocalSet → sdk.data, so
// even a player who never opens OptionsModal ends up with their settings
// round-tripping through the cloud. Idempotent for returning players
// because hydrate has already populated localStorage from sdk.data.
//
// LANGUAGE is intentionally NOT seeded here: main.ts handles it
// separately so the CrazyGames portal locale (`cgLocale`) can seed
// first-time players. If we wrote the default 'en' here, main.ts's
// "is there a stored choice?" probe would always see a value and
// never apply the portal locale to a fresh player.
watch(saveDataVersion, () => {
  userSoundVolume.value = readNumber(SOUND_KEY, userSoundVolume.value)
  userMusicVolume.value = readNumber(MUSIC_KEY, userMusicVolume.value)
  userLanguage.value = readString(LANGUAGE_KEY, userLanguage.value)
  userDifficulty.value = readString<Difficulties>(DIFFICULTY_KEY, userDifficulty.value)
  userMusicTrack.value = normalizeMusicTrack(readString<string>(MUSIC_TRACK_KEY, userMusicTrack.value))

  if (!hasState(SOUND_KEY)) setState(SOUND_KEY, userSoundVolume.value)
  if (!hasState(MUSIC_KEY)) setState(MUSIC_KEY, userMusicVolume.value)
  if (!hasState(DIFFICULTY_KEY)) setState(DIFFICULTY_KEY, userDifficulty.value)
  if (!hasState(MUSIC_TRACK_KEY)) setState(MUSIC_TRACK_KEY, userMusicTrack.value)
})

/** Travel-speed multiplier for the active difficulty: Easy −20% (more reaction
 *  time), Medium ×1, Hard +10% (tighter timing). Read each frame by the game. */
export const difficultySpeedFactor = (): number => {
  if (userDifficulty.value === DIFFICULTY.EASY) return 0.8
  if (userDifficulty.value === DIFFICULTY.HARD) return 1.1
  return 1
}

// Boot signal that several composables (`main.ts`, `useCrazyMuteSync`,
// the i18n loader) wait on. Previously the IDB hydrate flipped this; with
// localStorage we have synchronous reads, so flip immediately. The
// SaveManager has already populated localStorage from the cloud strategy
// before this module evaluates (see `main.ts`: `await saveManager.init()`
// runs BEFORE `import('@/App.vue')`).
isDbInitialized.value = true
isSplashScreenVisible.value = false

// One-time legacy cleanup. CG QA's standing rule is "NO locally-saved
// data" — both localStorage AND sessionStorage count. We sweep relics
// from prior builds at module load:
//   • `user_db` IndexedDB store — held CardQuest userHand / userCollection
//     / quest-* relics nothing here references.
//   • `card*` keys (case-insensitive) — the CardQuest-era prefix that
//     produced `cardQuestUserLanguage`, `cardQuestSoundVolume`, etc.
//   • `chaosArena*` keys — the interim prefix from the
//     2026-05-04 build. We no longer mirror the locale hint to
//     sessionStorage at all (the value lives in `spinner_user_language`,
//     which flows through `sdk.data` on CG), so any existing
//     `chaosArena*` entry is also dead data.
// Fire-and-forget — errors are swallowed because there is nothing to
// recover. Runs at module load (useUser.ts is imported at the top of
// main.ts) so the data is gone before the rest of the app boots.
try {
  if (typeof window !== 'undefined' && window.indexedDB?.deleteDatabase) {
    const req = window.indexedDB.deleteDatabase('user_db')
    req.onerror = () => { /* no-op: harmless if locked / already gone */
    }
  }
} catch { /* harmless */
}
const LEGACY_KEY_RE = /^(card|chaosArena)/i
const sweepLegacyKeys = (storage: Storage) => {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && LEGACY_KEY_RE.test(k)) toRemove.push(k)
    }
    for (const k of toRemove) storage.removeItem(k)
  } catch { /* harmless */
  }
}
sweepLegacyKeys(localStorage)
sweepLegacyKeys(sessionStorage)

// ─── Composable surface ───────────────────────────────────────────────────

const useUser = () => {
  const setSettingValue = (name: string, value: unknown) => {
    switch (name) {
      case 'sound':
        userSoundVolume.value = +(value as number)
        setState(SOUND_KEY, userSoundVolume.value)
        break
      case 'music':
        userMusicVolume.value = +(value as number)
        setState(MUSIC_KEY, userMusicVolume.value)
        break
      case 'language':
        userLanguage.value = value as string
        setState(LANGUAGE_KEY, userLanguage.value)
        // Stamp provenance. Reaching this case means a human picked a language
        // in the Options modal — the ONLY thing that counts as an explicit
        // choice. Portal locales are never routed through here any more (see
        // `main.ts`), and legacy cloud rows written by the old portal-seeding
        // code carry no flag, so they cannot outrank the portal.
        setState(LANGUAGE_EXPLICIT_KEY, true)
        break
      case 'difficulty':
        userDifficulty.value = value as Difficulties
        setState(DIFFICULTY_KEY, userDifficulty.value)
        break
      case 'musicTrack':
        userMusicTrack.value = normalizeMusicTrack(value as string)
        setState(MUSIC_TRACK_KEY, userMusicTrack.value)
        break
    }
  }

  return {
    userSoundVolume,
    userMusicVolume,
    userLanguage,
    userDifficulty,
    userMusicTrack,
    setSettingValue
  }
}

export default useUser
