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
  | 'recall' | 'fast' | 'codex' | 'collection' | 'daily' | 'supply' | 'gear'
  | 'shield' | 'revive' | 'warcry' | 'ball' | 'flag' | 'skull' | 'lock' | 'check' | 'star'

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
    //- Recall — balls drop straight back to the launcher line.
    template(v-else-if="name === 'recall'")
      path(d="M12 3 V15")
      path(d="M6.5 10 L12 15.5 L17.5 10")
      path(d="M4 20.5 H20")
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
</template>
