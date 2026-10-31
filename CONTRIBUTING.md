# Contributing to Waypage

Waypage saves a web page (a Wikipedia article, a news story, an EPUB or
PDF) to the phone so it can be read with no connection. It is plain HTML,
CSS and JS with **no build step and no dependencies**, served as static
files (the web copy on GitHub Pages) and wrapped by Capacitor as the
Android and iOS apps. This file is the rulebook for everyone who works on
it, people and Claude sessions alike. CLAUDE.md adds only what is specific
to Claude.

## Getting started

```sh
git clone https://github.com/danielnoam/waypage
cd waypage
node server.js          # http://localhost:5173 (start.cmd on Windows)
node test/run-all.js    # the whole test suite
```

Nothing to install for the web app. `npm ci` is only needed for the native
builds (`tools/build-www.js`, Capacitor) and for `test/build.test.js`,
which fails without `node_modules/@capacitor`.

## Read before you change anything

| File | What it holds |
|---|---|
| `docs/PROPOSAL.md` | Why there is no server, how a page is captured and stored, the legal and store rules. Read it before changing architecture. |
| `DESIGN.md` | The design language: color tokens, type and space scales, motion, components, accessibility. |
| `TODO.md` | What's left to do. Only that. |
| `DONE.md` | What the app already does, one line per feature by area, with its version. |
| `DROPPED.md` | What was decided against, and why. |
| `NOTES.md` | Why things are the way they are, newest first. Its top section, "Rules every release keeps", is binding. |
| `CHANGELOG.md` | Every release, in user-facing words. |
| `design/` | The design canvas artboards, for exact markup. |

Before proposing an idea, check DONE.md, TODO.md and DROPPED.md so nothing
shipped, planned or turned down comes back.

## How the code is laid out

- `index.html` loads every script as a classic `<script>` in order. There
  are no modules and no bundler.
- `src/app.js` and the `src/app-*.js` files share **one global scope**.
  The order is the one in `index.html`: app (version, helpers, theme,
  state), reading, cards, downloads, search, draw, jobs, reader, library,
  saving, places, settings, lock, start. Code that runs at load may only
  use what an earlier file, or the same one, declared. New shell code
  goes in the file for its area, or a new `app-<area>.js` added to
  `index.html` and `sw.js`'s `ASSETS`.
- `src/reader.js`, `save.js`, `sync.js`, `store.js`, `files.js` and the
  rest are self-contained areas. Vendored code lives only in `src/vendor/`
  with its licence beside it.
- `native/` holds the Capacitor plugins; `tools/` the build, version and
  screenshot scripts; `test/` the Node tests.
- Reuse the helpers in `src/app.js` (`el`, `toast`, `load`, `store`)
  instead of writing new ones.

## Decisions that are already made

Don't reopen these without talking to Daniel first.

- **No server for the phone app.** Pages and images are fetched on the
  device with CapacitorHttp and `Filesystem.downloadFile`, which CORS
  doesn't apply to. A server would only exist for a desktop browser
  version; if it ever does, it is stateless, authenticated, rate-limited
  and stores nothing.
- **Saved HTML is untrusted.** It is rendered in a sandboxed iframe with no
  `allow-scripts` and a strict CSP, never in the app's own document: a
  script there could reach the Capacitor plugins. Anything new that
  renders saved content keeps to that.
- **Images are saved like videos:** a small local preview (~480 px wide)
  plus the link to the full image. Settings offer "Full images" and
  "Links only". Videos are never downloaded.
- **Wikipedia** goes through its REST API with a User-Agent naming the
  app, and every saved Wikipedia page shows "CC BY-SA 4.0, Wikipedia
  contributors" and the original link.
- **Look:** Apple HIG as the rulebook, spring motion, vanilla JS. Themes
  Paper (default), Sepia and Night. Reading type Source Serif 4, interface
  type Instrument Sans, both bundled.

## Rules for every change

**Security and privacy, as far as it can go.** For every change ask what
it sends, to whom, and what a page, file or other site could do with it.
Use the least access (narrow tokens and scopes). Nothing leaves the device
unless the user turned it on. Saved content stays sandboxed. Any
trade-off is stated plainly and written in NOTES.md.

**Every platform.** Everything works on Android and on a computer (the web
copy), and on iOS later. A feature that can't work somewhere gets that
platform's nearest equivalent (keys on a computer for the volume buttons,
say). iOS-only native work goes on TODO.md's iOS release list.

**Speed.** Anything that touches lists or opening is measured with a big
library (3,000 clips) on a slowed CPU (6x in Chrome DevTools), before and
after.

**Design.** Follow DESIGN.md: colors are tokens, sizes come from the
scales, touch targets are 44 px, every theme passes WCAG AA
(`test/contrast.test.js`), and every animation has a reduced-motion
answer. **Motion has no fades:** things move or zoom.

**Words in the UI.** Library, Clips, Files, Collections, Feeds, Tags,
Highlights, Narrate (not "Read aloud"). "Pages" is only the reader's
layout mode.

**Ask first for big things.** A new look, a reworked screen or a big
change is shown or explained to Daniel (a mockup, a screenshot, a short
write-up) and waits for his OK before it's built.

**"Add to TODO" means plan it, not build it.** It goes into TODO.md with
enough detail for someone else to pick it up.

## Keeping the notes files right

- **TODO.md holds only what's left.** When something ships or is turned
  down, take it out in the same change. Shipped work becomes a line in
  DONE.md and a CHANGELOG entry; a "no" becomes a line in DROPPED.md with
  the reason. Remove anything stale.
- **DONE.md** gets one line per feature, under its area, with its version.
- **NOTES.md** gets an entry for anything non-obvious: a bold title with
  the version, then why.
- **README.md lists every feature, with pictures.** A change a person can
  see updates its README section (a short line) and retakes that
  section's screenshots with `node tools/shots.js <section>`. A new area
  gets its own section, Contents line and shot in `tools/shots.js`. Look
  at the new pictures before committing.
- The Claude project keeps copies of TODO.md and DONE.md in its shared
  folder (`waypage/`). Claude sessions copy them over after changing
  either; people don't need to.

## Versions and releases (how it works today)

This section describes the current setup. It is about to change so that
several people can work at once (see "Changing soon" below).

**A version lives in three places,** and a release bumps all three:

1. `APP_VERSION` in `src/app.js`. New feature: minor (`1.X.0`). Fix or
   tweak: patch. A change to the saved-page format that old versions
   can't read: major.
2. The `?v=x.y.z` on every `<script>` and `<link rel="stylesheet">` in
   `index.html`, so browsers fetch the changed files.
3. `CACHE` in `sw.js` (`waypage-vN` → `vN+1`), so the old offline cache is
   dropped. A file added to or removed from `src/` also goes in or out of
   `sw.js`'s `ASSETS`, which is the list that goes into the apps; the
   build fails if `index.html` loads a file it lacks.

Plus a `## [x.y.z] - YYYY-MM-DD` entry at the top of CHANGELOG.md
(`### Added` / `Changed` / `Fixed` / `Removed`, in user-facing words).
The release workflow copies that entry into the GitHub release notes.

**How a change gets in:** `main` takes only pull requests. Push a
branch, open a PR, and merge it when the **Tests** check is green
(`.github/workflows/test.yml` runs `node test/run-all.js` with
Playwright on every PR and on `main`). No review is required: anyone
with write access merges on green, and Daniel decides who has write
access. A PR from a fork runs the tests too, but without the repo's
secrets, so it can't sign or publish anything.

**What a merge does:**

- A merge to **`main`** deploys the web copy (GitHub Pages serves `main`
  as it is).
- `.github/workflows/android.yml` and `ios.yml` build on every push to
  `main` and to `claude/**` branches. Pushes that only touch `**.md`,
  `test/**` or `.claude/**` don't run them.
- On `main`, when `APP_VERSION` has no release yet and the signing secrets
  are set, the Android workflow publishes the release `app-v<version>`
  with `Waypage.apk`, and the iOS workflow attaches an unsigned
  `Waypage.ipa` to it a few minutes later.
- The app's built-in updater reads the repo's releases (the repo is
  public for this reason) and offers any version **higher** than its own.
  A lower or equal number is ignored.

So today **every merge to `main` that bumps the version is a release** to
every installed copy. Changes that only touch TODO.md or other notes push
to `main` without a version bump.

**Before a release:** `node --check` every edited `.js`, run
`node test/run-all.js`, then run `node server.js` and check at phone width
(390 px) and desktop width (~1280 px) in Paper, Sepia and Night with zero
console errors. Saving and reading can only be fully checked in the app
(CapacitorHttp and Filesystem don't exist in a browser): say so when a
change touches them and wasn't run on a phone. After pushing, check that
both workflow runs went green.

**Two releases at once.** If someone else released while you worked,
their version number is taken. Merge `main` in and take the next free
version above the latest release, or the updater will ignore yours.

### Changing soon

With more than one person, "every merge is a release" means version
clashes and shipping each other's half-finished work. The plan: separate merging from releasing, so merges land on `main`
and a release happens only on a tag or a manual run, which is when the
version is bumped. This section will be rewritten when that is in
place.

## Signing and secrets

The Android release key is in the repo secrets `ANDROID_KEYSTORE_B64` and
`ANDROID_KEYSTORE_PASSWORD`, alias `carryon` (kept from before the rename
to Waypage, invisible to users). Every APK must be signed with it to
install over the last one. Never commit a key, token or password; never
print one in a workflow log.
