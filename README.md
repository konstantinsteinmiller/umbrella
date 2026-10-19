# Umbrella

A mobile-first casual volley shooter: monsters march down a 7-column board, you drag back and release a
barrage of elemental balls, and when the ball tray overflows, twin balls merge into mightier elementals.
A boss every 10 rows sets a checkpoint — a breach is never a game over.

Built on the Merge Idle War stack and art (50 elemental portraits, walkers, bosses, VFX, SFX) and its
multi-portal build matrix (CrazyGames, Poki, Playgama, GamePix, GameMonetize, Yandex, itch, Glitch, …).

- Design: [`src/barrage/CONTRACT.md`](src/barrage/CONTRACT.md) (rules, economy, FTUE, monetization) and
  concept B in [`non-strategy-concepts.md`](non-strategy-concepts.md).
- Code: `src/barrage/engine` (deterministic rules + physics), `src/barrage/render` (canvas board),
  `src/barrage/state` (run state, economy, meta), `src/components/barrage` (HUD, tray, modals).

```sh
pnpm install
pnpm dev            # http://localhost:5173
pnpm test
pnpm build:poki     # or build:crazy-web, build:playgama, build:gamepix, …
```

Saves live in one localStorage blob, `umbrella_state` (mirrored to each portal's cloud save).
