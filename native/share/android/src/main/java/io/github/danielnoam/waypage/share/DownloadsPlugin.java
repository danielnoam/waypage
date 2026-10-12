package io.github.danielnoam.waypage.share;

import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads (src/app.js, 0.27.9): keeps the app running while pages are
 * saved, through DownloadService.
 *
 *   update({ title, text, done, total })   starts or updates it
 *   stop()                                 once nothing is left
 *   fetch({ url, path })                   a file into the cache, resumable (1.23.0)
 *   pauseFetch()                           stops it where it is
 *
 * and a "stop" event when the notification's Stop is tapped, and
 * "fetched" { path, bytes, total } as a fetch comes in.
 */
@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    private boolean asked;

    @Override
    public void load() {
        DownloadService.onStop = () -> notifyListeners("stop", new JSObject());
    }

    @PluginMethod
    public void update(PluginCall call) {
        askToNotify();
        DownloadService.show(getContext(), call.getString("title", "Saving"), call.getString("text", ""),
            call.getInt("done", 0), call.getInt("total", 0));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        DownloadService.end();
        call.resolve();
    }

    // The app's update (1.23.0): downloaded here, not by the WebView, so a
    // pause keeps what came (path.part) and the next fetch asks only for
    // the rest. Resolves to { uri }; rejects with code PAUSED when paused.
    private volatile boolean fetchStop;
    private volatile Thread fetching;

    @PluginMethod
    public void fetch(PluginCall call) {
        String url = call.getString("url"), name = call.getString("path");
        if (url == null || name == null || name.contains("/")) {
            call.reject("No file to fetch");
            return;
        }
        if (fetching != null) {
            call.reject("Already fetching");
            return;
        }
        fetchStop = false;
        fetching = new Thread(() -> {
            try {
                File done = new File(getContext().getCacheDir(), name);
                if (!done.exists() || done.length() == 0) fetchInto(url, name, done, true);
                JSObject o = new JSObject();
                o.put("uri", Uri.fromFile(done).toString());
                call.resolve(o);
            } catch (Paused e) {
                call.reject("Paused", "PAUSED");
            } catch (Exception e) {
                call.reject("The download didn't finish", e);
            } finally {
                fetching = null;
            }
        });
        fetching.start();
    }

    @PluginMethod
    public void pauseFetch(PluginCall call) {
        fetchStop = true;
        call.resolve();
    }

    private static class Paused extends Exception {}

    private void fetchInto(String url, String name, File done, boolean again) throws Exception {
        File part = new File(done.getPath() + ".part");
        long have = part.exists() ? part.length() : 0;
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        if (have > 0) c.setRequestProperty("Range", "bytes=" + have + "-");
        try {
            int code = c.getResponseCode();
            if (code == 416 && have > 0 && again) {
                part.delete();
                fetchInto(url, name, done, false);
                return;
            }
            if (code != 200 && code != 206) throw new IOException("HTTP " + code);
            // A server that sends the whole file starts it over; another
            // part than the one asked for, and it's asked for whole.
            if (code == 206) {
                String range = c.getHeaderField("Content-Range");
                if (range == null || !range.startsWith("bytes " + have + "-")) {
                    c.disconnect();
                    part.delete();
                    if (!again) throw new IOException("The server sent the wrong part");
                    fetchInto(url, name, done, false);
                    return;
                }
            } else have = 0;
            long length = c.getContentLengthLong();
            long total = length < 0 ? -1 : have + length;
            try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(part, have > 0)) {
                byte[] buf = new byte[64 * 1024];
                long got = have, told = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    got += n;
                    if (got - told >= 128 * 1024) {
                        told = got;
                        fetched(name, got, total);
                    }
                    if (fetchStop) {
                        fetched(name, got, total);
                        throw new Paused();
                    }
                }
                fetched(name, got, total);
            }
        } finally {
            c.disconnect();
        }
        if (!part.renameTo(done)) throw new IOException("Couldn't keep the file");
    }

    private void fetched(String name, long bytes, long total) {
        JSObject o = new JSObject();
        o.put("path", name);
        o.put("bytes", bytes);
        o.put("total", total);
        notifyListeners("fetched", o);
    }

    // Android 13 hides the progress notification until it's allowed; asked
    // once a run of the app, at the first download.
    private void askToNotify() {
        if (asked || Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        asked = true;
        String p = "android.permission.POST_NOTIFICATIONS";
        if (getContext().checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) getActivity().requestPermissions(new String[] { p }, 2709);
    }
}
