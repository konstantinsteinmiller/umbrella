// The painted sheets of the clay build ("Rainy Day Post", clay.ts): aliased
// over shipped.ts in that build only (vite.config.ts).
export const files = import.meta.glob('../../assets/umbrella-art-clay/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
