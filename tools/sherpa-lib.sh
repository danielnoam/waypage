#!/usr/bin/env bash
# Puts sherpa-onnx's library (the engine behind Kokoro voices, see
# native/share/android/.../Kokoro.java) into the Android build: the
# arm64 .so files from its release .aar, pinned to a version and checked
# against its SHA-256. Only arm64: other phones go without Kokoro rather
# than every APK growing by tens of MB. Not in git: it's a build input like
# node_modules. The Java classes in com/k2fsa/sherpa/onnx mirror this
# version's JNI; change both together.
set -euo pipefail

V=1.13.7
SHA=c4ef49e309f24fcee5c106b8a279481aaecaabb078cd37b2cd6e9a62cc8a73c8
OUT=native/share/android/src/main/jniLibs/arm64-v8a
TMP="${RUNNER_TEMP:-/tmp}/sherpa-onnx"

mkdir -p "$TMP" "$OUT"
curl -fsSL --retry 3 -o "$TMP/sherpa.aar" "https://github.com/k2-fsa/sherpa-onnx/releases/download/v$V/sherpa-onnx-$V.aar"
echo "$SHA  $TMP/sherpa.aar" | sha256sum -c -
unzip -o -j "$TMP/sherpa.aar" jni/arm64-v8a/libsherpa-onnx-jni.so jni/arm64-v8a/libonnxruntime.so -d "$OUT"
ls -la "$OUT"
