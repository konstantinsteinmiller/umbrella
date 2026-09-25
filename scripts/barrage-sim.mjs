/**
 * Elemental Barrage balance sim — the policy bot the row-HP curve and the
 * economy are tuned against (CONTRACT §2 / §6 / §7).
 *
 *   node --import ./scripts/art/ts-resolve.mjs scripts/barrage-sim.mjs [flags]
 *
 * Bots (every buyer buys the chip that glows: economy's `glowTrack`, CONTRACT
 * §0.3 — the cheaper affordable power track, Ball Damage / Tray Capacity, else
 * the cheapest other; a breach restarts the way the game does, §6: before the
 * first boss with the last aim's tray, after it with the stronger (`restartTray`)
 * of the checkpoint tray and the tray at the breach, keeping coins)
 *   casual  each turn samples N angles (default 8), plays every one on a clone
 *           of the engine, fires the best (most damage / kills / "+1"s, never a
 *           breach if any angle avoids it), then buys the glowing upgrade until
 *           nothing is affordable.
 *   random  fires one uniformly random angle, same upgrade and restart rules.
 *   noup    random angles and NEVER buys an upgrade (not even the FTUE's free
 *           one) — the first-timer who has not found the upgrade bar yet.
 *   flat    drags TOWARD the monsters instead of pulling back: every shot is
 *           the pinned edge angle (MIN_AIM or π − MIN_AIM), the slow wall-
 *           to-wall zig-zag. Buys upgrades. The confused-controls floor.
 *   human   calibrated to playtest run 3's telemetry (4 blind first-timers on a
 *           phone, 3 min each): ~9.5 s per turn; aims like a lightly intentional
 *           first-timer (best of 2 random angles); takes the FTUE's free
 *           capacity, buys Ball Damage as soon as it is affordable (the gold-
 *           arrow funnel), then at most ONE purchase — the glowing chip — every
 *           4–5 turns (sooner right after a boss kill or a breach, when the
 *           arrows come back), leaving the surplus unspent. Run 3 at 3 min: rows
 *           15–19, trays [4,3,2] / [3,3,2,1] at capacity 3–4, 1–5 paid levels.
 *   humanlow  run 4's buyer (4 blind first-timers, 3 min: paid levels 1/1/0/2
 *           with 176–449 coins unspent, rows 18–26, trays [4,3,2] / [3,3,1] at
 *           capacity 3): the human's aim and funnel (free capacity, then Damage
 *           once affordable), then ONE purchase — the glowing chip — every 16–20
 *           turns (`--lowgap`), never on the boss-kill / breach arrows
 *           (`--lowrearm` adds them). ~8 s a turn. Sim at t18: row 18, cap 3,
 *           [4,3,2], 1 paid, ~200 coins in the bank — run 4's picture.
 *   tapper  playtest run 9's straight tapper (Jonas tapped the same spot above
 *           the launcher all session): fires at a fixed point mid-board with a
 *           few degrees of thumb noise; buys like humanlow. ~1 ball's worth of
 *           damage per volley on a boss where the human bot does ~2.5.
 *
 * Smoothness metrics (first life = until the first breach)
 *   pressure  per turn with no boss alive: board HP ÷ the bot's mean damage per
 *             volley over its last 3 volleys ("volleys to clear the board");
 *             medians per row band. A wall shows as a band far above 6–10.
 *   post/pre  HP of the first walker row after the first boss kill ÷ HP of the
 *             last walker row before that boss (slime-equivalent HP).
 * Boss metrics (a boss is "the row-20 boss" for its whole decade: with no room
 * at row 20 it spawns at 21, 22…)
 *   first try  killed with no breach at all before the kill · clean: no restart
 *             lost to THAT boss · by 2nd: at most one (boss mercy: the second
 *             meeting has 75% HP, `bossHpMultForDeaths`, mirrored from the game —
 *             a death counts when the boss past the checkpoint stood on the board
 *             before the breaching row)
 *   fight      first spawn → kill, restarts included · 1st: the first meeting's
 *             length, won or lost · win: the winning meeting's length
 *   shown HP   the boss bar's max HP at the first meeting (safety net included)
 *   empty      aim phases with NO monster on the board in the 6 turns after the
 *             first boss kill (run 5: "I kept firing balls into nothing")
 *   clutch     boss kills whose killing volley was fired with ≤ 2 / ≤ 1 volleys
 *             left before the boss breached (`engine.saviorView`) — the near-
 *             death wins the hidden savior boost is for; boss restarts: every
 *             restart lost to a boss, all runs
 * Late-game metrics (the `late` line; every life, restarts included, per row
 * band 21–30 … 201+ — see `lateReport`)
 *   t / d      turns a run spent in the band (median) / breaches in it per run
 *   p          median pressure on walker boards (as above, every life)
 *   bite       median share of a walker board's HP one volley removed
 *   rows       a volley's damage in slime rows' worth (7 slimes at the clock's
 *             HP), median / p90 — p90 ÷ median is how far a lucky combo
 *             out-hits a typical volley
 *   best row by turn 50 / 100 / 150 / 200 / 250
 *
 * Targets (lead). Late-game pass: past row 40 bite and pressure stay near
 * rows 31–40 (human / random bite ≥ ~50% to row 100, pressure ≤ ~3) and the
 * wall comes gradually, for casual past row ~150; a lucky (p90) volley clears
 * more than a slime row; rows 1–40 as the run-5 pass or better; Daily ±1.
 * Run-5 pass: the row-20 boss for the player who reaches it in
 * the first session — a typical fight of ~8–10 turns, first try ≥ 10/24
 * humanlow and ≥ 18/24 human, near-certain by the second try with boss mercy;
 * shown HP boss 2 ÷ boss 1 ≤ ~6× for humanlow; boss 1 first try ≥ 22/24 for
 * humanlow / random / noup, killed around turn 12–16; no empty board after the
 * first boss; 30 / 40 sane; casual still breaches past row 40; random / noup
 * not worse; Daily's end row ±3. Run-4 pass: humanlow's first breach median ≥ ~23 (no wall
 * before ~row 22) and it reaches the row-20 boss; human as the run-3 pass or
 * better; casual / random / noup not worse; boss kill + breach in one turn 0;
 * Daily unchanged. Run-3 pass, still held: human boss10 first try ≥ 20/24, t18
 * rows 15–19, pressure at rows 11–20 ≤ ~1.5× rows 6–10, post/pre ≤ ~1.5; noup
 * first breach ≥ row 20; random first paid upgrade within ~5 turns of the free
 * one; casual still breaches past row 40; balls in flight ≤ ~40.
 *
 * Combo coins (fun pass after run 6: "balance the new combo coins well against
 * the difficulty"; economy `COMBO_COINS`; the `late` line's `combo x%/y%v` =
 * combo share of the band's income / share of volleys that paid, `coins by
 * source` = over the whole run). Kept: each ball's hits past 12 pay 0.5 slime
 * kills, capped at 4 a volley. 48 seeds × 220 turns, off → on: boss first
 * try / by 2nd, first breach and best row unchanged within noise (humanlow
 * identical; human best 114 → 113, random 137 → 140; casual first breach r143
 * → r162); combo = 9–26% of a run's coins. 16 × 260: 1–12% of the income
 * through row 100 (paying on ~1–20% of volleys), rising in the densest late
 * rows (20%+ past row 130, where balls rattle among high-HP boards).
 * Rejected: per-hit pay with hits over 3–5 PER BALL AVERAGE (35–57% of all
 * coins — late boards make every volley "rattle", and small trays were paid
 * for ordinary shots); per-ball 8 free / 0.5 / cap 8 (34–47%).
 *
 * Run-9 fix pass: the adaptive floor measures the player's aim (engine EMAs of
 * a volley's damage ÷ the tray's power, walkers and bosses apart; monsters.ts
 * `bossAimHpb`) instead of assuming 3 hits per ball, the run's first boss takes
 * `firstVolleys` 5, and a retry is capped at the full HP of the boss that won
 * (`config.bossHpCap`, mirrored here). `--aimstat` prints, per boss decade, the
 * aim EMAs at spawn, the floor's hits per ball and the boss damage per volley ÷
 * power (walker ×1.2 and 5 first volleys were picked from a sweep of 0.8–1.5 ×
 * 4–6). 40 seeds × 45 turns:
 *   boss10 first try  human 40/40 · humanlow 40/40 · random 40/40 · casual 40/40 · noup 36/40 · tapper 36/40
 *                     (tapper before: 38 of 52 meetings won)
 *   boss10 fight      human 4 · humanlow 5 · random 6 · noup 6 · tapper 7 · casual 4
 *   boss20 first try  human 40/40 · humanlow 38/40 · random 39/40 · tapper 29/40 · noup 9/40
 *   boss30 first try  human 36/40 · humanlow 19/40 · random 35/40 · tapper 3/40
 *   runs with a loss  human 4/40 · humanlow 22/40 · random 5/40 · casual 0 · tapper 39/40 · noup 40
 *
 * Challenge pass after run 8 ("the overall tuning was too much to the easy
 * side — challenging, but not a quick death"; nobody lost in 3 min; an 8-ball
 * tray one-shot the first boss). Adaptive boss HP (monsters.ts `BOSS_ADAPT`:
 * every endless boss ≥ 7 volleys × 3 hits × the tray's power, `--tune
 * '{"adapt":{"volleys":7,"hitsPerBall":3}}'`), `ftueBoss` 0.32 → 0.5,
 * `bossSecond` 15 → 20, `mid` 1.15 → 1.22 with `late` 1.25 → 1.156 (the mid game
 * up to 1.6× at clock 18, the curve back on its old self at clock 24; the
 * Daily keeps `dailyMid` / `dailyLate`). 40 seeds × 45 turns (≈ a 7-minute
 * session), before → after:
 *   boss10 fight (turns)   human 3 → 6 · random 4 → 7 · noup 5 → 7 · casual 3 → 4
 *   boss10 first try       human 40 → 39 · humanlow 40 → 39 · random 40 → 38 · noup 39 → 31
 *   runs with a loss       human 3 → 7 · humanlow 22 → 25 · random 6 → 8 · casual 0 → 0 · noup 40
 *   row-20 boss first try  human 40 → 39 · humanlow 38 → 35 · noup 15 → 8
 *   row-30 boss (24 × 120) humanlow by 2nd 21/24 (a bossThird of 55 walled it: 8/16)
 * Late game (16 × 260): human bite rows 51–100 44–55% → 50–58%, casual unchanged
 * (its first breach r196 → r213); the Daily's end rows unchanged (29 / 40).
 *
 * Run-7 pass: the endless run's SECOND boss roars the board clear on arrival
 * too (monsters.ts `roarsOnArrival`; run 7: it landed on a full swarm). 40
 * seeds, roar off → on: human row-20 boss first try 40/40 → 40/40, fight 5 →
 * 5 turns; humanlow (40 turns) first try 38 → 38/40, by 2nd 38 → 39, fight 7 →
 * 7, row-30 boss 12 → 16/40 (the roared walkers pay their kill coins). The
 * bots never meet the death sequence — it is display + state only.
 *
 * Savior boost (hidden: "make dying a bit harder and give the near-died
 * moments"; economy `SAVIOR`): every hit of a volley fired while a boss is 1 /
 * 2 volleys from breaching deals ×3 / ×1.5. Sweep (48 seeds × 220 turns,
 * last-volley boss kills · row-30 boss first try, off → on), window / curve:
 *   off                 human 120 · 39   random 195 · 37   humanlow 79 · 15
 *   3 volleys, c1.5     human 162 · 46   random 214 · 44   humanlow 110 · 24
 *   2 volleys, c1       human 175 · 46   random 227 · 44   humanlow 110 · 22
 *   1 volley            human 195 · 45   random 264 · 43   humanlow 118 · 19
 *   2 volleys, c2 (kept) human 178 · 45  random 247 · 44   humanlow 111 · 18
 *   Wider ramps (3–4 volleys) kill bosses earlier — fewer near-death wins for
 *   the same safety; the 1-volley step is the purest but not "graded by
 *   closeness". Kept: +200% on the last volley, +50% on the one before.
 *   Row-20 boss first try humanlow 38 → 46, noup 2 → 6 of 48; human first
 *   breach row 50 → 60; casual (B shape) breaches in 220 turns 3 → 1.
 *
 * Late-game pass ("from row 40+ it gets really hard to defeat everything
 * unless you land very lucky combos"): momentum (balls.ts `MOMENTUM`: +5% speed
 * and damage per wall / ceiling bounce, cap +100%), Tempo ×1.12 damage a level
 * and uncapped (`ECONOMY.tempoDamage`), kill coins ×1.10 a row past row 40
 * (`coinLateGrowth`, was 1.05), row HP ×1.18 a clock row past clock 24
 * (`HP_CURVE.deep` / `deepRow`, was ×1.25; the Daily keeps ×1.25). Before =
 * the same engine with momentum 0, Tempo capped at 10 and speed only, the old
 * coins and curve. 16 seeds × 400 turns, bite by band 41–50 / 61–80 / 81–100 /
 * 101–130 (131–160), best row by turn 250:
 *   human     51% / 27% / 19% / 18%       → 58% / 58% / 57% / 53% (47%)   86 → 114
 *             breaches in rows 61–100 per run 13.9 → 4.4; p90 volley at
 *             61–80 0.75 → 1.32 slime rows (median 0.24 → 0.50)
 *   random    43% / 23% / 17% / 16%       → 60% / 53% / 53% / 43% (35%)   86 → 141
 *   casual    68% / 35% / 18% / 4% (p34)  → 88% / 91% / 84% / 87% (75%)  102 → 197
 *             its wall now comes at rows 161–200 / 201+: bite 40% / 36%,
 *             pressure 2.9 / 3.7
 *   Early game (48 seeds × 220 turns; momentum and Tempo's damage reach it):
 *   row-30 boss by the 2nd try humanlow 27 → 38, random 42 → 48, human first
 *   try 29 → 39; row-20 boss first try human 48 → 47, humanlow 40 → 38, random
 *   41 → 47; noup's first boss 44 → 46; humanlow's row-40 boss by the 2nd try
 *   30 → 23 (clean 11 → 15) — it meets it sooner with the same 3 paid levels.
 *   Tempo in the glow's power set (`--tune '{"power":["damage","capacity","speed"]}'`)
 *   took humanlow's row-30 boss by the 2nd try 38 → 23: kept out.
 *   Sweeps (16 seeds × 260–400): deep 1.17 / 1.18 / 1.19–1.20 with coins
 *   1.09–1.11 all hold human / random bite ≥ ~50% to row 100; tempo 1.15 +
 *   coins 1.12 let casual never breach (bite 100% to row 240) — too soft.
 *   Daily (60 dates): 29 / 30 / 39 → 30 / 30 / 40.
 *
 * Run-5 pass (48 seeds × 220 turns, medians / counts of 48, before → after):
 * the boss ladder — scripted first boss ×15 × 0.32 (was × 0.28), the endless
 * run's second boss ×15 (`bossSecond`, was ×45), its third ×40 (`bossThird`,
 * was ×45), ×45 from the fourth on and for every Daily boss past its first —
 * and the first boss's quiet turn bringing the next row in place (engine
 * `quietSpawn`). "b20" = the row-20 boss; hp = its shown HP (first boss → it).
 *   bot       b20 1st  b20 ≤2nd  b20 fight/1st  hp b10 → b20        1st breach  best    empty
 *   humanlow  6 → 40   37 → 48   27/10 → 8/8    57→1188 → 65→396     r31 → r40   74 → 73  42 → 0
 *             (20.8× → 6.1×)
 *   human     30 → 48  48 → 48   8/8 → 5/5      61→1411 → 69→470     r40 → r50   85 → 84  46 → 0
 *   random    19 → 41  45 → 48   23/9 → 7/7     64→1305 → 73→435     r30 → r39   79 → 82  38 → 0
 *   noup      0 → 1    0 → 5     108/8 → 67/8   57→900 → 65→300      r28 → r28   31 → 35  35 → 0
 *   casual    44 → 48  48 → 48   6/6 → 5/5      64→1485 → 73→495     r60 → r60   95 → 98  48 → 0
 *   flat      40 → 48  48 → 48   7/7 → 5/5      64→1710 → 73→570     r50 → r58   87 → 86  47 → 0
 *   - boss 1 (the scripted Slime Tower) first try: humanlow / human / casual /
 *     flat 48/48 both, random 47/48 both, noup 46 → 44/48 (22/24; over 96 seeds
 *     × 30 turns 92 → 90/96 at 0.32 — 0.34+ fell to 86–87/96, every loss the
 *     enraged tower rushing the line, so 0.32 is the ceiling); killed @t12
 *     (humanlow / human / casual), @t13 → @t14 (random), @t14 (noup).
 *   - boss 20's winning meeting: humanlow 6 → 8 turns (a fight, no longer a
 *     retry at 75% / 50%). The first breach moves a boss on: humanlow / random
 *     boss 20 → boss 30, human boss 30 → boss 40 (casual / flat: boss 50).
 *   - boss 30 / 40 by the 2nd try (clean): human 47 → 48 (34 → 30) / 36 → 35
 *     (19 → 17); random 45 → 42 (30 → 25) / 30 → 34; casual 48 → 48 / 47 → 47
 *     (34 → 40); flat 48 → 48 / 47 → 45; humanlow 36 → 27 (21 → 9) / 28 → 30. The
 *     time-paced buyers meet boss 30 sooner — humanlow @t51 → @t30 with 861
 *     coins unspent — and still kill it sooner: humanlow @t75 → @t70, human
 *     @t54 → @t39, random @t57 → @t53. humanlow's shown ladder: 65 → 396 →
 *     2,142 → 8,730 (6.1× · 5.4× · 4.1×). bossThird 35 / 40 / 45 (48 seeds):
 *     humanlow boss 30 by 2nd 32 / 28 / 27, boss 40 17 / 24 / 23; human boss 40
 *     29 / 35 / 37 — 40 is the one that keeps both sane.
 *   - bossSecond 14 / 15 / 16 (48 seeds): humanlow first try 41 / 38 / 35,
 *     shown step 5.7× / 6.1× / 6.5× (its typical clock is 15; 14 at 5.4×);
 *     fight 8 for all three.
 *   - empty board after boss 1: 42 aims in 48 runs → 0 (every bot); boss kill +
 *     breach in one turn 0 → 0.
 *   Daily (`--daily`, 60 dates; its bosses past the first keep ×45, so only the
 *   in-place row after the first Slime Tower touches it): random / best-of-2 /
 *   best-of-8 end at rows 29 / 30 / 38 → 29 / 30 / 39.
 *
 * Run-4 pass (24 seeds × 220 turns, medians, before → after; before = the
 * cheapest chip glows, a restart takes the checkpoint tray, the first boss
 * drops minions from the start). Pressure = rows 11–15 / 16–20 against 6–10;
 * paid = paid upgrade levels at turn 18 / 40.
 *   bot       boss10 1st  row@t18  1st breach  pressure               post/pre   best     paid
 *   human     24/24 both  18 both  r31 → r38   0.86/1.33 → 0.94/0.96  1.13 both  64 → 80  4/9 both
 *   humanlow  24/24 both  18 both  r30 → r31   0.69/1.15 → 0.90/1.13  1.02 both  53 → 69  1/3 both
 *   random    24/24 both  18 both  r30 → r30   0.40/0.78 → 0.50/0.82  1.18 both  62 → 73  8/16 → 7/16
 *   noup      22 → 23/24  18 both  r29 → r28   0.42/1.33 → 0.47/1.43  1.02 both  30 both  0/0
 *   casual    24/24 both  18 both  r60 → r61   0.82/0.91 → 0.96/0.96  1.09 both  83 → 94  9/20 both
 *   flat      24/24 both  18 both  r58 → r51   0.67/0.73 → 0.97/0.94  1.09 both  76 → 85  10/21 → 9/20
 *   - row-20 boss first try: human 10 → 12/24, humanlow 2 → 2, random 5 → 10,
 *     casual 24 → 21 (72 seeds × 70 turns: 68 → 68/72, noise), flat 23 → 19
 *     (72 seeds: 68 → 61/72 — the one soft spot: the all-buyers now fill Tray
 *     Capacity first, so their trays are wider and lower-tier: [3,2,2,2,2,2,2,1]
 *     at cap 8 instead of [3,3,3,2,2,1] at cap 6; flat's edge shots do less with
 *     them). Row-30 boss killed: human @t90 → @t55, humanlow @t142 → @t76
 *     (reached @t90 → @t67), random @t97 → @t58.
 *   - noup (200 seeds × 60 turns): first breach mean 27.96 → 28.23, median 29 →
 *     28 (quantised), breaches before row 23 16 → 6 of 200 — not worse.
 *   - humanlow never walls on walkers: all 24 first breaches are the row-20 boss
 *     (row ~31, ~4:08 at 8 s), whose fight (spawn → kill, restarts included)
 *     goes 50 → 42 turns. With `--lowrearm` (buys when the arrows come back after
 *     a boss kill / breach): boss20 first try 6/24, fight 27, best row 71 — the
 *     arrows' return, not the curve, is the low buyer's lever. No curve change.
 *   - per change (human / humanlow first breach · best row · row-30 boss kill):
 *     minion hold alone r32 / r31 · 64 / 53 · @t80 / @t117; hold + power glow
 *     r38 / r31 · 70 / 63 · @t74 / @t131; hold + stronger restart tray r32 / r31
 *     · 77 / 66 · @t60 / @t111; all three r38 / r31 · 80 / 69 · @t55 / @t76.
 *   - all: boss kill + breach in one turn 0 → 0; balls in flight ≤ 43.
 *   Daily (`--daily`, fixed kit — no buying, no restarts; the first Slime Tower
 *   holds its minions there too): random / best-of-2 / best-of-8 end at rows
 *   29 / 30 / 39 → 29 / 30 / 30 over 30 dates — best-of-8 is bimodal (the
 *   row-30 or the row-40 boss) and its median flipped mode; over 60 dates
 *   29 / 30 / 39 → 29 / 30 / 38: unchanged.
 *
 * History: run-2 pass (boss death blast, first boss alone, safety net) took
 * noup's first breach row 20 → 26 and boss-kill + breach in one turn 6 → 0.
 * Run-3 pass (flat curve ×1.15 → ×1.25 a clock row, the HP clock, later bosses
 * ×45, the fading safety net, the first boss's roar — run 7: the second's too): human pressure 16–20
 * 5.57× → 1.33×, post/pre 4.61 → 1.13, first breach 31 (now the row-20 boss,
 * before the wall); noup first breach 26 → 29; casual best row 63 → 83; Daily
 * rows 29 / 30 / 39 with its clock = the row (the endless clock ran dailies to
 * 6–9 min). A clock held for the WHOLE of every boss fight stalled HP (first
 * breach row 60–90). `--glow spill` (Tray Capacity while the tray spills) did
 * nothing measurable and was dropped for the power rule.
 *
 * Flags: --seeds 6  --turns 260  --samples 8
 *        --bot casual|random|noup|flat|human|humanlow|tapper|both|all
 *        --aimstat (the boss-aim table instead of the report)
 *        --assist on|off (the game's safety net; default on)
 *        --mercy on|off (boss mercy: −25% boss HP per restart lost to it, floor
 *          50%, reset by the kill; default on)
 *        --glow power|cheapest (the chip the bots buy: the game's glowTrack, or
 *          the pre-run-4 cheapest affordable)
 *        --restart stronger|checkpoint (the game's restart tray, or the pre-
 *          run-4 checkpoint tray — [1] before the first boss)
 *        --buygap 4,5 (the human's turns between purchases)
 *        --lowgap 16,20 (humanlow's)  --lowrearm (humanlow buys on the arrows'
 *          return after a boss kill / breach, like the human)
 *        --daily (Daily Barrage: fixed kit, run ends at the first breach; one
 *          run per date, --seeds dates; bots random / human / casual aim only)
 *        --meteor (use the once-per-checkpoint rewarded continue)  --verbose
 *        --trace N (per-turn table for seed 1, every N turns)  --brief
 *        --tune '{"hp":{"mid":1.1,"bossSecond":15,"bossThird":40,"ftueBoss":0.32,"deepRow":24,"deep":1.18},"eco":{"coinGrowth":1.05,"coinLateGrowth":1.1,"tempoDamage":1.12},"assist":{"fadeTo":40},"assistPaid":{"perLevel":0.25},"mercy":{"floor":0.5},"momentum":{"perBounce":0.05,"max":1},"power":["damage","capacity"]}'
 *          (sweep HP_CURVE / ECONOMY / ASSIST / ASSIST_PAID / BOSS_MERCY / MOMENTUM /
 *          the glow's POWER_TRACKS in-process)
 */
import { createEngine, createEngineAtRow } from '../src/barrage/engine/engine.ts'
import * as economy from '../src/barrage/engine/economy.ts'
import * as monsters from '../src/barrage/engine/monsters.ts'
import { MOMENTUM, restartTray, trayPower } from '../src/barrage/engine/balls.ts'
import { Rng } from '../src/barrage/engine/rng.ts'
import { COLS, FLOOR_Y, MIN_AIM } from '../src/barrage/engine/types.ts'

const { DAILY_CONFIG, ECONOMY, UPGRADE_IDS, configFromUpgrades, dailySeed, defaultConfig, glowTrack, upgradeCost, upgradeMaxLevel } = economy
const { HP_CURVE, KIND_HP_MULT, CORRUPT_HP_MULT } = monsters

/** Seconds per turn: the old bots' 7 s, run 3's measured ~9.5 s for the
 *  human, run 4's ~8 s (18–27 volleys in 3 min) for the low buyer. */
const SEC_PER_TURN = { casual: 7, random: 7, noup: 7, flat: 7, human: 9.5, humanlow: 8, tapper: 7 }
const HUMAN_SAMPLES = 2
/** The tapper (playtest run 9: Jonas and Mia tapped the same spot above the
 *  launcher all session) fires at a fixed point mid-board, a few degrees of
 *  thumb noise, and buys like the low buyer. */
const TAP_POINT = { x: COLS / 2, y: 5 }
const isHuman = (bot) => bot === 'human' || bot === 'humanlow' || bot === 'tapper'
const lowBuyer = (bot) => bot === 'humanlow' || bot === 'tapper'
/** Turns between the human's purchases after the funnel's Ball Damage
 *  (`--buygap 4,5`; run 3's slowest buyers were nearer 8–10). */
let HUMAN_BUY_GAP = [4, 5]
/** The low buyer's gap (`--lowgap 16,20`; run 4: one purchase per ~18 turns). */
let LOW_BUY_GAP = [16, 20]

const args = process.argv.slice(2)
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return def
  const v = args[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const SEEDS = Number(flag('seeds', 6))
const TURNS = Number(flag('turns', 260))
const SAMPLES = Number(flag('samples', 8))
const BOT = String(flag('bot', 'both'))
const USE_METEOR = flag('meteor', false) === true
const VERBOSE = flag('verbose', false) === true
const BRIEF = flag('brief', false) === true
const TRACE = Number(flag('trace', 0))
const GLOW = String(flag('glow', 'power'))
const RESTART = String(flag('restart', 'stronger'))
const LOW_REARM = flag('lowrearm', false) === true
const DAILY = flag('daily', false) === true
if (typeof flag('buygap', null) === 'string') HUMAN_BUY_GAP = String(flag('buygap', '4,5')).split(',').map(Number)
if (typeof flag('lowgap', null) === 'string') LOW_BUY_GAP = String(flag('lowgap', '16,20')).split(',').map(Number)
// The safety net (config.assist): the state layer feeds it
// `assistForPaidLevels(paid)` (the FTUE's free capacity is not paid).
// `--assist off` measures without it.
const ASSIST = flag('assist', 'on') !== 'off'
const assistFor = economy.assistForPaidLevels
// Boss mercy (config.bossHpMult): the state layer feeds it
// `bossHpMultForDeaths(restarts lost to the boss past the checkpoint)`.
const MERCY = flag('mercy', 'on') !== 'off'
const TUNE = flag('tune', null)
if (typeof TUNE === 'string') {
  const t = JSON.parse(TUNE)
  if (t.hp) Object.assign(HP_CURVE, t.hp)
  if (t.assist && monsters.ASSIST) Object.assign(monsters.ASSIST, t.assist)
  if (t.assistPaid && economy.ASSIST_PAID) Object.assign(economy.ASSIST_PAID, t.assistPaid)
  if (t.mercy && economy.BOSS_MERCY) Object.assign(economy.BOSS_MERCY, t.mercy)
  if (t.momentum) Object.assign(MOMENTUM, t.momentum)
  if (t.savior && economy.SAVIOR) Object.assign(economy.SAVIOR, t.savior)
  if (t.combo && economy.COMBO_COINS) Object.assign(economy.COMBO_COINS, t.combo)
  if (t.adapt && monsters.BOSS_ADAPT) Object.assign(monsters.BOSS_ADAPT, t.adapt)
  // The glow rule's power tracks (economy's POWER_TRACKS), e.g. ["damage","capacity"].
  if (Array.isArray(t.power)) economy.POWER_TRACKS.splice(0, economy.POWER_TRACKS.length, ...t.power)
  if (t.eco) {
    const { costBase, costGrowth, ...rest } = t.eco
    Object.assign(ECONOMY, rest)
    if (costBase) Object.assign(ECONOMY.costBase, costBase)
    if (costGrowth) Object.assign(ECONOMY.costGrowth, costGrowth)
  }
}

/** The pre-run-4 rule (`--glow cheapest`): the cheapest affordable track. */
const cheapestAffordable = (levels, coins) => {
  let best = null
  let bestCost = Infinity
  for (const id of UPGRADE_IDS) {
    const max = upgradeMaxLevel(id)
    if (max !== null && levels[id] >= max) continue
    const cost = upgradeCost(id, levels[id])
    if (cost <= coins && cost < bestCost) { best = id; bestCost = cost }
  }
  return best ? { id: best, cost: bestCost } : null
}

/** The chip that glows (CONTRACT §0.3): the game's `glowTrack` (the cheaper
 *  affordable power track, else the cheapest other), or `--glow cheapest`. */
const glowing = (levels, coins) => {
  if (GLOW === 'cheapest') return cheapestAffordable(levels, coins)
  const id = glowTrack(levels, coins)
  return id ? { id, cost: upgradeCost(id, levels[id]) } : null
}

const scoreTurn = (before, after) => {
  if (after.state.phase === 'breach') return -1e15
  const s0 = before.stats
  const s1 = after.stats
  const rowHp = Math.max(1, before.state.monsters.reduce((a, m) => Math.max(a, m.maxHp), 1))
  let lowest = 0
  for (const m of after.state.monsters) if (m.kind !== 'boss') lowest = Math.max(lowest, m.row + m.h)
  return (s1.damage - s0.damage)
    + (s1.kills - s0.kills) * rowHp * 0.5
    + (s1.ballsCollected - s0.ballsCollected) * rowHp * 1.5
    + (s1.bossKills - s0.bossKills) * rowHp * 20
    - Math.max(0, lowest - 7) * rowHp * 2
}

const pickAngle = (engine, bot, rng) => {
  const lo = MIN_AIM
  const span = Math.PI - 2 * MIN_AIM
  if (bot === 'random' || bot === 'noup') return lo + rng.next() * span
  if (bot === 'flat') return rng.next() < 0.5 ? MIN_AIM : Math.PI - MIN_AIM
  if (bot === 'tapper') {
    const a = Math.atan2(FLOOR_Y - TAP_POINT.y, TAP_POINT.x - engine.state.launcherX) + (rng.next() - 0.5) * 0.1
    return Math.max(lo, Math.min(Math.PI - lo, a))
  }
  const samples = isHuman(bot) ? HUMAN_SAMPLES : SAMPLES
  let best = Math.PI / 2
  let bestScore = -Infinity
  for (let i = 0; i < samples; i++) {
    const a = lo + rng.next() * span
    const c = engine.clone()
    c.fire(a)
    c.settle()
    const sc = scoreTurn(engine, c)
    if (sc > bestScore) { bestScore = sc; best = a }
  }
  return best
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
/** The boss "of" a row: a boss with no room at row 20 spawns at 21, 22… and
 *  is still the row-20 boss for every metric. */
const dec = (row) => Math.floor(row / 10) * 10

/** Slime-equivalent HP of a walker (kind / corrupted multipliers divided out). */
const slimeHp = (m) => m.maxHp / ((KIND_HP_MULT[m.kind] ?? 1) * (m.corrupted ? CORRUPT_HP_MULT : 1))

const runBot = (bot, seed) => {
  const rng = new Rng(seed * 7919 + (bot === 'casual' ? 0 : 1))
  const buyRng = new Rng(seed * 104729 + 17)
  const buys = bot !== 'noup'
  const levels = { damage: 0, capacity: 0, speed: 0, luck: 0, bounty: 0 }
  let coins = 0
  let checkpointRow = 0
  let checkpointTray = [1]
  let meteorUsed = false
  let freeCapacity = true
  let firstMerge = false
  let restarts = 0
  // Restarts lost to the boss past the checkpoint (the game's `checkpoint.deaths`).
  let bossDeaths = 0
  // Human purchase rhythm. The low buyer (run 4) does not come back to the
  // shop when the arrows return after a boss kill / breach (`--lowrearm`).
  let nextBuyTurn = 0
  const GAP = lowBuyer(bot) ? LOW_BUY_GAP : HUMAN_BUY_GAP
  const buyGap = () => GAP[0] + buyRng.int(GAP[1] - GAP[0] + 1)
  const rearm = !lowBuyer(bot) || LOW_REARM
  // The tray at the last aim (the game's pre-first-boss restart keeps it).
  let aimTray = [1]
  const assistNow = () => (ASSIST ? assistFor(log.upgrades.length) : 0)
  const mercyNow = () => (MERCY ? economy.bossHpMultForDeaths(bossDeaths) : 1)
  // The retry cap (the game's `checkpoint.bossHp` → `config.bossHpCap`): the
  // full HP of the weakest meeting lost to the boss past the checkpoint.
  let bossCap = 0
  const cfgFor = (extra) => ({
    ...defaultConfig({ seed: seed + restarts * 1000003 }), ...configFromUpgrades(levels), assist: assistNow(), bossHpMult: mercyNow(), bossHpCap: bossCap, ...extra
  })
  let engine
  // Aim stats (`--aimstat`): hits per ball on walker boards (an EMA), and
  // each boss meeting's damage to the boss per volley against the tray's power.
  let bossHitsN = 0
  let fight = null
  const closeFight = (won) => {
    if (fight) { fight.won = won || !!fight.killed; log.fights.push(fight) }
    fight = null
  }
  // Smoothness bookkeeping.
  let lastWalkerHp = null
  let awaitingPost = false
  const attach = (e) => {
    e.on(ev => {
      if (ev.type === 'coins') {
        coins += ev.amount
        log.coinBy[ev.source] = (log.coinBy[ev.source] ?? 0) + ev.amount
      } else if (ev.type === 'comboBonus') {
        lastCombo = { hits: ev.hits, balls: ev.balls, coins: ev.coins }
      }
      else if (ev.type === 'kill') log.kills++
      else if (ev.type === 'bossDefeated') {
        coins += ev.bounty
        checkpointRow = ev.row
        checkpointTray = e.state.tray.slice()
        meteorUsed = false
        if (log.bossKills.length === 0) awaitingPost = true
        // `left`: volleys the boss had left before breaching when the
        // killing volley was fired (the hidden savior boost's input).
        log.bossKills.push({ row: ev.row, turn, deaths: bossDeaths, left: e.saviorView?.volleysLeft ?? null })
        if (fight) fight.killed = true
        bossDeaths = 0
        bossCap = 0
        // The funnel's arrows come back on the glowing chip after a boss kill.
        if (rearm) nextBuyTurn = Math.min(nextBuyTurn, turn + 1)
      } else if (ev.type === 'breach') {
        // Run 2's worst moment: the boss chest, then OVERRUN, in one turn.
        if (log.bossKills.some(k => k.turn === turn)) log.killThenBreach++
      } else if (ev.type === 'volleyEnd') {
        // Emitted before the phase flips, so phaseTime is the volley's length.
        log.volleySec += e.state.phaseTime
        log.volleys++
      } else if ((ev.type === 'hit' || ev.type === 'dot') && ev.monsterId === e.state.bossId) {
        bossHitsN += ev.dmg
      } else if (ev.type === 'bossSpawn') {
        closeFight(false)
        const bm = e.state.monsters.find(m => m.id === ev.monsterId)
        const aim = e.aimView
        fight = { row: ev.row, walker: aim.walker, boss: aim.boss, hpb: monsters.bossAimHpb(aim.walker, aim.boss), power: trayPower(e.state.tray, e.state.config.damageMult), hp: bm?.maxHp ?? 0, volleys: 0, hits: 0, balls: 0, dmg: 0, powerSum: 0 }
        // `hp`: the HP the boss bar shows (safety net and mercy included).
        const hp = e.state.monsters.find(m => m.id === ev.monsterId)?.maxHp ?? null
        log.bossSpawns.push({ row: ev.row, turn, clock: e.hpClock ? e.hpClock.hpRow + 1 : ev.row, hp })
        if (log.bossKills.length === 0) log.preBossHp = lastWalkerHp
      } else if (ev.type === 'rowSpawned') {
        const ws = e.state.monsters.filter(m => m.spawnRow === ev.row && m.kind !== 'boss' && !m.mini)
        if (ws.length > 0) {
          lastWalkerHp = mean(ws.map(slimeHp))
          if (awaitingPost) { log.postBossHp = lastWalkerHp; awaitingPost = false }
        }
      } else if (ev.type === 'trayMerge') {
        if (!firstMerge) log.firstMergeTurn = turn
        firstMerge = true
      }
    })
    engine = e
  }
  const log = {
    bossSpawns: [], bossKills: [], breaches: [], upgrades: [], rowAt: {}, maxInFlight: 0, maxTier: 1, restarts: 0,
    volleySec: 0, volleys: 0, firstMergeTurn: null, killThenBreach: 0, pressure: [], preBossHp: null, postBossHp: null,
    at18: null, at40: null, kills: 0,
    // Late game (every life): one entry per volley — see `lateReport`.
    late: [], bestAt: {},
    // Coins by source (kill / pickup / midas / chest / combo; boss bounty is
    // counted apart, it is not a coins event).
    coinBy: {},
    // Aim phases with NO monster on the board in the 6 turns after the first
    // boss kill (run 5: "I kept firing balls into nothing").
    emptyAfter1: 0,
    fights: []
  }
  const buy = (up) => {
    coins -= up.cost
    levels[up.id]++
    log.upgrades.push({ turn, id: up.id, level: levels[up.id], cost: up.cost })
  }
  const recentDmg = []
  let turn = 0
  // The volley's combo tally (engine `comboBonus`), read after each settle.
  let lastCombo = null
  attach(createEngine(cfgFor({ ftue: true })))
  let bestRow = 1
  for (turn = 1; turn <= TURNS; turn++) {
    const a = pickAngle(engine, bot, rng)
    const dmg0 = engine.stats.damage
    const coins0 = coins
    const power = trayPower(engine.state.tray, engine.state.config.damageMult)
    const trayStr = `${engine.state.tray.length}x[${engine.state.tray.slice(0, 4).join(',')}${engine.state.tray.length > 4 ? '…' : ''}]`
    aimTray = engine.state.tray.slice()
    let hp0 = 0
    for (const m of engine.state.monsters) hp0 += m.hp
    const bossBefore = engine.state.bossId !== null
    bossHitsN = 0
    engine.fire(a)
    const phase = engine.settle()
    if (lastCombo && lastCombo.balls > 0 && bossBefore && fight) { fight.volleys++; fight.dmg += bossHitsN / (1 + (engine.saviorView?.boost ?? 0)); fight.powerSum += power }
    if (fight?.killed) closeFight(true)
    bossHitsN = 0
    const dealt = engine.stats.damage - dmg0
    recentDmg.push(dealt)
    if (recentDmg.length > 3) recentDmg.shift()
    let hpLeft = 0
    for (const m of engine.state.monsters) hpLeft += m.hp
    if (TRACE && seed === 1 && turn % TRACE === 0) {
      console.log(`  t${turn} row ${engine.state.row} tray ${trayStr} power ${power.toFixed(1)} dealt ${dealt.toFixed(0)}` +
        ` boardHP ${hpLeft.toFixed(0)} mons ${engine.state.monsters.length} +coins ${coins - coins0} bank ${coins} lv ${JSON.stringify(levels)}`)
    }
    // Pressure: walker boards only (a boss fight is its own gate), first life.
    if (phase === 'aim' && log.breaches.length === 0 && engine.state.bossId === null && engine.state.monsters.length > 0) {
      log.pressure.push({ row: engine.state.row, p: hpLeft / Math.max(1, mean(recentDmg)) })
    }
    // Late game, every life: the share of the board a volley removed, the
    // volley's damage in slime rows' worth (7 slimes at the clock's HP), and
    // the pressure on walker boards.
    {
      const rowNow = engine.state.row
      const clock = engine.hpClock ? engine.hpClock.hpRow : rowNow
      const walkers = engine.state.bossId === null
      log.late.push({
        row: rowNow, walkers, bite: hp0 > 0 ? Math.min(1, dealt / hp0) : null, rows: dealt / (7 * monsters.rowHp(clock)),
        hits: lastCombo?.hits ?? 0, balls: lastCombo?.balls ?? 0, combo: lastCombo?.coins ?? 0, earned: coins - coins0,
        p: walkers && phase === 'aim' && engine.state.monsters.length > 0 ? hpLeft / Math.max(1, mean(recentDmg)) : null,
        breach: phase === 'breach'
      })
    }
    const k1 = log.bossKills[0]
    if (phase === 'aim' && k1 && turn - k1.turn <= 6 && engine.state.monsters.length === 0) log.emptyAfter1++
    log.maxInFlight = Math.max(log.maxInFlight, engine.stats.maxBallsInFlight)
    log.maxTier = Math.max(log.maxTier, engine.stats.maxTier)
    bestRow = Math.max(bestRow, engine.state.row)
    if (phase === 'breach') {
      // Who broke through: boss (and whether enraged) or a walker of which row.
      const who = engine.state.monsters.filter(m => m.row + m.h > 10)
        .map(m => m.kind === 'boss' ? `boss${m.enraged ? '!' : ''}` : `${m.kind}@${m.spawnRow}`).join('+')
      log.breaches.push({ row: engine.state.row, turn, who })
      if (engine.state.revives > 0) engine.continueAfterBreach('revive')
      else if (USE_METEOR && !meteorUsed) { meteorUsed = true; engine.continueAfterBreach('meteor') }
      else {
        closeFight(false)
        restarts++
        log.restarts = restarts
        recentDmg.length = 0
        // A death to the boss: it was on the board before the breaching row.
        const boss = engine.state.monsters.find(m => m.id === engine.state.bossId)
        if (boss && (boss.spawnRow ?? 0) < engine.state.row) {
          bossDeaths++
          const full = Math.round(boss.maxHp / (boss.mercy && boss.mercy < 1 ? boss.mercy : 1))
          bossCap = bossCap > 0 ? Math.min(bossCap, full) : full
        }
        if (rearm) nextBuyTurn = Math.min(nextBuyTurn, turn + 1)
        // The game's restart (CONTRACT §6): before the first boss the tray of
        // the last aim; after it the stronger of the checkpoint tray and the
        // tray at the breach. `--restart checkpoint`: the checkpoint tray
        // (before the first boss [1]) — the pre-run-4 sim.
        const tray = RESTART === 'checkpoint' ? checkpointTray
          : checkpointRow <= 0 ? aimTray
            : restartTray(checkpointTray, engine.state.tray, engine.state.config.damageMult)
        // The FTUE lasts until the first boss kill, restarts included.
        attach(createEngineAtRow(cfgFor({ ftue: log.bossKills.length === 0 }), checkpointRow + 1, tray))
      }
    }
    // FTUE beat: one free "Tray Capacity 3" after the first merge.
    if (buys && freeCapacity && firstMerge && levels.capacity === 0) {
      freeCapacity = false
      levels.capacity = 1
    }
    if (isHuman(bot)) {
      if (!freeCapacity && levels.damage === 0 && log.upgrades.length === 0) {
        // The gold-arrow funnel points at Ball Damage until it is bought.
        const cost = upgradeCost('damage', 0)
        if (coins >= cost) { buy({ id: 'damage', cost }); nextBuyTurn = turn + buyGap() }
      } else if (log.upgrades.length > 0 && turn >= nextBuyTurn) {
        const up = glowing(levels, coins)
        if (up) { buy(up); nextBuyTurn = turn + buyGap() }
      }
    } else {
      for (; buys;) {
        const up = glowing(levels, coins)
        if (!up) break
        buy(up)
      }
    }
    engine.setConfig({ ...configFromUpgrades(levels), assist: assistNow(), bossHpMult: mercyNow(), bossHpCap: bossCap })
    if (turn % 20 === 0) log.rowAt[turn] = engine.state.row
    if (turn % 50 === 0) log.bestAt[turn] = bestRow
    if (turn === 18) {
      log.at18 = { row: engine.state.row, tray: engine.state.tray.slice(), cap: engine.state.config.trayCapacity, coins, paid: log.upgrades.length, kills: log.kills }
    }
    if (turn === 40) log.at40 = { row: engine.state.row, paid: log.upgrades.length, coins }
  }
  closeFight(false)
  log.bestRow = bestRow
  log.levels = { ...levels }
  log.coins = coins
  return log
}

const mmss = (turns, sec) => {
  const s = Math.round(turns * sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const median = (xs) => {
  const v = xs.filter(x => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  return v[Math.floor(v.length / 2)]
}

const BANDS = [[6, 10], [11, 15], [16, 20], [21, 25], [26, 30]]
const f1 = (v) => (v === null || v === undefined ? '-' : v.toFixed(1))
const f2 = (v) => (v === null || v === undefined ? '-' : v.toFixed(2))

/** Late-game row bands (every life, restarts included). */
const LATE_BANDS = [[21, 30], [31, 40], [41, 50], [51, 60], [61, 80], [81, 100], [101, 130], [131, 160], [161, 200], [201, 1e9]]
const quantile = (xs, q) => {
  const v = xs.filter(x => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b)
  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : null
}
/**
 * Late game per row band, pooled over every seed and every life:
 *   t      median turns a run spent in the band (how long it holds a player)
 *   d      breaches in the band per run (mean)
 *   p      median pressure on walker boards (board HP ÷ recent damage per volley)
 *   bite   median share of a walker board's HP one volley removed
 *   rows   volley damage in slime rows' worth (7 slimes at the clock's HP),
 *          median / p90 — p90 ÷ median is how far a lucky combo out-hits a
 *          typical volley
 * plus the best row reached by turn 50 / 100 / 150 / 200 / 250 (medians).
 */
const lateReport = (logs) => {
  const cells = LATE_BANDS.map(([lo, hi]) => {
    const inBand = (e) => e.row >= lo && e.row <= hi
    const turns = median(logs.map(l => l.late.filter(inBand).length).filter(n => n > 0))
    if (!turns) return null
    const all = logs.flatMap(l => l.late.filter(inBand))
    const deaths = logs.reduce((a, l) => a + l.late.filter(e => inBand(e) && e.breach).length, 0) / logs.length
    const bite = quantile(all.filter(e => e.walkers).map(e => e.bite), 0.5)
    const band = hi > 1e8 ? `${lo}+` : `${lo}-${hi}`
    // Hits per ball launched (the combo coins' measure), median / p90.
    const hpb = all.filter(e => e.balls > 0).map(e => e.hits / e.balls)
    return `${band} t${turns} d${deaths.toFixed(1)} p${f1(quantile(all.map(e => e.p), 0.5))}` +
      ` bite ${bite === null ? '-' : Math.round(bite * 100) + '%'} rows ${f2(quantile(all.map(e => e.rows), 0.5))}/${f2(quantile(all.map(e => e.rows), 0.9))}` +
      ` hpb ${f1(quantile(hpb, 0.5))}/${f1(quantile(hpb, 0.9))}` +
      // Combo coins: their share of the band's income, and how often a volley paid any.
      ` combo ${Math.round((all.reduce((a, e) => a + e.combo, 0) / Math.max(1, all.reduce((a, e) => a + Math.max(0, e.earned), 0))) * 100)}%` +
      `/${Math.round((all.filter(e => e.combo > 0).length / Math.max(1, all.length)) * 100)}%v`
  }).filter(Boolean)
  const best = [50, 100, 150, 200, 250].map(t => `${t}:${median(logs.map(l => l.bestAt[t])) ?? '-'}`).join(' ')
  // Coin sources over every run: the combo coins' share of all coins earned.
  const by = {}
  for (const l of logs) for (const [k, v] of Object.entries(l.coinBy)) by[k] = (by[k] ?? 0) + v
  const total = Object.values(by).reduce((a, b) => a + b, 0) || 1
  const share = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(' ')
  return `late ${cells.join(' · ')} · best row by turn ${best} · coins by source ${share}`
}

const report = (bot) => {
  const SEC = SEC_PER_TURN[bot] ?? 7
  const samples = isHuman(bot) ? HUMAN_SAMPLES : SAMPLES
  if (!BRIEF) console.log(`\n=== ${bot} bot — ${SEEDS} seeds × ${TURNS} turns (${samples} samples/turn, ${SEC} s/turn, glow ${GLOW}, restart ${RESTART}, mercy ${MERCY ? 'on' : 'off'}${USE_METEOR ? ', meteor continue' : ''}) ===`)
  const logs = []
  const t0 = performance.now()
  for (let s = 1; s <= SEEDS; s++) {
    const log = runBot(bot, s)
    logs.push(log)
    if (BRIEF) continue
    const kill = r => log.bossKills.find(k => dec(k.row) === r)?.turn ?? null
    const reach = r => log.bossSpawns.find(k => dec(k.row) === r)?.turn ?? null
    const firstBreach = log.breaches[0]
    const up = log.upgrades
    const gaps = []
    for (let i = 1; i < Math.min(up.length, 12); i++) gaps.push(up[i].turn - up[i - 1].turn)
    console.log(
      `seed ${s}: bestRow ${log.bestRow}  boss10 kill@${kill(10) ?? '-'}  boss20 kill@${kill(20) ?? '-'}` +
      `  boss30 reach@${reach(30) ?? '-'} kill@${kill(30) ?? '-'}  boss40 reach@${reach(40) ?? '-'}` +
      `  breaches ${log.breaches.length} (first row ${firstBreach?.row ?? '-'} @t${firstBreach?.turn ?? '-'})` +
      `  upgrades ${up.length} (first @t${up[0]?.turn ?? '-'}, early gaps ${gaps.join(',')})` +
      `  maxTier ${log.maxTier}  maxInFlight ${log.maxInFlight}` +
      (log.at18 ? `  t18 row ${log.at18.row} [${log.at18.tray.join(',')}] cap ${log.at18.cap} bank ${log.at18.coins} paid ${log.at18.paid}` : '')
    )
    if (VERBOSE) {
      console.log('   rows@turn', JSON.stringify(log.rowAt))
      console.log('   breaches', log.breaches.map(b => `r${b.row}@t${b.turn}(${b.who})`).join(' '))
      console.log('   levels', JSON.stringify(log.levels), 'coins', log.coins)
      console.log('   upgrades', log.upgrades.map(u => `${u.id[0]}${u.level}@t${u.turn}`).join(' '))
    }
  }
  const pick = (f) => median(logs.map(f))
  // First 3 minutes of play at this bot's pace. The free FTUE capacity is not
  // in log.upgrades.
  const EARLY_TURNS = Math.floor(180 / SEC)
  const earlyGaps = logs.flatMap(l => {
    const ups = l.upgrades.filter(u => u.turn <= EARLY_TURNS)
    const g = []
    for (let i = 1; i < ups.length; i++) g.push(ups[i].turn - ups[i - 1].turn)
    return g
  })
  const firstPaid = pick(l => l.upgrades[0]?.turn)
  const earlyCount = pick(l => l.upgrades.filter(u => u.turn <= EARLY_TURNS).length)
  const firstMergeTurn = pick(l => l.firstMergeTurn)
  const b10 = pick(l => l.bossKills.find(k => dec(k.row) === 10)?.turn)
  const r30 = pick(l => l.bossSpawns.find(k => dec(k.row) === 30)?.turn)
  const k30 = pick(l => l.bossKills.find(k => dec(k.row) === 30)?.turn)
  const fb = pick(l => l.breaches[0]?.row)
  const fbTurn = pick(l => l.breaches[0]?.turn)
  const firstTry = (row) => logs.filter(l => {
    const k = l.bossKills.find(x => dec(x.row) === row)
    return k && !l.breaches.some(b => b.turn < k.turn)
  }).length
  const firstTry10 = firstTry(10)
  // A boss fight's length: first kill turn − the turn that boss first spawned.
  const fight = (row) => pick(l => {
    const k = l.bossKills.find(x => dec(x.row) === row)
    const sp = l.bossSpawns.find(x => dec(x.row) === row)
    return k && sp ? k.turn - sp.turn : null
  })
  const who = logs.map(l => l.breaches[0]?.who ?? '-').map(w => (w.startsWith('boss') ? 'B' : w === '-' ? '-' : 'w')).join('')
  // Boss mercy: restarts lost to each boss before it fell (per kill, all seeds).
  const deathsBefore = (row) => logs.map(l => l.bossKills.find(x => dec(x.row) === row)?.deaths ?? '-').join('')
  // Killed with at most `d` restarts lost to it (boss mercy: 75% HP after one).
  const byTry = (row, d) => logs.filter(l => (l.bossKills.find(x => dec(x.row) === row)?.deaths ?? Infinity) <= d).length
  // The winning attempt's length: kill turn − the turn that boss last spawned.
  const winFight = (row) => pick(l => {
    const k = l.bossKills.find(x => dec(x.row) === row)
    const sp = k ? l.bossSpawns.filter(x => dec(x.row) === row && x.turn <= k.turn).at(-1) : null
    return k && sp ? k.turn - sp.turn : null
  })
  // The first meeting's length, won or lost: first spawn → its kill or the
  // first breach after it, whichever comes first.
  const firstFight = (row) => pick(l => {
    const sp = l.bossSpawns.find(x => dec(x.row) === row)
    if (!sp) return null
    const ends = [l.bossKills.find(x => dec(x.row) === row)?.turn, l.breaches.find(b => b.turn >= sp.turn)?.turn].filter(t => t !== undefined)
    return ends.length ? Math.min(...ends) - sp.turn : null
  })
  // Near-death boss wins: kills whose killing volley was fired with at most
  // `n` volleys left before the boss breached (the savior boost's window).
  const allKills = logs.reduce((a, l) => a + l.bossKills.length, 0)
  const clutch = (n) => logs.reduce((a, l) => a + l.bossKills.filter(k => k.left !== null && k.left <= n).length, 0)
  // Restarts lost to a boss (every run, every boss).
  const bossRestarts = logs.reduce((a, l) => a + l.bossKills.reduce((b, k) => b + k.deaths, 0), 0)
  // The HP its bar shows on the first meeting (safety net included).
  const shownHp = (row) => pick(l => l.bossSpawns.find(x => dec(x.row) === row)?.hp)
  const hp10 = shownHp(10)
  const hp20 = shownHp(20)
  const bosses = `boss20 first try ${firstTry(20)}/${SEEDS} by 2nd ${byTry(20, 1)}/${SEEDS} fight ${fight(20) ?? '-'} win ${winFight(20) ?? '-'} 1st ${firstFight(20) ?? '-'}` +
    ` · boss30 ${firstTry(30)}/${SEEDS} clean ${byTry(30, 0)} by 2nd ${byTry(30, 1)}/${SEEDS} fight ${fight(30) ?? '-'} win ${winFight(30) ?? '-'}` +
    ` · boss40 clean ${byTry(40, 0)} by 2nd ${byTry(40, 1)}/${SEEDS} win ${winFight(40) ?? '-'}` +
    ` · shown HP b10 ${hp10 ?? '-'} b20 ${hp20 ?? '-'} (${hp10 && hp20 ? (hp20 / hp10).toFixed(1) : '-'}×) b30 ${shownHp(30) ?? '-'} b40 ${shownHp(40) ?? '-'}` +
    ` · boss10 fight ${winFight(10) ?? '-'} · empty aims after boss10 ${logs.reduce((a, l) => a + l.emptyAfter1, 0)}` +
    ` · clutch kills (≤2 / 1 volley left) ${clutch(2)}/${clutch(1)} of ${allKills} · boss restarts ${bossRestarts}` +
    ` · first breach by ${who}` +
    ` · boss deaths before the kill b20 ${deathsBefore(20)} b30 ${deathsBefore(30)} b40 ${deathsBefore(40)}`
  const gapsAll = logs.flatMap(l => {
    const g = []
    for (let i = 1; i < Math.min(l.upgrades.length, 12); i++) g.push(l.upgrades[i].turn - l.upgrades[i - 1].turn)
    return g
  })
  const meanGap = gapsAll.length ? gapsAll.reduce((a, b) => a + b, 0) / gapsAll.length : null
  // Boss bounties buy several upgrades at once (gap 0); the median shows the
  // everyday rhythm between those sprees.
  const medGap = median(gapsAll)
  // Smoothness.
  const bandMed = BANDS.map(([lo, hi]) => median(logs.flatMap(l => l.pressure.filter(p => p.row >= lo && p.row <= hi).map(p => p.p))))
  const base = bandMed[0]
  const ratio = pick(l => (l.preBossHp && l.postBossHp ? l.postBossHp / l.preBossHp : null))
  const kt = logs.reduce((a, l) => a + l.killThenBreach, 0)
  const bestRow = pick(l => l.bestRow)
  const breaches = pick(l => l.breaches.length)
  // The HP clock each boss spawned with (its first spawn): row − clock = lag.
  const clockAt = [20, 30, 40, 50].map(r => [r, pick(l => l.bossSpawns.find(k => dec(k.row) === r)?.clock)])
  const clocks = `boss clocks ${clockAt.map(([r, c]) => `${r}:${c ?? '-'}`).join(' ')}`
  const at = logs.filter(l => l.at18)
  const at18 = at.length
    ? `t18 row ${median(at.map(l => l.at18.row))} cap ${median(at.map(l => l.at18.cap))} bank ${median(at.map(l => l.at18.coins))} paid ${median(at.map(l => l.at18.paid))} kills ${median(at.map(l => l.at18.kills))}` +
      ` · t40 row ${pick(l => l.at40?.row) ?? '-'} paid ${pick(l => l.at40?.paid) ?? '-'} bank ${pick(l => l.at40?.coins) ?? '-'}` +
      ` trays ${at.slice(0, 6).map(l => `[${l.at18.tray.join(',')}]`).join(' ')}`
    : ''
  const press = `pressure ${BANDS.map(([lo, hi], i) => `${lo}-${hi} ${f1(bandMed[i])}`).join(' · ')}` +
    ` (11-15 ${f2(bandMed[1] && base ? bandMed[1] / base : null)}× · 16-20 ${f2(bandMed[2] && base ? bandMed[2] / base : null)}×)` +
    ` · post/pre boss HP ${f2(ratio)} · ${clocks}`
  const late = lateReport(logs)
  if (BRIEF) {
    console.log(`${bot.padEnd(6)} b10 ${firstTry10}/${SEEDS}@${b10 ?? '-'} fb r${fb ?? '-'}@t${fbTurn ?? '-'} best ${bestRow} br ${breaches}` +
      ` r30@${r30 ?? '-'}(${r30 ? mmss(r30, SEC) : '-'}) k30@${k30 ?? '-'} merge@${firstMergeTurn ?? '-'} paid1@${firstPaid ?? '-'} 3min ${earlyCount}` +
      ` kt ${kt} | ${bosses} | ${press} | ${at18}`)
    console.log(`       ${late}`)
    return
  }
  console.log(`median: boss10 killed @turn ${b10 ?? '-'} (${b10 ? mmss(b10, SEC) : '-'}), first try ${firstTry10}/${SEEDS}` +
    ` · row-30 boss reached @turn ${r30 ?? '-'} (${r30 ? mmss(r30, SEC) : '-'}) killed @${k30 ?? '-'}` +
    ` · first breach row ${fb ?? '-'} @turn ${fbTurn ?? '-'} (${fbTurn ? mmss(fbTurn, SEC) : '-'}) · best row ${bestRow} · breaches ${breaches}` +
    ` · early turns/upgrade mean ${meanGap ? meanGap.toFixed(1) : '-'} (${meanGap ? Math.round(meanGap * SEC) : '-'} s)` +
    ` median ${medGap ?? '-'} (${medGap !== null ? Math.round(medGap * SEC) : '-'} s)` +
    `
        first merge @turn ${firstMergeTurn ?? '-'} · first paid upgrade @turn ${firstPaid ?? '-'}` +
    ` · upgrades in first 3 min ${earlyCount} (median gap ${median(earlyGaps) ?? '-'} turns)` +
    ` · boss10 kill turns ${logs.map(l => l.bossKills.find(k => dec(k.row) === 10)?.turn ?? '-').join(',')}` +
    `
        first breach rows ${logs.map(l => l.breaches[0]?.row ?? '-').join(',')}` +
    ` · boss10 killed at all ${logs.filter(l => l.bossKills.some(k => dec(k.row) === 10)).length}/${SEEDS}` +
    ` · boss kill + breach in one turn ${kt}` +
    ` · max balls in flight ${Math.max(...logs.map(l => l.maxInFlight))}` +
    ` · avg volley ${(logs.reduce((a, l) => a + l.volleySec, 0) / Math.max(1, logs.reduce((a, l) => a + l.volleys, 0))).toFixed(1)} s (+0.75 s resolve/advance + aiming)` +
    ` · ${((performance.now() - t0) / 1000).toFixed(1)} s` +
    `
        ${bosses}
        ${press}` +
    (at18 ? `
        ${at18}` : '') +
    `
        ${late}`)
}

/**
 * Daily Barrage: the fixed DAILY_CONFIG kit, no upgrades, no checkpoints — the
 * run ends at the first breach (as in the game). One run per date from
 * 2026-09-01 (`--seeds` dates); the bot only picks angles.
 */
const reportDaily = (bot) => {
  const SEC = SEC_PER_TURN[bot] ?? 7
  const rows = []
  const turns = []
  const bosses = []
  for (let d = 0; d < SEEDS; d++) {
    const date = new Date(Date.UTC(2026, 8, 1 + d)).toISOString().slice(0, 10)
    const e = createEngine(defaultConfig({ ...DAILY_CONFIG, mode: 'daily', seed: dailySeed(date), ftue: false }))
    const rng = new Rng(d * 7919 + 13)
    let t = 0
    while (t < TURNS) {
      e.fire(pickAngle(e, bot, rng))
      t++
      if (e.settle() === 'breach') break
    }
    rows.push(e.state.row)
    turns.push(t)
    bosses.push(e.stats.bossKills)
  }
  const mt = median(turns)
  console.log(`daily ${bot.padEnd(6)} (${bot === 'random' ? 1 : isHuman(bot) ? HUMAN_SAMPLES : SAMPLES} angle${bot === 'random' ? '' : 's'}) ` +
    `ends at row ${median(rows)} (${Math.min(...rows)}–${Math.max(...rows)}) · ${mt} turns (${mmss(mt, SEC)} at ${SEC} s) · bosses killed ${median(bosses)}` +
    (VERBOSE ? ` · rows ${rows.join(',')}` : ''))
}

/** `--aimstat`: per boss decade, the walker hits-per-ball EMA at spawn and
 *  the boss damage per volley ÷ the tray's power ("hits per ball on the boss"). */
const AIMSTAT = flag('aimstat', false) === true
const aimReport = (bot) => {
  const logs = []
  for (let s = 1; s <= SEEDS; s++) logs.push(runBot(bot, s))
  for (const d of [10, 20, 30]) {
    const fs = logs.flatMap(l => l.fights.filter(f => dec(f.row) === d && f.volleys > 0))
    if (!fs.length) continue
    const q = (xs, p) => quantile(xs, p)
    const trio = (xs) => `${f2(q(xs, 0.25))}/${f2(q(xs, 0.5))}/${f2(q(xs, 0.75))}`
    const onBoss = fs.map(f => f.dmg / Math.max(1e-9, f.powerSum))
    console.log(`aim ${bot.padEnd(8)} boss${d}: n ${fs.length} · walker EMA ${trio(fs.map(f => f.walker))} · boss EMA ${trio(fs.map(f => f.boss))}` +
      ` · floor hpb ${trio(fs.map(f => f.hpb))} · boss hits/ball ${trio(onBoss)}` +
      ` · HP p50 ${Math.round(q(fs.map(f => f.hp), 0.5))} · volleys ${trio(fs.map(f => f.volleys))} · won ${fs.filter(f => f.won).length}/${fs.length}`)
  }
}

const runReport = DAILY ? reportDaily : AIMSTAT ? aimReport : report
if (BOT === 'casual' || BOT === 'both' || BOT === 'all') runReport('casual')
if (BOT === 'random' || BOT === 'both' || BOT === 'all') runReport('random')
if (BOT === 'noup' || (BOT === 'all' && !DAILY)) runReport('noup')
if (BOT === 'human' || BOT === 'all') runReport('human')
if (BOT === 'humanlow' || (BOT === 'all' && !DAILY)) runReport('humanlow')
if (BOT === 'flat' || (BOT === 'all' && !DAILY)) runReport('flat')
if (BOT === 'tapper' || (BOT === 'all' && !DAILY)) runReport('tapper')
