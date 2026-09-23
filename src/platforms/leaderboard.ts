/**
 * Best-row leaderboard submission (retention-roadmap #16) — Elemental Barrage
 * ranks the deepest endless row; the portal-side board is still named `bestWave`.
 *
 * Platform-gated, defensive, fire-and-forget:
 *   • Yandex   — ysdk.getLeaderboards().setLeaderboardScore('bestWave', …);
 *                afterwards the player's entry is fetched so a banner can show
 *                their rank. Silently no-ops for guests or when the
 *                leaderboard isn't configured in the console.
 *   • Playgama — bridge.leaderboard.setScore(...) where the portal protocol
 *                supports it (the bridge exposes per-portal capabilities).
 *   • GamePix  — sdk.updateScore(bestRow) — the toolkit's score metric (the
 *                plugin's own watcher reports the same best row).
 *   • everything else — silent no-op (CrazyGames' web SDK has no leaderboard;
 *                       Poki's `getLeaderboard()` is `() => Promise.resolve([])`
 *                       in the shipped v2 core and `sendHighscore()` a no-op, so
 *                       there is deliberately no Poki arm here either).
 *
 * Only NEW personal bests are submitted (portals treat scores as max anyway;
 * this just avoids spamming the SDKs on every new row).
 */
import { ref } from 'vue'
import { isYandex, isPlaygama, isGamepix } from '@/use/useUser'
import { getYandexSdk } from '@/utils/yandexPlugin'
import { getPlaygamaBridge } from '@/utils/playgamaPlugin'
import { gamePixUpdateScore } from '@/utils/gamepixPlugin'

const LEADERBOARD_NAME = 'bestWave'

/** Player's rank on the best-wave board, when a platform reported one
 *  (currently Yandex only). Drives the "· #N" suffix on wave-clear banners. */
export const bestWaveRank = ref<number | null>(null)

let lastSubmitted = 0

const submitYandex = async (w: number): Promise<void> => {
  try {
    const sdk = getYandexSdk() as { getLeaderboards?: () => Promise<{
      setLeaderboardScore: (name: string, score: number) => Promise<void>
      getLeaderboardPlayerEntry: (name: string) => Promise<{ rank?: number } | null>
    }> } | null
    if (!sdk?.getLeaderboards) return
    const lb = await sdk.getLeaderboards()
    await lb.setLeaderboardScore(LEADERBOARD_NAME, w)
    const entry = await lb.getLeaderboardPlayerEntry(LEADERBOARD_NAME).catch(() => null)
    const rank = Number(entry?.rank)
    if (Number.isFinite(rank) && rank > 0) bestWaveRank.value = rank
  } catch { /* guest player / board not configured — silent no-op */ }
}

const submitPlaygama = (w: number): void => {
  try {
    const bridge = getPlaygamaBridge()
    // v2 renamed the module `leaderboard` -> `leaderboards` AND changed the
    // call from one options object to positional `(id, score)`. Under v1 this
    // arm therefore did nothing at all: `bridge.leaderboard` was undefined, the
    // optional-chain bailed, and the silent-no-op catch hid it. The Bridge's
    // own types are what surfaced it during the migration.
    if (!bridge?.leaderboards?.setScore) return
    // Unsupported portals reject harmlessly — most of the 28 have no
    // leaderboard at all, and a guest player on one that does is also a
    // rejection. Neither is worth a console line on the player's screen.
    void Promise.resolve(bridge.leaderboards.setScore(LEADERBOARD_NAME, w))
      .catch(() => undefined)
  } catch { /* portal without leaderboard support — silent no-op */ }
}

/**
 * Submit the player's best ENDLESS ROW (Elemental Barrage's score). Called by
 * `useBarrage` at a run's natural edges — a boss checkpoint, a breach, a
 * checkpoint restart — not on every new row: a record run sets a new best every
 * turn, and a portal SDK round-trip per turn is exactly the spam the
 * `lastSubmitted` guard exists to avoid. The portal boards keep their
 * `bestWave` technical name (it is what the consoles are configured with).
 */
export const submitBestRow = (row: number): void => {
  const w = Math.floor(Number(row))
  if (!Number.isFinite(w) || w <= lastSubmitted) return
  lastSubmitted = w
  if (isYandex) void submitYandex(w)
  else if (isPlaygama) submitPlaygama(w)
  else if (isGamepix) gamePixUpdateScore(w)
}

/** @deprecated Merge Idle War's wave-clear hook (legacy `useBattle` only). */
export const submitBestWave = submitBestRow
