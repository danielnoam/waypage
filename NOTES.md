# Notes

Why things are the way they are, newest first. Each entry starts with a
bold title and its version so a search finds it.

## Rules every release keeps

Moved here from TODO.md (11 Oct 2026), which now lists only open work.

- A page has **any number of tags** and is in **one folder at most**.
- A folder is an **ordered set**: a name on the page (`folder`) plus its
  place (`folderAt`), no separate folders file. Reordering rewrites
  `folderAt`; a folder exists while a page names it.
- Saved HTML stays untrusted: sandboxed iframe, no `allow-scripts`, strict
  CSP. Anything new that renders saved content keeps to that.
- No build step, no dependencies. Anything that looks like it needs a
  library is written small in src/, or is a native plugin in native/.

## Entries

- **App lock (1.38.0).** Daniel's design: a passcode first, fingerprint
  or face only on top of it; a forgotten passcode resets everything,
  sync brings it back; the lock is per device. The passcode is kept as
  PBKDF2-SHA256 (210,000 rounds, its own 16-byte salt) in localStorage
  `waypage.lock`, with its length so the keypad checks as soon as it's
  typed; it never syncs or goes in a backup. Fingerprint or face is
  Android's BiometricPrompt with BIOMETRIC_WEAK (most face unlock is
  "weak"), through native/share's AppLock plugin; iOS's Face ID is on
  the iOS list. Trade-off, said plainly in Settings: it is a gate, not
  encryption. The clips are in the app's private storage (or the folder
  picked), so it keeps out someone holding the unlocked phone, not
  someone with the files, root, or the browser's developer tools on the
  web copy. Encrypting the library would mean every read and write,
  pictures served from disk, search and sync going through a key: not
  done. `html.locked` (platform.js, the first script) hides the page
  before the library draws; a capture-phase keydown keeps shortcuts from
  reaching the app under the keypad. Erasing removes the clip copies,
  fonts, the index, every `waypage.*` key (only those: the web copy
  shares danielnoam.github.io's storage) and the browser's IndexedDB,
  tells the native feed checks there's nothing to watch, and reloads.
  Android 13+ `setRecentsScreenshotEnabled(false)` hides the recent
  apps card without blocking screenshots; FLAG_SECURE would block both,
  so older Android shows the card.

- **Reading stats (1.38.0).** Collected now, shown later (Daniel). In
  localStorage `waypage.stats`, by day (local date) and by clip id:
  readMs, words, aloudMs, opened, finished, saved; a clip also keeps
  `far` (furthest place) and `last`. Reading counts while the clip is
  on screen, up to 2 minutes after the last scroll, turn or tap. Words
  are the furthest place's advance times the clip's length (its minutes
  times 230); a move of more than 1,500 words is a jump and doesn't
  count. Read aloud counts while playing, but only up to 3 minutes past
  the last paragraph the app heard, so a pause that reaches a sleeping
  phone late doesn't count the night. Saved again or updated, a clip's
  numbers move to its new id (`stats.moved`, kept as `moved` so other
  devices' counts under the old id follow).

- **Reading stats shown and synced (1.39.0).** Each device has a random
  id (`waypage.statsDevice`) and only ever writes its own count, to
  `stats/<id>.json` in the waypage-data repo, at the end of a sync and
  only when it changed; the others' files come down when their sha
  changed (`waypage.syncStats`) and sit in `waypage.statsOthers`. The
  totals add them up, so there's no merge and nothing counts twice;
  clips finished are counted from each clip's earliest `finished`, once
  however many devices finished it. A Drive or file backup carries
  `stats.json`, this device's and the others it knows; restoring takes
  them as other devices (an erased device gets a new id), never this
  device's own. A stats failure never fails a sync. Days also keep
  time by clip (`days[k].clips`) for "Most time", from 1.39.0 on.
  Privacy: the stats say when and how long you read each clip. They
  stay on the device unless GitHub sync or a backup is on, and then go
  only to your own private repo or your own Drive, like the library.
- **Places and reading time only on mobile data (1.40.0).** A light
  run of `once()`: library.json is read and merged as usual, then only
  the reading fields (`placeOnly`, with the spot when both have the same
  version) come onto the clips here and go onto the clips GitHub has;
  the written library.json is GitHub's own with those fields changed, so
  a clip saved here never shows up elsewhere without its text (the other
  device would save it again from its link). Then the stats files. The
  base, the sent list and the waiting list are not touched, so the next
  full sync on Wi-Fi merges as if the light ones never ran. Costs: one
  library.json read and write (a few hundred KB on a big library), not
  free on data, but far less than clip texts.
- **A place comes over onto another version (1.39.1).** Sync takes a
  clip's whole entry from GitHub only when this device has the same
  version (`ver`, savedAt or editedAt) or brings the text down. A clip
  saved again or edited on one device, with that text not on GitHub (a
  links-only device, a send still to come, a download that failed), was
  left alone here, place and all: Daniel saw Continue reading and his
  collection's finished chapters behind on the web copy. Now
  `placeOnly` moves at, finished, readAt, readOn and placeAt over onto
  this copy; the spot is dropped when the place changed, since it names
  a paragraph of the other text.
- **The Reading place and widgets (1.39.0).** A week starts on the day
  `Intl.Locale` says (Sunday in Israel), Monday when it can't tell. A
  day counts towards days in a row with a minute read or heard. The
  widgets get the lines worked out by the app for the day it handed
  them over; drawn on a later day with the app closed, Today says
  nothing yet and Days in a row holds only if yesterday was read. The
  week's bars are a bitmap drawn in Widgets.bars, sized from the
  widget's width.

- **Update from the site (1.38.0).** Uses the Save again path (a new id
  in the old one's place, keeping tags, collection, place and
  highlights). New: the reading spot's paragraph is read from the old
  copy as words (`reader.spotWords`) and kept on the clip as
  `spotWords`; the next open finds that paragraph in the new copy
  (`respot`, nearest match to the old index) before going to the spot,
  else the fraction decides. Highlights already find their words again
  when blocks move (1.7.0); ones whose words are gone stay listed under
  Highlights, and the toast says how many. "Nothing changed" compares
  the text outside the clip's header and licence line.

- **Linked pages (1.38.0).** `reader.links(own)`: every http(s) link in
  the clip once, without its #part, leaving out the clip itself, its
  next and previous links, links within it and a wiki's own pages
  (Special:, File:, Talk: and the like). Saving goes through saveAll
  with "skip saved", like a pasted list; offline they wait in Downloads.

- **Moon and percent on a phone (1.37.1).** While reading aloud the
  player stays centred and the moon hangs off its right, so the moon
  shares the right half with the percent. Under 520 px the bar's gap and
  side padding shrink to fit "30m" beside "100%" at 360 px (5 px spare).
  Below 360 px, narrower than current phones, the percent hides while the
  timer runs.

- **Sleep timer on the player (1.36.0).** Daniel found the Aa dropdown
  cut off and too many taps away. The moon on the player steps through
  the choices; SpeechService now keeps `sleepAt` and tells the app by a
  "sleep" event when the lock screen's Sleep 15 min sets it or it runs
  out, so the moon stays right. Sleep 15 min is both a notification
  action (older Android) and a PlaybackState custom action, which is
  what Android 13+ shows on its media controls. It resumes a paused
  reading, since that's when it's pressed half asleep.

- **Big PDFs by range (1.35.0).** A linked PDF over 32 MB is opened in
  the pdf.js sandbox with a `PDFDataRangeTransport`: the first 1 MB goes
  with the open, and pdf.js asks for 512 KB stretches by message
  (`range`, tagged with the open's `tid` so a late answer for the PDF
  before is ignored); the app reads them with `blob.slice` (a File on a
  computer, FilesPlugin `read` by offset on Android). Smaller PDFs are
  still sent whole, which is faster. On Android a file of 32 to 64 MB is
  still read whole by platform.files' cache (KEEP), so the saving there
  is the sandbox's copy only. Adding a linked PDF still reads it whole
  once, for its words.

- **Send to Waypage (1.34.0).** A bookmarklet in a computer's browser
  opens the web copy at `#send`, waits for it to post `{waypage:"ready"}`
  back, then sends `{url, title, html}` (the live DOM's outerHTML) to the
  web copy's origin only. The web copy hears only `window.opener`,
  requires the page's claimed address to have the sender's origin (so a
  site can't pose as another), caps it at 20 MB, and keeps nothing until
  Save is pressed: any site could open Waypage at `#send`, so the press
  is the user's consent. The HTML goes through the same untrusted path
  as a fetched page (readArticle, rebuild, sandboxed frame), saved as
  that one page (no contents-page split, since a computer can't fetch
  the chapters). Wikipedia still goes through its REST API (CORS allows
  it). Pictures stay links, as for any clip saved on a computer. Left
  open: sites with `Cross-Origin-Opener-Policy` cut the window off from
  its opener, so nothing arrives; the web copy says so. The `ready` reply
  goes to `*`, but it carries nothing.

- **Your own fonts and speech engines (1.33.0).** A font is kept as a
  file in the library's `fonts/` (IndexedDB in a browser), checked for a
  font's first four bytes and a FontFace load before it's kept, and
  never synced or backed up (licences, and it's per device). The reader
  frame runs no scripts and its CSP allows fonts only from the app, so
  the app makes each face from the bytes with the frame's own FontFace
  (`fontsInto`, from applyTheme): nothing is fetched and the CSP stays
  as it was. Font names are cached in `waypage.userFonts` so a picked
  font isn't reset before the files load. Speech engines: SpeechPlugin
  lists `getEngines()`, voices and SpeechService start the picked engine
  (`new TextToSpeech(ctx, l, engine)`), and an engine that won't start
  falls back to the default. Voices are kept per engine and language
  (`engine|lang` in waypage.aloudVoice).

- **Sleep timer, volume buttons, dim pictures, Before you go offline,
  OPML (1.32.0).** The sleep timer pauses rather than stops, so Play goes
  on where you dozed off. On Android SpeechService keeps the time
  (`sleep` posts a pause on its own handler) because a WebView put away
  runs timers late; elsewhere the page keeps it, and it isn't stored.
  "End of this clip" just turns Go on off for this reading (no queue).
  Volume buttons wrap the activity window's `Window.Callback` in a
  `Proxy` from VolumeKeysPlugin, so MainActivity (generated in CI)
  needs nothing; the keys are only taken while the reader shows Pages,
  the switch is on and nothing reads aloud, so the volume works the rest
  of the time. Pictures dim with `filter: brightness(0.8) contrast(1.05)`
  in the frame, keyed on `data-co-dim`; comics and PDF pages are the
  page, so stay full. OPML feeds come in as "show", never "save", so an
  import never starts dozens of downloads; feed URLs must be http(s).

- **The reading line and placeAt (1.31.0).** Daniel asked for the place to
  be the line across the middle of the reader. A spot is "block/pct" on
  that line with a `c` after it; spots without the `c` are from the top
  edge (bar + 8 px) and toSpot still restores them there. Pages keeps
  "block/0", the first block on the page. `placeAt` is when the place
  last moved (notePosition only); sync merges at/spot/finished/placeAt by
  it (`placeAt || readAt`) and readAt/readOn by readAt, because the 3 s
  open stamp on readAt let a device that opened a clip at an old place
  send that place everywhere. A newer place sync brings for the open
  clip is jumped to only until the clip is moved here (`movedHere`).
  1.36.1, after Daniel saw the text pulled back up as a sync finished
  while he read on: `placesFirst` marked every clip it settled as seen,
  even one whose place changed here since the sync's `before`, so the
  final settle put the merged (start-of-sync) place over it. Now only the
  clips that took the early place are marked seen. The follow is also
  narrowed: within FOLLOW_MS (15 s) of opening, before any scroll past
  the restore (`reader.touched()`), and only when sync raised placeTime.
  `reader.settle()` tells a scroll that stopped under 150 ms ago, before
  a close, Read next, the app hiding, or the next open; without it the
  place written was the one before that scroll.

- **Old sync tokens (1.30.1).** GitHub doesn't say what a token can
  reach, so a config without `scoped` (set by connect from 1.30.1) counts
  as made under the old All-repositories steps. The swap reuses connect,
  which keeps Links only and starts the next sync from a full merge.
- **Pictures on tap (1.30.1).** The reader's CSP still allows https:
  so a tapped picture loads in place; with the switch on, reader.js's
  srcdoc moves each https `src` to `data-full` with `co-missing`, so
  nothing in the clip points at the web until a placeholder is tapped
  (`loadHeld`). Previews still go to the viewer at full size on a tap.
  Off by default: full pictures online is the saving design.

- **Notifications setting (1.30.0).** Daniel asked for a way to turn
  notifications off and for feed posts to come one by one, showing what's
  in the feed, with the one grouped notification kept as an option. The
  setting is this phone's own (`waypage.notes`: `on`, `posts` "each" or
  "together", `quiet` feed urls), not synced, and reaches the background
  check through `Feeds.watch`'s `notes` (Android preferences "notes", iOS
  feeds-notes.json). The check now reads each new post's title, summary
  (description/summary, else the full text, as plain words, 300
  characters) and link. Only posts found in that run are posted on their
  own, at most five a feed, the rest counted in the feed's group (Android)
  or one "N more" (iOS), so a swiped-away post never comes back. Save opens
  the app with the feed and link (`news().save`), which saves it like a
  feed post, into the feed's collection with its pictures setting. A
  quiet feed is still checked, so the widget and Feeds still know.
  Saving, sync and Read aloud keep their running notifications: Android
  needs them for a foreground service, so the switch can't hide those,
  and the page says so.
- **Privacy and security checkup (1.29.1).** Daniel asked that our data
  and the user's be private and secure. Checked: saved HTML (allowlist
  rebuild in save.js, reader frame without allow-scripts, CSP), the PDF
  sandbox, native plugins (no JavaScript bridges on the hidden browsers,
  no exported components but the widget picker), backups (no tokens in
  them), the report log, Drive's OAuth, CI secrets. Fixed: the sync
  token was "All repositories" with Contents and Administration write,
  never expiring, kept in the WebView's storage and shown as a QR code;
  leaked, it could push to danielnoam/waypage itself and so into every
  update. Now the repo is made first and the token is for it alone with
  Contents only; adoptOld's rename works only for older tokens, and falls
  back to the old name without it. Also: openOutside refuses non-web
  schemes, email trackers (pictures 3 px or less, or hidden) are dropped
  on import, the log cuts token-shaped strings, checkout doesn't persist
  the job token, @capacitor/assets pinned to 3.0.5. Left as they are,
  with reasons: remote pictures load when a clip is opened online (by
  design: previews offline, full online; the image host sees the visit);
  Android Auto Backup stays on (Google's backup is end-to-end encrypted
  with the screen lock, and it carries the library across phones); the
  web copy shares danielnoam.github.io's storage with every other Pages
  site on the account, so its sync token is as safe as the least safe of
  them (a custom domain would separate it); the waypage-data repo isn't
  encrypted, it's private on GitHub.

- **Long clips lay out as they're reached (1.29.0).** Daniel asked how
  EPUBs and PDFs could open much faster. Measured (Playwright, 390px,
  6x throttling; a generator for a 400-chapter EPUB, an 800-page text
  PDF and a 200-page scan, with the perf script, in the session's
  scratch folder, not the repo): the text-only big EPUB took 12.8 to
  22.7 s to its place, nearly all of it layout of the whole 3 MB page,
  twice (parse, then `fonts.ready` with Source Serif in), the same book
  with 120 pictures read from its file 17.7 to 33.1 s, the 800-page PDF
  as text 7 s. Every other reader (Readium, epub.js, KOReader, Apple
  Books) shows one chapter at a time and takes its position from byte
  counts; Waypage renders the whole book as one document, which is what
  makes search, highlights and read aloud simple. The fix keeps the one
  document: `chunkUp` in reader.js gives each chapter `<section>` (or
  each run of 24 blocks in a flat clip such as a PDF's words)
  `content-visibility: auto` with `contain-intrinsic-block-size: auto
  <guess>`, past LONG = 150,000 characters. The guess is the chunk's
  characters at the rate the chunk on screen takes (`guessHeights`,
  redone on applyTheme) plus a screen's width per picture; Chrome's
  scroll anchoring keeps the place as guesses correct themselves, and
  the spot (anchor index) is what the place is kept by anyway. Pages
  mode turns it off (`lazy(false)`): columns need the whole book. After:
  3.0 to 3.6 s for the text-only book, 3.2 s with pictures, 2.4 s the
  PDF; what's left is parsing the 3 MB (2 s at 6x).
  - Measuring any element inside a skipped chunk lays that chunk out,
    so `spot()` halves its way to the first anchor past the top instead
    of walking from the start (which laid out every chapter before the
    place), and `fillNear` measures the chunk, not the slot, unless the
    chunk is within reach. A loop over `getBoundingClientRect` of
    everything in a book undoes the whole gain: it took the linked book
    back to 8 s before this.
  - `loading="lazy"` on a long clip's pictures did nothing for blob:
    pictures already in the page (Chrome fetched and decoded all 120),
    so linked books keep their slots and `fillNear` reads each from the
    zip as it comes within a screen and a half, letting go six screens
    away, the way `drawNear` draws PDF pages. Slots get width/height
    from the file's header (`imageSize`) at import so a comic's pages
    don't all sit at one spot; older comics' unsized slots get a 2:3
    aspect in reader.css. The lazy attribute stays for copied clips,
    where the pictures are files on disk.
  - pdf.js itself is quick (getDocument 80 ms at 1x for 800 pages); the
    1 to 2 s in `pdf.open` at 6x is the sandbox booting, which `warm()`
    does at launch when the library has a PDF. Opening now waits for the
    first drawn page (`drawNear(frame, onFirst)`), not the screen and a
    half: 1.5 s less spinner on a printed PDF.
  - `readPage` fetches page.html from the WebView's file server when the
    data URL is known (`cache: "no-store"`, since Edit clips rewrites
    pages), with the bridge as the fallback, like `readIndex`.
- **Every screen measured with 3000 clips (1.28.4).** Daniel asked for
  the app.js split first; that was done in 1.14.0 (seven app-*.js
  files), so this went to measuring instead (/tmp/claude-0/sp/perf.js,
  perf2.js, prof2.js at 6x throttling). Found: a search keystroke 1.8 s
  of long tasks, because `drawUpTo` kept its scrolled-to size and the
  search redrew up to 500 cards a letter; Highlights 1.8 s drawing 2250
  rows; back to the library 0.6 s in libSnap measuring every card
  below the screen (the library was hidden, so every rect was empty and
  the 120 cap never hit). Fixes: `drawnList` key (query, filter, sort,
  part, place, layout) resets `drawUpTo`; Highlights pages 25 clips then
  40 with its own sentinel (`marksUpTo`, `marksList`); libSnap returns
  when #library is hidden and breaks at the first card past the bottom
  (strip tiles aside). After: search 0.3 s, Highlights 0, back 0.1 s.
  Sidebar (0.09 s), collection (0.19 s), settings, downloads, sheet and
  the reader (0.07 s) were already under a frame or two at 6x.
- **NEXT_SCREENS 150 -> 60 (1.28.4).** A pass is mostly DOM building
  (el, setAttribute, insertBefore), so a smaller pass is a shorter task
  while scrolling; the 1500px margin keeps the end out of reach.

- **The rest of the library draws on scroll (1.28.3).** The 150-a-pass
  `setTimeout(0)` chain after the first screen (1.7.1) re-ran the whole
  renderLibrary each pass: with 3000 clips at 6x throttling that was
  2.9 s of long tasks after open (the last ending 3.3 s in), and a tap
  in them hung. Now `drawUpTo` applies to every render, a `.lib-more`
  sentinel after the cards is watched by an IntersectionObserver
  (rootMargin 1200px) and each hit adds NEXT_SCREENS. After: 0.5 s busy,
  last long task ends at 0.8 s. `growing` skips the FLIP snapshot on
  those passes. `drawUpTo` never shrinks, so a filter or a return from a
  screen keeps what was drawn. Measured with /tmp/claude-0/sp/start.js
  (long tasks after reload) and start2.js (per-function times).
- **readIndex fetches library.json (1.28.3).** With a backend `base()`
  URL (`_capacitor_file_` or `_waypage_folder_`) the index is fetched
  with `cache: "no-store"` and parsed by `res.json()`; the bridge
  `readFile` is the fallback. The service worker isn't registered in the
  app, so nothing caches that fetch. In a browser the IndexedDB path is
  unchanged.
- **Start line under Report a problem (1.28.3).** Daniel asked for it
  there; the report text already carried the last five starts.

- **No more `inert` on the library (1.28.2).** Measured at 6x CPU
  throttling with 300 cards: `libraryView.inert = true` cost 50-70 ms
  (an inherited flag restyles every card; `pointer-events: none` costs
  about the same), and it ran on every push, pop, sheet and sidebar.
  `cover(node, on)` in app-reader.js sets `data-covered` and
  `aria-hidden` (1 ms); a `focusin` listener sends focus that lands in
  a covered screen to the topmost open one. Pointer isolation was never
  from inert: a screen, catch or sheet always covers the one below.
  After the change the remaining long tasks are paint.
- **`state.part` starts null (1.28.2).** It was undefined, so `route()`
  saw `null !== undefined` on the first Back and ran `changePart(null)`:
  a full renderLibrary plus FLIP.
- **Watched folder collection on each look (1.28.2).** `w.intoAt` is
  set when a collection is picked (or on the first look for a 1.28.0
  pick); lookInOne moves the folder's pages whose `folderAt` is older
  than it. So a file moved by hand after the pick stays.
- Perf scripts used: /tmp/claude-0/sp/perf.js (long tasks per step),
  trace.js (devtools.timeline sums), inert.js (toggle costs). Not in
  the repo.

- **Watched folder collection moves what's there (1.28.1).** A collection
  exists only as `folder` on its pages, so `w.into` alone made nothing
  appear. `watchIntoPick`'s set now re-files every page with
  `watched === w.tree`: into `w.into`, or back to its subfolder from
  `file.path`. This overrides a collection someone picked by hand for a
  watched file.

- **Sync screen (1.28.0).** `#syncView` is a screen like Downloads (a
  panel under its button on a wide screen). `renderSyncPage` in
  app-saving.js rebuilds it when `syncPageSig()` changes; paintSync runs
  with every paintDownloads, so it follows sync and Drive progress. A
  backup's card (`driveCard`) is there; Downloads keeps only a restore's.
  The bar's ring counts only a restore; a backup still gets the app's
  notification while nothing downloads. The sync button shows when
  GitHub sync or Drive is on.
- **Screens opened from Settings (1.28.0).** Downloads sits before
  Settings in the page, so pushing it while Settings was up put it
  underneath. openDownloads and openSyncPage go back to the library
  first (`toLibrary`) when Settings, What's new or the other one is up.
- **Older PDFs' bookmarks (1.28.0).** The pdf.js frame answers an
  "outline" job for the PDF it holds open; fillPdf marks the page slots
  when the clip has no `data-toc`. Copied clips from before 1.27.2 have
  no file to read, so they need adding again.
- **Watched folder collection (1.28.0).** `w.into` on the watch, set from
  the dropdown under its row; lookInOne uses it before the subfolder's
  name. It applies to files added from then on.

- **Book contents (1.27.2).** The reader built Contents only from h2/h3,
  so books whose chapters are styled paragraphs had none. `fromEpub` now
  reads the EPUB 3 nav (else the NCX) and puts `data-toc` (depth 1-3)
  and `data-toc-t` (its title) on each target; `fromPdf` does the same
  from pdf.js's outline, with `data-toc-p` for the page. The reader uses
  `[data-toc]` when there are at least 2, else headings. cleanSaved
  keeps both attributes, since it runs again over the whole book. Older
  linked EPUBs are marked when opened (`epubMarks`); if the file can't
  be read the book opens as before.
- **Show in folder (1.27.2).** `FilesPlugin.reveal` finds the parent
  folder with `findDocumentPath` (from the watched tree when there is
  one), else the docId's parent path, else the watched tree's root, and
  opens it with ACTION_VIEW and the directory MIME type. Where nothing
  browses a folder, the picker opened at that folder shows the same. If
  that fails too, a toast says the path. Copied clips have no folder.

- **Watched folder names (1.27.1).** `pickedFolder` named the folder from
  the tree URI's last segment. That's a path for the phone's storage, but
  an opaque id (`acc=1;doc=encoded=…`) for Google Drive. It now asks the
  provider for the root document's DISPLAY_NAME. `folderScan` returns it
  too, so a folder saved under the id is renamed on its next look.
- **Drive Pause and Stop (1.27.1).**
  - Android's upload is now `session` plus `send`. `send` first asks
    Drive how far it got (`Content-Range: bytes */N`, 308 with
    `Range`), then sends the rest. Pause calls `cancel()`, which drops
    the connection, and keeps the session URL in `ctl`. Resume sends
    on.
  - The browser's multipart XHR is aborted on Pause and sent whole
    again on Resume. If Drive had all of it before the abort, the
    backup can land twice; pruning to 3 covers that.
  - Packing pauses between clips (`exportLibrary`'s new `gate`).
  - A restore stops only while downloading. Once `restoreLibrary`
    writes clips, the index has to follow (`merging`).
  - `cfg.since` is set at connect, so `driveDue` counts the week from
    there. Daniel didn't want a backup on connecting.
- **Settings regrouped again (1.27.1, Daniel).**
  - Sync is titled "GitHub sync", so it isn't confused with Google
    Drive.
  - Edit clips is a row inside Library (`SECTIONS.edit.parent`), and
    `openSection(…, deeper)` pushes history so Back returns to
    Library.
  - Watched folders moved from Saving to Library.

- **PiP names only when it's big (1.27.0).** Daniel didn't want the
  collection and clip name in the small window. The PiP is 16:9, so its
  height stands for its size: at 169px or less, with a paragraph to
  show, `.has-text` hides the names. With no paragraph, the title still
  fills it.
- **Google Drive backups (1.27.0).**
  - Scope is `drive.file` only, which Google counts as non-sensitive,
    so no verification or security assessment is needed. The app sees
    only the files it made. A Drive browser inside the app would need
    the restricted `drive.readonly` scope and a paid assessment. Daniel
    picked backup and restore only.
  - Android: `DrivePlugin.java` gets the token from Play Services'
    AuthorizationClient. Google matches the Android client by package
    name plus the release key's SHA-1, so no client ID or secret is in
    the code. It also moves the zip itself, a resumable upload streamed
    from the cache file, and a download into the cache. Base64 over the
    bridge would be far too slow for a big library.
  - The web copy uses the OAuth implicit flow in a popup.
    - The redirect is the app's own address. `drive.js` reads the token
      from the hash at load, hands it over through `localStorage` and a
      BroadcastChannel, and closes the popup.
    - `w.closed` is not trusted, because Google's COOP cuts the popup
      off from the opener.
    - When the popup is blocked, the tab itself goes to Google, and the
      state carries what to do on return (`resume`).
    - The token lasts an hour. So "every week" on the web asks with a
      toast instead of going alone.
  - "Every week" is checked on opening and on coming back to the app,
    not by a background job: `exportLibrary` needs the app running.
    After a failed attempt it doesn't try again for 6 hours.
  - Backups are tagged with appProperties `waypage=backup`, plus device
    and clips. Pruning to the last 3 lists only those, newest first.
  - `test/drive.test.js` fakes accounts.google.com and the Drive API with
    Playwright routes and injects a Web client ID into drive.js.

- **No white frame as a clip opens (1.26.4).**
  - The theme's tokens and color-scheme reach the frame only in
    `applyTheme`, on load. Its first paint had no `--bg`.
  - In Night, a frame whose color-scheme differs from the app's also
    gets an opaque white backdrop.
  - The CSP allows no inline style, so the tokens can't go into the
    srcdoc. Instead the frame carries `.unready` (visibility hidden)
    from srcdoc until `placed` settles. Meanwhile `.reader-frame`'s own
    `var(--bg)` shows, and the restore jump is hidden too.
- **Continue reading kept in its collection (1.26.4).**
  - `continuePage` used the collection's next chapter only when the
    clip read last was finished.
  - Opening that next chapter for 3s stamps its `readAt`, which makes it
    the clip read last. Left near its top (at ≤ 0.02), though, it was
    neither finished nor "going", so the fallback picked an unrelated
    clip.
  - Now any clip read last that's in a collection goes to
    `folderNextIndex`.

- **No card while turning to the clip being read (1.26.3).** Moving on
  to the next chapter, the reader's open clip and the reading's clip
  differ for half a second to a second, so `showAloudBar` thought the
  reading was elsewhere and showed the card. This happened two ways:
  - Read next: `aloudAuto` was set, and the key moved only at
    `startAloud`.
  - Going on by itself: `wentOn` moved the key first, then `goTo`.

  The card now stays hidden while `aloudAuto` is pending, or while
  `heading` (set at the top of `goTo`, before its first await) is the
  reading's clip. Moving to another chapter by hand while one is read
  still shows the card: that reading really is elsewhere.

- **The card opens out of the play button (1.26.2).** Daniel found
  1.26.1's card "spawned": a whole card, scaled down over the player,
  doesn't look like the player, so it read as something new appearing.
  Now only the card's play button shows at the start, exactly over the
  player's (both 44px, accent).
  - The card is revealed around it by a `clip-path` inset while it
    travels. The open end is inset -40px so the shadow isn't cut off.
  - Only `#aloudPlay` is hidden while the card is out; prev and next
    leave with the reader.
  - Reduced motion still gets the 120ms fade.

- **Read aloud fixes (1.26.1).**
  - The widget's read aloud began in the reader's `open().then`. The
    page goes back to its place only after `fonts.ready`, so
    `firstShown()` saw the top, and the light then scrolled there.
    `C.reader.placed()` now settles after that restore, and the "here"
    start waits for it.
  - The card and the player are treated as one object, `M.morph`. It is
    scaled evenly (never stretched) from the player's rect to the
    card's. The player is hidden while the card is out of it, so there
    is never two of it.
  - The docked card (pinned sidebar) still comes from the edge.

- **Read aloud over Bluetooth (1.26.0).** Daniel wants a car's and
  earbuds' previous, next and pause to do what the app's do, and the
  chapter and collection shown on them.
  - The voice is played by the speech engine's app (Google's TTS), not
    Waypage, so Android's media-button routing, which follows the app
    that last played sound, could hand the buttons to another app. A
    silent looping AudioTrack (8 kHz, MODE_STATIC) while it reads makes
    Waypage the player; paused, it stops. Not checked in a car yet.
  - Previous and next from the session, notification and PiP go by
    paragraph (`step`, using the `blocks` the app passes), as the app's
    buttons do; before, they went a piece at a time.
  - Metadata: title, display title, artist and subtitle (collection or
    site), album, track number and count in the collection. Position is
    PLAYBACK_POSITION_UNKNOWN, so cars don't show a clock.

- **Read aloud's small window, leaving a clip, the widget's read aloud
  (1.25.0).** Daniel asked for read aloud picture in picture outside the
  app, optional, and a switch to stop reading when he leaves a clip.
  - Android's own picture in picture, not an overlay window: an overlay
    needs "Display over other apps", which Play restricts and users
    distrust. The whole activity shrinks; `body.pip` hides the app and
    shows `#pipView` (clip, paragraph). A PiP window doesn't take taps,
    so previous, pause and next are RemoteActions to SpeechService, the
    same intents as the notification's buttons.
  - It enters by itself on going home (`setAutoEnterEnabled`), which is
    Android 12+. Before that it needs `onUserLeaveHint` in MainActivity,
    which is generated; not worth patching for old phones.
  - The page learns it's in the window by asking `Speech.pipState()` on
    resize and visibilitychange, rather than an androidx listener, so the
    plugin needs no new dependency.
  - `tools/android-manifest.js` adds supportsPictureInPicture and
    resizeableActivity to MainActivity's tag.
  - Keep reading off: `show()` stops reading when another clip opens and
    it wasn't reading aloud going on (`aloudAuto`, or `wentOn` already
    moved `aloud.key`); `closeReader` stops it too.
  - Widget: `?aloud=1` on the page link; `aloudFrom(id)` opens the clip
    and starts from `firstShown()`, the place it was left.
- **Read aloud bar padding (1.24.2, shipped in 1.25.0).** 2px above the
  buttons and the gesture inset below put them on the bar's top edge.

- **Places before texts (1.24.1).** Daniel: sync should bring where you
  left off first, then the files. The merged entries were only applied
  at the end of `once()`, after every upload and download. Now
  `placesFirst` settles, right after the first merge, every clip this
  device has at the same version (or all, with links only), and marks
  them in `snapshot` so the later settles don't read them as edits made
  meanwhile. A clip saved again elsewhere still waits for its new text,
  since its old place may not fit it. A 409 retry merges again; the end
  settle writes the final values over the early ones.

- **Keep the screen on while reading aloud (1.24.0).** Daniel asked for
  it. Android sets FLAG_KEEP_SCREEN_ON on the activity window
  (`Speech.keepScreen`), not a wake lock: it only holds while the app is
  on screen, which is the point, and the system clears it with the
  window. Elsewhere `navigator.wakeLock` ("screen"), taken again on
  visibilitychange since the browser drops it when hidden; an app
  without the native method (iOS, an older APK) falls back to it.
  `keepAwake()` runs from setAloud, so it follows every state change;
  platform skips repeat native calls with the same value.

- **Picked rings and backwards turns (1.23.1).** The layout rules for a
  picked item were written `.selecting:is([data-layout=…])`, but
  `.selecting` is on body and `data-layout` on `.app`, so they never
  matched; they need the descendant space. The folder sheet centred its
  open row with `scrollIntoView`, which also scrolls every ancestor, the
  reader included, while the sheet rises: that was the page dropping in.
  `centreIn` scrolls only `#readingBody`. `M.pageOut/pageIn` take a
  direction; `goTo(p, -1)` turns backwards.

- **Read aloud going on with the app away (1.23.0).** Daniel: with the
  app minimized, read aloud didn't move to the next clip until he came
  back. The service released its wake lock and stopped at a clip's end,
  and the app then had to draw the next clip in the reader, which a
  page in the background doesn't. Now the app reads the next saved
  clip's blocks from its file (reader.readableIn, the same blocks the
  open clip gives) and queues them with SpeechService (Speech.queue);
  the service goes straight on and reports the new key, and the app
  catches up (wentOn). Only a saved next clip is queued: one still to
  be saved from the site goes on the old way, with the app open. iOS
  has no queue yet (TODO, iOS release).
- **Update downloads in Downloads (1.23.0).** Daniel: the update should
  download in Downloads, keep going with the app away, and pause.
  Downloads.fetch downloads into the cache as Waypage-x.apk.part with
  Range requests, so Resume, even after the app was closed, asks only
  for the rest; pauseFetch stops it. Filesystem.downloadFile, used
  before, can neither pause nor resume.
- **Previous and the collection list (1.23.0).** Daniel asked for a
  Previous button at the top of a clip in a collection, and a button by
  Contents listing the collection's clips.

- **Edit clips (1.22.0).** Daniel: bulk edit clips from Settings, picking
  clips or collections, removing things like `~~words~~` or renaming
  titles. Matches are found per paragraph (save.replaceText), across
  bold and links inside it, never in the app's own header, licence or
  next lines; a paragraph left empty goes. Text edits set `editedAt`,
  and sync now takes a clip's text version as the later of savedAt and
  editedAt, so an edit goes up like a save and the later one wins.
  The other device fetches the edited text again, which for a clip with
  saved pictures means its pictures come down again too. Title-only
  edits don't set editedAt (the three-way merge carries a title). Undo
  is kept in memory only, until the app closes.

- **Hold a post to pick posts (1.21.1).** Daniel: Feeds needs no Select
  button, holding should work like the library. Holding a post (or
  right-clicking it) starts picking with that post picked; holding while
  picking toggles it. The + and browser buttons on a post don't start it.

- **Sync on leaving, places that went back, Continue reading (1.21.0).**
  Daniel: sync sometimes didn't happen when he swiped away fast, came
  back to an older place, and Continue reading showed a clip he hadn't
  opened. Found in the code, not on a phone: (1) on hide, sync ran only
  if its timer was already set, but the timer is set after the index
  write lands, so a place saved on the way out was never sent; now an
  `unsynced` flag (set by store.onIndex) sends it once the writes are
  done, and a change made while a sync ran gets a second run. (2)
  writeIndex calls could run at once and land out of order, leaving an
  older library.json on disk; they're queued now. The three-way merge
  then read that older place as a change made here (local differs from
  base, remote equals base) and sent it everywhere; READING keys now go
  with the later readAt whenever the two readAts differ. (3) show()
  stamped readAt on every open, including a clip popped open by Back into
  a history entry left over from before a restart (history survives a
  WebView reload); now the stamp waits 3 s of being open, and every
  entry carries the launch's mark (history.pushState is wrapped), so
  route() drops entries from an earlier launch. Startup: nothing to fix
  without numbers from the phone, so it now measures itself
  (waypage.startTimes, About, the report). In Chromium at 4x CPU slowdown
  with 400 clips the first card shows at about 0.7 s, JS about 0.2 s of it.
- **Picking posts, the sidebar's Library (1.20.0).** Picking posts reuses
  the library's select bars (body.picking-posts swaps the actions for
  Open and Save) and its own history entry, "feedPick". Open sends each
  post to the browser 400 ms apart so each lands as its own tab. Library
  in the sidebar used to call goPlace, which only closed the sidebar and
  left the Collections or Clips part in place; it now goes back through
  history (toLibrary) first.
- **Alignment on every block (1.20.0).** 1.19.0 aligned only p, li, dd,
  blockquote and figcaption; Daniel found most paragraphs didn't change,
  most likely because they were divs (books and some sites). It now sets
  body and every element but pre, tables, figures, pictures and comics,
  since an excluded element would only inherit body's value anyway;
  headings follow the choice too.
- **Alignment, spacing, and a native library move (1.19.0).** Alignment's
  "auto" is labelled Original: it sets nothing, so a book's own CSS
  (often justified, centred breaks) stays. Any other choice puts
  `data-co-align` on the frame's root and reader.css forces it with
  !important on p, li, dd, blockquote and figcaption only, so headings
  and the page's own centring of titles keep theirs. Justified turns on
  hyphens to avoid gaps. Letter and word spacing are em on the body
  (0 means "normal", so a book's own spacing wins); paragraph spacing
  multiplies the usual gap. They sit under a Spacing heading inside the
  Text tab rather than a fourth tab, which made "Read aloud" wrap at
  phone width. The library move calls FilesPlugin.copyFiles on Android
  (a thread, streams, "copied" every 20 files) with { dir } for app or
  Documents storage and { tree } for a picked folder; iOS keeps the
  fetch-and-write loop until the iOS release in TODO.md.
- **Big pictures made smaller (1.18.0).** Daniel asked to compress very
  large comics and pictures. `store.squeeze` reuses the preview shrink's
  canvas path: no wider than 1600 px (save.js FULL_WIDTH, enough for a
  comic's lettering at phone width), WebP at 0.8 where the WebView can
  write it (checked once with toDataURL; Safari before 17 writes PNG
  instead, so JPEG then), kept only when at least 10% smaller; GIF/SVG
  and anything over 16 MP of canvas (iPhone's limit) stay as they are.
  On by default (`waypage.compress`, C.save.compress). Storage's Make
  pictures smaller runs `save.compressPictures` over clips with full
  pictures or comics not yet done (`squeezed` on the index entry), skips
  the card's thumb, files under 60 KB, and files already made smaller
  (name ends "s.webp/jpg/png"), so running it twice doesn't blur twice.
  Canvas re-encoding drops colour profiles; fine for comics and photos.
  Not measured on a device.
- **Comics that fill in as they scroll (1.17.0).** Daniel's .mht of
  WEBTOON's phone viewer: 215 images, about 100 still
  bg_transparency.png with no data-* at all after he'd scrolled part
  way, so the address lives only in the site's scripts, and lots of
  manga sites do the same. readArticle's comic result now carries
  `blanks` (images still a stand-in after resolveLazyImages); with two or
  more, fromAnyPage renders the page with PageRender's new `scroll`
  mode and keeps that read if it found more panels. Scroll mode (both
  plugins): a 4000 px tall view, one screen down every 250 ms, done when
  it's at the end and the count of images with a real src hasn't moved
  for three steps, or at the 50 s limit. The view's alpha is 0.01, not
  0, so it's drawn and IntersectionObserver-style loaders fire. Images
  stay blocked in the hidden view (no double download); a loader that
  waits for each picture to load before the next would still stop short.
  Not run on a device from here.
- **WEBTOON from the desktop page (1.16.1).** 1.16.0's panels() didn't
  help on Daniel's phone: the app's User-Agent is the phone WebView's, so
  WEBTOON serves its mobile viewer, which seems to load all but the first
  few panels with scripts. The rule's `fetch` now turns m.webtoons.com
  into www.webtoons.com and its new `headers` ask as desktop Chrome
  (fromAnyPage, the chapter checks and the list pages pass them to get),
  so the page is the desktop viewer the rule was built from in 0.29.1.
  Still not checked against the live site from here. The slider's hold is
  500 ms (Daniel: a second was too long).
- **Pinch, the slider's side, the book spinner, WEBTOON (1.16.0).**
  Pinch: reader.js `textPinchInput` takes two-finger touches that aren't
  on a comic or printed PDF (`comicRoot()`), sets the size as the fingers
  move (size = start × spread ratio, whole pixels), and scrolls so the
  block under the fingers stays there; paged mode relayouts as before.
  The scroll that keeps the place doesn't tuck the bars away (`pinchedAt`).
  `gesturestart` is cancelled for Safari's own page zoom. Slider side:
  `waypage.brightSide`, a `.right` class mirroring the left CSS; held
  1 s still (8 px slack) it lifts, follows the finger with `translate`,
  and lands on the half it's let go over, FLIP'd from where it was. The
  vertical drag is the same pointer, so a hold puts the level back to
  where it was before the press. A book or PDF (`p.file`) pushes the
  reader before reading the file (`readerWait`), the frame hidden and a
  spinner after 200 ms, and shows once the frame's fonts are in and
  near PDF pages drawn, 4 s at most. WEBTOON: Daniel's saved copy of an
  m.webtoons.com episode had six panels and the transparency stand-in,
  so the phone page keeps most panel addresses somewhere other than
  data-url. Not checkable from here (the site is blocked), so two nets:
  the rule's new `panels(doc, url, html)` takes whichever attribute in
  the viewer's images holds a webtoon-phinf address, or every
  `webtoon-phinf…?type=qNN` address in the raw HTML when that finds more;
  and resolveLazyImages takes any data-* holding a picture address when
  src is a blank stand-in.
- **The archived copy and batched sync (1.15.0).** A save that fails
  with 404, 410 or 403 is marked `gone` (SaveError's third argument), and
  its card offers the Wayback Machine instead of Try again. The
  availability API (archive.org/wayback/available) gives the newest copy;
  it is read from web.archive.org/web/<time>/<url> with the toolbar
  stripped (the markers around it), not the id_ form, since only the
  rewritten page has picture addresses that still work. The clip keeps
  the original url, and `archived` (ms) on its meta changes the footer;
  sync and backups carry it. Sync: more than two clips to send go through
  the Git Data API, 50 or 8 MB of text a batch, inline in one tree, then
  one commit and one ref update (5 requests instead of 50 PUTs, and 1
  commit instead of 50). A 422 on the ref means another device moved the
  branch: tree and commit again on the new head. The page's sha is worked
  out here (SHA-1 of "blob <len>\0" + text) because a tree's answer
  doesn't list files in folders; with no crypto.subtle the text goes as
  a blob, which answers its sha. An empty repo (409) falls back to the
  old one-by-one PUTs. `waypage.syncSent` moves per batch. Not timed on a
  phone against a real first sync yet. Test: test/syncbatch.test.js.
- **The 1.14.0 reader and app.js split (1.14.0).** app.js (8,500 lines)
  is now seven classic scripts loaded in order (app, app-reader,
  app-library, app-saving, app-places, app-settings, app-start) sharing
  one global scope, not an IIFE each as TODO first said: an IIFE per file
  would have meant exporting hundreds of names between them for no gain.
  The rule is that code run at load uses only what an earlier file, or
  the same one, declared; MENUS builders are arrows for that reason.
  `moveTo` became `moveInFolder` since a global one shadows
  window.moveTo. Find runs in the app's document against the frame's
  text (the frame runs no script): text nodes joined with an index map,
  each match wrapped in `mark.co-find`, cleared on close. Footnotes are
  links whose mark sits in `sup`, `.reference` and the like, or whose
  target is in a notes list; the sheet drops back links and any `#` link
  (Readability strips their classes, so the class alone missed them).
  App icon shortcuts reuse the widget plumbing: Android static shortcuts
  send the widget intent with waypage-widget://reading|search|paste, iOS
  Quick Actions go through SceneDelegate (Capacitor's template is
  scene-based now) to WidgetsPlugin.shortcut, posted after the first view
  at launch. Save the copied link reads the clipboard natively; Android
  10+ gives it only to the focused app, so it tries twice and then
  focuses the save field. iOS asks "Allow Paste?" unless told always.
- **Sync picks up where it stopped (1.13.0).** Daniel: closing or
  updating the app mid-sync restarted it from zero, and it was slow. A
  run sends every page's text, then library.json; cut off before the
  last write, GitHub's library named none of them and the next run sent
  them all again, each now a 422 and a second try because the sha was
  unknown. Sent pages now go in `waypage.syncSent` (id: at, sha, packs)
  as each lands and count as sent until library.json is written. Coming
  down was worse: the base was written before the downloads and
  `waypage.syncWaiting` after, so a run cut off in between left the new
  pages in the base but not on the device, and the next merge read that
  as deleted here and deleted them on every device (reproduced on 1.12.1
  with a reload mid-download: every clip got a tombstone). The waiting
  list is now written first, the texts are read four ahead, and every
  10 pages or 4 s what came down goes into the library (`settleSome`,
  the same rule as the end of a run). The picture queue is kept in
  `waypage.syncPictures`. Test: e2e syncresume.js (reload mid-send and
  mid-download). The bar's sync button is `#syncBtn`, painted by
  paintSync() from paintDownloads().
- **Soft zoom instead of the grow (1.12.1).** Daniel: the grow still
  stuttered on the phone and, even smooth, did not look good. Two causes.
  The 1.11.1 host scaled a window up and the screen back down inside it,
  so the phone drew the page at up to ~7× its size. And a card (cover,
  title) and the page it opens share nothing, so any card-to-page morph
  shows a stretched card or two screens at once halfway; a GPU-only zoom
  with a blending card copy was built and dropped for that reason.
  `M.grow`/`M.shrink` now scale the screen 0.92 to 1 toward the tapped
  card with a short opacity change (30% of the spring opening, 45% back).
  Daniel was offered Soft zoom, Slide or keep the grow on a card.
- **Voice menu in Settings (1.12.1).** `.group` has `overflow: hidden`
  for its rounded corners, which cut off a dropdown that opens upward.
  `dropdown()` puts `menu-open` on the group while its menu is up, and
  `.group.menu-open` lets it overflow.
- **Settings sorted (1.12.0).** Daniel approved the layout in the
  artifact "Waypage Settings Layout". Appearance had grown to hold the
  theme, all the reading type and the library's layout, and Content was
  a page with one row. SECTIONS now has appearance, reading, library,
  saving (with watchGroup and the new importGroup), sync, storage,
  updates, report. The Auto boxes are `#autoSection`, hidden unless the
  theme is Auto; Theme's set toggles it in place so focus stays. The
  Animations switch (`waypage.animations`, default on) sets
  `data-motion="off"` on the root through motion.setStill: run() then
  resolves at once, reduced() is true (so code that skips the library
  drift or the viewer's grow skips them too), reader.js scrolls and turns
  instantly, and styles.css drops every transition and the press dip.
  aloudControls works with no clip open now: the voice is for the
  phone's language.
- **Grow on the GPU (1.11.1).** Daniel: the grow looked frame by frame
  and the card changed a frame after the shrink landed. The grow animated
  left/top/width/height and a clip-path, all main-thread, while the
  reader laid its page out (a 300-500 ms task on a 6x slowed CPU). Now
  each grown screen sits in a `.grow-host` (motion.host, wrapped at
  start-up because moving an iframe later reloads it): the host is scaled
  to the panel's box with `overflow: hidden` and the screen is scaled the
  other way, both as dense linear keyframes from the spring, so text keeps
  its size and only transforms move. The corner radius is a separate
  main-thread animation; if the main thread stalls only the corners lag.
  A copy of the card (`.grow-face`) rides the corner and blends out over
  the first 35% of the grow and in over the last 40% of the shrink
  (Daniel picked this over a cut or a slide-down). closeReader draws the
  library before the shrink, and the shrink finds the card again by its
  section and ids, then hides the screen in the same frame it lands.
- **The first selection dropped (1.11.1).** selectionSpot ran
  readable() on the first selection, which ran wrapLoose(), which wraps
  loose text in spans: the words being selected. It runs at load now.
- **Motion rework (1.11.0).** Daniel approved the motion designs
  (artifact "Waypage Motion"). motion.js has two spring tiers, touch and
  desktop (`deskQ`), and no fades. Open from a card is `grow`: a
  `.grow-shade` div animates its box from the card to the window while
  the screen's clip-path inset follows it; the demo's title and picture
  morph is left out because the reader's title lives in its iframe and
  it opens at your place, not the top. Collections ›/Clips › use libSnap
  and libFlip (FLIP keyed by tile name, card ids and section heading).
  The sidebar's drift is an inline transform on the library because
  run() cancels its animations when they land. The viewer's drag dim
  never showed (its `::before` covered the background); it is `--dim`
  now.
- **Saves try twice (1.10.1).** Daniel: a new link often failed until
  Retry. No error text came with it, so the likely causes are all
  covered: SaveError's `again` marks a network failure or timeout, a 5xx
  or 403, a browser check, and a page that didn't draw in PageRender
  (whose WebView is cold on a first save); runJob's saveOnce tries those
  once more after 1.5 s, and notes it in the log for Report a problem.
- **Continue reading and a collection's next (1.10.1).** notePosition
  stamped readAt on any change of the fraction, and pictures loading or
  a relayout change it with no reading, so a clip left open (here, or in
  a browser through sync) became Continue reading. Now only a new spot
  (paragraph), or a move of 1% where there's no spot, counts. A
  collection's next was its first unfinished clip, so one skipped
  chapter (59) held it while reading went on to 144; folderNextIndex
  takes the clip read last, or the first unfinished one after it.
- **No fades (1.10.1).** Daniel asked to drop them: motion.run plays
  only the movement unless reduced motion is on, where the 120 ms fade
  stays the answer. CSS opacity transitions went too.
- **Collection widget, button at the foot (1.10.2).** Daniel wanted the
  button at the bottom and only the next clip, no list. The root is now a
  FrameLayout with the button on `layout_gravity="bottom"`, so a short
  widget overlaps the clip's meta line instead of dropping the button
  (a LinearLayout would cut it). w_fav1-3 stay in the layout, hidden,
  because Widgets.java hides every FAVS id and a missing id breaks the
  whole widget.
- **Collection widget, button first (1.10.1).** The button sat at the
  bottom under four 44 dp rows; a RemoteViews LinearLayout clips what
  doesn't fit, so at the default 3-cell height the button was the part
  cut off (Daniel saw only clips). Now the next clip, then the button,
  then the rest: the rows are what gets clipped. The clip list starts at
  the clip the button opens (the first one again for Read again).
- **Brightness while reading (1.10.0).** native/share's Brightness
  plugin: Android sets the window's screenBrightness (dropped by Android
  when you leave the app, and reset to BRIGHTNESS_OVERRIDE_NONE when the
  reader closes); iOS sets UIScreen.brightness, which is the whole
  phone's and outlives the app, so the plugin keeps the level from before
  and puts it back on willResignActive and when the reader lets go, and
  sets the reader's again on didBecomeActive. The swipe is caught in the
  sandboxed frame's document (same origin, no scripts in it): a touch
  starting in the left 18% (at least 56 px) that moves up or down more
  than 10 px before 14 px sideways; from its start the page's own scroll
  is prevented there, the cost of the gesture. App only: a browser can't
  change the screen, and a dimming layer would pretend to.
- **Saving from email (1.10.0).** Gmail on Android and iOS shares a
  link or selected text, never a whole message, and a forwarding address
  needs a server (ruled out in PROPOSAL.md). So the fast path is text:
  saveShared keeps a share as a clip when it has no link in it, or when
  60 words or more surround its links; otherwise it's the link, as
  before. The clip is a copied "txt" file clip (files.bring with a
  title), so it syncs and lives in Clips. An .eml file is the full route:
  files.js reads the MIME tree itself (no dependency), takes the first
  text/html part (or text/plain), swaps cid: pictures for their bytes
  like an EPUB's, skips attachments, and sends the HTML through fromHtml
  and cleanSaved like any page. A file with no extension is sniffed as
  mail when it starts with headers including From and one of Subject,
  Date, MIME-Version, Message-ID or Received.
- **Highlight widget (1.9.0).** updateWidgets() hands the native side
  the latest 100 highlights (text up to 500 characters, note up to 200);
  the widget picks `marks[day % n]`, so it changes at midnight without the
  app running. Android: HighlightWidget with updatePeriodMillis of 3 hours
  as the fallback; iOS: a timeline of the next 7 midnights. A tap opens
  `waypage-widget://mark/<id>?mark=<n>`. Not yet run on a phone.
- **Importing (1.9.0).** src/imports.js only reads the list; each link is
  then saved like a pasted one through saveAll, whose tags argument can be
  a function giving each link its own tags and finished state. Fetched
  fresh from the web, not from the other app: Pocket's export has only
  links. Oldest first,
  so the newest lands on top. HTML is only taken as an import when its
  title says Pocket, Instapaper or bookmarks, so opening an ordinary
  .html file still opens it as a file.
- **Error log (1.9.0).** platform.js keeps the last 60 errors in
  `waypage.log` (this device only, never synced), repeats merged with a
  count. Addresses lose their query and hash, and token, key, password and
  secret values are cut, before anything is stored. Report a problem shows
  the whole report in the box before it's sent; nothing leaves on its own.
- **Make room (1.9.0).** Drops pictures with the same setPictures(p,
  "links") as a clip's "Keep" choice, only for finished web clips with
  pictures, so nothing is lost that the web can't give back. The preview
  thumbnail stays for the card.
- **Translate into the app (1.8.1).** Daniel: Translate opened the
  Google Translate app with an empty box. The app takes translate.google.com
  links but drops their `text`. native/share's Translate plugin sends the
  words as ACTION_PROCESS_TEXT (the popup the phone's own text menu opens),
  then ACTION_SEND, both addressed to Google Translate; with neither, the
  web address as before. iOS still opens the web address, and if the
  Translate app is installed there it may take it the same way: untested.
- **Saving signed in (1.8.0).** native/share's SignIn plugin opens the
  site in a WebView (Android, a full-screen dialog) or a WKWebView on the
  default data store (iOS), and keeps nothing else: the cookies stay in
  the system's cookie store. platform.js keeps the list of sites signed
  in to (`waypage.signedIn`, this device only, never synced) and adds a
  Cookie header to CapacitorHttp requests for those sites alone, not for
  every site PageRender has visited, so a site's metered-paywall counter
  doesn't follow every save. On iOS, cookies() also copies them into
  HTTPCookieStorage.shared, since URLSession replaces a hand-set Cookie
  header with what that storage holds. Signing out on Android expires
  each cookie the site's address would send under every domain it could
  have been set for, as CookieManager can't list them; iOS deletes them
  by domain, plus the site's website data, never the app's own
  (localhost). Neither was run on a phone before 1.8.0 shipped.
- **Every highlight in one place (1.8.0).** A third place beside Library
  and Feeds (`state.place = "highlights"`), drawn from the index alone,
  so it's as quick as the library. Its search field stays in the page
  while the list under it redraws, so typing keeps focus. At 1280 px it
  reads in the pane beside the list, as Feeds does.
- **Translate and Look up (1.8.0)** open the web (Google Translate,
  Wiktionary in the phone's language) through openOutside. The phone's
  own selection menu may offer the same, depending on the phone and the
  apps on it; these are always in the same place. Too wide for a phone,
  the bar drops Read from here's words first, then every label.

- **The bubble that stayed (1.7.1).** Daniel, on his phone: after a
  highlight "a small bubble" stayed until he left the app. Not seen in
  Chromium, so three likely causes are all dealt with: Android's WebView
  can keep its own Copy and Share bar up when a script clears the
  selection, so clearSelection also takes focus out of the frame; the
  painted highlight changes the selection, which could bring the
  Highlight bar back, so it stays quiet for 600 ms after; and the
  "Highlighted" toast had an Add a note button, which kept it up for 8 s.
  If it still happens on the phone, ask which bubble it is.
  The Highlight button that sometimes didn't show (same day): not
  reproduced in Chromium either. Two causes fixed: a selection taller
  than the screen put the bar at the very top, under the reader's bar
  and Android's own selection bar, so it now pins to the bottom; and
  text outside any leaf block (between <br>s) had no block to anchor to,
  so highlights now use their own list of blocks (leaf blocks plus
  wrapLoose's runs). Spot keeps its anchors, so reading places don't
  move; 1.7.0 highlights on such pages are found again by their words.

- **Highlights (1.7.0).** Kept on the clip's index entry as `marks`
  ({ id, block, start, endBlock, end, text, note, at }), so sync, backups
  and restore carry them with no file of their own. `block` is one of the
  reader's anchors (the leaf text blocks spot uses since 1.3.0), and the
  offsets count that block's text without what reader.js adds (the
  offline image placeholders), so a highlight lands in the same place
  online and off, at any width, in Pages or scrolling. A clip saved again
  whose blocks moved finds a highlight by its words inside one block;
  one it can't find stays in the list as "Not found in this copy", never
  silently dropped. A selection is widened to whole words. A new
  highlight over old ones replaces them and keeps their notes. Sync
  merges them by id like tags; one edited on both devices keeps the later
  `at`. Painted as `<mark class="co-mark">` inside the sandboxed frame
  (no scripts there; the app reaches in, as for Read aloud). --mark is a
  token in every theme, checked by contrast.test.js against ink and
  accent.

- **Only the start (1.7.0).** Saving fetches signed out, so a paywalled
  article is its teaser. `save.cutShort` flags it when the site marks the
  article as not free (schema.org's isAccessibleForFree, which sites set
  for search engines, or a locked or metered content tier) and the text
  is under 5,000 characters, or when short text (under 2,500) ends asking
  you to subscribe or sign in. Sites that give search engines the whole
  text still mark it locked, hence the length check. The flag is `cut` on
  the entry and an aside at the end of the saved page. Saving the page
  signed in (an in-app browser whose cookies the save uses) is the real
  fix and is in TODO.md.

- **A big library draws in steps (1.7.0).** Measured before changing
  anything, at 6x CPU slowdown in Chromium: all the app's scripts run in
  about 80 ms at launch, and the ones that could load later (PDF, EPUB,
  QR, sync, backup) in under 10 ms, so loading them later was dropped as
  not worth the risk. The cost was the library: 1.2.1 drew the first 30
  cards and then every other card in one task, 0.7 s and 0.4 s of frozen
  main thread with 2,000 clips. Now the rest come 150 at a time
  (NEXT_SCREENS), each a task of its own, longest about 0.15 s at that
  slowdown. Each step sorts the whole list again, which costs more in
  total but none of it in one piece. `firstRender` stays true until the
  last step, so springs and the PDF warm-up wait for it.

- **The UI test (1.7.0).** test/ui.test.js drives the app in Chromium
  through Playwright: save a page from test/fixtures (same origin, so the
  browser's fetch reaches it), read it, highlight it, restart, search, a
  paywalled page, then every theme at 390 and 1280 px with no errors and
  no sideways scroll. Playwright isn't a dependency: the test finds it
  (or PLAYWRIGHT_MODULE) and skips with a note where it isn't installed.
  Console errors from Playwright reaching into the sandboxed frame
  ("Blocked script execution in about:srcdoc") and the test site's
  missing favicon are ignored; everything else fails it.

- **The iOS release (1.6.0).** Android's native pieces, redone in Swift
  in native/share/ios with the same plugin names and calls, so the
  JavaScript barely knows which phone it's on: Files (a picked file or
  folder is a bookmark, the `ref` "bm:<base64url>", a file in a watched
  folder "bm:<folder>/<path>"; access is started once and held, so the
  WebView reads the file straight from disk through convertFileSrc, info()
  and serve() handing back its path), ShareTarget (open-URL events: a file
  from "Open in", copied like Android's, with a bookmark as `link` when
  iOS opened it in place; a link from the share extension), PageRender
  (a hidden WKWebView with its own throwaway data store and no pictures),
  Connection (NWPathMonitor; `metered` is cellular or iOS's "expensive"),
  Feeds (a BGAppRefreshTask running FeedCheck, a port of FeedCheckJob.java;
  its handler must be registered before launch ends, so
  tools/ios-project.js adds a line to the AppDelegate) and Widgets.
  The two app extensions follow LifeLog's widgets (0.217.0):
  tools/ios-extensions.rb adds them to the generated project with the
  xcodeproj gem, the .ipa is ad-hoc signed with entitlements so the App
  Group exists, and WPGroup reads AltStore's renamed group from
  ALTAppGroups. Shared/WaypageShared.swift is compiled into the app's pod
  and both extensions. Things iOS forced:
  - *The share extension opens the app through the responder chain.* iOS
    gives a share extension no way to open its app, so the link is also
    left in the App Group and taken the next time the app comes to the
    front. It calls UIApplication's open through the Objective-C runtime,
    since an extension may not name it; an App Store review may question
    that.
  - *No Safari preprocessing file.* The TODO had it as iOS's only way to
    script-built pages; PageRender draws those in the app, as on Android.
  - *Cold-start events.* Capacitor 8's scene delegate posts the launch URL
    once plugins have loaded, which can be after the page asked, so the
    plugins' events are sent with retainUntilConsumed.
  Watched folders are now listed all at once (scan() in parallel) and
  added one folder at a time, since adding writes the index.

- **Big screens finished (1.5.1).** The rail beside a book of pictures
  (a scan, a PDF read from its file, a comic) lists its pages instead of
  headings, chosen by railPages(): a page is any `.co-comic > img`. A PDF
  read from its file draws each rail page from the open PDF
  (files.pageThumb), and waits while drawNear is drawing the pages being
  read, so the rail never slows reading; the others reuse the picture
  already in the page. Dropped files were already opened by the window's
  drop handler; the drop card now shows for them ("Drop to open"), and a
  file manager's drag, which also carries file:// links, is no longer
  tried as a link. Clip pictures are 64 by 96 (2:3, the collection
  covers' shape) and 4:5 in Grid; Continue reading keeps its wide
  picture, 3:1 from 700 px so it doesn't fill the screen. Checked in an
  emulated iPad (touch, coarse pointer, 1180 by 820 and 820 by 1180,
  Split View widths): the pinned sidebar, hardware keys, Ctrl V and a
  dropped link all work. A real iPad and Android tablet, and a drag
  from another app in Split View, still need a person.

- **Big screens (1.5.0).** Daniel approved the 38 boards on the canvas
  page "1.5 Big screens" "all at once": every screen, every width, one
  release. The tiers are widths (700 px tablet, 1024 px pinned sidebar,
  1280 px a third column and the Feeds pane), but row heights follow the
  pointer, so a tablet with a finger keeps 44 px rows. The save field,
  the library title, its size and Show and Order are the same nodes
  moved by fitWidth() when the width crosses 700 px, not copies, so
  every listener and paint still finds them. The pinned sidebar is the
  phone's sidebar kept open (state.side stays false; sideShown() decides
  when it is drawn); a tap in it steps back to the library through
  history first (toLibrary), so Back still walks the same stack. Dialogs
  and panels are the same screens and sheets placed differently, chosen
  when they open (pushScreen's DIALOGS, the sheet's data-pop), so phone
  code paths are untouched. Keys pressed inside the reader's page reach
  the app through reader.js's onKey, since the sandboxed frame has the
  focus. Two pages side by side are the same CSS columns as Pages, each
  half of the screen laid out as one page, so turning, the progress and
  where you were work as before. Search and Settings stay in the bar on
  a tablet, where the sidebar is hidden, though the board had them only
  in the sidebar: two taps for search was a step back.
- **Which device read further (1.4.2).** The furthest-read toast (1.3.0)
  said "your other device"; now it names it. Each clip carries `readOn`,
  the name of the device that last moved its place, set wherever
  `readAt` is. It syncs as one of READING, but the merge takes it from
  whichever side read later (`readFrom`), not key by key, so it can't end
  up naming one device beside another's place. The name is typed in
  Settings, Sync ("This device's name"), else on Android the name the
  phone goes by (@capacitor/device: Settings, About phone, else the model,
  "Pixel 8"), else guessed from the platform and screen (phone, tablet,
  iPhone, iPad, computer). iOS 16 and later give apps only "iPhone" as
  the name without a special entitlement, so iOS keeps the guess. A guessed name
  reads "on your phone", a typed one as typed ("on Pixel 8"); two devices
  with the same name read "on your other phone". A clip last read on a
  device from before 1.4.2 has no name and keeps the old wording.
- **Waiting for Wi-Fi (1.4.1).** Daniel: downloads, and maybe sync,
  only on Wi-Fi; he asked for names and picked rows in Saving and Sync
  over a page of their own. navigator.connection.type says "cellular"
  in Android's WebView and nothing on iOS or a desktop, so the group
  only shows on Android. Saves hold in wifiGate() (the job shows
  "Waiting for Wi-Fi" in Downloads) and go on when the connection
  changes; the quiet fetches skip their turn, and Sync now says
  "Waiting for Wi-Fi".
- **The movable reading card (1.4.1).** Daniel: the bar hid things,
  above all in another clip's reader. It's a 240 px card now, dragged
  by pointer events heard on the window (a quick drag leaves the card
  before its first move event, and capturing the pointer on the card
  would take the tap from its buttons), snapped to a side on release
  with the side and height kept in localStorage. The label went too:
  the state lives in its aria-label.
- **Double scroll bar (1.4.1).** A screen is position: fixed over the
  library, which still scrolls underneath: a wheel or fling that ran
  out in .screen-body chained to the document. `overscroll-behavior:
  contain` on .screen-body, and overflow: hidden plus contain on .screen
  so the bar and padding catch it too.
- **Read aloud away from the page (1.4.0).** Daniel: leaving the clip
  should keep it reading, with a bar showing what, like picture in
  picture; and at the end a button for the next page. The speech already
  ran outside the reader (the Speech service in the app, speechSynthesis
  in a browser): closeReader() and show() stopped it. Now `aloud` keeps
  its clip (key, map, state) whatever is on screen; the reader's player,
  light and pressed button show only when that clip is the one open
  (aloudHere), and otherwise #aloudBar, fixed along the bottom over every
  screen (z 12, under sheets and the toast), lifted above the library's
  bottom field when that's what's on screen. "ended" is a state of its
  own now: while the clip has an endLink (the next chapter, or the page
  it links to as next), the clip stays "being read" and Read next shows,
  in the reader's foot and on the bar; readNext() opens it (saving it
  first when it isn't saved) with aloudAuto set, and show() starts
  reading from the top. With no next, ended is stopped.
- **The Collection widget's blank (1.4.0).** From 1.2.3 the layout had
  a bare `<View>` as the weighted spacer that pushes the button to the
  bottom; RemoteViews only inflates its allowed classes, so Android drew
  "problem loading widget". A FrameLayout spacer does the same job.
- **Reading position across devices (1.3.0).** Daniel: "if I read and
  exited we should sync". The sending side already did (a save 1.5 s
  after the scroll stopped, a sync 4 s after the save, at once when the
  app went to the background); the receiving side had the holes. The
  real bug: the scroll that put the page back where it was fired the
  reader's onPosition, whose rounding of the fraction could differ by a
  thousandth from the saved one, so opening on device B a clip that A
  had read further counted as a move on B: B's `at` and readAt were
  newer, and in mergeEntry's READING rule B's stale place won. Now the
  restore's own scroll doesn't report a position (reader.js, 400 ms
  after it), and notePosition stamps readAt only when the place really
  changed; show() still stamps readAt on open, since sort by read, the
  sidebar and Continue reading mean "opened last" by it, and an
  unchanged place loses nothing in the merge. In Pages, the spot is
  measured after the columns are laid out, pageOf() counts from the
  real scroll (mid-turn, page() is the turn's target), and a page with
  no block starting on it clears the spot so the fraction decides. The furthest-read check: as a clip
  opens, sync.peek() reads library.json (a conditional GET with the last
  ETag; a 304 isn't counted against GitHub's rate limit) and if the
  copy there has a newer readAt and a different place, a toast with one
  action ("Go there") offers it; the open never waits. sync.poll() is
  the same peek compared with the base, every minute while the app is
  in front, between the five-minute syncs. closeReader syncs at once.
  The place itself: reader.spot() is "block/percent", the block among
  BLOCKS (and a comic's panels) at the top edge and how far into it;
  toSpot() returns to it; the fraction `at` stays for the progress bar
  and as the fallback when a spot names nothing (a page saved again, a
  clip from before 1.3.0). `spot` is a READING field in sync and in
  backup.cleanMeta.
- **Opening a linked PDF (1.2.4).** Daniel: "you have to wait seconds".
  Measured in the browser at 4x CPU with a 300-page PDF: pdf.open took
  800 to 1000 ms, 600 of it the sandbox boot and the library's import,
  the rest asking every page for its size; a fresh sandbox was built
  per open, and a document's destroy() took pdf.js's worker with it. On
  the phone the file read came first: platform.files.blob read the file
  in 4 MB pieces, and each piece's native read opened the content stream
  and skipped to its offset, which for a content: address reads the file
  from its start, so a big file was read many times over. Now: the file
  is fetched whole from Capacitor's file server (convertFileSrc, no
  base64, no skipping), with the pieces as the fallback; one sandbox
  stays up for the app with the library and a shared PDFWorker, so
  "open" after the first costs about 160 ms at 4x (was 1000), and
  warm() brings it up 2.5 s after launch when a linked PDF is in the
  library; the first 16 pages' sizes come with the open and the rest
  follow in batches of 16 (pdf.onSizes), a slot past them taking the
  last known size until its own arrives (fixSizes), since nearly every
  PDF's pages are one size. The cover for an old PDF is drawn 1.5 s
  after the open, so it never holds the open.
- **Zoom in place on printed pages (1.2.2).** 1.2.1 answered "zoom" by
  opening the page in the image viewer; Daniel wanted a PDF viewer's
  pinch and pan. The chapter (`.co-comic`) is scaled with a transform
  while the fingers are down, then laid out at that width (its
  `width` in px) once they lift, with the scroll set so the content
  under the fingers stays put. Panning is then the page's own scroll,
  in both directions, with no code of its own; position() still works,
  since it is a fraction of scrollHeight. The chapter has
  `touch-action: pan-x pan-y` so the browser's own pinch doesn't
  compete. drawNear draws a page at its shown width (up to 2400 px) and
  again when that changes by a quarter, so a zoomed page is sharp; it
  remembers the width each page was drawn at. The chapter's double tap
  no longer opens the viewer, so a comic's panel can't be opened on its
  own; nobody asked for that, and a 2.5x zoom on the spot is what a
  double tap means in every PDF reader.
- **The speed pass, round two (1.2.1).** The first real draw of the
  library builds thirty cards and the rest on the next turn
  (FIRST_SCREEN), so the first screen is up before the rest is built.
  During a run the index write is debounced three seconds (indexSoon)
  and flushed at the run's end and when the app goes to the background,
  so library.json crosses the bridge a few times a run, not once a page.
  Sync's merge (every page cleaned as GitHub holds it, the three-way
  merge, the comparison) runs on src/sync-worker.js, which loads
  backup.js and sync.js with a window of its own; without a worker, or
  if it fails, the merge runs in the page as before. The worker and the
  app share one address rule (C.sync.urlKey), since the merge on the
  worker can't be handed the app's. Measured as in 1.2.0 (4x slowed
  CPU, 600 clips, sync on): first card at launch 379 to 307 ms (175 on
  a second launch), a sync run's main-thread time 541 to 344 ms with no
  long task, the first 8 s of a 30-chapter run 1486 to 1205 ms, the
  sidebar during that run 590 to 381 ms. Left alone: toggling `inert` on the
  library (30 to 60 ms at 4x). A focus trap instead would have to keep
  every card out of the reading order by hand, and the cost lands after
  the animation, where it isn't seen.
- **The speed pass (1.2.0).** Measured with a 600-clip, 50-collection
  library on a 4x slowed CPU, sync on, 30 chapters saving (the scratch
  script speed.js, a profile per phase). Before: each library redraw cost
  about 80 ms of main-thread time, most of it in folderPages, which
  filtered every clip with sameTag for each of the 50 collections, four
  times per collection per redraw; a sync run blocked for 500 ms, most
  of it oneCopyEach comparing every page with every other through
  sameUrl. After: the collections are grouped once (folderIndex) and the
  grouping is checked, not rebuilt, on each ask (a pass over the pages:
  same objects, same folder, same place), since 34 places change a
  page's folder and a version counter would be missed somewhere;
  savedAs looks up a map the same way; oneCopyEach takes a key for the
  address; sync yields between its steps and writes its base only when
  it changed; a landing page's redraw waits for animations
  (motion.busy). Toggling `inert` on the library costs 30 to 60 ms at 4x
  (it restyles every card) and is already deferred past the animation
  (0.30.4); left as it is. Not measured here: the bridge's cost of
  writing library.json after every page, and the first draw of hundreds
  of cards at launch on a phone.
- **No empty state until the library is read (1.2.0).** paintPlace ran
  before readIndex resolved, so the empty library's message showed for
  the moment it took (about a second on a phone with a big library);
  `loaded` holds it back.
- **Linked files are read whole once (1.1.3).** Every stretch the zip
  reader asked for (a chapter, a picture, and each one's 30-byte header
  first) was its own bridge call, and each call opens the file again and
  skips to the offset: an EPUB with hundreds of pictures took seconds to
  open and longer to bring in. platform.files.blob now reads a file up to
  64 MB whole the first time, four 4 MB pieces at a time, and slices
  from memory. Bigger ones still read by the stretch.
- **PDFs as printed (1.1.3).** Daniel's PDFs were designed books
  (figures, code, two columns); taking the words out read as "the styling
  is broken". He picked printed pages as the default for a PDF read from
  where it is, with the words one tap away (`view: "text"`). The saved
  clip still holds the words, for search and Show as text; at opening,
  files.openLinked swaps .co-body's contents for a slot per page, drawn
  as they're reached like a scan's. A copy keeps only the words, since
  the PDF itself isn't kept, so it stays text.
- **No second copy from the watched folder (1.1.3).** The two ways in
  (read from where it is, a copy) were allowed side by side for the same
  file on purpose, but a file in the watched folder that's also added by
  hand is a duplicate to Daniel. Opening one by hand that matches a
  watched clip by name and size is refused; a scan that meets a hand-added
  linked clip of the same name and size adopts it into the folder, and
  one meeting a copy leaves it. Removing a watched clip keeps its ref in
  `waypage.watch.skip` until the file leaves the folder, or it would be
  back at the next look.
- **call.getLong reads only longs (1.1.2).** FilesPlugin.read took its
  offset with PluginCall.getLong, which returns the default unless the
  JSON value is already a Long; a JS number under 2^31 arrives as an
  Integer, so every read began at byte 0. A zip's directory at its end
  read as its first bytes (an EPUB was "a zip that isn't an EPUB") and a
  PDF's xref pointed into the wrong objects ("Page dictionary kid
  reference points to wrong type of object"), Daniel's two errors on
  1.1.1. The tests' stand-in for the plugin sliced correctly, so they
  never saw it; a stand-in that ignores the offset reproduces both.
  Numbers from JS are read with getData().optLong, which takes any
  number.
- **The library keeps its nodes in place (1.1.1).** renderLibrary ended
  with root.replaceChildren(...nodes): every card it kept was taken out
  and put back, which resets a horizontal strip's scrollLeft, so each
  page landing sent the collections row back to its start. It now removes
  what's gone and moves only what's out of place. The collections strip
  itself is kept too, with its tiles redrawn one by one (fillStrip) when
  their own signature changes, not all of them when any one does.
- **Files with no size (1.1.1).** platform.files.blob reads a file
  as far as its size says, and some providers give no size
  (OpenableColumns.SIZE null), so every read came back empty and each
  book read as damaged. FilesPlugin.info counts the bytes when the
  provider doesn't say. An empty file is now its own error, and the
  others carry the reason in brackets, since Daniel's books failed on the
  phone and the tests couldn't make them fail.
- **Room under the page (1.1.0).** The line along the bottom (section,
  minutes left, the read-aloud player) floats over the reader like the
  top bar, so the page's end sat under it, Next card and all. reader.js
  now sets --co-bottom on the page from that line's height when the page
  opens, as it sets --co-top. Not again when the read-aloud player shows:
  that would change the page's length under the voice.
- **A collection's place is when it was made (1.1.0).** Under Newest
  saved a collection sorted by its newest clip, so every chapter landing
  moved it to the front and a download into several collections shuffled
  them. It's now its first clip's savedAt; the sidebar and the collection
  picker go by the one read last, then the newest made.
- **Saved twice (1.1.0).** Sync's links-only pages wait in state.saving
  under their synced entry (`s.synced`), not under `s.url` alone, and a
  chapter list names a chapter by the address it was asked for
  (`requested`). Save new chapters only checked `s.url`, so it queued
  chapters sync was already fetching. `savingAs()` checks both, and
  oneEach() (sync's oneCopyEach on the local library) folds any pair of
  one address into one at launch and when a run ends. Stop on sync's run
  sets `linksStopped` for the session: sync hands the same pages back at
  its next run, so stopping them any other way lasted seconds.
- **A watched folder (1.1.0).** Android only: FilesPlugin.folderScan walks
  the tree (8 deep, 5000 files, hidden ones left out) on its own thread.
  Each file's document URI under the tree is its `link`, readable through
  the tree's one persisted permission, so a hundred books cost one of
  Android's 128. Clips from it carry `watched` (the tree). A scan that
  can't read the folder (`ok` false) removes nothing, so a memory card
  out doesn't empty the library. Stop watching keeps the clips as plain
  linked files. No copy-or-outside question: a watched folder is read
  where it is by definition.
- **Long PDFs (1.1.0).** A linked scan used to be drawn whole on every
  open. pdf.js now keeps a document open in its sandbox (C.pdf.open) and
  draws one page per message; files.drawNear draws what's within 1.5
  screens and lets go of what's more than 6 away. Each slot has the
  page's width and height and a blank SVG of that size until drawn, so
  the page's length and the saved position don't move. Bringing a linked
  scan in draws only page 1 (for the card) and records every page's size.
- **Packs (1.1.0).** A file's clip's pictures went up inside its page as
  data: until 1.1.0, capped at 20 MB so the page stayed far from GitHub's
  100 MB a file. They now go beside it in pack files of up to 16 MB, the
  page naming each picture as sync:<pack>:<offset>:<length>:<type>, and
  library.json keeping each pack's sha for updates and deletes. One write
  a pack keeps a 300-page comic inside GitHub's limit on writes a minute,
  which one file a picture would break. The cap is 100 MB.
- **Carry-on became Waypage (1.0.0).** Everything named carryon,
  Carry-on or CarryOn was renamed: the app ID (io.github.danielnoam.waypage),
  the Java packages and widget resources, the local plugin
  (waypage-share, WaypageShare.podspec), the JS namespace
  (window.Waypage), localStorage keys (waypage.*), the service worker's
  cache, widget links (waypage-widget://), the folder route
  (/_waypage_folder_/), Documents/Waypage, backups (waypage-backup-…zip,
  waypage.json inside) and clip files (meta waypage-page), the
  User-Agent, the release files and the repo. What kept the old name, on
  purpose: the signing key's alias `carryon` (Daniel swaps the key
  later; a new app ID can use any key), the browser's IndexedDB names
  `carryon` and `carryon-files` (the web copy moved to /waypage/ on the
  same origin, so its library stays put without copying), and the readers
  of old files (a carry-on-page clip file and a Carry-on backup still
  open). The web copy copies its carryon.* settings to waypage.* once.
  Sync looks for waypage-data, then renames carryon-data to it (the token
  has Administration: write because it could create the repo), or uses
  carryon-data as it is when it may not; a copy still set up for
  carryon-data asks GitHub, which answers with the new name. The icon is
  the Open road Daniel picked: drawn as SVG (icon.svg) and
  rendered to icons/ and assets/ by a one-off script; assets/ is new, and
  is where @capacitor/assets finds Android's adaptive layers (the glyph
  inside the middle 66%) and the splash. The bridge code from 0.36.0 is
  gone again: Waypage's own updater only looks for Waypage.apk.
- **The bridge to Waypage (0.36.0).** Waypage gets a new app ID, so it's
  a new app: it installs beside Carry-on, can't install over it, and
  starts with nothing. This release teaches Carry-on's updater to spot a
  release whose assets are Waypage.apk or Waypage.ipa (`upd.moved`); it
  then says "Carry-on is now Waypage", downloads Waypage.apk instead of
  CarryOn.apk and opens the installer, and adds "Send your library to
  Waypage", the usual backup handed to the share sheet. Waypage opens a
  backup sent to it (application/zip is in its Open with list since
  0.31.0) and restores it. With sync on, turning sync on in Waypage
  brings the library instead. The updater reads `build.repo`, which
  stays danielnoam/carry-on here; GitHub redirects it once the repo is
  renamed. Only a Carry-on with this release knows about Waypage: older
  ones would look for CarryOn.apk in a Waypage release and fail, so the
  bridge has to be on the phone before Waypage 1.0 is published.
- **A widget for one collection (0.35.0).** TODO had it waiting on a
  file of collections, but the widget doesn't need one: each widget keeps
  its collection's name in the widgets' preferences
  (`collection.<widget id>`), picked in CollectionPickActivity (the
  widget's `android:configure`, reconfigurable), and the app hands over
  every collection with its next four clips (from the first unfinished,
  or the last four when all are read). A rename in the app calls
  `Widgets.renamed`, which moves the name; a rename synced in from
  another device doesn't, and that widget asks to be picked again. It
  draws with the Favourites layout, its head given the collection's name.
  Favourites puts favourite collections first, newest marked first, as
  the library's Favourites does, then clips, four rows in all.
- **Telling voices apart (0.34.2).** Google's engine names voices like
  `en-us-x-iol-local` and lists most of them twice, `-local` and
  `-network`, so Daniel saw a long run of "Voice 1… Voice 20". Now the
  plugins also send quality (Android `Voice.getQuality()`, iOS
  enhanced/premium) and, on iOS, gender (Android has no field for it).
  Voices are grouped under a head per country, offline and better ones
  first, numbered within their country, and tagged natural (quality 400
  and up), female or male, online. The `-network` twin of a voice that
  is on the phone is dropped, unless it's the one already picked; it's
  the same voice and needs a connection, which a reader for planes
  rarely has. `en-US-language` is the engine's default for that country
  and shows as "Standard". The Hebrew samples' gap is `margin-left`, not
  `margin-inline-start`: the sample is `dir="rtl"`, so its start is its
  right side.
- **Drop-downs fit their box (0.34.1).** A menu hangs below its button,
  absolutely placed; in the reader settings sheet that ran past the
  sheet's scrolling body, and `scrollIntoView` scrolled the body to show
  it, pushing the tabs out of sight until you scrolled back. Now, when
  the drop-down sits in a scrolling box, the menu measures the room above
  and below, opens toward the bigger side and caps its height to fit
  (132px at least). On the page itself it still scrolls the page.
- **Theme under Layout (0.34.1).** Daniel's call: a theme is how the page
  looks, like margins and scroll or pages, not part of the type. It also
  evens out the tabs; Layout had two rows and Text five.
- **The reader's settings in three parts (0.34.0).** Daniel asked for a
  gear instead of Aa and Layout, Text and Read aloud kept apart. In the
  sheet they're tabs (a segmented control), and all three share one grid
  cell with the hidden ones kept in place (`visibility: hidden`), so the
  sheet is always as tall as its tallest part and doesn't jump when you
  switch. Settings shows Layout and Text one under the other, with
  headings. Fonts became the app's own drop-down, each name in its face.
  The speed slider applies on `change`, not `input`: a phone's voice
  restarts its sentence on each new rate. Notes are skipped by default
  now; before, a Wikipedia reflist was read out in full.
- **Where your library is (0.33.0).** Three places, Daniel's call: inside
  the app (default; private, quickest, gone on uninstall), Documents/
  Carry-on (Android 11+, plain files through Capacitor's Filesystem with
  directory DOCUMENTS; no permission needed from 11 for files the app
  makes), and a folder you pick (Android's folder access, so no file
  paths: the Files plugin writes through DocumentsContract, and the
  WebView reads it at `/_carryon_folder_/`, answered by a
  BridgeWebViewClient the plugin sets in `load()`, which keeps
  page-relative `images/3.jpg` working as the reader's <base>). store.js
  has one backend per place and every read and write goes through it.
  Moving copies every file, writes the joined index, reads it back, and
  only then switches and clears the old place; a library already in the
  new place is joined, never replaced. A place that can't be reached
  reads as an empty library, so sync refuses to run then (an empty
  library sent up would look like every clip deleted). On iOS Capacitor's
  DATA is already Documents, so the plist keys show it in Files instead.
- **Every file asks (0.32.2).** 0.32.0 asked only where reading from the
  file saved space (pictures). Daniel's rule is about where a file lives,
  not its size: anything you bring in is either a clip (copy, syncs) or a
  file (Files, this device). So every kind asks; for text the words are
  kept either way. Every way in tries for lasting access: the system
  picker, `getAsFileSystemHandle` on a drop (asked for inside the drop
  event, or it's gone), and `takePersistableUriPermission` on a file
  opened or shared with Carry-on (works when the sender granted it). With
  none, the second row is shown disabled rather than hidden, so the
  choice never silently disappears.
- **A PDF read from where it is, and drawn for print (0.32.1).** 0.32.0
  asked "copy or read from where it is" for a PDF and then copied anyway,
  on the reasoning that once its words are out there's nothing to come
  back for. That broke the promise of the question: the PDF landed in
  Clips, synced, and its delete said it would leave the phone. Now a PDF
  with words keeps those words (they're what search and read aloud need,
  and they're small) and the link; a scan keeps slots (`page:N`) and
  draws its pages from the file each time it's opened. Pages are drawn
  with pdf.js's `intent: "print"`: the screen intent waits on
  requestAnimationFrame, which Chromium never runs in a frame kept out of
  sight, so in 0.32.0 a scanned PDF hung on its first page.
- **pdf.js in a frame with no origin (0.32.0).** A PDF is read by
  Mozilla's pdf.js (vendored, Apache 2.0, like Readability), but never in
  the app's own page: a script in a PDF could otherwise reach the
  Capacitor plugins and every saved clip. It runs in an iframe with
  `sandbox="allow-scripts"` and no `allow-same-origin`, so it has an
  opaque origin, behind a CSP that allows nothing but blob: and inline.
  An opaque origin sends `Origin: null`, and a module or a worker won't
  load across origins, so the app passes the library's **text** in by
  postMessage and the frame makes blob: URLs of its own for pdf.js and
  its worker. `isEvalSupported: false`, scripting and XFA off. What comes
  back is words, not a viewer: lines are grouped by their place on the
  page into paragraphs, broken words rejoined, running heads and page
  numbers dropped, bigger type read as a heading. Under about 40 letters
  a page it's a scan, and the pages come back drawn as JPEGs instead.
- **A copy, or reading from the file where it is (0.32.0).** Daniel,
  6 Oct 2026. A copy is an ordinary clip: pictures beside it, no second
  copy of the file (0.31.0 kept one, which doubled a comic). Reading from
  the file keeps no pictures at all: each one is a slot (`data-in`, its
  place inside the file) filled from the file when the clip opens, so a
  400 MB comic costs a thumbnail. That needs a permission that outlives
  the app, which only the system's own picker grants
  (`takePersistableUriPermission`, or a stored handle in Chrome on a
  computer); what the WebView's `<input type="file">` hands over is
  readable once, so Open with and Share can only ever copy. It only saves
  anything where the pictures are the file, so the question is asked for
  a comic, a book or a PDF and nothing else. A PDF is read once into
  words or pages, so there's nothing in the file to come back for: a PDF
  is always a copy. The permission (`link` on the entry) is this device's
  own, so it never syncs and a linked clip stays where it was opened.
- **A file of your own is a clip, its original kept beside it (0.31.0, in
  part undone by 0.32.0).**
  An EPUB, Markdown, text or HTML file is rebuilt through the same
  allowlist as a saved page (`save.cleanSaved`) and read in the same
  sandboxed reader, so it gets the themes, type, pages mode, read aloud,
  search and contents with no second reader. The book's own CSS is
  dropped for that reason, and its scripts never reach the page. Each
  chapter is a `<section id="cN">`, its ids prefixed `cN-`, so links
  between chapters and footnotes become jumps within the clip. A CBZ is
  a `.co-comic` page, its pictures in natural name order (2 before 10).
  The file itself goes beside the clip as `original.<ext>`, written a
  megabyte at a time (an IndexedDB Blob in a browser): Share sends it on,
  a backup carries it, and the storage setting (0.32) will move it. The
  entry has `url: ""` and `file: { name, kind, ext, size }`; name and
  size say whether a file is already in. Book pictures wait behind
  stand-in `data:` addresses while the page is cleaned, so a book's
  pictures are never held as base64 text. Sync leaves files out until
  their size limits are settled (TODO, Files).
- **What sync leaves per device (0.30.10).** Daniel, 6 Oct 2026:
  settings stay on each device (a phone and a tablet want different type
  and themes), and nothing syncs while the app is closed. When Feeds was
  last looked at does sync (`feedsSeen` in library.json, the latest wins),
  and it only changes when there was something new to clear, so an open
  river doesn't write to GitHub on every sync. New-chapter counts aren't
  synced: each device checks for itself, and the count already drops
  chapters saved anywhere once sync brings them in.
- **A favourite collection is a mark on its clips (0.30.9).** There is no
  collections file: a collection is the clips whose `folder` names it.
  So its favourite is `folderFav` (and `folderFavAt`) on each of its
  clips, and any one carrying it makes the collection a favourite. That
  way it follows a rename, and goes through backup and sync, merged field
  by field, with no new file. A clip moving into a collection takes that
  collection's mark, or loses its own. Favourites in the library shows the
  favourite collections, then every favourite clip, in a collection or
  not; the sidebar lists favourite collections first.
- **Why the fades didn't fade, and the lag on Collections (0.30.8).**
  A spring's curve is 90% of the way there in its first fifth, and the
  fades rode the same curve as the movement, so opacity went from 0 to 1
  in two or three frames. Fades now run as their own animation with a
  plain ease (`run()` in motion.js takes a fade beside the frames).
  Collections and Clips used a view transition, which holds the screen
  still while it takes its pictures (140–270 ms on a 4x slower CPU), then
  animates the groups' size on the main thread; the whole new list also
  gave each card its own arrive animation, 250 at once. Now the library
  fades through (out 90 ms, redraw while it is blank, in 210 ms) and only
  a handful of fresh cards animate. `inert` on the library, which
  restyles every card, waits 300 ms (`afterSettle`) instead of the first
  frame, which put a 50–60 ms stall right at the start of the sidebar.
- **Why animations stuttered (0.30.4).** Not the animations: the work
  before them. Opening anything set `inert` on the screen underneath and
  moved focus, and in a library of a few hundred pages each restyled
  every card, 100 to 170 ms at a phone's speed, before the first frame;
  Back redrew the whole library first. Now the animation starts, then
  that work runs (`afterStart`, or once it ends), library cards off
  screen skip style and layout (`content-visibility: auto`), and screens,
  sheets and the sidebar carry `will-change: transform` so they aren't
  promoted to layers and flattened back around each move. The zoom from
  a card dropped its clip-path, which Chrome can't run on the GPU, and the
  library no longer drifts under a pushed screen (it is the page itself,
  so moving it repainted it). e2e/perf.js times tap to first frame on a
  4x slower CPU.
- **Sync pause (0.30.4).** Pause is kept in the sync config and checked
  between pages: what was sent or brought in stays, pages not brought in
  yet stay waiting. The downloads notification carries a running sync, so
  Android's data-sync service keeps it going in the background.
- **Sync, links only (0.30.3).** A device set to Links only sends no page
  text and reads none: pages new to it come back as `fromLinks` from
  sync.run and are saved again from their URLs, under the library's id
  and savedAt, so the next sync sees the same page and not a new one. A
  device with Pages too also saves from the link any page GitHub has no
  text for (it came from a links-only device), then sends that text up
  itself. In a browser only Wikipedia can be fetched, so other pages wait
  there. The setting is per device, kept in the sync config, since one
  device might be short of space and another not.
- **Growing out of the card (0.30.3).** The tap's card is remembered
  from a capture-phase click on `.card-open`, for a second and a half
  (opening a page reads its file first); pushScreen then zooms instead of
  sliding, and popScreen shrinks back to the same rectangle. A uniform
  scale keeps the text undistorted; clip-path crops the screen to the
  card's height while it's small.
- **Pictures never downloaded on Android (0.30.2).** @capacitor/filesystem
  8's Android downloadFile (LegacyFilesystemImplementation) opens a
  FileOutputStream on the path and ignores `recursive`, so a download into
  a folder that doesn't exist fails with ENOENT. A new page's
  pages/<id>/images/ never exists when its pictures download, so every
  picture of every page failed and was kept as a link, which the reader
  shows online; it looked like it worked. platform.downloadTo now makes
  the folder first (FS.mkdir, recursive). e2e/dirs.js mocks the failure.
  Pages saved before 0.30.2 fetch their missing pictures once
  (carryon.picturesHealed). The e2e mocks never caught it because their
  downloadFile wrote anywhere.
- **Sync setup and feeds (0.30.1).** Step 2 links to GitHub's
  fine-grained token form filled in by URL (name, description,
  expires_in=none, contents=write, administration=write; documented
  since Aug 2025). Which repos it covers can't be filled in, so the step
  says to pick All repositories; Administration is what lets Carry-on
  make carryon-data. No expiry because a token that runs out in 30 days
  stops sync without anyone noticing. Another device joins with
  LifeLog's setup link, the web copy's address plus `#t=<token>` (a
  browser never sends the part after # to a server), shown as a QR code
  drawn by src/qr.js (LifeLog's encoder, so the token never goes to a
  QR service). A phone camera opens the link in the browser, which turns
  sync on in the web copy; the app reads the code with
  @capacitor-mlkit/barcode-scanning (Google's scanner on Android, so no
  camera permission; iOS needs NSCameraUsageDescription and iOS 15.5).
  The token field also takes the whole link. Feeds sync as settings
  only (url, title, link, icon, mode, images, folder, days, addedAt) in
  library.json's `feeds`, merged by address against the base like
  pages; an unfollow is a tombstone in `feedsGone`, and following again
  later (a newer addedAt) lifts it. Posts never go: each device checks
  its feeds itself. A device on 0.30.0 sends no feeds and leaves them
  as they are.
- **Sync (0.30.0).** src/sync.js, after LifeLog's src/storage.js, which
  Daniel says works well. A private repo `carryon-data` holds
  library.json ({ pages, deleted, files }) and pages/<id>.html. Each sync
  reads library.json, merges three ways against the last library this
  device wrote or read (the base, in localStorage), sends any page text
  GitHub lacks, writes library.json with its sha, and on a 409 merges
  again with what the other device wrote (LifeLog's 0.180.0 lesson:
  never write over a stale sha). Field rules: content fields go with the
  copy saved last, reading (at, finished, readAt) with the copy read
  last, tags merge as sets, anything else takes the side that changed.
  One address saved on two devices becomes one page. Deletions are
  tombstones kept 90 days, so a device joining later doesn't bring a page
  back. Pictures never go up (Daniel, 5 Oct 2026): outgoing HTML has its
  local pictures marked missing, keeping data-full/data-preview, and the
  other device fetches them with retryMissing in its page's mode. A
  video's picture now keeps its address in data-thumb for this. Pictures
  that can't be fetched again (a Tapas panel's signed link lasts an hour)
  stay missing there. Two traps found in testing: the sync must settle
  its result without awaiting anything, or a change made meanwhile is
  written over; and the app must update its page objects in place,
  because the open page, an open menu and the position timer hold them.
  Synced HTML isn't re-cleaned: it's the user's own repo, written by the
  app, and the reader's sandbox is the guard either way.
- **Favourites (0.29.2).** A mark on the page (`fav`, with `favAt` for
  the widget's order) in library.json, kept by backups and by saving a
  page again. Pages only: a collection isn't stored anywhere of its own
  (it exists while a page names it), so a favourite collection would need
  a file for collections first. The Favourites widget shows the four
  favourited last; its header opens the library showing Favourites.
- **WEBTOON, Tapas and Wattpad (0.29.1).** Built from pages Daniel saved
  from each site, since this environment can't reach them. WEBTOON:
  `comic(url)` says its /viewer pages are comics, so they save as comics
  (full pictures) whatever was picked; the list page shows ten episodes a
  page and is read with `&page=N` until nothing new. Tapas keeps comics
  and novels at the same /episode/ addresses, so `comic(url, html)` looks
  at the fetched page (og:type `comicpanda:webcomic_episode`); next and
  previous come from the episode's data-next-id/data-prev-id. Its series
  page shows twenty episodes and the rest come from
  `/series/<id>/episodes?page=N&sort=OLDEST` as JSON with the list's HTML
  in data.body; that address is from how Tapas's own page loads more and
  isn't checked against the live site, so if it fails the twenty are
  kept. The page's own series id is in its tracking data
  (data-tiara-page-meta-id), skipping the recommended series beside it.
  Wattpad sends a chapter's first page only; the new `prepare(html, url)`
  hook fetches the rest from the part's text_url before the page is read.
- **Quicker page turns (0.29.1).** The WebView's smooth scroll took most
  of a second for a screen's width, and a second tap during it read the
  half-scrolled position. A turn is now a 220 ms ease-out on
  requestAnimationFrame, and while it runs `page()` is the page it is
  going to, so taps add up.
- **One-row Keep reading (0.29.1).** On Android 12 and later the widget
  hands the launcher a layout per size (RemoteViews from a SizeF map);
  before that it picks from the height it was given, on every resize.
- **Back opens the sidebar (0.29.0).** Daniel meant the phone's own Back
  gesture, not a swipe inside the app. With @capacitor/app's backButton
  listener the app decides: history to step back through goes back as
  before; at the top of the library or Feeds Back opens the sidebar, and
  Back with the sidebar opened that way puts the app away, so Back still
  leaves the app. Android can't tell which edge Back came from. The
  0.28.2 swipe from anywhere went: it fought reading sideways rows and
  the system gesture. iOS and browsers have no Back to use, so a swipe
  from the left 24 px opens it there.

- **Pages (0.29.0).** The reader's page gets CSS columns, one a screen
  wide: the column is as wide as the reading measure allows, centred,
  and the gap is twice the side margin, so a column and its gap are
  exactly one screen and page n is scrollX = n × width. The frame's
  root has overflow hidden, so only src/reader.js moves it (taps at the
  outer thirds, a sideways swipe, arrow keys); nothing runs inside the
  sandboxed page. Position is the page over the last page, so `at`
  works for both layouts and switching keeps the place. Comic chapters
  always scroll. Images are capped to a page's height and figures don't
  split across pages.

- **Widgets (0.29.0).** Plain AppWidgetProviders drawing RemoteViews from
  what the app hands over (Widgets plugin, preferences), so they show
  nothing the app hasn't worked out: the page read last that isn't
  finished, and the three newest unsaved posts. Handed over when the app
  goes to the background and after feeds change; the closed app's feed
  checks refresh the count. A tap opens the app with an address naming
  what to show (carryon-widget://page/<id>, …/post, …/feeds). Colours are
  Paper and Night tokens as resources, by the phone's dark mode, since a
  widget can't know the app's theme. Going to the background saves the
  reading position only when one is pending: writing the index from a
  library that hadn't loaded yet would empty it.

- **Feeds checked with the app closed (0.28.4).** Daniel picked "check
  and notify" over saving in the background: the app's JavaScript doesn't
  run with the app closed, so saving there would mean a second copy of
  the saving code in Java. FeedCheckJob is a JobScheduler job (built in,
  no WorkManager dependency), every 3 hours with a network, kept across
  restarts. It only reads each feed and compares its posts' ids (guid or
  id, and the link) with the ones the app hands over in feeds.json after
  every change; a post none of whose ids is known is new. The ids it
  announced go in feeds-told.json, so a post that the app and the job
  spell differently is announced once at most, never every run. What's
  waiting stays in preferences until the app takes it (on start, on
  coming back, or the notification's tap), marks those feeds due and
  reads them itself. Android 13 asks for notifications on the first
  follow, or on the first launch for feeds followed before. iOS has no
  equivalent worth building: background refresh runs when iOS decides,
  often not for days.

- **Feeds in backups (0.28.3).** A backup gains `feeds.json` beside
  `library.json`; older backups simply have none, and older versions
  ignore it, so the format number stays 1. A restored feed comes back
  with its posts (and which ones were already tried) but unchecked, so
  it's read again soon after. A feed followed already isn't touched:
  its settings here are newer than any backup's. Feeds from a file are
  cleaned like pages: http(s) addresses only, known values only.

- **Gestures (0.28.2).** The sidebar opens on a swipe to the right from
  anywhere in the list, not only from the edge: Android's gesture
  navigation keeps the left edge for Back, so an edge swipe would rarely
  reach the app. Rows that scroll sideways (chips, the collections
  shelf) keep their swipes. Pull to check is drawn by the app (a gap
  with a ring over the list) since a WebView has no native refresh
  control; it starts only at the very top, and Check now stays for a
  mouse, where pulling isn't possible. Holding a feed reuses the 480 ms
  long press of the library's cards. The page turn fades the reader out
  before the next page loads, and in once it has, so the swap itself is
  never seen (up and from the bottom since 0.30.3).

- **Reading a post without saving it (0.28.1).** Daniel asked for a tap on
  a post to show it in the app. `C.save.preview` runs the same reading
  pipeline as a save with pictures as links and writes nothing; the
  reader shows it under a `preview:` id, so its position isn't kept and
  forward navigation to it steps back instead of opening a missing page.
  Its ⋯ is a small sheet with Save and Browser, since tags, collection
  and delete make no sense for a page that isn't kept. The sidebar shows
  three collections and three feeds, the ones touched last, so it stays
  short; the library and the chips list the rest. Select left the
  library's tools because a long press already starts it.

- **Feeds, one river (0.28.0).** Daniel picked the river from three drawn
  options (a list of feeds, one river, feeds as collections). Feeds are
  fetched like pages (CapacitorHttp, no CORS), parsed with DOMParser's
  XML mode (which runs nothing) into plain text, and kept in
  localStorage (`carryon.feeds`): only id, link, title, date and when it
  was first seen per post, at most 100 per feed. Posts a feed drops stay
  while they're inside its window, so a busy feed doesn't lose the
  morning's posts by evening. "New" for the sidebar's pill means first
  seen after Feeds was last open (`carryon.feedsSeen`), so it clears by
  looking, not by saving everything. A feed set to Save them marks each
  post `tried` once queued, so a post that fails isn't retried on every
  check. Saving goes through the existing `savePage`/`saveAll`, oldest
  first, so a feed's collection reads in order and runs show in
  Downloads; one feed's saves wait for the last one's. Checks happen
  only while the app is open (every 15 minutes it looks for feeds not
  checked in 3 hours); background checks would need native work like the
  iOS downloads question. In a browser most feeds can't be read (CORS),
  and the error says to follow in the app. Feeds aren't in backups yet.

- **The browser release, with no server (0.27.12).** Daniel chose no
  server: a fetch proxy means hosting, accounts and an open proxy's abuse
  and legal exposure, and an extension is a second codebase. So the
  browser reads, saves Wikipedia (CORS allowed), and gets everything else
  from the phone by backup. A browser has no directory for pictures, so a
  restore puts them into the page HTML as `data:` URLs (the reader's CSP
  already allows `data:`), and each page's card picture is kept as its
  own IndexedDB key (`<id>:thumb`) read once at start-up; `p.thumb`
  stays the phone's relative path so a backup made in the browser goes
  back to the phone unchanged. The index moved to IndexedDB because a
  phone's library can outgrow localStorage's ~5 MB, which failed
  silently. `navigator.storage.persist()` is asked after a save or a
  restore, and from Storage; Chrome decides without asking, Firefox asks.
  The install offer (`beforeinstallprompt`) is kept for an Install row in
  About rather than the browser's own banner. `imageBytes` now survives a
  backup (`cleanMeta` dropped it).
- **A collection is a book page (0.27.11).** Daniel picked it from three
  drawn options: the seven tiles above the chapters read as a toolbox,
  not a book. Its tools went into a ⋯ popover rather than a sheet,
  since every entry leads somewhere else. Rename, Reorder, Story page and
  Export stay in-place modes of the screen (no history entry), with the
  bar's Cancel, Save or Done, so Back still means leave the collection.
  Dragging uses pointer events on the handle alone, with `touch-action:
  none` there and nowhere else, so the list still scrolls; the arrows
  stay for keyboards and screen readers and the handle is hidden from
  them. What's saved needs pictures apart from the rest: saving records
  `imageBytes` from the bytes it already counted, and pages saved before
  are measured once from their `images/` files (readdir's sizes) when
  What's saved first shows them. In a browser pictures are always links,
  so nothing there needs measuring.
- **Search behind its button, Select beside Order (0.27.10).** Daniel:
  the field needn't always show now the bar has a Search button, and
  Select didn't belong with the app's places (Search, Downloads,
  Settings). Select acts on the list, so it sits with Show and Order. The
  field closes when it loses focus empty, not on every blur, so a typed
  search survives scrolling and opening a page.
- **Downloads, and saving in the background (0.27.9).** Daniel asked for
  saving to move out of the library into a screen of its own and to keep
  going with the app closed or the phone locked. The TODO thought that
  meant moving the fetching into native code. It doesn't on Android:
  Capacitor never pauses the WebView's timers (`handlePause(keepRunning)`
  with KeepRunning on), so the JS loop keeps running as long as the
  process does; what stops it is Android freezing or killing a
  background app. So `DownloadService` is only a foreground service of
  type dataSync with a partial wake lock (leased 10 minutes, renewed by
  each progress update) and a progress notification with Stop, started
  by `Downloads.update()` while anything downloads and ended by `stop()`.
  Chromium still slows a hidden page's timers to about once a second,
  which only stretches the half-second pause between pages. Android 13
  asks for notifications at the first download; refused, the saving
  still goes on, only the notification is hidden. Android 15 caps
  dataSync at six hours a day (`onTimeout` ends it). A swipe away from
  Recents can still end it on some phones. iOS can't run the app's own
  work in the background at all, short of rewriting the saving in Swift
  around background `URLSession` downloads, so its plugin holds a
  background task: the page in progress gets the half minute iOS
  allows, and the loop picks up when the app comes back. Untested on a
  phone from here: the CI builds it, Daniel's phone is the test.
  In the app, Save again (`refreshFolder`) became a run of jobs that know
  the page they replace (`job.again`), so it shows, pauses and stops like
  any other run, and Try again on any failed page re-runs the same job
  (`retryJob`), keeping its collection, place and tags, instead of
  saving the link anew. Finished entries (`state.finished`) last the
  session only: they're a receipt, not history. The plan's "dot while
  downloading" became the ring alone, since a dot on the ring's start
  read as clutter; the dot is kept for failures.
- **Blogger chapters cut at their headings (0.27.8).** The Zombie
  Knight Saga posts by length, so a post can hold the end of one chapter
  and the start of the next, and carries both labels. Each chapter starts
  under a heading line ("Chapter Two: …") followed by a short line
  linking to its own label ("Click to display entire chapter at once").
  `trimToChapter()` uses those label links as anchors: everything before
  the chapter's own heading goes (with it the blog's note to new
  readers), and everything from the next chapter's heading on. A blog
  without such links is left as it was.
- **Three library layouts (0.27.7).** Daniel asked for all three
  directions from the design canvas, Shelf by default, chosen in
  Settings, Appearance (`carryon.layout`). They share one renderer and
  one set of cards: `#libraryView[data-layout]` restyles them, and only
  One list builds differently, putting each collection's tile among the
  pages (keyed `t:<name>`) and adding group overlines (`h:g:<group>`).
  To order collections alongside pages, `asItem()` turns one into a
  page-like item (newest `savedAt`, latest `readAt`, total `minutes`,
  first page's `site`) for the same `BY` comparators. The filter chips
  became one Show dropdown beside Order, moved over the whole library
  (in `#libTools`, under search), because the old row sat between
  Collections and Pages yet filtered both, and its tag row grew with
  every tag. `dropdown()` gained `{ head }` entries for the Tags heading.
  The bar is its own sticky element (`#topBar`), not inside the header,
  since a sticky element only sticks within its parent. The list rows'
  cover is absolutely placed, not a grid row: a grid with `1fr` rows
  around a spanning 96 px cover grew 23 px taller than the cover.
- **Covers and site icons (0.27.6).** A collection's cover is its
  story page's `og:image` (Royal Road and Scribble Hub put the cover
  there), read whenever the page is: linking it, a check for new
  chapters, a Save several with a story page, or once a session on
  opening a linked collection with none. It is kept small (preview
  width) in `pages/_covers/` and named on every page of the collection
  as `cover` (with `coverFrom`, the link, so it isn't fetched again);
  collections have no file of their own. Backups don't carry
  `_covers/`, so a tile whose cover fails to load drops it and reads it
  again. A page's icon is the largest `<link rel=icon>` or apple touch
  icon up to 256 px, else `/favicon.ico`, kept as `icon.*` beside the
  page at save; pages saved before try the site's `/favicon.ico` while
  online, and the site's first letter stands in when nothing loads.
- **Dropdowns on Save with options (0.27.5).** Daniel found the rows of
  collection and tag chips too much. Both are now `dropdown()` as a form
  field (`.field-pick`), which gained `placeholder` (shown in `--muted`
  when nothing is picked, for "Add a tag") and `set(value)` (so Find
  chapters can pick a collection or switch to New collection… with the
  name filled in). "New collection…" and "New tag…" open the same text
  fields as before. The page's own ⋯ sheets keep their chips: they show
  one page's few tags, not a whole library's.
- **The stuck library (0.27.4).** Daniel: a tap on a collection or page
  sometimes left everything stuck. `popScreen` hid the screen when its
  slide-out animation ended, so back then a tap on the same collection
  within about half a second re-pushed it (library made inert) and then
  the old animation finished and hid it: the library showed but was
  inert. Each push is now counted and a pop only hides the screen if it
  wasn't pushed again since. A second tap on a page while its file is
  still loading is also ignored, so it can't push two reader entries.
- **Where reading aloud could still end early (0.27.3).** Daniel's
  saved Zombie Knight chapter (copied to the e2e as zk-ch1.html) has
  each post's lines inside one `<span>` with `<br>`s, so 0.27.2's
  wrapping saw an inline element holding breaks and skipped it whole;
  `wrapLoose` now splits inside such inline wrappers. Looking for the
  same kind of hole: text beside a nested block (a Scribble Hub
  author's note is a blockquote with a heading `p` and loose text after
  it; an `li` with a sublist) was never read either, since the outer
  block isn't a leaf and its text sat inside a block; such text is now
  wrapped too. Closed `<details>` (spoilers) are skipped, the summary
  read. The browser engine ended the whole reading on any piece's error;
  now only "not-allowed" ends it and other errors move on, like the
  Android watchdog.
- **Reading text with no paragraphs (0.27.2).** Blogger posts (the
  Zombie Knight serial) keep their text straight in a `<div>` between
  `<br>`s, so `readable()` found no `p` past the byline and the reading
  ended there, and a selection there had no block for "Read from here".
  The reader now wraps each run of such text between line breaks in an
  inline `span.co-run` (no change on screen, `box-decoration-break:
  clone` so its light wraps cleanly) and reads those as blocks. Done in
  the reader rather than at save so pages already saved are fixed too.
- **Why reading aloud stopped at gaps (0.27.1).** Daniel heard it stop
  partway. Not reproducible off a phone, so three likely causes are all
  fixed: a block with no letters or digits ("* * *" scene breaks in
  serials) is no longer sent, since some engines say nothing back for a
  piece they can't voice; SpeechService gives every piece a deadline of
  8 s plus 160 ms a character (at 1×) and goes on if the engine never
  reports it done; and a transient loss of audio focus (a notification,
  another app) now pauses and resumes on regaining focus instead of
  staying paused. "Read from here" takes the selection's block and its
  offset (`selectionSpot` in reader.js), finds the selected word nearest
  that offset in the block's spoken text, and starts the reading there,
  the block split in two pieces.
- **Read aloud goes on with the screen off (0.27.0).** Daniel chose
  screen-off reading over a simpler screen-on version. So the native side
  owns the reading, not the page: the app sends the whole page as pieces
  of up to 600 characters (sentences, cut after a comma when one runs
  long), and native/share's Speech plugin reads them in order. On Android
  that is SpeechService, a foreground service of type mediaPlayback with
  the TextToSpeech engine, a partial wake lock, audio focus, and a media
  session with a notification for previous, play or pause, next and
  stop. On iOS the rest of the page is queued in AVSpeechSynthesizer at
  once (so it reads on while the app is suspended) under the "audio"
  background mode, with lock-screen commands. The page only listens:
  "progress" events say which piece started, the reader lights that
  piece's block, and on coming back from the lock screen it asks
  `state()` where the reading got to. A browser uses speechSynthesis
  one piece at a time while the page is open. Pause on Android stops the
  engine and starts the piece again on play; iOS pauses at a word.
  Android 11 only finds the TTS engine with the TTS_SERVICE `<queries>`
  entry in native/share's manifest. None of this can be tried off a
  phone.
- **The read-aloud light (0.27.0).** The block being read gets
  `--preview` behind it, the color an image's empty box has, so no new
  token; the contrast test now checks ink and accent on it, which made
  Solarized's `--preview` a shade lighter.
- **Blogger serials and the feed (0.26.0).** A serial on Blogger puts a
  chapter in several posts ("Page 1" to "Page 14") under a label like
  `ch1`, and its contents page is plain text with no links. The rule in
  `SITES` reads the blog's JSON feed instead of its pages: a label page
  becomes `/feeds/posts/default/-/<label>?alt=json`, its posts joined
  oldest first into one chapter, with next and previous being the
  neighbouring `chN` labels that exist; the home or a contents page
  lists every `chN` label from the summary feed's categories. A single
  post reads `.post-body` and the Newer and Older Post links. Written
  from saved copies of thezombieknight; the sandbox can't reach the
  real site, so the first real save is the test.
- **A collection's story page and Save again (0.26.0).** `source` is
  kept on each of the collection's index entries (there is no file for
  collections), so it travels with backups. With a source, the check
  reads its chapter list and keeps it as `all`, so "Save N" saves the
  missing ones, wherever they sit. Save again re-saves each page with
  `save()` and copies its place, order, tags and read state onto the
  new entry before removing the old file; a failed page keeps its old
  copy.
- **Our own dropdown (0.26.0).** The system `<select>` drew a different
  menu on Android, iOS and desktop, none in the app's type or themes.
  `dropdown()` in app.js is a listbox button: arrows, Home, End and
  Escape work, a tap outside closes it, and its rows are 44px.
- **Reader bars on tap (0.26.0).** Bars that came back on any scroll up
  popped in while reading back a paragraph. Now only a tap brings them
  back; any scroll of more than 12px hides them, measured from where
  the tap left the page. They still show at the top, at the end and
  under a sheet.
- **Pressed states (0.26.0).** `--press` is a translucent tint per
  theme, laid over a control's own fill as a background image, so one
  rule fits accent buttons and plain rows alike. Rows and choices only
  tint; small controls also scale to 0.97, which reduced motion drops.
- **Export and saving to the device (0.25.2).** One Export in the page
  sheet replaces Send, Send as EPUB, Print and Send page source. A file
  is written to the cache, then either handed to native/share's FileSave
  (Android's ACTION_CREATE_DOCUMENT, copied in on a thread; iOS's
  document picker for exporting, as a copy) or to the share sheet. A
  build without FileSave falls back to the share sheet, a browser to a
  download. PDF stays the print screen's Save as PDF: making a PDF in
  JavaScript would need a library. Markdown (`exportMarkdown` in
  backup.js) walks the saved page's blocks; images use `data-full`, the
  site's address, because the local preview can't go with the file.
- **Telling a contents page from a page (0.25.1).** A chapter word
  must stand alone ("Sep 12" was "ep 12", and /2025/sep/03/ in an
  address was episode 3), and the share of linked text is counted
  without nav, header, footer and aside, with at most 3,000 characters
  of other text. 0.25.0 took news stories under a big menu, with dated
  related links, for lists of chapters. A guess can still be wrong, so
  Save with options opened from one offers "Save it as one page
  instead", which saves with `asPage` and skips both the guess and the
  site rules' `contents`.
- **Site rules (0.25.0).** `SITES` in src/save.js holds a rule for
  each serial-fiction site the general reader gets wrong, matched by
  host and tried before it: `contents` (this page lists chapters),
  `list` (the chapter list from any chapter, for Find chapters),
  `chapter` (the text, title, series and author, and next or previous
  where the site has no link for them) and `fetch`/`clean` (the address
  fetched and the one kept). The selectors come from WebToEpub's
  parsers (read for facts, not copied); the sandbox can't reach the
  sites, so each rule is tested against a fixture in the e2e suite
  built to the same markup, and "Send page source" exists so a page
  that breaks can be handed over and a fixture made from it. Royal Road
  hides a "stolen from Royal Road" line among the paragraphs with a
  class its inline `<style>` sets to `display: none`, which a DOMParser
  document doesn't apply: `removeHidden` removes what top-level rules
  hide (rules inside `@media` are left alone). Its fiction page lists
  every chapter in `window.chapters`, read without running the script.
  AO3 asks adults to click through, so its pages are fetched with
  `view_adult=true` and kept without it, which is how next links name
  them. A page from a rule keeps `series` (the story's name) in its
  meta, which names its folder instead of guessing from the title.
- **New chapters (0.25.0).** A folder is a series when its pages link to
  each other by next or previous. Its last page's next link is read
  again from the site, since the one kept at save time is "" when it was
  the newest chapter; a new one replaces it, so the folder's Save next
  row appears, and the walk on from it counts up to 10. Results live in
  `carryon.newChapters` by folder name, `{ at, count }`; the count
  shown is that less the folder's pages saved since, and nothing once
  the last page's next is saved, so it never needs writing back. The
  daily check runs a moment after launch and when the phone comes back
  online, one folder at a time, skipping any checked in the last day.
- **Fonts, Hebrew fonts and themes (0.24.0).** The new fonts are Google
  Fonts' own Latin subsets (variable 400 to 700 where the family has
  one), so 13 families add under 1 MB. The four Hebrew faces carry only
  Hebrew letters (their unicode-range says so), and `--reader-font`
  lists the picked Latin font, then a Hebrew one, then a generic: the
  browser takes each letter from the first face that has it, so a mixed
  page needs nothing else. With Hebrew on Auto, a serif picks Frank Ruhl
  Libre and a sans picks Heebo; System leaves Hebrew to the phone.
  OpenDyslexic's licence reserves its name for unmodified files, so it
  ships as released (regular and bold, about 100 KB each, no subset)
  and italics are slanted by the browser. Themes are token sets like
  the first three and pass the same contrast test; Auto keeps a light
  and a dark pick in `carryon.themeAuto` (Paper and Night by default).
  Font, Hebrew and theme pickers scroll sideways in Aa so the sheet
  leaves the page visible while you change it.
- **Size and spacing are numbers (0.24.0).** `size` is px (14 to 32)
  and `spacing` a multiple of the size (1.20 to 2.20); old prefs, a
  step index and a word, are mapped on load (step 2 is 19 px, "normal"
  1.60), so nobody's page changes on update.
- **Comics are chosen, not guessed (0.23.2).** 0.22.0 looked for a
  column of four or more big pictures on every page and saved those as
  comics at full size. On real sites that fired on articles with photo
  galleries, so Daniel's saves came out as the wrong kind. Now `save()`
  takes `kind` ("article" by default, "comic" from Save with options),
  a comic never goes through the contents-page check (its chapter menu
  looks like one), and its image setting is whatever was picked (Full
  is preselected). With no clear column, a comic keeps every picture
  that could be a panel. Save next carries `kind` and `mode` from the
  page it follows.
- **Where filled-in chapters go (0.23.1).** With "Skip pages already
  saved" on, a new link's place comes from its neighbours in the list
  that are already in the folder: between them (an even share of the
  gap), just before the next one, or just after the last one; links with
  no neighbour in the folder go at the end as before. Before this, every
  new page went at the end, so filling in chapters 1 to 40 under 41 to
  60 put them after 60. "Sort by chapter" repairs folders saved that
  way, using `chapterNumber` (title first, then address); pages with no
  number keep their order, at the end.
- **A run is one card (0.23.0).** A run of saves into a folder (Save
  next 5 or more, Save several with two or more new links) has a `run`
  object: counts, the page in progress, paused and stopped. The library
  draws one card for it from start to end, keyed by the run, so pages
  coming and going don't move what's below; its pages' own cards stay
  hidden until it ends, failures included, which then show with Try
  again. Pause is checked before each next page, never mid-page, so a
  half-saved page is never left behind. Runs live in memory: closing
  the app ends them, as before.
- **Skip pages already saved (0.23.0).** On by default in Save several:
  saving a contents page again into the same folder should only fetch
  what's missing and leave the rest alone. Off, the old behaviour stays
  available: already-saved pages move into the folder at the list's
  place, which reorders a folder to match a contents page.
- **Storage opens in place (0.23.0).** Groups open and close in the
  Storage section rather than pushing a screen: one level of disclosure
  keeps Back simple, and the open groups are remembered until the app
  closes.
- **The bar token (0.23.0).** `--bar` is the reader's top bar, its foot
  and the status-bar strip: #EDE8DF on Paper, #E7DAC0 on Sepia (darker
  than the page) and #181C22 on Night (lighter, since darker than
  #0F1216 wouldn't show). Muted text on it is 5.6, 4.8 and 6.6 to 1.
- **How an image chapter is recognised (0.22.0).** After lazy pictures
  are resolved, the page's pictures that could be panels are kept: an
  http address, not a tracking pixel, at least 400 × 200 when the page
  says its size, and nothing in the address, class or alt that reads
  like page furniture (logo, avatar, icon, banner, ad, thumb, spinner…).
  Each is counted against its four nearest ancestors; the chosen box is
  the nearest one holding at least 80% of the fullest box's count, so an
  ad beside the column doesn't pull the choice out to the whole page. It
  needs four pictures and 60% of them, and less than 120 characters of
  text per picture, or the page is an illustrated article. Image chapters
  always save full size: a 480 px preview of a page of speech bubbles is
  unreadable. Script-drawn chapters with no pictures in their HTML are
  not covered yet unless the hidden-WebView drawing kicks in.
- **Referer is the page's origin (0.22.0).** Pictures are downloaded with
  `Referer: https://site/`, the origin as browsers send it across sites
  by default, not the full address. It is sent for every save, not only
  image chapters: many news and image hosts check it too.
- **A tap and a double tap on a panel (0.22.0).** A tap on text shows or
  hides the bar; on an image chapter the whole screen is pictures, so a
  single tap waits 280 ms for a second one: one tap is the bar, two open
  the viewer to zoom. Pinch zoom stays in the viewer, so the reader's
  iframe keeps its fixed scale.
- **The size warning (0.22.0).** Save next or previous 5, 10 or All
  averages the folder's three most recently saved pages; at 5 MB or more
  each it asks first, with the total for a number and the size each for
  All. One more never asks.
- **How a contents page is recognised (0.21.0).** Before Readability
  runs, the page's same-site links are grouped by the list, table or
  block they sit in, and the group with the most links that carry a
  chapter number ("Chapter 12", "Ch. 3.5", "פרק 4", "7. …", or
  /chapter-9 in the address) wins, if it has three and they are at least
  half the group. A page is a contents page when that list has five or
  more and more than 40% of its words are links (WebToEpub's scanner
  uses the same 40%); then nothing is saved and Save several opens with
  the list. Lists stay in the page's order, turned around when the
  numbers mostly go down (newest first); they are not sorted, since
  "1.01 … 1.10" numbering sorts wrong as numbers. A contents page with a
  long description saves as an article, so Save several has "Find
  chapters on this page" for one link. Not covered: contents split over
  several pages, or drawn by scripts; Save next and previous, All cover
  those.
- **A long run is one card (0.21.0).** More than three waiting saves for
  the same folder show as "N pages waiting to go into …" with Stop,
  instead of a card each; Stop drops the waiting ones and keeps what
  saved. Links already saved still move into the run's folder, as Save
  several always did.
- **Covers are the first picture or a drawn title card (0.21.0).** The
  title card is drawn on a canvas at 1200 × 1800 in the Paper colours
  and the bundled type, right to left for Hebrew, and saved as a JPEG in
  the book only. A folder's book also opens on a cover page; one page's
  book doesn't, since its first screen already shows the title.

- **What Carry-on takes from WebToEpub (0.20.0).** WebToEpub (the
  browser extension that packs web novels into EPUBs) was read before
  writing the EPUB export. It is GPLv3, so no code is copied: epub.js is
  written from the EPUB 3.3 spec, and only these ideas come from it.
  `mimetype` first and stored; both nav.xhtml and toc.ncx, since older
  readers and Kindle's conversion still read the NCX;
  `dcterms:modified` without milliseconds; the legacy `<meta
  name="cover">` (name before content, for Nook) beside the
  `cover-image` property; chapters built in an XHTML-namespaced document
  and serialised with XMLSerializer, then parsed back as XML to prove
  they're well-formed; numbered file names; no WebP (it warns that
  readers may not show it), so epub.js turns WebP into JPEG on a canvas.
  Where it differs: EPUB 3 always (WebToEpub defaults to EPUB 2), a
  `urn:uuid` identifier rather than the address, and no SVG cover page,
  since one article doesn't need a cover screen. epubcheck 5.4 passes
  English and Hebrew pages and a two-page book in the e2e run; it isn't
  in `node test/run-all.js`, which has no Java.
- **"Save all chapters" from a contents page: yes, for 0.21.0, as a
  list to check (0.20.0).** WebToEpub's generic finder takes every link
  on the page in order, with no host or container logic, and is usable
  only because the user filters it, picks a range and ticks boxes; its
  427 per-site parsers exist for contents split over several pages or
  drawn by scripts, and for finding the text. Carry-on already finds the
  text (Readability, and the hidden WebView for script-built pages), so
  it needs only the list: same-host links, the largest group of sibling
  links, sorted by chapter number, shown in Save several to check
  before saving. It won't follow a contents page split over several
  pages; Save next and Save previous, All cover those series instead.
- **Saving runs one page at a time, half a second apart (0.20.0).**
  "All" could mean hundreds of chapters, so pages come in one after
  another with a 500 ms pause (what WebToEpub uses), and Stop ends the
  run after the page being saved. Previous pages get `folderAt` just
  below the first page's, so they go in front without renumbering the
  folder. Pages saved before 0.20.0 never looked for a previous link
  (`prev` is missing, not ""), so a folder reads its first page's from
  the original once, quietly, when it opens.
- **PDF goes through the phone's print screen, not a PDF writer
  (0.20.0).** Android's WebView ignores `window.print()`, so
  native/share has a Print plugin on both platforms (PrintManager with a
  WebView's print adapter; UIPrintInteractionController with a
  WKWebView's print formatter on iOS). The page goes in as the same
  one-file HTML as Send, pictures inlined, laid out in a WebView of its
  own with JavaScript and the network off and a CSP that allows only
  `data:` images. The web copy prints it from a frame sandboxed without
  scripts. Neither plugin can be tried off a phone.
- **The folder's tools moved to the top (0.20.0).** Daniel asked for
  them at the top, where a long folder doesn't hide them. They are the page
  sheet's tiles, so a folder and a page look alike; Save previous sits
  above the list and Save next below it, where those pages will go.

- **The UI rework follows sketches Daniel picked (0.19.0).** The design
  canvas has the 0.19.0 rows: library A (sections) over B (tabs), the
  grouped ⋯ and the Settings menu. Daniel's AI design guide was checked
  against them: its Apple HIG, spring motion, 8-point spacing and WCAG
  AA rules were already DESIGN.md's; its React, Tailwind, shadcn and
  Framer Motion defaults don't apply under the no-build rule.
- **Picking several is a history entry, and so is the library's sheet
  (0.19.0).** Back leaves picking, and a sheet over picking is its own
  entry with `select: true`, so back from Tags lands on picking, not the
  library. Picks are painted onto the cards already there (`paintPicks`)
  instead of re-rendering, so focus stays on the card that was tapped.
  Going forward in history onto a sheet steps back off it, as the image
  viewer does, since its contents can't be rebuilt from the entry.
- **A long press is our own timer, plus `contextmenu` (0.19.0).**
  Android's WebView fires `contextmenu` on a long press, iOS's doesn't,
  and a mouse fires it on right-click. A 480 ms timer that a 10 px move
  cancels covers touch everywhere; whichever of the two comes first
  opens the menu and the click that follows is swallowed. Cards can't be
  text-selected or called out, so the press doesn't select the title.
- **"Last read" needs `readAt` (0.19.0).** Opening a page stamps
  `readAt`, which Continue reading, the "Last read" order and the
  folders' order use. Pages read before 0.19.0 don't have it, so they
  sort by when they were saved until they're opened again. Backups keep
  it.
- **Tapping the page toggles the bar, scrolling still moves it (0.19.0).**
  A tap on text (not a link, an image or a selection) hides or shows the
  bar; scrolling down still hides it and up brings it back. Jumping to a
  heading counts as scrolling down, so the bar is away after a jump.
- **On a desktop, Settings' section sits beside its menu (0.19.0).** At
  900 px and wider the section screen starts 360 px in and the menu stays
  usable; picking another entry swaps the section in place (one history
  entry) instead of pushing another.

- **The core works on a phone (2 Oct 2026).** Daniel saved Wikipedia
  and ynet on the Android build and shared pages into the app from
  Chrome, so the on-device fetch (CapacitorHttp, Readability,
  `Filesystem.downloadFile`) and the share target are proven. Pages that
  build themselves with JavaScript still fail; that's its own TODO item.

- **A backup is a plain zip (0.18.0).** It holds `carry-on.json`
  (format 1, the app version, the date), `library.json`, and every
  `pages/<id>/` directory as it is on disk. Entries are stored, not
  compressed, since pictures are already compressed and stored entries
  are simpler to write and read. The writer streams to the app's cache
  with `Filesystem.appendFile` about 1 MB at a time, and restore reads the
  picked file through `Blob.slice` from its central directory. So a
  library of hundreds of megabytes is never held in memory or sent across
  the bridge whole. A zip re-made with a computer's own tool (deflated)
  still restores where `DecompressionStream` exists. Sync (0.28.0)
  reuses this format.
- **Restore never trusts the file (0.18.0).** Index entries go through
  `backup.cleanMeta`, which keeps only the fields Carry-on writes, with
  their types. Page ids must look like ours, file names must be
  page.html, text.txt or `images/<name>`, and meta.json is rewritten from
  the cleaned entry. A page already in the library is replaced only by a
  copy saved later (`savedAt`), and the old directory is deleted first,
  so a reused id can't lose the new files.
- **A sent page is HTML with its entry in a `<meta>` (0.18.0).** It opens
  in any browser, which is the point of sending it. Back in Carry-on,
  only that `<meta>` and the article body are read, and the body goes
  through `save.cleanSaved`: the fetch allowlist plus Carry-on's own
  `co-` classes and image attributes. Pictures must be `data:` PNG, JPEG,
  GIF or WebP (no SVG) or https. The header and licence line are written
  again from the entry, not taken from the file.
- **Import uses a plain file input (0.18.0).** Capacitor's WebView
  answers `<input type="file">` with the system picker on Android and iOS,
  so no plugin is needed. It has no `accept`, because Android filters by
  MIME type and phones disagree about a zip's type.
- **PDF moved to the EPUB release (0.18.0).** It needs native print calls on both
  platforms that can only be tested on the phones (TODO.md, 0.20.0).

- **Previews are redrawn on the phone (0.17.0).** Sites other than
  Wikipedia often serve one huge image with no smaller size. After it
  downloads, `store.shrink` draws it on a canvas at 480 px and keeps the
  result only if it's smaller. That's JPEG at 0.82, or PNG when any pixel
  is see-through, since JPEG would put a black box behind a logo. Only
  images wider than 600 px are redrawn, so Wikimedia's 500 px thumbnails
  aren't encoded twice. GIFs (they may be animated) and SVGs are left
  alone. The file is read through Capacitor's file server, which is the
  app's own origin, so the canvas isn't tainted. One image is drawn at a
  time, so four big photos are never decoded at once.
- **Commons credits come from the page's own wiki (0.17.0).** One
  `action=query&prop=imageinfo&iiprop=extmetadata` call per 50 files, on
  the article's wiki, which also knows files hosted locally rather than
  on Commons. Images under 100 px wide (flags, icons) are skipped. If the
  call fails, the page saves without credits, never with an error.
  Credits are kept out of text.txt, so a search for a photographer
  doesn't match every page with their photo.
- **"Save full images" keeps the card's preview (0.17.0).** It replaces
  every other preview it upgrades, so the library doesn't decode a
  1280 px image for a 64 px thumbnail. A page saved with full images is
  never swapped to the online copy, which is the same file.
- **Old pages learn their next link on first use (0.17.0).** A page
  saved before 0.10.0 has no `next` at all, while a newer page with none
  has `""`. So `follow()` reads the original once when `next` is
  undefined and records what it finds, `""` included, so it never asks
  again.

- **Search keeps each page's words in text.txt (0.16.0).** Saving
  writes `pages/<id>/text.txt` (IndexedDB key `<id>:text` in a browser)
  beside page.html: the article only, a line per block (`save.plainText`).
  The library reads them all into memory the first time a search needs
  text, so later searches don't touch the disk; a page saved before
  0.16.0 is read from its page.html once and gets its text.txt then.
  Titles, sites, tags and folders match on every keystroke; the text
  after 300 ms still. Matching folds both sides: NFKD, then every
  combining mark dropped (niqqud, harakat, Latin accents) plus the
  Arabic tatweel, then lower case; every word typed must be present,
  in any order. A search lists pages, not folder cards, and a text
  match shows its sentence (cut to about 150 characters around the
  first word). No index structure: a few hundred pages of text is a
  few megabytes, and `includes` over that is instant.

- **Reordering hands out the folder's own places (0.15.0).** A move
  takes the folder's `folderAt` values in order, nudges any equal ones
  apart by a millisecond, swaps the two pages and gives the places back
  in the new order, so no other page moves and no folders file is
  needed. Up and down buttons rather than drag: 44 px targets that work
  with a screen reader, a keyboard and reduced motion without extra
  work; they only show in Reorder mode, so a folder of fifty chapters
  isn't a column of arrows. Focus stays on the moved page's button.
  Removing a folder only clears `folder` and `folderAt`; deleting it
  removes each page directory, then writes the index once. Save several
  over a folder keeps the folder in its history entry (`{view:
  "batch", folder}`) so back returns to the folder screen.
  `replaceChildren` turns a null into the text "null", unlike `el()`;
  `fill()` drops them (a stray "null" had shown in ⋯ since 0.8.0).

- **The image viewer lives in the app, not the page (0.14.0).** The
  saved page can't run scripts, so reader.js catches the tap on an
  `<img>` (as it does links) and hands the app its on-screen rect, its
  current source, its `data-full` (https only) and its caption; the
  viewer is an overlay in the app's own document. Its own history entry
  (`image: true` on the reader's state) means Android's back closes it.
  Zoom is done by hand with pointer events (two pointers pinch, one pans
  when zoomed, else drags to dismiss past 120 px or a fast flick), the
  wheel on desktop, and a double tap toggles 2.5×; panning is clamped so
  the image always covers the stage. Opening animates the image from its
  rect in the page (a FLIP with the sheet spring); reduced motion fades.
  An image already swapped to its full version in the page is shown as
  is, so offline it comes from the WebView's cache.

- **Glossary (0.14.0).** One word per thing, in the code, the interface
  and these docs:
  - **Saved page:** a page kept on the phone; its **index entry** is its
    line in `library.json` (title, url, tags, folder, place read).
  - **Page directory:** `pages/<id>/` on disk, holding `page.html`,
    `meta.json` and `images/` (`store.pageDirUrl`). Never "folder".
  - **Folder:** an ordered collection of saved pages, one per page at
    most (`folder`, `folderAt` on the index entry). **Tag:** a label, any
    number per page.
  - **Preview:** the small copy of an image kept on disk; **full image:**
    the original, loaded from its link when online.
  - **Saving** a page: fetch (or **draw**, for script-built pages),
    **rebuild** it from the allowlist (`save.rebuild`), **save its images**
    (`saveImages`), write the **saved page HTML** (`savedPageHtml`).
  - **Library:** the list of saved pages. **Screens** are pushed over it
    and popped (`pushScreen`, `popScreen`); **sheets** rise from the
    bottom of the reader.
  - **Shared:** a link sent from another app's share sheet, saved
    straight away (`saveShared`).

- **The reader bar floats; the page makes room for it (0.13.0).** The
  bar is absolutely placed over the iframe, which now fills the screen,
  and reader.js sets `--co-top` (the bar's height) on the page, which
  reader.css adds to the body's top padding and to `scroll-padding-top`.
  Shrinking the iframe instead would reflow the page on every hide.
  Scrolling reports twice: `onScroll` every frame (the progress line and
  the bar), `onPosition` after 150 ms still (the saved place, as
  before). The bar hides after 12 px down past its own height and comes
  back after 12 px up, at the end (≥ 99.9%), and whenever a sheet opens.
  On a phone a strip the colour of the page stays over the status bar.
  Reduced motion: the global 1 ms rule makes it appear and disappear
  without sliding.

- **Script-built pages are drawn in a hidden WebView (0.12.0).** When
  Readability finds under 250 characters, or the title is a browser
  check, save.js asks native/share's PageRender plugin to draw the page:
  a second WebView behind the app's own (alpha 0, so it never takes a
  touch), scripts and DOM storage on, images off, no Capacitor bridge, no
  JavaScript interfaces, no file access, http(s) navigation only. It
  waits for the body text to reach 500 characters and hold still for two
  polls 0.7 s apart, or 20 s, then hands back `outerHTML`, which goes
  through the same Readability and cleaning as any page, so the saved
  copy keeps no scripts. It runs only after a plain fetch fails, because
  drawing costs seconds and data the fetch doesn't. Not on iOS: there
  the Safari share extension's preprocessing file is the planned route.
  The e2e test mocks the plugin; the Java has only run on Daniel's phone.

- **Updates live in Settings; the bar only points there (0.11.0).** One
  `upd` state (phase, latest, notes, progress, the downloaded APK) drives
  both Settings' Updates section and the library's bar, so a download
  started in Settings shows in the bar too. The release's notes are its
  CHANGELOG.md section (the workflow writes them), so "What's in 0.12.0"
  needs no second source. What's new reads the bundled CHANGELOG.md
  (now in sw.js's ASSETS, so it's in the app and the offline web copy)
  with a small parser: `## [x] - date`, `### Kind`, `- item` with
  indented lines joined. "Updated to x" shows once, keyed on
  `carryon.seenVersion`; an install that predates the key but has pages
  counts as an update.

- **Next links are found at save time (0.10.0).** save.js reads the
  page's next link before Readability strips navigation: `rel="next"`
  first, then a link whose words are a "next" phrase in a few languages
  (`isNextText`), always on the same host and never the page itself, so a
  sponsor's "Next" doesn't count. Stored as `next` in the index. Following
  saves one page at a time and reads each new page's `next`, stopping at
  a page with none, one already seen, or a failure. Pages saved earlier
  have no `next`.

- **Saving progress shows it's alive (0.10.0).** The page download has no
  size to measure, so the bar sweeps (indeterminate) until the text is in,
  then counts a tenth for the text and the rest by images. The status
  adds the seconds after five, ticking each second. Under reduced motion
  the spinner and bar breathe (opacity) instead of moving.

- **Saving several runs one page at a time (0.9.0).** In order, so a
  folder's pages get rising `folderAt` and the folder reads in the order
  of the links, and so a phone on a weak connection isn't fetching ten
  pages and their images at once. A paste goes through a text field,
  which drops line breaks, so links are also split where the next
  `https://` starts. Two or more links open the Save several screen; one
  link saves straight away as before.

- **Folders are a name on the page, not a record of their own (0.8.0).**
  Each index entry may carry `folder` (its name) and `folderAt` (when it
  joined); a folder's order is `folderAt`, falling back to `savedAt`, so
  batch saving will order chapters just by saving them in turn. No
  separate folders file means nothing to keep in step: a folder exists
  while a page names it. Names match ignoring case, like tags. (Until
  0.14.0 store.js also said "folder" for a page's directory on disk.) Next and previous replace the
  reader's history entry rather than pushing one, so back leaves for the
  folder however many chapters were read. The "Next in …" link is added
  by reader.js after the page loads and only that element is honoured,
  so a saved page can't fake one.

- **Tags and filters (0.7.0).** Tags live in the library index as
  `tags` (an array of strings) on each entry, so filtering never opens a
  page's folder. Matching is case-insensitive, and a new tag takes the
  spelling of one already in use. The filter is a single value
  (`carryon.filter`: all, unread, finished or `#tag`); a tag filter whose
  last page loses the tag falls back to All. "Unread" means never scrolled
  past the first 2%, the same line the card uses for "min left". The Aa
  and ⋯ sheets share one element and one history entry: tapping the other
  button swaps the sheet in place, so back still leaves in one step, and
  the reader bar sits above the sheet's tap-catcher so its buttons work
  while a sheet is up.

- **A library card is a div with a stretched button (0.6.0).** Retry has
  to sit on the card, and a button can't hold another, so `.card-open`
  is an empty button covering the card (labelled with the title) and
  Retry is raised above it. Missing images now keep the preview address
  they failed on (`data-preview`); pages saved earlier retry with the full
  image's, narrowed to 500 px when it's Wikimedia's.

- **Reading position lives in the library index (0.5.0).** Each entry
  gets `at` (0 to 1, how far down the page) and `finished` (read to the
  end once, sticky). A fraction, not pixels, so a change of text size or
  phone still lands near the same place. Written 1.5 s after scrolling
  stops and when the reader closes, so a page isn't rewritten on every
  scroll. A card whose line changes is rebuilt in place rather than
  re-animated.

- **Direction falls back to the letters (0.4.0).** `textDir` in
  src/save.js takes `dir="rtl"` on <html> or <body>, then a right-to-left
  `lang`, then counts Hebrew and Arabic letters against Latin and Cyrillic
  in the article's text. ynet's markup carries no direction, so 0.3.1
  saved it left to right. The reader runs the same check on a page with no
  `dir`, which covers pages saved before.

- **Reading settings are tokens too (0.4.0).** Text size, spacing and font
  are `--reader-fs`, `--reader-lh` and `--reader-font` on the app's :root,
  copied into the sandboxed page with the theme's colours, so the reader
  needs no script of its own. Sizes are 16, 18, 19, 21, 24 px (19 is the
  design's body size, so the default stays put); line height is the size
  times 1.4, 1.58 or 1.8. The Aa sheet is a history entry, so Android's
  back closes it before the page, and it has no scrim so each change shows
  on the text as it's made. One builder makes the controls for the sheet
  and for Settings.

- **Page requests carry the WebView's browser string (0.3.1).** The app
  name alone as User-Agent made some sites (ynet) never answer, and with no
  deadline on native requests a save sat on "Saving" for good. Now the
  User-Agent is the WebView's own plus "Carry-on (…)", which still names
  the app as Wikipedia asks, and every fetch and download has a deadline
  (`deadline()` in src/platform.js) on top of the native timeouts, which
  not every plugin version honours.
- **Failed saves stay as cards (0.3.1).** A toast is gone before anyone
  looks back at the phone, which read as "nothing happened". The failed
  card keeps the reason until Try again or Remove; it isn't stored, so it
  goes on restart.

- **Sharing into the app is a small local plugin (0.3.0).** native/share
  follows LifeLog's native/widgets: a Capacitor plugin in this repo,
  installed with a `file:` dependency, so `cap sync` picks it up with no
  generated project to edit. tools/android-manifest.js adds the SEND
  `text/plain` intent filter to MainActivity in CI. The plugin keeps one
  pending share, from the launch intent or `onNewIntent`, until the app
  asks with `take()`, so a share that arrives before the library has
  loaded isn't lost; it then clears the intent so a rotation doesn't
  save it twice.
- **Springs are pre-sampled `linear()` curves (0.3.0).** No animation
  library, per "no dependencies": src/motion.js holds DESIGN.md's two
  springs sampled into CSS `linear()` and runs them with the Web
  Animations API, with a cubic-bezier for WebViews without `linear()`.
  Under prefers-reduced-motion every animation is a 120 ms fade. Screens
  are a history stack (`{view: "reader"}`, `{view: "settings"}`) so
  Android's back button pops them; the library under a screen is
  `inert`, not hidden, so it can drift back as the screen leaves.
- **Settings are built from data (0.3.0).** `SETTINGS` in src/app.js
  lists each group and its options; adding a later setting (reading
  font, text size) is an entry there, not new markup.
- **"System" is the default theme (0.3.0).** Paper by day and Night by
  night, following the phone, until a theme is picked. Reading at night
  on a plane is the main case, and a white page is the worst thing to
  open there.

- **The app updates itself, as LifeLog does (0.2.0).** On launch the app
  asks GitHub for the latest `app-v*` release; if it's newer, "Update"
  downloads that tag's CarryOn.apk into the cache with
  `Filesystem.downloadFile` and opens Android's installer through
  capawesome's FileOpener. The manifest needs `REQUEST_INSTALL_PACKAGES`
  (tools/android-manifest.js) or Android refuses the hand-off. It only
  installs over a build signed with the same key, which is why the
  workflow publishes nothing without the `carryon` keystore. LifeLog's
  NOTES.md (0.179.0) has the history, including why downloadFile is used
  despite being deprecated.

- **The reader's iframe keeps allow-same-origin (0.2.0).** Without
  `allow-scripts` nothing in the page can run, so same-origin only lets
  src/reader.js reach in: copy the theme tokens onto it, catch taps on
  links (an in-page `#ref` scrolls, anything else opens in the phone's
  browser via AppLauncher; a link must never navigate the iframe), and
  swap previews for full images. The page's own CSP is `default-src
  'none'` plus images, the app's stylesheets and fonts. The two are only
  dangerous together; test/save.test.js fails if `allow-scripts` appears.
- **Cleaning is an allowlist that rebuilds the page (0.2.0).** src/save.js
  never copies the fetched DOM: it creates each kept element afresh with
  only the attributes named in `ATTRS`, so an `on*` handler, `style`,
  `srcdoc` or a `javascript:` link can't come through by being forgotten.
  `style` goes entirely (along with anything it hid), which is why
  Wikipedia infoboxes lose their colours.
- **Wikimedia thumbnails at 500 and 1280 px, not 480 (0.2.0).** Wikimedia
  pre-renders and caches a fixed set of widths and rate-limits tools that
  ask for others, so the preview is the 500 px step and the full image the
  1280 px step, capped at the file's own width.
- **Page titles prefer og:title or the page's one h1 (0.2.0).**
  Readability keeps "Headline | Site" for short headlines.
- **Saved pages in a browser go to IndexedDB, images stay links (0.2.0).**
  The web copy can save Wikipedia (its API allows CORS) but has no folder
  for images; its cards say "Text offline · images online".

- **Started from LifeLog (0.1.0).** The build tooling (tools/build-www.js,
  android-version.js, sign-apk.sh, ios-project.js and both workflows) and
  `src/platform.js`'s app-vs-browser handling come from
  danielnoam/lifelog at 0.227.0, trimmed of LifeLog-only parts (widgets,
  QR scanner, phone backup). Its NOTES.md has the history
  behind each of them; search there before "fixing" something that looks
  arbitrary in those files.
- **No server for the phone app (0.1.0).** `CarryOn.platform.fetchText`
  uses CapacitorHttp in the app, which is native networking and not
  subject to CORS; LifeLog proved this in its 0.215.0. In a browser it
  falls back to `fetch`, which CORS blocks for most sites: the web copy
  can read saved pages but can't save new ones until a worker or an
  extension exists. See docs/PROPOSAL.md.
- **CapacitorHttp is called directly, not via the global fetch patch
  (0.1.0).** `CapacitorHttp.enabled` in capacitor.config.json would move
  every fetch in the app, including loading its own files, onto the native
  stack. LifeLog made the same call for the same reason.
- **Images are previews plus links (0.1.0).** Daniel's choice, matching
  how videos are handled: a ~480 px preview on disk, the full image's URL
  kept. Links-only was considered and set aside as the default because on
  a plane a map or diagram becomes an empty box; it stays as a setting.
- **Fonts are bundled, Latin subset (0.1.0).** Source Serif 4 and
  Instrument Sans from Google Fonts, OFL. Other scripts fall back to the
  system font through unicode-range, so Hebrew or Arabic pages still read
  well without shipping megabytes of glyphs. Hebrew got its own bundled
  faces in 0.24.0.
- **Readability is vendored at 0.6.0 (0.1.0).** One file, Apache-2.0, the
  same parser Firefox Reader View uses. Vendored rather than installed to
  keep the no-build rule.
