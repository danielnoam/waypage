// Discussion and code sites, saved in a browser from saved copies of the
// sites' own answers (test/fixtures/sites/), since the sites change:
// `node test/sites.test.js`. Every request to the site is answered from
// a fixture, so nothing goes out. Needs Playwright, like ui.test.js.
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
const FIX = path.join(__dirname, "fixtures", "sites");
const fixture = (name) => fs.readFileSync(path.join(FIX, name), "utf8");

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

// Saves `url` with `answers` ([test, fixture name or null for a 404])
// standing in for the network, and returns { meta, doc } with the clip's
// HTML parsed in the page, plus the addresses that were asked for.
async function saveWith(browser, url, answers) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const p = await ctx.newPage();
  const asked = [];
  await ctx.route((u) => !u.href.startsWith(ROOT), (route) => {
    const u = route.request().url();
    asked.push(u);
    const hit = answers.find(([t]) => (typeof t === "string" ? u.startsWith(t) : t.test(u)));
    if (!hit || !hit[1]) return route.fulfill({ status: 404, body: "", headers: { "access-control-allow-origin": "*" } });
    const type = /\.json$/.test(hit[1]) ? "application/json" : /\.txt$/.test(hit[1]) ? "text/plain" : "text/html";
    route.fulfill({ status: 200, body: fixture(hit[1]), headers: { "content-type": type + "; charset=utf-8", "access-control-allow-origin": "*" } });
  });
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.save && window.Waypage.store);
  const got = await p.evaluate(async (url) => {
    try {
      const meta = await window.Waypage.save.save(url);
      return { meta, html: await window.Waypage.store.readPage(meta.id) };
    } catch (e) { return { error: String(e && e.message) }; }
  }, url);
  await ctx.close();
  if (got.error) throw new Error(got.error);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP + "/" + got.meta.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) + ".html", got.html);
  return { meta: got.meta, html: got.html, asked };
}

// What the saved page says, worked out in Node without a DOM: enough to
// check the shape of a thread.
const count = (html, re) => (html.match(re) || []).length;
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ");

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("GitHub: a pull request saves its post and every comment", async () => {
      const { meta, html } = await saveWith(browser, "https://github.com/danielnoam/waypage/pull/182", [
        ["https://api.github.com/repos/danielnoam/waypage/issues/182/comments", "github-issue-comments.json"],
        ["https://api.github.com/repos/danielnoam/waypage/issues/182", "github-issue.json"],
      ]);
      assert.strictEqual(meta.title, "docs: architecture, formats, pipeline, developing and user guide #182");
      assert.strictEqual(meta.site, "GitHub");
      assert.strictEqual(meta.byline, "danielnoam/waypage · Pull request, closed");
      assert.strictEqual(meta.url, "https://github.com/danielnoam/waypage/pull/182");
      assert.strictEqual(count(html, /class="co-comment"/g), 1);
      assert.ok(/<h2[^>]*>Comments \(1\)<\/h2>/.test(html), "a Comments heading with the count");
      assert.ok(/class="co-who"><strong>omri-ehud<\/strong>/.test(html), "the author over the post");
    });

    await test("GitHub: a code file is saved as code, from its raw copy", async () => {
      const { meta, html, asked } = await saveWith(browser, "https://github.com/danielnoam/waypage/blob/main/server.js", [
        ["https://raw.githubusercontent.com/danielnoam/waypage/main/server.js", "github-server.js.txt"],
      ]);
      assert.strictEqual(meta.title, "server.js");
      assert.strictEqual(meta.byline, "danielnoam/waypage · server.js");
      assert.ok(!asked.some((u) => u.startsWith("https://github.com/danielnoam/waypage/blob/")), "the page itself isn't fetched");
      assert.strictEqual(count(html, /<pre>/g), 1);
      assert.ok(plain(html).includes("createServer"), "the code is there");
    });

    await test("GitHub: a repo is its README, titled by the repo", async () => {
      const { meta, html } = await saveWith(browser, "https://github.com/danielnoam/waypage", [
        ["https://github.com/danielnoam/waypage", "github-repo.html"],
      ]);
      assert.strictEqual(meta.title, "danielnoam/waypage");
      assert.strictEqual(meta.site, "GitHub");
      assert.ok(/<h2[^>]*>Library<\/h2>/.test(html), "the README's headings");
      assert.ok(!/Go to file|Latest commit/.test(plain(html)), "no file list");
    });

    await test("GitHub: when the API fails, the page is read as before", async () => {
      const { meta } = await saveWith(browser, "https://github.com/danielnoam/waypage/pull/182", [
        ["https://api.github.com/", null],
        ["https://github.com/danielnoam/waypage/pull/182", "github-repo.html"],
      ]);
      assert.strictEqual(meta.site, "GitHub");
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
