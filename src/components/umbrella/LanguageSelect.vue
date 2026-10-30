<script setup lang="ts">
/**
 * Language dropdown (game settings and the level editor). Shows every language
 * by its own name, so each one is findable whatever is on screen. A pick is the
 * player's explicit choice: stored through useUser (and so beats the portal's
 * locale on the next visit) and applied at once through setI18nLocale.
 * In the game's lantern / clay builds it wears the scene's theme: a lacquer or
 * clay field with a themed knob (the native popup stays, for accessibility).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import { LANGUAGES, LANGUAGE_AUTONYMS } from '@/utils/enums'
import SelectOrnaments from './ornaments/SelectOrnaments.vue'

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { t, locale } = useI18n({ useScope: 'global' })
const { setSettingValue } = useUser()
const options = LANGUAGES.map((code) => ({ code, label: LANGUAGE_AUTONYMS[code] ?? code }))
const current = computed(() => locale.value)

const choose = async (code: string) => {
  setSettingValue('language', code)
  const i18n = (window as unknown as { __i18n?: Parameters<typeof setI18nLocale>[0] }).__i18n
  if (i18n) await setI18nLocale(i18n, code)
  else locale.value = code
}
</script>

<template>
  <label class="lang" :class="{ compact }">
    <span :class="compact ? 'lang-icon' : 'lang-label'">{{ compact ? '🌐' : t('options.language') }}</span>
    <select
      class="lang-select"
      :value="current"
      :aria-label="t('options.language')"
      @change="choose(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="o in options" :key="o.code" :value="o.code" :lang="o.code">{{ o.label }}</option>
    </select>
    <SelectOrnaments />
  </label>
</template>

<style scoped>
.lang { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.lang.compact { gap: 4px; }
.lang-label { font-weight: 700; }
.lang-select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.45);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.lang.compact .lang-select { padding: 4px 6px; border-radius: 6px; }
.lang-select option { background: #1a1f2e; color: #fff; }

/* ── Themed (lantern / clay): the knob (SelectOrnaments) sits over the field's end ── */
.ui-theme .lang { position: relative; gap: 14px; }
.ui-theme .lang-label { font-weight: 800; font-size: 18px; }
.ui-theme .lang-select {
  appearance: none;
  -webkit-appearance: none;
  min-width: 0;
  max-width: 62%;
  min-height: 46px;
  padding-block: 8px;
  border: 0;
  font-weight: 800;
  text-overflow: ellipsis;
  transition: transform var(--u-t) var(--u-ease-spring), filter var(--u-t) ease;
}
.ui-theme .lang-select:hover { transform: translateY(var(--u-lift)); filter: brightness(1.1); }
.ui-theme .lang-select:active { transform: scale(var(--u-press)); }
.ui-theme .lang:hover :deep(.so) { transform: rotate(-12deg) scale(1.06); }
.ui-theme .lang-select:focus-visible + :deep(.so) { transform: scale(1.12); }
/* Lacquer and gold leaf, a kumo curl at the start. */
.ui-lantern .lang-select {
  padding-inline: 34px 46px;
  border-radius: 7px;
  color: #fbf1dc;
  text-shadow: 0 1px 0 rgba(10, 6, 30, 0.6);
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 22'%3E%3Cpath d='M1.5 11H5a5.2 5.2 0 0 1 10.4 0a4 4 0 0 1 -8 0a2.9 2.9 0 0 1 5.8 0a1.8 1.8 0 0 1 -3.6 0a.8.8 0 0 1 1.6 0' fill='none' stroke='%23e8b450' stroke-width='1.6' stroke-linecap='round'/%3E%3Cpath d='M15.4 11C17.4 11 18.6 8.4 22.4 8.6M16 14.2c2 .8 4 .6 5.6 -.4' fill='none' stroke='%23e8b450' stroke-width='1.1' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat left 9px center / 21px 19px,
    linear-gradient(180deg, #3a3178 0%, #272055 52%, #1b163f 100%);
  box-shadow: inset 0 0 0 1px rgba(232, 180, 80, 0.45), 0 0 0 1.5px #2a1d3a, 0 0 0 3px #e8b450, 0 0 0 4.2px #2a1d3a, 0 6px 14px rgba(12, 6, 30, 0.35);
}
.ui-lantern .lang-select:dir(rtl) { background-position: right 9px center, 0 0; }
.ui-lantern .lang-select:focus-visible { outline: 2.5px solid var(--u-focus); outline-offset: 6px; }
.ui-lantern .lang-select option { background: #1b163f; color: #fbf1dc; }
/* A soft raised postal-blue clay pill: bevel, slim rim into its lip, a glossy highlight along the top. */
.ui-clay .lang-select {
  padding-inline: 18px 44px;
  border-radius: 999px;
  color: #fffaf0;
  text-shadow: 0 1px 0 rgba(15, 30, 60, 0.55);
  background:
    radial-gradient(46% 40% at 38% 8%, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0) 75%),
    radial-gradient(140% 120% at 50% 0%, #86aae4 0%, #4373bd 36%, #2f5fa8 62%, #24508f 100%);
  box-shadow: inset 0 2px 1px rgba(255, 255, 255, 0.42), inset 0 -4px 3px rgba(10, 20, 50, 0.26), 0 0 0 1.5px #163463, 0 5px 0 0.5px #163463, 0 11px 16px rgba(15, 20, 40, 0.3);
}
.ui-clay .lang-select:focus-visible { outline: 3px solid var(--u-focus); outline-offset: 3px; }
.ui-clay .lang-select option { background: #fffaf0; color: #2b2f3a; }
</style>
