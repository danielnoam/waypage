// The Audiobookshelf extension against a stand-in server: signing in keeps
// tokens and never the password, an expired token renews once, the place
// shows what's in progress and the library, Play adds a streaming
// audiobook whose parts are the play session's own addresses (no token in
// them), takes a newer place from the server, and sends where you are back.
// Sync carries the servers without tokens. `node test/abs.test.js`. Needs
// Playwright, like catalogs.test.js.
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

const PORT = 4700 + Math.floor(Math.random() * 280);
const ROOT = "http://localhost:" + PORT + "/";

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

// A phone with the extension on, and a stand-in Audiobookshelf server
// answering the native fetch (C.platform.request), as CapacitorHttp would.
async function phone(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  await ctx.route((u) => !u.href.startsWith(ROOT), (r) => r.fulfill({ status: 404, body: "" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("    page error: " + e.message));
  await p.goto(ROOT);
  await p.waitForFunction(() => window.Waypage && window.Waypage.ext && typeof goPlace === "function");
  await p.evaluate(async () => {
    const P = window.Waypage.platform;
    P.native = true;
    const book = (id, title, extra) => ({ id, libraryId: "lib1", mediaType: "book", updatedAt: 5,
      media: { coverPath: "/c.jpg", duration: 7200, numTracks: 2, numAudioFiles: 2, metadata: { title, authorName: "Ann Author", narratorName: "Ned Reader", seriesName: "", description: "<p>A <b>good</b> book.</p>" }, ...(extra || {}) } });
    // The server: its tokens, what it was asked, and its own place for b1.
    const S = window.absServer = { access: "acc-1", refresh: "ref-1", asked: [], expireOnce: false, place: { currentTime: 1800, lastUpdate: Date.now() + 60000, isFinished: false }, synced: [], closed: [] };
    P.request = async (url, o) => {
      const u = new URL(url), h = o.headers || {};
      S.asked.push({ path: u.pathname + u.search, method: o.method, auth: h.Authorization || "", body: o.body || "" });
      const json = (status, data) => ({ status, text: data == null ? "" : JSON.stringify(data) });
      if (u.pathname === "/login") {
        const b = JSON.parse(o.body);
        if (b.username !== "dan" || b.password !== "pw") return { status: 401, text: "Unauthorized" };
        return json(200, { user: { id: "u1", username: "dan", token: "old", accessToken: S.access, refreshToken: h["x-return-tokens"] === "true" ? S.refresh : null }, userDefaultLibraryId: "lib1", serverSettings: { version: "2.37.2" } });
      }
      if (u.pathname === "/auth/refresh") {
        if (h["x-refresh-token"] !== S.refresh) return json(401, { error: "Invalid refresh token" });
        S.access = "acc-2"; S.refresh = "ref-2";
        return json(200, { user: { id: "u1", accessToken: S.access, refreshToken: S.refresh } });
      }
      if (u.pathname === "/logout") return json(200, {});
      if (h.Authorization !== "Bearer " + S.access || S.expireOnce) { S.expireOnce = false; return { status: 401, text: "Unauthorized" }; }
      if (u.pathname === "/api/libraries") return json(200, { libraries: [{ id: "lib1", name: "Audiobooks", mediaType: "book" }, { id: "pod", name: "Podcasts", mediaType: "podcast" }] });
      if (u.pathname === "/api/libraries/lib1/items") return json(200, { results: [book("b1", "The First Book"), book("b2", "Second Story"), book("e1", "Only an Ebook", { duration: 0, numTracks: 0, numAudioFiles: 0 })], total: 3 });
      if (u.pathname === "/api/me") return json(200, { id: "u1", mediaProgress: [{ libraryItemId: "b2", currentTime: 3600, progress: 0.5, isFinished: false, lastUpdate: 1 }] });
      if (u.pathname === "/api/me/items-in-progress") return json(200, { libraryItems: [{ ...book("b2", "Second Story"), progressLastUpdate: 1 }] });
      if (u.pathname === "/api/libraries/lib1/search") return json(200, { book: [{ libraryItem: book("b2", "Second Story") }] });
      if (u.pathname === "/api/items/b1") return json(200, { ...book("b1", "The First Book", { chapters: [{ start: 0, end: 3600, title: "One" }, { start: 3600, end: 7200, title: "Two" }], tracks: [{ index: 1, duration: 3600 }, { index: 2, duration: 3600 }] }), userMediaProgress: null });
      if (u.pathname === "/api/items/b1/play") return json(200, { id: "sess-9", currentTime: S.place.currentTime, duration: 7200, chapters: [{ start: 0, title: "One" }, { start: 3600, title: "Two" }],
        audioTracks: [{ index: 2, startOffset: 3600, duration: 3600, title: "b.mp3", contentUrl: "/api/items/b1/file/2" }, { index: 1, startOffset: 0, duration: 3600, title: "a.mp3", contentUrl: "/api/items/b1/file/1" }] });
      if (u.pathname === "/api/me/progress/b1") return json(200, S.place);
      if (u.pathname === "/api/session/sess-9/sync") { S.synced.push(JSON.parse(o.body)); return json(200, null); }
      if (u.pathname === "/api/session/sess-9/close") { S.closed.push(JSON.parse(o.body)); return json(200, null); }
      return { status: 404, text: "Not Found" };
    };
    // The player: what it was asked to play.
    const A = P.audio;
    window.played = [];
    A.play = async (o) => { window.played.push({ ...o, urls: await Promise.all(o.parts.map((x) => (x.uri ? x.uri : x.src()))) }); };
    A.stop = () => {};
    A.pause = () => {};
    await window.Waypage.ext.turnOn("audiobookshelf");
  });
  return { ctx, p };
}
const signIn = async (p) => {
  await p.evaluate(() => goPlace("audiobookshelf"));
  await p.click("#audiobookshelf .btn-primary");
  await p.fill('input[aria-label="Server address"]', "192.168.1.20:13378/");
  await p.fill('input[aria-label="Username"]', "dan");
  await p.fill('input[aria-label="Password"]', "pw");
  await p.click(".add-catalog .btn-primary");
  await p.waitForSelector('#audiobookshelf .dz-book[data-key="abs:b1"]');
};

(async () => {
  const server = await startServer();
  const browser = await pw.chromium.launch();
  try {
    await test("signing in keeps the tokens on this device and never the password", async () => {
      const { ctx, p } = await phone(browser);
      await signIn(p);
      const got = await p.evaluate(() => ({ kept: localStorage.getItem("waypage.abs"), login: window.absServer.asked.find((x) => x.path === "/login"), list: window.Waypage.abs.list() }));
      assert.ok(!got.kept.includes("\"pw\""), "the password isn't kept");
      const kept = JSON.parse(got.kept)[0];
      assert.strictEqual(kept.url, "http://192.168.1.20:13378", "a home address is plain http, trailing slash gone");
      assert.strictEqual(kept.token, "acc-1");
      assert.strictEqual(kept.refresh, "ref-1");
      assert.deepStrictEqual(got.list.map((s) => s.signed), [true]);
      assert.ok(!("token" in got.list[0]), "the list doesn't hand out tokens");
      await ctx.close();
    });

    await test("the place shows what's in progress, then the audiobooks; an ebook with no sound isn't there", async () => {
      const { ctx, p } = await phone(browser);
      await signIn(p);
      await p.waitForSelector("#audiobookshelf .abs-bar");
      const got = await p.evaluate(() => ({
        heads: [...document.querySelectorAll("#audiobookshelf .section-head")].map((x) => x.textContent.trim()),
        keys: [...document.querySelectorAll("#audiobookshelf .dz-book")].map((x) => x.dataset.key),
        side: [...document.querySelectorAll(".sidebar .side-label, .sidebar button")].some((x) => /Audiobookshelf/.test(x.textContent)),
        authed: window.absServer.asked.filter((x) => x.path.startsWith("/api/")).every((x) => x.auth === "Bearer acc-1"),
      }));
      assert.deepStrictEqual(got.keys, ["abs:b2", "abs:b1", "abs:b2"], "Continue listening, then the library");
      assert.ok(got.heads[0].startsWith("Continue listening"));
      assert.ok(got.authed, "every API call carries the access token");
      await p.fill("#audiobookshelf input[type=search]", "second");
      await p.press("#audiobookshelf input[type=search]", "Enter");
      await p.waitForSelector("#audiobookshelf .section-head >> text=Results");
      assert.deepStrictEqual(await p.$$eval("#audiobookshelf .dz-book", (xs) => xs.map((x) => x.dataset.key)), ["abs:b2"]);
      await ctx.close();
    });

    await test("an expired access token renews once and the call goes again; a refused refresh asks to sign in", async () => {
      const { ctx, p } = await phone(browser);
      await signIn(p);
      const got = await p.evaluate(async () => {
        const A = window.Waypage.abs, s = A.list()[0];
        window.absServer.expireOnce = true;
        const libs = await A.libraries(s);
        const kept = JSON.parse(localStorage.getItem("waypage.abs"))[0];
        window.absServer.refresh = "something-else";
        window.absServer.access = "acc-3";
        let why = "";
        try { await A.libraries(s); } catch (e) { why = e.message; }
        return { libs, kept, why, signed: A.list()[0].signed };
      });
      assert.deepStrictEqual(got.libs, [{ id: "lib1", name: "Audiobooks" }], "podcast libraries are left out");
      assert.strictEqual(got.kept.token, "acc-2");
      assert.strictEqual(got.kept.refresh, "ref-2", "the renewed refresh token is kept");
      assert.strictEqual(got.why, "login");
      assert.strictEqual(got.signed, false);
      await p.waitForSelector("#audiobookshelf >> text=Sign in to 192.168.1.20:13378");
      await ctx.close();
    });

    await test("Play adds a streaming audiobook, plays the session's own addresses, takes the server's newer place and sends where you are", async () => {
      const { ctx, p } = await phone(browser);
      await signIn(p);
      await p.click('#audiobookshelf .dz-book[data-key="abs:b1"]');
      await p.click(".dz-story .btn-primary");
      await p.waitForFunction(() => window.played.length === 1);
      const got = await p.evaluate(() => {
        const a = state.pages.find((x) => x.remote);
        return { a: JSON.parse(JSON.stringify(a)), played: window.played[0], t: lis.t, inLibrary: a.link };
      });
      assert.deepStrictEqual(got.a.remote, { kind: "audiobookshelf", server: got.a.remote.server, item: "b1" });
      assert.deepStrictEqual(got.played.urls, ["http://192.168.1.20:13378/public/session/sess-9/track/1", "http://192.168.1.20:13378/public/session/sess-9/track/2"], "in order, no token");
      assert.ok(got.played.urls.every((u) => !/token|acc-/.test(u)));
      assert.strictEqual(got.played.part, 0);
      assert.strictEqual(got.played.pos, 1800 * 1000, "from the server's place, which is newer");
      assert.deepStrictEqual(got.a.audio.chapters.map((c) => c.title), ["One", "Two"]);
      assert.strictEqual(got.a.audio.dur, 7200);
      assert.ok(got.inLibrary.startsWith("abs:"), "treated as read from outside: not uploaded, not backed up");
      // Playing on, then a pause: where you are goes to the session.
      const sent = await p.evaluate(async () => {
        const a = state.pages.find((x) => x.remote);
        lis.state = "playing";
        lis.t = 4000;
        abSession.seen = Date.now() - 20000;
        saveListenPlace(true);
        await new Promise((r) => setTimeout(r, 50));
        listenStop();
        await new Promise((r) => setTimeout(r, 50));
        return { synced: window.absServer.synced, closed: window.absServer.closed, t: a.listen.t };
      });
      assert.strictEqual(sent.synced.length, 1);
      assert.strictEqual(sent.synced[0].currentTime, 4000);
      assert.ok(sent.synced[0].timeListened >= 19 && sent.synced[0].timeListened <= 21, "the time listened since the last word");
      assert.strictEqual(sent.synced[0].duration, 7200);
      assert.strictEqual(sent.closed.length, 1, "stopping closes the session");
      await ctx.close();
    });

    await test("sync sends the servers without tokens; one that arrives asks to sign in, one signed in here keeps its tokens", async () => {
      const { ctx, p } = await phone(browser);
      await signIn(p);
      const got = await p.evaluate(() => {
        const A = window.Waypage.abs;
        const doc = A.shared();
        const mine = A.list()[0];
        const other = { id: "a-other", title: "Mum's", url: "https://abs.example.org", user: "mum", at: Date.now() - 5000 };
        const changed = A.mergeIn({ v: 1, list: [...doc.list.map((x) => ({ ...x, title: "Home", at: Date.now() + 1000 })), other], gone: {} });
        return { doc: JSON.stringify(doc), changed, list: A.list(), kept: JSON.parse(localStorage.getItem("waypage.abs")).find((x) => x.id === mine.id) };
      });
      assert.ok(!/acc-|ref-|token|refresh/.test(got.doc), "no tokens in what sync sends");
      assert.ok(got.changed);
      assert.deepStrictEqual(got.list.map((s) => [s.title, s.signed]), [["Home", true], ["Mum's", false]]);
      assert.strictEqual(got.kept.token, "acc-1");
      const gone = await p.evaluate(() => {
        const A = window.Waypage.abs;
        const doc = A.shared();
        A.remove("a-other");
        A.mergeIn(doc);
        return A.list().map((s) => s.id);
      });
      assert.ok(!gone.includes("a-other"), "a removal sticks against an older list");
      await ctx.close();
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(passed + " passed");
})();
