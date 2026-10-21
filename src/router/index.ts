// ─── Router ─────────────────────────────────────────────────────────────────
//
// One view, one route. The interesting part is the HISTORY MODE, which is a
// portal-survival decision rather than a preference.
//
// ─── Why portal builds use memory history ──────────────────────────────────
//
// A portal build runs inside an iframe whose URL the HOST owns, and several
// hosts append their own fragment to it. With a hash history that fragment IS
// our route path. YouTube Playables loads the game as
//
//     .../index.html#debug&origin=https%3A%2F%2Fdevelopers.google.com...
//
// so `createWebHashHistory` resolves `/debug&origin=…`, matches nothing,
// `to.matched` is empty, `<RouterView>` renders NOTHING — and the player sees
// a black page behind a splash that has already finished. No error, no
// warning: vue-router's "No match found for location" is compiled out of
// production builds, so the failure is completely silent in a shipped bundle.
// That is exactly how chaos-arena's 2026-09 Playables submission failed, while
// every MUST/SHOULD check in YouTube's own test suite went green — the SDK
// handshake, `game_ready` and the cloud save all happen outside the router.
//
// The catch-all record below is NOT sufficient on its own, and shipping only
// that is worse than nothing: the redirect REWRITES `location.hash` to `#/`,
// and `ytgame.js` parses `origin` out of that fragment to address its
// postMessage handshake to the parent frame. You would trade a blank screen
// for a dead SDK.
//
// `createMemoryHistory` closes both halves:
//   • the route is ours, not the host's — nothing a portal appends can be
//     parsed as a path again;
//   • we never WRITE `location.hash` either, so the host's own fragment
//     survives for the host's own SDK.
//
// Nothing is lost: the app never calls `router.push` / `replace` — it lives on
// `/` for its entire lifetime — and deep links only matter off-portal, so
// plain web / GitHub Pages / native builds keep the hash history they have
// always had.
//
// The gates read `import.meta.env` literals directly rather than the `isX`
// constants from `useUser`: Vite folds the literals at parse time (so the dead
// arm and its history factory drop out), and the router stays free of an app
// import that could cycle back through it.

import {
  createRouter,
  createWebHashHistory,
  createMemoryHistory,
  type RouteRecordRaw,
  type RouterHistory
} from 'vue-router'

/** Exported so the regression spec can drive the REAL table through a
 *  host-shaped location without pulling the view components into its graph. */
export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'main', component: () => import('@/views/UmbrellaScene.vue') },
  // The level editor, opened from the "cmonc" cheat's OPEN EDITOR button.
  { path: '/editor', name: 'editor', component: () => import('@/views/UmbrellaEditor.vue') },

  // ─── Catch-all → main menu ───────────────────────────────────────────────
  //
  // The net for every OTHER host that decides to append something to our URL.
  // The `console.warn` is deliberate and deliberately NOT dev-only: if a
  // portal ever routes us somewhere unexpected again, this line is the whole
  // diagnosis, and it has to survive into the production bundle QA runs.
  {
    path: '/:pathMatch(.*)*',
    name: 'catch-all',
    redirect: (to) => {
      console.warn(
        `[router] no route matched "${to.fullPath}" — redirecting to the main menu. `
        + `(history=${historyMode}, href=${typeof window !== 'undefined' ? window.location.href : 'n/a'})`
      )
      return { name: 'main' }
    }
  }
]

const isPortalBuild =
  import.meta.env.VITE_APP_CRAZY_WEB === 'true'
  || import.meta.env.VITE_APP_WAVEDASH === 'true'
  || import.meta.env.VITE_APP_ITCH === 'true'
  || import.meta.env.VITE_APP_GLITCH === 'true'
  || import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true'
  || import.meta.env.VITE_APP_PLAYGAMA === 'true'
  || import.meta.env.VITE_APP_GAMEPIX === 'true'
  || import.meta.env.VITE_APP_GAME_MONETIZE === 'true'
  || import.meta.env.VITE_APP_YANDEX === 'true'
  || import.meta.env.VITE_APP_POKI === 'true'
  || import.meta.env.VITE_APP_GAMEPUSH === 'true'

const historyMode: 'memory' | 'hash' = isPortalBuild ? 'memory' : 'hash'

const history: RouterHistory = isPortalBuild
  ? createMemoryHistory()
  : createWebHashHistory(import.meta.env.BASE_URL)

// ─── Dev-only tooling routes (art-generation-pipeline) ─────────────────────
//
// `/#/art-sheets` (the art bench: references, fits, prompt export) and
// `/#/playground` (every painted drawable, painted ⇄ drawn live). Gated on the
// `import.meta.env.DEV` LITERAL: `vite build` folds it to `false`, the whole
// array and its dynamic imports are dead code, and no chunk for either view is
// emitted into any portal bundle. Kept out of the exported `routes` table on
// purpose so the host-fragment regression spec keeps driving the real one.
// (Reachable on a plain `pnpm dev`; a `--mode <portal>` dev server uses memory
// history, which no URL can address.)
const devRoutes: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      { path: '/art-sheets', name: 'art-sheets', component: () => import('@/views/ArtSheets.vue') },
      { path: '/playground', name: 'playground', component: () => import('@/views/Playground.vue') },
      { path: '/barrage-lab', name: 'barrage-lab', component: () => import('@/views/BarrageLab.vue') }
    ]
  : []

const router = createRouter({
  history,
  routes: [...devRoutes, ...routes]
})

/** Which history this build ended up with. Surfaced for QA consoles so a
 *  screenshot answers "was the host's URL in play?". */
export const routerHistoryMode = historyMode

export default router
