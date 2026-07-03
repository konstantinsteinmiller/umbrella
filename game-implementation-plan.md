# Merge Idle War — Implementation Plan

This file is the working blueprint for implementing the game described in `GDD.md`.
It exists so work can resume from a known checkpoint if a session is interrupted.

## 0. Starting point

The repo is a copy of the **epicrolla** ball-rolling game template. It ships a rich,
reusable cross-cutting platform layer that we KEEP and build on:

- **Multi-platform builds** (`src/platforms/*`, `vite.config.ts`, `.env.*`): CrazyGames,
  GameDistribution, GamePix, GameMonetize, Playgama, Yandex, itch, Glitch, Wavedash.
- **Cloud save** (`src/utils/save/*`, `SaveManager`): single-blob persistence + cloud mirror.
- **Ads** (`src/use/useAds.ts`, `src/use/ads/*`): rewarded + interstitial, with a Noop fallback.
- **Audio** (`src/use/useSound.ts`): Web-Audio SFX (object-pooled) + bg music with pause gate.
- **i18n** (`src/i18n/*`, 21 locales) with `en` fallback.
- **Responsive helpers** (`src/use/useUser.ts`): `isMobilePortrait/Landscape`, `windowWidth/Height`,
  safe-area handling patterns.
- **Coin wallet + fly-to VFX** (`useEpicConfig`, `useCoinExplosion`, `CoinBadge`).
- **Reusable UI**: `OptionsModal`, `FModal`, `FButton`, `FMuteButton`, `DailyRewards`,
  `AdRewardButton`, `useScreenshake`.

### Pre-existing breakage (must fix first)
The project-rename script replaced the identifier `mawState` with the **invalid**
`gameState` (hyphens) across 7 files, so the project does NOT compile.
We fix this while satisfying the GDD requirement: **all state lives in one object `merge-idle-war_state`.**

## 1. State — `merge-idle-war_state` (Task 1)
- Rewrite `src/use/useEpicState.ts`:
  - `STATE_KEY = 'merge-idle-war_state'`, in-memory ref renamed `prismState` (valid identifier).
  - Keep the existing exported API names (`getState/setState/hasState/removeState/reloadEpicState/
    flushPersist/__resetEpicState`) so the platform layer keeps working unchanged.
- Replace `gameState` → `prismState` in the 6 importing files.
- `keys.ts`: add merge-game field keys (all are properties INSIDE `merge-idle-war_state`):
  `prism_gold`, `prism_grid`, `prism_upgrades`, `prism_index`, `prism_stats`, `prism_onboarded`,
  `prism_page_rewards`.

## 2. Data (Task 2)
- `src/game/ingredients.ts` — 10 tiers per GDD §3.2: id, tier, name, chem property, body color,
  accent color, face style flags (sparks, leaf, helmet…). Vector-cartoon palette.
- `src/game/recipes.ts` — 50 recipes. Each: id, ordered-insensitive formula `[tierA,tierB,tierC]`,
  potion name, rarity (`standard` | `legendary`), bottle shape, liquid color, effect descriptor,
  collection/page, discovery hint. The 3 GDD example recipes are included verbatim.
  Effects are data-described; a subset are wired to real modifiers (worker speed, instant gold,
  cheaper upgrades) and the rest grant gold + collection progress.

## 3. Core logic — `usePrismGame.ts` (Task 3)
- Grid model: `rows×cols` slots (4×4 default; 3×4 on very short viewports) of `{tier}` or null.
- `spawnIngredient()` — fills a random empty slot with a Tier-1 (or upgraded base tier) unit;
  costs gold OR a recharging free-spawn timer; blocked when grid full.
- `merge(from,to)` — same-tier → tier+1, with discovery bookkeeping (max tier seen).
- Cauldron: holds up to capacity (3). `inject(tier)` adds an element; at capacity → `brew()`.
- `brew()` resolves: exact recipe → standard/legendary; else containment-roll → sub-potion or sludge.
  Pressure stat → double-yield chance. Heat stat → synthesis time. Emits an outcome event for VFX.
- Economy: gold via `useEpicConfig`. Upgrades: `heat/pressure/containment/automation` with cost
  curves; automation = idle imp that merges + injects on a timer.
- Index: unlocked recipe ids; page-completion multipliers.
- Everything persisted through `setState` into `merge-idle-war_state`.

## 4. VFX — `usePrismParticles.ts` + `ParticleCanvas.vue` (Task 4)
- Single pooled particle array (cap ~280), one RAF, dpr-clamped to 2.
- Emitters: `confetti` (merge), `bubbles` (cauldron, rate scales with thermal tier + heat),
  `splash` (lane drop), `sparkle` (spawn/idle), `rays` (legendary). Auto-throttle when hidden.

## 5. Components (Task 5)
- `IngredientUnit.vue` — inline SVG anthropomorphic face per tier (bold black strokes), idle
  breathing, drag scale, squish-merge keyframes. Pure presentational.
- `MergeGrid.vue` — owns unified pointer drag: pick up unit → floating ghost follows pointer →
  drop hit-tests slots (merge) or lanes (inject). Touch + mouse; `touch-none`; safe-area aware.
- `Cauldron.vue` — emotive cauldron (eyes/mouth react to contents), animated liquid fill with
  sine surface, boil rattle/expand on full, burst flash.
- `InjectionLanes.vue` — 3 lanes; dropped unit detaches and gravity-slides into the cauldron.
- `UpgradePanel.vue` — heat/pressure/containment/automation buttons with gauges.
- `IndexBookModal.vue` — sticker-album grid: silhouettes + hints, reveal/slap animation, page
  completion bars + milestone multipliers.
- `PotionRevealOverlay.vue` — center sticker reveal; legendary full-screen dim + rays + gold type.

## 6. Scene + i18n (Task 6)
- Rewrite `src/views/GameScene.vue` per GDD §7.2 wireframe: top bar (Index button + Gold), lab
  visualizer (cauldron + lanes + heat gauge + particles), upgrade controls, merge grid + Spawn.
  No main menu — boots straight into the lab. Fully `vw/vh`/flex, safe-area insets, all orientations,
  min 320×658.
- Wire SFX to existing files (`water-splash`→splash, `coin-pickup`, `level-up`→merge,
  `happy`/`celebration-*`→brew success, `lose`→sludge, `expand`→boil, `modal-open`→sticker slap).
- Reuse `OptionsModal`, `FMuteButton`, `DailyRewards`, `AdRewardButton`, `CoinBadge`,
  `useCoinExplosion`. 2× potion reward + free-gold via rewarded ads.
- All UI copy under a new `prism` i18n namespace in `en` (source). Ingredient/recipe NAMES are
  game proper-nouns kept in the data files; the `en` fallback covers untranslated locales at
  runtime (vue-i18n `fallbackLocale:'en'`). Full pro-localization of game content = roadmap item.

## 7. Verify + docs (Task 7)
- `vue-tsc --build` clean; manual responsive check (portrait/landscape/desktop).
- Write the future-features roadmap (≥15 items) per GDD §"After implementing".

## Status log
- [x] Plan written.
- [x] Task 1 — state/merge-idle-war_state + compile fix (all state in one `merge-idle-war_state` blob; fixed 7 broken files)
- [x] Task 2 — data (`src/game/ingredients.ts` 10 tiers, `src/game/recipes.ts` 50 recipes + 9 pages)
- [x] Task 3 — logic (`src/use/usePrismGame.ts`: grid/merge/cauldron/brew/economy/upgrades/index/automation)
- [x] Task 4 — VFX (`usePrismParticles.ts` pooled engine + `ParticleCanvas.vue`)
- [x] Task 5 — components (IngredientUnit, Cauldron, InjectionLanes, MergeGrid, UpgradePanel,
      IndexBookModal, PotionBottle, PotionRevealOverlay)
- [x] Task 6 — scene + i18n (`GameScene.vue` rewritten; `prism` namespace in `en`)
- [x] Task 7 — verify + roadmap (`vue-tsc` clean, `vite build` green, browser-verified; `retention-roadmap.md`)

## Verified in-browser (Chrome DevTools)
- Spawn → merge (Tier-1 ×2 → Tier-2 Ember Squirt) → inject ×3 → brew → `[1,1,1]` = **First Water**
  NEW-DISCOVERY reveal, +40 gold, sticker placed; Index → 1/50; gold persisted across reload.
- `localStorage.merge-idle-war_state` holds ALL game state in ONE object (GDD requirement met).
- Portrait 390×780, short-landscape 820×400 (auto side-by-side), and min 320×658 — all clean,
  no console errors, no horizontal overflow.

## Known follow-ups (see retention-roadmap.md)
- Ingredient/recipe NAMES are English game-content with vue-i18n `en` runtime fallback for other
  locales; full content localisation = roadmap #16. New-player FTUE/economy cushion = #1 / #17.
