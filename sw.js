// Waypage service worker, for the web copy: makes it installable and
// usable offline. The app has none; its files are already on the phone.
//
// Stale-while-revalidate for this app's own files, as LifeLog's sw.js: a
// repeat launch paints from cache while a fresh copy is fetched for the next
// one, and the `?v=x.y.z` on every <script>/<link> in index.html makes a
// release's changed files new URLs. Third-party requests are never touched.
//
// ASSETS is also exactly what tools/build-www.js copies into the app.
const CACHE = "waypage-v111";
const ASSETS = [
  "./", "./index.html",
  "./src/fonts.css", "./src/styles.css", "./src/reader.css",
  "./src/platform.js", "./src/motion.js", "./src/store.js", "./src/save.js", "./src/feeds.js", "./src/backup.js", "./src/imports.js", "./src/dict.js", "./src/sync.js", "./src/drive.js", "./src/sync-worker.js", "./src/qr.js", "./src/stats.js", "./src/epub.js", "./src/files.js", "./src/pdf.js", "./src/pptx.js", "./src/reader.js", "./src/app.js", "./src/app-reading.js", "./src/app-cards.js", "./src/app-downloads.js", "./src/app-search.js", "./src/app-draw.js", "./src/app-jobs.js", "./src/app-reader.js", "./src/app-library.js", "./src/app-saving.js", "./src/app-places.js", "./src/app-settings.js", "./src/app-lock.js", "./src/app-start.js",
  "./src/vendor/Readability.js", "./src/vendor/pdf.min.mjs", "./src/vendor/pdf.worker.min.mjs", "./src/vendor/foliate-mobi.js",
  "./src/fonts/SourceSerif4.woff2", "./src/fonts/SourceSerif4-Italic.woff2", "./src/fonts/InstrumentSans.woff2",
  "./src/fonts/Literata.woff2", "./src/fonts/Literata-Italic.woff2", "./src/fonts/Lora.woff2", "./src/fonts/Lora-Italic.woff2", "./src/fonts/Merriweather.woff2", "./src/fonts/Merriweather-Italic.woff2", "./src/fonts/EBGaramond.woff2", "./src/fonts/EBGaramond-Italic.woff2", "./src/fonts/Inter.woff2", "./src/fonts/Inter-Italic.woff2", "./src/fonts/AtkinsonHyperlegible-400.woff2", "./src/fonts/AtkinsonHyperlegible-700.woff2", "./src/fonts/AtkinsonHyperlegible-Italic-400.woff2", "./src/fonts/AtkinsonHyperlegible-Italic-700.woff2", "./src/fonts/OpenDyslexic-Regular.woff2", "./src/fonts/OpenDyslexic-Bold.woff2", "./src/fonts/FrankRuhlLibre.woff2", "./src/fonts/DavidLibre-400.woff2", "./src/fonts/DavidLibre-700.woff2", "./src/fonts/Assistant.woff2", "./src/fonts/Heebo.woff2",
  "./manifest.json", "./icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./CHANGELOG.md",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith(PREVIEW)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// A test build in the browser (1.49.0). Settings › About › Test
// builds puts the picked build in the cache PREVIEW as preview.json
// ({ repo, sha, title, pr }); while it's there, every file of this copy
// comes from that commit on raw.githubusercontent.com, given its type
// (raw serves everything as text/plain), and kept in PREVIEW-<sha> for
// offline. Same origin, so the library is the one you have, as with a
// preview in the app. index.html gets a small "Back to the release" link
// (./?release), which works whatever the branch's own code is.
const PREVIEW = "waypage-preview";
const TYPES = {
  html: "text/html", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json",
  md: "text/markdown", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", webp: "image/webp", woff2: "font/woff2",
};
const previewState = () => caches.open(PREVIEW).then((c) => c.match("./preview.json")).then((r) => (r ? r.json() : null)).catch(() => null);
const leavePreview = () => caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREVIEW)).map((k) => caches.delete(k))));
const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
async function fromPreview(p, url, request) {
  const base = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(base)) return fetch(request);
  const rel = url.pathname.slice(base.length) || "index.html";
  const cache = await caches.open(PREVIEW + "-" + p.sha);
  let res = await cache.match("./" + rel);
  if (!res) {
    let got;
    try {
      got = await fetch("https://raw.githubusercontent.com/" + p.repo + "/" + p.sha + "/" + rel.split("/").map(encodeURIComponent).join("/"));
    } catch (e) {
      return new Response("Offline, and this test build's file isn't saved yet.", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
    if (!got.ok) return new Response("", { status: got.status });
    res = new Response(await got.arrayBuffer(), { headers: { "Content-Type": TYPES[rel.split(".").pop().toLowerCase()] || "application/octet-stream" } });
    await cache.put("./" + rel, res.clone());
  }
  if (rel !== "index.html") return res;
  const name = p.title || (p.pr ? "#" + p.pr : "preview");
  const bar = '<a href="./?release" style="position:fixed;z-index:2147483647;top:calc(env(safe-area-inset-top) + 6px);left:50%;transform:translateX(-50%);'
    + 'max-width:calc(100% - 32px);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:4px 12px;border-radius:999px;'
    + 'font:12px/1.4 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.72);text-decoration:none">Test build: ' + escHtml(name) + ' · Back to the release</a>';
  return new Response((await res.text()).replace(/<\/body>/i, bar + "</body>"), { headers: { "Content-Type": "text/html" } });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(previewState().then((p) => {
    if (p && e.request.mode === "navigate" && url.searchParams.has("release")) return leavePreview().then(() => Response.redirect(self.registration.scope, 302));
    return p && p.repo && p.sha ? fromPreview(p, url, e.request) : fromRelease(e);
  }));
});

function fromRelease(e) {
  return (
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fetching = fetch(e.request)
          .then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; })
          .catch(() => null);
        return cached || fetching.then((res) =>
          res || caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html")));
      })
    )
  );
}
