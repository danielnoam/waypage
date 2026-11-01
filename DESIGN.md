# Waypage design language

A quiet reading app: the page is the product and the chrome gets out of
its way. Apple's Human Interface Guidelines are the rulebook (minimal
chrome, large targets, soft depth, generous space); motion is spring-based
and never blocks input. Every rule here is **Now** (in the code) or
**Target** (agreed, not built yet). The design canvas the values came
from: https://claude.ai/artifact/5zi1VCs3WcLSTLJCw7iasC, with its
artboards copied into `design/`.

**The icon (1.0.0):** "Open road", an open book in Paper and `--line`
whose gutter is a road (a darker blue, Paper dashes) running to a yellow
sun, on an `--accent` blue tile. `icon.svg` is the source; icons/ and
assets/ are rendered from it. On Android the glyph sits inside the
adaptive icon's middle 66%.

## 1. Color (Now, `src/styles.css`)

Every color is a token on `:root`, redefined per theme on
`[data-theme]`. No hex values outside the token block.

| Token | Paper (default) | Sepia | Night | Use |
| --- | --- | --- | --- | --- |
| `--bg` | #F7F4EE | #F1E7D3 | #0F1216 | Page ground |
| `--surface` | #FFFFFF | #F8F0DF | #171B21 | Cards, bars, inputs |
| `--ink` | #1C1B19 | #2B2118 | #E6E2D9 | Text |
| `--muted` | #5E5A53 | #6B5A45 | #9AA1AB | Meta text, captions |
| `--accent` | #2F5D8A | #8A4B22 | #8DB4E2 | Links, primary button, progress |
| `--accent-ink` | #FFFFFF | #FFFFFF | #0F1216 | Text on an accent fill |
| `--line` | #E4DED3 | #E0D2B8 | #252B33 | Borders, dividers |
| `--preview` | #D9E2EA | #E3D5BC | #232A33 | Empty image preview |
| `--bar` | #EDE8DF | #E7DAC0 | #181C22 | The reader's top bar, its foot and the status-bar strip: a step off the page |
| `--ok` | #1F6F5C | #3F6B2E | #7CC4A8 | "Offline ready" |
| `--warn` | #8A4B22 | #8A4B22 | #E0A46E | "Previews missing", retry |
| `--video` | #3A4048 | #4A3F33 | #262C34 | Video card ground behind the thumbnail |
| `--on-video` | #FFFFFF | #FFFFFF | #FFFFFF | Play glyph |
| `--scrim` | black 55% | black 55% | black 55% | Play button disc |
| `--viewer` | #0B0D10 | #0B0D10 | #0B0D10 | Behind a full-screen image (with `--on-video` for its controls) |
| `--shadow` | black 8% | brown 10% | black 45% | The one soft shadow: a screen pushed over the library |
| `--press` | black 6% | black 6% | white 8% | Laid over a control's own fill while it's pressed |

Night is for a dim cabin: no pure white text, no pure black ground.

Six more themes (0.24.0), the same tokens with their own values in
`src/styles.css`: light Slate (cool grey), Solarized and High contrast
(black on white, borders strong enough to see in sun); dark Black (true
black ground for OLED), Dusk (warm brown-grey, amber accent) and
Solarized Dark. "Auto" follows the phone's light or dark setting with a
light and a dark theme picked in Settings (Paper and Night unless
changed). Pickers show each theme as a swatch: its ground with its
accent as a dot.

Contrast: text tokens (`--ink`, `--muted`, `--accent`, `--ok`, `--warn`)
meet WCAG AA (4.5:1) on `--bg` and `--surface` in every theme. Check with a
contrast script before changing any value.

## 2. Type (Now)

Two families for the interface, both bundled in `src/fonts` (OFL),
Latin subset. Arabic and CJK fall back to the system font by
`unicode-range`, which is intended; Hebrew has bundled faces for reading
(below).

| Role | Family | Size / line | Weight |
| --- | --- | --- | --- |
| Article title | Source Serif 4 | 32 / 38 | 700 |
| Article heading | Source Serif 4 | 22 / 28 | 600 |
| Body | Source Serif 4 | 19 / 30 | 400 |
| Screen title | Source Serif 4 | 28 / 34 | 700 |
| Card title | Source Serif 4 | 18 / 23 | 600 |
| Label, button | Instrument Sans | 15 / 20 | 500–600 |
| Meta, caption | Instrument Sans | 13 / 18 | 400 |
| Overline | Instrument Sans | 13 / 18 | 600, caps, 0.08em |

Body text runs at about 65 characters a line (`max-width: 38rem`).
The reader's text is the reader's choice (0.24.0):

- Size: a slider from 14 to 32 px, with the small and large A buttons
  for one step.
- Line spacing: a slider from 1.20 to 2.20 times the size.
- Margins: Narrow (12 px sides, 44rem), Normal (20 px, 38rem) or Wide
  (40 px, 32rem).
- Font: Source Serif 4, Literata, Lora, Merriweather, EB Garamond,
  Instrument Sans, Inter, Atkinson Hyperlegible, OpenDyslexic or System,
  each name set in its own face in the picker.
- Hebrew: Frank Ruhl Libre, David Libre, Assistant or Heebo, after the
  Latin font in the stack; Auto takes Frank Ruhl for a serif and Heebo
  for a sans.

Sliders are native range inputs, 44 px tall, a 4 px `--line` track and a
`--surface` thumb ringed in `--accent`. Long pickers in the Aa sheet
scroll sideways with the picked item centred, so the sheet stays short
and the page shows above it.

## 3. Space, shape, depth (Now)

- Spacing on an 8-point grid: 4, 8, 12, 16, 24, 32, 40, 56, 72
  (`--s-1` … `--s-9`). Phone side gutter 16 px; reader gutter 20 px.
- Radius: 8 (swatches, small), 12 (figures, inputs, buttons), 16 (cards).
  Chips are fully round.
- Depth comes from `--line` borders and grounds, not shadows. One soft
  shadow is allowed on sheets that float over content (Target).

## 4. Motion (Now, 1.11.0, `src/motion.js`)

- Springs, not durations, sampled into CSS `linear()`. Two tiers:
  - Touch (phone and tablet): stiffness 400, damping 32 for sheets,
    screens and cards; stiffness 600, damping 40 for small controls.
  - Desktop (`(min-width: 1024px) and (pointer: fine)`): critically
    damped, stiffness 700 and 1000, so nothing overshoots, and no press
    dip on buttons.
  - What slides in from an edge or sits against one (screens, sheets,
    the sidebar, the reader's bars, the skim) uses the same spring
    stopped at 1 (`sheetEdge`, `controlEdge`, `--spring-control-edge`),
    since 1.45.4: an overshoot of a pixel or two showed what's behind
    as a flickering seam at the edge.
- Nothing fades. Things grow, shrink, slide or leave past an edge. The
  only fade is the reduced-motion answer: a 120 ms opacity change, or no
  animation at all for something going away.
- Open from what was tapped, close back to it. A clip or collection
  opened from its card, tile or Continue panel settles in from 92% size,
  centred on that card, fading up over the first third; Back shrinks it
  toward the card as it fades over the library (1.12.1). The card never
  morphs into the page: a cover and an article share nothing to morph
  between, and the 1.11.x grow always looked stretched or doubled
  halfway. Only transform and opacity move. The one fade with motion on.
- Screens with no card behind them (Settings, a pane) come in from the
  right; on touch the screen under them drifts 25% left. Downloads and
  dialogs grow from their button. On a big screen (700 px and up)
  Settings is a window that grows from the gear (1.49.0): there,
  nothing crosses the window to land on the far side; a screen comes
  from its button or from the side it ends up on. Menus and popovers grow from their
  button, ⋯ or the point pressed.
- Collections › and Clips ›: the cards and tiles that stay move to their
  new places (FLIP); the sections that go leave past the top or bottom
  edge, new ones come in from there. Adding or removing a few clips
  slides the list, and the card grows in or shrinks away.
- Touch follows the finger. Sheets drag down to close (past a third or a
  flick), the sidebar drags left with the library drifting beside it,
  and in Pages the page follows the finger and springs to the next or
  back.
- Toasts and bars come in from their nearest edge and leave the same
  way. The brightness slider slides past the left edge. Checkmarks grow.
- The picture viewer grows from the picture and shrinks back into it.
- Settings, Appearance, Animations off (1.12.0): nothing moves or
  eases, not even the reduced-motion fades; spinners still turn. Since
  1.48.3 that includes what a press does: the switch knob's stretch,
  the ? turning and the drop-down's face pop are off too (they ran with
  no easing and looked like a two-step jump).
- A drop-down menu leaves by only the last quarter of its arrival, run
  backwards and fading, gone before it reaches its button (1.48.3,
  `popOut`); shrinking the whole way back read as the menu crawling into
  the button. The fade is the exception to "nothing fades": a partial
  shrink ending in a cut looked like a glitch.
- Only `transform` and `opacity` move on screens; small menus use a
  clip-path. In scroll mode the next chapter comes up from the bottom,
  in Pages it turns sideways. `inert` on the
  library waits until the spring has all but landed (0.30.8).

## 5. Components

- **Library (Now, 0.27.7):** a bar that stays while the list scrolls
  under it: the title, then Search (a magnifier, which opens the field
  under the bar and focuses it; `--line` behind it while open, 0.27.10),
  Sync (a cloud, only with sync on, 1.13.0), Downloads (an arrow into
  a tray, 0.27.9) and Settings (a gear), 44 px
  icons; a hairline under the bar once the list is under it. Above
  the bar `--s-5` scrolls away (on the phone, the safe area instead).
  Under it, scrolling away: the count, search (only once opened, and
  while something is typed in it), then Show and Order on one row (Select
  left in 0.28.1: a long press starts it): Show on the start side (a lines
  icon, "All pages", "Unread", "Finished", then a "Tags" overline and the
  #tags; anything but All shows in `--accent`, semibold) and Order on the
  end side ("Newest saved", "Last read", "Longest", "Site", an arrows
  icon). Both act on everything below them, collections too: a collection
  is ordered by its newest page, the one read last, its total length or
  its site. Continue reading shows only under All. Unread and Finished
  keep collections whole (one with an unread page, or all read); a tag
  lists every page it matches, collection pages too; a search lists pages
  only, under "Found · 2". Settings, Appearance, Library layout picks one
  of three:
  - **Shelf** (the default): "Continue reading" (one card; its
    collection's cover, 80 × 120, when it has one), "Collections" (a row
    of standing covers, 112 px wide at 2:3, 136 px at 900 px and wider),
    then "Pages in no collection · N" as rows: no box, a hairline under
    each, a 64 × 96 picture standing like a cover (1.5.1).
  - **One list:** Continue reading, then collections and pages in one
    list of rows, in the chosen order, under overlines: Today, Yesterday,
    This week, This month, Earlier (or Not started, under Last read) for
    Newest saved and Last read; the site for Site; none for Longest. A
    collection's row has its cover standing at 64 × 96 and "Collection ·
    3 of 12 read · 4 MB".
  - **Grid:** Continue reading as a card with its picture across the top
    (2:1, 3:1 from 700 px), collections as covers three across, pages as
    cards two across (three at 900 px), the picture on top at 4:5 (1.5.1)
    and a label-size title.
  At 900 px and wider, Shelf and One list put their rows in two columns.
- **Library card (Now):** thumbnail, site line (site, collection, #tags),
  serif title, then the reading line ("9 min", "6 min left" with a 3 px
  accent line, or "Finished") and the size. A status only when it needs
  a look: "2 previews missing · Retry" in warn, or "Images online".
  With no picture, the thumbnail is `--preview` with the site's icon
  centred at 32 px (`--s-6`), or the site's first letter in the serif,
  heading size, `--muted` (0.27.6). A clip made from a file of your own
  with no picture shows its kind instead ("EPUB", "PDF") in the sans at
  meta size, 600, spaced a little (0.31.0), and its site line names the
  kind.
- **Where your library is (0.33.0):** a radio group in Storage and
  backup, under the sizes: "Inside Waypage" (marked Recommended in its
  note), "Documents/Waypage", "A folder you pick" (its name once
  picked). Each note says what it costs. While moving, the footnote is
  the progress ("Moving, 12 of 80 files…") and the radios are disabled.
- **Opening a file (0.32.0, every kind since 0.32.2):** a file asks first, as a
  sheet of two rows, each a bold accent label over a line of grey saying
  what it costs: "Keep a copy" first, since it's the one that syncs and
  outlives the file, then "Read from where it is". Putting the sheet away
  opens nothing. A file that came without lasting access (a synthetic
  drop, an app that won't share one) still shows the second row, disabled
  and muted, with what to do instead.
- **Reader bars:** top and bottom on `--bar`, the same as the strip under
  the status bar (a darker `--reader-bar` in 0.30.5 was taken back in
  0.30.8), checked for AA with ink, muted and accent. The
  bottom bar's time or pages left sits `--gutter` + `--s-2` in from the
  edge, centred in a bar at least `--s-7` tall.
- **Collection tile (Now):** its story page's cover when it's linked to
  one (0.27.6), else its first picture, else its icon (the folder, or the
  book for a story) at 44 px, centred on `--preview`, `--muted` (the book
  `--accent`), with no name drawn: the name is under it already (0.30.3).
  The collection's own screen and the sidebar show the same. Under it the name, "3 of 12 read" and a thin
  accent line. A series with chapters not yet saved shows "2 new" as a
  pill at the picture's top end: `--accent` fill, `--accent-ink` text,
  meta size, semibold (0.25.0). A favourite collection has a ★ before
  "3 of 12 read", as a favourite clip has before its site (0.30.9).
- **Picking (Now):** the library and collection screens get a circle at
  each card's top end (24 px, a 2 px muted ring), filled with the accent
  and a tick once picked, and the card's border turns accent. A bar over
  the top: Cancel, "3 pages picked", Select all (or Pick none), accent
  text buttons. A bar along the bottom: Tags, Collection, Mark read (or
  unread), Delete (warn), icon over label, 56 px, dimmed until something
  is picked.
- **Library sheet (Now):** a long press (or right-click) on a page: the
  sheet from the bottom over a `--scrim` dim, with the page's title and
  facts, then the same groups as ⋯ plus Open first and Select under More.
  For picked pages it holds Tags (chips on all filled, on some dashed
  with "2/5", a New tag field, Done) or Collection (each collection as a chip, a
  New collection field, "Take out of their collections").
- **Reader top bar (Now):** back, an "Offline" pill when there is no
  connection, then Contents (a list icon, only when the page has two or
  more headings), Aa and ⋯. A tap on the text hides and shows it;
  scrolling down hides it and up brings it back.
- **Reader foot (Now):** with the bar up, a meta-size line over the
  progress line: the heading of the part being read on the start side,
  "12 min left" (or "End") on the end side. It slides down with the bar.
- **Contents sheet (Now):** the page's h2s, h3s indented, as rows in a
  group; the part being read in the accent with a 3 px accent rule on its
  start edge. A tap jumps there, just under the bar.
- **Reader settings sheet (the gear, 0.34.0; "Aa sheet" below means
  this):** rises from the bottom on the sheet spring, the one soft
  shadow, no scrim. A segmented control on top picks one part: Layout
  (show as Scroll | Pages, margins, theme swatches; 0.34.1), Text (font
  and Hebrew font as drop-downs with each name in its face, size,
  spacing, Reset text) or Read aloud (voice, a speed slider 0.5×–3× with its value
  under the label, then Read footnotes and Skip headers and footers as
  switches with a grey line each). The parts share one grid cell, so the
  sheet keeps one height. Tapping the page or back closes it.
- **Page sheet (Now):** ⋯ opens it in the Aa sheet's place, in groups
  in the order they're used. Share, Export and Original as three tiles (72 px,
  accent icon over the label). "This page": tags as round chips (accent
  fill, × to remove), an "Add a tag" field, then "+ tag" chips for tags
  used elsewhere; the collection the same way. "Series": Previous and Next
  side by side, and Save previous and Save next. "More": a group of rows,
  Mark as read or unread, Save full images (counting "Saving full images,
  3 of 12"), then "Delete this page" in the warn colour. The sheet scrolls
  past 76% of the screen.
- **Export (Now, 0.25.2):** the page sheet's Export tile turns the sheet
  into a Back button and the page's title, an "Export as" choice group
  (PDF, HTML, EPUB, Markdown, Page source, each with a one-line note, the
  last pick remembered), and two 48 px buttons side by side: "Save to
  device" (primary) and "Send" (quiet). PDF has one button, "Print or
  save as PDF". The web copy has one, "Download".
- **Settings (Now):** a menu of three groups: Appearance and Saving (the
  current choice on the right), Storage and backup (the total), Updates
  and About (the version). Each row ends with a chevron and pushes its
  own screen. A new version adds an accent-bordered "Waypage 0.20.0 is
  out" card with View above the groups. At 900 px and wider the menu
  stays on the left (360 px) and the section fills the rest.
- **Settings rows and help (1.48.0):** a search field (the library's
  search box, 44 px) sits under the bar; typing swaps the menu for
  matching rows (name, then "Section › Heading" in `--muted`), and a
  result opens its screen and gives the row a 2 px accent outline for
  two seconds. On a screen, every row is a name and at most one line of
  `--fs-meta` in `--muted`: a state or scope, never a paragraph. A
  section's heading (the overline) carries a 28 px round ? at its right
  (`--surface`, `--line` border, `--muted`; accent when open); tapping it
  unfolds the section's explanation under the heading on the control
  spring, and the ? dips on press and turns once when open. Whatever
  reports a state (a move in progress, what isn't ready) stays a visible
  footnote. A pick between options is a row with its name, the picked
  option's few words under it, and the drop-down (accent, no border) at
  its end; a chosen option pops into the face from 80%. A pressed
  switch's knob stretches 6 px toward where it's going. The themes are a
  grid of swatches, five across and two rows, labels under them.
- **Storage by collection (Now):** under "By collection", one row a collection,
  biggest first (name, page count, size, a chevron), then "Not in a
  collection" in `--muted`. A tap opens the group in place: its pages
  indented, biggest first; the chevron turns down on the control spring.
  Reduced motion: it turns without easing.
- **Launch (1.2.0):** until the library is read the list is blank and
  the count line empty; the empty state appears only once it's known
  there's nothing.
- **Storage and backup (Now):** the total in the title size, the page
  count, "Pages by size" (tap one to read it), then Backup.
- **Watched folders (Now, 1.1.0, Android; a list since 1.4.0; their own
  page since 1.4.1):** Settings, Content, between Storage and Sync, its
  value "2 folders" or "No watched folders". None: one accent row "Watch
  a folder" and a footnote saying what it does. Otherwise a row per
  folder: its name, "12 files" (or "Can't open it") in `--muted`, then
  two 44 px icon buttons in `--muted`, a circular arrow that looks in
  that folder now (it spins while looking; reduced motion: it dims) and
  an × that stops watching it (its files stay as files); then the
  accent row "Watch another folder"; the footnote says folders become
  collections and deleted files leave.
- **Brightness slider (Now, 1.10.0, app only):** a card on the left of
  the text, vertically centered, `--surface` with a `--line` border,
  `--r-lg` and the card shadow: a sun icon in `--muted` above a 44 px wide
  track (`--bar`, `--r-md`, at most 280 px or 40% of the height) filled
  from the bottom in `--accent`. It shows with the reader's bars and
  while the left edge is swiped (never while a sheet is open), 16 px in
  from the text's edge, sliding in 12 px on the control spring with no
  fade (reduced motion: it just appears), and leaves 700 ms after the
  swipe ends. With only the bars it sits at 55% opacity; swiping,
  dragging or focus bring it to full (1.10.1). It's a `role="slider"` with arrow keys; dragging
  anywhere on the track sets the level. The switch "Brightness on the
  left edge" sits in the Aa sheet's Layout tab and in Settings, Reading
  type.
- **On mobile data (Now, 1.4.1, Android):** a choice group in Saving
  ("Save" / "Wait for Wi-Fi") and in Sync ("Sync" / "Wait for Wi-Fi"),
  each option with a note on what waits. A save made while waiting is a
  card in Downloads whose status reads "Waiting for Wi-Fi"; Sync's
  status row reads the same. What comes in is one card in Downloads (1.1.3), site line
  "Watched folder", the folder's name as its title, "Notes.epub · page 3
  of 40" as it reads, with Pause and Stop like a run of saves; Done
  says "3 files added". A file opened by hand gets the same card with no
  buttons. A file already there from the folder isn't added again
  ("Already in your library, from Books"). A file read from where it is
  says "This file" and "Remove from Waypage" in its sheet, not "Delete
  this clip", and one removed from the watched folder stays out. A PDF
  read from where it is opens as its printed pages (1.1.3), a small gap
  between them; its sheet has "Show as text" and back "Show as printed
  pages". The empty library on Android
  also offers a quiet "Get back your library from Documents" after a
  reinstall.
- **In a browser (Now, 0.27.12):** the words say "in this browser"
  where the app says "on this phone". Storage adds "This browser": Space
  used ("14 KB of 872 MB") and an accent row "Keep pages from being
  cleared" (or "Kept" once the browser agrees), with a footnote that
  clearing site data deletes the pages. About starts with an accent row
  "Install Waypage" while the browser offers it, or on an iPhone a
  footnote: "tap Share, then Add to Home Screen". The empty library says
  what a browser can do, with a quiet "Open a backup" that goes to
  Storage.
- **Backup (Now):** under Storage on its screen: two
  accent rows, "Back up the library" (counting "Backing up, 12 of 80")
  and "Restore or open a file" (opening the system picker), then a
  footnote saying what a backup holds and that the copy saved last wins.
  The result is a toast, such as "Restored 12 pages. 3 already here were
  kept."
- **Collection screen (Now, a book page since 0.27.11):** pushed like
  Settings, the bar holding only back and ⋯ (its hairline and the
  collection's name fade in once the title scrolls away). Then the book's
  head: a 2:3 cover (104 px; its story page's picture, else drawn: an
  accent rule, the name in the serif, the site), beside it "site ·
  Collection", the name in the serif at `--fs-screen`, "12 of 42 read ·
  4 h 10 min left" and a 4 px progress bar. Then Continue as the primary
  button, "Save N new chapters" as a quiet button when the check found
  some, and a 44 px line "31 MB · pictures as previews · What's saved"
  (the last words in the accent) that opens the What's saved sheet. Then
  "Chapters · N" over the numbered group, each row ending in a tick
  (`--ok`) once read or an accent ring filled as far as it's read.
- **Next in a collection (Now):** at the end of the page, after the licence,
  a bordered block "Next in Novel" over the title in the accent serif. In
  ⋯, Previous and Next side by side, dimmed when there's none.
- **Save with options (Now, was Save several):** a pushed screen, opened
  by the list icon beside Save with whatever is typed in the field.
  "Links": the links one a line in an editable box, a count under it,
  and "Skip pages already saved" (a switch, on by default) when any are.
  "Save as": Article / Comic, a segmented control with a one-line note.
  "Images": Previews / Full / Links (app only), set to the Settings
  choice, or Full when Comic is picked. "Collection" (0.27.5): a field
  dropdown of None, each collection (last used first) and "New
  collection…", which opens a name field under it, with a note that
  pages keep the links' order. "Tags" (0.27.5): the picked tags as chips
  with ×, then an "Add a tag" field dropdown of the rest and "New tag…",
  which opens a field (straight away when there are no tags yet). Then a full-width "Save 4 pages into Novel"
  ("Nothing new to save" when all are skipped). Saving goes back to the
  library with a toast pointing to Downloads, where two or more go as one
  run card.
- **Downloads (Now, 0.27.9):** a screen pushed from the bar's Downloads
  button, one column of library cards under overlines: "Downloading"
  (run cards and saving cards), "Couldn't be saved" (failed single
  pages) and "Done" with a Clear text button (what finished since the
  app opened, newest first; a page's card opens it, a run's card says
  "12 pages saved · 5 min ago" or "Stopped" and has Open for its
  collection). A run's failed pages sit inside its card under a hairline:
  "2 pages couldn't be saved" in `--warn` with "Try all again", then a
  row per page (link and reason on two cut lines, Try again, × to
  remove). Empty: "Nothing downloading". The button: a 34 px ring
  (`--line` track, `--accent` arc from the top, round cap) fills with all
  the downloads together while anything downloads, easing on the control
  spring; an 8 px `--warn` dot, ringed in `--bg`, stays while a failed
  page waits. Its label says "Downloads, 40% done". Reduced motion: the
  ring and dot change without easing. The library itself shows only
  saved pages.
- **Sync button (1.13.0):** a cloud before Downloads, there only while
  sync is on, wearing the same ring and dot. The ring fills while a run
  can count its clips and is a turning quarter arc while it can't
  (checking GitHub, getting pictures); the dot is the last run's error;
  paused or waiting for Wi-Fi the cloud is `--muted`. Its label is the
  status ("Sync: synced 2 min ago"), and it opens Settings, Sync.
  Reduced motion: the arc breathes instead of turning.
- **Saving card (Now):** a 12 px ring turning (accent arc on the line
  colour) before the status, a bar that sweeps while the page downloads
  and fills as images land, and "Getting the page · 12 s" once it passes
  five seconds. A page that builds itself says "Letting the page draw
  itself" while it's drawn. Reduced motion: both breathe instead.
- **Reader bar and progress (Now):** the bar and the foot slide out of
  the way (control spring). A 5 px accent line along the bottom fills
  with the position, from the page's start side; it's decoration
  (aria-hidden), the page itself being the content. Reduced motion: the
  bar appears and disappears without sliding. A tap on the page brings
  them back and any scroll hides them; they stay at the top, at the
  end and under a sheet (0.26.0).
- **Library search (Now):** always there once something is saved: a
  44 px field on `--surface` under the library's count, magnifier inside
  on the start side, × to clear on the end side once there's text.
  Escape clears. Results are page cards;
  a text match adds its sentence in muted meta type under the title,
  two lines at most. None found: "Nothing matches “…”." (with " in
  Finished" and the like when a filter is on) and Clear search.
- **Collection ⋯ menu (Now, 0.27.11):** a popover under ⋯ (248 px,
  `--surface`, `--line` border, the soft shadow, 48 px rows with an accent
  icon): What's saved (its size), Story page ("N new" in the accent), Add
  pages; a hairline; Rename, Reorder (dimmed with one page), Select,
  Export; a hairline; Remove in the warn colour. Arrow keys, Home and End
  move through it, Escape or a tap outside closes it. A collection linked
  to its story page shows a book icon in the bar and on its tile.
- **Editing a collection (Now, 0.27.11):** Rename, Reorder, Story page
  and Export take the screen over in place; the bar shows the mode's name
  with Done (Rename: Cancel and Save) and Escape steps out. Rename turns
  the title into a 2 px accent field, focused, with "Renames the
  collection on all N of its pages" under it. Reorder folds the head
  away for a hint and Sort by chapter, and each row gets up and down
  arrows (44 px, for keyboards and screen readers) and a drag handle;
  the lifted row takes the soft shadow and the others slide aside on the
  control spring (none with reduced motion).
- **Story page (Now, 0.26.0, was the Chapters panel):** over the
  chapters: the check row with "Save N" when there are new chapters,
  Save previous and Save next, then "Story page" (a 44 px link field,
  Link or Change, Unlink).
- **What's saved (Now, 0.27.11):** a bordered `--surface` box: "What's
  saved" and the size, an 8 px bar of pictures (accent) and text (accent
  mixed 40% into `--line`), then a legend of 8 px keys: pictures kept and
  their size, text and pages, pictures kept as links (an outlined key,
  "need a connection"), missing previews (warn). When pictures are more
  than twice the text, a footnote says how small Links would make it.
  The collection's sheet adds "Save again with pictures as" (Previews,
  Full, Links) and "Save 42 chapters again"; Storage shows the box when
  a collection opens, and each page's row says what it keeps ("12
  previews · 3 links").
- **Remove a collection (Now, 0.27.11):** a sheet: "Remove “…”?", the
  count and size, "Remove the collection, keep its N pages", "Delete the
  collection and its N pages" (warn, confirmed once more), Cancel.
- **Collection Export (Now, 0.26.0):** the page sheet's Export with the
  collection's name as its title: PDF, HTML, EPUB (picked first) and
  Markdown, no page source.
- **Dropdown (Now, 0.26.0):** our own, never the system's: a quiet
  button (icon, the current choice, a caret that turns), then a
  `--surface` menu with a `--line` border and the soft shadow, 44 px
  rows with a tick by the current one and `--bar` under the finger.
  Arrows, Home, End and Escape work; a tap outside closes it. It
  arrives on the control spring; reduced motion fades it, and a menu
  opened low on the screen scrolls into view. As a form field
  (`.field-pick`, 0.27.5) it is full width with the input's `--line`
  border, `--bg` fill and label type, an unpicked placeholder in
  `--muted`, and its menu as wide as the field.
- **Read aloud (Now, 0.27.0):** a speaker icon button in the reader's
  bar, before Aa: accent on `--line` while reading, and its label says
  Stop. While it reads, the bar along the bottom stays up and holds the
  controls in its middle, between the section and the minutes left:
  previous paragraph, play or pause (accent disc), next paragraph, 44 px
  each. Selecting text shows "Read from here" under it (or over it near
  the bottom): an accent pill, 44 px, speaker icon and label. The block
  being read has `--preview` behind it
  with a `--s-1` spread and `--r-sm` corners. In Aa, under the theme:
  "Read aloud", Voice (a field drop-down like the font pickers, 0.34.2:
  the phone's default first, then the page language's voices under a
  head per country, best first, coded names as Voice 1, 2… with tags
  such as female, natural, online), Speed and a footnote.
- **Reading aloud away from the page (Now, 1.4.0; a movable card since
  1.4.1):** leaving the clip keeps it reading. A card 240 px wide (less
  on a narrow phone), `--surface` on a `--line` hairline with `--r-lg`
  corners and the sheet shadow, arrives on the sheet spring (16 px up
  and a 0.98 scale; reduced motion: a fade) over every screen, under
  sheets and the toast: the play or pause disc (accent, 44 px), the
  clip's title in the serif at label size, a tap on which opens the
  clip, and a 44 px × that stops; its state is in its label for a
  screen reader, not on screen. It starts at the bottom right, above
  the library's bottom field when that's on screen; a drag takes it
  anywhere (the cursor is a hand), it snaps to the nearer side on the
  control spring when let go, and the side and height are kept. In the
  clip's own reader the card hides and the foot's player shows instead,
  with the paragraph being read lit and brought into view. At the end of the clip, while it has a next (the
  next chapter, or the page it links to as next), "Read next" takes the
  player's place in the foot and the disc's place on the bar: an accent
  pill, 44 px, with the speaker icon; it opens the next and reads from
  the top. With no next, the reading is over and both go.
- **Pressed (Now, 0.26.0):** no tap flash and no focus ring after a
  tap, only for a keyboard (`:focus-visible`). Buttons, chips and tiles
  scale to 0.97 on the control spring with `--press` over their fill;
  rows and choices only take the tint. Reduced motion keeps the tint
  and drops the scale. Save and the options button beside it are one
  pair: 48 px, the accent fill, split by a hairline.
  Reorder swaps them for "Move pages with the arrows, or sort them by
  their chapter numbers.", a quiet "Sort by chapter" and Done, and
  shows a chevron up and down (44 px, accent; disabled ones in
  `--line`) on each row. Remove asks in place: "Remove the
  collection, keep its N pages", "Delete the collection and its N pages" (warn,
  then a system confirm), Cancel.
- **Find chapters (Now):** in Save several, under the count, a small
  button "Find chapters on this page" while the box holds one link; it
  reads "Finding chapters…" while it looks, then the box holds the
  chapters and the collection field the novel's name.
- **Run card (Now):** a run of saves into a collection is one wide card
  from start to end: the site, the collection's name in the title type, a
  bar for the whole run when its length is known (else the page in
  progress's, sweeping until it knows), one status line ("3 of 10 saved · Saving 4 of 9
  images", "Paused · 3 of 10 saved"), then Pause or Resume (small
  button) and Stop (quiet, warn colour). Its height never changes: the
  status is one line, cut with an ellipsis. Reduced motion: as the
  saving card.
- **Book cover (Now):** a book's first picture, or a 1200 × 1800 title
  card: Paper's background, a 160 × 12 accent rule, the title in Source
  Serif 4 semibold (88 px, smaller to fit), the site in Instrument Sans
  at the foot in the muted colour; mirrored for right to left.
- **Save several button (Now):** a list icon (44 px) after Save in the
  save bar.
- **Image viewer (Now):** a tapped image fills the screen on `--viewer`,
  growing from where it sat (sheet spring), its caption below in
  `--on-video`, × top right on a `--scrim` disc (44 px). Pinch or double
  tap zooms (up to 5×), a swipe down fades the ground as it goes and
  closes past 120 px. Reduced motion: it fades in and out, and zoom
  steps without easing.
- **Save next and previous (Now):** "Save next" with 1, 5, 10 and All
  as chips, in ⋯ and under a collection's list, when the last page has a
  next link; "Save previous" the same above the list, for the first
  page. While a run saves, the chips dim and Pause (Resume when paused) and Stop (warn colour) join
  them. Pages come one at a time, half a second apart. 5, 10 or All ask
  first when the last chapters were 5 MB or more each, naming the total
  ("about 73 MB").
- **Image chapter (Now):** the panels run the reader's full width on a
  phone (the column's width on a wider screen), no gaps, no rounded
  corners, `--preview` behind each while it loads. The headline and meta
  line stay above as on any page. A tap shows or hides the bar; a double
  tap opens the panel in the image viewer to zoom. No animation of its
  own.
- **Switch (Now):** 52 × 32, a `--muted` knob in a `--muted` outline
  when off; on, the track fills with the accent and the knob, in
  `--accent-ink`, slides to the end (mirrored right to left). A focus
  ring like every control's; the whole row is the target. Reduced motion: the knob
  moves without sliding.
- **Updates (Now):** a Settings screen: "This version", a status row
  (spinner while checking or downloading; "Waypage 0.12.0 is out" in the
  accent with Update / 42% / Install, or Get it on iOS), what's in it as
  the release's headed lists, Check for updates, and What's new. The
  library's bar says "Waypage 0.12.0 is out" with View, or "Updated to
  0.11.0" with What's new, and an × to put it away.
- **What's new (Now):** a pushed screen; each version a serif heading
  with its date, "You have this" by the installed one, then its Added /
  Changed / Fixed as small overlines over bulleted sentences.
- **Show and Order (Now, 0.27.7):** see Library. They replaced the
  filter chips, whose tag row grew with every tag. A dropdown menu
  scrolls past 26 rem (or 60 % of the screen) and can carry overline
  headings between its choices.
- **Image figure (Now):** saved preview, caption, "Full size online"
  floated to the end of the caption's first line. A credit, when the
  source gives one, goes on its own line under the caption, in meta size
  and muted. Online, the full image replaces the preview in place; a tap opens
  it full screen. No preview saved: dashed border, image glyph, the page's
  alt text, "Image loads when you're online".
- **Video figure (Now):** local thumbnail, play glyph (dimmed offline), title and
  site, "Plays when you're back online". Online: "Tap to play on
  YouTube", opening the original. Nothing autoplays.
- **Save setting:** radio list: "Previews and links" (default, about 30 KB
  an image), "Full images" (about 150 KB, for maps and diagrams), "Links
  only".
- **Licence footer (Now):** on every page whose licence asks for it, e.g. "Text
  from Wikipedia, CC BY-SA 4.0, by Wikipedia contributors. Read the
  original".

- **Sidebar (Now, 0.28.1):** a menu button (three lines, 44 px) at the
  start of the library's bar opens a 300 px panel (at most 85 % of the
  screen) from the start edge over `--scrim`, sliding on the sheet spring
  (reduced motion: a fade), in its own history entry, so Back and Escape
  close it. "Waypage" in the serif, then Library (its page count, muted)
  with the three collections touched last under it (a 24 × 32 cover,
  new chapters in `--accent`), a hairline, then Feeds (a pill in
  `--accent` with what's new since Feeds was last open) with the three
  feeds that posted last under it (a 24 px mark, what's waiting in
  `--accent`) and "Add a feed" in the accent. Items under a heading are
  indented 44 px and 44 px tall. The current one sits on `--bar`,
  semibold. The bar is the same in both places; only its title changes,
  and Feeds drops Search. In Feeds the bottom field reads "Paste a site
  or feed to follow" with Follow, and the list button goes. On Android,
  Back in Library or Feeds opens it, and Back again leaves the app
  (0.29.0); elsewhere a swipe right from the left 24 px. Holding a
  feed's row opens its settings.
- **Pull to check (Now, 0.28.2):** at the top of Library or Feeds, a
  pull opens a gap over the list (half the finger's travel) with a 24 px
  ring, `--line` with an `--accent` arc; past 64 px the ring fills in
  `--accent`, and letting go holds a 48 px gap with the ring spinning
  while it checks, then closes on the sheet spring. Reduced motion: no
  spin, the gap closes at once. Feeds checks its feeds, the library its
  series collections for new chapters ("+2" on the cover, `--accent`).
- **Pages (Now, 0.29.0):** Aa's first row, Layout: Scroll | Pages.
  Pages lays the text in one column a screen wide, as wide as the
  margins allow, centred; each page keeps the bar's room and the usual
  padding. A tap on the outer third turns (the middle shows or hides the
  bar), a sideways swipe of 48 px turns, arrow keys and Page Up/Down
  turn; the turn is a 220 ms ease-out of its own (0.29.1; the WebView's
  smooth scroll took most of a second), quick turns add up, and with
  reduced motion it jumps. The bar's bottom left reads "Page 3 of 12 ·
  section" (0.29.1). Reset text keeps the layout.
- **Page turn (Now, 0.28.2):** the end link's next page: the reader
  slides 16 % left as it fades (control spring), the next page comes in
  from 16 % right (sheet spring). Reduced motion: a fade.
- **Feeds (Now, 0.28.0), one river:** chips per feed, "All · 12" first
  (following a feed is the bottom field's job since 0.28.2), the picked one filled like any chip; under
  them "Checked 1 h ago", with Check now for a mouse (pull down on a
  touch screen). Holding a feed's chip opens its settings (0.28.2).
  Then a day overline per day (Today, Yesterday, a weekday, a date) with
  "Save all 4" at its end when two or more wait, over a group of posts:
  the feed's 32 px mark (site icon or first letter on `--preview`), the
  feed's name in meta, the title in the serif at card size (three lines
  at most), "8 min · 2 h ago", a muted 44 px browser button (the
  Original arrow), and a 44 px + button, or "Saved" in `--ok`. A tap on
  a post reads the saved copy, or shows the post in the reader without
  saving it (0.28.1), whose ⋯ offers Save and Browser.
- **Add a feed (Now, 0.28.0):** the library's sheet: a 48 px field ("A
  site's address is enough: Waypage finds its feed."), Find its feed,
  then the found feed as a card (mark, name, "About 2 posts a day · last
  one 2 h ago"), New posts as a segmented Show them / Save them with a
  note naming the collection, and Follow. Errors replace the help line in
  `--warn`.
- **A feed's settings (Now, 0.28.0):** the same sheet: New posts, Pictures
  (on the phone), Save into (a field; empty means no collection), Skip
  posts older than (3 days, A week, A month), a muted line with when it
  was checked and how often it posts, Unfollow in `--warn`, "Unfollowing
  keeps the posts you saved."
- **Widgets (Now, 0.29.0, Android):** a rounded card in `--bg` with a
  `--line` border, 16 px padding and radius. Keep reading: "Keep
  reading" small and bold in `--muted`, the title in serif, three lines
  at most, "site · 6 min left", and a 4 px line in `--accent` for how
  far. At one row high (0.29.1) it is the title on one line over a 3 px
  line, 12 px sides. Feeds: "Feeds" and a "3 new" pill in `--accent`, then up to three
  posts, title in serif over the feed's name. Empty: "Follow a site in
  Feeds, and its newest posts show here." Paper by day, Night by night.
- **A page's sheet (Now, 0.30.2):** Tags: the tags on it as chips with ×,
  then a full-width dropdown "Add a tag" (other tags, then "New tag…",
  which opens a field that stays open for the next). Collection: a
  dropdown, None, the collections, "New collection…". Pictures: a
  segmented Previews / Full size / Links with what's kept under it.
- **Library sections (Now, 0.30.2):** "Collections ›" and "Pages · N ›"
  heads are buttons (44 px tall) that show that part alone: every
  collection as a 3-column grid, or the pages in none; "‹ Library" in
  `--accent` goes back.
- **Sync (Now, 0.30.1):** Settings has Sync beside Storage and backup,
  its value On, Off or Stopped. Off: "Sync with GitHub" and a section
  lead, then one group of three numbered steps, each number a 24 px
  `--accent` ring: 1 "Make a free GitHub account" (github.com/signup),
  2 "Make a token for Waypage" (GitHub's form filled in), both rows
  with ↗; 3 "Paste it here" holding the 48 px field and a full-width
  Connect, errors under them in `--warn`. Then "Already syncing on
  another device?" with "Scan its setup code" where the app has the
  scanner, and a footnote. On: a group with the account
  (dan/waypage-data) over "Synced 2 min ago" (or the error in `--warn`),
  Sync now in `--accent`, Stop syncing in `--warn`; then "Add another
  device": the setup code, 200 px, black on `--code-paper` (white in
  every theme, since scanners need it), over "Copy setup link", and a
  `--warn` footnote that the code holds the token. Deleting with sync on
  says "With sync on, it goes from your other devices too."
- **Favourites (Now, 0.29.2):** a fourth tile in a page's sheet, the
  star, filled in `--accent` and `aria-pressed` when on. A favourite's
  card starts its site line with ★ in `--accent`. Show has Favourites
  after Finished; empty: "No favourites yet. Hold a page and tap
  Favourite." The Favourites widget is Keep reading's card with
  "Favourites" over up to four rows (title in serif on one line, "site ·
  6 min left"), each row at least 44 dp; empty: "Hold a page in Waypage
  and tap Favourite, and it shows here." Favourite collections come
  first (0.35.0), "Collection · 2 of 9 read" under the name.
- **A toast with one thing to do (1.3.0):** the toast's text and one
  underlined action in the same bar, 44px tall, in the toast's colours
  ("Read to 64% on your other device. Go there"); it stays eight
  seconds instead of three. Used for the furthest-read offer when a clip
  opens; the open never waits for it.
- **Zoom on printed pages and panels (1.2.2):** a pinch zooms the
  chapter in place, up to 4x, following the fingers; once they lift the
  pages are laid out at that width and a drag pans them as the page's
  own scroll. A double tap goes to 2.5x on that spot, or back to the
  page's width; Ctrl and the wheel do the same on a desktop. A single
  tap still shows or hides the bar.
- **Collection widget (0.35.0, Android):** its own card (1.2.1) with the
  collection's name and "2 of 9 read" as its head, then the clip to read
  next (its title in serif over two lines, "12 min left" under it), and
  along the bottom (1.10.2) a full-width pill button in `--accent`, 40 dp
  tall, "Start" before anything in it was opened, "Continue" while
  reading, "Read again" when all of it is read, that opens that clip.
  No other clips are listed. The picker's
  preview shows the card with two sample chapters. Placing it opens a dialog in the widget's colours,
  "Show which collection?", one 48 dp row per collection (name in serif,
  how much is read under it). A widget whose collection is gone says
  "This collection is gone. Tap to pick another." and a tap opens the
  dialog again.
- **New posts notification (Now, 0.28.4, Android):** the Feeds icon,
  "3 new posts from The Slow Times" and "Tap to see them in Feeds.", or
  "5 new posts" and "From The Slow Times, Kitchen Table and 1 more."
  Channel "New posts", default importance, one notification that counts
  up until the app is opened, then goes.

- **Big screens (Now, 1.5.0), `design/XL-*.dc.html`:** three widths.
  Under 700 px is the phone layout, unchanged. From 700 px (a tablet)
  the save field sits in the bar at the top (48 px, a link icon inside,
  Save and the options button as one pair, Downloads beside), the
  library's name, size, Show and Order share one row under it, clips go
  two columns (three from 1280 px, Grid three then four), sheets over
  the library open as dialogs in the middle (480 px, the shortcuts list
  wider), the reader's Aa, ⋯ and Contents open as 376 px panels under
  their buttons, Save with options is a 640 px dialog and Downloads a
  416 px panel under its button, picking several puts Cancel, the count
  and the actions in one bar along the top, and Settings is two panes:
  its own 300 px sidebar ("‹ Library", the title, the sections) and the
  section beside it, opened on Appearance. From 1024 px the sidebar is
  pinned (`--side-w`, 272 px: Waypage and Search, Library and recent
  collections, Files, Feeds and recent feeds, Add a feed, Tags as chips,
  Settings at its foot), a collection opens beside it in two columns
  (cover and facts, then the chapter list), the reading-aloud card docks
  at the sidebar's foot, the reader puts its contents in a rail
  (`--rail-w`, 272 px: Back, the headings with the one being read on
  `--bar`, the licence and Read the original at its foot; Reader
  settings has a switch for it), Pages go two side by side (Reader
  settings: One, Two, Auto from 1000 px), and so do a PDF's printed
  pages; a book of pictures (a scan, a PDF read from its file, a comic)
  has its pages in the rail instead, 112 px wide with the number under
  each, the one at the top of the screen ringed in `--accent` (1.5.1).
  Storage and Sync take two columns. From 1280 px a post opened
  in Feeds reads in a pane beside the 500 px river. Everywhere from
  700 px: right-click on a clip opens a menu at the pointer with each
  item's key, a link dropped anywhere saves ("Drop to save"), Ctrl V with
  no field focused saves the copied link, the image viewer has previous,
  next and zoom buttons, and the keys are listed behind "?" (the reader's
  foot shows "? Shortcuts" with a mouse). Row heights follow the pointer,
  not the width: 44 px or more for a finger, 40 px for a mouse.

## 6. Voice

Short, plain, about the reader's situation: "Plays when you're back
online", "3 previews missing", "2 clips picked".

The words for things (Daniel, 5 Oct 2026): **Library** (everything),
**Clips** (what's saved from the web; "page" only means a web page, or a
page in the reader's Pages layout), **Files** (EPUBs, PDFs and the like
brought in from the phone, when that comes), **Collections**, **Feeds**,
**Tags**. Storage keys, file names and sync paths keep "page", so saved
libraries and sync carry on unchanged. Buttons are verbs ("Save",
"Retry"). Errors say what happened and what to do: "Couldn't reach this
page. Check the link, or try again when you're online."

## 7. Accessibility

- Touch targets at least 44 × 44 px.
- Real `<button>`, `<a href>`, `<input>` with `<label>`; `aria-label` on
  icon-only buttons.
- Focus is always visible (`:focus-visible` ring in `--accent`).
- The reader respects the system text size as a floor.
- Every theme is checked; colors that must be told apart also differ in
  lightness.
