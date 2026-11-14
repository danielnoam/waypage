// Recover Notes and Highlights (2026-11), the parts that need no browser:
// `node test/recover.test.js`. The reader's own search for a highlight
// (locateIn) is stubbed here; test/ui.test.js drives the real one.
const assert = require("assert");

global.window = { Waypage: {} };
require("../src/recover.js");
const R = window.Waypage.recover;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

// An io over plain objects: `files[id]` holds html, ink.json, note.json.
function makeIO(files, found) {
  const saved = { notes: {}, index: 0 };
  return {
    saved,
    html: async (p) => (files[p.id] || {}).html || null,
    ink: async (p) => (files[p.id] || {}).ink || null,
    note: async (p) => (files[p.id] || {}).note || null,
    hasBase: async (p) => !!(files[p.id] || {}).base,
    locateIn: (html, marks) => found(html, marks),
    printed: (p) => !!(p.link && p.file && p.file.kind === "pdf" && !p.comic && p.view !== "text"),
    writeNote: async (p, d) => { saved.notes[p.id] = d; files[p.id].note = d; },
    save: async () => { saved.index++; },
  };
}
const found = (states, blocks) => (html, marks) => ({ marks: marks.map((m) => ({ id: m.id, state: states[m.id] || "ok", at: { block: 2, start: 0, endBlock: 2, end: 5 } })), blocks });
const mark = (id, extra) => ({ id, block: 0, start: 0, endBlock: 0, end: 5, text: "hello", at: 1, ...extra });

(async () => {
  await test("a clip whose highlights and drawings all sit where they were has nothing to recover", async () => {
    const pages = [{ id: "a", title: "A", marks: [mark("m1")], ink: { 1: [{ id: "s" }] } }];
    const io = makeIO({ a: { html: "<p>hello</p>" } }, found({}, 3));
    assert.deepStrictEqual(await R.scan(pages, io), []);
  });

  await test("a highlight found elsewhere is put back at its new place, stamped now so sync keeps it", async () => {
    const pages = [{ id: "a", title: "A", marks: [mark("m1")] }];
    const io = makeIO({ a: { html: "x" } }, found({ m1: "moved" }, 3));
    const list = await R.scan(pages, io);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].kind, "mark-moved");
    assert.strictEqual(list[0].fix, "Put it back");
    const before = Date.now();
    assert.ok(await R.fix(list[0], pages, io));
    assert.strictEqual(pages[0].marks[0].block, 2);
    assert.ok(pages[0].marks[0].at >= before);
    assert.strictEqual(io.saved.index, 1);
  });

  await test("a highlight that isn't in the clip is listed with nothing to fix, and its note is mentioned", async () => {
    const pages = [{ id: "a", title: "A", marks: [mark("m1", { note: "why" })] }];
    const list = await R.scan(pages, makeIO({ a: { html: "x" } }, found({ m1: "lost" }, 3)));
    assert.strictEqual(list[0].kind, "mark-lost");
    assert.strictEqual(list[0].fix, null);
    assert.ok(/with its note/.test(list[0].line));
    assert.strictEqual(R.copyText(list[0], pages), "hello\n\nwhy");
    assert.strictEqual(await R.fix(list[0], pages, makeIO({}, found({}, 1))), false);
  });

  await test("drawings on blocks past the end of the clip move to its last block", async () => {
    const pages = [{ id: "a", title: "A", ink: { 2: [{ id: "x" }], 9: [{ id: "y" }], 12: [{ id: "z" }] } }];
    const io = makeIO({ a: { html: "x" } }, found({}, 5));
    const list = await R.scan(pages, io);
    assert.strictEqual(list.length, 1);
    assert.deepStrictEqual(list[0].keys.sort(), ["12", "9"]);
    assert.ok(await R.fix(list[0], pages, io));
    assert.deepStrictEqual(Object.keys(pages[0].ink).sort(), ["2", "5"]);
    assert.strictEqual(pages[0].ink[5].length, 2);
  });

  await test("a PDF shown as text that has drawings gets them back by showing its pages", async () => {
    const pages = [{ id: "p", title: "P", link: "L", file: { kind: "pdf" }, view: "text", drawn: [[1, 2]] }];
    const io = makeIO({ p: { ink: { v: 1, pages: { 1: [{}, {}] } } } }, found({}, 0));
    const list = await R.scan(pages, io);
    assert.deepStrictEqual(list.map((x) => x.kind), ["ink-hidden-by-view"]);
    await R.fix(list[0], pages, io);
    assert.strictEqual(pages[0].view, undefined);
  });

  await test("a PDF's list of drawn pages is rebuilt from ink.json, and dropped when nothing is drawn", async () => {
    const pages = [{ id: "p", title: "P", link: "L", file: { kind: "pdf" }, drawn: [[1, 9]] }];
    const io = makeIO({ p: { ink: { v: 1, pages: { 1: [{}], 3: [{}, {}] } } } }, found({}, 0));
    const list = await R.scan(pages, io);
    assert.deepStrictEqual(list.map((x) => x.kind), ["ink-drawn-stale"]);
    await R.fix(list[0], pages, io);
    assert.deepStrictEqual(pages[0].drawn, [[1, 1], [3, 2]]);
    const none = [{ id: "q", title: "Q", link: "L", file: { kind: "pdf" }, drawn: [[1, 1]] }];
    const l2 = await R.scan(none, makeIO({ q: {} }, found({}, 0)));
    await R.fix(l2[0], none, makeIO({ q: {} }, found({}, 0)));
    assert.strictEqual(none[0].drawn, undefined);
  });

  await test("a note whose sheets were lost gets paper sheets up to the last one drawn on", async () => {
    const pages = [{ id: "n", title: "N", note: { paper: "plain" } }];
    const files = { n: { ink: { v: 1, pages: { 1: [{}], 4: [{}] } } } };
    const io = makeIO(files, found({}, 0));
    const list = await R.scan(pages, io);
    assert.deepStrictEqual(list.map((x) => x.kind), ["ink-sheets-missing"]);
    assert.ok(await R.fix(list[0], pages, io));
    assert.strictEqual(io.saved.notes.n.sheets.length, 4);
    assert.ok(io.saved.notes.n.sheets.every((s) => s.bg === "paper"));
    assert.deepStrictEqual(await R.scan(pages, io), []);
  });

  await test("a note on a PDF that's gone turns those sheets into paper so the drawings show", async () => {
    const pages = [{ id: "n", title: "N", note: { paper: "plain" } }];
    const files = { n: { note: { v: 1, sheets: [{ bg: "paper" }, { bg: "pdf", n: 2 }] }, ink: { v: 1, pages: { 2: [{}] } } } };
    const io = makeIO(files, found({}, 0));
    const list = await R.scan(pages, io);
    assert.deepStrictEqual(list.map((x) => x.kind), ["ink-base-missing"]);
    await R.fix(list[0], pages, io);
    assert.deepStrictEqual(io.saved.notes.n.sheets, [{ bg: "paper" }, { bg: "paper" }]);
  });

  await test("a clip that can't be read is skipped, and the scan reports its progress", async () => {
    const pages = [{ id: "a", title: "A", marks: [mark("m1")] }, { id: "b", title: "B" }];
    const io = makeIO({}, found({ m1: "lost" }, 1));
    const seen = [];
    const list = await R.scan(pages, io, (n, of) => seen.push(n + "/" + of));
    assert.deepStrictEqual(list, []);
    assert.deepStrictEqual(seen, ["1/2", "2/2"]);
  });

  // Notes that are gone from the library: GitHub's notes/ folders and the phone's.
  const gh = {
    "notes/aaa111/note.json": JSON.stringify({ v: 1, sheets: [{ bg: "paper" }, { bg: "paper" }] }),
    "notes/aaa111/ink.json": JSON.stringify({ v: 1, pages: { 1: [{}, {}, {}], 2: [{}] } }),
    "notes/bbb222/note.json": JSON.stringify({ v: 1, sheets: [{ bg: "pdf", n: 1 }] }),
    "notes/ccc333/note.json": "{}",
  };
  const lostIO = (over) => ({
    sync: true,
    folders: async () => ["aaa111", "bbb222", "ccc333", "here44"],
    listing: async (id) => (id === "aaa111" ? { "note.json": "s", "ink.json": "s" } : id === "bbb222" ? { "note.json": "s", "base.pdf": "s" } : id === "ccc333" ? { "note.json": "s" } : {}),
    title: async (id) => ({ aaa111: "Debate 1", bbb222: "" }[id] || ""),
    text: async (path) => gh[path],
    deleted: async () => ({ aaa111: 1762849111893 }),
    orphans: async () => [],
    orphanFiles: async () => null,
    files: async (id) => ({ note: JSON.parse(gh["notes/" + id + "/note.json"]), imgs: {} }),
    bring: async (name, paper, got) => ({ id: "new1", title: name, note: { paper }, got }),
    ...over,
  });

  await test("notes in GitHub's notes/ that the library doesn't have are found, with their sheets, strokes and when sync deleted them", async () => {
    const r = await R.findDeleted(lostIO(), new Set(["here44"]));
    assert.deepStrictEqual(r.found.map((c) => c.id), ["aaa111", "bbb222", "ccc333"]);
    const a = r.found[0];
    assert.strictEqual(a.title, "Debate 1");
    assert.strictEqual(a.sheets, 2);
    assert.strictEqual(a.strokes, 4);
    assert.strictEqual(a.deletedAt, 1762849111893);
    assert.strictEqual(r.found[1].pdf, true);
    assert.strictEqual(r.found[1].title, "Untitled note");
    assert.deepStrictEqual(r.skipped, []);
  });

  await test("a folder with no note.json isn't a note, and a library note isn't offered", async () => {
    const r = await R.findDeleted(lostIO({ folders: async () => ["here44", "none99"] }), new Set(["here44"]));
    assert.deepStrictEqual(r.found, []);
  });

  await test("with sync off it says so, and still looks on the phone", async () => {
    const r = await R.findDeleted(lostIO({ sync: false, orphans: async () => [{ id: "orph1", title: "Old", paper: "lines" }], orphanFiles: async () => ({ note: { sheets: [{ bg: "paper" }] }, ink: { pages: { 1: [{}] } } }) }), new Set());
    assert.strictEqual(r.skipped.length, 1);
    assert.deepStrictEqual(r.found.map((c) => c.source + ":" + c.title + ":" + c.strokes), ["phone:Old:1"]);
  });

  await test("a sync that can't be read is reported, not thrown", async () => {
    const r = await R.findDeleted(lostIO({ folders: async () => { throw new Error("offline"); } }), new Set());
    assert.deepStrictEqual(r.found, []);
    assert.ok(/couldn't be read/.test(r.skipped[0]));
  });

  await test("bringing a note back goes through bring, with its title and files, and leaves the old id alone", async () => {
    const [a] = (await R.findDeleted(lostIO(), new Set())).found;
    const meta = await R.bringBack(a, lostIO());
    assert.strictEqual(meta.id, "new1");
    assert.notStrictEqual(meta.id, a.id);
    assert.strictEqual(meta.title, "Debate 1");
    assert.strictEqual(meta.got.note.sheets.length, 2);
    assert.strictEqual(await R.bringBack({ ...a, source: "phone" }, lostIO()), null);
  });

  console.log(passed + " passed");
})();
