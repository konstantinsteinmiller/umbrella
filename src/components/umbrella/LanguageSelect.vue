<script setup lang="ts">
/**
 * Language dropdown (game settings and the level editor). Shows every language
 * by its own name, so each one is findable whatever is on screen. A pick is the
 * player's explicit choice: stored through useUser (and so beats the portal's
 * locale on the next visit) and applied at once through setI18nLocale.
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import useUser from '@/use/useUser'
import { setI18nLocale } from '@/i18n'
import { LANGUAGES, LANGUAGE_AUTONYMS } from '@/utils/enums'

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
</style>
