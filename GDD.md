# Game Design Document: Merge Idle War
**Document Version:** 2.0.0
**Target Platform:** Mobile-First (iOS / Android), Responsive Tablet & Web Browsers
**Genre:** Hybrid-Casual Merge / Idle Auto-Battler

---

## 1. Executive Summary & Core Concept

### 1.1 Project Overview
*Merge Idle War* is a mobile-first hybrid-casual title where players merge living elemental units and deploy them into an endless, wave-based auto-battle. Spawned recruits are combined on a merge grid (tier N + tier N → tier N+1) and dragged onto the battlefield, where they fight escalating enemy waves on their own. Kills fund more spawns and permanent upgrades; higher waves demand higher tiers. The game prioritizes high-satisfaction visual "juice," tactile drag-and-drop feedback, and an infinite difficulty ramp with no hard game-over.

> **v2.0 pivot note:** All alchemy gameplay from v1.0 (cauldron, injection lanes, brewing, recipes, potion index book, heat/pressure/containment upgrades) has been removed and replaced by the auto-battler described here. Merging was always the fun verb; the battle gives it stakes, spectacle, and a reason to never stop.

### 1.2 Core Pillars
* **Tactile Satisfaction ("Juice"):** Every merge, deploy, hit, kill, and explosion must feel rewarding through explosive visual effects, bouncy animations, screenshake, floating damage numbers, and crisp haptics.
* **Escalation-Driven Loop:** An endless wave ladder, kill combos, FEVER mode, and a screen-clearing ultimate turn steady merging into escalating dopamine spikes. There is always a bigger wave, a bigger boss, a higher tier.
* **Responsive, Mobile-First Accessibility:** Interfaces are engineered to feel native on smartphones while scaling gracefully via flexible layout units across tablets and desktop browsers without horizontal layout breaking or asset squashing.

### 1.3 The Core Loop

```
 SPAWN (charges/gold) ──► MERGE (tier N + N → N+1) ──► DEPLOY (drag into arena)
     ▲                                                        │
     │                                                        ▼
 GOLD ◄── kills × combo × fever × bounty ◄── AUTO-BATTLE vs endless waves
```

The player never stops: spawn charges regenerate → the grid fills → merging is the only way to make room → deploying is the only way to win waves → kills fund spawns and upgrades → higher waves demand higher tiers → repeat forever.

---

## 2. Technical Requirements & Responsiveness

### 2.1 Viewport-Driven Scaling Architecture
To eliminate layout distortion, squashing, or broken text wrapping across diverse aspect ratios (from long aspect ratios like 19.5:9 on modern phones to 4:3 on tablets), the game layout relies strictly on Viewport Width (`vw`) and Viewport Height (`vh`) units.

* **Fixed Coordinates Defeated:** No layout boundaries are defined using hardcoded pixel (`px`) constraints.
* **Aspect Ratio Safe-Zones:** The active gameplay field is kept within a central canvas scaled dynamically using CSS variable tricks or canvas bounding bounds linked to viewport dimensions.
* **Normalized Arena Space:** The battlefield simulation runs in normalized coordinates — x: `0..100` (gate → enemy spawn), y: `0..100` (depth band rendered via `translate` with z-order by y) — so the same simulation renders correctly at any viewport size.

### 2.2 Fluid Scaling Constants
* **Typography:** Title texts are scaled at `4.5vh` to `5.5vh`, body texts at `1.8vh` to `2.2vh` to guarantee readable line wraps regardless of hardware resolution.
* **Grid Scaling:** The merge grid scales organically inside flexboxes / percentage column blocks; individual slots derive their size from the container, never from fixed pixels.

---

## 3. Core Gameplay Loop & Mechanics

### 3.1 The Merge Grid
The primary input area is a **4×4** tile grid (16 slots) where units are spawned and merged.

* **Spawning (tap-metered, free):** Players tap the "Spawn" button to place a Tier 1 recruit into a random empty slot.
    * **Normal state:** **4 taps** per recruit — a pip meter next to the button fills per tap (with a pitch-climbing tick). The tap friction paces recovery after a wave wipes the army instead of a gold cost.
    * **Instant Spawn buff (rewarded ad):** an ad button left of the Spawn button grants **2 minutes of 1-tap spawns**. While active the Spawn button and pip turn gold and the ad button becomes a m:ss countdown chip. The buff expiry persists across reloads.
* **The Merge Action:** Dragging a unit of Tier N over another identical unit of Tier N merges them instantly into a single unit of Tier N+1. Units can also be moved to empty slots.
* **Grid Pressure:** A full grid blocks spawning ("Grid full — merge or deploy to make room!"), making merge/deploy the pressure valve.
* **Visual Polish:** Upon release, merging units execute a squish animation (shrink, then pop outward with confetti particles before settling back to native size). The highest tier ever reached is tracked and persisted.

### 3.2 The Unit Roster — 10 Merge Tiers Become an Army
Each tier keeps its elemental identity and anthropomorphic face design (bold-linework SVG characters). Stats roughly double per tier so every merge is a felt power spike:

* **Attack:** `atk = round(6 · 2.05^(tier−1))` (with per-tier tweaks)
* **Health:** `hp = round(34 · 2.0^(tier−1))` (with per-tier tweaks)

| Tier | Unit | Element | Role | Signature Ability |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Living Droplet | Water / Base Fluid | fast melee | None — attacks 2× fast (0.55s interval), fastest walker |
| **2** | Ember Squirt | Minor Thermal | melee | **Burn** — damage-over-time on hit |
| **3** | Vapor Chunk | Pressure / Gas | ranged | Puff shots **knock back** the target |
| **4** | Bio-Sprout | Organic / Flora | support melee | Every hit **heals** the weakest ally (+15% base HP) |
| **5** | Pyro-Core | High Thermal / Fire | melee AoE | Hits **explode** — splash damage + screenshake |
| **6** | Acid Gland | Corrosive | melee | **Stacking poison** (fast 0.9s attacks, −15% atk) |
| **7** | Spark Spark | Electrical Volatility | ranged | **Chain lightning** arcs to extra targets |
| **8** | Cryo-Shard | Sub-Zero Thermal | ranged | Hits **slow**; periodic **freeze nova** |
| **9** | Aurum Paste | Catalyst | melee | **Midas** — bonus gold per hit, high crit |
| **10** | Cosmic Mass | Dark Matter | juggernaut | Periodic **black hole** — drags all enemies in and crunches them (+30% HP, 1.35× render scale) |

Ranged units (Tiers 3, 7, 8) hold position at 32–38 arena-unit range and fire homing projectiles; melee units close to ~9 units and lunge with a strike animation.

### 3.3 Deployment & The Battle Arena
* **The Arena:** A side-view battlefield above the merge grid. **Left edge = the Lab Gate** (the player's base, with HP). **Right edge = enemy spawn.** Enemies march left; fighters intercept.
* **Deploy:** Dragging a unit from the merge grid into the arena removes it from the grid and materializes a fighter with a shockwave ring and screenshake tick.
* **Field Merge:** Dropping a grid unit onto a **deployed fighter of the same tier** merges *in place* → a tier+1 fighter at **full heal**, with big confetti. This keeps the merge verb alive inside the arena itself and is the primary mid-battle healing tool.
* **Army Cap:** Maximum **7 fighters** on the field. Drops beyond the cap are rejected with a shake bounce — unless the drop is a valid field merge.

---

## 4. Enemies, Waves & Defeat

### 4.1 Enemy Archetypes
A family of cartoon SVG walkers in the same bold-linework style, each with distinct silhouettes and behavior. Multipliers apply to the wave-scaled baseline:

| Enemy | Role | HP × | ATK × | Speed | Bounty × | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Slime** | baseline walker | 1.0 | 1.0 | 8.5 | 1.0 | The bread-and-butter threat |
| **Runner** | fast & fragile | 0.55 | 0.8 | 17 | 0.8 | Leaks past a slow defense line |
| **Brute** | slow tank | 3.1 | 2.2 | 5.5 | 2.6 | Hits the gate like a truck (1.35× scale) |
| **Spitter** | ranged | 0.85 | 1.15 | 8 | 1.5 | Stops at range 30 and lobs globs at fighters |
| **Warlock** | support caster | 1.3 | 0.7 | 6.5 | 3.0 | Pulses heals to nearby enemies — priority target |
| **Boss** | every 5th wave | 20 | 4.5 | 4.2 | 22 | Named, 2.3× scale, top HP bar, **enrage** below 30% HP (+50% speed, +43% attack rate, red flash) |

Boss names cycle through a fixed roster (*GLORP THE DEVOURER, KING SLUDGEFIST, MAWZILLA, THE GATE-EATER, GRUMBLOR PRIME*) with a "+N" suffix once the list wraps.

### 4.2 Wave Scaling (Endless by Design)
Baseline enemy stats grow exponentially so the ladder never ends:

* **HP:** `26 · 1.16^(wave−1) · (1 + wave/22)`
* **ATK:** `5 · 1.13^(wave−1) · (1 + wave/30)`
* **Kill bounty:** `6 · 1.09^(wave−1)` gold (× archetype multiplier)
* **Wave-clear bonus:** `30 · 1.11^(wave−1) + wave·6` gold

Tuning target: fighter tier ≈ wave/3 keeps up.

### 4.3 Wave Composition
* Squad size grows `4 + wave·1.25`, capped at 22 enemies, trickle-spawned with random timing jitter and a mid-wave breather every ~7 spawns to create attack "pulses."
* Archetypes mix in as waves climb: **Runners** from wave 3, **Spitters** from wave 5, **Brutes** from wave 7, **Warlocks** from wave 9.
* **Boss waves** (every 5th) spawn the boss plus a light escort of slimes/runners.

### 4.4 Wave Lifecycle, Gate & Defeat
* **Flow:** Wave banner → **3.5s deploy countdown** → trickle-spawned enemy squad → **wave cleared** → gold bonus + banner → next wave. Current wave and best wave persist; a reload resumes at the start of the current wave.
* **The Lab Gate:** 100 HP. Enemies reaching it bash it with per-hit screenshake and visible cracks. The gate **regenerates 25% between waves**.
* **Gate destroyed → "OVERRUN":** slow-mo overlay, enemies celebrate, and after **2.5 seconds** the wave restarts with the gate repaired. Surviving fighters stay; **dead fighters stay dead** — that loss is the pressure to keep merging. There is **no hard game-over**; this is a retention game.

---

## 5. Combo, Fever & Ultimate — The Spectacle Layer

### 5.1 Kill Combo
Every kill within **2.5 seconds** of the last raises the combo counter. Gold per kill scales `× (1 + 0.1 · combo)` (combo capped at 99). Escalating combo pops ("×4!", "×7 RAMPAGE!") fire with pitch-climbing SFX.

### 5.2 FEVER MODE
Reaching **combo 10** ignites **8 seconds** of fever:
* Attack speed **×1.6** for all fighters.
* All gold (kills *and* wave-clear bonuses) **×2**.
* Golden screen tint, confetti rain, golden damage numbers.

Fever is the dopamine spike that makes wild merging and aggressive deploying pay off.

### 5.3 Ultimate — Meteor Storm
Kills charge an ult meter (**+6 per kill, +30 per boss**, max 100). When full, a pulsing button unleashes **7 staggered meteors**: AoE damage, explosion particles, and screenshake per impact. Charge persists across waves and reloads.

### 5.4 Boss Kill Spectacle
Slow-mo timescale drop, big screenshake, coin fountain, celebration stinger, and a fat bounty (22× baseline).

### 5.5 Damage Numbers
Pooled floating numbers (capped pool): crits huge and yellow, heals green, burn ticks orange, poison ticks acid-colored, Midas gold pings golden.

---

## 6. Economy & Upgrades

### 6.1 Gold Sources
* Enemy kills (bounty × combo × fever × Bounty upgrade).
* Wave-clear bonuses (× fever × Bounty upgrade).
* Boss bounties.
* **War Chest** — rewarded-ad placement granting free gold scaled by progress: `400 · (1 + wave · 0.12)`.
* **2× Boss Bounty** — rewarded-ad offer after boss kills to double the payout.
* *(Non-gold rewarded placement:)* **Instant Spawn** — 2 minutes of 1-tap spawning (see §3.1).

### 6.2 Gold Sinks
* The four battle upgrades (spawning is free — paced by the 4-tap meter instead).

### 6.3 Battle Upgrades
Four permanent upgrades, **25 levels** each, exponential cost `round(base · growth^level)`:

| Upgrade | Effect per Level | Base Cost | Growth |
| :--- | :--- | :--- | :--- |
| **War Horns** (`attack`) | +6% fighter damage | 60 | ×1.55 |
| **Vitality** (`vitality`) | +7% fighter max HP (retro-applies: standing army is healed by the delta) | 55 | ×1.52 |
| **Bounty** (`bounty`) | +8% gold per kill & wave bonus | 80 | ×1.60 |
| **Imp Sergeant** (`automation`) | Unlocks the automation imp; each level speeds it up | 130 | ×1.72 |

### 6.4 Automation (The Imp Sergeant)
The idle engine. Once unlocked, an imp acts on a cadence of `4200 / (1 + 0.22 · level)` ms (floor 700 ms), each tick doing the best available action:
1. **Merge** the best identical pair on the grid.
2. Otherwise, **deploy** the highest-tier grid unit into the arena (if the army has room).

This lets the loop run hands-off while the player watches the battle — crucial for idle progression.

---

## 7. Comprehensive UI/UX Specification

### 7.1 Art Style & Visual Direction
The visual signature is **Vibrant Stylized Vector Cartoon** with bold, heavy black linework (`3px` to `5px` equivalent strokes). Fighters and enemies are inline SVG characters with saturated bodies, expressive faces, and per-tier glow colors. Backgrounds are desaturated so actionable components (buttons, units, projectiles, gold) pop instantly.

### 7.2 Interface Layout (Mobile-First Canvas)

```
┌────────────────────────────────────────────────────────┐ ◄─── Top HUD
│ Wave 12  ⚔ Best 18            [Gold Counter] 14.52K    │      wave banner / boss HP bar
├────────────────────────────────────────────────────────┤ ◄─── BATTLE ARENA
│ ▓▓ GATE                                    enemy spawn │      side-view battlefield:
│ ▓▓ (HP)   [T5]►  [T3]►        ◄[slime] ◄[brute]        │      fighters ← → enemies,
│ ▓▓        [T7]►          ◄[runner]                     │      projectiles, damage numbers,
│           …drag grid units here to deploy…             │      meteors, fever overlay
├────────────────────────────────────────────────────────┤ ◄─── Upgrade Controls Panel
│ [War Horns 4] [Vitality 2] [Bounty 3] [Imp Sgt 1]      │      + Ultimate button (pulses when full)
├────────────────────────────────────────────────────────┤ ◄─── Merge Grid Panel (4×4)
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                            │
│ │ T1 │ │    │ │ T5 │ │    │   [ SPAWN (⚡3/5) ]        │      drag to merge / move /
│ └────┘ └────┘ └────┘ └────┘   [ War Chest 🎁 ]         │      deploy into the arena
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                            │
│ │ T2 │ │ T2 │ │ T10│ │    │                            │
│ └────┘ └────┘ └────┘ └────┘                            │
└────────────────────────────────────────────────────────┘
```

### 7.3 Key HUD Elements
| Element | Behavior |
| :--- | :--- |
| **Wave banner** | Slides in on wave start; boss waves get an entrance banner with the boss name |
| **Boss HP bar** | Top bar with name; flashes red on enrage |
| **Gate HP bar** | On the gate; cracks appear as HP drops |
| **Combo pop** | Center-screen escalating "×N!" pops |
| **Fever overlay** | Golden tint + confetti rain while active |
| **Ultimate button** | Fills with kill charge; pulses and glows when ready |
| **Spawn button** | Shows free charges (⚡N/5) or gold cost when empty |
| **Gold counter** | `##.##K / ##.##M` formatting; kill payouts fly to the wallet as coin VFX |

All user-facing UI strings are routed through i18n (`battle.*` namespace; game-namespace strings ship in English with locale fallback per project convention).

---

## 8. Technical Architecture

### 8.1 Engine
* `src/game/units.ts` — fighter + enemy archetype tables, stat formulas, wave composer.
* `src/use/useBattle.ts` — the auto-battle engine: single RAF with **fixed 30 Hz logic steps**, timescale for slow-mo drama, targeting, movement, melee/projectiles, status effects (burn / poison / slow / knockback / stun), combo/fever, ultimate, gate, wave lifecycle, upgrades, persistence. Module-level singleton.
* `src/components/organisms/BattleArena.vue` — renders the battlefield. Vue owns mount/unmount of entities; per-frame transform/HP-bar writes go **directly to the DOM** (no reactive churn at 60 fps). Damage-number pool, banners, gate, boss bar, ult button, fever overlay.
* `src/use/usePrismGame.ts` — merge grid: spawn/merge/move, spawn charges, stats, and the automation imp (which targets the arena).

### 8.2 Performance Guardrails
* Entity caps: **7 fighters / 24 enemies / 24 projectiles**.
* Particles use the existing fixed-size pooled particle engine; damage numbers are pooled DOM nodes.
* All hot-path DOM writes bypass Vue reactivity; Vue only patches on spawn/death (shallow-ref array bumps).
* Discrete events (hits, deaths, meteors, …) flow through an event sink that the view drains for numbers / particles / SFX.

### 8.3 Persistence
All state lives in the single **`merge-idle-war_state`** blob (SaveManager + platform strategies handle local/cloud sync):

| Key | Contents |
| :--- | :--- |
| `prism_grid` | the 16 grid slot tiers |
| `prism_max_tier` | highest tier ever merged |
| `epic_coins` | gold wallet |
| `prism_stats` | kills, waves, bossKills, merges, spawns, fieldMerges |
| `battle_upgrades` | `{ attack, vitality, bounty, automation }` levels |
| `battle_wave` / `battle_best_wave` | current & best wave (resume at start of current wave) |
| `battle_army` | deployed fighter tiers (restored at full HP on load) |
| `battle_ult` | ultimate charge |

A cleared wave checkpoints the save immediately (real progress → flush now).

---

## 9. Audio (SFX Manifest — shipping in `public/audio/sfx/`)

Battle sounds use randomized variants with tier-pitched playback:

* **`clash-1..5.ogg`** — melee hits, randomized per strike.
* **`explosion-1.ogg`** — meteors, pyro splashes, black-hole crunches.
* **`chainsaw-break.ogg`** — gate damage / overrun accents.
* **`coin-pickup.ogg`** — gold payouts.
* **`celebration-1..3.ogg`**, **`win.ogg`**, **`happy.ogg`** — wave clears, boss kills, fever ignition.
* **`level-up.ogg`** — merges / upgrades.
* **`lose.ogg`** — overrun.
* **`modal-open.ogg`**, **`reward-continue.ogg`** — UI and rewarded-ad flow.

---

## General
In GENERAL for all work: Do your work on an ultra high-fidelity basis, don't do just good enough! that's important. Make the interactions feel real good,
add vfx juice where applicable (take care of optimizing to not overload the CPU/GPU).
Don't take shortcuts to save on tokens or implementation time.

The game starts right into the first scene and has no usual main-menu.

The game needs to be fully responsive (all mobile orientations, min portrait sizes: 320x658px, tablet and desktop sizes) and optimized for mobile portrait and landscape play,
but also tablets and desktop (up to fullscreen). Don't use fixed pixel values if possible, use percentage or vw and vh to define size relations.
Take safe-area into account. Take into account that images are
not selectable like in normal web environments, but allow drag and click events to perform game logic.
Follow web-game standards: fast jump into the game by optimizing hot-path loading and delaying uncritical assets until after
the game has started to show.

Save all state variables in one object named `merge-idle-war_state`.

---

## After implementing the game -> Roadmap
create a roadmap(min 15 features/action points, sorted by highest impact, best performance, highest game feel improvements)
for future features that would increase the Day1 retention, the average playtime, the easy-to-pickup and hard-to-put-down
metrics, that increase conversion of new players with actionable implementations suggestions. So that I can tackle these features later if I value them benefical.
