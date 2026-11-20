// Waypage's shell (1.14.0): Settings, making room and
// Report a problem. See app.js for how the parts share.
// ---- Settings ----
// Each group is data: a new setting is a new entry here, not new markup.

const imagesWord = (v, previews, full, links) => (v === "full" ? full : v === "links" ? links : previews);
const SETTINGS = [
  {
    title: t("Appearance"),
    key: THEME_KEY,
    label: t("Theme"),
    get: () => state.theme,
    // The Auto boxes show only while Auto is picked (1.12.0).
    set: (v) => { setTheme(v); const a = $("autoSection"); if (a) a.hidden = v !== "system"; },
    options: [
      { value: "system", label: t("Auto"), note: t("Your light and dark themes, following your phone"), swatch: autoSwatch(), auto: true },
      ...THEMES.map((t) => ({ value: t.value, label: t.label, note: t.note, swatch: [t.value] })),
    ],
  },
  {
    title: t("Saving"),
    key: IMAGES_KEY,
    label: t("Images"),
    get: () => load(IMAGES_KEY, "previews"),
    set: (v) => { store(IMAGES_KEY, v); toast(imagesWord(v, t("New saves use previews and links."), t("New saves use full images."), t("New saves use links only."))); if (state.section) renderSection(); },
    help: t("For clips saved from now on; a clip's own menu changes its pictures later. A preview is about 30 KB and the full picture loads from its site when you're online. Full images are about 150 KB each and suit maps and diagrams. Links only keeps no pictures on the phone."),
    options: [
      { value: "previews", label: t("Previews and links"), note: t("Small previews; the full picture online") },
      { value: "full", label: t("Full images"), note: t("Sharp offline, about five times the size") },
      { value: "links", label: t("Links only"), note: t("Pictures only when you're online") },
    ],
  },
  // Only shown while Images is Full images (1.53.0): the starting choice
  // for feeds you follow from then on; a feed's own menu still wins.
  {
    key: FEED_IMAGES_KEY,
    label: t("Images for feeds"),
    get: () => load(FEED_IMAGES_KEY, "full"),
    set: (v) => { store(FEED_IMAGES_KEY, v); toast(imagesWord(v, t("New feeds use previews and links."), t("New feeds use full images."), t("New feeds use links only."))); },
    options: [
      { value: "previews", label: t("Previews and links"), note: t("Small previews; the full picture online") },
      { value: "full", label: t("Full images"), note: t("Sharp offline, about five times the size") },
      { value: "links", label: t("Links only"), note: t("Pictures only when you're online") },
    ],
  },
];

function swatch(themes, cls) {
  return el("span", { class: "swatch" + (cls ? " " + cls : ""), "aria-hidden": "true" },
    ...themes.map((t) => el("span", { class: "swatch-half", "data-theme": t }, el("span", { class: "swatch-dot" }))));
}

const CHECK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// Compact Settings (1.48.0). A row says what it is in a few words, and
// the longer explanation sits behind a ? on its section's heading, the
// way the Steam Deck explains a setting only when you ask: `section`
// builds the heading, the ? and the hidden text, then the rows.
// Whatever shows a state (a moving library, what isn't ready) stays a
// visible footnote.
const helpOpen = new Set();
function section(title, help, ...kids) {
  const sec = el("section", { class: "settings-section" });
  if (title || help) sec.append(settingHead(title, help));
  sec.append(...kids.filter(Boolean));
  return sec;
}
function settingHead(title, help) {
  const head = el("div", { class: "section-head" }, el("h2", { class: "overline" }, title || ""));
  if (!help) return head;
  const text = el("p", { class: "footnote help-text" }, ...[].concat(help));
  const open = helpOpen.has(title);
  // The text unfolds under the heading (a grid row growing from 0fr).
  const wrap = el("div", { class: "help-wrap" + (open ? " open" : "") }, el("div", { class: "help-inner" }, text));
  const btn = el("button", { class: "help-btn", type: "button", "aria-label": title ? t("About {x}", { x: title }) : t("About this"), title: t("What this does"), "aria-expanded": String(open),
    onclick: () => { const now = !wrap.classList.contains("open"); wrap.classList.toggle("open", now); btn.setAttribute("aria-expanded", String(now)); if (now) helpOpen.add(title); else helpOpen.delete(title); } }, "?");
  head.append(btn);
  return el("div", { class: "section-top" }, head, wrap);
}
// A switch in a row: its label, a few words of state or scope, the switch.
function switchRow(label, note, on, set, more) {
  return el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, label), note ? el("span", { class: "choice-note" }, note) : null),
    el("input", { class: "switch", type: "checkbox", role: "switch", checked: on, ...(more || {}), onchange: (e) => set(e.target.checked) }));
}
// A row that opens another screen.
function navRow(label, note, onclick) {
  return el("button", { class: "row nav-row", type: "button", onclick },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), note ? el("span", { class: "choice-note" }, note) : null),
    el("span", { class: "row-chev", "aria-hidden": "true" }, "›"));
}

// A pick in a row (1.48.0, Daniel's ask; a list of radios until then):
// the setting's name, the picked option's few words under it, and a
// drop-down of the options at the end.
function pickRow(g) {
  const at = () => g.options.find((o) => o.value === g.get()) || g.options[0];
  const note = el("span", { class: "choice-note" }, g.note || at().note || "");
  const pick = dropdown({ label: g.label, cls: "field-pick row-pick" + (g.cls ? " " + g.cls : ""), value: at().value, options: g.options.map((o) => ({ value: o.value, label: o.label })),
    onpick: (v) => { g.set(v); const o = g.options.find((x) => x.value === v); note.textContent = g.note || (o && o.note) || ""; } });
  const row = el("div", { class: "row pick-row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, g.label), note),
    pick);
  if (g.disabled) pick.querySelector("button").disabled = true;
  row.set = pick.set;
  return row;
}
function choiceGroup(g) {
  return section(g.title || "", g.help, el("div", { class: "group" }, pickRow(g)), g.footnote ? el("p", { class: "footnote" }, g.footnote) : null);
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
  if (!navigator.onLine) { ready.ran = true; renderReady(); toast(t("You're offline. Here's what isn't ready.")); return; }
  ready.running = true;
  renderReady();
  try {
    const gaps = state.pages.filter((p) => p.missing && p.mode !== "links" && !syncQueue.includes(p.id));
    if (gaps.length) { syncQueue.push(...gaps.map((p) => p.id)); keepQueue(); }
    const pictures = fetchPictures();
    const failed = retryAll(state.saving.filter((s) => s.error));
    await dailyCheck(true);
    for (const name of allFolders()) if (freshCount(name) && !runFor(name) && !keepFor(name)) saveNewChapters(name);
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
  const go = el("button", { class: "btn-small", type: "button", onclick: getReady }, ready.running ? t("Working…") : t("Get ready"));
  go.disabled = ready.running;
  return section(t("Before you go offline"), t("One press before a flight: saves missing pictures, retries failed saves, fetches new chapters of followed collections and new posts of feeds that save themselves, then lists what still won't read in full offline."),
    el("div", { class: "group" },
      el("div", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, ready.running ? t("Getting everything ready…") : t("Get everything ready")),
          el("span", { class: "choice-note" }, t("Pictures, failed saves, new chapters and posts"))),
        go),
      ...left.slice(0, 20).map((p) => el("button", { class: "row nav-row", type: "button", onclick: () => toLibrary().then(() => openPage(p.id)) },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label", dir: "auto" }, p.title),
          el("span", { class: "choice-note warn" }, p.cut ? t("Only the start") : tn(p.missing, "1 preview missing", "{n} previews missing"))),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))),
    ready.ran && !ready.running ? el("p", { class: "footnote" },
      !left.length ? (busy ? t("Everything else is ready. The rest is still saving, in Downloads.") : t("Everything is ready to read offline."))
        : [left.length > 20 ? t("{n} clips aren't fully ready; the first 20 are above.", { n: left.length }) : tn(left.length, "1 clip isn't fully ready.", "{n} clips aren't fully ready."),
          busy ? t("Some are still saving, in Downloads.") : ""].filter(Boolean).join(" ")) : null);
}

// Send to Waypage (1.34.0), on a computer: the bookmark to drag to the
// bookmarks bar. A click here only says what to do with it.
function sendGroup() {
  if (C.platform.native) return null;
  const link = el("a", { class: "btn-small", href: bookmarklet(), draggable: "true",
    onclick: (e) => { e.preventDefault(); toast(t("Drag it to your bookmarks bar.")); } }, t("Send to Waypage"));
  const sec = section(t("Save from your browser"), t("On any page, click the bookmark to save the page as your browser shows it, signed in too. The page goes straight from that tab to this one, with no server in between, and you press Save before anything is kept. Some sites keep other windows out; save those on your phone."),
    el("div", { class: "group" },
      el("div", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, t("Bookmark for your browser")),
          el("span", { class: "choice-note" }, t("Drag it to your bookmarks bar"))),
        link)));
  sec.id = "sendSection";
  return sec;
}

// The two picture switches in one section (1.48.0): big ones made
// smaller as they're saved, and pictures held back online.
function savingGroup() {
  return section(t("Saving"), null,
    el("div", { class: "group" },
      pickRow(SETTINGS[1]),
      C.platform.native && load(IMAGES_KEY, "previews") === "full" ? pickRow(SETTINGS[2]) : null,
      switchRow(t("Make full images smaller"), t("No wider than 1600 px"), C.save.compress, (on) => { store(COMPRESS_KEY, on); C.save.compress = on; }),
      switchRow(t("Load pictures only when tapped"), t("Online, nothing loads until you tap it"), load(TAP_PICTURES_KEY, false), (on) => { store(TAP_PICTURES_KEY, on); C.reader.tapPictures = on; }),
      dataRow(DATA_SAVE_KEY, t("Save"), t("On any connection"), t("Saves wait in Downloads until then"))));
}

// Pictures on tap (1.30.1): a clip opened online loads nothing from the
// web until a picture is tapped. Off by default, as full pictures online
// is how saving works (CLAUDE.md).
const TAP_PICTURES_KEY = "waypage.tapPictures";
C.reader.tapPictures = load(TAP_PICTURES_KEY, false);

// On mobile data (1.4.1): save or sync as always, or wait for Wi-Fi.
// Only the app can tell the two apart (on iOS since 1.6.0); in a browser
// the group stays out.
function dataRow(key, verb, anyNote, wifiNote, middle) {
  if (!C.platform.knowsConnection) return null;
  return pickRow({ key, label: t("On mobile data"), get: () => load(key, "any"),
    set: (v) => { store(key, v); if (v !== "wifi") { while (wifiWaiters.length) wifiWaiters.shift()(); if (key === DATA_SYNC_KEY) syncSoon(1000); else fetchPictures(); } if (state.section) renderSection(); },
    options: [{ value: "any", label: verb, note: anyNote }, middle, { value: "wifi", label: t("Wait for Wi-Fi"), note: wifiNote }].filter(Boolean) });
}

// Which light and which dark theme Auto switches between.
function autoGroup() {
  const a = autoThemes();
  const row = (text, control) => el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, text), control);
  const box = section(t("Auto uses"), null,
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        row(t("When your phone is light"), seg("auto-light", t("Light theme for Auto"), themeOptions(THEMES.filter((t) => !t.dark), true), a.light,
          (v) => setAutoTheme({ light: v }), "themes grid five")),
        row(t("When your phone is dark"), seg("auto-dark", t("Dark theme for Auto"), themeOptions(THEMES.filter((t) => t.dark), true), a.dark,
          (v) => setAutoTheme({ dark: v }), "themes grid")))));
  box.id = "autoSection";
  box.hidden = state.theme !== "system";
  return box;
}

// The reader's own theme (Daniel's ask): off, the reader takes the app's.
function readerThemeGroup() {
  const pick = el("div", { class: "group reader-theme-pick" }, el("div", { class: "rc-list" },
    seg("reader-theme", t("Theme in the reader"), [{ value: "system", label: t("Auto"), swatch: autoSwatch(), auto: true }, ...themeOptions(THEMES)],
      readerThemeOn() ? state.readerTheme : state.theme, (v) => { setReaderTheme(v); syncThemeInputs(); }, "themes grid five theme-grid")));
  pick.hidden = !readerThemeOn();
  const sec = section(null, null,
    el("div", { class: "group" },
      switchRow(t("Its own theme in the reader"), null, readerThemeOn(), (on) => {
        setReaderTheme(on ? state.theme : "same");
        pick.hidden = !on;
        pick.querySelectorAll("input").forEach((i) => { i.checked = i.value === state.theme; });
        syncThemeInputs();
      })),
    pick);
  sec.classList.add("reader-theme-sec");
  return sec;
}

// Language (2026-11, Daniel's ask): English or Hebrew, or the phone's.
// Changing it reloads, since every screen's words were set at load.
function languageGroup() {
  const options = [{ value: "", label: t("System") }, ...i18n.list().map((l) => ({ value: l.code, label: l.name }))];
  return section(t("Language"), null,
    el("div", { class: "group" }, el("div", { class: "rc-list" },
      seg("app-lang", t("Language"), options, i18n.choice || "", (v) => { if (i18n.set(v)) location.reload(); }))));
}

// Animations (1.12.0): off, nothing moves at all, for a slow phone or
// for anyone who'd rather things just change.
function looksGroup() {
  return section(t("Pictures and motion"), null,
    el("div", { class: "group" },
      switchRow(t("Dim pictures in dark themes"), t("Tap a picture to see it in full"), load(DIM_KEY, true) !== false, (on) => { store(DIM_KEY, on); paintTheme(); }),
      switchRow(t("Animations"), t("Off: everything changes at once"), !M.still(), (on) => { store(MOTION_KEY, on); M.setStill(!on); })));
}

// The sidebar's folds (2026-11, Daniel's ask): each one can be off, and
// Library's picks what heads it. The pick only shows while Library folds.
function sidebarGroup() {
  const foldRow = (name, label, note) => switchRow(label, note, sideFolds(name), (on) => {
    store(SIDE_FOLDS_KEY, { ...load(SIDE_FOLDS_KEY, {}), [name]: on });
    if (name === "library") top.hidden = !on;
    if (sideShown()) renderSide();
  });
  const top = pickRow({ label: t("Top of Library"), get: sideTop,
    set: (v) => { store(SIDE_TOP_KEY, v); if (sideShown()) renderSide(); },
    options: [{ value: "favourites", label: t("Favourites"), note: t("The 3 favourites marked last") },
      { value: "recent", label: t("Recent"), note: t("The 3 clips read last") },
      { value: "off", label: t("Off"), note: t("Only Favourites and the parts") }] });
  top.hidden = !sideFolds("library");
  return section(t("Sidebar"), null,
    el("div", { class: "group" },
      foldRow("library", t("Library folds out"), t("Favourites, Collections, Clips…")),
      top,
      foldRow("feeds", t("Feeds folds out"), t("The 3 feeds updated last")),
      foldRow("newsletters", t("Newsletters folds out"), t("The 3 addresses with the latest emails"))));
}

// Themes as a grid of swatches (1.48.0), two rows instead of ten.
function themeGroup() {
  const g = SETTINGS[0];
  return section(t("Theme"), null,
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        seg(THEME_KEY, t("Theme"), g.options.map((o) => ({ value: o.value, label: o.label, swatch: o.swatch, auto: o.auto })), g.get(), (v) => g.set(v), "themes grid five theme-grid"))));
}

// Read aloud's settings in Settings too (1.12.0), the same as the Aa
// sheet's tab; the voice is for the phone's language here.
function aloudGroup() {
  if (!speech.available) return null;
  return section(t("Narrate"), null,
    el("div", { class: "group" }, el("div", { class: "rc-list" }, aloudControls())));
}

// Kokoro voices (Android, arm64): downloads that become Waypage's own
// speech engine, picked for English when the first is in. Three to pick
// from on their own screen (Daniel's ask), one in use at a time. Asked
// again about once a second while one downloads or unpacks.
const KOKORO_IN_KEY = "waypage.kokoroIn";
const kokoroBusy = (s) => s.step === "downloading" || s.step === "checking" || s.step === "unpacking";
function kokoroArrived(s) {
  if (!s.use || load(KOKORO_IN_KEY, false)) return;
  store(KOKORO_IN_KEY, true);
  store(ENGINE_KEY, { ...enginePicks(), en: s.engine });
}
function kokoroStep(s, p) {
  const pct = (s.total ? Math.min(99, Math.floor(s.done / s.total * 100)) : 0) + "%";
  if (s.step === "downloading") return (p ? t("Downloading {name}", { name: p.title }) : t("Downloading")) + " · " + pct;
  return p ? t("Unpacking {name}…", { name: p.title }) : t("Unpacking…");
}
function forgetKokoro(engine) {
  store(KOKORO_IN_KEY, false);
  const picks = enginePicks();
  for (const k of Object.keys(picks)) if (picks[k] === engine) delete picks[k];
  store(ENGINE_KEY, picks);
}

// Piper voices: one per language. A new one reads its language from then
// on (the engine and its voice picked for it), once per download.
const PIPER_IN_KEY = "waypage.piperIn";
function piperArrived(s) {
  const seen = load(PIPER_IN_KEY, []);
  const ready = (s.piper || []).filter((v) => v.ready);
  const kept = seen.filter((id) => ready.some((v) => v.id === id));
  for (const v of ready) {
    if (kept.includes(v.id)) continue;
    kept.push(v.id);
    const lang = primary(v.lang);
    store(ENGINE_KEY, { ...enginePicks(), [lang]: s.engine });
    store(VOICE_KEY, { ...load(VOICE_KEY, {}), [s.engine + "|" + lang]: v.voice });
  }
  if (kept.length !== seen.length || kept.some((id, i) => id !== seen[i])) store(PIPER_IN_KEY, kept);
}
// Deleted: its language goes back to the phone's voice, unless the
// Kokoro in use speaks it.
function forgetPiper(s, v) {
  const lang = primary(v.lang);
  const voices = load(VOICE_KEY, {});
  if (voices[s.engine + "|" + lang] === v.voice) { delete voices[s.engine + "|" + lang]; store(VOICE_KEY, voices); }
  const kokoro = s.packs.find((p) => p.id === s.use && p.ready);
  const picks = enginePicks();
  if (picks[lang] === s.engine && !(kokoro && (kokoro.languages || []).includes(lang))) { delete picks[lang]; store(ENGINE_KEY, picks); }
  store(PIPER_IN_KEY, load(PIPER_IN_KEY, []).filter((id) => id !== v.id));
}

// More speech engines, one page for them all (Daniel's ask): the phone's
// own engines, each opening its page for more voices; then each Kokoro
// model with what it has and its size, and Download, or a bin once it's
// here; then a Piper voice per language.
const allReady = (s) => s.packs.filter((x) => x.ready).length + (s.piper || []).filter((x) => x.ready).length;
function kokoroSections() {
  const slot = el("div", { class: "kokoro-slot" }, el("p", { class: "footnote" }, t("Looking…")));
  fillKokoro(slot);
  return [slot];
}
async function fillKokoro(slot) {
  const [s, { engines }] = await Promise.all([speech.kokoro(), speech.engines()]);
  if (!slot.isConnected && slot.dataset.drawn) return;
  slot.dataset.drawn = "1";
  const phone = engines.filter((e) => !s || e.name !== s.engine);
  const phoneSection = phone.length ? [section(t("Phone's speech engines"), null, el("div", { class: "group" },
    ...phone.map((e) => el("div", { class: "row" },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, e.label)),
      el("button", { class: "btn-text", type: "button", onclick: () => speech.moreVoices(e.name) }, t("Get more voices"))))))] : [];
  // iOS's Personal Voice (iOS 17), made in Settings › Accessibility:
  // the app may use it once the person allows it here.
  if (speech.hasPersonalVoice) {
    const note = el("span", { class: "choice-note" }, t("The voice you made in Settings › Accessibility › Personal Voice"));
    const allow = el("button", { class: "btn-text", type: "button", onclick: async () => {
      const got = await speech.personalVoice();
      note.textContent = got === "authorized" ? t("Allowed. Pick it as the voice in Narrate's Aa.") : got === "denied" ? t("Not allowed. Turn it on in Settings › Waypage.") : t("This iPhone has no Personal Voice yet.");
      if (got === "authorized") allow.remove();
    } }, t("Allow"));
    phoneSection.push(section(t("Phone's voices"), null, el("div", { class: "group" },
      el("div", { class: "row" }, el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, t("Personal Voice")), note), allow))));
  }
  if (!s) { slot.replaceChildren(...phoneSection, el("p", { class: "footnote" }, t("Kokoro voices need an Android phone with a 64-bit processor."))); return; }
  kokoroArrived(s);
  piperArrived(s);
  const busy = kokoroBusy(s);
  const again = () => fillKokoro(slot);
  const act = (action, id, then) => async () => {
    try { await speech.kokoro(action, id); } catch (e) { toast(e && e.message || t("Couldn't do that. Try again.")); }
    if (then) then();
    again();
  };
  const rows = s.packs.map((p) => {
    const mine = s.busy === p.id;
    const note = mine && busy ? kokoroStep(s)
      : mine && s.step === "bad" ? t("The download wasn't the right file. Try again.")
      : mine && s.step === "failed" ? t("Couldn't download. Try again.")
      : p.note + " · " + formatSize(p.ready ? p.size : p.bytes);
    const remove = async () => {
      if (!confirm(t("Delete {title}? It takes {formatSize}; you can download it again.", { title: p.title, formatSize: formatSize(p.size) }))) return;
      const last = allReady(s) === 1;
      await act("remove", p.id, () => { if (last) forgetKokoro(s.engine); })();
    };
    // Downloaded: a bin to delete it (Daniel's ask); which one speaks is
    // picked in Narrate's Speech engine list.
    const control = mine && s.step === "downloading" ? el("button", { class: "btn-text", type: "button", onclick: act("cancel") }, t("Stop"))
      : mine && busy ? null
      : p.ready ? el("button", { class: "row-x kokoro-delete", type: "button", "aria-label": t("Delete {title}", { title: p.title }), title: t("Delete"), disabled: busy || null, onclick: remove },
        el("span", { class: "visually-hidden" }, t("Delete")), svgBin())
      : el("button", { class: "btn-text", type: "button", disabled: busy || null, onclick: act("download", p.id) }, t("Download"));
    return el("div", { class: "row kokoro-row" },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, p.title), el("span", { class: "choice-note" }, note)), control);
  });
  // Piper: a voice for each language, by its name in the phone's language.
  // English has two (US and UK): those are named with their country.
  const twice = (v) => (s.piper || []).filter((x) => primary(x.lang) === primary(v.lang)).length > 1;
  const piper = (s.piper || []).map((v) => ({ ...v, title: langName(twice(v) ? v.lang : primary(v.lang)) }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const piperRows = piper.map((v) => {
    const mine = s.busy === v.id;
    const who = v.speaker.charAt(0).toUpperCase() + v.speaker.slice(1).replace(/_/g, " ");
    const note = mine && busy ? kokoroStep(s)
      : mine && s.step === "bad" ? t("The download wasn't the right file. Try again.")
      : mine && s.step === "failed" ? t("Couldn't download. Try again.")
      : [who, v.gender === "f" ? "female" : "male", formatSize(v.ready ? v.size : v.bytes)].join(" · ");
    const remove = async () => {
      if (!confirm(t("Delete the {title} voice? It takes {formatSize}; you can download it again.", { title: v.title, formatSize: formatSize(v.size) }))) return;
      const last = allReady(s) === 1;
      await act("remove", v.id, () => { forgetPiper(s, v); if (last) forgetKokoro(s.engine); })();
    };
    const control = mine && s.step === "downloading" ? el("button", { class: "btn-text", type: "button", onclick: act("cancel") }, t("Stop"))
      : mine && busy ? null
      : v.ready ? el("button", { class: "row-x kokoro-delete", type: "button", "aria-label": t("Delete {title}", { title: v.title }), title: t("Delete"), disabled: busy || null, onclick: remove },
        el("span", { class: "visually-hidden" }, t("Delete")), svgBin())
      : el("button", { class: "btn-text", type: "button", disabled: busy || null, onclick: act("download", v.id) }, t("Download"));
    return el("div", { class: "row kokoro-row piper-row" },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, v.title), el("span", { class: "choice-note" }, note)), control);
  });
  slot.replaceChildren(...phoneSection, section(t("Kokoro"), null, el("div", { class: "group" }, ...rows)),
    ...(piperRows.length ? [section(t("Piper"), null, el("div", { class: "group" }, ...piperRows))] : []));
  if (busy) setTimeout(() => { if (slot.isConnected) again(); }, 1000);
}

// Layout and Text are two sections here (1.48.2, Daniel's ask), out of
// the one box readingControls makes, which stays their common parent so
// syncReadingControls still finds every control in it.
function readingGroup() {
  const box = readingControls(false);
  const part = (name) => box.querySelector('.rc-part[data-part="' + name + '"]');
  const layout = part("layout"), text = part("text");
  box.classList.add("split");
  box.replaceChildren(
    section(t("Layout"), null, el("div", { class: "group" }, el("div", { class: "rc-list" }, layout))),
    section(t("Text"), null, el("div", { class: "group" },
      el("p", { class: "reading-sample" }, t("The page is the product. Everything else gets out of its way.")),
      el("div", { class: "rc-list" }, text))));
  return box;
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
  if (!FONT_EXT.test(name)) { toast(t("That isn't a font file. Pick a .ttf, .otf, .woff or .woff2.")); return; }
  if (file.size > FONT_MAX) { toast(t("That font is over 10 MB.")); return; }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || !fontMagic(bytes)) { toast(t("That file isn't a font Waypage can read.")); return; }
  try { await new FontFace("Waypage check", bytes).load(); } catch (e) { toast(t("That font didn't load. Try another file.")); return; }
  try { await C.store.addFont(name, bytes); } catch (e) { toast(t("Couldn't keep the font. Try again.")); return; }
  await loadUserFonts();
  setReading({ font: "user:" + name }, true);
  if (state.section === "reading") renderSection();
  toast(t("Added {replace}. It's your reading font now.", { replace: name.replace(FONT_EXT, "") }));
}
async function removeFontFile(name) {
  if (!confirm(t("Remove the font {replace}?", { replace: name.replace(FONT_EXT, "") }))) return;
  try { await C.store.removeFont(name); } catch (e) { toast(t("Couldn't remove it. Try again.")); return; }
  if (readingPrefs(null).font === "user:" + name) setReading({ font: READING_DEFAULT.font }, true);
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
  const where = place === "documents" ? t("Or put font files in Documents/Waypage/fonts on the phone. ")
    : place === "folder" ? t("Or put font files in a fonts folder inside {place}.", { place: C.store.placeName(C.store.place) }) : "";
  const help = t("Font files: .ttf, .otf, .woff or .woff2, up to 10 MB. A font stays on this device.") + " " + where;
  return section(t("Your fonts"), help.trim(),
    el("div", { class: "group" },
      ...mine.map((f) => el("div", { class: "row" },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label", style: "font-family: " + f.family + ", var(--sans)" }, f.label)),
        el("button", { class: "btn-text warn", type: "button", onclick: () => removeFontFile(f.user) }, t("Remove")))),
      el("button", { class: "row", type: "button", onclick: () => input.click() },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label accent" }, t("Add a font")))),
      input));
}

// Dictionaries (1.45.0): StarDict files, for Look up on selected words.
// Kept in this device's database; nothing about a lookup leaves it.
async function addDictFiles(files, btn) {
  if (!files.length) return;
  const label = btn.querySelector(".row-label");
  btn.disabled = true;
  label.textContent = t("Adding…");
  try {
    const d = await C.dict.add(files);
    toast(t("Added {name}, {n} words. Select a word and tap Look up.", { name: d.name, n: d.words.toLocaleString(i18n.lang) }));
  } catch (e) {
    toast(e && e.message && !/^(Failed|NetworkError|Quota)/.test(e.message) ? e.message : t("Couldn't keep the dictionary. Is there room on the device?"));
  }
  btn.disabled = false;
  if (state.section === "reading") renderSection();
}
async function removeDict(d) {
  if (!confirm(t("Remove the dictionary {name}?", { name: d.name }))) return;
  try { await C.dict.remove(d.id); } catch (e) { toast(t("Couldn't remove it. Try again.")); return; }
  if (state.section === "reading") renderSection();
}
function dictsGroup() {
  const input = el("input", { type: "file", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true", multiple: true });
  const add = el("button", { class: "row", type: "button", onclick: () => input.click() },
    el("span", { class: "row-label accent" }, t("Add a dictionary")));
  input.addEventListener("change", () => { const f = [...input.files]; input.value = ""; addDictFiles(f, add); });
  const more = el("a", { href: "https://github.com/koreader/koreader/wiki/Dictionary-support", onclick: (e) => { e.preventDefault(); C.platform.openOutside(e.currentTarget.href); } }, t("where to find free ones"));
  const sec = section(t("Dictionaries"), [t("Select a word while reading and tap Look up. StarDict dictionaries: pick the .ifo, .idx and .dict (or .dict.dz) files together, or a .zip or .tar.gz of them; see "),
      more, t(". A dictionary stays on this device and works offline; looking a word up sends nothing anywhere.")],
    el("div", { class: "group" },
      ...C.dict.list().map((d) => el("div", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label", dir: "auto" }, d.name),
          el("span", { class: "choice-note" }, t("{n} words · {formatSize}", { n: d.words.toLocaleString(i18n.lang), formatSize: formatSize(d.bytes) }))),
        el("button", { class: "btn-text warn", type: "button", onclick: () => removeDict(d) }, t("Remove")))),
      add, input));
  sec.id = "dictSection";
  return sec;
}

// Library's Actions: importing from another app, then Edit clips (inside
// Library since 1.27.1, when it was its own menu entry).
function libraryActions() {
  const n = allTags().length;
  const sec = section(t("Actions"), null,
    el("div", { class: "group" }, ...importRow(),
      navRow(t("Tags"), n ? tn(n, "1 tag", "{n} tags") : t("Rename, merge or delete"), () => openSection("tags", false, true)),
      navRow(t("Find and replace"), t("In many clips and files at once"), () => openSection("edit", false, true))));
  sec.id = "importSection";
  return sec;
}

// Tags (2026-11, Daniel's ask): every tag with what it's on, each opening
// its own page to rename (to another tag's name merges the two) or
// delete; and what a site's own tags do on a new clip.
let tagAt = "";
function tagsSections() {
  const tags = allTags().sort((a, b) => a.localeCompare(b));
  const how = pickRow({ label: t("Site's tags"), get: siteTagsHow, set: (v) => store(SITE_TAGS_HOW_KEY, v), options: [
    { value: "suggest", label: t("Suggest"), note: t("Shown on the clip to add with a tap") },
    { value: "known", label: t("Ones I have"), note: t("Added when you already have that tag") },
    { value: "all", label: t("Add all"), note: t("Every tag the site gives, up to 10") },
    { value: "off", label: t("Off"), note: t("Not read") }] });
  return [
    section(tags.length ? t("Your tags · {n}", { n: tags.length }) : t("Your tags"), null,
      tags.length ? el("div", { class: "group" }, ...tags.map((x) => el("button", { class: "row nav-row", type: "button", onclick: () => { tagAt = x; openSection("tag", false, true); } },
        el("span", { class: "row-label", dir: "auto" }, "#" + x),
        el("span", { class: "row-value" }, tagUseLine(x)),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›"))))
        : el("p", { class: "footnote" }, t("No tags yet. Add them from a clip's ⋯, or pick several clips and tap Tags.")),
      tags.length ? el("p", { class: "footnote" }, t("Tap a tag to rename, merge or delete it. Renaming one to a tag you already have makes them one.")) : null),
    section(t("From sites"), null, el("div", { class: "group" }, how),
      el("p", { class: "footnote" }, t("Royal Road, AO3, Scribble Hub and many news sites and blogs tag their pages. A story saved as a collection asks in Save with options instead."))),
  ];
}
// Back out of every Settings page, however deep, to what was under it.
// On a big screen the route takes its own step back from the menu (it
// leaves Settings with the section), so each step waits for that first.
async function outOfSettings() {
  for (let i = 0; i < 6 && state.settings; i++) {
    await back();
    await new Promise((done) => setTimeout(done, 150));
  }
}
function tagSections() {
  const tag = allTags().find((x) => sameTag(x, tagAt));
  if (!tag) return [el("p", { class: "footnote" }, t("No clip has this tag any more."))];
  const input = el("input", { class: "tag-input", type: "text", value: tag, "aria-label": t("Name"), maxlength: "32",
    enterkeyhint: "done", autocapitalize: "off", spellcheck: "false", dir: "auto" });
  const note = el("p", { class: "footnote accent", hidden: true });
  const go = el("button", { class: "btn-primary tag-save", type: "button", disabled: true });
  const into = () => {
    const name = cleanTag(input.value);
    return { name, other: name && allTags().find((x) => sameTag(x, name) && !sameTag(x, tag)) };
  };
  const paint = () => {
    const { name, other } = into();
    go.disabled = !name || name === tag;
    go.textContent = other ? t("Merge into #{tag}", { tag: other }) : t("Rename");
    note.hidden = !other;
    if (other) note.textContent = t("#{tag} is already a tag. The two become one, with every clip of both.", { tag: other });
  };
  const save = async () => {
    if (go.disabled) return;
    const { other } = into();
    const now = await renameTag(tag, input.value);
    tagAt = now;
    toast(other ? t("Merged into #{tag}", { tag: now }) : t("Renamed to #{tag}", { tag: now }));
    history.back();
  };
  input.addEventListener("input", paint);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  go.addEventListener("click", save);
  paint();
  return [
    el("p", { class: "meta tag-use" }, tagUseLine(tag)),
    section(t("Name"), null, el("div", { class: "tag-detail" }, input), note, go),
    section(null, null, el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: () => outOfSettings().then(() => goPlace("library")).then(() => setFilter("#" + tag)) },
        el("span", { class: "row-label accent" }, t("Show its clips"))),
      el("button", { class: "row", type: "button", onclick: async () => { await deleteTag(tag); history.back(); } },
        el("span", { class: "row-label warn" }, t("Delete tag")), el("span", { class: "row-value" }, t("Clips stay"))))),
  ];
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
  const phone = el("p", { class: "footnote warn", hidden: true }, t("Your phone has Waypage's notifications turned off. Turn them on in its settings."));
  C.platform.feedChecks.allowed().then((ok) => { if (ok === false && notesPrefs().on) phone.hidden = false; });
  const out = [section(t("Alerts"), null,
    el("div", { class: "group" },
      sw(t("Notifications"), t("New posts from feeds you follow"), n.on, (on) => {
        if (on) askToNotify = true;
        setNotes({ on });
        renderSection();
      }),
      n.on ? pickRow({ key: NOTES_KEY, label: t("New posts"), get: () => notesPrefs().posts, set: (v) => setNotes({ posts: v }),
        options: [
          { value: "each", label: t("Each post on its own"), note: t("Its title and first words, with Save") },
          { value: "together", label: t("All together"), note: t("One saying how many, and from where") },
        ] }) : null),
    phone)];
  if (!n.on) return out;
  // Feeds and newsletter addresses each in their own section (1.48.3).
  const quietList = (list) => el("div", { class: "group" }, ...list.sort((a, b) => a.title.localeCompare(b.title)).map((f) =>
    sw(f.title, null, !feedQuiet(f), (on) => setFeedQuiet(f, !on))));
  const plain = feeds.filter((f) => !isMail(f)), mail = feeds.filter(isMail);
  if (plain.length) out.push(section(t("Feeds"), t("A feed turned off here is still checked; its posts wait in Feeds without a notification."), quietList(plain)));
  if (mail.length) out.push(section(t("Newsletters"), t("An address turned off here still gets its emails; they wait in Newsletters without a notification."), quietList(mail)));
  out.push(section(null, null,
    el("div", { class: "group" }, navRow(t("Sound and more"), t("In your phone's settings for Waypage"), () => C.platform.feedChecks.settings()))));
  return out;
}
const notesValue = () => { const n = notesPrefs(); return n.on ? (n.posts === "each" ? t("Each post") : t("All together")) : t("Off"); };

function libraryGroup() {
  const input = el("input", { class: "switch", type: "checkbox", role: "switch", checked: load(CONTINUE_KEY, true),
    onchange: (e) => { store(CONTINUE_KEY, e.target.checked); renderLibrary(); } });
  return section(t("Keeping up"), null,
    el("div", { class: "group" },
      el("label", { class: "row" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label" }, t("Continue reading")),
          el("span", { class: "choice-note" }, t("Your last clip at the top of the library"))),
        input),
      switchRow(t("Check for new chapters"), t("Once a day, when you're online"), load(DAILY_KEY, true), (on) => store(DAILY_KEY, on))));
}

// Folders first, biggest first, then the pages in no folder as one
// more group; a group opens in place to its pages, biggest first.
const storageOpen = new Set();
function storageGroup() {
  const n = state.pages.length;
  const bySize = (a, b) => (b.bytes || 0) - (a.bytes || 0);
  const groups = allFolders().map((name) => ({ key: "f:" + name, name, pages: folderPages(name) }));
  const loose = state.pages.filter((p) => !p.folder);
  groups.sort((a, b) => sizeOf(b.pages) - sizeOf(a.pages));
  if (loose.length) groups.push({ key: "loose", name: t("Not in a collection"), pages: loose, loose: true });
  const list = el("div", { class: "group" });
  if (!n) list.append(el("div", { class: "row" }, el("span", { class: "row-label muted" }, t("Nothing saved yet"))));
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
  const sec = section(t("By collection"), null, list);
  sec.prepend(el("p", { class: "storage-total" }, formatSize(totalBytes()) + (n ? " · " + countLine(n) : "")));
  return sec;
}

const remeasured = () => { if (state.section === "storage") renderSection(); };

// ---- Making room (1.9.0) ----
// Clips you've finished keep their text and lose their saved pictures,
// which show from the web again when you're online: usually most of a
// clip's size. (Biggest clips was taken out in 1.47.0: By collection
// already lists every clip, biggest first.)
let makingRoom = false;
const roomFor = () => state.pages.filter((p) => p.finished && !p.link && !p.file && p.images && p.mode !== "links" && /^https?:/.test(p.url || ""));
// Its two rows sit under Storage's Actions since 1.47.0, after the backup ones.
function roomRows() {
  const list = roomFor();
  const known = list.reduce((n, p) => n + (p.imageBytes || 0), 0);
  if (list.some((p) => p.imageBytes == null)) measureSizes(list, remeasured);
  if (!list.length && !squeezable().length) return [narrationsRow()];
  const go = el("button", { class: "row room-go", type: "button", ...(list.length && !makingRoom ? {} : { disabled: "" }), onclick: () => dropPictures(list, go) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label" + (list.length ? " accent" : "") }, makingRoom ? t("Making room…") : t("Keep only the text of finished clips")),
      el("span", { class: "choice-note" }, list.length
        ? known ? t("{clips} you've finished, pictures about {size}", { clips: countLine(list.length), size: formatSize(known) }) : t("{clips} you've finished", { clips: countLine(list.length) })
        : t("The clips you've finished have no saved pictures"))),
    known ? el("span", { class: "row-value" }, formatSize(known)) : null);
  // Clips with full pictures (1.18.0), made smaller in place.
  const full = squeezable();
  const fullBytes = full.reduce((n, p) => n + (p.imageBytes || 0), 0);
  const squeezeBtn = full.length ? el("button", { class: "row room-squeeze", type: "button", ...(makingRoom ? { disabled: "" } : {}), onclick: () => squeezePictures(full, squeezeBtn) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label accent" }, makingRoom ? t("Making room…") : t("Make pictures smaller")),
      el("span", { class: "choice-note" }, fullBytes ? t("{clips} with full pictures, about {size}", { clips: countLine(full.length), size: formatSize(fullBytes) }) : t("{clips} with full pictures", { clips: countLine(full.length) }))),
    fullBytes ? el("span", { class: "row-value" }, formatSize(fullBytes)) : null) : null;
  return [squeezeBtn, go, narrationsRow()];
}
// Saved narrations (made with Save the narration) never sync, so removing
// them only frees this phone; Narrate reads those clips live again.
const narrationBytes = (p) => (p.audio.parts || []).reduce((n, x) => n + (x.size || 0), 0);
function narrationsRow() {
  const list = typeof voicedSound === "function" ? state.pages.filter(voicedSound) : [];
  if (!list.length) return null;
  const size = list.reduce((n, p) => n + narrationBytes(p), 0);
  const btn = el("button", { class: "row room-narrations", type: "button", ...(makingRoom ? { disabled: "" } : {}), onclick: () => dropNarrations(list, size, btn) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label accent" }, makingRoom ? t("Making room…") : t("Remove saved narrations")),
      el("span", { class: "choice-note" }, t("{clips} with a saved narration. Narrate reads them live again.", { clips: countLine(list.length) }))),
    size ? el("span", { class: "row-value" }, formatSize(size)) : null);
  return btn;
}
async function dropNarrations(list, size, btn) {
  if (makingRoom) return;
  if (!confirm(size
    ? t("Remove the saved narration of {clips}? It frees {size}; you can save it again.", { clips: countLine(list.length), size: formatSize(size) })
    : t("Remove the saved narration of {clips}? You can save it again.", { clips: countLine(list.length) }))) return;
  makingRoom = true;
  btn.disabled = true;
  for (const p of list) await dropVoiced(p, true).catch(() => {});
  await C.store.writeIndex(state.pages);
  makingRoom = false;
  renderLibrary();
  toast(size ? t("Made {formatSize} of room.", { formatSize: formatSize(size) }) : t("The saved narrations are gone."));
  if (state.section === "storage") renderSection();
}
const squeezable = () => !C.platform.native ? [] : state.pages.filter((p) => !p.link && (p.mode === "full" || p.comic) && p.images && !(p.squeezed >= 1));
async function squeezePictures(list, btn) {
  if (makingRoom || !C.platform.native) return;
  makingRoom = true;
  const label = btn.querySelector(".choice-label");
  btn.disabled = true;
  let freed = 0, done = 0;
  for (const p of list) {
    label.textContent = t("Making pictures smaller, {x} of {n}", { x: ++done, n: list.length });
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
  toast(freed > 0 ? t("Made {formatSize} of room.", { formatSize: formatSize(freed) }) : t("Done. Those pictures were already small."));
  if (state.section === "storage") renderSection();
}
async function dropPictures(list, btn) {
  if (makingRoom) return;
  makingRoom = true;
  const label = btn.querySelector(".choice-label");
  btn.disabled = true;
  let freed = 0, done = 0;
  for (const p of list) {
    label.textContent = t("Making room, {x} of {n}", { x: ++done, n: list.length });
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
  toast(freed > 0 ? t("Made {formatSize} of room.", { formatSize: formatSize(freed) }) : t("Done. Their pictures show when you're online."));
  if (state.section === "storage") renderSection();
}

// Where the library lives (0.33.0), first on Storage since 1.47.0: the app's own storage, the phone's
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
    { value: "app", label: t("Inside Waypage"), note: t("Recommended, and the quickest") },
  ];
  if (androidSdk >= 30 || place.kind === "documents") {
    options.push({ value: "documents", label: "Documents/Waypage", note: t("Stays if you uninstall Waypage") });
  }
  options.push({ value: "folder", label: place.kind === "folder" ? place.name || t("A folder you picked") : t("A folder you pick"),
    note: place.kind === "folder" ? t("Pick again to choose another") : C.platform.ios ? t("Like one in iCloud Drive") : t("On the phone or a memory card") });
  const group = choiceGroup({ key: "storage-place", title: t("Where your library is"), label: t("Kept in"), get: () => place.kind, options, disabled: !!moving,
    set: (v) => changePlace(v),
    help: t("Changing it moves every clip there; a library already in the new place is added to yours. Inside Waypage is private to the app{x}; uninstalling Waypage deletes it. Documents/Waypage shows in the Files app and stays after an uninstall; the empty library offers to get it back. A folder you pick can be anywhere{x2}, and saving there is a little slower.", { x: C.platform.ios ? t(" and shows in the Files app under On My iPhone") : "", x2: C.platform.ios ? t(" in the Files app") : t(", a memory card too") }),
    footnote: moving ? moving : null });
  // The picked folder can be picked again (another folder), which a pick that's already on doesn't report.
  if (place.kind === "folder" && !moving) group.querySelector(".group").append(el("button", { class: "row", type: "button", onclick: () => changePlace("folder") },
    el("span", { class: "row-label accent" }, t("Choose another folder"))));
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
  say(t("Moving your library…"));
  try {
    const joined = await C.store.moveTo(next, (done, total) => say(total ? t("Moving, {done} of {total} files…", { done: done, total: total }) : t("Moving your library…")));
    state.pages = joined;
    texts.clear();
    await loadThumbs();
    renderLibrary();
    moving = null;
    toast(initial && joined.length ? t("Your library is back: {countLine}.", { countLine: countLine(joined.length) }) : t("Your library is in {placeName} now.", { placeName: C.store.placeName(next) }));
  } catch (e) {
    console.error(e);
    moving = null;
    if (next.kind === "folder") C.platform.files.release(next.tree);
    toast(t("Couldn't move your library, so it stayed where it was. {x}", { x: e && /space|ENOSPC/i.test(e.message) ? t("Free some space and try again.") : t("Try again.") }));
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
  const lines = C.platform.log.list().map((x) => logTime(x.at) + " " + (x.kind || "error") + (x.n ? " ×" + x.n : "") + ": " + x.msg + (x.where ? "\n    " + x.where.split("\n").join("\n    ") : ""));
  return [
    reportDraft.trim() || "(Nothing written)",
    "",
    "Waypage " + APP_VERSION + (C.platform.build && C.platform.build.builtAt ? " (built " + String(C.platform.build.builtAt).slice(0, 10) + ")" : "") + ", " + (C.platform.native ? C.platform.os + " app" : "browser"),
    await C.platform.deviceLine(),
    countLine(state.pages.length) + ", theme " + state.theme + ", sync " + (C.sync.on ? "on" : "off"),
    load(START_KEY, []).map((t) => "Start: " + t.shown + " ms (scripts " + t.scripts + ", library " + t.library + ") with " + t.clips + " clips").join("\n") || "Start: not measured",
    recovered.at ? "Recover: checked " + logTime(recovered.at) + ", " + recovered.found.length + " found, " + recovered.fixed + " put back" + (recovered.found.length ? " (" + [...new Set(recovered.found.map((x) => x.kind))].join(", ") + ")" : "") : "Recover: not run",
    "",
    lines.length ? "Log:\n" + lines.join("\n") : "Log: empty",
    timing.rows.length ? "\nTimings (ms since the app started):\n" + timing.rows.join("\n") : "",
  ].join("\n");
}

// ---- Recover Notes and Highlights (2026-11) ----
// Looks through the whole library for highlights and drawings an update
// left behind, lists them by clip, and puts back what has one safe place.
// It runs when asked, never when Settings is built (Settings search builds
// every screen out of sight); the answer is kept here until the next run.
const recovered = { at: 0, found: [], fixed: 0, busy: "" };
const recoverIO = () => ({
  html: (p) => (p.link ? C.files.openLinked(p) : C.store.readPage(p.id)),
  ink: (p) => C.store.readInk(p.id),
  note: (p) => C.store.readNote(p.id),
  hasBase: async (p) => !!(await C.store.readNoteBase(p.id)),
  locateIn: (html, marks) => C.reader.locateIn(html, marks),
  printed: (p) => C.files.printed(p),
  writeNote: (p, d) => C.store.writeNote(p.id, d),
  save: () => C.store.writeIndex(state.pages),
});
async function recoverScan(btn) {
  if (recovered.busy) return;
  recovered.busy = t("Checking…");
  const label = btn && btn.querySelector(".choice-label");
  if (btn) btn.disabled = true;
  try {
    recovered.found = await C.recover.scan(state.pages, recoverIO(), (n, of) => { if (label) label.textContent = t("Checking, {n} of {of}", { n, of }); });
    recovered.at = Date.now();
    recovered.fixed = 0;
    C.platform.log.note("recover", recovered.found.length + " found in " + state.pages.length + " clips");
  } catch (e) {
    console.error(e);
    toast(t("Couldn't check your library. Try again."));
  }
  recovered.busy = "";
  renderSection();
}
async function recoverFix(list) {
  if (recovered.busy) return;
  recovered.busy = t("Putting back…");
  let n = 0;
  for (const prob of list) {
    try { if (await C.recover.fix(prob, state.pages, recoverIO())) { n++; recovered.found = recovered.found.filter((x) => x !== prob); } } catch (e) { console.error(e); }
  }
  recovered.fixed += n;
  recovered.busy = "";
  if (n) C.platform.log.note("recover", n + " put back");
  toast(n ? tn(n, "Put it back", "Put back {n}") : t("Couldn't put it back. Try again."));
  renderSection();
}
async function recoverDelete(prob) {
  const p = state.pages.find((x) => x.id === prob.clip);
  if (!p || !prob.mark) return;
  if (!confirm(t("Delete this highlight from “{title}”? Copy its text first if you want to keep it. This can't be undone.{alsoSynced}", { title: p.title, alsoSynced: alsoSynced() }))) return;
  p.marks = (p.marks || []).filter((m) => m.id !== prob.mark);
  if (!p.marks.length) delete p.marks;
  await C.store.writeIndex(state.pages);
  recovered.found = recovered.found.filter((x) => x !== prob);
  renderSection();
}
// Notes that are gone from the library but not from GitHub or this phone:
// an older build's sync drops them (see recover.js). Run when asked; each
// is brought back as a new note, the old copy left where it is.
const lostNotes = { at: 0, found: [], skipped: [], busy: "" };
const lostIO = () => ({
  sync: C.sync.on,
  folders: () => C.sync.noteFolders(),
  listing: (id) => C.sync.noteListing(id),
  title: (id) => C.sync.noteTitle(id),
  text: (path) => C.sync.readText(path),
  deleted: async () => { try { const g = await C.sync.peek(); return (g && JSON.parse(g.text).deleted) || {}; } catch (e) { return {}; } },
  orphans: (known) => C.store.orphanNotes(known),
  orphanFiles: (id) => C.store.orphanFiles(id),
  files: (id, names) => C.sync.noteFilesIn(id, names),
  bring: (name, paper, got) => C.notes.bring(name, paper, got),
});
async function recoverLook(btn) {
  if (lostNotes.busy) return;
  lostNotes.busy = t("Looking…");
  const label = btn && btn.querySelector(".choice-label");
  if (btn) btn.disabled = true;
  try {
    const r = await C.recover.findDeleted(lostIO(), new Set(state.pages.map((p) => p.id)), (n, of) => { if (label) label.textContent = t("Looking, {n} of {of}", { n, of }); });
    lostNotes.found = r.found;
    lostNotes.skipped = r.skipped;
    lostNotes.at = Date.now();
    C.platform.log.note("recover", r.found.length + " deleted notes found");
  } catch (e) {
    console.error(e);
    toast(t("Couldn't look for notes. Try again."));
  }
  lostNotes.busy = "";
  renderSection();
}
async function recoverBring(list) {
  if (lostNotes.busy) return;
  lostNotes.busy = t("Bringing back…");
  renderSection();
  let n = 0;
  for (const c of list) {
    try {
      const meta = await C.recover.bringBack(c, lostIO());
      if (!meta) continue;
      state.pages.unshift(meta);
      await C.store.writeIndex(state.pages);
      lostNotes.found = lostNotes.found.filter((x) => x !== c);
      n++;
      C.platform.log.note("recover", "brought back a note (" + c.source + ")");
      if (c.strokes) noteCoverSoon(meta, 1500);
    } catch (e) { console.error(e); }
  }
  lostNotes.busy = "";
  renderLibrary();
  toast(n ? tn(n, "Brought it back", "Brought back {n}") : t("Couldn't bring it back. Try again."));
  renderSection();
}
const noteLine = (c) => {
  const bits = [tn(c.sheets, "1 sheet", "{n} sheets"), tn(c.strokes, "1 stroke", "{n} strokes")];
  if (c.pdf) bits.push(t("from a PDF"));
  if (c.deletedAt) bits.push(t("deleted {date} by a sync from an older version", { date: new Date(c.deletedAt).toLocaleDateString(document.documentElement.lang || undefined) }));
  return bits.join(" · ");
};
function lostNotesRows() {
  const look = el("button", { class: "row recover-look", type: "button", ...(lostNotes.busy ? { disabled: "" } : {}), onclick: () => recoverLook(look) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label accent" }, lostNotes.busy || t("Look for deleted notes")),
      el("span", { class: "choice-note" }, lostNotes.at
        ? (lostNotes.found.length ? tn(lostNotes.found.length, "1 note found, checked {when}", "{n} notes found, checked {when}", { when: logTime(lostNotes.at) }) : t("No deleted notes found, checked {when}", { when: logTime(lostNotes.at) }))
        : t("In GitHub sync and on this phone"))));
  const kids = [el("div", { class: "group" }, look)];
  for (const s of lostNotes.skipped) kids.push(el("p", { class: "footnote" }, s));
  if (lostNotes.found.length > 1) {
    kids.push(el("h2", { class: "overline" }, t("Actions")),
      el("div", { class: "group" }, el("button", { class: "row", type: "button", ...(lostNotes.busy ? { disabled: "" } : {}), onclick: () => recoverBring(lostNotes.found.slice()) },
        el("span", { class: "row-label accent" }, t("Bring back all ({n})", { n: lostNotes.found.length })))));
  }
  for (const source of ["sync", "phone"]) {
    const items = lostNotes.found.filter((x) => x.source === source);
    if (!items.length) continue;
    kids.push(el("h2", { class: "overline" }, source === "sync" ? t("In GitHub sync") : t("On this phone")),
      el("div", { class: "group recover-list" }, ...items.map((c) => el("div", { class: "row recover-item" },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label", dir: "auto" }, c.title || t("Untitled note")),
          el("span", { class: "choice-note", dir: "auto" }, noteLine(c))),
        el("button", { class: "btn-text", type: "button", ...(lostNotes.busy ? { disabled: "" } : {}), onclick: () => recoverBring([c]) }, t("Bring back"))))));
  }
  return kids;
}
function recoverGroup() {
  const run = el("button", { class: "row recover-go", type: "button", ...(recovered.busy ? { disabled: "" } : {}), onclick: () => recoverScan(run) },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label accent" }, recovered.busy || t("Recover Notes and Highlights")),
      el("span", { class: "choice-note" }, recovered.at
        ? (recovered.found.length ? tn(recovered.found.length, "1 thing to look at, checked {when}", "{n} things to look at, checked {when}", { when: logTime(recovered.at) }) : t("Nothing lost, checked {when}", { when: logTime(recovered.at) }))
        : t("Looks for highlights and drawings that stopped showing after an update"))));
  const kids = [el("div", { class: "group" }, run)];
  if (recovered.at && !recovered.found.length) kids.push(el("p", { class: "footnote" }, t("Nothing lost. Every highlight and drawing has a place.")));
  const fixable = recovered.found.filter((x) => x.fix);
  if (fixable.length) {
    kids.push(el("h2", { class: "overline" }, t("Actions")),
      el("div", { class: "group" }, el("button", { class: "row", type: "button", ...(recovered.busy ? { disabled: "" } : {}), onclick: () => recoverFix(fixable) },
        el("span", { class: "row-label accent" }, t("Put back what can be ({n})", { n: fixable.length })))));
  }
  const byClip = new Map();
  for (const x of recovered.found) { if (!byClip.has(x.clip)) byClip.set(x.clip, []); byClip.get(x.clip).push(x); }
  for (const [id, items] of byClip) {
    kids.push(el("h2", { class: "overline", dir: "auto" }, items[0].title || t("Untitled")),
      el("div", { class: "group recover-list" }, ...items.map((x) => el("div", { class: "row recover-item" },
        el("span", { class: "choice-text" }, el("span", { class: "choice-note", dir: "auto" }, x.line)),
        x.fix ? el("button", { class: "btn-text", type: "button", onclick: () => recoverFix([x]) }, x.fix) : null,
        el("button", { class: "btn-text", type: "button", onclick: () => { closeSettings(); openPage(id); } }, t("Open")),
        el("button", { class: "btn-text", type: "button", onclick: () => copyText(C.recover.copyText(x, state.pages), t("Copied")) }, t("Copy")),
        x.kind === "mark-lost" ? el("button", { class: "btn-text warn", type: "button", onclick: () => recoverDelete(x) }, t("Delete")) : null))));
  }
  return section(t("Recover"), null, ...kids, ...lostNotesRows());
}
// Record timings (Unreleased, Daniel's ask): a switch here that notes
// what the phone spends its time on (frames that stall, taps that wait,
// opening and leaving a page, sheets) for the report to carry. Off it
// watches nothing. It sees only Waypage's own work: what the WebView does
// for itself shows as a stall with no script in it, and for that a USB
// inspect is the tool.
const TIMINGS_KEY = "waypage.recordTimings";
const timing = { rows: [], watch: [] };
function timingNote(what) {
  if (!timing.watch.length) return;
  timing.rows.push(Math.round(performance.now()) + " " + what);
  if (timing.rows.length > 800) timing.rows.splice(0, 200);
}
function timingWatch(on) {
  for (const o of timing.watch) o.disconnect();
  timing.watch = [];
  if (!on) return;
  const ms = Math.round;
  const watch = (type, opts, line) => {
    try {
      const o = new PerformanceObserver((l) => l.getEntries().forEach((e) => { const t = line(e); if (t) timingNote(t); }));
      o.observe({ type, ...opts });
      timing.watch.push(o);
    } catch (e) { /* not in this WebView */ }
  };
  const script = (x) => (x.sourceFunctionName || x.invoker || "?") + "@" + String(x.sourceURL || "").split("/").pop().split("?")[0] + ":" + x.sourceCharPosition + "=" + ms(x.duration) + (x.forcedStyleAndLayoutDuration >= 5 ? " (layout " + ms(x.forcedStyleAndLayoutDuration) + ")" : "");
  watch("long-animation-frame", {}, (e) => "FRAME " + ms(e.duration) + "ms (block " + ms(e.blockingDuration) + ", render from " + ms((e.renderStart || e.startTime) - e.startTime) + ") " +
    ((e.scripts || []).filter((x) => x.duration >= 5).map(script).join(", ") || "no script: the WebView's own work"));
  watch("event", { durationThreshold: 40 }, (e) => /^(click|pointerdown|pointerup|keydown)$/.test(e.name) && e.target
    ? "TAP " + e.name + " " + (e.target.id || String(e.target.className && e.target.className.baseVal != null ? e.target.className.baseVal : e.target.className).split(" ")[0] || e.target.localName) + " total " + ms(e.duration) + " wait " + ms(e.processingStart - e.startTime) + " run " + ms(e.processingEnd - e.processingStart) : "");
  watch("longtask", {}, (e) => "LONG " + ms(e.duration));
  timingNote("recording, " + navigator.hardwareConcurrency + " cores, " + (navigator.deviceMemory || "?") + " GB, " + innerWidth + "×" + innerHeight);
}
timingWatch(load(TIMINGS_KEY, false));
// To compare with and without on a phone (reader.js, lazy); on unless turned off here.
const FAR_KEY = "waypage.hideFar";
const farHidden = () => load(FAR_KEY, true) !== false;
C.reader.hideFar = farHidden();
C.reader.note = C.timingNote = timingNote;
addEventListener("visibilitychange", () => timingNote(document.hidden ? "app hidden" : "app shown"));
function timingsGroup() {
  const on = !!timing.watch.length;
  return section(t("Timings"), null,
    el("div", { class: "group" },
      switchRow(t("Record timings"), on ? t("{n} noted", { n: timing.rows.length }) : t("Off"), on, (v) => { store(TIMINGS_KEY, v); timing.rows = []; timingWatch(v); renderSection(); }),
      on ? el("button", { class: "row", type: "button", onclick: () => copyText(timing.rows.join("\n") || "Nothing noted yet", t("Timings copied")) }, el("span", { class: "row-label accent" }, t("Copy the timings"))) : null,
      on && timing.rows.length ? el("button", { class: "row", type: "button", onclick: () => { timing.rows = []; timingNote("cleared"); renderSection(); } }, el("span", { class: "row-label accent" }, t("Clear them"))) : null,
      on ? switchRow(t("Hide far chapters"), t("Off to compare, from the next book opened"), farHidden(), (v) => { store(FAR_KEY, v); C.reader.hideFar = v; timingNote("hide far chapters " + (v ? "on" : "off")); }) : null),
    el("p", { class: "footnote" }, t("For a slow screen: turn this on, do the slow thing, then send the report. It notes stalls and taps that waited, and nothing about what you read.")));
}
function reportGroup() {
  const list = C.platform.log.list();
  const field = el("textarea", { class: "mark-note-field report-field", rows: "4", placeholder: t("What happened, and what were you doing?"), "aria-label": t("What happened"), dir: "auto" });
  field.value = reportDraft;
  field.addEventListener("input", () => { reportDraft = field.value; });
  const send = async () => {
    const text = await reportText();
    try { if (await C.platform.shareText(t("Waypage problem report"), text)) return; } catch (e) { /* below */ }
    copyText(text, t("Report copied. Paste it into a message."));
  };
  const issue = async () => {
    const text = await reportText();
    const title = (reportDraft.trim().split("\n")[0] || t("Problem report")).slice(0, 80);
    // A link longer than this can be refused, so the log is cut from the start.
    const body = text.length > 6000 ? text.slice(0, 1500) + "\n…\n" + text.slice(-4400) : text;
    C.platform.openOutside(REPORT_REPO + "/issues/new?title=" + encodeURIComponent(title) + "&body=" + encodeURIComponent("```\n" + body + "\n```"));
  };
  const sec = section(t("The report"), t("Nothing leaves {HERE} unless you send it. The report holds what you wrote, Waypage's version, the phone's model and system, how long opening took, the notes below and any timings recorded, with addresses cut to their pages. An issue on GitHub is public, so anyone can read it.", { HERE: HERE }),
    field,
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: send }, el("span", { class: "row-label accent" }, t("Send the report"))),
      el("button", { class: "row", type: "button", onclick: issue }, el("span", { class: "row-label accent" }, t("Open an issue on GitHub"))),
      el("button", { class: "row", type: "button", onclick: async () => copyText(await reportText(), t("Report copied")) }, el("span", { class: "row-label accent" }, t("Copy the report")))),
    startLine() ? el("p", { class: "footnote start-line" }, startLine()) : null,
    el("h2", { class: "overline" }, list.length ? t("What went wrong lately") : t("Nothing went wrong lately")),
    list.length ? el("ol", { class: "group report-log" }, ...list.slice().reverse().slice(0, 30).map((x) => el("li", { class: "report-line" },
      el("span", { class: "meta" }, logTime(x.at) + " · " + (x.kind || "error") + (x.n ? " ×" + x.n : "")),
      el("span", { class: "report-msg", dir: "auto" }, x.msg)))) : null,
    list.length ? el("button", { class: "btn-text report-clear", type: "button", onclick: () => { C.platform.log.clear(); renderSection(); renderSettings(); } }, t("Clear these")) : null);
  sec.classList.add("report");
  return sec;
}

function aboutGroup() {
  const list = el("div", { class: "group" });
  const releases = C.platform.releasesUrl() || "https://github.com/danielnoam/waypage/releases/latest";
  list.append(navRow(t("Credits"), null, () => openSection("credits", false, true)));
  list.append(el("a", { class: "row", href: releases, target: "_blank", rel: "noopener" },
    el("span", { class: "row-label accent" }, t("Releases and source")),
    el("span", { class: "row-value", "aria-hidden": "true" }, "↗")));
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!C.platform.native && !installed && installPrompt) {
    list.prepend(el("button", { class: "row install-row", type: "button", onclick: installApp },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label accent" }, t("Install Waypage")),
        el("span", { class: "choice-note" }, t("Opens in its own window and works with no connection")))));
  }
  return el("section", { class: "settings-section" },
    list,
    !C.platform.native && !installed && !installPrompt && ios
      ? el("p", { class: "footnote install-hint" }, t("To install Waypage, tap Share, then Add to Home Screen.")) : null);
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
  toast(t("Installed. Waypage is with your other apps."));
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
        el("span", { class: "choice-label" }, t("Kept")),
        el("span", { class: "choice-note" }, t("This browser won't clear your clips to make space."))))
      : el("button", { class: "row keep-row", type: "button", onclick: async () => {
        const ok = await C.store.keepStored();
        toast(ok ? t("This browser will keep your clips.") : t("This browser didn't agree. Installing Waypage usually helps."));
        draw(await C.store.storageInfo());
      } }, el("span", { class: "choice-text" },
        el("span", { class: "choice-label accent" }, t("Keep clips from being cleared")),
        el("span", { class: "choice-note" }, t("Asks the browser not to clear this site"))));
    box.replaceChildren(
      settingHead(t("This browser"), t("Clips saved here stay in this browser only. Clearing its site data deletes them, so keep a backup. Browsers may clear a site's data when space runs low; Keep asks this one not to.")),
      el("div", { class: "group" },
        el("div", { class: "row" }, el("span", { class: "row-label" }, t("Space used")),
          el("span", { class: "row-value" }, (info.quota ? t("{done} of {total}", { done: formatSize(info.usage), total: formatSize(info.quota) }) : formatSize(info.usage)))),
        kept));
  };
  C.store.storageInfo().then(draw);
  return box;
}

// ---- Find and replace (1.22.0, was Edit clips) ----
// Find and replace across many clips at once: in their text (a match
// replaced, or removed with nothing to put instead) or their titles.
// * stands for any words, so ~~*~~ finds everything between two pairs
// of tildes. Find shows how many and a few examples first; the change
// can be undone until the app closes.
const edit = { scope: "all", folders: new Set(), picked: [], what: "text", find: "", put: "", matchCase: false, regex: false, found: null, busy: "", undo: null };
// A file read from where it is has its words kept in Waypage too, and
// those are what change; the file itself is never written. A PDF shows
// its printed pages and a comic has no words, so neither is offered.
const editableFile = (p) => !!(p.link && p.file && !p.note && !p.comic && !hasSound(p) && !["pdf", "cbz", "zim"].includes(p.file.kind));
const editClip = (p) => !p.preview && !p.link;
const editAny = (p) => editClip(p) || editableFile(p);
const editClips = () => {
  if (edit.scope === "picked") return state.pages.filter((p) => editAny(p) && edit.picked.includes(p.id));
  if (edit.scope === "folders") return state.pages.filter((p) => editAny(p) && p.folder && [...edit.folders].some((f) => sameTag(f, p.folder)));
  if (edit.scope === "files") return state.pages.filter(editableFile);
  return state.pages.filter(editClip);
};
// "8 clips, 2 files", as the library counts them.
const editCount = (ids) => holdsLine(ids.map((id) => state.pages.find((p) => p.id === id)).filter(Boolean)) || countLine(0);
function editPattern() {
  if (!edit.find) return null;
  // A space typed in Find matches any run of white space, a no-break
  // space too, as Find in this clip does.
  const src = edit.regex ? edit.find : edit.find.split("*").map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("[\\s\\S]*?");
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
  const files = state.pages.filter(editableFile).length;
  const scope = el("section", { class: "settings-section edit-sec" },
    el("div", { class: "group" }, pickRow({ key: "edit-scope", label: t("Which ones"), get: () => edit.scope, set: (v) => { edit.scope = v; editChanged(); }, options: [
      { value: "all", label: t("All clips"), note: countLine(state.pages.filter(editClip).length) },
      files ? { value: "files", label: t("All files"), note: t("{files}, read from where they are", { files: tn(files, "1 file", "{n} files") }) } : null,
      folders.length ? { value: "folders", label: t("Collections"), note: t("The ones you tick below") } : null,
      { value: "picked", label: t("The ones you pick"), note: edit.picked.length ? t("{countLine} picked in the library", { countLine: editCount(edit.picked) }) : t("Pick them in the library, then tap Edit") },
    ].filter(Boolean) })),
    edit.scope === "folders" ? el("div", { class: "group edit-folders" }, ...folders.map((f) => el("label", { class: "row" },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label", dir: "auto" }, f),
        el("span", { class: "choice-note" }, holdsLine(folderPages(f).filter(editAny)) || countLine(0))),
      el("input", { class: "switch", type: "checkbox", role: "switch", checked: edit.folders.has(f),
        onchange: (e) => { e.target.checked ? edit.folders.add(f) : edit.folders.delete(f); editChanged(); } })))) : null,
    edit.scope === "picked" ? el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: pickToEdit }, el("span", { class: "row-label accent" }, edit.picked.length ? t("Pick again in the library") : t("Pick clips in the library")))) : null);

  const field = (id, label, key, placeholder) => el("div", { class: "rc-row stack" },
    el("label", { class: "rc-label", for: id }, label),
    el("input", { class: "feed-input", id, type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", value: edit[key], placeholder,
      oninput: (e) => { edit[key] = e.target.value; edit.found = null; editResult(); } }));
  const toggle = (key, label, note) => el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), el("span", { class: "choice-note" }, note)),
    el("input", { class: "switch", type: "checkbox", role: "switch", checked: edit[key], onchange: (e) => { edit[key] = e.target.checked; editChanged(); } }));
  const change = el("section", { class: "settings-section edit-sec" },
    el("h2", { class: "overline" }, t("Change")),
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, t("In")),
          seg("edit-what", t("Change"), [{ value: "text", label: t("Text") }, { value: "titles", label: t("Titles") }], edit.what, (v) => { edit.what = v; editChanged(); })),
        field("editFind", t("Find"), "find", edit.regex ? t("A regular expression") : t("Words, or ~~*~~")),
        field("editPut", t("Replace with"), "put", t("Nothing: it's removed")))),
    el("div", { class: "group" },
      toggle("matchCase", t("Match case"), t("Capital and small letters count as different")),
      toggle("regex", t("Regular expression"), t("Find is a pattern, with $1 and so on in Replace with"))),
    el("p", { class: "footnote" }, edit.regex ? t("A match stays within one paragraph.") : t("* stands for any words in the same paragraph: ~~*~~ finds two pairs of tildes and everything between them.")),
    edit.what === "text" ? el("p", { class: "footnote" }, t("Find looks in link addresses too. With nothing to replace it, the link is removed and its words stay.")) : null);

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
        el("span", { class: "choice-label accent" }, edit.busy || (f ? t("Find again") : t("Find"))),
        el("span", { class: "choice-note" }, !edit.find ? t("Type what to find") : !re ? t("That isn't a pattern Find can use") : t("In {countLine}", { countLine: editCount(clips.map((p) => p.id)) }))))));
  if (f) {
    nodes.push(el("p", { class: "section-lead", role: "status" }, f.times
      ? tn(f.times, "Found 1 time in {clips}.", "Found {n} times in {clips}.", { clips: editCount(f.ids) })
      : clips.length === 1 ? t("Not found.") : t("Not found in any of these {countLine}.", { countLine: editCount(clips.map((p) => p.id)) })));
    if (f.samples.length) nodes.push(el("ol", { class: "group edit-samples" }, ...f.samples.map((x) => el("li", { class: "edit-sample", dir: "auto" },
      x.title ? el("span", { class: "choice-note" }, x.title) : null,
      el("span", { class: "edit-text" }, x.before, el("del", {}, x.found), x.put ? el("ins", {}, x.put) : null, x.after)))));
    if (f.times) nodes.push(el("div", { class: "group" },
      el("button", { class: "row", type: "button", ...(busy ? { disabled: "" } : {}), onclick: applyEdits },
        el("span", { class: "row-label accent" }, edit.put ? t("Replace in {countLine}", { countLine: editCount(f.ids) }) : t("Remove from {countLine}", { countLine: editCount(f.ids) })))),
      ...editNotes(f.ids));
  }
  if (edit.undo && !busy) nodes.push(el("div", { class: "group" },
    el("button", { class: "row", type: "button", onclick: undoEdits }, el("span", { class: "row-label" }, t("Undo the last change ({countLine})", { countLine: countLine(edit.undo.length) })))));
  return nodes;
}
// What happens after the change. A file read from where it is doesn't
// sync, so only Waypage's copy of its words changes, here.
function editNotes(ids) {
  const list = ids.map((id) => state.pages.find((p) => p.id === id)).filter(Boolean);
  const clips = list.some((p) => !p.link), files = list.some((p) => p.link);
  if (edit.what !== "text") return clips ? [el("p", { class: "footnote" }, t("Your other devices get the new titles when they sync."))] : [];
  return [
    el("p", { class: "footnote" }, clips ? t("Your other devices get the changed text when they sync. A highlight on changed words may not be found again.") : t("A highlight on changed words may not be found again.")),
    files ? el("p", { class: "footnote" }, t("A file read from where it is stays as it is: only Waypage's copy of its words changes, on this device.")) : null,
  ].filter(Boolean);
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
  toLibrary().then(() => { startSelect([]); toast(t("Pick the clips and files to change, then tap Edit.")); });
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
  edit.busy = t("Looking…");
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
      if (i % 10 === 9) { edit.busy = t("Looking… {done} of {total}", { done: i + 1, total: clips.length }); editResult(); await new Promise((go) => setTimeout(go, 0)); }
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
  edit.busy = t("Changing…");
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
      if (i % 5 === 4) { edit.busy = t("Changing… {done} of {total}", { done: i + 1, total: f.ids.length }); editResult(); }
    }
  } finally {
    edit.busy = "";
    edit.found = null;
    if (undo.length) edit.undo = undo;
    await C.store.writeIndex(state.pages);
    renderLibrary();
    editRedraw();
  }
  toast(changed ? t("Changed {countLine}.", { countLine: editCount(undo.map((u) => u.id)) }) : t("Nothing changed."));
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
  edit.busy = t("Undoing…");
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
  toast(t("Undone: {countLine} back as they were.", { countLine: editCount(list.map((u) => u.id)) }));
}

// ---- Credits (1.48.0) ----
// What Waypage is built with. Anything vendored or bundled goes here
// with its author and licence (CONTRIBUTING.md).
const CREDITS = {
  code: [
    { name: "Readability", by: "Mozilla", licence: "Apache 2.0", url: "https://github.com/mozilla/readability", note: t("Picks the article out of a page") },
    { name: "pdf.js", by: "Mozilla", licence: "Apache 2.0", url: "https://mozilla.github.io/pdf.js/", note: t("Shows PDFs") },
    { name: "foliate-js", by: "John Factotum", licence: "MIT", url: "https://github.com/johnfactotum/foliate-js", note: t("Reads Kindle books") },
    { name: "fzstd", by: "Arjun Barrett", licence: "MIT", url: "https://github.com/101arrowz/fzstd", note: t("Unpacks Kiwix packs") },
    { name: "Capacitor", by: "Ionic", licence: "MIT", url: "https://capacitorjs.com", note: t("Wraps the app for Android and iOS") },
    { name: "Capacitor File Opener", by: "Capawesome", licence: "MIT", url: "https://github.com/capawesome-team/capacitor-plugins", note: t("Opens the downloaded update") },
    { name: "Capacitor ML Kit Barcode Scanning", by: "Capawesome", licence: "Apache 2.0", url: "https://github.com/capawesome-team/capacitor-mlkit", note: t("Scans the sync setup code") },
    { name: "sherpa-onnx", by: "k2-fsa", licence: "Apache 2.0", url: "https://github.com/k2-fsa/sherpa-onnx", note: t("Runs the Kokoro and Piper voices, and audiobook transcripts, on Android") },
    { name: "Kokoro", by: "hexgrad", licence: "Apache 2.0", url: "https://huggingface.co/hexgrad/Kokoro-82M", note: t("Voices for Narrate, downloaded") },
    { name: "Parakeet TDT 0.6B v3", by: "NVIDIA", licence: "CC BY 4.0", url: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3", note: t("Better transcripts of audiobooks, downloaded") },
    { name: "Moonshine", by: "Useful Sensors", licence: "MIT", url: "https://github.com/usefulsensors/moonshine", note: t("Fast transcripts of audiobooks, downloaded") },
    { name: "Whisper", by: "OpenAI", licence: "MIT", url: "https://github.com/openai/whisper", note: t("Transcripts in most languages, downloaded") },
    { name: "FSRS", by: "open-spaced-repetition", licence: "MIT", url: "https://github.com/open-spaced-repetition/fsrs4anki", note: t("Schedules Anki's cards; written out in the app from the published algorithm") },
    { name: "Wiktionary", by: "Wiktionary contributors, through Wiktextract (kaikki.org)", licence: "CC BY-SA 4.0", url: "https://kaikki.org", note: t("Word meanings in Anki's language packs, downloaded") },
    { name: "Piper voices", by: "Open Home Foundation", licence: "CC0, CC BY 4.0", url: "https://github.com/OHF-Voice/piper1-gpl", note: t("Voices for Narrate, downloaded; French from the SIWIS corpus (CC BY 4.0)") },
  ],
  fonts: [
    ["Source Serif 4", "Adobe"], ["Instrument Sans", "Rodrigo Fuenzalida"], ["Literata", "TypeTogether"], ["Lora", "Cyreal"],
    ["Merriweather", "Sorkin Type"], ["EB Garamond", "Georg Duffner"], ["Inter", "Rasmus Andersson"], ["Atkinson Hyperlegible", "Braille Institute"],
    ["OpenDyslexic", "Abbie Gonzalez"], ["Assistant", "Ben Nathan"], ["David Libre", "Meir Sadan"], ["Frank Ruhl Libre", "Yanek Iontef"], ["Heebo", "Oded Ezer"],
  ],
  services: [
    { name: "Kill the Newsletter!", url: "https://kill-the-newsletter.com", note: t("Turns newsletters into feeds") },
    { name: "Internet Archive", url: "https://web.archive.org", note: t("The Wayback Machine's copy when a page is gone") },
    { name: "Wikipedia", url: "https://www.wikipedia.org", note: t("Articles through its REST API, under CC BY-SA 4.0") },
    { name: "Google ML Kit", url: "https://developers.google.com/ml-kit", note: t("Translates on the device, on Android") },
  ],
};
function creditsSections() {
  const out = (href, label, note, value) => el("a", { class: "row", href, target: "_blank", rel: "noopener",
    onclick: (e) => { e.preventDefault(); C.platform.openOutside(href); } },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), note ? el("span", { class: "choice-note" }, note) : null),
    value ? el("span", { class: "row-value" }, value) : null,
    el("span", { class: "row-value", "aria-hidden": "true" }, "↗"));
  return [
    section(t("Code"), null,
      el("div", { class: "group" }, ...CREDITS.code.map((c) => out(c.url, c.name, c.note, c.by + " · " + c.licence)))),
    section(t("Fonts"), null,
      el("div", { class: "group" }, ...CREDITS.fonts.map(([name, by]) => el("div", { class: "row" },
        el("span", { class: "row-label", style: "font-family: '" + name + "', var(--sans)" }, name), el("span", { class: "row-value" }, by))))),
    section(t("Services"), null,
      el("div", { class: "group" }, ...CREDITS.services.map((c) => out(c.url, c.name, c.note)))),
  ];
}

// Settings is a short menu; each entry is a screen of its own.
const updateOut = () => UPD_OUT.includes(upd.phase) && upd.latest;
// Settings sorted by what you came to change (1.12.0): how it looks,
// how you read, the library; then saving, sync and storage; then About.
const SECTIONS = {
  appearance: { title: t("Appearance"), build: () => [languageGroup(), themeGroup(), autoGroup(), readerThemeGroup(), looksGroup(), sidebarGroup()],
    value: () => themeName(state.theme) },
  reading: { title: t("Reading"), build: () => [readingGroup(), fontsGroup(), dictsGroup(), aloudGroup()],
    value: () => { const r = readingPrefs(null); return (FONTS.find((f) => f.value === r.font) || FONTS[0]).label + " · " + r.size + " px"; } },
  library: { title: t("Library"), build: () => [
    section(t("Layout"), null,
      el("div", { class: "group" }, el("div", { class: "rc-list" },
        seg(LAYOUT_KEY, t("Layout"), LAYOUTS.map((l) => ({ value: l.value, label: l.label })), layout(), (v) => { store(LAYOUT_KEY, v); renderLibrary(); }))),
      el("div", { class: "group" },
        switchRow(t("Series apart"), t("Their own section, under Collections"), load(SERIES_APART_KEY, true), (on) => { store(SERIES_APART_KEY, on); renderLibrary(); if (pinned.matches) renderSide(); }),
        tagRowSwitch())),
    libraryGroup(), watchGroup(), libraryActions()],
    value: () => (LAYOUTS.find((l) => l.value === layout()) || LAYOUTS[0]).label },
  saving: { title: t("Saving"), build: () => [savingGroup(), readyGroup(), signedGroup(), sendGroup()],
    value: () => SETTINGS[1].options.find((o) => o.value === SETTINGS[1].get()).label },
  sync: { title: t("GitHub sync"), build: syncSections, value: () => (C.sync.on ? (C.sync.last.error ? t("Stopped") : t("On")) : t("Off")) },
  syncHistory: { title: t("Sync history"), build: historySections, value: () => "", parent: "sync" },
  drive: { title: t("Google Drive"), build: driveSections, value: driveValue },
  notifications: { title: t("Notifications"), build: notesSections, value: notesValue },
  edit: { title: t("Find and replace"), build: editGroup, value: () => "", parent: "library" },
  tags: { title: t("Tags"), build: tagsSections, value: () => "", parent: "library" },
  tag: { get title() { return "#" + tagAt; }, build: tagSections, value: () => "", parent: "tags" },
  kokoro: { title: t("More speech engines"), build: kokoroSections, value: () => "", parent: "reading" },
  storage: { title: t("Storage"), build: () => [placeGroup(), storageGroup(), browserStorageGroup(), backupGroup(roomRows())], value: () => formatSize(totalBytes()) },
  updates: { title: t("About"), build: () => [updatesGroup(), aboutGroup()], value: () => (updateOut() ? t("{version} is out", { version: upd.latest }) : APP_VERSION) },
  previews: { title: t("Test builds"), build: () => previewsSections(), value: () => "", parent: "updates" },
  credits: { title: t("Credits"), build: creditsSections, value: () => "", parent: "updates" },
  news: { title: t("Changelog"), build: () => newsSections(), value: () => "", parent: "updates" },
  ahead: { title: t("What's new"), build: () => aheadSections(), value: () => "", parent: "updates" },
  report: { title: t("Report a problem"), build: () => [reportGroup(), recoverGroup(), timingsGroup()], value: () => { const n = C.platform.log.list().length; return n ? tn(n, "1 note", "{n} notes") : ""; } },
};

function renderSettings() {
  if (settingsQuery()) { renderFound(); return; }
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
          el("span", { class: "row-label accent" }, t("Waypage {latest} is out", { latest: upd.latest })),
          el("button", { class: "btn-small", type: "button", onclick: () => (upd.tag ? openSection("updates") : openNews(false, true)) }, t("View")))) : null,
      el("div", { class: "group" }, row("appearance"), row("reading"), row("audiobooks"), row("library"), C.platform.native ? row("notifications") : null, row("lock"), row("extensions")),
      el("div", { class: "group" }, row("saving"), row("sync"), C.drive.available ? row("drive") : null, row("storage")),
      el("div", { class: "group" }, row("updates"), row("report"))));
}

// ---- Searching Settings (1.48.0) ----
// Every screen is built once, out of sight, and its headings, rows and
// explanations read into a list; a word or two finds a setting wherever
// it sits. The list is made the first time it's needed after Settings
// opens, and dropped when they close, so it says what the screens say.
// Each result opens its screen and lights the row up for a moment.
const FIND_ALIASES = {
  Theme: t("dark mode light mode colours night"), Animations: "motion", Images: "pictures photos", Layout: t("shelf list grid scroll pages margins"),
  "Text size": t("font size bigger smaller"), Font: "typeface", Narrate: t("read aloud voice speech tts kokoro"), "On mobile data": "wi-fi cellular",
  "Where your library is": t("storage folder documents sd card"), "App lock": t("passcode pin fingerprint face biometric"), Notifications: "alerts",
  "Google Drive": "backup cloud", "GitHub sync": t("sync devices token"), "Sync history": t("revert undo restore versions earlier backup put back"), Credits: t("about licence licenses open source thanks"),
  Version: t("update check app"), Changelog: t("what's new release notes"), "Continue reading": t("last clip resume"),
  Audiobooks: t("audio listen m4b mp3 read along"), Transcripts: t("transcribe speech to text audiobook read along"),
  "Test builds": t("beta branch preview pull request"),
  "Record timings": "slow lag performance debug testing mode",
  Sidebar: t("fold collapse collapsible menu side recent favourites"),
};
let settingsIdx = null;
const settingsQuery = () => { const i = $("settingsSearch"); return i ? i.value.trim() : ""; };
const menuKeys = () => Object.keys(SECTIONS).filter((k) => k !== "news" && k !== "ahead" && k !== "tag" && !((k === "notifications" || k === "previews") && !C.platform.native) && !(k === "drive" && !C.drive.available) && !(k === "lock" && !lockCan()));
const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
function settingsIndex() {
  if (settingsIdx) return settingsIdx;
  const list = [];
  const box = el("div", { hidden: "" });
  document.body.append(box);
  for (const key of menuKeys()) {
    const s = SECTIONS[key];
    const path = (s.parent ? SECTIONS[s.parent].title + " › " : "") + s.title;
    list.push({ key, path, head: "", label: s.title, note: "", more: FIND_ALIASES[s.title] || "" });
    let built = [];
    try { built = (s.build() || []).filter(Boolean); } catch (e) { console.error(e); }
    box.replaceChildren(...built);
    for (const sec of box.querySelectorAll(".settings-section")) {
      const head = text(sec.querySelector(".overline"));
      const help = text(sec.querySelector(".help-text"));
      if (head) list.push({ key, path, head, label: head, note: "", more: help + " " + (FIND_ALIASES[head] || "") });
      for (const row of sec.querySelectorAll(".row, .choice, .rc-row, [role=radiogroup]")) {
        if (row.closest(".storage-pages, .report-log, .recover-list, .edit-samples")) continue;
        const label = row.matches("[role=radiogroup]") ? row.getAttribute("aria-label") : text(row.querySelector(".choice-label, .row-label, .rc-label, .step-num + .choice-text .choice-label"));
        if (!label || label === head || list.some((x) => x.key === key && x.head === head && x.label === label)) continue;
        const note = row.matches("[role=radiogroup]") ? [...row.querySelectorAll(".seg-face")].map(text).join(", ") : text(row.querySelector(".choice-note"));
        list.push({ key, path, head, label, note, more: (FIND_ALIASES[label] || "") + " " + help });
      }
    }
  }
  box.remove();
  for (const x of list) x.folded = fold([x.label, x.note, x.head, x.path, x.more].join(" "));
  return (settingsIdx = list);
}
function findSettings(q) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const score = (x) => {
    if (!words.every((w) => x.folded.includes(w))) return 0;
    const label = fold(x.label), head = fold(x.head);
    return words.reduce((n, w) => n + (label.startsWith(w) ? 4 : label.includes(w) ? 3 : head.includes(w) ? 2 : fold(x.note).includes(w) ? 1.5 : 1), 0) + (x.head ? 0 : 0.5);
  };
  return settingsIndex().map((x) => [score(x), x]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).slice(0, 24).map(([, x]) => x);
}
function renderFound() {
  const found = findSettings(settingsQuery());
  fill($("settingsBody"), el("div", { class: "settings-menu found-list" },
    found.length ? el("div", { class: "group" }, ...found.map((x) => el("button", { class: "row nav-row", type: "button", onclick: () => goToSetting(x) },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label", dir: "auto" }, x.label),
        el("span", { class: "choice-note" }, x.path + (x.head && x.head !== x.label ? " › " + x.head : ""))),
      el("span", { class: "row-chev", "aria-hidden": "true" }, "›"))))
      : el("p", { class: "empty-text found-none" }, t("Nothing in Settings matches that."))));
}
function goToSetting(x) {
  const s = SECTIONS[x.key];
  if (state.section !== x.key) openSection(x.key, false, !!s.parent);
  const body = $("sectionBody");
  let target = null;
  for (const sec of body.querySelectorAll(".settings-section")) {
    if (text(sec.querySelector(".overline")) !== x.head) continue;
    target = sec;
    if (x.label === x.head) break;
    for (const row of sec.querySelectorAll(".row, .choice, .rc-row, [role=radiogroup]")) {
      const label = row.matches("[role=radiogroup]") ? row.getAttribute("aria-label") : text(row.querySelector(".choice-label, .row-label, .rc-label"));
      if (label === x.label) { target = row; break; }
    }
    break;
  }
  if (!target) return;
  const wait = state.section === x.key && !wide.matches ? 0 : 0;
  setTimeout(() => {
    target.scrollIntoView({ block: "center", behavior: M.still() ? "auto" : "smooth" });
    target.classList.remove("found");
    void target.offsetWidth;
    target.classList.add("found");
    setTimeout(() => target.classList.remove("found"), 2000);
  }, wait);
}
function wireSettingsSearch() {
  const input = $("settingsSearch"), clear = $("settingsSearchClear");
  if (!input) return;
  const paint = () => { clear.hidden = !input.value; if (state.settings) renderSettings(); };
  input.addEventListener("input", paint);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && input.value) { e.preventDefault(); input.value = ""; paint(); }
    if (e.key === "Enter") { const first = $("settingsBody").querySelector(".found-list .nav-row"); if (first) first.click(); }
  });
  clear.addEventListener("click", () => { input.value = ""; paint(); input.focus(); });
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
  const entry = { view: "settings", section: key, reader: readerUnder() };
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

// Opened from a clip, Settings goes over it and Back comes back to it:
// its history entries name the clip, so the route keeps it open.
const readerUnder = () => (state.open ? state.open.id : undefined);

// `at` names a section to open over the menu (the update bar opens Updates).
function openSettings(fromHistory, at) {
  if (state.settings) return;
  // The reader sits over the other screens; under Settings while it's up.
  if (state.open) $("readerView").classList.add("under");
  settingsIdx = null;
  // With room for the section beside the menu, the first one is open.
  if (wide.matches && !at && !fromHistory) at = "appearance";
  state.settings = true;
  if (state.open) paintTheme();
  renderSettings();
  // A page of it opened from a clip is one step: Back goes to the clip.
  if (!fromHistory && !(at && state.open)) history.pushState({ view: "settings", reader: readerUnder() }, "");
  $("settingsBody").scrollTop = 0;
  const shown = pushScreen($("settingsView"));
  if (at) openSection(at);
  else shown.then(() => $("settingsBack").focus());
}

function closeSettings() {
  if (!state.settings) return;
  // In the window, the window leaves first and takes its section with it.
  let gone;
  if (wide.matches) { state.settings = false; gone = popScreen($("settingsView")); closeSection(); }
  else { closeSection(); state.settings = false; gone = popScreen($("settingsView")); }
  Promise.resolve(gone).then(() => { if (!state.settings) $("readerView").classList.remove("under"); });
  if (state.open) paintTheme();
  const q = $("settingsSearch");
  if (q) { q.value = ""; $("settingsSearchClear").hidden = true; }
  settingsIdx = null;
}

wireSettingsSearch();
