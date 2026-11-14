// Waypage: the Anki extension's engine, loaded only once Anki is turned on
// in Settings › Extensions (src/extensions.js). Decks, cards and the review
// log, kept as JSON beside the library (store.js readAnki / writeAnki).
//
// A card's schedule is never stored: it is worked out by replaying the
// review log through FSRS (src/fsrs.js) and cached in memory. The log is
// append-only and per device, so two devices' reviews can be put together
// later without either overwriting the other.
//
//   load()                      reads it all; resolves when ready
//   decks(), deck(id), makeDeck(name), renameDeck(id, name), setOptions(id, patch), removeDeck(id)
//   cards(deckId), card(id), add({ deck, front, back, context, from }), edit(id, patch), remove(id)
//   suspend(id, on), bury(id, now)
//   counts(deckId, now)         { new, learn, due } still to do today
//   queue(deckId, now)          { card, sched, early } to show next, or null
//   preview(id, now)            [{ grade, label }] for the four buttons
//   answer(id, grade, ms, now)  the card's new schedule
//   undo()                      takes the last answer back; the card's id
//   info(id)                    the card's schedule: { state, due, stability, ... }
//   fill(term, dictId)          { word, text } from a language pack's dictionary, or null
(function () {
  const C = window.Waypage;
  const F = () => C.fsrs;
  const DAY = 86400000, MIN = 60000;
  const AHEAD = 20 * MIN;
  const DEVICE_KEY = "waypage.anki.device";
  const DEFAULTS = { newPerDay: 20, reviewsPerDay: 200, steps: [1, 10], relearn: [10], retention: 0.9 };

  let deckList = [], cardList = [], logList = [], sched = new Map(), loaded = null, lastAnswer = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const device = () => {
    let d = null;
    try { d = localStorage.getItem(DEVICE_KEY); } catch (e) { /* none */ }
    if (!d) { d = uid(); try { localStorage.setItem(DEVICE_KEY, d); } catch (e) { /* none */ } }
    return d;
  };

  // One write at a time per file, each saving what is current when its turn
  // comes, so two quick answers never land out of order.
  const writing = new Map();
  function save(name, data) {
    const p = (writing.get(name) || Promise.resolve()).then(() => C.store.writeAnki(name, data())).catch((e) => console.error(e));
    writing.set(name, p);
    return p;
  }
  const saveDecks = () => save("decks", () => ({ v: 1, decks: deckList }));
  const saveCards = () => save("cards", () => ({ v: 1, cards: cardList }));
  const saveLog = () => save("log." + device(), () => ({ v: 1, log: logList }));

  const deckById = (id) => deckList.find((d) => d.id === id) || null;
  const cardById = (id) => cardList.find((c) => c.id === id) || null;
  const optsOf = (card) => { const d = card && deckById(card.deck); return d ? { ...DEFAULTS, ...d } : { ...DEFAULTS }; };

  // The schedules, from the log.
  function rebuild() {
    sched = new Map();
    for (const c of cardList) sched.set(c.id, F().fresh());
    const byId = new Map(cardList.map((c) => [c.id, c]));
    const sorted = logList.map((e, i) => [e, i]).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map((x) => x[0]);
    for (const e of sorted) {
      const c = byId.get(e.card);
      if (!c) continue;
      sched.set(e.card, F().apply(sched.get(e.card), e.grade, e.at, optsOf(c)));
    }
  }

  function load() {
    if (!loaded) {
      loaded = (async () => {
        const [d, c, l] = await Promise.all([C.store.readAnki("decks"), C.store.readAnki("cards"), C.store.readAnki("log." + device())]);
        deckList = (d && Array.isArray(d.decks) && d.decks) || [];
        cardList = (c && Array.isArray(c.cards) && c.cards) || [];
        logList = (l && Array.isArray(l.log) && l.log) || [];
        rebuild();
      })();
      loaded.catch(() => { loaded = null; });
    }
    return loaded;
  }
  // For tests: forget everything held, so the next load() reads again.
  function unload() { loaded = null; deckList = []; cardList = []; logList = []; sched = new Map(); lastAnswer = null; }

  // ---- Decks ----
  const decks = () => deckList.map((d) => ({ ...DEFAULTS, ...d }));
  const deck = (id) => { const d = deckById(id); return d ? { ...DEFAULTS, ...d } : null; };
  function makeDeck(name) {
    const n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!n) throw new Error("Give the deck a name.");
    const same = deckList.find((d) => d.name.toLowerCase() === n.toLowerCase());
    if (same) return { ...DEFAULTS, ...same };
    const d = { id: uid(), name: n, ...DEFAULTS, made: Date.now(), edited: Date.now() };
    deckList.push(d);
    saveDecks();
    return { ...d };
  }
  function renameDeck(id, name) {
    const d = deckById(id), n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!d || !n) return;
    if (deckList.some((x) => x !== d && x.name.toLowerCase() === n.toLowerCase())) throw new Error("There's a deck with that name.");
    d.name = n; d.edited = Date.now();
    saveDecks();
  }
  const num = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : dflt);
  function setOptions(id, patch) {
    const d = deckById(id);
    if (!d) return;
    if (patch.newPerDay != null) d.newPerDay = num(patch.newPerDay, 0, 9999, DEFAULTS.newPerDay);
    if (patch.reviewsPerDay != null) d.reviewsPerDay = num(patch.reviewsPerDay, 0, 9999, DEFAULTS.reviewsPerDay);
    if (patch.steps != null) d.steps = patch.steps.map(Number).filter((m) => m > 0 && m < 1440).slice(0, 6);
    if (patch.relearn != null) d.relearn = patch.relearn.map(Number).filter((m) => m > 0 && m < 1440).slice(0, 6);
    if (patch.retention != null) d.retention = Math.min(0.97, Math.max(0.7, Number(patch.retention) || DEFAULTS.retention));
    d.edited = Date.now();
    saveDecks();
    rebuild();
  }
  function removeDeck(id) {
    if (!deckById(id)) return;
    deckList = deckList.filter((d) => d.id !== id);
    const gone = new Set(cardList.filter((c) => c.deck === id).map((c) => c.id));
    cardList = cardList.filter((c) => c.deck !== id);
    for (const g of gone) sched.delete(g);
    saveDecks(); saveCards();
  }

  // ---- Cards ----
  const cards = (deckId) => cardList.filter((c) => !deckId || c.deck === deckId).map((c) => ({ ...c }));
  const card = (id) => { const c = cardById(id); return c ? { ...c } : null; };
  function add(x) {
    const front = String(x.front || "").replace(/\s+/g, " ").trim();
    if (!front) throw new Error("The card needs something on its front.");
    if (!deckById(x.deck)) throw new Error("Pick a deck for it.");
    const c = { id: uid(), deck: x.deck, front: front.slice(0, 200), back: String(x.back || "").trim().slice(0, 4000),
      context: String(x.context || "").trim().slice(0, 600), from: x.from || null, made: Date.now(), edited: Date.now(), suspended: false, buried: 0 };
    cardList.push(c);
    sched.set(c.id, F().fresh());
    saveCards();
    return { ...c };
  }
  function edit(id, patch) {
    const c = cardById(id);
    if (!c) return;
    for (const k of ["front", "back", "context"]) if (patch[k] != null) c[k] = String(patch[k]).trim();
    if (patch.deck && deckById(patch.deck)) c.deck = patch.deck;
    if (!c.front) throw new Error("The card needs something on its front.");
    c.edited = Date.now();
    saveCards();
    if (patch.deck) rebuild();
  }
  function remove(id) {
    cardList = cardList.filter((c) => c.id !== id);
    sched.delete(id);
    if (lastAnswer && lastAnswer.id === id) lastAnswer = null;
    saveCards();
  }
  function suspend(id, on) { const c = cardById(id); if (c) { c.suspended = !!on; c.edited = Date.now(); saveCards(); } }
  // Out of today's cards: back tomorrow.
  function bury(id, now) { const c = cardById(id); if (c) { c.buried = dayEnd(now); c.edited = Date.now(); saveCards(); } }

  // ---- Today ----
  function dayStart(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dayEnd(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime(); }
  const info = (id) => sched.get(id) || null;

  // What was answered today in a deck, by what the card was before.
  function doneToday(deckId, now) {
    const start = dayStart(now), done = { new: 0, review: 0 };
    for (let i = logList.length - 1; i >= 0; i--) {
      const e = logList[i];
      if (e.at < start) continue;
      const c = cardById(e.card);
      if (!c || c.deck !== deckId) continue;
      if (e.was === "new") done.new++; else if (e.was === "review") done.review++;
    }
    return done;
  }
  function pools(deckId, now) {
    const end = dayEnd(now), d = deck(deckId);
    const p = { learn: [], ahead: [], due: [], fresh: [] };
    if (!d) return { ...p, d: null, left: { new: 0, review: 0 } };
    for (const c of cardList) {
      if (c.deck !== deckId || c.suspended || c.buried > now) continue;
      const s = sched.get(c.id);
      if (!s) continue;
      if (s.state === "new") p.fresh.push(c);
      else if (s.state === "review") { if (s.due < end) p.due.push(c); }
      else if (s.due <= now) p.learn.push(c);
      else if (s.due <= now + AHEAD) p.ahead.push(c);
    }
    const by = (f) => (a, b) => f(a) - f(b);
    p.learn.sort(by((c) => sched.get(c.id).due));
    p.ahead.sort(by((c) => sched.get(c.id).due));
    p.due.sort(by((c) => sched.get(c.id).due));
    p.fresh.sort(by((c) => c.made));
    const done = doneToday(deckId, now);
    return { ...p, d, left: { new: Math.max(0, d.newPerDay - done.new), review: Math.max(0, d.reviewsPerDay - done.review) } };
  }
  function counts(deckId, now) {
    const p = pools(deckId, now);
    return { new: Math.min(p.fresh.length, p.left.new), learn: p.learn.length, due: Math.min(p.due.length, p.left.review) };
  }
  function queue(deckId, now) {
    const p = pools(deckId, now);
    const pick = p.learn[0] || (p.left.review ? p.due[0] : null) || (p.left.new ? p.fresh[0] : null);
    if (pick) return { card: { ...pick }, sched: { ...sched.get(pick.id) }, early: false };
    if (p.ahead[0]) return { card: { ...p.ahead[0] }, sched: { ...sched.get(p.ahead[0].id) }, early: true };
    return null;
  }

  // ---- Answering ----
  function preview(id, now) {
    const c = cardById(id);
    if (!c) return [];
    return F().preview(sched.get(id), now, optsOf(c)).map((o) => ({ grade: o.grade, label: o.label }));
  }
  function answer(id, grade, ms, now) {
    const c = cardById(id);
    if (!c) throw new Error("That card isn't here any more.");
    const before = sched.get(id) || F().fresh();
    const entry = { card: id, at: now, grade, ms: Math.max(0, Math.round(ms || 0)), was: before.state };
    logList.push(entry);
    sched.set(id, F().apply(before, grade, now, optsOf(c)));
    lastAnswer = { id, entry, before };
    saveLog();
    return { ...sched.get(id) };
  }
  function undo() {
    if (!lastAnswer) return null;
    const { id, entry, before } = lastAnswer;
    const i = logList.lastIndexOf(entry);
    if (i >= 0) logList.splice(i, 1);
    sched.set(id, before);
    lastAnswer = null;
    saveLog();
    return id;
  }
  const canUndo = () => !!lastAnswer;

  // ---- Language packs ----
  // A word's entry in one language pack (a StarDict dictionary: src/dict.js),
  // as the text for a card's back. `word` is the headword it was found
  // under, which is not the selection when that was an inflected form.
  const plain = (part) => {
    if ("mlgt".includes(part.type)) return part.text;
    const n = C.dict.show(part);
    return n ? n.textContent : "";
  };
  async function fill(term, dictId) {
    if (!dictId) return null;
    const found = await C.dict.lookup(term, dictId);
    if (!found.length) return null;
    const text = found[0].parts.map(plain).map((t) => t.trim()).filter(Boolean).join("\n\n");
    return text ? { word: found[0].word, text } : null;
  }

  C.anki = { fill, load, unload, decks, deck, makeDeck, renameDeck, setOptions, removeDeck, cards, card, add, edit, remove, suspend, bury,
    counts, queue, preview, answer, undo, canUndo, info, dayStart, dayEnd, DEFAULTS };
})();
