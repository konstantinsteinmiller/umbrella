<script setup lang="ts">
/**
 * The DOM layer's small glyph set (24×24, stroke-drawn in `currentColor`).
 *
 * Icon-only HUD buttons are what let one portrait layout survive 21 locales:
 * a caption that fits in English wraps in German and pushes a row onto two
 * lines. Every glyph that stands in for a caption gets an i18n'd aria-label
 * from its button, never from here — this component is purely decorative.
 */
export type GlyphName =
  | 'damage' | 'capacity' | 'speed' | 'luck' | 'bounty'
  | 'skip' | 'fast' | 'codex' | 'collection' | 'daily' | 'supply' | 'gear'
  | 'shield' | 'revive' | 'warcry' | 'ball' | 'flag' | 'skull' | 'lock' | 'check' | 'star' | 'clock' | 'trophy' | 'retry'
  // Ball abilities (the codex peek after a discovery) — one per BallAbility.
  | 'burn' | 'knockback' | 'pierce' | 'freeze' | 'splash' | 'crush' | 'chain' | 'poison' | 'midas' | 'eruption'

defineProps<{ name: GlyphName }>()
</script>

<template lang="pug">
  svg(viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true")
    //- Ball Damage — a star-burst impact.
    template(v-if="name === 'damage'")
      path(d="M12 2.5 L14 8.5 L20.5 7 L16 12 L20.5 17 L14 15.5 L12 21.5 L10 15.5 L3.5 17 L8 12 L3.5 7 L10 8.5 Z" fill="currentColor" fill-opacity="0.25")
    //- Tray Capacity — a tray holding three balls.
    template(v-else-if="name === 'capacity'")
      circle(cx="7" cy="10" r="3")
      circle(cx="12.5" cy="8" r="3")
      circle(cx="18" cy="10" r="3")
      path(d="M2.5 14 H21.5 L19.5 19.5 H4.5 Z" fill="currentColor" fill-opacity="0.25")
    //- Launch Speed — a ball with speed streaks.
    template(v-else-if="name === 'speed'")
      circle(cx="16" cy="12" r="4.5" fill="currentColor" fill-opacity="0.25")
      path(d="M2.5 8 H9")
      path(d="M4.5 12 H10")
      path(d="M2.5 16 H9")
    //- Pickup Luck — a four-leaf clover.
    template(v-else-if="name === 'luck'")
      path(d="M12 12 C8 12 5 9.5 7 6.5 C8.5 4.5 11 5.5 12 8 C13 5.5 15.5 4.5 17 6.5 C19 9.5 16 12 12 12 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M12 12 C8 12 5 14.5 7 17.5 C8.5 19.5 11 18.5 12 16 C13 18.5 15.5 19.5 17 17.5 C19 14.5 16 12 12 12 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M12 16 C12.5 19 14 21 16 22")
    //- Coin Bounty — a coin stack.
    template(v-else-if="name === 'bounty'")
      ellipse(cx="12" cy="6.5" rx="7" ry="3" fill="currentColor" fill-opacity="0.25")
      path(d="M5 6.5 V11 C5 12.7 8.1 14 12 14 C15.9 14 19 12.7 19 11 V6.5")
      path(d="M5 11 V15.5 C5 17.2 8.1 18.5 12 18.5 C15.9 18.5 19 17.2 19 15.5 V11")
    //- Skip to the end (recall the volley) — the media "next" mark. The old
    //- down-arrow-onto-a-line read as "confirm / drop" in the play-test.
    template(v-else-if="name === 'skip'")
      path(d="M3.5 5.5 L11 12 L3.5 18.5 Z" fill="currentColor")
      path(d="M11.5 5.5 L19 12 L11.5 18.5 Z" fill="currentColor")
      path(d="M20.5 5 V19" stroke-width="2.6")
    //- Fast-forward.
    template(v-else-if="name === 'fast'")
      path(d="M3 6 L11 12 L3 18 Z" fill="currentColor")
      path(d="M12 6 L20 12 L12 18 Z" fill="currentColor")
    //- Codex — a book.
    template(v-else-if="name === 'codex'")
      path(d="M4 19.5 A2.5 2.5 0 0 1 6.5 17 H20 V3 H6.5 A2.5 2.5 0 0 0 4 5.5 Z" fill="currentColor" fill-opacity="0.2")
      path(d="M4 19.5 A2.5 2.5 0 0 0 6.5 22 H20 V17")
    //- Collection — a launcher pedestal with a ball on it.
    template(v-else-if="name === 'collection'")
      circle(cx="12" cy="8" r="5" fill="currentColor" fill-opacity="0.25")
      path(d="M10 6.5 A2.2 2.2 0 0 1 13 5.5")
      path(d="M5 20.5 L7 14.5 H17 L19 20.5 Z")
    //- Daily Barrage — calendar with a star.
    template(v-else-if="name === 'daily'")
      rect(x="3.5" y="5" width="17" height="15.5" rx="2" fill="currentColor" fill-opacity="0.15")
      path(d="M3.5 9.5 H20.5")
      path(d="M8 3 V6.5")
      path(d="M16 3 V6.5")
      path(d="M12 11.5 L13.1 13.7 L15.5 14 L13.7 15.6 L14.2 18 L12 16.8 L9.8 18 L10.3 15.6 L8.5 14 L10.9 13.7 Z" fill="currentColor" stroke-width="1.2")
    //- Supply drop — a crate under a parachute.
    template(v-else-if="name === 'supply'")
      path(d="M3.5 9 C3.5 4.5 7.5 2.5 12 2.5 C16.5 2.5 20.5 4.5 20.5 9 C18 7.8 15 7.8 12 9 C9 7.8 6 7.8 3.5 9 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M4 9 L9 14.5")
      path(d="M20 9 L15 14.5")
      rect(x="8" y="14.5" width="8" height="7" rx="1" fill="currentColor" fill-opacity="0.25")
      path(d="M8 18 H16")
    //- Options — a gear.
    template(v-else-if="name === 'gear'")
      circle(cx="12" cy="12" r="3")
      path(d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7.1 7.1 M16.9 16.9 L18.7 18.7 M5.3 18.7 L7.1 16.9 M16.9 7.1 L18.7 5.3")
      circle(cx="12" cy="12" r="7" fill="currentColor" fill-opacity="0.15")
    template(v-else-if="name === 'shield'")
      path(d="M12 2.5 L20 5.5 V11.5 C20 16.5 16.5 20 12 21.5 C7.5 20 4 16.5 4 11.5 V5.5 Z" fill="currentColor" fill-opacity="0.25")
    //- Revive — a heart with a plus.
    template(v-else-if="name === 'revive'")
      path(d="M12 20.5 C5 15.5 2.5 12 2.5 8.5 C2.5 5.5 4.8 3.5 7.3 3.5 C9.3 3.5 11 4.8 12 6.5 C13 4.8 14.7 3.5 16.7 3.5 C19.2 3.5 21.5 5.5 21.5 8.5 C21.5 12 19 15.5 12 20.5 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M12 9 V15 M9 12 H15")
    //- Warcry — a war horn.
    template(v-else-if="name === 'warcry'")
      path(d="M3 9 H7 L16 4 V20 L7 15 H3 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M19 8.5 C20.5 10.5 20.5 13.5 19 15.5")
    template(v-else-if="name === 'ball'")
      circle(cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.25")
      path(d="M8.5 9.5 A4 4 0 0 1 12 7")
    //- Row — a banner flag.
    template(v-else-if="name === 'flag'")
      path(d="M5 21 L5 4 L13 4 L12 7 L19 7 L19 14 L11 14 L12 11 L5 11")
    //- Retry — a circular arrow (One-Tap Comeback).
    template(v-else-if="name === 'retry'")
      path(d="M19 12 A7 7 0 1 1 16.5 6.6")
      path(d="M17.5 2.8 L17 7.4 L12.4 7" fill="none")
    template(v-else-if="name === 'skull'")
      path(d="M12 3 C7 3 4 6.5 4 11 C4 13.5 5.2 15.3 7 16.3 V19.5 H17 V16.3 C18.8 15.3 20 13.5 20 11 C20 6.5 17 3 12 3 Z" fill="currentColor" fill-opacity="0.25")
      circle(cx="9" cy="11" r="1.6" fill="currentColor")
      circle(cx="15" cy="11" r="1.6" fill="currentColor")
      path(d="M10 19.5 V17.5 M14 19.5 V17.5")
    template(v-else-if="name === 'lock'")
      rect(x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" fill-opacity="0.25")
      path(d="M8 10.5 V7.5 A4 4 0 0 1 16 7.5 V10.5")
    template(v-else-if="name === 'check'")
      path(d="M4.5 12.5 L9.5 17.5 L19.5 6.5")
    template(v-else-if="name === 'star'")
      path(d="M12 2.8 L14.8 8.6 L21.2 9.4 L16.5 13.8 L17.7 20.2 L12 17.1 L6.3 20.2 L7.5 13.8 L2.8 9.4 L9.2 8.6 Z" fill="currentColor" fill-opacity="0.3")
    //- A clock face (the treasure chest's countdown).
    template(v-else-if="name === 'clock'")
      circle(cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.2")
      path(d="M12 7 V12 L15.5 14.5")
    //- The rank plaque's trophy (RankBadge draws the same cup, filled).
    template(v-else-if="name === 'trophy'")
      path(d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h3.5v2h-9v-2H11v-2.1a6 6 0 0 1-3.4-3.9A5 5 0 0 1 3 8V5h3V3Zm0 4H5v1a3 3 0 0 0 1.6 2.7A8 8 0 0 1 6 8V7Zm12 0v1a8 8 0 0 1-.6 2.7A3 3 0 0 0 19 8V7h-1Z" fill="currentColor" stroke="none")
    //- ── Ball abilities ──
    template(v-else-if="name === 'burn'")
      path(d="M12 2.5 C14.5 6.5 18.5 9 18.5 14 A6.5 6.5 0 0 1 5.5 14 C5.5 10.5 8 9 8.5 6 C10 8 11.2 8 12 2.5 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M12 12 C13.5 13.5 14.5 15 14.5 16.5 A2.5 2.5 0 0 1 9.5 16.5 C9.5 15 10.5 13.8 12 12 Z")
    template(v-else-if="name === 'knockback'")
      rect(x="7.5" y="2.5" width="9" height="6" rx="1.5" fill="currentColor" fill-opacity="0.25")
      path(d="M12 21.5 V11.5")
      path(d="M7.5 15.5 L12 11 L16.5 15.5")
    template(v-else-if="name === 'pierce'")
      rect(x="9" y="6.5" width="6" height="11" rx="1.5" fill="currentColor" fill-opacity="0.25")
      path(d="M2.5 12 H21")
      path(d="M17.5 8.5 L21 12 L17.5 15.5")
    template(v-else-if="name === 'freeze'")
      path(d="M12 2.5 V21.5 M3.8 7.3 L20.2 16.7 M3.8 16.7 L20.2 7.3")
      path(d="M9.5 4 L12 6.5 L14.5 4 M9.5 20 L12 17.5 L14.5 20")
    template(v-else-if="name === 'splash'")
      circle(cx="12" cy="12" r="3.5" fill="currentColor" fill-opacity="0.3")
      circle(cx="12" cy="3.8" r="1.6")
      circle(cx="12" cy="20.2" r="1.6")
      circle(cx="3.8" cy="12" r="1.6")
      circle(cx="20.2" cy="12" r="1.6")
    template(v-else-if="name === 'crush'")
      path(d="M13.5 2.5 L21.5 10.5 L17.5 14.5 L9.5 6.5 Z" fill="currentColor" fill-opacity="0.3")
      path(d="M12.5 9.5 L3.5 18.5 L5.5 20.5 L14.5 11.5")
    template(v-else-if="name === 'chain'")
      path(d="M13.5 2.5 L5 13.5 H11 L10 21.5 L19 10 H13 Z" fill="currentColor" fill-opacity="0.25")
    template(v-else-if="name === 'poison'")
      path(d="M12 2.5 C12 2.5 5 10.5 5 15 A7 7 0 0 0 19 15 C19 10.5 12 2.5 12 2.5 Z" fill="currentColor" fill-opacity="0.25")
      circle(cx="10" cy="15" r="1.5")
      circle(cx="14" cy="12" r="1")
    template(v-else-if="name === 'midas'")
      circle(cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity="0.25")
      circle(cx="12" cy="12" r="5")
      path(d="M12 9.5 V14.5")
    template(v-else-if="name === 'eruption'")
      path(d="M2.5 21 L8.5 11 H15.5 L21.5 21 Z" fill="currentColor" fill-opacity="0.25")
      path(d="M12 9 V3 M8.5 8 L6 4.5 M15.5 8 L18 4.5")
</template>
