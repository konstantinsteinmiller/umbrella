/**
 * ─── Driving gemini.google.com ──────────────────────────────────────────────
 *
 * A free Google account's only programmatic route to Nano Banana. The Gemini
 * API lists every image model with "Free Tier: Not available" for output, so
 * without billing the web app is the whole road. This drives it the way the
 * operator did by hand — a new chat, the reference attached, the prompt
 * pasted, send, wait, download — one generation at a time, and the desk's
 * queue spaces them out and caps them per day.
 *
 * THE WINDOW. Real Chrome on a profile of its own (`~/.art-desk/gemini-chrome`
 * by default, shared by every project), launched normally and left running.
 * The desk attaches over the DevTools port only while it paints; the port is
 * read from the `DevToolsActivePort` file Chrome writes into that profile,
 * which is also how the desk knows a window is ITS window and not some other
 * Chrome answering on a guessed port.
 *
 * SIGNING IN happens in the same profile launched PLAIN — no DevTools port,
 * no switch but the profile — because Google refuses a sign-in in any Chrome
 * with a debugging port open ("This browser or app may not be secure"), even
 * with nothing attached to it. Sign in there, close that window, and the
 * session stays in the profile for every launch after.
 *
 * THE SELECTORS are structural — Gemini's Angular element names and classes
 * (`rich-textarea`, `uploader-file-preview`, `model-response`,
 * `message-actions`…) — and never button text or aria-labels. The UI is
 * localised to the account: "Send message" is "Nachricht senden" in one and
 * something else in the next. Found on the live app (Sept 2026); when Google
 * reshapes the page, SEL below is the one place to update.
 *
 * WHAT WAS MEASURED, logged out, before any of this was written:
 *   · a synthetic `paste` carrying a File attaches it (Gemini shows its
 *     one-time "you must have the rights to what you upload" notice first);
 *   · a synthetic paste of TEXT does not reach the Quill editor, but
 *     `keyboard.insertText` lands a 10k-character, multi-line prompt intact
 *     in a few milliseconds, one <p> per line;
 *   · a finished turn grows a `message-actions` bar (copy, regenerate).
 */
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { IMAGE_TOOL_DEFAULTS, NO_IMAGE_STATUS, REFUSED_STATUS, TOOL_STATUS, checkModel, classifyReply, findImageTool, imageToolActive, pickerLabel } from './guard.mjs'
import { imageSize } from './jobs.mjs'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
]

const SEL = {
  editor: 'rich-textarea .ql-editor, rich-textarea [contenteditable="true"]',
  dropZone: 'input-area-v2, input-container',
  // One chip per attachment; it nests a gem-media-attachment, so count chips.
  attachment: 'uploader-file-preview',
  attachmentImg: 'uploader-file-preview img',
  // Turning while the file uploads. Gemini holds the send button until it
  // stops — and for a signed-out session it never does.
  attachmentBusy: 'uploader-file-preview mat-spinner, uploader-file-preview [role="progressbar"], .gem-attachment-loading-container',
  send: '.send-button button, button.send-button',
  userTurn: 'user-query',
  dialog: 'mat-dialog-container',
  dialogPrimary: 'button.mdc-button--unelevated, button.mat-mdc-unelevated-button, button.mat-primary',
  // Google's cookie consent, shown on a profile's first visit. Never answered
  // by the desk: it is the account holder's choice, made once, by hand.
  consent: 'cookie-banner',
  response: 'model-response',
  responseDone: 'message-actions',
  image: 'generated-image img, single-image img, .generated-image img',
  download: 'download-generated-image-button button, button[data-test-id*="download"], button[aria-label*="ownload" i], button[aria-label*="erunterladen" i]',
  signIn: 'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/v3/signin"], a[href*="accounts.google.com/signin"]',
  // The model picker above the prompt box; its label is the model the next
  // turn runs on ("Fast", "Thinking", "2.5 Flash", "Flash-Lite"…). Override
  // with "gemini": { "modelPickerSelector": "…" } when Google renames it.
  // (Oct 2026: a `gem-button` in the HEADER, text "Gemini Flash", aria-label
  // "Modusauswahl öffnen, derzeit ausgewählt: Gemini Flash"; it renders a
  // beat after the prompt box, so it is polled — see model().)
  modelPicker: 'bard-mode-switcher [data-test-id="bard-mode-menu-button"], [data-test-id="bard-mode-menu-button"], [data-test-id="logo-pill-label-container"], bard-mode-switcher button, button.input-area-switch, .input-area-switch-label',
  // The image TOOL (guard.mjs): "+" (Uploads & Tools) opens a menu whose
  // items are `gem-list-item[role=menuitemcheckbox]` with a leading
  // `mat-icon[data-mat-icon-name]`; a tool that is on shows as a chip in the
  // `toolbox-drawer` above the prompt box, and as `.gem-list-item-selected`.
  toolsButton: 'simplified-input-menu button, input-area-v2 gem-icon-button.menu-button button, button[aria-haspopup="menu"][aria-label*="Tools" i]',
  toolsItem: '.cdk-overlay-container [role="menuitemcheckbox"], .cdk-overlay-container [role="menuitem"]',
  // Old layout: a chip above the prompt box. Since 2026-10-06 the active tool
  // is a selected button beside the "+" in the input row.
  toolChip: 'toolbox-drawer gem-attachment, toolbox-drawer gem-button.selected-item-gem-button',
  account: 'a[href*="accounts.google.com/SignOutOptions"], a[aria-label*="Google Account" i], a[aria-label*="Google-Konto" i]'
}

// Quota, sign-out and "I can't edit images" replies: see guard.mjs.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra })

const loadPlaywright = (root) => {
  const req = createRequire(join(root, 'package.json'))
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    try { return req(name) } catch { /* next */ }
  }
  throw fail('BROWSER', 'Playwright is not installed in this project — pnpm add -D playwright-core')
}

/** The words that tell the painter how to read a combined picture. */
export const compositePreamble = (n) =>
  `THE ATTACHED PICTURE IS ${n} IMAGES PLACED SIDE BY SIDE, separated by plain white gaps. ` +
  `Read them left to right as image 1 … image ${n}: wherever this brief says "image 1", "the first image", ` +
  `"the last image" or "the reference", it means that part of the attached picture. The rightmost one ` +
  `(image ${n}) is the reference whose layout and frame your picture follows — make YOUR picture the shape ` +
  `of image ${n} alone, never the shape of the whole combined strip, and never paint the white gaps.

`

/** Lay the images out left to right at one height with white gaps, as one PNG. */
async function composite(root, files) {
  const sharp = createRequire(join(root, 'package.json'))('sharp')
  const H = 768
  const GAP = 48
  const parts = []
  let x = 0
  for (const f of files) {
    const buf = await sharp(f).resize({ height: H }).png().toBuffer()
    const { width } = await sharp(buf).metadata()
    parts.push({ input: buf, left: x, top: 0 })
    x += width + GAP
  }
  const out = join(mkdtempSync(join(tmpdir(), 'art-desk-')), 'combined.png')
  await sharp({ create: { width: x - GAP, height: H, channels: 3, background: '#ffffff' } })
    .composite(parts).png().toFile(out)
  return out
}

export class Gemini {
  constructor({ root, profileDir, url, chrome, chromeArgs = [], log = () => {}, imageTool = {}, compositeAttachments = false, ...models }) {
    this.root = root
    this.compositeAttachments = !!compositeAttachments
    // required · icons · labels · menuButtonSelector (guard.mjs)
    this.tool = { ...IMAGE_TOOL_DEFAULTS, ...(imageTool ?? {}) }
    // allowedModels · deniedModels · requireModelLabel · modelPickerSelector
    this.models = models
    this.profileDir = profileDir
    this.url = url
    this.origin = new URL(url).origin
    this.chrome = chrome
    this.chromeArgs = chromeArgs
    this.log = log
    this.browser = null
  }

  /** The DevTools port of a live Chrome on OUR profile, or null. */
  async livePort() {
    const f = join(this.profileDir, 'DevToolsActivePort')
    if (!existsSync(f)) return null
    const port = Number(readFileSync(f, 'utf-8').split(/\r?\n/)[0])
    if (!port) return null
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
      return r.ok ? port : null
    } catch {
      return null
    }
  }

  /** Is ANY Chrome running on this profile — with our port or without it? */
  profileInUse() {
    if (process.platform === 'win32') {
      // Chrome holds `lockfile` open exclusively for as long as it runs.
      const f = join(this.profileDir, 'lockfile')
      if (!existsSync(f)) return false
      try { closeSync(openSync(f, 'r+')); return false } catch (e) { return e.code === 'EBUSY' || e.code === 'EPERM' }
    }
    try {
      // Elsewhere `SingletonLock` is a symlink to "<host>-<pid>".
      process.kill(Number(readlinkSync(join(this.profileDir, 'SingletonLock')).split('-').pop()), 0)
      return true
    } catch {
      return false
    }
  }

  chromePath() {
    const exe = this.chrome ?? CHROME_CANDIDATES.find((p) => existsSync(p))
    if (!exe) throw fail('BROWSER', 'No Chrome found — set "gemini": { "chrome": "<path>" } in art-desk.config.json')
    return exe
  }

  async launch() {
    let port = await this.livePort()
    if (port) return port
    if (this.profileInUse()) {
      throw fail('BROWSER', 'the sign-in window is still open — close it once you are signed in (the desk reopens that profile with its automation port), then start again')
    }
    const exe = this.chromePath()
    mkdirSync(this.profileDir, { recursive: true })
    rmSync(join(this.profileDir, 'DevToolsActivePort'), { force: true })
    spawn(exe, [
      `--user-data-dir=${this.profileDir}`,
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      // A window in the background must keep its timers and painting, or a
      // generation sits waiting on a throttled tab.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      ...this.chromeArgs,
      this.url
    ], { detached: true, stdio: 'ignore' }).unref()
    for (let i = 0; i < 80; i++) {
      await sleep(250)
      port = await this.livePort()
      if (port) return port
    }
    throw fail('BROWSER', `Chrome started but opened no DevTools port. If a Chrome window on ${this.profileDir} was already open, close it and try again.`)
  }

  async connect() {
    if (this.browser?.isConnected()) return
    const port = await this.launch()
    const { chromium } = loadPlaywright(this.root)
    this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    this.browser.on('disconnected', () => { this.browser = null })
    this.context = this.browser.contexts()[0] ?? await this.browser.newContext()
  }

  /** Let go of the window without closing it: attached only while painting. */
  async detach() {
    const b = this.browser
    this.browser = null
    // For a browser reached over CDP, close() disconnects; Chrome keeps running.
    await b?.close().catch(() => {})
  }

  async page() {
    await this.connect()
    const pages = this.context.pages()
    return pages.find((p) => p.url().startsWith(this.origin))
      ?? pages.find((p) => /^(about:blank|chrome:\/\/new-tab-page)/.test(p.url()))
      ?? this.context.newPage()
  }

  async signedIn(page) {
    return page.evaluate((s) => {
      if (document.querySelector(s.account)) return true
      if (document.querySelector(s.signIn)) return false
      return null
    }, SEL).catch(() => null)
  }

  /** The desk's window, to watch it work. Launches it; does NOT attach. */
  async open() {
    const running = !!(await this.livePort())
    await this.launch()
    return { running: true, launched: !running }
  }

  /** Close the desk's own window (never any other Chrome: it is found by our profile's port). */
  async closeWindow() {
    const port = await this.livePort()
    if (!port) return false
    await this.detach()
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    await new Promise((res) => {
      const ws = new WebSocket(webSocketDebuggerUrl)
      ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })))
      ws.addEventListener('close', res)
      ws.addEventListener('error', res)
      setTimeout(res, 3000)
    })
    for (let i = 0; i < 40 && this.profileInUse(); i++) await sleep(250)
    return true
  }

  /**
   * The same profile, launched plain for a Google sign-in — see SIGNING IN
   * at the top. Closes the desk's automation window first if it is up.
   */
  async signInWindow() {
    if (await this.livePort()) await this.closeWindow()
    else if (this.profileInUse()) return { opened: false, alreadyOpen: true }
    mkdirSync(this.profileDir, { recursive: true })
    spawn(this.chromePath(), [
      `--user-data-dir=${this.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(this.url)}`
    ], { detached: true, stdio: 'ignore' }).unref()
    return { opened: true }
  }

  async status() {
    const port = await this.livePort()
    return { running: !!port, signInWindow: !port && this.profileInUse(), attached: !!this.browser?.isConnected() }
  }

  /**
   * One generation: new chat, images, prompt, send, wait, download. The
   * images go in the job's order — `alsoFiles` first (a character model ahead
   * of a layout: the first image is the one taken as the subject), then the
   * reference.
   * Resolves with the image bytes; rejects with `err.code` one of
   * BROWSER · SIGNED_OUT · CONSENT · QUOTA · MODEL · TOOL · REFUSED · NO_IMAGE · TIMEOUT,
   * and `err.counted` when
   * the attempt used up a generation. A reply without an image is NEVER
   * followed up in the same chat (see guard.mjs) — NO_IMAGE goes back to the
   * queue, which may re-run the job from a fresh chat.
   */
  async paint({ refFile, alsoFiles = [], prompt, timeoutMs = 420_000, onPhase = () => {} }) {
    try {
      const page = await this.page()
      onPhase('opening a new chat')
      await page.goto(this.url, { waitUntil: 'domcontentloaded' })
      const editor = page.locator(SEL.editor).first()
      await editor.waitFor({ state: 'visible', timeout: 45_000 })
        .catch(() => { throw fail('BROWSER', 'Gemini never showed its prompt box — is the page loading, or asking for something?') })
      await sleep(1200)
      if (await page.locator(SEL.consent).count()) {
        throw fail('CONSENT', 'Gemini is asking about cookies — answer it once (press "Sign in", or "Gemini window" if you are already signed in), then start again')
      }
      if ((await this.signedIn(page)) === false) {
        throw fail('SIGNED_OUT', 'the Gemini window is signed out — press "Sign in", sign in to Google in the window that opens, close it, then start again')
      }

      // A new chat has the image tool OFF, and the plain chat answers an image
      // brief in words. Turn it on before anything else goes in.
      onPhase('turning on the image tool')
      await this.ensureImageTool(page)

      let order = [...alsoFiles, refFile]
      let expect = 1 + alsoFiles.length
      if (this.compositeAttachments && order.length > 1) {
        onPhase(`combining ${order.length} images into one`)
        const c = await composite(this.root, order)
        prompt = compositePreamble(order.length) + prompt
        order = [c]
        expect = 1
      }
      for (const [i, f] of order.entries()) {
        onPhase(order.length > 1 ? `attaching image ${i + 1} of ${order.length} — ${basename(f)}` : 'attaching the reference')
        await this.attach(page, f)
      }
      const chips = await page.locator(SEL.attachment).count()
      if (chips < expect) {
        throw fail('BROWSER', `only ${chips} of ${expect} images are attached — not sending a job without all of them`)
      }

      // Before a generation is spent: a model that cannot read the
      // attachments paints from the words alone, over a good painting.
      const model = await this.model(page)
      if (model.ok === false) throw fail('MODEL', `${REFUSED_STATUS}: ${model.why}`)
      if (model.ok === null) {
        if (this.models.requireModelLabel) throw fail('MODEL', `${REFUSED_STATUS}: ${model.why} (requireModelLabel is on)`)
        this.log(`${model.why} — painting anyway`, 'err')
      } else {
        this.log(`model: ${model.label}`)
      }

      // Still on after the uploads? (Never send without it.)
      await this.ensureImageTool(page)

      onPhase('pasting the prompt')
      await this.type(page, prompt)

      const before = await page.locator(SEL.response).count()
      onPhase('sending')
      await this.send(page)

      // A reply in words throws NO_IMAGE here and is never followed up in
      // this chat: a nudged return paints from the text alone.
      const res = await this.waitForImage(page, before, timeoutMs, onPhase)

      onPhase('downloading the image')
      const bytes = await this.download(page, res)
      const size = imageSize(bytes)
      this.log(`got ${size?.w}x${size?.h} ${size?.type}, ${(bytes.length / 1024).toFixed(0)} kB`)
      return { bytes, chatUrl: page.url() }
    } catch (e) {
      if (!e.code) e.code = 'BROWSER'
      throw e
    } finally {
      await this.detach()
    }
  }

  /**
   * The model picker's label, judged against the allow-list (guard.mjs).
   * Polled for up to `waitMs`: on a new chat the picker renders a beat after
   * the prompt box, and a single read there was "could not be read".
   */
  async model(page, waitMs = 10_000) {
    const sel = this.models.modelPickerSelector ?? SEL.modelPicker
    const read = () => page.evaluate((sel) => {
      for (const el of document.querySelectorAll(sel)) {
        const text = el.innerText || ''
        const aria = el.getAttribute('aria-label') || el.querySelector('[aria-label]')?.getAttribute('aria-label') || ''
        if (text.trim() || aria.trim()) return { text, aria }
      }
      return {}
    }, sel).catch(() => ({}))
    const t0 = Date.now()
    let label = ''
    for (;;) {
      label = pickerLabel(await read())
      if (label || Date.now() - t0 > waitMs) break
      await sleep(400)
    }
    const verdict = checkModel(label, this.models)
    // "Gemini Automatic" paints with Nano Banana whenever the Create image tool
    // is on for the chat, so a denied-by-name picker is fine with the chip up.
    // (Only the allow-list miss is waived; an explicit denied model stays denied.)
    if (verdict.ok === false && /not on the allow-list/.test(verdict.why) && imageToolActive(await this.toolChips(page), this.tool)) {
      return { ok: true, label: verdict.label, why: null }
    }
    return verdict
  }

  /** The tool chips above the prompt box: [{ icon, label }]. */
  toolChips(page) {
    return page.evaluate((s) => [...document.querySelectorAll(s.toolChip)].map((c) => ({
      icon: c.querySelector('mat-icon[data-mat-icon-name]')?.getAttribute('data-mat-icon-name') ?? c.querySelector('mat-icon[fonticon]')?.getAttribute('fonticon') ?? '',
      label: (c.querySelector('.gem-attachment-text')?.innerText ?? c.innerText ?? '').replace(/\s+/g, ' ').trim()
    })), SEL).catch(() => [])
  }

  /**
   * Make sure the chat has the image-creation tool on (guard.mjs: the plain
   * chat cannot paint). Opens "+" → "Bild erstellen" when the chip is
   * missing and checks the chip came up; throws TOOL (which stops the queue
   * with the job kept) when it cannot.
   */
  async ensureImageTool(page) {
    if (!this.tool.required) return
    if (imageToolActive(await this.toolChips(page), this.tool)) return
    const why = await (async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        // A fresh chat needs a few seconds before its tools menu fills (2026-10-06).
        if (attempt > 0) await sleep(1500)
        const btn = page.locator(this.tool.menuButtonSelector ?? SEL.toolsButton).first()
        if (!(await btn.count())) return 'the "+" (Uploads & Tools) button is not on the page'
        await btn.click()
        const opened = await page.locator(SEL.toolsItem).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)
        if (!opened) { await page.keyboard.press('Escape').catch(() => {}); continue }
        const readItems = () => page.evaluate((s) => [...document.querySelectorAll(s.toolsItem)].map((e) => ({
          icon: e.querySelector('mat-icon[data-mat-icon-name]')?.getAttribute('data-mat-icon-name') ?? '',
          label: (e.querySelector('.list-item-title-text')?.innerText ?? e.querySelector('[aria-label]')?.getAttribute('aria-label') ?? e.innerText ?? '').replace(/\s+/g, ' ').trim(),
          selected: e.getAttribute('aria-checked') === 'true' || !!e.querySelector('.gem-list-item-selected, [data-mat-icon-name="check"]')
        })), SEL)
        // The upload items render first and the tools a beat later (2026-10-06):
        // a single read can see "Dateien hochladen…" and no image tool yet.
        let items = await readItems()
        for (let t = 0; t < 32 && findImageTool(items, this.tool) < 0; t++) {
          await sleep(250)
          items = await readItems()
        }
        const i = findImageTool(items, this.tool)
        if (i < 0) {
          await page.keyboard.press('Escape').catch(() => {})
          return `the tools menu has no image tool (it lists: ${items.map((it) => it.label).join(', ') || 'nothing'})`
        }
        if (items[i].selected) {
          // On in the menu but no chip: leave it as it is and look again.
          await page.keyboard.press('Escape').catch(() => {})
        } else {
          this.log(`turning on Gemini's image tool ("${items[i].label}")`)
          await page.locator(SEL.toolsItem).nth(i).click()
        }
        const on = await page.waitForFunction(({ s }) => document.querySelector(s.toolChip) !== null, { s: SEL }, { timeout: 5000 })
          .then(() => true, () => false)
        if (on && imageToolActive(await this.toolChips(page), this.tool)) return null
      }
      return 'the "Bilder" chip never appeared above the prompt box'
    })()
    if (why) throw fail('TOOL', `${TOOL_STATUS}: ${why}`)
  }

  async attach(page, refFile) {
    const b64 = readFileSync(refFile).toString('base64')
    const name = basename(refFile)
    const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[name.split('.').pop().toLowerCase()] ?? 'image/png'
    const already = () => page.locator(SEL.attachment).count()
    // A second image lands beside the first, so "landed" means one MORE chip.
    const before = await already()
    for (const how of ['paste', 'drop']) {
      await page.evaluate(({ b64, name, type, how, s }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], name, { type }))
        const ed = document.querySelector(s.editor)
        ed.focus()
        if (how === 'paste') {
          ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        } else {
          const zone = document.querySelector(s.dropZone) ?? ed
          for (const type of ['dragenter', 'dragover', 'drop']) {
            zone.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }))
          }
        }
      }, { b64, name, type, how, s: SEL })
      await this.acceptNotice(page)
      const landed = await page.waitForFunction(({ s, before }) => document.querySelectorAll(s.attachment).length > before,
        { s: SEL, before }, { timeout: 10_000 })
        .then(() => true, () => false)
      if (!landed) continue
      await page.waitForFunction(({ s, before }) => [...document.querySelectorAll(s.attachmentImg)]
        .filter((i) => i.complete && i.naturalWidth > 0).length > before, { s: SEL, before }, { timeout: 30_000 })
        .catch(() => this.log(`${name} shows no thumbnail — carrying on`, 'err'))
      const uploaded = await page.waitForFunction((s) => ![...document.querySelectorAll(s.attachmentBusy)]
        .some((e) => (e.checkVisibility ? e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : e.offsetParent !== null)), SEL, { timeout: 90_000 })
        .then(() => true, () => false)
      if (!uploaded) {
        throw fail('BROWSER', 'the reference never finished uploading — the spinner on the attachment kept turning for 90 s. Is the Gemini window signed in?')
      }
      if ((await already()) > before + 1) this.log(`${await already() - before} copies of ${name} landed — attached more than once, which is harmless`, 'err')
      return
    }
    throw fail('BROWSER', `could not attach ${name} — Gemini accepted neither a paste nor a drop`)
  }

  /**
   * Gemini's one-time "you must have the rights to what you upload" notice
   * appears as a dialog right after the first attachment: two buttons,
   * cancel and agree. That one is accepted by its primary button, and what
   * it said goes into the log. Any OTHER dialog — consent, an upsell, a
   * survey — stops the run with its text: agreeing to things nobody read is
   * not the desk's call.
   */
  async acceptNotice(page) {
    const dlg = page.locator(SEL.dialog).last()
    const shown = await dlg.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)
    if (!shown) return
    const text = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    const buttons = await dlg.locator('button').count()
    if (await dlg.locator(SEL.consent).count()) {
      throw fail('CONSENT', 'Gemini is asking about cookies — answer it once in the Gemini window, then start again')
    }
    if (buttons !== 2) {
      throw fail('CONSENT', `Gemini opened a dialog the desk does not answer: "${text.slice(0, 200)}" — deal with it in the Gemini window, then start again`)
    }
    const primary = dlg.locator(SEL.dialogPrimary).last()
    const button = (await primary.count()) ? primary : dlg.locator('button').last()
    this.log(`Gemini showed its upload notice: "${text.slice(0, 200)}" — accepting it`)
    await button.click()
    await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  }

  async type(page, text) {
    const editor = page.locator(SEL.editor).first()
    await editor.click()
    await page.keyboard.insertText(text)
    const squash = (s) => s.replace(/\s+/g, '')
    const got = squash(await editor.innerText())
    if (got.length < squash(text).length * 0.98) {
      throw fail('BROWSER', `the prompt did not land in the box (${got.length} of ${squash(text).length} characters)`)
    }
  }

  async send(page) {
    await page.waitForFunction((s) => {
      const b = document.querySelector(s.send)
      return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'
    }, SEL, { timeout: 60_000 }).catch(() => {})
    const btn = page.locator(SEL.send).first()
    if (await btn.count()) await btn.click()
    else await page.keyboard.press('Enter')
    const started = () => page.waitForFunction((s) => (document.querySelector(s.editor)?.innerText.trim().length ?? 0) < 3, SEL, { timeout: 15_000 })
      .then(() => true, () => false)
    if (await started()) return
    await page.keyboard.press('Enter')
    if (!(await started())) throw fail('BROWSER', 'Gemini did not take the message — the prompt is still in the box')
  }

  async waitForImage(page, before, timeoutMs, onPhase) {
    const t0 = Date.now()
    let doneAt = null
    let imageAt = null
    while (Date.now() - t0 < timeoutMs) {
      const s = await page.evaluate(({ s, before }) => {
        const all = document.querySelectorAll(s.response)
        if (all.length <= before) return { started: false }
        const r = all[all.length - 1]
        let imgs = [...r.querySelectorAll(s.image)]
        if (!imgs.length) imgs = [...r.querySelectorAll('img')].filter((i) => /googleusercontent|^blob:/.test(i.src))
        const ready = imgs.filter((i) => i.complete && i.naturalWidth >= 256)
        return {
          started: true,
          done: !!r.querySelector(s.responseDone),
          text: r.innerText.trim(),
          images: ready.map((i) => ({ src: i.src, w: i.naturalWidth, h: i.naturalHeight })),
          loading: imgs.length - ready.length
        }
      }, { s: SEL, before }).catch(() => ({ started: false }))

      if (s.images?.length) {
        imageAt ??= Date.now()
        // Done, or a loaded image and the turn quiet for a while.
        if (s.done || Date.now() - imageAt > 30_000) {
          // An image beside "I can't edit images" was painted from the words
          // alone: never download it.
          if (classifyReply(s.text) === 'refused') {
            throw fail('REFUSED', `${REFUSED_STATUS}. It painted anyway, from the text alone — not saved. Gemini says: ${s.text.slice(0, 300)}`, { counted: true, text: s.text })
          }
          return { image: s.images[0], text: s.text }
        }
      } else if (s.done && !s.loading) {
        doneAt ??= Date.now()
        // The image can render a beat after the actions bar.
        if (Date.now() - doneAt > 8000) {
          const kind = classifyReply(s.text)
          if (kind === 'quota') throw fail('QUOTA', `Gemini says: ${s.text.slice(0, 300)}`)
          if (kind === 'signed_out') throw fail('SIGNED_OUT', `Gemini says: ${s.text.slice(0, 300)}`)
          if (kind === 'refused') throw fail('REFUSED', `${REFUSED_STATUS}. Gemini says: ${s.text.slice(0, 300)}`, { counted: true, text: s.text })
          throw fail('NO_IMAGE', `${NO_IMAGE_STATUS} — Gemini answered in words: ${s.text.slice(0, 300)}`, { counted: true, text: s.text })
        }
      }
      onPhase(s.started ? `Gemini is painting — ${Math.round((Date.now() - t0) / 1000)} s` : 'waiting for Gemini to start', true)
      await sleep(2000)
    }
    throw fail('TIMEOUT', `no image after ${Math.round(timeoutMs / 1000)} s`, { counted: true })
  }

  /** The full-size original via Gemini's own download button; the on-screen image if that fails. */
  async download(page, res) {
    const turn = page.locator(SEL.response).last()
    try {
      const img = turn.locator(SEL.image).first()
      await ((await img.count()) ? img : turn.locator('img').last()).hover()
      const btn = turn.locator(SEL.download).first()
      await btn.waitFor({ state: 'visible', timeout: 6000 })
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), btn.click()])
      // Two ways to the bytes, because `saveAs` has been seen to lose the race
      // with the browser's own cleanup ("ENOENT … copyfile …playwright-artifacts…")
      // and take a finished generation down with it. The stream reads the same
      // artifact without copying it; `path()` is the file itself.
      const stream = await dl.createReadStream().catch(() => null)
      if (stream) {
        const chunks = []
        for await (const c of stream) chunks.push(c)
        const bytes = Buffer.concat(chunks)
        if (imageSize(bytes)) return bytes
      }
      const at = await dl.path().catch(() => null)
      if (at && existsSync(at)) {
        const bytes = readFileSync(at)
        if (imageSize(bytes)) return bytes
      }
      const dir = mkdtempSync(join(tmpdir(), 'art-desk-'))
      try {
        const f = join(dir, dl.suggestedFilename() || 'gemini.png')
        await dl.saveAs(f)
        const bytes = readFileSync(f)
        if (imageSize(bytes)) return bytes
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch (e) {
      this.log(`the download button did not work (${String(e.message).split('\n')[0]}) — taking the image off the page`, 'err')
    }
    const viaContext = await this.context.request.get(res.image.src).then((r) => (r.ok() ? r.body() : null), () => null)
    if (viaContext && imageSize(viaContext)) return viaContext
    const b64 = await page.evaluate(async (src) => {
      const r = await fetch(src, { credentials: 'include' })
      const b = new Uint8Array(await r.arrayBuffer())
      let s = ''
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
      return btoa(s)
    }, res.image.src).catch(() => null)
    const viaPage = b64 ? Buffer.from(b64, 'base64') : null
    if (viaPage && imageSize(viaPage)) return viaPage
    throw fail('BROWSER', 'the image is on screen but could not be downloaded', { counted: true })
  }
}
