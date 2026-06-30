# Game Design Document: Merge Alchemy Lab
**Document Version:** 1.0.0
**Target Platform:** Mobile-First (iOS / Android), Responsive Tablet & Web Browsers  
**Genre:** Hybrid-Casual Merge / Tycoon / Collection Game

---

## 1. Executive Summary & Core Concept

### 1.1 Project Overview
*Merge Alchemy Lab* is a mobile-first hybrid-casual title where players merge living elemental units to drop them into a mystical cauldron. By combining different tiers of ingredients, players discover chemical properties, brew legendary potions, fill out a sticker-style index book, and upgrade their laboratory. The game prioritizes high-satisfaction visual "juice," tactile drag-and-drop feedback, and an addictive discovery loop.

### 1.2 Core Pillars
* **Tactile Satisfaction ("Juice"):** Every merge, drop, bubble, and splash must feel rewarding through explosive visual effects, bouncy animations, and crisp haptics.
* **Discovery-Driven Loop:** Players are driven by the curiosity of what a new tier or combination will create, turning the progression index into a "sticker collection" obsession.
* **Responsive, Mobile-First Accessibility:** Interfaces are engineered to feel native on smartphones while scaling gracefully via flexible layout units across tablets and desktop browsers without horizontal layout breaking or asset squashing.

---

## 2. Technical Requirements & Responsiveness

### 2.1 Viewport-Driven Scaling Architecture
To eliminate layout distortion, squashing, or broken text wrapping across diverse aspect ratios (from long aspect ratios like 19.5:9 on modern phones to 4:3 on tablets), the game layout relies strictly on Viewport Width (`vw`) and Viewport Height (`vh`) units.

* **Fixed Coordinates Defeated:** No layout boundaries are defined using hardcoded pixel (`px`) constraints.
* **Aspect Ratio Safe-Zones:** The active gameplay field is kept within a central canvas scaled dynamically using CSS variable tricks or canvas bounding bounds linked to viewport dimensions:
    ```css
    :root {
      --app-height: 100vh;
      --app-width: 100vw;
    }
    @media (min-aspect-ratio: 3/4) { /* Rules for wider tablet screens */
      :root {
        --app-width: calc(100vh * 0.5625); /* Locks canvas to a clean 16:9 vertical wrapper */
      }
    }
    ```

### 2.2 Fluid Scaling Constants
* **Typography:** Title texts are scaled at `4.5vh` to `5.5vh`, body texts at `1.8vh` to `2.2vh` to guarantee readable line wraps regardless of hardware resolution.
* **Grid Scaling:** The ingredient merge grid is defined as a container of `40vw` wide / `40vh` high (clamped on tablets), ensuring individual slots scale organically inside flexboxes or explicit percentage column blocks.

---

## 3. Core Gameplay Loop & Mechanics

### 3.1 The Merge Grid
The primary input area is a `3x4` or `4x4` tile grid where ingredient units are generated and stored.
* **Spawning:** Players tap a "Spawn Ingredient" button to populate empty slots with Tier 1 ingredients. Spawning consumes gold or relies on an automated timer.
* **The Merge Action:** Dragging an ingredient of Tier $N$ over another identical ingredient of Tier $N$ merges them instantly into a single unit of Tier $N+1$.
* **Visual Polish:** Upon release, the merging units execute a squish animation (shrinking to `80%` scale over 0.05 seconds, then popping outward to `115%` scale with confetti particles before settling back to native size).

### 3.2 Ingredient System & Chemical Properties
Each tier represents a fundamental chemical state. Units have unique anthropomorphic face designs reflecting their underlying element:

| Tier | Ingredient Name | Underlying Chemical Property | Visual Element Style |
| :--- | :--- | :--- | :--- |
| **1** | Living Droplet | Water / Base Fluid | Red square body, furious expression, watery shimmer |
| **2** | Ember Squirt | Minor Thermal | Orange body, burning forehead sparks |
| **3** | Vapor Chunk | Pressure / Gas | Light blue, puffy cloud-like exterior texture |
| **4** | Bio-Sprout | Organic / Flora | Vivid green, leaf crown sprouted on head |
| **5** | Pyro-Core | High Thermal / Fire | Deep yellow with bandana/eyepatch, blazing aura |
| **6** | Acid Gland | Corrosive | Neon green, bubbling surface boils |
| **7** | Spark Spark | Electrical Volatility | Bright cyan, crackling voltage lines across eyes |
| **8** | Cryo-Shard | Sub-Zero Thermal | Frost-white crystal finish, cold vapors trailing |
| **9** | Aurum Paste | Catalyst | Metallic gold finish, shiny high-gloss specularity |
| **10**| Cosmic Mass | Dark Matter | Void purple with titanium knight helmet and shades |

### 3.3 The Cauldron & Lane Injection
* **Lanes:** Above or adjacent to the cauldron are specialized injection lanes. Dragging a unit out of the merge grid and releasing it into an active lane initiates the brewing sequence.
* **Gravity Slide:** Once dropped into a lane, the unit detaches from the touch pointer, changes state into an physics-driven falling ingredient, and slides down smoothly right into the open top of the cauldron.
* **Input Capacity:** The basic cauldron handles up to 3 ingredient elements simultaneously before triggering a boil sequence.

---

## 4. The Brewing Process & Juice

### 4.1 Real-Time Feedback Execution
The entire loop is amplified by intense visual feedback ("Juice") designed to release dopamine:
1.  **Splash & Ripple:** When a unit drops into the cauldron, a splash splash mesh appears with the corresponding ingredient color. The surface fluid plane distorts using a sine-wave warp shader.
2.  **Color Transformation:** The cauldron fluid blends its current RGB color with the incoming element's color using smooth interpolation.
3.  **Dynamic Bubbling:** Particulate bubbles spawn from the center base of the cauldron. Higher thermal tiers (e.g., Tier 5 Fire) multiply the bubble spawn frequency by `300%` and raise bubble scaling velocity.
4.  **Emotive Cauldron Response:** The cauldron itself features stylized cartoon eyes and mouth on its metal surface. It expands, vibrates, and alters its expression based on internal contents (e.g., coughing green smoke when Acid is inserted, or eyes turning into hearts when rare combinations brew).

### 4.2 Outcome Classifications
Once full capacity is reached, the cauldron rattles forcefully for 1.2 seconds, expanding outward along its X/Y dimensions before bursting open with a bright flash to reveal the resulting potion container:

```
                  [ Ingredient 1 ] + [ Ingredient 2 ] + [ Ingredient 3 ]
                                             │
                                    ┌────────┴────────┐
                                    ▼                 ▼
                        Known Recipe Match?      No Valid Match
                                    │                 │
                           ┌────────┴────────┐        ▼
                           ▼                 ▼    [ Sludge Potion ]
                     Standard Recipe   Legendary  (Consumes materials,
                     (Sticker Card)    (Screen    yields basic currency)
                                        Flash)
```

* **Standard Success:** Drops a beautifully rendered potion item that slides smoothly into its corresponding checklist page inside the Index Gallery.
* **Legendary Breakthrough:** Triggers a temporary full-screen dim, followed by rotating light rays, particle streams, and massive gold typography displaying `"LEGENDARY POTION BREWED!"`.
* **Failure (Sludge):** Combining incompatible elements generates a purple bubbling mud potion labeled "Foul Mud Sludge". It grants negligible baseline gold but ensures the player's core loop isn't permanently halted.

---

## 5. Meta-Progression & Gallery (Index Book)

### 5.1 The Sticker Collection Interface
The Discovery Index acts as a high-fidelity retro sticker album.
* **Silhouette States:** Undiscovered potions appear as dark grey outlines with a faint question mark and a list of hints (e.g., *"Requires a highly corrosive element mixed with deep water"*).
* **The Sticker Reveal:** When a new potion is synthesized, its card flashes in the center screen. The player taps it to manually place it into the open slot of the book. The slot triggers a bright gold flash, locking the colored potion artwork in place.
* **Completion Milestones:** Filling a specific page (e.g., "The Volcanic Collection", "The Ice Age Brews") unlocks permanent multipliers for currency generation or increases the base spawn tier of grid ingredients.

### 5.2 Specialized Potion Effects (Recipes)

The game features 50 unique recipes. Examples include:

* **Recipe #1: Volcanic Brew**
    * *Formula:* Tier 5 (Fire) + Tier 5 (Fire) + Tier 2 (Minor Thermal)
    * *Visuals:* A heavy magma flask filled with fluid that looks like flowing lava, venting small volcanic ash particles.
    * *Effect:* Speeds up automated worker spawn rates by `25%` for 10 minutes.
* **Recipe #2: Stellar Draft**
    * *Formula:* Tier 10 (Dark Matter) + Tier 3 (Gas) + Tier 1 (Water)
    * *Visuals:* An elegant spherical bottle filled with nebula dust swirls and sparkling stars.
    * *Effect:* Instantly grants +5,000 Cosmic Gold coins upon creation.
* **Recipe #3: Ancient Remedy**
    * *Formula:* Tier 4 (Flora) + Tier 4 (Flora) + Tier 8 (Sub-Zero)
    * *Visuals:* A rustic wooden-accented potion with a faint glowing blue leaf floating gracefully inside.
    * *Effect:* Permanently lowers the cost of all lab grid expansions by `5%`.

---

## 6. Laboratory & Cauldron Upgrades

To sustain the tycoon engagement loop, players spend potion revenue on four fundamental technical attributes:

### 6.1 Heat Management
* **Description:** Governs processing velocity. Higher heat values compress the cauldron's synthesis sequence.
* **UI Asset:** A vertical glass thermometer gauge adjacent to the cauldron that fills with glowing plasma as upgrades accumulate.
* **Formula Progression:** $Time_{synthesis} = rac{1.2\,	ext{seconds}}{1 + (	ext{Upgrade Level} 	imes 0.15)}$

### 6.2 Pressure Control
* **Description:** Amplifies the critical success multiplier. Higher pressure increases the chance that standard recipes turn into "Double-Yield" variants, paying out double gold.
* **UI Asset:** A circular brass industrial dial indicator with a red zone needle that shakes during heavy brewing.

### 6.3 Containment Efficiency
* **Description:** Lowers the failure rate. Upgrading containment reduces the probability of producing "Sludge" when experimenting with unmapped element mixtures, turning failed combos into semi-stable sub-potions instead.
* **UI Asset:** Magnetic stabilizer rings spinning below and above the main cauldron frame.

### 6.4 Automation (The Helper Imp)
* **Description:** Deploys automated alchemical imps that automatically merge identical units on the grid and drop them into designated lanes when the cauldron is vacant. Crucial for idle progression.

---

## 7. Comprehensive UI/UX Specification

### 7.1 Art Style & Visual Direction
The visual signature is classified as **Vibrant Stylized Vector Cartoon** with bold, heavy black linework (`3px` to `5px` equivalent strokes). Colors are saturated, desaturated only for structural backgrounds to make actionable components (buttons, interactive units, fluids) pop out instantly against dark masonry stone walls.

### 7.2 Interface Component Wireframe & Layout (Mobile-First Canvas)

The screen area is managed via structural blocks defined in responsive viewport ratios:

```
┌────────────────────────────────────────────────────────┐ ◄─── Top Menu Bar [Height: 8vh]
│ [Icon] Book Index (5/50)       [Gold Counter] 14.52K   │
├────────────────────────────────────────────────────────┤ ◄─── Main Lab Visualizer Area
│                                                        │      [Height: 46vh]
│    ┌───────────────┐               ┌──────────────┐    │      Contains active cauldron,
│    │  Lanes Panel  │               │   Cauldron   │    │      heat gauges, and real-time
│    │  [L1] [L2] [L3]               │   Venting    │    │      particle streams.
│    └───────┬───────┘               │   Glow       │    │
│            └─────────► [ Drop ] ──►│  (● ◣ _ ◢ ●) │    │
│                                    └──────────────┘    │
├────────────────────────────────────────────────────────┤ ◄─── Upgrade Controls Panel
│ [Heat Upgrade: Lvl 4]    [Pressure Upgrade: Lvl 2]     │      [Height: 12vh]
├────────────────────────────────────────────────────────┤ ◄─── Interaction Grid Panel
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │      [Height: 34vh]
│ │ Tier 1  │ │ Empty   │ │ Tier 5  │ │ Empty   │        │      Where user drags, merges,
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │      and manages material assets.
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │ Tier 2  │ │ Tier 2  │ │ Tier 10 │ │ Empty   │        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
└────────────────────────────────────────────────────────┘
```

### 7.3 Basic UI Components Reference Table

| Component ID | Technical Type | Layout Sizing Parameters | Asset State Varieties Required |
| :--- | :--- | :--- | :--- |
| **BTN_INDEX** | Interactive Button | `width: 14vw; height: 7vh;` | Default Book, Pressed, New Item Glow Overlay |
| **TXT_GOLD** | Dynamic Value Label | `font-size: 2.2vh; padding: 1vh;` | Text string format: `##.##K` / `##.##M` |
| **GRID_SLOT** | Static Framework Container | `width: 22vw; height: 10vh;` | Empty dotted line state, active occupied highlight |
| **UNIT_ASSET**| Draggable Entity | Fits inside `GRID_SLOT` at `90%` | Idle animation loops (breathing), Drag state scale |
| **BAR_PROGRESS**| UI Feedback Slider | `width: 35vw; height: 2vh;` | Background Track, Colored Progress fill mask |
| **GAUGE_DIAL** | Decorative Vector Element| `width: 12vw; height: 12vw;` | Dial face panel sprite, separated needle sprite |

---

## 8. Full Asset Production Pipeline Checklists

### 8.1 2D Visual Art Asset Manifest
All assets must be formatted as high-density `.png` sheets or scale-independent `.svg` vector objects:

* [ ] **Laboratory Background Scene:** Dark cobblestone backdrop texture with dynamic lighting gradients focused around the central cauldron zone.
* [ ] **The Alchemist Cauldron Sprite Pack:**
    * Cauldron Body Base (with neutral eyes).
    * Cauldron Satisfied/Happy Expression (used on successful legendary brews).
    * Cauldron Strained/Expanding Expression (used during active synthesis).
    * Cauldron Liquid Overlay Mesh (packaged with mask shaders for dynamic color tinting).
* [ ] **Ingredient Character Sheet (Tiers 1 through 10):**
    * Each character requires an Idle Frame, a compressed Drag Frame, and a flat sheet texture for debris particles.
* [ ] **Potion Bottle Variants:**
    * 10 Distinct container shapes (Flask, Sphere, Triangle, Ornate Heart, Tube, etc.).
    * Liquid interior sprites with internal transparency maps.
* [ ] **FX Particle Systems Texture Atlas:**
    * 6-frame magical smoke puff loop.
    * Zebra-striped confetti shreds (4 multi-colored variants).
    * Glowing sparkle particle stars.
    * Liquid droplet splash impact frames.

### 8.2 Audio Sound Effects (SFX) Asset Manifest
All audio elements must be optimized for mobile deployment in low-latency compressed `.ogg` or `.aac` wrappers:

* [ ] **`sfx_ui_click_light.ogg`:** Soft, clean pop sound used for standard menu tab adjustments.
* [ ] **`sfx_unit_spawn.ogg`:** Materializing wet sound effect when a new ingredient appears on the grid.
* [ ] **`sfx_merge_impact.ogg`:** A high-satisfaction rubbery "thud-pop" combo indicating a successful unit tier advancement.
* [ ] **`sfx_lane_drop.ogg`:** Whistling air slide ending in a heavy mechanical latch trigger.
* [ ] **`sfx_liquid_splash.ogg`:** Wet, deep liquid impact slosh indicating entry into the cauldron.
* [ ] **`sfx_cauldron_loop.wav`:** A seamless 3-second ambient bubbling/boiling sound that increases in pitch based on heat stats.
* [ ] **`sfx_brew_success.ogg`:** A brass-accented magical fanfare featuring high-pitched chimes.
* [ ] **`sfx_brew_failed.ogg`:** A humorous flatulent wet pop paired with a descending slide-whistle tone.
* [ ] **`sfx_sticker_slap.ogg`:** A crisp, heavy paper slap accent when a potion is locked into the Index Gallery book.


## General
In GENERAL for all work: Do your work on a high-fidelity basis, don't do just good enough! that's important. Make the interactions feel good,
add vfx juice where applicable(take care of optimizing to not overload the CPU/GPU).
Don't take shortcuts to save on tokens or implementation time. After setting up the plan, write it down into a game-implementation-plan.md, where you can
refer to if tokens run out of something unexpected happens and you need to continue from somewhere.
I am aware this is a huge task, dont worry, just plan and execute it.

The game starts right into the first scene and has no usual main-menu.

The game needs to be fully responsive(all mobile orientations, min portrait sizes: 320x658px, tablet and desktop sizes) and optimized for mobile portrait and landscape play,
but also tablets and desktop(up to fullscreen). Dont use fixed pixels values if possible, use percentage or vw and vh to define size relations.
Take safe-area into account according to your skills. Take into account that images are
not selectable like in normal web environments, but allow drag and click events to perform game logic.
Be aware to make the optimized for web games standards like fast jump into the game by optimizing hot path loading and delay uncritical assets to load after
the game has started to show.

Save all state variables in one Object named prism_state.

---

## After implementing the game
create a roadmap(min 15 features/action points, sorted by highest impact, best performance, highest game feel improvements)
for future features that would increase the Day1 retention, the average playtime, the easy-to-pickup and hard-to-put-down
metrics, that increase conversion of new players with actionable implementations suggestions. So that I can tackle these features later if I value them benefical.
