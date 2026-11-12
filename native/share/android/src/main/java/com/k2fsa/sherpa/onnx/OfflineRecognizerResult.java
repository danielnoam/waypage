package com.k2fsa.sherpa.onnx;

/** What OfflineRecognizer heard; made by libsherpa-onnx-jni through this exact constructor (v1.13.7). */
public final class OfflineRecognizerResult {
    public final String text;
    public final String[] tokens;
    /** Each token's start, in seconds from the start of the audio; empty for models that don't say. */
    public final float[] timestamps;
    public final String lang, emotion, event;
    public final float[] durations;

    public OfflineRecognizerResult(String text, String[] tokens, float[] timestamps, String lang, String emotion, String event, float[] durations) {
        this.text = text == null ? "" : text;
        this.tokens = tokens == null ? new String[0] : tokens;
        this.timestamps = timestamps == null ? new float[0] : timestamps;
        this.lang = lang;
        this.emotion = emotion;
        this.event = event;
        this.durations = durations == null ? new float[0] : durations;
    }
}
