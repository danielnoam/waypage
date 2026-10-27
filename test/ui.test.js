// The app itself, driven in a browser (1.7.0, 1.8.0): `node test/ui.test.js`.
// Starts server.js, saves test/fixtures/article.html (same origin, so the
// browser's fetch can reach it), reads it, highlights it, searches for it,
// and opens the app in every theme at phone and desktop width, failing on
// any error the page logs. Needs Playwright with a Chromium; where there
// is none it says so and passes, since the app has no dependencies and
// this is a check for a machine that has it, not a requirement.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
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

let passed = 0;
const fails = [];
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { fails.push(name); console.error("  FAIL - " + name); console.error("    " + (process.env.ONLY ? String(e.message) : String(e.message).split("\n")[0])); process.exitCode = 1; }
}

const PORT = 5300 + Math.floor(Math.random() * 500);
const ROOT = "http://localhost:" + PORT + "/";
const ARTICLE = ROOT + "test/fixtures/article.html";
const PICTURES = ROOT + "test/fixtures/pictures.html";
const NOTES = ROOT + "test/fixtures/notes.html";
const THEMES = ["paper", "sepia", "night"];

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

// A page that collects what goes wrong in it.
async function page(browser, width, theme) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 800 }, serviceWorkers: "block" });
  if (theme) await ctx.addInitScript((t) => { try { localStorage.setItem("waypage.theme", JSON.stringify(t)); } catch (e) { /* none */ } }, theme);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  // Playwright reaching into the sandboxed frame is itself a blocked script,
  // and saving looks for the test site's icon, which it hasn't got.
  p.on("console", (m) => { if (m.type() === "error" && !/^Blocked script execution in .about:srcdoc/.test(m.text()) && !/favicon/.test(m.location().url || "")) p.errors.push(m.text() + (m.location().url ? " (" + m.location().url + ")" : "")); });
  p.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) p.errors.push(r.status() + " " + r.url()); });
  await p.goto(ROOT);
  await p.waitForSelector("#saveUrl");
  return p;
}
// Waits until fn (run in the page) is true. waitForFunction doesn't wait
// for a promise it is handed.
async function until(p, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (!(await p.evaluate(fn, arg))) {
    if (Date.now() - t0 > ms) throw new Error("timed out: " + String(fn).slice(0, 80));
    await p.waitForTimeout(200);
  }
}
const frameText = (p) => p.frameLocator("#readerFrame").locator("body");


// A three-page PDF with two bookmarks, Part One on page 1 and Part Two on
// page 3, its offsets counted so pdf.js reads it without repair.
function pdfBytes() {
  const objs = [];
  const page = (n) => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents " + (6 + n) + " 0 R /Resources << /Font << /F1 10 0 R >> >> >>";
  objs[1] = "<< /Type /Catalog /Pages 2 0 R /Outlines 11 0 R /PageMode /UseOutlines >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>";
  for (let n = 0; n < 3; n++) {
    objs[3 + n] = page(n);
    const said = ["The night train left the city at nine and nobody spoke.", "By morning the hills were white and the stove had gone out.", "In the second part the river freezes and the town waits."][n];
    const text = "BT /F1 14 Tf 40 340 Td (" + said + ") Tj 0 -20 Td (" + said.split("").reverse().join("") + ") Tj ET";
    objs[6 + n] = "<< /Length " + text.length + " >>\nstream\n" + text + "\nendstream";
  }
  objs[9] = "<< >>";
  objs[10] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[11] = "<< /Type /Outlines /First 12 0 R /Last 13 0 R /Count 2 >>";
  objs[12] = "<< /Title (Part One) /Parent 11 0 R /Next 13 0 R /Dest [3 0 R /XYZ 0 400 0] >>";
  objs[13] = "<< /Title (Part Two) /Parent 11 0 R /Prev 12 0 R /Dest [5 0 R /XYZ 0 400 0] >>";
  let out = "%PDF-1.4\n";
  const at = [];
  for (let i = 1; i < objs.length; i++) { at[i] = out.length; out += i + " 0 obj\n" + objs[i] + "\nendobj\n"; }
  const xref = out.length;
  out += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
  for (let i = 1; i < objs.length; i++) out += String(at[i]).padStart(10, "0") + " 00000 n \n";
  out += "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return Buffer.from(out, "latin1");
}

// A small EPUB, stored (not deflated): chapter titles are plain styled
// paragraphs, as many books have them, and the book's nav lists them.
function epubBytes() { return zipOf(EPUB_FILES); }
// A long linked book for the lazy reader (1.29.0): 200 chapters of 1600
// characters and a picture each, over the LONG line in reader.js.
function longEpubBytes() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const files = [EPUB_FILES[0], EPUB_FILES[1]];
  const items = [], spine = [];
  for (let i = 0; i < 200; i++) {
    const pic = '<p><img src="../pic.png" alt=""/></p>';
    files.push(["OEBPS/text/c" + i + ".xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h2>Chapter ' + (i + 1) + "</h2>" + pic + "<p>" + ("Words of chapter " + (i + 1) + ". ").repeat(80) + "</p></body></html>"]);
    items.push('<item id="c' + i + '" href="text/c' + i + '.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="c' + i + '"/>');
  }
  files.push(["OEBPS/pic.png", png]);
  files.push(["OEBPS/book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Long Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="pic" href="pic.png" media-type="image/png"/>' + items.join("") + "</manifest><spine>" + spine.join("") + "</spine></package>"]);
  return zipOf(files);
}
const EPUB_FILES = [
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ["OEBPS/book.opf", '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Plain Chapters</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="a" href="text/a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="text/b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'],
    ["OEBPS/nav.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/a.xhtml">The First Part</a><ol><li><a href="text/a.xhtml#later">A Later Scene</a></li></ol></li><li><a href="text/b.xhtml">The Second Part</a></li></ol></nav></body></html>'],
    ["OEBPS/text/a.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p class="ct">ONE</p><p>' + "Words of the first part. ".repeat(40) + '</p><p id="later">' + "A later scene begins. ".repeat(40) + "</p></body></html>"],
    ["OEBPS/text/b.xhtml", '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p class="ct">TWO</p><p>' + "Words of the second part. ".repeat(40) + "</p></body></html>"],
];
// A small MOBI (1.42.0), the old Mobipocket kind: uncompressed text in
// 4 KB records, a contents page found through the guide, a link by
// filepos, a picture by recindex and the same picture as the cover.
function mobiBytes(locked) {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const pos = (n) => String(n).padStart(10, "0");
  let html = '<html><head><guide><reference type="toc" title="Contents" filepos=TOC /></guide></head><body>'
    + '<p>Contents</p><p><a filepos=ONE >The Opening</a></p><p><a filepos=TWO >The Crossing</a></p><mbp:pagebreak/>'
    + '<h2>The Opening</h2><p>' + "Words of the opening. ".repeat(30) + '</p><p><img recindex="00001"></p><p><a filepos=TWO >Go to the crossing</a></p><mbp:pagebreak/>'
    + '<h2>The Crossing</h2><p>' + "Words of the crossing. ".repeat(30) + "</p></body></html>";
  const marks = { TOC: "<p>Contents", ONE: "<h2>The Opening", TWO: "<h2>The Crossing" };
  // Each stand-in is as long as the number it becomes, so no offset moves.
  for (const [k, at] of Object.entries(marks)) html = html.split("filepos=" + k + " ").join("filepos=" + k.padEnd(10, "_") + " ");
  for (const [k, at] of Object.entries(marks)) html = html.split(k.padEnd(10, "_")).join(pos(Buffer.from(html.slice(0, html.indexOf(at))).length));
  const text = Buffer.from(html);
  const texts = [];
  for (let i = 0; i < text.length; i += 4096) texts.push(text.subarray(i, i + 4096));
  const exth = [[100, Buffer.from("Ada Writer")], [503, Buffer.from("A Kindle Book")], [201, (() => { const b = Buffer.alloc(4); b.writeUInt32BE(0); return b; })()]];
  const exthBody = Buffer.concat(exth.map(([t, d]) => { const h = Buffer.alloc(8); h.writeUInt32BE(t, 0); h.writeUInt32BE(d.length + 8, 4); return Buffer.concat([h, d]); }));
  const exthHead = Buffer.alloc(12); exthHead.write("EXTH", 0); exthHead.writeUInt32BE(12 + exthBody.length, 4); exthHead.writeUInt32BE(exth.length, 8);
  const title = Buffer.from("A Kindle Book");
  const rec0 = Buffer.alloc(248);
  rec0.writeUInt16BE(1, 0); rec0.writeUInt32BE(text.length, 4); rec0.writeUInt16BE(texts.length, 8); rec0.writeUInt16BE(4096, 10); rec0.writeUInt16BE(locked ? 2 : 0, 12);
  rec0.write("MOBI", 16); rec0.writeUInt32BE(232, 20); rec0.writeUInt32BE(2, 24); rec0.writeUInt32BE(65001, 28); rec0.writeUInt32BE(1234, 32); rec0.writeUInt32BE(6, 36);
  const exthAll = Buffer.concat([exthHead, exthBody]);
  rec0.writeUInt32BE(248 + exthAll.length, 84); rec0.writeUInt32BE(title.length, 88); rec0.writeUInt8(9, 95);
  rec0.writeUInt32BE(1 + texts.length, 108); rec0.writeUInt32BE(0x40, 128); rec0.writeUInt32BE(0, 240); rec0.writeUInt32BE(0xffffffff, 244);
  const records = [Buffer.concat([rec0, exthAll, title, Buffer.alloc(4)]), ...texts, png];
  const head = Buffer.alloc(78 + records.length * 8 + 2);
  head.write("A_Kindle_Book", 0); head.write("BOOK", 60); head.write("MOBI", 64); head.writeUInt16BE(records.length, 76);
  let at = head.length;
  records.forEach((r, i) => { head.writeUInt32BE(at, 78 + i * 8); head.writeUInt32BE(i * 2, 82 + i * 8); at += r.length; });
  return Buffer.concat([head, ...records]);
}
// A small FB2 (1.42.0) in windows-1251, with a cover, two sections, a
// note and a poem.
function fb2Bytes() {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const xml = '<?xml version="1.0" encoding="windows-1251"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">'
    + '<description><title-info><author><first-name>Иван</first-name><last-name>Петров</last-name></author><book-title>Зимняя книга</book-title><lang>ru</lang><coverpage><image l:href="#cover.png"/></coverpage></title-info></description>'
    + '<body><section><title><p>Первая глава</p></title><p>' + "Слова первой главы. ".repeat(30) + '<a l:href="#n1" type="note">1</a></p><poem><stanza><v>Строка одна</v><v>Строка две</v></stanza></poem></section>'
    + '<section><title><p>Вторая глава</p></title><p><emphasis>' + "Слова второй главы. ".repeat(30) + "</emphasis></p></section></body>"
    + '<body name="notes"><section id="n1"><title><p>1</p></title><p>Примечание.</p></section></body>'
    + '<binary id="cover.png" content-type="image/png">' + png + "</binary></FictionBook>";
  const cp = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюя";
  return Buffer.from([...xml].map((c) => (cp.includes(c) ? 0xc0 + cp.indexOf(c) : c.charCodeAt(0))));
}
// A stored zip of [name, text or Buffer] pairs.
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

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const p = await page(browser, 390);

    await test("the library says it's opening before it's read", async () => {
      const html = await (await fetch(ROOT)).text();
      assert.ok(/class="lib-loading/.test(html));
    });

    await test("the empty library loads with no errors", async () => {
      await p.waitForTimeout(300);
      assert.deepStrictEqual(p.errors, [], p.errors.join(" | "));
    });

    await test("a link saves and shows as a card", async () => {
      await p.fill("#saveUrl", ARTICLE);
      await p.press("#saveUrl", "Enter");
      await p.locator(".page-card .card-title", { hasText: "The Long Haul Flight" }).waitFor({ timeout: 10000 });
    });

    await test("the clip opens in the reader, its text in the sandboxed frame", async () => {
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await p.locator("#readerView:not([hidden])").waitFor();
      await frameText(p).getByText("oceanic track").waitFor();
      const sandbox = await p.getAttribute("#readerFrame", "sandbox");
      assert.ok(sandbox !== null && !/allow-scripts/.test(sandbox), "sandbox: " + sandbox);
      assert.strictEqual(await frameText(p).getByText("Copyright example").count(), 0, "the site's footer was kept");
    });

    await test("selected words can be highlighted", async () => {
      await p.frameLocator("#readerFrame").locator("p", { hasText: "marmalade" }).evaluate((el) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes("marmalade sky"));
        const at = t.data.indexOf("marmalade sky");
        const r = el.ownerDocument.createRange();
        r.setStart(t, at);
        r.setEnd(t, at + "marmalade sky".length);
        const sel = el.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      await p.locator(".read-here .sel-mark:not([hidden])").click();
      const marks = p.frameLocator("#readerFrame").locator("mark.co-mark");
      await marks.first().waitFor();
      assert.strictEqual((await marks.allTextContents()).join(""), "marmalade sky");
    });

    await test("a tap on a highlight opens it, and a note keeps", async () => {
      await p.frameLocator("#readerFrame").locator("mark.co-mark").first().click();
      await p.locator("#readingSheet:not([hidden]) .mark-note-field").fill("Dawn over the ocean");
      await p.locator("#readingSheet .export-back", { hasText: "All highlights" }).click();
      await p.locator("#readingSheet .mark-note", { hasText: "Dawn over the ocean" }).waitFor();
      await p.goBack();
      await p.locator("#readingSheet").waitFor({ state: "hidden" });
    });

    await test("the highlight is still there after the app restarts", async () => {
      await p.reload();
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      const marks = p.frameLocator("#readerFrame").locator("mark.co-mark.co-noted");
      await marks.first().waitFor();
      assert.strictEqual((await marks.allTextContents()).join(""), "marmalade sky");
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("Highlights in the sidebar lists every highlight, and a tap opens the clip", async () => {
      await p.click("#sideBtn");
      await p.locator("#sidebar .side-item", { hasText: "Highlights" }).click();
      await p.locator("#sidebar").waitFor({ state: "hidden" });
      assert.strictEqual(await p.textContent("#placeTitle"), "Highlights");
      const row = p.locator("#highlights .mark-row", { hasText: "marmalade sky" });
      await row.locator(".mark-note", { hasText: "Dawn over the ocean" }).waitFor();
      await p.fill("#highlights .hl-search input", "zeppelinxyz");
      await p.locator("#highlights .hl-none").waitFor();
      await p.fill("#highlights .hl-search input", "dawn");
      await row.click();
      await p.locator("#readerView:not([hidden])").waitFor();
      await p.frameLocator("#readerFrame").locator("mark.co-mark").first().waitFor();
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
      assert.strictEqual(await p.textContent("#placeTitle"), "Highlights");
      await p.click("#sideBtn");
      await p.locator("#sidebar .side-item", { hasText: "Library" }).click();
      await p.locator("#sidebar").waitFor({ state: "hidden" });
    });

    await test("Translate opens the selected words on the web, and there is no Look up (1.11.1)", async () => {
      await p.evaluate(() => { window.__opened = []; window.Waypage.platform.openOutside = (u) => window.__opened.push(u); });
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await frameText(p).getByText("oceanic track").waitFor();
      await p.frameLocator("#readerFrame").locator("p", { hasText: "oceanic track" }).evaluate((el) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes("oceanic"));
        const r = el.ownerDocument.createRange();
        r.setStart(t, t.data.indexOf("oceanic"));
        r.setEnd(t, t.data.indexOf("oceanic") + "oceanic".length);
        const sel = el.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      await p.locator(".read-here .sel-translate:not([hidden])").click();
      const opened = await p.evaluate(() => window.__opened);
      assert.ok(/translate\.google\.com\/.*text=oceanic$/.test(opened[0] || ""), "opened " + opened);
      assert.strictEqual(await p.locator(".read-here .sel-look").count(), 0);
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("a highlight takes the colour picked on the bar, changes in its sheet, and Highlights shows a colour at a time (1.42.0)", async () => {
      const q = await page(browser, 390);
      await q.fill("#saveUrl", ARTICLE);
      await q.press("#saveUrl", "Enter");
      await q.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await frameText(q).getByText("oceanic track").waitFor();
      const pick = (words) => q.frameLocator("#readerFrame").locator("p", { hasText: words }).first().evaluate((el, w) => {
        const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes(w));
        const r = el.ownerDocument.createRange();
        r.setStart(t, t.data.indexOf(w));
        r.setEnd(t, t.data.indexOf(w) + w.length);
        const sel = el.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }, words);
      await pick("oceanic track");
      await q.locator(".read-here .sel-color:not([hidden])").click();
      await q.locator('.read-here.picking .sel-swatch[aria-label="Green"]').click();
      await q.frameLocator("#readerFrame").locator("mark.co-mark.co-c-green").first().waitFor();
      await q.waitForTimeout(700);
      await pick("marmalade sky");
      // The next one takes the colour picked last.
      await q.locator(".read-here .sel-mark:not([hidden])").click();
      await until(q, () => document.getElementById("readerFrame").contentDocument.querySelectorAll("mark.co-c-green").length >= 2);
      await q.frameLocator("#readerFrame").locator("mark.co-mark", { hasText: "marmalade" }).first().click();
      await q.locator('#readingSheet:not([hidden]) .mark-swatch[aria-label="Blue"]').click();
      await q.frameLocator("#readerFrame").locator("mark.co-mark.co-c-blue", { hasText: "marmalade" }).first().waitFor();
      await q.locator('#readingSheet .mark-swatch[aria-label="Blue"][aria-checked="true"]').waitFor();
      const kept = await q.evaluate(async () => (await window.Waypage.store.readIndex()).flatMap((p) => p.marks || []).map((m) => m.color).sort());
      assert.deepStrictEqual(kept, ["blue", "green"]);
      await q.goBack();
      await q.goBack();
      await q.click("#sideBtn");
      await q.locator("#sidebar .side-item", { hasText: "Highlights" }).click();
      await q.locator("#highlights .mark-filters .chip", { hasText: "Blue" }).click();
      assert.strictEqual(await q.locator("#highlights .mark-row").count(), 1);
      assert.ok(/marmalade/.test(await q.locator("#highlights .mark-row").first().textContent()));
      await q.locator("#highlights .mark-filters .chip", { hasText: "All" }).click();
      assert.strictEqual(await q.locator("#highlights .mark-row").count(), 2);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a clip translates on the device, shows under its words, isn't narrated, and keeps after a restart (1.42.0)", async () => {
      const q = await page(browser, 390);
      const fake = () => {
        const T = window.Waypage.platform.translator;
        window.__sent = 0;
        Object.defineProperty(T, "available", { get: () => true, configurable: true });
        T.detect = async () => "en";
        T.ready = async () => "downloadable";
        T.prepare = async (from, to, on) => { if (on) on(1); };
        T.translate = async (texts) => { window.__sent += texts.length; return texts.map((t) => "[he] " + t.slice(0, 30)); };
      };
      await q.evaluate(fake);
      await q.fill("#saveUrl", ARTICLE);
      await q.press("#saveUrl", "Enter");
      await q.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await frameText(q).getByText("oceanic track").waitFor();
      await q.click("#readerTranslate");
      await q.locator("#readingSheet:not([hidden]) .tr-into .dropdown-btn").click();
      await q.getByRole("option", { name: "Hebrew" }).click();
      await q.locator("#readingSheet .btn-primary", { hasText: "Translate" }).click();
      const tr = q.frameLocator("#readerFrame").locator(".co-tr");
      await tr.first().waitFor();
      const n = await tr.count();
      assert.ok(n > 3, "only " + n + " translated");
      assert.ok(await q.evaluate(() => window.Waypage.reader.readable().every((t) => !t.includes("[he]"))), "the translation was narrated");
      await q.reload();
      await q.evaluate(fake);
      await q.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await tr.first().waitFor();
      assert.strictEqual(await tr.count(), n);
      assert.strictEqual(await q.getAttribute("#readerTranslate", "aria-label"), "Translation");
      await q.click("#readerTranslate");
      // Instead of the text: the block's own words take no room, the translation reads at body size.
      await q.locator("#readingSheet:not([hidden]) .tr-show .dropdown-btn").click();
      await q.getByRole("option", { name: "Instead of the text" }).click();
      await until(q, () => document.getElementById("readerFrame").contentDocument.documentElement.classList.contains("co-replace"));
      const sizes = await q.evaluate(() => {
        const d = document.getElementById("readerFrame").contentDocument, b = d.querySelector("p.co-trd");
        return { own: getComputedStyle(b).fontSize, tr: getComputedStyle(b.querySelector(".co-tr")).fontSize, body: getComputedStyle(d.body).fontSize };
      });
      assert.deepStrictEqual(sizes, { own: "0px", tr: sizes.body, body: sizes.body });
      await until(q, () => !document.querySelector(".dropdown-menu"));
      await q.locator("#readingSheet:not([hidden]) .tr-show .dropdown-btn").click();
      await q.getByRole("option", { name: "Off", exact: true }).click();
      await until(q, () => !document.getElementById("readerFrame").contentDocument.querySelector(".co-tr, .co-replace"));
      await q.locator("#readingSheet .row", { hasText: "Remove the translation" }).click();
      await until(q, async () => !(await window.Waypage.store.readTranslation((await window.Waypage.store.readIndex())[0].id)));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the Highlights button lists them, and words already highlighted can be unhighlighted", async () => {
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      const marks = p.frameLocator("#readerFrame").locator("mark.co-mark");
      await marks.first().waitFor();
      // The bar may have slid away for reading, as it does on a scroll.
      await p.locator("#readerMarks").evaluate((b) => b.click());
      await p.locator("#readingSheet:not([hidden]) .mark-quote", { hasText: "marmalade sky" }).waitFor();
      await p.goBack();
      await p.locator("#readingSheet").waitFor({ state: "hidden" });
      await p.frameLocator("#readerFrame").locator("mark.co-mark").first().evaluate((mk) => {
        const r = mk.ownerDocument.createRange();
        r.selectNodeContents(mk);
        const sel = mk.ownerDocument.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      const btn = p.locator(".read-here .sel-mark:not([hidden])");
      await btn.getByText("Remove highlight").waitFor();
      await btn.click();
      await p.waitForFunction(() => !document.getElementById("readerFrame").contentDocument.querySelector("mark.co-mark"));
      await p.locator(".read-here").waitFor({ state: "hidden" });
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("search finds a clip by words in its text, and not by others", async () => {
      await p.click("#searchBtn");
      await p.fill("#librarySearch", "waypoints");
      await p.waitForTimeout(700);
      assert.strictEqual(await p.locator(".library .page-card:visible").count(), 1);
      await p.fill("#librarySearch", "zeppelinxyz");
      await p.waitForTimeout(700);
      assert.strictEqual(await p.locator(".library .page-card:visible").count(), 0);
      await p.click("#searchClear");
    });

    await test("a paywalled article saves, and says it's only the start", async () => {
      await p.fill("#saveUrl", ROOT + "test/fixtures/paywalled.html");
      await p.press("#saveUrl", "Enter");
      const card = p.locator(".page-card", { hasText: "Inside the Night Shift" }).first();
      await card.waitFor({ timeout: 10000 });
      await card.getByText("Only the start").waitFor();
      await card.click();
      await frameText(p).locator(".co-cut").getByText("Read the rest on").waitFor();
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("a footnote opens in a sheet, not a jump (1.14.0)", async () => {
      await p.fill("#saveUrl", NOTES);
      await p.press("#saveUrl", "Enter");
      const card = p.locator(".page-card", { hasText: "Charting the Ocean Tracks" }).first();
      await card.waitFor({ timeout: 10000 });
      await card.click();
      await frameText(p).getByText("jet stream").first().waitFor();
      await p.frameLocator("#readerFrame").locator("a", { hasText: "[1]" }).click();
      const sheet = p.locator("#readingSheet:not([hidden])");
      await sheet.getByText("issued by the oceanic control centres").waitFor();
      assert.strictEqual(await sheet.getByText("↩").count(), 0, "the back link was kept");
      await p.goBack();
      await p.locator("#readingSheet").waitFor({ state: "hidden" });
    });

    await test("a link inside a clip jumps and offers the way back (1.14.0)", async () => {
      await p.frameLocator("#readerFrame").locator("a", { hasText: "the crossing" }).click();
      await p.locator("#jumpBack:not([hidden])").click();
      await p.locator("#jumpBack").waitFor({ state: "hidden" });
    });

    await test("a link out of a clip asks what to do with it (1.14.0)", async () => {
      await p.frameLocator("#readerFrame").locator("a", { hasText: "official track message" }).click();
      const sheet = p.locator("#readingSheet:not([hidden])");
      await sheet.getByText("Save for later").waitFor();
      await sheet.getByText("Open in the browser").waitFor();
      await p.goBack();
      await p.locator("#readingSheet").waitFor({ state: "hidden" });
    });

    await test("find in this clip counts, steps and clears (1.14.0)", async () => {
      await p.keyboard.press("Control+f");
      await p.locator("#findBar:not([hidden])").waitFor();
      await p.fill("#findInput", "jet stream");
      await until(p, () => /1 of 2/.test(document.getElementById("findCount").textContent));
      await p.click("#findNext");
      await until(p, () => /2 of 2/.test(document.getElementById("findCount").textContent));
      assert.strictEqual(await p.frameLocator("#readerFrame").locator("mark.co-find.co-here").count(), 1);
      await p.fill("#findInput", "zeppelinxyz");
      await until(p, () => document.getElementById("findCount").textContent === "None");
      await p.click("#findDone");
      await p.locator("#findBar").waitFor({ state: "hidden" });
      assert.strictEqual(await p.frameLocator("#readerFrame").locator("mark.co-find").count(), 0);
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("a pinch on a clip's words sets the text size (1.16.0)", async () => {
      await p.locator(".page-card", { hasText: "The Long Haul Flight" }).first().click();
      await frameText(p).getByText("oceanic track").waitFor();
      // It opens where it was left, which tucks the bars away; a tap brings them.
      await p.waitForTimeout(600);
      await p.evaluate(() => document.getElementById("readerView").classList.remove("bar-away"));
      const before = await p.evaluate(() => readingPrefs().size);
      const after = await p.evaluate(() => {
        const d = document.getElementById("readerFrame").contentDocument;
        const touch = (id, x, y) => new Touch({ identifier: id, target: d.body, clientX: x, clientY: y });
        const fire = (type, list) => d.dispatchEvent(new TouchEvent(type, { touches: list, changedTouches: list, bubbles: true, cancelable: true }));
        fire("touchstart", [touch(1, 150, 300), touch(2, 250, 300)]);
        fire("touchmove", [touch(1, 125, 300), touch(2, 275, 300)]);
        fire("touchend", []);
        return readingPrefs().size;
      });
      assert.strictEqual(after, Math.round(before * 1.5));
      await p.waitForTimeout(500);
      assert.strictEqual(await p.evaluate(() => document.getElementById("readerView").classList.contains("bar-away")), false, "the pinch tucked the bars away");
      await p.evaluate((s) => setReading({ size: s }), before);
      await p.waitForTimeout(300);
      await p.evaluate(() => document.getElementById("readerView").classList.remove("bar-away"));
    });

    await test("alignment and letter, word and paragraph spacing reach the clip (1.19.0)", async () => {
      const got = await p.evaluate(async () => {
        setReading({ align: "justify", letters: 0.05, words: 0.2, paras: 2 });
        await new Promise((r) => setTimeout(r, 100));
        const d = document.getElementById("readerFrame").contentDocument;
        const para = d.querySelector("p:not([class])");
        // A book's paragraph is often a div with its own centring.
        const div = d.createElement("div");
        div.style.textAlign = "center";
        div.textContent = "A paragraph made of a div.";
        d.body.append(div);
        const cs = getComputedStyle(para);
        const out = { divAlign: getComputedStyle(div).textAlign, h1Align: getComputedStyle(d.querySelector("h1")).textAlign, align: cs.textAlign, ls: parseFloat(cs.letterSpacing), ws: parseFloat(cs.wordSpacing), mb: parseFloat(cs.marginBottom), fs: parseFloat(getComputedStyle(d.body).fontSize) };
        setReading({ align: "auto", letters: 0, words: 0, paras: 1 });
        await new Promise((r) => setTimeout(r, 100));
        out.back = getComputedStyle(para).textAlign;
        out.attr = d.documentElement.hasAttribute("data-co-align");
        out.mb1 = parseFloat(getComputedStyle(para).marginBottom);
        return out;
      });
      assert.strictEqual(got.align, "justify");
      assert.strictEqual(got.divAlign, "justify");
      assert.strictEqual(got.h1Align, "justify");
      assert.ok(Math.abs(got.ls - got.fs * 0.05) < 0.5, "letter spacing " + got.ls);
      assert.ok(Math.abs(got.ws - got.fs * 0.2) < 0.5, "word spacing " + got.ws);
      assert.strictEqual(got.mb, 32);
      assert.notStrictEqual(got.back, "justify");
      assert.strictEqual(got.attr, false);
      assert.strictEqual(got.mb1, 16);
    });

    await test("held half a second, the brightness slider swipes to the other side (1.16.0)", async () => {
      await p.evaluate(() => {
        C.platform.brightness = { available: true, get: async () => ({ level: 0.5 }), set: async () => {} };
        brightOpen();
      });
      await p.locator("#bright:not([hidden])").waitFor();
      await until(p, () => document.getElementById("bright").getBoundingClientRect().left > 0);
      await p.waitForTimeout(400);
      const box = await p.locator("#brightTrack").boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await p.mouse.down();
      await p.waitForTimeout(650);
      assert.ok(await p.evaluate(() => document.getElementById("bright").classList.contains("lifted")));
      await p.mouse.move(340, box.y + box.height / 2, { steps: 5 });
      await p.mouse.up();
      assert.strictEqual(await p.evaluate(() => localStorage.getItem("waypage.brightSide")), JSON.stringify("right"));
      await until(p, () => document.getElementById("bright").getBoundingClientRect().left > innerWidth / 2);
      await p.mouse.move(box.x + box.width / 2, box.y + 20);
      await p.mouse.down();
      await p.mouse.up();
      assert.strictEqual(await p.evaluate(() => localStorage.getItem("waypage.brightSide")), JSON.stringify("right"), "a quick tap moved it");
      await p.evaluate(() => setBrightSide("left"));
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
    });

    await test("a favourite's star sits on its picture, not by its name (1.16.0)", async () => {
      await p.evaluate(() => { const c = state.pages.find((x) => /Long Haul/.test(x.title)); return setFavourite([c], true); });
      const card = p.locator(".page-card", { hasText: "The Long Haul Flight" }).first();
      await card.locator(".thumb-fav").waitFor();
      assert.strictEqual(await card.locator(".card-site").innerText().then((t) => t.includes("★")), false);
      await p.evaluate(() => { const c = state.pages.find((x) => /Long Haul/.test(x.title)); return setFavourite([c], false); });
      await card.locator(".thumb-fav").waitFor({ state: "detached" });
    });

    await test("a book opens to a spinner, then its text (1.16.0)", async () => {
      await p.evaluate(() => {
        const c = state.pages.find((x) => /Long Haul/.test(x.title));
        c.file = { name: "long.epub", kind: "epub", ext: "epub", size: 1 };
        const read = C.store.readPage;
        C.store.readPage = (id) => new Promise((r) => setTimeout(() => { C.store.readPage = read; r(read(id)); }, 800));
        openPage(c.id);
      });
      await p.locator("#readerView.waiting #readerWait").waitFor({ state: "visible" });
      assert.strictEqual(await p.evaluate(() => getComputedStyle(document.getElementById("readerFrame")).visibility), "hidden");
      await until(p, () => !document.getElementById("readerView").classList.contains("waiting"));
      await frameText(p).getByText("oceanic track").waitFor();
      await p.goBack();
      await p.locator("#readerView").waitFor({ state: "hidden" });
      await p.evaluate(() => { delete state.pages.find((x) => /Long Haul/.test(x.title)).file; });
    });

    await test("a clip open only a moment doesn't become Continue reading, and old history isn't reopened (1.21.0)", async () => {
      const got = await p.evaluate(async () => {
        const p0 = state.pages[0];
        p0.readAt = 1; p0.at = 0.3; p0.finished = false;
        const before = p0.readAt;
        await openPage(p0.id);
        await new Promise((r) => setTimeout(r, 500));
        history.back();
        await new Promise((r) => setTimeout(r, 3500));
        const brief = p0.readAt;
        // An entry from a launch before this one is skipped, not opened.
        history.pushState({ view: "reader", page: p0.id }, "");
        History.prototype.replaceState.call(history, { view: "reader", page: p0.id, launch: "older" }, "");
        history.pushState({ view: "menu" }, "");
        history.back();
        await new Promise((r) => setTimeout(r, 400));
        return { before, brief, open: !!state.open, view: (history.state && history.state.view) || "" };
      });
      assert.strictEqual(got.brief, got.before, "a quick look stamped it as read");
      assert.strictEqual(got.open, false, "an old entry opened its clip");
      assert.strictEqual(got.view, "");
    });

    await test("nothing went wrong along the way", async () => {
      assert.deepStrictEqual(p.errors, [], p.errors.join(" | "));
    });
    await p.context().close();

    await test("a library of 400 clips draws every card as it is scrolled", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const list = [];
        for (let i = 0; i < 400; i++) list.push({ id: "big" + String(i).padStart(4, "0"), url: "https://example.com/" + i, title: "Clip " + i, site: "example.com", savedAt: 1e12 - i, minutes: 3, mode: "links", at: 0, finished: false });
        await window.Waypage.store.writeIndex(list);
      });
      await q.reload();
      await q.locator(".page-card").first().waitFor();
      await q.waitForTimeout(600);
      const atFirst = await q.evaluate(() => document.querySelectorAll(".library .page-card").length);
      assert.ok(atFirst < 400, "the first screen stops short: " + atFirst);
      for (let i = 0; i < 14; i++) {
        await q.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await q.waitForTimeout(250);
      }
      await q.waitForFunction(() => document.querySelectorAll(".library .page-card").length >= 400, null, { timeout: 15000 });
      // A search starts again from the first screen (1.28.4).
      await q.evaluate(() => { scrollTo(0, 0); $("librarySearch").value = "Clip 3"; onSearch(); });
      await q.waitForTimeout(500);
      const found = await q.evaluate(() => document.querySelectorAll(".library .page-card").length);
      assert.ok(found > 0 && found <= 30, "a search draws a first screen: " + found);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Highlights lists a screen of clips first, the rest as it is scrolled (1.28.4)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const list = [];
        for (let i = 0; i < 90; i++) list.push({ id: "hl" + i, url: "https://example.com/h" + i, title: "Marked " + i, site: "example.com", savedAt: 1e12 - i, minutes: 3, mode: "links", at: 0, finished: false, marks: [{ id: "m" + i, text: "Words of note " + i, at: 1e12 - i }] });
        await window.Waypage.store.writeIndex(list);
      });
      await q.reload();
      await q.evaluate(() => goPlace("highlights"));
      await q.locator("#highlights .hl-clip").first().waitFor();
      await q.waitForTimeout(400);
      const first = await q.evaluate(() => document.querySelectorAll("#highlights .hl-clip").length);
      assert.ok(first < 90, "the first screen stops short: " + first);
      for (let i = 0; i < 6; i++) {
        await q.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await q.waitForTimeout(250);
      }
      await q.waitForFunction(() => document.querySelectorAll("#highlights .hl-clip").length === 90, null, { timeout: 10000 });
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a collection's new-chapters badge saves them without opening it", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async (next) => {
        const list = [0, 1].map((i) => ({ id: "ser" + i, url: "https://example.com/ch" + i, title: "Chapter " + (i + 1), site: "example.com", savedAt: 1000 + i, minutes: 3, mode: "links", at: 0, finished: false, folder: "Series A", folderAt: i, next }));
        await window.Waypage.store.writeIndex(list);
        localStorage.setItem("waypage.newChapters", JSON.stringify({ "series a": { count: 1, at: 2000 } }));
      }, ARTICLE);
      await q.reload();
      const pip = q.locator(".tile-new").first();
      await pip.waitFor();
      assert.strictEqual(await pip.getAttribute("aria-label"), "Save 1 new clip of Series A");
      await pip.click();
      await until(q, async () => (await window.Waypage.store.readIndex()).length === 3);
      assert.ok(await q.evaluate(() => document.getElementById("readerView").hidden), "the collection or reader opened");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the sidebar shows the favourites, then Collections and Clips (1.14.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const c = (i, more) => ({ id: "fv" + i, url: "https://example.com/fv" + i, title: "Clip " + i, site: "example.com", savedAt: 1000 + i, minutes: 3, mode: "links", at: 0, finished: false, ...more });
        await window.Waypage.store.writeIndex([
          c(1, { folder: "Trips", folderAt: 0, folderFav: true, folderFavAt: 50 }),
          c(2, { folder: "Unloved", folderAt: 0 }),
          c(3, { fav: true, favAt: 60 }),
          c(4),
        ]);
      });
      await q.reload();
      await q.locator(".page-card").first().waitFor();
      await q.click("#sideBtn");
      const labels = await q.locator("#sidebar .side-item .side-label").allTextContents();
      assert.deepStrictEqual(labels.slice(0, 5), ["Library", "Trips", "Clip 3", "Collections", "Clips"], labels.join(", "));
      assert.ok(!labels.includes("Unloved") && !labels.includes("Files"), labels.join(", "));
      await q.locator("#sidebar .side-item", { hasText: "Collections" }).click();
      await q.locator("#sidebar").waitFor({ state: "hidden" });
      await until(q, () => document.querySelectorAll(".library .tile, .library [data-name]").length > 0 && !document.querySelector(".library .page-card:not([data-name])"));
      // Library from inside Collections goes back to the library (1.20.0).
      await q.waitForTimeout(500);
      await q.click("#sideBtn");
      await q.locator("#sidebar .side-item", { hasText: "Library" }).click();
      await until(q, () => !state.part && !state.side && !(history.state && history.state.view));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("feeds: no count beside a feed in the sidebar, and picked posts save together (1.20.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(() => {
        const now = Date.now();
        localStorage.setItem("waypage.feeds", JSON.stringify([{ url: "https://example.com/feed", title: "Example News", days: 7,
          items: [1, 2, 3].map((i) => ({ id: "p" + i, url: "https://example.com/post" + i, title: "Post " + i, date: now - i * 60000 })) }]));
      });
      await q.reload();
      await q.click("#sideBtn");
      const feedRow = q.locator("#sidebar .side-item", { hasText: "Example News" });
      await feedRow.waitFor();
      assert.strictEqual(await feedRow.locator(".side-n").count(), 0, "a count shows beside the feed");
      await feedRow.click();
      await q.locator("#feeds .post", { hasText: "Post 1" }).waitFor();
      await q.waitForTimeout(400);
      assert.strictEqual(await q.locator("#feeds .feed-select").count(), 0, "Feeds still has a Select button");
      await q.locator("#feeds .post", { hasText: "Post 1" }).locator(".post-open").hover();
      await q.mouse.down();
      await q.waitForTimeout(650);
      await q.mouse.up();
      await until(q, () => document.body.classList.contains("picking-posts") && !document.getElementById("selOpen").hidden);
      assert.ok(await q.locator("#selOpen").isVisible() && !(await q.locator("#selTags").isVisible()));
      assert.strictEqual(await q.textContent("#selectCount"), "1 post picked", "holding a post doesn't pick it");
      await q.locator("#feeds .post", { hasText: "Post 3" }).locator(".post-open").click();
      assert.strictEqual(await q.textContent("#selectCount"), "2 posts picked");
      const saved = await q.evaluate(async () => {
        const got = [];
        window.saveFeedPosts = (list) => { got.push(...list.map((x) => x.it.url)); };
        await savePickedPosts();
        return got;
      });
      assert.deepStrictEqual(saved.sort(), ["https://example.com/post1", "https://example.com/post3"]);
      await until(q, () => !state.feedPick && !document.body.classList.contains("selecting"));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Notifications: off, each post or all together, feeds kept quiet, and a notification's Save (1.30.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(() => {
        localStorage.setItem("waypage.feeds", JSON.stringify([{ url: "https://example.com/feed", title: "Example News", days: 7, mode: "show", folder: "News", checkedAt: Date.now(), items: [] }]));
      });
      await q.reload();
      const sent = await q.evaluate(async () => {
        const P = window.Waypage.platform;
        P.native = true;
        const got = [];
        P.feedChecks.watch = (list, ask, notes) => got.push(notes);
        openSettings();
        openSection("notifications");
        await new Promise((r) => setTimeout(r, 300));
        document.querySelector('#sectionBody input[value="together"]').click();
        await new Promise((r) => setTimeout(r, 1200));
        [...document.querySelectorAll("#sectionBody .row")].find((r) => r.textContent.includes("Example News")).querySelector("input").click();
        await new Promise((r) => setTimeout(r, 1200));
        [...document.querySelectorAll("#sectionBody .row")].find((r) => r.textContent.includes("New posts from")).querySelector("input").click();
        for (let i = 0; i < 40 && got.length < 3; i++) await new Promise((r) => setTimeout(r, 100));
        return { got, rows: document.querySelectorAll("#sectionBody .row").length };
      });
      assert.deepStrictEqual(sent.got.map((n) => n.style), ["together", "together", "off"]);
      assert.deepStrictEqual(sent.got[1].quiet, ["https://example.com/feed"]);
      assert.strictEqual(sent.rows, 1, "the rest stays while notifications are off");
      const saved = await q.evaluate(async () => {
        const got = [];
        window.saveFeedPosts = (list) => { got.push(...list.map((x) => x.f.url + " " + x.it.url)); };
        window.Waypage.platform.feedChecks.news = async () => ({ feeds: [], open: true, feed: "https://example.com/feed", save: "https://example.com/post9" });
        await takeFeedNews();
        return { got, place: state.place, feed: state.feed };
      });
      assert.deepStrictEqual(saved, { got: ["https://example.com/feed https://example.com/post9"], place: "feeds", feed: "https://example.com/feed" });
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the app icon's shortcuts search, and save the copied link (1.14.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate((url) => {
        window.Waypage.platform.widgets.take = async () => ({ kind: "paste" });
        window.Waypage.platform.widgets.copied = async () => "Look at this " + url;
      }, ARTICLE);
      await q.evaluate(() => takeWidget());
      await q.locator(".page-card", { hasText: "The Long Haul Flight" }).first().waitFor({ timeout: 10000 });
      await q.evaluate(() => { window.Waypage.platform.widgets.take = async () => ({ kind: "search" }); });
      await q.evaluate(() => takeWidget());
      await until(q, () => document.activeElement && document.activeElement.id === "librarySearch");
      await q.evaluate(() => { window.Waypage.platform.widgets.take = async () => ({ kind: "reading" }); });
      await q.evaluate(() => takeWidget());
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Storage saves every highlight as one Markdown file (1.14.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const c = (i, marks) => ({ id: "hl" + i, url: "https://example.com/hl" + i, title: "Clip " + i, site: "example.com", savedAt: 1000 + i, minutes: 3, mode: "links", at: 0, finished: false, marks });
        await window.Waypage.store.writeIndex([
          c(1, [{ id: "a", text: "The older one", at: 10 }]),
          c(2, [{ id: "b", text: "The newer one", note: "Worth a look", at: 20 }]),
          c(3),
        ]);
      });
      await q.reload();
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Storage" }).click();
      const [dl] = await Promise.all([q.waitForEvent("download"), q.locator(".row", { hasText: "Save all highlights" }).click()]);
      assert.ok(/^Waypage highlights \d{4}-\d\d-\d\d\.md$/.test(dl.suggestedFilename()), dl.suggestedFilename());
      const text = fs.readFileSync(await dl.path(), "utf8");
      assert.ok(text.indexOf("# Clip 2") < text.indexOf("# Clip 1") && text.indexOf("# Clip 2") >= 0, text);
      assert.ok(/> The newer one\n\nWorth a look/.test(text) && !/Clip 3/.test(text), text);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a page that's gone saves from the Internet Archive's copy (1.15.0)", async () => {
      const q = await page(browser, 390);
      const gone = ROOT + "test/fixtures/gone-article.html";
      const article = fs.readFileSync(path.join(__dirname, "fixtures", "article.html"), "utf8")
        .replace("<body>", '<body><!-- BEGIN WAYBACK TOOLBAR INSERT --><div id="wm-ipp">Wayback toolbar zzqq</div><!-- END WAYBACK TOOLBAR INSERT -->');
      await q.evaluate((article) => {
        const P = window.Waypage.platform, real = P.fetchText;
        P.fetchText = async (url, o) => {
          if (url.startsWith("https://archive.org/wayback/available?url=")) {
            const asked = decodeURIComponent(url.split("url=")[1]);
            return { status: 200, url, text: JSON.stringify({ archived_snapshots: { closest: { available: true, status: "200", timestamp: "20240305120000", url: "http://web.archive.org/web/20240305120000/" + asked } } }) };
          }
          if (url.startsWith("https://web.archive.org/web/")) return { status: 200, url, text: article };
          return real(url, o);
        };
      }, article);
      await q.fill("#saveUrl", gone);
      await q.press("#saveUrl", "Enter");
      await q.locator("#downloadsBtn").click();
      const btn = q.locator(".failed button", { hasText: "Archived copy" });
      await btn.waitFor({ timeout: 10000 });
      assert.strictEqual(await q.locator(".failed button", { hasText: "Try again" }).count(), 0);
      await btn.click();
      await until(q, async () => (await window.Waypage.store.readIndex()).length === 1, null, 15000);
      const meta = await q.evaluate(async () => (await window.Waypage.store.readIndex())[0]);
      assert.strictEqual(meta.url, gone);
      assert.strictEqual(meta.archived, Date.UTC(2024, 2, 5, 12, 0, 0));
      assert.strictEqual(meta.site, "localhost");
      const html = await q.evaluate((id) => window.Waypage.store.readPage(id), meta.id);
      assert.ok(/Internet Archive's copy of localhost/.test(html), "the footer doesn't say it's archived");
      assert.ok(!/zzqq/.test(html), "the Wayback toolbar was kept");
      assert.ok(html.includes('href="' + gone + '"'), "Read the original isn't the page's own address");
      const errs = q.errors.filter((e) => !/gone-article/.test(e));
      assert.deepStrictEqual(errs, [], errs.join(" | "));
      await q.context().close();
    });

    await test("Report a problem lists a failed save and opens an issue without the address's query", async () => {
      const q = await page(browser, 390);
      await q.evaluate(() => { window.__opened = []; window.Waypage.platform.openOutside = (u) => window.__opened.push(u); });
      await q.fill("#saveUrl", ROOT + "test/fixtures/nothing-here.html?token=secret"); await q.press("#saveUrl", "Enter");
      await until(q, () => window.Waypage.platform.log.list().length > 0);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Report a problem" }).click();
      await q.locator(".report-log").waitFor();
      const log = await q.locator(".report-log").innerText();
      assert.ok(/localhost/.test(log), "the failed save isn't listed: " + log);
      await q.fill(".report-field", "Saving fails");
      await q.locator(".row", { hasText: "Open an issue" }).click();
      const url = await q.evaluate(() => window.__opened[0] || "");
      assert.ok(url.startsWith("https://github.com/danielnoam/waypage/issues/new?"), url);
      const body = decodeURIComponent(url);
      assert.ok(/Saving fails/.test(body) && /Waypage \d/.test(body), "the report says what and which version");
      assert.ok(!/secret/.test(body), "the token was left in");
      const errs = q.errors.filter((e) => !/nothing-here/.test(e));
      assert.deepStrictEqual(errs, [], errs.join(" | "));
      await q.context().close();
    });

    await test("a Pocket export imports with its tags, archived clips finished", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waypage-"));
      const file = path.join(dir, "ril_export.html");
      fs.writeFileSync(file, '<!DOCTYPE html><html><head><title>Pocket Export</title></head><body><h1>Unread</h1><ul><li><a href="' + ARTICLE + '" time_added="1700000100" tags="travel,air">The Long Haul Flight</a></li></ul><h1>Read Archive</h1><ul><li><a href="' + PICTURES + '" time_added="1700000000" tags="">Clouds</a></li></ul></body></html>');
      const q = await page(browser, 390);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Storage" }).click();
      await q.locator("#backupSection input[type=file]").setInputFiles(file);
      await q.locator(".import-sheet").waitFor();
      await q.locator(".import-sheet .seg-item", { hasText: "All" }).click();
      await q.locator(".import-go").click();
      await until(q, async () => (await window.Waypage.store.readIndex()).length === 2, null, 20000);
      const got = await q.evaluate(async () => (await window.Waypage.store.readIndex()).map((x) => [x.url, x.tags || [], !!x.finished]));
      const art = got.find((x) => x[0] === ARTICLE), pic = got.find((x) => x[0] === PICTURES);
      assert.deepStrictEqual(art && art[1], ["travel", "air"]);
      assert.strictEqual(art[2], false);
      assert.strictEqual(pic && pic[2], true, "the archived one is finished");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    await test("an OPML file follows its feeds, shown not saved, and saves back out (1.32.0)", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waypage-"));
      const file = path.join(dir, "subscriptions.opml");
      fs.writeFileSync(file, '<?xml version="1.0"?><opml version="1.0"><body><outline text="Travel"><outline type="rss" text="Sky &amp; Sea" xmlUrl="https://a.example/feed.xml"/></outline><outline type="rss" text="B" xmlUrl="https://b.example/rss"/><outline type="rss" text="Bad" xmlUrl="javascript:alert(1)"/></body></opml>');
      const q = await page(browser, 390);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Storage" }).click();
      await q.locator("#backupSection input[type=file]").setInputFiles(file);
      await until(q, () => JSON.parse(localStorage.getItem("waypage.feeds") || "[]").length === 2);
      const got = await q.evaluate(() => JSON.parse(localStorage.getItem("waypage.feeds")).map((f) => [f.url, f.title, f.folder, f.mode]));
      assert.deepStrictEqual(got, [["https://a.example/feed.xml", "Sky & Sea", "Travel", "show"], ["https://b.example/rss", "B", "B", "show"]]);
      const out = await q.evaluate(() => window.Waypage.imports.opml(window.Waypage.imports.writeOpml(JSON.parse(localStorage.getItem("waypage.feeds")))));
      assert.deepStrictEqual(out.map((f) => f.url), ["https://a.example/feed.xml", "https://b.example/rss"]);
      const errs = q.errors.filter((e) => !/a\.example|b\.example/.test(e));
      assert.deepStrictEqual(errs, [], errs.join(" | "));
      await q.context().close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    await test("Before you go offline lists clips that aren't ready; dark themes dim pictures (1.32.0)", async () => {
      const q = await page(browser, 390, "night");
      await q.evaluate(async (url) => {
        await window.Waypage.store.writeIndex([
          { id: "rd1", url, title: "Clouds From Above", site: "localhost", savedAt: 1000, minutes: 1, mode: "previews", images: 2, missing: 2, bytes: 3000 },
          { id: "rd2", url: url + "?b", title: "Paywalled", site: "localhost", savedAt: 1001, minutes: 1, mode: "previews", cut: true, bytes: 3000 },
          { id: "rd3", url: url + "?c", title: "Fine", site: "localhost", savedAt: 1002, minutes: 1, mode: "previews", bytes: 3000 }]);
      }, PICTURES);
      await q.reload();
      assert.ok(await q.evaluate(() => document.documentElement.hasAttribute("data-dim-pictures")), "Night dims pictures");
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Saving" }).click();
      await q.locator("button", { hasText: "Get ready" }).click();
      await until(q, () => /aren't fully ready/.test(document.body.innerText), null, 20000);
      const rows = await q.locator(".settings-section .nav-row .choice-label").allInnerTexts();
      assert.ok(rows.includes("Clouds From Above") && rows.includes("Paywalled") && !rows.includes("Fine"), rows.join(", "));
      await q.locator(".nav-row", { hasText: "Appearance" }).click().catch(() => {});
      await q.evaluate(() => { localStorage.setItem("waypage.dimPictures", "false"); paintTheme(state.theme); });
      assert.ok(!(await q.evaluate(() => document.documentElement.hasAttribute("data-dim-pictures"))), "the switch turns it off");
      const errs = q.errors.filter((e) => !/localhost.*\?[bc]|offline/i.test(e));
      assert.deepStrictEqual(errs, [], errs.join(" | "));
      await q.context().close();
    });

    await test("a font added in Settings becomes the reading font, in the frame too, and goes again (1.33.0)", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waypage-"));
      const file = path.join(dir, "My Font.woff2");
      fs.copyFileSync(path.join(__dirname, "..", "src", "fonts", "Lora.woff2"), file);
      const bad = path.join(dir, "fake.ttf");
      fs.writeFileSync(bad, "not a font at all");
      const q = await page(browser, 390);
      await q.evaluate(async (html) => {
        await window.Waypage.store.writeIndex([{ id: "ft1", url: "https://example.com/ft", title: "Fonts", site: "example.com", savedAt: 1000, minutes: 1, mode: "links", at: 0 }]);
        await window.Waypage.store.writePage("ft1", html, { id: "ft1" });
      }, "<!doctype html><html><body><h1>Fonts</h1><p>Some words to read.</p></body></html>");
      await q.reload();
      await q.evaluate(() => openSettings(false, "reading"));
      const input = q.locator("#sectionView input[type=file]");
      await input.setInputFiles(bad);
      await until(q, () => /isn't a font/.test(document.body.innerText));
      await input.setInputFiles(file);
      await until(q, () => readingPrefs().font === "user:My Font.woff2");
      assert.ok(await q.evaluate(() => FONTS.some((f) => f.label === "My Font")));
      assert.ok(await q.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Waypage My Font" && f.status === "loaded")));
      await q.evaluate(() => { closeSettings && closeSettings(); });
      await q.evaluate(() => openPage("ft1"));
      await until(q, () => { const d = document.getElementById("readerFrame").contentDocument; return d && [...d.fonts].some((f) => f.family.replace(/"/g, "") === "Waypage My Font"); });
      await q.reload();
      assert.strictEqual(await q.evaluate(() => readingPrefs().font), "user:My Font.woff2", "kept after a reload");
      await q.evaluate(() => { window.confirm = () => true; return removeFontFile("My Font.woff2"); });
      assert.strictEqual(await q.evaluate(() => readingPrefs().font), "serif");
      assert.deepStrictEqual(await q.evaluate(() => window.Waypage.store.listFonts()), []);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    await test("Storage offers to make room from finished clips with pictures", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async (url) => {
        await window.Waypage.store.writeIndex([{ id: "room1", url, title: "Clouds From Above", site: "localhost", savedAt: 1000, minutes: 1, mode: "previews", images: 1, imageBytes: 30000, bytes: 33000, finished: true }]);
      }, PICTURES);
      await q.reload();
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Storage" }).click();
      const go = q.locator(".room-go");
      await go.waitFor();
      assert.strictEqual(await go.isDisabled(), false);
      assert.ok(/1 clip you've finished/.test(await go.innerText()));
      assert.strictEqual(await q.locator(".room-big .row").count(), 1);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Edit clips finds ~~*~~ across tags, removes it, leaves the licence, and undoes (1.22.0)", async () => {
      const q = await page(browser, 390);
      const one = "<!doctype html><html><body><p>Keep this ~~drop <b>this</b> too~~ part.</p><p>~~whole~~</p><p class=\"co-licence\">~~licence~~</p></body></html>";
      await q.evaluate(async (html) => {
        const S = window.Waypage.store;
        const c = (i, folder) => ({ id: "ed" + i, url: "https://example.com/ed" + i, title: "Clip " + i, site: "example.com", savedAt: 1000 + i, minutes: 1, mode: "links", at: 0, finished: false, ...(folder ? { folder } : {}) });
        await S.writeIndex([c(1, "Notes"), c(2, "Notes"), c(3, "Other")]);
        await S.writePage("ed1", html, c(1));
        await S.writePage("ed2", "<!doctype html><html><body><p>Nothing here</p></body></html>", c(2));
        await S.writePage("ed3", "<!doctype html><html><body><p>Also ~~x~~ here</p></body></html>", c(3));
      }, one);
      await q.reload();
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Library" }).click();
      await q.locator("#sectionBody .nav-row", { hasText: "Edit clips" }).click();
      await q.locator("#sectionTitle", { hasText: "Edit clips" }).waitFor();
      await q.click("#sectionBack");
      await q.locator("#sectionTitle", { hasText: "Library" }).waitFor();
      await q.locator("#sectionBody .nav-row", { hasText: "Edit clips" }).click();
      await q.fill("#editFind", "~~*~~");
      await q.locator("#editResult .row", { hasText: "Find" }).click();
      await q.locator("#editResult .section-lead", { hasText: "Found" }).waitFor();
      assert.strictEqual(await q.textContent("#editResult .section-lead"), "Found 3 times in 2 clips.");
      assert.ok(await q.locator(".edit-sample del", { hasText: "~~drop this too~~" }).count() === 1);
      await q.locator("#editResult .row", { hasText: "Remove from 2 clips" }).click();
      await until(q, () => !!document.querySelector("#editResult") && /Undo/.test(document.querySelector("#editResult").textContent));
      const after = await q.evaluate(async () => ({ one: await window.Waypage.store.readPage("ed1"), three: await window.Waypage.store.readPage("ed3"), page: state.pages.find((p) => p.id === "ed1") }));
      assert.ok(/<p>Keep this\s+part\.<\/p>/.test(after.one) && !/whole/.test(after.one) && /~~licence~~/.test(after.one), after.one);
      assert.ok(/<p>Also\s+here<\/p>/.test(after.three), after.three);
      assert.ok(after.page.editedAt > 0, "the edit isn't marked for sync");
      await q.locator("#editResult .row", { hasText: "Undo" }).click();
      await until(q, async () => /~~whole~~/.test(await window.Waypage.store.readPage("ed1")));
      // Titles, in one collection only.
      await q.locator(".seg-item", { hasText: "Titles" }).click();
      await q.locator("label.choice", { hasText: "Collections" }).click();
      await q.locator(".edit-folders label.row", { hasText: "Notes" }).locator("input").click();
      await q.fill("#editFind", "Clip");
      await q.fill("#editPut", "Note");
      await q.locator("#editResult .row", { hasText: "Find" }).click();
      await q.locator("#editResult .row", { hasText: "Replace in 2 clips" }).click();
      await until(q, () => state.pages.find((p) => p.id === "ed1").title === "Note 1" && state.pages.find((p) => p.id === "ed3").title === "Clip 3");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a clip in a collection has Previous at the top and the collection's clips by Contents (1.23.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = (i) => ({ id: "ch" + i, url: "https://example.com/ch" + i, title: "Chapter " + i, site: "example.com", savedAt: 1000 + i, minutes: 1, mode: "links", at: 0, finished: false, folder: "Saga", folderAt: 1000 + i });
        await S.writeIndex([c(1), c(2), c(3)]);
        for (const i of [1, 2, 3]) await S.writePage("ch" + i, "<!doctype html><html><body><h1>Chapter " + i + "</h1><p>First words of chapter " + i + ".</p><div>Loose text<br>on two lines</div><p>Last words.</p></body></html>", c(i));
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      await q.evaluate(() => openPage("ch2"));
      const top = q.frameLocator("#readerFrame").locator(".co-before");
      await top.waitFor();
      assert.ok(/Previous in Saga\s*Chapter 1/.test(await top.innerText()), await top.innerText());
      assert.ok(/Next in Saga\s*Chapter 3/.test(await q.frameLocator("#readerFrame").locator(".co-after").innerText()));
      // Read aloud's blocks from the saved file are the open clip's.
      const same = await q.evaluate(async () => {
        const html = await window.Waypage.store.readPage("ch2");
        return JSON.stringify(window.Waypage.reader.readableIn(html)) === JSON.stringify(window.Waypage.reader.readable()) && window.Waypage.reader.readable().length;
      });
      assert.strictEqual(same, 5, "the saved file's blocks differ from the open clip's");
      await q.evaluate(() => { const M = window.Waypage.motion, inn = M.pageIn; window.turns = []; M.pageIn = (el, side, dir) => { window.turns.push(dir); return inn(el, side, dir); }; });
      await top.click();
      await until(q, () => state.open && state.open.id === "ch1");
      // Going back, the page before comes in from the top (1.23.1).
      await until(q, () => window.turns.length === 1);
      assert.deepStrictEqual(await q.evaluate(() => window.turns), [-1]);
      await q.locator("#readerFolder").click();
      const rows = q.locator("#readingSheet .folder-row");
      await rows.first().waitFor();
      assert.strictEqual(await rows.count(), 3);
      assert.strictEqual(await rows.nth(0).getAttribute("aria-current"), "page");
      await rows.nth(2).click();
      await until(q, () => state.open && state.open.id === "ch3" && !state.sheet);
      await until(q, () => window.turns.length === 2);
      assert.strictEqual(await q.evaluate(() => window.turns[1]), 1);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a picked collection's ring goes round its name and progress (1.23.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        localStorage.setItem("waypage.layout", JSON.stringify("shelf"));
        const c = (i, f) => ({ id: "rg" + i, url: "https://example.com/rg" + i, title: "Clip " + i, site: "example.com", savedAt: 1000 + i, minutes: 1, mode: "links", at: 0.4, finished: false, folder: f });
        await window.Waypage.store.writeIndex([c(1, "Notes"), c(2, "Notes"), c(3)]);
      });
      await q.reload();
      await q.waitForSelector(".tile[data-ids]");
      const got = await q.evaluate(async () => {
        const t = document.querySelector(".tile[data-ids]");
        startSelect(t.dataset.ids.split(","));
        await new Promise((go) => setTimeout(go, 300));
        const s = getComputedStyle(t), r = t.getBoundingClientRect(), bar = t.querySelector(".progress").getBoundingClientRect();
        return { style: s.outlineStyle, off: parseFloat(s.outlineOffset), clear: bar.bottom <= r.bottom };
      });
      assert.strictEqual(got.style, "solid");
      assert.ok(got.off >= 4 && got.clear, JSON.stringify(got));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Keep the screen on holds only while reading aloud speaks (1.24.0)", async () => {
      const q = await page(browser, 390);
      const got = await q.evaluate(async () => {
        const calls = [];
        window.Waypage.platform.speech.keepScreen = (on) => { calls.push(on); return Promise.resolve(); };
        aloud.key = "x";
        setAloud("playing", 0);
        const off = calls[calls.length - 1];
        localStorage.setItem("waypage.aloudScreenOn", "true");
        setAloud("playing", 1);
        const on = calls[calls.length - 1];
        setAloud("paused", 1);
        const paused = calls[calls.length - 1];
        setAloud("stopped", -1);
        return { off, on, paused, last: calls[calls.length - 1] };
      });
      assert.deepStrictEqual(got, { off: false, on: true, paused: false, last: false });
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("sync takes where you got to first, before texts go up or come down (1.24.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        localStorage.setItem("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t" }));
        const c = (id, more) => ({ id, url: "https://example.com/" + id, title: "Clip " + id, site: "example.com", savedAt: 100, minutes: 1, mode: "links", at: 0, ...more });
        await window.Waypage.store.writeIndex([c("had1"), c("mine1", { savedAt: 300 })]);
        await window.Waypage.store.writePage("had1", "<!doctype html><html><body><p>Had.</p></body></html>", c("had1"));
        await window.Waypage.store.writePage("mine1", "<!doctype html><html><body><p>Mine.</p></body></html>", c("mine1", { savedAt: 300 }));
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const c = (id, more) => ({ id, url: "https://example.com/" + id, title: "Clip " + id, site: "example.com", savedAt: 100, minutes: 1, mode: "links", at: 0, ...more });
        const remote = { format: 1, deleted: {}, files: { had1: { at: 100, sha: "s1" }, new1: { at: 200, sha: "s2" } },
          pages: [c("had1", { at: 0.7, readAt: 5000, readOn: "Tablet" }), c("new1", { savedAt: 200 })] };
        const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
        const seen = [];
        const placeNow = () => (state.pages.find((p) => p.id === "had1") || {}).at;
        window.fetch = async (url, opts = {}) => {
          const method = opts.method || "GET";
          const ok = (j, text) => new Response(text != null ? text : JSON.stringify(j), { status: 200 });
          if (/\/repos\/me\/waypage-data$/.test(url)) return ok({ name: "waypage-data" });
          if (/contents\/library\.json/.test(url) && method === "GET") return ok({ sha: "lib1", content: b64(JSON.stringify(remote)) });
          if (/contents\/pages\/new1\.html/.test(url)) { seen.push(["down", placeNow()]); return ok(null, "<!doctype html><html><body><p>New.</p></body></html>"); }
          if (/contents\/pages\/mine1\.html/.test(url) && method === "PUT") { seen.push(["up", placeNow()]); return ok({ content: { sha: "s3" } }); }
          if (/contents\/library\.json/.test(url) && method === "PUT") return ok({ content: { sha: "lib2" } });
          return new Response("{}", { status: 404 });
        };
        await syncNow(true);
        return { seen, at: placeNow(), ids: state.pages.map((p) => p.id).sort() };
      });
      assert.deepStrictEqual(got.seen, [["up", 0.7], ["down", 0.7]], JSON.stringify(got));
      assert.strictEqual(got.at, 0.7);
      assert.deepStrictEqual(got.ids, ["had1", "mine1", "new1"]);
      await q.context().close();
    });

    await test("a chapter finished on the other device comes over finished, even when its copy here is another version (1.39.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        localStorage.setItem("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t" }));
        const c = (id, more) => ({ id, url: "https://example.com/" + id, title: "Chapter " + id, site: "example.com", savedAt: 100, minutes: 1, mode: "links", at: 0.1, readAt: 1000, placeAt: 1000, folder: "Saga", folderAt: 1, ...more });
        await window.Waypage.store.writeIndex([c("chap1"), c("chap2", { at: 0, readAt: 0, placeAt: 0 })]);
        for (const id of ["chap1", "chap2"]) await window.Waypage.store.writePage(id, "<!doctype html><html><body><p>Text of " + id + ".</p></body></html>", c(id));
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const c = (id, more) => ({ id, url: "https://example.com/" + id, title: "Chapter " + id, site: "example.com", savedAt: 100, minutes: 1, mode: "links", folder: "Saga", folderAt: 1, ...more });
        // Edited on the phone (Edit clips), which syncs links only: no text.
        const remote = { format: 1, deleted: {}, files: {},
          pages: [c("chap1", { editedAt: 500, at: 1, finished: true, spot: "9/100c", readAt: 5000, placeAt: 5000, readOn: "Phone" }), c("chap2", { editedAt: 500, at: 0.4, readAt: 6000, placeAt: 6000, readOn: "Phone" })] };
        const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
        window.fetch = async (url, opts = {}) => {
          const method = opts.method || "GET";
          const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
          if (/\/repos\/me\/waypage-data$/.test(url)) return ok({ name: "waypage-data" });
          if (/contents\/library\.json/.test(url) && method === "GET") return ok({ sha: "lib1", content: b64(JSON.stringify(remote)) });
          if (/contents\/.*/.test(url) && method === "PUT") return ok({ content: { sha: "x" } });
          return new Response("{}", { status: 404 });
        };
        await syncNow(true);
        const p = (id) => state.pages.find((x) => x.id === id);
        return { ch1: [p("chap1").finished, p("chap1").at, p("chap1").spot || ""], ch2: p("chap2").at, next: continuePage() && continuePage().id, text: (await window.Waypage.store.readPage("chap1")).includes("Text of chap1") };
      });
      assert.deepStrictEqual(got, { ch1: [true, 1, ""], ch2: 0.4, next: "chap2", text: true }, JSON.stringify(got));
      await q.context().close();
    });

    await test("on mobile data with places only, places and finished come and go but clips wait (1.40.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        localStorage.setItem("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t" }));
        localStorage.setItem("waypage.syncOnData", JSON.stringify("places"));
        const c = (id, more) => ({ id, url: "https://example.com/" + id, title: "Clip " + id, site: "example.com", savedAt: 100, minutes: 1, mode: "links", ...more });
        await window.Waypage.store.writeIndex([c("had1", { at: 0.2, readAt: 1000, placeAt: 1000 }), c("had2", { at: 0.8, spot: "8/10c", readAt: 9000, placeAt: 9000, finished: true }), c("mine1", { savedAt: 200 })]);
        for (const id of ["had1", "had2", "mine1"]) await window.Waypage.store.writePage(id, "<!doctype html><html><body><p>Text of " + id + ".</p></body></html>", c(id));
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        Object.defineProperty(window.Waypage.platform, "metered", { get: () => true, configurable: true });
        const c = (id, more) => ({ id, url: "https://example.com/" + id, title: "Clip " + id, site: "example.com", savedAt: 100, minutes: 1, mode: "links", ...more });
        const remote = { format: 1, deleted: {}, files: { had1: { at: 100, sha: "s1" }, had2: { at: 100, sha: "s2" }, new1: { at: 100, sha: "s3" } },
          pages: [c("had1", { at: 0.7, spot: "7/0c", readAt: 5000, placeAt: 5000, readOn: "Tablet", tags: ["far"] }), c("had2", { at: 0.1, readAt: 100, placeAt: 100 }), c("new1")] };
        const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
        const puts = [], reads = [];
        window.fetch = async (url, opts = {}) => {
          const method = opts.method || "GET";
          const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
          if (/\/repos\/me\/waypage-data$/.test(url)) return ok({ name: "waypage-data" });
          if (/contents\/library\.json/.test(url) && method === "GET") return ok({ sha: "lib1", content: b64(JSON.stringify(remote)) });
          if (method === "PUT") { const path = url.split("/contents/")[1].split("?")[0]; puts.push(path); if (path === "library.json") window.sentLib = JSON.parse(decodeURIComponent(escape(atob(JSON.parse(opts.body).content)))); return ok({ content: { sha: "x" } }); }
          if (method === "GET") reads.push(url.split("/contents/")[1] || url);
          return new Response("{}", { status: 404 });
        };
        await syncNow(true);
        const p = (id) => state.pages.find((x) => x.id === id);
        const sent = window.sentLib, s = (id) => sent.pages.find((x) => x.id === id);
        return {
          had1: [p("had1").at, p("had1").spot, (p("had1").tags || []).length],
          new1: !!p("new1"),
          puts: puts.sort(),
          readPages: reads.filter((r) => r.startsWith("pages/")).length,
          up: [s("had1").at, s("had2").at, s("had2").finished, s("had2").spot, !!s("mine1"), Object.keys(sent.files).sort().join()],
          base: localStorage.getItem("waypage.syncBase"),
        };
      });
      assert.deepStrictEqual(got, { had1: [0.7, "7/0c", 0], new1: false, puts: ["library.json", "stats/" + got.puts[1].slice(6)], readPages: 0,
        up: [0.7, 0.8, true, "8/10c", false, "had1,had2,new1"], base: null }, JSON.stringify(got));
      await q.context().close();
    });

    await test("reading on while a sync runs keeps the new place, not the one the sync started with (1.36.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        localStorage.setItem("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t" }));
        const c = { id: "had1", url: "https://example.com/had1", title: "Clip", site: "example.com", savedAt: 100, minutes: 1, mode: "links", at: 0 };
        await window.Waypage.store.writeIndex([c]);
        await window.Waypage.store.writePage("had1", "<!doctype html><html><body><p>Had.</p></body></html>", c);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const remote = { format: 1, deleted: {}, files: { had1: { at: 100, sha: "s1" } },
          pages: [{ id: "had1", url: "https://example.com/had1", title: "Clip", site: "example.com", savedAt: 100, minutes: 1, mode: "links", at: 0.7, spot: "7/0c", readAt: 5000, placeAt: 5000, readOn: "Tablet" }] };
        const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
        const here = () => state.pages.find((p) => p.id === "had1");
        let sent = null;
        window.fetch = async (url, opts = {}) => {
          const method = opts.method || "GET";
          const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
          if (/\/repos\/me\/waypage-data$/.test(url)) return ok({ name: "waypage-data" });
          if (/contents\/library\.json/.test(url) && method === "GET") {
            // Read on here while library.json comes down.
            Object.assign(here(), { at: 0.9, spot: "9/50c", readAt: Date.now(), placeAt: Date.now() });
            return ok({ sha: "lib1", content: b64(JSON.stringify(remote)) });
          }
          if (/contents\/library\.json/.test(url) && method === "PUT") { sent = JSON.parse(decodeURIComponent(escape(atob(JSON.parse(opts.body).content)))); return ok({ content: { sha: "lib2" } }); }
          return new Response("{}", { status: 404 });
        };
        await syncNow(true);
        return { at: here().at, spot: here().spot };
      });
      assert.deepStrictEqual(got, { at: 0.9, spot: "9/50c" });
      await q.context().close();
    });

    await test("reading stats go up as this device's own file, and other devices' come down (1.39.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(() => localStorage.setItem("waypage.sync", JSON.stringify({ owner: "me", repo: "waypage-data", branch: "main", token: "t" })));
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const S = window.Waypage.stats, today = S.dayKey(Date.now());
        S.saved();
        const theirs = { since: 1, days: { [today]: { readMs: 600000, aloudMs: 120000, words: 900, clips: { abcd1: 720000 } } }, clips: { abcd1: { readMs: 600000, finished: Date.now() } } };
        const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
        const puts = [];
        let reads = 0;
        window.fetch = async (url, opts = {}) => {
          const method = opts.method || "GET";
          const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
          if (/\/repos\/me\/waypage-data$/.test(url)) return ok({ name: "waypage-data" });
          if (/contents\/library\.json/.test(url) && method === "GET") return new Response("{}", { status: 404 });
          if (/contents\/library\.json/.test(url) && method === "PUT") return ok({ content: { sha: "lib1" } });
          if (/contents\/stats\?/.test(url)) return ok([{ name: "otherdevice2.json", sha: "o1" }, { name: "README.md", sha: "r" }].concat(puts.length ? [{ name: S.device + ".json", sha: "m1" }] : []));
          if (/contents\/stats\/otherdevice2\.json/.test(url)) { reads++; return ok({ sha: "o1", content: b64(JSON.stringify(theirs)) }); }
          if (/contents\/stats\//.test(url) && method === "PUT") { puts.push({ url, body: JSON.parse(decodeURIComponent(escape(atob(JSON.parse(opts.body).content)))) }); return ok({ content: { sha: "m1" } }); }
          return new Response("{}", { status: 404 });
        };
        await syncNow(true);
        const first = { puts: puts.length, reads, mine: puts[0] && puts[0].url.includes("/stats/" + S.device + ".json"), saved: puts[0] && puts[0].body.days[today].saved };
        await syncNow(true);
        const d = S.day(today);
        return { first, again: { puts: puts.length, reads }, read: d.readMs, aloud: d.aloudMs, finished: S.finishedIn(today, today), mineAlone: S.mine().days[today].readMs || 0 };
      });
      assert.deepStrictEqual(got.first, { puts: 1, reads: 1, mine: true, saved: 1 }, JSON.stringify(got));
      assert.deepStrictEqual(got.again, { puts: 1, reads: 1 }, "nothing changed, so nothing goes up or comes down again");
      assert.ok(got.read >= 600000 && got.aloud === 120000, "the other device's time adds in");
      assert.strictEqual(got.finished, 1);
      assert.ok(got.mineAlone < 600000, "this device's own count stays its own");
      await q.context().close();
    });

    await test("the Reading place adds up the week, steps back, and opens a clip; the end of a clip says your time (1.39.0)", async () => {
      const q = await page(browser, 390);
      await q.fill("#saveUrl", ARTICLE);
      await q.press("#saveUrl", "Enter");
      await until(q, () => state.pages.length === 1, null, 15000);
      await q.evaluate(() => {
        const S = window.Waypage.stats, id = state.pages[0].id, now = Date.now(), days = {};
        for (let i = 0; i < 10; i++) days[S.dayKey(now - i * 864e5)] = { readMs: 20 * 60000, aloudMs: i === 0 ? 5 * 60000 : 0, words: 3000, opened: 1, clips: { [id]: 20 * 60000 } };
        S.take("otherdevice3", { since: now - 30 * 864e5, days, clips: { [id]: { readMs: 62 * 60000, aloudMs: 15 * 60000, words: 9400, opened: 3, finished: now } } });
      });
      await q.evaluate(() => goPlace("reading"));
      await q.waitForSelector(".rs-total");
      assert.strictEqual(await q.textContent("#placeTitle"), "Reading");
      const week = await q.evaluate(() => ({ total: document.querySelector(".rs-total").textContent, cols: document.querySelectorAll(".rs-col").length, top: document.querySelectorAll(".rs-clip").length, streak: document.querySelector(".rs-streak-n").textContent }));
      assert.strictEqual(week.cols, 7);
      assert.strictEqual(week.top, 1);
      assert.ok(/^\d+ days in a row$/.test(week.streak), week.streak);
      await q.click(".rs-tab >> text=Month");
      assert.ok(await q.evaluate(() => document.querySelectorAll(".rs-col").length >= 28));
      await q.click(".rs-tab >> text=Year");
      assert.strictEqual(await q.evaluate(() => document.querySelectorAll(".rs-col").length), 12);
      await q.click(".rs-tab >> text=Week");
      await q.click(".rs-range button[aria-label=Before]");
      assert.notStrictEqual(await q.textContent(".rs-total"), week.total, "last week is its own total");
      await q.click(".rs-range button[aria-label=After]");
      assert.strictEqual(await q.textContent(".rs-total"), week.total);
      const w = await q.evaluate(() => statsWidget());
      assert.strictEqual(w.bars.length, 7);
      assert.ok(w.today.endsWith("min") && w.readToday, JSON.stringify(w));
      await q.click(".rs-clip");
      await until(q, () => !!state.open);
      await q.waitForTimeout(800);
      const end = await frameText(q).locator(".co-spent").textContent();
      assert.ok(/here/.test(end) && /narrated/.test(end) && /finished/.test(end), end);
      assert.ok(!(await q.evaluate(() => C.reader.readable().some((t) => /narrated/.test(t)))), "it isn't narrated");
      await q.evaluate(() => { store(SPENT_KEY, false); C.reader.setEnd(spentLines(state.open)); });
      assert.strictEqual(await frameText(q).locator(".co-spent").count(), 0);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the collection widget's read aloud, Keep reading when you leave, and the small window (1.25.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = (i) => ({ id: "w" + i, url: "https://example.com/w" + i, title: "Chapter " + i, site: "example.com", savedAt: 1000 + i, minutes: 1, mode: "links", at: 0, folder: "Saga", folderAt: 1000 + i });
        await S.writeIndex([c(1), c(2)]);
        for (const i of [1, 2]) await S.writePage("w" + i, "<!doctype html><html><body><h1>Chapter " + i + "</h1>" + "<p>Words of chapter " + i + ".</p>".repeat(5) + "</body></html>", c(i));
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const sp = window.Waypage.platform.speech, plays = [], pips = [];
        sp.play = (o) => { plays.push(o.key); window.played = o; return Promise.resolve(); };
        sp.stop = () => Promise.resolve();
        sp.pip = (on, playing) => { pips.push(on + ":" + playing); return Promise.resolve(true); };
        let inPip = false;
        sp.inPip = () => Promise.resolve(inPip);
        const wait = (f) => new Promise((ok) => { const t = setInterval(() => { if (f()) { clearInterval(t); ok(); } }, 50); });
        window.Waypage.platform.widgets.take = () => Promise.resolve({ kind: "page", id: "w1", aloud: true });
        await takeWidget();
        await wait(() => plays.length === 1);
        const reading = aloud.key === "w1" && aloud.state === "playing" && state.open && state.open.id === "w1";
        // The small window shows the clip and the paragraph being read.
        inPip = true;
        dispatchEvent(new Event("resize"));
        await wait(() => document.body.classList.contains("pip"));
        const pip = { title: document.getElementById("pipTitle").textContent, text: document.getElementById("pipText").textContent, asked: pips.includes("true:true") };
        inPip = false;
        dispatchEvent(new Event("resize"));
        await wait(() => !document.body.classList.contains("pip"));
        // With the switch off, opening another clip by hand stops it.
        localStorage.setItem("waypage.aloudKeepGoing", "false");
        openPage("w2");
        await wait(() => state.open && state.open.id === "w2");
        // What a car or earbuds get (1.26.0): a paragraph for each piece,
        // and the collection with the clip's place in it.
        const o = window.played;
        const media = { blocks: Array.isArray(o.blocks) && o.blocks.length === o.items.length, album: o.album, track: o.track, tracks: o.tracks, title: o.title };
        return { reading, pip, media, after: aloud.state, offPip: pips[pips.length - 1] };
      });
      assert.ok(got.reading, JSON.stringify(got));
      assert.strictEqual(got.pip.title, "Chapter 1");
      assert.ok(/Chapter 1|Words of chapter 1/.test(got.pip.text) && got.pip.asked, JSON.stringify(got.pip));
      assert.deepStrictEqual(got.media, { blocks: true, album: "Saga", track: 1, tracks: 2, title: "Chapter 1" });
      assert.strictEqual(got.after, "stopped");
      assert.strictEqual(got.offPip, "false:true");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Read from here starts at the picked word, and the play button at the middle of the screen (1.40.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = { id: "rh01", url: "https://example.com/rh01", title: "Here", site: "example.com", savedAt: 1001, minutes: 3, mode: "links", at: 0 };
        await S.writeIndex([c]);
        let body = "<h1>Here</h1><figure><figcaption>A caption that is skipped.</figcaption></figure>";
        for (let i = 0; i < 40; i++) body += "<p>Paragraph " + i + " has words<sup>[" + i + "]</sup> and more words. Second sentence " + i + " goes on. Third sentence " + i + " ends it.</p>";
        await S.writePage("rh01", "<!doctype html><html><body>" + body + "</body></html>", c);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        localStorage.setItem("waypage.aloudSkipEdges", "true");
        const sp = window.Waypage.platform.speech;
        sp.play = (o) => { window.played = o; return Promise.resolve(); };
        sp.stop = () => Promise.resolve();
        const wait = (f) => new Promise((ok) => { const t = setInterval(() => { if (f()) { clearInterval(t); ok(); } }, 50); });
        openPage("rh01");
        await wait(() => state.open && C.reader.readable().length > 40);
        await C.reader.placed();
        const d = document.getElementById("readerFrame").contentDocument, w = d.defaultView;
        // Picks "Third" in paragraph 12: after a citation mark, and with
        // the title and caption left out of what's read.
        const para = d.querySelectorAll("p")[12], text = [...para.childNodes].find((n) => n.nodeType === 3 && n.data.includes("Third"));
        const r = d.createRange();
        r.setStart(text, text.data.indexOf("Third"));
        r.setEnd(text, text.data.indexOf("Third") + 5);
        w.getSelection().removeAllRanges();
        w.getSelection().addRange(r);
        await startAloud(null, C.reader.selectionSpot());
        const first = (o) => o.items[o.items.length ? Math.max(0, o.start) : 0];
        const picked = first(window.played);
        await stopAloud();
        // Scrolled to paragraph 20 on the middle line: the play button reads from there.
        const p20 = d.querySelectorAll("p")[20];
        w.scrollTo(0, p20.getBoundingClientRect().top + w.scrollY - w.innerHeight / 2 + 4);
        await new Promise((ok) => setTimeout(ok, 100));
        await startAloud();
        const middle = first(window.played);
        await stopAloud();
        w.scrollTo(0, 0);
        await new Promise((ok) => setTimeout(ok, 100));
        await startAloud();
        const top = first(window.played);
        await stopAloud();
        return { picked, middle, top };
      });
      assert.ok(got.picked.startsWith("Third sentence 12"), got.picked);
      assert.ok(/^Paragraph 20 has words/.test(got.middle), got.middle);
      assert.strictEqual(got.top, "Here");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Continue reading goes to the next chapter once one is finished, and a widget's Continue to the collection's next as it is now (1.40.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = (i, more) => ({ id: "kr0" + i, url: "https://example.com/kr" + i, title: "Chapter " + i, site: "example.com", savedAt: 1000 + i, minutes: 1, mode: "links", folder: "Saga", folderAt: 1000 + i, ...more });
        const pages = [c(1, { at: 0.5, readAt: 5000 }), c(2, { at: 1, finished: true, readAt: 9000 }), c(3, { at: 0 })];
        await S.writeIndex(pages);
        for (const p of pages) await S.writePage(p.id, "<!doctype html><html><body><p>Words of " + p.title + ".</p></body></html>", p);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const wait = (f) => new Promise((ok) => { const t = setInterval(() => { if (f()) { clearInterval(t); ok(); } }, 50); });
        const keep = keepReading().id;
        // The widget was drawn when chapter 2 was next.
        window.Waypage.platform.widgets.take = () => Promise.resolve({ kind: "page", id: "kr02", next: true });
        await takeWidget();
        await wait(() => state.open);
        const opened = state.open.id;
        // Continue reading with a clip open stays in it.
        window.Waypage.platform.widgets.take = () => Promise.resolve({ kind: "reading" });
        state.pages.find((p) => p.id === "kr01").readAt = Date.now() + 1000;
        await takeWidget();
        await new Promise((ok) => setTimeout(ok, 200));
        return { keep, opened, stayed: state.open && state.open.id };
      });
      assert.deepStrictEqual(got, { keep: "kr03", opened: "kr03", stayed: "kr03" });
      await q.context().close();
    });

    await test("the moon on the player steps the sleep timer and shows what's left (1.36.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = { id: "s1", url: "https://example.com/s1", title: "Sleepy", site: "example.com", savedAt: 1001, minutes: 1, mode: "links", at: 0 };
        await S.writeIndex([c]);
        await S.writePage("s1", "<!doctype html><html><body><h1>Sleepy</h1>" + "<p>Some words to read.</p>".repeat(5) + "</body></html>", c);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const sp = window.Waypage.platform.speech;
        sp.play = () => Promise.resolve();
        sp.stop = () => Promise.resolve();
        const wait = (f) => new Promise((ok) => { const t = setInterval(() => { if (f()) { clearInterval(t); ok(); } }, 50); });
        window.Waypage.platform.widgets.take = () => Promise.resolve({ kind: "page", id: "s1", aloud: true });
        await takeWidget();
        await wait(() => aloud.state === "playing" && !document.getElementById("aloudPlayer").hidden);
        const btn = document.getElementById("aloudSleep");
        const seen = [];
        for (let i = 0; i < 6; i++) { btn.click(); await new Promise((r) => setTimeout(r, 30)); seen.push(document.getElementById("aloudSleepLeft").textContent + "|" + btn.classList.contains("on")); }
        return { seen, visible: btn.getBoundingClientRect().width > 0 };
      });
      assert.ok(got.visible, "the moon shows on the player");
      assert.deepStrictEqual(got.seen, ["15m|true", "30m|true", "45m|true", "60m|true", "End|true", "|false"]);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the widget's read aloud starts where the clip was left, and the bar comes out of the player (1.26.1)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = { id: "r1", url: "https://example.com/r1", title: "Long chapter", site: "example.com", savedAt: 1000, minutes: 9, mode: "links", at: 0.6, spot: "40/0", folder: "Saga", folderAt: 1000 };
        await S.writeIndex([c]);
        let body = "<h1>Long chapter</h1>";
        for (let i = 1; i <= 80; i++) body += "<p>Paragraph " + i + " of the long chapter, with enough words to fill a line or two.</p>";
        await S.writePage("r1", "<!doctype html><html><body>" + body + "</body></html>", c);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const sp = window.Waypage.platform.speech;
        sp.play = (o) => { window.played = o; return Promise.resolve(); };
        sp.stop = () => Promise.resolve();
        const morphs = [];
        const M = window.Waypage.motion, was = M.morph;
        M.morph = (el, r, into) => { morphs.push(into ? "into" : "out"); return was(el, r, into); };
        const wait = (f) => new Promise((ok) => { const t = setInterval(() => { if (f()) { clearInterval(t); ok(); } }, 50); });
        window.Waypage.platform.widgets.take = () => Promise.resolve({ kind: "page", id: "r1", aloud: true });
        await takeWidget();
        await wait(() => window.played);
        const o = window.played, from = o.blocks[o.start];
        await new Promise((ok) => setTimeout(ok, 500));
        closeReader();
        await wait(() => !document.getElementById("aloudBar").hidden);
        const held = document.getElementById("aloudPlay").style.visibility;
        await wait(() => document.getElementById("readerView").hidden);
        const back = document.getElementById("aloudPlay").style.visibility;
        openPage("r1");
        await wait(() => document.getElementById("aloudBar").hidden);
        return { from, morphs, held, back, after: document.getElementById("aloudPlay").style.visibility };
      });
      assert.ok(got.from >= 30, JSON.stringify(got));
      assert.deepStrictEqual(got.morphs, ["out", "into"], JSON.stringify(got));
      assert.strictEqual(got.held, "hidden");
      assert.strictEqual(got.back, "");
      assert.strictEqual(got.after, "");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("reading on to the next chapter doesn't flash the read-aloud card (1.26.3)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store;
        const c = (i) => ({ id: "n" + i, url: "https://example.com/n" + i, title: "Chapter " + i, site: "example.com", savedAt: 1000 + i, minutes: 1, mode: "links", at: 0, folder: "Saga", folderAt: 1000 + i });
        await S.writeIndex([c(1), c(2), c(3)]);
        for (const i of [1, 2, 3]) await S.writePage("n" + i, "<!doctype html><html><body><h1>Chapter " + i + "</h1>" + "<p>Words.</p>".repeat(30) + "</body></html>", c(i));
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const sp = window.Waypage.platform.speech;
        sp.play = () => Promise.resolve();
        sp.stop = () => Promise.resolve();
        const bar = document.getElementById("aloudBar"), shown = [];
        new MutationObserver(() => { if (!bar.hidden) shown.push(state.open && state.open.id); }).observe(bar, { attributes: true, attributeFilter: ["hidden"] });
        const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
        openPage("n1");
        await pause(900);
        startAloud();
        await pause(300);
        // Read next, at the end of a chapter.
        readNext();
        await pause(1500);
        const afterNext = [state.open.id, aloud.key];
        // Going on by itself, the phone already reading the next one.
        queued = { key: "n3", map: [0] };
        if (wentOn("n3")) setAloud("playing", 0);
        await pause(1500);
        // Moving on by hand while it reads: the card shows, as before.
        goTo(state.pages.find((x) => x.id === "n1"), -1);
        await pause(1200);
        return { shown, afterNext, end: [state.open.id, aloud.key], byHand: !bar.hidden };
      });
      assert.deepStrictEqual(got.afterNext, ["n2", "n2"], JSON.stringify(got));
      assert.deepStrictEqual(got.end, ["n1", "n3"], JSON.stringify(got));
      assert.deepStrictEqual(got.shown, ["n1"], JSON.stringify(got));
      assert.ok(got.byHand);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Continue reading stays on a chapter opened from it and left near its top (1.26.4)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const S = window.Waypage.store, now = Date.now();
        const c = (i, more) => ({ id: "v" + i, url: "https://example.com/v" + i, title: "Part " + i, site: "example.com", savedAt: 1000 + i, minutes: 5, mode: "links", at: 0, folder: "Book", folderAt: 1000 + i, ...more });
        const other = { id: "elsewhere", url: "https://example.com/e", title: "Elsewhere", site: "example.com", savedAt: 900, minutes: 5, mode: "links", at: 0.5, readAt: now - 60000 };
        const pages = [other, c(1, { finished: true, at: 1, readAt: now - 10000 }), c(2), c(3)];
        await S.writeIndex(pages);
        for (const p of pages) await S.writePage(p.id, "<!doctype html><html><body><h1>" + p.title + "</h1>" + "<p>Words of the part.</p>".repeat(80) + "</body></html>", p);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        const before = continuePage().id;
        openPage(before);
        await new Promise((ok) => setTimeout(ok, 3600));
        const stamped = !!state.pages.find((x) => x.id === before).readAt;
        closeReader();
        await new Promise((ok) => setTimeout(ok, 600));
        return { before, stamped, after: continuePage().id };
      });
      assert.deepStrictEqual(got, { before: "v2", stamped: true, after: "v2" }, JSON.stringify(got));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("an app update downloads in Downloads, with Pause and Resume (1.23.0)", async () => {
      const q = await page(browser, 390);
      const got = await q.evaluate(async () => {
        const P = window.Waypage.platform;
        P.android = true;
        let paused = 0;
        P.pauseUpdate = () => { paused++; return Promise.resolve(true); };
        P.downloadUpdate = (v, onProgress) => new Promise((ok, no) => { onProgress(0.4, 4e6, 1e7); window.finishUpdate = (how) => (how === "pause" ? no(Object.assign(new Error("Paused"), { code: "PAUSED" })) : ok("file:///cache/Waypage-9.9.9.apk")); });
        P.openInstaller = () => { window.installed = true; return Promise.resolve(); };
        setUpd({ phase: "available", latest: "9.9.9" });
        startUpdate();
        openDownloads();
        await new Promise((go) => setTimeout(go, 400));
        const card = document.querySelector("#downloads .app-update");
        const status = card && card.querySelector(".status-text").textContent;
        card.querySelector(".card-actions button").click();
        window.finishUpdate("pause");
        await new Promise((go) => setTimeout(go, 100));
        const after = document.querySelector("#downloads .app-update .card-actions button").textContent;
        return { status, paused, phase: upd.phase, after };
      });
      assert.deepStrictEqual(got, { status: "40% · 4.0 MB of 10 MB", paused: 1, phase: "paused", after: "Resume" }, JSON.stringify(got));
      await q.evaluate(() => { document.querySelector("#downloads .app-update .card-actions button").click(); });
      await q.evaluate(() => new Promise((go) => setTimeout(go, 100)).then(() => window.finishUpdate("done")));
      await until(q, () => upd.phase === "ready" && window.installed === true);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the update toast's Downloads opens Downloads from Settings (1.28.0)", async () => {
      const q = await page(browser, 390);
      await q.click("#settingsBtn");
      await q.locator("#settingsView:not([hidden])").waitFor();
      await q.evaluate(() => {
        window.Waypage.platform.android = true;
        window.Waypage.platform.downloadUpdate = () => new Promise(() => {});
        setUpd({ phase: "available", latest: "9.9.9" });
        startUpdate();
      });
      await q.click("#toast .toast-act");
      await until(q, () => state.downloads && !state.settings);
      await q.waitForTimeout(600);
      const top = await q.evaluate(() => document.elementFromPoint(195, 300).closest(".screen").id);
      assert.strictEqual(top, "downloadsView");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a PDF's bookmarks are its contents, read when saved and when opened (1.28.0)", async () => {
      const q = await page(browser, 390);
      const bytes = [...pdfBytes()];
      const got = await q.evaluate(async (b) => {
        const pdf = await window.Waypage.pdf.open(new Uint8Array(b));
        const outline = await pdf.outline();
        pdf.close();
        const file = new File([new Uint8Array(b)], "plain.pdf", { type: "application/pdf" });
        const meta = await window.Waypage.files.bring(file, "pdf", { has: () => false });
        const html = await window.Waypage.store.readPage(meta.id);
        const marks = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("[data-toc]")].map((n) => n.getAttribute("data-toc-t") + "@" + n.getAttribute("data-toc-p"));
        return { outline, marks };
      }, bytes);
      assert.deepStrictEqual(got, {
        outline: [{ title: "Part One", page: 1, depth: 1 }, { title: "Part Two", page: 3, depth: 1 }],
        marks: ["Part One@1", "Part Two@3"],
      }, JSON.stringify(got));
      // pdf.js's sandboxed frame asks for a service worker it can't have.
      const errors = q.errors.filter((e) => !/serviceWorker/.test(e));
      assert.deepStrictEqual(errors, [], errors.join(" | "));
      await q.context().close();
    });

    await test("a big PDF read from where it is is read by ranges, never whole (1.35.0)", async () => {
      const q = await page(browser, 390);
      const bytes = [...pdfBytes()];
      const got = await q.evaluate(async (b) => {
        const P = window.Waypage.pdf;
        P.rangeFrom = 100;
        P.rangeFirst = 256;
        const whole = new Blob([new Uint8Array(b)]);
        const asked = [];
        const part = (from, to) => ({
          size: to - from,
          slice: (a, z) => part(from + a, from + z),
          arrayBuffer: () => { asked.push([from, to]); return whole.slice(from, to).arrayBuffer(); },
        });
        const pdf = await P.open(part(0, whole.size));
        const drawn = await pdf.draw(3, 400);
        const outline = await pdf.outline();
        pdf.close();
        P.rangeFrom = 32 << 20;
        P.rangeFirst = 1 << 20;
        return { pages: pdf.pages, jpeg: drawn[0] === 0xff && drawn[1] === 0xd8, outline: outline.length, size: whole.size,
          first: asked[0][1] - asked[0][0], reads: asked.length };
      }, bytes);
      assert.strictEqual(got.pages, 3);
      assert.ok(got.jpeg, "page 3 drew");
      assert.strictEqual(got.outline, 2);
      assert.ok(got.reads > 1, "asked for ranges: " + JSON.stringify(got));
      // Only the first stretch goes with the open; the rest is asked for.
      assert.strictEqual(got.first, 256);
      const errors = q.errors.filter((e) => !/serviceWorker/.test(e));
      assert.deepStrictEqual(errors, [], errors.join(" | "));
      await q.context().close();
    });

    await test("a watched folder's files go into the collection picked for it (1.28.0, 1.28.1)", async () => {
      const q = await page(browser, 390);
      const bytes = [...epubBytes()];
      const got = await q.evaluate(async (b) => {
        const F = window.Waypage.platform.files;
        const book = new File([new Uint8Array(b)], "plain.epub", { type: "application/epub+zip" });
        Object.defineProperty(F, "canWatch", { get: () => true });
        F.scan = async () => ({ ok: true, name: "Books", files: [{ ref: "content://books/plain.epub", path: "Sci-fi/plain.epub", name: "plain.epub", size: book.size }] });
        F.blob = async () => book;
        localStorage.setItem("waypage.watches", JSON.stringify([{ tree: "content://books", name: "Books", into: "Novels" }]));
        await lookInFolder(false);
        return state.pages.map((p) => p.folder);
      }, bytes);
      assert.deepStrictEqual(got, ["Novels"], JSON.stringify(got));
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Library" }).click();
      const face = q.locator(".watch-into .dropdown-face");
      await face.waitFor();
      assert.strictEqual(await face.textContent(), "Novels");
      await face.click();
      await q.locator(".dropdown-item", { hasText: "Its subfolders" }).click();
      assert.strictEqual(await q.evaluate(() => watches()[0].into), undefined);
      await until(q, () => state.pages[0].folder === "Sci-fi");
      // Picking a collection moves the files already there (1.28.1).
      await q.evaluate(() => { window.prompt = () => "Google Drive"; });
      await face.click();
      await q.locator(".dropdown-item", { hasText: "New collection" }).click();
      await until(q, () => state.pages[0].folder === "Google Drive" && watches()[0].into === "Google Drive");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Saving has the switch for making full images smaller, on by default (1.18.0)", async () => {
      const q = await page(browser, 390);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Saving" }).click();
      const sw = q.locator("label.row", { hasText: "Make full images smaller" }).locator("input");
      await sw.waitFor();
      assert.strictEqual(await sw.isChecked(), true);
      assert.strictEqual(await q.evaluate(() => window.Waypage.save.compress), true);
      await sw.click();
      assert.strictEqual(await q.evaluate(() => window.Waypage.save.compress), false);
      assert.strictEqual(await q.evaluate(() => localStorage.getItem("waypage.compress")), "false");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the section being read names the Contents button; the bottom shows minutes left, the page in Pages, and the percent (1.37.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        let body = "<header class='co-head'><p class='co-meta'>example.com · saved 1 Jan 2026 · 20 min</p><h1>Clip</h1></header><p>Before any section.</p>";
        for (const s of ["First part", "Second part", "Third part"]) body += "<h2>" + s + "</h2>" + "<p>Words of this part, enough of them to fill a screen and then some more.</p>".repeat(30);
        const meta = { id: "secs01", url: "https://example.com/secs", title: "Clip", site: "example.com", savedAt: 100, minutes: 20, mode: "links", at: 0 };
        await window.Waypage.store.writeIndex([meta]);
        await window.Waypage.store.writePage("secs01", "<!doctype html><html><head></head><body>" + body + "</body></html>", meta);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      await q.evaluate(() => openPage("secs01"));
      await until(q, () => !document.getElementById("readerContents").hidden);
      const top = await q.evaluate(() => document.getElementById("readerNow").textContent);
      // The line over the title drops the length an older save wrote.
      assert.strictEqual(await q.evaluate(() => document.getElementById("readerFrame").contentDocument.querySelector(".co-meta").textContent), "example.com · saved 1 Jan 2026");
      await q.evaluate(() => { const w = document.getElementById("readerFrame").contentWindow; w.scrollTo(0, w.document.querySelectorAll("h2")[1].offsetTop + 400); });
      await until(q, () => document.getElementById("readerNow").textContent === "Second part");
      const scroll = await q.evaluate(() => ({ label: document.getElementById("readerContents").getAttribute("aria-label"), left: document.getElementById("readSection").innerText, pct: document.getElementById("readLeft").textContent }));
      assert.strictEqual(top, "Contents");
      assert.strictEqual(scroll.label, "Contents, now Second part");
      // A phone shows only the list icon; the name is for wider screens.
      const shown = await q.evaluate(() => ({ now: getComputedStyle(document.getElementById("readerNow")).display, wide: innerWidth >= 700 }));
      assert.strictEqual(shown.now === "none", !shown.wide, "section name display " + shown.now);
      assert.match(scroll.left, /^\d+ min left$/);
      assert.match(scroll.pct, /^\d+%$/);
      await q.evaluate(() => document.getElementById("readerView").classList.remove("bar-away"));
      await q.click("#readerContents");
      await q.locator("#readingSheet:not([hidden])").waitFor();
      assert.strictEqual(await q.locator(".contents-row[aria-current]").innerText(), "Second part");
      await q.evaluate(() => history.back());
      await q.evaluate(() => setReading({ layout: "pages" }));
      await until(q, () => !!document.querySelector("#readSection .read-page"));
      const paged = await q.evaluate(() => document.getElementById("readSection").innerText.split("\n"));
      assert.match(paged[0], /^\d+\/\d+$/);
      assert.match(paged[1], /^\d+ min left$/);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a book's own contents are listed when its chapter titles aren't headings (1.27.2)", async () => {
      const q = await page(browser, 390);
      const bytes = [...epubBytes()];
      const id = await q.evaluate(async (b) => {
        const file = new File([new Uint8Array(b)], "plain.epub", { type: "application/epub+zip" });
        const meta = await window.Waypage.files.bring(file, "epub", { has: () => false });
        const list = await window.Waypage.store.readIndex();
        await window.Waypage.store.writeIndex([meta, ...list]);
        return meta.id;
      }, bytes);
      await q.reload();
      await q.locator(".page-card", { hasText: "Plain Chapters" }).first().click();
      await q.locator("#readerView:not([hidden])").waitFor();
      await frameText(q).getByText("Words of the first part").first().waitFor();
      await until(q, () => !document.getElementById("readerContents").hidden);
      const heads = await q.evaluate(() => window.Waypage.reader.headings());
      assert.deepStrictEqual(heads.map((h) => h.text), ["The First Part", "A Later Scene", "The Second Part"]);
      assert.deepStrictEqual(heads.map((h) => h.level), [2, 3, 2]);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a Kindle book (MOBI) opens with its contents, link, picture and cover; a locked one says so (1.42.0)", async () => {
      const q = await page(browser, 390);
      const got = await q.evaluate(async ([b, locked]) => {
        const F = window.Waypage.files;
        const file = new File([new Uint8Array(b)], "kindle.mobi");
        const kind = await F.kindOf(file);
        const meta = await F.bring(file, kind, { has: () => false });
        const list = await window.Waypage.store.readIndex();
        await window.Waypage.store.writeIndex([meta, ...list]);
        let refused = "";
        try { await F.bring(new File([new Uint8Array(locked)], "locked.azw3"), "azw3", { has: () => false }); } catch (e) { refused = e.message; }
        return { kind, title: meta.title, byline: meta.byline, site: meta.site, images: meta.images, thumb: !!meta.thumb, refused, lockedKind: await F.kindOf(new File([new Uint8Array(locked)], "locked.azw3")) };
      }, [[...mobiBytes(false)], [...mobiBytes(true)]]);
      assert.strictEqual(got.kind, "mobi");
      assert.strictEqual(got.lockedKind, "azw3");
      assert.strictEqual(got.title, "A Kindle Book");
      assert.strictEqual(got.byline, "Ada Writer");
      assert.strictEqual(got.site, "MOBI");
      assert.ok(got.images >= 1, "no picture");
      assert.ok(/DRM/.test(got.refused), got.refused);
      await q.reload();
      await q.locator(".page-card", { hasText: "A Kindle Book" }).first().click();
      await q.locator("#readerView:not([hidden])").waitFor();
      await frameText(q).getByText("Words of the opening").first().waitFor();
      const heads = await q.evaluate(() => window.Waypage.reader.headings().map((h) => h.text));
      assert.ok(heads.includes("The Opening") && heads.includes("The Crossing"), heads.join(", "));
      const link = await q.frameLocator("#readerFrame").locator("a", { hasText: "Go to the crossing" }).getAttribute("href");
      assert.ok(/^#c\d+-/.test(link || ""), link);
      const id = link.slice(1);
      assert.ok(await q.frameLocator("#readerFrame").locator('[id="' + id + '"]').count(), "the link lands nowhere");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("an FB2 book in windows-1251 opens with its author, chapters, poem and notes (1.42.0)", async () => {
      const q = await page(browser, 390);
      const got = await q.evaluate(async (b) => {
        const F = window.Waypage.files;
        const file = new File([new Uint8Array(b)], "winter.fb2");
        const kind = await F.kindOf(file);
        const meta = await F.bring(file, kind, { has: () => false });
        const list = await window.Waypage.store.readIndex();
        await window.Waypage.store.writeIndex([meta, ...list]);
        return { kind, title: meta.title, byline: meta.byline, lang: meta.lang, thumb: !!meta.thumb };
      }, [...fb2Bytes()]);
      assert.deepStrictEqual(got, { kind: "fb2", title: "Зимняя книга", byline: "Иван Петров", lang: "ru", thumb: true });
      await q.reload();
      await q.locator(".page-card", { hasText: "Зимняя книга" }).first().click();
      await q.locator("#readerView:not([hidden])").waitFor();
      await frameText(q).getByText("Слова первой главы").first().waitFor();
      const heads = await q.evaluate(() => window.Waypage.reader.headings().map((h) => h.text));
      assert.ok(heads.includes("Первая глава") && heads.includes("Вторая глава"), heads.join(", "));
      assert.ok(await frameText(q).getByText("Строка две").count());
      assert.strictEqual(await q.frameLocator("#readerFrame").locator('a[href="#f-n1"]').count(), 1);
      assert.strictEqual(await q.frameLocator("#readerFrame").locator('[id="f-n1"]').count(), 1);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("a long book lays out as it's read, fills its pictures near the screen, and opens at its place (1.29.0)", async () => {
      const q = await page(browser, 390);
      const bytes = [...longEpubBytes()];
      const id = await q.evaluate(async (b) => {
        const book = new File([new Uint8Array(b)], "long.epub", { type: "application/epub+zip" });
        window.Waypage.platform.files.blob = async () => book;
        const meta = await window.Waypage.files.bring(book, "epub", { has: () => false, link: "content://books/long.epub" });
        const html = await window.Waypage.store.readPage(meta.id);
        const slots = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("img[data-in]")];
        if (slots.length !== 200 || !slots.every((s) => s.getAttribute("width") === "1")) throw new Error("slots " + slots.length + " sized " + slots.map((s) => s.getAttribute("width")));
        await window.Waypage.store.writeIndex([meta, ...await window.Waypage.store.readIndex()]);
        return meta.id;
      }, bytes);
      const reopen = async () => {
        await q.reload();
        await q.evaluate(async (b) => {
          const book = new File([new Uint8Array(b)], "long.epub");
          window.Waypage.platform.files.blob = async () => book;
        }, bytes);
        await q.evaluate((id) => openPage(id), id);
        await until(q, () => !document.getElementById("readerView").classList.contains("waiting") && state.open);
        await q.evaluate(() => window.Waypage.reader.placed());
      };
      await reopen();
      const look = () => q.evaluate(() => {
        const d = document.getElementById("readerFrame").contentDocument;
        return { lazy: d.querySelectorAll(".co-lazy").length, filled: d.querySelectorAll("img[data-at]").length, waiting: d.querySelectorAll("img[data-in]").length,
          guessed: [...d.querySelectorAll(".co-lazy")].filter((c) => /auto \d+px/.test(c.style.containIntrinsicBlockSize)).length, y: d.defaultView.scrollY, spot: window.Waypage.reader.spot() };
      });
      let got = await look();
      assert.strictEqual(got.lazy, 200, "chunks " + got.lazy);
      assert.strictEqual(got.guessed, 200, "guessed " + got.guessed);
      assert.ok(got.filled >= 1 && got.waiting >= 150, "filled " + got.filled + ", waiting " + got.waiting);
      // Pages needs the whole book laid out.
      await q.evaluate(() => window.Waypage.reader.setPaged(true));
      assert.strictEqual((await look()).lazy, 0);
      await q.evaluate(() => window.Waypage.reader.setPaged(false));
      assert.strictEqual((await look()).lazy, 200);
      // Left at 60%: reopened there, by its spot, with the chapters before
      // it still at their guessed heights.
      await q.evaluate(() => window.Waypage.reader.jump(0.6, ""));
      await q.waitForTimeout(400);
      const left = await look();
      assert.ok(left.y > 1000 && /^\d+\/\d+c$/.test(left.spot), "left at " + left.y + " " + left.spot);
      await q.evaluate((s) => { state.pages[0].at = 0.6; state.pages[0].spot = s; return window.Waypage.store.writeIndex(state.pages); }, left.spot);
      await reopen();
      got = await look();
      assert.ok(Math.abs(Number(got.spot.split("/")[0]) - Number(left.spot.split("/")[0])) <= 1, "back at " + got.spot + ", left at " + left.spot);
      // The scroll back to the place has the pictures there read.
      await until(q, () => { const d = document.getElementById("readerFrame").contentDocument; return [...d.querySelectorAll("img[data-at]")].some((i) => { const r = i.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2; }); });
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("the place is the line across the middle, and leaving right after a scroll keeps it (1.30.2)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        let body = "";
        for (let i = 0; i < 120; i++) body += "<p>P" + i + " " + "word ".repeat(20 + (i * 37) % 90) + "</p>";
        const meta = { id: "mid1", url: "https://example.com/mid1", title: "Middle", site: "example.com", savedAt: 100, minutes: 30, mode: "links", at: 0 };
        await window.Waypage.store.writeIndex([meta]);
        await window.Waypage.store.writePage("mid1", "<!doctype html><html><body>" + body + "</body></html>", meta);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const open = async () => {
        await q.evaluate(() => openPage("mid1"));
        await until(q, () => state.open);
        await q.evaluate(() => window.Waypage.reader.placed());
        await q.waitForTimeout(500);
      };
      // The block on the middle line, and its spot.
      const mid = () => q.evaluate(() => {
        const d = document.getElementById("readerFrame").contentDocument, w = d.defaultView;
        const bar = document.querySelector("#readerView .reader-bar").offsetHeight, foot = document.getElementById("readFoot").offsetHeight;
        const y = bar + (w.innerHeight - bar - foot) / 2;
        return [...d.querySelectorAll("p")].find((p) => p.getBoundingClientRect().bottom > y).textContent.split(" ")[0];
      });
      await open();
      await q.evaluate(() => document.getElementById("readerFrame").contentWindow.scrollTo(0, 5000));
      await q.waitForTimeout(600);
      const spot = await q.evaluate(() => state.open.spot);
      assert.ok(/c$/.test(spot), "spot " + spot);
      assert.strictEqual("P" + spot.split("/")[0], await mid());
      // Scrolled, then straight out through the widget, before the place
      // was noted: back at the new place.
      await q.evaluate(() => document.getElementById("readerFrame").contentWindow.scrollBy(0, 3000));
      await q.waitForTimeout(20);
      const was = await mid();
      await q.evaluate(() => toLibrary());
      await open();
      assert.strictEqual(await mid(), was);
      // A spot from before the reading line still goes back to the top edge.
      await q.evaluate(() => { const p = state.pages[0]; p.spot = "40/0"; return toLibrary(); });
      await open();
      const top = await q.evaluate(() => {
        const d = document.getElementById("readerFrame").contentDocument;
        const edge = document.querySelector("#readerView .reader-bar").offsetHeight + 8;
        return [...d.querySelectorAll("p")].find((p) => p.getBoundingClientRect().bottom > edge).textContent.split(" ")[0];
      });
      assert.strictEqual(top, "P40");
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("Send to Waypage saves the page as the browser shows it, after Save is pressed (1.34.0)", async () => {
      const q = await page(browser, 390);
      await q.click("#settingsBtn");
      await q.locator(".nav-row", { hasText: "Saving" }).click();
      const href = await q.locator("#sendSection a").getAttribute("href");
      assert.ok(/^javascript:/.test(href));
      const src = await q.context().newPage();
      await src.goto(ARTICLE);
      await src.evaluate(() => {
        const p = document.createElement("p");
        p.textContent = "Only the open tab has this paragraph, written after the page loaded.";
        document.querySelector("article, main, body").append(p);
      });
      const [win] = await Promise.all([q.context().waitForEvent("page"), src.evaluate(decodeURIComponent(href.slice("javascript:".length)))]);
      win.errors = [];
      win.on("pageerror", (e) => win.errors.push(e.message));
      const save = win.locator("#menuSheet button", { hasText: "Save this page" });
      await save.waitFor({ timeout: 15000 });
      assert.strictEqual(await win.evaluate(() => state.pages.length), 0, "nothing is kept before Save");
      await save.click();
      await until(win, () => state.pages.length === 1, null, 15000);
      const html = await win.evaluate(() => window.Waypage.store.readPage(state.pages[0].id));
      assert.ok(/Only the open tab has this paragraph/.test(html));
      assert.strictEqual(await win.evaluate(() => state.pages[0].url), ARTICLE);
      assert.strictEqual(await win.evaluate(() => location.hash), "");
      // A page claiming to be another site's is turned away.
      const [forged] = await Promise.all([q.context().waitForEvent("page"), src.evaluate((home) => {
        const w = window.open(home + "#send");
        addEventListener("message", (e) => {
          if (e.source === w && e.data && e.data.waypage === "ready") w.postMessage({ waypage: "page", url: "https://example.com/news", title: "Not you", html: "<p>forged</p>" }, "*");
        });
      }, ROOT)]);
      await forged.locator("#toast", { hasText: "couldn't be sent" }).waitFor({ timeout: 15000 });
      assert.strictEqual(await forged.locator("#menuSheet button", { hasText: "Save this page" }).count(), 0);
      assert.deepStrictEqual(win.errors, [], win.errors.join(" | "));
      await q.context().close();
    });

    await test("a clip's linked pages can be picked and saved (1.38.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async ([a, n]) => {
        const S = window.Waypage.store;
        const c = { id: "links1", url: "https://example.com/start", title: "Start", site: "example.com", savedAt: 1, minutes: 1, mode: "links", at: 0 };
        await S.writeIndex([c]);
        await S.writePage("links1", "<!doctype html><html><body><h1>Start</h1><p>Read <a href=\"" + a + "\">the article</a>, <a href=\"" + n + "\">the notes</a>, <a href=\"" + a + "#x\">the article again</a> and <a href=\"#top\">the top</a>.</p></body></html>", c);
      }, [ARTICLE, NOTES]);
      await q.reload();
      await q.waitForSelector("#saveUrl");
      await q.evaluate(() => openPage("links1"));
      await until(q, () => !!(state.open && window.Waypage.reader.links(state.open.url).length));
      await q.evaluate(() => openSheet("links"));
      assert.strictEqual(await q.locator(".links-list .choice").count(), 2, "each page once, no jumps within the clip: " + JSON.stringify(await q.evaluate(() => window.Waypage.reader.links(state.open.url))));
      await q.click(".links-bar .btn-small");
      assert.strictEqual(await q.textContent(".links-go"), "Save 2 clips");
      await q.click(".links-go");
      await until(q, () => state.pages.length === 3, null, 20000);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("update from the site keeps the clip in its place (1.38.0)", async () => {
      const q = await page(browser, 390);
      await q.fill("#saveUrl", ARTICLE);
      await q.press("#saveUrl", "Enter");
      await until(q, () => state.pages.length === 1, null, 15000);
      const id = await q.evaluate(() => { const p = state.pages[0]; p.tags = ["kept"]; p.at = 0.4; return p.id; });
      await q.evaluate(() => updateClip(state.pages[0]));
      await until(q, () => state.pages.length === 1 && !state.saving.length && /up to date/.test(document.getElementById("toast").textContent), null, 15000);
      const now = await q.evaluate(() => ({ id: state.pages[0].id, tags: state.pages[0].tags, at: state.pages[0].at }));
      assert.notStrictEqual(now.id, id, "the new copy took the old one's place");
      assert.deepStrictEqual(now.tags, ["kept"]);
      assert.strictEqual(now.at, 0.4);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    await test("reading stats count time, words and saves (1.38.0)", async () => {
      const q = await page(browser, 390);
      await q.fill("#saveUrl", ARTICLE);
      await q.press("#saveUrl", "Enter");
      await until(q, () => state.pages.length === 1, null, 15000);
      await q.evaluate(() => openPage(state.pages[0].id));
      await q.waitForTimeout(1200);
      await q.evaluate(() => { window.Waypage.stats.position(state.open.id, 0.5, 400); window.Waypage.stats.closed(); });
      const day = await q.evaluate(() => Object.values(window.Waypage.stats.all().days)[0]);
      assert.strictEqual(day.saved, 1);
      assert.strictEqual(day.opened, 1);
      assert.ok(day.readMs > 0, "reading time counted");
      assert.strictEqual(day.words, 200);
      await q.context().close();
    });

    await test("minutes go by your own pace, and reading stops counting a screen's time after the last scroll (1.41.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const c = { id: "pace01", url: "https://example.com/pace01", title: "Pace", site: "example.com", savedAt: 1001, minutes: 10, mode: "links", at: 0 };
        await window.Waypage.store.writeIndex([c]);
        await window.Waypage.store.writePage("pace01", "<!doctype html><html><body><p>Words.</p></body></html>", c);
      });
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const got = await q.evaluate(async () => {
        await new Promise((ok) => { const t = setInterval(() => { if (state.pages.length) { clearInterval(t); ok(); } }, 50); });
        const S = window.Waypage.stats, p = state.pages[0];
        const before = [S.pace(), S.paceKnown(), readingLine(p)];
        // Another device read 4,600 words by eye in 10 minutes: 460 a minute.
        S.take("otherdevice4", { since: 1, days: { [S.dayKey(Date.now())]: { readMs: 600000, words: 4600, paceWords: 4600, paceMs: 600000 } } });
        await new Promise((ok) => setTimeout(ok, 0));
        const after = [S.pace() === 230 ? "cached" : S.pace()];
        return { before, after };
      });
      assert.deepStrictEqual(got.before, [230, false, "10 min"]);
      // The pace is worked out once a minute; a fresh page sees the other device's at once.
      await q.reload();
      await q.waitForSelector("#saveUrl");
      const now = await q.evaluate(async () => {
        await new Promise((ok) => { const t = setInterval(() => { if (state.pages.length) { clearInterval(t); ok(); } }, 50); });
        const S = window.Waypage.stats, p = state.pages[0];
        const line = readingLine(p);
        openPage(p.id);
        await new Promise((ok) => { const t = setInterval(() => { if (state.open) { clearInterval(t); ok(); } }, 50); });
        return { pace: S.pace(), known: S.paceKnown(), line, few: S.screen(30), screenful: S.screen(230), lots: S.screen(10000) };
      });
      assert.deepStrictEqual(now, { pace: 460, known: true, line: "5 min", few: 20000, screenful: 45000, lots: 90000 });
      await q.context().close();
    });

    await test("app lock: a passcode, a wait after wrong tries, and erasing (1.38.0)", async () => {
      const q = await page(browser, 390);
      await q.evaluate(() => openSettings(false, "lock"));
      await q.click("text=Turn on app lock");
      await q.keyboard.type("2580");
      await q.click("#lockNext");
      await q.keyboard.type("2580");
      await q.click("#lockNext");
      await until(q, () => !lockUp() && !!localStorage.getItem("waypage.lock"));
      assert.ok(!/2580/.test(await q.evaluate(() => localStorage.getItem("waypage.lock"))), "only a hash is kept");
      await q.reload();
      await until(q, () => typeof lockUp === "function" && lockUp());
      assert.ok(await q.evaluate(() => getComputedStyle(document.getElementById("libraryView")).visibility === "hidden"), "the library is hidden");
      for (let i = 0; i < 5; i++) { await q.keyboard.type("1111"); await q.waitForTimeout(500); }
      assert.ok(/Too many wrong tries/.test(await q.textContent("#lockNote")));
      await q.evaluate(() => localStorage.setItem("waypage.lockTries", JSON.stringify({ n: 5, until: 0 })));
      await q.evaluate(() => lockPaint());
      await q.keyboard.type("2580");
      await until(q, () => !lockUp());
      await q.evaluate(() => { localStorage.setItem("waypage.theme", JSON.stringify("night")); lockShow("unlock"); });
      await q.click("#lockForgot");
      await q.click("#lockEraseGo");
      await q.waitForTimeout(1500);
      await q.waitForSelector("#saveUrl");
      assert.strictEqual(await q.evaluate(() => localStorage.getItem("waypage.lock")), null);
      assert.strictEqual(await q.evaluate(() => localStorage.getItem("waypage.theme")), null, "settings went too");
      assert.ok(!(await q.evaluate(() => lockUp())));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    // Newsletters (1.43.0): a Kill the Newsletter feed, its sender and
    // confirm link read, the footer link gone from the saved clip, and the
    // email kept out of Feeds.
    await test("newsletters: an address's emails, confirm link, saved as a clip", async () => {
      const q = await page(browser, 390);
      const feed = "https://kill-the-newsletter.com/feeds/testbox1.xml";
      const entry = "https://kill-the-newsletter.com/feeds/testbox1/entries/m1.html";
      const xml = '<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Morning</title>'
        + '<entry><id>urn:kill-the-newsletter:c1</id><link rel="alternate" type="text/html" href="https://kill-the-newsletter.com/feeds/testbox1/entries/c1.html"/>'
        + '<published>2026-10-27T08:00:00.000Z</published><author><name>x</name><email>bounce-mc.us5_1@mail1.mcsv.net</email></author><title>Please confirm your subscription</title>'
        + '<content type="html">' + '<p><a href="https://list.example.com/unsubscribe">Unsubscribe</a> <a href="https://list.example.com/confirm?id=9">Yes, subscribe me</a></p>'.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</content></entry>'
        + '<entry><id>urn:kill-the-newsletter:m1</id><link rel="alternate" type="text/html" href="' + entry + '"/>'
        + '<published>2026-10-27T09:00:00.000Z</published><author><name>x</name><email>crew@morningbrew.com</email></author><title>Chip wars heat up</title>'
        + '<content type="html">' + ('<h1>Morning Brew</h1>' + '<p>' + 'Chips are the new oil, and everyone wants a refinery. '.repeat(30) + '</p><hr/><p><small><a href="https://kill-the-newsletter.com/feeds/testbox1">Kill the Newsletter! feed settings</a></small></p>').replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</content></entry></feed>';
      const got = await q.evaluate(async ([xml, feed]) => {
        const parsed = C.feeds.parseFeed(xml, feed);
        keepMails(parsed);
        const f = { url: feed, title: "Morning", link: "", icon: "", mode: "show", images: "previews", folder: "Morning", days: MAIL_DAYS, addedAt: Date.now(), checkedAt: Date.now(), error: "", items: [] };
        mergeFeed(f, parsed);
        feeds.push(f);
        saveFeeds();
        await goPlace("newsletters");
        const confirm = f.items.find((it) => isConfirm(it));
        const mail = f.items.find((it) => !isConfirm(it));
        return { act: confirm.act, from: mail.from, sender: senderOf(f, mail), confirmSender: senderOf(f, confirm),
          rows: [...document.querySelectorAll("#newsletters .post-title")].map((n) => n.textContent), button: !!document.querySelector("#newsletters .nl-confirm"),
          address: document.querySelector("#newsletters .nl-mail").textContent, inFeeds: siteFeeds().length };
      }, [xml, feed]);
      assert.strictEqual(got.act, "https://list.example.com/confirm?id=9");
      assert.strictEqual(got.from, "crew@morningbrew.com");
      assert.strictEqual(got.sender, "Morningbrew");
      assert.strictEqual(got.confirmSender, "Morning", "a mailing service's bounce address falls back to the address's name");
      assert.deepStrictEqual(got.rows.map((t) => t.replace(/^Unread: /, "")), ["Chip wars heat up", "Please confirm your subscription"]);
      assert.ok(got.button, "the confirm email has a Confirm button");
      assert.strictEqual(got.address, "testbox1@kill-the-newsletter.com");
      assert.strictEqual(got.inFeeds, 0, "the address isn't in Feeds");
      await q.evaluate(() => { const f = mailBoxes()[0]; saveFeedPosts([{ f, it: f.items.find((it) => !isConfirm(it)) }]); });
      await until(q, (u) => !!savedAs(u), entry, 15000);
      const saved = await q.evaluate(async (u) => { const p = savedAs(u); return { title: p.title, site: p.site, folder: p.folder, html: await C.store.readPage(p.id) }; }, entry);
      assert.strictEqual(saved.title, "Chip wars heat up");
      assert.strictEqual(saved.site, "Morningbrew");
      assert.strictEqual(saved.folder, "Morning");
      assert.ok(/Chips are the new oil/.test(saved.html));
      assert.ok(!/feed settings/.test(saved.html), "Kill the Newsletter's settings link is gone");
      await q.evaluate(() => renderNewsletters());
      assert.ok(await q.evaluate(() => /Saved/.test(document.querySelector("#newsletters .feed-group").textContent)));
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.context().close();
    });

    for (const width of [390, 1280]) {
      for (const theme of THEMES) {
        await test("opens at " + width + " px in " + theme + " with no errors", async () => {
          const q = await page(browser, width, theme);
          await q.waitForTimeout(300);
          assert.strictEqual(await q.evaluate(() => document.documentElement.dataset.theme), theme);
          const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth);
          assert.ok(over <= 0, "scrolls sideways by " + over + " px");
          assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
          await q.context().close();
        });
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("\n" + passed + " passed" + (fails.length ? ", " + fails.length + " failed" : ""));
})().catch((e) => { console.error(e); process.exitCode = 1; });
