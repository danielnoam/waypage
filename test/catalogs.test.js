// The Catalogs extension: OPDS 1 and 2 feeds read from hand-made ones
// (test/fixtures/opds/), and the place itself in a phone-sized browser with
// the phone's fetch stood in for. `node test/catalogs.test.js`. Needs
// Playwright, like discover.test.js.
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

const PORT = 5300 + Math.floor(Math.random() * 400);
const ROOT = "http://localhost:" + PORT + "/";
const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "opds", name), "utf8");
const BASE = "https://books.example.test";

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

// A phone with the Catalogs extension on: the catalog's feeds answered
// from the fixtures, as CapacitorHttp would.
async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route((u) => !u.href.startsWith(ROOT), (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.ext && typeof goPlace === "function");
  await p.evaluate(async (feeds) => {
    const P = window.Waypage.platform;
    Object.defineProperty(P, "canFetchPages", { get: () => true });
    // The phone: a login goes with the native fetch, not straight from the page.
    P.native = true;
    Object.defineProperty(P, "canReadPages", { get: () => true, configurable: true });
    window.asked = [];
    P.fetchText = async (url, opts) => {
      window.asked.push({ url, auth: ((opts && opts.headers) || {}).Authorization || "" });
      const u = new URL(url);
      const body = u.pathname === "/opds" ? feeds.root : u.pathname === "/opds/new" && !u.search ? feeds.fresh : u.pathname === "/opds/search.xml" ? feeds.osd
        : u.pathname === "/opds/search" ? feeds.fresh : u.pathname === "/opds/new" ? '<feed xmlns="http://www.w3.org/2005/Atom"><title>Newest</title></feed>' : null;
      return body ? { status: 200, url, text: body } : { status: 404, url, text: "" };
    };
    window.fetched = [];
    P.fetchBytes = async (url, name, headers) => { window.fetched.push({ url, auth: (headers || {}).Authorization || "" }); return { status: 200, url, type: "application/epub+zip", blob: new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])]) }; };
    window.opened = [];
    window.openFile = async (file) => { window.opened.push(file.name); };
    await window.Waypage.ext.turnOn("catalogs");
  }, { root: fixture("root.xml"), fresh: fixture("new.xml"), osd: fixture("search.xml") });
  return { ctx, p };
}

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("an OPDS 1 feed reads as folders and books, the best file of each, and its next page", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate(([root, fresh, osd]) => {
        const O = window.Waypage.opds;
        return { root: O.parse(root, "https://books.example.test/opds"), fresh: O.parse(fresh, "https://books.example.test/opds/new"),
          search: O.parseSearchDoc(osd, "https://books.example.test/opds/search.xml") };
      }, [fixture("root.xml"), fixture("new.xml"), fixture("search.xml")]);
      await ctx.close();
      assert.strictEqual(got.root.title, "Home Library");
      assert.deepStrictEqual(got.root.folders.map((f) => [f.title, f.url]), [["Newest", BASE + "/opds/new"], ["By author", BASE + "/authors"]]);
      assert.strictEqual(got.root.folders[0].about, "Books added lately");
      assert.strictEqual(got.root.searchDoc, BASE + "/opds/search.xml");
      assert.strictEqual(got.search, BASE + "/opds/search?q={searchTerms}&start=");
      const [a, b] = got.fresh.books;
      assert.strictEqual(got.fresh.books.length, 2, "a book with no file the Library takes is left out");
      assert.strictEqual(a.title, "The Left Hand of Darkness");
      assert.strictEqual(a.by, "Ursula K. Le Guin");
      assert.strictEqual(a.kind, "epub", "EPUB before PDF");
      assert.strictEqual(a.file, BASE + "/get/epub/1");
      assert.deepStrictEqual(a.kinds, ["pdf", "epub"]);
      assert.strictEqual(a.cover, BASE + "/get/cover/1.jpg");
      assert.strictEqual(a.about, "A planet of winter.");
      assert.deepStrictEqual(a.tags, ["Science Fiction"]);
      assert.strictEqual(b.by, "Brian K. Vaughan, Fiona Staples");
      assert.strictEqual(b.kind, "cbz");
      assert.strictEqual(got.fresh.next, BASE + "/opds/new?page=2");
    });

    await test("an OPDS 2 feed reads too, with its search template", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate((json) => window.Waypage.opds.parse(json, "https://shelf.example.test/catalog.json"), fixture("opds2.json"));
      const bad = await p.evaluate(() => { try { window.Waypage.opds.parse("<html><body>hi</body></html>", "https://x.test/"); return "read"; } catch (e) { return e.message; } });
      await ctx.close();
      assert.strictEqual(got.title, "Open Shelf");
      assert.deepStrictEqual(got.folders.map((f) => f.url), ["https://shelf.example.test/genres.json"]);
      assert.strictEqual(got.books.length, 1);
      assert.strictEqual(got.books[0].file, "https://shelf.example.test/books/moby.epub");
      assert.strictEqual(got.books[0].url, "https://shelf.example.test/books/moby.html");
      assert.deepStrictEqual(got.books[0].tags, ["Whales", "Sea stories"]);
      assert.strictEqual(got.next, "https://shelf.example.test/catalog.json?page=2");
      assert.strictEqual(got.search, "https://shelf.example.test/search?query={searchTerms}");
      assert.strictEqual(bad, "not a catalog");
    });

    await test("a catalog is added from its sidebar place, browsed folder by folder, and a book's + downloads it with the login", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("catalogs"));
      assert.ok(await p.evaluate(() => { renderSide(); return [...document.querySelectorAll(".side-item .side-label")].some((x) => x.textContent === "Catalogs"); }), "Catalogs is in the sidebar");
      await p.locator('#catalogs .empty .btn-primary:has-text("Add a catalog")').click();
      await p.locator('#menuSheet[data-kind="addCatalog"]:not([hidden])').waitFor();
      await p.locator('#menuSheet input[type="url"]').fill("books.example.test/opds");
      await p.locator('#menuSheet input[type="text"]').fill("daniel");
      await p.locator('#menuSheet input[type="password"]').fill("s3cret");
      await p.locator('#menuSheet .btn-primary').click();
      await p.locator('#catalogs .cat-folders .row:has-text("Newest")').waitFor();
      const kept = await p.evaluate(() => JSON.parse(localStorage.getItem("waypage.catalogs")));
      assert.strictEqual(kept.length, 1);
      assert.strictEqual(kept[0].title, "Home Library", "named by the feed");
      assert.strictEqual(kept[0].url, BASE + "/opds");
      await p.locator('#catalogs .cat-folders .row:has-text("Newest")').click();
      await p.locator('#catalogs .dz-grid .dz-book:has-text("Left Hand")').waitFor();
      assert.match(await p.locator("#catalogs .cat-where").textContent(), /‹ Home Library[\s\S]*Newest/);
      assert.strictEqual(await p.locator("#catalogs .dz-grid .dz-book").count(), 2);
      await p.locator('#catalogs .dz-grid .dz-book:has-text("Left Hand")').click();
      await p.locator('#menuSheet[data-kind="story"]:not([hidden])').waitFor();
      const sheet = await p.locator("#menuSheet").textContent();
      assert.match(sheet, /Home Library · Ursula K. Le Guin/);
      assert.match(sheet, /Its EPUB downloads/);
      assert.doesNotMatch(sheet, /public domain/);
      await p.locator('#menuSheet .btn-primary:has-text("Add the book")').click();
      await p.waitForFunction(() => window.opened.length === 1);
      // More books, then back up a folder.
      await p.locator('#catalogs .dz-more:has-text("More books")').click();
      await p.waitForFunction(() => !document.querySelector("#catalogs .dz-more"));
      await p.locator("#catalogs .cat-up").click();
      await p.locator('#catalogs .cat-folders .row:has-text("By author")').waitFor();
      const got = await p.evaluate(() => ({ fetched: window.fetched, opened: window.opened, asked: window.asked }));
      await ctx.close();
      const auth = "Basic " + Buffer.from("daniel:s3cret").toString("base64");
      assert.deepStrictEqual(got.fetched, [{ url: BASE + "/get/epub/1", auth }]);
      assert.deepStrictEqual(got.opened, ["The Left Hand of Darkness - Ursula K. Le Guin.epub"]);
      assert.ok(got.asked.filter((a) => a.url.startsWith(BASE)).every((a) => a.auth === auth), "every page of the catalog went with its login");
      assert.ok(got.asked.some((a) => a.url === BASE + "/opds/new?page=2"));
    });

    await test("a catalog's login goes only to its own server, never to a host its feed links to", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate(async () => {
        const O = window.Waypage.opds;
        const cat = { id: "c1", url: "http://books.example.test/opds", user: "daniel", pass: "s3cret" };
        await O.bytes(cat, "https://elsewhere.example.test/book.epub", "a.epub");
        await O.bytes(cat, "https://books.example.test/get/epub/1", "b.epub");
        await O.read(cat, "https://evil.example.test/opds").catch(() => null);
        return { fetched: window.fetched, asked: window.asked,
          cover: O.login(cat, "https://covers.example.test/1.jpg"), own: O.login(cat, "http://books.example.test/c.jpg"),
          down: O.login({ ...cat, url: "https://books.example.test/opds" }, "http://books.example.test/c.jpg") };
      });
      await ctx.close();
      const auth = "Basic " + Buffer.from("daniel:s3cret").toString("base64");
      assert.deepStrictEqual(got.fetched, [{ url: "https://elsewhere.example.test/book.epub", auth: "" }, { url: "https://books.example.test/get/epub/1", auth }], "the same server moved to https keeps it");
      assert.ok(got.asked.length && got.asked.every((a) => a.url.startsWith("https://evil.example.test/") && a.auth === ""), JSON.stringify(got.asked));
      assert.deepStrictEqual(got.cover, {});
      assert.strictEqual(got.own.Authorization, auth);
      assert.deepStrictEqual(got.down, {}, "never down to plain http");
    });

    await test("a catalog's own search runs from the top field; Settings lists the catalog and removes it", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => {
        window.Waypage.opds.add({ id: "c1", title: "Home Library", url: "https://books.example.test/opds" });
        goPlace("catalogs");
      });
      await p.locator('#catalogs .cat-folders .row:has-text("Newest")').waitFor();
      await p.locator("#catalogs .dz-search input").fill("darkness");
      await p.locator("#catalogs .dz-search input").press("Enter");
      await p.locator('#catalogs .dz-grid .dz-book:has-text("Left Hand")').waitFor();
      const asked = await p.evaluate(() => window.asked.map((a) => a.url));
      assert.ok(asked.includes(BASE + "/opds/search?q=darkness&start="), asked.join(" "));
      await p.evaluate(() => { openSettings(); openSection("catalogs", false, true); });
      await p.locator('.settings-section:has-text("Your catalogs") .row:has-text("Home Library")').waitFor();
      await p.locator('.settings-section:has-text("Your catalogs") .row:has-text("Home Library")').click();
      await p.locator('#menuSheet[data-kind="addCatalog"]:not([hidden])').waitFor();
      assert.strictEqual(await p.locator('#menuSheet input[type="url"]').inputValue(), "https://books.example.test/opds");
      p.once("dialog", (d) => d.accept());
      await p.locator('#menuSheet .btn-quiet:has-text("Remove this catalog")').click();
      await p.waitForFunction(() => !window.Waypage.opds.list().length);
      await ctx.close();
    });
    await test("a catalog that came by sync with a username asks for its password before reading it", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => {
        window.Waypage.opds.mergeIn({ v: 1, list: [{ id: "c1", title: "Home Library", url: "https://books.example.test/opds", user: "daniel", at: 1 }], gone: {} });
        goPlace("catalogs");
      });
      await p.locator('#catalogs .empty-title:has-text("Type the password for Home Library")').waitFor();
      assert.strictEqual(await p.evaluate(() => window.asked.length), 0, "nothing asked of the catalog without its password");
      await p.locator('#catalogs .btn-primary:has-text("Type the password")').click();
      await p.locator('#menuSheet[data-kind="addCatalog"]:not([hidden])').waitFor();
      await p.locator('#menuSheet input[type="password"]').fill("s3cret");
      await p.locator('#menuSheet .btn-primary').click();
      await p.locator('#catalogs .cat-folders .row:has-text("Newest")').waitFor();
      assert.strictEqual(await p.evaluate(() => window.Waypage.opds.list()[0].pass), "s3cret");
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
