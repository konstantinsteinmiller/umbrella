// ─── The player UI's theme: which look the menus, HUD and touch controls wear ──
//
// The drawn (vector) game keeps its plain UI; the two painted builds dress it to match their art:
//   · 'lantern' — "Paper Moon": lit washi paper in a lacquer frame, gold-leaf cloud scrolls,
//     vermilion lacquer buttons, a lantern-festival night behind it.
//   · 'clay'    — "Rainy Day Post": plasticine slabs, rolled postal-blue clay rope, sewing-button
//     rivets, postage-stamp perforations and raindrops.
// The kite build keeps its own look (no theme). The flags are folded per build (kite.ts), so a
// drawn build carries the theme's CSS but never its class: nothing of it applies there.
//
// The scene puts `ui-theme ui-<name>` on its root and provides the theme; the menu components
// read it with `useUiTheme()` (so the level editor, which shares LanguageSelect and ConfirmModal,
// stays plain) and theme their own scoped styles under that root class.
import { inject, type InjectionKey } from 'vue'
import { isClay, isKite, isLantern } from '@/umbrella/kite'
import '@/assets/css/umbrella-ui.css'

export type UiTheme = 'lantern' | 'clay'

/** This build's UI theme, or null for the plain UI (the drawn and kite builds). */
export const uiTheme: UiTheme | null = isKite ? null : isLantern ? 'lantern' : isClay ? 'clay' : null

export const UI_THEME: InjectionKey<UiTheme | null> = Symbol('umbrella-ui-theme')

/** The root classes for a theme: `ui-theme` (shared rules) and `ui-<name>` (its tokens). */
export const uiThemeClass = (theme: UiTheme | null): string[] => (theme ? ['ui-theme', `ui-${theme}`] : [])

/** The theme of the scene this component sits in (null outside the game scene). */
export const useUiTheme = (): UiTheme | null => inject(UI_THEME, null)
