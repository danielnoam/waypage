# TODO

Only what's left. When something ships it leaves this file and goes to
CHANGELOG.md; the rules every release keeps are at the top of NOTES.md.

## Next

- **Chapter-at-a-time books.** After 1.29.0 what's left of a big book's
  open is parsing its one 3 MB page (about 2 s at 6x). Readium and
  epub.js keep each chapter its own document; doing that here means a
  book stored as chapters with the reader loading the one you're in
  and its neighbours, and search, highlights, read aloud and the place
  working across them. Also what would make Pages layout fast for big
  books, which 1.29.0 doesn't touch.
- **Linked PDFs without the whole file in memory.** pdf.js can read by
  ranges (`PDFDataRangeTransport`); a 400 MB PDF is still copied whole
  into the sandbox today.
- **Your own fonts (Daniel, 17 Oct 2026).** Two ways in: drop a .ttf,
  .otf or .woff2 into a Fonts folder beside the library (Android and
  the Documents/picked-folder storage), or pick one in Settings ›
  Reading › Font › Add a font. Each becomes a `FontFace` in the app and
  an `@font-face` in the reader frame (a data or app-local URL the
  frame's CSP allows), listed after the bundled ones. Open: whether
  added fonts sync and go in backups (a few hundred KB each), and
  telling the user when a font has no Hebrew letters.
- **More read-aloud voices (Daniel, 17 Oct 2026).** Android only lists
  the default speech engine's voices: SpeechPlugin and SpeechService
  open `new TextToSpeech(context, ...)` with no engine, so voices from
  other installed engines (Samsung, RHVoice, Sherpa/Piper neural
  voices, Acapela) never show. List `getEngines()`, offer an engine
  picker above the voices, and pass the engine to both. iOS: show
  Enhanced and Premium voices first with a hint that more download in
  Settings › Accessibility › Spoken Content, and offer Personal Voice
  (`requestPersonalVoiceAuthorization`, iOS 17). Look into whether
  voices that download (Google's network voices) can be fetched for
  offline from inside the app or only from the engine's settings.

## iOS release (later, Daniel 11 Oct 2026)

Everything iOS-only, kept for one iOS release.

- **Google Drive backups on iOS.** Android and the web copy have them
  since 1.27.0. iOS needs an iOS client in the Google Cloud project, the
  GoogleSignIn pod in native/share for the token, and a Drive plugin
  with the same `authorize`, `upload` and `download` as Android's
  DrivePlugin.java.
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
- **Downloads in the background on iOS.** Still the half minute iOS
  gives the app. Going further means saving in Swift around background
  `URLSession` downloads, a second copy of the saving code: only if the
  half minute turns out not to be enough.

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
