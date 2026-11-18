// Sync sending in batches (1.15.0): `node test/syncbatch.test.js`. A small
// GitHub in memory (refs, commits, trees, blobs) stands in for the Git Data
// API; the clips go up in commits of up to 50, a branch that moved in the
// meantime gets the commit made again on its new head, and each page's sha
// is the one git gives its text.
const assert = require("assert");
require("./lang.js");
const crypto = require("crypto");

global.window = { Waypage: { platform: {}, store: { toBase64: (b) => Buffer.from(b).toString("base64") } } };
const CFG = JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t" });
global.localStorage = { getItem: (k) => (k === "waypage.sync" ? CFG : null), setItem: () => {}, removeItem: () => {} };

// The repo: commits name a tree, a tree is { path: sha }.
let n = 0;
const id = () => (++n).toString(16).padStart(40, "0");
const trees = { t0: {} };
const commits = { c0: { tree: "t0" } };
let head = "c0";
let moveOnce = false;
const calls = [];
global.fetch = async (url, opts = {}) => {
  const path = url.replace("https://api.github.com/repos/me/waypage-data/git/", "");
  const body = opts.body ? JSON.parse(opts.body) : null;
  const method = opts.method || "GET";
  calls.push(method + " " + path.split("/")[0]);
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (method === "GET" && path === "ref/heads/main") return ok({ object: { sha: head } });
  if (method === "GET" && path.startsWith("commits/")) return ok({ tree: { sha: commits[path.slice(8)].tree } });
  if (method === "POST" && path === "blobs") return ok({ sha: "b" + id() });
  if (method === "POST" && path === "trees") {
    const t = { ...trees[body.base_tree] };
    for (const e of body.tree) {
      if (e.content != null) t[e.path] = crypto.createHash("sha1").update("blob " + Buffer.byteLength(e.content) + "\0").update(e.content).digest("hex");
      else if (e.sha === null) delete t[e.path];
      else t[e.path] = e.sha;
    }
    const sha = "t" + id();
    trees[sha] = t;
    return ok({ sha });
  }
  if (method === "POST" && path === "commits") { const sha = "c" + id(); commits[sha] = { tree: body.tree, parent: body.parents[0] }; return ok({ sha }); }
  if (method === "PATCH" && path === "refs/heads/main") {
    if (moveOnce) {
      // Another device synced in between.
      moveOnce = false;
      const other = { ...trees[commits[head].tree], "pages/other.html": "x" };
      trees.tother = other;
      commits.cother = { tree: "tother", parent: head };
      head = "cother";
    }
    if (commits[body.sha].parent !== head) return { ok: false, status: 422, json: async () => ({ message: "Update is not a fast forward" }) };
    head = body.sha;
    return ok({});
  }
  throw new Error("unexpected " + method + " " + path);
};

require("../src/keel/github.js");
require("../src/sync.js");
const S = window.Waypage.sync;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}
const item = (i, more) => ({ p: { id: "p" + i, title: "Clip " + i, savedAt: 1 }, text: "<p>Clip " + i + " ✈︎</p>", packs: [], was: null, ...more });
const files = () => trees[commits[head].tree];

(async () => {
  await test("a page's sha is the one git gives its text", async () => {
    const t = "<p>Héllo ✈︎</p>";
    const want = crypto.createHash("sha1").update("blob " + Buffer.byteLength(t) + "\0").update(t).digest("hex");
    assert.strictEqual(await S.blobSha(new TextEncoder().encode(t)), want);
  });

  await test("120 clips go up in three commits, each told once it's there", async () => {
    calls.length = 0;
    const sent = [];
    const list = Array.from({ length: 120 }, (_, i) => item(i));
    await S.sendBatches(list, (b) => sent.push(b), null, 120, 0);
    assert.strictEqual(calls.filter((c) => c === "PATCH refs").length, 3);
    assert.strictEqual(calls.filter((c) => c === "POST blobs").length, 0, "text went as blobs, one request each");
    assert.strictEqual(sent.length, 120);
    for (const b of sent) assert.strictEqual(files()["pages/" + b.p.id + ".html"], b.sha);
  });

  await test("a branch that moved meanwhile gets the commit again on its new head", async () => {
    moveOnce = true;
    await S.sendBatches([item(500)], () => {}, null, 1, 0);
    assert.ok(files()["pages/other.html"], "the other device's file was lost");
    assert.ok(files()["pages/p500.html"]);
  });

  await test("a file's pictures go as blobs, and packs it no longer has are removed", async () => {
    files()["pages/p7/pack-1"] = "old";
    const b = item(7, { packs: [new Uint8Array([1, 2, 3])], was: { packs: ["a", "old"] } });
    await S.sendBatches([b], () => {}, null, 1, 0);
    assert.strictEqual(files()["pages/p7/pack-0"], b.packShas[0]);
    assert.strictEqual(files()["pages/p7/pack-1"], undefined);
  });

  console.log("\n" + passed + " passed");
})();
