package io.github.danielnoam.waypage.share;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Kokoro voices in Settings › Reading › Narrate (Kokoro.java):
 *
 *   status()    { supported, engine, ready, step, done, total, bytes }
 *               step: "" | "downloading" | "checking" | "unpacking" | "failed" | "bad"
 *   download()  starts it (Android's own downloader, with its notification)
 *   cancel()    stops a download
 *   remove()    deletes the voices and takes the engine off the phone's list
 *
 * The app asks for status about once a second while something is under
 * way; a finished download is checked and unpacked on the first ask.
 */
@CapacitorPlugin(name = "Kokoro")
public class KokoroPlugin extends Plugin {
    private static Thread unpacking;
    private static String failed = "";

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        JSObject o = new JSObject();
        boolean supported = Kokoro.supported();
        o.put("supported", supported);
        o.put("engine", c.getPackageName());
        if (!supported) { call.resolve(o); return; }
        String step;
        synchronized (KokoroPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) step = Kokoro.step;
            else {
                String at = Kokoro.poll(c);
                if (at.equals("downloaded")) { unpackLater(c); step = "checking"; }
                else if (at.equals("failed")) { failed = "failed"; step = "failed"; }
                else if (at.isEmpty()) { step = failed; failed = ""; }
                else step = at;
            }
        }
        o.put("ready", Kokoro.ready(c));
        o.put("step", step);
        o.put("done", Kokoro.done);
        o.put("total", Kokoro.total > 0 ? Kokoro.total : Kokoro.BYTES);
        o.put("bytes", Kokoro.ready(c) ? Kokoro.size(c) : Kokoro.BYTES);
        call.resolve(o);
    }

    private static void unpackLater(Context c) {
        final Context app = c.getApplicationContext();
        Kokoro.step = "checking";
        unpacking = new Thread(() -> {
            try {
                if (!Kokoro.unpack(app)) failed = "bad";
            } catch (Throwable e) {
                failed = "failed";
                Kokoro.remove(app);
            }
            Kokoro.step = "";
        }, "kokoro-unpack");
        unpacking.start();
    }

    @PluginMethod
    public void download(PluginCall call) {
        if (!Kokoro.supported()) { call.reject("This phone can't run Kokoro."); return; }
        failed = "";
        try {
            Kokoro.start(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start the download.");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Kokoro.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        synchronized (KokoroPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) { call.reject("Still unpacking."); return; }
        }
        Kokoro.remove(getContext());
        call.resolve();
    }
}
