# Elemental Barrage — build contract

Source concept: `non-strategy-concepts.md` §4 (Concept B). This file turns it into binding rules for the
parallel build. `engine/types.ts` is the code-level contract; this file is the behavioural one.
**Mobile-first**: portrait phone (360–430 px wide) is the primary target; landscape and desktop must work
but are secondary.

## 0. Casual contract (never violate)
1. Nothing chosen before a run can lose it. Launchers/skins are cosmetic (+ a tiny passive at most).
2. Aim is the only skill. No planning prompts, no loadouts.
3. One obvious next upgrade glows: the cheaper affordable POWER track (Ball Damage or Tray Capacity); only
   when neither is affordable, the cheapest affordable other track (run 4: the cheapest was Launch Speed,
   which adds no power, and testers bought what glowed). Tempo (the Launch Speed track) hits harder since the
   late-game pass (§6) but stays out of the power set: its levels are the smaller step, and pointing a rare
   buyer at it cost the sim's low buyer the row-30 boss (by the 2nd try 38 → 23 of 48).
4. Merges are automatic (tray overflow). Always strictly positive (a merged ball does 2.2× one ball).
5. Breach ≠ game over: rewarded Meteor continue (once per checkpoint) or restart at the last boss checkpoint
   keeping every coin. A breach never costs more than ~2–4 minutes.

## 1. Board and turn flow (engine)
- 7 columns × 10 monster rows, launcher line at `FLOOR_Y`. Coordinates in cells, y down.
- Turn: `aim` → `fire(angle)` → `volley` (balls leave one per `launchInterval` from `launcherX`, bounce off
  side walls, ceiling, monsters, hazards; pass THROUGH pickups, collecting them; land on the floor) →
  `resolve` (burn/poison ticks, dryad heals; ~0.35 s) → `advance` (everything marches 1 row down — frozen
  monsters skip, enraged boss marches 2; goblins hop one column; centaurs may spit sludge; a new row spawns
  at row 0; ~0.4 s) → breach check → `aim`.
- The launcher moves to where the FIRST non-ghost ball landed (clamped to `LAUNCH_MARGIN`).
- Anti-stall: after every bounce enforce |vy| ≥ 0.18 × speed (keeps balls from skimming horizontally forever).
- Fast-forward: volley running > 2 s → `speedMul` 2; > 5 s → 3 (emit `speedUp`). `recall()` ends it at once.
- Physics: fixed step 1/120 s × speedMul, sub-stepped so no ball moves more than `BALL_R` per sub-step.
  Circle-vs-AABB with the reflection normal of the nearest face; one damage event per ball per contact.
  **Deterministic** (same seed + same angles ⇒ same result) — Daily Barrage fairness depends on it.
- Row counter: `row` = rows spawned. Every `BOSS_EVERY` rows the spawned "row" is a BOSS: a 3×3 block that
  enters from above (occupies rows −2..0 on spawn, fully visible after two marches), with 1–3 light monsters
  beside it in row 0. While a boss lives, new rows still spawn but sparser (1–3 monsters).
  **The run's FIRST boss comes alone** (`isFirstBoss`: spawn row < 20; playtest run 2): no walkers beside
  it, and while it lives every new row carries only its "+1" — no walkers, no bubbles. Its Slime Tower
  minions (its one rule) come only once it is enraged (see §2).
  **It clears the stage as it arrives** (playtest run 3: the 8–13 grunts already on the board shielded it
  for several turns — "HP bar stayed pinned at 57"): right after its `bossSpawn` the engine emits
  `bossRoar {monsterId, ids, x, y}` and kills every walker on the board (normal kill coins, through gem
  shields, no imp split; pickups and hazards stay). The renderer plays it as a roar shockwave that blows
  them away; the first hit on a boss pops an extra-big number on the boss. Keyed on the spawn row
  (`roarsOnArrival`): the FTUE's scripted Slime Tower roars, and — run 7 ("a second boss appears while the full
  enemy swarm is STILL on screen") — so does the endless run's SECOND boss (rows 20–29, a checkpoint restart
  included; its row's light escort still spawns after the roar). **The endless THIRD boss** (rows 30–39; the
  designer's call after run 11 — both losses came there, on a full board, but a clean board would make the
  fight too easy) roars away a THIRD of the walkers (`roarShare` = `THIRD_BOSS_ROAR`), lane by lane
  (`roarVictims`): the columns beside it first (left, right, then further out, its own columns last), each
  from the bottom up — channels from the launcher's side into the back rows, holes for bank shots. The fourth
  boss on and every Daily boss past the first never roar. It reads the board, never the RNG. Walkers that marched past the line in that advance die
  before the breach check. Sim (40 seeds): the row-20 fight length is unchanged (human 5 turns, humanlow 7).
- Boss enrages at < 30% HP (`bossEnrage`), then marches 2 rows per turn. Killing it emits `bossDefeated`
  (with `bounty`) → the state layer sets the CHECKPOINT at that row.
- **Boss at 75 s** (retention-roadmap #3): on a fresh FTUE run the first boss (Slime Tower) arrives at
  `FTUE_BOSS_ROW` = 5, its HP clamped to 2–3 volleys of the tray it meets (`FTUE_BOSS_VOLLEYS`, adaptive
  floor AND ceiling), and it replaces the row-10 boss (the next is at row 20; its kill holds the HP clock
  `FTUE_BOSS_CLOCK_HOLD` extra rows). Its spawn sets an **entrance checkpoint** (row 4, the tray it met), so
  a loss to it restarts at it with the FTUE still on and mercy on top. **Coin shards** (every boss): each
  hit pays its share of `BOSS_SHARD_SHARE` (60%) of the bounty at once (`coins` source `shard`, whole coins
  owed against the HP taken, `Monster.shards` carries the paid part); `bossDefeated.bounty` is the rest.
- **Boss death blast** (playtest run 2: a boss kill and OVERRUN landed in the same turn): right after
  `bossDefeated` the engine emits `bossBlast {monsterId, rows: 2, ids, x, y}` and kills every monster in the
  bottom two rows (normal kill coins, through gem shields, no imp split); a boss that died before its turn's
  advance makes that advance move and spawn nothing (the quiet turn). A boss kill is never followed by a
  breach in the same turn.
  **After the run's FIRST boss the board is never empty** (playtest run 5: its calm fight and roar left only
  "+1"s, and the quiet turn left the board empty for the next aim — "I kept firing balls into nothing"): its
  quiet advance still spawns the next row in place at row 0 (`rowSpawned` + its `monsterSpawn`s, no `march`,
  nothing moves, so still no breach); a first boss killed by a breach clear (continue / shield) or during an
  advance brings that row as the next aim phase begins. Engine-private flag, persisted with `skipMarch` as
  `RunSnapshot.quietSpawn`; row plans are row-local, so it draws nothing from the engine RNG. Daily too.
- Breach: any monster that would march with its bottom edge past `ROWS`. If `shields > 0` a shield is
  consumed automatically (`shieldBlock`, same effect as a meteor continue). Otherwise phase → `breach` and the
  engine waits for `continueAfterBreach()` or for the state layer to rebuild the run from the checkpoint.
  **The death sequence** (run 7 — the lose rule taught by the loss itself; display + state layer only): on the
  `breach` event the renderer (`render/death.ts`) has the breacher nearest the unit rear up and lunge into it
  (the others surge a step), and at the strike (≈0.26 s) the unit TEARS APART — 4×4 pieces of its own sprite
  fly, bounce and lie on the floor going ash grey (red flash, one big shake) — while the board dims red-black
  round the wreck. The state layer's `deathScene` is true for `DEATH_SCENE_MS` (2.4 s) from a live breach:
  UI's `DeathOverlay` shows "WASTED" (`barrage.breach.wasted`; de "Überrannt" since run 9 — "Gefallen" over the
  greyed boss read as the BOSS dying) in blood red over a colour-drained screen, and the breach offer / Daily
  result opens only after it. **The culprit** (run 9: "I never saw … which enemy crossed the line"): the striker
  (`pickStriker` — past the line, nearest the unit) keeps its colour with a red glow and outline, and the grey
  spares a clear pool round where it looms (`boardApi.deathFocusClient`); the breach offer names it
  (`BreachOffer.culprit`) and the death screen says so beside its portrait ("Fire Dragon broke through at row
  40.", `barrage.breach.bodyBy`; colon forms where an article would have to agree). A reload into a saved breach
  opens the death screen at once; a continue stands the unit up again (a flare). Reduced motion: no lunge, no
  flight — the striker flashes white, the pieces lie in a heap.
- `danger` event whenever the lowest monster is ≤ 2 rows from breaching (renderer: a kick of the red floor).
  Always on as well (renderer, `render/danger.ts`): every monster ≤ 3 marches from the line (by its own pace)
  wears a marches-left pip (amber `3` and `2`, pulsing red `1`; numbers only), and the aim phase whose coming
  march breaches shakes the board once (`small`, never under prefers-reduced-motion) and plays one warning
  sound. **One threshold** (fun pass after run 6: the red floor and line lit at 2 rows of space while pips and
  the lose demo waited for a `2`, so testers met a lit line nothing explained): the red floor / line strength
  (`dangerMarches`: 3 → half, 2 → more, 1 → full), the pips, the coach's rescue reticles (`dangerIds`) and the
  lose demo all use "within 3 marches" — for a walker exactly the old 2 rows of space; a charging cyclops or an
  enraged boss lights it sooner. **Run 10** (an enraged boss's pip went 3 → 1 between two still frames; Mia died
  "with no countdown" twice): a pip that FALLS plays the fall for 0.75 s — a ring goes out from it, the old digit
  drops out below it and fades, the pip swells; a jump by two (an enraged boss, a charging cyclops) swells harder,
  with a wider ring, for 1.1 s. The unit's pip falls on the same beat. Reduced motion: a steady ring only.
- **Aim preview to the second bounce** (fun pass, run 6: 3 of 4 testers could not tell whether they were aiming):
  `aimPreview(angle, bounces)` traces `bounces` contacts in full (`AimPath.solid`), the board draws 2 — the drag
  preview, the tap-fire flash, and a faint **resting aim line** in every calm aim phase at the repeat angle (what
  a tap on the unit or a tray orb fires), hidden while a finger is down or a coach demo owns the board.

## 2. Monsters (one rule each; faces flinch/squash on hit — renderer)
| kind | footprint | rule | unlock row |
|---|---|---|---|
| slime | 1×1 | standard | 1 |
| goblin | 1×1 | hops one column sideways each turn if that cell is free | 6 |
| caterpillar | 2×1 | wide, ×1.6 HP | 12 |
| ogre | 1×1 | ×2 HP (crush balls do ×3 vs it) | 18 |
| dryad | 1×1 | heals orthogonal neighbours 15% max HP each turn; glows "hit me first" | 25 |
| centaur | 1×1 | every 2nd turn spits sludge into a free cell below it (hazard, 1 turn) | 32 |
| imp | 1×1 | defeated → splits into ≤ 2 little imps (35% of its max HP, 35% coins, never split again) in free cells: its own, left, right, above; not when cleared by a meteor continue / boss throw-back | 36 |
| treant | 1×1 | ×2.5 HP; slow: rests (no march) every other turn — `(turn + id) % 2 === 1` — holding up what is behind it | 44 |
| carbuncle | 1×1 | ×1.2 HP; gem shield blocks the first damage of any kind each turn (regrows every aim phase); execute and continue clears go through it | 52 |
| cyclops | 1×1 | ×1.4 HP; charges two rows every other turn — `(turn + id) % 2 === 0` — orange chevrons under it while aiming | 58 |
| corrupted (any kind) | — | elite: ×1.8 HP, ×3 coins, darker tint | 40+ (chance grows) |
Bosses in order: row 10 slime-tower, 20 worm, 30 fire-dragon, 40 silver-dragon, 50 troll, 60 orc, then cycle
corrupted. Boss HP = a LADDER (`bossHpFactor` × row HP at the clock row after its walkers' — see the HP clock;
`bossHp`), each step ≤ ~6× in the HP a first-timer sees (playtest run 5: 57 → 792–1,100, "a 20x jump in
one step"): the run's FIRST boss `HP_CURVE.boss` (15; the scripted FTUE Slime Tower gets `ftueBoss` 0.5× of
that — challenge pass after run 8, was 0.32), the endless run's SECOND (rows 20–29) `bossSecond` (20, was 15),
its THIRD (rows 30–39) `bossThird` (40), from the fourth on `bossLater` (45).
**Adaptive boss HP** (run 8: an 8-ball tray one-shot the 73-HP first boss — "completely anticlimactic"):
every endless boss spawns with at least `BOSS_ADAPT.volleys` (7; the run's first `firstVolleys`, 5) volleys of
the tray it meets — each ball hitting as often as THIS player's balls hit a boss, at its tier's damage × Ball
Damage × Tempo (`config.damageMult`, `trayPower`) — or the curve's HP, whichever is more (`adaptiveBossHp`);
the Daily keeps the curve. **Measured aim** (run 9: the floor assumed 3 hits per ball; a tester's straight taps
landed ~1 and the first boss walled him): the engine keeps EMAs of each volley's damage ÷ the tray's power
(momentum, crits and abilities in, the savior boost out) on walker boards and on bosses (`aimView`, in the
snapshot as `aim`); a boss's floor uses the boss EMA once one was fought, else walkers × `walkerToBoss` (1.2),
else `hitsPerBall` (3), clamped to [1, 4] (`bossAimHpb`). **Retry cap** (run 9: the retry boss came back
STRONGER, 224 → 348, the floor followed the tray the player kept): a death to the boss records its full HP
(`checkpoint.bossHp`, the weakest meeting lost) and the retry's boss is capped at it (`config.bossHpCap`);
boss mercy applies on top. Sim (40 × 45 turns, the new `tapper` bot = run 9's straight tapper): first boss
first try human/humanlow/random/casual 40/40, tapper and noup 36/40 (tapper was ~73% of meetings); first-boss
fight 4–7 turns; second boss human 40/40, tapper 29/40, noup 9/40; the third boss walls the low buyers (19/40). A weak tray meets the curve, a stacked one a real fight, never a one-shot and never a wall
(it is the player's own power). Sim (40 seeds × 45 turns ≈ 7 min): first-boss fight 3 → 6 turns (human),
first try 39/40 human, 31/40 noup; shown HP ~70 → ~150–340 by tray. **Challenge pass:** the mid game carries
more — `mid` 1.15 → 1.22 with `late` 1.25 → 1.156, up to 1.6× HP at clock 18, meeting the old curve again at
clock 24 (the late game is unchanged; the Daily keeps `dailyMid` / `dailyLate`) — so a 5–7-minute session
can meet a loss: within 45 turns human 7/40, random 8/40, humanlow 25/40 lose once (was 3, 6, 22).
The Daily keeps `bossLater` for every boss past its first (its fixed kit is tuned against it). Slime Tower spawns a slime beside its top visible row every 2nd turn
(never within 3 marches of the line). The run's FIRST boss holds its minions until it is enraged (run 4: the
minion spawned beside it soaked a tester's first two volleys while the boss bar sat still) — its fight shows
only the boss until < 30% HP; the spawn turn still makes its side draw, so the RNG stream is unchanged.

**Row HP** (`rowHp(hpRow)`, read off the HP clock): MIW shape (0.36·h·1.185^(h−1)) up to clock row 10 (17 HP),
then ×1.15 per clock row to row 18 (51), then ×1.25 per clock row to clock 24 (79 at 20, 194 at 24 — a
typical run's row 40), then ×1.18 per clock row (`deep`, the late-game pass below: 523 at 30, 2,735 at 40,
74,914 at 60; before it ×1.25 went on: 738 / 6,877 / 596,446). The Daily keeps ×1.25 past clock 24
(`rowHp(h, daily)`; its sprint ends around rows 30–40 by design). Tuned by the bot sim
(`scripts/barrage-sim.mjs`; its header holds the targets and before → after).
**HP clock** (`hpRow` in the engine, `RunSnapshot.hpRow/hpHold`): one clock row per spawned row, except the
held ones — a boss's own row (its walkers stay at the last clock row, the boss takes the next), the whole
fight against the first boss, the first 3 rows (`fightHold`) of a later boss fight, and the 2 rows
(`plateau`) spawned right after a boss kill. A fresh board (`createEngineAtRow(config, row, tray, hpClock?)`,
or a save from before the clock) starts at `hpClockAt(row)`: a typical run that held 5 rows (`bossHold`) per
boss — row 11 → clock 9 with 3 more held rows (the plateau), row 20 → 14, 30 → 19, 40 → 24. Kill coins,
bounty, kinds, bosses and corruption stay on the real row. Never touches the RNG. **Daily Barrage** (a
fixed-kit sprint with no checkpoints) never holds it: its clock is the row counter itself, bosses included
(the holds stretched a daily run to ~50–60 rows, 6–9 min).
**Safety net** (`config.assist`, 0..1, endless only): up to −20% HP (`ASSIST.cut`, bosses included), fading
linearly out over clock rows 20 → 40 (`ASSIST.fadeFrom/fadeTo`). The state layer feeds it
`assistForPaidLevels(paid)`: 1 below 2 PAID upgrade levels (the FTUE's free capacity does not count), then
0.75, 0.5, 0.25 and 0 from 5 paid levels — one purchase moves monster HP by ≤ 5%. Read at spawn time (a change
never touches a monster already out), never touches the RNG.
**Run-3 pass — no cliffs** (playtest run 3: every tester hit a wall within five rows of the first boss; row HP
went 17 → 73 → 181 → 280 at rows 10/16/20/22 while their damage was ×1.25–1.56, and the safety net switching
off at the 2nd purchase made monsters jump ~25% the moment the player got stronger):
- rows 11–30 grow much flatter (~10–12% per row), the late game keeps its pressure past row 30 — ×1.15 per
  clock row to clock 18, then ×1.25; with the clock held ~5 rows per boss a veteran meets about the old HP
  again from row ~50 (clock 30);
- the HP clock does not run while a boss fight lasts, and the rows right after a boss kill are a short
  plateau — the monsters after a boss come back at about the strength they had before it (the first boss:
  its whole fight; a later boss: its first 3 rows — held for a whole fight, a first-timer's 6–8-row fights
  froze HP for most of every 10 rows and no curve kept late pressure without a wall);
- the safety net fades instead of switching: `assistForPaidLevels(paid)` (economy.ts) steps down in small
  bites per paid level, and `assistHpMult` fades over rows instead of stopping dead at row 30 — no single
  purchase or row makes monsters jump;
- the first session's loss is the row-20 boss (then ×45; run 5: ×15, see below), not a walker wall: walkers
  never threaten a first-timer before it, and about half of them beat it on the first try;
- tuned against a new `human` sim bot (random-ish aim, ~1 purchase per 4–6 turns, Damage first) as well as
  the old bots. Human bot, before → after: walker pressure at rows 16–20 5.6× → 1.3× of rows 6–10, first
  walker row after the first boss ÷ last before it 4.6 → 1.1, row-10 boss first try 24/24, first breach row
  31 at ~5 min (now the row-20 boss, first try 10/24), row-30 boss killed at turn 165 → 90. No-upgrade bot
  first breach row 26 → 29; casual bot first breach 35 → 60, best row 63 → 83, still ~9 breaches in 220
  turns. Daily (fixed kit, clock = row, 30 dates) runs end at rows 29 / 30 / 39 for random / best-of-2 /
  best-of-8 aim (~3.5 / 4.8 / 4.7 min); best-of-2 reaches rows 38–43 on 5 of 30 dates, random never
  passes 33. Full numbers: `scripts/barrage-sim.mjs` header.
**Run-4 pass** (the power-track glow §0.3, the first boss holding its minions, the restart keeping the stronger
tray §6; no curve change), sim before → after (24 seeds × 220 turns): a new `humanlow` bot — run 4's buyer:
free capacity, Damage, then one purchase per ~18 turns; row 18, cap 3, [4,3,2], 1 paid, ~200 coins banked at
turn 18, like the testers — never walls on walkers: first breach row 30 → 31, every one the row-20 boss;
row-30 boss reached at turn 90 → 67, best row 53 → 69. Human first breach row 31 → 38, row-20 boss first try
10 → 12/24, row-30 boss killed at turn 90 → 55, best row 64 → 80. Random / noup / casual no worse (random's
row-20 boss first try 5 → 10/24); boss kill + breach in one turn still 0; Daily unchanged over 60 dates
(29 / 30 / 39 → 29 / 30 / 38). The one soft spot: the buy-everything bots now fill Tray Capacity first, and
the edge-shot `flat` bot beats the row-20 boss on the first try a little less often (68 → 61 of 72).
**Run-5 pass** (the boss ladder above, the first boss's in-place row §1), sim before → after (48 seeds × 220
turns, boss mercy modelled as the game counts it): the low buyer (`humanlow`) sees the first two bosses at
57 → 1,188 HP before (20.8×) and 65 → 396 after (6.1×); it beats the row-20 boss on the first try in 6 → 40
of 48 runs and by the second try (75% HP) in 37 → 48 of 48, a typical fight of 27 turns (restarts included)
→ 8; its first breach moves from row 31 (the row-20 boss) to row 40 (the row-30 boss, met at turn 30 instead
of 51 and still killed sooner, turn 75 → 70); best row 74 → 73. Human row-20 boss first try 30 → 48/48,
first breach row 40 → 50; random 19 → 41/48, row 30 → 39. The first boss stays a near-certain first win
(noup 46 → 44/48 — 0.32 is the ceiling: from 0.34 the enraged tower's rush cost it 5 more of 96 runs), killed
at turn 12–14. Empty aims after the first boss kill 42 → 0 in 48 runs; boss kill + breach in one turn 0.
Bosses 30 / 40 by the second try: human 47 → 48 / 36 → 35 of 48, random 45 → 42 / 30 → 34, casual 48 / 47
both; the low buyer's row-30 boss is its new wall (36 → 27), met sooner with ~860 coins unspent. Casual still
first breaches at row 60 (best row 95 → 98). Daily (60 dates) 29 / 30 / 38 → 29 / 30 / 39. Full numbers:
`scripts/barrage-sim.mjs` header.
**Late-game pass** (feedback: "from row 40+ it gets really hard to defeat everything unless you land very lucky
combos"). Past row ~40 row HP grew ×1.25 per clock row (≈ ×1.12 per row) while kill coins grew ×1.05 per row
and a Ball Damage level (+25%) cost ×2.4 the last — every purchase fell further behind and a board could only
be cleared by a lucky combo. Now: momentum (§3: wall bounces speed a ball up and make it hit harder, up to ×2
— bank shots and balls rattling above the rows pay), Tempo hits harder (×1.12 per level, uncapped, §6), kill
coins grow ×1.10 per row past row 40 (they follow the HP, so a purchase stays a few turns of income away),
and row HP grows ×1.18 per clock row past clock 24. Before row ~40 only momentum and Tempo's damage reach the
game. Sim before →
after (16 seeds × 400 turns; "bite" = the median share of a walker board one volley removes, "p90" = a lucky
volley's damage in slime rows' worth):
- human bot (1 purchase per 4–5 turns): bite rows 41–50 / 61–80 / 81–100 / 101–130 51% / 27% / 19% / 18% →
  58% / 58% / 57% / 53% (131–160: 47%); breaches in rows 61–100 per run 13.9 → 4.4; best row by turn 250
  86 → 114; its p90 volley at rows 61–80 0.75 → 1.32 slime rows (a lucky volley now clears more than a row);
- random aim, buys everything: bite 43% / 23% / 17% / 16% → 60% / 53% / 53% / 43%; best row 86 → 141;
- casual (best of 8 aims, buys everything): rows 61–160 bite 91–75%, the wall arrives gradually at rows
  160–200+ (bite 40% → 36%, pressure 2.9 → 3.7) instead of at 81–130 (18% → 4%, pressure 7 → 34); best row
  102 → 197;
- early game (48 seeds × 220 turns; momentum and Tempo's damage are the changes there): row-30 boss by the 2nd try humanlow
  27 → 38/48, random 42 → 48, human first try 29 → 39; row-20 boss first try human 48 → 47, humanlow 40 →
  38, random 41 → 47; noup's first boss 44 → 46/48. The one soft spot: humanlow now meets the row-40 boss
  sooner with the same 3 paid levels (by the 2nd try 30 → 23/48; clean 11 → 15, boss mercy finishes it);
- Daily (60 dates) 29 / 30 / 39 → 30 / 30 / 40.

## 3. Balls and the tray
- Tier ladder = MIW fighter ladder (tier N ball shows fighter N's portrait). Damage per hit:
  `ballDamage(tier) = damageMult × 2.2^(tier−1)` (T1 = 1). Crit 5% → ×2.
- **Momentum** (late-game pass; `MOMENTUM` in balls.ts): every wall or ceiling bounce speeds a ball up by 5% of
  its launch speed, up to +100%, and it hits `momentumMult(boost)` = 1 + boost × harder (procs derive from that
  hit). Monster bounces neither add nor take any; each launch starts at 0 (`Ball.boost`, also on the `hit` and
  `wallBounce` events). Bank shots and balls rattling above the rows — the cool and the lucky combos — out-hit a
  straight shot by up to ×2. Physics sub-steps for the speed two bounces ahead, so a boosted ball never
  tunnels. Wordless: its trail stretches and heats towards white and its wall sparks grow (renderer).
- Abilities per tier: T1 burn · T2 knockback · T3 pierce · T4 freeze · T5 splash · T6 crush · T7 chain ·
  T8 poison · T9 midas · T10+ eruption. Throttle procs so the board stays readable (e.g. chain max 2 jumps,
  eruption every 4th hit of that ball).
- Tray: `tray` sorted descending, `length ≤ trayCapacity`. **Add rule**: push; while `length > capacity`,
  merge the LOWEST tier that has a pair (two of tier t → one t+1, emit `trayMerge`); if no pair exists,
  convert the lowest ball to coins (`trayOverflow`). Only overflow merges — never a merge below capacity.
- A volley launches the tray as it was at `fire()` (highest tier first). Pickups collected mid-volley join
  the tray for the NEXT volley.
- Every row spawns exactly one "+1" ball pickup (tier 1) in a free cell; plus a coin pickup or skill bubble
  with chance scaled by `pickupLuck`. A "+1" that marches into the floor line is collected anyway
  (`pickup` event with `auto: true`; RENDER flies it to the launcher) — ball income stays ~1 per turn for
  every aim, and the tray cap turns it into merges. Coin and skill bubbles that reach the floor vanish.

## 4. Skills (bubbles on the board, triggered when a ball hits/passes them)
meteor: damages every monster (35% of its max HP, bosses 6%) · warcry: next volley ×2 damage ·
legion: +3 ghost balls (tier = best tray tier − 1, min 1) launched from the bubble upward this volley ·
pact: copy your best ball into the tray; if the tray is full this merges the copy with its twin directly ·
shield: +1 shield charge · execute: kill the toughest non-boss monster (boss: −15% max HP) ·
heal: every monster moves back up one row where free (bottom rows first) · revive: +1 revive charge.

## 5. Flying chest, combo, FEVER
- A chest crosses at y ≈ 4.5 every ~120 s of play (`chestTimer`), born fully on the board and hittable
  for ~8 s (~13 s in the first session, 0.6× speed). A ball hit OR a tap on it (`engine.tapChest(x, y)`,
  chest radius + 0.35 cell; every phase but `breach`) opens it: coins (≈ 8 kills' worth) and 40% chance of
  a random skill bubble effect. The first THREE chests of a session carry a wordless tap hint (run 9: one hinted
  chest went by untapped — "shoot it, avoid it, or decoration?"), and every chest shows what it holds: two coins
  hop out of its lid by turns (not under reduced motion).
- `volleyHits` counts hits; `combo` events at 10/20/30/40 and (fun pass) on past FEVER at 60/80/100/150/200
  (`COMBO_MARKS`; the renderer's rings and ticks grow and climb with each mark, a chime from 60); at `FEVER_HITS`
  → FEVER for the rest of the volley: coins ×2, balls drawn rainbow (`ball-rainbow` sprite).
- **Combo coins** (fun pass after run 6: lucky and cool combos must be rewarded; `COMBO_COINS` / `comboKills` /
  `comboCoins` in economy.ts): a combo is a BALL that keeps hitting far longer than a normal shot (trapped above
  the rows, a long bank chain). At volley end every hit a ball scored past `freeHits` (12) in its launch pays
  `perHit` (0.5) slime kills at the row (× Coin Bounty), summed and capped at `capKills` (4) — per ball, so
  neither a big late tray nor a small one is paid for ordinary shots. The engine emits `comboBonus {hits, balls,
  coins}` before `volleyEnd`, then a `coins` event (source `'combo'`). Renderer: the first ball to cross the free
  hits gets a pink ring and a cue; a volley that paid gets a tally ("×hits" pink, "+coins" gold) where the DOM
  combo popup sits (the popup steps aside) and its coins fly from there. Sim (48 seeds × 220 turns, off → on):
  boss first-try / by-2nd, first breach and best row unchanged within noise for every bot (casual first breach
  row 143 → 162); combo coins are 9–26% of a run's coins, 1–12% of the income through row 100 (a paying volley
  on ~1–20% of volleys), more in the densest late rows. Tighter sweeps (per-ball average hits, uncapped per-hit
  pay) paid 35–57% of all coins for ordinary late play and were dropped.
- **Boss feedback** (fun pass, run 6: "the 65 never moved"): every HP drop jolts the HUD boss bar and flashes its
  fill; a volley in which no ball touched the live boss is a visible whiff — the bar shakes, a grey puff where the
  last ball landed, the boss's HP plate wobbles, a dull whoosh (none of the motion under reduced motion).
- **Cause → effect** (fun pass, run 6: WARCRY "appeared out of nowhere"): a skill toast's icon flies in from the
  bubble the ball popped (BarrageBanners, reduced motion: it simply appears); the unlock fly-in's sr-only sentence
  carries `data-coach-live` so the playtest harness frames it.

## 6. Economy (state layer)
- Coins per kill: `killCoins(row, kind) × coinMult`; boss bounty ≈ 25 kills. Coins go to the shared wallet
  (`useEpicConfig().addCoins`), fly to the CoinBadge.
- Upgrades (5 tracks, one glows): Ball Damage (×1.25/level compounding), Tray Capacity (2,3,4,6,8,10,12,14,
  16,18,20,24,28,32,36,40 max), Tempo — the Launch Speed track (`speed`; de "Schusstempo" / "Tempo"): ball
  speed 15→26 cells/s and interval 0.085→0.045 s over its first 10 levels, and since the late-game pass ×1.12
  damage per level, compounding and uncapped (`ECONOMY.tempoDamage`; every ball's `damageMult` = Ball Damage ×
  Tempo; its chip shows that ×) — Pickup Luck (0→0.5, 10 levels), Coin Bounty (×1.2/level compounding). Costs
  exponential; early levels cost roughly one turn's income so the first upgrades land every ~30–60 s. The
  Daily's fixed kit keeps Ball Damage 4 alone (Tempo 5's speed, not its damage).
- Kill coins grow ×1.05 per row up to row 40 and ×1.10 per row past it (`coinLateRow` / `coinLateGrowth`,
  late-game pass): they follow the monsters' HP, so a purchase stays a few turns of income away at any depth.
- Checkpoint = last defeated boss row (0 before the first boss). The checkpoint snapshot stores the tray.
  Restart from checkpoint = fresh board at `checkpointRow + 1`, keep all coins, with the STRONGER of the
  checkpoint tray and the tray at the breach (`trayPower`; run 4: a restart that dropped a ball read as lost
  progress right under "Keep all your coins").
- **Boss mercy** (adaptive difficulty, `config.bossHpMult`, endless only): a checkpoint restart after a breach
  with the boss past the checkpoint on the board (not one that only arrived with the breaching row) counts a
  death against it (`checkpoint.deaths`). The rebuilt board spawns that boss with `bossHpMultForDeaths(deaths)`
  of its HP (economy.ts `BOSS_MERCY`): 75% after one death, 50% from the second on. A Meteor / revive continue
  is not a death; a reload after an uncontinued breach counts it like the restart button. The kill moves the
  checkpoint (deaths → 0) and the next boss is back at full HP. Read at spawn time, stacks with the safety net.
  The softened boss carries `Monster.mercy` (→ `BossHud.mercy`); the HUD bar keeps its FULL HP as the track and
  draws the lost share as a dull chunk that cracks off the end as the bar slides in — wordless.
- **Savior boost** (hidden adaptive difficulty, endless only; `SAVIOR` / `saviorBoost` in economy.ts): at
  `fire()` the engine reads how many volleys the live boss has left before its march breaches (its rows of
  space over the line at its step — an enraged boss marches 2) and every hit of that volley deals × (1 +
  boost): +200% on the last volley, +50% on the one before, nothing earlier. Never shown, taught or put on
  `BoardState` — the numbers are simply bigger. A boss that was about to win tends to fall in the last volley
  or two: a near-death win instead of a restart. Reads the board, never the RNG (deterministic); the bot sim
  reads it through `engine.saviorView`. Sim (48 seeds × 220 turns, off → on): boss kills landed in the very
  last volley human 120 → 178, random 195 → 247; row-30 boss first try human 39 → 45/48, row-20 boss first try
  humanlow 38 → 46/48; a player far behind still loses (noup row-20 boss by the 2nd try 5 → 9/48).
- Persist (inside the `elemental-barrage_state` blob via `getState/setState`, keys prefixed `eb_`):
  run snapshot (saved each time the engine enters `aim`), best row, checkpoint (+ tray, boss deaths), upgrade levels,
  lifetime stats, collections, daily record, meteor-continue-used-this-checkpoint flag, FTUE step.

## 7. FTUE (first session, `config.ftue = true`)
| t | beat |
|---|---|
| 0 s | Row 1: three slimes, HP 1, in columns 2,3,4. Ghost hand drags back and releases (straight up is fine). Tray = [1], capacity 2. |
| ~10 s | Turn 2: a "+1" pickup sits straight above the launcher, in the preview line. |
| ~20 s | **Instant Barrage** (retention-roadmap #1): every FTUE row 1–5 carries an extra "+1"; a "+1" that meets a full tray grows a socket (`traySocket`, capacity 2 → 3 → 4 → 6, booked as free capacity levels, `eb_ftue.sockets`) instead of merging. |
| ~30 s | Row 4 arrives as a swarm (every free top cell a slime). Turn 4 is **overcharged**: a gold glow under the unit while aiming, then the tray fires three times over (the copies are ghosts, fanned ±0.3 rad) and FEVER ignites on its first hit. FTUE FEVER otherwise needs 20 hits (not 50). |
| after the first merge | The gift: one free Ball Damage level when the sockets grew the tray (otherwise the old free "Tray Capacity 3"). |
| ~45–70 s | Row 5: Slime Tower (Boss at 75 s), 2–3 volleys, shards on every hit. Win = coin fountain + CHECKPOINT banner. |
FTUE rows 1–5 use HP ≤ 3, 3–4 walkers and no goblins; while `row ≤ 4` any "+1" left on the board when a
volley ends is auto-collected, so the tray grows whatever the aim. FTUE ends at the first boss kill.
Before the first boss, a breach restart keeps the tray from the last aim (a fresh row-1 board).

**After the FTUE — the wordless coach** (`use/useCoach.ts`; nothing typed on screen, sentences only in
sr-only live regions; one lesson at a time, exposure-capped, persisted as `eb_coach`; endless mode only
except the pull hint):
- *pull* (now the aim hint): a ghost finger inside the board drags toward the monsters while the dotted
  line grows from the launcher (playtest run 1: every blind tester's first drag went toward the monsters,
  so that is the gesture taught; the slingshot still works but is never the lesson). Run-2 rule (also
  for the FTUE's aim hand): shown in the aim phase unless a shot was fired within the last 20 s — so it is
  on at once before the first shot (first frame already shows the hand — under "Tap to Shoot", the designer's
  call after run 8; run 7 had held it back) and back for a player returning from AFK; no idle/novice gating.
  The wrong-way refusal is gone — see §10.
- *survive*: a monster within 3 marches of the line (the pips' threshold, run 6 — was ≤ 2 rows) → threat
  reticles + a rescue shot found by trial (marches-left: the canvas's always-on danger pips; the coach's
  chevrons are gone)
  volleys on engine clones (`engine/shotFinder.ts`). ≤ 4 showings, ≥ 2 volleys apart.
- *tray*: after a "+1" spills into coins → the tray acts out "full: no new shot" and presses Tray Capacity.
  ≤ 3 showings, ≥ 2 volleys apart, retired at capacity level 3.
- *combo*: a trial shot with ≥ 10 hits and ≥ 2× the median shot → demonstrated with running hit counts.
  ≤ 4 showings, ≥ 3 volleys after any lesson, retired at a lifetime best combo of 25.
- *trayIntro*: the first aim after the FTUE (and once more ≥ 8 volleys later) acts the tray out on the
  real tray: its balls fly into the unit (= the volley), a "+1" drops into an empty socket, a full tray
  merges twins into the next tier. Always on as well: at every volley the tray streams into the unit and
  a collected "+1" flies into its socket (a "+1" paid out as coins no longer pops "+1" on the tray).
- *upgrade*: the FTUE's upgrade beat shows what the chip DOES (press → spark → effect: capacity adds a
  socket, damage flares the unit, speed streams balls, luck adds bubbles, bounty fills the wallet).
- *upgrade funnel* (run 2: nobody bought a paid upgrade; its own channel `upgradeFunnel`, never over the
  board): once Ball Damage is affordable after the free Tray Capacity, runic gold arrows point at its chip,
  coins fly from the wallet into it and the hand presses it — every aim phase until Damage is bought
  (≤ 6 showings, `eb_coach.shown.arrows`); after every boss kill / breach the arrows return on the
  glowing chip for 2 aim phases (or until any purchase); an aim that opens with something affordable and
  no purchase for 2 aims pulses the glowing chip. Every other affordable chip wears a quiet gold glow;
  short prices are grey; a refused tap = red price + "need N more" callout + wallet pulse + small shake.
  (UI, run 5) The callout stands on the chip tapped, its tail pointing at it (shifted onto the screen at the
  edges). **Run 7:** while the FTUE's free Tray Capacity is on offer, ANY chip tap claims it (Leo hit Damage
  beside FREE, read run 5's wordless redirect as "nothing happens" and never bought anything); unclaimed, it is
  granted on its own `FREE_GRANT_AIMS` (2) aim phases after the FTUE hands over (useTutorial; the socket drops
  into the tray). **One tap buys one level** of the chip tapped — the glowing one too (`useBarrageUpgrades().buy`).
  Runs 7–9 tried more: run 7 bundled levels of whichever power chip glowed ("an unintended double-purchase"),
  runs 8–9 let the glowing chip buy up to 5 levels of itself ("▲3" by the price) — run 10 read that as a bug
  again (89 coins on one tap), so it is gone. **Run 8:** the Damage arrows ignored `FREE_DAMAGE_AFTER` (3) times arm a
  FREE first Ball Damage level (`offerFreeDamage` → `freeDamageOffer`, the Capacity gift's rules: any chip tap
  claims it, one gift at a time — `freeId` / `claimFree`); Mia had ended run 8 with 347 coins and Damage 0.
  **Run 13:** "any chip" now means any chip that would only refuse (short of coins, or maxed): a chip the wallet
  covers buys ITSELF and the gift waits. Dev followed the tray lesson's hand onto Capacity while Damage said FREE,
  got the Damage level ("the hint and the purchase didn't match") and never tapped a chip again. No lesson frames
  another chip while a gift waits (the coach's `giftId`: the tray lesson's spill stays pending, the chip
  spotlights wait).
  The funnel (arrows + hand) now RESTS: 10 s up, 20 s away, and back while the chip is unbought (wall-clock in
  CoachOverlay; a funnel on a different chip starts a fresh cycle) — run 8: "a stuck tutorial hint".
  **Run-4 pass** (purchases stalled after the first Damage: 1/1/0/2 paid levels, 176–449 coins unspent; the
  arrows always showed while a shot lesson held the hand, so no hand ever pressed the chip):
  - once the player has fired 3 volleys, a due funnel OWNS the ghost hand: the shot demos (pull, combo/bank)
    yield to it for that aim phase (the survive lesson still wins — danger first);
  - *rich wallet*: whenever the wallet holds ≥ 2× the glowing chip's price and nothing was bought for 3 aim
    phases, the funnel (arrows + coins flying in + the pressing hand) returns on the glowing chip; ≥ 4 aim
    phases between showings, no lifetime cap, gone the moment anything is bought;
  - a purchase pays off where the player looks: Damage → the unit flares and the next volley's hit numbers
    burn gold; Capacity → the new socket drops into the tray and glows (RENDER / UI).
  - (UI, as built) the funnel never shares the screen with a modal, an earned feature flying in or a coin rain
    landing in the wallet (`funnelCalm`: chest claim, board chest tap, boss bounty, menu gifts): an aim phase
    that opens without that calm has no funnel, and one that loses it mid-aim takes the funnel off at once and
    holds it until the next calm aim phase (a rich-wallet showing cut short gives its turn back). Rich-wallet
    spacing counts aim phases since ANY funnel was last on screen; session counters only, nothing persisted.
  **Fun pass after run 6**:
  - *gear up*: a boss ARRIVING (`bossSpawn`) with the glowing chip affordable brings the arrows back on it for
    2 aim phases (reason `gear`; testers met the row-20 boss with ~200 coins unspent and read it as outscaling);
  - after ANY purchase (the free Tray Capacity included) the funnel waits for the next aim phase — the
    purchase's own payoff is the only answer on screen (Mia claimed the free chip, the Damage arrows and coin
    flight started that instant, and she read them as "the first tap only arms it");
  - the whole funnel (arrows, hand, idle chip pulse) RETIRES once the player has been past row 25 (best row or
    this run's row, `FUNNEL_LAST_ROW`): by then they have learnt that coins buy power. The glowing chip stays.
- *merge lightbox* (`components/barrage/mergeLightbox.ts`): **Silent Flow (retention-roadmap #2) — no
  pause.** Every merge plays the tray's own flourish while play goes on; a discovery adds the NEW BALL reveal
  (≤ 1.5 s, non-blocking). The first 3 merges and every discovery still say their sentence to screen readers
  and are counted (`eb_coach.shown.mergeBox`). `offerMerge` never takes the moment.
- *first "+1"* (`components/barrage/pickupSpotlight.ts`): **Silent Flow — no pause.** Every "+1" on the board
  pulses in the FTUE (`render/worldCues.ts` `plusPulse`) and the tray plays its own flight into the socket it
  fills. Counted once per profile (`eb_coach.shown.pickupBox`), sr-only `barrage.tray.pickupSr`.
- *spotlights* (`components/barrage/lessonSpotlight.ts` + `LessonSpotlight.vue`, the designer's call after
  run 11): short staged lessons (Silent Flow: none before the first boss kill, and none pauses or dims — the demo
  plays over the running aim phase and a shot ends it; wordless — sr-only `barrage.coach.spot.*`),
  scheduled by the coach SPOT_DELAY_MS (380 ms) into a calm aim phase (`spotCalm`: no modal, unlock, reveal,
  coin rain, lightbox, FTUE mark, death scene or finger on the board), never on the aim a boss arrived or fell:
  - *threat* — **Silent Flow: now a board cue, not a staged lesson** (`useCoach.flashDanger` → the danger row
    flashes in `render/worldCues.ts`). History: the countdown on the launcher, the first time a monster comes within 3 marches (once per
    profile, `eb_coach.shown.threatBox`; veterans past row 30 never see it): the monster with the fewest
    marches (nearest the unit on a tie) and the unit are lit, both wearing the same pip N and a tether; a ghost
    of it marches down at its real pace (`render/danger.ts` `marchPlan`), both pips ticking down together
    as each step lands; the last step crosses the line — the line flares, the unit's pip turns to a skull; then
    it rewinds and a ghost shot takes it out: both pips gone, a green check on the unit. The survive lesson's
    rescue shot follows on the real board the moment it ends (its spacing waived). Run 11: both losses had the
    '1' and the tether up and the tester shot straight up.
  - *speed / luck / bounty* — what the three chips nobody could explain do, once each
    (`eb_coach.shown.<id>Box`) from rows 12 / 17 / 22 (`UPGRADE_SPOT_ROWS`), only while that chip is
    unbought, never in danger, under an upgrade funnel or while a boss is enraged, and ≥ `SPOT_GAP` (3)
    volleys from any other lesson or spotlight. The chip is lit and its effect shown twice — before (its value
    now) and after (one level up), its glyph flying from the chip into the demo between: speed — a ball flies
    to the monster above the unit ("×1"), then one twice as fast, streaking ("×1.12"); luck — the top rows
    show one bubble ("0 %"), then more coin and skill bubbles ("5 %"); bounty — a kill's coins fly to the
    wallet ("+N"), then more of them ("+N×1.2"; the boss's chest bounty when a boss stands, so the ×1.2 is a
    number the eye sees). **Run 13:** the two values stand side by side (now left, next right) on dark plates
    of their own, inside the board and below the rank plaque — speed on the ball's path just below the monster
    it hits, luck mid-board under the bubble rows, bounty above the kill (under it when it stands at the top).
    Bare, they landed on other numbers: "×1.12" on the plaque read as "GLOBAL RANK #X1.12", "5%" beside the
    Fire Dragon's "1.2K" as "boss HP 1.2%". Neither these nor the tray lesson play while a gift waits on
    another chip (`giftId`).
  At "1" (run 11) the monster whose next march crosses the line also wears the death culprit's red outline
  while the player aims (BoardRenderer) — the pip alone went unread in a crowded boss frame.
- *overrun* — RETIRED in run 7: its first-danger ghost demo read as "an unexplained red overlay" in still
  frames (on the enraged boss: "a sprite glitch"). The loss itself teaches the line now (the death sequence,
  §1 Breach). Old saves' `eb_coach.shown.overrun` is ignored.
- *HUD name tips* (run 3: the chest's countdown / gift pill and the tray's shield charge went unexplained):
  tapping a tray status icon (shield / revive / warcry), a still-filling treasure chest or (run 4) the rank
  plaque ("Global rank" + its placing) shows a small plate beside it — its glyph, its name and its value (the chest: countdown + the gift it fills toward) — gone
  after ~2.5 s or at the next touch (`HudTip.vue`, `hudTip.ts`). A label on demand, never a teaching card.
  Monster rule badges get none: a tap on the board is a shot. **Run 9** (GLÜCK, the calendar and profile icons:
  "read carefully, still couldn't explain"): a press held `LONG_PRESS_MS` (450 ms) on an upgrade chip names it
  and says what it does (`barrage.upgrades.<id>.desc`) and buys NOTHING; on a HUD button it names the button.
  A claimed free level says so: a green "FREE" pill by the chip's new price (run 9: "a purchase that didn't
  deduct coins"). **Run 10** (nobody found the long press; Speed, Luck and Bounty still unexplained): the refused
  tap's "need N more" callout carries the chip's effect as a second line (`barrage.upgrades.<id>.desc`, up
  ~2.5 s), and the FIRST purchase of each chip in a session shows the chip's name plate (the long press's) —
  on the player's own tap, never on a timer. **Run 12** (Dev: "the FREE label directly contradicts the actual
  cost"; Leo: chip taps "behave differently"): that plate is a RECEIPT — a check and the level just bought
  ("3 → 4") above what the chip does — opening RECEIPT_DELAY_MS (380 ms) after the buy, once its flare has
  landed; any touch before cancels it. A claimed gift's pill reads as received (a check with "FREE"), leaves
  after 1.5 s, and the next chip tap clears it before its own answer. **Run 11**: Capacity's line is "More balls in your tray: more
  shots every turn." (three of four read "before twins merge" as jargon; the tray intro teaches merging). A
  chip's name / value line shrinks to fit by its FRACTIONAL width (a line 0.4 px too wide passed the whole-pixel
  check and the ellipsis cut it: German "×1.95 → ×2…") and re-fits when the bar resizes. The achievement toast
  carries its goal line under the name ("Hits in one volley: 50" — run 9: "no idea what causes a chain
  reaction") and, since run 11, PAYS the reward as it shows (its "+N", the coins flying from it to the wallet);
  whatever completed before the trophy was earned pays out of the trophy button as it arrives (or as a save
  that has it loads). Run 11: Dev and Leo found 400–800 coins waiting unclaimed and that windfall beat the
  third boss; the two who lost never opened the panel.
- New monster kinds wear an in-world rule badge + acted-out rule for their first 4 aim phases (the
  centre "new monster" / BOSS INCOMING / ENRAGED cards are gone). A "+1" pops what it became: +1, the
  merged ball, or a coin.

**Earned HUD** (`use/useFeatureUnlocks.ts`): the first minutes show the board, the tray and the upgrades
only. Treasure chest (row 6 | 1 loss) → codex (11 | 1) → collection (16 | 2) → daily rewards (21 | 3) →
battle pass (26 | 4) → achievements (31 | 5) → daily run (36 | 6), strictly
in order, one per aim phase, only when calm (aim phase, no modal / reveal / held sim / finger down) and
after the FTUE. The button's clone pops up over the board and flies into its slot; the real button then
breathes with a gold ring + sparkle until tapped (or 4 volleys). Locked features are silent (achievement
toasts wait). Saves from before the ladder unlock silently by best row. Default music: Cozy Harmony.
The global rank is NOT on the ladder: the game is competitive, so its runic plaque (`RankBadge`, gold
`RuneFrame` inscribed "global rank") sits on the board's top rim on every layout from the first rank. Run 8 (all four
testers still asked what "#15,396 of 15,876" is): it names itself — "GLOBAL RANK" before the placing
(`label` prop, `barrage.hud.rank`); a tap still shows the name plate.

**Treasure chest** (`state/useSupplyDrop.ts`, `eb_supply` = last claim, epoch ms): a small gift 3 min after
a claim, a big one (4× the coins, 40 % chance of a skill charge) at 10 min; coins scale with best row. The
chest arrives filled to the small gift the first time it is shown (`arm()`). Run 4 (its "3:00" after a claim
read as a buff timer): while it refills it stands EMPTY — lid open, dimmed, a dark mouth where small coins
keep trickling in and a gold hoard rises with the fill — so the countdown reads "refills in".

**Ball skins** (`ballSkins.ts`, `render/balls.ts`): a skin is a shell, never a replacement — the tier's
face, body colour and halo stay in a window (`SHELL_IN` = 0.72 r), the material fills the band around it,
the tier's accent colour lines the window. `rainbow` is FEVER only (`feverSrc`), not for sale. Retired
ids (`RETIRED_SKIN_PRICES`) are refunded at their price once (`eb_collections.refunded`).

## 8. Monetization (state + UI)
- Rewarded **Meteor continue** at a breach, once per checkpoint.
- Rewarded **3× boss chest** (`CHEST_AD_MULT`, was 2×): the boss chest result modal offers "▶ 3× ●" (movie
  icon, the multiplier, a coin — what is multiplied is the coins) — the ad runs BEFORE the tripled payout screen
  (ad-before-result rule); declining pays 1× immediately. Coin-priced builds offer it only when the extra 2×
  bounty beats the price. **Run 9** (three testers ended with 249–1,156 coins and a 3-ball tray): once the
  chest has paid, the card stays one step longer while a power level is affordable (or a free one pending) —
  "Power up!" and ONE row, the glowing chip (`barrage.chest.powerUp`): a tap buys one level and the row moves on
  to the next glowing chip; "Continue" closes. Endless only.
- **Rewarded buttons are never green** (Google Play policy; green also sells the ad as "the good choice"):
  every rewarded / ad button wears the movie icon and the ad blue (`--ad-*` in `components.sass`: the 3× chest,
  +5 balls, the Collection's "▶ Unlock" skin button) — the breach's Meteor keeps its own fire orange (the Restart beside it
  is the blue one). `+5 balls` shows its label big and outlined on the blue.
- Rewarded **+5 balls** (button in the aim HUD; once per checkpoint segment) — only where it helps: never before
  the player's first boss kill, and only with a boss on the board or a monster wearing a danger pip
  (`bonusBallsAvailable`). Poki playtests: the Poki build's rewarded is ready from the first frame, so the blue
  button stood under the board from turn 1 and every tester's first tap opened a "Rewarded Break".
- Rewarded **ball-skin unlock**: only the first two skins are coin skins (orb owned, stone 2k). Every skin
  past stone is **ad-only** (`BallSkinDef.adOnly`): no coin price, the card shows a lock (+ `n/N` for the
  multi-ad rarities) and the "▶ Unlock" button under it (`barrage.collection.adUnlock`) is the only way in —
  always shown, disabled while no rewarded ad can fill. Stone keeps its coin price with the same button beside
  it, shown only while an ad can fill. Common 1 ad, every rarer skin 2 — never more than 2 per skin
  (`MAX_SKIN_ADS`; epics were 3 and legendaries 5, and a save already holding 2+ towards one owns it). The
  count is kept per skin (`eb_collections.adViews`, max-merged on hydrate) and the last ad unlocks + equips
  it. Ad FIRST: the count moves only on a granted reward. Coin-mode builds have no rewarded ads: there every
  skin keeps its coin price (`adOnly` is ignored), or ten skins would be unobtainable.
- Interstitials ONLY on checkpoint restarts, never the first two restarts of a session, ≥ 3 min apart.
- All rewarded offers are hidden when the provider is not ready (rewarded readiness gating); coin-mode
  builds price them in coins (existing `useReward` handles both).
- gameplayStart/Stop: gameplay is "active" while phase ∈ {aim, volley, resolve, advance} and no modal is open.

## 9. Ownership (parallel build — do not edit files you do not own)
| area | owner |
|---|---|
| `src/barrage/engine/**` (incl. `economy.ts` — the balance numbers), `tests/barrage/engine/**`, `scripts/barrage-sim.mjs` | ENGINE |
| `src/barrage/render/**`, `src/components/barrage/BarrageBoard.vue`, board SFX/VFX, `src/views/BarrageLab.vue` + its one dev-route line in `src/router/index.ts`, additive edits to `src/use/usePrismParticles.ts` | RENDER |
| `src/barrage/state/**`, `src/barrage/keys.ts`, retention re-pointing (`useBattlePass`, `useAchievements`, `useMissions`, leaderboard score source, `useCheats`), `src/i18n/locales/barrageMeta/**`, `tests/barrage/state/**` | STATE |
| `src/views/GameScene.vue`, `src/components/barrage/**` (except BarrageBoard.vue), `TutorialOverlay`/`useTutorial` FTUE, `src/i18n/locales/barrage/**` | UI |
| `engine/types.ts`, this file, `src/barrage/state/contract.ts`, `src/barrage/art.ts`, `src/barrage/ballSkins.ts` | lead (additive edits by owners allowed; note them in your report) |

## 10. Component seam: `src/components/barrage/BarrageBoard.vue` (RENDER builds, UI mounts)
- Props: `coinTarget?: HTMLElement | null` (coins earned on the board fly to it).
- Emits: `aimStart`, `aimCancel`, `fired(angle: number)`, `misfire('tap')` (released on the launcher — the
  only cancel), `chestTapped`. (`aimWrongWay` / `misfire('wrongWay')` stay declared, never emitted.)
- `defineExpose`: `launcherClientPoint(): {x, y} | null`, `cellToClient(x: number, y: number): {x, y} | null`
  (board cells → client px; tutorial hand + banners), `boardClientRect(): DOMRect | null`.
- Fills its parent box and letterboxes the board (aspect `COLS : FLOOR_Y + small margins`); owns the rAF
  loop: `engine.update(dt)` unless `isGamePaused || useBarrage().holdSim`; always draws. Aim input only in
  phase `aim`, dual-mode, decided by the finger's position against the launch line (±0.2-cell dead band):
  above it the shot points AT the finger; below it (also over the bottom panel) it is a slingshot through
  the launcher. The dotted preview shows from the press, only while a finger is down, and ends in a hollow
  ring (never a ball). Release always fires (clamped to 8°/172°); a tap fires at the tapped point. Fine aim
  applies to the slingshot only (off above 300 px/s, never > 6° off the finger). A tap on the flying chest
  opens it instead of aiming.
  **The unit** (playtest run 3: the most natural first tap — on the unit — was the one gesture that did
  nothing): a TAP on the launcher fires the repeat shot (the run's last fired angle, straight up before the
  first), and its preview shows while the finger rests there. The only cancel is a DRAG that left the
  launcher pad (0.6 cell) and comes back onto it → `misfire('tap')`.
- `defineExpose` additions (run 3): `beginAimFrom(e: PointerEvent): boolean` — starts an aim from a finger
  that went down OUTSIDE the canvas (the tray's ball orbs in the bottom panel: dragging up from them is the
  slingshot motion); it behaves like a press on the unit (release before moving = the repeat shot, then
  ordinary dual-mode aim). Same gates as a press on the board (phase `aim`, `canFire`, not paused / held);
  returns false when it did not start. (`overrunDemo` — the retired lose-rule demo, runs 3–6 — is gone.)
- The line itself wears a small skull glyph (always on, dim; lit while any monster shows a `1` pip).
- While any monster wears a `1` pip the unit itself shows danger in a way a still frame shows: its flame
  shrinks and sputters pale, it cowers/trembles. **Run 9** (Mia: "no player health/lives indicator"; Jonas read the
  boss's countdown as an enrage timer): the fewest marches any monster has left is mirrored ON the unit — the
  same pip disc and digit on its shoulder (amber 3 / 2, pulsing red 1), hidden in a breach. **Run 10** (the
  unit's pip was seen, but only a loss taught what it counted): at `1` a dashed red tether runs from the monster
  that will reach the unit (a `1` nearest it — the one the death sequence picks) to the unit's pip. A breach flashes the line and its skulls, then plays the
  death sequence (§1 Breach): the unit torn apart under the monsters that reached it.
- Tough kinds (their rule is only more HP: caterpillar, ogre) wear NO badge (run 4's shield read "shielded",
  run 5's heart "×2" read "heal? damage? reward?"; the HP number already says it).
- Behaviour kinds show their NEXT move in a way a still frame reads, while their badge is up (first 4 aim
  phases): e.g. goblin — a ghost at its hop target with a dotted arc; dryad — green "+" on the neighbours it
  will heal; centaur — the sludge target cell on spit turns; treant — a rest marker on the turns it rests
  (cyclops chevrons and the carbuncle bubble already do this).
- A TAP-fire flashes the numbered bounce path for ~0.3 s as the ball leaves (run 5: tap players never saw
  the aim preview, which only shows while a finger is down).
- The launcher's volley count draws as a ball glyph + "×N" (run 4: a bare "×3" was a mystery).
- Calls `useBarrage().fire(angle)` itself; reads `useCollections().selectedLauncher/selectedSkin`.
- Draws NO localized text (numbers only: HP, damage, "+1"); every word on screen is DOM owned by UI.
- Resets display caches when `useBarrage().engineGen` changes.

## 11. Rules for every agent
- Never `git commit/stash/reset/checkout`. Never reformat files you do not own.
- Whole-project `vue-tsc` will show other agents' in-progress errors — fix only yours.
- All user-facing strings go through i18n (`barrage.*` owned by UI, `barrageMeta.*` owned by STATE), English
  first, then EVERY other locale (20 more files) translated. Canvas shows numbers only.
- HUD numerals (UI, run 5: 'Angry''s "2" read as "Z" — "ROW ZZ"): DOM digits in the HUD render in the
  digits-only face `EB Digits` (Lilita One, `unicode-range` 0–9, `assets/css/fonts.sass`) through the
  `.hud-digits` class (the scene root, the teleported top bar, the barrage overlays and modals); a new
  teleported surface that shows digits adds the class. Canvas text never uses it.
- Browser checks: never close/kill an existing Chrome; start your own headless Chrome with a private
  `--user-data-dir` and random `--remote-debugging-port`; run your own dev server on your assigned port with
  `--strictPort`, and check the served `<title>` before trusting what you see. Stop your own server when done.
