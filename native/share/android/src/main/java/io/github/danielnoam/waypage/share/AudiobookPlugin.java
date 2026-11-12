package io.github.danielnoam.waypage.share;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Audiobooks (src/app-listen.js): playing one with the screen off
 * (AudiobookService), what a sound file says about itself, and transcripts
 * made on the phone (Listen).
 *
 *   play({ parts: [{ uri, offset, length }], part, pos, rate, title, subtitle, key })
 *                                pos in ms into the part
 *   pause() resume() stop() seek({ part, pos }) skip({ by }) rate({ rate }) sleep({ at })
 *   state()                      { key, part, pos, state }
 *   options({ mix, back, on, volume })   mix: no audio focus; back and on in ms; volume 0 to 2
 *   pip({ on, playing })         { supported } going home goes on in a small
 *                                window with back, play or pause and on
 *   probe({ uri, offset, length })  { duration (ms), title, artist, album, cover (base64) }
 *
 *   models()                     { supported, step, busy, done, total, charging,
 *                                  packs: [{ id, title, note, bytes, ready, size, langs }] }
 *   download({ id }) cancel() remove({ id })
 *   transcribe({ uri, offset, length, from, to, pack, lang, title, text, done, end })   from and to in ms;
 *                                { pieces: [{ t0, t1, quiet, text, words, times }] } in seconds,
 *                                each also told as it's written, a "piece" event { piece, from, to };
 *                                title and text for the notification while it writes, done and end
 *                                (0 to 1) how far its bar is at this stretch's start and end,
 *                                or rejects "battery", "hot", "busy", "stopped" or "model"
 *   stopTranscribing()
 *
 * a "state" event { key, part, pos, dur, state } about twice a second while
 * it plays and as it changes ("loading", "playing", "paused", "ended",
 * "stopped", "error"), and a "sleep" event { at }.
 */
@CapacitorPlugin(name = "Audiobook")
public class AudiobookPlugin extends Plugin {
    private static Thread unpacking;
    private static String failed = "";
    private static String failedPack = "";
    private static final ExecutorService worker = Executors.newSingleThreadExecutor((r) -> {
        Thread t = new Thread(r, "listen");
        t.setPriority(Thread.MIN_PRIORITY);
        return t;
    });
    private static volatile boolean working;
    private static final String WRITING = "waypage-transcripts";
    private static final int WRITING_NOTE = 31;
    private static final Handler main = new Handler(Looper.getMainLooper());
    // Gone a few seconds after a stretch, unless the next one starts.
    private static final Runnable writingDone = () -> {
        NotificationManager nm = noteManager();
        if (nm != null) nm.cancel(WRITING_NOTE);
    };
    private static Context appContext;

    @Override
    public void load() {
        appContext = getContext().getApplicationContext();
        AudiobookService.listener = (key, part, pos, dur, state) -> {
            JSObject o = new JSObject();
            o.put("key", key);
            o.put("part", part);
            o.put("pos", pos);
            o.put("dur", dur);
            o.put("state", state);
            notifyListeners("state", o);
        };
        AudiobookService.sleepListener = (at) -> {
            JSObject o = new JSObject();
            o.put("at", at);
            notifyListeners("sleep", o);
        };
    }

    // ---- Playing

    @PluginMethod
    public void play(PluginCall call) {
        JSArray list = call.getArray("parts");
        AudiobookService.Job j = new AudiobookService.Job();
        try {
            List<Object> items = list.toList();
            j.parts = new AudiobookService.Part[items.size()];
            for (int i = 0; i < items.size(); i++) {
                JSONObject o = (JSONObject) items.get(i);
                AudiobookService.Part p = new AudiobookService.Part();
                p.uri = o.getString("uri");
                p.offset = o.optLong("offset", -1);
                p.length = o.optLong("length", -1);
                j.parts[i] = p;
            }
        } catch (Exception e) {
            call.reject("No sound to play.");
            return;
        }
        if (j.parts.length == 0) { call.reject("No sound to play."); return; }
        j.part = call.getInt("part", 0);
        j.pos = call.getData().optLong("pos", 0L);
        j.rate = call.getFloat("rate", 1f);
        j.title = call.getString("title", "");
        j.subtitle = call.getString("subtitle", "");
        j.key = call.getString("key", "");
        AudiobookService.pending = j;
        AudiobookService.send(getContext(), AudiobookService.PLAY, null, null);
        call.resolve();
    }

    @PluginMethod public void pause(PluginCall call) { AudiobookService.send(getContext(), AudiobookService.PAUSE, null, null); call.resolve(); }
    @PluginMethod public void resume(PluginCall call) { AudiobookService.send(getContext(), AudiobookService.RESUME, null, null); call.resolve(); }
    @PluginMethod public void stop(PluginCall call) { AudiobookService.send(getContext(), AudiobookService.STOP, null, null); call.resolve(); }

    @PluginMethod
    public void seek(PluginCall call) {
        AudiobookService.seek(getContext(), call.getInt("part", 0), call.getData().optLong("pos", 0L));
        call.resolve();
    }

    @PluginMethod
    public void skip(PluginCall call) {
        AudiobookService.send(getContext(), AudiobookService.SKIP, call.getData().optLong("by", 0L), null);
        call.resolve();
    }

    @PluginMethod
    public void rate(PluginCall call) {
        AudiobookService.send(getContext(), AudiobookService.RATE, null, call.getFloat("rate", 1f));
        call.resolve();
    }

    @PluginMethod
    public void options(PluginCall call) {
        AudiobookService.options(Boolean.TRUE.equals(call.getBoolean("mix", false)), call.getData().optLong("back", 0L), call.getData().optLong("on", 0L), call.getFloat("volume", 1f));
        call.resolve();
    }

    // The small window outside the app, like Narrate's, its buttons going
    // to AudiobookService (PipWindow).
    @PluginMethod
    public void pip(PluginCall call) {
        JSObject o = new JSObject();
        if (Build.VERSION.SDK_INT < 31) { o.put("supported", false); call.resolve(o); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            PipWindow.audiobook(getActivity(), on);
            o.put("supported", true);
            call.resolve(o);
        });
    }

    @PluginMethod
    public void sleep(PluginCall call) {
        AudiobookService.send(getContext(), AudiobookService.SLEEP, call.getData().optLong("at", 0L), null);
        call.resolve();
    }

    @PluginMethod
    public void state(PluginCall call) {
        JSObject o = new JSObject();
        o.put("key", AudiobookService.keyOf());
        o.put("part", AudiobookService.partOf());
        o.put("pos", AudiobookService.posOf());
        o.put("state", AudiobookService.stateOf());
        o.put("sleep", AudiobookService.sleepAt);
        call.resolve(o);
    }

    @PluginMethod
    public void probe(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("No file"); return; }
        long offset = call.getData().optLong("offset", -1L), length = call.getData().optLong("length", -1L);
        final Context c = getContext();
        new Thread(() -> {
            MediaMetadataRetriever m = new MediaMetadataRetriever();
            ParcelFileDescriptor fd = null;
            JSObject o = new JSObject();
            try {
                Uri u = Uri.parse(uri);
                if (offset >= 0 && length > 0) {
                    fd = c.getContentResolver().openFileDescriptor(u, "r");
                    m.setDataSource(fd.getFileDescriptor(), offset, length);
                } else if ("file".equals(u.getScheme())) m.setDataSource(u.getPath());
                else m.setDataSource(c, u);
                String d = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                o.put("duration", d == null ? 0 : Long.parseLong(d));
                put(o, "title", m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE));
                put(o, "album", m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM));
                String artist = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
                if (artist == null) artist = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_AUTHOR);
                if (artist == null) artist = m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST);
                put(o, "artist", artist);
                byte[] art = m.getEmbeddedPicture();
                if (art != null && art.length < (4 << 20)) o.put("cover", Base64.encodeToString(art, Base64.NO_WRAP));
                call.resolve(o);
            } catch (Exception e) {
                call.reject("Waypage can't play this file.");
            } finally {
                try { m.release(); } catch (Exception e) { /* gone */ }
                if (fd != null) { try { fd.close(); } catch (Exception e) { /* gone */ } }
            }
        }, "listen-probe").start();
    }

    private static void put(JSObject o, String k, String v) {
        if (v != null && !v.trim().isEmpty()) o.put(k, v.trim());
    }

    // ---- Transcripts

    @PluginMethod
    public void models(PluginCall call) {
        Context c = getContext();
        JSObject o = new JSObject();
        boolean supported = Listen.supported();
        o.put("supported", supported);
        if (!supported) { call.resolve(o); return; }
        String step;
        Listen.Pack busy;
        synchronized (AudiobookPlugin.class) {
            busy = Listen.downloading(c);
            if (unpacking != null && unpacking.isAlive()) step = Listen.step;
            else {
                String at = Listen.poll(c);
                if (at.equals("downloaded")) { unpackLater(c); step = "checking"; }
                else if (at.equals("failed")) { failed = "failed"; failedPack = busy == null ? "" : busy.id; step = "failed"; }
                else if (at.isEmpty()) { step = failed; failed = ""; }
                else step = at;
            }
        }
        o.put("busy", busy != null ? busy.id : step.equals("failed") || step.equals("bad") ? failedPack : "");
        o.put("step", step);
        o.put("done", Listen.done);
        o.put("total", Listen.total);
        o.put("charging", Listen.charging(c));
        o.put("working", working);
        JSArray packs = new JSArray();
        for (Listen.Pack p : Listen.PACKS) {
            JSObject j = new JSObject();
            boolean ready = Listen.ready(c, p);
            j.put("id", p.id);
            j.put("title", p.title);
            j.put("note", p.note);
            j.put("bytes", p.bytes);
            j.put("ready", ready);
            j.put("size", ready ? Listen.size(c, p) : 0);
            JSArray langs = new JSArray();
            for (String l : p.langs) langs.put(l);
            j.put("langs", langs);
            packs.put(j);
        }
        o.put("packs", packs);
        call.resolve(o);
    }

    private static void unpackLater(Context c) {
        final Context app = c.getApplicationContext();
        Listen.Pack p = Listen.downloading(app);
        failedPack = p == null ? "" : p.id;
        Listen.step = "checking";
        unpacking = new Thread(() -> {
            try {
                if (!Listen.unpack(app)) failed = "bad";
            } catch (Throwable e) {
                failed = "failed";
                Listen.cancel(app);
            }
            Listen.step = "";
        }, "listen-unpack");
        unpacking.start();
    }

    private Listen.Pack packOf(PluginCall call) {
        Listen.Pack p = Listen.pack(call.getString("id", ""));
        if (p == null) call.reject("No such model.");
        return p;
    }

    @PluginMethod
    public void download(PluginCall call) {
        if (!Listen.supported()) { call.reject("This phone can't make transcripts."); return; }
        Listen.Pack p = packOf(call);
        if (p == null) return;
        synchronized (AudiobookPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) { call.reject("Still unpacking the last one."); return; }
        }
        failed = "";
        try {
            Listen.start(getContext(), p);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start the download.");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        synchronized (AudiobookPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) { call.reject("Still unpacking."); return; }
        }
        Listen.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        Listen.Pack p = packOf(call);
        if (p == null) return;
        if (working) { call.reject("Still writing a transcript. Try again in a moment."); return; }
        Listen.remove(getContext(), p);
        call.resolve();
    }

    @PluginMethod
    public void transcribe(PluginCall call) {
        final Context c = getContext().getApplicationContext();
        Listen.Pack p = Listen.pack(call.getString("pack", ""));
        if (p == null || !Listen.ready(c, p)) { call.reject("model"); return; }
        if (working) { call.reject("busy"); return; }
        String why = Listen.holdOff(c);
        if (!why.isEmpty()) { call.reject(why); return; }
        Listen.Source s = new Listen.Source();
        s.uri = call.getString("uri", "");
        s.offset = call.getData().optLong("offset", -1L);
        s.length = call.getData().optLong("length", -1L);
        final long from = call.getData().optLong("from", 0L), to = call.getData().optLong("to", 0L);
        final String lang = call.getString("lang", "");
        final String title = call.getString("title", ""), text = call.getString("text", "");
        final double done = call.getData().optDouble("done", -1), end = call.getData().optDouble("end", -1);
        working = true;
        writing(title, text, done);
        Listen.stop = false;
        worker.execute(() -> {
            try {
                OfflineRecognizer r = Listen.get(c, p, lang);
                if (r == null) { call.reject("model"); return; }
                float[] all = Listen.decode(c, s, from, to);
                if (Listen.stop) { call.reject("stopped"); return; }
                if (all == null) { call.reject("Waypage can't read this file's sound."); return; }
                final double span = Math.max(1, to - from) / 1000.0;
                List<Listen.Piece> pieces = Listen.recognize(r, all, from / 1000.0, (x) -> {
                    JSObject e = new JSObject();
                    try { e.put("piece", pieceJson(x)); } catch (Exception err) { return; }
                    e.put("from", from);
                    e.put("to", to);
                    notifyListeners("piece", e);
                    writing(title, text, done + (end - done) * Math.min(1, Math.max(0, (x.t1 - from / 1000.0) / span)));
                });
                if (Listen.stop) { call.reject("stopped"); return; }
                JSONArray out = new JSONArray();
                for (Listen.Piece x : pieces) out.put(pieceJson(x));
                JSObject res = new JSObject();
                res.put("pieces", out);
                call.resolve(res);
            } catch (Throwable e) {
                call.reject("Couldn't write this part's transcript.");
            } finally {
                working = false;
                main.removeCallbacks(writingDone);
                main.postDelayed(writingDone, 4000);
            }
        });
    }

    private static JSONObject pieceJson(Listen.Piece x) throws Exception {
        JSONObject o = new JSONObject();
        o.put("t0", x.t0);
        o.put("t1", x.t1);
        o.put("quiet", x.quiet);
        o.put("text", x.text);
        o.put("words", new JSONArray(x.words));
        JSONArray times = new JSONArray();
        for (Double t : x.times) times.put(Math.round(t * 100) / 100.0);
        o.put("times", times);
        return o;
    }

    private static NotificationManager noteManager() {
        return appContext == null ? null : (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    // "Writing the transcript" in the notifications while a stretch is
    // written, with how far the chapter has got (0 to 1, below 0: no bar).
    @SuppressWarnings("deprecation")
    private static void writing(String title, String text, double f) {
        main.removeCallbacks(writingDone);
        NotificationManager nm = noteManager();
        if (nm == null) return;
        try {
            Context c = appContext;
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel(WRITING) == null) {
                    NotificationChannel ch = new NotificationChannel(WRITING, "Transcripts", NotificationManager.IMPORTANCE_LOW);
                    ch.setShowBadge(false);
                    nm.createNotificationChannel(ch);
                }
                b = new Notification.Builder(c, WRITING);
            } else b = new Notification.Builder(c);
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (open != null) {
                open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                b.setContentIntent(PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            }
            b.setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title.isEmpty() ? "Writing the transcript" : "Writing the transcript of " + title)
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false);
            if (f >= 0) b.setProgress(1000, (int) Math.round(Math.min(1, f) * 1000), false);
            else b.setProgress(0, 0, true);
            nm.notify(WRITING_NOTE, b.build());
        } catch (Exception e) { /* no notifications allowed */ }
    }

    @PluginMethod
    public void stopTranscribing(PluginCall call) {
        Listen.stop = true;
        call.resolve();
    }
}
