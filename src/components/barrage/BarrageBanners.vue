<script setup lang="ts">
/**
 * Every WORD that appears over the board (the canvas draws numbers only —
 * CONTRACT §10): the big centre banners, the combo counter and skill toasts.
 * Fills the board overlay, pointer-events none, so it can never eat an aim drag.
 *
 * NOT here any more: the new-monster card, BOSS INCOMING and ENRAGED. Play-
 * testers read them as interruptions — a card mid-board for 1.5–3 s while the
 * balls flew, gone before it could be read. Those moments are wordless now and
 * wait for the player (`render/ruleMarks.ts`): a rule badge + an acted-out rule
 * on each new monster while they aim, red entry chevrons over a boss coming in,
 * a double chevron under an enraged one and the enrage zone on the boss bar.
 * Their sentences still reach screen readers through the live region below.
 *
 * Centre banners queue and play one at a time — a boss kill and a shield
 * block in the same second would otherwise stack into an unreadable pile.
 * Low-value banners (FEVER) are dropped rather than queued once the queue
 * backs up: a banner that arrives three seconds late is noise.
 *
 * Cause → effect (run 6: WARCRY "appeared seemingly out of nowhere — never saw
 * what triggered it"): a skill toast's icon flies in from the very bubble the
 * ball popped on the board, and lands in the toast (skipped under reduced
 * motion — the toast then simply appears).
 *
 * Silent Flow (retention-roadmap #2): a skill toast is ICON-ONLY — the skill's
 * own glyph in a medallion, no name, no sentence — and it is not shown every
 * time: once a session per skill and SKILL_TOAST_CAP times ever (the coach
 * counts them), and before the first boss kill one in all (the first minute
 * keeps its overlays under three seconds); otherwise the skill's effect on
 * the board speaks for itself. The name and the effect sentence still reach
 * screen readers, every time, through the live region below.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrage from '@/barrage/state/useBarrage'
import type { BossKind, EngineEvent, MonsterKind, SkillId } from '@/barrage/engine/types'
import { bossSrc, skillSrc } from '@/barrage/art'
import { getState, setState } from '@/use/useEpicState'
import { isCompactHud, isRoomyHud } from '@/use/useUser'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { EB_MONSTERS_SEEN_KEY } from '@/barrage/keys'
import { boardApi } from '@/components/barrage/barrageUi'
import { noteSkillToast, skillToastDue } from '@/use/useCoach'
import { isFtueActive } from '@/barrage/state/progress'

const { t } = useI18n()
const barrage = useBarrage()

// ─── Centre banners ──────────────────────────────────────────────────────────
type IntroKind = Exclude<MonsterKind, 'boss'> | 'corrupted'
type Banner =
  | { kind: 'bossDown'; bossKind: BossKind; row: number; checkpoint: boolean }
  | { kind: 'fever' }
  | { kind: 'shield' }
  | { kind: 'continued'; how: 'meteor' | 'revive' }

interface Shown { id: number; banner: Banner }

const DURATION: Record<Banner['kind'], number> = {
  bossDown: 2400, fever: 1300, shield: 1600, continued: 1600
}
/** Worth waiting for; everything else is dropped when the queue is busy. */
const KEEP: ReadonlySet<Banner['kind']> = new Set(['bossDown', 'shield', 'continued'])

// ─── Screen-reader announcements (the screen shows these without words) ─────
const announcement = ref('')
let announceTimer = 0
const announce = (text: string): void => {
  // Clear first so the same sentence twice in a row is announced twice.
  announcement.value = ''
  window.clearTimeout(announceTimer)
  announceTimer = window.setTimeout(() => { announcement.value = text }, 60)
}

const current = ref<Shown | null>(null)
const queue: Banner[] = []
let seq = 0
let bannerTimer = 0
/** The boss's death blast (engine `bossBlast`: the bottom two rows go up, that
 *  turn's march is skipped) plays right after the kill; the CHECKPOINT banner
 *  waits for it instead of covering it. */
const BOSS_BLAST_MS = 650
let bossBannerTimer = 0

const next = (): void => {
  window.clearTimeout(bannerTimer)
  const b = queue.shift()
  if (!b) { current.value = null; return }
  current.value = { id: ++seq, banner: b }
  bannerTimer = window.setTimeout(next, DURATION[b.kind])
}
const push = (b: Banner): void => {
  if (current.value || queue.length) {
    if (!KEEP.has(b.kind)) return
    queue.push(b)
    return
  }
  queue.push(b)
  next()
}

// ─── New-monster introductions (announced once per kind ever) ────────────────
// The screen introduces a kind with its rule badge (ruleMarks.ts); this set
// only keeps the screen reader from repeating the sentence for every goblin.
const SEEN_KEY = EB_MONSTERS_SEEN_KEY
const seen = new Set<string>(((): string[] => {
  const v = getState<unknown>(SEEN_KEY, [])
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
})())
// Slimes ARE the first board — introducing them would talk over the FTUE hand.
seen.add('slime')
const introduce = (kind: IntroKind): void => {
  if (seen.has(kind)) return
  seen.add(kind)
  setState(SEEN_KEY, [...seen])
  announce(`${t('barrage.monsters.' + kind + '.name')}: ${t('barrage.monsters.' + kind + '.rule')}`)
}

// ─── Combo counter ───────────────────────────────────────────────────────────
const combo = ref<{ id: number; hits: number } | null>(null)
let comboTimer = 0

// ─── Skill toasts (icon-only, rationed — see the header) ─────────────────────
/** How long an icon toast stays (its flight in is the first 460 ms). */
const SKILL_TOAST_MS = 1200
/** Silent Flow: the one icon toast allowed before the first boss kill is gone. */
let silentToastShown = false
interface Toast { id: number; skill: SkillId; arriving: boolean }
const toasts = ref<Toast[]>([])
let toastSeq = 0
const layerEl = ref<HTMLElement | null>(null)
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** Where the bubble behind the next skill toast sat (client px), from the
 *  engine's `skill` event — the toast itself comes through `lastSkill`. */
let pendingFly: { skill: SkillId; x: number; y: number } | null = null
const landed = (id: number): void => {
  toasts.value = toasts.value.map((x) => (x.id === id && x.arriving ? { ...x, arriving: false } : x))
}
/** The skill's icon flies from its bubble into the toast's icon slot. */
const fly = (id: number, skill: SkillId, from: { x: number; y: number }): void => {
  const layer = layerEl.value
  const icon = layer?.querySelector<HTMLElement>(`[data-toast-id="${id}"] .bb-toast__icon`)
  if (!layer || !icon) { landed(id); return }
  const lr = layer.getBoundingClientRect()
  const ir = icon.getBoundingClientRect()
  const size = ir.width || 30
  const img = document.createElement('img')
  img.src = skillSrc(skill)
  img.alt = ''
  img.className = 'bb-flier'
  img.style.cssText = `position:absolute;left:${from.x - lr.left - size / 2}px;top:${from.y - lr.top - size / 2}px;width:${size}px;height:${size}px;pointer-events:none;z-index:5;filter:drop-shadow(0 0 6px rgba(255,230,140,0.9))`
  layer.appendChild(img)
  const dx = ir.left + ir.width / 2 - from.x
  const dy = ir.top + ir.height / 2 - from.y
  const done = (): void => { img.remove(); landed(id) }
  if (typeof img.animate !== 'function') { done(); return }
  const a = img.animate([
    { transform: 'translate(0, 0) scale(1.5)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(1.25)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1 }
  ], { duration: 460, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' })
  a.onfinish = done
  a.oncancel = done
}
const addToast = (skill: SkillId): void => {
  const from = pendingFly && pendingFly.skill === skill ? pendingFly : null
  pendingFly = null
  // The words, for screen readers, every time; the screen shows the skill.
  announce(`${t(`barrage.skills.${skill}.name`)}: ${t(`barrage.skills.${skill}.effect`)}`)
  const silent = isFtueActive()
  if (!skillToastDue(skill) || (silent && silentToastShown)) return
  if (silent) silentToastShown = true
  noteSkillToast(skill)
  const id = ++toastSeq
  const arriving = !!from && !reducedMotion
  toasts.value = [...toasts.value.slice(-2), { id, skill, arriving }]
  if (arriving && from) void nextTick(() => fly(id, skill, from))
  window.setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== id) }, SKILL_TOAST_MS)
}
watch(() => barrage.lastSkill.value, (skill) => {
  if (!skill) return
  addToast(skill)
  // CONTRACT: UI clears it after display, so the same skill twice in a row re-fires.
  barrage.lastSkill.value = null
}, { immediate: true })

const onEvent = (e: EngineEvent): void => {
  switch (e.type) {
    case 'bossSpawn':
      announce(`${t('barrage.banners.bossIncoming')} ${t('barrage.bosses.' + e.bossKind)}`)
      break
    case 'skill': {
      // The bubble's spot, for the toast's icon to fly in from (cause → effect).
      const p = boardApi.value?.cellToClient(e.x, e.y) ?? null
      pendingFly = p ? { skill: e.skill, x: p.x, y: p.y } : null
      break
    }
    case 'bossEnrage': {
      const kind = barrage.boss.value?.bossKind
      if (kind) announce(`${t('barrage.banners.enraged', { name: t('barrage.bosses.' + kind) })} ${t('barrage.banners.enragedSub')}`)
      break
    }
    case 'bossDefeated': {
      // The celebration. The chest modal waits for the volley to settle (STATE
      // presents it at the next 'aim'), so the kill itself gets its moment here
      // — and in the endless mode it IS the checkpoint moment. It lands once
      // the death blast has played (BOSS_BLAST_MS), not over it.
      const banner: Banner = { kind: 'bossDown', bossKind: e.bossKind, row: e.row, checkpoint: barrage.mode.value !== 'daily' }
      window.clearTimeout(bossBannerTimer)
      bossBannerTimer = window.setTimeout(() => push(banner), BOSS_BLAST_MS)
      break
    }
    case 'fever':
      push({ kind: 'fever' })
      break
    case 'shieldBlock':
      push({ kind: 'shield' })
      break
    case 'continued':
      if (e.how !== 'shield') push({ kind: 'continued', how: e.how })
      break
    case 'combo':
      combo.value = { id: ++seq, hits: e.hits }
      window.clearTimeout(comboTimer)
      comboTimer = window.setTimeout(() => { combo.value = null }, 1100)
      break
    // Fun pass: a volley whose rattles paid gets the board's tally ("×hits"
    // and "+coins", canvas, same spot) — the popup steps aside for it.
    case 'comboBonus':
      if (e.coins > 0) {
        window.clearTimeout(comboTimer)
        combo.value = null
      }
      break
    case 'monsterSpawn': {
      if (e.kind === 'boss') break
      const m = barrage.engine.value.state.monsters.find((x) => x.id === e.monsterId)
      if (m?.corrupted) introduce('corrupted')
      introduce(e.kind)
      break
    }
    default:
      break
  }
}

let off: (() => void) | null = null
onMounted(() => { off = barrage.onEngineEvent(onEvent) })
onUnmounted(() => {
  off?.()
  window.clearTimeout(bannerTimer)
  window.clearTimeout(bossBannerTimer)
  window.clearTimeout(comboTimer)
  window.clearTimeout(announceTimer)
})

// A new board (restart / daily / hydrate) makes any queued banner stale.
watch(() => barrage.engineGen.value, () => {
  queue.length = 0
  window.clearTimeout(bannerTimer)
  window.clearTimeout(bossBannerTimer)
  current.value = null
})

const sizeClass = computed(() => isCompactHud.value ? 'bb--compact' : isRoomyHud.value ? 'bb--roomy' : '')
</script>

<template lang="pug">
  div.barrage-banners.absolute.inset-0.pointer-events-none.overflow-hidden(ref="layerEl" :class="sizeClass")
    //- ── Skill toasts (lower middle: the top rows are where new rows and bosses enter) ──
    //- Icon-only (Silent Flow): the skill's glyph in a medallion; its name and
    //- effect go to the sr-only live region instead.
    div.bb-toasts.absolute.left-0.right-0.flex.flex-col.items-center.gap-1(aria-hidden="true")
      TransitionGroup(name="bb-toast")
        div.bb-toast.flex.items-center.justify-center.rounded-full(v-for="x in toasts" :key="x.id" :data-toast-id="x.id")
          img.bb-toast__icon.shrink-0(:src="skillSrc(x.skill)" alt="" draggable="false" :class="{ 'is-arriving': x.arriving }")

    //- ── Combo ──
    Transition(name="bb-combo")
      div.bb-combo.absolute.game-text.font-black(v-if="combo" :key="combo.id" aria-hidden="true")
        span.bb-combo__n {{ t('barrage.banners.comboHits', { n: combo.hits }) }}
        span.bb-combo__label.uppercase {{ t('barrage.banners.combo') }}

    //- ── Sentences the screen shows without words (screen readers only) ──
    div.sr-only(aria-live="polite") {{ announcement }}

    //- ── Centre banner ──
    div.bb-centre.absolute.left-0.right-0.flex.justify-center(role="status" aria-live="polite")
      Transition(name="bb-banner" mode="out-in")
        div.bb-banner.flex.flex-col.items-center(v-if="current" :key="current.id" :class="'bb-banner--' + current.banner.kind")
          template(v-if="current.banner.kind === 'bossDown'")
            span.bb-kicker.flex.items-center.gap-1.game-text.font-black.uppercase(v-if="current.banner.checkpoint")
              BarrageGlyph.w-4.h-4(name="flag")
              span {{ t('barrage.banners.checkpoint') }}
            img.bb-portrait.bb-portrait--defeated(:src="bossSrc(current.banner.bossKind)" alt="" draggable="false")
            span.bb-title.game-text.font-black.uppercase {{ t('barrage.chest.defeated', { name: t('barrage.bosses.' + current.banner.bossKind) }) }}
            span.bb-sub.game-text(v-if="current.banner.checkpoint") {{ t('barrage.banners.checkpointSub', { n: current.banner.row }) }}
          template(v-else-if="current.banner.kind === 'fever'")
            span.bb-title.bb-title--rainbow.game-text.font-black.uppercase {{ t('barrage.banners.fever') }}
            span.bb-sub.game-text.font-black {{ t('barrage.banners.feverSub') }}
          template(v-else-if="current.banner.kind === 'shield'")
            img.bb-portrait.bb-portrait--sm(:src="skillSrc('shield')" alt="" draggable="false")
            span.bb-title.game-text.font-black.uppercase {{ t('barrage.banners.shieldBlocked') }}
          template(v-else-if="current.banner.kind === 'continued'")
            img.bb-portrait.bb-portrait--sm(:src="skillSrc(current.banner.how === 'meteor' ? 'meteor' : 'revive')" alt="" draggable="false")
            span.bb-title.game-text.font-black.uppercase {{ current.banner.how === 'meteor' ? t('barrage.banners.meteorStorm') : t('barrage.banners.revived') }}
</template>

<style scoped lang="sass">
.barrage-banners
  z-index: 20

.bb-toasts
  top: 60%
// A round medallion holding the skill's glyph — nothing to read.
.bb-toast
  padding: 5px
  background: radial-gradient(circle at 50% 38%, rgba(40, 56, 104, 0.95), rgba(8, 12, 28, 0.95) 72%)
  border: 2px solid #0f1a30
  box-shadow: 0 0 0 1.5px rgba(255, 226, 122, 0.75), 0 0 12px rgba(255, 210, 90, 0.45), 0 4px 10px rgba(0, 0, 0, 0.45)
.bb-toast__icon
  width: 34px
  height: 34px
  object-fit: contain
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6))
  // Its flying twin (from the bubble on the board) is still on the way.
  &.is-arriving
    opacity: 0

.bb-combo
  top: 18%
  right: 6%
  display: flex
  flex-direction: column
  align-items: center
  line-height: 0.95
  color: #ffe27a
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000
  transform: rotate(-6deg)
.bb-combo__n
  font-size: 30px
.bb-combo__label
  font-size: 12px
  color: #fff

.bb-centre
  top: 34%
.bb-banner
  gap: 2px
  max-width: 92%
  padding: 10px 18px 12px
  border-radius: 18px
  text-align: center
  background: radial-gradient(120% 90% at 50% 0%, rgba(60, 90, 170, 0.55), rgba(8, 12, 28, 0.92) 70%)
  border: 2px solid #0f1a30
  box-shadow: 0 0 0 2px rgba(255, 214, 74, 0.7), 0 10px 24px rgba(0, 0, 0, 0.55)
.bb-banner--bossDown
  background: radial-gradient(120% 90% at 50% 0%, rgba(40, 170, 90, 0.6), rgba(6, 22, 14, 0.94) 70%)
  box-shadow: 0 0 0 2px rgba(120, 255, 160, 0.85), 0 10px 24px rgba(0, 0, 0, 0.55)
.bb-banner--fever
  background: radial-gradient(120% 90% at 50% 0%, rgba(200, 60, 220, 0.55), rgba(20, 6, 30, 0.92) 70%)
.bb-title
  color: #fff
  font-size: 24px
  line-height: 1.05
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000
.bb-title--rainbow
  background: linear-gradient(90deg, #ff5a5a, #ffd23a, #6cff7a, #4ac8ff, #c56bff)
  -webkit-background-clip: text
  background-clip: text
  color: transparent
  text-shadow: none
  filter: drop-shadow(2px 2px 0 #000)
  font-size: 32px
.bb-sub
  color: #ffe9b8
  font-size: 13px
  line-height: 1.2
  text-shadow: 1px 1px 0 #000
.bb-kicker
  color: #ffd23a
  font-size: 11px
  letter-spacing: 0.08em
  text-shadow: 1px 1px 0 #000
.bb-portrait
  width: 64px
  height: 64px
  object-fit: contain
  filter: drop-shadow(0 3px 3px rgba(0, 0, 0, 0.6))
.bb-portrait--defeated
  filter: grayscale(0.6) brightness(0.85) drop-shadow(0 3px 3px rgba(0, 0, 0, 0.6))
  transform: rotate(-8deg)
.bb-portrait--sm
  width: 44px
  height: 44px
.bb-icon
  width: 34px
  height: 34px
  filter: drop-shadow(1px 1px 0 #000)

.bb--compact
  .bb-title
    font-size: 19px
  .bb-title--rainbow
    font-size: 26px
  .bb-sub
    font-size: 11px
  .bb-portrait
    width: 50px
    height: 50px
  .bb-portrait--sm
    width: 36px
    height: 36px
  .bb-toast__icon
    width: 28px
    height: 28px
  .bb-combo__n
    font-size: 24px
.bb--roomy
  .bb-title
    font-size: 32px
  .bb-title--rainbow
    font-size: 42px
  .bb-sub
    font-size: 16px
  .bb-portrait
    width: 84px
    height: 84px
  .bb-toast__icon
    width: 44px
    height: 44px

.bb-banner-enter-active
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease
.bb-banner-leave-active
  transition: transform 0.22s ease-in, opacity 0.22s ease-in
.bb-banner-enter-from
  transform: scale(0.4)
  opacity: 0
.bb-banner-leave-to
  transform: scale(1.15)
  opacity: 0

.bb-toast-enter-active, .bb-toast-leave-active
  transition: transform 0.25s ease, opacity 0.25s ease
.bb-toast-enter-from
  transform: translateY(-12px)
  opacity: 0
.bb-toast-leave-to
  opacity: 0

.bb-combo-enter-active
  animation: bb-combo-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)
.bb-combo-leave-active
  transition: opacity 0.25s ease
.bb-combo-leave-to
  opacity: 0
@keyframes bb-combo-pop
  from
    transform: rotate(-6deg) scale(1.9)
    opacity: 0
  to
    transform: rotate(-6deg) scale(1)
    opacity: 1

@media (prefers-reduced-motion: reduce)
  .bb-banner-enter-active, .bb-combo-enter-active
    transition: opacity 0.2s ease
    animation: none
</style>
