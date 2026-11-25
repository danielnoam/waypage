// Catalogs through GitHub sync: `node test/synccatalogs.test.js`. Two
// devices take turns on one made-up repo: the list goes across, a password
// never does, the newer change wins, and a removed catalog stays removed.
const assert = require("assert");
require("./lang.js");

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
global.window = { Waypage: { platform: {},
  backup: { cleanMeta: (p) => ({ ...p }) },
  store: {
    readPage: async () => "", writePage: async () => 10, removePage: async () => {},
    toBase64: (b) => Buffer.from(b).toString("base64"),
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

const CFG = JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t", looked: Date.now(), scoped: true, what: { clips: false, notes: false, feeds: false, newsletters: false, stats: false, anki: false } });
mem.set("waypage.sync", CFG);
let extOn = true;
// The real catalogue says which lists Sync carries; on and load are made up.
require("../src/extensions.js");
Object.assign(window.Waypage.ext, { on: (id) => extOn && id === "catalogs", load: async () => true });
require("../src/opds.js");
require("../src/keel/github.js");
require("../src/sync.js");
const S = window.Waypage.sync, O = window.Waypage.opds;

const kept = {};
const KEYS = ["waypage.catalogs", "waypage.catalogs.gone", "waypage.syncCatalogs", "waypage.syncBase"];
let current = null;
function as(name) {
  if (current) kept[current] = Object.fromEntries(KEYS.filter((k) => mem.has(k)).map((k) => [k, mem.get(k)]));
  for (const k of KEYS) mem.delete(k);
  current = name;
  for (const [k, v] of Object.entries(kept[name] || {})) mem.set(k, v);
}
const sync = () => S.run({ getPages: () => [], setPages: async () => {} });
const onGit = () => JSON.parse(gh.get("catalogs.json").text);
const tick = () => new Promise((r) => setTimeout(r, 3));

let passed = 0;
async function test(name, fn) {
  gh = new Map(); kept.a = kept.b = undefined; current = null; puts.length = 0; onPut = null; extOn = true;
  putFile("library.json", JSON.stringify({ format: 1, pages: [], deleted: {}, files: {} }));
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.stack.split("\n").slice(0, 4).join("\n    ")); process.exitCode = 1; }
}

(async () => {
  await test("a catalog added on one device is on the other, without its password", async () => {
    as("a");
    O.add({ id: "c1", title: "Home", url: "http://192.168.1.20:8080/opds", user: "daniel", pass: "s3cret" });
    await sync();
    assert.ok(!gh.get("catalogs.json").text.includes("s3cret"), "no password on GitHub");
    assert.strictEqual(onGit().list[0].user, "daniel");
    as("b");
    await sync();
    assert.deepStrictEqual(O.list().map((c) => [c.title, c.url, c.user, c.pass]), [["Home", "http://192.168.1.20:8080/opds", "daniel", ""]]);
  });

  await test("the password typed on each device stays there; a rename on one reaches the other", async () => {
    as("a");
    O.add({ id: "c1", title: "Home", url: "https://books.example.test/opds", user: "daniel", pass: "on-a" });
    await sync();
    as("b");
    await sync();
    await tick();
    O.update({ id: "c1", pass: "on-b" });
    await sync();
    as("a");
    await tick();
    O.update({ id: "c1", title: "Shelf" });
    await sync();
    assert.strictEqual(O.list()[0].pass, "on-a");
    as("b");
    await sync();
    assert.deepStrictEqual(O.list().map((c) => [c.title, c.pass]), [["Shelf", "on-b"]]);
  });

  await test("a catalog removed on one device goes from the other, and doesn't come back", async () => {
    as("a");
    O.add({ id: "c1", title: "One", url: "https://one.test/opds" });
    O.add({ id: "c2", title: "Two", url: "https://two.test/opds" });
    await sync();
    as("b");
    await sync();
    as("a");
    await tick();
    O.remove("c1");
    await sync();
    as("b");
    await sync();
    assert.deepStrictEqual(O.list().map((c) => c.id), ["c2"]);
    await sync();
    as("a");
    await sync();
    assert.deepStrictEqual(O.list().map((c) => c.id), ["c2"]);
    assert.deepStrictEqual(onGit().list.map((c) => c.id), ["c2"]);
  });

  await test("nothing changed sends nothing, and with Catalogs off nothing is sent", async () => {
    as("a");
    O.add({ id: "c1", title: "One", url: "https://one.test/opds" });
    await sync();
    const n = puts.length;
    await sync();
    assert.strictEqual(puts.length, n, "no write when GitHub already has it");
    extOn = false;
    O.add({ id: "c2", title: "Two", url: "https://two.test/opds" });
    await sync();
    assert.strictEqual(puts.length, n);
  });

  await test("another device's write landing first is merged in, and ours sent again", async () => {
    as("a");
    O.add({ id: "c1", title: "One", url: "https://one.test/opds" });
    let beaten = 0;
    onPut = async (path) => {
      if (path !== "catalogs.json" || beaten++) return;
      putFile("catalogs.json", JSON.stringify({ v: 1, list: [{ id: "c9", title: "Theirs", url: "https://nine.test/opds", user: "", at: Date.now() }], gone: {} }));
    };
    await sync();
    assert.deepStrictEqual(O.list().map((c) => c.id).sort(), ["c1", "c9"]);
    assert.deepStrictEqual(onGit().list.map((c) => c.id).sort(), ["c1", "c9"]);
  });

  console.log("  " + passed + " passed");
})();
