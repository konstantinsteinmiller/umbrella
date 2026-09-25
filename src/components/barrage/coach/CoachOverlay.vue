<script setup lang="ts">
/**
 * The wordless coach on screen (`useCoach.ts` decides WHAT; this shows it).
 *
 *   pull     — the shot acted out inside the board (FingerDemo, teach): a
 *              ghost finger drags toward the monsters, the ghost line grows
 *              under it, release, a ghost ball flies. The idle nudge, and
 *              after two empty taps on the unit.
 *   combo    — the ghost finger aims a real bank shot and the ball flies its
 *              path; each monster hit counts up and the volley total pops at
 *              the end. The first one comes early (FTUE turn 2–3, `bank`):
 *              play-testers who found the shot never found out it can be
 *              ANGLED.
 *   survive  — the monsters about to break through get a red reticle over
 *              the line they would cross; then the rescue shot (and a gold
 *              ring on the skill bubble it takes). How many marches are left
 *              is the canvas's own always-on danger pips now, so the coach
 *              no longer draws its chevrons (they doubled the pips).
 *   tray     — TrayDemo: why "+1" did not add a shot, and the fix.
 *   trayIntro — TrayIntroDemo: what the tray is (shots · "+1" · merge).
 *
 * Beside them, the upgrade funnel (UpgradeFunnel): runic gold arrows on the
 * chip to buy, the wallet paying into it and the hand pressing it — nothing
 * during a survive lesson (danger comes first). Past the first 3 volleys the
 * coach gives a due funnel the hand outright (the shot demos yield, run 4);
 * only before that can a shot lesson share the screen with it, and then the
 * funnel keeps its arrows and drops its own hand (one hand at a time).
 *
 * Everything is pointer-events: none and gets out of the way the moment a
 * finger is on the board. The sentence for each lesson exists only in the
 * sr-only live region.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import { FLOOR_Y, MIN_AIM, ROWS } from '@/barrage/engine/types'
import {
  coachLesson, isShotLesson, noteFunnelVisible, noteLessonVisible, upgradeFunnel, type CoachLesson
} from '@/use/useCoach'
import { tutorialActive, tutorialPreview } from '@/use/useTutorial'
import { unlocking } from '@/use/useFeatureUnlocks'
import { isAnyModalOpen } from '@/use/useModalState'
import { activeReveal } from '@/use/useTierReveal'
import { boardApi, playerAiming } from '@/components/barrage/barrageUi'
import { mergeBox } from '@/components/barrage/mergeLightbox'
import { pickupBox } from '@/components/barrage/pickupSpotlight'
import { lessonSpot } from '@/components/barrage/lessonSpotlight'
import FingerDemo from '@/components/barrage/coach/FingerDemo.vue'
import TrayDemo from '@/components/barrage/coach/TrayDemo.vue'
import TrayIntroDemo from '@/components/barrage/coach/TrayIntroDemo.vue'
import UpgradeFunnel from '@/components/barrage/coach/UpgradeFunnel.vue'

interface Pt { x: number; y: number }
interface Box { left: number; top: number; width: number; height: number }

const { t } = useI18n()
const barrage = useBarrage()

// An earned feature flying in (FeatureUnlockFx) and the merge lightbox own the
// moment too.
const blocked = computed(() =>
  isAnyModalOpen.value || !!activeReveal.value || barrage.holdSim.value || barrage.phase.value !== 'aim'
  || !!unlocking.value || !!mergeBox.value || !!pickupBox.value || !!lessonSpot.value)
/** The FTUE's own hand is on screen: never two coaches at once. (It steps
 *  aside by itself for the early bank shot — see TutorialOverlay.) */
const ftueShowing = computed(() => tutorialActive.value && tutorialPreview.value !== null)
const lessonVisible = computed(() =>
  !!coachLesson.value && !blocked.value && !playerAiming.value && !ftueShowing.value)

// Exposure = the first frame a lesson is actually on screen.
watch([lessonVisible, () => coachLesson.value?.seq], () => {
  const l = coachLesson.value
  if (lessonVisible.value && l) noteLessonVisible(l)
}, { immediate: true })

// ─── The upgrade funnel ──────────────────────────────────────────────────────
/**
 * The funnel's duty cycle (playtest run 8: the arrows "stay up forever" — a
 * player who does not want that upgrade has to look at them the whole time):
 * FUNNEL_ON_MS up, then FUNNEL_REST_MS away, and back while the chip is still
 * unbought. Wall-clock, so the gaps between aim phases do not restart it; a
 * funnel pointing at a different chip starts a fresh cycle.
 */
const FUNNEL_ON_MS = 10_000
const FUNNEL_REST_MS = 20_000
const funnelResting = ref(false)
let dutyTarget: string | null = null
let dutyStart = 0
let dutyPoll = 0
const dutyTick = (): void => {
  const p = (Date.now() - dutyStart) % (FUNNEL_ON_MS + FUNNEL_REST_MS)
  funnelResting.value = p >= FUNNEL_ON_MS
}
watch(() => upgradeFunnel.value?.target ?? null, (target) => {
  if (!target) return
  if (target !== dutyTarget) {
    dutyTarget = target
    dutyStart = Date.now()
  }
  dutyTick()
  if (!dutyPoll) dutyPoll = window.setInterval(dutyTick, 250)
}, { immediate: true })
/** Danger first: a survive lesson on screen takes the funnel off it. */
const funnelVisible = computed(() =>
  !!upgradeFunnel.value && !funnelResting.value && !blocked.value && !playerAiming.value && !ftueShowing.value
  && !(lessonVisible.value && coachLesson.value?.id === 'survive'))
/** A shot lesson has the ghost finger: the funnel keeps its arrows and drops
 *  its own hand (one hand on screen at a time). */
const funnelQuiet = computed(() => lessonVisible.value && isShotLesson(coachLesson.value))
watch([funnelVisible, () => upgradeFunnel.value?.seq], () => {
  const f = upgradeFunnel.value
  if (funnelVisible.value && f) noteFunnelVisible(f)
}, { immediate: true })
const funnelSr = computed(() => {
  const f = funnelVisible.value ? upgradeFunnel.value : null
  if (!f) return ''
  return f.reason === 'damage'
    ? t('barrage.coach.funnel', { name: t('barrage.upgrades.damage.name') })
    : t('barrage.coach.upgrade')
})

// ─── Board geometry (client px), re-measured while something shows ───────────
const geo = ref<{ launcher: Pt; cell: number; bounds: Box | null } | null>(null)
const measureTick = ref(0)
const measure = (): void => {
  const b = boardApi.value
  const L = b?.launcherClientPoint()
  const o = b?.cellToClient(0, 0)
  const o1 = b?.cellToClient(1, 0)
  const r = b?.boardClientRect() ?? null
  const bounds = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
  geo.value = L && o && o1 ? { launcher: L, cell: Math.max(8, o1.x - o.x), bounds } : null
  measureTick.value++
}
const toClient = (x: number, y: number): Pt | null => boardApi.value?.cellToClient(x, y) ?? null
const flatToClient = (flat: readonly number[]): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const p = toClient(flat[i]!, flat[i + 1]!)
    if (p) out.push(p)
  }
  return out
}
const dirOf = (angle: number): Pt => ({ x: Math.cos(angle), y: -Math.sin(angle) })

// ─── pull: aim at the monster most directly above the unit ───────────────────
const pullAngle = (): number => {
  const st = barrage.engine.value.state
  const lx = st.launcherX
  let best: Pt | null = null
  let bestD = Infinity
  for (const m of st.monsters) {
    const c = { x: m.col + m.w / 2, y: m.row + m.h / 2 }
    if (c.y < 0) continue
    const d = Math.abs(c.x - lx)
    if (d < bestD) { bestD = d; best = c }
  }
  const target = best ?? { x: lx, y: 1 }
  const raw = Math.atan2(FLOOR_Y - target.y, target.x - lx)
  return Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, raw))
}

interface Demo {
  dir: Pt
  path: Pt[]
  legs: number
  contacts: Pt[]
  total: number | null
  tone: 'teach' | 'combo' | 'survive'
}

const demo = computed<Demo | null>(() => {
  void measureTick.value
  const l = coachLesson.value
  if (!l || !geo.value) return null
  if (l.id === 'pull') {
    const a = pullAngle()
    let path: Pt[] = []
    try { path = flatToClient(barrage.engine.value.aimPreview(a).points.flatMap((p) => [p.x, p.y])) } catch { path = [] }
    return { dir: dirOf(a), path, legs: 2, contacts: [], total: null, tone: 'teach' }
  }
  if (l.id === 'combo' || l.id === 'survive') {
    const tr = l.trial
    return {
      dir: dirOf(tr.angle),
      path: flatToClient(tr.path),
      legs: l.id === 'combo' ? 99 : 4,
      contacts: flatToClient(tr.contacts),
      total: l.id === 'combo' ? tr.hits : null,
      tone: l.id
    }
  }
  return null
})

// ─── survive: reticles on the threats + the line they would cross ────────────
interface Threat { id: number; x: number; y: number; w: number; h: number; lineY: number }
const threats = computed<Threat[]>(() => {
  void measureTick.value
  const l = coachLesson.value
  if (!l || l.id !== 'survive') return []
  const st = barrage.engine.value.state
  const out: Threat[] = []
  const list = l.threats.map((id) => st.monsters.find((x) => x.id === id)).filter((m): m is NonNullable<typeof m> => !!m)
  for (const m of list) {
    const id = m.id
    const a = toClient(m.col, Math.max(0, m.row))
    const b = toClient(m.col + m.w, m.row + m.h)
    const line = toClient(m.col, ROWS)
    if (!a || !b || !line) continue
    out.push({ id, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, lineY: line.y })
  }
  return out
})
const skillRing = computed<Pt | null>(() => {
  void measureTick.value
  const l = coachLesson.value
  return l?.id === 'survive' && l.skillAt ? toClient(l.skillAt.x, l.skillAt.y) : null
})

// ─── sr-only sentence ────────────────────────────────────────────────────────
const srText = computed(() => {
  const l: CoachLesson | null = lessonVisible.value ? coachLesson.value : null
  if (!l) return ''
  if (l.id === 'pull') return t('barrage.tutorial.aim')
  if (l.id === 'combo' && l.bank) return t('barrage.coach.bank')
  return t(`barrage.coach.${l.id}`)
})

// The launcher glides into place after a volley and the board can re-layout:
// re-measure on every change and on a slow poll while anything shows.
let poll = 0
watch([() => coachLesson.value?.seq, () => barrage.phase.value], () => measure())
onMounted(() => {
  measure()
  poll = window.setInterval(() => { if (coachLesson.value) measure() }, 250)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  window.clearInterval(poll)
  window.clearInterval(dutyPoll)
  window.removeEventListener('resize', measure)
})
</script>

<template lang="pug">
  Teleport(to="body")
    //- `data-coach-live`: the stable marker the playtest harness reads the
    //- coach's sentences by (no behaviour of its own).
    div.sr-only(aria-live="polite" data-coach-live="lesson") {{ srText }}
    div.sr-only(aria-live="polite" data-coach-live="funnel") {{ funnelSr }}
    Transition(name="coach-fade")
      UpgradeFunnel(
        v-if="funnelVisible && upgradeFunnel"
        :key="upgradeFunnel.target"
        :target="upgradeFunnel.target"
        :quiet="funnelQuiet"
      )
    Transition(name="coach-fade")
      div.coach-layer.hud-digits(v-if="lessonVisible && coachLesson" :key="coachLesson.seq")
        //- survive: what is about to break through (the canvas pips say how soon).
        svg.fixed.inset-0.pointer-events-none.coach-threats(v-if="threats.length" width="100%" height="100%" aria-hidden="true")
          g(v-for="th in threats" :key="th.id")
            rect.coach-reticle(:x="th.x + 2" :y="th.y + 2" :width="th.w - 4" :height="th.h - 4" rx="10")
            line.coach-line(:x1="th.x" :x2="th.x + th.w" :y1="th.lineY" :y2="th.lineY")
          circle.coach-skill(v-if="skillRing" :cx="skillRing.x" :cy="skillRing.y" :r="(geo ? geo.cell : 40) * 0.5")
        FingerDemo(
          v-if="demo && geo"
          :launcher="geo.launcher"
          :cell="geo.cell"
          :bounds="geo.bounds"
          :dir="demo.dir"
          :path="demo.path"
          :legs="demo.legs"
          :contacts="demo.contacts"
          :total="demo.total"
          :tone="demo.tone"
        )
        TrayDemo(v-if="coachLesson.id === 'tray'")
        TrayIntroDemo(v-else-if="coachLesson.id === 'trayIntro'")
</template>

<style scoped lang="sass">
.coach-threats
  z-index: 69
.coach-reticle
  fill: rgba(255, 40, 50, 0.12)
  stroke: #ff3848
  stroke-width: 3
  stroke-dasharray: 10 6
  animation: coach-reticle 0.9s linear infinite
@keyframes coach-reticle
  to
    stroke-dashoffset: -32
.coach-line
  stroke: #ff3848
  stroke-width: 4
  stroke-linecap: round
  animation: coach-blink 0.7s ease-in-out infinite alternate
@keyframes coach-blink
  from
    opacity: 0.45
  to
    opacity: 1
.coach-skill
  fill: none
  stroke: #ffe23a
  stroke-width: 4
  filter: drop-shadow(0 0 6px rgba(255, 210, 60, 0.9))
  animation: coach-blink 0.5s ease-in-out infinite alternate

.coach-fade-enter-active, .coach-fade-leave-active
  transition: opacity 0.25s ease
.coach-fade-enter-from, .coach-fade-leave-to
  opacity: 0

@media (prefers-reduced-motion: reduce)
  .coach-reticle, .coach-line, .coach-skill
    animation-duration: 2s
</style>
