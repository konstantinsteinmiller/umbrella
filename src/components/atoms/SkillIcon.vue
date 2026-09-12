<script setup lang="ts">
/**
 * Procedural icons for the arena skills in slots 5–8 — the fallback SpellButton
 * draws until a painted bitmap lands in their art slot (`spell-warcry`,
 * `spell-legion`, `spell-execute`, `spell-pact`), and the drawing the art bench
 * serialises as each one's REFERENCE for the image model (ArtSheets.vue).
 *
 * That second job sets the rules: the root is the <svg>, and every colour is an
 * inline attribute — no classes, no `currentColor`, no CSS — because the bench
 * sends `outerHTML` to a canvas, where nothing from a stylesheet survives.
 * Drawn in the game's art direction: bold near-black outlines, flat saturated
 * fills with one step of shading and one glossy highlight, a silhouette that
 * reads at 32 px.
 */
import { useId } from 'vue'

export type SkillIconId = 'warcry' | 'legion' | 'execute' | 'pact'

defineProps<{ skill: SkillIconId }>()

// Gradient ids must be unique per instance: several icons share one document.
const uid = `sk${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
const paint = (name: string): string => `url(#${uid}-${name})`

const INK = '#1b0e12'
</script>

<template lang="pug">
  svg(viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg")
    defs
      //- Warcry
      linearGradient(:id="uid + '-horn'" x1="0" y1="1" x2="1" y2="0")
        stop(offset="0" stop-color="#d9a863")
        stop(offset="0.55" stop-color="#fbe8c4")
        stop(offset="1" stop-color="#fff6e2")
      linearGradient(:id="uid + '-gold'" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#ffe27a")
        stop(offset="1" stop-color="#e08a12")
      //- Legion Call
      linearGradient(:id="uid + '-ghost'" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#f2feff")
        stop(offset="0.6" stop-color="#8ee9ff")
        stop(offset="1" stop-color="#2fb6e0")
      radialGradient(:id="uid + '-portal'" cx="0.5" cy="0.5" r="0.5")
        stop(offset="0" stop-color="#021a2a")
        stop(offset="0.55" stop-color="#0b5f86")
        stop(offset="0.85" stop-color="#3fd8ff")
        stop(offset="1" stop-color="#b8f6ff")
      //- Executioner's Mark
      linearGradient(:id="uid + '-bone'" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#fffaf0")
        stop(offset="1" stop-color="#d8ccb4")
      //- Soul Pact
      linearGradient(:id="uid + '-violet'" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#f1d4ff")
        stop(offset="0.5" stop-color="#b366ff")
        stop(offset="1" stop-color="#6a1fc9")
      linearGradient(:id="uid + '-amber'" x1="0" y1="0" x2="0" y2="1")
        stop(offset="0" stop-color="#fff4c2")
        stop(offset="0.5" stop-color="#ffc53d")
        stop(offset="1" stop-color="#e07a0c")

    //- ── Warcry of the Legion: a war horn blasting red-gold shockwaves ──────────
    g(v-if="skill === 'warcry'")
      //- the roar — three arcs fanning out of the bell (centred on it, 40,27)
      g(fill="none" stroke-linecap="round")
        path(d="M41.1 14.1 A13 13 0 0 1 53 25.9" :stroke="INK" stroke-width="7")
        path(d="M41.1 14.1 A13 13 0 0 1 53 25.9" stroke="#ffd66b" stroke-width="3.6")
        path(d="M41.7 7.6 A19.5 19.5 0 0 1 59.4 25.3" :stroke="INK" stroke-width="7")
        path(d="M41.7 7.6 A19.5 19.5 0 0 1 59.4 25.3" stroke="#ffa53b" stroke-width="3.6")
        path(d="M49.2 4.3 A24.5 24.5 0 0 1 62.7 17.8" :stroke="INK" stroke-width="6.5")
        path(d="M49.2 4.3 A24.5 24.5 0 0 1 62.7 17.8" stroke="#ff5a2a" stroke-width="3.2")
      g(transform="translate(-2 5)")
        //- the horn: a crescent from the mouthpiece (bottom-left) to the bell
        path(d="M33.5 13.5 Q14 22 7.5 50.5 L13.5 55.5 Q30 41 50.5 30.5 Z" :fill="paint('horn')" :stroke="INK" stroke-width="3" stroke-linejoin="round")
        //- shading down the belly of the curve
        path(d="M13.5 55.5 Q30 41 50.5 30.5 L47 27 Q27 37 11 51 Z" fill="#b97a3c" opacity="0.55")
        //- gold bands
        g(stroke-linecap="round")
          line(x1="28.4" y1="16.4" x2="44.6" y2="32.9" :stroke="INK" stroke-width="7")
          line(x1="28.4" y1="16.4" x2="44.6" y2="32.9" :stroke="paint('gold')" stroke-width="4")
          line(x1="15.6" y1="31.8" x2="26.4" y2="44.4" :stroke="INK" stroke-width="6.5")
          line(x1="15.6" y1="31.8" x2="26.4" y2="44.4" :stroke="paint('gold')" stroke-width="3.6")
        //- the bell's mouth
        ellipse(cx="42" cy="22" rx="12" ry="5.6" transform="rotate(45 42 22)" fill="#4a1a0c" :stroke="INK" stroke-width="3")
        ellipse(cx="42.6" cy="21.4" rx="8.5" ry="3" transform="rotate(45 42.6 21.4)" fill="#8a3a14")
        //- mouthpiece
        circle(cx="10.5" cy="53" r="4" :fill="paint('gold')" :stroke="INK" stroke-width="2.6")
        //- gloss
        path(d="M31 17.5 Q20 24 14.5 40" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.85")

    //- ── Legion Call: three spectral helmets rising out of a portal ────────────
    g(v-else-if="skill === 'legion'")
      //- portal, back half
      ellipse(cx="32" cy="50" rx="27" ry="9.5" :fill="paint('portal')" :stroke="INK" stroke-width="3")
      //- helmets, side ones first (behind the middle one)
      g(v-for="h in [{ x: 15, y: 38, s: 0.8 }, { x: 49, y: 38, s: 0.8 }, { x: 32, y: 31, s: 1.06 }]" :key="h.x" :transform="`translate(${h.x} ${h.y}) scale(${h.s})`")
        //- crest: a bristling fan on the crown, seen from the front
        path(d="M0 -11 L-8 -21 Q-3.5 -19.5 -2.2 -24.5 Q0 -21 2.2 -24.5 Q3.5 -19.5 8 -21 Z" fill="#bff8ff" :stroke="INK" stroke-width="2.4" stroke-linejoin="round")
        //- helm: a Corinthian dome with cheek guards
        path(d="M-12 11 C-13.5 1 -13 -7 -10.5 -10.5 C-6 -16.5 6 -16.5 10.5 -10.5 C13 -7 13.5 1 12 11 L3.2 12.5 L-3.2 12.5 Z" :fill="paint('ghost')" fill-opacity="0.94" :stroke="INK" stroke-width="2.8" stroke-linejoin="round")
        //- the T of the visor, cut through to the dark
        path(d="M-9.5 -4.5 Q0 -6.5 9.5 -4.5 L9.5 0 Q5 -0.5 2.8 0.5 L2.8 12.5 L-2.8 12.5 L-2.8 0.5 Q-5 -0.5 -9.5 0 Z" fill="#06283a")
        //- eyes glowing through it
        circle(cx="-5.2" cy="-2.4" r="1.5" fill="#e9ffff")
        circle(cx="5.2" cy="-2.4" r="1.5" fill="#e9ffff")
        //- gloss
        path(d="M-8.6 -8.4 C-7 -12 -3.5 -13.6 0 -13.6" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.9")
      //- portal, front rim over the helmets' feet: they rise OUT of it
      path(d="M5 50 A27 9.5 0 0 0 59 50" fill="none" :stroke="INK" stroke-width="6")
      path(d="M5 50 A27 9.5 0 0 0 59 50" fill="none" stroke="#6fe6ff" stroke-width="3")
      //- rising wisps
      g(fill="none" stroke="#c8faff" stroke-width="1.8" stroke-linecap="round" opacity="0.9")
        path(d="M8 44 q-2 -5 1 -9")
        path(d="M56 44 q2 -5 -1 -9")
        path(d="M24 47 q-1.5 -4 0.5 -7")
        path(d="M40 47 q1.5 -4 -0.5 -7")

    //- ── Executioner's Mark: a skull held in a crimson rune reticle ────────────
    g(v-else-if="skill === 'execute'")
      //- reticle ring with rune notches
      circle(cx="32" cy="32" r="23" fill="none" :stroke="INK" stroke-width="8")
      circle(cx="32" cy="32" r="23" fill="none" stroke="#e8132f" stroke-width="4.6")
      circle(cx="32" cy="32" r="23" fill="none" stroke="#ff6a78" stroke-width="1.2" stroke-dasharray="4 8" opacity="0.9")
      //- the four inward ticks
      g(stroke-linecap="round")
        path(d="M32 3 V13 M32 51 V61 M3 32 H13 M51 32 H61" :stroke="INK" stroke-width="7")
        path(d="M32 3 V13 M32 51 V61 M3 32 H13 M51 32 H61" stroke="#ff2d4a" stroke-width="3.6")
      //- diagonal rune diamonds
      g(fill="#ff2d4a" :stroke="INK" stroke-width="1.8")
        path(v-for="a in [45, 135, 225, 315]" :key="a" d="M0 -3.4 L2.6 0 L0 3.4 L-2.6 0 Z" :transform="`rotate(${a} 32 32) translate(32 9)`")
      //- skull
      path(d="M20.5 30 C20.5 20 43.5 20 43.5 30 C43.5 34.5 41.5 36.5 39.5 37.5 L39.5 42.5 L24.5 42.5 L24.5 37.5 C22.5 36.5 20.5 34.5 20.5 30 Z" :fill="paint('bone')" :stroke="INK" stroke-width="2.8" stroke-linejoin="round")
      //- teeth
      path(d="M28.5 38 V42.5 M32 38 V42.5 M35.5 38 V42.5" :stroke="INK" stroke-width="1.8")
      //- sockets, lit red
      ellipse(cx="27.2" cy="30.2" rx="3.9" ry="4.3" :fill="INK")
      ellipse(cx="36.8" cy="30.2" rx="3.9" ry="4.3" :fill="INK")
      circle(cx="27.6" cy="30.6" r="1.6" fill="#ff3348")
      circle(cx="36.4" cy="30.6" r="1.6" fill="#ff3348")
      path(d="M32 34 L30.4 36.8 L33.6 36.8 Z" :fill="INK")
      //- gloss
      path(d="M24 26 C25 23 28 21.6 31 21.4" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round")

    //- ── Soul Pact: a violet soul and a golden soul, chained into one ─────────
    g(v-else-if="skill === 'pact'")
      //- twin flames, leaning in
      g(v-for="s in [{ x: 22.5, flip: 1, fill: 'violet', core: '#f7e6ff' }, { x: 41.5, flip: -1, fill: 'amber', core: '#fffbe6' }]" :key="s.x" :transform="`translate(${s.x} 30) scale(${s.flip} 1)`")
        path(d="M1 20 C-11 20 -14.5 8 -9 -2 C-6 -7.5 -8 -12.5 -3.5 -21 C-1.5 -12.5 5 -10.5 7.5 -1 C9.5 7 8 20 1 20 Z" :fill="paint(s.fill)" :stroke="INK" stroke-width="2.8" stroke-linejoin="round")
        path(d="M1 16 C-5 16 -7 10 -4.5 5 C-3 2 -3.8 -1 -1.6 -5 C-0.5 -1 3.5 1.2 4 5.6 C4.6 11 3.5 16 1 16 Z" :fill="s.core" opacity="0.92")
      //- where they meet: one spark
      path(d="M32 10 L34 16 L40 18 L34 20 L32 26 L30 20 L24 18 L30 16 Z" fill="#ffffff" :stroke="INK" stroke-width="1.6" stroke-linejoin="round")
      //- the chain binding them
      g(fill="none")
        ellipse(cx="26.5" cy="54" rx="6.4" ry="4.2" :stroke="INK" stroke-width="6")
        ellipse(cx="37.5" cy="54" rx="6.4" ry="4.2" :stroke="INK" stroke-width="6")
        ellipse(cx="26.5" cy="54" rx="6.4" ry="4.2" stroke="#c9a7ff" stroke-width="2.8")
        ellipse(cx="37.5" cy="54" rx="6.4" ry="4.2" stroke="#ffd35a" stroke-width="2.8")
      //- gloss on the violet flame
      path(d="M15 22 C13 16 14.5 11 17 7" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.9")
</template>
