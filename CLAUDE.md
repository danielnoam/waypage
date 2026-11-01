# Waypage

An offline reader: save a web page (a Wikipedia article, a news story) to
the phone, read it with no connection, on a plane, with a link back to the
original. Plain HTML, CSS and JS with **no build step and no
dependencies**, served as static files and wrapped by Capacitor for
Android and iOS. Started from LifeLog (danielnoam/lifelog), which it
borrows its stack, build workflows and native-fetch trick from.

## Before anything

- `git pull --ff-only` first.
- Read **CONTRIBUTING.md**. It holds the rules everyone working on
  Waypage follows: the decisions already made, the rules for every change
  (security, platforms, speed, design, UI words), keeping the notes files
  right, and how versions and releases work. Everything below is only
  what's specific to Claude sessions.

## Names

- **Waypage** (was Carry-on until 1.0.0, 6 Oct 2026). Store title
  "Waypage: Offline Reader". The repo was danielnoam/carry-on; GitHub
  redirects the old name. The signing key keeps its alias `carryon`.

## Design references

- Proposal doc: https://claude.ai/code/artifact/5c6cf847-cd85-4c91-a466-2da95fbde60b
  (copied into docs/PROPOSAL.md)
- Design canvas: https://claude.ai/artifact/5zi1VCs3WcLSTLJCw7iasC
  (its artboards are copied into design/, open them for the exact markup)
- The `waypage-design` skill applies DESIGN.md.

## Shipping

- Use the `release-checklist` skill for every change. It follows
  CONTRIBUTING.md's "Versions and releases".
- `main` is production and takes only pull requests. A merge refreshes
  the web copy; only a merge with a new `APP_VERSION` publishes the APK
  and IPA (`node tools/release.js x.y.z`). Daniel's own asks still ship
  as one release each; work landing in pieces goes under `## Unreleased`
  and the next release PR takes it. Check the runs went green.
- The to-do list is not in the repo. It lives only in the shared project
  folder, `/mnt/project-files/waypage/TODO.md`: read it there, and edit it
  there in the same turn as the change it tracks.

  ## Branch names

- Don't use the claude/... branch the session was handed. Before the
  first commit, make a branch named for the change: fix/<what>,
  feature/<what> or docs/<what>, a few lowercase words with hyphens
  (fix/drive-row, feature/kokoro-voices). Push only to that branch.
  A thread with an open PR keeps its branch.

