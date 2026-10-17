// Reading other read-later apps' exports (1.9.0): `node test/imports.test.js`.
// The CSV kinds here; Pocket's HTML and Omnivore's zip are read in the
// browser by test/ui.test.js.
const assert = require("assert");

global.window = { Waypage: {} };
require("../src/imports.js");
const I = window.Waypage.imports;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

test("CSV fields with quotes, commas and line breaks", () => {
  assert.deepStrictEqual(I.csvRows('a,b\n"x, y","say ""hi""\nthere"\n'), [["a", "b"], ["x, y", 'say "hi"\nthere']]);
});

test("Pocket's CSV: tags split on |, archived ones read, oldest first", () => {
  const r = I.parse("part_000000.csv", [
    "title,url,time_added,cursor,tags,status",
    "Second,https://b.example/2,1700000200,,news|long,unread",
    "First,https://a.example/1,1700000100,,,archive",
  ].join("\n"));
  assert.strictEqual(r.source, "Pocket");
  assert.deepStrictEqual(r.items.map((x) => [x.title, x.read, x.tags]), [["First", true, []], ["Second", false, ["news", "long"]]]);
  assert.strictEqual(r.items[0].at, 1700000100000);
});

test("Instapaper's CSV: Archive is read, its own folders become tags", () => {
  const r = I.parse("instapaper-export.csv", [
    "URL,Title,Selection,Folder,Timestamp",
    "https://a.example/1,One,,Unread,1700000000",
    "https://a.example/2,Two,,Archive,1700000001",
    "https://a.example/3,Three,,Recipes,1700000002",
  ].join("\n"));
  assert.strictEqual(r.source, "Instapaper");
  assert.deepStrictEqual(r.items.map((x) => [x.title, x.read, x.tags]), [["One", false, []], ["Two", true, []], ["Three", false, ["Recipes"]]]);
});

test("any CSV with a url column; duplicates and non-web links dropped", () => {
  const r = I.parse("links.csv", "name,link\nA,https://a.example/\nB,https://a.example\nC,mailto:x@y.z\nD,https://d.example/");
  assert.strictEqual(r.source, "a list");
  assert.deepStrictEqual(r.items.map((x) => x.title), ["A", "D"]);
});

test("Omnivore's JSON: labels as tags, archived as read", () => {
  const r = I.parse("metadata_0_to_20.json", JSON.stringify([
    { url: "https://o.example/1", title: "O1", labels: ["Tech", { name: "Later" }], state: "Archived", savedAt: "2024-01-02T00:00:00Z" },
    { url: "https://o.example/2", title: "O2", labels: [], state: "Succeeded", savedAt: "2024-01-01T00:00:00Z" },
  ]));
  assert.strictEqual(r.source, "Omnivore");
  assert.deepStrictEqual(r.items.map((x) => [x.title, x.read, x.tags]), [["O2", false, []], ["O1", true, ["Tech", "Later"]]]);
});

test("a file that isn't an export is left alone", () => {
  assert.strictEqual(I.parse("notes.csv", "a,b\n1,2"), null);
  assert.strictEqual(I.parse("notes.md", "https://a.example"), null);
});

test("OPML out: feeds escaped, read back by the same parser in a browser", () => {
  const text = I.writeOpml([{ url: "https://a.example/feed?x=1&y=2", title: 'Tom & "Jerry"', link: "https://a.example" }]);
  assert.ok(text.startsWith('<?xml version="1.0"'));
  assert.ok(text.includes('xmlUrl="https://a.example/feed?x=1&amp;y=2"'));
  assert.ok(text.includes('title="Tom &amp; &quot;Jerry&quot;"'));
  assert.ok(text.includes('htmlUrl="https://a.example"'));
});

test("a file that isn't OPML isn't read as feeds", () => {
  assert.strictEqual(I.opml("<rss><channel></channel></rss>"), null);
  assert.strictEqual(I.opml(""), null);
});

console.log("\n" + passed + " passed");
