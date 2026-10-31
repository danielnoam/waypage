# User guide

How to do the things in Waypage that take more than one tap. Describes
**1.45.7**. For what each feature is, see the [README](../README.md); for how
it works inside, see [ARCHITECTURE.md](ARCHITECTURE.md).

Button names are written the way they look on screen. Waypage runs two ways:

- **The Android app**, which does everything below.
- **The web copy** on a computer (or in a phone's browser), which does most
  of it. A web page can't read most other sites, so there you can save
  Wikipedia pages and open files, but other sites need the app.

Steps that only work in the app say **Android app**. They are written from
the code; the web copy is the one they were walked through in (see
[What was checked](#what-was-checked)).

## Contents

- [Find your way around](#find-your-way-around)
- [Your first save, and reading with no connection](#your-first-save-and-reading-with-no-connection)
- [Collections and files](#collections-and-files)
- [Where your library lives](#where-your-library-lives)
- [Sync with GitHub](#sync-with-github)
- [Back up to Google Drive](#back-up-to-google-drive)
- [Feeds](#feeds)
- [Newsletters](#newsletters)
- [App lock](#app-lock)
- [Dictionaries and Look up](#dictionaries-and-look-up)
- [Translate](#translate)
- [Narrate](#narrate)
- [What leaves your device, and when](#what-leaves-your-device-and-when)
- [What was checked](#what-was-checked)

## Find your way around

- **Settings** is the gear at the top right on a phone, and *Settings* at the
  bottom of the sidebar on a computer. Each group in it (Appearance, Reading,
  Library, App lock, Saving, GitHub sync, Google Drive, Storage, About,
  Report a problem) opens its own screen.
- **The sidebar** holds Library, Clips, Feeds, Newsletters, Highlights and
  Stats. On a computer it is always there. On a phone, tap the menu button at
  the top left.
- **The bar at the bottom** (top of the Library on a computer) is where you
  paste a link and press **Save**. The button beside it is **Save with
  options**.
- **Downloads** is the arrow button at the top. Saves in progress, and ones
  that failed, show there.
- **The Sync button** shows at the top once GitHub sync or Google Drive is on.
  It opens a screen with both, their progress and their controls.

## Your first save, and reading with no connection

1. Copy a page's address. Try a Wikipedia article.
2. In Waypage, paste it into **Paste a link to save** and press **Save**. On a
   computer, Ctrl V on the Library saves the link on your clipboard.
   - **Android app:** you can also share a page to Waypage from your
     browser's Share menu.
   - **Web copy:** only Wikipedia links save. For anything else, Downloads
     says "This browser can't reach that site directly. Save it in Waypage on
     your phone, then bring it here with a backup."
3. A toast says "Saving. It's in Downloads." When it finishes, the clip shows
   in the Library under **Clips**.
4. Tap it to read. Your place is kept.

The text is saved whole. Pictures keep a small preview on the device and a
link to the full size, which loads when you're online. Videos keep a
thumbnail and a link. Every clip links back to the original: open a clip's
menu (press and hold it, or right-click on a computer) and tap **Original**.

**Choose how pictures are kept.** *Settings, Saving, Images*: **Previews and
links** (about 30 KB a picture, the default), **Full images** (about 150 KB,
for maps and diagrams) or **Links only**. This applies to clips you save from
now on. To pick it for one save, use **Save with options** and the **Images**
choice there (Android app).

**Before a flight.** *Settings, Saving, Before you go offline*, then **Get
ready**. Waypage saves what's missing (pictures, failed saves, new chapters,
new feed posts) and lists any clip that still won't read in full offline.

**Free up space.** *Settings, Storage* lists clips by size. **Keep only the text
of finished clips** drops pictures from clips you've finished; they show again
when you're online. **Make pictures smaller** (Android app) shrinks full
pictures already saved.

**In the web copy, keep your clips.** *Settings, Storage, This browser*, then
**Keep clips from being cleared**. A browser can clear a site's data when
space runs low, so also use **Back up the library** now and then.

## Collections and files

### Make a collection

A collection is an ordered folder of clips.

1. Press and hold a clip (right-click on a computer) and tap **Select**. Tap
   more clips if you like.
2. Tap **Collection** in the bar. Under "Move … to", pick one of your
   collections, or type a name under **New collection** and press Enter.
3. Open the collection from the Library. Its **⋯** menu has **Add clips**,
   **Rename**, **Reorder**, **Select**, **Export**, **Favourite** and
   **Remove**. **Story page** is for a collection saved from a serial's
   chapters; it finds new ones and shows a "+N" to save them.

You can also pick a collection when you save: **Save with options**, then
**Collection**. The links save in order, and the collection keeps that order.

### Open a file

1. Tap **Open a file** in the empty Library, or open **Save with options** and
   tap **Open a file**. On a computer you can drag a file onto the window.
2. Pick an EPUB, PDF, MOBI, AZW3, FB2, CBZ, Markdown, text or HTML file, or an
   email (.eml).
3. **Android app:** Waypage asks how to keep it.
   - **Keep a copy** makes a clip like any other. It syncs, and stays when
     the file goes.
   - **Read from where it is** costs almost nothing, but the file has to stay
     where it is, and it doesn't sync.

### Watch a folder (Android app)

Waypage can add new files from a folder each time it opens.

1. *Settings, Library*, then **Watch a folder**.
2. Pick the folder, like Books.
3. Under it, **New files go into** says where they go: **Its subfolders** (a
   collection named after each folder), a collection of yours, or **New
   collection…**.
4. Waypage looks in each time it opens. The round arrow on the row looks now.
   **Stop watching** (the cross) leaves the files in your library.

Files read from a watched folder don't sync, since another device can't read
them. If the folder moves, the row says "Can't open it"; pick it again.

## Where your library lives

**Android app only.** *Settings, Storage*, then **Where your library is**:

- **Inside Waypage.** The default and quickest. Private to the app. Uninstalling
  Waypage deletes it.
- **Documents/Waypage.** Shows in the Files app, and stays if you uninstall
  Waypage. After a reinstall, the empty Library offers **Get back your library
  from Documents**.
- **A folder you pick.** Any folder on the phone or a memory card. A little
  slower to save into. Pick it again to choose another.

Changing it moves every clip there ("Moving, 3 of 40 files…"); a library
already in the new place is added to yours. If the move fails it stays where it
was.

The web copy keeps its clips in the browser, so this setting isn't there.

## Sync with GitHub

Sync keeps your clips, tags, collections, favourites and where you are the same
on every device, through a private repo on your own GitHub. Nothing goes to
anyone else's server.

### Set up the first device

Open *Settings, GitHub sync*. It lists four steps.

1. **Make a free GitHub account.** Skip it if you have one.
2. **Make a private repo for your library.** The button opens GitHub with the
   name `waypage-data` and Private already filled in. Press **Create
   repository**. Keep it Private.
3. **Make a token for that repo only.** The button opens GitHub's new-token
   page, already filled in. Under **Repository access**, pick **Only select
   repositories**, then `waypage-data`. Press **Generate token**, and copy it.
   The token never expires, can write that repo's contents, and can't touch
   anything else on your account.
4. **Paste it here.** Paste the token (it starts `github_pat_`) into the field
   and press **Connect**.

Waypage checks the token, finds your account, and refuses to go on if the repo
is public. Then it syncs. The Sync button appears at the top.

### Add another device with the QR code

On a device that already syncs:

1. Open *Settings, GitHub sync*. Under **Add another device** there is a QR
   code and **Copy setup link**.
2. On the new device, open *Settings, GitHub sync*, and under **Already syncing
   on another device?** do one of these:
   - **Android app:** **Scan its setup code**.
   - **Anywhere:** paste the setup link into step 4's field and press
     **Connect**. Pointing a phone's camera at the code opens the web copy and
     turns sync on there.

The QR code is made on your device, not by a website. **The code and link hold
your token.** Only use them on your own devices, and only send the link to
yourself.

### Day to day

- It syncs when Waypage opens, after a change, and every few minutes while open.
  **Sync now** forces one. **Pause syncing** stops at the next clip and picks up
  where it left off.
- **What this device syncs** has **Clips too** (each clip's text goes up) and
  **Links only** (a new device saves the pages again from their links, so one
  that changed or went away comes back different or not at all).
- **This device's name** shows on your other devices when this one read a clip
  further.
- **On mobile data** (Android app): **Sync**, **Places and reading time only**
  or **Wait for Wi-Fi**.
- **Disconnect from GitHub** forgets the token on this device. Your clips stay
  here and on GitHub.

If you set sync up with an older, wider token, the screen shows **Make a safer
token**: make one for `waypage-data` only, paste it, then delete the old one on
GitHub.

## Back up to Google Drive

A copy of your library in your own Drive, made every week and whenever you ask,
for a new phone or after a mistake.

1. *Settings, Google Drive*, then **Connect Google Drive**, and sign in to Google.
2. Waypage can only see the backups it makes, in a **Waypage** folder in your
   Drive. It doesn't open or read anything else there.
3. **What goes in** has switches for **Clips**, **Files** (usually the biggest
   part) and **Feeds you follow**.
4. **Back up now** makes one. A progress card shows on the Sync screen, with
   pause and stop.
5. **Every week** turns on the weekly one. In the Android app it runs on Wi-Fi
   while Waypage is open. In the web copy it asks first, since a browser signs
   in to Google for an hour at a time.

Drive keeps the last 3 backups; an older one is deleted when a new one is made.

**Restore.** Under **Restore**, tap a backup. It adds what isn't here and keeps
whichever copy of a clip was saved last; nothing here is deleted. The bin
deletes that backup from Drive for good. **Disconnect Google Drive** leaves the
backups in your Drive.

There is also a one-file backup that doesn't use Google: *Settings, Storage,
Back up the library*, and **Restore or open a file** to bring it back.

## Feeds

Feeds are sites you follow: RSS, Atom and JSON Feed. Posts show in one list by
day.

1. Open **Feeds** in the sidebar. With none yet, tap **Add a feed**.
   Afterwards, paste a site or feed into the bottom field and press **Follow**.
2. In **A site or its feed**, type the site's address. Waypage finds its feed.
   Press **Find its feed**.
3. Under **New posts**, choose **Show them** (they wait in Feeds for you to
   save) or **Save them** (they save themselves while you're online). Saved
   posts go into a collection named after the feed.
4. Press **Follow**.

Then save a post from its row, **Save all** under a day, or pick several. Hold
a feed's chip for its settings: **Save into**, **Skip posts older than**,
**Check now**, **Unfollow**. Unfollowing keeps the posts you saved.

**Android app:** the app checks feeds with the app closed. *Settings,
Notifications* (shown only in the app) turns alerts on, as **Each post on its
own** or **All together**, and lets you keep single feeds quiet. Most sites
only let Waypage on the phone read their feed; in the web copy, following
usually answers "This browser can't reach … Follow the feed in Waypage on your
phone."

Feeds in and out as OPML: *Settings, Storage, Save the feeds you follow
(OPML)*, and *Settings, Saving, Import* to bring another reader's.

## Newsletters

Waypage gives you an email address; newsletters sent to it arrive as clips.

1. Open **Newsletters** in the sidebar and tap **Make an address**. (Or type a
   name in the bottom field and press **Make**.)
2. **Android app:** Waypage asks Kill the Newsletter, a free service, for the
   address. Your address shows at the top of the list; tap **Copy address**.
   **Web copy:** it can't make one. A sheet asks for a feed link: make an
   address on Kill the Newsletter's page (**Open Kill the Newsletter**), paste
   its feed link (it ends in `.xml`), and press **Add it**.
3. Sign up to a newsletter using that address.
4. The site's "please confirm" email shows with a **Confirm** button, not as a
   clip. Press it to confirm in your browser.
5. After that, each email arrives here, with an unread dot, and saves as a clip.

Hold an address's chip for its settings, **Delete the address** (so mail to it
bounces) included. Kill the Newsletter keeps an email for a month.

## App lock

A passcode to open Waypage.

1. *Settings, App lock*, then **Turn on app lock**.
2. **Choose a passcode:** 4 to 12 numbers. Press **Next**, enter it again, then
   **Turn on**. On a computer, type the numbers.
3. **Lock** sets when it locks: **Right away**, **After 1 minute**, **After 5
   minutes** or **After 15 minutes**.
4. **Android app:** a **Fingerprint or face** switch appears once the phone has
   one set up. The passcode still works.
5. **Change the passcode** and **Turn off app lock** ask for the current one.

Five wrong tries start a wait, twice as long each time (30 seconds up to 15
minutes).

The lock keeps anyone who picks up your phone or computer out of Waypage. It
doesn't encrypt the files. The passcode never leaves the device.

**Forgot it?** Tap **Forgot passcode?** on the keypad, then **Erase everything**.
That erases Waypage on this device and starts again. GitHub sync or a Google
Drive backup brings your clips back.

## Dictionaries and Look up

Look up uses dictionaries you add, on the device. Nothing about a lookup leaves
it.

1. Get a StarDict dictionary. Settings links to "where to find free ones".
2. *Settings, Reading, Dictionaries*, then **Add a dictionary**.
3. Pick the `.ifo`, `.idx` and `.dict` (or `.dict.dz`) files together, or a
   `.zip` or `.tar.gz` of them.
4. While reading, select a word (up to four words) and tap **Look up** in the
   selection bar. The button shows only once you've added a dictionary.

**Remove** takes a dictionary off the device.

## Translate

- **A whole clip.** In the reader, tap the **Translate this clip** button
  beside Highlights, pick the language under **Into**, and press **Translate**.
  **Show** switches between **Off**, **Under the text** and **Instead of the
  text**. **Remove the translation** deletes it.
  - It works on the device: ML Kit in the Android app, Chrome's own translator on
    a computer. The first time for a language, the phone or browser downloads it
    (about 30 MB on the phone). The button is missing where neither is there,
    such as other browsers.
- **Selected words.** Select them and tap **Translate**. In the Android app this
  hands the words to the phone's translate app. Where there isn't one, it opens
  Google Translate in your browser with the words, which sends them to Google.

## Narrate

Narrate reads a clip aloud with your device's own voices, offline.

1. Open a clip and tap the speaker button (**Narrate**) in the top bar. The
   player has previous and next paragraph, pause and play, and a sleep timer.
2. To start in the middle, select a word and tap **Narrate from here**.
3. *Settings, Reading, Narrate* (also reachable from the reader's settings)
   has **Voice**, **Speed**, **Read footnotes**, **Skip headers and footers**,
   **Go on to the next clip**, **Keep the screen on** and **Keep reading when
   you leave the clip**.
4. **Android app:** it keeps reading with the screen off, with controls on the
   lock screen. It also adds **Speech engine**, **Get more voices**, **Allow
   mixing** and **Small window outside the app**. No voice for the clip's
   language? **Get more voices** adds one.

On a computer it reads while the clip is open.

## What leaves your device, and when

There is no Waypage server. Everything below goes straight from your device to
the place named, and nothing else is sent. Waypage collects nothing.

| When | What | Where to |
| --- | --- | --- |
| You save a page | The page's address | That site, to fetch it. (Wikipedia: its API.) |
| You open a clip online | A request for each full-size picture or linked one not saved on the device | The picture's own site, which can see you read. **Load pictures only when tapped** (*Settings, Saving*) stops that until you tap a picture. Previews saved on the device always show. |
| You follow a feed | A request for the feed, on a schedule, with the app open or closed | The feed's site |
| You make a newsletter address | A name for the address | Kill the Newsletter. It receives the emails, so it can read them; anyone with the address can send to it. |
| GitHub sync is on | Your clips, tags, collections, favourites, highlights, feeds and reading time, and the token | Your private `waypage-data` repo on GitHub. The token goes only to GitHub and is kept on the device. |
| Google Drive is on | A backup file, and your Google sign-in | Your own Drive, in a Waypage folder |
| You sign in to a site to save from it | That site's cookies, sent when saving | That site. Sign-ins stay on the device and don't sync. |
| You translate selected words with no on-device translator | The words (up to 1,500 characters) | Google Translate, in your browser |
| You translate a whole clip | Nothing, but the first time for a language it is downloaded | Google (phone) or the browser (computer) |
| You press the bookmark **Send to Waypage** (computer) | The page, from that tab to Waypage | Nothing in between; you press Save before anything is kept |
| You send a problem report | What you wrote, the version, device model, the error log | Where you send it. **Open an issue on GitHub** is public. |
| The Android app looks for an update | A request for the latest release | GitHub |

What never leaves:

- Clips, highlights, notes, reading position and stats, unless you turn sync
  or Drive on.
- Look up. The dictionary and the words stay on the device.
- The app lock passcode.
- A QR setup code. It's drawn on the device.
- Narrate, which uses the device's own voices.

Saved pages are untrusted. Waypage shows each one in a frame with no scripts,
so a page can't reach the app.

## What was checked

The web copy at 390 px and 1280 px wide (`node server.js`,
<http://localhost:5173>), by hand and against the code:

- Saving a Wikipedia link, and the "can't reach that site" answer for a
  non-Wikipedia link.
- Every Settings group's screen and wording: Appearance, Reading, Library,
  App lock, Saving, GitHub sync (its four steps), Google Drive (its
  Connect screen), Storage.
- The App lock keypad up to **Turn on** (not turned on).
- Feeds and Newsletters in their empty state, and Add a feed answering "This
  browser can't reach …".
- The clip menu and the selection bar (**Tags**, **Collection**, **Mark read**,
  **Edit**, **Delete**), and **Save with options** with **Open a file**.

**Not walked through, and not claimed tested:** everything marked *Android app*
(watched folders, where the library lives, Scan its setup code, fingerprint,
Notifications, Narrate with the screen off, on-device Translate), signing in to
Google, a real GitHub token and sync, a real Drive backup, making a newsletter
address, and following a feed. Those steps come from the code in
`src/app-settings.js`, `src/app-saving.js`, `src/app-library.js`,
`src/app-places.js`, `src/app-lock.js` and `src/app-reader.js`.
