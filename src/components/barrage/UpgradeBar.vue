<script setup lang="ts">
/**
 * The five Barrage upgrades as runic plaques (MIW's upgrade panel look):
 * Ball Damage · Tray Capacity · Launch Speed · Pickup Luck · Coin Bounty.
 *
 * Casual contract rule 3 — ONE obvious next upgrade: exactly one chip glows
 * (`UpgradeView.glowing`, the cheapest affordable one). While the FTUE's free
 * "Tray Capacity 3" is on offer, that chip is the only thing glowing and it
 * says FREE instead of a price.
 *
 * Every OTHER chip the player can afford wears a small gold glow of its own
 * (`chip--afford`) — quieter than the one glowing chip, but enough that 115–284
 * unspent coins (play-test run 2) never sit beside chips that look inert.
 *
 * Unaffordable chips stay tappable (aria-disabled, not disabled). Their price
 * is a neutral grey, so red can MEAN "denied": the tap shakes the chip, flashes
 * its price red, pops a "need N more" callout on it (its tail points at the
 * chip tapped), pulses the wallet, gives the screen a small shake and plays
 * the denied sound. (Run 2: the old denial reached only the screen reader —
 * the price was already red.)
 *
 * Run 5 ("FREE" and "Need 8 more" at once): while the FTUE's free Tray
 * Capacity is on offer, a refused tap on any other chip is no denial at all —
 * run 7: it claims the gift instead. Run 13: a chip the player CAN afford buys
 * itself and the gift waits (the tap buys what it touched).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import useBarrageUpgrades from '@/barrage/state/useBarrageUpgrades'
import type { UpgradeId, UpgradeView } from '@/barrage/state/contract'
import useSounds from '@/use/useSound'
import { notifyTutorial, tutorialStep } from '@/use/useTutorial'
import { isCompactHud, isRoomyHud, isUltraCompactHud } from '@/use/useUser'
import useScreenshake from '@/use/useScreenshake'
import useEpicConfig from '@/use/useEpicConfig'
import { chipPulse } from '@/use/useCoach'
import IconCoin from '@/components/icons/IconCoin.vue'
import RuneFrame from '@/components/atoms/RuneFrame.vue'
import BarrageGlyph from '@/components/barrage/BarrageGlyph.vue'
import { fmtCoins, pulseWallet, readyGlow, UPGRADE_INSCRIPTION, upgradeValueKey, upgradeValueNumber } from '@/components/barrage/barrageUi'
import { runeZoneFor } from '@/game/runes'
import { emitSparkle } from '@/use/usePrismParticles'
import { longPressTip, showHudTip, type TipContent } from '@/components/barrage/hudTip'

const props = withDefaults(defineProps<{
  /** Chips per row: 5 in one strip (portrait, wide columns), 3 (+2 below) in a
   *  narrow side column where five across would crush the prices. */
  cols?: number
}>(), { cols: 5 })

const { t, locale } = useI18n()
const upgrades = useBarrageUpgrades()
const { playSound } = useSounds()
const { triggerShake } = useScreenshake()
const { coins } = useEpicConfig()
const reducedMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const ACCENT: Record<UpgradeId, string> = {
  damage: '#ff6a2a', capacity: '#5fb0ff', speed: '#36d399', luck: '#7ee05a', bounty: '#ffd23c'
}
/** What each chip's rune border spells (ornament, never read). */
const INSCRIPTION = UPGRADE_INSCRIPTION

/** The chip whose next level is a gift right now: the FTUE's Tray Capacity,
 *  or (run 8) the first Ball Damage level after its arrows were ignored. */
const freeId = computed(() => upgrades.freeId.value)

interface Chip {
  view: UpgradeView
  id: UpgradeId
  free: boolean
  glow: boolean
  /** Affordable, and not the one glowing chip: the quiet gold glow. */
  afford: boolean
  state: 'ready' | 'locked' | 'maxed'
  value: string
  next: string | null
}

const fmtValue = (id: UpgradeId, v: number): string => t(upgradeValueKey(id), { n: upgradeValueNumber(id, v) })

const chips = computed<Chip[]>(() => upgrades.list.value.map((view) => {
  const free = freeId.value === view.id
  // The free FTUE offer is THE obvious next thing — nothing else glows beside it.
  const glow = free || (!freeId.value && view.glowing)
  return {
    view,
    id: view.id,
    free,
    glow,
    afford: readyGlow({ affordable: view.affordable, maxed: view.maxed, glow, free, freeOffer: freeId.value !== null }),
    state: view.maxed ? 'maxed' : (free || view.affordable) ? 'ready' : 'locked',
    value: fmtValue(view.id, view.value),
    next: view.nextValue === null || view.maxed ? null : fmtValue(view.id, view.nextValue)
  }
}))

const name = (id: UpgradeId): string => t(`barrage.upgrades.${id}.short`)

// ─── One-shot pulse (the coach: coins to spend and no purchase in a while) ───
const pulseId = ref<UpgradeId | null>(null)
let pulseTimer = 0
const PULSE_MS = 1400
/** Jump + gold flash on one chip (off for a frame first: a repeat restarts it). */
const pulseChip = (id: UpgradeId): void => {
  pulseId.value = null
  requestAnimationFrame(() => { pulseId.value = id })
  window.clearTimeout(pulseTimer)
  pulseTimer = window.setTimeout(() => { pulseId.value = null }, PULSE_MS)
}
watch(chipPulse, (p) => {
  if (p) pulseChip(p.id)
})
const ariaFor = (c: Chip): string => {
  const base = { name: t(`barrage.upgrades.${c.id}.name`), desc: t(`barrage.upgrades.${c.id}.desc`) }
  if (c.view.maxed) return t('barrage.upgrades.ariaMaxed', base)
  if (c.free) return t('barrage.upgrades.ariaFree', base)
  return t('barrage.upgrades.aria', { ...base, cost: fmtCoins(c.view.cost) })
}
const titleFor = (c: Chip): string => `${t(`barrage.upgrades.${c.id}.name`)} — ${t(`barrage.upgrades.${c.id}.desc`)}`

// ─── Buying ──────────────────────────────────────────────────────────────────
const flareIds = ref<UpgradeId[]>([])
const shakeId = ref<UpgradeId | null>(null)
/** The sr-only "not enough coins" line (the screen shows the callout). */
const deniedText = ref('')
let flareTimer = 0
let shakeTimer = 0
let needTimer = 0
/** How long the denial shows (shake + red price), ms. */
const DENIED_MS = 650
/** How long the "need N more" callout stays up, ms — and the extra time its
 *  second line (the chip's effect, run 10) gets to be read. */
const NEED_MS = 1200
const NEED_DESC_MS = 1300
/** The visible callout on a refused chip (teleported: the chip and the
 *  control deck both clip their overflow). `x` is where the pill is centred,
 *  `tail` how far its tail sits from that centre — on the chip's centre,
 *  whatever the pill had to shift to stay on screen. */
const need = ref<{ seq: number; text: string; desc: string; x: number; y: number; tail: number } | null>(null)
const needEl = ref<HTMLElement | null>(null)
let needSeq = 0
/** The pill never runs off either screen edge (px). */
const NEED_EDGE = 4
/** The pill stands this far above the chip; its 7 px tail dips the rest
 *  into the chip's rim (px). */
const NEED_LIFT = 4

const chipEl = (id: UpgradeId): HTMLElement | null =>
  rootEl.value?.querySelector<HTMLElement>(`[data-upgrade-id="${id}"]`) ?? null
/** The buy flash (and sparkles) on every chip that just gained a level. */
const flare = (ids: UpgradeId[]): void => {
  flareIds.value = []
  requestAnimationFrame(() => { flareIds.value = ids })
  window.clearTimeout(flareTimer)
  flareTimer = window.setTimeout(() => { flareIds.value = [] }, 520)
  for (const id of ids) {
    const r = chipEl(id)?.getBoundingClientRect()
    if (r) emitSparkle(r.left + r.width / 2, r.top + r.height / 2, ACCENT[id], 12)
  }
}

/** Playtest run 9: a claimed free level says so — "FREE" in green by the
 *  chip's new price. Dev read the claim as "a purchase that didn't deduct
 *  coins" (the chip had said FREE a frame earlier; its new price replaced it).
 *  Run 12 (Dev tapped again inside its 2.5 s and got "Need 13 more" beside it:
 *  "the FREE label directly contradicts the actual cost"): the pill says
 *  RECEIVED — a check with "FREE" — leaves with the flare, and the next chip
 *  tap clears it before anything else answers. (Runs 7–9's "▲N" multi-buy
 *  count is gone with the multi-buy: one tap, one level — run 10.) */
const gift = ref<{ id: UpgradeId; seq: number } | null>(null)
let giftSeq = 0
let giftTimer = 0
const GIFT_MS = 1500
const showGift = (id: UpgradeId): void => {
  gift.value = { id, seq: ++giftSeq }
  window.clearTimeout(giftTimer)
  giftTimer = window.setTimeout(() => { gift.value = null }, GIFT_MS)
}
const clearGift = (): void => {
  window.clearTimeout(giftTimer)
  gift.value = null
}

/** Playtest run 10 (Speed, Luck and Bounty still unexplained; nobody found the
 *  long press): the FIRST purchase of each chip in a session names what it
 *  bought, beside the chip, on the player's own tap. Run 12 (Leo read it as
 *  "an info tooltip only (no purchase)", and chip taps as inconsistent): it is
 *  a RECEIPT — a check and the level just bought ("3 → 4") above what the chip
 *  does — and it opens once the buy's flare has landed (RECEIPT_DELAY_MS); any
 *  touch before that cancels it. */
const named = new Set<UpgradeId>()
const RECEIPT_DELAY_MS = 380
let receiptTimer = 0
const cancelReceipt = (): void => {
  window.clearTimeout(receiptTimer)
  receiptTimer = 0
}
const chipTip = (id: UpgradeId): TipContent => ({
  icon: id, name: t(`barrage.upgrades.${id}.name`), facts: [{ text: t(`barrage.upgrades.${id}.desc`) }]
})
const receiptTip = (id: UpgradeId, from: string, to: string): TipContent => ({
  icon: id,
  name: t(`barrage.upgrades.${id}.name`),
  facts: [
    { icon: 'check', text: t('barrage.upgrades.arrow', { from, to }) },
    { text: t(`barrage.upgrades.${id}.desc`) }
  ]
})
/** `from` / `to`: the chip's value line before and after the level. */
const receiptOnFirstBuy = (id: UpgradeId, el: HTMLElement | null, from: string, to: string | null): void => {
  if (named.has(id) || !el || to === null) return
  named.add(id)
  cancelReceipt()
  receiptTimer = window.setTimeout(() => {
    receiptTimer = 0
    if (el.isConnected) showHudTip(el, () => receiptTip(id, from, to))
  }, RECEIPT_DELAY_MS)
}

// Run 9 (Jonas: "what GLÜCK actually affects — no tooltip was shown"): a
// long press names the chip and says what it does, and buys nothing.
let pressId: UpgradeId | null = null
const press = longPressTip(() => chipTip(pressId ?? 'damage'))
const onChipDown = (c: Chip, ev: PointerEvent): void => {
  pressId = c.id
  press.down(ev)
}

const onChip = (c: Chip, ev: MouseEvent): void => {
  if (press.consumed()) return
  const el = ev.currentTarget as HTMLElement | null
  // A new tap answers for itself: no gift pill or pending receipt from the
  // last one stands beside its answer.
  clearGift()
  cancelReceipt()
  // Run 7: while the FTUE's free Tray Capacity is on offer, a chip that would
  // only refuse takes it. A tester aimed at FREE, hit Damage beside it, read
  // the old wordless redirect ("this one first") as nothing happening and
  // never tapped a chip again — the free offer stayed open, so no funnel ever
  // ran for him. The gift was the point, not the aim.
  // (The same holds for run 8's free first Damage level.)
  // Run 13: but a chip the wallet covers buys ITSELF, and the gift waits. Dev
  // followed the tray lesson's hand onto Capacity while Damage said FREE, got
  // the Damage level, read it as "the hint and the purchase didn't match" and
  // never tapped a chip again.
  const free = freeId.value
  if (free && (c.id === free || c.view.maxed || !c.view.affordable)) {
    const gifted = chips.value.find((x) => x.id === free)
    upgrades.claimFree()
    playSound('upgrade-buy', 0.06, 1.1)
    flare([free])
    showGift(free)
    if (gifted) receiptOnFirstBuy(free, chipEl(free), gifted.value, gifted.next)
    notifyTutorial({ kind: 'upgrade' })
    return
  }
  // One tap, one level — every chip (run 10: the glowing chip's multi-buy
  // spent 89 coins on one tap and read as a bug).
  const from = c.value
  const to = c.next
  if (!c.view.maxed && upgrades.buy(c.id)) {
    playSound('upgrade-buy', 0.05, 1.05)
    flare([c.id])
    receiptOnFirstBuy(c.id, el, from, to)
    notifyTutorial({ kind: 'upgrade' })
    return
  }
  deny(c, el)
}

/** Keep the pill on screen and its tail on the chip: measured once it is up. */
const placeNeed = (): void => {
  const n = need.value
  const el = needEl.value
  if (!n || !el) return
  // The layout width: the pill enters scaled down, and a transformed rect
  // would let it hang off the screen edge.
  const w = el.offsetWidth
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  if (!(w > 0) || !(vw > 0)) return
  const chipX = n.x + n.tail
  const x = Math.min(Math.max(chipX, NEED_EDGE + w / 2), Math.max(NEED_EDGE + w / 2, vw - NEED_EDGE - w / 2))
  if (x !== n.x) need.value = { ...n, x, tail: chipX - x }
}

const deny = (c: Chip, el: HTMLElement | null): void => {
  // A short dull thunk, pitched down so it never sounds like the buy chime.
  playSound('upgrade-denied', 0.05, 0.8)
  // Off for a frame, then on: a second tap mid-shake restarts the animation.
  shakeId.value = null
  requestAnimationFrame(() => { shakeId.value = c.id })
  window.clearTimeout(shakeTimer)
  shakeTimer = window.setTimeout(() => { shakeId.value = null }, DENIED_MS)
  if (c.view.maxed) {
    deniedText.value = ''
    return
  }
  deniedText.value = t('barrage.upgrades.denied', { cost: fmtCoins(c.view.cost) })
  // What is short, ON the chip tapped (its tail points at it; run 5: a pill
  // floating over the tray read as belonging to its neighbour) — and at the
  // wallet it comes from.
  const r = el?.getBoundingClientRect()
  if (r && r.width > 0) {
    need.value = {
      seq: ++needSeq,
      text: t('barrage.upgrades.need', { n: fmtCoins(Math.max(1, c.view.cost - coins.value)) }),
      // Run 10: what it would buy, where the player is looking anyway.
      desc: t(`barrage.upgrades.${c.id}.desc`),
      x: r.left + r.width / 2,
      y: r.top - NEED_LIFT,
      tail: 0
    }
    void nextTick(placeNeed)
    window.clearTimeout(needTimer)
    needTimer = window.setTimeout(() => { need.value = null }, NEED_MS + NEED_DESC_MS)
  }
  pulseWallet()
  if (!reducedMotion) triggerShake('small')
}

// ─── Sizing ──────────────────────────────────────────────────────────────────
// The rune bands scale off the chip's real height (see `runeZoneFor`); on
// compact phones the frame goes entirely — a 50px chip needs every pixel for
// glyph, name, value and price.
const rootEl = ref<HTMLElement | null>(null)
const barH = ref(0)
let ro: ResizeObserver | null = null
onMounted(() => {
  const el = rootEl.value
  if (!el) return
  const measure = (): void => { barH.value = el.clientHeight }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(el)
  }
})
onUnmounted(() => {
  ro?.disconnect()
  window.clearTimeout(flareTimer)
  window.clearTimeout(shakeTimer)
  window.clearTimeout(needTimer)
  window.clearTimeout(pulseTimer)
})

const rowsOf = computed(() => Math.max(1, Math.ceil(5 / Math.max(1, props.cols))))
/** One chip's height: the bar splits into `rowsOf` rows. */
const chipH = computed(() => (barH.value - 3 - 4 * (rowsOf.value - 1)) / rowsOf.value)
const runes = computed(() => !isCompactHud.value && chipH.value >= 58)
const runeZone = computed(() => runes.value ? `${runeZoneFor(Math.max(0, chipH.value - 3)).toFixed(1)}px` : '3px')
const chipBasis = computed(() => props.cols >= 5
  ? undefined
  : `calc((100% - ${4 * (props.cols - 1)}px) / ${props.cols})`)

const nameClass = computed(() => isCompactHud.value ? 'text-[10px]' : isRoomyHud.value ? 'text-[13px]' : 'text-[11px]')
const valueClass = computed(() => isCompactHud.value ? 'text-[10px]' : isRoomyHud.value ? 'text-[13px]' : 'text-[11px]')
const costClass = computed(() => isCompactHud.value ? 'text-[11px]' : isRoomyHud.value ? 'text-sm' : 'text-xs')
const glyphClass = computed(() => isCompactHud.value ? 'w-3.5 h-3.5' : isRoomyHud.value ? 'w-5 h-5' : 'w-4 h-4')
const coinClass = computed(() => isCompactHud.value ? 'w-3 h-3' : isRoomyHud.value ? 'w-4 h-4' : 'w-3.5 h-3.5')

// The FTUE hand presses whichever chip the tutorial names.
const tutTarget = computed(() => tutorialStep.value === 'upgrade')

// ─── Shrink-to-fit labels ────────────────────────────────────────────────────
// "Kapazität", "Вместимость", "Сыйымдылық": a label that fits in English is
// clipped in half the locales at phone width. Truncating it (MIW's first answer)
// earned a portal QA ticket; instead each name / value line steps its own font
// down, half a pixel at a time, until it fits — never below 8 px, where the
// ellipsis takes over again. Re-run only when the TEXT or the box changes, not on
// every coin tick (affordability flips don't change a single glyph).
const MIN_FONT = 8
/** The label's text as laid out, in fractional px. Playtest run 11 (German,
 *  "×1.95 → ×2…"): scrollWidth / clientWidth are whole pixels, so a line 0.4 px
 *  too wide passed as fitting and the ellipsis cut it. */
const textWidth = (el: HTMLElement): number => {
  const r = document.createRange()
  r.selectNodeContents(el)
  return r.getBoundingClientRect().width
}
const fitLabels = (): void => {
  const root = rootEl.value
  if (!root) return
  for (const el of root.querySelectorAll<HTMLElement>('.chip-name, .chip-value')) {
    el.style.fontSize = ''
    // Not laid out (hidden): nothing to measure — the resize observer re-fits it.
    if (el.getBoundingClientRect().width <= 0) continue
    let size = parseFloat(getComputedStyle(el).fontSize)
    while (textWidth(el) > el.getBoundingClientRect().width + 0.05 && size > MIN_FONT) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
  }
}
const labelKey = computed(() => `${locale.value}|${barH.value}|${props.cols}|${chips.value.map((c) => `${c.value}${c.next ?? ''}${c.view.maxed}`).join()}`)
watch(labelKey, () => { void nextTick(fitLabels) })
// …and whenever the bar itself changes size (shown again, a rotation, a
// sidebar opening) — the text did not change, the room did.
let fitRo: ResizeObserver | null = null
let fitRaf = 0
onMounted(() => {
  window.addEventListener('pointerdown', cancelReceipt, true)
  void nextTick(fitLabels)
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    fitRo = new ResizeObserver(() => {
      cancelAnimationFrame(fitRaf)
      fitRaf = requestAnimationFrame(fitLabels)
    })
    fitRo.observe(rootEl.value)
  }
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', cancelReceipt, true)
  cancelReceipt()
  window.clearTimeout(giftTimer)
  fitRo?.disconnect()
  fitRo = null
  cancelAnimationFrame(fitRaf)
})
</script>

<template lang="pug">
  div.upgrade-bar.flex.items-stretch.justify-center.w-full.h-full.gap-1(
    ref="rootEl"
    class="pb-[3px]"
    :class="cols < 5 ? 'flex-wrap content-stretch' : ''"
    role="group"
    :aria-label="t('barrage.upgrades.title')"
  )
    button.chip.flex.flex-col.items-center.justify-center.min-w-0(
      v-for="c in chips"
      :key="c.id"
      type="button"
      :class="['chip--' + c.state, { 'chip--glow': c.glow, 'chip--afford': c.afford, 'chip--pulse': pulseId === c.id, 'chip--free': c.free, 'chip--compact': isCompactHud, 'chip--flare': flareIds.includes(c.id), 'chip--shake': shakeId === c.id, 'chip--tut': tutTarget && c.glow, 'flex-1': cols >= 5 }]"
      :style="{ '--accent': ACCENT[c.id], '--rune-zone': runeZone, flexBasis: chipBasis, height: cols < 5 ? chipH + 'px' : undefined }"
      :aria-disabled="c.state === 'locked' || c.view.maxed ? 'true' : undefined"
      :aria-label="ariaFor(c)"
      :title="titleFor(c)"
      :data-tut="'upgrade-' + c.id"
      :data-upgrade-id="c.id"
      @click="onChip(c, $event)"
      @pointerdown="onChipDown(c, $event)"
      @pointerup="press.cancel"
      @pointerleave="press.cancel"
      @pointercancel="press.cancel"
      @contextmenu.prevent
    )
      RuneFrame(v-if="runes" :inscription="INSCRIPTION[c.id]" :state="c.state")
      //- Glyph + short name.
      span.flex.items-center.justify-center.w-full.min-w-0(class="gap-[3px]")
        span.chip-glyph.shrink-0(:class="glyphClass" :style="{ color: ACCENT[c.id] }")
          BarrageGlyph.w-full.h-full(:name="c.id")
        span.chip-name.game-text.font-black.uppercase.leading-none.truncate(v-if="!isUltraCompactHud" :class="nameClass") {{ name(c.id) }}
      //- Value → next value.
      span.chip-value.game-text.font-black.leading-tight.whitespace-nowrap.max-w-full.truncate(:class="valueClass")
        template(v-if="c.next") {{ t('barrage.upgrades.arrow', { from: c.value, to: c.next }) }}
        template(v-else) {{ c.value }}
      //- Price (or FREE / MAX).
      span.flex.items-center.justify-center(class="gap-0.5 mt-px")
        template(v-if="c.view.maxed")
          span.chip-maxed.game-text.font-black.leading-none(:class="costClass") {{ t('barrage.upgrades.max') }}
        template(v-else-if="c.free")
          span.chip-free.game-text.font-black.leading-none.uppercase(:class="costClass") {{ t('barrage.upgrades.free') }}
        template(v-else)
          IconCoin.chip-coin.shrink-0(:class="coinClass")
          span.chip-cost.game-text.font-black.leading-none.tabular-nums(
            :class="[c.view.affordable ? 'chip-cost--ok' : 'chip-cost--short', { 'chip-cost--denied': shakeId === c.id }, costClass]"
          ) {{ fmtCoins(c.view.cost) }}
          //- Run 9: a claimed gift says "FREE" by the new price (beside it —
          //- run 8: a pill over the name read as a MAX badge); run 12: with a
          //- check — received, not "this chip is free".
          span.chip-levels.chip-levels--gift.game-text.font-black.tabular-nums.leading-none.inline-flex.items-center(
            v-if="gift && gift.id === c.id"
            :key="gift.seq"
            aria-hidden="true"
          )
            BarrageGlyph.chip-levels__check(name="check")
            span {{ t('barrage.upgrades.free') }}
    div.sr-only(aria-live="assertive") {{ deniedText }}
    Teleport(to="body")
      Transition(name="chip-need")
        div.chip-need.hud-digits.fixed.flex.flex-col.items-center.pointer-events-none(
          v-if="need"
          :key="need.seq"
          ref="needEl"
          :style="{ left: need.x + 'px', top: need.y + 'px', '--tail': need.tail + 'px' }"
          aria-hidden="true"
        )
          span.chip-need__row.flex.items-center
            IconCoin.chip-need__coin.shrink-0
            span.game-text.font-black.whitespace-nowrap {{ need.text }}
          span.chip-need__desc.game-text(v-if="need.desc") {{ need.desc }}
</template>

<style scoped lang="sass">
// Same runic plaque as MIW's UpgradePanel: accent-tinted crown over deep navy,
// a near-black outline, accent rim and a solid base plate the chip presses onto.
.chip
  --tint: color-mix(in srgb, var(--accent) 26%, #19233f)
  --plate: color-mix(in srgb, var(--accent) 42%, #03050c)
  position: relative
  overflow: hidden
  cursor: pointer
  gap: 1px
  border-radius: 0.75rem
  border: 2px solid #060a16
  padding: var(--rune-zone) 4px
  background: radial-gradient(130% 85% at 50% -14%, color-mix(in srgb, var(--accent) 34%, transparent) 0%, transparent 62%), linear-gradient(180deg, var(--tint) 0%, #0f1631 56%, #080c1d 100%)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate)
  transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.2s ease
  -webkit-tap-highlight-color: transparent
  touch-action: manipulation
  min-height: 44px

  > :not(.rune-frame)
    position: relative
    z-index: 1

  &:active
    transform: translateY(2px)
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 1px 0 var(--plate)

  @media (hover: hover)
    &:hover
      filter: brightness(1.1)

.chip--ready
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 0 0 0 1px color-mix(in srgb, var(--accent) 70%, transparent), inset 0 -2px 0 rgba(0, 0, 0, 0.45), 0 3px 0 var(--plate), 0 0 9px -4px var(--accent)

// "Not yet": cooler body + a light grey veil, type stays at full contrast.
.chip--locked
  --tint: color-mix(in srgb, var(--accent) 10%, #161c30)
  --plate: color-mix(in srgb, var(--accent) 16%, #03050c)
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

.chip--maxed
  --tint: color-mix(in srgb, #ffd76a 20%, #1b2034)
  --plate: color-mix(in srgb, #ffd76a 38%, #03050c)

// THE one obvious upgrade: a gold ring that breathes + a slow bob. The ring is
// an inset shadow (the chip clips its overflow), so it cannot reach a neighbour.
.chip--glow
  animation: chip-glow 1.1s ease-in-out infinite alternate
@keyframes chip-glow
  from
    box-shadow: inset 0 0 0 2px rgba(255, 214, 74, 0.55), inset 0 0 10px rgba(255, 214, 74, 0.25), 0 3px 0 var(--plate)
    transform: translateY(0)
  to
    box-shadow: inset 0 0 0 2px rgba(255, 230, 120, 1), inset 0 0 16px rgba(255, 214, 74, 0.55), 0 3px 0 var(--plate)
    transform: translateY(-1px)

.chip--free
  --accent: #4fd16a

.chip--flare
  filter: brightness(1.6)
  transition: filter 0.5s ease-out
// "Not yet": a hard head-shake, big enough to see under a thumb.
.chip--shake
  animation: chip-shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97)
@keyframes chip-shake
  0%, 100%
    translate: 0 0
    rotate: 0deg
  15%, 55%
    translate: -6px 0
    rotate: -2deg
  35%, 75%
    translate: 6px 0
    rotate: 2deg
  90%
    translate: -2px 0
    rotate: 0deg
// Every other affordable chip: a small gold glow of its own — a thin inner
// ring that breathes slowly. Quieter than `chip--glow` (no bob, half the
// ring, a third the speed), so the ONE obvious upgrade still stands out.
.chip::after
  content: ''
  position: absolute
  inset: 0
  z-index: 2
  pointer-events: none
  border-radius: inherit
  opacity: 0
.chip--afford::after
  box-shadow: inset 0 0 0 1.5px rgba(255, 214, 74, 0.7), inset 0 0 9px rgba(255, 200, 60, 0.35)
  animation: chip-afford 2.6s ease-in-out infinite alternate
@keyframes chip-afford
  from
    opacity: 0.45
  to
    opacity: 1

// The coach's nudge: coins to spend, nothing bought in a while — the glowing
// chip jumps twice and flashes gold.
.chip--pulse
  animation: chip-glow 1.1s ease-in-out infinite alternate, chip-pulse 1.4s ease-out
@keyframes chip-pulse
  0%, 50%, 100%
    scale: 1
    filter: brightness(1)
  15%, 65%
    scale: 1.1
    filter: brightness(1.45)

// "Need N more": a small dark pill on the refused chip — its tail points down
// at the chip tapped (`--tail`: the chip's centre from the pill's, when the
// pill had to shift to stay on screen), dipping into the chip's rim.
.chip-need
  --tail: 0px
  z-index: 72
  gap: 3px
  translate: -50% -100%
  padding: 3px 8px 3px 5px
  border-radius: 12px
  background: linear-gradient(180deg, #3a0f14, #1d070b)
  border: 1.5px solid #ff5a5a
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.55), 0 0 10px rgba(255, 60, 60, 0.45)
  color: #ffdede
  font-size: 12px
  line-height: 1
  text-shadow: 0 1px 0 #000
  &::after
    content: ''
    position: absolute
    top: 100%
    left: clamp(8px, calc(50% + var(--tail)), calc(100% - 8px))
    width: 0
    height: 0
    translate: -50% 0
    border-left: 6px solid transparent
    border-right: 6px solid transparent
    border-top: 7px solid #ff5a5a
    filter: drop-shadow(0 2px 1px rgba(0, 0, 0, 0.5))
.chip-need__row
  gap: 3px
// Run 10: what the chip would buy, under "need N more".
.chip-need__desc
  max-width: 190px
  margin-top: 2px
  padding: 0 2px 1px
  font-size: 10.5px
  font-weight: 700
  line-height: 1.2
  text-align: center
  white-space: normal
  color: #ffd7d7
.chip-need__coin
  width: 14px
  height: 14px
.chip-need-enter-active
  transition: opacity 0.12s ease-out, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)
.chip-need-leave-active
  transition: opacity 0.25s ease-in, transform 0.25s ease-in
.chip-need-enter-from
  opacity: 0
  transform: translateY(6px) scale(0.8)
.chip-need-leave-to
  opacity: 0
  transform: translateY(-6px)

// …and the price it is short of flashes red.
.chip-cost--denied
  animation: chip-cost-denied 0.65s ease-out
@keyframes chip-cost-denied
  0%, 60%
    color: #ff3b3b
    scale: 1.3
    text-shadow: 0 0 6px rgba(255, 40, 40, 0.95), 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000
  100%
    scale: 1

// The coach hand presses this chip in the FTUE's upgrade beat — in step with
// UpgradeDemo's 3.8 s loop (its hand is down from 13 % to 20 %).
.chip--tut
  animation: chip-glow 1.1s ease-in-out infinite alternate, chip-tut-press 3.8s ease-in-out infinite
@keyframes chip-tut-press
  0%, 12%, 21%, 100%
    translate: 0 0
  14%, 19%
    translate: 0 2px
// Run 5: a refused tap beside the free offer points back at it — the free
// chip jumps and flashes gold without losing the hand's press rhythm (the
// running animations keep their names, so they carry on; only the pulse starts).
.chip--tut.chip--pulse
  animation: chip-glow 1.1s ease-in-out infinite alternate, chip-tut-press 3.8s ease-in-out infinite, chip-pulse 1.4s ease-out

.chip--compact
  border-width: 1.5px
  border-radius: 0.6rem
  padding-left: 3px
  padding-right: 3px

.chip-name, .chip-value, .chip-cost, .chip-maxed, .chip-free
  text-shadow: 0 1px 0 #000, 0 -1px 0 #000, 1px 0 0 #000, -1px 0 0 #000
.chip-name
  color: #fff
.chip-value
  color: #cfe2ff
.chip-glyph
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.95)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.95))
.chip-cost--ok
  color: #ffe98a
// Not affordable yet: neutral grey — red is kept for "denied".
.chip-cost--short
  color: #b4bccb
.chip-coin
  filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.9))
.chip-maxed
  color: #ffd76a
.chip-free
  color: #8dffa6
  letter-spacing: 0.04em

// Run 9: a claimed gift — "FREE" in a small green pill beside the price (the
// only pill since run 10: runs 7–9's gold "▲N" left with the multi-buy).
.chip-levels
  margin-left: 3px
  padding: 1px 4px
  border-radius: 999px
  font-size: 11px
  text-transform: uppercase
  color: #06290f
  background: linear-gradient(#d6ffe0, #5fe38a)
  box-shadow: 0 0 8px rgba(120, 255, 160, 0.9)
  pointer-events: none
  animation: chip-multi 1.5s ease-out both
.chip-levels__check
  width: 10px
  height: 10px
  margin-right: 1px
  flex: 0 0 auto
@keyframes chip-multi
  0%
    opacity: 0
    scale: 0.4
  15%
    opacity: 1
    scale: 1.25
  30%
    scale: 1
  80%
    opacity: 1
  100%
    opacity: 0
    translate: 0 -4px

// Reduced motion: the pill holds still, then fades.
@keyframes chip-multi-still
  0%, 85%
    opacity: 1
  100%
    opacity: 0

@media (prefers-reduced-motion: reduce)
  .chip--glow, .chip--tut, .chip--shake, .chip--pulse, .chip--tut.chip--pulse, .chip--afford::after
    animation: none
  .chip-levels
    animation: chip-multi-still 1.5s linear both
  // The pulse without the jump: a gold flash that holds while it lasts.
  .chip--pulse
    filter: brightness(1.4)
  .chip--afford::after
    opacity: 1
  // Reduced motion keeps the red price (a colour change, not motion).
  .chip-cost--denied
    color: #ff3b3b
  .chip--glow
    box-shadow: inset 0 0 0 2px rgba(255, 230, 120, 1), 0 3px 0 var(--plate)
</style>
