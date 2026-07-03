# Merge Idle War — Retention & Game-Feel Roadmap

Prioritised backlog of post-launch features, sorted by **expected impact** on the
metrics the brief calls out: **Day-1 retention**, **average playtime**,
**easy-to-pick-up / hard-to-put-down**, and **conversion of new players**. Each
item lists *what*, *why* (which metric it moves), and an *actionable* implementation
note grounded in the current codebase (`usePrismGame`, `prism_state`, the SaveManager,
the `useAds` rewarded/interstitial layer, the particle system, the i18n bundle).

Effort key: **S** ≈ <½ day · **M** ≈ 1–2 days · **L** ≈ 3+ days.

---

### 1. Guided first-session tutorial (FTUE) — *Day-1 retention, pick-up* · M
**What:** A 4-step coach-mark flow on the very first session: "drag two droplets together →
merge", "drag a unit up into the cauldron", "fill the cauldron to brew", "tap to place your
first sticker". Hand-hold to the first discovery within ~30s.
**Why:** The first brew is the aha-moment; players who reach it on day 1 retain far better.
**How:** Add a `prism_tutorial_step` field to `prism_state`. Drive a lightweight overlay
component off it; advance on the real `merge`/`injectFromGrid`/`brewOutcome` events the game
already emits. Spotlight target slots with a pulsing ring (reuse the `.slot-hover` style).

### 2. Idle / offline earnings with a "Welcome back" claim — *retention, conversion* · M
**What:** While away, the Helper Imp keeps "working". On return, show a "While you were gone:
+N gold, M brews" modal with a **2× rewarded** claim button.
**Why:** The single strongest re-open driver in idle/merge games; also a clean rewarded-ad slot.
**How:** Persist `prism_last_seen` (ms) in `prism_state`. On mount, compute elapsed × an
idle-rate derived from `automationMs`/`pageGoldMult` (cap ~8h). Grant on claim via
`useEpicConfig.addCoins`; gate the 2× on `isRewardedReady` + `showRewardedAd`.

### 3. Daily login calendar + first-brew-of-day bonus — *Day-1/Day-7 retention* · S
**What:** 7-day escalating login reward and a one-time daily "first brew pays 3×" buff.
**Why:** Proven streak mechanic; gives a reason to open every day.
**How:** A `DailyRewards`-style modal already exists in the template — wire it to gold.
Track `prism_daily` (`{ day, streak }`) in `prism_state`; reset the engine's
`buffs.goldMult` style temp buff for the first brew each new local day.

### 4. Quest / order board ("Brew 3 potions for Lord Vex → reward") — *playtime, pick-up* · M
**What:** 3 rotating short-goal cards ("merge to Tier 5", "brew any Storm potion", "earn 2k
gold") with chunky gold/booster payouts.
**Why:** Converts an open sandbox into directed sessions → longer, goal-driven play.
**How:** New `useQuests` composable persisting `prism_quests` in `prism_state`; subscribe to
the existing `stats`, `brewOutcome`, and `maxTier` reactivity to tick progress.

### 5. Grid expansion + bench/storage upgrades — *playtime, depth* · M
**What:** Spend gold to grow the grid (4×4 → 5×5) and unlock a side "bench" to park units.
**Why:** Removes the soft "grid full" wall; gives a long-tail gold sink that deepens play.
**How:** `GRID_COLS/GRID_ROWS` are already constants; promote them to upgrade-driven state in
`prism_state` and make `sanitizeGrid` size-aware. The CSS grid + container-query square already
adapt to any column count.

### 6. Combo / brew-streak multiplier with escalating juice — *hard-to-put-down* · S
**What:** Consecutive successful (non-sludge) brews build a streak that ramps gold and VFX
intensity (more confetti, screen-shake, rising pitch).
**Why:** Creates a "one more brew" flow loop; pure dopamine pacing.
**How:** Track a streak counter in `usePrismGame.resolveBrew`; feed it into `earnGold` and
scale `emitConfetti` count + `useScreenshake` (already in the template). Reset on sludge.

### 7. "Next discovery" nudge + recipe peek — *pick-up, playtime* · S
**What:** A persistent hint showing the closest almost-completable recipe ("You're 1 unit from
**Volcanic Brew**"), with a rewarded "reveal a recipe" option.
**Why:** Curiosity is the core driver (GDD §1.2); always dangle the next sticker.
**How:** Diff the player's reachable tiers against `RECIPES`; surface the nearest. Reuse the
reveal overlay styling. Rewarded reveal via `showRewardedAd`.

### 8. Booster shop (temp Heat/Pressure/Auto surges) bought with gold or rewarded — *conversion* · M
**What:** Consumable boosters ("10-min 2× gold", "instant cauldron auto-fill") purchasable with
gold or a rewarded ad.
**Why:** Adds a high-frequency rewarded surface and a meaningful gold sink → conversion + playtime.
**How:** Extend the existing `RecipeEffect`/`buffs` system — the temp-buff plumbing
(`goldMult`/`spawnSpeed`/`autoBoost`) already exists; expose it as purchasable items.

### 9. Juicier merge/brew feel pass — *hard-to-put-down* · S
**What:** Add haptics (`navigator.vibrate` on mobile), a tiny time-freeze + flash on Tier-up,
ingredient "anticipation" wiggle before a valid drop, and cauldron lip-overflow on a full brew.
**Why:** Tactile satisfaction is Core Pillar #1; small touches massively lift perceived quality.
**How:** Hook `navigator.vibrate(12)` into `MergeGrid.fireMerge` / inject. Add a one-frame white
flash div on legendary. All cheap, GPU-light additions to existing handlers.

### 10. Prestige / "Transcend the Lab" reset layer — *long-term retention* · L
**What:** Once the index is far enough, prestige for a permanent "Essence" currency that buys
global multipliers, resetting grid/upgrades.
**Why:** Gives end-game players a reason to keep returning for weeks.
**How:** New `prism_prestige` block; Essence as a second wallet. Fold an Essence multiplier into
`goldMultTotal`. Confirm-modal + celebratory full-screen sequence (reuse legendary rays).

### 11. Cauldron & lab cosmetic skins (gold + rewarded unlocks) — *conversion, identity* · M
**What:** Alternate cauldron faces, lab backdrops, potion-glass tints; some gold-bought, some
rewarded-unlock, some milestone-gated.
**Why:** Cosmetics drive both engagement and ad/IAP conversion without pay-to-win.
**How:** A `SkinModal` scaffold already exists in the template. Drive the cauldron's gradients
+ face set from a `prism_skins` selection; the cauldron SVG is already data-driven.

### 12. Push-style "cauldron is idle / charges full" local reminders (native) — *retention* · M
**What:** On the Tauri/native build, schedule a local notification when spawn charges cap or an
idle reward is ready.
**Why:** Re-engagement without a server. Strong Day-1→Day-2 lift on mobile.
**How:** The repo already ships a Tauri pipeline (`tauri-mobile-ci` skill); use the notification
plugin, scheduled from `prism_last_seen` + charge-regen math.

### 13. Collection-page completion ceremonies + set bonuses — *playtime, completion drive* · S
**What:** Make page completion a moment: full-screen banner (exists), a chest open, and a
visible permanent badge on the Index tab. Tease the *next* page's reward.
**Why:** "Gotta finish the page" is the sticker-album hook; reward the milestone loudly.
**How:** `pageComplete` already fires. Add a chest-open animation (reuse `TreasureChest`) and
render claimed-page badges in `IndexBookModal`.

### 14. Smarter automation tiers (priority targeting, recipe-aware imp) — *idle quality* · M
**What:** Higher Imp levels let it pursue a *chosen target recipe* (auto-merge toward it,
auto-brew it) instead of greedy highest-tier.
**Why:** Makes idle progression feel intelligent and worth investing in → deeper upgrade sink.
**How:** Extend `autoStep` with an optional `targetRecipeId` from `prism_state`; bias
`findMergePair` and the inject pick toward the formula's tiers.

### 15. Live-ops events ("Double Gold Weekend", themed limited recipes) — *retention cadence* · M
**What:** Time-boxed events with a banner, boosted rewards, and a few event-only stickers.
**Why:** Recurring novelty is the backbone of long-term LiveOps retention.
**How:** A static event config (date-gated, shippable without a backend) read at boot; flip a
global multiplier and inject extra `RECIPES`. Localise event copy via the i18n `prism` namespace.

### 16. Full content localisation of ingredient & recipe names — *conversion (global reach)* · M
**What:** Translate the 10 ingredient names + 50 recipe names/hints into the 21 shipped locales
(currently English game-content with `en` runtime fallback).
**Why:** Non-English portals (Yandex, Playgama, GamePix) convert far better when content is native.
**How:** Move the display strings from `ingredients.ts`/`recipes.ts` into the i18n bundles under
`prism.ingredients.*` / `prism.recipes.*`; keys already structured for it.

### 17. Onboarding "starter surge" + anti-stall economy tuning — *Day-1 retention* · S
**What:** Seed new players with a small gold cushion and a faster first-minute spawn cadence so
they never hit a dead wait; analytics-driven curve tuning after.
**Why:** Early friction (full grid, 0 gold, slow charges) is the top Day-1 churn cause.
**How:** Seed `epic_coins` on first boot (no `prism_state`), temporarily lower `SPAWN_REGEN_MS`
for the first N spawns, and expose the constants for A/B tuning.

### 18. Lightweight social proof: leaderboards & shareable discovery cards — *virality, retention* · L
**What:** A discovery-count leaderboard (per platform SDK where available) and a "share my
legendary potion" image card.
**Why:** Competition + sharing extend lifetime and bring organic installs.
**How:** Use the platform SDKs already wired (CrazyGames/Yandex/Playgama leaderboard APIs);
render the share card from the existing `PotionBottle` SVG → canvas.

---

## Suggested sequencing
1. **First wave (retention foundation):** #1 FTUE, #2 Idle earnings, #3 Daily login, #17 economy tuning.
2. **Second wave (depth & playtime):** #4 Quests, #5 Grid expansion, #6 Combo streak, #13 Page ceremonies.
3. **Third wave (monetisation & feel):** #7 Discovery nudge, #8 Boosters, #9 Juice pass, #11 Cosmetics.
4. **Fourth wave (longevity & reach):** #10 Prestige, #14 Smart imp, #15 Live-ops, #16 Localisation, #12 Notifications, #18 Social.
</content>
