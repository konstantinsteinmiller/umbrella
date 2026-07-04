/**
 * Offline earnings — the "welcome back" re-open driver (retention-roadmap #3).
 *
 * While the game is closed the Imp Sergeant "keeps fighting": on boot, the
 * time since `battle_last_seen` is converted into gold using the same wave
 * economy the live game pays —
 *
 *   goldPerSec ≈ waveBounty(wave) × enemiesPerWave / ~35 s per wave cycle
 *
 * scaled by an Imp-automation factor (15% baseline, +6%/level, capped at 80%
 * of live income so playing always beats leaving), for absences of 3 minutes
 * to 8 hours. The scene shows `WelcomeBackModal` whenever `offlineGold` > 0;
 * claiming consumes it (2× behind a rewarded ad).
 *
 * The checkpoint is touched on pagehide / tab-hide plus a 30 s heartbeat, so
 * a crash mid-session costs at most half a minute of accrual accuracy.
 * Cloud hydration can land AFTER module init and swap the blob under us —
 * the grant is re-derived on `saveDataVersion` (unless already claimed this
 * session) so the cloud's older timestamp wins over our fresh boot touch.
 */
import { ref, watch } from 'vue'
import { getState, setState, flushPersist } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { BATTLE_LAST_SEEN_KEY, BATTLE_WAVE_KEY } from '@/keys'
import { battleUpgrades } from '@/use/useBattle'
import { waveBounty } from '@/game/units'

const OFFLINE_MIN_MS = 3 * 60_000
const OFFLINE_CAP_MS = 8 * 3_600_000
/** Seconds a full wave cycle takes on average (fight + clear + countdown). */
const WAVE_CYCLE_SECS = 35

/** Pending welcome-back gold (0 ⇔ nothing to claim). */
export const offlineGold = ref(0)

let claimedThisSession = false

const touch = (): void => { setState(BATTLE_LAST_SEEN_KEY, Date.now()) }

const evaluate = (): void => {
  const last = Number(getState(BATTLE_LAST_SEEN_KEY, 0)) || 0
  if (last <= 0) return // first-ever boot — nothing accrued
  const elapsedMs = Math.min(OFFLINE_CAP_MS, Date.now() - last)
  if (elapsedMs < OFFLINE_MIN_MS) return
  const w = Math.max(1, Math.floor(Number(getState(BATTLE_WAVE_KEY, 1))) || 1)
  const enemiesPerWave = Math.min(22, 4 + Math.floor(w * 1.25))
  const goldPerSec = (waveBounty(w) * enemiesPerWave) / WAVE_CYCLE_SECS
  const impFactor = Math.min(0.8, 0.15 + battleUpgrades.value.automation * 0.06)
  offlineGold.value = Math.max(5, Math.round((elapsedMs / 1000) * goldPerSec * impFactor))
}

/** Consume the pending grant (the modal adds the coins itself, possibly ×2). */
export const consumeOfflineGold = (): number => {
  const g = offlineGold.value
  offlineGold.value = 0
  claimedThisSession = true
  touch()
  return g
}

// ─── Boot ────────────────────────────────────────────────────────────────────
evaluate()
touch()

// Cloud hydration may replace the blob with the REAL last session's timestamp
// after our boot touch — re-derive as long as nothing was claimed yet.
watch(saveDataVersion, () => {
  if (!claimedThisSession) evaluate()
  touch()
})

if (typeof window !== 'undefined') {
  const checkpoint = (): void => { touch(); flushPersist() }
  window.addEventListener('pagehide', checkpoint)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') checkpoint()
  })
  // Heartbeat: rides the debounced blob write — negligible cost.
  window.setInterval(touch, 30_000)
}
