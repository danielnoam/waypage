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

// ---- The selection bar's button and the card sheet ----
let ankiNow = null;
function ankiSelection(bar, picked) {
  let b = bar.querySelector(".sel-anki");
  if (!b) {
    b = el("button", { class: "sel-anki sel-icon", type: "button", "aria-label": "Anki card", title: "Anki card", onclick: () => {
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
  try { await C.ext.load("anki"); await C.anki.load(); } catch (e) { toast("Anki didn't load. Try again."); return; }
  const p = state.open;
  ankiNow = { front: text.replace(/\s+/g, " ").trim(), context: context || "", from: p ? { page: p.id, title: p.title } : null };
  openSheet("anki");
}

function ankiCardSheet(n) {
  if (!n) return el("p", { class: "meta" }, "Select a word to make a card.");
  const decks = C.anki.decks();
  const last = load(ANKI_DECK_KEY, "");
  let deck = decks.some((d) => d.id === last) ? last : decks[0] ? decks[0].id : "__new";
  const front = el("input", { class: "tag-input", type: "text", value: n.front, "aria-label": "Front", dir: "auto", autocomplete: "off", spellcheck: "false" });
  const back = el("textarea", { class: "mark-note-field", rows: "3", placeholder: "Meaning, or a note", "aria-label": "Back", dir: "auto" });
  const context = el("textarea", { class: "mark-note-field", rows: "2", placeholder: "The sentence it came from", "aria-label": "Sentence", dir: "auto" });
  context.value = n.context;
  const name = el("input", { class: "tag-input", type: "text", value: decks.length ? "" : "Words", placeholder: "Name the new deck", "aria-label": "New deck's name", dir: "auto", autocomplete: "off", maxlength: "60" });
  const pick = dropdown({ label: "Deck", cls: "field-pick", value: deck,
    options: [...decks.map((d) => ({ value: d.id, label: d.name })), { value: "__new", label: "New deck…" }],
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
    found.textContent = "Looking in " + p.title + "…";
    let hit = null;
    try { hit = await C.anki.fill(front.value, C.ext.packDict("anki", pack)); } catch (e) { hit = null; }
    if (!front.isConnected) return;
    if (!hit) { found.textContent = quiet ? "" : "Not in " + p.title + "."; found.hidden = !found.textContent; return; }
    if (quiet && back.value.trim()) { found.hidden = true; return; }
    back.value = hit.text;
    found.replaceChildren(document.createTextNode("From " + p.title + (hit.word.toLowerCase() !== front.value.trim().toLowerCase() ? " · as " + hit.word + " " : "")));
    if (hit.word.toLowerCase() !== front.value.trim().toLowerCase()) found.append(el("button", { class: "btn-text", type: "button", onclick: () => { front.value = hit.word; found.hidden = true; } }, "Use " + hit.word));
  };
  const fillControls = have.length ? el("div", { class: "anki-fill" },
    have.length > 1 ? dropdown({ label: "Language", cls: "field-pick", value: pack, options: have.map((p) => ({ value: p.id, label: p.title })), onpick: (v) => { pack = v; store(ANKI_PACK_KEY, v); } })
      : el("span", { class: "anki-pack meta" }, have[0].title),
    el("button", { class: "btn-small", type: "button", onclick: () => doFill(false) }, "Fill")) : null;
  const fillRow = fillControls;
  if (fillRow) afterStart(() => { if (!back.value.trim()) doFill(true); });
  const add = () => {
    try {
      const d = deck === "__new" ? C.anki.makeDeck(name.value) : C.anki.deck(deck);
      const c = C.anki.add({ deck: d.id, front: front.value, back: back.value, context: context.value, from: n.from });
      store(ANKI_DECK_KEY, d.id);
      closeSheet();
      toast("Card added to " + d.name, "Undo", () => { C.anki.remove(c.id); if (state.place === "anki") ankiDraw(); });
      if (state.place === "anki") ankiDraw();
    } catch (e) { toast(e.message || "Couldn't make the card."); }
  };
  return el("div", { class: "page-controls anki-sheet" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, "Anki card")),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, "Front"), front),
    el("div", { class: "anki-field" }, el("span", { class: "overline" }, "Deck"), pick, name),
    el("div", { class: "anki-field" }, el("div", { class: "anki-head" }, el("span", { class: "overline" }, "Back"), fillControls), back, found),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, "Sentence"), context),
    el("div", { class: "export-actions" },
      el("button", { class: "btn-quiet", type: "button", onclick: () => closeSheet() }, "Cancel"),
      el("button", { class: "btn-primary", type: "button", onclick: add }, "Add card")));
}
SHEETS.anki = { label: "Anki card", build: () => ankiCardSheet(ankiNow) };

// ---- The place ----
let av = { view: "decks", deck: null, card: null, shown: false, since: 0, early: false, query: "", edit: null };
const ankiGo = (to) => { av = { ...av, ...to }; ankiDraw(); };
const ankiRoot = () => $("anki");
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

function ankiSummary(n, total) {
  if (!total) return "No cards yet";
  const bits = [n.new && n.new + " new", n.learn && n.learn + " learning", n.due && n.due + " due"].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Done for today";
}
const ankiTotal = (n) => n.new + n.learn + n.due;

function ankiDraw() {
  if (state.place !== "anki" || !C.anki) return;
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
      el("h2", { class: "empty-title" }, "No decks yet"),
      el("p", { class: "empty-text" }, "Select a word in a clip and tap Anki to make a card, or start a deck here."),
      el("button", { class: "btn-quiet", type: "button", onclick: () => ankiGo({ view: "name", deck: null }) }, "New deck"));
  }
  const now = ankiStamp();
  return el("div", { class: "anki" },
    section("Decks", null, el("div", { class: "group" }, ...decks.map((d) => {
      const n = C.anki.counts(d.id, now);
      return navRow(d.name, ankiSummary(n, C.anki.cards(d.id).length), () => ankiGo({ view: "deck", deck: d.id }));
    }))),
    section("Actions", null, el("div", { class: "group" }, menuRow("New deck", () => ankiGo({ view: "name", deck: null })))));
}

function ankiDeckView() {
  const d = C.anki.deck(av.deck), n = C.anki.counts(d.id, ankiStamp()), count = C.anki.cards(d.id).length;
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack("Decks", { view: "decks", deck: null })),
    el("h2", { class: "anki-title", dir: "auto" }, d.name),
    el("p", { class: "meta anki-counts", role: "status" }, ankiSummary(n, count)),
    el("button", { class: "btn-primary anki-study", type: "button", disabled: ankiTotal(n) ? null : "", onclick: ankiStudy },
      ankiTotal(n) ? "Study" : count ? "Done for today" : "No cards yet"),
    section("Cards", null, el("div", { class: "group" },
      navRow("Browse", plural(count, "card", "cards"), () => ankiGo({ view: "browse", query: "" })),
      navRow("Options", "Limits, steps and retention", () => ankiGo({ view: "options" })))),
    section("Actions", null, el("div", { class: "group" },
      menuRow("Rename", () => ankiGo({ view: "name" })),
      menuRow("Delete deck", () => {
        if (!confirm("Delete “" + d.name + "” and its " + plural(count, "card", "cards") + "? This can't be undone.")) return;
        C.anki.removeDeck(d.id);
        ankiGo({ view: "decks", deck: null });
      }, "warn"))));
}

// New deck or rename (av.deck set).
function ankiNameView() {
  const d = av.deck && C.anki.deck(av.deck);
  const input = el("input", { class: "tag-input", type: "text", value: d ? d.name : "", placeholder: "Name the deck", "aria-label": "Deck's name", dir: "auto", maxlength: "60", autocomplete: "off" });
  const save = () => {
    try {
      if (d) { C.anki.renameDeck(d.id, input.value); ankiGo({ view: "deck" }); }
      else { const made = C.anki.makeDeck(input.value); ankiGo({ view: "deck", deck: made.id }); }
    } catch (e) { toast(e.message || "Couldn't save that."); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  afterStart(() => { if (input.isConnected) input.focus({ preventScroll: true }); });
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(d ? d.name : "Decks", d ? { view: "deck" } : { view: "decks" })),
    el("h2", { class: "anki-title" }, d ? "Rename deck" : "New deck"),
    input,
    el("div", { class: "export-actions" }, el("button", { class: "btn-primary", type: "button", onclick: save }, d ? "Rename" : "Make deck")));
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
    el("span", { class: "meta anki-counts", role: "status" }, [plural(n.new, "new", "new"), n.learn + " learning", n.due + " due"].join(" · ")));
  const c = av.card;
  if (!c) {
    return el("div", { class: "anki" }, top,
      el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, ankiTotal(n) ? "Nothing right now" : "Done for today"),
        el("p", { class: "empty-text" }, ankiTotal(n) ? "The rest are waiting a few minutes. Come back soon." : "No more cards in " + d.name + " until tomorrow."),
        C.anki.canUndo() ? el("button", { class: "btn-quiet", type: "button", onclick: () => { C.anki.undo(); ankiNext(); } }, "Undo the last answer") : null));
  }
  const prev = av.shown ? C.anki.preview(c.id, ankiStamp()) : null;
  const from = c.from && state.pages.some((p) => p.id === c.from.page) ? c.from : null;
  return el("div", { class: "anki" }, top,
    el("div", { class: "anki-face" },
      el("p", { class: "anki-front", dir: "auto" }, c.front),
      av.shown ? el("hr", { class: "anki-rule" }) : null,
      av.shown ? el("p", { class: "anki-back", dir: "auto" }, c.back || "No back on this card.") : null,
      av.shown && c.context ? el("p", { class: "anki-context", dir: "auto" }, c.context) : null,
      av.shown && from ? el("button", { class: "btn-text", type: "button", onclick: () => openPage(from.page) }, "Open " + from.title) : null),
    prev
      ? el("div", { class: "anki-grades", role: "group", "aria-label": "How well did you know it?" },
        ...prev.map((o) => el("button", { class: "anki-grade", type: "button", "data-g": String(o.grade), onclick: () => ankiAnswer(o.grade) },
          el("span", { class: "anki-grade-name" }, ["Again", "Hard", "Good", "Easy"][o.grade - 1]), el("span", { class: "anki-grade-wait" }, o.label))))
      : el("button", { class: "btn-primary anki-show", type: "button", onclick: () => { av.shown = true; ankiDraw(); } }, "Show answer"),
    el("div", { class: "anki-tools" },
      el("button", { class: "btn-text", type: "button", disabled: C.anki.canUndo() ? null : "", onclick: () => { C.anki.undo(); ankiNext(); } }, "Undo"),
      el("button", { class: "btn-text", type: "button", onclick: () => ankiGo({ view: "edit", edit: c.id, back: "study" }) }, "Edit"),
      el("button", { class: "btn-text", type: "button", onclick: () => { C.anki.bury(c.id, ankiStamp()); ankiNext(); } }, "Bury"),
      el("button", { class: "btn-text", type: "button", onclick: () => { C.anki.suspend(c.id, true); toast("Suspended. Browse the deck to bring it back."); ankiNext(); } }, "Suspend")));
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
  if (c.suspended) return "Suspended";
  if (!s || s.state === "new") return "New";
  const d = s.due - ankiStamp();
  return d <= 0 ? "Due" : "In " + C.fsrs.label(d);
}
function ankiBrowseView() {
  const d = C.anki.deck(av.deck);
  const q = av.query.trim().toLowerCase();
  const all = C.anki.cards(d.id).sort((a, b) => b.made - a.made);
  const hit = q ? all.filter((c) => (c.front + " " + c.back + " " + c.context).toLowerCase().includes(q)) : all;
  const search = el("input", { class: "tag-input", type: "search", value: av.query, placeholder: "Search this deck", "aria-label": "Search this deck", dir: "auto", autocomplete: "off" });
  search.addEventListener("input", () => { av.query = search.value; const at = search.selectionStart; ankiDraw(); const again = ankiRoot().querySelector("input[type=search]"); if (again) { again.focus(); again.setSelectionRange(at, at); } });
  const shown = hit.slice(0, 200);
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(d.name, { view: "deck" })),
    all.length ? search : null,
    !all.length ? el("p", { class: "empty-text" }, "No cards in this deck yet.")
      : !hit.length ? el("p", { class: "empty-text" }, "No card matches that.")
      : el("div", { class: "group" }, ...shown.map((c) => el("button", { class: "row nav-row", type: "button", onclick: () => ankiGo({ view: "edit", edit: c.id, back: "browse" }) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, c.front), el("span", { class: "choice-note", dir: "auto" }, (c.back || "").split("\n")[0] || "No back")),
        el("span", { class: "row-value" }, ankiDue(c)), el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))),
    hit.length > shown.length ? el("p", { class: "footnote" }, "Showing the first " + shown.length + " of " + hit.length + ". Search to narrow it.") : null);
}
function ankiEditView() {
  const c = C.anki.card(av.edit);
  if (!c) { av = { ...av, view: av.back || "browse" }; return ankiDraw(); }
  let deck = c.deck, suspended = c.suspended;
  const front = el("input", { class: "tag-input", type: "text", value: c.front, "aria-label": "Front", dir: "auto", autocomplete: "off" });
  const back = el("textarea", { class: "mark-note-field", rows: "4", "aria-label": "Back", dir: "auto" });
  const context = el("textarea", { class: "mark-note-field", rows: "3", "aria-label": "Sentence", dir: "auto" });
  back.value = c.back; context.value = c.context;
  const leave = () => (av.back === "study" ? (av = { ...av, view: "study", edit: null }, ankiDraw()) : ankiGo({ view: av.back || "browse", edit: null }));
  const save = () => {
    try {
      C.anki.edit(c.id, { front: front.value, back: back.value, context: context.value, deck });
      if (suspended !== c.suspended) C.anki.suspend(c.id, suspended);
      if (av.back !== "study") leave();
      else if (deck !== c.deck) ankiStudy();
      else { av = { ...av, view: "study", edit: null, card: C.anki.card(c.id) }; ankiDraw(); }
    } catch (e) { toast(e.message || "Couldn't save that."); }
  };
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, el("button", { class: "btn-quiet export-back", type: "button", onclick: leave }, "Cancel")),
    el("h2", { class: "anki-title" }, "Edit card"),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, "Front"), front),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, "Back"), back),
    el("label", { class: "anki-field" }, el("span", { class: "overline" }, "Sentence"), context),
    el("div", { class: "group" },
      pickRow({ label: "Deck", get: () => deck, set: (v) => { deck = v; }, options: C.anki.decks().map((d) => ({ value: d.id, label: d.name })) }),
      switchRow("Suspended", "Left out of study", suspended, (on) => { suspended = on; })),
    el("div", { class: "export-actions" }, el("button", { class: "btn-primary", type: "button", onclick: save }, "Save")),
    section("Actions", null, el("div", { class: "group" }, menuRow("Delete card", () => {
      if (!confirm("Delete this card? This can't be undone.")) return;
      C.anki.remove(c.id);
      if (av.back === "study") ankiStudy(); else leave();
    }, "warn"))));
}

// ---- Options ----
const STEP_SETS = [["1 10", [1, 10]], ["1 5 15", [1, 5, 15]], ["10", [10]], ["1 10 60", [1, 10, 60]], ["None", []]];
const RELEARN_SETS = [["10", [10]], ["1 10", [1, 10]], ["30", [30]], ["None", []]];
const stepKey = (a) => a.join(" ") || "None";
const stepLabel = (a) => (a.length ? a.map((m) => (m >= 60 ? m / 60 + "h" : m + "m")).join(" · ") : "None");
function ankiOptionsView() {
  const d = C.anki.deck(av.deck);
  const set = (patch) => { C.anki.setOptions(d.id, patch); };
  const mins = (list, v) => (list.find((x) => x[0] === v) || list[0])[1];
  const sets = (list, cur) => list.some((x) => stepKey(x[1]) === stepKey(cur)) ? list : [[stepKey(cur), cur], ...list];
  const steps = sets(STEP_SETS, d.steps), relearn = sets(RELEARN_SETS, d.relearn);
  const numbers = (cur, list) => (list.includes(cur) ? list : [...list, cur].sort((a, b) => a - b));
  return el("div", { class: "anki" },
    el("div", { class: "export-top" }, ankiBack(d.name, { view: "deck" })),
    section("Each day", null, el("div", { class: "group" },
      pickRow({ label: "New cards a day", get: () => String(d.newPerDay), set: (v) => { d.newPerDay = +v; set({ newPerDay: +v }); },
        options: numbers(d.newPerDay, [0, 5, 10, 20, 30, 50, 100]).map((n) => ({ value: String(n), label: String(n) })) }),
      pickRow({ label: "Reviews a day", get: () => String(d.reviewsPerDay), set: (v) => { d.reviewsPerDay = +v; set({ reviewsPerDay: +v }); },
        options: numbers(d.reviewsPerDay, [50, 100, 200, 500, 9999]).map((n) => ({ value: String(n), label: n === 9999 ? "No limit" : String(n) })) }))),
    section("Steps", null, el("div", { class: "group" },
      pickRow({ label: "Learning steps", note: "Minutes before a new card graduates", get: () => stepKey(d.steps), set: (v) => { d.steps = mins(steps, v); set({ steps: d.steps }); },
        options: steps.map((x) => ({ value: x[0], label: stepLabel(x[1]) })) }),
      pickRow({ label: "Relearning steps", note: "Minutes after a card is forgotten", get: () => stepKey(d.relearn), set: (v) => { d.relearn = mins(relearn, v); set({ relearn: d.relearn }); },
        options: relearn.map((x) => ({ value: x[0], label: stepLabel(x[1]) })) }))),
    section("Memory", null, el("div", { class: "group" },
      pickRow({ label: "Desired retention", note: "Higher means more reviews", get: () => String(d.retention), set: (v) => { d.retention = +v; set({ retention: +v }); },
        options: [0.8, 0.85, 0.9, 0.95].map((r) => ({ value: String(r), label: Math.round(r * 100) + "%" })) }))));
}

const ANKI_VIEWS = { decks: ankiDecksView, deck: ankiDeckView, name: ankiNameView, study: ankiStudyView, browse: ankiBrowseView, edit: ankiEditView, options: ankiOptionsView };
