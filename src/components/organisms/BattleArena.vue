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
import useBattle, { GOLD_RUSH_MULT, PACT_COOLDOWN_MS, meteorHintActive, type BattleEvent, type Fighter, type Enemy } from '@/use/useBattle'
import { mobileCheck } from '@/utils/function'
import { formatBig } from '@/utils/bigNumber'
import { getFighterDef, rollMutator, nextArchetypeUnlock } from '@/game/units'
import { getIngredient } from '@/game/ingredients'
import IngredientUnit from '@/components/organisms/IngredientUnit.vue'
import EnemyUnit from '@/components/organisms/EnemyUnit.vue'
import FlyingChest from '@/components/organisms/FlyingChest.vue'
import SpellButton from '@/components/atoms/SpellButton.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import { artSrc, type ArtKey } from '@/use/useArtOverrides'
import useEpicConfig from '@/use/useEpicConfig'
import useSounds from '@/use/useSound'
import useScreenshake from '@/use/useScreenshake'
import { emitConfetti, emitSparkle, emitSplash } from '@/use/usePrismParticles'
import { registerDropZone, unregisterDropZone, dragActive } from '@/use/useDropZones'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import useReward, { formatCost } from '@/use/useReward'
import { bumpMaxTier, noteFieldMerge } from '@/use/usePrismGame'
import { activeReveal, revealAnimationDelay } from '@/use/useTierReveal'
import { tutorialActive, tutorialHoldsBattle } from '@/use/useTutorial'
import { bestWaveRank } from '@/platforms/leaderboard'
import { leaderboardEnabled } from '@/use/useLeaderboard'
import { installWaveLeaderboard, rankedBest } from '@/use/useWaveLeaderboard'
import RankBadge from '@/components/atoms/RankBadge.vue'
import { triggerHappytime } from '@/use/useCrazyGames'
import { stopGameplayForWaveBreak, resumeGameplayAfterWaveBreak } from '@/use/useCrazyWaveGameplay'

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

// Floating numbers stay short at any depth: 9999, 12.3K, 456K, 7.89M … 1.2Qa.
const fmtNum = (n: number): string => formatBig(n, { sig: 3, trim: true, plainBelow: 10_000 })

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
interface Flash {
  id: number
  type: 'nova' | 'meteor' | 'warheal' | 'shockwave' | 'mergeburst' | 'impactsheet'
    | 'warcry' | 'legion' | 'markcast' | 'execute' | 'pact'
  x: number; y: number; art?: string
}
const flashes = ref<Flash[]>([])
let flashSeq = 0
const FLASH_MS: Record<Flash['type'], number> = {
  nova: 600, meteor: 700, warheal: 600, shockwave: 500, mergeburst: 500, impactsheet: 480,
  warcry: 950, legion: 1100, markcast: 520, execute: 640, pact: 800
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
// Clip the crack/damage overlay to the gate bitmap's silhouette (its alpha), so
// it hugs the ice tower instead of covering the transparent rectangle. The box
// now wraps the image exactly (img is `w-full h-auto`), so the mask fills it 1:1.
const gateMaskStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  const art = gateArt.value
  if (art) {
    const url = `url(${art})`
    style.maskImage = url; style.WebkitMaskImage = url
    style.maskSize = '100% 100%'; style.WebkitMaskSize = '100% 100%'
    style.maskPosition = 'center'; style.WebkitMaskPosition = 'center'
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

// Soul Pact's tether: sacrifice → champion, body centre to body centre.
interface Tether { id: number; x1: number; y1: number; x2: number; y2: number }
const tethers = ref<Tether[]>([])
const addTether = (x1: number, y1: number, x2: number, y2: number): void => {
  const id = ++flashSeq
  tethers.value = [...tethers.value, { id, x1, y1, x2, y2 }]
  window.setTimeout(() => { tethers.value = tethers.value.filter((t) => t.id !== id) }, 900)
}

// ─── Skill VFX: sprites that outlive their unit ──────────────────────────────
// A dissolving spectral warrior and a Soul Pact sacrifice are already gone from
// the engine when their event fires; their DOM node is still mounted (Vue
// patches after the event sink returns), so the sprite is cloned onto the arena
// — same trick as the shatter — and the clone plays the exit.
const ghostOf = (root: HTMLElement | undefined): { el: HTMLElement; h: number } | null => {
  if (!root || !rootRef.value) return null
  const body = root.querySelector<HTMLElement>('.unit-body')
  if (!body) return null
  const r = body.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return null
  const arena = rootRef.value.getBoundingClientRect()
  const box = document.createElement('div')
  box.style.cssText = `position:absolute;left:${r.left - arena.left}px;top:${r.top - arena.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;z-index:1185;will-change:transform,opacity`
  const vis = body.cloneNode(true) as HTMLElement
  vis.style.width = '100%'; vis.style.height = '100%'; vis.style.animation = 'none'; vis.style.transform = 'none'
  box.appendChild(vis)
  rootRef.value.appendChild(box)
  return { el: box, h: r.height }
}

/** A spectral warrior's time is up (or it was struck down): it rises and thins out. */
const dissolveSpectral = (id: number): void => {
  const g = ghostOf(fighterEls.get(id)?.root)
  if (!g) return
  g.el.animate([
    { transform: 'translateY(0) scale(1)', opacity: 0.85, filter: 'brightness(1.3)' },
    { transform: `translateY(${(-g.h * 0.6).toFixed(1)}px) scale(0.7, 1.4)`, opacity: 0, filter: 'brightness(2.4) blur(2px)' }
  ], { duration: 700, easing: 'ease-in', fill: 'forwards' })
  window.setTimeout(() => g.el.remove(), 720)
}

/** The fighter that just split off a Soul Pact champion, and where the champion
 *  stands relative to it (px) — the split animation starts on the champion's
 *  body and slides out into the twin's own spot. */
const pactTwin = ref<{ id: number; dx: number; dy: number } | null>(null)
let pactTwinTimer = 0

/** Soul Pact: a violet-gold tether snaps from the sacrifice to the champion,
 *  the sacrifice drains violet and is pulled along it into the champion, and
 *  as it arrives the twin splits off in a burst. */
const soulPactFx = (e: Extract<BattleEvent, { type: 'soulPact' }>): void => {
  addTether(e.vx, e.vy - 5, e.x, e.y - 5)
  const g = ghostOf(fighterEls.get(e.victimId)?.root)
  if (g) {
    const dx = ((e.x - e.vx) / 100) * boxW
    const dy = ((e.y - e.vy) / 100) * boxH
    const drained = 'grayscale(1) sepia(1) hue-rotate(230deg) saturate(3.5)'
    g.el.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'none' },
      { transform: `translate(${(dx * 0.12).toFixed(1)}px, ${(dy * 0.12 - 8).toFixed(1)}px) scale(1.06)`, opacity: 0.95, filter: `${drained} brightness(1.3)`, offset: 0.28 },
      { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(0.18)`, opacity: 0, filter: `${drained} brightness(2.4) blur(1px)` }
    ], { duration: 780, easing: 'cubic-bezier(0.55, 0, 0.75, 1)', fill: 'forwards' })
    window.setTimeout(() => g.el.remove(), 800)
  }
  emitSparkle(toClientX(e.vx), toClientY(e.vy - 5), '#c084fc', 14)
  const twin = battle.fighters.value.find((f) => f.id === e.twinId)
  pactTwin.value = twin
    ? { id: twin.id, dx: ((e.x - twin.x) / 100) * boxW, dy: ((e.y - twin.y) / 100) * boxH }
    : null
  window.clearTimeout(pactTwinTimer)
  pactTwinTimer = window.setTimeout(() => { pactTwin.value = null }, 1500)
  window.setTimeout(() => {
    addFlash('pact', e.x, e.y - 5)
    emitSparkle(toClientX(e.x), toClientY(e.y - 5), '#f5d0fe', 16)
    emitSparkle(toClientX(e.x), toClientY(e.y - 5), '#ffd66b', 12)
  }, 660)
}

// ─── Banners / HUD theatre ───────────────────────────────────────────────────
type BannerVariant = 'wave' | 'boss' | 'mutator' | 'chest' | 'mutation'
const waveBanner = ref<{ text: string; variant: BannerVariant } | null>(null)
let waveBannerTimer = 0
const showWaveBanner = (text: string, variant: BannerVariant, ms: number): void => {
  waveBanner.value = { text, variant }
  window.clearTimeout(waveBannerTimer)
  waveBannerTimer = window.setTimeout(() => { waveBanner.value = null }, ms)
}
const bannerClass = (variant: BannerVariant): string =>
  variant === 'boss' ? 'banner-boss text-base sm:text-2xl'
    : variant === 'mutation' ? 'banner-mutation text-base sm:text-2xl'
    : variant === 'mutator' ? 'banner-mutator text-sm sm:text-xl'
    : variant === 'chest' ? 'banner-chest text-sm sm:text-xl'
    : 'banner-wave text-sm sm:text-xl'

// Spell cast-in toast: names the spell + explains what it does, on screen for 5s
// (spells aren't documented anywhere else). Shown whenever a spell is fired.
const spellToast = ref<{ name: string; desc: string; accent: string } | null>(null)
let spellToastTimer = 0
const showSpellToast = (name: string, desc: string, accent: string): void => {
  spellToast.value = { name, desc, accent }
  window.clearTimeout(spellToastTimer)
  spellToastTimer = window.setTimeout(() => { spellToast.value = null }, 5000)
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
// Melee clashes are rate-limited by a sliding window (not a fixed min-gap):
// at most CLASH_MAX distinct clash-1..5 hits sound per CLASH_WINDOW_MS, so a
// dense brawl stays punchy for a beat then falls quiet instead of machine-
// gunning. Timestamps older than the window are dropped on each call.
const CLASH_WINDOW_MS = 1500
const CLASH_MAX = 5
const clashTimes: number[] = []
const clashSound = (tier: number): void => {
  const now = performance.now()
  while (clashTimes.length && now - clashTimes[0]! > CLASH_WINDOW_MS) clashTimes.shift()
  if (clashTimes.length >= CLASH_MAX) return
  clashTimes.push(now)
  const n = 1 + ((Math.random() * 5) | 0)
  playSound(`clash-${n}`, 0.02, 0.9 + Math.min(10, tier) * 0.03)
}
const shotSound = (): void => {
  const n = 1 + ((Math.random() * 3) | 0)
  throttledSound('shot', `unit-shot-${n}`, 0.012, 1.2 + Math.random() * 0.2, 120)
}
const fleshHitSound = (): void => {
  const n = 1 + ((Math.random() * 2) | 0)
  throttledSound('flesh', `flesh-hit-${n}`, 0.02, 0.95 + Math.random() * 0.2, 70)
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
      shotSound()
      break
    case 'impact':
      if (!e.element || !addImpactSheet(e.element, e.x, e.y)) emitSparkle(toClientX(e.x), toClientY(e.y), e.color, 4)
      // Wet flesh-hit only when a RANGED attack (element set) lands on an enemy;
      // melee already has its clash on the 'strike' event, and enemy shots on
      // our fighters are the 'fighter' target — neither should thud here.
      if (e.element && e.target === 'enemy') fleshHitSound()
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
      // The ogre (brute) is a rock golem — it cracks apart with a stone-cut
      // rather than the wet enemy-death pop. Its own throttle group so a flurry
      // of normal deaths can't suppress the ogre's distinct shatter.
      if (e.kind === 'brute') throttledSound('death-ogre', 'stone-cut', 0.03, 0.85 + Math.random() * 0.25, 80)
      else throttledSound('death', 'enemy-death', 0.02, 1 + Math.random() * 0.3, 80)
      break
    case 'fighterDeath':
      if (!shatterUnit(fighterEls.get(e.id)?.root, false)) {
        emitSplash(toClientX(e.x), toClientY(e.y), getIngredient(e.tier).glow)
      }
      emitSparkle(toClientX(e.x), toClientY(e.y), getIngredient(e.tier).glow, 9)
      playSound('fighter-death', 0.03, 0.8)
      break
    case 'heal':
      // Greenish "+" floats up off the healed unit.
      emitHealPlus(e.x, e.y - 6)
      break
    case 'revive':
      // Guardian revive — golden burst as the wings are spent.
      addFlash('warheal', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#ffe27a', 14)
      playSound('rally-revive', 0.05)
      break
    case 'defender':
      // Tank promotion — a steely shield shockwave off the chosen unit.
      addFlash('shockwave', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#9fd8ff', 16)
      break
    case 'slimeBirth':
      // A gooey burst at the boss body as a companion slime is born from it.
      emitSplash(toClientX(e.x), toClientY(e.y), '#6fd66f')
      emitSparkle(toClientX(e.x), toClientY(e.y), '#8fe08a', 10)
      playSound('deploy-land', 0.03, 1.3)
      break
    case 'deploy':
      addFlash('shockwave', e.x, e.y)
      emitSparkle(toClientX(e.x), toClientY(e.y), '#ffffff', 10)
      playSound('deploy-land', 0.04, 1.1)
      // A deployed unit may be a new high tier — unlock its codex entry.
      bumpMaxTier(e.tier)
      break
    case 'fieldMerge': {
      addFlash('mergeburst', e.x, e.y)
      // The event carries the fighter's position, not its id; it is emitted
      // synchronously from `fieldMerge`, so the promoted fighter still sits on
      // exactly these coordinates.
      const merged = battle.fighters.value.find((f) => f.x === e.x && f.y === e.y && f.tier === e.tier)
      // Arena field merge climbs the fighter a tier — raise the codex watermark
      // (so the tier lights up in the Unit Codex) and, when it is a tier the
      // player never had, stage the new-tier reveal on that fighter. The reveal
      // sting replaces the ordinary merge sound and holds its confetti for the
      // bloom (TierRevealFx).
      if (noteFieldMerge(e.tier, merged?.id ?? null)) {
        playSound('new-tier-reveal', 0.07)
      } else {
        emitConfetti(toClientX(e.x), toClientY(e.y), 16, 1.2)
        playSound('field-merge', 0.05, 0.85 + Math.min(10, e.tier) * 0.05)
      }
      break
    }
    case 'gateHit': {
      gateShake.value = true
      window.clearTimeout(gateShakeTimer)
      gateShakeTimer = window.setTimeout(() => { gateShake.value = false }, 200)
      throttledSound('gate', 'gate-hit', 0.025, 0.9, 150)
      triggerShake('small')
      break
    }
    case 'overrun':
      // Run lost — active gameplay is over until the next wave begins (CG).
      stopGameplayForWaveBreak()
      // No ad here. The time-paced interstitial fires on the 3…2…1 countdown
      // ONLY (`useBreakInterstitial`), which on this path is the retry
      // countdown after the OVERRUN overlay has had its full run — so an
      // interstitial can never open on top of a result screen.
      playSound('overrun', 0.06)
      triggerShake('big')
      // RALLY! rewarded revive (roadmap #8): hold the restart only when the
      // revive can actually be redeemed — a fillable ad, or enough coins in
      // coin mode — AND fighters fell this wave.
      if (rallyAffordable.value && battle.requestRallyHold()) rallyBusy.value = false
      break
    case 'setback':
      // Unrevived wipe → the front line retreats to an easier wave.
      showWaveBanner(t('battle.waveSetback', { n: e.wave }), 'boss', 2200)
      break
    case 'waveStart':
      // The new wave is live → back in active play (CG). No-op unless a wave
      // clear / overrun took the hold.
      resumeGameplayAfterWaveBreak()
      if (e.mutated) {
        // Mutation wave — a bigger, buffed swarm; flag it loudly.
        showWaveBanner(t('battle.mutationWave'), 'mutation', 2400)
        playSound('boss-incoming', 0.05)
        triggerShake('small')
      } else if (e.mutator) {
        showWaveBanner(t(`battle.mutators.${e.mutator}`, { mult: GOLD_RUSH_MULT }), 'mutator', 2400)
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
      // Wave down — the field is empty and the next one hasn't spawned, so CG
      // gameplay pauses until `waveStart`.
      stopGameplayForWaveBreak()
      // Rank suffix only when a platform actually reported one (roadmap #16) —
      // and only on a build WITHOUT the global board. With it, the arena corner
      // already carries a rank, and two rank sources that disagree (Yandex's own
      // board vs ours) on one screen read as the game not knowing its own number.
      const rank = !leaderboardEnabled && bestWaveRank.value ? ` · #${bestWaveRank.value}` : ''
      showWaveBanner(t('battle.waveCleared', { n: formatBig(e.bonus) }) + rank, 'wave', 1500)
      playSound('wave-cleared', 0.045)
      if (props.coinTarget && rootRef.value) {
        spawnCoinExplosion({ sourceEl: rootRef.value, targetEl: props.coinTarget, count: 12 })
      }
      break
    }
    case 'milestone':
      // Every-10th-wave chest (roadmap #4): fat fountain here; the scene
      // drops the free high-tier unit onto the grid.
      showWaveBanner(t('battle.chestWave', { n: formatBig(e.gold) }), 'chest', 2000)
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
      // CrazyGames "happy moment": beating a boss is this game's win beat (an
      // endless auto-battler has no win screen to hook), so it's the honest
      // place for the SDK's happytime signal. No-op off CrazyGames — the module
      // is aliased to an inert stub on every other build.
      triggerHappytime()
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
    // ── Arena skills, slots 5–8 (their cast sounds play in the button handlers,
    // on the click — only the execute is an engine-timed hit) ──
    case 'warcry':
      // Two war-red rings roll out of the army's centre; every fighter throws
      // embers as its aura lights (the auras + edge vignette are template).
      addFlash('warcry', e.x, e.y - 5)
      emitSparkle(toClientX(e.x), toClientY(e.y - 5), '#ffd66b', 18)
      for (const f of battle.fighters.value) emitSparkle(toClientX(f.x), toClientY(f.y - 6), '#ff7a2e', 6)
      break
    case 'legionCall':
      // One portal per warrior, opening at its feet; the warrior rises out of
      // it (the `.spectral` mount animation).
      for (const p of e.points) {
        addFlash('legion', p.x, p.y)
        emitSparkle(toClientX(p.x), toClientY(p.y - 4), '#8ff3ff', 10)
      }
      break
    case 'spectralFade':
      dissolveSpectral(e.id)
      emitSparkle(toClientX(e.x), toClientY(e.y - 5), '#9ff0ff', 8)
      throttledSound('spectral', 'crystal-cut', 0.012, 1.7, 120)
      break
    case 'mark':
      // A crimson rune ring snaps down onto the target; the turning reticle
      // that follows it is template.
      addFlash('markcast', e.x, e.y - 5)
      break
    case 'execute':
      // Crossed crimson slashes and a white flash — then the death shatter.
      addFlash('execute', e.x, e.y - 5)
      emitSparkle(toClientX(e.x), toClientY(e.y - 5), '#ff2d4a', e.boss ? 26 : 14)
      playSound('skill-execute', 0.07)
      triggerShake(e.boss ? 'big' : 'strong')
      break
    case 'soulPact':
      soulPactFx(e)
      break
  }
}

// ─── Spell buttons (Meteor / Heal / Revive Guard) ────────────────────────────
const ultPct = computed(() => Math.min(100, Math.round((battle.ultCharge.value / battle.ultMax) * 100)))
const healPct = computed(() => Math.round((battle.healCharge.value / battle.spellMax) * 100))
const revivePct = computed(() => Math.round((battle.reviveCharge.value / battle.spellMax) * 100))
const defenderPct = computed(() => Math.round((battle.defenderCharge.value / battle.spellMax) * 100))
// Drop-in art: the spell icons.
const meteorBtnArt = computed(() => artSrc('meteor-button'))
const healBtnArt = computed(() => artSrc('spell-heal'))
const reviveBtnArt = computed(() => artSrc('spell-revive'))
const defenderBtnArt = computed(() => artSrc('spell-defender'))
const wingsArt = computed(() => artSrc('revive-wings'))
const crestArt = defenderBtnArt // the tank's shield crest reuses the spell icon

const { coins } = useEpicConfig()
const canAffordHeal = computed(() => coins.value >= battle.healUnlockCost)
const canAffordRevive = computed(() => coins.value >= battle.reviveUnlockCost)
const canAffordDefender = computed(() => coins.value >= battle.defenderUnlockCost)
const reviveSecs = computed(() =>
  battle.reviveGuardActive.value ? Math.ceil(battle.reviveGuardRemainingMs.value / 1000) : 0)

const onUlt = (): void => {
  if (battle.fireUltimate()) {
    playSound('ult-cast', 0.05, 1.2)
    triggerShake('strong')
    if (battle.noteSpellCast('meteor')) showSpellToast(t('battle.ultimate'), t('battle.spellDesc.meteor'), '#ff8a1f')
  }
}
const onHeal = (): void => {
  if (battle.fireHeal()) {
    playSound('happy', 0.06)
    if (battle.noteSpellCast('heal')) showSpellToast(t('battle.spells.heal'), t('battle.spellDesc.heal'), '#4ade80')
  }
}
const onReviveGuard = (): void => {
  if (battle.fireReviveGuard()) {
    playSound('celebration-2', 0.06); triggerShake('small')
    if (battle.noteSpellCast('reviveGuard')) showSpellToast(t('battle.spells.reviveGuard'), t('battle.spellDesc.reviveGuard'), '#ffe27a')
  }
}
const onUnlockHeal = (): void => {
  playSound(battle.unlockHeal() ? 'level-up' : 'barricade', 0.05)
}
const onUnlockRevive = (): void => {
  playSound(battle.unlockReviveGuard() ? 'level-up' : 'barricade', 0.05)
}
const onDefender = (): void => {
  if (battle.fireDefender()) {
    playSound('level-up', 0.06); triggerShake('small')
    if (battle.noteSpellCast('defender')) showSpellToast(t('battle.spells.defender'), t('battle.spellDesc.defender'), '#7fd6ff')
  }
}
const onUnlockDefender = (): void => {
  playSound(battle.unlockDefender() ? 'level-up' : 'barricade', 0.05)
}

// ─── Arena skills, slots 5–8 ─────────────────────────────────────────────────
// Warcry of the Legion (5) and Legion Call (6) everywhere; Executioner's Mark
// (7) and Soul Pact (8) on desktop only — a phone arena fits six buttons at a
// thumb-safe size, not eight.
const desktopSkills = !mobileCheck()
const spellCount = desktopSkills ? 8 : 6
const SKILL_ACCENT = { warcry: '#ff5a2a', legion: '#5ce1ff', mark: '#ff2d4a', pact: '#c084fc' } as const
const warcryPct = computed(() => Math.round((battle.warcryCharge.value / battle.spellMax) * 100))
const legionPct = computed(() => Math.round((battle.legionCharge.value / battle.spellMax) * 100))
const markPct = computed(() => Math.round((battle.markCharge.value / battle.spellMax) * 100))
const pactPct = computed(() => Math.round((1 - battle.pactCooldownMs.value / PACT_COOLDOWN_MS) * 100))
const warcryBtnArt = computed(() => artSrc('spell-warcry'))
const legionBtnArt = computed(() => artSrc('spell-legion'))
const markBtnArt = computed(() => artSrc('spell-execute'))
const pactBtnArt = computed(() => artSrc('spell-pact'))
const canAffordWarcry = computed(() => coins.value >= battle.warcryUnlockCost)
const canAffordLegion = computed(() => coins.value >= battle.legionUnlockCost)
const canAffordMark = computed(() => coins.value >= battle.markUnlockCost)
const canAffordPact = computed(() => coins.value >= battle.pactUnlockCost)
const secsLeft = (ms: number): number => (ms > 0 ? Math.ceil(ms / 1000) : 0)
const warcrySecs = computed(() => secsLeft(battle.warcryRemainingMs.value))
const legionSecs = computed(() => secsLeft(battle.legionRemainingMs.value))
const markSecs = computed(() => (battle.markedId.value ? secsLeft(battle.markRemainingMs.value) : 0))
// A three-minute cooldown is too slow for a ring alone to read: count it down.
const pactSecs = computed(() => (battle.pactUnlocked.value ? secsLeft(battle.pactCooldownMs.value) : 0))

const onWarcry = (): void => {
  if (!battle.fireWarcry()) return
  playSound('skill-warcry', 0.07)
  triggerShake('strong')
  if (battle.noteSpellCast('warcry')) showSpellToast(t('battle.spells.warcry'), t('battle.spellDesc.warcry'), SKILL_ACCENT.warcry)
}
const onLegion = (): void => {
  if (!battle.fireLegion()) return
  playSound('skill-legion-call', 0.07)
  triggerShake('small')
  if (battle.noteSpellCast('legionCall')) showSpellToast(t('battle.spells.legionCall'), t('battle.spellDesc.legionCall'), SKILL_ACCENT.legion)
}
const onMark = (): void => {
  if (!battle.fireMark()) return
  playSound('skill-mark', 0.06)
  if (battle.noteSpellCast('executionerMark')) showSpellToast(t('battle.spells.executionerMark'), t('battle.spellDesc.executionerMark'), SKILL_ACCENT.mark)
}
const onPact = (): void => {
  // Off cooldown but nothing to give (one fighter, or all on one tier): say so
  // instead of silently doing nothing.
  if (!battle.hasPactPair.value) {
    playSound('barricade', 0.05)
    showSpellToast(t('battle.spells.soulPact'), t('battle.pactNeedsSacrifice'), SKILL_ACCENT.pact)
    return
  }
  if (!battle.firePact()) return
  playSound('skill-soul-pact', 0.07)
  triggerShake('small')
  if (battle.noteSpellCast('soulPact')) showSpellToast(t('battle.spells.soulPact'), t('battle.spellDesc.soulPact'), SKILL_ACCENT.pact)
}
const unlockSound = (ok: boolean): void => { playSound(ok ? 'level-up' : 'barricade', 0.05) }
const onUnlockWarcry = (): void => unlockSound(battle.unlockWarcry())
const onUnlockLegion = (): void => unlockSound(battle.unlockLegion())
const onUnlockMark = (): void => unlockSound(battle.unlockMark())
const onUnlockPact = (): void => unlockSound(battle.unlockPact())

// DEV only: the gameplay-video seam (`src/dev/videoSeam.ts`) casts through the
// SAME handlers the buttons call, so a scripted Meteor gets the cast sound, the
// shake and the VFX a tap would. Statically false in every platform build.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__arenaCast = {
    meteor: onUlt, heal: onHeal, revive: onReviveGuard, defender: onDefender,
    warcry: onWarcry, legion: onLegion, mark: onMark, pact: onPact
  }
}

// Floating greenish "+" per healed unit — spawned at the unit, wobbles up.
interface HealPlus { id: number; x: number; y: number }
const healPluses = ref<HealPlus[]>([])
let healPlusSeq = 0
const emitHealPlus = (x: number, y: number): void => {
  const id = ++healPlusSeq
  healPluses.value = [...healPluses.value, { id, x, y }]
  window.setTimeout(() => { healPluses.value = healPluses.value.filter((p) => p.id !== id) }, 1100)
}

/** The fighter carrying a new-tier reveal (field-merge discovery, or a freshly
 *  revealed grid unit deployed into the arena), or null. */
const revealedFighterId = computed<number | null>(() => {
  const r = activeReveal.value
  return r && r.target.kind === 'fighter' ? r.target.fighterId : null
})

// ─── Boss bar ────────────────────────────────────────────────────────────────
const bossPct = computed(() => {
  const b = battle.boss.value
  return b ? Math.max(0, Math.min(100, (b.hp / b.maxHp) * 100)) : 0
})

// Localized boss name: translate the roster key, appending " +N" once the
// roster has wrapped (cycle > 0).
const bossDisplayName = computed(() => {
  const b = battle.boss.value
  if (!b) return ''
  const base = t(`battle.bossNames.${b.nameKey}`)
  return b.cycle > 0 ? `${base} +${b.cycle}` : base
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
// Redeemed via a rewarded ad, or bought for coins on coin-mode builds.
const { buffsCostCoins, REWARD_COIN_COST, canRedeem, redeem } = useReward()
const rallyAffordable = computed(() => canRedeem(REWARD_COIN_COST))
const rallyBusy = ref(false)
const onRally = async (): Promise<void> => {
  if (rallyBusy.value || !battle.rallyOffer.value) return
  rallyBusy.value = true
  try {
    const ok = await redeem(REWARD_COIN_COST)
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
/** The unit box's per-fighter animation inputs: the new-tier reveal's phase,
 *  or a Soul Pact twin's split-off offset. */
const unitBoxStyle = (f: Fighter): Record<string, string> | undefined => {
  if (revealedFighterId.value === f.id) return { animationDelay: revealAnimationDelay(activeReveal.value) }
  const twin = pactTwin.value
  if (twin?.id === f.id) return { '--split-x': `${twin.dx.toFixed(1)}px`, '--split-y': `${twin.dy.toFixed(1)}px` }
  return undefined
}
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
  // Reconcile the codex watermark against the RESTORED army: a fighter that
  // climbed to a new high tier via field merges in a prior session (before this
  // bump existed) fires no event on reload, so unlock it here on mount.
  for (const f of battle.fighters.value) bumpMaxTier(f.tier)
  // Global leaderboard: boot report + new-best / overrun / suspend edges. After
  // the watermark reconcile above, so the posted tie-break tier is current.
  installWaveLeaderboard()
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
  window.clearTimeout(pactTwinTimer)
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
      //- The bitmap gate sizes the box itself (`w-full h-auto`) so the box hugs
      //- the tower at ITS aspect — no empty strip, no bottom-anchor offset, so it
      //- sits dead-centre. The procedural fallback keeps a fixed 1:2 door.
      div.gate-door.relative.w-full.rounded-r-xl.overflow-hidden(:class="{ 'gate-bare': gateArt, 'gate-shake': gateShake, 'aspect-[1/2]': !gateArt }")
        img.block.w-full.h-auto(
          v-if="gateArt" :src="gateArt" alt="" draggable="false"
        )
        //- Blue HP glow is only for the procedural fallback door; the bitmap gate stands bare.
        div.gate-glow.absolute.inset-0(v-if="!gateArt" :style="{ opacity: gatePct / 100 * 0.8 + 0.2 }")
        div.gate-cracks.absolute.inset-0(v-if="gatePct < 55" :style="gateMaskStyle")
      //- HP bar is absolute (below the tower) so it doesn't add flow height that
      //- would shove the centred tower off the arena's vertical midline.
      div.gate-hpbar.rounded-full.overflow-hidden(class="absolute top-full left-0 w-full mt-1 h-1.5 bg-black/50")
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
      :data-fighter-id="f.id"
    )
      //- `tier-revealed`: this fighter is the unit of a new-tier discovery
      //- (TierRevealFx follows it via `data-fighter-id`).
      //- `spectral`: a Legion Call warrior (rises out of its portal, then glows
      //- translucent cyan). `pact-twin`: just split off a Soul Pact champion.
      div.unit-box(
        :class="{ 'tier-revealed': revealedFighterId === f.id, spectral: f.spectral, 'pact-twin': pactTwin?.id === f.id }"
        :style="unitBoxStyle(f)"
      )
        //- Revive Guard wings — centred BEHIND the unit while its revive is
        //- pending; vanish the moment it's consumed (unit dies → resurrects).
        img.revive-wings(v-if="f.revivePending && wingsArt" :src="wingsArt" alt="" draggable="false")
        //- Warcry of the Legion: a war-red aura throbbing behind every fighter.
        div.warcry-aura(v-if="battle.warcryActive.value")
        div.hpbar
          div.hpfill(:class="f.spectral ? 'hp-spectral' : 'hp-ally'")
        div.unit-body.fighter-march(:class="{ 'warcry-body': battle.warcryActive.value }")
          IngredientUnit(:tier="f.tier" :still="true")
          //- Defender shield crest — 60% size, bottom-aligned + IN FRONT of the
          //- promoted tank so it overlaps a good chunk of the unit.
          img.tank-crest(v-if="f.isTank && crestArt" :src="crestArt" alt="" draggable="false")

    //- ── Enemies ──
    div.entity.absolute.top-0.left-0(
      v-for="e in battle.enemies.value"
      :key="e.id"
      :ref="setEnemyEl(e.id)"
      :style="enemyStyle(e)"
    )
      div.unit-box(:class="{ 'enemy-birth': !e.born }")
        div.hpbar(v-if="e.born")
          div.hpfill.hp-enemy
        div.unit-body.enemy-march(:class="{ 'elite-aura': e.elite, 'mutated-aura': e.mutated && !e.elite }")
          EnemyUnit(:kind="e.kind" :enraged="e.enraged" :boss-wave="battle.wave.value")
        //- Executioner's Mark: two crimson rune rings turning against each
        //- other around the target, for as long as the mark holds.
        div.mark-reticle(v-if="battle.markedId.value === e.id")
          svg.mark-ring-outer(viewBox="0 0 100 100")
            circle(cx="50" cy="50" r="46" fill="none" stroke="#ff2d4a" stroke-width="3.2" stroke-dasharray="15 6")
            path(
              v-for="a in [0, 90, 180, 270]" :key="a"
              d="M50 1.5 L53.5 6.5 L50 11.5 L46.5 6.5 Z" fill="#ff6a78" stroke="#3a0208" stroke-width="1"
              :transform="`rotate(${a + 45} 50 50)`"
            )
          svg.mark-ring-inner(viewBox="0 0 100 100")
            circle(cx="50" cy="50" r="33" fill="none" stroke="#ff6a78" stroke-width="2.2")
            path(d="M50 9 V23 M50 77 V91 M9 50 H23 M77 50 H91" stroke="#ff2d4a" stroke-width="4.5" stroke-linecap="round")

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
      //- Soul Pact tether: a violet glow with a gold core flowing to the champion.
      g.pact-tether(v-for="tt in tethers" :key="'t' + tt.id")
        line(
          :x1="tt.x1" :y1="tt.y1" :x2="tt.x2" :y2="tt.y2"
          stroke="#b366ff" stroke-width="7" stroke-linecap="round" opacity="0.55" vector-effect="non-scaling-stroke"
        )
        line.pact-tether-core(
          :x1="tt.x1" :y1="tt.y1" :x2="tt.x2" :y2="tt.y2"
          stroke="#ffe08a" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"
        )

    //- ── Transient flashes (nova / meteor / heals / shockwaves) ──
    div.flash.absolute.pointer-events-none(
      v-for="fl in flashes"
      :key="fl.id"
      :class="'flash-' + fl.type"
      :style="flashStyle(fl)"
    )

    //- ── Heal "+" symbols — one per healed unit, wobbling upward ──
    div.heal-plus.absolute.pointer-events-none(
      v-for="p in healPluses"
      :key="'h' + p.id"
      class="z-[1210]"
      :style="{ left: p.x + '%', top: p.y + '%' }"
    )
      svg(viewBox="0 0 24 24" class="w-5 h-5 sm:w-6 sm:h-6")
        path(d="M9.5 3 h5 v6.5 h6.5 v5 h-6.5 v6.5 h-5 v-6.5 h-6.5 v-5 h6.5 Z" fill="#5cff8a" stroke="#0a5a2a" stroke-width="1.3" stroke-linejoin="round")

    //- ── Damage numbers (pooled) ──
    div.dmg-num(v-for="i in NUM_POOL" :key="'n' + i" :ref="setNumEl(i - 1)")

    //- ── Flying chest reward (roadmap #1B) ──
    FlyingChest(:coin-target="props.coinTarget")

    //- ── Deploy highlight while dragging a unit ──
    Transition(name="fade")
      div.absolute.inset-0.deploy-glow.pointer-events-none.flex.items-end.justify-center.pb-2(v-if="dragActive" class="z-[1190]")
        span.game-text.font-black.uppercase.text-white(class="text-xs sm:text-sm drop-shadow-lg")
          | {{ battle.armyFull.value ? t('battle.armyFullHint') : t('battle.deployHint') }}

    //- ── Top strip: boss HP bar + the hanging global-rank tag ──
    //- One flex row, so on a boss wave the bar ends where the tag begins instead
    //- of running under it; with no tag (tutorial, or no board on this build) the
    //- bar spans the full width exactly as before. The tag sits 0.5rem in from
    //- the strip (1rem from the arena edge) so the arena's rounded corner, which
    //- clips with `overflow-hidden`, cannot shave its top-right edge.
    div.arena-top-strip.absolute.left-2.right-2.top-0.flex.items-start.pointer-events-none(class="z-[1200] gap-2")
      div.flex-1.min-w-0.pt-1
        Transition(name="fade")
          div.flex.flex-col.items-center.gap-0(v-if="battle.boss.value")
            span.game-text.font-black.uppercase.text-red-300(class="text-[10px] sm:text-xs tracking-wider") {{ bossDisplayName }}
            div.w-full.rounded-full.overflow-hidden.border(class="h-2 sm:h-2.5 bg-black/60 border-red-900")
              div.h-full.boss-hp(:class="{ 'boss-enraged': battle.boss.value.enraged }" :style="{ width: bossPct + '%' }")
      RankBadge.mr-2(v-if="leaderboardEnabled && !tutorialActive" :score="rankedBest")

    //- ── Wave banner ──
    Transition(name="banner")
      div.wave-banner.absolute.left-0.right-0.flex.justify-center.pointer-events-none(v-if="waveBanner" class="top-[30%] z-[1220]")
        div.rounded-2xl.border-2.px-4.py-1.game-text.font-black.uppercase.text-white.shadow-2xl(
          :class="bannerClass(waveBanner.variant)"
        ) {{ waveBanner.text }}

    //- ── Spell cast toast (name + what it does, 5s) ──
    Transition(name="banner")
      div.absolute.left-2.right-2.flex.justify-center.pointer-events-none(v-if="spellToast" class="top-[15%] z-[1235]")
        div.spell-toast.rounded-xl.border-2.flex.flex-col.items-center.shadow-2xl.max-w-md(
          class="px-4 py-2 gap-1"
          :style="{ borderColor: spellToast.accent, '--toast-glow': spellToast.accent }"
        )
          span.game-text.font-black.uppercase.leading-none(
            class="text-sm sm:text-base tracking-wide" :style="{ color: spellToast.accent }"
          ) {{ spellToast.name }}
          span.game-text.text-white.text-center.leading-tight(class="text-[10px] sm:text-xs opacity-95") {{ spellToast.desc }}

    //- ── Active mutator chip (persists through the wave) ──
    Transition(name="fade")
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
        v-if="battle.mutator.value && battle.wavePhase.value === 'fighting'" class="top-[6%] z-[1200]"
      )
        span.mutator-chip.rounded-full.border.px-2.game-text.font-black.uppercase(class="py-0.5 text-[9px] sm:text-[11px]")
          | {{ t('battle.mutators.' + battle.mutator.value, { mult: GOLD_RUSH_MULT }) }}

    //- ── Combo pop ──
    div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(class="top-[12%] z-[1220]")
      div.combo-pop.game-text.font-black(
        v-if="comboPop"
        :key="comboPop.id"
        :class="comboPop.n >= 7 ? 'text-orange-300' : 'text-yellow-200'"
        :style="{ fontSize: Math.min(2.4, 1 + comboPop.n * 0.09) + 'rem' }"
      ) ×{{ comboPop.n }}{{ comboPop.n >= 7 ? ' ' + t('battle.rampage') : '' }}

    //- ── Warcry of the Legion: a war-red edge vignette throbbing for 8 s ──
    Transition(name="fade")
      div.absolute.inset-0.warcry-vignette.pointer-events-none(v-if="battle.warcryActive.value" class="z-[1175]")

    //- ── FEVER overlay ──
    Transition(name="fade")
      div.absolute.inset-0.fever-overlay.pointer-events-none(v-if="battle.feverActive.value" class="z-[1180]")
        div.absolute.left-0.right-0.flex.justify-center(class="top-[4%]")
          span.fever-text.game-text.font-black.uppercase(class="text-lg sm:text-2xl") {{ t('battle.fever') }}

    //- ── Countdown ──
    //- Hidden while the tutorial holds the sim (`useTutorialPauseGate`): the
    //- clock is frozen, so the number would sit there as a dead "4" over the
    //- arena the coach-marks are pointing at. It reappears, ticking, the moment
    //- the player deploys their first fighter and the hold releases.
    Transition(name="fade")
      div.wave-countdown.absolute.inset-0.flex.flex-col.items-center.justify-center.pointer-events-none.gap-1(
        v-if="battle.wavePhase.value === 'countdown' && !tutorialHoldsBattle" class="z-[1210]"
      )
        span.game-text.font-black.uppercase.text-white(class="text-xs sm:text-sm opacity-80") {{ t('battle.nextWave', { n: battle.wave.value }) }}
        span.countdown-num.game-text.font-black.text-yellow-300(:key="countdownDisplay" class="text-4xl sm:text-6xl") {{ countdownDisplay }}
        //- Telegraphs: incoming mutator / brand-new enemy archetype
        span.game-text.font-black.uppercase.text-purple-300(v-if="upcomingMutator" class="text-[10px] sm:text-sm animate-pulse") {{ t('battle.mutators.' + upcomingMutator, { mult: GOLD_RUSH_MULT }) }}
        span.game-text.font-black.uppercase.text-red-300(v-if="newEnemyIncoming" class="text-[10px] sm:text-sm animate-pulse") {{ t('battle.newEnemy') }}

    //- ── OVERRUN overlay (+ RALLY! rewarded revive, roadmap #8) ──
    //- No ad-ordering clause on this `v-if` any more: the only interstitial
    //- placement is the 3…2…1 countdown (`useBreakInterstitial`), which on this
    //- path runs AFTER the overlay has had its full `OVERRUN_SECS`. Nothing can
    //- open over the result screen, so nothing has to be suppressed for it.
    Transition(name="fade")
      div.absolute.inset-0.flex.flex-col.items-center.justify-center.overrun-overlay.pointer-events-none.gap-1(
        v-if="battle.wavePhase.value === 'overrun'" class="z-[1230]"
      )
        span.game-text.font-black.uppercase.text-red-400(class="text-2xl sm:text-4xl animate-pulse") {{ t('battle.overrun') }}
        span.game-text.text-white(class="text-xs sm:text-sm opacity-90") {{ t('battle.overrunBody') }}
        //- When a wipe still retreats the player, nudge them to rebuild on
        //- easier waves rather than keep throwing an underbuilt army at this one.
        span.game-text.text-amber-200.text-center.px-6(
          v-if="battle.canSetback.value"
          class="text-[10px] sm:text-xs opacity-90 mt-1 max-w-md"
        ) {{ t('battle.overrunSetbackHint') }}
        template(v-if="battle.rallyOffer.value && rallyAffordable")
          button.rally-btn.pointer-events-auto.cursor-pointer.mt-2.rounded-xl.border-2.px-4.py-2.flex.items-center.gap-2(
            class="bg-gradient-to-b from-emerald-400 to-emerald-700 border-emerald-200 active:scale-95 transition-transform disabled:opacity-50"
            :disabled="rallyBusy"
            @click="onRally"
          )
            //- Coin mode shows the price + IconCoin; ad mode the movie icon.
            template(v-if="buffsCostCoins")
              IconCoin(class="w-6 h-6 shrink-0 text-yellow-200")
              span.text-white.font-black.game-text.tabular-nums(class="text-sm sm:text-base leading-none") {{ formatCost(REWARD_COIN_COST) }}
            IconMovie(v-else class="w-6 h-6 shrink-0")
            div.flex.flex-col.items-start
              span.text-white.font-black.uppercase.game-text(class="text-sm sm:text-base leading-none") {{ t('battle.rally') }}
              span.text-emerald-100.game-text(class="text-[10px] sm:text-xs") {{ t('battle.rallyBody') }}
          button.pointer-events-auto.cursor-pointer.game-text(class="text-white/60 text-xs mt-1" @click="battle.declineRally()") {{ t('secondChance.skip') }}

    //- ── Spell buttons, numbered from the bottom-right corner: Meteor (1) ·
    //- Revive Guard · Heal · Defender · Warcry of the Legion (5) · Legion Call
    //- (6) · desktop only: Executioner's Mark (7) · Soul Pact (8). The row sizes
    //- its buttons to fit the arena (`--spell-size`, see `.spell-row`). ──
    div.spell-row.absolute.flex.items-end.pointer-events-auto(
      class="bottom-1.5 right-1.5 z-[1240]"
      :style="{ '--spell-n': spellCount }"
    )
      template(v-if="desktopSkills")
        //- Soul Pact — your best unit gains a twin, a lower one pays for it; 3-min cooldown.
        SpellButton(
          :pct="pactPct" :ready="battle.pactReady.value" :active-secs="pactSecs"
          :locked="!battle.pactUnlocked.value" :price="battle.pactUnlockCost" :affordable="canAffordPact"
          :icon-art="pactBtnArt" skill="pact" :accent="SKILL_ACCENT.pact" :label="t('battle.spells.soulPact')"
          @fire="onPact" @unlock="onUnlockPact"
        )
        //- Executioner's Mark — the boss takes +75% damage for 10s and dies at 12%.
        SpellButton(
          :pct="markPct" :ready="battle.markReady.value && battle.hasMarkTarget.value" :active-secs="markSecs"
          :locked="!battle.markUnlocked.value" :price="battle.markUnlockCost" :affordable="canAffordMark"
          :icon-art="markBtnArt" skill="execute" :accent="SKILL_ACCENT.mark" :label="t('battle.spells.executionerMark')"
          @fire="onMark" @unlock="onUnlockMark"
        )
      //- Legion Call — three spectral warriors for 20s; charges from losses.
      SpellButton(
        :pct="legionPct" :ready="battle.legionReady.value" :active-secs="legionSecs"
        :locked="!battle.legionUnlocked.value" :price="battle.legionUnlockCost" :affordable="canAffordLegion"
        :icon-art="legionBtnArt" skill="legion" :accent="SKILL_ACCENT.legion" :label="t('battle.spells.legionCall')"
        @fire="onLegion" @unlock="onUnlockLegion"
      )
      //- Warcry of the Legion — 8s of +60% damage and +30% attack speed.
      SpellButton(
        :pct="warcryPct" :ready="battle.warcryReady.value" :active-secs="warcrySecs"
        :locked="!battle.warcryUnlocked.value" :price="battle.warcryUnlockCost" :affordable="canAffordWarcry"
        :icon-art="warcryBtnArt" skill="warcry" :accent="SKILL_ACCENT.warcry" :label="t('battle.spells.warcry')"
        @fire="onWarcry" @unlock="onUnlockWarcry"
      )
      //- Defender — promotes the top melee unit into a 2-min tank (2× HP, -80% dmg).
      SpellButton(
        :pct="defenderPct" :ready="battle.defenderReady.value && battle.hasTankTarget.value"
        :locked="!battle.defenderUnlocked.value" :price="battle.defenderUnlockCost" :affordable="canAffordDefender"
        :icon-art="defenderBtnArt" accent="#7fd6ff" :label="t('battle.spells.defender')"
        @fire="onDefender" @unlock="onUnlockDefender"
      )
      //- Heal — locked until bought; then charges 1%/kill, heals 25% of all units.
      SpellButton(
        :pct="healPct" :ready="battle.healReady.value"
        :locked="!battle.healUnlocked.value" :price="battle.healUnlockCost" :affordable="canAffordHeal"
        :icon-art="healBtnArt" accent="#3ddc7a" :label="t('battle.spells.heal')"
        @fire="onHeal" @unlock="onUnlockHeal"
      )
      //- Revive Guard — left of Meteor; 30s window that auto-revives fallen units.
      SpellButton(
        :pct="revivePct" :ready="battle.reviveReady.value" :active-secs="reviveSecs"
        :locked="!battle.reviveUnlocked.value" :price="battle.reviveUnlockCost" :affordable="canAffordRevive"
        :icon-art="reviveBtnArt" accent="#b45cff" :label="t('battle.spells.reviveGuard')"
        @fire="onReviveGuard" @unlock="onUnlockRevive"
      )
      //- Meteor Storm — always unlocked. `hint`: coached on the first boss.
      SpellButton(
        :pct="ultPct" :ready="battle.ultReady.value" :hint="meteorHintActive"
        :icon-art="meteorBtnArt" accent="#ff8a1f" :label="t('battle.ultimate')"
        @fire="onUlt"
      )
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

// New-tier reveal on a fighter: a pop synced to the reveal sting's bloom
// (0.35 s), then a breathing golden glow for the rest of the five seconds. The
// halo itself is TierRevealFx; this only lights the unit. `scale` (the
// independent property) so it composes with the centering transform above.
.unit-box.tier-revealed
  animation: fighter-revealed 5s ease-in-out both
@keyframes fighter-revealed
  0%
    scale: 0.9
    filter: brightness(1) drop-shadow(0 0 0 rgba(255, 230, 140, 0))
  7%
    scale: 1.3
    filter: brightness(1.8) drop-shadow(0 0 10px rgba(255, 240, 170, 1))
  12%
    scale: 1
  25%, 55%, 85%
    filter: brightness(1.25) drop-shadow(0 0 7px rgba(255, 214, 90, 0.95))
  40%, 70%
    filter: brightness(1.05) drop-shadow(0 0 3px rgba(255, 214, 90, 0.5))
  100%
    scale: 1
    filter: brightness(1) drop-shadow(0 0 0 rgba(255, 214, 90, 0))
@media (prefers-reduced-motion: reduce)
  .unit-box.tier-revealed
    animation-name: fighter-revealed-still
  @keyframes fighter-revealed-still
    0%, 100%
      filter: none
    10%, 90%
      filter: brightness(1.25) drop-shadow(0 0 6px rgba(255, 214, 90, 0.9))

// Companion-slime birth: scale up from nothing near the boss body, then hop down
// to the ground with a squash landing. Uses the INDEPENDENT scale/translate
// properties so it composes with the unit-box's centering `transform` (and the
// child's march `transform`) instead of fighting them.
.unit-box.enemy-birth
  animation: enemy-birth 0.8s cubic-bezier(0.34, 1.5, 0.5, 1) both
@keyframes enemy-birth
  0%
    scale: 0
    translate: 0 -72%
  40%
    scale: 1.08
    translate: 0 -76%
  60%
    scale: 1
    translate: 0 -70%
  82%
    scale: 1.14 0.86
    translate: 0 6%
  100%
    scale: 1
    translate: 0 0

.enemy-march, .fighter-march
  animation: march 0.55s ease-in-out infinite

@keyframes march
  0%, 100%
    transform: translateY(0) rotate(-2deg)
  50%
    transform: translateY(-4%) rotate(2deg)

// Revive Guard wings — behind the unit (unit-box makes a stacking context via
// its transform, so z-index:-1 sits the wings under the in-flow body sprite).
.revive-wings
  position: absolute
  left: 50%
  top: 44%
  width: 258%
  height: auto
  z-index: -1
  pointer-events: none
  opacity: 1
  // Brighter + a crisp light halo so the wings read clearly against the dark
  // arena instead of blending in (~30% brighter than before).
  filter: brightness(1.3) contrast(1.08) drop-shadow(0 0 7px rgba(150, 210, 255, 0.95))
  transform: translate(-50%, -50%)
  transform-origin: center
  animation: wing-flutter 1.3s ease-in-out infinite alternate
@keyframes wing-flutter
  from
    transform: translate(-50%, -50%) scale(0.95)
  to
    transform: translate(-50%, -50%) scale(1.06)

// Defender shield crest — 60% of the unit, bottom-aligned, drawn OVER the sprite
// so it overlaps a significant part of the promoted tank.
.tank-crest
  position: absolute
  left: 50%
  bottom: 0
  width: 60%
  height: auto
  transform: translateX(-50%)
  z-index: 4
  pointer-events: none
  filter: drop-shadow(0 0 4px rgba(159, 216, 255, 0.85))

// Heal "+" — floats up off a healed unit with a gentle side-to-side wobble.
.heal-plus
  transform: translate(-50%, -50%)
  animation: heal-rise 1.1s ease-out forwards
  filter: drop-shadow(0 0 5px rgba(90, 255, 140, 0.8))
@keyframes heal-rise
  0%
    opacity: 0
    transform: translate(-50%, -50%) scale(0.5)
  15%
    opacity: 1
    transform: translate(-42%, -74%) scale(1.15)
  45%
    transform: translate(-64%, -128%) scale(1.05)
  72%
    transform: translate(-42%, -190%) scale(1)
  100%
    opacity: 0
    transform: translate(-56%, -262%) scale(0.9)

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

// ── Arena skills, slots 5–8 ──
// Everything that loops while a skill holds (auras, reticle, vignette) animates
// transform / opacity only, so it stays on the compositor; the filters sit on
// elements that do not themselves change, so they rasterise once.

// Warcry of the Legion — two war-red rings rolling out of the army's centre…
.flash-warcry
  width: 14cqmin
  height: 14cqmin
  border-radius: 9999px
  border: 4px solid #ff5a2a
  box-shadow: 0 0 18px 4px rgba(255, 90, 42, 0.75), inset 0 0 14px rgba(255, 190, 70, 0.8)
  animation: warcry-ring 0.95s cubic-bezier(0.2, 0.7, 0.3, 1) forwards
  &::after
    content: ''
    position: absolute
    inset: 14%
    border-radius: inherit
    border: 3px solid #ffd66b
    animation: warcry-ring-inner 0.95s 0.12s cubic-bezier(0.2, 0.7, 0.3, 1) both
@keyframes warcry-ring
  0%
    transform: translate(-50%, -50%) scale(0.2)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(4.4)
    opacity: 0
@keyframes warcry-ring-inner
  0%
    transform: scale(0.4)
    opacity: 1
  100%
    transform: scale(1)
    opacity: 0
// …a throbbing aura behind every fighter and embers on its outline…
.warcry-aura
  position: absolute
  left: 50%
  top: 55%
  width: 170%
  height: 170%
  border-radius: 50%
  background: radial-gradient(circle, rgba(255, 120, 40, 0.6) 0%, rgba(255, 60, 30, 0.3) 40%, rgba(255, 60, 30, 0) 68%)
  z-index: -1
  pointer-events: none
  animation: warcry-aura 0.5s ease-in-out infinite alternate
@keyframes warcry-aura
  from
    transform: translate(-50%, -50%) scale(0.86)
    opacity: 0.7
  to
    transform: translate(-50%, -50%) scale(1.08)
    opacity: 1
.warcry-body > *
  filter: drop-shadow(0 0 2px #ff5a2a) drop-shadow(0 0 1px #ffd66b)
// …and a war-red edge vignette over the whole field.
.warcry-vignette
  background: radial-gradient(ellipse at center, rgba(255, 70, 30, 0) 52%, rgba(255, 50, 20, 0.3) 100%)
  animation: warcry-throb 0.55s ease-in-out infinite alternate
@keyframes warcry-throb
  from
    opacity: 0.6
  to
    opacity: 1

// Legion Call — a ground portal opens at each warrior's feet…
.flash-legion
  width: 17cqmin
  height: 6cqmin
  border-radius: 50%
  background: radial-gradient(ellipse at center, #021a2a 0%, #0b5f86 45%, rgba(63, 216, 255, 0.95) 68%, rgba(184, 246, 255, 0) 74%)
  box-shadow: 0 0 16px 4px rgba(92, 225, 255, 0.7)
  animation: legion-portal 1.1s ease-in-out forwards
@keyframes legion-portal
  0%
    transform: translate(-50%, -50%) scale(0)
    opacity: 0
  18%
    transform: translate(-50%, -50%) scale(1.15)
    opacity: 1
  70%
    transform: translate(-50%, -50%) scale(1)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(0.2, 0.1)
    opacity: 0
// …the warrior rises out of it and stays a translucent, cyan-lit spirit.
.unit-box.spectral
  animation: spectral-rise 0.75s 0.12s cubic-bezier(0.2, 1.2, 0.4, 1) both
  .unit-body > *
    opacity: 0.8
    filter: grayscale(1) sepia(1) hue-rotate(150deg) saturate(2.6) brightness(1.25) drop-shadow(0 0 5px rgba(110, 230, 255, 0.95))
@keyframes spectral-rise
  0%
    translate: 0 45%
    scale: 0.4 0.2
    opacity: 0
  60%
    translate: 0 -6%
    scale: 1.08
    opacity: 1
  100%
    translate: 0 0
    scale: 1
    opacity: 1
.hp-spectral
  background: linear-gradient(90deg, #3fd8ff, #b8f6ff)

// Executioner's Mark — a rune ring snaps onto the target…
.flash-markcast
  width: 18cqmin
  height: 18cqmin
  border-radius: 9999px
  border: 3px dashed #ff2d4a
  box-shadow: 0 0 14px rgba(255, 45, 74, 0.8)
  animation: mark-snap 0.52s cubic-bezier(0.5, 0, 0.2, 1) forwards
@keyframes mark-snap
  0%
    transform: translate(-50%, -50%) scale(2.6) rotate(-120deg)
    opacity: 0
  25%
    opacity: 1
  80%
    transform: translate(-50%, -50%) scale(0.95) rotate(0deg)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(1) rotate(0deg)
    opacity: 0
// …and two rings keep turning around it while the mark holds.
.mark-reticle
  position: absolute
  left: 50%
  top: 46%
  width: 150%
  height: 150%
  transform: translate(-50%, -50%)
  pointer-events: none
  z-index: 3
  svg
    position: absolute
    inset: 0
    width: 100%
    height: 100%
    filter: drop-shadow(0 0 3px rgba(255, 45, 74, 0.95))
.mark-ring-outer
  animation: mark-spin 3.2s linear infinite
.mark-ring-inner
  animation: mark-spin 2.2s linear infinite reverse, mark-pulse 0.6s ease-in-out infinite alternate
@keyframes mark-spin
  to
    rotate: 360deg
@keyframes mark-pulse
  from
    scale: 0.9
  to
    scale: 1.04
// The execute: crossed crimson slashes over a white flash.
.flash-execute
  width: 26cqmin
  height: 26cqmin
  border-radius: 50%
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(255, 80, 100, 0.7) 22%, rgba(255, 45, 74, 0) 60%)
  animation: execute-flash 0.64s ease-out forwards
  &::before, &::after
    content: ''
    position: absolute
    left: -12%
    right: -12%
    top: 46%
    height: 8%
    border-radius: 50%
    background: linear-gradient(90deg, rgba(255, 45, 74, 0), #ffffff 45%, #ff2d4a 58%, rgba(255, 45, 74, 0))
    box-shadow: 0 0 10px rgba(255, 45, 74, 0.9)
  &::before
    rotate: -34deg
    animation: execute-slash 0.42s cubic-bezier(0.2, 0.9, 0.3, 1) forwards
  &::after
    rotate: 34deg
    animation: execute-slash 0.42s 0.09s cubic-bezier(0.2, 0.9, 0.3, 1) both
@keyframes execute-flash
  0%
    transform: translate(-50%, -50%) scale(0.3)
    opacity: 1
  100%
    transform: translate(-50%, -50%) scale(1.25)
    opacity: 0
@keyframes execute-slash
  0%
    scale: 0 1
    opacity: 1
  60%
    scale: 1 1
    opacity: 1
  100%
    scale: 1.1 0.3
    opacity: 0

// Soul Pact — the tether (its core flows toward the champion)…
.pact-tether
  animation: chain-fade 0.9s ease-in forwards
.pact-tether-core
  animation: pact-flow 0.3s linear infinite
@keyframes pact-flow
  to
    stroke-dashoffset: -12
// …a violet-gold burst as the sacrifice arrives…
.flash-pact
  width: 12cqmin
  height: 12cqmin
  border-radius: 9999px
  border: 3px solid #e9b8ff
  box-shadow: 0 0 16px 5px rgba(192, 132, 252, 0.8), inset 0 0 12px rgba(255, 214, 107, 0.9)
  animation: shockwave 0.8s ease-out forwards
// …and the twin splits off: hidden while the soul is in flight, then it
// flares out of the champion's body (--split-x/y: the champion, relative to
// the twin) and slides into its own spot.
.unit-box.pact-twin
  animation: pact-twin 1.4s ease-out both
@keyframes pact-twin
  0%, 44%
    opacity: 0
    scale: 0.6
    translate: var(--split-x, 0) var(--split-y, 0)
    filter: brightness(3) drop-shadow(0 0 10px #e9b8ff)
  52%
    opacity: 1
    scale: 1.1
    translate: var(--split-x, 0) var(--split-y, 0)
    filter: brightness(2.4) drop-shadow(0 0 12px #ffd66b)
  76%
    scale: 1.12
    translate: 0 0
    filter: brightness(1.6) drop-shadow(0 0 8px #e9b8ff)
  88%
    scale: 0.96
  100%
    opacity: 1
    scale: 1
    translate: 0 0
    filter: brightness(1) drop-shadow(0 0 0 rgba(255, 214, 107, 0))

// The spell row sizes its buttons to the arena: never past the classic 44 /
// 56 px, and small enough that --spell-n of them fit across it with room to
// spare (100cqw is the arena — `.battle-arena` is the size container).
.spell-row
  --spell-gap: 0.25rem
  --spell-max: 2.75rem
  gap: var(--spell-gap)
  --spell-size: min(var(--spell-max), calc((100cqw - 0.75rem - (var(--spell-n) - 1) * var(--spell-gap)) / var(--spell-n)))
@media (min-width: 640px)
  .spell-row
    --spell-gap: 0.375rem
    --spell-max: 3.5rem

@media (prefers-reduced-motion: reduce)
  .warcry-aura, .warcry-vignette, .mark-ring-outer, .mark-ring-inner, .pact-tether-core
    animation: none

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
.banner-mutation
  background: linear-gradient(180deg, #d24bff, #7a1fd0)
  border-color: #e9b6ff
  box-shadow: 0 0 18px rgba(190, 90, 255, 0.7)
  animation: boss-banner 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)
.spell-toast
  background: linear-gradient(180deg, #1e2c4e, #111a30)
  box-shadow: 0 0 20px var(--toast-glow, #ff8a1f), 0 6px 18px rgba(0, 0, 0, 0.7)
  animation: boss-banner 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)

.mutator-chip
  background: rgba(80, 20, 140, 0.75)
  border-color: rgba(200, 140, 255, 0.7)
  color: #e6c8ff

// Elite-mutator champion: pulsing golden aura around the whole sprite.
.elite-aura
  filter: drop-shadow(0 0 6px rgba(255, 205, 0, 0.9)) drop-shadow(0 0 14px rgba(255, 140, 0, 0.6))
  animation: march 0.55s ease-in-out infinite, elite-throb 0.8s ease-in-out infinite alternate

// Mutated enemies: a toxic purple glow (distinct from the elite gold) on top of
// their 50%-bigger size, so they read at a glance as mutated.
.mutated-aura
  filter: drop-shadow(0 0 6px rgba(190, 90, 255, 0.95)) drop-shadow(0 0 14px rgba(120, 30, 200, 0.6))
  animation: march 0.55s ease-in-out infinite, mutated-throb 0.9s ease-in-out infinite alternate
@keyframes mutated-throb
  from
    filter: drop-shadow(0 0 4px rgba(190, 90, 255, 0.8)) drop-shadow(0 0 10px rgba(120, 30, 200, 0.45))
  to
    filter: drop-shadow(0 0 10px rgba(210, 120, 255, 1)) drop-shadow(0 0 22px rgba(140, 40, 220, 0.85))
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
