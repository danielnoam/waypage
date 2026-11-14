// Waypage: Extensions in Settings, and the places they add (2026-11).
// An extension is a switch on its own page here; turned on, its code loads
// (src/extensions.js) and its place shows in the sidebar, above Stats. Off,
// nothing of it shows or loads, and what it kept stays. What it downloads
// (Anki's language packs) is listed on the same page. Shell file: shares
// the one scope of app.js and the files after it; loads after app-settings.js.

const extensionsOn = () => C.ext.list().filter((x) => C.ext.on(x.id)).length;

// Settings › Extensions: one row each, saying whether it is on.
function extensionsSections() {
  const rows = C.ext.list().map((x) => el("button", { class: "row nav-row", type: "button", onclick: () => openSection(x.id, false, true) },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, x.title), el("span", { class: "choice-note" }, x.note)),
    el("span", { class: "row-value" }, C.ext.on(x.id) ? "On" : "Off"),
    el("span", { class: "row-chev", "aria-hidden": "true" }, "›")));
  return [section(null, null, el("div", { class: "group" }, ...rows))];
}

// An extension's own page: its switch, then what it has to download.
function extensionPage(x) {
  const sw = switchRow(x.title, x.note, C.ext.on(x.id), async (on) => {
    try {
      if (on) await C.ext.turnOn(x.id); else C.ext.turnOff(x.id);
    } catch (e) {
      toast(x.title + " didn't load. Try again.");
      renderSection();
    }
  });
  const out = [section(null, null, el("div", { class: "group" }, sw))];
  if (C.ext.on(x.id) && x.packs.length) out.push(packsSection(x));
  return out;
}

// What the running download is up to, in the words Kokoro's rows use.
function packStep(r, p) {
  if (r.step === "downloading") return "Downloading " + p.title + " · " + (r.total ? Math.min(99, Math.floor(r.done / r.total * 100)) : 0) + "%";
  return (r.step === "checking" ? "Checking " : "Unpacking ") + p.title + "…";
}
function packsSection(x) {
  const run = C.ext.running(), err = C.ext.lastError();
  const rows = C.ext.packs(x.id).map((p) => {
    const mine = run && run.ext === x.id && run.pack === p.id;
    const bad = err && err.ext === x.id && err.pack === p.id;
    const note = mine ? packStep(run, p)
      : bad && err.kind === "bad" ? "The download wasn't the right file. Try again."
      : bad ? "Couldn't download. Try again."
      : (p.note ? p.note + " · " : "") + formatSize(p.bytes);
    const get = async () => {
      try { await C.ext.getPack(x.id, p.id); } catch (e) { /* its row says why */ }
    };
    const drop = async () => {
      if (!confirm("Delete " + p.title + "? It takes " + formatSize(p.bytes) + "; you can download it again.")) return;
      await C.ext.dropPack(x.id, p.id);
    };
    const control = mine && run.step === "downloading" ? el("button", { class: "btn-text", type: "button", onclick: () => C.ext.stopPack() }, "Stop")
      : mine ? null
      : p.have ? el("button", { class: "row-x kokoro-delete", type: "button", "aria-label": "Delete " + p.title, title: "Delete", disabled: run ? "" : null, onclick: drop },
        el("span", { class: "visually-hidden" }, "Delete"), svgBin())
      : el("button", { class: "btn-text", type: "button", disabled: run ? "" : null, onclick: get }, "Download");
    return el("div", { class: "row kokoro-row" },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, p.title), el("span", { class: "choice-note" }, note)), control);
  });
  return section("Languages", null, el("div", { class: "group" }, ...rows));
}

for (const x of C.ext.list()) {
  SECTIONS[x.id] = { title: x.title, build: () => extensionPage(C.ext.list().find((y) => y.id === x.id)), value: () => (C.ext.on(x.id) ? "On" : "Off"), parent: "extensions" };
}
SECTIONS.extensions = { title: "Extensions", build: extensionsSections, value: () => { const n = extensionsOn(); return n ? n + " on" : "Off"; } };
FIND_ALIASES.Extensions = "anki flashcards cards plugin add-on addon";
FIND_ALIASES.Anki = "flashcards cards spaced repetition deck";
FIND_ALIASES.Languages = "language pack dictionary german vocabulary";

// Turning one on or off: the sidebar and the Settings screens follow, and
// someone in the Anki place when it goes is taken back to the library.
C.ext.changed(() => {
  if (state.place === "anki" && !C.ext.on("anki")) goPlace("library");
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
// buttons are there when a clip opens. Off, none of it is fetched.
for (const x of C.ext.list()) if (C.ext.on(x.id)) C.ext.load(x.id).catch((e) => console.error(e));

// The Anki place: its code is loaded first, so it draws once it's here.
async function renderAnki() {
  const root = $("anki");
  try {
    await C.ext.load("anki");
  } catch (e) {
    fill(root, el("div", { class: "empty" }, el("h2", { class: "empty-title" }, "Anki didn't load"),
      el("p", { class: "empty-text" }, "Check your connection, then open it again.")));
    return;
  }
  try { await C.anki.load(); } catch (e) {
    fill(root, el("div", { class: "empty" }, el("h2", { class: "empty-title" }, "Your decks didn't open"), el("p", { class: "empty-text" }, "Close the app and open it again.")));
    return;
  }
  ankiDraw();
}
