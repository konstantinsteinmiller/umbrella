<script setup lang="ts">
/**
 * Community levels: players' submitted levels, best rated first, newest or most
 * played on request, a page at a time, as a grid of preview cards (default) or a
 * list. Each level's preview is drawn from its share code (LevelThumb). "Create a level" jumps to the editor,
 * where levels are submitted (5 per week). Only shown where the build may talk
 * to the level server (not Poki / YouTube Playables — see community.ts).
 * In the lantern / clay builds it wears the scene's theme (umbrella/ui/theme.ts).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { deleteLevel, getLevel, listLevels, type CommunityLevelMeta, type CommunityPage, type CommunitySort } from '@/umbrella/community'
import { decodeLevel } from '@/umbrella/levelCode'
import { bucketPassword, editorUnlocked, type CustomPlay } from '@/umbrella/customLevels'
import LevelThumb from './LevelThumb.vue'
import ConfirmModal from './ConfirmModal.vue'
import PanelOrnaments from './ornaments/PanelOrnaments.vue'
import BtnOrnaments from './ornaments/BtnOrnaments.vue'
import UiGlyph from './ornaments/UiGlyph.vue'
import { useUiTheme } from '@/umbrella/ui/theme'

const emit = defineEmits<{ close: []; play: [p: CustomPlay] }>()
const { t } = useI18n()
const router = useRouter()
const theme = useUiTheme()

const PAGE_SIZE = 12
/** Grid of preview cards or a compact list; the player's pick is remembered. */
type Layout = 'grid' | 'list'
const LAYOUT_KEY = 'umb_community_layout'
const readLayout = (): Layout => {
  try { return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}
const layout = ref<Layout>(readLayout())
const setLayout = (l: Layout) => {
  layout.value = l
  try { localStorage.setItem(LAYOUT_KEY, l) } catch { /* private mode: this visit only */ }
}
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
/** The themed builds keep the shown page on screen (dimmed) while another sort or page loads, or
 *  when it fails, so the sheet never collapses to a one-line note and back: no jump, no re-entry. */
const keepList = computed(() => !!theme && !!data.value?.items.length)

let request = 0
const load = async () => {
  const mine = ++request
  state.value = 'loading'
  const res = await listLevels(sort.value, page.value, PAGE_SIZE)
  if (mine !== request) return
  if (res || !keepList.value) data.value = res
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

// ── Moderation (the designer, behind "cmonc"): delete bad, accidental or test submissions, after a
//    confirmation card. English, like the other designer tools. Needs the editor password. ──
const canManage = computed(() => editorUnlocked.value)
const managing = ref(false)
const toDelete = ref<CommunityLevelMeta | null>(null)
const deleting = ref(false)
const manageNote = ref('')
const askDelete = (m: CommunityLevelMeta) => {
  manageNote.value = bucketPassword.value ? '' : 'Set the editor password first (level editor → Editor password…).'
  if (bucketPassword.value) toDelete.value = m
}
const confirmDelete = async () => {
  const m = toDelete.value
  if (!m) return
  deleting.value = true
  const r = await deleteLevel(m.id, bucketPassword.value)
  deleting.value = false
  toDelete.value = null
  if (r === 'deleted' || r === 'not-found') {
    manageNote.value = `Deleted “${m.name}”.`
    // The last level of a page gone: show the page before it.
    if (data.value && data.value.items.length === 1 && page.value > 1) page.value--
    else void load()
  } else {
    manageNote.value = r === 'wrong-password' ? 'Wrong editor password — set it in the level editor (Editor password…).' : 'Could not delete it (offline?) — try again.'
  }
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !toDelete.value) emit('close') }
onMounted(() => {
  void load()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="cl-back u-backdrop" @click.self="emit('close')">
    <!-- The frame holds the theme's ornaments outside the scrolling sheet (plain UI: no box at all). -->
    <div class="cl-frame u-modal">
    <PanelOrnaments />
    <div class="cl u-panel" role="dialog" aria-modal="true" :aria-label="t('umbrella.community.title')">
      <div class="cl-head">
        <b class="u-title"><UiGlyph name="globe" fallback="🌐" /> {{ t('umbrella.community.title') }}</b>
        <button v-if="canManage" class="cl-btn manage u-btn" :class="{ on: managing }" :aria-pressed="managing" title="Delete bad, accidental or test submissions" @click="managing = !managing; manageNote = ''">🛠 {{ managing ? 'Done' : 'Manage' }}</button>
        <button class="cl-x u-icon-btn" :aria-label="t('umbrella.close')" @click="emit('close')"><UiGlyph name="close" fallback="✕" /></button>
      </div>

      <div class="cl-create">
        <p>{{ t('umbrella.community.createHint') }}</p>
        <button class="cl-btn yellow u-btn u-gold" @click="create"><BtnOrnaments /><UiGlyph name="edit" fallback="✎" /> {{ t('umbrella.community.create') }}</button>
      </div>

      <div class="cl-bar">
      <div class="cl-sorts" role="tablist" :aria-label="t('umbrella.community.sortLabel')">
        <button
          v-for="s in SORTS"
          :key="s.id"
          role="tab"
          class="cl-tab u-tab"
          :class="{ on: sort === s.id }"
          :aria-selected="sort === s.id"
          @click="sort = s.id"
        >{{ t(`umbrella.community.${s.key}`) }}</button>
      </div>
      <div class="cl-layouts" role="group" :aria-label="t('umbrella.community.layout')">
        <button class="cl-layout u-tab" :class="{ on: layout === 'grid' }" :aria-pressed="layout === 'grid'" :aria-label="t('umbrella.community.layoutGrid')" :title="t('umbrella.community.layoutGrid')" @click="setLayout('grid')"><UiGlyph name="grid" fallback="▦" /></button>
        <button class="cl-layout u-tab" :class="{ on: layout === 'list' }" :aria-pressed="layout === 'list'" :aria-label="t('umbrella.community.layoutList')" :title="t('umbrella.community.layoutList')" @click="setLayout('list')"><UiGlyph name="list" fallback="☰" /></button>
      </div>
      </div>

      <p v-if="state === 'loading' && !keepList" class="cl-note cl-loading">{{ t('umbrella.community.loading') }}</p>
      <div v-else-if="state === 'error'" class="cl-note">
        <p>{{ t('umbrella.community.error') }}</p>
        <button class="cl-btn u-btn" @click="load"><BtnOrnaments />{{ t('umbrella.community.retry') }}</button>
      </div>
      <p v-else-if="state === 'ready' && !data?.items.length" class="cl-note">{{ t('umbrella.community.empty') }}</p>
      <ul v-if="data?.items.length && (state === 'ready' || keepList)" class="cl-list" :class="[layout, { busy: state === 'loading' }]" :aria-busy="state === 'loading'">
        <li v-for="(m, k) in data.items" :key="m.id" class="cl-row" :style="{ '--i': k }">
          <LevelThumb class="cl-thumb" :code="m.code" :label="m.name" />
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
          <button v-if="managing" class="cl-btn danger u-btn u-primary u-danger" :aria-label="`Delete ${m.name}`" title="Delete this level for everyone" @click="askDelete(m)">🗑</button>
          <button class="cl-btn green u-btn u-primary" :disabled="opening !== null" @click="play(m)">
            <BtnOrnaments /><template v-if="opening === m.id">{{ t('umbrella.community.opening') }}</template><template v-else><UiGlyph name="play" fallback="▶" /> {{ t('umbrella.community.play') }}</template>
          </button>
        </li>
      </ul>
      <p v-if="openError" class="cl-note warn u-warn">{{ t('umbrella.community.broken') }}</p>
      <p v-if="managing && manageNote" class="cl-note warn u-warn" role="status">{{ manageNote }}</p>
      <ConfirmModal
        v-if="toDelete"
        title="Delete this community level?"
        message="It is removed for everyone, with its plays and ratings. This cannot be undone."
        icon="🗑"
        danger
        :busy="deleting"
        :facts="[
          { label: 'Level', value: toDelete.name },
          { label: 'Author', value: toDelete.author || '—' },
          { label: 'Plays', value: String(toDelete.plays) },
          { label: 'Ratings', value: `${toDelete.ratingCount} (${toDelete.ratingAvg.toFixed(1)}★)` }
        ]"
        :confirm-label="deleting ? 'Deleting…' : 'Delete'"
        cancel-label="Cancel"
        @confirm="confirmDelete"
        @cancel="toDelete = null"
      />

      <div v-if="state === 'ready' && pages() > 1" class="cl-pager">
        <button class="cl-btn u-btn" :disabled="page <= 1" :aria-label="t('umbrella.community.prev')" @click="page--"><UiGlyph name="prev" fallback="‹" /></button>
        <span>{{ t('umbrella.community.page', { page, pages: pages() }) }}</span>
        <button class="cl-btn u-btn" :disabled="page >= pages()" :aria-label="t('umbrella.community.next')" @click="page++"><UiGlyph name="next" fallback="›" /></button>
      </div>
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
  width: min(780px, 100%);
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
.cl-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.cl-layouts { display: flex; gap: 4px; }
.cl-layout { width: 34px; height: 30px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); font-size: 16px; }
.cl-layout.on { background: #2563eb; }
.cl-list { list-style: none; margin: 0; padding: 0; }
.cl-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); }
.cl-thumb { flex: none; }
/* List: preview left of the name. */
.cl-list.list { display: flex; flex-direction: column; gap: 6px; }
.cl-list.list .cl-thumb { width: 112px; }
/* Grid (default): cards, preview on top of the name. */
.cl-list.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.cl-list.grid .cl-row { flex-direction: column; align-items: stretch; padding: 8px; }
.cl-list.grid .cl-thumb { width: 100%; }
.cl-list.grid .cl-btn { align-self: stretch; }
.cl-info { flex: 1; min-width: 0; }
.cl-name { font-weight: 700; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-meta { font-size: 12px; opacity: 0.75; }
.cl-stars { color: #facc15; letter-spacing: 1px; }
.cl-btn { padding: 8px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.12); font-weight: 700; white-space: nowrap; }
.cl-btn:disabled { opacity: 0.45; }
.cl-btn.green { background: #059669; }
.cl-btn.yellow { background: #eab308; color: #000; }
.cl-btn.danger { background: #b91c1c; }
.cl-btn.manage { margin-left: auto; margin-right: 8px; padding: 6px 12px; font-size: 14px; }
.cl-btn.manage.on { background: #b45309; }
.cl-note { margin: 0; text-align: center; opacity: 0.8; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.cl-note.warn { color: #fbbf24; }
.cl-pager { display: flex; align-items: center; justify-content: center; gap: 12px; }
/* The plain UI has no frame box: the sheet sits straight in the backdrop. */
.cl-frame { display: contents; }

/* ── Themed (lantern / clay): sheet, buttons, tabs and motion come from umbrella-ui.css ── */
.ui-theme .cl-back { padding: 50px 16px 30px; }
.ui-theme .cl-frame { position: relative; display: flex; flex-direction: column; width: min(800px, 100%); max-height: 100%; }
.ui-theme .cl { width: 100%; flex: 1 1 auto; min-height: 0; max-height: none; padding: 36px 24px 24px; gap: 14px; overscroll-behavior: contain; }
.ui-theme .cl-head { font-size: 24px; gap: 10px; }
.ui-theme .cl-head .u-title { flex: 1; min-width: 0; }
.ui-theme .cl-x { flex: none; width: 38px; height: 38px; font-size: 20px; }
.ui-theme .cl-create { flex-wrap: wrap; gap: 12px 14px; padding: 12px 14px; }
.ui-theme .cl-create p { flex: 1 1 220px; font-size: 15px; line-height: 1.35; }
.ui-theme .cl-create .cl-btn { flex: 1 0 auto; }
.ui-theme .cl-btn { min-height: 44px; padding: 9px 18px; font-size: 16px; }
.ui-theme .cl-btn.yellow,
.ui-theme .cl-btn.green { padding: 9px 38px; }
.ui-clay .cl-btn.yellow,
.ui-clay .cl-btn.green { padding-inline: 22px; }
.ui-theme .cl-tab { min-height: 40px; padding: 7px 16px; font-size: 15px; }
.ui-theme .cl-layout { width: 44px; height: 40px; font-size: 18px; display: grid; place-items: center; }
.ui-theme .cl-list.grid { gap: 14px; }
.ui-theme .cl-row { animation: var(--u-tile-in) 0.5s var(--u-ease-out) backwards; animation-delay: calc(min(var(--i), 12) * 45ms + 160ms); transition: transform var(--u-t) var(--u-ease-spring), filter var(--u-t) ease; }
.ui-theme .cl-row:hover { transform: translateY(-3px); }
.ui-theme .cl-name { font-size: 17px; }
.ui-theme .cl-meta { font-size: 12.5px; opacity: 1; line-height: 1.45; }
.ui-theme .cl-pager { gap: 14px; font-weight: 800; }
@media (max-width: 560px) {
  .ui-theme .cl { padding: 32px 16px 20px; }
  .ui-theme .cl-head { font-size: 21px; }
}
.ui-theme .cl-note { opacity: 1; font-weight: 700; }
/* The first load holds the list's room; later loads keep the shown cards, dimmed, in place. */
.ui-theme .cl-note.cl-loading { min-height: 220px; justify-content: center; }
.ui-theme .cl-list { transition: opacity 0.22s ease, filter 0.22s ease; }
.ui-theme .cl-list.busy { opacity: 0.55; filter: saturate(0.7); pointer-events: none; }
/* Lantern: the create box is a vermilion-ruled inset; each level a night window in a gold hairline. */
.ui-lantern .cl-create { border: 0; border-radius: 4px; background: rgba(214, 69, 44, 0.08); box-shadow: inset 0 0 0 1px rgba(160, 106, 30, 0.55), inset 0 0 0 4px rgba(255, 250, 235, 0.45), inset 0 0 0 5px rgba(214, 69, 44, 0.35); }
.ui-lantern .cl-create p { color: #5b4766; }
.ui-lantern .cl-row { border-radius: 6px; color: #fbf1dc; background: linear-gradient(180deg, #2f2866 0%, #1b163f 100%); box-shadow: 0 0 0 1.5px #2a1d3a, inset 0 0 0 3px #1b163f, inset 0 0 0 4px rgba(232, 180, 80, 0.5), 0 4px 0 1px #110d2a, 0 8px 16px rgba(20, 10, 40, 0.3); }
.ui-lantern .cl-row:hover { filter: drop-shadow(0 0 10px rgba(255, 170, 70, 0.45)); }
.ui-lantern .cl-thumb { box-shadow: 0 0 0 1px #e8b450, 0 0 0 2.5px #2a1d3a; border-radius: 3px; }
.ui-lantern .cl-meta { color: rgba(251, 241, 220, 0.78); }
.ui-lantern .cl-stars { color: #ffd23f; }
/* Clay: a mustard recess for "create"; each level a little cream slab with a lip. */
.ui-clay .cl-create { border: 0; border-radius: 18px; background: #f6dfa0; box-shadow: inset 0 3px 6px rgba(140, 100, 20, 0.35), inset 0 -1px 0 rgba(255, 255, 255, 0.8); }
.ui-clay .cl-create p { color: #5a4512; }
.ui-clay .cl-row { border-radius: 18px; color: #2b2f3a; background: radial-gradient(130% 120% at 30% 0%, #fffdf6, #efe4cc); box-shadow: inset 0 2px 0 #fff, inset 0 -3px 6px rgba(130, 100, 55, 0.18), 0 5px 0 #c9b893, 0 10px 16px rgba(20, 25, 45, 0.2); }
.ui-clay .cl-thumb { border-radius: 12px; box-shadow: 0 0 0 3px #2f5fa8, 0 3px 0 3px #173464; }
.ui-clay .cl-meta { color: #66615a; }
.ui-clay .cl-stars { color: #e09a10; }
</style>
