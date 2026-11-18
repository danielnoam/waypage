// Kiwix packs (src/zim.js): `node test/zim.test.js`. Two small packs made
// by test/fixtures/zim/make.py: the old layout with xz clusters (namespaces
// A, I, M) and the new one with Zstandard (everything in C), as libzim
// writes it.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

global.window = { Waypage: {} };
global.document = { baseURI: pathToFileURL(path.join(__dirname, "..") + "/").href };
require("../src/zim.js");
const Z = window.Waypage.zim;

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + (e.stack || e.message)); process.exitCode = 1; }
}
const pack = (name) => Z.open(new Blob([fs.readFileSync(path.join(__dirname, "fixtures", "zim", name))]));
const text = (b) => new TextDecoder().decode(b);

(async () => {
  for (const [name, ns] of [["test-xz.zim", "A"], ["test-zstd.zim", "C"]]) {
    await test(name + ": metadata, main page and its picture", async () => {
      const z = await pack(name);
      assert.strictEqual(await z.meta("Title"), "Test Wikipedia");
      assert.strictEqual(await z.meta("Language"), "eng");
      assert.strictEqual(await z.main(), ns + "/Main_Page");
      const icon = await z.icon();
      assert.ok(icon && icon[0] === 0x89 && icon[1] === 0x50);
      const page = await z.get(ns + "/Main_Page");
      assert.strictEqual(page.mime, "text/html");
      assert.ok(text(page.bytes).includes("Welcome to the test pack"));
    });
    await test(name + ": a redirect goes to its article", async () => {
      const z = await pack(name);
      const page = await z.get(ns + "/Lighthouses");
      assert.strictEqual(page.path, ns + "/Lighthouse");
      assert.ok(text(page.bytes).includes("guides ships"));
      assert.strictEqual(await z.get(ns + "/Nowhere"), null);
    });
    await test(name + ": links and pictures resolve inside the pack", async () => {
      const z = await pack(name);
      const from = ns + "/Lighthouse";
      assert.deepStrictEqual(z.resolve(from, "Tide"), { path: ns + "/Tide", hash: "" });
      assert.deepStrictEqual(z.resolve(from, "Ship#Hulls"), { path: ns + "/Ship", hash: "Hulls" });
      assert.strictEqual(z.resolve(from, "https://en.wikipedia.org/wiki/X"), null);
      const pic = ns === "A" ? z.resolve(from, "../I/light.png") : z.resolve(from, "I/light.png");
      assert.strictEqual(pic.path, ns === "A" ? "I/light.png" : "C/I/light.png");
      const img = await z.get(pic.path);
      assert.strictEqual(img.mime, "image/png");
      assert.strictEqual(img.bytes[1], 0x50);
    });
    await test(name + ": title search, whatever the case typed", async () => {
      const z = await pack(name);
      const got = (await z.search("light", 10)).map((x) => x.title);
      assert.ok(got.includes("Lighthouse"), got.join());
      assert.ok(got.includes("Lightning"), got.join());
      assert.ok(!got.includes("Tide"));
      assert.deepStrictEqual((await z.search("TIDE", 5)).map((x) => x.path), [ns + "/Tide"]);
      assert.deepStrictEqual(await z.search("zzz", 5), []);
    });
  }
  await test("not a pack: says so", async () => {
    await assert.rejects(Z.open(new Blob([new Uint8Array(200)])), /not a ZIM/);
  });
  console.log(passed + " passed");
})();
