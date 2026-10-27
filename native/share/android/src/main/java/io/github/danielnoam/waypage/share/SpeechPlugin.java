package io.github.danielnoam.waypage.share;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Rational;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

/**
 * Read aloud (src/aloud.js, 0.27.0) with the phone's own voices, offline.
 * The reading itself is SpeechService, which goes on with the screen off:
 *
 *   voices({ engine })           { voices: [{ id, name, lang, online, quality }] },
 *                                the engine's, or the phone's default
 *   engines()                    { engines: [{ name, label }], default } (1.33.0)
 *   moreVoices({ engine })       opens the engine's own page for adding voices
 *   play({ items, start, lang, voice, engine, rate, title, subtitle, key, blocks, album, track, tracks })
 *   pause() resume() stop() seek({ index }) skip({ by }) rate({ rate })
 *   state()                      { key, index, state }
 *   queue({ after, items, start, lang, voice, title, subtitle, key })
 *                                the clip to go on to when `after` ends
 *   keepScreen({ on })           keeps the screen from going dark (1.24.0)
 *   pip({ on, playing })         { supported } going home goes on in a
 *                                small window with the reading's buttons
 *   pipState()                   { on } whether it is in that window now
 *
 * a "sleep" event { at } when the sleep timer is set from the lock screen
 * or runs out (1.36.0), and a "progress" event { key, index, state } as each paragraph starts and
 * when the reading pauses, ends or stops ("playing", "paused", "ended",
 * "stopped", "error").
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {

    private TextToSpeech lister;
    private boolean listerReady;
    private String listerEngine = "";
    private int listerGen;
    private final List<PluginCall> waiting = new ArrayList<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    public void load() {
        SpeechService.listener = (key, index, state) -> {
            JSObject o = new JSObject();
            o.put("key", key);
            o.put("index", index);
            o.put("state", state);
            notifyListeners("progress", o);
        };
        SpeechService.sleepListener = (at) -> {
            JSObject o = new JSObject();
            o.put("at", at);
            notifyListeners("sleep", o);
        };
    }

    @PluginMethod
    public void voices(PluginCall call) {
        String engine = call.getString("engine", "");
        if (engine == null) engine = "";
        // Another engine's voices (1.33.0): that engine is started instead.
        if (lister != null && !engine.equals(listerEngine)) {
            lister.shutdown();
            lister = null;
            listerReady = false;
        }
        listerEngine = engine;
        if (listerReady) {
            resolveVoices(call);
            return;
        }
        waiting.add(call);
        if (lister != null) return;
        final int gen = ++listerGen;
        TextToSpeech.OnInitListener done = (status) -> main.post(() -> {
            if (gen != listerGen) return;
            listerReady = status == TextToSpeech.SUCCESS;
            for (PluginCall c : waiting) resolveVoices(c);
            waiting.clear();
        });
        lister = engine.isEmpty() ? new TextToSpeech(getContext(), done) : new TextToSpeech(getContext(), done, engine);
    }

    // The speech engines on the phone (1.33.0): Google's, Samsung's, and
    // any other installed, like RHVoice or a Piper voice through Sherpa.
    @PluginMethod
    public void engines(PluginCall call) {
        TextToSpeech t = lister != null ? lister : new TextToSpeech(getContext(), (status) -> {});
        JSArray list = new JSArray();
        String def = "";
        try {
            for (TextToSpeech.EngineInfo e : t.getEngines()) {
                JSObject o = new JSObject();
                o.put("name", e.name);
                o.put("label", e.label);
                list.put(o);
            }
            def = t.getDefaultEngine();
        } catch (Exception e) {
            // No engines to list.
        }
        if (t != lister) t.shutdown();
        JSObject out = new JSObject();
        out.put("engines", list);
        out.put("default", def == null ? "" : def);
        call.resolve(out);
    }

    // The engine's own screen for adding voices, else the phone's
    // text-to-speech settings.
    @PluginMethod
    public void moreVoices(PluginCall call) {
        String engine = call.getString("engine", "");
        Intent i = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (engine != null && !engine.isEmpty()) i.setPackage(engine);
        try {
            getContext().startActivity(i);
            call.resolve();
            return;
        } catch (Exception e) {
            // That engine has no such screen.
        }
        try {
            getContext().startActivity(new Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open the voice settings", e);
        }
    }

    private void resolveVoices(PluginCall call) {
        JSArray list = new JSArray();
        if (listerReady) {
            try {
                for (Voice v : lister.getVoices()) {
                    if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    JSObject o = new JSObject();
                    o.put("id", v.getName());
                    o.put("name", v.getName());
                    o.put("lang", v.getLocale().toLanguageTag());
                    o.put("online", v.isNetworkConnectionRequired());
                    o.put("quality", v.getQuality());
                    list.put(o);
                }
            } catch (Exception e) {
                // Some engines throw before their voice data is in; no list then.
            }
        }
        JSObject out = new JSObject();
        out.put("voices", list);
        call.resolve(out);
    }

    @PluginMethod
    public void play(PluginCall call) {
        JSONArray items = call.getArray("items");
        if (items == null || items.length() == 0) {
            call.reject("Nothing to read");
            return;
        }
        SpeechService.Job job = jobFrom(call, items);
        job.rate = call.getFloat("rate", 1f);
        SpeechService.pending = job;
        try {
            SpeechService.send(getContext(), SpeechService.PLAY, null, null);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start narrating", e);
        }
    }

    // blocks: the paragraph each item is in, so previous and next from a
    // car or earbuds go a paragraph at a time, as in the app (1.26.0);
    // album, track and tracks: what Bluetooth shows of it.
    private static SpeechService.Job jobFrom(PluginCall call, JSONArray items) {
        SpeechService.Job job = new SpeechService.Job();
        job.items = new String[items.length()];
        for (int i = 0; i < items.length(); i++) job.items[i] = items.optString(i, "");
        JSONArray blocks = call.getArray("blocks");
        if (blocks != null && blocks.length() == items.length()) {
            job.blocks = new int[blocks.length()];
            for (int i = 0; i < blocks.length(); i++) job.blocks[i] = blocks.optInt(i, i);
        }
        job.start = call.getInt("start", 0);
        job.lang = call.getString("lang", "");
        job.voice = call.getString("voice", "");
        job.engine = call.getString("engine", "");
        job.title = call.getString("title", "Narrate");
        job.subtitle = call.getString("subtitle", "");
        job.album = call.getString("album", "");
        job.track = call.getInt("track", 0);
        job.tracks = call.getInt("tracks", 0);
        job.key = call.getString("key", "");
        job.mix = Boolean.TRUE.equals(call.getBoolean("mix", false));
        return job;
    }

    @PluginMethod
    public void queue(PluginCall call) {
        JSONArray items = call.getArray("items");
        SpeechService.Job job = null;
        if (items != null && items.length() > 0) {
            job = jobFrom(call, items);
        }
        final SpeechService.Job next = job;
        final String after = call.getString("after", "");
        main.post(() -> {
            SpeechService.queued = next;
            SpeechService.queuedAfter = next == null ? null : after;
            call.resolve();
        });
    }

    @PluginMethod
    public void keepScreen(PluginCall call) {
        boolean on = call.getBoolean("on", false);
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    // Picture in picture (1.25.0): while reading aloud, going home shrinks
    // the app into a small window (Android 12's auto-enter), with
    // previous, play or pause and next as the window's own buttons.
    @PluginMethod
    public void pip(PluginCall call) {
        JSObject o = new JSObject();
        if (Build.VERSION.SDK_INT < 31) { o.put("supported", false); call.resolve(o); return; }
        boolean on = call.getBoolean("on", false);
        boolean playing = call.getBoolean("playing", true);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().setPictureInPictureParams(pipParams(on, playing));
                o.put("supported", true);
            } catch (Exception e) { o.put("supported", false); }
            call.resolve(o);
        });
    }

    @PluginMethod
    public void pipState(PluginCall call) {
        JSObject o = new JSObject();
        o.put("on", Build.VERSION.SDK_INT >= 26 && getActivity().isInPictureInPictureMode());
        call.resolve(o);
    }

    private PictureInPictureParams pipParams(boolean on, boolean playing) {
        List<RemoteAction> actions = new ArrayList<>();
        actions.add(pipAction(android.R.drawable.ic_media_previous, "Previous paragraph", SpeechService.PREV, 21));
        actions.add(playing ? pipAction(android.R.drawable.ic_media_pause, "Pause", SpeechService.PAUSE, 22)
            : pipAction(android.R.drawable.ic_media_play, "Play", SpeechService.RESUME, 22));
        actions.add(pipAction(android.R.drawable.ic_media_next, "Next paragraph", SpeechService.NEXT, 23));
        return new PictureInPictureParams.Builder()
            .setAspectRatio(new Rational(16, 9))
            .setActions(actions)
            .setAutoEnterEnabled(on)
            .build();
    }

    private RemoteAction pipAction(int icon, String label, String action, int code) {
        Context ctx = getContext();
        Intent i = new Intent(ctx, SpeechService.class).setAction(action);
        PendingIntent pi = PendingIntent.getService(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new RemoteAction(Icon.createWithResource(ctx, icon), label, label, pi);
    }

    @PluginMethod
    public void pause(PluginCall call) { send(call, SpeechService.PAUSE, null, null); }

    @PluginMethod
    public void resume(PluginCall call) { send(call, SpeechService.RESUME, null, null); }

    @PluginMethod
    public void stop(PluginCall call) { send(call, SpeechService.STOP, null, null); }

    @PluginMethod
    public void seek(PluginCall call) { send(call, SpeechService.SEEK, call.getInt("index", 0), null); }

    @PluginMethod
    public void skip(PluginCall call) {
        send(call, SpeechService.SEEK, SpeechService.indexOf() + call.getInt("by", 1), null);
    }

    @PluginMethod
    public void sleep(PluginCall call) { send(call, SpeechService.SLEEP, call.getInt("seconds", 0), null); }

    @PluginMethod
    public void rate(PluginCall call) { send(call, SpeechService.RATE, null, call.getFloat("rate", 1f)); }

    @PluginMethod
    public void state(PluginCall call) {
        JSObject o = new JSObject();
        o.put("key", SpeechService.keyOf());
        o.put("index", SpeechService.indexOf());
        o.put("state", SpeechService.stateOf());
        call.resolve(o);
    }

    private void send(PluginCall call, String action, Integer value, Float rate) {
        try {
            SpeechService.send(getContext(), action, value, rate);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't reach the reader", e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        SpeechService.listener = null;
        if (lister != null) lister.shutdown();
        lister = null;
    }
}
