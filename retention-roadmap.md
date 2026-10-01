# Elemental Barrage — Retention Roadmap

As of 2026-09-27 · measured build v1.2.3 · written to Phase 8 of `new-web-game-playbook`: at least 15 action points, highest impact first, each with an implementation note.

- **Order:** Tier 0 items are prerequisites for the next playtest (unranked). The Top 5 are the headline, ranked by expected minutes gained. The backlog is ranked.
- **Paths** are relative to `src/` unless they start with `scripts/` or `tests/`, or name a root file. Line numbers were checked against the working tree on the date above.
- **Commands** (sim, tests) run through the worker budget: `node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- <command>`.

## Decisions (2026-09-27)

1. **Rewarded gate (T0.2):** every rewarded CTA needs the first boss kill AND at least 3:00 of lifetime active play. That covers the Meteor, the ▶ 3× chest, +5 balls, skin unlocks, and any rewarded CTA added later.
   - One predicate: `rewardedOffersUnlocked` (`barrage/state/progress.ts`).
   - A locked offer is hidden, never disabled.
   - Each offer's own "a moment where it helps" conditions still apply on top.
2. **Meteor colour:** the Meteor keeps its fire orange. The rule bans only green: ad blue is the default for rewarded buttons, and a strong theme colour such as the Meteor's orange is allowed.
3. **Rank plaque:** revealed after the first boss kill (#2, Silent Flow owns it). This reverses the "the game is competitive, so it shows from the start" call in `use/useFeatureUnlocks.ts`.
4. **Delivery:** all of Tier 0 and #1–#5 ship in ONE build, v1.2.4, followed by one Player Fit test (§4).

## Headline: the Top 5

All five add zero HUD elements; #2 and #4 remove UI. They ship together with Tier 0 (§2) in one build, v1.2.4 (§4).

| # | Feature | Bucket it moves | Playbook metric | UI | Ships | Status |
|---|---|---|---|---|---|---|
| 1 | Instant Barrage: the power fantasy in the first 30 s | 0–1 m | easy to pick up | none | v1.2.4 | ✅ |
| 2 | Silent Flow: no pause, no dimming, no text before the first boss kill | 0–1 m, 1–2 m | easy to pick up | removes | v1.2.4 | ✅ |
| 3 | Boss at 75 s: a shorter first act with a live boss fight | 1–2 m, 2–3 m | pick-up, average playtime | none | v1.2.4 | ✅ |
| 4 | One-Tap Comeback: back in play about 1 s after a loss | 3–5 m, 5 m+ | hard to put down | removes | v1.2.4 | ✅ |
| 5 | Shoot-to-Choose: boss drops you pick by shooting them | 5 m+ | session length, Day-1 return | removes a modal | v1.2.4 | ✅ |

---

## 1. Targets and where we stand

**Poki Player Fit, v1.2.3.** 2 tests × 500 plays · devices: any · category: Shooting Games.

| Average playtime | Engaged | Median FPS |
|---|---|---|
| 2:33 / 2:55 | 26% | 40 |

**Histogram (share of plays)**

| 0–1 m | 1–2 m | 2–3 m | 3–5 m | 5 m+ |
|---|---|---|---|---|
| ≈ 40% | ≈ 25% | ≈ 12% | ≈ 10% | ≈ 13% |

Players who get past the 3–5 m band stay. The 5 m+ bucket ("hooked") averages about 11 min, the value that makes this histogram average 2:42, between the two tests.

**Pass bars**

| Bar | Rule | Status and target |
|---|---|---|
| Player Fit (Poki docs) | Average over 3:00 AND at least 25% of plays over 3:00 | We most likely pass the share and fail the average. The dashboard doesn't define "engaged", so reading it as "plays over 3 min" is an inference. |
| Web Fit (Poki docs) | Click-through, time on page and conversion to play (C2P), scored against the category's averages | Aim for 5+ min and 65%+ C2P. |
| Catalog (Poki support) | 8:00+ average AND 63%+ C2P | Poki support gave this bar when they rejected our previous game, Merge Idle War, at Web Fit. It reached 7:13 average playtime and 71% C2P, so it was rejected on playtime alone; conversion passed. Web Fit scores against category averages, and Merge Idle War was merge/idle, so treat 8:00 as the conservative target for this shooter. |

**Consequence:** playtime is the metric that decides the outcome. About 70% C2P is proven achievable with the loader-first boot this game inherited from Merge Idle War (the static splash in `index.html:56–84`). Judge every item below in minutes.

**Arithmetic.** The model assumes a minute-1 quitter plays about 30 s, a hooked play lasts about 11 min, and everyone else averages about 88 s.

| Lever | Effect |
|---|---|
| Move 1 pp of plays from "quits in minute 1" to "hooked" | About +6 s on the average (0.01 × 630 s) |
| Reach 3:00 | About +5 pp hooked, counted from the 2:33 test |
| Reach 5:00 | About 40% of plays reach the hook (about 13% today) |
| Reach 8:00 | About 55% hooked AND hooked sessions of about 14 min. The catalog bar needs both a first-2-minutes fix and a session-length driver. |
| Keep a quitter until minute 2 instead | Under 1 s per pp. Features must get players to the hook, not just delay the exit. |

---

## 2. Tier 0: before the next playtest (prerequisites, not features)

### T0.1 Drop-off instrumentation · S

- **Before:** `pokiMeasure` existed and had no callers (`utils/pokiPlugin.ts`). Its stub (`utils/pokiPlugin.stub.ts`) is aliased on non-Poki builds (`vite.config.ts:1121`), so calling it costs nothing elsewhere.
- **Built (v1.2.4):** `barrage/state/funnel.ts`, a platform-agnostic module.
  - Its only sink is `pokiMeasure`, on the Poki build. Every other build has no sink, so each call is a no-op. It never throws.
  - `useBarrage` reports the engine events.
  - The play clock (`barrage/state/playClock.ts`) reports session time. That is ACTIVE play: in a run, no menu, no ad, tab visible, no portal pause (the gameplay bracket's inputs). It is not wall-clock time.
  - Each milestone fires at most once per page session:

| `what` (shipped: keep stable across versions) | Fires on |
|---|---|
| `first_shot` | first `fire` event |
| `row_5` | endless `rowSpawned`, row ≥ 5 |
| `boss1_spawn` | first `bossSpawn` |
| `boss1_kill` | first `bossDefeated` |
| `first_loss` | first `breach` |
| `row_20` | endless `rowSpawned`, row ≥ 20 |
| `played_180s` · `played_300s` · `played_480s` | 3:00 · 5:00 · 8:00 of active play in the session |

- **New vs returning** is carried in the category: `funnel_new` or `funnel_returning`. The Events table can split only by (category, what), so each milestone gets one row per cohort.
  - A player counts as returning when the save shows a volley, a boss kill or a best row from an earlier session.
  - The cohort is decided at the first shot, before that shot is counted, and is then frozen for the session.
  - A player whose cohort cannot be decided counts as returning.
- **Contract** (checked against the `integrate-poki` SDK reference §4 and the playbook's Poki phase):
  - The Player Fit **Events** table shows one row per (category, what), with only the Started, Completed and Failed columns. A custom verb such as `reach` is accepted by the SDK but never displayed (measured on Glyphyx 1.2.1).
  - So send each milestone as a `start` and a `complete` together, e.g. `pokiMeasure('funnel_new', 'boss1_kill', 'start')` followed by the same call with `'complete'`.
  - No `/` or `^` in any argument; the module sends only `[a-z0-9_]`. Never measure an ad impression.
  - Read the Gameplays and Started counts, not the "Left" column.
- **Accept:**
  - Unit tests cover the module: once per session as one `start` + `complete` pair, clean arguments, the cohort split, the no-op path and never throwing (`tests/barrage/state/funnel.test.ts`). The game wiring is covered too (`useBarrage.test.ts`, "drop-off funnel").
  - The next test's Events table lists the rows. The Glyphyx measurement says it will; confirm it on that test.

### T0.2 Rewarded rule fix · S

- **Before:** the loss screen's Meteor offer was live before any boss kill. `meteorAvailable` was `!segment.meteor && rewardReady`, with no first-boss gate; only `bonusBallsAvailable` had one (`ftue.done`). On Poki the rewarded ad is ready from the first frame, so a first-minute loss opened with an ad offer.
- **Colour (decided 2026-09-27):** the Meteor keeps its fire orange (`components/barrage/BreachModal.vue:223–226`).
  - The standing rule bans only green. Rewarded buttons are ad blue by default, a strong theme colour is allowed, and the label says what is multiplied.
  - Don't move the Meteor to ad blue. The free Restart beside it is the blue button.
- **Decided (2026-09-27), built in v1.2.4:** one predicate, `rewardedOffersUnlocked` in `barrage/state/progress.ts`: `stats.bossKills >= 1 && lifetimePlaySeconds >= 180`.
  - `lifetimePlaySeconds` is the play clock's lifetime half (`barrage/state/playClock.ts`). It counts active play only, is persisted in `eb_stats.playSeconds`, and is hydrated forward-only.
  - A save from before the clock is credited 7 s per volley it fired. That under-counts, and it means a veteran isn't locked out of every offer for 3 min after the update.
  - It is applied to every rewarded placement:
    - the Meteor (`breach`);
    - the ▶ 3× chest (`bossChest`);
    - +5 balls, where it replaces the `ftue.done` check;
    - skin ads (`useCollections.skinAdReady`, plus the `CollectionModal` ad button).
  - A locked offer is hidden: its flag is false, and each view renders the button only while the flag is true. The action refuses without requesting an ad.
  - Each offer's own conditions still apply on top: readiness, once per segment, "only where it helps", and "worth more than its coin price".
  - Returning players who already qualify see offers at once. Coin-mode builds get the same gate.
- **Accept:** `useBarrage.test.ts` ("rewarded gate"), `skinAdUnlock.test.ts`, `playClock.test.ts` and `tests/barrage/ui/collectionSkinAds.test.ts`. The Poki build's first frame shows no live ad button.

### ✅ T0.3 FPS check, measured first (`web-game-performance-optimize`) · S–M

**Done (2026-10-01): measured; no code change shipped** (see `PERF-LEDGER.md`).
- **Step 1:** the recording stage now sends `diag / rec_stage` the first time Poki's recorder films it, so the next Player Fit Events table shows whether it ran.
- **Step 2:** a trace of the built Poki bundle (4× CPU, phone size) attributes the main-thread cost to layer updates and canvas uploads, not game script. The top suspect, the per-frame clear of the idle particle canvas, measured grey: −3.7 % inside a ±77 % noise floor on a machine saturated by other sessions. Per the rule it was reverted, and the ledger rows were written.
- **Open:** a real-phone trace on a quiet machine. Candidates: the idle particle clear, and the board redraw during idle aim phases.
- **Harness:** `tools/perf/perf-ab.mjs` (built bundle, Poki stub, interleaved A/B, trace attribution).

- **Step 1: is the recording stage running during Player Fit?**
  - While Poki's recorder films, `utils/pokiPlaytestStage.ts` repaints the backdrop, board, HUD outline and particles into a hidden stage canvas at 30 fps (`paintStage` `:496`, loop `:524`). It starts only when the recorder calls `captureStream` (`:571`); outside a recording it costs nothing per frame.
  - Poki docs say Player Fit tests aren't recorded. To confirm, send a one-off `diag` milestone (T0.1 contract) from `:571`. If it appears in the next Player Fit Events table, the stage ran during the test.
- **Step 2:** measure p95 frame time throttled. Use `PERF-LEDGER.md`'s budget (4× CPU, 412×915, DPR 2), its metric (p95 `BoardRenderer.stats.frameMs`) and its bench (`/#/barrage-lab?scene=stress&auto=1&clean=1`). Then fix only the top offender:

| Suspect | Evidence in code |
|---|---|
| Full board redraw every frame | The `BarrageBoard.vue` loop calls `renderer.frame(dt)` on every rAF while unpaused (`components/barrage/BarrageBoard.vue:183–209`), including idle aim phases. |
| Particle canvas cleared while empty | `components/organisms/ParticleCanvas.vue:45–49`: the idle branch runs a full-window `clearRect` on every rAF. The comment says "clear once", but nothing records that the clear already happened. |
| Endless CSS glow animations | 71 `infinite` declarations across 33 files, many animating `filter` or `box-shadow` (e.g. `BreachModal.vue:226`, `components/barrage/BossBar.vue:220`, `components/barrage/HudButton.vue:97`). |

- **Don't** re-try the backdrop-on-its-own-canvas split without a real-device trace. It was reverted as unproven (`PERF-LEDGER.md`, 2026-09-24).
- **Accept:** p95 work per frame beats the noise floor in an interleaved A/B, and a ledger row is written either way.
- **Evidence:** the slowest 5% of frames predicts experience; the median doesn't (CHI'23). A performance pass gained one Poki developer 30–40 s (Ball vs Block).

### ✅ T0.4 Keep desktop input in the frame · S (verify first)

**Done (2026-10-01).**
- **What's built:**
  - A mouse or pen drag released where the frame never sees it fires the last angle the preview showed (decided: fire, not cancel). Chrome delivers no pointerup past a cross-origin iframe's edge, only a later `lostpointercapture` or a button-up move.
  - A touch that loses capture is still cancelled.
  - Aiming is direction-only (no pull strength), so a full-strength shot never needs to leave the frame. The board sets `touch-action: none` and `user-select: none`.
- **Tests:**
  - Unit specs: `tests/barrage/render/aimCapture.test.ts`, covering the Chrome and Firefox event orders.
  - Real-browser acceptance: `tools/qa/iframe-edge-release.mjs`. A drag from the launcher, released outside a cross-origin iframe, fires exactly 1 shot in Chrome and in Firefox 155.

- **Now (correction):** pointer capture already exists.
  - `setPointerCapture` runs on the board press (`BarrageBoard.vue:294`) and on aims started from the tray (`:388`), with capture-phase window listeners (`:357–359`).
  - A lost capture or `pointercancel` cancels the aim with no shot (`:336–339`).
- **Do**, in Poki's desktop iframe (Chrome, Firefox, Safari):
  - a drag released outside the iframe fires the shot instead of cancelling it. If `lostpointercapture` arrives with a valid preview angle, fire that angle (decide);
  - the slingshot pull saturates inside the board, so a full-strength drag never needs to leave the frame. The cursor then stays over the game, and the next click can't land on portal thumbnails;
  - no page scroll or text selection during the drag.
- **UI:** zero.
- **Accept:** a Chrome and Firefox spec drags from the launcher to outside the iframe and gets exactly one shot.
- **Evidence:** Venge.io went from 2 to 10 min after pointer lock (Poki blog). That was an FPS game, so it supports "keep input in the frame", not a specific gain here.

---

## 3. The Top 5

**Acceptance tooling**

- **Bot sim:** `node --import ./scripts/art/ts-resolve.mjs scripts/barrage-sim.mjs --bot all --seeds 24 --turns 45`. Add `--trace 1` for seed 1's per-turn tray, coins and levels.
  - Sim time = turns × `SEC_PER_TURN`: human 9.5 s, humanlow 8 s, other bots 7 s (`scripts/barrage-sim.mjs:308`).
- **Sim gap:** the sim has no FEVER, first-chest or boss-income metric today. Before judging #1 and #3, add one `ftue` report line with:
  - median ball count at 45 s;
  - share of seeds with FEVER before 40 s (the engine already emits a `fever` event);
  - first boss kill, in seconds;
  - turns with zero income during boss 1;
  - first chest card, in seconds.
- **Unit tests:** `pnpm test` (vitest).
- **Returning players:** every change keys on `config.ftue` or `isFtueActive()` (`barrage/state/progress.ts:242`: FTUE not done and no boss killed yet), or on a fresh-run condition. `tests/barrage/engine/determinism.test.ts` and `relief.test.ts` must show non-FTUE boards unchanged.

### ✅ #1 Instant Barrage: the power fantasy in the first 30 s

**Done (2026-10-01).**
- **What's built:**
  - In the FTUE, a "+1" that meets a full tray grows a socket (capacity 2 → 3 → 4 → 6), booked as free capacity levels (`eb_ftue.sockets`). Sockets never count as paid.
  - Rows 1–5 carry an extra "+1" and 3–4 walkers, with the HP cap kept.
  - Row 4 arrives as a swarm.
  - The 4th volley is overcharged: a gold glow under the launcher while the player aims, then the tray fires three times over in a fan, and FEVER ignites on its first hit. FTUE FEVER otherwise needs 20 hits, not 50.
  - The gift after the first merge moves to Ball Damage.
- **Sim (24 seeds, all 7 bots):**
  - Median balls at 45 s: 6 (≥ 5 in 24/24 for every bot).
  - FEVER before 40 s: 24/24 for every bot, the first two plays included.
  - Boss-1 first try: 23–24/24 (baseline 21–24). First-breach rows: noup 30 → 40 and tapper 31 → 37. The random bot's median moved 42 → 39.
- **Browser pass:** a fresh profile gets 3 sockets and its first FEVER.

**Problem.** For about 2 min the player fires 1–3 balls into 1–14 HP monsters. The 6-ball tray arrives around 2:15. FEVER (50 hits in one volley, `barrage/engine/types.ts:32`) practically never fires in minute 1. The game promises a barrage and delivers a trickle.

**Binding constraint in the code.** Tray Capacity caps the balls per volley, not pickups.
- Once the tray is full, `addToTray` merges the lowest pair or turns the lowest ball into coins (`barrage/engine/balls.ts:67–71`).
- Capacity starts at 2 (`CAPACITY_TABLE`, `barrage/engine/economy.ts:14`). The FTUE's free gift makes it 3, and reaching 6 costs 44 more coins (17 + 27).
- So more "+1" pickups alone produce merges and coins, not a bigger volley.

- **Design (first session only, `config.ftue`):**
  - The tray reaches 5–6 balls by turn 4–5 (≈ 45 s at the human bot's 9.5 s per turn), via two changes:
    - more in-world "+1" pickups in rows 1–5;
    - an FTUE "+1" that meets a full tray grows a socket (up to capacity 6) instead of merging. The socket forming in the tray is the teaching.
  - Granted sockets count as free capacity levels, so the chip then offers 6 → 8 and nothing is ever taken back.
  - Denser rows, so volleys have targets. Rows 1–5 spawn 2–3 monsters today (`monsterCountRange`, `barrage/engine/monsters.ts:447–452`) at 3 HP or less (`:219–220`). Raise the count and keep the HP cap.
  - One early screen-clearing moment that triggers FEVER, the combo crescendo (`COMBO_MARKS`, `barrage/engine/engine.ts:57`) and a coin rain big enough to buy the first upgrade at once. One example is an overcharged launcher volley announced by an in-world glow; the mechanism is the implementer's choice.
- **UI cost:** none.
- **Moves:** 0–1 m.
- **Scope and likely files:** M.
  - `engine.ts`: the FTUE row script and the "+1" auto-collect at `:709–713`.
  - `monsters.ts`: `planRow`.
  - `balls.ts`: an FTUE branch in `addToTray`.
  - `barrage/state/useBarrageUpgrades.ts`: free capacity levels.
  - `use/useCoach.ts`: its `tray` overflow lesson goes quiet during the FTUE.
  - The sim's `ftue` line.
- **Acceptance:**
  - Sim (human, humanlow, noup, tapper): median ball count ≥ 5 at 45 s.
  - FEVER before 40 s in ≥ 80% of seeds.
  - No rise in early losses: first-breach row and boss-1 first-try counts no worse than the tables in the sim header.
  - Relief curves return to 1 after the FTUE, non-FTUE boards are identical, and returning players are unchanged.
  - Unit tests: socket growth stops at 6 and never runs with `ftue: false` (`tests/barrage/engine/tray.test.ts`, `relief.test.ts`).
- **Risks and rule constraints:**
  - Trivial early success can lower return (Drachen 2016). Keep it spectacle with rising density, not a free win.
  - The upgrade funnel teaches "coins buy power" with the free capacity gift (`components/barrage/UpgradeBar.vue` header). If capacity now arrives free, re-point the funnel at Ball Damage.
- **Dependencies:** none. Land it before #3, because the mini-boss HP budget assumes this tray.
- **Evidence and sources:** our histogram (about 40% of plays end in minute 1) and the sim. On the risk side: Drachen 2016 (arXiv 1607.03202).

### ✅ #2 Silent Flow: no pause, no dimming, no text before the first boss kill

**Done (2026-10-01).** Built as designed. Measured in a headless first session (fresh profile, phone emulation, auto-tapping): the frame-1 HUD shows 2 `HUD_SEL` elements (the boss countdown and the gear), and there are 0 s of blocking overlay before the first boss kill. The only modal before 90 s is the boss chest after the kill. The rank plaque uses its own fly-in phase instead of a ladder entry; the behaviour is the same.

**Problem.** Minute 1 has about 8–10 overlays, and 3–4 of them pause the game (`acquireAppPause`) for about 8–10 s in total:

| Overlay | Pauses | Length | Code |
|---|---|---|---|
| Pickup spotlight (first "+1") | yes | 2.6 s | `components/barrage/pickupSpotlight.ts:19, 68` |
| Merge lightbox (first 3 merges, then every discovery) | yes | 2.7 s, then 2 s, then 2 s | `components/barrage/mergeLightbox.ts:32–38, 105`; `MERGE_BOX_FIRST = 3` (`use/useCoach.ts:246`) |
| Threat spotlight | yes | ≈ 4.7 s (2.85 s + 3 × 0.62 s) | `components/barrage/lessonSpotlight.ts:60–67, 100`; `DANGER_PIP_MARCHES = 3` (`barrage/render/danger.ts:24`) |
| Chip lessons (speed, luck, bounty) | yes | 3.4 s each | `lessonSpotlight.ts:69` |
| Coach beats (pull, bank shot, tray intro, tray, upgrade funnel) | dims, no pause | per beat | `use/useCoach.ts`, `use/useTutorial.ts` |
| "NEW BALL!" reveal | no | 5 s | `use/useTierReveal.ts:45` |
| Skill toast (name plus an effect sentence) | no | 2.4 s, every time | `components/barrage/BarrageBanners.vue:156–158, 256–257` |

Frame 1 already has about 13 HUD elements. They include all 5 upgrade chips with prices (`UpgradeBar.vue` has no per-chip gate) and a rank plaque that testers don't understand (`views/GameScene.vue:657`).

- **Design:**
  - Zero blocking pauses before the first boss kill. Lessons become in-world cues that run while play continues:
    - the "+1" pulses;
    - the merge plays the tray's own flourish (it already runs whenever the lightbox declines);
    - the danger row flashes.
  - Frame 1 shows only the board, the launcher, "Tap to Shoot" with its ghost finger (the one allowed text exception, `components/barrage/ShootPrompt.vue`) and the boss countdown (`GameScene.vue:582`).
  - Each upgrade chip flies in when it first becomes affordable, reusing the earned-HUD fly-in (`components/barrage/FeatureUnlockFx.vue`). Veteran saves show every chip, as `use/useFeatureUnlocks.ts` already does for depth features.
  - The rank plaque stays hidden until after the first boss kill: add it to the unlock ladder (decided 2026-09-27).
  - Skill toasts become icon-only. The sentence stays in the screen-reader live region.
  - The "NEW BALL!" reveal lasts ≤ 1.5 s and doesn't block.
- **UI cost:** removes UI.
- **Moves:** 0–1 m and 1–2 m.
- **Scope and likely files:** M.
  - `pickupSpotlight.ts`, `mergeLightbox.ts` and `lessonSpotlight.ts`, with their `.vue` views.
  - `use/useCoach.ts`, `use/useTutorial.ts`, `components/barrage/coach/*`.
  - `UpgradeBar.vue`, `GameScene.vue`, `use/useFeatureUnlocks.ts`, `BarrageBanners.vue`.
  - `use/useTierReveal.ts` with `components/organisms/TierRevealFx.vue`.
- **Acceptance:**
  - 0 blocking pauses before the first boss kill: an `acquireAppPause` spy in `tests/barrage/ui/pickupSpotlight.test.ts`, `mergeLightbox.test.ts` and `coach.test.ts`.
  - ≤ 5 HUD elements on a fresh profile's first frame, counted with the recorder stage's `HUD_SEL` (`utils/pokiPlaytestStage.ts:51`).
  - ≤ 3 s of overlay time before 90 s, in a headless first session that logs overlay mount and unmount.
  - No new text strings: the key count in `tests/barrage/ui/barrageI18n.test.ts` doesn't grow.
  - Tutorial tests updated: `tutorial.test.ts`, `coachOverlay.test.ts`, `upgradeBar.test.ts`, `featureUnlocks.test.ts`, `shootPrompt.test.ts`.
  - Returning players (`ftue.done`) see today's HUD with no fly-ins.
- **Risks and rule constraints:**
  - Wordless, in-world teaching is the standing rule, and "Tap to Shoot" stays.
  - Hiding the plaque reverses the documented call in `useFeatureUnlocks.ts:46–49` ("the game is competitive, so it shows from the start"). The user decided that reversal on 2026-09-27. Update that comment and its test.
  - The earned-HUD rule covers the chips too: nothing locked may pulse or show a dot.
- **Dependencies:** none. It can run in parallel with #4.
- **Evidence and sources:**
  - Andersen 2012 (n = 45k): tutorials had no effect in simple games, and a help button cost 15% of playtime.
  - Poki easy-access guide: teach with gestures and reveal buttons over the first levels.
  - Onboarding skill: survival across 5 full stops ≈ 0.87⁵ ≈ 50%.

### ✅ #3 Boss at 75 s: a shorter first act with a live boss fight

**Done (2026-10-01).**
- **What's built:**
  - On a fresh FTUE run the Slime Tower arrives at row 5, clamped to 2–3 volleys of the tray it meets (floor and ceiling).
  - It replaces the row-10 boss: the next boss is at row 20.
  - Every boss hit pays coin shards worth 60% of the bounty in total, and the chest holds the rest, so a boss pays the same overall.
  - The boss's spawn sets an entrance checkpoint, so a loss restarts at the boss with the tray kept and mercy counted once.
  - The early kill holds the HP clock 3 extra rows, so rows 10–30 stay as hard as they were with a row-10 boss.
- **Sim (24 seeds × 45 turns, all bots):**
  - First boss kill: median 42–67 s (target ≤ 90 s).
  - Turns with zero income during boss 1: median 0.
  - Boss-20 and boss-30 first tries and first-breach rows: equal to or better than the pre-#3 build. Examples: noup 19 → 24/24 at boss 20, tapper 7 → 8/24 at boss 30.
- **Browser pass:** the entrance checkpoint lands at row 4, and the first boss dies within the first minute.

**Problem.**
- Boss 1 arrives at row 10 (`BOSS_EVERY`, `barrage/engine/types.ts:30`), about 1:35.
- Its fight lasts about a minute with no other monsters and zero coin income (sim: 0 coins on turns 10–14). Two code facts cause this:
  - first-boss rows are `calm`, with no walkers and no coin bubbles (`engine.ts:1525`, `monsters.ts:535`);
  - a boss pays nothing per hit (`KIND_COINS.boss = 0`, `economy.ts:172–174`). Its bounty arrives only as the chest (`bossBounty`, `economy.ts:189`: 75 coins at row 10).
- Its curve HP is 102: row HP 17 × boss ×15 × FTUE ×0.5 × safety net ×0.8 (`monsters.ts:134, 149, 234`). The adaptive floor (`BOSS_ADAPT.firstVolleys = 5`, `monsters.ts:359–368`) raises it to a sim median of 147.
- The first reward screen comes at 2:05–2:45, after about 65% of plays have ended.
- Weak players who lose to boss 1 restart at row 1, costing about 2 min. No checkpoint exists before the first kill (`useBarrage.ts:463–469`), because the checkpoint only moves on a kill (`:617`). The tray is kept and boss mercy takes 25% off.

- **Design:**
  - **Mini-boss at row 5** (≈ 55 s) on fresh runs, sized to die in 2–3 Instant-Barrage volleys, so the kill lands at about 75–90 s.
    - Much of it already works. `bossForRow(5)` maps to the Slime Tower, and `isFirstBoss` (spawn row < 20) already gives it calm rows and the full roar (`monsters.ts:61–64, 274–275, 288–293`).
    - What changes is the FTUE's starting `nextBossRow` (`engine.ts:202`).
  - **HP budget:** the adaptive floor must not push it past that budget. Give the mini-boss its own volley budget of 2–3 (not `firstVolleys` 5), applied as a ceiling as well as a floor.
  - **Coin shards:** every boss hit drops coin shards, so the upgrade loop keeps running and chips light up mid-fight. Split the existing `bossBounty` into per-damage shards plus a smaller chest, so total boss income for returning players stays the same.
  - **Checkpoint at the boss entrance:** losing to the first boss restarts at the boss with the tray kept, with mercy on top.
    - On the first boss's spawn in a fresh run, record the row before it and the current tray.
    - Rebuild with `createEngineAtRow` (`engine.ts:1690`). Its `beginRun` sets `nextBossRow` to the first multiple of 10 at or after the first row (`engine.ts:499`), so a row-5 entrance restart must override that, or the boss won't reappear.
  - The first chest card lands within 90 s (sim median).
  - **Recommended mechanism:** a row-5 mini-boss plus the entrance checkpoint on fresh runs.
    - Decide whether it replaces the row-10 Slime Tower or precedes it. After a boss at row 5, the engine schedules the next one at row 10 (`engine.ts:1506–1512`).
    - Confirm the economy is still sane for returning players.
- **UI cost:** none; it reuses the boss, chest and checkpoint.
- **Moves:** 1–2 m and 2–3 m.
- **Scope and likely files:** M.
  - `engine.ts`: boss scheduling and coin shards.
  - `monsters.ts`: `BOSS_ADAPT` and first-boss HP.
  - `economy.ts`: the bounty split.
  - `useBarrage.ts` and `barrage/state/progress.ts`: the entrance checkpoint.
  - `components/barrage/BossChestModal.vue`: the smaller chest.
  - The sim: its `ftue` line, and a bot restart rule that mirrors the entrance checkpoint.
- **Acceptance:**
  - Sim median first boss kill ≤ 90 s of sim time (human, humanlow, noup, tapper).
  - Zero turns with zero income during boss 1 (`--trace 1` and the `ftue` line).
  - Losing to boss 1 costs ≤ 20 s.
  - Rewarded ▶3× on this first chest follows the T0.2 decision.
  - Unit tests:
    - `tests/barrage/engine/boss.test.ts`: mini-boss HP stays inside the budget, even against a stacked tray;
    - `tests/barrage/state/useBarrage.test.ts`: entrance checkpoint, with mercy counting a death exactly once.
  - Returning players: boss rows, the HP ladder and bounties are unchanged when `ftue` is false.
- **Constraint:** don't file or "fix" anything about the boss HP bar looking stuck, or a side boss that a tap-only tester never hits (standing rule).
- **Dependencies:** #1 (the 2–3-volley budget assumes its tray) and T0.2 (the gate hides ▶3× on any chest before 3:00 of play, so the earlier first chest opens with no ad offer).
- **Evidence and sources:**
  - Onboarding skill: first result screen around 90 s.
  - Poki: make the first levels easy to finish.
  - Supersonic (Trash Tycoon): 60% of players were lost to a tutorial with no clear goal.
  - Our own histogram.

### ✅ #4 One-Tap Comeback: back in play within about 1 s of a loss

**Done (2026-10-01).**
- **What's built:**
  - The death beat is 1.2 s (was 2.4 s). The pieces of the torn unit now fall faster, so they settle inside it.
  - OVERRUN leads with one big round icon-only retry. Its aria-label reuses `barrage.breach.restart`, so there are no new strings.
  - Meteor (gated by T0.2) and Revive sit below the retry. The culprit and recap are a small secondary block.
  - A boss still standing at the breach shows its last sliver of HP as a wordless near-miss bar (`BreachOffer.bossLeft`).
  - The gameplay bracket resumes only on the retry tap. Interstitial cadence, the ad wait cap and the Daily result are unchanged.
  - The glowing-chip re-arm after a loss was already the coach's breach rule.
- **Tests:** loss to an aimable board in ≤ 2 s with one tap (a fake-timer spec), plus the modal and near-miss specs.
- **Browser pass:** the retry screen appears after a forced breach, and one tap is back in play in 0.3 s, at the boss entrance with the tray kept.

**Problem.**
- Every loss plays a 2.4 s death scene under "WASTED" (`DEATH_SCENE_MS = 2400`, `barrage/render/death.ts:74`, started in `onBreach`, `useBarrage.ts:625–628`).
- Then comes the forced-choice Overrun modal: culprit, recap, Meteor, Revive, Restart (`BreachModal.vue`).
- The typical first loss comes at 3:30–5:30: the row-20 worm (320–700 HP) or the row-30 fire dragon (1.5K–3.2K HP) (`BOSS_ORDER`, `monsters.ts:56`; ×20 and ×40 factors, `monsters.ts:138–141`).
- The 3–5 m bucket leaks there, and that's where the 5-min average is decided.

- **Design:**
  - Shorten the loss beat to ≤ 1.5 s (`DEATH_SCENE_MS`).
  - One big icon-only retry (its aria-label through i18n). It restarts from the last checkpoint with coins and tray kept, as `restartFromCheckpoint` already does (`useBarrage.ts:853–878`).
  - A near-miss cue shown in-world: the boss's last sliver of HP on its bar, or the culprit. The death scene already keeps the striker in colour (`death.ts` header).
  - The upgrade chip that would have made the difference glows (`glowTrack`, `economy.ts:156`; the coach's breach re-arm already points at it).
  - The rewarded continue (the Meteor: fire orange with ▶, since the rule bans only green) appears only after the T0.2 gate. The free Revive-charge path stays.
  - The recap becomes secondary: small, below the retry.
  - **gameplayStart:** returning to the aim phase is fine because the game is turn-based, but gameplayStart must still fire only on the player's first trusted gesture (Poki QA rule; gate at `utils/pokiPlugin.ts:390–399`). The breach stops the bracket (`useBarrage.ts:632`); the retry tap (`:874`) or the first shot (`:801`) resumes it. Never auto-resume.
  - **Ads:** keep the playbook's ad-before-result-screen ordering and the existing interstitial cadence: checkpoint restarts only, from the 3rd, at least 3 min apart, played before the new board (`restartAdDue`, `useBarrage.ts:850–867`).
- **UI cost:** removes UI; three stacked buttons and a recap become one glyph.
- **Moves:** 3–5 m and 5 m+.
- **Scope and likely files:** S–M. `death.ts`, `components/barrage/DeathOverlay.vue`, `BreachModal.vue`, `useBarrage.ts` (breach and restart), `BossBar.vue`, `UpgradeBar.vue`.
- **Acceptance:**
  - Loss to an aimable board in ≤ 2 s with ≤ 1 tap (fake-timer case in `tests/barrage/state/useBarrage.test.ts`).
  - Meteor not visible before the gate (the T0.2 test).
  - The gameplayStop/Start bracket is correct: `tests/platforms/portalGameplayBracket.test.ts` and `pokiGameplayEvents.test.ts`.
  - Ad ordering tests pass: the interstitial specs at `useBarrage.test.ts:677–721`. Update `tests/barrage/render/death.test.ts`.
  - The Daily Barrage result screen is unchanged (it has no continues).
- **Risks and rule constraints:**
  - The modal is a forced choice with no ✕, so a slow ad must never hide the retry. The restart ad keeps its wait cap (`RESTART_AD_WAIT_MS`, `useBarrage.ts:105`).
  - Near-miss evidence is mixed (Larche 2017 vs Finserås 2019), so the near-miss cue is a nicety, not the core.
- **Dependencies:** T0.2 (the gate). After #3, a loss to the first boss lands at the entrance checkpoint.
- **Evidence and sources:**
  - Nakamura 2025 (84k players): a 10 s delay between rounds cut playtime; 1 s made little difference.
  - Netflix autoplay study (arXiv 2412.16040): sessions were 17.6 min shorter without autoplay.

### ✅ #5 Shoot-to-Choose: boss drops you pick by shooting them

**Done (2026-10-01).**
- **What's built:**
  - Every endless boss kill floats up to 3 power orbs mid-board: 'perk' pickups, distinct perks not yet maxed, drawn row-locally so the engine RNG is untouched.
  - The first orb a ball touches is kept for the run, and the others vanish. Unpicked orbs that reach the line give the leftmost one.
  - The perks, up to 3 stacks each:
    - Power: +15% ball damage per stack.
    - Splash: 25% of a hit to the struck monster's neighbours.
    - Bounty: +40% kill coins.
    - Volley: +3 balls at once.
  - Picks live in `config.perks` (the run snapshot) and on the checkpoint (`Checkpoint.perks`): a restart keeps them, a fresh row-1 run starts without, and the Daily never gets them.
  - The boss chest card now shows only while ▶3× is on offer; otherwise the chest pays 1× and its coins fly from the board, with no card.
  - The orbs borrow the war-cry, meteor, coin and legion icons until painted ones land (art-todo #9). There are no new strings.
- **Sim** (`--pick` forced paths, 24 seeds × 260 turns, all bots): no path is strictly dominated across boss first-tries, best row by turn 100 and 250, and late bite.
  - The first tuning (+20% / +25% / +2) had Power dominate Volley for the low-buyer bot, hence the retune.
  - #1's and #3's lines hold with #4 and #5 in.
- **Browser pass:** a fresh profile's first boss kill offered orbs, and a ball picked Power (saved on the checkpoint). The chest paid without a card while ▶3× is locked, and the orbs render with no console errors.

**Problem.**
- After a boss the reward is a chest-card modal (`BossChestModal.vue`; 75 coins at row 10).
- Flying-chest skills are random (40% chance, `CHEST_SKILL_CHANCE`, `engine.ts:44`).
- Run-to-run variety is low, and the 8-min catalog target needs a session-length driver.

- **Design:**
  - When a boss dies, 2–3 glowing power orbs float on the board: element or skill icons such as splash, pierce, split or +2 balls.
  - Whichever orb the next volley hits first is kept for this run. Orbs stack into synergies with ball merging (tier abilities, `ballAbility`, `balls.ts:35`).
  - Wordless, and no modal. Trim or replace the non-rewarded chest card: coins fly straight to the wallet.
  - Optional later: an ad-blue "▶ take all" from boss 2 onward. Decide it at monetization time, after checking the playbook's ads phase.
  - **Implementation:**
    - Orbs are a new pickup kind next to the "+1", coin and skill bubbles (`RowPlan`, `monsters.ts:413–419`).
    - Picks live in the run snapshot so a reload keeps them.
    - Reuse the skill system (`SKILLS`, `monsters.ts:441`).
  - **Define "a run" before building.** After boss 1, endless mode only ever restarts at a checkpoint.
    - Recommended: save picks with the checkpoint (a restart keeps them, like the checkpoint tray) and reset them only on a fresh row-1 run. The Daily Barrage, with its fixed kit, gets none.
    - Cap stacks per perk so the late-game curve holds.
- **UI cost:** no new HUD; removes the chest-card step.
- **Moves:** 5 m+ (session length), and adds a "one more boss" pull.
- **Scope and likely files:** M (content and balance).
  - `engine.ts`: orb pickups and pick resolution.
  - `engine/types.ts`: `RunSnapshot`.
  - `balls.ts`: perk effects.
  - `useBarrage.ts` and `progress.ts`: persistence.
  - `BossChestModal.vue`.
  - Renderer: orb sprites, plus entries in the art and sound todo manifests.
  - The sim: a pick policy for each bot.
- **Acceptance:**
  - Every boss kill offers a pick.
  - Picks persist through the run and reset on a new run, as defined above.
  - Sim (`--bot all --seeds 24 --turns 260`, one forced pick path at a time): no pick path is strictly dominated. A path counts as dominated only if it is worse on every one of: boss first-try, best row by turn 100 and 250, and late-game bite.
  - Unit tests for pick resolution:
    - the first orb hit wins;
    - simultaneous hits resolve deterministically;
    - the snapshot round-trips;
    - the reset rules hold.
- **Risks and rule constraints:**
  - A dominant perk would flatten variety (balance risk).
  - No rewarded CTA in the opening minutes (T0.2).
  - Any visible perk name goes through i18n; prefer icons.
- **Dependencies:** #3 (boss cadence and the first boss kill). Check the playbook's ads phase before any "▶ take all".
- **Evidence and sources:** Archero/Survivor.io-style in-run picks (Naavik deep dive; analysts estimate about 80% day-1 retention). This is medium evidence, from outside web games.

---

## 4. Delivery plan

The user decided on 2026-09-27 that everything ships in ONE build, followed by one test.

| Version | Contents | Then |
|---|---|---|
| v1.2.4 | All of Tier 0 (T0.1–T0.4) + #1–#5 | One Player Fit test |

- **One build, one test.**
  - No partial build goes to Poki. v1.2.4 is uploaded only once every item meets its gate.
  - The single test cannot credit minutes to any one feature. T0.1's funnel makes it readable instead: the reach of each milestone, split new vs returning, shows where the curve moved.
- **Build order inside v1.2.4:**
  - First: T0.1 and T0.2 (the funnel and the gate). T0.3 and T0.4 are measured on their own.
  - Parallel-safe: #2 (the tutorial, coach and HUD files listed under #2) alongside #4 (the loss flow: `death.ts`, `DeathOverlay.vue`, `BreachModal.vue`, and `useBarrage.ts`'s breach and restart path).
  - Sequential: #1 then #3. Both touch `engine.ts`, `monsters.ts` and `economy.ts`, so build them one after the other or in the same change.
  - Then #5, which needs #3's boss cadence.
  - Land T0.2 before #4, because both edit `useBarrage.ts`'s breach offer.
- **Per-feature gates:**
  - Unit tests green.
  - The bot sim meets that feature's acceptance lines.
  - Every new visible string goes through i18n in all 21 shipped locales. Avoid new strings anyway; the game is wordless.
- **Build gate:** before the upload, the combined build must pass all of these:
  - the full suite and `vue-tsc --build`;
  - the bot sim, still meeting #1's and #3's lines with #4 and #5 in;
  - a clean `poki-deploy-qa`.

---

## 5. Already shipped

"Hurts 0–2 m" marks what currently costs the first two minutes.

| Shipped | First met | Code | Hurts 0–2 m |
|---|---|---|---|
| Rows, boss every 10 rows, boss preview and countdown | frame 1 (countdown); boss 1 ≈ 1:35 | `barrage/engine/types.ts:30`, `components/barrage/BossPreview.vue`, `views/GameScene.vue:582` | **yes**: boss 1 comes too late (→ #3) |
| 5 upgrade tracks | frame 1: all 5 chips with prices | `economy.ts:11`, `UpgradeBar.vue` | **yes**: frame-1 clutter (→ #2) |
| Tutorial and "Tap to Shoot" | frame 1 | `use/useTutorial.ts`, `ShootPrompt.vue` | the CTA no (allowed exception); the pausing lessons **yes** (→ #2) |
| Relief: rows 1–5 capped at 3 HP (row 1 at 1 HP) | 0:00 | `monsters.ts:219–220, 262` | no |
| Relief: missed "+1"s auto-collected up to row 4 | 0:00 | `engine.ts:75–77, 709–713` | no |
| Relief: boss 1 at half HP | ≈ 1:35 | `monsters.ts:149`; the adaptive floor raises it again (`:359–368`) | no |
| Relief: monster HP −20% below 2 paid levels, −¼ of the cut per further paid level, fading out over HP-clock rows 20–40 | 0:00 | `monsters.ts:232–249`, `economy.ts:211–220` | no |
| Relief: slow flying chest (×0.6 speed) | ≈ 1:45 | `engine.ts:51` | no |
| Relief: kill hold (0.4 s) | 0:00 | `barrage/render/BoardRenderer.ts:187` | no |
| Boss mercy (−25% per loss, floor 50%) and a hidden savior boost | first boss loss; boss fights | `economy.ts:231, 283` | no |
| Earned-HUD ladder, one unlock per calm aim phase | rows 6 → 36 | `use/useFeatureUnlocks.ts:50–58` | no |
| Treasure chest (3 / 10 min) | row 6 (or 1 loss) | `barrage/state/useSupplyDrop.ts:39–40` | no |
| Codex | row 11 | ladder | no |
| Collection: 50 launchers, 12 ball skins | row 16 | `barrage/state/useCollections.ts:36`, `barrage/ballSkins.ts:68–81` | no |
| Daily rewards, battle pass, achievements, Daily Barrage | rows 21 / 26 / 31 / 36 | ladder | no |
| Rank plaque (not earned, by design) | frame 1 | `GameScene.vue:657`, `useFeatureUnlocks.ts:46–49` | **yes** (→ #2) |
| Loss flow with checkpoint restart (coins and tray kept) | first loss | `useBarrage.ts:455–473, 625–648`, `BreachModal.vue` | **yes**: 2.4 s plus a modal, and a loss before boss 1 restarts at row 1 (→ #3, #4) |
| Resume a saved run on reload | reload | `useBarrage.ts:476–493` | no |
| Rewarded: Meteor, ▶3× chest, +5 balls, skins | Meteor: first loss (ungated); chest: boss 1; +5 balls: after boss 1; skins: row 16 | `useBarrage.ts:763, 773–780, 793–795`, `useCollections.ts:282` | the Meteor **yes** (→ T0.2) |
| Interstitial cadence: checkpoint restarts only, from the 3rd, ≥ 3 min apart, before the new board | 3rd restart | `useBarrage.ts:89, 94, 850–867` | no |
| Flying chest: every 2 min, 40% skill chance | ≈ 1:45 (`CHEST_FIRST` is 90 s of unpaused play) | `engine.ts:39–44` | no (an earlier chest is in the backlog) |
| Juice: FEVER, combo crescendo, trails, damage numbers | FEVER needs 50 hits in one volley, so it rarely fires in minute 1 | `engine/types.ts:32`, `engine.ts:57` | FEVER timing **yes** (→ #1) |

---

## 6. Backlog (ranked)

| # | Item | Evidence | UI cost |
|---|---|---|---|
| B1 | In-world "next power" charge ring on the launcher that fills as coins approach the next upgrade | Goal gradient (Nunes & Drèze 2006; Kivetz 2006) | low |
| B2 | Golden jackpot monster | Variable reward | zero |
| B3 | Danger-line or life-bar stake | Testers don't read the countdown pip | low |
| B4 | Earlier first flying chest, about 40 s (`CHEST_FIRST` is 90 s today, `engine.ts:39`) | Playbook Phase 7: give an early taste of the meta | zero |
| B5 | Boss Rush and a Daily Barrage leaderboard | Playbook Phase 7b: a leaderboard is the cheapest retention add-on | low |
| B6 | Missions | none cited | medium |
| B7 | Portrait-first layout check | Poki: portrait gets more players into gameplay | zero |
| B8 | Haptics | none cited | zero |

---

## 7. Don't do

| Don't | Why |
|---|---|
| On-demand help button | It cost 15% of playtime (Andersen 2012). |
| Text tutorials or timed text popups | Standing rule: teaching is wordless and in-world. "Tap to Shoot" is the one allowed CTA. |
| A rewarded CTA in the opening minutes, or rewarded ads that gate progress | Standing rule. The Poki playtests all opened with a Rewarded Break. |
| A preroll or first-play interstitial on Poki | C2P is measured on the first `gameplayStart`, and a preroll stands in front of it (`integrate-poki`). |
| A second currency or grind | Poki quality guide. |
| Pushing streaks, dailies or the pass earlier as the first-2-min fix | They only act between sessions. |
| Chasing "boss HP stuck" or "side boss never hit by taps" findings | Standing rule: these are AI-tester artifacts, not player problems. |

---

## 8. Sources

- Poki, Player Fit test: https://developers.poki.com/guide/player-fit-test
- Poki, how testing works: https://developers.poki.com/guide/how-testing-works
- Poki, Web Fit test: https://developers.poki.com/guide/web-fit-test
- Poki, reading results: https://developers.poki.com/guide/reading-results
- Poki, quality requirements: https://developers.poki.com/guide/requirements-quality
- Poki, easy access: https://developers.poki.com/guide/easy-access
- Poki blog, higher success rates with playtests: https://poki.com/blog/higher-success-rates-with-playtests
- Poki blog, what makes a high-quality browser game: https://poki.com/blog/what-makes-high-quality-browser-game
- Supersonic, optimizing the FTUE (Trash Tycoon): https://supersonic.com/learn/blog/optimizing-ftue/
- Lomas 2013: https://dl.acm.org/doi/10.1145/2470654.2470668
- Nakamura 2025, delays between rounds: https://dl.acm.org/doi/10.1145/3712281
- CHI'23, frame times: https://dl.acm.org/doi/10.1145/3544548.3580665
- Andersen 2012, tutorials: https://grail.cs.washington.edu/projects/game-abtesting/chi2012/chi2012.pdf
- Autoplay study (Netflix): https://arxiv.org/abs/2412.16040
- Drachen 2016: https://arxiv.org/abs/1607.03202
- Nunes & Drèze, endowed progress: https://doi.org/10.1086/500480
- Naavik, Survivor.io in Archero's footsteps: https://naavik.co/deep-dives/survivorio-archeros-footsteps/
- Ball vs Block: https://kuyimobile.substack.com/p/ball-vs-block-reimagining-a-classic
- CrazyGames, basic launch metrics: https://docs.crazygames.com/resources/basic-launch-metrics/
- Internal: `integrate-poki` SDK reference §4 (measure contract, Glyphyx 1.2.1), `new-web-game-playbook` Phase 7 / 7b / 8, `PERF-LEDGER.md`, `scripts/barrage-sim.mjs` header tables.
