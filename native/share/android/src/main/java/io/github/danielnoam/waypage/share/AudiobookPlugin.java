package io.github.danielnoam.waypage.share;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Rational;
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
 *   options({ mix, back, on })   mix: no audio focus; back and on in ms
 *   pip({ on, playing })         { supported } going home goes on in a small
 *                                window with back, play or pause and on
 *   probe({ uri, offset, length })  { duration (ms), title, artist, album, cover (base64) }
 *
 *   models()                     { supported, step, busy, done, total, charging,
 *                                  packs: [{ id, title, note, bytes, ready, size, langs }] }
 *   download({ id }) cancel() remove({ id })
 *   transcribe({ uri, offset, length, from, to, pack, lang })   from and to in ms;
 *                                { pieces: [{ t0, t1, quiet, text, words, times }] } in seconds,
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

    @Override
    public void load() {
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
        AudiobookService.options(Boolean.TRUE.equals(call.getBoolean("mix", false)), call.getData().optLong("back", 0L), call.getData().optLong("on", 0L));
        call.resolve();
    }

    // The small window outside the app, like Narrate's (SpeechPlugin), its
    // buttons going to AudiobookService.
    @PluginMethod
    public void pip(PluginCall call) {
        JSObject o = new JSObject();
        if (Build.VERSION.SDK_INT < 31) { o.put("supported", false); call.resolve(o); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", true));
        getActivity().runOnUiThread(() -> {
            try {
                List<RemoteAction> actions = new ArrayList<>();
                actions.add(pipAction(android.R.drawable.ic_media_rew, "Back", AudiobookService.BACK, 31));
                actions.add(playing ? pipAction(android.R.drawable.ic_media_pause, "Pause", AudiobookService.PAUSE, 32)
                    : pipAction(android.R.drawable.ic_media_play, "Play", AudiobookService.RESUME, 32));
                actions.add(pipAction(android.R.drawable.ic_media_ff, "Forward", AudiobookService.ON, 33));
                getActivity().setPictureInPictureParams(new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9)).setActions(actions).setAutoEnterEnabled(on).build());
                o.put("supported", true);
            } catch (Exception e) { o.put("supported", false); }
            call.resolve(o);
        });
    }

    private RemoteAction pipAction(int icon, String label, String action, int code) {
        Context ctx = getContext();
        PendingIntent pi = PendingIntent.getService(ctx, code, new Intent(ctx, AudiobookService.class).setAction(action), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new RemoteAction(Icon.createWithResource(ctx, icon), label, label, pi);
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
        working = true;
        Listen.stop = false;
        worker.execute(() -> {
            try {
                OfflineRecognizer r = Listen.get(c, p, lang);
                if (r == null) { call.reject("model"); return; }
                float[] all = Listen.decode(c, s, from, to);
                if (Listen.stop) { call.reject("stopped"); return; }
                if (all == null) { call.reject("Waypage can't read this file's sound."); return; }
                List<Listen.Piece> pieces = Listen.recognize(r, all, from / 1000.0);
                if (Listen.stop) { call.reject("stopped"); return; }
                JSONArray out = new JSONArray();
                for (Listen.Piece x : pieces) {
                    JSONObject o = new JSONObject();
                    o.put("t0", x.t0);
                    o.put("t1", x.t1);
                    o.put("quiet", x.quiet);
                    o.put("text", x.text);
                    o.put("words", new JSONArray(x.words));
                    JSONArray times = new JSONArray();
                    for (Double t : x.times) times.put(Math.round(t * 100) / 100.0);
                    o.put("times", times);
                    out.put(o);
                }
                JSObject res = new JSObject();
                res.put("pieces", out);
                call.resolve(res);
            } catch (Throwable e) {
                call.reject("Couldn't write this part's transcript.");
            } finally {
                working = false;
            }
        });
    }

    @PluginMethod
    public void stopTranscribing(PluginCall call) {
        Listen.stop = true;
        call.resolve();
    }
}
