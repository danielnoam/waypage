---
name: release-checklist
description: Release checklist for Waypage (danielnoam/waypage): bump APP_VERSION in three places, add a CHANGELOG.md entry, update DROPPED.md, ARCHITECTURE.md's traps and the project's TODO, keep the vanilla app lean, run the tests, verify phone and desktop width, and push to main (which publishes the APK and IPA). Use before shipping any change.
---

# Waypage release checklist

Adapted from LifeLog's. Every change pushed to `main` leaves the version,
CHANGELOG.md and the notes files in step with it.

## 1. Decide whether this PR releases

A merge releases only if it bumps the version (CONTRIBUTING.md,
"Versions and releases"). A change that should reach phones on its own
(a fix, a small ask) bumps it; work landing in pieces, or that should go
out with someone else's change, doesn't: its CHANGELOG lines go under
`## Unreleased` and the next release PR takes them.

To bump: `node tools/release.js x.y.z` (new feature: minor, fix: patch,
saved-page format change: major; always above the latest release). It
changes `APP_VERSION` in `src/app.js`, every `?v=` in `index.html` and
`CACHE` in `sw.js`, and dates the `## Unreleased` entry. By hand it's
the same three places. A file added to or removed from `src/` goes in or
out of `sw.js`'s `ASSETS` too (that list is what goes into the apps;
`tools/build-www.js` fails if `index.html` loads a file it lacks).

## 2. CHANGELOG.md

`## [x.y.z] - YYYY-MM-DD`, newest first, `### Added` / `### Changed` /
`### Fixed` / `### Removed`, in plain user-facing words. A PR that
doesn't release writes its lines under `## Unreleased` at the top
instead (make the heading if it isn't there). The release workflow
copies the version's entry into the GitHub release notes.

## 3. Notes files (one home per entry)

- **TODO** (not in the repo; it lives at
  `/mnt/project-files/waypage/TODO.md`): remove what this change
  completes, add follow-ups.
- **README.md**: every feature, one short line under its section. Add or
  change the line for what this release adds, and retake that section's
  pictures with `node tools/shots.js <section>` (desktop and phone, into
  `docs/shots/`). A new area gets a section, a Contents line and a shot in
  `tools/shots.js`. Look at the new pictures before committing.
- **ARCHITECTURE.md**: a file added, removed or renamed, or a flow
  changed, is updated here in the same change (`test/docs.test.js`
  checks the file list).
- **Why**: in the commit message and PR body. A trap that would bite
  again or a new trade-off gets a line in ARCHITECTURE.md (Traps,
  Trade-offs). There is no NOTES.md.
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
