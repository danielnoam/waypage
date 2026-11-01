package com.k2fsa.sherpa.onnx;

/**
 * sherpa-onnx's offline text-to-speech (Kokoro voices, see
 * io.github.danielnoam.waypage.share.Kokoro), mirrored in Java from its
 * kotlin-api/Tts.kt at v1.13.7. libsherpa-onnx-jni reads the config
 * objects field by field by these exact names and types, so the fields
 * must match the library's version (sherpa-onnx/jni/offline-tts.cc);
 * the library is fetched by .github/workflows/android.yml at that
 * version.
 */
public final class OfflineTts {
    static {
        System.loadLibrary("sherpa-onnx-jni");
    }

    /** Return 1 to go on, 0 to stop. Called with each sentence's samples. */
    public interface Chunk {
        Integer invoke(float[] samples);
    }

    private long ptr;

    private OfflineTts(OfflineTtsConfig config) {
        ptr = newFromFile(config);
    }

    /** Kokoro from files on the phone; null when the library can't load them. */
    public static OfflineTts kokoro(String model, String voices, String tokens, String dataDir, String lexicon, int threads) {
        OfflineTtsConfig c = new OfflineTtsConfig();
        c.model.kokoro.model = model;
        c.model.kokoro.voices = voices;
        c.model.kokoro.tokens = tokens;
        c.model.kokoro.dataDir = dataDir;
        c.model.kokoro.lexicon = lexicon;
        c.model.numThreads = threads;
        OfflineTts t = new OfflineTts(c);
        return t.ptr == 0 ? null : t;
    }

    public int sampleRate() { return getSampleRate(ptr); }

    public int numSpeakers() { return getNumSpeakers(ptr); }

    public GeneratedAudio generate(String text, int sid, float speed, Chunk chunk) {
        return generateWithCallbackImpl(ptr, text, sid, speed, chunk);
    }

    public synchronized void free() {
        if (ptr != 0) {
            delete(ptr);
            ptr = 0;
        }
    }

    private native long newFromFile(OfflineTtsConfig config);
    private native void delete(long ptr);
    private native int getSampleRate(long ptr);
    private native int getNumSpeakers(long ptr);
    private native GeneratedAudio generateWithCallbackImpl(long ptr, String text, int sid, float speed, Object callback);
}

final class OfflineTtsVitsModelConfig {
    String model = "", lexicon = "", tokens = "", dataDir = "", dictDir = "";
    float noiseScale = 0.667f, noiseScaleW = 0.8f, lengthScale = 1.0f;
}

final class OfflineTtsMatchaModelConfig {
    String acousticModel = "", vocoder = "", lexicon = "", tokens = "", dataDir = "", dictDir = "";
    float noiseScale = 1.0f, lengthScale = 1.0f;
}

final class OfflineTtsKokoroModelConfig {
    String model = "", voices = "", tokens = "", dataDir = "", lexicon = "", lang = "", dictDir = "";
    float lengthScale = 1.0f;
}

final class OfflineTtsZipVoiceModelConfig {
    String tokens = "", encoder = "", decoder = "", vocoder = "", dataDir = "", lexicon = "";
    float featScale = 0.1f, tShift = 0.5f, targetRms = 0.1f, guidanceScale = 1.0f;
}

final class OfflineTtsKittenModelConfig {
    String model = "", voices = "", tokens = "", dataDir = "";
    float lengthScale = 1.0f;
}

final class OfflineTtsPocketModelConfig {
    String lmFlow = "", lmMain = "", encoder = "", decoder = "", textConditioner = "", vocabJson = "", tokenScoresJson = "";
    int voiceEmbeddingCacheCapacity = 50;
}

final class OfflineTtsSupertonicModelConfig {
    String durationPredictor = "", textEncoder = "", vectorEstimator = "", vocoder = "", ttsJson = "", unicodeIndexer = "", voiceStyle = "";
}

final class OfflineTtsModelConfig {
    OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
    OfflineTtsMatchaModelConfig matcha = new OfflineTtsMatchaModelConfig();
    OfflineTtsKokoroModelConfig kokoro = new OfflineTtsKokoroModelConfig();
    OfflineTtsZipVoiceModelConfig zipvoice = new OfflineTtsZipVoiceModelConfig();
    OfflineTtsKittenModelConfig kitten = new OfflineTtsKittenModelConfig();
    OfflineTtsPocketModelConfig pocket = new OfflineTtsPocketModelConfig();
    OfflineTtsSupertonicModelConfig supertonic = new OfflineTtsSupertonicModelConfig();
    int numThreads = 1;
    boolean debug = false;
    String provider = "cpu";
}

final class OfflineTtsConfig {
    OfflineTtsModelConfig model = new OfflineTtsModelConfig();
    String ruleFsts = "", ruleFars = "";
    int maxNumSentences = 1;
    float silenceScale = 0.2f;
}
