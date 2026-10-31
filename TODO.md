# TODO

Only what's left. When something ships it leaves this file and goes to
CHANGELOG.md; the rules every release keeps are at the top of NOTES.md.

## Next

Nothing waiting. Ask Daniel what's next.

## Later (Daniel, 29 Oct 2026)

- **Settings per book, from KOReader.** A file (EPUB, PDF, comic)
  remembers its own font, size, margins and Scroll or Pages, with "Use
  everywhere" to make them the default. Kept to Files, not every web
  clip, so the text settings don't need a "This clip / Everywhere"
  choice on every control. Open question: whether they sync.

## iOS release (later, Daniel 11 Oct 2026)

Everything iOS-only, kept for one iOS release.

- **Convert a deck, keep the PDF where it was saved, on iOS (1.47.0).**
  `FileSavePlugin.swift` saves through the document picker but returns no
  address, so a converted deck opens as a copy. Return the saved URL with a
  security-scoped bookmark so it can be read from where it is, as on
  Android.
- **Reading widgets on iOS.** Android has Reading this week, Reading
  today and Days in a row since 1.39.0 (Widgets.java, statsWeek and the
  rest), drawn from the `stats` the app hands over in widgets.update.
  The iOS widget extension needs the same three, reading that `stats`.
- **Google Drive backups on iOS.** Android and the web copy have them
  since 1.27.0. iOS needs an iOS client in the Google Cloud project, the
  GoogleSignIn pod in native/share for the token, and a Drive plugin
  with the same `authorize`, `upload` and `download` as Android's
  DrivePlugin.java.
- **More voices on iOS.** Android picks its speech engine and opens the
  engine's page for more voices since 1.33.0. On iOS: list Enhanced and
  Premium voices first with a line on downloading more (Settings ›
  Accessibility › Spoken Content), and Personal Voice through
  `AVSpeechSynthesizer.requestPersonalVoiceAuthorization` (iOS 17).
- **The sleep timer, put away, on iOS.** Android's speech service keeps
  the time since 1.32.0; on iOS the page does, so with the app put away
  it waits until the app is back. A timer in the Speech plugin would do it,
  plus Sleep 15 min on the lock screen (Android has it since 1.36.0).
- **Read aloud going on to the next clip, put away, on iOS.** Android's
  speech service takes the next clip from the app since 1.23.0 and goes
  straight on; iOS's Speech plugin has no queue yet, so there the app
  still has to be open at the end of a clip.
- **Keep the screen on while reading aloud, on iOS.** Android sets the
  window flag since 1.24.0; iOS falls back to the browser's wake lock,
  which older iOS doesn't have. `isIdleTimerDisabled` in the Speech
  plugin's `keepScreen` would do it everywhere.
- **Read aloud in a small window on iOS.** Android shrinks the app into
  picture in picture since 1.25.0. iOS only allows that for video
  (AVPictureInPictureController), so it would mean drawing the window
  as a video; the lock screen's player covers most of it already.
- **Read aloud over Bluetooth on iOS.** Android's media session takes a
  car's or earbuds' previous and next a paragraph at a time and shows the
  clip, its collection and its number since 1.26.0. iOS's Speech plugin
  would set MPNowPlayingInfoCenter and MPRemoteCommandCenter the same way.
- **Moving a big library, natively.** Android copies in Java since
  1.19.0; iOS still moves file by file over the bridge. A FileManager
  copy would do it at disk speed.
- **A collection widget on iOS.** Android's asks which collection; on iOS
  that is an App Intent configuration (iOS 17).
- **Pages drawn by script, signed in, on iOS.** iOS's PageRender keeps
  nothing between pages (a non-persistent data store), so a signed-in
  site whose article only appears after its scripts run still saves as
  the start there. Copying the site's cookies into that store before the
  page loads would fix it. Android's already shares them.
- **Face ID and Touch ID for the app lock on iOS.** Android has
  fingerprint or face since 1.38.0; iOS has the passcode only. An
  AppLock plugin in Swift with LAContext's `evaluatePolicy`, and
  NSFaceIDUsageDescription in the app's Info.plist. Also hiding the app
  switcher's picture while locked (a cover view on resign active).
- **Translate this clip on iOS.** Android translates with ML Kit and the
  web copy with Chrome's Translator since 1.42.0. iOS 18's Translation
  framework (`TranslationSession`, on-device, downloads a language once)
  would do it in a Translate plugin with the same `detect`, `ready`,
  `prepare` and `clip` as Android's TranslatePlugin.java. It needs a
  SwiftUI host for `translationTask`, and iOS 18.
- **Downloads in the background on iOS.** Still the half minute iOS
  gives the app. Going further means saving in Swift around background
  `URLSession` downloads, a second copy of the saving code: only if the
  half minute turns out not to be enough.

## Ideas to learn about (Daniel, 27 Oct 2026)

Not planned: things to understand before deciding.

- **A list of the words you looked up, to review**, as KOReader's
  vocabulary builder does, now that Look up has dictionaries (1.45.0).

- **WebDAV sync, as Anx Reader has it.** WebDAV is a plain HTTP standard
  for files on a server: Nextcloud, ownCloud, a Synology or QNAP box,
  Koofr, Box, many NAS drives. Anx syncs its books, notes and places
  through it. For Waypage it would be a third way beside GitHub sync and
  Drive backups, for people who'd rather not hand over a GitHub token or
  who own their server. To find out: whether sync.js's merge (base, ours,
  theirs) can sit on WebDAV's ETags the way it sits on GitHub's SHAs;
  how the password is kept (an app password, HTTPS only, never synced);
  CORS on the web copy (most servers don't send it, so it may be
  app-only through CapacitorHttp); and whether clip files go up too or
  only the library and places.

## Parked: the stores (Daniel, 10 Oct 2026: "we don't care for stores for now")

- **Before shipping to other people:** desktop browser version in v1 or
  not; Apple Developer Program or Android first; name checks; privacy
  policy and store data forms; real icon assets via @capacitor/assets.
- **The Apple Developer Program.** A free account (AltStore/SideStore) has
  3 active apps, extensions included, which Waypage fills; the program
  ends the 7-day re-signing and opens TestFlight and the App Store.
- **Saving any site in a browser needs a server.** A stateless fetch
  worker behind a token, rate-limited, storing nothing. Only with a
  desktop browser version.
