// ─── How the lantern build draws its wind (a designer's view switch) ───────
//
// Two looks for the same currents: the gust streaks (thin strokes with a curl) and the folded paper
// strips of the concept art, printed with chevron arrows. A view choice of this browser only — kept
// in the save, never in a level, never synced to the levels bucket — toggled from the level editor's
// View menu. Leaf module: the renderer reads it every frame.
import { ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'

export type WindStyle = 'gusts' | 'paper'
const KEY = 'umb_wind_style'

// The paper strips are the lantern build's wind; the gust streaks stay one switch away.
export const windStyle = ref<WindStyle>(getState<WindStyle>(KEY, 'paper') === 'gusts' ? 'gusts' : 'paper')

export const setWindStyle = (style: WindStyle): void => {
  windStyle.value = style
  setState(KEY, style)
}
