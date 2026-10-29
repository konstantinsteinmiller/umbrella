// The painted sheets this build ships: the kite build's folder. The lantern
// build aliases this module to shipped-lantern.ts (vite.config.ts), so each
// build's glob — and so its bundle — holds only its own paint.
export const files = import.meta.glob('../../assets/umbrella-art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
