// Kiwix packs in the reader and a book added as clips (2026-11), in a
// phone-sized browser: a pack from test/fixtures/zim/ opens at its main
// page, its links and Back stay in the pack, Find searches its titles,
// Save this article makes a clip; an EPUB becomes a collection, a clip a
// chapter. `node test/kiwix.test.js`. Needs Playwright, like ui.test.js.
const assert = require("assert");
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

const PORT = 6300 + Math.floor(Math.random() * 500);
const ROOT = "http://localhost:" + PORT + "/";

let passed = 0;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + String(e.stack || e.message).split("\n").slice(0, 6).join("\n    ")); process.exitCode = 1; }
}

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

function zipOf(files) {
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = [], central = [];
  let at = 0;
  for (const [name, text] of files) {
    const n = Buffer.from(name), d = Buffer.isBuffer(text) ? text : Buffer.from(text), c = crc(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt32LE(c, 16); e.writeUInt32LE(d.length, 20); e.writeUInt32LE(d.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(at, 42);
    parts.push(h, n, d); central.push(e, n);
    at += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, cd, end]);
}
// A book in three files: a short title page, then two chapters.
const xhtml = (body) => '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body>' + body + "</body></html>";
const BOOK = zipOf([
  ["mimetype", "application/epub+zip"],
  ["META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
  ["OEBPS/book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Two Rivers</dc:title><dc:creator>A. Writer</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="t" href="t.xhtml" media-type="application/xhtml+xml"/><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="t"/><itemref idref="a"/><itemref idref="b"/></spine></package>'],
  ["OEBPS/t.xhtml", xhtml("<h1>Two Rivers</h1><p>A. Writer</p>")],
  ["OEBPS/a.xhtml", xhtml("<h2>The Spring</h2><p>" + "Water rises in the hills. ".repeat(40) + "</p>")],
  ["OEBPS/b.xhtml", xhtml("<h2>The Sea</h2><p>" + "The river meets the sea. ".repeat(40) + "</p>")],
]);

async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.addInitScript(() => { localStorage.setItem("waypage.animations", "false"); });
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  await p.goto(ROOT);
  await p.waitForFunction(() => typeof openFile === "function" && loaded);
  return { ctx, p };
}
const frameText = (p, sel) => p.evaluate((s) => { const n = $("readerFrame").contentDocument.querySelector(s); return n ? n.textContent : null; }, sel);

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    for (const name of ["test-zstd.zim", "test-xz.zim"]) {
      await test(name + ": opens at its main page; links, Back and Search stay in the pack; an article saves as a clip", async () => {
        const { ctx, p } = await phone(browser);
        // The phone's lasting hold on the file, stood in for.
        await p.evaluate(async (name) => {
          const file = new File([await (await fetch("test/fixtures/zim/" + name)).blob()], name);
          Waypage.platform.files.blob = async () => file;
          await openFile(file, null, true, "ref:" + name);
        }, name);
        await p.waitForFunction(() => state.open && $("readerFrame").contentDocument.querySelector(".co-body"));
        const pack = await p.evaluate(() => ({ title: state.pages[0].title, kind: state.pages[0].file.kind, link: state.pages[0].link, marks: $("readerMarks").hidden }));
        assert.deepStrictEqual(pack, { title: "Test Wikipedia", kind: "zim", link: "ref:" + name, marks: true });
        assert.strictEqual(await frameText(p, "h1"), "Main Page");
        // A link to another article reads it here, its picture from the pack.
        await p.frameLocator("#readerFrame").locator("a", { hasText: "Lighthouse" }).first().click();
        await p.waitForFunction(() => (($("readerFrame").contentDocument.querySelector("h1") || {}).textContent) === "Lighthouse");
        await p.waitForFunction(() => { const i = $("readerFrame").contentDocument.querySelector("img"); return i && /^blob:/.test(i.src); });
        assert.match(await frameText(p, ".co-body"), /Text from Wikipedia, CC BY-SA 4.0/);
        // A link out of the pack is a link out, as in any clip.
        await p.frameLocator("#readerFrame").locator("a", { hasText: "Fresnel" }).click();
        await p.locator('#readingSheet:not([hidden])').waitFor();
        assert.match(await p.locator("#readingSheet").textContent(), /en\.wikipedia\.org\/wiki\/Fresnel_lens/);
        await p.goBack();
        await p.waitForFunction(() => !state.sheet);
        await p.frameLocator("#readerFrame").locator("a", { hasText: "tides" }).click();
        await p.waitForFunction(() => (($("readerFrame").contentDocument.querySelector("h1") || {}).textContent) === "Tide");
        await p.goBack();
        await p.waitForFunction(() => (($("readerFrame").contentDocument.querySelector("h1") || {}).textContent) === "Lighthouse");
        await p.goBack();
        await p.waitForFunction(() => (($("readerFrame").contentDocument.querySelector("h1") || {}).textContent) === "Main Page");
        // Find searches the pack's titles.
        await p.evaluate(() => openFind());
        await p.locator("#readingSheet input[type=search]").fill("ship");
        await p.locator("#readingSheet .pack-hits button").first().waitFor();
        assert.deepStrictEqual(await p.locator("#readingSheet .pack-hits button").allTextContents(), ["Ship"]);
        await p.locator("#readingSheet .pack-hits button").click();
        await p.waitForFunction(() => (($("readerFrame").contentDocument.querySelector("h1") || {}).textContent) === "Ship");
        // It reopens where it was left.
        assert.strictEqual(await p.evaluate(() => state.pages[0].zim.at), (name === "test-xz.zim" ? "A" : "C") + "/Ship");
        await p.evaluate(() => packSave(state.open));
        await p.waitForFunction(() => state.pages.length === 2);
        const clip = await p.evaluate(() => ({ title: state.pages[0].title, url: state.pages[0].url, licence: state.pages[0].licence, file: !!state.pages[0].file }));
        assert.deepStrictEqual(clip, { title: "Ship", url: "https://en.wikipedia.org/wiki/Ship", licence: "wikipedia", file: false });
        assert.deepStrictEqual(p.errors, []);
        await ctx.close();
      });
    }

    await test("a book's + as clips: a collection, a clip for each chapter, a short title page joined to the next", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        Waypage.platform.fetchBytes = async (url) => ({ status: 200, url, type: "application/epub+zip", blob: new Blob([bytes]) });
        Object.defineProperty(Waypage.platform, "canReadPages", { value: true, configurable: true });
        await dzAddGo({ id: "pg1", title: "Two Rivers", by: "A. Writer", book: true, epub: "https://www.gutenberg.org/ebooks/1.epub3.images", url: "https://www.gutenberg.org/ebooks/1", site: "Project Gutenberg" }, { as: "clips", where: "app" });
      }, BOOK.toString("base64"));
      const got = await p.evaluate(() => folderPages("Two Rivers").map((x) => [x.title, x.byline]));
      assert.deepStrictEqual(got, [["Two Rivers", "A. Writer"], ["The Sea", "A. Writer"]]);
      const first = await p.evaluate(async () => C.store.readPage(folderPages("Two Rivers")[0].id));
      assert.match(first, /The Spring/, "the title page went in with the first chapter");
      assert.deepStrictEqual(p.errors, []);
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
