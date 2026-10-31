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
const drive = { files: new Map(), n: 0, signIns: 0, slow: 0, uploads: 0, sessions: new Map(), pieces: 0, sent: 0 };
// Like Google's, which shows a browser the upload id but not Location.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, content-range, x-upload-content-type, x-upload-content-length",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH", "Access-Control-Expose-Headers": "X-GUploader-UploadID, Range" };
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
  // A resumable upload (1.47.0): the session, then its pieces.
  if (p === "/upload/drive/v3/files" && url.searchParams.get("uploadType") === "resumable") {
    if (req.method() === "POST") {
      drive.uploads++;
      const id = "up" + ++drive.n;
      drive.sessions.set(id, { meta: JSON.parse(req.postData()), total: Number(req.headers()["x-upload-content-length"]), chunks: [] });
      return route.fulfill({ status: 200, headers: { ...CORS, "X-GUploader-UploadID": id, Location: url.href + "&upload_id=" + id }, body: "" });
    }
    const s = drive.sessions.get(url.searchParams.get("upload_id"));
    if (!s) return json(route, 404, { error: { code: 404 } });
    const have = s.chunks.reduce((n, c) => n + c.length, 0);
    // How far it got, asked after a pause; a finished one answers with
    // its file, as Drive does.
    if (/^bytes \*\/\d+$/.test(req.headers()["content-range"] || "")) {
      drive.asked = (drive.asked || 0) + 1;
      if (s.file) return json(route, 200, pick(s.file));
      return route.fulfill({ status: 308, headers: { ...CORS, ...(have ? { Range: "bytes=0-" + (have - 1) } : {}) }, body: "" });
    }
    if (s.file) return json(route, 200, pick(s.file));
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers()["content-range"] || "");
    const body = req.postDataBuffer() || Buffer.alloc(0);
    if (!m || Number(m[1]) !== have) return json(route, 400, { error: { code: 400 } });
    // Taken before the answer is slow to come: a piece stopped while
    // waiting may still have reached Drive.
    s.chunks.push(body);
    drive.pieces++;
    drive.sent += body.length;
    if (have + body.length >= s.total) {
      s.file = { id: "f" + ++drive.n, at: Date.now() + drive.n, bytes: Buffer.concat(s.chunks), ...s.meta };
      drive.files.set(s.file.id, s.file);
    }
    if (drive.slow) await new Promise((go) => setTimeout(go, drive.slow));
    if (!s.file) return route.fulfill({ status: 308, headers: CORS, body: "" });
    return json(route, 200, pick(s.file));
  }
  if (p === "/upload/drive/v3/files" && req.method() === "POST") {
    drive.uploads++;
    if (drive.slow) await new Promise((go) => setTimeout(go, drive.slow));
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
  // A test client ID in place of the real one.
  await ctx.route(/\/src\/drive\.js/, async (route) => {
    const res = await route.fetch();
    route.fulfill({ response: res, body: (await res.text()).replace(/const WEB_CLIENT = "[^"]*";/, 'const WEB_CLIENT = "test.apps.googleusercontent.com";') });
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
      await p.waitForTimeout(500);
      await p.evaluate(() => driveDue());
      await p.waitForTimeout(500);
      assert.strictEqual(drive.uploads, 0, "it backed up on connecting");
      assert.ok([...drive.files.values()].some((f) => f.name === "Waypage" && f.mimeType === "application/vnd.google-apps.folder"), "no Waypage folder");
    });

    await test("Back up now sends the library into the Waypage folder", async () => {
      await p.locator(".row", { hasText: "Back up now" }).click();
      await p.locator("#driveStatus", { hasText: "Last backup just now" }).waitFor({ timeout: 15000 });
      const backups = [...drive.files.values()].filter((f) => f.appProperties && f.appProperties.waypage === "backup");
      assert.strictEqual(backups.length, 1);
      assert.strictEqual(backups[0].bytes.slice(0, 2).toString(), "PK", "not a zip");
      assert.strictEqual(backups[0].appProperties.clips, "1");
      await p.locator(".drive-pick", { hasText: "Restore" }).filter({ hasText: "1 clip" }).waitFor();
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

    await test("Links only puts clips in as their addresses, and a restore saves them again (1.47.0)", async () => {
      await p.locator(".seg-item", { hasText: "Links only" }).click();
      const made = drive.n;
      await p.locator(".row", { hasText: "Back up now" }).click();
      await until(p, () => !document.querySelector("#sectionBody button[disabled]"), null, 15000);
      assert.ok(drive.n > made, "no backup was sent");
      const newest = [...drive.files.values()].filter((f) => f.appProperties && f.appProperties.waypage === "backup").sort((a, b) => b.at - a.at)[0];
      const text = newest.bytes.toString("latin1");
      assert.ok(text.includes("library.json") && text.includes(ARTICLE), "the clip's address isn't in it");
      assert.ok(!/pages\/[a-z0-9]+\/page\.html/.test(text), "a clip's page went in");
      const got = await p.evaluate(async (bytes) => {
        const res = await window.Waypage.backup.restoreLibrary(new Blob([new Uint8Array(bytes)]), [], (a, b) => a === b);
        return { added: res.added, links: res.links.map((m) => m.url), back: !!(res.links[0] && res.links[0].back) };
      }, [...newest.bytes]);
      assert.deepStrictEqual(got, { added: 0, links: [ARTICLE], back: true });
      await p.locator(".seg-item", { hasText: "Clips too" }).click();
      drive.files.delete(newest.id);
    });

    await test("a backup can be paused, resumed and stopped, here and on the Sync screen (1.28.0)", async () => {
      drive.slow = 1500;
      const before = drive.n;
      await p.locator(".row", { hasText: "Back up now" }).click();
      await p.locator("#driveStatus", { hasText: "Sending to Drive" }).waitFor();
      await p.locator("#sectionBody .drive-actions button", { hasText: "Pause" }).click();
      await p.locator("#driveStatus", { hasText: "Paused" }).waitFor();
      await p.waitForTimeout(1800);
      assert.ok(await p.locator("#driveStatus", { hasText: "Paused" }).count(), "it went on while paused");
      await p.locator("#sectionBody .drive-actions button", { hasText: "Resume" }).click();
      await p.locator("#driveStatus", { hasText: "Last backup" }).waitFor({ timeout: 15000 });
      assert.ok(drive.n > before, "the backup didn't finish after Resume");
      await p.locator(".row", { hasText: "Back up now" }).click();
      await p.locator("#driveStatus", { hasText: "Sending to Drive" }).waitFor();
      assert.strictEqual(await p.evaluate(() => { renderDownloads(); return !!document.querySelector("#downloads .drive-run"); }), false, "a backup showed in Downloads");
      await p.evaluate(() => openSyncPage());
      await p.locator("#syncView:not([hidden])").waitFor();
      assert.strictEqual(await p.locator("#syncBtn").isVisible(), true, "no sync button with only Drive on");
      await p.locator("#syncList .drive-run .btn-quiet.danger", { hasText: "Stop" }).click();
      await p.locator("text=Backup stopped").waitFor();
      await p.locator("#syncList .card", { hasText: "Back up now" }).waitFor();
      await p.waitForTimeout(1800);
      assert.ok(!(await p.evaluate(() => window.Waypage.drive.last.error)), "stopping counted as a failure");
      drive.slow = 0;
      await p.evaluate(() => history.back());
      await p.locator("#syncView[hidden]").waitFor({ state: "attached" });
      await openDrive(p);
    });

    await test("a week after the last backup, the next one goes by itself", async () => {
      const made = drive.n;
      await p.evaluate(() => { window.Waypage.drive.last = { at: Date.now() - 8 * 24 * 3600e3 }; window.Waypage.drive.since = 0; driveDue(); });
      await until(p, () => !document.querySelector("#sectionBody button[disabled]") && window.Waypage.drive.last.at > Date.now() - 6e4, null, 15000);
      assert.ok(drive.n > made, "no backup was sent");
      await p.evaluate(() => driveDue());
      await p.waitForTimeout(500);
      assert.strictEqual(await p.locator("#sectionBody button[disabled]").count(), 0, "it went again within the week");
    });

    await test("how often is picked here: every day goes after a day, Only when I ask never (1.46.0)", async () => {
      await p.locator(".drive-every .dropdown-btn").click(); await p.locator(".dropdown-item", { hasText: "Every day" }).click();
      assert.strictEqual(await p.evaluate(() => window.Waypage.drive.every), 1);
      const made = drive.n;
      await p.evaluate(() => { window.Waypage.drive.last = { at: Date.now() - 2 * 24 * 3600e3 }; driveDue(); });
      await until(p, () => !document.querySelector("#sectionBody button[disabled]") && window.Waypage.drive.last.at > Date.now() - 6e4, null, 15000);
      assert.ok(drive.n > made, "no daily backup was sent");
      await p.locator(".drive-every .dropdown-btn").click(); await p.locator(".dropdown-item", { hasText: "Only when I ask" }).click();
      const now = drive.n;
      await p.evaluate(() => { window.Waypage.drive.last = { at: Date.now() - 60 * 24 * 3600e3 }; driveDue(); });
      await p.waitForTimeout(800);
      assert.strictEqual(drive.n, now, "it backed up with Only when I ask");
      await p.locator(".drive-every .dropdown-btn").click(); await p.locator(".dropdown-item", { hasText: "Every week" }).click();
      assert.strictEqual(await p.evaluate(() => window.Waypage.drive.auto), true);
    });

    await test("a browser sends a big backup in pieces and goes on from the last one after a pause (1.47.0)", async () => {
      const sentBefore = drive.sent;
      drive.slow = 300;
      const got = await p.evaluate(async () => {
        const D = window.Waypage.drive;
        const bytes = new Uint8Array(20 * 1024 * 1024);
        for (let i = 0; i < bytes.length; i += 4096) bytes[i] = i % 251;
        const out = { blob: new Blob([bytes]), name: "waypage-backup-big.zip" };
        const ctl = {};
        const first = D.upload(out, { device: "test", clips: 1 }, null, ctl);
        // Paused while the second piece waits for its answer.
        const pause = setInterval(() => { if (ctl.at >= 8 * 1024 * 1024 && ctl.stop) { clearInterval(pause); ctl.stop(); } }, 20);
        const why = await first.then(() => "finished", (e) => e.code);
        const made = await D.upload(out, { device: "test", clips: 1 }, null, ctl);
        return { why, size: made.size };
      });
      drive.slow = 0;
      assert.strictEqual(got.why, "cancelled", JSON.stringify(got));
      assert.strictEqual(got.size, 20 * 1024 * 1024, JSON.stringify(got));
      assert.ok(drive.asked >= 1, "it didn't ask Drive how far it got");
      assert.ok(drive.sent - sentBefore < 28 * 1024 * 1024, "it sent " + (drive.sent - sentBefore) + " bytes for a 20 MB backup");
      const big = [...drive.files.values()].find((f) => f.name === "waypage-backup-big.zip");
      assert.strictEqual(big.bytes.length, 20 * 1024 * 1024);
      assert.strictEqual(big.bytes[4096 * 7], (4096 * 7) % 251);
      drive.files.delete(big.id);
    });

    await test("a backup can be deleted from the list (1.31.0)", async () => {
      const count = () => [...drive.files.values()].filter((f) => f.appProperties && f.appProperties.waypage === "backup").length;
      const had = count();
      await p.locator(".drive-row").first().waitFor();
      const rows = await p.locator(".drive-row").count();
      p.once("dialog", (d) => d.dismiss());
      await p.locator(".drive-delete").first().click();
      await p.waitForTimeout(300);
      assert.strictEqual(count(), had, "deleted without asking");
      p.once("dialog", (d) => d.accept());
      await p.locator(".drive-delete").first().click();
      await p.locator("text=Backup deleted").waitFor();
      assert.strictEqual(count(), had - 1);
      assert.strictEqual(await p.locator(".drive-row").count(), rows - 1);
    });

    await test("a new browser restores the library from Drive", async () => {
      const q = await page(browser);
      assert.strictEqual(await q.locator(".page-card").count(), 0);
      await connect(q);
      await q.locator(".drive-pick", { hasText: "Restore" }).filter({ hasText: "1 clip" }).first().click();
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
