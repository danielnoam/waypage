# How Waypage works

The map of the code and the flows through it, for anyone changing it.
Keep it current: when a file is added, removed or renamed, or a flow
below changes, this file changes in the same commit (`test/docs.test.js`
fails when a source file isn't named here). The rules for changes are in
CONTRIBUTING.md; why things are the way they are is in NOTES.md; the
original reasoning is in docs/PROPOSAL.md.

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
- [Notes files](#notes-files)

## The shape

Plain HTML, CSS and JS, no build step, no runtime dependencies. The same
files are served as a static site (the web copy on GitHub Pages) and
bundled as-is into Android and iOS apps by Capacitor. There is no server:
every fetch happens on the device. Saved pages are untrusted and are only
ever shown inside a sandboxed iframe.

## Layout

```
index.html          app shell: the markup for every screen, and the script tags in load order
server.js           zero-dependency static server for local work (start.cmd on Windows)
sw.js               offline cache for the web copy; its ASSETS list is also what goes into the apps
manifest.json       the web copy as an installable app
privacy.html, terms.html   the pages Google's OAuth branding links to
src/app.js          APP_VERSION, the shared helpers (el, load, store, toast), theme and state
src/app-reading.js  text size, spacing, margins, alignment, fonts (bundled and added)
src/app-cards.js    clip cards, saving cards and runs, failed saves, update and archive a clip
src/app-downloads.js  the Downloads screen and the app-update card
src/app-search.js   search, filters, sort orders, the dropdown control
src/app-draw.js     section heads, a part opened alone, the flip, Continue reading, renderLibrary
src/app-jobs.js     links out of a paste or share, the URL index, savePage, saveAll, Wi-Fi wait, runJob
src/app-reader.js   moving between screens; the reader around the page: brightness, contents, Narrate, highlights, image viewer
src/app-library.js  tags, collections, a clip's sheet, multi-select, export, import, watched folders
src/app-saving.js   sync screen, saving several, next links and new chapters, feeds, home-screen widgets
src/app-places.js   the Highlights place, the sidebar, big screens, keys, gestures, a feed's sheets
src/app-settings.js Settings (built from data; the search reads the built screens), Make room, Credits, Report a problem
src/app-lock.js     app lock: passcode (PBKDF2 hash), fingerprint or face on Android
src/app-start.js    wiring at launch, what other apps share in, self-update, Preview builds, What's new
src/save.js         link to saved page: fetch, Wikipedia adapter or Readability, allowlist cleaner, picture previews, video cards
src/reader.js       a saved page in the sandboxed iframe: place, find, highlights, translation, pages mode
src/store.js        one directory per clip and library.json; IndexedDB in a browser
src/platform.js     browser vs app: native fetch, plugins, downloads, speech, opening links
src/files.js        EPUB, Kindle (MOBI/AZW3), FB2, CBZ, Markdown, text and HTML files
src/pdf.js          PDFs through pdf.js in a locked-down frame
src/pptx.js         PowerPoint decks redrawn on a canvas and written as a PDF (1.49.0)
src/epub.js         clips as an EPUB 3 book, for e-readers and Send to Kindle
src/feeds.js        RSS, Atom and JSON Feed, read into one shape
src/sync.js         GitHub sync; src/sync-worker.js runs the merge off the main thread
src/drive.js        Google Drive backups
src/backup.js       one-file backups and exports
src/imports.js      Pocket, Instapaper, Omnivore, Raindrop, Wallabag exports
src/stats.js        reading stats and the reading pace
src/dict.js         StarDict dictionaries in IndexedDB
src/motion.js       the springs from DESIGN.md, sampled into CSS linear()
src/qr.js           QR code for sync's setup link, made on the device so the token never leaves it
src/styles.css      tokens, themes, layout (DESIGN.md)
src/reader.css      the saved page inside the reader's frame
src/fonts.css       the bundled fonts (src/fonts/)
src/vendor/         Readability, pdf.js, foliate-js's MOBI reader, each with its licence
assets/             icon and splash sources for the apps
icons/, icon.svg    app icons
native/share/       the Capacitor plugin package (Android Java, iOS Swift): share target, Files, Speech, Downloads, Feeds, Widgets, SignIn, Translate, Drive, VolumeKeys, Brightness, AppLock, PageRender, FileSave, Print, Connection, and the iOS share extension and widgets
tools/build-www.js  copies sw.js's ASSETS into www/ for the apps, writes app-build.json
tools/android-manifest.js, tools/android-version.js, tools/ios-project.js, tools/ios-extensions.rb   patch the generated native projects
tools/release.js    bumps the three version places and dates CHANGELOG.md's Unreleased entry
tools/sign-apk.sh   signs the APK with the release key in CI
tools/preview-release.sh   puts a branch's build on its preview-<branch> pre-release
tools/shots.js      retakes the README's screenshots (tools/shots/demo is the demo library)
test/               node test/run-all.js runs every *.test.js
design/             the design canvas's artboards, for the exact markup
docs/PROPOSAL.md    the original architecture, storage, legal and store reasoning
docs/shots/         the README's screenshots
.github/workflows/  test.yml (every PR), android.yml and ios.yml (builds, releases, previews), preview-cleanup.yml
```

## Load order and the one scope

`index.html` loads every script as a classic `<script>`, in the order
listed there: platform, motion, Readability, store, save, feeds, backup,
imports, dict, sync, drive, qr, stats, epub, files, pdf, reader, then the
shell (`app.js` and the `app-*.js` files). No modules, no bundler.

The area scripts (`save.js`, `reader.js`, `store.js`, ...) are IIFEs that
put one object on `window.Waypage` (`C.save`, `C.reader`, `C.store`,
`C.platform`, ...). The shell files are not IIFEs: they share **one
global scope**, as if they were one file. The rule that keeps it working:
code that runs at load may only use what an earlier file, or the same
one, declared; functions can call into any file, since nothing is tapped
before all of them have loaded. `app-start.js` is last and starts things
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
   with a User-Agent naming the app; everything else through Mozilla
   Readability.
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

## Files: EPUB, PDF, comics

`files.js` opens a person's own files: EPUB, MOBI/AZW3 (foliate-js),
FB2, CBZ, Markdown, text and HTML, either copied in as a normal clip or
read from where they are (shown under Files, not synced). PDFs go through
`pdf.js` in its own iframe with `allow-scripts` but no access to the app
(`src/pdf.js` is the bridge, `src/vendor/pdf.min.mjs` and its worker the library); large
linked PDFs are read in ranges.

## Browser versus app

`platform.js` is the only file that asks where it runs. It exposes the
native plugins (`C.platform.plugin("Name")`), native fetch and downloads,
speech, opening links outside, and the connection state; in a browser
each has its nearest equivalent or returns null, and features check for
null rather than for a platform. The native plugins live in
`native/share/` and are built into the apps by the workflows; nothing in
`src/` imports them.

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
- Files read from outside (`link` on the entry) are this device's alone:
  neither sync nor any backup takes them, and a restore skips them.
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
  `tools/android-version.js`), builds an APK on every push to any
  branch, signs it with the release key (secrets
  `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, alias `carryon`)
  and publishes the release `app-v<version>` when `APP_VERSION` is new.
  Without the secrets it builds a test APK and publishes nothing.
- **Previews (1.48.0):** on any other branch with an open pull request,
  `tools/preview-release.sh` remakes the pre-release `preview-<branch>`
  at the pushed commit with the APK (and the iOS workflow adds the IPA).
  Its notes start with `version:`, `branch:`, `commit:`, `pr:`, which
  Settings › About › Preview builds (`app-start.js`) reads from the
  public releases list to offer the build; `app-build.json` carries the
  branch and commit, so a preview build knows it is one and skips the
  update check. A pre-release is never GitHub's "latest", so the
  updater ignores it. `preview-cleanup.yml` removes the pre-release when
  the branch or its pull request closes. Android installs an equal
  version code over the app, so the release goes back over a preview
  only when the branch didn't bump `APP_VERSION`.
- **iOS:** `.github/workflows/ios.yml` builds an unsigned `Waypage.ipa`
  on a Mac runner (`tools/ios-project.js`, `tools/ios-extensions.rb` add
  the share extension and widgets) and attaches it to the same release.
  Install it with AltStore or SideStore.
- **Locally:** `npm install`, `npm run android:sync`, then open `android/`
  in Android Studio. `android/`, `ios/` and `www/` are generated and
  ignored by git.

## Tests and screenshots

`node test/run-all.js` runs every `test/*.test.js` in its own process.
`ui.test.js` and `drive.test.js` drive the app in Chromium with
Playwright and skip when it isn't installed; `build.test.js` checks the
bundle, the three version places and CHANGELOG.md; `contrast.test.js`
checks every theme for WCAG AA; `docs.test.js` checks this file names
every source file; `save.test.js`, `files.test.js`, `imports.test.js`,
`sync.test.js`, `syncbatch.test.js` and `pptx.test.js` test their areas in Node. The Tests workflow runs them all on every PR.

`node tools/shots.js` retakes the README's pictures at 1280 px and 390 px
into `docs/shots/`, from a demo library it saves through the app itself
(`tools/shots/demo/`). `node tools/shots.js reader skim` retakes only
those sections.

## Notes files

- **TODO.md** the work still to do, and only that
- **DONE.md** what the app already does, by area, with versions
- **NOTES.md** why things are the way they are, newest first
- **DROPPED.md** what was decided against, and why
- **CHANGELOG.md** what each version shipped
- **DESIGN.md** the design language
- **CONTRIBUTING.md** the rules for every change and how releases work
