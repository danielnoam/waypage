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

console.log("\n" + passed + " passed");
