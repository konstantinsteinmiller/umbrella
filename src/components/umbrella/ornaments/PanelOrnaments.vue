<script setup lang="ts">
/** A modal sheet's dressing in the scene's theme (nothing in the plain UI). See the theme's component. */
import { useUiTheme } from '@/umbrella/ui/theme'
import LanternPanelOrnaments from './LanternPanelOrnaments.vue'

withDefaults(defineProps<{ crest?: boolean; hang?: boolean }>(), { crest: true, hang: true })
const theme = useUiTheme()
</script>

<template>
  <LanternPanelOrnaments v-if="theme === 'lantern'" :crest="crest" :tassels="hang" />
</template>
