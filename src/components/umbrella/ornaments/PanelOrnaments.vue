<script setup lang="ts">
/** A modal sheet's dressing in the scene's theme (nothing in the plain UI). See the two themes' components. */
import { useUiTheme } from '@/umbrella/ui/theme'
import LanternPanelOrnaments from './LanternPanelOrnaments.vue'
import ClayPanelOrnaments from './ClayPanelOrnaments.vue'

withDefaults(defineProps<{ crest?: boolean; hang?: boolean }>(), { crest: true, hang: true })
const theme = useUiTheme()
</script>

<template>
  <LanternPanelOrnaments v-if="theme === 'lantern'" :crest="crest" :tassels="hang" />
  <ClayPanelOrnaments v-else-if="theme === 'clay'" :crest="crest" :drops="hang" />
</template>
