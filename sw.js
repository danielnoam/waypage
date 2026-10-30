// Waypage service worker, for the web copy: makes it installable and
// usable offline. The app has none; its files are already on the phone.
//
// Stale-while-revalidate for this app's own files, as LifeLog's sw.js: a
// repeat launch paints from cache while a fresh copy is fetched for the next
// one, and the `?v=x.y.z` on every <script>/<link> in index.html makes a
// release's changed files new URLs. Third-party requests are never touched.
//
// ASSETS is also exactly what tools/build-www.js copies into the app.
const CACHE = "waypage-v89";
const ASSETS = [
  "./", "./index.html",
  "./src/fonts.css", "./src/styles.css", "./src/reader.css",
  "./src/platform.js", "./src/motion.js", "./src/store.js", "./src/save.js", "./src/feeds.js", "./src/backup.js", "./src/imports.js", "./src/dict.js", "./src/sync.js", "./src/drive.js", "./src/sync-worker.js", "./src/qr.js", "./src/stats.js", "./src/epub.js", "./src/files.js", "./src/pdf.js", "./src/reader.js", "./src/app.js", "./src/app-reader.js", "./src/app-library.js", "./src/app-saving.js", "./src/app-places.js", "./src/app-settings.js", "./src/app-lock.js", "./src/app-start.js",
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  e.respondWith(
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
});
