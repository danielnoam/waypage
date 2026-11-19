// Waypage: Extensions in Settings, and the places they add (2026-11).
// An extension is a switch on its own page here; turned on, its code loads
// (src/extensions.js) and its place shows in the sidebar, above Stats. Off,
// nothing of it shows or loads, and what it kept stays. What it downloads
// (Anki's language packs) is listed on the same page. Shell file: shares
// the one scope of app.js and the files after it; loads after app-settings.js.

// An extension's own sections on its page, added by its code once loaded.
const EXT_PAGES = {};
const extensionsOn = () => C.ext.list().filter((x) => C.ext.on(x.id)).length;

// Settings › Extensions: one row each, saying whether it is on.
function extensionsSections() {
  const rows = C.ext.list().map((x) => el("button", { class: "row nav-row", type: "button", onclick: () => openSection(x.id, false, true) },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, x.title), el("span", { class: "choice-note" }, x.note)),
    el("span", { class: "row-value" }, C.ext.on(x.id) ? t("On") : t("Off")),
    el("span", { class: "row-chev", "aria-hidden": "true" }, "›")));
  return [section(null, null, el("div", { class: "group" }, ...rows))];
}

// An extension's own page: its switch, then what it has to download.
function extensionPage(x) {
  const sw = switchRow(x.title, x.note, C.ext.on(x.id), async (on) => {
    try {
      if (on) await C.ext.turnOn(x.id); else C.ext.turnOff(x.id);
    } catch (e) {
      toast(t("{title} didn't load. Try again.", { title: x.title }));
      renderSection();
    }
  });
  const out = [section(null, null, el("div", { class: "group" }, sw))];
  if (C.ext.on(x.id) && x.packs.length) out.push(packsSection(x));
  if (C.ext.on(x.id) && EXT_PAGES[x.id]) out.push(...EXT_PAGES[x.id]());
  return out;
}

// What the running download is up to, in the words Kokoro's rows use.
function packStep(r, p) {
  if (r.step === "downloading") return t("Downloading {name}", { name: p.title }) + " · " + (r.total ? Math.min(99, Math.floor(r.done / r.total * 100)) : 0) + "%";
  return (r.step === "checking" ? "Checking " : "Unpacking ") + p.title + "…";
}
function packsSection(x) {
  const run = C.ext.running(), err = C.ext.lastError();
  const rows = C.ext.packs(x.id).map((p) => {
    const mine = run && run.ext === x.id && run.pack === p.id;
    const bad = err && err.ext === x.id && err.pack === p.id;
    const note = mine ? packStep(run, p)
      : bad && err.kind === "bad" ? t("The download wasn't the right file. Try again.")
      : bad ? t("Couldn't download. Try again.")
      : (p.note ? p.note + " · " : "") + formatSize(p.bytes);
    const get = async () => {
      try { await C.ext.getPack(x.id, p.id); } catch (e) { /* its row says why */ }
    };
    const drop = async () => {
      if (!confirm(t("Delete {title}? It takes {formatSize}; you can download it again.", { title: p.title, formatSize: formatSize(p.bytes) }))) return;
      await C.ext.dropPack(x.id, p.id);
    };
    const control = mine && run.step === "downloading" ? el("button", { class: "btn-text", type: "button", onclick: () => C.ext.stopPack() }, t("Stop"))
      : mine ? null
      : p.have ? el("button", { class: "row-x kokoro-delete", type: "button", "aria-label": t("Delete {title}", { title: p.title }), title: t("Delete"), disabled: run ? "" : null, onclick: drop },
        el("span", { class: "visually-hidden" }, t("Delete")), svgBin())
      : el("button", { class: "btn-text", type: "button", disabled: run ? "" : null, onclick: get }, t("Download"));
    return el("div", { class: "row kokoro-row" },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, p.title), el("span", { class: "choice-note" }, note)), control);
  });
  return section(t("Languages"), null, el("div", { class: "group" }, ...rows));
}

for (const x of C.ext.list()) {
  SECTIONS[x.id] = { title: x.title, build: () => extensionPage(C.ext.list().find((y) => y.id === x.id)), value: () => (C.ext.on(x.id) ? "On" : t("Off")), parent: "extensions" };
}
SECTIONS.extensions = { title: t("Extensions"), build: extensionsSections, value: () => { const n = extensionsOn(); return n ? n + " on" : t("Off"); } };
FIND_ALIASES.Extensions = "anki flashcards cards plugin add-on addon";
FIND_ALIASES.Catalogs = "opds calibre kavita komga library server books catalog";
FIND_ALIASES.WebDAV = "webdav nextcloud owncloud nas koofr server folder books";
FIND_ALIASES.Audiobookshelf = "audiobookshelf abs audiobooks server stream listening podcasts";
FIND_ALIASES.Calibre = "calibre library folder metadata ebooks";
FIND_ALIASES.Anki = "flashcards cards spaced repetition deck";
FIND_ALIASES.Languages = "language pack dictionary german vocabulary";

// Turning one on or off: the sidebar and the Settings screens follow, and
// someone in the Anki place when it goes is taken back to the library.
C.ext.changed(() => {
  if (state.place === "anki" && !C.ext.on("anki")) goPlace("library");
  if (state.place === "calibre" && !C.ext.on("calibre")) goPlace("library");
  if (state.place === "catalogs" && !C.ext.on("catalogs")) goPlace("library");
  if (state.place === "webdav" && !C.ext.on("webdav")) goPlace("library");
  if (state.place === "audiobookshelf" && !C.ext.on("audiobookshelf")) goPlace("library");
  if (sideShown()) renderSide();
  if (state.section) renderSection();
  if (state.settings) renderSettings();
});
// A download's progress, a few times a second at most.
let packPaint = 0;
C.ext.progress(() => {
  if (!state.section || !SECTIONS[state.section] || SECTIONS[state.section].parent !== "extensions" || packPaint) return;
  packPaint = setTimeout(() => { packPaint = 0; if (state.section) renderSection(); }, C.ext.running() ? 300 : 0);
});

// Those turned on have their code loaded as the app starts, so their
// buttons are there when a clip opens. Off, none of it is fetched. Only once
// every shell file has run: a script added now can run before the ones after
// this file, and app-abs.js needs app-listen.js's REMOTE_AUDIO.
function loadExtensionsOn() { for (const x of C.ext.list()) if (C.ext.on(x.id)) C.ext.load(x.id).catch((e) => console.error(e)); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadExtensionsOn, { once: true });
else loadExtensionsOn();

// The Anki place: its code is loaded first, so it draws once it's here.
async function renderAnki() {
  const root = $("anki");
  try {
    await C.ext.load("anki");
  } catch (e) {
    fill(root, el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("Anki didn't load")),
      el("p", { class: "empty-text" }, t("Check your connection, then open it again."))));
    return;
  }
  try { await C.anki.load(); } catch (e) {
    fill(root, el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("Your decks didn't open")), el("p", { class: "empty-text" }, t("Close the app and open it again."))));
    return;
  }
  ankiDraw();
}

// The Calibre place: its code is loaded first, then the folder is read.
async function renderCalibre() {
  try { await C.ext.load("calibre"); } catch (e) {
    fill($("calibre"), el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("Calibre didn't load")),
      el("p", { class: "empty-text" }, t("Check your connection, then open it again."))));
    return;
  }
  calibreOpen();
}

// The Audiobookshelf place: its code is loaded first, then the server is asked.
async function renderAudiobookshelf() {
  try { await C.ext.load("audiobookshelf"); } catch (e) {
    fill($("audiobookshelf"), el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("Audiobookshelf didn't load")),
      el("p", { class: "empty-text" }, t("Check your connection, then open it again."))));
    return;
  }
  absDraw();
}

// The Catalogs place: its code is loaded first, then the catalog is read.
async function renderCatalogs() {
  try { await C.ext.load("catalogs"); } catch (e) {
    fill($("catalogs"), el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("Catalogs didn't load")),
      el("p", { class: "empty-text" }, t("Check your connection, then open it again."))));
    return;
  }
  catalogDraw();
}

// The WebDAV place: its code is loaded first, then the folder is read.
async function renderWebdav() {
  try { await C.ext.load("webdav"); } catch (e) {
    fill($("webdav"), el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("WebDAV didn't load")),
      el("p", { class: "empty-text" }, t("Check your connection, then open it again."))));
    return;
  }
  webdavDraw();
}
