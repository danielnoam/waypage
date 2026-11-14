// Sync history (put the library back as it was): `node test/synchistory.test.js`.
// The list GitHub's commits make, what a put-back changes here, and that
// the result travels to another device through the ordinary merge.
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
const feed = (url, more) => ({ url: "https://" + url + "/feed", title: url, mode: "show", images: "previews", days: 7, addedAt: 10, ...more });
const ids = (pages) => pages.map((p) => p.id).sort();
const NOW = 1e12;
const byId = (pages, id) => pages.find((p) => p.id === id);

// ---- The list ----
const commit = (sha, message, date) => ({ sha, commit: { message, committer: { date } } });

test("the list keeps library and feed commits, and leaves out places", () => {
  const list = S.parseHistory([
    commit("c5", "Library: 12 pages · Pixel", "2026-11-14T10:00:00Z"),
    commit("c4", "Places: 12 pages", "2026-11-14T09:00:00Z"),
    commit("c3", "Feeds: 3", "2026-11-13T09:00:00Z"),
    commit("c2", "Library: put back to 3 Nov, 14:02 · Laptop", "2026-11-12T09:00:00Z"),
    commit("c1", "Library: 1 pages", "2026-11-01T09:00:00Z"),
  ]);
  assert.deepStrictEqual(list.map((e) => e.sha), ["c5", "c3", "c2", "c1"]);
  assert.deepStrictEqual([list[0].clips, list[0].device, list[0].kind], [12, "Pixel", "library"]);
  assert.strictEqual(list[1].kind, "feeds");
  assert.deepStrictEqual([list[2].kind, list[2].back, list[2].device], ["back", "3 Nov, 14:02", "Laptop"]);
  // A commit from before devices were named reads without one.
  assert.deepStrictEqual([list[3].clips, list[3].device], [1, ""]);
  assert.strictEqual(list[0].at, Date.parse("2026-11-14T10:00:00Z"));
});

test("a commit that isn't a library write, or a reply that isn't a list, is ignored", () => {
  assert.deepStrictEqual(S.parseHistory([commit("x", "Reading stats", "2026-11-01T00:00:00Z"), commit("y", "Page: Title", "2026-11-01T00:00:00Z"), null, {}]), []);
  assert.deepStrictEqual(S.parseHistory({ message: "Not Found" }), []);
});

// ---- Versions that differ ----
const HEX = "0123456789abcdef";
test("a message carries a print, and an old one reads without", () => {
  const list = S.parseHistory([
    commit("c3", "Library: 12 pages · Pixel · #" + HEX, "2026-11-14T10:00:00Z"),
    commit("c2", "Library: 12 pages · #" + HEX, "2026-11-13T10:00:00Z"),
    commit("c1", "Feeds: 3 · #" + HEX, "2026-11-12T10:00:00Z"),
    commit("c0", "Library: 12 pages · Pixel", "2026-11-11T10:00:00Z"),
  ]);
  assert.deepStrictEqual(list.map((e) => [e.device, e.print]), [["Pixel", HEX], ["", HEX], ["", HEX], ["Pixel", null]]);
  assert.strictEqual(list[0].clips, 12);
});

test("a print ignores places, reading times, bookkeeping times, key order and a feed's addedAt", () => {
  const a = lib([page("a1b2", { tags: ["t"] }), page("c3d4")], { feeds: [feed("a.example"), feed("b.example")] });
  const b = lib([page("c3d4", { at: 0.9, spot: "2/3", readAt: 5, readOn: 6, placeAt: 7, favAt: 8, inkAt: 9, finished: true }),
    { tags: ["t"], ...page("a1b2"), folderFavAt: 3 }], { feeds: [feed("b.example", { addedAt: 99 }), feed("a.example")] });
  assert.strictEqual(S.libraryPrint(a), S.libraryPrint(b));
  assert.ok(/^[0-9a-f]{16}$/.test(S.libraryPrint(a)));
});

test("a print changes with tags, a title, an edit, a stroke, a clip or a feed", () => {
  const base = () => lib([page("a1b2", { tags: ["t"] })], { feeds: [feed("a.example")] });
  const p0 = S.libraryPrint(base());
  const differs = (edit) => { const d = base(); edit(d); return S.libraryPrint(d) !== p0; };
  assert.ok(differs((d) => { d.pages[0].tags = ["u"]; }));
  assert.ok(differs((d) => { d.pages[0].title = "Other"; }));
  assert.ok(differs((d) => { d.pages[0].editedAt = 400; }));
  assert.ok(differs((d) => { d.pages[0].ink = { 1: [{ id: "s", t: "p" }] }; }));
  assert.ok(differs((d) => { d.pages[0].marks = [{ id: "m" }]; }));
  assert.ok(differs((d) => { d.pages.push(page("e5f6")); }));
  assert.ok(differs((d) => { d.feeds[0].mode = "save"; }));
  assert.ok(differs((d) => { d.feeds.push(feed("b.example")); }));
});

test("the list keeps the newest of each run of the same library, and any it can't tell", () => {
  const e = (print) => ({ print });
  const got = S.distinct([e("A"), e("A"), e("B"), e("B"), e("B"), e("A")]);
  assert.deepStrictEqual(got.map((x) => x.print), ["A", "B", "A"]);
  assert.deepStrictEqual(S.distinct([e("A"), e(null), e("A"), e(null), e(null)]).map((x) => x.print), ["A", null, "A", null, null]);
  assert.deepStrictEqual(S.distinct([]), []);
});

// ---- What a put-back changes ----
// Then: a1b2 (tagged "old"), c3d4. Now: a1b2 (tagged "new", read to 0.7), e5f6 saved since; c3d4 deleted.
const then = lib([page("a1b2", { tags: ["old"], fav: true, favAt: 5 }), page("c3d4", { savedAt: 50 })], { feeds: [feed("a.example"), feed("b.example")], feedsGone: {} });
const now = [page("a1b2", { tags: ["new"], at: 0.7, readAt: 900, placeAt: 900, spot: "3/4" }), page("e5f6", { savedAt: 300 })];

test("a clip deleted since comes back over its tombstone, one saved since goes", () => {
  const plan = S.revertPlan(now, then, { now: NOW });
  assert.deepStrictEqual(plan.back.map((p) => p.id), ["c3d4"]);
  assert.strictEqual(plan.back[0].back, NOW);
  assert.deepStrictEqual(plan.drop, ["e5f6"]);
});

test("tags and favourites go back; where you are and when you read stay", () => {
  const plan = S.revertPlan(now, then, { now: NOW });
  assert.strictEqual(plan.change.length, 1);
  const c = plan.change[0];
  assert.strictEqual(c.id, "a1b2");
  assert.strictEqual(c.text, false);
  assert.deepStrictEqual(c.next.tags, ["old"]);
  assert.strictEqual(c.next.fav, true);
  assert.deepStrictEqual([c.next.at, c.next.readAt, c.next.placeAt, c.next.spot], [0.7, 900, 900, "3/4"]);
});

test("a clip whose text was edited since gets the old text, as the newest choice", () => {
  const edited = [page("a1b2", { tags: ["old"], fav: true, favAt: 5, editedAt: 400 })];
  const plan = S.revertPlan(edited, lib([page("a1b2", { tags: ["old"], fav: true, favAt: 5 })]), { now: NOW });
  assert.strictEqual(plan.change.length, 1);
  assert.strictEqual(plan.change[0].text, true);
  assert.strictEqual(plan.change[0].next.editedAt, NOW);
});

test("nothing differs: nothing to put back", () => {
  const same = lib([page("a1b2", { tags: ["t"] })]);
  const plan = S.revertPlan([page("a1b2", { tags: ["t"], readAt: 5, at: 0.4, thumb: "x" })], same, { now: NOW });
  assert.deepStrictEqual([plan.back.length, plan.drop.length, plan.change.length, plan.feeds], [0, 0, 0, null]);
});

test("feeds go back; one followed again beats its unfollow, one this device doesn't sync stays", () => {
  const mine = [feed("b.example"), feed("c.example"), feed("mail.example", { url: "mail://x" })];
  const plan = S.revertPlan(now, then, { now: NOW, feeds: mine, skipFeed: (u) => u.startsWith("mail:") });
  assert.deepStrictEqual(plan.feeds.map((f) => f.url).sort(), ["https://a.example/feed", "https://b.example/feed", "mail://x"]);
  assert.strictEqual(plan.feeds.find((f) => f.url === "https://a.example/feed").addedAt, NOW);
  assert.strictEqual(plan.feeds.find((f) => f.url === "https://b.example/feed").addedAt, 10);
  assert.deepStrictEqual([plan.followed, plan.unfollowed], [1, 1]);
});

const note = (id, more) => page(id, { note: { sheets: 1 }, editedAt: 100, ...more });

test("a note deleted since comes back, one made since goes, one changed gets the old version as the newest", () => {
  const plan = S.revertPlan([note("n1n1", { editedAt: 400 }), note("n3n3")], lib([note("n1n1"), note("n2n2")]), { now: NOW });
  assert.deepStrictEqual(plan.back.map((p) => [p.id, p.note !== undefined, p.back]), [["n2n2", true, NOW]]);
  assert.deepStrictEqual(plan.drop, ["n3n3"]);
  assert.deepStrictEqual([plan.change.length, plan.change[0].note, plan.change[0].text, plan.change[0].next.editedAt], [1, true, true, NOW]);
});

test("a device that doesn't sync notes leaves them alone, on both sides", () => {
  const plan = S.revertPlan([note("n1n1"), page("a1b2")], lib([note("n2n2"), page("a1b2")]), { now: NOW, skipNote: true });
  assert.deepStrictEqual([plan.back.length, plan.drop.length, plan.change.length], [0, 0, 0]);
});

test("inkDiff counts strokes by id and block: new here, and erased since", () => {
  const st = (id) => ({ id, t: "p" });
  assert.deepStrictEqual(S.inkDiff({ 1: [st("a"), st("b")], 2: [st("c")] }, { 1: [st("b")], 2: [st("c"), st("d")], 3: [st("e")] }), { here: 1, then: 2 });
  // The same id on another block is a different stroke.
  assert.deepStrictEqual(S.inkDiff({ 1: [st("a")] }, { 2: [st("a")] }), { here: 1, then: 1 });
  assert.deepStrictEqual(S.inkDiff(undefined, null), { here: 0, then: 0 });
  assert.deepStrictEqual(S.inkDiff({ 1: [st("a")] }, { 1: [st("a")] }), { here: 0, then: 0 });
});

test("a clip's drawings are counted in what a put-back changes", () => {
  const st = (id) => ({ id, t: "p" });
  const here = page("a1b2", { ink: { 1: [st("a"), st("b"), st("c")] } });
  const plan = S.revertPlan([here], lib([page("a1b2", { ink: { 1: [st("a")] } })]), { now: NOW });
  const ink = S.revertChanges(here, plan.change[0].next, false).find((x) => x.field === "ink");
  assert.deepStrictEqual([ink.here, ink.then], [2, 0]);
  assert.ok(!S.revertChanges(here, here, false).some((x) => x.field === "ink"));
});

test("an old library with no feeds leaves feeds alone", () => {
  assert.strictEqual(S.revertPlan(now, lib([]), { now: NOW, feeds: [feed("a.example")] }).feeds, null);
});

// ---- What the fold-out lists ----
test("revertChanges names each field a put-back alters, never where you are", () => {
  const here = page("a1b2", { tags: ["new"], fav: false, folder: "Trips", at: 0.7, readAt: 900, marks: [{ id: "m1" }, { id: "m2" }] });
  const next = { ...here, tags: ["old"], fav: true, folder: undefined, at: 0.1, readAt: 5, marks: [{ id: "m1" }], title: "Old title" };
  const got = S.revertChanges(here, next, true);
  assert.deepStrictEqual(got.map((x) => x.field), ["text", "title", "tags", "folder", "fav", "marks"]);
  assert.deepStrictEqual([got[5].was, got[5].now], [2, 1]);
  assert.deepStrictEqual(got[2].now, ["old"]);
});

test("revertChanges: only where you are differs, nothing to list; an odd field reads as other", () => {
  const here = page("a1b2", { at: 0.7, spot: "3/4" });
  assert.deepStrictEqual(S.revertChanges(here, { ...here, at: 0.1, spot: "1/4", placeAt: 9 }, false), []);
  assert.deepStrictEqual(S.revertChanges(here, { ...here, noShare: true }, false).map((x) => x.field), ["other"]);
});

// ---- Through the merge, to another device ----
// A puts the library back by hand, then syncs: base and GitHub are both
// the head H. B, still at H, then syncs against what A wrote.
function apply(current, plan) {
  const out = current.filter((p) => !plan.drop.includes(p.id)).map((p) => { const c = plan.change.find((x) => x.id === p.id); return c ? c.next : p; });
  return out.concat(plan.back);
}

test("a put-back reaches another device: clips, tags and feeds as they were, its own places kept", () => {
  const head = lib(now, { feeds: [feed("b.example"), feed("c.example")], feedsGone: { "https://a.example/feed": NOW - 100 }, deleted: { c3d4: NOW - 200 } });
  const plan = S.revertPlan(head.pages, then, { now: NOW, feeds: head.feeds });
  const a = S.merge(head, lib(apply(head.pages, plan), { feeds: plan.feeds }), head, NOW + 1);
  assert.deepStrictEqual(ids(a.pages), ["a1b2", "c3d4"]);
  assert.ok(!a.deleted.c3d4, "the tombstone is gone");
  assert.ok(a.deleted.e5f6, "the clip saved since is deleted");
  assert.deepStrictEqual(byId(a.pages, "a1b2").tags, ["old"]);
  assert.deepStrictEqual(a.feeds.map((f) => f.url).sort(), ["https://a.example/feed", "https://b.example/feed"]);
  // B has read a1b2 further and changed nothing else.
  const bHere = [page("a1b2", { tags: ["new"], at: 0.9, readAt: 950, placeAt: 950 }), page("e5f6", { savedAt: 300 })];
  const b = S.merge(head, lib(bHere, { feeds: head.feeds }), a, NOW + 2);
  assert.deepStrictEqual(ids(b.pages), ["a1b2", "c3d4"]);
  assert.deepStrictEqual(byId(b.pages, "a1b2").tags, ["old"]);
  assert.strictEqual(byId(b.pages, "a1b2").at, 0.9);
  assert.deepStrictEqual(b.feeds.map((f) => f.url).sort(), ["https://a.example/feed", "https://b.example/feed"]);
});

test("a put-back of a text edit wins on the other device", () => {
  const head = lib([page("a1b2", { editedAt: 400 })]);
  const plan = S.revertPlan(head.pages, lib([page("a1b2")]), { now: NOW });
  const a = S.merge(head, lib(apply(head.pages, plan)), head, NOW + 1);
  assert.strictEqual(byId(a.pages, "a1b2").editedAt, NOW);
  const b = S.merge(head, lib([page("a1b2", { editedAt: 400 })]), a, NOW + 2);
  assert.strictEqual(byId(b.pages, "a1b2").editedAt, NOW);
});

// A note's strokes: A puts the note back, so its base is GitHub's head and its
// strokes are the old ones. B, which saw the head, merges what A sent.
test("a put-back of a note's strokes reaches another device, and a stroke drawn there since stays", () => {
  const st = (id) => ({ id, t: "p", p: [1, 2] });
  const head = { 1: [st("a"), st("b"), st("new")] };
  const old = { 1: [st("a"), st("b")] };
  // B drew "mine" after head, and has not synced.
  const b = S.mergeInk(head, { 1: [st("a"), st("b"), st("new"), st("mine")] }, old);
  assert.deepStrictEqual(b[1].map((x) => x.id).sort(), ["a", "b", "mine"]);
  // B has changed nothing since head: exactly the old strokes.
  assert.deepStrictEqual(S.mergeInk(head, head, old)[1].map((x) => x.id).sort(), ["a", "b"]);
});

console.log(passed + " passed");
