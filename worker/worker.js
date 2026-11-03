// Waypage's fetch proxy: the web copy's way past CORS. The phone app never
// uses it; it fetches natively (src/platform.js).
//
//   GET /?url=<address>[&accept=<Accept>][&ua=<User-Agent>]
//
// Answers with the page's own status and body, its Content-Type, and the
// address it ended at (after redirects) in X-Final-Url. Its own refusals
// carry X-Proxy-Error (a short reason) and are never a page's answer.
//
// What it promises (CONTRIBUTING.md, "No server for the phone app"):
// - stores nothing: no cache, no logs (wrangler.toml turns them off), no
//   cookies either way;
// - answers only the web copy's origin (and localhost, for working on it);
//   the Origin header is only trustworthy from a browser, so the per-IP
//   rate limit and the free plan's daily cap are what bound anyone else;
// - GET only, http(s) only, public addresses only, at most MAX_BYTES.

export const ORIGINS = [/^https:\/\/danielnoam\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
export const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT = 25000;
const PORTS = new Set(["", "80", "443", "8080", "8443"]);
const APP = "Waypage (offline reader; https://github.com/danielnoam/waypage)";
const DEFAULT_ACCEPT = "text/html,application/xhtml+xml,*/*;q=0.8";

function allowed(origin) {
  return !!origin && ORIGINS.some((re) => re.test(origin));
}

// Private, loopback, link-local, shared and reserved IPv4 ranges.
function privateV4(host) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b, c] = m.slice(1).map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b < 128) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b < 32) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
}

// Why an address can't be fetched, or "" when it can. URL has already
// normalised odd IPv4 spellings (0x7f.1, 2130706433) to dotted ones.
export function refuse(url, self) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return "not http";
  if (url.username || url.password) return "credentials in address";
  if (!PORTS.has(url.port)) return "port";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host.includes(".") || host.startsWith("[")) return "private address";
  if (/(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|onion)$/.test(host)) return "private address";
  if (privateV4(host)) return "private address";
  if (self && host === self) return "loop";
  return "";
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "X-Final-Url, X-Proxy-Error",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Referrer-Policy": "no-referrer",
  };
}

function fail(status, reason, origin) {
  const headers = origin ? cors(origin) : { "Cache-Control": "no-store" };
  return new Response(reason, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "X-Proxy-Error": reason } });
}

// A header value from the query: one line, not too long.
const clean = (v, max) => (v && v.length <= max && !/[\r\n\0]/.test(v) ? v : "");

// The body, cut off (and the response errored) past MAX_BYTES.
function capped(body) {
  let seen = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      seen += chunk.byteLength;
      if (seen > MAX_BYTES) ctl.error(new Error("too big"));
      else ctl.enqueue(chunk);
    },
  }));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!allowed(origin)) return fail(403, "origin", "");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors(origin), "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" } });
    }
    if (request.method !== "GET") return fail(405, "method", origin);

    if (env && env.PER_IP) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.PER_IP.limit({ key: ip });
      if (!success) return fail(429, "rate limited", origin);
    }

    const self = new URL(request.url);
    let target;
    try { target = new URL(self.searchParams.get("url") || ""); } catch (e) { return fail(400, "bad address", origin); }

    const ua = clean(self.searchParams.get("ua"), 400) || [clean(request.headers.get("User-Agent"), 400), APP].filter(Boolean).join(" ");
    const headers = {
      "User-Agent": ua,
      "Accept": clean(self.searchParams.get("accept"), 200) || DEFAULT_ACCEPT,
    };
    const lang = clean(request.headers.get("Accept-Language"), 200);
    if (lang) headers["Accept-Language"] = lang;

    // Redirects are followed here, so every hop gets the same checks.
    let res;
    for (let hop = 0; ; hop++) {
      const why = refuse(target, self.hostname);
      if (why) return fail(403, why, origin);
      try {
        res = await fetch(target.href, { method: "GET", headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
      } catch (e) {
        return fail(502, e && e.name === "TimeoutError" ? "timed out" : "unreachable", origin);
      }
      const next = res.status >= 300 && res.status < 400 && res.headers.get("Location");
      if (!next) break;
      if (hop >= MAX_REDIRECTS) return fail(508, "too many redirects", origin);
      try { target = new URL(next, target); } catch (e) { return fail(502, "bad redirect", origin); }
      if (res.body) res.body.cancel().catch(() => {});
    }

    const length = Number(res.headers.get("Content-Length") || 0);
    if (length > MAX_BYTES) {
      if (res.body) res.body.cancel().catch(() => {});
      return fail(413, "too big", origin);
    }
    const out = { ...cors(origin), "X-Final-Url": target.href };
    const type = res.headers.get("Content-Type");
    if (type) out["Content-Type"] = type;
    return new Response(res.body ? capped(res.body) : null, { status: res.status, headers: out });
  },
};
