# Art TODO — drop-in bitmap assets

**How it works:** drop a file at the exact path below → it is auto-detected and rendered on the next page load (no code change, no rebuild for `public/`). Until the file exists — or if it fails to decode — the current procedural SVG/CSS art keeps rendering, so nothing can break.

**Rules**
- Format: `.webp` preferred (`.png` also probed as a fallback extension).
- Characters/props: **transparent background**, square canvas, subject fills ~90% (the engine scales per tier/kind).
- Style: vibrant stylized vector cartoon, bold black outlines (3–5px at 256px), saturated colors — match the existing SVG units.
- Facing: fighters march right → draw fighters facing **right**; enemies march left → draw enemies facing **left**.

## Repainting through the art pipeline (art-generation-pipeline skill)

Every slot below already ships a painting. The pipeline is for **re-rolls,
restyles and new art registered against what ships**, so a repaint drops in at
the same size and place. The key → path table is `src/game/artCatalogue.ts`;
the manifest (what each drawable is, its lattice, its prompt text) is
`src/game/artSheet.ts`. The prompt text is only ever edited there.

| Step | Command | What it does |
| :--- | :--- | :--- |
| 1 | `pnpm dev` → `/#/art-sheets` → **Export all sheets** (or `pnpm art:export` with the dev server up) | Lays each reference on magenta, measures its box, writes `art-sheets/<id>.png`, `-key.png` for 3×3 sheets, `sheet-index.json` and `PROMPTS-*.md`. Only needed again when the SHIPPED art or the manifest's lattice changes. |
| 2 | `pnpm art:prompts` | Rewrites the prompt docs (byte-identical to the bench's) and `art-sheets/PAINT-STATUS.md`. `--check` for CI. |
| 3 | paint | Attach `art-sheets/<id>.png`, paste its fenced block from the named `PROMPTS-*.md`, and save the return into `art-sheets/painted/` under that id (any extension). Or run the whole loop from **`pnpm art:desk`** (http://127.0.0.1:5178). |
| 4 | `pnpm art:slice` (`-- --dry` first) | Keys the magenta, registers the return onto the reference's measured box, and writes `public/<target>.webp`. 3×3 sheets are composed back into their grid. It refuses a re-composed grid, and refuses a painting whose reference was re-cut since. |
| 5 | `/#/playground` | Every drawable through the game's own components. **Painted ⇄ Drawn** flips the art layer live. |
| 6 | `pnpm art:measure cells`, `pnpm art:status` | Registration arithmetic (sliced vs measured box), and which drop-ins are on disk. |

The art flag: painted art is **on** by default. `VITE_ENABLE_ART_OVERRIDES=false`
turns it off in any build. `?art=off|on` and `__art.on()/.off()/.refresh()/.status()`
work in dev only.

Known on the shipped art (found by `pnpm art:measure`): the 3×3 VFX sheets have a
baked 1–2 px opaque grey rim around the outer edge of the whole sheet. The bench
strips it from the references; a re-slice through the pipeline removes it from the
art.

## Fighters (11 tiers) — `public/images/units/`
One per merge tier, 256×256. A tier badge is overlaid automatically (bottom-right corner stays clear-ish). Names below are the internal descriptors; the in-game display names live in i18n (`battle.codex.names.t<tier>`).

| File | Character | Look |
| :--- | :--- | :--- |
| `fighter-1.webp` | Magma Mote | fiery molten ball, furious flame face, lava-rock base `#ff6a1f` |
| `fighter-2.webp` | Frost Whirl | icy whirlwind / frost golem head, glowing pale eyes `#bcd9ec` |
| `fighter-3.webp` | Boulder Brute | brown rock boulder, angry face, stubby stone fist `#8a7358` |
| `fighter-4.webp` | Glacier Guard | blue ice-crystal golem, horned, crystalline fists `#bfe6ff` |
| `fighter-5.webp` | Tide Drop | blue living water droplet, furrowed brow, splash drips `#2f9fe0` |
| `fighter-6.webp` | Crag Colossus | full-body rock golem, glowing orange eyes, boulder arms `#6e5c48` |
| `fighter-7.webp` | Nebula Eye | cosmic nebula swirl set in a stone frame, teal/purple `#5b3fb0` |
| `fighter-8.webp` | Void Wraith | dark shadow creature, glowing purple eyes, wispy tendrils `#2a1c3a` |
| `fighter-9.webp` | Golden Talon | golden buff chick, angry brow, muscular wing-arms `#ffcf2e` |
| `fighter-10.webp` | Phoenix Sovereign | fiery phoenix bird, orange/red flaming feathers, fire claws `#ff5a1f` |
| `fighter-11.webp` | Obsidian Warlord | volcanic rock demon, horned, flame crest, glowing orange eyes + stone fists `#3a4250` |

**Higher tiers 12–15** (`fighter-12..15.webp`) — art wired, but these live off the
extrapolation helpers (`getFighterDef` / `getIngredient`), **not** the codex, so
they need no i18n. Behaviour: **12 & 14 melee**; **13 ranged** reusing tier-8
**shadow** projectile+impact VFX; **15 ranged** reusing tier-7 **cosmic** VFX.
Stats climb off the formula, colours/SVG-fallback reuse tier-11. Tiers 16–20
ship painted art the same way.

**The elemental tiers 21–50** (`fighter-21..50.webp`) — ⬜ no painting yet. Thirty
new FLOATING elementals (no legs, no feet): each is drawn procedurally in
`src/game/elementalArt.ts`, which is both the in-game look until its file lands
and the pipeline REFERENCE (`/#/art-sheets` → `art-sheets/unit-fighter-<tier>.png`;
the prompts, marked as new designs, are in `PROMPTS-UNITS.md`). Colours, element
and name per tier: `ELEMENTALS` in `ingredients.ts`; role per tier: `HIGH_TIER_DEFS`
in `units.ts`. Ranged ones reuse the existing projectile/impact art by element.

| Tier | Name | Element | Tier | Name | Element |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 21 | Steel Sentinel | steel | 36 | Glitch Cube | corrupt data |
| 22 | Mercury Trickster | quicksilver | 37 | Echo Bell | resonance |
| 23 | Lodestone Tyrant | magnetism | 38 | Spirit Lantern | soulfire |
| 24 | Amber Warden | fossil amber | 39 | Mirror Specter | living glass |
| 25 | Dune Djinn | sand | 40 | Ruby Heart | ruby |
| 26 | Caustic Flask | acid | 41 | Frostfire Wisp | cold flame |
| 27 | Bramble Heart | thornwood | 42 | Diamond Paragon | diamond |
| 28 | Coral Monarch | coral | 43 | Plasma Dynamo | plasma |
| 29 | Glowcap Sage | fungus | 44 | Comet Herald | comet ice |
| 30 | Stormcloud Fury | thunderhead | 45 | Aurora Seraph | polar light |
| 31 | Jade Oracle | jade | 46 | Solar Emperor | stellar fire |
| 32 | Rune Monolith | runestone | 47 | Wishing Star | starlight |
| 33 | Chrono Engine | clockwork | 48 | Pulsar Beacon | neutron star |
| 34 | Origami Spirit | paper | 49 | Dark Matter | dark matter |
| 35 | Bubble Sprite | soap film | 50 | Singularity Prime | black hole |

## Enemies — `public/enemies/` (256×256, facing **left**)
✅ **DONE** — bitmap over the SVG fallback; enrage red-flush stays CSS. The 5 walker
archetypes keep their stats/behaviour; the sprite is just the look. `slime` also
picks a random alternate (`caterpillar`) per spawn for variety.

| Archetype | Sprite (`public/enemies/…`) | Note |
| :--- | :--- | :--- |
| slime | `slime2_256x256` + `caterpillar_256x256` (random variant) | blue blob; ~half of slimes show the caterpillar |
| runner | `goblin_256x256` | fast lean imp |
| brute | `ogre_256x256` | heavy rock golem |
| spitter | `centaur_256x256` | ranged lobber — centaur-as-archer is a loose fit, easy to reassign |
| warlock | `dryad_256x256` | nature caster (heal pulse) |

## Bosses — `public/enemies/bosses/` (256×256)
✅ **DONE** — one sprite per boss wave (every 5th). Waves past 30 **reuse** these,
darkened via CSS; bosses on **wave 15+** get a drifting smoke VFX behind them.

| Boss wave | Sprite (`public/enemies/bosses/…`) |
| :--- | :--- |
| 5 | `slime-tower_256x256` |
| 10 | `orc_256x256` |
| 15 | `fire-dragon_256x256` |
| 20 | `troll_256x256` |
| 25 | `worm_256x256` |
| 30 | `silver-dragon_256x256` |
| 35, 40, … | cycles the six above, darkness-tinted (add more sprites to extend) |

## Environment — `public/images/arena/` & `public/images/grid/`

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `arena/arena-bg.webp` | ~1024×512, opaque | ✅ **DONE** — side-view battlefield ground/backdrop | CSS gradient + faint grid lines |
| `arena/scene-bg.webp` | ~1080×1920, opaque | ✅ **DONE** — full-screen app backdrop | CSS radial gradient |
| `arena/gate.webp` | ~256×512 | ✅ **DONE** — the Lab Gate ice tower (HP glow + cracks overlaid by CSS) | CSS gradient door |
| `arena/portal.webp` | ~256×256, transparent | ✅ **DONE** — round vortex; opens at one of 3 right-side spots (top / centre / bottom) per subwave, spawns, closes | CSS swirling purple portal |
| `grid/slot-frame.webp` | 256×256, transparent center | ✅ **DONE** — empty merge-slot frame/tile | dashed CSS frame |

## Rewards — `public/images/props/`

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `props/flying-chest_347x347.webp` | 347×347, transparent | ✅ **DONE** — winged golden chest, the tappable flying reward crossing the arena every 2 min | static chest icon `images/icons/chest_128x128.webp` (CSS bob + glow already applied) |

## VFX sprites
Static sprites; the existing CSS keyframes animate them (fall-in, spin-suck, scale-out).

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `attacks/animations/meteor-vfx-9-frames_384x384.webp` | 384×384 (3×3, 9 frames) | ✅ **DONE** — Meteor Storm **execution** animation: rain played once across the whole arena on cast | per-meteor CSS meteors falling from the top-left |
| `attacks/meteor_256x256.webp` | 256×256, transparent | ✅ **DONE** — Meteor Storm **button** icon (fireball) | drawn glyph in the ult button |

*(Deliberately NOT asset-driven — already crisp procedurally: nova/shockwave/heal rings, chain-lightning bolts, particles/confetti, damage numbers.)*

## Arena skill icons, slots 5–8 — `public/images/attacks/`
Button icons for the skills after Meteor · Revive Guard · Heal · Defender. Until a
file lands, SpellButton draws the procedural `SkillIcon.vue` — which is also each
one's REFERENCE on the `/#/art-sheets` bench (the prompts are in `PROMPTS-VFX.md`
after `pnpm art:export`). Their VFX (auras, portals, reticle, slashes, tether) are
procedural CSS and need no art.

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `attacks/warcry_128x128.webp` | 128×128, transparent | ⬜ Warcry of the Legion (slot 5) — ivory war horn blasting red-gold shockwaves | `SkillIcon` `warcry` |
| `attacks/legion-call_128x128.webp` | 128×128, transparent | ⬜ Legion Call (slot 6) — three spectral cyan helmets rising from a portal | `SkillIcon` `legion` |
| `attacks/executioners-mark_128x128.webp` | 128×128, transparent | ⬜ Executioner's Mark (slot 7, desktop) — skull in a crimson rune reticle | `SkillIcon` `execute` |
| `attacks/soul-pact_128x128.webp` | 128×128, transparent | ⬜ Soul Pact (slot 8, desktop) — a violet and a golden soul flame chained together | `SkillIcon` `pact` |

## Attacks — projectiles & impact VFX — `public/images/attacks/`
Only **ranged** units (arena range > 14) fire a projectile; everything else hits
in melee (the existing lunge + clash SFX + sparkle). Art is keyed by **element**,
not tier, so one projectile + one impact sheet is reused by every unit of that
element. Missing files degrade gracefully: no projectile bitmap → the glowing
colour dot; no impact sheet → the coloured sparkle burst. Draw projectiles
**pointing up (north)** — the engine rotates them to face their flight path
(fighters mostly shoot rightward, so an up-facing sprite is turned +90°).

**Which projectiles are actually needed** — the ranged roster is:

| Tier | Unit | Element | Projectile `attacks/…` | Impact sheet `attacks/animations/…` | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Magma Mote | fire | `fire-projectile_128x128` | `fire-splitter-vfx-9-frames_384x384` | ✅ **DONE** |
| 2 | Frost Whirl | wind | `wind-projectile-vfx-9-frames` (animated) | `wind-impact-vfx-9-frames_384x384` | ✅ **DONE** (animated flight + impact; note the impact file uses `-impact-`, not `-splitter-`) |
| 3 | Boulder Brute | stone | `stone-projectile_128x128` | `stone-splitter-vfx-9-frames_384x384` | ✅ **DONE** |
| 4 | Glacier Guard | ice | `ice-projectile_128x128` | `ice-splitter-vfx-9-frames_384x384` | ✅ **DONE** (reuses the ice art) |
| 7 | Nebula Eye | cosmic | `cosmic-projectile-vfx-9-frames` (animated) | `cosmic-splitter-vfx-9-frames_384x384` | ✅ **DONE** (animated flight + impact) |
| 8 | Void Wraith | shadow | `shadow-projectile_128x128` | `shadow-splitter-vfx-9-frames_384x384` | ✅ **DONE** |
| 10 | Phoenix Sovereign | fire | (reuses tier-1 fire art) | (reuses tier-1 fire art) | ✅ **DONE** — ranged, same fire projectile + splitter as tier 1 |

- **Projectile**: 128×128, transparent, subject fills ~80%, drawn pointing up (north).
- **Impact "splitter"**: a **3×3 sprite sheet, 384×384** (nine 128×128 frames,
  left→right then top→bottom); the engine steps through all 9 over ~0.48 s.
- **Animated in-flight (optional)**: drop `attacks/animations/<element>-projectile-vfx-9-frames_384x384`
  (same 3×3 layout, drawn pointing north) to make the projectile *animate* while
  it travels — it overrides the static `<element>-projectile` image. ✅ `fire`,
  `wind`, and `cosmic` done; others fall back to the static sprite (or dot).
- **Reuse (no new art needed if these ever go ranged):** Obsidian Warlord (t11)
  reuses **fire**; Crag Colossus (t6) reuses **stone**. Only `water` (Tide Drop
  t5) and `gold` (Golden Talon t9) would need brand-new projectiles, and only if
  made ranged.
