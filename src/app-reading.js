// Waypage's shell (1.45.11 split): the reading look. Text size, line
// spacing, margins, alignment and fonts for saved pages, set from the
// reader's Aa sheet or Settings, and the fonts a person adds. See app.js
// for how the parts share.
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
  // Text weight (1.45.0): 400 is the font's regular; headings and bold
  // move with it.
  weight: { min: 300, max: 600, step: 25 },
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
// Your own fonts (1.33.0): files in the library's fonts folder, or added
// in Settings › Reading. Their names are kept here so a font you picked
// is known at once; the files load a moment later (loadUserFonts), into
// the app for the Font menu and into each clip's frame.
const USER_FONTS_KEY = "waypage.userFonts";
const FONT_EXT = /\.(ttf|otf|woff2?)$/i;
const userFamily = (name) => "Waypage " + name.replace(FONT_EXT, "").replace(/["\\]/g, "");
function setUserFonts(names) {
  for (let i = FONTS.length - 1; i >= 0; i--) if (FONTS[i].user) FONTS.splice(i, 1);
  const at = FONTS.findIndex((f) => f.value === "system");
  FONTS.splice(at, 0, ...names.map((name) => ({ value: "user:" + name, label: name.replace(FONT_EXT, ""), family: '"' + userFamily(name) + '"', kind: "serif", user: name })));
}
setUserFonts(load(USER_FONTS_KEY, []));
const fontBytes = new Map();
async function loadUserFonts() {
  const names = await C.store.listFonts();
  store(USER_FONTS_KEY, names);
  setUserFonts(names);
  for (const n of [...fontBytes.keys()]) if (!names.includes(n)) fontBytes.delete(n);
  for (const name of names) {
    if (fontBytes.has(name)) continue;
    try {
      const bytes = await C.store.readFont(name);
      const face = new FontFace(userFamily(name), bytes);
      await face.load();
      document.fonts.add(face);
      fontBytes.set(name, bytes);
    } catch (e) { console.warn("font " + name + " didn't load", e); }
  }
  paintReading();
  document.querySelectorAll(".reading-controls").forEach(syncReadingControls);
}
// Into a clip's frame, which runs no scripts: the faces are made from the
// bytes, so the frame's CSP (fonts from the app only) doesn't come into it.
const framed = new WeakMap();
function fontsInto(doc) {
  if (!doc || !doc.fonts || !doc.defaultView || !doc.defaultView.FontFace) return;
  const had = framed.get(doc) || new Set();
  for (const [name, bytes] of fontBytes) {
    if (had.has(name)) continue;
    try { doc.fonts.add(new doc.defaultView.FontFace(userFamily(name), bytes)); had.add(name); } catch (e) { /* that frame won't take it */ }
  }
  framed.set(doc, had);
}
window.Waypage.fontsInto = fontsInto;
const HEBREW = [
  { value: "auto", label: "Auto" },
  { value: "frank", label: "Frank Ruhl", family: '"Frank Ruhl Libre"' },
  { value: "david", label: "David", family: '"David Libre"' },
  { value: "assistant", label: "Assistant", family: '"Assistant"' },
  { value: "heebo", label: "Heebo", family: '"Heebo"' },
];
const MARGINS = { narrow: ["var(--s-3)", "44rem"], normal: ["20px", "38rem"], wide: ["var(--s-7)", "32rem"] };
const READING_DEFAULT = { size: 19, spacing: 1.6, letters: 0, words: 0, paras: 1, weight: 400, hyphens: true, font: "serif", hebrew: "auto", margins: "normal", align: "auto", layout: "scroll", spread: "auto", rail: true };
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
  r.hyphens = r.hyphens !== false;
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
  root.setProperty("--reader-wt", String(r.weight));
  document.documentElement.dataset.readAlign = r.align;
  document.documentElement.toggleAttribute("data-read-hyphens", r.hyphens);
  if (C.reader) C.reader.applyTheme();
}

function setReading(change) {
  const was = readingPrefs().layout;
  store(READING_KEY, { ...readingPrefs(), ...change });
  paintReading();
  if (C.reader && readingPrefs().layout !== was) { C.reader.setPaged(readingPrefs().layout === "pages"); volumeWatch(); }
  if (C.reader && "spread" in change) C.reader.setSpread(readingPrefs().spread);
  if ("rail" in change) fitRail();
  document.querySelectorAll(".reading-controls").forEach(syncReadingControls);
}
paintReading();
if (C.reader) C.reader.setSpread(readingPrefs().spread);
if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", () => { if (state.theme === "system") paintTheme("system"); });
