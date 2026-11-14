// Language packs for the Anki extension (2026-11): `node test/packs.test.js`.
// tools/packs/build-lang.js turns Wiktextract lines into a StarDict .tar.gz
// that src/dict.js reads: checked here for what goes in it, the order its
// index is searched by, and a tar a reader can open.
const assert = require("assert");
const zlib = require("zlib");
const crypto = require("crypto");
const P = require("../tools/packs/build-lang.js");

let passed = 0;
const queued = [];
const test = (name, fn) => queued.push([name, fn]);

const entry = (o) => JSON.stringify({ lang: "German", lang_code: "de", ...o });
const sample = [
  entry({ word: "Haus", pos: "noun", head_templates: [{ expansion: "Haus n (strong, genitive Hauses, plural Häuser)" }],
    forms: [{ form: "das Haus", tags: ["nominative", "singular"] }, { form: "des Hauses", tags: ["genitive", "singular"] },
      { form: "die Häuser", tags: ["nominative", "plural"] }, { form: "den Häusern", tags: ["dative", "plural"] },
      { form: "no-table-tags", tags: ["table-tags"] }, { form: "de-ndecl", tags: ["inflection-template"] }],
    senses: [{ glosses: ["house"] }, { glosses: ["home"], tags: ["figurative", "neuter"] }, { glosses: ["house"] }] }),
  // An inflected form's own entry: only a way in to Haus, never a headword.
  entry({ word: "Häuser", pos: "noun", senses: [{ glosses: ["inflection of Haus"], tags: ["form-of"], form_of: [{ word: "Haus" }] }] }),
  entry({ word: "Bank", pos: "noun", head_templates: [{ expansion: "Bank f (genitive Bank, plural Banken)" }],
    forms: [{ form: "die Banken", tags: ["nominative", "plural"] }], senses: [{ glosses: ["bank"] }] }),
  entry({ word: "Bank", pos: "noun", head_templates: [{ expansion: "Bank f (genitive Bank, plural Bänke)" }],
    forms: [{ form: "die Bänke", tags: ["nominative", "plural"] }], senses: [{ glosses: ["bench"] }] }),
  entry({ word: "gehen", pos: "verb", head_templates: [{ expansion: "gehen (strong, third-person singular present geht, past tense ging, past participle gegangen, auxiliary sein)" }],
    forms: [{ form: "ging", tags: ["past"] }, { form: "gegangen", tags: ["participle", "past"] }, { form: "ich gehe", tags: ["present"] }, { form: "zu gehen", tags: ["infinitive"] }],
    senses: [{ glosses: ["to go", "to walk"], tags: ["intransitive"] }, { glosses: ["to work"], tags: ["colloquial"] }] }),
  entry({ word: "un-", pos: "prefix", senses: [{ glosses: ["not"] }] }),
  entry({ word: "Zebra", lang: "English", pos: "noun", senses: [{ glosses: ["zebra"] }] }),
  "not json",
  "",
  entry({ word: "Nichts", pos: "noun", senses: [] }),
];
async function* lines(list) { for (const l of list) yield l; }

// A tar read back: names, bytes and whether each header's checksum holds.
function untar(gz) {
  const buf = zlib.gunzipSync(gz), out = {};
  for (let p = 0; p + 512 <= buf.length;) {
    const h = buf.subarray(p, p + 512);
    if (h.every((x) => x === 0)) break;
    const name = h.toString("utf8", 0, 100).replace(/\0.*$/s, "");
    const size = parseInt(h.toString("ascii", 124, 136), 8);
    const want = parseInt(h.toString("ascii", 148, 154), 8);
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    assert.strictEqual(sum, want, name + "'s checksum");
    out[name] = buf.subarray(p + 512, p + 512 + size);
    p += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}
// The index as [{ word, off, size }].
function readIdx(idx) {
  const out = [];
  for (let p = 0; p < idx.length;) {
    const z = idx.indexOf(0, p);
    out.push({ word: idx.toString("utf8", p, z), off: idx.readUInt32BE(z + 1), size: idx.readUInt32BE(z + 5) });
    p = z + 9;
  }
  return out;
}
const textOf = (files, w) => { const e = readIdx(files["t.idx"]).find((x) => x.word === w); return e && files["t.dict"].toString("utf8", e.off, e.off + e.size); };

let built;
test("only German headwords come in, with their meanings, and nothing for forms or empty ones", async () => {
  built = await P.build(lines(sample), { id: "t", name: "Test pack" });
  const words = readIdx(built.files["t.idx"]).map((x) => x.word).sort();
  assert.deepStrictEqual(words, ["Bank", "Haus", "gehen"]);
  assert.strictEqual(built.words, 3);
});

test("a noun's first line has its article and plural, then numbered meanings without repeats", () => {
  assert.strictEqual(textOf(built.files, "Haus"), "noun · das Haus · pl. Häuser\n1. house\n2. (figurative) home");
});

test("a word with two entries keeps both, apart", () => {
  assert.strictEqual(textOf(built.files, "Bank"), "noun · die Bank · pl. Banken\nbank\n\nnoun · die Bank · pl. Bänke\nbench");
});

test("a verb's first line is Wiktionary's own headword line, and its meanings carry the useful tags", () => {
  assert.strictEqual(textOf(built.files, "gehen"),
    "verb · strong, third-person singular present geht, past tense ging, past participle gegangen, auxiliary sein\n1. to walk\n2. (colloquial) to work");
});

test("forms find their headword, with the article taken off, and phrases and table junk left out", () => {
  const idx = readIdx(built.files["t.idx"]), syn = built.files["t.syn"];
  const entries = [];
  for (let p = 0; p < syn.length;) { const z = syn.indexOf(0, p); entries.push([syn.toString("utf8", p, z), idx[syn.readUInt32BE(z + 1)].word]); p = z + 5; }
  const by = Object.fromEntries(entries);
  assert.strictEqual(by["Häuser"], "Haus");
  assert.strictEqual(by["Hauses"], "Haus");
  assert.strictEqual(by["Häusern"], "Haus");
  assert.strictEqual(by["ging"], "gehen");
  assert.strictEqual(by["gegangen"], "gehen");
  for (const bad of ["ich gehe", "zu gehen", "no-table-tags", "de-ndecl", "das Haus", "Bank"]) assert.ok(!(bad in by), bad + " is in the .syn");
});

test("the index is in the order src/dict.js searches by: ASCII letters without case, then bytes", () => {
  assert.ok(P.order("apfel", "Zebra") < 0 && P.order("Zebra", "apfel") > 0, "case isn't the first thing it sorts by");
  assert.notStrictEqual(P.order("Bank", "bank"), 0, "case breaks a tie, so the order is fixed");
  const fold = (w) => Buffer.from(w).map((c) => (c >= 65 && c <= 90 ? c + 32 : c));
  const words = readIdx(built.files["t.idx"]).map((x) => x.word);
  assert.ok(words.every((w, i) => i === 0 || Buffer.compare(fold(words[i - 1]), fold(w)) <= 0), words.join());
});

test("the .ifo says what it holds, and the idx size is its real size", () => {
  const ifo = built.files["t.ifo"].toString();
  assert.ok(ifo.startsWith("StarDict's dict ifo file\nversion=3.0.0\n"));
  assert.ok(ifo.includes("bookname=Test pack\n") && ifo.includes("wordcount=3\n") && ifo.includes("sametypesequence=m\n"));
  assert.ok(ifo.includes("idxfilesize=" + built.files["t.idx"].length + "\n"));
  assert.ok(/synwordcount=\d+/.test(ifo) && /CC BY-SA 4\.0/.test(ifo));
});

test("the .tar.gz opens as a tar with the four files, and its hash is the file's", () => {
  const got = untar(built.out);
  assert.deepStrictEqual(Object.keys(got).sort(), ["t.dict", "t.idx", "t.ifo", "t.syn"]);
  for (const [name, data] of Object.entries(built.files)) assert.ok(got[name].equals(data), name);
  assert.strictEqual(built.sha256, crypto.createHash("sha256").update(built.out).digest("hex"));
  assert.strictEqual(built.bytes, built.out.length);
});

(async () => {
  for (const [name, fn] of queued) {
    try { await fn(); passed++; console.log("  ok - " + name); }
    catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
  }
  console.log("  " + passed + " passed");
})();
