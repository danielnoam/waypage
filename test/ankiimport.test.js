// Anki's files, in and out (2026-11): `node test/ankiimport.test.js`.
// src/sqlite.js reading a collection, src/anki-import.js turning it into
// cards and reviews, the engine keeping them, and the text file Anki imports.
// The collection is test/fixtures/anki/collection.anki2, made by
// make-collection.py from Anki's documented tables (not exported by Anki).
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const files = new Map(), mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const bytes = new Uint8Array(fs.readFileSync(path.join(__dirname, "fixtures", "anki", "collection.anki2")));
let zip = new Map(); // entry name → bytes, for readApkg
global.window = { Waypage: {
  store: { writeAnki: async (n, d) => { if (d) files.set(n, JSON.stringify(d)); else files.delete(n); }, readAnki: async (n) => (files.has(n) ? JSON.parse(files.get(n)) : null) },
  backup: {
    zipEntries: async (f) => { if (!f.zip) throw new Error("not a zip"); return new Map([...f.zip].map(([n, b]) => [n, { size: b.length }])); },
    zipRead: async (f, e) => f.zip.get([...f.zip.keys()].find((n) => f.zip.get(n).length === e.size)),
  },
} };
require("../src/sqlite.js");
require("../src/fsrs.js");
require("../src/anki-import.js");
require("../src/anki.js");
const W = window.Waypage, I = W.ankiImport, A = W.anki;

let passed = 0;
const queued = [];
const test = (name, fn) => queued.push([name, fn]);
const MIN = 60000;

test("sqlite.js reads every table of a collection with deep trees and an overflowing field", () => {
  const db = W.sqlite.open(bytes);
  assert.deepStrictEqual(db.tables(), ["col", "notes", "cards", "revlog"]);
  const n = {}, longest = { len: 0 };
  let first = null, ids = [];
  for (const t of db.tables()) db.rows(t, (id, v) => {
    n[t] = (n[t] || 0) + 1;
    if (t === "notes") { if (v[6].length > longest.len) longest.len = v[6].length; if (id === 1700000000001) first = v[6]; }
    if (t === "revlog") ids.push(id);
  });
  assert.deepStrictEqual(n, { col: 1, notes: 307, cards: 309, revlog: 104 });
  assert.strictEqual(first, "Haus\x1fhouse");
  assert.strictEqual(longest.len, "Long".length + 1 + 6000, "the 6,000 letter field came back whole from its overflow pages");
  assert.deepStrictEqual([Math.min(...ids), Math.max(...ids)], [1700000200000, 8500432000000], "integers past 32 bits are right");
  assert.ok(ids.every((x, i) => i === 0 || ids[i - 1] < x), "rows come in rowid order");
});

test("sqlite.js says what is wrong with a file it can't read", () => {
  assert.throws(() => W.sqlite.open(new Uint8Array(200)), /isn't a SQLite database/);
  assert.throws(() => W.sqlite.open(bytes.subarray(0, 4096)), /cut short|damaged/);
  assert.throws(() => W.sqlite.open(bytes).rows("nothing", () => {}), /no nothing table/);
});

test("clean turns a field's HTML into text with line breaks, and drops sounds and pictures", () => {
  assert.strictEqual(I.clean("Buch<br>(<b>das</b>)"), "Buch\n(das)");
  assert.strictEqual(I.clean("a&nbsp;&amp; b<div>c &lt;d&gt;</div>[sound:x.mp3]<img src=\"a.jpg\">"), "a & b\nc <d>");
  assert.strictEqual(I.clean("&#228;&#x00fc;&quot;&bogus;"), "äü\"&bogus;");
  assert.strictEqual(I.clean("<p>one</p><p></p><p></p><p>two</p>"), "one\ntwo");
  assert.strictEqual(I.clean("a<div>b</div><div>c</div>d<br><br>e"), "a\nb\nc\nd\n\ne");
  assert.strictEqual(I.clean(null), "");
});

test("cloze hides one blank on the front, with its hint, and shows them all on the back", () => {
  const t = "{{c1::Berlin}} is in {{c2::Germany::country}}, {{c1::yes}}.";
  assert.deepStrictEqual(I.cloze(t, 1), { front: "[…] is in Germany, […].", back: "Berlin is in Germany, yes." });
  assert.strictEqual(I.cloze(t, 2).front, "Berlin is in [country], yes.");
});

let parsed;
test("a collection becomes cards with their decks, skipping what has nothing to read", () => {
  parsed = I.fromDb(W.sqlite.open(bytes));
  assert.strictEqual(parsed.cards.length, 308);
  assert.strictEqual(parsed.skipped, 1, "the picture-only note");
  const by = (front, deck) => parsed.cards.find((c) => c.front === front && (!deck || c.deck === deck));
  assert.deepStrictEqual({ ...by("Haus"), made: 0 }, { key: by("Haus").key, deck: "German::Nouns", front: "Haus", back: "house", suspended: false, made: 0 });
  assert.strictEqual(by("Buch\n(das)").back, "book & volume\nsecond <line>");
  assert.strictEqual(by("palabra7").deck, "Spanish");
  assert.strictEqual(parsed.cards.filter((c) => c.deck === "Spanish").length, 302, "300 words, the long one and the rescheduled one");
  assert.strictEqual(by("Long").back.length, 6000);
  assert.ok(new Set(parsed.cards.map((c) => c.key)).size === 308 && parsed.cards.every((c) => /^anki\d+$/.test(c.key)));
});

test("a reversed note's second card asks for the back, and a suspended one stays suspended", () => {
  const cat = parsed.cards.filter((c) => /^(Katze|cat)$/.test(c.front));
  assert.deepStrictEqual(cat.map((c) => [c.front, c.back, c.suspended]), [["Katze", "cat", false], ["cat", "Katze", true]]);
});

test("a cloze note makes a card per blank, hiding that one", () => {
  const c = parsed.cards.filter((x) => x.front.startsWith("Berlin"));
  assert.deepStrictEqual(c.map((x) => x.front), ["Berlin is the […] of Germany.", "Berlin is the capital of [country]."]);
  assert.strictEqual(c[0].back, "Berlin is the capital of Germany.\nExtra words");
});

test("the review log comes over, in order, without manual reschedules", () => {
  const haus = parsed.cards.find((c) => c.front === "Haus").key;
  const h = parsed.log.filter((e) => e.card === haus);
  assert.deepStrictEqual(h.map((e) => [e.at, e.grade, e.was]), [[1700000200000, 2, "new"], [1700000800000, 3, "review"], [8500432000000, 1, "review"]]);
  assert.strictEqual(parsed.log.length, 103, "100 reviews of the Spanish cards and 3 of Haus, but not the reschedule");
  assert.ok(!parsed.log.some((e) => e.card === parsed.cards.find((c) => c.front === "Resched").key));
});

test("a deck that isn't in the older layout says to export it again", () => {
  const fake = { rows: (t, fn) => { if (t === "col") fn(1, [null, 0, 0, 0, 18, 0, 0, 0, "", "", ""]); } };
  assert.throws(() => I.fromDb(fake), /Support older Anki versions/);
});

const apkg = (entries) => ({ zip: new Map(Object.entries(entries)) });
test("an .apkg is read from its collection.anki21, not the stand-in collection.anki2 beside it", async () => {
  const got = await I.readApkg(apkg({ "collection.anki2": new Uint8Array([1, 2, 3]), "collection.anki21": bytes, media: new Uint8Array(2) }));
  assert.strictEqual(got.cards.length, 308);
  const old = await I.readApkg(apkg({ "collection.anki2": bytes }));
  assert.strictEqual(old.cards.length, 308);
});

test("an .apkg that can't be read says why", async () => {
  await assert.rejects(I.readApkg({}), /isn't an Anki deck/);
  await assert.rejects(I.readApkg(apkg({ "collection.anki21b": new Uint8Array(5), "collection.anki2": new Uint8Array(5), meta: new Uint8Array(1) })), /Support older Anki versions/);
  await assert.rejects(I.readApkg(apkg({ readme: new Uint8Array(3) })), /no Anki collection/);
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

  await t("importing makes the decks and cards, with their history replayed into a schedule", async () => {
    const r = A.importCards(parsed);
    assert.deepStrictEqual(r, { cards: 308, decks: 2, reviews: 103, skipped: 1, dup: 0 });
    assert.deepStrictEqual(A.decks().map((d) => d.name).sort(), ["German::Nouns", "Spanish"], "Default had no cards, so it isn't made");
  });

  await t("importing the same deck again adds nothing, and one you deleted comes back", async () => {
    A.importCards(parsed);
    const again = A.importCards(parsed);
    assert.deepStrictEqual([again.cards, again.dup, again.reviews], [0, 308, 0]);
    const some = A.cards().find((c) => c.front === "Buch\n(das)");
    A.remove(some.id);
    assert.strictEqual(A.importCards(parsed).cards, 1);
    assert.ok(A.cards().some((c) => c.front === "Buch\n(das)"));
  });

  await t("an imported card keeps its history, replayed through FSRS; and a suspended card is left out", async () => {
    A.importCards(parsed);
    const haus = A.cards().find((c) => c.front === "Haus");
    // Hard, a Good ten minutes on (still in the steps), then Again years later.
    assert.deepStrictEqual([A.info(haus.id).state, A.info(haus.id).reps], ["learn", 3]);
    assert.ok(A.info(haus.id).last === 8500432000000, "its last review is the last in the log");
    const cat = A.cards().find((c) => c.front === "cat");
    assert.strictEqual(cat.suspended, true);
    const nouns = A.decks().find((d) => d.name === "German::Nouns");
    assert.strictEqual(A.counts(nouns.id, 9e12).new, 4, "Buch, Katze and the two blanks are new; the suspended one and Haus aren't");
  });

  await t("an imported deck merges into one of the same name, and survives a restart", async () => {
    const mine = A.makeDeck("Spanish");
    A.add({ deck: mine.id, front: "hola", back: "hello" });
    A.importCards(parsed);
    assert.strictEqual(A.decks().filter((d) => d.name === "Spanish").length, 1);
    assert.strictEqual(A.cards(mine.id).length, 303, "its own card and the 302 that came");
    await new Promise((r) => setTimeout(r, 10));
    const before = A.cards().length, state = A.info(A.cards().find((c) => c.front === "Haus").id);
    A.unload();
    await A.load();
    assert.strictEqual(A.cards().length, before);
    assert.deepStrictEqual(A.info(A.cards().find((c) => c.front === "Haus").id), state);
  });

  await t("export is a text file Anki imports: headers, HTML, the deck and a guid, quotes quoted", async () => {
    const d = A.makeDeck("German"), other = A.makeDeck("Other");
    A.add({ deck: d.id, front: "Haus", back: "noun · das Haus\n1. house", context: "Das Haus <ist> alt." });
    A.add({ deck: d.id, front: "say \"hi\"", back: "tab\there" });
    A.add({ deck: other.id, front: "x", back: "y" });
    const one = A.exportText(d.id);
    assert.strictEqual(one.cards, 2);
    const lines = one.text.split("\n");
    assert.deepStrictEqual(lines.slice(0, 5), ["#separator:tab", "#html:true", "#notetype:Basic", "#deck column:3", "#guid column:4"]);
    const rows = lines.slice(5, 7).map((l) => l.split("\t"));
    assert.deepStrictEqual(rows[0].slice(0, 3), ["Haus", "noun · das Haus<br>1. house<br><br><i>Das Haus &lt;ist&gt; alt.</i>", "German"]);
    assert.ok(/^[a-z0-9]+$/.test(rows[0][3]), "the card's id is the guid");
    assert.ok(one.text.includes("\"say \"\"hi\"\"\"\t"), "a quote is doubled inside quotes");
    assert.ok(one.text.includes("tab here\tGerman"), "a tab inside a field is a space");
    assert.ok(one.text.endsWith("\n") && !one.text.includes("\r"));
    assert.strictEqual(A.exportText().cards, 3, "no deck is every deck");
    assert.strictEqual(A.exportText("nothing").cards, 0);
  });

  console.log("  " + passed + " passed");
})();
