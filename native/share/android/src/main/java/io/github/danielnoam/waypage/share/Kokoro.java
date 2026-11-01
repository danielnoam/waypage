package io.github.danielnoam.waypage.share;

import android.app.DownloadManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import com.k2fsa.sherpa.onnx.OfflineTts;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

/**
 * Kokoro voices: sherpa-onnx's Kokoro models, downloaded from Settings
 * (KokoroPlugin, the Kokoro voices screen) and spoken through Waypage's
 * own speech engine (KokoroTtsService), so Narrate, the lock screen and
 * other apps use it like any engine. The engine's library ships in the
 * APK (arm64 phones only); the models are the downloads, three to pick
 * from, one in use at a time. Nothing is sent anywhere: each archive
 * comes from sherpa-onnx's GitHub release and is checked against its
 * SHA-256 before it's unpacked.
 */
final class Kokoro {
    static final String BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/";

    /** One download: a Kokoro model and its voices. */
    static final class Pack {
        final String id, title, note, file, sha256, lexicons;
        final long bytes;
        final String[] voices;
        Pack(String id, String title, String note, String file, String sha256, long bytes, String lexicons, String[] voices) {
            this.id = id; this.title = title; this.note = note; this.file = file; this.sha256 = sha256;
            this.bytes = bytes; this.lexicons = lexicons; this.voices = voices;
        }
        boolean multi() { return !lexicons.isEmpty(); }
    }

    // Each model's speakers in order (speaker id = place in the list).
    // The first letter is the language, the second f or m.
    private static final String[] V019 = {
        "af_kokoro", "af_bella", "af_nicole", "af_sarah", "af_sky", "am_adam", "am_michael",
        "bf_emma", "bf_isabella", "bm_george", "bm_lewis",
    };
    private static final String[] V10 = {
        "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah",
        "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
        "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "ef_dora", "em_alex",
        "ff_siwis", "hf_alpha", "hf_beta", "hm_omega", "hm_psi", "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune", "jf_nezumi",
        "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian",
        "zm_yunxi", "zm_yunxia", "zm_yunyang",
    };
    private static final String[] V11 = v11();

    private static String[] v11() {
        int[] zf = {1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28, 32, 36, 38, 39, 40, 42, 43, 44, 46, 47, 48, 49,
            51, 59, 60, 67, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 83, 84, 85, 86, 87, 88, 90, 92, 93, 94, 99};
        int[] zm = {9, 10, 11, 12, 13, 14, 15, 16, 20, 25, 29, 30, 31, 33, 34, 35, 37, 41, 45, 50, 52, 53, 54, 55, 56, 57, 58, 61, 62,
            63, 64, 65, 66, 68, 69, 80, 81, 82, 89, 91, 95, 96, 97, 98, 100};
        List<String> out = new ArrayList<>();
        out.add("af_maple");
        out.add("af_sol");
        out.add("bf_vale");
        for (int n : zf) out.add(String.format(Locale.ROOT, "zf_%03d", n));
        for (int n : zm) out.add(String.format(Locale.ROOT, "zm_%03d", n));
        return out.toArray(new String[0]);
    }

    private static final String MULTI = "lexicon-us-en.txt,lexicon-zh.txt";
    static final Pack[] PACKS = {
        new Pack("v019", "Kokoro 0.19", "English · 11 voices · fastest", "kokoro-int8-en-v0_19.tar.bz2",
            "c9f0dd393615805b0bab050c340834d5e684e732aec91c0e860cd30e982c08bd", 98_500_000L, "", V019),
        new Pack("v10", "Kokoro 1.0", "8 languages · 53 voices · the best voices, slowest", "kokoro-multi-lang-v1_0.tar.bz2",
            "60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4", 349_886_476L, MULTI, V10),
        new Pack("v11", "Kokoro 1.1", "English and Chinese · 103 voices, 3 English", "kokoro-int8-multi-lang-v1_1.tar.bz2",
            "a1e94694776049035c4f2c6529f003aaece993c76aae9a78995831c3c4dcafc6", 140_000_000L, MULTI, V11),
    };

    static Pack pack(String id) {
        for (Pack p : PACKS) if (p.id.equals(id)) return p;
        return null;
    }

    private static final String PREFS = "waypage.kokoro";
    private static OfflineTts tts;
    private static String loaded = "";
    private static Boolean supported;
    static volatile String step = "";
    static volatile long done, total;

    private Kokoro() {}

    /** The library is in the APK only for arm64 phones. */
    static synchronized boolean supported() {
        if (supported == null) {
            try {
                Class.forName("com.k2fsa.sherpa.onnx.OfflineTts");
                supported = true;
            } catch (Throwable e) {
                supported = false;
            }
        }
        return supported;
    }

    private static File root(Context c) { return new File(c.getFilesDir(), "kokoro"); }

    static File dir(Context c, Pack p) {
        migrate(c);
        return new File(root(c), p.id);
    }

    // The first preview kept 0.19 straight in kokoro/.
    private static void migrate(Context c) {
        File r = root(c);
        if (!new File(r, "voices.bin").isFile()) return;
        File tmp = new File(c.getFilesDir(), "kokoro.v019");
        if (!r.renameTo(tmp)) return;
        r.mkdirs();
        tmp.renameTo(new File(r, "v019"));
        if (prefs(c).getString("use", "").isEmpty()) prefs(c).edit().putString("use", "v019").apply();
    }

    static boolean ready(Context c, Pack p) {
        File d = dir(c, p);
        return new File(d, "voices.bin").isFile() && new File(d, "tokens.txt").isFile() && model(d) != null;
    }

    /** The pack the engine speaks with: the one picked, if it's on the phone. */
    static Pack inUse(Context c) {
        Pack p = pack(prefs(c).getString("use", ""));
        if (p != null && ready(c, p)) return p;
        for (Pack q : PACKS) if (ready(c, q)) return q;
        return null;
    }

    static boolean ready(Context c) { return inUse(c) != null; }

    static void use(Context c, Pack p) {
        prefs(c).edit().putString("use", p.id).apply();
        release();
    }

    private static File model(File d) {
        File[] all = d.listFiles((f, n) -> n.endsWith(".onnx"));
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

    /** Loaded once and kept: loading a model takes a few seconds. */
    static synchronized OfflineTts get(Context c) {
        Pack p = inUse(c);
        if (p == null || !supported()) return null;
        if (tts != null && loaded.equals(p.id)) return tts;
        if (tts != null) tts.free();
        tts = null;
        File d = dir(c, p);
        StringBuilder lex = new StringBuilder();
        for (String l : p.lexicons.split(",")) {
            if (l.isEmpty() || !new File(d, l).isFile()) continue;
            if (lex.length() > 0) lex.append(',');
            lex.append(new File(d, l).getAbsolutePath());
        }
        int threads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2));
        try {
            tts = OfflineTts.kokoro(model(d).getAbsolutePath(), new File(d, "voices.bin").getAbsolutePath(),
                new File(d, "tokens.txt").getAbsolutePath(), new File(d, "espeak-ng-data").getAbsolutePath(), lex.toString(), threads);
            loaded = p.id;
        } catch (Throwable e) {
            tts = null;
        }
        return tts;
    }

    static synchronized void release() {
        synchronized (LOCK) {
            for (Take t : takes) t.cancelled = true;
            takes.clear();
        }
        if (tts != null) tts.free();
        tts = null;
        loaded = "";
    }

    // ---- Voices. A voice's name is kokoro-<id> (kokoro-af_heart); Narrate
    // shows it as Heart.

    static final String PREFIX = "kokoro-";

    static String languageOf(String id) {
        switch (id.charAt(0)) {
            case 'a': return "en-US";
            case 'b': return "en-GB";
            case 'e': return "es-ES";
            case 'f': return "fr-FR";
            case 'h': return "hi-IN";
            case 'i': return "it-IT";
            case 'j': return "ja-JP";
            case 'p': return "pt-BR";
            default: return "zh-CN";
        }
    }

    // espeak-ng's voice for the words the lexicons don't cover. English
    // and Chinese go through the lexicons ("").
    private static String espeakOf(String id) {
        switch (id.charAt(0)) {
            case 'e': return "es";
            case 'f': return "fr-fr";
            case 'h': return "hi";
            case 'i': return "it";
            case 'j': return "ja";
            case 'p': return "pt-br";
            default: return "";
        }
    }

    /** A voice of the pack in use: its speaker id, or -1. */
    static int sid(Context c, String name) {
        Pack p = inUse(c);
        if (p == null || name == null || !name.startsWith(PREFIX)) return -1;
        String id = name.substring(PREFIX.length());
        for (int i = 0; i < p.voices.length; i++) if (p.voices[i].equals(id)) return i;
        return -1;
    }

    /** A language's own voice when none is picked: the best of the pack in that language. */
    static int defaultSid(Context c, Locale l) {
        Pack p = inUse(c);
        if (p == null) return 0;
        String lang = l.getLanguage();
        String country = l.getCountry();
        boolean gb = "GB".equalsIgnoreCase(country) || "GBR".equalsIgnoreCase(country);
        for (String want : new String[] {gb ? "bf_emma" : "af_heart", gb ? "bf_vale" : "af_bella", gb ? "bf_emma" : "af_maple"}) {
            for (int i = 0; i < p.voices.length; i++) if (p.voices[i].equals(want) && matches(p.voices[i], lang)) return i;
        }
        for (int i = 0; i < p.voices.length; i++) if (matches(p.voices[i], lang) && (!gb || p.voices[i].charAt(0) == 'b')) return i;
        for (int i = 0; i < p.voices.length; i++) if (matches(p.voices[i], lang)) return i;
        return 0;
    }

    static boolean matches(String id, String lang) {
        Locale v = Locale.forLanguageTag(languageOf(id));
        return v.getLanguage().equalsIgnoreCase(lang) || v.getISO3Language().equalsIgnoreCase(lang)
            || ("zh".equals(v.getLanguage()) && ("zho".equalsIgnoreCase(lang) || "cmn".equalsIgnoreCase(lang)));
    }

    static int sidFor(Context c, String voiceName, Locale l) {
        int s = sid(c, voiceName);
        return s >= 0 ? s : defaultSid(c, l);
    }

    // Shown in the phone's list of engines only once some voices are here.
    static void listEngine(Context c) {
        boolean on = ready(c);
        c.getPackageManager().setComponentEnabledSetting(new ComponentName(c, KokoroTtsService.class),
            on ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    }

    // ---- Made ahead. Android lets an engine get only about half a second
    // ahead of the speaker, and hands it the next piece only once this one
    // is done, so Kokoro paused at every paragraph while it made the next.
    // Narrate (SpeechService, same process) asks for the piece being read
    // and the one after here; they're made one after another on their own
    // thread, and the engine plays from what's made.

    static final class Take {
        final String key;
        final long seq;
        final List<byte[]> chunks = new ArrayList<>();
        boolean done, failed;
        volatile boolean cancelled;
        Take(String key, long seq) { this.key = key; this.seq = seq; }
    }
    static final Object END = new Object();
    private static final Object LOCK = new Object();
    private static final List<Take> takes = new ArrayList<>();
    private static long seqs;
    private static final ExecutorService maker = Executors.newSingleThreadExecutor();

    /** Narrate's speed (1.0 = normal) the way the engine gets it, as a whole percent. */
    static float speedOf(int percent) { return Math.max(0.5f, Math.min(3f, percent / 100f)); }

    /** The piece, being made or made already, else started now. */
    static Take take(Context c, String text, int sid, float speed) {
        Pack p = inUse(c);
        String key = (p == null ? "" : p.id) + "|" + sid + "|" + Math.round(speed * 100) + "|" + text;
        synchronized (LOCK) {
            for (Take t : takes) if (t.key.equals(key) && !t.cancelled) return t;
            Take t = new Take(key, ++seqs);
            takes.add(t);
            while (takes.size() > 6) takes.remove(0).cancelled = true;
            final Context app = c.getApplicationContext();
            String lang = p != null && p.multi() && sid < p.voices.length ? espeakOf(p.voices[sid]) : "";
            maker.execute(() -> make(app, t, text, sid, speed, lang));
            return t;
        }
    }

    /** The pieces asked for before this one aren't wanted any more (a skip, a new start). */
    static void dropBefore(Take keep) {
        synchronized (LOCK) {
            for (Iterator<Take> it = takes.iterator(); it.hasNext(); ) {
                Take t = it.next();
                if (t.seq < keep.seq) { t.cancelled = true; it.remove(); }
            }
        }
    }

    /** Chunk i when it's made; null after a short wait without it; END when there are no more. */
    static Object next(Take t, int i) throws InterruptedException {
        synchronized (LOCK) {
            if (i >= t.chunks.size() && !t.done && !t.cancelled) LOCK.wait(100);
            if (i < t.chunks.size()) return t.chunks.get(i);
            return t.done || t.cancelled ? END : null;
        }
    }

    private static void make(Context c, Take t, String text, int sid, float speed, String lang) {
        OfflineTts tts = t.cancelled ? null : get(c);
        if (tts != null) {
            try {
                tts.generate(text, sid, speed, lang, (samples) -> {
                    if (t.cancelled) return 0;
                    byte[] pcm = new byte[samples.length * 2];
                    for (int i = 0; i < samples.length; i++) {
                        int s = (int) (Math.max(-1f, Math.min(1f, samples[i])) * 32767);
                        pcm[2 * i] = (byte) s;
                        pcm[2 * i + 1] = (byte) (s >> 8);
                    }
                    synchronized (LOCK) {
                        t.chunks.add(pcm);
                        LOCK.notifyAll();
                    }
                    return t.cancelled ? 0 : 1;
                });
            } catch (Throwable e) {
                t.failed = true;
            }
        } else t.failed = !t.cancelled;
        synchronized (LOCK) {
            t.done = true;
            LOCK.notifyAll();
        }
    }

    // ---- The downloads: Android's DownloadManager fetches one at a time
    // (it goes on with the app closed), then it's checked and unpacked here.

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static File archive(Context c) {
        File base = c.getExternalFilesDir(null);
        return new File(base != null ? base : c.getFilesDir(), "kokoro.tar.bz2");
    }

    static long downloadId(Context c) { return prefs(c).getLong("id", -1); }

    /** The pack being downloaded or unpacked, or null. */
    static Pack downloading(Context c) { return pack(prefs(c).getString("pack", "")); }

    static void start(Context c, Pack p) {
        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        cancel(c);
        File a = archive(c);
        a.delete();
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(BASE + p.file))
            .setTitle(p.title + " voices")
            .setDescription("For Narrate")
            .setDestinationUri(Uri.fromFile(a))
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

    /**
     * Where the download is: "downloading", "failed", or "downloaded"
     * (the archive is complete and waits to be unpacked). Updates
     * done/total.
     */
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
        File tmp = new File(c.getFilesDir(), "kokoro.part");
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
                // The archive's own top folder (kokoro-int8-en-v0_19/) is dropped.
                String name = e.getName();
                int slash = name.indexOf('/');
                name = slash >= 0 ? name.substring(slash + 1) : name;
                if (name.isEmpty() || e.isSymbolicLink() || e.isLink()) continue;
                File out = new File(tmp, name);
                // Nothing may land outside the folder.
                if (!out.getCanonicalPath().startsWith(rootPath)) continue;
                if (e.isDirectory()) { out.mkdirs(); continue; }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
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
        prefs(c).edit().remove("id").remove("pack").putString("use", p.id).apply();
        release();
        step = "";
        listEngine(c);
        return true;
    }

    static void remove(Context c, Pack p) {
        Pack d = downloading(c);
        if (d != null && d.id.equals(p.id)) cancel(c);
        release();
        delete(dir(c, p));
        listEngine(c);
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }
}
