# Changelog

All notable changes to Carry-on. Newest first.

## [1.45.9] - 2026-10-31

### Fixed
- Google Drive: connecting again after Disconnect on the phone said
  "Connect Google Drive again" and stopped. The phone kept the old
  sign-in Disconnect had cancelled; it's now dropped, so Google asks
  again. Also a privacy policy and terms page for Google's sign-in screen.

## [1.45.8] - 2026-10-31

### Fixed
- Files copied into a clip no longer say they were a PDF (or EPUB,
  Text...): no file kind on the card, its picture, the reader's top or
  the clip's own first and last lines. A clip added as a copy before now
  is shown the same way. Files read from where they are keep their marks.
- PDFs with Hebrew or Arabic and English together: a line's words come
  out in the right order (the pieces of a right-to-left line were read
  backwards), each paragraph reads in its own direction, and
  right-aligned paragraphs no longer break at every line. A PDF added
  before this needs adding again to get its text fixed.

## [1.45.7] - 2026-10-30

### Removed
- Sidebar on a computer: the "Add a feed" link. Add a feed from the
  Feeds place (type or paste its address in the bar at the bottom).

## [1.45.6] - 2026-10-30

### Changed
- Feeds and Newsletters: a sideways swipe moves only the posts. The
  feed chips at the top stay still.

## [1.45.5] - 2026-10-30

### Added
- Feeds and Newsletters: swipe sideways to go to the next or previous
  feed or address, All first. The list follows your finger.

### Changed
- Sidebar: the fold arrow sits inside its row (Library, Feeds,
  Newsletters), in the same highlight. Library no longer shows the
  number of clips.

### Fixed
- Opening the sidebar on a phone no longer hides the bar along the
  bottom in Library, Feeds and Newsletters. The page slid right under
  the sidebar and got wider than the screen, so the phone grew its view
  to fit and the bar went below the edge.

## [1.45.4] - 2026-10-30

### Fixed
- The thin line along the bottom of the reader stays put while the bar
  slides away and back. Since 1.45.2 the row slid over it, so it went
  missing and popped back.
- No more thin flicker at the edges while things slide in: the reader's
  bars, the skim, sheets, the sidebar, and screens coming in from the
  side. Their springs stopped a pixel or two past where they rest,
  showing what was behind for a moment. They now stop exactly in place.

## [1.45.3] - 2026-10-30

### Fixed
- The grown bottom bar no longer shows the percent twice; it's on the
  row under it.
- No more thin gap flashing between the skim and the row while the bar
  grows.
- One bar while it's grown: the thin line along the bottom steps aside
  for the skim's slider.

### Changed
- Back to where you were glides there in Scroll, instead of jumping.

## [1.45.2] - 2026-10-30

### Changed
- Skim is part of the bottom bar again: a tap on the bottom row grows
  the bar upward with the chapter, the slider and the chapter buttons,
  in place of a separate card over the text.
- Back to where you were rides above the bottom bar, so the bar (grown
  or not) never covers it.
- Skim works while Narrate is on: tap the row beside the player. When
  you let go, or tap Back, the voice goes on from the line across the
  middle of the screen.
- While the skim is up, a message shows at the top instead of over it.

## [1.45.1] - 2026-10-30

### Changed
- Skim has a bar of its own. Dragging along the bottom row sat right on
  the phone's own swipe for switching apps, so with the bars up a tap on
  the bottom row now raises a skim bar well above it: the chapter and
  the page or percent, a big slider with a notch at each chapter, and
  buttons for the chapter before and after. The switch between minutes
  left in the chapter and in the whole book is on it too. Tap the row
  again, or the text, to put it away. Your place still waits until you
  read on, and Back to where you were still comes up.

## [1.45.0] - 2026-10-29

Ideas from KOReader.

### Added
- Skim: with the bars up, drag a finger along the bottom row (or the
  line under it) to go anywhere in a clip or book. A label over your
  finger names the chapter and the page or percent, and the line has a
  notch where each chapter starts. Let go and "Back to where you were"
  takes you back. Your reading place doesn't move, here or on your other
  devices, until you read on from where you skimmed to.
- Back to where you were also comes up after jumping from Contents or
  to a highlight.
- Minutes left in this chapter: a book's bottom line counts down to the
  end of the chapter you're in, at your own reading pace. Tap the line
  to switch between the chapter and the whole book (or, in a clip with
  sections, the section and the whole clip).
- Text weight in the text settings, for thin fonts on a dark theme or a
  dim screen. Headings and bold move with it. Fonts that come only as
  regular and bold go in one step.
- Hyphenate, a switch in the text settings, on by default: long words
  break at the end of a line in any alignment, not only Justified.
- Dictionaries: add a StarDict dictionary in Settings › Reading (its
  .ifo, .idx and .dict files, or a .zip or .tar.gz of them), then select
  a word and tap Look up. It works offline and sends nothing anywhere.
  It finds "children" under "child", "went" under "go", and Hebrew
  words with a prefix like ו or ה. When none has the word, Translate is
  one tap away.
- Import from Wallabag: its JSON or CSV export, beside Pocket,
  Instapaper, Omnivore and Raindrop.

## [1.44.0] - 2026-10-29

### Added
- Newsletters in the sidebar folds like Library and Feeds, and lists the
  three addresses with the latest emails, each with how many are unread.
  Tap one to see only its emails.

### Changed
- The sidebar's places sit evenly, as close together as Feeds and
  Newsletters, with no wider gaps between them. The indent and the fold
  arrows show what belongs under Library and Feeds.

## [1.43.2] - 2026-10-29

### Changed
- The sidebar's Reading place is now called Stats (G then S on a
  keyboard; G then R still works).
- The sidebar has no lines between its sections any more, just space,
  and Stats sits apart from Highlights.
- Favourites, Collections, Clips, Files and the feeds under Library and
  Feeds are set in a little, so they read as part of the section above.

### Added
- A small arrow beside Library and Feeds in the sidebar folds their
  items away and back, sliding. Each stays as you left it on this device.

## [1.43.1] - 2026-10-28

### Changed
- Newsletters looks like Feeds and the library: a new address is named
  and made from the field at the bottom, an address's settings open by
  holding its chip (even when it's the only one), and Copy address sits
  on the line over the emails, beside the address, in place of New
  address and Settings.

## [1.43.0] - 2026-10-27

### Added
- Newsletters, a place of its own under Feeds in the sidebar. Make an
  email address for newsletters in it (from Kill the Newsletter, a free
  service), copy it, and sign up to newsletters with it. Each email
  arrives in Newsletters and is saved as a clip into a collection named
  after the address, titled by its subject, so it reads offline and
  syncs. Unread emails have a dot; a "please confirm" email has a
  Confirm button that opens its link in the browser and is never saved.
- Several addresses, one per newsletter or per group, each a chip.
  An address's Settings has Copy address, whether new emails save
  themselves, and Delete the address, which makes its emails bounce.
- On a computer the browser can't reach the addresses: Newsletters shows
  the emails your phone saved, through sync, and a new address can be
  made on Kill the Newsletter's page and its feed link pasted in.
- G then N goes to Newsletters.

### Changed
- Newsletter addresses aren't in Feeds, the Feeds widget or the OPML
  export (their links are their keys).

## [1.42.1] - 2026-10-27

### Changed
- Translate this clip has its own button in the reader's top bar, beside
  Highlights, instead of a row in ⋯. L opens it with a keyboard.
- On a phone the Contents button is the list icon again; the name of the
  section being read got cut off there. A computer still shows the name.
- A translation's Show is a choice of Off, Under the text, or Instead of
  the text, which shows only the translation where there is one.

## [1.42.0] - 2026-10-27

### Added
- Highlights in five colours: yellow, green, blue, pink and purple. The
  dot beside Highlight on the selection bar opens them; a new highlight
  takes the colour you used last. A highlight's colour changes in its
  sheet, and Highlights and a clip's list show one colour at a time
  when you use more than one.
- Kindle books without DRM (MOBI, AZW and AZW3) and FB2 books (also
  zipped, .fb2.zip) open like EPUBs, with their contents, links,
  pictures and cover. A Kindle book with DRM says it can't be opened.
- Translate this clip, in a clip's ⋯: the whole clip in another
  language, each paragraph's translation under it. It's done on the
  device, so the words aren't sent anywhere: in the Android app by
  Google's ML Kit (it downloads a language once, about 30 MB), and in
  Chrome on a computer by the browser's own translator. A long book
  can be stopped and finished later. The translation stays on this
  device and isn't narrated.
- Allow mixing, in Narrate's settings: music or a podcast in another
  app keeps playing under the voice instead of pausing.

### Changed
- Read aloud is now called Narrate.
- Highlights in lists show in their own colour, as they do in the text.

## [1.41.0] - 2026-10-22

### Added
- Clips' minutes and minutes left go by your own reading pace. Waypage
  measures the words you read by eye (not read aloud) against the time
  they take, over the last 30 days and across your synced devices, and
  shows it at the bottom of the Reading place. Until it has seen about
  2,000 words, it uses the usual 230 words a minute.

### Changed
- Time read stops counting sooner when you stop scrolling: after half
  again the time the words on screen should take you, between 20 s and
  90 s, instead of a flat two minutes.

## [1.40.1] - 2026-10-22

### Fixed
- Read from here starts at the word you picked. Before, it could start a
  few paragraphs further on (with Skip headers and footers on, the
  paragraph was counted against a list that still had the title and
  captions in it), and on a Wikipedia paragraph a few words off (the
  citation marks were counted).
- The play button reads from the sentence on the middle of the screen,
  where your place is kept, or from the top when you're at the top. It
  used to start at the paragraph under the top edge, often well above
  where you were, and pressed just after opening, before the clip was
  back at its place, from the start.
- Continue reading from the widget or the app icon's shortcut goes where
  the library's Continue reading goes: with a chapter just finished, the
  next one, not an older clip you hadn't finished. With a clip open, it
  stays in that clip.
- A collection widget's Continue (and its read aloud) opens the
  collection's next clip as it is when tapped, not as it was when the
  widget was last drawn; widgets are also redrawn at once when you leave
  the app.

## [1.40.0] - 2026-10-21

### Added
- Settings › Sync › On mobile data has a third choice, "Places and
  reading time only". On mobile data, where you are in each clip, what
  you finished and your reading time keep syncing; new clips, their text,
  deletions, tags and collections wait for Wi-Fi, and go in the full sync
  as soon as you're on it.

## [1.39.1] - 2026-10-21

### Fixed
- Where you got to in a clip, and whether it's finished, now comes over
  in sync even when the other device has a different version of it (saved
  again or changed in Edit clips there, with its text not on GitHub, or
  its text not coming down this time). Before, such a clip kept its old
  place here, so Continue reading and a collection's chapters fell
  behind on the web copy.

### Changed
- The Highlights row in the sidebar no longer shows a count.

## [1.39.0] - 2026-10-21

### Added
- Reading, a place in the sidebar under Highlights: this week, month or
  year as a bar a day (a month in a year), reading and read aloud in two
  shades, with the time, words, clips finished, opened and saved under
  it, days in a row, and the clips you spent most time on. The arrows
  step back to earlier weeks.
- Your time at the very end of each clip: how long you've spent on it,
  how long it was read aloud, about how many words, and when you
  finished it. Off in Settings › Reading or the reader's settings.
- Three Android widgets: Reading this week with its bars, Reading today
  and Days in a row. A tap opens Reading.
- Reading stats sync: each device keeps its own count and GitHub sync
  adds them up, and backups carry them.

## [1.38.0] - 2026-10-21

### Added
- Save linked pages, in a clip's ⋯ menu: the pages it links to, each
  once, to pick and save for reading offline too. Filter by words, or
  by the clip's own site and other sites; already saved ones show as
  saved. They can go into a collection named after the clip.
- Update from the site, in a clip's ⋯ menu: the page fetched again
  for whatever changed, in the old copy's place. Tags, collection and
  highlights stay, and the reading place stays on its paragraph when
  it's still there. It says when nothing changed.
- App lock, in Settings: a passcode to open Waypage, and on Android
  fingerprint or face on top of it. Locks right away or after 1, 5 or
  15 minutes away. Five wrong tries make it wait, longer each time. A
  forgotten passcode can only be erased with everything else on this
  device; GitHub sync or a Drive backup brings the clips back. On
  Android 13 and later the recent apps show a blank card while it's on.
- Reading stats are kept from now on, on this device only and not shown
  yet: time reading, words read, time read aloud, and clips opened,
  finished and saved, by day and by clip.

## [1.37.1] - 2026-10-18

### Fixed
- The percent stays on the right while reading aloud; the moon no longer
  hides it on a phone. The bar's sides are a little tighter there to fit
  both.

## [1.37.0] - 2026-10-18

### Changed
- The top bar names the section you're reading, and tapping it opens
  Contents. It takes the place of the Contents button.
- The line along the bottom shows the minutes left on the left, with the
  page (4/20) above them in Pages, and how far through as a percent on
  the right.
- The line over a clip's title says where it's from and when it was
  saved, no longer how long it is: the bottom line says that.

## [1.36.2] - 2026-10-18

### Fixed
- The moon no longer pushes back, play and next off centre: it sits to
  their right. On a phone the "min left" line makes room for it while
  reading aloud.

## [1.36.1] - 2026-10-17

### Fixed
- Reading on while a sync ran could pull the text back up when the sync
  finished: it put the clip back to the place it had when the sync
  started. Now a place you read on to while syncing is kept, and sent
  next time.
- An open clip moves to a place another device brought in only just
  after you open it, before you've scrolled, never while you're reading.

## [1.36.0] - 2026-10-17

### Changed
- The sleep timer moved out of Aa onto the read-aloud player, as a moon
  next to the next-paragraph button. Each tap is the next choice (15,
  30, 45 minutes, an hour, end of this clip, off), and it shows the
  minutes left.
- On Android, the read-aloud notification and lock screen have Sleep
  15 min: 15 minutes from now, or 15 more on a timer already running.

## [1.35.1] - 2026-10-17

### Changed
- "Volume buttons turn pages" shows in Aa › Layout only when Show as is
  Pages, since in Scroll there are no pages to turn.

## [1.35.0] - 2026-10-17

### Changed
- Big PDFs read from where they are (over 32 MB) open without the whole
  file being loaded into memory: Waypage reads only the parts of the
  file the pages on screen need. A 100 MB PDF opened in about a quarter
  of a second, reading 1.5 MB of it.

## [1.34.0] - 2026-10-17

### Added
- Send to Waypage, for a computer: Settings › Saving › Save from your
  browser has a button to drag to the bookmarks bar. On any page, click
  it: the web copy opens, shows the page's title, and saves it as your
  browser shows it (signed in, after its scripts ran) when you press
  Save this page. It then syncs to the phone like any clip. Nothing goes
  through a server. A few sites keep other windows out; Waypage says so,
  and those save on the phone.

## [1.33.0] - 2026-10-17

### Added
- Your own fonts: Settings › Reading › Your fonts › Add a font takes a
  .ttf, .otf, .woff or .woff2 file, and it shows under Font with the
  others (it becomes your reading font when you add it). With the
  library in Documents/Waypage or a folder you picked, font files put
  in its fonts folder show up too. A font stays on the device it was
  added on.
- More read-aloud voices on Android: when the phone has more than one
  speech engine (Google's, Samsung's, RHVoice, Piper voices through
  Sherpa…), Read aloud has a Speech engine menu above Voice, each engine
  keeping its own voice for each language. "Get more voices" opens the
  engine's own page for downloading voices.

## [1.32.0] - 2026-10-17

### Added
- A sleep timer for Read aloud, in Aa while it reads: pause after 15,
  30 or 45 minutes or an hour, or stop at the end of this clip. On
  Android it keeps time with the app put away or the screen locked; Play
  goes on from where it paused.
- Volume buttons turn pages (Android): in Aa, Layout, with Pages on,
  volume down turns to the next page and volume up goes back. Off by
  default, and the buttons are the volume again while reading aloud.
  On a computer the arrow keys, Page Up and Page Down already do this.
- Dim pictures in dark themes, in Settings › Appearance and on by
  default: in Night, Black, Dusk and Solarized Dark a clip's pictures
  are toned down so a white diagram doesn't glare. Tap one to see it in
  full. Comics and PDF pages stay as they are.
- Before you go offline, at the top of Settings › Saving (and from an
  empty Downloads): Get ready saves missing pictures, saves that failed,
  new chapters of the collections that follow a series and new posts of
  feeds that save themselves, then lists the clips that still aren't
  fully ready, each a tap away.
- Feeds in and out as OPML, the file every RSS reader uses: open one
  from Settings › Saving › Import (or Storage) to follow its feeds, their posts
  shown in Feeds rather than saved; Storage › Backup has "Save the feeds
  you follow (OPML)".

## [1.31.0] - 2026-10-17

### Added
- Delete a Google Drive backup: each backup in the Restore list has a
  bin beside it. It asks first, and the backup is gone from Drive for
  good.

### Changed
- Where you are in a clip is now the paragraph on a line across the
  middle of the screen, where you're reading, not the top edge. Places
  kept from before still open where they were.

### Fixed
- Leaving a clip right after scrolling (Back, the home button, a widget,
  Read next) could keep the place from before that scroll.
- Tapping a widget for the clip already open closed it and opened it
  again at an older place. It now stays where you are.
- Sync could send an older place over a newer one: just opening a clip
  on one device counted as reading it there, so its old place beat the
  place you'd read to on another. The place now has a time of its own,
  set only when you scroll.
- A clip opened before sync brought a newer place from another device
  now moves there, as long as you haven't scrolled yet.
- A long book left past 97% opened at the start again; now only one left
  on its last screen does. The place in a long book is also checked once
  more after it opens, as the text around it settles.
- This changelog had a merge left in it under 1.30.1.

## [1.30.1] - 2026-10-16

### Added
- A device that set up GitHub sync before 1.29.1 shows "Make a safer
  token" at the top of Settings › GitHub sync: make a token for
  waypage-data only, paste it in, and delete the old one, without
  turning sync off.
- Settings › Saving › Load pictures only when tapped. Full-size and
  linked pictures come from their sites, which can see when you read a
  clip; with this on, a clip opened online loads nothing from the web
  until you tap a picture. Previews saved on the phone always show.

## [1.30.0] - 2026-10-16

### Added
- Settings › Notifications. Turn notifications off altogether, or pick
  how new feed posts arrive: each post on its own, showing its title and
  the start of what it says, grouped by feed and with a Save button; or
  all together in one notification, as before. Each feed can be kept
  quiet, there or in the feed's own menu, and Sound and more opens the
  phone's own settings for Waypage.
- Tapping a feed's notification opens that feed in Feeds.

## [1.29.1] - 2026-10-16

### Changed
- Setting up GitHub sync now makes the private waypage-data repo first,
  then a token for that repo only. The old steps asked for a token that
  could reach and change every repo on your account. If you set up sync
  before this version, make a new token for waypage-data only and
  connect again with it, then delete the old one on GitHub.
- Sync checks once a day that waypage-data is still private, and stops
  with a note if it was made public.
- Report a problem says that an issue on GitHub is public, and cuts
  anything that looks like a GitHub or Google token out of its notes.

### Fixed
- A clip's "Open the original" only opens web and mail addresses, so an
  odd address in an imported backup can't run anything in the app.
- An imported email drops the invisible tracking pictures senders put in
  to learn when and where a message was opened.
- Google Drive's sign-in check uses a properly random code.
- The app builds no longer leave GitHub's access token where the build
  tools could read it, and the icon tool is pinned to one version.

## [1.29.0] - 2026-10-16

### Changed
- Long books and PDFs open in a fraction of the time. A clip past about
  150,000 characters lays out only the chapters on or near the screen
  and keeps the rest at a guessed height until you reach them, so a
  400-chapter book that took 13 to 23 seconds to show its text on a
  slow phone now takes about 3. Pages layout still lays out the whole
  book, as its columns need it.
- A book or comic read from its file no longer reads every picture out
  of the file before it opens: pictures are read as you come near them
  and let go again far behind you, so a big comic no longer sits whole
  in memory. Their slots take the picture's size from the file when
  it's added, so the page doesn't jump as they arrive.
- A PDF read from its file shows as soon as its first page is drawn,
  not after a screen and a half of pages.
- The clip's text is read through the app's own file server, like the
  library since 1.28.3, instead of a 3 MB string over the bridge.
- A long clip's pictures load as they're reached (loading="lazy"),
  except in Pages.

## [1.28.4] - 2026-10-15

### Fixed
- With a big library, searching redrew every card already scrolled to
  on each letter, and so did a filter, a sort or coming back to the
  library. Each of those now starts again from the first screen and
  draws the rest as you scroll.
- Highlights drew every highlight at once, which took seconds with
  thousands. It shows a screen of clips and the rest as you scroll.
- Going back to the library from Highlights measured hundreds of cards
  for no reason.
- Cards now come sixty at a time as you scroll, in shorter steps, so
  scrolling a long library stays smooth.

## [1.28.3] - 2026-10-15

### Fixed
- A big library (thousands of clips) kept the phone busy for seconds
  after the app opened, drawing every card, so taps in that time hung.
  Now the first screen is drawn and the rest follow as you scroll down.
- On a phone the library's index is read from the app's own address
  instead of through the plugin bridge, which copied the text twice more
  on the way.

### Changed
- The "Opened in …" timing line moved from About to Report a problem.

## [1.28.2] - 2026-10-15

### Fixed
- A big library made the app stall for a moment each time a screen,
  sheet or the sidebar opened or closed, so a tap right then seemed to
  do nothing. The library underneath is no longer made inert, which
  restyled every card; it's covered instead, which costs nothing.
- The first Back after opening the app redrew the whole library for no
  reason.
- Files that were already in a watched folder when you picked a
  collection for it now move into that collection the next time
  Waypage looks in the folder, even if they didn't move when you picked
  it. A file you moved by hand since then stays where you put it.

## [1.28.1] - 2026-10-14

### Fixed
- Picking a collection for a watched folder now moves the files already
  added from it, not only new ones. Before, a new collection had no
  files in it, so it didn't show. Picking "Its subfolders" puts them
  back into collections named after their folders.

## [1.28.0] - 2026-10-14

### Added
- A Sync screen. The sync button at the top of the library opens it,
  like Downloads: GitHub sync with its progress, Sync now and Pause, and
  Google Drive with Back up now and its progress, Pause and Stop. The
  button is there when either is on.
- Watched folders: under each folder, pick the collection its new files
  go into. "Its subfolders" keeps the old way, a collection named after
  the folder each file is in.
- PDFs added before 1.27.2 that are read from where they are get their
  bookmarks as Contents when opened.

### Changed
- A backup going up to Google Drive is on the Sync screen, not in
  Downloads. A restore, which comes down, stays in Downloads.

### Fixed
- The Downloads button on the "Downloading Waypage" message did nothing
  when the update was started from Settings: Downloads opened behind
  Settings.

## [1.27.2] - 2026-10-14

### Added
- Books now show their own Contents. Waypage reads the table of
  contents an EPUB comes with, and a PDF's bookmarks, so a book whose
  chapter titles aren't styled as headings still gets a Contents
  button. Books you already have get it the next time you open them.
- Show in folder (Android): hold a file you read from outside and tap
  Folder to see where it sits in the phone's Files app.

## [1.27.1] - 2026-10-14

### Changed
- Connecting Google Drive no longer starts a backup by itself. The
  first weekly backup comes a week after you connect.
- A Google Drive backup can be paused, resumed and stopped, from
  Settings › Google Drive or from its card in Downloads. In the app, a
  paused backup goes on from where it got to. A restore can be stopped
  while it's coming down.
- Settings: Sync is now GitHub sync. Edit clips and watched folders
  are now inside Library.

### Fixed
- A watched folder in Google Drive showed a long code instead of its
  name. It now shows the folder's name, including a folder already
  added.

## [1.27.0] - 2026-10-14

### Added
- Backups in Google Drive, in Settings › Google Drive, beside GitHub
  sync. Connect your Google account once, then Back up now or let it
  back up every week on Wi-Fi. Drive keeps the last three backups, in a
  Waypage folder. Pick what goes in: clips, files (books, PDFs and
  comics), and the feeds you follow. Any of the three restores on
  another phone or in a browser, keeping whichever copy of a clip was
  saved last. Waypage can see only the backups it makes. On Android and
  the web copy; iOS comes with the iOS release.

### Changed
- The read-aloud picture-in-picture window shows only the words being
  read. The collection and clip name come back when you make the
  window bigger.

## [1.26.4] - 2026-10-14

### Fixed
- Opening a clip no longer flashes a white, unstyled page for a frame.
  The page stays out of sight until its theme is on and it's back where
  it was left.
- Continue reading stays on a collection's next chapter after you open
  it from there and go back without reading far. It used to jump to a
  clip from somewhere else.

## [1.26.3] - 2026-10-14

### Fixed
- Reading aloud on to the next chapter (Read next, or going on by
  itself) no longer flashes the read-aloud card for a moment, as if
  another chapter were being read than the one on screen.

## [1.26.2] - 2026-10-14

### Fixed
- The read-aloud card no longer pops into view as it leaves the
  reader. It opens out from the player's play button as it moves, and
  folds back into that button when the clip is opened again.

## [1.26.1] - 2026-10-14

### Fixed
- The collection widget's Continue stays on one line, its type
  shrinking to fit instead of wrapping (Android 8+).
- The widget's read aloud starts where the clip was left. It started at
  the top, because it began before the page had gone back to its place.

### Changed
- The read-aloud card comes out of the reader's player as the clip
  closes, and goes back into it when the clip being read opens.

## [1.26.0] - 2026-10-14

### Changed
- Read aloud with a car, earbuds or any Bluetooth player (Android):
  their previous and next go a paragraph back or on, as the app's own
  buttons do, and pause and play follow them. They show the clip's
  name, its collection, and which clip of the collection it is.
- The reading now counts as this app playing, so those buttons reach it
  rather than the last music app, and a Bluetooth link no longer drops
  between paragraphs and cuts their first words.

## [1.25.0] - 2026-10-14

### Added
- Read aloud in a small window outside the app (Android 12 and later):
  going home while it reads leaves a window you can move, with the
  clip's name, the paragraph being read, and previous, pause and next.
  "Small window outside the app" in Read aloud turns it off, leaving
  it in the app only.
- "Keep reading when you leave the clip" in Read aloud, on by default.
  Off, reading aloud stops when you go back to the library or open
  another clip yourself; going on to the next clip by itself still
  works.
- The collection widget has a read aloud button beside a narrower
  Continue: it opens the next clip and starts reading it aloud from
  where you left it.

### Fixed
- The read aloud buttons on the reader's bottom bar sit in its middle,
  with even room above and below, instead of against its top edge.

## [1.24.1] - 2026-10-13

### Changed
- Sync brings in where you got to first: as soon as it has read the
  library on GitHub, the clips you already have take their places,
  finished marks and Continue reading from your other devices. Sending
  and bringing in clips' text comes after, so a big sync no longer holds
  your place back until it's done.

## [1.24.0] - 2026-10-13

### Added
- Read aloud has "Keep the screen on" (in Aa and Settings › Reading ›
  Read aloud): while the voice is speaking the screen doesn't dim or
  lock, so you can follow along. Paused or finished, it dims as usual.
  Off by default.

## [1.23.1] - 2026-10-12

### Fixed
- A picked collection in Shelf and Grid has its ring around the name,
  count and progress bar, clear of them, instead of running through
  them. A picked clip row in Shelf and One list gets its accent line
  again (that rule never matched).
- The collection button in the reader opens its list like Contents does;
  the whole page no longer drops in from the top first.
- Previous (and an earlier clip picked from the collection list) turns
  back: the page before comes in from the top, or from the left in
  Pages.

## [1.23.0] - 2026-10-12

### Fixed
- Read aloud with Go on to the next clip goes on with the app put away
  or another app open (Android): the next clip, when it's saved, is
  handed to the phone's reader before the end, instead of waiting for
  the app to be looked at. The reader turns to it when you're back.

### Added
- A clip in a collection, or with a site's previous page, has Previous
  at the top, like Next at the end.
- A collection button beside Contents in the reader lists the
  collection's clips, the open one marked, to jump to any of them.
- An app update downloads in Downloads (Android), with its progress,
  Pause and Resume; it goes on with the app put away, a paused one picks
  up where it stopped, and the installer opens when you're back.

## [1.22.0] - 2026-10-12

### Added
- Settings › Edit clips: find words in many clips at once and remove
  them, or replace them, in the clips' text or their titles. Pick all
  clips, some collections, or clips picked in the library (the selection
  bar has Edit). `*` stands for any words in a paragraph, so `~~*~~`
  removes two pairs of tildes and everything between them; Match case
  and Regular expression are switches. Find shows how many and a few
  examples before anything changes, and Undo puts the last change back.
- Edited text syncs to your other devices like a clip saved again.

## [1.21.1] - 2026-10-12

### Changed
- Feeds has no Select button any more: hold a post to start picking
  posts, as holding a clip does in the library. A right-click does the
  same with a mouse.

## [1.21.0] - 2026-10-11

### Fixed
- Sync sends what changed when you leave the app, even straight after
  reading: before, a place read just now often wasn't sent until the
  next time the app was open.
- A reading place no longer goes back after a restart or a sync. The
  library on disk is written in order, and when two places differ the
  one read later wins, so an older copy can't be sent everywhere.
- Continue reading counts a clip only once it has been open for a few
  seconds, and Back never reopens a clip from before the app restarted,
  which could quietly make another clip the one to continue.

### Added
- About shows how long the app took to open (scripts, library, first
  screen), and a problem report includes the last few starts.

## [1.20.0] - 2026-10-11

### Added
- Feeds has Select: pick several posts, then Open sends them all to the
  browser and Save saves them all.

### Changed
- A feed in the sidebar no longer shows a count beside it.

### Fixed
- Library in the sidebar goes back to the library from inside
  Collections, Clips, a collection or the favourites.
- Alignment reaches every block of text, not only paragraphs marked as
  such: many pages and books build theirs from divs, which kept their
  own alignment. Code, tables and pictures keep theirs.

## [1.19.0] - 2026-10-11

### Added
- Alignment under Text in the reader's settings: Original (whatever the
  clip or book came with), Left, Justified, Centered or Right.
- Spacing under Text: lines, letters, words and paragraphs, each with its
  own slider. Reset text puts them back too.

### Changed
- Moving the library to another place (Settings, Storage) copies the
  files natively on Android, at the phone's disk speed, instead of one at
  a time through the app's JavaScript. iOS still moves them the old way.

## [1.18.0] - 2026-10-10

### Added
- Big pictures are made smaller as they're saved: full images and comics
  are kept at most 1600 px wide and saved again as WebP (or JPEG), only
  when that's smaller. Scans and big pages usually end up about a
  quarter of the size and stay sharp on a phone. Settings, Saving, Big
  pictures turns it off.
- Settings, Storage, Make pictures smaller does the same for clips you'd
  already saved with full pictures, and says how much room it made.

## [1.17.0] - 2026-10-10

### Fixed
- Comics and manga on sites that swap their pictures in as you scroll
  saved only the first few. When a comic page still has blank pictures,
  Waypage now opens it in its hidden browser, scrolls to the end so the
  site loads every picture, and saves those. The site's scripts are
  never saved. In the app only, on Android and iPhone.

## [1.16.1] - 2026-10-10

### Changed
- The brightness slider lifts to move after half a second's hold, not a
  whole second.

### Fixed
- WEBTOON episodes still saved only their first few panels: they're now
  read from WEBTOON's desktop page, which lists every panel, whichever
  address was shared. Save an episode again to get the rest.

## [1.16.0] - 2026-10-10

### Added
- Pinch a clip's text to make it bigger or smaller, keeping your place
  under your fingers. Pictures and PDF pages still zoom as before. A
  switch for it is under Text in the Aa sheet and Settings, Reading.
- The brightness slider can sit on the right: hold it for half a second, then
  swipe it across (and back the same way). The swipe along the edge
  moves with it, and Settings, Reading has Left and Right for it too.
- A book or a PDF opens to a spinner, and shows its text once it's laid
  out, instead of half-styled text first.

### Changed
- A favourite's star sits on the corner of its picture, for collections,
  clips and files, instead of beside the name. Collections with a cover
  no longer carry the small book icon.

### Fixed
- WEBTOON episodes shared from the phone's browser (m.webtoons.com)
  saved only the first few panels; they now save every panel.

## [1.15.0] - 2026-10-10

### Added
- A page that's gone (not found, or the site refuses) can be saved from
  the Internet Archive's newest copy: tap Archived copy on the failed
  save. The clip keeps the page's own address, and says which day the
  copy is from.
- A clip's ⋯, More: Use the archived copy, for a page that changed or
  went away since you saved it. It takes the old copy's place, with its
  tags, collection and highlights.

### Changed
- A big library's first sync sends up to 50 clips at once instead of one
  at a time, and a sync cut off part way still picks up after the last
  batch that went.
- The sidebar has no line between your favourites and Collections, Clips
  and Files.

## [1.14.0] - 2026-10-10

### Added
- Find in this clip: ⋯, Find in this clip (or Ctrl F, or /) marks every
  match on the page, counts them, and steps through them with the arrows
  or Enter.
- A tap on a footnote mark, like a Wikipedia [1], opens the note in a
  small sheet over the page, with its links and a way to go to it.
- A tap on a link inside the page jumps there and leaves a "Back to where
  you were" button. A link to another site asks first: open the saved
  clip, save it for later, open it in the browser, or copy it. Saved for
  later with no connection, it saves when you're back online.
- Brightness Auto: in the brightness swipe, back to the phone's own
  level without turning the swipe off.
- The sidebar shows your favourite collections and clips under Library,
  then Collections, Clips and Files, each opening that part of the
  library.
- App icon shortcuts: a long press on the icon offers Continue reading,
  Search, and Save the copied link.
- Settings, Storage: Save all highlights, every highlight and its note
  in one Markdown file, clip by clip.

### Changed
- The sidebar no longer lists the three collections used last; it lists
  favourites instead.

## [1.13.0] - 2026-10-09

### Added
- A sync button in the bar, beside Downloads, while sync is on. A ring
  shows a sync running, a dot shows it went wrong, and it's dimmed while
  paused or waiting for Wi-Fi. Tap it for Settings, Sync.

### Fixed
- A sync cut off part way, by closing or updating the app, no longer
  starts again from the first clip: clips already sent stay sent, and
  clips already brought in stay in.
- A sync cut off while bringing clips in could take them for clips you
  deleted, and delete them on every device at the next sync. They now
  wait their turn instead.
- Pictures still to come for synced clips are fetched after the app is
  closed and opened again, instead of forgotten.

### Changed
- Sync brings clips in four at a time and puts them in the library as
  they arrive, rather than all at the end.

## [1.12.1] - 2026-10-09

### Fixed
- The voice menu under Read aloud in Settings opened cut off; it shows
  whole now.
- Settings no longer says "Reads while this clip is open" when no clip
  is open.

### Changed
- Opening a clip or collection from the library no longer grows the
  card into the page. The page settles in from slightly small over the
  card you tapped, and Back sends it back the same way. It moves only
  what the phone's graphics chip can move on its own, so it should not
  stutter.

## [1.12.0] - 2026-10-09

### Added
- An Animations switch in Settings, Appearance. Off, screens, menus and
  pages change at once with nothing moving, for a slower phone or if you
  would rather things just change.
- Read aloud's voice, speed and switches are in Settings, Reading, as
  well as in the reader's Aa sheet.

### Changed
- Settings are sorted by what you came to change: Appearance (theme and
  animations), Reading (type, page, brightness swipe, read aloud) and
  Library (layout, Continue reading, new chapters); then Saving, Sync
  and Storage; then About and Report a problem.
- Saving now holds everything that brings clips in, including watched
  folders (the Content page is gone) and Import (it was under Storage).
- The two Auto theme boxes show only while the theme is Auto.

## [1.11.1] - 2026-10-09

### Changed
- Opening a clip or a collection from its card is smooth now, even while
  the page is still being laid out. The card blends into the screen as
  it grows, and back into the card as Back shrinks it, so it lands on
  the card as it looks now.
- In scroll mode the next chapter comes up from the bottom. It turns
  sideways only in Pages.
- The Look up button under a selection is gone. Translate stays, and the
  phone's own menu still offers its lookups.

### Fixed
- The first long press on a word in a clip no longer drops the
  selection, so Highlight, Read from here and Copy show the first time.
- Back to the library no longer shows the card change a moment after
  the clip has shrunk into it.

## [1.11.0] - 2026-10-09

### Changed
- All of Waypage moves in a new way, and nothing fades. A clip or a
  collection grows out of the card, tile or Continue panel you tapped and
  shrinks back into it. Settings slides in from the right, Downloads and
  dialogs grow from their button, menus grow from where you pressed.
- Collections › and Clips › move the cards you see to their new places
  while the other sections leave past the top and bottom of the screen.
  Adding or removing clips slides the list.
- Sheets drag down to close, pages follow your finger in Pages, and the
  library drifts beside the sidebar as you drag it.
- On a computer the motion is quicker and never overshoots, and buttons
  don't dip when pressed.
- Toasts and bars come in from their edge, the brightness slider slides
  away past the left edge, checkmarks grow in, and the picture viewer
  shrinks back into its picture.

### Fixed
- Dragging a picture down in the viewer now lightens the background as
  it should.

## [1.10.2] - 2026-10-09

### Changed
- The Collection widget shows only the clip to read next, with its
  Start, Continue or Read again button held to the bottom of the widget.
  The list of clips after it is gone.

## [1.10.1] - 2026-10-09

### Fixed
- A new save that failed the first time and worked on Retry now tries
  again by itself, once, before it shows as failed: the connection waking
  as Waypage comes up from a share, a site's server error, or a page
  whose first drawing timed out.
- Continue reading no longer jumps to another clip on its own. A clip
  counts as just read only when your place in it really moves, not when
  its pictures load or its text is laid out again; and when you finish a
  clip in a collection, Continue goes to the next one in it.
- A collection goes on from the chapter you read last, not from the
  first one you skipped (chapter 59 when you were at 144). Its Continue
  button, the Collection widget and Continue reading all follow that.
- The brightness slider no longer shows over the reader's settings, hides
  while a sheet is open, and sits a little further in from the edge.

### Changed
- The brightness slider stays dimmed when it only shows with the bars,
  and goes full strength while you swipe or drag it.
- No more fades: screens, sheets, cards and toasts move without fading
  in or out. With reduced motion on, a short fade is still the answer.
- The new-chapters badge on a collection pulses while its chapters save,
  and a tap on it then opens Downloads.
- The Collection widget leads with what to read: the next clip, then the
  Continue button right under it (Start or Read again when that fits),
  then the clips after it. On a short widget the button was cut off at
  the bottom, leaving only a list. Clips there show how much is left,
  without their site.

## [1.10.0] - 2026-10-09

### Added
- Save words from an email. Gmail can't share a whole message, so
  select its text, tap Share and pick Waypage: it becomes a clip of its
  own, titled by the subject (or its first line). Any text shared with
  no link in it is kept this way, and so is a long passage with a link
  inside; a link with a line or two about it is still saved as the page.
- Email files open as clips. An .eml file (Download message in Gmail on a
  computer, Save As in Apple Mail or Outlook) opens like any other file:
  the email's own layout and the pictures inside it, with the subject as
  the title and the sender and date under it. Attachments are left out.
- Brightness while reading, in the app. Swipe up or down along the left
  side of the text to make the screen brighter or dimmer; a slider shows
  on the left while you swipe, and with the reader's bars, to drag. Your
  level is kept for the next clip, and the phone's own comes back when you
  leave the reader. Turn it off in the reader's Aa settings, under Layout.

## [1.9.0] - 2026-10-09

### Added
- A highlight a day, on the home screen. Add the Waypage "Highlight"
  widget (Android and iOS): it shows one of your highlights, with its
  note and the clip it's from, a different one each day. Tap it to open
  the clip right at it.
- Import from Pocket, Instapaper, Omnivore or Raindrop. Settings, Storage
  and backup, Import: pick the export file (Pocket's CSV or HTML,
  Instapaper's CSV or HTML, Omnivore's zip, Raindrop's CSV, or any list of
  links). Choose To read or All, and Waypage saves them, keeping their
  tags, with the ones you'd archived already marked finished. A browser's
  bookmarks file works too.
- Report a problem, in Settings. Say what went wrong, then send it, open
  it as an issue on GitHub, or copy it. It adds the version, the phone and
  the last errors Waypage noted, with web addresses cut to their site and
  page, and you see all of it before it goes.
- Make room, in Settings, Storage and backup: keep only the text of the
  clips you've finished, dropping their saved pictures (they show again
  when you're online), and see your five biggest clips to open or delete.

## [1.8.1] - 2026-10-08

### Fixed
- Translate opened the Google Translate app with nothing in it. On
  Android the words now go straight to it, and its translation shows
  over the page. It works offline too, with the app's downloaded
  languages. Without the app, Translate still opens the website.

## [1.8.0] - 2026-10-08

### Added
- Highlights has a place of its own in the sidebar, under Feeds: every
  highlight in your library, grouped by clip, the latest first, with
  their notes. Search them, copy them all as Markdown, and tap one to
  open the clip right at it.
- Translate and Look up on the bar over selected words. Translate opens
  the words in Google Translate into your phone's language; Look up (for
  up to three words) opens them in Wiktionary.
- Save signed in. When an article saves as only its start, tap Sign in
  (on the toast, or in the clip's ⋯ menu): the site opens inside
  Waypage, you sign in once, and the clip saves again whole, keeping its
  highlights and your place. Settings, Saving lists the sites you're
  signed in to, signs you out of one, and signs you in to another.
  Sign-ins stay on the phone and don't sync.
- Tap a collection's "+3" badge to save its new chapters, without
  opening it.

### Fixed
- Saving a clip again kept its collection, tags and place but lost its
  highlights. They stay now.
- The bar over a selection could sit off its words when the reader had
  scrolled under the frame.

## [1.7.1] - 2026-10-08

### Added
- A Highlights button in the reader's bar, beside Read aloud (or press
  H). It lists the clip's highlights; they're no longer in the ⋯ menu.
- Select words that are already highlighted and the button under them
  says Remove highlight.
- The library shows "Opening your library" in the middle while it's
  read, instead of a blank screen.

### Fixed
- The bar of buttons over a selection could stay up after highlighting,
  until you left the app. The highlight's own toast no longer has a
  button that kept it up longer, and the selection ends properly.
- The Highlight button could hide: over a long selection it went to the
  top of the screen, under the reader's bar and the phone's Copy bar. It
  now goes to the bottom when there's no room under or over the words.
  Words in text with no paragraph of its own (lines split by line
  breaks) can be highlighted too.

## [1.7.0] - 2026-10-08

### Added
- Highlights. Select words in a clip and tap Highlight. Tap a highlight
  to add a note, copy it or remove it. "Highlights" in a clip's menu
  lists them all, and a tap on one goes to it. Highlights sync to your
  other devices, go into backups, and come out in a clip's Markdown
  export and with "Copy all".
- "Highlighted" in the library's Show menu.
- A paywalled article now says when it's only the start. Waypage saves
  pages signed out, so a subscriber's article can come as its first few
  paragraphs. Its card says "Only the start", and the clip ends with a
  link to read the rest on the site.

### Changed
- The button under a selection is now two: Highlight, and Read from
  here.
- A big library opens smoother. After the first screen of clips, the
  rest are drawn a hundred and fifty at a time instead of all at once,
  so taps and scrolling answer while they come in. With two thousand
  clips on a slowed-down phone, the longest freeze went from 0.7 seconds
  to 0.15.

## [1.6.0] - 2026-10-08

The iPhone release: what Android had and iOS didn't. Built without an
iPhone to try it on, so each of these still wants a first try there.

### Added
- iPhone: Waypage in the share sheet. Share a page from Safari or any
  app, and Waypage opens and saves it.
- iPhone: home screen widgets, Keep reading, Feeds and Favourites, as on
  Android. Keep reading also fits the lock screen.
- iPhone: feeds are checked with the app closed, and a notification says
  when there are new posts. iOS decides when that runs, so it can be late.
- iPhone: open a book, PDF, comic or note in Waypage from the Files app,
  Mail or any app's "Open in".
- iPhone: Open a file can read a file from where it is, as on Android,
  instead of always copying it.
- iPhone: your library can live in a folder you pick in the Files app,
  like one in iCloud Drive (Settings, Storage).
- iPhone: watched folders, in Settings, Content.
- iPhone: pages that build themselves with JavaScript save, drawn first
  out of sight as on Android.
- iPhone: "Wait for Wi-Fi" for saving and sync, now that Waypage can tell
  mobile data from Wi-Fi there.
- Read aloud, in Aa: "Go on to the next clip" starts the next chapter, or
  the page a clip links to, by itself at the end.

### Changed
- Watched folders are all looked in at once, so a slow memory card holds
  up only its own files.

## [1.5.1] - 2026-10-08

### Added
- A PDF, a scan or a comic on a wide window shows its pages small down
  the side, the one you're on marked. Tap one to go there.
- Drop an EPUB, a PDF or any file Open a file takes onto the window to
  bring it in. The window says "Drop to open" while you hold it there.

### Changed
- Clip pictures in the library stand taller, like collection covers, so
  more of the picture shows: in Shelf and One list rows, and in Grid.

## [1.5.0] - 2026-10-07

### Added
- Big screens. On a tablet the save field moves up beside the menu
  button, clips go two columns, and sheets open as dialogs and panels
  instead of rising from the bottom. On a laptop or a tablet held
  sideways the sidebar stays open beside the library, with your tags and
  Settings in it.
- The reader on a wide window: the contents beside the text, the section
  you're in marked, and the licence and the original link under them.
  Reader settings, Layout: "Pages on a wide window" (One, Two, Auto) and
  a switch for the contents.
- Pages go two side by side on a wide window, and so do a PDF's printed
  pages.
- A collection on a wide window shows its cover and progress beside its
  chapters. Feeds at 1280 px and wider opens a post beside the list.
- Keyboard shortcuts: / to search, D for Downloads, G then L or F, J and
  K for sections, A for reader settings, and more. Press ? to see them
  all.
- Right-click a clip for its menu. Shift-click to pick a run of clips.
- Drop a link anywhere to save it, or press Ctrl V with no field
  selected.
- The picture viewer has previous and next arrows and zoom buttons.

### Changed
- Settings on a tablet or wider is two panes: its sections down the side
  and the one you picked beside them, Storage and Sync in two columns.
- Picking several clips on a big screen puts the actions in one bar at
  the top.
- The reading-aloud card sits at the foot of the sidebar when the
  sidebar is pinned.

## [1.4.2] - 2026-10-07

### Added
- When another device read a clip further, the toast names it: "Read to
  64% on Pixel 8". On Android Waypage uses the name the phone goes by;
  elsewhere it says "your phone", "your iPad" or "your computer".
- Settings, Sync: This device's name, to call a device something else.

## [1.4.1] - 2026-10-07

### Added
- On mobile data, in Settings, Saving and in Sync: save and sync as
  always, or wait for Wi-Fi. A save made on mobile data waits in
  Downloads and goes when Wi-Fi is back; feeds, new chapters and missing
  pictures check then too. Android only, since only the app can tell.
- Watched folders have their own Settings page, Content, with a look-now
  arrow and a stop on each folder.

### Changed
- The reading-aloud card is small and movable: drag it anywhere, it
  snaps to a side and stays there. It shows the clip's name, pause and
  stop, nothing more.
- Coming back to a clip from the card lights the paragraph being read
  and brings it into view.

### Fixed
- A second scroll bar on the right in Settings and other screens: a
  scroll that ran out in a screen went on to the library underneath.

## [1.4.0] - 2026-10-07

### Added
- Reading aloud carries on when you leave the clip, for the library,
  another clip or Settings. A bar along the bottom shows what's being
  read, with pause, Stop, and a tap that takes you back to it.
- When a clip read aloud reaches its end, Read next takes the player's
  place: it opens the next chapter, or the page the clip links to as its
  next, and reads it from the top.
- Any number of watched folders: Storage lists them, each with how many
  files came from it and a Stop, and Watch another folder adds one.

### Fixed
- The Collection widget showed "problem loading widget" since 1.2.3: its
  layout used a view Android doesn't allow in widgets.

## [1.3.0] - 2026-10-07

### Added
- Where you are in a clip syncs as a place in the text, so it lands on
  the same paragraph on a phone and a tablet, whatever their width and
  type size.
- Open a clip that another device read further, and a toast says so:
  "Read to 64% on your other device. Go there."
- While Waypage is in front it checks GitHub for changes every minute,
  cheaply, so a device reading alongside catches up within the minute.

### Fixed
- Opening a clip no longer moves your place by a hair: before, opening
  on one device a clip you'd read further on another could make the
  stale place win when the two synced.
- Closing a clip sends where you got to at once, not a few seconds later.

## [1.2.4] - 2026-10-07

### Fixed
- PDFs read from where they are open in a fraction of the time. The
  file is read in one go instead of in pieces that each started from
  the file's beginning; the PDF engine stays loaded between PDFs and is
  readied after launch when there's a PDF in the library; and the pages'
  sizes come in as you read instead of all before the first page shows.
  An old PDF's cover is drawn a moment after it opens, not before.

## [1.2.3] - 2026-10-07

### Changed
- The Collection widget's Start or Continue button runs along the bottom
  of the widget, under its clips.

## [1.2.2] - 2026-10-07

### Changed
- Printed PDF pages and comics zoom in place: pinch to zoom, up to four
  times, and pan with your finger; a double tap zooms in on that spot or
  back out; on a desktop, Ctrl and the wheel. A zoomed PDF page is drawn
  again at its new size, so it stays sharp. (1.2.1 opened the page on
  its own instead.)

### Fixed
- PDFs that came in before 1.2.1 had no card picture. Each gets its
  first page as its cover the next time it opens.

## [1.2.1] - 2026-10-07

### Changed
- The speed pass, second round. At launch the library draws its first
  screen of clips and the rest right after, so a big library is on
  screen sooner. While a run of saves is on, the library's index is
  written every few seconds and at the run's end instead of after every
  page. Sync's merge runs off the main thread, so a big library's sync
  never holds a tap. The `inert` toggle on the library stays as it is
  (NOTES.md).
- PDFs read from where they are get their first page as their cover.
- A pinch on a printed page or a comic panel opens it full screen, where
  pinch and double tap zoom it. (A double tap on the page did already.)

### Fixed
- The Collection widget showed the Favourites widget's picture in the
  widget picker. It has its own now, and shows the collection's name
  with a Start button, Continue once you've read into it, or Read again
  when all of it is read; the button opens the next clip.

## [1.2.0] - 2026-10-07

### Changed
- A speed pass. In a library of hundreds of clips, every page that landed
  redrew the library by scanning every clip once per collection; the
  collections are now grouped once and kept until something moves. Sync
  compared every clip with every other to find doubles; it's one pass
  now, and it pauses between its heavy steps so a tap is answered. While
  a run of saves is on, sync waits twenty seconds between runs instead of
  four. A page landing while a screen or sheet is moving waits for it to
  settle before the library is redrawn.
- At launch the library no longer shows "Nothing saved yet" and the
  empty-library message for the moment it takes to read your clips.

## [1.1.3] - 2026-10-07

### Fixed
- PDFs read from where they are open as their printed pages, so a laid
  out book keeps its figures, code and layout. "Show as text" in ⋯ sets
  its words in Waypage's own type, for reading aloud.
- EPUBs and other books read from where they are open and come in much
  faster: the file is read once instead of a piece at a time.
- A watched folder's files come in on one card in Downloads, with
  progress, Pause and Stop. A file you open by hand shows its progress
  there too.
- A file you open by hand that's already in from the watched folder isn't
  added a second time.
- A file read from where it is says "Remove from Waypage", not "Delete
  this clip", and one removed from the watched folder isn't added back.

## [1.1.2] - 2026-10-07

### Fixed
- Books read from where they are on Android (EPUBs, PDFs, comics, and a
  watched folder's files) open again. Every read started at the beginning
  of the file, so EPUBs looked like plain zips and PDFs like damaged ones.

## [1.1.1] - 2026-10-07

### Fixed
- The library no longer jumps back while pages download: the collections
  row kept scrolling back to its start with every page that came in.
- Files from places that don't say how big a file is (some cloud folders
  and file managers) read as empty, so every book looked damaged. Waypage
  now measures them itself.
- When a file can't be read, the message says what went wrong, and a
  watched folder says which of its files it couldn't read.

## [1.1.0] - 2026-10-06

### Added
- Watch a folder (Android): pick one, like Books, in Settings, Storage.
  Each time Waypage opens, comes back or is pulled down, it adds what's
  new in it, read from where it is. Its folders become collections, and a
  file you delete there leaves Waypage too.
- After reinstalling, an empty library offers to get back the one you
  kept in Documents/Waypage.

### Changed
- Collections keep their place while chapters download into them. They
  used to jump to the front with every chapter that landed.
- Long scanned PDFs read from their file open at once: each page is drawn
  as you reach it, instead of all of them every time.
- A file's clip with up to 100 MB of pictures syncs them (20 MB before).

### Fixed
- Chapters saved twice when you saved new chapters while sync was still
  bringing them in. Clips already saved twice are cleaned up when
  Waypage opens, keeping where you were.
- Stop on sync's downloads now stops them until Waypage is next opened;
  before, they started again a few seconds later.
- The line along the bottom of the reader no longer covers the Next
  chapter card at the end of a page.

## [1.0.0] - 2026-10-06

### Changed
- Carry-on is now Waypage, with a new icon: an open book whose middle is
  a road. It's a new app, so it starts empty: send your library from
  Carry-on (Settings, Updates, "Send your library to Waypage"), or turn
  sync on with the same GitHub account. Then you can remove Carry-on.
- Sync keeps your library in a repo called waypage-data. Your
  carryon-data repo is renamed to it when you connect, with everything in
  it.
- The web version moved to danielnoam.github.io/waypage, and keeps the
  library and settings it had.

## [0.36.0] - 2026-10-06

### Added
- Getting ready for Carry-on's new name, Waypage. When Waypage comes out,
  Updates says so and gets it for you. Waypage is a new app beside this
  one, so Updates also offers "Send your library to Waypage": a backup
  you hand to Waypage from the share sheet.

## [0.35.0] - 2026-10-06

### Added
- A Collection widget on Android: pick a collection when you place it,
  and it shows the next clips to read in it. Tap a clip to read it, or
  the widget to open the collection. It follows the collection when you
  rename it.

### Changed
- The Favourites widget shows your favourite collections too, first,
  then your favourite clips.

## [0.34.2] - 2026-10-06

### Changed
- Voices for read aloud are easier to tell apart: grouped by country,
  the best ones first, and each one says what sets it apart (natural,
  female or male where the phone says, online). Google's online copy of
  a voice the phone already has is left out.
- The voice picker is a field like the font pickers.

### Fixed
- Hebrew font names have a space before their עברית sample.

## [0.34.1] - 2026-10-06

### Changed
- In the reader's settings, the theme moved from Text to Layout, next to
  scroll or pages and the margins.

### Fixed
- Opening a drop-down in a sheet, like the font picker, no longer scrolls
  the sheet and leaves it moved. The list fits where it opens, upward if
  there's more room above, and scrolls inside itself.

## [0.34.0] - 2026-10-06

### Changed
- The reader's settings are behind a gear now, not Aa, and come in three
  parts: Layout (scroll or pages, margins), Text (font, size, spacing,
  theme) and Read aloud. The part you used last opens next time.
- Fonts are picked from a drop-down, each name shown in its own face, in
  the reader and in Settings.
- Read aloud's speed is a slider, from 0.5× to 3×.
- Pulling down to refresh also checks for a new version of Carry-on.

### Added
- Read aloud: "Read footnotes" reads the notes at the end of a clip,
  which are now skipped unless you turn it on. "Skip headers and footers"
  leaves out the title, captions and whatever header or footer the site
  left in, and reads just the body.

## [0.33.0] - 2026-10-06

### Added
- Choose where your library is, in Settings under Storage and backup:
  inside Carry-on (the default), Documents/Carry-on, which you can see in
  the Files app and which stays if you uninstall, or any folder you pick,
  a memory card too. Changing it moves every clip there; a library
  already in that folder is added to yours.
- On iPhone, your library shows in the Files app, under On My iPhone.
- PDFs can be opened with Carry-on from other apps on Android.

## [0.32.2] - 2026-10-06

### Changed
- Every file you open asks whether to keep a copy or read it from where
  it is, not just comics, books and PDFs: notes, text and HTML pages too.
  A file read from where it is lives in Files and doesn't sync.
- "Restore or open a file" in Settings, a file dropped on the window in
  Chrome or Edge, and a file opened with Carry-on from the Files app can
  all be read from where they are now. When the file came without lasting
  access, the choice still shows and says how to get it.

## [0.32.1] - 2026-10-06

### Fixed
- Choosing "Read from where it is" for a PDF made a copy anyway, so the PDF
  landed in Clips and deleting it said it would leave the phone. It now
  reads from the file and lives in Files like a comic or a book does. A
  scanned PDF draws its pages from the file each time you open it.
- A scanned PDF (one with no words in it) stopped on its first page while
  opening. It now comes in.

## [0.32.0] - 2026-10-06

### Added
- PDFs open in Carry-on. A PDF with words in it becomes a clip of those
  words, so it takes your theme, your type, read aloud, search and your
  place; a scanned one comes in as its pages, read like a comic.
- When you open a comic, a book or a PDF, Carry-on asks whether to keep a
  copy or to read from the file where it is. A copy is a clip like any
  other and syncs to your other devices. Reading from the file costs
  almost nothing on the phone: its pictures stay in the file and are read
  as you open it. Those clips live in Files, and stay on this device.
- Files you open go through the phone's own picker now, which is also
  what lets Carry-on keep reading a file tomorrow.

### Changed
- A clip made from a file no longer keeps a second copy of the file
  beside it, so a comic takes about half what it did in 0.31.0. The
  copies 0.31.0 left are given back when this version starts.
- Copies of files sync like any other clip, pictures and all, as long as
  their pictures come to less than 20 MB.

## [0.31.0] - 2026-10-06

### Added
- Open your own files: an EPUB book, a Markdown or text note, an HTML
  page or a CBZ comic becomes a clip you read like any other, with your
  place, tags, collections and favourites. Tap the list button beside
  Save and Open a file, drop it on the window on a computer, or on
  Android open it with Carry-on or share it to Carry-on from another app.
- A book keeps its chapters, pictures, cover and footnotes; a comic reads
  edge to edge in its page order.
- Files have their own part of the library, after Clips, and a place in
  the sidebar. Share on a file's ⋯ sends the file itself.

### Changed
- Files stay on the device they were opened on for now: sync leaves them
  out. A backup carries them, original file included.

## [0.30.10] - 2026-10-06

### Changed
- Sync keeps what's new in Feeds the same on every device: posts you've
  looked at on one aren't counted as new on another.

## [0.30.9] - 2026-10-06

### Added
- A collection can be a favourite: open it, tap ⋯ and Favourite. It
  wears a star on its tile, shows under Favourites in the library with
  your favourite clips, and comes first in the sidebar. It keeps its star
  through a rename, a backup and sync.

## [0.30.8] - 2026-10-06

### Changed
- Fades in the app now really fade: they run on their own gentle timing
  beside the movement, where before they were over in a few frames.
- A clip or collection grows out of the card you tapped again, as it did
  before 0.30.5, and shrinks back into it on Back.
- Tapping Collections or Clips in the library responds at once: the
  library fades out and back in with the new view, instead of freezing
  for a moment and then stuttering.
- The sidebar and menus no longer catch on their first frames.
- The reader's top and bottom bars are back to their earlier colour,
  which matches the strip under the status bar.

## [0.30.7] - 2026-10-05

### Changed
- What you save from the web is now called a clip, everywhere: the
  library, sheets, Downloads, Sync, Settings and the widgets. "Page" now
  only means a web page, or a page in the reader's Pages layout. Files
  is kept for documents you bring in from the phone, when that comes.
  Nothing you saved moves: storage and sync are unchanged.

## [0.30.6] - 2026-10-05

### Changed
- Tapping Collections in the library moves the row of collections up and
  opens it out into the grid while the pages fall away; tapping Pages
  closes the pages up under their heading. Back plays it the other way.

## [0.30.5] - 2026-10-05

### Changed
- Opening a page or collection from the library scales it up from the
  card you tapped as it fades in, and Back settles it into the card.
- Settings, Downloads and the other screens slide in a short way as they
  fade in, in the same family, instead of crossing the whole screen.
- Drag the sidebar to the left to close it. It follows your finger, and
  a short drag springs back.
- The reader's top and bottom bars are a shade darker, and the time or
  pages left sits further in from the edge, centred in its bar.

## [0.30.4] - 2026-10-05

### Fixed
- Animations start the moment you tap and run smoothly: opening the
  sidebar, Settings, a page, a collection, a sheet and going back. Each
  one waited on a tenth of a second of work first, and the page and
  collection zoom repainted every frame.
- The Install button in About has its label centred.

### Changed
- Sync has Pause and Resume in place of Stop syncing, which used to
  disconnect. Disconnect from GitHub is its own button at the bottom and
  asks first.
- A sync shows in the notification shade while it runs, as downloads
  do, and keeps going with Carry-on in the background on Android. Its
  Stop pauses the sync.

## [0.30.3] - 2026-10-05

### Added
- Sync can send links only: Settings, Sync, Pages, Links only. That
  device sends and takes no page text and saves pages new to it from
  their links. Pages too stays the default, since a page can change or
  go away.
- Settings, Sync shows what a sync is doing (sending or bringing in
  pages, with a bar) and what follows it: pages saving from their links
  and pictures being fetched.

### Changed
- The next page in the reader comes up from the bottom.
- A page or collection opened from the library grows out of its card,
  and shrinks back into it.
- A collection with no cover shows its icon, big and centred, on its
  tile, inside it and in the sidebar, with no name drawn on it.
- The sidebar's collections and feeds line up with Library.

## [0.30.2] - 2026-10-05

### Fixed
- Pictures download on Android again. A new page's pictures never
  saved, so they only showed online and the page said previews were
  missing. Pages you already saved get theirs the first time Carry-on
  opens with a connection.

### Added
- Switch how a page keeps its pictures from its sheet: Previews, Full
  size or Links.
- Tap Collections in the library to see every collection in a grid, or
  Pages for the pages in none.

### Changed
- Collection and tags are picked from dropdowns in a page's sheet.
- While a collection's new chapters save, their Save button gives way to
  "Saving · See in Downloads".
- Updates and About are one section: tap the version to check for a
  newer one.
- The reader's Contents button sits on the left, beside Back.
- Pulling down to check opens its circle above the sorting and filters.
- "Pages in no collection" is just "Pages".

## [0.30.1] - 2026-10-05

### Added
- Sync is easier to set up: Settings, Sync walks you through it in three
  steps, with GitHub's sign-up and a token page already filled in.
- Add another device with a setup code. Scan it in Carry-on on the other
  phone (Settings, Sync, Scan its setup code), or copy the setup link.
- The feeds you follow sync too, with how you follow them. Each device
  checks them for new posts itself.

### Changed
- Settings, Sync is laid out like the rest of Settings.
- Add a feed is no longer in the sidebar. Add one from Feeds.

## [0.30.0] - 2026-10-05

### Added
- Sync: your library on every device, through a private GitHub repo of
  yours. Pages, tags, collections, favourites and where you are in each
  page stay the same everywhere; a page deleted on one device goes from
  the others. Pictures don't go through GitHub: each device gets its own
  from the sites, as Links, Previews or Full images like the page was
  saved. Turn it on in Settings, Sync, with a GitHub token.

## [0.29.2] - 2026-10-05

### Added
- Favourites: tap Favourite in a page's sheet (hold it in the library, or
  ⋯ in the reader). Favourites get a star on their card and their own
  choice in Show.
- A Favourites widget on Android: the four pages you favourited last, one
  tap from reading.

## [0.29.1] - 2026-10-05

### Added
- Saves from WEBTOON, Tapas and Wattpad. A WEBTOON or Tapas episode saves
  as a comic with every panel, its series, its creators and the next
  episode; a series' page offers its episodes as chapters. A Wattpad
  chapter saves whole, every page of it, and a story's page offers its
  parts. Tapas novels save as text.
- Pages shows which page of how many at the bottom left of the bar.

### Changed
- Pages turn much faster, and quick taps add up.
- The Keep reading widget can shrink to one row: the title and how far in.

## [0.29.0] - 2026-10-05

### Added
- Pages: read a page a screen at a time. Switch between Scroll and Pages
  in Aa. Tap either side or swipe to turn, or use the arrow keys.
- Home screen widgets on Android: Keep reading, which opens the page you
  were reading where you left it, and Feeds, with the newest posts.

### Changed
- On Android, Back in the library or Feeds opens the sidebar, and Back
  again puts the app away. The swipe from anywhere is gone; on iPhone
  and in a browser the sidebar opens with a swipe from the left edge.

## [0.28.4] - 2026-10-05

### Added
- On Android, feeds are read every few hours with the app closed, and a
  notification says when there are new posts. Tapping it opens Feeds,
  which reads those feeds again. Posts set to save themselves still save
  when the app is open.

## [0.28.3] - 2026-10-05

### Added
- Backups include the feeds you follow, with their settings and posts.
  Restoring follows any that aren't followed here and leaves the others
  as they are.

## [0.28.2] - 2026-10-04

### Added
- Swipe right in the library or Feeds to open the sidebar.
- Pull down at the top to check for what's new: Feeds checks its feeds,
  the library checks collections that follow a series for new chapters.
- Hold a feed (its chip or its row in the sidebar) for its settings and
  Check now.

### Changed
- A collection with new chapters shows "+2" on its cover.
- Tapping the next chapter at the end of a page turns to it with a
  slide.
- The Add a feed chip is gone from Feeds; the field at the bottom does
  that. On a touch screen, Check now gives way to pulling down.

## [0.28.1] - 2026-10-04

### Changed
- Tap a post in Feeds to read it in Carry-on without saving it; its ⋯
  saves it. The new button beside + opens it in the browser.
- The sidebar lists your three latest collections under Library and your
  three latest feeds under Feeds.
- In Feeds, the field at the bottom follows a site or feed instead of
  saving a link.
- The Select button is gone from the library: long-press a page and pick
  Select, or long-press a collection.

## [0.28.0] - 2026-10-04

### Added
- Follow a site's feed. Add a feed from the new sidebar (the menu button
  at the left of the bar): a site's address is enough, Carry-on finds its
  RSS, Atom or JSON feed.
- Feeds shows every new post in one list, by day, with chips for each
  feed. Tap + to save a post, or Save all for a day; saved posts go into
  a collection named after the feed.
- Set a feed to save its new posts by itself, and pick its pictures, its
  collection and how old a post can be before it's skipped. Feeds are
  checked every few hours while the app is open and online.

## [0.27.12] - 2026-10-04

### Changed
- The web copy is a reader of its own. Open a backup from your phone and
  its pages read here with their pictures, offline. In a browser,
  Wikipedia saves directly; other sites say to save on the phone and
  bring the page over with a backup.
- A browser keeps the library in IndexedDB instead of localStorage, which
  held only about 5 MB.

### Added
- Install Carry-on from About, where the browser offers it (on an iPhone,
  About says how: Share, then Add to Home Screen).
- Storage in a browser shows the space used and asks the browser to keep
  your pages rather than clear them when space runs low.

## [0.27.11] - 2026-10-04

### Changed
- A collection opens as a book page: its cover, how much you've read and
  the time left, Continue, new chapters to save, then its chapters with a
  tick on the ones you've read. Its tools moved into the ⋯ menu.
- Rename happens in place on the title, Reorder lets you drag chapters by
  a handle (the arrows are still there), and Remove asks in a sheet.

### Added
- What's saved, for a collection and in Storage: how much of its size is
  pictures and how much is text, which pictures are kept as links, with
  Save again to switch them.

## [0.27.10] - 2026-10-04

### Changed
- Search stays out of the way until you tap its button in the bar. It
  stays open while something is typed in it, and a second tap or Escape
  puts it away.
- Select moved out of the bar to beside Order, with the other tools for
  the list.

## [0.27.9] - 2026-10-04

### Added
- Downloads, a screen of its own behind a new button in the library's
  bar: what's downloading, pages that couldn't be saved, and what
  finished since you opened the app, each with Open. A collection being
  saved is one card with Pause and Stop, its failed pages inside it with
  Try again. The button's ring fills as everything downloads, and a
  warning dot stays while a failed page waits.
- On Android, saving keeps going with the app put away or the phone
  locked, with a progress notification that has Stop. iOS lets the page
  in progress finish for about half a minute; the rest goes on when you
  open the app again.

### Changed
- Saving cards left the library, which now shows only saved pages.
- Save again on a collection shows in Downloads like any other download,
  with Pause and Stop.

## [0.27.8] - 2026-10-04

### Fixed
- A Blogger serial that splits its posts by length (like The Zombie
  Knight Saga) no longer saves the end of the previous chapter at the
  start of a chapter and the start of the next one at its end. The
  "Click to display entire chapter at once" line is gone too. Use Save
  again on chapters saved before.

## [0.27.7] - 2026-10-03

### Added
- Three looks for the library, picked in Settings, Appearance, Library
  layout: Shelf (the default: collections as a row of book covers,
  pages listed under them), One list (collections and pages together,
  grouped by date or site) and Grid (covers three across, pages as
  picture cards).
- The library's top bar stays while you scroll, with a Search button
  that takes you up to the search field.

### Changed
- The filter capsules are now one Show dropdown (All pages, Unread,
  Finished, your tags) beside the order, over the whole library.
- The order applies to collections too: by their newest page, the one
  read last, their length or their site.
- Continue reading shows only when nothing is filtered.
- A collection with no picture gets a cover drawn from its name.

## [0.27.6] - 2026-10-03

### Added
- A collection linked to its story page shows the story's cover, like
  a Royal Road book cover, kept on the phone so it shows offline.
- A page with no picture of its own shows its site's icon, or the
  site's first letter when there's no icon.

## [0.27.5] - 2026-10-03

### Changed
- Save with options picks the collection from a dropdown (None, your
  collections, or New collection…) instead of a row of buttons.
- Its tags are a dropdown too: the tags you have, or New tag…. The ones
  picked show above it, each with × to take it off.

## [0.27.4] - 2026-10-03

### Fixed
- Going back and quickly tapping the same collection or page again no
  longer leaves the library stuck, taking no taps until you leave and
  come back.

## [0.27.3] - 2026-10-03

### Fixed
- Reading aloud no longer stops partway through a Blogger chapter whose
  lines are all inside one block, like The Zombie Knight.
- It reads an author's note's text and a list item that has a sublist,
  which it skipped before.
- It skips a closed spoiler instead of reading it out.
- In a browser, a line the voice can't say is skipped instead of ending
  the reading.

## [0.27.2] - 2026-10-03

### Fixed
- Reading aloud reads pages whose text isn't split into paragraphs, like
  Blogger serials, instead of stopping after the title and author. "Read
  from here" works on those lines too.

## [0.27.1] - 2026-10-03

### Added
- Select a word and tap "Read from here" to start reading aloud from it.

### Changed
- The read-aloud controls are in the middle of the bar along the bottom,
  which stays up while it reads.
- The reading progress line along the bottom is thicker.

### Fixed
- Reading aloud no longer stops at a line with no words, like a scene
  break ("* * *"), or when the phone's engine skips a piece without
  saying so; after a short pause it goes on.
- A notification sound or another app's short sound pauses the reading
  only while it plays, then it goes on by itself.

## [0.27.0] - 2026-10-03

### Added
- Read aloud: the speaker button in the reader's top bar reads the page
  with your phone's own voices, offline, from the paragraph on screen.
  The paragraph being read is lit up and the page follows along.
- A small player while it reads: previous paragraph, pause or play,
  next paragraph. Tap the speaker again to stop.
- It keeps reading with the screen off. Pause, skip or stop it from the
  lock screen or the notification.
- Voice and speed for reading aloud are in Aa. The voice is kept for
  each language, so a Hebrew page and an English one can each have
  their own.

### Changed
- The page no longer puts the reader's bars away when it scrolls itself
  to follow the voice.

## [0.26.0] - 2026-10-03

### Added
- Blogger serials save as whole chapters: a chapter spread over several
  posts (a label like "ch12") becomes one page, read from the blog's
  feed, and the blog's home or contents page lists every chapter.
- A collection's Chapters button: look for new chapters, save previous
  or next ones, link it to the story's page, and save its pages again.
- Link a collection to its story page (a Royal Road fiction page, an
  AO3 work). New chapters come from its chapter list, which also finds
  chapters added in between, and the collection shows a book icon.
- Save again: download a collection's pages again with other pictures
  or the author's edits. Each keeps its place, tags and read position.
- Export a whole collection as EPUB, one HTML file, PDF or Markdown,
  then save it to your phone or send it.

### Changed
- Folders are now called collections.
- The library's sort is our own menu, not the system's.
- The reader's bars: a tap on the page shows them, and any scroll hides
  them again. Scrolling up no longer brings them back.
- Every button, chip, row and tile answers a press, with no grey flash
  or blue outline. The options button beside Save matches it.
- Unread and Finished keep collections whole, as tiles, and list only
  the pages in no collection.

## [0.25.2] - 2026-10-03

### Added
- Export a page as PDF, HTML, EPUB, Markdown or the site's page source,
  from Export in the page's ⋯ menu. Save it to your phone (Android asks
  where; on iPhone it goes to Files) or send it.
- Markdown export: the page's text with its headings, lists, quotes,
  tables and links, for a notes app. Pictures link to the full image on
  the site.

### Changed
- ⋯ is shorter: Send, Send as EPUB, Print and Send page source are now
  all in Export.

## [0.25.1] - 2026-10-03

### Fixed
- Ordinary pages, like a news story, no longer get taken for a list of
  chapters. Dates such as "Sep 12" and a site's menus counted as
  chapter links.
- When a page is read as a list of chapters, Save with options now
  offers "Save it as one page instead".

## [0.25.0] - 2026-10-03

### Added
- New chapters: a folder saved with Save next or from a chapter list
  can look for chapters after its last one. Tap Check under the
  folder's chapters, or let it check by itself once a day when you're
  online (Settings, Appearance, Library). A folder with new chapters
  shows "2 new" on its tile, and Save next saves them.
- Royal Road, Archive of Our Own, Scribble Hub and FanFiction.net save
  just the chapter, with the author's notes kept and set apart, and
  without menus or comments. A story's own page gives every chapter,
  even when the site lists them over several pages.
- "Send page source" in a page's ⋯ menu sends the original page as a
  file, for a site that saves badly.

### Fixed
- Royal Road chapters no longer include the hidden lines saying the
  story was taken from Royal Road.
- Archive of Our Own works marked for adults save instead of saving the
  "this work could have adult content" notice.
- FanFiction.net chapters know their next chapter.

## [0.24.0] - 2026-10-03

### Added
- Ten fonts to read in: Source Serif, Literata, Lora, Merriweather,
  EB Garamond, Instrument Sans, Inter, Atkinson Hyperlegible,
  OpenDyslexic and your phone's own System font. All work offline.
- Hebrew fonts: Frank Ruhl Libre, David Libre, Assistant and Heebo. A
  Hebrew page uses the one matching your font's style, or the one you
  pick under "Hebrew" in Aa.
- Six more themes: Slate, Solarized, High contrast, Black, Dusk and
  Solarized Dark. Auto can switch between any light and any dark theme
  (Settings, Appearance).
- Margins: Narrow, Normal or Wide.
- "Reset text" puts size, spacing, margins and fonts back.

### Changed
- Text size is a slider from 14 to 32 px (the small and large A still go
  one step at a time), and line spacing a slider from 1.20 to 2.20.
  Both show their value.
  Your current size and spacing carry over.

## [0.23.2] - 2026-10-03

### Changed
- Comics are chosen, not guessed: a plain Save always saves an article.
  To save a comic, tap the options button next to Save (it takes the
  link you typed), pick "Comic" under "Save as", then Previews, Full or
  Links. Save next keeps a comic's choice for the chapters after it.
- "Save several" is now "Save with options", with "Save as" and
  "Images" right under the links.

### Fixed
- Articles with several big pictures no longer save as comics.

## [0.23.1] - 2026-10-03

### Fixed
- Filling in chapters with Save several now puts them in the list's
  order among the chapters already in the folder, instead of at the
  end.

### Added
- "Sort by chapter" while reordering a folder puts its pages in order by
  the chapter number in their titles or addresses.

## [0.23.0] - 2026-10-03

### Added
- Pause a run of saves into a folder, from its card or beside Save next.
  It waits after the page in progress, and Resume carries on from there.
- Save several skips pages you already have, and says how many. Untick
  it to move them into the folder in the list's order instead.
- Settings › Storage is grouped by folder, biggest first, with pages in
  no folder as one more group. Tap a group to see its pages by size.

### Changed
- A run of saves is one card from start to end, "3 of 10 saved", that
  keeps its height, so the library no longer jumps as each page comes
  and goes. Pages that fail show on their own cards once the run ends.
- The reader's top bar and foot are a step darker than the page in Paper
  and Sepia, and a step lighter in Night.

## [0.22.0] - 2026-10-03

### Added
- Comics and manga: a chapter that is a column of pictures saves as an
  image chapter, its panels in order and full size whatever the image
  setting, without the site's logo, ads or thumbnails.
- Image chapters read edge to edge with no gaps. A tap shows or hides
  the bar, a double tap opens the panel to zoom.
- Save next 5, 10 or All asks first when the last chapters were large:
  "about 7.3 MB each, so 10 more is about 73 MB".
- Image chapters keep their layout in a book.

### Changed
- Pictures are fetched with the page's site as Referer, as a browser
  does, so sites that refuse pictures linked from elsewhere let them
  through.

## [0.21.0] - 2026-10-03

### Added
- Paste a web novel's contents page and Carry-on lists its chapters in
  Save several, oldest first, with a folder named after the novel, for
  you to check before saving. In Save several, one link offers "Find
  chapters on this page" for contents pages that also carry a long
  description.
- Books get a cover: the first picture, or a title card with the title
  and the site. A folder's book opens on its cover.
- A list over 50 pages asks before saving, and a long run waits as one
  card, "48 pages waiting to go into Skyward", with Stop.

### Changed
- Pages in a long run save half a second apart, so the site isn't
  hammered.

## [0.20.0] - 2026-10-02

### Added
- Send a page as an EPUB book from the reader's ⋯ (or a long press in
  the library), for an e-reader app or a Kindle through Send to Kindle.
  Its pictures, contents, language and right-to-left direction come
  along, with the Wikipedia licence line and the link to the original.
  A folder's EPUB tile makes one book of all its pages, in order.
- Print or save as PDF from the same menu, through the phone's own
  print screen (Save as PDF is one of its printers).
- Save previous: a folder's first page offers to save the pages before
  it, and they go in front.
- "All" next to 1, 5 and 10 saves every next (or previous) page there
  is, with Stop to end it early.
- Settings, Appearance can turn off Continue reading.

### Changed
- A folder's tools are at the top, as tiles: Add pages, Select,
  Reorder, Rename, EPUB and Remove.
- Search is always at the top of the library, and All, Unread and
  Finished sit below the folders, just above the pages.

### Fixed
- A card's Retry no longer draws over the save bar when scrolling.

## [0.19.0] - 2026-10-02

### Added
- Pick several pages and change them together. "Select" (the tick
  icon in the library, or in a folder) turns taps into picks; a bar along
  the bottom then adds or removes tags, moves them into a folder, marks
  them read or unread, or deletes them. A long press on a folder picks
  all its pages.
- Press and hold a page in the library or a folder for its menu without
  opening it: open, share, send, the original, tags, folder, mark as
  read, select, full images and delete. Right-click does the same on a
  computer.
- Contents in the reader: the list icon jumps to any heading of a long
  page, with the part you're in marked.
- Tap the text to hide the reader's bar, and tap again to bring it back.
  While the bar is up, the bottom shows the part you're reading and the
  minutes left.

### Changed
- The library is in sections: Continue reading (the page you read last),
  Folders as a row of tiles, then your pages. A sort menu orders them by
  newest saved, last read, longest or site. Tags sit behind their own
  chip so Unread and Finished stay in reach. Search opens from its icon,
  and Settings has a gear.
- Cards only mention offline when something needs a look ("2 previews
  missing", "Images online"); "Offline ready" is gone from every card.
- Settings is a short menu: Appearance (theme and reading type
  together), Saving, Storage and backup, Updates and About, each on its
  own screen. On a computer the menu stays on the left.
- The reader's ⋯ is in groups: Share, Send and Original at the top, then
  this page's tags and folder, the series, and the rest. Original moved
  there from the bar.

## [0.18.0] - 2026-10-02

### Added
- Back up the whole library to one file: Settings, Backup, "Back up the
  library" makes a file with every page, its pictures, tags, folders and
  where you were, and hands it to the share sheet so you can keep it in
  your files, a cloud drive or an email. "Restore or open a file" brings
  it back on a new phone or after reinstalling. When a page is in both,
  the copy saved last is kept.
- Share a page from ⋯: "Share link" sends its address, and "Send as a
  file" sends the page itself as one HTML file, with its pictures inside,
  that opens in any browser. Opened in Carry-on, it comes back into the
  library with its tags and folder.

## [0.17.0] - 2026-10-02

### Added
- Big pictures are made smaller on the phone. A preview wider than the
  screen needs is redrawn at 480 px, so a news site's 3 MB photo takes
  about 40 KB. Logos and diagrams with see-through parts stay sharp
  PNGs.
- Wikipedia pictures carry their own credit under the caption, like
  "Jane Doe, CC BY-SA 4.0", and in the full-screen view.
- Save full images for one page: ⋯ swaps its previews for the full
  pictures, for a map, a diagram or a comic. Save several has the same
  choice for everything it saves, without changing Settings.
- Each folder shows its size, on its card and on its screen.
- Save next works on pages saved before 0.10.0: the first time, it
  looks at the original page for the next link.

### Fixed
- A caption with a link in it was spread out in pieces across the line.
- Pages saved with full images no longer download each picture again
  when you read them online.

## [0.16.0] - 2026-10-02

### Added
- Search your library. Titles, sites, tags and folders match as you
  type, and a moment later the words of every saved page too, with the
  sentence they're in shown on the card. Every word you type has to be
  there. Case, accents, Hebrew niqqud and Arabic harakat don't matter,
  so "שלום" finds "שָׁלוֹם". The filter chips still apply.

## [0.15.0] - 2026-10-02

### Added
- Reorder a folder: Reorder on its screen puts up and down buttons on
  each page; Done puts them away. Next and Previous follow the new order.
- Remove a folder, keeping its pages in the library, or delete it with
  all its pages (asked once more first).
- Add pages from a folder's screen: Save several opens with that folder
  picked, and you're back on the folder when it's done.
- A Save several button beside Save, so you don't need to paste a list
  first.
- Tags in Save several, given to every page it saves.

### Fixed
- A stray "null" under a page's controls in ⋯, and at the end of a
  folder with no next link.

## [0.14.0] - 2026-10-02

### Added
- Tap an image in a saved page to see it full screen. Pinch or double-tap
  to zoom, drag to look around, and swipe down, tap ×, or go back to
  close it. It shows the full image when you're online and the saved
  preview when you're not, with its caption underneath.

### Changed
- Behind the scenes, the code now uses the same names for things as the
  app and its notes do. Nothing you'd notice.

## [0.13.0] - 2026-10-02

### Added
- A thin line along the bottom of the reader shows how far through the
  page you are. It fills from the right on Hebrew and Arabic pages.

### Changed
- The reader's top bar slides away while you read on down, and comes
  back when you scroll up a little, reach the top or the end, or open Aa
  or ⋯.

## [0.12.0] - 2026-10-02

### Added
- Pages that build themselves with JavaScript can be saved on Android.
  When a page comes back as an empty shell, or a browser check, Carry-on
  lets it draw itself out of sight, then saves the text it drew. The
  card says "Letting the page draw itself" meanwhile. The saved copy is
  still plain text and images, with no scripts. iOS still says it can't
  save these yet.

## [0.11.0] - 2026-10-02

### Added
- Settings has an Updates section: the version you have, whether a newer
  one is out (checked at each launch, or with Check for updates), and the
  update itself, with its download progress and what's in it.
- What's new: every version's changes, from Settings. After an update,
  the library says "Updated to 0.11.0" with a What's new button, once.

### Changed
- The library's update bar now only tells you a new version is out; View
  opens Settings at Updates, where the download and install happen. It
  can be dismissed with ×.

## [0.10.0] - 2026-10-02

### Added
- Follow a site's "next chapter" link. Pages now remember their next
  link when saved (rel="next", or a link worded Next, Next chapter, הפרק
  הבא and the like, on the same site). At the end of such a page, "Next
  on …" saves the next page and opens it.
- "Save next 1 · 5 · 10" in ⋯ and on a folder's screen follows the chain,
  saving each page into the folder in order, and says when it reached
  the last one. A page not yet in a folder starts one named after the
  series ("The Long Road - Chapter 1" makes "The Long Road").
- Rename a folder, from the bottom of its screen.

### Changed
- A saving card now shows it's working: a turning spinner, a bar that
  sweeps while the page downloads and then fills as images are saved, and
  the seconds it has taken once past five ("Getting the page · 12 s").

## [0.9.0] - 2026-10-02

### Added
- Save several pages at once: paste (or share) more than one link and
  "Save several" opens with them one a line, to check or edit, and a
  folder to save them into (none, one you have, or a new one).
- They save one after another; the rest show "Waiting" until their turn.
  Pages in a folder keep the order of the links, and a link you'd
  already saved joins the folder instead of saving twice. One message
  sums up how it went; a link that failed keeps its card with Try again,
  which saves it into the same folder.

## [0.8.0] - 2026-10-02

### Added
- Folders, for pages read in order like a web novel's chapters. In ⋯,
  put a page in a new folder or one you already have; a page is in one
  folder at most, in the order you added it.
- The library shows a folder as one card, with how many pages are read
  and which is next. Its screen lists the pages in order with a Start or
  Continue button.
- Next and previous inside a folder: a "Next in …" link at the end of
  the page, and both directions in ⋯. The page changes in place, so back
  still returns to the folder.
- Unread, Finished and tag filters list a folder's pages one by one,
  each card naming its folder.

## [0.7.0] - 2026-10-02

### Added
- Tags: ⋯ in the reader opens "This page", where you add tags (type one
  and press Enter, or tap one you've used before) and remove them. A page
  can have any number. They show on its library card.
- Filter chips above the library: All, Unread, Finished and one for each
  tag. The choice is remembered.

### Changed
- Delete moved from the reader's top bar into the ⋯ sheet, so it's
  harder to hit by accident.

## [0.6.0] - 2026-10-02

### Added
- Retry on a library card whose previews are missing: it downloads them
  again into the page, and the card turns "Offline ready" once they're
  all there. Shown only when you're online.

## [0.5.0] - 2026-10-02

### Added
- Reading progress: a page reopens where you left it, and its library card
  says how much is left ("6 min left") with a thin line, or "Finished"
  once you've read to the end. A finished page opens at the top again.

## [0.4.0] - 2026-10-02

### Added
- Aa in the reader: a sheet rises from the bottom with text size (five
  steps), line spacing (tight, normal, loose), font (serif or sans) and
  theme. Changes show on the page as you make them; tap the page or go
  back to close it.
- Settings has a Reading section with the same text size, spacing and
  font, and a sample line to judge them by.

### Fixed
- Hebrew pages that don't label their own direction (ynet) are now saved
  right to left, judged by their letters. Pages already saved without it
  open right to left too.

## [0.3.1] - 2026-10-02

### Fixed
- Saving a page from some news sites (ynet among them) stayed on "Saving"
  forever. Requests now look like the phone's browser, a site that doesn't
  answer gives up after 30 seconds, and an image after 20.
- A save that fails now stays in the library as a card with the reason,
  "Try again" and "Remove", instead of a message that was gone in three
  seconds.
- Hebrew and other right-to-left pages are saved and read right to left,
  in the reader and on their library card.
- A page's own headline no longer appears twice at the top of the saved
  page.

## [0.3.0] - 2026-10-02

### Added
- Share to Carry-on (Android): share a page from Chrome or any app and it
  is saved straight away. Sharing a page you already saved opens it.
- Settings, from the button at the top of the library: theme, how images
  are saved (previews, full images, links only), storage used by each
  page, the version and "Check for updates".
- Motion: the reader and Settings slide in over the library on a spring,
  new cards and the update bar settle into place, save progress fills
  smoothly, and changing theme cross-fades. With Reduce Motion on, all of
  it becomes a short fade.

### Changed
- The theme now follows the phone's light or dark setting until you pick
  one in Settings ("System", Paper by day and Night by night).

## [0.2.0] - 2026-10-02

### Added
- Saving: paste a link (or a message with a link in it) and the page is
  saved for offline reading. Wikipedia articles come through Wikipedia's
  own API with the CC BY-SA licence line; other pages are reduced to the
  article.
- Image previews are saved with each page and the full image loads in
  their place when you're online. A preview that couldn't be saved shows
  the image's description and "Image loads when you're online".
- Videos (YouTube, Vimeo, Wikipedia) become a card with a saved thumbnail
  that opens the video when you're back online.
- The reader: the saved page in your theme, an Offline pill, Original to
  open the page in your browser, and Delete.
- Library cards with save progress, reading time, size and whether the
  page is fully offline.
- The Android app updates itself: when a newer version is released, a bar
  above the link box offers to download it and opens Android's installer.
  On iPhone the bar opens the release page for AltStore or SideStore.

### Changed
- An Android build signed with a keystore that has no "carryon" key now
  stops with a message saying so, instead of failing inside the signer.

## [0.1.0] - 2026-10-02

### Added
- The app shell: an empty library, the Paper, Sepia and Night themes, and
  the bundled reading fonts.
- Android and iOS builds from the same files, started from LifeLog's
  workflows.
