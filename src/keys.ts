// ─── Game-progress field catalogue ──────────────────────────────────────────
//
// Field names INSIDE the single `merge-idle-war_state` blob (see `useEpicState.ts`).
// These are not separate localStorage keys — they're properties of the one
// persisted object — but they're still a contract with the player base:
// renaming any of them strands existing players' progress on the old field.
// Treat them as load-bearing constants.

// ─── Merge Legion (the live game: merge grid + auto-battler) ────────────────
// Gold wallet (shared `useEpicConfig` wallet — kept as `epic_coins` so the
// reused CoinBadge / coin-explosion VFX bind to it without a migration).
export const GOLD_KEY = 'epic_coins'
// The merge grid: a flat array of (tier:number | null), length rows*cols.
export const GRID_KEY = 'prism_grid'
// Lifetime stats: { kills, bossKills, waves, merges, spawns, fieldMerges }.
export const PRISM_STATS_KEY = 'prism_stats'
// Highest unit tier the player has ever created.
export const PRISM_MAX_TIER_KEY = 'prism_max_tier'
// Instant-spawn buff (rewarded ad): epoch-ms timestamp the buff expires at.
export const PRISM_INSTANT_SPAWN_KEY = 'prism_instant_spawn_until'
// Battle upgrade levels: { attack, vitality, bounty, automation }.
export const BATTLE_UPGRADES_KEY = 'battle_upgrades'
// The wave currently being fought (resumed on reload).
export const BATTLE_WAVE_KEY = 'battle_wave'
// Highest wave ever reached.
export const BATTLE_BEST_WAVE_KEY = 'battle_best_wave'
// The deployed army: number[] of fighter tiers (restored at full HP on load).
export const BATTLE_ARMY_KEY = 'battle_army'
// Meteor Storm ultimate charge (0..100).
export const BATTLE_ULT_KEY = 'battle_ult'
// First-session FTUE progress: index into the coach-mark step order
// (retention-roadmap #1). Values ≥ 4 ⇔ tutorial finished/skipped.
export const PRISM_TUTORIAL_KEY = 'prism_tutorial_step'
// 2× Damage buff (rewarded ad): epoch-ms timestamp the buff expires at.
export const BATTLE_DMG_BUFF_KEY = 'battle_dmg_buff_until'
// Rubber-band catch-up: epoch-ms timestamp the "-25% enemy stats" window
// (granted when a wipe drops the player to their best-wave floor) expires at.
export const BATTLE_RUBBER_BAND_KEY = 'battle_rubberband_until'
// Unlockable arena spells (coin sinks). Sticky "purchased" flags + their 0..100
// charge (1% per kill once unlocked). Meteor is free/always-on; these two are
// bought for coins before they can charge and fire.
export const BATTLE_HEAL_UNLOCKED_KEY = 'battle_heal_unlocked'
export const BATTLE_HEAL_CHARGE_KEY = 'battle_heal_charge'
export const BATTLE_REVIVE_UNLOCKED_KEY = 'battle_revive_unlocked'
export const BATTLE_REVIVE_CHARGE_KEY = 'battle_revive_charge'
export const BATTLE_DEFENDER_UNLOCKED_KEY = 'battle_defender_unlocked'
export const BATTLE_DEFENDER_CHARGE_KEY = 'battle_defender_charge'
// How many times each spell has been cast (per spell id) — the explanation toast
// only shows for the first few casts, after which the player knows the effect.
export const BATTLE_SPELL_CASTS_KEY = 'battle_spell_casts'
// Highest wave that has already resolved its MUTATION roll. A wave only rolls the
// once (on first reach) — so a rubber-band setback never re-mutates a wave the
// player has already fought; only pushing past the ceiling rolls again.
export const BATTLE_MUTATION_CEILING_KEY = 'battle_mutation_ceiling'
// Last moment the game was alive (epoch ms) — drives the offline-earnings
// "welcome back" grant (retention-roadmap #3). Touched on pagehide/tab-hide
// plus a slow heartbeat while playing.
export const BATTLE_LAST_SEEN_KEY = 'battle_last_seen'
// (Retired alchemy fields — `prism_upgrades`, `prism_index`, `prism_onboarded`,
// `prism_page_rewards`, `prism_discount` — may still sit orphaned inside old
// players' blobs; they are simply ignored.)

export const STAGE_KEY = 'epic_stage'
export const COINS_KEY = 'epic_coins'
// Coin-mode buff economy: sticky flag set once the player has bought their
// FIRST Instant Spawn with coins (the first is discounted, the rest cost full).
export const FIRST_INSTANT_SPAWN_KEY = 'epic_first_instant_spawn_used'
export const UPGRADES_KEY = 'epic_upgrades'
export const BEST_SCORE_KEY = 'epic_best_score'
// Pre-bought "Second Chance": a sticky flag that arms the player to start every
// run with angel wings + the second-chance shield until one is consumed.
export const START_SECOND_CHANCE_KEY = 'epic_start_second_chance'
// Cosmetic ball skins: { owned: string[], selected: string }. Owned IDs are
// purchased with coins; `selected` is the equipped skin rendered on the ball.
export const SKINS_KEY = 'epic_skins'
// Best tiles travelled in ENDLESS mode (separate from the campaign best score).
export const BEST_ENDLESS_KEY = 'epic_best_endless'
// First-run onboarding assist consumed flag (true once the first run finishes).
export const ONBOARDED_KEY = 'epic_onboarded'
// Daily missions: { day: 'YYYY-MM-DD', missions: Mission[] } (regen per day).
export const MISSIONS_KEY = 'epic_missions'
// First-run-of-day 2× bonus bookkeeping: the local day it was last consumed.
export const DAILY_BONUS_DAY_KEY = 'epic_daily_bonus_day'
// One-time "you can afford an upgrade" spotlight on the Upgrades button (#16).
export const UPGRADE_SPOTLIGHT_KEY = 'epic_upgrade_spotlight_seen'
// Achievements (roadmap #13): { claimed: string[], stats: { tiles, coins,
// items, clears, bestRun } }. Lifetime counters + which milestones were banked.
export const ACHIEVEMENTS_KEY = 'epic_achievements'
// Skin IDs the player has already seen in the Skin shop — drives the "NEW!"
// badge on freshly-owned / newly-unlocked skins (roadmap #12). string[].
export const SKINS_SEEN_KEY = 'epic_skins_seen'
// Mobile-only hard audio mute (boolean). On phones the OS volume rocker owns the
// device level and the Web Audio gain has no effect, so the on-screen mute is a
// silence toggle instead: suspend all audio + block new music/SFX. Persisted so
// it sticks across sessions; only ever honoured on mobile (see useMobileAudioMute).
export const MOBILE_MUTE_KEY = 'epic_mobile_mute'
