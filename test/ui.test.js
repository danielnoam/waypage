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
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { fails.push(name); console.error("  FAIL - " + name); console.error("    " + String(e.message).split("\n")[0]); process.exitCode = 1; }
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

    await test("a library of 400 clips draws every card, in steps", async () => {
      const q = await page(browser, 390);
      await q.evaluate(async () => {
        const list = [];
        for (let i = 0; i < 400; i++) list.push({ id: "big" + String(i).padStart(4, "0"), url: "https://example.com/" + i, title: "Clip " + i, site: "example.com", savedAt: 1e12 - i, minutes: 3, mode: "links", at: 0, finished: false });
        await window.Waypage.store.writeIndex(list);
      });
      await q.reload();
      await q.locator(".page-card").first().waitFor();
      await q.waitForFunction(() => document.querySelectorAll(".library .page-card").length >= 400, null, { timeout: 15000 });
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
      await q.locator(".nav-row", { hasText: "Edit clips" }).click();
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
      await top.click();
      await until(q, () => state.open && state.open.id === "ch1");
      await q.locator("#readerFolder").click();
      const rows = q.locator("#readingSheet .folder-row");
      await rows.first().waitFor();
      assert.strictEqual(await rows.count(), 3);
      assert.strictEqual(await rows.nth(0).getAttribute("aria-current"), "page");
      await rows.nth(2).click();
      await until(q, () => state.open && state.open.id === "ch3" && !state.sheet);
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
