// Out-of-band "launch a flying chest now" cue.
//
// `FlyingChest.vue` owns the chest's timer and animation, but the debug cheat
// (`ctrl+shift+alt+c`) has to be able to trigger a launch from outside the
// component — and `useCheats` must not import a Vue component. So the request
// lives here as a plain counter the component watches: bump it, the chest flies.
//
// A counter rather than a boolean so repeated requests each register (a ref set
// to `true` twice fires one watcher callback). The component ignores a request
// while a chest is already in flight.
import { ref } from 'vue'

/** Incremented once per requested launch. Watched by `FlyingChest.vue`. */
export const flyingChestRequests = ref(0)

/** Ask for an immediate flying-chest launch (cheat / QA tooling). */
export const requestFlyingChestSpawn = (): void => {
  flyingChestRequests.value += 1
}
