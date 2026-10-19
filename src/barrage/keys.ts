// ─── Umbrella — save-field catalogue ────────────────────────────────
//
// Field names INSIDE the single `umbrella_state` blob (see
// `src/use/useEpicState.ts`). Same rules as `src/keys.ts`: these are not their
// own localStorage entries, but they ARE a contract with every player's save —
// renaming one strands that progress on the old field, on this device and in
// every portal's cloud copy. Treat them as load-bearing constants.
//
// Every barrage field carries the `eb_` prefix so it can never collide with a
// leftover Merge Idle War field (`prism_*`, `battle_*`) that still sits in an
// old blob. The cloud strategies mirror the whole blob, so nothing here needs
// its own allowlist entry.

import { STAGE_KEY } from '@/keys'

// The endless run, snapshotted every time the engine settles in 'aim':
// `{ v: 1, snap: RunSnapshot, stamp: string }`. `stamp` is unique per write —
// a cloud hydrate that hands back a DIFFERENT stamp carries a run this session
// did not write, which is how a fresh default run knows it must yield to it.
export const EB_RUN_KEY = 'umb_run'
// Deepest row ever reached in the endless mode (the leaderboard score).
export const EB_BEST_ROW_KEY = 'umb_best_row'
// The checkpoint: `{ row, tray, deaths }` — the last defeated boss row (0 before the
// first boss) and the tray as it was at that kill. A breach restarts here.
// `deaths` counts the restarts lost to the next boss (boss mercy; reset by a kill).
export const EB_CHECKPOINT_KEY = 'umb_checkpoint'
// Upgrade levels: `Record<UpgradeId, number>`.
export const EB_UPGRADES_KEY = 'umb_upgrades'
// Lifetime stats (achievements / battle pass / codex): see `BarrageStats`.
export const EB_STATS_KEY = 'umb_stats'
// Per-checkpoint-segment one-shots: `{ meteor: boolean, bonusBalls: boolean }`.
// Persisted so a reload cannot hand out a second Meteor continue (or a second
// rewarded +5 balls) inside the same segment. Cleared on a boss kill and on a
// checkpoint restart — each is a new segment.
export const EB_SEGMENT_KEY = 'umb_segment'
// First-session script progress: `{ done, firstMerge, freeCapacity }`.
// `done` flips on the first boss kill — the engine's `ftue` config follows it.
export const EB_FTUE_KEY = 'umb_ftue'
// Launchers + ball skins: `{ launchers, selectedLauncher, skins, selectedSkin,
// seenSkins, seenLaunchers }` — owned ids, the equipped ones, and what the
// player has already looked at (drives the NEW badges).
export const EB_COLLECTIONS_KEY = 'umb_collections'
// Daily Barrage record: `{ day, best, attempts, lastDay, streak }` — today's
// board (local YYYY-MM-DD), today's best row and attempts, and the streak of
// consecutive days with at least one attempt.
export const EB_DAILY_KEY = 'umb_daily'
// The treasure chest (`useSupplyDrop.ts`): epoch ms of the last claim — a small
// gift 3 min later, a big one after 10. Wall clock, so it fills while closed.
// Absent until the chest is first shown (then armed at the small stage).
export const EB_SUPPLY_KEY = 'umb_supply'
// Rewards owed to the ENDLESS run that could not be applied the moment they
// were granted (a battle-pass ball claimed during a daily run, a supply-drop
// charge claimed mid-volley): `{ balls: number[], skills: SkillId[] }`.
// Persisted so a reload between grant and delivery loses nothing.
export const EB_PENDING_KEY = 'umb_pending'

// Coach-mark step index of the first-session tutorial (`useTutorial.ts`):
// aim → pickup → merge → upgrade → done. Persisted so a reload mid-tutorial
// resumes the same coach mark instead of replaying the first shot.
export const EB_TUTORIAL_STEP_KEY = 'umb_tutorial_step'
// Monster kinds whose "new monster" intro banner has already shown
// (`BarrageBanners.vue`, retired): MonsterKind[]. Read once as a migration
// source by the coach, so a veteran's known monsters never wear rule badges.
export const EB_MONSTERS_SEEN_KEY = 'umb_ui_monsters_seen'
// The wordless coach (`use/useCoach.ts`): `{ v: 1, shown: Record<LessonId,
// number>, kinds: Record<tagKey, number> }` — how often each lesson has been
// shown, and for how many aim phases each monster kind has worn its in-world
// rule badge (a kind stops being tagged at TAG_TURNS). `shown` also counts two
// non-lesson beats: `arrows` (the gold rune arrows of the upgrade funnel, capped)
// and `mergeBox` (paused merge lightboxes — the first three merges are shown).
export const EB_COACH_KEY = 'umb_coach'
// Earned HUD features (`use/useFeatureUnlocks.ts`): `{ v: 1, n, losses, seen }`
// — how many steps of the unlock ladder are open, lifetime endless losses (the
// ladder's second arm), and which unlocked features the player has tapped.
export const EB_UNLOCKS_KEY = 'umb_unlocks'

// The cloud merge policy (`SaveMergePolicy.computeMeta`) scores a save by
// `epic_stage × 500`. Nothing in this game has stages, so the best row is
// mirrored into that field: a veteran's cloud save then outranks a fresh
// device's row-1 run on conflict instead of losing on a timestamp tie.
export const EB_MERGE_SCORE_KEY = STAGE_KEY
