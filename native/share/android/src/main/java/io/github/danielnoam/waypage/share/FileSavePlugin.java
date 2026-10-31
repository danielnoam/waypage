package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * An exported file (a page as HTML, Markdown or EPUB, src/app.js 0.25.2)
 * saved where the person picks, through the system's "save to" screen:
 *
 *   save({ uri, name, mime })   resolves to { saved } (false if put away)
 *
 * `uri` is a file the app already wrote to its cache. With `keep: true`
 * (1.47.0, a deck turned into a PDF) the place chosen is also held on to
 * for reading, and comes back as `uri`; `near` is a content:// file whose
 * folder the screen opens in.
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        if (call.getString("uri") == null) {
            call.reject("No file to save");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "Page"));
        String near = call.getString("near", "");
        if (!near.isEmpty() && Build.VERSION.SDK_INT >= 26) {
            try { intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(near)); } catch (Exception e) { /* opens where it last was */ }
        }
        if (Boolean.TRUE.equals(call.getBoolean("keep", false))) {
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        }
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject out = new JSObject();
            out.put("saved", false);
            call.resolve(out);
            return;
        }
        Uri target = data.getData();
        File source = new File(Uri.parse(call.getString("uri")).getPath());
        new Thread(() -> {
            try (InputStream in = new FileInputStream(source);
                 OutputStream out = getContext().getContentResolver().openOutputStream(target)) {
                if (out == null) throw new java.io.IOException("No place to write");
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                JSObject res = new JSObject();
                res.put("saved", true);
                if (Boolean.TRUE.equals(call.getBoolean("keep", false))) {
                    try {
                        getContext().getContentResolver().takePersistableUriPermission(target, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        res.put("uri", target.toString());
                    } catch (Exception e) { /* saved, but only this once */ }
                }
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Couldn't save the file", e);
            }
        }).start();
    }
}
