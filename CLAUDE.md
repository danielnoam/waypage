# Waypage

An offline reader: save a web page (a Wikipedia article, a news story) to
the phone, read it with no connection, on a plane, with a link back to the
original. Plain HTML, CSS and JS with **no build step and no
dependencies**, served as static files and wrapped by Capacitor for
Android and iOS. Started from LifeLog (danielnoam/lifelog), which it
borrows its stack, build workflows and native-fetch trick from.

## Before anything

- `git pull --ff-only` first.
- Read **docs/PROPOSAL.md** before changing architecture: it records why
  there is no server, how a page is captured and stored, and the legal and
  store rules the design keeps to. **TODO.md** is the work, **DONE.md**
  what the app already does, **NOTES.md** why things are the way they
  are, **DROPPED.md** what was decided against.
- Read **Working with Daniel** below; it's what he'd otherwise have to
  repeat.

## Decisions already made (2026-10-02)

- **Name:** Waypage (was Carry-on until 1.0.0, 6 Oct 2026). Store title
  "Waypage: Offline Reader". The repo was danielnoam/carry-on; GitHub
  redirects the old name. The signing key keeps its alias `carryon`.
- **No server for the phone app.** Pages and images are fetched on the
  device with CapacitorHttp and `Filesystem.downloadFile`, which CORS
  doesn't apply to (LifeLog does the same since its 0.215.0). A server is
  only for a desktop browser version, which is undecided; if it ever
  exists it is stateless, authenticated, rate-limited and stores nothing.
- **Images are saved like videos:** a small local preview (about 480 px
  wide, ~30 KB) plus the link to the full image, which loads when online.
  Settings offer "Full images" (for maps and diagrams) and "Links only".
  Videos are never downloaded: thumbnail plus link, plays when online.
- **Saved HTML is untrusted.** It is rendered in a sandboxed iframe with no
  `allow-scripts` and a strict CSP, never in the app's own document: a
  script there could reach the Capacitor plugins.
- **Look:** Apple HIG as the rulebook, Motion-style springs, vanilla JS.
  Themes Paper (default), Sepia, Night. Reading type Source Serif 4,
  interface type Instrument Sans, both bundled. See DESIGN.md.
- **Wikipedia** goes through its REST API, with a User-Agent naming the
  app, and every saved Wikipedia page shows "CC BY-SA 4.0, Wikipedia
  contributors" and the original link.

## Design references

- Proposal doc: https://claude.ai/code/artifact/5c6cf847-cd85-4c91-a466-2da95fbde60b
  (copied into docs/PROPOSAL.md)
- Design canvas: https://claude.ai/artifact/5zi1VCs3WcLSTLJCw7iasC
  (its artboards are copied into design/, open them for the exact markup)

## UI work

- **DESIGN.md** is the design language. Colors are tokens, sizes come from
  the scales, every animation has a reduced-motion answer, touch targets
  are 44px, and every theme (Paper, Sepia, Night) is checked for WCAG AA.

## Shipping

- Use the `release-checklist` skill for every change: version bump (three
  places), CHANGELOG.md, notes files, `node test/run-all.js`, verify at
  phone and desktop width, then commit and push straight to `main`.
- `main` is production. A push deploys the web copy, and a new
  `APP_VERSION` publishes the APK and IPA. Check the runs went green.

## Working with Daniel (his standing rules, 17 Oct 2026)

Keeping the notes files right:

- **TODO.md holds only what's left.** Whenever something ships, or Daniel
  says he doesn't want it, take it out in the same change: shipped work
  becomes a line in DONE.md (and the CHANGELOG entry), a no becomes a line
  in DROPPED.md with his reason. Also remove anything stale or already
  covered. Never leave done work in TODO.md.
- **DONE.md is one line per feature, by area, with its version.** Add to
  it with every release that adds something.
- **The shared project folder's waypage/TODO.md and DONE.md are copies.**
  After changing either in the repo, copy it over the shared one so both
  match.
- **The README lists every feature, with pictures.** When a release
  adds or changes something a person can see, update its README section
  in the same change (a short line, not an essay) and retake that
  section's screenshots with `node tools/shots.js <section>`; a new area
  gets its own section, Contents line and shot in `tools/shots.js`.
- **Before suggesting ideas,** check DONE.md, TODO.md and DROPPED.md so
  nothing shipped, planned or turned down is suggested again.

How he likes the work done:

- **Merge to main without asking** once the checks are green. Don't ask
  "shall I merge".
- **When he says "don't build yet" or "fixes only",** commit locally and
  don't push (a branch push builds too) until he says build.
- **"Add to TODO" means plan it, not build it.** Small asks he lists
  without that, build now.
- **Several asks go out as one release,** or two at most when grouped;
  don't split them into many.
- **For a new look, a reworked screen or a big change, show or explain it
  first** and wait for his OK before building.
- **Secure and private as far as it can go.** Every change asks what it
  sends, to whom, and what a page, file or other site could do with it:
  the least access (narrow tokens and scopes), nothing leaves the device
  unless the user turned it on, saved content stays sandboxed, and any
  trade-off is said plainly and written in NOTES.md.
- **Everything works on Android and on a computer (the web copy),** and
  on iOS later. A feature that can't work somewhere gets that platform's
  nearest equivalent (keys on a computer for the volume buttons, say);
  iOS-only native work goes on TODO.md's iOS release list.
- **Speed matters.** Measure with a big library (3,000 clips) on a slowed
  CPU before and after anything that touches lists or opening.
- **Motion has no fades.** Things move or zoom; see DESIGN.md.
- **App stores aren't a priority.** Don't bring up store prep.
- **UI words:** Library, Clips, Files, Collections, Feeds, Tags,
  Highlights, Narrate (not "Read aloud", since 1.42.0). "Pages" is only
  the reader's layout.
- **After shipping,** say in a line or two what to try on the phone,
  above all anything native that couldn't be tested here.
- **Be direct.** Push back when an idea or plan is weak, and say what
  was checked and what is a guess.
