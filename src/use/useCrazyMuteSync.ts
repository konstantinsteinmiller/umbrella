import { onMounted, onUnmounted, computed } from 'vue'
import useUser, { DEFAULT_SOUND_VOLUME, DEFAULT_MUSIC_VOLUME } from '@/use/useUser'
import { isSdkActive, onCrazyMuteChange } from '@/use/useCrazyGames'
import { setPlatformAudioMuted } from '@/use/useGamePauseAudio'

// ─── Two mutes, two owners ──────────────────────────────────────────────────
//
//   • The PLATFORM mute (CrazyGames toolbar, `settings.muteAudio`) belongs to
//     the portal. It drives the engine-level hard mute (`setPlatformAudioMuted`
//     → suspended audio layer + the reactive `isPlatformAudioMuted` ref) and
//     NOTHING ELSE. It never writes the player's volume settings.
//   • The IN-GAME mute (this button, the option sliders) belongs to the player
//     and is what persists.
//
// They used to be one: a CG mute zeroed the stored volumes (to make the
// in-game button "reflect" it). Those volumes persist — cloud save included —
// so a player who reloaded while CG was muted came back to sliders at 0 and a
// silent game even after the portal unmuted. The hard mute alone already
// outranks every in-game setting (CG docs: muteAudio "should take priority over
// your in-game audio settings"), so the zeroing bought nothing and cost that.

const { userSoundVolume, userMusicVolume, setSettingValue } = useUser()

/** The IN-GAME mute: both persisted volumes at 0. The platform mute is not
 *  folded in — it is not the player's setting and this button cannot undo it. */
const isMuted = computed(() => userMusicVolume.value === 0 && userSoundVolume.value === 0)

// Volumes at the moment the player muted in-game, so unmute restores them.
let muteSnapshot: { music: number; sound: number } | null = null

/** Apply a mute that originated from the CrazyGames platform toolbar: the
 *  engine-level hard mute only. Persisted volumes are never touched. */
export const applyPlatformMute = (muted: boolean): void => {
  setPlatformAudioMuted(muted)
}

/** The in-game button. Acts on the player's own (persisted) volumes. */
export const toggleMute = (): void => {
  if (!isMuted.value) {
    muteSnapshot = { music: userMusicVolume.value, sound: userSoundVolume.value }
    setSettingValue('music', 0)
    setSettingValue('sound', 0)
    return
  }
  // Unmuting: the snapshot if this session muted, else audible defaults — a
  // game that booted at a saved 0/0 must still be unmutable ("FMuteButton
  // can't unmute on CG").
  setSettingValue('music', muteSnapshot?.music || DEFAULT_MUSIC_VOLUME)
  setSettingValue('sound', muteSnapshot?.sound || DEFAULT_SOUND_VOLUME)
  muteSnapshot = null
}

export { isMuted }

/**
 * App-level hook. The hard-mute bridge itself is installed by
 * `initCrazyGames()` before the App mounts (so a muted boot is silent from the
 * first sound); this subscription is an idempotent second path that keeps the
 * bridge alive if the SDK came up after init. `setPlatformAudioMuted` is
 * edge-triggered, so the double subscription cannot double-suspend.
 */
export const useCrazyMuteSync = () => {
  let unsubscribe: (() => void) | null = null
  onMounted(() => {
    if (!isSdkActive.value) return
    unsubscribe = onCrazyMuteChange(applyPlatformMute)
  })
  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
  })
}
