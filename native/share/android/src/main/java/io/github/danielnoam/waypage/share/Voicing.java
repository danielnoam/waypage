package io.github.danielnoam.waypage.share;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The narration saved as sound (Save the narration, app-listen.js): each piece
 * of a chapter spoken into a file by the phone's speech engine (any of
 * them, Kokoro and Piper too, through Android's synthesizeToFile), read
 * back as PCM and encoded into one AAC .m4a for the chapter, with where
 * each piece starts and ends in it. Runs on the caller's thread.
 */
final class Voicing {
    static volatile boolean stop;

    interface Step { void done(int n, int of); }

    static final class Out {
        File file;
        double dur;
        double[] t0, t1;
    }

    private static TextToSpeech tts;
    private static String ttsEngine;
    private static final Map<String, CountDownLatch> waits = new ConcurrentHashMap<>();
    private static final Map<String, Boolean> failed = new ConcurrentHashMap<>();
    private static int ids;

    private static final int BITRATE = 48000;
    private static final int[] AAC_RATES = {8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000};

    static synchronized void release() {
        if (tts != null) {
            try { tts.shutdown(); } catch (Exception e) { /* gone */ }
        }
        tts = null;
        ttsEngine = null;
    }

    private static TextToSpeech open(Context c, String engine) throws Exception {
        if (tts != null && engine.equals(ttsEngine)) return tts;
        release();
        final CountDownLatch ready = new CountDownLatch(1);
        final int[] status = {TextToSpeech.ERROR};
        TextToSpeech.OnInitListener done = (s) -> { status[0] = s; ready.countDown(); };
        TextToSpeech t = engine.isEmpty() ? new TextToSpeech(c, done) : new TextToSpeech(c, done, engine);
        if (!ready.await(30, TimeUnit.SECONDS) || status[0] != TextToSpeech.SUCCESS) {
            t.shutdown();
            throw new Exception("engine");
        }
        t.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { end(id, false); }
            @Override public void onError(String id) { end(id, true); }
            @Override public void onError(String id, int code) { end(id, true); }
            @Override public void onStop(String id, boolean interrupted) { end(id, true); }
        });
        tts = t;
        ttsEngine = engine;
        return t;
    }

    private static void end(String id, boolean bad) {
        if (bad) failed.put(id, true);
        CountDownLatch l = waits.remove(id);
        if (l != null) l.countDown();
    }

    private static void pick(TextToSpeech t, String voice, String lang) {
        t.setSpeechRate(1f);
        t.setPitch(1f);
        if (voice != null && !voice.isEmpty()) {
            try {
                for (Voice v : t.getVoices()) {
                    if (v.getName().equals(voice)) { t.setVoice(v); return; }
                }
            } catch (Exception e) { /* the language below */ }
        }
        t.setLanguage(lang != null && !lang.isEmpty() ? Locale.forLanguageTag(lang) : Locale.getDefault());
    }

    // blocks[i]: the paragraph piece i is in, for a longer pause between
    // paragraphs than between sentences.
    static Out render(Context c, String engine, String voice, String lang, String[] items, int[] blocks, File out, Step step) throws Exception {
        TextToSpeech t = open(c, engine == null ? "" : engine);
        pick(t, voice, lang);
        File wav = new File(c.getCacheDir(), "voicing.wav");
        Aac aac = null;
        Out o = new Out();
        o.file = out;
        o.t0 = new double[items.length];
        o.t1 = new double[items.length];
        try {
            for (int i = 0; i < items.length; i++) {
                if (stop) throw new Exception("stopped");
                short[] pcm = null;
                int rate = 0;
                String text = items[i] == null ? "" : items[i].trim();
                if (!text.isEmpty()) {
                    wav.delete();
                    String id = "v" + (++ids);
                    CountDownLatch l = new CountDownLatch(1);
                    waits.put(id, l);
                    failed.remove(id);
                    if (t.synthesizeToFile(text, new Bundle(), wav, id) == TextToSpeech.SUCCESS) {
                        long most = 60000 + text.length() * 200L;
                        boolean came = l.await(most, TimeUnit.MILLISECONDS);
                        if (!came) t.stop();
                        if (came && failed.remove(id) == null) {
                            int[] r = new int[1];
                            pcm = readWav(wav, r);
                            rate = r[0];
                        }
                    }
                    waits.remove(id);
                }
                if (pcm != null && pcm.length > 0 && rate > 0) {
                    if (aac == null) aac = new Aac(out, aacRate(rate));
                    if (rate != aac.rate) pcm = resample(pcm, rate, aac.rate);
                    if (i > 0) aac.silence(blocks != null && i < blocks.length && blocks[i] == blocks[i - 1] ? 0.12 : 0.45);
                    o.t0[i] = aac.seconds();
                    aac.write(pcm);
                    o.t1[i] = aac.seconds();
                } else {
                    double now = aac == null ? 0 : aac.seconds();
                    o.t0[i] = now;
                    o.t1[i] = now;
                }
                if (step != null) step.done(i + 1, items.length);
            }
            if (aac == null) throw new Exception("silent");
            aac.silence(0.6);
            o.dur = aac.seconds();
            aac.finish();
            aac = null;
            return o;
        } finally {
            if (aac != null) aac.abandon();
            wav.delete();
        }
    }

    private static int aacRate(int rate) {
        for (int r : AAC_RATES) if (r == rate) return r;
        return 24000;
    }

    private static short[] resample(short[] in, int from, int to) {
        int n = (int) ((long) in.length * to / from);
        short[] out = new short[n];
        for (int i = 0; i < n; i++) {
            double x = (double) i * from / to;
            int a = (int) x;
            int b = Math.min(in.length - 1, a + 1);
            double f = x - a;
            out[i] = (short) Math.round(in[Math.min(a, in.length - 1)] * (1 - f) + in[b] * f);
        }
        return out;
    }

    // A WAV file's sound as 16-bit mono, whatever it was written as
    // (16-bit, 8-bit, float; any number of channels). rate[0] is its rate.
    static short[] readWav(File f, int[] rate) throws Exception {
        try (RandomAccessFile in = new RandomAccessFile(f, "r")) {
            long len = in.length();
            if (len < 44) return null;
            byte[] head = new byte[12];
            in.readFully(head);
            if (head[0] != 'R' || head[1] != 'I' || head[2] != 'F' || head[3] != 'F') return null;
            int format = 1, channels = 1, bits = 16;
            long pos = 12;
            while (pos + 8 <= len) {
                in.seek(pos);
                byte[] ch = new byte[8];
                in.readFully(ch);
                String id = new String(ch, 0, 4, "US-ASCII");
                long size = ByteBuffer.wrap(ch, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt() & 0xffffffffL;
                if ("fmt ".equals(id)) {
                    byte[] fm = new byte[16];
                    in.readFully(fm);
                    ByteBuffer b = ByteBuffer.wrap(fm).order(ByteOrder.LITTLE_ENDIAN);
                    format = b.getShort(0) & 0xffff;
                    channels = Math.max(1, b.getShort(2));
                    rate[0] = b.getInt(4);
                    bits = b.getShort(14);
                } else if ("data".equals(id)) {
                    long left = len - pos - 8;
                    if (size == 0 || size > left) size = left;
                    if (size > Integer.MAX_VALUE) size = Integer.MAX_VALUE;
                    byte[] data = new byte[(int) size];
                    in.readFully(data);
                    return toMono(data, format, channels, bits);
                }
                pos += 8 + size + (size & 1);
            }
            return null;
        }
    }

    private static short[] toMono(byte[] data, int format, int channels, int bits) {
        int bytes = Math.max(1, bits / 8);
        int frames = data.length / (bytes * channels);
        short[] out = new short[frames];
        ByteBuffer b = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        for (int i = 0; i < frames; i++) {
            double sum = 0;
            for (int c = 0; c < channels; c++) {
                int at = (i * channels + c) * bytes;
                double v;
                if (format == 3 && bits == 32) v = b.getFloat(at) * 32767.0;
                else if (bits == 8) v = ((data[at] & 0xff) - 128) * 256.0;
                else if (bits == 24) v = ((data[at + 2] << 16) | ((data[at + 1] & 0xff) << 8) | (data[at] & 0xff)) / 256.0;
                else if (bits == 32) v = b.getInt(at) / 65536.0;
                else v = b.getShort(at);
                sum += v;
            }
            out[i] = (short) Math.max(-32768, Math.min(32767, Math.round(sum / channels)));
        }
        return out;
    }

    // One chapter's AAC-LC .m4a, mono, written as the sound comes.
    static final class Aac {
        final int rate;
        private final MediaCodec codec;
        private final MediaMuxer mux;
        private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        private final File file;
        private int track = -1;
        private boolean started;
        private long samples;

        Aac(File out, int rate) throws Exception {
            this.rate = rate;
            this.file = out;
            out.delete();
            MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, 1);
            f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
            f.setInteger(MediaFormat.KEY_BIT_RATE, BITRATE);
            f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);
            codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
            codec.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            codec.start();
            mux = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        }

        double seconds() { return samples / (double) rate; }

        void silence(double s) throws Exception { write(new short[(int) Math.round(s * rate)]); }

        void write(short[] pcm) throws Exception {
            int at = 0;
            while (at < pcm.length) {
                int in = codec.dequeueInputBuffer(10000);
                if (in < 0) { drain(false); continue; }
                ByteBuffer buf = codec.getInputBuffer(in);
                buf.clear();
                int n = Math.min(pcm.length - at, buf.remaining() / 2);
                buf.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(pcm, at, n);
                codec.queueInputBuffer(in, 0, n * 2, samples * 1000000L / rate, 0);
                samples += n;
                at += n;
                drain(false);
            }
        }

        void finish() throws Exception {
            for (;;) {
                int in = codec.dequeueInputBuffer(10000);
                if (in >= 0) {
                    codec.queueInputBuffer(in, 0, 0, samples * 1000000L / rate, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                    break;
                }
                drain(false);
            }
            drain(true);
            codec.stop();
            codec.release();
            if (started) mux.stop();
            mux.release();
        }

        void abandon() {
            try { codec.release(); } catch (Exception e) { /* gone */ }
            try { if (started) mux.stop(); } catch (Exception e) { /* gone */ }
            try { mux.release(); } catch (Exception e) { /* gone */ }
            file.delete();
        }

        private void drain(boolean end) {
            int waited = 0;
            for (;;) {
                int out = codec.dequeueOutputBuffer(info, end ? 10000 : 0);
                if (out == MediaCodec.INFO_TRY_AGAIN_LATER) { if (!end || ++waited > 300) return; continue; }
                if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    track = mux.addTrack(codec.getOutputFormat());
                    mux.start();
                    started = true;
                    continue;
                }
                if (out < 0) continue;
                ByteBuffer buf = codec.getOutputBuffer(out);
                boolean config = (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0;
                if (!config && info.size > 0 && started && buf != null) {
                    buf.position(info.offset);
                    buf.limit(info.offset + info.size);
                    mux.writeSampleData(track, buf, info);
                }
                codec.releaseOutputBuffer(out, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return;
            }
        }
    }
}
