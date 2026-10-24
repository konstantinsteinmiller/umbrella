# The Mario platformer philosophy — and how Umbrella's kite levels use it

Design notes for the 100 kite levels (`src/umbrella/kiteLevels.ts`, played only on
`/umbrella/kite/`). Part 1 is what Nintendo's designers say they do, with sources.
Part 2 translates it into Umbrella's own verbs and numbers. Part 3 is the curriculum.
Part 4 is the checklist every level passes, and the measured difficulty curve.

---

## Part 1 — The principles (with sources)

### 1. Teach by playing, never by text
Miyamoto designed World 1-1 of *Super Mario Bros.* so players would "gradually and
naturally understand what they're doing" and then "play more freely" — the first
course exists "so that they can learn what the game is all about" [1][2]. Every
lesson is a situation, not a sentence:

- **The first enemy can be avoided, and losing to it costs little.** The Goomba
  walks slowly toward you, and you can jump over it. It may well beat a newcomer, but
  so little progress is lost that the player learns and retries straight away [1].
  The team picked a "bad mushroom" over a Koopa Troopa because jumping on a Koopa and
  then kicking it was too hard for a first enemy [2].
- **Geometry forces the discovery.** The first mushroom is boxed in by blocks and a pipe,
  so the player who would dodge it (it looks like a Goomba) still touches it and learns
  that it helps [1][2].
- **Variation teaches the control.** Pipes of four heights teach that holding jump
  longer jumps higher; gaps of growing width teach running [1].
- **Safe failure first.** "We made sure that there were some parts that even if the
  player fell, it would be safe" — early pits have floors [2][1].

### 2. One idea per level, told in four beats (kishōtenketsu)
Koichi Hayashida (director of *Super Mario 3D Land / 3D World*) builds a stage
around one clear concept that "would be maintained through" the stage [3], and
describes the shape as a four-panel comic: "First, you have to learn how to use that
gameplay mechanic, then the stage will offer you a slightly more complicated
scenario in which you have to use it. Then, something crazy happens that makes you
think about it in a way you weren't expecting, and finally you get to demonstrate …
mastery" [4]. Mark Brown (Game Maker's Toolkit) names the four parts **introduction,
development, twist, conclusion**, and calls each stage a self-contained showcase where
a mechanic is "taught, developed, twisted and then thrown away" [5][6].

Hayashida's *Cakewalk Flip* shows the beats on one mechanic (flipping panels) [3]:
1. **Introduce** — the panels hang low: falling off costs nothing.
2. **Develop** — the safety net is gone.
3. **Develop more** — a longer run of panels.
4. **Twist** — a shockwave to dodge while you handle the panels.

### 3. Show the threat before it is a test
Super Mario Bros. 3 lets you watch enemies before they can hurt you: Paratroopas
demonstrate their hops with pits beside them; the first Chain Chomp sits between two
columns that mark its reach [7][8]. Thwomps in a fortress sit "at different heights,
each one closer to the ground than the last" — the tension rises before the
difficulty does [8].

### 4. Escalate, recombine, break the pattern
- Later stages reuse known pieces in new combinations: in World 3-8 "these elements
  were all encountered in previous levels, but an entirely new dynamic was introduced
  by putting them together" [7].
- Patterns are set up, then broken (3-3 moves the exit after levels have taught where
  it is) [8].
- Helpful things can turn into hazards (4-3's blocks push you toward a pit) [8].

### 5. Risk and reward
Optional danger pays: a lone brick that "proves to be a Coin Block, rewarding the
players that risk activating it" [8]; missing the platforms in 5-2 costs coins and
sends you a harder way rather than killing you [8].

### 6. Rest beats and the sawtooth curve
Difficulty should climb in teeth, not a straight ramp: challenge, a safe breather,
then a slightly harder challenge [9]; regular dips give recovery time and keep
players in flow [10]. A new mechanic starts its own small tooth, low-stakes, before
it is combined with old ones; stacking a new mechanic onto a peak is a classic cause
of a difficulty spike [11]. Super Mario Bros. 3's map does this at world scale, putting
the hardest stages where fewer players get stuck, with shops and minigames in
between [7].

**Sources**

1. Wikipedia, *World 1-1* — https://en.wikipedia.org/wiki/World_1-1
2. GameRevolution, *The Perfect Level: How Super Mario Bros and 'World 1-1' Changed Everything* (Miyamoto quotes from the 2015 Eurogamer video) — https://www.gamerevolution.com/features/362525-perfect-level-super-mario-bros-world-1-1-changed-everything
3. Kotaku, *What Made Super Mario 3D World So Great* — https://kotaku.com/what-made-super-mario-3d-world-so-great-1691916400
4. Game Developer, *The Secret to Mario Level Design* (Hayashida interview) — https://www.gamedeveloper.com/design/the-secret-to-i-mario-i-level-design
5. MCV/DEVELOP, *Nintendo's level design secrets in four steps* (on Game Maker's Toolkit) — https://www.mcvuk.com/development/video-nintendos-level-design-secrets-in-four-steps
6. Gigazine, *Learning from Super Mario 3D World: 4-step level design* — https://gigazine.net/gsc_news/en/20160920-super-mario-3d-world-4-step-level-design
7. GameDev.net, *Super Mario Bros 3 Level Design Lessons, Part 1* — https://gamedev.net/tutorials/game-design/game-design-and-theory/super-mario-bros-3-level-design-lessons-part-1-r4682
8. Game Developer, *Super Mario Bros 3 Level Design Lessons, Part 2* — https://www.gamedeveloper.com/design/super-mario-bros-3-level-design-lessons-part-2
9. Abratabia, *Level design basics* — https://www.abratabia.com/game-design/level-design-basics.php
10. *ELIMINATION from Design to Analysis* (arXiv 1905.06379) — https://arxiv.org/pdf/1905.06379
11. BugNet, *Difficulty curves: how to get them right* — https://bugnet.io/blog/difficulty-curves-how-to-get-them-right

---

## Part 2 — Translation into Umbrella

### The verbs
Umbrella has no jump. Pweeg walks, and in the air he opens or closes the umbrella
(Space) and leans left or right. Everything else is the world acting on him:

| Mario | Umbrella |
|---|---|
| jump height / run speed | **height control**: open = float (or rise in an updraft), closed = fall; a flutter (close–open) trims height |
| pit | the bottom of the world (out of bounds), or the 6 s free-fall limit |
| Goomba / Koopa | **Prickbait** mines (deadly, still or moving), **red Walldorfs** (deadly pillars) |
| block to stand on | **grey Walldorf** (solid) — a stepping stone, a wall, an elevator when it moves |
| springboard / note block | **amber Walldorf** (bouncy) — a trampoline from above, a bumper from the side |
| Thwomp | **triggered lunge** — a Walldorf that strikes when Pweeg flies near |
| Chain Chomp / homing enemy | **follow** Walldorf (bouncy or deadly, free or on a path) |
| fire bar / rotating hazard | mines on circle / swing / line motions |
| conveyor / wind | **currents**: updraft, downdraft, crosswind; **Super Stream** |
| lava / spikes | **spikes**; **ventilators** (fans) that shred — and blow an updraft above them |
| P-switch / ON-OFF block | **buttons** (toggle or timed) switching platforms and currents |
| moving platform | moving platforms (line / circle / swing / arrive) |
| midway flag | **checkpoint flag** (with the 3 s "restart from the beginning" offer) |
| auto-scroller / long stage | scrolling worlds (`view` = one screen), tall or wide |

### The numbers designers design with (default tuning, 1/120 s tick)
Measured on the engine; use them to place pieces.

| Quantity | Value | What it means for layout |
|---|---|---|
| float descent (open) | 95 px/s | a ledge 100 px lower is 1 s of floating away |
| air speed / walk speed | 200 / 240 px/s | **glide ratio ≈ 2.1 : 1** — 400 px across costs ~190 px of height |
| updraft (speed s) rise | 1.7 × s px/s | s = 260 → 442 px/s; needs s ≳ 180 to lift at all |
| updraft bob height | settles at feet ≈ wind top + 77, but the first bob overshoots ~110 px (to ≈ wind top − 35) and dies out slowly | a ledge is safely reachable when its top is ≥ wind top + 90; anything up to ≈ wind top − 30 is reachable on the overshoot (a closing tap at the right moment adds a little) — don't put a "too high" finish within that band |
| closed in an updraft | falls at ~930 px/s² | close to drop through a current; tap to trim height |
| free fall to umbrella break | ~1050 px (1.16 s) | reopening later breaks it — flutter before |
| free fall to landing splat | ~1165 px (1.23 s) | |
| crosswind (open) | 1.7 × s px/s, can't be fought above s ≈ 50 | close the umbrella to drop through it (closed ignores side winds) |
| Super Stream, open | +1830 px/s² net | a ceiling 200 px up is a splat after ~0.5 s: flutter |
| Super Stream, closed | sinks at ~390 px/s² | |
| bouncy Walldorf (from above) | 520 px/s up | ~157 px higher open, ~87 px closed |
| triggered lunge | strike 0.15 × period, hold 0.12, back 0.28 | a 2.5 s Thwomp is dangerous for ~0.7 s after it wakes |

### The rules of thumb
- **First use is safe.** A new piece first appears where it cannot hurt (spikes far
  below a wide updraft; a mine in plain sight off the path; a Thwomp that wakes early
  and slams in front of you).
- **One new thing per level, at most one new thing per world's first half.** The rest
  of the world develops it; the finale combines it with what came before.
- **Read the level from the spawn.** The start platform faces the first challenge; the
  finish (or the direction of travel) is in view or obviously ahead.
- **Retry is instant** (the reset is ~0.5 s) — so early deaths are cheap lessons,
  exactly like the first Goomba. Long levels (> ~12 s) get a checkpoint flag on a
  resting ledge.
- **Rest beats** are ledges between set pieces: no wind, no hazard, room to stop.
- **The safe slow way and the fast risky way.** Floating is always safe and slow;
  falling closed is fast and dangerous — a good level offers both (World 2).

---

## Part 3 — The curriculum: 10 worlds × 10 levels

Each world is one idea in four beats — **introduce** (1–2 levels), **develop**
(several), **twist** (1–2), **conclude** (the 10th, a finale that combines the world's
idea with the earlier worlds). The first levels of a world are deliberately easier
than the last levels of the previous one (the sawtooth).

| World | Levels | Idea | Introduce → develop → twist → conclude |
|---|---|---|---|
| 1 First Breeze | 1–10 | updrafts, floating | updraft bridge; floating down; two updrafts; staircase → **twist** ride up and slip out sideways; growing gaps → **twist** close to drop through a current; drop then rise; a moving finish → **Kite Run** |
| 2 Free Fall | 11–20 | the closed umbrella, terminal velocity, tall worlds | a tall world floated down; a finish that sinks away (close to be fast) → long drop (float it or flutter it); slalom → **twist** updrafts as brakes; a finish that leaves → zig-zag well; the floor is wind; up and over → **The Well** |
| 3 Crosswinds | 21–30 | right / left / down currents, wide worlds | tailwinds over two screens; headwind (duck under it); downdraft chute → wind loop; **twist** a crosswind atop the updraft; layered winds; a downdraft over the pit; a ferry through the headwind; the high road → **Gale Garden** |
| 4 Thorns | 31–40 | spikes, checkpoints | spikes far below; thorns overhead (slip out early); columns over thorn blocks; **the checkpoint flag** → the thorn tunnel; **twist** the needle's eye; bramble shaft; the headwind pushes back; ferries over thorns → **Bramble Run** |
| 5 Walldorf | 41–50 | solid / bouncy / deadly / charging | stepping stone; dip under one; elevators → **trampoline**; trampoline steps; **twist** bumpers in the draft → **red = deadly**; moving gatekeepers; **twist** the charge → **Walldorf Works** |
| 6 Prickbait | 51–60 | mines | in plain sight → the weave; sliding mines; **twist** orbit; pendulums; **twist** a late guard (hurry); the mine shaft; mines in the tailwind; **twist** bounce closed under a mine → **Prickbait Palace** |
| 7 Ventilators & Super Streams | 61–70 | fans, Super Streams | fans blow updrafts; fan steps; **twist** the shelf above the blades → **the Super Stream as a cannon**; under a ceiling (flutter); **twist** over fans; into a tailwind; with a moving finish; **twist** thorn ceiling → **Blower Works** |
| 8 Switches | 71–80 | buttons, switched platforms and currents | a button on the way → the button behind you (wind switch); **twist** a button in mid-air; **timed** bridge; the gate; two colours; **twist** timed updraft; timed bridges in a row; switch fortress → **Switchyard** |
| 9 Hunters | 81–90 | triggered lunges, followers | a Thwomp that misses on purpose → a row of them; a bouncy follower; the chaser; **twist** the goalkeeper; Thwomps over a tailwind; the long hunt; **twist** a chaser in a Super Stream; the ambush → **Hunters' Lodge** |
| 10 The Storm | 91–100 | everything, combined | Spin Cycle; Switchblade; Needle Storm; Pinball; Clockwork; Headwinds; The Tower; Freefall Finale; The Gauntlet → **Eye of the Storm** |

Scrolling is introduced the same way: World 2 opens with the first **tall** world (floated
down safely), World 3 with the first **wide** one (a tailwind carries you); from World 4
on the long levels are 2–6 screens and carry checkpoint flags.

### Pacing and difficulty targets
Times are the bot's fastest win (a speedrun); a first-time player takes roughly
2–3 × as long (reading the screen, floating instead of falling, a retry or two).

| World | Screens | Bot time, measured (s) | Mean fatal-slip share (measured) | Checkpoints |
|---|---|---|---|---|
| 1 | 1 | 3.5–6.6 | 2 % | — |
| 2 | 1–4 tall | 3.3–6.9 (fast falls; floating them is 10–30 s) | 3 % | — |
| 3 | 1–2 | 2.2–11.0 | 5 % | — |
| 4 | 1–3 | 4.2–18.2 | 7 % | from 34 |
| 5 | 1–2.5 | 3.5–17.3 | 7 % | finale |
| 6 | 1–3.5 tall | 3.6–13.2 | 10 % | finale |
| 7 | 1–2.5 | 2.4–13.3 | 14 % | finale |
| 8 | 1–2.5 | 3.4–12.8 | 12 % (and timers) | finale |
| 9 | 1–3 | 5.6–26.7 | 9 % | long ones |
| 10 | 2–6 | 5.2–23.9 | 11 % | every set piece |

Targets for new levels: keep a world's opener well under the previous world's finale, its
finale the hardest or second hardest level of the world, and the bot time under 30 s.

---

## Part 4 — The checklist every level passes

Automated (`tests/umbrella/kiteLevels.test.ts`):

- [x] Survives the editor / share-link validation unchanged (`parseLevel`), so players can edit it locally.
- [x] The spawn is inside the world, nothing solid or deadly overlaps Pweeg there, and
      standing still at the spawn for 1.5 s is safe (he lands on the start platform).
- [x] A finish exists inside the world; no two static platforms overlap.
- [x] Checkpoint flags stand on solid, unswitched ground, clear of hazards.
- [x] **Beatable**: the bot's recorded input run (one decision per 0.1 s: hold left /
      nothing / right, optionally tap Space) wins on the real engine, in 2–30 s.
- [x] **Rising difficulty**: per-world mean difficulty rises with the world number (rank
      correlation ≥ 0.9), World 10 is more than twice World 1, and every world's
      finale is harder than its opener.

By the designer, before adding a level:

- [ ] What is the ONE idea, and which beat (introduce / develop / twist / conclude) is it?
- [ ] Is the first appearance of anything new harmless?
- [ ] Can a newcomer read the goal from the spawn (finish visible, or travel direction obvious)?
- [ ] Is there a safe slow way, and does the fast way carry the risk?
- [ ] Is there a rest beat between two hard set pieces? A flag after ~12 s?
- [ ] Is a hazard telegraphed (seen moving / waking) before it must be dodged?
- [ ] Did the solver win it, and is its risk in the world's band?

### How the bot proves it (`tests/umbrella/helpers/kiteSolver.ts`, `scripts/kite-solve.mjs`)
A time-layered beam search over the real `createWorld` / `step` with the game's
1/120 s tick and default tuning. Each layer is a 0.1 s decision (3 inputs on the ground,
6 in the air). States are de-duplicated on a fine grid (position, velocity, umbrella,
switch timers, reactive enemies); each layer keeps the best state of every 64 px region
(exploration: detours, buttons) plus the states nearest the finish by a wind-aware travel
cost (rising is cheap only inside updrafts). The beam widens (1 500 → 4 000 → 10 000) only
if a level resists. Measured per level:

- **time** — the fastest win found;
- **risk** — along the win, at every other decision, the share of slips (any other input
  held 0.3 s) that no simple recovery survives; **riskPeak** — its worst 2-second stretch;
- **deathRate** — the share of all explored moves that died.

`difficulty = time/10 + 5·risk + 2·riskPeak + 5·deathRate`.

Re-run after editing a level:
`node "$HOME/.claude/skills/worker-budget/budget.mjs" run -- node scripts/kite-solve.mjs --ids <ids>`

### The measured curve

<!-- curve:start -->
| World | mean difficulty | levels 1 → 10 (difficulty) | bot time min–max (s) | mean fatal-slip share |
|---|---|---|---|---|
| 1 First Breeze | 0.65 | 0.4 · 0.4 · 0.5 · 0.4 · 0.4 · 0.5 · 2.2 · 0.5 · 0.5 · 0.7 | 3.5–6.6 | 2 % |
| 2 Free Fall | 0.84 | 0.5 · 2.1 · 0.8 · 0.3 · 1.2 · 0.8 · 0.9 · 0.4 · 0.9 · 0.6 | 3.3–6.9 | 3 % |
| 3 Crosswinds | 1.16 | 2.0 · 2.1 · 0.3 · 0.8 · 0.3 · 2.0 · 0.5 · 1.1 · 0.5 · 2.1 | 2.2–11.0 | 5 % |
| 4 Thorns | 1.92 | 0.5 · 2.3 · 1.1 · 3.6 · 1.4 · 2.6 · 0.8 · 1.1 · 1.8 · 4.0 | 4.2–18.2 | 7 % |
| 5 Walldorf | 1.76 | 1.8 · 0.5 · 3.1 · 1.1 · 0.9 · 0.6 · 1.5 · 2.1 · 1.7 · 4.2 | 3.5–17.3 | 7 % |
| 6 Prickbait | 1.77 | 0.8 · 2.0 · 1.5 · 1.0 · 1.4 · 3.1 · 1.3 · 2.0 · 0.9 · 3.8 | 3.6–13.2 | 10 % |
| 7 Ventilators & Super Streams | 2.11 | 0.5 · 0.8 · 0.6 · 0.3 · 1.9 · 3.2 · 2.5 · 1.9 · 5.5 · 3.9 | 2.4–13.3 | 14 % |
| 8 Switches | 2.29 | 0.5 · 3.1 · 2.4 · 1.0 · 2.8 · 1.4 · 2.5 · 1.9 · 5.0 · 2.3 | 3.4–12.8 | 12 % |
| 9 Hunters | 2.51 | 2.0 · 2.6 · 0.9 · 1.1 · 1.3 · 2.0 · 5.8 · 2.7 · 1.8 · 4.9 | 5.6–26.7 | 9 % |
| 10 The Storm | 3.23 | 3.6 · 2.9 · 5.8 · 2.7 · 3.1 · 2.6 · 2.1 · 1.3 · 3.2 · 5.0 | 5.2–23.9 | 11 % |
<!-- curve:end -->

Reading it: the world means rise 0.65 → 3.23 (rank correlation with the world number
0.96 — the one wobble is World 4, a touch above Worlds 5 and 6, because thorns punish any
slip while Walldorfs and mines can be watched from a distance). Every world opens below its
finale. The peaks inside a world are on purpose — its twist levels — 7 (close to drop through,
the first time the umbrella must be shut on purpose), 12 (the sinking ledges), 34 (the first
long level), 69 (the thorn ceiling), 79 (the switch fortress), 87 (the long hunt) and 93
(Needle Storm): each is followed by an easier level, the sawtooth.

