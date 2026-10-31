# Carry-on: proposal

> This is the original proposal, written when the app was Carry-on. For how the code is put together now, see [ARCHITECTURE.md](ARCHITECTURE.md).

2 October 2026. Copied from the proposal doc
(https://claude.ai/code/artifact/5c6cf847-cd85-4c91-a466-2da95fbde60b),
with the decisions taken since folded in.

Build it phone-first and serverless. Fetch pages and images on the device
with native HTTP, which is how LifeLog already escaped CORS in 0.215.0, and
keep a server optional for the desktop browser only. A server that scrapes
and stores pages for other people adds IP blocking, copyright exposure and
privacy duties that an on-device design avoids.

## What LifeLog taught

The CORS problem was already solved in LifeLog's native app without a
server. Since 0.215.0 its `src/platform.js` routes Steam, SteamGridDB and
GG.deals calls through CapacitorHttp, which is native networking and
ignores CORS. Only the browser build still needs its Cloudflare Worker.

| Area | LifeLog | Here |
| --- | --- | --- |
| Stack | Vanilla HTML/CSS/JS, no build, Capacitor 8, Actions build APK and unsigned IPA | Same, copied |
| CORS escape | `platform.js` routes a fake proxy host through CapacitorHttp | Generalised to any URL: `LifeLogPlatform` became `CarryOn.platform.fetchText` |
| Server | A Worker with 4 narrow routes, never an open proxy | The pattern for an optional worker |
| Media | Covers stored as remote URLs | Previews must be real files on disk |
| Files on disk | `Filesystem.downloadFile` for the APK update | Used for every image preview |
| Data | One JSON file synced to GitHub | Fine for the library index, wrong for images |

LifeLog's media fallback chains were limited by which APIs send CORS
headers, not by scraping. Scraping arbitrary pages is a harder problem
(lazy images, JavaScript-rendered pages, bot walls); CORS is the easy part.

## Why no server

| Concern | On-device fetch | Server-side scrape |
| --- | --- | --- |
| CORS | Not applicable | Not applicable |
| Bot walls (Cloudflare, news sites, Reddit) | Reader's own IP, looks like a phone | Datacenter IPs get challenged or blocked |
| Pages the reader is logged in to | Possible from the iOS share sheet | Impossible without their cookies |
| Copyright | The reader makes a private copy | You make and host the copies |
| Privacy | No URLs leave the phone | You see every URL; policy and store forms |
| Cost | Zero | Grows with users |
| JavaScript-rendered pages | Hidden WebView | Paid headless browser |
| Desktop browser | Blocked by CORS | Works |

A server earns its place only for a desktop or PWA version. Even there a
browser extension may be better, because it fetches with the reader's own
session.

## Architecture

1. **Capture.** Share sheet (Android intent, iOS share extension) or a
   pasted link. The iOS Safari share extension can also hand over the
   rendered page HTML through its JavaScript preprocessing file, which
   covers JavaScript-heavy and logged-in pages. Otherwise fetch with
   CapacitorHttp; if the result is an empty shell, load it in a hidden
   WebView and take the DOM once it settles.
2. **Site adapters first.** Wikipedia uses `/api/rest_v1/page/html/{title}`
   with a descriptive User-Agent. Everything else goes through Mozilla
   Readability (`src/vendor/Readability.js`, 0.6.0, Apache-2.0).
3. **Clean.** Strip scripts, iframes, forms, event handlers, tracking
   pixels. Resolve lazy images (`data-src`, `srcset`, `<picture>`) to one
   URL each.
4. **Localise.** For each image, download a preview about 480 px wide
   (Wikimedia thumbnails take a width in the URL) with
   `Filesystem.downloadFile` and keep the full image's URL. Video
   (YouTube, Vimeo, `<video>`, Commons) becomes a card: local thumbnail,
   kept link, plays only when online.
5. **Store and read.** One folder per page: `page.html`, `images/`,
   `meta.json` (URL, title, site, saved date, byline, licence line, size).
   The library index is a small JSON list. The reader shows `page.html` in
   a sandboxed iframe without scripts, styled by the reader CSS, with an
   "Original" link at the top.

- **Never render scraped HTML in the app's own document.** A script that
  survives cleaning could call Filesystem or Share. Sandbox without
  `allow-scripts`, strict CSP.
- **Sync later.** v1 is per device, with export and import of one
  self-contained HTML file per page. If sync comes, sync the index and
  re-fetch on the other device.
- **Optional worker** (web version only): one route, `POST /bundle {url}`,
  per-install token, rate limit, stores nothing, blocks private IP ranges
  and non-HTTP schemes, caps response size. Cloudflare's free plan caps CPU
  at 10 ms per request, so big pages need the $5/month plan.

## Storage and cost (approximate, not measured)

| Item | Size or price |
| --- | --- |
| Wikipedia article, text only | 50 to 300 KB |
| Image preview at 480 px | about 30 KB each |
| Full image at phone width | about 150 KB each |
| Illustrated article, previews and links | roughly 0.5 to 1.5 MB |
| Same article, full images | 1 to 5 MB |
| Cloudflare R2, if copies were ever hosted | about $0.015 per GB-month, 10 GB free |
| Cloudflare Workers paid plan | $5 per month |

Show each page's size and a total in settings so readers can prune.

## Legality (general reasoning, not legal advice)

- A private copy on the reader's device is the read-later model Pocket,
  Instapaper and GoodLinks have shipped for over a decade: low risk. Keep
  it private: no public share links, no cache shared across readers.
- A server that stores copies makes you the copier: DMCA agent, takedown
  process. Avoided by staying stateless.
- Wikipedia text is CC BY-SA 4.0: keep attribution and licence on every
  saved page. Commons images carry their own licences; keep credit lines.
- Paywalls: saving what the reader can already see is fine; never fetch
  around one (archive mirrors, Googlebot user agent, stripping overlays).
- robots.txt governs crawlers, and one fetch a person triggers is not a
  crawl. Still: no prefetching links, no bulk or scheduled refetching, an
  honest User-Agent, respect `429` and `Retry-After`.

## Store rules

| Rule | Meaning here |
| --- | --- |
| Apple 5.2.3 | No saving video from YouTube and the like. Thumbnail plus link is fine. |
| Apple 4.2 | An offline library with a share extension is real app functionality. |
| Apple 5.1 / Play Data safety | On-device only: "no data collected". |
| Play IP policy | No downloaders for copyrighted media; answer complaints. |
| iOS distribution | AltStore works for you only; others need the $99/year Apple Developer Program. |
| Android distribution | Play: one-time $25 and, for new personal accounts, a closed test first (check current tester numbers). Sideloaded APK still works for friends. |

## Open questions

- Does v1 need the desktop browser version? If not, there is no server.
- Pay the Apple programme now, or Android-first until it proves itself?
- Name checks: App Store, Play and a trademark search for "Carry-on".
