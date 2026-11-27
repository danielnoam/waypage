// Progress in its own files (2026-11): `node test/syncprogress.test.js`.
// Reading on writes progress/<device>.json, not library.json; other devices
// take it; library.json carries the newest place whenever it's written for
// anything else, so a device from before this still gets them.
const assert = require("assert");
require("./lang.js");

const devices = { A: new Map(), B: new Map() };
let mem = devices.A;
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
global.window = { Waypage: { platform: {}, stats: { device: "aaaaaaaaaaaa" },
  backup: { cleanMeta: (p) => ({ ...p }) },
  store: { readPage: async () => "text", writePage: async () => 10, removePage: async () => {}, toBase64: (b) => Buffer.from(b).toString("base64") } } };
global.DOMParser = class { parseFromString(html) { return { querySelectorAll: () => [], documentElement: { outerHTML: html } }; } };
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");

let gh = new Map(), shas = 0;
const puts = [];
const res = (status, j) => ({ ok: status < 300, status, json: async () => j, text: async () => JSON.stringify(j), headers: { get: () => "" } });
const putFile = (path, text) => { const sha = "sha" + ++shas; gh.set(path, { text, sha }); return sha; };
global.fetch = async (url, opts = {}) => {
  const path = decodeURIComponent(url.split("/contents/")[1] || "").split("?")[0];
  if (opts.method === "PUT") {
    const body = JSON.parse(opts.body);
    const f = gh.get(path);
    if (f ? body.sha !== f.sha : body.sha) return res(f ? 409 : 422, { message: "sha" });
    puts.push(path);
    return res(200, { content: { sha: putFile(path, Buffer.from(body.content, "base64").toString("utf8")) } });
  }
  if (path === "progress") {
    const list = [...gh].filter(([k]) => k.startsWith("progress/")).map(([k, f]) => ({ name: k.slice(9), sha: f.sha, type: "file" }));
    return list.length ? res(200, list) : res(404, { message: "Not Found" });
  }
  const f = gh.get(path);
  if (!f) return res(404, { message: "Not Found" });
  return res(200, { content: Buffer.from(f.text, "utf8").toString("base64"), sha: f.sha });
};

const CFG = JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t", looked: Date.now(), scoped: true, what: { stats: false } });
mem.set("waypage.sync", CFG);
require("../src/keel/github.js");
require("../src/sync.js");
const S = window.Waypage.sync;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.stack); process.exitCode = 1; }
}
const page = (id, more) => ({ id, url: "https://example.com/" + id, title: id, savedAt: 100, ...more });
const library = () => JSON.parse(gh.get("library.json").text);
const lib = {};
// Both devices synced with GitHub: two clips, unread.
function start() {
  gh = new Map();
  const doc = { format: 1, pages: [page("aaaa"), page("bbbb")], deleted: {}, files: {} };
  for (const p of doc.pages) doc.files[p.id] = { at: 100, sha: putFile("pages/" + p.id + ".html", "text") };
  putFile("library.json", JSON.stringify(doc));
  for (const d of ["A", "B"]) {
    devices[d] = new Map([["waypage.sync", CFG], ["waypage.syncBase", JSON.stringify(doc)]]);
    lib[d] = doc.pages.map((p) => ({ ...p }));
  }
}
async function sync(d) {
  mem = devices[d];
  window.Waypage.stats.device = d === "A" ? "aaaaaaaaaaaa" : "bbbbbbbbbbbb";
  await S.run({ getPages: () => lib[d], setPages: async (list) => { lib[d] = list; } });
}
const read = (d, id, at, t) => { const p = lib[d].find((x) => x.id === id); Object.assign(p, { at, readAt: t, placeAt: t, spot: "b3" }); };

(async () => {
  await test("reading on sends a small progress file, not library.json", async () => {
    start();
    read("A", "aaaa", 0.4, 1000);
    puts.length = 0;
    await sync("A");
    assert.deepStrictEqual(puts, ["progress/aaaaaaaaaaaa.json"]);
    const file = JSON.parse(gh.get("progress/aaaaaaaaaaaa.json").text);
    assert.strictEqual(file.places.aaaa.at, 0.4);
    assert.ok(!file.places.bbbb);
    // Nothing more to send: a second sync writes nothing.
    puts.length = 0;
    await sync("A");
    assert.deepStrictEqual(puts, []);
  });

  await test("another device takes the place, spot and all", async () => {
    puts.length = 0;
    await sync("B");
    const p = lib.B.find((x) => x.id === "aaaa");
    assert.strictEqual(p.at, 0.4);
    assert.strictEqual(p.spot, "b3");
    assert.deepStrictEqual(puts, []);
  });

  await test("a newer place here beats an older one in a file", async () => {
    read("B", "aaaa", 0.7, 2000);
    await sync("B");
    await sync("A");
    assert.strictEqual(lib.A.find((x) => x.id === "aaaa").at, 0.7);
    assert.strictEqual(library().pages.find((x) => x.id === "aaaa").at, undefined, "library.json still not written");
  });

  await test("library.json written for anything else carries the newest places, for older devices", async () => {
    lib.A.find((x) => x.id === "bbbb").tags = ["trip"];
    puts.length = 0;
    await sync("A");
    assert.ok(puts.includes("library.json"));
    const a = library().pages.find((x) => x.id === "aaaa");
    assert.strictEqual(a.at, 0.7);
  });

  await test("a device's file keeps only places library.json hasn't caught up with", async () => {
    read("A", "bbbb", 0.2, 3000);
    await sync("A");
    const file = JSON.parse(gh.get("progress/aaaaaaaaaaaa.json").text);
    assert.deepStrictEqual(Object.keys(file.places), ["bbbb"]);
  });

  await test("a device without an id writes library.json as before", async () => {
    start();
    const was = window.Waypage.stats;
    window.Waypage.stats = undefined;
    read("A", "aaaa", 0.5, 1000);
    puts.length = 0;
    mem = devices.A;
    await S.run({ getPages: () => lib.A, setPages: async (list) => { lib.A = list; } });
    window.Waypage.stats = was;
    assert.deepStrictEqual(puts, ["library.json"]);
  });

  console.log(passed + " passed");
})();
