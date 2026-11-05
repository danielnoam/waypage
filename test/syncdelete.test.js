// A clip deleted while a sync runs stays deleted: `node test/syncdelete.test.js`.
// The sync's last step put back every clip it had decided on, so one
// deleted meanwhile came straight back and had to be deleted again.
const assert = require("assert");

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const written = [];
global.window = { Waypage: { platform: {},
  backup: { cleanMeta: (p) => ({ ...p }) },
  store: {
    readPage: async () => "<p>text</p>",
    writePage: async (id) => { written.push(id); return 10; },
    removePage: async () => {},
    toBase64: (b) => Buffer.from(b).toString("base64"),
  } } };
// Pages here have no pictures: a parser that finds none is enough.
global.DOMParser = class { parseFromString(html) { return { querySelectorAll: () => [], documentElement: { outerHTML: html } }; } };
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
let remote = null;
let during = null;
const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => j, headers: { get: () => "" } });
global.fetch = async (url) => {
  const path = decodeURIComponent(url.split("/contents/")[1] || "").split("?")[0];
  if (during) await during(path);
  if (path === "library.json") return ok({ content: b64(JSON.stringify(remote)), sha: "s1" });
  if (path.startsWith("pages/")) return ok("<p>new text</p>");
  throw new Error("unexpected " + url);
};

mem.set("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t", looked: Date.now(), scoped: true, what: { stats: false } }));
require("../src/sync.js");
const S = window.Waypage.sync;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}
const page = (id, savedAt = 100) => ({ id, url: "https://example.com/" + id, title: "Page " + id, savedAt });
const doc = (pages) => ({ format: 1, pages, deleted: {}, files: Object.fromEntries(pages.map((p) => [p.id, { at: p.savedAt, sha: "x" + p.id }])) });
const ids = (list) => list.map((p) => p.id).sort();


(async () => {
  await test("a clip deleted while sync reads GitHub stays deleted", async () => {
    remote = doc([page("aaaa"), page("bbbb")]);
    mem.set("waypage.syncBase", JSON.stringify(remote));
    let state = [page("aaaa"), page("bbbb")];
    during = async (path) => { if (path === "library.json") state = state.filter((p) => p.id !== "aaaa"); };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    during = null;
    assert.deepStrictEqual(ids(state), ["bbbb"]);
  });

  await test("a clip deleted while its new text comes down stays deleted, its text not written", async () => {
    remote = doc([page("aaaa", 200), page("bbbb")]);
    mem.set("waypage.syncBase", JSON.stringify(doc([page("aaaa"), page("bbbb")])));
    written.length = 0;
    let state = [page("aaaa"), page("bbbb")];
    during = async (path) => { if (path === "pages/aaaa.html") state = state.filter((p) => p.id !== "aaaa"); };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    during = null;
    assert.deepStrictEqual(ids(state), ["bbbb"]);
    assert.ok(!written.includes("aaaa"));
  });

  await test("a clip that came down in this sync and was deleted before it ended stays deleted", async () => {
    const fresh = Array.from({ length: 14 }, (_, i) => page("new" + String(i).padStart(2, "0")));
    remote = doc([page("bbbb"), ...fresh]);
    mem.set("waypage.syncBase", JSON.stringify(doc([page("bbbb")])));
    let state = [page("bbbb")];
    during = async (path) => { if (path === "pages/new13.html") state = state.filter((p) => p.id !== "new00"); };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    during = null;
    assert.ok(!state.some((p) => p.id === "new00"));
    assert.strictEqual(state.length, 14);
  });

  await test("the next sync sends the deletion", async () => {
    remote = doc([page("aaaa"), page("bbbb")]);
    mem.set("waypage.syncBase", JSON.stringify(remote));
    let state = [page("aaaa"), page("bbbb")];
    during = async (path) => { if (path === "library.json") state = state.filter((p) => p.id !== "aaaa"); };
    await S.run({ getPages: () => state, setPages: async (list) => { state = list; } });
    during = null;
    const merged = S.merge(JSON.parse(mem.get("waypage.syncBase")), { pages: state }, remote, Date.now());
    assert.deepStrictEqual(ids(merged.pages), ["bbbb"]);
    assert.ok(merged.deleted.aaaa);
  });

  console.log(passed + " passed");
})();
