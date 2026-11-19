// Waypage service worker, for the web copy: makes it installable and
// usable offline. The app has none; its files are already on the phone.
//
// Stale-while-revalidate for this app's own files, as LifeLog's sw.js: a
// repeat launch paints from cache while a fresh copy is fetched for the next
// one, and the `?v=x.y.z` on every <script>/<link> in index.html makes a
// release's changed files new URLs. Third-party requests are never touched.
//
// ASSETS is also exactly what tools/build-www.js copies into the app.
const CACHE = "waypage-v137";
const ASSETS = [
  "./", "./index.html",
  "./src/fonts.css", "./src/styles.css", "./src/reader.css",
  "./src/keel/errlog.js", "./src/keel/sw-preview.js", "./src/keel/releases.js", "./src/boot.js", "./src/keel/i18n.js", "./src/language.js", "./src/lang/he.js", "./src/keel/platform.js", "./src/platform.js", "./src/keel/motion.js", "./src/motion.js", "./src/store.js", "./src/save.js", "./src/feeds.js", "./src/discover-list.js", "./src/discover.js", "./src/backup.js", "./src/imports.js", "./src/dict.js", "./src/extensions.js", "./src/fsrs.js", "./src/sqlite.js", "./src/anki-import.js", "./src/anki.js", "./src/app-anki.js", "./src/opds.js", "./src/app-catalogs.js", "./src/webdav.js", "./src/app-webdav.js", "./src/calibre.js", "./src/app-calibre.js", "./src/abs.js", "./src/app-abs.js", "./src/sync.js", "./src/drive.js", "./src/sync-worker.js", "./src/keel/github.js", "./src/keel/drive.js", "./src/keel/qr.js", "./src/stats.js", "./src/activity.js", "./src/epub.js", "./src/files.js", "./src/zim.js", "./src/listen.js", "./src/pdf.js", "./src/pptx.js", "./src/reader.js", "./src/ink.js", "./src/notes.js", "./src/recover.js", "./src/app.js", "./src/app-reading.js", "./src/app-cards.js", "./src/app-downloads.js", "./src/app-search.js", "./src/app-draw.js", "./src/app-jobs.js", "./src/app-reader.js", "./src/app-ink.js", "./src/app-sheets.js", "./src/app-pentest.js", "./src/app-library.js", "./src/app-saving.js", "./src/app-places.js", "./src/app-discover.js", "./src/app-kiwix.js", "./src/app-settings.js", "./src/app-extensions.js", "./src/app-listen.js", "./src/app-lock.js", "./src/app-car.js", "./src/app-start.js",
  "./src/vendor/Readability.js", "./src/vendor/pdf.min.mjs", "./src/vendor/pdf.worker.min.mjs", "./src/vendor/foliate-mobi.js", "./src/vendor/fzstd.mjs",
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

// A test build in the browser (1.49.0): Settings › About › Test builds
// puts the picked build in the cache PREVIEW, and keel's sw-preview.js
// serves that commit's files while it's there, with a Back to the release
// bar on the page (./?release).
importScripts("src/keel/sw-preview.js");
const PREVIEW = "waypage-preview";
const preview = self.KeelPreview.create(PREVIEW);

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  e.respondWith(preview.respond(e, fromRelease));
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
