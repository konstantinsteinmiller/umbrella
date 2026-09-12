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
// Sticky: the first-ever boss has spawned and the Meteor Storm was coached for
// it (charge filled + button highlighted). Later bosses never repeat it.
export const BATTLE_FIRST_BOSS_COACHED_KEY = 'battle_first_boss_coached'
// First-session FTUE progress: index into the coach-mark step order
// (retention-roadmap #1). Values ≥ 4 ⇔ tutorial finished/skipped.
export const PRISM_TUTORIAL_KEY = 'prism_tutorial_step'
// 2× Damage buff (rewarded ad): epoch-ms timestamp the buff expires at.
export const BATTLE_DMG_BUFF_KEY = 'battle_dmg_buff_until'
// 3× Coin income buff (rewarded ad from a flying chest): milliseconds of the
// buff still OWED to the player. Stored as remaining-time rather than an expiry
// timestamp on purpose — the buff drains on play time, not wall-clock, so
// closing the tab or sitting in a menu can't silently eat it.
export const BATTLE_COIN_BUFF_KEY = 'battle_coin_buff_left'
// How many flying chests the player has opened. Drives the "every 2nd chest"
// cadence of the coin-buff offer; persisted so a reload can't reset the parity
// and hand out offers twice as often.
export const BATTLE_CHEST_OPENS_KEY = 'battle_chest_opens'
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
// Arena skills, slots 5–8 (Warcry of the Legion, Legion Call, and — desktop
// only — Executioner's Mark and Soul Pact). The first three charge per kill like
// the spells above; Soul Pact runs on a play-time cooldown, persisted as the
// milliseconds LEFT so a closed tab cannot run it down.
export const BATTLE_WARCRY_UNLOCKED_KEY = 'battle_warcry_unlocked'
export const BATTLE_WARCRY_CHARGE_KEY = 'battle_warcry_charge'
export const BATTLE_LEGION_UNLOCKED_KEY = 'battle_legion_unlocked'
export const BATTLE_LEGION_CHARGE_KEY = 'battle_legion_charge'
export const BATTLE_MARK_UNLOCKED_KEY = 'battle_mark_unlocked'
export const BATTLE_MARK_CHARGE_KEY = 'battle_mark_charge'
export const BATTLE_PACT_UNLOCKED_KEY = 'battle_pact_unlocked'
export const BATTLE_PACT_COOLDOWN_KEY = 'battle_pact_cooldown_left'
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
// ─── Global leaderboard (the Cloudflare board, see `useLeaderboard.ts`) ──────
// The player's stable leaderboard id. Also mirrored to a standalone
// localStorage key OUTSIDE the state blob (`merge-idle-war_uid`) — see
// `usePlayerIdentity`: a cloud hydrate carrying an older blob must never be able
// to erase it, because a lost id is a duplicate row that cannot be repaired.
export const PLAYER_ID_KEY = 'lb_player_id'
// Tier 1 name: chosen by the player. Highest precedence, never overwritten.
export const PLAYER_NAME_KEY = 'lb_player_name'
// Tier 2: the last name a platform SDK gave us (CrazyGames username),
// REMEMBERED so an offline session does not flip the row back to a generated one.
export const SDK_NAME_KEY = 'lb_sdk_name'
// Tier 3: the generated name (`Warlord483105`), minted once and kept.
export const ANON_NAME_KEY = 'lb_anon_name'
// The name the row currently carries on the server. A mismatch is what triggers
// the one relabel POST.
export const POSTED_NAME_KEY = 'lb_posted_name'
// The best wave the server has ACCEPTED. The whole write rule is `best > this`,
// so it may only be set after a confirmed 200.
export const SUBMITTED_SCORE_KEY = 'lb_submitted_score'
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
