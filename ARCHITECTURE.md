# How Waypage works

The map of the code and the flows through it, for anyone changing it.
Keep it current: when a file is added, removed or renamed, or a flow
below changes, this file changes in the same commit (`test/docs.test.js`
fails when a source file isn't named here). The rules for changes are in
CONTRIBUTING.md; the original reasoning is in docs/PROPOSAL.md. Why a
line is the way it is lives in its commit and PR (`git log -S`,
`git blame`).

## Contents

- [The shape](#the-shape)
- [Layout](#layout)
- [Load order and the one scope](#load-order-and-the-one-scope)
- [Saving a link](#saving-a-link)
- [Where clips live](#where-clips-live)
- [Reading](#reading)
- [Files: EPUB, PDF, comics](#files-epub-pdf-comics)
- [Kiwix packs](#kiwix-packs)
- [Browser versus app](#browser-versus-app)
- [Sync and backups](#sync-and-backups)
- [Versions, cache and updates](#versions-cache-and-updates)
- [The phone apps](#the-phone-apps)
- [Tests and screenshots](#tests-and-screenshots)
- [Languages](#languages)
- [Trade-offs](#trade-offs)
- [Traps](#traps)
- [The docs](#the-docs)

## The shape

Plain HTML, CSS and JS, no build step, no runtime dependencies. The same
files are served as a static site (the web copy on GitHub Pages) and
bundled as-is into Android and iOS apps by Capacitor. There is no server:
every fetch happens on the device. The one exception is the web copy, which
fetches pages through a stateless proxy (`worker/`), since a browser can't
read most sites itself. Saved pages are untrusted and are only
ever shown inside a sandboxed iframe.

## Layout

```
index.html          app shell: the markup for every screen, and the script tags in load order
server.js           zero-dependency static server for local work (start.cmd on Windows)
sw.js               offline cache for the web copy; its ASSETS list is also what goes into the apps
manifest.json       the web copy as an installable app
privacy.html, terms.html   the pages Google's OAuth branding links to
src/boot.js         runs in <head>: puts the saved theme on <html> before the first frame
src/language.js     runs in <head>: picks English or Hebrew, sets lang and dir on <html>, loads the Hebrew words; gives every script t() and tn()
src/lang/he.js      the Hebrew for every English word the app shows, keyed by the English
src/app.js          APP_VERSION, the shared helpers (el, load, store, toast), theme and state
src/app-reading.js  text size, spacing, margins, alignment, fonts (bundled and added)
src/app-cards.js    clip cards, saving cards and runs, failed saves, update and archive a clip
src/app-downloads.js  the Downloads screen and the app-update card
src/app-search.js   search, filters, sort orders, the dropdown control
src/app-draw.js     section heads, a part opened alone, the flip, Continue reading, renderLibrary
src/app-jobs.js     links out of a paste or share, the URL index, savePage, saveAll, Wi-Fi wait, runJob
src/app-reader.js   moving between screens; the reader around the page: brightness, contents, Narrate, highlights, image viewer
src/app-ink.js      Draw: the pen button, the bar of tools, Try your pen, saving a copy with drawings
src/app-pentest.js  the pen test in Try your pen: asks for ten things in turn, records what the page and the phone report, makes a log
src/app-library.js  tags, collections, a clip's sheet, multi-select, export, import, watched folders
src/app-saving.js   sync screen, saving several, next links and new chapters, feeds, home-screen widgets
src/app-places.js   the Highlights place, the sidebar, big screens, keys, gestures, a feed's sheets
src/app-kiwix.js    Kiwix packs and books kept as files: the + sheet's downloads (where they're kept, Wi-Fi wait), a pack's articles in the reader (links, Back, Search this pack, Save this article), a book as a collection of clips
src/app-discover.js the Discover place: Wikipedia today, the list, its search, the Sites grid (stories, books, texts), the story and sign-up sheets
src/app-settings.js Settings (built from data; the search reads the built screens), Make room, Credits, Report a problem
src/app-listen.js   audiobooks: bringing one in, the player and its bar, reading along, transcripts written ahead, fixes, Find the book (each found book checked against the narrator), the narrator-left-the-book card, Settings › Audiobooks
src/app-extensions.js Settings › Extensions (a switch each) and the places extensions add to the sidebar, above Stats
src/app-lock.js     app lock: passcode (PBKDF2 hash), fingerprint or face on Android
src/app-car.js      Android Auto: the list the car starts from (books, clips cut for Narrate, collections with quick starts) and where the car got to
src/app-start.js    wiring at launch, what other apps share in, self-update, Test builds, What's new
src/save.js         link to saved page: fetch, Wikipedia adapter or Readability, allowlist cleaner, picture previews, video cards
src/reader.js       a saved page in the sandboxed iframe: place, find, highlights, translation, pages mode
src/store.js        one directory per clip and library.json; IndexedDB in a browser
src/platform.js     browser vs app: native fetch, plugins, downloads, speech, opening links
src/files.js        EPUB, Kindle (MOBI/AZW3), FB2, CBZ, Markdown, text and HTML files
src/listen.js       audiobooks' pure parts: chapters from M4B and MP3 tags, transcripts as paragraphs, fixes, heard words matched to a book's, how a minute fits a found book (`fit`), how long the narration has been away from the book (`lostFor`), transcripts merged across devices, EPUB Media Overlays
src/zim.js          Kiwix packs (.zim): the header, entries by path, the title index, clusters stored, xz (its own LZMA2 decoder) or Zstandard (src/vendor/fzstd.mjs); loaded by files.js the first time a pack is opened
src/pdf.js          PDFs through pdf.js in a locked-down frame
src/ink.js          drawing over a clip's blocks or a PDF's pages: strokes, layers, undo, what a copy of the PDF is given
src/app-sheets.js   Page view of a note: its sheets in one column, select, copy, paste, delete, share, save as, background
src/notes.js        notes: sheets of paper you draw on, opened through the PDF pages pipeline with a stand-in document; any clip laid out as a PDF to make one
src/recover.js      Settings › Report a problem › Recover: finds highlights and drawings an update left behind (scan) and puts them back (fix); no page code
src/pptx.js         PowerPoint decks redrawn on a canvas and written as a PDF (1.49.0)
src/epub.js         clips as an EPUB 3 book, for e-readers and Send to Kindle
src/feeds.js        RSS, Atom and JSON Feed, read into one shape; a GitHub repo link follows its releases
src/discover.js     Discover's sources: the hand-picked list, Wikipedia today, and the sites' lists and search (Royal Road, AO3, FanFiction.net, FictionPress, Scribble Hub, Wattpad, WEBTOON, Tapas, SpaceBattles, Sufficient Velocity; books from Project Gutenberg via Gutendex and Standard Ebooks; Wikisource; LibriVox's audiobooks via archive.org and LibriVox's API)
src/discover-list.js  the hand-picked list itself (strict JSON between markers, refreshed from GitHub)
src/sync.js         GitHub sync; src/sync-worker.js runs the merge off the main thread
src/drive.js        Google Drive backups
src/backup.js       one-file backups and exports
src/imports.js      Pocket, Instapaper, Omnivore, Raindrop, Wallabag exports, Kindle highlights
src/stats.js        reading stats and the reading pace
src/activity.js     Share reading activity: builds activity/reading.json (docs/reading-activity.md)
src/dict.js         StarDict dictionaries in IndexedDB
src/extensions.js   extensions: the catalogue, on or off per device, loading an extension's scripts once it is on
src/fsrs.js         the Anki extension's scheduler: FSRS-5 in plain JS; loaded only once Anki is on (as are anki.js and app-anki.js: not in index.html, but in sw.js's ASSETS)
src/sqlite.js       a read-only SQLite reader (table b-trees and overflow pages, UTF-8), loaded with the Anki extension, for opening an Anki deck
src/anki-import.js  reads an Anki deck (.apkg: a zip with a SQLite collection) into cards and reviews, and Anki's text export's counterpart lives in anki.js; loaded with the Anki extension
src/anki.js         the Anki extension's engine: decks, cards and a review log (anki/ beside the library, per-device log), each card's schedule replayed from the log
src/calibre.js      the Calibre extension's library folder: picked once (the Files plugin, or a browser's folder picker kept in IndexedDB), metadata.db read with sqlite.js into books, a book's best file and its cover read from the folder by path
src/app-calibre.js  the Calibre extension's place: the books as covers with search, sort and tag, a book's sheet (Read it from the folder, or Copy into your Library), Settings › Extensions › Calibre
src/opds.js         the Catalogs extension's catalogs: the list on this device, OPDS 1 (Atom) and 2 (JSON) feeds read into folders and books, search, a book's file with the catalog's login
src/app-catalogs.js the Catalogs extension's screens: the Catalogs place in the sidebar (folders, books, search), the Add a catalog sheet, Settings › Extensions › Catalogs
src/webdav.js       the WebDAV extension's servers: the list on this device, a PROPFIND answer read into folders and books, a book's picture found beside it, a file with the server's login
src/app-webdav.js   the WebDAV extension's screens: the WebDAV place in the sidebar (folders, books as covers, find in folder), a book's sheet (Add to your Library), the Add a server sheet, Settings › Extensions › WebDAV
src/abs.js          the Audiobookshelf extension's servers: the list on this device with its tokens, signing in and renewing, libraries, books, search, play sessions and your place on the server
src/app-abs.js      the Audiobookshelf extension's screens: its place in the sidebar (continue listening, books, search), a book's sheet (Play adds a streaming audiobook), the sign-in sheet, Settings › Extensions › Audiobookshelf; streams for app-listen.js through REMOTE_AUDIO
src/app-anki.js     the Anki extension's screens: the selection bar's button and card sheet, the place (decks, study, browse, edit, options)
src/motion.js       Waypage's springs from DESIGN.md, given to keel's motion engine (src/keel/motion.js)
src/keel/qr.js      QR code for sync's setup link, made on the device so the token never leaves it (from keel, below)
src/keel/github.js  the GitHub requests sync.js makes: reading, writing and committing files, errors with a kind (from keel, below)
src/keel/errlog.js  the errors this device hit, for Report a problem; loaded first, set up by its tag in index.html (from keel, below)
src/keel/platform.js  where it runs (phone, browser), app-build.json, links out to the phone's browser (from keel, below); src/platform.js builds on it
src/keel/releases.js  the app's releases on GitHub: the update check, the Test builds list, opening one in the browser (from keel, below)
src/keel/update.js    the APK download and Android's installer behind platform.js's downloadUpdate (from keel, below)
src/keel/motion.js  the motion engine: springs sampled into CSS linear(), every move, reduced motion and Animations off (from keel, below); src/motion.js gives it Waypage's springs
src/keel/sw-preview.js  sw.js's half of a test build in the browser (from keel, below)
src/keel/i18n.js    translations: t() and tn() with plurals, dir, dates and numbers in the chosen language (from keel, below)
src/keel/drive.js   Google Drive sign-in, folder, resumable sending and keeping the newest; drive.js says what a backup is (from keel, below)
src/styles.css      tokens, themes, layout (DESIGN.md)
src/reader.css      the saved page inside the reader's frame
src/fonts.css       the bundled fonts (src/fonts/)
src/vendor/         Readability, pdf.js, foliate-js's MOBI reader, fzstd (Zstandard, for Kiwix packs), each with its licence
assets/             icon and splash sources for the apps
icons/, icon.svg    app icons
worker/             the web copy's fetch proxy, a Cloudflare Worker (worker.js, wrangler.toml, README.md has the setup)
native/share/       the Capacitor plugin package (Android Java, iOS Swift): share target, Files, Speech, Downloads, Feeds, Widgets, SignIn, Translate, Drive, VolumeKeys, Pen, Brightness, AppLock, Kokoro (voices for Narrate, with the com/k2fsa/sherpa/onnx mirror of sherpa-onnx's JNI classes; on iOS KokoroVoice plays them for SpeechPlugin, and ios/Sherpa/bz2 is libbz2's module map for unpacking), Look (the theme's colour on the window and WebView at the next start), Audiobook (AudiobookService plays with the screen off, AVPlayer on iOS; Listen writes transcripts with sherpa-onnx's offline recognizer; Voicing speaks text into an audiobook, Voicing.swift on iOS), Car (Android Auto: CarService, Car's one shared media session), Dav (a WebDAV PROPFIND written over a socket, for Files' davList), PageRender, FileSave, Print, Connection, and the iOS share extension and widgets
tools/build-www.js  copies sw.js's ASSETS into www/ for the apps, writes app-build.json
tools/android-manifest.js, tools/android-version.js, tools/ios-project.js, tools/ios-extensions.rb   patch the generated native projects
tools/release.js    bumps the three version places and dates CHANGELOG.md's Unreleased entry
tools/keel-sync.js  brings the files shared with LifeLog up to a keel release (below)
tools/keel-checks.js  contrast and CSP checks the tests use (from keel, below)
tools/unreleased.js  the unreleased channel's files: a note beside main's APK, then the Pages deploy puts the newest under unreleased/ (from keel)
tools/sign-apk.sh   signs the APK with the release key in CI
tools/sherpa-lib.sh   fetches sherpa-onnx's arm64 library (Kokoro voices) into the Android build, pinned and checked
tools/sherpa-ios.sh   fetches sherpa-onnx's and onnxruntime's iOS xcframeworks (Kokoro and Piper voices) into the iOS build, pinned and checked, with the module map Swift needs
tools/test-build.sh        puts a labelled pull request's build on its test-<branch> pre-release
tools/packs/build-lang.js  builds Anki's language packs (a StarDict .tar.gz) from Wiktextract data; not shipped, and prints the SHA-256 the catalogue pins
tools/shots.js      retakes the README's screenshots (tools/shots/demo is the demo library)
tools/icons.js      renders icons/ and assets/ (icons, light splash) from icon.svg
tools/check-discover.js  checks every feed, sign-up and serial in Discover's list still answers (weekly, discover-check.yml)
test/               node test/run-all.js runs every *.test.js
keel.config.json, keel.lock.json  the files shared with LifeLog through keel (see Versions, cache and updates)
design/             the design canvas's artboards, for the exact markup
docs/PROPOSAL.md    the original architecture, storage, legal and store reasoning
docs/shots/         the README's screenshots
.github/workflows/  test.yml (every PR), pages.yml (the web copy after the tests, with unreleased/), android.yml and ios.yml (builds, releases, test builds), test-builds.yml (test labels: build on, remove off), worker.yml (deploys worker/ to Cloudflare), discover-check.yml (Discover's list, weekly), auto-merge.yml (turns on auto-merge for Daniel's PRs)
```

## Load order and the one scope

`index.html` loads every script as a classic `<script>`, in the order
listed there: platform, motion (keel's, then Waypage's), Readability, store, save, feeds, backup,
imports, dict, sync, drive, qr, stats, activity, epub, files, pdf, reader, then the
shell (`app.js` and the `app-*.js` files). No modules, no bundler.

The area scripts (`save.js`, `reader.js`, `store.js`, ...) are IIFEs that
put one object on `window.Waypage` (`C.save`, `C.reader`, `C.store`,
`C.platform`, ...). The shell files are not IIFEs: they share **one
global scope**, as if they were one file. The rule that keeps it working:
code that runs at load may only use what an earlier file, or the same
one, declared; functions can call into any file, since nothing is tapped
before all of them have loaded. Two shell files must never declare the
same top-level name: the later one silently replaces the earlier for
every caller (1.49.0 broke the Narrate switches that way), and
`build.test.js` fails when they do. `app-start.js` is last and starts things
up. A new shell file goes in the order in `index.html` and in `sw.js`'s
`ASSETS`.

## Saving a link

`app-jobs.js` turns a paste or share into jobs; `save.js` does the work.

1. **Fetch** on the device: `CapacitorHttp` in the apps (CORS doesn't
   apply), plain `fetch` in a browser. A page that comes back as an empty
   shell is drawn in a hidden WebView (`PageRender` plugin) and its DOM
   taken once it settles. Signed-in sites are saved through the `SignIn`
   plugin's WebView. When a page is gone, the Internet Archive's copy.
2. **Pick the article**: Wikipedia through `/api/rest_v1/page/html/{title}`
   with a User-Agent naming the app; a site in `save.js`'s `SITES` list by
   its own rule (fiction and comics sites; Reddit from the post's `.json`;
   Hacker News from the page; Stack Exchange, Lobsters, Bluesky and
   Mastodon (any server, by the address's shape) from their APIs, as are
   Lemmy (/post/123) and Substack (/p/slug, on its own domain too) by
   the address's shape, and LessWrong and the EA Forum (GraphQL); a
   Discourse forum, known by its page's generator tag, from the topic's
   .json; GitHub issues and pull requests from the API, code files from
   their raw copy, a repo as its README; an arXiv paper from its HTML
   version; SpaceBattles and Sufficient Velocity by their threadmarks, a
   chapter saved as its post, /posts/123/; a Wikisource work by its
   subpages); a link to an EPUB, PDF or CBZ file is downloaded
   (`C.platform.fetchBytes`) and added like a file brought in;
   everything else through Mozilla Readability. A
   discussion keeps its `co-thread`/`co-comment` classes for reader.css.
3. **Clean** to an allowlist of tags and attributes: no scripts, iframes,
   forms, handlers or tracking pixels. Lazy images resolve to one URL.
4. **Pictures** become a local preview (about 480 px wide) plus the full
   image's link, or full pictures (capped at 1600 px, WebP), or links
   only, per clip or in Settings. Videos become a thumbnail and a link.
5. **Store** (below) and draw the card. Saves run in the background with
   a queue, Wi-Fi gating, retries, and a Downloads screen for what failed.

**Website sync** (a collection's linked page, `findChapters` in save.js)
reads a site's rule when it has one, else any contents page: links
grouped by their box and again by their shape (their nearest ancestors'
tags and classes, inline tags skipped), the group with the most numbered
links winning, then grown to the whole block around it while what it
adds is mostly numbered too (books or arcs marked up each their own
way); a list over pages followed by its Next link (40 pages at
most); a chapter's own link led on to its "Table of contents" link; and
a list of named, unnumbered chapters taken when six or more links of one
shape share the site's first folder.
The same read gives the page's own tags (`pageTags`: a site rule's
`tags`, else `article:tag` meta, ten at most) as `siteTags`; Save with
options offers them as one switch, off until turned on, remembered in
`waypage.saveSiteTags`.
A collection marked "Tag new clips" (`folderTagNew` on its clips, like
`folderFav`; synced) gives a clip joining it the tags all its clips
share (`joinTags`, run from `joinFav` and on every new save into it).
A series (2026-11) is a collection whose clips carry `folderSeries`, and
`folderIn` naming the collection it sits in (one level: a series holds
only clips and files, a collection never sits in another). Nothing else
changes, so an app or device without series shows a plain collection and
no clip moves. `seriesInfo` reads the marks once per task; one clip still
marked is enough, and `healSeries` puts them back on the rest.

## Where clips live

`store.js`. One directory per clip, `pages/<id>/` with `page.html`,
`meta.json` (URL, title, site, dates, licence line, reading place, tags,
collection, size) and `images/`, plus `library.json` listing every
clip's meta. In the apps that is the app's own storage (default),
`Documents/Waypage`, or a folder the person picked (reached through the
`Files` plugin); in a browser it is IndexedDB, with pictures inlined as
data: URLs. Every read and write goes through one backend object, so the
rest of the app doesn't know which.

A clip has any number of tags and is in at most one collection; a
collection is an ordered set named on its clips (`folder`, `folderAt`),
with no separate collections file.

## Reading

`reader.js` puts `page.html` in an iframe sandboxed **without
`allow-scripts`**, under a strict CSP, styled by `reader.css` with the
tokens from `app-reading.js`. The app's document never contains saved
HTML: a script there could reach the Capacitor plugins. Everything the
reader does to the page (reading place, find, highlights, translation,
Pages mode, Narrate's sentence tracking) is done from the app's document
on the frame's DOM. The reading place is the paragraph on the middle
line, with its own timestamp so sync can merge it.

The reading look (`readingPrefs(p)` in `app-reading.js`) is Settings'
defaults, then the clip's collection's own, then the clip's own, for
the text settings, margins and Scroll or Pages only. The own ones are
in `waypage.readingFor` on this device (not synced or backed up); a
collection's follow a rename, and ones for clips or collections that
are gone are dropped at start. Settings' copy of the controls always
sets the defaults; the Aa sheet's sets wherever the open clip's come
from.

## Files: EPUB, PDF, comics

`files.js` opens a person's own files: EPUB, MOBI/AZW3 (foliate-js),
FB2, CBZ, Markdown, text and HTML, either copied in as a normal clip or
read from where they are (shown under Files, not synced). PDFs go through
`pdf.js` in its own iframe with `allow-scripts` but no access to the app
(`src/pdf.js` is the bridge, `src/vendor/pdf.min.mjs` and its worker the library); large
linked PDFs are read in ranges. It also writes comics back out
(`exportComic`): a comic clip or a collection of them as one CBZ, pages
numbered 0001… and a ComicInfo.xml (title, series, number, manga
direction) that `fromCbz` reads back. CBR isn't offered: RAR can't be
written freely.

A linked PDF's printed pages can be highlighted (1.56.0). As a page is
drawn, `files.js` asks the sandbox for its words where they sit
(`pdf.text(n)`, plain strings and fractions of the page) and
`reader.js textLayer` lays them over the picture in see-through type, so
the reader's own selection and Highlight bar work on them. A highlight
made there is kept in the clip's `marks` by page, not by text block:
`{ id, page, start, endPage, end, rects, text }`, start and end in the
page's words, `rects` boxes on the page as fractions of it, painted again
at any zoom or width. Show as text finds it by its words (`locate`'s
fallback); one made in Show as text is found on the printed pages the
same way (`findRects`, and `files.findPage` for Go to it). Comics and
scans have no words, so the reader hides Highlights for them.

A highlight can carry `tags` (2026-11): its own list, never the clips' tags
(`allMarkTags` in app-library.js, `markTagsEditor` in app-reader.js). A tag
edit sets the mark's `at`, so sync takes the later edit like a note;
`backup.cleanMarks` keeps up to 20 clean tags and `marksBody` writes them
as `#tags`. The Highlights place filters by several at once (`marksTags`): any of them by default, or all, or none (`marksHow`, kept in `waypage.marksMatch`), picked from the filter button at the end of the tag row.

Anything can be drawn on (2026-11). Drawing is part of Highlights: Draw in
the Highlights sheet and on the selection bar (`app-ink.js inkStart`), and
the reader bar's pen only on notes. `ink.load` picks one of two modes.
Pages mode (a note's sheets, an outside PDF's printed pages) is described
below. Blocks mode (everything else) numbers a clip's paragraphs and
pictures as highlights do (`reader.js inkBlock`, block n = the reader's
anchors[n-1]) and gives each block a layer that reaches halfway to its
neighbours (`inkBlockBox`), inside `.co-inkroot`; strokes are in the
block's width, so they follow it through text size and layout. A watch
(`watchBlocks`) places the layers for the blocks near the view. Strokes by
block live on the index entry as `ink` (`ink.blockStore`), so they sync
(`sync.mergeInk`, three ways by stroke id and block) and back up
(`backup.cleanInk`, pictures left out) like `marks`. An outside PDF's
printed pages keep `ink.json` and a summary on the entry, `drawn: [[page,
strokes]]`, for Highlights to list. Highlights and drawings on a file read
from outside go in library.json's `outside` map, keyed by the file's
fingerprint (`files.fingerprint`: size and first and last 256 KB, SHA-256),
merged three ways (`sync.mergeOutside`) and applied to every file here
with that fingerprint (`app-saving.js outsideTake`). A note's `ink.json`
merges with GitHub's against `ink-base.json` (`sync.noteInkMerged`), what
sync last left on both.

In pages mode `ink.js` gives each page that has a picture a layer of SVG over it
(`.co-ink`, a sibling of the picture like the words' layer, placed by
`placeText` with the same `pageBox`), and `app-ink.js` is the button, the
bar of tools and the sheet. A stroke is `{ id, t: "p"|"h", c, w, p, y? }` (`y` is how a pen wrote: "marker",
"fountain" or "brush"; none is a ballpoint, so strokes from before styles
look as they did):
colour by name (reader.css paints it, and re-paints it for Dark PDF
pages), width and points as fractions of the page's width (`p` is x, y,
pressure triples, y too in widths, so a page whose size was guessed and
then fixed keeps its strokes), so it paints again at any zoom or layout.
Only a pen draws on a touch screen (`pointerType`, with a stylus's touch
taken so it doesn't scroll); the Finger switch lets a finger or mouse
draw, and a computer starts with it on. The eraser takes whole strokes,
also with the pen's eraser end or button. They are kept in `ink.json`
beside the clip (`store.readInk`, `writeInk`), this device's own like the
file; the PDF itself is never written to. "Save a copy with drawings"
has pdf.js write the strokes as `/Ink` annotations (`pdf.js inkOf`, the
sandbox's `ink` job, `saveDocument` on the open document): the pen's
pressure becomes one even width (the style's average, `ink.js exportWidth`), the
highlighter 40% opacity. The pen has five sizes (`SIZES`) and four styles
(`penPath`'s radius rules: ballpoint wider with pressure, marker one width,
fountain pen thin along a 45° nib and thick across it, brush a strong
response with tapered ends); a saved size from the three-step bar maps 0, 1, 2
to 0, 2, 4 on the five (`waypage.ink` has `v: 2` from then on).

Draw on in Pages is locked to the screen shown (`reader.js lock`,
`lockedPages()`; ink.js `lockOf()`). A touch that draws never turns or
drags the page (`pagedInput` checks `e.defaultPrevented` and
`inkHook.drawing()`), and a scroll the frame didn't ask for is put back.
Strokes, the eraser, drops and Paste stay on the locked page(s) (a stroke's
points stop at its edges). A pinch zooms the row in place instead of
opening the viewer (`pz`, a transform about the locked page's middle,
`applyPz`, clamped so the page's edges never leave the screen's, the other
pages hidden by `co-zoomed`); `drawNear` draws larger by `pageZoom()`. Only
a turn changes the lock: two fingers swept sideways (zoomed, past the
page's edge), or a selection dragged to a side and held a quarter of a second
(`ink.js edgeWatch`, `carry`), which turns and brings the items onto the
new page. In Scroll the same drag held at the top or bottom edge scrolls
the page with it, its speed easing in and out. Straight lines and clean circles (`ink.js holdArm`, `snapShape`, `lineTo`): a pen or highlighter stroke held still 500 ms (the pointer within 6 px) is checked against a line (every point within 8% of its length) and an ellipse (closed, within 25% of the bounds' ring); a line's end then follows the pen, a circle moves with the pen (`moveRound`). The switch is `shapes`, kept in `waypage.ink` and set from the reader settings' Draw tab (`app-reader.js drawPart`, shown for a note and for anything drawn on). The zoom's origin is the locked page's middle (set when a gesture starts, cleared only by `resetPz`), so the spot under the fingers stays under them. A pen, or a palm beside it, is not a pinch
(`inkHook.penDown`).

Select, a picture and colours of your own (1.57.0), all in `ink.js` and
`app-ink.js`. Select is a fourth tool: a loop (`inside`, even-odd) takes the
strokes with half their points in it and the pictures whose middle is in
it, a tap takes the top thing under it, and a selection is `{ n, ids }` on
one page, drawn as a dashed box (`.sel`, with a corner handle `.hnd` for a
lone picture). Cut, Copy and Paste are in the bar's second row (Select
shows them in place of colours), Paste goes to the page most in view
(`viewPage`), and the clipboard is in memory only, this session. Moving
and resizing push a `set` op (the items before and after) and cut, paste,
delete and add push a `many` op (`del` and `add` lists), next to the
older `add` and `del`. A picture is a stroke-list item, `{ id, t: "i", f, x,
y, w, h }` in page widths, drawn as an SVG `<image>`; its bytes are a data:
URL in `ink/<f>.txt` beside `ink.json` (`store.writeInkImage`, in IndexedDB
`<id>:inkimg:<f>` in a browser), read back by `load` and removed when no
stroke names it (`flush`) or the clip is deleted. A copy of the PDF gets
each as a stamp annotation (`pdf.js inkOf`). A stroke's colour `c` is a
name or `#rrggbb`; a name keeps its CSS class (and Dark PDF repaint), a hex
is drawn with an attribute and, on Dark PDF pages, inverted with its hue
kept (`.custom`). The bar's colours are slots (`inkSlots`, kept in
`waypage.ink` as `slots`): a long press, right click or Shift+Enter opens
the colour sheet for one; its eyedropper (`ink.pick`, `colorAt`) takes the
colour of the stroke tapped, else the pixel of the page's picture there.

A comment bubble (2026-11, `ink.js` `t: "n"`) is a third box item beside text
and pictures: `{ id, t: "n", c, x, y, w, h, text, tags? }`, `w` and `h` one fixed
size in page widths (`NOTE_W`), `c` one of the five highlight colours, up to 20
tags. Draw's Add › Note drops one on the page in view (`addNote`) and opens its
sheet (`app-ink.js inkNoteSheet`, laid out like a highlight's: colours, comment,
tags); `editNote` and `removeNote` are undo steps. It works in both modes, so a
clip's bubbles ride `ink` by block through sync and backup unchanged (`mergeInk`
is by id). Tapping a bubble opens its sheet with Draw off (`onNote`, a click on the
`.note` node, which keeps `pointer-events` on in reader.css); with Draw on, Select
takes it and the bar's Edit note opens it. Its colours are the highlights' (`MARK_COLORS`)
and its tags are the highlights' list: `allMarkTags` counts a bubble's tags, and the
sheet uses `markTagsEditor` with a `put` in place of saving a highlight. A bubble is
not a drawing: `count`, `drawn`, `clearPage`, `clearAll`, `inkGroups` and a row's
remove leave it out, and Highlights lists it as what it says (`app-ink.js inkNotes`,
`noteRow`): in the clip's sheet and the Highlights place, among the highlights in
the clip's order, through the same colour, tag and word filters, and in Copy all
as `> 💬 comment #tags`. By block it is read from `ink` on the entry; a note's or
outside PDF's are summed up on the entry as `noted` (`[{ id, n, text, c, tags }]`,
this device's own like `drawn`, written by `onSaved` and `outsideDrawn`), so a
file's bubbles show and count their tags without it being opened; on another
device a note's show once it has been opened there. Moving: with Select, any
pointer on a bubble takes it and drags it in the same press (`down`); otherwise a
press held still for 450 ms (`notePress`, `carry`) picks it up and drags it, Draw
on or off, and a quick tap opens it (on the click that follows, as opening on
`pointerup` put the sheet under the finger and the click closed it). Chrome ignores `touch-action` on SVG shapes, so a
finger on a bare bubble starts a pan and the browser sends `pointercancel`, which
puts a dragged item back: its touch area is an HTML `div.note-hit` (`touch-action:
none`) in a `foreignObject`, the one thing it honours, and the reader's swipes,
page turns and brightness skip touches that start on one (`reader.js onBubble`);
tests for it must use real touch (CDP `Input.dispatchTouchEvent`), not events fired
at the node. A carry is `cur` with
`select`, `carry` and `mode: "drag"`, so `selMove`, `selUp`, `selDrop` and undo
are Select's own; after it the selection is cleared when Draw is off, and the
reader's tap is held back (`click`, `noteAt`). Left out for now: a copy of the
PDF and Save as PDF (`pdf.js inkOf` has no sticky-note editor in pdf.js's
annotation storage; `forPdf` and `notes.js sheetCanvas` skip it).

The pages are one surface (1.57.0). A stroke or picture that reaches over
more than one page is kept on each page it touches, whole, in that page's
own widths, with the same `id` (`ink.js placeOn`, `convertItem`; each layer
clips what lies past its edge). So an id is one thing: the eraser, Select,
Cut, Delete and Undo take every copy of it, and a copy on another page is
found by id (`copiesOf`). While a stroke is drawn or an item dragged, its
layer has `data-lift` (reader.css: not clipped, above the other layers) so
it shows over the next page. When it ends, or the drag lets go, `placeOn`
gives each page its copy; an item with less than a quarter of it on any
page goes into the nearest page and is shifted inside (`clampInto`), so a
drop can't leave something where it can't be seen. Anything an earlier
build left wholly off its page's edge is brought back inside when the
layer is placed (`rescue`). A drop, a stroke over two pages, a paste and
Move to top / Move to bottom (the last array item is the front;
`reorder`) are one `pages` op: whole lists of every page touched, before
and after. A dragged item always ends at the front of its page. Pages
with no layer yet (not near the screen) get no copy, and in Pages layout
(one page a screen) only a side-by-side spread has a neighbour to drop on.
There's no scrolling while dragging near the screen's edge.

Margins (2026-11): a layer reaches past its text column or page, to the
screen's edge or halfway to a layer beside it (`fitPads`; Pages counts the
screen the layer is on). A see-through `rect.pad` gives a stroke somewhere
to start there, and the layer is cut at its margins by an inline
`clip-path` instead of `overflow: hidden`. Strokes stay in the layer's own
widths, so one in a margin has x below 0 or past 1 and keeps beside its
paragraph or page; `placeOn` and `clampInto` take a page's reach (`l`, `r`
in `pagesOf`), and `rescue` only brings back what is past any margin (x
under -1 or over 2), so a margin narrower than the one it was written in
cuts the stroke and never moves it. A copy of the PDF and a note's Save as
PDF have only the page: what is in the margins is left out.

A note (2.0.0, `notes.js`) is a library item with `note: { paper, from? }`
and no file: a stack of sheets, in `note.json` (`store.readNote`,
`writeNote`), `{ bg: "paper" }` or `{ bg: "pdf", n }`, with its strokes in
`ink.json` as before. It opens through `fillPdf` with a stand-in for the
pdf.js document (`notes.js handle`: `draw(n, width)` paints the paper on a
canvas, or draws the page from the note's PDF), so drawing, the layers and
undo are the PDF's own. A stroke on the last sheet adds a sheet of paper
(`ink.onStroke`, `files.addSheet`). A note shows as Scroll or Pages (`noteLook().layout`, `pagesOn`; Pages turns sheets like a comic),
has its own margins and Dark note (`waypage.noteLook`, `app-reading.js`),
and only a note is `drawable`; a linked PDF is `convertible`: its pen asks
for a note, and `notes.fromPdf` keeps a copy of the PDF beside the note
(`base.pdf`, `store.writeNoteBase`; a browser keeps a Blob in the database,
at most 100 MB), one sheet to a page; the PDF's own drawings stay on the PDF.
Recover (`recover.js`, Settings › Report a problem) looks for what an update
left behind: `scan` reads every clip and finds highlights `reader.locateIn`
can no longer place (a last, words-only try across blocks is in `locate`
too), drawings by block past the end of the clip, a linked PDF shown as text
that has drawings, a PDF's `drawn` summary out of step with `ink.json`, and a
note with fewer sheets than it is drawn on or a PDF that is gone. `fix` puts
back what has one safe place and stamps a moved highlight `at` now so sync
keeps it. It runs only when tapped, never when Settings is built.
Recover also looks for notes gone from the library (`findDeleted`, `bringBack`):
the folders of GitHub's `notes/` (`sync.noteFolders`, `noteListing`, `noteTitle`)
and a phone's `pages/<id>` or a browser's `<id>:note` keys that no entry
names (`store.orphanNotes`, `orphanFiles`). A note comes back as a new one
(`notes.bring`, a new id), never under its old id, which may carry a deletion
marker in sync; the old copy is left alone.
Opening a PDF asks Keep a copy, Read from where it is or Make a note too
(`noteFromFile`, `fileSheet`), in a browser as well; the library's Show has
All notes (`filter "notes"`) while a note exists.
A note holds 500 sheets (`MAX_SHEETS`). For a longer book `notes.plan`
first measures it without drawing (`layout(..., dry)`: the same setting of
lines on a small canvas, pictures counted by their width and height
attributes or as half a page) and gives its chapters (`units`: the contents'
`data-toc` marks, else h1 to h3, else runs of about 50 pages) with the pages
each comes to; `askParts` (`notePartsSheet`) picks From and To and the note
is set from that part only (`range`). A longer PDF picks runs of 50 of its
pages (`pdfPart`): the copy is still the whole PDF, its sheets name only
the pages picked.
Typed text is an item in `ink.json` like a picture, `{ id, t: "x", c, x, y,
w, h, z, text }` (`z` the size in page widths, `ink.js addText`, `editText`),
so Select, move, cut, paste, delete and undo take it with no more code. Save
as PDF (`notes.toPdf`) draws each sheet, its strokes, pictures and text into
a JPEG and writes them with `pptx.js writePdf`, the text also as its
invisible words. A clip or note is renamed from the reader's bar (`app-reader.js`:
`paintReaderName`, `renameInReader`, `renameClip`): the index and the saved
page's heading change, and `rewriteClip` stamps `editedAt` so sync sends the
name with the clip. Notes sync and go to Drive as PDFs (see Sync and backups).

A comic in Pages (reader.js `picsLayout`) is a flex row of its pages, each
sized in px to a screen or half of one, so the text's own turning
(`goPage`, `pages()`, the swipe, keys and thirds) works unchanged; a manga
is `dir="rtl"` on the body. Comics have their own Show as (`comicLayout`)
and a clip's `turn` overrides the ComicInfo `manga` flag. A file naming its
series gets `series` and `volume`, and `fileSeries` (app-library.js) puts it
into that collection in volume order.

## Kiwix packs

A Kiwix pack (2026-11) is a whole site in one `.zim` file: Wikipedia,
Wiktionary, Stack Exchange. Discover › Sites › Kiwix lists Kiwix's own
catalog (library.kiwix.org, OPDS), by topic and language with sizes
(`discover.js parseKiwix`). Its + opens the same sheet as a book's
(`app-discover.js dzAddSheet`): where to keep the file (inside Waypage,
Downloads, Documents/Waypage or a picked folder) and, for a big one, Wait
for Wi-Fi. `platform.keepFile` downloads it natively into the cache with
the Downloads plugin (resumable, one at a time) and moves it there; its
`file://` address (or the folder's document) is the lasting ref, read
with `files.blob` like any outside file. A browser can't keep one: the
browser downloads it and Add a file brings it in.

A pack is a clip read from where it is (`file.kind` "zim", `zim: { at,
main, wiki, ours }`), never copied, synced or backed up. `files.js
openZim` reads `zim.at` through `zim.js` and gives the reader the article
rebuilt by save.js's allowlist (`rebuild`), its links as addresses under
`zim.ORIGIN` and its pictures as `data-in="zim:<path>"` slots, filled as
they come near like an EPUB's. A tap on such a link (`app-kiwix.js
packGo`) shows that article and pushes a history entry with `pack`, so
Back goes back through the articles; `route` turns a `pack` it lands on
into that article. Find becomes Search this pack (titles, from the title
index), and Save this article makes an ordinary clip of it with its
pictures and, for Wikipedia, its address and licence line. Highlights are
off on a pack: they'd land on whichever article is open. Removing a pack
Waypage downloaded into its own places deletes the file.

## Browser versus app

`platform.js` is the only file that asks where it runs. It exposes the
native plugins (`C.platform.plugin("Name")`), native fetch and downloads,
speech, opening links outside, and the connection state; in a browser
each has its nearest equivalent or returns null, and features check for
null rather than for a platform. The native plugins live in
`native/share/` and are built into the apps by the workflows; nothing in
`src/` imports them.

In a browser, `fetchText` sends other sites' pages through the fetch proxy in
`worker/` (`PROXY_URL` in `platform.js`; empty means straight `fetch`,
which CORS blocks for most sites). It answers only the web copy's origin,
GET only, public addresses only, and stores nothing; `canReadPages` says
whether a copy can read pages at all, `canFetchPages` whether it can do
everything natively (posting forms, downloading pictures). Pictures in the
web copy stay links, as before.

## Sync and backups

- **GitHub sync** (`sync.js`): the library kept level with a private
  `waypage-data` repo, with a token scoped to that repo. The merge runs in
  `sync-worker.js`, off the main thread. Reading places merge by their
  own time, so the newest place wins across devices. On mobile data it
  can sync only places. Every library write is a commit, so **Sync history**
  (`history`, `target`, `revertPlan`) lists library.json's commits and puts
  an old one back. That is done as edits made here, then an ordinary sync
  (not by writing the old file): the merge, tombstones and other devices
  then treat it like any change. A clip that comes back carries `back`, a
  clip whose text goes back gets a new `editedAt`, a feed followed again a
  new `addedAt`; places and reading stay (`synchistory.test.js`). A version's
  fold-out is a dry run of the same `revertPlan` (`revertChanges` says what
  each clip would change; a changed note's sheets and strokes are read from
  that commit for the first 20), with no pre-sync and nothing written. A note
  comes back through `noteFilesIn`/`noteFilesKeep` at that commit, and its ink
  base is set to GitHub head's `ink.json` (its sha and strokes), so the next
  sync sends the old strokes rather than merging the newer ones back; the
  other device's three-way merge then lands on the old strokes. The list
  leaves out saves that changed nothing: each library commit's message ends
  ` · #<16 hex>` (`libraryPrint`: synced fields without places, reading and
  bookkeeping times, feeds without `addedAt`), and `distinct` keeps the newest
  of each run of the same print. Older commits have none, so `printOf` reads
  each once and keeps its print on this device (`waypage.sync.prints`, 600).
- **Google Drive** (`drive.js`): zipped backups (`backup.js`) in a
  Waypage folder in the person's Drive, resumable (the browser in 8 MB
  pieces), the last few kept. On Android the zip is packed natively
  (`LibraryZip`), and `DriveBackupJob` makes the automatic one with the
  app closed, from a plan the app hands over each time it goes to the
  background.
- A collection's picked cover is `coverPick` on its clips (`clip:<id>`,
  or the name of a picture of your own). Pictures never sync, except
  that one: it has no link to fetch it again, so it goes up as
  `covers/<name>` before the library naming it, comes down before the
  library is shown, and rides in a backup as `covers.json`. Stored in
  `_covers/` in the app, in the database in a browser.
- **Notes in sync** (2.0.0): a note is a library entry (`note: { paper,
  from? }`, no address) whose page is only a shell, so it rides library.json
  and `pages/<id>.html` like a clip, and its data goes beside it as
  `notes/<id>/note.json`, `ink.json`, `img-<id>.txt` (a picture put on it)
  and `base.pdf` (the PDF it was made from, at most 50 MB through the
  Contents API). Their shas by name are in `files[id].note`, so only what
  changed is sent, and the files go before the page that names them. Drawing
  on a note stamps `editedAt` (`ink.onSaved`), which is what makes sync see
  it. Its strokes, typed text and pictures merge three ways by id against
  `ink-base.json` (`noteInkMerged`); `note.json` (the sheets) goes with the
  copy edited last. The
  switch is `what.notes`: a note (or, with Clips off, a clip) this device
  doesn't sync is left out of the merge and the base, and put back into
  library.json as GitHub had it (`ours`/`rest` in `once()`), so it never reads
  as deleted. A note has no address, so `oneCopyEach` skips it and Links only
  doesn't apply to it. A backup zip holds a note whole, as its folder
  (`backup.noteFiles` in a browser; the native packer takes the folder),
  under Drive's own Notes switch (`driveContents`); there are no PDF copies.
- Files read from outside (`link` on the entry) are this device's alone:
  neither sync nor any backup takes them, and a restore skips them.
  What's yours on one does sync (2026-11): its place, highlights, drawings
  (`ink`, and a printed PDF's drawn `pages`), tags, collection and
  favourite go in library.json's `outside` map, keyed by
  the file's fingerprint (`files.fingerprint`: a hash of its size and
  first and last 256 KB), and land only on a device with the same file,
  at once when it's brought in (`outsideKnown`, from the last library
  seen). An entry's `ids` are that file's clip ids on each device; stats
  add them up under this device's own (`stats.same`, kept here only).
- **Anki** (2026-11, an extension; `syncAnki`, a switch per device in
  `what.anki`, shown only while the extension is on): `anki/decks.json` and
  `anki/cards.json` are shared, merged record by record (`anki.mergeIn`):
  the copy edited last wins, a deletion (kept 90 days in `gone`, by id)
  wins over any copy edited before it, and two decks of one name become
  the older. `anki/log/<device>.json` is one device's reviews, written
  only by it (like stats, so never merged); every device replays all the
  logs in time order, so a card's schedule and the day's new and review
  counts come out the same everywhere. The files are written in a fixed
  order, so the same state is the same text: a write is skipped when it is
  what GitHub has (`waypage.syncAnki` keeps the hashes), which is also what
  stops two devices from answering each other forever. A write another
  device beat is read, merged and sent again (up to 3 times), never
  forced; a file damaged by hand reads as nothing and is written over.
  A device that has reviewed nothing sends no log. Changes made here
  start a sync 30 seconds after the last one (`anki.edited`).
  `test/syncanki.test.js` plays two devices on one made-up repo.
- **Catalogs** (2026-11, while the extension is on): `catalogs.json`, the
  list with each catalog's address, name and username but never its
  password (`opds.shared()`), and the ones removed with when, so a removal
  sticks. Merged by id, the newer change winning (`opds.mergeIn`); a
  password typed on this device stays, unless the username changed. One
  that arrives with a username and no password asks for it in its place.
  Sent only when it differs from GitHub's; no sync of its own, it goes
  with the next. `test/synccatalogs.test.js`.
- **WebDAV** (2026-11, while the extension is on): `webdav.json`, the
  servers the same way as `catalogs.json` (address, name, username, the
  ones removed; never a password). `test/syncwebdav.test.js`.
- **Audiobookshelf** (2026-11, while the extension is on):
  `audiobookshelf.json`, the servers (address, name, username) without
  their tokens (`abs.shared()`), merged like catalogs (`abs.mergeIn`). A
  server that arrives with no tokens asks to sign in in its place. Where
  you are in a streamed book goes to the server itself (its play session),
  and through OUTSIDE like any audiobook's place. `test/abs.test.js`.
- **Share reading activity** (2026-11, `activity.js`, off by default, a
  switch per device in `what.activity`): after the stats, sync writes
  `activity/reading.json`, what you're reading and minutes a day, for
  other apps that read the repo. The format is public and only grows:
  docs/reading-activity.md. It's built from the library and
  `stats.totals()`, written only when it changed (`waypage.syncActivity`
  keeps the last one's signature), and removed once when the switch goes
  off (`activityGone`). Kinds come from the entry's own marks
  (`activity.kindOf`; a PDF is a book); a clip's `noShare` and a
  collection's `folderNoShare` (on its clips, like `folderFav`) keep
  one out, and sync like any field, in the outside map too. A file read from outside
  is listed by its fingerprint (`f<fp>`), and one another device has but
  this one doesn't is kept as the file had it (`activity.carry`).
- The Sync screen shows the repo's size against GitHub's 5 GB (its
  advice; it has no hard cap), from `/repos`, asked at most every 10
  minutes. GitHub updates it a while after a push.
- **Backups and exports** (`backup.js`, `epub.js`): one zip of the whole
  library, one HTML file per clip, an EPUB of chosen clips.
- **Imports** (`imports.js`): other read-later apps' exports become
  saving jobs. A Kindle's My Clippings.txt becomes highlights on books
  already here, matched by title; they come with words only (block 0,
  start and end 0) and take a place when the reader first finds them.

Nothing leaves the device unless the person turned it on (CONTRIBUTING.md).

## Versions, cache and updates

A version lives in three places: `APP_VERSION` in `src/app.js`, the
`?v=` on every script and stylesheet tag in `index.html`, and `CACHE` in
`sw.js`; `tools/release.js` bumps all three and dates CHANGELOG.md's
`## Unreleased` entry. The service worker caches `ASSETS` for the web
copy, paints from cache and fetches fresh files for the next launch, and
drops the old cache when `CACHE` changes. The apps bundle the same
`ASSETS` list (`tools/build-www.js`), so a new file must be added there.
A merge to `main` with a new `APP_VERSION` publishes the release; the
built-in updater (`app-start.js`) reads the repo's GitHub releases and
offers any version higher than its own. A merge without a bump only
refreshes the web copy. CONTRIBUTING.md has the steps.

The files listed in `keel.lock.json` (`server.js`, `src/keel/qr.js`,
`src/keel/github.js`, `src/keel/drive.js`, `src/keel/errlog.js`, `src/keel/platform.js`, `src/keel/releases.js`, `src/keel/update.js`, `src/keel/sw-preview.js`, `src/keel/i18n.js`,
`tools/release.js`, `tools/android-version.js`, `tools/keel-sync.js`, `tools/keel-checks.js`, `tools/unreleased.js`,
`test/keel.test.js`, the github-pages skill) come from keel
(danielnoam/keel), shared with LifeLog. Don't edit them here:
`keel.test.js` fails. Change them in keel, tag a release there, then run
`node tools/keel-sync.js v<version>` in a PR here.

The app's home is index.html's `keel-site` and `keel-repo` metas: where
installed copies look for unreleased builds and the web address they
link to. Before moving the repo to an organization or a custom domain,
change both and ship a release; GitHub redirects the repo, not its Pages
address (keel README, "Moving an app").

## The phone apps

- **Android:** `.github/workflows/android.yml` generates the Capacitor
  project, patches it (`tools/android-manifest.js`,
  `tools/android-version.js`), builds an APK on every push to `main`
  (a branch only with a test label), signs it with the release key (secrets
  `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, alias `carryon`)
  and publishes the release `app-v<version>` when `APP_VERSION` is new.
  Every signed build of `main` is also the unreleased channel's: the
  artifact `unreleased-android`, which `pages.yml` serves from the site's
  `unreleased/` for About → Unreleased builds (2026-11-18).
  Without the secrets it builds a test APK and publishes nothing.
- **Test builds (1.48.0 as previews, by label since 1.49.1, renamed 1.50.0):** on any other branch whose
  open pull request has a test label, `tools/test-build.sh` remakes the pre-release `test-<branch>`
  at the pushed commit with the APK (and the iOS workflow adds the IPA).
  Its notes start with `version:`, `branch:`, `commit:`, `pr:`, which
  Settings › About › Test builds (`app-start.js`) reads from the
  public releases list to offer the build; `app-build.json` carries the
  branch and commit, so a test build knows it is one and skips the
  update check. A pre-release is never GitHub's "latest", so the
  updater ignores it. The labels: `test` (APK and IPA),
  `test-android` or `test-ios` (one, sooner; with `test-ios`
  alone the iOS workflow makes the pre-release itself). `test-builds.yml`
  runs the build workflows on the branch when a label goes on, and
  removes the pre-release when it comes off, the pull request closes or
  the branch goes. Android installs an equal
  version code over the app, so the release goes back over a test build
  only when the branch didn't bump `APP_VERSION`.
- **Test builds in the browser (1.49.0):** the web copy's Test builds
  lists the same pre-releases (repo read from the `owner.github.io/repo/`
  address) and Open puts `{ repo, sha, title, pr }` in the cache
  `waypage-preview`. While it's there, `sw.js` serves every file of the
  copy from that commit on raw.githubusercontent.com with its type, kept
  in `waypage-preview-<sha>`, and adds a "Back to the release" link
  (`./?release`, which clears it) to `index.html`, so the way back works
  whatever the branch's own code is. Same origin, so the library is the
  one the browser already has, as with a test build in the app. (The cache keeps its
  older name `waypage-preview`, and the app still reads `preview-` tags.)
- **iOS:** `.github/workflows/ios.yml` builds an unsigned `Waypage.ipa`
  on a Mac runner (`tools/ios-project.js`, `tools/ios-extensions.rb` add
  the share extension and widgets) and attaches it to the same release.
  Install it with AltStore or SideStore.
- **Locally:** `npm install`, `npm run android:sync`, then open `android/`
  in Android Studio. `android/`, `ios/` and `www/` are generated and
  ignored by git.

## Tests and screenshots

`node test/run-all.js` runs every `test/*.test.js` in its own process.
`ui.test.js`, `drive.test.js`, `sites.test.js`, `discover.test.js`, `kiwix.test.js`, `catalogs.test.js`, `calibre.test.js`, `abs.test.js` and `webdav.test.js`
drive the app in Chromium with Playwright and skip when it isn't installed
(`sites.test.js` saves the discussion and code sites from their answers
saved in `test/fixtures/sites/`, with nothing going out; `discover.test.js`
reads the story sites' lists from hand-made pages and pages cut from WEBTOON, Tapas and Wattpad in `test/fixtures/discover/`); `build.test.js` checks the
bundle, the three version places and CHANGELOG.md; `contrast.test.js`
checks every theme for WCAG AA; `csp.test.js` checks the page's Content-Security-Policy through keel's check (ui.test.js fails on anything it blocks); `docs.test.js` checks this file names
every source file, that the app uses only DESIGN.md's moves and that every looping animation has a reduced-motion answer (and `build.test.js` that no two shell files share
a top-level name); `save.test.js`, `files.test.js`, `imports.test.js`,
`sync.test.js`, `syncbatch.test.js`, `syncdelete.test.js`, `syncrace.test.js`, `synchistory.test.js`, `syncanki.test.js`, `synccatalogs.test.js`, `syncwebdav.test.js`, `activity.test.js`, `pptx.test.js`, `ink.test.js`, `recover.test.js`, `listen.test.js`, `anki.test.js` (the scheduler and the decks' engine), `ankiimport.test.js` (reading an Anki deck and writing Anki's text file, against `test/fixtures/anki/collection.anki2`, which `make-collection.py` builds) and `packs.test.js` (the language-pack builder) and `extensions.test.js` (turning extensions on, and downloaded packs) and `zim.test.js` (Kiwix packs, old and new layout, xz and Zstandard, against `test/fixtures/zim/`, which `make.py` builds) test their areas in Node; `worker.test.js` runs the fetch proxy against a faked web. The Tests workflow runs them all on every PR and on `main`, spread
over four machines: `TEST_SHARD=2/4 node test/run-all.js` runs one
slice. `ui.test.js` is most of the time, so it is split too
(`UI_SHARD`): the tests on its first page `p` build on each other and
all run in slice 1, and every test that opens its own page is dealt
round slices 2 to 4 with the other files, biggest first. The job named
Tests waits for the four. A PR that only changes Markdown runs just
`build.test.js` and `docs.test.js`.

`node tools/shots.js` retakes the README's pictures at 1280 px and 390 px
into `docs/shots/`, from a demo library it saves through the app itself
(`tools/shots/demo/`). `node tools/shots.js reader skim` retakes only
those sections.

## Audiobooks

An audiobook is a file read from outside (`file.kind` "audio", never
copied in), so it's under Files and syncs by fingerprint like one: its
`listen` field (`{ t, tAt, speed, mode, book, fixes }`) is in sync.js's
OUTSIDE list, merged by `mergeListen` (the place from the newer `tAt`,
fixes from both). `audio` (`{ parts, chapters, dur }`, each part a sound
file's ref) is this device's own. A folder is one book; its fingerprint
is its files' names and sizes. Playing is AudiobookService (a foreground
mediaPlayback service, one MediaPlayer, parts played in turn, a stretch
of a zip by fd offset for an EPUB's narration); on iOS AudiobookPlugin.swift
(one AVPlayer, a zip's stretch copied out to the cache first, as AVPlayer
plays only whole files, with Listen.swift for transcripts); a browser
uses <audio>.

Reading along needs words with times. The phone writes a transcript a
little ahead of where you are (`writeAhead`, three minutes at a time,
ten minutes ahead, the whole book while charging if asked) with
sherpa-onnx's offline recognizer, kept in `listen.json` beside the clip.
`listen.align` puts the heard words on the shown clip's words (runs of
three heard in order, then the gaps between them shared out), into a
sync of `{ t, b, o, l }` in Narrate's blocks (`reader.readable` with
footnotes and headers in); `reader.say` lights the block and the word
with the CSS Custom Highlight API. A transcript clip is aligned to its
own text the same way, so both read along through one path. An EPUB's
Media Overlays (SMIL) give the times themselves (`overlaySync`).

An audiobook from Discover (LibriVox, `getAudiobook`) is downloaded:
its MP3 parts go one at a time through `platform.keepFile` to the place
the + sheet's Save in picked (inside Waypage, Downloads, Documents or a
picked folder), in a folder named for the book (`"Book/001 Title.mp3"`),
and each part's ref is that file's lasting address. `audio.from` is the
Discover id ("lv:<archive.org item>"), the fingerprint is made from it,
so another phone that downloads the same recording picks up the place.
`audio.ours` marks parts in Waypage's own places, which `dropAudioFiles`
deletes with the clip; a picked folder's stay. Its Gutenberg book (the
recording's `url_text_source`) downloads after it and is paired
through `pairPending`, as Find the book does.

Find the book (2026-11) searches Discover's book sites and Wikisource.
With a transcript model it takes a minute of the narrator from where you
are (the transcript there, else `heardSample` writes it now, holding
`writeAhead` off with `lis.testing`), downloads the first five found
(EPUBs, or the Wikisource page through its API) and `listen.fit` says
"same" (a fifth of the heard runs of five words are in the book),
"other" (the names heard mid-sentence are the book's: another
translation) or "no". A Wikisource text is saved as one EPUB book
(Discover's Save as an EPUB file) and paired when it arrives. While
reading along, `checkLost` asks `listen.lostFor` every ten seconds; four
minutes heard and not in the book brings the `#listenLost` card. Going
to the transcript keeps the book as `listen.was`, so The book in the
Read along drop-down goes back to it.

A zip of sound files (Add a file) is one book (`addAudiobookZip`,
`audio.zip`): its parts are stretches of the zip (`offset`, `length`),
played and transcribed from there like an EPUB's narration
(`partSource`). Only files stored as they are; a zip whose sound files
are compressed is turned away with a word to unzip it.

Transcripts sync (2026-11, `what.transcripts`, on by default) as
`transcripts/<fingerprint>.json` (`listen.shareTranscript`: pieces,
ranges, pack). `syncTranscripts` brings GitHub's into this device's
through `C.listenTake` (`listen.mergeTranscript`: what's written here
stays, theirs fills the gaps), into the same object any writing under way
holds, and sends this device's when it has changed.

A clip's own sound made from its text (Save the narration,
`makeAudiobook`, Android only) is spoken by the Narrate voice of the
clip's language: `AudiobookPlugin.voice` runs `Voicing` on its own
thread, each of Narrate's pieces through `TextToSpeech.synthesizeToFile`
(any engine, Kokoro and Piper through `KokoroTtsService`), read back as
PCM and encoded with MediaCodec into one AAC .m4a (48 kbps mono) of at
most 120 pieces, with each piece's start and end. The files go through
`keepMade` into Waypage's own files and become the clip's own `audio`
(`ours`, `voiced`), like an EPUB's narration: the clip is no audiobook of
its own (`ownSound`), it reads along with itself, Narrate's button plays
it (`voicedPlay`), and the car lists it with the audiobooks. `audio`
never syncs and is in no backup (`backup.cleanMeta` leaves it out), so
the files stay on the phone. The pieces' times are written whole into
listen.json (`ranges` covers it, so nothing is written ahead; `para`
starts each paragraph). A collection makes one for each clip without.
The run is a Downloads card, so the dataSync notification keeps the
app up while it's made.

A streamed audiobook (the Audiobookshelf extension) is an entry with
`remote` (`{ kind, server, item }`) and a `link` of `abs:<server>:<item>`
that no file has, so it is treated as read from outside: not uploaded
by sync, not backed up. Its extension fills `REMOTE_AUDIO[kind]` in
app-listen.js: `open` starts a play session on the server (its tracks
become the parts, its chapters the chapters, and a newer place there is
taken), the parts play from the session's own addresses, `heard` sends
where you are every half minute and on a pause, `done` closes the
session. Transcripts are written from the same addresses while the
session is open.

## Android Auto

Android Auto lists Waypage through `CarService` (a framework
MediaBrowserService, no androidx) and `automotive_app_desc` in the
plugin's manifest. Narrate and audiobooks share one MediaSession
(`Car.session`, never released): the car binds to one token, so each
player only says it's the one playing (`Car.playing`) and hands it back
when it stops (`Car.idle`). The car's tabs are Continue, Audiobooks,
Up next and Collections (Android Auto shows four at most); an
audiobook's chapters are the session's queue. Custom actions add next
and previous clip (`SpeechService.clip`: the clip the app queued, else
`Car.nextId`: the next in the clip's collection or series, else under
Up next) and next and previous chapter or file
(`AudiobookService.chapter`, which past the book's ends goes to the
collection's next or previous). Their icons are a list with an arrow,
not the skip arrows: beside the paragraph buttons, look-alikes read as
previous and next swapped. A clip the car jumps to that the app didn't
queue isn't followed by the open app's player.

The car starts things with the app closed, so the WebView can't help.
`app-car.js` writes `car.json` (CarPlugin) when the app is put away and
a little after it opens, if anything changed: up to 40 books with their
parts, chapters and place, and the 10 latest unfinished clips with their
text already cut into Narrate's pieces, voice, engine and speed, and
the 8 collections or series read or added to last, in their order, with
quick starts and only some of their clips (the first two, the newest,
and from just before where it was left to 8 after; `at` gives each
one's place, so Next never jumps a gap). Those carried only for a
collection are marked `hide` and stay off the Audiobooks and Up next
tabs. The car's words come in the app's language (`words`). A job
the car started is marked `car`; where it got to goes into
SharedPreferences (`Car.heardBook`, `Car.heardClip`) and `carPlaces`
takes it back into the library when the app opens. A clip's place there
is its share of the text, so it lands near, not on, the sentence.

## Languages

English and Hebrew (1.63.0). Every word the app shows goes through
`t("English text")`, or `tn(n, "one", "other")` for a count; the English
is the key, and `src/lang/he.js` has the Hebrew for each. Elements in
`index.html` carry `data-t` (their text) or `data-t-attr` (an attribute),
turned once by `i18n.apply()` at the top of app.js. `src/language.js`
runs in `<head>`: it reads Settings › Appearance › Language (or the
phone's language), sets `lang` and `dir="rtl"` on `<html>`, and writes the
Hebrew file's tag only when it's needed, so English loads nothing more.
Changing the language reloads. A sentence is one key with `{name}` in it,
never pieces glued together; Hebrew word order differs. `test/i18n.test.js`
fails on a word with no Hebrew, Hebrew for a word that's gone, or a
`{placeholder}` that doesn't match. Not translated on purpose: the problem
report and pen test (they're read by whoever fixes it), Discover's genres
and lists (they come from the sites), font and service names, and what's
saved into a clip. Right to left everything mirrors: the sidebar, the
desktop panes and the reader's rail sit on the right and slide from there,
a screen is pushed in from the left (keel's motion follows `<html dir>`,
keel 0.10.0), and swipes, the pane line, the picture viewer's arrows and
their keys turn with it (`M.x()`, `M.rtl()`). Inside the reader the clip
keeps its own direction: a page turn goes the clip's reading way. Arrows
for back, forward, previous and next flip.

## Trade-offs

What the app gives up on purpose, said plainly. A change that adds one
adds a line here.

- Tags stay on each clip (2026-11): a collection has no tags of its own, so its Tags sheet writes the tag to every clip in it, and its story page's tags (`siteTags`) are copied onto each clip like `folderFav`. A few bytes a clip, but sync, filters and search keep working as they did. A site's tags are only offered by default (Suggest): added unasked, one story fills the tag list.

- Live clips and Update from the site (2026-11) keep one earlier copy of the page on the device (`earlier` in the index, app-cards.js), never synced or backed up, so going back works only on the device that fetched it. A copy that looks broken (under half the words, under 100 where there were more, or only the start where it was whole) is kept as the other copy instead of put in place. An unchanged page keeps its copy and id, so nothing new goes to sync. A live clip updates on open at most once an hour (`liveAt`, device-only), and on every pull down the library (`updateLiveClips`, three at a time, quiet per clip).
- Deleted chapters and Keep in Website sync (2026-11) are this device's own (`waypage.chaptersGone`, `waypage.chaptersKeep` in localStorage, app-saving.js), not synced: a chapter deleted on another device is noted here when sync takes it away, so nothing new had to go into library.json. Keep deletes only read chapters, never one with highlights, notes or drawings, a favourite or the one open, and saves only chapters after the last one saved or deleted, so a story started part way in doesn't fill in from chapter 1.
- New chapters with the app closed (2026-11, Android) are spotted by FeedCheckJob without save.js: the app hands it each linked collection's contents page, the path its chapters share and how deep they go (`chapterShape`), and every chapter it knows (`chapterKey`: host without www., then the path). Any link on the page (or in its scripts' JSON) of that shape that isn't known counts. It's only a notification: the app finds the chapters itself when opened. It misses what the one page doesn't list (a list oldest first over several pages), and a blog's dated posts share no path, so those wait for the daily check. A plain request turned away goes through `HiddenPage`, a WebView with no window.
- Translate chapters (2026-11) translates a chapter when it opens, not when it saves: the blocks a translation is kept against come from the reader's laid-out page (`translatable()` in reader.js), which a save never builds. ML Kit works offline once its languages are down, so picking the language downloads them then. The pick (`waypage.chaptersTranslate`) is this device's own, like the translations.
- Deleted clips in Stats (2026-11): stats.js keeps only ids, so each device keeps a name (title, site, address or file key) for every clip it has read, in its synced stats file, and marks it gone when the clip leaves its library. No cover is kept for a deleted clip. Clips deleted before this have no name and stay out of the list. Removing one from Stats hides it on every device but leaves its time in the totals.
- Kiwix packs (2026-11) are read over the bridge a stretch at a time (`files.blob`, 4 MB pieces, small reads through zim.js's 64 KB blocks): a title search on a big pack makes a few hundred small reads. A native ZIM reader would be faster but is Android and iOS code twice; this is plain JS everywhere. Downloads go one at a time through the Downloads plugin, which resumes but never runs two.
- The page's Content-Security-Policy (index.html) lets in inline styles
  and a `<base>` of any web address, because a page being saved is parsed
  under it: without them every `style=""` logs a violation and relative
  links resolve against the app. Scripts stay the app's own files, plus
  blob:, one hash for the PDF sandbox and `'wasm-unsafe-eval'` for its
  JPEG 2000 decoder (`test/csp.test.js`).

- Full pictures load from the web when a clip is opened online, so the
  picture host sees the visit (Settings › Saving › Load pictures only
  when tapped turns that off).
- The `waypage-data` sync repo is private on GitHub, not encrypted.
- Share reading activity (off by default) lets any app holding a token
  for `waypage-data` read what you read and when: titles, authors,
  collections, progress, dates and minutes a day. Nothing new leaves the
  device (the library is already there), but every app you connect to the
  repo can now read it in one simple file. No text, highlights, notes or
  links go in it.
- The web copy shares `danielnoam.github.io`'s storage with every other
  Pages site on that account, so its sync token is as safe as the least
  safe of them.
- Android Auto Backup stays on: Google's backup is end-to-end encrypted
  with the screen lock, and it carries the library to a new phone.
- App lock is a gate, not encryption: it keeps out someone holding the
  unlocked phone, not someone with the files or developer tools.
- Newsletters go through Kill the Newsletter, which receives and can read
  the emails; the address and feed link are keys.
- Discover reads the story sites' list and search pages (Wattpad's JSON API) as a browser would
  (Royal Road sees the visit, as it does for saving a chapter). Cloudflare
  turns a plain request away there, so on Android the hidden browser
  (PageRender) reads them, which takes a few seconds; and the
  phone fetches the hand-picked list from raw.githubusercontent.com twice
  a day, which GitHub sees. Their markup is scraped (Scribble Hub's, AO3's and FanFiction.net's
  were never seen from here: Cloudflare or AO3's own check blocks every
  plain fetch; only the phone's hidden browser gets them), so a change
  there leaves the last list read until the parser is fixed.
- Discover's books and texts (Gutendex, Standard Ebooks, Wikisource) and
  Wikipedia today are read in the web copy too, through the fetch proxy;
  Gutendex is a volunteer-run index of Gutenberg and has been slow or down
  at times, and Standard Ebooks' list markup is scraped. A book's EPUB is
  downloaded once, on the tap, never in bulk (Gutenberg bans crawlers).
- LibriVox's lists (most listened, newest) and search come from
  archive.org's scrape API, a genre and a book's parts from LibriVox's
  own API (by title, then archive.org's file list). Neither was reached
  from a test machine; their answers were read once by hand.  A
  downloaded audiobook is in no backup (a book is hundreds of megabytes).
- A path rule (Lemmy's /post/123, Substack's /p/slug) tries the API of
  any site whose address has that shape before reading the page, so one
  of those that isn't Lemmy or Substack costs a request that fails.
- Translate downloads each language's model from Google once, which tells
  Google the languages, never the words.
- A deck (PPTX) is redrawn by `pptx.js`, an approximation: no charts,
  SmartArt, effects or WordArt.
- Dictionaries live in their own IndexedDB, so they aren't moved with the
  library, synced or backed up.
- Kokoro voices: the engine library (sherpa-onnx, arm64 only) ships in the
  APK, since running downloaded native code would let anyone who swaps the
  file in; only the model is downloaded, and checked against its SHA-256
  before unpacking. It is a real Android speech engine (`KokoroTtsService`),
  so the lock screen, PiP and sleep timer work unchanged, but other apps
  can use it too. 32-bit and x86 phones and the web copy get none.
  iOS has them too (sherpa-onnx's static xcframework, linked into the app,
  about 25 MB): iOS lets no app add voices to the phone's list, so only
  Narrate speaks them, through SpeechPlugin playing KokoroVoice's audio on
  an AVAudioEngine. Its archive lags Android's (pinned to the newest with
  an iOS build); the models are the same files.
  Piper voices (one per language) are more downloads for the same engine
  and library; one model is in memory at a time, so switching between a
  Kokoro and a Piper language reloads (a second or two).
- Extensions (Anki first): their code ships in the app and loads only once
  they are turned on; what they download (a language pack) is data, checked
  against a pinned SHA-256, never code that runs. That keeps the app
  inside the stores' rules on downloaded code and working the same
  offline, at the price of a few kilobytes of unused code for anyone who
  never turns one on.
- Anki import reads only the older collection layout (Anki's "Support older Anki versions" export, `collection.anki21`), since the newer `collection.anki21b` is zstd-compressed and a decompressor would be one more thing to vendor; a deck in the newer layout is told to be exported again. Pictures and sounds aren't brought in, a card keeps its Anki id (so a deck read twice, or on two devices, is the same cards), and its schedule is replayed from its review log through FSRS, so a card with no log starts as new. The fixture was built from Anki's documented tables, not exported by Anki itself.
- A card goes to AnkiDroid through the share sheet (it takes shared text as a new note and asks which deck), not through its content provider: that would be a native plugin and a permission to ask for, and it can't be built or tried without the Android toolchain.
- The Calibre extension reads a Calibre library folder in place, with no
  server: metadata.db through sqlite.js (read-only, tables only), and each
  book's file and cover.jpg by its path (`files.child`: on Android the
  Files plugin's folderStat now gives the file's uri; on iOS the ref is
  the folder's plus the path, as scan makes them). It never writes to the
  folder, so Calibre stays the owner of it. Read it adds the book as a
  file read from where it is (not synced or backed up, like any outside
  file); Copy brings it in. A database Calibre has open in WAL mode may
  miss its latest changes until Calibre closes. In a browser the folder
  works in Chrome and Edge only (showDirectoryPicker), and the browser
  asks again after a restart. Books are matched to clips by Calibre's
  uuid (`calibre` on the clip, this device's only).
- Catalogs (OPDS) are the person's own: Waypage ships none. Each is kept in
  this device's localStorage (`waypage.catalogs`), password included. Sync
  carries the list but never a password (Daniel, 2026-11-16: a leaked sync
  token shouldn't leak a library login too), and backups leave catalogs
  out. The app sends a login only to the catalog's
  own address. A browser reads an open catalog through the fetch proxy but
  one with a login, or on the home network, straight from the page: a
  password never goes through the proxy (which can't reach a home server
  anyway), so those work in a browser only when the server allows the web
  copy (CORS). Only Basic logins and keys in the address (Kavita) work;
  Calibre's server asks for Digest over plain http unless it's set to
  Basic. Book servers at home are mostly plain http, which Android refuses
  unless the app allows cleartext, and it can't allow it for home addresses
  only: so `tools/android-manifest.js` allows plain http everywhere (iOS
  allows it for the local network only). Covers that a page can't load
  (http, or behind the login) are downloaded once into the cache instead.
- WebDAV servers are kept and synced like catalogs (`waypage.webdav`, the
  password on this device only, never through the fetch proxy). A listing
  is a PROPFIND, which Android's HttpURLConnection (and so CapacitorHttp)
  refuses outright, so on Android `Dav.java` writes that one request by
  hand over a socket, checking TLS against the phone's certificates and
  the host's name, and following a redirect only on the same server.
  It ignores a proxy set on the phone. iOS's CapacitorHttp sends it as is;
  a browser asks straight, so only a server that allows the web copy
  (CORS) works there, and Nextcloud doesn't. A book is downloaded into
  the Library (no reading from the server: it wouldn't be offline), and
  the clip keeps its address (`webdav`) to show it's there. Covers are a
  picture beside the book with its name, or a folder's cover.jpg when the
  book is alone in it; no file is opened to find one.
- Audiobookshelf: the password is sent once to the server's `/login` and
  never kept; this device keeps the access token (an hour) and the
  refresh token (30 days, renewed with each use) in localStorage, never
  synced, never backed up, never through the fetch proxy. Streams use
  the play session's `/public/session/<id>/track/<n>` address, which the
  server serves without a login while the session is open, so no token is
  ever in a URL; anyone who saw that address could play that book until
  the session closes. In a browser it works only when the server lists the
  web copy under Allowed origins (CORS) and is https (the web copy is).
  Book libraries only; podcasts aren't shown.
- Language packs live on the repository's orphan `packs` branch (files and a README, no code, no workflows), fetched from `raw.githubusercontent.com` at one commit so a file can't change under its pinned hash. A new or changed pack is built with `tools/packs/build-lang.js`, committed to `packs`, and its commit, SHA-256 and size go in `src/extensions.js`'s catalogue (`test/extensions.test.js` checks the pins have that shape). A language pack is a hash-pinned download of Wiktionary's words as a StarDict dictionary; hashed and size-checked before `dict.js` reads it, and never run as code. It is the same dictionary as one you add yourself, so Settings › Reading › Dictionaries lists and removes it too. It isn't synced or backed up.
- The web copy reads pages through the fetch proxy (`worker/`), so
  Cloudflare sees which addresses a browser user saves (not the app's).
  It only answers the web copy's origin, but the Origin header binds only
  browsers: a script can fake it, and a public web copy can't hold a
  secret. The per-IP rate limit and the free plan's daily cap bound that.
- A PDF's pen drawings are this device's own, like the file they are on:
  neither sync nor a backup takes them, and deleting the clip deletes them.
  A copy of the PDF with them as annotations is how they leave. The copy's
  strokes are even in width (a PDF ink annotation has no pressure).
  Pictures put on a page stay with the drawings (this device) and go into
  the copy as stamps, at most 2000 px a side, as JPEG or PNG; the
  eyedropper reads the page's picture, not Dark PDF's dark view, and not a
  placed picture.
- Dialogs (Downloads, Sync, Save with options, Settings) fade in and out,
  the one planned exception to "nothing fades" (Daniel's pick over the
  grow and the zoom).
- **Two devices editing one thing between syncs** (2026-11): highlights,
  tags, drawings (a note's too) and a file's progress merge; the newest
  place wins. A clip's text edited on both keeps the later edit whole and
  drops the other (rare, from Edit clips; not worth a text merge). A rename
  on one survives a text edit on the other. A clip moved to two different
  collections ends in the one moved to last (`movedAt`; `folderAt` is its
  order there, not a time). A new highlight, stroke or edit on one beats
  a delete on the other (`addedSince`); reading on or a tag doesn't. A note's PDF over 50 MB isn't sent, so that note opens on
  another device with its PDF missing. Notes sync by default like the other
  parts, since sync itself is already on.

- **Transcripts aren't synced or backed up.** They're remade on each
  phone from the sound (a long book's is a few MB); only the fixes sync.
  No unsure-word marks: the models give no confidence. Fixes are find and
  replace on what's heard, not hotwords for the model.

- **Android Auto keeps a copy for the car.** `car.json`, in the app's own storage, holds the text of
  the 10 latest unfinished clips and the titles of up to 40 audiobooks,
  so the car can start them with the app closed. Only the car, the
  Assistant, Bluetooth and system apps (by uid, system or from the Play
  Store) may browse it, and with App lock on it lists nothing.
- Save the narration takes as long as the voice does: Google's voices
  are faster than real time, Kokoro on a phone may be slower, so a long
  book can take hours, and Android 15 ends a dataSync service after six
  hours a day. Pausing stops the file in hand and makes it again from its
  start. A clip's made sound is in no backup or sync: another phone
  narrates the clip, or makes its own.

## Traps

Things that broke once and would again. Check here before touching the
area.
- Chrome and Android's WebView ignore `touch-action` on SVG shapes. A drag that
  starts on one (a comment bubble in `ink.js`) is cancelled by the browser's
  own pan (`pointercancel`), and the item snaps back. Give the shape a real
  box: an HTML `div` in a `foreignObject` with `touch-action: none`. A test that
  fires `PointerEvent`s at the node passes anyway; use real touch (CDP
  `Input.dispatchTouchEvent`), as the Add › Note steps in `test/ui.test.js` do.
- Pages mode scrolls by hand (`pagedInput`), so ink's `preventDefault` on a
  touch doesn't stop it. A new document-level touch gesture has to check
  `e.defaultPrevented` and `inkHook.drawing()`, or the page moves under the pen.
- A build from before Notes (1.57.0 and older, and `test-omri-dev`) drops
  every note when it syncs: `cleanMeta` keeps only entries with an address,
  so the next merge marks them deleted and removes their folders on the
  phone. GitHub's `notes/<id>/` is left, which is what Recover's Look for
  deleted notes reads. Don't sync a library with Notes from such a build.

- A new field on a clip that should sync goes in three lists: sync.js `SYNCED`, app-saving.js `SYNCED_KEEP`, and backup.js `cleanMeta`. Sync's merge runs every entry through `cleanMeta` first, so a field missing there is dropped on every sync even though `SYNCED` names it (Live, 2026-11).
- A merge done with the workflow's own `GITHUB_TOKEN` starts no other workflows, so `pages.yml` and the release builds never run. `auto-merge.yml` turns auto-merge on with the `AUTOMERGE_TOKEN` secret (a fine-grained token of Daniel's) for that reason.
- The books of an audiobook folder added as a series share one `link`, the folder picked. Removing an entry lets go of its `link` only when no other entry still reads from it (`releaseLinks`).
- A field missing from sync's `SYNCED`, backup's `cleanMeta`, `SYNCED_KEEP` and `AGAIN_KEEP` is dropped on the next sync or update. `folderSeries` and `folderIn` are in all four; a device without them strips them from clips it changes, which `healSeries` repairs while any clip of the series keeps them.
- A story's status (`siteStatus`: completed, ongoing, hiatus, stubbed, dropped, inactive) is read only by site rules (`status` in save.js `SITES`: Royal Road, AO3, FanFiction.net, Scribble Hub) from the story page, kept on every clip of the collection like `siteTags`, and refreshed by Website sync's check. It is device-only like the cover (not in sync or backups): each device reads its own on its next check. A page that stops saying keeps the last word. `statusPick` (Edit's Status row) and `folderNoStatus` (Website sync's "Status from the site" off) are synced marks on every clip like `coverPick`; the site's word shows over the pick unless it's switched off. Chapters saved later take it from their collection mates, or from `seenStatus` (what the last story page read said) on a first save.
- A site's tags (`siteTags`, { site, tags }) are read in `readArticle` before Readability runs: Readability takes the `<script>` tags out, and the schema.org keywords with them. A collection's clips carry the story page's tags, never a chapter page's own (`runJob`).
- On a big screen the route steps back out of Settings by itself when it lands on the menu with a section open, so leaving Settings from deep inside (`outOfSettings`) waits a moment after each step instead of reading `history.state`: two backs at once leave the app.

- A note's strokes are kept by sheet number, so any change to its sheets (Page view) goes through `ink.js arrange` and `notes.js arrange` together, and the reader's slots are made again by `files.js resheet`; arranging clears undo. Nothing new may be added to `note.json`, to `meta.note` or to a note's file names: older versions strip unknown fields from the first two (`clean`, `backup.cleanNote`) and sync drops and deletes file names that aren't `note.json`, `ink.json`, `base.pdf` or `img-<id>.txt`. A sheet's own paper and a PDF page pasted into another note are therefore picture items in `ink.json` with an id starting `bgp-<paper>-` or `bg-` (older versions show the picture; this one draws real paper for `bgp-` and doesn't select, move, erase or count either).

- The reduced-motion rule in src/styles.css sets every CSS animation to 1 ms. An infinite one (a spinner's breathing) then runs a thousand times a second and flickers, so each gets its own duration back in that same block; a new looping animation does too.

- `earlier` holds the other copy's own meta; the clip's place, tags, highlights and the rest (`AGAIN_KEEP`, app-jobs.js) always come from the entry it replaces. An earlier copy whose clip left the library some other way (deleted, replaced through sync) is only removed by `sweepEarlier` on the next update, from the ids listed in `waypage.earlierCopies`.
- On Android, `FileInputStream.skip` past the end still returns what was
  asked, so a skip-to-count loop never ends. FilesPlugin.info and
  describe read a file:// size from `File.length()` instead (1.65.0 hung
  every kept download after its first file).
- Changing `BOOT` in src/pdf.js changes its hash in index.html's
  Content-Security-Policy; without the new one no PDF opens.
  `test/csp.test.js` fails and prints the hash to put there. The PDF
  sandbox stays a srcdoc frame: a sandboxed frame from a file isn't
  served by the service worker, so PDFs wouldn't open offline.
- pdf.js decodes JPEG 2000 pictures (common in scanned books) with
  WebAssembly, in the sandbox's worker. Both policies, the sandbox's and
  index.html's (a srcdoc frame takes both), need `'wasm-unsafe-eval'`;
  without it in either one those pages draw blank, with no error.

- A `ui.test.js` test that needs what an earlier test left behind must
  use the first page `p`; that is how the slicing (`UI_SHARD`) keeps it
  in slice 1 after them. One that leans on an earlier test some other
  way (a variable it set) passes alone in order and fails in CI's
  slices; run `TEST_SHARD=i/4` for each slice to check.
- The reader's sideways swipe to the next or previous clip (`swipeInput`
  in reader.js, `clipSwipe` in app-reader.js) shares the page with the
  brightness edge, the pinch, the Pages turn, selection and Draw. It
  yields to each: not from the 24 px screen edges (the phone's own Back),
  not once the brightness drag has started, not with two fingers, a
  selection, Draw on, a zoomed picture or over a sideways-scrolling block,
  and it needs a clearly horizontal drag. It uses `screenX`: the frame
  moves with the finger, so `clientX` would shrink the drag. In Pages
  `pagedInput` hands over only past the first or last page.

- A note's card picture is always `images/cover.jpg`, so its address
  carries `thumbAt` (this device's own, never synced), stamped after the
  picture is written. Stamping `editedAt` instead showed the old picture:
  the redraw lands after the library has already rendered that address.
  Covers are drawn without opening the note (`noteCoverOf`, queued by
  `noteCoversSoon`) for new, synced-in and edited notes.
- Android Auto hides media apps not installed from the Play Store: a
  sideloaded APK needs Android Auto's developer settings › Unknown
  sources. The framework MediaBrowserService has no `onSearch`, so the
  car's own search box isn't offered; voice asks come in as
  `onPlayFromSearch`. Don't release `Car`'s session in a player's
  `onDestroy`: the car holds that token.

- A collection's mosaic cover is a picture of your own whose name starts
  "uy", then its kind (m mosaic, s stacked, v side by side) and a hash of
  the clips it shows (`mosaicName`); "ux" is a mosaic from before, drawn
  again once. Own pictures start with a base-36 time ("um…" until the
  2050s). Change how either is named and the Cover choices show the wrong
  one as picked. A mosaic is a drawn picture, so it went stale when its
  clips changed (it showed a deleted one): `watchMosaics` (after each
  library draw) draws it again when the hash no longer matches. Which
  clips it shows depends on `thumb`, which is this device's own; two
  devices that disagree would each draw their own, once a session.
- The small window outside the app (picture in picture) is one setting
  on the activity that Narrate and audiobooks share, and Android keeps it
  armed until told otherwise. Only `PipWindow.java` sets it, and it arms
  it only while `SpeechService` or `AudiobookService` is playing right
  now; a page that set it from its own idea of "playing" left it on after
  a pause, a lost audio focus or a reload, and it popped up on going home.
- `sync-worker.js` has to load `ink.js`: `backup.cleanInk` checks strokes
  with `C.ink.clean`, and without it every drawing on a clip dropped out
  of a merge made on the worker.

- **The Highlight hold captures the pointer:** `markHold` (app-reader.js)
  takes the finger on Highlight so the slide to a colour keeps reporting,
  and the click that follows a hold lands on Highlight too. `markHeld`
  swallows that click, or a hold would also highlight in the old colour.

- **`src/boot.js` picks the theme twice over:** it runs in `<head>` and
  resolves the saved choice (Auto's light and dark picks included) on its
  own, before app.js exists. A change to how `resolveTheme` or the theme
  keys work goes in both, or starts flash a wrong theme again.
- **`isPaged()` is true for a comic in Pages** (since comic Pages): code
  that means text columns checks `comic` too (relayout branches to
  picsLayout, chunkUp and text pinch skip comics).
- **Library cards clip what leaves their box:** `content-visibility: auto`
  on `.library > .page-card` paints only inside the card, so a hover
  tint or a grown cover reaching past its edge is cut off (the hover
  rows keep inside and grow covers from their inner edge). Hover
  styles are only under `(hover: hover) and (pointer: fine)`.

- **Cloudflare's browser check (Royal Road, Nov 2026):** the phone's plain
  fetch gets a 403 or 503 "Just a moment" page. `get` in save.js spots
  it and asks the hidden browser (`C.platform.render`) instead; every
  chapter of a series pays that slower path. The web copy can't.
- **Android TTS engines get only ~0.5 s ahead:** the framework hands an
  engine the next piece only when one ends, so Kokoro paused between
  paragraphs. `SpeechService.makeAhead` asks `Kokoro.take` for the next
  piece, made on its own thread.
- **`el()` attributes:** `disabled: false` still disables a button (it's
  set as an attribute); pass `null`.
- **`replaceChildren`/`append` write a `null` out as the text "null":**
  leave a missing part out of the list rather than passing null.
- **`position: fixed` inside a sheet** counts from the sheet, not the
  screen, because `.sheet` has `will-change: transform`; `dropdown()`'s
  `fit` measures and corrects for it.
- **Kokoro's model is freed only on its own thread** (`Kokoro.freeLater`):
  freeing it while a piece was being made crashed the app.
- **Narrate's "thinking"** comes from `onAudioAvailable`, not `onStart`:
  Android calls onStart when a piece is queued to play, before any sound.
- **Pinned download hashes:** read each one from the real file (a CI step
  can fetch GitHub release files this container can't); Kokoro 1.1 shipped
  in 1.50.0 with a wrong one and every download was refused.
- **A build without `KokoroTtsService`** (main before Kokoro) resets its
  enabled state; `KokoroPlugin.load` puts it back on the list at start.

- **Saved HTML:** `save.js` rebuilds every element from an allowlist
  (`ATTRS`), never copies the fetched DOM. The reader frame keeps
  `allow-same-origin` only because it has no `allow-scripts`; the two
  together are dangerous, and `test/save.test.js` fails if
  `allow-scripts` appears.
- **A PDF page's words layer is a sibling, not a wrapper:** the layers
  sit at the end of `.co-printed`, absolutely placed over their page by
  `placeText` (called from `applyTop`, `picsLayout`, `setZoom` and
  `fixSizes`). Wrapping each `<img>` breaks everything that walks
  `.co-comic > img` (the page rail, Pages, zoom, `img + img` gaps). In
  Pages a page is `object-fit: contain`ed into its box, so the layer goes
  over the page drawn, not the box. Its spaces are zero-size text at the
  layer's corner: leave them out of a selection's box.
- **A stylus's side button never reaches a web page as one:** Chromium
  maps Android's `BUTTON_STYLUS_PRIMARY` to the left mouse button, so a
  pen touching with its button held has `buttons` 1, the same as without
  (`ui/events/android/event_flags_android.cc`). Notes apps read the
  `MotionEvent` (`getToolType`, `getButtonState`), and so does the Pen
  plugin (`PenPlugin.java`, wrapping the window's callback as VolumeKeys
  does): it tells the page when a stylus is near, touching, holding a
  button or on its eraser end, and ink.js erases with that. Hover comes
  first, so the button is known before the stroke. While a pen is near the
  layers get `touch-action: none` (`data-co-pen-near`), since the browser
  decides whether to pan at the touch, and the touch's own events come
  too late and differ from device to device. ⋯ › Try your pen shows
  what the page and the phone each say, and its Start test records a log of
  ten steps (`app-pentest.js`; the Pen plugin's `raw` mode sends every
  MotionEvent and KeyEvent) to save and send. The log holds only event
  types, buttons, pressure, tool types and key codes, timed. iOS and the web copy have only the
  browser's `buttons` 2 or 32.
  On a Galaxy Tab S6 (One UI), found with the pen test's log: with the side
  button *held before* the touch, the phone sends no touch at all but its
  own actions 211 (down), 213 (move) and 212 (up), which the WebView drops
  (the page gets a `pointerleave` and a `contextmenu`). With Draw on, the
  plugin's `grab` takes them, tells the page ("erase" with the position
  from the web view's corner) and consumes them (`ink.js eraseFrom`).
  Pressed *after* the touch it is an ordinary move with `buttons` 32, which
  the pen's state covers. And the pen's hover exit comes just before its
  touch, and the phone's word for the touch after it has begun: so "near"
  lasts 1.5 s past the exit, or the touch has no lock (`touch-action: none`
  on the page while Draw is on and a pen is near).
- **Drawing on a page:** the layer is `pointer-events: none` until Draw
  is on, or words couldn't be selected under it. A pen would scroll the
  page as a finger does, so its `touchstart` is `preventDefault`ed on the
  layer (a finger's isn't, unless Finger is on). The pen is told by its
  `pointerdown`, which comes just before: some devices don't say "stylus"
  in the touch. Its side button is a right button (`buttons` 2) and its
  eraser end `buttons` 32 or `button` 5: both erase, also when pressed
  after it touched down, and the `contextmenu` is stopped. With Finger on,
  a finger within a second of a pen is a hand resting, and doesn't write.
  The click that follows a stroke is swallowed (`inkHook.click`) or
  it turns the page. A second finger down in a finger stroke is a pinch:
  the stroke is dropped. The eraser tests the whole way between two
  samples, or a quick pass skips a line. Strokes are kept in widths, never
  pixels, and the layer's viewBox is the page's shape, so nothing is
  stretched.
- **Pages drawn onto the wrong document:** while one page slides out and the
  next loads, the reader's frame still shows the old document, yet `held`
  (files.js) is already the new PDF or note. A `drawNear` then found the old
  document's `img[data-page]` slots, drew the new pages onto them and
  recorded them as drawn, so the new document kept blank sheets (a note made
  from a PDF opened with its first page empty, about 6 times in 10). A held PDF's
  page now carries `data-held` (its token) on `<html>`, and `drawNear` only
  draws onto a document that has it.
- **pdf.js frame:** opaque origin, so modules and workers can't load
  across origins; the app posts the library's text in and the frame makes
  its own blob: URLs. Pages draw with `intent: "print"`, because the
  screen intent waits on requestAnimationFrame, which never runs in a
  frame kept out of sight.
- **Zooming printed pages:** keep the spot by the page under the fingers
  (reader.js `pageAt`), not by the chapter's corner, and scale anything
  between pages with `--co-zoom`: a fixed gap put the spot a quarter page
  off by page 25. pdf.js draws at 2x at most, so asking for wider redraws
  the same page; and drawing wider costs about 0.5 s a page at 6x CPU, on
  the reader's own thread.
- **Native number arguments:** read them with `getData().optLong`, not
  `PluginCall.getLong`, which returns the default for a JS number that
  arrives as an Integer (every read started at byte 0).
- **`Filesystem.downloadFile` on Android ignores `recursive`:** make the
  folder first (`platform.downloadTo` does).
- **Plugin stand-ins in tests** must behave like the real plugin (offsets,
  missing folders); two shipped bugs hid behind stand-ins that were
  kinder than Android.
- **Don't set `inert` on the library:** it restyles every card (50-70 ms
  at 6x). `cover()` in `app-reader.js` does the job.
- **No transform on `#libraryView`:** a moved box makes the page wider and
  a phone grows its layout viewport, pushing the sticky bottom bar off
  screen. Move its children. Only Playwright with `isMobile: true` shows it.
- **Long clips use `content-visibility` chunks:** measuring anything
  inside a skipped chunk lays it out, so a loop over
  `getBoundingClientRect` across a book undoes the speed-up. Anything
  that finds a place in a book (`spot`, `section`) halves over it and
  judges a skipped chapter by its own box (`above`). The chunks only
  exist after the page has loaded, so while it parses `co-parsing` on
  `<html>` skips every part of the body: without it Chrome lays out the
  growing book again and again (a 47 MB book, 54 s at 6x against 7 s).
  `textContent` on a whole book is a 40 MB string; count with a walker.
- **Chrome lays nothing out past 33,554,431 px, and Android's WebView past that in device pixels** (11,184,811 CSS px on a Pixel 8 at 3x) (`reader.js guessAll, fitEnd`): a 900-chapter book guessed taller ended there, so jumps and scrolling stopped short (chapter 600 of 840 on Daniel's phone, with guesses already capped at 30,000,000 px). No fixed cap is safe, so `fitEnd` checks after each guess, before a jump and when a scroll settles that the last chunk starts below the one before it, and guesses every unseen chunk shorter until it does. `jumpTo` holds the heading in place for 1.5 s (until a touch) while the chapters around it take real heights.
- **A chunk far from the screen is content-visibility: hidden** (`reader.js lazy`, `co-far`): `auto` still keeps a chunk in the accessibility tree, and an Android WebView with anything reading it (Daniel's Pixel 8, no accessibility service on) described a 47 MB book on every tap: 5 s to open Contents, and a 4.8 s layout in a sheet's closing `focus()`. Chunks over two screens away go hidden; desktop Chrome only shows it with `--force-renderer-accessibility`.
- **A big book opens at its place first** (`reader.js slimmed`): an EPUB
  page over 2 MB is cut apart as a string at its `<section id="cN">`
  chapters; the page shows the place's chapter and the ones either side,
  the rest are empty sections (`data-co-wait`) that `fillRest` fills a
  few a turn, nearest first. A spot is a block number in the whole book,
  so which chapter it's in comes from `waypage.bookMaps` in localStorage
  (each chapter's first block, written the first time it's open whole),
  and while it fills `spot`/`toSpot` count from the first chapter in
  (`rest.base`). Never give a chapter a new height while it fills: one
  above the text moves it. Whatever needs every block waits for
  `C.reader.whole()`; the reader bar holds taps until then.
- **A row put in above others restyles all that follow** (sibling rules
  like `li + li`): a long list grows at its end, and what goes above goes
  in once (`contentsList`). Theming the reader's page on the way out
  restyled a 47 MB book, so `paintTheme` leaves the frame alone once the
  reader is closed.
- **Moving an iframe reloads it.** Wrap it where it will stay at start-up.
- **Classic scripts share one scope:** a global function can shadow a
  `window` method (`moveTo` had to become `moveInFolder`).
- **History survives a WebView reload:** entries carry the launch's mark
  and `route()` drops older ones.
- **A background page's timers run late** (about a second each): yield
  with a MessageChannel message, and keep timers that must fire (sleep)
  in the native service.
- **`display: flex` beats `[hidden]`:** a flex row that can hide needs its
  own `[hidden]` rule.
- **`.group` clips its overflow** for its corners, so a drop-down inside
  sets `menu-open` on the group while it's up.
- **Widgets (RemoteViews):** only allowed view classes inflate (a bare
  `<View>` breaks the widget), and every id the Java hides must exist in
  the layout.
- **Sync:** never write over a stale sha (on 409, merge again); settle a
  run's result without awaiting anything; update clip objects in place,
  since the open reader and menus hold them; write the waiting list before
  the base, or a cut-off run reads as deletions; a library that can't be
  reached reads as empty, so sync refuses to run; a clip that was in the
  library during a run and isn't at a settle was deleted meanwhile, and
  the settle must not put it back (`syncdelete.test.js`). A put-back
  never writes library.json itself: an old file has no tombstones and old
  versions lose the merge, so it goes in as local edits (`synchistory.test.js`).
  A page's text goes up before library.json, so two devices sending one
  edited clip at once can leave the loser's text under the winner's name;
  the merge after a 409 checks what it sent (`raced`, `syncrace.test.js`).
- **A Blob writes a string byte above 127 as two:** binary formats (the
  PDF writer) use plain ASCII strings or bytes.
- **The Settings window from 700 px:** `#settingsWin` is `display:
  contents` on a phone and a box with `contain: layout paint` above, so
  the two screens' `position: fixed; inset: 0` fill the window. Close
  the window before the section, or the section vanishes first.
- **Dragging the list/post line:** iframes take `pointer-events: none`
  while it moves (`body.resizing`), or the reader swallows the drag.
- **Volume above 1 (Allow mixing):** TextToSpeech's `KEY_PARAM_VOLUME`
  and MediaPlayer's `setVolume` stop at 1. SpeechService speaks in an
  audio session of its own (`KEY_PARAM_SESSION_ID`) and AudiobookService
  uses the player's, each with a `LoudnessEnhancer` for 1 to 2x (up to
  +6 dB). A new MediaPlayer per part means a new session: `release()`
  drops the enhancer and `applyVolume()` makes it again. iOS's
  utterance volume also stops at 1, so iPhone Narrate can't go louder.
- **iOS frameworks newer than the app's oldest iOS:** Swift links what it
  imports strongly, and a framework the phone doesn't have stops the app
  before it opens. `Translation` (iOS 17.4+) is in WaypageShare.podspec's
  `weak_frameworks`; anything else newer than iOS 15.5 imported by the
  app's plugins needs the same. The widgets are their own target, iOS 17
  and later, so AppIntents is fine there.
- **iOS Translation needs a SwiftUI view:** a `TranslationSession` only
  comes from `translationTask`, so TranslatePlugin keeps a one-point
  SwiftUI view behind the WebView and runs one job at a time in it.
- An extension's scripts are added as `<script>` tags, which can run before the shell files still being parsed after `app-extensions.js`. So the ones turned on load only at `DOMContentLoaded`: `app-abs.js` set `REMOTE_AUDIO.audiobookshelf` before `app-listen.js` had made `REMOTE_AUDIO`, threw, and streaming had nothing to play through.
- A row or box that is centred (`justify-content` or `align-items: center`) and can be wider or taller than its screen loses both ends, and the start can't be scrolled to. Use `safe center` (the Draw bar at 320 px, the app lock with a phone on its side). A column that wraps (`flex-wrap: wrap`) is as wide as its widest row, so a panel built from `.folder-actions` needs `nowrap` to stay inside a phone.
- Words written into `index.html` need `data-t` on them or a wrapper, or they stay English in Hebrew; a button with an icon wraps its word in `<span data-t>`. `i18n.test.js` checks it.

## The docs

- **CHANGELOG.md** what each version shipped, in user-facing words
- **DROPPED.md** what was decided against, and why
- **DESIGN.md** the design language
- **CONTRIBUTING.md** the rules for every change and how releases work
