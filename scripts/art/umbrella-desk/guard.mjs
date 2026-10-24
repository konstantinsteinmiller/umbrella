/**
 * ─── Did Gemini actually EDIT from the attachments? ─────────────────────────
 *
 * The desk's worst failure is not a missing image, it is a WRONG one. When
 * Gemini runs a model that cannot take images in (the picker reading
 * "Flash-Lite", a second account, a quota fallback), it answers "I can't edit
 * images for you yet" — and the old desk then nudged it ("generate the image
 * now"), it painted from the text alone, and the desk filed that invention
 * over a good painting. The same model can also reply WITH an image and the
 * refusal in words beside it.
 *
 * So two checks, both pure (the browser driver feeds them strings), both
 * stopping the queue rather than failing one job — nothing the next job does
 * will go differently on the same model:
 *
 *   · `classifyReply(text)` — 'quota' · 'signed_out' · 'refused' · 'text'.
 *     'refused' is any reply saying the attachments were not or cannot be
 *     used, in the languages the account's UI may be set to. It is checked
 *     on EVERY reply, image or not.
 *   · `checkModel(label, gemini)` — the model picker's label against
 *     `gemini.allowedModels` / `gemini.deniedModels` (art-desk.config.json).
 *     `ok: null` when the label could not be read.
 *
 * There is NO nudge any more ("generate the image now" in the same chat).
 * Measured 2026-10-04: even on an allowed model with a plain text reply, the
 * nudged return painted from the text alone (sector 7-3: a different scene),
 * changed the structures (7-4), and after a refusal invented a 5-5. A reply
 * without an image fails the job — nothing written — and the queue either
 * moves on or re-runs the SAME job from a FRESH chat that re-sends every
 * attachment. See `noImagePlan`.
 */

// What a quota / sign-out reply looks like (moved here from gemini.mjs).
export const QUOTA = /\b(limit|limits|quota|kontingent)\b|too many|zu viele|try again (later|tomorrow)|später (erneut|noch einmal)|morgen (wieder|erneut)|come back tomorrow/i
export const SIGNED_OUT = /signed out|sign in to|melde dich an|abgemeldet/i

const A = "['’]" // straight or curly apostrophe
const NEAR = '[^.!?。！？\\n]{0,48}' // within one sentence

/**
 * Refusals to EDIT / to USE the attached images. Each entry is one phrase
 * family; matching is case-insensitive. Fixture replies live in
 * tests/meta/artDeskGuard.test.ts — add the new wording there first when
 * Gemini finds another way to say no.
 */
export const REFUSALS = [
  // ── English ──
  // "I can't edit images for you yet", "I'm not able to modify the uploaded photo",
  // "I cannot see the attachment", "I'm unable to process images".
  new RegExp(`\\bi\\b${NEAR}\\b(can${A}?t|cannot|can not|unable to|not able to|don${A}?t have the ability to)\\b${NEAR}\\b(edit|modify|alter|change|retouch|work with|use|see|view|open|access|read|process|look at|create|generate|make|draw|paint)\\b${NEAR}\\b(image|images|photo|photos|picture|pictures|attachment|attachments|upload|uploads|uploaded|file|files)\\b`, 'i'),
  /\b(image|photo|picture)[- ]editing (is|isn['’]t|is not)\b[^.!?\n]{0,30}\b(not )?(available|supported|possible)/i,
  /\b(editing|uploading) (images|photos|pictures) (is|isn['’]t|is not) (not )?(yet )?(available|supported)/i,
  /\bi (don['’]t|do not|can['’]t|cannot) see (any|an|the|your)\b[^.!?\n]{0,20}\b(image|images|attachment|attachments|photo|picture|file)/i,
  /\b(no|without (an|the|any)) (image|images|attachment|attachments|reference) (was|were|is|are)?\s*(attached|provided|uploaded|shared|included)/i,
  /\b(attachment|attachments|images?|uploads?|files?) (was not|were not|is not|are not|wasn['’]t|weren['’]t|isn['’]t|aren['’]t|did not|didn['’]t|could not be|couldn['’]t be|failed to) (be )?(attach|attached|upload|uploaded|receive|received|load|loaded|process|processed|open|opened|come through)\b/i,
  /\bi['’]?m (just|only) a (large )?language model\b/i,
  /\bi['’]?m a text[- ]based\b/i,
  /\bi can only (work with|process|understand|read|handle) text\b/i,
  /\bi['’]?m still learning\b[^.!?\n]{0,40}\b(can['’]?t|cannot)\b/i,
  /\bi can['’]?t (help with that|do that) (right now|yet)\b/i,
  /\b(can['’]?t|cannot|unable to) (generate|create|make) images? (for you )?(yet|right now|at the moment)\b/i,
  // The plain-chat model with the image tool OFF (2026-10-04): "I cannot
  // directly create, render, or generate image files. However, if you have an
  // image generation tool…, here is a … prompt optimized for image generators".
  /\b(can['’]?t|cannot|unable to|not able to)\b[^.!?\n]{0,40}\b(create|render|generate|produce|output|draw)\b[^.!?\n]{0,30}\bimage files?\b/i,
  /\bif you have (access to )?an? (ai )?image[- ](generation|generating|creation) (tool|model|app|service)\b/i,
  /\bprompt[^.!?\n]{0,40}\b(optimi[sz]ed for|to use with|you can (use|paste) (in|into|with))\b[^.!?\n]{0,20}\bimage (generators?|generation tools?|models?)\b/i,
  /\bi['’]?m a text[- ]only\b|\bi (only|can only) (produce|output|generate) text\b/i,
  // ── German ──
  /\bich kann\b[^.!?\n]{0,40}\b(keine|kein|nicht)\b[^.!?\n]{0,40}\b(bild|bilder|fotos?|anh(ä|ae)nge?|dateien?)\b[^.!?\n]{0,30}\b(bearbeiten|ver(ä|ae)ndern|sehen|(ö|oe)ffnen|verwenden|nutzen|lesen|verarbeiten|erstellen|generieren)\b/i,
  /\bich kann\b[^.!?\n]{0,40}\b(bild|bilder|fotos?|anh(ä|ae)nge?|dateien?)\b[^.!?\n]{0,30}\bnicht\b[^.!?\n]{0,20}\b(bearbeiten|ver(ä|ae)ndern|sehen|(ö|oe)ffnen|verwenden|nutzen|lesen|verarbeiten|erstellen|erzeugen|generieren|rendern|zeichnen|malen)\b/i,
  /\bich kann (dir )?(dabei |damit )?(leider )?(noch )?nicht helfen\b/i,
  /\bbildbearbeitung ist\b[^.!?\n]{0,30}\bnicht\b/i,
  /\bich bin (nur|lediglich) ein (gro(ß|ss)es )?sprachmodell\b/i,
  /\bich sehe (kein|keine|keinen)\b[^.!?\n]{0,20}\b(bild|anhang|datei|foto)/i,
  /\bich lerne (noch|gerade noch)\b/i,
  // The image tool OFF, in German: "Ich kann keine Bilddateien direkt
  // erstellen … Falls du ein Tool zur Bildgenerierung hast, hier ist ein Prompt".
  /\bich kann\b[^.!?\n]{0,40}\b(keine|nicht)\b[^.!?\n]{0,40}\bbild(dateien|datei|er)?\b[^.!?\n]{0,30}\b(erstellen|erzeugen|generieren|rendern|zeichnen|malen|ausgeben)\b/i,
  /\b(falls|wenn) (du|sie) (zugriff auf )?(ein(en)?|eine) (ki-)?(bildgenerator|bildgenerierungs-?(tool|programm|dienst)|bild-?generator|tool zur bilderstellung|tool zur bildgenerierung|bildgenerierungstool)\b/i,
  /\bprompt[^.!?\n]{0,40}\b(f(ü|ue)r|in|mit) (einen |einem |deinen |deinem )?(ki-)?bild-?generator(en)?\b/i,
  // ── French ──
  /\bje ne (peux|suis) pas\b[^.!?\n]{0,40}\b(modifier|retoucher|(é|e)diter|voir|ouvrir|utiliser|traiter|g(é|e)n(é|e)rer|cr(é|e)er)\b[^.!?\n]{0,30}\b(images?|photos?|pi(è|e)ces? jointes?|fichiers?)\b/i,
  /\bje (ne suis qu['’]un|suis juste un) mod(è|e)le de langage\b/i,
  // ── Spanish ──
  /\bno (puedo|soy capaz de)\b[^.!?\n]{0,40}\b(editar|modificar|retocar|ver|abrir|usar|procesar|generar|crear)\b[^.!?\n]{0,30}\b(im(á|a)genes?|fotos?|archivos?|adjuntos?)\b/i,
  /\b(solo|s(ó|o)lo) soy un modelo de lenguaje\b/i,
  // ── Italian ──
  /\bnon (posso|sono in grado di)\b[^.!?\n]{0,40}\b(modificare|ritoccare|vedere|aprire|usare|elaborare|generare|creare)\b[^.!?\n]{0,30}\b(immagin[ei]|foto|allegat[oi]|file)\b/i,
  /\bsono solo un modello linguistico\b/i,
  // ── Portuguese ──
  /\bn(ã|a)o (posso|consigo|sou capaz de)\b[^.!?\n]{0,40}\b(editar|modificar|ver|abrir|usar|processar|gerar|criar)\b[^.!?\n]{0,30}\b(imagens?|fotos?|arquivos?|anexos?)\b/i,
  /\bsou apenas um modelo de linguagem\b/i,
  // ── Dutch ──
  /\bik kan\b[^.!?\n]{0,40}\b(geen|niet)\b[^.!?\n]{0,40}\b(afbeeldingen?|foto['’]?s|bijlagen?|bestanden?)\b[^.!?\n]{0,20}\b(bewerken|aanpassen|zien|openen|gebruiken|maken|genereren)\b/i,
  // ── Polish (no  after a non-ASCII letter: JS word boundaries are ASCII-only) ──
  /\bnie (mog(ę|e)|potrafi(ę|e))[^.!?\n]{0,40}\b(edytowa(ć|c)|modyfikowa(ć|c)|zobaczy(ć|c)|otworzy(ć|c)|generowa(ć|c)|tworzy(ć|c))[^.!?\n]{0,30}\b(obraz(y|ów|ow)?|zdj(ę|e)(ć|c|cia)|za(łą|la)cznik(i|ów|ow)?)/i,
  // ── Turkish ──
  /\bg(ö|o)rsel(leri|i)?\b[^.!?\n]{0,30}\b(d(ü|u)zenleyemiyorum|g(ö|o)remiyorum|olu(ş|s)turam(ı|i)yorum)\b/i,
  // ── Russian (no \b: JS word boundaries are ASCII-only) ──
  /не (могу|умею|в состоянии)[^.!?\n]{0,40}(редактировать|изменять|изменить|обработать|обрабатывать|видеть|увидеть|открыть|создавать|генерировать)[^.!?\n]{0,30}(изображени|картин|фото|вложени|файл)/i,
  /я (всего лишь|только) (большая )?языковая модель/i,
  // ── Japanese / Chinese / Korean ──
  /画像[^。！？\n]{0,20}(編集|加工|処理|生成)[^。！？\n]{0,20}(できません|出来ません|できない)/,
  /(无法|不能|还不能|暂时无法|無法|還不能)[^。！？\n]{0,20}(编辑|編輯|修改|处理|處理|查看|生成)[^。！？\n]{0,10}(图片|图像|圖片|圖像|照片)/,
  /(이미지|사진)[^.!?\n]{0,20}(편집|수정|생성)[^.!?\n]{0,20}(수 없|못)/
]

/** 'quota' · 'signed_out' · 'refused' · 'text' (an ordinary reply). */
export const classifyReply = (text = '') => {
  const t = String(text ?? '')
  if (!t.trim()) return 'text'
  if (QUOTA.test(t)) return 'quota'
  if (SIGNED_OUT.test(t)) return 'signed_out'
  if (REFUSALS.some((re) => re.test(t))) return 'refused'
  return 'text'
}

/** The defaults when art-desk.config.json says nothing (see config.mjs). */
export const MODEL_DEFAULTS = {
  // Matched case-insensitively as substrings of the picker's label. The
  // picker shows a short mode name ("Fast", "Thinking", "Pro") or a model
  // name ("2.5 Flash", "Nano Banana").
  allowedModels: ['Fast', 'Flash', 'Thinking', 'Pro', 'Nano Banana', 'Image'],
  // Checked FIRST, so "Flash-Lite" is refused although "Flash" is allowed.
  deniedModels: ['Lite'],
  // true: a picker the desk cannot read stops the queue too.
  requireModelLabel: false
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * { ok: true | false | null, label, why }. `null` = the label could not be
 * read (selector drift) — not proof of a bad model, but not proof of a good
 * one either, so it disables the nudge.
 */
export const checkModel = (label, gemini = {}) => {
  const allowed = gemini.allowedModels ?? MODEL_DEFAULTS.allowedModels
  const denied = gemini.deniedModels ?? MODEL_DEFAULTS.deniedModels
  const l = norm(label)
  if (!l) return { ok: null, label: '', why: 'the model picker could not be read' }
  const low = l.toLowerCase()
  const hitDenied = denied.find((d) => d && low.includes(String(d).toLowerCase()))
  if (hitDenied) return { ok: false, label: l, why: `the model picker reads "${l}" (denied: "${hitDenied}")` }
  const hitAllowed = allowed.find((a) => a && low.includes(String(a).toLowerCase()))
  if (!hitAllowed) return { ok: false, label: l, why: `the model picker reads "${l}", which is not on the allow-list (${allowed.join(', ')})` }
  return { ok: true, label: l, why: null }
}

/**
 * The picker's label from what the page shows. Its button reads "Gemini Flash"
 * as text and "Modusauswahl öffnen, derzeit ausgewählt: Gemini Flash" /
 * "Open mode picker, currently selected: Fast" as aria-label; the text wins,
 * and an aria-label is cut to what follows its last colon. Either may be
 * empty for a second after a new chat opens — the caller polls.
 */
export const pickerLabel = ({ text, aria } = {}) => {
  const t = norm(text)
  if (t) return t
  const a = norm(aria)
  if (!a) return ''
  const i = a.lastIndexOf(':')
  return i >= 0 ? a.slice(i + 1).trim() : a
}

/**
 * ─── The image-creation TOOL ─────────────────────────────────────────────────
 *
 * Gemini's plain chat answers an image brief in words ("I cannot directly
 * create, render, or generate image files…") unless the chat has its image
 * TOOL on: "Uploads & Tools" (+) → "Bild erstellen" / "Create image", which
 * puts a "Bilder" chip above the prompt box. The tool is per chat, and a NEW
 * chat drops it — so the desk turns it on for every job and refuses to send
 * without the chip. Matched by the menu item's ICON first (`image_create`,
 * the same in every UI language), by its label second.
 */
export const IMAGE_TOOL_DEFAULTS = {
  // false: never touch the tools menu (a model that paints by default).
  required: true,
  icons: ['image_create'],
  labels: ['Bild erstellen', 'Bilder erstellen', 'Create image', 'Create images', 'Bilder', 'Images', 'Image'],
  // null = gemini.mjs's own selectors.
  menuButtonSelector: null
}

const matchesTool = ({ icon, label } = {}, tool) => {
  const icons = (tool.icons ?? []).map((s) => String(s).toLowerCase())
  if (icon && icons.includes(String(icon).toLowerCase())) return true
  const l = norm(label).toLowerCase()
  return !!l && (tool.labels ?? []).some((s) => norm(s).toLowerCase() === l)
}

/** Index of the image tool among the tools menu's items ({ icon, label, selected }), or -1. */
export const findImageTool = (items = [], tool = IMAGE_TOOL_DEFAULTS) => {
  const t = { ...IMAGE_TOOL_DEFAULTS, ...tool }
  const byIcon = items.findIndex((it) => it?.icon && t.icons.map((s) => s.toLowerCase()).includes(String(it.icon).toLowerCase()))
  return byIcon >= 0 ? byIcon : items.findIndex((it) => matchesTool({ label: it?.label }, t))
}

/** Is the image tool on? `chips` are the tool chips above the prompt box ({ icon, label }). */
export const imageToolActive = (chips = [], tool = IMAGE_TOOL_DEFAULTS) => {
  const t = { ...IMAGE_TOOL_DEFAULTS, ...tool }
  return chips.some((c) => matchesTool(c, t))
}

export const TOOL_STATUS = 'Gemini\'s image tool ("Bild erstellen" / "Create image") could not be turned on for this chat — not sending a job the plain chat would answer in words'

/**
 * ─── A reply WITHOUT an image ────────────────────────────────────────────────
 *
 * Never asked again in the same chat. `noImageRetries` (0 or 1; more is
 * clamped to 1) re-runs the same job from a fresh chat with all its
 * attachments, after `noImagePauseSeconds`; otherwise the queue moves on.
 */
export const NO_IMAGE_STATUS = 'no image — not re-asked'
export const NO_IMAGE_DEFAULTS = { noImageRetries: 1, noImagePauseSeconds: 120 }

/**
 * What the queue does after the job's `tries`-th reply without an image
 * (1 = the first): `{ retry: true, waitMs }` — same job, fresh chat, after
 * the pause — or `{ retry: false }` — drop it and go on to the next one.
 */
export const noImagePlan = ({ tries, gemini = {} }) => {
  const n = Number(gemini.noImageRetries ?? NO_IMAGE_DEFAULTS.noImageRetries)
  const retries = Number.isFinite(n) ? Math.min(1, Math.max(0, Math.floor(n))) : NO_IMAGE_DEFAULTS.noImageRetries
  const s = Number(gemini.noImagePauseSeconds ?? NO_IMAGE_DEFAULTS.noImagePauseSeconds)
  const pause = Number.isFinite(s) && s >= 0 ? s : NO_IMAGE_DEFAULTS.noImagePauseSeconds
  return tries <= retries ? { retry: true, waitMs: pause * 1000 } : { retry: false }
}

export const REFUSED_STATUS = 'Gemini refused image editing — check the model picker/quota'
