// Waypage's shell, part 6 of 7 (1.14.0): Settings, making room and
// Report a problem. See app.js for how the parts share.
// ---- Settings ----
// Each group is data: a new setting is a new entry here, not new markup.

const SETTINGS = [
  {
    title: "Appearance",
    key: THEME_KEY,
    label: "Theme",
    get: () => state.theme,
    // The Auto boxes show only while Auto is picked (1.12.0).
    set: (v) => { setTheme(v); const a = $("autoSection"); if (a) a.hidden = v !== "system"; },
    options: [
      { value: "system", label: "Auto", note: "Your light and dark themes, following your phone", swatch: autoSwatch(), auto: true },
      ...THEMES.map((t) => ({ value: t.value, label: t.label, note: t.note, swatch: [t.value] })),
    ],
  },
  {
    title: "Saving",
    key: IMAGES_KEY,
    label: "Images",
    get: () => load(IMAGES_KEY, "previews"),
    set: (v) => { store(IMAGES_KEY, v); toast("New saves use " + v.replace("previews", "previews and links").replace("full", "full images").replace("links", "links only") + "."); },
    footnote: "Applies to clips you save from now on.",
    options: [
      { value: "previews", label: "Previews and links", note: "About 30 KB an image. The full image loads when you're online." },
      { value: "full", label: "Full images", note: "About 150 KB an image. For maps and diagrams." },
      { value: "links", label: "Links only", note: "No images on the phone. They load when you're online." },
    ],
  },
];

function swatch(themes, cls) {
  return el("span", { class: "swatch" + (cls ? " " + cls : ""), "aria-hidden": "true" },
    ...themes.map((t) => el("span", { class: "swatch-half", "data-theme": t }, el("span", { class: "swatch-dot" }))));
}

const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function choiceGroup(g) {
  const current = g.get();
  const list = el("div", { class: "group", role: "radiogroup", "aria-label": g.label });
  for (const o of g.options) {
    const check = el("span", { class: "choice-check", "aria-hidden": "true" });
    check.innerHTML = CHECK;
    list.append(el("label", { class: "choice" },
      el("input", { class: "visually-hidden", type: "radio", name: g.key, value: o.value, checked: o.value === current,
        onchange: () => g.set(o.value) }),
      o.swatch ? swatch(o.auto ? autoSwatch() : o.swatch, o.auto ? "auto" : "") : null,
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label" }, o.label),
        o.note ? el("span", { class: "choice-note" }, o.note) : null),
      check));
  }
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, g.label),
    list,
    g.footnote ? el("p", { class: "footnote" }, g.footnote) : null);
}

// Big pictures made smaller (1.18.0): full images and comics no wider
// than 1600 px, saved again in a smaller format. On unless turned off.
const COMPRESS_KEY = "waypage.compress";
C.save.compress = load(COMPRESS_KEY, true);
// Before you go offline (1.32.0): one press before a flight saves what's
// missing (pictures, failed saves, new chapters of followed collections,
// new posts of feeds that save themselves), then lists what still won't
// read in full offline.
const ready = { running: false, ran: false };
const notReady = () => state.pages.filter((p) => !p.preview && ((p.missing && p.mode !== "links") || p.cut));
async function getReady() {
  if (ready.running) return;
  if (!navigator.onLine) { ready.ran = true; renderReady(); toast("You're offline. Here's what isn't ready."); return; }
  ready.running = true;
  renderReady();
  try {
    const gaps = state.pages.filter((p) => p.missing && p.mode !== "links" && !syncQueue.includes(p.id));
    if (gaps.length) { syncQueue.push(...gaps.map((p) => p.id)); keepQueue(); }
    const pictures = fetchPictures();
    const failed = retryAll(state.saving.filter((s) => s.error));
    await dailyCheck(true);
    for (const name of allFolders()) if (freshCount(name) && !runFor(name)) saveNewChapters(name);
    await Promise.all([checkFeeds(true), pictures, failed]);
  } finally {
    ready.running = false;
    ready.ran = true;
    renderReady();
  }
}
function renderReady() {
  if (state.section === "saving") renderSection();
}
function readyGroup() {
  const left = ready.ran ? notReady() : [];
  const busy = ready.running || state.saving.some((s) => !s.error);
  const go = el("button", { class: "btn-small", type: "button", onclick: getReady }, ready.running ? "Working…" : "Get ready");
  go.disabled = ready.running;
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Before you go offline"),
    el("div", { class: "group" },
      el("div", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, ready.running ? "Getting everything ready…" : "Get everything ready"),
          el("span", { class: "choice-note" }, "Saves missing pictures, failed saves, new chapters and feed posts, then lists what still isn't ready")),
        go),
      ...left.slice(0, 20).map((p) => el("button", { class: "row nav-row", type: "button", onclick: () => toLibrary().then(() => openPage(p.id)) },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label", dir: "auto" }, p.title),
          el("span", { class: "choice-note warn" }, p.cut ? "Only the start" : p.missing + (p.missing === 1 ? " preview" : " previews") + " missing")),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))),
    ready.ran && !ready.running ? el("p", { class: "footnote" },
      !left.length ? (busy ? "Everything else is ready. The rest is still saving, in Downloads." : "Everything is ready to read offline.")
        : left.length + (left.length === 1 ? " clip isn't" : " clips aren't") + " fully ready" + (left.length > 20 ? "; the first 20 are above." : ".")
          + (busy ? " Some are still saving, in Downloads." : "")) : null);
}

// Send to Waypage (1.34.0), on a computer: the bookmark to drag to the
// bookmarks bar. A click here only says what to do with it.
function sendGroup() {
  if (C.platform.native) return null;
  const link = el("a", { class: "btn-small", href: bookmarklet(), draggable: "true",
    onclick: (e) => { e.preventDefault(); toast("Drag it to your bookmarks bar."); } }, "Send to Waypage");
  return el("section", { class: "settings-section", id: "sendSection" },
    el("h2", { class: "overline" }, "Save from your browser"),
    el("div", { class: "group" },
      el("div", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "A bookmark for any page"),
          el("span", { class: "choice-note" }, "Drag the button to your bookmarks bar. On any page, click it to save the page as your browser shows it, signed in too")),
        link)),
    el("p", { class: "footnote" }, "The page goes straight from that tab to this one, with no server in between, and you press Save before anything is kept. Some sites keep other windows out; save those on your phone."));
}

function compressGroup() {
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Big pictures"),
    el("div", { class: "group" },
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Make full images smaller"),
          el("span", { class: "choice-note" }, "Full images and comics are saved at most 1600 px wide, in a smaller format. Usually a quarter of the size, still sharp on a phone")),
        el("input", { class: "switch", type: "checkbox", role: "switch", checked: C.save.compress,
          onchange: (e) => { store(COMPRESS_KEY, e.target.checked); C.save.compress = e.target.checked; } }))),
    el("p", { class: "footnote" }, "For clips already saved, Storage has Make pictures smaller."));
}

// Pictures on tap (1.30.1): a clip opened online loads nothing from the
// web until a picture is tapped. Off by default, as full pictures online
// is how saving works (CLAUDE.md).
const TAP_PICTURES_KEY = "waypage.tapPictures";
C.reader.tapPictures = load(TAP_PICTURES_KEY, false);
function tapPicturesGroup() {
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Pictures online"),
    el("div", { class: "group" },
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Load pictures only when tapped"),
          el("span", { class: "choice-note" }, "Full-size and linked pictures come from their sites, which can see when you read. With this on, nothing loads until you tap it")),
        el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(TAP_PICTURES_KEY, false),
          onchange: (e) => { store(TAP_PICTURES_KEY, e.target.checked); C.reader.tapPictures = e.target.checked; } }))),
    el("p", { class: "footnote" }, "Previews saved on the phone always show. Applies to the next clip you open."));
}

// On mobile data (1.4.1): save or sync as always, or wait for Wi-Fi.
// Only the app can tell the two apart (on iOS since 1.6.0); in a browser
// the group stays out.
function dataGroup(key, verb, anyNote, wifiNote, middle) {
  if (!C.platform.knowsConnection) return null;
  return choiceGroup({ key, label: "On mobile data", get: () => load(key, "any"),
    set: (v) => { store(key, v); if (v !== "wifi") { while (wifiWaiters.length) wifiWaiters.shift()(); if (key === DATA_SYNC_KEY) syncSoon(1000); else fetchPictures(); } if (state.section) renderSection(); },
    options: [{ value: "any", label: verb, note: anyNote }, middle, { value: "wifi", label: "Wait for Wi-Fi", note: wifiNote }].filter(Boolean) });
}

// Which light and which dark theme Auto switches between.
function autoGroup() {
  const a = autoThemes();
  const row = (text, control) => el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, text), control);
  const box = el("section", { class: "settings-section", id: "autoSection" },
    el("h2", { class: "overline" }, "Auto uses"),
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        row("When your phone is light", seg("auto-light", "Light theme for Auto", themeOptions(THEMES.filter((t) => !t.dark), true), a.light,
          (v) => setAutoTheme({ light: v }), "themes grid five")),
        row("When your phone is dark", seg("auto-dark", "Dark theme for Auto", themeOptions(THEMES.filter((t) => t.dark), true), a.dark,
          (v) => setAutoTheme({ dark: v }), "themes grid")))));
  box.hidden = state.theme !== "system";
  return box;
}

// Animations (1.12.0): off, nothing moves at all, for a slow phone or
// for anyone who'd rather things just change.
function dimGroup() {
  return el("section", { class: "settings-section" },
    el("div", { class: "group" },
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Dim pictures in dark themes"),
          el("span", { class: "choice-note" }, "In Night, Black, Dusk and Solarized Dark. Tap a picture to see it in full.")),
        el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(DIM_KEY, true) !== false,
          onchange: (e) => { store(DIM_KEY, e.target.checked); paintTheme(state.theme); } }))));
}

function motionGroup() {
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Motion"),
    el("div", { class: "group" },
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Animations"),
          el("span", { class: "choice-note" }, "Off: screens, menus and pages change at once, with no movement")),
        el("input", { class: "switch", type: "checkbox", role: "switch", checked: !M.still(),
          onchange: (e) => { store(MOTION_KEY, e.target.checked); M.setStill(!e.target.checked); } }))),
    el("p", { class: "footnote" }, "Your phone's Reduce motion setting is followed either way."));
}

// Read aloud's settings in Settings too (1.12.0), the same as the Aa
// sheet's tab; the voice is for the phone's language here.
function aloudGroup() {
  if (!speech.available) return null;
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Narrate"),
    el("div", { class: "group" }, el("div", { class: "rc-list" }, aloudControls())));
}

function readingGroup() {
  return el("section", { class: "settings-section" },
    el("div", { class: "group" },
      el("p", { class: "reading-sample" }, "The page is the product. Everything else gets out of its way."),
      readingControls(false)),
    el("p", { class: "footnote" }, "The same as the reader's settings, behind the gear while you read."));
}

// Your own fonts (1.33.0): add a font file, or take one away. A .ttf,
// .otf, .woff or .woff2 up to 10 MB, checked to be a font before it's kept.
const FONT_MAX = 10 * 1024 * 1024;
const fontMagic = (b) => {
  const s = String.fromCharCode(b[0], b[1], b[2], b[3]);
  return s === "\0\x01\0\0" || s === "true" || s === "OTTO" || s === "wOFF" || s === "wOF2";
};
async function addFontFile(file) {
  if (!file) return;
  const name = String(file.name || "font").replace(/[^\w .()+-]/g, "").trim();
  if (!FONT_EXT.test(name)) { toast("That isn't a font file. Pick a .ttf, .otf, .woff or .woff2."); return; }
  if (file.size > FONT_MAX) { toast("That font is over 10 MB."); return; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || !fontMagic(bytes)) { toast("That file isn't a font Waypage can read."); return; }
  try { await new FontFace("Waypage check", bytes).load(); } catch (e) { toast("That font didn't load. Try another file."); return; }
  try { await C.store.addFont(name, bytes); } catch (e) { toast("Couldn't keep the font. Try again."); return; }
  await loadUserFonts();
  setReading({ font: "user:" + name });
  if (state.section === "reading") renderSection();
  toast("Added " + name.replace(FONT_EXT, "") + ". It's your reading font now.");
}
async function removeFontFile(name) {
  if (!confirm("Remove the font " + name.replace(FONT_EXT, "") + "?")) return;
  try { await C.store.removeFont(name); } catch (e) { toast("Couldn't remove it. Try again."); return; }
  if (readingPrefs().font === "user:" + name) setReading({ font: READING_DEFAULT.font });
  await loadUserFonts();
  if (state.section === "reading") renderSection();
}
function fontsGroup() {
  const mine = FONTS.filter((f) => f.user);
  // Phones label font files oddly, so the app's picker shows every file.
  const input = el("input", { type: "file", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
  if (!C.platform.native) input.accept = ".ttf,.otf,.woff,.woff2";
  input.addEventListener("change", () => { const f = input.files[0]; input.value = ""; addFontFile(f); });
  const place = C.store.place.kind;
  const where = place === "documents" ? "Or put font files in Documents/Waypage/fonts on the phone. "
    : place === "folder" ? "Or put font files in a fonts folder inside " + C.store.placeName(C.store.place) + ". " : "";
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Your fonts"),
    el("div", { class: "group" },
      ...mine.map((f) => el("div", { class: "row" },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label", style: "font-family: " + f.family + ", var(--sans)" }, f.label)),
        el("button", { class: "btn-text warn", type: "button", onclick: () => removeFontFile(f.user) }, "Remove"))),
      el("button", { class: "row", type: "button", onclick: () => input.click() },
        el("span", { class: "row-label accent" }, "Add a font")),
      input),
    el("p", { class: "footnote" }, where + "A font you add stays on this device and shows under Font with the others. Hebrew still uses the Hebrew font."));
}

// Dictionaries (1.45.0): StarDict files, for Look up on selected words.
// Kept in this device's database; nothing about a lookup leaves it.
async function addDictFiles(files, btn) {
  if (!files.length) return;
  const label = btn.querySelector(".row-label");
  btn.disabled = true;
  label.textContent = "Adding…";
  try {
    const d = await C.dict.add(files);
    toast("Added " + d.name + ", " + d.words.toLocaleString() + " words. Select a word and tap Look up.");
  } catch (e) {
    toast(e && e.message && !/^(Failed|NetworkError|Quota)/.test(e.message) ? e.message : "Couldn't keep the dictionary. Is there room on the device?");
  }
  btn.disabled = false;
  if (state.section === "reading") renderSection();
}
async function removeDict(d) {
  if (!confirm("Remove the dictionary " + d.name + "?")) return;
  try { await C.dict.remove(d.id); } catch (e) { toast("Couldn't remove it. Try again."); return; }
  if (state.section === "reading") renderSection();
}
function dictsGroup() {
  const input = el("input", { type: "file", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true", multiple: true });
  const add = el("button", { class: "row", type: "button", onclick: () => input.click() },
    el("span", { class: "row-label accent" }, "Add a dictionary"));
  input.addEventListener("change", () => { const f = [...input.files]; input.value = ""; addDictFiles(f, add); });
  const more = el("a", { href: "https://github.com/koreader/koreader/wiki/Dictionary-support", onclick: (e) => { e.preventDefault(); C.platform.openOutside(e.currentTarget.href); } }, "where to find free ones");
  return el("section", { class: "settings-section", id: "dictSection" },
    el("h2", { class: "overline" }, "Dictionaries"),
    el("div", { class: "group" },
      ...C.dict.list().map((d) => el("div", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label", dir: "auto" }, d.name),
          el("span", { class: "choice-note" }, d.words.toLocaleString() + " words · " + formatSize(d.bytes))),
        el("button", { class: "btn-text warn", type: "button", onclick: () => removeDict(d) }, "Remove"))),
      add, input),
    el("p", { class: "footnote" }, "StarDict dictionaries: pick the .ifo, .idx and .dict (or .dict.dz) files together, or a .zip or .tar.gz of them; see ",
      more, ". Then select a word while reading and tap Look up. A dictionary stays on this device and works offline; looking a word up sends nothing anywhere."));
}

// Edit clips, inside Library since 1.27.1 (it was its own menu entry).
function editNavGroup() {
  return el("section", { class: "settings-section" },
    el("div", { class: "group" },
      el("button", { class: "row nav-row", type: "button", onclick: () => openSection("edit", false, true) },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Edit clips"),
          el("span", { class: "choice-note" }, "Find and replace words across many clips at once")),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›"))));
}

// Notifications (1.30.0): the app's only ones that alert are new feed
// posts, checked with the app closed. Off, each post on its own (its
// title and the start of what it says, grouped by feed, with Save) or
// all in one, as before; and feeds kept quiet one by one.
function notesSections() {
  const n = notesPrefs();
  const sw = (label, note, on, set) => el("label", { class: "row" },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label", dir: "auto" }, label),
      note ? el("span", { class: "choice-note" }, note) : null),
    el("input", { class: "switch", type: "checkbox", role: "switch", checked: on, onchange: (e) => set(e.target.checked) }));
  const phone = el("p", { class: "footnote warn", hidden: true }, "Your phone has Waypage's notifications turned off. Turn them on in its settings.");
  C.platform.feedChecks.allowed().then((ok) => { if (ok === false && notesPrefs().on) phone.hidden = false; });
  const out = [el("section", { class: "settings-section" },
    el("div", { class: "group" },
      sw("Notifications", "New posts from the feeds you follow, found with the app closed", n.on, (on) => {
        if (on) askToNotify = true;
        setNotes({ on });
        renderSection();
      })),
    phone)];
  if (!n.on) return out;
  out.push(choiceGroup({ key: NOTES_KEY, label: "New posts", get: () => notesPrefs().posts, set: (v) => setNotes({ posts: v }),
    options: [
      { value: "each", label: "Each post on its own", note: "Its title and the start of what it says, grouped by feed, with Save" },
      { value: "together", label: "All together", note: "One notification saying how many new posts, and from which feeds" },
    ] }));
  if (feeds.length) {
    out.push(el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Feeds"),
      el("div", { class: "group" }, ...[...feeds].sort((a, b) => a.title.localeCompare(b.title)).map((f) =>
        sw(f.title, null, !feedQuiet(f), (on) => setFeedQuiet(f, !on)))),
      el("p", { class: "footnote" }, "A feed turned off here is still checked; its posts wait in Feeds.")));
  }
  out.push(el("section", { class: "settings-section" },
    el("div", { class: "group" },
      el("button", { class: "row nav-row", type: "button", onclick: () => C.platform.feedChecks.settings() },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Sound and more"),
          el("span", { class: "choice-note" }, "In your phone's settings for Waypage")),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›"))),
    C.platform.os === "android" ? el("p", { class: "footnote" }, "Saving, sync and Narrate show a quiet notification while they run, which Android needs to keep them going with the app put away. Those aren't alerts and can't be turned off here.") : null));
  return out;
}
const notesValue = () => { const n = notesPrefs(); return n.on ? (n.posts === "each" ? "Each post" : "All together") : "Off"; };

function libraryGroup() {
  const input = el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(CONTINUE_KEY, true),
    onchange: (e) => { store(CONTINUE_KEY, e.target.checked); renderLibrary(); } });
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Keeping up"),
    el("div", { class: "group" },
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Continue reading"),
          el("span", { class: "choice-note" }, "The clip you read last, at the top of the library")),
        input),
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Check for new chapters"),
          el("span", { class: "choice-note" }, "Once a day, for collections saved with Save next, when you're online")),
        el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(DAILY_KEY, true),
          onchange: (e) => store(DAILY_KEY, e.target.checked) })),
      el("button", { class: "row", type: "button", onclick: async (e) => {
        if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
        const b = e.currentTarget;
        b.disabled = true;
        const found = await dailyCheck(true);
        b.disabled = false;
        toast(found ? countFolders(found) + " with new chapters." : "No new chapters yet.");
      } }, el("span", { class: "row-label accent" }, "Check all collections now"))));
}
const countFolders = (n) => n + (n === 1 ? " collection" : " collections");

// Folders first, biggest first, then the pages in no folder as one
// more group; a group opens in place to its pages, biggest first.
const storageOpen = new Set();
function storageGroup() {
  const n = state.pages.length;
  const bySize = (a, b) => (b.bytes || 0) - (a.bytes || 0);
  const groups = allFolders().map((name) => ({ key: "f:" + name, name, pages: folderPages(name) }));
  const loose = state.pages.filter((p) => !p.folder);
  groups.sort((a, b) => sizeOf(b.pages) - sizeOf(a.pages));
  if (loose.length) groups.push({ key: "loose", name: "Not in a collection", pages: loose, loose: true });
  const list = el("div", { class: "group" });
  if (!n) list.append(el("div", { class: "row" }, el("span", { class: "row-label muted" }, "Nothing saved yet")));
  for (const g of groups) {
    const open = storageOpen.has(g.key);
    const pages = el("div", { class: "storage-pages", id: "storage-" + g.key.replace(/[^\w-]/g, "_") });
    pages.hidden = !open;
    if (open) {
      pages.append(savedView(g.pages));
      measureSizes(g.pages, remeasured);
    }
    for (const p of [...g.pages].sort(bySize)) {
      pages.append(el("button", { class: "row", type: "button", onclick: () => toLibrary().then(() => openPage(p.id)) },
        el("span", { class: "choice-text" },
          el("span", { class: "row-label", dir: "auto" }, p.title),
          el("span", { class: "choice-note" + (p.missing && p.mode !== "links" ? " warn" : "") }, savedNote(p))),
        el("span", { class: "row-value" }, formatSize(p.bytes || 0))));
    }
    const head = el("button", { class: "row storage-folder" + (g.loose ? " loose" : ""), type: "button", "aria-expanded": String(open), "aria-controls": pages.id,
      onclick: () => {
        const now = !storageOpen.has(g.key);
        if (now) storageOpen.add(g.key); else storageOpen.delete(g.key);
        head.setAttribute("aria-expanded", String(now));
        pages.hidden = !now;
        if (now && !pages.querySelector(".saved-view")) {
          pages.prepend(savedView(g.pages));
          measureSizes(g.pages, remeasured);
        }
      } },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label", dir: "auto" }, g.name),
        el("span", { class: "choice-note" }, countLine(g.pages.length))),
      el("span", { class: "row-value" }, formatSize(sizeOf(g.pages))),
      el("span", { class: "row-chev", "aria-hidden": "true" }, "›"));
    list.append(head, pages);
  }
  return el("section", { class: "settings-section" },
    el("p", { class: "storage-total" }, formatSize(totalBytes())),
    el("p", { class: "section-lead" }, n ? countLine(n) + " " + ON_HERE + ". Delete a clip from its menu: press and hold it in the library." : "Clips you save show here with their size."),
    el("h2", { class: "overline" }, "By collection"),
    list);
}

const remeasured = () => { if (state.section === "storage") renderSection(); };

// ---- Making room (1.9.0) ----
// Clips you've finished keep their text and lose their saved pictures,
// which show from the web again when you're online: usually most of a
// clip's size. Then the biggest clips, to open and delete.
let makingRoom = false;
const roomFor = () => state.pages.filter((p) => p.finished && !p.link && !p.file && p.images && p.mode !== "links" && /^https?:/.test(p.url || ""));
function roomGroup() {
  const list = roomFor();
  const known = list.reduce((n, p) => n + (p.imageBytes || 0), 0);
  if (list.some((p) => p.imageBytes == null)) measureSizes(list, remeasured);
  const big = [...state.pages].sort((a, b) => (b.bytes || 0) - (a.bytes || 0)).filter((p) => (p.bytes || 0) > 0).slice(0, 5);
  if (!list.length && !big.length && !squeezable().length) return [];
  const go = el("button", { class: "row room-go", type: "button", ...(list.length && !makingRoom ? {} : { disabled: "" }), onclick: () => dropPictures(list, go) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label" + (list.length ? " accent" : "") }, makingRoom ? "Making room…" : "Keep only the text of finished clips"),
      el("span", { class: "choice-note" }, list.length
        ? countLine(list.length) + " you've finished" + (known ? ", their pictures about " + formatSize(known) : "") + ". The pictures show again when you're online."
        : "Nothing to drop: the clips you've finished have no saved pictures.")),
    known ? el("span", { class: "row-value" }, formatSize(known)) : null);
  // Clips with full pictures (1.18.0), made smaller in place.
  const full = squeezable();
  const fullBytes = full.reduce((n, p) => n + (p.imageBytes || 0), 0);
  const squeezeBtn = full.length ? el("button", { class: "row room-squeeze", type: "button", ...(makingRoom ? { disabled: "" } : {}), onclick: () => squeezePictures(full, squeezeBtn) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label accent" }, makingRoom ? "Making room…" : "Make pictures smaller"),
      el("span", { class: "choice-note" }, countLine(full.length) + " with full pictures" + (fullBytes ? ", about " + formatSize(fullBytes) : "") + ". Big ones usually end up a quarter of the size; they stay sharp on a phone.")),
    fullBytes ? el("span", { class: "row-value" }, formatSize(fullBytes)) : null) : null;
  return [el("section", { class: "settings-section room" },
    el("h2", { class: "overline" }, "Make room"),
    el("div", { class: "group" }, squeezeBtn, go)),
    big.length ? el("section", { class: "settings-section room-big" },
    el("h2", { class: "overline" }, "Biggest clips"),
    el("div", { class: "group" }, ...big.map((p) => el("button", { class: "row", type: "button", onclick: () => toLibrary().then(() => openMenu("page", p)) },
      el("span", { class: "choice-text" },
        el("span", { class: "row-label", dir: "auto" }, p.title),
        el("span", { class: "choice-note" }, [siteOf(p), p.finished ? "Finished" : readingLine(p)].filter(Boolean).join(" · "))),
      el("span", { class: "row-value" }, formatSize(p.bytes || 0))))),
    el("p", { class: "footnote" }, "Tap one to delete it, or change what it keeps.")) : null];
}
const squeezable = () => !C.platform.native ? [] : state.pages.filter((p) => !p.link && (p.mode === "full" || p.comic) && p.images && !(p.squeezed >= 1));
async function squeezePictures(list, btn) {
  if (makingRoom || !C.platform.native) return;
  makingRoom = true;
  const label = btn.querySelector(".choice-label");
  btn.disabled = true;
  let freed = 0, done = 0;
  for (const p of list) {
    label.textContent = "Making pictures smaller, " + (++done) + " of " + list.length;
    let res = null;
    try { res = await C.save.compressPictures(p); } catch (e) { res = null; }
    if (!res) continue;
    freed -= res.bytes;
    p.squeezed = 1;
    p.bytes = Math.max(0, (p.bytes || 0) + res.bytes);
    if (p.imageBytes != null) p.imageBytes = Math.max(0, p.imageBytes + res.bytes);
  }
  await C.store.writeIndex(state.pages);
  makingRoom = false;
  await loadThumbs();
  renderLibrary();
  toast(freed > 0 ? "Made " + formatSize(freed) + " of room." : "Done. Those pictures were already small.");
  if (state.section === "storage") renderSection();
}
async function dropPictures(list, btn) {
  if (makingRoom) return;
  makingRoom = true;
  const label = btn.querySelector(".choice-label");
  btn.disabled = true;
  let freed = 0, done = 0;
  for (const p of list) {
    label.textContent = "Making room, " + (++done) + " of " + list.length;
    let res = null;
    try { res = await C.save.setPictures(p, "links"); } catch (e) { res = null; }
    if (!res) continue;
    freed -= res.bytes;
    Object.assign(p, { mode: "links", missing: res.missing, thumb: res.thumb, bytes: Math.max(0, (p.bytes || 0) + res.bytes) });
    if (p.imageBytes != null) p.imageBytes = Math.max(0, p.imageBytes + res.bytes);
  }
  await C.store.writeIndex(state.pages);
  makingRoom = false;
  texts.clear();
  await loadThumbs();
  renderLibrary();
  toast(freed > 0 ? "Made " + formatSize(freed) + " of room." : "Done. Their pictures show when you're online.");
  if (state.section === "storage") renderSection();
}

// Where the library lives (0.33.0): the app's own storage, the phone's
// Documents folder, or a folder you pick. Choosing another moves
// everything there. Android only: on iOS the app's own storage already
// shows in the Files app.
let moving = null;
function placeGroup() {
  if (!C.platform.native || !C.platform.files.canPickFolder) return null;
  const place = C.store.place;
  // On iOS the app's own storage already shows in the Files app; a folder
  // you pick (1.6.0) can be in iCloud Drive or on a drive plugged in.
  const options = [
    { value: "app", label: "Inside Waypage", note: C.platform.ios
      ? "Recommended, and the quickest. It shows in the Files app under On My iPhone, then Waypage. Uninstalling Waypage deletes it."
      : "Recommended. Private to the app, and the quickest. Uninstalling Waypage deletes it." },
  ];
  if (androidSdk >= 30 || place.kind === "documents") {
    options.push({ value: "documents", label: "Documents/Waypage", note: "You can see it in the Files app, and it stays if you uninstall Waypage. After reinstalling, the empty library offers to get it back." });
  }
  options.push({ value: "folder", label: place.kind === "folder" ? place.name || "A folder you picked" : "A folder you pick",
    note: place.kind === "folder" ? "Pick this again to choose another folder."
      : C.platform.ios ? "Any folder in the Files app, like one in iCloud Drive. Saving there is a little slower."
      : "Any folder on the phone or a memory card. Saving there is a little slower." });
  const group = choiceGroup({ key: "storage-place", label: "Where your library is", get: () => place.kind, options,
    set: (v) => changePlace(v),
    footnote: moving ? moving : "Changing it moves every clip there. A library already in the new place is added to yours." });
  if (moving) group.querySelectorAll("input").forEach((i) => { i.disabled = true; });
  // The picked folder can be picked again, which a radio that's already on doesn't report.
  const again = group.querySelector('input[value="folder"]');
  if (again && place.kind === "folder") again.addEventListener("click", () => changePlace("folder"));
  return group;
}
async function changePlace(kind, initial) {
  if (moving) return;
  const now = C.store.place;
  let next = { kind };
  if (kind === "folder") {
    let got = null;
    try { got = await C.platform.files.pickFolder(initial); } catch (e) { got = null; }
    if (!got) { renderSection(); return; }
    if (now.kind === "folder" && now.tree === got.ref) { renderSection(); return; }
    next = { kind, tree: got.ref, name: got.name };
  } else if (kind === now.kind) return;
  const say = (t) => { moving = t; if (state.section === "storage") renderSection(); };
  say("Moving your library…");
  try {
    const joined = await C.store.moveTo(next, (done, total) => say(total ? "Moving, " + done + " of " + total + " files…" : "Moving your library…"));
    state.pages = joined;
    texts.clear();
    await loadThumbs();
    renderLibrary();
    moving = null;
    toast(initial && joined.length ? "Your library is back: " + countLine(joined.length) + "." : "Your library is in " + C.store.placeName(next) + " now.");
  } catch (e) {
    console.error(e);
    moving = null;
    if (next.kind === "folder") C.platform.files.release(next.tree);
    toast("Couldn't move your library, so it stayed where it was. " + (e && /space|ENOSPC/i.test(e.message) ? "Free some space and try again." : "Try again."));
  }
  if (state.section === "storage") renderSection();
  if (state.settings) renderSettings();
}

// ---- Report a problem (1.9.0) ----
// What happened in the person's words, with the version, the phone and
// the log platform.js keeps, all shown before it goes anywhere: to the
// share sheet, an issue on GitHub, or the clipboard.
const REPORT_REPO = "https://github.com/danielnoam/waypage";
let reportDraft = "";
const logTime = (at) => new Date(at).toISOString().replace("T", " ").slice(0, 16);
async function reportText() {
  const lines = C.platform.log.list().map((x) => logTime(x.at) + " " + x.kind + (x.n ? " ×" + x.n : "") + ": " + x.msg);
  return [
    reportDraft.trim() || "(Nothing written)",
    "",
    "Waypage " + APP_VERSION + (C.platform.build && C.platform.build.builtAt ? " (built " + String(C.platform.build.builtAt).slice(0, 10) + ")" : "") + ", " + (C.platform.native ? C.platform.os + " app" : "browser"),
    await C.platform.deviceLine(),
    countLine(state.pages.length) + ", theme " + state.theme + ", sync " + (C.sync.on ? "on" : "off"),
    load(START_KEY, []).map((t) => "Start: " + t.shown + " ms (scripts " + t.scripts + ", library " + t.library + ") with " + t.clips + " clips").join("\n") || "Start: not measured",
    "",
    lines.length ? "Log:\n" + lines.join("\n") : "Log: empty",
  ].join("\n");
}
function reportGroup() {
  const list = C.platform.log.list();
  const field = el("textarea", { class: "mark-note-field report-field", rows: "4", placeholder: "What happened, and what were you doing?", "aria-label": "What happened", dir: "auto" });
  field.value = reportDraft;
  field.addEventListener("input", () => { reportDraft = field.value; });
  const send = async () => {
    const text = await reportText();
    try { if (await C.platform.shareText("Waypage problem report", text)) return; } catch (e) { /* below */ }
    copyText(text, "Report copied. Paste it into a message.");
  };
  const issue = async () => {
    const text = await reportText();
    const title = (reportDraft.trim().split("\n")[0] || "Problem report").slice(0, 80);
    // A link longer than this can be refused, so the log is cut from the start.
    const body = text.length > 6000 ? text.slice(0, 1500) + "\n…\n" + text.slice(-4400) : text;
    C.platform.openOutside(REPORT_REPO + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent("```\n" + body + "\n```"));
  };
  return el("section", { class: "settings-section report" },
    field,
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: send }, el("span", { class: "row-label accent" }, "Send the report")),
      el("button", { class: "row", type: "button", onclick: issue }, el("span", { class: "row-label accent" }, "Open an issue on GitHub")),
      el("button", { class: "row", type: "button", onclick: async () => copyText(await reportText(), "Report copied") }, el("span", { class: "row-label accent" }, "Copy the report"))),
    el("p", { class: "footnote" }, "Nothing leaves " + HERE + " unless you send it. The report holds what you wrote, Waypage's version, the phone's model and system, how long opening took, and the notes below, with addresses cut to their pages. An issue on GitHub is public, so anyone can read it."),
    startLine() ? el("p", { class: "footnote start-line" }, startLine()) : null,
    el("h2", { class: "overline" }, list.length ? "What went wrong lately" : "Nothing went wrong lately"),
    list.length ? el("ol", { class: "group report-log" }, ...list.slice().reverse().slice(0, 30).map((x) => el("li", { class: "report-line" },
      el("span", { class: "meta" }, logTime(x.at) + " · " + x.kind + (x.n ? " ×" + x.n : "")),
      el("span", { class: "report-msg", dir: "auto" }, x.msg)))) : null,
    list.length ? el("button", { class: "btn-text report-clear", type: "button", onclick: () => { C.platform.log.clear(); renderSection(); renderSettings(); } }, "Clear these") : null);
}

function aboutGroup() {
  const list = el("div", { class: "group" });
  const releases = C.platform.releasesUrl() || "https://github.com/danielnoam/waypage/releases/latest";
  list.append(el("a", { class: "row", href: releases, target: "_blank", rel: "noopener" },
    el("span", { class: "row-label accent" }, "Releases and source"),
    el("span", { class: "row-value", "aria-hidden": "true" }, "↗")));
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!C.platform.native && !installed && installPrompt) {
    list.prepend(el("button", { class: "row install-row", type: "button", onclick: installApp },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label accent" }, "Install Waypage"),
        el("span", { class: "choice-note" }, "Opens in its own window and works with no connection"))));
  }
  return el("section", { class: "settings-section" },
    list,
    !C.platform.native && !installed && !installPrompt && ios
      ? el("p", { class: "footnote install-hint" }, "To install Waypage, tap Share, then Add to Home Screen.") : null,
    el("p", { class: "footnote" }, "Clips stay " + ON_HERE + ". Waypage collects nothing."));
}

// The browser's own install offer (Chrome, Edge, Android), kept for the
// Install row in About instead of the browser's banner.
let installPrompt = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (state.section === "updates") renderSection();
});
addEventListener("appinstalled", () => {
  installPrompt = null;
  if (state.section === "updates") renderSection();
  toast("Installed. Waypage is with your other apps.");
});
async function installApp() {
  if (!installPrompt) return;
  const offer = installPrompt;
  installPrompt = null;
  offer.prompt();
  try { await offer.userChoice; } catch (e) { /* closed */ }
  if (state.section === "updates") renderSection();
}

// A browser's storage (0.27.12): how much it holds, and whether it may
// clear the pages to make space, with the ask to keep them.
function browserStorageGroup() {
  if (C.platform.native) return null;
  const box = el("section", { class: "settings-section browser-storage" });
  box.hidden = true;
  const draw = (info) => {
    box.hidden = !info;
    if (!info) return;
    const kept = info.kept
      ? el("div", { class: "row" }, el("span", { class: "choice-text" },
        el("span", { class: "choice-label" }, "Kept"),
        el("span", { class: "choice-note" }, "This browser won't clear your clips to make space.")))
      : el("button", { class: "row keep-row", type: "button", onclick: async () => {
        const ok = await C.store.keepStored();
        toast(ok ? "This browser will keep your clips." : "This browser didn't agree. Installing Waypage usually helps.");
        draw(await C.store.storageInfo());
      } }, el("span", { class: "choice-text" },
        el("span", { class: "choice-label accent" }, "Keep clips from being cleared"),
        el("span", { class: "choice-note" }, "Browsers may clear a site's data when space runs low.")));
    box.replaceChildren(
      el("h2", { class: "overline" }, "This browser"),
      el("div", { class: "group" },
        el("div", { class: "row" }, el("span", { class: "row-label" }, "Space used"),
          el("span", { class: "row-value" }, formatSize(info.usage) + (info.quota ? " of " + formatSize(info.quota) : ""))),
        kept),
      el("p", { class: "footnote" }, "Clips saved here stay in this browser only. Clearing its site data deletes them, so keep a backup."));
  };
  C.store.storageInfo().then(draw);
  return box;
}

// ---- Edit clips (1.22.0) ----
// Find and replace across many clips at once: in their text (a match
// replaced, or removed with nothing to put instead) or their titles.
// * stands for any words, so ~~*~~ finds everything between two pairs
// of tildes. Find shows how many and a few examples first; the change
// can be undone until the app closes.
const edit = { scope: "all", folders: new Set(), picked: [], what: "text", find: "", put: "", matchCase: false, regex: false, found: null, busy: "", undo: null };
const editClips = () => {
  const ok = (p) => !p.link && !p.preview;
  if (edit.scope === "picked") return state.pages.filter((p) => ok(p) && edit.picked.includes(p.id));
  if (edit.scope === "folders") return state.pages.filter((p) => ok(p) && p.folder && [...edit.folders].some((f) => sameTag(f, p.folder)));
  return state.pages.filter(ok);
};
function editPattern() {
  if (!edit.find) return null;
  const src = edit.regex ? edit.find : edit.find.split("*").map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\S]*?");
  try { return new RegExp(src, "g" + (edit.matchCase ? "" : "i")); } catch (e) { return null; }
}
// What a match becomes: `put` as typed, or with $1 and the like when
// Find is a regular expression.
function editRep(re) {
  if (!edit.regex) return () => edit.put;
  const one = new RegExp(re.source, re.flags.replace("g", ""));
  return (m) => m[0].replace(one, edit.put);
}
const editRedraw = () => { if (state.section === "edit") renderSection(); };
const editChanged = () => { edit.found = null; editRedraw(); };

function editGroup() {
  const clips = editClips();
  const folders = allFolders();
  const scope = el("section", { class: "settings-section edit-sec" },
    el("h2", { class: "overline" }, "Which clips"),
    choiceList("edit-scope", "Which clips", [
      { value: "all", label: "All clips", note: countLine(state.pages.filter((p) => !p.link && !p.preview).length) },
      folders.length ? { value: "folders", label: "Collections", note: "The ones you tick below" } : null,
      { value: "picked", label: "Clips you pick", note: edit.picked.length ? countLine(edit.picked.length) + " picked in the library" : "Pick them in the library, then tap Edit" },
    ].filter(Boolean), edit.scope, (v) => { edit.scope = v; editChanged(); }),
    edit.scope === "folders" ? el("div", { class: "group edit-folders" }, ...folders.map((f) => el("label", { class: "row" },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label", dir: "auto" }, f),
        el("span", { class: "choice-note" }, countLine(folderPages(f).length))),
      el("input", { class: "switch", type: "checkbox", role: "switch", checked: edit.folders.has(f),
        onchange: (e) => { e.target.checked ? edit.folders.add(f) : edit.folders.delete(f); editChanged(); } })))) : null,
    edit.scope === "picked" ? el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: pickToEdit }, el("span", { class: "row-label accent" }, edit.picked.length ? "Pick again in the library" : "Pick clips in the library"))) : null);

  const field = (id, label, key, placeholder) => el("div", { class: "rc-row stack" },
    el("label", { class: "rc-label", for: id }, label),
    el("input", { class: "feed-input", id, type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: edit[key], placeholder,
      oninput: (e) => { edit[key] = e.target.value; edit.found = null; editResult(); } }));
  const toggle = (key, label, note) => el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), el("span", { class: "choice-note" }, note)),
    el("input", { class: "switch", type: "checkbox", role: "switch", checked: edit[key], onchange: (e) => { edit[key] = e.target.checked; editChanged(); } }));
  const change = el("section", { class: "settings-section edit-sec" },
    el("h2", { class: "overline" }, "Change"),
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, "In"),
          seg("edit-what", "Change", [{ value: "text", label: "Text" }, { value: "titles", label: "Titles" }], edit.what, (v) => { edit.what = v; editChanged(); })),
        field("editFind", "Find", "find", edit.regex ? "A regular expression" : "Words, or ~~*~~"),
        field("editPut", "Replace with", "put", "Nothing: it's removed"))),
    el("div", { class: "group" },
      toggle("matchCase", "Match case", "Capital and small letters count as different"),
      toggle("regex", "Regular expression", "Find is a pattern, with $1 and so on in Replace with")),
    el("p", { class: "footnote" }, edit.regex ? "A match stays within one paragraph." : "* stands for any words in the same paragraph: ~~*~~ finds two pairs of tildes and everything between them."));

  return [scope, change, el("section", { class: "settings-section edit-sec edit-result", id: "editResult" }, ...editResultNodes(clips))];
}
function editResult() {
  const box = $("editResult");
  if (box) box.replaceChildren(...editResultNodes(editClips()));
}
function editResultNodes(clips) {
  const re = editPattern();
  const f = edit.found;
  const nodes = [];
  const busy = !!edit.busy;
  nodes.push(el("div", { class: "group" },
    el("button", { class: "row", type: "button", ...(re && clips.length && !busy ? {} : { disabled: "" }), onclick: findEdits },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label accent" }, edit.busy || (f ? "Find again" : "Find")),
        el("span", { class: "choice-note" }, !edit.find ? "Type what to find" : !re ? "That isn't a pattern Find can use" : "In " + countLine(clips.length))))));
  if (f) {
    nodes.push(el("p", { class: "section-lead", role: "status" }, f.times
      ? "Found " + f.times + (f.times === 1 ? " time" : " times") + " in " + countLine(f.ids.length) + "."
      : "Not found in " + (clips.length === 1 ? "this clip." : "these " + clips.length + " clips.")));
    if (f.samples.length) nodes.push(el("ol", { class: "group edit-samples" }, ...f.samples.map((x) => el("li", { class: "edit-sample", dir: "auto" },
      x.title ? el("span", { class: "choice-note" }, x.title) : null,
      el("span", { class: "edit-text" }, x.before, el("del", {}, x.found), x.put ? el("ins", {}, x.put) : null, x.after)))));
    if (f.times) nodes.push(el("div", { class: "group" },
      el("button", { class: "row", type: "button", ...(busy ? { disabled: "" } : {}), onclick: applyEdits },
        el("span", { class: "row-label accent" }, edit.put ? "Replace in " + countLine(f.ids.length) : "Remove from " + countLine(f.ids.length)))),
      el("p", { class: "footnote" }, edit.what === "text" ? "Your other devices get the changed text when they sync. A highlight on changed words may not be found again." : "Your other devices get the new titles when they sync."));
  }
  if (edit.undo && !busy) nodes.push(el("div", { class: "group" },
    el("button", { class: "row", type: "button", onclick: undoEdits }, el("span", { class: "row-label" }, "Undo the last change (" + countLine(edit.undo.length) + ")"))));
  return nodes;
}
// A list of radio rows like choiceGroup's, without its section.
function choiceList(name, label, options, current, set) {
  const list = el("div", { class: "group", role: "radiogroup", "aria-label": label });
  for (const o of options) {
    const check = el("span", { class: "choice-check", "aria-hidden": "true" });
    check.innerHTML = CHECK;
    list.append(el("label", { class: "choice" },
      el("input", { class: "visually-hidden", type: "radio", name, value: o.value, checked: o.value === current, onchange: () => set(o.value) }),
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, o.label), o.note ? el("span", { class: "choice-note" }, o.note) : null),
      check));
  }
  return list;
}

function pickToEdit() {
  toLibrary().then(() => { startSelect([]); toast("Pick the clips to edit, then tap Edit."); });
}
// From the library's Edit: the picked clips, here.
async function editPicked() {
  edit.picked = picked().map((p) => p.id);
  edit.scope = "picked";
  edit.found = null;
  await back();
  openSettings(false, "edit");
}

async function findEdits() {
  const re = editPattern();
  const clips = editClips();
  if (!re || !clips.length || edit.busy) return;
  const rep = editRep(re);
  const found = { ids: [], times: 0, samples: [], re: re.source + "/" + re.flags, what: edit.what, put: edit.put };
  edit.busy = "Looking…";
  editResult();
  try {
    for (const [i, p] of clips.entries()) {
      if (edit.what === "titles") {
        const n = [...p.title.matchAll(re)].filter((m) => m[0]).length;
        if (n) {
          found.ids.push(p.id); found.times += n;
          if (found.samples.length < 5) found.samples.push({ before: "", found: p.title, put: editTitle(p.title, re, rep) || "", after: "" });
        }
        continue;
      }
      const html = await C.store.readPage(p.id).catch(() => null);
      if (!html) continue;
      const samples = [];
      const n = C.save.replaceText(new DOMParser().parseFromString(html, "text/html").body, re, rep, found.samples.length < 5 ? samples : null);
      if (n) {
        found.ids.push(p.id); found.times += n;
        for (const x of samples.reverse()) if (found.samples.length < 5) found.samples.push({ ...x, title: p.title });
      }
      if (i % 10 === 9) { edit.busy = "Looking… " + (i + 1) + " of " + clips.length; editResult(); await new Promise((go) => setTimeout(go, 0)); }
    }
    edit.found = found;
  } finally {
    edit.busy = "";
    editResult();
  }
}
function editTitle(title, re, rep) {
  re.lastIndex = 0;
  return title.replace(re, (...a) => (a[0] ? rep([a[0]]) : "")).replace(/\s+/g, " ").trim();
}

async function applyEdits() {
  const f = edit.found;
  const re = editPattern();
  if (!f || !re || edit.busy || f.re !== re.source + "/" + re.flags || f.what !== edit.what || f.put !== edit.put) { edit.found = null; editResult(); return; }
  const rep = editRep(re);
  const undo = [];
  let changed = 0;
  edit.busy = "Changing…";
  editResult();
  try {
    for (const [i, id] of f.ids.entries()) {
      const p = state.pages.find((x) => x.id === id);
      if (!p) continue;
      if (edit.what === "titles") {
        const t = editTitle(p.title, re, rep);
        if (t && t !== p.title) { undo.push({ id, title: p.title }); p.title = t; changed++; }
        continue;
      }
      const html = await C.store.readPage(id).catch(() => null);
      if (!html) continue;
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!C.save.replaceText(doc.body, re, rep)) continue;
      undo.push({ id, html, editedAt: p.editedAt });
      await rewriteClip(p, "<!doctype html>\n" + doc.documentElement.outerHTML, html);
      changed++;
      if (i % 5 === 4) { edit.busy = "Changing… " + (i + 1) + " of " + f.ids.length; editResult(); }
    }
  } finally {
    edit.busy = "";
    edit.found = null;
    if (undo.length) edit.undo = undo;
    await C.store.writeIndex(state.pages);
    renderLibrary();
    editRedraw();
  }
  toast(changed ? "Changed " + countLine(changed) + "." : "Nothing changed.");
}
// A clip's text written again, and its search text and size with it;
// the edit time sends it to the other devices.
async function rewriteClip(p, html, was) {
  p.editedAt = Date.now();
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const text = C.save.plainText(body);
  p.bytes = Math.max(0, (p.bytes || 0) + C.store.bytesOf(html) - C.store.bytesOf(was));
  await C.store.writePage(p.id, html, p);
  await C.store.writeText(p.id, text).catch(() => {});
  texts.set(p.id, { text, folded: fold(text) });
}
async function undoEdits() {
  const list = edit.undo;
  if (!list || edit.busy) return;
  edit.undo = null;
  edit.busy = "Undoing…";
  editResult();
  try {
    for (const u of list) {
      const p = state.pages.find((x) => x.id === u.id);
      if (!p) continue;
      if (u.title != null) { p.title = u.title; continue; }
      const now = await C.store.readPage(u.id).catch(() => "");
      await rewriteClip(p, u.html, now || "");
    }
  } finally {
    edit.busy = "";
    await C.store.writeIndex(state.pages);
    renderLibrary();
    editRedraw();
  }
  toast("Undone: " + countLine(list.length) + " back as they were.");
}

// Settings is a short menu; each entry is a screen of its own.
const updateOut = () => UPD_OUT.includes(upd.phase) && upd.latest;
// Settings sorted by what you came to change (1.12.0): how it looks,
// how you read, the library; then saving, sync and storage; then About.
const SECTIONS = {
  appearance: { title: "Appearance", build: () => [choiceGroup(SETTINGS[0]), autoGroup(), dimGroup(), motionGroup()],
    value: () => themeName(state.theme) },
  reading: { title: "Reading", build: () => [readingGroup(), fontsGroup(), dictsGroup(), aloudGroup()],
    value: () => { const r = readingPrefs(); return (FONTS.find((f) => f.value === r.font) || FONTS[0]).label + " · " + r.size + " px"; } },
  library: { title: "Library", build: () => [
    choiceGroup({ key: LAYOUT_KEY, label: "Layout", get: layout, set: (v) => { store(LAYOUT_KEY, v); renderLibrary(); }, options: LAYOUTS }),
    libraryGroup(), watchGroup(), editNavGroup()],
    value: () => (LAYOUTS.find((l) => l.value === layout()) || LAYOUTS[0]).label },
  saving: { title: "Saving", build: () => [readyGroup(), choiceGroup(SETTINGS[1]), compressGroup(), tapPicturesGroup(), dataGroup(DATA_SAVE_KEY, "Save", "Pages and pictures come down on any connection.", "Saves wait in Downloads until you're on Wi-Fi; feeds, new chapters and missing pictures check then too."), signedGroup(), sendGroup(), importGroup()],
    value: () => SETTINGS[1].options.find((o) => o.value === SETTINGS[1].get()).label },
  sync: { title: "GitHub sync", build: syncSections, value: () => (C.sync.on ? (C.sync.last.error ? "Stopped" : "On") : "Off") },
  drive: { title: "Google Drive", build: driveSections, value: driveValue },
  notifications: { title: "Notifications", build: notesSections, value: notesValue },
  edit: { title: "Edit clips", build: editGroup, value: () => "", parent: "library" },
  storage: { title: "Storage", build: () => [storageGroup(), ...roomGroup(), placeGroup(), backupGroup(), browserStorageGroup()], value: () => formatSize(totalBytes()) },
  updates: { title: "About", build: () => [updatesGroup(), aboutGroup()], value: () => (updateOut() ? upd.latest + " is out" : APP_VERSION) },
  report: { title: "Report a problem", build: () => [reportGroup()], value: () => { const n = C.platform.log.list().length; return n ? n + (n === 1 ? " note" : " notes") : ""; } },
};

function renderSettings() {
  const row = (key) => {
    const s = SECTIONS[key];
    const b = el("button", { class: "row nav-row", type: "button", onclick: () => openSection(key) },
      el("span", { class: "row-label" }, s.title),
      el("span", { class: "row-value" + (key === "updates" && updateOut() ? " accent" : "") }, s.value()),
      el("span", { class: "row-chev", "aria-hidden": "true" }, "›"));
    if (state.section === key || (SECTIONS[state.section] || {}).parent === key) b.setAttribute("aria-current", "page");
    return b;
  };
  const out = updateOut();
  fill($("settingsBody"),
    el("div", { class: "settings-menu" },
      out ? el("div", { class: "group update-card" },
        el("div", { class: "row update-row out" },
          el("span", { class: "row-label accent" }, "Waypage " + upd.latest + " is out"),
          el("button", { class: "btn-small", type: "button", onclick: () => openSection("updates") }, "View"))) : null,
      el("div", { class: "group" }, row("appearance"), row("reading"), row("library"), C.platform.native ? row("notifications") : null, row("lock")),
      el("div", { class: "group" }, row("saving"), row("sync"), C.drive.available ? row("drive") : null, row("storage")),
      el("div", { class: "group" }, row("updates"), row("report"))));
}

function renderSection() {
  const s = SECTIONS[state.section];
  $("sectionTitle").textContent = s.title;
  $("sectionBody").dataset.key = state.section;
  fill($("sectionBody"), ...s.build());
}

// On a phone a section is pushed over the menu; on a desktop it sits
// beside it, and another entry swaps it in place.
// `deeper`: a page inside the one that's open (Library's Edit clips,
// 1.27.1), so Back goes to that one rather than the menu.
function openSection(key, fromHistory, deeper) {
  if (!SECTIONS[key] || state.section === key) return;
  const swap = !!state.section;
  state.section = key;
  renderSection();
  const entry = { view: "settings", section: key };
  if (!fromHistory) swap && !deeper ? history.replaceState(entry, "") : history.pushState(entry, "");
  renderSettings();
  $("sectionBody").scrollTop = 0;
  if (!swap) pushScreen($("sectionView")).then(() => { if (!wide.matches) $("sectionBack").focus(); });
}

function closeSection() {
  if (!state.section) return;
  state.section = null;
  popScreen($("sectionView"));
  if (state.settings) renderSettings();
}

// `at` names a section to open over the menu (the update bar opens Updates).
function openSettings(fromHistory, at) {
  if (state.settings) return;
  // With room for the section beside the menu, the first one is open.
  if (wide.matches && !at && !fromHistory) at = "appearance";
  state.settings = true;
  renderSettings();
  if (!fromHistory) history.pushState({ view: "settings" }, "");
  $("settingsBody").scrollTop = 0;
  const shown = pushScreen($("settingsView"));
  if (at) openSection(at);
  else shown.then(() => $("settingsBack").focus());
}

function closeSettings() {
  if (!state.settings) return;
  closeSection();
  state.settings = false;
  popScreen($("settingsView"));
}
