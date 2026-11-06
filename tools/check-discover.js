// Checks every entry in Discover's hand-picked list (src/discover-list.js)
// still answers: a feed must come back as RSS, Atom or RDF, a newsletter's
// sign-up page and a serial's contents page must load. Run weekly by
// .github/workflows/discover-check.yml, and by hand: `node tools/check-discover.js`.
//
// A 403, 429 or 503 is reported but doesn't fail the check: many sites turn
// away GitHub's machines (datacenter addresses) while a phone gets through.
// A 404, 410, a dead host or a feed that isn't a feed fails it.
const fs = require("fs");
const path = require("path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "src", "discover-list.js"), "utf8");
const m = /\/\/ LIST START\s*([\s\S]*?)\s*\/\/ LIST END/.exec(SOURCE);
if (!m) { console.error("No list between the markers in src/discover-list.js"); process.exit(1); }
const { entries } = JSON.parse(m[1]);

const UA = "Mozilla/5.0 (compatible; Waypage list check; +https://github.com/danielnoam/waypage)";
const FEED = /<(rss|feed|rdf:RDF)[\s>]/i;
const BLOCKED = new Set([401, 403, 429, 503]);

async function check(e) {
  const url = e.kind === "feed" ? e.feed : e.kind === "newsletter" ? e.signup || e.url : e.url;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: e.kind === "feed" ? "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" : "text/html, */*" },
      redirect: "follow", signal: AbortSignal.timeout(30000),
    });
    const body = await res.text();
    const ms = Date.now() - t0;
    if (BLOCKED.has(res.status)) return { e, url, level: "warn", why: "HTTP " + res.status + " (the site may turn away GitHub's machines)", ms };
    if (!res.ok) return { e, url, level: "fail", why: "HTTP " + res.status, ms };
    if (e.kind === "feed" && !FEED.test(body.slice(0, 4000))) return { e, url, level: "fail", why: "not a feed (" + (res.headers.get("content-type") || "no type") + ")", ms };
    const moved = res.url && res.url.replace(/\/$/, "") !== url.replace(/\/$/, "") ? "moved to " + res.url : "";
    return { e, url, level: "ok", why: moved, ms };
  } catch (err) {
    return { e, url, level: "fail", why: (err && err.cause && err.cause.code) || (err && err.name === "TimeoutError" ? "timed out" : String(err && err.message || err)), ms: Date.now() - t0 };
  }
}

(async () => {
  const results = [];
  // A few at a time, so no site sees a burst.
  for (let i = 0; i < entries.length; i += 6) results.push(...await Promise.all(entries.slice(i, i + 6).map(check)));
  const mark = { ok: "ok  ", warn: "WARN", fail: "FAIL" };
  for (const r of results) console.log(mark[r.level] + "  " + r.e.kind.padEnd(10) + " " + r.e.name + "  " + r.url + (r.why ? "  - " + r.why : ""));
  const fails = results.filter((r) => r.level === "fail"), warns = results.filter((r) => r.level === "warn");
  console.log("\n" + (results.length - fails.length - warns.length) + " ok, " + warns.length + " turned GitHub away, " + fails.length + " broken");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const row = (r) => "| " + r.level + " | " + r.e.kind + " | " + r.e.name.replace(/\|/g, "/") + " | " + r.url + " | " + (r.why || "").replace(/\|/g, "/") + " |";
    const shown = results.filter((r) => r.level !== "ok" || r.why);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Discover's list\n\n" + (results.length - fails.length - warns.length) + " ok, " + warns.length + " turned GitHub away, " + fails.length + " broken.\n\n" +
      (shown.length ? "| | Kind | Name | Address | Why |\n|---|---|---|---|---|\n" + shown.map(row).join("\n") + "\n" : ""));
  }
  if (fails.length) process.exitCode = 1;
})();
