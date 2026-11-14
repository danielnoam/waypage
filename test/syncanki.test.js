// Anki's decks, cards and reviews through GitHub sync: `node test/syncanki.test.js`.
// Two devices take turns on one made-up repo, each with its own engine
// state, the way two phones would: what one reviews or edits reaches the
// other, a deletion sticks, a write another device beat is merged and
// sent again, and a device with Anki off, or the switch off, sends nothing.
const assert = require("assert");

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
let files = new Map(); // this device's anki/ files on disk
global.window = { Waypage: { platform: {},
  backup: { cleanMeta: (p) => ({ ...p }) },
  store: {
    readPage: async () => "", writePage: async () => 10, removePage: async () => {},
    toBase64: (b) => Buffer.from(b).toString("base64"),
    writeAnki: async (name, data) => { if (data) files.set(name, JSON.stringify(data)); else files.delete(name); },
    readAnki: async (name) => (files.has(name) ? JSON.parse(files.get(name)) : null),
  } } };
global.DOMParser = class { parseFromString(html) { return { querySelectorAll: () => [], documentElement: { outerHTML: html } }; } };
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");

// GitHub's contents: path → { text, sha }, folders listed, writes checked against the sha.
let gh = new Map(), shas = 0, onPut = null;
const res = (status, j) => ({ ok: status < 300, status, json: async () => j, text: async () => (typeof j === "string" ? j : JSON.stringify(j)), headers: { get: () => "" } });
const putFile = (path, text) => { const sha = "sha" + ++shas; gh.set(path, { text, sha }); return sha; };
const puts = [];
global.fetch = async (url, opts = {}) => {
  const path = decodeURIComponent(url.split("/contents/")[1] || "").split("?")[0];
  if (opts.method === "PUT") {
    const body = JSON.parse(opts.body);
    if (onPut) await onPut(path);
    const f = gh.get(path);
    if (f ? body.sha !== f.sha : body.sha) return res(f ? 409 : 422, { message: "sha" });
    puts.push(path);
    return res(200, { content: { sha: putFile(path, Buffer.from(body.content, "base64").toString("utf8")) } });
  }
  if (opts.method === "DELETE") { gh.delete(path); return res(200, {}); }
  const f = gh.get(path);
  if (f) {
    if (/raw/.test((opts.headers && opts.headers.Accept) || "")) return res(200, f.text);
    return res(200, { content: Buffer.from(f.text, "utf8").toString("base64"), sha: f.sha });
  }
  const inside = [...gh.entries()].filter(([p]) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/"));
  if (inside.length) return res(200, inside.map(([p, v]) => ({ name: p.slice(path.length + 1), sha: v.sha, type: "file" })));
  return res(404, { message: "Not Found" });
};

const CFG = (what) => JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t", looked: Date.now(), scoped: true, what: { clips: false, notes: false, feeds: false, newsletters: false, stats: false, ...what } });
mem.set("waypage.sync", CFG({ anki: true }));
let extOn = true;
window.Waypage.ext = { on: () => extOn, load: async () => true };
require("../src/fsrs.js");
require("../src/anki.js");
require("../src/sync.js");
const S = window.Waypage.sync, A = window.Waypage.anki;

// Each device keeps its own files, its device id and what sync last saw of GitHub.
const kept = {};
const KEYS = ["waypage.anki.device", "waypage.syncAnki", "waypage.syncBase"];
let current = null;
async function as(name) {
  if (current) kept[current] = { files, keys: Object.fromEntries(KEYS.filter((k) => mem.has(k)).map((k) => [k, mem.get(k)])) };
  for (const k of KEYS) mem.delete(k);
  current = name;
  if (kept[name]) { files = kept[name].files; for (const [k, v] of Object.entries(kept[name].keys)) mem.set(k, v); } else files = new Map();
  A.unload();
  await A.load();
}
const sync = () => S.run({ getPages: () => [], setPages: async () => {} });
const DAY = 86400000, T0 = Date.now() - 2 * DAY, MIN = 60000;
const gitDecks = () => JSON.parse(gh.get("anki/decks.json").text), gitCards = () => JSON.parse(gh.get("anki/cards.json").text);

let passed = 0;
async function test(name, fn) {
  gh = new Map(); kept.a = kept.b = undefined; current = null; puts.length = 0; onPut = null; extOn = true;
  S.setWhat("anki", true);
  putFile("library.json", JSON.stringify({ format: 1, pages: [], deleted: {}, files: {} }));
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.stack.split("\n").slice(0, 4).join("\n    ")); process.exitCode = 1; }
}

(async () => {
  await test("a deck and its cards made on one device are on the other after both sync", async () => {
    await as("a");
    const d = A.makeDeck("German"), c = A.add({ deck: d.id, front: "Haus", back: "house" });
    await sync();
    assert.ok(gh.has("anki/decks.json") && gh.has("anki/cards.json"));
    await as("b");
    assert.strictEqual(A.decks().length, 0);
    await sync();
    assert.deepStrictEqual(A.decks().map((x) => x.name), ["German"]);
    assert.strictEqual(A.card(c.id).back, "house");
  });

  await test("reviews on one device change the other's schedule, and its day's limits", async () => {
    await as("a");
    const d = A.makeDeck("Rev");
    A.setOptions(d.id, { newPerDay: 1 });
    const c = A.add({ deck: d.id, front: "x" }), c2 = A.add({ deck: d.id, front: "y" });
    await sync();
    await as("b");
    await sync();
    await as("a");
    const now = Date.now();
    A.answer(c.id, 3, 1, now - 20 * MIN); A.answer(c.id, 3, 1, now - 10 * MIN);
    await sync();
    const log = Object.keys(JSON.parse(JSON.stringify([...gh.keys()]))).length && [...gh.keys()].filter((k) => k.startsWith("anki/log/"));
    assert.strictEqual(log.length, 1);
    await as("b");
    assert.strictEqual(A.info(c.id).state, "new");
    await sync();
    assert.strictEqual(A.info(c.id).state, "review");
    assert.strictEqual(A.counts(d.id, now).new, 0, "today's one new card was used on the other device");
    assert.ok(c2.id);
  });

  await test("a deletion on one device sticks on the other, and the card doesn't come back", async () => {
    await as("a");
    const d = A.makeDeck("Del"), c = A.add({ deck: d.id, front: "gone soon" }), k = A.add({ deck: d.id, front: "stays" });
    await sync();
    await as("b");
    await sync();
    assert.strictEqual(A.cards().length, 2);
    await as("a");
    A.remove(c.id);
    await sync();
    await as("b");
    await sync();
    assert.deepStrictEqual(A.cards().map((x) => x.front), ["stays"]);
    await sync();
    await as("a");
    await sync();
    assert.deepStrictEqual(A.cards().map((x) => x.id), [k.id]);
    assert.deepStrictEqual(gitCards().cards.map((x) => x.id), [k.id]);
  });

  await test("another device's write landing just before ours is merged in, and ours is sent again", async () => {
    await as("a");
    const d = A.makeDeck("Race");
    A.add({ deck: d.id, front: "from a" });
    await sync();
    A.add({ deck: d.id, front: "from a too" });
    // Another device's cards go up just before this one's, so this write is refused.
    let beaten = 0;
    onPut = async (path) => {
      if (path !== "anki/cards.json" || beaten) return;
      beaten++;
      const doc = gitCards();
      doc.cards.push({ id: "fromb000001", deck: d.id, front: "from b", back: "", context: "", from: null, made: Date.now(), edited: Date.now(), suspended: false, buried: 0 });
      putFile("anki/cards.json", JSON.stringify(doc));
    };
    await sync();
    onPut = null;
    assert.strictEqual(beaten, 1);
    assert.deepStrictEqual(A.cards().map((x) => x.front).sort(), ["from a", "from a too", "from b"]);
    assert.deepStrictEqual(gitCards().cards.map((x) => x.front).sort(), ["from a", "from a too", "from b"]);
  });

  await test("nothing is written when nothing changed, and a second sync is quiet", async () => {
    await as("a");
    const d = A.makeDeck("Quiet");
    A.add({ deck: d.id, front: "q" });
    await sync();
    puts.length = 0;
    await sync();
    assert.deepStrictEqual(puts, [], "no commits for nothing");
    await as("b");
    await sync();
    puts.length = 0;
    await sync();
    assert.deepStrictEqual(puts, []);
    await as("a");
    await sync();
    assert.deepStrictEqual(puts, [], "b read it all and had nothing to add, so a has nothing new either");
  });

  await test("with the Anki switch off, or the extension off, nothing is sent or taken", async () => {
    await as("a");
    A.add({ deck: A.makeDeck("Off").id, front: "x" });
    S.setWhat("anki", false);
    await sync();
    assert.ok(![...gh.keys()].some((k) => k.startsWith("anki/")), "the switch off");
    S.setWhat("anki", true);
    extOn = false;
    await sync();
    assert.ok(![...gh.keys()].some((k) => k.startsWith("anki/")), "the extension off");
    extOn = true;
    await sync();
    assert.ok(gh.has("anki/decks.json"), "both on");
  });

  await test("a damaged log or an odd file in anki/log is skipped, and a damaged shared file is written over", async () => {
    await as("a");
    const d = A.makeDeck("Odd");
    A.add({ deck: d.id, front: "keep me" });
    putFile("anki/log/notadevice.json", JSON.stringify({ log: [] }));
    putFile("anki/log/abcdefghij12.json", "{ not json");
    putFile("anki/cards.json", "{ also not json");
    await sync();
    await as("b");
    await sync();
    assert.deepStrictEqual(A.cards().map((x) => x.front), ["keep me"], "a's good cards replaced the damaged file");
    assert.deepStrictEqual(gitCards().cards.map((x) => x.front), ["keep me"]);
  });

  await test("a device that has reviewed nothing sends no log file", async () => {
    await as("a");
    A.add({ deck: A.makeDeck("None").id, front: "n" });
    await sync();
    assert.deepStrictEqual([...gh.keys()].filter((k) => k.startsWith("anki/log/")), []);
  });

  console.log("  " + passed + " passed");
})();
