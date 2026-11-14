// Waypage: Extensions in Settings, and the places they add (2026-11).
// An extension is a switch here; turned on, its code loads (src/extensions.js)
// and its place shows in the sidebar, above Stats. Off, nothing of it
// shows or loads, and what it kept stays. Shell file: shares the one scope
// of app.js and the files after it; loads after app-settings.js.

function extensionsSections() {
  const rows = C.ext.list().map((x) => switchRow(x.title, x.note, C.ext.on(x.id), async (on) => {
    try {
      if (on) await C.ext.turnOn(x.id); else C.ext.turnOff(x.id);
    } catch (e) {
      toast(x.title + " didn't load. Try again.");
      renderSection();
    }
  }));
  return [section(null, null, el("div", { class: "group" }, ...rows))];
}

const extensionsOn = () => C.ext.list().filter((x) => C.ext.on(x.id)).length;
SECTIONS.extensions = { title: "Extensions", build: extensionsSections, value: () => { const n = extensionsOn(); return n ? n + " on" : "Off"; } };
FIND_ALIASES.Extensions = "anki flashcards cards plugin add-on addon language packs";

// Turning one on or off: the sidebar and the Settings screens follow, and
// someone in the Anki place when it goes is taken back to the library.
C.ext.changed(() => {
  if (state.place === "anki" && !C.ext.on("anki")) goPlace("library");
  if (sideShown()) renderSide();
  if (state.section === "extensions") renderSection();
  if (state.settings) renderSettings();
});

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
  if (state.place !== "anki") return;
  const none = C.anki.empty();
  fill(root, el("div", { class: "empty" }, el("h2", { class: "empty-title" }, none.title), el("p", { class: "empty-text" }, none.text)));
}
