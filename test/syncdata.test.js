// What a sync downloads (2026-11): `node test/syncdata.test.js`. library.json
// is asked for with its ETag, so a sync with nothing new is a 304 with no
// body, and one past 1 MB that this device wrote last isn't fetched again.
const assert = require("assert");
require("./lang.js");

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
global.window = { Waypage: { platform: {},
  backup: { cleanMeta: (p) => ({ ...p }) },
  store: { readPage: async () => "text", writePage: async () => 10, removePage: async () => {}, toBase64: (b) => Buffer.from(b).toString("base64") } } };
global.DOMParser = class { parseFromString(html) { return { querySelectorAll: () => [], documentElement: { outerHTML: html } }; } };
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");

// GitHub's contents, path → { text, sha }; files past `big` bytes come
// without content, as the contents API sends them past 1 MB.
let gh = new Map(), shas = 0, big = Infinity;
const log = [];
const res = (status, j, etag) => ({ ok: status < 300, status, json: async () => j, text: async () => JSON.stringify(j), headers: { get: (h) => (/etag/i.test(h) ? etag || "" : "") } });
const putFile = (path, text) => { const sha = "sha" + ++shas; gh.set(path, { text, sha }); return sha; };
global.fetch = async (url, opts = {}) => {
  const blob = /\/git\/blobs\/(.+)$/.exec(url);
  if (blob) {
    log.push("blob");
    const f = [...gh.values()].find((x) => x.sha === blob[1]);
    return res(200, { content: Buffer.from(f.text, "utf8").toString("base64") });
  }
  const path = decodeURIComponent(url.split("/contents/")[1] || "").split("?")[0];
  const method = opts.method || "GET";
  if (path === "library.json") log.push(method);
  if (method === "PUT") {
    const body = JSON.parse(opts.body);
    const f = gh.get(path);
    if (f ? body.sha !== f.sha : body.sha) return res(f ? 409 : 422, { message: "sha" });
    return res(200, { content: { sha: putFile(path, Buffer.from(body.content, "base64").toString("utf8")) } });
  }
  const f = gh.get(path);
  if (!f) return res(404, { message: "Not Found" });
  const tag = 'W/"' + f.sha + '"';
  if (opts.headers && opts.headers["If-None-Match"] === tag) { if (path === "library.json") log[log.length - 1] = "304"; return res(304, null); }
  if (f.text.length > big) return res(200, { content: "", size: f.text.length, sha: f.sha }, tag);
  return res(200, { content: Buffer.from(f.text, "utf8").toString("base64"), sha: f.sha }, tag);
};

mem.set("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t", looked: Date.now(), scoped: true, what: { stats: false } }));
require("../src/keel/github.js");
require("../src/sync.js");
const S = window.Waypage.sync;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.stack); process.exitCode = 1; }
}
const page = (more) => ({ id: "aaaa", url: "https://example.com/a", title: "A", savedAt: 100, ...more });
function start() {
  gh = new Map();
  const sha = putFile("pages/aaaa.html", "text");
  const doc = { format: 1, pages: [page()], deleted: {}, files: { aaaa: { at: 100, sha } } };
  putFile("library.json", JSON.stringify(doc));
  mem.set("waypage.syncBase", JSON.stringify(doc));
}

(async () => {
  await test("a sync with nothing new downloads library.json once, then 304s", async () => {
    start();
    let state = [page()];
    const run = () => S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    log.length = 0;
    await run();
    await run();
    assert.ok(await S.poll() === false);
    assert.deepStrictEqual(log, ["GET", "304", "304"]);
  });

  await test("a change made elsewhere still comes in", async () => {
    start();
    let state = [page()];
    const run = () => S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    await run();
    const doc = JSON.parse(gh.get("library.json").text);
    doc.pages[0].at = 0.5;
    doc.pages[0].placeAt = 5;
    putFile("library.json", JSON.stringify(doc));
    await run();
    assert.strictEqual(state[0].at, 0.5);
  });

  await test("a big library this device wrote last isn't fetched again", async () => {
    start();
    big = 50;
    let state = [page({ at: 0.3, placeAt: 9 })];
    const run = () => S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    log.length = 0;
    await run();
    // Read (as a blob), then this device's place went up.
    assert.deepStrictEqual(log, ["GET", "blob", "PUT"]);
    log.length = 0;
    await run();
    // GitHub has what was written here: its sha matches, no blob.
    assert.deepStrictEqual(log, ["GET"]);
    assert.strictEqual(JSON.parse(gh.get("library.json").text).pages[0].at, 0.3);
    big = Infinity;
  });

  console.log(passed + " passed");
})();
