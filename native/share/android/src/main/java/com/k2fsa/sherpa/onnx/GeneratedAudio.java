package com.k2fsa.sherpa.onnx;

// sherpa-onnx's own class, mirrored in Java: libsherpa-onnx-jni builds it
// by this name and constructor ([FI)V.
public final class GeneratedAudio {
    public final float[] samples;
    public final int sampleRate;

    public GeneratedAudio(float[] samples, int sampleRate) {
        this.samples = samples;
        this.sampleRate = sampleRate;
    }
}
