// ─── Is the boot splash gone? ───────────────────────────────────────────────
// FLogoProgress sets this when its backdrop has left the DOM. Things that must
// be seen from their first frame (the intro cutscene) wait for it.
import { ref } from 'vue'

export const splashGone = ref(false)
