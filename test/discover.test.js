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
      assert.deepStrictEqual((await p.locator("#discover .section-head .overline").allTextContents()).map((t) => t.replace("›", "")), ["Sites", "Feeds", "Newsletters"]);
      assert.ok(!(await p.locator("#saveForm").isVisible()), "no field at the bottom");
      assert.strictEqual(await p.locator("#discover .dz-search input").getAttribute("placeholder"), "Search Discover");
      // A site: the Add a feed sheet, its address filled in.
      await p.locator('#discover .dz-row:has-text("Quanta Magazine") .post-save').click();
      await p.locator('#menuSheet[data-kind="addFeed"]:not([hidden])').waitFor();
      assert.strictEqual(await p.locator("#menuSheet .feed-input").inputValue(), "https://www.quantamagazine.org/feed/");
      await p.evaluate(() => history.back());
      await p.waitForFunction(() => !state.menu);
      // An email-only newsletter: the sign-up sheet.
      await p.locator('#discover .dz-row:has-text("Money Stuff") .post-save').click();
      await p.locator('#menuSheet[data-kind="signup"]:not([hidden])').waitFor();
      assert.match(await p.locator("#menuSheet").textContent(), /Comes by email only/);
      assert.strictEqual(await p.locator('#menuSheet .chip.on').textContent(), "New address", "a new address is picked first");
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

    await test("a following site says so; chips narrow the list; the top field searches what's shown", async () => {
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
      await p.locator('#discover .chip:has-text("Feeds")').click();
      assert.ok(await p.locator('#discover .dz-row:has-text("Quanta")').count() === 1);
      assert.deepStrictEqual(await p.locator("#discover .chip").allTextContents(), ["All", "Sites", "Feeds", "Newsletters"]);
      // Under Feeds the field narrows the feeds as you type.
      await p.fill("#discover .dz-search input", "quanta");
      assert.strictEqual(await p.locator("#discover .dz-row").count(), 1);
      assert.strictEqual(await p.locator("#discover .dz-search input").getAttribute("placeholder"), "Search feeds");
      // Under All, Enter asks Royal Road too.
      await p.locator('#discover .chip:has-text("All")').click();
      await p.fill("#discover .dz-search input", "moth");
      await p.press("#discover .dz-search input", "Enter");
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
      assert.strictEqual(await p.evaluate(() => window.drawn[0]), "https://www.royalroad.com/fictions/rising-stars");
      assert.strictEqual(await p.locator('#discover .dz-book:has-text("Royal Road")').count(), 2);
      await ctx.close();
    });

    await test("Royal Road's heading opens Sites: a grid with lists, genres and more pages", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("discover"));
      await p.locator("#discover .dz-book").first().waitFor();
      await p.locator('#discover .section-link:has-text("Sites")').click();
      await p.locator("#discover .dz-grid .dz-book").first().waitFor();
      assert.strictEqual(await p.locator("#discover .chip.on").textContent(), "Sites");
      assert.strictEqual(await p.locator("#discover .dz-row").count(), 0, "only stories under Sites");
      // Page 2 is the same fixture: nothing new, so the list says it's all.
      await p.locator("#discover .dz-more").click();
      await p.locator('#discover .footnote:has-text("all of them")').waitFor();
      let asked = await p.evaluate(() => window.asked);
      assert.ok(asked.some((u) => u === "https://www.royalroad.com/fictions/rising-stars?page=2"), asked.join(" "));
      // A genre reads Royal Road's search with that tag.
      await p.locator("#discover .dz-tools .dropdown").nth(2).locator(".dropdown-btn").click();
      await p.locator('[role="option"]:has-text("Horror")').click();
      await p.locator("#discover .dz-grid .dz-book").first().waitFor();
      asked = await p.evaluate(() => window.asked);
      assert.ok(asked.some((u) => /\/fictions\/search\?tagsAdd=horror&orderBy=popularity$/.test(u)), asked.join(" "));
      // FictionPress: its own lists by category.
      await p.evaluate((fp) => { const P = Waypage.platform, rr = P.fetchText; P.fetchText = async (url) => (/fictionpress/.test(url) ? (window.asked.push(url), { status: 200, url, text: fp }) : rr(url)); }, fixture("fp-list.html"));
      await p.locator("#discover .dz-tools .dropdown").first().locator(".dropdown-btn").click();
      await p.locator('[role="option"]:has-text("FictionPress")').click();
      await p.locator('#discover .dz-grid .dz-book:has-text("The Salt Road")').waitFor();
      asked = await p.evaluate(() => window.asked);
      assert.ok(asked.some((u) => u.startsWith("https://www.fictionpress.com/fiction/Fantasy/")), asked.join(" "));
      await p.locator('#discover .dz-book:has-text("The Salt Road")').click();
      assert.match(await p.locator("#menuSheet").textContent(), /34 chapters[\s\S]*FictionPress|FictionPress[\s\S]*34 chapters/);
      await p.evaluate(() => history.back());
      await p.waitForFunction(() => !state.menu);
      // Web serials: the hand-picked ones, narrowed by the field.
      await p.locator("#discover .dz-tools .dropdown").first().locator(".dropdown-btn").click();
      await p.locator('[role="option"]:has-text("Web serials")').click();
      assert.ok(await p.locator("#discover .dz-serials .dz-row").count() >= 5);
      await p.fill("#discover .dz-search input", "katalepsis");
      assert.strictEqual(await p.locator("#discover .dz-serials .dz-row").count(), 1);
      await ctx.close();
    });

    await test("All's Sites row mixes the story sites; a web serial's whole contents page is read", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate((fp) => { const P = Waypage.platform, rr = P.fetchText; P.fetchText = async (url) => (/fictionpress/.test(url) ? { status: 200, url, text: fp } : rr(url)); goPlace("discover"); }, fixture("fp-list.html"));
      await p.locator('#discover .dz-book:has-text("FictionPress")').first().waitFor();
      const metas = await p.locator("#discover .dz-covers .dz-bm").allTextContents();
      assert.deepStrictEqual(metas.slice(0, 3).map((m) => m.split(" · ")[0]), ["Royal Road", "FictionPress", "Web serial"]);
      // Two arcs in two lists: both, in order, and not the blog's own links.
      const got = await p.evaluate(() => Waypage.discover.serialLinks('<html><head><meta property="og:site_name" content="Worm"></head><body><nav><a href="/about/">About</a></nav><div class="entry-content"><p>Arc 1</p><ul><li><a href="/2011/06/11/gestation-1-1/">1.1</a></li><li><a href="/2011/06/14/gestation-1-2/">1.2</a></li></ul><p>Arc 2</p><ul><li><a href="/2011/06/25/insinuation-2-1/">2.1</a></li><li><a href="https://parahumans.wordpress.com/2011/06/28/insinuation-2-2/#more">2.2</a></li></ul><a href="/category/stories-arcs-1-10/">Arcs</a><a href="https://twitter.com/x">Share</a></div></body></html>', "https://parahumans.wordpress.com/table-of-contents/"));
      await ctx.close();
      assert.strictEqual(got.title, "Worm");
      assert.deepStrictEqual(got.links, ["https://parahumans.wordpress.com/2011/06/11/gestation-1-1/", "https://parahumans.wordpress.com/2011/06/14/gestation-1-2/",
        "https://parahumans.wordpress.com/2011/06/25/insinuation-2-1/", "https://parahumans.wordpress.com/2011/06/28/insinuation-2-2/"]);
    });

    await test("every story site's pages read as stories", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate((f) => {
        const D = Waypage.discover, pick = (l) => l.map((s) => [s.id, s.url, s.title, s.chapters, !!s.cover, s.tags.join("/"), s.stat || ""]);
        return {
          wp: pick(D.parseWattpad(f.wp)),
          wtRank: pick(D.parseWebtoon(f.wtRank, "https://m.webtoons.com/en/ranking")),
          wtRankAction: D.parseWebtoon(f.wtRank, "https://m.webtoons.com/en/ranking", "ACTION").map((s) => s.title),
          wtGenre: D.parseWebtoon(f.wtGenre, "https://m.webtoons.com/en/genres/fantasy").map((s) => [s.title, s.about.slice(0, 12)]),
          tapas: pick(D.parseTapas(f.tapas, "https://m.tapas.io/search")),
          ao3: pick(D.parseAO3(f.ao3, "https://archiveofourown.org/works")),
          ao3By: D.parseAO3(f.ao3)[0].by,
          sh: pick(D.parseSH(f.sh, "https://www.scribblehub.com/series-ranking/")),
          ffn: pick(D.parseFFN(f.fp.replace(/fictionpress/g, "fanfiction"), "https://www.fanfiction.net/book/Harry-Potter/")),
          ids: ["https://www.wattpad.com/story/26327373-x", "https://archiveofourown.org/works/1001/chapters/9", "https://m.webtoons.com/en/fantasy/osora/list?title_no=6202",
            "https://tapas.io/series/JetDragon/info", "https://www.scribblehub.com/series/501/the-slow-tower/", "https://www.fanfiction.net/s/42/3/x"].map(D.storyId),
        };
      }, { wp: fixture("wp-search.json"), wtRank: fixture("wt-rank.html"), wtGenre: fixture("wt-genre.html"), tapas: fixture("tapas-search.html"),
        ao3: fixture("ao3-works.html"), sh: fixture("sh-list.html"), fp: fixture("fp-list.html") });
      await ctx.close();
      if (process.env.DUMP) console.log(JSON.stringify(got, null, 1));
      assert.deepStrictEqual(got.wp[0], ["wp26327373", "https://www.wattpad.com/story/26327373-the-dragon-and-the-princess", "The Dragon and the Princess", 34, true, "betrayal/complete/danger", "619K reads"]);
      assert.strictEqual(got.wp.length, 3);
      assert.deepStrictEqual(got.wtRank.map((s) => s[2]), ["Jungle Juice", "Who Made Me a Princess", got.wtRank[2][2]]);
      assert.deepStrictEqual(got.wtRank[0].slice(0, 2), ["wt2480", "https://www.webtoons.com/en/action/jungle-juice/list?title_no=2480"]);
      assert.ok(got.wtRank.every((s) => s[4]), "covers");
      assert.deepStrictEqual(got.wtRankAction, ["Jungle Juice"]);
      assert.deepStrictEqual(got.wtGenre[0], ["Osora", "Prince Osora"]);
      assert.strictEqual(got.tapas.length, 3);
      assert.deepStrictEqual(got.tapas[0].slice(0, 3), ["tpdragonvsdragon", "https://tapas.io/series/DragonvsDragon", "Dragon vs. Dragon"]);
      assert.deepStrictEqual(got.ao3, [["ao31001", "https://archiveofourown.org/works/1001", "The Cartographer's Oath", 27, false, "Original Work/Fantasy/Maps", "4,812 kudos"],
        ["ao31002", "https://archiveofourown.org/works/1002", "Low Tide", 1, false, "", "90 kudos"]]);
      assert.strictEqual(got.ao3By, "ink");
      assert.deepStrictEqual(got.sh, [["sh501", "https://www.scribblehub.com/series/501/the-slow-tower/", "The Slow Tower", 88, true, "Fantasy/Isekai", ""],
        ["sh502", "https://www.scribblehub.com/series/502/salt/", "Salt", 0, false, "", ""]]);
      assert.deepStrictEqual(got.ffn[0].slice(0, 3), ["ffn3001", "https://www.fanfiction.net/s/3001/1/", "The Salt Road"]);
      assert.deepStrictEqual(got.ids, ["wp26327373", "ao31001", "wt6202", "tpjetdragon", "sh501", "ffn42"]);
    });

    await test("FictionPress's mobile site (no div.z-list) reads as stories too", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate((html) => Waypage.discover.parseFP(html, "https://m.fictionpress.com/fiction/Fantasy/"), fixture("fp-mobile.html"));
      await ctx.close();
      assert.deepStrictEqual(got.map((s) => [s.id, s.url, s.title, s.chapters, s.followers, s.tags.join("/")]),
        [["fp4001", "https://www.fictionpress.com/s/4001/1/", "Glass Harbour", 22, 310, "Fantasy/Mystery"], ["fp4002", "https://www.fictionpress.com/s/4002/1/", "Ash", 3, 0, "Fantasy"]]);
      assert.match(got[0].about, /^A town built on a frozen sea/);
    });

    await test("FictionPress's list rows read as stories", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate((html) => Waypage.discover.parseFP(html, "https://www.fictionpress.com/fiction/Fantasy/"), fixture("fp-list.html"));
      await ctx.close();
      assert.strictEqual(got.length, 2);
      assert.deepStrictEqual([got[0].id, got[0].url, got[0].title, got[0].chapters, got[0].followers], ["fp3001", "https://www.fictionpress.com/s/3001/1/", "The Salt Road", 34, 1204]);
      assert.deepStrictEqual(got[0].tags, ["Fantasy", "Adventure"]);
      assert.strictEqual(got[0].cover, "https://www.fictionpress.com/image/101/75/");
      assert.match(got[0].about, /^Two couriers/);
      assert.strictEqual(got[1].cover, "");
    });

    await test("a swipe moves to the next chip, as in Feeds", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("discover"));
      await p.locator("#discover .dz-row").first().waitFor();
      const swipe = async (x0, x1, on, hold) => p.evaluate(([a, b, on, hold]) => {
        const root = document.getElementById("discover");
        const row = root.querySelector(on || ".dz-tools, .section-head");
        const r = row.getBoundingClientRect(), y = r.top + 20;
        const t = (x) => new Touch({ identifier: 1, target: row, clientX: x, clientY: y });
        row.dispatchEvent(new TouchEvent("touchstart", { touches: [t(a)], changedTouches: [t(a)], bubbles: true }));
        for (let i = 1; i <= 6; i++) row.dispatchEvent(new TouchEvent("touchmove", { touches: [t(a + (b - a) * i / 6)], changedTouches: [t(a + (b - a) * i / 6)], bubbles: true }));
        if (hold) return { head: root.querySelector(".dz-head").style.transform, body: root.querySelector(".dz-body").style.transform };
        row.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t(b)], bubbles: true }));
      }, [x0, x1, on, hold]);
      // Mid-swipe the list slides; the search field and chips stay.
      const mid = await swipe(320, 200, null, true);
      assert.strictEqual(mid.head, "");
      assert.match(mid.body, /translateX/);
      await p.evaluate(() => document.querySelector("#discover .section-head").dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [], bubbles: true })));
      await p.waitForTimeout(400);
      await swipe(320, 40);
      await p.waitForFunction(() => document.querySelector("#discover .chip.on").textContent === "Sites");
      // Over Sites' grid of covers too.
      await p.locator("#discover .dz-grid .dz-book").first().waitFor();
      await swipe(320, 40, "#discover .dz-grid .dz-book");
      await p.waitForFunction(() => document.querySelector("#discover .chip.on").textContent === "Feeds");
      await swipe(40, 320);
      await p.waitForFunction(() => document.querySelector("#discover .chip.on").textContent === "Sites");
      await ctx.close();
    });

    await test("books, texts and story forums read as stories from their sites' answers", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate(([pg, se, ws, xf, wiki]) => {
        const D = window.Waypage.discover;
        return {
          pg: D.parseGutendex(pg), se: D.parseSE(se, "https://standardebooks.org/ebooks"), ws: D.parseWsList(ws),
          xf: D.parseXf(xf, "https://forums.spacebattles.com/forums/creative-writing.18/", "sb"),
          wiki: D.parseWikiToday(wiki, "en"),
          ids: ["https://forums.spacebattles.com/threads/a-quiet-hive-worm-au.112233/", "https://forums.sufficientvelocity.com/threads/9/"].map(D.storyId),
          urls: [D.pgBrowseUrl("popular", "fiction", 2), D.seBrowseUrl("popularity", "horror", 1), D.xfBrowseUrl("sv", "post_date", 3)],
        };
      }, [fixture("gutendex.json"), fixture("se-list.html"), fixture("ws-cat.json"), fixture("xf-board.html"), fixture("wiki-featured.json")]);
      await ctx.close();
      assert.strictEqual(got.pg.length, 2);
      assert.strictEqual(got.pg[0].title, "Pride and Prejudice");
      assert.strictEqual(got.pg[0].by, "Jane Austen");
      assert.strictEqual(got.pg[0].epub, "https://www.gutenberg.org/ebooks/1342.epub3.images");
      assert.ok(got.pg[0].book);
      assert.strictEqual(got.pg[0].about, "A novel of manners about Elizabeth Bennet and Mr Darcy.");
      assert.strictEqual(got.pg[0].stat, "78K downloads");
      assert.strictEqual(got.pg[1].epub, "https://www.gutenberg.org/ebooks/84.epub3.images", "a book with no formats gets Gutenberg's own EPUB address");
      assert.deepStrictEqual(got.se.map((b) => [b.title, b.by]), [["Pride and Prejudice", "Jane Austen"], ["War and Peace", "Leo Tolstoy"]]);
      assert.strictEqual(got.se[0].epub, "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub");
      assert.strictEqual(got.se[1].epub, "https://standardebooks.org/ebooks/leo-tolstoy/war-and-peace/louise-maude_aylmer-maude/downloads/leo-tolstoy_war-and-peace_louise-maude_aylmer-maude.epub");
      assert.strictEqual(got.se[0].cover, "https://standardebooks.org/images/covers/pride-cover-thumbnail.jpg");
      assert.deepStrictEqual(got.ws.items.map((t) => t.title), ["The Time Machine (Wells)", "A Modest Proposal"], "categories inside a category are left out");
      assert.strictEqual(got.ws.next, "page|4b49|123");
      assert.strictEqual(got.ws.items[0].url, "https://en.wikisource.org/wiki/The_Time_Machine_(Wells)");
      assert.deepStrictEqual(got.xf.map((t) => t.title), ["A Quiet Hive (Worm AU)", "Salt Crown"], "the pinned rules thread is left out");
      assert.strictEqual(got.xf[0].url, "https://forums.spacebattles.com/threads/a-quiet-hive-worm-au.112233/");
      assert.strictEqual(got.xf[0].chapters, 42);
      assert.strictEqual(got.xf[0].stat, "310k words");
      assert.deepStrictEqual(got.xf[0].tags, ["Worm"]);
      assert.strictEqual(got.xf[1].chapters, 7);
      assert.deepStrictEqual(got.ids, ["sb112233", "sv9"]);
      assert.strictEqual(got.wiki.featured.title, "Sea otter");
      assert.deepStrictEqual(got.wiki.most.map((a) => a.title), ["Halley's Comet", "Ada Lovelace"], "the Main Page isn't an article to read");
      assert.match(got.urls[0], /^https:\/\/gutendex\.com\/books\/\?sort=popular&languages=en&topic=fiction&page=2$/);
      assert.strictEqual(got.urls[1], "https://standardebooks.org/subjects/horror?sort=popularity&per-page=48");
      assert.strictEqual(got.urls[2], "https://forums.sufficientvelocity.com/forums/user-fiction.2/page-3?order=post_date&direction=desc");
    });

    await test("Wikipedia today sits at the top of All; a book's + downloads its EPUB into the Library", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(([wiki, pg, list]) => {
        const P = Waypage.platform;
        P.fetchText = async (url) => {
          window.asked.push(url);
          if (/wikipedia\.org\/api\/rest_v1\/feed\/featured\//.test(url)) return { status: 200, url, text: wiki };
          if (/gutendex/.test(url)) return { status: 200, url, text: pg };
          return { status: 200, url, text: list };
        };
        // A zip's first bytes, as an EPUB starts.
        window.fetched = [];
        P.fetchBytes = async (url) => { window.fetched.push(url); return { status: 200, url, type: "application/epub+zip", blob: new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])]) }; };
        window.opened = [];
        window.openFile = async (file, btn, open, ref, forced) => { window.opened.push({ name: file.name, size: file.size, forced: !!forced }); };
        goPlace("discover");
      }, [fixture("wiki-featured.json"), fixture("gutendex.json"), fixture("rr-list.html")]);
      await p.locator('#discover .section-head:has-text("Wikipedia today")').waitFor();
      const heads = (await p.locator("#discover .section-head .overline").allTextContents()).map((t) => t.replace("›", ""));
      assert.strictEqual(heads[0], "Wikipedia today");
      assert.strictEqual(await p.locator("#discover .dz-wiki .dz-row").count(), 3);
      assert.match(await p.locator("#discover .dz-wiki .dz-row").first().textContent(), /Sea otter[\s\S]*Featured article/);
      // Sites: Project Gutenberg, a book's sheet, then Add the book.
      await p.locator('#discover .chip:has-text("Sites")').click();
      await p.locator("#discover .dz-tools .dropdown").first().locator(".dropdown-btn").click();
      await p.locator('[role="option"]:has-text("Project Gutenberg")').click();
      await p.locator('#discover .dz-grid .dz-book:has-text("Pride and Prejudice")').click();
      await p.locator('#menuSheet[data-kind="story"]:not([hidden])').waitFor();
      const sheet = await p.locator("#menuSheet").textContent();
      assert.match(sheet, /Jane Austen/);
      assert.match(sheet, /78K downloads/);
      await p.locator('#menuSheet .btn-primary:has-text("Add the book")').click();
      await p.waitForFunction(() => window.opened.length === 1);
      const got = await p.evaluate(() => ({ fetched: window.fetched, opened: window.opened, asked: window.asked }));
      await ctx.close();
      assert.deepStrictEqual(got.fetched, ["https://www.gutenberg.org/ebooks/1342.epub3.images"]);
      assert.deepStrictEqual(got.opened, [{ name: "Pride and Prejudice - Jane Austen.epub", size: 6, forced: true }]);
      assert.ok(got.asked.some((u) => u.startsWith("https://gutendex.com/books/?sort=popular")), got.asked.join(" "));
    });

    await test("a pasted link to an EPUB file is downloaded, not read as a page", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate(async () => {
        const names = ["https://www.gutenberg.org/ebooks/84.epub3.images", "https://example.com/books/Moby%20Dick.epub", "https://example.com/a.pdf?x=1", "https://arxiv.org/pdf/2401.00001.pdf", "https://example.com/post"].map(fileLinkName);
        window.opened = [];
        window.openFile = async (file) => { window.opened.push(file.name); };
        let calls = 0;
        // A thank-you page first, which links the file.
        Waypage.platform.fetchBytes = async (url) => (calls++ === 0
          ? { status: 200, url, type: "text/html", blob: new Blob(['<html><body><a href="/downloads/moby_compatible.kepub.epub">Kobo</a> <a href="/downloads/moby.epub">EPUB</a></body></html>'], { type: "text/html" }) }
          : { status: 200, url, type: "application/epub+zip", blob: new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]) });
        await savePage("https://example.com/books/Moby%20Dick.epub");
        return { names, opened: window.opened, saving: state.saving.length };
      });
      await ctx.close();
      assert.deepStrictEqual(got.names, ["Gutenberg 84.epub", "Moby Dick.epub", "a.pdf", "", ""]);
      assert.deepStrictEqual(got.opened, ["Moby Dick.epub"]);
      assert.strictEqual(got.saving, 0, "no page save was started");
    });

    await test("the web copy hides Royal Road and says where it works", async () => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const p = await ctx.newPage();
      await p.goto(ROOT);
      await p.waitForFunction(() => typeof goPlace === "function" && window.Waypage.discover);
      await p.evaluate(() => goPlace("discover"));
      await p.locator("#discover .dz-row").first().waitFor();
      assert.strictEqual(await p.locator("#discover .dz-book").count(), 0);
      await p.locator('#discover .chip:has-text("Sites")').click();
      assert.match(await p.locator("#discover").textContent(), /on your phone/);
      // The books and texts are read here too, through the fetch proxy.
      await p.locator("#discover .dz-tools .dropdown").first().locator(".dropdown-btn").click();
      const sites = await p.locator('[role="option"]').allTextContents();
      assert.deepStrictEqual(sites.map((t) => t.trim()), ["Project Gutenberg", "Standard Ebooks", "Wikisource", "Web serials"]);
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
