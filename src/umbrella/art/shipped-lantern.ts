// The painted sheets of the lantern build ("Paper Moon", lantern.ts): aliased
// over shipped.ts in that build only (vite.config.ts).
export const files = import.meta.glob('../../assets/umbrella-art-lantern/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
