# Formats: what Waypage keeps

This describes **APP_VERSION 1.45.7** (`src/app.js`). Every name below was
read out of the source named beside it, not recalled. What was *not* run
is said where it matters: nothing here was checked on a phone, only read.

Why there is no server, and why saved HTML is untrusted, is in
[PROPOSAL.md](PROPOSAL.md) and [../NOTES.md](../NOTES.md). The module map is
[ARCHITECTURE.md](ARCHITECTURE.md). This file is only the shapes of the data.

Contents: [On disk](#on-disk-pagesid) · [library.json](#libraryjson-the-index) ·
[A browser's stand-in](#in-a-browser-indexeddb) · [Other keys](#settings-and-other-persisted-keys) ·
[Sync repo](#the-github-sync-repo) · [Merge rules](#the-three-way-merge) ·
[Backup, HTML, EPUB](#leaving-the-app) · [Major versions](#what-a-major-version-means)

## On disk: `pages/<id>/`

`src/store.js`. The library lives in one of three places, chosen in
Settings, Storage and kept in `localStorage["waypage.storagePlace"]` as
`{ kind: "app" }`, `{ kind: "documents" }` or
`{ kind: "folder", tree, name }`. Inside any of them the layout is the same
(Documents puts it under `Waypage/`):

```
library.json              the index (below)
fonts/                    fonts you added by hand (not synced)
pages/_covers/            collection covers, kept small (a folder like a page's)
pages/<id>/
  page.html               the saved page, cleaned HTML
  meta.json               this page's index entry, as written when it was saved
  text.txt                the page's words, one line per block, for search
  translation.json        a clip's translation (this device only)
  icon.png|ico|svg|…      the site's icon, when it could be fetched
  images/0.jpg, 1s.webp   preview or full pictures, and the card's thumb
  pack-N                  only in the sync repo, never on disk (see below)
```

`<id>` is `Date.now().toString(36)` plus four random base-36 characters
(`save.newId`). Anything read back must match `^[a-z0-9]{4,24}$`
(`backup.js`), so that is the whole rule for an id.

- **`page.html`** is a full document: a `header.co-head` (site and date,
  `h1`, optional byline), the article, an optional `aside.co-cut`, and a
  `footer.co-licence` with the "Read the original" link
  (`save.savedPageHtml`). Pictures are relative paths (`images/3.jpg`) in
  the app and `data:` URLs in a browser. It is always rendered in the
  sandboxed frame, never in the app's own document.
- **`images/`**: names are `<n>.<ext>`; a shrunk or squeezed copy gets an
  `s` before the extension (`3s.webp`, `store.shrinkNow`). Only
  `images/[A-Za-z0-9._-]{1,80}` is accepted back from a backup.
- **`meta.json`** is the index entry written with `JSON.stringify(meta, null, 1)`
  by `store.writePage`. It is written at save time and again whenever
  `writePage` is called (Edit clips, sync pulling a page down, retrying
  missing pictures, restoring a backup). It is written before `bytes` is
  added at save time, so it can lack `bytes`. **`library.json` is the one
  the app reads**: a grep for `meta.json` in `src/` finds only the writers
  (`store.js`, `backup.js`), no reader. Treat it as a copy for people and
  other tools. A backup restore
  rewrites it from the cleaned entry.

## `library.json`: the index

A JSON **array** of entries, newest `savedAt` first. Written whole, one
write after another in order (`store.writeIndexOnly`). After each write,
sync is told (`onIndex`). On a phone it is read through the WebView's own
file address first, then the plugin as a fallback; an unreadable file reads
as `[]`.

Every entry field, with who sets it. "Synced" means it is in `SYNCED` in
`src/sync.js` and so goes through GitHub sync; "kept" means
`backup.cleanMeta` keeps it in a backup or when reading a sync file.

| Field | Meaning | Set by | Sync | Backup |
|---|---|---|---|---|
| `id` | the folder name | `save.newId` | yes | yes |
| `url` | original address; `""` for a clip from a file | save; files.js | yes | yes |
| `title`, `site`, `byline` | shown in the Library and the reader | save / files.js | yes | yes |
| `licence` | `"wikipedia"` or `null` | save | yes | yes |
| `savedAt` | ms epoch | save | yes | yes |
| `minutes` | reading minutes, at least 1 | save | yes | yes |
| `lang`, `dir` | language code, `"rtl"` or `""` | save | yes | yes |
| `mode` | `"previews"`, `"full"` or `"links"` (always `"links"` in a browser) | save | yes | yes |
| `images` | pictures in the page | save | yes | yes |
| `missing` | pictures still to fetch | save, retry, sync | **no** | yes |
| `bytes` | size on this device | save, sync | **no** | yes |
| `imageBytes` | the pictures' share of `bytes` | save | **no** (recomputed from the packs on arrival) | yes |
| `thumb` | card picture: `images/<n>.<ext>` or an address | save | **no** | yes |
| `at` | furthest place, 0 to 1 | reader | yes | yes |
| `finished` | `true` once read | reader / Library | yes | yes |
| `spot` | a paragraph and offset, `"<block>/<n>"` or `"<block>/<n>c"` | reader | yes | yes |
| `readAt`, `readOn` | last opened; the device name that did | reader | yes | yes |
| `placeAt` | when the place last *moved* | reader | yes | yes |
| `next`, `prev` | address of the next and previous chapter | save | yes | yes |
| `requested` | the address asked for, when it redirected | save | yes | yes |
| `series` | series name | save | yes | yes |
| `comic` | saved as an image chapter | save / files.js | yes | yes |
| `cut` | a paywalled teaser | save | yes | yes |
| `archived` | ms epoch of the Wayback copy used | save | yes | yes |
| `editedAt` | last Edit clips | `app-settings.js` | yes | yes |
| `fav`, `favAt` | favourite and when | Library | yes | yes |
| `tags` | up to 50 strings, each up to 32 characters | Library | yes | yes |
| `folder`, `folderAt` | the Collection (≤ 32 chars) and when added | Library | yes | yes |
| `folderFav`, `folderFavAt` | the Collection is a favourite | Library | yes | yes |
| `source` | a Collection's source address (only kept with a `folder`) | save | yes | yes |
| `file` | `{ name, kind, ext, size }` for a clip made from a file; `kind` is one of `epub md txt html cbz pdf` | files.js | yes | yes |
| `marks` | Highlights: `{ id, block, start, endBlock, end, text, at, note?, color? }`, at most 2,000; `color` is `green blue pink purple` (yellow has none) | reader | yes | yes |

Fields that exist in the app but that **`cleanMeta` drops**, so they stay on
the device and never reach a backup or sync:

| Field | What it is |
|---|---|
| `icon` | the site's icon: a file name in the page folder, or its address in a browser |
| `link` | a file clip's lasting folder permission ("this device's own", `files.js`) |
| `squeezed` | `1` once big pictures were redrawn smaller |
| `cover`, `coverFrom` | a Collection's cover, kept by each device |

The `thumb`, `bytes`, `imageBytes` and `missing` fields are kept in a
backup but removed for sync by `sync.share` (list `DEVICE`).

The strings are clipped on the way in: `title` 300, `site` 100, `byline`
200, `lang` 20, URLs 2,000. An entry with no `http(s)` address and no
`file` is dropped.

## In a browser: IndexedDB

`store.js`. A browser has no directory, so it keeps one database, named
`carryon` (the old name, kept on purpose when the web copy moved from
`/carry-on/` to `/waypage/` on the same origin; version 1), with one object
store, `pages`. Keys:

| Key | Value |
|---|---|
| `__library` | the index, as JSON text (the same array as `library.json`) |
| `<id>` | `page.html` as a string, pictures inside as `data:` URLs |
| `<id>:text` | `text.txt` |
| `<id>:thumb` | the card picture as a `data:` URL |
| `<id>:translation` | `translation.json` as text |
| `__font:<name>` | a font you added, as a Blob |

The index used to live in `localStorage["waypage.library"]` (before
0.27.12). It is still read until the first IndexedDB write and is the
fallback where IndexedDB fails; a successful write removes it. In a browser
`meta.json`, `images/` and `icon.*` do not exist. `removePage` deletes the
`<id>`, `:text`, `:thumb` and `:translation` keys.

## Settings and other persisted keys

Settings are plain `localStorage` keys under `waypage.`. **None of them
sync.** The only things that leave a device through GitHub sync are the
index, the page text, the followed feeds, "Feeds last seen" and reading
stats (next sections). A Drive or zip backup carries the library, feeds and
stats, and no settings. (Checked by reading `sync.js` and `exportLibrary`;
no settings key appears in either.)

Not a full list of every preference, but every key a grep for
`waypage.` finds in `src/` is here, grouped:

| Group | Keys |
|---|---|
| Where the library is | `waypage.storagePlace` |
| Look and layout | `theme`, `themeAuto`, `animations`, `layout`, `dimPictures`, `sideFolded`, `userFonts` |
| Saving | `images`, `compress`, `saveOnData`, `syncOnData`, `syncPictures` (queue of pages whose pictures are still to come), `later` (links waiting for a connection), `picturesHealed`, `tidiedFiles` |
| Library view | `filter`, `sort`, `continue`, `reading`, `place`, `readingSpan`, `seenVersion` |
| Feeds | `feeds` (followed feeds, with their posts), `feedsSeen`, `feedsAsked`, `checkDaily`, `newChapters`, `notes` |
| Watched folders | `watch`, `watches` (this device's, never synced) |
| Reader | `brightness`, `brightSide`, `brightSwipe`, `pinchText`, `volumePages`, `spentLine`, `leftIn`, `sheetTab`, `markColor`, `tapPictures`, `translateTo` |
| Narrate | `aloudRate`, `aloudVoice`, `aloudEngine`, `aloudBar`, `aloudFootnotes`, `aloudSkipEdges`, `aloudGoOn`, `aloudScreenOn`, `aloudPip`, `aloudKeepGoing`, `aloudMix` |
| This device | `deviceName`, `exportKind`, `startTimes`, `log` (last 60 errors, addresses without queries, tokens cut), `renamed` (the one-time copy from `carryon.*` names) |
| Sign-ins | `drive`, `driveToken`, `driveHand`, `driveAsk`, `signedIn` |
| App lock | `lock`, `lockTries` |
| Sync | `sync`, `syncBase`, `syncWaiting`, `syncSent`, `syncStats` |
| Dictionaries | `dicts` |
| Stats | `stats`, `statsDevice`, `statsOthers` |

All of these are prefixed `waypage.` (for example `waypage.theme`). The
shapes of the ones that hold structured data:

- **`waypage.feeds`**: `[{ url, title, link, icon, mode: "show"|"save", images, folder, days, addedAt, checkedAt, error, items: [{ id, url, title, date, foundAt, tried }] }]` (comment in `app-saving.js`; `backup.cleanFeed` keeps `days` to 3, 7 or 30 and at most 100 items, and resets `checkedAt` and `error`).
- **`waypage.sync`**: `{ owner, repo, branch, token, sha, at, links, paused, scoped, looked }`. Holds the GitHub token, in `localStorage`; the app does not encrypt it. The comment names `sha` and `at`; `scoped` and `looked` are set in `connect` and `settle`.
- **`waypage.lock`**: `{ v, salt, iter, hash, len, bio, after }` (`len` the passcode length, `bio` fingerprint or face on, `after` the wait before it locks again), a PBKDF2-SHA-256 hash with its own salt (210,000 iterations by default); `waypage.lockTries` counts wrong tries. **Per device, never synced, not in a backup** (`app-lock.js`). It keeps people out; it does not encrypt the library. Erasing after a forgotten passcode removes every `waypage.`, `carryon.` and `carry-on.` key (matching `^(waypage|carryon|carry-on)[.:]`), every page and font, and, in a browser, the `carryon` database.
- **`waypage.stats`**, **`statsDevice`**, **`statsOthers`**: below.

### Reading stats (`src/stats.js`)

`waypage.stats` is this device's own count:

```json
{ "v": 1, "since": 1790000000000,
  "days":  { "2026-10-31": { "readMs": 0, "words": 0, "aloudMs": 0, "opened": 0,
                              "finished": 0, "saved": 0, "paceWords": 0, "paceMs": 0,
                              "clips": { "<id>": 0 } } },
  "clips": { "<id>": { "readMs": 0, "words": 0, "aloudMs": 0, "opened": 0,
                        "last": 0, "far": 0, "finished": 0 } },
  "moved": { "<oldId>": "<newId>" } }
```

Day keys are local `YYYY-MM-DD`. `statsDevice` is a 12-character id
`[a-z0-9]{12}` made once. `statsOthers` is `{ <device>: data }` for the
other devices, cleaned to the same shape on the way in (`stats.clean`).
Each device writes only its own; the totals add every device up, so two
devices never merge into one file and nothing is counted twice.

### Dictionaries (`src/dict.js`)

StarDict files are kept **per device and are never synced or backed up**.
Index of what is installed: `localStorage["waypage.dicts"]`, a JSON array
of `{ id, name, words, bytes }`. The files: IndexedDB database
`waypage-dict` (version 1), object store `files`, with the keys
`<id>/idx`, `<id>/dict`, `<id>/syn` (only if the dictionary has one) and
`<id>/meta` (`{ ifo, dz }`). `id` is `Date.now().toString(36)` plus four
random characters. The cap is 400 MB (`MAX_BYTES`).

## The GitHub sync repo

`src/sync.js`. A private repo named `waypage-data` (earlier `carryon-data`,
renamed or used as it is by `adoptOld`) on the account that owns the token.
Sync refuses to run if it is public. Layout:

```
library.json              the merged library document (below)
pages/<id>.html           each page's text, with pictures marked missing
pages/<id>/pack-0, -1…    pictures of a clip made from a file, in packs
stats/<device>.json       one file per device, written only by that device
```

`library.json` in the repo is **not** the array the app keeps; it is a
document:

```json
{ "format": 1,
  "pages":   [ /* entries, device-only fields removed */ ],
  "deleted": { "<id>": 1790000000000 },
  "files":   { "<id>": { "at": 1790000000000, "sha": "…", "packs": ["sha", "…"] } },
  "feeds":     [ /* url, title, link, icon, mode, images, folder, days, addedAt */ ],
  "feedsGone": { "<feed url>": 1790000000000 },
  "feedsSeen": 1790000000000 }
```

- `files[id]` says which version of the page's text is up there: `at` is
  the page's version (the later of `savedAt` and `editedAt`), `sha` the
  blob's id, `packs` (at most 64) the picture packs.
- `deleted` and `feedsGone` are tombstones, kept 90 days (`KEEP_DELETED`).
- `feeds`, `feedsGone` and `feedsSeen` are left out by a device from before
  0.30.1; they then stay as they were.
- A page's text is its HTML with every local picture marked
  `img.co-missing` and its `src` removed. The other device downloads its
  own from the original links, as Links, Previews or Full images matches
  the page. A clip from a file has no links, so its pictures go up in packs
  of up to 16 MB (`PACK`) when they total 100 MB or less (`FILE_PICTURES`);
  the `<img>` then reads `sync:<pack>:<offset>:<length>:<type>`.
- Text goes up in batches of up to 50 pages or 8 MB through the Git Data
  API (one tree, one commit), and falls back to one Contents write per page
  for an empty repo.
- `stats/<device>.json` holds that device's `stats.mine()` (the shape
  above). It is rewritten only when its hash changed. File names that are
  not `[a-z0-9]{12}.json` are ignored.
- What a reading of `library.json` from GitHub accepts is
  `sync.clean`: an id must match `^[a-z0-9]{4,24}$`, each entry goes
  through `backup.cleanMeta`, then the `DEVICE` fields are removed. A
  `library.json` with no `pages` array stops the sync with "isn't Waypage's".

Local sync state is in the `waypage.sync*` keys above: `syncBase` is the
`library.json` text last written or read (the merge's base), `syncWaiting`
the ids whose text has not come down yet, `syncSent` the pages sent before
`library.json` was, and `syncStats` the hash of each other device's stats
file as last read plus `_sent`, what this device last wrote.

`sync-worker.js` does the merge off the main thread. It loads `backup.js`
and `sync.js` into a worker and answers two jobs: `merge` and `same`. Where
there is no worker (a test, an old browser) the same code runs in the page.

### The three-way merge

Pure functions in `sync.js`, tested by `test/sync.test.js` (not run for this
doc). Three copies: the **base** (last library both saw), **local** and
**remote**. Per page id:

| Case | Result |
|---|---|
| in local only | kept (sent up) |
| in remote only | kept (comes down) |
| gone locally since base | deleted: tombstone, unless its text is still in `waiting` |
| gone remotely since base, no tombstone | deleted |
| in a tombstone | dropped |
| in both and equal | kept |
| in both and different | field by field (`mergeEntry`) |

`mergeEntry` per field:

| Field | Rule |
|---|---|
| Text fields (`CONTENT`: `url title site byline licence savedAt minutes lang dir mode images comic next prev requested series source file cut archived editedAt`) | the side with the later version (`max(savedAt, editedAt)`) wins them all together; on a tie, three-way |
| `readAt`, `readOn` | the side read last |
| Place (`at finished placeAt spot`) | the side whose `placeAt` (or, on older entries, `readAt`) is later; only when equal, three-way |
| `tags` | what both have plus what either added; a tag either removed goes (compared case-insensitively) |
| `marks` | by `id`: added stays, removed goes; changed on both keeps the later `at`; sorted by block then start |
| anything else | three-way: keep local unless only remote changed |

Then `fav` off removes `favAt`, `folderFav` off removes `folderFavAt`, and
empty `tags` or `marks` are dropped.

After the merge, `oneCopyEach` collapses two entries with the same address
(fragment and trailing slash ignored): the later version stays, takes the
other's tags, highlights, favourite, place and Collection, and the other id
becomes a tombstone. Feeds merge by address: an unfollow is a tombstone,
following again with a newer `addedAt` brings it back. `feedsSeen` takes
the larger value. Pages sort newest `savedAt` first.

A write that GitHub refuses as stale (409 or 422) is merged again and
retried up to 3 times, never forced. **Light** syncs (on mobile data, if
set) move only the place and stats and leave everything else, including
`syncBase`, as it was.

## Leaving the app

### The backup zip (`src/backup.js`)

`waypage-backup-YYYY-MM-DD.zip`, written by Waypage's own small zip writer:
**stored, no compression**, UTF-8 names, streamed to a cache file on a
phone so a large library never sits in memory. Entries in order:

| Entry | Content |
|---|---|
| `waypage.json` | `{ format: 1, app, made, pages, feeds }`: app version, time, counts |
| `library.json` | the index array, as in the app |
| `feeds.json` | followed feeds, only if there are any |
| `stats.json` | `stats.backup()`: `{ format: 1, device, data, others }` |
| `pages/<id>/…` | on a phone, every file in the page folder; in a browser, `page.html` and `text.txt` only |

Restore reads the zip's central directory (stored, or deflate if someone
re-zipped it) and **merges** into the library: a page not there is added;
one there already (same address, or same file name and size for a file
clip) is replaced only by a copy saved later, never the other way. Index
entries go through `cleanMeta`; page files are limited to `page.html`,
`meta.json`, `text.txt` and `images/…`, and `meta.json` is rewritten from
the cleaned entry. An id that is already taken gets a new one. In a browser
the pictures go back inside `page.html` as `data:` URLs. `stats.json` is
restored through `stats.restore` (other devices' counts are added, this
device's own is not overwritten). A Drive backup is this same zip.

### One page as HTML

`exportPage`: the saved page with its pictures inlined as `data:` URLs,
plus `<meta name="waypage-page" content='<entry as JSON>'>` at the top of
`<head>` (the entry without `id`, `thumb` and `bytes`). Importing reads the
tag (it still accepts the old `carry-on-page`), runs `cleanMeta` on it, runs
the body through `save.cleanSaved`, and writes it as a new page with a
new id. A folder as one file (`exportPages`) is one `section.co-part` per
page. Markdown export (`exportMarkdown`) has no round trip.

### EPUB (`src/epub.js`)

EPUB 3 through the same zip writer. One XHTML chapter per page, rebuilt from
an allowlist of tags, attributes and `co-` classes. Entries: `mimetype`
(first, stored), `META-INF/container.xml`, `OEBPS/content.opf`,
`nav.xhtml`, `toc.ncx`, `style.css`, `cover.xhtml` (several pages only),
the chapters and `images/<n>.<jpg|png|gif>`. WebP pictures are redrawn as
JPEG; other types are left out. The cover is the first picture, or a
1200 × 1800 title card. `dc:source` is each page's address, and a book with
a Wikipedia page carries its CC BY-SA 4.0 `dc:rights` line. EPUB is an
export only; Waypage reads EPUBs as files (`files.js`, a separate format
path), not as this export's round trip.

## What a major version means

From `.claude/skills/release-checklist/SKILL.md`: a minor bump (`0.X.0`) is
a feature, a patch is a fix or tweak, and a **major** is "a change to the
saved-page format that old versions can't read". There is exactly one such
bump so far, 1.0.0 (6 October 2026), which was the rename from Carry-on.
That release kept data readable rather than breaking it, and the code still
carries the bridges: the `carryon` IndexedDB name, the `carryon.*` to
`waypage.*` setting copy, the `carryon-data` repo adoption, and the
`carry-on-page` meta tag on import. I did not read the CHANGELOG entry in
full, so treat "1.0.0 broke nothing" as read from those bridges, not
confirmed.

So the practical rule when a field or file shape changes:

- **Adding** an optional field is a minor change. Older versions ignore
  what `cleanMeta` does not know, which is how sync and backup already work.
  Also add the field to `SYNCED` (and `CONTENT` if it travels with the
  text) if it should sync, and to `cleanMeta` or it is dropped on a backup.
- **Renaming, removing or changing the meaning** of a field, or changing
  `page.html`'s structure so older readers misread it, is a major bump,
  and needs a migration for what is on a device and a plan for a sync repo
  that other devices still write in the old shape.
- `format: 1` in the sync document and in `waypage.json` is written and
  not checked on read by the code I read (`clean` rebuilds `format: 1`
  regardless, and `restoreLibrary` never looks at `waypage.json`), so it
  does not yet gate anything. A real format change would need to start
  checking it.
