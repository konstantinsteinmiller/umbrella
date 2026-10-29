<script setup lang="ts">
/**
 * ─── /#/umbrella-playground — painted vs drawn, in motion (DEV ONLY) ───────
 *
 * The verification scene for the kite art (roadmap #6, art-generation-pipeline
 * PLAYGROUND.md). Two views, both through the game's OWN painters:
 *
 *  · THE LEVEL — the real `render()` on a level holding every drawable, with
 *    Pweeg cycling through every state, and the hitboxes dashed over it. The
 *    "Painted / Drawn" button flips the painted layer live, so a painting is
 *    judged against the drawing it stands in for. (Needs the kite flag: run
 *    `pnpm dev:kite`; on a plain `pnpm dev` the level is always drawn.)
 *  · THE SHEETS — every animation, the vector reference frame and the painted
 *    frame side by side through the same registration box (dashed) and
 *    anchor (green), so a frame that drifts off its box shows at a glance.
 *
 * Canvases are backed at css × devicePixelRatio. Dev tooling: its labels are
 * not player-facing copy.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { render, type Camera } from '@/umbrella/renderer'
import { DEFAULT_TUNING } from '@/umbrella/tuning'
import { artLayer } from '@/umbrella/kite'
import { PLAYER_SCENES, sceneWorld, type PlayerScene } from '@/umbrella/art/scene'
import { GAME_SHEETS, PANEL, boxOf, type SheetDef } from '@/umbrella/art/manifest'
import { bakePanel, bakeWhole } from '@/umbrella/art/bake'
import { hasSheet, sheetImage, onSheetsChanged, loadSheets, shippedSheets } from '@/umbrella/art/sheets'
import { animFrame, blit, paintedArt, setPaintedArt } from '@/umbrella/art/paint'
import type { World } from '@/umbrella/engine'

const painted = ref(true)
const sceneName = ref<PlayerScene>('stand')
const shipped = shippedSheets()
const missing = computed(() => GAME_SHEETS.filter((s) => !hasSheet(s.id)).map((s) => s.id))

const levelEl = ref<HTMLCanvasElement | null>(null)
const sheetsEl = ref<HTMLCanvasElement | null>(null)

const toggle = () => {
  painted.value = !painted.value
  setPaintedArt(painted.value)
}

const size = (el: HTMLCanvasElement): number => {
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(el.clientWidth * dpr)
  const h = Math.round(el.clientHeight * dpr)
  if (el.width !== w || el.height !== h) {
    el.width = w
    el.height = h
  }
  return dpr
}

// ── The level ──
let world: World = sceneWorld('stand')
let sceneAt = 0
let clock = 0
const SCENE_TIME = 1.8

const drawLevel = (dt: number): void => {
  const el = levelEl.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  size(el)
  if (clock - sceneAt > SCENE_TIME) {
    sceneAt = clock
    const i = (PLAYER_SCENES.indexOf(sceneName.value) + 1) % PLAYER_SCENES.length
    sceneName.value = PLAYER_SCENES[i]!
    world = sceneWorld(sceneName.value, clock)
  }
  world.time += dt
  world.phaseTime += dt
  world.enemyTime += dt
  world.platformTime += dt
  if (sceneName.value === 'walk') world.player.x = 120 + ((clock * 90) % 200)
  const cam: Camera = render(ctx, world, { finish: 'Finish' }, DEFAULT_TUNING, dt)
  // Hitboxes, dashed, in world space.
  ctx.save()
  ctx.setTransform(cam.s, 0, 0, cam.s, cam.ox, cam.oy)
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1.5 / cam.s
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)'
  const pl = world.player
  ctx.strokeRect(pl.x, pl.y, pl.w, pl.h)
  ctx.strokeStyle = 'rgba(255, 211, 77, 0.8)'
  for (const h of world.hazards) ctx.strokeRect(h.x, h.y, h.w, h.h)
  for (const p of world.platforms) ctx.strokeRect(p.x, p.y, p.w, p.h)
  ctx.restore()
}

// ── The sheets: vector | painted, per animation ──
interface Row { s: SheetDef; anim: string | null }
const rows: Row[] = GAME_SHEETS.flatMap((s): Row[] => (s.use === 'sprite' ? Object.keys(s.anims).map((anim) => ({ s, anim })) : [{ s, anim: null }]))
const CELL = 150
const COLS = 4

const drawSheets = (): void => {
  const el = sheetsEl.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return
  const dpr = size(el)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#1b2130'
  ctx.fillRect(0, 0, el.width, el.height)
  rows.forEach((row, n) => {
    const col = n % COLS
    const line = Math.floor(n / COLS)
    const ox = col * CELL * 2 + 8
    const oy = line * (CELL + 26) + 22
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#dfe3ee'
    ctx.font = '600 11px system-ui, sans-serif'
    ctx.fillText(`${row.s.id}${row.anim ? ` · ${row.anim}` : ''}`, ox, oy - 6)
    for (const side of [0, 1] as const) {
      const x0 = ox + side * CELL
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.setLineDash([])
      ctx.strokeRect(x0 + 0.5, oy + 0.5, CELL - 4, CELL - 4)
      if (row.anim === null) {
        // Blocks and pillars: the whole sheet, scaled into the cell.
        const k = (CELL - 8) / (row.s.cols * PANEL)
        ctx.setTransform(dpr * k, 0, 0, dpr * k, (x0 + 2) * dpr, (oy + 2) * dpr)
        if (side === 0) bakeWhole(ctx, row.s)
        else {
          const img = sheetImage(row.s.id)
          if (img) ctx.drawImage(img, 0, 0, row.s.cols * PANEL, row.s.rows * PANEL)
        }
        continue
      }
      const a = row.s.anims[row.anim]!
      // A one-shot (a splat, a bump) replays every couple of seconds.
      const t = a.loop === false ? clock % (a.frames.length / a.fps + 0.6) : clock
      const frame = a.fps > 0 ? animFrame(a, t) : a.frames[Math.floor(clock * 12) % a.frames.length]!
      const box = boxOf(row.s, frame)
      const k = (CELL - 8) / box.size
      const ax = x0 + 2 + box.ax * (CELL - 8)
      const ay = oy + 2 + box.ay * (CELL - 8)
      ctx.setTransform(dpr * k, 0, 0, dpr * k, ax * dpr, ay * dpr)
      // The registration box, dashed: where the frame is allowed to be.
      ctx.save()
      ctx.setLineDash([4 / k, 3 / k])
      ctx.lineWidth = 1 / k
      ctx.strokeStyle = 'rgba(255, 211, 77, 0.55)'
      ctx.strokeRect(-box.ax * box.size, -box.ay * box.size, box.size, box.size)
      ctx.restore()
      if (side === 0) {
        const was = paintedArt()
        setPaintedArt(false)
        bakePanel(ctx, row.s, frame)
        setPaintedArt(was)
      } else {
        const img = sheetImage(row.s.id)
        if (img) blit(ctx, row.s, img, frame, 0, 0)
        else {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.fillStyle = 'rgba(255,255,255,0.4)'
          ctx.fillText('not painted', x0 + 40, oy + CELL / 2)
          continue
        }
      }
      ctx.fillStyle = '#4ade80'
      ctx.beginPath()
      ctx.arc(0, 0, 2.5 / k, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}
const sheetsHeight = Math.ceil(rows.length / COLS) * (CELL + 26) + 30

let raf = 0
let last = 0
const frame = (t: number) => {
  const dt = last ? Math.min(0.05, (t - last) / 1000) : 0
  last = t
  clock += dt
  drawLevel(dt)
  drawSheets()
  raf = requestAnimationFrame(frame)
}

let off: (() => void) | null = null
onMounted(() => {
  painted.value = paintedArt()
  void loadSheets(shipped)
  if (artLayer) void import('@/umbrella/art/install').then((m) => m.startKiteArt())
  off = onSheetsChanged(() => { /* redrawn next frame */ })
  raf = requestAnimationFrame(frame)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
  off?.()
})
</script>

<template lang="pug">
  div.umb-playground
    div.bar
      h1 Umbrella kite art — playground
      button(@click="toggle") {{ painted ? 'Painted' : 'Drawn' }} (click to flip)
      span.sub {{ shipped.length }} / {{ GAME_SHEETS.length }} sheets painted · scene: {{ sceneName }}
      span.sub(v-if="!artLayer") · plain dev server: the LEVEL view is always drawn — run pnpm dev:kite or dev:lantern for its A/B
    p.missing(v-if="missing.length") Still vector: {{ missing.join(', ') }}
    canvas.level(ref="levelEl")
    h2 Sheets — reference (left) · painted (right) · dashed = registration box · green = anchor
    canvas.sheets(ref="sheetsEl" :style="{ height: `${sheetsHeight}px` }")
</template>

<style scoped lang="sass">
.umb-playground
  position: fixed
  inset: 0
  z-index: 100
  overflow-y: auto
  padding: 10px 16px 40px
  background: #14161d
  color: #dfe3ee
  font: 13px/1.4 system-ui, sans-serif
.bar
  display: flex
  flex-wrap: wrap
  gap: 10px
  align-items: center
  h1
    margin: 0
    font-size: 18px
  button
    padding: 5px 12px
    border-radius: 6px
    border: 1px solid #6a74ff
    background: #2a2f6a
    color: #fff
    font-weight: 700
    cursor: pointer
  .sub
    opacity: 0.7
.missing
  color: #ffb4a0
canvas
  display: block
  width: 100%
.level
  aspect-ratio: 16 / 9
  max-width: 1280px
.sheets
  max-width: 1216px
</style>
