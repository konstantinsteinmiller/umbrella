# Elemental Barrage — Game Design Document

**Genre:** Ballz-style volley shooter × marching monster rows × overflow merge (casual, mobile-first).
**One-liner:** Monsters march down the board row by row. Pull back, release, and a volley of elemental
balls ricochets through them — and when your ball tray overflows, twins merge into mightier balls.
**Player fantasy:** "One perfect shot, and the whole board lights up."
**Source concept:** `non-strategy-concepts.md` §4 (Concept B). **Binding spec:** `src/barrage/CONTRACT.md`
(rules, economy, FTUE, monetization, ownership). Balance numbers live in code, tuned by the bot sim:
`src/barrage/engine/economy.ts` + `monsters.ts` (`node --import ./scripts/art/ts-resolve.mjs scripts/barrage-sim.mjs`).

## Pillars
1. **One verb.** Drag back anywhere on the board and release; the dotted line shows the first bounce.
2. **Merges are automatic.** "+1" pickups fill a capped tray; an overflow merges the lowest twin pair into
   the next tier of the 50-portrait elemental ladder, and every tier adds an on-hit power.
3. **Stakes without a game over.** A breach offers a Meteor continue (rewarded, once per checkpoint) or a
   restart at the last boss checkpoint with every coin kept.
4. **Scheduled spectacle.** A boss every 10 rows (enrage at 30 %), FEVER at 50 hits, a flying chest every
   ~2 minutes.
5. **Casual contract** (concept §1): nothing chosen before a run can lose it, aim is the only skill, one
   glowing upgrade, depth from content not systems.

## Core loop
Aim → volley (fast-forwards itself, recall ends it) → monsters march, a new row spawns → collect "+1",
coins and skill bubbles → tray overflow merges → boss at every 10th row → checkpoint → buy the glowing
upgrade → push deeper.

## Systems (implemented)
| System | Where |
|---|---|
| Deterministic rules + physics (fixed step, circle-vs-AABB, seeded rows) | `src/barrage/engine/` |
| Canvas board, VFX, SFX, slingshot input | `src/barrage/render/`, `src/components/barrage/BarrageBoard.vue` |
| Run state, persistence, breach/checkpoint, ads placements | `src/barrage/state/useBarrage.ts` |
| Upgrades (Damage, Capacity, Speed, Luck, Bounty — one glows) | `useBarrageUpgrades.ts`, `UpgradeBar.vue` |
| Collections: 50 launchers, 12 elemental ball skins — shells around the tier's face (glass, stone, tide, gale, frost, amber, lava, diamond, obsidian, glow rune, gilded, eclipse); retired skins refunded once | `useCollections.ts`, `ballSkins.ts`, `render/balls.ts`, `CollectionModal.vue` |
| Daily Barrage (seeded, no continues), treasure chest (small gift at 3 min, big gift at 10 min) | `useDailyBarrage.ts`, `useSupplyDrop.ts`, `SupplyDropButton.vue` |
| Retention: battle pass, achievements, streak calendar, global best-row board (runic rank plaque on the board's top rim, every layout, from the first rank) | `useBattlePass`, `useAchievements`, `DailyRewards`, `useWaveLeaderboard`, `RankBadge.vue` |
| FTUE (aim → pickup → merge → free capacity) — the aim beat is the stretching pull-back arrow on the unit | `useTutorial.ts`, `TutorialOverlay.vue`, `coach/SlingshotDemo.vue` |
| Wordless coach after the FTUE: pull hint (wrong-way / taps / idle), survive, tray ("+1" vs full tray), combo — demonstrated with real trial shots | `useCoach.ts`, `engine/shotFinder.ts`, `coach/CoachOverlay.vue`, `coach/TrayDemo.vue` |
| In-world rule badges + acted-out rules for new monster kinds; boss entry / enrage chevrons (replace the centre intro cards) | `render/ruleMarks.ts`, `BoardRenderer.drawRuleMarks` |
| Wordless tray lesson (balls = shots · "+1" fills a socket · full tray merges twins) + always-on tray → unit / "+1" → tray flights | `coach/TrayIntroDemo.vue`, `trayFlights.ts` |
| Upgrade lesson: press → spark → the effect where it lands (FTUE free capacity; once more for an unbought glowing chip) | `coach/UpgradeDemo.vue` |
| Earned HUD features: treasure chest → codex → collection → daily rewards → battle pass → achievements → daily run, one per turn, on best row OR losses, celebrated as a reward | `useFeatureUnlocks.ts`, `FeatureSlot.vue`, `FeatureUnlockFx.vue` |

## Monetization
Rewarded: Meteor continue (breach, once per checkpoint), 2× boss chest (ad before the doubled payout),
+5 balls (while aiming, once per checkpoint segment). Interstitial: checkpoint restarts only — never the
first two of a session, ≥ 3 min apart, played before the new board appears. All rewarded buttons are hidden
while no ad is ready; coin-priced builds pay in coins.

## Targets (concept §4.12)
First kill ≤ 4 s · first merge ≤ 25 s · first boss ≤ 3 min · retry after a breach ≥ 75 % · average
playtime ≥ 14 min. Kill criterion: testers stop aiming deliberately after 5 minutes.

## Standard requirements
> In GENERAL for all work: Do your work on a high-fidelity basis, don't do
> just good enough. Make the interactions feel good, add vfx juice where
> applicable (optimize to not overload the CPU/GPU). Don't take shortcuts.
> After planning, write the plan into `game-implementation-plan.md` to
> continue from if a session ends unexpectedly.
> The game starts right into the first scene, no main menu.
> Fully responsive: all mobile orientations, min portrait 320×658px, tablet
> and desktop up to fullscreen. No fixed px where avoidable — use %, vw/vh.
> Respect safe-area insets. Images are not selectable/draggable like normal
> web content but must allow drag and click events for game logic.
> Optimize for web-game standards: fast jump into gameplay (hot-path
> loading), delay uncritical assets until after first paint.
> Save ALL state variables in one object named `elemental-barrage_state`.
