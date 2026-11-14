// The Anki extension's scheduler and engine (2026-11): `node test/anki.test.js`.
// FSRS (src/fsrs.js) checked against what its formulas promise, and the
// engine (src/anki.js) through a made-up store: queue, limits, answering,
// undo, and a schedule that comes back the same from the log alone.
const assert = require("assert");

const files = new Map();
const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
global.window = { Waypage: { store: {
  writeAnki: async (name, data) => { if (data) files.set(name, JSON.stringify(data)); else files.delete(name); },
  readAnki: async (name) => (files.has(name) ? JSON.parse(files.get(name)) : null),
} } };
require("../src/fsrs.js");
require("../src/anki.js");
const F = window.Waypage.fsrs, A = window.Waypage.anki;

let passed = 0;
const queued = [];
function test(name, fn) { queued.push([name, fn]); }

const T0 = new Date(2026, 10, 14, 9, 0, 0).getTime();
const MIN = 60000, DAY = 86400000;
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, a + " is not near " + b);

test("a new card's first stability is the weight for its button", () => {
  for (const g of [1, 2, 3, 4]) near(F.next(F.fresh(), g, T0, { steps: [] }).stability, F.weights[g - 1]);
});

test("recall is 90% when a card is as old as its stability, and the interval for 90% is the stability", () => {
  near(F.retrievability(5, 5), 0.9, 1e-9);
  assert.strictEqual(F.interval(5, 0.9), 5);
  assert.strictEqual(F.interval(0.2, 0.9), 1);
  assert.ok(F.interval(5, 0.97) < 5 && F.interval(5, 0.8) > 5);
});

test("learning steps: Again waits a minute, Good moves on, a second Good graduates", () => {
  const o = { steps: [1, 10] };
  const a = F.next(F.fresh(), 1, T0, o);
  assert.strictEqual(a.state, "learn"); assert.strictEqual(a.due, T0 + MIN);
  const h = F.next(F.fresh(), 2, T0, o);
  assert.strictEqual(h.due, T0 + 5.5 * MIN);
  const g = F.next(F.fresh(), 3, T0, o);
  assert.strictEqual(g.state, "learn"); assert.strictEqual(g.step, 1); assert.strictEqual(g.due, T0 + 10 * MIN);
  const g2 = F.next(g, 3, T0 + 10 * MIN, o);
  assert.strictEqual(g2.state, "review"); assert.ok(g2.due >= T0 + DAY);
  const e = F.next(F.fresh(), 4, T0, o);
  assert.strictEqual(e.state, "review"); assert.strictEqual(e.due, T0 + 16 * DAY);
});

test("a review's four buttons never land on the same day, and Again goes to relearning", () => {
  let c = F.next(F.next(F.fresh(), 3, T0, { steps: [1, 10] }), 3, T0 + 10 * MIN, { steps: [1, 10] });
  const now = c.due;
  const p = F.preview(c, now, {});
  const days = p.slice(1).map((x) => Math.round((x.card.due - now) / DAY));
  assert.ok(days[0] >= 1 && days[0] < days[1] && days[1] < days[2], days.join());
  assert.strictEqual(p[0].card.state, "relearn"); assert.strictEqual(p[0].card.lapses, 1);
  assert.ok(p[0].card.stability < c.stability);
  assert.deepStrictEqual(p.map((x) => typeof x.label), ["string", "string", "string", "string"]);
});

test("a card answered later than due grows more than one answered on time", () => {
  const base = F.next(F.fresh(), 4, T0, {});
  const on = F.next(base, 3, base.due, {}), late = F.next(base, 3, base.due + 10 * DAY, {});
  assert.ok(late.stability > on.stability);
});

test("difficulty stays between 1 and 10 and rises with Again, falls with Easy", () => {
  let hard = F.next(F.fresh(), 1, T0, {}), easy = F.next(F.fresh(), 4, T0, {});
  assert.ok(hard.difficulty > easy.difficulty);
  for (let i = 0; i < 40; i++) { hard = F.next(hard, 1, T0 + i, {}); easy = F.next(easy, 4, T0 + i, {}); }
  assert.ok(hard.difficulty <= 10 && easy.difficulty >= 1);
});

test("labels read as minutes, hours, days, months", () => {
  assert.deepStrictEqual([30e3, 10 * MIN, 3 * 3600e3, 3 * DAY, 45 * DAY].map(F.label), ["<1m", "10m", "3h", "3d", "1.5mo"]);
});

(async () => {
  for (const [name, fn] of queued) {
    try { await fn(); passed++; console.log("  ok - " + name); }
    catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
  }
  const t = async (name, fn) => {
    try { A.unload(); files.clear(); await A.load(); await fn(); passed++; console.log("  ok - " + name); }
    catch (e) { console.error("  FAIL - " + name); console.error("    " + e.stack.split("\n").slice(0, 3).join("\n    ")); process.exitCode = 1; }
  };
  const flush = () => new Promise((r) => setTimeout(r, 5));

  await t("a deck's new cards come up, answered, and are counted off", async () => {
    const d = A.makeDeck("German");
    const c = A.add({ deck: d.id, front: "Haus", back: "house", context: "Das Haus ist alt." });
    assert.deepStrictEqual(A.counts(d.id, T0), { new: 1, learn: 0, due: 0 });
    const q = A.queue(d.id, T0);
    assert.strictEqual(q.card.id, c.id);
    A.answer(c.id, 3, 4000, T0);
    assert.deepStrictEqual(A.counts(d.id, T0), { new: 0, learn: 0, due: 0 });
    assert.strictEqual(A.queue(d.id, T0 + 5 * MIN).early, true, "inside 20 minutes it comes early when nothing else is left");
    assert.strictEqual(A.counts(d.id, T0 + 5 * MIN).learn, 0, "but it is not counted as due");
    assert.strictEqual(A.counts(d.id, T0 + 11 * MIN).learn, 1);
    A.answer(c.id, 3, 3000, T0 + 11 * MIN);
    const s = A.info(c.id);
    assert.strictEqual(s.state, "review");
    assert.strictEqual(A.counts(d.id, T0 + 11 * MIN).due, 0);
    assert.strictEqual(A.counts(d.id, s.due + 1).due, 1);
  });

  await t("the new-cards limit counts the day's first answers, and a new day starts over", async () => {
    const d = A.makeDeck("Limits");
    A.setOptions(d.id, { newPerDay: 2 });
    for (const w of ["a", "b", "c"]) A.add({ deck: d.id, front: w });
    assert.strictEqual(A.counts(d.id, T0).new, 2);
    A.answer(A.queue(d.id, T0).card.id, 4, 1000, T0);
    assert.strictEqual(A.counts(d.id, T0).new, 1);
    A.answer(A.queue(d.id, T0).card.id, 4, 1000, T0);
    assert.strictEqual(A.counts(d.id, T0).new, 0);
    assert.strictEqual(A.queue(d.id, T0), null);
    assert.strictEqual(A.counts(d.id, T0 + DAY).new, 1);
  });

  await t("suspended and buried cards are left out", async () => {
    const d = A.makeDeck("Left out");
    const a = A.add({ deck: d.id, front: "a" }), b = A.add({ deck: d.id, front: "b" });
    A.suspend(a.id, true);
    assert.strictEqual(A.queue(d.id, T0).card.id, b.id);
    A.bury(b.id, T0);
    assert.strictEqual(A.queue(d.id, T0), null);
    assert.strictEqual(A.queue(d.id, T0 + DAY).card.id, b.id);
  });

  await t("undo puts the card and its log back", async () => {
    const d = A.makeDeck("Undo");
    const c = A.add({ deck: d.id, front: "x" });
    A.answer(c.id, 4, 1000, T0);
    assert.strictEqual(A.info(c.id).state, "review");
    assert.strictEqual(A.undo(), c.id);
    assert.strictEqual(A.info(c.id).state, "new");
    assert.strictEqual(A.counts(d.id, T0).new, 1);
    assert.strictEqual(A.undo(), null);
  });

  await t("the same schedule comes back from the files alone", async () => {
    const d = A.makeDeck("Replay");
    const a = A.add({ deck: d.id, front: "a" }), b = A.add({ deck: d.id, front: "b" });
    A.answer(a.id, 3, 1, T0); A.answer(a.id, 3, 1, T0 + 10 * MIN); A.answer(b.id, 4, 1, T0 + 20 * MIN);
    A.answer(b.id, 1, 1, T0 + 17 * DAY);
    const before = [a.id, b.id].map((id) => A.info(id));
    await flush();
    A.unload();
    await A.load();
    assert.deepStrictEqual([a.id, b.id].map((id) => A.info(id)), before);
    assert.strictEqual(A.cards(d.id).length, 2);
    assert.strictEqual(A.info(b.id).state, "relearn");
  });

  await t("fill takes the first entry from the pack's dictionary, and says what it was found under", async () => {
    const asked = [];
    window.Waypage.dict = { lookup: async (term, only) => { asked.push([term, only]);
      return term === "Häusern" ? [{ dict: "De", word: "Haus", parts: [{ type: "m", text: "noun · das Haus · pl. Häuser\n1. house" }] }] : []; },
      show: () => null };
    assert.deepStrictEqual(await A.fill("Häusern", "d1"), { word: "Haus", text: "noun · das Haus · pl. Häuser\n1. house" });
    assert.deepStrictEqual(asked, [["Häusern", "d1"]]);
    assert.strictEqual(await A.fill("Katze", "d1"), null);
    assert.strictEqual(await A.fill("Haus", null), null, "no pack, nothing to ask");
  });

  await t("renaming, moving and deleting keep the decks straight", async () => {
    const d1 = A.makeDeck("One"), d2 = A.makeDeck("Two");
    assert.strictEqual(A.makeDeck("one").id, d1.id, "the same name is the same deck");
    const c = A.add({ deck: d1.id, front: "x" });
    A.edit(c.id, { deck: d2.id, back: "y" });
    assert.strictEqual(A.card(c.id).deck, d2.id);
    assert.throws(() => A.renameDeck(d1.id, "two"), /name/);
    A.removeDeck(d2.id);
    assert.strictEqual(A.card(c.id), null);
    assert.throws(() => A.add({ deck: d1.id, front: "  " }), /front/);
  });

  // ---- Sync: what another device's files do here ----
  const DEV = "abcdefghij12";
  const deckDoc = (...decks) => ({ v: 1, decks, gone: {} });
  const cardDoc = (cards, gone = {}) => ({ v: 1, cards, gone });
  const rdeck = (id, name, extra) => ({ id, name, newPerDay: 20, reviewsPerDay: 200, steps: [1, 10], relearn: [10], retention: 0.9, made: 100, edited: 100, ...extra });
  const rcard = (id, deck, front, extra) => ({ id, deck, front, back: "", context: "", from: null, made: 100, edited: 100, suspended: false, buried: 0, ...extra });

  await t("decks and cards from another device come in, and the copy edited last wins", async () => {
    const d = A.makeDeck("Mine");
    const c = A.add({ deck: d.id, front: "alt", back: "old" });
    const mine = A.card(c.id);
    assert.strictEqual(A.mergeIn({ decks: deckDoc(rdeck("r1", "Theirs")), cards: cardDoc([rcard("k1", "r1", "neu"), { ...mine, back: "older", edited: mine.edited - 5000 }]) }), true);
    assert.deepStrictEqual(A.decks().map((x) => x.name).sort(), ["Mine", "Theirs"]);
    assert.strictEqual(A.card(c.id).back, "old", "an older copy doesn't win");
    A.mergeIn({ cards: cardDoc([{ ...mine, back: "newer", edited: mine.edited + 5000 }]) });
    assert.strictEqual(A.card(c.id).back, "newer");
    assert.strictEqual(A.mergeIn({ cards: cardDoc([{ ...mine, back: "newer", edited: mine.edited + 5000 }]) }), false, "nothing new says so");
  });

  await t("a deletion reaches the other device, and beats an older copy but not a later edit", async () => {
    const d = A.makeDeck("D");
    const c = A.add({ deck: d.id, front: "x" }), e = A.add({ deck: d.id, front: "y" });
    const had = A.card(c.id), other = A.card(e.id);
    A.mergeIn({ cards: cardDoc([], { [c.id]: had.edited + 10, [e.id]: other.edited - 10 }) });
    assert.strictEqual(A.card(c.id), null, "deleted there after the last edit here");
    assert.ok(A.card(e.id), "edited here after it was deleted there");
    A.remove(e.id);
    const out = JSON.parse(A.docs().cards);
    assert.ok(out.gone[e.id] && out.gone[c.id], "both deletions are kept to be sent");
    assert.deepStrictEqual(out.cards, []);
    A.mergeIn({ cards: cardDoc([other]) });
    assert.strictEqual(A.card(e.id), null, "an old copy from a device that hasn't heard doesn't bring it back");
  });

  await t("a deleted deck takes its cards, and two decks of one name become the older one", async () => {
    const mine = A.makeDeck("Words");
    const c = A.add({ deck: mine.id, front: "a" });
    A.mergeIn({ decks: deckDoc(rdeck("older", "words", { made: 1 })), cards: cardDoc([rcard("k9", "older", "b")]) });
    assert.deepStrictEqual(A.decks().map((x) => x.id), ["older"]);
    assert.deepStrictEqual(A.cards().map((x) => x.deck), ["older", "older"], "its cards moved over");
    A.mergeIn({ decks: { v: 1, decks: [], gone: { older: Date.now() + 1000 } } });
    assert.deepStrictEqual([A.decks().length, A.cards().length], [0, 0]);
    assert.ok(c.id);
  });

  await t("what arrives that isn't a deck or a card is left out", async () => {
    A.mergeIn({ decks: deckDoc(rdeck("ok", "Fine"), { id: 5 }, null, { id: "x", name: " " }), cards: cardDoc([rcard("c", "ok", "yes"), rcard("c2", "ok", " "), { id: "c3" }, null]) });
    assert.deepStrictEqual([A.decks().map((x) => x.name), A.cards().map((x) => x.front)], [["Fine"], ["yes"]]);
  });

  await t("another device's answers are replayed with ours, and count against the day's limit", async () => {
    const d = A.makeDeck("Shared");
    A.setOptions(d.id, { newPerDay: 1 });
    const a = A.add({ deck: d.id, front: "a" }), b = A.add({ deck: d.id, front: "b" });
    const theirs = [{ card: a.id, at: T0, grade: 3, ms: 900, was: "new" }, { card: a.id, at: T0 + 10 * MIN, grade: 3, ms: 900, was: "learn" }];
    assert.strictEqual(A.takeLog(DEV, theirs), true);
    assert.strictEqual(A.info(a.id).state, "review");
    assert.strictEqual(A.counts(d.id, T0 + 20 * MIN).new, 0, "their new card used up today's one");
    assert.strictEqual(A.queue(d.id, T0 + 20 * MIN), null);
    assert.strictEqual(A.takeLog(DEV, theirs), false, "the same log twice is not news");
    assert.strictEqual(A.counts(d.id, T0 + DAY + MIN).new, 1, "and tomorrow b is there");
    assert.ok(b.id);
  });

  await t("an answer made here and the same answer read from another device's log give the same card", async () => {
    const d = A.makeDeck("Both");
    const mine = A.add({ deck: d.id, front: "mine" }), theirs = A.add({ deck: d.id, front: "theirs" });
    A.answer(mine.id, 3, 1, T0); A.answer(mine.id, 3, 1, T0 + 10 * MIN); A.answer(mine.id, 1, 1, T0 + 5 * DAY);
    // The other device's entries come in out of order, as files can.
    A.takeLog(DEV, [{ card: theirs.id, at: T0 + 5 * DAY, grade: 1, ms: 1, was: "review" }, { card: theirs.id, at: T0 + 10 * MIN, grade: 3, ms: 1, was: "learn" }, { card: theirs.id, at: T0, grade: 3, ms: 1, was: "new" }]);
    assert.deepStrictEqual(A.info(theirs.id), A.info(mine.id));
    assert.strictEqual(A.info(mine.id).state, "relearn");
  });

  await t("bad logs and our own are not taken, and other devices' logs survive a restart", async () => {
    const d = A.makeDeck("Keep");
    const c = A.add({ deck: d.id, front: "k" });
    assert.strictEqual(A.takeLog("not-a-device", []), false);
    assert.strictEqual(A.takeLog(A.device(), [{ card: c.id, at: T0, grade: 3 }]), false, "our own comes from our own file");
    assert.strictEqual(A.takeLog(DEV, "nope"), false);
    A.takeLog(DEV, [{ card: c.id, at: T0, grade: 9 }, { card: c.id, at: "x", grade: 3 }, { card: c.id, at: T0, grade: 4, ms: 5, was: "new" }]);
    assert.strictEqual(A.info(c.id).state, "review", "only the good entry counted");
    await flush();
    const before = A.info(c.id);
    A.unload();
    await A.load();
    assert.deepStrictEqual(A.info(c.id), before);
  });

  await t("the files sync sends are the same for the same state, with a device id of the right shape", async () => {
    const d = A.makeDeck("Same");
    A.add({ deck: d.id, front: "s" });
    const one = A.docs(), two = A.docs();
    assert.deepStrictEqual(one, two);
    assert.ok(/^[a-z0-9]{12}$/.test(one.device));
    assert.deepStrictEqual(Object.keys(JSON.parse(one.cards)), ["v", "cards", "gone"]);
  });

  console.log("  " + passed + " passed");
})();
