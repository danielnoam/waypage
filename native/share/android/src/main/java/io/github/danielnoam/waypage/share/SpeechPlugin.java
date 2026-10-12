package io.github.danielnoam.waypage.share;

import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
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
 *   voices()                     { voices: [{ id, name, lang, online, quality }] }
 *   play({ items, start, lang, voice, rate, title, subtitle, key })
 *   pause() resume() stop() seek({ index }) skip({ by }) rate({ rate })
 *   state()                      { key, index, state }
 *   queue({ after, items, start, lang, voice, title, subtitle, key })
 *                                the clip to go on to when `after` ends
 *
 * and a "progress" event { key, index, state } as each paragraph starts and
 * when the reading pauses, ends or stops ("playing", "paused", "ended",
 * "stopped", "error").
 */
@CapacitorPlugin(name = "Speech")
public class SpeechPlugin extends Plugin {

    private TextToSpeech lister;
    private boolean listerReady;
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
    }

    @PluginMethod
    public void voices(PluginCall call) {
        if (listerReady) {
            resolveVoices(call);
            return;
        }
        waiting.add(call);
        if (lister != null) return;
        lister = new TextToSpeech(getContext(), (status) -> main.post(() -> {
            listerReady = status == TextToSpeech.SUCCESS;
            for (PluginCall c : waiting) resolveVoices(c);
            waiting.clear();
        }));
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
        SpeechService.Job job = new SpeechService.Job();
        job.items = new String[items.length()];
        for (int i = 0; i < items.length(); i++) job.items[i] = items.optString(i, "");
        job.start = call.getInt("start", 0);
        job.lang = call.getString("lang", "");
        job.voice = call.getString("voice", "");
        job.rate = call.getFloat("rate", 1f);
        job.title = call.getString("title", "Read aloud");
        job.subtitle = call.getString("subtitle", "");
        job.key = call.getString("key", "");
        SpeechService.pending = job;
        try {
            SpeechService.send(getContext(), SpeechService.PLAY, null, null);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start reading aloud", e);
        }
    }

    @PluginMethod
    public void queue(PluginCall call) {
        JSONArray items = call.getArray("items");
        SpeechService.Job job = null;
        if (items != null && items.length() > 0) {
            job = new SpeechService.Job();
            job.items = new String[items.length()];
            for (int i = 0; i < items.length(); i++) job.items[i] = items.optString(i, "");
            job.start = call.getInt("start", 0);
            job.lang = call.getString("lang", "");
            job.voice = call.getString("voice", "");
            job.title = call.getString("title", "Read aloud");
            job.subtitle = call.getString("subtitle", "");
            job.key = call.getString("key", "");
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
