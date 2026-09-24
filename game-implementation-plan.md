# Elemental Barrage — implementation plan & resume point

Spec: `GDD.md` → `src/barrage/CONTRACT.md` (binding rules) → `src/barrage/engine/types.ts` +
`src/barrage/state/contract.ts` (code seams). Built on the Merge Idle War stack; MIW's gameplay code was
removed once nothing reached it (git history keeps it).

## Done (v1, 2026-09-23)
1. Rename Merge Idle War → Elemental Barrage everywhere except the two concept docs; save prefix
   `elemental-barrage_state` / `_uid` / `_name` / `_board_cache`; worker detached from MIW's D1 database.
2. Engine: deterministic rules, physics, 6 monsters, 6 bosses, 10 ball abilities, 8 skills, flying chest,
   FEVER, economy + bot sim (`scripts/barrage-sim.mjs`), onboarding retune.
3. Renderer: canvas board with sprite bakes, pooled VFX / damage numbers, slingshot aim, SFX, `/#/barrage-lab`.
4. State: run persistence + cloud hydration, checkpoints, breach flow, ad placements, upgrades, 50 launchers,
   15 ball skins, Daily Barrage, supply drop, battle pass / achievements / best-row leaderboard re-pointed.
5. UI: portrait-first GameScene, tray, upgrade bar, turn controls, boss strip, banners, 5 modals, FTUE,
   i18n in all 21 locales (`barrage.*`, `barrageMeta.*`).
6. Seeded leaderboard re-modelled on best row; stopgap logo + favicon; navy theme colours.

## Next (in playbook order)
1. **Playtest with humans** (Phase 7): persona tests + the concept's kill criterion (do testers still aim
   deliberately after 5 min?). Log every > 3 s pause outside a menu.
2. **Art** (`art-todo.md`): board backdrops, glass orb, pedestal, logo repaint, promotion covers.
3. **Preview videos**: write a Barrage seam + scenarios for `tools/preview-video` (MIW's seam is gone).
4. **Leaderboard backend**: `wrangler d1 create elemental-barrage-leaderboard`, paste the id into
   `worker/wrangler.toml`, deploy (`worker/SETUP.md`). Daily Barrage has no global board yet (local best only).
5. **Portal configs** before any upload: `.env.gamemonetize.local` (`VITE_GAME_ID`), `.env.glitch`
   (install ids/token) and `wavedash.toml` (`game_id`) still carry MIW's portal ids; `.env.crazy-web` has
   `VITE_APP_CRAZY_GAMES_FULL_RELEASE=true`, which a new CrazyGames submission cannot claim.
6. **Release QA** per platform (Phase 6/7 of `new-web-game-playbook`), `compress-images-pipeline`, perf sweep.
7. **Retention roadmap** (Phase 8): Boss Rush mode, seasonal ball skins, daily global board, missions
   (`useMissions` was MIW-legacy and is removed).

## Onboarding pass 2 — the wordless coach (started 2026-09-23)
Playtest: "lost the first game fast, didn't understand the mechanics". Measured first
(`scripts/barrage-sim.mjs --bot all`, 10 seeds; `/scratchpad` browser runs):
- **Wrong-way drag** (pointing at the monsters instead of pulling back) fires the pinned
  8°/172° edge shot: a slow wall-to-wall zig-zag. Not lethal (`flat` bot first breach row 29,
  random 27) but the shot never goes where the player meant → "I don't get the controls".
- **Never upgrading** is the measured killer: `noup` first breach row ~20 (≈ 2:15) vs 27.
- **"+1" rarely means +1 shot**: at capacity 2, 61 % of collected "+1"s become coins and the
  volley grows on only 5 % of turns (cap 3: 12 % / 10 %; cap 4: 0 % / 15 %). That is the
  "sometimes the shots duplicate, sometimes not" report.
- The new-monster card (3 s) and BOSS INCOMING (1.5 s) sit mid-board while balls fly.

Build (all wordless on screen; sentences only in sr-only live regions):
1. `engine/shotFinder.ts` — trial shots on engine clones (hits, kills, threat damage, skills,
   breach, the first ball's exact polyline + contact points). Pure + unit-tested.
2. Aim: stretching pull-back ARROW anchored on the launcher (FTUE + idle nudge + misfire
   recovery). `AimController` stops firing clearly-upward drags (> 35° above horizontal) and
   reports them (`wrongWay`) so the hint replays instead of a garbage shot.
3. `use/useCoach.ts` — lesson state in the blob (`eb_coach`): pull · survive · tray · combo,
   one at a time, novice-gated, capped exposures, graduation by real stats.
4. `CoachOverlay.vue` — combo lesson (ghost pull to a real bank shot found by the finder,
   the first ball's path with numbered hits and the volley total), survive lesson (threat
   reticles + marches-left pips + the rescue shot), tray lesson (ghost +1 bounces off a full
   tray into a coin, a ghost socket appears, the capacity chip is pressed), pull hint.
5. Renderer: in-world rule badges + aim-phase rule demos for kinds met < 3 turns
   (goblin hop arrows, dryad heal motes, centaur spit, ogre/caterpillar armour, corrupted ×3
   coins, boss skull), boss-entry warning chevrons, enraged-boss double-march chevrons,
   "+1" pops that show the real outcome (+1 / merged orb / coin).
6. Banners: the monster / boss / enrage centre cards go (sr-only announcements stay);
   BossBar gets the 30 % enrage marker.
7. i18n: sr-only lesson sentences in all 21 barrage locales.

Status (2026-09-23): all seven built. Tests: `tests/barrage/engine/shotFinder.test.ts`,
`tests/barrage/ui/coach.test.ts`, `tests/barrage/render/plusOutcome.test.ts`, wrong-way cases in
`render/aim.test.ts`; a 20-mutant sweep over the new code is fully killed. Browser-checked on 390×844
and 844×390 (FTUE arrow, live wrong-way arrow, pull / tray / survive / combo lessons, rule badges, boss
chevrons). Trials are resumable: worst idle slice 11 ms at 4× CPU throttle (a whole 20-ball trial was
74 ms). Sim bots `noup` and `flat` added. Open for a human playtest: does the tray lesson get the free
capacity chip pressed; is TAG_TURNS = 4 long enough.

## Onboarding pass 3 — earned features, tray + upgrade lessons (2026-09-23)
Playtest follow-up: the ball tray is "absolutely unclear"; not everybody reads the upgrade chips; the
HUD shows ~8 feature buttons from the first second (codex, supply drop, daily rewards, daily run,
collection, battle pass, achievements, rank) — "most people click once and close" → Poki Player Fit risk.
1. Default music → Cozy Harmony / "Gemütliche Harmonie" (`DEFAULT_MUSIC_TRACK`; saved choices kept).
2. `use/useFeatureUnlocks.ts`: an 8-step ladder, ONE unlock at a time, each on best row OR lifetime
   losses (codex 6|1 · supply 11|1 · collection 16|2 · daily rewards 21|3 · battle pass 26|4 ·
   achievements 31|5 · rank 36|6 · daily run 41|7). Celebrated at a calm aim phase (`FeatureUnlockFx`:
   the button's own clone pops up big at the board centre with rays, flies to its slot, confetti), then
   the button glows with a hint arrow until tapped. Saves predating it unlock silently from best row.
   Locked features stay silent (no achievement toasts, no pulses).
3. Coach lesson `trayIntro` (wordless, on the real tray): tray balls fly to the unit (= your shots),
   a "+1" drops into an empty socket, a full tray merges twins into the next tier.
4. `UpgradeDemo`: press the chip → a spark flies to what it changes → the effect plays there
   (capacity: new socket · damage: stronger hit · speed: faster stream · luck: more bubbles · bounty:
   coins into the wallet). Used by the FTUE upgrade beat and once more (`upgrade` lesson) if a paid
   upgrade glows for 2 aim phases without a purchase.
5. Always on: at every volley the tray's balls stream into the unit; a collected "+1" flies into the tray.

Status (2026-09-23): all five built. Tests: `tests/barrage/ui/featureUnlocks.test.ts` (14),
`coach.test.ts` (+8 for trayIntro / upgrade); mutation sweep over the ladder + the new lesson branches
fully killed (one equivalent mutant, pinned by the monotonic-ladder test). Browser-checked portrait +
landscape: calm fresh HUD, FTUE upgrade beat with two windows, tray lesson, upgrade lesson on Damage,
codex + supply unlock celebrations and their glow. Also fixed: a "+1" that spilled into coins popped "+1"
on the tray. Open for a human playtest: the ladder's row / loss numbers.

## Pass 4 — treasure chest, rank plaque, elemental skin shells (2026-09-23)
1. Treasure chest back to the Survivalist rhythm (`useSupplyDrop.ts`): small coin gift 3 min after a claim,
   big gift (4×, may carry a skill charge) at 10 min, instead of one chest every 4 h. The button shows a
   draining veil + countdown, then a silver "+N" with a gold bar filling toward the big gift, then gold.
   It is now the FIRST earned feature (row 6 | 1 loss); codex moved to 11 | 1.
2. Leaderboard deployed (Worker + D1, `worker/SETUP.md` "Current deployment"). The rank left the ladder:
   a gold runic plaque (`RankBadge.vue` in the upgrade chips' style, `RuneFrame` "global rank") hangs on
   the board's top rim on every layout; the board reserves 16–26 px above itself for it.
3. Ball skins reworked. The old 15 swapped the whole ball for a prop sprite (baseball, clay pot, eye,
   bullseye…), hiding the tier's face — the one thing merges are about — and selling the FEVER look.
   Now 12 elemental shells around the face: glass (free), stone, tide, gale, frost, amber, lava,
   diamond, obsidian, glow rune, gilded, eclipse (tide / gale / frost / gilded / eclipse drawn,
   the rest cut from the painted balls). The shop cards are the renderer's own bakes around the
   player's best tier. Retired skins are refunded once at their old price; an equipped one falls back
   to glass. Rainbow is FEVER only.

Status (2026-09-23): built; full suite 850/851 (the one failure is the known `artSheet` fighter-36
lattice), vue-tsc clean; browser-checked the chest, the plaque (portrait + landscape), skins in flight,
the Collection previews and the refund on a seeded save.

## New walkers — imp, treant, carbuncle, cyclops (2026-09-23)
Art dropped in `public/enemies/` (imp, trent, carfuncle, cyclops `_256x256.webp`). One rule each, like the
first six (CONTRACT §2); unlock rows sit between bosses, past the row-30 gate the casual bot reaches at ~5.5 min.
| kind | rule | unlock | HP× | coins× | badge |
|---|---|---|---|---|---|
| imp | defeated → splits into 2 mini imps (35% HP, no split, 35% coins) in free cells: own, left, right, above | 36 | 1 | 1.2 | split |
| treant | slow: marches only every other turn (holds up what's behind it) | 44 | 2.5 | 2.2 | slow |
| carbuncle | gem shield blocks the first damage each turn (regrows every aim phase) | 52 | 1.2 | 1.8 | shield |
| cyclops | charges 2 rows every other turn; orange chevrons under it on charge turns (always on) | 58 | 1.4 | 1.6 | charge |
Parity for charge / rest = `(turn + id) % 2` at the advance (as the centaur's spit). Forced kills (meteor
continue's clearBottom, the boss throw-back crush, execute) ignore the shield; clearBottom/crush never split.
Events: `shieldPop`, `shieldUp`, `split`, `charge`. Renderer: shield bubble always drawn while up, mini imps at
0.66 scale, 4 new rule badges + demos (coach's ruleMarks). i18n `barrage.monsters.<kind>` × 21 locales.
Verify: engine tests per rule, sim before/after (baseline casual 6×300: median best row 67, first breach 35).
**Done 2026-09-23.** `tests/barrage/engine/walkers.test.ts` (15 cases: each rule, forced clears, snapshot
round-trip, roster unlock rows, a deterministic row-60 run that exercises split/charge/shield). Sim, casual
bot 12 seeds × 300 turns, old roster vs new: best row median 74 → 73, breaches 17 → 17, rows < 36 identical
— the late walkers add variety without moving the difficulty. Browser-checked at rows 36/44/52/58 (badges,
demos, gem bubble, charge chevrons, live volleys: no page errors).

## Blind playtest pass (2026-09-24) — `tools/playtest/`, run 1 → fixes → run 2
Run 1 (4 blind Sonnet testers, 3:00 each, headed Chrome, fresh profiles): every tester's first drag went
UP toward the monsters and the board swallowed it (the pass-2 wrong-way guard) — Mia and Jonas never fired,
Leo and Dev found a shot after ~1:08. The first-screen hint's hand ended on the tray portrait (tapped 11×),
the aim preview's ball marker read as a dud shot, the recall button read as "confirm", kills didn't read,
everyone tried to tap the flying chest. Report: https://claude.ai/artifact/Dj3HQNPtwcJzTsg3SPfXz5.
Fixes (all built, tested, browser-checked):
1. Dual-mode aim (`render/aim.ts`, `BarrageBoard.vue`): finger above the launch line → aim AT the finger,
   below it → slingshot; preview from the press, only while a finger is down, hollow-ring end marker; release
   always fires (clamped 8°/172°); tap fires at the point; the only cancel is releasing on the launcher.
2. Coach: `coach/FingerDemo.vue` (replaces SlingshotDemo) — ghost finger mid-board drags toward the
   monsters, dashed ghost line, never over the panel; idle nudge 4.5 s; angled bank-shot lesson on turn 2–3.
3. First-session kill hold 0.4 s (flash, HP to 0, squash, poof, coin flight) + 1.5× damage numbers.
4. Flying chest: `engine.tapChest(x, y)`, born fully on board, 0.6× speed in the first session, tap hint.
5. Recall: skip glyph, only after 2 s of a volley, hidden during the FTUE. Denied upgrade chip (shake, red
   cost, sound). CoinBadge "+N" pop timed to the coin landing.
Suite 900/901 (known fighter-36 art lattice), vue-tsc clean. Run 2 results: see `playtest-runs/run-2/`
(git-ignored) and the updated report.

### Run-2 fix pass (2026-09-24)
Run 2 (report v2/v3 at the same link): shooting learned in 8 s, but nobody bought a paid upgrade (115–284
coins unspent), the first boss drowned in grunt rows, a boss kill + breach landed in one turn, the only
danger cue was a red floor, the shot demo replayed 14–18× per tester, the chip denial was invisible,
merges went unnoticed. Built:
1. Boss death blast (`bossBlast`): clears the bottom two rows and skips that turn's march — a boss kill
   can never be followed by a breach in the same turn (sim: 6 → 0 across all bots).
2. The first boss comes alone: rows spawned while it lives carry only their "+1".
3. `EngineConfig.assist` (−20% HP up to row 30) while the player owns < 2 paid upgrade levels, never in
   Daily (no-upgrade bot: first boss 16 → 20 of 24, first breach row 20 → 26; casual bot unchanged).
4. Always-on danger pips ('2' amber, '1' red) on every threatening monster + one shake and a warning
   sound on the aim before a breaching march; boss damage numbers 1.5×; `BreachOffer.recap`.
5. Upgrade funnel (`coach/UpgradeFunnel.vue`, `RuneArrows.vue`): gold rune arrows on DAMAGE once it is
   affordable after the free Tray Capacity claim (coins fly in, the hand presses; ≤ 6 showings), again on
   the glowing chip after every boss kill and breach; a quiet gold ring on every READY chip.
6. Shot demo rule: hidden while a shot was fired in the last 20 s, shown otherwise (AFK return); first
   frame already shows the hand.
7. Denied chip: grey unaffordable prices, red flash, "Need N more" callout, wallet pulse, chip shake and a
   small screenshake.
8. Merge lightbox (`MergeLightbox.vue`): pauses the game and dims all but the tray for the first 3 merges
   and every new-tier merge (twins fuse, trail into the launcher, codex peek); later merges animate
   unpaused. OVERRUN shows row / kills / coins; HUD clipping and the enrage label fixed.
Suite 953/954 (known fighter-36 art lattice), vue-tsc clean. Run 3 in `playtest-runs/run-3/`.
