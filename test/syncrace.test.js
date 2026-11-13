// Two devices sending one edited clip at once: `node test/syncrace.test.js`.
// A page's text goes up before library.json, so the copy that lost the
// merge could land on GitHub after the winner's, and the library named a
// text that wasn't there (2026-11).
const assert = require("assert");

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
global.window = { Waypage: { platform: {},
  backup: { cleanMeta: (p) => ({ ...p }) },
  store: {
    readPage: async () => mine,
    writePage: async () => 10,
    removePage: async () => {},
    toBase64: (b) => Buffer.from(b).toString("base64"),
  } } };
global.DOMParser = class { parseFromString(html) { return { querySelectorAll: () => [], documentElement: { outerHTML: html } }; } };
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");

// GitHub's contents, path → { text, sha }, with its sha checks.
let gh = new Map(), shas = 0, mine = "";
let onPut = null;
const res = (status, j) => ({ ok: status < 300, status, json: async () => j, text: async () => (typeof j === "string" ? j : JSON.stringify(j)), headers: { get: () => "" } });
const putFile = (path, text) => { const sha = "sha" + ++shas; gh.set(path, { text, sha }); return sha; };
global.fetch = async (url, opts = {}) => {
  const path = decodeURIComponent(url.split("/contents/")[1] || "").split("?")[0];
  if (opts.method === "PUT") {
    const body = JSON.parse(opts.body);
    if (onPut) await onPut(path);
    const f = gh.get(path);
    if (f ? body.sha !== f.sha : body.sha) return res(f ? 409 : 422, { message: "sha" });
    return res(200, { content: { sha: putFile(path, Buffer.from(body.content, "base64").toString("utf8")) } });
  }
  const f = gh.get(path);
  if (opts.method === "DELETE") { gh.delete(path); return res(200, {}); }
  if (!f) return res(404, { message: "Not Found" });
  const accept = (opts.headers && opts.headers.Accept) || "";
  if (/raw/.test(accept)) return res(200, f.text);
  return res(200, { content: Buffer.from(f.text, "utf8").toString("base64"), sha: f.sha });
};

mem.set("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t", looked: Date.now(), scoped: true, what: { stats: false } }));
require("../src/sync.js");
const S = window.Waypage.sync;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.stack); process.exitCode = 1; }
}
const page = (editedAt) => ({ id: "aaaa", url: "https://example.com/a", title: "A", savedAt: 100, ...(editedAt ? { editedAt } : {}) });
const library = () => JSON.parse(gh.get("library.json").text);
// GitHub and this device as both last left them: the text from savedAt 100.
function start() {
  gh = new Map();
  const sha = putFile("pages/aaaa.html", "base text");
  const doc = { format: 1, pages: [page()], deleted: {}, files: { aaaa: { at: 100, sha } } };
  putFile("library.json", JSON.stringify(doc));
  mem.set("waypage.syncBase", JSON.stringify(doc));
  mem.delete("waypage.syncSent");
}
// The other device's whole sync of its edit, run in the middle of this one.
function other(at, text) {
  const sha = putFile("pages/aaaa.html", text);
  const doc = library();
  doc.pages = [page(at)];
  doc.files.aaaa = { at, sha };
  putFile("library.json", JSON.stringify(doc));
}

(async () => {
  await test("the older edit, sent last, doesn't stay on GitHub under the newer's name", async () => {
    start();
    mine = "my edit";
    let state = [page(200)];
    // The other device's page goes up just before this one's, its library
    // just after.
    let step = 0, sha = null;
    onPut = async (path) => {
      if (path === "pages/aaaa.html" && step === 0) { step = 1; sha = putFile(path, "their edit"); }
      else if (path === "library.json" && step === 1) { step = 2; const doc = library(); doc.pages = [page(300)]; doc.files.aaaa = { at: 300, sha }; putFile("library.json", JSON.stringify(doc)); }
    };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    onPut = null;
    const lib = library();
    assert.strictEqual(lib.pages[0].editedAt, 300);
    assert.ok(gh.get("pages/aaaa.html").text.endsWith("my edit"));
    // The library doesn't claim the newer text is there, so its device sends it again.
    assert.ok(!lib.files.aaaa);
  });

  await test("the newer edit, written over by the older one, goes up again", async () => {
    start();
    mine = "my edit";
    let state = [page(300)];
    let step = 0;
    onPut = async (path) => {
      // Just after this one's page: the other device's page and library.
      if (path === "library.json" && step === 0) { step = 1; other(200, "their edit"); }
    };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    onPut = null;
    const lib = library();
    assert.strictEqual(lib.pages[0].editedAt, 300);
    assert.ok(gh.get("pages/aaaa.html").text.endsWith("my edit"));
    assert.strictEqual(lib.files.aaaa.sha, gh.get("pages/aaaa.html").sha);
    assert.strictEqual(lib.files.aaaa.at, 300);
  });

  await test("an unrelated library write in between sends nothing twice", async () => {
    start();
    mine = "my edit";
    let state = [page(300)];
    let step = 0, pagePuts = 0;
    onPut = async (path) => {
      if (path === "pages/aaaa.html") pagePuts++;
      if (path === "library.json" && step === 0) { step = 1; const doc = library(); doc.feedsSeen = 5; putFile("library.json", JSON.stringify(doc)); }
    };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    onPut = null;
    assert.strictEqual(pagePuts, 1);
    assert.strictEqual(library().files.aaaa.sha, gh.get("pages/aaaa.html").sha);
  });

  console.log(passed + " passed");
})();
