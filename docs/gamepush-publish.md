# Publishing Umbrella through GamePush

GamePush (gamepush.com) is a publishing hub: ONE archive, uploaded once to GamePush
Game Hosting, is fanned out to many portals. The build is `pnpm build:gamepush`
(flag `VITE_APP_GAMEPUSH`), the SDK glue is `src/utils/gamePushPlugin.ts`.
Sources: docs.gamepush.com (get-start, advertising, player, sounds, hosting,
common-features) and the "Publishing the game on platforms" tutorial.

## 0. What is already done in the repo

- SDK loader injected at runtime with project id + PUBLIC token from env, waits for
  `window.onGPInit` and `gp.player.ready`, then wires pause/resume, mute, ads,
  language, `gameStart`, `gameplayStart/Stop`.
- Ads: `gp.ads.showFullscreen` (interstitial) and `showRewardedVideo` (reward only
  when the SDK says success; button hidden while `isRewardedAvailable` is false).
  Audio is cut before every ad (`isAdShowing`), the pause gate is force-released
  after every ad, SDK `pause`/`resume` and `gp.sounds` mute map to the platform
  pause / hard-mute gates.
- Cloud save: `GamePushStrategy` mirrors the state blob into two String player fields
  and calls `gp.player.sync()`; merge by progress score; local fallback.
- Language: `gp.language` seeds the first-paint locale (never the browser language),
  and a later change re-applies it.
- No CSP meta tag, no obfuscation, no sourcemaps, no live leaderboard endpoint in
  this build (it runs on portals that forbid each of those).
- `pnpm build:gamepush` -> `dist/umbrella-gamepush.zip` (about 5 MB,
  `index.html` at the archive root, real PKZIP; limit is 200 MB).

## 1. Prerequisites you must do by hand

1. **Create the game in the panel** (gamepush.com/panel/projects -> add game, name
   "Umbrella"). Optional: default avatar generator, Yandex.Metrica /
   Google Analytics counter.
2. **Copy the Install Code values** (game -> Install code): the numeric
   `projectId` and the `publicToken`. Paste them into `.env.gamepush.local`:
   - `VITE_GAMEPUSH_PROJECT_ID=` (still EMPTY - you must paste it)
   - `VITE_GAMEPUSH_PUBLIC_TOKEN=` (already there from your earlier file)
   Without the project id the SDK stays disabled: no ads, no cloud save, and the
   console shows `[gamepush] VITE_GAMEPUSH_PROJECT_ID ... missing`.
3. **Never ship the secret key.** It is now stored un-prefixed as
   `GAMEPUSH_SECRET_KEY` (a `VITE_` name would be embedded in the public bundle,
   which is how the old file leaked it into a build). Nothing reads it. Consider
   regenerating it in the panel since it sat in a `VITE_` variable.
4. **Create two custom player fields** (panel -> Player -> Fields), both type
   **String**, keys exactly:
   - `save_state`
   - `save_meta`
   Without them `player.set` is silently dropped; the game detects that, logs
   `player fields ... not defined in the panel -> local-only`, and saves to the
   browser only (no cross-device progress). The state blob is a few KB to tens of
   KB: check in the panel that a String field accepts that length (open question).
5. **Platform storage setting.** For each platform that offers it, set "Progress
   save format" to **Platform cloud** (recommended by GamePush; required to match
   CrazyGames' "Yes, using the Data Module" answer, see below).
6. **Allowed origins** (get-start -> Allowed sites): the draft/hosting origin is
   added on first open. Add `http://localhost:<port>` and mark it as a *test site*
   if you want to test locally so test players do not pollute statistics.
7. Build: `pnpm build:gamepush`. Output: `dist/umbrella-gamepush.zip`.

## 2. Hosting upload (nothing is uploaded by the repo)

1. Panel -> your game -> **Game Hosting** -> upload `umbrella-gamepush.zip`.
   Rules: `.zip` up to 200 MB, `index.html` at the archive ROOT (not in a folder -
   already guaranteed by `tools/zip-dist.mjs`). HTTPS and CDN included.
2. The upload becomes a **draft**. Open the draft link and play it to check ads,
   save, language, mute. A draft is not what players see.
3. Press **Publish** on the draft for portals that use GamePush hosting (VK, OK,
   Moi Mir, ...).
4. **For GamePush distribution** (GamePush compiles and sends the game to the
   portals for you): upload but do NOT publish; GamePush prepares the game from the
   upload.

## 3. Per-platform fan-out notes

Add each platform in the panel (game -> Platforms -> add). "Add only" means no
fields are needed.

| Platform | What you do | Restrictions / traps |
|---|---|---|
| **CrazyGames** | Register on the CG developer portal, submit as **HTML5**. Add the platform in GamePush. | The CG storage answer MUST match GamePush: "Yes, using the Data Module" + Progress Save Format = Platform Cloud (recommended). Our `gameplayStart/Stop` bracket is forwarded by GamePush. |
| **Poki** | Add the platform only. | Poki forbids external runtime requests: this build has no live leaderboard endpoint and no analytics. Expect Poki's own QA (25 steps) and a playtest. |
| **GamePix** | Add the platform only. | GamePix QA wants a post-load interstitial and silence under ads (audio is cut before every ad). |
| **Playgama** | Register in the Playgama developer panel, add the platform. | If the game uses sharing, enter the sharing link (we do not share). |
| **GameMonetize** | Enter the **App ID** (visible after creating the game on GameMonetize). | GameMonetize moderation wants an ad right after load; check how the GamePush draft behaves and tell me if QA rejects. |
| **GameDistribution** | Enter the **App ID**. | None for us. |
| **Y8** | Create an app at Y8, set the webhook (Push event URL) to the GamePush Y8 webhook, add the platform with App ID + Secret. Choose the ad SDK: "Y8 Minimal GamePush SDK" (default, needs the Application ID from your Y8 manager) or the legacy AdSense one (AdSense ID + Channel ID). | Achievements need the Y8 unlock key per achievement; we have none wired. |
| **Yandex Games** | Add platform with App ID (from the game URL) + Secret Key. | The secret key appears only after adding a purchase in the purchases section and refreshing; **delete that temporary purchase afterwards or moderation fails**. Enable sticky banners in the draft ("Sticky banners" section) - can be up to 70% of ad revenue (not wired in code; panel-only). Yandex rejects hardcoded foreign storage URLs - the build is clean of them, but verify in moderation. |
| **VK Games / VK Play / OK / Moi Mir / Telegram / Fotostrana / beeline / Kongregate / PlayDeck / SmartMarket** | Need accounts, secret keys or legal-entity status; see the GamePush guide. | Out of scope unless you want RU-market portals. OK needs a legal entity/IE. PlayDeck needs `gp.gameStart()` (we call it). |
| **CoolMath / Playdia** | Add platform, compile their build in "Game Sources and Builds", test in their QA tool, send to the manager. | They require: NO external links/emails/social links, NO fullscreen button, NO online features (leaderboards, chat, profiles), NO own analytics, NO Add-to-Home-Screen, and `gp.analytics.goal('LEVEL_START', n)` / `LEVEL_REPLAY` events. **Not implemented** - the game has fullscreen/leaderboard UI; this needs a dedicated pass if you want these two portals. Playdia also needs mute tracking via `gp.sounds` (done). |
| **Google Play** | Separate "Adding Google Play Platform" guide. | Not relevant for the web build (use the Tauri pipeline). |

## 4. Verification checklist (draft link)

- [ ] Console shows no `[gamepush]` warnings (project id, fields).
- [ ] First load: no audio before the first tap, no ad before the first tap.
- [ ] Interstitial after a result: music stops BEFORE the ad opens, resumes after;
      no stuck pause if the ad has no fill.
- [ ] Rewarded button appears only after the first boss kill AND when the SDK reports
      inventory; reward only after a completed video; blocked with an ad-blocker
      shows the shared ad-blocked modal, never grants.
- [ ] Platform mute button silences all audio (SFX and music) and unmute restores it.
- [ ] Reload on another browser/device with the same portal account restores progress.
- [ ] Language follows the portal; switching the portal language re-localises.
- [ ] Tab hidden / portal pause freezes the game (no gameplayStop spam).

## 5. Open questions / not done

- Install Code project id and any per-platform App IDs/secrets: yours to paste.
- String field size limit for `save_state` (check in the panel).
- GamePush leaderboards, achievements, sticky banner, preloader ad
  (`gp.ads.showPreloader`) and analytics goals are intentionally not wired (the
  preloader ad is "before gameplay only" and conflicts with the earned-ads rule).
- The Brave debug port was not reachable, so nothing was read from the dashboard.
