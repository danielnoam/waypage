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
import java.util.Locale;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;

/**
 * Kokoro voices: sherpa-onnx's Kokoro model, downloaded from Settings
 * (KokoroPlugin) and spoken through Waypage's own speech engine
 * (KokoroTtsService), so Narrate, the lock screen and other apps use it
 * like any engine. The engine's library ships in the APK (arm64 phones
 * only); the model is the download. Nothing is sent anywhere: the
 * archive comes from sherpa-onnx's GitHub release and is checked
 * against its SHA-256 before it's unpacked.
 */
final class Kokoro {
    // Kokoro v0.19, English, int8: the smallest (98.5 MB) and fastest.
    static final String URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-en-v0_19.tar.bz2";
    static final String SHA256 = "c9f0dd393615805b0bab050c340834d5e684e732aec91c0e860cd30e982c08bd";
    static final long BYTES = 98_500_000L;

    // { voice, speaker id, language }: the model's speakers in order
    // (af, af_bella, ... bm_lewis), named as Narrate's voice list shows them.
    static final String[][] VOICES = {
        {"Kokoro", "0", "en-US"}, {"Bella", "1", "en-US"}, {"Nicole", "2", "en-US"}, {"Sarah", "3", "en-US"},
        {"Sky", "4", "en-US"}, {"Adam", "5", "en-US"}, {"Michael", "6", "en-US"},
        {"Emma", "7", "en-GB"}, {"Isabella", "8", "en-GB"}, {"George", "9", "en-GB"}, {"Lewis", "10", "en-GB"},
    };

    private static final String PREFS = "waypage.kokoro";
    private static OfflineTts tts;
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

    static File dir(Context c) { return new File(c.getFilesDir(), "kokoro"); }

    static boolean ready(Context c) {
        File d = dir(c);
        return new File(d, "voices.bin").isFile() && new File(d, "tokens.txt").isFile() && model(d) != null;
    }

    private static File model(File d) {
        File[] all = d.listFiles((f, n) -> n.endsWith(".onnx"));
        if (all == null || all.length == 0) return null;
        for (File f : all) if (f.getName().contains("int8")) return f;
        return all[0];
    }

    static long size(Context c) { return sizeOf(dir(c)); }

    private static long sizeOf(File f) {
        if (f.isFile()) return f.length();
        long n = 0;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) n += sizeOf(k);
        return n;
    }

    /** Loaded once and kept: loading the model takes a few seconds. */
    static synchronized OfflineTts get(Context c) {
        if (tts != null) return tts;
        if (!supported() || !ready(c)) return null;
        File d = dir(c);
        int threads = Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() / 2));
        try {
            tts = OfflineTts.kokoro(model(d).getAbsolutePath(), new File(d, "voices.bin").getAbsolutePath(),
                new File(d, "tokens.txt").getAbsolutePath(), new File(d, "espeak-ng-data").getAbsolutePath(), "", threads);
        } catch (Throwable e) {
            tts = null;
        }
        return tts;
    }

    static synchronized void release() {
        if (tts != null) tts.free();
        tts = null;
    }

    static String[] voice(String name) {
        for (String[] v : VOICES) if (v[0].equals(name)) return v;
        return null;
    }

    /** A language's own voice when none is picked: Bella, or Emma for British English. */
    static String[] voiceFor(Locale l) {
        String country = l.getCountry();
        boolean gb = "GB".equalsIgnoreCase(country) || "GBR".equalsIgnoreCase(country);
        return voice(gb ? "Emma" : "Bella");
    }

    // Shown in the phone's list of engines only once the voices are here.
    static void listEngine(Context c, boolean on) {
        c.getPackageManager().setComponentEnabledSetting(new ComponentName(c, KokoroTtsService.class),
            on ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP);
    }

    // ---- The download: Android's DownloadManager fetches it (it goes on
    // with the app closed), then it's checked and unpacked here.

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static File archive(Context c) {
        File base = c.getExternalFilesDir(null);
        return new File(base != null ? base : c.getFilesDir(), "kokoro.tar.bz2");
    }

    static long downloadId(Context c) { return prefs(c).getLong("id", -1); }

    static void start(Context c) {
        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        cancel(c);
        File a = archive(c);
        a.delete();
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(URL))
            .setTitle("Kokoro voices")
            .setDescription("For Narrate")
            .setDestinationUri(Uri.fromFile(a))
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        prefs(c).edit().putLong("id", dm.enqueue(r)).apply();
        step = "downloading";
        done = 0;
        total = BYTES;
    }

    static void cancel(Context c) {
        long id = downloadId(c);
        if (id >= 0) ((DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
        prefs(c).edit().remove("id").apply();
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
        if (id < 0) return "";
        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor q = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (q == null || !q.moveToFirst()) { prefs(c).edit().remove("id").apply(); return "failed"; }
            int status = q.getInt(q.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            done = q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long t = q.getLong(q.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            total = t > 0 ? t : BYTES;
            if (status == DownloadManager.STATUS_SUCCESSFUL) return "downloaded";
            if (status == DownloadManager.STATUS_FAILED) { cancel(c); return "failed"; }
            return "downloading";
        }
    }

    /** Checks the archive and unpacks it. False when it isn't the one expected. */
    static boolean unpack(Context c) throws Exception {
        File a = archive(c);
        step = "checking";
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(a)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder hex = new StringBuilder();
        for (byte b : md.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
        if (!SHA256.equals(hex.toString())) {
            prefs(c).edit().remove("id").apply();
            a.delete();
            return false;
        }
        step = "unpacking";
        File tmp = new File(c.getFilesDir(), "kokoro.part");
        delete(tmp);
        tmp.mkdirs();
        String root = tmp.getCanonicalPath() + File.separator;
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
                if (!out.getCanonicalPath().startsWith(root)) continue;
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
        release();
        File d = dir(c);
        delete(d);
        if (!tmp.renameTo(d)) throw new Exception("rename");
        a.delete();
        prefs(c).edit().remove("id").apply();
        step = "";
        listEngine(c, true);
        return true;
    }

    static void remove(Context c) {
        cancel(c);
        release();
        listEngine(c, false);
        delete(dir(c));
        delete(new File(c.getFilesDir(), "kokoro.part"));
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        f.delete();
    }
}
