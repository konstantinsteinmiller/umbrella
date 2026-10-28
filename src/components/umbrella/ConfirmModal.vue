<script setup lang="ts">
/**
 * A confirmation card in the game's own look, for the things the browser's confirm() is too
 * blunt for: an icon medallion, a title, a message, an optional fact list, and two buttons.
 * Esc and a click outside cancel; the safe button is focused first.
 */
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** A big glyph in the medallion. */
  icon?: string
  /** What the confirm button does is destructive (red instead of gold). */
  danger?: boolean
  /** Label / value rows shown under the message (e.g. level name, author). */
  facts?: { label: string; value: string }[]
  /** Disables the buttons while the confirmed action runs. */
  busy?: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()

const cancelBtn = ref<HTMLButtonElement | null>(null)
const onKey = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  e.stopPropagation()
  emit('cancel')
}
onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  cancelBtn.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <div class="cm-back" @pointerdown.self="emit('cancel')">
      <div class="cm" :class="{ danger }" role="alertdialog" aria-modal="true" :aria-label="title">
        <div class="cm-medal" aria-hidden="true"><span>{{ icon ?? '!' }}</span></div>
        <h2 class="cm-title">{{ title }}</h2>
        <p class="cm-text">{{ message }}</p>
        <dl v-if="facts?.length" class="cm-facts">
          <div v-for="f in facts" :key="f.label" class="cm-fact">
            <dt>{{ f.label }}</dt>
            <dd :title="f.value">{{ f.value }}</dd>
          </div>
        </dl>
        <div class="cm-actions">
          <button ref="cancelBtn" type="button" class="cm-btn" :disabled="busy" @click="emit('cancel')">{{ cancelLabel }}</button>
          <button type="button" class="cm-btn primary" :disabled="busy" @click="emit('confirm')">{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cm-back {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 16px;
  background: radial-gradient(circle at 50% 40%, rgba(30, 41, 80, 0.55), rgba(3, 6, 15, 0.86));
  backdrop-filter: blur(6px);
  animation: cm-fade 0.18s ease-out;
}
.cm {
  --accent: #facc15;
  --accent-deep: #d99a06;
  position: relative;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 54px 24px 22px;
  border-radius: 22px;
  color: #f4f6ff;
  text-align: center;
  background: linear-gradient(180deg, #1f2740 0%, #151a2c 100%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 44px color-mix(in srgb, var(--accent) 22%, transparent);
  animation: cm-pop 0.28s cubic-bezier(0.2, 1.4, 0.4, 1);
}
.cm.danger { --accent: #fb7185; --accent-deep: #be123c; }
.cm::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  border-radius: 22px 22px 0 0;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
}
.cm-medal {
  position: absolute;
  top: -30px;
  left: 50%;
  translate: -50% 0;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 28%, #fff3a8, var(--accent) 45%, var(--accent-deep));
  border: 3px solid #fff8d6;
  box-shadow: 0 0 0 3px #1a1f33, 0 8px 22px rgba(0, 0, 0, 0.5), 0 0 26px color-mix(in srgb, var(--accent) 60%, transparent);
  animation: cm-bob 2.6s ease-in-out infinite;
}
.cm.danger .cm-medal { background: radial-gradient(circle at 35% 28%, #ffe4e6, var(--accent) 45%, var(--accent-deep)); border-color: #ffe4e6; }
.cm-medal span { font-size: 30px; font-weight: 800; line-height: 1; color: #3b2400; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5); }
.cm.danger .cm-medal span { color: #4c0519; }
.cm-title { margin: 0; font-size: 22px; line-height: 1.2; letter-spacing: 0.3px; }
.cm-text { margin: 0; font-size: 15px; line-height: 1.45; color: rgba(236, 240, 255, 0.82); }
.cm-facts {
  width: 100%;
  margin: 2px 0 0;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.cm-fact { display: flex; justify-content: space-between; gap: 14px; font-size: 14px; }
.cm-fact dt { color: rgba(236, 240, 255, 0.6); }
.cm-fact dd { margin: 0; max-width: 62%; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent); }
.cm-actions { display: flex; gap: 10px; width: 100%; margin-top: 6px; }
.cm-btn {
  flex: 1;
  padding: 11px 14px;
  border-radius: 12px;
  font: inherit;
  font-weight: 800;
  color: #f4f6ff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  cursor: pointer;
  transition: transform 0.12s, filter 0.12s;
}
.cm-btn:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.15); }
.cm-btn:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
.cm-btn.primary {
  color: #3b2400;
  background: linear-gradient(180deg, #fff3a8, var(--accent) 50%, var(--accent-deep));
  border-color: #fff8d6;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent);
}
.cm.danger .cm-btn.primary { color: #fff; background: linear-gradient(180deg, #fda4af, var(--accent) 50%, var(--accent-deep)); border-color: #ffe4e6; }
.cm-btn:disabled { opacity: 0.5; cursor: default; }
@keyframes cm-fade { from { opacity: 0; } }
@keyframes cm-pop { from { opacity: 0; transform: translateY(14px) scale(0.92); } }
@keyframes cm-bob { 50% { transform: translateY(-3px); } }
@media (prefers-reduced-motion: reduce) {
  .cm, .cm-back, .cm-medal { animation: none; }
}
</style>
