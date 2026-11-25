// The Calibre extension: a library's metadata.db read
// (test/fixtures/calibre/, built by make-library.py), and the place in a
// phone-sized browser with the phone's Files plugin stood in for by a
// folder held in memory. `node test/calibre.test.js`. Needs Playwright.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function playwright() {
  const tries = ["playwright", "/opt/node-tools/node_modules/playwright"];
  if (process.env.PLAYWRIGHT_MODULE) tries.unshift(process.env.PLAYWRIGHT_MODULE);
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}
const pw = playwright();
if (!pw) {
  console.log("  skip - Playwright isn't installed here (set PLAYWRIGHT_MODULE to its path)");
  process.exit(0);
}

const PORT = 5000 + Math.floor(Math.random() * 300);
const ROOT = "http://localhost:" + PORT + "/";
const DB = [...fs.readFileSync(path.join(__dirname, "fixtures", "calibre", "metadata.db"))];

let passed = 0;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + String(e.message).split("\n").slice(0, 4).join("\n    ")); process.exitCode = 1; }
}
function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

// A small EPUB, as a zip with nothing compressed.
function zipOf(files) {
  const table = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = [], central = [];
  let at = 0;
  for (const [name, text] of files) {
    const n = Buffer.from(name), d = Buffer.from(text), c = crc(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt32LE(c, 16); e.writeUInt32LE(d.length, 20); e.writeUInt32LE(d.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(at, 42);
    parts.push(h, n, d); central.push(e, n);
    at += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, cd, end]);
}
const epub = (title) => [...zipOf([
  ["mimetype", "application/epub+zip"],
  ["META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
  ["OEBPS/book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + title + '</dc:title><dc:language>en</dc:language></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'],
  ["OEBPS/a.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>' + "Words of the book. ".repeat(60) + "</p></body></html>"],
])];

// A phone with the Calibre extension on and a folder of the library in memory.
async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route((u) => !u.href.startsWith(ROOT), (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.ext && typeof goPlace === "function" && window.loaded !== false);
  await p.evaluate(async (folder) => {
    const files = new Map(Object.entries(folder).map(([k, v]) => [k, new Uint8Array(v)]));
    const F = Waypage.platform.files;
    Object.defineProperty(F, "canPickFolder", { get: () => true });
    Object.defineProperty(F, "canLink", { get: () => true });
    window.asked = [];
    F.pickFolder = async () => ({ ref: "tree:cal", name: "Calibre Library" });
    F.child = async (tree, at) => { window.asked.push(at); return files.has(at) ? tree + "/" + at : null; };
    F.info = async (ref) => { const k = ref.replace(/^tree:cal\//, ""); return files.has(k) ? { ok: true, name: k.split("/").pop(), size: files.get(k).length } : { ok: false }; };
    F.blob = async (ref) => { const k = ref.replace(/^tree:cal\//, ""); if (!files.has(k)) throw new Error("gone"); return new Blob([files.get(k)]); };
    F.release = () => {};
    await Waypage.ext.turnOn("calibre");
  }, {
    "metadata.db": DB,
    "Ursula K. Le Guin/A Wizard of Earthsea (1)/A Wizard of Earthsea - Ursula K. Le Guin.epub": epub("A Wizard of Earthsea"),
    "Ursula K. Le Guin/The Tombs of Atuan (2)/The Tombs of Atuan - Ursula K. Le Guin.epub": epub("The Tombs of Atuan"),
  });
  return { ctx, p };
}

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("metadata.db reads as books: authors, series and its number, tags, the best format, the note as text", async () => {
      const { ctx, p } = await phone(browser);
      const books = await p.evaluate((db) => Waypage.calibre.parse(new Uint8Array(db)), DB);
      await ctx.close();
      assert.strictEqual(books.length, 3);
      const w = books.find((b) => b.id === 1);
      assert.strictEqual(w.title, "A Wizard of Earthsea");
      assert.strictEqual(w.by, "Ursula K. Le Guin");
      assert.strictEqual(w.series, "Earthsea");
      assert.strictEqual(w.index, 1);
      assert.deepStrictEqual(w.tags, ["Fantasy"]);
      assert.deepStrictEqual(w.formats.map((f) => f.format), ["EPUB", "PDF"], "EPUB first");
      assert.strictEqual(w.about, "A boy called Ged & a shadow.");
      assert.strictEqual(w.uuid, "uuid-1");
      assert.ok(w.cover);
      assert.strictEqual(books.find((b) => b.id === 2).index, 2);
      assert.deepStrictEqual(books.find((b) => b.id === 3).formats, [], "a format Waypage can't open is left out");
    });

    await test("the sidebar's Calibre place picks the folder, lists its books, and sorts and filters them", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("calibre"));
      await p.locator('#calibre .btn-primary:has-text("Pick the folder")').click();
      await p.locator("#calibre .dz-book").first().waitFor();
      assert.strictEqual(await p.locator("#placeTitle").textContent(), "Calibre");
      assert.deepStrictEqual(await p.locator("#calibre .dz-bt").allTextContents(), ["The Tombs of Atuan", "Dune", "A Wizard of Earthsea"], "recently added first");
      assert.match(await p.locator("#calibre .dz-foot").textContent(), /3 books in Calibre Library/);
      await p.locator("#calibre .dz-search input").fill("earthsea");
      assert.deepStrictEqual(await p.locator("#calibre .dz-bt").allTextContents(), ["The Tombs of Atuan", "A Wizard of Earthsea"], "series names are searched too");
      await p.locator("#calibre .dz-search input").fill("");
      await p.locator("#calibre .dz-tools .dropdown").first().locator(".dropdown-btn").click();
      await p.locator('[role="option"]:has-text("Series")').click();
      assert.deepStrictEqual(await p.locator("#calibre .dz-bt").allTextContents(), ["A Wizard of Earthsea", "The Tombs of Atuan", "Dune"]);
      const errors = p.errors;
      await ctx.close();
      assert.deepStrictEqual(errors, []);
    });

    await test("Read it brings the book in read from the folder, in its series' collection with its tags; the grid marks it", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("calibre"));
      await p.locator('#calibre .btn-primary:has-text("Pick the folder")').click();
      await p.locator('#calibre .dz-book:has-text("Tombs of Atuan")').click();
      await p.locator('#menuSheet[data-kind="calibreBook"]:not([hidden])').waitFor();
      const sheet = await p.locator("#menuSheet").textContent();
      assert.match(sheet, /Earthsea, book 2/);
      assert.match(sheet, /EPUB · Fantasy/);
      await p.locator('#menuSheet .btn-primary:has-text("Read it")').click();
      await p.waitForFunction(() => state.pages.some((x) => x.calibre === "uuid-2"));
      const page = await p.evaluate(() => { const x = state.pages.find((q) => q.calibre === "uuid-2"); return { link: x.link, folder: x.folder, tags: x.tags, title: x.title, byline: x.byline }; });
      assert.strictEqual(page.link, "tree:cal/Ursula K. Le Guin/The Tombs of Atuan (2)/The Tombs of Atuan - Ursula K. Le Guin.epub");
      assert.strictEqual(page.folder, "Earthsea");
      assert.deepStrictEqual(page.tags, ["Fantasy"]);
      assert.strictEqual(page.title, "The Tombs of Atuan");
      assert.strictEqual(page.byline, "Ursula K. Le Guin");
      // The book is in the library a moment before the reader is in the
      // history: Back before then leaves the app, and the page with it.
      await p.waitForFunction(() => history.state && history.state.view === "reader");
      await p.evaluate(() => history.back());
      await p.evaluate(() => goPlace("calibre"));
      await p.locator('#calibre .dz-book[aria-label="The Tombs of Atuan, in your library"]').waitFor();
      // Copy: no link, the file kept in the library.
      await p.locator('#calibre .dz-book:has-text("Wizard of Earthsea")').click();
      await p.locator('#menuSheet .btn-quiet:has-text("Copy into your Library")').click();
      await p.waitForFunction(() => state.pages.some((x) => x.calibre === "uuid-1"));
      const copied = await p.evaluate(() => { const x = state.pages.find((q) => q.calibre === "uuid-1"); return { link: x.link || null, folder: x.folder }; });
      await ctx.close();
      assert.deepStrictEqual(copied, { link: null, folder: "Earthsea" });
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
