/**
 * Daily Barrage — the record side (contract: `UseDailyBarrage`).
 *
 * Everyone gets the same board on the same local day: the seed comes from
 * `economy.dailySeed(today)` and the run uses the fixed `DAILY_CONFIG`, so
 * upgrades never make one player's board easier than another's. `useBarrage`
 * owns the run itself (`startDaily` / `exitDaily`); this file owns what the
 * player carries away from it — today's best, attempts, and the streak.
 *
 * The best is recorded LIVE as rows spawn, not only on the final breach: a
 * reload or a closed tab mid-run must never cost the player the row they
 * reached.
 */
import { computed, ref, watch, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { saveDataVersion } from '@/use/useSaveStatus'
import { dailySeed } from '../engine/economy'
import { EB_DAILY_KEY } from '../keys'
import { localYmd, now, touchClock, useTickingClock } from './clock'
import { mode, toCount } from './progress'
import type { UseDailyBarrage } from './contract'

export interface DailyRecord {
  /** The day `best` / `attempts` belong to. */
  day: string
  best: number
  attempts: number
  /** Last day with at least one attempt, and the run of consecutive such days. */
  lastDay: string
  streak: number
  /** Deepest daily row on any day (codex / achievements flavour). */
  bestEver: number
}

const read = (): DailyRecord => {
  const raw = getState<Partial<DailyRecord> | null>(EB_DAILY_KEY, null) ?? {}
  return {
    day: typeof raw.day === 'string' ? raw.day : '',
    best: toCount(raw.best),
    attempts: toCount(raw.attempts),
    lastDay: typeof raw.lastDay === 'string' ? raw.lastDay : '',
    streak: toCount(raw.streak),
    bestEver: toCount(raw.bestEver)
  }
}

export const dailyRecord: Ref<DailyRecord> = ref(read())

const persist = (): void => setState(EB_DAILY_KEY, dailyRecord.value)

// Hydration: same day → the higher best / attempts win; a newer day wins
// outright (the other side is simply yesterday's record).
watch(saveDataVersion, () => {
  const saved = read()
  const cur = dailyRecord.value
  if (saved.day > cur.day) {
    dailyRecord.value = { ...saved, bestEver: Math.max(saved.bestEver, cur.bestEver) }
  } else if (saved.day === cur.day) {
    dailyRecord.value = {
      ...cur,
      best: Math.max(cur.best, saved.best),
      attempts: Math.max(cur.attempts, saved.attempts),
      streak: Math.max(cur.streak, saved.streak),
      lastDay: saved.lastDay > cur.lastDay ? saved.lastDay : cur.lastDay,
      bestEver: Math.max(cur.bestEver, saved.bestEver)
    }
  }
})

const dayBefore = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  // Noon avoids a DST shift turning "one day earlier" into two.
  return localYmd(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) - 1, 12).getTime())
}

export const todayYmd = (): string => localYmd(touchClock())

/** Seed of today's board. */
export const todaySeed = (): number => dailySeed(todayYmd())

/** A daily run started: count the attempt and extend (or restart) the streak. */
export const recordDailyAttempt = (): void => {
  const today = todayYmd()
  const cur = dailyRecord.value
  const sameDay = cur.day === today
  let streak = cur.streak
  if (cur.lastDay !== today) streak = cur.lastDay === dayBefore(today) ? cur.streak + 1 : 1
  dailyRecord.value = {
    ...cur,
    day: today,
    best: sameDay ? cur.best : 0,
    attempts: (sameDay ? cur.attempts : 0) + 1,
    lastDay: today,
    streak
  }
  persist()
}

/** The daily run reached `row`. Returns true when it is a new best for today. */
export const recordDailyRow = (row: number): boolean => {
  const today = todayYmd()
  const cur = dailyRecord.value
  const best = cur.day === today ? cur.best : 0
  if (!Number.isFinite(row) || row <= best) return false
  dailyRecord.value = {
    ...cur,
    day: today,
    attempts: cur.day === today ? cur.attempts : 0,
    best: Math.floor(row),
    bestEver: Math.max(cur.bestEver, Math.floor(row))
  }
  persist()
  return true
}

const today = computed(() => localYmd(now.value))

const api: UseDailyBarrage = {
  today,
  seed: computed(() => dailySeed(today.value)),
  todayBest: computed(() => (dailyRecord.value.day === today.value ? dailyRecord.value.best : 0)),
  attemptsToday: computed(() => (dailyRecord.value.day === today.value ? dailyRecord.value.attempts : 0)),
  // A streak survives until the end of the day AFTER its last attempt — it is
  // still "alive" today even before today's attempt.
  streak: computed(() => {
    const r = dailyRecord.value
    return r.lastDay === today.value || r.lastDay === dayBefore(today.value) ? r.streak : 0
  }),
  isActive: computed(() => mode.value === 'daily')
}

export default function useDailyBarrage(): UseDailyBarrage {
  useTickingClock()
  return api
}
