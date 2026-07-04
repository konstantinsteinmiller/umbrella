# Art TODO — drop-in bitmap assets

**How it works:** drop a file at the exact path below → it is auto-detected and rendered on the next page load (no code change, no rebuild for `public/`). Until the file exists — or if it fails to decode — the current procedural SVG/CSS art keeps rendering, so nothing can break.

**Rules**
- Format: `.webp` preferred (`.png` also probed as a fallback extension).
- Characters/props: **transparent background**, square canvas, subject fills ~90% (the engine scales per tier/kind).
- Style: vibrant stylized vector cartoon, bold black outlines (3–5px at 256px), saturated colors — match the existing SVG units.
- Facing: fighters march right → draw fighters facing **right**; enemies march left → draw enemies facing **left**.

## Fighters (10) — `public/images/units/`
One per merge tier, 256×256. A tier badge is overlaid automatically (bottom-right corner stays clear-ish).

| File | Character | Look |
| :--- | :--- | :--- |
| `fighter-1.webp` | Living Droplet | red rounded square, furious face, watery shimmer `#e8453c` |
| `fighter-2.webp` | Ember Squirt | orange body, burning forehead sparks `#ff7a18` |
| `fighter-3.webp` | Vapor Chunk | light-blue puffy cloud bumps `#8fd3ff` |
| `fighter-4.webp` | Bio-Sprout | green, leaf crown `#3fbf4f` |
| `fighter-5.webp` | Pyro-Core | yellow, eyepatch bandana, fire aura `#ffd21f` |
| `fighter-6.webp` | Acid Gland | neon green, surface boils `#9cff2e` |
| `fighter-7.webp` | Spark Spark | cyan, voltage lines across eyes `#22e0ff` |
| `fighter-8.webp` | Cryo-Shard | frost-white, ice spikes on head `#dff4ff` |
| `fighter-9.webp` | Aurum Paste | metallic gold, high-gloss specular `#ffcd33` |
| `fighter-10.webp` | Cosmic Mass | void purple, knight helmet visor + shades `#7b2ff7` |

## Enemies (6) — `public/images/enemies/`
256×256 (boss may be 512×512). Facing **left**. Enrage red-flush is applied via CSS — draw the neutral state.

| File | Enemy | Look |
| :--- | :--- | :--- |
| `slime.webp` | Slime | green gooey blob, angry face `#46b86a` |
| `runner.webp` | Runner | lean orange imp, small horns, sprinting legs `#ff8a3c` |
| `brute.webp` | Brute | heavy purple slab, big horns, belly plate `#8a5cc8` |
| `spitter.webp` | Spitter | round teal lobber with open glowing maw `#2ab8b0` |
| `warlock.webp` | Warlock | dark hooded robe, glowing magenta eyes + rune `#3a4470` / `#c05cff` |
| `boss.webp` | Boss | huge red crowned colossus with tusks `#c83a3a` + gold crown |

## Environment — `public/images/arena/` & `public/images/grid/`

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `arena/arena-bg.webp` | ~1024×512, opaque | side-view battlefield ground/backdrop (dark, low-contrast so units pop; light source centered) | CSS gradient + faint grid lines |
| `arena/scene-bg.webp` | ~1080×1920, opaque | full-screen app backdrop (very dark, vignette to `#070a14` edges) | CSS radial gradient |
| `arena/gate.webp` | ~256×512 | the Lab Gate door, tall metal/stone slab (HP glow + cracks are overlaid by CSS) | CSS gradient door |
| `grid/slot-frame.webp` | 256×256, transparent center | empty merge-slot frame/tile (drawn edge-to-edge, replaces the dashed border) | dashed CSS frame |

## Rewards — `public/images/props/`

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `props/flying-chest_347x347.webp` | 347×347, transparent | ✅ **DONE** — winged golden chest, the tappable flying reward crossing the arena every 2 min | static chest icon `images/icons/chest_128x128.webp` (CSS bob + glow already applied) |

## VFX sprites — `public/images/vfx/`
Static sprites; the existing CSS keyframes animate them (fall-in, spin-suck, scale-out).

| File | Size | Content | Current fallback |
| :--- | :--- | :--- | :--- |
| `meteor.webp` | 256×256, transparent | blazing fireball with trailing flames pointing up-right | radial-gradient ball |
| `blackhole.webp` | 256×256, transparent | purple void vortex with swirl arms | radial-gradient disc |

*(Deliberately NOT asset-driven — already crisp procedurally: nova/shockwave/heal rings, chain-lightning bolts, projectile glow dots, particles/confetti, damage numbers.)*
