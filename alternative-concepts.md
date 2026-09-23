# Alternative Concepts — five new games built on the Merge Idle War art

> **Status:** concept pitches · 2026-09-21
> **Brief:** five game concepts that reuse Merge Idle War's (MIW) characters, enemies, bosses,
> VFX, icons and SFX. Backgrounds and the gate tower are not reused. The goal is to match or
> beat MIW's average playtime of up to 13 minutes, raise D1 retention, and keep onboarding as
> easy as MIW's "drag the twin onto its twin".
> **Structure:** §1 explains what earned MIW its playtime. §2 lists the reusable kit. §3 compares
> the concepts and gives a recommendation. §4–§8 are the five pitches. §9 lists concepts that
> were considered and rejected. §10 describes how to validate a concept before committing.

---

## 1. What earned the 13 minutes, and what must carry over

The new game must keep what made MIW work. Here is that DNA:

1. **One verb you understand in one second.** Drag a thing onto its twin. No reading needed.
2. **A merge is an event.** Each merge has a squish, confetti, a pitch-climbing tick and
   screenshake. The first time you reach a tier, a full-screen reveal shows a portrait you have
   never seen. The 50-portrait ladder works as a curiosity engine: the next silhouette is always
   one merge away.
3. **Two speeds on one screen.** You play hands-on (spawn, merge, deploy) and hands-off (watch
   your army fight). Players can rest without leaving. The Imp Sergeant turns that rest into idle
   progress.
4. **Stakes without a game over.** An overrun costs waves and fallen fighters, never the run.
5. **Scheduled spectacle.** Combo leads to FEVER, then the ultimate, then a boss every 5 waves.
   That produces a peak about every 60–90 s.
6. **A next goal is always on screen.** Examples: the next-wave chest pip, the next tier
   silhouette, the next upgrade price, and the flying chest every 2 minutes.

**Lessons that must not be repeated** (from telemetry and the 2026-09-11 playtest):

- **A paced core verb gets read as a cooldown.** All 5 of 5 testers read the 4-tap SPAWN meter as
  a cooldown and waited. That pushed slow tappers into the wave-5 wall and explains the bimodal
  CrazyGames rating. Rule for every concept below: in the first 10 minutes, never make the core
  resource look like a timer. Either the player's own action visibly drives the pacing, or there
  is no pacing.
- **The first boss is the first wall.** The first loss must be a near-miss the player can explain.
  Tune it with a policy sim at a slow-player cadence, not by feel.
- **Keep the FTUE hold separate from the portal gameplay bracket.** Tutorial pauses must not drive
  `gameplayStart/Stop`.
- **Unit frame animations were built and then reverted.** Plan on static sprites with procedural
  motion only (see §2.4).

---

## 2. The reusable kit

### 2.1 Art on disk

| Group | Count | Where | Notes |
| :--- | ---: | :--- | :--- |
| Fighter portraits | **50** | `public/images/units/fighter-1..50.webp` | 256² square, bold outlines, face right. Tiers 21–50 float with no legs. Tiers 1–20 are busts or creatures. |
| Enemy walkers | 6 | `public/enemies/` | Slime, caterpillar, goblin, ogre, centaur, dryad. Face left. |
| Bosses | 6 | `public/enemies/bosses/` | Slime tower, orc, fire dragon, troll, worm, silver dragon. |
| Projectiles | 4 static + 3 animated | `public/images/attacks/…` | Fire, stone, ice, shadow. Animated flight for fire, wind and cosmic. |
| Impact sheets (3×3) | 6 | `attacks/animations/*-splitter/-impact-*` | Fire, ice, stone, shadow, cosmic, wind. |
| Skill icons | 8 + meteor | `public/images/attacks/` | Meteor, heal, revive, shield crest, warcry, legion call, executioner's mark, soul pact. |
| Props & icons | 10 | `images/props`, `images/icons` | Coin, winged flying chest, wings, chest, trophy, gears, settings, sound, difficulty stairs, movie. |
| Portal vortex | 1 | `images/arena/portal.webp` | Enemy spawn vortex. |
| **Round "ball" sprites** | **14** | `src/assets/art/props/ball/` | Left over from the Epicrolla template and **not shipped in MIW**, but drawn in the same style: target, amber, baseball, cactus, diamond, eye, gear, glow-rune, lava, clover, obsidian, clay pot, rainbow, stone. Plus 9 matching textures. |
| SFX | 57 | `public/audio/sfx/` | Merge-pop, field-merge, new-tier-reveal, clash ×5, shots ×3, explosions, boss-incoming/death, fever, combo tick, ult-ready, 4 skill stingers, material cuts (wood, stone, crystal), water splash, gravity, and more. |

Not reused (as briefed): `arena-bg`, `scene-bg`, `gate`, `slot-frame`.

### 2.2 Two ways to read the 50-unit roster

MIW uses the roster as **one linear ladder** (tier 1 → 50). Concept 3 keeps that model.
The other concepts need **choice**: which line to invest in, and which synergy to chase. For them
the same 50 portraits regroup, with no new art, into **8 families**. A merge inside a family
climbs to that family's next form. Grouping uses each unit's `element` tag in `ingredients.ts`
and its silhouette:

| Family | Forms (MIW tier → form order) | VFX already shipped | Signature (from MIW abilities) |
| :--- | :--- | :--- | :--- |
| **Ember** | 1 Magma Mote → 10 Phoenix Sovereign → 11 Obsidian Warlord → 40 Ruby Heart → 46 Solar Emperor | fire proj + splitter | burn, eruption |
| **Frost** | 2 Frost Whirl → 4 Glacier Guard → 41 Frostfire Wisp → 44 Comet Herald → 42 Diamond Paragon | ice proj + splitter, wind flight | slow, freeze nova |
| **Stone** | 3 Boulder Brute → 6 Crag Colossus → 21 Steel Sentinel → 23 Lodestone Tyrant → 31 Jade Oracle → 17 Crystal Golem → 32 Rune Monolith | stone proj + splitter | knockback, splash |
| **Tide** | 5 Tide Drop → 35 Bubble Sprite → 22 Mercury Trickster → 15 Ink Drop → 26 Caustic Flask → 28 Coral Monarch | *(needs water sheets)* | heal, poison |
| **Sky** | 9 Golden Talon → 12 Pink Songbird → 16 Halo Chick → 14 Star Owl → 20 Elder Owl | wind flight + impact | Midas crits |
| **Wild** | 13 Blue Fae → 18 Moth Sprite → 27 Bramble Heart → 29 Glowcap Sage → 24 Amber Warden → 45 Aurora Seraph | *(needs nature sheets)* | heal pulse, regrowth |
| **Curio** | 34 Origami Spirit → 37 Echo Bell → 38 Spirit Lantern → 39 Mirror Specter → 33 Chrono Engine → 36 Glitch Cube → 25 Dune Djinn → 30 Stormcloud Fury | cosmic flight + splitter | chain lightning |
| **Void** | 7 Nebula Eye → 8 Void Wraith → 19 Cosmic Crystal → 43 Plasma Dynamo → 47 Wishing Star → 48 Pulsar Beacon → 49 Dark Matter → 50 Singularity Prime | shadow + cosmic | black hole |

All 50 units are used exactly once. Six families already have projectile and impact art. Tide and
Wild each need 2 new VFX sheets. The form order inside a family is a proposal; tune it so the most
impressive portrait comes last.

*Names for tiers 12–20 (Pink Songbird, Halo Chick, Star Owl, Elder Owl, Blue Fae, Moth Sprite, Ink
Drop, Crystal Golem, Cosmic Crystal) describe the painted art. The shipped codex names were written
before the art existed and don't match it (for example, t12, the pink bird, is called "Infernal
Titan", and t14, the owl, is "Magma Leviathan"). A new game should rename them after what they
look like.*

### 2.3 The "corrupted" trick: 50 extra enemies for free

MIW has only 6 walkers and 6 bosses, which is thin for any concept with many enemies. Any fighter
can become an enemy with a mirror (`scaleX(-1)` makes it face left) plus a load-time canvas bake: a
desaturated, darkened body, a violet rim glow, and red-tinted eye highlights. That gives **50 elite
or enemy variants** with a clear "this one is evil" read, and costs nothing. The bake uses the same
cache pattern as MIW's baked sprites, so the scoped-art-invalidation contract still applies.
Concepts 1, 2, 4 and 5 all rely on this.

### 2.4 Constraints every concept respects

- **Static sprites, procedural motion.** Bob, tilt-into-turn, squash and stretch, lunge, orbit,
  hit-flash and dissolve. All five concepts were chosen because their genres read well without
  frame animation. Floating elementals need no walk cycle.
- **Facing.** Fighters face right and enemies face left. Mirroring works for almost every sprite.
  The rune text on t32 and the origami folds on t34 read fine mirrored.
- **Portrait readability.** The portraits hold up down to about 36–40 px, the size of MIW's grid
  cells. No concept may go below that.
- **New art goes through the pipeline** (`art:export → art:desk → art:slice`), so it matches the
  house style. Estimates below are given in pipeline sheets.

### 2.5 Systems and code reuse

● = reused almost as-is · ◐ = reused with an adapter or refactor · — = not needed

| System (module) | 1 Swarm | 2 Legions | 3 Cauldron | 4 Match Quest | 5 Sanctuary |
| :--- | :-: | :-: | :-: | :-: | :-: |
| Merge grid and drop zones (`usePrismGame.ts`, `MergeGrid.vue`, `useDropZones.ts`) | ● orbit grid | ● bench | ◐ juice only | ● barracks | ◐ open board |
| Merge juice and tier reveal (`TierRevealFx.vue`, `useTierReveal.ts`, `usePrismParticles.ts`, `useScreenshake.ts`) | ● | ● | ● | ● | ● |
| Combat engine (`useBattle.ts`: 30 Hz step, targeting, projectiles, burn/poison/slow/knockback/stun, combo, FEVER, ult, mutators) | ◐ logic kept, new renderer | ● two-sided | ◐ siege strip | ◐ turn-driven | ◐ mini-battles |
| Arena skills (`SpellButton.vue`, `SkillIcon.vue`) | ● relics | ● relics | ● relics | ● boosters | ◐ |
| Powerups (`usePowerups.ts`) | ● | ◐ | ◐ | — | — |
| Upgrades and rune frames (`UpgradePanel.vue`, `RuneFrame.vue`, uncapped deep-rank curve) | ● | ◐ | ● | ◐ | ◐ |
| Retention meta (`useOfflineEarnings` + `WelcomeBackModal`, `DailyRewards`, `useBattlePass`, `useAchievements`, `useMissions`, `UnitCodexModal`, `FlyingChest`) | ● | ● | ● | ● | ● |
| Leaderboard stack (`useLeaderboard`, `worker/`, snapshot and seed scripts, `usePlayerIdentity`, `RankBadge`) | ● daily rift | ● **ghost armies** | ● daily brew | ◐ | ◐ |
| FTUE (`useTutorial`, `TutorialOverlay`, `useTutorialPauseGate`) | ● | ● | ● | ● | ● |
| Platforms, ads, SaveManager, CSP, 21-locale i18n | ● | ● | ● | ● | ● |
| Art pipeline, promo art, preview-video recorder | ● | ● | ● | ● | ● |
| 57 SFX + `useSound` | ● | ● | ● | ● | ● |

The platform, ads, save and i18n stack alone is weeks of work that each concept inherits. So does
everything MIW learned about portal QA: the ad-audio mute guarantee, ad-before-result-screen
ordering, rewarded readiness gating, the first-load interstitial, and the cloud-hydration re-reads.

---

## 3. Scorecard and recommendation

| # | Concept | Genre mix | Core verb | Time to first merge | Session unit | Art reuse | New art (sheets) | Code reuse | Effort | Main risk |
| :-: | :--- | :--- | :--- | :-: | :--- | :-: | :-: | :-: | :-: | :--- |
| 1 | **Elemental Swarm** | survivor-like × orbit merge × idle expeditions | steer with one thumb; drag-merge at level-ups | ~20 s | 15-min rift | ★★★★★ | 15–18 | ★★★☆☆ (new renderer) | L | crowded genre; mobile perf with 300 sprites |
| 2 | **Merge Legions** | async-PvP auto-battler roguelite | buy, drag-merge, arrange | ~10 s | 15–20 min run | ★★★★★ | ~12 | ★★★★★ | M | shop economy adds onboarding weight |
| 3 | **Elemental Cauldron** | physics drop-merge (Suika-like) × siege defense | drop | **~4 s** | 2–4 min stage + endless | ★★★★☆ | 8–10 | ★★★★☆ | S–M | Suika clone saturation; physics feel is everything |
| 4 | **Elemental Match Quest** | match-3 puzzle RPG × merge barracks | swipe; drag-merge between stages | ~90 s (first swipe ~3 s) | ~2-min stage | ★★★★☆ | ~15 | ★★★☆☆ | L | needs lots of stage content |
| 5 | **Elemental Sanctuary** | merge-2 world restoration × idle × auto-battle gates | drag-merge | ~3 s | open-ended | ★★★☆☆ | 45–60 | ★★★☆☆ | XL | largest art bill; portal audiences skew action |

| Driver | Swarm | Legions | Cauldron | Match Quest | Sanctuary |
| :--- | :-: | :-: | :-: | :-: | :-: |
| Onboarding ease (vs MIW) | easier | equal | **easiest** | equal | equal |
| Session playtime potential | **highest** | high | high | high | high |
| D1 pull | medium-high | **highest** | medium | high | high |
| Long-term (D7+) depth | high | high | medium | high | **highest** |
| Time to a shippable v1 | ~8–10 wk | **~6–8 wk** | **~4–6 wk** | ~10–12 wk | ~14+ wk |

These time estimates are rough ranges for a solo developer who already owns the MIW stack. They are
here for relative comparison only.

**Recommendation.** Build **Concept 1, Elemental Swarm**, as the flagship. It has the highest
playtime ceiling because the run structure itself carries players to 15 minutes, and two runs make
a 30-minute session. Its controls ("drag to move", auto-attack) are simpler than MIW's. It reuses
the most art in the most visible way, and it keeps the MIW merge verb at the heart of the build.
If you want the **lowest-risk, fastest** path instead, pick **Concept 2, Merge Legions**. It has
the highest code reuse and the strongest D1 hook (the Garrison report). **Concept 3, Elemental
Cauldron**, is the cheapest to validate. It fits as a 2-week side experiment while either of the
other two is in production.

---

## 4. Concept 1 — ELEMENTAL SWARM

**Genre mix:** survivor-like "bullet heaven" × merge-orbit build-crafting × idle expeditions
**One-liner:** *Vampire Survivors, where every weapon is a living elemental circling you, and two
identical ones merge in mid-orbit into something bigger.*
**Player fantasy:** "I started the run as a spark and ended it inside a storm of elementals I built."
**Comparables:** *Vampire Survivors* (30-minute stages, level-up drafts, weapon evolutions),
*Survivor.io* (chaptered mobile runs, heavy meta), *Brotato* (20-wave arena). All three hide
evolution behind recipes or menus. None has a **visible, tactile merge ladder**, and that gap is
MIW's USP.

### 4.1 Core loop

```
 MOVE (one thumb) ──► familiars + warden auto-fire ──► kills drop ESSENCE ──► LEVEL UP (pauses)
      ▲                                                                         │
      │                                                                         ▼
 bigger orbit, new abilities ◄── DRAG a recruit onto its twin in the ORBIT GRID (merge)
      │
 survive 15:00 → rift boss → chest → gold → permanent upgrades, new Wardens, next rift
```

### 4.2 How it plays

- **The Warden.** You pilot one floating elemental (Magma Mote at the start). On mobile you drag
  anywhere, like a one-thumb stick. On desktop the Warden follows the pointer, or you use WASD.
  Floating units need no walk cycle: they glide, tilt into turns, and squash on a dash. The Warden
  auto-fires its family projectile at the nearest enemy. Ember uses `fire-projectile` with
  `fire-splitter` impacts.
- **Essence and level-ups.** Kills drop essence motes. They fly to you with MIW's coin-to-wallet
  VFX. Each level pauses the action and opens the **Orbit Grid**: a 2×4 version of the MIW merge
  grid showing your familiars, next to 3 offered cards.
- **The merge verb, moved into the calm.** A card is a recruit (rank 1 of a family), a relic (a
  skill icon) or a stat. Drag a recruit onto an empty slot to add a familiar, or **drag it onto an
  identical familiar to merge them.** The full MIW squish, confetti and tier reveal play inside the
  level-up screen. Then the run resumes with a bigger familiar orbiting you. Because merging only
  happens while the game is paused, it never competes with steering. The payoff shows up in the
  action a second later.
- **Familiars are the weapons.** Each one orbits at a radius set by its rank and uses its MIW
  signature ability as its weapon. Ember leaves burn trails. Frost casts freeze novas. Stone
  knocks back with splash. Tide and Wild heal the Warden. Sky crits and drops extra gold (Midas).
  Curio casts chain lightning. The Void capstone opens a black hole. All of these behaviors already
  exist in `useBattle.ts` as status effects and ability code. They get re-targeted, not
  re-invented.
- **Resonance.** Holding 3, 5 or 8 familiars of one family triggers resonance tiers. For example,
  Frost 3 makes every freeze shatter for area damage, and Ember 5 makes burning enemies explode.
  Families turn every run into a build, and the draft becomes the strategy layer.
- **Relics are the 8 shipped skills.** Meteor Storm is the one in-run tap button, charged by kills
  like MIW's ult. Heal restores the Warden. Revive Guard is a one-time death save. Shield Crest
  grants 5 s of invulnerability (`usePowerups` `invuln`). Warcry gives +60% damage. Legion Call
  summons 3 ghost familiars for 20 s. Executioner's Mark auto-marks elites. **Soul Pact**
  sacrifices two low familiars to duplicate your best one, which guarantees a merge on the next
  level-up.
- **Run shape.** A 15-minute rift, with bosses at 5:00 and 10:00 and the rift boss at 15:00. MIW's
  mutator system (Horde, Frost March, Elite, Gold Rush) spices up the stretches between bosses.
  Corrupted elementals (§2.3) arrive as elites from minute 3. MIW's flying chest crosses every
  2 minutes; hit it for a free recruit or relic card.
- **No dead runs.** Gold banks to the meta even on death. Dying at 9:40 still pays out and
  unlocks, which keeps MIW's "stakes without a game over" feel.

### 4.3 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | The game loads straight into rift 1 with no menu, like MIW. Magma Mote is centered, and a ghost hand shows "drag to move". Six slimes drift in slowly. Auto-fire lands the first kill at about 2 s. |
| ~8 s | Level 1, tuned to be instant. The Orbit Grid opens with **one** card, Magma Mote. The spotlight shows dragging it into a slot. It starts orbiting. |
| ~20 s | Level 2 offers Magma Mote again. The spotlight shows dragging it **onto its twin**. **Merge**, and the tier reveal shows **Phoenix Sovereign**. The first aha moment. |
| ~45 s | The first horde pulse: 30 slimes. The Phoenix's burn trail chews through them, the combo climbs, and **FEVER** hits at about 60 s. |
| ~90 s | The Meteor Storm button fills and pulses. It's the only tap you need besides steering. |
| 5:00 | The first boss. On the first run it must be beatable with **any** card picks. Validate this with a policy sim that picks randomly, per the MIW lesson. |

### 4.4 Why it holds players: playtime

- **The run has a promised length.** MIW's 13 minutes came from an endless ladder that needs a push
  to keep going. Here the structure carries the player. Quitting at 9:40 with a boss due at 10:00
  feels costly, because motivation rises as a goal gets close (the goal-gradient effect). And
  because the result screen only arrives at 15:00, you get a natural, well-placed ad break there.
- **A merge decision every 20–40 s.** Level-ups keep MIW's merge-grid dopamine rhythm, but each
  merge also carries a build choice.
- **The power curve is the spectacle.** You start with one projectile and end with 8 familiars and
  300 enemies on screen. That escalation is the thing people clip and share.
- **Draft variance.** 8 families × resonance tiers × 8 relics means no two runs play alike. "What if
  I go full Void?" is what starts run 2.
- **Short meta breaks.** Between runs there's about 60–90 s of spending gold and picking the next
  rift. Two runs add up to 30+ minutes.

### 4.5 Why they come back: D1

- **Daily Rift.** One fixed seed for everyone, with a shared leaderboard. It reuses the leaderboard
  Worker, and a baked snapshot covers Poki and Yandex.
- **Expeditions (the idle layer).** Codex duplicates go on an expedition while you're away. The
  Welcome Back modal pays out gold plus one card pack (reusing `useOfflineEarnings` with the
  wave-tiered cap).
- **Warden unlocks.** The 50-portrait gallery shows silhouettes. Every rift boss drops a Warden egg,
  and the next Warden is always visible and close.
- The daily-streak calendar (`DailyRewards.vue`) and a battle-pass season (`useBattlePass`).

### 4.6 Long-term (D7+)

- 10 rifts, each a biome with a new background.
- Ascension levels per rift: optional difficulty for better rewards, like Hades' Heat.
- Per-Warden mastery and a family codex.
- Achievements and battle-pass seasons.

### 4.7 Monetization (playbook-aligned)

- Rewarded **Revive** on death, once per run. This is the highest-intent moment.
- Rewarded **2× run chest**, shown before the result screen.
- Rewarded **reroll** of level-up cards, capped per run.
- Interstitials only between runs, never mid-rift. The FTUE run is ad-free.

### 4.8 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | Playable Wardens, orbiting familiars, **and** corrupted elite enemies. Every portrait appears three ways. |
| 6 walkers | Horde fodder, each with a behavior: slime and caterpillar crawl, goblin rushes, ogre tanks, centaur shoots, dryad heals the horde |
| 6 bosses | Rift bosses at 5, 10 and 15 minutes. Their 2.3× scale already reads as "boss" |
| Projectiles and impact sheets | Family weapons, used 1:1 |
| 8 skill icons | Relic cards and the ult button |
| Coin, chest, flying chest, trophy, portal | Pickups, run chest, cross-screen reward, results screen, elite spawn portals |
| 57 SFX | All combat, merge, reveal, boss and fever audio |

**New art (~15–18 sheets):** 10 tileable rift grounds, an essence mote, water and nature VFX sheets
(4), and the card and orbit-grid frames.

### 4.9 Tech notes

- MIW renders units as DOM elements, capped at 24 enemies. Swarm needs **200–400 sprites**, so it
  needs a canvas-2D sprite batcher: baked sprite atlas, object pools, a spatial hash for
  collisions, and a capped DPR.
- `useBattle` ability, stat and status-effect logic ports over. The renderer and the movement layer
  are new.
- Damage numbers move into the canvas. The pooled-number design carries over.
- Follow the measure-first perf skill. The target is a mid-range Android phone at 60 fps with 300
  enemies.

### 4.10 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Survivor-likes are common on portals | Differentiate on the visible merge and family resonance. The 10 s preview video must show a merge and a new-tier reveal in its first 5 s. |
| Mobile perf with hundreds of sprites | Canvas plus an atlas, with enemy caps that scale with the device. A/B it on a throttled device before shipping. |
| Steering and dragging compete | Merging only happens in the level-up pause. The only tap during action is the ult. |
| Portrait readability at small size | Familiars never render below 36 px and carry a family-colored ring. |

### 4.11 Targets and kill criteria

- **Targets:** first kill ≤ 3 s, first merge ≤ 25 s, ≥ 70% of first runs reach the 5:00 boss,
  median run ≥ 11 min, average playtime **≥ 15 min** (above MIW).
- **Kill the concept** if, in the greybox, fewer than 60% of playtesters finish run 1, or fewer
  than half start run 2 on their own.

---

## 5. Concept 2 — MERGE LEGIONS

**Genre mix:** async-PvP auto-battler roguelite × MIW merge × idle garrison
**One-liner:** *Draft elementals, merge twins, set your battle line, then watch it fight a real
player's army. Win ten before your lives run out.*
**Player fantasy:** "I out-merged a real person."
**Comparables:** *Super Auto Pets* (async ghost PvP with no live netcode; a 10-win run),
*Teamfight Tactics* (traits and synergies), and *Backpack Battles* (run-based async PvP). These
titles show that you can have PvP stakes without matchmaking servers, which fits the Cloudflare
Worker MIW already runs.

### 5.1 Core loop

```
 SHOP (3–5 offers, 10 gold) ──► BUY & DRAG to bench ──► MERGE twins ──► ARRANGE the line (5 slots)
      ▲                                                                        │
      │                                                                        ▼
 gold, trophies, relics ◄── WIN / LOSE a life ◄── AUTO-BATTLE vs a real player's GHOST army
```

### 5.2 How it plays

- **Shop phase.** You get 10 gold per round. Units cost 3 and a reroll costs 1. Offers are rank-1
  family members. Higher ranks join the shop pool as rounds progress, the same idea as MIW's
  Recruits ladder. The **bench is a 2×4 MIW merge grid**. A bought unit drops onto the bench, and
  dragging it onto an identical unit merges it to the next form, with MIW's full juice and tier
  reveal. Merges take two units, not three like TFT's star-ups, so the ladder climbs faster.
- **The battle line** has 5 slots, front to back, in MIW's side-view arena. Melee goes in front and
  ranged in the back. There's no hex geometry to learn.
- **Battle phase.** The MIW engine runs it: fixed 30 Hz step, the same abilities, projectiles,
  impacts, damage numbers and combo. The opponent's army is mirrored and enters from the right.
  A fight lasts 15–30 s, with a 2× speed toggle.
- **Family traits** trigger when you field 2 or 4 units of one family:
  - Ember: burn on hit
  - Frost: slow aura
  - Stone: a shield on the front unit
  - Tide: heals the back row
  - Sky: Midas crits
  - Wild: regrowth
  - Curio: chain lightning
  - Void: an opening black hole
- **Relics** are the 8 skill icons, bought in the shop:
  - Meteor: an opening salvo
  - Heal
  - Revive Guard: the first death revives
  - Shield Crest: a defender taunt
  - Warcry: +60% damage for 8 s
  - Legion Call: 3 ghost units
  - Executioner's Mark: executes the enemy's best unit below 12% health
  - **Soul Pact**: sacrifice one unit to copy another, which gives instant merge material and
    enables comebacks
- **Boss rounds.** Rounds 5 and 10 are PvE fights against MIW's bosses. A win earns a relic. A loss
  costs **no life**. This is a safety valve against PvP pressure and a scheduled spectacle.
- **A run** ends at 10 wins (the crown) or when you run out of lives. That's about 12–16 rounds of
  ~75 s each, or **15–20 minutes**.

### 5.3 The ghost backend (reusing the leaderboard stack)

- After each round, the client posts its line to the Worker: 5 unit ids, their ranks and relics,
  about 100 bytes. The key is (round, trophy bracket). Opponents are sampled from D1 by the same
  key. The existing Worker already provides HMAC-signed writes, per-id cooldowns and an origin
  allowlist.
- **Deterministic seeded battles.** Both clients compute the same fight, so a reported result can be
  re-simulated server-side, which is cheap for a 30 s fight. That blocks forged wins.
- **Offline and zero-request portals (Poki, Yandex).** Bake a build-time snapshot of about 5,000
  ghost lines, the same way the leaderboard snapshot and seed work. Add seeded bots too. The game
  never needs realtime netcode.

### 5.4 The Garrison: an idle layer made of real people

Your best line of the day defends while you're away. Each time another player draws your ghost, the
Worker tallies the result. The next time you open the game, the Welcome Back modal says: **"Your
Legion defended 23 times and won 16. +N gold, +trophies."** It's a real social signal plus passive
income, and it's the strongest re-open hook in this document.

### 5.5 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | The shop shows **3 identical Magma Motes** and you have 10 gold. A ghost hand shows tapping to buy; the unit lands on the bench. |
| ~8 s | You buy the second Mote. The hand drags it **onto the first**. **Merge**, and Phoenix Sovereign is revealed. |
| ~15 s | You drag the Phoenix into the line and press FIGHT. It faces a scripted bot with 2 slimes and wins in 8 s. +1 trophy. |
| Round 2 | A second family appears in the shop. Hovering a unit lights up its trait preview ("2 Ember: Burn"). |
| Round 3 | The first loss is a scripted near-miss against a Stone front line. The recap card explains why ("their Stone shield absorbed 340") and highlights a counter in the shop. **No life is lost on the first run's first loss.** |
| Rounds 1–4 | Bots only. Real ghosts start at round 5, once the player understands the loop. |

Complexity is layered. The first run has no reroll, no selling and no freezing. Each of those unlocks
in its own run, from run 1 to run 3.

### 5.6 Why it holds players: playtime

- **The run is the unit, and every round ends on a cliffhanger.** The next shop is already open
  when the battle recap closes, and there's no natural quit point until you win the crown or run
  out of lives.
- **Hearts plus near-misses.** Losing a close fight with visible hearts left creates a strong "I
  can fix that" drive.
- **Watching is fun, as MIW proved.** The battle phase is MIW's hands-off speed. Players rest
  without leaving.
- **Real opponents.** Every round brings a new composition from a real person, with endless
  variety and no content cost.
- **Run-end unlocks.** New families enter the pool, a new relic appears, and your trophy rank
  moves. That starts the next run.

### 5.7 Why they come back: D1

- **The Garrison report** (§5.4).
- **Runs persist.** If you close the game mid-run, it reopens on "6 wins, 3 lives. Continue?"
  Unfinished tasks stick in the mind (the Zeigarnik effect).
- **Daily Challenge.** A fixed shop seed for everyone, with a leaderboard.
- Trophy leagues with a season end, and a free relic each day.

### 5.8 Long-term (D7+)

- Leagues from Bronze up to Singularity, with league badges.
- Family unlocks: start with 4 families and unlock the other 4 over time.
- Seasonal battle pass and achievement ladder.
- Cosmetic arena backgrounds and unit frames.
- A "Hall of Crowns" gallery of winning lines.

### 5.9 Monetization

- Rewarded extra reroll, once per shop, capped per run.
- Rewarded **second chance** (+1 life), once per run.
- Rewarded 2× crown rewards, shown before the result screen.
- Rewarded 2× Garrison claim.
- Interstitials only between runs.

### 5.10 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | Both sides of every battle (mirrored for the opponent), shop cards and the codex |
| 6 walkers and 6 bosses | Bot armies in the FTUE and boss rounds |
| VFX, projectiles and impacts | Used 1:1. The combat is MIW's combat |
| 8 skill icons | Relics |
| Trophy, chest, coin | Rank, run rewards and currency |
| 57 SFX | 1:1 |

**New art (~12 sheets):** 3–4 arena backgrounds, shop and bench frames, heart and crown icons, and
8 league badges. That's the **lowest new-art bill** of the five.

### 5.11 Tech notes

- Refactor `useBattle` from "fighters vs waves" to **two symmetric sides**. Each side holds units
  with the same stat model, and the enemy side is just rendered mirrored.
- New work: the shop economy, the round state machine, the ghost service (a Worker route plus a D1
  table), and a deterministic seeded simulation.
- Reused as-is: grid, drop zones, reveal, codex, leaderboard, player identity, battle pass,
  achievements, missions, saves and ads.

### 5.12 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Shop economy adds onboarding weight | Fixed prices, layered unlocks over runs 1–3, and bots only until round 5 |
| Large balance surface (8 families × traits × relics) | A headless bot-vs-bot tournament sim with 10k runs, in the same style as MIW's balance sim |
| Forged ghosts or results | HMAC signing plus a server-side re-sim of reported lines |
| Empty ghost pool at launch | Seeded bots and a baked snapshot, like the seeded leaderboard |
| Battles feel passive | Fights last 15–30 s with a 2× toggle, and relics can be activated mid-fight (for example, when to drop the Meteor) |

### 5.13 Targets and kill criteria

- **Targets:** first merge ≤ 10 s, first battle ≤ 25 s, ≥ 60% finish run 1, ≥ 50% of finishers
  start run 2, average playtime **≥ 15 min**, D1 above MIW's on the same portal.
- **Kill the concept** if playtesters can't explain what a trait does after run 1, or if the first
  loss makes more than 30% quit.

---

## 6. Concept 3 — ELEMENTAL CAULDRON

**Genre mix:** physics drop-merge (Suika-like) × siege defense × MIW endless waves
**One-liner:** *Drop elementals into a bubbling cauldron. Twins that touch merge, and every merge
fires at the monsters marching on it.*
**Player fantasy:** "I'm a battle alchemist, and my brew is my artillery."
**Comparables:** *Suika Game* (the 2023 viral drop-merge hit), *Puyo Puyo* (chains), and *Puzzle
Fighter* / *Tetris 99* (the opponent's pressure arrives as garbage on your board).
**Callback:** MIW v1 was an alchemy cauldron game, and the elementals were literally *ingredients*
(the file is still called `ingredients.ts`). This concept returns them to the pot, with the combat
MIW added.

### 6.1 Layout

- **Portrait:** the top 35% is a side-view **siege strip**. Enemies march from the right toward the
  cauldron rim on the left. The bottom 65% is the **cauldron**, a physics jar.
- **Landscape and desktop:** the cauldron sits on the left third and the siege strip runs to the
  right.

### 6.2 How it plays

- **Drop.** Drag sideways to aim and release to drop. The next **two** drops are previewed (ranks
  1–5 of the world's chain). Each unit sits inside a **glass orb**, a single new overlay sprite.
  The collider is a clean circle, the portrait reads inside it, and the orb radius grows with tier.
- **Merge.** Two orbs of the same tier merge at their contact point into the next tier, with MIW's
  squish and confetti, plus the full-screen reveal the first time you reach a tier. Cascades chain
  naturally out of the physics.
- **Every merge fires.** The new unit's element projectile launches from the rim at the front
  enemy, with damage that scales with tier. Chain merges within 1.5 s build combo, and ×10 ignites
  **FEVER** (double damage and gold). Tier 8+ merges fire signature ultimates: a Void black hole
  pulls the whole march back, a Frost nova freezes it, and Ember calls a meteor.
- **Pressure coupling, the key twist.** Enemies that reach the cauldron don't take HP. They
  **hurl sludge into the brew**: junk orbs that can't merge. Those are the **14 round "ball"
  sprites** already in the repo (stone, obsidian, lava, clay pot, cactus and others). A merge next
  to junk cracks it; two hits break it. Bosses throw bigger junk. So poor defense crowds the
  cauldron, which raises the risk of losing. Combat and puzzle feed each other, and the puzzle gets
  a clock.
- **Losing.** If the brew stays above the rim line for 3 s, it **boils over**. A rewarded continue,
  "Skim the brew", removes the top 5 orbs and all junk. In Endless mode a boil-over restarts the
  wave from its checkpoint, the MIW rule.
- **Modes:**
  - **Campaign:** stages of 3 waves plus a boss, 2–4 minutes each. Up to 3 stars for leftover
    space and time.
  - **Endless Siege:** MIW's endless ladder with a best-wave leaderboard.
  - **Daily Brew:** a seeded drop sequence. Everyone gets the same drops, so the leaderboard
    measures skill, not luck.
- **Worlds are chains.** Each world uses an 11-tier slice of the roster as its merge chain. World 1
  is MIW's tiers 1–11, world 2 is tiers 12–20 plus 2, and so on. Each world is a new chain to
  discover with the same verb: **4–5 worlds from existing art.** Suika's chain has 11 fruits; ours
  has 50 portraits.
- **Meta.** MIW's upgrade panel and rune frames: Rim Cannon (damage), Wider Cauldron, Bounty (gold)
  and an Alchemist Imp (an aim-assist line, and later auto-drops while you're away). Relics go into
  a pre-stage loadout:
  - Meteor: clears junk
  - Soul Pact: the next drop copies whatever it touches
  - Executioner's Mark: the next merge crits ×3
  - Heal: removes 3 junk orbs
  - Revive Guard: one free skim
  - Legion Call: drops 3 rank-1 units
  - Warcry: +60% damage for 8 s
  - Shield Crest: junk immunity for 10 s

### 6.3 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | Stage 1 starts with 3 Magma Motes resting in the cauldron and one slime far to the right. A ghost hand shows dragging above a Mote and releasing. |
| ~4 s | The drop touches a Mote. **Merge**, a shot from the rim, and the slime dies. That's the fastest aha of the five concepts. |
| ~10 s | Two scripted drops cascade (1+1 → 2, which lands next to a 2 → 3). The first chain plays with the pitch-climbing combo tick. |
| ~40 s | A goblin reaches the rim on purpose and throws the first **sludge** orb. Cue: "merge next to sludge to crack it". |
| ~2:30 | The end of stage 3 brings the first boss (Slime Tower). The winning blow is a scripted big merge. |

### 6.4 Why it holds players: playtime

- **The fastest decision loop of the five.** A drop every 1–2 s, each with a physical, unscripted
  outcome. That's a very frequent variable reward, the same "slot machine in a jar" that made
  Suika addictive.
- **Near-misses are built in.** A boil-over always feels like "one bad drop", so the player retries
  immediately. That retry is the genre's strongest loop.
- **Short stages, visible next goals.** 2–4 minute stages mean frequent wins. The world map shows
  the next stage and the world's next locked tier silhouette.
- **The long tail uses MIW's proven model.** Endless Siege is the endless ladder that earned MIW
  its 13 minutes.

### 6.5 Why they come back: D1

- **Daily Brew** leaderboard (seeded, fair).
- **The simmering pot (idle).** The cauldron brews while you're away. The Welcome Back modal hands
  you a high-tier orb that goes into your next stage, so the head start is felt immediately.
- **World unlocks** bring a whole new 11-portrait chain to discover.
- The streak calendar and a battle pass.

### 6.6 Long-term (D7+)

- 4–5 worlds of campaign stages.
- Endless Siege leaderboard with seasonal resets.
- Cauldron skins, a cheap art-pipeline product line.
- Achievements such as "11-chain" and "merge the capstone".

### 6.7 Monetization

- Rewarded **continue** on boil-over, once per stage. It's a high-intent, proven placement.
- Rewarded 2× stage chest, shown before the result screen.
- Rewarded extra relic slot.
- Interstitials between stages, at most one every 3 stages.

### 6.8 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | Orb contents, sliced into 4–5 world chains. The **linear ladder** is used as-is |
| 6 walkers and 6 bosses | The siege strip, presented **exactly as in MIW** (face left, march, enrage). The only concept that reuses MIW's enemy presentation 1:1 |
| Projectiles and impacts | Rim shots per element |
| 8 skill icons | Loadout relics |
| **14 ball sprites** | Sludge and junk orbs, reusing art that MIW doesn't ship |
| Coin, chest, trophy | Rewards and the leaderboard |

**New art (8–10 sheets):** the cauldron (2–3 bubble states) with its rim cannon, the glass-orb
overlay and shine, 4–5 world backdrops, and a sludge-splat VFX.

### 6.9 Tech notes

- A 2D circle-physics solver for up to about 60 bodies. It can be a small custom impulse or verlet
  solver, or a bundled planck.js. Poki forbids external requests, so bundle it.
- The simulation runs on a **fixed deterministic step**, so Daily Brew replays are reproducible.
- The siege strip is a lighter `useBattle` with enemies and projectiles only.
- The cauldron is a canvas with baked orb sprites. The rest of the UI is MIW's.

### 6.10 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Suika-likes are common | The first 5 s of the preview clip must show drop, merge, shot, kill. The siege coupling and bosses are what's new. |
| Physics feel is the whole game | Budget time for tuning restitution, friction, the merge "suck-in" animation and the cascade pacing |
| Luck frustration | Preview 2 drops, add a hold slot as an upgrade, and seed Daily Brew for fairness |
| Shallower long-term meta than the others | Endless Siege plus worlds as new chains. Accept a lower D7 in exchange for the cheapest build |

### 6.11 Targets and kill criteria

- **Targets:** first merge ≤ 5 s, stage 1 completion ≥ 95%, retry after a loss ≥ 70%, average
  playtime **≥ 13 min**.
- **Kill the concept** if the greybox playtime stalls under 8 minutes, which would mean the siege
  coupling isn't adding pull beyond plain Suika.

---

## 7. Concept 4 — ELEMENTAL MATCH QUEST

**Genre mix:** match-3 puzzle RPG × MIW merge barracks × idle training
**One-liner:** *Match elemental runes so your five-unit squad fires, freezes and burns through
monster waves, then merge the duplicates you loot to evolve the squad.*
**Player fantasy:** "Every match I make is an order to my army."
**Comparables:** *Empires & Puzzles* (tile colors trigger heroes of that color; long-lived and
retentive), *Puzzle & Dragons* (the originator of match-to-attack). In both, heroes evolve through
menus. **Here they evolve with MIW's drag-merge**, which is more tactile and more rewarding.

### 7.1 Layout

- **Portrait:** the top 40% is MIW's side-view arena. Your squad of 5 stands on the left facing
  right, and 1–5 enemies stand on the right facing left. The bottom 60% is a 7×6 rune board.
- **Landscape:** the arena and board sit side by side.

### 7.2 How it plays

- **Rune colors map to families with shipped VFX:** Ember (fire), Frost (ice), Stone (stone), Sky
  (wind) and Void (shadow and cosmic). Tide, Wild and Curio join as later-world colors. **The rune
  tiles come from the 14 ball sprites** (lava, diamond, stone, glow-rune, obsidian, clover, amber
  and others), which cuts the new-art bill.
- **Matching.** A match of 3+ makes every squad member of that color fire its projectile, with
  damage scaled by rank. A match of 4 creates a line rune. A match of 5, or an L or T shape, creates
  an element bomb using the **Meteor** art. Cascades raise combo, and combo ×10 triggers **FEVER**.
- **Ultimates.** Each unit fills mana from matched runes of its color. Tapping its portrait fires
  its MIW signature: freeze nova, chain lightning, black hole, heal pulse or Midas.
- **Enemies act on visible countdowns** ("attacks in 3 moves"), and some affect the board. The dryad
  heals her allies. The centaur petrifies runes into junk (the **stone** ball). The goblin steals
  gold runes. Corrupted elementals (§2.3) carry element tints for the element wheel.
- **The element wheel** gives 2× damage against the weak element. From world 2 on, squad building
  matters. Before that, the wheel stays hidden.
- **The Barracks, between battles, is the MIW merge grid.** Loot is unit cards: rank-1 duplicates
  and the occasional rank 2. Drag same onto same to **evolve** through the family's forms, with
  MIW's full merge juice and tier reveal. You pick your squad from the barracks. **Merging is the
  progression**, replacing XP menus.
- **Map:** 10 worlds × 15 stages. Each stage has 3 waves and stage 15 is the boss. Stars for moves
  left. A weekly **Boss Raid** uses MIW's 6 bosses, scaled up.

### 7.3 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | The board is pre-seeded with an obvious fire match. A ghost hand swipes. Magma Mote fires and the slime dies at about 3 s. |
| ~20 s | A guaranteed 4-match creates the first line rune, and wave 2 enters. |
| ~60 s | The first ultimate tap: Magma Mote's burn wave. |
| ~90 s | Stage 1 ends and you loot a second Magma Mote. The Barracks opens with a spotlight on dragging it **onto its twin**. **Merge**, and Phoenix Sovereign is revealed. |

The first *merge* lands later than in the other concepts. The core verb here is the swipe, which
is the most widely known verb in casual games, so onboarding stays as easy as MIW's.

### 7.4 Why it holds players: playtime

- **Stages are perfectly sized.** At 90–150 s, each stage ends at a natural breakpoint with the
  next map node already glowing. "One more stage" is the genre's engine.
- **Two alternating verbs.** Match in battle and merge in the barracks. That prevents fatigue from
  either one.
- **Visible power growth.** A merged squad clears yesterday's hard stage in two moves.
- **Stars create replay.** Three-starring old stages is a second loop that costs no content.

### 7.5 Why they come back: D1

- **The map is the strongest D1 structure there is.** "I'm on world 2, stage 4" is progress you can
  see.
- **Idle Training Grounds.** Barracks units earn XP and gold while you're away (reusing
  `useOfflineEarnings`).
- Daily Boss Raid keys, the streak calendar and the battle pass.

### 7.6 Long-term (D7+)

- 150 stages, with weekly raids and events.
- The element-wheel team-building meta.
- Full family collection in the codex.
- Achievements and a star leaderboard.

### 7.7 Monetization

- Rewarded **+5 moves** on a failed stage, a classic, proven match-3 placement.
- Rewarded 2× loot.
- Rewarded extra raid key.
- Interstitials every 3–4 stages. None in world 1's first 5 stages.

### 7.8 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | Squad (side view, **facing right as shipped**), barracks units and loot cards |
| 6 walkers, 6 bosses, corrupted variants | Stage enemies and raid bosses, in MIW's arena layout |
| Projectiles, impacts, meteor | Match attacks, used 1:1. The meteor becomes the bomb rune |
| 8 skill icons | Pre-battle boosters |
| **14 ball sprites** | Rune tiles, junk runes and special runes |
| Coin, chest, trophy | Loot and rewards |

**New art (~15 sheets):** rune-tile polish for missing colors, the board frame, 10 world-map
backdrops, and map nodes.

### 7.9 Tech notes

- A new match-3 engine: swap, gravity, cascades, special runes, shuffle when no moves remain, and
  hints.
- `useBattle` runs in turn-driven mode. The fixed-step engine makes this a scheduling change, not a
  rewrite.
- Stage data needs a **generator plus a bot solver**, the match-3 equivalent of MIW's policy sim,
  to rate the difficulty of every stage.
- The Barracks is `MergeGrid.vue` as-is.

### 7.10 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Content hunger (150 stages) | A procedural stage generator plus a bot solver for rating. Hand-tune only the first 30 stages |
| Match-3 difficulty tuning is its own discipline | The bot solver produces win-rate curves per stage, the same method as MIW's balance sim |
| Squad and element complexity | Hide the element wheel until world 2, and add an auto-squad button |
| Portal match-3 competition | The hook is the **army on screen**: matches visibly command units. The preview clip leads with a 5-match bomb plus a black-hole ultimate |

### 7.11 Targets and kill criteria

- **Targets:** stage 1 completion ≥ 97%, first-session world-1 completion ≥ 40%, average playtime
  **≥ 15 min**.
- **Kill the concept** if playtesters treat the arena as decoration, meaning they match without
  looking at which units fire.

---

## 8. Concept 5 — ELEMENTAL SANCTUARY

**Genre mix:** merge-2 world restoration × idle production × MIW auto-battle gates
**One-liner:** *Heal a cursed sky-archipelago one merge at a time. Every elemental you raise keeps
working for you while you're away.*
**Player fantasy:** "It's my world, and it gets more beautiful every day."
**Comparables:** *Merge Dragons* (merging heals a cursed land; famously long sessions and deep
retention), *Merge Mansion* and *Travel Town* (merge-2 with orders), *EverMerge*. **The MIW
difference is combat:** monsters guard the corruption, and you beat them in MIW's auto-battle.

### 8.1 How it plays

- **The board** is a pannable island of cells. The center is healed, and the rest is shrouded in
  corruption goo. There's one **nest** per family, and tapping a nest spawns a rank-1 elemental.
- **Merge 2 to get the next family form.** That's MIW's verb, unchanged. A merge on a tile next to
  corruption **heals** it: the purple goo dissolves in sparkles and a hidden object pops out. It
  can be a chest, coins, an **egg** of a new family, or ruins that become work sites.
- **Guarded zones.** Corrupted monsters (the 6 walkers, 6 bosses and corrupted elementals) sit on
  key tiles. Drag up to 3 elementals onto a monster and **MIW's arena opens as a card-size pop-up**
  for a 20 s watchable auto-battle, skippable at 2×. Winning heals that tile's whole region. MIW's
  idle battler becomes the gate mechanic.
- **Orders.** Units double as NPCs. The Spirit Lantern asks for 3 Frost Whirls; the Chrono Engine
  wants a Crag Colossus. Orders pay rewards through the existing missions system.
- **Idle production.** Elementals placed on healed work tiles earn essence and gold over time, even
  offline: Ember on forges, Tide on springs, Wild on groves. Offline earnings are capped at 8 h,
  reusing `useOfflineEarnings` and its tiered cap.
- **The anti-cooldown rule (MIW's spawn-meter lesson).** Merge-2 nests are normally
  cooldown-driven, the exact thing players read as "wait". Here, **every merge of rank 3 or higher
  refunds a nest charge**, so an active player never stalls. Timers only refill nests for idle
  players. That keeps the appointment returns without the cooldown cliff.
- **Clutter control**, the genre's main frustration:
  - an 8-slot satchel for storage
  - selling junk
  - **the Imp Sergeant returns** as a gold-upgradeable helper that auto-merges adjacent pairs,
    reusing MIW's automation upgrade
- **Islands are families.** There are 8 islands, one per family theme: Ember forge, Frost glacier,
  Stone quarry and so on. Each island's peak holds a boss. Healing the island crowns the family's
  capstone portrait (for example Solar Emperor) as its guardian.

### 8.2 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | A small healed patch with 4 Magma Motes. Drag one onto another and they **merge**. The goo next to them dissolves and a chest pops out, all by about 3 s. |
| ~20 s | Tap the nest and 2 more Motes appear. A merge chain makes a Phoenix, and the fog peels back further. A slime blocks the bridge. |
| ~45 s | Drag the Phoenix onto the slime. An 8 s mini-battle plays, the bridge heals, and a new area reveals an **egg**. Now the player is curious. |
| ~2 min | The first order arrives from an NPC elemental. |

### 8.3 Why it holds players: playtime

- **The board never ends.** A merge is always available, and a tidy board is its own reward. That
  completionism is what makes merge-2 sessions famously long.
- **The fog creates curiosity.** Every healed tile answers "what's under there?" and raises the
  next question.
- **Investment you can see.** The island visibly transforms. A player who has spent 20 minutes
  there sees those 20 minutes.
- **Battles add action beats.** They break up the calm merging with a watchable spectacle, much like
  the two speeds in MIW.

### 8.4 Why they come back: D1

- Offline production and a full satchel waiting.
- **"The egg hatches tomorrow"**, the classic appointment hook.
- Daily orders and weekend island events.
- The world looks different from how you left it. Nothing pulls a player back like their own world.

### 8.5 Long-term (D7+)

- 8 islands, the collection of 50 forms, seasonal event islands and decoration.
- This concept has the **deepest D30 potential** of the five.

### 8.6 Monetization

- Rewarded nest refill (only when a nest is actually empty, so idle players are the ones who see
  it).
- Rewarded 2× offline earnings.
- Rewarded rare-chest open and egg speed-up.
- Interstitials only after island milestones. Merge-2 players punish ad interruptions hard.

### 8.7 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | Merge items, workers **and** quest-giving NPCs, all in one |
| 6 walkers, 6 bosses, corrupted variants | Corruption guardians and island-peak bosses |
| Projectiles and impacts | Mini-battles, plus a cleansing burst when a tile heals |
| Chest, flying chest, coin | Hidden loot, a sky courier delivering rewards, and currency |
| 57 SFX | Merge, reveal, cut sounds (wood, stone, crystal) for clearing obstacles |

**New art (45–60 sheets):** the largest bill of the five. It covers the island tile set (healed and
corrupted variants, about 20), 8 nests, about 30 decor props that appear as land heals, 8 island
backdrops, and the goo, which can be a procedural shader. The art pipeline and Art Desk make this
feasible, but it's still the most painting.

### 8.8 Tech notes

- A pannable tile-map canvas.
- A merge-2 board with obstacles and multi-cell objects.
- An order system and offline production.
- The mini-battle embeds `useBattle` in a modal.
- **Save size.** A board with hundreds of cells needs compact serialization to fit within portal
  cloud-save quotas. Re-check the SaveManager single-blob budget and the hydration re-reads.

### 8.9 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Highest art and content cost | Launch with 3 islands and add the rest as live updates |
| Portal audiences skew toward action | Guarantee a battle beat every 60–90 s in the first 10 minutes |
| Board clutter frustration | Satchel, selling, the Imp auto-merge, and a "merge all pairs" rewarded button |
| Slower early excitement | Script the FTUE density: a reveal within 3 s, a battle within 45 s, an egg within 60 s |

### 8.10 Targets and kill criteria

- **Targets:** first merge ≤ 3 s, first battle ≤ 45 s, average playtime **≥ 15 min**, D1 above
  MIW's baseline.
- **Kill the concept** if the greybox (a single island made of placeholder tiles) doesn't hold
  playtesters for 10+ minutes without meta systems.

---

## 9. Also considered, and why they're not in the five

| Idea | Why not |
| :--- | :--- |
| **Merge tower defense** (Rush Royale and Random Dice style) | Static sprites suit towers perfectly, but it's MIW's closest neighbor (merge → place → waves). It would cannibalize MIW's audience instead of opening a new one. It works better as a **mode inside MIW**. |
| **2048 roguelite dungeon** (swipe, same tiers merge, enemies are tiles) | A good fit for the 50-tier ladder, but 2048's merge is abstract. It loses MIW's tactile "drag the twin" moment and the watchable battle. |
| **Idle hero collector** (AFK Arena style) | Strong mobile retention, but the menu-heavy onboarding and gacha dependence are a poor fit for web portals and for the "one verb" DNA. |
| **Merge pinball / Peglin-like** | Fun physics, but Concept 3 already covers the physics angle with a clearer verb. |

---

## 10. How to validate before committing (applies to every concept)

1. **Greybox in 5–7 days with shipped art only.** Build the core verb and one session's worth of
   content. No meta yet. Shipped art makes the greybox look nearly final, a big advantage over
   greyboxing with boxes.
2. **Persona playtests plus a policy sim**, the same protocol as the 2026-09-11 MIW debrief. Include
   at least a masher, a "cooldown believer", a reader, an idler and a one-thumb mobile player.
   Simulate the first 10 minutes at a slow-player cadence of 2–2.5 s per action.
3. **Gates:** time to first merge, time to the first aha moment, greybox session length, and
   **whether players start a second session or run on their own**. Each concept's kill criteria
   are listed above.
4. **Record a 10 s preview clip from the greybox** (`pnpm preview:video`, fail and success takes).
   If the clip doesn't sell the concept in 5 s, the portal thumbnail and CTR won't either.
5. **Portal playtest** (CrazyGames or Poki) against MIW's baseline on the same portal, with average
   playtime and D1 as the two numbers that decide.
6. Then run the `new-web-game-playbook` phases: GDD, asset manifests, save system, platform builds,
   ads, release QA and the retention roadmap. The whole MIW stack drops in.
