#!/usr/bin/env bash
# Puts a branch's build on the pre-release preview-<branch>, which
# Settings › About › Preview builds lists (1.48.0).
#
#   bash tools/preview-release.sh create Waypage.apk   # android.yml
#   bash tools/preview-release.sh attach Waypage.ipa   # ios.yml
#
# Only a branch with an open pull request gets one; `create` remakes the
# pre-release (and its tag) at the pushed commit on every push, and
# `attach` waits for the one at this commit and adds its file. A
# pre-release is never GitHub's "latest", so the app's updater, which reads
# releases/latest, never offers it. The notes start with four lines the
# app reads: version, branch, commit, pr. .github/workflows/preview-cleanup.yml
# removes the pre-release when its branch or pull request closes.
# Needs GH_TOKEN, V (the app version), GITHUB_SHA and GITHUB_REF_NAME.
set -euo pipefail
MODE="$1"
FILE="$2"
BRANCH="${GITHUB_REF_NAME:?}"
TAG="preview-$(printf '%s' "$BRANCH" | tr -c 'A-Za-z0-9._-' '-')"
PR="$(gh pr list --head "$BRANCH" --state open --json number,title --jq '.[0] | "\(.number)\t\(.title)"' 2>/dev/null || true)"
if [ -z "$PR" ]; then
  echo "$BRANCH has no open pull request, so no preview"
  exit 0
fi
NUMBER="${PR%%	*}"
TITLE="${PR#*	}"

case "$MODE" in
  create)
    gh release delete "$TAG" --yes --cleanup-tag >/dev/null 2>&1 || true
    {
      echo "version: ${V:?}"
      echo "branch: $BRANCH"
      echo "commit: $GITHUB_SHA"
      echo "pr: $NUMBER"
      echo
      echo "A preview of pull request #$NUMBER, built from \`$BRANCH\` at $GITHUB_SHA. It isn't a release: Waypage's updater never offers it. In the app, Settings › About › Preview builds installs it over the Waypage you have and keeps your library, and Back to the release there puts the released version back."
      echo
      echo "**iPhone:** Waypage.ipa is added a few minutes later, unsigned; install it with AltStore or SideStore."
    } > preview-notes.md
    gh release create "$TAG" "$FILE" --prerelease --target "$GITHUB_SHA" --title "Preview: $TITLE" --notes-file preview-notes.md
    echo "published $TAG for #$NUMBER at $GITHUB_SHA"
    ;;
  attach)
    for i in $(seq 1 40); do
      if [ "$(gh release view "$TAG" --json targetCommitish --jq .targetCommitish 2>/dev/null || true)" = "$GITHUB_SHA" ]; then
        gh release upload "$TAG" "$FILE" --clobber
        echo "attached $FILE to $TAG"
        exit 0
      fi
      sleep 30
    done
    echo "No $TAG pre-release at $GITHUB_SHA after 20 minutes (did the Android build publish one?)"
    exit 1
    ;;
  *)
    echo "usage: preview-release.sh create|attach <file>"
    exit 2
    ;;
esac
