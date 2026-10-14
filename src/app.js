// Waypage: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
//
// The shell is in seven parts (1.14.0), app.js and app-*.js, loaded in
// order by index.html. They are plain scripts, not modules, so what one
// declares at its top level (const, let, function) the later ones see:
// one scope, as when this was a single function. The rule that keeps it
// working: what runs at load, rather than later on a tap or a timer, may
// only use what an earlier part, or its own, has declared. A part's
// functions can call into any part, since nothing is tapped until all of
// them have loaded. app-start.js runs last and starts things up.
const APP_VERSION = "1.26.4";
window.Waypage.version = APP_VERSION;

const C = window.Waypage;
const M = C.motion;

// Every history entry carries this launch's mark (1.21.0). After a restart
// the entries from before are still behind the first one, and Back into
// one of them opened that old clip again.
const LAUNCH = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
for (const name of ["pushState", "replaceState"]) {
  const real = history[name].bind(history);
  history[name] = (s, ...rest) => real(s && typeof s === "object" ? { ...s, launch: LAUNCH } : s, ...rest);
}
// Each theme is a token set in src/styles.css; "system" (Auto) picks
// the light or dark one chosen for it from the phone's setting.
const THEMES = [
  { value: "paper", label: "Paper", dark: false },
  { value: "sepia", label: "Sepia", dark: false, note: "Warmer, for long reads" },
  { value: "slate", label: "Slate", dark: false, note: "Cool grey" },
  { value: "solarized", label: "Solarized", dark: false },
  { value: "contrast", label: "High contrast", short: "Contrast", dark: false, note: "Black on white, for bright sun" },
  { value: "night", label: "Night", dark: true, note: "For a dim cabin" },
  { value: "black", label: "Black", dark: true, note: "True black, easy on OLED batteries" },
  { value: "dusk", label: "Dusk", dark: true, note: "Warm and soft, for bedtime" },
  { value: "solarized-dark", label: "Solarized Dark", short: "Solarized", dark: true },
];
const themeOf = (v) => THEMES.find((t) => t.value === v);
const THEME_KEY = "waypage.theme";
const AUTO_KEY = "waypage.themeAuto";
const IMAGES_KEY = "waypage.images";
// On mobile data (1.4.1): "any" saves and syncs as always, "wifi" waits.
const DATA_SAVE_KEY = "waypage.saveOnData";
const DATA_SYNC_KEY = "waypage.syncOnData";
const READING_KEY = "waypage.reading";
const FILTER_KEY = "waypage.filter";
const SEEN_KEY = "waypage.seenVersion";
const SORT_KEY = "waypage.sort";
const CONTINUE_KEY = "waypage.continue";
// Settings, Appearance, Animations (1.12.0): false turns every animation off.
const MOTION_KEY = "waypage.animations";
const LAYOUT_KEY = "waypage.layout";
// The library's three looks (0.28.0); Settings, Library picks one.
const LAYOUTS = [
  { value: "shelf", label: "Shelf", note: "Collections as a row of covers, clips listed under them" },
  { value: "list", label: "One list", note: "Collections and clips together, grouped by date or site" },
  { value: "grid", label: "Grid", note: "Covers three across, clips as picture cards" },
];
const NEW_KEY = "waypage.newChapters";
const DAILY_KEY = "waypage.checkDaily";
const EXPORT_KEY = "waypage.exportKind";
const RATE_KEY = "waypage.aloudRate";
const VOICE_KEY = "waypage.aloudVoice";
const DEVICE_KEY = "waypage.deviceName";

const $ = (id) => document.getElementById(id);
const libTools = $("libTools");

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "checked") node.checked = !!v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

// replaceChildren, skipping the nulls an optional part leaves.
const fill = (node, ...children) => node.replaceChildren(...children.filter((c) => c != null));

// Browser storage can be missing or throw (private windows, cleared data);
// the app has to render without it.
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not kept */ }
}
M.setStill(load(MOTION_KEY, true) === false);

let toastTimer = null;
function toast(text, act, onAct) {
  const t = $("toast");
  const wasHidden = t.hidden;
  if (act) t.replaceChildren(el("span", {}, text), el("button", { class: "toast-act", type: "button", onclick: () => { t.hidden = true; onAct(); } }, act));
  else t.textContent = text;
  t.hidden = false;
  if (wasHidden) M.edgeIn(t);
  clearTimeout(toastTimer);
  const shown = text;
  toastTimer = setTimeout(() => { M.edgeOut(t).then(() => { if (t.textContent === shown || (act && t.firstChild && t.firstChild.textContent === shown)) t.hidden = true; }); }, act ? 8000 : 3200);
}

// ---- Theme ----
// "system" follows the phone's light or dark setting, with the light and
// dark theme picked for it (Paper and Night unless changed).
const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
function autoThemes() {
  const a = load(AUTO_KEY, {});
  const ok = (v, dark) => themeOf(v) && themeOf(v).dark === dark;
  return { light: ok(a.light, false) ? a.light : "paper", dark: ok(a.dark, true) ? a.dark : "night" };
}
const resolveTheme = (choice) => (themeOf(choice) ? choice : autoThemes()[darkQuery && darkQuery.matches ? "dark" : "light"]);
const themeName = (choice) => (themeOf(choice) ? themeOf(choice).label : "Auto");

function setAutoTheme(change) {
  store(AUTO_KEY, { ...autoThemes(), ...change });
  if (state.theme === "system") paintTheme("system");
  document.querySelectorAll(".swatch.auto").forEach((sw) => sw.replaceWith(swatch(autoSwatch(), "auto")));
}
const autoSwatch = () => { const a = autoThemes(); return [a.light, a.dark]; };

function paintTheme(choice) {
  document.documentElement.dataset.theme = resolveTheme(choice);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (C.reader) C.reader.applyTheme();
}

// A new theme is there at once (1.11.0): the cross-fade it had was a
// fade, and nothing fades now.
function setTheme(choice) {
  state.theme = choice;
  store(THEME_KEY, choice);
  paintTheme(choice);
}

const state = {
  theme: load(THEME_KEY, "system"),
  // Library index entries: the meta each saved page's meta.json holds.
  pages: [],
  // Saves in flight: { key, url, site, done, total }.
  saving: [],
  // What finished this session, newest first, for Downloads: { key, at,
  // run } for a run of saves, { key, at, page } for one page.
  finished: [],
  // Whether the Downloads screen is up.
  downloads: false,
  open: null,
  settings: false,
  sheet: false,
  // Whether a tapped image is up full screen over the reader.
  image: false,
  batch: false,
  news: false,
  // The folder whose screen is up (its name), under the reader if a page is open.
  folder: null,
  // Which pages the library shows: "all", "unread", "finished" or "#tag".
  filter: load(FILTER_KEY, "all"),
  // What's typed in the library's search field.
  query: "",
  // The library's order: "saved", "read", "length" or "site".
  sort: load(SORT_KEY, "saved"),
  // Picking pages to change together: the ids picked, or null.
  select: null,
  // The library's sheet: { kind: "page" | "tags" | "folder", page }, or null.
  menu: null,
  // Settings' screen up over its menu: "appearance", "saving", "storage" or "updates" (About).
  section: null,
};
paintTheme(state.theme);

// ---- Reading ----
// Text size, line spacing, margins and fonts for saved pages, set from
// the reader's Aa sheet or Settings. They're tokens on the app's :root,
// which src/reader.js copies into the page like the theme's colours.
const SIZE_MIN = 14, SIZE_MAX = 32;
const SPACING_MIN = 1.2, SPACING_MAX = 2.2;
// Letter and word spacing in em, paragraph spacing a multiple of the usual
// gap (1.19.0). 0, 0 and 1 leave the page's own.
const SPACES = {
  letters: { min: -0.05, max: 0.15, step: 0.01 },
  words: { min: 0, max: 0.5, step: 0.05 },
  paras: { min: 0, max: 3, step: 0.25 },
};
// Every Latin font is followed by a Hebrew one (src/fonts.css), which
// gives a Hebrew page its letters: the one picked, or else the one
// matching the Latin font's style.
const FONTS = [
  { value: "serif", label: "Source Serif", family: '"Source Serif 4"', kind: "serif" },
  { value: "literata", label: "Literata", family: '"Literata"', kind: "serif" },
  { value: "lora", label: "Lora", family: '"Lora"', kind: "serif" },
  { value: "merriweather", label: "Merriweather", family: '"Merriweather"', kind: "serif" },
  { value: "garamond", label: "EB Garamond", family: '"EB Garamond"', kind: "serif" },
  { value: "sans", label: "Instrument Sans", family: '"Instrument Sans"', kind: "sans" },
  { value: "inter", label: "Inter", family: '"Inter"', kind: "sans" },
  { value: "atkinson", label: "Atkinson", family: '"Atkinson Hyperlegible"', kind: "sans" },
  { value: "dyslexic", label: "OpenDyslexic", family: '"OpenDyslexic"', kind: "sans" },
  { value: "system", label: "System", family: 'system-ui, -apple-system, "Segoe UI", Roboto', kind: "system" },
];
const HEBREW = [
  { value: "auto", label: "Auto" },
  { value: "frank", label: "Frank Ruhl", family: '"Frank Ruhl Libre"' },
  { value: "david", label: "David", family: '"David Libre"' },
  { value: "assistant", label: "Assistant", family: '"Assistant"' },
  { value: "heebo", label: "Heebo", family: '"Heebo"' },
];
const MARGINS = { narrow: ["var(--s-3)", "44rem"], normal: ["20px", "38rem"], wide: ["var(--s-7)", "32rem"] };
const READING_DEFAULT = { size: 19, spacing: 1.6, letters: 0, words: 0, paras: 1, font: "serif", hebrew: "auto", margins: "normal", align: "auto", layout: "scroll", spread: "auto", rail: true };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Text alignment (1.19.0). "auto" leaves the clip or file as it came.
const ALIGNS = [
  { value: "auto", label: "Original" }, { value: "left", label: "Left" }, { value: "justify", label: "Justified" },
  { value: "center", label: "Centered" }, { value: "right", label: "Right" },
];

// Before 0.24.0 size was a step of five and spacing a word.
function readingPrefs() {
  const r = { ...READING_DEFAULT, ...load(READING_KEY, {}) };
  if (Number.isInteger(r.size) && r.size >= 0 && r.size < 5) r.size = [16, 18, 19, 21, 24][r.size];
  if (typeof r.spacing === "string") r.spacing = { tight: 1.4, normal: 1.6, loose: 1.8 }[r.spacing];
  r.size = Number.isFinite(r.size) ? clamp(Math.round(r.size), SIZE_MIN, SIZE_MAX) : READING_DEFAULT.size;
  r.spacing = Number.isFinite(r.spacing) ? clamp(Math.round(r.spacing * 20) / 20, SPACING_MIN, SPACING_MAX) : READING_DEFAULT.spacing;
  if (!FONTS.some((f) => f.value === r.font)) r.font = READING_DEFAULT.font;
  if (!HEBREW.some((f) => f.value === r.hebrew)) r.hebrew = READING_DEFAULT.hebrew;
  for (const [k, s] of Object.entries(SPACES)) {
    r[k] = Number.isFinite(r[k]) ? clamp(Math.round(r[k] / s.step) * s.step, s.min, s.max) : READING_DEFAULT[k];
    r[k] = Math.round(r[k] * 100) / 100;
  }
  if (!MARGINS[r.margins]) r.margins = READING_DEFAULT.margins;
  if (!ALIGNS.some((a) => a.value === r.align)) r.align = READING_DEFAULT.align;
  if (r.layout !== "pages") r.layout = "scroll";
  if (!["one", "two", "auto"].includes(r.spread)) r.spread = "auto";
  r.rail = r.rail !== false;
  return r;
}

function fontStack(r) {
  const f = FONTS.find((x) => x.value === r.font);
  const picked = HEBREW.find((x) => x.value === r.hebrew).family;
  const hebrew = picked || { serif: '"Frank Ruhl Libre"', sans: '"Heebo"' }[f.kind];
  return [f.family, hebrew, f.kind === "serif" ? "Georgia, serif" : "sans-serif"].filter(Boolean).join(", ");
}

function paintReading() {
  const r = readingPrefs();
  const root = document.documentElement.style;
  root.setProperty("--reader-fs", r.size + "px");
  root.setProperty("--reader-lh", Math.round(r.size * r.spacing) + "px");
  root.setProperty("--reader-font", fontStack(r));
  root.setProperty("--reader-pad", MARGINS[r.margins][0]);
  root.setProperty("--reader-measure", MARGINS[r.margins][1]);
  root.setProperty("--reader-ls", r.letters ? r.letters + "em" : "normal");
  root.setProperty("--reader-ws", r.words ? r.words + "em" : "normal");
  root.setProperty("--reader-ps", String(r.paras));
  document.documentElement.dataset.readAlign = r.align;
  if (C.reader) C.reader.applyTheme();
}

function setReading(change) {
  const was = readingPrefs().layout;
  store(READING_KEY, { ...readingPrefs(), ...change });
  paintReading();
  if (C.reader && readingPrefs().layout !== was) C.reader.setPaged(readingPrefs().layout === "pages");
  if (C.reader && "spread" in change) C.reader.setSpread(readingPrefs().spread);
  if ("rail" in change) fitRail();
  document.querySelectorAll(".reading-controls").forEach(syncReadingControls);
}
paintReading();
if (C.reader) C.reader.setSpread(readingPrefs().spread);
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { if (state.theme === "system") paintTheme("system"); });

function formatSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
  return Math.max(1, Math.round(bytes / 1e3)) + " KB";
}
const sizeOf = (pages) => pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
const totalBytes = () => sizeOf(state.pages);
const countLine = (n) => n + (n === 1 ? " clip" : " clips");
// Where the pages are kept, for the words that say so.
const HERE = C.platform.native ? "this phone" : "this browser";
const ON_HERE = (C.platform.native ? "on " : "in ") + HERE;
const pagesLine = (n) => countLine(n) + " · " + formatSize(totalBytes());

// A browser's card pictures, read once from IndexedDB (0.27.12).
const webThumbs = new Map();
async function loadThumbs() {
  if (C.platform.native) return;
  const got = await C.store.readThumbs();
  webThumbs.clear();
  got.forEach((url, id) => webThumbs.set(id, url));
}

function thumbUrl(p) {
  if (!p.thumb) return null;
  if (/^https?:/.test(p.thumb)) return p.thumb;
  if (webThumbs.has(p.id)) return webThumbs.get(p.id);
  const base = C.store.pageDirUrl(p.id);
  return base ? base + p.thumb : null;
}

// The site's icon, for a card with no picture (0.27.6): kept beside the
// page, or its link; a page saved before then tries the site's
// /favicon.ico while online.
function iconUrl(p) {
  if (p.icon && /^https?:/.test(p.icon)) return navigator.onLine ? p.icon : null;
  if (p.icon) { const base = C.store.pageDirUrl(p.id); return base ? base + p.icon : null; }
  if (!navigator.onLine) return null;
  try { return new URL("/favicon.ico", p.url).href; } catch (e) { return null; }
}

// A collection's cover (0.27.6), read from its story page: kept in
// _covers/, or its link.
function coverUrl(list) {
  const c = (list.find((p) => p.cover) || {}).cover;
  if (!c) return null;
  if (/^https?:/.test(c)) return navigator.onLine ? c : null;
  const base = C.store.pageDirUrl("_covers");
  return base ? base + c : null;
}

// ---- Library ----

// What a save is doing, with the seconds it has taken once that's long
// enough to wonder, so a slow site doesn't look stuck.
function savingStatus(s) {
  if (s.waiting) return (s.offline ? "Saves when you're back online" : s.wifi ? "Waiting for Wi-Fi" : "Waiting") + (s.folder ? " · into " + s.folder : "");
  const secs = s.started ? Math.floor((Date.now() - s.started) / 1000) : 0;
  const took = secs >= 5 ? " · " + secs + " s" : "";
  if (s.total == null) return (s.drawing ? "Letting the page draw itself" : "Getting the page") + took;
  if (!s.total) return "Writing it to the phone" + took;
  return "Saving " + s.done + " of " + s.total + (s.total === 1 ? " image" : " images") + took;
}

// The bar: sweeping while the page itself downloads (no size known yet),
// then a tenth for the text and the rest by images saved.
const savingShare = (s) => (s.total == null ? null : s.total ? 0.1 + 0.9 * (s.done / s.total) : 1);

// A save that failed stays in the list with the reason until it's retried
// or removed: a toast alone is gone before anyone looks back at the phone.
function failedCard(s) {
  return el("div", { class: "card saving failed wide", role: "group", "aria-label": "Couldn't save " + s.site },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, s.site),
      el("span", { class: "card-title", dir: "auto" }, s.url),
      el("span", { class: "card-status" }, el("span", { class: "warn" }, s.error)),
      el("span", { class: "card-actions" },
        archiveBtn(s),
        s.gone ? null : el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, "Try again"),
        el("button", { class: "btn-quiet", type: "button", onclick: () => dropFailed(s) }, "Remove"))));
}

// A run of saves into one folder (Save next 10, Save several, a
// contents page) is one card from start to end, the same height
// throughout, so the library doesn't jump as each page comes and goes.
// Pause waits after the page in progress; Stop lets the rest go.
// Pages that fail wait on their own cards until the run ends.
const runs = new Set();
let runIds = 0;
const runFor = (folder) => [...runs].find((r) => r.folder && folder && sameTag(r.folder, folder));
function startRun(folder, site, total, again) {
  const r = { id: ++runIds, folder, site, total, again: !!again, saved: 0, failed: 0, paused: false, stopped: false, current: null, wake: null };
  runs.add(r);
  return r;
}
async function gate(r) {
  while (r.paused && !r.stopped) await new Promise((go) => { r.wake = go; });
  return !r.stopped;
}
function runChanged() {
  renderLibrary();
  if (state.folder) renderFolder();
  if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build());
}
function pauseRun(r, on) {
  r.paused = on;
  if (!on && r.wake) { r.wake(); r.wake = null; }
  // A pause is a quiet moment: what landed is written now (1.2.1).
  if (on) flushIndex();
  runChanged();
}
// Stop on sync's run (1.1.0): sync hands the same pages over again at
// its next run, so they'd start again seconds later. Stopped, they wait
// until Waypage is next opened.
let linksStopped = false;
// The same for a watched folder's files: Look now or a pull brings them.
let watchStopped = false;
function stopRun(r) {
  if (!r) return;
  if (r.sync) linksStopped = true;
  if (r.files) watchStopped = true;
  r.stopped = true;
  r.paused = false;
  if (r.wake) { r.wake(); r.wake = null; }
  state.saving = state.saving.filter((x) => !(x.run === r && x.waiting && !x.error));
  runChanged();
}
// While a run of saves is on, the index is written every few seconds
// and when the run ends (1.2.1), not after every page: the whole
// library.json crossed the bridge for each chapter that landed. A page
// whose entry wasn't written yet is saved again from its link.
let indexTimer = 0;
function indexSoon() {
  if (!runs.size) return C.store.writeIndex(state.pages);
  if (!indexTimer) indexTimer = setTimeout(flushIndex, 3000);
  return Promise.resolve();
}
function flushIndex() {
  if (!indexTimer) return Promise.resolve();
  clearTimeout(indexTimer);
  indexTimer = 0;
  return C.store.writeIndex(state.pages);
}
function endRun(r) {
  if (!r) return;
  runs.delete(r);
  flushIndex();
  oneEach();
  r.done = true;
  r.at = Date.now();
  if (r.saved || failedOf(r).length) finish({ key: "r:" + r.id, run: r });
  renderDownloads();
}

// Two clips of one address (a chapter saved by a run while sync was
// bringing it in, before 1.1.0) become one: the one saved last, with the
// other's tags, favourite, collection and reading, as sync does. Run at
// launch and when a run ends. Files of your own have no address.
async function oneEach() {
  const web = state.pages.filter((p) => p.url && !p.file);
  const gone = {};
  const kept = new Map(C.sync.oneCopyEach(web, gone, Date.now(), sameUrl, urlKey).map((p) => [p.id, p]));
  const ids = Object.keys(gone);
  if (!ids.length) return 0;
  state.pages = state.pages.filter((p) => !gone[p.id]).map((p) => {
    const k = kept.get(p.id);
    if (!k || k === p) return p;
    for (const key of Object.keys(p)) if (!(key in k)) delete p[key];
    return Object.assign(p, k);
  });
  await C.store.writeIndex(state.pages);
  for (const id of ids) await C.store.removePage(id).catch(() => {});
  renderLibrary();
  if (state.folder) renderFolder();
  return ids.length;
}

// Downloads keeps the last 30 finished, for this session.
function finish(entry) {
  state.finished = [{ ...entry, at: Date.now() }, ...state.finished.filter((x) => x.key !== entry.key)].slice(0, 30);
}

// A run's pages that couldn't be saved, waiting on Try again.
const failedOf = (r) => state.saving.filter((s) => s.run === r && s.error);
function runStatus(r) {
  const done = r.total ? r.saved + " of " + r.total + " saved" : r.saved + " saved";
  const failed = r.failed ? ", " + r.failed + " failed" : "";
  if (r.stopped) return done + failed + " · Stopping";
  if (r.paused) return (r.current || r.now ? "Pausing after this one · " : "Paused · ") + done + failed;
  // Files (1.1.3): what the file in hand is up to.
  if (r.files) return r.total === 1 ? r.now || "Opening" : done + failed + " · " + (r.now || "Next in a moment");
  return done + failed + " · " + (r.current && !r.current.waiting ? savingStatus(r.current) : "Next in a moment");
}
function runCard(r) {
  return el("div", { class: "card saving run wide", role: "group", "aria-label": r.files ? "Adding " + r.label : (r.again ? "Saving again in " : "Saving into ") + (r.folder || "the library") },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, r.site, r.again ? " · Saving again" : null),
      el("span", { class: "card-title", dir: "auto" }, r.folder || r.label || "Saving several"),
      el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status accent" },
        el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { class: "status-text" }, runStatus(r))),
      r.files && r.total === 1 ? null : el("span", { class: "card-actions" },
        el("button", { class: "btn-small run-pause", type: "button", onclick: () => pauseRun(r, !r.paused) }, r.paused ? "Resume" : "Pause"),
        el("button", { class: "btn-quiet danger", type: "button", onclick: () => stopRun(r) }, "Stop")),
      failedList(r)));
}
// A run's bar is the whole run when its length is known, else the page
// in progress.
function runShare(r) {
  const page = r.files ? r.part : r.current && !r.current.waiting ? savingShare(r.current) : 0;
  if (!r.total || (page == null && !r.saved && !r.failed)) return page;
  return Math.min(1, (r.saved + r.failed + (page || 0)) / r.total);
}
function updateRunCard(r) {
  paintDownloads();
  const card = $("downloads").querySelector('[data-key="r:' + r.id + '"]');
  if (!card) return;
  const share = runShare(r);
  const bar = card.querySelector(".progress");
  bar.classList.toggle("busy", share == null);
  if (share == null) bar.removeAttribute("aria-valuenow");
  else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
  card.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
  card.querySelector(".spinner").hidden = r.paused && !r.current;
  card.querySelector(".status-text").textContent = runStatus(r);
}

function dropFailed(s) {
  state.saving = state.saving.filter((x) => x !== s);
  renderLibrary();
}

// A run's failed pages sit in its card, in Downloads, each with its own
// Try again, and Try all again over two or more.
function failedList(r) {
  const list = failedOf(r);
  if (!list.length) return null;
  return el("span", { class: "failed-list" },
    el("span", { class: "failed-head" },
      el("span", { class: "warn" }, list.length === 1 ? "1 clip couldn't be saved" : list.length + " clips couldn't be saved"),
      list.length > 1 ? el("button", { class: "btn-text", type: "button", onclick: () => retryAll(list) }, "Try all again") : null),
    ...list.map((s) => el("span", { class: "failed-row" },
      el("span", { class: "failed-text" },
        el("span", { class: "failed-url", dir: "auto" }, s.again ? s.again.title : s.url),
        el("span", { class: "failed-why" }, s.error)),
      archiveBtn(s) || el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, "Try again"),
      dropBtn(s))));
}
function dropBtn(s) {
  const b = el("button", { class: "icon-btn failed-drop", type: "button", "aria-label": "Remove", onclick: () => dropFailed(s) });
  b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  return b;
}

// A paywalled article (1.7.0) says so as it lands, with the way to the
// rest: in the app, signing in to the site (1.8.0).
function savedToast(meta) {
  if (meta.cut && C.platform.signIn.available) {
    toast(C.platform.signIn.for(meta.url) ? "Saved, but only the start, even signed in." : "Saved, but the site kept the rest for subscribers.",
      "Sign in", () => signInFor(meta));
  } else if (meta.cut) toast("Saved, but the site kept the rest for subscribers.", "Open it", () => C.platform.openOutside(meta.url));
  else toast(meta.missing ? "Saved. Some previews are missing." : "Saved for offline reading");
}

// Saving signed in (1.8.0): the site opens in a browser inside Waypage,
// and once it's closed the clip saves again with the site's cookies,
// taking the old copy's place, highlights and all.
async function signInFor(p) {
  if (!navigator.onLine) { toast("You're offline. Sign in when you're back online."); return; }
  if (!(await C.platform.signIn.open(p.url).catch(() => false))) { toast("Couldn't open the site."); return; }
  const now = state.pages.find((x) => x.id === p.id);
  if (now && /^https?:/.test(now.url || "")) saveClipAgain(now);
}
async function saveClipAgain(p, archived) {
  if (state.saving.some((s) => s.again === p)) return;
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: p.mode, kind: p.comic ? "comic" : "article", archived };
  state.saving.unshift(job);
  renderLibrary();
  toast("Saving it again…");
  const meta = await runJob(job);
  if (!meta) { toast("Couldn't save it again. It's in Downloads to try once more."); return; }
  if (archived) toast("Saved the archived copy from " + C.save.formatDate(archived.at) + ".");
  else if (meta.cut) toast("Still only the start. The site may want a subscription, or a different sign-in.", "Sign in", () => signInFor(meta));
  else toast("Saved again, the whole article this time.");
  // Open in the reader, it shows the new copy in the old one's place.
  if (state.open === p) {
    const html = await C.store.readPage(meta.id).catch(() => null);
    if (html && state.open === p) { history.replaceState(readerState(meta), ""); show(meta, html); }
  }
}

// The Wayback Machine (1.15.0): a page that's gone saved from the
// Internet Archive's newest copy, with its own address kept.
async function findArchive(url) {
  if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return null; }
  toast("Looking in the Internet Archive…");
  let found = null;
  try { found = await C.save.findArchived(url); }
  catch (e) { toast(e instanceof C.save.SaveError ? e.message : "Couldn't reach the Internet Archive."); return null; }
  if (!found) toast("The Internet Archive has no copy of this page.");
  return found;
}
async function saveArchived(s) {
  const found = await findArchive(s.url);
  if (!found || !state.saving.includes(s)) return;
  s.archived = found;
  s.gone = false;
  return retryJob(s);
}
async function archiveClip(p) {
  const found = await findArchive(p.url);
  if (!found) return;
  if (p.archived && found.at <= p.archived) { toast("This is already the newest archived copy."); return; }
  saveClipAgain(p, found);
}
const archiveBtn = (s) => (s.gone ? el("button", { class: "btn-small", type: "button", onclick: () => saveArchived(s) }, "Archived copy") : null);

// Saves a failed page again where it was headed: its collection, its
// place there, its tags, or the page it was replacing.
async function retryJob(s) {
  Object.assign(s, { error: null, contents: null, done: 0, total: null, drawing: false, waiting: false });
  renderLibrary();
  const meta = await runJob(s);
  if (meta) {
    if (s.run) { s.run.saved++; s.run.failed = Math.max(0, s.run.failed - 1); }
    savedToast(meta);
    renderDownloads();
  } else if (s.contents) contentsFound(s);
  if (state.folder) renderFolder();
  return meta;
}

async function retryAll(list) {
  let n = 0;
  for (const s of list) {
    if (!s.error || !state.saving.includes(s)) continue;
    if (n++) await new Promise((done) => setTimeout(done, PACE_MS));
    await retryJob(s);
  }
}

// ---- Downloads ----
// Its own screen, from the bar's Downloads button: what's downloading
// (a run of saves is one card, its failed pages inside it), single pages
// that couldn't be saved, and what finished this session. Kept up to
// date while hidden, so it's ready the moment it opens.
function renderDownloads() {
  const root = $("downloads");
  const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
  const nodes = [], fresh = [];
  const keep = (key, make, sig) => {
    let node = old.get(key);
    if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
    else if (sig != null && node.dataset.sig !== sig) { node = make(); node.dataset.key = key; }
    if (sig != null) node.dataset.sig = sig;
    nodes.push(node);
  };
  const going = state.saving.filter((s) => !s.error && !(s.run && !s.run.done));
  const app = updShown();
  if (runs.size || going.length || app) keep("h:going", () => sectionHead("Downloading"));
  if (app) keep("u:" + upd.latest, updateCard, upd.phase + upd.error);
  for (const r of runs) keep("r:" + r.id, () => runCard(r), [r.paused, r.stopped, failedOf(r).length].join());
  for (const s of going) keep("s:" + s.key, () => savingCard(s));
  const shown = new Set(state.finished.map((e) => e.run).filter(Boolean));
  const lone = state.saving.filter((s) => s.error && (!s.run || (s.run.done && !shown.has(s.run))));
  if (lone.length) keep("h:failed", () => sectionHead("Couldn't be saved"));
  for (const s of lone) keep("f:" + s.key, () => failedCard(s));
  const done = state.finished.filter((e) => e.run || state.pages.some((p) => p.id === e.page));
  if (done.length) keep("h:done", () => sectionHead("Done", el("button", { class: "btn-text", type: "button", onclick: clearFinished }, "Clear")));
  for (const e of done) {
    if (e.run) keep(e.key, () => doneRunCard(e), [e.run.saved, failedOf(e.run).length, whenText(e.at), !!(e.run.folder && folderPages(e.run.folder).length)].join());
    else {
      const p = state.pages.find((x) => x.id === e.page);
      keep(e.key, () => donePageCard(p, e), [p.title, p.missing, whenText(e.at)].join());
    }
  }
  if (!nodes.length) {
    keep("empty", () => el("div", { class: "empty wide" },
      el("h2", { class: "empty-title" }, "Nothing downloading"),
      el("p", { class: "empty-text" }, "Clips you save show their progress here, and stay here once they're done until you close the app.")));
  }
  root.replaceChildren(...nodes);
  if (app) paintUpdateCard();
  for (const s of going) updateSavingCard(s);
  for (const r of runs) updateRunCard(r);
  if (state.downloads) fresh.forEach((node) => M.appear(node));
  paintDownloads();
}

// The app's own update (1.23.0): its download, Pause and Resume, then
// Install, like a clip being saved.
// The app update's phase: idle, checking, current, failed, available,
// downloading, paused, ready (app-start.js checks and downloads it).
const upd = { phase: "idle", latest: null, notes: "", pct: 0, bytes: 0, total: 0, apk: null, error: "" };
const UPD_OUT = ["available", "downloading", "paused", "ready"];
const updShown = () => C.platform.android && ["downloading", "paused", "ready"].includes(upd.phase) && !!upd.latest;
function updateCard() {
  const st = upd.phase;
  const act = st === "downloading" ? ["Pause", pauseUpdate] : st === "paused" ? ["Resume", startUpdate] : ["Install", install];
  return el("div", { class: "card saving app-update wide", role: "group", "aria-label": "Waypage " + upd.latest },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, "App update"),
      el("span", { class: "card-title" }, "Waypage " + upd.latest),
      st === "ready" ? null : el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(upd.pct) },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status" + (st === "downloading" ? " accent" : upd.error ? " warn" : "") },
        st === "downloading" ? el("span", { class: "spinner", "aria-hidden": "true" }) : null,
        el("span", { class: "status-text" }, updStatus())),
      el("span", { class: "card-actions" },
        el("button", { class: st === "ready" ? "btn-small" : "btn-quiet", type: "button", onclick: act[1] }, act[0]))));
}
function updStatus() {
  if (upd.phase === "ready") return "Ready to install";
  if (upd.error) return upd.error;
  const size = upd.total > 0 ? " · " + formatSize(upd.bytes) + " of " + formatSize(upd.total) : "";
  return (upd.phase === "paused" ? "Paused at " : "") + upd.pct + "%" + size;
}
function paintUpdateCard() {
  paintDownloads();
  const card = $("downloads").querySelector(".app-update");
  if (!card) return;
  const bar = card.querySelector(".progress");
  if (bar) {
    bar.setAttribute("aria-valuenow", String(upd.pct));
    card.querySelector(".progress-fill").style.transform = "scaleX(" + upd.pct / 100 + ")";
  }
  card.querySelector(".status-text").textContent = updStatus();
}

function clearFinished() {
  state.finished = [];
  renderDownloads();
  $("downloadsBack").focus();
}

function doneRunCard(e) {
  const r = e.run;
  const name = r.folder && folderPages(r.folder).length ? folderPages(r.folder)[0].folder : null;
  const saved = r.files ? (r.saved === 1 ? "1 file added" : (r.saved || "No") + " files added")
    : r.saved ? countLine(r.saved) + (r.again ? " saved again" : " saved") : "Nothing saved";
  return el("div", { class: "card done-run wide", role: "group", "aria-label": (r.folder || "Several clips") + ", done" },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, r.site),
      el("span", { class: "card-title", dir: "auto" }, r.folder || r.label || "Several clips"),
      el("span", { class: "card-status" }, [saved, r.stopped ? "Stopped" : null, whenText(e.at)].filter(Boolean).join(" · ")),
      name ? el("span", { class: "card-actions" },
        el("button", { class: "btn-small", type: "button", onclick: () => toLibrary().then(() => openFolder(name)) }, "Open")) : null,
      failedList(r)));
}

function donePageCard(p, e) {
  const thumb = thumbUrl(p);
  return el("div", { class: "card done-page wide" },
    el("button", { class: "card-open", type: "button", "aria-label": p.title, onclick: () => toLibrary().then(() => openPage(p.id)) }),
    thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p),
    el("span", { class: "card-body" },
      el("span", { class: "card-site", dir: "auto" }, p.site, p.folder ? " · " + p.folder : null),
      el("span", { class: "card-title", dir: "auto" }, p.title),
      el("span", { class: "card-status" }, "Saved " + whenText(e.at),
        p.missing ? " · " : null, p.missing ? el("span", { class: "warn" }, p.missing + (p.missing === 1 ? " preview" : " previews") + " missing") : null)));
}

// The bar's Downloads button: a ring filling with everything being
// downloaded together, and a warning dot once only pages that couldn't
// be saved are left. The app's own notification (Android) says
// the same.
let toldNative = "";
function paintDownloads() {
  paintSync();
  const active = [...runs];
  const singles = state.saving.filter((s) => !s.error && !(s.run && !s.run.done));
  let units = 0, got = 0;
  for (const r of active) {
    if (r.total) { units += r.total; got += runShare(r) * r.total; }
    else { const page = r.current && !r.current.waiting ? savingShare(r.current) || 0 : 0; units += r.saved + r.failed + 1; got += r.saved + r.failed + page; }
  }
  for (const s of singles) { units += 1; got += s.waiting ? 0 : savingShare(s) || 0; }
  const app = upd.phase === "downloading";
  if (app) { units += 1; got += upd.pct / 100; }
  const busy = units > 0;
  const share = busy ? Math.min(1, got / units) : 0;
  const failed = !busy && state.saving.some((s) => s.error);
  const btn = $("downloadsBtn");
  btn.classList.toggle("busy", busy);
  btn.classList.toggle("failed", failed);
  btn.querySelector(".dl-ring-fill").style.strokeDashoffset = String(100 - share * 100);
  btn.setAttribute("aria-label", busy ? "Downloads, " + Math.round(share * 100) + "% done"
    : failed ? "Downloads, some clips couldn't be saved" : "Downloads");
  if (!busy) {
    // A sync (and its pictures) keeps the same notification while it
    // runs, so it goes on with the app in the background (0.30.4).
    const sync = syncNote();
    if (sync) {
      const said = JSON.stringify(sync);
      if (said !== toldNative) { toldNative = said; C.platform.downloads.update(sync); }
      return;
    }
    if (toldNative) C.platform.downloads.stop();
    toldNative = "";
    return;
  }
  const one = active.length === 1 && !singles.length ? active[0] : null;
  const title = app && units === 1 ? "Downloading Waypage " + upd.latest : one ? (one.files ? "Adding " + one.label : (one.again ? "Saving again in " : "Saving into ") + (one.folder || "your library"))
    : !active.length && singles.length === 1 ? "Saving a clip from " + singles[0].site : "Saving " + Math.round(units) + " clips";
  const text = app && units === 1 ? upd.pct + "% done" : one ? (one.total ? one.saved + one.failed + " of " + one.total + " done" : countLine(one.saved) + " saved") + (one.paused ? " · Paused" : "")
    : Math.round(share * 100) + "% done";
  const o = { title, text, done: Math.round(share * 1000), total: 1000 };
  const said = JSON.stringify(o);
  if (said === toldNative) return;
  toldNative = said;
  C.platform.downloads.update(o);
}

function openDownloads(fromHistory) {
  if (state.downloads) return;
  state.downloads = true;
  renderDownloads();
  if (!fromHistory) history.pushState({ view: "downloads" }, "");
  $("downloadsBody").scrollTop = 0;
  pushScreen($("downloadsView")).then(() => $("downloadsBack").focus());
}

function closeDownloads() {
  if (!state.downloads) return;
  state.downloads = false;
  popScreen($("downloadsView"));
}

function savingCard(s) {
  return el("div", { class: "card saving wide", role: "group", "aria-label": "Saving " + s.site },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, s.site),
      el("span", { class: "card-title", dir: "auto" }, s.url),
      el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status accent" },
        s.waiting ? null : el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { class: "status-text" }, savingStatus(s))),
      s.offline ? el("span", { class: "card-actions" },
        el("button", { class: "btn-quiet", type: "button", onclick: () => dropLater(s) }, "Remove")) : null));
}

// Progress lands in the card that's already there, so the bar grows on
// its spring instead of being redrawn at each image.
function updateSavingCard(s) {
  if (s.run && !s.run.done) { updateRunCard(s.run); return; }
  paintDownloads();
  const card = $("downloads").querySelector('[data-key="' + CSS.escape("s:" + s.key) + '"]');
  if (!card || s.error) return;
  const share = savingShare(s);
  const bar = card.querySelector(".progress");
  bar.classList.toggle("busy", share == null && !s.waiting);
  if (share == null) bar.removeAttribute("aria-valuenow");
  else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
  card.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
  const status = card.querySelector(".card-status");
  if (!s.waiting && !status.querySelector(".spinner")) status.prepend(el("span", { class: "spinner", "aria-hidden": "true" }));
  status.querySelector(".status-text").textContent = savingStatus(s);
}

// The seconds on a slow save tick on their own.
setInterval(() => { for (const s of state.saving) if (!s.error && !s.waiting) updateSavingCard(s); }, 1000);

// "Finished" once read to the end, "6 min left" part way, else the length.
function readingLine(p) {
  if (p.finished) return "Finished";
  if (p.at > 0.02) return Math.max(1, Math.ceil(p.minutes * (1 - p.at))) + " min left";
  return p.minutes + " min";
}

// Only what needs a look gets a word: missing previews, or images that
// load online only. Anything else is ready offline, which goes unsaid.
// Continue reading's card shows its collection's cover, when it has one.
function pageCard(p, found, hero) {
  const cover = hero && p.folder ? coverUrl(folderPages(p.folder)) : null;
  const thumb = thumbUrl(p);
  const facts = [readingLine(p), formatSize(p.bytes || 0)].join(" · ");
  const started = !p.finished && p.at > 0.02;
  const status = p.missing
    ? el("span", { class: "warn" }, p.missing + (p.missing === 1 ? " preview" : " previews") + " missing")
    : p.cut ? el("span", { class: "warn" }, "Only the start")
    : p.mode === "links" ? el("span", null, "Images online") : null;
  // The whole card opens the page (a button stretched under everything);
  // Retry sits above it, since a button can't hold another.
  const retry = p.missing && C.platform.native && navigator.onLine
    ? el("button", { class: "card-retry", type: "button", onclick: (e) => retryPreviews(p, e.currentTarget) }, "Retry")
    : null;
  return el("div", { class: "card page-card" + (hero ? " continue wide" : "") + (cover ? " has-cover" : ""), "data-ids": p.id },
    el("button", { class: "card-open", type: "button", "aria-label": p.title + (p.fav ? ", favourite" : ""), onclick: () => tapPages([p.id], () => openPage(p.id)) }),
    pickMark(),
    favThumb(p.fav, cover ? el("img", { class: "card-thumb cover", src: cover, alt: "", loading: "lazy" })
      : thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p)),
    el("span", { class: "card-body" },
      el("span", { class: "card-site", dir: "auto" }, p.site, p.folder ? " · " + p.folder : null, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, " · #" + t))),
      el("span", { class: "card-title", dir: "auto" }, p.title),
      found ? el("span", { class: "card-found", dir: "auto" }, found) : null,
      el("span", { class: "card-status" }, facts, status ? " · " : null, status, retry ? " · " : null, retry),
      started ? el("span", { class: "progress thin", role: "progressbar", "aria-label": "Read so far",
        "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.at * 100)) },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + p.at + ")" })) : null));
}

// A favourite's star sits on its picture's corner (1.16.0), not by its
// name; a picture is boxed to carry it.
const favStar = () => el("span", { class: "thumb-fav", "aria-hidden": "true" }, "★");
function favThumb(fav, thumb) {
  if (!fav) return thumb;
  if (thumb.tagName !== "IMG") { thumb.append(favStar()); return thumb; }
  const box = el("span", { class: thumb.className + " has-fav", "aria-hidden": "true" }, thumb, favStar());
  thumb.className = "";
  return box;
}

// A card with no picture shows its site: the icon on the preview tint,
// or the site's first letter when there's no icon to show.
function siteMark(p) {
  // A file with no picture shows what kind it is (0.31.0).
  if (p.file) return el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, el("span", { class: "site-letter file-ext" }, p.file.ext.toUpperCase()));
  const letter = el("span", { class: "site-letter" }, (p.site || "?").replace(/^www\./, "").charAt(0).toUpperCase());
  const box = el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, letter);
  const src = iconUrl(p);
  if (src) {
    const img = el("img", { src, alt: "", loading: "lazy" });
    img.addEventListener("load", () => { if (img.naturalWidth > 1) box.classList.add("has-icon"); });
    box.prepend(img);
  }
  return box;
}

// The circle a card shows while picking pages.
const pickMark = () => el("span", { class: "pick", "aria-hidden": "true" });

async function retryPreviews(p, btn) {
  btn.disabled = true;
  btn.textContent = "Retrying…";
  let res;
  try {
    res = await C.save.retryMissing(p, (done, total) => { btn.textContent = "Retrying " + done + " of " + total; });
  } catch (e) {
    res = null;
  }
  // A card whose content didn't change isn't rebuilt, so its button is reset here.
  btn.disabled = false;
  btn.textContent = "Retry";
  if (!res) { toast("Couldn't open this clip's file. Try again."); return; }
  if (res.got) {
    Object.assign(p, { missing: res.missing, thumb: res.thumb, bytes: (p.bytes || 0) + res.bytes });
    if (p.imageBytes != null) p.imageBytes += res.bytes;
    await C.store.writeIndex(state.pages);
  }
  toast(!res.got ? "Still couldn't get them. The site may be down; the images load online."
    : res.missing ? "Got " + res.got + ". " + res.missing + " still missing."
    : "All previews saved. Offline ready.");
  renderLibrary();
}

// ---- Search ----
// Titles, sites, tags and folders as you type; the pages' words after a
// pause. Matching ignores case, accents, Hebrew niqqud and Arabic
// harakat, and every word typed has to be there.

const fold = (s) => String(s || "").normalize("NFKD").replace(/[\p{M}\u0640]/gu, "").toLocaleLowerCase();
const terms = () => fold(state.query).split(/\s+/).filter(Boolean);
// id → { text, folded } once read; filled the first time a search needs it.
const texts = new Map();
let reading = null, searching = false;

function metaMatch(p, ts) {
  const hay = fold([p.title, p.site, p.folder, ...(p.tags || []).map((t) => "#" + t)].join(" "));
  return ts.every((t) => hay.includes(t));
}

// The sentence the words were found in, trimmed to a line or two.
function snippet(p, ts) {
  const got = texts.get(p.id);
  if (!got) return null;
  if (!ts.every((t) => got.folded.includes(t))) return null;
  const lines = got.text.split("\n");
  for (const line of lines) {
    const f = fold(line);
    if (!f.includes(ts[0])) continue;
    const sentences = line.split(/(?<=[.!?\u05C3\u06D4])\s+/);
    const s = sentences.find((x) => fold(x).includes(ts[0])) || line;
    if (s.length <= 160) return s;
    const at = Math.max(0, fold(s).indexOf(ts[0]) - 60);
    return (at ? "…" : "") + s.slice(at, at + 150).trim() + "…";
  }
  return null;
}

// Reads every page's text that isn't in memory yet: text.txt, or for a
// page saved before 0.16.0 its page.html, writing text.txt for next time.
function readTexts() {
  if (reading) return reading;
  const todo = state.pages.filter((p) => !texts.has(p.id));
  if (!todo.length) return Promise.resolve();
  reading = (async () => {
    let done = 0;
    for (const p of todo) {
      let text = await C.store.readText(p.id);
      if (text == null) {
        try {
          const html = await C.store.readPage(p.id);
          text = html ? C.save.plainText(new DOMParser().parseFromString(html, "text/html").body) : "";
          if (html) C.store.writeText(p.id, text).catch(() => {});
        } catch (e) { text = ""; }
      }
      texts.set(p.id, { text, folded: fold(text) });
      done++;
      if (todo.length > 10 && done % 5 === 0) searchNote("Searching the text of your clips · " + done + " of " + todo.length);
    }
  })().finally(() => { reading = null; });
  return reading;
}

function searchNote(text) {
  const note = $("searchNote");
  note.textContent = text || "";
  note.hidden = !text;
}

let searchTimer = null;
function onSearch() {
  state.query = $("librarySearch").value;
  $("searchClear").hidden = !state.query;
  renderLibrary();
  clearTimeout(searchTimer);
  if (!terms().length) { searching = false; searchNote(""); return; }
  searching = true;
  searchTimer = setTimeout(async () => {
    await readTexts();
    searching = false;
    searchNote("");
    if (terms().length) renderLibrary();
  }, 300);
}

function clearSearch() {
  $("librarySearch").value = "";
  onSearch();
}

// Search shows when its button is tapped, and stays while something is
// typed in it; empty, it goes away again (0.27.10).
let searchOpen = false;
function paintSearch() {
  const on = !!state.pages.length && (searchOpen || !!state.query);
  $("searchBox").hidden = !on;
  $("searchBtn").setAttribute("aria-expanded", String(on));
  $("searchBtn").classList.toggle("on", on);
}
function openSearch() {
  searchOpen = true;
  paintSearch();
  window.scrollTo({ top: 0, behavior: M.reduced() ? "auto" : "smooth" });
  $("librarySearch").focus({ preventScroll: true });
}
function closeSearch() {
  if (state.query) clearSearch();
  searchOpen = false;
  paintSearch();
}

// ---- Filters and order ----

const unread = (p) => !p.finished && !(p.at > 0.02);
function shown(p) {
  const f = state.filter;
  if (f === "unread") return unread(p);
  if (f === "finished") return !!p.finished;
  if (f === "favourites") return !!p.fav;
  if (f === "highlights") return !!(p.marks && p.marks.length);
  if (f.startsWith("#")) return (p.tags || []).some((t) => sameTag(t, f.slice(1)));
  return true;
}

const FILTER_NAMES = { unread: "Unread", finished: "Finished", favourites: "Favourites", highlights: "Highlighted" };
const filterName = () => FILTER_NAMES[state.filter] || state.filter;

function setFilter(f) {
  state.filter = f;
  store(FILTER_KEY, f);
  renderLibrary();
}

// Show and Order (0.28.0), over everything the library lists: one
// dropdown each, so a long tag list waits in a menu instead of a row of
// capsules. Rebuilt only when what they show changes, so a save landing
// doesn't close a menu that's open.
function renderTools() {
  const tags = allTags();
  const sig = [state.pages.length > 0, state.filter, state.sort, state.pages.some((p) => p.marks && p.marks.length), tags.join("\u0000")].join("|");
  if (libTools.dataset.sig === sig) return;
  libTools.dataset.sig = sig;
  libTools.hidden = !state.pages.length;
  if (libTools.hidden) return;
  fill(libTools, dropdown({
    label: "Show", cls: "start show-wrap" + (state.filter === "all" ? "" : " on"),
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    options: [{ value: "all", label: "All clips" }, { value: "unread", label: "Unread" }, { value: "finished", label: "Finished" }, { value: "favourites", label: "Favourites" },
      ...(state.pages.some((p) => p.marks && p.marks.length) || state.filter === "highlights" ? [{ value: "highlights", label: "Highlighted" }] : []),
      ...(tags.length ? [{ head: "Tags" }, ...tags.map((t) => ({ value: "#" + t, label: "#" + t }))] : [])],
    value: state.filter,
    onpick: setFilter,
  }), el("div", { class: "lib-tools-end" }, sortControl()));
}


const SORTS = [["saved", "Newest saved"], ["read", "Last read"], ["length", "Longest"], ["site", "Site"]];
const BY = {
  saved: (a, b) => (b.savedAt || 0) - (a.savedAt || 0),
  read: (a, b) => (b.readAt || 0) - (a.readAt || 0) || (b.savedAt || 0) - (a.savedAt || 0),
  length: (a, b) => (b.minutes || 0) - (a.minutes || 0),
  site: (a, b) => (a.site || "").localeCompare(b.site || "") || a.title.localeCompare(b.title),
};
const sorted = (list) => [...list].sort(BY[state.sort] || BY.saved);

function sortControl() {
  return dropdown({
    label: "Order", cls: "end sort-wrap",
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    options: SORTS.map(([value, label]) => ({ value, label })),
    value: BY[state.sort] ? state.sort : "saved",
    onpick: (v) => { state.sort = v; store(SORT_KEY, v); renderLibrary(); },
  });
}

// Our own dropdown (0.26.0), in place of the system's <select>: a
// button showing the choice, and a small menu that arrives under it.
// Arrow keys move through it, Escape or a tap outside puts it away.
function dropdown(o) {
  let value = o.value;
  const face = el("span", { class: "dropdown-face" });
  const btn = el("button", { class: "dropdown-btn", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" }, face);
  if (o.icon) btn.insertAdjacentHTML("afterbegin", o.icon);
  btn.insertAdjacentHTML("beforeend", '<svg class="dropdown-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
  const wrap = el("div", { class: "dropdown " + (o.cls || "") }, btn);
  const show = () => {
    const at = o.options.find((x) => !x.head && x.value === value) || (o.placeholder ? { label: o.placeholder } : o.options[0]);
    const empty = !!o.placeholder && at.label === o.placeholder;
    face.textContent = at.label;
    face.style.cssText = at.style || "";
    face.classList.toggle("unset", empty);
    btn.setAttribute("aria-label", empty ? o.label : o.label + ": " + at.label);
  };
  let menu = null;
  const outside = (e) => { if (!wrap.contains(e.target)) close(false); };
  function close(focus) {
    if (!menu) return;
    const m = menu;
    menu = null;
    m.style.pointerEvents = "none";
    btn.setAttribute("aria-expanded", "false");
    const g = wrap.closest(".group");
    document.removeEventListener("pointerdown", outside, true);
    M.popInto(m, btn.getBoundingClientRect()).then(() => { m.remove(); if (g && !menu) g.classList.remove("menu-open"); });
    if (focus) btn.focus();
  }
  // In a sheet or other scrolling box (0.34.1), a menu fits inside it:
  // it opens upward when there's more room above and scrolls in itself,
  // so the box under it doesn't scroll and stay moved. On the page, a
  // menu opened low on the screen scrolls the page up instead.
  function fit(m) {
    let box = null;
    for (let p = wrap.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowY)) { box = p.getBoundingClientRect(); break; }
    }
    if (!box) { m.scrollIntoView({ block: "nearest" }); return false; }
    const b = btn.getBoundingClientRect(), gap = 8, need = m.scrollHeight;
    const below = Math.min(box.bottom, innerHeight) - b.bottom - gap;
    const above = b.top - Math.max(box.top, 0) - gap;
    const up = need > below && above > below;
    m.classList.toggle("up", up);
    if (need > (up ? above : below)) m.style.maxHeight = Math.max(up ? above : below, 132) + "px";
    return up;
  }
  function open() {
    const nodes = o.options.map((x) => {
      if (x.head) return el("div", { class: "dropdown-head", role: "presentation" }, x.head);
      const check = el("span", { class: "dropdown-check", "aria-hidden": "true" });
      if (x.value === value) check.innerHTML = CHECK;
      return el("button", { class: "dropdown-item", type: "button", role: "option", "aria-selected": String(x.value === value),
        onclick: () => { const changed = x.value !== value; value = x.value; show(); close(true); if (changed) o.onpick(x.value); } },
        el("span", { class: "dropdown-text", dir: "auto", style: x.style || null }, x.label, x.sample || null), check);
    });
    const items = nodes.filter((x) => x.tagName === "BUTTON");
    menu = el("div", { class: "dropdown-menu", role: "listbox", "aria-label": o.label }, ...nodes);
    menu.addEventListener("keydown", (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); items[e.key === "Home" ? 0 : items.length - 1].focus(); }
      else if (e.key === "Tab") close(false);
    });
    wrap.append(menu);
    btn.setAttribute("aria-expanded", "true");
    const g = wrap.closest(".group");
    if (g) g.classList.add("menu-open");
    fit(menu);
    M.popFrom(menu, btn.getBoundingClientRect());
    document.addEventListener("pointerdown", outside, true);
    (items.find((b) => b.getAttribute("aria-selected") === "true") || items[0]).focus({ preventScroll: true });
  }
  btn.addEventListener("click", () => (menu ? close(true) : open()));
  btn.addEventListener("keydown", (e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !menu) { e.preventDefault(); open(); } });
  show();
  wrap.set = (v) => { value = v; show(); };
  return wrap;
}

const sectionHead = (label, extra) => el("div", { class: "section-head wide" }, el("h2", { class: "overline" }, label), extra || null);
// A section's head that opens it alone (0.30.2): every collection in a
// grid, or just the pages in none.
const partHead = (part, label) => el("div", { class: "section-head wide" },
  el("h2", { class: "overline" }, el("button", { class: "section-link", type: "button", onclick: () => openPart(part) },
    label, el("span", { class: "section-chev", "aria-hidden": "true" }, "›"))));
function openPart(part, fromHistory) {
  if (!fromHistory) history.pushState({ view: "part", part }, "");
  changePart(part);
}
// Collections or Clips opening alone, and back (1.11.0): the section
// grows into the whole view. What stays (the collections, the clips)
// slides from where it was to where it lands; what goes leaves past the
// top or bottom edge, whichever side of the section it was on, and
// what's new comes in from that side.
let flipping = false;
function changePart(part) {
  const before = libSnap();
  flipping = true;
  try { state.part = part; renderLibrary(); if (part) scrollTo(0, 0); } finally { flipping = false; }
  libFlip(before);
}
// The cards, tiles and section heads on screen now, by what they show.
function libSnap() {
  const m = new Map();
  if ($("libraryView").inert || $("libraryView").hidden) return m;
  const all = $("library").querySelectorAll(".card, .tile, .section-head");
  for (let i = 0; i < all.length && m.size < 120; i++) {
    const n = all[i], id = n.dataset.name ? "f:" + n.dataset.name : n.dataset.ids ? "p:" + n.dataset.ids : "h:" + n.textContent;
    if (m.has(id)) continue;
    const r = n.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
    m.set(id, { n, r });
  }
  return m;
}
// small: a card or two arrived or left, which grow in and shrink away
// where they are; otherwise they come and go past the screen's edges.
function libFlip(before, small) {
  if (!before.size || M.reduced()) return;
  const after = libSnap(), moved = new Map(), enter = [];
  let y = null;
  for (const [id, a] of after) {
    const b = before.get(id);
    if (b) { moved.set(a.n, b.r); if (y == null) y = a.r.top; }
  }
  if (y == null) y = innerHeight / 2;
  for (const [id, a] of after) {
    if (before.has(id)) continue;
    if (small) M.appear(a.n);
    else enter.push([a.n, [{ transform: M.fromPast(a.r, a.r.top < y ? "top" : "bottom") }, { transform: "none" }]]);
  }
  M.flip(moved, enter);
  for (const [id, b] of before) {
    if (after.has(id)) continue;
    if (small) { const g = ghost(b.n, b.r); M.vanish(g).finally(() => g.remove()); }
    else M.ghostOut(b.n, b.r, b.r.top < y ? "top" : "bottom");
  }
}
function ghost(n, r) {
  const g = n.cloneNode(true);
  g.removeAttribute("id");
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", margin: "0", pointerEvents: "none", zIndex: "1", boxSizing: "border-box" });
  document.body.appendChild(g);
  return g;
}

// The page to carry on with: the one read last that isn't finished.
function continuePage() {
  // The clip read last, finished just now (1.10.1): in a collection, the
  // next one in it to read, rather than whatever other clip was read
  // before it. Otherwise the clip read last that isn't finished.
  const last = state.pages.reduce((a, p) => ((p.readAt || 0) > ((a && a.readAt) || 0) ? p : a), null);
  if (last && last.finished && last.folder) {
    const list = folderPages(last.folder);
    const i = folderNextIndex(list);
    if (i >= 0) return list[i];
  }
  const going = state.pages.filter((p) => !p.finished && p.at > 0.02);
  return going.sort((a, b) => (b.readAt || 0) - (a.readAt || 0))[0] || null;
}

// Folders, the one read last first, then the newest made. Pages landing
// in one don't move it (1.1.0).
function foldersByUse() {
  const last = (name) => { const list = folderPages(name);
    return Math.max(...list.map((p) => p.readAt || 0), Math.min(...list.map((p) => p.savedAt || 0))); };
  return allFolders().map((n) => [n, last(n)]).sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// A collection as one item among pages, for the library's order: when
// it was made (its first page), the page read last, its length and its
// site. Made, not its newest page: pages downloading into collections
// reshuffled them with every one that landed (1.1.0).
function asItem(name) {
  const list = folderPages(name);
  return { folder: name, title: name, site: list[0].site,
    savedAt: Math.min(...list.map((p) => p.savedAt || 0)),
    readAt: Math.max(...list.map((p) => p.readAt || 0)),
    minutes: list.reduce((n, p) => n + (p.minutes || 0), 0) };
}

// One list's groups: by day under Newest saved and Last read, by site
// under Site, none under Longest.
function groupOf(x) {
  if (state.sort === "site") return x.site || "";
  if (state.sort === "length") return "";
  const t = state.sort === "read" ? x.readAt : x.savedAt;
  if (!t) return "Not started";
  const day = 864e5, start = new Date().setHours(0, 0, 0, 0);
  return t >= start ? "Today" : t >= start - day ? "Yesterday" : t >= start - 6 * day ? "This week"
    : t >= start - 29 * day ? "This month" : "Earlier";
}

const layout = () => { const v = load(LAYOUT_KEY, "shelf"); return LAYOUTS.some((l) => l.value === v) ? v : "shelf"; };

const pageSig = (p) => [p.title, readingLine(p), p.missing, p.thumb, Math.round((p.at || 0) * 50), navigator.onLine, (p.tags || []).join(","), p.folder, p.mode, !!p.fav].join("|");

// The pages the library is showing, for Select all.
let onScreen = [];

// Cards are keyed and kept between renders; only ones that weren't there
// before arrive on a spring, so a re-render never replays the list.
// Show and Order sit over everything. Shelf and Grid are in sections:
// Continue reading (unless it's turned off, or something is filtered),
// Collections, then the pages in no collection. One list puts the
// collections among those pages, in groups. A tag filter lists every
// page it matches, collections' pages too; a search lists only what it
// found.
let firstRender = true;
let loaded = false;
const FIRST_SCREEN = 30;
// After the first screen the rest come this many at a time, each in a
// task of its own (1.7.1): two thousand clips in one go held a slow
// phone's taps and scrolling up for over a second after they showed.
const NEXT_SCREENS = 150;
let drawUpTo = FIRST_SCREEN, moreTimer = 0;
// Android's version, from the Files plugin (0.33.0): what the storage
// places and the empty library's way back (1.1.0) offer.
let androidSdk = 0;
function renderLibrary() {
  const before = flipping || firstRender ? null : libSnap();
  const root = $("library");
  const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
  const n = state.pages.length;
  // A tag filter whose last page lost the tag (or was deleted) falls back to All.
  if (n && state.filter.startsWith("#")
    && !allTags().some((t) => sameTag(t, state.filter.slice(1)))) { state.filter = "all"; store(FILTER_KEY, "all"); }
  renderTools();
  // Until the library is read nothing is said (1.2.0): the empty state
  // showed for the second it took, as if there were no clips.
  $("libraryMeta").textContent = n ? pagesLine(n) : loaded ? "Nothing saved yet" : "";
  $("searchBtn").hidden = !n;
  paintSearch();
  const how = layout();
  $("libraryView").dataset.layout = how;
  const nodes = [];
  const fresh = [];
  // A kept card whose content changed (reading progress, a renamed page)
  // is rebuilt in place, without arriving again.
  const keep = (key, make, sig) => {
    let node = old.get(key);
    if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
    else if (sig != null && node.dataset.sig !== sig) { node = make(); node.dataset.key = key; }
    if (sig != null) node.dataset.sig = sig;
    nodes.push(node);
  };
  const ts = terms();
  const found = new Map();
  const pages = sorted(state.pages.filter(shown).filter((p) => {
    if (!ts.length) return true;
    if (metaMatch(p, ts)) return found.set(p.id, null), true;
    const s = snippet(p, ts);
    if (s) return found.set(p.id, s), true;
    return false;
  }));
  onScreen = pages;
  // Unread and Finished keep collections whole: a collection shows when
  // it has an unread page, or when all of it is read.
  const status = state.filter === "unread" || state.filter === "finished";
  // Favourites shows the favourite collections, then every favourite
  // clip, in a collection or not (0.30.9).
  const favs = state.filter === "favourites";
  const flat = ts.length || (state.filter !== "all" && !status && !favs);
  const folders = flat ? [] : allFolders().filter((f) => favs ? folderFav(f) : !status
    || (state.filter === "unread" ? folderPages(f).some(unread) : folderPages(f).every((x) => x.finished)));
  const folderSig = (f) => [f, freshCount(f), folderFav(f), ...folderPages(f).map((x) => x.id + readingLine(x) + (x.thumb || "") + (x.cover || ""))].join("|");
  if (!ts.length && state.filter === "all" && !state.part) {
    const going = !state.select && load(CONTINUE_KEY, true) && continuePage();
    if (going) {
      keep("h:continue", () => sectionHead("Continue reading"));
      keep("c:" + going.id, () => pageCard(going, null, true), pageSig(going));
    }
  }
  const loose = flat || favs ? pages : pages.filter((p) => !p.folder);
  // The first draw of a big library shows a screen's worth of cards and
  // draws the rest right after (1.2.1): every card at once held the
  // first paint back on a phone.
  const first = loaded && firstRender ? drawUpTo : Infinity;
  let more = false;
  const some = (list) => { if (list.length <= first) return list; more = true; return list.slice(0, first); };
  if (how === "list" && !flat) {
    const items = some(sorted([...folders.map(asItem), ...loose]));
    let group = null;
    for (const x of items) {
      const g = groupOf(x);
      if (g && g !== group) keep("h:g:" + g, () => sectionHead(g));
      group = g;
      if (x.id) keep("p:" + x.id, () => pageCard(x), pageSig(x));
      else keep("t:" + x.folder, () => { const t = folderTile(x.folder); t.removeAttribute("role"); return t; }, folderSig(x.folder));
    }
  } else {
    const part = !flat && state.part;
    const back = () => keep("h:part:" + part, () => el("div", { class: "section-head wide part-head" },
      el("button", { class: "btn-quiet part-back", type: "button", onclick: () => history.back() },
        el("span", { "aria-hidden": "true" }, "‹ "), "Library")));
    if (part) back();
    // Files of your own (0.31.0) are a part of their own after Clips,
    // unless a search or filter lists everything together.
    // Files are the clips that read from a file of your own; a copy is
    // a clip like any other (0.32.0).
    const apart = !ts.length && state.filter === "all";
    const mine = apart ? loose.filter((p) => p.link) : [];
    const clips = apart ? loose.filter((p) => !p.link) : loose;
    if (folders.length && (!part || part === "collections")) {
      const names = sorted(folders.map(asItem)).map((x) => x.folder);
      const label = "Collections · " + names.length;
      if (part) keep("h:folders:all", () => sectionHead(label), label);
      else keep("h:folders", () => partHead("collections", "Collections"));
      // The strip stays and only its changed tiles are drawn again (1.1.1):
      // drawn whole, it lost where it was scrolled to with every page
      // that landed in a collection.
      keep(part ? "folders:all" : "folders", () => { const strip = foldersStrip([]); if (part) strip.classList.add("folder-grid"); return strip; });
      fillStrip(nodes[nodes.length - 1], names, folderSig);
    }
    if (clips.length && (!part || part === "pages")) {
      const label = (ts.length ? "Found" : state.filter === "all" ? "Clips"
        : (status || favs) && folders.length ? filterName() + " clips" : filterName()) + " · " + clips.length;
      if (part || ts.length || (!folders.length && !mine.length)) keep("h:pages", () => sectionHead(label), label);
      else keep("h:pages", () => partHead("pages", label), "link" + label);
    }
    if (!part || part === "pages") for (const p of some(clips)) {
      if (ts.length) {
        const s = found.get(p.id);
        keep("q:" + p.id, () => pageCard(p, s), [pageSig(p), s].join("|"));
      } else keep("p:" + p.id, () => pageCard(p), pageSig(p));
    }
    if (mine.length && (!part || part === "files")) {
      const label = "Files · " + mine.length;
      if (part || (!folders.length && !clips.length)) keep("h:files", () => sectionHead(label), label);
      else keep("h:files", () => partHead("files", label), "link" + label);
      for (const p of some(mine)) keep("p:" + p.id, () => pageCard(p), pageSig(p));
    }
  }
  if (n && !pages.length && ts.length) {
    keep("none:q", () => el("div", { class: "empty wide" },
      el("p", { class: "empty-text", "data-q": "" }),
      el("button", { class: "btn-quiet", type: "button", onclick: clearSearch }, "Clear search")));
    nodes[nodes.length - 1].querySelector("[data-q]").textContent = searching ? "Searching…"
      : "Nothing matches “" + state.query.trim() + "”" + (state.filter === "all" ? "." : " in " + filterName() + ".");
  } else if (n && !loose.length && !folders.length) {
    keep("none:" + state.filter, () => el("div", { class: "empty wide" },
      el("p", { class: "empty-text" }, state.filter === "unread" ? "You've started everything you saved."
        : state.filter === "finished" ? "Nothing finished yet."
        : state.filter === "favourites" ? "No favourites yet. Hold a clip, or open a collection's ⋯, and tap Favourite." : "No clips tagged " + state.filter + "."),
      el("button", { class: "btn-quiet", type: "button", onclick: () => setFilter("all") }, "Show all")));
  }
  // Until it's read, the library says it's on its way (1.7.1); the first
  // one is in index.html, there before any script runs.
  if (!loaded) keep("loading", () => el("div", { class: "lib-loading wide", role: "status" }, el("span", { class: "spinner", "aria-hidden": "true" }), "Opening your library"));
  if (!n && loaded) {
    keep("empty", () => el("div", { class: "empty wide" },
      el("h2", { class: "empty-title" }, "Clips you take with you"),
      el("p", { class: "empty-text" }, C.platform.native
        ? "Share a page to Waypage from your browser, or paste its link below. It stays readable with no connection, with a link back to the original."
        : "Paste a Wikipedia link below, or bring the clips you saved on your phone: back up there, then open the backup here."),
      el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => pickFile() }, "Open a file"),
      // After a reinstall Android hides what the last install kept in
      // Documents/Waypage until it's picked again (1.1.0).
      C.platform.android && C.platform.files.canPickFolder && C.store.place.kind === "app" && androidSdk >= 30
        ? el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => changePlace("folder", "Documents/Waypage") }, "Get back your library from Documents") : null,
      C.platform.native ? null : el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => openSettings(false, "storage") }, "Open a backup")),
    [androidSdk, C.store.place.kind].join("|"));
  }
  // Nodes that stay are left where they are and only what changed moves
  // (1.1.1): taking them all out and back reset every strip's scroll.
  const wanted = new Set(nodes);
  for (const c of [...root.children]) if (!wanted.has(c)) c.remove();
  nodes.forEach((node, i) => { if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null); });
  // A card or two arriving grows in and the cards around it slide to
  // make room (1.11.0); a whole new list (a filter, a search) is just
  // drawn, as two hundred animations at once dropped it to a few frames
  // a second.
  if (before && fresh.length <= 6 && old.size - (nodes.length - fresh.length) <= 6) libFlip(before, true);
  if (more && !moreTimer) moreTimer = setTimeout(() => { moreTimer = 0; drawUpTo += NEXT_SCREENS; renderLibrary(); }, 0);
  else if (loaded && firstRender) { firstRender = false; warmPdf(); }
  paintPicks();
  renderDownloads();
  if (state.place === "feeds") renderFeeds();
  if (state.place === "highlights") renderHighlights();
  if (sideShown()) renderSide();
}

// The first link in whatever was pasted or shared ("Read this:
// https://…"), or the text itself as a link when it looks like one
// without its https://.
function linkFrom(text) {
  const t = String(text).trim();
  const m = t.match(/https?:\/\/[^\s<>"]+/i);
  if (m) return m[0].replace(/[).,;!?]+$/, "");
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return "https://" + t;
  return null;
}

// Every link in a paste or share, in order and once each. A text field
// drops line breaks, so a link also ends where the next one starts.
function linksFrom(text) {
  const out = [];
  for (const m of String(text).match(/https?:\/\/.+?(?=https?:\/\/|[\s<>"]|$)/gi) || []) {
    const url = m.replace(/[).,;!?]+$/, "");
    if (!out.some((u) => sameUrl(u, url))) out.push(url);
  }
  return out;
}

// One rule for when two addresses are the same clip, shared with sync
// (and its worker, 1.2.1).
const urlKey = C.sync.urlKey;
const sameUrl = C.sync.sameUrl;
// Every clip by each of its addresses, kept while the pages are the same
// objects with the same addresses (1.2.0): savedAs is asked many times
// a redraw, and each ask was a pass over every clip.
let urlCache = { list: [], u: [], r: [], by: new Map() };
function urlIndex() {
  const pages = state.pages, c = urlCache;
  let same = c.list.length === pages.length;
  for (let i = 0; same && i < pages.length; i++) { const p = pages[i]; same = c.list[i] === p && c.u[i] === p.url && c.r[i] === p.requested; }
  if (same) return c.by;
  const by = new Map();
  for (const p of pages) {
    for (const u of [p.url, p.requested]) {
      if (!u) continue;
      const k = urlKey(u);
      if (!by.has(k)) by.set(k, p);
    }
  }
  urlCache = { list: pages.slice(), u: pages.map((p) => p.url), r: pages.map((p) => p.requested), by };
  return by;
}
const savedAs = (url) => (url ? urlIndex().get(urlKey(url)) || null : null);
// Being saved now, or waiting to be: a page sync is bringing in from its
// link counts, under either of its addresses (1.1.0). Missing those let
// Save new chapters save again what sync was already fetching.
const savingAs = (url) => state.saving.some((s) => !s.error && (sameUrl(s.url, url)
  || (s.synced && (sameUrl(s.synced.url, url) || sameUrl(s.synced.requested, url)))));
const newJob = (url, folder) => ({ key: url, url, site: C.save.siteName(url), done: 0, total: null, error: null, folder: folder || null });

async function savePage(url, folder, how) {
  const existing = savedAs(url);
  if (existing) { toast("Already in your library"); openPage(existing.id); return; }
  if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) return;
  state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
  const job = { ...newJob(url, folder), ...how };
  state.saving.unshift(job);
  renderLibrary();
  toast(waitsForWifi(DATA_SAVE_KEY) ? "It saves when you're on Wi-Fi. It's in Downloads." : "Saving. It's in Downloads.");
  await wifiGate(job);
  if (!state.saving.includes(job)) return;
  job.waiting = false;
  const meta = await runJob(job);
  if (meta) savedToast(meta);
  if (meta && !C.platform.native) C.store.keepStored();
  else if (job.contents) contentsFound(job);
}

// Save for later, offline (1.14.0): the link waits in Downloads, and in
// waypage.later so closing the app keeps it, and saves once the phone is
// back online (saveWaiting, on the online event and at start).
const LATER_KEY = "waypage.later";
function saveLater(url, folder) {
  if (navigator.onLine || savedAs(url)) return savePage(url, folder);
  const list = load(LATER_KEY, []);
  if (!list.some((x) => sameUrl(x.url, url))) { list.push({ url, folder: folder || null }); store(LATER_KEY, list); }
  showWaiting();
  toast("It saves when you're back online. It's in Downloads.");
}
function showWaiting() {
  for (const x of load(LATER_KEY, [])) {
    if (!state.saving.some((s) => sameUrl(s.url, x.url))) state.saving.push({ ...newJob(x.url, x.folder), waiting: true, offline: true });
  }
  renderLibraryLater();
}
function dropLater(s) {
  store(LATER_KEY, load(LATER_KEY, []).filter((x) => !sameUrl(x.url, s.url)));
  state.saving = state.saving.filter((x) => x !== s);
  renderLibrary();
}
let savingWaiting = false;
async function saveWaiting() {
  const list = load(LATER_KEY, []);
  if (!loaded || !navigator.onLine || !list.length || savingWaiting) return;
  savingWaiting = true;
  store(LATER_KEY, []);
  state.saving = state.saving.filter((s) => !s.offline);
  try { for (const x of list) await savePage(x.url, x.folder || undefined); } finally { savingWaiting = false; }
}

// A link that turned out to be a contents page opens as a list to check.
function contentsFound(job) {
  dropFailed(job);
  openBatch(job.contents.links.join("\n"), false, folderName(job.contents.title || job.site), job.url);
  toast("That's a list of chapters. Check them, then save.");
}

// Waiting for Wi-Fi (1.4.1): with "Wait for Wi-Fi" on and the phone on
// mobile data, a save holds here, shown as waiting in Downloads, and goes
// on when the connection changes; the quiet fetches (pictures, feeds,
// new chapters) skip their turn instead.
const waitsForWifi = (key) => load(key, "any") === "wifi" && C.platform.metered;
const wifiWaiters = [];
async function wifiGate(job) {
  while (waitsForWifi(DATA_SAVE_KEY)) {
    if (job) { job.waiting = true; job.wifi = true; renderLibraryLater(); }
    await new Promise((go) => wifiWaiters.push(go));
  }
  if (job) job.wifi = false;
}
C.platform.onConnection(() => {
  if (C.platform.metered) return;
  while (wifiWaiters.length) wifiWaiters.shift()();
  if (!waitsForWifi(DATA_SYNC_KEY)) syncSoon(1000);
  fetchPictures();
  if (state.section === "sync" || state.section === "saving") renderSection();
});

// Saves one after another are half a second apart, as WebToEpub spaces
// them, so a long run doesn't hammer the site.
const PACE_MS = 500;

// Several links saved one after another, in order, optionally into a
// folder (so its pages follow the order of the links). A link already
// saved isn't saved again; it just joins the folder at its place.
// `tags` is a list for every link, or (an import, 1.9.0) a function
// giving each link its own { tags, finished }.
async function saveAll(all, folder, tags = [], mode, skipSaved, kind, source) {
  const name = folder ? folderName(folder) : null;
  const per = typeof tags === "function" ? tags : () => ({ tags });
  const places = skipSaved && name ? placesBetween(all, name) : new Map();
  const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
  const jobs = urls.filter((u) => !savingAs(u)).map((u) => ({ ...newJob(u, name), tags: [], ...per(u), mode, kind, source: name ? source : undefined }));
  state.saving = state.saving.filter((s) => !(s.error && jobs.some((j) => sameUrl(j.url, s.url))));
  const fresh = jobs.filter((j) => !savedAs(j.url));
  fresh.forEach((j) => { if (places.has(j.url)) j.folderAt = places.get(j.url); });
  const run = fresh.length > 1 ? startRun(name, fresh[0].site, fresh.length) : null;
  fresh.forEach((j) => { j.waiting = true; j.run = run; });
  state.saving = [...fresh, ...state.saving];
  renderLibrary();
  if (state.folder) renderFolder();
  if (run) toast("Saving " + countLine(fresh.length) + ". They're in Downloads.");
  let saved = 0, failed = 0, had = 0, stopped = 0;
  for (const job of jobs) {
    if (job.waiting && !state.saving.includes(job)) { stopped++; continue; }
    const existing = savedAs(job.url);
    if (existing) {
      had++;
      if (name) { joinFav(existing, name); existing.folder = name; existing.folderAt = Date.now(); if (source) existing.source = source; }
      if (job.tags.length) existing.tags = withTags(existing.tags, job.tags);
      if (name || job.tags.length) { await C.store.writeIndex(state.pages); renderLibrary(); if (state.folder) renderFolder(); }
      continue;
    }
    if (saved + failed) await new Promise((done) => setTimeout(done, PACE_MS));
    if (run && !(await gate(run))) { stopped++; continue; }
    await wifiGate(job);
    if (!state.saving.includes(job)) { stopped++; continue; }
    job.waiting = false;
    if (run) run.current = job;
    renderLibraryLater();
    if (await runJob(job)) { saved++; if (run) run.saved++; } else { failed++; if (run) run.failed++; }
    if (run) { run.current = null; updateRunCard(run); }
    renderLibraryLater();
  }
  endRun(run);
  if (run) renderLibrary();
  if (name && source) updateCover(name);
  if (!jobs.length) return;
  toast([saved ? "Saved " + countLine(saved) + (name ? " into " + name : "") : "",
    had ? had + " already saved" + (name && !saved ? ", now in " + name : "") : "",
    failed ? failed + " couldn't be saved" : "", stopped ? "stopped before " + countLine(stopped) : ""].filter(Boolean).join(" · ") + ".");
}

// Where new pages go in a folder when the pages around them in the list
// are already there: between their neighbours, in the list's order, so
// filling in chapters 1 to 40 under 41 to 60 puts them first. Links
// with no neighbour in the folder are left out (they go at the end).
function placesBetween(urls, name) {
  const at = urls.map((u) => {
    const p = savedAs(u);
    return p && p.folder && sameTag(p.folder, name) ? (p.folderAt || p.savedAt || 0) : null;
  });
  const out = new Map();
  for (let i = 0; i < urls.length;) {
    if (at[i] != null || savedAs(urls[i])) { i++; continue; }
    let j = i;
    while (j < urls.length && at[j] == null) j++;
    const gap = urls.slice(i, j).filter((u) => !savedAs(u));
    let back = i - 1;
    while (back >= 0 && at[back] == null) back--;
    const lo = back >= 0 ? at[back] : null, hi = j < urls.length ? at[j] : null;
    gap.forEach((u, k) => {
      if (lo != null && hi != null && hi > lo) out.set(u, lo + ((hi - lo) * (k + 1)) / (gap.length + 1));
      else if (hi != null) out.set(u, hi - (gap.length - k) / 1000);
      else if (lo != null) out.set(u, lo + (k + 1) / 1000);
    });
    i = j;
  }
  return out;
}

// A page landing while something moves (a screen sliding in, a sheet
// rising) redraws the library once it has settled (1.2.0): a redraw of
// a few hundred cards in the middle of a slide dropped its frames.
let renderWait = 0;
function renderLibraryLater() {
  if (renderWait) return;
  const go = () => {
    if (M.busy()) { renderWait = setTimeout(go, 120); return; }
    renderWait = 0;
    renderLibrary();
    if (state.folder) renderFolder();
  };
  renderWait = setTimeout(go, 0);
}

// Saves one queued link; resolves to its meta, or null when it failed
// (the card then says why and offers Try again).
// A save that fails in a way a second try often fixes goes again once,
// after a moment, before it shows as failed (1.10.1).
async function saveOnce(job, opts) {
  try {
    return await C.save.save(job.url, opts);
  } catch (e) {
    if (!(e instanceof C.save.SaveError) || !e.again || job.triedAgain) throw e;
    job.triedAgain = true;
    C.platform.log.note("save", (job.site || "") + ": " + e.message + " (trying again)");
    job.drawing = false;
    job.done = 0;
    updateSavingCard(job);
    await new Promise((go) => setTimeout(go, 1500));
    return C.save.save(job.url, opts);
  }
}

async function runJob(job) {
  job.started = Date.now();
  job.triedAgain = false;
  try {
    const meta = await saveOnce(job, {
      mode: job.mode || load(IMAGES_KEY, "previews"),
      kind: job.kind || "article",
      asPage: !!job.asPage,
      id: job.synced ? job.synced.id : undefined,
      archived: job.archived,
      onProgress: (p) => {
        if (p.stage === "drawing") job.drawing = true;
        if (p.stage === "images") { job.done = p.done; job.total = p.total; }
        updateSavingCard(job);
      },
    });
    const old = job.again;
    if (old) {
      // Saved again: the new copy takes the old one's place, keeping its
      // collection, tags and read position.
      for (const k of ["requested", "folder", "folderAt", "folderFav", "folderFavAt", "source", "tags", "at", "finished", "readAt", "readOn", "fav", "favAt", "marks"]) if (old[k] !== undefined) meta[k] = old[k];
      const i = state.pages.indexOf(old);
      if (i < 0) await C.store.removePage(meta.id);
      else {
        state.pages[i] = meta;
        await C.store.writeIndex(state.pages);
        await C.store.removePage(old.id);
      }
    } else if (job.synced) {
      // A synced page saved here from its link: the library's entry for
      // it, with this copy's text and pictures.
      for (const k of SYNCED_KEEP) if (job.synced[k] !== undefined) meta[k] = job.synced[k];
      if (state.pages.some((p) => p.id === meta.id)) await C.store.removePage(meta.id).catch(() => {});
      else { state.pages.unshift(meta); await indexSoon(); }
      syncSoon();
    } else {
      meta.requested = job.url;
      if (job.folder) { meta.folder = folderName(job.folder); meta.folderAt = job.folderAt || Date.now(); if (job.source) meta.source = job.source; }
      if (job.tags && job.tags.length) meta.tags = withTags([], job.tags);
      if (job.finished) meta.finished = true;
      state.pages.unshift(meta);
      await indexSoon();
    }
    state.saving = state.saving.filter((s) => s !== job);
    if (!job.run) finish({ key: "p:" + meta.id, page: meta.id });
    renderLibraryLater();
    return meta;
  } catch (e) {
    job.error = e instanceof C.save.SaveError ? e.message : "Couldn't save this clip. Try again.";
    job.gone = e instanceof C.save.SaveError && e.gone && !job.archived;
    if (e instanceof C.save.ContentsPage) job.contents = e.contents;
    if (!(e instanceof C.save.SaveError)) console.error(e);
    else C.platform.log.note("save", (job.site || "") + ": " + job.error);
    renderLibraryLater();
    return null;
  }
}
