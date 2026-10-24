// Every NON-kite build resolves `@/umbrella/art/install` here (vite.config.ts
// alias): no painted layer, no sheets, nothing to load — the vector drawing is
// all there is.
export const startKiteArt = (): Promise<void> => Promise.resolve()
