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
- [Browser versus app](#browser-versus-app)
- [Sync and backups](#sync-and-backups)
- [Versions, cache and updates](#versions-cache-and-updates)
- [The phone apps](#the-phone-apps)
- [Tests and screenshots](#tests-and-screenshots)
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
src/app-discover.js the Discover place: Wikipedia today, the list, its search, the Sites grid (stories, books, texts), the story and sign-up sheets
src/app-settings.js Settings (built from data; the search reads the built screens), Make room, Credits, Report a problem
src/app-listen.js   audiobooks: bringing one in, the player and its bar, reading along, transcripts written ahead, fixes, Find the book in Discover, Settings › Audiobooks
src/app-lock.js     app lock: passcode (PBKDF2 hash), fingerprint or face on Android
src/app-car.js      Android Auto: the list the car starts from (books, clips cut for Narrate) and where the car got to
src/app-start.js    wiring at launch, what other apps share in, self-update, Test builds, What's new
src/save.js         link to saved page: fetch, Wikipedia adapter or Readability, allowlist cleaner, picture previews, video cards
src/reader.js       a saved page in the sandboxed iframe: place, find, highlights, translation, pages mode
src/store.js        one directory per clip and library.json; IndexedDB in a browser
src/platform.js     browser vs app: native fetch, plugins, downloads, speech, opening links
src/files.js        EPUB, Kindle (MOBI/AZW3), FB2, CBZ, Markdown, text and HTML files
src/listen.js       audiobooks' pure parts: chapters from M4B and MP3 tags, transcripts as paragraphs, fixes, heard words matched to a book's, EPUB Media Overlays
src/pdf.js          PDFs through pdf.js in a locked-down frame
src/ink.js          drawing over a clip's blocks or a PDF's pages: strokes, layers, undo, what a copy of the PDF is given
src/notes.js        notes: sheets of paper you draw on, opened through the PDF pages pipeline with a stand-in document; any clip laid out as a PDF to make one
src/pptx.js         PowerPoint decks redrawn on a canvas and written as a PDF (1.49.0)
src/epub.js         clips as an EPUB 3 book, for e-readers and Send to Kindle
src/feeds.js        RSS, Atom and JSON Feed, read into one shape
src/discover.js     Discover's sources: the hand-picked list, Wikipedia today, and the sites' lists and search (Royal Road, AO3, FanFiction.net, FictionPress, Scribble Hub, Wattpad, WEBTOON, Tapas, SpaceBattles, Sufficient Velocity; books from Project Gutenberg via Gutendex and Standard Ebooks; Wikisource)
src/discover-list.js  the hand-picked list itself (strict JSON between markers, refreshed from GitHub)
src/sync.js         GitHub sync; src/sync-worker.js runs the merge off the main thread
src/drive.js        Google Drive backups
src/backup.js       one-file backups and exports
src/imports.js      Pocket, Instapaper, Omnivore, Raindrop, Wallabag exports
src/stats.js        reading stats and the reading pace
src/activity.js     Share reading activity: builds activity/reading.json (docs/reading-activity.md)
src/dict.js         StarDict dictionaries in IndexedDB
src/motion.js       the springs from DESIGN.md, sampled into CSS linear()
src/qr.js           QR code for sync's setup link, made on the device so the token never leaves it
src/styles.css      tokens, themes, layout (DESIGN.md)
src/reader.css      the saved page inside the reader's frame
src/fonts.css       the bundled fonts (src/fonts/)
src/vendor/         Readability, pdf.js, foliate-js's MOBI reader, each with its licence
assets/             icon and splash sources for the apps
icons/, icon.svg    app icons
worker/             the web copy's fetch proxy, a Cloudflare Worker (worker.js, wrangler.toml, README.md has the setup)
native/share/       the Capacitor plugin package (Android Java, iOS Swift): share target, Files, Speech, Downloads, Feeds, Widgets, SignIn, Translate, Drive, VolumeKeys, Pen, Brightness, AppLock, Kokoro (voices for Narrate, with the com/k2fsa/sherpa/onnx mirror of sherpa-onnx's JNI classes), Audiobook (AudiobookService plays with the screen off; Listen writes transcripts with sherpa-onnx's offline recognizer), Car (Android Auto: CarService, Car's one shared media session), PageRender, FileSave, Print, Connection, and the iOS share extension and widgets
tools/build-www.js  copies sw.js's ASSETS into www/ for the apps, writes app-build.json
tools/android-manifest.js, tools/android-version.js, tools/ios-project.js, tools/ios-extensions.rb   patch the generated native projects
tools/release.js    bumps the three version places and dates CHANGELOG.md's Unreleased entry
tools/sign-apk.sh   signs the APK with the release key in CI
tools/sherpa-lib.sh   fetches sherpa-onnx's arm64 library (Kokoro voices) into the Android build, pinned and checked
tools/test-build.sh        puts a labelled pull request's build on its test-<branch> pre-release
tools/shots.js      retakes the README's screenshots (tools/shots/demo is the demo library)
tools/check-discover.js  checks every feed, sign-up and serial in Discover's list still answers (weekly, discover-check.yml)
test/               node test/run-all.js runs every *.test.js
design/             the design canvas's artboards, for the exact markup
docs/PROPOSAL.md    the original architecture, storage, legal and store reasoning
docs/shots/         the README's screenshots
.github/workflows/  test.yml (every PR), android.yml and ios.yml (builds, releases, test builds), test-builds.yml (test labels: build on, remove off), worker.yml (deploys worker/ to Cloudflare), discover-check.yml (Discover's list, weekly)
```

## Load order and the one scope

`index.html` loads every script as a classic `<script>`, in the order
listed there: platform, motion, Readability, store, save, feeds, backup,
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
linked PDFs are read in ranges.

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
at most 100 MB), one sheet to a page, and moves the PDF's old drawings over.
Opening a PDF asks Keep a copy, Read from where it is or Make a note too
(`noteFromFile`, `fileSheet`), in a browser as well; the library's Show has
All notes (`filter "notes"`) while a note exists.
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
  can sync only places.
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
  saving jobs.

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

## The phone apps

- **Android:** `.github/workflows/android.yml` generates the Capacitor
  project, patches it (`tools/android-manifest.js`,
  `tools/android-version.js`), builds an APK on every push to `main`
  (a branch only with a test label), signs it with the release key (secrets
  `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, alias `carryon`)
  and publishes the release `app-v<version>` when `APP_VERSION` is new.
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
`ui.test.js`, `drive.test.js`, `sites.test.js` and `discover.test.js`
drive the app in Chromium with Playwright and skip when it isn't installed
(`sites.test.js` saves the discussion and code sites from their answers
saved in `test/fixtures/sites/`, with nothing going out; `discover.test.js`
reads the story sites' lists from hand-made pages and pages cut from WEBTOON, Tapas and Wattpad in `test/fixtures/discover/`); `build.test.js` checks the
bundle, the three version places and CHANGELOG.md; `contrast.test.js`
checks every theme for WCAG AA; `docs.test.js` checks this file names
every source file (and `build.test.js` that no two shell files share
a top-level name); `save.test.js`, `files.test.js`, `imports.test.js`,
`sync.test.js`, `syncbatch.test.js`, `syncdelete.test.js`, `syncrace.test.js`, `activity.test.js`, `pptx.test.js`, `ink.test.js` and `listen.test.js` test their areas in Node; `worker.test.js` runs the fetch proxy against a faked web. The Tests workflow runs them all on every PR; a PR that only
changes Markdown runs just `build.test.js` and `docs.test.js`.

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
of a zip by fd offset for an EPUB's narration); a browser uses <audio>.

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

## Android Auto

Android Auto lists Waypage through `CarService` (a framework
MediaBrowserService, no androidx) and `automotive_app_desc` in the
plugin's manifest. Narrate and audiobooks share one MediaSession
(`Car.session`, never released): the car binds to one token, so each
player only says it's the one playing (`Car.playing`) and hands it back
when it stops (`Car.idle`). The car's tabs are Continue, Audiobooks and
Up next; an audiobook's chapters are the session's queue. Custom
actions add next and previous clip (`SpeechService.clip`: the clip the
app queued, else `Car.neighbour` under Up next) and next and previous
chapter or file (`AudiobookService.chapter`). A clip the car jumps to
that the app didn't queue isn't followed by the open app's player.

The car starts things with the app closed, so the WebView can't help.
`app-car.js` writes `car.json` (CarPlugin) when the app is put away and
a little after it opens, if anything changed: up to 40 books with their
parts, chapters and place, and the 10 latest unfinished clips with their
text already cut into Narrate's pieces, voice, engine and speed. A job
the car started is marked `car`; where it got to goes into
SharedPreferences (`Car.heardBook`, `Car.heardClip`) and `carPlaces`
takes it back into the library when the app opens. A clip's place there
is its share of the text, so it lands near, not on, the sentence.

## Trade-offs

What the app gives up on purpose, said plainly. A change that adds one
adds a line here.

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
  can use it too. 32-bit and x86 phones, iOS and the web copy get none.
  Piper voices (one per language) are more downloads for the same engine
  and library; one model is in memory at a time, so switching between a
  Kokoro and a Piper language reloads (a second or two).
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

## Traps

Things that broke once and would again. Check here before touching the
area.

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
  "ux" (`MOSAIC_FILE`); own pictures start with a base-36 time ("um…"
  until the 2050s). Change how either is named and the Cover choices
  show the wrong one as picked.
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
  `getBoundingClientRect` across a book undoes the speed-up.
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
  the settle must not put it back (`syncdelete.test.js`).
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

## The docs

- **CHANGELOG.md** what each version shipped, in user-facing words
- **DROPPED.md** what was decided against, and why
- **DESIGN.md** the design language
- **CONTRIBUTING.md** the rules for every change and how releases work
