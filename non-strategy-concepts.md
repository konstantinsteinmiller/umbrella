# Non-Strategy Concepts — three casual games built on the Merge Idle War art

> **Status:** concept pitches · 2026-09-21
> **Brief:** three **casual, low-strategy** game concepts that reuse Merge Idle War's (MIW)
> characters, enemies, bosses, VFX, icons and SFX. Backgrounds and the gate tower are not reused.
> The goal is to match or beat MIW's average playtime of up to 13 minutes, raise D1 retention, and
> keep onboarding as easy as MIW's "drag the twin onto its twin".
> **Companion doc:** [`alternative-concepts.md`](alternative-concepts.md) has the five
> strategy-leaning concepts. Its §2 lists the full reusable kit: the art inventory, the 8-family
> regrouping of the 50 units, the "corrupted enemy" trick, and the code-reuse matrix. This doc
> relies on that kit and doesn't repeat it.

---

## 1. The casual contract

"Less strategic" needs a testable definition, or strategy creeps back in during production.
Each concept below follows these six rules:

1. **Nothing chosen before a run can lose you that run.** No drafts, team compositions, loadouts or
   builds.
2. **In-session decisions use hands and eyes, not planning.** Aim, steer and time things. A player
   should never stop to think for more than about 3 seconds outside a menu.
3. **Upgrades are single, obvious tracks.** There's always one "next thing to buy", and it glows.
   Buying the cheapest glowing upgrade is never wrong.
4. **Merges are automatic, or there's only one twin to drag onto.** The merge is a reward moment,
   never a puzzle.
5. **Failure comes from execution, not from an earlier choice.** "I missed" is fine. "I picked the
   wrong family three rounds ago" is exactly what these concepts avoid.
6. **Depth comes from content, not systems.** New creatures, zones and bosses keep the game fresh.
   New rules don't.

### What carries over from MIW's DNA

| MIW pillar | Rift Angler | Elemental Barrage | Elemental Conga |
| :--- | :--- | :--- | :--- |
| One verb you understand in one second | tap to cast, drag to steer the hook | drag back and release | steer |
| A merge is an event (squish, confetti, tier reveal) | the player drags twins together in the aquarium | the ball tray auto-merges when full | the conga chain merges automatically, 2048-style |
| Two speeds on one screen | active casts plus an aquarium that earns while you watch | aim, then watch the chaos | steer while your dancers auto-fire |
| Stakes without a game over | a cast can't fail | boss checkpoints, never a full reset | respawn keeps part of your chain |
| Scheduled spectacle | a legendary reel at each zone floor, FEVER hauls | a boss every 10 rows, combo FEVER | a world boss every 3 minutes |
| A next goal always on screen | the depth meter with species silhouettes below your line | the next boss row counter | the next head unlock and your rank in the room |

---

## 2. Scorecard and recommendation

| | **Rift Angler** | **Elemental Barrage** | **Elemental Conga** |
| :--- | :--- | :--- | :--- |
| **Genre mix** | depth-fishing arcade × merge aquarium × idle income | Ballz-style volley shooter × monster rows × overflow merge | .io snake × 2048 merge chain × auto-shooter |
| **Core verb** | tap to cast, drag to steer | drag back and release | steer (hold to boost) |
| **Strategy load** | none | minimal (the aim angle, which is a skill) | none |
| **Time to first reward** | ~6 s (first catch) | ~4 s (first kill) | ~3 s (first food), ~10 s (first merge) |
| **Session unit** | 20–30 s cast | 5–10 s turn; a boss about every 2 min | 3–8 min life in an endless room |
| **Playtime lever** | incremental upgrades plus curiosity about the depths | "one more turn" plus forgiving checkpoints | the growth fantasy plus boss events |
| **D1 lever** | **aquarium offline income** plus a daily legend | Daily Barrage plus leaderboard | head collection plus daily missions |
| **Art reuse** | ★★★★★ (families become depth zones) | ★★★★★ (also uses the 14 unused ball sprites) | ★★★★★ |
| **New art (sheets)** | 13–15 | **6–8** | 6–8 |
| **Code reuse** | high | high | medium |
| **Rough time to v1** | ~6–8 wk | **~4–5 wk** | ~7–9 wk |
| **Main risk** | the incremental curve plateaus | reads as "another Ballz clone" | crowded .io genre, bot perception, perf |

These time estimates assume a solo developer who already owns the MIW stack. Use them only to
compare the concepts with each other.

**Recommendation.** Build **Rift Angler**. Among the three, it best combines the three things you
asked for:

- **Playtime:** incremental "number goes up" upgrades nearly every cast, curiosity about what
  lives deeper, and a 50-creature collection.
- **D1:** an idle aquarium that earns while you're away.
- **Easy onboarding:** one tap to cast and one drag to steer.

It also has the strongest thematic fit for the art. Floating elementals with no legs read naturally
as sea creatures, and the 8 families map one-to-one onto 8 depth zones. MIW's favorite moment, the
player dragging a twin onto its twin, stays a hands-on action in the aquarium.

**Elemental Barrage** is the fast, cheap second pick: the smallest art bill, the simplest tech, and
the most proven playtime per week of development. **Elemental Conga** has the highest session-length
ceiling but the most risk.

---

## 3. Concept A — RIFT ANGLER

**Genre mix:** depth-fishing arcade × merge aquarium × idle income
**One-liner:** *Cast into a bottomless rift sea full of cheeky elementals, hook as many as you can
on the way up, and merge your catch into an aquarium that pays you even while you sleep.*
**Player fantasy:** "Every cast is a lucky dip, and my aquarium is my little treasure."
**Comparables:**
- *Ridiculous Fishing* (2013): the descend-then-reel structure.
- *Tiny Fishing*: a long-running web-portal staple that proved the loop of casting, catching on the
  way up, selling, and upgrading line length, catch capacity and offline earnings.

Neither has a **merge collection** or **boss catches**. Those are the two layers MIW's art and code
bring.

### 3.1 Core loop

```
 TAP to CAST ──► lure sinks (see what's down there) ──► DRAG to steer, HOOK on the way up
      ▲                                                            │
      │                                                            ▼
 BUY the glowing upgrade ◄── coins ◄── SURFACE: haul bursts into coins, new-species reveals
      │                                                            │
      └───────────── AQUARIUM: drag twins together → bigger forms → more coins/sec (idle) ◄┘
```

### 3.2 How it plays

- **The angler** is **Golden Talon** (tier 9, the buff golden chick) in a little boat at the top of
  the screen. An existing unit becomes the mascot; only the boat is new art.
- **Cast.** Tap to cast. The lure sinks on its own, fast (2–4 s), past creatures that dodge out of
  the way. The descent is the **anticipation beat**. You see what lives down there, and
  undiscovered species appear as **dark silhouettes**, using MIW's codex silhouettes. You can steer
  on the way down to choose where the ascent starts, but nothing can go wrong.
- **Hook.** At max depth the lure turns and rises. Drag left and right: everything you touch gets
  hooked, up to your capacity, with a pop and MIW's **pitch-climbing combo tick**. Ten quick catches
  in a row trigger **FEVER**: the catches glow gold and are worth 2×.
- **Pests** are MIW's walkers, and they can only cost you a catch, never the cast:
  - the **goblin** swims past and snatches one catch off your line unless you steer away
  - the **slime** is sticky and slows the lure for a moment
  - the **caterpillar** is a sea worm that eats the lowest catch
  - the **dryad** tangles the lure in kelp in the Kelp Grove
- **Legendary catches.** At each zone floor, a **boss** may be waiting. When you hook it, the
  ascent pauses and **REEL!** starts: a 5–8 s tap-mash where the boss HP bar (MIW's component) works
  as the tension meter. Below 30% the boss **enrages** (MIW's enrage flash) and tugs back, so keep
  tapping. Win and it goes on your trophy wall with a big bounty. Lose and it just swims away. No
  penalty.
- **Surface.** The haul flies into the air one creature at a time and bursts into coins that fly to
  the wallet (MIW's coin VFX). A new species gets a **full tier reveal**: "NEW! Bubble Sprite, Tide
  family". Members of the **Sky** family dive at the flying haul; tap them to catch them too. It's a
  short skill beat borrowed from Ridiculous Fishing, and it uses the one family that doesn't live
  underwater.
- **The flying chest** crosses the sky every 2 minutes. Tap it from the surface to hook it.

### 3.3 The Aquarium: MIW's merge grid, made cozy

- The aquarium is a **4×4 MIW merge grid**. After each cast, a catch that matches a resident drops
  into its tank. A new species takes a free slot. The rest are sold.
- **The player's hands-on moment:** twins in the aquarium glow, and you **drag one onto the other**
  to get the family's next form, with the full MIW squish, confetti and tier reveal. There's only
  one possible twin, so there's nothing to plan (casual contract rule 4).
- **Residents earn coins per second**, and higher forms earn exponentially more. Coins rise as
  bubbles you can tap for a small clicker bonus, and they keep piling up offline.
- **There are two paths up every family,** so the codex never stalls. You can catch a deep form
  directly in its zone, or breed it by merging shallow forms. Either way works.
- **Aquarium full** is MIW's "grid full" pressure valve again: merge to make room. The game never
  blocks casting because of it; any overflow is simply sold.

### 3.4 Depth zones: the 8 families become 8 biomes

| Depth | Zone | Family | Why it fits | Floor boss |
| :--- | :--- | :--- | :--- | :--- |
| 0–50 m | Sunlit Shallows | **Tide** (Tide Drop, Bubble Sprite, Mercury Trickster, …) | They're literally water creatures | Slime Tower |
| 50–120 m | Kelp Grove | **Wild** (fae, moth, Bramble Heart, Glowcap Sage, …) | A glowing kelp forest | Worm |
| 120–220 m | Ember Vents | **Ember** (Magma Mote, Phoenix, Obsidian Warlord, …) | Underwater volcanic vents | Fire Dragon |
| 220–350 m | Frost Trench | **Frost** (Frost Whirl, Glacier Guard, Comet Herald, …) | An ice shelf in the deep | Silver Dragon |
| 350–500 m | Sunken Wreck | **Curio** (Chrono Engine, Echo Bell, Spirit Lantern, Mirror Specter, Origami Spirit, …) | **Sunken treasures come alive**, the best fit on this list | Troll of the Wreck |
| 500–700 m | Stone Caverns | **Stone** (Boulder Brute, Crag Colossus, Rune Monolith, …) | Undersea caves | Orc |
| 700–1000 m | The Abyss | **Void** (Nebula Eye, Void Wraith, Dark Matter, Singularity Prime, …) | Deep-sea darkness and cosmic horror | Corrupted elementals as anglerfish-style elites |
| surface | the sky above the boat | **Sky** (Golden Talon's relatives) | Birds diving at the flying haul | — |

Zone floors are named goals ("Fire Dragon lurks at 220 m"), and the depth meter always shows the
next one.

### 3.5 Upgrades: four obvious tracks

These follow Tiny Fishing's proven set, with MIW's upgrade panel and rune frames as the UI:

- **Line Length:** maximum depth, which unlocks zones.
- **Hook Capacity:** the most catches per cast.
- **Aquarium Income:** coins per second, online and offline.
- **Lucky Lure:** a better chance of rare forms and legendary encounters.

The cheapest affordable upgrade always glows. Early on, each cast pays for about one upgrade. That's
the incremental rhythm that drives playtime.

**Baits are the 8 skill icons.** They're free, auto-applied boosts earned from chests and ads, never
a loadout to plan:

| Icon | Bait | Effect |
| :--- | :--- | :--- |
| Meteor | Depth Charge | Everything on screen gets hooked at once |
| Warcry | Frenzy Bait | Creatures swim toward the lure |
| Legion Call | Triple Hook | Three lures for one cast |
| Soul Pact | Twin Catch | Every catch counts double |
| Shield Crest | Pest Guard | Pests can't take catches |
| Executioner's Mark | Legend Sonar | A guaranteed legendary encounter |
| Heal | Strong Line | The legendary reel is easier |
| Revive | Second Cast | A free extra cast |

### 3.6 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | The boat sits on calm water. A ghost hand says "TAP to cast". Tap, and the lure sinks 20 m through the Shallows. |
| ~4 s | The lure turns. The hand says "drag to catch". Three Tide Drops are right in its path, so you hook them with the climbing combo tick. |
| ~10 s | At the surface, the haul bursts into coins and the NEW-species card shows **Tide Drop**. |
| ~15 s | The aquarium slides in with two Tide Drops. A spotlight shows dragging one **onto its twin**. **Merge**, and **Bubble Sprite** is revealed. That's the aha moment, 15 s in. |
| ~25 s | "Line Length +10 m" glows, and its price is exactly what you just earned. Buy it. |
| ~35 s | Cast 2 reaches the Kelp Grove: the first Wild species, and silhouettes of what's deeper. |
| ~60 s | Cast 3 shows a huge shape below your line: "Slime Tower lurks at 50 m". Now the player has a goal. |
| ~3 min | The first legendary reel. |

### 3.7 Why it holds players: playtime

- **The micro-loop is short and always pays.** A cast takes 20–30 s, and early on nearly every cast
  buys an upgrade. It's the "number goes up" compulsion that makes incremental games famously long
  sessions, with no fail state to trigger a rage quit.
- **Curiosity about the depths.** The depth meter and silhouettes below your line ask "what's down
  there?" on every single cast. Each new zone is a new visual world and a new family to catch.
- **A 50-creature collection plus 6 legendaries.** Completing a set is one of the strongest
  voluntary-playtime drivers, and the codex shows exactly what's missing.
- **Two speeds, as in MIW.** Casting is active. Tending the aquarium (tapping coin bubbles and
  merging twins) is a calm rest that still counts as play.
- **Peaks on schedule.** A FEVER haul every few casts, a legendary reel at each zone floor, and a
  flying chest every 2 minutes.

### 3.8 Why they come back: D1

- **The aquarium keeps earning.** "Your aquarium earned 12.4K while you were away", with a
  rewarded 2× claim. This reuses `useOfflineEarnings`, the wave-tiered cap and
  `WelcomeBackModal`. It's the strongest re-open driver in idle games, and it comes nearly for free.
- **The Daily Legend.** Each day one legendary is "in season" with a 3× bounty and a unique trophy
  frame.
- **Unfinished collection.** A codex at 23 of 50 creates a pull, especially with silhouettes one
  zone away.
- The streak calendar (`DailyRewards.vue`) and a battle-pass season (`useBattlePass`).

### 3.9 Long-term (D7+)

- 8 zones and the 6 legendaries, then **New Tide** prestige: restart the depths for pearls, a
  permanent income multiplier. It only unlocks after the Abyss, so it never confuses new players.
- Aquarium decorations (cozy customization) and boat and lure skins.
- Weekly "Big Catch" leaderboards for the heaviest legendary, using the leaderboard stack.

### 3.10 Monetization (playbook-aligned)

- Rewarded **2× haul**, shown before the surface payout (the ad-before-result-screen rule).
- Rewarded **2× offline income**.
- Rewarded **free bait**.
- Rewarded **retry** after a failed legendary reel.
- Interstitials only at the surface moment, at most every ~3–4 minutes. None during the FTUE.

### 3.11 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | **Sea creatures**, aquarium residents and codex entries. Floating bodies with no legs swim naturally with a sine bob. They face right, and mirroring covers left-swimmers. |
| Golden Talon (t9) | The angler mascot |
| 6 walkers | Pests with one behavior each |
| 6 bosses | Legendary catches at the zone floors |
| Corrupted variants | Abyss elites |
| 8 skill icons | Baits |
| Coin, flying chest, chest, trophy | Haul payout, sky reward, bait chests, trophy wall |
| Impact sheets | The hook-pop VFX per element |
| 57 SFX | Includes `water-splash`, `combo-tick`, `new-tier-reveal`, `merge-pop` and `boss-incoming`, all fitting 1:1 |

**New art (13–15 sheets):** 8 vertical zone backdrops (allowed by the brief), the boat, rod, line
and lure (1–2 sheets), and the aquarium tank frame and decor (2–3 sheets). Bubbles and water shimmer
are procedural.

### 3.12 Tech notes

- A vertical-scrolling canvas with 50–150 creatures on sine swim paths and circle hit tests, well
  within the budget of a mid-range phone.
- **Reused:** the aquarium is `MergeGrid.vue` with its drop zones, plus tier reveal, codex,
  offline earnings, upgrade panel, boss HP bar, coin VFX, flying chest, SaveManager, ads,
  platforms and i18n.
- **New:** the cast state machine, zone streaming, the reel mini-game, and swim AI (wander, flee
  the lure, pest behaviors).

### 3.13 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| The incremental curve plateaus | Unlock a new zone every 5–8 min for the first hour. Legendaries break up the grind. New Tide prestige covers the long tail. Balance with a sim of upgrade cost against coins per cast. |
| Offline income outpaces active play | Cap it at 8 h, and keep the offline rate at a fraction of the active rate (the MIW rule). |
| Tiny Fishing clones exist | The differentiators are the merge aquarium, boss reels and the elemental cast. The 10 s preview must show a haul, a merge and a legendary within 5 s. |
| Landscape layout | The sea column stays centered and the aquarium docks on the side. |

### 3.14 Targets and kill criteria

- **Targets:** first catch ≤ 6 s, first merge ≤ 20 s, first upgrade ≤ 30 s, median casts per
  session ≥ 25, average playtime **≥ 15 min**, D1 above MIW's on the same portal.
- **Kill the concept** if greybox playtime is under 10 minutes, or if the number of casts collapses
  when the upgrade cadence slows. That would mean the curiosity and collection layers aren't carrying
  the loop.

---

## 4. Concept B — ELEMENTAL BARRAGE

**Genre mix:** Ballz-style volley shooter × marching monster rows × overflow merge
**One-liner:** *Monsters march down the board row by row. Pull back, release, and a volley of
elemental balls ricochets through them, and when your ball tray overflows, twins merge into
mightier balls.*
**Player fantasy:** "One perfect shot, and the whole board lights up."
**Comparables:** *Ballz* (Ketchapp, 2017) and *Bricks n Balls*. Aim-and-release volleys against
numbered blocks that step down each turn are a staple of casual web and mobile play, with famously
long "one more turn" sessions. Their blocks are faceless numbers; **ours are monsters with faces,
bosses that enrage, and balls that evolve**.

### 4.1 Core loop

```
 DRAG BACK to aim (preview line) ──► RELEASE: the volley streams out, ricochets, damages
      ▲                                                             │
      │                                                             ▼
 tray OVERFLOWS → twins MERGE ◄── +1 ball pickups, coins ◄── monsters die / march one row down
      │
 boss every 10 rows = checkpoint → coins → obvious upgrades → push further
```

### 4.2 How it plays

- **The board** is 7 columns wide, portrait-first. Monsters appear in the top row with **HP
  numbers** (MIW's pooled damage-number system). After each turn, every monster **marches one row
  down**. It's MIW's wave march turned 90°.
- **Aim and release.** At the bottom sits your **launcher**, an elemental of your choice. Drag back
  like a slingshot, and a dotted preview line shows the path up to the first bounce. Release, and
  the whole volley streams out, bouncing off walls and monsters. Every hit deals damage and plays
  that ball's element impact (the impact sheets, throttled). Balls return, and the launcher moves
  to where the first ball landed, the Ballz rule that keeps every turn's angle fresh.
- **The ball tray is MIW's grid pressure, reborn.** "+1" pickups on the board add a rank-1 ball to
  the tray. The tray has a **capacity**. When a pickup overflows it, the **lowest identical pair
  auto-merges**, with MIW's squish, confetti and tier reveal right in the tray. Merges are always
  strictly positive: a merged ball does 2.2× damage and gains its tier's MIW ability:

| Ball tier (MIW ladder) | On-hit ability |
| :--- | :--- |
| T1 Magma Mote | burn (damage over time) |
| T2 Frost Whirl | **knockback: the monster is pushed back up one row** |
| T3 Boulder Brute | pierce: passes through one monster |
| T4 Glacier Guard | freeze: the monster skips its next march |
| T5 Tide Drop | splash to neighbors |
| T6 Crag Colossus | crush: triple damage to double-HP ogres |
| T7 Nebula Eye | chain lightning |
| T8 Void Wraith | poison stacks |
| T9 Golden Talon | Midas: bonus coins per hit |
| T10+ | Phoenix eruption, Obsidian meteor, … up the ladder |

- **This fixes Ballz's biggest late-game problem.** In Ballz, late volleys of 150+ tiny balls take
  forever and turn tedious. Here the tray cap plus overflow merges **keeps the count readable**
  while power keeps rising. It's better pacing, a bounded sprite count for performance, and a merge
  moment every few turns.
- **Monster bricks with personality.** Each walker has one simple rule, and each face flinches and
  squashes when hit:
  - the **slime** is a standard block
  - the **caterpillar** is 2 cells wide
  - the **goblin** hops one column sideways each turn
  - the **ogre** has double HP
  - the **centaur** spits sludge that blocks a cell for a turn
  - the **dryad** heals her neighbors each turn and glows "hit me first", the only
    "priority" read, and an instant one
- **Bosses every 10 rows.** A 3×3 boss block gets MIW's name banner, HP bar and **enrage** at 30%,
  when it marches two rows per turn. Beating it sets a **checkpoint**.
- **Breach, not game over.** If a monster reaches the launcher line, MIW's OVERRUN slow-mo plays.
  Choose between:
  - a rewarded **Meteor Storm**, which clears the bottom 2 rows so you continue (once per
    checkpoint)
  - a restart from the last boss checkpoint, keeping all your coins

  A breach never costs more than about 2–4 minutes. That's MIW's "stakes without a game over".
- **Pickup bubbles** on the board include coins and the 8 skill icons, each triggered by a hit:

| Icon | Effect |
| :--- | :--- |
| Meteor | Rains on every monster |
| Warcry | Next volley ×2 damage |
| Legion Call | +3 ghost balls this turn |
| Soul Pact | Copies your best ball, often an instant merge |
| Shield Crest | Absorbs one breach |
| Executioner's Mark | Executes the toughest monster |
| Heal | Pushes the bottom row back up one row |
| Revive | A free continue |

- **The flying chest** crosses mid-board every 2 minutes. Hit it with a ball to open it.
- **Combo and FEVER.** Hits per volley count up. At 50 hits, **FEVER** makes coins ×2 and turns the
  volley into rainbow balls (`ball-rainbow`).
- **Pacing.** The volley fast-forwards itself after 2 s, and a recall button ends a slow turn.

### 4.3 Meta: obvious tracks and a collection

- **Upgrades**, one obvious glowing track at a time (MIW's upgrade panel): Ball Damage, Tray
  Capacity, Launch Speed, Pickup Luck, Coin Bounty.
- **Launchers:** all 50 elementals, unlocked by coins and chests. They're mostly cosmetic, with
  only a tiny passive such as tinting the first ball's element, so the choice never becomes
  strategy.
- **Ball skins:** the **14 round ball sprites that MIW doesn't ship** (baseball, eye, gear, cactus,
  diamond, lava, obsidian, clover, rainbow, clay pot, amber, stone, glow-rune, target). They're a
  ready-made cosmetic collection in the house style.
- **Modes:** Endless Siege (the main mode), **Daily Barrage** (a seeded board with a leaderboard),
  and later a Boss Rush.

### 4.4 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | One row of 3 slimes with HP 1. A ghost hand drags back and releases. The ball kills a slime at about 3 s. |
| ~10 s | Turn 2. A "+1" pickup sits right in the preview line, so you collect it. |
| ~20 s | Turn 3. The FTUE tray capacity is 2, so the pickup overflows and two Magma Mote balls **merge into Frost Whirl**, with a tier reveal. The next shot knocks a monster back a row, and the ability explains itself. |
| ~40 s | Free upgrade: "Tray Capacity 3". Capacity then grows quickly (4, 6, 8, …), so volleys get bigger fast. |
| ~2:30 | Row 10: the first boss, Slime Tower. The win is scripted to feel big: a coin fountain and a checkpoint banner. |

### 4.5 Why it holds players: playtime

- **Each turn is a 5–10 s cause-and-effect toy.** You aim, it's chaos, you get a payoff. There's
  always a monster about to die, so there's always a reason for one more turn.
- **Mastery without strategy.** The skill is in the aim: bank shots, corners, threading a gap.
  Players get visibly better, which is the long-session engine of the genre.
- **No rage quits.** Boss checkpoints and the no-game-over breach remove the frustration spike
  that ends Ballz sessions.
- **Scheduled peaks.** A boss about every 2–3 minutes, FEVER volleys, and a flying chest every 2
  minutes.
- **The tier ladder still reveals portraits.** Merges climb MIW's 50-portrait ladder, so curiosity
  about the next ball comes along too.

### 4.6 Why they come back: D1

- **Daily Barrage:** a seeded board with a global leaderboard and the rank badge ("Top 12%"),
  using the leaderboard stack and a baked snapshot for Poki and Yandex.
- **A best-row personal record.** "You reached row 84. Can you beat it?"
- **A free timed supply drop.** A chest on a 4 h timer (the MIW roadmap item), plus the streak
  calendar and a battle pass.
- **Launcher and ball-skin collection.**

This is the weakest D1 of the three because it has no idle layer. It's balanced by the
lowest build cost.

### 4.7 Long-term (D7+)

- Endless rows with MIW's **high-wave softening** curve, so there's no wall.
- Boss Rush, seasonal ball skins and achievements.

### 4.8 Monetization

- Rewarded **Meteor continue** at a breach, once per checkpoint.
- Rewarded **2× boss chest**, shown before the result screen.
- Rewarded **+5 starting balls**.
- Interstitials on checkpoint restarts only, never the first two, and at least 3 minutes apart.

### 4.9 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | Launchers, plus ball contents shown inside a glass orb and climbing the ladder |
| 6 walkers | Monster bricks, each with one rule |
| 6 bosses | 3×3 boss blocks every 10 rows |
| Corrupted variants | Elite bricks in later zones |
| Impact sheets and projectiles | Per-element hit VFX |
| 8 skill icons | Pickup bubbles |
| **14 ball sprites** | Ball-skin collection, and `ball-rainbow` for FEVER |
| Coin, chest, flying chest | Rewards |
| 57 SFX | `clash-*`, `explosion-1`, `combo-tick`, `fever-start` and `boss-*` fit 1:1 |

**New art (6–8 sheets):** 3–5 board backdrops, the glass-orb overlay, and the launcher pedestal. The
**smallest art bill of the three**.

### 4.10 Tech notes

- Deterministic circle-against-box ball physics on a fixed step, which Daily Barrage needs for fair
  seeds. There are at most about 30–40 balls, thanks to the tray cap, on a canvas.
- **Reused:** HP numbers from the damage-number pool, MIW's wave HP formulas and softening for row
  HP, boss banner, HP bar and enrage, merge juice and tier reveal, upgrade panel, leaderboard, saves
  and ads.
- **New:** the aim preview (a raycast to the first bounce), the board state machine, and the brick
  rules.

### 4.11 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Reads as "another Ballz clone" | Faces that react to hits, bosses that enrage, and balls that merge and evolve on screen. The preview clip opens on a boss enrage and a merged-ball chain. |
| Aim frustration on mobile | A large drag zone, a fine-aim mode when dragging slowly, and the preview line (whose length is an upgrade) |
| Difficulty tuning | A bot that aims at the best sampled angle runs thousands of boards (the MIW policy-sim method). Tune row HP so a casual bot reaches the row-30 boss |
| Late-game turn tedium | The tray cap, overflow merges, auto fast-forward and recall |

### 4.12 Targets and kill criteria

- **Targets:** first kill ≤ 4 s, first merge ≤ 25 s, first boss ≤ 3 min, retry after a breach
  ≥ 75%, average playtime **≥ 14 min**.
- **Kill the concept** if greybox testers stop aiming deliberately after 5 minutes, meaning they
  just fire straight up. That would mean the board isn't creating shot opportunities.

---

## 5. Concept C — ELEMENTAL CONGA

**Genre mix:** .io snake × 2048 merge chain × auto-shooter
**One-liner:** *Slither.io, where your tail is a conga line of elementals that merge 2048-style, and
every dancer fires at anything that gets close.*
**Player fantasy:** "I started as one tiny droplet. Now I'm the biggest conga in the arena and the
dragon is mine."
**Comparables:** *slither.io* (2016), the template for endless-room, instant-respawn snake games.
Merge-snake hybrids built on 2048's rule exist in the hyper-casual space. None of them adds
**auto-fighting dancers, world bosses and a 50-portrait ladder**.

### 5.1 Core loop

```
 STEER ──► eat essence ──► a rank-1 dancer joins the tail ──► twins MERGE forward (2048)
   ▲                                                                  │
   │                                                                  ▼
 grow, climb the room board ◄── monsters & rivals drop essence ◄── dancers AUTO-FIRE
   │
 world boss every 3 min → everyone converges → boss chest → unlock new heads
```

### 5.2 How it plays

- **The arena** is a large circular top-down map with scattered essence, roaming monster herds, and
  12–16 rival congas.
- **Steering.** On mobile, a one-thumb stick anywhere on screen. On desktop, the pointer. Hold to
  **boost**, which sheds your smallest dancer as food, the slither rule.
- **The chain.** Eating essence fills a meter. Each full meter adds a **rank-1 dancer** at the tail.
  **Equal adjacent tiers merge forward**, 2048-style, with MIW's squish and confetti. First-time
  tiers get a quick, non-blocking tier-reveal banner, because the action doesn't pause. The chain
  stays sorted, biggest near the head, and the **head's tier is your size**. It uses MIW's linear
  ladder: Magma Mote → Frost Whirl → Boulder Brute → … → Singularity Prime.
- **Dancers auto-fire.** Each dancer shoots its element projectile at monsters and rivals in range,
  using MIW's ranged behaviors, projectiles and impacts. Higher tiers hit harder. The conga is a
  moving battery, so MIW's idle-battler pleasure of watching your army work carries over.
- **Collisions are forgiving:**
  - **your head into a rival's body:** if your head's tier is higher than that segment, you bite it
    off and it bursts into essence; otherwise you bounce off with a squash and drop your last
    dancer (a small loss)
  - **head-on:** the higher tier wins, and the loser shatters into an essence fountain; equal tiers
    both bounce
  - **after a shatter:** you respawn instantly, **keeping 30% of your chain** ("comeback"), so a
    death is a setback, never a wipe; a rewarded **revive with your full chain** is offered once
    per life
- **Monsters** are MIW's walkers as herds with simple behaviors, and killing them pays out a lot of
  essence:
  - **goblins** flee
  - **ogres** fight back
  - **slimes** split into two small slimes when they die
  - **dryads** heal their herd
  - corrupted elementals appear as elites
- **World bosses every 3 minutes.** A boss spawns at the map center with MIW's name banner and HP
  bar. Every conga's auto-fire counts, and the **top 3 damage dealers** get a boss chest. At 30% the
  boss enrages. It pulls every player to the same place, creating drama and a peak on a schedule.
- **Map power-ups** come from `usePowerups.ts`, whose five types already exist:
  - **magnet:** essence flies to you
  - **invuln:** Shield Crest
  - **dodge**
  - **slowmo**
  - **push**

  The skill icons join them:

| Icon | Effect |
| :--- | :--- |
| Meteor | Bombards everything nearby |
| Warcry | Fire rate and damage up |
| Legion Call | 3 ghost dancers for 20 s |
| Soul Pact | Duplicates your head, an instant merge up |
| Executioner's Mark | Puts a bounty on the room leader |
| Heal | Restores dancer HP |
| Revive | An automatic revive on your next shatter |

- **FEVER.** A kill streak on monsters triggers FEVER: fire rate ×1.6 and a glowing trail.
- **Rivals are bots**, with names and personalities (greedy, cowardly, hunter). **Be honest about
  it.** Call them "rivals", and never show a fake "players online" count or imply live multiplayer.
  It's a trust issue for players and for portal QA. Real multiplayer (for example Cloudflare Durable
  Objects) is an optional later upgrade, not a launch requirement.

### 5.3 The first 60 seconds (FTUE)

| t | Beat |
| :-- | :-- |
| 0 s | You're a single Magma Mote in a quiet corner, with essence all around. A ghost hand says "steer". The first essence is eaten at about 1 s. |
| ~5 s | The meter fills, and a second Magma Mote joins the tail. |
| ~10 s | A third fills in, and two Motes **merge into Frost Whirl** at the head, with the tier reveal. Your conga visibly grows. |
| ~15 s | A goblin herd wanders past. Your dancers auto-fire, and the goblins burst into an essence fountain. |
| ~30 s | The first rival (a small bot) crosses your path. Your higher-tier head bites its tail. |
| ~60 s | The room board shows you at #9 and climbing. |
| ~3 min | The first world boss: "FIRE DRAGON has appeared!" |

### 5.4 Why it holds players: playtime

- **The growth fantasy is continuous.** There's no level end and no menu between lives. You go from
  droplet to titan in one unbroken session, and each life lasts 3–8 minutes.
- **Merges every few seconds** keep MIW's merge dopamine at action-game speed.
- **World bosses every 3 minutes** turn the endless room into scheduled events, so "stay for the
  next boss" is always the reason to keep playing.
- **Visible status.** The room board and your head's size make progress social and immediate, even
  against bots.
- **Soft deaths.** Keeping 30% of your chain turns "game over, quit" into "back in, get revenge".

### 5.5 Why they come back: D1

- **Head collection.** Reaching a tier in any life for the first time unlocks it as a **head skin**
  ("reach tier 12 to unlock Pink Songbird"). The 50 portraits are 50 visible unlock goals.
- **Daily missions** ("eat 300 essence", "deal the most damage to a boss"), using `useMissions`.
- **A global best-tier leaderboard** and the streak calendar.
- **The Hatchery.** A daily egg that hatches a random trail cosmetic while you're away, as a small
  idle hook.

### 5.6 Long-term (D7+)

- Arena biomes, seasonal boss rotations, trail cosmetics, achievements and a battle pass.
- Optional real multiplayer rooms later.

### 5.7 Monetization

- Rewarded **full-chain revive**, once per life.
- Rewarded **2× boss chest**.
- Rewarded **start at tier 5** head start.
- Interstitials only between lives, at least 3 minutes apart and never during a boss event.

### 5.8 Why the art fits

| Asset | Role |
| :--- | :--- |
| 50 fighters | **Snake heads and dancers.** Floating bodies with no legs are ideal conga dancers: they bob and follow with a small lag. The 50-tier ladder is the chain. |
| 6 walkers | Roaming monster herds, mirrored by heading |
| 6 bosses | World bosses |
| Corrupted variants | Elite monsters and rival heads |
| Projectiles and impact sheets | Dancer auto-fire, 1:1 |
| 8 skill icons plus `usePowerups` | Map power-ups |
| Coin, chest, trophy | Essence pickups, boss chests, leaderboard |
| 57 SFX | Merge, shots, clash, boss and fever audio, 1:1 |

**New art (6–8 sheets):** tileable arena ground for 3–4 biomes, the essence pickup, and the arena
boundary.

### 5.9 Tech notes

- **The 2048 rule bounds performance.** Merging keeps at most about one dancer per tier plus a few
  in transit. Even a huge conga is only about 15–25 sprites long. With 16 congas, monsters and
  projectiles, the whole screen stays around 400–500 sprites on a baked-atlas canvas.
- **Bot AI** uses steering behaviors: seek food, flee bigger heads, hunt smaller tails, converge on
  bosses. Personality weights vary per bot.
- **Reused:** MIW's projectile, status and ability logic, the boss banner, HP bar and enrage, merge
  juice, `usePowerups`, missions, leaderboard, saves and ads.

### 5.10 Risks and mitigations

| Risk | Mitigation |
| :--- | :--- |
| Crowded .io genre | The hooks are auto-firing dancers, merges on screen and world bosses. The preview clip shows a merge chain into a boss kill within 5 s. |
| Bots feel dumb, or get mistaken for real players | Personality AI, and honest "rivals" labeling (§5.2) |
| Deaths frustrate | Keep 30% of the chain, respawn instantly, and offer the revive |
| Mobile steering precision | A large thumb zone, gentle auto-avoid near the arena edge, and a bigger hitbox on your own head for pickups |

### 5.11 Targets and kill criteria

- **Targets:** first merge ≤ 10 s, first monster kill ≤ 15 s, first world boss ≤ 3 min, median
  life ≥ 4 min, average playtime **≥ 15 min**.
- **Kill the concept** if greybox lives are mostly under 2 minutes (deaths too punishing), or if
  players leave right after their first shatter.

---

## 6. How to validate (casual edition)

Use the protocol in [`alternative-concepts.md` §10](alternative-concepts.md). Build a greybox with
shipped art in 5–7 days, run persona playtests with a slow-player policy sim, record a 10 s preview
clip, then run a portal playtest against MIW's baseline. Add one casual-specific gate:

- **Measure strategy load.** Watch the persona playtesters, and log every pause longer than 3 s
  outside a menu. Each pause is either a readability bug (the player couldn't see what to do) or a
  strategy leak (the player had to plan). Either way, fix it before adding content. This is the
  test that keeps the casual contract (§1) honest.
