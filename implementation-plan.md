# Implementation Plan — Merge Legion: Auto-Battler Pivot

**Status:** approved direction — replace all alchemy/brewing gameplay with a
wave-based auto-battler while keeping the merge-grid loop untouched.
**Why:** the cauldron/recipe loop has no catch potential. Merging is the fun
part; what's missing is a *reason* to keep merging and a spectacle that pays it
off. An endless, escalating auto-battle the player feeds units into gives the
merge loop stakes, drama and an infinite difficulty ramp.

---

## 1. Core loop (after the pivot)

```
 SPAWN (charges/gold) ──► MERGE (tier N + N → N+1) ──► DEPLOY (drag into arena)
     ▲                                                        │
     │                                                        ▼
 GOLD ◄── kills × combo × fever × bounty ◄── AUTO-BATTLE vs endless waves
```

The player never stops: charges regenerate → grid fills → merging is the only
way to make room → deploying is the only way to win waves → kills fund spawns
and upgrades → higher waves demand higher tiers → repeat forever.

## 2. What is REMOVED (all alchemy)

| Item | Action |
| :--- | :--- |
| `src/game/recipes.ts` (50 recipes, pages, effects) | deleted |
| `Cauldron.vue`, `InjectionLanes.vue` | deleted |
| `IndexBookModal.vue` (sticker album), `PotionRevealOverlay.vue`, `PotionBottle.vue` | deleted |
| Brew state machine in `usePrismGame` (cauldron, brewing, outcomes, discovery, page milestones, upgrade discount) | removed |
| Lab upgrades heat/pressure/containment | replaced by battle upgrades |
| Persisted fields `prism_index`, `prism_page_rewards`, `prism_discount`, `prism_onboarded` | dropped (orphaned in old blobs, harmless) |
| i18n: `prism.index/reveal/toast/buffs/hintBrew` | replaced by a `battle.*` block |

## 3. What is KEPT (unchanged infrastructure)

- **Merge grid** — 4×4 grid, drag-merge/move pipeline, spawn charges + gold
  spawn cost, `IngredientUnit.vue` SVG characters (they become the fighters).
- **Economy plumbing** — `useEpicConfig` gold wallet, `CoinBadge`,
  `spawnCoinExplosion` fly-to-wallet VFX.
- **Juice systems** — pooled particle engine (`usePrismParticles` +
  `ParticleCanvas`), `useScreenshake`, sounds (`useSound`), music.
- **Platform layer** — SaveManager/strategies, ads (`useAds`), pause, i18n,
  router, all `src/platforms/*`. The single `prism_state` blob stays the save.
- **Automation imp** (`automation` upgrade) — now auto-merges the best pair
  and auto-deploys into the arena instead of injecting into the cauldron.

## 4. The auto-battler

### 4.1 Arena

- The old "lab visualiser" area becomes the **battle arena**: a side-view
  battlefield in normalized coordinates (x: 0..100 left→right, y: 0..100 as a
  depth band rendered with `translate` + z-order by y).
- **Left edge = the Lab Gate** (your base, has HP). **Right edge = enemy
  spawn.** Enemies march left; your fighters intercept.
- Deploying = dragging a unit from the merge grid into the arena (existing
  drop-zone registry). The grid slot empties; a fighter materialises with a
  shockwave ring + screenshake tick.
- **Field merge:** dropping a grid unit onto a deployed fighter of the same
  tier merges *in place* → tier+1 fighter, full heal, big confetti. This keeps
  the merge verb alive inside the arena itself.
- Army cap: **7 fighters** on the field (drop rejected with a shake when full,
  unless it's a field merge).

### 4.2 Fighters — the 10 merge tiers become an army

Stats grow ~2× per tier so merging always feels like a power spike
(`atk = 6·2.05^(t−1)`, `hp = 34·2.0^(t−1)`). Each tier keeps its element and
gets a signature ability — the spectacle scales with the merge ladder:

| Tier | Unit | Role | Signature ability |
| :--- | :--- | :--- | :--- |
| 1 | Living Droplet | fast melee | none — attacks 2× fast |
| 2 | Ember Squirt | melee | **Burn** DoT on hit |
| 3 | Vapor Chunk | ranged | puff shots **knock back** |
| 4 | Bio-Sprout | support melee | every hit **heals** the weakest ally |
| 5 | Pyro-Core | melee AoE | hits **explode** (splash damage + shake) |
| 6 | Acid Gland | melee | **stacking poison** (up to 5 stacks) |
| 7 | Spark Spark | ranged | **chain lightning** to 3 extra targets |
| 8 | Cryo-Shard | ranged | hits **slow**; periodic **freeze nova** |
| 9 | Aurum Paste | melee | **Midas**: bonus gold per hit, 25% crit ×3 |
| 10 | Cosmic Mass | juggernaut | every 6s **black hole**: drags all enemies in + crunches them |

### 4.3 Enemies

New `EnemyUnit.vue` SVG family in the same cartoon style (bold linework,
angry faces), tinted per wave band:

- **Slime** — baseline walker.
- **Runner** — fast, fragile, leaks past your line if you're slow.
- **Brute** — slow tank, hits the gate like a truck.
- **Spitter** — stops at range and lobs globs at your fighters.
- **Warlock** — support caster, pulses heals to nearby enemies (priority target!).
- **Boss** — every 5th wave: a scaled-up named brute with a top HP bar,
  entrance banner, and an **enrage** at 30% HP (speed + red flash).

Scaling: `hp = base·1.16^wave·(1+wave/22)`, `atk` similar; composition mixes in
new archetypes as waves climb. Endless by design.

### 4.4 Waves, gate, defeat

- Wave banner → 3s deploy window → trickle-spawned enemy squad → **wave
  cleared** → gold bonus + banner → next wave. Current wave and best wave
  persist; a reload resumes at the start of the current wave.
- Enemies reaching the gate bash it (per-hit screenshake + cracks). Gate HP
  regenerates 25% between waves.
- **Gate destroyed → "OVERRUN"** overlay, slow-mo, enemies celebrate; the wave
  restarts after 2.5s with the gate repaired. Surviving fighters stay; dead
  ones stay dead (dead fighters are the pressure to keep merging). No hard
  game-over — this is a retention game.

### 4.5 Combo, Fever, Ultimate — the "crazy" layer

- **Kill combo:** every kill within 2.5s of the last raises the combo counter
  (×1…×10). Gold per kill scales `1 + 0.1·combo`. Escalating combo pops
  ("×4!", "×7 RAMPAGE!") with pitch-climbing SFX.
- **FEVER MODE:** combo ≥ 10 ignites 8s of fever — attack speed ×1.6, gold ×2,
  golden screen tint, confetti rain, all damage numbers golden. The dopamine
  spike that makes wild merging pay off.
- **Ultimate — Meteor Storm:** kills charge an ult meter (+6, boss +30). When
  full, a pulsing button unleashes 7 staggered meteors: AoE damage, explosion
  particles, screenshake per impact. Charge persists across waves.
- **Boss kill spectacle:** 0.35× slow-mo for 0.9s, `big` screenshake, coin
  fountain, celebration stinger, bonus gold.
- **Damage numbers:** pooled floating numbers (cap ~36), crits huge and
  yellow, heals green, poison ticks acid-colored.

### 4.6 Economy & upgrades

Gold sources: kills (combo/fever/bounty-scaled), wave-clear bonus, boss bounty,
rewarded "War Chest" (kept from the old free-gold placement). Gold sinks:
spawning past free charges, four battle upgrades (25 levels, exponential cost —
replaces heat/pressure/containment/automation):

| Upgrade | Effect / level |
| :--- | :--- |
| **War Horns** (`attack`) | +6% fighter damage |
| **Vitality** (`vitality`) | +7% fighter max HP (retro-applies) |
| **Bounty** (`bounty`) | +8% gold per kill |
| **Imp Sergeant** (`automation`) | imp merges best pair / deploys highest tier, faster per level |

Rewarded ads kept: War Chest (free gold, scaled by wave) and a **2× wave
bonus** offer after boss waves.

### 4.7 Persistence (inside the single `prism_state` blob)

- Kept: `prism_grid`, `prism_max_tier`, `epic_coins`, `prism_stats`
  (reshaped: kills, waves, bossKills, merges, spawns, fieldMerges).
- New: `battle_upgrades` `{attack,vitality,bounty,automation}`,
  `battle_wave`, `battle_best_wave`, `battle_army` (deployed tiers, restored
  at full HP on load), `battle_ult` (ult charge).

## 5. Technical architecture

### New / rewritten files

| File | Role |
| :--- | :--- |
| `src/game/units.ts` | fighter + enemy archetype tables, stat formulas, wave composer |
| `src/use/useBattle.ts` | the engine: RAF loop with fixed-step logic (30 Hz), timescale (slow-mo), targeting, movement, melee/projectiles, status effects (burn/poison/slow/knockback), combo/fever, ult, gate, wave lifecycle, persistence. Module singleton like `usePrismGame`. |
| `src/components/organisms/BattleArena.vue` | renders the battlefield. Vue owns mount/unmount of fighters/enemies/projectiles; per-frame `transform`/HP-bar writes go **directly to the DOM** via a `Map<id, HTMLElement>` (no reactive churn at 60 fps). Damage-number pool, banners, gate, boss bar, ult button, fever overlay. |
| `src/components/organisms/EnemyUnit.vue` | SVG enemy archetypes |
| `src/components/organisms/UpgradePanel.vue` | rewritten for the four battle upgrades |
| `src/use/usePrismGame.ts` | slimmed: grid/spawn/merge/move + stats + imp (now targets the arena) |
| `src/views/GameScene.vue` | rewired: arena on top, grid below; deploy drop zone; kill→coin VFX; wave HUD |

### Performance guardrails

- Logic at fixed 30 Hz steps inside one RAF; render interpolation not needed at
  this art style. Entity caps: 7 fighters / 24 enemies / 24 projectiles.
- Particles stay in the existing fixed pool; damage numbers pooled DOM nodes.
- All hot-path DOM writes bypass Vue reactivity; Vue only patches on
  spawn/death (shallow array bump).

### Audio

`clash-1..5.ogg` + `explosion-1.ogg` already exist in `src/assets/audio/sfx`
but not in `public/audio/sfx` (where `useSound` loads from) → copy them over.
Attacks use randomized clash variants with tier-pitched playback; meteors and
pyro splashes use the explosion.

### i18n

New `battle.*` block in `en.ts`. Per the documented project convention
(en.ts header comment: game-namespace strings are en-only, other 20 locales
fall back via `fallbackLocale`), the battle strings ship in English only —
same as the `prism.*` block being replaced. Obsolete `prism.*` sub-keys are
pruned; grid-related keys (`spawn`, `spawnCost`, `gridFull`, `hintDrag`,
`freeGold`) stay.

## 6. Step-by-step execution order

1. **implementation-plan.md** (this file).
2. `src/game/units.ts` — data + formulas.
3. `src/use/useBattle.ts` — engine.
4. `EnemyUnit.vue`, `BattleArena.vue` — rendering.
5. Rewrite `usePrismGame.ts`; rewrite `UpgradePanel.vue`.
6. Rewrite `GameScene.vue`; update `keys.ts`, `en.ts`.
7. Delete the six alchemy files; copy sfx.
8. Verify: `vue-tsc`, `vitest run`, live browser run (merge → deploy → clear
   wave 1-3, boss on 5, fever, ult, overrun path).

## 7. Out of scope (deliberate)

- Localising battle strings into the 20 non-English locales (follows the
  existing roadmap item for the whole game namespace).
- New art/audio assets beyond what ships in the repo.
- PvP, formations/lanes UI, unit inventory between sessions beyond the army
  snapshot, meta-progression trees — all future candy.
