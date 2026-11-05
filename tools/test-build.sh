#!/usr/bin/env bash
# Puts a branch's build on the pre-release test-<branch>, which
# Settings › About › Test builds lists (1.48.0).
#
#   bash tools/test-build.sh create Waypage.apk   # android.yml
#   bash tools/test-build.sh attach Waypage.ipa   # ios.yml
#
# Only an open pull request labelled test, test-android or
# test-ios gets one; `create` remakes the pre-release (and its tag)
# at the pushed commit on every push, and `attach` waits for the one at
# this commit and adds its file (or makes it, for test-ios alone). A
# pre-release is never GitHub's "latest", so the app's updater, which reads
# releases/latest, never offers it. The notes start with four lines the
# app reads: version, branch, commit, pr. .github/workflows/test-builds.yml
# builds it when the label goes on and removes it when the label comes
# off, the pull request closes or the branch goes.
# Needs GH_TOKEN, V (the app version), GITHUB_SHA, GITHUB_REF_NAME and
# GITHUB_REPOSITORY.
set -euo pipefail
MODE="$1"
FILE="$2"
BRANCH="${GITHUB_REF_NAME:?}"
TAG="test-$(printf '%s' "$BRANCH" | tr -c 'A-Za-z0-9._-' '-')"
PR="$(gh pr list --head "$BRANCH" --state open --json number,title,labels --jq '.[:1][] | "\(.number)\t\([.labels[].name] | join(","))\t\(.title)"' 2>/dev/null || true)"
if [ -z "$PR" ]; then
  echo "$BRANCH has no open pull request, so no test build"
  exit 0
fi
NUMBER="${PR%%	*}"
REST="${PR#*	}"
LABELS=",${REST%%	*},"
TITLE="${REST#*	}"
# Only a pull request labelled for it gets a test build (Daniel's ask,
# 1 Nov 2026): `test` for both, `test-android` for the APK alone,
# `test-ios` for the IPA alone, so a one-platform test build is ready
# sooner. Adding a label builds it (.github/workflows/test-builds.yml).
APK=false; IPA=false
case "$LABELS" in *,test,*|*,test-android,*) APK=true ;; esac
case "$LABELS" in *,test,*|*,test-ios,*) IPA=true ;; esac

publish() {
  gh release delete "$TAG" --yes --cleanup-tag >/dev/null 2>&1 || true
  {
    echo "version: ${V:?}"
    echo "branch: $BRANCH"
    echo "commit: $GITHUB_SHA"
    echo "pr: $NUMBER"
    echo
    echo "A test build of pull request #$NUMBER, built from \`$BRANCH\` at $GITHUB_SHA. It isn't a release: Waypage's updater never offers it. In the app, Settings › About › Test builds installs it over the Waypage you have and keeps your library, and Back to the release there puts the released version back."
    if [ "$APK" = true ] && [ "$IPA" = true ]; then
      echo
      echo "**iPhone:** Waypage.ipa is added a few minutes later, unsigned; install it with AltStore or SideStore."
    elif [ "$IPA" = true ]; then
      echo
      echo "**iPhone only:** Waypage.ipa is unsigned; install it with AltStore or SideStore."
    fi
  } > test-notes.md
  gh release create "$TAG" "$FILE" --prerelease --target "$GITHUB_SHA" --title "Test: $TITLE" --notes-file test-notes.md
  echo "published $TAG for #$NUMBER at $GITHUB_SHA"
}

case "$MODE" in
  create)
    if [ "$APK" != true ]; then echo "#$NUMBER isn't labelled test or test-android, so no APK test build"; exit 0; fi
    publish
    ;;
  attach)
    if [ "$IPA" != true ]; then echo "#$NUMBER isn't labelled test or test-ios, so no IPA test build"; exit 0; fi
    if [ "$APK" != true ]; then publish; exit 0; fi
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
    echo "usage: test-build.sh create|attach <file>"
    exit 2
    ;;
esac
