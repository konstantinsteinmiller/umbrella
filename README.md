# Umbrella

Open your umbrella, ride the wind and float to the finish: a one-button sky platformer with 27
handcrafted levels, a level editor and community levels. Store texts, how to play, controls and
categories: [description.md](description.md).

Play: [drawn](https://konstantinsteinmiller.github.io/umbrella/) ·
[Paper Moon (lantern papercraft)](https://konstantinsteinmiller.github.io/umbrella/lantern/) ·
[Rainy Day Post (claymation)](https://konstantinsteinmiller.github.io/umbrella/clay/)

```sh
pnpm install
pnpm dev            # http://localhost:5173  (?art=lantern / ?art=clay for the painted styles)
pnpm test
```

## Art styles

One game, three looks. The drawn game is vector; the lantern and clay builds draw painted sheets
(`src/assets/umbrella-art-lantern/`, `src/assets/umbrella-art-clay/`) made with the art pipeline
in `scripts/art/` (`pnpm art:prompts:<set>`, `pnpm art:slice:<set>`). The art style is fixed per
build (`VITE_APP_LANTERN` / `VITE_APP_CLAY`); `?art=` switches it on a dev server only.

## Builds and deploys

- **GitHub Pages:** pushing `main` builds `/umbrella/<revision>/`, `/lantern/` and `/clay/`. The
  revision is the highest non-empty `## Revision N` in `GDD.md`.
- **Poki:** `pnpm deploy:poki`, `pnpm deploy:poki:lantern`, `pnpm deploy:poki:clay` (build,
  audit, upload and QA in Poki for Developers).
- **Other portals:** `pnpm build:<portal>` (crazy-web, playgama, gamepix, gamemonetize, yandex,
  gamepush, itch, glitch, wavedash, game-distribution).

## Weak phones

Poki playtests showed mid-range and older phones (Adreno 5xx, Mali-G5x/T8xx, PowerVR GE8320) at
3–6 fps. The painted builds switch those to a light look (`src/umbrella/liteMode.ts`): known weak
GPUs start light, and a frame-time watchdog catches the rest. The sky then sits still on its own
canvas behind the game and the parallax lanterns are left out. The light look is saved, and
`?lite=1` / `?lite=0` force it. Measurements and the ideas that did not pay are recorded in the
roadmap (#Perf-1).

## Sound

Effects, wind and enemy sounds are synthesised live (`src/umbrella/soundKit.ts`); the background
music is the loop `public/audio/music/bg-cozy.ogg`. All of it runs on one sound engine that goes
silent under ads, hidden tabs, platform pauses and portal mutes
(`node scripts/sfx/umbrella-mute-check.mjs` proves it in a browser). The mix levels come from the
level report `node scripts/sfx/render-umbrella-sounds.mjs`.

## Saves

Saves live in one localStorage blob, `umbrella_state` (mirrored to each portal's cloud save).

## Notes

- `changelog.md` lists every change per revision; `roadmap.md` holds the open and done tasks.
- Poki playtest videos film a canvas, not the page: `src/utils/pokiPlaytestStage.ts` paints the
  game and the real HUD into the canvas the recorder films.
