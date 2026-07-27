# Merge Idle War — Retention & Game-Feel Roadmap (v2.0 auto-battler)

Prioritised backlog of post-launch features, sorted by **expected impact** on
**Day-1 retention**, **average playtime**, **easy-to-pick-up / hard-to-put-down**,
and **new-player conversion**. Each item lists *what*, *why* (which metric it
moves), and an *actionable* implementation note grounded in the current codebase
(`useBattle.ts`, `usePrismGame.ts`, the `merge-idle-war_state` blob via
`useEpicState`, the `useAds` rewarded layer, and the unwired epicrolla template
components already in the repo: `DailyRewards.vue`, `BattlePass.vue`,
`AchievementsModal.vue`, `SkinModal.vue` / `useEpicSkins`, `useAchievements`).

All new user-facing strings go through i18n (`battle.*` / `prism.*` namespaces,
propagated to every shipped locale).

Effort key: **S** ≈ <½ day · **M** ≈ 1–2 days · **L** ≈ 3+ days.

---

### ✅ 1B. Flying chest reward
A flying chest flies in from left to right every 2 minutes and randomly either grants 150 coins or 
drops a copy of the 2nd best unit(only if available, otherwise level 2 unit) you have on the field.
add to art and sound todo files

### ✅ 1. Guided first-session FTUE (coach-marks) — *Day-1 retention, pick-up* · M
**What:** 4-step overlay on the very first session: "tap SPAWN 4× → recruit
appears", "drag the two droplets together → MERGE", "drag your fighter into the
arena → DEPLOY", "drop a grid unit onto a same-tier fighter → FIELD MERGE heals
it". Hand-hold to the first kill within ~30 s, then get out of the way.
Use lightboxes for the affected UI elements to avoid confusion.
use a one tap spawn on the spawn button for the onboarding session.
**Why:** The first deploy + first kill is the aha-moment; players who see the
army fight on day 1 retain dramatically better. The 4-tap spawn is NOT
self-explanatory without a nudge.
**How:** Persist `prism_tutorial_step` in the state blob. Drive a lightweight
spotlight component (pulsing ring + short label, pointer-events punched through)
off the real events the game already emits: `tapSpawn` fill, `merge()`,
`deployFighter()`, the field-merge path in `useBattle`. Skip entirely when
`battle_best_wave > 1`.

### ✅ 2. First-10-minutes pacing pass — *Day-1 retention* · S
**What:** Script waves 1–5 tighter: wave 1 winnable with two T1s but losable if
idle (no "impossible to lose = 0 fun" dropouts), guaranteed first Runner leak
scare on wave 3, and make the first boss (wave 5) an event — entrance banner,
slow-mo kill, oversized coin fountain, and the War Chest offer surfacing right
after.
**Why:** D1 churn concentrates in the first minutes; a scripted early boss kill
is the hook that converts a first session into a second.
**How:** Add a `wave <= 5` branch in the wave composer (`units.ts`) with
hand-tuned squads instead of formula output; trigger the existing boss-kill
spectacle path in `useBattle` with boosted particle counts for the first boss
only (`battle_stats.bossKills === 0`).

### ✅ 3. Offline earnings + "Welcome back" claim — *re-open rate, conversion* · M
**What:** While away, the Imp Sergeant "keeps fighting". On return after >3 min,
show a modal: "While you were gone: +N gold" with a **2× rewarded** claim button.
**Why:** The single strongest re-open driver in idle games, and a top-performing
rewarded slot. Currently closing the tab earns nothing → no reason to return.
**How:** Persist `battle_last_seen` (epoch ms) in the blob on the existing
wave-clear checkpoint + `pagehide`. On boot, grant
`elapsed × goldPerSecEstimate × automationLevel factor`, capped at 8 h, where
`goldPerSecEstimate` derives from current wave bounty formula
(`6 · 1.09^(wave−1)`) × recent kill rate. Gate the 2× behind `isRewardedReady`;
payout flies to the wallet via the existing `useCoinExplosion`.

### ✅ 4. Wave-milestone chests + next-unlock preview — *hard-to-put-down* · S
**What:** Every 10th wave drops a chest (gold + a free T-high unit onto the
grid). HUD shows a persistent "Next: 🎁 wave 20" pip under the wave counter,
plus "New enemy at wave 7!" teasers.
**Why:** Concrete, always-visible short-term goals are the classic "one more
wave" mechanic — directly extends session length.
**How:** Hook the wave-clear path in `useBattle` (`wave % 10 === 0`); reuse the
boss-kill coin fountain + a `spawnAt(tier)` helper in `usePrismGame` that places
a `min(maxTier−1, …)` unit in a random empty slot. The teaser strings come from
the archetype unlock table already in `units.ts` (Runners w3, Spitters w5,
Brutes w7, Warlocks w9).

### 5. Daily streak rewards — *Day-1→Day-7 retention* · S
**What:** 7-day escalating login calendar (gold scaled by best wave, day 7 = a
free high-tier unit + instant-spawn buff).
**Why:** Proven streak mechanic; cheap because **`DailyRewards.vue` already
exists in the repo** — it only needs wiring to the battler economy.
**How:** Track `daily: { lastClaimDay, streak }` in the blob; scale payouts off
`battle_best_wave` so rewards never feel stale. Show the modal on boot only when
claimable (never block the fast jump into gameplay — slide it in after wave 1
starts).

### 6. Quest / war-orders board — *playtime, session direction* · M
**What:** 3 rotating short goals ("Kill 40 Slimes", "Merge to Tier 6", "Clear
wave 15", "Field-merge 3 times") with chunky gold payouts and a badge on the HUD.
**Why:** Converts open-ended idling into directed sessions; players stay to
finish the third order.
**How:** New `useQuests` singleton composable persisting `battle_quests` in the
blob; progress ticks off the existing `bumpStat` calls in
`useBattle`/`usePrismGame` (kills, merges, fieldMerges, waves are already
counted in `prism_stats` — subscribe, don't re-instrument).

### 7. Prestige — "War Medals" reforge loop — *long-term retention, playtime* · L
**What:** From wave 25+, reset waves/army/grid for **War Medals** granting
permanent multipliers (+X% attack/gold per medal) and a medal-shop (start wave
+5, T2 spawns, 8th army slot).
**Why:** The exponential wave scaling will eventually wall every player;
prestige turns the wall into the core long-game loop and multiplies lifetime
playtime.
**How:** `battle_medals` + `battle_prestige_count` in the blob; medal formula
`floor((bestWave − 20) / 5)` per run. Apply multipliers where the four battle
upgrades already inject (`useBattle` stat computation). Full-screen reforge
ceremony with the existing confetti/screenshake stack — a prestige must feel
like a win, not a loss.

### ✅ 8. "RALLY!" overrun revive (rewarded) — *conversion, frustration kill* · S
**What:** On OVERRUN, before the wave restarts: a 5 s slow-mo offer — "RALLY!
Watch to resurrect your fallen fighters" (rewarded ad → dead fighters return at
full HP; decline → current behavior).
**Why:** Highest-intent rewarded moment in the game (loss aversion beats any
chest), and it removes the sting of the death-spiral for weaker players.
**How:** Buffer the fighter tiers that died during the current wave in
`useBattle`; on the overrun path pause the restart timer, show the offer gated
on `isRewardedReady` (no button when no fill), redeploy via the existing
`deployFighter` on success. Reuse the ad-audio suspend gate around the ad.

### ✅ 9. 2× Boss Bounty rewarded offer — *conversion* · S
**What:** After each boss kill, a 6 s offer chip: "Double the bounty (22×
baseline) — watch ad". Already specified in GDD §6.1 but **not yet implemented**.
**Why:** Boss kills are the emotional peak; doubling a fat, just-earned number
is the easiest rewarded yes in the genre.
**How:** Hook the boss-death event in `useBattle`'s event sink; hold the bounty
payout visual (the coin fountain) until the offer resolves. Gate on
`isRewardedReady`; on decline/no-fill pay 1× immediately. Copy the
`InstantSpawnAdButton.vue` pattern for the chip.

### ✅ 10. Achievements — *playtime, completion pull* · S
**What:** ~20 achievements (first T5/T10 merge, wave 10/25/50, 1 000 kills,
first field merge, combo ×25, boss ×10 …) with toast + gold payout.
**Why:** **`useAchievements` + `AchievementsModal.vue` already exist** — wiring
them to `prism_stats` is nearly free and adds a whole completion axis.
**How:** Define the battler achievement table keyed off existing stats
(`kills`, `waves`, `bossKills`, `merges`, `fieldMerges`, `maxTier`, combo peak —
add `bestCombo` to stats). Toasts reuse the banner system in `BattleArena.vue`.


### ✅ 12. Unit codex + next-tier silhouette — *hard-to-put-down, collection* · S
**What:** A codex of all 10 tiers (tap a grid unit → stats + ability text);
undiscovered tiers show as dark silhouettes with "Merge 2× Tier N to discover!".
The next-undiscovered silhouette also ghosts in the HUD.
**Why:** Silhouette curiosity is the cheapest "one more merge" driver; ability
text also teaches the roster (most players never learn what Bio-Sprout does).
**How:** `maxTier` is already persisted as the discovery watermark. Codex modal
reuses the unit SVGs (via `useArtOverrides` `artSrc()` so dropped-in art shows);
ability copy from a `battle.codex.*` i18n table.

### ✅ 13. Elite & mutator waves — *playtime variety* · M
**What:** From wave 12+, every ~4th non-boss wave rolls a mutator, telegraphed
in the wave banner: **Gold Rush** (2× bounty), **Frost March** (enemies slow
your attack on hit), **Horde** (2× count, 0.5× HP), **Elite** (one glowing
mini-boss with an aura).
**Why:** The composer's formula waves get samey by wave 15; mutators reset
attention and create "let me see the next mutator" pull.
**How:** Extend the wave composer in `units.ts` with a seeded mutator roll;
banner variant in `BattleArena.vue`; per-mutator hooks are small multipliers on
existing paths (bounty mult, status-effect application, squad-size line).

### 14. Unit skins / elemental variants — *conversion, collection* · M
**What:** Unlockable palette-swap skins per tier (gold-earned + a rewarded
"skin chest"), e.g. Obsidian Droplet, Neon Spark.
**Why:** **`SkinModal.vue` + `useEpicSkins` already exist** from the template;
cosmetics give long-horizon goals and a soft rewarded placement.
**How:** Re-point `useEpicSkins` at per-tier SVG palette maps (the units are
inline SVGs — a skin is a color-token swap, no new art needed for v1). Persist
`unit_skins` in the blob; equipped skin renders in grid AND arena.

### 15. Timed free War Chest — *session scheduling, re-open* · S
**What:** Alongside the rewarded War Chest, a small **free** chest on a 4 h
timer ("Supply Drop ready!"). Shows a countdown when not ready.
**Why:** Gives lapsed players a concrete reason to re-open ("my chest is up") —
the classic appointment mechanic — without cannibalizing the rewarded chest
(free ≈ 25% of the rewarded value).
**How:** `supply_drop_at` epoch in the blob; reuse the War Chest button/VFX in
`GameScene.vue` with a countdown state (pattern already in
`InstantSpawnAdButton.vue`).

### ✅ 16. Best-wave leaderboard — *retention, competition* · S
**What:** Submit `battle_best_wave` to the platform leaderboard where the SDK
supports it (CrazyGames, Playgama, Yandex); show "Top 12% of commanders" on
wave-clear banners.
**Why:** Rank framing measurably lifts session count on portals; near-free
since best wave is already tracked and persisted.
**How:** Platform-gated calls in the existing `src/platforms/*` descriptors on
the wave-clear checkpoint; no-op on platforms without the API. Percentile copy
only when the SDK returns rank.

### 17. Game-feel pass v2: haptics + dynamic audio intensity — *game feel* · M
**What:** (a) `navigator.vibrate` micro-haptics on merge/deploy/boss-kill/ult
(mobile web, feature-detected); (b) music intensity layers — filter/low-pass
the battle theme between waves, open it up during combat, add a pitched-up
layer during FEVER; (c) kill-streak escalation: per-10-combo screen pulse +
saturation bump.
**Why:** Directly serves the "Tactile Satisfaction" pillar; fever that *sounds*
different is what makes players chase it.
**How:** Haptics behind a settings toggle (some portals disallow — platform-gate
it). Music layering via a second gain node in `useSound`'s music path
(crossfade, no extra file needed for v1 — low-pass filter swap). Combo pulse
hooks the existing combo event in the sink.

### ✅ 18. Battle Pass — "War Campaign" — *playtime, long-term* · L
**What:** A free-track seasonal pass (kills/waves/merges earn campaign XP →
30 reward tiers: gold, instant-spawn buffs, skins, a medal head-start).
**Why:** **`BattlePass.vue` already exists**; a free track alone adds a
month-horizon goal ladder. Ship LAST — it only multiplies retention that the
items above create.
**How:** Re-skin the template component; XP ticks off `bumpStat`; season state
(`campaign: { season, xp, claimed[] }`) in the blob; season rollover keyed to a
hardcoded date table (no server needed).

---

**Suggested order of attack:** 1 → 2 → 3 → 4 (the D1 core), then 8 + 9 (fastest
conversion wins), then 5/10/12 (cheap wiring of existing components), then the
depth ladder 6 → 7 → 11 → 13, and 14–18 as polish/scale allows.
