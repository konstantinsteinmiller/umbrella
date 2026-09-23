<script setup lang="ts">
/**
 * The wordless coach on screen (`useCoach.ts` decides WHAT; this shows it).
 *
 *   pull     — the slingshot acted out on the unit (SlingshotDemo, teach);
 *              and, live under a wrong-way thumb, the arrow stretched the
 *              right way so the correction lands while the finger is down.
 *   combo    — the ghost pulls to a real bank shot and flies its path; each
 *              monster hit counts up and the volley total pops at the end.
 *   survive  — the monsters about to break through get a red reticle and a
 *              chevron per march they have left to the line; then the
 *              rescue shot (and a gold ring on the skill bubble it takes).
 *   tray     — TrayDemo: why "+1" did not add a shot, and the fix.
 *   trayIntro — TrayIntroDemo: what the tray is (shots · "+1" · merge).
 *   upgrade  — UpgradeDemo on the glowing chip: press → what it changes.
 *
 * Everything is pointer-events: none and gets out of the way the moment a
 * finger is on the board. The sentence for each lesson exists only in the
 * sr-only live region.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import { FLOOR_Y, MIN_AIM, ROWS } from '@/barrage/engine/types'
import { coachLesson, noteLessonVisible, type CoachLesson } from '@/use/useCoach'
import { tutorialActive, tutorialPreview } from '@/use/useTutorial'
import { unlocking } from '@/use/useFeatureUnlocks'
import { isAnyModalOpen } from '@/use/useModalState'
import { activeReveal } from '@/use/useTierReveal'
import { aimWrongWay, boardApi, playerAiming } from '@/components/barrage/barrageUi'
import SlingshotDemo from '@/components/barrage/coach/SlingshotDemo.vue'
import TrayDemo from '@/components/barrage/coach/TrayDemo.vue'
import TrayIntroDemo from '@/components/barrage/coach/TrayIntroDemo.vue'
import UpgradeDemo from '@/components/barrage/coach/UpgradeDemo.vue'

interface Pt { x: number; y: number }

const { t } = useI18n()
const barrage = useBarrage()

// An earned feature flying in (FeatureUnlockFx) owns the moment too.
const blocked = computed(() =>
  isAnyModalOpen.value || !!activeReveal.value || barrage.holdSim.value || barrage.phase.value !== 'aim' || !!unlocking.value)
/** The FTUE's own hand is on screen: never two coaches at once. */
const ftueShowing = computed(() => tutorialActive.value && tutorialPreview.value !== null)
const lessonVisible = computed(() =>
  !!coachLesson.value && !blocked.value && !playerAiming.value && !ftueShowing.value)
const liveFix = computed(() => !!aimWrongWay.value && !blocked.value)

// Exposure = the first frame a lesson is actually on screen.
watch([lessonVisible, () => coachLesson.value?.seq], () => {
  const l = coachLesson.value
  if (lessonVisible.value && l) noteLessonVisible(l)
}, { immediate: true })

// ─── Board geometry (client px), re-measured while something shows ───────────
const geo = ref<{ launcher: Pt; cell: number } | null>(null)
const measureTick = ref(0)
const measure = (): void => {
  const b = boardApi.value
  const L = b?.launcherClientPoint()
  const o = b?.cellToClient(0, 0)
  const o1 = b?.cellToClient(1, 0)
  geo.value = L && o && o1 ? { launcher: L, cell: Math.max(8, o1.x - o.x) } : null
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
    return { dir: dirOf(a), path, legs: 1, contacts: [], total: null, tone: 'teach' }
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

/** The live correction: the player points toward d — pull toward −d. */
const liveDemo = computed<Demo | null>(() => {
  void measureTick.value
  const w = aimWrongWay.value
  if (!w || !geo.value) return null
  const len = Math.hypot(w.dx, w.dy) || 1
  // Their finger points where they want the ball to go; keep it in the fan.
  let a = Math.atan2(-w.dy / len, w.dx / len)
  a = Math.max(MIN_AIM, Math.min(Math.PI - MIN_AIM, a))
  let path: Pt[] = []
  try { path = flatToClient(barrage.engine.value.aimPreview(a).points.flatMap((p) => [p.x, p.y])) } catch { path = [] }
  return { dir: dirOf(a), path, legs: 1, contacts: [], total: null, tone: 'teach' }
})

// ─── survive: reticles on the threats + chevrons to the line ─────────────────
interface Threat { id: number; x: number; y: number; w: number; h: number; lineY: number; marches: number; chevrons: boolean }
const threats = computed<Threat[]>(() => {
  void measureTick.value
  const l = coachLesson.value
  if (!l || l.id !== 'survive') return []
  const st = barrage.engine.value.state
  const out: Threat[] = []
  const list = l.threats.map((id) => st.monsters.find((x) => x.id === id)).filter((m): m is NonNullable<typeof m> => !!m)
  for (const m of list) {
    const id = m.id
    // Chevrons only under the LOWEST threat of its columns — the one above it
    // would draw its march count straight over the one below.
    const covered = list.some((o) => o !== m && o.row > m.row && o.col < m.col + m.w && o.col + o.w > m.col)
    const a = toClient(m.col, Math.max(0, m.row))
    const b = toClient(m.col + m.w, m.row + m.h)
    const line = toClient(m.col, ROWS)
    if (!a || !b || !line) continue
    out.push({ id, x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, lineY: line.y, marches: Math.max(1, ROWS - (m.row + m.h) + 1), chevrons: !covered })
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
  if (liveFix.value) return t('barrage.tutorial.aim')
  const l: CoachLesson | null = lessonVisible.value ? coachLesson.value : null
  if (!l) return ''
  return l.id === 'pull' ? t('barrage.tutorial.aim') : t(`barrage.coach.${l.id}`)
})

// The launcher glides into place after a volley and the board can re-layout:
// re-measure on every change and on a slow poll while anything shows.
let poll = 0
watch([() => coachLesson.value?.seq, () => !!aimWrongWay.value, () => barrage.phase.value], () => measure())
onMounted(() => {
  measure()
  poll = window.setInterval(() => { if (coachLesson.value || aimWrongWay.value) measure() }, 250)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  window.clearInterval(poll)
  window.removeEventListener('resize', measure)
})
</script>

<template lang="pug">
  Teleport(to="body")
    div.sr-only(aria-live="polite") {{ srText }}
    //- Live correction under a wrong-way thumb (shows even mid-drag).
    SlingshotDemo(
      v-if="liveFix && liveDemo && geo"
      :launcher="geo.launcher"
      :cell="geo.cell"
      :dir="liveDemo.dir"
      :path="liveDemo.path"
      mode="hold"
    )
    Transition(name="coach-fade")
      div.coach-layer(v-if="lessonVisible && !liveFix && coachLesson" :key="coachLesson.seq")
        //- survive: what is about to break through, and how soon.
        svg.fixed.inset-0.pointer-events-none.coach-threats(v-if="threats.length" width="100%" height="100%" aria-hidden="true")
          g(v-for="th in threats" :key="th.id")
            rect.coach-reticle(:x="th.x + 2" :y="th.y + 2" :width="th.w - 4" :height="th.h - 4" rx="10")
            line.coach-line(:x1="th.x" :x2="th.x + th.w" :y1="th.lineY" :y2="th.lineY")
            path.coach-chevron(
              v-for="k in (th.chevrons ? th.marches : 0)"
              :key="k"
              :style="{ animationDelay: (k * 0.18) + 's' }"
              :d="'M ' + (th.x + th.w * 0.3) + ' ' + (th.y + th.h + (k - 0.6) * (th.lineY - th.y - th.h) / (th.marches + 0.2)) + ' l ' + (th.w * 0.2) + ' ' + (th.w * 0.14) + ' l ' + (th.w * 0.2) + ' ' + (-th.w * 0.14)"
            )
          circle.coach-skill(v-if="skillRing" :cx="skillRing.x" :cy="skillRing.y" :r="(geo ? geo.cell : 40) * 0.5")
        SlingshotDemo(
          v-if="demo && geo"
          :launcher="geo.launcher"
          :cell="geo.cell"
          :dir="demo.dir"
          :path="demo.path"
          :legs="demo.legs"
          :contacts="demo.contacts"
          :total="demo.total"
          :tone="demo.tone"
        )
        TrayDemo(v-if="coachLesson.id === 'tray'")
        TrayIntroDemo(v-else-if="coachLesson.id === 'trayIntro'")
        UpgradeDemo(v-else-if="coachLesson.id === 'upgrade'" :id="coachLesson.upgrade")
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
.coach-chevron
  fill: none
  stroke: #ff5a5a
  stroke-width: 4
  stroke-linecap: round
  stroke-linejoin: round
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.8))
  animation: coach-march 1.1s ease-in-out infinite
@keyframes coach-march
  0%, 100%
    opacity: 0.35
    transform: translateY(-3px)
  50%
    opacity: 1
    transform: translateY(3px)
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
  .coach-reticle, .coach-line, .coach-chevron, .coach-skill
    animation-duration: 2s
</style>
