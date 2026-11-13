// Share reading activity (2026-11): `node test/activity.test.js`. A fixture
// library makes the expected activity/reading.json (docs/reading-activity.md).
const assert = require("assert");

global.window = { Waypage: {} };
require("../src/activity.js");
const A = window.Waypage.activity;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const FP = "0123456789abcdef0123456789abcdef";
const T = (d) => new Date(d + "T12:00:00").getTime();
const web = (id, more) => ({ id, url: "https://example.com/" + id, title: "Clip " + id, byline: "", savedAt: T("2026-11-01"), at: 0, finished: false, ...more });
const file = (id, ext, more) => ({ id, url: "", title: "File " + id, byline: "An Author", savedAt: T("2026-11-01"), at: 0, finished: false,
  file: { name: id + "." + ext, kind: ext, ext, size: 10 }, ...more });

const library = [
  file("book1", "epub", { at: 0.62, folder: "Shelf" }),
  file("pdf1", "pdf", { at: 0.5 }),
  file("pdf2", "pdf", { at: 0.5, book: true }),
  file("pdf3", "pdf", { at: 0.5, folder: "Papers", folderBooks: true }),
  file("cbz1", "cbz", { at: 1, finished: true, readAt: T("2026-11-10") }),
  web("comic1", { comic: true, at: 0.3 }),
  { ...file("aud1", "mp3", { link: "content://x", byline: "A Reader" }), file: { name: "aud1", kind: "audio", ext: "mp3", size: 10, fp: FP },
    audio: { parts: [{}], chapters: [{ t: 0 }, { t: 600 }, { t: 1200 }], dur: 1800 }, listen: { t: 900, tAt: 1 } },
  web("art1", { at: 0.9 }),
  web("art2", { at: 0.01 }),
  web("ch1", { folder: "Story", source: "https://example.com/story", finished: true, byline: "Writer" }),
  web("ch2", { folder: "Story", finished: true }),
  web("ch3", { folder: "Story" }),
  web("note1", { url: "", note: { paper: "blank" } }),
  web("away1", { at: 0.9, noShare: true }),
  web("away2", { at: 0.9, folder: "Private", folderNoShare: true }),
  web("away3", { at: 0.9, folder: "Private" }),
  file("md1", "md", { at: 0.9 }),
];
const totals = {
  days: {
    "2026-11-08": { readMs: 30 * 60000, paceMs: 30 * 60000, aloudMs: 0, clips: { book1: 30 * 60000 } },
    "2026-11-12": { readMs: 50 * 60000, paceMs: 34 * 60000, aloudMs: 20 * 60000, clips: { aud1: 20 * 60000, ch1: 30 * 60000 } },
    "2026-11-13": { readMs: 0, aloudMs: 0, clips: {} },
  },
  clips: {
    book1: { readMs: 412 * 60000, far: 0.6 },
    aud1: { readMs: 5 * 60000, aloudMs: 20 * 60000 },
    ch1: { readMs: 30 * 60000, finished: T("2026-11-12") },
    ch2: { readMs: 20 * 60000, finished: T("2026-11-12") },
    cbz1: { readMs: 15 * 60000, finished: T("2026-11-10") },
  },
};

test("a fixture library makes the expected file", () => {
  const doc = A.build(library, totals, { now: Date.UTC(2026, 10, 13, 9) });
  assert.deepStrictEqual(doc, {
    schema: 1, app: "waypage", updatedAt: "2026-11-13T09:00:00Z",
    items: [
      { id: "book1", kind: "book", title: "File book1", author: "An Author", collection: "Shelf", progress: 0.62, startedAt: "2026-11-08", finishedAt: null, minutes: 412 },
      { id: "cbz1", kind: "comic", title: "File cbz1", author: "An Author", collection: "", progress: 1, startedAt: null, finishedAt: "2026-11-10", minutes: 15 },
      { id: "comic1", kind: "comic", title: "Clip comic1", author: "", collection: "", progress: 0.3, startedAt: null, finishedAt: null, minutes: 0 },
      { id: "f" + FP, kind: "audiobook", title: "File aud1", author: "A Reader", collection: "", progress: 0.5, chapters: { read: 1, total: 3 }, startedAt: "2026-11-12", finishedAt: null, minutes: 20 },
      { id: "pdf2", kind: "book", title: "File pdf2", author: "An Author", collection: "", progress: 0.5, startedAt: null, finishedAt: null, minutes: 0 },
      { id: "pdf3", kind: "book", title: "File pdf3", author: "An Author", collection: "Papers", progress: 0.5, startedAt: null, finishedAt: null, minutes: 0 },
      { id: doc.items[6].id, kind: "serial", title: "Story", author: "Writer", collection: "Story", progress: 0.67, chapters: { read: 2, total: 3 }, startedAt: "2026-11-12", finishedAt: null, minutes: 50 },
    ],
    days: { "2026-11-08": { read: 30, listened: 0 }, "2026-11-12": { read: 34, listened: 20 } },
  });
  assert.ok(/^s[0-9a-z]+$/.test(doc.items[6].id));
});

test("articles go in only when turned on, and only past 10 minutes or 5%", () => {
  const doc = A.build(library, totals, { kinds: { article: true } });
  const ids = doc.items.map((i) => i.id);
  assert.ok(ids.includes("art1"));
  assert.ok(!ids.includes("art2"));
  for (const away of ["away1", "away2", "away3", "note1", "md1", "pdf1", "ch1", "ch2", "ch3"]) assert.ok(!ids.includes(away), away);
});

test("a kind turned off is left out", () => {
  const doc = A.build(library, totals, { kinds: { book: false, serial: false } });
  assert.deepStrictEqual(doc.items.map((i) => i.kind).sort(), ["audiobook", "comic", "comic"]);
});

test("a serial is finished once every saved chapter is, and not when a new one comes", () => {
  const done = library.map((p) => (p.id === "ch3" ? { ...p, finished: true, readAt: T("2026-11-13") } : p));
  const s = A.build(done, totals).items.find((i) => i.kind === "serial");
  assert.strictEqual(s.finishedAt, "2026-11-13");
  assert.strictEqual(s.progress, 1);
  const more = done.concat(web("ch4", { folder: "Story" }));
  assert.strictEqual(A.build(more, totals).items.find((i) => i.kind === "serial").finishedAt, null);
});

test("a file another device has stays; one here, or gone from there, doesn't", () => {
  const doc = A.build(library, totals);
  const other = { id: "f" + "f".repeat(32), kind: "book", title: "Elsewhere" };
  const stale = { id: "f" + FP, kind: "audiobook", title: "Old" };
  const out = A.carry(doc, { items: [other, stale, { id: "clip9", kind: "article" }] }, new Set(["f" + FP]));
  assert.ok(out.items.some((i) => i.title === "Elsewhere"));
  assert.ok(!out.items.some((i) => i.title === "Old"));
  assert.ok(!out.items.some((i) => i.id === "clip9"));
});

test("the signature leaves out when it was written", () => {
  assert.strictEqual(A.sig(A.build(library, totals, { now: 1 })), A.sig(A.build(library, totals, { now: 2 })));
  assert.notStrictEqual(A.sig(A.build(library, totals)), A.sig(A.build(library.slice(1), totals)));
});

console.log(passed + " passed");
