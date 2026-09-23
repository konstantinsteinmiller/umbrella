import { onMounted, onUnmounted, ref } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import { setState } from '@/use/useEpicState'
import { toggleDebug } from '@/use/useMatch'
import { EB_SUPPLY_KEY } from '@/barrage/keys'
import type { SkillId } from '@/barrage/engine/types'

// `cheat` stays a top-level localStorage flag — it's an explicit dev toggle
// that gates the whole keyboard-shortcut module, so we don't want it living
// inside the gameplay save blob (where a cloud restore could re-enable
// cheats on a clean device).
const storedCheat = localStorage.getItem('cheat') || 'false'
const isCheat = ref<boolean>(JSON.parse(storedCheat))

const setCheat = (on: boolean): void => {
  isCheat.value = on
  try { localStorage.setItem('cheat', JSON.stringify(on)) } catch { /* storage blocked */ }
  console.warn(`[CHEAT] cheats ${on ? 'ENABLED' : 'disabled'}.`)
}
/** Flip the cheat-shortcut module on/off (persisted). Bound to the `cmarc`
 *  sequence below so a tester can enable the +coins / row-jump keys live,
 *  no reload needed (the keydown handler gates on `isCheat` at press time). */
export const toggleCheat = (): void => setCheat(!isCheat.value)

// ─── Always-on key-sequence cheat: type "cmarc" to flip debug mode. ──────
//
// Sits OUTSIDE the `useCheats` factory so it works even when the regular
// cheat module is gated off — flipping `isDebug` is itself the entry point
// to dev tooling (editor button, perf meter, etc.).
//
// Exported + idempotent so a boot-time caller (App.vue setup) can guarantee
// it installs at app start. The old module-level `installDebugUnlock()` call
// only ran when this file's side-effects were retained — but App.vue's bare
// `import useCheats` is tree-shaken in production (the default export is never
// called there), and the only other importer is the LAZY game scene, so on a
// built bundle the sequence listener wasn't attached until the player was
// already in-game (and never at all if they typed it on the menu). Calling
// the exported initialiser from executed setup code can't be tree-shaken.
let debugUnlockInstalled = false
export const installDebugUnlock = (): void => {
  if (typeof window === 'undefined' || debugUnlockInstalled) return
  debugUnlockInstalled = true
  const target = 'cmarc'
  let buf = ''
  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return el.isContentEditable
  }
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) { buf = ''; return }
    const k = e.key.toLowerCase()
    // Non-character keys (Shift, Tab, arrow keys) don't reset the buffer
    // outright — they just don't extend it — so the cheat survives a stray
    // modifier press. Anything else of length 1 gets appended.
    if (k.length !== 1) return
    buf = (buf + k).slice(-target.length)
    if (buf === target) {
      buf = ''
      toggleDebug()
      toggleCheat()
    }
  })
}
// Best-effort module-level install for dev (vite serve keeps side-effects);
// App.vue also calls installDebugUnlock() in setup so production builds — where
// this bare side-effect can be tree-shaken — still attach the listener at boot.
installDebugUnlock()

// ─── Barrage cheats ──────────────────────────────────────────────────────────
// The run owner is imported LAZILY: this module is loaded by App.vue on every
// build, and a static import would drag the whole barrage engine into the entry
// chunk just to serve a dev shortcut. The first cheat press pays the import.
type BarrageCheats = typeof import('@/barrage/state/useBarrage')['barrageCheats']
const withBarrage = (fn: (c: BarrageCheats) => void): void => {
  void import('@/barrage/state/useBarrage').then((m) => {
    m.default() // make sure the singleton (and its engine) exists
    fn(m.barrageCheats)
  })
}

const barrageActions = {
  jumpToRow: (row: number): void => withBarrage((c) => {
    c.jumpToRow(row)
    console.warn(`[CHEAT] Jumped to row ${row}.`)
  }),
  nextBoss: (): void => withBarrage((c) => {
    c.jumpToNextBoss()
    console.warn('[CHEAT] Next row is the boss.')
  }),
  fillTray: (tier: number): void => withBarrage((c) => {
    console.warn(c.fillTray(tier)
      ? `[CHEAT] Tray filled with tier ${tier}.`
      : '[CHEAT] Fill tray only works while aiming.')
  }),
  forceChest: (): void => withBarrage((c) => {
    console.warn(c.forceChest()
      ? '[CHEAT] Flying chest incoming.'
      : '[CHEAT] Force chest only works while aiming.')
  }),
  forceBreach: (): void => withBarrage((c) => {
    console.warn(c.forceBreach()
      ? '[CHEAT] Every monster is at the floor — fire once to breach.'
      : '[CHEAT] Force breach only works while aiming.')
  }),
  grantBalls: (tier: number, n = 1): void => withBarrage((c) => c.grantBalls(tier, n)),
  grantSkill: (skill: SkillId): void => withBarrage((c) => c.grantSkillCharge(skill)),
  supplyReady: (): void => {
    setState(EB_SUPPLY_KEY, 0)
    console.warn('[CHEAT] Supply drop is ready.')
  }
}

/** Console access for testers (`__barrage.jumpToRow(57)` …) — every call is
 *  refused unless cheats were switched on with the `cmarc` sequence. */
const installConsoleCheats = (): void => {
  if (typeof window === 'undefined') return
  const gated = Object.fromEntries(Object.entries(barrageActions).map(([k, fn]) => [k, (...args: unknown[]) => {
    if (!isCheat.value) {
      console.warn('[CHEAT] cheats are off — type "cmarc" first.')
      return
    }
    ;(fn as (...a: unknown[]) => void)(...args)
  }]))
  ;(window as unknown as Record<string, unknown>).__barrage = gated
}

const useCheats = () => {
  // NOTE: no early return on `isCheat` — the listeners install for the app
  // lifetime and gate live inside `handleKeyDown`, so typing `cmarc` enables the
  // shortcuts immediately (previously they only armed on the next reload).
  const { addCoins } = useEpicConfig()

  const cheatsMap: Record<string, () => void> = {
    // Rows: ctrl+shift+1…9 → the row just before boss 1…9 (rows 9, 19, … 89).
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [
      `ctrl+shift+${i + 1}`, () => barrageActions.jumpToRow((i + 1) * 10 - 1)
    ])),
    // Tray: ctrl+shift+alt+1…9 → fill the tray with tier 1…9 balls.
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [
      `ctrl+shift+alt+${i + 1}`, () => barrageActions.fillTray(i + 1)
    ])),
    'ctrl+shift+alt+b': () => barrageActions.nextBoss(),
    'ctrl+shift+alt+k': () => { addCoins(20_000); console.warn('[CHEAT] +20,000 coins.') },
    'ctrl+shift+alt+m': () => { addCoins(1_000_000); console.warn('[CHEAT] +1,000,000 coins.') },
    // Launch the flying chest right now instead of waiting out its timer.
    'ctrl+shift+alt+c': () => barrageActions.forceChest(),
    // Put every monster on the floor line so the next march breaches.
    'ctrl+shift+alt+x': () => barrageActions.forceBreach(),
    // +1 Shield and +1 Revive for the endless run.
    'ctrl+shift+alt+r': () => {
      barrageActions.grantSkill('shield')
      barrageActions.grantSkill('revive')
      console.warn('[CHEAT] +1 shield, +1 revive.')
    },
    'ctrl+shift+alt+s': () => barrageActions.supplyReady()
  }

  const heldKeys = new Set<string>()
  const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta'])

  const normalizeKey = (e: KeyboardEvent): string | null => {
    const codeMatch = e.code.match(/^Digit(\d)$/)
    if (codeMatch) return codeMatch[1]!
    const k = e.key.toLowerCase()
    return MODIFIER_KEYS.has(k) ? null : k
  }

  const buildShortcut = (e: KeyboardEvent): string => {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')
    const sorted = [...heldKeys].sort()
    parts.push(...sorted)
    return parts.join('+')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.add(key)
    if (!isCheat.value) return
    const shortcut = buildShortcut(e)
    if (cheatsMap[shortcut]) {
      e.preventDefault()
      cheatsMap[shortcut]!()
    }
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.delete(key)
  }

  const handleBlur = () => {
    heldKeys.clear()
  }

  onMounted(() => {
    installConsoleCheats()
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleBlur)
  })

  return { isCheat }
}

export default useCheats
