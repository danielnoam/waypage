// A PowerPoint deck as a PDF (1.49.0), the parts that need no browser:
// `node test/pptx.test.js`. Drawing the slides needs a canvas, which the
// browser run (test/ui.test.js) covers, words and all.
const assert = require("assert");
const { pptxBytes } = require("./pptx-fixture");

global.window = { Waypage: {} };
try { require("../src/backup.js"); } catch (e) { /* needs more of a browser than this; kindOf is then left to the browser run */ }
require("../src/files.js");
require("../src/pptx.js");
const W = window.Waypage;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

(async () => {
  await test("the PDF written from slide pictures has every object where its table says", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const page = (text) => ({ w: 720, h: 405, jpeg, iw: 1600, ih: 900, texts: text ? [{ x: 40, y: 80, size: 24, text, width: 200 }] : [] });
    const blob = W.pptx.writePdf([page("Quarterly Review"), page("")]);
    const s = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    assert.ok(s.startsWith("%PDF-1.5"));
    assert.ok(s.trimEnd().endsWith("%%EOF"));
    const xref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
    assert.strictEqual(s.slice(xref, xref + 4), "xref");
    const lines = s.slice(xref).split("\n");
    const count = Number(lines[1].split(" ")[1]);
    assert.strictEqual(count, 7 + 2 * 3);
    for (let n = 1; n < count; n++) {
      const off = Number(lines[2 + n].slice(0, 10));
      assert.ok(s.slice(off).startsWith(n + " 0 obj"), "object " + n + " at " + off);
    }
    assert.ok(s.includes("/Count 2"));
    // The words are in the text layer as UTF-16 hex, drawn invisibly.
    assert.ok(s.includes("3 Tr"));
    assert.ok(s.includes("<" + [..."Quarterly Review"].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("") + ">"));
  });

  await test("a deck is told from a comic and an EPUB by its presentation part", async () => {
    if (!W.backup || !W.backup.zipEntries) return;
    const bytes = pptxBytes();
    const file = new Blob([bytes]);
    file.name = "Deck.pptx";
    assert.strictEqual(await W.files.kindOf(file), "pptx");
  });

  console.log(passed + " passed");
})();
