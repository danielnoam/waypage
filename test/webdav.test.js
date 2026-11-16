// The WebDAV extension: a PROPFIND answer read as folders and books, the
// place itself in a phone-sized browser with the phone's requests stood in
// for, the synced list without passwords, and Android's hand-written
// PROPFIND (Dav.java) against a small server, when a JDK is here.
// `node test/webdav.test.js`. Needs Playwright, like catalogs.test.js.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

function playwright() {
  const tries = ["playwright", "/opt/node-tools/node_modules/playwright"];
  if (process.env.PLAYWRIGHT_MODULE) tries.unshift(process.env.PLAYWRIGHT_MODULE);
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  return null;
}

const PORT = 5700 + Math.floor(Math.random() * 400);
const ROOT = "http://localhost:" + PORT + "/";
const BASE = "https://cloud.example.test/remote.php/dav/files/daniel/Books/";

let passed = 0;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + String(e.message).split("\n").slice(0, 4).join("\n    ")); process.exitCode = 1; }
}

// What Nextcloud answers a Depth: 1 PROPFIND: the folder itself first,
// then what's in it, each with the properties found and those not.
const entry = (href, props) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>`
  + `<d:propstat><d:prop><d:getcontenttype/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response>`;
const dir = (href) => entry(href, "<d:resourcetype><d:collection/></d:resourcetype>");
const file = (href, size) => entry(href, `<d:resourcetype/><d:getcontentlength>${size}</d:getcontentlength><d:getlastmodified>Mon, 16 Nov 2026 10:00:00 GMT</d:getlastmodified>`);
const multi = (...xs) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">${xs.join("")}</d:multistatus>`;
const P = "/remote.php/dav/files/daniel/Books/";
const LISTS = {
  [P]: multi(dir(P), dir(P + "Sci-Fi/"), dir(P + ".Trash/"), file(P + "Dune%20(1965).epub", 812345), file(P + "Dune%20(1965).jpg", 2000), file(P + "notes.docx", 10), file(P + "Saga%201.cbz", 54000000)),
  [P + "Sci-Fi/"]: multi(dir(P + "Sci-Fi/"), file(P + "Sci-Fi/Hyperion.pdf", 3000000), file(P + "Sci-Fi/cover.jpg", 1000)),
};

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () => fetch(ROOT).then(() => resolve(child), () => (Date.now() - t0 > 5000 ? reject(new Error("server didn't start")) : setTimeout(poll, 100)));
    poll();
  });
}

// A phone with the WebDAV extension on: the server's listings answered
// from LISTS, as the Files plugin would.
async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route((u) => !u.href.startsWith(ROOT), (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.ext && typeof goPlace === "function");
  await p.evaluate(async (lists) => {
    const P = window.Waypage.platform;
    P.native = true;
    Object.defineProperty(P, "canReadPages", { get: () => true, configurable: true });
    window.asked = [];
    P.dav = async (url, auth, depth) => {
      window.asked.push({ url, auth, depth });
      const body = lists[new URL(url).pathname];
      return body ? { status: 207, url, text: body } : { status: 404, url, text: "" };
    };
    window.fetched = [];
    P.fetchBytes = async (url, name, headers) => { window.fetched.push({ url, auth: (headers || {}).Authorization || "" }); return { status: 200, url, type: "application/epub+zip", blob: new Blob([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])]) }; };
    window.covers = [];
    P.downloadTo = async (url, name, page, dir, headers) => { window.covers.push({ url, auth: (headers || {}).Authorization || "" }); return ""; };
    window.opened = [];
    // The file lands in the Library as openFile would put it there.
    window.openFile = async (file) => { window.opened.push(file.name); state.pages.unshift({ id: "f" + window.opened.length, title: file.name, file: { name: file.name, size: file.size, kind: "epub" }, savedAt: Date.now() }); };
    await window.Waypage.ext.turnOn("webdav");
  }, LISTS);
  return { ctx, p };
}

function javaCheck() {
  const javac = spawnSync("javac", ["-version"], { encoding: "utf8" });
  if (javac.error || javac.status !== 0) return null;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "dav-"));
  const src = path.join(__dirname, "..", "native", "share", "android", "src", "main", "java", "io", "github", "danielnoam", "waypage", "share", "Dav.java");
  fs.writeFileSync(path.join(out, "Run.java"), "import io.github.danielnoam.waypage.share.Dav;\npublic class Run { public static void main(String[] a) throws Exception { Dav.Result r = Dav.propfind(a[0], a[1], \"1\"); System.out.print(r.status + \"\\n\" + r.url + \"\\n\" + r.text); } }\n");
  const built = spawnSync("javac", ["-d", out, src, path.join(out, "Run.java")], { encoding: "utf8" });
  if (built.status !== 0) throw new Error("Dav.java doesn't compile: " + built.stderr);
  return (url, auth) => new Promise((ok, no) => {
    const run = spawn("java", ["-cp", out, "Run", url, auth], { stdio: ["ignore", "pipe", "pipe"] });
    let text = "", err = "";
    run.stdout.on("data", (d) => { text += d; });
    run.stderr.on("data", (d) => { err += d; });
    run.on("close", (code) => (code === 0 ? ok(text.split("\n")) : no(new Error(err.split("\n").filter((l) => !/JAVA_TOOL_OPTIONS/.test(l)).join(" ").slice(0, 300)))));
  });
}

(async () => {
  await test("Android's PROPFIND: Depth, login, chunked answer, a redirect on the same server, none to another", async () => {
    const java = javaCheck();
    if (!java) { console.log("  skip - no JDK here"); return; }
    const seen = [];
    const dav = http.createServer((q, s) => {
      let b = "";
      q.on("data", (d) => { b += d; });
      q.on("end", () => {
        seen.push({ method: q.method, url: q.url, depth: q.headers.depth, auth: q.headers.authorization || "", body: b });
        if (q.url === "/old") { s.writeHead(301, { Location: "/Books/" }); return s.end(); }
        if (q.url === "/away") { s.writeHead(302, { Location: "http://elsewhere.example.test/Books/" }); return s.end(); }
        if (q.headers.authorization !== "Basic ZGFuaWVsOnMzY3JldA==") { s.writeHead(401); return s.end(); }
        s.writeHead(207, { "Content-Type": "application/xml; charset=utf-8" });
        s.write(multi(dir("/Books/")).slice(0, 40));
        s.end(multi(dir("/Books/")).slice(40));
      });
    });
    await new Promise((ok) => dav.listen(0, "127.0.0.1", ok));
    const at = "http://127.0.0.1:" + dav.address().port;
    try {
      const auth = "Basic ZGFuaWVsOnMzY3JldA==";
      const [status, url, ...text] = await java(at + "/old", auth);
      assert.strictEqual(status, "207");
      assert.strictEqual(url, at + "/Books/");
      assert.strictEqual(text.join("\n"), multi(dir("/Books/")));
      assert.deepStrictEqual(seen.map((x) => [x.method, x.url, x.depth, x.auth]), [["PROPFIND", "/old", "1", auth], ["PROPFIND", "/Books/", "1", auth]]);
      assert.match(seen[1].body, /<d:propfind xmlns:d="DAV:">/);
      const away = await java(at + "/away", auth);
      assert.strictEqual(away[0], "302", "a redirect to another server isn't followed with the login");
      assert.strictEqual(seen.length, 3);
      assert.strictEqual((await java(at + "/Books/", "Basic d3Jvbmc6eA=="))[0], "401");
    } finally { dav.close(); }
  });

  const pw = playwright();
  if (!pw) {
    console.log("  skip - Playwright isn't installed here (set PLAYWRIGHT_MODULE to its path)");
    console.log(passed + " passed");
    return;
  }
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("a PROPFIND answer reads as folders and books, the folder itself and hidden ones left out", async () => {
      const { ctx, p } = await phone(browser);
      const got = await p.evaluate(([xml, base]) => {
        const W = window.Waypage.webdav;
        let bad;
        try { W.parse("<html><body>Nextcloud</body></html>", base); bad = "read"; } catch (e) { bad = e.message; }
        return { got: W.parse(xml, base), bad };
      }, [LISTS[P], BASE]);
      await ctx.close();
      assert.deepStrictEqual(got.got.folders, [{ name: "Sci-Fi", url: BASE + "Sci-Fi/" }]);
      assert.deepStrictEqual(got.got.files.map((f) => [f.name, f.kind, f.size]),
        [["Dune (1965).epub", "epub", 812345], ["Dune (1965).jpg", "", 2000], ["notes.docx", "", 10], ["Saga 1.cbz", "cbz", 54000000]]);
      assert.strictEqual(got.got.files[0].url, BASE + "Dune%20(1965).epub");
      assert.strictEqual(got.got.files[0].modified, Date.parse("Mon, 16 Nov 2026 10:00:00 GMT"));
      assert.strictEqual(got.bad, "not webdav");
    });

    await test("a server is added from its sidebar place, browsed folder by folder, and a book downloads into the Library with the login", async () => {
      const { ctx, p } = await phone(browser);
      await p.evaluate(() => goPlace("webdav"));
      assert.ok(await p.evaluate(() => { renderSide(); return [...document.querySelectorAll(".side-item .side-label")].some((x) => x.textContent === "WebDAV"); }), "WebDAV is in the sidebar");
      await p.locator('#webdav .empty .btn-primary:has-text("Add a server")').click();
      await p.locator('#menuSheet[data-kind="addWebdav"]:not([hidden])').waitFor();
      await p.locator('#menuSheet input[type="url"]').fill("cloud.example.test/remote.php/dav/files/daniel/Books");
      await p.locator('#menuSheet input[type="text"]').fill("daniel");
      await p.locator('#menuSheet input[type="password"]').fill("s3cret");
      await p.locator("#menuSheet .btn-primary").click();
      await p.locator('#webdav .cat-folders .row:has-text("Sci-Fi")').waitFor();
      const kept = await p.evaluate(() => JSON.parse(localStorage.getItem("waypage.webdav")));
      assert.strictEqual(kept.length, 1);
      assert.strictEqual(kept[0].title, "Books", "named by its folder");
      assert.strictEqual(kept[0].url, BASE, "https, and a folder's address ends in /");
      assert.strictEqual(await p.locator("#webdav .dz-grid .dz-book").count(), 2, "books only: no picture, no .docx, no hidden folder");
      assert.strictEqual(await p.locator('#webdav .cat-folders .row:has-text(".Trash")').count(), 0);
      await p.waitForFunction(() => window.covers.length === 1);
      // The find field narrows what's here.
      await p.locator("#webdav .dz-search input").fill("saga");
      assert.strictEqual(await p.locator("#webdav .dz-grid .dz-book").count(), 1);
      await p.locator("#webdav .dz-search input").fill("");
      await p.locator('#webdav .dz-grid .dz-book:has-text("Dune")').click();
      await p.locator('#menuSheet[data-kind="webdavBook"]:not([hidden])').waitFor();
      assert.match(await p.locator("#menuSheet").textContent(), /EPUB · 812 KB/);
      await p.locator('#menuSheet .btn-primary:has-text("Add to your Library")').click();
      await p.waitForFunction(() => window.opened.length === 1);
      await p.locator('#webdav .dz-book[aria-label="Dune (1965), in your library"]').waitFor();
      // Into a folder, its single book takes the folder's cover.jpg, and back up.
      await p.locator('#webdav .cat-folders .row:has-text("Sci-Fi")').click();
      await p.locator('#webdav .dz-grid .dz-book:has-text("Hyperion")').waitFor();
      assert.match(await p.locator("#webdav .cat-where").textContent(), /‹ Books[\s\S]*Sci-Fi/);
      await p.waitForFunction(() => window.covers.length === 2);
      await p.locator("#webdav .cat-up").click();
      await p.locator('#webdav .dz-grid .dz-book:has-text("Saga")').waitFor();
      const got = await p.evaluate(() => ({ fetched: window.fetched, opened: window.opened, asked: window.asked, covers: window.covers,
        page: state.pages.find((x) => x.id === "f1") }));
      await ctx.close();
      const auth = "Basic " + Buffer.from("daniel:s3cret").toString("base64");
      assert.deepStrictEqual(got.fetched, [{ url: BASE + "Dune%20(1965).epub", auth }]);
      assert.deepStrictEqual(got.opened, ["Dune (1965).epub"]);
      assert.strictEqual(got.page.webdav, BASE + "Dune%20(1965).epub", "the clip remembers where it came from");
      assert.deepStrictEqual(got.covers, [{ url: BASE + "Dune%20(1965).jpg", auth }, { url: BASE + "Sci-Fi/cover.jpg", auth }]);
      assert.ok(got.asked.every((a) => a.auth === auth && a.depth === "1"), "every listing went with its login");
    });

    await test("the synced list has no passwords; one that came by sync asks for it, and Settings lists and removes it", async () => {
      const { ctx, p } = await phone(browser);
      const shared = await p.evaluate(() => {
        const W = window.Waypage.webdav;
        W.add({ title: "Home NAS", url: "http://192.168.1.5/dav/", user: "me", pass: "pw" });
        return W.shared();
      });
      assert.strictEqual(shared.list.length, 1);
      assert.ok(!("pass" in shared.list[0]), "no password goes to sync");
      assert.strictEqual(shared.list[0].user, "me");
      // Another device's list: one more server, with a username and no password.
      await p.evaluate((base) => {
        const W = window.Waypage.webdav;
        W.mergeIn({ v: 1, list: [...W.shared().list, { id: "w2", title: "Cloud", url: base, user: "daniel", at: Date.now() + 1000 }], gone: {} });
        store("waypage.webdav.pick", "w2");
        wdPick = "w2";
        goPlace("webdav");
      }, BASE);
      assert.strictEqual(await p.evaluate(() => window.Waypage.webdav.list().find((s) => s.title === "Home NAS").pass), "pw", "a password typed here stays");
      await p.locator('#webdav .empty-title:has-text("Type the password for Cloud")').waitFor();
      assert.strictEqual(await p.evaluate(() => window.asked.length), 0, "nothing asked of the server without its password");
      await p.locator('#webdav .btn-primary:has-text("Type the password")').click();
      await p.locator('#menuSheet[data-kind="addWebdav"]:not([hidden])').waitFor();
      await p.locator('#menuSheet input[type="password"]').fill("s3cret");
      await p.locator("#menuSheet .btn-primary").click();
      await p.locator('#webdav .cat-folders .row:has-text("Sci-Fi")').waitFor();
      await p.evaluate(() => { openSettings(); openSection("webdav", false, true); });
      await p.locator('.settings-section:has-text("Your servers") .row:has-text("Cloud")').click();
      await p.locator('#menuSheet[data-kind="addWebdav"]:not([hidden])').waitFor();
      p.once("dialog", (d) => d.accept());
      await p.locator('#menuSheet .btn-quiet:has-text("Remove this server")').click();
      await p.waitForFunction(() => window.Waypage.webdav.list().length === 1);
      const gone = await p.evaluate(() => window.Waypage.webdav.shared().gone);
      await ctx.close();
      assert.ok(gone.w2, "the removal syncs, so another device drops it too");
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
