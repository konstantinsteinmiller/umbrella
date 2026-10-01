# Elemental Barrage — art to-do

The game ships playable on reused Merge Idle War art (50 fighter portraits, 6 walkers, 6 bosses, skill
icons, impact sheets, coin/chest props, 6 painted ball materials + the rainbow FEVER ball). Concept §4.9 budgets **6–8 new sheets**. Until
they exist, each slot below is drawn procedurally or covered by a stopgap. Paint through the
`art-generation-pipeline` (`pnpm art:desk`) and compress with `compress-images-pipeline` before shipping.

| # | Asset | Size / format | Today | Drop-in point |
|---|---|---|---|---|
| 1 | ✓ **Board backdrops** ×3 (Moonlit Keep rows 1–40, Corrupted Keep 41–80, Void Bridge 81+) + **scene** (landscape + portrait) + **side-panel plate** (9-slice) | 768×1376 / 1376×768 / 512² webp | **painted** — prompts + guides in `art-sheets/backdrops/`, `pnpm art:backdrops` measures the floors' rows and heals scene seams | `backdrop.ts` (`FIELD_BANDS`, `fieldWindow`), `backdropArt.ts`, `GameScene.vue` (`sceneBgStyle`, `.panel-plate`); procedural floor stays the fallback |
| 2 | **Glass-orb shell** — rim, refraction and highlight for the default `orb` skin | 256×256 webp, transparent centre | procedural gradient rim + highlight | `src/barrage/render/balls.ts` (orb bake) |
| 3 | **Launcher pedestal** — the plinth the selected elemental stands on, glowing in its element colour | 384×192 webp | procedural (`BoardRenderer.bakePedestal`) | `src/barrage/render/BoardRenderer.ts` → `bakePedestal` |
| 4 | **Logo** — repaint of the stopgap (house font + 4 fighter orbs, rendered from code) | 1024² master → 512/256/192 + favicon | stopgap in `public/images/logo/*`, `public/favicon.ico` | same paths |
| 5 | **Promotion covers + store screenshots** (portal tiles 16:9, 9:16, 1:1, 4:3; GameMonetize set) | see `src/assets/promotion/*` | still **Merge Idle War**'s — do not upload | `pnpm art:promotion` (art pipeline promotion step) |
| 6 | **Preview videos** (10 s + 30 s, fail and success, both orientations) | MP4 | none — MIW's DEV video seam was removed with its gameplay | `tools/preview-video` needs a Barrage seam + scenarios (`gameplay-video-pipeline`) |
| 7 | **Sludge hazard** (centaur spit) | 128×128 webp | procedural blob | `src/barrage/render/BoardRenderer.ts` (hazards) |
| 9 | **Power-orb icons** (Shoot-to-Choose, retention-roadmap #5): Power (fist / flame burst), Splash (ring of droplets), Bounty (coin shower), Volley (two balls) — one glyph each, readable at 40 px inside the gold bubble | 128×128 webp, transparent | borrowed art: war-cry, meteor, coin and legion icons (`BoardRenderer` `PERK_ICON`) | `src/barrage/render/BoardRenderer.ts` → `PERK_ICON` / `drawPickups`; add the four to `art.ts` |
| 8 | **Ball-skin materials** for the drawn shells: tide (water), gale (wind), frost (ice), gilded (gold), eclipse (cosmic) — painted round balls in the style of `ball-lava.webp`; only the outer ~28 % of the radius shows (the tier's face sits in the middle) | ~220² webp, transparent corners | procedural bands (`render/balls.ts` → `DRAWN`) | `src/assets/art/props/ball/ball-<id>.webp`, add it to the `SPRITES` list and set `material: 'sprite'` in `ballSkins.ts` |

Not needed: monster/boss/ball/skill sprites (reused 1:1), SFX (the 57 MIW sounds cover every event), and
bubbles/trails/damage numbers (procedural by design).
