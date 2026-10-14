// Google Drive backups in a browser (1.27.0): `node test/drive.test.js`.
// Google's sign-in page and the Drive API are stood in for by a small fake
// in this file, so it runs offline: connect through the sign-in window,
// back up, keep the last three, and restore into a library that's empty,
// like a new phone's. Skips where Playwright isn't installed, like
// ui.test.js.
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

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + String(e.message).split("\n")[0]); process.exitCode = 1; }
}

const PORT = 5800 + Math.floor(Math.random() * 500);
const ROOT = "http://localhost:" + PORT + "/";
const ARTICLE = ROOT + "test/fixtures/article.html";

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

// ---- A fake Google ----
const drive = { files: new Map(), n: 0, signIns: 0 };
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH" };
const json = (route, status, body) => route.fulfill({ status, headers: { ...CORS, "Content-Type": "application/json" }, body: body == null ? "" : JSON.stringify(body) });
const pick = (f, fields) => {
  const out = { id: f.id, name: f.name, size: String(f.bytes ? f.bytes.length : 0), createdTime: new Date(f.at).toISOString(), description: f.description, appProperties: f.appProperties };
  if (/trashed/.test(fields || "")) out.trashed = false;
  return out;
};

async function google(route) {
  const req = route.request();
  const url = new URL(req.url());
  if (url.host === "accounts.google.com") {
    drive.signIns++;
    const back = url.searchParams.get("redirect_uri") + "#state=" + encodeURIComponent(url.searchParams.get("state")) + "&access_token=tok" + drive.signIns + "&expires_in=3599&token_type=Bearer";
    return route.fulfill({ status: 302, headers: { Location: back } });
  }
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  if (!/^Bearer tok\d+$/.test(req.headers().authorization || "")) return json(route, 401, { error: { code: 401 } });
  const p = url.pathname;
  if (p === "/drive/v3/about") return json(route, 200, { user: { emailAddress: "reader@example.com" } });
  if (p === "/upload/drive/v3/files" && req.method() === "POST") {
    const body = req.postDataBuffer();
    const cut = "--" + /boundary=([^;]+)/.exec(req.headers()["content-type"])[1];
    const first = body.indexOf("\r\n\r\n") + 4;
    const meta = JSON.parse(body.slice(first, body.indexOf("\r\n" + cut, first)).toString());
    const second = body.indexOf("\r\n\r\n", body.indexOf(cut, first)) + 4;
    const end = body.lastIndexOf("\r\n" + cut + "--");
    const f = { id: "f" + ++drive.n, at: Date.now() + drive.n, bytes: body.slice(second, end), ...meta };
    drive.files.set(f.id, f);
    return json(route, 200, pick(f));
  }
  if (p === "/drive/v3/files" && req.method() === "POST") {
    const meta = JSON.parse(req.postData());
    const f = { id: "d" + ++drive.n, at: Date.now(), ...meta };
    drive.files.set(f.id, f);
    return json(route, 200, { id: f.id });
  }
  if (p === "/drive/v3/files") {
    const q = url.searchParams.get("q");
    let list = [...drive.files.values()];
    if (/mimeType='application\/vnd.google-apps.folder'/.test(q)) list = list.filter((f) => f.mimeType === "application/vnd.google-apps.folder" && f.name === "Waypage");
    else {
      const dir = /^'([^']+)' in parents/.exec(q)[1];
      list = list.filter((f) => (f.parents || []).includes(dir) && f.appProperties && f.appProperties.waypage === "backup").sort((a, b) => b.at - a.at);
    }
    return json(route, 200, { files: list.map((f) => pick(f)) });
  }
  const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
  if (one) {
    const f = drive.files.get(one[1]);
    if (!f) return json(route, 404, { error: { code: 404, errors: [{ reason: "notFound" }] } });
    if (req.method() === "DELETE") { drive.files.delete(f.id); return route.fulfill({ status: 204, headers: CORS }); }
    if (url.searchParams.get("alt") === "media") return route.fulfill({ status: 200, headers: { ...CORS, "Content-Type": "application/zip" }, body: f.bytes });
    return json(route, 200, pick(f, url.searchParams.get("fields")));
  }
  return json(route, 400, { error: { code: 400 } });
}

async function page(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  // The copy here has no Web client ID of its own; the test gives it one.
  await ctx.route(/\/src\/drive\.js/, async (route) => {
    const res = await route.fetch();
    route.fulfill({ response: res, body: (await res.text()).replace('const WEB_CLIENT = "";', 'const WEB_CLIENT = "test.apps.googleusercontent.com";') });
  });
  await ctx.route(/^https:\/\/(accounts\.google\.com|www\.googleapis\.com|oauth2\.googleapis\.com)\//, google);
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/favicon|Blocked script execution/.test(m.text() + (m.location().url || ""))) p.errors.push(m.text()); });
  await p.goto(ROOT);
  await p.waitForSelector("#saveUrl");
  return p;
}
async function until(p, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (!(await p.evaluate(fn, arg))) {
    if (Date.now() - t0 > ms) throw new Error("timed out: " + String(fn).slice(0, 80));
    await p.waitForTimeout(200);
  }
}
async function openDrive(p) {
  await p.click("#settingsBtn");
  await p.locator(".nav-row", { hasText: "Google Drive" }).click();
}
async function connect(p) {
  await openDrive(p);
  const popup = p.context().waitForEvent("page");
  await p.locator(".row", { hasText: "Connect Google Drive" }).click();
  await (await popup).waitForEvent("close", { timeout: 10000 });
  await p.locator("#sectionBody", { hasText: "Connected as reader@example.com" }).waitFor();
}

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  try {
    const p = await page(browser);

    await test("Google Drive connects through Google's sign-in window", async () => {
      await p.fill("#saveUrl", ARTICLE);
      await p.press("#saveUrl", "Enter");
      await p.locator(".page-card .card-title", { hasText: "The Long Haul Flight" }).waitFor({ timeout: 10000 });
      await connect(p);
      assert.strictEqual(drive.signIns, 1);
      assert.ok([...drive.files.values()].some((f) => f.name === "Waypage" && f.mimeType === "application/vnd.google-apps.folder"), "no Waypage folder");
    });

    await test("Back up now sends the library into the Waypage folder", async () => {
      await p.locator(".row", { hasText: "Back up now" }).click();
      await p.locator("#driveStatus", { hasText: "Last backup just now" }).waitFor({ timeout: 15000 });
      const backups = [...drive.files.values()].filter((f) => f.appProperties && f.appProperties.waypage === "backup");
      assert.strictEqual(backups.length, 1);
      assert.strictEqual(backups[0].bytes.slice(0, 2).toString(), "PK", "not a zip");
      assert.strictEqual(backups[0].appProperties.clips, "1");
      await p.locator(".row", { hasText: "Restore" }).filter({ hasText: "1 clip" }).waitFor();
    });

    await test("Drive keeps the last three backups", async () => {
      for (let i = 0; i < 3; i++) {
        const made = drive.n;
        await p.locator(".row", { hasText: "Back up now" }).click();
        await until(p, () => !document.querySelector("#sectionBody button[disabled]"), null, 15000);
        assert.ok(drive.n > made, "backup " + (i + 2) + " wasn't sent");
      }
      const backups = [...drive.files.values()].filter((f) => f.appProperties && f.appProperties.waypage === "backup");
      assert.strictEqual(backups.length, 3, backups.length + " backups kept");
    });

    await test("unpicking Clips leaves them out of the next backup", async () => {
      await p.locator("label.row", { hasText: "Clips" }).locator("input").uncheck();
      await p.locator(".row", { hasText: "Back up now" }).click();
      await p.locator("text=There's nothing to back up with what's picked.").waitFor();
      await p.locator("label.row", { hasText: "Clips" }).locator("input").check();
    });

    await test("a week after the last backup, the next one goes by itself", async () => {
      const made = drive.n;
      await p.evaluate(() => { window.Waypage.drive.last = { at: Date.now() - 8 * 24 * 3600e3 }; driveDue(); });
      await until(p, () => !document.querySelector("#sectionBody button[disabled]") && window.Waypage.drive.last.at > Date.now() - 6e4, null, 15000);
      assert.ok(drive.n > made, "no backup was sent");
      await p.evaluate(() => driveDue());
      await p.waitForTimeout(500);
      assert.strictEqual(await p.locator("#sectionBody button[disabled]").count(), 0, "it went again within the week");
    });

    await test("a new browser restores the library from Drive", async () => {
      const q = await page(browser);
      assert.strictEqual(await q.locator(".page-card").count(), 0);
      await connect(q);
      await q.locator(".row", { hasText: "Restore" }).filter({ hasText: "1 clip" }).first().click();
      await q.locator("text=Restored 1 clip").waitFor({ timeout: 15000 });
      const got = await q.evaluate(async () => (await window.Waypage.store.readIndex()).map((x) => x.url));
      assert.deepStrictEqual(got, [ARTICLE]);
      assert.deepStrictEqual(q.errors, [], q.errors.join(" | "));
      await q.locator(".row", { hasText: "Disconnect Google Drive" }).click();
      await q.locator(".row", { hasText: "Connect Google Drive" }).waitFor();
      await q.context().close();
    });

    await test("no errors in the page", async () => {
      assert.deepStrictEqual(p.errors, [], p.errors.join(" | "));
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("\n" + passed + " passed");
})();
