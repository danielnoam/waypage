#!/usr/bin/env bash
# Puts sherpa-onnx (the engine behind Kokoro and Piper voices, see
# native/share/ios/Sources/KokoroPlugin) into the iOS build: its static
# xcframework and onnxruntime's, from its release's iOS archive, pinned to a
# version and checked against its SHA-256, plus a module map so Swift can
# call its C API. Not in git: a build input like node_modules. Without it
# the app still builds, with no Kokoro (KokoroPlugin says unsupported).
#
# The iOS archive lags Android's: v1.13.5 on have none, so this is the
# newest there is. The models are the same files on both.
set -euo pipefail

V=1.13.4
SHA=596f33bff80046a52144745745fe54d55e8b23659d92209f5ab7d94c1259fe6d
OUT=native/share/ios/Frameworks
TMP="${RUNNER_TEMP:-/tmp}/sherpa-onnx-ios"

rm -rf "$TMP" "$OUT"
mkdir -p "$TMP" "$OUT/include"
curl -fsSL --retry 3 -o "$TMP/ios.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$V/sherpa-onnx-v$V-ios.tar.bz2"
echo "$SHA  $TMP/ios.tar.bz2" | (sha256sum -c - 2>/dev/null || shasum -a 256 -c -)
tar xjf "$TMP/ios.tar.bz2" -C "$TMP"
cp -R "$TMP/build-ios/sherpa-onnx.xcframework" "$OUT/"
# onnxruntime.xcframework is a link to its versioned folder.
cp -RL "$TMP/build-ios/ios-onnxruntime/onnxruntime.xcframework" "$OUT/"
cp "$TMP/build-ios/sherpa-onnx.xcframework/ios-arm64/Headers/sherpa-onnx/c-api/c-api.h" "$OUT/include/"
cat > "$OUT/include/module.modulemap" <<'MAP'
module SherpaOnnxC {
  header "c-api.h"
  link "c++"
  export *
}
MAP
du -sh "$OUT"/*
