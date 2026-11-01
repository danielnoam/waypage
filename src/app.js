// Waypage: the shell. Version, theme, the library, saving, the reader and
// Settings, and the screens moving between them.
//
// The shell is app.js and the app-*.js files, loaded in order by
// index.html (seven parts in 1.14.0, thirteen since 1.45.11). They are
// plain scripts, not modules, so what one declares at its top level
// (const, let, function) the later ones see: one scope, as when this was
// a single function. The rule that keeps it working: what runs at load,
// rather than later on a tap or a timer, may only use what an earlier
// part, or its own, has declared. A part's functions can call into any
// part, since nothing is tapped until all of them have loaded. The order:
// app (this file: version, helpers, theme, state), app-reading,
// app-cards, app-downloads, app-search, app-draw, app-jobs, app-reader,
// app-library, app-saving, app-places, app-settings, app-lock, and
// app-start, which runs last and starts things up.
const APP_VERSION = "1.50.2";
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
const SCROLL_RATE_KEY = "waypage.scrollRate";
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
    else if (v != null) node.setAttribute(k, v);
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

// Pictures toned down in the dark themes (1.32.0), a switch in
// Appearance, on by default; the picture viewer shows them in full.
const DIM_KEY = "waypage.dimPictures";
function paintTheme(choice) {
  const theme = resolveTheme(choice);
  document.documentElement.dataset.theme = theme;
  document.documentElement.toggleAttribute("data-dim-pictures", !!(themeOf(theme) || {}).dark && load(DIM_KEY, true) !== false);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (C.reader) { if (typeof paintPdfDark === "function") paintPdfDark(); C.reader.applyTheme(); }
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
  // Whether the Sync screen is up (1.28.0).
  syncPage: false,
  // The part of the library shown alone ("collections", "pages"), or
  // null. Left unset, the first Back compared undefined with null and
  // redrew the whole library (1.28.2).
  part: null,
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
