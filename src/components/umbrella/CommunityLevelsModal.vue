<script setup lang="ts">
/**
 * Community levels: players' submitted levels, best rated first, newest or most
 * played on request, a page at a time. "Create a level" jumps to the editor,
 * where levels are submitted (5 per week). Only shown where the build may talk
 * to the level server (not Poki / YouTube Playables — see community.ts).
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { getLevel, listLevels, type CommunityLevelMeta, type CommunityPage, type CommunitySort } from '@/umbrella/community'
import { decodeLevel } from '@/umbrella/levelCode'
import type { CustomPlay } from '@/umbrella/customLevels'

const emit = defineEmits<{ close: []; play: [p: CustomPlay] }>()
const { t } = useI18n()
const router = useRouter()

const PAGE_SIZE = 8
const SORTS: { id: CommunitySort; key: string }[] = [
  { id: 'rating', key: 'sortRating' },
  { id: 'newest', key: 'sortNewest' },
  { id: 'plays', key: 'sortPlays' }
]
const sort = ref<CommunitySort>('rating')
const page = ref(1)
const data = ref<CommunityPage | null>(null)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const opening = ref<string | null>(null)
const openError = ref(false)
const pages = () => Math.max(1, Math.ceil((data.value?.total ?? 0) / PAGE_SIZE))

let request = 0
const load = async () => {
  const mine = ++request
  state.value = 'loading'
  const res = await listLevels(sort.value, page.value, PAGE_SIZE)
  if (mine !== request) return
  data.value = res
  state.value = res ? 'ready' : 'error'
}
watch(sort, () => { page.value = 1; void load() })
watch(page, () => void load())

const play = async (m: CommunityLevelMeta) => {
  opening.value = m.id
  openError.value = false
  const full = await getLevel(m.id)
  const shared = full && (await decodeLevel(full.code))
  opening.value = null
  if (!shared) { openError.value = true; return }
  emit('play', { level: shared.level, name: m.name, communityId: m.id })
}
const create = () => void router.push('/editor')
const stars = (avg: number) => '★★★★★'.slice(0, Math.round(avg)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(avg))

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => {
  void load()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="cl-back" @click.self="emit('close')">
    <div class="cl" role="dialog" aria-modal="true" :aria-label="t('umbrella.community.title')">
      <div class="cl-head">
        <b>🌐 {{ t('umbrella.community.title') }}</b>
        <button class="cl-x" :aria-label="t('umbrella.close')" @click="emit('close')">✕</button>
      </div>

      <div class="cl-create">
        <p>{{ t('umbrella.community.createHint') }}</p>
        <button class="cl-btn yellow" @click="create">✎ {{ t('umbrella.community.create') }}</button>
      </div>

      <div class="cl-sorts" role="tablist" :aria-label="t('umbrella.community.sortLabel')">
        <button
          v-for="s in SORTS"
          :key="s.id"
          role="tab"
          class="cl-tab"
          :class="{ on: sort === s.id }"
          :aria-selected="sort === s.id"
          @click="sort = s.id"
        >{{ t(`umbrella.community.${s.key}`) }}</button>
      </div>

      <p v-if="state === 'loading'" class="cl-note">{{ t('umbrella.community.loading') }}</p>
      <div v-else-if="state === 'error'" class="cl-note">
        <p>{{ t('umbrella.community.error') }}</p>
        <button class="cl-btn" @click="load">{{ t('umbrella.community.retry') }}</button>
      </div>
      <p v-else-if="!data?.items.length" class="cl-note">{{ t('umbrella.community.empty') }}</p>
      <ul v-else class="cl-list">
        <li v-for="m in data.items" :key="m.id" class="cl-row">
          <div class="cl-info">
            <div class="cl-name">{{ m.name }}</div>
            <div class="cl-meta">
              {{ t('umbrella.community.by', { author: m.author || t('umbrella.community.anonymous') }) }}
              · <span class="cl-stars" :aria-label="t('umbrella.rate.stars', { n: m.ratingAvg.toFixed(1) })">{{ stars(m.ratingAvg) }}</span>
              {{ m.ratingCount ? m.ratingAvg.toFixed(1) : '' }}
              ({{ t('umbrella.community.ratings', m.ratingCount) }})
              · {{ t('umbrella.community.plays', m.plays) }}
            </div>
          </div>
          <button class="cl-btn green" :disabled="opening !== null" @click="play(m)">
            {{ opening === m.id ? t('umbrella.community.opening') : `▶ ${t('umbrella.community.play')}` }}
          </button>
        </li>
      </ul>
      <p v-if="openError" class="cl-note warn">{{ t('umbrella.community.broken') }}</p>

      <div v-if="state === 'ready' && pages() > 1" class="cl-pager">
        <button class="cl-btn" :disabled="page <= 1" :aria-label="t('umbrella.community.prev')" @click="page--">‹</button>
        <span>{{ t('umbrella.community.page', { page, pages: pages() }) }}</span>
        <button class="cl-btn" :disabled="page >= pages()" :aria-label="t('umbrella.community.next')" @click="page++">›</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cl-back {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.6);
}
.cl {
  width: min(620px, 100%);
  max-height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: #1a1f2e;
  color: #fff;
}
.cl-head { display: flex; align-items: center; justify-content: space-between; font-size: 20px; }
.cl-x { width: 36px; height: 36px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); font-size: 18px; }
.cl-create {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(234, 179, 8, 0.12);
  border: 1px solid rgba(234, 179, 8, 0.4);
}
.cl-create p { margin: 0; flex: 1; font-size: 14px; opacity: 0.9; }
.cl-sorts { display: flex; gap: 6px; flex-wrap: wrap; }
.cl-tab { padding: 6px 12px; border-radius: 99px; background: rgba(255, 255, 255, 0.08); font-size: 14px; }
.cl-tab.on { background: #2563eb; font-weight: 700; }
.cl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cl-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); }
.cl-info { flex: 1; min-width: 0; }
.cl-name { font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-meta { font-size: 12px; opacity: 0.75; }
.cl-stars { color: #facc15; letter-spacing: 1px; }
.cl-btn { padding: 8px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); font-weight: 700; white-space: nowrap; }
.cl-btn:disabled { opacity: 0.45; }
.cl-btn.green { background: #059669; }
.cl-btn.yellow { background: #eab308; color: #000; }
.cl-note { margin: 0; text-align: center; opacity: 0.8; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.cl-note.warn { color: #fbbf24; }
.cl-pager { display: flex; align-items: center; justify-content: center; gap: 12px; }
</style>
