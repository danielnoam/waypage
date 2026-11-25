// Extensions and their downloads (2026-11): `node test/extensions.test.js`.
// src/extensions.js with a made-up fetch and dictionary: turning one on and
// off, and a pack that is only kept when it is the file the catalogue pins.
const assert = require("assert");
require("./lang.js");
const crypto = require("crypto");

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const added = [], removed = [], listed = [];
const added$ = async (files) => { const f = files[0]; added.push({ name: f.name, size: f.size }); const e = { id: "d" + added.length, name: "Pack", words: 1, bytes: f.size }; listed.push(e); return e; };
let scriptsOk = true;
const loaded = [];
global.document = { head: { append: (s) => { loaded.push(s.src); setTimeout(() => (scriptsOk ? s.onload() : s.onerror()), 0); } }, createElement: () => ({ remove() {} }) };
global.window = { Waypage: { version: "9.9.9", dict: { add: added$, list: () => listed.slice(), remove: async (id) => { removed.push(id); listed.splice(listed.findIndex((d) => d.id === id), 1); } } } };
require("../src/extensions.js");
const X = window.Waypage.ext;

const bytes = Buffer.from("not really a tarball, but bytes");
const good = crypto.createHash("sha256").update(bytes).digest("hex");
const pack = { id: "de-en", title: "German → English", url: "https://example.test/de-en.tar.gz", sha256: good, bytes: bytes.length };
const shipped = X.catalogue.flatMap((x) => x.packs.map((p) => ({ ext: x.id, ...p })));
X.catalogue[0].packs = [pack];
const serve = (body) => { global.fetch = async () => new Response(body); };

let passed = 0;
const queued = [];
const test = (name, fn) => queued.push([name, fn]);
const reset = () => { added.length = 0; removed.length = 0; listed.length = 0; loaded.length = 0; mem.clear(); scriptsOk = true; };

test("every pack in the catalogue is pinned: a commit's raw file, a SHA-256, a size", () => {
  assert.ok(shipped.length > 0);
  for (const p of shipped) {
    assert.ok(/^https:\/\/raw\.githubusercontent\.com\/danielnoam\/waypage\/[0-9a-f]{40}\/[\w.-]+\.tar\.gz$/.test(p.url), p.id + "'s url must name a commit, not a branch");
    assert.ok(/^[0-9a-f]{64}$/.test(p.sha256), p.id + "'s hash");
    assert.ok(Number.isInteger(p.bytes) && p.bytes > 0, p.id + "'s size");
    assert.ok(p.title && p.note, p.id + " needs a title and a note");
  }
  assert.strictEqual(new Set(shipped.map((p) => p.ext + "/" + p.id)).size, shipped.length, "no pack twice");
});

test("one whose code doesn't load stays off", async () => {
  reset();
  scriptsOk = false;
  await assert.rejects(X.turnOn("anki"), /Couldn't load/);
  assert.strictEqual(X.on("anki"), false);
});

test("an extension starts off, turns on by loading its scripts once, and off again", async () => {
  reset();
  assert.strictEqual(X.on("anki"), false);
  await X.turnOn("anki");
  assert.strictEqual(X.on("anki"), true);
  assert.deepStrictEqual(loaded, ["src/fsrs.js?v=9.9.9", "src/sqlite.js?v=9.9.9", "src/anki-import.js?v=9.9.9", "src/anki.js?v=9.9.9", "src/app-anki.js?v=9.9.9"]);
  await X.load("anki");
  assert.strictEqual(loaded.length, 5, "loaded once");
  let told = 0;
  X.changed(() => told++);
  X.turnOff("anki");
  assert.strictEqual(X.on("anki"), false);
  assert.strictEqual(told, 1);
  assert.strictEqual(X.on("nothing"), false);
});

test("a pack with the pinned hash is installed as a dictionary and remembered", async () => {
  reset(); serve(bytes);
  await X.getPack("anki", "de-en");
  assert.deepStrictEqual(added, [{ name: "de-en.tar.gz", size: bytes.length }]);
  assert.strictEqual(X.packDict("anki", "de-en"), "d1");
  assert.deepStrictEqual(X.packs("anki").map((p) => [p.id, p.have]), [["de-en", true]]);
  assert.strictEqual(X.running(), null);
  assert.strictEqual(X.lastError(), null);
});

test("a pack that is not the file pinned is refused, and nothing is kept", async () => {
  reset(); serve(Buffer.from("something else entirely!!!!!!!"));
  await assert.rejects(X.getPack("anki", "de-en"), /right file/);
  assert.deepStrictEqual(added, []);
  assert.deepStrictEqual(X.lastError(), { ext: "anki", pack: "de-en", kind: "bad" });
  assert.strictEqual(X.packDict("anki", "de-en"), null);
  reset(); serve(Buffer.concat([bytes, Buffer.from("!")]));
  await assert.rejects(X.getPack("anki", "de-en"), /right file/, "the size is checked too");
});

// An extension is one entry in the catalogue plus its own files. The core
// asks the catalogue (C.ext.places(), C.ext.place(id)) and never names one,
// so adding or removing an extension doesn't mean hunting through the shell.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
// Still named in the core, to be moved out; this list may only get shorter.
const STILL_NAMED = {
  "src/sync.js": ["anki", "catalogs", "webdav", "audiobookshelf"], // what each one syncs
  "src/app-saving.js": ["anki"],                                    // Sync's "what to sync" switch
};
test("no core file names an extension", async () => {
  const named = [];
  const files = fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".js")).map((f) => "src/" + f);
  for (const x of X.list()) {
    for (const f of files) {
      if (f === "src/extensions.js" || X.list().some((y) => y.scripts.includes(f))) continue;
      if ((STILL_NAMED[f] || []).includes(x.id)) continue;
      if (fs.readFileSync(path.join(ROOT, f), "utf8").includes('"' + x.id + '"')) named.push(f + ' names "' + x.id + '"');
    }
  }
  assert.deepStrictEqual(named, []);
  for (const [f, ids] of Object.entries(STILL_NAMED)) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const id of ids) assert.ok(src.includes('"' + id + '"'), f + " no longer names " + id + ": take it off STILL_NAMED");
  }
});
test("every extension's place has its <main> in index.html and is drawn by its own code", async () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(X.places().length >= 5);
  for (const x of X.places()) {
    assert.ok(new RegExp('<main [^>]*id="' + x.id + '" hidden>').test(html), "index.html has no hidden <main id=\"" + x.id + "\">");
    assert.ok(x.scripts.some((f) => fs.readFileSync(path.join(ROOT, f), "utf8").includes("EXT_PLACES." + x.id + " = ")), x.id + "'s code doesn't set EXT_PLACES." + x.id);
    assert.ok(x.place.icon.startsWith("<") && x.place.title() && x.place.failed(), x.id);
    assert.strictEqual(X.place(x.id).id, x.id);
  }
  assert.strictEqual(X.place("library"), null);
});

test("a download that fails says so, and the next one clears it", async () => {
  reset();
  global.fetch = async () => { throw new TypeError("network"); };
  await assert.rejects(X.getPack("anki", "de-en"), /Couldn't download/);
  assert.strictEqual(X.lastError().kind, "failed");
  serve(bytes);
  await X.getPack("anki", "de-en");
  assert.strictEqual(X.lastError(), null);
});

test("a pack that isn't a dictionary is refused", async () => {
  reset(); serve(bytes);
  window.Waypage.dict.add = async () => { throw new Error("That isn't a dictionary."); };
  await assert.rejects(X.getPack("anki", "de-en"), /right file/);
  window.Waypage.dict.add = added$;
});

test("only one download at a time, and Stop gives it up without an error", async () => {
  reset();
  global.fetch = (url, { signal }) => Promise.resolve({ ok: true, body: { getReader: () => ({ read: () => new Promise((_, no) => signal.addEventListener("abort", () => no(new Error("aborted")))) }) } });
  const first = X.getPack("anki", "de-en");
  await new Promise((r) => setTimeout(r, 5));
  assert.deepStrictEqual([X.running().pack, X.running().step], ["de-en", "downloading"]);
  await assert.rejects(X.getPack("anki", "de-en"), /already running/);
  X.stopPack();
  await first;
  assert.strictEqual(X.running(), null);
  assert.deepStrictEqual(added, []);
  assert.strictEqual(X.lastError(), null);
});

test("deleting a pack removes its dictionary and forgets it", async () => {
  reset(); serve(bytes);
  await X.getPack("anki", "de-en");
  await X.dropPack("anki", "de-en");
  assert.deepStrictEqual(removed, ["d1"]);
  assert.strictEqual(X.packDict("anki", "de-en"), null);
  assert.strictEqual(X.packs("anki")[0].have, false);
});

test("a pack whose dictionary was removed elsewhere isn't counted as here", async () => {
  reset(); serve(bytes);
  await X.getPack("anki", "de-en");
  listed.length = 0;
  assert.strictEqual(X.packs("anki")[0].have, false);
});

(async () => {
  for (const [name, fn] of queued) {
    try { await fn(); passed++; console.log("  ok - " + name); }
    catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
  }
  console.log("  " + passed + " passed");
})();
