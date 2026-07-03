<script setup lang="ts">
/**
 * BattleArena — renders the auto-battle and turns engine events into juice.
 *
 * Hot-path contract with `useBattle` (implementation-plan.md §5):
 *   • Vue's v-for only mounts/unmounts entities; every per-frame position /
 *     HP-bar write goes straight to the DOM through element maps.
 *   • The engine's event sink drives damage numbers (pooled DOM nodes),
 *     particles (shared pool), SFX (throttled), screenshake, and the
 *     transient overlays (chain bolts, novas, black holes, meteors, banners).
 *
 * Also owns the 'arena' drop zone the merge grid targets, the boss HP bar,
 * the gate, the combo/fever theatre, and the Meteor Storm button.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useBattle, { type BattleEvent, type Fighter, type Enemy } from '@/use/useBattle'
import { getFighterDef } from '@/game/units'
import { getIngredient } from '@/game/ingredients'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import EnemyUnit from '@/components/organisms/EnemyUnit.vue'
import useSounds from '@/use/useSound'
import useScreenshake from '@/use/useScreenshake'
import { emitConfetti, emitSparkle, emitSplash } from '@/use/usePrismParticles'
import { registerDropZone, unregisterDropZone, dragActive } from '@/use/useDropZones'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'

const props = defineProps<{
  /** Wallet badge element — kill/boss payouts fly coins into it. */
  coinTarget?: HTMLElement | null
}>()

const sceneEmit = defineEmits<{
  /** A boss died — the scene may offer a 2× bounty rewarded ad. */
  (e: 'bossKill', bounty: number): void
}>()

const { t } = useI18n()
const battle = useBattle()
const { playSound } = useSounds()
const { triggerShake } = useScreenshake()

const rootRef = ref<HTMLElement | null>(null)

// ─── Geometry: normalized (0..100) → arena px ────────────────────────────────
let boxW = 0
let boxH = 0
let boxLeft = 0
let boxTop = 0
let resizeObs: ResizeObserver | null = null
const cacheRect = (): void => {
  const r = rootRef.value?.getBoundingClientRect()
  if (!r) return
  boxW = r.width; boxH = r.height; boxLeft = r.left; boxTop = r.top
}
const toClientX = (x: number): number => boxLeft + (x / 100) * boxW
const toClientY = (y: number): number => boxTop + (y / 100) * boxH

// ─── Entity element maps (direct-DOM hot path) ───────────────────────────────
interface EntityEls { root: HTMLElement; hp: HTMLElement | null }
const fighterEls = new Map<number, EntityEls>()
const enemyEls = new Map<number, EntityEls>()
const projEls = new Map<number, HTMLElement>()

const setFighterEl = (id: number) => (el: unknown): void => {
  if (el instanceof HTMLElement) fighterEls.set(id, { root: el, hp: el.querySelector('.hpfill') })
  else fighterEls.delete(id)
}
const setEnemyEl = (id: number) => (el: unknown): void => {
  if (el instanceof HTMLElement) enemyEls.set(id, { root: el, hp: el.querySelector('.hpfill') })
  else enemyEls.delete(id)
}
const setProjEl = (id: number) => (el: unknown): void => {
  if (el instanceof HTMLElement) projEls.set(id, el)
  else projEls.delete(id)
}

const writeEntity = (els: EntityEls | undefined, x: number, y: number, hpFrac: number): void => {
  if (!els) return
  els.root.style.transform = `translate(${(x / 100) * boxW}px, ${(y / 100) * boxH}px)`
  els.root.style.zIndex = String(10 + Math.round(y))
  if (els.hp) els.hp.style.width = `${Math.max(0, Math.min(100, hpFrac * 100))}%`
}

const render = (): void => {
  if (!boxW) cacheRect()
  for (const f of battle.fighters.value) writeEntity(fighterEls.get(f.id), f.x, f.y, f.hp / f.maxHp)
  for (const e of battle.enemies.value) writeEntity(enemyEls.get(e.id), e.x, e.y, e.hp / e.maxHp)
  for (const p of battle.projectiles.value) {
    const el = projEls.get(p.id)
    if (el) el.style.transform = `translate(${(p.x / 100) * boxW}px, ${(p.y / 100) * boxH}px)`
  }
}

// ─── Damage-number pool ──────────────────────────────────────────────────────
const NUM_POOL = 36
const numEls: (HTMLElement | null)[] = Array.from({ length: NUM_POOL }, () => null)
const numBusy: number[] = Array.from({ length: NUM_POOL }, () => 0)
const setNumEl = (i: number) => (el: unknown): void => { numEls[i] = el instanceof HTMLElement ? el : null }

const fmtNum = (n: number): string => n >= 10_000 ? `${Math.round(n / 1000)}K` : String(Math.round(n))

const popNumber = (x: number, y: number, amount: number, variant: string): void => {
  const i = numBusy.indexOf(0)
  if (i < 0) return // pool saturated — drop
  const el = numEls[i]
  if (!el) return
  numBusy[i] = 1
  el.textContent = (variant === 'heal' || variant === 'gold' ? '+' : '') + fmtNum(amount)
  el.className = `dmg-num num-${variant}`
  el.style.left = `${x}%`
  el.style.top = `${y}%`
  // Restart the CSS animation.
  void el.offsetWidth
  el.classList.add('num-live')
  window.setTimeout(() => { el.classList.remove('num-live'); numBusy[i] = 0 }, 750)
}

// ─── Transient overlay effects (low frequency → fine as reactive lists) ──────
interface Flash { id: number; type: 'nova' | 'blackhole' | 'meteor' | 'warheal' | 'shockwave' | 'mergeburst'; x: number; y: number }
const flashes = ref<Flash[]>([])
let flashSeq = 0
const FLASH_MS: Record<Flash['type'], number> = {
  nova: 600, blackhole: 900, meteor: 700, warheal: 600, shockwave: 500, mergeburst: 500
}
const addFlash = (type: Flash['type'], x: number, y: number): void => {
  const id = ++flashSeq
  flashes.value = [...flashes.value, { id, type, x, y }]
  window.setTimeout(() => { flashes.value = flashes.value.filter((f) => f.id !== id) }, FLASH_MS[type])
}

interface ChainFlash { id: number; points: string }
const chains = ref<ChainFlash[]>([])
const addChain = (points: { x: number; y: number }[]): void => {
  const id = ++flashSeq
  chains.value = [...chains.value, { id, points: points.map((p) => `${p.x},${p.y}`).join(' ') }]
  window.setTimeout(() => { chains.value = chains.value.filter((c) => c.id !== id) }, 260)
}

// ─── Banners / HUD theatre ───────────────────────────────────────────────────
const waveBanner = ref<{ text: string; boss: boolean } | null>(null)
let waveBannerTimer = 0
const showWaveBanner = (text: string, boss: boolean, ms: number): void => {
  waveBanner.value = { text, boss }
  window.clearTimeout(waveBannerTimer)
  waveBannerTimer = window.setTimeout(() => { waveBanner.value = null }, ms)
}

const comboPop = ref<{ n: number; id: number } | null>(null)
let comboTimerId = 0

const gateShake = ref(false)
let gateShakeTimer = 0

// ─── SFX throttling ──────────────────────────────────────────────────────────
const lastSfx = new Map<string, number>()
const throttledSound = (group: string, name: string, vol: number, pitch = 1, minGapMs = 100): void => {
  const now = performance.now()
  if (now - (lastSfx.get(group) ?? 0) < minGapMs) return
  lastSfx.set(group, now)
  playSound(name, vol, pitch)
}
const clashSound = (tier: number): void => {
  const n = 1 + ((Math.random() * 5) | 0)
  throttledSound('clash', `clash-${n}`, 0.02, 0.9 + Math.min(10, tier) * 0.03, 90)
}

// ─── The event sink: every engine happening → juice ──────────────────────────
const onEvent = (e: BattleEvent): void => {
  switch (e.type) {
    case 'number':
      popNumber(e.x, e.y, e.amount, e.variant)
      break
    case 'strike': {
      clashSound(e.tier)
      const inner = fighterEls.get(e.id)?.root.querySelector<HTMLElement>('.unit-body')
      inner?.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(12%) scale(1.08)' }, { transform: 'translateX(0)' }],
        { duration: 180, easing: 'ease-out' }
      )
      break
    }
    case 'shot':
      throttledSound('shot', 'dodge', 0.012, 1.3, 120)
      break
    case 'impact':
      emitSparkle(toClientX(e.x), toClientY(e.y), e.color, 4)
      break
    case 'splash':
      emitConfetti(toClientX(e.x), toClientY(e.y), 10, 1)
      throttledSound('boom', 'explosion-1', 0.03, 1.1, 150)
      triggerShake('small')
      break
    case 'chain':
      addChain(e.points)
      throttledSound('chain', 'crystal-cut', 0.025, 1.4, 150)
      break
    case 'nova':
      addFlash('nova', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#bfe6ff', 14)
      throttledSound('nova', 'crystal-cut', 0.03, 0.8, 200)
      break
    case 'blackhole':
      addFlash('blackhole', e.x, e.y)
      playSound('gravity', 0.04, 0.8)
      triggerShake('small')
      break
    case 'death':
      emitConfetti(toClientX(e.x), toClientY(e.y), e.boss ? 40 : 8, e.boss ? 1.6 : 0.8)
      throttledSound('death', 'shrapnel', 0.02, 1 + Math.random() * 0.3, 80)
      break
    case 'fighterDeath':
      emitSplash(toClientX(e.x), toClientY(e.y), getIngredient(e.tier).glow)
      playSound('obstacle-hit', 0.03, 0.8)
      break
    case 'deploy':
      addFlash('shockwave', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#ffffff', 10)
      playSound('stone-cut', 0.04, 1.1)
      break
    case 'fieldMerge':
      addFlash('mergeburst', e.x, e.y)
      emitConfetti(toClientX(e.x), toClientY(e.y), 16, 1.2)
      playSound('level-up', 0.05, 0.85 + Math.min(10, e.tier) * 0.05)
      break
    case 'gateHit': {
      gateShake.value = true
      window.clearTimeout(gateShakeTimer)
      gateShakeTimer = window.setTimeout(() => { gateShake.value = false }, 200)
      throttledSound('gate', 'obstacle-hit', 0.025, 0.9, 150)
      triggerShake('small')
      break
    }
    case 'overrun':
      playSound('lose', 0.06)
      triggerShake('big')
      break
    case 'waveStart':
      showWaveBanner(
        e.boss ? t('battle.bossIncoming') : t('battle.waveStart', { n: e.wave }),
        e.boss, e.boss ? 2200 : 1400
      )
      playSound(e.boss ? 'barricade' : 'modal-open', e.boss ? 0.07 : 0.03)
      if (e.boss) triggerShake('strong')
      break
    case 'waveCleared':
      showWaveBanner(t('battle.waveCleared', { n: e.bonus }), false, 1500)
      playSound('win', 0.045)
      if (props.coinTarget && rootRef.value) {
        spawnCoinExplosion({ sourceEl: rootRef.value, targetEl: props.coinTarget, count: 12 })
      }
      break
    case 'bossKill':
      emitConfetti(toClientX(e.x), toClientY(e.y), 60, 2)
      playSound('explosion-1', 0.07, 0.8)
      playSound('celebration-3', 0.08)
      triggerShake('big')
      if (props.coinTarget && rootRef.value) {
        spawnCoinExplosion({ sourceEl: rootRef.value, targetEl: props.coinTarget, count: 30 })
      }
      sceneEmit('bossKill', e.bounty)
      break
    case 'enrage':
      playSound('chainsaw-break', 0.05, 0.9)
      triggerShake('strong')
      break
    case 'combo': {
      comboPop.value = { n: e.combo, id: ++flashSeq }
      window.clearTimeout(comboTimerId)
      comboTimerId = window.setTimeout(() => { comboPop.value = null }, 900)
      throttledSound('combo', 'coin-pickup', 0.02, 1 + Math.min(20, e.combo) * 0.05, 120)
      break
    }
    case 'fever':
      playSound('celebration-1', 0.07)
      triggerShake('strong')
      break
    case 'ultReady':
      playSound('reward-continue', 0.05)
      break
    case 'meteor':
      addFlash('meteor', e.x, e.y)
      emitConfetti(toClientX(e.x), toClientY(e.y), 14, 1.4)
      emitSplash(toClientX(e.x), toClientY(e.y), '#ff8a1f')
      playSound('explosion-1', 0.045, 0.9 + Math.random() * 0.4)
      triggerShake('small')
      break
    case 'warHeal':
      addFlash('warheal', e.x, e.y)
      break
  }
}

// ─── Ultimate button ─────────────────────────────────────────────────────────
const ultPct = computed(() => Math.min(100, Math.round((battle.ultCharge.value / battle.ultMax) * 100)))
const onUlt = (): void => {
  if (battle.fireUltimate()) {
    playSound('gravity', 0.05, 1.2)
    triggerShake('strong')
  }
}

// ─── Boss bar ────────────────────────────────────────────────────────────────
const bossPct = computed(() => {
  const b = battle.boss.value
  return b ? Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100)) : 0
})

const gatePct = computed(() => Math.max(0, Math.min(100, (battle.gateHp.value / battle.gateMax) * 100)))
const countdownDisplay = computed(() => Math.max(1, Math.ceil(battle.countdown.value)))

const fighterStyle = (f: Fighter): Record<string, string> => ({
  '--scale': String(getFighterDef(f.tier).scale)
})
const enemyStyle = (e: Enemy): Record<string, string> => ({
  '--scale': String(e.scale)
})

onMounted(() => {
  cacheRect()
  resizeObs = new ResizeObserver(cacheRect)
  if (rootRef.value) resizeObs.observe(rootRef.value)
  window.addEventListener('scroll', cacheRect, true)
  registerDropZone('arena', () => rootRef.value?.getBoundingClientRect() ?? null)
  battle.setEventSink(onEvent)
  battle.setRenderSink(render)
  battle.startBattle()
})
onUnmounted(() => {
  battle.stopBattle()
  battle.setEventSink(null)
  battle.setRenderSink(null)
  unregisterDropZone('arena')
  resizeObs?.disconnect()
  window.removeEventListener('scroll', cacheRect, true)
  window.clearTimeout(waveBannerTimer)
  window.clearTimeout(comboTimerId)
  window.clearTimeout(gateShakeTimer)
})
</script>

<template lang="pug">
  div.battle-arena.relative.w-full.h-full.overflow-hidden.rounded-2xl(ref="rootRef" :class="{ 'fever-on': battle.feverActive.value }")
    //- ── Ground / backdrop ──
    div.absolute.inset-0.arena-ground
    div.absolute.inset-0.arena-grid

    //- ── The Lab Gate (left edge) ──
    div.gate.absolute.left-0.flex.flex-col.items-center(:class="{ 'gate-shake': gateShake }" class="top-[6%] bottom-[4%] w-[7%] min-w-8 z-[8]")
      div.gate-door.relative.flex-1.w-full.rounded-r-xl.overflow-hidden
        div.gate-glow.absolute.inset-0(:style="{ opacity: gatePct / 100 * 0.8 + 0.2 }")
        div.gate-cracks.absolute.inset-0(v-if="gatePct < 55")
      div.w-full.rounded-full.overflow-hidden.mt-1(class="h-1.5 bg-black/50")
        div.h-full.gate-hp(:style="{ width: gatePct + '%' }")

    //- ── Fighters ──
    div.entity.absolute.top-0.left-0(
      v-for="f in battle.fighters.value"
      :key="f.id"
      :ref="setFighterEl(f.id)"
      :style="fighterStyle(f)"
    )
      div.unit-box
        div.hpbar
          div.hpfill.hp-ally
        div.unit-body
          IngredientUnit(:tier="f.tier" :still="true")

    //- ── Enemies ──
    div.entity.absolute.top-0.left-0(
      v-for="e in battle.enemies.value"
      :key="e.id"
      :ref="setEnemyEl(e.id)"
      :style="enemyStyle(e)"
    )
      div.unit-box
        div.hpbar
          div.hpfill.hp-enemy
        div.unit-body.enemy-march
          EnemyUnit(:kind="e.kind" :enraged="e.enraged")

    //- ── Projectiles ──
    div.proj.absolute.top-0.left-0(
      v-for="p in battle.projectiles.value"
      :key="p.id"
      :ref="setProjEl(p.id)"
    )
      div.proj-dot(:style="{ background: p.color, boxShadow: '0 0 8px 2px ' + p.color }")

    //- ── Chain lightning bolts ──
    svg.absolute.inset-0.w-full.h-full.pointer-events-none(viewBox="0 0 100 100" preserveAspectRatio="none" class="z-[40]")
      polyline(
        v-for="c in chains"
        :key="c.id"
        :points="c.points"
        fill="none" stroke="#5cf0ff" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"
        style="filter: drop-shadow(0 0 3px #5cf0ff)"
        class="chain-bolt"
      )

    //- ── Transient flashes (nova / blackhole / meteor / heals / shockwaves) ──
    div.flash.absolute.pointer-events-none(
      v-for="fl in flashes"
      :key="fl.id"
      :class="'flash-' + fl.type"
      :style="{ left: fl.x + '%', top: fl.y + '%' }"
    )

    //- ── Damage numbers (pooled) ──
    div.dmg-num(v-for="i in NUM_POOL" :key="'n' + i" :ref="setNumEl(i - 1)")

    //- ── Deploy highlight while dragging a unit ──
    Transition(name="fade")
      div.absolute.inset-0.deploy-glow.pointer-events-none.flex.items-end.justify-center.pb-2(v-if="dragActive" class="z-[45]")
        span.game-text.font-black.uppercase.text-white(class="text-xs sm:text-sm drop-shadow-lg")
          | {{ battle.armyFull.value ? t('battle.armyFullHint') : t('battle.deployHint') }}

    //- ── Boss HP bar ──
    Transition(name="fade")
      div.absolute.left-2.right-2.top-1.flex.flex-col.items-center.gap-0.pointer-events-none(v-if="battle.boss.value" class="z-[46]")
        span.game-text.font-black.uppercase.text-red-300(class="text-[10px] sm:text-xs tracking-wider") {{ battle.boss.value.name }}
        div.w-full.rounded-full.overflow-hidden.border(class="h-2 sm:h-2.5 bg-black/60 border-red-900")
          div.h-full.boss-hp(:class="{ 'boss-enraged': battle.boss.value.enraged }" :style="{ width: bossPct + '%' }")

    //- ── Wave banner ──
    Transition(name="banner")
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(v-if="waveBanner" class="top-[30%] z-[48]")
        div.rounded-2xl.border-2.px-4.py-1.game-text.font-black.uppercase.text-white.shadow-2xl(
          :class="waveBanner.boss ? 'banner-boss text-base sm:text-2xl' : 'banner-wave text-sm sm:text-xl'"
        ) {{ waveBanner.text }}

    //- ── Combo pop ──
    div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(class="top-[12%] z-[48]")
      div.combo-pop.game-text.font-black(
        v-if="comboPop"
        :key="comboPop.id"
        :class="comboPop.n >= 7 ? 'text-orange-300' : 'text-yellow-200'"
        :style="{ fontSize: Math.min(2.4, 1 + comboPop.n * 0.09) + 'rem' }"
      ) ×{{ comboPop.n }}{{ comboPop.n >= 7 ? ' ' + t('battle.rampage') : '' }}

    //- ── FEVER overlay ──
    Transition(name="fade")
      div.absolute.inset-0.fever-overlay.pointer-events-none(v-if="battle.feverActive.value" class="z-[44]")
        div.absolute.left-0.right-0.flex.justify-center(class="top-[4%]")
          span.fever-text.game-text.font-black.uppercase(class="text-lg sm:text-2xl") {{ t('battle.fever') }}

    //- ── Countdown ──
    Transition(name="fade")
      div.absolute.inset-0.flex.flex-col.items-center.justify-center.pointer-events-none.gap-1(
        v-if="battle.wavePhase.value === 'countdown'" class="z-[47]"
      )
        span.game-text.font-black.uppercase.text-white(class="text-xs sm:text-sm opacity-80") {{ t('battle.nextWave', { n: battle.wave.value }) }}
        span.countdown-num.game-text.font-black.text-yellow-300(:key="countdownDisplay" class="text-4xl sm:text-6xl") {{ countdownDisplay }}

    //- ── OVERRUN overlay ──
    Transition(name="fade")
      div.absolute.inset-0.flex.flex-col.items-center.justify-center.overrun-overlay.pointer-events-none.gap-1(
        v-if="battle.wavePhase.value === 'overrun'" class="z-[49]"
      )
        span.game-text.font-black.uppercase.text-red-400(class="text-2xl sm:text-4xl animate-pulse") {{ t('battle.overrun') }}
        span.game-text.text-white(class="text-xs sm:text-sm opacity-90") {{ t('battle.overrunBody') }}

    //- ── Ultimate button (bottom-right) ──
    button.ult-btn.absolute.cursor-pointer(
      class="bottom-1.5 right-1.5 z-[50] active:scale-90 transition-transform"
      :class="{ 'ult-ready': battle.ultReady.value }"
      :disabled="!battle.ultReady.value"
      :aria-label="t('battle.ultimate')"
      @click="onUlt"
    )
      svg(viewBox="0 0 48 48" class="w-11 h-11 sm:w-14 sm:h-14")
        circle(cx="24" cy="24" r="20" fill="#0e1426" stroke="#0f1a30" stroke-width="3")
        circle(
          cx="24" cy="24" r="20" fill="none" stroke="#ff8a1f" stroke-width="3.5" stroke-linecap="round"
          :stroke-dasharray="125.6" :stroke-dashoffset="125.6 * (1 - ultPct / 100)"
          transform="rotate(-90 24 24)"
        )
        //- Meteor glyph
        g(transform="translate(24 25)")
          path(d="M-9 -7 L5 7 M-4 -10 L8 2 M-11 0 L1 12" stroke="#ffcd5a" stroke-width="2" stroke-linecap="round" opacity="0.85")
          circle(cx="6" cy="8" r="6" fill="#ff8a1f" stroke="#7a3000" stroke-width="1.5")
</template>

<style scoped lang="sass">
.battle-arena
  touch-action: none
  container-type: size

.arena-ground
  background: linear-gradient(180deg, rgba(28, 39, 66, 0.0) 0%, rgba(24, 34, 60, 0.55) 40%, rgba(16, 24, 46, 0.85) 100%)
.arena-grid
  background-image: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 12.5%), repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 20%)
  opacity: 0.7

// ── Gate ──
.gate-door
  background: linear-gradient(90deg, #2a3558 0%, #1a2440 100%)
  border: 2.5px solid #0f1a30
  border-left: none
.gate-glow
  background: linear-gradient(90deg, rgba(80, 170, 255, 0.55), rgba(80, 170, 255, 0.08))
  transition: opacity 0.3s ease
.gate-cracks
  background: repeating-linear-gradient(35deg, transparent 0 8px, rgba(0, 0, 0, 0.5) 8px 9.5px), repeating-linear-gradient(-50deg, transparent 0 12px, rgba(0, 0, 0, 0.45) 12px 13px)
.gate-hp
  background: linear-gradient(90deg, #4fd16a, #27a03f)
  transition: width 0.2s ease
.gate-shake
  animation: gate-bash 0.2s ease

@keyframes gate-bash
  0%, 100%
    transform: translateX(0)
  40%
    transform: translateX(-4px)
  70%
    transform: translateX(3px)

// ── Entities ──
.entity
  will-change: transform
  pointer-events: none

.unit-box
  position: relative
  transform: translate(-50%, -88%)
  width: calc(clamp(30px, 13cqmin, 58px) * var(--scale, 1))
  height: calc(clamp(30px, 13cqmin, 58px) * var(--scale, 1))

.unit-body
  width: 100%
  height: 100%

.enemy-march
  animation: march 0.55s ease-in-out infinite

@keyframes march
  0%, 100%
    transform: translateY(0) rotate(-2deg)
  50%
    transform: translateY(-4%) rotate(2deg)

.hpbar
  position: absolute
  top: -14%
  left: 8%
  right: 8%
  height: 8%
  min-height: 3px
  background: rgba(0, 0, 0, 0.55)
  border-radius: 9999px
  overflow: hidden
  z-index: 2
.hpfill
  height: 100%
  border-radius: 9999px
  transition: width 0.15s ease
.hp-ally
  background: linear-gradient(90deg, #4fd16a, #8fe08a)
.hp-enemy
  background: linear-gradient(90deg, #ff4d4d, #ff8a5a)

.proj
  will-change: transform
  pointer-events: none
  z-index: 35
.proj-dot
  width: clamp(6px, 2cqmin, 10px)
  height: clamp(6px, 2cqmin, 10px)
  border-radius: 9999px
  transform: translate(-50%, -50%)

// ── Flashes ──
.flash
  transform: translate(-50%, -50%)
  z-index: 42

.flash-nova
  width: 2px
  height: 2px
  border-radius: 9999px
  box-shadow: 0 0 0 2px #bfe6ff
  animation: nova-ring 0.6s ease-out forwards
@keyframes nova-ring
  to
    box-shadow: 0 0 24px 46px rgba(191, 230, 255, 0)

.flash-blackhole
  width: 26cqmin
  height: 26cqmin
  border-radius: 9999px
  background: radial-gradient(circle, #150a2a 0%, #4b0fb0 45%, rgba(75, 15, 176, 0) 70%)
  animation: blackhole-suck 0.9s ease-in forwards
@keyframes blackhole-suck
  0%
    transform: translate(-50%, -50%) scale(0.2) rotate(0deg)
    opacity: 0.4
  60%
    transform: translate(-50%, -50%) scale(1.1) rotate(200deg)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(0.05) rotate(420deg)
    opacity: 0

.flash-meteor
  width: 8cqmin
  height: 8cqmin
  border-radius: 9999px
  background: radial-gradient(circle at 40% 35%, #fff07a, #ff8a1f 55%, #d43a00)
  box-shadow: 0 0 18px 6px rgba(255, 138, 31, 0.8)
  animation: meteor-land 0.7s ease-out forwards
@keyframes meteor-land
  0%
    transform: translate(120%, -320%) scale(0.6)
    opacity: 0.9
  35%
    transform: translate(-50%, -50%) scale(1)
    opacity: 1
  60%
    transform: translate(-50%, -50%) scale(1.7)
    opacity: 0.85
  100%
    transform: translate(-50%, -50%) scale(2.4)
    opacity: 0

.flash-warheal
  width: 12cqmin
  height: 12cqmin
  border-radius: 9999px
  border: 3px solid #c05cff
  animation: warheal-pulse 0.6s ease-out forwards
@keyframes warheal-pulse
  0%
    transform: translate(-50%, -50%) scale(0.3)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(1.4)
    opacity: 0

.flash-shockwave, .flash-mergeburst
  width: 10cqmin
  height: 10cqmin
  border-radius: 9999px
  border: 3px solid rgba(255, 255, 255, 0.9)
  animation: shockwave 0.5s ease-out forwards
.flash-mergeburst
  border-color: #ffe23a
@keyframes shockwave
  0%
    transform: translate(-50%, -50%) scale(0.2)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(2)
    opacity: 0

.chain-bolt
  animation: chain-fade 0.26s ease-out forwards
@keyframes chain-fade
  0%
    opacity: 1
  100%
    opacity: 0

// ── Damage numbers ──
.dmg-num
  position: absolute
  transform: translate(-50%, -100%)
  font-weight: 900
  font-size: clamp(10px, 3.4cqmin, 16px)
  pointer-events: none
  opacity: 0
  z-index: 43
  text-shadow: 1px 1px 0 #000, -1px 1px 0 #000, 0 0 6px rgba(0, 0, 0, 0.6)
.num-live
  animation: num-rise 0.75s ease-out forwards
.num-dmg
  color: #ffffff
.num-crit
  color: #ffe23a
  font-size: clamp(14px, 5cqmin, 24px)
.num-heal
  color: #6fe08a
.num-burn
  color: #ff9a3c
.num-poison
  color: #aaff3c
.num-gold
  color: #ffd23c
@keyframes num-rise
  0%
    opacity: 0
    transform: translate(-50%, -100%) scale(0.5)
  15%
    opacity: 1
    transform: translate(-50%, -120%) scale(1.15)
  100%
    opacity: 0
    transform: translate(-50%, -220%) scale(0.9)

// ── Overlays / banners ──
.deploy-glow
  border-radius: 1rem
  border: 3px dashed rgba(255, 226, 58, 0.75)
  background: radial-gradient(ellipse at center, rgba(255, 226, 58, 0.07), rgba(255, 226, 58, 0.02))

.banner-wave
  background: linear-gradient(180deg, #50aaff, #2266ff)
  border-color: #0f1a30
.banner-boss
  background: linear-gradient(180deg, #ff5a3c, #b81c1c)
  border-color: #0f1a30
  animation: boss-banner 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)
@keyframes boss-banner
  0%
    transform: scale(0.3)
  70%
    transform: scale(1.15)
  100%
    transform: scale(1)

.boss-hp
  background: linear-gradient(90deg, #ff2a2a, #ff8a3c)
  transition: width 0.2s ease
.boss-enraged
  animation: enrage-flash 0.4s linear infinite
@keyframes enrage-flash
  0%, 100%
    filter: brightness(1)
  50%
    filter: brightness(1.8)

.combo-pop
  animation: combo-pop 0.9s cubic-bezier(0.34, 1.56, 0.64, 1) forwards
  text-shadow: 2px 2px 0 #000
@keyframes combo-pop
  0%
    transform: scale(0.3) rotate(-6deg)
    opacity: 0
  25%
    transform: scale(1.25) rotate(3deg)
    opacity: 1
  70%
    transform: scale(1)
    opacity: 1
  100%
    transform: scale(0.9) translateY(-10px)
    opacity: 0

.fever-overlay
  background: radial-gradient(ellipse at center, rgba(255, 205, 0, 0) 40%, rgba(255, 160, 0, 0.22) 100%)
.fever-text
  color: #ffd23c
  text-shadow: 2px 2px 0 #7a3000, 0 0 18px rgba(255, 205, 0, 0.9)
  animation: fever-throb 0.5s ease-in-out infinite alternate
@keyframes fever-throb
  from
    transform: scale(1)
  to
    transform: scale(1.12)

.fever-on .arena-ground
  filter: hue-rotate(20deg) saturate(1.3)

.overrun-overlay
  background: rgba(60, 8, 8, 0.55)
  backdrop-filter: blur(1px)

.countdown-num
  animation: countdown-pop 1s ease-out
  text-shadow: 2px 2px 0 #000
@keyframes countdown-pop
  0%
    transform: scale(1.6)
    opacity: 0.4
  30%
    transform: scale(1)
    opacity: 1

.ult-btn
  filter: grayscale(0.8) opacity(0.85)
.ult-ready
  filter: none
  animation: ult-pulse 0.9s ease-in-out infinite
@keyframes ult-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.12)

.fade-enter-active, .fade-leave-active
  transition: opacity 0.25s ease
.fade-enter-from, .fade-leave-to
  opacity: 0

.banner-enter-active
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease
.banner-leave-active
  transition: transform 0.25s ease, opacity 0.25s ease
.banner-enter-from
  transform: scale(0.4)
  opacity: 0
.banner-leave-to
  transform: translateY(-16px)
  opacity: 0
</style>
