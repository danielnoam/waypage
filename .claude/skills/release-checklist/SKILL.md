---
name: release-checklist
description: Release checklist for Waypage (danielnoam/waypage): bump APP_VERSION in three places, add a CHANGELOG.md entry, file notes under TODO.md/NOTES.md/DROPPED.md, keep the vanilla app lean, run the tests, verify phone and desktop width, and push to main (which publishes the APK and IPA). Use before shipping any change.
---

# Waypage release checklist

Adapted from LifeLog's. Every change pushed to `main` leaves the version,
CHANGELOG.md and the notes files in step with it.

## 1. Bump the version (three places)

- `APP_VERSION` in `src/app.js`. New feature: minor (`0.X.0`). Fix or
  tweak: patch. A change to the saved-page format that old versions can't
  read: major.
- The `?v=x.y.z` on every `<script>` and `<link rel="stylesheet">` in
  `index.html`, so browsers fetch the changed files.
- `CACHE` in `sw.js` (`waypage-vN` → `vN+1`), so the old cache is dropped.
- A file added to or removed from `src/` goes in or out of `sw.js`'s
  `ASSETS` too. That list is also what goes into the apps
  (`tools/build-www.js`), and the build fails if `index.html` loads a file
  it lacks. `test/build.test.js` checks fonts in `styles.css` the same way.

## 2. CHANGELOG.md

`## [x.y.z] - YYYY-MM-DD`, newest first, `### Added` / `### Changed` /
`### Fixed` / `### Removed`, in plain user-facing words. The release
workflow copies this entry into the GitHub release notes.

## 3. Notes files (one home per entry)

- **TODO.md**: remove what this change completes, add follow-ups.
- **DONE.md**: one line for each feature this release adds, under its
  area, with the version.
- Copy TODO.md and DONE.md over the shared project folder's
  waypage/TODO.md and waypage/DONE.md.
- **README.md**: every feature, one short line under its section. Add or
  change the line for what this release adds, and retake that section's
  pictures with `node tools/shots.js <section>` (desktop and phone, into
  `docs/shots/`). A new area gets a section, a Contents line and a shot in
  `tools/shots.js`. Look at the new pictures before committing.
- **ARCHITECTURE.md**: a file added, removed or renamed, or a flow
  changed, is updated here in the same change (`test/docs.test.js`
  checks the file list).
- **NOTES.md**: why something is the way it is, newest first, each entry a
  bold title with its version.
- **DROPPED.md**: what was decided against, with the reason.

## 4. Keep it lean

No build step, no dependencies; vendored files only under `src/vendor/`
with their licence beside them. Reuse helpers in `src/app.js` (`el`,
`toast`, `load`, `store`). Remove debug logging and temp files.

## 5. Verify

- `node --check` every edited `.js`, then `node test/run-all.js`.
- Run `node server.js` and check at phone width (390px) and desktop width
  (~1280px) in all three themes (Paper, Sepia, Night), with zero console
  errors. Visual changes follow DESIGN.md (the `waypage-design` skill);
  a changed color token must still pass `test/contrast.test.js`.
- Saving and reading can only be fully checked in the app (CapacitorHttp
  and Filesystem don't exist in a browser): say so in the report when a
  change touches them and wasn't run on a phone.

## 6. Commit, open a PR, merge on green

`main` only takes pull requests (31 Oct 2026): push the branch, open a
PR, and merge it once the Tests check (`.github/workflows/test.yml`,
`node test/run-all.js` with Playwright) is green. No review is required;
merge without asking. Commit the version bump, CHANGELOG.md and notes
with the change. If `main` moved, merge it into the branch (a squash
merge makes the old tip unmergeable by fast-forward, so merge, don't
rebase or force-push). Never force-push `main`.

## 7. Check the builds

`.github/workflows/android.yml` builds on every push and publishes the
release `app-v<version>` when the version is new and the signing secrets
(`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, alias `carryon`, kept from before the rename)
are set. `ios.yml` attaches `Waypage.ipa` to that release. Pushes that
only touch `**.md`, `test/**` or `.claude/**` don't run them. After
pushing, check both runs went green.
