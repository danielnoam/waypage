package io.github.danielnoam.waypage.share;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerResult;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

/**
 * Audiobook transcripts on the phone (src/app-listen.js): sherpa-onnx's
 * speech recognition, the same library as Kokoro's voices, run on the
 * book's own sound a few minutes ahead of where it's playing. The models
 * are downloads, like Kokoro's: one archive each from sherpa-onnx's GitHub
 * release, checked against its SHA-256 before it's unpacked, kept in
 * files/listen/<id>. Nothing is sent anywhere.
 *
 * A stretch of a part is decoded by Android's own MediaCodec (MP3, AAC in
 * M4B/M4A, Ogg, FLAC, WAV), mixed down to one channel at 16 kHz, cut into
 * pieces of up to 20 s at their quietest moment between 8 and 20 s (a
 * narrator's breath), and each piece is recognised on its own.
 */
final class Listen {
    static final String BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/";
    static final int RATE = 16000;

    /** One download: a speech model. kind "nemo", "moonshine" or "whisper". */
    static final class Pack {
        final String id, title, note, kind, file, sha256;
        final long bytes;
        final String[] langs;
        Pack(String id, String title, String note, String kind, String file, String sha256, long bytes, String[] langs) {
            this.id = id; this.title = title; this.note = note; this.kind = kind; this.file = file; this.sha256 = sha256;
            this.bytes = bytes; this.langs = langs;
        }
    }

    private static final String[] EUROPE = {"en", "bg", "hr", "cs", "da", "nl", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk"};
    static final Pack[] PACKS = {
        new Pack("fast", "Fast", "English · Moonshine · keeps well ahead, easy on the battery", "moonshine",
            "sherpa-onnx-moonshine-tiny-en-int8.tar.bz2", "d5fe6ec4334fef36255b2a4010412cad4c007e33103fec62fb5d17cad88086f2", 107_600_538L, new String[] {"en"}),
        new Pack("better", "Better", "English and 24 European languages · Parakeet · punctuation and capitals", "nemo",
            "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2", "1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9", 487_211_443L, EUROPE),
        new Pack("most", "Most languages", "99 languages, Hebrew too · Whisper · slowest", "whisper",
            "sherpa-onnx-whisper-small.tar.bz2", "486a46afbb7ba798507190ffe02fea2dd726049af212e774537efac6afb210a6", 639_387_718L, new String[] {"*"}),
    };

    static Pack pack(String id) {
        for (Pack p : PACKS) if (p.id.equals(id)) return p;
        return null;
    }

    private static final String PREFS = "waypage.listen";
    private static OfflineRecognizer rec;
    private static String loaded = "", loadedLang = "";
    static volatile String step = "";
    static volatile long done, total;
    static volatile boolean stop;

    private Listen() {}

    static boolean supported() { return Kokoro.supported(); }

    private static File root(Context c) { return new File(c.getFilesDir(), "listen"); }
    static File dir(Context c, Pack p) { return new File(root(c), p.id); }

    static boolean ready(Context c, Pack p) {
        File d = dir(c, p);
        return tokens(d) != null && find(d, "encode") != null;
    }

    private static File tokens(File d) {
        File[] all = d.listFiles((f, n) -> n.endsWith("tokens.txt"));
        return all == null || all.length == 0 ? null : all[0];
    }

    // The model file whose name has `part` in it, int8 first.
    private static File find(File d, String part) {
        File[] all = d.listFiles((f, n) -> n.endsWith(".onnx") && n.contains(part));
        if (all == null || all.length == 0) return null;
        for (File f : all) if (f.getName().contains("int8")) return f;
        return all[0];
    }

    private static File findExact(File d, String start) {
        File[] all = d.listFiles((f, n) -> n.endsWith(".onnx") && n.startsWith(start));
        if (all == null || all.length == 0) return null;
        for (File f : all) if (f.getName().contains("int8")) return f;
        return all[0];
    }

    static long size(Context c, Pack p) { return sizeOf(dir(c, p)); }

    private static long sizeOf(File f) {
        if (f.isFile()) return f.length();
        long n = 0;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) n += sizeOf(k);
        return n;
    }

    /** Loaded once and kept; a Whisper model is made again for another language. */
    static synchronized OfflineRecognizer get(Context c, Pack p, String lang) {
        if (p == null || !supported() || !ready(c, p)) return null;
        String l = "whisper".equals(p.kind) ? (lang == null ? "" : lang) : "";
        if (rec != null && loaded.equals(p.id) && loadedLang.equals(l)) return rec;
        release();
        File d = dir(c, p);
        int threads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2));
        String tok = tokens(d).getAbsolutePath();
        try {
            if ("nemo".equals(p.kind)) {
                rec = OfflineRecognizer.nemoTransducer(find(d, "encoder").getAbsolutePath(), find(d, "decoder").getAbsolutePath(),
                    find(d, "joiner").getAbsolutePath(), tok, threads);
            } else if ("moonshine".equals(p.kind)) {
                rec = OfflineRecognizer.moonshine(findExact(d, "preprocess").getAbsolutePath(), findExact(d, "encode").getAbsolutePath(),
                    findExact(d, "uncached_decode").getAbsolutePath(), findExact(d, "cached_decode").getAbsolutePath(), tok, threads);
            } else {
                rec = OfflineRecognizer.whisper(find(d, "encoder").getAbsolutePath(), find(d, "decoder").getAbsolutePath(), tok, l, threads);
            }
            if (rec != null) { loaded = p.id; loadedLang = l; }
        } catch (Throwable e) {
            rec = null;
        }
        return rec;
    }

    static synchronized void release() {
        if (rec != null) rec.free();
        rec = null;
        loaded = "";
        loadedLang = "";
    }

    /** Why not to work now: "battery" (low and not charging), "hot", or "". */
    static String holdOff(Context c) {
        try {
            Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b != null) {
                int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1), scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                int plugged = b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0);
                if (plugged == 0 && level >= 0 && scale > 0 && level * 100 / scale < 20) return "battery";
            }
            if (Build.VERSION.SDK_INT >= 29) {
                PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                if (pm != null && pm.getCurrentThermalStatus() >= PowerManager.THERMAL_STATUS_SEVERE) return "hot";
            }
        } catch (Exception e) { /* go on */ }
        return "";
    }

    static boolean charging(Context c) {
        try {
            Intent b = c.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            return b != null && b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
        } catch (Exception e) { return false; }
    }

    // ---- The sound: a stretch of a part as 16 kHz mono samples.

    static final class Source {
        String uri;
        long offset = -1, length = -1;
    }

    /** Samples from `fromMs` to `toMs` (or the end); null when the file can't be read. */
    static float[] decode(Context c, Source s, long fromMs, long toMs) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        ParcelFileDescriptor fd = null;
        MediaCodec codec = null;
        try {
            Uri u = Uri.parse(s.uri);
            if (s.offset >= 0 && s.length > 0) {
                fd = c.getContentResolver().openFileDescriptor(u, "r");
                ex.setDataSource(fd.getFileDescriptor(), s.offset, s.length);
            } else if ("file".equals(u.getScheme())) ex.setDataSource(u.getPath());
            else ex.setDataSource(c, u, null);
            int track = -1;
            MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat f = ex.getTrackFormat(i);
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) { track = i; fmt = f; break; }
            }
            if (track < 0) return null;
            ex.selectTrack(track);
            long fromUs = fromMs * 1000, toUs = toMs > 0 ? toMs * 1000 : Long.MAX_VALUE;
            ex.seekTo(fromUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
            codec.configure(fmt, null, null, 0);
            codec.start();
            int inRate = fmt.containsKey(MediaFormat.KEY_SAMPLE_RATE) ? fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE) : 44100;
            int channels = fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;
            Resampler rs = new Resampler(inRate);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inDone = false, outDone = false;
            while (!outDone) {
                if (stop) return null;
                if (!inDone) {
                    int ix = codec.dequeueInputBuffer(10000);
                    if (ix >= 0) {
                        ByteBuffer buf = codec.getInputBuffer(ix);
                        int n = buf == null ? -1 : ex.readSampleData(buf, 0);
                        if (n < 0 || ex.getSampleTime() > toUs + 200000) {
                            codec.queueInputBuffer(ix, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inDone = true;
                        } else {
                            codec.queueInputBuffer(ix, 0, n, ex.getSampleTime(), 0);
                            ex.advance();
                        }
                    }
                }
                int ox = codec.dequeueOutputBuffer(info, 10000);
                if (ox == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat of = codec.getOutputFormat();
                    if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) { inRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE); rs.setRate(inRate); }
                    if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                } else if (ox >= 0) {
                    ByteBuffer out = codec.getOutputBuffer(ox);
                    if (out != null && info.size > 0) {
                        long t = info.presentationTimeUs;
                        out.position(info.offset);
                        out.limit(info.offset + info.size);
                        java.nio.ShortBuffer sb = out.order(ByteOrder.nativeOrder()).asShortBuffer();
                        int frames = sb.remaining() / Math.max(1, channels);
                        // Frames before the stretch's start (from the sync point before it) are dropped.
                        long skip = t < fromUs ? Math.min(frames, (fromUs - t) * inRate / 1000000) : 0;
                        long keep = t + (long) frames * 1000000 / inRate > toUs ? Math.max(0, (toUs - t) * inRate / 1000000) : frames;
                        for (int f = (int) skip; f < Math.min(frames, keep); f++) {
                            int sum = 0;
                            for (int ch = 0; ch < channels; ch++) sum += sb.get(f * channels + ch);
                            rs.add(sum / (float) channels / 32768f);
                        }
                        if (t > toUs) outDone = true;
                    }
                    codec.releaseOutputBuffer(ox, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outDone = true;
                }
            }
            return rs.samples();
        } finally {
            if (codec != null) { try { codec.stop(); } catch (Exception e) { /* gone */ } codec.release(); }
            ex.release();
            if (fd != null) { try { fd.close(); } catch (Exception e) { /* gone */ } }
        }
    }

    // Down to 16 kHz: each output sample the average of the input samples it covers.
    static final class Resampler {
        private double step, at;
        private float sum;
        private int n;
        private float[] out = new float[RATE * 60];
        private int len;
        Resampler(int rate) { setRate(rate); }
        void setRate(int rate) { step = (double) RATE / Math.max(1, rate); }
        private float last;
        void add(float v) {
            sum += v;
            n++;
            at += step;
            while (at >= 1) {
                at -= 1;
                if (n > 0) { last = sum / n; sum = 0; n = 0; }
                if (len == out.length) out = java.util.Arrays.copyOf(out, out.length * 2);
                out[len++] = last;
            }
        }
        float[] samples() { return java.util.Arrays.copyOf(out, len); }
    }

    // ---- Recognition.

    static final class Piece {
        double t0, t1, quiet;
        String text = "";
        List<String> words = new ArrayList<>();
        List<Double> times = new ArrayList<>();
    }

    private static final int WIN = 20 * RATE, MIN_WIN = 8 * RATE, FRAME = RATE / 50;

    /** The stretch's pieces, each with its words and, where the model gives them, their times (seconds from the stretch's `fromSec`). */
    static List<Piece> recognize(OfflineRecognizer r, float[] all, double fromSec, java.util.function.Consumer<Piece> each) {
        List<Piece> out = new ArrayList<>();
        int at = 0;
        double quietBefore = 0;
        while (at < all.length) {
            if (stop) break;
            int end = Math.min(all.length, at + WIN);
            double quietAfter = 0;
            if (end < all.length) {
                // The quietest 20 ms frame between 8 and 20 s in.
                int best = end;
                double low = Double.MAX_VALUE;
                for (int f = at + MIN_WIN; f + FRAME <= end; f += FRAME) {
                    double e = 0;
                    for (int i = f; i < f + FRAME; i++) e += all[i] * all[i];
                    if (e < low) { low = e; best = f + FRAME / 2; }
                }
                end = best;
                quietAfter = quietRun(all, end);
            }
            float[] win = java.util.Arrays.copyOfRange(all, at, end);
            Piece p = new Piece();
            p.t0 = fromSec + at / (double) RATE;
            p.t1 = fromSec + end / (double) RATE;
            p.quiet = quietBefore;
            if (loud(win)) {
                OfflineRecognizerResult res = r.recognize(win, RATE);
                if (res != null) fill(p, res);
            }
            if (!p.text.isEmpty()) { out.add(p); if (each != null) each.accept(p); }
            quietBefore = quietAfter;
            at = end;
        }
        return out;
    }

    // How long the near-silence around a point lasts, in seconds.
    private static double quietRun(float[] all, int mid) {
        double floor = 0.004;
        int a = mid, b = mid;
        while (a - FRAME > 0 && rms(all, a - FRAME, a) < floor) a -= FRAME;
        while (b + FRAME < all.length && rms(all, b, b + FRAME) < floor) b += FRAME;
        return (b - a) / (double) RATE;
    }

    private static double rms(float[] s, int a, int b) {
        double e = 0;
        for (int i = a; i < b; i++) e += s[i] * s[i];
        return Math.sqrt(e / Math.max(1, b - a));
    }

    private static boolean loud(float[] s) { return s.length > RATE / 4 && rms(s, 0, s.length) > 0.003; }

    // Words from the model's tokens: a token starting with ▁ or a space
    // starts a word. Without times the app spreads the piece's time over them.
    private static void fill(Piece p, OfflineRecognizerResult res) {
        p.text = res.text.trim();
        boolean timed = res.timestamps.length == res.tokens.length && res.tokens.length > 0;
        StringBuilder w = null;
        for (int i = 0; i < res.tokens.length; i++) {
            String t = res.tokens[i];
            boolean starts = t.startsWith("▁") || t.startsWith(" ") || w == null;
            String bare = t.replace("▁", " ");
            if (starts) {
                if (w != null && w.toString().trim().length() > 0) p.words.add(w.toString().trim());
                w = new StringBuilder(bare.trim());
                if (timed) p.times.add(p.t0 + res.timestamps[i]);
            } else w.append(bare);
        }
        if (w != null && w.toString().trim().length() > 0) p.words.add(w.toString().trim());
        if (!timed || p.times.size() != p.words.size()) { p.times.clear(); p.words.clear(); }
    }

    // ---- The downloads, as Kokoro's: Android's DownloadManager, then checked and unpacked here.

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static File archive(Context c) {
        File base = c.getExternalFilesDir(null);
        return new File(base != null ? base : c.getFilesDir(), "listen.tar.bz2");
    }

    static long downloadId(Context c) { return prefs(c).getLong("id", -1); }
    static Pack downloading(Context c) { return pack(prefs(c).getString("pack", "")); }

    static void start(Context c, Pack p) {
        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        cancel(c);
        File a = archive(c);
        a.delete();
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(BASE + p.file))
            .setTitle("Transcripts: " + p.title)
            .setDescription("For audiobooks")
            .setDestinationUri(Uri.fromFile(a))
            .setAllowedOverMetered(false)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        prefs(c).edit().putLong("id", dm.enqueue(r)).putString("pack", p.id).apply();
        step = "downloading";
        done = 0;
        total = p.bytes;
    }

    static void cancel(Context c) {
        long id = downloadId(c);
        if (id >= 0) ((DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
        prefs(c).edit().remove("id").remove("pack").apply();
        archive(c).delete();
        if ("downloading".equals(step)) step = "";
    }

    static String poll(Context c) {
        long id = downloadId(c);
        Pack p = downloading(c);
        if (id < 0 || p == null) return "";
        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor q = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (q == null || !q.moveToFirst()) { cancel(c); return "failed"; }
            int status = q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            done = q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long t = q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            total = t > 0 ? t : p.bytes;
            if (status == DownloadManager.STATUS_SUCCESSFUL) return "downloaded";
            if (status == DownloadManager.STATUS_FAILED) { cancel(c); return "failed"; }
            if (status == DownloadManager.STATUS_PAUSED) return "waiting";
            return "downloading";
        }
    }

    /** Checks the archive and unpacks it. False when it isn't the one expected. */
    static boolean unpack(Context c) throws Exception {
        Pack p = downloading(c);
        File a = archive(c);
        if (p == null) return false;
        step = "checking";
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(a)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
        if (!p.sha256.equals(hex.toString())) {
            cancel(c);
            return false;
        }
        step = "unpacking";
        File tmp = new File(c.getFilesDir(), "listen.part");
        delete(tmp);
        tmp.mkdirs();
        String rootPath = tmp.getCanonicalPath() + File.separator;
        done = 0;
        total = a.length();
        try (FileInputStream raw = new FileInputStream(a);
             TarArchiveInputStream tar = new TarArchiveInputStream(new BZip2CompressorInputStream(new BufferedInputStream(raw, 1 << 16)))) {
            TarArchiveEntry e;
            byte[] buf = new byte[1 << 16];
            while ((e = tar.getNextEntry()) != null) {
                String name = e.getName();
                int slash = name.indexOf('/');
                name = slash >= 0 ? name.substring(slash + 1) : name;
                if (name.isEmpty() || e.isSymbolicLink() || e.isLink() || e.isDirectory()) continue;
                // Only the model's top folder: no test sounds; and a
                // Whisper archive's full-size models are left out for its int8 ones.
                if (name.contains("/") || !(name.endsWith(".onnx") || name.endsWith("tokens.txt"))) continue;
                if ("whisper".equals(p.kind) && name.endsWith(".onnx") && !name.contains("int8")) continue;
                File out = new File(tmp, name);
                if (!out.getCanonicalPath().startsWith(rootPath)) continue;
                try (OutputStream o = new FileOutputStream(out)) {
                    int n;
                    while ((n = tar.read(buf)) > 0) o.write(buf, 0, n);
                }
                done = raw.getChannel().position();
            }
        }
        File d = dir(c, p);
        if (p.id.equals(loaded)) release();
        delete(d);
        root(c).mkdirs();
        if (!tmp.renameTo(d)) throw new Exception("rename");
        a.delete();
        prefs(c).edit().remove("id").remove("pack").apply();
        step = "";
        return true;
    }

    static void remove(Context c, Pack p) {
        Pack d = downloading(c);
        if (d != null && d.id.equals(p.id)) cancel(c);
        if (p.id.equals(loaded)) release();
        delete(dir(c, p));
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }
}
