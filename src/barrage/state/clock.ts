/**
 * A shared wall-clock ref for the time-based meta (supply-drop countdown, the
 * daily board's date). One 1 s interval, running only while at least one
 * mounted component holds it — a countdown nobody is looking at costs nothing.
 */
import { getCurrentInstance, onMounted, onUnmounted, ref, type Ref } from 'vue'

export const now: Ref<number> = ref(Date.now())

let holders = 0
let timer: ReturnType<typeof setInterval> | null = null

export const touchClock = (): number => {
  now.value = Date.now()
  return now.value
}

const hold = (): void => {
  holders++
  touchClock()
  if (timer === null) timer = setInterval(touchClock, 1000)
}

const release = (): void => {
  holders = Math.max(0, holders - 1)
  if (holders === 0 && timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

/** Keep the clock ticking for the lifetime of the calling component. Outside a
 *  component (tests, plain modules) it just refreshes the value once. */
export const useTickingClock = (): Ref<number> => {
  if (getCurrentInstance()) {
    onMounted(hold)
    onUnmounted(release)
  } else {
    touchClock()
  }
  return now
}

/** Local calendar day, 'YYYY-MM-DD' — the Daily Barrage board changes at the
 *  player's own midnight, not UTC's (a UTC board would roll over mid-afternoon
 *  for half the world). */
export const localYmd = (ms: number): string => {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
