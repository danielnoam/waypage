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
- After changing TODO.md or DONE.md in the repo, copy it over the shared
  project folder's `waypage/TODO.md` / `waypage/DONE.md` so both match.

## Working with Daniel (his standing rules, 17 Oct 2026)

These are on top of CONTRIBUTING.md, for Claude sessions only.

- **Merge to main without asking** once the checks are green. Don't ask
  "shall I merge".
- **When he says "don't build yet" or "fixes only",** commit locally and
  don't push (a branch push builds too) until he says build.
- **Small asks he lists without "add to TODO", build now.**
- **Several asks go out as one release,** or two at most when grouped;
  don't split them into many.
- **App stores aren't a priority.** Don't bring up store prep.
- **After shipping,** say in a line or two what to try on the phone,
  above all anything native that couldn't be tested here.
- **Be direct.** Push back when an idea or plan is weak, and say what
  was checked and what is a guess.
