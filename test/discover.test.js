// Discover: the hand-picked list, Royal Road's lists read from hand-made
// pages (test/fixtures/discover/), and the place itself in a phone-sized
// browser with the phone's fetch stood in for. `node test/discover.test.js`.
// Needs Playwright, like ui.test.js.
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

const PORT = 5800 + Math.floor(Math.random() * 500);
const ROOT = "http://localhost:" + PORT + "/";
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "discover", name), "utf8");
const SOURCE = fs.readFileSync(path.join(__dirname, "..", "src", "discover-list.js"), "utf8");

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

// A phone: page fetches answered from the fixtures (Royal Road) instead
// of the network, as CapacitorHttp would.
async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route((u) => !u.href.startsWith(ROOT), (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.discover && typeof goPlace === "function");
  await p.evaluate(([list, search]) => {
    const P = window.Waypage.platform;
    Object.defineProperty(P, "canFetchPages", { get: () => true });
    Object.defineProperty(P, "canReadPages", { get: () => true, configurable: true });
    window.asked = [];
    P.fetchText = async (url) => {
      window.asked.push(url);
      return { status: 200, url, text: /search\?title=/.test(url) ? search : list };
    };
  }, [fixture("rr-list.html"), fixture("rr-bare.html")]);
  return { ctx, p };
}

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("the hand-picked list is strict JSON between its markers, and every entry is whole", async () => {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      await p.goto(ROOT);
      await p.waitForFunction(() => window.Waypage && window.Waypage.discover);
      const got = await p.evaluate((src) => {
        const D = window.Waypage.discover;
        const parsed = D.fromSource(src), bundled = D.clean(window.Waypage.discoverList);
        return { parsed, raw: window.Waypage.discoverList.entries.length, same: JSON.stringify(parsed) === JSON.stringify(bundled) };
      }, SOURCE);
      await ctx.close();
      assert.ok(got.parsed, "fromSource read the file");
      assert.ok(got.same, "the markers hold the same list the script sets");
      assert.strictEqual(got.parsed.entries.length, got.raw, "no entry was dropped as malformed");
      const urls = new Set();
      for (const e of got.parsed.entries) {
        assert.ok(got.parsed.topics.includes(e.topic), e.name + " has a listed topic");
        assert.ok(e.about, e.name + " has a line about it");
        assert.ok(!urls.has(e.url), e.name + " isn't listed twice");
        urls.add(e.url);
        if (e.kind === "newsletter") assert.ok(e.signup, e.name + " has a sign-up page");
      }
    });

    await test("Royal Road's list rows read as stories, with cover, tags, chapters and rating", async () => {
      const { ctx, p } = await phone(browser);
      const items = await p.evaluate((html) => window.Waypage.discover.parseList(html, "https://www.royalroad.com/fictions/rising-stars"), fixture("rr-list.html"));
      await ctx.close();
      assert.strictEqual(items.length, 2);
      const [a, b] = items;
      assert.strictEqual(a.title, "The Ninth Lantern");
      assert.strictEqual(a.url, "https://www.royalroad.com/fiction/101/the-ninth-lantern");
      assert.strictEqual(a.cover, "https://www.royalroad.com/img/covers/101.jpg");
      assert.deepStrictEqual(a.tags, ["LitRPG", "Progression"]);
      assert.strictEqual(a.chapters, 212);
      assert.strictEqual(a.followers, 1234);
      assert.strictEqual(a.rating, 4.72);
      assert.match(a.about, /ninth lantern/);
      assert.strictEqual(b.title, "Salt and Static", "a chapter link in the row doesn't become its title");
      assert.strictEqual(b.chapters, 64);
    });

    await test("with none of Royal Road's classes, a story is still its link and title", async () => {
      const { ctx, p } = await phone(browser);
      const items = await p.evaluate((html) => window.Waypage.discover.parseList(html, "https://www.royalroad.com/fictions/search"), fixture("rr-bare.html"));
      const ids = await p.evaluate(() => ["https://www.royalroad.com/fiction/12/x", "https://royalroad.com/fiction/12", "https://www.royalroad.com/fiction/12/x/chapter/3/y", "https://example.com/fiction/12"].map(window.Waypage.discover.isStory));
      await ctx.close();
      assert.deepStrictEqual(items.map((s) => s.title), ["Moth Season", "A Quiet Siege"]);
      assert.strictEqual(items[0].cover, "https://www.royalroad.com/c/303.png");
      assert.strictEqual(items[0].chapters, 33);
      assert.strictEqual(items[1].cover, "", "a row with no picture has no cover");
      assert.deepStrictEqual(ids, [true, true, false, false]);
    });

    await test("Discover lists sites, newsletters and Royal Road; + opens the sheet that adds it", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("discover"));
      await p.locator("#discover .dz-book").first().waitFor();
      assert.strictEqual(await p.locator("#placeTitle").textContent(), "Discover");
      assert.ok(await p.locator("#discover .dz-row").count() > 20);
      assert.deepStrictEqual(await p.locator("#discover .section-head .overline").allTextContents(), ["Royal Road", "Feeds", "Newsletters"]);
      assert.strictEqual(await p.locator("#saveUrl").getAttribute("placeholder"), "Search Royal Road, or paste a site");
      // A site: the Add a feed sheet, its address filled in.
      await p.locator('#discover .dz-row:has-text("Quanta Magazine") .post-save').click();
      await p.locator('#menuSheet[data-kind="addFeed"]:not([hidden])').waitFor();
      assert.strictEqual(await p.locator("#menuSheet .feed-input").inputValue(), "https://www.quantamagazine.org/");
      await p.evaluate(() => history.back());
      await p.waitForFunction(() => !state.menu);
      // An email-only newsletter: the sign-up sheet.
      await p.locator('#discover .dz-row:has-text("Money Stuff") .post-save').click();
      await p.locator('#menuSheet[data-kind="signup"]:not([hidden])').waitFor();
      assert.match(await p.locator("#menuSheet").textContent(), /Comes by email only/);
      await p.evaluate(() => history.back());
      await p.waitForFunction(() => !state.menu);
      // A story: its sheet, then Save opens its chapters to check.
      await p.locator('#discover .dz-book:has-text("The Ninth Lantern")').click();
      await p.locator('#menuSheet[data-kind="story"]:not([hidden])').waitFor();
      const sheet = await p.locator("#menuSheet").textContent();
      assert.match(sheet, /212 chapters/);
      assert.match(sheet, /Save as a collection/);
      await ctx.close();
    });

    await test("a following site says so; chips narrow the list; words search Royal Road", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => {
        feeds.push({ url: "https://aeon.co/feed.rss", title: "Aeon", link: "https://aeon.co/", days: 7, mode: "show", items: [] });
        goPlace("discover");
      });
      await p.locator("#discover .dz-row").first().waitFor();
      assert.match(await p.locator('#discover .dz-row:has-text("Aeon")').textContent(), /Following/);
      await p.locator('#discover .chip:has-text("Newsletters")').click();
      assert.strictEqual(await p.locator("#discover .dz-book").count(), 0, "no stories under Newsletters");
      assert.ok(await p.locator('#discover .dz-row:has-text("Quanta")').count() === 0);
      assert.ok(await p.locator('#discover .dz-row:has-text("Slow Boring")').count() === 0, "a newsletter with a feed is under Feeds, not Newsletters");
      assert.ok(await p.locator('#discover .dz-row:has-text("Money Stuff")').count() === 1);
      await p.locator('#discover .chip:has-text("Science")').click();
      assert.ok(await p.locator('#discover .dz-row:has-text("Quanta")').count() === 1);
      await p.fill("#saveUrl", "moth");
      await p.press("#saveUrl", "Enter");
      await p.locator('#discover .section-head:has-text("Royal Road · moth")').waitFor();
      assert.ok((await p.evaluate(() => window.asked)).some((u) => u.endsWith("/fictions/search?title=moth")));
      assert.strictEqual(await p.locator("#discover .dz-book").count(), 2);
      await ctx.close();
    });

    await test("when Royal Road's page has no stories, Discover says why and shows no stray text", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => { Waypage.platform.fetchText = async (url) => ({ status: 200, url, text: "<html><head><title>Just a moment...</title></head><body></body></html>" }); goPlace("discover"); });
      await p.locator("#discover .dz-src.warn").waitFor();
      const text = await p.locator("#discover").textContent();
      await ctx.close();
      assert.ok(!/null|undefined/.test(text), "no null or undefined in the page");
      assert.match(text, /no stories were found/);
      assert.match(text, /Just a moment/);
    });

    await test("turned away by Cloudflare, Royal Road's list is read through the hidden browser", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate((list) => {
        const P = Waypage.platform;
        P.fetchText = async (url) => ({ status: 403, url, text: "<html><head><title>Just a moment...</title></head></html>" });
        Object.defineProperty(P, "canRender", { get: () => true, configurable: true });
        window.drawn = [];
        P.render = async (url) => { window.drawn.push(url); return { text: list, url }; };
        goPlace("discover");
      }, fixture("rr-list.html"));
      await p.locator("#discover .dz-book").first().waitFor();
      assert.deepStrictEqual(await p.evaluate(() => window.drawn), ["https://www.royalroad.com/fictions/rising-stars"]);
      assert.strictEqual(await p.locator("#discover .dz-book").count(), 2);
      await ctx.close();
    });

    await test("a swipe moves to the next chip, as in Feeds", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("discover"));
      await p.locator("#discover .dz-row").first().waitFor();
      const swipe = async (x0, x1) => p.evaluate(([a, b]) => {
        const root = document.getElementById("discover");
        const row = root.querySelector(".section-head");
        const r = row.getBoundingClientRect(), y = r.top + 20;
        const t = (x) => new Touch({ identifier: 1, target: row, clientX: x, clientY: y });
        row.dispatchEvent(new TouchEvent("touchstart", { touches: [t(a)], changedTouches: [t(a)], bubbles: true }));
        for (let i = 1; i <= 6; i++) row.dispatchEvent(new TouchEvent("touchmove", { touches: [t(a + (b - a) * i / 6)], changedTouches: [t(a + (b - a) * i / 6)], bubbles: true }));
        row.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(b)], bubbles: true }));
      }, [x0, x1]);
      await swipe(320, 40);
      await p.waitForFunction(() => document.querySelector("#discover .chip.on").textContent === "Stories");
      await swipe(40, 320);
      await p.waitForFunction(() => document.querySelector("#discover .chip.on").textContent === "All");
      await ctx.close();
    });

    await test("the web copy hides Royal Road and says where it works", async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const p = await ctx.newPage();
      await p.goto(ROOT);
      await p.waitForFunction(() => typeof goPlace === "function" && window.Waypage.discover);
      await p.evaluate(() => goPlace("discover"));
      await p.locator("#discover .dz-row").first().waitFor();
      assert.strictEqual(await p.locator("#discover .dz-book").count(), 0);
      await p.locator('#discover .chip:has-text("Stories")').click();
      assert.match(await p.locator("#discover").textContent(), /on your phone/);
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
