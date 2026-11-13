// Sync's merge (0.30.0): `node test/sync.test.js`. Two devices changing
// the library at once, against the last library both saw.
const assert = require("assert");

global.window = { Waypage: { platform: {} } };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
require("../src/sync.js");
const S = window.Waypage.sync;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const page = (id, more) => ({ id, url: "https://example.com/" + id, title: "Page " + id, savedAt: 100, at: 0, finished: false, ...more });
const lib = (pages, more) => ({ pages, deleted: {}, files: {}, ...more });
const ids = (r) => r.pages.map((p) => p.id).sort();
const NOW = 1e12;

test("the first sync sends everything; joining a library adds both sides", () => {
  assert.deepStrictEqual(ids(S.merge(null, lib([page("a1b2")]), null, NOW)), ["a1b2"]);
  assert.deepStrictEqual(ids(S.merge(null, lib([page("c3d4")]), lib([page("a1b2")]), NOW)), ["a1b2", "c3d4"]);
});

test("a page deleted on one device is deleted, and stays deleted", () => {
  const base = lib([page("a1b2"), page("c3d4")]);
  const r = S.merge(base, lib([page("c3d4")]), base, NOW);
  assert.deepStrictEqual(ids(r), ["c3d4"]);
  assert.ok(r.deleted.a1b2);
  // The other device, which still has it, takes the deletion.
  const r2 = S.merge(base, lib([page("a1b2"), page("c3d4")]), r, NOW);
  assert.deepStrictEqual(ids(r2), ["c3d4"]);
  // A device joining fresh doesn't bring it back.
  const r3 = S.merge(null, lib([page("a1b2")]), r, NOW);
  assert.deepStrictEqual(ids(r3), ["c3d4"]);
});

test("a page restored from a backup beats its older deletion, on every device (1.46.0)", () => {
  const base = lib([page("c3d4")]);
  const gone = lib([page("c3d4")], { deleted: { a1b2: NOW - 864e5 } });
  // Restored here: it stays, and the tombstone goes.
  const r = S.merge(base, lib([page("a1b2", { back: NOW - 1000 }), page("c3d4")]), gone, NOW);
  assert.deepStrictEqual(ids(r), ["a1b2", "c3d4"]);
  assert.ok(!r.deleted.a1b2);
  // The other device, whose own base still has the tombstone, takes it too.
  const r2 = S.merge(gone, lib([page("c3d4")]), r, NOW);
  assert.deepStrictEqual(ids(r2), ["a1b2", "c3d4"]);
  // Deleted again after the restore: deleted.
  const r3 = S.merge(lib([page("a1b2", { back: NOW - 1000 })]), lib([]), lib([page("a1b2", { back: NOW - 1000 })]), NOW);
  assert.deepStrictEqual(ids(r3), []);
  // Without a restore, an old copy still doesn't come back.
  assert.deepStrictEqual(ids(S.merge(base, lib([page("a1b2"), page("c3d4")]), gone, NOW)), ["c3d4"]);
});

test("a feed followed again by a restore beats its older unfollow", () => {
  const f = (addedAt) => ({ url: "https://example.com/feed", title: "F", addedAt });
  const remote = lib([], { feeds: [], feedsGone: { "https://example.com/feed": NOW - 864e5 } });
  const r = S.merge(lib([], { feeds: [] }), lib([], { feeds: [f(NOW - 1000)] }), remote, NOW);
  assert.strictEqual(r.feeds.length, 1);
  const old = S.merge(lib([], { feeds: [] }), lib([], { feeds: [f(NOW - 9e9)] }), remote, NOW);
  assert.strictEqual(old.feeds.length, 0);
});

test("a page whose text hasn't come down yet isn't taken for a deletion", () => {
  const base = lib([page("a1b2")]);
  const r = S.merge(base, { pages: [], waiting: ["a1b2"] }, base, NOW);
  assert.deepStrictEqual(ids(r), ["a1b2"]);
});

test("different fields changed on each side both stay", () => {
  const base = lib([page("a1b2")]);
  const r = S.merge(base, lib([page("a1b2", { folder: "Trips", folderAt: 5 })]), lib([page("a1b2", { fav: true, favAt: 9 })]), NOW);
  assert.strictEqual(r.pages[0].folder, "Trips");
  assert.strictEqual(r.pages[0].fav, true);
  assert.strictEqual(r.pages[0].favAt, 9);
});

test("tags merge: added on either side stay, removed on either side go", () => {
  const base = lib([page("a1b2", { tags: ["planes", "history"] })]);
  const r = S.merge(base, lib([page("a1b2", { tags: ["planes", "history", "trips"] })]), lib([page("a1b2", { tags: ["planes", "maps"] })]), NOW);
  assert.deepStrictEqual(r.pages[0].tags.sort(), ["maps", "planes", "trips"]);
});

test("where you are goes with whichever device read last", () => {
  const base = lib([page("a1b2", { at: 0.1, readAt: 10 })]);
  const r = S.merge(base, lib([page("a1b2", { at: 0.6, readAt: 30 })]), lib([page("a1b2", { at: 0.3, readAt: 20, finished: false })]), NOW);
  assert.strictEqual(r.pages[0].at, 0.6);
  assert.strictEqual(r.pages[0].readAt, 30);
});

test("a page saved again wins its content from the newer copy", () => {
  const base = lib([page("a1b2", { title: "Old" })]);
  const r = S.merge(base, lib([page("a1b2", { title: "Old", tags: ["x"] })]), lib([page("a1b2", { title: "New", savedAt: 200, minutes: 9 })]), NOW);
  assert.strictEqual(r.pages[0].title, "New");
  assert.strictEqual(r.pages[0].savedAt, 200);
  assert.deepStrictEqual(r.pages[0].tags, ["x"]);
});

test("one address saved on both devices becomes one page, keeping both sides' marks", () => {
  const l = page("a1b2", { url: "https://example.com/same", savedAt: 100, tags: ["mine"], at: 0.5, readAt: 50 });
  const r = page("c3d4", { url: "https://example.com/same", savedAt: 200, fav: true, favAt: 7 });
  const m = S.merge(null, lib([l]), lib([r]), NOW);
  assert.deepStrictEqual(ids(m), ["c3d4"]);
  assert.deepStrictEqual(m.pages[0].tags, ["mine"]);
  assert.strictEqual(m.pages[0].fav, true);
  assert.strictEqual(m.pages[0].at, 0.5);
  assert.ok(m.deleted.a1b2);
});

test("this device's pictures and sizes never go up", () => {
  const m = S.merge(null, lib([page("a1b2", { thumb: "images/1.jpg", bytes: 9, missing: 1, cover: "images/c.jpg" })]), null, NOW);
  for (const k of ["thumb", "bytes", "missing", "cover"]) assert.ok(!(k in m.pages[0]), k);
});

test("old tombstones are let go after 90 days", () => {
  const m = S.merge(null, lib([]), lib([], { deleted: { old1: NOW - 91 * 864e5, new1: NOW - 864e5 } }), NOW);
  assert.deepStrictEqual(Object.keys(m.deleted), ["new1"]);
});

test("nothing changed merges to the same library, so nothing is written", () => {
  const remote = lib([page("a1b2", { tags: ["t"] }), page("c3d4", { savedAt: 50 })], { files: { a1b2: { at: 100, sha: "x" } } });
  const m = S.merge(remote, lib([page("a1b2", { tags: ["t"] }), page("c3d4", { savedAt: 50 })]), remote, NOW);
  assert.strictEqual(JSON.stringify(m.pages), JSON.stringify(remote.pages));
  assert.deepStrictEqual(m.files, remote.files);
});

// Followed feeds (0.30.1): what's followed and how, never the posts.
const feed = (url, more) => ({ url: "https://" + url + "/feed", title: url, mode: "show", images: "previews", days: 7, addedAt: 10, ...more });
const urls = (r) => r.feeds.map((f) => f.url).sort();

test("feeds followed on either device are followed on both, without their posts", () => {
  const m = S.merge(null, lib([], { feeds: [feed("a.example", { items: [{ url: "x" }], checkedAt: 5 })] }), lib([], { feeds: [feed("b.example")], feedsGone: {} }), NOW);
  assert.deepStrictEqual(urls(m), ["https://a.example/feed", "https://b.example/feed"]);
  assert.ok(!("items" in m.feeds[0]) && !("checkedAt" in m.feeds[0]));
});

test("an unfollow travels, and following again brings it back", () => {
  const base = lib([], { feeds: [feed("a.example"), feed("b.example")], feedsGone: {} });
  const r = S.merge(base, lib([], { feeds: [feed("b.example")] }), base, NOW);
  assert.deepStrictEqual(urls(r), ["https://b.example/feed"]);
  // The other device, which still follows it, stops.
  assert.deepStrictEqual(urls(S.merge(base, lib([], { feeds: [feed("a.example"), feed("b.example")] }), r, NOW)), ["https://b.example/feed"]);
  // A fresh device that had followed it before doesn't bring it back...
  assert.deepStrictEqual(urls(S.merge(null, lib([], { feeds: [feed("a.example")] }), r, NOW)), ["https://b.example/feed"]);
  // ...but following it again after the unfollow does.
  const again = S.merge(r, lib([], { feeds: [feed("a.example", { addedAt: NOW + 1 }), feed("b.example")] }), r, NOW + 2);
  assert.deepStrictEqual(urls(again), ["https://a.example/feed", "https://b.example/feed"]);
  assert.ok(!again.feedsGone["https://a.example/feed"]);
});

test("a feed's settings changed on each device both stay", () => {
  const base = lib([], { feeds: [feed("a.example")], feedsGone: {} });
  const m = S.merge(base, lib([], { feeds: [feed("a.example", { mode: "save" })] }), lib([], { feeds: [feed("a.example", { days: 30 })], feedsGone: {} }), NOW);
  assert.strictEqual(m.feeds[0].mode, "save");
  assert.strictEqual(m.feeds[0].days, 30);
});

test("a device that doesn't send feeds leaves them as they are", () => {
  const remote = lib([], { feeds: [feed("a.example")], feedsGone: { "https://c.example/feed": NOW - 5 } });
  const m = S.merge(remote, lib([]), remote, NOW);
  assert.deepStrictEqual(m.feeds, remote.feeds);
  assert.deepStrictEqual(m.feedsGone, remote.feedsGone);
});

test("Feeds looked at on either device clears what's new on both, the latest look wins", () => {
  const m = S.merge(null, lib([], { feedsSeen: NOW - 50 }), lib([], { feedsSeen: NOW - 10 }), NOW);
  assert.strictEqual(m.feedsSeen, NOW - 10);
  const n = S.merge(null, lib([], { feedsSeen: NOW - 5 }), lib([], {}), NOW);
  assert.strictEqual(n.feedsSeen, NOW - 5);
  assert.ok(!("feedsSeen" in S.merge(null, lib([]), null, NOW)));
});
test("the same look on both is not a change, so nothing is written", () => {
  const remote = lib([], { feedsSeen: NOW - 10 });
  const m = S.merge(remote, lib([], { feedsSeen: NOW - 10 }), remote, NOW);
  assert.strictEqual(m.feedsSeen, remote.feedsSeen);
});

test("the place in the text (spot, 1.3.0) goes with the device that read last", () => {
  const base = lib([page("a1b2", { at: 0.2, spot: "3/10", readAt: 100 })]);
  const local = lib([page("a1b2", { at: 0.2, spot: "3/10", readAt: 100 })]);
  const remote = lib([page("a1b2", { at: 0.6, spot: "9/40", readAt: 200 })]);
  const m = S.merge(base, local, remote, NOW);
  assert.strictEqual(m.pages[0].at, 0.6);
  assert.strictEqual(m.pages[0].spot, "9/40");
  assert.strictEqual(m.pages[0].readAt, 200);
  // Both moved: the one read later wins all three together.
  const l2 = lib([page("a1b2", { at: 0.3, spot: "5/0", readAt: 300 })]);
  const m2 = S.merge(base, l2, remote, NOW);
  assert.deepStrictEqual([m2.pages[0].at, m2.pages[0].spot], [0.3, "5/0"]);
});

test("a library that went back on disk doesn't send the old place everywhere (1.21.0)", () => {
  // Synced at 0.6; then an older copy of the library came back on this
  // device (0.3, read earlier). GitHub and the base still say 0.6.
  const base = lib([page("a1b2", { at: 0.6, spot: "9/40", readAt: 200 })]);
  const local = lib([page("a1b2", { at: 0.3, spot: "5/0", readAt: 150 })]);
  const remote = lib([page("a1b2", { at: 0.6, spot: "9/40", readAt: 200 })]);
  const m = S.merge(base, local, remote, NOW);
  assert.deepStrictEqual([m.pages[0].at, m.pages[0].spot, m.pages[0].readAt], [0.6, "9/40", 200]);
  // Marked unread here, nothing read since: still this device's change.
  const unread = lib([page("a1b2", { at: 0, readAt: 200 })]);
  assert.strictEqual(S.merge(base, unread, remote, NOW).pages[0].at, 0);
});

test("opening a clip at an older place doesn't beat a place read further elsewhere (placeAt, 1.30.2)", () => {
  const base = lib([page("a1b2", { at: 0.2, spot: "3/10c", readAt: 100, placeAt: 100 })]);
  // Read on to 0.6 on the other device at 200; opened here at 300, not moved.
  const remote = lib([page("a1b2", { at: 0.6, spot: "9/40c", readAt: 200, placeAt: 200, readOn: "Tablet" })]);
  const local = lib([page("a1b2", { at: 0.2, spot: "3/10c", readAt: 300, placeAt: 100, readOn: "Phone" })]);
  const m = S.merge(base, local, remote, NOW).pages[0];
  assert.deepStrictEqual([m.at, m.spot, m.placeAt], [0.6, "9/40c", 200]);
  // The open still counts for Continue reading.
  assert.deepStrictEqual([m.readAt, m.readOn], [300, "Phone"]);
  // An entry from before placeAt goes by its readAt.
  const old = lib([page("a1b2", { at: 0.4, spot: "6/0", readAt: 250 })]);
  assert.strictEqual(S.merge(base, local, old, NOW).pages[0].at, 0.4);
});

test("a clip's text edited in Edit clips goes like a save, the later of the two winning (1.22.0)", () => {
  const base = lib([page("a1b2", { minutes: 4 })]);
  const edited = lib([page("a1b2", { minutes: 3, editedAt: 300 })]);
  // Saved again elsewhere before the edit: the edit wins, all its text fields with it.
  const resaved = lib([page("a1b2", { savedAt: 200, minutes: 6, title: "New" })]);
  const m = S.merge(base, edited, resaved, NOW);
  assert.deepStrictEqual([m.pages[0].minutes, m.pages[0].editedAt, m.pages[0].savedAt, m.pages[0].title], [3, 300, 100, "Page a1b2"]);
  // Saved again after the edit: the new save wins, and isn't an edit.
  const later = lib([page("a1b2", { savedAt: 400, minutes: 6 })]);
  const n = S.merge(base, edited, later, NOW);
  assert.deepStrictEqual([n.pages[0].minutes, n.pages[0].editedAt, n.pages[0].savedAt], [6, undefined, 400]);
  // Nothing new on GitHub: the edit goes up.
  assert.strictEqual(S.merge(base, edited, base, NOW).pages[0].editedAt, 300);
});

test("the device that read last (readOn, 1.4.2) goes with its place", () => {
  const base = lib([page("a1b2", { at: 0.2, readAt: 100, readOn: "phone" })]);
  // The phone read again but older than the tablet: the tablet's name stays with the tablet's place.
  const local = lib([page("a1b2", { at: 0.3, readAt: 150, readOn: "phone" })]);
  const remote = lib([page("a1b2", { at: 0.6, readAt: 200, readOn: "tablet" })]);
  const m = S.merge(base, local, remote, NOW);
  assert.deepStrictEqual([m.pages[0].at, m.pages[0].readOn], [0.6, "tablet"]);
  // A device from before 1.4.2 read last: no name, not the other's.
  const old = lib([page("a1b2", { at: 0.8, readAt: 300 })]);
  assert.strictEqual(S.merge(base, local, old, NOW).pages[0].readOn, undefined);
});

test("highlights merge by id: both sides' new ones stay, a removed one goes, the later note wins", () => {
  const m = (id, more) => ({ id, block: 1, start: 0, endBlock: 1, end: 4, text: "word", at: 10, ...more });
  const base = lib([page("a1b2", { marks: [m("x"), m("y")] })]);
  const local = lib([page("a1b2", { marks: [m("x", { note: "mine", at: 30 }), m("y"), m("l", { block: 0 })] })]);
  const remote = lib([page("a1b2", { marks: [m("x", { note: "theirs", at: 20 }), m("r", { block: 2 })] })]);
  const got = S.merge(base, local, remote, NOW).pages[0].marks;
  assert.deepStrictEqual(got.map((x) => x.id), ["l", "x", "r"]);
  assert.strictEqual(got.find((x) => x.id === "x").note, "mine");
});

test("removing every highlight on one device removes them everywhere", () => {
  const m = { id: "x", block: 1, start: 0, endBlock: 1, end: 4, text: "word", at: 10 };
  const base = lib([page("a1b2", { marks: [m] })]);
  const r = S.merge(base, lib([page("a1b2", { tags: ["t"] })]), lib([page("a1b2", { marks: [m], at: 0.5, readAt: 5 })]), NOW);
  assert.strictEqual(r.pages[0].marks, undefined);
});

test("a collection's picked cover goes to the other device, and only a name Waypage makes is kept", () => {
  const base = lib([page("a1b2", { folder: "Trip" })]);
  const r = S.merge(base, lib([page("a1b2", { folder: "Trip", coverPick: "uabcd1234.jpg" })]), base, NOW);
  assert.strictEqual(r.pages[0].coverPick, "uabcd1234.jpg");
  require("../src/backup.js");
  const B = window.Waypage.backup;
  const keep = (v, folder = "Trip") => B.cleanMeta(page("a1b2", { folder, coverPick: v }), "a1b2").coverPick;
  assert.strictEqual(keep("uabcd1234.jpg"), "uabcd1234.jpg");
  assert.strictEqual(keep("clip:c3d4"), "clip:c3d4");
  assert.strictEqual(keep("../library.json"), undefined);
  assert.strictEqual(keep("https://example.com/x.jpg"), undefined);
  assert.strictEqual(keep("uabcd1234.jpg", ""), undefined);
});

test("a note has no address, and is never taken for a copy of another note (2.0.0)", () => {
  const note = (id, more) => ({ id, url: "", title: "Note " + id, savedAt: 100, at: 0, finished: false, note: { paper: "lines" }, ...more });
  const r = S.merge(null, lib([note("a1b2"), note("c3d4")]), null, NOW, undefined, (a, b) => a === b, (u) => u);
  assert.deepStrictEqual(ids(r), ["a1b2", "c3d4"]);
  assert.deepStrictEqual(r.pages.map((p) => p.note), [{ paper: "lines" }, { paper: "lines" }]);
});

test("a note written on one device comes to the other whole, the copy edited last wins", () => {
  const note = (more) => ({ id: "a1b2", url: "", title: "Note", savedAt: 100, at: 0, finished: false, note: { paper: "squares" }, ...more });
  const base = lib([note()]);
  const r = S.merge(base, lib([note()]), lib([note({ editedAt: 500 })]), NOW);
  assert.strictEqual(r.pages[0].editedAt, 500);
  const r2 = S.merge(base, lib([note({ editedAt: 700 })]), lib([note({ editedAt: 500 })]), NOW);
  assert.strictEqual(r2.pages[0].editedAt, 700);
});

test("a note's files on GitHub are kept by name, and only names Waypage writes", () => {
  const got = S.clean({ pages: [{ id: "a1b2", url: "", title: "N", savedAt: 1, note: { paper: "lines", from: "c3d4" } }], deleted: {},
    files: { a1b2: { at: 1, sha: "x", note: { "note.json": "s1", "ink.json": "s2", "base.pdf": "s3", "img-ab12.txt": "s4", "../library.json": "s5", "x.html": "s6" } } } });
  assert.deepStrictEqual(got.pages[0].note, { paper: "lines", from: "c3d4" });
  assert.deepStrictEqual(Object.keys(got.files.a1b2.note).sort(), ["base.pdf", "img-ab12.txt", "ink.json", "note.json"]);
});

test("drawings on a clip merge stroke by stroke, like highlights (2026-11)", () => {
  const st = (id, x = 0) => ({ id, t: "p", c: "red", w: 0.01, p: [x, 0, 1, 1, 1, 1] });
  const base = lib([page("a1b2", { ink: { 3: [st("s1"), st("s2")] } })]);
  // Here s1 moved and s3 drawn; there s2 erased and s4 drawn.
  const r = S.merge(base, lib([page("a1b2", { ink: { 3: [st("s1", 0.5), st("s2"), st("s3")] } })]),
    lib([page("a1b2", { ink: { 3: [st("s1")], 5: [st("s4")] } })]), NOW);
  assert.deepStrictEqual(r.pages[0].ink, { 3: [st("s1", 0.5), st("s3")], 5: [st("s4")] });
});

test("drawings on a file read from outside merge by its fingerprint, stroke by stroke (2026-11)", () => {
  const FP = "0123456789abcdef0123456789abcdef";
  const st = (id) => ({ id, t: "p", c: "red", w: 0.01, p: [0, 0, 1, 1, 1, 1] });
  const base = { [FP]: { name: "a.pdf", ids: ["a1b2"], pages: { 2: [st("s1")] }, ink: { 4: [st("s5")] } } };
  // Here: a new stroke by block. There: s1 erased, a new stroke on page 3.
  const l = { [FP]: { name: "a.pdf", ids: ["a1b2"], pages: { 2: [st("s1")] }, ink: { 4: [st("s5")], 6: [st("s6")] } } };
  const r = { [FP]: { name: "a.pdf", ids: ["zz99"], pages: { 3: [st("s2")] }, ink: { 4: [st("s5")] } } };
  const got = S.mergeOutside(base, l, r);
  assert.deepStrictEqual(got[FP].pages, { 3: [st("s2")] });
  assert.deepStrictEqual(got[FP].ink, { 4: [st("s5")], 6: [st("s6")] });
  // A page's drawings come from the copy outsidePages makes.
  const here = S.outsideOf([page("a1b2", { link: "content://x", file: { name: "a.pdf", kind: "pdf", ext: "pdf", size: 9, fp: FP }, pages: { 3: [st("s2")] }, ink: { 6: [st("s6")] } })]);
  assert.deepStrictEqual(here[FP].pages, { 3: [st("s2")] });
  assert.deepStrictEqual(here[FP].ink, { 6: [st("s6")] });
});


test("what's yours on a file read from outside syncs by its fingerprint (2026-11)", () => {
  const FP = "0123456789abcdef0123456789abcdef", OTHER = "fedcba9876543210fedcba9876543210";
  const mk = (id, at = 1) => ({ id, block: 1, start: 0, endBlock: 1, end: 4, text: "word", at });
  const file = (fp, name) => ({ name, kind: "pdf", ext: "pdf", size: 9, fp });
  // Only files read from outside with a fingerprint go in; a copy is a clip.
  const here = S.outsideOf([
    page("a1b2", { link: "content://x", file: file(FP, "a.pdf"), at: 0.4, placeAt: 50, marks: [mk("m1")], tags: ["work"] }),
    page("c3d4", { file: file(OTHER, "b.pdf"), at: 0.9 }),
    page("e5f6", { link: "content://y", file: { name: "old.pdf", kind: "pdf", ext: "pdf", size: 1 }, at: 0.2 }),
  ]);
  assert.deepStrictEqual(Object.keys(here), [FP]);
  assert.deepStrictEqual(here[FP], { name: "a.pdf", ids: ["a1b2"], at: 0.4, placeAt: 50, marks: [mk("m1")], tags: ["work"] });

  // The phone read further later and added a highlight; here a tag came.
  const base = { [FP]: here[FP] };
  const phone = { [FP]: { name: "a.pdf", ids: ["zz99"], at: 0.7, placeAt: 90, marks: [mk("m1"), mk("m2")], tags: ["work"] }, [OTHER]: { name: "c.epub", ids: ["yy88"], at: 0.1, placeAt: 5 } };
  const got = S.mergeOutside(base, { [FP]: { ...here[FP], tags: ["work", "plane"] } }, phone);
  assert.strictEqual(got[FP].at, 0.7);
  assert.deepStrictEqual(got[FP].marks.map((m) => m.id), ["m1", "m2"]);
  assert.deepStrictEqual(got[FP].tags, ["work", "plane"]);
  assert.deepStrictEqual(got[FP].ids.sort(), ["a1b2", "zz99"]);
  // A file this device doesn't have stays as GitHub has it.
  assert.deepStrictEqual(got[OTHER], phone[OTHER]);
  // A device new to the file takes all of it.
  const fresh = S.mergeOutside(null, { [FP]: { name: "a.pdf", ids: ["q1w2"], at: 0 } }, phone);
  assert.strictEqual(fresh[FP].at, 0.7);
  assert.strictEqual(fresh[FP].marks.length, 2);

  // And onto the file here: what it says, and nothing else touched.
  const p = page("a1b2", { link: "content://x", file: file(FP, "a.pdf"), at: 0.4, placeAt: 50, bytes: 7 });
  const next = S.outsideOnto(p, got[FP]);
  assert.strictEqual(next.at, 0.7);
  assert.strictEqual(next.bytes, 7);
  assert.strictEqual(next.link, "content://x");
  assert.strictEqual(S.outsideOnto(next, got[FP]), null);
});

test("a rename on one device stays when the other edited the clip's text (2026-11)", () => {
  const base = lib([page("a1b2", { title: "Old", archived: true })]);
  const renamed = lib([page("a1b2", { title: "New" })]);
  const edited = lib([page("a1b2", { title: "Old", archived: true, editedAt: 300, minutes: 4 })]);
  for (const [l, r] of [[renamed, edited], [edited, renamed]]) {
    const m = S.merge(base, l, r, NOW).pages[0];
    assert.strictEqual(m.title, "New");
    assert.strictEqual(m.archived, undefined);
    assert.strictEqual(m.editedAt, 300);
    assert.strictEqual(m.minutes, 4);
  }
  // Both edited the text: the later edit wins it all, its title too.
  const both = S.merge(base, lib([page("a1b2", { title: "Mine", editedAt: 200 })]), edited, NOW).pages[0];
  assert.strictEqual(both.title, "Old");
  assert.strictEqual(both.editedAt, 300);
});

test("a highlight, drawing or edit made while another device deleted the clip keeps it (2026-11)", () => {
  const mk = { id: "m1", block: 1, start: 0, end: 5, at: 1 };
  const base = lib([page("a1b2", { marks: [mk] }), page("c3d4")]);
  const gone = lib([page("c3d4")]);
  const cases = [
    page("a1b2", { marks: [mk, { id: "m2", block: 2, start: 0, end: 3, at: 5 }] }),
    page("a1b2", { marks: [mk], ink: { 1: [{ id: "s1", p: [] }] } }),
    page("a1b2", { marks: [mk], editedAt: 300 }),
  ];
  for (const kept of cases) {
    // The deleting device syncs second, then first.
    const there = lib([kept, page("c3d4")]);
    const a = S.merge(base, gone, there, NOW);
    assert.deepStrictEqual(ids(a), ["a1b2", "c3d4"]);
    assert.ok(!a.deleted.a1b2);
    const first = S.merge(base, gone, base, NOW);
    const b = S.merge(base, there, first, NOW);
    assert.deepStrictEqual(ids(b), ["a1b2", "c3d4"]);
    assert.ok(!b.deleted.a1b2);
  }
  // Reading on, a tag or a highlight taken away doesn't stop the delete.
  for (const p of [page("a1b2", { marks: [mk], at: 0.5, placeAt: 9 }), page("a1b2", { marks: [mk], tags: ["x"] }), page("a1b2")]) {
    assert.deepStrictEqual(ids(S.merge(base, gone, lib([p, page("c3d4")]), NOW)), ["c3d4"]);
  }
});

test("a clip moved to two collections ends in the one it was moved to last (2026-11)", () => {
  const base = lib([page("a1b2", { folder: "Old", folderAt: 5 })]);
  const early = page("a1b2", { folder: "Trips", folderAt: 10, movedAt: 10 });
  const late = page("a1b2", { folder: "Work", folderAt: 3, movedAt: 20, folderFav: true, folderFavAt: 20 });
  for (const [l, r] of [[early, late], [late, early]]) {
    const m = S.merge(base, lib([l]), lib([r]), NOW).pages[0];
    assert.strictEqual(m.folder, "Work");
    assert.strictEqual(m.folderAt, 3);
    assert.strictEqual(m.folderFav, true);
  }
  // Taken out of it later wins too.
  const out = page("a1b2", { movedAt: 30 });
  assert.strictEqual(S.merge(base, lib([late]), lib([out]), NOW).pages[0].folder, undefined);
  // Moved on one side only: that move, whenever it was.
  assert.strictEqual(S.merge(base, lib([early]), base, NOW).pages[0].folder, "Trips");
});

console.log("\n" + passed + " passed");
