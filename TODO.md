# TODO

Only what's left. When something ships it leaves this file and goes to
CHANGELOG.md; the rules every release keeps are at the top of NOTES.md.

## Next

Nothing queued.

## Open, smaller

- **Moving a big library** goes file by file over the bridge: fine for
  hundreds of megabytes; a native copy would be quicker for gigabytes.
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
