/**
 * Best-wave leaderboard submission (retention-roadmap #16).
 *
 * Platform-gated, defensive, fire-and-forget:
 *   • Yandex   — ysdk.getLeaderboards().setLeaderboardScore('bestWave', …);
 *                afterwards the player's entry is fetched so the wave-clear
 *                banner can show their rank. Silently no-ops for guests or
 *                when the leaderboard isn't configured in the console.
 *   • Playgama — bridge.leaderboard.setScore(...) where the portal protocol
 *                supports it (the bridge exposes per-portal capabilities).
 *   • GamePix  — sdk.updateScore(bestWave) — the toolkit's score metric.
 *                (The plugin's legacy gamesPlayed watcher only writes once at
 *                boot in this game; best-wave submissions supersede it.)
 *   • everything else — silent no-op (CrazyGames' web SDK has no leaderboard).
 *
 * Only NEW personal bests are submitted (portals treat scores as max anyway;
 * this just avoids spamming the SDKs on every wave clear).
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
    if (!bridge?.leaderboard?.setScore) return
    // Option shape differs per portal protocol; the common fields cover the
    // supported ones and unsupported portals reject harmlessly.
    void Promise.resolve(bridge.leaderboard.setScore({ score: w, leaderboardName: LEADERBOARD_NAME }))
      .catch(() => undefined)
  } catch { /* portal without leaderboard support — silent no-op */ }
}

/** Called from the wave-clear checkpoint with the (possibly new) best wave. */
export const submitBestWave = (wave: number): void => {
  const w = Math.floor(Number(wave))
  if (!Number.isFinite(w) || w <= lastSubmitted) return
  lastSubmitted = w
  if (isYandex) void submitYandex(w)
  else if (isPlaygama) submitPlaygama(w)
  else if (isGamepix) gamePixUpdateScore(w)
}
