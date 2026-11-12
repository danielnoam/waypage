package com.k2fsa.sherpa.onnx;

/**
 * sherpa-onnx's offline speech recognition (audiobook transcripts, see
 * io.github.danielnoam.waypage.share.Listen), mirrored in Java from its
 * kotlin-api/OfflineRecognizer.kt, FeatureConfig.kt, OfflineStream.kt and
 * HomophoneReplacerConfig.kt at v1.13.7. libsherpa-onnx-jni reads the
 * config objects field by field by these exact names and types
 * (sherpa-onnx/jni/offline-recognizer.cc), and builds the result through
 * OfflineRecognizerResult's constructor, so both must match the library's
 * version (tools/sherpa-lib.sh). Every object field must be set: the
 * library reads each one.
 */
public final class OfflineRecognizer {
    static {
        System.loadLibrary("sherpa-onnx-jni");
    }

    private long ptr;

    private OfflineRecognizer(OfflineRecognizerConfig config) {
        ptr = newFromFile(config);
    }

    private static OfflineRecognizer make(OfflineRecognizerConfig c) {
        OfflineRecognizer r = new OfflineRecognizer(c);
        return r.ptr == 0 ? null : r;
    }

    /** A NeMo transducer (Parakeet TDT): words with their times, punctuation and capitals. */
    public static OfflineRecognizer nemoTransducer(String encoder, String decoder, String joiner, String tokens, int threads) {
        OfflineRecognizerConfig c = new OfflineRecognizerConfig();
        c.modelConfig.transducer.encoder = encoder;
        c.modelConfig.transducer.decoder = decoder;
        c.modelConfig.transducer.joiner = joiner;
        c.modelConfig.tokens = tokens;
        c.modelConfig.modelType = "nemo_transducer";
        c.modelConfig.numThreads = threads;
        return make(c);
    }

    /** Moonshine v1 (four models). */
    public static OfflineRecognizer moonshine(String preprocessor, String encoder, String uncached, String cached, String tokens, int threads) {
        OfflineRecognizerConfig c = new OfflineRecognizerConfig();
        c.modelConfig.moonshine.preprocessor = preprocessor;
        c.modelConfig.moonshine.encoder = encoder;
        c.modelConfig.moonshine.uncachedDecoder = uncached;
        c.modelConfig.moonshine.cachedDecoder = cached;
        c.modelConfig.tokens = tokens;
        c.modelConfig.numThreads = threads;
        return make(c);
    }

    /** Whisper; `language` "" lets it guess (multilingual models). */
    public static OfflineRecognizer whisper(String encoder, String decoder, String tokens, String language, int threads) {
        OfflineRecognizerConfig c = new OfflineRecognizerConfig();
        c.modelConfig.whisper.encoder = encoder;
        c.modelConfig.whisper.decoder = decoder;
        c.modelConfig.whisper.language = language == null ? "" : language;
        c.modelConfig.tokens = tokens;
        c.modelConfig.numThreads = threads;
        return make(c);
    }

    /** One stretch of audio, 16 kHz mono, -1..1. */
    public OfflineRecognizerResult recognize(float[] samples, int sampleRate) {
        long s = createStream(ptr);
        if (s == 0) return null;
        try {
            acceptWaveform(s, samples, sampleRate);
            decode(ptr, s);
            return getResult(s);
        } finally {
            deleteStream(s);
        }
    }

    public synchronized void free() {
        if (ptr != 0) {
            delete(ptr);
            ptr = 0;
        }
    }

    private native void delete(long ptr);
    private native long newFromFile(OfflineRecognizerConfig config);
    private native long createStream(long ptr);
    private native void decode(long ptr, long streamPtr);
    private native OfflineRecognizerResult getResult(long streamPtr);

    // OfflineStream's own native methods, called on a stream's pointer.
    private static void acceptWaveform(long stream, float[] samples, int sampleRate) { OfflineStream.accept(stream, samples, sampleRate); }
    private static void deleteStream(long stream) { OfflineStream.free(stream); }
}

final class OfflineStream {
    static {
        System.loadLibrary("sherpa-onnx-jni");
    }

    private static final OfflineStream ONE = new OfflineStream();

    static void accept(long ptr, float[] samples, int sampleRate) { ONE.acceptWaveform(ptr, samples, sampleRate); }
    static void free(long ptr) { ONE.delete(ptr); }

    private native void acceptWaveform(long ptr, float[] samples, int sampleRate);
    private native void delete(long ptr);
}

final class FeatureConfig {
    int sampleRate = 16000;
    int featureDim = 80;
    float dither = 0.0f;
}

final class QnnConfig {
    String backendLib = "", contextBinary = "", systemLib = "";
}

final class HomophoneReplacerConfig {
    String dictDir = "", lexicon = "", ruleFsts = "";
}

final class OfflineTransducerModelConfig {
    String encoder = "", decoder = "", joiner = "";
    QnnConfig qnnConfig = new QnnConfig();
}

final class OfflineParaformerModelConfig {
    String model = "";
    QnnConfig qnnConfig = new QnnConfig();
}

final class OfflineNemoEncDecCtcModelConfig { String model = ""; }
final class OfflineDolphinModelConfig { String model = ""; }
final class OfflineWenetCtcModelConfig { String model = ""; }
final class OfflineOmnilingualAsrCtcModelConfig { String model = ""; }
final class OfflineMedAsrCtcModelConfig { String model = ""; }
final class OfflineFireRedAsrCtcModelConfig { String model = ""; }

final class OfflineZipformerCtcModelConfig {
    String model = "";
    QnnConfig qnnConfig = new QnnConfig();
}

final class OfflineFunAsrNanoModelConfig {
    String encoderAdaptor = "", llm = "", embedding = "", tokenizer = "";
    String systemPrompt = "You are a helpful assistant.", userPrompt = "语音转写：";
    int maxNewTokens = 512;
    float temperature = 1e-6f, topP = 0.8f;
    int seed = 42;
    String language = "";
    boolean itn = true;
    String hotwords = "";
}

final class OfflineQwen3AsrModelConfig {
    String convFrontend = "", encoder = "", decoder = "", tokenizer = "";
    int maxTotalLen = 512, maxNewTokens = 128;
    float temperature = 1e-6f, topP = 0.8f;
    int seed = 42;
    String hotwords = "";
}

final class OfflineWhisperModelConfig {
    String encoder = "", decoder = "", language = "en", task = "transcribe";
    int tailPaddings = 1000;
    boolean enableTokenTimestamps = false, enableSegmentTimestamps = false;
}

final class OfflineCanaryModelConfig {
    String encoder = "", decoder = "", srcLang = "en", tgtLang = "en";
    boolean usePnc = true;
}

final class OfflineCohereTranscribeModelConfig {
    String encoder = "", decoder = "", language = "";
    boolean usePunct = true, useItn = true;
}

final class OfflineFireRedAsrModelConfig { String encoder = "", decoder = ""; }

final class OfflineMoonshineModelConfig {
    String preprocessor = "", encoder = "", uncachedDecoder = "", cachedDecoder = "", mergedDecoder = "";
}

final class OfflineSenseVoiceModelConfig {
    String model = "", language = "";
    boolean useInverseTextNormalization = true;
    QnnConfig qnnConfig = new QnnConfig();
}

final class OfflineModelConfig {
    OfflineTransducerModelConfig transducer = new OfflineTransducerModelConfig();
    OfflineParaformerModelConfig paraformer = new OfflineParaformerModelConfig();
    OfflineWhisperModelConfig whisper = new OfflineWhisperModelConfig();
    OfflineFireRedAsrModelConfig fireRedAsr = new OfflineFireRedAsrModelConfig();
    OfflineMoonshineModelConfig moonshine = new OfflineMoonshineModelConfig();
    OfflineNemoEncDecCtcModelConfig nemo = new OfflineNemoEncDecCtcModelConfig();
    OfflineSenseVoiceModelConfig senseVoice = new OfflineSenseVoiceModelConfig();
    OfflineDolphinModelConfig dolphin = new OfflineDolphinModelConfig();
    OfflineZipformerCtcModelConfig zipformerCtc = new OfflineZipformerCtcModelConfig();
    OfflineWenetCtcModelConfig wenetCtc = new OfflineWenetCtcModelConfig();
    OfflineOmnilingualAsrCtcModelConfig omnilingual = new OfflineOmnilingualAsrCtcModelConfig();
    OfflineMedAsrCtcModelConfig medasr = new OfflineMedAsrCtcModelConfig();
    OfflineFunAsrNanoModelConfig funasrNano = new OfflineFunAsrNanoModelConfig();
    OfflineQwen3AsrModelConfig qwen3Asr = new OfflineQwen3AsrModelConfig();
    OfflineFireRedAsrCtcModelConfig fireRedAsrCtc = new OfflineFireRedAsrCtcModelConfig();
    OfflineCanaryModelConfig canary = new OfflineCanaryModelConfig();
    OfflineCohereTranscribeModelConfig cohereTranscribe = new OfflineCohereTranscribeModelConfig();
    String teleSpeech = "";
    int numThreads = 1;
    boolean debug = false;
    String provider = "cpu", modelType = "", tokens = "", modelingUnit = "", bpeVocab = "";
}

final class OfflineRecognizerConfig {
    FeatureConfig featConfig = new FeatureConfig();
    OfflineModelConfig modelConfig = new OfflineModelConfig();
    HomophoneReplacerConfig hr = new HomophoneReplacerConfig();
    String decodingMethod = "greedy_search";
    int maxActivePaths = 4;
    String hotwordsFile = "";
    float hotwordsScore = 1.5f;
    String ruleFsts = "", ruleFars = "";
    float blankPenalty = 0.0f;
}
