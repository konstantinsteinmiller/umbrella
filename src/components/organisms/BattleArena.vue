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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import useBattle, { type BattleEvent, type Fighter, type Enemy } from '@/use/useBattle'
import { getFighterDef, rollMutator, nextArchetypeUnlock } from '@/game/units'
import { getIngredient } from '@/game/ingredients'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import EnemyUnit from '@/components/organisms/EnemyUnit.vue'
import FlyingChest from '@/components/organisms/FlyingChest.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import { artSrc, type ArtKey } from '@/use/useArtOverrides'
import useSounds from '@/use/useSound'
import useScreenshake from '@/use/useScreenshake'
import { emitConfetti, emitSparkle, emitSplash } from '@/use/usePrismParticles'
import { registerDropZone, unregisterDropZone, dragActive } from '@/use/useDropZones'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { bestWaveRank } from '@/platforms/leaderboard'

const props = defineProps<{
  /** Wallet badge element — kill/boss payouts fly coins into it. */
  coinTarget?: HTMLElement | null
}>()

const sceneEmit = defineEmits<{
  /** A boss died — the scene may offer a 2× bounty rewarded ad. `first` is
   *  the once-ever first boss kill (scripted spectacle, roadmap #2). */
  (e: 'bossKill', bounty: number, first: boolean): void
  /** A 10th-wave milestone chest dropped — the scene adds the free unit. */
  (e: 'milestone', wave: number): void
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
  // Gate image right edge in arena-x % (mirrors the `.gate` CSS min(25cqw, 20cqh))
  // so the engine can keep fighters from stepping onto it.
  if (boxW) battle.setGateEdge(Math.min(25, 20 * boxH / boxW))
}
const toClientX = (x: number): number => boxLeft + (x / 100) * boxW
const toClientY = (y: number): number => boxTop + (y / 100) * boxH

// ─── Entity element maps (direct-DOM hot path) ───────────────────────────────
interface EntityEls { root: HTMLElement; hp: HTMLElement | null }
const fighterEls = new Map<number, EntityEls>()
const enemyEls = new Map<number, EntityEls>()
const projEls = new Map<number, HTMLElement>()
// Last position per projectile → derive a facing angle so directional sprites
// (fireball, ice shard) point along their flight path.
const projLast = new Map<number, { x: number; y: number }>()

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
  else { projEls.delete(id); projLast.delete(id) }
}

const writeEntity = (els: EntityEls | undefined, x: number, y: number, hpFrac: number): void => {
  if (!els) return
  els.root.style.transform = `translate(${(x / 100) * boxW}px, ${(y / 100) * boxH}px)`
  // Painter's order by depth: higher y (closer to the camera) renders in
  // front. ×10 granularity (band 100..1100) so melee pairs and horde clumps
  // with near-equal y still sort by position — whole-unit buckets used to
  // tie and fall back to DOM (spawn) order. All arena overlays sit above
  // this band (z ≥ 1150), and `.battle-arena` isolates its own stacking
  // context so these values never compete with the HUD outside it.
  els.root.style.zIndex = String(100 + Math.round(y * 10))
  if (els.hp) els.hp.style.width = `${Math.max(0, Math.min(100, hpFrac * 100))}%`
}

const render = (): void => {
  if (!boxW) cacheRect()
  for (const f of battle.fighters.value) writeEntity(fighterEls.get(f.id), f.x, f.y, f.hp / f.maxHp)
  for (const e of battle.enemies.value) writeEntity(enemyEls.get(e.id), e.x, e.y, e.hp / e.maxHp)
  for (const p of battle.projectiles.value) {
    const el = projEls.get(p.id)
    if (!el) continue
    const last = projLast.get(p.id)
    let a = last ? Number(el.dataset.rot ?? 0) : 0
    // Facing must be measured in PIXEL space, not the 0..100 arena grid: the
    // arena is a wide (non-square) strip, so the same normalized delta maps to
    // a different on-screen slope. Scale the delta by boxW/boxH before atan2 so
    // the sprite points exactly along its visible trajectory.
    if (last && (p.x !== last.x || p.y !== last.y)) { a = Math.atan2((p.y - last.y) * boxH, (p.x - last.x) * boxW); el.dataset.rot = String(a) }
    projLast.set(p.id, { x: p.x, y: p.y })
    // Projectile sprites are authored pointing UP (north); +90° turns that to
    // face the flight path (a=0 travels right → sprite points right).
    el.style.transform = `translate(${(p.x / 100) * boxW}px, ${(p.y / 100) * boxH}px) rotate(${a + Math.PI / 2}rad)`
  }
}

/** Static projectile sprite for its element (fighters + the spitter's rocks). */
const projArt = (p: { element: string }): string | null => artSrc(`proj-${p.element}` as ArtKey)
/** Animated in-flight sheet for the element; wins over the static sprite. */
const projAnim = (p: { element: string }): string | null => artSrc(`proj-anim-${p.element}` as ArtKey)

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
interface Flash { id: number; type: 'nova' | 'meteor' | 'warheal' | 'shockwave' | 'mergeburst' | 'impactsheet'; x: number; y: number; art?: string }
const flashes = ref<Flash[]>([])
let flashSeq = 0
const FLASH_MS: Record<Flash['type'], number> = {
  nova: 600, meteor: 700, warheal: 600, shockwave: 500, mergeburst: 500, impactsheet: 480
}
const addFlash = (type: Flash['type'], x: number, y: number): void => {
  const id = ++flashSeq
  flashes.value = [...flashes.value, { id, type, x, y }]
  window.setTimeout(() => { flashes.value = flashes.value.filter((f) => f.id !== id) }, FLASH_MS[type])
}

/** Play the element's 9-frame splitter burst at (x, y). Returns false when no
 *  bitmap has been dropped in, so the caller can fall back to the sparkle. */
const addImpactSheet = (element: string, x: number, y: number): boolean => {
  const art = artSrc(`impact-${element}` as ArtKey)
  if (!art) return false
  const id = ++flashSeq
  flashes.value = [...flashes.value, { id, type: 'impactsheet', x, y, art }]
  window.setTimeout(() => { flashes.value = flashes.value.filter((f) => f.id !== id) }, FLASH_MS.impactsheet)
  return true
}

// ── Drop-in art overrides (art-todo.md; null → procedural CSS fallback) ──
const arenaBg = computed(() => artSrc('arena-bg'))
const gateArt = computed(() => artSrc('gate'))
const portalArt = computed(() => artSrc('arena-portal'))
// Persist the last portal position so it stays put through the CLOSE animation
// (when `activePortal` has already gone null but the element is still leaving).
const portalPos = ref<{ x: number; y: number } | null>(null)
watch(() => battle.activePortal.value, (p) => { if (p) portalPos.value = { x: p.x, y: p.y } })
const portalStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const p = portalPos.value
  if (p) { style.left = `${p.x}%`; style.top = `${p.y}%` }
  return style
})
// Clip the crack/damage overlay to the gate bitmap's silhouette (its alpha),
// so it hugs the ice tower instead of covering the transparent rectangle. Mask
// geometry mirrors the img's `object-contain object-bottom`.
const gateMaskStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const art = gateArt.value
  if (art) {
    const url = `url(${art})`
    style.maskImage = url; style.WebkitMaskImage = url
    style.maskSize = 'contain'; style.WebkitMaskSize = 'contain'
    style.maskPosition = 'center bottom'; style.WebkitMaskPosition = 'center bottom'
    style.maskRepeat = 'no-repeat'; style.WebkitMaskRepeat = 'no-repeat'
  }
  return style
})
// The meteor sprite replaces the flash div's gradient; the CSS keyframe
// (fall-in) keeps animating the bitmap.
const flashStyle = (fl: Flash): Record<string, string> => {
  const style: Record<string, string> = { left: fl.x + '%', top: fl.y + '%' }
  // Sprite-sheet flash (impact splitter): a 3×3 grid stepped through.
  if (fl.type === 'impactsheet' && fl.art) {
    style.backgroundImage = `url(${fl.art})`
    style.backgroundSize = '300% 300%'
    style.backgroundRepeat = 'no-repeat'
    return style
  }
  const art = fl.type === 'meteor' ? artSrc('vfx-meteor') : null
  if (art) {
    style.backgroundImage = `url(${art})`
    style.backgroundSize = 'contain'
    style.backgroundPosition = 'center'
    style.backgroundRepeat = 'no-repeat'
    style.boxShadow = 'none'
  }
  return style
}

interface ChainFlash { id: number; points: string }
const chains = ref<ChainFlash[]>([])
const addChain = (points: { x: number; y: number }[]): void => {
  const id = ++flashSeq
  chains.value = [...chains.value, { id, points: points.map((p) => `${p.x},${p.y}`).join(' ') }]
  window.setTimeout(() => { chains.value = chains.value.filter((c) => c.id !== id) }, 260)
}

// ─── Banners / HUD theatre ───────────────────────────────────────────────────
type BannerVariant = 'wave' | 'boss' | 'mutator' | 'chest'
const waveBanner = ref<{ text: string; variant: BannerVariant } | null>(null)
let waveBannerTimer = 0
const showWaveBanner = (text: string, variant: BannerVariant, ms: number): void => {
  waveBanner.value = { text, variant }
  window.clearTimeout(waveBannerTimer)
  waveBannerTimer = window.setTimeout(() => { waveBanner.value = null }, ms)
}
const bannerClass = (variant: BannerVariant): string =>
  variant === 'boss' ? 'banner-boss text-base sm:text-2xl'
    : variant === 'mutator' ? 'banner-mutator text-sm sm:text-xl'
    : variant === 'chest' ? 'banner-chest text-sm sm:text-xl'
    : 'banner-wave text-sm sm:text-xl'

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

// ─── Shatter death effect ────────────────────────────────────────────────────
// Instead of a confetti puff, tear the unit's rendered sprite into 16 jittered
// shards and blast them outward. We clone the live `.unit-body` (bitmap OR the
// vector fallback — whatever is on screen) and clip each clone to one polygon
// of a jittered 4×4 grid, so the pieces tile the sprite seamlessly, then fling
// each apart with a spin + upward pop. Returns false (→ caller falls back to the
// old burst) when the element is already gone or too many shards are in flight.
let liveShards = 0
const SHARD_CAP = 128
const shatterUnit = (root: HTMLElement | undefined, big: boolean): boolean => {
  if (!root || !rootRef.value || liveShards + 16 > SHARD_CAP) return false
  const unitBody = root.querySelector<HTMLElement>('.unit-body')
  if (!unitBody) return false
  const r = unitBody.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return false
  const arena = rootRef.value.getBoundingClientRect()
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;left:${r.left - arena.left}px;top:${r.top - arena.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:1180`

  const G = 4
  // Shared jittered lattice so neighbouring shards keep matching edges.
  const grid: [number, number][][] = []
  for (let rr = 0; rr <= G; rr++) {
    grid[rr] = []
    for (let cc = 0; cc <= G; cc++) {
      const edge = rr === 0 || rr === G || cc === 0 || cc === G
      const jx = edge ? 0 : (Math.random() - 0.5) * 0.16
      const jy = edge ? 0 : (Math.random() - 0.5) * 0.16
      grid[rr]![cc] = [(cc / G + jx) * 100, (rr / G + jy) * 100]
    }
  }
  for (let rr = 0; rr < G; rr++) for (let cc = 0; cc < G; cc++) {
    const a = grid[rr]![cc]!, b = grid[rr]![cc + 1]!, c = grid[rr + 1]![cc + 1]!, d = grid[rr + 1]![cc]!
    const poly = `polygon(${a[0]}% ${a[1]}%, ${b[0]}% ${b[1]}%, ${c[0]}% ${c[1]}%, ${d[0]}% ${d[1]}%)`
    const shard = document.createElement('div')
    shard.style.cssText = `position:absolute;inset:0;clip-path:${poly};-webkit-clip-path:${poly};will-change:transform,opacity`
    const vis = unitBody.cloneNode(true) as HTMLElement
    vis.style.width = '100%'; vis.style.height = '100%'; vis.style.animation = 'none'; vis.style.transform = 'none'
    shard.appendChild(vis)
    box.appendChild(shard)
    // Fling from the sprite centre, with spin and a little upward pop → gravity.
    const ox = (cc + 0.5) / G - 0.5, oy = (rr + 0.5) / G - 0.5
    const ang = Math.atan2(oy, ox) + (Math.random() - 0.5) * 0.7
    const dist = (big ? 1.9 : 1) * (24 + Math.random() * 30)
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist
    const spin = (Math.random() - 0.5) * 260
    shard.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 10}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px,${dy + 22}px) rotate(${spin}deg)`, opacity: 0 }
    ], { duration: 460 + Math.random() * 260, easing: 'cubic-bezier(0.2,0.7,0.3,1)', fill: 'forwards' })
  }
  rootRef.value.appendChild(box)
  liveShards += 16
  window.setTimeout(() => { box.remove(); liveShards -= 16 }, 820)
  return true
}

// ─── The event sink: every engine happening → juice ──────────────────────────
const onEvent = (e: BattleEvent): void => {
  switch (e.type) {
    case 'number':
      popNumber(e.x, e.y, e.amount, e.variant)
      break
    case 'strike': {
      clashSound(e.tier)
      // Dash-push: lunge the body a step ALONG the attack direction so every
      // melee hit reads as a strike, whichever way the target stands.
      const inner = fighterEls.get(e.id)?.root.querySelector<HTMLElement>('.unit-body')
      inner?.animate(
        [
          { transform: 'translate(0, 0)' },
          { transform: `translate(${(e.dx * 26).toFixed(1)}%, ${(e.dy * 26).toFixed(1)}%) scale(1.1)`, offset: 0.4 },
          { transform: 'translate(0, 0)' }
        ],
        { duration: 200, easing: 'ease-out' }
      )
      break
    }
    case 'shot':
      throttledSound('shot', 'unit-shot', 0.012, 1.3, 120)
      break
    case 'impact':
      if (!e.element || !addImpactSheet(e.element, e.x, e.y)) emitSparkle(toClientX(e.x), toClientY(e.y), e.color, 4)
      break
    case 'splash':
      // Element-coloured spark burst for the AoE hit — no celebratory confetti.
      emitSparkle(toClientX(e.x), toClientY(e.y), e.color, 12)
      throttledSound('boom', 'explosion-1', 0.03, 1.1, 150)
      triggerShake('small')
      break
    case 'chain':
      addChain(e.points)
      throttledSound('chain', 'chain-zap', 0.025, 1.4, 150)
      break
    case 'nova':
      addFlash('nova', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#bfe6ff', 14)
      throttledSound('nova', 'frost-nova', 0.03, 0.8, 200)
      break
    case 'death':
      // The tear/shatter is the death effect — NO confetti, even when the shard
      // cap skips the shatter (then it's just the small spark burst).
      shatterUnit(enemyEls.get(e.id)?.root, e.boss)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#ffcf9a', e.boss ? 20 : 9)
      throttledSound('death', 'enemy-death', 0.02, 1 + Math.random() * 0.3, 80)
      break
    case 'fighterDeath':
      if (!shatterUnit(fighterEls.get(e.id)?.root, false)) {
        emitSplash(toClientX(e.x), toClientY(e.y), getIngredient(e.tier).glow)
      }
      emitSparkle(toClientX(e.x), toClientY(e.y), getIngredient(e.tier).glow, 9)
      playSound('fighter-death', 0.03, 0.8)
      break
    case 'deploy':
      addFlash('shockwave', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#ffffff', 10)
      playSound('deploy-land', 0.04, 1.1)
      break
    case 'fieldMerge':
      addFlash('mergeburst', e.x, e.y)
      emitConfetti(toClientX(e.x), toClientY(e.y), 16, 1.2)
      playSound('field-merge', 0.05, 0.85 + Math.min(10, e.tier) * 0.05)
      break
    case 'gateHit': {
      gateShake.value = true
      window.clearTimeout(gateShakeTimer)
      gateShakeTimer = window.setTimeout(() => { gateShake.value = false }, 200)
      throttledSound('gate', 'gate-hit', 0.025, 0.9, 150)
      triggerShake('small')
      break
    }
    case 'overrun':
      playSound('overrun', 0.06)
      triggerShake('big')
      // RALLY! rewarded revive (roadmap #8): hold the restart only when an ad
      // can actually fill AND fighters fell this wave.
      if (isRewardedReady.value && battle.requestRallyHold()) rallyBusy.value = false
      break
    case 'setback':
      // Unrevived wipe → the front line retreats to an easier wave.
      showWaveBanner(t('battle.waveSetback', { n: e.wave }), 'boss', 2200)
      break
    case 'waveStart':
      if (e.mutator) {
        showWaveBanner(t(`battle.mutators.${e.mutator}`), 'mutator', 2400)
        playSound('boss-incoming', 0.05)
        triggerShake('small')
      } else {
        showWaveBanner(
          e.boss ? t('battle.bossIncoming') : t('battle.waveStart', { n: e.wave }),
          e.boss ? 'boss' : 'wave', e.boss ? 2200 : 1400
        )
        playSound(e.boss ? 'boss-incoming' : 'wave-start', e.boss ? 0.07 : 0.03)
        if (e.boss) triggerShake('strong')
      }
      break
    case 'waveCleared': {
      // Rank suffix only when a platform actually reported one (roadmap #16).
      const rank = bestWaveRank.value ? ` · #${bestWaveRank.value}` : ''
      showWaveBanner(t('battle.waveCleared', { n: e.bonus }) + rank, 'wave', 1500)
      playSound('wave-cleared', 0.045)
      if (props.coinTarget && rootRef.value) {
        spawnCoinExplosion({ sourceEl: rootRef.value, targetEl: props.coinTarget, count: 12 })
      }
      break
    }
    case 'milestone':
      // Every-10th-wave chest (roadmap #4): fat fountain here; the scene
      // drops the free high-tier unit onto the grid.
      showWaveBanner(t('battle.chestWave', { n: e.gold }), 'chest', 2000)
      playSound('milestone-chest', 0.06)
      emitConfetti(toClientX(50), toClientY(40), 30, 1.5)
      if (props.coinTarget && rootRef.value) {
        spawnCoinExplosion({ sourceEl: rootRef.value, targetEl: props.coinTarget, count: 26 })
      }
      sceneEmit('milestone', e.wave)
      break
    case 'bossKill':
      // The first-ever boss kill is the scripted spectacle (roadmap #2).
      emitConfetti(toClientX(e.x), toClientY(e.y), e.first ? 130 : 60, e.first ? 2.4 : 2)
      playSound('explosion-1', 0.07, 0.8)
      playSound('boss-death', 0.08)
      triggerShake('big')
      if (props.coinTarget && rootRef.value) {
        spawnCoinExplosion({ sourceEl: rootRef.value, targetEl: props.coinTarget, count: e.first ? 60 : 30 })
      }
      sceneEmit('bossKill', e.bounty, e.first)
      break
    case 'enrage':
      playSound('enrage-roar', 0.05, 0.9)
      triggerShake('strong')
      break
    case 'combo': {
      comboPop.value = { n: e.combo, id: ++flashSeq }
      window.clearTimeout(comboTimerId)
      comboTimerId = window.setTimeout(() => { comboPop.value = null }, 900)
      throttledSound('combo', 'combo-tick', 0.02, 1 + Math.min(20, e.combo) * 0.05, 120)
      break
    }
    case 'fever':
      playSound('fever-start', 0.07)
      triggerShake('strong')
      break
    case 'ultReady':
      playSound('ult-ready', 0.05)
      break
    case 'meteor':
      // Fireball bitmap drops from the sky (CSS), then bursts into the fire
      // splitter on landing — whether it hit an enemy or just the ground. The
      // delay matches the ~0.25s fall so the burst lands with the meteor.
      addFlash('meteor', e.x, e.y)
      window.setTimeout(() => addImpactSheet('fire', e.x, e.y), 245)
      emitSplash(toClientX(e.x), toClientY(e.y), '#ff8a1f')
      playSound('meteor-impact', 0.045, 0.9 + Math.random() * 0.4)
      triggerShake('small')
      break
    case 'warHeal':
      addFlash('warheal', e.x, e.y)
      break
  }
}

// ─── Ultimate button ─────────────────────────────────────────────────────────
const ultPct = computed(() => Math.min(100, Math.round((battle.ultCharge.value / battle.ultMax) * 100)))
// Drop-in art: the fireball icon on the ult button.
const meteorBtnArt = computed(() => artSrc('meteor-button'))
const onUlt = (): void => {
  if (battle.fireUltimate()) {
    playSound('ult-cast', 0.05, 1.2)
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

// ─── Countdown telegraphs (roadmap #4/#13) ───────────────────────────────────
// The mutator roll is a pure hash of the wave number, so the countdown can
// announce exactly what the engine will roll when the wave begins.
const upcomingMutator = computed(() =>
  battle.wavePhase.value === 'countdown' ? rollMutator(battle.wave.value) : null)
const newEnemyIncoming = computed(() =>
  battle.wavePhase.value === 'countdown' && nextArchetypeUnlock(battle.wave.value - 1) === battle.wave.value)

// ─── RALLY! rewarded revive (roadmap #8) ─────────────────────────────────────
const rallyBusy = ref(false)
const onRally = async (): Promise<void> => {
  if (rallyBusy.value || !battle.rallyOffer.value) return
  rallyBusy.value = true
  try {
    const ok = await showRewardedAd()
    if (ok) {
      const revived = battle.claimRally()
      if (revived > 0) {
        playSound('rally-revive', 0.06)
        emitConfetti(toClientX(16), toClientY(50), 30, 1.5)
        triggerShake('strong')
      }
    } else {
      battle.declineRally()
    }
  } finally {
    rallyBusy.value = false
  }
}

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
    //- ── Ground / backdrop (bitmap override or procedural gradient+grid) ──
    div.absolute.inset-0.arena-bg-img(v-if="arenaBg" :style="{ backgroundImage: 'url(' + arenaBg + ')' }")
    div.absolute.inset-0.arena-ground
    div.absolute.inset-0.arena-grid(v-if="!arenaBg")

    //- ── The Lab Gate (left edge) ──
    div.gate.absolute.left-0.flex.flex-col.items-center.pointer-events-none(class="top-1/2 -translate-y-1/2 min-w-8 z-[8]")
      //- Door carries the tower's 1:2 aspect so the image fills it (the whole
      //- damageable box IS the tower, not a tall empty strip), and the shake.
      div.gate-door.relative.w-full.rounded-r-xl.overflow-hidden(class="aspect-[1/2]" :class="{ 'gate-bare': gateArt, 'gate-shake': gateShake }")
        img.absolute.inset-0.w-full.h-full.object-contain.object-bottom(
          v-if="gateArt" :src="gateArt" alt="" draggable="false"
        )
        //- Blue HP glow is only for the procedural fallback door; the bitmap gate stands bare.
        div.gate-glow.absolute.inset-0(v-if="!gateArt" :style="{ opacity: gatePct / 100 * 0.8 + 0.2 }")
        div.gate-cracks.absolute.inset-0(v-if="gatePct < 55" :style="gateMaskStyle")
      div.w-full.rounded-full.overflow-hidden.mt-1(class="h-1.5 bg-black/50")
        div.h-full.gate-hp(:style="{ width: gatePct + '%' }")

    //- ── Enemy portal — opens at one of 3 positions per subwave, then closes ──
    transition(name="portal")
      div.enemy-portal.absolute.pointer-events-none(
        v-if="battle.activePortal.value"
        :style="portalStyle"
      )
        img.portal-img.w-full.h-full.object-contain(v-if="portalArt" :src="portalArt" alt="" draggable="false")
        template(v-else)
          div.portal-core.absolute.inset-0
          div.portal-swirl.absolute.inset-0

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
        div.unit-body.fighter-march
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
        div.unit-body.enemy-march(:class="{ 'elite-aura': e.elite }")
          EnemyUnit(:kind="e.kind" :enraged="e.enraged" :boss-wave="battle.wave.value")

    //- ── Projectiles ──
    div.proj.absolute.top-0.left-0(
      v-for="p in battle.projectiles.value"
      :key="p.id"
      :ref="setProjEl(p.id)"
    )
      div.proj-anim(v-if="projAnim(p)" :style="{ backgroundImage: 'url(' + projAnim(p) + ')' }")
      img.proj-sprite(v-else-if="projArt(p)" :src="projArt(p)" alt="" draggable="false")
      div.proj-dot(v-else :style="{ background: p.color, boxShadow: '0 0 8px 2px ' + p.color }")

    //- ── Chain lightning bolts ──
    svg.absolute.inset-0.w-full.h-full.pointer-events-none(viewBox="0 0 100 100" preserveAspectRatio="none" class="z-[1150]")
      polyline(
        v-for="c in chains"
        :key="c.id"
        :points="c.points"
        fill="none" stroke="#5cf0ff" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"
        style="filter: drop-shadow(0 0 3px #5cf0ff)"
        class="chain-bolt"
      )

    //- ── Transient flashes (nova / meteor / heals / shockwaves) ──
    div.flash.absolute.pointer-events-none(
      v-for="fl in flashes"
      :key="fl.id"
      :class="'flash-' + fl.type"
      :style="flashStyle(fl)"
    )

    //- ── Damage numbers (pooled) ──
    div.dmg-num(v-for="i in NUM_POOL" :key="'n' + i" :ref="setNumEl(i - 1)")

    //- ── Flying chest reward (roadmap #1B) ──
    FlyingChest(:coin-target="props.coinTarget")

    //- ── Deploy highlight while dragging a unit ──
    Transition(name="fade")
      div.absolute.inset-0.deploy-glow.pointer-events-none.flex.items-end.justify-center.pb-2(v-if="dragActive" class="z-[1190]")
        span.game-text.font-black.uppercase.text-white(class="text-xs sm:text-sm drop-shadow-lg")
          | {{ battle.armyFull.value ? t('battle.armyFullHint') : t('battle.deployHint') }}

    //- ── Boss HP bar ──
    Transition(name="fade")
      div.absolute.left-2.right-2.top-1.flex.flex-col.items-center.gap-0.pointer-events-none(v-if="battle.boss.value" class="z-[1200]")
        span.game-text.font-black.uppercase.text-red-300(class="text-[10px] sm:text-xs tracking-wider") {{ battle.boss.value.name }}
        div.w-full.rounded-full.overflow-hidden.border(class="h-2 sm:h-2.5 bg-black/60 border-red-900")
          div.h-full.boss-hp(:class="{ 'boss-enraged': battle.boss.value.enraged }" :style="{ width: bossPct + '%' }")

    //- ── Wave banner ──
    Transition(name="banner")
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(v-if="waveBanner" class="top-[30%] z-[1220]")
        div.rounded-2xl.border-2.px-4.py-1.game-text.font-black.uppercase.text-white.shadow-2xl(
          :class="bannerClass(waveBanner.variant)"
        ) {{ waveBanner.text }}

    //- ── Active mutator chip (persists through the wave) ──
    Transition(name="fade")
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
        v-if="battle.mutator.value && battle.wavePhase.value === 'fighting'" class="top-[6%] z-[1200]"
      )
        span.mutator-chip.rounded-full.border.px-2.game-text.font-black.uppercase(class="py-0.5 text-[9px] sm:text-[11px]")
          | {{ t('battle.mutators.' + battle.mutator.value) }}

    //- ── Combo pop ──
    div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(class="top-[12%] z-[1220]")
      div.combo-pop.game-text.font-black(
        v-if="comboPop"
        :key="comboPop.id"
        :class="comboPop.n >= 7 ? 'text-orange-300' : 'text-yellow-200'"
        :style="{ fontSize: Math.min(2.4, 1 + comboPop.n * 0.09) + 'rem' }"
      ) ×{{ comboPop.n }}{{ comboPop.n >= 7 ? ' ' + t('battle.rampage') : '' }}

    //- ── FEVER overlay ──
    Transition(name="fade")
      div.absolute.inset-0.fever-overlay.pointer-events-none(v-if="battle.feverActive.value" class="z-[1180]")
        div.absolute.left-0.right-0.flex.justify-center(class="top-[4%]")
          span.fever-text.game-text.font-black.uppercase(class="text-lg sm:text-2xl") {{ t('battle.fever') }}

    //- ── Countdown ──
    Transition(name="fade")
      div.absolute.inset-0.flex.flex-col.items-center.justify-center.pointer-events-none.gap-1(
        v-if="battle.wavePhase.value === 'countdown'" class="z-[1210]"
      )
        span.game-text.font-black.uppercase.text-white(class="text-xs sm:text-sm opacity-80") {{ t('battle.nextWave', { n: battle.wave.value }) }}
        span.countdown-num.game-text.font-black.text-yellow-300(:key="countdownDisplay" class="text-4xl sm:text-6xl") {{ countdownDisplay }}
        //- Telegraphs: incoming mutator / brand-new enemy archetype
        span.game-text.font-black.uppercase.text-purple-300(v-if="upcomingMutator" class="text-[10px] sm:text-sm animate-pulse") {{ t('battle.mutators.' + upcomingMutator) }}
        span.game-text.font-black.uppercase.text-red-300(v-if="newEnemyIncoming" class="text-[10px] sm:text-sm animate-pulse") {{ t('battle.newEnemy') }}

    //- ── OVERRUN overlay (+ RALLY! rewarded revive, roadmap #8) ──
    Transition(name="fade")
      div.absolute.inset-0.flex.flex-col.items-center.justify-center.overrun-overlay.pointer-events-none.gap-1(
        v-if="battle.wavePhase.value === 'overrun'" class="z-[1230]"
      )
        span.game-text.font-black.uppercase.text-red-400(class="text-2xl sm:text-4xl animate-pulse") {{ t('battle.overrun') }}
        span.game-text.text-white(class="text-xs sm:text-sm opacity-90") {{ t('battle.overrunBody') }}
        template(v-if="battle.rallyOffer.value && isRewardedReady")
          button.rally-btn.pointer-events-auto.cursor-pointer.mt-2.rounded-xl.border-2.px-4.py-2.flex.items-center.gap-2(
            class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 active:scale-95 transition-transform disabled:opacity-50"
            :disabled="rallyBusy"
            @click="onRally"
          )
            IconMovie(class="w-6 h-6 shrink-0")
            div.flex.flex-col.items-start
              span.text-white.font-black.uppercase.game-text(class="text-sm sm:text-base leading-none") {{ t('battle.rally') }}
              span.text-emerald-100.game-text(class="text-[10px] sm:text-xs") {{ t('battle.rallyBody') }}
          button.pointer-events-auto.cursor-pointer.game-text(class="text-white/60 text-xs mt-1" @click="battle.declineRally()") {{ t('secondChance.skip') }}

    //- ── Ultimate button (bottom-right) ──
    button.ult-btn.absolute.cursor-pointer(
      class="bottom-1.5 right-1.5 z-[1240] active:scale-90 transition-transform"
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
        //- Meteor icon: dropped-in bitmap, else the drawn glyph fallback
        image(v-if="meteorBtnArt" :href="meteorBtnArt" x="9" y="9" width="30" height="30")
        g(v-else transform="translate(24 25)")
          path(d="M-9 -7 L5 7 M-4 -10 L8 2 M-11 0 L1 12" stroke="#ffcd5a" stroke-width="2" stroke-linecap="round" opacity="0.85")
          circle(cx="6" cy="8" r="6" fill="#ff8a1f" stroke="#7a3000" stroke-width="1.5")
</template>

<style scoped lang="sass">
.battle-arena
  touch-action: none
  container-type: size
  // Own stacking context: the depth-sorted entity z band (100..1100) and the
  // lifted overlay layers (1150+) must never compete with HUD z-values
  // outside the arena.
  isolation: isolate

.arena-bg-img
  background-size: cover
  background-position: center bottom
.arena-ground
  background: linear-gradient(180deg, rgba(28, 39, 66, 0.0) 0%, rgba(24, 34, 60, 0.55) 40%, rgba(16, 24, 46, 0.85) 100%)
.arena-grid
  background-image: repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 12.5%), repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 20%)
  opacity: 0.7

// ── Gate ──
// Sized against the arena (a size container): height-led so it stays a decent
// presence on wide arenas, but never wider than 25% of the arena viewport.
.gate
  width: min(25cqw, 20cqh)
.gate-door
  background: linear-gradient(90deg, #2a3558 0%, #1a2440 100%)
  border: 2.5px solid #0f1a30
  border-left: none
// Bitmap gate: drop the blue box + border so the transparent PNG stands free.
.gate-bare
  background: none
  border: none
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

// ── Enemy portal — boss-sized, opens at its arena position (procedural
// vortex fallback if no bitmap is dropped in) ──
.enemy-portal
  width: clamp(84px, 30cqmin, 150px)
  height: clamp(84px, 30cqmin, 150px)
  transform: translate(-50%, -50%)
  z-index: 6
// The vortex bitmap is round → spin it for a live portal.
.portal-img
  animation: portal-spin 6s linear infinite
.portal-core
  border-radius: 50%
  background: radial-gradient(circle at 52% 50%, rgba(160,95,255,0.6), rgba(96,42,196,0.4) 42%, rgba(46,14,104,0.18) 66%, transparent 80%)
  box-shadow: inset 0 0 26px 5px rgba(184,126,255,0.4), 0 0 30px 8px rgba(128,64,236,0.28)
  animation: portal-pulse 2.6s ease-in-out infinite
.portal-swirl
  border-radius: 50%
  background: conic-gradient(from 0deg, transparent 0deg, rgba(196,132,255,0.55) 55deg, transparent 130deg, rgba(120,214,255,0.42) 210deg, transparent 285deg)
  filter: blur(2px)
  mix-blend-mode: screen
  mask-image: radial-gradient(circle at 52% 50%, #000 52%, transparent 72%)
  -webkit-mask-image: radial-gradient(circle at 52% 50%, #000 52%, transparent 72%)
  animation: portal-spin 3.4s linear infinite
@keyframes portal-pulse
  0%, 100%
    opacity: 0.82
    transform: scale(1)
  50%
    opacity: 1
    transform: scale(1.04)
@keyframes portal-spin
  to
    transform: rotate(360deg)
// Open when a subwave starts, collapse shut when it finishes.
.portal-enter-active
  animation: portal-open 0.34s cubic-bezier(0.2, 1.4, 0.4, 1)
.portal-leave-active
  animation: portal-open 0.26s ease-in reverse
@keyframes portal-open
  0%
    transform: translate(-50%, -50%) scale(0.05) rotate(-60deg)
    opacity: 0
  100%
    transform: translate(-50%, -50%) scale(1) rotate(0deg)
    opacity: 1

@keyframes gate-bash
  0%, 100%
    transform: translateX(0)
  40%
    transform: translateX(-2px)
  70%
    transform: translateX(2px)

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

.enemy-march, .fighter-march
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
  z-index: 1150
.proj-dot
  width: clamp(6px, 2cqmin, 10px)
  height: clamp(6px, 2cqmin, 10px)
  border-radius: 9999px
  transform: translate(-50%, -50%)
.proj-sprite
  width: clamp(18px, 6cqmin, 30px)
  height: clamp(18px, 6cqmin, 30px)
  object-fit: contain
  transform: translate(-50%, -50%)
  filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.35))
.proj-anim
  width: clamp(20px, 7cqmin, 34px)
  height: clamp(20px, 7cqmin, 34px)
  transform: translate(-50%, -50%)
  background-size: 300% 300%
  background-repeat: no-repeat
  animation: impact-sheet-9 0.5s step-end infinite
  filter: drop-shadow(0 0 5px rgba(255, 140, 40, 0.55))

// ── Flashes ──
.flash
  transform: translate(-50%, -50%)
  z-index: 1160

.flash-nova
  width: 2px
  height: 2px
  border-radius: 9999px
  box-shadow: 0 0 0 2px #bfe6ff
  animation: nova-ring 0.6s ease-out forwards
@keyframes nova-ring
  to
    box-shadow: 0 0 24px 46px rgba(191, 230, 255, 0)

.flash-meteor
  width: clamp(32px, 11cqmin, 76px)
  height: clamp(32px, 11cqmin, 76px)
  border-radius: 9999px
  background: radial-gradient(circle at 40% 35%, #fff07a, #ff8a1f 55%, #d43a00)
  box-shadow: 0 0 18px 6px rgba(255, 138, 31, 0.8)
  animation: meteor-land 0.7s ease-out forwards
@keyframes meteor-land
  0%
    transform: translate(-220%, -320%) scale(-0.6, 0.6)
    opacity: 0.9
  35%
    transform: translate(-50%, -50%) scale(-1, 1)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(-1.4, 1.4)
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

// Projectile impact "splitter": a 3×3 sprite sheet stepped one cell at a time.
.flash-impactsheet
  width: clamp(26px, 10.4cqmin, 57px)
  height: clamp(26px, 10.4cqmin, 57px)
  background-repeat: no-repeat
  animation: impact-sheet-9 0.48s step-end forwards
@keyframes impact-sheet-9
  0%
    background-position: 0% 0%
  11.111%
    background-position: 50% 0%
  22.222%
    background-position: 100% 0%
  33.333%
    background-position: 0% 50%
  44.444%
    background-position: 50% 50%
  55.555%
    background-position: 100% 50%
  66.666%
    background-position: 0% 100%
  77.777%
    background-position: 50% 100%
  88.888%
    background-position: 100% 100%

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
  z-index: 1170
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
.banner-mutator
  background: linear-gradient(180deg, #b05cff, #6b21a8)
  border-color: #0f1a30
  animation: boss-banner 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)
.banner-chest
  background: linear-gradient(180deg, #ffcd00, #f7a000)
  border-color: #0f1a30
  animation: boss-banner 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)

.mutator-chip
  background: rgba(80, 20, 140, 0.75)
  border-color: rgba(200, 140, 255, 0.7)
  color: #e6c8ff

// Elite-mutator champion: pulsing golden aura around the whole sprite.
.elite-aura
  filter: drop-shadow(0 0 6px rgba(255, 205, 0, 0.9)) drop-shadow(0 0 14px rgba(255, 140, 0, 0.6))
  animation: march 0.55s ease-in-out infinite, elite-throb 0.8s ease-in-out infinite alternate
@keyframes elite-throb
  from
    filter: drop-shadow(0 0 4px rgba(255, 205, 0, 0.75)) drop-shadow(0 0 10px rgba(255, 140, 0, 0.45))
  to
    filter: drop-shadow(0 0 9px rgba(255, 205, 0, 1)) drop-shadow(0 0 20px rgba(255, 140, 0, 0.8))

.rally-btn
  animation: rally-pulse 0.9s ease-in-out infinite
@keyframes rally-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.06)
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
