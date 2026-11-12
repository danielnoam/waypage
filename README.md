# Waypage

Save a web page to your phone and read it with no connection: on a plane,
in a tunnel, anywhere. The text is kept whole, pictures keep a small
preview with a link to the full size, and videos keep a thumbnail that
plays when you're back online. Every clip links back to the original.

Plain HTML, CSS and JS with no build step and no dependencies. The same
files run in a browser (the web copy on GitHub Pages) and, wrapped by
[Capacitor](https://capacitorjs.com), as the Android and iOS apps.

Each section below shows the computer (left) and the phone (right).

## Contents

- [Library](#library)
- [Sidebar](#sidebar)
- [Collections and files](#collections-and-files)
- [Notes](#notes)
- [Saving](#saving)
- [Reader](#reader)
- [Text and themes](#text-and-themes)
- [Skim](#skim)
- [Highlights, Translate and Look up](#highlights-translate-and-look-up)
- [Narrate](#narrate)
- [Feeds](#feeds)
- [Newsletters](#newsletters)
- [Discover](#discover)
- [Stats](#stats)
- [Sync and backup](#sync-and-backup)
- [Settings and the app](#settings-and-the-app)
- [Privacy and security](#privacy-and-security)
- [Run it](#run-it)
- [Working on Waypage](#working-on-waypage)

## Library

<p><img src="docs/shots/library-desktop.jpg" width="74%" alt="Library on a computer"> <img src="docs/shots/library-phone.jpg" width="21%" alt="Library on a phone"></p>

- Continue reading at the top, then Collections, then Clips.
- Shelf, list or grid layouts, site icons and collection covers. Any collection's cover can be set: a picture of your own or one of its clips'.
- Filter by unread, finished or a tag; sort by saved, read, length or site.
- Search titles, tags and the full text of every clip.
- Favourites, tags, and a star on a clip's picture.
- Pick several clips to tag, move, mark read, export or delete together; hold or right-click for a clip's menu.
- Edit clips: find and remove or replace words across many clips.
- Import from Pocket, Instapaper, Omnivore, Raindrop and Wallabag.

## Sidebar

<p><img src="docs/shots/sidebar-desktop.jpg" width="25%" alt="Sidebar on a computer"> <img src="docs/shots/sidebar-phone.jpg" width="34%" alt="Sidebar on a phone"></p>

- Library with favourites, Collections and Clips; Feeds; Newsletters with the latest addresses and unread counts; Highlights; Stats; tags.
- Library, Feeds and Newsletters fold under an arrow inside their row.
- Always there on a wide screen, slides in on a phone. Keys 1 to 5 go to its places.

## Collections and files

<p><img src="docs/shots/collections-desktop.jpg" width="74%" alt="A collection on a computer"> <img src="docs/shots/collections-phone.jpg" width="21%" alt="A collection on a phone"></p>

- Collections are ordered folders: chapters in order, "2 of 4 read", Continue.
- Sort a collection by chapter, release date, date added or title, or show it as covers instead of a list. Its card says what it holds (clips, files, audiobooks, notes).
- A collection linked to a story's page finds new chapters and shows a "+N" to save them.
- Files: EPUB, PDF, MOBI, AZW3, FB2, CBZ, Markdown, text and HTML, copied in (a clip like any other) or read from where they are. Books keep their own contents.
- PDFs mixing Hebrew or Arabic with English keep each line's words in order.
- Big PDFs are read a piece at a time, never whole in memory.
- A PowerPoint deck (.pptx) is offered as a PDF: Convert redraws the slides, you save the PDF where you like, and it opens like any PDF you picked there.
- Watched folders bring new files into a chosen collection.
- A comic or book that names its series (a CBZ's ComicInfo, an EPUB's series) goes into that series' collection in volume order.
- The library can live in app storage, Documents or any folder you pick.

## Notes

<p><img src="docs/shots/notes-desktop.jpg" width="74%" alt="A lines note with a line written and typed text, on a computer"> <img src="docs/shots/notes-phone.jpg" width="21%" alt="A lines note with a line written and typed text, on a phone"></p>

- A note is a page of your own to draw and type on. Save with options › New note asks for Blank, Lines or Squares paper, each shown beside its name.
- It grows as you write: drawing on its last sheet adds another. Aa › Show as Pages shows it a sheet at a time.
- Pen, highlighter, eraser, Undo and Redo as before, and Select (loop, cut, copy, paste, move), Add › Image and Add › Text. Only a pen draws on a touch screen unless Finger is on.
- Opening a PDF offers Make a note beside Keep a copy and Read from where it is, and ⋯ › Make a note from it works on any file: a PDF's own pages, a comic's pictures, anything else set as pages. The file stays as it is. A note's card shows its first sheet.
- Notes show in their own part of the library, above Files, and Show › All notes (there once you have a note) lists them alone. Aa on a note has only Layout (All notes or This note, margins, brightness slider, theme, Dark note) and Auto-scroll, which goes on to the next note.
- Highlights › Try your pen shows what a pen sends and runs the pen test; ⋯ › Save as PDF makes a PDF of the sheets with what is on them.
- Settings › GitHub sync › What this device syncs has Notes: each note goes up whole (sheets, strokes, typed text, pictures and the PDF it was made from, up to 50 MB) and comes down on your other devices; what two devices drew is merged stroke by stroke. A bigger note says Not synced, too big. Notes go into backups too, with their own switch in Google Drive's What goes in.

## Saving

<p><img src="docs/shots/saving-desktop.jpg" width="74%" alt="Save with options on a computer"> <img src="docs/shots/saving-phone.jpg" width="21%" alt="Save with options on a phone"></p>

- Paste, drop or share a link; Ctrl V saves on a computer.
- Save with options: several links at once, a file, article or comic, a collection and tags.
- Wikipedia through its REST API, with its licence line; Readability for everything else.
- Discussions whole: Reddit, Hacker News, Lobsters, Stack Overflow and the other Stack Exchange sites, any Discourse forum, Lemmy, Substack (comments too), LessWrong and the EA Forum, Bluesky and Mastodon threads, and GitHub issues and pull requests, with who said what and replies indented. A GitHub code file as code, a repo as its README; an arXiv paper whole, from its web version.
- Pictures as small previews, full size (capped at 1600 px WebP) or links only, per clip or in Settings; or load pictures only when tapped.
- Images for feeds: while Images is Full images, a second pick in Settings sets the starting pictures for feeds you follow later; a feed's own menu still wins.
- Videos as a thumbnail and a link.
- A link to an EPUB, PDF or CBZ file downloads the file and adds it like one brought in.
- Web serials: save next, previous or all along a site's next-chapter links, or a contents page as its chapters. Royal Road, AO3, Scribble Hub, FanFiction.net, Blogger, WEBTOON, Tapas, Wattpad, SpaceBattles and Sufficient Velocity (by their threadmarks), and Wikisource.
- Comics and manga as image chapters, read edge to edge; a page that is a column of pictures is spotted as one, and Save as comic (or Save as article) fixes a clip saved the wrong way. Reading one, Auto-scroll takes Narrate's place, with its own Speed, Go on to the next clip and Keep the screen on. In Pages a comic is one page a screen (two side by side on a wide window), turned like a book; a manga turns right to left, and a two-page spread is read in halves on a phone.
- Pages built by JavaScript, drawn out of sight first; saving signed in to a site; the Internet Archive's copy when a page is gone.
- Save linked pages from a clip, and Update from the site keeping highlights and your place.
- Saves keep going with the app put away, wait for Wi-Fi if you like, and show in Downloads.
- Before you go offline: saves what's missing, then lists what isn't ready.
- Send to Waypage: a bookmark that saves the page a computer's browser has open.
- Save from email: shared text and .eml files.

## Reader

<p><img src="docs/shots/reader-desktop.jpg" width="74%" alt="Reader on a computer"> <img src="docs/shots/reader-phone.jpg" width="21%" alt="Reader on a phone"></p>
<p><img src="docs/shots/pdf-desktop.jpg" width="74%" alt="A PDF in Night with dark pages, on a computer"> <img src="docs/shots/pdf-phone.jpg" width="21%" alt="A PDF in Night with dark pages, on a phone"></p>

- Scroll or Pages, with two pages side by side on wide screens.
- Your place is kept as the paragraph on the middle line, and synced.
- The section being read in the top bar opens Contents; minutes left and percent along the bottom. Tap the text to hide the bars.
- Minutes left by your own reading pace, for the chapter or the whole clip.
- Picture viewer with zoom and swipe; footnotes in a sheet; Find in this clip.
- Previous and Next, and the collection's list, inside the reader.
- Tap the name at the top left of the reader to rename a clip or a note, on a phone too (Enter saves, Escape cancels). The reader's top bar has smaller icons on a phone.
- Brightness by a swipe on the edge, with Auto.
- Volume buttons turn pages on Android; keyboard shortcuts on a computer.
- Dark PDF pages: with a PDF open, a switch at the foot of Layout recolours its pages to a dark theme.
- Highlight words on a PDF read from where it is: select them on its printed pages and tap Mark; they join the clip's other highlights.

## Text and themes

<p><img src="docs/shots/look-desktop.jpg" width="74%" alt="Reader settings in Sepia on a computer"> <img src="docs/shots/look-phone.jpg" width="21%" alt="Reader settings in Sepia on a phone"></p>
<p><img src="docs/shots/night-desktop.jpg" width="74%" alt="Night theme on a computer"> <img src="docs/shots/night-phone.jpg" width="21%" alt="Night theme on a phone"></p>

- Themes: Paper, Sepia, Slate, Solarized, High contrast, Night, Black, Dusk and Solarized Dark, or Auto to follow the device.
- Ten reading fonts, four Hebrew ones, and your own.
- Size (or pinch), weight, line and letter spacing, margins, alignment, hyphenation.
- Any of them, and Scroll or Pages, per clip, per collection or per book.
- Dim pictures in dark themes.

## Skim

<p><img src="docs/shots/skim-desktop.jpg" width="74%" alt="Skim on a computer"> <img src="docs/shots/skim-phone.jpg" width="21%" alt="Skim on a phone"></p>

- A tap on the bottom row grows the bar into a slider with chapter notches and the chapters before and after.
- Your place waits until you read on; Back to where you were rides above the bar.
- Back to where you were also after Contents, a highlight or an in-page link.
- Works while Narrate is on: the voice goes on from where you skim to.

## Highlights, Translate and Look up

<p><img src="docs/shots/highlights-desktop.jpg" width="74%" alt="Highlights on a computer"> <img src="docs/shots/highlights-phone.jpg" width="21%" alt="Highlights on a phone"></p>

- Highlights in five colours, with notes: tap Mark on the selection bar for the last colour, hold it for the five (a mouse has the dot beside it, or keys 1 to 5).
- Draw on any clip or file: Draw on the selection bar, in the Highlights sheet, or D. On words a drawing stays with its paragraph or picture; on a PDF's pages, with the page.
- The Highlights place: every highlight and drawing, searchable, a colour at a time, Copy all or save as Markdown. Drawings show as small pictures, five per clip, then Show all.
- Highlights and drawings sync, stroke by stroke; on a file read from where it is, they show on another device with the same file.
- Translate this clip on the device, under the text or instead of it (ML Kit on Android, Chrome's own translator on a computer); translate selected words.
- Look up words offline in your own StarDict dictionaries.

## Narrate

<p><img src="docs/shots/narrate-desktop.jpg" width="74%" alt="Narrate on a computer"> <img src="docs/shots/narrate-phone.jpg" width="21%" alt="Narrate on a phone"></p>

- The device's own voices, offline, with the screen off and lock-screen controls.
- Read from here, a voice per language, speed 0.5x to 4x, footnotes on or off.
- Goes on to the next clip; keeps the screen on if you like; picture in picture; Bluetooth previous and next.
- Sleep timer from the moon on the player, and Sleep 15 min on the lock screen.
- Speech engine picker on Android; Allow mixing with other apps' sound.
- More speech engines on Android: Kokoro, one of three models to download, Piper voices for English and 13 more languages, and Get more voices for each of the phone's engines; pick a speech engine per language.

## Feeds

<p><img src="docs/shots/feeds-desktop.jpg" width="74%" alt="Feeds on a computer"> <img src="docs/shots/feeds-phone.jpg" width="21%" alt="Feeds on a phone"></p>

- Follow a site or feed (RSS, Atom, JSON Feed); posts in one list by day.
- Save a post, save all, or pick several; auto-save a feed's posts.
- Checked with the app closed, with notifications per post or grouped, and quiet feeds.
- Search the posts from the bar: titles, summaries, feed names and sites, in all feeds or the one picked.
- Feeds in and out as OPML.
- Swipe sideways to go to the next or previous feed (or address in Newsletters); the chips stay still.
- On a computer the list and the open post share the window half and half; drag the line between them to resize.

## Newsletters

<p><img src="docs/shots/newsletters-desktop.jpg" width="74%" alt="Newsletters on a computer"> <img src="docs/shots/newsletters-phone.jpg" width="21%" alt="Newsletters on a phone"></p>

- Make an email address (through Kill the Newsletter) and subscribe with it; emails arrive here and save as clips.
- Several addresses, unread dots, Copy address, and Confirm for subscription emails.
- Search the emails from the bar, by subject, summary or sender.

## Discover

<p><img src="docs/shots/discover-desktop.jpg" width="74%" alt="Discover on a computer"> <img src="docs/shots/discover-phone.jpg" width="21%" alt="Discover on a phone"></p>

- Wikipedia today at the top: the featured article and the most read, in your language. Tap one to read it first, or + to save it. The sliders at the top turn it off.
- Browse feeds, newsletters and Royal Road stories to follow, by kind (Sites, Feeds, Newsletters), and add one with a tap; swipe to move between the chips.
- A feed goes to Feeds, a story saves as a collection that gets its new chapters, and a newsletter (by email) copies your Newsletters address and opens its sign-up page.
- On the phone, Sites browses Royal Road, AO3, FanFiction.net, FictionPress, Scribble Hub, Wattpad, WEBTOON, Tapas, SpaceBattles and Sufficient Velocity as a grid by list and genre, page after page, plus hand-picked web serials.
- Books: Project Gutenberg and Standard Ebooks by list and subject, and Wikisource's texts; a book's EPUB downloads into the Library. These work in the browser too.
- The list is checked every week, so a feed that dies gets fixed or dropped.
- The search at the top searches what's shown: the lists as you type, a story site when you press search.

## Stats

<p><img src="docs/shots/stats-desktop.jpg" width="74%" alt="Stats on a computer"> <img src="docs/shots/stats-phone.jpg" width="21%" alt="Stats on a phone"></p>

- Time reading and narrated, words, clips opened, finished and saved, by week, month or year.
- Days in a row and the clips you spent most time on.
- Kept per device and added up through sync and backups; your time in a clip at its end.
- Reading widgets on Android.

## Sync and backup

<p><img src="docs/shots/sync-desktop.jpg" width="74%" alt="Sync on a computer"> <img src="docs/shots/sync-phone.jpg" width="21%" alt="Sync on a phone"></p>

- GitHub sync of clips, places, highlights, feeds, newsletters and stats through your own private repo, with a token for that repo only; each device picks which of them it syncs.
- Resumes after the app closes; on mobile data, sync only places and reading time.
- Google Drive backups, daily to monthly (on Android even with the app closed) or on demand, with pause, resume and delete; pick clips (or links only), feeds and newsletters. Files read from outside stay out of both.
- Back up (with Pause and Stop) and restore one file; export clips and collections as EPUB, HTML, PDF or Markdown.
- Storage: Make room, Make pictures smaller, sizes by collection.

## Settings and the app

<p><img src="docs/shots/settings-desktop.jpg" width="74%" alt="Settings on a computer"> <img src="docs/shots/settings-phone.jpg" width="21%" alt="Settings on a phone"></p>

- Settings in groups: Appearance, Reading, Library, App lock, Saving, GitHub sync, Google Drive, Storage; a search box at the top finds any setting. On a computer or tablet it opens as a window from the gear at the top right.
- Every setting is a name and one short line; the longer explanation is behind a ? on its heading. Options are drop-downs, themes a grid of swatches.
- About has the version, the changelog, and Credits: what Waypage is built with.
- App lock: passcode, fingerprint or face on Android, erase when forgotten.
- Home screen widgets on Android and iOS: Keep reading, Feeds, Favourites, Collection, Highlight; app icon shortcuts.
- The Android app updates itself and shows What's new; About › Test builds installs a branch's build before it's released, and puts the release back.
- Report a problem with a local error log.
- Animations switch; motion zooms and moves, and only dialogs fade.

## Privacy and security

- No server: pages are fetched on the device.
- Saved pages are untrusted and shown in a sandboxed frame with no scripts and a strict CSP; PDFs render in their own locked-down frame.
- Nothing leaves the device unless you turn it on (sync, Drive backups), and Translate runs on the device. The trade-offs are listed in ARCHITECTURE.md.

## Run it

Three ways to use Waypage, same files, same features:

- **In a browser,** nothing to install: open
  <https://danielnoam.github.io/waypage/>. Your clips stay in that
  browser's own storage, offline too (the page is cached, so it opens
  with no connection), and Install or Add to Home Screen makes it look
  like an app. Pictures are kept as links there.
- **On an Android phone,** as the app: download `Waypage.apk` from the
  [latest release](https://github.com/danielnoam/waypage/releases/latest),
  tap it, and allow your browser to install apps the first time. The app
  saves pictures and books to the phone, shares in from other apps, has
  widgets, and updates itself from the releases. iPhone: the same
  release carries an unsigned `Waypage.ipa` for AltStore or SideStore.
- **On your own computer, from the source:** clone the repo, run
  `node server.js` (or double-click `start.cmd` on Windows) and open
  <http://localhost:5173>. That is the web copy served from your disk,
  which is how changes are tried before they are pushed.

## Working on Waypage

[ARCHITECTURE.md](ARCHITECTURE.md) is the map: every file, how the
scripts share one scope, how a link becomes a clip, where clips live,
the sandboxed reader, sync, the phone apps, tests and screenshots.
[CONTRIBUTING.md](CONTRIBUTING.md) is the rulebook: the decisions already
made, the rules for every change, and how versions and releases work.
