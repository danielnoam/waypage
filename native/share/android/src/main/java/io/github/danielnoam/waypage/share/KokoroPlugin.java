package io.github.danielnoam.waypage.share;

import android.content.Context;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Kokoro voices, Settings › Reading › Narrate › Kokoro voices (Kokoro.java):
 *
 *   status()          { supported, engine, use, busy, step, done, total,
 *                       packs: [{ id, title, note, bytes, ready, size, voices, languages }] }
 *                     busy: the pack downloading or unpacking;
 *                     step: "" | "downloading" | "checking" | "unpacking" | "failed" | "bad"
 *   download({ id })  starts one (Android's own downloader, with its notification)
 *   cancel()          stops the download
 *   use({ id })       the pack the engine speaks with
 *   remove({ id })    deletes a pack; the engine leaves the phone's list with the last
 *
 * The app asks for status about once a second while something is under
 * way; a finished download is checked and unpacked on the first ask.
 */
@CapacitorPlugin(name = "Kokoro")
public class KokoroPlugin extends Plugin {
    private static Thread unpacking;
    private static String failed = "";
    private static String failedPack = "";

    // Installing a build without the engine (main, before Kokoro) and
    // coming back resets it to off in the manifest, though the voices are
    // still here: put it back on the phone's list at each start.
    @Override
    public void load() {
        final Context c = getContext().getApplicationContext();
        new Thread(() -> {
            try { if (Kokoro.supported()) Kokoro.listEngine(c); } catch (Throwable e) { /* tried at the next start */ }
        }, "kokoro-list").start();
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        JSObject o = new JSObject();
        boolean supported = Kokoro.supported();
        o.put("supported", supported);
        o.put("engine", c.getPackageName());
        if (!supported) { call.resolve(o); return; }
        String step;
        Kokoro.Pack busy;
        synchronized (KokoroPlugin.class) {
            busy = Kokoro.downloading(c);
            if (unpacking != null && unpacking.isAlive()) step = Kokoro.step;
            else {
                String at = Kokoro.poll(c);
                if (at.equals("downloaded")) { unpackLater(c); step = "checking"; }
                else if (at.equals("failed")) { failed = "failed"; failedPack = busy == null ? "" : busy.id; step = "failed"; }
                else if (at.isEmpty()) { step = failed; failed = ""; }
                else step = at;
            }
        }
        Kokoro.Pack use = Kokoro.inUse(c);
        o.put("use", use == null ? "" : use.id);
        o.put("busy", busy != null ? busy.id : step.equals("failed") || step.equals("bad") ? failedPack : "");
        o.put("step", step);
        o.put("done", Kokoro.done);
        o.put("total", Kokoro.total);
        JSArray packs = new JSArray();
        for (Kokoro.Pack p : Kokoro.PACKS) {
            JSObject j = new JSObject();
            boolean ready = Kokoro.ready(c, p);
            j.put("id", p.id);
            j.put("title", p.title);
            j.put("note", p.note);
            j.put("bytes", p.bytes);
            j.put("ready", ready);
            j.put("size", ready ? Kokoro.size(c, p) : 0);
            j.put("voices", p.voices.length);
            packs.put(j);
        }
        o.put("packs", packs);
        call.resolve(o);
    }

    private static void unpackLater(Context c) {
        final Context app = c.getApplicationContext();
        Kokoro.Pack p = Kokoro.downloading(app);
        failedPack = p == null ? "" : p.id;
        Kokoro.step = "checking";
        unpacking = new Thread(() -> {
            try {
                if (!Kokoro.unpack(app)) failed = "bad";
            } catch (Throwable e) {
                failed = "failed";
                Kokoro.cancel(app);
            }
            Kokoro.step = "";
        }, "kokoro-unpack");
        unpacking.start();
    }

    private Kokoro.Pack packOf(PluginCall call) {
        Kokoro.Pack p = Kokoro.pack(call.getString("id", ""));
        if (p == null) call.reject("No such voices.");
        return p;
    }

    @PluginMethod
    public void download(PluginCall call) {
        if (!Kokoro.supported()) { call.reject("This phone can't run Kokoro."); return; }
        Kokoro.Pack p = packOf(call);
        if (p == null) return;
        synchronized (KokoroPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) { call.reject("Still unpacking the last one."); return; }
        }
        failed = "";
        try {
            Kokoro.start(getContext(), p);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start the download.");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        synchronized (KokoroPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) { call.reject("Still unpacking."); return; }
        }
        Kokoro.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void use(PluginCall call) {
        Kokoro.Pack p = packOf(call);
        if (p == null) return;
        if (!Kokoro.ready(getContext(), p)) { call.reject("Download it first."); return; }
        Kokoro.use(getContext(), p);
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        Kokoro.Pack p = packOf(call);
        if (p == null) return;
        synchronized (KokoroPlugin.class) {
            if (unpacking != null && unpacking.isAlive()) { call.reject("Still unpacking."); return; }
        }
        Kokoro.remove(getContext(), p);
        call.resolve();
    }
}
