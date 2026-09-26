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

### Run-3 fix pass (2026-09-24)
Run 3 (report v4/v5 at the same link): the upgrade funnel worked (paid levels 0 → 1–5, three of four beat
the first boss), but every tester hit a wall within five rows of it — row HP 17 → 73 → 181 → 280 at rows
10/16/20/22 against ×1.25–1.56 damage, and the safety net switching off at the 2nd purchase added +25% on
top. The natural first tap (on the unit) was the one cancel; grunts already on the board shielded the first
boss; hit numbers showed overkill; nobody learned what the line does before losing; the chest pill, the
shield charge and the OVERRUN coin total read as noise. Built:
1. No cliffs (`engine/monsters.ts`, `economy.ts`; CONTRACT §2): ×1.15 per clock row to 18, then ×1.25; an
   HP clock held by the boss row, the whole first-boss fight, 3 rows of a later fight and a 2-row plateau
   after every kill (Daily: clock = real row); later bosses ×45 row HP; the safety net fades by paid level
   (`assistForPaidLevels`: 1, 1, 0.75, 0.5, 0.25, 0) and over clock rows 20 → 40. New `human` sim bot
   (9.5 s/turn, best-of-2 aim, Damage first, one purchase per 4–5 turns) with pressure / post-pre metrics:
   pressure at rows 16–20 5.57× → 1.33× of rows 6–10, post/pre-boss HP 4.61 → 1.13, first breach row 31
   (now at the row-20 boss, first try 10/24), row-10 boss 24/24. Casual best row 63 → 83 (over target,
   accepted). Daily: best-of-2 ends ~row 30 (random 29, best-of-8 39). Glow rule left as cheapest.
2. First-boss roar (`bossRoar`): the first boss clears every walker on the board as it arrives (coins,
   shockwave, grunts flung away); the first hit on each boss pops a 2× number on it.
3. `dealt` on `hit`/`dot`: damage numbers show the HP actually removed.
4. The unit: a tap on it fires the repeat shot (last fired angle, straight up first); only a drag that
   comes back onto it cancels. `beginAimFrom`: a press on the tray's ball orbs starts an aim (portrait and
   landscape).
5. The line wears a skull at both ends (lit red while a `1` pip shows); the one-time *overrun* lesson plays
   `overrunDemo` (a ghost of the monster walks across the line, line + skull flash) the first time a `1`
   pip appears, FTUE included.
6. Labels: OVERRUN recap "+N earned this run"; HUD name tips (`HudTip.vue`) on the tray status icons and a
   still-filling chest; the chest's gift pill is coin + "+N", its countdown a clock.
Harness: `pt-daemon.mjs` now grabs a `NNN-moment.jpg` whenever the merge lightbox pauses a settling turn.
Suite 1053/1054 (known fighter-36 art lattice), vue-tsc clean. Run 4 in `playtest-runs/run-4/`.
Run 4 (report v6/v7 at the same link): all four beat the first boss (roar read as "great tension release"),
rows 18–26 at 3:00, fun 3/4/4/4, three of four would keep playing. Open, in order: (1) purchases stall after
the first Damage (1/1/0/2 paid levels, 176–449 coins unspent): funnel hand beats the shot demo after 3 shots,
rich-wallet funnel return, glow the power tracks, visible payoff; re-tune the sim's human bot to ~1 paid level
per 3 min; (2) the overrun demo must end on the consequence (ghost snuffs the unit) + a still cue while a `1`
pip shows; (3) first boss holds its minions until enraged; (4) tough-kind badge → heart ×N; (5) checkpoint
restart keeps the stronger tray; (6) chest refill visual, ball-glyph ×N, rank plaque tip. Harness now grabs
lightbox + first-lesson moment frames.

### Run-4 fix pass (2026-09-24)
1. Power first: `glowTrack` (economy.ts) — the cheaper affordable Damage/Capacity glows, others only when
   neither is affordable. Funnel owns the ghost hand after 3 lifetime volleys (shot demos yield); rich-wallet
   funnel (≥ 2× the glowing price, 3 idle aims, ≥ 4 aims apart, no cap, never under a modal / unlock / coin
   rain). Payoffs: a Damage buy flares the unit and the next volley's numbers burn gold; a Capacity buy drops
   the new socket into the tray. Sim `humanlow` (run-4 buying): first breach row 31 (row-20 boss), no wall.
2. `overrunDemo` ends on the consequence (~3 s): the ghost walks to the unit, snuffs it grey and cracked, the
   board dims red-black, the unit relights. While a `1` pip shows the unit sputters pale, sweats and trembles
   (and the tray orbs tremble).
3. First boss holds its minions until enraged. 4. Tough kinds wear a heart + "×1.6"/"×2". 5. Checkpoint
   restart keeps the stronger tray (`restartTray`, `breachTray` persisted). 6. Chest reads empty + refilling
   during its countdown; ball glyph before the launcher's "×N"; rank plaque name tip ("Global rank").
Harness: moment frames for the first showing of each coach lesson; the game is held (visibility pause)
between actions so game time matches the play budget; `--headless 1` for harness tests.
Note: a parallel session added "boss mercy" (`bossHpMultForDeaths`, `checkpoint.deaths`) during this pass.
Suite 1127/1128 (known fighter-36 art lattice), vue-tsc clean. Run 5 in `playtest-runs/run-5/`.
Run 5 (report v8/v9 at the same link): all four beat the first boss, paid levels 0/2/2/2 (three bought
Damage + Capacity), fun 3/4/4/4, three of four would keep playing; the held harness let Dev catch the flying
chest. Open, in order: (1) the row-20 boss reads as a wall (57 → 792–1,100 HP; sim humanlow first try 2/24)
— size it for a first-session player, lift the scripted first boss a little, no empty board after it;
(2) lose rule: demo at the FIRST danger ('2' pip), on a walker not a boss, ending on the stakes ("↺ 11" flag
onto the snuffed unit); (3) drop the tough-kind badge; behaviour badges act out in a still-readable way;
(4) free offer vs "need N more"; (5) flash the bounce path on a tap-fire; (6) HUD font's "2" reads as "Z".
Harness note: the moment rule fires on every sr-only live region (68 frames in run 5) — narrow it to the
coach overlay + merge lightbox next time.

### Run-5 fix pass (2026-09-24)
1. Boss ladder (`bossHpFactor`): scripted first boss ×15 × 0.32 (57 → 65 shown), endless 2nd boss ×15
   (~1,188 → ~396 for a low buyer), 3rd ×40, 4th on ×45; Daily unchanged. Sim (48 seeds, boss mercy on):
   humanlow row-20 boss first try 6 → 40/48 (by 2nd try 48/48), fight 27 → 8 turns; human 30 → 48/48.
   After the first boss's kill its quiet turn still spawns the next row (no empty board; 42 → 0 empty aims).
2. Lose rule: the overrun lesson fires at the first danger (`2` or `1` pip), picks a walker over a boss,
   counts once half has played, and passes `checkpointRow + 1`; the demo ends on a "↺ 11" flag on the
   snuffed unit (works for 2-march monsters too). The sr sentence names the restart row (21 locales).
3. Tough kinds wear no badge; behaviour kinds preview their next move while badged (goblin hop ghost + arc,
   dryad "+" on heal targets, centaur spit target, treant rest glyph).
4. Free offer: a tap on another chip pulses the FREE chip instead of "need N more"; the refusal callout is
   anchored on the tapped chip. 5. A tap-fire flashes the aim path for 0.3 s. 6. Digits in 'EB Digits'
   (Lilita One 0–9, OFL) across the HUD and the canvas glyph atlases — "ROW 22" no longer reads "ZZ".
Harness: moments key on `[data-coach-live]` only. Parallel session (not this pass): boss mercy and a
"Tap to Shoot" text banner (`ShootPrompt.vue`) before the first shot — in the run-6 build.
Suite 1178/1179 (known fighter-36 art lattice), vue-tsc clean. Run 6 in `playtest-runs/run-6/`.
Run 6 (report v10/v11 at the same link): ALL FOUR would keep playing (first time); paid levels 3/2/2/2,
first boss 4/4, second boss 370–446 HP read as a step. Open, in order: (1) the overrun demo never fired —
its trigger ('2' pip) comes one march after the red floor/line/reticles (2 rows of space): use ONE threshold
for line, pips (a '3' pip), reticles and demo; (2) silent boss misses — flash/nudge the boss on every hit,
a grey whiff puff + HP-plate shake when a volley misses it; (3) a "gear up" funnel beat when a boss ARRIVES
(testers met boss 2 with ~200 coins unspent); (4) the goblin's hop preview is too small at the top edge;
(5) skill banners/unlocks without visible cause (fly the glyph from the bubble; unlock live region →
`data-coach-live` for the harness). Build note: the parallel session's "Tap to shoot" banner was live in run 6.

### Late-game + fun pass (2026-09-24, after run 6)
Balance (sim-tuned, CONTRACT §2/§3/§6): momentum (+5 % speed and damage per wall/ceiling bounce, cap +100 %),
Tempo ×1.12 damage a level and uncapped, kill coins ×1.10 a row past row 40, row HP ×1.18 a clock row past clock
24 (the Daily keeps ×1.25); the hidden savior boost (×3 / ×1.5 damage on the last / second-last volley before a
boss breaches, endless only); combo coins (each ball's hits past 12 pay 0.5 slime kills, ≤ 4 a volley). Human bot
bite rows 61–130 27–18 % → 58–53 %; last-volley boss kills 120 → 178 of ~450; combo coins leave progression
unchanged within noise. Fun items from run 6: (1) one danger threshold — 3 marches for floor, line, pips (`3`
pip), reticles and lose demo; (2) boss hit jolt + whiff (bar shake, grey puff, plate wobble); (3) gear-up
funnel beat when a boss arrives; the funnel waits one aim after any purchase (Mia's "two taps": her first tap
claimed the FREE chip and the Damage arrows started that instant); the whole funnel retires past row 25;
(4) resting aim line + drag/flash preview to the 2nd bounce; (5) combo tally ("×hits" / "+coins") and a
crescendo up to ×200; (6) skill toast icons fly from their bubble; unlock sentence → `data-coach-live`. Still
open from run 6: the goblin's hop preview at the top edge. Perf: a separate backdrop canvas measured
inconclusive (±80 % noise on the desktop proxy) and was reverted — `PERF-LEDGER.md`; needs a real phone.
Suite 1209/1210 (known fighter-36 art lattice), vue-tsc clean. Run 7 in `playtest-runs/run-7/`.
Run 7 (report v12/v13 at the same link): fun 4/3/4/4 (run 6: 4/4/4/3), all four would keep playing; Jonas fun 3 → 4,
controls 3 → 5; Leo overrun at row 25 and called it fair. The lose demo now fires (3 of 4) but reads as an unexplained
red overlay in stills (on the enraged first boss: "a sprite glitch"). Open, in order: (1) Leo tapped DAMAGE beside the
FREE chip, the wordless redirect read as nothing, he never claimed it — so no funnel ever ran (0 upgrades, 407 coins):
let any upgrade-bar tap claim the free chip, grant it after two more aims; (2) the lose demo: never on a boss, end on a
ghost of the real OVERRUN card; (3) the second boss lands on a full board: give it the first boss's roar (re-check its
sim fight); (4) rich wallets (Mia 323, Jonas 281): one tap buys every level the wallet covers; (5) TAP TO SHOOT over the
drag demo on the first frame. Harness: a moment frame for `[data-coach-live]` changes while held between actions (the
unlock fly-in happens there).

### Run-7 fix pass (2026-09-24)
1. Death sequence — the lose rule is taught by the loss itself (`render/death.ts`, `DeathOverlay.vue`): on a real
   breach the breacher nearest the unit rears up and lunges into it, the others surge a step; the unit TEARS APART
   (4×4 pieces of its own sprite fly, bounce and lie on the floor going ash grey; red flash, one big shake) and the
   board dims red-black round the wreck; "WASTED" / "GEFALLEN" (`barrage.breach.wasted`, 21 locales) holds in blood
   red on a black band over a colour-drained screen (GTA / Elden Ring). The death screen (and the Daily result) waits
   2.4 s for it (`deathScene` in useBarrage). Reduced motion: no lunge, no flight — a heap of pieces. The first-danger
   overrun lesson, its ghost demo, the "↺ 11" flag (`demoFlag.ts`) and `coach.overrun` are retired.
2. Free Tray Capacity: while it is offered, ANY chip tap claims it (no redirect); unclaimed, it is granted on its own
   two aims after the FTUE hands over (`FREE_GRANT_AIMS`, the socket drops into the tray).
3. Rich wallets: a tap on the glowing power chip buys up to 5 levels the way the glow alternates Damage /
   Capacity (`buyGlowing`; from 400 coins at 1/1: Capacity ×3 + Damage ×2, "×N" on each chip). A per-chip "buy
   all" was tried first and dropped: 283 coins into five Capacity levels, Damage left at 1. Not modelled in the sim
   (its buyers purchase one level at a time), so humanlow-style players now spend faster than the sim assumes.
4. The endless run's second boss roars the board clear on arrival too (`roarsOnArrival`; its row's light escort
   still spawns). Sim, 40 seeds: human row-20 boss first try 40/40, fight 5 turns (unchanged); humanlow first try
   38/40, fight 7 turns (unchanged), by-2nd 38 → 39/40, row-30 boss 12 → 16/40 (the roared walkers' coins).
5. Before the first shot the FTUE hand holds back: "Tap to Shoot" is the one instruction on the first frame; the
   drag demo comes after the first volley.
Harness: fresh `[data-coach-live]` sentences also get a moment frame while the game is held between actions;
"WASTED" carries `data-coach-live="death"`. Boss-miss "HP stuck" complaints are not filed any more (README caveat);
removed from the run-6/run-7 findings and tester reports, run-7 report republished (v14, same link).
Suite 1194/1195 (known fighter-36 art lattice; the Poki bracket timing test flakes under full-suite load and passes alone), vue-tsc
clean; Sass of the touched components compiles.

### Rewarded buttons (2026-09-24, before run 8)
Rewarded buttons are never green (Google Play; green sells the ad as "the good choice"): the 3× chest, +5 balls and
the Collection's skin-ad pill wear the ad blue (`--ad-*` in `components.sass`); the breach's Meteor keeps its fire
orange. The boss chest's reward is 3× (`CHEST_AD_MULT`, was 2×) and its button says what it multiplies: "▶ 3× ●"
(movie icon, multiplier, coin); after the ad, "Bounty ×3!" (`barrage.chest.boost*`, 21 locales). Coin-priced
builds offer it only when the extra 2× bounty beats the price. "+5 balls": bigger outlined label, the movie icon in
its own dark socket, a bigger ball glyph. Dev-only `window.__fakeRewarded(true)` (NoopProvider) shows and grants the
rewarded placements without an ad backend; checked on a poki-playtest dev build (chest 180 → 540).
Run 8 in `playtest-runs/run-8/` (report v15/v16 at the same link; build on port 5321, 5320 held a stale preview).
Run 8: fun 3/3/4/4 (run 7: 4/3/4/4), controls 3/4/5/4; all four claimed the free Capacity; Dev, Leo and Jonas ended
with 56–97 coins after 5–7 paid levels (run 7: 130–407 unspent); the first frame carries only TAP TO SHOOT. Nobody
lost, so the death sequence was not seen. Open, in order: (1) the glow-following bundle reads as a bug — a tap on
one chip also raised the other (Dev: "double purchase", the ×2 pill over the name read as MAX; Jonas: "Kapazität
changed on its own"): buy only the tapped chip while it stays the glowing one, and move the count onto the price as
"▲N"; (2) Mia bought nothing (347 coins, Damage 0): the Damage arrows read as "a stuck tutorial hint" — after three
ignored showings make the first Damage level FREE, like the Capacity gift everyone took; (3) boss 1 dies in one
volley to an 8-ball tray (Dev) while the rows after it jump 1–4 → 10–15 HP (Mia): size boss 1 to the tray it
meets, ease the first rows after it in; (4) seed one persona a march from the line so the next run sees "WASTED";
(5) still unexplained: rank banner (all four), goblin badge, new HUD icons, winged chest; (6) de: "Standardtempo"
in the difficulty text clashes with the TEMPO stat. Harness: tester agents inherit the project memory index (one
cited "your standing note") — README caveat.

### Run-8 fix pass + challenge pass (2026-09-24)
1. Challenge: adaptive boss HP (`BOSS_ADAPT`, every endless boss ≥ 7 volleys × 3 hits × its tray's power —
   balls × tiers × Ball Damage × Tempo), `ftueBoss` 0.32 → 0.5, `bossSecond` 15 → 20, mid game up to 1.6× HP
   (`mid` 1.22 / `late` 1.156, back on the old curve at clock 24; the Daily unchanged). Sim, 40 × 45 turns:
   first-boss fight 3 → 6–7 turns, first try 38–39/40 (noup 31); a loss within ~7 min for human 7/40, random
   8/40, humanlow 25/40; late game and the Daily unchanged.
2. The glowing chip buys only ITSELF, for as long as it keeps glowing, "▲N" by its price (run 8: the bundle read
   as a double purchase). 3. Damage arrows ignored three times → the first Damage level is FREE (Mia: 347 coins,
   Damage 0). 4. The funnel rests: 10 s up, 20 s away, while unbought. 5. The drag demo shows again under "Tap
   to Shoot" before the first shot (the designer's call). 6. The first "+1" on a stage: paused, a spotlight
   follows it into the tray where it becomes the ball, then a comet into the launcher (once per profile).
7. The rank plaque names itself ("GLOBAL RANK #…"); the goblin's hop preview is bold (bigger arc, arrowhead
   and ghost, a small hop); German difficulty hints no longer say "Tempo".
Not done, on purpose: the post-boss "breather" rows (run 8's boss-ramp idea) — the challenge request goes the
other way, and the first boss's plateau (2 rows at its clock) already holds. Harness: `--budget 300 --extend
420 --wallcap 2100` (5 min, 7 without a loss); the report reads the budget from the daemons' start log; the
tester agents are spawned with the project memory index moved aside (run 8's leak).
Suite 1204/1205 (known fighter-36 art lattice), vue-tsc clean.
Run 9 in `playtest-runs/run-9/` (5 min, 7 without a loss; report v17/v18 at the same link; build on port 5322).
Run 9: all four lost once (run 8: nobody), each in a boss fight: Jonas 2:21 to boss 1 (37 of 224 HP left, restart
at row 1), Leo 3:54 as the Fire Dragon landed on a full board, Mia 4:02 to the Great Worm (36 of 693 left), Dev
5:27 to the Fire Dragon. First bosses had 110–224 HP and took 8–9 turns. Fun 3/4/4/3 (same average as run 8), but
clarity 2/2/2/3 and keep-playing 3 for everyone (run 8: 2/3/3/3, 3/3/4/4). All four would keep playing, and the
"keep all your coins" restart carried every loss. Mia bought 5 paid levels (run 8: none), and nobody read the
multi-buy as a bug. Open, in order: (1) the adaptive floor assumes 3 hits per ball, but real volleys scored
0.8–2.4 hits per ball; Jonas's straight taps walled on boss 1, and his retry boss had MORE HP (224 → 348, because
the floor follows the tray he kept): base the floor on measured damage per volley, and never raise a boss's HP on
a retry against it; (2) three called the death unforeshadowed (Mia: "no player health"; Jonas read the boss's
countdown pip as an enrage timer): mirror the smallest pip on the launcher and name the culprit on the recap;
(3) Dev 1,156, Leo 503 and Jonas 249 coins unspent, all at Capacity 3; Leo never tapped a chip, not even the FREE
one: offer the glowing power chip on the boss-chest card; (4) de: "GEFALLEN" over the greyed boss reads as the
boss dying; (5) still unexplained: the winged chest, the bottom-row icons, GLÜCK, chain triggers and the "Beute"
overlap. The first "+1" spotlight fell between frames for all four (harness; now framed twice). Harness: the reply
now carries a `note` when the budget drops from 7 to 5 minutes (Mia and Jonas filed that drop as "the game
skipped 2 minutes"), and a loss after 5 minutes gets 30 s of grace (Dev never saw his recap). With the memory
index moved aside, no tester cited project notes.

### Run-9 fix pass + Poki fixes (2026-09-24)
1. Boss HP from the player's own aim: the engine keeps EMAs of a volley's damage ÷ the tray's power (walkers, bosses;
   `aimView`, in the snapshot); the floor uses them (`bossAimHpb`: boss EMA, else walkers × 1.2, clamped 1–4),
   5 volleys for the first boss, 7 later. A retry is capped at the full HP of the boss that won
   (`checkpoint.bossHp` → `config.bossHpCap`, mercy on top). Sim with a new `tapper` bot (run 9's straight
   tapper): first boss first try 36–40/40 for every bot (tapper was ~73% of meetings), fights 4–7 turns; second
   boss tapper 29/40, noup 9/40; runs with a loss in 45 turns human 4/40, humanlow 22/40, random 5/40.
2. The loss foreshadowed and named: the fewest marches left mirrored as a pip on the unit's shoulder; the death
   sequence keeps the culprit (`pickStriker`) in colour with a red outline, the grey sparing a pool round it;
   the loss screen names it beside its portrait (`barrage.breach.bodyBy`, 21 locales); de "Überrannt" for
   "Gefallen".
3. Coins → power: after the boss chest pays, the card offers the glowing chip (or the pending free level) —
   "Power up!" (`barrage.chest.powerUp`, 21 locales), one tap = one level, "Continue". A claimed free level shows a
   green "FREE" pill by the chip's new price.
4. Unexplained bits: the first three chests of a session wear the tap hint and every chest shows coins hopping out
   of its lid; a long press on a chip names it and says what it does (buys nothing), on a HUD button names it;
   the achievement toast shows its goal ("Hits in one volley: 50"); de: the boss chest's multiplier is
   "Kopfgeld", so "Beute" stays the Bounty chip's.
5. Poki: every playtester's first tap opened a "Rewarded Break" — on the Poki build the rewarded is ready from the
   first frame, so the blue "▶ +5 balls" stood under the board from turn 1. It now shows only after the player's
   first boss kill, in a boss fight or with a danger pip on the board.
6. Poki: playtest videos were black but for confetti. The SDK core (read from the shipped bundle) films canvases
   only — `playtestSetCanvas`, else the LARGEST visible canvas: the full-window particle canvas. Now the particle
   canvas opts out (`data-poki-no-playtest`) and a window-sized invisible stage canvas is handed to
   `playtestSetCanvas` (`utils/pokiPlaytestStage.ts`): while the recorder films it, it paints the backdrop, the
   board, the particles and an outline of the HUD (buttons, modal panels, tray, wallet, row badge, with their
   labels). The SDK's own DOM capture (`playtestCaptureHtmlOn`) stays OFF: on this DOM one snapshot is a
   200–460 ms task on a desktop and 2.1–2.9 s at 4× CPU throttle. Checked on a Poki build in headless Chrome:
   the real SDK logs `playtestSetCanvas(<stage>)`; frame pacing at 4× unchanged (p95 16.9 → 17.2 ms).
Harness: the pickup spotlight gets two moment frames; a budget drop after a loss is announced in the reply
(`note`), and a loss after 5 minutes gets 30 s of grace.
Suite 1220/1221 (known fighter-36 art lattice), vue-tsc clean.
Run 10 in `playtest-runs/run-10/` (report v19/v20 at the same link; build on port 5323). Fun 4 from all four
(run 9: 3/4/4/3), clarity 2/3/3/3, controls 4–5. First bosses 166/102/102/102 HP, all won on the first try. Mia
lost at 4:01 (the enraged Great Worm broke through on 3 HP), Jonas at 5:24 (the Fire Dragon landed on a full
board); Leo and Dev played 7 minutes (rows 49 / 48, three boss kills each). Read as intended: the named culprit
(Jonas quoted "Durchbruch in Reihe 33: Oger"), the launcher pip (Leo, Dev), the achievement goal line (Dev: "the
best single moment"), the chest's coin peek, the "+1" spotlight (Mia). Open, in order: (1) the glowing chip's
multi-buy read as a bug again (Jonas: 89 coins for one tap) — one tap, one level; (2) the third boss lands on a full
board (Jonas lost there, Dev struggled, Leo in run 9) — let it roar the board clear too; (3) the chest's power-up
step was skipped by three of four (the coin shower flies over it) — show it after the shower, "Power up" as the
primary button; late coins pile up (Dev 1,441, Leo 1,839); (4) the launcher pip is seen but only a loss teaches
it; an enraged boss's faster countdown still surprises (Mia, twice); (5) nobody found the long press: put the
chip's effect in the "need N more" callout. The '+5 balls' no longer shows early (Dev first saw it at 6:16, in a
boss fight).

**Run-10 fix pass** (1, 4, 5; decided against 2 and 3: the third boss stays as it is, and the chest's power-up
step stays too — coins a player does not spend are the player's call). (1) One tap buys one level of the chip
tapped, the glowing one too: `buyGlowing` and its "▲N" (`barrage.upgrades.levelsUp`) are gone; the green "FREE"
pill of a claimed gift is the only pill left. (4) A falling pip shows its fall: a ring, the old digit dropping out
below and fading, a swell — harder and longer for a jump by two (an enraged boss, a charging cyclops); the unit's
pip falls on the same beat; at `1` a dashed red tether runs from the monster that will reach the unit to the
unit's pip. (5) The refused tap's "need N more" callout carries the chip's effect as a second line, and the first
purchase of each chip in a session shows its name plate. Checked in the dev board lab (walkers 2 → 1, a boss
3 → 1) and in the game (Bounty refused: "Need 30 more | Earn more coins from every monster."; a glowing Capacity
tap with 20k coins bought one level; the first Speed purchase named it, the second did not).

Run 11 in `playtest-runs/run-11/` (report v21/v22 at the same link; build on port 5324). Fun 4/4/4/3 (Jonas's 3:
the third boss, 360 → 1.8K HP), clarity 3 from all four (run 10: 2/3/3/3), keep playing 3.5 (run 10: 3.25); all four
would continue. First bosses 102/102/108/102 HP, all won on the first try. Mia lost at 5:14 (row 37) and Jonas at 5:36
(row 30), both during the Fire Dragon, both to a walker at the right wall that wore the red '1' and the tether while
they shot straight up. Dev and Leo played 7 minutes (row 39, three boss kills each), both past the Fire Dragon right
after claiming 400–800 coins of achievements they had found by chance. Fixed: the multi-buy (every purchase one level,
nobody filed a purchase as a bug). Paid levels 4/8/7/6 (Mia run 10: 0); Speed, Luck and Bounty 0 for everyone, so their
effect line and name plate never showed. Open, in order: (1) the '1' and the tether are drawn but not read in a crowded
boss frame — give each '1' monster the culprit's red outline during aim and keep one rescue reticle on the nearest '1'
after the survive lesson runs out; (2) unclaimed achievement coins are power the player can't reach — credit them when
the toast shows; (3) Capacity's 'before twins merge' is jargon (3 of 4) — say 'more balls in the tray'; (4) German: the
Damage chip's value is cut off ('x1.95 → x2…') after a purchase in the chest's power-up row — re-fit the chip labels
when the bar resizes or a modal closes; (5) Dev: aim has no skill depth. All four filed the sound muting itself: the four
flips fall in one 26-s band of wall-clock time (00:43), one with the game held and no input, and 8 minutes of scripted
play never reproduced it — most likely the tester windows being muted by hand, as in run 1 (launch them with Chrome's
--mute-audio). Left as they are, by the designer's call: the third boss and the chest's power-up step.

**Run-11 fix pass** (the designer's calls: the mute was the designer silencing the four tester windows; the third
boss now clears a third of the board; wordless animated lessons for speed / luck / bounty, spaced out; the
launcher's countdown as a spotlit, guided lesson). (1) The endless third boss (rows 30–39) roars away a third of
the walkers, lane by lane beside it from the bottom up (`roarShare`, `roarVictims`: channels into the back rows
for bank shots). (2) Spotlight lessons (`lessonSpotlight.ts`, `LessonSpotlight.vue`; the game pauses, a tap
skips, the coach schedules them): the THREAT lesson the first time a monster comes within 3 marches — a ghost of
it marches down while its pip and the unit's tick down together, to the line and a skull; then it rewinds and a
ghost shot takes it out, and the survive lesson's rescue shot follows on the real board; SPEED / LUCK / BOUNTY
once each from rows 12 / 17 / 22 while the chip is unbought, never in danger, under a funnel or on a boss
event's aim, ≥ 3 volleys from any other lesson — the chip lit, its effect shown before (value now) and after
(next value). At "1" the threatening monster also wears the culprit's red outline while the player aims.
(3) Achievements pay out as they are earned (the toast's "+N", coins flying to the wallet); a backlog pays out of
the trophy as it arrives. (4) Capacity's line: "More balls in your tray: more shots every turn." (all 21
locales). (5) The chip labels fit by fractional width and re-fit on resize (German "×1.95 → ×2…"). Harness: the
tester windows run with `--mute-audio`; `.lesson-spot` gets two staged frames. Checked on the dev server (the
threat lesson staged at 3 marches and automatic at the first danger, the rescue shot after it; the three chip
lessons; speed firing on its own at row 15, three volleys after the tray intro; the backlog paying 750 coins on
load and a toast paying "+120").

Run 12 in `playtest-runs/run-12/` (report v23/v24 at the same link; build on port 5325, tester windows muted).
Fun 4 from all four (run 11: 4/4/4/3), keep playing 3.75 (3.5); clarity 3/3/2/2 (3 ×4), controls 4/3/4/4. The
lessons reached them: the threat spotlight all four (rows 8 / 8 / 19 / 25), speed three, luck two, bounty one;
Speed bought by three (run 11: nobody), Dev and Leo the turn after its lesson, Leo Luck the turn after its. Mia
lost at 2:39 (row 20) to the first boss: it stood at the left wall and her taps on the unit repeated a straight
shot past it for ten volleys (restart at row 1). Jonas lost at 4:55 (row 30) in the second boss's fight. Dev
(row 28, his agent stopped at 5:52) and Leo (row 41, three boss kills; the third boss's arrival opened lanes)
never lost; Leo beat the Fire Dragon after the trophy paid its backlog (+797), which he read as "coins jumped
181 → 978 with no cause". Nobody filed the mute. Open, in order: (1) the countdown still does not read as a
stake — all four asked what the line does, three asked for a health or lives indicator: show the unit's
countdown as a 3-segment life bar and end the lesson on it emptying; (2) Bounty's lesson demos one kill ("+10
→ +12" reads as an ordinary reward) — demo a volley; (3) make the trophy's backlog payout a held toast and a
counting wallet; (4) the claimed gift's "FREE" pill beside the next price, and the first-buy plate, make chip
taps look inconsistent. (Mia's first-boss loss — a boss off to the side, only taps — is an AI-tester artifact,
the designer's call: not filed.) Fixed after the run: the idle shot hint no longer resets the chip spotlights' spacing
(Jonas saw six hints and no chip lesson).

**Run-12 fix pass** (the designer's call: the chip taps only; the first boss off a tap's line is an AI-only
problem). A claimed gift's pill reads as received (a check with "FREE"), leaves after 1.5 s and is cleared by
the next chip tap; the first purchase's plate is a receipt — a check and the level bought ("3 → 4") above what
the chip does — opening 380 ms after the buy, once its flare has landed, and cancelled by any touch before.

Run 13 in `playtest-runs/run-13/` (report v25/v26 at the same link; build on port 5326). Fun 4/4/3/4, clarity 2.75
(run 12: 2.5); everyone reached rows 38–41 (run 12: 20–41), Mia and Jonas without a loss, Dev and Leo lost in the
Fire Dragon's fight. The upgrade-tap fix reads: all four read the first purchase's receipt as a purchase, and nobody
saw "FREE" beside "Need N more" again. Mia bought Luck and Bounty on the turn after each lesson (the first Bounty
purchase in thirteen runs); the idle-hint fix let the lessons reach everyone. The trophy's backlog paid everyone
+680 to +1,361 at row 31, and nobody filed it as unexplained. Open, in order: (1) the tray lesson pressed Capacity
while a free Damage level was on offer, so Dev's tap claimed Damage; he never tapped an upgrade again — a tap on an
affordable other chip should buy it and the gift wait, and no lesson should point elsewhere while a gift is on offer;
(2) the countdown is still not read as a stake — Jonas read the launcher's number as its HP: make it a life bar;
(3) the lessons' value pops landed on the rank banner and the boss HP ("#X1.12", "1.2%") — give them a plate inside
the board.

**Run-13 fix pass** ((1) and (3); (2) stays open). A tap on a chip the wallet covers buys that chip while a gift
waits elsewhere — the gift still takes a tap that would only be refused (run 7). The tray lesson (its spill stays
pending) and the chip spotlights wait while a gift sits on another chip (`giftId` in the coach's wiring). The
spotlights' values stand side by side on dark plates, inside the board and below the rank plaque: speed on the
ball's path under the monster hit, luck mid-board under the bubble rows, bounty above the kill or under a boss at
the top.
