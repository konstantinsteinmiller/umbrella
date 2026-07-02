// ─── Game-progress field catalogue ──────────────────────────────────────────
//
// Field names INSIDE the single `prism_state` blob (see `useEpicState.ts`).
// These are not separate localStorage keys — they're properties of the one
// persisted object — but they're still a contract with the player base:
// renaming any of them strands existing players' progress on the old field.
// Treat them as load-bearing constants.

// ─── Merge Alchemy Lab (the live game) ──────────────────────────────────────
// Cosmic Gold wallet (shared `useEpicConfig` wallet — kept as `epic_coins` so the
// reused CoinBadge / coin-explosion VFX bind to it without a migration).
export const GOLD_KEY = 'epic_coins'
// The merge grid: a flat array of (tier:number | null), length rows*cols.
export const GRID_KEY = 'prism_grid'
// Lab upgrade levels: { heat, pressure, containment, automation }.
export const PRISM_UPGRADES_KEY = 'prism_upgrades'
// Discovered recipes: string[] of recipe ids placed into the Index book.
export const PRISM_INDEX_KEY = 'prism_index'
// Lifetime stats: { brews, merges, legendaries, sludge, maxTier, spawns }.
export const PRISM_STATS_KEY = 'prism_stats'
// First-session onboarding consumed flag (true once the first brew completes).
export const PRISM_ONBOARDED_KEY = 'prism_onboarded'
// Collection-page milestone multipliers already claimed: string[] of page ids.
export const PRISM_PAGE_REWARDS_KEY = 'prism_page_rewards'
// Highest ingredient tier the player has ever created (drives base-spawn unlocks).
export const PRISM_MAX_TIER_KEY = 'prism_max_tier'
// Permanent upgrade-cost discount (percent) accumulated from recipe effects.
export const PRISM_DISCOUNT_KEY = 'prism_discount'

export const STAGE_KEY = 'epic_stage'
export const COINS_KEY = 'epic_coins'
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
