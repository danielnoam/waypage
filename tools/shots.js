// The README's screenshots: `node tools/shots.js [name ...]`. Starts
// server.js, saves the demo pages in tools/shots/demo/ through the app's own
// save path, then shoots each README section at phone (390 px) and desktop
// (1280 px) width into docs/shots/. Needs Playwright with a Chromium, like
// test/ui.test.js.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const PORT = 5800 + Math.floor(Math.random() * 100);
const ROOT = "http://localhost:" + PORT + "/";
const DEMO = ROOT + "tools/shots/demo/";
const OUT = path.join(__dirname, "..", "docs", "shots");
const ONLY = process.argv.slice(2);

const ARTICLES = ["oceanic-tracks", "lighthouses", "bread", "bookbinding", "night-trains", "tides", "urban-foxes", "maps"];
const CHAPTERS = [1, 2, 3, 4].map((n) => "daughter-" + n);

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

async function until(p, fn, arg, ms = 15000) {
  const t0 = Date.now();
  while (!(await p.evaluate(fn, arg))) {
    if (Date.now() - t0 > ms) throw new Error("timed out: " + String(fn).slice(0, 80));
    await p.waitForTimeout(200);
  }
}

// A library to show: the demo clips saved one by one, then tagged, put in
// a collection and part read, as someone's would be after a few weeks.
async function seed(p) {
  for (const f of [...CHAPTERS].reverse().concat([...ARTICLES].reverse())) {
    const n = await p.evaluate(() => state.pages.length);
    await p.fill("#saveUrl", DEMO + f + ".html");
    await p.press("#saveUrl", "Enter");
    await until(p, (k) => state.pages.length > k && !state.saving.length, n);
  }
  await p.evaluate(async (files) => {
    const now = Date.now(), day = 864e5;
    const by = (f) => state.pages.find((x) => x.url.endsWith("/" + f + ".html"));
    const tags = { "oceanic-tracks": ["Travel"], "night-trains": ["Travel"], maps: ["Travel"], tides: ["Science"], "urban-foxes": ["Science", "Nature"], bread: ["Food"], bookbinding: ["Crafts"], lighthouses: ["History"] };
    for (const [f, t] of Object.entries(tags)) by(f).tags = t;
    files.forEach((f, i) => { by(f).savedAt = now - (i + 1) * 3 * 36e5; });
    by("oceanic-tracks").fav = true; by("oceanic-tracks").favAt = now;
    by("bookbinding").fav = true; by("bookbinding").favAt = now;
    Object.assign(by("oceanic-tracks"), { at: 0.42, readAt: now - 2 * 36e5 });
    Object.assign(by("lighthouses"), { at: 0.7, readAt: now - day });
    Object.assign(by("tides"), { at: 1, finished: now - 2 * day, readAt: now - 2 * day });
    for (let i = 1; i <= 4; i++) {
      const c = by("daughter-" + i);
      Object.assign(c, { folder: "The Cartographer's Daughter", folderAt: now - (5 - i) * day, savedAt: now - (10 - i) * day, folderFav: true, folderFavAt: now });
      if (i < 3) Object.assign(c, { at: 1, finished: now - (4 - i) * day, readAt: now - (4 - i) * day });
    }
    await window.Waypage.store.writeIndex(state.pages);

    const S = window.Waypage.stats, days = {}, ids = state.pages.map((x) => x.id);
    for (let i = 0; i < 40; i++) {
      if (i % 9 === 6) continue;
      const ms = (8 + ((i * 37) % 41)) * 60000;
      days[S.dayKey(now - i * day)] = { readMs: ms, aloudMs: i % 4 ? 0 : 12 * 60000, words: Math.round(ms / 60000 * 230), opened: 1 + (i % 3), clips: { [ids[i % ids.length]]: ms } };
    }
    const clips = {};
    for (const d of Object.values(days)) for (const [id, ms] of Object.entries(d.clips)) clips[id] = { readMs: ((clips[id] || {}).readMs || 0) + ms, words: Math.round(ms / 60000 * 230), opened: 2 };
    S.take("demotablet01", { since: now - 45 * day, days, clips });

    const post = (n, t, s, img, ago) => ({ id: "demo" + n, url: "https://example.org/posts/" + n, title: t, summary: s, image: img && location.origin + "/tools/shots/demo/img/" + img + ".jpg", date: now - ago * 36e5 });
    localStorage.setItem("waypage.feeds", JSON.stringify([
      { url: "https://example.org/slow-air/feed.xml", title: "Slow Air", days: 7, mode: "show", checkedAt: now, items: [
        post(1, "The Last Overnight Ferry to the Islands", "A crossing that takes all night and costs less than a hotel room.", "tides", 3),
        post(2, "Packing for a Week With One Bag", "Fewer things, chosen well, and a book you saved before leaving.", null, 26),
        post(3, "Why Window Seats Are Worth the Wait", "Clouds, coastlines and the curve of the Earth at dawn.", "flight", 50)] },
      { url: "https://example.org/field-science/rss", title: "Field Science", days: 7, mode: "show", checkedAt: now, items: [
        post(4, "Counting Stars From a City Rooftop", "How much of the night sky light pollution really hides.", "train", 8),
        post(5, "The Secret Lives of Tidepools", "A whole world that appears twice a day and vanishes again.", null, 30)] },
      { url: "https://kill-the-newsletter.com/feeds/demoabc123.xml", title: "Morning Notes", days: 30, mode: "save", checkedAt: now, items: [
        post(6, "Five things worth reading this weekend", "Long reads for a slow Saturday.", null, 5),
        post(7, "Your weekly map", "This week: forgotten railway lines.", null, 30)] },
    ]));
  }, [...ARTICLES, ...CHAPTERS]);
  await p.goto(ROOT);
  await p.waitForSelector(".page-card");
  await highlight(p);
}

// Selects words in the open clip, as a finger would.
async function pick(p, words) {
  await p.frameLocator("#readerFrame").locator("p", { hasText: words }).first().evaluate((el, w) => {
    const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.data.includes(w));
    const r = el.ownerDocument.createRange();
    r.setStart(t, t.data.indexOf(w));
    r.setEnd(t, t.data.indexOf(w) + w.length);
    const sel = el.ownerDocument.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }, words);
}

async function highlight(p) {
  await openClip(p, "oceanic-tracks");
  const marks = [["Yellow", "separation becomes arithmetic"], ["Green", "the shortest line over a globe"], ["Blue", "the ocean still punishes guesswork"]];
  for (const [color, words] of marks) {
    await pick(p, words);
    await p.locator(".read-here .sel-color:not([hidden])").click();
    await p.locator(`.read-here.picking .sel-swatch[aria-label="${color}"]`).click();
    await p.frameLocator("#readerFrame").locator("mark.co-mark", { hasText: words.split(" ")[0] }).first().waitFor();
    await p.waitForTimeout(400);
  }
  await p.frameLocator("#readerFrame").locator("mark.co-mark", { hasText: "arithmetic" }).first().click();
  await p.locator("#readingSheet:not([hidden]) .mark-note-field").fill("Ten minutes apart, by the clock.");
  await p.keyboard.press("Tab");
  await p.waitForTimeout(600);
  await p.goto(ROOT);
  await p.waitForSelector(".page-card");
}

async function openClip(p, f) {
  const id = await p.evaluate((f) => state.pages.find((x) => x.url.endsWith("/" + f + ".html")).id, f);
  await p.evaluate((id) => openPage(id), id);
  await p.locator("#readerView:not([hidden])").waitFor();
  await p.frameLocator("#readerFrame").locator("h2").first().waitFor();
  await p.waitForTimeout(800);
  await p.evaluate(() => { if (document.getElementById("readerView").classList.contains("bar-away")) toggleBar(); });
  await p.waitForTimeout(400);
}

async function open(browser, width, theme) {
  const phone = width < 700;
  const ctx = await browser.newContext({
    viewport: { width, height: phone ? 844 : 800 }, deviceScaleFactor: phone ? 2 : 1, serviceWorkers: "block",
    isMobile: phone, hasTouch: phone,
  });
  await ctx.addInitScript(([t, v]) => {
    try {
      if (!localStorage.getItem("waypage.theme")) localStorage.setItem("waypage.theme", JSON.stringify(t));
      localStorage.setItem("waypage.seenVersion", JSON.stringify(v));
    } catch (e) { /* none */ }
  }, [theme || "paper", VERSION]);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("  page error: " + e.message));
  await p.goto(ROOT);
  await p.waitForSelector("#saveUrl");
  return p;
}

async function home(p, theme) {
  await p.evaluate((t) => { localStorage.setItem("waypage.theme", JSON.stringify(t)); localStorage.setItem("waypage.place", JSON.stringify("library")); }, theme || "paper");
  await p.goto(ROOT);
  await p.waitForSelector(".page-card");
  await p.waitForTimeout(300);
}

async function shot(p, name, clip) {
  const phone = p.viewportSize().width < 700;
  const file = path.join(OUT, name + (phone ? "-phone" : "-desktop") + ".jpg");
  await p.waitForTimeout(700);
  await p.screenshot({ path: file, type: "jpeg", quality: 82, clip });
  console.log("  " + path.relative(process.cwd(), file));
}

// Each README section: what to set up before its picture, at either width.
const SHOTS = {
  async library(p) { await home(p); },
  async sidebar(p, phone) {
    await home(p);
    if (phone) { await p.click("#sideBtn"); await p.locator("#sidebar:not([hidden])").waitFor(); }
    return phone ? undefined : { x: 0, y: 0, width: 272, height: 800 };
  },
  async collections(p) {
    await home(p);
    await p.evaluate(() => openFolder("The Cartographer's Daughter"));
    await p.locator("#folderView:not([hidden])").waitFor();
  },
  async saving(p) {
    await home(p);
    await p.click("#severalBtn");
    await p.waitForTimeout(400);
  },
  async reader(p) { await home(p); await openClip(p, "oceanic-tracks"); },
  async look(p) {
    await home(p, "sepia");
    await openClip(p, "oceanic-tracks");
    await p.evaluate(() => toggleSheet("reading"));
    await p.locator("#readingSheet:not([hidden])").waitFor();
  },
  async skim(p) {
    await home(p);
    await openClip(p, "oceanic-tracks");
    await p.locator("#readSection").click();
    await p.locator("#skimBar:not([hidden])").waitFor();
    await p.waitForTimeout(400);
    await p.locator("#skimNext").click();
    await p.waitForTimeout(600);
  },
  async narrate(p) {
    await home(p);
    await openClip(p, "lighthouses");
    await p.evaluate(() => {
      const sp = Waypage.platform.speech;
      sp.play = () => Promise.resolve();
      sp.stop = () => Promise.resolve();
      startAloud();
    });
    await p.locator("#readerView.aloud").waitFor();
  },
  async night(p) { await home(p, "night"); await openClip(p, "lighthouses"); },
  async highlights(p, phone) {
    await home(p);
    await p.evaluate(() => goPlace("highlights"));
    await p.locator("#highlights .mark-row").first().waitFor();
    if (!phone) { await p.locator("#highlights .mark-row").first().click(); await p.frameLocator("#readerFrame").locator("mark.co-mark").first().waitFor(); await p.waitForTimeout(800); }
  },
  async feeds(p) { await home(p); await p.evaluate(() => goPlace("feeds")); await p.locator("#feeds .post").first().waitFor(); },
  async newsletters(p) { await home(p); await p.evaluate(() => goPlace("newsletters")); },
  async stats(p) { await home(p); await p.evaluate(() => goPlace("reading")); await p.waitForSelector(".rs-total"); },
  async sync(p) { await home(p); await p.evaluate(() => openSyncPage()); await p.locator("#syncView:not([hidden])").waitFor(); },
  async settings(p) { await home(p); await p.evaluate(() => openSettings()); await p.locator("#settingsView:not([hidden])").waitFor(); },
  // A PDF read from its file, its pages recoloured to Night (1.49.0). Last,
  // since the PDF stays in this library for the shots after it.
  async pdf(p) {
    await home(p, "night");
    const id = await p.evaluate(async (url) => {
      const file = new File([await (await fetch(url)).arrayBuffer()], "night-train.pdf", { type: "application/pdf" });
      window.Waypage.platform.files.blob = async () => file;
      const meta = await window.Waypage.files.bring(file, "pdf", { has: () => false, link: "content://demo/night-train.pdf" });
      await window.Waypage.store.writeIndex([meta, ...await window.Waypage.store.readIndex()]);
      return meta.id;
    }, DEMO + "night-train.pdf");
    await p.goto(ROOT);
    await p.waitForSelector(".page-card");
    await p.evaluate(async (url) => {
      const file = new File([await (await fetch(url)).arrayBuffer()], "night-train.pdf", { type: "application/pdf" });
      window.Waypage.platform.files.blob = async () => file;
      store("waypage.pdfDark", true);
    }, DEMO + "night-train.pdf");
    await p.evaluate((id) => openPage(id), id);
    await p.locator("#readerView:not([hidden])").waitFor();
    await p.frameLocator("#readerFrame").locator(".co-printed img[src]").first().waitFor();
    await p.waitForTimeout(1200);
    await p.evaluate(() => { if (document.getElementById("readerView").classList.contains("bar-away")) toggleBar(); });
  },
};

const VERSION = (fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8").match(/APP_VERSION = "([^"]+)"/) || [])[1];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const p = await open(browser, width);
      await seed(p);
      for (const [name, fn] of Object.entries(SHOTS)) {
        if (ONLY.length && !ONLY.includes(name)) continue;
        try { await shot(p, name, await fn(p, width < 700)); }
        catch (e) { console.error("  FAIL " + name + " at " + width + ": " + e.message.split("\n")[0]); process.exitCode = 1; }
      }
      await p.context().close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
})();
