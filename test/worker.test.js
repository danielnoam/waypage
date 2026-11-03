// The web copy's fetch proxy (worker/worker.js), run in Node with the
// outside world faked: `node test/worker.test.js`. Checks who it answers,
// what it refuses to fetch, redirects, the size cap and what it sends on.
const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const HOME = "https://danielnoam.github.io";
const PROXY = "https://waypage-fetch.example.workers.dev/";
const ask = (url, { origin = HOME, method = "GET", query = {}, headers = {} } = {}) =>
  new Request(PROXY + "?" + new URLSearchParams({ url, ...query }), { method, headers: origin ? { Origin: origin, ...headers } : headers });

// Every outside fetch goes through `sites`: address -> Response (or a function making one).
let sites = {};
let sent = [];
global.fetch = async (url, init) => {
  sent.push({ url, init });
  const s = sites[url];
  if (!s) throw new TypeError("unreachable");
  return typeof s === "function" ? s(init) : s.clone();
};
const page = (body, headers = {}, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html", ...headers } });

(async () => {
  const W = (await import(pathToFileURL(path.join(__dirname, "..", "worker", "worker.js")).href));
  const proxy = W.default;
  const run = (req, env = {}) => { sent = []; return proxy.fetch(req, env); };

  await test("answers the web copy with the page, its type and where it ended", async () => {
    sites = { "https://example.com/a": page("<p>hi</p>") };
    const res = await run(ask("https://example.com/a"));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(await res.text(), "<p>hi</p>");
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), HOME);
    assert.strictEqual(res.headers.get("Content-Type"), "text/html");
    assert.strictEqual(res.headers.get("X-Final-Url"), "https://example.com/a");
    assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
    assert.strictEqual(res.headers.get("X-Proxy-Error"), null);
  });

  await test("refuses other origins, forks included, and requests with none", async () => {
    sites = { "https://example.com/a": page("x") };
    for (const origin of ["https://someone.github.io", "https://danielnoam.github.io.evil.com", "null", ""]) {
      const res = await run(ask("https://example.com/a", { origin }));
      assert.strictEqual(res.status, 403, origin);
      assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), null, origin);
      assert.strictEqual(sent.length, 0, origin);
    }
    assert.strictEqual((await run(ask("https://example.com/a", { origin: "http://localhost:5173" }))).status, 200);
  });

  await test("GET only (and the preflight)", async () => {
    assert.strictEqual((await run(ask("https://example.com/a", { method: "POST" }))).status, 405);
    const pre = await run(ask("https://example.com/a", { method: "OPTIONS" }));
    assert.strictEqual(pre.status, 204);
    assert.strictEqual(pre.headers.get("Access-Control-Allow-Methods"), "GET");
  });

  await test("won't fetch private, local or odd addresses", async () => {
    for (const u of ["http://localhost/", "http://127.0.0.1/", "http://0x7f.1/", "http://2130706433/", "http://10.0.0.5/",
      "http://192.168.1.1/", "http://172.20.0.1/", "http://169.254.169.254/latest/meta-data", "http://100.64.0.1/",
      "http://[::1]/", "http://[fd00::1]/", "http://printer.local/", "http://intranet/", "http://db.internal/",
      "ftp://example.com/", "file:///etc/passwd", "https://user:pw@example.com/", "https://example.com:22/",
      "https://waypage-fetch.example.workers.dev/?url=x", "not a url"]) {
      const res = await run(ask(u));
      assert.ok(res.status === 403 || res.status === 400, u + " gave " + res.status);
      assert.ok(res.headers.get("X-Proxy-Error"), u);
      assert.strictEqual(sent.length, 0, u);
    }
  });

  await test("follows redirects itself, checking every hop", async () => {
    sites = {
      "https://example.com/old": new Response(null, { status: 301, headers: { Location: "/new" } }),
      "https://example.com/new": page("moved"),
      "https://example.com/sneaky": new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } }),
      "https://example.com/loop": new Response(null, { status: 302, headers: { Location: "/loop" } }),
    };
    const res = await run(ask("https://example.com/old"));
    assert.strictEqual(await res.text(), "moved");
    assert.strictEqual(res.headers.get("X-Final-Url"), "https://example.com/new");
    assert.ok(sent.every((s) => s.init.redirect === "manual"));
    const sneaky = await run(ask("https://example.com/sneaky"));
    assert.strictEqual(sneaky.status, 403);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual((await run(ask("https://example.com/loop"))).status, 508);
  });

  await test("passes the site's own errors through, unmarked", async () => {
    sites = { "https://example.com/gone": page("gone", {}, 404) };
    const res = await run(ask("https://example.com/gone"));
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.headers.get("X-Proxy-Error"), null);
  });

  await test("refuses what's too big, by length or by counting", async () => {
    sites = { "https://example.com/big": page("x", { "Content-Length": String(W.MAX_BYTES + 1) }) };
    assert.strictEqual((await run(ask("https://example.com/big"))).status, 413);
    const huge = new Uint8Array(W.MAX_BYTES + 10);
    sites = { "https://example.com/sly": () => new Response(new Blob([huge]).stream(), { headers: { "Content-Type": "text/html" } }) };
    const res = await run(ask("https://example.com/sly"));
    await assert.rejects(res.arrayBuffer());
  });

  await test("sends the visitor's browser with the app named, or what was asked for; never cookies", async () => {
    sites = { "https://example.com/a": page("x", { "Set-Cookie": "id=1" }) };
    const res = await run(ask("https://example.com/a", { headers: { "User-Agent": "Firefox/140", Cookie: "mine=1", "Accept-Language": "he" } }));
    const h = sent[0].init.headers;
    assert.ok(/^Firefox\/140 Waypage \(/.test(h["User-Agent"]), h["User-Agent"]);
    assert.strictEqual(h["Accept-Language"], "he");
    assert.ok(!("Cookie" in h));
    assert.ok(/text\/html/.test(h.Accept));
    assert.strictEqual(res.headers.get("Set-Cookie"), null);
    await run(ask("https://example.com/a", { query: { accept: "application/rss+xml", ua: "Chrome/128" } }));
    assert.strictEqual(sent[0].init.headers.Accept, "application/rss+xml");
    assert.strictEqual(sent[0].init.headers["User-Agent"], "Chrome/128");
  });

  await test("rate-limits per visitor", async () => {
    sites = { "https://example.com/a": page("x") };
    const keys = [];
    const env = { PER_IP: { limit: async ({ key }) => { keys.push(key); return { success: keys.length < 2 }; } } };
    const req = () => ask("https://example.com/a", { headers: { "CF-Connecting-IP": "203.0.113.9" } });
    assert.strictEqual((await run(req(), env)).status, 200);
    const res = await run(req(), env);
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.headers.get("X-Proxy-Error"), "rate limited");
    assert.deepStrictEqual(keys, ["203.0.113.9", "203.0.113.9"]);
  });

  console.log("  " + passed + " passed");
})();
