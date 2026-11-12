// Audiobooks' pure parts (2026-11, src/listen.js): `node test/listen.test.js`.
// Chapters read from a made-up M4B and MP3, transcripts as paragraphs,
// fixes, matching heard words to a book's, Media Overlay clocks, and the
// listening entry as sync and backups keep it.
const assert = require("assert");

global.window = { Waypage: { platform: {} } };
require("../src/backup.js");
require("../src/sync.js");
require("../src/listen.js");
const L = window.Waypage.listen;
const B = window.Waypage.backup;
const S = window.Waypage.sync;

let passed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u64 = (n) => [...u32(Math.floor(n / 4294967296)), ...u32(n >>> 0)];
const ascii = (s) => [...Buffer.from(s, "latin1")];
const box = (type, ...body) => { const b = body.flat(); return [...u32(8 + b.length), ...ascii(type), ...b]; };
const blobOf = (arr) => new Blob([Uint8Array.from(arr)]);

test("an M4B's Nero chapters (chpl)", async () => {
  const chpl = box("chpl", [1, 0, 0, 0], [0, 0, 0, 0], [2],
    u64(0), [7], ascii("Opening"),
    u64(615 * 1e7), [9], ascii("Chapter 1"));
  const file = blobOf([...box("ftyp", ascii("M4B "), u32(0)), ...box("moov", box("udta", chpl)), ...box("mdat", new Array(64).fill(0))]);
  const ch = await L.mp4Chapters(file);
  assert.deepStrictEqual(ch, [{ t: 0, title: "Opening" }, { t: 615, title: "Chapter 1" }]);
});

test("an M4B's QuickTime chapter track (tref/chap, text samples)", async () => {
  // Two text samples of 2 + n bytes, in one chunk at the end of the file.
  const s1 = [0, 5, ...ascii("Intro")], s2 = [0, 6, ...ascii("Part 2")];
  const head = (offset) => [
    ...box("ftyp", ascii("M4A "), u32(0)),
    ...box("moov",
      box("trak", box("tkhd", [0, 0, 0, 0], u32(0), u32(0), u32(1)), box("tref", box("chap", u32(2)))),
      box("trak", box("tkhd", [0, 0, 0, 0], u32(0), u32(0), u32(2)),
        box("mdia", box("mdhd", [0, 0, 0, 0], u32(0), u32(0), u32(1000)), box("minf", box("stbl",
          box("stts", [0, 0, 0, 0], u32(2), u32(1), u32(90500), u32(1), u32(1000)),
          box("stsz", [0, 0, 0, 0], u32(0), u32(2), u32(s1.length), u32(s2.length)),
          box("stsc", [0, 0, 0, 0], u32(1), u32(1), u32(2), u32(1)),
          box("stco", [0, 0, 0, 0], u32(1), u32(offset)))))))];
  const at = head(0).length + 8;
  const file = blobOf([...head(at), ...box("mdat", s1, s2)]);
  const ch = await L.mp4Chapters(file);
  assert.deepStrictEqual(ch, [{ t: 0, title: "Intro" }, { t: 90.5, title: "Part 2" }]);
});

test("an MP3's ID3 tag: its name, author, chapters and cover", async () => {
  const frame = (id, body) => [...ascii(id), ...u32(body.length), 0, 0, ...body];
  const text = (s) => [3, ...Buffer.from(s, "utf8")];
  const chap = (id, start, title) => frame("CHAP", [...ascii(id), 0, ...u32(start), ...u32(start + 1000), ...u32(0xffffffff), ...u32(0xffffffff), ...frame("TIT2", text(title))]);
  const png = [0x89, 0x50, 0x4e, 0x47, 1, 2, 3];
  const frames = [...frame("TALB", text("The Count")), ...frame("TPE1", text("Alexandre Dumas")),
    ...chap("c1", 0, "Marseilles"), ...chap("c2", 61500, "The Father and Son"),
    ...frame("APIC", [0, ...ascii("image/png"), 0, 3, 0, ...png])];
  const size = frames.length;
  const syncsafe = [(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127];
  const file = blobOf([...ascii("ID3"), 3, 0, 0, ...syncsafe, ...frames, 0xff, 0xfb, 0x90, 0]);
  const t = await L.tags(file, "mp3");
  assert.strictEqual(t.title, "The Count");
  assert.strictEqual(t.artist, "Alexandre Dumas");
  assert.deepStrictEqual(t.chapters, [{ t: 0, title: "Marseilles" }, { t: 61.5, title: "The Father and Son" }]);
  assert.deepStrictEqual([...t.cover], png);
});

test("what kind of sound a file is, from its bytes", () => {
  const head = (s) => Uint8Array.from([...ascii(s), ...new Array(16).fill(0)]);
  assert.strictEqual(L.sniff(head("ID3\u0003"), "x.bin"), "mp3");
  assert.strictEqual(L.sniff(head("\u0000\u0000\u0000 ftypM4B "), "book"), "m4b");
  assert.strictEqual(L.sniff(head("\u0000\u0000\u0000 ftypM4A "), "a.m4a"), "m4a");
  assert.strictEqual(L.sniff(head("OggS"), "a.opus"), "opus");
  assert.strictEqual(L.sniff(head("fLaC"), "a"), "flac");
  assert.strictEqual(L.sniff(head("%PDF-1.7"), "a.pdf"), null);
  assert.strictEqual(L.sniff(null, "Part 01.MP3"), "mp3");
});

test("a folder's files in reading order, and where a time falls", () => {
  const files = [{ name: "Part 10.mp3" }, { name: "cover.jpg" }, { name: "Part 2.mp3" }, { name: "Part 1.mp3" }];
  assert.deepStrictEqual(L.inOrder(files).map((f) => f.name), ["Part 1.mp3", "Part 2.mp3", "Part 10.mp3"]);
  const parts = [{ dur: 100 }, { dur: 50 }, { dur: 30 }];
  assert.deepStrictEqual(L.partAt(parts, 120), { part: 1, pos: 20 });
  assert.deepStrictEqual(L.partAt(parts, 500), { part: 2, pos: 350 });
  assert.strictEqual(L.startOf(parts, 2), 150);
  assert.strictEqual(L.chapterAt([{ t: 0 }, { t: 60 }], 59.9), 1);
  assert.strictEqual(L.chapterAt([{ t: 10 }], 2), -1);
});

const heard = (text, t0 = 0, step = 0.4, quiet = 0) => ({ t0, t1: t0 + text.split(" ").length * step, quiet, text,
  words: text.split(" "), times: text.split(" ").map((_, i) => t0 + i * step) });

test("a transcript in paragraphs: a long pause starts one, a chapter is a heading, a gap a line", () => {
  const pieces = [heard("It was a bright cold day in April, and the clocks were striking thirteen.", 0),
    heard("Winston Smith slipped quickly through the glass doors of Victory Mansions.", 6, 0.4, 1.4),
    heard("Outside, even through the shut window-pane, the world looked cold.", 400, 0.4, 0.2)];
  const words = L.timedWords(pieces);
  assert.strictEqual(words[0].t, 0);
  const parts = L.paragraphs(words, { chapters: [{ t: 0, title: "Part One" }, { t: 399, title: "Two" }], pauses: true, ranges: [[0, 180], [399, 579]] });
  assert.deepStrictEqual(parts.map((p) => p.head || (p.gap ? "—" : p.words.length)), ["Part One", 14, 11, "Two", 10]);
  const noPause = L.paragraphs(words, { pauses: false });
  assert.strictEqual(noPause.length, 1);
});

test("fixes: whole words, any case, the punctuation kept, now and later", () => {
  const words = L.timedWords([heard("Louis Blary oh, flew. blary OH landed.", 10)]);
  const fixed = L.applyFixes(words, [{ from: "blary oh", to: "Blériot" }]);
  assert.strictEqual(fixed.map((w) => w.w).join(" "), "Louis Blériot, flew. Blériot landed.");
  assert.strictEqual(fixed[1].t, words[1].t);
  assert.strictEqual(L.countHeard(words, "Blary oh"), 2);
  assert.strictEqual(L.applyFixes(words, [{ from: "oh", to: "" }]).length, words.length);
});

test("heard words find their place in a book's text, skipping what isn't narrated", () => {
  const blocks = ["The Count of Monte Cristo", "Contents: Chapter 1, Chapter 2", "Chapter 1. Marseilles—The Arrival",
    "On the 24th of February, 1815, the look-out at Notre-Dame de la Garde signalled the three-master, the Pharaon from Smyrna, Trieste, and Naples.",
    "As usual, a pilot put off immediately, and rounding the Château d'If, got on board the vessel between Cape Morgiou and Rion island."];
  const book = L.bookWords(blocks);
  // What Parakeet might hear: a credit first, numbers as words, an accent lost.
  const words = L.timedWords([
    heard("This is a LibriVox recording.", 0),
    heard("Chapter one. Marseilles, the arrival.", 5),
    heard("On the 24th of February 1815 the lookout at Notre Dame de la Garde signalled the three master the Pharaon from Smyrna Trieste and Naples.", 9),
    heard("As usual a pilot put off immediately and rounding the Chateau d'If got on board the vessel between Cape Morgiou and Rion Island.", 30)]);
  const sync = L.syncOf(book, L.align(words, book));
  // The title and contents aren't heard.
  assert.ok(!sync.b.includes(0) && !sync.b.includes(1));
  const i = sync.b.findIndex((b, k) => b === 4 && blocks[4].slice(sync.o[k], sync.o[k] + sync.l[k]) === "pilot");
  assert.ok(i >= 0, "found pilot");
  assert.ok(Math.abs(sync.t[i] - (30 + 3 * 0.4)) < 0.01);
  // The word at a time, and the time at a place.
  assert.strictEqual(L.wordAt(sync, sync.t[i] + 0.1), i);
  assert.strictEqual(L.wordAt(sync, 1), -1);
  const at = L.timeAt(sync, 4, blocks[4].indexOf("pilot"));
  assert.strictEqual(at, sync.t[i]);
  for (let k = 1; k < sync.t.length; k++) assert.ok(sync.t[k] >= sync.t[k - 1]);
  assert.ok(L.matched(words, sync) > 0.6);
});

test("the narrator skipping ahead is found again", () => {
  const filler = (n, w) => Array.from({ length: n }, (_, i) => w + i).join(" ");
  const blocks = [filler(400, "alpha"), "the one sentence that the narrator reads after skipping a great deal of the book", filler(50, "omega")];
  const book = L.bookWords(blocks);
  const words = L.timedWords([heard(filler(20, "alpha"), 0), heard("the one sentence that the narrator reads after skipping a great deal of the book", 100)]);
  const sync = L.syncOf(book, L.align(words, book));
  const k = sync.b.indexOf(1);
  assert.ok(k >= 0 && Math.abs(sync.t[k] - 100) < 0.01);
});

test("an EPUB's narration: clock values, and a sync from its pars", () => {
  assert.strictEqual(L.clock("0:01:02.5"), 62.5);
  assert.strictEqual(L.clock("1:02"), 62);
  assert.strictEqual(L.clock("4.25s"), 4.25);
  assert.strictEqual(L.clock("500ms"), 0.5);
  assert.strictEqual(L.clock("1.5min"), 90);
  assert.ok(Number.isNaN(L.clock("soon")));
  const parts = [{ dur: 10 }, { dur: 20 }];
  const spots = { "c0-s1": { b: 2, o: 0, l: 30 }, "c0-s2": { b: 2, o: 31, l: 20 }, "c1-s1": { b: 3, o: 0, l: 40 } };
  const s = L.overlaySync([{ id: "c0-s1", part: 0, t0: 0 }, { id: "c0-s2", part: 0, t0: 4 }, { id: "gone", part: 0, t0: 6 }, { id: "c1-s1", part: 1, t0: 1 }], parts, (id) => spots[id] || null);
  assert.deepStrictEqual(s, { t: [0, 4, 11], b: [2, 2, 3], o: [0, 31, 0], l: [30, 20, 40] });
});

test("the listening entry: kept clean in backups and sync", () => {
  const meta = B.cleanMeta({ title: "Book", file: { name: "Book.m4b", kind: "audio", ext: "m4b", size: 10, fp: "0123456789abcdef0123456789abcdef" },
    listen: { t: 125.5, tAt: 5, dur: 3600, speed: 1.25, mode: "book", book: { id: "abcd1234", url: "javascript:x" }, fixes: [{ from: "blary oh", to: "Blériot", at: 3 }, { from: "", to: "x" }], junk: 1 } }, "x1234");
  assert.ok(meta, "an audio file is a file");
  assert.deepStrictEqual(meta.listen, { t: 125.5, tAt: 5, dur: 3600, speed: 1.25, mode: "book", book: { id: "abcd1234" }, fixes: [{ from: "blary oh", to: "Blériot", at: 3 }] });
  assert.strictEqual(B.cleanListen({ t: "x", speed: 9 }).speed, undefined);
  assert.strictEqual(B.cleanListen(null), null);
});

test("sync: the place from the device that listened last, fixes from both", () => {
  const base = { t: 10, tAt: 1, fixes: [{ from: "a", to: "A", at: 1 }, { from: "gone", to: "G", at: 1 }] };
  const here = { t: 50, tAt: 5, fixes: [{ from: "a", to: "A", at: 1 }, { from: "b", to: "B", at: 4 }] };
  const there = { t: 90, tAt: 9, speed: 1.5, fixes: [{ from: "A", to: "Ä", at: 8 }, { from: "gone", to: "G", at: 1 }, { from: "c", to: "C", at: 2 }] };
  const m = S.mergeListen(base, here, there);
  assert.strictEqual(m.t, 90);
  assert.strictEqual(m.speed, 1.5);
  assert.deepStrictEqual(m.fixes.map((f) => f.from + ">" + f.to).sort(), ["A>Ä", "b>B", "c>C"]);
  // Through the outside map, keyed by the file's fingerprint.
  const fp = "0123456789abcdef0123456789abcdef";
  const page = (listen) => ({ id: "abcd1234", link: "content://x", file: { name: "b.m4b", kind: "audio", ext: "m4b", size: 1, fp }, title: "B", url: "", listen });
  const out = S.outsideOf([page(here)]);
  assert.deepStrictEqual(out[fp].listen, here);
  const merged = S.mergeOutside({ [fp]: { listen: base } }, out, { [fp]: { name: "b.m4b", ids: ["efgh5678"], listen: there } });
  assert.strictEqual(merged[fp].listen.t, 90);
  const clean = S.cleanOutside(merged);
  assert.strictEqual(clean[fp].listen.t, 90);
  const onto = S.outsideOnto(page(here), clean[fp]);
  assert.strictEqual(onto.listen.t, 90);
});

test("times and lengths as words", () => {
  assert.strictEqual(L.timeText(42), "0:42");
  assert.strictEqual(L.timeText(3725), "1:02:05");
  assert.strictEqual(L.lengthText(59 * 60), "59 min");
  assert.strictEqual(L.lengthText(120 * 60), "2 h");
  assert.strictEqual(L.lengthText(52 * 3600 + 47 * 60), "52 h 47 min");
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log("  ok - " + name); }
    catch (e) { console.error("  FAIL - " + name); console.error("    " + (e.stack || e.message)); process.exitCode = 1; }
  }
  console.log(passed + " of " + tests.length + " passed");
})();
