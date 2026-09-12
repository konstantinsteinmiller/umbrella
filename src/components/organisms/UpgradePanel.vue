<script setup lang="ts">
/**
 * The battle upgrade controls (implementation-plan.md §4.6): War Horns
 * (attack), Vitality (HP), Bounty (gold per kill), Imp Sergeant (automation).
 * A compact row of buy-chips, each with a themed mini-gauge, the current level
 * as a pip bar, and the next cost. Buying spends gold via `useBattle`; the
 * chip flashes and plays a confirm SFX. Fully responsive — chips wrap and
 * shrink on narrow viewports.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBattle, { type BattleUpgradeId, BATTLE_UPGRADE_DEFS } from '@/use/useBattle'
import useSounds from '@/use/useSound'
import IconCoin from '@/components/icons/IconCoin.vue'
import RuneFrame from '@/components/atoms/RuneFrame.vue'
import { runeZoneFor } from '@/game/runes'
import { formatBig } from '@/utils/bigNumber'
import { isCompactHud, isUltraCompactHud, isRoomyHud, isWideCompactHud } from '@/use/useUser'
import { isAnyModalOpen } from '@/use/useModalState'
import { tutorialActive } from '@/use/useTutorial'
import RuneHintArrow from '@/components/atoms/RuneHintArrow.vue'

const { t } = useI18n()
const battle = useBattle()
const { playSound } = useSounds()

const ids = Object.keys(BATTLE_UPGRADE_DEFS) as BattleUpgradeId[]

const accent: Record<BattleUpgradeId, string> = {
  attack: '#ff6a2a', vitality: '#36d399', bounty: '#ffd23c', automation: '#5fb0ff', recruit: '#c05cff'
}

/** What each chip's rune border spells, in Elder Futhark (see `game/runes.ts`).
 *  Ornament, never read — the English name transliterated for flavour. */
const INSCRIPTIONS: Record<BattleUpgradeId, string> = {
  attack: 'war horns', vitality: 'vitality', bounty: 'bounty', automation: 'imp sergeant', recruit: 'recruits'
}

// A successful purchase flares that chip's runes for half a second — the
// "it took" beat under the confirm SFX. Re-armed on every buy, so a quick
// run of purchases keeps the chip lit instead of stuttering.
const flareId = ref<BattleUpgradeId | null>(null)
let flareTimer: ReturnType<typeof setTimeout> | null = null
const flare = (id: BattleUpgradeId): void => {
  if (flareTimer !== null) clearTimeout(flareTimer)
  flareId.value = null
  void nextTick(() => {
    flareId.value = id
    flareTimer = setTimeout(() => { flareId.value = null; flareTimer = null }, 520)
  })
}

const buy = (id: BattleUpgradeId): void => {
  if (battle.buyUpgrade(id)) {
    playSound('upgrade-buy', 0.05, 1.05)
    flare(id)
  } else {
    playSound('upgrade-denied', 0.015)
  }
}

/** Tier (every 5 levels) as a numeral beside the pips — I, II, … XX, then digits. */
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
const roman = (n: number): string => ROMAN[n] ?? String(n)

// 1.84K, 2.50M … 7.00T, then 1.30Qa, 5.40Qi and on up the Recruits ladder.
const fmt = (n: number): string => formatBig(n, { decimals: 2 })

// Pip bar: show level out of a soft "page" of 5 (or the upgrade's own max
// when it caps below 5, e.g. Recruits' 3) so the bar stays readable.
const pips = (lvl: number, max: number): boolean[] => {
  const page = Math.min(5, max)
  const within = lvl % page
  const shown = lvl > 0 && within === 0 ? page : within
  return Array.from({ length: page }, (_, i) => i < shown)
}
const tier = (lvl: number): number => Math.floor(lvl / 5)

// ─── Chip type scale ─────────────────────────────────────────────────────────
// Three tiers: compact shrinks for real, roomy (desktop) steps UP — the `sm:`
// sizes top out at phone scale, which left the labels and costs as 10-11px type
// on a 1280×800 desktop.
//
// On the roomy tier the name also gets its own ROW (the header flips to a
// column). Horizontally there is nothing to win: the panel caps at `max-w-md`
// and five chips split it ~86px each, so beside a glyph the label has ~41px —
// `truncate` was already clipping "War Horns" at the old 10px and enlarging it
// in place only clipped more. Stacking buys it the chip's full inner width.
//
// **Gated on the row's MEASURED height, not just the viewport.** The row is
// `h-[15%] min-h-14 max-h-[92px]`, so on a stacked (non-side-by-side) layout it
// collapses to its 56px floor even at 861×640 — a viewport that is otherwise
// "roomy". The enlarged chip needs ~72px, so keying off `isRoomyHud` alone
// overflowed the chip there. Below the threshold every consumer falls back to
// the phone-tuned sizes, i.e. exactly today's rendering.
const rootEl = ref<HTMLElement | null>(null)
const panelH = ref(0)
let panelRo: ResizeObserver | null = null

onMounted(() => {
  const el = rootEl.value
  if (!el) return
  const measure = (): void => { panelH.value = el.clientHeight }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    panelRo = new ResizeObserver(measure)
    panelRo.observe(el)
  }
})
onUnmounted(() => {
  panelRo?.disconnect()
  panelRo = null
  if (flareTimer !== null) clearTimeout(flareTimer)
  if (sheenTimer !== null) clearInterval(sheenTimer)
})

// ─── The sheen, one chip at a time ───────────────────────────────────────────
// Every SHEEN_EVERY_MS the next affordable chip (round robin) plays one 1.25 s
// light sweep. One timer, at most one animation running, nothing between
// sweeps — see `.chip::after` for why an idling infinite animation per chip
// was the expensive way to get the same look.
const SHEEN_EVERY_MS = 1700
const sheenId = ref<BattleUpgradeId | null>(null)
let sheenTimer: ReturnType<typeof setInterval> | null = null
let sheenCursor = -1
const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const nextSheen = (): void => {
  const ready = chips.value.filter((c) => c.state === 'ready')
  sheenId.value = null
  if (!ready.length) return
  sheenCursor = (sheenCursor + 1) % ready.length
  const id = ready[sheenCursor]!.id
  // Next frame, so the same chip twice in a row (the only affordable one)
  // still restarts its animation.
  requestAnimationFrame(() => { sheenId.value = id })
}
onMounted(() => {
  if (!reducedMotion) sheenTimer = setInterval(nextSheen, SHEEN_EVERY_MS)
})

/** Vertical padding the chip keeps clear for its rune bands — the same number
 *  `RuneFrame` derives from the chip's height, so content and inscription can
 *  never meet. `panelH` minus the 3px base plate is the chip's height. */
const runeZone = computed(() => isUltraCompactHud.value
  // Ultra-compact chips (~31px) have no frame at all: their glyph, pips and
  // cost need 26px of a 28px body, and even a hairline frame would cut them.
  ? '0px'
  : `${runeZoneFor(Math.max(0, panelH.value - 3)).toFixed(1)}px`)

/** Chip height the enlarged (stacked glyph + label + pips + cost) layout needs. */
const ROOMY_MIN_H = 74
const roomy = computed(() => isRoomyHud.value && panelH.value >= ROOMY_MIN_H)

// Compact-but-wide (1000×450 and friends) keeps the compact LAYOUT but lifts
// the type — see `isWideCompactHud`. 12px is the ceiling for the name here:
// beside the glyph a chip leaves it ~65px, and "War Horns" needs 59px at 12px.
// Phone-compact names are 11px: the chip also carries its rune bands now, and a
// 42px chip has exactly 28px between them — the cost keeps its 12px (it is the
// number the player decides on), the name gives up the pixel.
const nameTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-xs' : 'text-[11px]')
  : roomy.value ? 'text-[13px]' : 'text-[9px] sm:text-[14px]')
/** Roomy: glyph over label instead of beside it — see above. */
// Compact rows get a 3px gap between glyph and name: room for the tier badge
// to sit on the glyph's corner without touching the name's first letter.
const headerStackClass = computed(() => roomy.value ? 'flex-col gap-0.5' : isCompactHud.value ? 'gap-[3px]' : 'gap-1')
const costTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[11px]' : 'text-[12px]')
  : roomy.value ? 'text-[13px]' : 'text-[9px] sm:text-[14px]')
const maxedTextClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'text-[11px]' : 'text-[12px]')
  : roomy.value ? 'text-[13px]' : 'text-[9px] sm:text-[14px]')
const glyphClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'w-4 h-4' : 'w-3 h-3')
  : roomy.value ? 'w-6 h-6' : 'w-4 h-4 sm:w-5 sm:h-5')
const coinIconClass = computed(() => isCompactHud.value
  ? (isWideCompactHud.value ? 'w-3 h-3' : 'w-2 h-2')
  : roomy.value ? 'w-4 h-4' : 'w-2.5 h-2.5 sm:w-3 sm:h-3')

// ─── Hover tooltip ───────────────────────────────────────────────────────────
// CG QA: "The texts/titles of the upgrade cards are truncated. Please show the
// full text when players hover over it." Five chips split a `max-w-md` panel, so
// `truncate` clips the longer names in most languages and drops them entirely on
// the ultra-compact HUD — the tooltip is the readable copy of both the name and
// what the upgrade actually does.
//
// Teleported to `body` and `position: fixed`: the chip lives inside the scene's
// `overflow-hidden` column, so an in-flow tooltip would be clipped by the very
// container that causes the truncation. Positioned imperatively (above the chip,
// flipped below when there's no room, clamped to the viewport on both axes)
// rather than with a CSS-only anchor, because the outermost chips would
// otherwise hang off the screen edge.
const tipId = ref<BattleUpgradeId | null>(null)
const tipEl = ref<HTMLElement | null>(null)
/** Null until measured — the tooltip renders invisible for that one frame so it
 *  never flashes at the top-left corner before it lands on its chip. */
const tipPos = ref<{ left: number; top: number } | null>(null)

const TIP_GAP = 8
const TIP_MARGIN = 6

// ─── Why the close is a hit-test, not a `pointerleave` ───────────────────────
// Boundary events alone cannot decide this. With a battle running the panel is
// never still: chip contents re-render (cost, pips, tier ribbon), the chip
// widths follow the cost strings, and the top bar gains/loses its second line —
// so the chips slide under a stationary cursor. Chrome faithfully reports that
// as pointerout/pointerleave, and hiding on it blinked the tooltip out (often
// before it was ever painted) even though the mouse had not moved a pixel.
//
// So `pointerout` only ARMS a close. When it fires we look at where the pointer
// actually is: still inside a chip → keep the tooltip (re-anchored to whichever
// chip is under it now), otherwise close. `elementFromPoint` skips the tooltip
// itself, which is `pointer-events: none`.
const HIDE_GRACE_MS = 120
let hideTimer: ReturnType<typeof setTimeout> | null = null
/** Last position the pointer reported to us — every boundary event carries it. */
let lastX = 0
let lastY = 0

const cancelHide = (): void => {
  if (hideTimer !== null) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

/**
 * Show (or re-anchor) the tooltip for `id` against `anchor`.
 * `force` re-measures an already-open tooltip — used when the chip moved under
 * the cursor; without it the tooltip would drift away from its chip.
 */
const showTipFor = async (
  id: BattleUpgradeId,
  anchor: HTMLElement,
  force = false
): Promise<void> => {
  cancelHide()
  const sameChip = tipId.value === id
  if (sameChip && !force) return
  tipId.value = id
  // Only blank the position when the tooltip is (re)opening — a forced
  // re-measure of a visible tooltip must not flash it to `opacity: 0` first.
  if (!sameChip) tipPos.value = null
  await nextTick()
  const tip = tipEl.value
  // Bail if the pointer already moved on to another chip while we waited.
  if (!tip || tipId.value !== id) return
  const a = anchor.getBoundingClientRect()
  const w = tip.offsetWidth
  const h = tip.offsetHeight
  const left = Math.max(
    TIP_MARGIN,
    Math.min(a.left + a.width / 2 - w / 2, window.innerWidth - w - TIP_MARGIN)
  )
  const above = a.top - h - TIP_GAP
  const top = above >= TIP_MARGIN
    ? above
    : Math.max(TIP_MARGIN, Math.min(a.bottom + TIP_GAP, window.innerHeight - h - TIP_MARGIN))
  tipPos.value = { left, top }
}

// ─── Self-closing tooltips (touch / keyboard) ────────────────────────────────
// A hovering MOUSE has a natural end: it leaves the chip and `pointerout` closes
// the tooltip. Nothing else does. On Android Chrome a TAP focuses the chip button,
// and focus opens the tooltip — then the next tap lands on the merge grid or the
// arena, which swallow the pointer without moving focus, so the tooltip used to
// sit over the panel indefinitely. Every tooltip that is not held open by a
// hovering mouse therefore closes itself after this long.
const AUTO_HIDE_MS = 2500
let autoHideTimer: ReturnType<typeof setTimeout> | null = null
/** True while the open tooltip is held by a mouse hover — the one case with its
 *  own close edge, so the only one exempt from the auto-close. */
let heldByHover = false

const cancelAutoHide = (): void => {
  if (autoHideTimer !== null) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
}

const armAutoHide = (): void => {
  cancelAutoHide()
  autoHideTimer = setTimeout(() => {
    autoHideTimer = null
    hideTip()
  }, AUTO_HIDE_MS)
}

const hideTip = (): void => {
  cancelHide()
  cancelAutoHide()
  heldByHover = false
  tipId.value = null
  tipPos.value = null
}

/** The chip (if any) the pointer is really over right now. */
const chipUnderPointer = (): HTMLElement | null => {
  const el = document.elementFromPoint(lastX, lastY)
  return (el instanceof Element ? el.closest('.chip') : null) as HTMLElement | null
}

/** Armed by `pointerout`: close only if the pointer has genuinely left the row.
 *  It may RE-ANCHOR an open tooltip to the chip now under the cursor, but never
 *  OPEN one — the settle is a close path. */
const settleHide = (): void => {
  hideTimer = null
  if (tipId.value === null) return
  const chip = chipUnderPointer()
  const id = chip?.dataset.upgradeId as BattleUpgradeId | undefined
  if (!chip || !id) {
    hideTip()
    return
  }
  void showTipFor(id, chip, true)
}

// Mouse only, like `onChipOver`. On touch `pointerout` is the finger LIFTING,
// not leaving: the hit-test then found the chip still under the last touch point
// and re-opened the tooltip after every purchase — half of the "tooltip never
// goes away on mobile" bug. Touch tooltips close via the auto-hide instead.
const scheduleHide = (ev: PointerEvent): void => {
  if (ev.pointerType !== 'mouse') return
  lastX = ev.clientX
  lastY = ev.clientY
  cancelHide()
  hideTimer = setTimeout(settleHide, HIDE_GRACE_MS)
}

// A resize (or an orientation flip) moves the chip out from under a tooltip that
// was measured against the old layout — drop it rather than leave it stranded.
onMounted(() => { window.addEventListener('resize', hideTip) })
onUnmounted(() => {
  window.removeEventListener('resize', hideTip)
  cancelHide()
  cancelAutoHide()
})

// Same for a modal opening under the cursor (wave cleared, daily reward, …): the
// tooltip outranks the HUD by design, and it must not outrank a modal.
watch(isAnyModalOpen, (open) => { if (open) hideTip() })

// Mouse only. On touch the same chip is a buy button — `pointerover` fires on
// tap there, which would park a tooltip over the panel after every purchase.
const onChipOver = (id: BattleUpgradeId, ev: PointerEvent): void => {
  if (ev.pointerType !== 'mouse') return
  lastX = ev.clientX
  lastY = ev.clientY
  const anchor = ev.currentTarget as HTMLElement | null
  if (!anchor) return
  // A hovering mouse holds the tooltip for as long as it stays on the row.
  cancelAutoHide()
  heldByHover = true
  void showTipFor(id, anchor)
}

// Keyboard focus gets the same affordance (and `blur` covers the tab-away). So
// does a TAP on Android Chrome, which focuses the button — hence the auto-close.
// A mouse click on a chip it is already hovering also focuses it; that tooltip
// stays held by the hover and is left alone.
const onChipFocus = (id: BattleUpgradeId, ev: FocusEvent): void => {
  if (heldByHover && tipId.value === id) return
  const anchor = ev.currentTarget as HTMLElement | null
  if (!anchor) return
  heldByHover = false
  void showTipFor(id, anchor)
  armAutoHide()
}

/**
 * A tap buys when it can — and ALWAYS explains itself on touch.
 *
 * The chips used to be `disabled` whenever the upgrade was unaffordable or
 * maxed. A disabled button receives neither the tap nor focus, so on a phone
 * the one moment a player most wants the tooltip — "why can't I buy this, and
 * what does it even do?" — was the one moment nothing could open it. They are
 * `aria-disabled` now: the tap lands, plays the denied sound instead of buying,
 * and opens the self-closing tooltip. It opens on EVERY touch tap, not only via
 * focus, because iOS Safari never focuses a tapped button at all.
 */
const onChipClick = (id: BattleUpgradeId, ev: MouseEvent): void => {
  buy(id)
  // A keyboard-triggered click reports `pointerType: ''`; focus already
  // opened the tooltip for it. A mouse holds it by hover. Touch and pen get it here.
  const type = (ev as PointerEvent).pointerType
  if (type !== 'touch' && type !== 'pen') return
  const anchor = ev.currentTarget as HTMLElement | null
  if (!anchor) return
  heldByHover = false
  void showTipFor(id, anchor, true)
  armAutoHide()
}

/** Full, never-truncated label for screen readers — the visible span is clipped. */
const chipLabel = (id: BattleUpgradeId): string =>
  `${t('battle.upgrades.' + id)}. ${t('battle.upgrades.desc.' + id)}`

const chips = computed(() => ids.map((id) => {
  const maxed = battle.isUpgradeMaxed(id)
  const can = battle.canBuyUpgrade(id)
  return {
    id,
    level: battle.upgradeLevel(id),
    cost: battle.upgradeCost(id),
    maxed,
    can,
    state: (maxed ? 'maxed' : can ? 'ready' : 'locked') as 'ready' | 'locked' | 'maxed',
    max: BATTLE_UPGRADE_DEFS[id].max,
    accent: accent[id]
  }
}))

// ─── "Buy me" arrows: Imp + Recruits, until their first level ───────────────
// Play-testers never spent their gold: the chips read as stats, not as buttons.
// The two upgrades that change how the game PLAYS get a bobbing runic arrow the
// moment they become affordable — the Imp (it starts merging for you) small,
// Recruits (every spawn a tier higher) twice the size. Gone after the first buy.
// Teleported and fixed like the tooltip: the chips clip their own overflow.
const HINT_SIZE: Partial<Record<BattleUpgradeId, number>> = { automation: 16, recruit: 32 }
const hintIds = computed(() => (tutorialActive.value || isAnyModalOpen.value)
  ? []
  : chips.value.filter((c) => HINT_SIZE[c.id] && c.can && c.level === 0).map((c) => c.id))

interface HintPos { id: BattleUpgradeId; size: number; left: number; top: number; up: boolean }
const hintPos = ref<HintPos[]>([])
const measureHints = (): void => {
  const root = rootEl.value
  if (!root) { hintPos.value = []; return }
  hintPos.value = hintIds.value.flatMap((id) => {
    const chip = root.querySelector<HTMLElement>(`[data-upgrade-id="${id}"]`)
    if (!chip) return []
    const r = chip.getBoundingClientRect()
    if (r.width === 0) return []
    const size = HINT_SIZE[id]!
    const h = size * 0.86
    // Sunk ~40 % into the chip's rune band rather than perched on its edge: in
    // portrait the arena's spell row sits right above the chips, and a perched
    // Recruits arrow covered the Meteor button. Flips below if there's no room.
    const up = r.top - h * 0.6 < 4
    return [{ id, size, left: r.left + r.width / 2 - size / 2, top: up ? r.bottom - h * 0.4 : r.top - h * 0.6, up }]
  })
}
let hintTimer: ReturnType<typeof setInterval> | null = null
watch(() => hintIds.value.join(), (list) => {
  measureHints()
  if (list && hintTimer === null) {
    hintTimer = setInterval(measureHints, 400)
    window.addEventListener('resize', measureHints)
  } else if (!list && hintTimer !== null) {
    clearInterval(hintTimer)
    hintTimer = null
    window.removeEventListener('resize', measureHints)
  }
}, { immediate: true })
onUnmounted(() => {
  if (hintTimer !== null) clearInterval(hintTimer)
  window.removeEventListener('resize', measureHints)
})
</script>

<template lang="pug">
  //- On `isCompactHud` the whole row has to fit ~36px of height so the merge
  //- grid (which is height-led: `min(100cqh, …)`) gets the rest of the column.
  //- Every dimension is reduced for real — padding, icon, font, pip size and
  //- border — never a transform, which would keep the original footprint.
  //- `pb-[3px]`: room for the chips' base plate (a solid offset shadow), so the
  //- 3D edge stays inside the row instead of spilling toward the merge grid.
  div.upgrade-panel.flex.items-stretch.justify-center.w-full.h-full.gap-1(
    ref="rootEl"
    class="pb-[3px]"
  )
    button.chip.flex.flex-col.items-center.justify-around(
      v-for="c in chips"
      :key="c.id"
      class="flex-1 min-w-0 !gap-[0px]"
      :class="['chip--' + c.state, { 'chip--compact': isCompactHud, 'chip--roomy': roomy, 'chip--flare': flareId === c.id, 'chip--sheen': sheenId === c.id }]"
      :style="{ '--accent': c.accent, '--rune-zone': runeZone }"
      :aria-disabled="!c.can"
      :aria-label="chipLabel(c.id)"
      :data-upgrade-id="c.id"
      @click="onChipClick(c.id, $event)"
      @pointerover="onChipOver(c.id, $event)"
      @pointerout="scheduleHide($event)"
      @focus="onChipFocus(c.id, $event)"
      @blur="hideTip"
    )
      //- The inset rune border — the upgrade's name in Elder Futhark, lit when
      //- affordable, engraved when not, gold when maxed.
      RuneFrame(v-if="!isUltraCompactHud" :inscription="INSCRIPTIONS[c.id]" :state="c.state")
      div.flex.items-center.w-full.justify-center.min-w-0(:class="headerStackClass")
        //- Themed mini gauge, wearing the tier (every 5 levels) as a gold numeral
        //- on its corner. The tier used to hang off the chip's corner, over the
        //- neighbouring chip; then briefly in the pip row, where its taller text
        //- pushed the cost into the rune band. On the glyph it costs no height.
        span.chip-glyph-wrap.relative.shrink-0.flex
          span.chip-tier.leading-none(v-if="tier(c.level) > 0") {{ roman(tier(c.level)) }}
          svg.chip-glyph(
            viewBox="0 0 24 24"
            class="shrink-0"
            :class="glyphClass"
            :style="{ color: c.accent }"
          )
            template(v-if="c.id === 'attack'")
              //- Crossed sword
              path(d="M5 19 L15 9 L19 5 L19 9 L9 19 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round")
              line(x1="4" y1="15" x2="9" y2="20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round")
            template(v-else-if="c.id === 'vitality'")
              //- Heart
              path(d="M12 20 C4 14 3 8.5 7 6.5 C9.5 5.3 11.5 7 12 8.5 C12.5 7 14.5 5.3 17 6.5 C21 8.5 20 14 12 20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round")
            template(v-else-if="c.id === 'bounty'")
              //- Coin stack
              circle(cx="12" cy="9" r="6.5" fill="none" stroke="currentColor" stroke-width="2")
              path(d="M6 15 a6.5 4 0 0 0 12 0 M6 18 a6.5 4 0 0 0 12 0" fill="none" stroke="currentColor" stroke-width="2")
            template(v-else-if="c.id === 'recruit'")
              //- Recruit rank-up: unit square with an ascending arrow
              rect(x="5" y="12" width="9" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2")
              g(stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round")
                path(d="M16 12 L16 4 M12.5 7.5 L16 4 L19.5 7.5")
            template(v-else)
              //- Imp gear
              circle(cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="2")
              g(stroke="currentColor" stroke-width="2" stroke-linecap="round")
                line(x1="12" y1="2.5" x2="12" y2="5.5")
                line(x1="12" y1="18.5" x2="12" y2="21.5")
                line(x1="2.5" y1="12" x2="5.5" y2="12")
                line(x1="18.5" y1="12" x2="21.5" y2="12")
        //- Under 320px the name goes: the themed glyph already identifies the
        //- upgrade (sword / heart / coins / gear / rank-up arrow), and dropping
        //- the label is what lets the chip body fit ~28px so the merge grid
        //- gets the height. The cost and level pips stay — those are the two
        //- things the player actually decides on.
        span.chip-name.font-black.uppercase.leading-none.truncate(
          v-if="!isUltraCompactHud"
          :class="nameTextClass"
        ) {{ t('battle.upgrades.' + c.id) }}
      //- Level pips — rune-cut diamonds (progress within the current tier).
      div.chip-pips.flex.items-center(:class="isCompactHud ? 'my-0 gap-[3px]' : 'my-0.5 gap-1'")
        span.pip(v-for="(on, i) in pips(c.level, c.max)" :key="i" :class="{ 'pip-on': on }")
      div.flex.items-center(class="gap-0.5")
        template(v-if="c.maxed")
          span.chip-maxed.font-black.leading-none(:class="maxedTextClass") {{ t('battle.upgrades.maxed') }}
        template(v-else)
          IconCoin.chip-coin(class="shrink-0" :class="coinIconClass")
          span.chip-cost.font-black.leading-none(
            :class="[c.can ? 'chip-cost--ok' : 'chip-cost--short', costTextClass]"
          ) {{ fmt(c.cost) }}
    //- Hover/focus tooltip with the un-truncated name + what the upgrade does.
    //- Teleported out of the scene's clipping column; `opacity` rides the
    //- measured position so it never paints before it has one.
    Teleport(to="body")
      div.upgrade-tip.fixed(
        v-if="tipId"
        ref="tipEl"
        role="tooltip"
        :style="{\
          left: (tipPos ? tipPos.left : 0) + 'px',\
          top: (tipPos ? tipPos.top : 0) + 'px',\
          opacity: tipPos ? 1 : 0\
        }"
      )
        div.tip-name.font-black.uppercase.leading-tight {{ t('battle.upgrades.' + tipId) }}
        div.tip-desc.leading-snug {{ t('battle.upgrades.desc.' + tipId) }}
    //- "Buy me" arrows over the Imp and Recruits chips (see `hintIds`).
    Teleport(to="body")
      RuneHintArrow.upgrade-hint.fixed(
        v-for="h in hintPos" :key="h.id"
        :size="h.size"
        :direction="h.up ? 'up' : 'down'"
        :style="{ left: h.left + 'px', top: h.top + 'px' }"
      )
</template>

<style scoped lang="sass">
// ─── The chip: a runic plaque ────────────────────────────────────────────────
// Layers, back to front: the accent-tinted body (a lit crown fading into deep
// navy), a 2px near-black outline like every other button in the game, a 1px
// top bevel, the accent rim, and a solid base plate under it (the offset
// shadow) that the chip presses down onto. Then the rune frame, then content.
//
// CONTRAST is the constraint every colour here was picked against: the tint
// never exceeds ~26 % accent over navy, so white type measures ≥ 7:1 on every
// accent's crown, the cost colours ≥ 9:1 on the dark foot, and the glyph and
// every line of text carry a 1px black outline so they hold on any tint.
.chip
  --tint: color-mix(in srgb, var(--accent) 26%, #19233f)
  --plate: color-mix(in srgb, var(--accent) 42%, #03050c)
  position: relative
  overflow: hidden
  cursor: pointer
  border-radius: 0.75rem
  border: 2px solid #060a16
  padding: var(--rune-zone) 5px
  background: radial-gradient(130% 85% at 50% -14%, color-mix(in srgb, var(--accent) 34%, transparent) 0%, transparent 62%), linear-gradient(180deg, var(--tint) 0%, #0f1631 56%, #080c1d 100%)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate)
  transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.2s ease
  -webkit-tap-highlight-color: transparent

  // Content above the rune frame and the sheen's base.
  > :not(.rune-frame)
    position: relative
    z-index: 1

  // Pressed: the body drops onto its base plate.
  &:active
    transform: translateY(2px)
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 1px 0 var(--plate)

  @media (hover: hover)
    &:hover
      filter: brightness(1.1)

// Affordable: a brighter rim and a soft accent halo kept tight enough (negative
// spread) to stay inside the 4px gap to the next chip.
.chip--ready
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate), 0 0 9px -4px var(--accent)

// The sheen: a light band that sweeps ONE affordable chip at a time, driven by
// `sheenId` (see the script). It used to be an infinite animation on every
// affordable chip, idling off-edge between sweeps — and a parked-but-running
// animation still costs a style update per chip per frame: measured at ~14 ms/s
// of extra main-thread style work on a 4×-throttled phone profile, the whole of
// the rune design's idle cost. Now nothing animates between sweeps.
//
// The layer itself is PERMANENT on every chip (parked off-edge, clipped by the
// chip), so a chip turning affordable or unaffordable no longer creates or
// destroys a box: that was a layout pass per state flip (+26 ms/s under a
// 30-flips/s churn test, 0 ms without it).
.chip::after
  content: ''
  position: absolute
  inset: 0
  z-index: 2
  pointer-events: none
  background: linear-gradient(100deg, transparent 32%, rgba(255, 255, 255, 0.2) 47%, rgba(255, 255, 255, 0.06) 54%, transparent 66%)
  transform: translateX(-130%)

.chip--sheen::after
  animation: chip-sheen 1.25s ease-in-out

@keyframes chip-sheen
  from
    transform: translateX(-130%)
  to
    transform: translateX(130%)

// Can't afford: the body cools to a faint tint and the runes go dark — but the
// type stays at full contrast, because this is exactly when a player reads it.
.chip--locked
  --tint: color-mix(in srgb, var(--accent) 10%, #161c30)
  --plate: color-mix(in srgb, var(--accent) 16%, #03050c)

// …and a 20 % grey veil over the whole plaque — glyph, name, runes and price —
// so "not yet" reads at a glance instead of only from the red price. Like the
// sheen layer it is PERMANENT on every chip and only its opacity changes, so a
// chip turning affordable creates no box (no layout pass); `pointer-events:
// none` keeps hover and taps — and so the tooltip — working exactly as before.
.chip::before
  content: ''
  position: absolute
  inset: 0
  z-index: 3
  pointer-events: none
  border-radius: inherit
  background: rgb(128, 134, 148)
  opacity: 0
  transition: opacity 0.2s ease

.chip--locked::before
  opacity: 0.2

// Maxed: a gold plaque.
.chip--maxed
  --tint: color-mix(in srgb, #ffd76a 20%, #1b2034)
  --plate: color-mix(in srgb, #ffd76a 38%, #03050c)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), inset 0 0 0 1px rgba(255, 215, 106, 0.55), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate)

// A purchase: the whole plaque flashes and the runes flare.
.chip--flare
  animation: chip-flare 0.52s ease-out
  :deep(.rune-frame)
    filter: drop-shadow(0 0 3px var(--accent)) brightness(1.7)

@keyframes chip-flare
  0%
    filter: brightness(1)
  25%
    filter: brightness(1.5)
  100%
    filter: brightness(1)

@media (prefers-reduced-motion: reduce)
  .chip--sheen::after
    animation: none
  .chip--flare
    animation: none

// Compact phones: a slimmer outline and tighter corners; everything else —
// the rune zone included — already scales off the measured chip height.
.chip--compact
  border-width: 1.5px
  border-radius: 0.6rem
  padding-left: 4px
  padding-right: 4px

// ─── Content ─────────────────────────────────────────────────────────────────
.chip-name
  color: #ffffff
  text-shadow: 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 2px 3px rgba(0, 0, 0, 0.55)
.chip--locked .chip-name
  color: #dde4f2

// The glyph keeps its accent colour; the black outline is what lets the purple
// and blue ones hold against their own tint.
.chip-glyph
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.95)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.95))

.chip-cost
  text-shadow: 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000
.chip-cost--ok
  color: #ffe98a
.chip-cost--short
  color: #ff9a9a
.chip-coin
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.9))
.chip-maxed
  color: #ffd76a
  letter-spacing: 0.04em
  text-shadow: 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 0 6px rgba(255, 200, 80, 0.7)

// Level pips as rune-cut diamonds; lit ones carry the accent and a tiny glow.
.pip
  width: 0.34rem
  height: 0.34rem
  border-radius: 1px
  transform: rotate(45deg)
  background: rgba(255, 255, 255, 0.13)
  box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.22)
  transition: background 0.2s ease, box-shadow 0.2s ease
.pip-on
  background: var(--accent)
  box-shadow: inset 0 0.5px 0 rgba(255, 255, 255, 0.65), 0 0 4px -1px var(--accent)
.chip--compact .pip
  width: 0.24rem
  height: 0.24rem

// The tier numeral, pinned to the glyph's lower-right corner like a rank on an
// emblem: a dark plate under gold type, so it reads over the glyph's strokes.
.chip-tier
  position: absolute
  right: -0.45em
  bottom: -0.4em
  z-index: 2
  padding: 0.5px 1.5px
  border-radius: 3px
  background: rgba(5, 8, 18, 0.88)
  box-shadow: 0 0 0 0.5px rgba(255, 215, 106, 0.55)
  color: #ffd76a
  font-weight: 900
  font-size: 0.56rem
  letter-spacing: -0.03em
  text-shadow: 0 1px 0 #000
// Compact: the pip row sits right under the glyph, so the badge may not hang
// below it (it sat on the first pip) — it stays inside the glyph's row and
// leans into the 3px gap before the name instead.
.chip--compact .chip-tier
  right: -0.42em
  bottom: 0.1em
  padding: 0 1px
  font-size: 0.42rem

// Roomy (desktop): the glyph sits ABOVE the name there, so a badge hanging off
// its lower corner landed on the name — it rides the upper corner instead.
.chip--roomy .chip-tier
  top: -0.3em
  bottom: auto
  right: -0.75em

// "Buy me" arrows — over the arena / top bar (`z-[55]`), under the tooltip.
.upgrade-hint
  z-index: 57

// Tooltip. Teleported to <body>, so it sits outside every game stacking
// context. It has to clear the HUD top bar (`z-[55]`) — in the side-by-side
// layout the upgrade row is high enough that the tooltip opens right over the
// wave and coin badges, and at a lower z-index the coin badge cut the
// description in half. Nothing can be stacked *under* by this: the chips are
// only hoverable when no modal is up, and `hideTip` also fires the moment one
// opens. `pointer-events: none` keeps the tooltip from stealing the hover that
// spawned it, which would flicker it on and off over the chip.
.upgrade-tip
  z-index: 60
  pointer-events: none
  max-width: min(15rem, calc(100vw - 1.5rem))
  padding: 0.35rem 0.55rem
  border-radius: 0.55rem
  border: 2px solid rgba(255, 255, 255, 0.16)
  background: linear-gradient(180deg, #1a2440 0%, #0c122a 100%)
  box-shadow: 0 6px 18px -6px rgba(0, 0, 0, 0.9)
  transition: opacity 0.12s ease

.tip-name
  color: #fff
  font-size: 13px
  text-shadow: 1px 1px 0 #000

.tip-desc
  color: #cdd8f0
  font-size: 11px
  margin-top: 0.12rem
</style>
