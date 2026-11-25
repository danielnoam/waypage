// Waypage: the Anki extension's screens (2026-11), loaded with its engine
// once Anki is turned on (src/extensions.js). Shell file: shares the one
// scope of app.js and the files before it.
//
//   - the Anki button on the selection bar, and the card sheet it opens
//   - the Anki place: decks, a deck's page, study, browse, edit, options
//
// Everything is drawn inside #anki, one view at a time (`av`), like the
// other places; Escape or the view's own back goes up a level.

const ANKI_DECK_KEY = "waypage.anki.lastDeck";
const ANKI_PACK_KEY = "waypage.anki.lastPack";
const ankiStamp = () => Date.now();

// What this device changes goes up soon after it stops, and what another
// device sent (a sync, or opening the place) redraws what is on screen.
C.anki.edited(() => { if (C.sync.on && C.sync.what.anki) syncSoon(30000); });
C.anki.changed(() => { if (state.place === "anki") ankiDraw(); });

// ---- The selection bar's button and the card sheet ----
let ankiNow = null;
function ankiSelection(bar, picked) {
  let b = bar.querySelector(".sel-anki");
  if (!b) {
    b = el("button", { class: "sel-anki sel-icon", type: "button", "aria-label": t("Anki card"), title: t("Anki card"), onclick: () => {
      const s = C.reader.selectionText();
      if (s) ankiCard(s.text, C.reader.selectionContext());
    } });
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SIDE_SVG.anki + "</svg>";
    bar.append(b);
  }
  b.hidden = !(picked && C.ext.on("anki") && C.anki && picked.text.trim().split(/\s+/).length <= 6);
}

async function ankiCard(text, context) {
  hideReadHere();
  C.reader.clearSelection();
  try { await C.ext.load("anki"); await C.anki.load(); } catch (e) { toast(t("Anki didn't load. Try again.")); return; }
  const p = state.open;
  ankiNow = { front: text.replace(/\s+/g, " ").trim(), context: context || "", from: p ? { page: p.id, title: p.title } : null };
  openSheet("anki");
}

function ankiCardSheet(n) {
  if (!n) return el("p", { class: "meta" }, t("Select a word to make a card."));
  const decks = C.anki.decks();
  const last = load(ANKI_DECK_KEY, "");
  let deck = decks.some((d) => d.id === last) ? last : decks[0] ? decks[0].id : "__new";
  const front = el("input", { class: "tag-input", type: "text", value: n.front, "aria-label": t("Front"), dir: "auto", autocomplete: "off", spellcheck: "false" });
  const back = el("textarea", { class: "mark-note-field", rows: "3", placeholder: t("Meaning, or a note"), "aria-label": t("Back"), dir: "auto" });
  const context = el("textarea", { class: "mark-note-field", rows: "2", placeholder: t("The sentence it came from"), "aria-label": t("Sentence"), dir: "auto" });
  context.value = n.context;
  const name = el("input", { class: "tag-input", type: "text", value: decks.length ? "" : t("Words"), placeholder: t("Name the new deck"), "aria-label": t("New deck's name"), dir: "auto", autocomplete: "off", maxlength: "60" });
  const pick = dropdown({ label: t("Deck"), cls: "field-pick", value: deck,
    options: [...decks.map((d) => ({ value: d.id, label: d.name })), { value: "__new", label: t("New deck…") }],
    onpick: (v) => { deck = v; name.hidden = v !== "__new"; if (v === "__new") name.focus(); } });
  name.hidden = deck !== "__new";
  // Fill from a language pack (Settings › Extensions › Anki › Languages):
  // the entry for the front becomes the back. Run once on opening when the
  // back is empty, and again whenever Fill is tapped.
  const have = C.ext.packs("anki").filter((p) => p.have);
  let pack = have.some((p) => p.id === load(ANKI_PACK_KEY, "")) ? load(ANKI_PACK_KEY, "") : have[0] && have[0].id;
  const found = el("p", { class: "meta anki-found", role: "status", hidden: "" });
  const doFill = async (quiet) => {
    const p = have.find((x) => x.id === pack);
    if (!p) return;
    found.hidden = false;
    found.textContent = t("Looking in {title}…", { title: p.title });
    let hit = null;
    try { hit = await C.anki.fill(front.value, C.ext.packDict("anki", pack)); } catch (e) { hit = null; }
    if (!front.isConnected) return;
    if (!hit) { found.textContent = quiet ? "" : t("Not in {title}.", { title: p.title }); found.hidden = !found.textContent; return; }
    if (quiet && back.value.trim()) { found.hidden = true; return; }
    back.value = hit.text;
    found.replaceChildren(document.createTextNode(t("From {title}", { title: p.title }) + (hit.word.toLowerCase() !== front.value.trim().toLowerCase() ? " · " + t("as {word}", { word: hit.word }) + " " : "")));
    if (hit.word.toLowerCase() !== front.value.trim().toLowerCase()) found.append(el("button", { class: "btn-text", type: "button", onclick: () => { front.value = hit.word; found.hidden = true; } }, t("Use {word}", { word: hit.word })));
  };
  const fillControls = have.length ? el("div", { class: "anki-fill" },
    have.length > 1 ? dropdown({ label: t("Language"), cls: "field-pick", value: pack, options: have.map((p) => ({ value: p.id, label: p.title })), onpick: (v) => { pack = v; store(ANKI_PACK_KEY, v); } })
      : el("span", { class: "anki-pack meta" }, have[0].title),
    el("button", { class: "btn-small", type: "button", onclick: () => doFill(false) }, t("Fill"))) : null;
  const fillRow = fillControls;
  if (fillRow) afterStart(() => { if (!back.value.trim()) doFill(true); });
  const add = () => {
    try {
      const d = deck === "__new" ? C.anki.makeDeck(name.value) : C.anki.deck(deck);
      const c = C.anki.add({ deck: d.id, front: front.value, back: back.value, context: context.value, from: n.from });
      store(ANKI_DECK_KEY, d.id);
      closeSheet();
      toast(t("Card added to {name}", { name: d.name }), t("Undo"), () => { C.anki.remove(c.id); if (state.place === "anki") ankiDraw(); });
      if (state.place === "anki") ankiDraw();
    } catch (e) { toast(e.message || t("Couldn't make the card.")); }
  };
  return el("div", { class: "page-controls anki-sheet" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Anki card"))),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, t("Front")), front),
    el("div", { class: "anki-field" }, el("span", { class: "overline" }, t("Deck")), pick, name),
    el("div", { class: "anki-field" }, el("div", { class: "anki-head" }, el("span", { class: "overline" }, t("Back")), fillControls), back, found),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, t("Sentence")), context),
    el("div", { class: "export-actions" },
      el("button", { class: "btn-quiet", type: "button", onclick: () => closeSheet() }, t("Cancel")),
      el("button", { class: "btn-primary", type: "button", onclick: add }, t("Add card"))),
    ANKIDROID ? el("button", { class: "btn-text", type: "button", onclick: () => sendToAnkiDroid(front.value, back.value, context.value) }, t("Send to AnkiDroid")) : null);
}
// AnkiDroid takes shared text as a new note, the subject in its first field
// and the text in its second, and asks which deck: so the share sheet is
// how a card gets there, with nothing for Waypage to ask of AnkiDroid.
const ANKIDROID = C.platform.native && /android/i.test(navigator.userAgent);
async function sendToAnkiDroid(front, back, context) {
  const text = [back.trim(), context.trim()].filter(Boolean).join("\n\n");
  try { await C.platform.shareText(front.trim(), text || front.trim()); } catch (e) { console.error(e); toast(t("Couldn't open the share sheet.")); }
}
SHEETS.anki = { label: t("Anki card"), build: () => ankiCardSheet(ankiNow) };

// ---- Export and import ----
// A deck out as a text file Anki imports (the phone's save screen, else the
// share sheet, else a download), and a deck from Anki (.apkg) in. The
// export is not a backup: Waypage's own is Settings › Storage, and sync.
async function ankiSaveText(name, text, mime) {
  const uri = await C.platform.writeCache(name, text);
  if (!uri) { C.platform.download(name, new Blob([text], { type: mime })); return; }
  const saved = await C.platform.saveFile(uri, name, mime);
  if (saved === null) await C.platform.shareFile(uri, name);
  else if (saved) toast(t("Saved {name}", { name: name }));
}
async function ankiExport(deckId) {
  const d = deckId ? C.anki.deck(deckId) : null;
  const out = C.anki.exportText(deckId);
  if (!out.cards) { toast(t("No cards to export yet.")); return; }
  const name = "Waypage " + (d ? d.name.replace(/[^\p{L}\p{N} _-]+/gu, "-") : t("Anki decks")) + " " + new Date().toISOString().slice(0, 10) + ".txt";
  try { await ankiSaveText(name, out.text, "text/plain"); } catch (e) { console.error(e); toast(t("Couldn't make the file. Try again.")); }
}
async function ankiImport(file) {
  toast(t("Reading {name}…", { name: file.name }));
  try {
    const r = C.anki.importCards(await C.ankiImport.readApkg(file));
    toast(r.cards
      ? [r.reviews
        ? t("Added {cards} to {decks}, with {reviews}.", { cards: tn(r.cards, "{n} card", "{n} cards"), decks: tn(r.decks, "{n} deck", "{n} decks"), reviews: tn(r.reviews, "{n} review", "{n} reviews") })
        : t("Added {cards} to {decks}.", { cards: tn(r.cards, "{n} card", "{n} cards"), decks: tn(r.decks, "{n} deck", "{n} decks") }),
        r.skipped ? tn(r.skipped, "1 card was only a picture or sound.", "{n} cards were only a picture or sound.") : ""].filter(Boolean).join(" ")
      : t("Those cards are already here."));
  } catch (e) {
    console.error(e);
    toast(e && e.message && !/^(Failed|NetworkError|Quota)/.test(e.message) ? e.message : t("Couldn't read that deck."));
  }
  ankiDraw();
}
// A picker for an .apkg, opened by whatever `open` is handed.
function ankiPicker(make) {
  const input = el("input", { type: "file", accept: ".apkg", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
  input.addEventListener("change", () => { const f = input.files[0]; input.value = ""; if (f) ankiImport(f); });
  return [make(() => input.click()), input];
}

// ---- The place ----
let av = { view: "decks", deck: null, card: null, shown: false, since: 0, early: false, query: "", edit: null };
const ankiGo = (to) => { av = { ...av, ...to }; ankiDraw(); };
const ankiRoot = () => $("anki");

function ankiSummary(n, total) {
  if (!total) return t("No cards yet");
  const bits = [n.new && t("{n} new", { n: n.new }), n.learn && t("{n} learning", { n: n.learn }), n.due && t("{n} due", { n: n.due })].filter(Boolean);
  return bits.length ? bits.join(" · ") : t("Done for today");
}
const ankiTotal = (n) => n.new + n.learn + n.due;

function ankiDraw() {
  if (state.place !== "anki" || !C.anki) return;
  // A card another device deleted meanwhile is no longer the one to study.
  if (av.view === "study" && av.card && !C.anki.card(av.card.id)) {
    const q = C.anki.queue(av.deck, ankiStamp());
    av = { ...av, card: q ? q.card : null, early: !!(q && q.early), shown: false, since: ankiStamp() };
  }
  // A deck that's gone (deleted, or never there) takes you up.
  if (av.view !== "decks" && av.view !== "name" && !(av.deck && C.anki.deck(av.deck))) av = { ...av, view: "decks", deck: null };
  fill(ankiRoot(), (ANKI_VIEWS[av.view] || ANKI_VIEWS.decks)());
  ankiKeys(av.view === "study");
}

const ankiBack = (label, to) => el("button", { class: "btn-quiet export-back", type: "button", onclick: () => ankiGo(to) }, label);

function ankiDecksView() {
  const decks = C.anki.decks();
  if (!decks.length) {
    return el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("No decks yet")),
      el("p", { class: "empty-text" }, t("Select a word in a clip and tap Anki to make a card, or start a deck here.")),
      el("button", { class: "btn-quiet", type: "button", onclick: () => ankiGo({ view: "name", deck: null }) }, t("New deck")),
      ...ankiPicker((open) => el("button", { class: "btn-quiet", type: "button", onclick: open }, t("Import from Anki"))));
  }
  const now = ankiStamp();
  return el("div", { class: "anki" },
    section(t("Decks"), null, el("div", { class: "group" }, ...decks.map((d) => {
      const n = C.anki.counts(d.id, now);
      return navRow(d.name, ankiSummary(n, C.anki.cards(d.id).length), () => ankiGo({ view: "deck", deck: d.id }));
    }))),
    section(t("Actions"), null, el("div", { class: "group" },
      menuRow(t("New deck"), () => ankiGo({ view: "name", deck: null })),
      ...ankiPicker((open) => menuRow(t("Import from Anki (.apkg)"), open)),
      menuRow(t("Export all decks"), () => ankiExport(null)))));
}

function ankiDeckView() {
  const d = C.anki.deck(av.deck), n = C.anki.counts(d.id, ankiStamp()), count = C.anki.cards(d.id).length;
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(t("Decks"), { view: "decks", deck: null })),
    el("h2", { class: "anki-title", dir: "auto" }, d.name),
    el("p", { class: "meta anki-counts", role: "status" }, ankiSummary(n, count)),
    el("button", { class: "btn-primary anki-study", type: "button", disabled: ankiTotal(n) ? null : "", onclick: ankiStudy },
      ankiTotal(n) ? t("Study") : count ? t("Done for today") : t("No cards yet")),
    section(t("Cards"), null, el("div", { class: "group" },
      navRow(t("Browse"), tn(count, "{n} card", "{n} cards"), () => ankiGo({ view: "browse", query: "" })),
      navRow(t("Options"), t("Limits, steps and retention"), () => ankiGo({ view: "options" })))),
    section(t("Actions"), null, el("div", { class: "group" },
      menuRow(t("Rename"), () => ankiGo({ view: "name" })),
      menuRow(t("Export deck"), () => ankiExport(d.id)),
      menuRow(t("Delete deck"), () => {
        if (!confirm(t("Delete “{name}” and its {plural}? This can't be undone.", { name: d.name, plural: tn(count, "{n} card", "{n} cards") }))) return;
        C.anki.removeDeck(d.id);
        ankiGo({ view: "decks", deck: null });
      }, "warn"))));
}

// New deck or rename (av.deck set).
function ankiNameView() {
  const d = av.deck && C.anki.deck(av.deck);
  const input = el("input", { class: "tag-input", type: "text", value: d ? d.name : "", placeholder: t("Name the deck"), "aria-label": t("Deck's name"), dir: "auto", maxlength: "60", autocomplete: "off" });
  const save = () => {
    try {
      if (d) { C.anki.renameDeck(d.id, input.value); ankiGo({ view: "deck" }); }
      else { const made = C.anki.makeDeck(input.value); ankiGo({ view: "deck", deck: made.id }); }
    } catch (e) { toast(e.message || t("Couldn't save that.")); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  afterStart(() => { if (input.isConnected) input.focus({ preventScroll: true }); });
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(d ? d.name : t("Decks"), d ? { view: "deck" } : { view: "decks" })),
    el("h2", { class: "anki-title" }, d ? t("Rename deck") : t("New deck")),
    input,
    el("div", { class: "export-actions" }, el("button", { class: "btn-primary", type: "button", onclick: save }, d ? t("Rename") : t("Make deck"))));
}

// ---- Study ----
function ankiStudy() { av = { ...av, view: "study" }; ankiNext(); }
function ankiNext() {
  const q = C.anki.queue(av.deck, ankiStamp());
  av = { ...av, card: q ? q.card : null, early: !!(q && q.early), shown: false, since: ankiStamp() };
  ankiDraw();
}
function ankiAnswer(g) {
  if (!av.card) return;
  C.anki.answer(av.card.id, g, ankiStamp() - av.since, ankiStamp());
  ankiNext();
}
function ankiStudyView() {
  const d = C.anki.deck(av.deck), n = C.anki.counts(d.id, ankiStamp());
  const top = el("div", { class: "anki-top" },
    ankiBack(d.name, { view: "deck" }),
    el("span", { class: "meta anki-counts", role: "status" }, [t("{n} new", { n: n.new }), t("{n} learning", { n: n.learn }), t("{n} due", { n: n.due })].join(" · ")));
  const c = av.card;
  if (!c) {
    return el("div", { class: "anki" }, top,
      el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, ankiTotal(n) ? t("Nothing right now") : t("Done for today")),
        el("p", { class: "empty-text" }, ankiTotal(n) ? t("The rest are waiting a few minutes. Come back soon.") : t("No more cards in {name} until tomorrow.", { name: d.name })),
        C.anki.canUndo() ? el("button", { class: "btn-quiet", type: "button", onclick: () => { C.anki.undo(); ankiNext(); } }, t("Undo the last answer")) : null));
  }
  const prev = av.shown ? C.anki.preview(c.id, ankiStamp()) : null;
  const from = c.from && state.pages.some((p) => p.id === c.from.page) ? c.from : null;
  return el("div", { class: "anki" }, top,
    el("div", { class: "anki-face" },
      el("p", { class: "anki-front", dir: "auto" }, c.front),
      av.shown ? el("hr", { class: "anki-rule" }) : null,
      av.shown ? el("p", { class: "anki-back", dir: "auto" }, c.back || t("No back on this card.")) : null,
      av.shown && c.context ? el("p", { class: "anki-context", dir: "auto" }, c.context) : null,
      av.shown && from ? el("button", { class: "btn-text", type: "button", onclick: () => openPage(from.page) }, t("Open {title}", { title: from.title })) : null),
    prev
      ? el("div", { class: "anki-grades", role: "group", "aria-label": t("How well did you know it?") },
        ...prev.map((o) => el("button", { class: "anki-grade", type: "button", "data-g": String(o.grade), onclick: () => ankiAnswer(o.grade) },
          el("span", { class: "anki-grade-name" }, [t("Again"), t("Hard"), t("Good"), t("Easy")][o.grade - 1]), el("span", { class: "anki-grade-wait" }, o.label))))
      : el("button", { class: "btn-primary anki-show", type: "button", onclick: () => { av.shown = true; ankiDraw(); } }, t("Show answer")),
    el("div", { class: "anki-tools" },
      el("button", { class: "btn-text", type: "button", disabled: C.anki.canUndo() ? null : "", onclick: () => { C.anki.undo(); ankiNext(); } }, t("Undo")),
      el("button", { class: "btn-text", type: "button", onclick: () => ankiGo({ view: "edit", edit: c.id, back: "study" }) }, t("Edit")),
      el("button", { class: "btn-text", type: "button", onclick: () => { C.anki.bury(c.id, ankiStamp()); ankiNext(); } }, t("Bury")),
      el("button", { class: "btn-text", type: "button", onclick: () => { C.anki.suspend(c.id, true); toast(t("Suspended. Browse the deck to bring it back.")); ankiNext(); } }, t("Suspend"))));
}

// Space or Enter shows the answer, 1 to 4 answer, Z takes the last back. In
// the capture phase, so the number keys don't also go to the sidebar's
// places (src/app-places.js onKeys, which leaves what is already handled).
let ankiKeysOn = false;
function ankiOnKey(e) {
  if (state.place !== "anki" || av.view !== "study" || !av.card) return;
  if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target) || state.menu || state.sheet || state.settings) return;
  const k = e.key;
  const act = !av.shown ? (k === " " || k === "Enter" ? () => { av.shown = true; ankiDraw(); } : null)
    : ["1", "2", "3", "4"].includes(k) ? () => ankiAnswer(+k) : k === " " || k === "Enter" ? () => ankiAnswer(3) : null;
  const undo = k.toLowerCase() === "z" && C.anki.canUndo() ? () => { C.anki.undo(); ankiNext(); } : null;
  const go = act || undo;
  if (go) { e.preventDefault(); e.stopPropagation(); go(); }
}
function ankiKeys(on) {
  if (on === ankiKeysOn) return;
  ankiKeysOn = on;
  document[on ? "addEventListener" : "removeEventListener"]("keydown", ankiOnKey, true);
}

// ---- Browse and edit ----
function ankiDue(c) {
  const s = C.anki.info(c.id);
  if (c.suspended) return t("Suspended");
  if (!s || s.state === "new") return t("New");
  const d = s.due - ankiStamp();
  return d <= 0 ? t("Due") : t("In {when}", { when: C.fsrs.label(d) });
}
function ankiBrowseView() {
  const d = C.anki.deck(av.deck);
  const q = av.query.trim().toLowerCase();
  const all = C.anki.cards(d.id).sort((a, b) => b.made - a.made);
  const hit = q ? all.filter((c) => (c.front + " " + c.back + " " + c.context).toLowerCase().includes(q)) : all;
  const search = el("input", { class: "tag-input", type: "search", value: av.query, placeholder: t("Search this deck"), "aria-label": t("Search this deck"), dir: "auto", autocomplete: "off" });
  search.addEventListener("input", () => { av.query = search.value; const at = search.selectionStart; ankiDraw(); const again = ankiRoot().querySelector("input[type=search]"); if (again) { again.focus(); again.setSelectionRange(at, at); } });
  const shown = hit.slice(0, 200);
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(d.name, { view: "deck" })),
    all.length ? search : null,
    !all.length ? el("p", { class: "empty-text" }, t("No cards in this deck yet."))
      : !hit.length ? el("p", { class: "empty-text" }, t("No card matches that."))
      : el("div", { class: "group" }, ...shown.map((c) => el("button", { class: "row nav-row", type: "button", onclick: () => ankiGo({ view: "edit", edit: c.id, back: "browse" }) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, c.front), el("span", { class: "choice-note", dir: "auto" }, (c.back || "").split("\n")[0] || t("No back"))),
        el("span", { class: "row-value" }, ankiDue(c)), el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))),
    hit.length > shown.length ? el("p", { class: "footnote" }, t("Showing the first {n} of {n2}. Search to narrow it.", { n: shown.length, n2: hit.length })) : null);
}
function ankiEditView() {
  const c = C.anki.card(av.edit);
  if (!c) { av = { ...av, view: av.back || "browse" }; return ankiDraw(); }
  let deck = c.deck, suspended = c.suspended;
  const front = el("input", { class: "tag-input", type: "text", value: c.front, "aria-label": t("Front"), dir: "auto", autocomplete: "off" });
  const back = el("textarea", { class: "mark-note-field", rows: "4", "aria-label": t("Back"), dir: "auto" });
  const context = el("textarea", { class: "mark-note-field", rows: "3", "aria-label": t("Sentence"), dir: "auto" });
  back.value = c.back; context.value = c.context;
  const leave = () => (av.back === "study" ? (av = { ...av, view: "study", edit: null }, ankiDraw()) : ankiGo({ view: av.back || "browse", edit: null }));
  const save = () => {
    try {
      C.anki.edit(c.id, { front: front.value, back: back.value, context: context.value, deck });
      if (suspended !== c.suspended) C.anki.suspend(c.id, suspended);
      if (av.back !== "study") leave();
      else if (deck !== c.deck) ankiStudy();
      else { av = { ...av, view: "study", edit: null, card: C.anki.card(c.id) }; ankiDraw(); }
    } catch (e) { toast(e.message || t("Couldn't save that.")); }
  };
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, el("button", { class: "btn-quiet export-back", type: "button", onclick: leave }, t("Cancel"))),
    el("h2", { class: "anki-title" }, t("Edit card")),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, t("Front")), front),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, t("Back")), back),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, t("Sentence")), context),
    el("div", { class: "group" },
      pickRow({ label: t("Deck"), get: () => deck, set: (v) => { deck = v; }, options: C.anki.decks().map((d) => ({ value: d.id, label: d.name })) }),
      switchRow(t("Suspended"), t("Left out of study"), suspended, (on) => { suspended = on; })),
    el("div", { class: "export-actions" }, el("button", { class: "btn-primary", type: "button", onclick: save }, t("Save"))),
    section(t("Actions"), null, el("div", { class: "group" }, menuRow(t("Delete card"), () => {
      if (!confirm(t("Delete this card? This can't be undone."))) return;
      C.anki.remove(c.id);
      if (av.back === "study") ankiStudy(); else leave();
    }, "warn"))));
}

// ---- Options ----
const STEP_SETS = [["1 10", [1, 10]], ["1 5 15", [1, 5, 15]], ["10", [10]], ["1 10 60", [1, 10, 60]], [t("None"), []]];
const RELEARN_SETS = [["10", [10]], ["1 10", [1, 10]], ["30", [30]], [t("None"), []]];
const stepKey = (a) => a.join(" ") || t("None");
const stepLabel = (a) => (a.length ? a.map((m) => (m >= 60 ? m / 60 + "h" : m + "m")).join(" · ") : t("None"));
function ankiOptionsView() {
  const d = C.anki.deck(av.deck);
  const set = (patch) => { C.anki.setOptions(d.id, patch); };
  const mins = (list, v) => (list.find((x) => x[0] === v) || list[0])[1];
  const sets = (list, cur) => list.some((x) => stepKey(x[1]) === stepKey(cur)) ? list : [[stepKey(cur), cur], ...list];
  const steps = sets(STEP_SETS, d.steps), relearn = sets(RELEARN_SETS, d.relearn);
  const numbers = (cur, list) => (list.includes(cur) ? list : [...list, cur].sort((a, b) => a - b));
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(d.name, { view: "deck" })),
    section(t("Each day"), null, el("div", { class: "group" },
      pickRow({ label: t("New cards a day"), get: () => String(d.newPerDay), set: (v) => { d.newPerDay = +v; set({ newPerDay: +v }); },
        options: numbers(d.newPerDay, [0, 5, 10, 20, 30, 50, 100]).map((n) => ({ value: String(n), label: String(n) })) }),
      pickRow({ label: t("Reviews a day"), get: () => String(d.reviewsPerDay), set: (v) => { d.reviewsPerDay = +v; set({ reviewsPerDay: +v }); },
        options: numbers(d.reviewsPerDay, [50, 100, 200, 500, 9999]).map((n) => ({ value: String(n), label: n === 9999 ? t("No limit") : String(n) })) }))),
    section(t("Steps"), null, el("div", { class: "group" },
      pickRow({ label: t("Learning steps"), note: t("Minutes before a new card graduates"), get: () => stepKey(d.steps), set: (v) => { d.steps = mins(steps, v); set({ steps: d.steps }); },
        options: steps.map((x) => ({ value: x[0], label: stepLabel(x[1]) })) }),
      pickRow({ label: t("Relearning steps"), note: t("Minutes after a card is forgotten"), get: () => stepKey(d.relearn), set: (v) => { d.relearn = mins(relearn, v); set({ relearn: d.relearn }); },
        options: relearn.map((x) => ({ value: x[0], label: stepLabel(x[1]) })) }))),
    section(t("Memory"), null, el("div", { class: "group" },
      pickRow({ label: t("Desired retention"), note: t("Higher means more reviews"), get: () => String(d.retention), set: (v) => { d.retention = +v; set({ retention: +v }); },
        options: [0.8, 0.85, 0.9, 0.95].map((r) => ({ value: String(r), label: Math.round(r * 100) + "%" })) }))));
}

const ANKI_VIEWS = { decks: ankiDecksView, deck: ankiDeckView, name: ankiNameView, study: ankiStudyView, browse: ankiBrowseView, edit: ankiEditView, options: ankiOptionsView };

// The Anki place: the decks are opened first, then it draws.
EXT_PLACES.anki = async () => {
  try { await C.anki.load(); } catch (e) {
    fill($("anki"), el("div", { class: "empty" }, el("h2", { class: "empty-title" }, t("Your decks didn't open")), el("p", { class: "empty-text" }, t("Close the app and open it again."))));
    return;
  }
  ankiDraw();
};
